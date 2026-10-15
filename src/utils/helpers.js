import fs from 'fs';
import path from 'path';
import { BOT_SETTINGS } from '../botConfig.js';
import { getUser, saveUser } from '../firebase.js';

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

// ==========================================
// FUNCIONES DE VALIDACIÓN Y HELPERS
// ==========================================

/**
 * Verifica si un remitente o contexto de mensaje corresponde a un administrador autorizado.
 * Soporta números directos, IDs con sufijo @c.us, y LIDs de WhatsApp (@lid).
 * @param {string|object} fromOrCtx - Identificador del remitente o contexto del mensaje (ctx)
 * @returns {boolean} true si es administrador
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

    let escapes = BOT_SETTINGS.adminEscapes || [];
    if (!Array.isArray(escapes)) {
        if (typeof escapes === 'string') escapes = escapes.split(',').map(s => s.trim());
        else escapes = [String(escapes)];
    }
    
    // Lista inmutable de administradores autorizados
    const finalAdmins = [
        ...escapes,
        '573184849332',
        '235780886794250',
        '573135363218',
        '3135363218',
        '13770403381354'
    ];
    
    return candidates.some(cand => finalAdmins.some(admin => String(cand).includes(admin)));
};

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

import {
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

export {
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
