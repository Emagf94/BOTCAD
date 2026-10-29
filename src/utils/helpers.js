import fs from 'fs';
import path from 'path';
import { BOT_SETTINGS, BOT_MEDIA, BOT_ADVISORS, BOT_SCHEDULE, DEFAULT_SCHEDULE, getAdvisorName } from '../botConfig.js';
import { getUser, saveUser } from '../firebase.js';
import { isAdmin as authIsAdmin } from '../services/advisorAuthService.js';
import {
    getWppClient,
    patchWppMediaPrep,
    extractFileMetadata,
    extractCloudLinks,
    serializeMessageId,
    downloadAndSaveIncomingFile,
    deliverFileToRecipient,
    deliverFilePackageToAdmin,
    createZipArchive,
    sendZipFileToRecipient,
    deliverOrderFilesWithZip,
    normalizeAdminJids,
    PRODUCTION_FILES_JID,
    CAD_EXTENSIONS,
    SPECIAL_EXTENSIONS
} from './fileHandler.js';

// ==========================================
// ESTADOS GLOBALES EN MEMORIA
// ==========================================

/**
 * Cache en memoria para almacenar las rutas de los archivos recibidos temporalmente
 * durante el flujo de recepción de archivos o envío directo.
 */
export const globalFilesCache = new Map();

/**
 * Mapa de chats activos entre administradores y clientes en el modo soporte (!chatear / !atender).
 * Relaciona: adminPhone <-> clientPhone y viceversa.
 */
export const activeBridgeChats = new Map();

/**
 * Cola de espera de clientes que han solicitado soporte con un asesor humano.
 */
export const pendingSupportQueue = [];

/**
 * Detalles asociados a cada cliente en cola de soporte (asunto, nombre, teléfono real, etc.).
 * Relaciona: clientJid -> { asunto, name, phone, timestamp }
 */
export const pendingSupportDetails = new Map();

/**
 * Busca de forma flexible si un remitente (asesor o cliente) tiene un chat activo de soporte.
 * Compara por coincidencia exacta, ID normalizado de dígitos o inclusión de cadenas, evitando
 * desconexiones por discordancias entre @s.whatsapp.net, @c.us o LIDs.
 * @param {string} fromOrJid
 * @returns {string|null} JID del interlocutor o null
 */
export const findActiveBridge = (fromOrJid) => {
    if (!fromOrJid) return null;
    const raw = String(fromOrJid);

    // 1. Coincidencia directa
    if (activeBridgeChats.has(raw)) {
        return activeBridgeChats.get(raw);
    }

    // 2. Coincidencia por dígitos limpios
    const cleanFrom = raw.split('@')[0].replace(/\D/g, '');
    if (cleanFrom && activeBridgeChats.has(cleanFrom)) {
        return activeBridgeChats.get(cleanFrom);
    }

    // 3. Búsqueda profunda en las claves del mapa
    for (const [key, val] of activeBridgeChats.entries()) {
        const cleanKey = String(key).split('@')[0].replace(/\D/g, '');
        if (cleanFrom && cleanKey && (cleanKey === cleanFrom || key.includes(cleanFrom) || raw.includes(cleanKey))) {
            return val;
        }
    }

    return null;
};

/**
 * Elimina la asociación bidireccional de un chat activo de soporte.
 * @param {string} fromOrJid
 */
export const removeActiveBridge = (fromOrJid) => {
    if (!fromOrJid) return;
    const partner = findActiveBridge(fromOrJid);
    const raw = String(fromOrJid);
    const cleanFrom = raw.split('@')[0].replace(/\D/g, '');

    activeBridgeChats.delete(raw);
    if (cleanFrom) activeBridgeChats.delete(cleanFrom);

    if (partner) {
        const partnerRaw = String(partner);
        const partnerClean = partnerRaw.split('@')[0].replace(/\D/g, '');
        activeBridgeChats.delete(partnerRaw);
        if (partnerClean) activeBridgeChats.delete(partnerClean);
    }

    for (const [key, val] of Array.from(activeBridgeChats.entries())) {
        const cleanKey = String(key).split('@')[0].replace(/\D/g, '');
        if ((cleanFrom && cleanKey === cleanFrom) || (partner && String(val).includes(cleanFrom))) {
            activeBridgeChats.delete(key);
        }
    }
};

/**
 * Envía la imagen de métodos de pago de forma segura sin riesgo de congelar el bot.
 * Utiliza ruta absoluta con path.resolve y fallback controlado a mensaje de texto si la multimedia falla.
 * @param {object} provider Instancia del proveedor BuilderBot
 * @param {string} jid Destinatario
 * @param {string} caption Mensaje o pie de foto
 * @returns {Promise<boolean>} true si se envió la imagen, false si se usó fallback de texto
 */
export const safeSendPaymentMedia = async (provider, jid, caption = '') => {
    try {
        const qrPath = path.resolve(process.cwd(), './assets/qr_pagos.png');
        if (!fs.existsSync(qrPath)) {
            console.warn(`⚠️ [safeSendPaymentMedia] Archivo QR no encontrado en: ${qrPath}`);
            if (caption) await provider.sendMessage(jid, caption, {});
            return false;
        }

        if (BOT_MEDIA && BOT_MEDIA.sendPaymentQR === false) {
            if (caption) await provider.sendMessage(jid, caption, {});
            return true;
        }

        const client = await getWppClient(provider);
        if (client) await patchWppMediaPrep(client);
        let sent = false;

        // Estrategia 1: sendImage de WPPConnect (método nativo ideal para imágenes png)
        if (client && typeof client.sendImage === 'function') {
            try {
                await client.sendImage(jid, qrPath, 'qr_pagos.png', caption || '');
                sent = true;
                console.log(`✅ [safeSendPaymentMedia] QR enviado exitosamente vía client.sendImage a ${jid}`);
            } catch (e2) {
                console.warn(`⚠️ [safeSendPaymentMedia] client.sendImage falló: ${e2.message}`);
            }
        }

        // Estrategia 2: sendFile de WPPConnect con firma posicional tradicional
        if (!sent && client && typeof client.sendFile === 'function') {
            try {
                await client.sendFile(jid, qrPath, 'qr_pagos.png', caption || '');
                sent = true;
                console.log(`✅ [safeSendPaymentMedia] QR enviado exitosamente vía client.sendFile (posicional) a ${jid}`);
            } catch (e1b) {
                console.warn(`⚠️ [safeSendPaymentMedia] client.sendFile (posicional) falló: ${e1b.message}`);
                try {
                    await client.sendFile(jid, qrPath, {
                        filename: 'qr_pagos.png',
                        caption: caption || '',
                        waitForAck: false
                    });
                    sent = true;
                    console.log(`✅ [safeSendPaymentMedia] QR enviado exitosamente vía client.sendFile (options) a ${jid}`);
                } catch (e1) {
                    console.warn(`⚠️ [safeSendPaymentMedia] client.sendFile (options) falló: ${e1.message}`);
                }
            }
        }

        // Estrategia 3: provider.sendMessage con { media } (forma estándar BuilderBot)
        if (!sent && provider && typeof provider.sendMessage === 'function') {
            try {
                await provider.sendMessage(jid, caption || '', { media: qrPath });
                sent = true;
                console.log(`✅ [safeSendPaymentMedia] QR enviado exitosamente vía provider.sendMessage (media) a ${jid}`);
            } catch (eMedia) {
                console.warn(`⚠️ [safeSendPaymentMedia] provider.sendMessage (media) falló: ${eMedia.message}`);
            }
        }

        // Estrategia 4: provider.sendMedia
        if (!sent && provider && typeof provider.sendMedia === 'function') {
            try {
                await provider.sendMedia(jid, qrPath, caption || '');
                sent = true;
                console.log(`✅ [safeSendPaymentMedia] QR enviado exitosamente vía provider.sendMedia a ${jid}`);
            } catch (e3) {
                console.warn(`⚠️ [safeSendPaymentMedia] provider.sendMedia falló: ${e3.message}`);
            }
        }

        // Fallback si no se pudo enviar multimedia
        if (!sent) {
            console.warn(`⚠️ [safeSendPaymentMedia] No se pudo enviar imagen QR, enviando texto alternativo a ${jid}`);
            if (caption) await provider.sendMessage(jid, caption, {});
        }
        return sent;
    } catch (err) {
        console.error(`❌ [safeSendPaymentMedia] Excepción inesperada:`, err);
        if (caption) {
            try { await provider.sendMessage(jid, caption, {}); } catch (e) {}
        }
        return false;
    }
};

/**
 * Envía la imagen de logo de saludo de forma segura sin riesgo de congelar el bot ni lanzar excepciones en flowDynamic.
 * Prioriza el envío de logo.png como STICKER según la preferencia del usuario.
 * Utiliza ruta absoluta con path.resolve y fallback controlado a mensaje de texto si la multimedia falla.
 * @param {object} provider Instancia del proveedor BuilderBot
 * @param {string} jid Destinatario
 * @param {string} caption Mensaje o pie de foto
 * @returns {Promise<boolean>} true si se envió la imagen/sticker, false si se usó fallback de texto
 */
export const safeSendLogo = async (provider, jid, caption = '') => {
    try {
        const logoPath = path.resolve(process.cwd(), './assets/logo.png');
        if (!fs.existsSync(logoPath)) {
            console.warn(`⚠️ [safeSendLogo] Archivo logo no encontrado en: ${logoPath}`);
            if (caption) await provider.sendMessage(jid, caption, {});
            return false;
        }

        if (BOT_MEDIA && BOT_MEDIA.sendLogo === false) {
            if (caption) await provider.sendMessage(jid, caption, {});
            return true;
        }

        const client = await getWppClient(provider);
        if (client) await patchWppMediaPrep(client);
        let sent = false;

        // Estrategia 1: Enviar como STICKER (Solicitud del usuario para logo.png en bienvenida)
        if (BOT_MEDIA?.sendStickers !== false && client && typeof client.sendImageAsSticker === 'function') {
            try {
                await client.sendImageAsSticker(jid, logoPath);
                sent = true;
                console.log(`✅ [safeSendLogo] Logo enviado como STICKER exitosamente a ${jid}`);
                // En WhatsApp los stickers no llevan pie de foto (caption), enviamos el texto de bienvenida a continuación
                if (caption) {
                    await new Promise(r => setTimeout(r, 600));
                    await provider.sendMessage(jid, caption, {});
                }
                return true;
            } catch (errSticker) {
                console.warn(`⚠️ [safeSendLogo] Envío como sticker falló: ${errSticker.message}. Intentando envío como imagen...`);
            }
        }

        // Estrategia 2: sendImage de WPPConnect (imagen regular con pie de foto)
        if (!sent && client && typeof client.sendImage === 'function') {
            try {
                await client.sendImage(jid, logoPath, 'logo.png', caption || '');
                sent = true;
                console.log(`✅ [safeSendLogo] Logo enviado exitosamente vía client.sendImage a ${jid}`);
            } catch (eImg) {
                console.warn(`⚠️ [safeSendLogo] client.sendImage falló: ${eImg.message}`);
            }
        }

        // Estrategia 3: sendFile de WPPConnect (posicional primero)
        if (!sent && client && typeof client.sendFile === 'function') {
            try {
                await client.sendFile(jid, logoPath, 'logo.png', caption || '');
                sent = true;
                console.log(`✅ [safeSendLogo] Logo enviado exitosamente vía client.sendFile (posicional) a ${jid}`);
            } catch (e1b) {
                console.warn(`⚠️ [safeSendLogo] client.sendFile (posicional) falló: ${e1b.message}`);
                try {
                    await client.sendFile(jid, logoPath, {
                        filename: 'logo.png',
                        caption: caption || '',
                        waitForAck: false
                    });
                    sent = true;
                    console.log(`✅ [safeSendLogo] Logo enviado exitosamente vía client.sendFile (options) a ${jid}`);
                } catch (e1) {
                    console.warn(`⚠️ [safeSendLogo] client.sendFile (options) falló: ${e1.message}`);
                }
            }
        }

        // Estrategia 4: provider.sendMessage con { media }
        if (!sent && provider && typeof provider.sendMessage === 'function') {
            try {
                await provider.sendMessage(jid, caption || '', { media: logoPath });
                sent = true;
                console.log(`✅ [safeSendLogo] Logo enviado exitosamente vía provider.sendMessage (media) a ${jid}`);
            } catch (eMedia) {
                console.warn(`⚠️ [safeSendLogo] provider.sendMessage (media) falló: ${eMedia.message}`);
            }
        }

        // Estrategia 5: provider.sendMedia como respaldo
        if (!sent && provider && typeof provider.sendMedia === 'function') {
            try {
                await provider.sendMedia(jid, logoPath, caption || '');
                sent = true;
                console.log(`✅ [safeSendLogo] Logo enviado exitosamente vía provider.sendMedia a ${jid}`);
            } catch (e2) {
                console.warn(`⚠️ [safeSendLogo] provider.sendMedia falló: ${e2.message}`);
            }
        }

        // Fallback si no se pudo enviar multimedia
        if (!sent) {
            console.warn(`⚠️ [safeSendLogo] No se pudo enviar imagen de logo, enviando texto alternativo a ${jid}`);
            if (caption) await provider.sendMessage(jid, caption, {});
        }
        return sent;
    } catch (err) {
        console.error(`❌ [safeSendLogo] Excepción inesperada:`, err);
        if (caption) {
            try { await provider.sendMessage(jid, caption, {}); } catch (e) {}
        }
        return false;
    }
};

/**
 * Envía un sticker de forma segura verificando el parche de MediaPrep y con fallback a imagen.
 * Evita excepciones no capturadas o bloqueos en el flujo conversacional del usuario.
 * @param {object} provider Proveedor BuilderBot
 * @param {string} jid Destinatario
 * @param {string} stickerPath Ruta local del sticker (webp o png)
 * @returns {Promise<boolean>}
 */
export const safeSendSticker = async (provider, jid, stickerPath) => {
    if (!jid || !stickerPath) return false;
    const resolvedPath = path.resolve(process.cwd(), stickerPath);
    if (!fs.existsSync(resolvedPath)) {
        console.warn(`⚠️ [safeSendSticker] Archivo de sticker no encontrado: ${resolvedPath}`);
        return false;
    }

    try {
        const client = await getWppClient(provider);
        if (client) await patchWppMediaPrep(client);

        if (client && typeof client.sendImageAsSticker === 'function') {
            await client.sendImageAsSticker(jid, resolvedPath);
            return true;
        }

        if (client && typeof client.sendImage === 'function') {
            await client.sendImage(jid, resolvedPath, path.basename(resolvedPath), '');
            return true;
        }

        if (provider && typeof provider.sendMedia === 'function') {
            await provider.sendMedia(jid, resolvedPath, '');
            return true;
        }
    } catch (err) {
        console.warn(`⚠️ [safeSendSticker] Envío de sticker no completado (${err.message}). Continuando flujo normalmente.`);
    }
    return false;
};

// ==========================================
/**
 * Verifica si un remitente o contexto de mensaje corresponde a un administrador o asesor autorizado.
 * Consulta en tiempo real la lista sincronizada de asesores (BOT_ADVISORS) y los escapes de emergencia.
 * Soporta números directos, IDs con sufijo @c.us, y LIDs de WhatsApp (@lid).
 * @param {string|object} fromOrCtx - Identificador del remitente o contexto del mensaje (ctx)
 * @returns {boolean} true si es administrador o asesor con permisos de comandos
 */
export const isAdmin = (fromOrCtx) => {
    return authIsAdmin(fromOrCtx);
    if (!fromOrCtx) return false;
    
    let candidates = [];
    if (typeof fromOrCtx === 'string') {
        candidates.push(fromOrCtx);
    } else if (typeof fromOrCtx === 'object') {
        if (fromOrCtx.from) candidates.push(fromOrCtx.from);
        if (fromOrCtx.author) candidates.push(fromOrCtx.author);
        if (fromOrCtx.sender?.id) candidates.push(fromOrCtx.sender.id);
        if (fromOrCtx.sender?.phone) candidates.push(fromOrCtx.sender.phone);
        if (fromOrCtx._data?.from) candidates.push(fromOrCtx._data.from);
        if (fromOrCtx._data?.author) candidates.push(fromOrCtx._data.author);
        if (fromOrCtx._data?.id?.participant) candidates.push(fromOrCtx._data.id.participant);
        if (fromOrCtx._data?.id?.remote) candidates.push(fromOrCtx._data.id.remote);
        if (fromOrCtx.key?.remoteJid) candidates.push(fromOrCtx.key.remoteJid);
        if (fromOrCtx.key?.participant) candidates.push(fromOrCtx.key.participant);
    }
    
    if (candidates.length === 0) return false;

    // Normalizar dígitos de todos los candidatos del remitente
    const candidateDigits = candidates
        .map(c => String(c).split('@')[0].replace(/\D/g, ''))
        .filter(Boolean);

    // 1. Verificación contra la lista sincronizada de asesores (BOT_ADVISORS)
    if (Array.isArray(BOT_ADVISORS)) {
        for (const adv of BOT_ADVISORS) {
            // Verificar si el asesor está activo y tiene permisos de comando habilitados
            if (adv.active === false || adv.canExecuteCommands === false) continue;

            const advPhone = String(adv.phone || '').replace(/\D/g, '');
            const advLid = String(adv.lid || '').replace(/\D/g, '');

            for (const cand of candidateDigits) {
                if (advLid && (cand === advLid || cand.includes(advLid) || advLid.includes(cand))) {
                    return true;
                }
                if (advPhone) {
                    if (cand === advPhone || cand.endsWith(advPhone) || advPhone.endsWith(cand)) {
                        return true;
                    }
                    // Manejo Colombia 10 <-> 12 dígitos
                    if (advPhone.length === 10 && cand === `57${advPhone}`) return true;
                    if (advPhone.length === 12 && advPhone.startsWith('57') && cand === advPhone.substring(2)) return true;
                    if (cand.length === 10 && advPhone === `57${cand}`) return true;
                    if (cand.length === 12 && cand.startsWith('57') && advPhone === cand.substring(2)) return true;
                }
            }
        }
    }

    // 2. Respaldo contra escapes y teléfonos en BOT_SETTINGS
    let escapes = BOT_SETTINGS.adminEscapes || [];
    if (!Array.isArray(escapes)) {
        if (typeof escapes === 'string') escapes = escapes.split(',').map(s => s.trim());
        else escapes = [String(escapes)];
    }

    const dynamicPhones = [
        ...(typeof BOT_SETTINGS.adminSupportPhone === 'string' ? BOT_SETTINGS.adminSupportPhone.split(',') : []),
        ...(typeof BOT_SETTINGS.adminOrdersPhone === 'string' ? BOT_SETTINGS.adminOrdersPhone.split(',') : [])
    ]
        .map(s => s.trim().replace('@c.us', '').replace('@lid', '').replace(/\D/g, ''))
        .filter(Boolean);
    
    // Lista segura de respaldo inmutable
    const finalAdmins = [
        ...escapes,
        ...dynamicPhones,
        '573184849332',
        '235780886794250',
        '573135363218',
        '3135363218',
        '13770403381354',
        '573136303477',
        '3136303477'
    ];
    
    return candidateDigits.some(cand => finalAdmins.some(admin => {
        const cleanAdmin = String(admin).replace(/\D/g, '');
        if (!cleanAdmin) return false;
        if (cand === cleanAdmin || cand.endsWith(cleanAdmin) || cleanAdmin.endsWith(cand)) return true;
        if (cleanAdmin.length === 10 && cand === `57${cleanAdmin}`) return true;
        if (cleanAdmin.length === 12 && cleanAdmin.startsWith('57') && cand === cleanAdmin.substring(2)) return true;
        return false;
    })) || candidates.some(cand => finalAdmins.some(admin => String(cand).includes(admin)));
};

/**
 * Extrae y valida el número telefónico celular real de un cliente.
 * Detecta números colombianos (10 dígitos o 12 con prefijo 57), limpia textos
 * y diferencia claramente entre un teléfono real y un LID (14-16 dígitos) o un @usuario.
 * 
 * @param {Object|string} client Objeto de cliente de Firestore o string con teléfono/LID
 * @returns {{
 *   isValid: boolean,
 *   rawDigits: string,
 *   formattedPhone: string,
 *   jid: string|null,
 *   displayPhone: string,
 *   reason?: string
 * }}
 */
export const resolveClientRealPhone = (client) => {
    if (!client) {
        return { isValid: false, rawDigits: '', formattedPhone: '', jid: null, displayPhone: 'Sin contacto', reason: 'Dato vacío' };
    }

    let realPhoneCandidate = '';
    let contactUserCandidate = '';
    let phoneCandidate = '';
    let idCandidate = '';

    if (typeof client === 'object') {
        realPhoneCandidate = String(client.realPhone || '').trim();
        contactUserCandidate = String(client.contactUser || '').trim();
        phoneCandidate = String(client.phone || '').trim();
        idCandidate = String(client.id || '').trim();
    } else if (typeof client === 'string') {
        contactUserCandidate = client.trim();
    }

    const evaluateDigits = (candidateStr) => {
        if (!candidateStr) return null;
        if (candidateStr.startsWith('@')) {
            const digits = candidateStr.replace(/\D/g, '');
            if (digits.length < 10) return null;
        }

        const digits = candidateStr.replace(/\D/g, '');
        // Teléfono colombiano estándar móvil: 10 dígitos (ej. 3001234567) o 12 dígitos con código de país (573001234567)
        // Los LIDs de WhatsApp tienen 14 o más dígitos (normalmente 15 o 16)
        if (digits.length >= 10 && digits.length <= 13) {
            let normalized = digits;
            if (digits.length === 10) {
                normalized = '57' + digits;
            }
            return {
                rawDigits: digits,
                normalized: normalized
            };
        } else if (digits.length >= 7 && digits.length <= 9) {
            return {
                rawDigits: digits,
                normalized: '57' + digits
            };
        }
        return null;
    };

    let match = evaluateDigits(realPhoneCandidate);
    if (!match) {
        match = evaluateDigits(contactUserCandidate);
    }
    if (!match && phoneCandidate.replace(/\D/g, '').length <= 13) {
        match = evaluateDigits(phoneCandidate);
    }
    if (!match && idCandidate.replace(/\D/g, '').length <= 13) {
        match = evaluateDigits(idCandidate);
    }

    if (match) {
        let display = `+${match.normalized}`;
        if (match.normalized.startsWith('57') && match.normalized.length === 12) {
            const p = match.normalized;
            display = `+57 ${p.slice(2, 5)} ${p.slice(5, 8)} ${p.slice(8)}`;
        }
        return {
            isValid: true,
            rawDigits: match.rawDigits,
            formattedPhone: match.normalized,
            jid: `${match.normalized}@c.us`,
            displayPhone: display
        };
    }

    const isOnlyHandle = contactUserCandidate.startsWith('@') || (typeof client === 'object' && client.contactUser?.startsWith('@'));
    const reason = isOnlyHandle ? 'Sin número celular registrado (solo @usuario)' : 'Sin número celular válido (LID sin teléfono)';
    const displayPhone = isOnlyHandle ? contactUserCandidate : (contactUserCandidate || 'Sin teléfono');

    return {
        isValid: false,
        rawDigits: '',
        formattedPhone: '',
        jid: null,
        displayPhone: displayPhone,
        reason: reason
    };
};

/**
 * Obtiene el nombre y teléfono real formateado de un cliente desde la base de datos o contexto.
 * Evita mostrar LIDs de WhatsApp (como 100923527413828) y no incluye enlaces wa.me.
 * @param {string|object} fromOrId JID, teléfono, LID o contexto del cliente
 * @returns {Promise<{name: string, phone: string}>}
 */
export const getCustomerDisplayInfo = async (fromOrId) => {
    if (!fromOrId) return { name: 'Cliente', phone: '' };

    let raw = '';
    if (typeof fromOrId === 'string') {
        raw = fromOrId;
    } else if (typeof fromOrId === 'object') {
        raw = fromOrId.from || fromOrId.sender?.id || fromOrId.author || '';
    }

    const rawId = String(raw).split('@')[0].trim();
    const cleanDigits = rawId.replace(/\D/g, '');

    let dbName = '';
    let userDoc = null;

    // 1. Intentar consultar en Firestore con el ID exacto
    try {
        userDoc = await getUser(rawId);
        if (!userDoc && cleanDigits && cleanDigits !== rawId) {
            userDoc = await getUser(cleanDigits);
        }
        // Si tiene prefijo 57 de 12 dígitos, intentar también sin el 57
        if (!userDoc && cleanDigits.startsWith('57') && cleanDigits.length === 12) {
            userDoc = await getUser(cleanDigits.substring(2));
        }

        if (userDoc && userDoc.name) {
            dbName = String(userDoc.name).trim();
        }
    } catch (e) {
        console.warn(`⚠️ [getCustomerDisplayInfo] Error al consultar usuario para ${rawId}:`, e.message);
    }

    // 2. Determinar el teléfono limpio a mostrar mediante resolveClientRealPhone
    let finalPhone = '';
    if (userDoc) {
        const resolved = resolveClientRealPhone(userDoc);
        if (resolved.isValid) {
            finalPhone = resolved.displayPhone;
        } else {
            finalPhone = userDoc.contactUser || userDoc.phone || rawId;
        }
    } else {
        const resolved = resolveClientRealPhone(rawId);
        if (resolved.isValid) {
            finalPhone = resolved.displayPhone;
        } else {
            finalPhone = rawId;
        }
    }

    return {
        name: dbName || 'Cliente',
        phone: finalPhone
    };
};

export { getAdvisorName };

/**
 * Evalúa detalladamente la disponibilidad de atención de asesores según el horario configurado,
 * el modo manual activo y el modo de prueba.
 * 
 * @param {object} [options]
 * @param {string|Date} [options.customDate] Fecha u hora personalizada para simulación
 * @param {string} [options.fromPhone] Teléfono del remitente (para evaluar bypass de modo de prueba)
 * @param {boolean} [options.ignoreTestMode] Si es true, ignora el modo de prueba y evalúa el horario estricto
 * @returns {{
 *   isAvailable: boolean,
 *   reason: 'WITHIN_SLOT'|'OUTSIDE_SLOTS'|'DAY_DISABLED'|'ALWAYS_OPEN'|'ALWAYS_CLOSED'|'TEST_MODE_BYPASS',
 *   status: 'available'|'closed',
 *   currentSlot: object|null,
 *   dayName: string,
 *   timezone: string,
 *   evaluatedTime: string,
 *   mode: string
 * }}
 */
export const checkScheduleAvailability = (options = {}) => {
    const {
        customDate = null,
        fromPhone = null,
        ignoreTestMode = false
    } = typeof options === 'object' && options !== null ? options : {};

    const schedule = BOT_SCHEDULE || DEFAULT_SCHEDULE;
    const tz = schedule.timezone || 'America/Bogota';

    // 1. Evaluar si aplica el modo de prueba para este teléfono
    if (!ignoreTestMode && schedule.testMode?.enabled) {
        if (fromPhone) {
            const cleanPhone = String(fromPhone).split('@')[0].replace(/\D/g, '');
            const testPhones = Array.isArray(schedule.testMode.testPhones) ? schedule.testMode.testPhones : [];
            const isTest = testPhones.some(tp => {
                const cleanTp = String(tp).replace(/\D/g, '');
                return cleanTp && (cleanPhone === cleanTp || cleanPhone.endsWith(cleanTp) || cleanTp.endsWith(cleanPhone));
            });

            if (isTest && schedule.testMode.bypassSchedule !== false) {
                return {
                    isAvailable: true,
                    reason: 'TEST_MODE_BYPASS',
                    status: 'available',
                    currentSlot: null,
                    dayName: 'Modo de Prueba (Bypass Activo)',
                    timezone: tz,
                    evaluatedTime: new Date().toLocaleTimeString('es-CO', { timeZone: tz }),
                    mode: 'test_bypass'
                };
            }
        }
    }

    // 2. Modos Forzados Manuales
    if (schedule.mode === 'always_open') {
        return {
            isAvailable: true,
            reason: 'ALWAYS_OPEN',
            status: 'available',
            currentSlot: { start: '00:00', end: '23:59' },
            dayName: 'Siempre Abierto (24/7)',
            timezone: tz,
            evaluatedTime: new Date().toLocaleTimeString('es-CO', { timeZone: tz }),
            mode: 'always_open'
        };
    }

    if (schedule.mode === 'always_closed') {
        return {
            isAvailable: false,
            reason: 'ALWAYS_CLOSED',
            status: 'closed',
            currentSlot: null,
            dayName: 'Cerrado Temporalmente',
            timezone: tz,
            evaluatedTime: new Date().toLocaleTimeString('es-CO', { timeZone: tz }),
            mode: 'always_closed'
        };
    }

    // 3. Evaluación Automática de Horario Semanal
    const dateToCheck = customDate ? new Date(customDate) : new Date();
    const nowInTz = new Date(dateToCheck.toLocaleString("en-US", { timeZone: tz }));
    const day = nowInTz.getDay(); // 0: Domingo, 1: Lunes, ..., 6: Sábado
    const currentMinutes = nowInTz.getHours() * 60 + nowInTz.getMinutes();
    const evaluatedTime = `${String(nowInTz.getHours()).padStart(2, '0')}:${String(nowInTz.getMinutes()).padStart(2, '0')}`;

    const daysConfig = schedule.days || DEFAULT_SCHEDULE.days;
    const dayConfig = daysConfig[day] || { name: 'Día desconocido', enabled: false, slots: [] };

    if (!dayConfig.enabled) {
        return {
            isAvailable: false,
            reason: 'DAY_DISABLED',
            status: 'closed',
            currentSlot: null,
            dayName: dayConfig.name,
            timezone: tz,
            evaluatedTime,
            mode: 'auto'
        };
    }

    const slots = Array.isArray(dayConfig.slots) ? dayConfig.slots : [];
    for (const slot of slots) {
        if (!slot.start || !slot.end) continue;
        const [startH, startM] = slot.start.split(':').map(Number);
        const [endH, endM] = slot.end.split(':').map(Number);
        const startMin = startH * 60 + (startM || 0);
        const endMin = endH * 60 + (endM || 0);

        if (currentMinutes >= startMin && currentMinutes < endMin) {
            return {
                isAvailable: true,
                reason: 'WITHIN_SLOT',
                status: 'available',
                currentSlot: slot,
                dayName: dayConfig.name,
                timezone: tz,
                evaluatedTime,
                mode: 'auto'
            };
        }
    }

    return {
        isAvailable: false,
        reason: 'OUTSIDE_SLOTS',
        status: 'closed',
        currentSlot: null,
        dayName: dayConfig.name,
        timezone: tz,
        evaluatedTime,
        mode: 'auto'
    };
};

/**
 * Valida si la hora actual está dentro del horario laboral de atención de asesores.
 * Mantiene 100% retrocompatibilidad retornando boolean.
 * Acepta opciones de contexto (ej. { fromPhone: ctx.from }) para verificar modo de prueba.
 * 
 * @param {object|undefined} [options]
 * @returns {boolean} true si el bot debe transferir al cliente a un asesor humano
 */
export const isWorkingHour = (options = {}) => {
    const result = checkScheduleAvailability(options);
    return result.isAvailable;
};

/**
 * Comprueba si un número de teléfono está registrado en la lista de números de prueba de asesores.
 * @param {string} fromPhone 
 * @returns {boolean}
 */
export const isTestPhone = (fromPhone) => {
    if (!fromPhone) return false;
    const schedule = BOT_SCHEDULE || DEFAULT_SCHEDULE;
    if (!schedule.testMode?.enabled) return false;
    const cleanPhone = String(fromPhone).split('@')[0].replace(/\D/g, '');
    const testPhones = Array.isArray(schedule.testMode.testPhones) ? schedule.testMode.testPhones : [];
    return testPhones.some(tp => {
        const cleanTp = String(tp).replace(/\D/g, '');
        return cleanTp && (cleanPhone === cleanTp || cleanPhone.endsWith(cleanTp) || cleanTp.endsWith(cleanPhone));
    });
};

// Re-exportar utilidades de Firebase para acceso centralizado
export { getUser, saveUser };

/**
 * Valida que el contacto sea un teléfono de al menos 10 dígitos o un usuario (@) de al menos 3 letras.
 * @param {string} contactUser 
 * @returns {string|null} Un mensaje de error si es inválido, o null si es válido.
 */
export const validateContactUser = (contactUser) => {
    if (!contactUser) return '❌ El contacto no puede estar vacío.';
    
    if (contactUser.startsWith('@')) {
        const handle = contactUser.substring(1).trim();
        if (handle.length < 3) {
            return '❌ El nombre de usuario debe tener al menos 3 caracteres (sin contar el @). Por favor, intenta de nuevo:';
        }
    } else {
        const digitsOnly = contactUser.replace(/\D/g, '');
        if (digitsOnly.length < 10) {
            return '❌ Por favor, escribe un *número de teléfono válido* de al menos 10 dígitos.';
        }
    }
    return null;
};

/**
 * Valida que el nombre ingresado por el cliente sea un nombre real válido:
 * - No puede estar vacío.
 * - No puede ser ni contener saludos típicos ('hola', 'buenas', 'buenos días', etc.).
 * - No puede contener números.
 * - No puede contener símbolos, emojis ni caracteres especiales (solo letras en español y espacios).
 * - No puede ser una frase larga ni caracteres repetidos (máximo 4 palabras, entre 2 y 50 letras).
 * @param {string} rawName 
 * @returns {string|null} Mensaje de error amigable si es inválido, o null si es válido.
 */
export const validateName = (rawName) => {
    if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
        return '❌ El nombre no puede estar vacío. Por favor, escribe tu nombre:';
    }

    const trimmed = rawName.trim();

    // 1. Normalización para chequeo de saludos (sin acentos, minúsculas)
    const normalized = trimmed
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const cleanForGreetings = normalized.replace(/[^a-z0-9\s]/g, ' ');
    const greetingPattern = /\b(hola|buenas|buenos|buen\s+dia|dias|tardes|noches|hey|ola|saludos|que\s+tal|como\s+estas)\b/i;
    
    if (greetingPattern.test(cleanForGreetings)) {
        return '⚠️ Parece que escribiste un saludo en lugar de tu nombre.\nPor favor, indícanos únicamente tu *nombre* (ejemplo: *Carlos* o *María Gómez*):';
    }

    // 2. Rechazar números
    if (/[0-9]/.test(trimmed)) {
        return '⚠️ Tu nombre no puede contener números.\nPor favor, escribe únicamente tu *nombre real* (ejemplo: *Andrés* o *Laura*):';
    }

    // 3. Rechazar símbolos, puntuación y emojis (solo letras del abecedario español y espacios)
    const validCharsRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/;
    if (!validCharsRegex.test(trimmed)) {
        return '⚠️ Tu nombre no puede contener símbolos, emojis ni signos (@, #, !, emojis, etc.).\nPor favor, escribe tu nombre solo con letras (ejemplo: *Juan Carlos*):';
    }

    // 4. Longitud mínima y máxima
    if (trimmed.length < 2) {
        return '⚠️ El nombre es demasiado corto.\nPor favor, escribe un nombre de al menos 2 letras:';
    }

    if (trimmed.length > 50) {
        return '⚠️ El nombre es demasiado largo.\nPor favor, escribe únicamente tu nombre y apellido (evita textos extensos):';
    }

    // 5. Rechazar spam de caracteres repetidos (ej: 'aaaaa', 'zzzzz')
    const withoutSpaces = trimmed.replace(/\s+/g, '');
    if (/^(.)\1+$/i.test(withoutSpaces) && withoutSpaces.length > 2) {
        return '⚠️ Por favor, ingresa un nombre válido y legible:';
    }

    // 6. Evitar oraciones completas (máximo 4 palabras para nombres y apellidos)
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length > 4) {
        return '⚠️ Por favor, escribe solo tu nombre y apellidos (máximo 4 palabras):';
    }

    return null;
};

/**
 * Normaliza y formatea el nombre en Title Case (ej: "carlos andrés" -> "Carlos Andrés").
 * @param {string} rawName 
 * @returns {string}
 */
export const formatName = (rawName) => {
    if (!rawName) return '';
    return rawName
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

export {
    getWppClient,
    extractFileMetadata,
    extractCloudLinks,
    serializeMessageId,
    downloadAndSaveIncomingFile,
    deliverFileToRecipient,
    deliverFilePackageToAdmin,
    createZipArchive,
    sendZipFileToRecipient,
    deliverOrderFilesWithZip,
    normalizeAdminJids,
    PRODUCTION_FILES_JID,
    CAD_EXTENSIONS,
    SPECIAL_EXTENSIONS
};

/**
 * Sanitiza la ruta de un archivo descargado, corrigiendo extensiones incorrectas (.false, .bin)
 * usando el nombre original del documento en el contexto de WPPConnect/Baileys y Magic Bytes.
 * @param {string} filePath La ruta local del archivo descargado
 * @param {object} ctx El contexto del mensaje de WhatsApp
 * @returns {string} La nueva ruta del archivo corregido
 */
export const sanitizeFilePath = (filePath, ctx) => {
    if (!filePath || filePath.startsWith('MSG_ID:') || filePath === 'ERROR') return filePath;
    
    try {
        if (!fs.existsSync(filePath)) return filePath;

        // Leer buffer para inspección de Magic Bytes
        let buf = null;
        try {
            buf = fs.readFileSync(filePath);
        } catch (e) {}

        const metadata = extractFileMetadata(ctx, buf);
        const originalExt = metadata.ext;
        const currentExt = filePath.split('.').pop().toLowerCase();
        
        // Si el provider le asignó extensión .false, o .bin cuando la real es conocida (ej. dwg)
        if (currentExt === 'false' || (currentExt !== originalExt && originalExt !== 'bin')) {
            const dir = path.dirname(filePath);
            const baseName = path.basename(filePath, `.${currentExt}`);
            const newPath = path.join(dir, `${baseName}.${originalExt}`);
            
            if (fs.existsSync(filePath)) {
                fs.renameSync(filePath, newPath);
                return newPath;
            }
        }
    } catch (error) {
        console.error("Error sanitizando archivo:", error);
    }
    
    return filePath;
};

/**
 * Devuelve la referencia adecuada para reenviar un archivo.
 * Si `filePath` es válido y existe físicamente, lo devuelve.
 * Si falló, devuelve un token MSG_ID con el ID serializado correcto para WPPConnect.
 * @param {object} ctx Contexto del mensaje recibido.
 * @param {string} filePath Ruta del archivo devuelta por saveFile.
 * @returns {string} Ruta válida o `MSG_ID:<id>`.
 */
export const getFileReference = (ctx, filePath) => {
    const validMsgId = serializeMessageId(ctx);

    // Si ya es un MSG_ID (fallback anterior) o ERROR, lo conservamos con el id limpio.
    if (!filePath || filePath.startsWith('MSG_ID') || filePath === 'ERROR') {
        return `MSG_ID:${validMsgId}`;
    }
    // Extensión .false que no pudo renombrarse → fallback a MSG_ID limpio.
    const ext = filePath.split('.').pop().toLowerCase();
    if (ext === 'false') {
        return `MSG_ID:${validMsgId}`;
    }
    // Todo bien → devolver la ruta.
    return filePath;
};
