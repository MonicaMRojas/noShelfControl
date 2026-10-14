// ============================================================
// PIEZAS DE INTERFAZ COMPARTIDAS ENTRE VISTAS
// ============================================================

import { escapeHtml, readingProgressBarHtml } from "../utils.js";

/** Portada de relleno cuando un libro no tiene imagen. */
export function placeholderCover() {
  return (
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="100%" height="100%" fill="#D8D8F4"/><rect x="40" y="40" width="220" height="370" rx="14" fill="none" stroke="#6B6097" stroke-width="4" opacity=".4"/><path d="M150 170l10 22 24 3-18 16 5 24-21-12-21 12 5-24-18-16 24-3z" fill="#FFF1AD" stroke="#6B6097" stroke-width="3"/></svg>`
    )
  );
}

/** Lista "Ahora leyendo" (perfil propio y público). */
export function currentReadsSectionHtml(currentReads, booksById) {
  if (!currentReads.length) return "";
  return `
    <section class="my-readings current-reads-section">
      <h2>Ahora leyendo</h2>
      <div class="current-reads-list">
        ${currentReads
          .map((r) => {
            const b = booksById[r.bookId];
            if (!b) return "";
            return `
              <article class="current-read-card" data-book-id="${b.id}">
                <img class="mini-cover mini-cover-sm" src="${escapeHtml(
                  b.coverURL || placeholderCover()
                )}" alt="Portada de ${escapeHtml(b.title)}" />
                <div class="current-read-info">
                  <strong>${escapeHtml(b.title)}</strong>
                  <span class="current-read-author">${escapeHtml(b.author || "")}</span>
                  ${readingProgressBarHtml(r.progressPercentage)}
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}
