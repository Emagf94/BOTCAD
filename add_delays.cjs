const fs = require('fs');
let code = fs.readFileSync('src/app.js', 'utf8');

// 1. Add delay to all { capture: true } occurrences
code = code.replace(/\{\s*capture:\s*true\s*\}/g, '{ capture: true, delay: 3000 }');

// 2. Add delay to the QR payment capture
code = code.replace(/\{\s*media:\s*'\.\/assets\/qr_pagos\.png',\s*capture:\s*true\s*\}/g, "{ media: './assets/qr_pagos.png', capture: true, delay: 3000 }");

// 3. For .addAnswer( [ array ].join('\n') ) without options, add { delay: 3000 }
// It looks like: ].join('\n') )
// We want: ].join('\n'), { delay: 3000 } )
code = code.replace(/\.join\('\\n'\)\s*\)/g, ".join('\\n'), { delay: 3000 })");

// 4. For .addAnswer('String') without options
code = code.replace(/\.addAnswer\('([^']+)'\)/g, ".addAnswer('$1', { delay: 3000 })");

// 5. For flowDynamic, inject a dynamic sleep right before it
// Because flowDynamic is always inside an async function, we can safely inject await.
// But wait, there are flowDynamic imports at the top!
// Let's only replace `await flowDynamic(`
code = code.replace(/await flowDynamic\(/g, "await new Promise(r => setTimeout(r, Math.floor(Math.random() * 2000) + 2000));\n        await flowDynamic(");

fs.writeFileSync('src/app.js', code);
console.log('Delays added successfully');
