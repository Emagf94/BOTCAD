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
    // WATCHDOG: VIGILANTE DE CONEXIÓN
    // =====================================================================
    // Si la sesión de WhatsApp Web se desconecta o se congela, matamos el proceso 
    // para que el archivo .bat lo reinicie automáticamente y recupere la conexión.
    if (adapterProvider.vendor && typeof adapterProvider.vendor.onStateChange === 'function') {
        adapterProvider.vendor.onStateChange((state) => {
            console.log(`📡 [WATCHDOG] Estado de conexión: ${state}`);
            const badStates = ['CONFLICT', 'UNPAIRED', 'UNLAUNCHED', 'TIMEOUT'];
            if (badStates.includes(state)) {
                console.error(`🛑 [WATCHDOG] El bot perdió la conexión (Estado: ${state}). Reiniciando proceso...`);
                process.exit(1); // Fuerza el reinicio a través del .bat
            }
        });
    }

    // Ping preventivo cada 15 minutos
    setInterval(async () => {
        try {
            if (adapterProvider.vendor && typeof adapterProvider.vendor.isConnected === 'function') {
                const connected = await adapterProvider.vendor.isConnected();
                if (connected === false) {
                    console.error(`🛑 [WATCHDOG] El bot reporta estar desconectado. Reiniciando proceso...`);
                    process.exit(1);
                }
            }
        } catch (e) {
            console.error(`🛑 [WATCHDOG] Error verificando conexión. Reiniciando...`);
            process.exit(1);
        }
    }, 15 * 60 * 1000);

    // ═══ SESSION GUARD: Activar backups periódicos ═══
    // Se inician 30 segundos después del arranque para dar tiempo a la conexión
    startPeriodicBackups();
};

main();
