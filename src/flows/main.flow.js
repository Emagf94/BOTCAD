import { addKeyword, EVENTS } from '@builderbot/bot';
import { BOT_MESSAGES, BOT_CUSTOM_NODES, renderMessage } from '../botConfig.js';
import { getUser, saveUser } from '../firebase.js';
import {
    globalFilesCache,
    isAdmin,
    activeBridgeChats,
    validateContactUser,
    validateName,
    formatName,
    sanitizeFilePath,
    getFileReference,
    downloadAndSaveIncomingFile,
    extractCloudLinks,
    safeSendLogo,
    safeSendSticker,
    getWppClient
} from '../utils/helpers.js';
import { flowAdminBridge, flowAdminBridgeLoop, flowAsesor, clientBridgeCapture, flowAdminInitiatedClientBridge } from './admin.flow.js';
import { flowEnvioDirectoArchivos, flowPagosFAQ, flowFAQ } from './faq.flow.js';
import {
    flowMenuCarteleras,
    flowMenuPlanos,
    flowMenuDocFotos,
    flowMenuGranFormato,
    flowMenuOtrosServicios,
    flowMenuSellos
} from './products.flow.js';

// ==========================================
// FLUJOS PRINCIPALES, CANCELACIÓN Y BIENVENIDA
// ==========================================

export const flowInactividad = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { endFlow, state, gotoFlow }) => {
        if (isAdmin(ctx) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            const cmd = ctx.body.trim().toLowerCase();
            if (cmd.startsWith('!chatear') || cmd.startsWith('!atender') || cmd.startsWith('!fin') || cmd.startsWith('!cola') || cmd.startsWith('!estado')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }

        globalFilesCache.delete(ctx.from);
        globalFilesCache.delete(ctx.from + '_directo');
        await state.clear();
        return endFlow('⏳ Sesión cerrada por inactividad de 10 minutos. Escribe "hola" para volver a empezar.');
    });

export const flowCancelar = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { provider, gotoFlow, state }) => {
        globalFilesCache.delete(ctx.from);
        globalFilesCache.delete(ctx.from + '_directo');
        await state.update({ archivos: [], archivosConfig: [], currentFileIndex: 0, itemName: '', tempSize: '' });
        await safeSendSticker(provider, ctx.from, './assets/chat_f.webp');
        return gotoFlow(flowMainMenu);
    });

export const flowMainMenu = addKeyword(EVENTS.ACTION)
    .addAnswer(
        [
            '¿En qué te podemos ayudar hoy? Escribe el *número*:',
            '',
            '*1.* 📌 Impresión de Carteleras',
            '*2.* 📐 Planos CAD',
            '*3.* 📄 Impresión Documentos y Fotos',
            '*4.* 🏙️ Gran Formato (Pendones, Adhesivos...)',
            '*5.* 🎁 Otros Servicios (Sublimación, Carnets...)',
            '*6.* 🔏 Sellos',
            '*7.* 📂 Envío Directo de Archivos',
            '*8.* 💳 Métodos de Pago',
            '*9.* ❓ Preguntas Frecuentes',
            '*10.* 👨‍💻 Hablar con un Asesor'
        ].join('\n'),
        { capture: true, delay: 1500, idle: 600000 },
        async (ctx, { gotoFlow, fallBack, state, flowDynamic, provider }) => {
            if (isAdmin(ctx) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
                console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
                const cmd = ctx.body.trim().toLowerCase();
                if (cmd.startsWith('!chatear') || cmd.startsWith('!atender') || cmd.startsWith('!fin') || cmd.startsWith('!cola') || cmd.startsWith('!estado')) return gotoFlow(flowAdminBridge);
                return gotoFlow(flowAdminBridgeLoop);
            }
            if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

            const rawBody = (ctx.body || '').trim();
            const esArchivo = rawBody.includes('_event_media_') ||
                rawBody.includes('_event_document_') ||
                rawBody.includes('_event_voice_note_') ||
                ctx.hasMedia ||
                ctx.message?.imageMessage ||
                ctx.message?.documentMessage;

            if (esArchivo) {
                try {
                    const fileInfo = await downloadAndSaveIncomingFile(ctx, provider, './downloads');
                    const filePath = fileInfo.filePath;
                    if (!globalFilesCache.has(ctx.from)) globalFilesCache.set(ctx.from, []);
                    globalFilesCache.get(ctx.from).push(filePath);
                    if (!globalFilesCache.has(ctx.from + '_directo')) globalFilesCache.set(ctx.from + '_directo', []);
                    globalFilesCache.get(ctx.from + '_directo').push(fileInfo);
                    const currentFiles = state.getMyState()?.archivos || [];
                    await state.update({ archivos: [...currentFiles, filePath] });
                    console.log(`[CAD Bot] Archivo de menú principal guardado: ${fileInfo.originalName}`);
                } catch (e) {
                    console.error("Error guardando archivo en flowMainMenu:", e);
                    const filePath = getFileReference(ctx, null);
                    if (!globalFilesCache.has(ctx.from)) globalFilesCache.set(ctx.from, []);
                    globalFilesCache.get(ctx.from).push(filePath);
                    if (!globalFilesCache.has(ctx.from + '_directo')) globalFilesCache.set(ctx.from + '_directo', []);
                    globalFilesCache.get(ctx.from + '_directo').push(filePath);
                    const currentFiles = state.getMyState()?.archivos || [];
                    await state.update({ archivos: [...currentFiles, filePath] });
                }
                return fallBack('📎 *Archivo recibido y guardado.* Por favor, selecciona una opción del *1 al 10* para saber cómo procesarlo (ej: *1* Carteleras, *2* Planos, *3* Documentos, *7* Envío Directo al Asesor):');
            }

            const cloudLinks = extractCloudLinks(rawBody);
            if (cloudLinks.length > 0) {
                if (!globalFilesCache.has(ctx.from + '_directo')) globalFilesCache.set(ctx.from + '_directo', []);
                const directFiles = globalFilesCache.get(ctx.from + '_directo');
                for (const l of cloudLinks) {
                    directFiles.push({
                        filePath: `LINK:${l}`,
                        originalName: l,
                        isLink: true
                    });
                }
                return fallBack('🔗 *Enlace recibido y guardado.* Por favor, selecciona una opción del *1 al 10* para procesarlo (te sugerimos la opción *7* para Envío Directo al Asesor):');
            }

            const op = rawBody;
            const flows = {
                '1': flowMenuCarteleras,
                '2': flowMenuPlanos,
                '3': flowMenuDocFotos,
                '4': flowMenuGranFormato,
                '5': flowMenuOtrosServicios,
                '6': flowMenuSellos,
                '7': flowEnvioDirectoArchivos,
                '8': flowPagosFAQ,
                '9': flowFAQ,
                '10': flowAsesor
            };
            if (flows[op]) return gotoFlow(flows[op]);

            // Búsqueda en nodos personalizados creados en el Flow Graph
            const cleanBody = rawBody.toLowerCase();
            for (const [nodeId, nodeData] of Object.entries(BOT_CUSTOM_NODES)) {
                const triggers = (nodeData.triggers || []).map(t => (typeof t === 'string' ? t.toLowerCase().trim() : ''));
                if (triggers.some(t => t && cleanBody.includes(t))) {
                    const phoneId = ctx.from.split('@')[0];
                    const stateData = (state && state.getMyState) ? (state.getMyState() || {}) : {};
                    const replyText = renderMessage(nodeData.response || '', {
                        name: stateData.userName || 'Cliente',
                        phone: phoneId,
                        itemName: stateData.itemName || '',
                        totalPrice: stateData.totalPrice || 0
                    });
                    await new Promise(r => setTimeout(r, 1000));
                    await flowDynamic(replyText);
                    return;
                }
            }

            return fallBack('❌ Opción inválida. Escribe un número del 1 al 10.');
        }
    );

export const flowContactUserCapture = addKeyword(EVENTS.ACTION)
    .addAnswer('📱 Debido a las nuevas políticas de privacidad de Whatsapp, tu número está oculto. Por favor, escribe tu *número de teléfono o usuario (@)* para poder contactarte sobre tus pedidos:', { capture: true, delay: 1500, idle: 600000 }, async (ctx, { gotoFlow, state, provider, fallBack }) => {
        if (isAdmin(ctx) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            const cmd = ctx.body.trim().toLowerCase();
            if (cmd.startsWith('!chatear') || cmd.startsWith('!atender') || cmd.startsWith('!fin') || cmd.startsWith('!cola') || cmd.startsWith('!estado')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        const rawBody = (ctx.body || '').trim();
        const esArchivo = rawBody.includes('_event_media_') ||
            rawBody.includes('_event_document_') ||
            rawBody.includes('_event_voice_note_') ||
            ctx.hasMedia ||
            ctx.message?.imageMessage ||
            ctx.message?.documentMessage;

        if (esArchivo) {
            try {
                const fileInfo = await downloadAndSaveIncomingFile(ctx, provider, './downloads');
                const filePath = fileInfo.filePath;
                if (!globalFilesCache.has(ctx.from)) globalFilesCache.set(ctx.from, []);
                globalFilesCache.get(ctx.from).push(filePath);
                if (!globalFilesCache.has(ctx.from + '_directo')) globalFilesCache.set(ctx.from + '_directo', []);
                globalFilesCache.get(ctx.from + '_directo').push(fileInfo);
                const currentFiles = state.getMyState()?.archivos || [];
                await state.update({ archivos: [...currentFiles, filePath] });
                console.log(`[CAD Bot] Archivo en flowContactUserCapture guardado: ${fileInfo.originalName}`);
            } catch (e) {
                console.error("Error guardando archivo en flowContactUserCapture:", e);
                const filePath = getFileReference(ctx, null);
                if (!globalFilesCache.has(ctx.from)) globalFilesCache.set(ctx.from, []);
                globalFilesCache.get(ctx.from).push(filePath);
                if (!globalFilesCache.has(ctx.from + '_directo')) globalFilesCache.set(ctx.from + '_directo', []);
                globalFilesCache.get(ctx.from + '_directo').push(filePath);
                const currentFiles = state.getMyState()?.archivos || [];
                await state.update({ archivos: [...currentFiles, filePath] });
            }
            return fallBack('📎 ¡Archivo recibido! Por favor, escribe tu *número de teléfono o usuario (@)* para poder contactarte sobre tus pedidos:');
        }

        const cloudLinks = extractCloudLinks(rawBody);
        if (cloudLinks.length > 0) {
            if (!globalFilesCache.has(ctx.from + '_directo')) globalFilesCache.set(ctx.from + '_directo', []);
            const directFiles = globalFilesCache.get(ctx.from + '_directo');
            for (const l of cloudLinks) {
                directFiles.push({
                    filePath: `LINK:${l}`,
                    originalName: l,
                    isLink: true
                });
            }
            return fallBack('🔗 ¡Enlace recibido! Por favor, escribe tu *número de teléfono o usuario (@)* para poder contactarte sobre tus pedidos:');
        }

        const contactUser = rawBody;
        const errorMsg = validateContactUser(contactUser);
        if (errorMsg) {
            return fallBack(errorMsg);
        }

        const phone = ctx.from.split('@')[0];
        const name = state.getMyState()?.userName || '';

        await saveUser(phone, { name, contactUser: contactUser });
        await state.update({ contactUser: contactUser });

        return gotoFlow(flowWelcomeRegistered);
    });

export const flowNameCapture = addKeyword(EVENTS.ACTION)
    .addAnswer('Para brindarte un mejor servicio, ¿cómo te llamas?', { capture: true, delay: 1500, idle: 600000 }, async (ctx, { gotoFlow, state, provider, fallBack }) => {
        if (isAdmin(ctx) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            const cmd = ctx.body.trim().toLowerCase();
            if (cmd.startsWith('!chatear') || cmd.startsWith('!atender') || cmd.startsWith('!fin') || cmd.startsWith('!cola') || cmd.startsWith('!estado')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        const rawBody = (ctx.body || '').trim();
        const esArchivo = rawBody.includes('_event_media_') ||
            rawBody.includes('_event_document_') ||
            rawBody.includes('_event_voice_note_') ||
            ctx.hasMedia ||
            ctx.message?.imageMessage ||
            ctx.message?.documentMessage;

        if (esArchivo) {
            try {
                const fileInfo = await downloadAndSaveIncomingFile(ctx, provider, './downloads');
                const filePath = fileInfo.filePath;
                if (!globalFilesCache.has(ctx.from)) globalFilesCache.set(ctx.from, []);
                globalFilesCache.get(ctx.from).push(filePath);
                if (!globalFilesCache.has(ctx.from + '_directo')) globalFilesCache.set(ctx.from + '_directo', []);
                globalFilesCache.get(ctx.from + '_directo').push(fileInfo);
                const currentFiles = state.getMyState()?.archivos || [];
                await state.update({ archivos: [...currentFiles, filePath] });
                console.log(`[CAD Bot] Archivo en flowNameCapture guardado: ${fileInfo.originalName}`);
            } catch (e) {
                console.error("Error guardando archivo en flowNameCapture:", e);
                const filePath = getFileReference(ctx, null);
                if (!globalFilesCache.has(ctx.from)) globalFilesCache.set(ctx.from, []);
                globalFilesCache.get(ctx.from).push(filePath);
                if (!globalFilesCache.has(ctx.from + '_directo')) globalFilesCache.set(ctx.from + '_directo', []);
                globalFilesCache.get(ctx.from + '_directo').push(filePath);
                const currentFiles = state.getMyState()?.archivos || [];
                await state.update({ archivos: [...currentFiles, filePath] });
            }
            return fallBack('📎 ¡Archivo recibido! Para registrarte y atenderte, por favor indícanos primero tu *nombre*:');
        }

        // Validación estricta del nombre (sin saludos, números ni símbolos)
        const validationError = validateName(rawBody);
        if (validationError) {
            return fallBack(validationError);
        }

        const name = formatName(rawBody);
        await state.update({ userName: name });

        return gotoFlow(flowContactUserCapture);
    });

export const flowWelcomeRegistered = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, state, gotoFlow }) => {
        if (isAdmin(ctx) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            const cmd = ctx.body.trim().toLowerCase();
            if (cmd.startsWith('!chatear') || cmd.startsWith('!atender') || cmd.startsWith('!fin') || cmd.startsWith('!cola') || cmd.startsWith('!estado')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        const name = state.getMyState()?.userName || '';
        await new Promise(r => setTimeout(r, 1500));
        await flowDynamic(`¡Gracias ${name}!`);
        return gotoFlow(flowMainMenu);
    });

export const flowWelcome = addKeyword(EVENTS.WELCOME)
    .addAction(async (ctx, { gotoFlow, state, flowDynamic, provider }) => {
        if (isAdmin(ctx) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            const cmd = ctx.body.trim().toLowerCase();
            if (cmd.startsWith('!chatear') || cmd.startsWith('!atender') || cmd.startsWith('!fin') || cmd.startsWith('!cola') || cmd.startsWith('!estado')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        const rawBody = (ctx.body || '').trim().toLowerCase();
        const isMenuReturn = ['0', 'menu', 'menú', 'volver', 'inicio'].includes(rawBody);

        if (isMenuReturn) {
            return gotoFlow(flowMainMenu);
        }

        // Detectar si el usuario envió un archivo o multimedia en su primera interacción
        const esArchivoInicial = rawBody.includes('_event_media_') ||
            rawBody.includes('_event_document_') ||
            rawBody.includes('_event_voice_note_') ||
            ctx.hasMedia ||
            ctx.message?.imageMessage ||
            ctx.message?.documentMessage;

        if (esArchivoInicial) {
            try {
                const fileInfo = await downloadAndSaveIncomingFile(ctx, provider, './downloads');
                const filePath = fileInfo.filePath;
                if (!globalFilesCache.has(ctx.from)) globalFilesCache.set(ctx.from, []);
                globalFilesCache.get(ctx.from).push(filePath);
                if (!globalFilesCache.has(ctx.from + '_directo')) globalFilesCache.set(ctx.from + '_directo', []);
                globalFilesCache.get(ctx.from + '_directo').push(fileInfo);
                const currentFiles = state.getMyState()?.archivos || [];
                await state.update({ archivos: [...currentFiles, filePath] });
                console.log(`[CAD Bot] Archivo de bienvenida guardado: ${fileInfo.originalName}`);
            } catch (e) {
                console.error("Error guardando archivo en flowWelcome:", e);
                const filePath = getFileReference(ctx, null);
                if (!globalFilesCache.has(ctx.from)) globalFilesCache.set(ctx.from, []);
                globalFilesCache.get(ctx.from).push(filePath);
                if (!globalFilesCache.has(ctx.from + '_directo')) globalFilesCache.set(ctx.from + '_directo', []);
                globalFilesCache.get(ctx.from + '_directo').push(filePath);
                const currentFiles = state.getMyState()?.archivos || [];
                await state.update({ archivos: [...currentFiles, filePath] });
            }
        }

        // Chequear si el mensaje inicial coincide con algún nodo personalizado
        const cleanWelcomeBody = rawBody;
        for (const [nodeId, nodeData] of Object.entries(BOT_CUSTOM_NODES)) {
            const triggers = (nodeData.triggers || []).map(t => (typeof t === 'string' ? t.toLowerCase().trim() : ''));
            if (triggers.some(t => t && cleanWelcomeBody.includes(t))) {
                const phone = ctx.from.split('@')[0];
                const user = await getUser(phone);
                const replyText = renderMessage(nodeData.response || '', {
                    name: user?.name || 'Cliente',
                    phone: phone
                });
                await new Promise(r => setTimeout(r, 1000));
                await flowDynamic(replyText);
                return gotoFlow(flowMainMenu);
            }
        }

        const phone = ctx.from.split('@')[0];
        const user = await getUser(phone);

        if (user && user.name) {
            await state.update({ userName: user.name, contactUser: user.contactUser || '' });
            await new Promise(r => setTimeout(r, 1500));
            const msg = renderMessage('bienvenidaRegistrado', { name: user.name });
            await safeSendLogo(provider, ctx.from, msg);
            return gotoFlow(flowMainMenu);
        } else {
            await new Promise(r => setTimeout(r, 1500));
            const msg = BOT_MESSAGES.bienvenidaNuevo || '¡Hola!\nSoy *Cadi*, tu asistente virtual 🤖.\n¡Bienvenido a *CAD Impresiones* 🖨️!';
            await safeSendLogo(provider, ctx.from, msg);
            return gotoFlow(flowNameCapture);
        }
    });
