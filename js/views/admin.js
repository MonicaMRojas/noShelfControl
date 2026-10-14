// ============================================================
// VISTA: Panel de administración (solo role === "admin")
// ============================================================
// Secciones: propuestas de lectura (rondas y sorteo), libros e integrantes.
// El acceso se comprueba aquí para no mostrar el panel a quien no
// corresponde, pero la seguridad real está en firestore.rules: aunque
// alguien manipulase el JavaScript, el servidor rechazaría las escrituras.
// ============================================================

import { state } from "../state.js";
import {
  getBooks,
  createBook,
  updateBook,
  deleteBook,
  setCurrentClubBook,
  getAllProposalRounds,
  getProposalsForRound,
  getAllUsers,
  getAllReviews,
  adminSetUserRole,
  adminCreateRound,
  adminCloseRoundNow,
  adminOpenRoundNow,
  adminUpdateRoundSchedule,
  adminSetRoundVisibility,
  adminSetWinnerManually,
  adminResetRound,
  adminDeleteRound,
  adminDeleteProposal,
  adminAddWinnerToLibrary,
  roundPhase,
  ProposalError,
} from "../db.js";
import { navigate } from "../router.js";
import {
  BOOK_STATUSES,
  GENRES,
  PROPOSAL_ROUND_DAYS,
  avatarHtml,
  compressImageToDataUrl,
  escapeHtml,
  formatDate,
  showToast,
  validateImageFile,
} from "../utils.js";
import { placeholderCover } from "./shared.js";

const PHASE_LABELS = {
  scheduled: { label: "Programada", cls: "badge-soft" },
  open: { label: "Abierta", cls: "badge-accent" },
  pending_draw: { label: "Pendiente de sorteo", cls: "badge-star" },
  closed: { label: "Cerrada", cls: "badge-muted" },
};

export async function renderAdmin(container, params = {}) {
  if (!state.isAdmin) {
    container.innerHTML = `<div class="empty-state"><p>Esta sección es solo para administradoras.</p></div>`;
    return;
  }

  container.innerHTML = `<div class="loading-spinner"></div>`;

  const [books, rounds, users, reviews] = await Promise.all([
    getBooks(),
    getAllProposalRounds().catch(() => []),
    getAllUsers(),
    getAllReviews().catch(() => []),
  ]);
  const editingBook = params.id ? books.find((b) => b.id === params.id) || null : null;
  const hasCurrentBook = books.some((b) => b.status === "leyendo_ahora");

  const latestRound = rounds[0] || null;
  const proposals = latestRound ? await getProposalsForRound(latestRound.id).catch(() => []) : [];
  const usersById = Object.fromEntries(users.map((u) => [u.id, u]));
  const phase = latestRound ? roundPhase(latestRound) : null;

  const refresh = () => renderAdmin(container, {});

  container.innerHTML = `
    <button class="btn-back" id="btn-back">← Volver</button>
    <section class="page-header">
      <h1>Administración</h1>
      <p class="section-subtitle">Libros, propuestas e integrantes del club</p>
      <div class="filter-chips">
        <button type="button" class="chip" data-jump="admin-proposals">Propuestas</button>
        <button type="button" class="chip" data-jump="admin-books">Libros</button>
        <button type="button" class="chip" data-jump="admin-members">Integrantes</button>
      </div>
    </section>

    ${
      phase === "pending_draw"
        ? `<section class="notice-card">
            <strong>Hay un sorteo pendiente.</strong>
            <p>La ronda "${escapeHtml(latestRound.title || "Propuestas")}" terminó el ${formatDate(
            latestRound.closesAt
          )} y las propuestas están bloqueadas. Puedes revisarlas y completar el sorteo cuando quieras.</p>
            <button class="btn btn-primary btn-sm" id="btn-draw-pending">Realizar sorteo ahora</button>
          </section>`
        : ""
    }

    <div id="admin-proposals">
      ${proposalsAdminSectionHtml(latestRound, phase, proposals, usersById, rounds.slice(1))}
    </div>

    <div id="admin-books">
      ${bookFormHtml(editingBook)}

      <section class="card admin-book-list">
        <h2>Todos los libros (${books.length})</h2>
        ${
          books.length
            ? books.map((b) => adminBookRowHtml(b)).join("")
            : `<p class="empty-hint">Todavía no hay libros. Añade el primero con el formulario de arriba.</p>`
        }
      </section>
    </div>

    <div id="admin-members">
      ${membersSectionHtml(users, reviews, latestRound)}
    </div>
  `;

  // ---- Navegación interna ----
  container.querySelector("#btn-back").addEventListener("click", () => navigate("/profile"));
  container.querySelectorAll("[data-jump]").forEach((btn) => {
    btn.addEventListener("click", () => {
      container.querySelector(`#${btn.dataset.jump}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  wireBookForm(container, editingBook, refresh);
  wireBookRows(container, refresh);
  wireProposalsAdmin(container, { latestRound, phase, hasCurrentBook, refresh });
  wireMembers(container, refresh);
}

// ============================================================
// LIBROS
// ============================================================

function bookFormHtml(editingBook) {
  const autoOn = editingBook ? editingBook.autoProposals !== false : true;
  return `
    <section class="card admin-form-card" id="book-form-card">
      <h2>${editingBook ? "Editar libro" : "Añadir libro"}</h2>
      <form id="form-book" class="onboarding-form" novalidate>
        <div class="photo-picker">
          <label for="cover-input" class="photo-preview cover-preview" id="cover-preview" ${
            editingBook?.coverURL ? `style="background-image:url('${escapeHtml(editingBook.coverURL)}')"` : ""
          }>
            ${editingBook?.coverURL ? "" : '<span class="photo-placeholder">Portada</span>'}
          </label>
          <input type="file" id="cover-input" accept="image/*" hidden />
        </div>

        <div class="form-field">
          <label for="cover-url">URL de la portada <span class="optional">(o elige un archivo tocando la imagen)</span></label>
          <input type="url" id="cover-url" inputmode="url" placeholder="https://..." value="${
            editingBook?.coverURL && !editingBook.coverURL.startsWith("data:")
              ? escapeHtml(editingBook.coverURL)
              : ""
          }" />
        </div>

        <div class="form-field">
          <label for="title">Título</label>
          <input type="text" id="title" maxlength="150" value="${escapeHtml(editingBook?.title || "")}" />
        </div>
        <div class="form-field">
          <label for="author">Autor/a</label>
          <input type="text" id="author" maxlength="100" value="${escapeHtml(editingBook?.author || "")}" />
        </div>
        <div class="form-field">
          <label for="genre">Género</label>
          <input type="text" id="genre" list="genre-options" maxlength="40" value="${escapeHtml(
            editingBook?.genre || ""
          )}" placeholder="Ej. Romantasy" />
          <datalist id="genre-options">
            ${GENRES.filter((g) => g !== "Otro").map((g) => `<option value="${g}"></option>`).join("")}
          </datalist>
        </div>
        <div class="form-field">
          <label for="synopsis">Sinopsis</label>
          <textarea id="synopsis" rows="4" maxlength="1000">${escapeHtml(editingBook?.synopsis || "")}</textarea>
        </div>
        <div class="form-field">
          <label for="pages">Número de páginas</label>
          <input type="number" id="pages" min="1" max="5000" inputmode="numeric" placeholder="Ej. 320" value="${
            editingBook?.pages || ""
          }" />
        </div>
        <div class="form-row">
          <div class="form-field">
            <label for="readingDate">Fecha de lectura</label>
            <input type="date" id="readingDate" value="${toDateInputValue(editingBook?.readingDate)}" />
          </div>
          <div class="form-field">
            <label for="meetingDate">Fecha de reunión</label>
            <input type="date" id="meetingDate" value="${toDateInputValue(editingBook?.meetingDate)}" />
          </div>
        </div>
        <div class="form-field">
          <label for="status">Estado</label>
          <select id="status">
            ${Object.entries(BOOK_STATUSES)
              .map(
                ([key, label]) =>
                  `<option value="${key}" ${
                    (editingBook?.status || "proximamente") === key ? "selected" : ""
                  }>${label}</option>`
              )
              .join("")}
          </select>
        </div>
        <label class="checkbox-field">
          <input type="checkbox" id="autoProposals" ${autoOn ? "checked" : ""} />
          <span>Abrir las propuestas automáticamente al llegar la fecha de reunión de este libro (cuando sea el libro actual)</span>
        </label>

        <p class="field-error" id="book-error" role="alert" hidden></p>
        <div class="form-row">
          <button type="submit" class="btn btn-primary btn-block">${
            editingBook ? "Guardar cambios" : "Crear libro"
          }</button>
          ${editingBook ? '<button type="button" id="btn-cancel-edit" class="btn btn-ghost btn-block">Cancelar</button>' : ""}
        </div>
      </form>
    </section>
  `;
}

function wireBookForm(container, editingBook, refresh) {
  let coverDataUrl = null;
  const coverInput = container.querySelector("#cover-input");
  const coverPreview = container.querySelector("#cover-preview");
  const coverUrlInput = container.querySelector("#cover-url");
  const errorEl = container.querySelector("#book-error");
  const showError = (msg) => {
    errorEl.textContent = msg;
    errorEl.hidden = !msg;
  };

  coverUrlInput.addEventListener("input", () => {
    const url = coverUrlInput.value.trim();
    coverDataUrl = null;
    if (/^https?:\/\//i.test(url)) {
      coverPreview.style.backgroundImage = `url("${url.replace(/"/g, "%22")}")`;
      coverPreview.innerHTML = "";
    }
  });

  coverInput.addEventListener("change", async () => {
    const file = coverInput.files[0];
    if (!file) return;
    const check = validateImageFile(file, 8);
    if (!check.valid) {
      showToast(check.error, "error");
      coverInput.value = "";
      return;
    }
    coverPreview.innerHTML = '<span class="photo-placeholder">Procesando...</span>';
    try {
      coverDataUrl = await compressImageToDataUrl(file, { maxDim: 600, maxBytes: 220 * 1024 });
      coverPreview.style.backgroundImage = `url(${coverDataUrl})`;
      coverPreview.innerHTML = "";
      coverUrlInput.value = "";
    } catch (err) {
      console.error(err);
      showToast("No se ha podido procesar la portada.", "error");
      coverInput.value = "";
    }
  });

  container.querySelector("#btn-cancel-edit")?.addEventListener("click", () => navigate("/admin"));

  container.querySelector("#form-book").addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = e.currentTarget.querySelector("button[type=submit]");

    const title = container.querySelector("#title").value.trim();
    const author = container.querySelector("#author").value.trim();
    const urlValue = coverUrlInput.value.trim();
    if (!title || !author) {
      showError("El título y el autor/a son obligatorios.");
      return;
    }
    if (urlValue && !/^https?:\/\/\S+$/i.test(urlValue)) {
      showError("La URL de la portada debe empezar por http:// o https://");
      return;
    }
    const pagesRaw = container.querySelector("#pages").value;
    const pages = pagesRaw ? Number(pagesRaw) : null;
    if (pages !== null && (!Number.isInteger(pages) || pages < 1 || pages > 5000)) {
      showError("El número de páginas debe estar entre 1 y 5000.");
      return;
    }
    showError("");

    // Prioridad: archivo recién elegido > URL escrita > portada que ya tenía.
    let coverURL = coverDataUrl || urlValue || "";
    if (!coverDataUrl && !urlValue && editingBook?.coverURL && editingBook.coverURL.startsWith("data:")) {
      coverURL = editingBook.coverURL;
    }

    const data = {
      title,
      author,
      genre: container.querySelector("#genre").value.trim(),
      synopsis: container.querySelector("#synopsis").value.trim(),
      pages,
      coverURL,
      readingDate: container.querySelector("#readingDate").value || null,
      meetingDate: container.querySelector("#meetingDate").value || null,
      status: container.querySelector("#status").value,
      autoProposals: container.querySelector("#autoProposals").checked,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "Guardando...";
    try {
      let savedId = editingBook?.id;
      if (editingBook) {
        await updateBook(editingBook.id, data);
      } else {
        savedId = await createBook(data);
      }
      // Solo puede haber un "libro actual": si este pasa a serlo, los demás se finalizan.
      if (data.status === "leyendo_ahora") {
        await setCurrentClubBook(savedId);
      }
      showToast(editingBook ? "Libro actualizado" : "Libro creado", "success");
      if (editingBook) navigate("/admin");
      else refresh();
    } catch (err) {
      console.error(err);
      showError("No se ha podido guardar el libro.");
      submitBtn.disabled = false;
      submitBtn.textContent = editingBook ? "Guardar cambios" : "Crear libro";
    }
  });
}

function adminBookRowHtml(book) {
  const statusLabel = BOOK_STATUSES[book.status] || book.status;
  return `
    <article class="admin-book-row">
      <img class="mini-cover" src="${escapeHtml(book.coverURL || placeholderCover())}" alt="" />
      <div class="admin-book-row-info">
        <strong>${escapeHtml(book.title)}</strong>
        <span>${escapeHtml(book.author)}</span>
        <span class="badge ${book.status === "leyendo_ahora" ? "badge-accent" : "badge-soft"}">${escapeHtml(statusLabel)}</span>
        ${book.meetingDate ? `<span class="admin-book-meta">Reunión: ${formatDate(book.meetingDate)}</span>` : ""}
      </div>
      <div class="admin-book-row-actions">
        ${
          book.status !== "leyendo_ahora"
            ? `<button class="btn btn-outline btn-sm" data-current-id="${book.id}">Marcar actual</button>`
            : ""
        }
        <button class="btn btn-ghost btn-sm" data-edit-id="${book.id}">Editar</button>
        <button class="btn btn-ghost btn-sm btn-danger" data-delete-id="${book.id}">Eliminar</button>
      </div>
    </article>
  `;
}

function wireBookRows(container, refresh) {
  container.querySelectorAll("[data-edit-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigate(`/admin/book/${btn.dataset.editId}`);
    });
  });

  container.querySelectorAll("[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Seguro que quieres eliminar este libro? Esta acción no se puede deshacer.")) return;
      try {
        await deleteBook(btn.dataset.deleteId);
        showToast("Libro eliminado");
        refresh();
      } catch (err) {
        console.error(err);
        showToast("No se ha podido eliminar el libro.", "error");
      }
    });
  });

  container.querySelectorAll("[data-current-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await setCurrentClubBook(btn.dataset.currentId);
        showToast("Libro marcado como lectura actual del club");
        refresh();
      } catch (err) {
        console.error(err);
        showToast("No se ha podido cambiar el libro actual.", "error");
      }
    });
  });
}

// ============================================================
// PROPUESTAS DE LECTURA
// ============================================================

function createRoundFormHtml(hasCurrentBook) {
  return `
    <form id="form-create-round" class="onboarding-form" novalidate>
      <div class="form-field">
        <label for="round-title">Título de la ronda <span class="optional">(opcional)</span></label>
        <input type="text" id="round-title" maxlength="80" placeholder="¿Qué leemos después?" />
      </div>
      <div class="form-field">
        <label>Apertura</label>
        <div class="status-selector" id="round-start-mode">
          <button type="button" class="status-btn status-active" data-start="now">Abrir ahora</button>
          <button type="button" class="status-btn" data-start="scheduled">Programar</button>
        </div>
      </div>
      <div class="form-row" id="round-schedule-fields" hidden>
        <div class="form-field">
          <label for="round-opens">Se abre</label>
          <input type="datetime-local" id="round-opens" />
        </div>
        <div class="form-field">
          <label for="round-closes">Se cierra</label>
          <input type="datetime-local" id="round-closes" />
        </div>
      </div>
      <div class="form-field" id="round-days-field">
        <label for="round-days">Duración (días)</label>
        <input type="number" id="round-days" min="1" max="60" inputmode="numeric" value="${PROPOSAL_ROUND_DAYS}" />
      </div>
      <label class="checkbox-field">
        <input type="checkbox" id="round-visible" checked />
        <span>Mostrar la sección "Propuestas" a las integrantes</span>
      </label>
      ${
        hasCurrentBook
          ? ""
          : `<p class="empty-hint">No hay libro actual marcado: la ronda no estará asociada a ninguna lectura, pero funciona igual.</p>`
      }
      <p class="field-error" id="create-round-error" role="alert" hidden></p>
      <button type="submit" class="btn btn-primary btn-block">Crear ronda</button>
    </form>
  `;
}

function proposalsAdminSectionHtml(round, phase, proposals, usersById, olderRounds) {
  if (!round) {
    return `
      <section class="card admin-form-card">
        <h2>Propuestas de lectura</h2>
        <p class="empty-hint">Todavía no hay ninguna ronda. Crea la primera para que las integrantes propongan libros.</p>
        ${createRoundFormHtml(true)}
      </section>
    `;
  }

  const phaseInfo = PHASE_LABELS[phase];
  const participantsCount = new Set(proposals.map((p) => p.userId)).size;

  return `
    <section class="card admin-form-card">
      <h2>Propuestas de lectura</h2>
      <p class="admin-round-title">${escapeHtml(round.title || "Ronda de propuestas")}</p>
      <div class="admin-proposals-summary">
        <span class="badge ${phaseInfo.cls}">${phaseInfo.label}</span>
        <span class="badge ${round.visible ? "badge-soft" : "badge-muted"}">${
    round.visible ? "Sección activada" : "Sección desactivada"
  }</span>
        ${round.createdBy === "auto" ? `<span class="badge badge-muted">Automática</span>` : ""}
      </div>
      <p class="empty-hint">Abre: ${formatDateTime(round.opensAt)} · Cierra: ${formatDateTime(round.closesAt)}</p>
      <p class="empty-hint">${proposals.length} propuesta${proposals.length === 1 ? "" : "s"} · ${participantsCount} persona${
    participantsCount === 1 ? "" : "s"
  } ${participantsCount === 1 ? "ha" : "han"} participado</p>
      ${
        round.winnerProposalId
          ? `<p class="admin-winner">Ganador: <strong>${escapeHtml(round.winnerBookTitle)}</strong> — ${escapeHtml(
              round.winnerBookAuthor || ""
            )}</p>`
          : phase === "closed"
          ? `<p class="empty-hint">La ronda se cerró sin ganador (no había propuestas).</p>`
          : ""
      }

      <div class="admin-proposals-actions">
        <button class="btn btn-outline btn-sm" id="btn-toggle-visibility">${
          round.visible ? "Desactivar sección" : "Activar sección"
        }</button>
        ${
          phase === "open"
            ? `<button class="btn btn-primary btn-sm" id="btn-close-round">Cerrar ahora y sortear</button>`
            : ""
        }
        ${
          phase === "pending_draw"
            ? `<button class="btn btn-primary btn-sm" id="btn-close-round">Realizar sorteo</button>`
            : ""
        }
        ${
          phase === "scheduled"
            ? `<button class="btn btn-primary btn-sm" id="btn-open-now">Abrir ahora</button>`
            : ""
        }
        ${
          phase === "closed" || phase === "pending_draw"
            ? `<button class="btn btn-outline btn-sm" id="btn-reopen-round">Reabrir ${PROPOSAL_ROUND_DAYS} días</button>`
            : ""
        }
        ${
          phase !== "closed"
            ? `<button class="btn btn-outline btn-sm" id="btn-edit-schedule">Programar fechas</button>`
            : ""
        }
        ${
          round.winnerProposalId && !round.addedToLibrary
            ? `<button class="btn btn-primary btn-sm" id="btn-add-to-library">Añadir ganador a la biblioteca</button>`
            : ""
        }
        ${round.addedToLibrary ? `<span class="badge badge-soft">Ya está en la biblioteca</span>` : ""}
        <button class="btn btn-ghost btn-sm btn-danger" id="btn-reset-round">Reiniciar ronda</button>
        <button class="btn btn-ghost btn-sm btn-danger" id="btn-delete-round">Eliminar ronda</button>
      </div>

      <form id="form-schedule" class="onboarding-form admin-inline-form" hidden novalidate>
        <div class="form-field">
          <label for="schedule-title">Título</label>
          <input type="text" id="schedule-title" maxlength="80" value="${escapeHtml(round.title || "")}" />
        </div>
        <div class="form-row">
          <div class="form-field">
            <label for="schedule-opens">Se abre</label>
            <input type="datetime-local" id="schedule-opens" value="${toLocalInput(round.opensAt)}" />
          </div>
          <div class="form-field">
            <label for="schedule-closes">Se cierra</label>
            <input type="datetime-local" id="schedule-closes" value="${toLocalInput(round.closesAt)}" />
          </div>
        </div>
        <p class="field-error" id="schedule-error" role="alert" hidden></p>
        <div class="form-row">
          <button type="submit" class="btn btn-primary btn-block">Guardar fechas</button>
          <button type="button" class="btn btn-ghost btn-block" id="btn-cancel-schedule">Cancelar</button>
        </div>
      </form>

      ${
        proposals.length
          ? `<div class="admin-book-list admin-proposals-list">${proposals
              .map((p) => adminProposalRowHtml(p, usersById[p.userId], round, phase))
              .join("")}</div>`
          : `<p class="empty-hint">Todavía no hay propuestas en esta ronda.</p>`
      }
    </section>

    ${
      phase === "closed"
        ? `<section class="card admin-form-card">
            <h2>Nueva ronda</h2>
            ${createRoundFormHtml(true)}
          </section>`
        : ""
    }

    ${
      olderRounds.length
        ? `<section class="card admin-book-list">
            <h2>Rondas anteriores (${olderRounds.length})</h2>
            ${olderRounds
              .map(
                (r) => `
              <article class="admin-book-row">
                <div class="admin-book-row-info">
                  <strong>${escapeHtml(r.title || "Ronda de propuestas")}</strong>
                  <span>${
                    r.winnerBookTitle
                      ? `Ganador: ${escapeHtml(r.winnerBookTitle)}`
                      : "Sin ganador"
                  }</span>
                  <span class="admin-book-meta">Cerró: ${formatDate(r.closesAt)}</span>
                </div>
              </article>`
              )
              .join("")}
          </section>`
        : ""
    }
  `;
}

function adminProposalRowHtml(proposal, profile, round, phase) {
  const isWinner = round.winnerProposalId === proposal.id;
  return `
    <article class="admin-book-row">
      <div class="admin-book-row-info">
        <strong>${escapeHtml(proposal.title)} ${isWinner ? `<span class="badge badge-star">Ganador</span>` : ""}</strong>
        <span>${escapeHtml(proposal.author)}${proposal.genre ? ` · ${escapeHtml(proposal.genre)}` : ""}</span>
        <span class="admin-book-meta">Propuesto por ${escapeHtml(
          profile ? `${profile.name || ""} ${profile.surname || ""}`.trim() : "una integrante"
        )}</span>
      </div>
      <div class="admin-book-row-actions">
        ${
          phase === "closed" && !isWinner
            ? `<button class="btn btn-outline btn-sm" data-set-winner="${escapeHtml(proposal.id)}">Elegir como ganador</button>`
            : ""
        }
        <button class="btn btn-ghost btn-sm btn-danger" data-delete-proposal-admin="${escapeHtml(proposal.id)}">Eliminar</button>
      </div>
    </article>
  `;
}

function readDateTime(input) {
  if (!input.value) return null;
  const d = new Date(input.value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function wireProposalsAdmin(container, { latestRound, phase, hasCurrentBook, refresh }) {
  // ---- Crear ronda (formulario sin ronda previa o "Nueva ronda") ----
  const createForm = container.querySelector("#form-create-round");
  if (createForm) {
    let startMode = "now";
    const scheduleFields = createForm.querySelector("#round-schedule-fields");
    const daysField = createForm.querySelector("#round-days-field");
    const errorEl = createForm.querySelector("#create-round-error");
    const showError = (msg) => {
      errorEl.textContent = msg;
      errorEl.hidden = !msg;
    };

    createForm.querySelector("#round-start-mode").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-start]");
      if (!btn) return;
      startMode = btn.dataset.start;
      createForm
        .querySelectorAll("#round-start-mode .status-btn")
        .forEach((b) => b.classList.toggle("status-active", b === btn));
      scheduleFields.hidden = startMode !== "scheduled";
      daysField.hidden = startMode === "scheduled";
    });

    createForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = createForm.querySelector("button[type=submit]");
      const options = {
        title: createForm.querySelector("#round-title").value,
        visible: createForm.querySelector("#round-visible").checked,
      };
      if (startMode === "scheduled") {
        const opens = readDateTime(createForm.querySelector("#round-opens"));
        const closes = readDateTime(createForm.querySelector("#round-closes"));
        if (!opens || !closes) {
          showError("Indica la fecha de apertura y la de cierre.");
          return;
        }
        if (closes <= opens) {
          showError("El cierre debe ser posterior a la apertura.");
          return;
        }
        options.opensAt = opens;
        options.closesAt = closes;
      } else {
        const days = Number(createForm.querySelector("#round-days").value);
        if (!Number.isInteger(days) || days < 1 || days > 60) {
          showError("La duración debe estar entre 1 y 60 días.");
          return;
        }
        options.days = days;
      }
      showError("");
      submitBtn.disabled = true;
      try {
        await adminCreateRound(state.user.uid, options);
        showToast("Ronda de propuestas creada", "success");
        refresh();
      } catch (err) {
        console.error(err);
        showError("No se ha podido crear la ronda.");
        submitBtn.disabled = false;
      }
    });
  }

  if (!latestRound) return;

  const run = async (fn, okMsg, errMsg) => {
    try {
      await fn();
      if (okMsg) showToast(okMsg);
      refresh();
    } catch (err) {
      console.error(err);
      showToast(errMsg, "error");
    }
  };

  const drawNow = async (btn) => {
    if (!confirm("¿Cerrar la ronda y sortear el libro ganador? El resultado quedará guardado y lo verán todas.")) return;
    if (btn) btn.disabled = true;
    await run(
      async () => {
        const result = await adminCloseRoundNow(latestRound.id);
        if (result?.alreadyClosed) showToast("Esta ronda ya estaba cerrada: no se ha repetido el sorteo.");
        else if (result?.noProposals) showToast("Ronda cerrada: no había propuestas.");
        else showToast("¡Sorteo realizado!", "success");
      },
      null,
      "No se ha podido realizar el sorteo."
    );
  };

  container.querySelector("#btn-close-round")?.addEventListener("click", (e) => drawNow(e.currentTarget));
  container.querySelector("#btn-draw-pending")?.addEventListener("click", (e) => drawNow(e.currentTarget));

  container.querySelector("#btn-toggle-visibility")?.addEventListener("click", () =>
    run(
      () => adminSetRoundVisibility(latestRound.id, !latestRound.visible),
      latestRound.visible ? "Sección desactivada (las propuestas se conservan)" : "Sección activada",
      "No se ha podido cambiar la visibilidad."
    )
  );

  container.querySelector("#btn-open-now")?.addEventListener("click", () =>
    run(() => adminOpenRoundNow(latestRound.id), "Ronda abierta", "No se ha podido abrir la ronda.")
  );

  container.querySelector("#btn-reopen-round")?.addEventListener("click", () => {
    const warn = latestRound.winnerProposalId
      ? "Se borrará el ganador actual y se abrirá la ronda durante 7 días más. ¿Continuar?"
      : "Se abrirá la ronda durante 7 días más. ¿Continuar?";
    if (!confirm(warn)) return;
    run(() => adminOpenRoundNow(latestRound.id), "Ronda reabierta", "No se ha podido reabrir la ronda.");
  });

  // ---- Programar fechas ----
  const scheduleForm = container.querySelector("#form-schedule");
  container.querySelector("#btn-edit-schedule")?.addEventListener("click", () => {
    scheduleForm.hidden = !scheduleForm.hidden;
  });
  container.querySelector("#btn-cancel-schedule")?.addEventListener("click", () => {
    scheduleForm.hidden = true;
  });
  scheduleForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = scheduleForm.querySelector("#schedule-error");
    const opens = readDateTime(scheduleForm.querySelector("#schedule-opens"));
    const closes = readDateTime(scheduleForm.querySelector("#schedule-closes"));
    if (!opens || !closes || closes <= opens) {
      errorEl.textContent = "Indica fechas válidas: el cierre debe ser posterior a la apertura.";
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;
    await run(
      () =>
        adminUpdateRoundSchedule(latestRound.id, {
          opensAt: opens,
          closesAt: closes,
          title: scheduleForm.querySelector("#schedule-title").value,
        }),
      "Fechas guardadas",
      "No se han podido guardar las fechas."
    );
  });

  container.querySelector("#btn-add-to-library")?.addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    try {
      await adminAddWinnerToLibrary(latestRound);
      showToast("Libro añadido a la biblioteca como \"Próximamente\"", "success");
    } catch (err) {
      if (err instanceof ProposalError && err.code === "ALREADY_ADDED") {
        showToast("Este libro ya estaba en la biblioteca.");
      } else {
        console.error(err);
        showToast("No se ha podido añadir el libro.", "error");
      }
    }
    refresh();
  });

  container.querySelector("#btn-reset-round")?.addEventListener("click", () => {
    if (
      !confirm(
        "Esto eliminará TODAS las propuestas de esta ronda y la reabrirá desde cero (7 días). ¿Seguro que quieres continuar?"
      )
    )
      return;
    run(() => adminResetRound(latestRound.id), "Ronda reiniciada", "No se ha podido reiniciar la ronda.");
  });

  container.querySelector("#btn-delete-round")?.addEventListener("click", () => {
    if (
      !confirm(
        "Esto eliminará la ronda y TODAS sus propuestas definitivamente. Si quieres conservarlas, usa \"Desactivar sección\". ¿Eliminar?"
      )
    )
      return;
    run(() => adminDeleteRound(latestRound), "Ronda eliminada", "No se ha podido eliminar la ronda.");
  });

  container.querySelectorAll("[data-set-winner]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("¿Elegir esta propuesta como libro ganador?")) return;
      run(
        () => adminSetWinnerManually(latestRound.id, btn.dataset.setWinner),
        "Ganador actualizado",
        "No se ha podido cambiar el ganador."
      );
    });
  });

  container.querySelectorAll("[data-delete-proposal-admin]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("¿Eliminar esta propuesta?")) return;
      run(
        () => adminDeleteProposal(btn.dataset.deleteProposalAdmin),
        "Propuesta eliminada",
        "No se ha podido eliminar la propuesta."
      );
    });
  });
}

// ============================================================
// INTEGRANTES
// ============================================================

function membersSectionHtml(users, reviews, latestRound) {
  const readByUser = {};
  const reviewedByUser = {};
  for (const r of reviews) {
    if (r.readingStatus === "leido") readByUser[r.userId] = (readByUser[r.userId] || 0) + 1;
    if (typeof r.rating === "number" && r.rating > 0) reviewedByUser[r.userId] = (reviewedByUser[r.userId] || 0) + 1;
  }
  const counts = latestRound?.proposalCounts || {};
  const sorted = [...users].sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"));

  return `
    <section class="card admin-book-list">
      <h2>Integrantes (${users.length})</h2>
      ${
        sorted.length
          ? sorted
              .map((u) => {
                const isMe = u.id === state.user.uid;
                const isAdminRole = u.role === "admin";
                return `
          <article class="admin-book-row">
            ${avatarHtml(u, 44)}
            <div class="admin-book-row-info">
              <strong>${escapeHtml(u.name || "")} ${escapeHtml(u.surname || "")}</strong>
              <span class="badge ${isAdminRole ? "badge-accent" : "badge-soft"}">${
                  isAdminRole ? "Administradora" : "Integrante"
                }</span>
              <span class="admin-book-meta">${readByUser[u.id] || 0} leídos · ${reviewedByUser[u.id] || 0} valoraciones${
                  latestRound ? ` · ${counts[u.id] || 0} propuestas` : ""
                }</span>
              ${u.createdAt ? `<span class="admin-book-meta">Desde ${formatDate(u.createdAt)}</span>` : ""}
            </div>
            <div class="admin-book-row-actions">
              ${
                isMe
                  ? `<span class="badge badge-muted">Tú</span>`
                  : `<button class="btn btn-outline btn-sm" data-role-user="${u.id}" data-role-to="${
                      isAdminRole ? "member" : "admin"
                    }" data-role-name="${escapeHtml(u.name || "")}">${
                      isAdminRole ? "Quitar administración" : "Hacer administradora"
                    }</button>`
              }
            </div>
          </article>`;
              })
              .join("")
          : `<p class="empty-hint">Todavía no hay integrantes.</p>`
      }
    </section>
  `;
}

function wireMembers(container, refresh) {
  container.querySelectorAll("[data-role-user]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const toAdmin = btn.dataset.roleTo === "admin";
      const name = btn.dataset.roleName || "esta integrante";
      const msg = toAdmin
        ? `¿Dar permisos de administración a ${name}? Podrá gestionar libros, propuestas y roles.`
        : `¿Quitar los permisos de administración a ${name}?`;
      if (!confirm(msg)) return;
      btn.disabled = true;
      try {
        await adminSetUserRole(btn.dataset.roleUser, btn.dataset.roleTo);
        showToast(toAdmin ? "Ahora es administradora" : "Permisos de administración retirados");
        refresh();
      } catch (err) {
        console.error(err);
        showToast("No se ha podido cambiar el rol.", "error");
        btn.disabled = false;
      }
    });
  });
}

// ============================================================
// Utilidades de fechas
// ============================================================

function toDateInputValue(value) {
  if (!value) return "";
  // Ya viene como "YYYY-MM-DD" (así es como lo guardamos desde <input type="date">).
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Timestamp de Firestore -> "YYYY-MM-DDTHH:mm" en hora local, para <input type="datetime-local">. */
function toLocalInput(value) {
  if (!value?.toDate) return "";
  const d = value.toDate();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateTime(value) {
  if (!value?.toDate) return "—";
  return value.toDate().toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
