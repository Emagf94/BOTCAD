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
import { activeBridgeChats, isAdmin, getWppClient } from './utils/helpers.js';
import { patchWppMediaPrep } from './utils/fileHandler.js';

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
    const isHeadless = process.env.HEADLESS === 'true';
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
