// ============================================================
// VISTA: Mi perfil
// ============================================================

import { state } from "../state.js";
import { getReviewsForUser, getBooks } from "../db.js";
import { signOutUser } from "../auth.js";
import { navigate } from "../router.js";
import {
  avatarHtml,
  computeUserStats,
  escapeHtml,
  formatDate,
  mostFrequent,
  starsDisplayHtml,
} from "../utils.js";
import { currentReadsSectionHtml, placeholderCover } from "./shared.js";

export async function renderProfile(container) {
  container.innerHTML = `<div class="loading-spinner"></div>`;

  const profile = state.profile;
  const [reviews, books] = await Promise.all([getReviewsForUser(state.user.uid), getBooks()]);
  const booksById = Object.fromEntries(books.map((b) => [b.id, b]));

  const stats = computeUserStats(reviews);
  const readReviews = reviews.filter((r) => r.readingStatus === "leido");
  const readGenres = readReviews.map((r) => booksById[r.bookId]?.genre).filter(Boolean);
  const topGenre = mostFrequent(readGenres) || profile?.favoriteGenre || "-";
  const currentReads = reviews
    .filter((r) => r.readingStatus === "leyendo")
    .sort((a, b) => (b.progressUpdatedAt?.seconds || 0) - (a.progressUpdatedAt?.seconds || 0));

  container.innerHTML = `
    <section class="profile-header">
      ${avatarHtml(profile, 96)}
      <h1>${escapeHtml(profile?.name || "")} ${escapeHtml(profile?.surname || "")}</h1>
      ${profile?.quote ? `<p class="profile-quote">"${escapeHtml(profile.quote)}"</p>` : ""}
      <span class="badge badge-soft">${escapeHtml(profile?.favoriteGenre || "")}</span>
      ${
        profile?.createdAt
          ? `<p class="profile-joined">En el club desde el ${escapeHtml(formatDate(profile.createdAt))}</p>`
          : ""
      }
    </section>

    <section class="stats-grid">
      <div class="stat-box"><span class="stat-value">${stats.totalLeidos}</span><span class="stat-label">Leídos</span></div>
      <div class="stat-box"><span class="stat-value">${stats.totalPendientes}</span><span class="stat-label">Pendientes</span></div>
      <div class="stat-box"><span class="stat-value">${stats.mediaPuntuaciones.toFixed(1)}</span><span class="stat-label">Media</span>${starsDisplayHtml(
        stats.mediaPuntuaciones,
        13
      )}</div>
      <div class="stat-box"><span class="stat-value stat-value-text">${escapeHtml(topGenre)}</span><span class="stat-label">Género top</span></div>
    </section>

    ${currentReadsSectionHtml(currentReads, booksById)}

    <section class="my-readings">
      <h2>Mis lecturas</h2>
      ${
        readReviews.length
          ? `<div class="covers-row">${readReviews
              .map((r) => {
                const b = booksById[r.bookId];
                if (!b) return "";
                return `<img class="mini-cover" data-book-id="${b.id}" src="${escapeHtml(
                  b.coverURL || placeholderCover()
                )}" alt="${escapeHtml(b.title)}" title="${escapeHtml(b.title)}" />`;
              })
              .join("")}</div>`
          : `<p class="empty-hint">Todavía no has marcado libros como leídos.</p>`
      }
    </section>

    <section class="profile-actions">
      <a href="#/wrapped" class="btn btn-outline btn-block">Mi año de lectura</a>
      <a href="#/profile/edit" class="btn btn-primary btn-block">Editar perfil</a>
      ${
        state.isAdmin
          ? `<a href="#/admin" class="btn btn-outline btn-block">Panel de administración</a>`
          : ""
      }
      <button id="btn-logout" class="btn btn-ghost btn-block">Cerrar sesión</button>
    </section>
  `;

  container.querySelectorAll("[data-book-id]").forEach((el) => {
    el.addEventListener("click", () => navigate(`/book/${el.dataset.bookId}`));
  });

  container.querySelector("#btn-logout").addEventListener("click", () => signOutUser());
}
