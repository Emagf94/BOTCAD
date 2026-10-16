import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './src/firebase.js';

async function updateAsesor3136303477() {
    try {
        const ref = doc(db, 'config', 'general');
        const snap = await getDoc(ref);
        
        if (snap.exists()) {
            const data = snap.data();
            
            let escapes = data.adminEscapes || [];
            if (!Array.isArray(escapes)) {
                escapes = typeof escapes === 'string' ? escapes.split(',').map(s => s.trim()) : [];
            }
            
            const newAdmin = '573136303477';
            const newAdminRaw = '3136303477';
            
            if (!escapes.includes(newAdmin)) escapes.push(newAdmin);
            if (!escapes.includes(newAdminRaw)) escapes.push(newAdminRaw);
            
            let supportPhones = data.adminSupportPhone || '573184849332@c.us, 573135363218@c.us';
            if (!supportPhones.includes(newAdmin)) {
                supportPhones += `, ${newAdmin}@c.us`;
            }

            await updateDoc(ref, {
                adminEscapes: escapes,
                adminSupportPhone: supportPhones
            });
            
            console.log(`✅ Asesor ${newAdmin} agregado exitosamente a Firestore en config/general.`);
            console.log(`   adminSupportPhone: ${supportPhones}`);
            console.log(`   adminEscapes: ${JSON.stringify(escapes)}`);
        } else {
            console.log("⚠️ No se encontró el documento config/general en la base de datos.");
        }
    } catch (error) {
        console.error("❌ Error actualizando la base de datos Firestore:", error);
    }
    process.exit(0);
}

updateAsesor3136303477();
