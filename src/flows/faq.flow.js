import { addKeyword, EVENTS } from '@builderbot/bot';
import { BOT_MESSAGES, BOT_SETTINGS } from '../botConfig.js';
import { getUser } from '../firebase.js';
import {
    globalFilesCache,
    isAdmin,
    sanitizeFilePath,
    getFileReference,
    downloadAndSaveIncomingFile,
    deliverFilePackageToAdmin,
    extractCloudLinks
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

        const rawBody = (ctx.body || '').trim();
        const texto = rawBody.toLowerCase();
        
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

        // Detectar links en el cuerpo del mensaje y en la leyenda (caption)
        const linksEncontrados = [
            ...extractCloudLinks(rawBody),
            ...extractCloudLinks(ctx.caption || ''),
            ...extractCloudLinks(ctx.message?.imageMessage?.caption || ''),
            ...extractCloudLinks(ctx.message?.documentMessage?.caption || '')
        ];
        const uniqueLinks = [...new Set(linksEncontrados)];

        if (esMedia || uniqueLinks.length > 0) {
            if (!globalFilesCache.has(ctx.from + '_directo')) globalFilesCache.set(ctx.from + '_directo', []);
            const userFiles = globalFilesCache.get(ctx.from + '_directo');

            // 1. Procesar enlaces de nube (Google Drive, OneDrive, SharePoint, etc.)
            if (uniqueLinks.length > 0) {
                for (const url of uniqueLinks) {
                    // Extraer posible nota o comentario del usuario
                    let comment = rawBody.replace(url, '').trim();
                    userFiles.push({
                        filePath: `LINK:${url}`,
                        originalName: url,
                        isLink: true,
                        comment: comment || null
                    });
                }
            }

            // 2. Si vino archivo adjunto (documento, foto, etc.), descargarlo
            if (esMedia) {
                try {
                    const fileInfo = await downloadAndSaveIncomingFile(ctx, provider, './downloads');
                    userFiles.push(fileInfo);

                    await new Promise(r => setTimeout(r, 1000));
                    const nombreMostrar = fileInfo.originalName || 'Archivo';
                    const cadTag = fileInfo.isCad ? ' 📐 *(AutoCAD CAD detectado)*' : '';
                    await provider.sendMessage(ctx.from, `✅ Archivo recibido: *${nombreMostrar}*${cadTag} (${userFiles.length} en total).\n\nPuedes enviar más archivos o enlaces si lo deseas, o elige una opción:\n\n*1.* ✅ Ya envié todos (Enviar al administrador)\n*0.* ⬅️ Cancelar y volver al menú principal`, {});
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
                    await provider.sendMessage(ctx.from, `✅ Archivo recibido en modo seguro (${userFiles.length} en total). Puedes enviar más archivos o enlaces si lo deseas, o elige una opción:\n\n*1.* ✅ Ya envié todos (Enviar al administrador)\n*0.* ⬅️ Cancelar y volver al menú principal`, {});
                }
            } else if (uniqueLinks.length > 0) {
                await new Promise(r => setTimeout(r, 1000));
                const linksList = uniqueLinks.map(l => `  🔗 ${l}`).join('\n');
                await provider.sendMessage(ctx.from, `✅ *Enlace(s) recibido(s)* (${userFiles.length} en total):\n${linksList}\n\nPuedes enviar más archivos o enlaces si lo deseas, o elige una opción:\n\n*1.* ✅ Ya envié todos (Enviar al administrador)\n*0.* ⬅️ Cancelar y volver al menú principal`, {});
            }
            
            return gotoFlow(flowEnvioDirectoArchivosLoop);
        }

        if (texto === '1') {
            const userFiles = globalFilesCache.get(ctx.from + '_directo') || [];
            if (userFiles.length === 0) {
                await flowDynamic('⚠️ No has enviado archivos ni enlaces. Adjúntalos o escribe 0 para cancelar.');
                return gotoFlow(flowEnvioDirectoArchivosLoop);
            }
            
            await flowDynamic('⌛ Enviando tus archivos y enlaces al administrador, por favor espera un momento...');
            
            const phoneId = ctx.from.split('@')[0];
            const userDb = await getUser(phoneId);
            const name = state.getMyState()?.userName || userDb?.name || 'Cliente';
            const contact = userDb?.contactUser || phoneId;
            
            const adminPhonesConfig = BOT_SETTINGS.adminOrdersPhone || '573135363218@c.us';

            // Entrega multietapa a todos los administradores (envío directo + enlaces + .ZIP consolidado + fallback)
            await deliverFilePackageToAdmin(provider, userFiles, {
                name,
                contact,
                title: 'PAQUETE DE ARCHIVOS Y ENLACES DIRECTOS RECIBIDO'
            }, adminPhonesConfig);
            
            globalFilesCache.delete(ctx.from + '_directo');
            
            await new Promise(r => setTimeout(r, 1000));
            await flowDynamic('✅ ¡Paquete enviado exitosamente al administrador!\n¿Deseas algo más? (Escribe "hola" para volver al menú principal)');
            return;
        }

        const userFilesFallback = globalFilesCache.get(ctx.from + '_directo') || [];
        await new Promise(r => setTimeout(r, 1500));
        if (userFilesFallback.length > 0) {
            await flowDynamic('Por favor adjunta los archivos o enlaces que deseas enviar.\n\n*1.* ✅ Ya envié todos (Enviar al administrador)\n*0.* ⬅️ Cancelar y volver al menú principal');
        } else {
            await flowDynamic('Por favor adjunta tus archivos (DWG, PDF, Office, imágenes, etc.) o enlaces de Google Drive / OneDrive.\n\n*0.* ⬅️ Cancelar y volver al menú principal');
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
            const fileNames = cached.map((f, i) => {
                const isL = (typeof f === 'object' && f.isLink) || (typeof f === 'string' && f.startsWith('LINK:'));
                const name = typeof f === 'object' ? f.originalName : (f.startsWith('LINK:') ? f.substring(5) : f);
                return isL ? `  *${i + 1}.* 🔗 ${name}` : `  *${i + 1}.* 📄 ${name}`;
            }).join('\n');
            await flowDynamic([
                '📂 *Envío Directo de Archivos y Enlaces*',
                `✅ Ya tenemos registrado(s) *${cached.length}* elemento(s) que enviaste previamente:\n${fileNames}`,
                '',
                'Puedes enviar más archivos o enlaces si lo deseas, o elige una opción:',
                '',
                '*1.* ✅ Ya envié todos (Enviar al administrador)',
                '*0.* 🛑 Cancelar y volver al menú principal'
            ].join('\n'));
        } else {
            await flowDynamic([
                '📂 *Envío Directo de Archivos y Enlaces*',
                '',
                'Por favor, envía por aquí tus archivos o enlaces que desees compartir con el administrador.',
                '',
                'Aceptamos una amplia variedad de formatos:',
                '📐 *Planos y CAD:* AutoCAD (.dwg, .dxf)',
                '🎨 *Diseño y Gráficos:* Illustrator (.ai), CorelDraw (.cdr), Photoshop (.psd)',
                '📄 *Documentos:* PDF, Word (.docx, .doc), Excel (.xlsx, .xls), PowerPoint (.pptx, .ppt)',
                '🖼️ *Imágenes y Fotos:* JPG, PNG, WEBP',
                '📦 *Comprimidos:* ZIP, RAR',
                '🔗 *Enlaces en la nube:* Google Drive, OneDrive, SharePoint, etc.',
                '',
                '_Puedes enviar varios archivos o enlaces seguidos._',
                '',
                '🛑 *0.* Cancelar y volver al menú principal'
            ].join('\n'));
        }
        return gotoFlow(flowEnvioDirectoArchivosLoop);
    });

