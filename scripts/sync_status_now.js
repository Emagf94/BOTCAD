/**
 * Script de Sincronización Inmediata de Estado de Sesión en Firestore
 * Útil para restablecer el estado 'CONNECTED' y enviar la orden de sincronización al bot.
 */
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../src/firebase.js';

async function syncStatusNow() {
    console.log('🔄 Sincronizando estado de sesión en Firestore...');
    try {
        // 1. Enviar comando de sincronización forzada al bot
        const cmdRef = doc(db, 'config', 'bot_session_commands');
        await setDoc(cmdRef, {
            action: 'FORCE_STATUS_SYNC',
            timestamp: Date.now()
        }, { merge: true });
        console.log('✅ Comando FORCE_STATUS_SYNC enviado al bot.');

        // 2. Actualizar estado visible de la sesión a CONNECTED
        const statusRef = doc(db, 'config', 'bot_session');
        await setDoc(statusRef, {
            status: 'CONNECTED',
            hostPhone: '573116584423',
            qrCode: null,
            pairingCode: null,
            pairingExpiry: null,
            lastMessage: 'Bot conectado y operativo (+573116584423)',
            lastHeartbeat: new Date().toISOString(),
            lastConnectedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }, { merge: true });
        console.log('✅ Documento config/bot_session actualizado con éxito a CONNECTED (+573116584423).');
        console.log('🎉 La interfaz web ya debe reflejar el estado En Línea.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error sincronizando estado:', err.message);
        process.exit(1);
    }
}

syncStatusNow();
