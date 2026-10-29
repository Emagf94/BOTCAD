import fs from 'fs';

let content = fs.readFileSync('src/app.js', 'utf8');

// 1. Change strict equality to .includes
content = content.replace(/ctx\.from === ADMIN_NUMBER_SUPPORT/g, "ctx.from.includes('573184849332')");
content = content.replace(/ctx\.from !== ADMIN_NUMBER_SUPPORT/g, "!ctx.from.includes('573184849332')");

// 2. Change activeBridgeChats to use ctx.from instead of ADMIN_NUMBER_SUPPORT inside the admin flows
// Because we want to store the actual WhatsApp ID the admin is sending from!
content = content.replace(/activeBridgeChats\.set\(ADMIN_NUMBER_SUPPORT,\s*targetId\);/g, "activeBridgeChats.set(ctx.from, targetId);");
content = content.replace(/activeBridgeChats\.set\(targetId,\s*ADMIN_NUMBER_SUPPORT\);/g, "activeBridgeChats.set(targetId, ctx.from);");
content = content.replace(/activeBridgeChats\.get\(ADMIN_NUMBER_SUPPORT\)/g, "activeBridgeChats.get(ctx.from)");
content = content.replace(/activeBridgeChats\.delete\(ADMIN_NUMBER_SUPPORT\)/g, "activeBridgeChats.delete(ctx.from)");

// 3. Fix the contactUser database field in flowAsesor
content = content.replace(/if \(userDb\.phone\) dbPhone = userDb\.phone;/g, "if (userDb.contactUser) dbPhone = userDb.contactUser;");

fs.writeFileSync('src/app.js', content);
console.log('Fixed admin matching and db field.');
