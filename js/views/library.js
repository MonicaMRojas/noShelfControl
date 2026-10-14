// ============================================================
// VISTA: Biblioteca
// ============================================================

import { state } from "../state.js";
import { getBooks, getReviewsForUser } from "../db.js";
import { navigate } from "../router.js";
import { escapeHtml, debounce, normalizeBookText, readingProgressBarHtml } from "../utils.js";
import { placeholderCover } from "./shared.js";

const FILTERS = [
  { key: "todos", label: "Todos" },
  { key: "leyendo_ahora", label: "Leyendo ahora" },
  { key: "proximamente", label: "Próximamente" },
  { key: "finalizado", label: "Finalizados" },
];

const STATUS_BADGE = {
  proximamente: { label: "Próximamente", cls: "badge-soft" },
  leyendo_ahora: { label: "Leyendo ahora", cls: "badge-accent" },
  finalizado: { label: "Finalizado", cls: "badge-muted" },
};

let activeFilter = "todos";
let searchTerm = "";

export async function renderLibrary(container) {
  container.innerHTML = `<div class="loading-spinner"></div>`;
  const [books, myReviews] = await Promise.all([getBooks(), getReviewsForUser(state.user.uid)]);
  const myReviewsByBookId = Object.fromEntries(myReviews.map((r) => [r.bookId, r]));

  container.innerHTML = `
    <section class="page-header">
      <h1>Biblioteca</h1>
      <p class="section-subtitle">Todos los libros del club</p>
      <input type="search" id="search-books" class="search-input" placeholder="Buscar por título o autor/a..." value="${escapeHtml(
        searchTerm
      )}" />
      <div class="filter-chips" id="filter-chips">
        ${FILTERS.map(
          (f) =>
            `<button type="button" class="chip ${f.key === activeFilter ? "chip-active" : ""}" data-filter="${
              f.key
            }">${f.label}</button>`
        ).join("")}
      </div>
    </section>
    <section class="books-grid" id="books-grid"></section>
  `;

  const grid = container.querySelector("#books-grid");
  renderGrid(grid, books, myReviewsByBookId);

  container.querySelector("#filter-chips").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;
    activeFilter = btn.dataset.filter;
    container.querySelectorAll(".chip").forEach((c) => c.classList.remove("chip-active"));
    btn.classList.add("chip-active");
    renderGrid(grid, books, myReviewsByBookId);
  });

  container.querySelector("#search-books").addEventListener(
    "input",
    debounce((e) => {
      searchTerm = e.target.value;
      renderGrid(grid, books, myReviewsByBookId);
    }, 200)
  );
}

function renderGrid(grid, books, myReviewsByBookId) {
  const term = normalizeBookText(searchTerm);
  const filtered = books.filter((b) => {
    const matchesFilter = activeFilter === "todos" || b.status === activeFilter;
    const matchesSearch =
      !term ||
      normalizeBookText(b.title || "").includes(term) ||
      normalizeBookText(b.author || "").includes(term);
    return matchesFilter && matchesSearch;
  });

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state"><p>${
      books.length ? "No se han encontrado libros con ese filtro." : "Todavía no hay libros en la biblioteca."
    }</p></div>`;
    return;
  }

  grid.innerHTML = filtered.map((b) => bookCardHtml(b, myReviewsByBookId[b.id])).join("");
  grid.querySelectorAll("[data-book-id]").forEach((card) => {
    card.addEventListener("click", () => navigate(`/book/${card.dataset.bookId}`));
  });
}

function bookCardHtml(book, myReview) {
  const badge = STATUS_BADGE[book.status] || STATUS_BADGE.proximamente;
  const isReading = myReview?.readingStatus === "leyendo";
  const isRead = myReview?.readingStatus === "leido";
  return `
    <article class="book-card" data-book-id="${book.id}">
      <img class="book-cover" src="${escapeHtml(book.coverURL || placeholderCover())}" alt="Portada de ${escapeHtml(
    book.title
  )}" loading="lazy" onerror="this.onerror=null;this.src='${placeholderCover().replace(/'/g, "%27")}'" />
      <span class="badge ${badge.cls} book-card-badge">${badge.label}</span>
      <div class="book-card-info">
        <h3>${escapeHtml(book.title)}</h3>
        <p>${escapeHtml(book.author)}</p>
        ${
          isReading
            ? `<div class="book-card-progress"><span class="badge badge-soft">Leyendo</span>${readingProgressBarHtml(
                myReview.progressPercentage
              )}</div>`
            : isRead
            ? `<div class="book-card-progress"><span class="badge badge-soft">Leído</span></div>`
            : ""
        }
      </div>
    </article>
  `;
}
