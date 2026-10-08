import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './src/firebase.js';

async function updateOrders() {
    try {
        const ref = doc(db, 'config', 'general');
        const snap = await getDoc(ref);
        
        if (snap.exists()) {
            const data = snap.data();
            
            // Set the new admin orders phone
            const newOrdersPhone = '573135363218@c.us';
            
            // Add to admin escapes if not present
            let escapes = data.adminEscapes || [];
            if (!escapes.includes('573135363218')) {
                escapes.push('573135363218');
            }

            await updateDoc(ref, {
                adminOrdersPhone: newOrdersPhone,
                adminEscapes: escapes
            });
            
            console.log(`✅ Número de recepción de archivos actualizado a ${newOrdersPhone}`);
            console.log(`✅ Permisos de administrador agregados para 573135363218`);
        } else {
            console.log("⚠️ No se encontró la configuración en la base de datos.");
        }
    } catch (error) {
        console.error("Error actualizando la base de datos:", error);
    }
    process.exit(0);
}

updateOrders();
