const fs = require('fs');
let code = fs.readFileSync('src/app.js', 'utf8');

const replacement = `const flowPagoEfectivo = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, provider, gotoFlow, flowDynamic }) => {
        const data = state.getMyState()
        const ADMIN_NUMBER = '573184849332@c.us'
        const rawNumber = ctx.from.split('@')[0]
        const USER_NAME = ctx.pushName || ctx.name || 'Cliente'

        const msgAdmin = \`🚨 *NUEVO PEDIDO RECIBIDO (PAGO EN EFECTIVO)* 🚨\\n\\n\` +
                         \`👤 *Cliente:* \${data.nombrePedido || 'No especificado'} (@\${USER_NAME.replace('@', '')})\\n\` +
                         \`📱 *Teléfono:* \${data.telefono || 'No especificado'}\\n\` +
                         \`🔗 *Link WA:* wa.me/\${rawNumber}\\n\` +
                         \`🔹 *Servicio:* \${data.servicioName || 'N/A'}\\n\` +
                         \`🔹 *Material:* \${data.papel || 'N/A'}\\n\` +
                         \`🔹 *Tamaño:* \${data.tamano || 'N/A'}\\n\` +
                         \`🔹 *Color:* \${data.color || 'N/A'}\\n\\n\` +
                         \`Se adjuntan \${data.archivos?.length || 0} archivo(s). El cliente pagará en efectivo en el local.\`

        try { await provider.sendMessage(ADMIN_NUMBER, msgAdmin, {}) } catch (err) {}

        for (const path of (data.archivos || [])) {
            try { await provider.sendMedia(ADMIN_NUMBER, path, '📄 Archivo a imprimir') } catch(e) {}
        }

        await flowDynamic('🏢 Has elegido pago en *Efectivo*.\\n\\n⚠️ Recuerda que debes acercarte a nuestro local para realizar el pago, y *solo en ese momento se iniciará la impresión* de tu pedido.\\n\\nTus archivos ya están en nuestro sistema. ¡Te esperamos en IMPRESIONES CAD!')
        return gotoFlow(flowEsperaMenu)
    })`;

// Replace the old corrupt block
const regex = /const flowPagoEfectivo = addKeyword\(EVENTS\.ACTION\)[\s\S]*?return gotoFlow\(flowEsperaMenu\)\n    }\)/;
code = code.replace(regex, replacement);

fs.writeFileSync('src/app.js', code);
