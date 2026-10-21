import fs from 'fs';
import path from 'path';
import { BOT_SETTINGS, BOT_MEDIA, BOT_ADVISORS, getAdvisorName } from '../botConfig.js';
import { getUser, saveUser } from '../firebase.js';
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
        if (fromOrCtx._data?.id?.participant) candidates.push(fromOrCtx._data.id.participant);
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
                if (advPhone && (cand === advPhone || cand.endsWith(advPhone) || advPhone.endsWith(cand))) {
                    return true;
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
    
    return candidates.some(cand => finalAdmins.some(admin => String(cand).includes(admin)));
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
    let dbPhone = '';

    // 1. Intentar consultar en Firestore con el ID exacto
    try {
        let userDoc = await getUser(rawId);
        if (!userDoc && cleanDigits && cleanDigits !== rawId) {
            userDoc = await getUser(cleanDigits);
        }
        // Si tiene prefijo 57 de 12 dígitos, intentar también sin el 57
        if (!userDoc && cleanDigits.startsWith('57') && cleanDigits.length === 12) {
            userDoc = await getUser(cleanDigits.substring(2));
        }

        if (userDoc) {
            if (userDoc.name) dbName = String(userDoc.name).trim();
            if (userDoc.contactUser) dbPhone = String(userDoc.contactUser).trim();
            else if (userDoc.phone && String(userDoc.phone).replace(/\D/g, '').length <= 12) {
                dbPhone = String(userDoc.phone).trim();
            }
        }
    } catch (e) {
        console.warn(`⚠️ [getCustomerDisplayInfo] Error al consultar usuario para ${rawId}:`, e.message);
    }

    // 2. Determinar el teléfono limpio a mostrar
    let finalPhone = dbPhone;
    if (!finalPhone) {
        if (cleanDigits.length <= 12 && cleanDigits.length >= 7) {
            finalPhone = cleanDigits;
        } else {
            // Si es un LID largo y no hay contactUser en DB, mostrar el ID limpio
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
 * Valida si la hora actual está dentro del horario laboral de atención de asesores.
 * Horario:
 * - Lunes a Viernes: 8:30am a 12:30pm y 2:00pm a 6:00pm
 * - Sábados y Domingos: Cerrado
 * @returns {boolean} true si está en horario hábil
 */
export const isWorkingHour = () => {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
    const day = now.getDay();
    const timeInMinutes = now.getHours() * 60 + now.getMinutes();

    if (day >= 1 && day <= 5) {
        // Lunes a Viernes: 8:30am a 12:30pm (510-750) y 2:00pm a 6:00pm (840-1080)
        if ((timeInMinutes >= 510 && timeInMinutes < 750) || (timeInMinutes >= 840 && timeInMinutes < 1080)) {
            return true;
        }
    }
    return false;
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
