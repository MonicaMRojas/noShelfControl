// ============================================================
// VISTA: Perfil público de otra integrante del club
// ============================================================

import { getUserProfile, getReviewsForUser, getBooks } from "../db.js";
import { navigate } from "../router.js";
import {
  avatarHtml,
  computeUserStats,
  escapeHtml,
  formatDate,
  formatDateShort,
  starsDisplayHtml,
} from "../utils.js";
import { currentReadsSectionHtml, placeholderCover } from "./shared.js";

export async function renderPublicProfile(container, { id }) {
  container.innerHTML = `<div class="loading-spinner"></div>`;

  const [profile, reviews, books] = await Promise.all([
    getUserProfile(id),
    getReviewsForUser(id),
    getBooks(),
  ]);

  if (!profile) {
    container.innerHTML = `
      <button class="btn-back" id="btn-back">← Volver</button>
      <div class="empty-state"><p>Esta persona ya no está en el club.</p></div>`;
    container.querySelector("#btn-back").addEventListener("click", () => navigate("/club"));
    return;
  }

  const booksById = Object.fromEntries(books.map((b) => [b.id, b]));
  const stats = computeUserStats(reviews);
  const readReviews = reviews
    .filter((r) => r.readingStatus === "leido")
    .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
  const currentReads = reviews
    .filter((r) => r.readingStatus === "leyendo")
    .sort((a, b) => (b.progressUpdatedAt?.seconds || 0) - (a.progressUpdatedAt?.seconds || 0));

  container.innerHTML = `
    <button class="btn-back" id="btn-back">← Volver</button>

    <section class="profile-header">
      ${avatarHtml(profile, 96)}
      <h1>${escapeHtml(profile.name || "")} ${escapeHtml(profile.surname || "")}</h1>
      ${profile.quote ? `<p class="profile-quote">"${escapeHtml(profile.quote)}"</p>` : ""}
      <span class="badge badge-soft">${escapeHtml(profile.favoriteGenre || "")}</span>
      ${
        profile.createdAt
          ? `<p class="profile-joined">En el club desde el ${escapeHtml(formatDate(profile.createdAt))}</p>`
          : ""
      }
    </section>

    <section class="stats-grid stats-grid-2">
      <div class="stat-box"><span class="stat-value">${stats.totalLeidos}</span><span class="stat-label">Leídos</span></div>
      <div class="stat-box"><span class="stat-value">${stats.mediaPuntuaciones.toFixed(1)}</span><span class="stat-label">Media</span>${starsDisplayHtml(
        stats.mediaPuntuaciones,
        13
      )}</div>
    </section>

    ${currentReadsSectionHtml(currentReads, booksById)}

    <section class="my-readings">
      <h2>Últimas puntuaciones</h2>
      ${
        readReviews.length
          ? `<div class="opinions-list">${readReviews
              .slice(0, 8)
              .map((r) => {
                const b = booksById[r.bookId];
                if (!b) return "";
                return `
                  <article class="opinion-card opinion-card-link" data-book-id="${b.id}">
                    <div class="opinion-header">
                      <img class="mini-cover mini-cover-sm" src="${escapeHtml(
                        b.coverURL || placeholderCover()
                      )}" alt="" />
                      <div>
                        <strong>${escapeHtml(b.title)}</strong>
                        ${starsDisplayHtml(r.rating || 0, 13)}
                        <span class="opinion-date">${formatDateShort(r.updatedAt)}</span>
                      </div>
                    </div>
                    ${r.comment ? `<p class="opinion-comment">"${escapeHtml(r.comment)}"</p>` : ""}
                  </article>
                `;
              })
              .join("")}</div>`
          : `<p class="empty-hint">Todavía no ha valorado ningún libro.</p>`
      }
    </section>
  `;

  container.querySelector("#btn-back").addEventListener("click", () => history.back());
  container.querySelectorAll("[data-book-id]").forEach((el) => {
    el.addEventListener("click", () => navigate(`/book/${el.dataset.bookId}`));
  });
}
