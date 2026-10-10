import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './src/firebase.js';

async function updateNewAdmin() {
    try {
        const ref = doc(db, 'config', 'general');
        const snap = await getDoc(ref);
        
        if (snap.exists()) {
            const data = snap.data();
            
            let escapes = data.adminEscapes || [];
            
            const newAdmin = '573135363218';
            const newAdmin2 = '3135363218';
            
            if (!escapes.includes(newAdmin)) {
                escapes.push(newAdmin);
            }
            if (!escapes.includes(newAdmin2)) {
                escapes.push(newAdmin2);
            }

            let ordersPhone = data.adminOrdersPhone || '573184849332@c.us';
            if (!ordersPhone.includes(newAdmin)) {
                ordersPhone += `, ${newAdmin}@c.us`;
            }

            let supportPhone = data.adminSupportPhone || '573184849332@c.us';
            if (!supportPhone.includes(newAdmin)) {
                supportPhone += `, ${newAdmin}@c.us`;
            }

            await updateDoc(ref, {
                adminEscapes: escapes,
                adminOrdersPhone: ordersPhone,
                adminSupportPhone: supportPhone
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
