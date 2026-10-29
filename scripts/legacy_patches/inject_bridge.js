import fs from 'fs';

let content = fs.readFileSync('src/app.js', 'utf8');

// 1. Insert global variables and Admin flows at the top
if (!content.includes('flowAdminBridge')) {
    const bridgeCode = `
const activeBridgeChats = new Map();
const ADMIN_NUMBER_SUPPORT = '573184849332@c.us';

const flowAdminBridge = addKeyword(['!chatear'])
    .addAction(async (ctx, { flowDynamic, provider, gotoFlow }) => {
        if (ctx.from !== ADMIN_NUMBER_SUPPORT) return;
        const targetPhone = ctx.body.split(' ')[1];
        if (!targetPhone) return flowDynamic('⚠️ Debes indicar el número: !chatear 573001234567');
        
        const targetId = targetPhone.includes('@') ? targetPhone : \`\${targetPhone}@c.us\`;
        activeBridgeChats.set(ADMIN_NUMBER_SUPPORT, targetId);
        activeBridgeChats.set(targetId, ADMIN_NUMBER_SUPPORT);
        
        await provider.sendMessage(targetId, '👨‍💻 *Un asesor se ha unido al chat. Puedes escribirle ahora.*', {});
        return gotoFlow(flowAdminBridgeLoop);
    });

const flowAdminBridgeLoop = addKeyword(EVENTS.ACTION)
    .addAnswer('✅ Conectado al cliente. Todo lo que escribas se enviará. Escribe *!fin* para terminar.', { capture: true, idle: 3600000 }, async (ctx, { fallBack, endFlow, provider, gotoFlow }) => {
        if (ctx.from !== ADMIN_NUMBER_SUPPORT) return;
        if (ctx?.idleFallBack) {
            const clientPhone = activeBridgeChats.get(ADMIN_NUMBER_SUPPORT);
            if (clientPhone) {
                activeBridgeChats.delete(clientPhone);
                activeBridgeChats.delete(ADMIN_NUMBER_SUPPORT);
                await provider.sendMessage(clientPhone, '👨‍💻 *La sesión con el asesor ha finalizado.*', {});
            }
            return endFlow('⏳ Sesión de soporte terminada por inactividad.');
        }

        const clientPhone = activeBridgeChats.get(ADMIN_NUMBER_SUPPORT);
        if (!clientPhone) return endFlow('❌ El chat ha expirado o el cliente se fue.');

        if (ctx.body.trim().toLowerCase() === '!fin') {
            activeBridgeChats.delete(clientPhone);
            activeBridgeChats.delete(ADMIN_NUMBER_SUPPORT);
            await provider.sendMessage(clientPhone, '👨‍💻 *El asesor ha finalizado el chat.* Volviendo al menú principal...', {});
            return endFlow('✅ Chat finalizado. Has salido del modo soporte.');
        }

        if (ctx.hasMedia) {
            try {
                const path = await provider.saveFile(ctx);
                await provider.sendMedia(clientPhone, path, \`👨‍💻 *Asesor:* \${ctx.body || ''}\`);
            } catch (err) {}
        } else {
            await provider.sendMessage(clientPhone, \`👨‍💻 *Asesor:* \${ctx.body}\`, {});
        }
        return fallBack();
    });
`;
    content = content.replace(/(const flowInactividad = addKeyword)/, bridgeCode + '\n$1');
}

// 2. Replace flowAsesor
const flowAsesorRegex = /const flowAsesor = addKeyword\(\['humano', 'asesor', 'persona'\]\)\s*\.addAnswer\([^)]+\)/;
const newFlowAsesor = `const flowAsesor = addKeyword(['humano', 'asesor', 'persona'])
    .addAction(async (ctx, { provider, state }) => {
        const name = state.getMyState()?.userName || 'Cliente';
        const phone = ctx.from.split('@')[0];
        const msgAdmin = \`🆘 *Solicitud de Soporte*\\n👤 Cliente: \${name}\\n📱 Teléfono: \${phone}\\n\\nPara atender este chat, envía:\\n*!chatear \${phone}*\`;
        try { await provider.sendMessage(ADMIN_NUMBER_SUPPORT, msgAdmin, {}) } catch(e){}
    })
    .addAnswer('👨‍💻 *Contacto Directo con un Asesor*\\nEn unos instantes un asesor se unirá a esta conversación.\\n\\nEscribe tus dudas por aquí. Para cancelar o terminar la sesión escribe *0* o *salir*.', { capture: true, idle: 600000 }, async (ctx, { fallBack, gotoFlow, provider }) => {
        if (ctx?.idleFallBack) {
            const adminPhone = activeBridgeChats.get(ctx.from);
            if (adminPhone) {
                activeBridgeChats.delete(adminPhone);
                activeBridgeChats.delete(ctx.from);
                await provider.sendMessage(adminPhone, \`❌ La sesión con \${ctx.from} expiró por inactividad.\`, {});
            }
            return gotoFlow(flowInactividad);
        }

        const txt = ctx.body.trim().toLowerCase();
        if (txt === '0' || txt === 'salir') {
            const adminPhone = activeBridgeChats.get(ctx.from);
            if (adminPhone) {
                activeBridgeChats.delete(adminPhone);
                activeBridgeChats.delete(ctx.from);
                await provider.sendMessage(adminPhone, \`❌ El cliente ha finalizado el chat de soporte.\`, {});
            }
            return gotoFlow(flowCancelar);
        }

        const adminPhone = activeBridgeChats.get(ctx.from);
        if (!adminPhone) {
            await provider.sendMessage(ctx.from, '⏳ Aún estamos conectando con un asesor, por favor espera un momento...', {});
            return fallBack();
        }

        if (ctx.hasMedia) {
            try {
                const path = await provider.saveFile(ctx);
                await provider.sendMedia(adminPhone, path, \`👤 *Cliente:* \${ctx.body || ''}\`);
            } catch(e){}
        } else {
            await provider.sendMessage(adminPhone, \`👤 *Cliente:* \${ctx.body}\`, {});
        }
        return fallBack();
    })`;

content = content.replace(flowAsesorRegex, newFlowAsesor);

// 3. Register flows in createFlow
if (!content.includes('flowAdminBridge,')) {
    content = content.replace(/flowCancelar,/, 'flowCancelar,\n        flowAdminBridge,\n        flowAdminBridgeLoop,');
}

fs.writeFileSync('src/app.js', content);
console.log('Injected bridge mode for Asesor');
