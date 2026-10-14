// ============================================================
// CONFIGURACIÓN DE FIREBASE — No Shelf Control
// ============================================================
// Sustituye los valores "PEGA_AQUI..." por los de TU NUEVO proyecto de
// Firebase (el de No Shelf Control, NO el de ningún otro club):
//   Firebase Console > Configuración del proyecto (⚙️) > General
//   > Tus apps > Web app > SDK setup and configuration > Config
//
// Esta app no usa Firebase Storage (plan gratuito Spark, sin tarjeta),
// así que "storageBucket" es indiferente.
//
// Instrucciones completas en README.md
// ============================================================

export const firebaseConfig = {
  apiKey: "PEGA_AQUI_TU_API_KEY",
  authDomain: "PEGA_AQUI_TU_PROYECTO.firebaseapp.com",
  projectId: "PEGA_AQUI_TU_PROJECT_ID",
  storageBucket: "PEGA_AQUI_TU_PROYECTO.firebasestorage.app",
  messagingSenderId: "PEGA_AQUI_TU_SENDER_ID",
  appId: "PEGA_AQUI_TU_APP_ID",
};

export const isFirebaseConfigured = !Object.values(firebaseConfig).some((v) =>
  String(v).startsWith("PEGA_AQUI")
);
