import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../src/firebase.js';

async function updatePhotoPrices() {
    console.log('🔄 Actualizando tarifas de Papel Fotográfico en Firestore (config/prices)...');
    try {
        const pricesRef = doc(db, 'config', 'prices');
        const snap = await getDoc(pricesRef);
        const currentData = snap.exists() ? snap.data() : {};

        const updatedFotos = {
            ...(currentData.fotos || {}),
            '10x15': 4000,
            'Carta': 4000,
            'A4': 4000,
            'Tabloide': 20000,
            '35x50': 25000,
            '50x70': 35000,
            '70x100': 60000
        };

        await setDoc(pricesRef, {
            ...currentData,
            fotos: updatedFotos
        }, { merge: true });

        console.log('✅ Tarifas de Papel Fotográfico sincronizadas con éxito en Firestore:');
        console.log(JSON.stringify(updatedFotos, null, 2));
        process.exit(0);
    } catch (err) {
        console.error('❌ Error actualizando tarifas en Firestore:', err);
        process.exit(1);
    }
}

updatePhotoPrices();
