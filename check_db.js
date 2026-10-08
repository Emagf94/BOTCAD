import { doc, getDoc } from 'firebase/firestore';
import { db } from './src/firebase.js';

async function check() {
    const ref = doc(db, 'config', 'general');
    const snap = await getDoc(ref);
    if (snap.exists()) {
        console.log("Firebase data:", snap.data());
    } else {
        console.log("No config found in db.");
    }
    process.exit(0);
}
check();
