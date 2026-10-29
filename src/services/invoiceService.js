import fs from 'fs';
import path from 'path';
import { downloadAndSaveIncomingFile, deliverFileToRecipient, getWppClient } from '../utils/helpers.js';

// =============================================================================
// CARGA DINÁMICA DE DEPENDENCIAS (BLINDAJE CONTRA CRASHEOS)
// =============================================================================

let PDFParseClass = null;

/**
 * Carga de forma dinámica y resiliente la librería pdf-parse.
 * Evita que el bot falle al arrancar si la dependencia no ha sido instalada aún en el entorno.
 * 
 * @returns {Promise<any|null>}
 */
export const loadPdfParser = async () => {
    if (PDFParseClass) return PDFParseClass;
    try {
        const mod = await import('pdf-parse');
        PDFParseClass = mod.PDFParse || mod.default?.PDFParse || mod.default;
        return PDFParseClass;
    } catch (err) {
        console.warn('⚠️ [InvoiceService] La librería pdf-parse no está instalada en este entorno:', err.message);
        return null;
    }
};

// =============================================================================
// CONFIGURACIÓN Y CONSTANTES
// =============================================================================

/**
 * NIT de la empresa emisora para ser ignorado en la detección automática del cliente.
 * Puede configurarse mediante variable de entorno EMISOR_NIT o modificarse directamente aquí.
 */
export const EMISOR_NIT = process.env.EMISOR_NIT || 'TU_NIT_AQUI';

/**
 * Directorio de almacenamiento local estandarizado para facturas electrónicas.
 */
export const STORAGE_FACTURAS_DIR = path.resolve(process.cwd(), 'storage/facturas');
export const STORAGE_TEMP_DIR = path.resolve(process.cwd(), 'storage/facturas/temp');

// Garantizar persistencia del directorio desde el inicio
try {
    fs.mkdirSync(STORAGE_FACTURAS_DIR, { recursive: true });
    fs.mkdirSync(STORAGE_TEMP_DIR, { recursive: true });
} catch (e) {
    console.error('⚠️ [InvoiceService] Error creando directorio de facturas:', e.message);
}

// Estados temporales en memoria para cargas en dos pasos o ingresos manuales de NIT
const pendingFacturaUploads = new Map(); // cleanFrom -> { timestamp }
const pendingManualNit = new Map();      // cleanFrom -> { tempPath, date, consecutive, timestamp }

// =============================================================================
// HELPERS DE NORMALIZACIÓN Y PARSEO
// =============================================================================

/**
 * Limpia un número de identificación o NIT:
 * Remueve puntos, espacios y el dígito de verificación tras el guion.
 * Ej: "900.123.456-7" -> "900123456"
 * 
 * @param {string} raw 
 * @returns {string} Dígitos limpios sin DV
 */
export const cleanDocumentNumber = (raw) => {
    if (!raw || typeof raw !== 'string') return '';
    // Descartar todo lo que esté después del primer guion (dígito de verificación)
    const basePart = raw.split('-')[0];
    return basePart.replace(/\D/g, '');
};

/**
 * Estandariza fechas en formatos YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY a YYYY-MM-DD.
 * Si la fecha no es válida, retorna la fecha actual en zona horaria Colombia.
 * 
 * @param {string} dateStr 
 * @returns {string} Fecha en formato YYYY-MM-DD
 */
export const normalizeDateToYMD = (dateStr) => {
    const todayColombia = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' }); // 'YYYY-MM-DD'
    if (!dateStr || typeof dateStr !== 'string') return todayColombia;

    const trimmed = dateStr.trim();
    const parts = trimmed.split(/[-/.]/);
    if (parts.length !== 3) return todayColombia;

    let y, m, d;
    if (parts[0].length === 4) {
        // YYYY-MM-DD o YYYY/MM/DD
        y = parseInt(parts[0], 10);
        m = parseInt(parts[1], 10);
        d = parseInt(parts[2], 10);
    } else if (parts[2].length === 4) {
        // DD/MM/YYYY o DD-MM-YYYY
        d = parseInt(parts[0], 10);
        m = parseInt(parts[1], 10);
        y = parseInt(parts[2], 10);
    } else {
        return todayColombia;
    }

    if (isNaN(y) || isNaN(m) || isNaN(d)) return todayColombia;
    if (y < 2000 || y > 2099 || m < 1 || m > 12 || d < 1 || d > 31) return todayColombia;

    return `${String(y)}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

/**
 * Sanitiza el consecutivo o número de factura para usar en el nombre del archivo.
 * 
 * @param {string} raw 
 * @returns {string}
 */
export const cleanConsecutive = (raw) => {
    if (!raw) return String(Date.now());
    const sanitized = String(raw).replace(/[^a-zA-Z0-9_-]/g, '').trim();
    return sanitized.length > 0 ? sanitized.substring(0, 25) : String(Date.now());
};

// =============================================================================
// PARSEO DE DOCUMENTOS PDF (pdf-parse)
// =============================================================================

/**
 * Extrae el texto plano de un PDF y busca los campos clave:
 * 1. NIT / Cédula del Adquiriente (Cliente)
 * 2. Fecha de Generación de la Factura
 * 3. Número de Factura / Consecutivo
 * 
 * @param {Buffer|string} bufferOrPath Buffer o ruta del archivo PDF
 * @param {object} [options] Opciones opcionales como { emisorNit }
 * @returns {Promise<{ success: boolean, nit: string|null, date: string, consecutive: string, rawText?: string, error?: string }>}
 */
export const extractDataFromInvoicePdf = async (bufferOrPath, options = {}) => {
    try {
        let buffer = null;
        if (Buffer.isBuffer(bufferOrPath)) {
            buffer = bufferOrPath;
        } else if (typeof bufferOrPath === 'string' && fs.existsSync(bufferOrPath)) {
            buffer = fs.readFileSync(bufferOrPath);
        } else {
            return { success: false, nit: null, date: normalizeDateToYMD(), consecutive: String(Date.now()), error: 'Buffer o archivo inválido' };
        }

        const Parser = await loadPdfParser();
        if (!Parser) {
            console.warn('⚠️ [InvoiceService] pdf-parse no disponible en este entorno. Se solicitará el NIT manualmente.');
            return {
                success: false,
                nit: null,
                date: normalizeDateToYMD(),
                consecutive: String(Date.now()),
                error: 'pdf-parse no disponible en el sistema'
            };
        }

        const parser = new Parser({ data: buffer });
        const parseResult = await parser.getText();
        await parser.destroy().catch(() => {});

        const text = parseResult?.text || '';
        const cleanEmisor = cleanDocumentNumber(options.emisorNit || process.env.EMISOR_NIT || EMISOR_NIT);

        // 1. EXTRAER CONSECUTIVO / NÚMERO DE FACTURA
        let consecutive = null;
        const numRegexes = [
            /(?:factura\s*(?:electr[oó]nica)?\s*(?:de\s*venta)?\s*(?:no\.?|n[uú]m(?:ero)?\.?)?|n[uú]mero\s*de\s*factura|consecutivo|fe:?)[:\s#]*([a-zA-Z]{1,6}[-\s]?[0-9]{1,10}|[0-9]{3,10})/i,
            /\b([A-Z]{1,6}-[0-9]{2,8})\b/
        ];
        for (const rgx of numRegexes) {
            const m = text.match(rgx);
            if (m && m[1]) {
                consecutive = cleanConsecutive(m[1].replace(/\s+/g, '-'));
                break;
            }
        }
        if (!consecutive) consecutive = String(Date.now());

        // 2. EXTRAER FECHA DE GENERACIÓN / EMISIÓN
        let date = null;
        const dateRegexes = [
            /(?:fecha\s*(?:de)?\s*(?:generaci[oó]n|emisi[oó]n|expedici[oó]n|factura)|emisi[oó]n|expedici[oó]n)[:\s]*([0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2}|[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{4})/i,
            /(?:fecha)[:\s]*([0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2}|[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{4})/i,
            /\b([0-9]{4}[-/][0-9]{2}[-/][0-9]{2})\b/,
            /\b([0-9]{2}[-/][0-9]{2}[-/][0-9]{4})\b/
        ];
        for (const rgx of dateRegexes) {
            const m = text.match(rgx);
            if (m && m[1]) {
                date = normalizeDateToYMD(m[1]);
                break;
            }
        }
        if (!date) date = normalizeDateToYMD();

        // 3. EXTRAER NIT / CÉDULA DEL ADQUIRIENTE (CLIENTE)
        let nit = null;

        // Estrategia 3A: Buscar bloque contextual del Adquiriente / Cliente / Receptor
        const clientBlockMatch = text.match(/(?:adquiriente|datos\s*del\s*adquiriente|cliente|receptor|comprador|se[ñn]or(?:\(a\))?|destinatario|facturado\s*a)[\s\S]{0,300}?(?:nit|c\.?c\.?|c[eé]dula|identificaci[oó]n|doc(?:umento)?\.?|n[uú]mero)[:\s#]*([0-9\.\s]{5,15}(?:-[0-9kK])?)/i);
        if (clientBlockMatch && clientBlockMatch[1]) {
            const cand = cleanDocumentNumber(clientBlockMatch[1]);
            if (cand && cand.length >= 5 && cand.length <= 12 && (!cleanEmisor || cand !== cleanEmisor)) {
                nit = cand;
            }
        }

        // Estrategia 3B: Si no se halló en bloque, buscar cualquier NIT/CC descartando contexto de Emisor
        if (!nit) {
            const globalNitRegex = /(?:nit|c\.?c\.?|c[eé]dula|identificaci[oó]n)[:\s#]*([0-9\.\s]{5,15}(?:-[0-9kK])?)/gi;
            let match;
            while ((match = globalNitRegex.exec(text)) !== null) {
                const cand = cleanDocumentNumber(match[1]);
                if (cand && cand.length >= 5 && cand.length <= 12) {
                    if (cleanEmisor && cand === cleanEmisor) {
                        continue;
                    }
                    // Verificar si el contexto anterior o la línea pertenece al emisor
                    const matchIdx = match.index;
                    const contextBefore = text.substring(Math.max(0, matchIdx - 70), matchIdx).toLowerCase();
                    const isEmisorContext = /(?:emisor|vendedor|prestador|obligado\s*a\s*facturar|quien\s*factura|cad\s*impresiones)/i.test(contextBefore);
                    if (isEmisorContext) {
                        continue;
                    }
                    nit = cand;
                    break;
                }
            }
        }

        // Estrategia 3C: Buscar línea que contenga "Identificación:" o "NIT:" aislada
        if (!nit) {
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (/^(?:nit|c\.?c\.?|identificaci[oó]n)[:\s]*([0-9\.\s]{6,15}(?:-[0-9kK])?)$/i.test(line)) {
                    const cand = cleanDocumentNumber(line);
                    const isEmisorLine = /(?:emisor|vendedor|prestador|cad\s*impresiones)/i.test(line);
                    if (cand && cand.length >= 6 && (!cleanEmisor || cand !== cleanEmisor) && !isEmisorLine) {
                        nit = cand;
                        break;
                    }
                }
            }
        }

        return {
            success: true,
            nit,
            date,
            consecutive,
            rawText: text.substring(0, 500)
        };
    } catch (err) {
        console.error('❌ [InvoiceService] Error parseando PDF:', err);
        return {
            success: false,
            nit: null,
            date: normalizeDateToYMD(),
            consecutive: String(Date.now()),
            error: err.message
        };
    }
};

// =============================================================================
// ALMACENAMIENTO Y CONSULTA DE FACTURAS
// =============================================================================

/**
 * Guarda un archivo PDF en el almacenamiento local estandarizado:
 * ./storage/facturas/<NIT_LIMPIO>__<FECHA_YYYY-MM-DD>__<TIMESTAMP_O_CONSECUTIVO>.pdf
 * 
 * @param {object} params
 * @param {Buffer} [params.buffer] Buffer binario del archivo
 * @param {string} [params.filePath] Ruta del archivo existente (para copiar o mover)
 * @param {string} params.nit NIT o Cédula limpia del cliente
 * @param {string} [params.date] Fecha YYYY-MM-DD
 * @param {string} [params.consecutive] Consecutivo o identificador único
 * @returns {{ success: boolean, fileName: string, fullPath: string, nit: string, date: string, consecutive: string }}
 */
export const saveInvoicePdf = ({ buffer, filePath, nit, date, consecutive } = {}) => {
    fs.mkdirSync(STORAGE_FACTURAS_DIR, { recursive: true });

    const cleanNit = cleanDocumentNumber(nit);
    if (!cleanNit) {
        throw new Error('Se requiere un NIT o documento válido para guardar la factura.');
    }

    const cleanDate = normalizeDateToYMD(date);
    const cleanNum = cleanConsecutive(consecutive);
    const fileName = `${cleanNit}__${cleanDate}__${cleanNum}.pdf`;
    const fullPath = path.resolve(STORAGE_FACTURAS_DIR, fileName);

    if (buffer && Buffer.isBuffer(buffer)) {
        fs.writeFileSync(fullPath, buffer);
    } else if (filePath && fs.existsSync(filePath)) {
        fs.copyFileSync(filePath, fullPath);
    } else {
        throw new Error('No se proporcionó contenido válido para el archivo PDF.');
    }

    console.log(`✅ [InvoiceService] Factura guardada: ${fileName} (${fullPath})`);
    return {
        success: true,
        fileName,
        fullPath,
        nit: cleanNit,
        date: cleanDate,
        consecutive: cleanNum
    };
};

/**
 * Escanea el directorio ./storage/facturas/ y busca todas las facturas
 * asociadas al NIT dado, ordenadas de más reciente a más antigua.
 * 
 * @param {string} nitInput NIT o Cédula a buscar
 * @returns {Array<{ nit: string, date: string, consecutive: string, fileName: string, fullPath: string }>}
 */
export const findInvoicesByNit = (nitInput) => {
    const cleanNit = cleanDocumentNumber(nitInput);
    if (!cleanNit) return [];

    try {
        if (!fs.existsSync(STORAGE_FACTURAS_DIR)) return [];
        const files = fs.readdirSync(STORAGE_FACTURAS_DIR);

        const prefix = `${cleanNit}__`;
        const matched = [];

        for (const file of files) {
            if (!file.startsWith(prefix) || !file.toLowerCase().endsWith('.pdf')) continue;

            // Formato esperado: <NIT>__<FECHA>__<CONSECUTIVO>.pdf
            const parts = file.split('__');
            if (parts.length >= 3) {
                const date = parts[1];
                const consecutive = parts.slice(2).join('__').replace(/\.pdf$/i, '');
                const fullPath = path.resolve(STORAGE_FACTURAS_DIR, file);

                matched.push({
                    nit: parts[0],
                    date,
                    consecutive,
                    fileName: file,
                    fullPath
                });
            }
        }

        // Ordenar de más reciente a más antiguo según fecha YYYY-MM-DD
        matched.sort((a, b) => {
            const cmp = b.date.localeCompare(a.date);
            if (cmp !== 0) return cmp;
            return b.consecutive.localeCompare(a.consecutive);
        });

        return matched;
    } catch (err) {
        console.error('❌ [InvoiceService] Error buscando facturas:', err);
        return [];
    }
};

// =============================================================================
// GESTIÓN DE SESIÓN Y COMANDO ADMINISTRATIVO !factura
// =============================================================================

/**
 * Determina si un remitente se encuentra en espera de subir un PDF o ingresar su NIT.
 * 
 * @param {string} from JID o teléfono del remitente
 * @returns {boolean}
 */
export const isWaitingFacturaUpload = (from) => {
    if (!from) return false;
    const cleanFrom = String(from).split('@')[0].split(':')[0].replace(/\D/g, '');
    return pendingFacturaUploads.has(cleanFrom) || pendingManualNit.has(cleanFrom);
};

/**
 * Limpia cualquier sesión pendiente de carga de facturas.
 * 
 * @param {string} from
 */
export const clearFacturaSession = (from) => {
    if (!from) return;
    const cleanFrom = String(from).split('@')[0].split(':')[0].replace(/\D/g, '');
    pendingFacturaUploads.delete(cleanFrom);

    const manualData = pendingManualNit.get(cleanFrom);
    if (manualData?.tempPath && fs.existsSync(manualData.tempPath)) {
        try { fs.unlinkSync(manualData.tempPath); } catch (e) {}
    }
    pendingManualNit.delete(cleanFrom);
};

/**
 * Procesa la recepción del comando !factura, tanto con archivo adjunto (caption)
 * como en flujo de dos pasos, e ingreso manual de NIT si el PDF no lo expone.
 * 
 * @param {object} ctx Contexto del mensaje entrante
 * @param {object} provider Instancia del proveedor de BuilderBot
 * @returns {Promise<boolean>} true si el mensaje fue manejado completamente
 */
export const handleFacturaUpload = async (ctx, provider) => {
    const from = ctx.from;
    const cleanFrom = String(from).split('@')[0].split(':')[0].replace(/\D/g, '');
    const rawBody = (ctx.body || '').trim();
    const bodyLower = rawBody.toLowerCase();

    // Enviar mensajes respondiendo de forma segura a c.us si from es @lid
    const replyJid = from.includes('@lid') ? `${cleanFrom}@c.us` : from;
    const sendMsg = async (text) => {
        try {
            await provider.sendMessage(replyJid, text, {});
        } catch (e) {
            try {
                const client = await getWppClient(provider);
                if (client?.sendText) await client.sendText(replyJid, text);
            } catch (e2) {
                try { await provider.sendMessage(from, text, {}); } catch (e3) {}
            }
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // CASO 1: Remitente en espera de NIT manual para una factura previa
    // ─────────────────────────────────────────────────────────────────────────
    if (pendingManualNit.has(cleanFrom)) {
        if (bodyLower === 'cancelar' || bodyLower === '0' || bodyLower === 'salir') {
            clearFacturaSession(from);
            await sendMsg('❌ Registro de factura cancelado.');
            return true;
        }

        const cleanNit = cleanDocumentNumber(rawBody);
        if (!cleanNit || cleanNit.length < 5) {
            await sendMsg('⚠️ El NIT o Cédula ingresado no parece válido. Por favor, escribe solo los números (sin dígito de verificación), o *cancelar* para salir:');
            return true;
        }

        const pending = pendingManualNit.get(cleanFrom);
        try {
            const saved = saveInvoicePdf({
                filePath: pending.tempPath,
                nit: cleanNit,
                date: pending.date,
                consecutive: pending.consecutive
            });

            // Limpiar archivo temporal
            try { if (fs.existsSync(pending.tempPath)) fs.unlinkSync(pending.tempPath); } catch (e) {}
            pendingManualNit.delete(cleanFrom);

            const successMsg = `✅ *Factura almacenada correctamente.*\n\n` +
                `📌 *NIT/CC:* ${saved.nit}\n` +
                `📅 *Fecha de generación:* ${saved.date}\n` +
                `🔢 *Consecutivo:* ${saved.consecutive}\n` +
                `📁 *Archivo:* \`${saved.fileName}\``;
            await sendMsg(successMsg);
            return true;
        } catch (errSave) {
            console.error('Error guardando factura manual:', errSave);
            await sendMsg(`❌ Error guardando factura: ${errSave.message}`);
            clearFacturaSession(from);
            return true;
        }
    }

    // Detectar si el mensaje entrante incluye un archivo o documento adjunto
    const esArchivo = ctx.hasMedia ||
        rawBody.includes('_event_media_') ||
        rawBody.includes('_event_document_') ||
        ctx.message?.documentMessage ||
        ctx.message?.imageMessage ||
        ctx.mimetype;

    // ─────────────────────────────────────────────────────────────────────────
    // CASO 2: Se envía el comando !factura (con PDF en el mismo mensaje o nuevo inicio)
    // ─────────────────────────────────────────────────────────────────────────
    if (bodyLower.startsWith('!factura')) {
        // Subcaso 2A: !factura acompañado de documento PDF (Caption)
        if (esArchivo) {
            await sendMsg('⏳ Procesando y analizando documento de factura electrónica...');
            try {
                const fileInfo = (ctx._mockFilePath && fs.existsSync(ctx._mockFilePath))
                    ? { filePath: ctx._mockFilePath, fileName: path.basename(ctx._mockFilePath) }
                    : await downloadAndSaveIncomingFile(ctx, provider, STORAGE_TEMP_DIR);
                if (!fileInfo || !fileInfo.filePath) {
                    await sendMsg('❌ No se pudo descargar el archivo adjunto. Por favor, intenta enviarlo nuevamente.');
                    return true;
                }

                const parsed = await extractDataFromInvoicePdf(fileInfo.filePath);

                if (parsed.nit) {
                    const saved = saveInvoicePdf({
                        filePath: fileInfo.filePath,
                        nit: parsed.nit,
                        date: parsed.date,
                        consecutive: parsed.consecutive
                    });
                    try { if (fs.existsSync(fileInfo.filePath)) fs.unlinkSync(fileInfo.filePath); } catch (e) {}
                    clearFacturaSession(from);

                    const successMsg = `✅ *Factura almacenada correctamente.*\n\n` +
                        `📌 *NIT/CC:* ${saved.nit}\n` +
                        `📅 *Fecha de generación:* ${saved.date}\n` +
                        `🔢 *Consecutivo:* ${saved.consecutive}\n` +
                        `📁 *Archivo:* \`${saved.fileName}\``;
                    await sendMsg(successMsg);
                    return true;
                } else {
                    // NIT no detectable en texto -> Solicitar manualmente
                    pendingManualNit.set(cleanFrom, {
                        tempPath: fileInfo.filePath,
                        date: parsed.date,
                        consecutive: parsed.consecutive,
                        timestamp: Date.now()
                    });
                    await sendMsg(
                        `⚠️ Se recibió el archivo PDF pero no pudimos detectar automáticamente el NIT del cliente.\n\n` +
                        `Por favor, responde a este mensaje con el número de *NIT o Cédula* (sin puntos ni dígito de verificación) para registrarla:\n\n` +
                        `_(O escribe *cancelar* para anular)_`
                    );
                    return true;
                }
            } catch (errProc) {
                console.error('Error procesando factura con caption:', errProc);
                await sendMsg(`❌ Ocurrió un error procesando el archivo PDF: ${errProc.message}`);
                return true;
            }
        }

        // Subcaso 2B: !factura enviado como texto solo -> Iniciar espera de PDF
        pendingFacturaUploads.set(cleanFrom, { timestamp: Date.now() });
        const promptMsg = `📄 *Carga de Factura Electrónica*\n\n` +
            `Por favor, envía a continuación el archivo *PDF* de la factura que deseas ingresar al sistema:\n\n` +
            `_(Escribe *cancelar* si deseas anular la carga)_`;
        await sendMsg(promptMsg);
        return true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CASO 3: Remitente estaba en espera de enviar el PDF de la factura
    // ─────────────────────────────────────────────────────────────────────────
    if (pendingFacturaUploads.has(cleanFrom)) {
        if (bodyLower === 'cancelar' || bodyLower === '0' || bodyLower === 'salir') {
            clearFacturaSession(from);
            await sendMsg('❌ Carga de factura cancelada.');
            return true;
        }

        if (esArchivo) {
            await sendMsg('⏳ Procesando y analizando documento de factura electrónica...');
            try {
                const fileInfo = (ctx._mockFilePath && fs.existsSync(ctx._mockFilePath))
                    ? { filePath: ctx._mockFilePath, fileName: path.basename(ctx._mockFilePath) }
                    : await downloadAndSaveIncomingFile(ctx, provider, STORAGE_TEMP_DIR);
                if (!fileInfo || !fileInfo.filePath) {
                    await sendMsg('❌ No se pudo descargar el archivo adjunto. Intenta enviarlo nuevamente.');
                    return true;
                }

                pendingFacturaUploads.delete(cleanFrom);
                const parsed = await extractDataFromInvoicePdf(fileInfo.filePath);

                if (parsed.nit) {
                    const saved = saveInvoicePdf({
                        filePath: fileInfo.filePath,
                        nit: parsed.nit,
                        date: parsed.date,
                        consecutive: parsed.consecutive
                    });
                    try { if (fs.existsSync(fileInfo.filePath)) fs.unlinkSync(fileInfo.filePath); } catch (e) {}

                    const successMsg = `✅ *Factura almacenada correctamente.*\n\n` +
                        `📌 *NIT/CC:* ${saved.nit}\n` +
                        `📅 *Fecha de generación:* ${saved.date}\n` +
                        `🔢 *Consecutivo:* ${saved.consecutive}\n` +
                        `📁 *Archivo:* \`${saved.fileName}\``;
                    await sendMsg(successMsg);
                    return true;
                } else {
                    pendingManualNit.set(cleanFrom, {
                        tempPath: fileInfo.filePath,
                        date: parsed.date,
                        consecutive: parsed.consecutive,
                        timestamp: Date.now()
                    });
                    await sendMsg(
                        `⚠️ Se recibió el archivo PDF pero no pudimos detectar automáticamente el NIT del cliente.\n\n` +
                        `Por favor, responde a este mensaje con el número de *NIT o Cédula* (sin puntos ni dígito de verificación) para registrarla:\n\n` +
                        `_(O escribe *cancelar* para anular)_`
                    );
                    return true;
                }
            } catch (errProc) {
                console.error('Error procesando factura en dos pasos:', errProc);
                await sendMsg(`❌ Error procesando el archivo PDF: ${errProc.message}`);
                clearFacturaSession(from);
                return true;
            }
        } else {
            await sendMsg('📎 Por favor, adjunta el documento en formato *PDF* de la factura, o escribe *cancelar* si no deseas continuar.');
            return true;
        }
    }

    return false;
};
