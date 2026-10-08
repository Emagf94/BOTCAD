import fs from 'fs';

let content = fs.readFileSync('src/app.js', 'utf8');

// 1. Add flowInactividad before const main = ...
if (!content.includes('flowInactividad')) {
    const flowInactividadStr = `
const flowInactividad = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { endFlow, state }) => {
        globalFilesCache.delete(ctx.from)
        globalFilesCache.delete(ctx.from + '_directo')
        await state.clear()
        return endFlow('⏳ Sesión cerrada por inactividad de 10 minutos. Escribe "hola" para volver a empezar.')
    })
`;
    content = content.replace(/(const main = async \(\) => \{)/, flowInactividadStr + '\n$1');
    content = content.replace(/flowWelcomeRegistered,/, 'flowWelcomeRegistered,\n        flowInactividad,');
}

// 2. Inject idle: 600000 into { capture: true }
content = content.replace(/\{ capture: true(, delay: \d+)? \}/g, '{ capture: true$1, idle: 600000 }');

// 3. Inject if (ctx?.idleFallBack) return gotoFlow(flowInactividad) into callbacks
content = content.replace(/async\s*\(ctx,\s*\{([^}]*)\}\)\s*=>\s*\{/g, (match, p1) => {
    let destructure = p1;
    if (!destructure.includes('gotoFlow')) {
        destructure += ', gotoFlow';
    }
    return `async (ctx, {${destructure}}) => {\n        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);\n`;
});

fs.writeFileSync('src/app.js', content);
console.log('Injected idle logic into all capture nodes.');
