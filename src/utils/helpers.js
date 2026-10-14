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
 * Verifica si un número de remitente corresponde a un administrador autorizado.
 * @param {string} from - Identificador del remitente (ej. "573184849332@c.us")
 * @returns {boolean} true si es administrador
 */
export const isAdmin = (from) => {
    if (!from) return false;
    let escapes = BOT_SETTINGS.adminEscapes || [];
    if (!Array.isArray(escapes)) {
        if (typeof escapes === 'string') escapes = escapes.split(',').map(s => s.trim());
        else escapes = [String(escapes)];
    }
    
    // Lista inmutable de administradores
    const finalAdmins = [...escapes, '573184849332', '235780886794250', '573135363218', '3135363218'];
    
    return finalAdmins.some(num => from.includes(num));
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

import {
    extractFileMetadata,
    serializeMessageId,
    downloadAndSaveIncomingFile,
    deliverFileToRecipient,
    deliverFilePackageToAdmin,
    createZipArchive,
    normalizeAdminJids,
    CAD_EXTENSIONS,
    SPECIAL_EXTENSIONS
} from './fileHandler.js';

export {
    extractFileMetadata,
    serializeMessageId,
    downloadAndSaveIncomingFile,
    deliverFileToRecipient,
    deliverFilePackageToAdmin,
    createZipArchive,
    normalizeAdminJids,
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
