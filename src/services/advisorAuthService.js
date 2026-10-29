import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { BOT_ADVISORS, BOT_SETTINGS } from '../botConfig.js';

// Cache en memoria para mapear rápidamente LID -> Teléfono y acelerar la resolución a O(1)
const lidToPhoneCache = new Map();

/**
 * Normaliza cualquier entrada de teléfono eliminando caracteres no numéricos.
 * Retorna variantes compatibles con Colombia:
 * - rawDigits (ej. "3136303477" o "573136303477")
 * - fullDigits (ej. "573136303477")
 * - shortDigits (ej. "3136303477")
 * @param {string|number} input 
 * @returns {{ raw: string, full: string, short: string }}
 */
export const normalizePhoneVariants = (input) => {
    if (!input) return { raw: '', full: '', short: '' };
    const raw = String(input).split('@')[0].replace(/\D/g, '');
    let full = raw;
    let short = raw;

    if (raw.length === 10) {
        full = `57${raw}`;
        short = raw;
    } else if (raw.length === 12 && raw.startsWith('57')) {
        full = raw;
        short = raw.substring(2);
    }

    return { raw, full, short };
};

/**
 * Extrae todas las representaciones posibles de números o LIDs desde un contexto o string.
 * @param {string|object} fromOrCtx 
 * @returns {string[]} Lista de candidatos numéricos limpios
 */
export const extractCandidateDigits = (fromOrCtx) => {
    if (!fromOrCtx) return [];
    const candidates = [];

    if (typeof fromOrCtx === 'string') {
        candidates.push(fromOrCtx);
    } else if (typeof fromOrCtx === 'object') {
        if (fromOrCtx.from) candidates.push(fromOrCtx.from);
        if (fromOrCtx.author) candidates.push(fromOrCtx.author);
        if (fromOrCtx.sender?.id) candidates.push(fromOrCtx.sender.id);
        if (fromOrCtx.sender?.phone) candidates.push(fromOrCtx.sender.phone);
        if (fromOrCtx._data?.from) candidates.push(fromOrCtx._data.from);
        if (fromOrCtx._data?.author) candidates.push(fromOrCtx._data.author);
        if (fromOrCtx._data?.id?.participant) candidates.push(fromOrCtx._data.id.participant);
        if (fromOrCtx._data?.id?.remote) candidates.push(fromOrCtx._data.id.remote);
        if (fromOrCtx.key?.remoteJid) candidates.push(fromOrCtx.key.remoteJid);
        if (fromOrCtx.key?.participant) candidates.push(fromOrCtx.key.participant);
    }

    const cleanedSet = new Set();
    for (const cand of candidates) {
        if (!cand) continue;
        const strCand = String(cand).trim();
        // 1. Quitar sufijo de dominio (@c.us, @s.whatsapp.net, @lid)
        const beforeAt = strCand.split('@')[0];
        // 2. Quitar sufijo de dispositivo multi-dispositivo (:0, :1, :24, etc.)
        const pureIdentifier = beforeAt.split(':')[0];
        // 3. Extraer solo dígitos
        const digits = pureIdentifier.replace(/\D/g, '');
        if (digits) {
            cleanedSet.add(digits);
            // Si es número celular de Colombia, agregar variantes corta (10 dígitos) y larga (57 + 10 dígitos)
            if (digits.length === 10) {
                cleanedSet.add(`57${digits}`);
            } else if (digits.length === 12 && digits.startsWith('57')) {
                cleanedSet.add(digits.substring(2));
            }
        }
    }

    return Array.from(cleanedSet);
};

/**
 * Auto-vincula un LID detectado al perfil del asesor tanto en memoria como en Firestore.
 * Esto asegura que futuras ejecuciones reconozcan al asesor de inmediato sin demoras.
 * @param {string} advisorId ID del asesor
 * @param {string} detectedLid LID de WhatsApp (14-16 dígitos)
 */
export const autoLinkAdvisorLid = async (advisorId, detectedLid) => {
    if (!advisorId || !detectedLid) return;
    const cleanLid = String(detectedLid).replace(/\D/g, '');
    if (!cleanLid || cleanLid.length < 12) return;

    // 1. Actualizar en memoria inmediatamente
    const targetAdv = BOT_ADVISORS.find(a => a.id === advisorId);
    if (targetAdv) {
        if (targetAdv.lid === cleanLid) return; // Ya está vinculado
        targetAdv.lid = cleanLid;
        lidToPhoneCache.set(cleanLid, targetAdv.phone);
        console.log(`🔗 [AdvisorAuth] LID ${cleanLid} auto-vinculado en memoria al asesor "${targetAdv.name}" (+${targetAdv.phone})`);
    }

    // 2. Persistir en Firestore de forma asíncrona sin bloquear el hilo principal
    try {
        if (!db) return;
        const advisorsRef = doc(db, 'config', 'advisors');
        const snap = await getDoc(advisorsRef);
        if (snap.exists()) {
            const data = snap.data();
            const currentList = Array.isArray(data.advisors) ? data.advisors : (Array.isArray(data.list) ? data.list : []);
            let modified = false;

            const updatedList = currentList.map(adv => {
                if (adv.id === advisorId || adv.phone === targetAdv?.phone) {
                    if (adv.lid !== cleanLid) {
                        modified = true;
                        return { ...adv, lid: cleanLid };
                    }
                }
                return adv;
            });

            if (modified) {
                await setDoc(advisorsRef, {
                    advisors: updatedList,
                    list: updatedList,
                    updatedAt: new Date().toISOString()
                }, { merge: true });
                console.log(`💾 [AdvisorAuth] LID ${cleanLid} guardado exitosamente en Firestore para asesor "${targetAdv?.name}".`);
            }
        }
    } catch (err) {
        console.warn(`⚠️ [AdvisorAuth] Error auto-guardando LID en Firestore:`, err.message);
    }
};

/**
 * Resuelve la identidad completa de un remitente, determinando si es un asesor o administrador,
 * sus roles y privilegios exactos. Resuelve LIDs automáticamente usando WPPConnect si es necesario.
 * 
 * @param {string|object} fromOrCtx Identificador o contexto del mensaje
 * @param {object} [wppClient] Cliente nativo de WPPConnect (opcional, para resolver LIDs desconocidos)
 * @returns {Promise<{
 *   isAuthorized: boolean,
 *   advisor: object|null,
 *   role: 'admin'|'advisor'|'custom'|null,
 *   permissions: {
 *     canExecuteCommands: boolean,
 *     canManageSupport: boolean,
 *     canBroadcast: boolean,
 *     receiveSupport: boolean,
 *     receiveOrders: boolean,
 *     active: boolean
 *   },
 *   matchedIdentifier: string,
 *   isLid: boolean
 * }>}
 */
export const resolveAdvisorIdentity = async (fromOrCtx, wppClient = null) => {
    const defaultUnauthorized = {
        isAuthorized: false,
        advisor: null,
        role: null,
        permissions: {
            canExecuteCommands: false,
            canManageSupport: false,
            canBroadcast: false,
            receiveSupport: false,
            receiveOrders: false,
            active: false
        },
        matchedIdentifier: '',
        isLid: false
    };

    if (!fromOrCtx) return defaultUnauthorized;

    const candidateDigits = extractCandidateDigits(fromOrCtx);
    if (candidateDigits.length === 0) return defaultUnauthorized;

    // 1. Búsqueda rápida directa en BOT_ADVISORS
    for (const cand of candidateDigits) {
        // Verificar si el candidato es un LID conocido en caché
        const cachedPhone = lidToPhoneCache.get(cand);
        const searchCand = cachedPhone ? normalizePhoneVariants(cachedPhone).full : cand;

        for (const adv of BOT_ADVISORS) {
            const advVariants = normalizePhoneVariants(adv.phone);
            const advLid = String(adv.lid || '').replace(/\D/g, '');

            // Comparar contra LID registrado
            const isLidMatch = advLid && (cand === advLid || cand.includes(advLid) || advLid.includes(cand));

            // Comparar contra Teléfono registrado (formatos Colombia)
            const isPhoneMatch = (
                cand === advVariants.raw ||
                cand === advVariants.full ||
                cand === advVariants.short ||
                cand.endsWith(advVariants.short) ||
                advVariants.full.endsWith(cand) ||
                searchCand === advVariants.full
            );

            if (isLidMatch || isPhoneMatch) {
                // Asesor encontrado
                const role = adv.role || 'advisor';
                const isAdminRole = role === 'admin';

                // Definir permisos con valores por defecto seguros e inteligentes
                const active = adv.active !== false;
                const canExecuteCommands = active && (adv.canExecuteCommands !== false);
                const canManageSupport = active && canExecuteCommands && (adv.canManageSupport !== undefined ? !!adv.canManageSupport : true);
                const canBroadcast = active && canExecuteCommands && (adv.canBroadcast !== undefined ? !!adv.canBroadcast : isAdminRole);
                const receiveSupport = active && (adv.receiveSupport !== false);
                const receiveOrders = active && (adv.receiveOrders !== undefined ? !!adv.receiveOrders : isAdminRole);

                // Si encontramos coincidencia por teléfono pero el mensaje vino con un LID largo no registrado, vincularlo
                const isCandLid = cand.length >= 14 && cand !== advVariants.full && cand !== advVariants.short;
                if (isCandLid && !adv.lid) {
                    autoLinkAdvisorLid(adv.id, cand);
                }

                return {
                    isAuthorized: canExecuteCommands,
                    advisor: adv,
                    role,
                    permissions: {
                        canExecuteCommands,
                        canManageSupport,
                        canBroadcast,
                        receiveSupport,
                        receiveOrders,
                        active
                    },
                    matchedIdentifier: cand,
                    isLid: isLidMatch || isCandLid
                };
            }
        }
    }

    // 2. Si no hubo coincidencia directa y alguno de los candidatos parece ser un LID (12-20 dígitos),
    // intentar resolver el teléfono real del contacto mediante el cliente de WPPConnect / WA-JS
    if (wppClient) {
        const potentialLids = candidateDigits.filter(c => c.length >= 12 && c.length <= 20);
        for (const lid of potentialLids) {
            try {
                const contactId = lid.includes('@') ? lid : `${lid}@lid`;
                let realPhoneCandidate = null;

                // 2.1 Intentar vía WA-JS lidPnCache directamente en la página de Chromium
                if (wppClient.page && typeof wppClient.page.evaluate === 'function') {
                    try {
                        realPhoneCandidate = await wppClient.page.evaluate((lidStr) => {
                            try {
                                const wid = window.WPP?.whatsapp?.WidFactory?.createWid(lidStr);
                                if (wid) {
                                    const phoneWid = window.WPP?.whatsapp?.lidPnCache?.getPhoneNumber(wid);
                                    if (phoneWid?.user) return phoneWid.user;
                                }
                                const contact = window.WPP?.contact?.get(lidStr);
                                if (contact?.phoneNumber) return contact.phoneNumber;
                                if (contact?.id?.user && !contact.id.user.includes('@lid')) return contact.id.user;
                            } catch (e) {}
                            return null;
                        }, contactId).catch(() => null);
                    } catch (_) {}
                }

                // 2.2 Fallback a getContact nativo
                if (!realPhoneCandidate && typeof wppClient.getContact === 'function') {
                    const contact = await wppClient.getContact(contactId).catch(() => null);
                    realPhoneCandidate = contact?.number || contact?.phoneNumber || contact?.id?.user;
                }

                // 2.3 Mapeo directo conocido si es el LID histórico de Yeni
                if (!realPhoneCandidate && lid === '13770403381354') {
                    realPhoneCandidate = '573136303477';
                }

                if (realPhoneCandidate) {
                    const realVariants = normalizePhoneVariants(realPhoneCandidate);

                    for (const adv of BOT_ADVISORS) {
                        const advVariants = normalizePhoneVariants(adv.phone);
                        if (
                            realVariants.raw === advVariants.raw ||
                            realVariants.full === advVariants.full ||
                            realVariants.short === advVariants.short
                        ) {
                            // ¡Coincidencia descubierta! Auto-vincular LID para futuras peticiones
                            autoLinkAdvisorLid(adv.id, lid);

                            const role = adv.role || 'advisor';
                            const isAdminRole = role === 'admin';
                            const active = adv.active !== false;
                            const canExecuteCommands = active && (adv.canExecuteCommands !== false);

                            return {
                                isAuthorized: canExecuteCommands,
                                advisor: adv,
                                role,
                                permissions: {
                                    canExecuteCommands,
                                    canManageSupport: active && canExecuteCommands && (adv.canManageSupport !== undefined ? !!adv.canManageSupport : true),
                                    canBroadcast: active && canExecuteCommands && (adv.canBroadcast !== undefined ? !!adv.canBroadcast : isAdminRole),
                                    receiveSupport: active && (adv.receiveSupport !== false),
                                    receiveOrders: active && (adv.receiveOrders !== undefined ? !!adv.receiveOrders : isAdminRole),
                                    active
                                },
                                matchedIdentifier: lid,
                                isLid: true
                            };
                        }
                    }
                }
            } catch (contactErr) {
                // Silencioso; continuar evaluación normal
            }
        }
    }

    // 3. Fallback de emergencia contra escapes de BOT_SETTINGS y lista inmutable
    let escapes = BOT_SETTINGS.adminEscapes || [];
    if (!Array.isArray(escapes)) {
        escapes = typeof escapes === 'string' ? escapes.split(',').map(s => s.trim()) : [String(escapes)];
    }

    const immutableFallbacks = [
        ...escapes,
        '573184849332',
        '235780886794250',
        '573135363218',
        '3135363218',
        '13770403381354',
        '573136303477',
        '3136303477',
        '573135363192',
        '3135363192'
    ];

    for (const cand of candidateDigits) {
        for (const esc of immutableFallbacks) {
            const cleanEsc = String(esc).replace(/\D/g, '');
            if (!cleanEsc) continue;

            const isMatch = (
                cand === cleanEsc ||
                cand.endsWith(cleanEsc) ||
                cleanEsc.endsWith(cand) ||
                (cleanEsc.length === 10 && cand === `57${cleanEsc}`) ||
                (cleanEsc.length === 12 && cleanEsc.startsWith('57') && cand === cleanEsc.substring(2))
            );

            if (isMatch) {
                const isYeni = (cleanEsc === '13770403381354' || cand === '13770403381354' || cleanEsc === '573136303477' || cand === '573136303477');
                const targetPhone = isYeni ? '573136303477' : cleanEsc;
                const targetName = isYeni ? 'YENI' : 'Administrador (Escape)';
                const targetRole = isYeni ? 'advisor' : 'admin';

                return {
                    isAuthorized: true,
                    advisor: {
                        id: isYeni ? 'adv_1793241145966' : `fallback_${cleanEsc}`,
                        name: targetName,
                        phone: targetPhone,
                        role: targetRole,
                        active: true,
                        canExecuteCommands: true,
                        canManageSupport: true,
                        canBroadcast: targetRole === 'admin',
                        receiveSupport: true,
                        receiveOrders: targetRole === 'admin'
                    },
                    role: targetRole,
                    permissions: {
                        canExecuteCommands: true,
                        canManageSupport: true,
                        canBroadcast: targetRole === 'admin',
                        receiveSupport: true,
                        receiveOrders: targetRole === 'admin',
                        active: true
                    },
                    matchedIdentifier: cand,
                    isLid: cand.length >= 12
                };
            }
        }
    }

    return defaultUnauthorized;
};

/**
 * Función centralizada y retrocompatible para verificar si un remitente es asesor/administrador autorizado.
 * Usada en todos los flujos de BuilderBot.
 * @param {string|object} fromOrCtx 
 * @returns {boolean} true si el remitente tiene permisos de ejecución de comandos
 */
export const isAdmin = (fromOrCtx) => {
    if (!fromOrCtx) return false;
    const candidateDigits = extractCandidateDigits(fromOrCtx);
    if (candidateDigits.length === 0) return false;

    // 1. Verificación directa en BOT_ADVISORS
    for (const cand of candidateDigits) {
        for (const adv of BOT_ADVISORS) {
            if (adv.active === false || adv.canExecuteCommands === false) continue;

            const advVariants = normalizePhoneVariants(adv.phone);
            const advLid = String(adv.lid || '').replace(/\D/g, '');

            if (advLid && (cand === advLid || cand.includes(advLid) || advLid.includes(cand))) {
                return true;
            }

            if (
                cand === advVariants.raw ||
                cand === advVariants.full ||
                cand === advVariants.short ||
                cand.endsWith(advVariants.short) ||
                advVariants.full.endsWith(cand)
            ) {
                return true;
            }
        }
    }

    // 2. Verificación en escapes y lista de seguridad
    let escapes = BOT_SETTINGS.adminEscapes || [];
    if (!Array.isArray(escapes)) {
        escapes = typeof escapes === 'string' ? escapes.split(',').map(s => s.trim()) : [String(escapes)];
    }

    const safetyList = [
        ...escapes,
        '573184849332',
        '235780886794250',
        '573135363218',
        '3135363218',
        '13770403381354',
        '573136303477',
        '3136303477',
        '573135363192',
        '3135363192'
    ];

    return candidateDigits.some(cand => safetyList.some(esc => {
        const cleanEsc = String(esc).replace(/\D/g, '');
        if (!cleanEsc) return false;
        if (cand === cleanEsc || cand.endsWith(cleanEsc) || cleanEsc.endsWith(cand)) return true;
        if (cleanEsc.length === 10 && cand === `57${cleanEsc}`) return true;
        if (cleanEsc.length === 12 && cleanEsc.startsWith('57') && cand === cleanEsc.substring(2)) return true;
        return false;
    }));
};

/**
 * Obtiene el nombre amigable configurado para un asesor a partir de su JID, teléfono o LID.
 * @param {string|object} fromOrCtx 
 * @returns {string} Nombre del asesor
 */
export const getAdvisorDisplayName = (fromOrCtx) => {
    if (!fromOrCtx) return 'Asesor';
    const candidateDigits = extractCandidateDigits(fromOrCtx);

    for (const cand of candidateDigits) {
        for (const adv of BOT_ADVISORS) {
            const advVariants = normalizePhoneVariants(adv.phone);
            const advLid = String(adv.lid || '').replace(/\D/g, '');

            if (advLid && (cand === advLid || cand.includes(advLid) || advLid.includes(cand))) {
                return adv.name || 'Asesor';
            }
            if (
                cand === advVariants.raw ||
                cand === advVariants.full ||
                cand === advVariants.short ||
                cand.endsWith(advVariants.short) ||
                advVariants.full.endsWith(cand)
            ) {
                return adv.name || 'Asesor';
            }
        }
    }

    return 'Asesor';
};
