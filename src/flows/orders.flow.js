import { addKeyword, EVENTS } from '@builderbot/bot';
import { saveUser } from '../firebase.js';
import { isAdmin, validateContactUser } from '../utils/helpers.js';
import { flowAdminBridge, flowAdminBridgeLoop } from './admin.flow.js';
import { flowCancelar, flowInactividad } from './main.flow.js';
import { flowRecibirArchivos } from './files.flow.js';

// ==========================================
// FLUJOS DE REGISTRO E INICIALIZACIÓN DE PEDIDOS
// ==========================================

export const flowPedirTelefono = addKeyword(EVENTS.ACTION)
    .addAnswer('📱 Debido a las nuevas políticas de privacidad, tu número está oculto. Por favor, escribe tu *número de teléfono o usuario (@)* para contactarte sobre el pedido:', { capture: true, delay: 1500, idle: 600000 }, async (ctx, { state, gotoFlow, fallBack }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        if (ctx.body.trim() === '0') return gotoFlow(flowCancelar);
        const contactUser = ctx.body.trim();
        
        const errorMsg = validateContactUser(contactUser);
        if (errorMsg) {
            return fallBack(errorMsg);
        }

        await state.update({ telefono: contactUser, contactUser: contactUser });
        
        // Guardar en Firebase para futuras ocasiones
        const phone = ctx.from.split('@')[0];
        const name = state.getMyState()?.nombrePedido || state.getMyState()?.userName || '';
        await saveUser(phone, { name, contactUser });
        
        return gotoFlow(flowRecibirArchivos);
    });

export const flowPedirNombre = addKeyword(EVENTS.ACTION)
    .addAnswer('👤 Escribe tu *Nombre Completo* para registrar el pedido:', { capture: true, delay: 1500, idle: 600000 }, async (ctx, { state, gotoFlow }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        if (ctx.body.trim() === '0') return gotoFlow(flowCancelar);
        await state.update({ nombrePedido: ctx.body.trim(), userName: ctx.body.trim() });
        return gotoFlow(flowPedirTelefono);
    });

export const flowInicializarPedido = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, gotoFlow }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        await state.update({ archivos: [] });
        const stateData = state.getMyState() || {};
        const userName = stateData.userName;
        const contactUser = stateData.contactUser;
        
        if (userName && contactUser) {
            await state.update({ nombrePedido: userName, telefono: contactUser });
            return gotoFlow(flowRecibirArchivos);
        } else if (userName && !contactUser) {
            await state.update({ nombrePedido: userName });
            return gotoFlow(flowPedirTelefono);
        } else {
            return gotoFlow(flowPedirNombre);
        }
    });
