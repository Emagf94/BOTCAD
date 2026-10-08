import { addKeyword, EVENTS } from '@builderbot/bot';
import { BOT_SETTINGS } from '../botConfig.js';
import { getUser } from '../firebase.js';
import { isWorkingHour, isAdmin, pendingSupportQueue, activeBridgeChats, sanitizeFilePath, getFileReference } from '../utils/helpers.js';
import { botInstance } from '../app.js';
import { flowCancelar, flowInactividad, flowMainMenu } from './main.flow.js';

// ==========================================
// FLUJOS DE ADMINISTRACIÓN Y ASESOR
// ==========================================

export const flowAdminBridgeLoop = addKeyword(EVENTS.ACTION)
    .addAction({ capture: true, idle: 3600000 }, async (ctx, { fallBack, endFlow, provider }) => {
        if (!isAdmin(ctx.from)) return;
        if (ctx?.idleFallBack) {
            const clientPhone = activeBridgeChats.get(ctx.from);
            if (clientPhone) {
                activeBridgeChats.delete(clientPhone);
                activeBridgeChats.delete(ctx.from);
                
                // No es necesario usar blacklist aquí, el control se maneja nativamente.

                await provider.sendMessage(clientPhone, '👨‍💻 *La sesión con el asesor ha finalizado.*', {});
            }
            return endFlow('⏳ Sesión de soporte terminada por inactividad.');
        }

        const clientPhone = activeBridgeChats.get(ctx.from);
        if (!clientPhone) return endFlow('❌ El chat ha expirado o el cliente se fue.');

        if (ctx.body.trim().toLowerCase() === '!fin') {
            activeBridgeChats.delete(clientPhone);
            activeBridgeChats.delete(ctx.from);
            
            // No es necesario usar blacklist aquí, el control se maneja nativamente.

            await provider.sendMessage(clientPhone, '👨‍💻 *El asesor ha finalizado el chat.* Volviendo al menú principal...', {});
            return endFlow('✅ Chat finalizado. Has salido del modo soporte.');
        }

        const esMedia = (ctx.body && (ctx.body.includes('_media_') || ctx.body.includes('_document_') || ctx.body.includes('_image_') || ctx.body.includes('_voice_note_') || ctx.body.includes('_video_') || ctx.body.includes('_event_forward_'))) || ctx.hasMedia || ctx.message?.imageMessage || ctx.message?.documentMessage || ctx.message?.videoMessage || ctx.message?.audioMessage || ctx.message?.forwardedMessage?.imageMessage || ctx.message?.forwardedMessage?.documentMessage || ctx.message?.forwardedMessage?.videoMessage || ctx.message?.forwardedMessage?.audioMessage;
        
        let caption = ctx.body || '';
        if (caption.includes('_event_') || caption.includes('_media_') || caption.includes('_document_') || caption.includes('_image_') || caption.includes('_voice_note_') || caption.includes('_video_') || caption.includes('_event_forward_') || caption.includes('reenviado')) {
            caption = '';
        }

        if (esMedia) {
            try {
                let path = await provider.saveFile(ctx);
                path = sanitizeFilePath(path, ctx);
                const fileRef = getFileReference(ctx, path);
                if (fileRef.startsWith('MSG_ID:')) {
                    const msgId = fileRef.split(':')[1];
                    const client = provider.getInstance ? provider.getInstance() : provider.vendor;
                    if (client.forwardMessage) {
                        await client.forwardMessage(clientPhone, msgId);
                    } else if (client.forwardMessagesV2) {
                        await client.forwardMessagesV2(clientPhone, [msgId]);
                    }
                    await provider.sendMessage(clientPhone, `👨‍💻 *Asesor:* [Archivo reenviado] ${caption}`, {});
                } else {
                    await provider.sendMedia(clientPhone, fileRef, `👨‍💻 *Asesor:* ${caption}`);
                }
            } catch (err) {
                console.error("Error bridge media admin:", err);
                await provider.sendMessage(clientPhone, `👨‍💻 *Asesor:* [Archivo/Audio enviado]`, {});
            }
        } else {
            await provider.sendMessage(clientPhone, `👨‍💻 *Asesor:* ${ctx.body}`, {});
        }
        return fallBack();
    });

export const flowAdminBridge = addKeyword(['!chatear', '!atender'])
    .addAction(async (ctx, { provider, gotoFlow }) => {
        console.log("=== [DEBUG ADMIN BRIDGE] ===");
        console.log("FROM:", ctx.from, "BODY:", ctx.body);
        console.log("QUEUE:", pendingSupportQueue);
        if (!isAdmin(ctx.from)) {
            console.log("ABORT: ctx.from does not include admin number");
            return;
        }
        
        let targetId;
        const txt = ctx.body.trim().toLowerCase();
        
        if (txt.startsWith('!atender')) {
            if (pendingSupportQueue.length === 0) {
                await provider.sendMessage(ctx.from, '⚠️ No hay clientes en espera de soporte.', {});
                return;
            }
            targetId = pendingSupportQueue.shift();
        } else {
            let targetPhone = ctx.body.split(' ')[1];
            if (!targetPhone) {
                await provider.sendMessage(ctx.from, '⚠️ Debes indicar el número: !chatear 573001234567', {});
                return;
            }
            
            // NORMALIZACIÓN: Eliminar todo lo que no sea número
            targetPhone = targetPhone.replace(/\D/g, '');
            // Si el admin escribió 10 dígitos (formato colombiano común), agregar el 57
            if (targetPhone.length === 10) {
                targetPhone = '57' + targetPhone;
            }
            
            // Allow matching manually typed number against pending queue just in case
            const queuedMatch = pendingSupportQueue.find(q => q.includes(targetPhone));
            if (queuedMatch) {
                targetId = queuedMatch;
                pendingSupportQueue.splice(pendingSupportQueue.indexOf(queuedMatch), 1);
            } else {
                targetId = `${targetPhone}@c.us`;
            }
        }
        
        activeBridgeChats.set(ctx.from, targetId);
        activeBridgeChats.set(targetId, ctx.from);

        // El bot se silenciará automáticamente al entrar al flujo captivo
        
        const rawTargetPhone = targetId.split('@')[0];
        const queueIndex = pendingSupportQueue.indexOf(rawTargetPhone);
        if (queueIndex > -1) pendingSupportQueue.splice(queueIndex, 1);
        
        try {
            await provider.sendMessage(targetId, '👨‍💻 *Un asesor se ha unido al chat. Puedes escribirle ahora.*', {});
        } catch (err) {
            await provider.sendMessage(ctx.from, `❌ Error: No se pudo conectar con el cliente ${rawTargetPhone}. Es posible que el número sea inválido.`, {});
            return;
        }

        // Forzar al cliente a entrar en el flujo de captura
        try {
            provider.emit('message', {
                from: targetId,
                body: 'iniciarchatadmin123xyz',
                name: 'System'
            });
        } catch (e) {
            console.error("Error emitiendo captura para cliente:", e);
        }
        
        await provider.sendMessage(ctx.from, '✅ Conectado al cliente. Todo lo que escribas se enviará. Escribe *!fin* para terminar.', {});
        return gotoFlow(flowAdminBridgeLoop);
    });

export const clientBridgeCapture = async (ctx, { fallBack, gotoFlow, provider }) => {
    if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
        console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
        if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
        return gotoFlow(flowAdminBridgeLoop);
    }
    if (ctx?.idleFallBack) {
        const adminPhone = activeBridgeChats.get(ctx.from);
        if (adminPhone) {
            activeBridgeChats.delete(adminPhone);
            activeBridgeChats.delete(ctx.from);
            await provider.sendMessage(adminPhone, `❌ La sesión con ${ctx.from} expiró por inactividad.`, {});
        }
        return gotoFlow(flowInactividad);
    }

    const txt = ctx.body.trim().toLowerCase();
    if (txt === '0' || txt === 'salir') {
        const adminPhone = activeBridgeChats.get(ctx.from);
        if (adminPhone) {
            activeBridgeChats.delete(adminPhone);
            activeBridgeChats.delete(ctx.from);
            await provider.sendMessage(adminPhone, `❌ El cliente ha finalizado el chat de soporte.`, {});
        }
        return gotoFlow(flowCancelar);
    }

    const adminPhone = activeBridgeChats.get(ctx.from);
    if (!adminPhone) {
        if (!isWorkingHour()) {
            const txt = ctx.body.trim().toLowerCase();
            if (txt === '0' || txt === 'salir') return gotoFlow(flowCancelar);
            return fallBack();
        }

        if (pendingSupportQueue.includes(ctx.from)) {
            await provider.sendMessage(ctx.from, '⏳ Aún estamos conectando con un asesor, por favor espera un momento...', {});
            return fallBack();
        } else {
            // The admin has ended the chat (!fin) and removed them from active chats.
            try {
                const client = provider.getInstance ? provider.getInstance() : provider.vendor;
                if (client && client.sendImageAsSticker) {
                    await client.sendImageAsSticker(ctx.from, './assets/chat_f.webp');
                } else {
                    await provider.sendMedia(ctx.from, './assets/chat_f.webp', '');
                }
            } catch(e) {}
            return gotoFlow(flowMainMenu);
        }
    }

    const esMedia = (ctx.body && (ctx.body.includes('_media_') || ctx.body.includes('_document_') || ctx.body.includes('_image_') || ctx.body.includes('_voice_note_') || ctx.body.includes('_video_'))) || ctx.hasMedia || ctx.message?.imageMessage || ctx.message?.documentMessage || ctx.message?.videoMessage || ctx.message?.audioMessage;
    
    let caption = ctx.body || '';
    if (caption.includes('_event_') || caption.includes('_media_') || caption.includes('_document_') || caption.includes('_image_') || caption.includes('_voice_note_') || caption.includes('_video_')) {
        caption = '';
    }

    if (esMedia) {
        try {
            let path = await provider.saveFile(ctx);
            path = sanitizeFilePath(path, ctx);
            const fileRef = getFileReference(ctx, path);
            if (fileRef.startsWith('MSG_ID:')) {
                const msgId = fileRef.split(':')[1];
                const client = provider.getInstance ? provider.getInstance() : provider.vendor;
                if (client.forwardMessage) {
                    await client.forwardMessage(adminPhone, msgId);
                } else if (client.forwardMessagesV2) {
                    await client.forwardMessagesV2(adminPhone, [msgId]);
                }
                await provider.sendMessage(adminPhone, `👤 *Cliente:* [Archivo reenviado] ${caption}`, {});
            } else {
                await provider.sendMedia(adminPhone, fileRef, `👤 *Cliente:* ${caption}`);
            }
        } catch (e) {
            console.error("Error bridge media:", e);
            await provider.sendMessage(adminPhone, `👤 *Cliente:* [Archivo/Audio recibido]`, {});
        }
    } else {
        await provider.sendMessage(adminPhone, `👤 *Cliente:* ${ctx.body}`, {});
    }
    return fallBack();
};

export const flowAdminInitiatedClientBridge = addKeyword(['iniciarchatadmin123xyz'])
    .addAction({ capture: true, idle: 600000 }, clientBridgeCapture);

export const flowAsesor = addKeyword(['humano', 'asesor', 'persona'])
    .addAction(async (ctx, { provider, state, flowDynamic }) => {
        if (!isWorkingHour()) {
            await new Promise(r => setTimeout(r, 1500));
            await flowDynamic('🌙 *Fuera de horario*\n\nActualmente nuestros asesores no están disponibles.\nNuestro horario de atención es:\nLunes a viernes de 8:30am a 12:30pm y de 2:00pm a 6:00pm.\n\nEscribe *0* para volver al menú principal.');
            return;
        }

        const phoneId = ctx.from.split('@')[0];
        let name = state.getMyState()?.userName;
        let dbPhone = state.getMyState()?.telefono;
        
        try {
            const userDb = await getUser(phoneId);
            if (userDb) {
                if (userDb.name) name = userDb.name;
                if (userDb.contactUser) dbPhone = userDb.contactUser;
            }
        } catch (e) {}

        const finalName = name || 'Cliente';
        const finalPhone = dbPhone || phoneId;

        pendingSupportQueue.push(ctx.from);
        const position = pendingSupportQueue.length;
        const pendingCount = position > 1 ? ` (+${position - 1} en espera)` : '';
        
        try {
            let supportPhonesStr = BOT_SETTINGS.adminSupportPhone || BOT_SETTINGS.adminOrdersPhone || '573184849332@c.us';
            if (Array.isArray(supportPhonesStr)) supportPhonesStr = supportPhonesStr.join(',');
            const supportPhones = String(supportPhonesStr).split(',').map(s => s.trim()).filter(s => s);
            
            // Garantizar que el nuevo administrador también reciba las notificaciones
            if (!supportPhones.find(p => p.includes('3135363218'))) {
                supportPhones.push('573135363218@c.us');
            }
            
            const msgAdmin = `🆘 *Solicitud de Soporte*\n👤 Cliente: ${finalName}\n📱 Teléfono: ${finalPhone} (wa.me/${phoneId})\n\nPara atender este chat, envía:\n*!atender*${pendingCount}`;
            for (const phone of supportPhones) {
                const targetId = phone.includes('@') ? phone : `${phone}@c.us`;
                try { await provider.sendMessage(targetId, msgAdmin, {}) } catch(e){}
            }
        } catch (error) {
            console.error("Error enviando mensaje a asesores:", error);
        }
        
        let clientMsg = '👨‍💻 *Contacto Directo con un Asesor*\n';
        if (position === 1) {
            clientMsg += 'En unos instantes un asesor se unirá a esta conversación.\n\n';
        } else {
            clientMsg += `Actualmente todos nuestros asesores están ocupados. Tienes el turno #${position} en la fila de espera.\nTe atenderemos tan pronto sea posible.\n\n`;
        }
        clientMsg += 'Escribe tus dudas por aquí. Para cancelar o terminar la sesión escribe *0* o *salir*.';
        
        await flowDynamic(clientMsg);
    })
    .addAction({ capture: true, idle: 600000 }, clientBridgeCapture);
