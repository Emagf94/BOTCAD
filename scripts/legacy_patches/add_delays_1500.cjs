const fs = require('fs');
let code = fs.readFileSync('src/app.js', 'utf8');

// Match .addAnswer('string')
code = code.replace(/\.addAnswer\(\s*('[^']+')\s*\)/g, ".addAnswer($1, { delay: 1500 })");

// Match .addAnswer(`string`)
code = code.replace(/\.addAnswer\(\s*(`[^`]+`)\s*\)/g, ".addAnswer($1, { delay: 1500 })");

// Match .addAnswer([ ... ].join('\n'))
code = code.replace(/\.addAnswer\(\s*(\[[^\]]+\]\.join\('[^']+'\))\s*\)/g, ".addAnswer($1, { delay: 1500 })");

// Match .addAnswer(text, { options }) missing delay
code = code.replace(/\.addAnswer\(\s*([^,]+),\s*\{([^}]+)\}\s*\)/g, (match, text, opts) => {
    if (!opts.includes('delay')) {
        return `.addAnswer(${text}, { ${opts.trim()}, delay: 1500 })`;
    }
    return match;
});

fs.writeFileSync('src/app.js', code);
console.log("Done");
