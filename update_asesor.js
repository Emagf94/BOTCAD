import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './src/firebase.js';

async function updateAsesor() {
    try {
        const ref = doc(db, 'config', 'general');
        const snap = await getDoc(ref);
        
        if (snap.exists()) {
            const data = snap.data();
            
            // Agregar el número a los asesores de soporte
            let currentPhones = data.adminSupportPhone || '573184849332@c.us';
            if (!currentPhones.includes('573135363192')) {
                currentPhones += ', 573135363192@c.us';
            }
            
            // Agregar el número a los permisos de admin
            let escapes = data.adminEscapes || ['573184849332', '235780886794250'];
            if (!escapes.includes('573135363192')) {
                escapes.push('573135363192');
            }

            await updateDoc(ref, {
                adminSupportPhone: currentPhones,
                adminEscapes: escapes
            });
            console.log("✅ Número 3135363192 agregado a asesores de forma exitosa en la base de datos.");
        } else {
            console.log("⚠️ No se encontró la configuración en la base de datos.");
        }
    } catch (error) {
        console.error("Error actualizando la base de datos:", error);
    }
    process.exit(0);
}

updateAsesor();
