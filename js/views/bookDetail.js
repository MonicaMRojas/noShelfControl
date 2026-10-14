// ============================================================
// VISTA: Ficha del libro (estado de lectura, progreso y reseñas)
// ============================================================

import { state } from "../state.js";
import {
  getBook,
  getReview,
  upsertReview,
  getReviewsForBook,
  getUserProfile,
  averageRating,
  updateReadingProgress,
} from "../db.js";
import { navigate } from "../router.js";
import {
  BOOK_STATUSES,
  avatarHtml,
  clampPercentage,
  createStarRatingInput,
  escapeHtml,
  formatDate,
  percentageFromPage,
  readingProgressBarHtml,
  showToast,
  starsDisplayHtml,
  heartBurst,
} from "../utils.js";
import { placeholderCover } from "./shared.js";

const STATUS_OPTIONS = [
  { key: "pendiente", label: "Pendiente" },
  { key: "leyendo", label: "Leyendo" },
  { key: "leido", label: "Leído" },
];

export async function renderBookDetail(container, { id }) {
  container.innerHTML = `<div class="loading-spinner"></div>`;

  const book = await getBook(id);
  if (!book) {
    container.innerHTML = `
      <button class="btn-back" id="btn-back">← Volver</button>
      <div class="empty-state"><p>Este libro ya no existe.</p></div>`;
    container.querySelector("#btn-back").addEventListener("click", () => navigate("/library"));
    return;
  }

  const [myReview, allReviews] = await Promise.all([
    getReview(state.user.uid, id),
    getReviewsForBook(id),
  ]);

  const avg = averageRating(allReviews);
  const ratingsCount = allReviews.filter((r) => typeof r.rating === "number" && r.rating > 0).length;
  const readersCount = allReviews.filter((r) => r.readingStatus === "leido").length;

  const reviewersById = {};
  await Promise.all(
    [...new Set(allReviews.map((r) => r.userId))].map(async (uid) => {
      reviewersById[uid] = uid === state.user.uid ? state.profile : await getUserProfile(uid);
    })
  );

  const otherReviews = allReviews
    .filter((r) => r.userId !== state.user.uid && (r.comment || r.rating))
    .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));

  const statusLabel = BOOK_STATUSES[book.status] || "";

  container.innerHTML = `
    <button class="btn-back" id="btn-back">← Volver</button>

    <section class="book-detail-header">
      <img class="book-detail-cover" src="${escapeHtml(
        book.coverURL || placeholderCover()
      )}" alt="Portada de ${escapeHtml(book.title)}" onerror="this.onerror=null;this.src='${placeholderCover()}'" />
      <div class="book-detail-info">
        <h1>${escapeHtml(book.title)}</h1>
        <p class="book-author">${escapeHtml(book.author)}</p>
        <div class="badge-row">
          ${book.genre ? `<span class="badge badge-soft">${escapeHtml(book.genre)}</span>` : ""}
          ${statusLabel ? `<span class="badge badge-accent">${escapeHtml(statusLabel)}</span>` : ""}
        </div>
        ${book.readingDate ? `<p class="book-meta">Lectura: ${formatDate(book.readingDate)}</p>` : ""}
        ${book.meetingDate ? `<p class="book-meta">Reunión: ${formatDate(book.meetingDate)}</p>` : ""}
        ${book.pages ? `<p class="book-meta">${book.pages} páginas</p>` : ""}
        ${
          ratingsCount
            ? `<p class="book-meta book-avg">${starsDisplayHtml(avg, 16)} <strong>${avg
                .toFixed(1)
                .replace(".", ",")}</strong></p>`
            : ""
        }
      </div>
    </section>

    ${book.synopsis ? `<section class="book-synopsis"><h2>Sinopsis</h2><p>${escapeHtml(book.synopsis)}</p></section>` : ""}

    <section class="my-reading-section card">
      <h2>Tu lectura</h2>
      <div class="status-selector" id="status-selector">
        ${STATUS_OPTIONS.map(
          (s) =>
            `<button type="button" class="status-btn ${
              myReview?.readingStatus === s.key ? "status-active" : ""
            }" data-status="${s.key}">${s.label}</button>`
        ).join("")}
      </div>

      <div id="rating-section" class="rating-section" ${
        myReview?.readingStatus === "leido" ? "" : "hidden"
      }>
        <label>Tu puntuación</label>
        <div id="star-input" class="stars-input-wrap"></div>

        <label for="comment">¿Qué te ha parecido? <span class="optional">(opcional)</span></label>
        <textarea id="comment" rows="4" maxlength="600" placeholder="Cuéntanos qué tal...">${escapeHtml(
          myReview?.comment || ""
        )}</textarea>

        <button id="btn-save-review" class="btn btn-primary btn-block">Guardar opinión</button>
      </div>
    </section>

    ${readingProgressCardHtml(book, myReview)}

    <section class="club-opinions card">
      <h2>¿Qué dice el club?</h2>
      <div class="club-summary">
        <span class="club-avg">${starsDisplayHtml(avg, 20)} <strong>${avg
    .toFixed(1)
    .replace(".", ",")} / 5</strong></span>
        <span class="club-readers">${readersCount} lectora${readersCount === 1 ? "" : "s"}</span>
      </div>
      ${
        otherReviews.length
          ? `<div class="opinions-list">${otherReviews
              .map((r) => clubOpinionHtml(r, reviewersById[r.userId]))
              .join("")}</div>`
          : `<p class="empty-hint">Todavía nadie ha dejado su opinión. ¡Anímate!</p>`
      }
    </section>
  `;

  container.querySelector("#btn-back").addEventListener("click", () => history.back());

  const starInputEl = container.querySelector("#star-input");
  const starRating = createStarRatingInput(starInputEl, { initial: myReview?.rating || 0 });

  container.querySelector("#status-selector").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-status]");
    if (!btn) return;
    const newStatus = btn.dataset.status;
    if (newStatus === myReview?.readingStatus) return;
    const payload = { readingStatus: newStatus };
    if (newStatus === "leido") {
      payload.progressPercentage = 100;
    }
    try {
      await upsertReview(state.user.uid, id, payload);
    } catch (err) {
      console.error(err);
      showToast("No se ha podido actualizar el estado.", "error");
      return;
    }
    if (newStatus === "leido") {
      heartBurst(btn);
      showToast("¡Marcado como leído! Ya puedes puntuarlo.");
    } else {
      showToast("Estado actualizado");
    }
    renderBookDetail(container, { id });
  });

  container.querySelector("#btn-save-review")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const rating = starRating.getValue();
    const comment = container.querySelector("#comment").value.trim();
    if (!rating) {
      showToast("Elige una puntuación antes de guardar.", "error");
      return;
    }
    btn.disabled = true;
    try {
      await upsertReview(state.user.uid, id, {
        readingStatus: "leido",
        progressPercentage: 100,
        rating,
        comment,
      });
      heartBurst(btn);
      showToast("¡Opinión guardada! Gracias por compartirla.");
      renderBookDetail(container, { id });
    } catch (err) {
      console.error(err);
      showToast("No se ha podido guardar tu opinión.", "error");
      btn.disabled = false;
    }
  });

  wireReadingProgress(container, { id, book });

  container.querySelectorAll("[data-user-id]").forEach((el) => {
    el.addEventListener("click", () => navigate(`/user/${el.dataset.userId}`));
  });
}

// ---------------- Progreso de lectura ----------------

function progressHintText(pct) {
  return `Vas por el ${pct} %`;
}

function readingProgressCardHtml(book, myReview) {
  const status = myReview?.readingStatus;
  if (!status || status === "pendiente") return "";

  if (status === "leido") {
    return `
      <section class="card reading-progress-card">
        <h2>¿Por dónde vas?</h2>
        ${readingProgressBarHtml(100)}
        <p class="empty-hint">Has terminado este libro. ¡Enhorabuena!</p>
      </section>
    `;
  }

  const progressType = myReview?.progressType === "page" ? "page" : "percentage";
  const pct = clampPercentage(myReview?.progressPercentage || 0);
  const currentPage = myReview?.currentPage ?? "";
  const totalPages = book.pages || myReview?.totalPages || "";

  return `
    <section class="card reading-progress-card" id="reading-progress-card">
      <h2>¿Por dónde vas?</h2>

      <div class="progress-current">
        ${readingProgressBarHtml(pct)}
        <p class="progress-current-hint" id="progress-current-hint">${progressHintText(pct)}</p>
      </div>

      <div class="progress-type-field">
        <label>Registrar por:</label>
        <div class="status-selector" id="progress-type-selector">
          <button type="button" class="status-btn ${
            progressType === "percentage" ? "status-active" : ""
          }" data-progress-type="percentage">Porcentaje</button>
          <button type="button" class="status-btn ${
            progressType === "page" ? "status-active" : ""
          }" data-progress-type="page">Página</button>
        </div>
      </div>

      <div class="progress-form" id="progress-form-percentage" ${progressType === "page" ? "hidden" : ""}>
        <label for="progress-range">Porcentaje</label>
        <div class="progress-slider-row">
          <input type="range" id="progress-range" min="0" max="100" step="1" value="${pct}" />
          <input type="number" id="progress-number" min="0" max="100" inputmode="numeric" value="${pct}" />
        </div>
        <p class="field-error" id="error-percentage" hidden></p>
      </div>

      <div class="progress-form" id="progress-form-page" ${progressType === "percentage" ? "hidden" : ""}>
        <div class="form-row">
          <div class="form-field">
            <label for="progress-current-page">Página actual</label>
            <input type="number" id="progress-current-page" min="0" inputmode="numeric" value="${currentPage}" />
          </div>
          <div class="form-field">
            <label for="progress-total-pages">Páginas totales</label>
            <input type="number" id="progress-total-pages" min="1" inputmode="numeric" value="${totalPages}" ${
    book.pages ? "disabled" : ""
  } />
          </div>
        </div>
        <p class="field-error" id="error-page" hidden></p>
      </div>

      <button id="btn-save-progress" class="btn btn-primary btn-block">Guardar progreso</button>

      <div class="progress-celebrate" id="progress-celebrate" hidden>
        <p>¡Has llegado al 100 %! ¿Quieres marcar el libro como leído?</p>
        <div class="form-row">
          <button id="btn-mark-read-yes" class="btn btn-primary btn-block">Sí, marcar como leído</button>
          <button id="btn-mark-read-no" class="btn btn-ghost btn-block">Todavía no</button>
        </div>
      </div>
    </section>
  `;
}

function wireReadingProgress(container, { id, book }) {
  const card = container.querySelector("#reading-progress-card");
  if (!card) return;

  let activeType = card.querySelector("#progress-type-selector .status-active")?.dataset.progressType || "percentage";
  const formPercentage = card.querySelector("#progress-form-percentage");
  const formPage = card.querySelector("#progress-form-page");
  const range = card.querySelector("#progress-range");
  const number = card.querySelector("#progress-number");
  const pageInput = card.querySelector("#progress-current-page");
  const totalInput = card.querySelector("#progress-total-pages");
  const hint = card.querySelector("#progress-current-hint");

  function setBar(pct) {
    const fill = card.querySelector(".reading-progress__fill");
    const label = card.querySelector(".reading-progress__label");
    if (fill) fill.style.width = pct + "%";
    if (label) label.textContent = pct + "%";
    hint.textContent = progressHintText(pct);
  }

  function totalPagesValue() {
    return Number(book.pages) || Number(totalInput.value) || 0;
  }

  // Previsualiza el porcentaje (y calcula el de la página) mientras escribe.
  function previewFromPage() {
    const total = totalPagesValue();
    const page = Number(pageInput.value);
    if (total > 0 && Number.isFinite(page) && page >= 0) {
      setBar(percentageFromPage(Math.min(page, total), total));
    }
  }

  card.querySelector("#progress-type-selector").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-progress-type]");
    if (!btn) return;
    activeType = btn.dataset.progressType;
    card.querySelectorAll("#progress-type-selector .status-btn").forEach((b) => b.classList.remove("status-active"));
    btn.classList.add("status-active");
    formPercentage.hidden = activeType !== "percentage";
    formPage.hidden = activeType !== "page";
  });

  range.addEventListener("input", () => {
    number.value = range.value;
    setBar(Number(range.value));
  });
  number.addEventListener("input", () => {
    const v = clampPercentage(number.value);
    range.value = v;
    if (number.value !== "") setBar(v);
  });
  pageInput.addEventListener("input", previewFromPage);
  totalInput.addEventListener("input", previewFromPage);

  card.querySelector("#btn-save-progress").addEventListener("click", async () => {
    const errorPercentage = card.querySelector("#error-percentage");
    const errorPage = card.querySelector("#error-page");
    errorPercentage.hidden = true;
    errorPage.hidden = true;

    let payload;
    if (activeType === "percentage") {
      const value = Number(number.value);
      if (number.value === "" || !Number.isFinite(value) || value < 0 || value > 100) {
        errorPercentage.textContent = "Introduce un porcentaje entre 0 y 100.";
        errorPercentage.hidden = false;
        return;
      }
      payload = {
        progressType: "percentage",
        progressPercentage: Math.round(value),
        currentPage: null,
      };
    } else {
      const currentPage = Number(pageInput.value);
      const totalPages = totalPagesValue();
      if (pageInput.value === "" || !Number.isFinite(currentPage) || currentPage < 0) {
        errorPage.textContent = "Escribe la página por la que vas.";
        errorPage.hidden = false;
        return;
      }
      if (!totalPages || totalPages <= 0) {
        errorPage.textContent = "Indica el total de páginas del libro.";
        errorPage.hidden = false;
        return;
      }
      if (currentPage > totalPages) {
        errorPage.textContent = "La página actual no puede ser mayor que el total de páginas.";
        errorPage.hidden = false;
        return;
      }
      payload = {
        progressType: "page",
        currentPage,
        totalPages,
        progressPercentage: percentageFromPage(currentPage, totalPages),
      };
    }

    const btn = card.querySelector("#btn-save-progress");
    btn.disabled = true;
    try {
      await updateReadingProgress(state.user.uid, id, payload);
      showToast("Progreso guardado");
      setBar(payload.progressPercentage);
      card.querySelector("#progress-celebrate").hidden = payload.progressPercentage !== 100;
    } catch (err) {
      console.error(err);
      showToast("No se ha podido guardar el progreso.", "error");
    } finally {
      btn.disabled = false;
    }
  });

  card.querySelector("#btn-mark-read-yes")?.addEventListener("click", async (e) => {
    try {
      await upsertReview(state.user.uid, id, { readingStatus: "leido", progressPercentage: 100 });
      heartBurst(e.currentTarget);
      showToast("¡Marcado como leído! Ya puedes puntuarlo.");
      renderBookDetail(container, { id });
    } catch (err) {
      console.error(err);
      showToast("No se ha podido actualizar el estado.", "error");
    }
  });

  card.querySelector("#btn-mark-read-no")?.addEventListener("click", () => {
    card.querySelector("#progress-celebrate").hidden = true;
  });
}

function clubOpinionHtml(review, profile) {
  return `
    <article class="opinion-card">
      <div class="opinion-header opinion-header-link" data-user-id="${review.userId}">
        ${avatarHtml(profile, 36)}
        <div>
          <strong>${escapeHtml(profile?.name || "Alguien")} ${escapeHtml(
    profile?.surname?.[0] ? profile.surname[0] + "." : ""
  )}</strong>
          ${starsDisplayHtml(review.rating || 0, 13)}
        </div>
      </div>
      ${review.comment ? `<p class="opinion-comment">"${escapeHtml(review.comment)}"</p>` : ""}
    </article>
  `;
}
