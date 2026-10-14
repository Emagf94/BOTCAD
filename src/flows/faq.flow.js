import { addKeyword, EVENTS } from '@builderbot/bot';
import { BOT_MESSAGES, BOT_SETTINGS } from '../botConfig.js';
import { getUser } from '../firebase.js';
import {
    globalFilesCache,
    isAdmin,
    sanitizeFilePath,
    getFileReference,
    downloadAndSaveIncomingFile,
    deliverFilePackageToAdmin
} from '../utils/helpers.js';
import { flowAdminBridge, flowAdminBridgeLoop } from './admin.flow.js';
import { flowCancelar, flowInactividad } from './main.flow.js';

// ==========================================
// FLUJOS FAQ (PREGUNTAS FRECUENTES)
// ==========================================

export const flowUbicacion = addKeyword(['ubicacion', 'donde estan', 'direccion', 'dirección', 'dónde están'])
    .addAction(async (ctx, { flowDynamic }) => {
        await new Promise(r => setTimeout(r, 1500));
        await flowDynamic(BOT_MESSAGES.ubicacion || '📍 *Ubicación*\n\nEstamos ubicados en Quibdó.');
    });

export const flowHorarios = addKeyword(['horario', 'abren', 'cierran', 'hora'])
    .addAction(async (ctx, { flowDynamic }) => {
        await new Promise(r => setTimeout(r, 1500));
        await flowDynamic(BOT_MESSAGES.horarios || '🕒 *Horarios*\n\nLunes a viernes de 8:30am a 12:30pm y de 2:00pm a 6:00pm.');
    });

export const flowPagosFAQ = addKeyword(EVENTS.ACTION)
    .addAnswer('💳 *Métodos de Pago*\nAceptamos Transferencias y Efectivo.\n\n⚠️ No aceptamos pagos con tarjeta de débito ni crédito, gracias.\n\nEscribe *0* para volver al menú principal.', { media: './assets/qr_pagos.png', capture: true, delay: 1500, idle: 600000 }, async (ctx, { gotoFlow, fallBack }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        if (ctx.body.trim() === '0') return gotoFlow(flowCancelar);
        return fallBack('❌ Opción inválida. Escribe *0* para volver al menú principal.');
    });

export const flowFAQ = addKeyword(EVENTS.ACTION)
    .addAnswer([
        '❓ *Preguntas Frecuentes*', 
        '',
        '*1.* 🕒 *Horarios:* Lunes a viernes de 8:30am a 12:30pm y de 2:00pm a 6:00pm.', 
        '*2.* 🧾 *Facturación:* Sí realizamos facturación electrónica.', 
        '*3.* 🚚 *Domicilios:* No realizamos domicilios.',
        '*4.* ⏱️ *Tiempos de entrega:* De acuerdo al flujo de trabajo.',
        '', 
        '*0.* ⬅️ Volver al menú principal'
    ].join('\n'), { capture: true, delay: 1500, idle: 600000 }, async (ctx, { gotoFlow, fallBack }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        if (ctx.body.trim() === '0') return gotoFlow(flowCancelar);
        return fallBack('❌ Opción inválida. Escribe *0* para volver al menú principal.');
    });

export const flowEnvioDirectoArchivosLoop = addKeyword(EVENTS.ACTION)
    .addAction({ capture: true, idle: 600000 }, async (ctx, { state, gotoFlow, flowDynamic, provider }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        const texto = (ctx.body || '').trim().toLowerCase();
        
        if (['0', 'menu', 'menú', 'volver'].includes(texto)) {
            return gotoFlow(flowCancelar);
        }

        const esMedia = texto.includes('_media_') || 
                        texto.includes('_document_') || 
                        texto.includes('_image_') || 
                        ctx.hasMedia || 
                        ctx.mimetype ||
                        ctx.message?.imageMessage || 
                        ctx.message?.documentMessage;

        const esLinkValido = ctx.body && (
            texto.includes('drive.google.com') || 
            texto.includes('docs.google.com') || 
            texto.includes('1drv.ms') || 
            texto.includes('onedrive.live.com') || 
            texto.includes('sharepoint.com')
        );

        if (esMedia || esLinkValido) {
            if (!globalFilesCache.has(ctx.from + '_directo')) globalFilesCache.set(ctx.from + '_directo', []);
            const userFiles = globalFilesCache.get(ctx.from + '_directo');

            if (esLinkValido && !esMedia) {
                userFiles.push({
                    filePath: `LINK:${ctx.body.trim()}`,
                    originalName: ctx.body.trim(),
                    isLink: true
                });
                
                await new Promise(r => setTimeout(r, 1000));
                await provider.sendMessage(ctx.from, `✅ Enlace validado y recibido (${userFiles.length} en total). Puedes enviar más, o elige una opción:\n\n*1.* ✅ Ya envié todos (Enviar al administrador)\n*0.* ⬅️ Cancelar y volver al menú principal`, {});
                return gotoFlow(flowEnvioDirectoArchivosLoop);
            }

            try {
                // Descarga segura del archivo con detección de nombre real, extensión y magic bytes
                const fileInfo = await downloadAndSaveIncomingFile(ctx, provider, './downloads');
                userFiles.push(fileInfo);

                await new Promise(r => setTimeout(r, 1000));
                const nombreMostrar = fileInfo.originalName || 'Archivo';
                const cadTag = fileInfo.isCad ? ' 📐 *(AutoCAD CAD detectado)*' : '';
                await provider.sendMessage(ctx.from, `✅ Archivo recibido: *${nombreMostrar}*${cadTag} (${userFiles.length} en total).\n\nPuedes enviar más archivos si lo deseas, o elige una opción:\n\n*1.* ✅ Ya envié todos (Enviar al administrador)\n*0.* ⬅️ Cancelar y volver al menú principal`, {});
            } catch (err) {
                console.error("Excepción descargando archivo en Opción 7:", err);
                const fallbackRef = getFileReference(ctx, null);
                userFiles.push({
                    filePath: fallbackRef,
                    originalName: ctx.filename || 'archivo_adjunto',
                    ext: 'bin',
                    isCad: false
                });

                await new Promise(r => setTimeout(r, 1000));
                await provider.sendMessage(ctx.from, `✅ Archivo recibido en modo seguro (${userFiles.length} en total). Puedes enviar más archivos si lo deseas, o elige una opción:\n\n*1.* ✅ Ya envié todos (Enviar al administrador)\n*0.* ⬅️ Cancelar y volver al menú principal`, {});
            }
            
            return gotoFlow(flowEnvioDirectoArchivosLoop);
        }

        if (texto === '1') {
            const userFiles = globalFilesCache.get(ctx.from + '_directo') || [];
            if (userFiles.length === 0) {
                await flowDynamic('⚠️ No has enviado archivos. Adjúntalos o envía 0 para cancelar.');
                return gotoFlow(flowEnvioDirectoArchivosLoop);
            }
            
            await flowDynamic('⌛ Enviando archivos al administrador, por favor espera un momento...');
            
            const phoneId = ctx.from.split('@')[0];
            const userDb = await getUser(phoneId);
            const name = state.getMyState()?.userName || userDb?.name || 'Cliente';
            const contact = userDb?.contactUser || phoneId;
            
            const adminPhonesConfig = BOT_SETTINGS.adminOrdersPhone || '573184849332@c.us, 573135363218@c.us';

            // Entrega multietapa a todos los administradores (envío directo + .ZIP + fallback)
            await deliverFilePackageToAdmin(provider, userFiles, {
                name,
                contact,
                title: 'PAQUETE DE ARCHIVOS DIRECTOS RECIBIDO'
            }, adminPhonesConfig);
            
            globalFilesCache.delete(ctx.from + '_directo');
            
            await new Promise(r => setTimeout(r, 1000));
            await flowDynamic('✅ ¡Paquete de archivos enviado exitosamente al administrador!\n¿Deseas algo más? (Escribe "hola" para volver a empezar)');
            return;
        }

        const userFilesFallback = globalFilesCache.get(ctx.from + '_directo') || [];
        await new Promise(r => setTimeout(r, 1500));
        if (userFilesFallback.length > 0) {
            await flowDynamic('Por favor adjunta los archivos que deseas enviar.\n\n*1.* ✅ Ya envié todos (Enviar al administrador)\n*0.* ⬅️ Cancelar y volver al menú principal');
        } else {
            await flowDynamic('Por favor adjunta los archivos que deseas enviar.\n\n*0.* ⬅️ Cancelar y volver al menú principal');
        }
        return gotoFlow(flowEnvioDirectoArchivosLoop);
    });

export const flowEnvioDirectoArchivos = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, gotoFlow }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        const cached = globalFilesCache.get(ctx.from + '_directo') || [];
        if (cached.length > 0) {
            const fileNames = cached.map((f, i) => `  *${i + 1}.* ${typeof f === 'object' ? f.originalName : (f.startsWith('LINK:') ? f.substring(5) : f)}`).join('\n');
            await flowDynamic([
                '📂 *Envío Directo de Archivos*',
                `✅ Ya tenemos registrado(s) *${cached.length}* archivo(s) que enviaste previamente:\n${fileNames}`,
                '',
                'Puedes enviar más archivos si lo deseas, o elige una opción:',
                '',
                '*1.* ✅ Ya envié todos (Enviar al administrador)',
                '*0.* 🛑 Cancelar y volver al menú principal'
            ].join('\n'));
        } else {
            await flowDynamic([
                '📂 *Envío Directo de Archivos*',
                'Por favor, envía por aquí tus archivos (*AutoCAD DWG/DXF*, PDF, imágenes, documentos) o *enlaces de Google Drive / OneDrive* que desees compartir con el administrador.',
                '',
                '🛑 *0.* Cancelar y volver al menú principal'
            ].join('\n'));
        }
        return gotoFlow(flowEnvioDirectoArchivosLoop);
    });
