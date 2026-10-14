// ============================================================
// PUNTO DE ENTRADA DE LA APP
// ============================================================
// Decide qué pantalla mostrar según el estado de autenticación:
//   1. Cargando  -> spinner
//   2. Sin sesión -> pantalla de login
//   3. Con sesión pero sin perfil -> onboarding (crear perfil)
//   4. Con sesión y perfil -> shell de la app (nav inferior + vistas)
// ============================================================

import { isFirebaseConfigured } from "./firebase-config.js";

const root = document.getElementById("root");

if (!isFirebaseConfigured) {
  root.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <h1 class="auth-title">Falta configurar Firebase</h1>
        <p class="auth-subtitle">Abre <strong>js/firebase-config.js</strong> y pega los datos del proyecto de Firebase de No Shelf Control. Los pasos están en el README.</p>
      </div>
    </div>`;
} else {
  start();
}

async function start() {
  // Los módulos que usan Firebase se cargan solo si la configuración existe.
  await import("./firebase-init.js");
  const { onAuthChange } = await import("./auth.js");
  const { getUserProfile, ensureAutoRound, listenToLatestProposalRound } = await import("./db.js");
  const { state, setState } = await import("./state.js");
  const { renderRoute, navigate } = await import("./router.js");
  const { renderLogin } = await import("./views/login.js");
  const { renderOnboarding } = await import("./views/onboarding.js");

  function navItems() {
    const items = [
      { key: "home", path: "/home", label: "Inicio", icon: iconHome() },
      { key: "library", path: "/library", label: "Biblioteca", icon: iconLibrary() },
      { key: "club", path: "/club", label: "El Club", icon: iconClub() },
    ];
    if (state.proposalsVisible) {
      items.push({ key: "proposals", path: "/proposals", label: "Propuestas", icon: iconProposals() });
    }
    items.push({ key: "profile", path: "/profile", label: "Mi perfil", icon: iconProfile() });
    return items;
  }

  let shellBuilt = false;
  let unsubscribeVisibility = null;
  let hashListenerAdded = false;

  onAuthChange(async (user) => {
    if (!user) {
      setState({ user: null, profile: null, isAdmin: false, proposalsVisible: false });
      shellBuilt = false;
      stopVisibilityListeners();
      renderLogin(root);
      return;
    }

    showLoading();
    let profile = null;
    try {
      profile = await getUserProfile(user.uid);
    } catch (err) {
      console.error("Error al cargar el perfil:", err);
      root.innerHTML = `
        <div class="auth-screen"><div class="auth-card">
          <h1 class="auth-title">No hemos podido conectar</h1>
          <p class="auth-subtitle">Comprueba tu conexión e inténtalo de nuevo.</p>
          <button class="btn btn-primary btn-block" onclick="location.reload()">Reintentar</button>
        </div></div>`;
      return;
    }

    setState({ user, profile, isAdmin: profile?.role === "admin" });

    if (!profile) {
      shellBuilt = false;
      renderOnboarding(root, {
        user,
        onComplete: async () => {
          const newProfile = await getUserProfile(user.uid);
          setState({ profile: newProfile, isAdmin: newProfile?.role === "admin" });
          await afterProfileReady();
        },
      });
      return;
    }

    await afterProfileReady();
  });

  async function afterProfileReady() {
    // Si el libro actual ya pasó su fecha de reunión y tiene activada la
    // apertura automática, se abre la ronda de propuestas (una sola vez).
    try {
      await ensureAutoRound();
    } catch (err) {
      console.warn("No se ha podido comprobar la ronda de propuestas:", err);
    }
    startVisibilityListeners();
    showApp();
  }

  // Suscripción en tiempo real: si una administradora oculta/muestra la
  // sección de propuestas, el menú reacciona al instante sin recargar.
  function startVisibilityListeners() {
    stopVisibilityListeners();
    unsubscribeVisibility = listenToLatestProposalRound((round) => {
      setState({ proposalsVisible: round?.visible === true });
      renderNav();
    });
  }

  function stopVisibilityListeners() {
    if (unsubscribeVisibility) {
      unsubscribeVisibility();
      unsubscribeVisibility = null;
    }
  }

  function showLoading() {
    root.innerHTML = `<div class="screen-loading"><div class="loading-spinner"></div></div>`;
  }

  function showApp() {
    if (!shellBuilt) {
      buildShell();
      shellBuilt = true;
    }
    updateRoute();
  }

  function buildShell() {
    root.innerHTML = `
      <div id="view-container" class="view-container"></div>
      <nav class="bottom-nav" id="bottom-nav" aria-label="Navegación principal"></nav>
    `;

    document.getElementById("bottom-nav").addEventListener("click", (e) => {
      const btn = e.target.closest(".nav-item");
      if (!btn) return;
      navigate(btn.dataset.path);
    });

    renderNav();
    if (!hashListenerAdded) {
      window.addEventListener("hashchange", updateRoute);
      hashListenerAdded = true;
    }
  }

  // Repinta los botones del nav a partir del estado actual, conservando
  // cuál está activo.
  function renderNav() {
    const nav = document.getElementById("bottom-nav");
    if (!nav) return;
    const activeKey = nav.querySelector(".nav-item-active")?.dataset.key;
    nav.innerHTML = navItems()
      .map(
        (item) => `
      <button class="nav-item" data-path="${item.path}" data-key="${item.key}">
        ${item.icon}
        <span>${item.label}</span>
      </button>`
      )
      .join("");
    if (activeKey) {
      nav.querySelector(`[data-key="${activeKey}"]`)?.classList.add("nav-item-active");
    }
  }

  async function updateRoute() {
    const container = document.getElementById("view-container");
    if (!container || !state.user) return;
    const activeKey = await renderRoute(container);
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.classList.toggle("nav-item-active", btn.dataset.key === activeKey);
    });
  }
}

// ---------------- Iconos (SVG en línea, sin dependencias) ----------------

function iconHome() {
  return `<svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 11.5 12 4l9 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function iconLibrary() {
  return `<svg viewBox="0 0 24 24" width="22" height="22"><rect x="3.5" y="4" width="4" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="10" y="4" width="4" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16.7 4.6 20 5.8a1 1 0 0 1 .6 1.3l-4.2 12a1 1 0 0 1-1.3.6l-1.4-.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}

function iconClub() {
  return `<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="8.5" cy="8" r="2.8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16" cy="9" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14.8 15c2.4.3 4.2 2 4.2 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}

function iconProposals() {
  return `<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 3.5l1.8 4.7 4.7 1.8-4.7 1.8-1.8 4.7-1.8-4.7-4.7-1.8 4.7-1.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M19 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}

function iconProfile() {
  return `<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="8" r="3.4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4.8 19.5c1-3.4 3.8-5 7.2-5s6.2 1.6 7.2 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}
