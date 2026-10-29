import fs from 'fs';

let content = fs.readFileSync('src/app.js', 'utf8');

// 1. Insert flowCancelar
if (!content.includes('flowCancelar')) {
    const flowCancelarStr = `
const flowCancelar = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { provider, gotoFlow, state }) => {
        globalFilesCache.delete(ctx.from)
        globalFilesCache.delete(ctx.from + '_directo')
        await state.update({ archivos: [], archivosConfig: [], currentFileIndex: 0, itemName: '', tempSize: '' })
        try {
            const client = provider.getInstance ? provider.getInstance() : provider.vendor;
            if (client && client.sendImageAsSticker) {
                await client.sendImageAsSticker(ctx.from, './assets/chat_f.webp');
            } else {
                await provider.sendMedia(ctx.from, './assets/chat_f.webp', '');
            }
        } catch(e) {}
        return gotoFlow(flowMainMenu)
    })
`;
    // Insert before flowMainMenu
    content = content.replace(/(const flowMainMenu = addKeyword\(EVENTS\.ACTION\))/, flowCancelarStr + '\n$1');
    content = content.replace(/flowInactividad,/, 'flowInactividad,\n        flowCancelar,');
}

// 2. Replace exact cancel blocks
content = content.replace(/if\s*\(\s*ctx\.body\.trim\(\)\s*===\s*'0'\s*\)\s*return\s+gotoFlow\((?:flowMainMenu|flowWelcome)\)\s*;/g, "if (ctx.body.trim() === '0') return gotoFlow(flowCancelar);");
content = content.replace(/if\s*\(\s*ctx\.body\.trim\(\)\s*===\s*'0'\s*\)\s*return\s+gotoFlow\((?:flowMainMenu|flowWelcome)\)/g, "if (ctx.body.trim() === '0') return gotoFlow(flowCancelar)");

content = content.replace(/if\s*\(\s*op\s*===\s*'0'\s*\)\s*return\s+gotoFlow\((?:flowMainMenu|flowWelcome)\)\s*;/g, "if (op === '0') return gotoFlow(flowCancelar);");
content = content.replace(/if\s*\(\s*op\s*===\s*'0'\s*\)\s*return\s+gotoFlow\((?:flowMainMenu|flowWelcome)\)/g, "if (op === '0') return gotoFlow(flowCancelar)");

content = content.replace(/if\s*\(\s*op\s*===\s*'0'\s*\|\|\s*op\s*===\s*'menu'\s*\)\s*return\s+gotoFlow\((?:flowMainMenu|flowWelcome)\)/g, "if (op === '0' || op === 'menu') return gotoFlow(flowCancelar)");

content = content.replace(/if\s*\(\s*\['0', 'menu', 'menú', 'volver'\]\.includes\(texto\)\s*\)\s*return\s+gotoFlow\((?:flowMainMenu|flowWelcome)\)/g, "if (['0', 'menu', 'menú', 'volver'].includes(texto)) return gotoFlow(flowCancelar)");

content = content.replace(/if\s*\(\['0', 'menu', 'menú', 'volver'\]\.includes\(texto\)\)\s*\{\s*globalFilesCache\.delete\(ctx\.from\)\s*return\s+gotoFlow\((?:flowMainMenu|flowWelcome)\)\s*\}/g, "if (['0', 'menu', 'menú', 'volver'].includes(texto)) { globalFilesCache.delete(ctx.from); return gotoFlow(flowCancelar); }");

content = content.replace(/async\s*\(ctx,\s*\{\s*gotoFlow\s*\}\)\s*=>\s*gotoFlow\((?:flowMainMenu|flowWelcome)\)/g, "async (ctx, { gotoFlow }) => gotoFlow(flowCancelar)");


fs.writeFileSync('src/app.js', content);
console.log('Replaced cancel destinations with flowCancelar');
