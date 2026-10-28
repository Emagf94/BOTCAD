import fs from 'fs';
import path from 'path';
import { doc, setDoc, onSnapshot, collection, getDocs, query, orderBy, writeBatch } from 'firebase/firestore';
import { db, getAllUsers } from '../firebase.js';
import { resolveClientRealPhone } from '../utils/helpers.js';
import { getWppClient, patchWppMediaPrep } from '../utils/fileHandler.js';

/**
 * Detecta el tipo y extensión del recurso multimedia (imagen, GIF o video)
 * @param {string} targetUrlOrPath 
 * @param {string} [contentType]
 * @returns {{ type: 'video'|'gif'|'image', ext: string, label: string }}
 */
export const classifyMediaType = (targetUrlOrPath, contentType = '') => {
    const clean = (targetUrlOrPath || '').split('?')[0].toLowerCase();
    const ct = (contentType || '').toLowerCase();

    if (clean.endsWith('.mp4') || clean.endsWith('.m4v') || ct.includes('video/mp4')) {
        return { type: 'video', ext: 'mp4', label: 'Video' };
    }
    if (clean.endsWith('.webm') || ct.includes('video/webm')) {
        return { type: 'video', ext: 'webm', label: 'Video' };
    }
    if (clean.endsWith('.mov') || ct.includes('video/quicktime')) {
        return { type: 'video', ext: 'mov', label: 'Video' };
    }
    if (clean.endsWith('.gif') || ct.includes('image/gif')) {
        return { type: 'gif', ext: 'gif', label: 'GIF' };
    }
    if (clean.endsWith('.png') || ct.includes('image/png')) {
        return { type: 'image', ext: 'png', label: 'Flyer' };
    }
    if (clean.endsWith('.webp') || ct.includes('image/webp')) {
        return { type: 'image', ext: 'webp', label: 'Flyer' };
    }
    return { type: 'image', ext: 'jpg', label: 'Flyer' };
};

/**
 * Prepara el recurso multimedia para la difusión descargándolo UNA SOLA VEZ localmente
 * con su extensión y tipo MIME correctos (evita descargas repetidas por cada cliente).
 * @param {string} mediaUrlOrPath 
 * @param {string} campaignId 
 * @returns {Promise<{ localPath: string, isTemp: boolean, type: 'video'|'gif'|'image', label: string }|null>}
 */
export const prepareBroadcastMedia = async (mediaUrlOrPath, campaignId) => {
    if (!mediaUrlOrPath || typeof mediaUrlOrPath !== 'string' || !mediaUrlOrPath.trim()) return null;

    // Caso 1: Archivo ya local en disco
    if (fs.existsSync(mediaUrlOrPath)) {
        const info = classifyMediaType(mediaUrlOrPath);
        return { localPath: mediaUrlOrPath, isTemp: false, type: info.type, label: info.label };
    }

    // Caso 2: URL remota (Firebase Storage, CDN, enlace directo)
    if (mediaUrlOrPath.startsWith('http://') || mediaUrlOrPath.startsWith('https://')) {
        const tempDir = path.resolve('./temp_broadcast');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        try {
            console.log(`📥 [BroadcastService] Pre-descargando recurso multimedia para la campaña...`);
            const response = await fetch(mediaUrlOrPath);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type') || '';
            const mediaInfo = classifyMediaType(mediaUrlOrPath, contentType);
            const fileName = `broadcast_${campaignId}_${Date.now()}.${mediaInfo.ext}`;
            const localPath = path.join(tempDir, fileName);

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            fs.writeFileSync(localPath, buffer);

            const sizeMb = (buffer.length / (1024 * 1024)).toFixed(2);
            console.log(`✅ [BroadcastService] Multimedia descargada con éxito: ${fileName} (${sizeMb} MB, Tipo: ${mediaInfo.type.toUpperCase()})`);

            return { localPath, isTemp: true, type: mediaInfo.type, label: mediaInfo.label };
        } catch (err) {
            console.warn(`⚠️ [BroadcastService] Error al pre-descargar multimedia remota:`, err.message);
            const info = classifyMediaType(mediaUrlOrPath);
            return { localPath: mediaUrlOrPath, isTemp: false, type: info.type, label: info.label };
        }
    }

    return null;
};

/**
 * Reensambla un archivo multimedia subido en fragmentos a Firestore ('config/bot_broadcast/chunks')
 * y lo guarda en disco en ./temp_broadcast
 * @param {string} campaignId
 * @param {object} attachmentMeta { name, type, ext, size, totalChunks }
 * @returns {Promise<{ localPath: string, isTemp: boolean, type: 'video'|'gif'|'image', label: string, fileName: string }|null>}
 */
export const assembleMediaFromFirestoreChunks = async (campaignId, attachmentMeta) => {
    if (!db || !attachmentMeta) return null;
    const tempDir = path.resolve('./temp_broadcast');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    try {
        console.log(`📦 [BroadcastService] Reensamblando archivo multimedia local (${attachmentMeta.name}, ${attachmentMeta.totalChunks} fragmentos)...`);
        const chunksCol = collection(db, 'config', 'bot_broadcast', 'chunks');
        const q = query(chunksCol, orderBy('chunkIndex', 'asc'));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            console.warn('⚠️ [BroadcastService] No se encontraron fragmentos en Firestore para reensamblar.');
            return null;
        }

        const chunks = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            chunks.push({ index: data.chunkIndex, data: data.data });
        });

        chunks.sort((a, b) => a.index - b.index);
        const fullBase64 = chunks.map(c => c.data).join('');
        const buffer = Buffer.from(fullBase64, 'base64');

        const safeExt = attachmentMeta.ext || (attachmentMeta.type === 'video' ? 'mp4' : (attachmentMeta.type === 'gif' ? 'gif' : 'jpg'));
        const cleanBase = path.parse(attachmentMeta.name || `media_${campaignId}`).name.replace(/[^\w.-]/g, '_');
        const fileName = `broadcast_${campaignId}_${cleanBase}.${safeExt}`;
        const localPath = path.join(tempDir, fileName);

        fs.writeFileSync(localPath, buffer);
        console.log(`✅ [BroadcastService] Archivo multimedia reensamblado: ${fileName} (${(buffer.length / (1024 * 1024)).toFixed(2)} MB, Tipo: ${attachmentMeta.type.toUpperCase()})`);

        // Limpieza de fragmentos en Firestore de fondo
        (async () => {
            try {
                const batch = writeBatch(db);
                snapshot.forEach(docSnap => {
                    batch.delete(docSnap.ref);
                });
                await batch.commit();
                console.log(`🧹 [BroadcastService] Fragmentos temporales eliminados de Firestore.`);
            } catch (errClean) {
                console.warn(`⚠️ [BroadcastService] Error al limpiar fragmentos en Firestore:`, errClean.message);
            }
        })();

        const info = classifyMediaType(localPath);
        return {
            localPath,
            isTemp: true,
            type: attachmentMeta.type || info.type,
            label: info.label,
            fileName: attachmentMeta.name || fileName
        };
    } catch (e) {
        console.error('❌ [BroadcastService] Error reensamblando archivo desde Firestore:', e);
        return null;
    }
};

/**
 * Envía un mensaje multimedia personalizado a través de los métodos nativos de WPPConnect
 * adaptados específicamente para Videos con reproductor interactivo, GIFs animados e Imágenes.
 * @param {object} provider Instancia del proveedor
 * @param {object} client Instancia del cliente WPPConnect nativo
 * @param {string} recipientJid JID del cliente (ej. 573184849332@c.us)
 * @param {string} filePath Ruta local del archivo
 * @param {'video'|'gif'|'image'} mediaType Tipo clasificado del archivo
 * @param {string} fileName Nombre original del archivo
 * @param {string} caption Mensaje personalizado
 * @returns {Promise<{ success: boolean, method: string }>}
 */
export const sendBroadcastMediaMessage = async (provider, client, recipientJid, filePath, mediaType, fileName, caption) => {
    const displayName = fileName || path.basename(filePath);
    const resolvedType = mediaType || classifyMediaType(filePath).type;

    // 1. VIDEOS (MP4, WEBM, MOV, M4V)
    // Se envía como video nativo para que WhatsApp muestre la miniatura, controles de play/pause y sonido.
    if (resolvedType === 'video') {
        if (client && typeof client.sendFile === 'function') {
            try {
                await client.sendFile(recipientJid, filePath, {
                    filename: displayName,
                    caption: caption || '',
                    type: 'video',
                    waitForAck: false
                });
                return { success: true, method: 'client.sendFile:video' };
            } catch (errVideoOpt) {
                console.warn(`⚠️ [BroadcastMedia] client.sendFile (options) falló: ${errVideoOpt.message}. Probando llamada posicional...`);
                try {
                    await client.sendFile(recipientJid, filePath, displayName, caption || '');
                    return { success: true, method: 'client.sendFile:positional' };
                } catch (errVideoPos) {
                    console.warn(`⚠️ [BroadcastMedia] client.sendFile (posicional) falló: ${errVideoPos.message}`);
                }
            }
        }
    }

    // 2. GIF ANIMADO
    // En WhatsApp Web los gifs se despachan con sendVideoAsGif o sendFile con tipo auto-detect
    if (resolvedType === 'gif') {
        if (client && typeof client.sendVideoAsGif === 'function') {
            try {
                await client.sendVideoAsGif(recipientJid, filePath, displayName || 'animacion.gif', caption || '');
                return { success: true, method: 'client.sendVideoAsGif' };
            } catch (errGif) {
                console.warn(`⚠️ [BroadcastMedia] client.sendVideoAsGif falló: ${errGif.message}. Probando sendFile...`);
            }
        }
        if (client && typeof client.sendFile === 'function') {
            try {
                await client.sendFile(recipientJid, filePath, displayName || 'animacion.gif', caption || '');
                return { success: true, method: 'client.sendFile:gif' };
            } catch (errGifFile) {
                console.warn(`⚠️ [BroadcastMedia] client.sendFile para GIF falló: ${errGifFile.message}`);
            }
        }
    }

    // 3. IMÁGENES FLYER (JPG, PNG, WEBP)
    if (resolvedType === 'image') {
        if (client && typeof client.sendImage === 'function') {
            try {
                await client.sendImage(recipientJid, filePath, displayName, caption || '');
                return { success: true, method: 'client.sendImage' };
            } catch (errImg) {
                console.warn(`⚠️ [BroadcastMedia] client.sendImage falló: ${errImg.message}. Probando sendFile...`);
            }
        }
        if (client && typeof client.sendFile === 'function') {
            try {
                await client.sendFile(recipientJid, filePath, displayName, caption || '');
                return { success: true, method: 'client.sendFile:image' };
            } catch (errImgFile) {
                console.warn(`⚠️ [BroadcastMedia] client.sendFile para imagen falló: ${errImgFile.message}`);
            }
        }
    }

    // 4. Fallback al proveedor base de BuilderBot si estuviera disponible
    if (provider && typeof provider.sendMessage === 'function') {
        await provider.sendMessage(recipientJid, caption || '', { media: filePath });
        return { success: true, method: 'provider.sendMessage:media' };
    }

    throw new Error('No se encontró ningún método de entrega multimedia disponible en el cliente');
};

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
 * evitando el uso accidental de LIDs.
 * @param {string|object} phone 
 * @returns {string|null}
 */
export const normalizeRecipientJid = (phone) => {
    if (!phone) return null;
    const resolved = resolveClientRealPhone(phone);
    if (resolved.isValid && resolved.jid) {
        return resolved.jid;
    }
    return null;
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
    const resolved = resolveClientRealPhone(client);
    const phone = resolved.isValid ? resolved.rawDigits : (client.phone || client.id || '').trim();
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
    hasLocalAttachment = false,
    attachmentMeta = null,
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
        hasLocalAttachment,
        attachmentMeta,
        initiator,
        adminPhone,
        logs: []
    };

    console.log(`🚀 [BroadcastService] Iniciando difusión "${campaignId}" a ${totalCount} destinatarios (Iniciado por: ${initiator}, Adjunto local: ${hasLocalAttachment ? 'SÍ' : 'NO'})...`);

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
                hasMedia: !!(mediaTarget || hasLocalAttachment),
                mediaUrl: mediaUrl || (hasLocalAttachment ? (attachmentMeta?.name || 'media_local') : (mediaPath ? 'media_local' : null)),
                hasLocalAttachment: !!hasLocalAttachment,
                attachmentMeta: attachmentMeta || null,
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

        // Pre-descargar o reensamblar multimedia una sola vez antes de la difusión
        let preparedMedia = null;
        if (hasLocalAttachment && attachmentMeta) {
            try {
                preparedMedia = await assembleMediaFromFirestoreChunks(campaignId, attachmentMeta);
            } catch (eChunk) {
                console.warn('⚠️ [BroadcastService] Error al reensamblar fragmentos locales de Firestore:', eChunk.message);
            }
        } else if (mediaTarget) {
            try {
                preparedMedia = await prepareBroadcastMedia(mediaTarget, campaignId);
            } catch (eMediaPrep) {
                console.warn('⚠️ [BroadcastService] No se pudo pre-descargar multimedia:', eMediaPrep.message);
            }
        }

        const effectiveMediaTarget = preparedMedia?.localPath || mediaTarget;
        const mediaType = preparedMedia?.type || (effectiveMediaTarget ? classifyMediaType(effectiveMediaTarget).type : 'image');
        const mediaTypeLabel = preparedMedia?.label || (mediaType === 'video' ? 'Video' : mediaType === 'gif' ? 'GIF' : 'Flyer');
        const mediaFileName = preparedMedia?.fileName || (effectiveMediaTarget ? path.basename(effectiveMediaTarget) : '');

        // Asegurar que WhatsApp Web tenga inyectado el parche preventivo de MediaPrep antes de iniciar envíos
        let resolvedClient = null;
        try {
            resolvedClient = await getWppClient(provider);
            if (resolvedClient) {
                const patched = await patchWppMediaPrep(resolvedClient);
                console.log(`🧩 [BroadcastService] Verificación de parche MediaPrep: ${patched ? 'ACTIVO' : 'NO_REQUERIDO'}`);
            }
        } catch (ePatch) {
            console.warn('⚠️ [BroadcastService] Verificación de parche MediaPrep falló:', ePatch.message);
        }

        for (let i = 0; i < finalRecipients.length; i++) {
            if (activeBroadcast.shouldCancel) {
                console.log(`🛑 [BroadcastService] Envío masivo cancelado en el destinatario ${i + 1}/${totalCount}`);
                break;
            }

            const recipient = finalRecipients[i];
            const resolved = resolveClientRealPhone(recipient);

            if (!resolved.isValid || !resolved.jid) {
                activeBroadcast.failed++;
                const failDisplay = resolved.displayPhone || recipient.phone || recipient.id || 'N/A';
                const failReason = resolved.reason || 'Sin número telefónico válido';
                activeBroadcast.logs.unshift({
                    time: new Date().toLocaleTimeString('es-CO'),
                    name: recipient.name || 'Cliente',
                    phone: failDisplay,
                    status: 'ERROR',
                    error: failReason
                });
                console.warn(`⚠️ [BroadcastService] [${i + 1}/${totalCount}] Omitido ${recipient.name || 'Cliente'} (${failDisplay}): ${failReason}`);
                continue;
            }

            const recipientJid = resolved.jid;
            const displayPhone = resolved.displayPhone;
            const personalizedMessage = interpolateVariables(template, recipient);

            try {
                if (effectiveMediaTarget) {
                    try {
                        await sendBroadcastMediaMessage(
                            provider,
                            resolvedClient,
                            recipientJid,
                            effectiveMediaTarget,
                            mediaType,
                            mediaFileName,
                            personalizedMessage
                        );
                    } catch (mediaErr) {
                        console.warn(`⚠️ [BroadcastService] Error al enviar con multimedia a ${displayPhone} (${mediaErr.message}). Reintentando con texto seguro...`);
                        
                        // Re-aplicar parche preventivo en caso de recarga de sesión de WhatsApp Web
                        try {
                            if (resolvedClient) await patchWppMediaPrep(resolvedClient);
                        } catch (_) {}

                        // Fallback a solo texto (adjuntando enlace original si era URL en la nube)
                        let fallbackMessage = personalizedMessage;
                        if (typeof mediaTarget === 'string' && mediaTarget.startsWith('http')) {
                            const icon = mediaType === 'video' ? '🎬' : mediaType === 'gif' ? '✨' : '🖼️';
                            fallbackMessage += `\n\n${icon} *${mediaTypeLabel} adjunto:* ${mediaTarget}`;
                        }
                        await provider.sendMessage(recipientJid, fallbackMessage, {});
                    }
                } else {
                    await provider.sendMessage(recipientJid, personalizedMessage, {});
                }

                activeBroadcast.sent++;
                activeBroadcast.logs.unshift({
                    time: new Date().toLocaleTimeString('es-CO'),
                    name: recipient.name || 'Cliente',
                    phone: displayPhone,
                    status: 'SUCCESS'
                });
                console.log(`📤 [BroadcastService] [${i + 1}/${totalCount}] Enviado a ${recipient.name || 'Cliente'} (${displayPhone}) [${effectiveMediaTarget ? mediaType.toUpperCase() : 'TEXTO'}]`);
            } catch (err) {
                activeBroadcast.failed++;
                activeBroadcast.logs.unshift({
                    time: new Date().toLocaleTimeString('es-CO'),
                    name: recipient.name || 'Cliente',
                    phone: displayPhone,
                    status: 'ERROR',
                    error: err.message
                });
                console.warn(`⚠️ [BroadcastService] Falló envío a ${displayPhone}: ${err.message}`);
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

        // Limpieza de archivo temporal si fue descargado de la nube
        if (preparedMedia?.isTemp && preparedMedia?.localPath && fs.existsSync(preparedMedia.localPath)) {
            try {
                fs.unlinkSync(preparedMedia.localPath);
                console.log(`🧹 [BroadcastService] Archivo temporal multimedia eliminado.`);
            } catch (eClean) {
                console.warn(`⚠️ [BroadcastService] No se pudo eliminar archivo temporal:`, eClean.message);
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
                    hasLocalAttachment: !!data.hasLocalAttachment,
                    attachmentMeta: data.attachmentMeta || null,
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
