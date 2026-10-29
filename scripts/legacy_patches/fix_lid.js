import fs from 'fs';

let content = fs.readFileSync('src/app.js', 'utf8');

// 1. Add isAdmin helper function at the top
content = content.replace(
    /const ADMIN_NUMBER_SUPPORT = '573184849332@c\.us';/,
    `const ADMIN_NUMBER_SUPPORT = '573184849332@c.us';\nconst isAdmin = (from) => ['573184849332', '235780886794250'].some(num => from.includes(num));`
);

// 2. Replace all ctx.from.includes('573184849332') with isAdmin(ctx.from)
content = content.replace(/!ctx\.from\.includes\('573184849332'\)/g, "!isAdmin(ctx.from)");
content = content.replace(/ctx\.from\.includes\('573184849332'\)/g, "isAdmin(ctx.from)");

fs.writeFileSync('src/app.js', content);
console.log('Fixed @lid admin bug');
