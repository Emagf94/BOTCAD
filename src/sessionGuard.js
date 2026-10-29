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
import child_process from 'child_process';
import { fileURLToPath } from 'url';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase.js';
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
const HEARTBEAT_INTERVAL_MS = 35 * 1000;      // Latido Zero-Idle cada 35 segundos
const BACKUP_INTERVAL_MS = 10 * 60 * 1000;     // Backup periódico cada 10 minutos
const MAX_CONSECUTIVE_HEARTBEAT_FAILS = 10;    // 10 fallos (~6 min) antes de considerar reinicio limpio

// Variables de estado interno
let heartbeatIntervalId = null;
let backupIntervalId = null;
let providerRef = null;
let activeClient = null;
let consecutivePingFailures = 0;
let isShuttingDown = false;
let isFileSystemArmorInstalled = false;
let allowInternalSessionWipe = false;

// Variables de sincronización con Firestore y UI Dashboard
let currentStatus = 'INITIALIZING'; // 'INITIALIZING' | 'CONNECTED' | 'RECONNECTING' | 'REQUIRES_AUTH' | 'DISCONNECTED'
let currentQrCode = null;
let currentPairingCode = null;
let currentPairingExpiry = null;
let connectedHostPhone = '573116584423';
let lastConnectedTimestamp = Date.now();
let lastHeartbeatTimestamp = null;
let lastLogMessage = 'Iniciando sistema de sesión (Línea: +573116584423)';
let isReloading = false;
let deepCheckTimeoutId = null;
let lastProcessedCommandTimestamp = 0;

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
 * Verifica si el proceso y la página de Chromium están vivos y operativos.
 */
export function isBrowserAlive(client) {
    if (!client) return false;
    if (!client.page) return false;
    try {
        if (typeof client.page.isClosed === 'function' && client.page.isClosed()) {
            return false;
        }
        if (typeof client.page.browser === 'function') {
            const browser = client.page.browser();
            if (browser && typeof browser.isConnected === 'function' && !browser.isConnected()) {
                return false;
            }
        }
    } catch {
        return false;
    }
    return true;
}

/**
 * Cierra de forma forzada cualquier proceso huérfano de Chromium/Chrome en Windows
 * que tenga tomado el directorio bot_sessions impidiendo la reapertura.
 */
export function killOrphanChromeProcesses() {
    if (process.platform !== 'win32') return;
    try {
        const cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name = 'chrome.exe'\\" | Where-Object { $_.CommandLine -like '*bot_sessions*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`;
        child_process.execSync(cmd, { stdio: 'ignore', timeout: 6000 });
        console.log(`🧹 [SessionGuardian] Procesos huérfanos de Chromium verificados y limpiados.`);
    } catch {
        // Ignorar si no se encontraron procesos huérfanos
    }
}

/**
 * Elimina lockfiles residuales que Chromium deja tras reinicios de PC o caídas.
 */
export function cleanCorruptLockfiles() {
    // Matar previamente procesos zombi que retengan los archivos abiertos
    killOrphanChromeProcesses();

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
        // Anti-Detección Bot / Stealth: Impide que WhatsApp detecte automatización y cierre la sesión
        '--disable-blink-features=AutomationControlled',
        '--no-default-browser-check',
        '--disable-site-isolation-trials',
        '--no-experiments',
        '--ignore-gpu-blacklist',
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-spki-list',
        '--disable-extensions',
        '--disable-default-apps',
        '--enable-features=NetworkService',
        // Anti-Throttling 24/7: Evita que Windows y Chrome bajen la prioridad de timers y WebSockets
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=CalculateNativeWinOcclusion',
        '--disable-breakpad',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--no-zygote'
    ];

    return {
        name: 'bot',
        headless: isHeadless, // Declaración explícita en la raíz requerida por WPPConnect
        autoClose: 0,
        deviceSyncTimeout: 0,
        disableWelcome: true,
        updatesLog: false,
        catchQR: (base64QRImg, asciiQR, attempt, urlCode) => {
            console.log(`📷 [Provider:catchQR] Código QR recibido de WhatsApp Web (intento #${attempt || 1})`);
            updateQRStatus(base64QRImg);
            // Guardar imagen local para compatibilidad sin depender de la UI
            try {
                const base64Data = base64QRImg.replace(/^data:image\/png;base64,/, '');
                fs.writeFileSync(path.join(PROJECT_ROOT, 'bot.qr.png'), Buffer.from(base64Data, 'base64'));
            } catch {}
            // Sobrescribe y anula el throw Error() en attempt == 5 de BuilderBot
        },
        statusFind: (statusSession, session) => {
            handleWppStatusFind(statusSession, session);
        },
        puppeteerOptions: {
            headless: isHeadless,
            args: antiThrottleFlags
        },
        browserArgs: antiThrottleFlags
    };
}

/**
 * Manejador centralizado de eventos de estado de ciclo de vida de WPPConnect (statusFind).
 */
export function handleWppStatusFind(statusSession, session) {
    console.log(`📡 [SessionGuardian:statusFind] Estado de sesión reportado: ${statusSession} (${session || 'bot'})`);
    if (statusSession === 'autocloseCalled' || statusSession === 'browserClose' || statusSession === 'serverClose') {
        console.warn(`🛑 [SessionGuardian] statusFind reporta cierre de Chromium (${statusSession}). Disparando auto-recuperación...`);
        if (!isShuttingDown) {
            recoverChromiumBrowser(statusSession);
        }
    } else if (statusSession === 'notLogged') {
        currentStatus = 'REQUIRES_AUTH';
        lastLogMessage = 'Esperando vinculación de WhatsApp Web...';
        publishSessionStatus({ status: 'REQUIRES_AUTH', lastMessage: lastLogMessage });
        const client = activeClient || (providerRef ? providerRef.vendor : null);
        if (client) startActiveQRWatcher(client);
    } else if (statusSession === 'inChat' || statusSession === 'isLogged') {
        currentStatus = 'CONNECTED';
        stopActiveQRWatcher();
        publishSessionStatus({ status: 'CONNECTED', qrCode: null, pairingCode: null });
    } else if (statusSession === 'phoneNotConnected' || statusSession === 'disconnectedMobile') {
        console.warn(`⚠️ [SessionGuardian] Teléfono anfitrión desconectado temporalmente (${statusSession}).`);
        publishSessionStatus({ lastMessage: `Teléfono desconectado (${statusSession}). Esperando reconexión...` });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PILAR 4 & 5: SINCRONIZACIÓN EN TIEMPO REAL CON UI, WATCHDOG Y AUTO-RECONEXIÓN
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Publica el estado de la sesión en Firestore (doc 'config/bot_session')
 * para sincronización en tiempo real con el Dashboard.
 */
export async function publishSessionStatus(overrides = {}) {
    try {
        if (!db) return;
        const statusDoc = doc(db, 'config', 'bot_session');
        const data = {
            status: overrides.status || currentStatus,
            qrCode: overrides.qrCode !== undefined ? overrides.qrCode : currentQrCode,
            pairingCode: overrides.pairingCode !== undefined ? overrides.pairingCode : currentPairingCode,
            pairingExpiry: overrides.pairingExpiry !== undefined ? overrides.pairingExpiry : currentPairingExpiry,
            hostPhone: overrides.hostPhone !== undefined ? overrides.hostPhone : connectedHostPhone,
            lastHeartbeat: new Date().toISOString(),
            lastConnectedAt: lastConnectedTimestamp ? new Date(lastConnectedTimestamp).toISOString() : null,
            lastMessage: overrides.lastMessage || lastLogMessage,
            consecutiveFails: consecutivePingFailures,
            updatedAt: new Date().toISOString(),
            ...overrides
        };
        await setDoc(statusDoc, data, { merge: true });
    } catch (e) {
        // Fallo de red con Firebase no debe afectar la operación del bot
        console.warn(`⚠️ [SessionGuardian] Fallo menor sincronizando estado con Firestore: ${e.message}`);
    }
}

/**
 * Actualiza el código QR activo y lo publica inmediatamente en el Dashboard.
 */
export function updateQRStatus(base64QR) {
    if (!base64QR) return;
    currentStatus = 'REQUIRES_AUTH';
    currentQrCode = base64QR.startsWith('data:image') ? base64QR : `data:image/png;base64,${base64QR}`;
    lastLogMessage = 'Esperando escaneo de código QR en la aplicación de WhatsApp';
    console.log(`📷 [SessionGuardian] Nuevo código QR disponible. Sincronizado en tiempo real con la UI.`);
    publishSessionStatus({
        status: 'REQUIRES_AUTH',
        qrCode: currentQrCode,
        lastMessage: lastLogMessage
    });
}

/**
 * Actualiza el teléfono anfitrión conectado y limpia estados de autenticación.
 */
export function updateHostPhone(phone) {
    if (!phone) return;
    connectedHostPhone = String(phone).replace(/\D/g, '');
    currentStatus = 'CONNECTED';
    currentQrCode = null;
    currentPairingCode = null;
    lastConnectedTimestamp = Date.now();
    consecutivePingFailures = 0;
    lastLogMessage = `Bot conectado y operativo (+${connectedHostPhone})`;
    console.log(`🟢 [SessionGuardian] Sesión activa confirmada con host: +${connectedHostPhone}`);
    publishSessionStatus({
        status: 'CONNECTED',
        hostPhone: connectedHostPhone,
        qrCode: null,
        pairingCode: null,
        lastMessage: lastLogMessage
    });
}

/**
 * Solicita y genera un código de vinculación de 8 dígitos para un número de teléfono.
 */
export async function generatePairingCode(phone) {
    if (!phone) {
        publishSessionStatus({ lastMessage: 'Error: Número de teléfono no especificado para vincular' });
        return;
    }
    const cleanPhone = String(phone).replace(/\D/g, '');
    if (cleanPhone.length < 8) {
        publishSessionStatus({ lastMessage: 'Error: El número de teléfono debe tener al menos 8 dígitos' });
        return;
    }

    const client = activeClient || (providerRef ? await getWppClient(providerRef) : null);
    if (!isBrowserAlive(client)) {
        console.warn(`⚠️ [SessionGuardian] Chromium no disponible para generar código de vinculación. Relanzando...`);
        await recoverChromiumBrowser('PAIRING_CODE_BROWSER_CLOSED');
    }
    const readyClient = activeClient || (providerRef ? await getWppClient(providerRef) : null);
    if (!isBrowserAlive(readyClient)) {
        publishSessionStatus({ lastMessage: 'Error: No se pudo iniciar el navegador Chromium para generar código' });
        return;
    }

    try {
        console.log(`📱 [SessionGuardian] Solicitando código de vinculación para +${cleanPhone}...`);
        publishSessionStatus({
            status: 'CONNECTING',
            lastMessage: `Generando código de vinculación para +${cleanPhone}...`
        });

        // 1. Invocar inicio de vinculación por código en WhatsApp Web
        await readyClient.page.evaluate(async (p) => {
            try {
                if (window.WPP?.conn?.startLinkDeviceCodeForPhoneNumber) {
                    await window.WPP.conn.startLinkDeviceCodeForPhoneNumber(p);
                }
            } catch (e) {
                console.warn('startLinkDeviceCodeForPhoneNumber error:', e);
            }
        }, cleanPhone);

        // 2. Esperar y consultar el código generado en WPP.conn
        let code = null;
        for (let i = 0; i < 12; i++) {
            await new Promise(r => setTimeout(r, 600));
            code = await readyClient.page.evaluate(() => {
                try {
                    return window.WPP?.conn?.getLinkDeviceCode?.() || 
                           window.WPP?.conn?.linkCode ||
                           null;
                } catch { return null; }
            }).catch(() => null);
            if (code) break;
        }

        if (code) {
            currentPairingCode = code;
            currentPairingExpiry = Date.now() + 120000; // 2 minutos de validez
            currentStatus = 'REQUIRES_AUTH';
            lastLogMessage = `Código de vinculación listo: ${code}`;
            console.log(`✅ [SessionGuardian] Código de vinculación generado: ${code}`);
            publishSessionStatus({
                status: 'REQUIRES_AUTH',
                pairingCode: code,
                pairingExpiry: currentPairingExpiry,
                lastMessage: lastLogMessage
            });
        } else {
            console.warn(`⚠️ [SessionGuardian] No se obtuvo código de texto directamente, verificando pantalla de WhatsApp...`);
            await checkForQRScreen(readyClient);
            publishSessionStatus({
                lastMessage: `Solicitud de vinculación enviada para +${cleanPhone}. Revisa tu WhatsApp.`
            });
        }
    } catch (err) {
        console.error(`⚠️ [SessionGuardian] Error en generatePairingCode: ${err.message}`);
        publishSessionStatus({ lastMessage: `Error generando código: ${err.message}` });
    }
}

let isRecoveringBrowser = false;

/**
 * Procedimiento de auto-recuperación de Chromium cuando se cierra, cae o queda inactivo.
 * Limpia procesos zombi, lockfiles y relanza Chromium en caliente de forma limpia.
 */
export async function recoverChromiumBrowser(reason = 'UNEXPECTED_CLOSE') {
    if (isShuttingDown) return;
    if (isRecoveringBrowser) {
        console.log(`⏳ [SessionGuardian] Auto-recuperación de Chromium ya en curso (${reason}). Esperando...`);
        return;
    }
    isRecoveringBrowser = true;
    currentStatus = 'RECONNECTING';
    lastLogMessage = `Chromium inactivo o cerrado (${reason}). Relanzando navegador automáticamente...`;
    console.warn(`\n🔄 [SessionGuardian] ==============================================`);
    console.warn(`🔄 [SessionGuardian] AUTO-RECUPERACIÓN DE CHROMIUM ACTIVADA: ${reason}`);
    console.warn(`🔄 [SessionGuardian] ==============================================\n`);
    publishSessionStatus({ status: 'RECONNECTING', lastMessage: lastLogMessage });

    try {
        // 1. Matar procesos huérfanos de Chrome vinculados a bot_sessions
        killOrphanChromeProcesses();
        await new Promise(r => setTimeout(r, 1200));

        // 2. Limpiar lockfiles residuales
        cleanCorruptLockfiles();

        // 3. Si el proveedor soporta initVendor, relanzar el vendor
        if (providerRef && typeof providerRef.initVendor === 'function') {
            console.log(`🌐 [SessionGuardian] Relanzando vendor de Chromium con opciones blindadas...`);
            const newVendor = await Promise.race([
                providerRef.initVendor(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout de initVendor (45s)')), 45000))
            ]);

            if (newVendor) {
                console.log(`✅ [SessionGuardian] Vendor de Chromium relanzado con éxito.`);
                if (typeof providerRef.listenOnEvents === 'function') {
                    providerRef.listenOnEvents(newVendor);
                }
                await attachWppClient(newVendor);

                // Comprobar estado inicial tras relanzamiento
                const logged = await newVendor.isLoggedIn().catch(() => null);
                if (logged === true) {
                    currentStatus = 'CONNECTED';
                    lastLogMessage = 'Bot reconectado y operativo tras relanzamiento';
                    publishSessionStatus({ status: 'CONNECTED', lastMessage: lastLogMessage });
                } else {
                    currentStatus = 'REQUIRES_AUTH';
                    lastLogMessage = 'Chromium relanzado. Esperando escaneo de código QR...';
                    publishSessionStatus({ status: 'REQUIRES_AUTH', lastMessage: lastLogMessage });
                    startActiveQRWatcher(newVendor);
                }
                isRecoveringBrowser = false;
                return;
            }
        }
    } catch (err) {
        console.error(`❌ [SessionGuardian] Fallo durante relanzamiento en memoria: ${err.message}`);
    }

    // 4. Si el relanzamiento en memoria no fue exitoso, forzar salida limpia para que el supervisor reinicie
    console.warn(`🛑 [SessionGuardian] Forzando reinicio limpio del proceso para re-inicializar entorno...`);
    isRecoveringBrowser = false;
    gracefulShutdown(`RECOVER_${reason}`);
}

let qrWatcherIntervalId = null;

/**
 * Vigilante activo continuo de código QR.
 * Inspecciona el DOM cada 2.5s, extrae el canvas en base64, detecta si el QR expiró
 * y pulsa automáticamente el botón de recarga de WhatsApp Web si aparece.
 */
export function startActiveQRWatcher(client) {
    if (qrWatcherIntervalId) return;

    console.log(`📷 [SessionGuardian] Iniciando Vigilante Activo de Código QR (regeneración continua)...`);

    let qrScanAttempts = 0;
    qrWatcherIntervalId = setInterval(async () => {
        if (currentStatus === 'CONNECTED') {
            stopActiveQRWatcher();
            return;
        }

        const currentClient = activeClient || client;
        if (!isBrowserAlive(currentClient)) {
            console.warn(`⚠️ [SessionGuardian] Vigilante de QR: Chromium no está activo. Activando auto-recuperación...`);
            recoverChromiumBrowser('QR_WATCHER_BROWSER_DEAD');
            return;
        }

        try {
            // 1. Comprobar si ya se logueó
            const isLogged = await currentClient.isLoggedIn().catch(() => null);
            if (isLogged === true) {
                console.log(`🟢 [SessionGuardian] WhatsApp Web reporta sesión iniciada. Deteniendo vigilante QR.`);
                currentStatus = 'CONNECTED';
                currentQrCode = null;
                publishSessionStatus({ status: 'CONNECTED', qrCode: null });
                stopActiveQRWatcher();
                return;
            }

            // 2. Comprobar si WhatsApp Web muestra el botón para recargar el QR por inactividad
            await currentClient.page.evaluate(() => {
                try {
                    const buttons = Array.from(document.querySelectorAll('button, div[role="button"], span'));
                    for (const btn of buttons) {
                        const txt = (btn.innerText || btn.textContent || '').toLowerCase();
                        if (txt.includes('recargar') || txt.includes('reload') || txt.includes('click to reload') || txt.includes('hacer clic')) {
                            btn.click();
                            return true;
                        }
                    }
                    const qrOverlay = document.querySelector('div[data-ref] span[role="button"], span[data-icon="refresh-large"]');
                    if (qrOverlay) {
                        qrOverlay.click();
                        return true;
                    }
                } catch { /* ignorar */ }
                return false;
            }).catch(() => null);

            // 3. Extraer el canvas del código QR
            const qrBase64 = await currentClient.page.evaluate(() => {
                try {
                    const canvas = document.querySelector('canvas[aria-label="Scan this QR code to link a device"]') ||
                                   document.querySelector('canvas') ||
                                   document.querySelector('div[data-ref] canvas');
                    if (canvas && typeof canvas.toDataURL === 'function') {
                        return canvas.toDataURL('image/png');
                    }
                } catch { /* ignorar */ }
                return null;
            }).catch(() => null);

            if (qrBase64 && qrBase64.length > 100) {
                if (qrBase64 !== currentQrCode) {
                    qrScanAttempts++;
                    console.log(`📷 [SessionGuardian] Código QR capturado y sincronizado con Dashboard (ciclo #${qrScanAttempts}).`);
                    updateQRStatus(qrBase64);
                    try {
                        const base64Data = qrBase64.replace(/^data:image\/png;base64,/, '');
                        fs.writeFileSync(path.join(PROJECT_ROOT, 'bot.qr.png'), Buffer.from(base64Data, 'base64'));
                    } catch {}
                }
            }
        } catch (err) {
            console.warn(`⚠️ [SessionGuardian] Vigilante QR ciclo con advertencia: ${err.message}`);
        }
    }, 2500);
}

export function stopActiveQRWatcher() {
    if (qrWatcherIntervalId) {
        clearInterval(qrWatcherIntervalId);
        qrWatcherIntervalId = null;
        console.log(`🛑 [SessionGuardian] Vigilante Activo de Código QR detenido.`);
    }
}

/**
 * Escucha comandos remotos desde el Dashboard ('config/bot_session_commands').
 */
export function initRemoteCommandListener() {
    try {
        if (!db) return;
        const cmdDoc = doc(db, 'config', 'bot_session_commands');
        onSnapshot(cmdDoc, async (snapshot) => {
            if (!snapshot.exists()) return;
            const data = snapshot.data();
            const cmdTimestamp = data?.timestamp || 0;
            if (cmdTimestamp <= lastProcessedCommandTimestamp) return;
            lastProcessedCommandTimestamp = cmdTimestamp;

            console.log(`📡 [SessionGuardian] Comando remoto recibido desde Dashboard: ${data.action}`);

            if (data.action === 'REOPEN_BROWSER') {
                console.log(`🌐 [SessionGuardian] Comando remoto: Forzar reapertura de Chromium y regeneración de QR.`);
                await recoverChromiumBrowser('REMOTE_USER_REQUEST');
            } else if (data.action === 'REQUEST_PAIRING_CODE') {
                const client = activeClient || (providerRef ? await getWppClient(providerRef) : null);
                if (!isBrowserAlive(client)) {
                    console.log(`🌐 [SessionGuardian] Relanzando Chromium antes de generar código de vinculación...`);
                    await recoverChromiumBrowser('PAIRING_CODE_BROWSER_CLOSED');
                }
                await generatePairingCode(data.phone);
            } else if (data.action === 'FORCE_RELOAD') {
                const client = activeClient || (providerRef ? await getWppClient(providerRef) : null);
                if (isBrowserAlive(client)) {
                    await attemptPageReload(client);
                } else {
                    console.log(`🌐 [SessionGuardian] Chromium no disponible para recargar. Relanzando...`);
                    await recoverChromiumBrowser('FORCE_RELOAD_BROWSER_CLOSED');
                }
            } else if (data.action === 'FORCE_RECONNECT') {
                const client = activeClient || (providerRef ? await getWppClient(providerRef) : null);
                if (isBrowserAlive(client)) {
                    triggerGentleKeepAlive(client);
                    await attemptPageReload(client);
                } else {
                    await recoverChromiumBrowser('FORCE_RECONNECT_BROWSER_CLOSED');
                }
            }
        }, (err) => {
            console.warn(`⚠️ [SessionGuardian] Error en listener de comandos remotos: ${err.message}`);
        });
        console.log(`📡 [SessionGuardian] Listener de comandos remotos desde Dashboard activado.`);
    } catch (e) {
        console.warn(`⚠️ [SessionGuardian] No se pudo inicializar listener de comandos: ${e.message}`);
    }
}

/**
 * Busca si la pantalla de WhatsApp Web tiene un código QR renderizado en el DOM.
 */
export async function checkForQRScreen(client) {
    if (!client || !client.page || client.page.isClosed()) return false;
    try {
        const qrBase64 = await client.page.evaluate(() => {
            try {
                const canvas = document.querySelector('canvas[aria-label="Scan this QR code to link a device"]') ||
                               document.querySelector('canvas') ||
                               document.querySelector('div[data-ref] canvas');
                if (canvas && typeof canvas.toDataURL === 'function') {
                    return canvas.toDataURL('image/png');
                }
            } catch { /* ignorar */ }
            return null;
        }).catch(() => null);

        if (qrBase64 && qrBase64.length > 100) {
            updateQRStatus(qrBase64);
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Resuelve automáticamente el cuadro de conflicto si la sesión fue abierta en otra pestaña/navegador.
 */
async function attemptConflictResolution(client) {
    if (!client || !client.page || client.page.isClosed()) return;
    try {
        console.log(`⚡ [SessionGuardian] Intentando resolver conflicto de sesión (click en "Usar aquí")...`);
        const clicked = await client.page.evaluate(() => {
            try {
                const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
                const useHereBtn = buttons.find(b => {
                    const text = (b.innerText || b.textContent || '').toLowerCase();
                    return text.includes('usar aquí') || text.includes('use here');
                });
                if (useHereBtn) {
                    useHereBtn.click();
                    return true;
                }
            } catch { /* ignorar */ }
            return false;
        }).catch(() => false);

        if (clicked) {
            console.log(`✅ [SessionGuardian] Botón "Usar aquí" presionado con éxito.`);
            setTimeout(() => triggerGentleKeepAlive(client), 3000);
        }
    } catch (e) {
        console.warn(`⚠️ [SessionGuardian] Fallo resolviendo conflicto: ${e.message}`);
    }
}

/**
 * Recarga suavemente la página de WhatsApp Web sin destruir el proceso.
 * Permite reconectar si los tokens en IndexedDB siguen intactos.
 */
export async function attemptPageReload(client) {
    if (isReloading) return false;
    if (!isBrowserAlive(client)) {
        console.warn(`⚠️ [SessionGuardian] attemptPageReload: Chromium no está activo. Activando auto-recuperación...`);
        recoverChromiumBrowser('RELOAD_BROWSER_CLOSED');
        return false;
    }
    isReloading = true;
    currentStatus = 'RECONNECTING';
    lastLogMessage = 'Recargando página de WhatsApp Web para auto-reconectar...';
    publishSessionStatus({ status: 'RECONNECTING', lastMessage: lastLogMessage });

    try {
        console.log(`🔄 [SessionGuardian] Recargando página de WhatsApp Web para reconectar sin perder sesión...`);
        await client.page.reload({ waitUntil: 'domcontentloaded', timeout: 35000 });
        await new Promise(r => setTimeout(r, 8000));

        // Verificar si la sesión sigue viva dentro del chat
        const inChat = await Promise.race([
            client.isLoggedIn().catch(() => null),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
        ]).catch(() => null);

        if (inChat === true) {
            consecutivePingFailures = 0;
            currentStatus = 'CONNECTED';
            currentQrCode = null;
            lastConnectedTimestamp = Date.now();
            lastLogMessage = 'Reconexión exitosa tras recarga de página.';
            console.log(`🟢 [SessionGuardian] Reconexión exitosa tras recarga de página.`);
            stopActiveQRWatcher();
            triggerGentleKeepAlive(client);
            publishSessionStatus({ status: 'CONNECTED', qrCode: null, lastMessage: lastLogMessage });
            isReloading = false;
            return true;
        }

        // Si no está en chat, activar vigilante activo de código QR para regeneración continua
        console.warn(`⚠️ [SessionGuardian] Recarga completada pero no se detectó chat. Activando vigilante QR...`);
        startActiveQRWatcher(client);
        isReloading = false;
        return false;
    } catch (e) {
        console.warn(`⚠️ [SessionGuardian] Error en recarga de página: ${e.message}`);
        isReloading = false;
        return false;
    }
}

/**
 * Programa una verificación profunda tras estados transitorios de red.
 */
function scheduleDeepConnectionCheck(client, state) {
    if (deepCheckTimeoutId) clearTimeout(deepCheckTimeoutId);
    deepCheckTimeoutId = setTimeout(async () => {
        if (!isBrowserAlive(client)) return;
        try {
            console.log(`🔍 [SessionGuardian] Verificación profunda post-estado transitorio (${state})...`);
            const isLogged = await client.isLoggedIn().catch(() => null);
            if (isLogged === true) {
                consecutivePingFailures = 0;
                currentStatus = 'CONNECTED';
                console.log(`🟢 [SessionGuardian] Verificación profunda: Sesión sigue conectada y saludable.`);
                stopActiveQRWatcher();
                publishSessionStatus({ status: 'CONNECTED' });
                return;
            }

            console.warn(`⚠️ [SessionGuardian] Sesión sigue sin responder tras 30s. Intentando recarga suave...`);
            await attemptPageReload(client);
        } catch (e) {
            console.warn(`⚠️ [SessionGuardian] Error en verificación profunda: ${e.message}`);
        }
    }, 30000);
}

/**
 * Manejo exhaustivo del estado UNPAIRED con verificación en 3 etapas.
 */
function handleUnpairedState(client) {
    console.warn(`⚠️ [SessionGuardian] Reporte de UNPAIRED. Iniciando verificación en 3 etapas...`);
    currentStatus = 'RECONNECTING';
    lastLogMessage = 'Verificando reporte de desvinculación...';
    publishSessionStatus({ status: 'RECONNECTING', lastMessage: lastLogMessage });

    setTimeout(async () => {
        try {
            const auth1 = await Promise.race([
                client.isLoggedIn().catch(() => null),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
            ]).catch(() => null);

            if (auth1 === true) {
                console.log(`🟢 [SessionGuardian] Falsa alarma de UNPAIRED (etapa 1). Sesión activa.`);
                currentStatus = 'CONNECTED';
                publishSessionStatus({ status: 'CONNECTED' });
                triggerGentleKeepAlive(client);
                return;
            }

            // Etapa 2: Intentar recarga de página (recupera sesión si tokens siguen vivos)
            console.warn(`⚠️ [SessionGuardian] UNPAIRED etapa 1 no confirmó sesión. Intentando recarga suave...`);
            const reloaded = await attemptPageReload(client);
            if (reloaded) {
                console.log(`🟢 [SessionGuardian] Sesión recuperada tras recarga en UNPAIRED etapa 2.`);
                return;
            }

            // Etapa 3: Confirmar desvinculación definitiva y publicar estado
            console.error(`🛑 [SessionGuardian] Desvinculación definitiva confirmada desde el celular.`);
            currentStatus = 'REQUIRES_AUTH';
            lastLogMessage = 'Sesión desvinculada. Por favor escanea el código QR o solicita código en el Dashboard.';
            publishSessionStatus({
                status: 'REQUIRES_AUTH',
                lastMessage: lastLogMessage
            });
            // Iniciar vigilante activo de código QR para regeneración continua y auto-clic
            startActiveQRWatcher(client);
        } catch (err) {
            console.warn(`⚠️ [SessionGuardian] Error verificando UNPAIRED: ${err.message}`);
        }
    }, 5000);
}

/**
 * Reactivación suave y no destructiva de la conexión de WhatsApp Web.
 * Jamás recarga la página (evita perder tokens / volver al QR).
 */
async function triggerGentleKeepAlive(client) {
    if (!client || !client.page || client.page.isClosed()) return;
    try {
        await client.page.evaluate(() => {
            try {
                if (window.WPP?.conn?.setKeepAlive) window.WPP.conn.setKeepAlive(true);
                if (window.WPP?.whatsapp?.Socket?.poke) window.WPP.whatsapp.Socket.poke();
            } catch { /* ignorar */ }
        });
        console.log(`💓 [GUARDIAN] Latido suave enviado a WhatsApp Web.`);
    } catch (e) {
        console.warn(`⚠️ [GUARDIAN] Fallo menor en latido suave: ${e.message}`);
    }
}

/**
 * Manejador inteligente de cambios de estado de Socket de WhatsApp.
 * Tolera caídas transitorias de red sin matar el proceso ni recargar la página.
 */
function handleStateChange(state, client) {
    console.log(`📡 [GUARDIAN] Cambio de estado de conexión: ${state}`);

    if (state === 'CONNECTED') {
        consecutivePingFailures = 0;
        currentStatus = 'CONNECTED';
        lastConnectedTimestamp = Date.now();
        lastLogMessage = 'Conexión activa y estable con WhatsApp Web';
        console.log(`🟢 [GUARDIAN] Conexión activa y estable con WhatsApp Web.`);
        publishSessionStatus({
            status: 'CONNECTED',
            qrCode: null,
            pairingCode: null,
            lastMessage: lastLogMessage
        });
        return;
    }

    // Estados transitorios normales en micro-cortes, reposo o reconexiones de red
    const transientStates = ['TIMEOUT', 'DISCONNECTED', 'PAIRING', 'OPENING', 'RESUMING', 'SYNCING', 'UNPAIRED_IDLE'];
    if (transientStates.includes(state)) {
        console.warn(`🟡 [GUARDIAN] Estado de red transitorio (${state}). WhatsApp Web se está auto-reanudando pasivamente...`);
        currentStatus = 'RECONNECTING';
        lastLogMessage = `Estado de red transitorio (${state}). Auto-reanudando...`;
        publishSessionStatus({ status: 'RECONNECTING', lastMessage: lastLogMessage });
        triggerGentleKeepAlive(client);
        scheduleDeepConnectionCheck(client, state);
        return;
    }

    // Conflicto de sesión
    if (state === 'CONFLICT') {
        console.warn(`⚠️ [GUARDIAN] Conflicto de sesión (abierta en otro dispositivo). Intentando resolver...`);
        lastLogMessage = 'Conflicto de sesión detectado. Reclamando conexión...';
        publishSessionStatus({ lastMessage: lastLogMessage });
        attemptConflictResolution(client);
        return;
    }

    // Estado UNPAIRED definitivo
    if (state === 'UNPAIRED') {
        handleUnpairedState(client);
    }
}

/**
 * Inicia el Latido Proactivo "Zero-Idle" cada 35 segundos con escalación y sincronización en Firestore.
 */
function startZeroIdleHeartbeat(client) {
    if (heartbeatIntervalId) clearInterval(heartbeatIntervalId);

    heartbeatIntervalId = setInterval(async () => {
        const currentClient = activeClient || client;
        if (!isBrowserAlive(currentClient)) {
            consecutivePingFailures++;
            console.warn(`⚠️ [GUARDIAN] Chromium no está activo (fallo #${consecutivePingFailures}/${MAX_CONSECUTIVE_HEARTBEAT_FAILS}). Iniciando auto-recuperación...`);
            recoverChromiumBrowser('HEARTBEAT_BROWSER_DEAD');
            return;
        }

        try {
            // Micro-evaluación segura en el contexto del navegador (<10ms)
            const evaluation = await Promise.race([
                currentClient.page.evaluate(() => {
                    try {
                        if (window.WPP?.conn?.setKeepAlive) window.WPP.conn.setKeepAlive(true);
                        return {
                            isOnline: window.WPP?.conn?.isOnline?.() ?? (window.WAPI?.isConnected?.() ?? true),
                            state: window.WPP?.whatsapp?.Socket?.state ?? 'UNKNOWN',
                            stream: window.WPP?.whatsapp?.Socket?.stream ?? 'UNKNOWN'
                        };
                    } catch {
                        return { isOnline: true };
                    }
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout de latido (20s)')), 20000))
            ]);

            // Si responde, el hilo de Chromium está 100% activo y vivo
            consecutivePingFailures = 0;
            lastHeartbeatTimestamp = Date.now();
            
            // Publicar actualización periódica de latido en Firestore
            publishSessionStatus({
                status: currentStatus === 'REQUIRES_AUTH' ? 'REQUIRES_AUTH' : 'CONNECTED',
                lastHeartbeat: new Date().toISOString()
            });
        } catch (err) {
            consecutivePingFailures++;
            console.warn(`⚠️ [GUARDIAN] Latido #${consecutivePingFailures}/${MAX_CONSECUTIVE_HEARTBEAT_FAILS} sin respuesta: ${err.message}`);

            if (consecutivePingFailures === 3) {
                console.log(`🔄 [GUARDIAN] 3 latidos fallidos. Enviando señal suave de reactivación...`);
                triggerGentleKeepAlive(currentClient);
            } else if (consecutivePingFailures === 5) {
                console.log(`🔄 [GUARDIAN] 5 latidos fallidos. Intentando recarga de página Chromium...`);
                attemptPageReload(currentClient);
            } else if (consecutivePingFailures === 8) {
                console.warn(`⚠️ [GUARDIAN] 8 latidos fallidos. Verificando si apareció pantalla de QR...`);
                startActiveQRWatcher(currentClient);
            } else if (consecutivePingFailures >= MAX_CONSECUTIVE_HEARTBEAT_FAILS) {
                console.error(`🛑 [GUARDIAN] ${MAX_CONSECUTIVE_HEARTBEAT_FAILS} latidos fallidos consecutivos (>6 minutos sin respuesta del navegador).`);
                console.error(`🛑 [GUARDIAN] Ejecutando auto-recuperación de Chromium...`);
                recoverChromiumBrowser('MAX_HEARTBEAT_FAILURES');
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

    // 0. Detectar cierre o desconexión del navegador/página
    if (client.page && typeof client.page.on === 'function') {
        client.page.on('close', () => {
            console.warn(`🛑 [SessionGuardian] Evento page.close detectado en Chromium.`);
            if (!isShuttingDown) {
                recoverChromiumBrowser('PAGE_CLOSED');
            }
        });
        client.page.on('error', (err) => {
            console.warn(`⚠️ [SessionGuardian] Error en página Chromium: ${err.message}`);
        });
    }

    try {
        const browser = typeof client.page?.browser === 'function' ? client.page.browser() : null;
        if (browser && typeof browser.on === 'function') {
            browser.on('disconnected', () => {
                console.warn(`🛑 [SessionGuardian] Evento browser.disconnected detectado en Chromium.`);
                if (!isShuttingDown) {
                    recoverChromiumBrowser('BROWSER_DISCONNECTED');
                }
            });
        }
    } catch {}

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

    // 5. Si la sesión requiere autenticación, iniciar vigilante QR
    if (currentStatus === 'REQUIRES_AUTH') {
        startActiveQRWatcher(client);
    }

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

    stopActiveQRWatcher();
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
    // Bloquea el comportamiento por defecto de BuilderBot que intenta borrar tokens.
    // CRÍTICO: Verifica si el error es realmente de WhatsApp o si es de Firebase/Firestore
    // (los errores gRPC de Firestore a veces se propagan incorrectamente como auth_failure).
    provider.on('auth_failure', async (payload) => {
        const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload || '');
        console.error(`💥 [SessionGuardian] Evento auth_failure detectado: ${payloadStr}`);

        // Detectar si el error es de Firebase/Firestore (NO de WhatsApp)
        const isFirebaseError = payloadStr.includes('firestore') ||
            payloadStr.includes('firebase') ||
            payloadStr.includes('GrpcConnection') ||
            payloadStr.includes('UNAVAILABLE') ||
            payloadStr.includes('2800:3f0:') ||
            payloadStr.includes('googleapis.com') ||
            payloadStr.includes('Listen') ||
            payloadStr.includes('grpc');

        if (isFirebaseError) {
            console.warn(`🛡️ [SessionGuardian] Error de Firebase/Firestore detectado como auth_failure falso positivo.`);
            console.warn(`🛡️ [SessionGuardian] La sesión de WhatsApp NO está comprometida. Ignorando.`);
            return;
        }

        // Detectar si el error es de inicialización de WPPConnect / sharp (NO desvinculación real)
        const isInitError = payloadStr.includes('An error occurred during WPP initialization') ||
            payloadStr.includes('cleanImage') ||
            payloadStr.includes('colourspace');

        if (isInitError) {
            console.warn(`🛡️ [SessionGuardian] Fallo de inicialización de WPPConnect transitorio. La sesión en IndexedDB se mantiene intacta.`);
            return;
        }

        console.warn(`🛑 [SessionGuardian] Armadura FS activa: Se impidió el borrado de bot_sessions.`);

        // Verificar si WhatsApp realmente perdió autenticación
        try {
            const client = activeClient || await getWppClient(provider);
            if (client && client.page && !client.page.isClosed()) {
                const isLoggedIn = await Promise.race([
                    client.isLoggedIn().catch(() => null),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
                ]);
                if (isLoggedIn === true || isLoggedIn === null) {
                    console.log(`🟢 [SessionGuardian] Verificación post-auth_failure: WhatsApp sigue autenticado. Falsa alarma.`);
                    triggerGentleKeepAlive(client);
                    return;
                }
            }
        } catch (verifyErr) {
            console.warn(`⚠️ [SessionGuardian] No se pudo verificar estado de WhatsApp post-auth_failure: ${verifyErr.message}`);
        }

        console.error(`🛑 [SessionGuardian] auth_failure REAL confirmado. La sesión podría necesitar re-vinculación QR.`);
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

    // 6. Tolerancia a errores recuperables de red / Node.js / Firebase / Firestore
    const isRecoverableError = (errorMsg) => {
        const recoverablePatterns = [
            // Errores de red genéricos
            'Vendor should not return empty',
            'EBUSY',
            'ECONNRESET',
            'ETIMEDOUT',
            'EHOSTUNREACH',
            'ENOTFOUND',
            'ECONNREFUSED',
            'EPIPE',
            'EAI_AGAIN',
            'ENETUNREACH',
            'ENETDOWN',
            'ECONNABORTED',
            'EHOSTDOWN',
            'ERR_SOCKET_CONNECTION_TIMEOUT',
            'socket hang up',
            'network timeout',
            'No connection established',
            // Errores de Chromium / Puppeteer
            'Execution context was destroyed',
            'Target closed',
            'Protocol error',
            'Evaluation failed',
            'Session closed',
            'Page crashed',
            'frame was detached',
            'Cannot find context with specified id',
            'Inspected target navigated or closed',
            'Connection closed',
            // Errores de procesamiento de medios (sharp/image)
            'colourspace',
            'parameter space not set',
            'Input buffer contains unsupported image format',
            // Firebase / Firestore / gRPC
            'GrpcConnection',
            'UNAVAILABLE',
            'firestore',
            '@firebase',
            'Listen stream',
            'Write stream',
            'grpc',
            'RST_STREAM',
            'GOAWAY',
            'INTERNAL',
            'DEADLINE_EXCEEDED',
            'RESOURCE_EXHAUSTED',
            'CANCELLED',
            'DATA_LOSS',
            'Firestore has already been terminated',
            'Could not reach Cloud Firestore',
            'Missing or insufficient permissions',
            'Failed to get document',
            '2800:3f0:',
            'googleapis.com',
            'firebaseio.com'
        ];
        return recoverablePatterns.some(p => errorMsg.includes(p));
    };

    process.on('uncaughtException', (err) => {
        const errorMsg = err?.message || String(err || '');
        const errorStack = err?.stack || '';

        if (isRecoverableError(errorMsg) || isRecoverableError(errorStack)) {
            console.warn(`⚠️ [SessionGuardian] Error no capturado recuperable absorbido para mantener bot activo: ${errorMsg}`);
            return;
        }

        console.error(`💥 [SessionGuardian] Excepción no capturada crítica: ${err.message}`);
        try { backupSession(); } catch { /* ignorar */ }
        gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason) => {
        const errorMsg = reason?.message || String(reason || '');
        const errorStack = reason?.stack || '';

        if (isRecoverableError(errorMsg) || isRecoverableError(errorStack) ||
            (errorStack && errorStack.includes('cleanImage'))) {
            console.warn(`⚠️ [SessionGuardian] Rechazo de promesa no crítico tolerado: ${errorMsg}`);
            return;
        }

        console.warn(`⚠️ [SessionGuardian] Advertencia en promesa no manejada:`, reason);
        try { backupSession(); } catch { /* ignorar */ }
    });

    // 7. Iniciar backups periódicos
    startPeriodicBackups();

    // 8. Iniciar listener de comandos remotos desde el Dashboard de control
    initRemoteCommandListener();

    // 9. Publicar estado inicial en Firestore para sincronización instantánea
    publishSessionStatus({
        status: 'INITIALIZING',
        lastMessage: 'Guardián Infalible de sesión iniciado y vigilando'
    });

    console.log(`✅ [SessionGuardian] Guardián Infalible completamente armado y operativo.\n`);
}
