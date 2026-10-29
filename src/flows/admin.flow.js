import { addKeyword, EVENTS } from '@builderbot/bot';
import { BOT_SETTINGS, BOT_SCHEDULE, getOutOfHoursMessage } from '../botConfig.js';
import { getUser, getAllUsers } from '../firebase.js';
import {
    isWorkingHour,
    isTestPhone,
    isAdmin,
    pendingSupportQueue,
    pendingSupportDetails,
    activeBridgeChats,
    findActiveBridge,
    removeActiveBridge,
    sanitizeFilePath,
    getFileReference,
    downloadAndSaveIncomingFile,
    deliverFileToRecipient,
    normalizeAdminJids,
    getWppClient,
    getCustomerDisplayInfo,
    getAdvisorName,
    resolveClientRealPhone
} from '../utils/helpers.js';
import {
    startBroadcast,
    cancelBroadcast,
    isBroadcasting,
    pendingAdminCampaign,
    interpolateVariables
} from '../services/broadcastService.js';
import { flowCancelar, flowInactividad, flowMainMenu } from './main.flow.js';
import { notifySupportAdvisors } from '../services/advisorService.js';

// ==========================================
// HELPERS DE SOPORTE Y NOTIFICACIÓN
// ==========================================

/**
 * Notifica a todos los asesores autorizados cuando un cliente es atendido por un asesor.
 * Muestra el nombre real del cliente y su teléfono de base de datos (sin LID ni enlaces wa.me),
 * junto con el nombre configurado del asesor que tomó el chat.
 */
export const notifyAdvisorsClientAttended = async (provider, { advisorPhone, targetId, clientName, remainingCount }) => {
    try {
        const clientInfo = await getCustomerDisplayInfo(targetId);
        const name = clientName || clientInfo.name || 'Cliente';
        const phone = clientInfo.phone || (targetId ? String(targetId).split('@')[0] : '');
        const advisorName = getAdvisorName(advisorPhone);

        const queueInfo = remainingCount > 0
            ? `⏳ *Clientes en espera:* ${remainingCount} pendiente(s)`
            : `✅ *Cola de espera:* No hay clientes pendientes (cola vacía)`;

        const broadcastMsg = `🔔 *Atención de Soporte Iniciada*\n\n` +
            `👤 *Cliente:* ${name}\n` +
            `📱 *Teléfono:* ${phone}\n` +
            `👨‍💻 *Atendido por:* ${advisorName}\n\n` +
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

        if (bodyLower.startsWith('!difusion') || bodyLower.startsWith('!masivo') || bodyLower.startsWith('!confirmar') || bodyLower.startsWith('!cancelar')) {
            await provider.sendMessage(ctx.from, '⚠️ Estás dentro de una sesión activa de soporte con un cliente. Escribe *!fin* primero para salir antes de realizar difusiones masivas.', {});
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

export const flowAdminBridge = addKeyword(['!chatear', '!atender', '!fin', '!cola', '!estado', '!difusion', '!masivo', '!confirmar', '!cancelar'])
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
                    const clientJid = pendingSupportQueue[i];
                    const details = pendingSupportDetails.get(clientJid) || {};
                    let displayName = details.name;
                    let displayPhone = details.phone;
                    if (!displayName || !displayPhone) {
                        const info = await getCustomerDisplayInfo(clientJid);
                        displayName = displayName || info.name;
                        displayPhone = displayPhone || info.phone;
                    }
                    const asuntoStr = details.asunto ? `   📝 *Asunto:* ${details.asunto}\n` : '';
                    listMsg += `${i + 1}. 👤 ${displayName} (📱 ${displayPhone})\n${asuntoStr}`;
                }
                listMsg += `\nPara atender al primer cliente, escribe *!atender*`;
                await provider.sendMessage(ctx.from, listMsg, {});
            }
            return;
        }

        // 3. Comandos de Difusión Masiva (!difusion / !masivo)
        if (txt.startsWith('!difusion') || txt.startsWith('!masivo')) {
            const rawBody = ctx.body || '';
            const cleanedText = rawBody.replace(/^!(difusion|masivo)/i, '').trim();

            const esMedia = (rawBody && (rawBody.includes('_media_') || rawBody.includes('_document_') || rawBody.includes('_image_'))) || ctx.hasMedia || ctx.message?.imageMessage || ctx.message?.documentMessage;

            // Si el admin escribió solo !difusion sin mensaje ni imagen
            if (!cleanedText && !esMedia) {
                const helpMsg = `📢 *SISTEMA DE DIFUSIÓN MASIVA (CAD IMPRESIONES)*\n\n` +
                    `Envía comunicados personalizados a todos tus clientes con intervalos seguros Anti-Ban.\n\n` +
                    `📌 *Cómo enviar:*\n` +
                    `• *Texto solo:* Escribe:\n` +
                    `  \`!difusion [tu mensaje]\`\n\n` +
                    `• *Imagen + Texto:* Envía una foto con el pie de foto:\n` +
                    `  \`!difusion [tu mensaje]\`\n\n` +
                    `✨ *Variables automáticas disponibles:*\n` +
                    `• \`{name}\` o \`{nombre}\` : Nombre registrado del cliente\n` +
                    `• \`{phone}\` o \`{telefono}\` : Número del cliente\n` +
                    `• \`{contacto}\` : Usuario de contacto alternativo\n` +
                    `• \`{empresa}\` : CAD Impresiones\n\n` +
                    `💡 *Ejemplo:* \n` +
                    `_!difusion ¡Hola {name}! 👋 En {empresa} tenemos 20% de descuento en planos esta semana._\n\n` +
                    `🚦 *Comandos de control:*\n` +
                    `• *!confirmar* : Iniciar envío tras ver la muestra\n` +
                    `• *!cancelar* : Descartar o detener difusión en curso`;
                await provider.sendMessage(ctx.from, helpMsg, {});
                return;
            }

            if (isBroadcasting()) {
                await provider.sendMessage(ctx.from, '⚠️ Ya hay una difusión masiva en progreso. Si deseas detenerla, escribe *!cancelar*.', {});
                return;
            }

            let mediaPath = null;
            if (esMedia) {
                try {
                    const fileInfo = await downloadAndSaveIncomingFile(ctx, provider, './downloads');
                    if (fileInfo && fileInfo.filePath) {
                        mediaPath = fileInfo.filePath;
                    }
                } catch (eMedia) {
                    console.warn('⚠️ No se pudo descargar imagen de difusión:', eMedia.message);
                }
            }

            const allUsers = await getAllUsers();
            const validRecipients = [];
            let skippedCount = 0;

            for (const u of allUsers) {
                const res = resolveClientRealPhone(u);
                if (res.isValid) {
                    validRecipients.push({
                        ...u,
                        realPhone: res.formattedPhone,
                        displayPhone: res.displayPhone,
                        recipientJid: res.jid
                    });
                } else {
                    skippedCount++;
                }
            }

            if (validRecipients.length === 0) {
                await provider.sendMessage(ctx.from, '⚠️ No se encontraron clientes con número telefónico válido en la base de datos de usuarios.', {});
                return;
            }

            const sampleUser = validRecipients[0];
            const sampleMsg = interpolateVariables(cleanedText, sampleUser);
            const estMinutes = Math.ceil((validRecipients.length * 7) / 60);

            pendingAdminCampaign.set(ctx.from, {
                template: cleanedText,
                mediaPath,
                recipients: validRecipients,
                count: validRecipients.length,
                createdAt: Date.now()
            });

            const skippedNotice = skippedCount > 0
                ? `ℹ️ _(${skippedCount} contacto(s) omitidos por no tener número celular registrado, ej. solo @usuario)_\n`
                : '';

            let mediaNotice = '';
            if (mediaPath) {
                const lower = mediaPath.toLowerCase();
                if (lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') || lower.endsWith('.m4v')) {
                    mediaNotice = '🎬 *Adjunto:* Video corto listo para enviar ✅\n';
                } else if (lower.endsWith('.gif')) {
                    mediaNotice = '✨ *Adjunto:* GIF animado listo para enviar ✅\n';
                } else {
                    mediaNotice = '🖼️ *Adjunto:* Imagen flyer lista para enviar ✅\n';
                }
            }

            const previewMsg = `📢 *VISTA PREVIA DE DIFUSIÓN MASIVA*\n\n` +
                `👥 *Destinatarios válidos:* ${validRecipients.length} clientes con teléfono celular\n` +
                skippedNotice +
                `⏱️ *Intervalo seguro:* 6 a 9 seg (Protección Anti-Ban)\n` +
                `⏳ *Tiempo estimado:* ~${estMinutes} minuto(s)\n` +
                mediaNotice +
                `══════════════════════════════\n` +
                `📱 *Mensaje de muestra para:* ${sampleUser.name || 'Cliente'} (${sampleUser.displayPhone || sampleUser.realPhone || sampleUser.phone})\n\n` +
                `${sampleMsg}\n` +
                `══════════════════════════════\n\n` +
                `⚠️ *¿Confirmas el envío a los ${validRecipients.length} clientes?*\n` +
                `👉 Escribe *!confirmar* para iniciar el envío.\n` +
                `👉 Escribe *!cancelar* para descartar la campaña.`;

            await provider.sendMessage(ctx.from, previewMsg, {});
            return;
        }

        // 4. Comando !confirmar
        if (txt.startsWith('!confirmar')) {
            if (!pendingAdminCampaign.has(ctx.from)) {
                await provider.sendMessage(ctx.from, '⚠️ No tienes ninguna difusión pendiente por confirmar. Escribe *!difusion* para crear una.', {});
                return;
            }

            const campaign = pendingAdminCampaign.get(ctx.from);
            pendingAdminCampaign.delete(ctx.from);

            await provider.sendMessage(
                ctx.from,
                `🚀 *Iniciando difusión masiva a ${campaign.count} clientes...*\n` +
                `Se enviará de manera secuencial con pausas anti-ban. Te informaré los avances automáticamente.\n\n` +
                `_Para interrumpir en cualquier momento, escribe *!cancelar*._`,
                {}
            );

            await startBroadcast({
                campaignId: Date.now().toString(),
                template: campaign.template,
                mediaPath: campaign.mediaPath,
                recipients: campaign.recipients,
                delaySeconds: 7,
                adminPhone: ctx.from,
                initiator: 'WHATSAPP'
            });
            return;
        }

        // 5. Comando !cancelar
        if (txt.startsWith('!cancelar')) {
            if (pendingAdminCampaign.has(ctx.from)) {
                pendingAdminCampaign.delete(ctx.from);
                await provider.sendMessage(ctx.from, '❌ Difusión masiva pendiente cancelada y descartada con éxito.', {});
                return;
            }

            if (isBroadcasting()) {
                await cancelBroadcast();
                await provider.sendMessage(ctx.from, '🛑 Deteniendo difusión masiva en progreso. Se completarán los envíos en tránsito y se detendrá.', {});
                return;
            }

            await provider.sendMessage(ctx.from, 'ℹ️ No tienes ninguna difusión pendiente ni activa para cancelar.', {});
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
            
            // Permitir coincidencia con la cola pendiente
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

        // Obtener la información del cliente desde Firestore / estado
        const clientInfo = await getCustomerDisplayInfo(targetId);
        clientName = clientInfo.name || 'Cliente';
        const displayPhone = clientInfo.phone || rawTargetPhone;
        pendingSupportDetails.delete(targetId);
        pendingSupportDetails.delete(rawTargetPhone);

        try {
            await provider.sendMessage(targetId, '👨‍💻 *Un asesor se ha unido al chat. Puedes escribirle ahora.*', {});
        } catch (err) {
            await provider.sendMessage(ctx.from, `❌ Error: No se pudo conectar con el cliente ${displayPhone}. Es posible que el número sea inválido.`, {});
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
        
        await provider.sendMessage(ctx.from, `✅ Conectado al cliente ${clientName} (${displayPhone}). Todo lo que escribas se enviará. Escribe *!fin* para terminar.`, {});

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
        const cmd = ctx.body.trim().toLowerCase();
        if (cmd.startsWith('!chatear') || cmd.startsWith('!atender') || cmd.startsWith('!fin') || cmd.startsWith('!cola') || cmd.startsWith('!estado') || cmd.startsWith('!difusion') || cmd.startsWith('!masivo') || cmd.startsWith('!confirmar') || cmd.startsWith('!cancelar')) {
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
        pendingSupportDetails.delete(ctx.from);
        return gotoFlow(flowCancelar);
    }

    const adminPhone = findActiveBridge(ctx.from);
    if (!adminPhone) {
        if (!isWorkingHour({ fromPhone: ctx.from })) {
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
    .addAction(async (ctx, { flowDynamic, gotoFlow }) => {
        if (!isWorkingHour({ fromPhone: ctx.from })) {
            await new Promise(r => setTimeout(r, 1200));
            const outMsg = getOutOfHoursMessage();
            await flowDynamic(outMsg);
            return;
        }

        await new Promise(r => setTimeout(r, 800));
        await flowDynamic('👨‍💻 *Contacto con un Asesor*\n\nPor favor, escribe brevemente el *motivo o asunto* de tu consulta para que podamos asignarte al asesor indicado y darte una respuesta más rápida:\n\n_(O escribe *0* si deseas cancelar y volver al menú principal)_');
    })
    .addAction({ capture: true, idle: BOT_SETTINGS.advisorIdleTimeoutMs || 1800000 }, async (ctx, { provider, state, flowDynamic, gotoFlow, fallBack }) => {
        if (!isWorkingHour({ fromPhone: ctx.from })) {
            return;
        }

        if (ctx?.idleFallBack) {
            return gotoFlow(flowInactividad);
        }

        const rawBody = (ctx.body || '').trim();
        const lowerBody = rawBody.toLowerCase();

        if (lowerBody === '0' || lowerBody === 'salir' || lowerBody === 'cancelar') {
            return gotoFlow(flowCancelar);
        }

        const asunto = rawBody || 'Consulta general';
        if (state && state.update) {
            await state.update({ supportSubject: asunto });
        }

        // Obtener datos formateados del cliente desde Firestore / estado
        const clientInfo = await getCustomerDisplayInfo(ctx.from);
        const stateData = (state && state.getMyState) ? (state.getMyState() || {}) : {};
        const finalName = stateData.userName || clientInfo.name || 'Cliente';
        const finalPhone = stateData.contactUser || stateData.telefono || clientInfo.phone || ctx.from.split('@')[0];

        if (!pendingSupportQueue.includes(ctx.from)) {
            pendingSupportQueue.push(ctx.from);
        }
        pendingSupportDetails.set(ctx.from, {
            asunto: asunto,
            name: finalName,
            phone: finalPhone,
            timestamp: Date.now()
        });

        const position = pendingSupportQueue.indexOf(ctx.from) + 1;
        const pendingCount = position > 1 ? ` (+${position - 1} en espera)` : '';

        try {
            await notifySupportAdvisors(provider, {
                clientName: finalName,
                clientPhone: finalPhone,
                clientJid: ctx.from,
                subject: asunto,
                position,
                isTest: isTestPhone(ctx.from)
            });
        } catch (error) {
            console.error("❌ Error enviando mensaje a asesores:", error);
        }

        let clientMsg = '👨‍💻 *Contacto Directo con un Asesor*\n\n';
        if (position === 1) {
            clientMsg += '✅ ¡Hemos recibido tu solicitud y tu consulta!\nEn unos instantes un asesor se unirá a esta conversación.\n\n';
        } else {
            clientMsg += `✅ ¡Hemos recibido tu solicitud!\nActualmente todos nuestros asesores están ocupados. Tienes el turno #${position} en la fila de espera.\nTe atenderemos tan pronto sea posible.\n\n`;
        }
        clientMsg += 'Puedes seguir escribiendo tus dudas por aquí mientras te conectamos. Para cancelar o terminar la sesión escribe *0* o *salir*.';

        await flowDynamic(clientMsg);
    })
    .addAction({ capture: true, idle: BOT_SETTINGS.advisorIdleTimeoutMs || 1800000 }, clientBridgeCapture);
