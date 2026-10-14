// ============================================================
// VISTA: Inicio
// ============================================================

import { state } from "../state.js";
import {
  getCurrentClubBook,
  getReview,
  upsertReview,
  getRecentReviews,
  getUserProfile,
  getLatestProposalRound,
  roundPhase,
  getBook,
} from "../db.js";
import { navigate } from "../router.js";
import {
  CLUB_NAME,
  avatarHtml,
  clampPercentage,
  formatDate,
  formatDateShort,
  logoHtml,
  readingProgressBarHtml,
  starsDisplayHtml,
  showToast,
  escapeHtml,
} from "../utils.js";
import { placeholderCover } from "./shared.js";

export async function renderHome(container) {
  container.innerHTML = `<div class="loading-spinner"></div>`;

  const [currentBook, round, recentReviews] = await Promise.all([
    getCurrentClubBook().catch(() => null),
    getLatestProposalRound().catch(() => null),
    getRecentReviews(5).catch(() => []),
  ]);

  const myReviewOfCurrent = currentBook ? await getReview(state.user.uid, currentBook.id).catch(() => null) : null;
  const profile = state.profile;
  const phase = round ? roundPhase(round) : null;
  const roundVisible = round?.visible === true;

  // Libro ganador de la última ronda (si la sección está visible).
  const hasWinner = roundVisible && phase === "closed" && !!round?.winnerProposalId;
  let winnerBook = null;
  if (hasWinner && round.addedBookId) {
    winnerBook = await getBook(round.addedBookId).catch(() => null);
  }

  const reviewerIds = [...new Set(recentReviews.map((r) => r.userId))];
  const reviewerProfiles = {};
  const booksById = {};
  await Promise.all([
    ...reviewerIds.map(async (uid) => {
      reviewerProfiles[uid] = uid === state.user.uid ? profile : await getUserProfile(uid).catch(() => null);
    }),
    ...[...new Set(recentReviews.map((r) => r.bookId))].map(async (bid) => {
      booksById[bid] = await getBook(bid).catch(() => null);
    }),
  ]);

  const pendingDraw = state.isAdmin && round && phase === "pending_draw";

  container.innerHTML = `
    <section class="home-hero">
      <div class="home-hero-text">
        <p class="handwritten home-hero-eyebrow">Bienvenida a</p>
        <h1>${CLUB_NAME}</h1>
        <p class="home-hero-name">Hola, <strong>${escapeHtml(profile?.name || "")}</strong></p>
      </div>
      ${logoHtml("home-hero-logo")}
    </section>

    ${
      pendingDraw
        ? `<section class="notice-card">
            <strong>La ronda de propuestas ha terminado y falta hacer el sorteo.</strong>
            <p>Las propuestas ya están bloqueadas. Completa el proceso desde el panel de administración.</p>
            <a href="#/admin" class="btn btn-primary btn-sm">Ir al sorteo</a>
          </section>`
        : ""
    }

    ${currentBook ? currentBookCardHtml(currentBook) : emptyCurrentBookHtml()}

    ${currentBook ? myProgressHtml(currentBook, myReviewOfCurrent) : ""}

    ${hasWinner ? nextReadingHtml(round, winnerBook) : ""}

    ${roundVisible && phase === "open" ? openProposalsHtml(round) : ""}

    <section class="home-recent">
      <h2>Actividad reciente</h2>
      ${
        recentReviews.length
          ? `<div class="opinions-list">${recentReviews
              .map((r) => opinionCardHtml(r, reviewerProfiles[r.userId], booksById[r.bookId]))
              .join("")}</div>`
          : `<p class="empty-hint">Todavía no hay valoraciones. ¡Sé la primera en compartir la tuya!</p>`
      }
    </section>
  `;

  container.querySelector("#btn-view-book")?.addEventListener("click", () => navigate(`/book/${currentBook.id}`));

  container.querySelector("#btn-start-reading")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await upsertReview(state.user.uid, currentBook.id, { readingStatus: "leyendo", progressPercentage: 0 });
      showToast("¡Buena lectura!");
      renderHome(container);
    } catch (err) {
      console.error(err);
      showToast("No se ha podido guardar.", "error");
      btn.disabled = false;
    }
  });

  container.querySelector("#btn-go-progress")?.addEventListener("click", () => navigate(`/book/${currentBook.id}`));
  container.querySelector("#btn-go-proposals")?.addEventListener("click", () => navigate("/proposals"));
  container.querySelector("#btn-go-next")?.addEventListener("click", () => {
    if (winnerBook) navigate(`/book/${winnerBook.id}`);
    else navigate("/proposals");
  });

  container.querySelectorAll("[data-user-id]").forEach((el) => {
    el.addEventListener("click", () => navigate(`/user/${el.dataset.userId}`));
  });
  container.querySelectorAll("[data-book-id]").forEach((el) => {
    el.addEventListener("click", () => navigate(`/book/${el.dataset.bookId}`));
  });
}

function currentBookCardHtml(book) {
  return `
    <section class="current-book-card">
      <img class="current-book-cover" src="${escapeHtml(
        book.coverURL || placeholderCover()
      )}" alt="Portada de ${escapeHtml(book.title)}" onerror="this.onerror=null;this.src='${placeholderCover()}'" />
      <div class="current-book-info">
        <span class="badge badge-accent">Nuestra lectura actual</span>
        <h2>${escapeHtml(book.title)}</h2>
        <p class="book-author">${escapeHtml(book.author)}</p>
        ${book.meetingDate ? `<p class="book-meeting">Reunión: ${formatDate(book.meetingDate)}</p>` : ""}
        <button id="btn-view-book" class="btn btn-primary btn-sm">Ver libro</button>
      </div>
    </section>
  `;
}

function emptyCurrentBookHtml() {
  return `
    <section class="current-book-card current-book-empty">
      <div>
        <h2>Nuestra lectura actual</h2>
        <p class="empty-hint">Todavía no hay un libro en curso. Cuando una administradora lo elija, aparecerá aquí.</p>
      </div>
    </section>
  `;
}

function myProgressHtml(book, myReview) {
  const status = myReview?.readingStatus;
  if (status === "leyendo") {
    const pct = clampPercentage(myReview.progressPercentage);
    return `
      <section class="card home-progress-card">
        <h2>Mi progreso</h2>
        <p class="home-progress-text">Vas por el <strong>${pct} %</strong> de <em>${escapeHtml(book.title)}</em></p>
        ${readingProgressBarHtml(pct)}
        <button id="btn-go-progress" class="btn btn-outline btn-sm">Actualizar progreso</button>
      </section>
    `;
  }
  if (status === "leido") {
    return `
      <section class="card home-progress-card">
        <h2>Mi progreso</h2>
        <p class="home-progress-text">Ya has terminado este libro.</p>
        ${readingProgressBarHtml(100)}
      </section>
    `;
  }
  return `
    <section class="card home-progress-card">
      <h2>Mi progreso</h2>
      <p class="home-progress-text">Aún no has empezado esta lectura.</p>
      <button id="btn-start-reading" class="btn btn-outline btn-sm">Empezar a leer</button>
    </section>
  `;
}

function nextReadingHtml(round, winnerBook) {
  return `
    <section class="card next-reading-card">
      <span class="badge badge-star">Próxima lectura</span>
      <h2>${escapeHtml(round.winnerBookTitle || "")}</h2>
      <p class="book-author">${escapeHtml(round.winnerBookAuthor || "")}</p>
      ${
        winnerBook
          ? `<button id="btn-go-next" class="btn btn-outline btn-sm">Ver libro</button>`
          : `<button id="btn-go-next" class="btn btn-outline btn-sm">Ver resultado</button>`
      }
    </section>
  `;
}

function openProposalsHtml(round) {
  return `
    <section class="card proposals-cta">
      <span class="badge badge-accent">Propuestas abiertas</span>
      <h2>¿Qué leemos después?</h2>
      <p class="empty-hint">Hasta el ${formatDate(round.closesAt)} puedes proponer libros para la próxima lectura.</p>
      <button id="btn-go-proposals" class="btn btn-primary btn-sm">Proponer libro</button>
    </section>
  `;
}

function opinionCardHtml(review, profile, book) {
  return `
    <article class="opinion-card">
      <div class="opinion-header opinion-header-link" data-user-id="${review.userId}">
        ${avatarHtml(profile, 36)}
        <div>
          <strong>${escapeHtml(profile?.name || "Alguien")} ${escapeHtml(
    profile?.surname?.[0] ? profile.surname[0] + "." : ""
  )}</strong>
          ${starsDisplayHtml(review.rating || 0, 13)}
          <span class="opinion-date">${formatDateShort(review.updatedAt)}</span>
        </div>
      </div>
      ${book ? `<p class="opinion-book" data-book-id="${book.id}">${escapeHtml(book.title)}</p>` : ""}
      ${review.comment ? `<p class="opinion-comment">"${escapeHtml(review.comment)}"</p>` : ""}
    </article>
  `;
}
