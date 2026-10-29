import { BOT_SETTINGS, BOT_ADVISORS, BOT_SCHEDULE, formatScheduleSummary } from '../botConfig.js';
import { getAllUsers } from '../firebase.js';
import {
    pendingSupportQueue,
    pendingSupportDetails,
    activeBridgeChats,
    findActiveBridge,
    removeActiveBridge,
    getCustomerDisplayInfo,
    resolveClientRealPhone,
    normalizeAdminJids,
    getWppClient,
    downloadAndSaveIncomingFile,
    deliverFileToRecipient,
    safeSendSticker
} from '../utils/helpers.js';
import {
    startBroadcast,
    cancelBroadcast,
    isBroadcasting,
    pendingAdminCampaign,
    interpolateVariables
} from './broadcastService.js';
import { autoLinkAdvisorLid, normalizePhoneVariants } from './advisorAuthService.js';

/**
 * Notifica a todos los asesores autorizados cuando un cliente es atendido por un asesor.
 */
export const notifyAdvisorsClientAttended = async (provider, { advisorPhone, targetId, clientName, remainingCount }) => {
    try {
        const clientInfo = await getCustomerDisplayInfo(targetId);
        const name = clientName || clientInfo.name || 'Cliente';
        const phone = clientInfo.phone || (targetId ? String(targetId).split('@')[0] : '');

        // Obtener nombre del asesor que atendió
        const cleanAdv = String(advisorPhone).split('@')[0].replace(/\D/g, '');
        const matchedAdv = BOT_ADVISORS.find(a => {
            const p = String(a.phone || '').replace(/\D/g, '');
            const l = String(a.lid || '').replace(/\D/g, '');
            return (p && (cleanAdv === p || cleanAdv.endsWith(p))) || (l && cleanAdv === l);
        });
        const advisorName = matchedAdv?.name || 'Asesor';

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
                console.error(`Error enviando notificación broadcast a ${phoneJid}:`, err.message);
            }
        }
    } catch (err) {
        console.error("Error en notifyAdvisorsClientAttended:", err);
    }
};

/**
 * Finaliza de forma limpia la sesión de soporte activo entre un asesor y un cliente.
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
            } catch (e) {}

            return { success: true, clientPhone };
        }
    } catch (e) {
        console.error("Error en endActiveSupportChat:", e);
    }
    return { success: false };
};

/**
 * Genera el texto dinámico del menú de ayuda (!ayuda / !comandos)
 * mostrando únicamente los comandos para los cuales el asesor tiene permisos reales.
 * 
 * @param {object} authInfo Información de autenticación y privilegios del asesor
 * @returns {string} Mensaje de ayuda personalizado
 */
export const buildHelpMenu = (authInfo) => {
    const { advisor, role, permissions } = authInfo;
    const name = advisor?.name || 'Asesor';
    const roleLabel = role === 'admin' ? '🛡️ Administrador General' : '👨‍💻 Asesor de Ventas & Soporte';

    let helpText = `🤖 *PANEL DE COMANDOS CAD IMPRESIONES*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 *Usuario:* ${name}\n` +
        `🏷️ *Rol:* ${roleLabel}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Comandos de Soporte & Chat
    if (permissions.canManageSupport) {
        helpText += `💬 *ATENCIÓN DE CLIENTES Y SOPORTE:*\n` +
            `• *!atender* : Conectarte al siguiente cliente en espera de soporte.\n` +
            `• *!chatear [teléfono]* : Abrir chat directo con un cliente (ej. \`!chatear 3001234567\`).\n` +
            `• *!cola* o *!estado* : Ver el listado y cantidad de clientes esperando asesor.\n` +
            `• *!fin* : Cerrar la sesión de soporte activa y liberar al cliente.\n\n`;
    }

    // Comandos de Difusión Masiva
    if (permissions.canBroadcast) {
        helpText += `📢 *DIFUSIÓN MASIVA DE MENSAJES:*\n` +
            `• *!difusion [mensaje]* : Preparar comunicado a todos los clientes registrados.\n` +
            `• *!confirmar* : Iniciar el envío masivo tras ver la vista previa.\n` +
            `• *!cancelar* : Detener o descartar la campaña masiva en curso.\n\n`;
    } else {
        helpText += `📢 *DIFUSIÓN MASIVA:* _(Función restringida a Administradores)_\n\n`;
    }

    // Comandos Administrativos
    if (role === 'admin') {
        helpText += `⚙️ *ADMINISTRACIÓN Y EQUIPO:*\n` +
            `• *!equipo* o *!asesores* : Ver estado, roles y líneas del equipo en servicio.\n` +
            `• *!horario* : Ver el horario de atención configurado actualmente.\n\n`;
    }

    // Utilidades
    helpText += `📱 *UTILIDADES:*\n` +
        `• *!vincular* : Comprobar y re-vincular este dispositivo WhatsApp (@lid).\n` +
        `• *!ayuda* : Mostrar este menú de comandos.\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `💡 _Escribe cualquiera de los comandos anteriores exactamente como se indica._`;

    return helpText;
};

/**
 * Determina si un texto corresponde a un comando de asesor (inicia con '!')
 * 
 * @param {string} text Texto del mensaje
 * @returns {boolean}
 */
export const isAdvisorCommand = (text) => {
    if (!text || typeof text !== 'string') return false;
    const trimmed = text.trim();
    return trimmed.startsWith('!') && trimmed.length > 1;
};

/**
 * Despachador maestro de comandos para asesores y administradores.
 * Valida roles y privilegios en tiempo real, ejecuta la acción correspondiente
 * y envía una respuesta informativa y amigable a WhatsApp.
 * 
 * @param {object} params
 * @param {object} params.ctx Contexto del mensaje entrante
 * @param {object} params.provider Instancia del proveedor WPPConnect / BuilderBot
 * @param {object} params.authInfo Información resuelta por advisorAuthService
 * @returns {Promise<{ handled: boolean, command: string, success: boolean, reason?: string }>}
 */
export const dispatchAdvisorCommand = async (param1, param2, param3) => {
    let ctx, provider, authInfo;
    if (param1 && (param1.ctx || param1.provider)) {
        ctx = param1.ctx || {};
        provider = param1.provider;
        authInfo = param1.authInfo || {};
    } else {
        provider = param1;
        ctx = param2 || {};
        authInfo = param3 || {};
    }

    const rawBody = (ctx.body || '').trim();
    if (!rawBody.startsWith('!')) {
        return { handled: false, command: '', success: false, reason: 'NOT_A_COMMAND' };
    }

    const fromJid = ctx.from;
    const bodyLower = rawBody.toLowerCase();
    const [rawCmd, ...argParts] = rawBody.split(/\s+/);
    const cmd = rawCmd.toLowerCase();
    const argsStr = argParts.join(' ').trim();

    const { advisor, role, permissions, matchedIdentifier } = authInfo;
    const advisorName = advisor?.name || 'Asesor';

    console.log(`⚡ [CommandDispatcher] Comando "${cmd}" recibido de "${advisorName}" (${fromJid} | ID: ${matchedIdentifier}) [Rol: ${role}]`);

    // 1. Verificar si el usuario tiene permiso general para ejecutar comandos
    if (!permissions.canExecuteCommands) {
        const denyMsg = `🚫 *ACCESO RESTRINGIDO*\n\n` +
            `Hola *${advisorName}*, tu perfil actualmente *no tiene habilitado el permiso para ejecutar comandos* de bot.\n\n` +
            `👉 Solicita al Administrador que active la opción *"Ejecutar Comandos en WhatsApp"* en el panel de control.`;
        await provider.sendMessage(fromJid, denyMsg, {});
        return { handled: true, command: cmd, success: false, reason: 'COMMANDS_DISABLED' };
    }

    // =========================================================================
    // COMANDO: !ayuda o !comandos
    // =========================================================================
    if (cmd === '!ayuda' || cmd === '!comandos' || cmd === '!menu') {
        const helpMsg = buildHelpMenu(authInfo);
        await provider.sendMessage(fromJid, helpMsg, {});
        return { handled: true, command: cmd, success: true };
    }

    // =========================================================================
    // COMANDO: !vincular
    // =========================================================================
    if (cmd === '!vincular' || cmd === '!id') {
        const cleanFrom = String(fromJid).split('@')[0].replace(/\D/g, '');
        if (cleanFrom.length >= 14 && advisor?.id) {
            await autoLinkAdvisorLid(advisor.id, cleanFrom);
        }

        const lidStatus = advisor?.lid
            ? `🟢 *Dispositivo Vinculado:* \`${advisor.lid}\``
            : `🟡 *ID de este mensaje:* \`${cleanFrom}\` (Vinculado a tu línea +${advisor?.phone})`;

        const vincMsg = `📱 *ESTADO DE VINCULACIÓN DE DISPOSITIVO*\n\n` +
            `👤 *Asesor:* ${advisorName}\n` +
            `📱 *Línea registrada:* +${advisor?.phone || cleanFrom}\n` +
            `🏷️ *Rol asignado:* ${role === 'admin' ? 'Administrador' : 'Asesor'}\n` +
            `${lidStatus}\n\n` +
            `✅ Tu dispositivo está completamente autorizado para ejecutar comandos en el sistema.`;
        await provider.sendMessage(fromJid, vincMsg, {});
        return { handled: true, command: cmd, success: true };
    }

    // =========================================================================
    // COMANDO: !fin (Finalizar chat de soporte activo)
    // =========================================================================
    if (cmd === '!fin' || cmd === '!terminar' || cmd === '!salir') {
        const res = await endActiveSupportChat(provider, fromJid);
        if (res.success) {
            const rawPhone = res.clientPhone.split('@')[0];
            await provider.sendMessage(fromJid, `✅ Sesión de soporte con el cliente (+${rawPhone}) finalizada correctamente. Has salido del modo soporte.`, {});
        } else {
            await provider.sendMessage(fromJid, 'ℹ️ No tienes ningún chat de soporte activo con un cliente en este momento.', {});
        }
        return { handled: true, command: cmd, success: true };
    }

    // =========================================================================
    // COMANDOS DE ATENCIÓN Y SOPORTE (!cola, !estado, !atender, !chatear)
    // =========================================================================
    if (cmd === '!cola' || cmd === '!estado' || cmd === '!pendientes') {
        if (!permissions.canManageSupport) {
            await provider.sendMessage(fromJid, '🚫 No tienes permiso para gestionar la cola de soporte de clientes.', {});
            return { handled: true, command: cmd, success: false, reason: 'FORBIDDEN_SUPPORT' };
        }

        const count = pendingSupportQueue.length;
        if (count === 0) {
            await provider.sendMessage(fromJid, '📋 *Estado de Cola:* No hay clientes esperando soporte en este momento. La cola está vacía ✅', {});
        } else {
            let listMsg = `📋 *CLIENTES EN ESPERA DE SOPORTE (${count}):*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
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
                listMsg += `${i + 1}. 👤 *${displayName}* (📱 +${displayPhone})\n${asuntoStr}\n`;
            }
            listMsg += `👉 Para atender al primer cliente de la fila, escribe: *!atender*`;
            await provider.sendMessage(fromJid, listMsg, {});
        }
        return { handled: true, command: cmd, success: true };
    }

    if (cmd === '!atender' || cmd === '!chatear') {
        if (!permissions.canManageSupport) {
            await provider.sendMessage(fromJid, '🚫 Tu rol no tiene permisos para atender chats de clientes. Contacta al Administrador.', {});
            return { handled: true, command: cmd, success: false, reason: 'FORBIDDEN_SUPPORT' };
        }

        let targetId = null;
        let clientName = 'Cliente';

        if (cmd === '!atender') {
            if (pendingSupportQueue.length === 0) {
                await provider.sendMessage(fromJid, '⚠️ No hay clientes esperando soporte en este momento. La cola está vacía.', {});
                return { handled: true, command: cmd, success: false, reason: 'EMPTY_QUEUE' };
            }
            targetId = pendingSupportQueue.shift();
        } else {
            // !chatear <telefono>
            let targetPhone = argsStr.replace(/\D/g, '');
            if (!targetPhone) {
                await provider.sendMessage(fromJid, '⚠️ Debes indicar el número del cliente al que deseas conectar:\n\n_Ejemplo:_ `!chatear 3001234567` o `!chatear 573001234567`', {});
                return { handled: true, command: cmd, success: false, reason: 'MISSING_PARAM' };
            }

            if (targetPhone.length === 10) {
                targetPhone = '57' + targetPhone;
            }

            const queuedMatch = pendingSupportQueue.find(q => q.includes(targetPhone));
            if (queuedMatch) {
                targetId = queuedMatch;
                pendingSupportQueue.splice(pendingSupportQueue.indexOf(queuedMatch), 1);
            } else {
                targetId = `${targetPhone}@c.us`;
            }
        }

        // Si el asesor ya tenía otro chat activo, cerrarlo previamente
        const previousChat = findActiveBridge(fromJid);
        if (previousChat && previousChat !== targetId) {
            await endActiveSupportChat(provider, fromJid);
        }

        // Enlazar bidireccionalmente en memoria
        activeBridgeChats.set(fromJid, targetId);
        activeBridgeChats.set(targetId, fromJid);

        const cleanAdmin = String(fromJid).split('@')[0].replace(/\D/g, '');
        const cleanClient = String(targetId).split('@')[0].replace(/\D/g, '');
        if (cleanAdmin) activeBridgeChats.set(cleanAdmin, targetId);
        if (cleanClient) activeBridgeChats.set(cleanClient, fromJid);

        // Remover de colas
        const rawTargetPhone = targetId.split('@')[0];
        const qIdx = pendingSupportQueue.indexOf(rawTargetPhone);
        if (qIdx > -1) pendingSupportQueue.splice(qIdx, 1);
        const qIdxJid = pendingSupportQueue.indexOf(targetId);
        if (qIdxJid > -1) pendingSupportQueue.splice(qIdxJid, 1);

        const clientInfo = await getCustomerDisplayInfo(targetId);
        clientName = clientInfo.name || 'Cliente';
        const displayPhone = clientInfo.phone || rawTargetPhone;
        pendingSupportDetails.delete(targetId);
        pendingSupportDetails.delete(rawTargetPhone);

        // Notificar al cliente que un asesor se ha unido
        try {
            await provider.sendMessage(targetId, `👨‍💻 *${advisorName} se ha unido al chat.* Puedes escribirle ahora.`, {});
        } catch (err) {
            await provider.sendMessage(fromJid, `❌ Error: No se pudo conectar con el cliente +${displayPhone}. Es posible que el número sea inválido o no tenga WhatsApp activo.`, {});
            activeBridgeChats.delete(fromJid);
            activeBridgeChats.delete(targetId);
            return { handled: true, command: cmd, success: false, reason: 'CLIENT_UNREACHABLE' };
        }

        // Emitir mensaje ficticio al cliente para que el capture de soporte quede activo si aplica
        try {
            provider.emit('message', {
                from: targetId,
                body: 'iniciarchatadmin123xyz',
                name: 'System'
            });
        } catch (e) {}

        await provider.sendMessage(
            fromJid,
            `✅ *¡Conectado exitosamente con ${clientName} (+${displayPhone})!*\n\n` +
            `Todo lo que escribas a partir de ahora se enviará directamente al cliente.\n` +
            `👉 Para terminar el soporte y regresar, escribe *!fin*.`,
            {}
        );

        // Notificar al resto del equipo
        await notifyAdvisorsClientAttended(provider, {
            advisorPhone: fromJid,
            targetId,
            clientName,
            remainingCount: pendingSupportQueue.length
        });

        return { handled: true, command: cmd, success: true };
    }

    // =========================================================================
    // COMANDOS DE DIFUSIÓN MASIVA (!difusion, !masivo, !confirmar, !cancelar)
    // =========================================================================
    if (cmd === '!difusion' || cmd === '!masivo') {
        if (!permissions.canBroadcast) {
            await provider.sendMessage(fromJid, '🚫 *Acceso Denegado:* No tienes permiso para enviar difusiones masivas. Esta función requiere rol de *Administrador* o privilegio de difusión activo.', {});
            return { handled: true, command: cmd, success: false, reason: 'FORBIDDEN_BROADCAST' };
        }

        const cleanedText = argsStr;
        const esMedia = (rawBody.includes('_media_') || rawBody.includes('_document_') || rawBody.includes('_image_')) ||
            ctx.hasMedia || ctx.message?.imageMessage || ctx.message?.documentMessage;

        if (!cleanedText && !esMedia) {
            const helpBroadcast = `📢 *SISTEMA DE DIFUSIÓN MASIVA (CAD IMPRESIONES)*\n\n` +
                `Envía comunicados personalizados a todos tus clientes con intervalos seguros Anti-Ban.\n\n` +
                `📌 *Cómo enviar:*\n` +
                `• *Texto solo:* Escribe:\n` +
                `  \`!difusion [tu mensaje]\`\n\n` +
                `• *Imagen + Texto:* Envía una foto con el pie de foto:\n` +
                `  \`!difusion [tu mensaje]\`\n\n` +
                `✨ *Variables automáticas disponibles:*\n` +
                `• \`{name}\` : Nombre registrado del cliente\n` +
                `• \`{phone}\` : Número celular del cliente\n` +
                `• \`{empresa}\` : CAD Impresiones\n\n` +
                `💡 *Ejemplo:* \n` +
                `_!difusion ¡Hola {name}! 👋 En {empresa} tenemos 20% de descuento en planos esta semana._\n\n` +
                `🚦 *Comandos de control:*\n` +
                `• *!confirmar* : Iniciar envío tras ver la muestra\n` +
                `• *!cancelar* : Descartar o detener difusión en curso`;
            await provider.sendMessage(fromJid, helpBroadcast, {});
            return { handled: true, command: cmd, success: true };
        }

        if (isBroadcasting()) {
            await provider.sendMessage(fromJid, '⚠️ Ya hay una difusión masiva en progreso. Si deseas detenerla, escribe *!cancelar*.', {});
            return { handled: true, command: cmd, success: false, reason: 'ALREADY_BROADCASTING' };
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
            await provider.sendMessage(fromJid, '⚠️ No se encontraron clientes con número telefónico válido en la base de datos de usuarios.', {});
            return { handled: true, command: cmd, success: false, reason: 'NO_RECIPIENTS' };
        }

        const sampleUser = validRecipients[0];
        const sampleMsg = interpolateVariables(cleanedText, sampleUser);
        const estMinutes = Math.ceil((validRecipients.length * 7) / 60);

        pendingAdminCampaign.set(fromJid, {
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
            if (lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov')) {
                mediaNotice = '🎬 *Adjunto:* Video corto listo para enviar ✅\n';
            } else {
                mediaNotice = '🖼️ *Adjunto:* Imagen flyer lista para enviar ✅\n';
            }
        }

        const previewMsg = `📢 *VISTA PREVIA DE DIFUSIÓN MASIVA*\n\n` +
            `👥 *Destinatarios válidos:* ${validRecipients.length} clientes con celular\n` +
            skippedNotice +
            `⏱️ *Intervalo seguro:* 6 a 9 seg (Protección Anti-Ban)\n` +
            `⏳ *Tiempo estimado:* ~${estMinutes} minuto(s)\n` +
            mediaNotice +
            `══════════════════════════════\n` +
            `📱 *Mensaje de muestra para:* ${sampleUser.name || 'Cliente'} (${sampleUser.displayPhone || sampleUser.realPhone})\n\n` +
            `${sampleMsg}\n` +
            `══════════════════════════════\n\n` +
            `⚠️ *¿Confirmas el envío a los ${validRecipients.length} clientes?*\n` +
            `👉 Escribe *!confirmar* para iniciar el envío masivo.\n` +
            `👉 Escribe *!cancelar* para descartar la campaña.`;

        await provider.sendMessage(fromJid, previewMsg, {});
        return { handled: true, command: cmd, success: true };
    }

    if (cmd === '!confirmar') {
        if (!permissions.canBroadcast) {
            await provider.sendMessage(fromJid, '🚫 No tienes permiso para autorizar difusiones masivas.', {});
            return { handled: true, command: cmd, success: false, reason: 'FORBIDDEN_BROADCAST' };
        }

        if (!pendingAdminCampaign.has(fromJid)) {
            await provider.sendMessage(fromJid, '⚠️ No tienes ninguna difusión pendiente por confirmar. Escribe *!difusion* para crear una.', {});
            return { handled: true, command: cmd, success: false, reason: 'NO_PENDING_CAMPAIGN' };
        }

        const campaign = pendingAdminCampaign.get(fromJid);
        pendingAdminCampaign.delete(fromJid);

        await provider.sendMessage(
            fromJid,
            `🚀 *Iniciando difusión masiva a ${campaign.count} clientes...*\n` +
            `Se enviará de manera secuencial con pausas anti-ban de 7 segundos. Te informaré los avances automáticamente.\n\n` +
            `_Para interrumpir en cualquier momento, escribe *!cancelar*._`,
            {}
        );

        await startBroadcast({
            campaignId: Date.now().toString(),
            template: campaign.template,
            mediaPath: campaign.mediaPath,
            recipients: campaign.recipients,
            delaySeconds: 7,
            adminPhone: fromJid,
            initiator: 'WHATSAPP'
        });

        return { handled: true, command: cmd, success: true };
    }

    if (cmd === '!cancelar') {
        if (pendingAdminCampaign.has(fromJid)) {
            pendingAdminCampaign.delete(fromJid);
            await provider.sendMessage(fromJid, '❌ Difusión masiva pendiente descartada con éxito.', {});
            return { handled: true, command: cmd, success: true };
        }

        if (isBroadcasting()) {
            if (!permissions.canBroadcast && role !== 'admin') {
                await provider.sendMessage(fromJid, '🚫 No tienes permiso para detener la difusión masiva en curso.', {});
                return { handled: true, command: cmd, success: false, reason: 'FORBIDDEN_BROADCAST' };
            }
            await cancelBroadcast();
            await provider.sendMessage(fromJid, '🛑 Deteniendo difusión masiva en progreso. Se completarán los envíos en tránsito y se detendrá.', {});
            return { handled: true, command: cmd, success: true };
        }

        await provider.sendMessage(fromJid, 'ℹ️ No tienes ninguna difusión pendiente ni activa para cancelar.', {});
        return { handled: true, command: cmd, success: true };
    }

    // =========================================================================
    // COMANDOS DE ADMINISTRACIÓN (!equipo, !asesores, !horario)
    // =========================================================================
    if (cmd === '!equipo' || cmd === '!asesores') {
        if (role !== 'admin') {
            await provider.sendMessage(fromJid, '🚫 Este comando está reservado únicamente para Administradores Generales.', {});
            return { handled: true, command: cmd, success: false, reason: 'ADMIN_ONLY' };
        }

        const total = BOT_ADVISORS.length;
        const activeList = BOT_ADVISORS.filter(a => a.active !== false);
        let teamMsg = `👥 *EQUIPO DE ASESORES CAD IMPRESIONES (${total}):*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        BOT_ADVISORS.forEach((a, idx) => {
            const roleBadge = a.role === 'admin' ? '🛡️ Admin' : '👨‍💻 Asesor';
            const status = a.active !== false ? '🟢 Activo' : '⚪ Inactivo';
            const lidBadge = a.lid ? ` (LID: ${a.lid.substring(0, 6)}...)` : '';
            teamMsg += `${idx + 1}. *${a.name}* [${roleBadge}] - ${status}\n` +
                `   📱 +${a.phone}${lidBadge}\n` +
                `   💬 Soporte: ${a.receiveSupport !== false ? '✅' : '❌'} | 📦 Pedidos: ${a.receiveOrders ? '✅' : '❌'} | ⚡ Comandos: ${a.canExecuteCommands !== false ? '✅' : '❌'}\n\n`;
        });

        teamMsg += `_Para modificar asesores o permisos, accede al Panel de Control Web._`;
        await provider.sendMessage(fromJid, teamMsg, {});
        return { handled: true, command: cmd, success: true };
    }

    if (cmd === '!horario') {
        const summary = formatScheduleSummary(BOT_SCHEDULE);
        const schedMsg = `🕒 *HORARIO DE ATENCIÓN ACTUAL:*\n\n${summary}\n\n` +
            `Modo actual: *${BOT_SCHEDULE.mode || 'auto'}*\n` +
            `_Modifica este horario desde la pestaña Horarios del Dashboard._`;
        await provider.sendMessage(fromJid, schedMsg, {});
        return { handled: true, command: cmd, success: true };
    }

    // Comando no reconocido
    await provider.sendMessage(
        fromJid,
        `❓ *Comando no reconocido:* \`${cmd}\`\n\n` +
        `Escribe *!ayuda* para ver la lista completa de comandos a los que tienes acceso.`,
        {}
    );
    return { handled: true, command: cmd, success: false, reason: 'UNKNOWN_COMMAND' };
};
