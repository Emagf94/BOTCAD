import { createBot, createProvider, createFlow } from '@builderbot/bot';
import { MemoryDB as Database } from '@builderbot/bot';
import { WPPConnectProvider as Provider } from '@builderbot/provider-wppconnect';
import { initBotConfig } from './botConfig.js';
import { allFlows } from './flows/index.js';
import fs from 'fs';
import { initSessionGuard, startPeriodicBackups, cleanCorruptLockfiles, restoreSessionIfNeeded } from './sessionGuard.js';
import { activeBridgeChats, isAdmin } from './utils/helpers.js';

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
    
    botInstance.httpServer(+PORT);
    console.log(`🚀 [CAD Bot] Servidor y bot iniciados correctamente en el puerto ${PORT}`);

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
