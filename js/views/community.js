// ============================================================
// VISTA: El Club (tarjetas de todas las integrantes)
// ============================================================

import { state } from "../state.js";
import { getAllUsers, getBooks, getClubCurrentReads } from "../db.js";
import { navigate } from "../router.js";
import { avatarHtml, clampPercentage, escapeHtml, mostRecentRead } from "../utils.js";
import { placeholderCover } from "./shared.js";

export async function renderCommunity(container) {
  container.innerHTML = `<div class="loading-spinner"></div>`;

  // Una sola consulta por colección (usuarias, libros, reseñas "leyendo"),
  // sin una consulta extra por cada integrante del club.
  const [users, books, currentReads] = await Promise.all([
    getAllUsers(),
    getBooks(),
    getClubCurrentReads(),
  ]);
  const booksById = Object.fromEntries(books.map((b) => [b.id, b]));

  const readsByUser = {};
  for (const read of currentReads) {
    // Solo cuentan las lecturas de libros que existen en la biblioteca.
    if (!booksById[read.bookId]) continue;
    if (!readsByUser[read.userId]) readsByUser[read.userId] = [];
    readsByUser[read.userId].push(read);
  }
  const currentReadByUser = Object.fromEntries(
    Object.entries(readsByUser).map(([uid, reads]) => [uid, mostRecentRead(reads)])
  );

  const sorted = [...users].sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"));

  container.innerHTML = `
    <section class="page-header">
      <h1>El Club</h1>
      <p class="section-subtitle">${sorted.length} integrante${sorted.length === 1 ? "" : "s"}</p>
    </section>
    ${
      sorted.length
        ? `<section class="community-grid">
            ${sorted.map((u) => memberCardHtml(u, currentReadByUser[u.id], booksById)).join("")}
          </section>`
        : `<div class="empty-state"><p>Todavía no hay integrantes.</p></div>`
    }
  `;

  container.querySelectorAll("[data-user-id]").forEach((el) => {
    el.addEventListener("click", () => {
      const uid = el.dataset.userId;
      navigate(uid === state.user.uid ? "/profile" : `/user/${uid}`);
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        el.click();
      }
    });
  });

  container.querySelectorAll("[data-current-read-book-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      navigate(`/book/${el.dataset.currentReadBookId}`);
    });
  });
}

function memberCardHtml(user, currentRead, booksById) {
  const book = currentRead ? booksById[currentRead.bookId] : null;
  return `
    <article class="member-card" data-user-id="${user.id}" role="link" tabindex="0">
      <div class="member-card-top">
        ${avatarHtml(user, 68)}
        <h3>${escapeHtml(user.name || "")} ${escapeHtml(user.surname || "")}</h3>
        <p class="member-quote">${user.quote ? `"${escapeHtml(user.quote)}"` : "&nbsp;"}</p>
        <span class="badge badge-soft">${escapeHtml(user.favoriteGenre || "Lectora")}</span>
      </div>
      ${book ? currentReadHtml(book, currentRead) : `<div class="member-current-read member-current-read-empty"></div>`}
    </article>
  `;
}

function currentReadHtml(book, read) {
  const pct = clampPercentage(read.progressPercentage);
  return `
    <div class="member-current-read" data-current-read-book-id="${book.id}">
      <span class="member-current-read-label">Ahora leyendo</span>
      <div class="member-current-read-body">
        <img class="mini-cover mini-cover-sm" src="${escapeHtml(
          book.coverURL || placeholderCover()
        )}" alt="Portada de ${escapeHtml(book.title)}" loading="lazy" />
        <div class="member-current-read-info">
          <strong class="member-current-read-title">${escapeHtml(book.title)}</strong>
          <span class="member-current-read-pct">${pct} %</span>
        </div>
      </div>
      <div class="reading-progress__bar"><div class="reading-progress__fill" style="width:${pct}%"></div></div>
    </div>
  `;
}
