import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './src/firebase.js';

async function syncAdminSettings() {
    try {
        const ref = doc(db, 'config', 'general');
        const snap = await getDoc(ref);
        
        const newAdmin = '573135363218';
        const newAdminRaw = '3135363218';
        
        if (snap.exists()) {
            const data = snap.data();
            let escapes = data.adminEscapes || ['573184849332', '235780886794250'];
            if (!escapes.includes(newAdmin)) escapes.push(newAdmin);
            if (!escapes.includes(newAdminRaw)) escapes.push(newAdminRaw);

            let supportPhones = data.adminSupportPhone || '573184849332@c.us';
            if (!supportPhones.includes(newAdmin)) {
                supportPhones += `, ${newAdmin}@c.us`;
            }

            let ordersPhone = data.adminOrdersPhone || '573184849332@c.us';
            if (!ordersPhone.includes(newAdmin)) {
                ordersPhone += `, ${newAdmin}@c.us`;
            }

            await updateDoc(ref, {
                adminEscapes: escapes,
                adminSupportPhone: supportPhones,
                adminOrdersPhone: ordersPhone
            });
            
            console.log(`✅ Permisos de administrador y soporte actualizados exitosamente en Firestore para ${newAdmin}`);
        } else {
            console.log("⚠️ No se encontró la configuración en la base de datos.");
        }
    } catch (error) {
        console.error("Error actualizando la base de datos:", error);
    }
    process.exit(0);
}

syncAdminSettings();
