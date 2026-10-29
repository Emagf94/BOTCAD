import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase.js';

// ==========================================
// PRECIOS POR DEFECTO
// ==========================================
export const BOT_PRICES = {
    carteleras: {
        'A0': 20000,
        'A1': 15000,
        'A2': 10000,
        'A3': 4000
    },
    carteleras_cartulina: {
        'A0': 35000,
        'A1': 20000,
        'A2': 15000,
        'A3': 15000
    },
    planos_bn: {
        'A0': 8500,
        'A1': 6500,
        'A2': 3500,
        'A3': 200,
        'Carta': 500,
        'Oficio': 1000
    },
    planos_color_lineas: {
        'A0': 10000,
        'A1': 8000,
        'A2': 6000,
        'A3': 4000,
        'Carta': 1000,
        'Oficio': 1500
    },
    planos_color_plenos: {
        'A0': 20000,
        'A1': 15000,
        'A2': 10000,
        'A3': 4000,
        'Carta': 4000,
        'Oficio': 4000
    },
    fotos: {
        '10x15': 4000,
        'A4': 4000,
        'Carta': 4000
    },
    documentos: {
        'bn_bond': { 'Carta': 500, 'Oficio': 1500, 'Tabloide': 2000 },
        'color_bond': { 'Carta': 1000, 'Oficio': 1500, 'Tabloide': 4000 },
        'color_propalcote': { 'Carta': 4000, 'Oficio': 4000, 'Tabloide': 6000 },
        'bn_propalcote': { 'Carta': 4000, 'Oficio': 4000, 'Tabloide': 6000 },
        'color_opalina': { 'Carta': 4000, 'Oficio': 4000, 'Tabloide': 6000 },
        'bn_opalina': { 'Carta': 4000, 'Oficio': 4000, 'Tabloide': 6000 }
    },
    gran_formato: {
        pendones: { '100x70': 95000, '70x50': 70000, '200x100': 150000, '80x120': 120000, '35x50': 50000 },
        pasacalles: { '350x70': 178500, '600x70': 301000 },
        adhesivos: { '100x70': 95000, '70x50': 70000, '200x100': 150000, '80x120': 120000, '35x50': 50000 },
        microperforados: { '100x70': 95000, '70x50': 70000, '200x100': 150000, '80x120': 120000, '35x50': 50000 }
    },
    sublimacion: {
        'Mug Blanco': 20000,
        'Mug Mágico': 30000,
        'Termo Metálico': 35000,
        'Camiseta Blanca': 25000,
        'Camiseta Color': 25000,
        'Gorra': 25000,
        'Pad Mouse': 20000
    },
    otros: {
        'Carnet 1 Cara': 15000,
        'Carnet 2 Caras': 25000,
        'Cuerda Porta Carnet Sola': 10000,
        'Cuerda Porta Carnet Completa': 13000,
        'Impresión UV 39x29': 35000,
        'Diseño Sencillo (Pendón)': 60000,
        'Placa Nomenclatura': 25000,
        'Placa Reconocimiento': 40000,
        'Escáner A0/A1/A2': 5000
    },
    sellos: {
        'S-843': 50000,
        'S-830': 95000,
        '913': 70000,
        'R552': 95000,
        'S829D': 95000,
        'S826D': 70000,
        'S723 - SP723': 50000,
        'R542': 70000
    }
};

// ==========================================
// MENSAJES Y TEXTOS DE FLUJOS POR DEFECTO
// ==========================================
export const BOT_MESSAGES = {
    ubicacion: '📍 *Ubicación*\n\nEstamos ubicados en Quibdó. [Espacio para dirección exacta].',
    horarios: '🕒 *Horarios*\n\nLunes a viernes de 8:30am a 12:30pm y de 2:00pm a 6:00pm.',
    bienvenidaNuevo: '¡Hola!\nSoy *Cadi*, tu asistente virtual 🤖.\n¡Bienvenido a *CAD Impresiones* 🖨️!',
    bienvenidaRegistrado: '¡Hola *{name}*!\nSoy *Cadi*, tu asistente virtual 🤖.\nBienvenido de nuevo a *CAD Impresiones* 🖨️',
    soporteAsesor: '👨‍💻 *Contacto Directo con un Asesor*\nEn unos instantes un asesor se unirá a esta conversación.\n\nEscribe tus dudas por aquí. Para cancelar o terminar la sesión escribe *0* o *salir*.',
    pagoTransferencia: '📱 *Pago por Transferencia*\nAceptamos Bancolombia, Nequi y Daviplata.\n👉 Por favor envía la *foto o captura de tu comprobante de pago* por este medio.\n\n*0.* ⬅️ Cancelar pedido',
    pagoEfectivo: '🏢 Has elegido pago en *Efectivo*.\n⚠️ Recuerda que debes acercarte a nuestro local para realizar el pago, y *solo en ese momento se iniciará la impresión*.\n¡Te esperamos en CAD Impresiones!',
    pedidoExitoso: '✅ ¡Tu pedido ha sido recibido con éxito! 🎉\nUn asesor revisará tus archivos y tu pago, y te contactará por este medio para confirmarlo.\n¡Gracias por preferir CAD Impresiones!',
    bienvenidaConArchivoRegistrado: '¡Hola *{name}*! 👋 Soy *Cadi*, tu asistente virtual de *CAD Impresiones* 🖨️.\n¡Qué gusto saludarte de nuevo! He recibido tu archivo correctamente y ya lo tengo guardado en el sistema 📁✨\n\n🚨 *¡ATENCIÓN IMPORTANTE!* 🚨\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n📌 *Para procesar tu archivo, por favor selecciona una opción del menú que verás a continuación:*\n\n👉 *Marca la OPCIÓN 7* (*Envío Directo de Archivos*): Si deseas que un asesor lo revise personalmente, te cotice a medida o si tienes indicaciones especiales.\n👉 *O marca cualquiera de las otras opciones* (*1* Carteleras, *2* Planos CAD, *3* Documentos, *4* Gran Formato, etc.) según el servicio que necesitas.\n━━━━━━━━━━━━━━━━━━━━━━━━━━',
    bienvenidaConArchivoNuevo: '¡Hola! 👋 Te damos una cordial bienvenida a *CAD Impresiones* 🖨️. Soy *Cadi*, tu asistente virtual 🤖.\nHe recibido tu archivo con éxito y ya quedó guardado en el sistema 📁✨\n\n🚨 *¡ATENCIÓN IMPORTANTE!* 🚨\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n📌 *Tu archivo ya está seguro con nosotros.* Para poder procesarlo y contactarte sobre tu pedido, primero necesitamos registrar tus datos básicos.\n\nLuego podrás elegir en el menú la *opción 7* (*Envío Directo a un Asesor*) o cualquiera de nuestros servicios.\n━━━━━━━━━━━━━━━━━━━━━━━━━━'
};

// ==========================================
// MULTIMEDIA Y STICKERS POR DEFECTO
// ==========================================
export const BOT_MEDIA = {
    sendStickers: true,
    sendLogo: true,
    sendPaymentQR: true,
    stickerFinishedChat: './assets/chat_f.webp',
    stickerCadiAlert: './assets/cadi_a.png',
    logoImage: './assets/logo.png',
    paymentQRImage: './assets/qr_pagos.png'
};

// ==========================================
// CONFIGURACIÓN GENERAL Y ENRUTAMIENTO
// ==========================================
export const BOT_SETTINGS = {
    adminOrdersPhone: '573135363218@c.us',
    adminSupportPhone: '573184849332@c.us, 573135363218@c.us, 573136303477@c.us',
    adminEscapes: ['573184849332', '235780886794250', '573135363218', '3135363218', '13770403381354', '573136303477', '3136303477'],
    botName: 'Cadi',
    inactivityMinutes: 10,
    advisorIdleTimeoutMs: 1800000
};

// ==========================================
// ASESORES Y ROLES DINÁMICOS
// ==========================================
export const BOT_ADVISORS = [
    {
        id: 'adv_3135363218',
        name: 'CAD Principal',
        phone: '573135363218',
        lid: '235780886794250',
        role: 'admin',
        active: true,
        receiveSupport: true,
        receiveOrders: true,
        canExecuteCommands: true,
        canManageSupport: true,
        canBroadcast: true
    },
    {
        id: 'adv_3184849332',
        name: 'Manuel Asesor',
        phone: '573184849332',
        lid: '',
        role: 'advisor',
        active: true,
        receiveSupport: true,
        receiveOrders: false,
        canExecuteCommands: true,
        canManageSupport: true,
        canBroadcast: false
    },
    {
        id: 'adv_3136303477',
        name: 'Asesor 3136303477',
        phone: '573136303477',
        lid: '',
        role: 'advisor',
        active: true,
        receiveSupport: true,
        receiveOrders: false,
        canExecuteCommands: true,
        canManageSupport: true,
        canBroadcast: false
    }
];

// ==========================================
// HORARIO DE ATENCIÓN Y MODO DE PRUEBA
// ==========================================
export const DEFAULT_SCHEDULE = {
    mode: 'auto', // 'auto' | 'always_open' | 'always_closed'
    timezone: 'America/Bogota',
    days: {
        1: { name: 'Lunes', enabled: true, slots: [{ start: '08:30', end: '12:30' }, { start: '14:00', end: '18:00' }] },
        2: { name: 'Martes', enabled: true, slots: [{ start: '08:30', end: '12:30' }, { start: '14:00', end: '18:00' }] },
        3: { name: 'Miércoles', enabled: true, slots: [{ start: '08:30', end: '12:30' }, { start: '14:00', end: '18:00' }] },
        4: { name: 'Jueves', enabled: true, slots: [{ start: '08:30', end: '12:30' }, { start: '14:00', end: '18:00' }] },
        5: { name: 'Viernes', enabled: true, slots: [{ start: '08:30', end: '12:30' }, { start: '14:00', end: '18:00' }] },
        6: { name: 'Sábado', enabled: false, slots: [{ start: '09:00', end: '13:00' }] },
        0: { name: 'Domingo', enabled: false, slots: [] }
    },
    outOfHoursMessage: '🌙 *Fuera de horario*\n\nActualmente nuestros asesores no están disponibles.\nNuestro horario de atención es:\n{schedule_summary}\n\nEscribe *0* para volver al menú principal.',
    testMode: {
        enabled: false,
        bypassSchedule: true,
        testPhones: ['573184849332'],
        notifyOnlyTestAdvisors: false
    }
};

export const BOT_SCHEDULE = JSON.parse(JSON.stringify(DEFAULT_SCHEDULE));

/**
 * Genera un resumen legible en texto del horario configurado para mostrar a los clientes.
 * @param {object} [customSchedule] 
 * @returns {string} Resumen de horario (ej. "Lunes a viernes de 8:30am a 12:30pm y de 2:00pm a 6:00pm")
 */
export const formatScheduleSummary = (customSchedule = null) => {
    const sched = customSchedule || BOT_SCHEDULE;
    if (sched.mode === 'always_open') return 'Atención 24 horas al día, 7 días a la semana.';
    if (sched.mode === 'always_closed') return 'Actualmente cerrado por mantenimiento o descanso.';

    const days = sched.days || DEFAULT_SCHEDULE.days;
    const formatTime12h = (t) => {
        if (!t) return '';
        const [hStr, mStr] = t.split(':');
        const h = parseInt(hStr, 10);
        const m = parseInt(mStr || '0', 10);
        const ampm = h >= 12 ? 'pm' : 'am';
        const h12 = h % 12 || 12;
        return m === 0 ? `${h12}:00${ampm}` : `${h12}:${String(m).padStart(2, '0')}${ampm}`;
    };

    const formatDaySlots = (slots) => {
        if (!slots || slots.length === 0) return 'Cerrado';
        return slots.map(s => `${formatTime12h(s.start)} a ${formatTime12h(s.end)}`).join(' y de ');
    };

    // Verificar si Lunes a Viernes tienen exactamente el mismo horario
    const monFriSlots = JSON.stringify(days[1]?.slots || []);
    const isMonFriSame = [2, 3, 4, 5].every(d => days[d]?.enabled === days[1]?.enabled && JSON.stringify(days[d]?.slots || []) === monFriSlots);

    const parts = [];
    if (days[1]?.enabled && isMonFriSame) {
        parts.push(`Lunes a viernes de ${formatDaySlots(days[1].slots)}.`);
    } else {
        const dayKeys = [1, 2, 3, 4, 5];
        for (const k of dayKeys) {
            const d = days[k];
            if (d?.enabled && d.slots?.length > 0) {
                parts.push(`${d.name}: de ${formatDaySlots(d.slots)}.`);
            }
        }
    }

    if (days[6]?.enabled && days[6].slots?.length > 0) {
        parts.push(`Sábados de ${formatDaySlots(days[6].slots)}.`);
    }
    if (days[0]?.enabled && days[0].slots?.length > 0) {
        parts.push(`Domingos de ${formatDaySlots(days[0].slots)}.`);
    }

    if (parts.length === 0) return 'Sin horarios de atención activos.';
    return parts.join('\n');
};

/**
 * Obtiene el mensaje formateado de fuera de horario interpolando variables dinámicas.
 * @param {object} [customSchedule]
 * @param {object} [extraVariables]
 * @returns {string} Mensaje final para el cliente
 */
export const getOutOfHoursMessage = (customSchedule = null, extraVariables = {}) => {
    const sched = customSchedule || BOT_SCHEDULE;
    let template = sched.outOfHoursMessage || DEFAULT_SCHEDULE.outOfHoursMessage;
    const summary = formatScheduleSummary(sched);

    const vars = {
        schedule_summary: summary,
        botName: BOT_SETTINGS.botName || 'Cadi',
        adminPhone: (BOT_SETTINGS.adminSupportPhone || '573184849332').replace('@c.us', ''),
        ...extraVariables
    };

    for (const [k, v] of Object.entries(vars)) {
        template = template.replaceAll(`{${k}}`, v ?? '');
    }
    return template;
};

/**
 * Busca y retorna el nombre configurado del asesor a partir de su JID, teléfono o LID.
 * @param {string|object} fromOrCtx
 * @returns {string} Nombre del asesor o fallback limpio
 */
export const getAdvisorName = (fromOrCtx) => {
    if (!fromOrCtx) return 'Asesor';
    const raw = typeof fromOrCtx === 'string' ? fromOrCtx : (fromOrCtx.from || fromOrCtx.sender?.id || '');
    const cleanDigits = String(raw).split('@')[0].replace(/\D/g, '');

    if (!cleanDigits) return 'Asesor';

    for (const adv of BOT_ADVISORS) {
        const advPhone = String(adv.phone || '').replace(/\D/g, '');
        const advLid = String(adv.lid || '').replace(/\D/g, '');

        if (advLid && (advLid === cleanDigits || cleanDigits.includes(advLid) || advLid.includes(cleanDigits))) {
            return adv.name || 'Asesor';
        }
        if (advPhone) {
            if (advPhone === cleanDigits || cleanDigits.endsWith(advPhone) || advPhone.endsWith(cleanDigits)) {
                return adv.name || 'Asesor';
            }
            if (advPhone.length === 10 && cleanDigits === `57${advPhone}`) return adv.name || 'Asesor';
            if (advPhone.length === 12 && advPhone.startsWith('57') && cleanDigits === advPhone.substring(2)) return adv.name || 'Asesor';
        }
    }

    return cleanDigits.length <= 12 ? cleanDigits : 'Asesor';
};

// ==========================================
// NODOS PERSONALIZADOS DINÁMICOS
// ==========================================
export const BOT_CUSTOM_NODES = {};

// ==========================================
// HELPER PARA INTERPOLAR VARIABLES EN TEXTOS
// ==========================================
export const renderMessage = (templateKeyOrText, variables = {}) => {
    let text = BOT_MESSAGES[templateKeyOrText] || templateKeyOrText || '';
    const allVars = {
        botName: BOT_SETTINGS.botName || 'Cadi',
        adminPhone: (BOT_SETTINGS.adminSupportPhone || '573184849332').replace('@c.us', ''),
        ...variables
    };
    for (const [key, value] of Object.entries(allVars)) {
        text = text.replaceAll(`{${key}}`, value ?? '');
    }
    return text;
};

// ==========================================
// INICIALIZACIÓN Y SINCRONIZACIÓN CON FIRESTORE
// ==========================================
export const initBotConfig = async () => {
    console.log('🔄 Inicializando sincronización de configuración con Firestore...');

    // 1. Sincronizar Precios
    const pricesRef = doc(db, 'config', 'prices');
    try {
        const snap = await getDoc(pricesRef);
        if (!snap.exists()) {
            console.log('📝 Creando documento inicial de precios en Firestore...');
            await setDoc(pricesRef, BOT_PRICES);
        }
    } catch (err) {
        console.error('Error comprobando documento de precios:', err);
    }

    onSnapshot(pricesRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            // Limpiar claves antiguas y asignar las nuevas
            for (const key of Object.keys(BOT_PRICES)) {
                if (!(key in data)) delete BOT_PRICES[key];
            }
            Object.assign(BOT_PRICES, data);
            console.log('⚡ [SYNC] Precios y Categorías actualizados en tiempo real.');
        }
    }, (err) => {
        console.error('Error en listener de precios Firestore:', err);
    });

    // 2. Sincronizar Mensajes y Flujos
    const flowsRef = doc(db, 'config', 'bot_flows');
    try {
        const snap = await getDoc(flowsRef);
        if (!snap.exists()) {
            console.log('📝 Creando documento inicial de mensajes/flujos en Firestore...');
            await setDoc(flowsRef, BOT_MESSAGES);
        }
    } catch (err) {
        console.error('Error comprobando documento de mensajes:', err);
    }

    onSnapshot(flowsRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            Object.assign(BOT_MESSAGES, data);
            console.log('⚡ [SYNC] Mensajes/Flujos actualizados en tiempo real.');
        }
    }, (err) => {
        console.error('Error en listener de mensajes Firestore:', err);
    });

    // 3. Sincronizar Multimedia y Stickers
    const mediaRef = doc(db, 'config', 'media');
    try {
        const snap = await getDoc(mediaRef);
        if (!snap.exists()) {
            console.log('📝 Creando documento inicial de multimedia en Firestore...');
            await setDoc(mediaRef, BOT_MEDIA);
        }
    } catch (err) {
        console.error('Error comprobando documento de multimedia:', err);
    }

    onSnapshot(mediaRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            Object.assign(BOT_MEDIA, data);
            console.log('⚡ [SYNC] Multimedia y Stickers actualizados en tiempo real.');
        }
    }, (err) => {
        console.error('Error en listener de multimedia Firestore:', err);
    });

    // 4. Sincronizar Configuración General y Enrutamiento
    const settingsRef = doc(db, 'config', 'general');
    try {
        const snap = await getDoc(settingsRef);
        if (!snap.exists()) {
            console.log('📝 Creando documento inicial de configuración general en Firestore...');
            await setDoc(settingsRef, BOT_SETTINGS);
        }
    } catch (err) {
        console.error('Error comprobando documento de configuración general:', err);
    }

    onSnapshot(settingsRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            Object.assign(BOT_SETTINGS, data);
            console.log('⚡ [SYNC] Configuración general y Enrutamiento actualizados en tiempo real.');
        }
    }, (err) => {
        console.error('Error en listener de configuración general Firestore:', err);
    });

    // 5. Sincronizar Nodos Personalizados del Flow Graph
    const customNodesRef = doc(db, 'config', 'custom_nodes');
    onSnapshot(customNodesRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            for (const key of Object.keys(BOT_CUSTOM_NODES)) {
                if (!(key in data)) delete BOT_CUSTOM_NODES[key];
            }
            Object.assign(BOT_CUSTOM_NODES, data);
            console.log(`⚡ [SYNC] Nodos personalizados del Flow Graph actualizados (${Object.keys(data).length} activos).`);
        }
    }, (err) => {
        console.error('Error en listener de custom_nodes Firestore:', err);
    });

    // 6. Sincronizar Asesores y Permisos Dinámicos
    const advisorsRef = doc(db, 'config', 'advisors');

    const applyAdvisorsAndScheduleData = (data) => {
        if (!data) return;
        const rawList = Array.isArray(data?.advisors) ? data.advisors : (Array.isArray(data?.list) ? data.list : []);
        const normalizedList = rawList.map(a => {
            const isAdminRole = (a.role === 'admin');
            return {
                ...a,
                canManageSupport: a.canManageSupport !== undefined ? !!a.canManageSupport : true,
                canBroadcast: a.canBroadcast !== undefined ? !!a.canBroadcast : isAdminRole
            };
        });
        BOT_ADVISORS.length = 0;
        BOT_ADVISORS.push(...normalizedList);

        // Recomputar teléfonos de soporte y comandos activos para compatibilidad total
        const activeSupport = rawList
            .filter(a => a.active !== false && a.receiveSupport !== false && a.phone)
            .map(a => {
                let p = String(a.phone).replace(/\D/g, '');
                if (p.length === 10) p = '57' + p;
                return `${p}@c.us`;
            });

        const activeEscapes = rawList
            .filter(a => a.active !== false && a.canExecuteCommands !== false)
            .flatMap(a => {
                let p = String(a.phone || '').replace(/\D/g, '');
                const l = String(a.lid || '').replace(/\D/g, '');
                const res = [];
                if (p) {
                    res.push(p);
                    if (p.length === 10) res.push('57' + p);
                    if (p.length === 12 && p.startsWith('57')) res.push(p.substring(2));
                }
                if (l) res.push(l);
                return res;
            })
            .filter(Boolean);

        if (activeSupport.length > 0) {
            BOT_SETTINGS.adminSupportPhone = activeSupport.join(', ');
        }
        if (activeEscapes.length > 0) {
            BOT_SETTINGS.adminEscapes = Array.from(new Set([...(BOT_SETTINGS.adminEscapes || []), ...activeEscapes]));
        }

        // Sincronizar Horario de Atención y Modo de Prueba de Asesores
        if (data?.schedule) {
            Object.assign(BOT_SCHEDULE, {
                ...DEFAULT_SCHEDULE,
                ...data.schedule,
                days: {
                    ...DEFAULT_SCHEDULE.days,
                    ...(data.schedule.days || {})
                },
                testMode: {
                    ...DEFAULT_SCHEDULE.testMode,
                    ...(data.schedule.testMode || {})
                }
            });
            console.log(`⚡ [SYNC] Horarios de atención actualizados (Modo: ${BOT_SCHEDULE.mode}, TestMode: ${BOT_SCHEDULE.testMode?.enabled ? 'ACTIVO' : 'INACTIVO'}).`);
        }

        console.log(`⚡ [SYNC] Asesores actualizados (${rawList.length} registrados, ${activeSupport.length} activos en soporte).`);
    };

    try {
        const snap = await getDoc(advisorsRef);
        if (!snap.exists()) {
            console.log('📝 Creando documento inicial de asesores en Firestore...');
            await setDoc(advisorsRef, { advisors: BOT_ADVISORS, list: BOT_ADVISORS, updatedAt: new Date().toISOString() }, { merge: true });
        } else {
            // Aplicar de forma síncrona en el arranque inicial
            applyAdvisorsAndScheduleData(snap.data());
        }
    } catch (err) {
        console.error('Error comprobando documento de asesores:', err);
    }

    onSnapshot(advisorsRef, (snapshot) => {
        if (snapshot.exists()) {
            applyAdvisorsAndScheduleData(snapshot.data());
        }
    }, (err) => {
        console.error('Error en listener de asesores Firestore:', err);
    });
};
