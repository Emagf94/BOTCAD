import fs from 'fs';

let content = fs.readFileSync('src/app.js', 'utf8');

// 1. Add pendingSupportQueue
content = content.replace(
    /const activeBridgeChats = new Map\(\);/,
    "const activeBridgeChats = new Map();\nconst pendingSupportQueue = [];"
);

// 2. Update flowAsesor to use pendingSupportQueue and change instructions
content = content.replace(
    /const msgAdmin = `🆘 \*Solicitud de Soporte\*\\n👤 Cliente: \${finalName}\\n📱 Teléfono: \${finalPhone} \(wa\.me\/\${phoneId}\)\\n\\nPara atender este chat, envía:\\n\*!chatear \${phoneId}\*`;/g,
    `pendingSupportQueue.push(phoneId);
        const pendingCount = pendingSupportQueue.length > 1 ? \` (+\${pendingSupportQueue.length - 1} en espera)\` : '';
        const msgAdmin = \`🆘 *Solicitud de Soporte*\\n👤 Cliente: \${finalName}\\n📱 Teléfono: \${finalPhone} (wa.me/\${phoneId})\\n\\nPara atender este chat, envía:\\n*!atender*\${pendingCount}\`;`
);

// 3. Update flowAdminBridge to handle !atender
const oldAdminBridge = `const flowAdminBridge = addKeyword(['!chatear'])
    .addAction(async (ctx, { flowDynamic, provider, gotoFlow }) => {
        if (!ctx.from.includes('573184849332')) return;
        const targetPhone = ctx.body.split(' ')[1];
        if (!targetPhone) return flowDynamic('⚠️ Debes indicar el número: !chatear 573001234567');
        
        const targetId = targetPhone.includes('@') ? targetPhone : \`\${targetPhone}@c.us\`;
        activeBridgeChats.set(ctx.from, targetId);
        activeBridgeChats.set(targetId, ctx.from);
        
        await provider.sendMessage(targetId, '👨‍💻 *Un asesor se ha unido al chat. Puedes escribirle ahora.*', {});
        await provider.sendMessage(ctx.from, '✅ Conectado al cliente. Todo lo que escribas se enviará. Escribe *!fin* para terminar.', {});
        return gotoFlow(flowAdminBridgeLoop);
    });`;

const newAdminBridge = `const flowAdminBridge = addKeyword(['!chatear', '!atender'])
    .addAction(async (ctx, { flowDynamic, provider, gotoFlow }) => {
        if (!ctx.from.includes('573184849332')) return;
        
        let targetId;
        const txt = ctx.body.trim().toLowerCase();
        
        if (txt.startsWith('!atender')) {
            if (pendingSupportQueue.length === 0) return flowDynamic('⚠️ No hay clientes en espera de soporte.');
            const phone = pendingSupportQueue.shift();
            targetId = phone.includes('@') ? phone : \`\${phone}@c.us\`;
        } else {
            const targetPhone = ctx.body.split(' ')[1];
            if (!targetPhone) return flowDynamic('⚠️ Debes indicar el número: !chatear 573001234567');
            targetId = targetPhone.includes('@') ? targetPhone : \`\${targetPhone}@c.us\`;
        }
        
        activeBridgeChats.set(ctx.from, targetId);
        activeBridgeChats.set(targetId, ctx.from);
        
        // Remove targetId from pending queue if they were manually connected via !chatear
        const rawTargetPhone = targetId.split('@')[0];
        const queueIndex = pendingSupportQueue.indexOf(rawTargetPhone);
        if (queueIndex > -1) pendingSupportQueue.splice(queueIndex, 1);
        
        await provider.sendMessage(targetId, '👨‍💻 *Un asesor se ha unido al chat. Puedes escribirle ahora.*', {});
        await provider.sendMessage(ctx.from, '✅ Conectado al cliente. Todo lo que escribas se enviará. Escribe *!fin* para terminar.', {});
        return gotoFlow(flowAdminBridgeLoop);
    });`;

content = content.replace(oldAdminBridge, newAdminBridge);

// 4. Update all escape hatches to intercept !atender
content = content.replace(
    /if \(ctx\.body\.trim\(\)\.startsWith\('!chatear'\)\) return gotoFlow\(flowAdminBridge\);/g,
    "if (ctx.body.trim().startsWith('!chatear') || ctx.body.trim().startsWith('!atender')) return gotoFlow(flowAdminBridge);"
);

fs.writeFileSync('src/app.js', content);
console.log('Implemented !atender logic.');
