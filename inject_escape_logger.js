import fs from 'fs';

let content = fs.readFileSync('src/app.js', 'utf8');

content = content.replace(
    /if \(ctx\.from\.includes\('573184849332'\) && ctx\.body && typeof ctx\.body === 'string' && ctx\.body\.trim\(\)\.startsWith\('!'\)\) {/g,
    `if (ctx.from.includes('573184849332') && ctx.body && typeof ctx.body === 'string' && ctx.body.trim().startsWith('!')) {
            console.log("=== ESCAPE HATCH TRIGGERED ===", ctx.body);`
);

fs.writeFileSync('src/app.js', content);
console.log('Injected escape hatch logger');
