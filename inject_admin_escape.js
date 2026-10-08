import fs from 'fs';

let content = fs.readFileSync('src/app.js', 'utf8');

// Replace standard idle check with the admin escape + idle check
// We only replace lines that exactly have: if (ctx?.idleFallBack) return gotoFlow(flowInactividad);
const escapeHatch = `
        if (ctx.from === ADMIN_NUMBER_SUPPORT && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            if (ctx.body.trim().startsWith('!chatear')) return gotoFlow(flowAdminBridge);
            return gotoFlow(flowAdminBridgeLoop);
        }
        if (ctx?.idleFallBack) return gotoFlow(flowInactividad);
`;

content = content.replace(/\s*if\s*\(\s*ctx\?\.idleFallBack\s*\)\s*return\s+gotoFlow\(\s*flowInactividad\s*\)\s*;/g, escapeHatch);

fs.writeFileSync('src/app.js', content);
console.log('Injected admin escape hatch into all capture nodes.');
