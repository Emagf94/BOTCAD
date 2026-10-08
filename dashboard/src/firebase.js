import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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
export const auth = getAuth(app);
export const db = getFirestore(app);
