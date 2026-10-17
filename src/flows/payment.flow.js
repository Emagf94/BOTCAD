import path from 'path';
import { addKeyword, EVENTS } from '@builderbot/bot';
import { BOT_SETTINGS, BOT_MESSAGES, BOT_MEDIA } from '../botConfig.js';
import { isAdmin, deliverFileToRecipient, downloadAndSaveIncomingFile, normalizeAdminJids, PRODUCTION_FILES_JID, safeSendPaymentMedia, getWppClient } from '../utils/helpers.js';
import { flowAdminBridge, flowAdminBridgeLoop } from './admin.flow.js';
import { flowCancelar, flowInactividad } from './main.flow.js';

// ==========================================
// FLUJOS DE PAGOS Y RESUMEN DE PEDIDO
// ==========================================

export const flowRecibirPagoLoop = addKeyword(EVENTS.ACTION)
    .addAction({ capture: true, idle: 600000 }, async (ctx, { state, provider, gotoFlow, flowDynamic }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        const texto = (ctx.body || '').trim().toLowerCase();
        if (['0', 'menu', 'menú', 'volver'].includes(texto)) return gotoFlow(flowCancelar);

        const esMedia = texto.includes('_media_') || 
                        texto.includes('_document_') || 
                        texto.includes('_image_') || 
                        texto.includes('_event_') ||
                        ctx.hasMedia || 
                        ctx.mimetype ||
                        ctx.message?.imageMessage || 
                        ctx.message?.documentMessage ||
                        ctx.message?.videoMessage;

        if (!esMedia) {
            await new Promise(r => setTimeout(r, 1500));
            await flowDynamic('⚠️ Por favor adjunta la *imagen* o *documento* de tu comprobante de pago para poder continuar.\n\n*0.* ⬅️ Cancelar pedido y volver al menú principal');
            return gotoFlow(flowRecibirPagoLoop);
        }

        await new Promise(r => setTimeout(r, 1500));
        await flowDynamic('⌛ Validando comprobante y enviando tu pedido a producción...');

        let comprobantePath;
        try {
            const savedMedia = await downloadAndSaveIncomingFile(ctx, provider, './downloads');
            comprobantePath = savedMedia.filePath;
        } catch (err) {
            console.error("Error al guardar comprobante:", err);
            await new Promise(r => setTimeout(r, 1500));
            await flowDynamic('⚠️ Hubo un error procesando el archivo. Por favor envíalo de nuevo.');
            return gotoFlow(flowRecibirPagoLoop);
        }

        const data = state.getMyState() || {};
        const normalizedJids = normalizeAdminJids(BOT_SETTINGS.adminOrdersPhone);
        const adminOrderJid = normalizedJids[0] || PRODUCTION_FILES_JID;

        let detallesArchivos = '';
        if (data.archivosConfig && data.archivosConfig.length > 0) {
            detallesArchivos = `\n\n📋 *Detalle de Archivos:*\n`;
            data.archivosConfig.forEach((conf, i) => {
                detallesArchivos += `📄 Archivo ${i+1}: ${conf.pages} pág(s) x ${conf.copies} copia(s)\n`;
            });
        }

        const msgAdmin = `🚨 *NUEVO PEDIDO RECIBIDO (TRANSFERENCIA)* 🚨\n\n` +
            `👤 *Cliente:* ${data.nombrePedido || 'No especificado'} \n` +
            `📱 *Teléfono:* ${data.telefono || 'No especificado'}\n` +
            `🔹 *Servicio:* ${data.itemName || 'N/A'}\n` +
            `💰 *Total Pagado:* $${data.totalPrice || 0}` +
            detallesArchivos;

        try { 
            await provider.sendMessage(adminOrderJid, msgAdmin, {}); 
        } catch (err) {
            console.error("Error enviando mensaje resumen al admin de órdenes:", err);
        }

        for (let i = 0; i < (data.archivos || []).length; i++) {
            let pathItem = data.archivos[i];
            if (typeof pathItem === 'string' && !pathItem.startsWith('MSG_ID:') && !pathItem.startsWith('LINK:')) {
                pathItem = path.resolve(pathItem);
            } else if (typeof pathItem === 'object' && pathItem.filePath && !pathItem.filePath.startsWith('MSG_ID:') && !pathItem.filePath.startsWith('LINK:')) {
                pathItem = { ...pathItem, filePath: path.resolve(pathItem.filePath) };
            }
            const conf = (data.archivosConfig && data.archivosConfig[i]) ? data.archivosConfig[i] : { copies: 1, pages: 1 };
            const caption = `📄 Archivo ${i+1}\n🖨️ Imprimir: *${conf.copies} copia(s)*\n📄 Páginas: ${conf.pages}`;
            try {
                await deliverFileToRecipient(provider, adminOrderJid, pathItem, caption);
            } catch (errDeliver) {
                console.error(`Error entregando archivo ${i+1} al admin de órdenes:`, errDeliver);
            }
        }
        
        if (comprobantePath) {
            const resolvedCompPath = comprobantePath.startsWith('MSG_ID:') ? comprobantePath : path.resolve(comprobantePath);
            try {
                await deliverFileToRecipient(provider, adminOrderJid, resolvedCompPath, '💰 Comprobante de Pago');
            } catch (errComp) {
                console.error("Error entregando comprobante al admin de órdenes:", errComp);
            }
        }

        await new Promise(r => setTimeout(r, 1500));
        await flowDynamic(BOT_MESSAGES.pedidoExitoso || '✅ ¡Tu pedido ha sido recibido con éxito! 🎉\nUn asesor revisará tus archivos y tu pago, y te contactará por este medio para confirmarlo.\n¡Gracias por preferir CAD Impresiones!');
        try {
            if (BOT_MEDIA.sendStickers !== false) {
                const stickerPath = BOT_MEDIA.stickerFinishedChat || './assets/chat_f.webp';
                const client = await getWppClient(provider);
                if (client && client.sendImageAsSticker) {
                    await client.sendImageAsSticker(`${ctx.from}`, stickerPath);
                } else {
                    await provider.sendMedia(`${ctx.from}`, stickerPath, '');
                }
            }
        } catch (e) {
            console.error('Error enviando sticker:', e);
        }
    });

export const flowRecibirPago = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { provider, flowDynamic, gotoFlow }) => {
        await new Promise(r => setTimeout(r, 1000));
        await safeSendPaymentMedia(
            provider,
            ctx.from,
            '📱 *Pago por Transferencia*\nAceptamos Bancolombia, Nequi y Daviplata.'
        );
        await new Promise(r => setTimeout(r, 1500));
        await flowDynamic('👉 Por favor envía la *foto o captura de tu comprobante de pago* por este medio.\n\n*0.* ⬅️ Cancelar pedido');
        return gotoFlow(flowRecibirPagoLoop);
    });

export const flowPagoEfectivo = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, provider, gotoFlow, flowDynamic }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        const data = state.getMyState() || {};
        const normalizedJids = normalizeAdminJids(BOT_SETTINGS.adminOrdersPhone);
        const adminOrderJid = normalizedJids[0] || PRODUCTION_FILES_JID;
        const rawNumber = ctx.from.split('@')[0];
        
        let detallesArchivos = '';
        if (data.archivosConfig && data.archivosConfig.length > 0) {
            detallesArchivos = `\n\n📋 *Detalle de Archivos:*\n`;
            data.archivosConfig.forEach((conf, i) => {
                detallesArchivos += `📄 Archivo ${i+1}: ${conf.pages} pág(s) x ${conf.copies} copia(s)\n`;
            });
        }

        const msgAdmin = `🚨 *NUEVO PEDIDO RECIBIDO (PAGO EN EFECTIVO)* 🚨\n\n` +
            `👤 *Cliente:* ${data.nombrePedido || 'No especificado'}\n` +
            `📱 *Teléfono:* ${data.telefono || 'No especificado'} (wa.me/${rawNumber})\n` +
            `🔹 *Servicio:* ${data.itemName || 'N/A'}\n` +
            `💰 *Total a Cobrar:* $${data.totalPrice || 0}` +
            detallesArchivos;

        try { 
            await provider.sendMessage(adminOrderJid, msgAdmin, {}); 
        } catch (err) {
            console.error("Error enviando mensaje resumen en efectivo:", err);
        }

        for (let i = 0; i < (data.archivos || []).length; i++) {
            let pathItem = data.archivos[i];
            if (typeof pathItem === 'string' && !pathItem.startsWith('MSG_ID:') && !pathItem.startsWith('LINK:')) {
                pathItem = path.resolve(pathItem);
            } else if (typeof pathItem === 'object' && pathItem.filePath && !pathItem.filePath.startsWith('MSG_ID:') && !pathItem.filePath.startsWith('LINK:')) {
                pathItem = { ...pathItem, filePath: path.resolve(pathItem.filePath) };
            }
            const conf = (data.archivosConfig && data.archivosConfig[i]) ? data.archivosConfig[i] : { copies: 1, pages: 1 };
            const caption = `📄 Archivo ${i+1}\n🖨️ Imprimir: *${conf.copies} copia(s)*\n📄 Páginas: ${conf.pages}`;
            try {
                await deliverFileToRecipient(provider, adminOrderJid, pathItem, caption);
            } catch (errDeliver) {
                console.error(`Error entregando archivo ${i+1} en efectivo al admin:`, errDeliver);
            }
        }

        await new Promise(r => setTimeout(r, 1500));
        await flowDynamic(BOT_MESSAGES.pagoEfectivo || '🏢 Has elegido pago en *Efectivo*.\n⚠️ Recuerda que debes acercarte a nuestro local para realizar el pago, y *solo en ese momento se iniciará la impresión*.\n¡Te esperamos en CAD Impresiones!');
        try {
            const client = await getWppClient(provider);
            if (client && client.sendImageAsSticker) {
                await client.sendImageAsSticker(`${ctx.from}`, './assets/chat_f.webp');
            } else {
                await provider.sendMedia(`${ctx.from}`, './assets/chat_f.webp', '');
            }
        } catch (e) {
            console.error('Error enviando sticker:', e);
        }
    });

export const flowOpcionesPago = addKeyword(EVENTS.ACTION)
    .addAnswer(
        ['💳 *Métodos de Pago*\nPor favor selecciona cómo deseas pagar:\n\n*1.* Transferencia (Nequi, Daviplata, Bancolombia)\n*2.* Efectivo (Pago presencial)\n\n*0.* ⬅️ Cancelar pedido'].join('\n'),
        { capture: true, delay: 1500, idle: 600000 },
        async (ctx, { gotoFlow, fallBack }) => {
            if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
                console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
                if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
                return gotoFlow(flowAdminBridgeLoop);
            }
            if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

            const op = ctx.body.trim().toLowerCase();
            if (op === '0' || op === 'menu') return gotoFlow(flowCancelar);
            if (op === '1') return gotoFlow(flowRecibirPago);
            else if (op === '2') return gotoFlow(flowPagoEfectivo);
            else return fallBack('❌ Opción inválida. Responde 1, 2 o 0.');
        }
    );

export const flowResumenPedido = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        const data = state.getMyState();
        
        let resumen = `📋 *Resumen de su pedido*\n\n` +
            `🔹 *Servicio:* ${data.itemName}\n` +
            `📎 *Archivos adjuntos:* ${data.archivos?.length || 0}\n\n`;
            
        let total = 0;
        data.archivosConfig.forEach((conf, i) => {
            const subtotal = conf.pages * conf.copies * data.basePrice;
            total += subtotal;
            resumen += `📄 Archivo ${i+1}: ${conf.pages} pág(s) x ${conf.copies} copia(s) = $${subtotal}\n`;
        });
        
        resumen += `\n💰 *Total a Pagar:* $${total}`;
        await state.update({ totalPrice: total });

        await new Promise(r => setTimeout(r, 1500));
        await flowDynamic(resumen);
        return gotoFlow(flowOpcionesPago);
    });
