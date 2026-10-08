import { addKeyword, EVENTS } from '@builderbot/bot';
import { PRICES } from '../prices.js';
import { isAdmin } from '../utils/helpers.js';
import { flowAdminBridge, flowAdminBridgeLoop } from './admin.flow.js';
import { flowCancelar, flowInactividad } from './main.flow.js';
import { flowInicializarPedido } from './orders.flow.js';

// ==========================================
// FLUJOS DE PRODUCTOS Y SERVICIOS
// ==========================================

// 1. Carteleras
export const flowCarteleraMaterial = addKeyword(EVENTS.ACTION)
    .addAnswer(['🎨 *Material de la Cartelera*', '*1.* Bond', '*2.* Cartulina / Opalina', '', '🛑 *0.* Cancelar y volver al menú principal'].join('\n'), { capture: true, delay: 1000, idle: 600000 }, async (ctx, { state, gotoFlow, fallBack }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        if (ctx.body.trim() === '0') return gotoFlow(flowCancelar);
        
        const op = ctx.body.trim();
        const data = state.getMyState();
        const size = data.tempSize;
        const dims = { 'A0': '100x70 cm', 'A1': '70x50 cm', 'A2': '50x35 cm', 'A3': '42x30 cm' };
        const dimStr = dims[size] || '';
        
        if (op === '1') {
            await state.update({ itemName: `Cartelera ${size} ${dimStr} (Bond)`, basePrice: PRICES.carteleras[size] });
        } else if (op === '2') {
            await state.update({ itemName: `Cartelera ${size} ${dimStr} (Cartulina/Opalina)`, basePrice: PRICES.carteleras_cartulina[size] });
        } else {
            return fallBack('❌ Opción inválida. Responde 1, 2 o 0 para cancelar.');
        }
        
        return gotoFlow(flowInicializarPedido);
    });

export const flowMenuCarteleras = addKeyword(EVENTS.ACTION)
    .addAnswer(['📏 *Tamaño de Cartelera*', '*1.* A0 (Pliego 100x70 cm)', '*2.* A1 (Medio Pliego 70x50 cm)', '*3.* A2 (Cuarto Pliego 50x35 cm)', '*4.* A3 (Tabloide 42x30 cm)', '', '🛑 *0.* Cancelar y volver al menú principal'].join('\n'), { capture: true, delay: 1000, idle: 600000 }, async (ctx, { state, gotoFlow, fallBack }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        if (ctx.body.trim() === '0') return gotoFlow(flowCancelar);
        const sizes = {'1': 'A0', '2': 'A1', '3': 'A2', '4': 'A3'};
        const sel = sizes[ctx.body.trim()];
        if (!sel) return fallBack('❌ Opción inválida. Responde 1, 2, 3, 4 o 0 para cancelar.');
        await state.update({ tempSize: sel });
        return gotoFlow(flowCarteleraMaterial);
    });

// 2. Planos CAD
export const flowPlanosColor = addKeyword(EVENTS.ACTION)
    .addAnswer(['🎨 *Tipo de Color para Planos*', '*1.* Solo Líneas (Baja carga de tinta)', '*2.* Plenos / Renders (Alta carga de tinta)', '', '🛑 *0.* Cancelar y volver al menú principal'].join('\n'), { capture: true, delay: 1000, idle: 600000 }, async (ctx, { state, gotoFlow, fallBack }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        if (ctx.body.trim() === '0') return gotoFlow(flowCancelar);
        const op = ctx.body.trim();
        const data = state.getMyState();
        if (op === '1') {
            await state.update({ itemName: `Plano CAD ${data.tempSize} Color Líneas`, basePrice: PRICES.planos_color_lineas[data.tempSize] });
        } else if (op === '2') {
            await state.update({ itemName: `Plano CAD ${data.tempSize} Color Plenos`, basePrice: PRICES.planos_color_plenos[data.tempSize] });
        } else return fallBack('❌ Opción inválida. Responde 1, 2 o 0 para cancelar.');
        return gotoFlow(flowInicializarPedido);
    });

export const flowPlanosTipo = addKeyword(EVENTS.ACTION)
    .addAnswer(['🎨 *Color o B/N*', '*1.* Blanco y Negro', '*2.* A Color', '', '🛑 *0.* Cancelar y volver al menú principal'].join('\n'), { capture: true, delay: 1000, idle: 600000 }, async (ctx, { state, gotoFlow, fallBack }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        if (ctx.body.trim() === '0') return gotoFlow(flowCancelar);
        const op = ctx.body.trim();
        const data = state.getMyState();
        if (op === '1') {
            await state.update({ itemName: `Plano CAD ${data.tempSize} B/N`, basePrice: PRICES.planos_bn[data.tempSize] });
            return gotoFlow(flowInicializarPedido);
        } else if (op === '2') {
            return gotoFlow(flowPlanosColor);
        }
        return fallBack('❌ Opción inválida. Responde 1, 2 o 0 para cancelar.');
    });

export const flowMenuPlanos = addKeyword(EVENTS.ACTION)
    .addAnswer(['📏 *Tamaño de Plano*', '*1.* A0 (Pliego 100x70 cm)', '*2.* A1 (Medio Pliego 70x50 cm)', '*3.* A2 (Cuarto Pliego 50x35 cm)', '*4.* A3 (Tabloide 42x30 cm)', '*5.* Carta (21.5x28 cm)', '*6.* Oficio (21.5x33 cm)', '', '🛑 *0.* Cancelar y volver al menú principal'].join('\n'), { capture: true, delay: 1000, idle: 600000 }, async (ctx, { state, gotoFlow, fallBack }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        if (ctx.body.trim() === '0') return gotoFlow(flowCancelar);
        const sizes = {'1': 'A0', '2': 'A1', '3': 'A2', '4': 'A3', '5': 'Carta', '6': 'Oficio'};
        const sel = sizes[ctx.body.trim()];
        if (!sel) return fallBack('❌ Opción inválida. Responde del 1 al 6, o 0 para cancelar.');
        await state.update({ tempSize: sel });
        return gotoFlow(flowPlanosTipo);
    });

// 3. Documentos y Fotos
export const flowMenuFotos = addKeyword(EVENTS.ACTION)
    .addAnswer(['📸 *Tamaño de Fotografía (Brillante/Mate)*', '*1.* 10x15 cm', '*2.* A4 / Carta (21.5x28 cm)', '', '🛑 *0.* Cancelar y volver al menú principal'].join('\n'), { capture: true, delay: 1000, idle: 600000 }, async (ctx, { state, gotoFlow, fallBack }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        if (ctx.body.trim() === '0') return gotoFlow(flowCancelar);
        const sizes = {'1': '10x15', '2': 'Carta'};
        const sel = sizes[ctx.body.trim()];
        if (!sel) return fallBack('❌ Opción inválida. Responde 1, 2 o 0 para cancelar.');
        await state.update({ itemName: `Fotografía ${sel}`, basePrice: PRICES.fotos[sel] });
        return gotoFlow(flowInicializarPedido);
    });

export const flowDocColor = addKeyword(EVENTS.ACTION)
    .addAnswer(['🎨 *Color o B/N*', '*1.* Blanco y Negro', '*2.* A Color', '', '🛑 *0.* Cancelar y volver al menú principal'].join('\n'), { capture: true, delay: 1000, idle: 600000 }, async (ctx, { state, gotoFlow, fallBack }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        const op = ctx.body.trim();
        if (op === '0') return gotoFlow(flowCancelar);
        if (op !== '1' && op !== '2') return fallBack('❌ Opción inválida. Responde 1, 2 o 0 para cancelar.');
        const data = state.getMyState();
        const colorPrefix = op === '1' ? 'bn_' : 'color_';
        const cat = colorPrefix + data.tempMaterial;
        const price = PRICES.documentos[cat][data.tempSize];
        
        await state.update({ itemName: `Documento ${data.tempSize} ${data.tempMaterial} ${op === '1' ? 'B/N' : 'Color'}`, basePrice: price });
        return gotoFlow(flowInicializarPedido);
    });

export const flowDocMaterial = addKeyword(EVENTS.ACTION)
    .addAnswer(['📄 *Material*', '*1.* Bond (Normal)', '*2.* Propalcote', '*3.* Opalina', '', '🛑 *0.* Cancelar y volver al menú principal'].join('\n'), { capture: true, delay: 1000, idle: 600000 }, async (ctx, { state, gotoFlow, fallBack }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        if (ctx.body.trim() === '0') return gotoFlow(flowCancelar);
        const mats = {'1': 'bond', '2': 'propalcote', '3': 'opalina'};
        const sel = mats[ctx.body.trim()];
        if (!sel) return fallBack('❌ Opción inválida. Responde 1, 2, 3 o 0 para cancelar.');
        await state.update({ tempMaterial: sel });
        return gotoFlow(flowDocColor);
    });

export const flowDocTamano = addKeyword(EVENTS.ACTION)
    .addAnswer(['📏 *Tamaño del Documento*', '*1.* Carta (21.5x28 cm)', '*2.* Oficio (21.5x33 cm)', '*3.* Tabloide (42x30 cm)', '', '🛑 *0.* Cancelar y volver al menú principal'].join('\n'), { capture: true, delay: 1000, idle: 600000 }, async (ctx, { state, gotoFlow, fallBack }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        if (ctx.body.trim() === '0') return gotoFlow(flowCancelar);
        const sizes = {'1': 'Carta', '2': 'Oficio', '3': 'Tabloide'};
        const sel = sizes[ctx.body.trim()];
        if (!sel) return fallBack('❌ Opción inválida. Responde 1, 2, 3 o 0 para cancelar.');
        await state.update({ tempSize: sel });
        return gotoFlow(flowDocMaterial);
    });

export const flowMenuDocFotos = addKeyword(EVENTS.ACTION)
    .addAnswer(['📄 *Documentos y Fotos*', '*1.* Impresión de Documentos', '*2.* Impresión de Fotografías', '', '🛑 *0.* Cancelar y volver al menú principal'].join('\n'), { capture: true, delay: 1000, idle: 600000 }, async (ctx, { gotoFlow, fallBack }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        const op = ctx.body.trim();
        if (op === '0') return gotoFlow(flowCancelar);
        if (op === '1') return gotoFlow(flowDocTamano);
        else if (op === '2') return gotoFlow(flowMenuFotos);
        return fallBack('❌ Opción inválida. Responde 1, 2 o 0 para cancelar.');
    });

// 4. Gran Formato
export const flowMenuGranFormatoTamano = addKeyword(EVENTS.ACTION)
    .addAnswer(['📏 *Tamaño*', '*1.* 100x70 cm', '*2.* 70x50 cm', '*3.* 200x100 cm', '*4.* 80x120 cm', '*5.* 35x50 cm', '', '🛑 *0.* Cancelar y volver al menú principal'].join('\n'), { capture: true, delay: 1000, idle: 600000 }, async (ctx, { state, gotoFlow, fallBack }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        if (ctx.body.trim() === '0') return gotoFlow(flowCancelar);
        const sizes = {'1': '100x70', '2': '70x50', '3': '200x100', '4': '80x120', '5': '35x50'};
        const sel = sizes[ctx.body.trim()];
        if (!sel) return fallBack('❌ Opción inválida. Responde 1 al 5, o 0 para cancelar.');
        
        const cat = state.getMyState().tempCatGF;
        await state.update({ itemName: `${cat} ${sel}`, basePrice: PRICES.gran_formato[cat.toLowerCase()][sel] });
        return gotoFlow(flowInicializarPedido);
    });
    
export const flowMenuPasacalles = addKeyword(EVENTS.ACTION)
    .addAnswer(['📏 *Tamaño Pasacalle*', '*1.* 350x70 cm', '*2.* 600x70 cm', '', '🛑 *0.* Cancelar y volver al menú principal'].join('\n'), { capture: true, delay: 1000, idle: 600000 }, async (ctx, { state, gotoFlow, fallBack }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        if (ctx.body.trim() === '0') return gotoFlow(flowCancelar);
        const sizes = {'1': '350x70', '2': '600x70'};
        const sel = sizes[ctx.body.trim()];
        if (!sel) return fallBack('❌ Opción inválida. Responde 1, 2 o 0 para cancelar.');
        await state.update({ itemName: `Pasacalle ${sel}`, basePrice: PRICES.gran_formato.pasacalles[sel] });
        return gotoFlow(flowInicializarPedido);
    });

export const flowMenuGranFormato = addKeyword(EVENTS.ACTION)
    .addAnswer(['🏙️ *Gran Formato*', '*1.* Pendones', '*2.* Adhesivos', '*3.* Pasacalles', '*4.* Microperforados', '', '🛑 *0.* Cancelar y volver al menú principal'].join('\n'), { capture: true, delay: 1000, idle: 600000 }, async (ctx, { state, gotoFlow, fallBack }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        const op = ctx.body.trim();
        if (op === '0') return gotoFlow(flowCancelar);
        if (op === '1') { await state.update({ tempCatGF: 'Pendones' }); return gotoFlow(flowMenuGranFormatoTamano); }
        else if (op === '2') { await state.update({ tempCatGF: 'Adhesivos' }); return gotoFlow(flowMenuGranFormatoTamano); }
        else if (op === '3') return gotoFlow(flowMenuPasacalles);
        else if (op === '4') { await state.update({ tempCatGF: 'Microperforados' }); return gotoFlow(flowMenuGranFormatoTamano); }
        return fallBack('❌ Opción inválida. Responde del 1 al 4, o 0 para cancelar.');
    });

// 5. Sublimación y Otros
export const flowMenuSublimacion = addKeyword(EVENTS.ACTION)
    .addAnswer(['🎁 *Artículos Sublimación*', '*1.* Mug Blanco Clásico', '*2.* Mug Mágico', '*3.* Termo Metálico', '*4.* Camiseta Blanca', '*5.* Camiseta Color', '*6.* Gorra Trucker', '*7.* Pad Mouse', '', '🛑 *0.* Cancelar y volver al menú principal'].join('\n'), { capture: true, delay: 1000, idle: 600000 }, async (ctx, { state, gotoFlow, fallBack }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        const op = ctx.body.trim();
        if (op === '0') return gotoFlow(flowCancelar);

        const items = {'1': 'Mug Blanco', '2': 'Mug Mágico', '3': 'Termo Metálico', '4': 'Camiseta Blanca', '5': 'Camiseta Color', '6': 'Gorra', '7': 'Pad Mouse'};
        const sel = items[op];
        if (!sel) return fallBack('❌ Opción inválida. Responde del 1 al 7, o 0 para cancelar.');
        await state.update({ itemName: `Sublimación ${sel}`, basePrice: PRICES.sublimacion[sel] });
        return gotoFlow(flowInicializarPedido);
    });

export const flowMenuCarnets = addKeyword(EVENTS.ACTION)
    .addAnswer(['🪪 *Carnets y Cuerdas*', '*1.* Carnet 1 Cara', '*2.* Carnet 2 Caras', '*3.* Cuerda Porta Carnet Sola', '*4.* Cuerda Porta Carnet Completa', '', '🛑 *0.* Cancelar y volver al menú principal'].join('\n'), { capture: true, delay: 1000, idle: 600000 }, async (ctx, { state, gotoFlow, fallBack }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        const op = ctx.body.trim();
        if (op === '0') return gotoFlow(flowCancelar);

        const items = {'1': 'Carnet 1 Cara', '2': 'Carnet 2 Caras', '3': 'Cuerda Porta Carnet Sola', '4': 'Cuerda Porta Carnet Completa'};
        const sel = items[op];
        if (!sel) return fallBack('❌ Opción inválida. Responde del 1 al 4, o 0 para cancelar.');
        await state.update({ itemName: sel, basePrice: PRICES.otros[sel] });
        return gotoFlow(flowInicializarPedido);
    });

export const flowMenuOtrosServicios = addKeyword(EVENTS.ACTION)
    .addAnswer(['✨ *Otros Servicios*', '*1.* Sublimación (Mugs, Camisetas...)', '*2.* Carnets y Cuerdas', '*3.* Impresión UV 39x29', '*4.* Diseño Sencillo (Pendón)', '*5.* Placa Nomenclatura', '*6.* Placa Reconocimiento', '*7.* Escáner Planos A0/A1/A2', '', '🛑 *0.* Cancelar y volver al menú principal'].join('\n'), { capture: true, delay: 1000, idle: 600000 }, async (ctx, { state, gotoFlow, fallBack }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        const op = ctx.body.trim();
        if (op === '0') return gotoFlow(flowCancelar);
        if (op === '1') return gotoFlow(flowMenuSublimacion);
        if (op === '2') return gotoFlow(flowMenuCarnets);
        
        const items = {
            '3': 'Impresión UV 39x29', '4': 'Diseño Sencillo (Pendón)', '5': 'Placa Nomenclatura', '6': 'Placa Reconocimiento', '7': 'Escáner A0/A1/A2'
        };
        const sel = items[op];
        if (!sel) return fallBack('❌ Opción inválida. Responde del 1 al 7, o 0 para cancelar.');
        await state.update({ itemName: sel, basePrice: PRICES.otros[sel] });
        return gotoFlow(flowInicializarPedido);
    });

// 6. Sellos
export const flowConfirmarSello = addKeyword(EVENTS.ACTION)
    .addAnswer('¿Deseas pedir este modelo de sello?\n\n*1.* ✅ Sí, continuar con el pedido\n*2.* 🔄 No, ver otros modelos\n\n🛑 *0.* Cancelar', { capture: true, delay: 1000, idle: 600000 }, async (ctx, { gotoFlow, fallBack }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        const op = ctx.body.trim();
        if (op === '0') return gotoFlow(flowCancelar);
        if (op === '1') return gotoFlow(flowInicializarPedido);
        if (op === '2') return gotoFlow(flowMenuSellos);
        
        return fallBack('❌ Opción inválida. Responde 1, 2 o 0.');
    });

export const flowMenuSellos = addKeyword(EVENTS.ACTION)
    .addAnswer(['🔏 *Sellos*', '_Nota: Al seleccionar una opción, te enviaremos una imagen del modelo del sello._', '', '*1.* S-843', '*2.* S-830', '*3.* 913', '*4.* R552', '*5.* Fechador S829D', '*6.* Fechador S826D', '*7.* Lapicero S723/SP723', '*8.* R542', '', '🛑 *0.* Cancelar y volver al menú principal'].join('\n'), { capture: true, delay: 1000, idle: 600000 }, async (ctx, { state, gotoFlow, fallBack, flowDynamic }) => {
        if (isAdmin(ctx.from) && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);
            if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);

        const items = {
            '1': { name: 'S-843', img: './assets/SELLOS/S-843.jpg' },
            '2': { name: 'S-830', img: './assets/SELLOS/S-830.jpg' },
            '3': { name: '913', img: './assets/SELLOS/Automatik 913.jpg' },
            '4': { name: 'R552', img: './assets/SELLOS/R-552.jpg' },
            '5': { name: 'S829D', img: './assets/SELLOS/S-829D.jpg' },
            '6': { name: 'S826D', img: './assets/SELLOS/S-826D.jpg' },
            '7': { name: 'S723 - SP723', img: './assets/SELLOS/S-723 SP-723.jpg' },
            '8': { name: 'R542', img: null }
        };

        const op = ctx.body.trim();
        if (op === '0') return gotoFlow(flowCancelar);

        const sel = items[op];
        if (!sel) return fallBack('❌ Opción inválida. Responde del 1 al 8, o 0 para cancelar.');

        if (sel.img) {
            try {
                await new Promise(r => setTimeout(r, 1000));
                await flowDynamic([{ body: `Aquí tienes una imagen del modelo ${sel.name}:`, media: sel.img }]);
            } catch(e) {
                console.error("Error enviando imagen de sello:", e);
            }
        }

        await state.update({ itemName: `Sello ${sel.name}`, basePrice: PRICES.sellos[sel.name] || 0 });
        return gotoFlow(flowConfirmarSello);
    });
