// ============================================================
// VISTA: Propuestas — "¿Qué leemos después?"
// ============================================================
// Ronda abierta  -> formulario + listado en tiempo real (onSnapshot).
// Ronda pendiente de sorteo (venció y falta que una administradora la
// cierre) -> propuestas bloqueadas, listado visible.
// Ronda cerrada  -> resultado del sorteo + listado de propuestas.
// ============================================================

import { state } from "../state.js";
import {
  getLatestProposalRound,
  getProposalsForRound,
  listenToProposals,
  listenToLatestProposalRound,
  submitProposal,
  deleteMyProposal,
  roundPhase,
  getBook,
  ProposalError,
  getAllUsers,
} from "../db.js";
import { navigate } from "../router.js";
import {
  GENRES,
  MAX_PROPOSALS_PER_USER,
  confettiBurst,
  debounce,
  escapeHtml,
  formatDate,
  formatDateShort,
  normalizeBookText,
  showToast,
} from "../utils.js";
import { placeholderCover } from "./shared.js";

let searchTerm = "";
let sortMode = "fecha"; // "fecha" | "az"

// La vista se repinta sola (cambio de fase de la ronda) y el router solo
// conoce la limpieza de la primera pintura: la última se guarda aquí.
let currentCleanup = null;

export async function renderProposals(container) {
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }
  container.innerHTML = `<div class="loading-spinner"></div>`;

  const round = await getLatestProposalRound();

  if (!round || (round.visible !== true && !state.isAdmin)) {
    container.innerHTML = `
      <section class="page-header">
        <h1>Propuestas</h1>
      </section>
      <div class="empty-state"><p>Ahora mismo no hay ninguna ronda de propuestas.</p></div>
    `;
    return;
  }

  const phase = roundPhase(round);
  const cleanups = [];

  // Si una administradora abre, cierra, sortea o reprograma la ronda mientras
  // esta pantalla está abierta, o vence la fecha de cierre, se vuelve a pintar.
  const signature = (r) =>
    [r?.id, r?.status, r?.opensAt?.toMillis?.(), r?.closesAt?.toMillis?.(), r?.winnerProposalId, r?.visible].join("|");
  const initialSignature = signature(round);
  let rerendering = false;
  const rerender = () => {
    if (rerendering) return;
    rerendering = true;
    renderProposals(container);
  };

  let firstSnapshot = true;
  const unsubRound = listenToLatestProposalRound((latest) => {
    if (firstSnapshot) {
      firstSnapshot = false;
      if (signature(latest) === initialSignature) return;
    }
    if (signature(latest) !== initialSignature) rerender();
  });
  cleanups.push(unsubRound);

  const nextChange = nextPhaseChangeMs(round);
  if (nextChange !== null) {
    const timer = setTimeout(rerender, nextChange);
    cleanups.push(() => clearTimeout(timer));
  }

  let innerCleanup = null;
  if (phase === "closed") {
    await renderClosedRound(container, round);
  } else if (phase === "scheduled") {
    renderScheduledRound(container, round);
  } else {
    innerCleanup = await renderActiveRound(container, round, phase);
  }
  if (innerCleanup) cleanups.push(innerCleanup);

  // El router llama a esta función al salir de la vista (es idempotente).
  currentCleanup = () => cleanups.splice(0).forEach((fn) => fn());
  return () => currentCleanup && currentCleanup();
}

/** Milisegundos hasta el próximo cambio de fase de la ronda (apertura o cierre), o null. */
function nextPhaseChangeMs(round) {
  if (round.status === "closed") return null;
  const now = Date.now();
  const opens = round.opensAt?.toMillis ? round.opensAt.toMillis() : null;
  const closes = round.closesAt?.toMillis ? round.closesAt.toMillis() : null;
  const target = opens && now < opens ? opens : closes && now < closes ? closes : null;
  if (target === null) return null;
  return Math.min(target - now + 500, 2147483000); // límite de setTimeout
}

function roundTitle(round) {
  return round.title ? escapeHtml(round.title) : "¿Qué leemos después?";
}

function renderScheduledRound(container, round) {
  container.innerHTML = `
    <section class="page-header">
      <h1>${roundTitle(round)}</h1>
      <p class="section-subtitle">Pronto podrás proponer libros para la próxima lectura.</p>
    </section>
    <section class="card result-card">
      <span class="badge badge-soft">Próximamente</span>
      <h2>Las propuestas se abren el ${formatDate(round.opensAt)}</h2>
      <p class="empty-hint">Cierran el ${formatDate(round.closesAt)}. Cada integrante podrá proponer hasta ${MAX_PROPOSALS_PER_USER} libros.</p>
    </section>
  `;
}

async function renderActiveRound(container, round, phase) {
  const isOpen = phase === "open";
  const users = await getAllUsers().catch(() => []);
  const usersById = Object.fromEntries(users.map((u) => [u.id, u]));

  container.innerHTML = `
    <section class="page-header">
      <h1>${roundTitle(round)}</h1>
      ${
        isOpen
          ? `<p class="section-subtitle">Propón hasta ${MAX_PROPOSALS_PER_USER} libros para nuestra próxima lectura.</p>
             <span class="badge badge-accent">${countdownText(round.closesAt)}</span>
             <p class="empty-hint">Cierran el ${formatDate(round.closesAt)}</p>`
          : `<span class="badge badge-muted">Propuestas cerradas</span>
             <p class="empty-hint">El plazo terminó el ${formatDate(round.closesAt)}. Las administradoras harán el sorteo muy pronto.</p>`
      }
    </section>

    ${
      isOpen
        ? `
    <section class="card proposal-form-card">
      <h2>Proponer un libro</h2>
      <p class="proposal-count" id="my-count-label">Tus propuestas: 0 de ${MAX_PROPOSALS_PER_USER}</p>
      <form id="form-proposal" class="onboarding-form" novalidate>
        <div class="form-field">
          <label for="proposal-title">Título *</label>
          <input type="text" id="proposal-title" maxlength="150" autocomplete="off" />
        </div>
        <div class="form-field">
          <label for="proposal-author">Autor/a *</label>
          <input type="text" id="proposal-author" maxlength="100" autocomplete="off" />
        </div>
        <div class="form-field">
          <label for="proposal-genre">Género <span class="optional">(opcional)</span></label>
          <input type="text" id="proposal-genre" list="proposal-genre-options" maxlength="40" autocomplete="off" />
          <datalist id="proposal-genre-options">
            ${GENRES.filter((g) => g !== "Otro").map((g) => `<option value="${g}"></option>`).join("")}
          </datalist>
        </div>
        <p class="field-error" id="proposal-error" role="alert" hidden></p>
        <button type="submit" class="btn btn-primary btn-block">Proponer libro</button>
      </form>
      <p class="empty-hint" id="limit-reached-msg" hidden>Ya has utilizado tus ${MAX_PROPOSALS_PER_USER} propuestas.</p>
    </section>`
        : ""
    }

    <section class="proposals-list-section">
      <h2 id="proposals-count-heading">Libros propuestos</h2>
      <input type="search" id="search-proposals" class="search-input" placeholder="Buscar entre las propuestas..." />
      <div class="filter-chips">
        <button class="chip chip-active" type="button" data-sort="fecha">Más recientes</button>
        <button class="chip" type="button" data-sort="az">A-Z</button>
      </div>
      <div id="proposals-list"><div class="loading-spinner"></div></div>
    </section>
  `;

  let proposals = [];
  const errorEl = container.querySelector("#proposal-error");
  const showError = (msg) => {
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.hidden = !msg;
  };

  function updateCounters() {
    const mine = proposals.filter((p) => p.userId === state.user.uid).length;
    if (isOpen) {
      container.querySelector("#my-count-label").textContent = `Tus propuestas: ${mine} de ${MAX_PROPOSALS_PER_USER}`;
      const atLimit = mine >= MAX_PROPOSALS_PER_USER;
      container.querySelector("#form-proposal").hidden = atLimit;
      container.querySelector("#limit-reached-msg").hidden = !atLimit;
    }
    container.querySelector("#proposals-count-heading").textContent = `Libros propuestos (${proposals.length})`;
  }

  function renderList() {
    const term = normalizeBookText(searchTerm);
    let filtered = proposals.filter((p) => {
      if (!term) return true;
      return (p.normalizedTitle || "").includes(term) || (p.normalizedAuthor || "").includes(term);
    });
    filtered = [...filtered].sort((a, b) => {
      if (sortMode === "az") return a.title.localeCompare(b.title, "es");
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    });
    const listEl = container.querySelector("#proposals-list");
    if (!filtered.length) {
      listEl.innerHTML = `<p class="empty-hint">${
        proposals.length
          ? "No hay propuestas que coincidan con tu búsqueda."
          : "Todavía no hay propuestas. ¡Sé la primera!"
      }</p>`;
      return;
    }
    listEl.innerHTML = `<div class="opinions-list">${filtered
      .map((p) => proposalCardHtml(p, usersById[p.userId], isOpen))
      .join("")}</div>`;
    listEl.querySelectorAll("[data-delete-proposal]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar esta propuesta?")) return;
        btn.disabled = true;
        try {
          await deleteMyProposal(btn.dataset.deleteProposal, state.user.uid);
          showToast("Propuesta eliminada");
        } catch (err) {
          console.error(err);
          showToast("No se ha podido eliminar.", "error");
          btn.disabled = false;
        }
      });
    });
  }

  container.querySelector("#search-proposals").addEventListener(
    "input",
    debounce((e) => {
      searchTerm = e.target.value;
      renderList();
    }, 200)
  );

  container.querySelectorAll("[data-sort]").forEach((btn) => {
    btn.addEventListener("click", () => {
      sortMode = btn.dataset.sort;
      container.querySelectorAll("[data-sort]").forEach((b) => b.classList.remove("chip-active"));
      btn.classList.add("chip-active");
      renderList();
    });
  });

  container.querySelector("#form-proposal")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const submitBtn = form.querySelector("button[type=submit]");
    const title = container.querySelector("#proposal-title").value.trim();
    const author = container.querySelector("#proposal-author").value.trim();
    const genre = container.querySelector("#proposal-genre").value.trim();
    if (!title || !author) {
      showError("El título y el autor/a son obligatorios.");
      return;
    }
    if (!normalizeBookText(title) || !normalizeBookText(author)) {
      showError("El título y el autor/a deben contener letras o números.");
      return;
    }
    // Comprobación rápida con lo que ya se ve en pantalla (la definitiva
    // la hace la transacción en el servidor).
    const nt = normalizeBookText(title);
    const na = normalizeBookText(author);
    const existing = proposals.find((p) => p.normalizedTitle === nt && p.normalizedAuthor === na);
    if (existing) {
      showError("¡Este libro ya está entre las propuestas!");
      highlight(container, existing.id);
      return;
    }
    showError("");
    submitBtn.disabled = true;
    try {
      await submitProposal(round.id, state.user.uid, { title, author, genre });
      showToast("¡Propuesta añadida!", "success");
      form.reset();
    } catch (err) {
      if (err instanceof ProposalError && err.code === "DUPLICATE") {
        showError("¡Este libro ya está entre las propuestas!");
        const match = proposals.find((p) => p.normalizedTitle === nt && p.normalizedAuthor === na);
        if (match) highlight(container, match.id);
      } else if (err instanceof ProposalError && err.code === "LIMIT_REACHED") {
        showError(`Ya has utilizado tus ${MAX_PROPOSALS_PER_USER} propuestas.`);
      } else if (err instanceof ProposalError && err.code === "ROUND_CLOSED") {
        showToast("Las propuestas ya están cerradas.", "error");
        renderProposals(container);
      } else {
        console.error(err);
        // Las reglas rechazan duplicados y límites aunque el navegador se haya quedado atrás.
        showError("No se ha podido guardar. Puede que el libro ya esté propuesto o que hayas llegado al límite.");
      }
    } finally {
      submitBtn.disabled = false;
    }
  });

  const unsubscribe = listenToProposals(round.id, (updated) => {
    proposals = updated;
    updateCounters();
    renderList();
  });

  return () => unsubscribe();
}

async function renderClosedRound(container, round) {
  const [proposals, users, winnerBook] = await Promise.all([
    getProposalsForRound(round.id).catch(() => []),
    getAllUsers().catch(() => []),
    round.addedBookId ? getBook(round.addedBookId).catch(() => null) : Promise.resolve(null),
  ]);
  const usersById = Object.fromEntries(users.map((u) => [u.id, u]));
  const hasWinner = !!round.winnerProposalId;

  container.innerHTML = `
    <section class="page-header">
      <h1>${roundTitle(round)}</h1>
    </section>

    ${
      hasWinner
        ? `
      <section class="result-card result-card-winner">
        <p class="handwritten result-eyebrow">¡Tenemos próxima lectura!</p>
        <img class="result-cover" src="${escapeHtml(winnerBook?.coverURL || placeholderCover())}" alt="" ${
            winnerBook?.coverURL ? "" : 'style="display:none"'
          } />
        <h2 class="result-title">${escapeHtml(round.winnerBookTitle)}</h2>
        <p class="result-author">${escapeHtml(round.winnerBookAuthor || "")}</p>
        ${
          winnerBook
            ? `<button id="btn-view-winner" class="btn btn-primary btn-sm">Ver libro</button>`
            : ""
        }
      </section>
    `
        : `<div class="empty-state"><p>Las propuestas han finalizado${
            proposals.length ? "." : " sin ningún libro propuesto."
          }</p></div>`
    }

    ${
      proposals.length
        ? `
      <section class="proposals-list-section">
        <h2>Todas las propuestas (${proposals.length})</h2>
        <div class="opinions-list">${proposals
          .map((p) => proposalCardHtml(p, usersById[p.userId], false, p.id === round.winnerProposalId))
          .join("")}</div>
      </section>
    `
        : ""
    }
  `;

  container.querySelector("#btn-view-winner")?.addEventListener("click", () => navigate(`/book/${winnerBook.id}`));

  if (hasWinner) {
    maybeShowConfetti(round.id);
  }
}

function maybeShowConfetti(roundId) {
  const key = `nsc-confetti-${roundId}`;
  try {
    if (localStorage.getItem(key) === "1") return;
    localStorage.setItem(key, "1");
  } catch (_) {
    // localStorage no disponible (modo privado, etc.): mostramos el confeti igualmente.
  }
  confettiBurst();
}

function highlight(container, proposalId) {
  const el = container.querySelector(`[data-proposal-id="${proposalId}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("proposal-highlight");
  setTimeout(() => el.classList.remove("proposal-highlight"), 1800);
}

function proposalCardHtml(p, profile, canDeleteOwn, isWinner = false) {
  const isMine = p.userId === state.user.uid;
  return `
    <article class="proposal-card ${isMine ? "proposal-card-mine" : ""} ${isWinner ? "proposal-card-winner" : ""}" data-proposal-id="${escapeHtml(p.id)}">
      <div class="proposal-card-info">
        <strong>${escapeHtml(p.title)}</strong>
        <span>${escapeHtml(p.author)}${p.genre ? ` · ${escapeHtml(p.genre)}` : ""}</span>
        <span class="opinion-date">${
          profile ? `Propuesto por ${escapeHtml(profile.name || "alguien")}` : "Propuesto por una integrante"
        }${p.createdAt ? ` · ${formatDateShort(p.createdAt)}` : ""}</span>
      </div>
      ${
        isWinner
          ? `<span class="badge badge-star">Ganador</span>`
          : isMine && canDeleteOwn
          ? `<button class="btn btn-ghost btn-sm btn-danger" data-delete-proposal="${escapeHtml(p.id)}">Eliminar</button>`
          : isMine
          ? `<span class="badge badge-soft">Tu propuesta</span>`
          : ""
      }
    </article>
  `;
}

function countdownText(closesAt) {
  if (!closesAt?.toMillis) return "";
  const ms = closesAt.toMillis() - Date.now();
  if (ms <= 0) return "Cerrando...";
  const hours = ms / (1000 * 60 * 60);
  if (hours < 24) return "Últimas horas para proponer";
  const days = Math.ceil(hours / 24);
  return `Quedan ${days} día${days === 1 ? "" : "s"}`;
}
