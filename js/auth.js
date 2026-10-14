// ============================================================
// AUTENTICACIÓN (Firebase Authentication)
// ============================================================

import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { auth } from "./firebase-init.js";

// Mantiene la sesión iniciada entre visitas (localStorage del navegador).
setPersistence(auth, browserLocalPersistence);

const googleProvider = new GoogleAuthProvider();

export function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export function registerWithEmail(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export function signInWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function signOutUser() {
  return signOut(auth);
}

/** Envía un correo para restablecer la contraseña de esa cuenta. */
export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

/** Se dispara cada vez que cambia el estado de sesión (login/logout). */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

/** Traduce los códigos de error de Firebase Auth a mensajes en español. */
export function authErrorMessage(error) {
  const code = error?.code || "";
  const map = {
    "auth/email-already-in-use": "Ese correo ya tiene una cuenta. Prueba a iniciar sesión.",
    "auth/invalid-email": "El correo electrónico no es válido.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/wrong-password": "Contraseña incorrecta.",
    "auth/user-not-found": "No existe ninguna cuenta con ese correo.",
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/popup-closed-by-user": "Has cerrado la ventana antes de terminar.",
    "auth/network-request-failed": "Problema de conexión. Inténtalo de nuevo.",
    "auth/missing-email": "Escribe tu correo electrónico primero.",
    "auth/too-many-requests": "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
  };
  return map[code] || "Ha ocurrido un error. Inténtalo de nuevo.";
}
