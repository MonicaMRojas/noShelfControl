// ============================================================
// ROUTER — SPA muy simple basado en el hash de la URL (#/ruta)
// ============================================================

import { renderHome } from "./views/home.js";
import { renderLibrary } from "./views/library.js";
import { renderBookDetail } from "./views/bookDetail.js";
import { renderProfile } from "./views/profile.js";
import { renderEditProfile } from "./views/editProfile.js";
import { renderPublicProfile } from "./views/publicProfile.js";
import { renderCommunity } from "./views/community.js";
import { renderAdmin } from "./views/admin.js";
import { renderWrapped } from "./views/wrapped.js";
import { renderProposals } from "./views/proposals.js";

const routes = [
  { pattern: "/home", render: renderHome, nav: "home" },
  { pattern: "/library", render: renderLibrary, nav: "library" },
  { pattern: "/book/:id", render: renderBookDetail, nav: "library" },
  { pattern: "/proposals", render: renderProposals, nav: "proposals" },
  { pattern: "/profile", render: renderProfile, nav: "profile" },
  { pattern: "/profile/edit", render: renderEditProfile, nav: "profile" },
  { pattern: "/user/:id", render: renderPublicProfile, nav: "club" },
  { pattern: "/club", render: renderCommunity, nav: "club" },
  { pattern: "/admin", render: renderAdmin, nav: "profile" },
  { pattern: "/admin/book/:id", render: renderAdmin, nav: "profile" },
  { pattern: "/wrapped", render: renderWrapped, nav: "profile" },
];

export function currentPath() {
  const hash = window.location.hash.replace(/^#/, "");
  return hash || "/home";
}

export function navigate(path) {
  if (window.location.hash === `#${path}`) {
    // Forzar re-render aunque la ruta no cambie (ej. recargar la misma ficha)
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = path;
  }
}

function matchRoute(path) {
  const pathParts = path.split("/").filter(Boolean);
  for (const route of routes) {
    const routeParts = route.pattern.split("/").filter(Boolean);
    if (routeParts.length !== pathParts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(":")) {
        params[routeParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
      } else if (routeParts[i] !== pathParts[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return null;
}

// Función de limpieza de la vista activa (ej. cancelar un onSnapshot de
// Firestore), devuelta opcionalmente por render() y ejecutada antes de
// pintar la siguiente ruta.
let activeCleanup = null;
// Evita que dos renders solapados (cambios de ruta rápidos) pinten a la vez
// y dejen un listener sin limpiar.
let renderToken = 0;

/** Pinta la ruta actual dentro de `container` y devuelve el nombre de la pestaña activa. */
export async function renderRoute(container) {
  const token = ++renderToken;
  if (activeCleanup) {
    try {
      activeCleanup();
    } catch (err) {
      console.warn("Error al limpiar la vista anterior:", err);
    }
    activeCleanup = null;
  }

  const path = currentPath();
  const match = matchRoute(path) || matchRoute("/home");
  window.scrollTo(0, 0);
  container.classList.remove("view-enter");
  // pequeño reflow para reiniciar la animación de entrada
  void container.offsetWidth;
  container.classList.add("view-enter");
  try {
    const cleanup = await match.route.render(container, match.params);
    if (typeof cleanup === "function") {
      if (token === renderToken) {
        activeCleanup = cleanup;
      } else {
        cleanup(); // otra navegación se adelantó: esta vista ya no está en pantalla
      }
    }
  } catch (err) {
    console.error("Error al renderizar la vista:", err);
    container.innerHTML = `<div class="empty-state"><p>No se ha podido cargar esta pantalla. Inténtalo de nuevo.</p></div>`;
  }
  return match.route.nav;
}
