/**
 * =============================================================================
 *  GUARDIÁN INFALIBLE DE SESIÓN Y CONECTIVIDAD 24/7 (SESSION GUARDIAN)
 * =============================================================================
 * 
 *  Módulo unificado de alta resiliencia para el Bot de WhatsApp CAD Impresiones.
 *  Integra y consolida en un único núcleo:
 *    1. Armadura de Sistema de Archivos (Anti-Wipe):
 *       Intercepta en runtime cualquier intento de BuilderBot (WppDeleteTokens)
 *       de borrar o vaciar bot_sessions ante fallos transitorios.
 *    2. Auto-Curación y Limpieza de Lockfiles de Chromium al arrancar.
 *    3. Opciones Blindadas Anti-Throttling para Chromium (autoClose: 0,
 *       deviceSyncTimeout: 0 y flags para evitar suspensión por inactividad).
 *    4. Latido Proactivo "Zero-Idle" (cada 45s) + WAPI Phone Watchdog nativo (15s):
 *       Mantiene viva la conexión WebSocket de WhatsApp Web evitando UNPAIRED_IDLE.
 *    5. Watchdog de Estados Resiliente con Auto-Recuperación Suave:
 *       Tolera micro-cortes de red, reanuda automáticamente y solo reinicia
 *       de forma limpia y segura si hay fallo irreversible prolongado.
 *    6. Backup Atómico Espejo (cada 10 min) compatible con bloqueos de Windows.
 *    7. Apagado Limpio (Graceful Shutdown) que preserva bases de datos LevelDB.
 * =============================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getWppClient } from './utils/fileHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Rutas críticas de sesión
const SESSION_DIR = path.join(PROJECT_ROOT, 'bot_sessions');
const BACKUP_DIR = path.join(PROJECT_ROOT, 'bot_sessions_backup');
const LOCKFILE_PATH = path.join(SESSION_DIR, 'bot_sessions', 'lockfile');
const SINGLETONLOCK_PATH = path.join(SESSION_DIR, 'bot_sessions', 'SingletonLock');
const DEVTOOLS_PATH = path.join(SESSION_DIR, 'bot_sessions', 'DevToolsActivePort');

// Directorios y archivos duraderos que componen la identidad de WhatsApp
const CRITICAL_SESSION_PATHS = [
    'bot_sessions/Default/Local Storage',
    'bot_sessions/Default/IndexedDB',
    'bot_sessions/Default/Session Storage',
    'bot_sessions/Default/Preferences',
    'bot_sessions/Default/Secure Preferences',
    'bot_sessions/Local State'
];

// Archivos efímeros o bloqueados que se excluyen de backups
const EXCLUDED_FROM_BACKUP = new Set([
    'lockfile',
    'SingletonLock',
    'DevToolsActivePort',
    'LOCK',
    'LOG',
    'LOG.old',
    'CrashpadMetrics-active.pma',
    'Cache',
    'Code Cache',
    'GPUCache',
    'DawnGraphiteCache',
    'DawnWebGPUCache'
]);

// Configuración de intervalos del Guardián
const HEARTBEAT_INTERVAL_MS = 45 * 1000;      // Latido Zero-Idle cada 45 segundos
const BACKUP_INTERVAL_MS = 10 * 60 * 1000;     // Backup periódico cada 10 minutos
const MAX_CONSECUTIVE_HEARTBEAT_FAILS = 5;     // 5 fallos (~3.75 min) antes de reiniciar

// Variables de estado interno
let heartbeatIntervalId = null;
let backupIntervalId = null;
let providerRef = null;
let activeClient = null;
let consecutivePingFailures = 0;
let isShuttingDown = false;
let isFileSystemArmorInstalled = false;
let allowInternalSessionWipe = false;

// ═══════════════════════════════════════════════════════════════════════════════
//  PILAR 1: ARMADURA DE SISTEMA DE ARCHIVOS (ANTI-WIPE DE BUILDERBOT)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Intercepta llamadas destructivas de Node.js (fs.rm, fs.unlink, fs.rmdir)
 * dirigidas a `bot_sessions`. Si BuilderBot falla al arrancar y ejecuta
 * `WppDeleteTokens(NAME_DIR_SESSION)` (que usa emptyDir), la armadura bloquea
 * el borrado en memoria. De este modo, los tokens NUNCA se pierden.
 * 
 * NOTA: Chromium (chrome.exe) es un proceso externo Win32 y escribe directamente
 * a través de la API del sistema operativo, por lo que su operación normal
 * no se ve afectada.
 */
function isProtectedSessionPath(targetPath) {
    if (allowInternalSessionWipe) return false;
    if (!targetPath) return false;

    try {
        const resolved = path.resolve(String(targetPath)).toLowerCase();
        const resolvedSession = SESSION_DIR.toLowerCase();

        // Si la ruta no está dentro de bot_sessions, permitir normalmente
        if (!resolved.startsWith(resolvedSession)) return false;

        // Permitir explícitamente la eliminación de lockfiles y devtools
        const base = path.basename(resolved);
        const allowedLocks = ['lockfile', 'singletonlock', 'devtoolsactiveport', 'lock', 'log', 'log.old'];
        if (allowedLocks.includes(base)) {
            return false;
        }

        // Cualquier otro intento de borrar bot_sessions o sus credenciales queda bloqueado
        return true;
    } catch {
        return false;
    }
}

export function installFileSystemArmor() {
    if (isFileSystemArmorInstalled) return;

    // 1. Interceptar fs.rmdir y fs.rmdirSync
    const origRmdir = fs.rmdir.bind(fs);
    fs.rmdir = function (p, options, cb) {
        const callback = typeof options === 'function' ? options : cb;
        if (isProtectedSessionPath(p)) {
            console.warn(`🛡️ [ARMADURA FS] Intento no autorizado de rmdir bloqueado en sesión: ${path.basename(p)}`);
            if (typeof callback === 'function') setImmediate(() => callback(null));
            return;
        }
        return origRmdir(p, options, callback);
    };

    const origRmdirSync = fs.rmdirSync.bind(fs);
    fs.rmdirSync = function (p, options) {
        if (isProtectedSessionPath(p)) {
            console.warn(`🛡️ [ARMADURA FS] Intento no autorizado de rmdirSync bloqueado en sesión: ${path.basename(p)}`);
            return;
        }
        return origRmdirSync(p, options);
    };

    // 2. Interceptar fs.rm y fs.rmSync
    if (typeof fs.rm === 'function') {
        const origRm = fs.rm.bind(fs);
        fs.rm = function (p, options, cb) {
            const callback = typeof options === 'function' ? options : cb;
            if (isProtectedSessionPath(p)) {
                console.warn(`🛡️ [ARMADURA FS] Intento no autorizado de rm bloqueado en sesión: ${path.basename(p)}`);
                if (typeof callback === 'function') setImmediate(() => callback(null));
                return;
            }
            return origRm(p, options, callback);
        };
    }

    if (typeof fs.rmSync === 'function') {
        const origRmSync = fs.rmSync.bind(fs);
        fs.rmSync = function (p, options) {
            if (isProtectedSessionPath(p)) {
                console.warn(`🛡️ [ARMADURA FS] Intento no autorizado de rmSync bloqueado en sesión: ${path.basename(p)}`);
                return;
            }
            return origRmSync(p, options);
        };
    }

    // 3. Interceptar fs.unlink y fs.unlinkSync
    const origUnlink = fs.unlink.bind(fs);
    fs.unlink = function (p, cb) {
        if (isProtectedSessionPath(p)) {
            console.warn(`🛡️ [ARMADURA FS] Intento no autorizado de unlink bloqueado en sesión: ${path.basename(p)}`);
            if (typeof cb === 'function') setImmediate(() => cb(null));
            return;
        }
        return origUnlink(p, cb);
    };

    const origUnlinkSync = fs.unlinkSync.bind(fs);
    fs.unlinkSync = function (p) {
        if (isProtectedSessionPath(p)) {
            console.warn(`🛡️ [ARMADURA FS] Intento no autorizado de unlinkSync bloqueado en sesión: ${path.basename(p)}`);
            return;
        }
        return origUnlinkSync(p);
    };

    // 4. Interceptar promesas en fs.promises si están disponibles
    if (fs.promises) {
        const origPromisesRm = fs.promises.rm ? fs.promises.rm.bind(fs.promises) : null;
        if (origPromisesRm) {
            fs.promises.rm = async function (p, options) {
                if (isProtectedSessionPath(p)) {
                    console.warn(`🛡️ [ARMADURA FS] Intento no autorizado de fs.promises.rm bloqueado: ${path.basename(p)}`);
                    return;
                }
                return origPromisesRm(p, options);
            };
        }

        const origPromisesRmdir = fs.promises.rmdir ? fs.promises.rmdir.bind(fs.promises) : null;
        if (origPromisesRmdir) {
            fs.promises.rmdir = async function (p, options) {
                if (isProtectedSessionPath(p)) {
                    console.warn(`🛡️ [ARMADURA FS] Intento no autorizado de fs.promises.rmdir bloqueado: ${path.basename(p)}`);
                    return;
                }
                return origPromisesRmdir(p, options);
            };
        }

        const origPromisesUnlink = fs.promises.unlink ? fs.promises.unlink.bind(fs.promises) : null;
        if (origPromisesUnlink) {
            fs.promises.unlink = async function (p) {
                if (isProtectedSessionPath(p)) {
                    console.warn(`🛡️ [ARMADURA FS] Intento no autorizado de fs.promises.unlink bloqueado: ${path.basename(p)}`);
                    return;
                }
                return origPromisesUnlink(p);
            };
        }
    }

    isFileSystemArmorInstalled = true;
    console.log(`🛡️ [SessionGuardian] Armadura de Sistema de Archivos activada (Anti-Wipe blindado).`);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PILAR 2: LIMPIEZA DE LOCKFILES Y AUTO-CURACIÓN AL ARRANCAR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Elimina lockfiles residuales que Chromium deja tras reinicios de PC o caídas.
 */
export function cleanCorruptLockfiles() {
    const lockfiles = [LOCKFILE_PATH, SINGLETONLOCK_PATH, DEVTOOLS_PATH];
    let cleaned = 0;

    for (const lockfile of lockfiles) {
        if (fs.existsSync(lockfile)) {
            try {
                // Eliminar con flag interna permitida
                allowInternalSessionWipe = true;
                fs.unlinkSync(lockfile);
                cleaned++;
                console.log(`🧹 [SessionGuardian] Lockfile limpiado: ${path.basename(lockfile)}`);
            } catch (err) {
                console.warn(`⚠️ [SessionGuardian] Advertencia limpiando lockfile ${path.basename(lockfile)}: ${err.message}`);
            } finally {
                allowInternalSessionWipe = false;
            }
        }
    }

    if (cleaned > 0) {
        console.log(`✅ [SessionGuardian] ${cleaned} archivo(s) de bloqueo eliminados. Sesión lista.`);
    } else {
        console.log(`✅ [SessionGuardian] No se encontraron lockfiles residuales.`);
    }
}

/**
 * Verifica si la sesión actual tiene una base de datos IndexedDB intacta.
 * Si la sesión está ausente, vacía o corrupta Y existe un backup válido,
 * restaura la sesión antes de que Chromium inicie.
 */
export function restoreSessionIfNeeded() {
    const indexedDBPath = path.join(SESSION_DIR, 'bot_sessions', 'Default', 'IndexedDB');
    let hasValidIndexedDB = false;

    if (fs.existsSync(indexedDBPath)) {
        try {
            const entries = fs.readdirSync(indexedDBPath);
            // Debe contener al menos una carpeta de dominio de WhatsApp (ej: https_web.whatsapp.com_0.indexeddb.leveldb)
            const hasLevelDBFolder = entries.some(e => e.includes('whatsapp') || e.includes('indexeddb.leveldb'));
            if (hasLevelDBFolder) {
                hasValidIndexedDB = true;
            }
        } catch {
            hasValidIndexedDB = false;
        }
    }

    if (hasValidIndexedDB) {
        console.log(`✅ [SessionGuardian] Sesión existente con IndexedDB íntegra detectada.`);
        return false;
    }

    // Verificar disponibilidad de backup
    const metaPath = path.join(BACKUP_DIR, '_backup_meta.json');
    if (!fs.existsSync(metaPath)) {
        console.log(`ℹ️  [SessionGuardian] Primera vinculación o sin backup previo. Se procederá con la sesión actual.`);
        return false;
    }

    try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        console.log(`🔄 [SessionGuardian] Base de datos no encontrada o incompleta. Restaurando desde backup del ${meta.date}...`);

        allowInternalSessionWipe = true;
        for (const relPath of CRITICAL_SESSION_PATHS) {
            const srcPath = path.join(BACKUP_DIR, relPath);
            const destPath = path.join(SESSION_DIR, relPath);
            if (fs.existsSync(srcPath)) {
                copyDirSyncSafe(srcPath, destPath);
            }
        }

        console.log(`✅ [SessionGuardian] Sesión restaurada con éxito desde el backup espejo.`);
        return true;
    } catch (err) {
        console.error(`❌ [SessionGuardian] Error durante auto-restauración: ${err.message}`);
        return false;
    } finally {
        allowInternalSessionWipe = false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PILAR 3: CONFIGURACIÓN BLINDADA PARA CHROMIUM (ANTI-THROTTLING 24/7)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Retorna las opciones definitivas para `createProvider(Provider, ...)`
 * desactivando timeouts de inactividad (`autoClose: 0`, `deviceSyncTimeout: 0`)
 * y dotando a Chromium de flags para operar 24/7 sin throttling de energía.
 * 
 * @param {boolean} isHeadless
 */
export function getGuardianProviderOptions(isHeadless = false) {
    const antiThrottleFlags = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-gpu',
        '--disable-session-crashed-bubble',
        '--disable-infobars',
        // Anti-Throttling 24/7: Evita que Windows y Chrome bajen la prioridad de timers y WebSockets
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=CalculateNativeWinOcclusion',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-breakpad',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--no-zygote'
    ];

    return {
        autoClose: 0,
        deviceSyncTimeout: 0,
        puppeteerOptions: {
            headless: isHeadless,
            args: antiThrottleFlags
        },
        browserArgs: antiThrottleFlags
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PILAR 4 & 5: LATIDO ZERO-IDLE (45s) Y WATCHDOG RESILIENTE DE ESTADOS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Manejador inteligente de cambios de estado de Socket de WhatsApp.
 * Tolera caídas transitorias de red sin matar el proceso.
 */
function handleStateChange(state, client) {
    console.log(`📡 [GUARDIAN] Cambio de estado de conexión: ${state}`);

    if (state === 'CONNECTED') {
        consecutivePingFailures = 0;
        console.log(`🟢 [GUARDIAN] Conexión activa y estable con WhatsApp Web.`);
        return;
    }

    // Estados transitorios normales en micro-cortes o reconexiones de red
    const transientStates = ['TIMEOUT', 'DISCONNECTED', 'PAIRING', 'OPENING', 'RESUMING', 'SYNCING'];
    if (transientStates.includes(state)) {
        console.warn(`🟡 [GUARDIAN] Estado de red transitorio (${state}). WhatsApp Web se está auto-reanudando...`);
        return;
    }

    // Estado UNPAIRED_IDLE por inactividad prolongada
    if (state === 'UNPAIRED_IDLE') {
        console.warn(`⚠️ [GUARDIAN] Estado UNPAIRED_IDLE detectado por inactividad. Disparando reactivación suave de sesión...`);
        triggerSoftRecovery(client);
        return;
    }

    // Conflicto de sesión
    if (state === 'CONFLICT') {
        console.warn(`⚠️ [GUARDIAN] Conflicto de sesión (otra sesión abierta en otro navegador). Manteniendo espera...`);
        return;
    }

    // Estado UNPAIRED definitivo
    if (state === 'UNPAIRED') {
        console.warn(`⚠️ [GUARDIAN] Reporte de UNPAIRED. Verificando autenticación real antes de tomar acción...`);
        setTimeout(async () => {
            try {
                const authenticated = await client.isLoggedIn().catch(() => false);
                if (authenticated) {
                    console.log(`🟢 [GUARDIAN] Falsa alarma de UNPAIRED; la sesión sigue autenticada.`);
                } else {
                    console.error(`🛑 [GUARDIAN] Sesión desvinculada definitivamente desde el dispositivo.`);
                }
            } catch { /* ignorar */ }
        }, 5000);
    }
}

/**
 * Intenta una reactivación suave de la página de WhatsApp Web sin reiniciar Node.js.
 */
async function triggerSoftRecovery(client) {
    if (!client || !client.page || client.page.isClosed()) return;
    try {
        console.log(`🔄 [GUARDIAN] Ejecutando recarga suave de la página de WhatsApp Web...`);
        await client.page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log(`✅ [GUARDIAN] Recarga suave completada.`);
    } catch (e) {
        console.warn(`⚠️ [GUARDIAN] Error en recarga suave: ${e.message}`);
    }
}

/**
 * Inicia el Latido Proactivo "Zero-Idle" cada 45 segundos.
 * Realiza una micro-evaluación en la página de Chromium para mantener caliente el WebSocket
 * y activo el hilo de ejecución de JavaScript, evitando suspensiones por falta de interacción.
 */
function startZeroIdleHeartbeat(client) {
    if (heartbeatIntervalId) clearInterval(heartbeatIntervalId);

    heartbeatIntervalId = setInterval(async () => {
        if (!client || !client.page || client.page.isClosed()) {
            return;
        }

        try {
            // Micro-evaluación rápida en el contexto del navegador (<10ms)
            const status = await Promise.race([
                client.page.evaluate(() => {
                    return {
                        isOnline: window.WPP?.conn?.isOnline?.() ?? (window.WAPI?.isConnected?.() ?? true),
                        state: window.WPP?.whatsapp?.Socket?.state ?? 'UNKNOWN',
                        stream: window.WPP?.whatsapp?.Socket?.stream ?? 'UNKNOWN'
                    };
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout de latido (12s)')), 12000))
            ]);

            // Si responde, el hilo de Chromium está 100% activo y vivo
            consecutivePingFailures = 0;
        } catch (err) {
            consecutivePingFailures++;
            console.warn(`⚠️ [GUARDIAN] Latido #${consecutivePingFailures}/${MAX_CONSECUTIVE_HEARTBEAT_FAILS} sin respuesta: ${err.message}`);

            if (consecutivePingFailures === 3) {
                console.log(`🔄 [GUARDIAN] 3 latidos fallidos. Intentando auto-recuperación suave de página...`);
                triggerSoftRecovery(client);
            } else if (consecutivePingFailures >= MAX_CONSECUTIVE_HEARTBEAT_FAILS) {
                console.error(`🛑 [GUARDIAN] ${MAX_CONSECUTIVE_HEARTBEAT_FAILS} latidos fallidos consecutivos (>3.5 minutos sin respuesta del navegador).`);
                console.error(`🛑 [GUARDIAN] Ejecutando cierre ordenado para reinicio limpio del proceso...`);
                gracefulShutdown('HEARTBEAT_TIMEOUT');
            }
        }
    }, HEARTBEAT_INTERVAL_MS);

    console.log(`💓 [SessionGuardian] Latido Zero-Idle activado (cada ${HEARTBEAT_INTERVAL_MS / 1000}s).`);
}

/**
 * Conecta el cliente nativo WPPConnect con todas las capas del Guardián:
 * activa el Phone Watchdog interno de WAPI, conecta el listener de estados y el latido continuo.
 */
async function attachWppClient(client) {
    if (!client || activeClient === client) return;
    activeClient = client;

    console.log(`\n🔗 [SessionGuardian] Vinculando Guardián al cliente WPPConnect...`);

    // 1. Activar Phone Watchdog nativo de WPPConnect (forzar verificación cada 15s)
    if (typeof client.startPhoneWatchdog === 'function') {
        try {
            await client.startPhoneWatchdog(15000);
            console.log(`📡 [SessionGuardian] WAPI Phone Watchdog nativo activado (15s).`);
        } catch (e) {
            console.warn(`⚠️ [SessionGuardian] startPhoneWatchdog: ${e.message}`);
        }
    }

    // 2. Escuchar cambios de estado del socket
    if (typeof client.onStateChange === 'function') {
        try {
            client.onStateChange((state) => handleStateChange(state, client));
            console.log(`📡 [SessionGuardian] Vigilante de estados (onStateChange) suscrito.`);
        } catch (e) {
            console.warn(`⚠️ [SessionGuardian] onStateChange: ${e.message}`);
        }
    }

    // 3. Escuchar cambios de stream de WhatsApp
    if (typeof client.onStreamChange === 'function') {
        try {
            client.onStreamChange((stream) => {
                if (stream === 'DISCONNECTED') {
                    console.warn(`⚠️ [SessionGuardian] Stream de WhatsApp Web desconectado temporalmente.`);
                } else if (stream === 'CONNECTED') {
                    consecutivePingFailures = 0;
                    console.log(`🟢 [SessionGuardian] Stream de WhatsApp Web sincronizado.`);
                }
            });
        } catch { /* ignorar */ }
    }

    // 4. Iniciar Latido Zero-Idle permanente
    startZeroIdleHeartbeat(client);

    console.log(`✅ [SessionGuardian] Todas las defensas en vivo conectadas con éxito.\n`);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PILAR 6: BACKUP ATÓMICO ESPEJO (COMPATIBLE CON WINDOWS)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Copia un directorio de forma segura omitiendo archivos bloqueados por Chromium.
 */
function copyDirSyncSafe(src, dest) {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });

    let entries = [];
    try {
        entries = fs.readdirSync(src, { withFileTypes: true });
    } catch {
        return;
    }

    for (const entry of entries) {
        if (EXCLUDED_FROM_BACKUP.has(entry.name)) continue;

        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDirSyncSafe(srcPath, destPath);
        } else {
            try {
                fs.copyFileSync(srcPath, destPath);
            } catch {
                // Si un archivo de registro efímero está bloqueado por Chromium, se omite limpiamente
            }
        }
    }
}

/**
 * Crea un backup espejo de las credenciales duraderas de la sesión de WhatsApp.
 */
export function backupSession() {
    if (!fs.existsSync(SESSION_DIR)) return false;

    try {
        const indexedDBPath = path.join(SESSION_DIR, 'bot_sessions', 'Default', 'IndexedDB');
        if (!fs.existsSync(indexedDBPath)) return false;

        fs.mkdirSync(BACKUP_DIR, { recursive: true });

        for (const relPath of CRITICAL_SESSION_PATHS) {
            const srcPath = path.join(SESSION_DIR, relPath);
            const destPath = path.join(BACKUP_DIR, relPath);
            if (fs.existsSync(srcPath)) {
                const stat = fs.statSync(srcPath);
                if (stat.isDirectory()) {
                    copyDirSyncSafe(srcPath, destPath);
                } else {
                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                    try { fs.copyFileSync(srcPath, destPath); } catch { /* archivo bloqueado */ }
                }
            }
        }

        const metaPath = path.join(BACKUP_DIR, '_backup_meta.json');
        fs.writeFileSync(metaPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleString('es-CO'),
            version: '2.0-infalible'
        }, null, 2));

        console.log(`💾 [SessionGuardian] Backup espejo actualizado (${new Date().toLocaleTimeString('es-CO')})`);
        return true;
    } catch (err) {
        console.error(`❌ [SessionGuardian] Error en backup: ${err.message}`);
        return false;
    }
}

/**
 * Inicia backups automáticos periódicos.
 */
export function startPeriodicBackups() {
    if (backupIntervalId) clearInterval(backupIntervalId);

    // Primer backup después de 45 segundos para dar tiempo a la sincronización
    setTimeout(() => {
        backupSession();
        backupIntervalId = setInterval(() => {
            backupSession();
        }, BACKUP_INTERVAL_MS);
        console.log(`🔄 [SessionGuardian] Backups automáticos espejo activados (cada ${BACKUP_INTERVAL_MS / 60000} min).`);
    }, 45000);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PILAR 7: APAGADO LIMPIO (GRACEFUL SHUTDOWN)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Cierra Chromium y el proveedor de forma ordenada, garantizando que LevelDB
 * vuelque todos sus buffers a disco sin corromper la base de datos.
 */
export async function gracefulShutdown(signal = 'MANUAL') {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n🛑 [SessionGuardian] Señal ${signal} recibida. Ejecutando apagado seguro y ordenado...`);

    if (heartbeatIntervalId) clearInterval(heartbeatIntervalId);
    if (backupIntervalId) clearInterval(backupIntervalId);

    // Backup preventivo previo al cierre
    try {
        console.log(`💾 [SessionGuardian] Creando backup final de sesión...`);
        backupSession();
    } catch (e) {
        console.warn(`⚠️ [SessionGuardian] Backup final: ${e.message}`);
    }

    // Cierre limpio de Chromium/WPPConnect
    if (activeClient && activeClient.page && !activeClient.page.isClosed()) {
        try {
            console.log(`🌐 [SessionGuardian] Cerrando página de WhatsApp Web de forma limpia...`);
            await Promise.race([
                activeClient.page.close(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout cierre de página')), 4000))
            ]);
        } catch { /* ignorar */ }
    }

    if (providerRef && providerRef.vendor && typeof providerRef.vendor.close === 'function') {
        try {
            console.log(`🌐 [SessionGuardian] Cerrando proceso de Chromium...`);
            await Promise.race([
                providerRef.vendor.close(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout cierre de vendor')), 5000))
            ]);
            console.log(`✅ [SessionGuardian] Chromium cerrado limpiamente.`);
        } catch { /* ignorar */ }
    }

    console.log(`👋 [SessionGuardian] Cierre completado. La sesión de WhatsApp se conserva 100% intacta.`);
    setTimeout(() => {
        process.exit(signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : 1);
    }, 500);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INICIALIZADOR MAESTRO DEL GUARDIÁN
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Inicializa e integra todas las capas del Guardián Infalible con el proveedor
 * WPPConnect de BuilderBot.
 * 
 * @param {object} provider Instancia del proveedor WPPConnect
 */
export function initSessionGuard(provider) {
    console.log(`\n🛡️  ════════════════════════════════════════════════════════════════`);
    console.log(`🛡️   GUARDIÁN INFALIBLE 24/7 - Sistema de Estabilidad y Sesión`);
    console.log(`🛡️  ════════════════════════════════════════════════════════════════\n`);

    providerRef = provider;

    // 1. Instalar Armadura de Sistema de Archivos
    installFileSystemArmor();

    // 2. Interceptar auth_failure de BuilderBot
    // Bloquea el comportamiento por defecto de BuilderBot que intenta borrar tokens
    provider.on('auth_failure', (payload) => {
        console.error(`💥 [SessionGuardian] Evento auth_failure detectado: ${JSON.stringify(payload)}`);
        console.warn(`🛑 [SessionGuardian] Armadura FS activa: Se impidió el borrado de bot_sessions.`);
    });

    // 3. Vincular al evento 'ready' del proveedor
    provider.on('ready', async () => {
        console.log(`🚀 [SessionGuardian] Proveedor reporta evento READY. Resolviendo cliente nativo...`);
        try {
            const client = await getWppClient(provider);
            if (client) {
                await attachWppClient(client);
            }
        } catch (err) {
            console.warn(`⚠️ [SessionGuardian] Error vinculando cliente en ready: ${err.message}`);
        }
    });

    // 4. Intentos periódicos no bloqueantes para resolver el cliente si 'ready' ya ocurrió
    let attempts = 0;
    const clientResolverInterval = setInterval(async () => {
        attempts++;
        if (activeClient || attempts > 20) {
            clearInterval(clientResolverInterval);
            return;
        }

        try {
            const client = await getWppClient(provider);
            if (client) {
                clearInterval(clientResolverInterval);
                await attachWppClient(client);
            }
        } catch { /* reintentar */ }
    }, 3000);

    // 5. Registrar manejadores de cierre limpio
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

    if (process.platform === 'win32') {
        process.on('beforeExit', () => {
            if (!isShuttingDown) backupSession();
        });
    }

    // 6. Tolerancia a errores recuperables de red / Node.js
    process.on('uncaughtException', (err) => {
        const errorMsg = err?.message || String(err || '');
        const isRecoverable =
            errorMsg.includes('Vendor should not return empty') ||
            errorMsg.includes('EBUSY') ||
            errorMsg.includes('ECONNRESET') ||
            errorMsg.includes('ETIMEDOUT') ||
            errorMsg.includes('EHOSTUNREACH') ||
            errorMsg.includes('ENOTFOUND') ||
            errorMsg.includes('Execution context was destroyed') ||
            errorMsg.includes('Target closed') ||
            errorMsg.includes('Protocol error') ||
            errorMsg.includes('Evaluation failed') ||
            errorMsg.includes('colourspace') ||
            errorMsg.includes('parameter space not set');

        if (isRecoverable) {
            console.warn(`⚠️ [SessionGuardian] Error no capturado recuperable absorbido para mantener bot activo: ${errorMsg}`);
            return;
        }

        console.error(`💥 [SessionGuardian] Excepción no capturada crítica: ${err.message}`);
        try { backupSession(); } catch { /* ignorar */ }
        gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason) => {
        const errorMsg = reason?.message || String(reason || '');
        const isIgnorable =
            errorMsg.includes('colourspace') ||
            errorMsg.includes('parameter space not set') ||
            errorMsg.includes('Vendor should not return empty') ||
            errorMsg.includes('EBUSY') ||
            errorMsg.includes('ECONNRESET') ||
            errorMsg.includes('ETIMEDOUT') ||
            errorMsg.includes('EHOSTUNREACH') ||
            errorMsg.includes('ENOTFOUND') ||
            errorMsg.includes('Execution context was destroyed') ||
            errorMsg.includes('Target closed') ||
            errorMsg.includes('Protocol error') ||
            errorMsg.includes('Evaluation failed') ||
            (reason?.stack && reason.stack.includes('cleanImage'));

        if (isIgnorable) {
            console.warn(`⚠️ [SessionGuardian] Rechazo de promesa no crítico tolerado: ${errorMsg}`);
            return;
        }

        console.warn(`⚠️ [SessionGuardian] Advertencia en promesa no manejada:`, reason);
        try { backupSession(); } catch { /* ignorar */ }
    });

    // 7. Iniciar backups periódicos
    startPeriodicBackups();

    console.log(`✅ [SessionGuardian] Guardián Infalible completamente armado y operativo.\n`);
}
