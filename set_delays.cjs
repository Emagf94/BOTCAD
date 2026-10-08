const fs = require('fs');
let code = fs.readFileSync('src/app.js', 'utf8');

// Replace all setTimeout with 1500
code = code.replace(/Math\.floor\(Math\.random\(\) \* \d+\) \+ \d+/g, '1500');

// Replace all delay: N with delay: 1500
code = code.replace(/delay:\s*\d+/g, 'delay: 1500');

fs.writeFileSync('src/app.js', code);
console.log("Done");
