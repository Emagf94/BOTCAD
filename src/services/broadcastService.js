import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db, getAllUsers } from '../firebase.js';

// ==========================================
// ESTADO EN MEMORIA DEL SERVICIO DE DIFUSIÓN
// ==========================================

let providerInstance = null;
let activeBroadcast = null;
let lastHandledCommandTimestamp = 0;

/**
 * Campañas pendientes de confirmación por WhatsApp creadas por administradores.
 * Mapa: adminPhoneJid -> { template, mediaPath, mediaUrl, recipients, count, createdAt }
 */
export const pendingAdminCampaign = new Map();

/**
 * Normaliza cualquier número o JID a formato estándar de WhatsApp (@c.us)
 * @param {string} phone 
 * @returns {string|null}
 */
export const normalizeRecipientJid = (phone) => {
    if (!phone) return null;
    let digits = String(phone).replace(/[^0-9]/g, '');
    if (!digits) return null;
    // Si tiene 10 dígitos (Colombia sin prefijo país), añadir 57
    if (digits.length === 10) {
        digits = '57' + digits;
    }
    return `${digits}@c.us`;
};

/**
 * Reemplaza variables personalizadas en la plantilla del mensaje
 * {name}, {nombre}, {phone}, {telefono}, {contacto}, {empresa}, {botName}
 * @param {string} template 
 * @param {Object} client 
 * @returns {string}
 */
export const interpolateVariables = (template, client = {}) => {
    if (!template) return '';
    const name = (client.name || 'Cliente').trim();
    const phone = (client.phone || client.id || '').trim();
    const contactUser = (client.contactUser || client.name || 'Cliente').trim();
    const empresa = 'CAD Impresiones';
    const botName = 'Cadi';

    return template
        .replace(/\{name\}/gi, name)
        .replace(/\{nombre\}/gi, name)
        .replace(/\{phone\}/gi, phone)
        .replace(/\{telefono\}/gi, phone)
        .replace(/\{contacto\}/gi, contactUser)
        .replace(/\{empresa\}/gi, empresa)
        .replace(/\{botName\}/gi, botName);
};

/**
 * Retorna true si hay una difusión en ejecución actualmente
 */
export const isBroadcasting = () => {
    return !!(activeBroadcast && activeBroadcast.isRunning);
};

/**
 * Obtiene el estado actual del broadcast activo o null
 */
export const getActiveBroadcastState = () => {
    return activeBroadcast;
};

/**
 * Cancela inmediatamente la difusión masiva en curso
 */
export const cancelBroadcast = async () => {
    if (!activeBroadcast || !activeBroadcast.isRunning) {
        return { success: false, message: 'No hay ninguna difusión activa para cancelar.' };
    }

    console.log(`🛑 [BroadcastService] Cancelación solicitada para la campaña ${activeBroadcast.id}`);
    activeBroadcast.shouldCancel = true;

    try {
        if (db) {
            await setDoc(doc(db, 'config', 'bot_broadcast'), {
                status: 'CANCELLED',
                action: null,
                updatedAt: new Date().toISOString()
            }, { merge: true });
        }
    } catch (e) {
        console.warn('⚠️ [BroadcastService] Error actualizando cancelación en Firestore:', e.message);
    }

    return { success: true, message: 'Difusión cancelada exitosamente.' };
};

/**
 * Inicia la ejecución secuencial de un envío masivo con protección Anti-Ban
 * @param {Object} options
 * @param {string} [options.campaignId] ID único de la campaña
 * @param {string} options.template Texto del mensaje con variables
 * @param {string} [options.mediaUrl] URL o ruta local de imagen/flyer opcional
 * @param {string} [options.mediaPath] Ruta local de imagen/flyer opcional
 * @param {Array<Object>} [options.recipients] Lista de destinatarios [{ id, phone, name, contactUser }]
 * @param {number} [options.delaySeconds=7] Segundos de espera base entre mensajes (anti-ban)
 * @param {string} [options.adminPhone] JID del admin que inició la campaña para notificarlo
 * @param {string} [options.initiator='WHATSAPP'] 'WHATSAPP' | 'DASHBOARD'
 */
export const startBroadcast = async ({
    campaignId = Date.now().toString(),
    template,
    mediaUrl = null,
    mediaPath = null,
    recipients = [],
    delaySeconds = 7,
    adminPhone = null,
    initiator = 'WHATSAPP'
}) => {
    if (isBroadcasting()) {
        console.warn('⚠️ [BroadcastService] Intento de iniciar difusión mientras otra está activa.');
        return { success: false, reason: 'ALREADY_RUNNING', message: 'Ya hay una difusión masiva en ejecución.' };
    }

    const provider = providerInstance;
    if (!provider) {
        console.error('❌ [BroadcastService] Provider de WhatsApp no está inicializado.');
        return { success: false, reason: 'NO_PROVIDER', message: 'El servicio de WhatsApp no está listo.' };
    }

    // Si no se pasaron destinatarios, obtener todos de Firestore
    let finalRecipients = recipients;
    if (!finalRecipients || finalRecipients.length === 0) {
        const allUsers = await getAllUsers();
        finalRecipients = allUsers.filter(u => u.phone || u.id);
    }

    if (finalRecipients.length === 0) {
        return { success: false, reason: 'NO_RECIPIENTS', message: 'No hay destinatarios registrados para enviar.' };
    }

    const mediaTarget = mediaPath || mediaUrl || null;
    const totalCount = finalRecipients.length;

    activeBroadcast = {
        id: campaignId,
        isRunning: true,
        shouldCancel: false,
        total: totalCount,
        sent: 0,
        failed: 0,
        startTime: Date.now(),
        template,
        mediaTarget,
        initiator,
        adminPhone,
        logs: []
    };

    console.log(`🚀 [BroadcastService] Iniciando difusión "${campaignId}" a ${totalCount} destinatarios (Iniciado por: ${initiator})...`);

    // Sincronizar estado inicial en Firestore
    try {
        if (db) {
            await setDoc(doc(db, 'config', 'bot_broadcast'), {
                id: campaignId,
                status: 'SENDING',
                action: null,
                total: totalCount,
                sent: 0,
                failed: 0,
                progress: 0,
                template,
                hasMedia: !!mediaTarget,
                mediaUrl: mediaUrl || (mediaPath ? 'media_local' : null),
                delaySeconds,
                initiator,
                startedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                logs: []
            }, { merge: true });
        }
    } catch (e) {
        console.warn('⚠️ [BroadcastService] Error publicando inicio en Firestore:', e.message);
    }

    // Ejecución asíncrona de la cola para no bloquear el hilo de Node
    (async () => {
        const startTime = Date.now();
        const baseDelayMs = Math.max(4000, (delaySeconds || 7) * 1000);

        for (let i = 0; i < finalRecipients.length; i++) {
            if (activeBroadcast.shouldCancel) {
                console.log(`🛑 [BroadcastService] Envío masivo cancelado en el destinatario ${i + 1}/${totalCount}`);
                break;
            }

            const recipient = finalRecipients[i];
            const recipientPhone = recipient.phone || recipient.id;
            const recipientJid = normalizeRecipientJid(recipientPhone);

            if (!recipientJid) {
                activeBroadcast.failed++;
                activeBroadcast.logs.unshift({
                    time: new Date().toLocaleTimeString('es-CO'),
                    name: recipient.name || 'Sin nombre',
                    phone: recipientPhone || 'N/A',
                    status: 'ERROR',
                    error: 'Teléfono inválido'
                });
                continue;
            }

            const personalizedMessage = interpolateVariables(template, recipient);

            try {
                if (mediaTarget) {
                    await provider.sendMessage(recipientJid, personalizedMessage, { media: mediaTarget });
                } else {
                    await provider.sendMessage(recipientJid, personalizedMessage, {});
                }

                activeBroadcast.sent++;
                activeBroadcast.logs.unshift({
                    time: new Date().toLocaleTimeString('es-CO'),
                    name: recipient.name || 'Cliente',
                    phone: recipientPhone,
                    status: 'SUCCESS'
                });
                console.log(`📤 [BroadcastService] [${i + 1}/${totalCount}] Enviado a ${recipient.name || 'Cliente'} (${recipientPhone})`);
            } catch (err) {
                activeBroadcast.failed++;
                activeBroadcast.logs.unshift({
                    time: new Date().toLocaleTimeString('es-CO'),
                    name: recipient.name || 'Cliente',
                    phone: recipientPhone,
                    status: 'ERROR',
                    error: err.message
                });
                console.warn(`⚠️ [BroadcastService] Falló envío a ${recipientPhone}: ${err.message}`);
            }

            // Sincronizar progreso en Firestore
            const processed = activeBroadcast.sent + activeBroadcast.failed;
            const progressPct = Math.round((processed / totalCount) * 100);

            try {
                if (db && (processed % 2 === 0 || processed === totalCount)) {
                    await setDoc(doc(db, 'config', 'bot_broadcast'), {
                        sent: activeBroadcast.sent,
                        failed: activeBroadcast.failed,
                        progress: progressPct,
                        updatedAt: new Date().toISOString(),
                        logs: activeBroadcast.logs.slice(0, 30)
                    }, { merge: true });
                }
            } catch (e) {
                // Ignore silent firestore sync errors
            }

            // Notificación intermedia por WhatsApp al Admin cada 15 mensajes o hitos 25%, 50%, 75%
            if (adminPhone && totalCount >= 10) {
                const milestone = Math.round((processed / totalCount) * 100);
                if (milestone === 25 || milestone === 50 || milestone === 75) {
                    try {
                        await provider.sendMessage(
                            adminPhone,
                            `📊 *Progreso de Difusión:* ${processed}/${totalCount} procesados (${milestone}%)\n✅ Enviados: ${activeBroadcast.sent} | ❌ Fallidos: ${activeBroadcast.failed}`,
                            {}
                        );
                    } catch (e) {}
                }
            }

            // Espera Anti-Ban aleatorizada (ej. 6000ms a 9000ms) si quedan mensajes pendientes
            if (i < finalRecipients.length - 1 && !activeBroadcast.shouldCancel) {
                const randomizedDelay = Math.floor(baseDelayMs + (Math.random() * 3000 - 1000));
                await new Promise(resolve => setTimeout(resolve, Math.max(4000, randomizedDelay)));
            }
        }

        const isCancelled = activeBroadcast.shouldCancel;
        const totalDurationSec = Math.round((Date.now() - startTime) / 1000);
        const durationFormatted = totalDurationSec >= 60
            ? `${Math.floor(totalDurationSec / 60)}m ${totalDurationSec % 60}s`
            : `${totalDurationSec}s`;

        const finalStatus = isCancelled ? 'CANCELLED' : 'COMPLETED';

        console.log(`🏁 [BroadcastService] Difusión finalizada: ${finalStatus}. Enviados: ${activeBroadcast.sent}, Fallidos: ${activeBroadcast.failed}, Tiempo: ${durationFormatted}`);

        // Actualizar Firestore con estado final
        try {
            if (db) {
                await setDoc(doc(db, 'config', 'bot_broadcast'), {
                    status: finalStatus,
                    sent: activeBroadcast.sent,
                    failed: activeBroadcast.failed,
                    progress: 100,
                    completedAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    duration: durationFormatted,
                    logs: activeBroadcast.logs.slice(0, 50)
                }, { merge: true });
            }
        } catch (e) {
            console.warn('⚠️ [BroadcastService] Error guardando estado final en Firestore:', e.message);
        }

        // Notificación final por WhatsApp al Administrador
        if (adminPhone) {
            try {
                const summaryMsg = isCancelled
                    ? `🛑 *DIFUSIÓN INTERRUMPIDA POR EL ADMINISTRADOR*\n\n` +
                      `📊 *Resumen parcial:*\n` +
                      `• Enviados con éxito: ${activeBroadcast.sent}\n` +
                      `• Fallidos / omitidos: ${activeBroadcast.failed}\n` +
                      `• Total planificado: ${totalCount}\n` +
                      `⏱️ *Tiempo transcurrido:* ${durationFormatted}`
                    : `✅ *DIFUSIÓN MASIVA COMPLETADA CON ÉXITO*\n\n` +
                      `📊 *Resumen de Campaña:*\n` +
                      `• 👥 Destinatarios totales: ${totalCount}\n` +
                      `• ✅ Enviados correctamente: ${activeBroadcast.sent}\n` +
                      `• ❌ Fallidos: ${activeBroadcast.failed}\n` +
                      `⏱️ *Duración total:* ${durationFormatted}\n\n` +
                      `_Todos los mensajes fueron enviados con intervalos seguros anti-ban._`;

                await provider.sendMessage(adminPhone, summaryMsg, {});
            } catch (errAdmin) {
                console.error('Error notificando fin de difusión al admin:', errAdmin);
            }
        }

        // Liberar estado
        activeBroadcast = null;
    })();

    return {
        success: true,
        campaignId,
        totalRecipients: totalCount,
        message: `Difusión iniciada a ${totalCount} clientes.`
    };
};

/**
 * Inicializa el servicio de difusión masiva y escucha comandos remotos
 * emitidos desde la UI del Dashboard ('config/bot_broadcast').
 * @param {Object} provider Adapter provider de BuilderBot
 */
export const initBroadcastService = (provider) => {
    providerInstance = provider;
    console.log('📢 [BroadcastService] Servicio de difusión masiva inicializado.');

    if (!db) {
        console.warn('⚠️ [BroadcastService] Firestore db no disponible para listener de difusión.');
        return;
    }

    try {
        const broadcastDocRef = doc(db, 'config', 'bot_broadcast');
        onSnapshot(broadcastDocRef, async (snapshot) => {
            if (!snapshot.exists()) return;
            const data = snapshot.data();
            const action = data?.action;
            const actionTimestamp = data?.actionTimestamp || 0;

            if (!action) return;
            if (actionTimestamp <= lastHandledCommandTimestamp) return;
            lastHandledCommandTimestamp = actionTimestamp;

            console.log(`📡 [BroadcastService] Comando remoto de difusión recibido desde Dashboard: ${action}`);

            if (action === 'START') {
                if (isBroadcasting()) {
                    console.warn('⚠️ [BroadcastService] Ya hay una difusión en ejecución.');
                    return;
                }

                let targetRecipients = [];
                if (Array.isArray(data.selectedRecipients) && data.selectedRecipients.length > 0) {
                    targetRecipients = data.selectedRecipients;
                } else {
                    const all = await getAllUsers();
                    targetRecipients = all.filter(u => u.phone || u.id);
                }

                await startBroadcast({
                    campaignId: data.campaignId || Date.now().toString(),
                    template: data.template || '',
                    mediaUrl: data.mediaUrl || null,
                    recipients: targetRecipients,
                    delaySeconds: data.delaySeconds || 7,
                    initiator: 'DASHBOARD'
                });
            } else if (action === 'CANCEL') {
                await cancelBroadcast();
            }
        }, (err) => {
            console.warn(`⚠️ [BroadcastService] Error en listener de Firestore: ${err.message}`);
        });

        console.log('📡 [BroadcastService] Listener de campañas remotas desde Dashboard activado.');
    } catch (e) {
        console.warn(`⚠️ [BroadcastService] Error configurando listener Firestore: ${e.message}`);
    }
};
