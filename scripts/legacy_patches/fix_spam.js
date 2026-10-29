import fs from 'fs';

let content = fs.readFileSync('src/app.js', 'utf8');

// Fix 1: Convert flowAsesor .addAnswer to .addAction
content = content.replace(
    /try\s*{\s*await\s+provider\.sendMessage\(ADMIN_NUMBER_SUPPORT,\s*msgAdmin,\s*{}\)\s*}\s*catch\(e\){}\s*}\)\s*\.addAnswer\('👨‍💻 \*Contacto Directo con un Asesor\*\\nEn unos instantes un asesor se unirá a esta conversación\.\\n\\nEscribe tus dudas por aquí\. Para cancelar o terminar la sesión escribe \*0\* o \*salir\*\.',\s*{\s*capture:\s*true,\s*idle:\s*600000\s*},\s*async\s*\(ctx,\s*{\s*fallBack,\s*gotoFlow,\s*provider\s*}\)\s*=>\s*{/,
    `try { await provider.sendMessage(ADMIN_NUMBER_SUPPORT, msgAdmin, {}) } catch(e){}
        const flowDynamic = arguments[1].flowDynamic;
        if(flowDynamic) {
            await flowDynamic('👨‍💻 *Contacto Directo con un Asesor*\\nEn unos instantes un asesor se unirá a esta conversación.\\n\\nEscribe tus dudas por aquí. Para cancelar o terminar la sesión escribe *0* o *salir*.');
        }
    })
    .addAction({ capture: true, idle: 600000 }, async (ctx, { fallBack, gotoFlow, provider }) => {`
);

// Actually, extracting flowDynamic from arguments is messy.
// It's better to just regex the whole addAction of flowAsesor and add flowDynamic to its parameters.
content = content.replace(
    /\.addAction\(async\s*\(ctx,\s*{\s*provider,\s*state\s*}\)\s*=>\s*{/,
    ".addAction(async (ctx, { provider, state, flowDynamic }) => {"
);
content = content.replace(
    /try\s*{\s*await\s+provider\.sendMessage\(ADMIN_NUMBER_SUPPORT,\s*msgAdmin,\s*{}\)\s*}\s*catch\(e\){}\s*}\)\s*\.addAnswer\('👨‍💻 \*Contacto Directo con un Asesor\*\\nEn unos instantes un asesor se unirá a esta conversación\.\\n\\nEscribe tus dudas por aquí\. Para cancelar o terminar la sesión escribe \*0\* o \*salir\*\.',\s*{\s*capture:\s*true,\s*idle:\s*600000\s*},\s*async\s*\(ctx,\s*{\s*fallBack,\s*gotoFlow,\s*provider\s*}\)\s*=>\s*{/,
    `try { await provider.sendMessage(ADMIN_NUMBER_SUPPORT, msgAdmin, {}) } catch(e){}
        await flowDynamic('👨‍💻 *Contacto Directo con un Asesor*\\nEn unos instantes un asesor se unirá a esta conversación.\\n\\nEscribe tus dudas por aquí. Para cancelar o terminar la sesión escribe *0* o *salir*.');
    })
    .addAction({ capture: true, idle: 600000 }, async (ctx, { fallBack, gotoFlow, provider }) => {`
);

// Fix 2: Convert flowAdminBridgeLoop .addAnswer to .addAction
content = content.replace(
    /\.addAnswer\('✅ Conectado al cliente\. Todo lo que escribas se enviará\. Escribe \*!fin\* para terminar\.',\s*{\s*capture:\s*true,\s*idle:\s*3600000\s*},\s*async\s*\(ctx,\s*{\s*fallBack,\s*endFlow,\s*provider,\s*gotoFlow\s*}\)\s*=>\s*{/,
    `.addAction({ capture: true, idle: 3600000 }, async (ctx, { fallBack, endFlow, provider, gotoFlow }) => {`
);

fs.writeFileSync('src/app.js', content);
console.log('Fixed fallBack spam.');
