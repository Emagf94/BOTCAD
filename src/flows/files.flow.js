import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import { addKeyword, EVENTS } from '@builderbot/bot';
import {
    globalFilesCache,
    isAdmin,
    sanitizeFilePath,
    getFileReference,
    downloadAndSaveIncomingFile
} from '../utils/helpers.js';
import { flowAdminBridge, flowAdminBridgeLoop } from './admin.flow.js';
import { flowCancelar, flowInactividad } from './main.flow.js';
import { flowResumenPedido } from './payment.flow.js';

// ==========================================
// CONFIGURACIÓN DE ARCHIVOS (PÁGINAS Y COPIAS)
// ==========================================

export const flowPreguntarPaginas = addKeyword(EVENTS.ACTION)
    .addAnswer('No pudimos contar las páginas automáticamente. ¿Cuántas *páginas* tiene este archivo?', { capture: true, delay: 1000, idle: 600000 }, async (ctx, { state, fallBack, gotoFlow }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        const op = parseInt(ctx.body.trim());
        if (isNaN(op) || op <= 0) return fallBack('❌ Ingresa un número válido mayor a 0.');
        
        let data = state.getMyState();
        data.archivosConfig[data.currentFileIndex].pages = op;
        await state.update({ archivosConfig: data.archivosConfig });
        return gotoFlow(flowConfigurarArchivoPaso2);
    });

export const flowConfigurarArchivoPaso2 = addKeyword(EVENTS.ACTION)
    .addAnswer('¿Cuántas *copias* deseas de este archivo?', { capture: true, delay: 1000, idle: 600000 }, async (ctx, { state, fallBack, gotoFlow }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        const op = parseInt(ctx.body.trim());
        if (isNaN(op) || op <= 0) return fallBack('❌ Por favor ingresa un número válido mayor a 0.');
        
        let data = state.getMyState();
        data.archivosConfig[data.currentFileIndex].copies = op;
        await state.update({ archivosConfig: data.archivosConfig, currentFileIndex: data.currentFileIndex + 1 });
        
        return gotoFlow(flowConfigurarArchivoPaso1);
    });

export const flowConfigurarArchivoPaso1 = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        const data = state.getMyState();
        if (data.currentFileIndex >= data.archivos.length) {
            return gotoFlow(flowResumenPedido);
        }
        
        const filePath = data.archivos[data.currentFileIndex];
        
        await new Promise(r => setTimeout(r, 1000));
        await flowDynamic(`⚙️ Configurando archivo ${data.currentFileIndex + 1} de ${data.archivos.length}...`);

        if (filePath.startsWith('MSG_ID:')) {
            data.archivosConfig.push({ pages: 1, copies: 1 });
            await state.update({ archivosConfig: data.archivosConfig });
            await new Promise(r => setTimeout(r, 500));
            await flowDynamic(`📄 (Archivo pesado: 1 página por defecto)`);
            return gotoFlow(flowConfigurarArchivoPaso2);
        }

        const ext = filePath.split('.').pop().toLowerCase();
        
        if (ext === 'pdf') {
            try {
                const pdfBytes = fs.readFileSync(filePath);
                const pdfDoc = await PDFDocument.load(pdfBytes);
                const pages = pdfDoc.getPageCount();
                data.archivosConfig.push({ pages: pages, copies: 1 });
                await state.update({ archivosConfig: data.archivosConfig });
                await new Promise(r => setTimeout(r, 500));
                await flowDynamic(`📄 (PDF detectado con ${pages} página(s))`);
                return gotoFlow(flowConfigurarArchivoPaso2);
            } catch (e) {
                console.error("Error leyendo PDF", e);
                data.archivosConfig.push({ pages: 1, copies: 1 }); // fallback
                return gotoFlow(flowPreguntarPaginas);
            }
        } else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
            data.archivosConfig.push({ pages: 1, copies: 1 });
            await state.update({ archivosConfig: data.archivosConfig });
            await new Promise(r => setTimeout(r, 500));
            await flowDynamic(`🖼️ (Imagen detectada: 1 página)`);
            return gotoFlow(flowConfigurarArchivoPaso2);
        } else {
            // Word, Excel, etc.
            data.archivosConfig.push({ pages: 1, copies: 1 });
            await state.update({ archivosConfig: data.archivosConfig });
            return gotoFlow(flowPreguntarPaginas);
        }
    });

// ==========================================
// RECEPCIÓN DE ARCHIVOS
// ==========================================

export const flowRecibirArchivosLoop = addKeyword(EVENTS.ACTION)
    .addAction({ capture: true, idle: 600000 }, async (ctx, { state, gotoFlow, flowDynamic, provider }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        const texto = (ctx.body || '').trim().toLowerCase();
        if (['0', 'menu', 'menú', 'volver'].includes(texto)) { globalFilesCache.delete(ctx.from); return gotoFlow(flowCancelar); }

        const esMedia = texto.includes('_media_') || 
                        texto.includes('_document_') || 
                        texto.includes('_image_') || 
                        ctx.hasMedia || 
                        ctx.mimetype ||
                        ctx.message?.imageMessage || 
                        ctx.message?.documentMessage;

        if (esMedia) {
            try {
                const fileInfo = await downloadAndSaveIncomingFile(ctx, provider, './downloads');
                let filePath = fileInfo.filePath;
                const ext = fileInfo.ext;

                const data = state.getMyState() || {};
                const itemName = data.itemName || '';
                const requiresPDF = itemName.startsWith('Documento') || itemName.startsWith('Sello');
                const isCartelera = itemName.startsWith('Cartelera');
                const isPlano = itemName.startsWith('Plano');
                const requiresRestrictedExts = requiresPDF || isCartelera || isPlano;

                if (!filePath.startsWith('MSG_ID:')) {
                    let allowedExts = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
                    if (isCartelera) {
                        allowedExts.push('ppt', 'pptx');
                    } else if (isPlano) {
                        allowedExts.push('dwg', 'dxf');
                    }

                    if (requiresRestrictedExts && !allowedExts.includes(ext)) {
                        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch(e) {}
                        await new Promise(r => setTimeout(r, 1000));
                        let formatMsg = '*PDF o Imágenes*';
                        if (isCartelera) formatMsg = '*PDF, Imágenes o PowerPoint*';
                        else if (isPlano) formatMsg = '*PDF, Imágenes o AutoCAD (DWG/DXF)*';
                        await provider.sendMessage(ctx.from, `⚠️ *Atención:* Para ${itemName.split(' ')[0]}s, solo aceptamos archivos en formato ${formatMsg}. Por favor convierte tu archivo y envíalo nuevamente.`, {});
                        return gotoFlow(flowRecibirArchivosLoop);
                    }
                }

                if (!globalFilesCache.has(ctx.from)) globalFilesCache.set(ctx.from, []);
                const userFiles = globalFilesCache.get(ctx.from);
                userFiles.push(filePath);
                await state.update({ archivos: userFiles });
                await new Promise(r => setTimeout(r, 1000));
                const nombreMostrar = fileInfo.originalName || 'Archivo';
                const cadTag = fileInfo.isCad ? ' 📐 *(AutoCAD CAD)*' : '';
                await provider.sendMessage(ctx.from, `✅ Archivo recibido: *${nombreMostrar}*${cadTag} (${userFiles.length} en total).\n\nPuedes enviar más archivos si lo deseas, o elige una opción:\n\n*1.* ✅ Ya envié todos (Continuar)\n*0.* ⬅️ Cancelar`, {});
            } catch (err) {
                console.error("Excepción en recepción de archivo (files.flow):", err);
                const filePath = getFileReference(ctx, null);
                if (!globalFilesCache.has(ctx.from)) globalFilesCache.set(ctx.from, []);
                const userFiles = globalFilesCache.get(ctx.from);
                userFiles.push(filePath);
                await state.update({ archivos: userFiles });
                await new Promise(r => setTimeout(r, 1000));
                await provider.sendMessage(ctx.from, `✅ Archivo recibido en modo seguro (${userFiles.length} en total). Puedes enviar más archivos si lo deseas, o elige una opción:\n\n*1.* ✅ Ya envié todos (Continuar)\n*0.* ⬅️ Cancelar`, {});
            }
            
            return gotoFlow(flowRecibirArchivosLoop);
        }

        if (texto === '1') {
            const archivos = state.getMyState()?.archivos || [];
            if (archivos.length === 0) {
                await flowDynamic('⚠️ No has enviado archivos. Adjúntalos o envía 0 para salir.');
                return gotoFlow(flowRecibirArchivosLoop);
            }
            globalFilesCache.delete(ctx.from);
            await state.update({ archivosConfig: [], currentFileIndex: 0 });
            return gotoFlow(flowConfigurarArchivoPaso1);
        }

        const archivosFallback = state.getMyState()?.archivos || [];
        await new Promise(r => setTimeout(r, 1500));
        if (archivosFallback.length > 0) {
            await flowDynamic('Por favor envía tus archivos por aquí. Si ya terminaste, elige una opción:\n\n*1.* ✅ Ya envié todos (Continuar)\n*0.* ⬅️ Cancelar');
        } else {
            await flowDynamic('Por favor envía tus archivos por aquí.\n\n*0.* ⬅️ Cancelar');
        }
        return gotoFlow(flowRecibirArchivosLoop);
    });

export const flowRecibirArchivos = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        const itemName = state.getMyState()?.itemName || '';
        const requiresPDF = itemName.startsWith('Documento') || itemName.startsWith('Sello');
        const isCartelera = itemName.startsWith('Cartelera');
        const isPlano = itemName.startsWith('Plano');
        const isGranFormato = itemName.startsWith('Pendón') || itemName.startsWith('Adhesivo') || itemName.startsWith('Pasacalle') || itemName.startsWith('Microperforado');
        
        const cached = globalFilesCache.get(ctx.from) || [];
        if (cached.length > 0) {
            await state.update({ archivos: cached });
            let msg = `📎 *Recepción de Archivos*\n✅ Ya tenemos detectado(s) *${cached.length}* archivo(s) que enviaste previamente.\n\nPuedes enviar más archivos si lo deseas, o selecciona:\n\n*1.* ✅ Continuar con estos archivos\n*0.* ⬅️ Cancelar`;
            await new Promise(r => setTimeout(r, 1000));
            await flowDynamic(msg);
            return gotoFlow(flowRecibirArchivosLoop);
        }

        let msg = `📎 *Recepción de Archivos*\nPor favor, envía por aquí los archivos. Puedes enviar varios.\n\n`;
        if (requiresPDF) {
            msg += `⚠️ *NOTA IMPORTANTE:* Para este servicio, SOLO se aceptan documentos en formato *PDF o Imágenes (Fotos)*.\n\n`;
        } else if (isCartelera) {
            msg += `⚠️ *NOTA IMPORTANTE:* Para este servicio, SOLO se aceptan documentos en formato *PDF, Imágenes (Fotos) o PowerPoint*.\n\n`;
        } else if (isPlano) {
            msg += `⚠️ *NOTA IMPORTANTE:* Para este servicio, SOLO se aceptan documentos en formato *PDF, Imágenes (Fotos) o AutoCAD (DWG/DXF)*.\n\n`;
        } else if (isGranFormato) {
            msg += `💡 *NOTA:* Para Gran Formato puedes enviar tus archivos de diseño en *CorelDraw (.cdr), Illustrator (.ai) o PDF*.\n\n`;
        }
        msg += `*0.* ⬅️ Cancelar`;
        
        await new Promise(r => setTimeout(r, 1000));
        await flowDynamic(msg);
        return gotoFlow(flowRecibirArchivosLoop);
    });
