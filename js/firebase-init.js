// ============================================================
// INICIALIZACIÓN DE FIREBASE
// ============================================================
// Este archivo arranca la app de Firebase y expone las instancias
// de Auth y Firestore que usará el resto de la aplicación.
//
// El proyecto NO utiliza Firebase Storage (evitamos así depender del
// plan de pago Blaze): las fotos de perfil se comprimen en el propio
// navegador y se guardan como Data URL en Firestore, y las portadas
// de los libros son URLs externas que pega la administradora.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
