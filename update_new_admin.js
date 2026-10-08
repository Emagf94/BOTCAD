import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './src/firebase.js';

async function updateNewAdmin() {
    try {
        const ref = doc(db, 'config', 'general');
        const snap = await getDoc(ref);
        
        if (snap.exists()) {
            const data = snap.data();
            
            let escapes = data.adminEscapes || [];
            
            const newAdmin = '573116584423';
            
            if (!escapes.includes(newAdmin)) {
                escapes.push(newAdmin);
            }

            await updateDoc(ref, {
                adminEscapes: escapes
            });
            
            console.log(`✅ Permisos de administrador agregados para ${newAdmin}`);
        } else {
            console.log("⚠️ No se encontró la configuración en la base de datos.");
        }
    } catch (error) {
        console.error("Error actualizando la base de datos:", error);
    }
    process.exit(0);
}

updateNewAdmin();
