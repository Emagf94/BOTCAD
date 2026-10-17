import { addKeyword, EVENTS } from '@builderbot/bot';
import { BOT_SETTINGS } from '../botConfig.js';
import { getUser } from '../firebase.js';
import {
    isWorkingHour,
    isAdmin,
    pendingSupportQueue,
    activeBridgeChats,
    findActiveBridge,
    removeActiveBridge,
    sanitizeFilePath,
    getFileReference,
    downloadAndSaveIncomingFile,
    deliverFileToRecipient,
    normalizeAdminJids,
    getWppClient
} from '../utils/helpers.js';
import { botInstance } from '../app.js';
import { flowCancelar, flowInactividad, flowMainMenu } from './main.flow.js';

// ==========================================
// HELPERS DE SOPORTE Y NOTIFICACIÓN
// ==========================================

/**
 * Notifica a todos los asesores autorizados cuando un cliente es atendido por un asesor.
 * Informa quién fue atendido, quién lo atendió y cuántos clientes quedan en cola.
 */
export const notifyAdvisorsClientAttended = async (provider, { advisorPhone, targetId, clientName, remainingCount }) => {
    try {
        const rawClientPhone = targetId ? String(targetId).split('@')[0] : '';
        const rawAdvisorPhone = advisorPhone ? String(advisorPhone).split('@')[0] : 'Asesor';

        let name = clientName;
        if (!name && rawClientPhone) {
            try {
                const userDoc = await getUser(rawClientPhone);
                if (userDoc?.name) name = userDoc.name;
            } catch (e) {}
        }
        name = name || 'Cliente';

        const queueInfo = remainingCount > 0
            ? `⏳ *Clientes en espera:* ${remainingCount} pendiente(s)`
            : `✅ *Cola de espera:* No hay clientes pendientes (cola vacía)`;

        const broadcastMsg = `🔔 *Atención de Soporte Iniciada*\n\n` +
            `👤 *Cliente:* ${name}\n` +
            `📱 *Teléfono:* ${rawClientPhone} (wa.me/${rawClientPhone})\n` +
            `👨‍💻 *Atendido por:* ${rawAdvisorPhone}\n\n` +
            `${queueInfo}`;

        const adminPhones = normalizeAdminJids(BOT_SETTINGS.adminSupportPhone || '573184849332@c.us, 573135363218@c.us');
        for (const phoneJid of adminPhones) {
            try {
                await provider.sendMessage(phoneJid, broadcastMsg, {});
            } catch (err) {
                console.error(`Error enviando notificación broadcast a ${phoneJid}:`, err);
            }
        }
    } catch (err) {
        console.error("Error en notifyAdvisorsClientAttended:", err);
    }
};

/**
 * Finaliza de forma limpia la sesión de soporte activo entre un asesor y un cliente.
 * Notifica al cliente y envía sticker de fin de chat si está disponible.
 */
export const endActiveSupportChat = async (provider, adminFrom) => {
    try {
        const clientPhone = findActiveBridge(adminFrom);

        if (clientPhone) {
            removeActiveBridge(adminFrom);

            try {
                await provider.sendMessage(clientPhone, '👨‍💻 *El asesor ha finalizado el chat.* Volviendo al menú principal...', {});
            } catch (e) {}

            try {
                const client = await getWppClient(provider);
                if (client && client.sendImageAsSticker) {
                    await client.sendImageAsSticker(clientPhone, './assets/chat_f.webp');
                } else {
                    await provider.sendMedia(clientPhone, './assets/chat_f.webp', '');
                }
            } catch(e) {}

            return { success: true, clientPhone };
        }
    } catch (e) {
        console.error("Error en endActiveSupportChat:", e);
    }
    return { success: false };
};

// ==========================================
// FLUJOS DE ADMINISTRACIÓN Y ASESOR
// ==========================================

export const flowAdminBridgeLoop = addKeyword(EVENTS.ACTION)
    .addAction({ capture: true, idle: BOT_SETTINGS.advisorIdleTimeoutMs || 1800000 }, async (ctx, { fallBack, endFlow, provider }) => {
        if (!isAdmin(ctx)) return;

        if (ctx?.idleFallBack) {
            await endActiveSupportChat(provider, ctx.from);
            return endFlow('⏳ Sesión de soporte terminada por inactividad.');
        }

        const clientPhone = findActiveBridge(ctx.from);
        if (!clientPhone) return endFlow('❌ El chat ha expirado o el cliente se fue.');

        const bodyTrim = (ctx.body || '').trim();
        const bodyLower = bodyTrim.toLowerCase();

        if (bodyLower === '!fin') {
            await endActiveSupportChat(provider, ctx.from);
            return endFlow('✅ Chat finalizado. Has salido del modo soporte.');
        }

        if (bodyLower.startsWith('!cola') || bodyLower.startsWith('!estado')) {
            const count = pendingSupportQueue.length;
            const qMsg = count === 0
                ? '📋 *Estado de Cola:* No hay clientes esperando soporte.'
                : `📋 *Estado de Cola:* Hay ${count} cliente(s) en espera de soporte.`;
            await provider.sendMessage(ctx.from, qMsg, {});
            return fallBack();
        }

        if (bodyLower.startsWith('!atender') || bodyLower.startsWith('!chatear')) {
            await provider.sendMessage(ctx.from, '⚠️ Ya tienes una conversación activa con un cliente. Escribe *!fin* para terminarla antes de atender a otro.', {});
            return fallBack();
        }

        const esMedia = (ctx.body && (ctx.body.includes('_media_') || ctx.body.includes('_document_') || ctx.body.includes('_image_') || ctx.body.includes('_voice_note_') || ctx.body.includes('_video_') || ctx.body.includes('_event_forward_'))) || ctx.hasMedia || ctx.message?.imageMessage || ctx.message?.documentMessage || ctx.message?.videoMessage || ctx.message?.audioMessage || ctx.message?.forwardedMessage?.imageMessage || ctx.message?.forwardedMessage?.documentMessage || ctx.message?.videoMessage || ctx.message?.forwardedMessage?.audioMessage;
        
        let caption = ctx.body || '';
        if (caption.includes('_event_') || caption.includes('_media_') || caption.includes('_document_') || caption.includes('_image_') || caption.includes('_voice_note_') || caption.includes('_video_') || caption.includes('_event_forward_') || caption.includes('reenviado')) {
            caption = '';
        }

        if (esMedia) {
            try {
                const fileInfo = await downloadAndSaveIncomingFile(ctx, provider, './downloads');
                await deliverFileToRecipient(provider, clientPhone, fileInfo, `👨‍💻 *Asesor:* ${caption}`);
            } catch (err) {
                console.error("Error bridge media admin:", err);
                await provider.sendMessage(clientPhone, `👨‍💻 *Asesor:* [Archivo/Audio enviado]`, {});
            }
        } else {
            await provider.sendMessage(clientPhone, `👨‍💻 *Asesor:* ${ctx.body}`, {});
        }
        return fallBack();
    });

export const flowAdminBridge = addKeyword(['!chatear', '!atender', '!fin', '!cola', '!estado'])
    .addAction(async (ctx, { provider, gotoFlow }) => {
        console.log("=== [DEBUG ADMIN BRIDGE] ===");
        console.log("FROM:", ctx.from, "BODY:", ctx.body);
        console.log("QUEUE:", pendingSupportQueue);
        if (!isAdmin(ctx)) {
            console.log("ABORT: ctx is not authorized admin");
            return;
        }
        
        const txt = (ctx.body || '').trim().toLowerCase();

        // 1. Comando !fin
        if (txt.startsWith('!fin')) {
            const res = await endActiveSupportChat(provider, ctx.from);
            if (res.success) {
                const rawPhone = res.clientPhone.split('@')[0];
                await provider.sendMessage(ctx.from, `✅ Chat con ${rawPhone} finalizado. Has salido del modo soporte.`, {});
            } else {
                await provider.sendMessage(ctx.from, 'ℹ️ No tienes ningún chat de soporte activo en este momento.', {});
            }
            return;
        }

        // 2. Comandos !cola o !estado
        if (txt.startsWith('!cola') || txt.startsWith('!estado')) {
            const count = pendingSupportQueue.length;
            if (count === 0) {
                await provider.sendMessage(ctx.from, '📋 *Estado de Cola:* No hay clientes esperando soporte en este momento.', {});
            } else {
                let listMsg = `📋 *Clientes en Cola de Soporte (${count}):*\n\n`;
                for (let i = 0; i < pendingSupportQueue.length; i++) {
                    const qPhone = pendingSupportQueue[i].split('@')[0];
                    listMsg += `${i + 1}. ${qPhone} (wa.me/${qPhone})\n`;
                }
                listMsg += `\nPara atender al primer cliente, escribe *!atender*`;
                await provider.sendMessage(ctx.from, listMsg, {});
            }
            return;
        }

        // 3. Comandos !atender o !chatear
        let targetId;
        let clientName = 'Cliente';

        if (txt.startsWith('!atender')) {
            if (pendingSupportQueue.length === 0) {
                await provider.sendMessage(ctx.from, '⚠️ No hay clientes en espera de soporte.', {});
                return;
            }
            targetId = pendingSupportQueue.shift();
        } else {
            let targetPhone = ctx.body.replace(/!chatear/ig, '').trim();
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
        
        // Si el asesor ya tenía otro chat activo, cerrarlo previamente
        const previousChat = findActiveBridge(ctx.from);
        if (previousChat && previousChat !== targetId) {
            await endActiveSupportChat(provider, ctx.from);
        }

        activeBridgeChats.set(ctx.from, targetId);
        activeBridgeChats.set(targetId, ctx.from);

        const cleanAdmin = String(ctx.from).split('@')[0].replace(/\D/g, '');
        const cleanClient = String(targetId).split('@')[0].replace(/\D/g, '');
        if (cleanAdmin) activeBridgeChats.set(cleanAdmin, targetId);
        if (cleanClient) activeBridgeChats.set(cleanClient, ctx.from);

        const rawTargetPhone = targetId.split('@')[0];
        const queueIndex = pendingSupportQueue.indexOf(rawTargetPhone);
        if (queueIndex > -1) pendingSupportQueue.splice(queueIndex, 1);
        const queueIndexJid = pendingSupportQueue.indexOf(targetId);
        if (queueIndexJid > -1) pendingSupportQueue.splice(queueIndexJid, 1);

        // Obtener el nombre del cliente si está registrado
        try {
            const userDb = await getUser(rawTargetPhone);
            if (userDb?.name) clientName = userDb.name;
        } catch (e) {}

        try {
            await provider.sendMessage(targetId, '👨‍💻 *Un asesor se ha unido al chat. Puedes escribirle ahora.*', {});
        } catch (err) {
            await provider.sendMessage(ctx.from, `❌ Error: No se pudo conectar con el cliente ${rawTargetPhone}. Es posible que el número sea inválido.`, {});
            activeBridgeChats.delete(ctx.from);
            activeBridgeChats.delete(targetId);
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
        
        await provider.sendMessage(ctx.from, `✅ Conectado al cliente ${clientName} (${rawTargetPhone}). Todo lo que escribas se enviará. Escribe *!fin* para terminar.`, {});

        // Notificar inmediatamente a TODOS los asesores quién fue atendido y cuántos quedan en cola
        await notifyAdvisorsClientAttended(provider, {
            advisorPhone: ctx.from,
            targetId: targetId,
            clientName: clientName,
            remainingCount: pendingSupportQueue.length
        });

        return gotoFlow(flowAdminBridgeLoop);
    });

export const clientBridgeCapture = async (ctx, { fallBack, gotoFlow, provider }) => {
    if (isAdmin(ctx) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
        console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
        const cmd = ctx.body.trim().toLowerCase();
        if (cmd.startsWith('!chatear') || cmd.startsWith('!atender') || cmd.startsWith('!fin') || cmd.startsWith('!cola') || cmd.startsWith('!estado')) {
            return gotoFlow(flowAdminBridge);
        }
        return gotoFlow(flowAdminBridgeLoop);
    }
    if (ctx?.idleFallBack) {
        const adminPhone = findActiveBridge(ctx.from);
        if (adminPhone) {
            removeActiveBridge(ctx.from);
            await provider.sendMessage(adminPhone, `❌ La sesión con ${ctx.from} expiró por inactividad.`, {});
        }
        return gotoFlow(flowInactividad);
    }

    const txt = (ctx.body || '').trim().toLowerCase();
    if (txt === '0' || txt === 'salir') {
        const adminPhone = findActiveBridge(ctx.from);
        if (adminPhone) {
            removeActiveBridge(ctx.from);
            await provider.sendMessage(adminPhone, `❌ El cliente ha finalizado el chat de soporte.`, {});
        }
        const cleanFrom = String(ctx.from).split('@')[0].replace(/\D/g, '');
        for (let i = pendingSupportQueue.length - 1; i >= 0; i--) {
            const itemClean = String(pendingSupportQueue[i]).split('@')[0].replace(/\D/g, '');
            if (itemClean === cleanFrom || pendingSupportQueue[i] === ctx.from) {
                pendingSupportQueue.splice(i, 1);
            }
        }
        return gotoFlow(flowCancelar);
    }

    const adminPhone = findActiveBridge(ctx.from);
    if (!adminPhone) {
        if (!isWorkingHour()) {
            const txt = (ctx.body || '').trim().toLowerCase();
            if (txt === '0' || txt === 'salir') return gotoFlow(flowCancelar);
            return fallBack();
        }

        const cleanFrom = String(ctx.from).split('@')[0].replace(/\D/g, '');
        const isPending = pendingSupportQueue.some(item => {
            const itemClean = String(item).split('@')[0].replace(/\D/g, '');
            return itemClean && cleanFrom && (itemClean === cleanFrom || item.includes(cleanFrom) || cleanFrom.includes(itemClean));
        });

        if (isPending) {
            await provider.sendMessage(ctx.from, '⏳ Aún estamos conectando con un asesor, por favor espera un momento...\n\n(Para salir y volver al menú principal escribe *0* o *salir*)', {});
            return fallBack();
        } else {
            // El chat no está activo ni pendiente
            await provider.sendMessage(ctx.from, '👨‍💻 La sesión con el asesor no está activa actualmente.\nEscribe *10* para solicitar un asesor o *0* para volver al menú principal.', {});
            return gotoFlow(flowMainMenu);
        }
    }

    const esMedia = (ctx.body && (ctx.body.includes('_media_') || ctx.body.includes('_document_') || ctx.body.includes('_image_') || ctx.body.includes('_voice_note_') || ctx.body.includes('_video_') || ctx.body.includes('_event_'))) || ctx.hasMedia || ctx.mimetype || ctx.message?.imageMessage || ctx.message?.documentMessage || ctx.message?.videoMessage || ctx.message?.audioMessage;
    
    let caption = ctx.body || '';
    if (caption.includes('_event_') || caption.includes('_media_') || caption.includes('_document_') || caption.includes('_image_') || caption.includes('_voice_note_') || caption.includes('_video_')) {
        caption = '';
    }

    if (esMedia) {
        try {
            const fileInfo = await downloadAndSaveIncomingFile(ctx, provider, './downloads');
            await deliverFileToRecipient(provider, adminPhone, fileInfo, `👤 *Cliente:* ${caption}`);
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
    .addAction({ capture: true, idle: BOT_SETTINGS.advisorIdleTimeoutMs || 1800000 }, clientBridgeCapture);

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

        if (!pendingSupportQueue.includes(ctx.from)) {
            pendingSupportQueue.push(ctx.from);
        }
        const position = pendingSupportQueue.indexOf(ctx.from) + 1;
        const pendingCount = position > 1 ? ` (+${position - 1} en espera)` : '';
        
        try {
            const supportPhones = normalizeAdminJids(BOT_SETTINGS.adminSupportPhone || '573184849332@c.us, 573135363218@c.us');
            const msgAdmin = `🆘 *Solicitud de Soporte*\n👤 Cliente: ${finalName}\n📱 Teléfono: ${finalPhone} (wa.me/${phoneId})\n\nPara atender este chat, envía:\n*!atender*${pendingCount}`;
            
            for (const phone of supportPhones) {
                const targetId = phone.includes('@') ? phone : `${phone}@c.us`;
                try {
                    await provider.sendMessage(targetId, msgAdmin, {});
                } catch(e) {}
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
    .addAction({ capture: true, idle: BOT_SETTINGS.advisorIdleTimeoutMs || 1800000 }, clientBridgeCapture);
