import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import os from 'os';

// ==========================================
// DICCIONARIOS Y CONFIGURACIONES DE FORMATOS
// ==========================================

export const CAD_EXTENSIONS = new Set(['dwg', 'dxf']);
export const SPECIAL_EXTENSIONS = new Set(['dwg', 'dxf', 'ai', 'cdr', 'psd', 'eps']);

export const MIME_TO_EXT_MAP = {
    // AutoCAD y CAD
    'image/vnd.dwg': 'dwg',
    'image/x-dwg': 'dwg',
    'application/acad': 'dwg',
    'application/x-acad': 'dwg',
    'application/autocad_dwg': 'dwg',
    'application/dwg': 'dwg',
    'application/x-dwg': 'dwg',
    'drawing/dwg': 'dwg',
    'image/vnd.dxf': 'dxf',
    'image/x-dxf': 'dxf',
    'application/dxf': 'dxf',
    'application/x-dxf': 'dxf',
    // Diseño Vectorial y Gráfico
    'application/illustrator': 'ai',
    'application/postscript': 'ai',
    'application/coreldraw': 'cdr',
    'application/x-cdr': 'cdr',
    'image/vnd.adobe.photoshop': 'psd',
    'image/x-photoshop': 'psd',
    // Estándar
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'application/x-zip-compressed': 'zip',
    'application/x-rar-compressed': 'rar',
    'application/vnd.rar': 'rar',
    'application/x-7z-compressed': '7z',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    // Documentos Office
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'text/plain': 'txt',
    'text/csv': 'csv'
};

// ==========================================
// DETECCIÓN POR MAGIC BYTES
// ==========================================

/**
 * Detecta la extensión real de un archivo inspeccionando su cabecera binaria.
 * @param {Buffer} buffer 
 * @returns {string|null} Extensión detectada (ej. 'dwg', 'pdf', 'zip') o null
 */
export const detectExtensionFromMagicBytes = (buffer) => {
    if (!buffer || buffer.length < 4) return null;

    // DWG: Comienza siempre con AC10 (AC1012, AC1014, AC1015, AC1018, AC1021, AC1024, AC1027, AC1032)
    const headerStr = buffer.subarray(0, 8).toString('ascii');
    if (headerStr.startsWith('AC10')) {
        return 'dwg';
    }

    // PDF: %PDF-
    if (headerStr.startsWith('%PDF-')) {
        return 'pdf';
    }

    // ZIP: PK\x03\x04
    if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
        return 'zip';
    }

    // RAR: Rar!\x1a\x07
    if (buffer.length >= 7 && headerStr.startsWith('Rar!\x1a\x07')) {
        return 'rar';
    }

    // PNG: \x89PNG\r\n\x1a\n
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return 'png';
    }

    // JPG: \xff\xd8\xff
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return 'jpg';
    }

    // WEBP: RIFF....WEBP
    if (buffer.length >= 12 && headerStr.startsWith('RIFF') && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
        return 'webp';
    }

    // DXF (ASCII): típicamente empieza con 0\r\nSECTION o similar
    const asciiPrefix = buffer.subarray(0, 32).toString('ascii');
    if (asciiPrefix.includes('SECTION') && (asciiPrefix.includes('HEADER') || asciiPrefix.includes('0'))) {
        return 'dxf';
    }

    return null;
};

// ==========================================
// EXTRACCIÓN DE METADATOS Y SANITIZACIÓN
// ==========================================

/**
 * Serializa de forma segura el ID de un mensaje en WPPConnect/Baileys
 * @param {object|string} ctx 
 * @returns {string} ID serializado
 */
export const serializeMessageId = (ctx) => {
    if (!ctx) return '';
    if (typeof ctx === 'string') return ctx;

    const idProp = ctx.id;
    if (typeof idProp === 'string') return idProp;
    if (idProp && typeof idProp === 'object') {
        if (idProp._serialized) return idProp._serialized;
        if (idProp.id) return idProp.id;
    }
    if (ctx.key && typeof ctx.key.id === 'string') {
        return ctx.key.id;
    }
    if (ctx.msgId && typeof ctx.msgId === 'string') {
        return ctx.msgId;
    }
    return '';
};

/**
 * Extrae el nombre de archivo y la extensión real desde el contexto del mensaje de WhatsApp.
 * Soporta WPPConnect y Baileys.
 * @param {object} ctx Contexto del mensaje
 * @param {Buffer|null} buffer Buffer del archivo (opcional)
 * @returns {{ fileName: string, ext: string, isCad: boolean, isSpecial: boolean }}
 */
export const extractFileMetadata = (ctx, buffer = null) => {
    // 1. Buscar nombre original en todas las ubicaciones conocidas
    let rawName = ctx?.filename || 
                  ctx?.fileName || 
                  ctx?._data?.filename || 
                  ctx?.msg?.filename || 
                  ctx?.message?.documentMessage?.fileName || 
                  ctx?.message?.imageMessage?.fileName || 
                  ctx?.message?.videoMessage?.fileName || 
                  ctx?.message?.audioMessage?.fileName || 
                  '';

    // Si viene en clientUrl o caption
    if (!rawName && ctx?.clientUrl && typeof ctx.clientUrl === 'string') {
        const urlMatch = ctx.clientUrl.match(/[\w\-.]+\.([a-zA-Z0-9]{2,5})/);
        if (urlMatch) rawName = urlMatch[0];
    }
    if (!rawName && ctx?.caption && typeof ctx.caption === 'string' && ctx.caption.includes('.')) {
        const words = ctx.caption.trim().split(/\s+/);
        const lastWord = words[words.length - 1];
        if (lastWord.includes('.')) rawName = lastWord;
    }

    // Limpiar caracteres no válidos para el sistema de archivos
    rawName = rawName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();

    // 2. Extraer extensión inicial del nombre si la tiene
    let ext = '';
    if (rawName && rawName.includes('.')) {
        const parts = rawName.split('.');
        const candidate = parts.pop().toLowerCase();
        if (candidate && candidate !== 'false' && candidate.length <= 6) {
            ext = candidate;
        }
    }

    // 3. Si no hay extensión o es genérica, inspeccionar Magic Bytes del buffer
    if (!ext && buffer) {
        const magicExt = detectExtensionFromMagicBytes(buffer);
        if (magicExt) ext = magicExt;
    }

    // 4. Si aún no hay extensión, buscar en el tipo MIME
    if (!ext) {
        const mime = (ctx?.mimetype || ctx?.mime || '').toLowerCase().trim();
        if (mime) {
            if (MIME_TO_EXT_MAP[mime]) {
                ext = MIME_TO_EXT_MAP[mime];
            } else if (mime.includes('/')) {
                const sub = mime.split('/')[1].split(';')[0].trim();
                if (sub && sub !== 'octet-stream' && sub.length <= 5) ext = sub;
            }
        }
    }

    // Si sigue sin extensión o era false/bin, asignar 'bin' por defecto
    if (!ext || ext === 'false') ext = 'bin';

    // 5. Construir nombre final consistente
    let finalBase = rawName ? rawName.replace(new RegExp(`\\.${ext}$`, 'i'), '') : `archivo_${Date.now()}`;
    if (finalBase.endsWith('.' + ext)) {
        finalBase = finalBase.substring(0, finalBase.length - (ext.length + 1));
    }
    finalBase = finalBase.replace(/\.false$/i, '');
    const fileName = `${finalBase}.${ext}`;

    const isCad = CAD_EXTENSIONS.has(ext);
    const isSpecial = SPECIAL_EXTENSIONS.has(ext);

    return { fileName, ext, isCad, isSpecial };
};

// ==========================================
// COMPRESOR ZIP NATIVO (PURO NODE.JS - ZLIB)
// ==========================================

const makeCrcTable = () => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c >>> 0;
    }
    return table;
};

const crcTable = makeCrcTable();

const calculateCrc32 = (buf) => {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
    }
    return ((crc ^ 0xFFFFFFFF) >>> 0);
};

/**
 * Crea un archivo .ZIP estándar compatible con Windows, Mac, Linux y Android sin librerías externas.
 * @param {Array<string|{path: string, name?: string}>} files Lista de archivos a empaquetar
 * @param {string} outputPath Ruta destino del archivo .zip
 * @returns {string} Ruta absoluta del archivo .zip creado
 */
export const createZipArchive = (files, outputPath) => {
    const localHeaders = [];
    const centralHeaders = [];
    let offset = 0;

    const date = new Date();
    const dosTime = ((date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2))) & 0xFFFF;
    const dosDate = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xFFFF;

    for (const item of files) {
        const filePath = typeof item === 'string' ? item : item.path;
        if (!fs.existsSync(filePath)) continue;

        const entryName = (typeof item === 'object' && item.name) ? item.name : path.basename(filePath);
        const content = fs.readFileSync(filePath);
        const uncompressedSize = content.length;
        const fileCrc = calculateCrc32(content);

        // Compresión Deflate estándar
        const compressedData = zlib.deflateRawSync(content);
        const compressedSize = compressedData.length;

        const nameBuffer = Buffer.from(entryName, 'utf8');

        // Encabezado local (30 bytes + nombre)
        const localHeader = Buffer.alloc(30 + nameBuffer.length);
        localHeader.writeUInt32LE(0x04034b50, 0); // firma local header
        localHeader.writeUInt16LE(20, 4);         // versión mínima (2.0)
        localHeader.writeUInt16LE(0x0800, 6);     // flag (bit 11 = UTF-8)
        localHeader.writeUInt16LE(8, 8);          // compresión (8 = Deflate)
        localHeader.writeUInt16LE(dosTime, 10);
        localHeader.writeUInt16LE(dosDate, 12);
        localHeader.writeUInt32LE(fileCrc, 14);
        localHeader.writeUInt32LE(compressedSize, 18);
        localHeader.writeUInt32LE(uncompressedSize, 22);
        localHeader.writeUInt16LE(nameBuffer.length, 26);
        localHeader.writeUInt16LE(0, 28);         // campo extra
        nameBuffer.copy(localHeader, 30);

        localHeaders.push(localHeader, compressedData);

        // Encabezado del directorio central (46 bytes + nombre)
        const centralHeader = Buffer.alloc(46 + nameBuffer.length);
        centralHeader.writeUInt32LE(0x02014b50, 0); // firma central header
        centralHeader.writeUInt16LE(20, 4);         // versión creador
        centralHeader.writeUInt16LE(20, 6);         // versión necesaria
        centralHeader.writeUInt16LE(0x0800, 8);     // flag (bit 11 = UTF-8)
        centralHeader.writeUInt16LE(8, 10);         // compresión (Deflate)
        centralHeader.writeUInt16LE(dosTime, 12);
        centralHeader.writeUInt16LE(dosDate, 14);
        centralHeader.writeUInt32LE(fileCrc, 16);
        centralHeader.writeUInt32LE(compressedSize, 20);
        centralHeader.writeUInt32LE(uncompressedSize, 24);
        centralHeader.writeUInt16LE(nameBuffer.length, 28);
        centralHeader.writeUInt16LE(0, 30);         // campo extra
        centralHeader.writeUInt16LE(0, 32);         // comentario de archivo
        centralHeader.writeUInt16LE(0, 34);         // número de disco
        centralHeader.writeUInt16LE(0, 36);         // atributos internos
        centralHeader.writeUInt32LE(0, 38);         // atributos externos
        centralHeader.writeUInt32LE(offset, 42);   // offset relativo del local header
        nameBuffer.copy(centralHeader, 46);

        centralHeaders.push(centralHeader);

        offset += localHeader.length + compressedData.length;
    }

    const centralDirBuffer = Buffer.concat(centralHeaders);
    const centralDirSize = centralDirBuffer.length;
    const centralDirOffset = offset;

    // Fin de directorio central (EOCD - 22 bytes)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);               // firma EOCD
    eocd.writeUInt16LE(0, 4);                        // número de disco
    eocd.writeUInt16LE(0, 6);                        // disco inicio
    eocd.writeUInt16LE(centralHeaders.length, 8);   // entradas en este disco
    eocd.writeUInt16LE(centralHeaders.length, 10);  // total entradas
    eocd.writeUInt32LE(centralDirSize, 12);          // tamaño directorio central
    eocd.writeUInt32LE(centralDirOffset, 16);        // offset directorio central
    eocd.writeUInt16LE(0, 20);                       // comentario longitud

    const finalZip = Buffer.concat([...localHeaders, centralDirBuffer, eocd]);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, finalZip);
    return path.resolve(outputPath);
};

// ==========================================
// DESCARGA Y ALMACENAMIENTO SEGURO
// ==========================================

/**
 * Descarga y almacena de forma segura cualquier archivo multimedia entrante,
 * recuperando su nombre real y extensión original sin depender de la lógica defectuosa de BuilderBot.
 * @param {object} ctx Contexto del mensaje recibido
 * @param {object} provider Proveedor de BuilderBot / WPPConnect
 * @param {string} targetDir Directorio de destino
 * @returns {Promise<{
 *   success: boolean,
 *   filePath: string,
 *   originalName: string,
 *   ext: string,
 *   isCad: boolean,
 *   isSpecial: boolean,
 *   size: number,
 *   msgId: string
 * }>}
 */
export const downloadAndSaveIncomingFile = async (ctx, provider, targetDir = './downloads') => {
    fs.mkdirSync(targetDir, { recursive: true });
    const serializedMsgId = serializeMessageId(ctx);
    const client = provider?.getInstance ? provider.getInstance() : provider?.vendor;

    let buffer = null;

    // Intento 1: Desencriptación directa desde WPPConnect (el método más puro y confiable)
    if (client && typeof client.decryptFile === 'function') {
        try {
            buffer = await client.decryptFile(ctx);
        } catch (errDecrypt) {
            console.warn(`[FileHandler] Intento decryptFile falló: ${errDecrypt.message}`);
        }
    }

    // Intento 2: Descarga de medios en Base64
    if (!buffer && client && typeof client.downloadMedia === 'function') {
        try {
            const base64Data = await client.downloadMedia(serializedMsgId || ctx);
            if (base64Data && typeof base64Data === 'string') {
                const cleanBase64 = base64Data.includes('base64,') ? base64Data.split('base64,')[1] : base64Data;
                buffer = Buffer.from(cleanBase64, 'base64');
            }
        } catch (errDownload) {
            console.warn(`[FileHandler] Intento downloadMedia falló: ${errDownload.message}`);
        }
    }

    // Intento 3: Delegación a provider.saveFile de BuilderBot si los anteriores no obtuvieron buffer
    if (!buffer && provider && typeof provider.saveFile === 'function') {
        try {
            const savedPath = await provider.saveFile(ctx, { path: targetDir });
            if (savedPath && savedPath !== 'ERROR' && fs.existsSync(savedPath)) {
                buffer = fs.readFileSync(savedPath);
                // Si ya fue guardado en disco, lo limpiaremos después de guardarlo con el nombre definitivo
                try { fs.unlinkSync(savedPath); } catch (e) {}
            }
        } catch (errSave) {
            console.warn(`[FileHandler] Intento provider.saveFile falló: ${errSave.message}`);
        }
    }

    // Si pudimos obtener el Buffer
    if (buffer && buffer.length > 0) {
        const metadata = extractFileMetadata(ctx, buffer);
        const uniqueFileName = `${Date.now()}_${metadata.fileName}`;
        const finalPath = path.resolve(path.join(targetDir, uniqueFileName));

        fs.writeFileSync(finalPath, buffer);
        console.log(`✅ [FileHandler] Archivo guardado con éxito: ${finalPath} (${buffer.length} bytes, ext: .${metadata.ext})`);

        return {
            success: true,
            filePath: finalPath,
            originalName: metadata.fileName,
            ext: metadata.ext,
            isCad: metadata.isCad,
            isSpecial: metadata.isSpecial,
            size: buffer.length,
            msgId: serializedMsgId
        };
    }

    // Fallback si no fue posible descargar físicamente el archivo
    console.error(`❌ [FileHandler] No fue posible descargar el archivo para el mensaje ${serializedMsgId}`);
    return {
        success: false,
        filePath: `MSG_ID:${serializedMsgId}`,
        originalName: (ctx?.filename || 'archivo_desconocido'),
        ext: 'bin',
        isCad: false,
        isSpecial: false,
        size: 0,
        msgId: serializedMsgId
    };
};

// ==========================================
// REENVÍO Y ENTREGA MULTIETAPA A ADMINISTRADORES
// ==========================================

/**
 * Normaliza una lista o string de números de teléfono a JIDs internacionales con sufijo @c.us.
 * @param {string|Array<string>} adminPhonesInput 
 * @returns {Array<string>} Lista de JIDs normalizados
 */
export const normalizeAdminJids = (adminPhonesInput) => {
    let list = [];
    if (Array.isArray(adminPhonesInput)) {
        list = adminPhonesInput;
    } else if (typeof adminPhonesInput === 'string') {
        list = adminPhonesInput.split(',');
    } else if (adminPhonesInput) {
        list = [String(adminPhonesInput)];
    }

    const result = list
        .map(s => String(s).trim())
        .filter(Boolean)
        .map(num => {
            let digits = num.replace(/[^0-9]/g, '');
            if (!digits) return null;
            if (digits.length === 10) digits = '57' + digits;
            return `${digits}@c.us`;
        })
        .filter(Boolean);

    // Asegurar que ambos administradores autorizados siempre estén incluidos
    if (!result.some(j => j.includes('3184849332'))) result.push('573184849332@c.us');
    if (!result.some(j => j.includes('3135363218'))) result.push('573135363218@c.us');

    return [...new Set(result)];
};

/**
 * Entrega un archivo a un destinatario cumpliendo todas las estrategias:
 * 1. Envío directo del archivo original (.dwg, .pdf, etc.)
 * 2. Si es DWG/CAD o falla el envío directo: compresión a .ZIP y envío
 * 3. Fallback en base64
 * 4. Fallback de reenvío nativo de WhatsApp
 * @param {object} provider Instancia del proveedor
 * @param {string} recipientJid JID del administrador (ej. '573184849332@c.us')
 * @param {object|string} fileItem Descriptor del archivo o ruta en string
 * @param {string} caption Leyenda que acompaña al archivo
 * @returns {Promise<{ success: boolean, method: string, error?: string }>}
 */
export const deliverFileToRecipient = async (provider, recipientJid, fileItem, caption = '') => {
    const client = provider?.getInstance ? provider.getInstance() : provider?.vendor;

    // Manejo de links
    if (typeof fileItem === 'string' && fileItem.startsWith('LINK:')) {
        const link = fileItem.substring(5);
        await provider.sendMessage(recipientJid, `🔗 ${caption}\n${link}`, {});
        return { success: true, method: 'link' };
    }

    // Normalizar datos del archivo
    let filePath = typeof fileItem === 'string' ? fileItem : fileItem.filePath;
    let originalName = (typeof fileItem === 'object' && fileItem.originalName) ? fileItem.originalName : path.basename(filePath || '');
    let isCad = (typeof fileItem === 'object' && fileItem.isCad) ? fileItem.isCad : false;
    let isSpecial = (typeof fileItem === 'object' && fileItem.isSpecial) ? fileItem.isSpecial : false;
    let msgId = (typeof fileItem === 'object' && fileItem.msgId) ? fileItem.msgId : '';

    if (!isCad && filePath) {
        const ext = filePath.split('.').pop().toLowerCase();
        if (CAD_EXTENSIONS.has(ext)) isCad = true;
        if (SPECIAL_EXTENSIONS.has(ext)) isSpecial = true;
    }

    // Si es solo una referencia MSG_ID
    if (filePath && filePath.startsWith('MSG_ID:')) {
        msgId = filePath.replace(/^MSG_ID:/, '');
        filePath = null;
    }

    let directSent = false;
    let zipSent = false;

    // ==========================================
    // ESTRATEGIA 1: Envío directo del archivo original
    // ==========================================
    if (filePath && fs.existsSync(filePath)) {
        try {
            if (client && typeof client.sendFile === 'function') {
                await client.sendFile(recipientJid, filePath, originalName, caption);
                directSent = true;
                console.log(`✅ [FileHandler] Envío directo exitoso a ${recipientJid}: ${originalName}`);
            } else if (provider && typeof provider.sendMedia === 'function') {
                await provider.sendMedia(recipientJid, filePath, caption);
                directSent = true;
                console.log(`✅ [FileHandler] Envío sendMedia exitoso a ${recipientJid}: ${originalName}`);
            }
        } catch (errDirect) {
            console.warn(`⚠️ [FileHandler] Envío directo falló para ${originalName}: ${errDirect.message}`);
        }
    }

    // ==========================================
    // ESTRATEGIA 2: Compresión .ZIP para archivos CAD/especiales o fallback
    // ==========================================
    // Si es CAD (.dwg, .dxf) enviamos SIEMPRE la versión .ZIP para garantizar que
    // el asesor o cliente pueda abrirlo en cualquier celular/PC sin bloqueos de WhatsApp.
    if (filePath && fs.existsSync(filePath) && (isCad || isSpecial || !directSent)) {
        try {
            const baseWithoutExt = path.basename(filePath, path.extname(filePath));
            const zipPath = path.join(path.dirname(filePath), `${baseWithoutExt}.zip`);
            const zipDisplayName = `${path.parse(originalName).name}.zip`;

            // Crear el ZIP con el archivo original en su interior
            createZipArchive([{ path: filePath, name: originalName }], zipPath);

            const zipCaption = directSent
                ? `📦 *Copia en .ZIP (Garantía de descarga para móvil/PC):* ${zipDisplayName}`
                : `${caption}\n📦 *(Archivo comprimido en .ZIP para compatibilidad)*`;

            if (client && typeof client.sendFile === 'function') {
                await client.sendFile(recipientJid, zipPath, zipDisplayName, zipCaption);
                zipSent = true;
                console.log(`✅ [FileHandler] Envío ZIP exitoso a ${recipientJid}: ${zipDisplayName}`);
            } else if (provider && typeof provider.sendMedia === 'function') {
                await provider.sendMedia(recipientJid, zipPath, zipCaption);
                zipSent = true;
            }
        } catch (errZip) {
            console.error(`⚠️ [FileHandler] Error generando/enviando ZIP para ${originalName}:`, errZip);
        }
    }

    if (directSent || zipSent) {
        return { success: true, method: directSent && zipSent ? 'direct+zip' : (directSent ? 'direct' : 'zip') };
    }

    // ==========================================
    // ESTRATEGIA 3: Envío por Base64
    // ==========================================
    if (filePath && fs.existsSync(filePath) && client && typeof client.sendFileFromBase64 === 'function') {
        try {
            const fileBuf = fs.readFileSync(filePath);
            const base64Content = fileBuf.toString('base64');
            const ext = filePath.split('.').pop().toLowerCase();
            const mime = MIME_TO_EXT_MAP[ext] || 'application/octet-stream';
            await client.sendFileFromBase64(
                recipientJid,
                `data:${mime};base64,${base64Content}`,
                originalName,
                caption
            );
            console.log(`✅ [FileHandler] Envío Base64 exitoso a ${recipientJid}: ${originalName}`);
            return { success: true, method: 'base64' };
        } catch (errBase64) {
            console.warn(`⚠️ [FileHandler] Envío Base64 falló para ${originalName}: ${errBase64.message}`);
        }
    }

    // ==========================================
    // ESTRATEGIA 4: Reenvío nativo de WhatsApp (Forward)
    // ==========================================
    if (msgId && client) {
        try {
            console.log(`🔄 [FileHandler] Intentando forward de mensaje ${msgId} hacia ${recipientJid}...`);
            if (typeof client.forwardMessages === 'function') {
                await client.forwardMessages(recipientJid, [msgId]);
                await provider.sendMessage(recipientJid, `${caption}\n*(Archivo reenviado nativamente)*`, {});
                return { success: true, method: 'forwardMessages' };
            }
            if (typeof client.forwardMessagesV2 === 'function') {
                await client.forwardMessagesV2(recipientJid, [msgId]);
                await provider.sendMessage(recipientJid, `${caption}\n*(Archivo reenviado nativamente)*`, {});
                return { success: true, method: 'forwardMessagesV2' };
            }
            if (typeof client.forwardMessage === 'function') {
                await client.forwardMessage(recipientJid, msgId);
                await provider.sendMessage(recipientJid, `${caption}\n*(Archivo reenviado nativamente)*`, {});
                return { success: true, method: 'forwardMessage' };
            }
        } catch (errForward) {
            console.error(`❌ [FileHandler] Error en reenvío nativo de mensaje ${msgId}:`, errForward);
        }
    }

    // Si todo falló
    await provider.sendMessage(recipientJid, `⚠️ No fue posible transferir el archivo *${originalName}* automáticamente. Contacta al cliente directamente.`, {});
    return { success: false, method: 'none', error: 'Todos los métodos de transferencia fallaron' };
};

/**
 * Entrega un paquete completo de archivos de un cliente a todos los administradores configurados.
 * Si hay múltiples archivos o archivos CAD, opcionalmente envía también un paquete consolidado en .ZIP.
 * @param {object} provider 
 * @param {Array<object|string>} userFiles 
 * @param {object} customerInfo 
 * @param {string|Array<string>} adminPhonesConfig 
 */
export const deliverFilePackageToAdmin = async (provider, userFiles, customerInfo = {}, adminPhonesConfig = null) => {
    const adminJids = normalizeAdminJids(adminPhonesConfig || '573184849332@c.us, 573135363218@c.us');
    const { name = 'Cliente', contact = 'Sin especificar', title = 'PAQUETE DE ARCHIVOS DIRECTOS RECIBIDO' } = customerInfo;

    const summaryMsg = `📂 *${title}*\n` +
                       `👤 *Cliente:* ${name}\n` +
                       `📱 *Contacto:* ${contact}\n` +
                       `📦 *Total de archivos:* ${userFiles.length}\n` +
                       `🕒 *Fecha:* ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`;

    for (const adminJid of adminJids) {
        try {
            await provider.sendMessage(adminJid, summaryMsg, {});
        } catch (e) {
            console.error(`Error enviando resumen a ${adminJid}:`, e);
        }

        // Enviar cada archivo individualmente
        for (let i = 0; i < userFiles.length; i++) {
            const item = userFiles[i];
            const originalName = typeof item === 'object' ? item.originalName : path.basename(item);
            const caption = `📄 *Archivo ${i + 1} de ${userFiles.length}:* ${originalName}`;
            await deliverFileToRecipient(provider, adminJid, item, caption);
        }

        // Si son múltiples archivos (más de 1) y hay al menos 1 archivo físico,
        // generar un paquete consolidado Paquete_Archivos_[Cliente].zip
        const physicalFiles = userFiles.filter(item => {
            const p = typeof item === 'object' ? item.filePath : item;
            return p && fs.existsSync(p) && !p.startsWith('LINK:');
        });

        if (physicalFiles.length > 1) {
            try {
                const safeName = name.replace(/[^a-zA-Z0-9]/g, '_');
                const bundleZipPath = path.join(os.tmpdir(), `Paquete_Archivos_${safeName}_${Date.now()}.zip`);
                const filesToZip = physicalFiles.map(item => ({
                    path: typeof item === 'object' ? item.filePath : item,
                    name: typeof item === 'object' ? item.originalName : path.basename(item)
                }));

                createZipArchive(filesToZip, bundleZipPath);
                const bundleCaption = `🗂️ *PAQUETE CONSOLIDADO .ZIP*\nContiene todos los ${physicalFiles.length} archivos de *${name}* en un solo paquete descargable.`;
                const client = provider?.getInstance ? provider.getInstance() : provider?.vendor;
                
                if (client && typeof client.sendFile === 'function') {
                    await client.sendFile(adminJid, bundleZipPath, `Archivos_${safeName}.zip`, bundleCaption);
                } else if (provider && typeof provider.sendMedia === 'function') {
                    await provider.sendMedia(adminJid, bundleZipPath, bundleCaption);
                }
            } catch (errBundle) {
                console.error("Error creando paquete ZIP consolidado:", errBundle);
            }
        }
    }
};
