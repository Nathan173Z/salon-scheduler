import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAT_OmNlSuOrUdAz77OwaQbNC5DuERLyMQ",
  authDomain: "agendamento-acbf7.firebaseapp.com",
  projectId: "agendamento-acbf7",
  storageBucket: "agendamento-acbf7.firebasestorage.app",
  messagingSenderId: "663169945223",
  appId: "1:663169945223:web:b319fc29b63a67f99fb222",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);