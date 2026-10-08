import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './src/firebase.js';

async function updateLids() {
    try {
        const ref = doc(db, 'config', 'general');
        const snap = await getDoc(ref);
        
        if (snap.exists()) {
            const data = snap.data();
            let escapes = data.adminEscapes || [];
            
            // Add the @lid IDs for the admins
            const lidsToAdd = ['13770403381354', '235780886794250'];
            for (const lid of lidsToAdd) {
                if (!escapes.includes(lid)) {
                    escapes.push(lid);
                }
            }

            await updateDoc(ref, { adminEscapes: escapes });
            console.log("✅ Permisos de @lid agregados a la base de datos.");
        } else {
            console.log("⚠️ No se encontró la configuración en la base de datos.");
        }
    } catch (error) {
        console.error("Error actualizando la base de datos:", error);
    }
    process.exit(0);
}

updateLids();
