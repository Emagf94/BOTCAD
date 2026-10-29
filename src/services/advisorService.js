import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';
import { BOT_ADVISORS, BOT_SETTINGS } from '../botConfig.js';
import { normalizeAdminJids } from '../utils/helpers.js';

let providerInstance = null;
let lastHandledCommandTimestamp = 0;

/**
 * Envía una notificación simulada de soporte a los asesores a través de WhatsApp
 * para verificar que sus líneas reciban las alertas y el comando !atender funcione.
 * 
 * @param {object} params
 * @param {string} [params.targetAdvisorPhone] Número específico de asesor o 'all'
 * @param {string} [params.mockClientName] Nombre simulado del cliente
 * @param {string} [params.mockClientPhone] Teléfono simulado del cliente
 * @param {string} [params.mockSubject] Asunto de prueba
 * @returns {Promise<{ success: boolean, recipients: string[], error?: string }>}
 */
export const sendAdvisorTestAlert = async ({
    targetAdvisorPhone = 'all',
    mockClientName = 'Cliente de Prueba (Dashboard)',
    mockClientPhone = '573001234567',
    mockSubject = 'Verificación técnica de alerta y comando !atender'
} = {}) => {
    if (!providerInstance) {
        console.warn('⚠️ [AdvisorService] Provider de WhatsApp no disponible para enviar alerta de prueba.');
        return { success: false, recipients: [], error: 'Provider de WhatsApp no inicializado' };
    }

    try {
        let recipientPhones = [];
        if (targetAdvisorPhone && targetAdvisorPhone !== 'all') {
            let clean = String(targetAdvisorPhone).replace(/\D/g, '');
            if (clean.length === 10) clean = '57' + clean;
            recipientPhones = [`${clean}@c.us`];
        } else {
            // Todos los asesores activos que reciban soporte
            recipientPhones = BOT_ADVISORS
                .filter(a => a.active !== false && a.receiveSupport !== false && a.phone)
                .map(a => {
                    let clean = String(a.phone).replace(/\D/g, '');
                    if (clean.length === 10) clean = '57' + clean;
                    return `${clean}@c.us`;
                });

            // Si la lista está vacía, fallback a adminSupportPhone
            if (recipientPhones.length === 0) {
                recipientPhones = normalizeAdminJids(BOT_SETTINGS.adminSupportPhone || '573184849332@c.us, 573135363218@c.us');
            }
        }

        const nowBogota = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
        const testMessage = `🧪 *[PRUEBA DE CONFIGURACIÓN DE ASESOR]*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `👤 *Cliente:* ${mockClientName}\n` +
            `📱 *Teléfono:* +${mockClientPhone}\n` +
            `📝 *Asunto:* ${mockSubject}\n` +
            `⏰ *Fecha:* ${nowBogota}\n\n` +
            `👉 *Para atender este chat simulado, responde:*\n` +
            `*!atender*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `💡 _Notificación de prueba emitida desde el panel de control para comprobar la recepción._`;

        const successfulRecipients = [];
        for (const phoneJid of recipientPhones) {
            try {
                const target = phoneJid.includes('@') ? phoneJid : `${phoneJid}@c.us`;
                await providerInstance.sendMessage(target, testMessage, {});
                successfulRecipients.push(target.split('@')[0]);
                console.log(`✅ [AdvisorService] Alerta de prueba enviada a: ${target}`);
            } catch (err) {
                console.error(`❌ [AdvisorService] Error enviando alerta de prueba a ${phoneJid}:`, err.message);
            }
        }

        return {
            success: successfulRecipients.length > 0,
            recipients: successfulRecipients,
            timestamp: Date.now(),
            timeStr: nowBogota
        };
    } catch (e) {
        console.error('❌ [AdvisorService] Error general enviando alerta de prueba:', e);
        return { success: false, recipients: [], error: e.message };
    }
};

/**
 * Inicializa el listener en Firestore ('config/advisor_test') para responder
 * a peticiones de prueba emitidas desde el Dashboard.
 * 
 * @param {object} provider Adapter provider de BuilderBot
 */
export const initAdvisorService = (provider) => {
    providerInstance = provider;
    console.log('🧪 [AdvisorService] Servicio de prueba de asesores inicializado.');

    if (!db) {
        console.warn('⚠️ [AdvisorService] Firestore db no disponible para listener de pruebas de asesor.');
        return;
    }

    try {
        const testDocRef = doc(db, 'config', 'advisor_test');
        onSnapshot(testDocRef, async (snapshot) => {
            if (!snapshot.exists()) return;
            const data = snapshot.data();
            const action = data?.action;
            const actionTimestamp = data?.actionTimestamp || 0;

            if (!action || action !== 'SEND_TEST_ALERT') return;
            if (actionTimestamp <= lastHandledCommandTimestamp) return;
            lastHandledCommandTimestamp = actionTimestamp;

            console.log('📡 [AdvisorService] Petición de prueba recibida desde Dashboard UI.');

            const result = await sendAdvisorTestAlert({
                targetAdvisorPhone: data.targetAdvisorPhone || 'all',
                mockClientName: data.mockClientName || 'Cliente de Prueba (Dashboard)',
                mockClientPhone: data.mockClientPhone || '573001234567',
                mockSubject: data.mockSubject || 'Verificación de recepción y alerta'
            });

            // Guardar confirmación en Firestore
            try {
                await setDoc(testDocRef, {
                    lastResult: {
                        success: result.success,
                        timestamp: Date.now(),
                        timeStr: new Date().toLocaleTimeString('es-CO', { timeZone: 'America/Bogota' }),
                        recipients: result.recipients,
                        count: result.recipients.length,
                        error: result.error || null
                    }
                }, { merge: true });
                console.log(`📡 [AdvisorService] Resultado de prueba guardado en Firestore (${result.recipients.length} enviados).`);
            } catch (err) {
                console.error('Error guardando resultado de prueba en Firestore:', err);
            }
        }, (err) => {
            console.warn(`⚠️ [AdvisorService] Error en listener de Firestore advisor_test: ${err.message}`);
        });
    } catch (e) {
        console.warn(`⚠️ [AdvisorService] Error configurando listener Firestore advisor_test: ${e.message}`);
    }
};
