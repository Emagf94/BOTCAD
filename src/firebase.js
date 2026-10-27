import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyDwccRByP3nKr_PzSzpjvYocl9OwQv-j6I",
    authDomain: "cadbot-ba2a8.firebaseapp.com",
    projectId: "cadbot-ba2a8",
    storageBucket: "cadbot-ba2a8.firebasestorage.app",
    messagingSenderId: "113838088906",
    appId: "1:113838088906:web:563f7f71b18a9744348a33",
    measurementId: "G-LZVGM93QG9"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

console.log('✅ Conexión a Firebase Firestore (Client SDK) exitosa.');

/**
 * Obtiene un usuario por su número de teléfono
 * @param {string} phone Número de teléfono del usuario
 * @returns {Promise<Object|null>} Datos del usuario o null si no existe
 */
export const getUser = async (phone) => {
    try {
        const docRef = doc(db, 'users', phone);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data();
        }
        return null;
    } catch (error) {
        console.error('Error al obtener usuario de Firebase:', error);
        return null;
    }
};

/**
 * Guarda o actualiza un usuario en la base de datos
 * @param {string} phone Número de teléfono
 * @param {Object} data Datos a guardar (ej. { name: 'Juan' })
 */
export const saveUser = async (phone, data) => {
    try {
        const docRef = doc(db, 'users', phone);
        await setDoc(docRef, {
            ...data,
            phone: phone,
            updatedAt: new Date()
        }, { merge: true });
        return true;
    } catch (error) {
        console.error('Error al guardar usuario en Firebase:', error);
        return false;
    }
};

/**
 * Obtiene todos los usuarios registrados en la colección 'users'
 * @returns {Promise<Array<Object>>} Lista de usuarios
 */
export const getAllUsers = async () => {
    try {
        const querySnapshot = await getDocs(collection(db, 'users'));
        const users = [];
        querySnapshot.forEach((docSnap) => {
            users.push({ id: docSnap.id, ...docSnap.data() });
        });
        return users;
    } catch (error) {
        console.error('Error al obtener todos los usuarios de Firebase:', error);
        return [];
    }
};

