// ============================================================
// VISTA: "Mi año de lectura" — resumen anual personal
// ============================================================

import { state } from "../state.js";
import { getReviewsForUser, getBooks } from "../db.js";
import { CLUB_NAME, escapeHtml, mostFrequent, showToast } from "../utils.js";

export async function renderWrapped(container) {
  container.innerHTML = `<div class="loading-spinner"></div>`;

  const year = new Date().getFullYear();
  const [reviews, books] = await Promise.all([getReviewsForUser(state.user.uid), getBooks()]);
  const booksById = Object.fromEntries(books.map((b) => [b.id, b]));

  const readThisYear = reviews.filter((r) => {
    if (r.readingStatus !== "leido") return false;
    const d = r.updatedAt?.toDate ? r.updatedAt.toDate() : r.createdAt?.toDate ? r.createdAt.toDate() : null;
    return d ? d.getFullYear() === year : true;
  });

  const readBooks = readThisYear.map((r) => booksById[r.bookId]).filter(Boolean);
  const totalBooks = readThisYear.length;
  const booksWithPages = readBooks.filter((b) => Number(b.pages) > 0);
  const totalPages = booksWithPages.reduce((sum, b) => sum + Number(b.pages), 0);
  const topGenre = mostFrequent(readBooks.map((b) => b.genre)) || "-";
  const topAuthor = mostFrequent(readBooks.map((b) => b.author)) || "-";
  const best = readThisYear.reduce(
    (acc, r) => (!acc || (r.rating || 0) > (acc.rating || 0) ? r : acc),
    null
  );
  const bestBook = best && best.rating ? booksById[best.bookId] : null;

  container.innerHTML = `
    <button class="btn-back" id="btn-back">← Volver</button>

    <section class="wrapped-card" id="wrapped-card">
      <p class="wrapped-eyebrow">Mi año en ${CLUB_NAME}</p>
      <h1 class="wrapped-year">${year}</h1>

      <div class="wrapped-stat">
        <span class="wrapped-number">${totalBooks}</span>
        <span>libro${totalBooks === 1 ? "" : "s"} leído${totalBooks === 1 ? "" : "s"}</span>
      </div>
      ${
        totalPages > 0
          ? `<div class="wrapped-stat">
              <span class="wrapped-number">${totalPages.toLocaleString("es-ES")}</span>
              <span>páginas leídas${
                booksWithPages.length < totalBooks ? " (de los libros con páginas registradas)" : ""
              }</span>
            </div>`
          : ""
      }
      ${
        bestBook
          ? `<div class="wrapped-stat"><span class="wrapped-number">${String(best.rating).replace(
              ".",
              ","
            )} ★</span><span>mejor puntuado: "${escapeHtml(bestBook.title)}"</span></div>`
          : ""
      }
      <div class="wrapped-stat">
        <span class="wrapped-number wrapped-number-text">${escapeHtml(topGenre)}</span>
        <span>género más leído</span>
      </div>
      <div class="wrapped-stat">
        <span class="wrapped-number wrapped-number-text">${escapeHtml(topAuthor)}</span>
        <span>autor/a más leído/a</span>
      </div>

      <p class="wrapped-footer">${CLUB_NAME}</p>
    </section>

    <button id="btn-share" class="btn btn-primary btn-block">Compartir mi año</button>
  `;

  container.querySelector("#btn-back").addEventListener("click", () => history.back());

  container.querySelector("#btn-share").addEventListener("click", async () => {
    const text = `Mi año en ${CLUB_NAME} (${year})\n${totalBooks} libros leídos${
      totalPages > 0 ? `\n${totalPages} páginas leídas` : ""
    }\nGénero más leído: ${topGenre}\nAutor/a más leído/a: ${topAuthor}${
      bestBook ? `\nMejor puntuado: "${bestBook.title}" (${best.rating} ★)` : ""
    }`;
    if (navigator.share) {
      try {
        await navigator.share({ text, title: `Mi año en ${CLUB_NAME}` });
      } catch (_) {
        /* la usuaria canceló, no hacemos nada */
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        showToast("Resumen copiado al portapapeles");
      } catch (_) {
        showToast("No se ha podido copiar el resumen.", "error");
      }
    }
  });
}
