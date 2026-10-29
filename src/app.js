import { createBot, createProvider, createFlow } from '@builderbot/bot';
import { MemoryDB as Database } from '@builderbot/bot';
import { WPPConnectProvider as Provider } from '@builderbot/provider-wppconnect';
import { initBotConfig } from './botConfig.js';
import { allFlows } from './flows/index.js';
import fs from 'fs';
import {
    initSessionGuard,
    cleanCorruptLockfiles,
    restoreSessionIfNeeded,
    getGuardianProviderOptions,
    updateQRStatus,
    updateHostPhone
} from './sessionGuard.js';
import { activeBridgeChats, getWppClient, findActiveBridge, downloadAndSaveIncomingFile, deliverFileToRecipient } from './utils/helpers.js';
import { patchWppMediaPrep } from './utils/fileHandler.js';
import { initBroadcastService } from './services/broadcastService.js';
import { initAdvisorService } from './services/advisorService.js';
import { resolveAdvisorIdentity, isAdmin } from './services/advisorAuthService.js';
import { dispatchAdvisorCommand } from './services/commandDispatcher.js';

// Cargar variables de entorno desde .env si existe (nativo en Node 20+)
if (typeof process.loadEnvFile === 'function') {
    try {
        process.loadEnvFile();
    } catch {
        // Archivo .env opcional
    }
}

const PORT = process.env.PORT ?? 3008;

/**
 * Función principal que arranca el Bot de WhatsApp de CAD Impresiones,
 * sincroniza la configuración con Firebase Firestore e inicializa el servidor HTTP.
 */
export let botInstance = null;

const main = async () => {
    // ═══ SESSION GUARDIAN: Pre-arranque ═══
    // Limpiar lockfiles y auto-curar sesión desde backup si fuera necesario
    cleanCorruptLockfiles();
    restoreSessionIfNeeded();

    // 1. Sincronizar configuraciones dinámicas (precios, horarios, textos) desde Firebase
    await initBotConfig();

    // 2. Configurar los flujos conversacionales modularizados
    const adapterFlow = createFlow(allFlows);

    // 3. Inicializar WPPConnect con directivas blindadas Anti-Throttling 24/7 (autoClose: 0)
    // Por defecto Chromium VISIBLE en pantalla salvo que HEADLESS='true'
    const isHeadless = process.env.HEADLESS === 'true';
    console.log(`🌐 [App] Modo de visualización de Chromium: ${isHeadless ? 'HEADLESS (Invisible)' : 'VISIBLE EN PANTALLA (Ventana Gráfica Abierta)'}`);
    const adapterProvider = createProvider(Provider, getGuardianProviderOptions(isHeadless));

    // Capturar eventos de autenticación y vinculación de WPPConnect para la UI del Dashboard
    adapterProvider.on('require_action', (payload) => {
        const qr = payload?.payload?.qr;
        if (qr) {
            updateQRStatus(qr);
        }
    });

    adapterProvider.on('host', (host) => {
        if (host?.phone) {
            updateHostPhone(host.phone);
        }
    });

    // ═══ SESSION GUARDIAN: Activar sistema de estabilidad infalible ═══
    // Activa la armadura FS, latido zero-idle, watchdog WAPI, backups espejo y sincronización UI
    initSessionGuard(adapterProvider);

    // ═══ BROADCAST SERVICE: Inicializar servicio de difusión masiva ═══
    initBroadcastService(adapterProvider);

    // ═══ ADVISOR SERVICE: Inicializar servicio de pruebas de asesores y alertas ═══
    initAdvisorService(adapterProvider);

    // 4. Base de datos de sesión en memoria
    const adapterDB = new Database();

    // La intercepción ahora es manejada nativamente por el flujo de BuilderBot.
    adapterProvider.on('message', (payload) => {
        if (payload && payload.body) {
            try { fs.appendFileSync('debug.log', `[MSG] FROM: ${payload.from} | BODY: ${payload.body}\n`); } catch(e){}
        }
    });

    // 5. Iniciar el bot y el servidor HTTP
    botInstance = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB
    });

    // =====================================================================
    // COLA SECUENCIAL POR USUARIO (Resuelve archivos múltiples y reenvíos concurrentes)
    // =====================================================================
    const originalHandleMsg = botInstance.handleMsg.bind(botInstance);
    const userMessageQueues = new Map();

    botInstance.handleMsg = async (messageCtxInComing) => {
        const from = messageCtxInComing?.from;
        if (!from) return originalHandleMsg(messageCtxInComing);

        const rawBody = (messageCtxInComing?.body || '').trim();
        const isCommand = rawBody.startsWith('!');
        const activeClientPhone = findActiveBridge(from);

        // ═════════════════════════════════════════════════════════════════════
        // PILAR 1: INTERCEPTOR MAESTRO DE COMANDOS DE ASESORES / ADMINISTRADORES
        // ═════════════════════════════════════════════════════════════════════
        if (isCommand) {
            try {
                const wppClient = await getWppClient(adapterProvider).catch(() => null);
                const authInfo = await resolveAdvisorIdentity(messageCtxInComing, wppClient);

                if (authInfo.isAuthorized) {
                    console.log(`🛡️ [MasterInterceptor] Interceptando comando "${rawBody}" de "${authInfo.advisor?.name || 'Asesor'}" (ID: ${authInfo.matchedIdentifier})`);

                    // 1. Limpiar estados residuales de captura de clientes en BuilderBot para este asesor
                    try {
                        if (botInstance.stateHandler?.clear) {
                            botInstance.stateHandler.clear(from);
                        }
                        if (adapterDB?.list && Array.isArray(adapterDB.list)) {
                            adapterDB.list = adapterDB.list.filter(item => item.from !== from);
                        }
                    } catch (eClean) {}

                    // 2. Ejecutar a través del Despachador Centralizado
                    await dispatchAdvisorCommand({
                        ctx: messageCtxInComing,
                        provider: adapterProvider,
                        authInfo
                    });
                    return; // Retorno inmediato: BuilderBot NUNCA interferirá con el comando
                }
            } catch (errAuth) {
                console.error('⚠️ [MasterInterceptor] Error evaluando identidad de asesor:', errAuth);
            }
        }

        // ═════════════════════════════════════════════════════════════════════
        // PILAR 2: PUENTE DIRECTO DE CHAT ACTIVO ASESOR -> CLIENTE
        // ═════════════════════════════════════════════════════════════════════
        // Si el asesor está en soporte activo y envía texto normal o archivos (no comandos)
        if (activeClientPhone && !isCommand) {
            try {
                const wppClient = await getWppClient(adapterProvider).catch(() => null);
                const authInfo = await resolveAdvisorIdentity(messageCtxInComing, wppClient);

                if (authInfo.isAuthorized) {
                    const esMedia = (rawBody.includes('_media_') || rawBody.includes('_document_') || rawBody.includes('_image_') || rawBody.includes('_voice_note_') || rawBody.includes('_video_') || rawBody.includes('_event_')) ||
                        messageCtxInComing.hasMedia || messageCtxInComing.message?.imageMessage || messageCtxInComing.message?.documentMessage;

                    let caption = rawBody;
                    if (caption.includes('_event_') || caption.includes('_media_') || caption.includes('_document_') || caption.includes('_image_') || caption.includes('_voice_note_') || caption.includes('_video_')) {
                        caption = '';
                    }

                    const advName = authInfo.advisor?.name || 'Asesor';

                    if (esMedia) {
                        try {
                            const fileInfo = await downloadAndSaveIncomingFile(messageCtxInComing, adapterProvider, './downloads');
                            await deliverFileToRecipient(adapterProvider, activeClientPhone, fileInfo, `👨‍💻 *${advName}:* ${caption}`);
                        } catch (errMedia) {
                            console.error('Error enviando media asesor -> cliente:', errMedia);
                            await adapterProvider.sendMessage(activeClientPhone, `👨‍💻 *${advName}:* [Archivo/Audio enviado]`, {});
                        }
                    } else {
                        await adapterProvider.sendMessage(activeClientPhone, `👨‍💻 *${advName}:* ${rawBody}`, {});
                    }
                    return; // Retorno inmediato: el mensaje ya fue entregado al cliente
                }
            } catch (errBridge) {
                console.error('⚠️ [MasterBridge] Error en reenvío asesor -> cliente:', errBridge);
            }
        }

        // =====================================================================
        // COLA SECUENCIAL POR USUARIO (Para flujos normales de clientes)
        // =====================================================================
        const previousPromise = userMessageQueues.get(from) || Promise.resolve();
        const currentPromise = previousPromise
            .catch(() => {})
            .then(async () => {
                return await Promise.race([
                    originalHandleMsg(messageCtxInComing),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error(`Timeout de procesamiento para mensaje de ${from}`)), 45000)
                    )
                ]);
            })
            .catch((err) => {
                console.error(`⚠️ [UserQueue] Error procesando mensaje de ${from}:`, err.message);
            })
            .finally(() => {
                if (userMessageQueues.get(from) === currentPromise) {
                    userMessageQueues.delete(from);
                }
            });

        userMessageQueues.set(from, currentPromise);
        return currentPromise;
    };
    
    botInstance.httpServer(+PORT);
    console.log(`🚀 [CAD Bot] Servidor y bot iniciados correctamente en el puerto ${PORT}`);

    // Diagnóstico de inicialización de WPPConnect / BuilderBot (no bloqueante)
    setTimeout(async () => {
        try {
            const client = await getWppClient(adapterProvider);
            console.log(`🔍 [DIAGNÓSTICO WPPCONNECT]`);
            console.log(`   - adapterProvider.vendor: ${!!adapterProvider.vendor}`);
            console.log(`   - adapterProvider.getInstance: ${typeof adapterProvider.getInstance}`);
            console.log(`   - getWppClient resuelto: ${!!client}`);
            if (client) {
                console.log(`   - client.sendFile: ${typeof client.sendFile}`);
                console.log(`   - client.sendImage: ${typeof client.sendImage}`);
                console.log(`   - client.sendImageAsSticker: ${typeof client.sendImageAsSticker}`);
                const isPatched = await patchWppMediaPrep(client);
                console.log(`   - MediaPrep status (prepRawMedia): ${isPatched ? '✅ Activo / Protegido' : '⚠️ Pendiente'}`);
            }
        } catch (diagErr) {
            console.warn(`⚠️ [DIAGNÓSTICO] Error en verificación: ${diagErr.message}`);
        }
    }, 10000);
};

main();
