import { createBot, createProvider, createFlow } from '@builderbot/bot';
import { MemoryDB as Database } from '@builderbot/bot';
import { WPPConnectProvider as Provider } from '@builderbot/provider-wppconnect';
import { initBotConfig } from './botConfig.js';
import { allFlows } from './flows/index.js';
import fs from 'fs';
import { initSessionGuard, startPeriodicBackups, cleanCorruptLockfiles, restoreSessionIfNeeded } from './sessionGuard.js';
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
    // ═══ SESSION GUARD: Pre-arranque ═══
    // Limpiar lockfiles corruptos ANTES de que Chromium intente arrancar.
    // Esto previene que la sesión se invalide después de un reinicio brusco del PC.
    cleanCorruptLockfiles();
    restoreSessionIfNeeded();

    // 1. Sincronizar configuraciones dinámicas (precios, horarios, textos) desde Firebase
    await initBotConfig();

    // 2. Configurar los flujos conversacionales modularizados
    const adapterFlow = createFlow(allFlows);

    // 3. Inicializar el proveedor WPPConnect para WhatsApp con opciones optimizadas para 24/7
    const isHeadless = process.env.HEADLESS === 'true';
    const adapterProvider = createProvider(Provider, {
        puppeteerOptions: {
            headless: isHeadless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--disable-gpu',
                '--disable-session-crashed-bubble',
                '--disable-infobars'
            ]
        }
    });

    // ═══ SESSION GUARD: Registrar protección con el proveedor ═══
    initSessionGuard(adapterProvider);

    // 4. Base de datos de sesión en memoria
    const adapterDB = new Database();

    // =====================================================================
    // ESCUDO ANTI-BORRADO DE SESIÓN (Bug de BuilderBot WPPConnect)
    // =====================================================================
    // BuilderBot borra la sesión entera si Chromium falla al arrancar.
    // Al interceptar auth_failure y salir, evitamos que ejecute WppDeleteTokens.
    adapterProvider.on('auth_failure', (payload) => {
        console.error(`💥 [ESCUDO] Fallo de WPPConnect detectado: ${JSON.stringify(payload)}`);
        console.error(`🛑 [ESCUDO] Evitando el borrado de la sesión. Reiniciando el proceso de inmediato...`);
        process.exit(1); // Esto previene que BuilderBot ejecute WppDeleteTokens
    });

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
    // WhatsApp entrega múltiples archivos reenviados en paralelo (<200ms).
    // BuilderBot no encola mensajes por usuario por defecto, lo que causa que
    // el segundo y tercer archivo sobrescriban el estado antes de que el primero termine
    // de descargarse. Esta cola garantiza que cada mensaje de un mismo usuario se procese
    // de forma estrictamente secuencial, conservando el paso de captura intacto.
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

    // =====================================================================
    // WATCHDOG: VIGILANTE DE CONEXIÓN RESILIENTE
    // =====================================================================
    // Solo si la sesión de WhatsApp Web sufre un fallo terminal irrecuperable
    // o pierde conectividad de forma persistente, reiniciamos el proceso.
    if (adapterProvider.vendor && typeof adapterProvider.vendor.onStateChange === 'function') {
        adapterProvider.vendor.onStateChange((state) => {
            console.log(`📡 [WATCHDOG] Estado de conexión: ${state}`);
            // NOTA: 'TIMEOUT' y 'DISCONNECTED' transitorios se ignoran para permitir auto-reconexión de WPPConnect.
            // Solo estados terminales definitivos provocan reinicio.
            const fatalStates = ['CONFLICT', 'UNPAIRED', 'UNLAUNCHED'];
            if (fatalStates.includes(state)) {
                console.error(`🛑 [WATCHDOG] Estado terminal irrecuperable detectado (${state}). Reiniciando proceso...`);
                process.exit(1); // Fuerza el reinicio a través del .bat
            }
        });
    }

    // Ping preventivo cada 15 minutos con tolerancia a fallos transitorios (3 intentos consecutivos)
    let consecutivePingFailures = 0;
    setInterval(async () => {
        try {
            if (adapterProvider.vendor && typeof adapterProvider.vendor.isConnected === 'function') {
                const connected = await adapterProvider.vendor.isConnected();
                if (connected === false) {
                    consecutivePingFailures++;
                    console.warn(`⚠️ [WATCHDOG] El bot reporta estar desconectado (${consecutivePingFailures}/3). Esperando reintento...`);
                    if (consecutivePingFailures >= 3) {
                        console.error(`🛑 [WATCHDOG] 3 fallos consecutivos de conexión reportados. Reiniciando proceso...`);
                        process.exit(1);
                    }
                    return;
                }
            }
            consecutivePingFailures = 0;
        } catch (e) {
            consecutivePingFailures++;
            console.warn(`⚠️ [WATCHDOG] Error transitorio verificando conexión (${consecutivePingFailures}/3): ${e.message}`);
            if (consecutivePingFailures >= 3) {
                console.error(`🛑 [WATCHDOG] 3 errores consecutivos verificando conexión. Reiniciando...`);
                process.exit(1);
            }
        }
    }, 15 * 60 * 1000);

    // ═══ SESSION GUARD: Activar backups periódicos ═══
    // Se inician 30 segundos después del arranque para dar tiempo a la conexión
    startPeriodicBackups();
};

main();
