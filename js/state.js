// ============================================================
// ESTADO GLOBAL DE LA APP
// ============================================================
// Guarda a la usuaria autenticada, su perfil de Firestore y datos
// en caché. Las vistas lo leen directamente en cada render.
// ============================================================

export const state = {
  user: null, // objeto de Firebase Auth (o null si no hay sesión)
  profile: null, // documento users/{uid} de Firestore (o null)
  isAdmin: false,
  proposalsVisible: false, // si la sección "Propuestas" debe verse en la navegación
};

export function setState(patch) {
  Object.assign(state, patch);
}
