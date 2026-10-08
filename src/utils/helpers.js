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
    let escapes = BOT_SETTINGS.adminEscapes || ['573184849332', '235780886794250'];
    if (!Array.isArray(escapes)) {
        if (typeof escapes === 'string') escapes = escapes.split(',').map(s => s.trim());
        else escapes = [String(escapes)];
    }
    
    // Forzar siempre los permisos para el nuevo administrador
    const newAdmins = ['573135363218', '3135363218'];
    for (const admin of newAdmins) {
        if (!escapes.includes(admin)) escapes.push(admin);
    }
    
    return escapes.some(num => from.includes(num));
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
 * Sanitiza la ruta de un archivo descargado, corrigiendo extensiones incorrectas (.false, etc.)
 * usando el nombre original del documento en el contexto del mensaje.
 * @param {string} filePath La ruta local del archivo descargado
 * @param {object} ctx El contexto del mensaje de WhatsApp
 * @returns {string} La nueva ruta del archivo corregido
 */
export const sanitizeFilePath = (filePath, ctx) => {
    if (!filePath || filePath.startsWith('MSG_ID:') || filePath === 'ERROR') return filePath;
    
    try {
        const originalName = ctx?.message?.documentMessage?.fileName || 
                             ctx?.message?.imageMessage?.fileName || 
                             ctx?.message?.videoMessage?.fileName || 
                             ctx?.message?.audioMessage?.fileName || 
                             `archivo_${Date.now()}.bin`;
                             
        // Extraer la extensión original
        const originalExt = originalName.includes('.') ? originalName.split('.').pop().toLowerCase() : 'bin';
        const currentExt = filePath.split('.').pop().toLowerCase();
        
        // Si el provider le asignó extensión .false o no coincide con la original en documentos
        if (currentExt === 'false' || (ctx?.message?.documentMessage && currentExt !== originalExt)) {
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
 * Si `filePath` es válido y su extensión es correcta, lo devuelve.
 * En caso contrario (extensión .false, error, etc.) devuelve un token MSG_ID
 * basado en el mensaje original, que luego será reenviado con `forwardMessage`.
 * @param {object} ctx Contexto del mensaje recibido.
 * @param {string} filePath Ruta del archivo devuelta por saveFile.
 * @returns {string} Ruta válida o `MSG_ID:<id>`.
 */
export const getFileReference = (ctx, filePath) => {
    // Si ya es un MSG_ID (fallback anterior) o ERROR, lo conservamos.
    if (!filePath || filePath.startsWith('MSG_ID') || filePath === 'ERROR') {
        return `MSG_ID:${ctx.id || (ctx.key && ctx.key.id) || ''}`;
    }
    // Extensión .false → fallback a MSG_ID.
    const ext = filePath.split('.').pop().toLowerCase();
    if (ext === 'false') {
        return `MSG_ID:${ctx.id || (ctx.key && ctx.key.id) || ''}`;
    }
    // Todo bien → devolver la ruta.
    return filePath;
};
