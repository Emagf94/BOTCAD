/**
 * =============================================================================
 *  SESSION GUARD - Protección blindada de la sesión de WhatsApp
 * =============================================================================
 * 
 *  Este módulo protege la sesión del bot contra reinicios del PC, cierres
 *  inesperados y corrupción de datos de Chromium/WPPConnect.
 * 
 *  Capas de protección:
 *    1. Apagado limpio (graceful shutdown) → cierra Chromium antes de morir
 *    2. Limpieza de lockfiles corruptos al arrancar
 *    3. Backup automático de la sesión en intervalos regulares
 *    4. Restauración automática del backup si la sesión se corrompe
 * =============================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Rutas de sesión de WPPConnect/Chromium
const SESSION_DIR = path.join(PROJECT_ROOT, 'bot_sessions');
const BACKUP_DIR = path.join(PROJECT_ROOT, 'bot_sessions_backup');
const LOCKFILE_PATH = path.join(SESSION_DIR, 'bot_sessions', 'lockfile');
const SINGLETONLOCK_PATH = path.join(SESSION_DIR, 'bot_sessions', 'SingletonLock');

// Archivos críticos de la sesión que se deben respaldar
const CRITICAL_SESSION_PATHS = [
    'bot_sessions/Default/Local Storage',
    'bot_sessions/Default/IndexedDB',
    'bot_sessions/Default/Session Storage',
    'bot_sessions/Default/Preferences',
    'bot_sessions/Default/Secure Preferences',
    'bot_sessions/Local State',
];

// Intervalo de backup (cada 5 minutos)
const BACKUP_INTERVAL_MS = 5 * 60 * 1000;

let backupIntervalId = null;
let providerRef = null;
let isShuttingDown = false;

/**
 * Copia un directorio de forma recursiva
 */
function copyDirSync(src, dest) {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            try {
                fs.copyFileSync(srcPath, destPath);
            } catch {
                // Algunos archivos pueden estar bloqueados, se omiten
            }
        }
    }
}

/**
 * Elimina un directorio de forma recursiva (sin errores si no existe)
 */
function removeDirSync(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    try {
        fs.rmSync(dirPath, { recursive: true, force: true });
    } catch {
        // Si falla, intentar de a poco
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                if (entry.isDirectory()) {
                    removeDirSync(fullPath);
                } else {
                    try { fs.unlinkSync(fullPath); } catch { /* ignorar */ }
                }
            }
            fs.rmdirSync(dirPath);
        } catch { /* ignorar */ }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CAPA 1: Limpieza de lockfiles corruptos al arrancar
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Elimina lockfiles que Chromium deja cuando se cierra de forma brusca.
 * Estos archivos hacen que Chromium crea que ya hay una instancia corriendo
 * y puede causar que la sesión se reinicie/invalide.
 */
export function cleanCorruptLockfiles() {
    const lockfiles = [LOCKFILE_PATH, SINGLETONLOCK_PATH];
    let cleaned = 0;

    for (const lockfile of lockfiles) {
        if (fs.existsSync(lockfile)) {
            try {
                fs.unlinkSync(lockfile);
                cleaned++;
                console.log(`🧹 [SessionGuard] Lockfile corrupto eliminado: ${path.basename(lockfile)}`);
            } catch (err) {
                console.warn(`⚠️  [SessionGuard] No se pudo eliminar lockfile: ${err.message}`);
            }
        }
    }

    // También limpiar el archivo "DevToolsActivePort" que puede causar conflictos
    const devToolsFile = path.join(SESSION_DIR, 'bot_sessions', 'DevToolsActivePort');
    if (fs.existsSync(devToolsFile)) {
        try {
            fs.unlinkSync(devToolsFile);
            cleaned++;
            console.log(`🧹 [SessionGuard] DevToolsActivePort limpiado`);
        } catch { /* ignorar */ }
    }

    if (cleaned > 0) {
        console.log(`✅ [SessionGuard] ${cleaned} archivo(s) de bloqueo limpiados. La sesión anterior se conserva intacta.`);
    } else {
        console.log(`✅ [SessionGuard] No se encontraron lockfiles corruptos. Sesión limpia.`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CAPA 2: Backup automático de la sesión
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Crea un backup de los archivos críticos de la sesión de WhatsApp.
 * Se ejecuta periódicamente para tener siempre una copia reciente.
 */
export function backupSession() {
    if (!fs.existsSync(SESSION_DIR)) {
        console.log(`ℹ️  [SessionGuard] No hay sesión que respaldar todavía.`);
        return false;
    }

    try {
        // Verificar que hay datos reales de sesión (IndexedDB es clave para WPPConnect)
        const indexedDBPath = path.join(SESSION_DIR, 'bot_sessions', 'Default', 'IndexedDB');
        if (!fs.existsSync(indexedDBPath)) {
            console.log(`ℹ️  [SessionGuard] Sesión sin datos de IndexedDB, omitiendo backup.`);
            return false;
        }

        // Crear backup eliminando el anterior
        removeDirSync(BACKUP_DIR);

        for (const relPath of CRITICAL_SESSION_PATHS) {
            const srcPath = path.join(SESSION_DIR, relPath);
            const destPath = path.join(BACKUP_DIR, relPath);
            if (fs.existsSync(srcPath)) {
                const stat = fs.statSync(srcPath);
                if (stat.isDirectory()) {
                    copyDirSync(srcPath, destPath);
                } else {
                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                    try {
                        fs.copyFileSync(srcPath, destPath);
                    } catch { /* archivo bloqueado */ }
                }
            }
        }

        // Guardar timestamp del backup
        const metaPath = path.join(BACKUP_DIR, '_backup_meta.json');
        fs.writeFileSync(metaPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleString('es-CO'),
            version: '1.0'
        }, null, 2));

        console.log(`💾 [SessionGuard] Backup de sesión creado exitosamente (${new Date().toLocaleTimeString('es-CO')})`);
        return true;
    } catch (err) {
        console.error(`❌ [SessionGuard] Error creando backup: ${err.message}`);
        return false;
    }
}

/**
 * Restaura la sesión desde el backup si la sesión actual está corrupta o vacía.
 * Se ejecuta SOLO si la sesión no tiene datos válidos Y existe un backup.
 */
export function restoreSessionIfNeeded() {
    // Si ya hay una sesión válida con IndexedDB, no restaurar
    const indexedDBPath = path.join(SESSION_DIR, 'bot_sessions', 'Default', 'IndexedDB');
    if (fs.existsSync(indexedDBPath)) {
        const files = fs.readdirSync(indexedDBPath);
        if (files.length > 0) {
            console.log(`✅ [SessionGuard] Sesión existente válida detectada. No se necesita restaurar.`);
            return false;
        }
    }

    // Verificar si hay backup disponible
    const metaPath = path.join(BACKUP_DIR, '_backup_meta.json');
    if (!fs.existsSync(metaPath)) {
        console.log(`ℹ️  [SessionGuard] No hay backup previo disponible para restaurar.`);
        return false;
    }

    try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        console.log(`🔄 [SessionGuard] Restaurando sesión desde backup del ${meta.date}...`);

        for (const relPath of CRITICAL_SESSION_PATHS) {
            const srcPath = path.join(BACKUP_DIR, relPath);
            const destPath = path.join(SESSION_DIR, relPath);
            if (fs.existsSync(srcPath)) {
                const stat = fs.statSync(srcPath);
                if (stat.isDirectory()) {
                    // Eliminar la versión corrupta antes de restaurar
                    removeDirSync(destPath);
                    copyDirSync(srcPath, destPath);
                } else {
                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                    try {
                        fs.copyFileSync(srcPath, destPath);
                    } catch { /* ignorar */ }
                }
            }
        }

        console.log(`✅ [SessionGuard] Sesión restaurada exitosamente desde backup.`);
        return true;
    } catch (err) {
        console.error(`❌ [SessionGuard] Error restaurando sesión: ${err.message}`);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CAPA 3: Apagado limpio (Graceful Shutdown)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Cierra el proveedor WPPConnect/Chromium de forma limpia antes de que
 * el proceso Node.js termine. Esto preserva la sesión de WhatsApp.
 */
async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n🛑 [SessionGuard] Señal ${signal} recibida. Cerrando bot de forma segura...`);

    // Detener backups automáticos
    if (backupIntervalId) {
        clearInterval(backupIntervalId);
        backupIntervalId = null;
    }

    // Hacer un último backup antes de cerrar
    try {
        console.log(`💾 [SessionGuard] Creando backup final antes de cerrar...`);
        backupSession();
    } catch (err) {
        console.error(`⚠️  [SessionGuard] Error en backup final: ${err.message}`);
    }

    // Cerrar el proveedor WPPConnect de forma limpia
    if (providerRef) {
        try {
            console.log(`🌐 [SessionGuard] Cerrando sesión de Chromium/WPPConnect...`);

            // Intentar cerrar el vendor (WPPConnect client) si existe
            if (providerRef.vendor) {
                try {
                    await Promise.race([
                        providerRef.vendor.close(),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000))
                    ]);
                    console.log(`✅ [SessionGuard] WPPConnect cerrado limpiamente.`);
                } catch (err) {
                    console.warn(`⚠️  [SessionGuard] Cierre de WPPConnect con timeout: ${err.message}`);
                }
            }
        } catch (err) {
            console.error(`⚠️  [SessionGuard] Error cerrando proveedor: ${err.message}`);
        }
    }

    console.log(`👋 [SessionGuard] Bot cerrado de forma segura. La sesión se conserva para el próximo inicio.`);

    // Dar un momento para que los logs se escriban
    setTimeout(() => {
        process.exit(0);
    }, 1000);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CAPA 4: Inicialización y registro de señales
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Inicializa todas las capas de protección del SessionGuard.
 * Debe llamarse ANTES de crear el proveedor WPPConnect.
 * 
 * @param {object} provider - Referencia al proveedor WPPConnect (se establece después)
 */
export function initSessionGuard(provider) {
    console.log(`\n🛡️  ════════════════════════════════════════════════════════`);
    console.log(`🛡️   SESSION GUARD - Protección de sesión activada`);
    console.log(`🛡️  ════════════════════════════════════════════════════════\n`);

    // Guardar referencia al proveedor para el graceful shutdown
    providerRef = provider;

    // (La limpieza de lockfiles y restauración de sesión ya se ejecutaron
    //  en app.js ANTES de crear el proveedor, no se repiten aquí)

    // CAPA 3: Registrar handlers de cierre limpio
    // SIGINT  = Ctrl+C en la consola
    // SIGTERM = kill <pid> / cierre del servicio de Windows
    // SIGHUP  = cierre de la terminal
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

    // En Windows: evento especial cuando la consola se cierra
    // o el sistema se apaga/reinicia
    if (process.platform === 'win32') {
        // 'beforeExit' y 'exit' para Windows
        process.on('beforeExit', () => {
            if (!isShuttingDown) {
                console.log(`🛑 [SessionGuard] Evento beforeExit detectado.`);
                backupSession();
            }
        });
    }

    // Capturar errores no manejados para hacer backup antes de morir
    process.on('uncaughtException', (err) => {
        console.error(`💥 [SessionGuard] Error no capturado: ${err.message}`);
        console.error(err.stack);
        try { backupSession(); } catch { /* ignorar */ }
        // Salir para que el watchdog (.bat) reinicie el proceso limpiamente
        process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
        console.error(`💥 [SessionGuard] Promesa rechazada sin manejar:`, reason);
        backupSession();
    });

    console.log(`✅ [SessionGuard] Todas las capas de protección activadas:`);
    console.log(`   • Limpieza de lockfiles al arrancar`);
    console.log(`   • Restauración automática de sesión`);
    console.log(`   • Apagado limpio (graceful shutdown)`);
    console.log(`   • Backup periódico cada 5 minutos\n`);
}

/**
 * Inicia los backups automáticos periódicos.
 * Debe llamarse DESPUÉS de que el bot esté conectado y funcionando.
 */
export function startPeriodicBackups() {
    // Primer backup después de 30 segundos (dar tiempo a que la sesión se estabilice)
    setTimeout(() => {
        backupSession();

        // Después, cada 5 minutos
        backupIntervalId = setInterval(() => {
            backupSession();
        }, BACKUP_INTERVAL_MS);

        console.log(`🔄 [SessionGuard] Backups automáticos activados (cada 5 min)`);
    }, 30000);
}
