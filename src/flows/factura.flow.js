import { addKeyword, EVENTS } from '@builderbot/bot';
import { cleanDocumentNumber, findInvoicesByNit } from '../services/invoiceService.js';
import { deliverFileToRecipient } from '../utils/helpers.js';
import { flowCancelar, flowInactividad } from './main.flow.js';

// =============================================================================
// SUBFLUJO: SELECCIÓN DE FACTURA DESDE SUBMENÚ (2 A 9 FACTURAS)
// =============================================================================

export const flowSeleccionarFactura = addKeyword(EVENTS.ACTION)
    .addAction({ capture: true, delay: 500, idle: 600000 }, async (ctx, { gotoFlow, fallBack, state, flowDynamic, provider }) => {
        if (ctx?.idleFallBack) {
            await state.update({ facturaList: null, facturaNit: null });
            return gotoFlow(flowInactividad);
        }

        const rawChoice = (ctx.body || '').trim();
        const choiceLower = rawChoice.toLowerCase();

        // Opción 0 o cancelar: Regresar al menú principal vía flowCancelar
        if (choiceLower === '0' || choiceLower === 'salir' || choiceLower === 'cancelar' || choiceLower === 'menu') {
            await state.update({ facturaList: null, facturaNit: null });
            return gotoFlow(flowCancelar);
        }

        const myState = (state && state.getMyState) ? (state.getMyState() || {}) : {};
        const facturaList = myState.facturaList || [];

        if (facturaList.length === 0) {
            await state.update({ facturaList: null, facturaNit: null });
            return gotoFlow(flowCancelar);
        }

        const selectedIndex = parseInt(rawChoice, 10) - 1;

        if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= facturaList.length) {
            return fallBack(`❌ Opción inválida. Por favor, responde con un número del *1* al *${facturaList.length}*, o *0* para volver al menú principal:`);
        }

        const selectedInv = facturaList[selectedIndex];

        await flowDynamic(`📄 Aquí tienes tu factura electrónica del *${selectedInv.date}*. ¡Gracias por tu compra!`);
        
        try {
            await deliverFileToRecipient(provider, ctx.from, selectedInv.fullPath, `Factura ${selectedInv.consecutive || selectedInv.date}`);
        } catch (errDelivery) {
            console.error('Error enviando archivo de factura seleccionada:', errDelivery);
            try {
                await provider.sendMessage(ctx.from, '', { media: selectedInv.fullPath });
            } catch (errMedia) {
                console.error('Error fallback media factura:', errMedia);
            }
        }

        // Limpiar estado temporal y finalizar flujo sin intervención de asesor
        await state.update({ facturaList: null, facturaNit: null });
        return;
    });

// =============================================================================
// FLUJO PRINCIPAL: CONSULTA DE FACTURA ELECTRÓNICA (OPCIÓN 6)
// =============================================================================

export const flowFacturaElectronica = addKeyword(['factura', 'facturas', 'facturacion', 'facturación'])
    .addAnswer(
        [
            '📄 *Consulta de Factura Electrónica*',
            'Por favor, ingresa tu número de *NIT o Cédula* (sin puntos, espacios ni dígito de verificación):',
            '',
            '_(Escribe *0* para volver al menú principal)_'
        ].join('\n'),
        { capture: true, delay: 500, idle: 600000 },
        async (ctx, { gotoFlow, fallBack, state, flowDynamic, provider }) => {
            if (ctx?.idleFallBack) {
                await state.update({ facturaList: null, facturaNit: null });
                return gotoFlow(flowInactividad);
            }

            const rawInput = (ctx.body || '').trim();
            const inputLower = rawInput.toLowerCase();

            // Cancelación o regreso al menú
            if (inputLower === '0' || inputLower === 'salir' || inputLower === 'cancelar' || inputLower === 'menu') {
                await state.update({ facturaList: null, facturaNit: null });
                return gotoFlow(flowCancelar);
            }

            // Normalizar entrada del cliente
            const cleanNit = cleanDocumentNumber(rawInput);

            if (!cleanNit || cleanNit.length < 5) {
                return fallBack('⚠️ El número ingresado no parece válido. Por favor ingresa tu NIT o Cédula (mínimo 5 dígitos), o escribe *0* para volver al menú principal:');
            }

            // Buscar facturas ordenadas cronológicamente (más recientes primero)
            const invoices = findInvoicesByNit(cleanNit);

            // ─────────────────────────────────────────────────────────────────
            // CASO A: 0 facturas encontradas
            // ─────────────────────────────────────────────────────────────────
            if (invoices.length === 0) {
                return fallBack(
                    `⚠️ No encontramos facturas electrónicas asociadas al documento *${cleanNit}*.\n\n` +
                    `Verifica el número e intenta nuevamente, o escribe *0* para volver al menú principal.`
                );
            }

            // ─────────────────────────────────────────────────────────────────
            // CASO B: Exactamente 1 factura encontrada
            // ─────────────────────────────────────────────────────────────────
            if (invoices.length === 1) {
                const singleInv = invoices[0];
                await flowDynamic(`✅ Aquí tienes tu factura electrónica generada el *${singleInv.date}*. ¡Gracias por confiar en nosotros!`);
                
                try {
                    await deliverFileToRecipient(provider, ctx.from, singleInv.fullPath, `Factura ${singleInv.consecutive || singleInv.date}`);
                } catch (errDelivery) {
                    console.error('Error enviando archivo de factura única:', errDelivery);
                    try {
                        await provider.sendMessage(ctx.from, '', { media: singleInv.fullPath });
                    } catch (errMedia) {
                        console.error('Error fallback media factura única:', errMedia);
                    }
                }

                // Limpiar estado y terminar automáticamente sin asesor
                await state.update({ facturaList: null, facturaNit: null });
                return;
            }

            // ─────────────────────────────────────────────────────────────────
            // CASO C: Múltiples facturas encontradas (2 o más)
            // ─────────────────────────────────────────────────────────────────
            const topInvoices = invoices.slice(0, 9);
            await state.update({
                facturaList: topInvoices,
                facturaNit: cleanNit
            });

            const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
            let menuText = `📂 Encontramos varias facturas asociadas al documento *${cleanNit}*.\n` +
                `Responde con el número de la factura que deseas descargar (mostrando las más recientes):\n\n`;

            topInvoices.forEach((inv, index) => {
                const emoji = numberEmojis[index] || `*${index + 1}.*`;
                const consecStr = inv.consecutive ? ` (${inv.consecutive})` : '';
                menuText += `${emoji} Factura del *${inv.date}*${consecStr}\n`;
            });

            menuText += `\n0️⃣ Volver al menú principal`;

            await flowDynamic(menuText);
            return gotoFlow(flowSeleccionarFactura);
        }
    );
