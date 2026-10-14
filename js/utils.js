// ============================================================
// UTILIDADES COMPARTIDAS
// ============================================================

export const GENRES = [
  "Fantasía",
  "Romantasy",
  "Romance",
  "New Adult",
  "Juvenil",
  "Thriller",
  "Misterio",
  "Terror",
  "Ciencia ficción",
  "Histórica",
  "Contemporánea",
  "Otro",
];

export const READING_STATUSES = {
  pendiente: "Pendiente",
  leyendo: "Leyendo",
  leido: "Leído",
};

export const BOOK_STATUSES = {
  proximamente: "Próximamente",
  leyendo_ahora: "Leyendo ahora",
  finalizado: "Finalizado",
};

export const PROPOSAL_ROUND_DAYS = 7;
export const MAX_PROPOSALS_PER_USER = 5;

/**
 * Normaliza un título o autor para comparar propuestas de libros ignorando
 * mayúsculas/minúsculas, tildes, espacios repetidos y puntuación simple.
 * "Alas de sangre", "ALAS DE SANGRE" y "Alas   de sangre" deben dar el mismo resultado.
 */
export function normalizeBookText(text = "") {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // quita tildes/diacriticos
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // sustituye puntuación por espacio (no la borra, para no unir palabras)
    .trim()
    .replace(/\s+/g, " ");
}

// ---------- Texto / seguridad ----------

export function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function initials(name = "", surname = "") {
  const a = name?.trim()?.[0] || "";
  const b = surname?.trim()?.[0] || "";
  return (a + b).toUpperCase() || "📖";
}

// ---------- Fechas ----------

// Convierte Timestamps de Firestore o strings "YYYY-MM-DD" (de <input type="date">)
// en un Date local, evitando el desfase de un día que provoca interpretar
// "YYYY-MM-DD" como medianoche UTC.
export function toDateObject(value) {
  if (value?.toDate) return value.toDate();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

export function formatDate(value) {
  if (!value) return "Sin fecha";
  const date = toDateObject(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatDateShort(value) {
  if (!value) return "";
  const date = toDateObject(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

// ---------- Avatares ----------

export function avatarHtml(profile, size = 44) {
  const url = profile?.photoURL;
  const label = initials(profile?.name, profile?.surname);
  if (url) {
    return `<img class="avatar" style="width:${size}px;height:${size}px" src="${escapeHtml(
      url
    )}" alt="${escapeHtml(profile?.name || "")}" />`;
  }
  return `<div class="avatar avatar-fallback" style="width:${size}px;height:${size}px">${escapeHtml(
    label
  )}</div>`;
}

// ---------- Estrellas ----------

const STAR_SVG = `<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.06 6.6.77-4.86 4.55 1.28 6.6L12 17.3l-5.92 3.18 1.28-6.6L2.5 9.33l6.6-.77z"/></svg>`;

/** Estrellas de solo lectura, admite medias estrellas (rating numérico). */
export function starsDisplayHtml(rating = 0, size = 16) {
  const r = Math.max(0, Math.min(5, Number(rating) || 0));
  let html = `<span class="stars-display" style="--star-size:${size}px" aria-label="${r} de 5 estrellas">`;
  for (let i = 1; i <= 5; i++) {
    const fill = Math.max(0, Math.min(1, r - (i - 1))) * 100;
    html += `<span class="star"><span class="star-empty">${STAR_SVG}</span><span class="star-fill" style="width:${fill}%">${STAR_SVG}</span></span>`;
  }
  html += "</span>";
  return html;
}

/**
 * Crea un selector de estrellas interactivo (con medias estrellas) dentro
 * de `container`. Llama a onChange(valor) cada vez que cambia la puntuación.
 */
export function createStarRatingInput(container, { initial = 0, onChange } = {}) {
  let value = initial;
  container.innerHTML = "";
  container.classList.add("stars-input");
  const starEls = [];

  for (let i = 1; i <= 5; i++) {
    const star = document.createElement("span");
    star.className = "star star-interactive";
    star.innerHTML = `<span class="star-empty">${STAR_SVG}</span><span class="star-fill">${STAR_SVG}</span>`;
    star.dataset.index = i;
    container.appendChild(star);
    starEls.push(star);

    star.addEventListener("mousemove", (e) => previewAt(i, e));
    star.addEventListener("touchstart", (e) => previewAt(i, e.touches[0]), { passive: true });
    star.addEventListener("click", (e) => {
      const v = valueFromEvent(i, e);
      value = v;
      render(value);
      onChange && onChange(value);
      pulse(star);
    });
  }

  container.addEventListener("mouseleave", () => render(value));

  function valueFromEvent(i, e) {
    const rect = e.currentTarget?.getBoundingClientRect
      ? e.currentTarget.getBoundingClientRect()
      : starEls[i - 1].getBoundingClientRect();
    const clientX = e.clientX ?? rect.left;
    const half = clientX - rect.left < rect.width / 2;
    return half ? i - 0.5 : i;
  }

  function previewAt(i, e) {
    const v = valueFromEvent(i, e);
    render(v);
  }

  function render(v) {
    starEls.forEach((star, idx) => {
      const fill = Math.max(0, Math.min(1, v - idx)) * 100;
      star.querySelector(".star-fill").style.width = fill + "%";
    });
  }

  function pulse(star) {
    star.classList.remove("star-pulse");
    // forzar reflow para reiniciar la animación
    void star.offsetWidth;
    star.classList.add("star-pulse");
  }

  render(value);

  return {
    getValue: () => value,
    setValue: (v) => {
      value = v;
      render(value);
    },
  };
}

// ---------- Progreso de lectura ----------

/** Limita un porcentaje a un entero entre 0 y 100. */
export function clampPercentage(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

/** Porcentaje correspondiente a una página dentro de un total (0-100). */
export function percentageFromPage(currentPage, totalPages) {
  if (!totalPages || totalPages <= 0) return 0;
  return clampPercentage((currentPage / totalPages) * 100);
}

/** De una lista de reseñas, la que se actualizó más recientemente (por progressUpdatedAt). */
export function mostRecentRead(reviews = []) {
  return reviews.reduce((latest, r) => {
    if (!latest) return r;
    const a = r.progressUpdatedAt?.seconds || 0;
    const b = latest.progressUpdatedAt?.seconds || 0;
    return a > b ? r : latest;
  }, null);
}

/** Barra de progreso de lectura reutilizable (ver css/styles.css: .reading-progress). */
export function readingProgressBarHtml(percentage = 0) {
  const pct = clampPercentage(percentage);
  return `
    <div class="reading-progress">
      <div class="reading-progress__bar">
        <div class="reading-progress__fill" style="width:${pct}%"></div>
      </div>
      <span class="reading-progress__label">${pct}%</span>
    </div>
  `;
}

// ---------- Estadísticas ----------

/** Calcula estadísticas de lectura de una usuaria a partir de sus reviews. */
export function computeUserStats(reviews = []) {
  const leidos = reviews.filter((r) => r.readingStatus === "leido");
  const pendientes = reviews.filter((r) => r.readingStatus === "pendiente");
  const puntuados = leidos.filter((r) => typeof r.rating === "number" && r.rating > 0);
  const avg =
    puntuados.length > 0
      ? puntuados.reduce((sum, r) => sum + r.rating, 0) / puntuados.length
      : 0;
  return {
    totalLeidos: leidos.length,
    totalPendientes: pendientes.length,
    mediaPuntuaciones: avg,
  };
}

/** Género más frecuente entre una lista de libros (leídos por la usuaria). */
export function mostFrequent(items = []) {
  if (!items.length) return null;
  const counts = {};
  for (const item of items) {
    if (!item) continue;
    counts[item] = (counts[item] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted.length ? sorted[0][0] : null;
}

// ---------- Imágenes ----------

export function validateImageFile(file, maxSizeMB = 3) {
  if (!file) return { valid: false, error: "No se ha seleccionado ningún archivo." };
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowed.includes(file.type)) {
    return { valid: false, error: "El archivo debe ser una imagen (JPG, PNG, WEBP o GIF)." };
  }
  if (file.size > maxSizeMB * 1024 * 1024) {
    return { valid: false, error: `La imagen no puede superar ${maxSizeMB}MB.` };
  }
  return { valid: true };
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No se ha podido leer la imagen."));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("No se ha podido leer el archivo."));
    reader.readAsDataURL(file);
  });
}

function dataUrlBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  return Math.ceil((base64.length * 3) / 4);
}

function drawAndEncode(img, maxDim, quality) {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Redimensiona y comprime una imagen en el propio navegador (sin subirla a
 * ningún sitio) y devuelve un Data URL en JPEG listo para guardar en
 * Firestore. Pensada para fotos de perfil: por defecto limita el lado más
 * largo a 400px e intenta que el resultado pese menos de 100KB, bajando la
 * calidad progresivamente y, si hace falta, reduciendo el tamaño otra vez.
 */
export async function compressImageToDataUrl(file, { maxDim = 400, maxBytes = 100 * 1024 } = {}) {
  const img = await loadImageFromFile(file);

  const attempt = (dim, startQuality) => {
    let quality = startQuality;
    let dataUrl = drawAndEncode(img, dim, quality);
    while (dataUrlBytes(dataUrl) > maxBytes && quality > 0.3) {
      quality -= 0.1;
      dataUrl = drawAndEncode(img, dim, quality);
    }
    return dataUrl;
  };

  let dataUrl = attempt(maxDim, 0.85);
  if (dataUrlBytes(dataUrl) > maxBytes) {
    dataUrl = attempt(Math.round(maxDim * 0.7), 0.7);
  }
  return dataUrl;
}

// ---------- Varios ----------

export function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

let toastTimer;
export function showToast(message, type = "info") {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = `toast toast-${type} toast-visible`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("toast-visible"), 2600);
}

export function heartBurst(target) {
  if (!target) return;
  const heart = document.createElement("span");
  heart.className = "heart-burst";
  heart.textContent = "❤️";
  const rect = target.getBoundingClientRect();
  heart.style.left = rect.left + rect.width / 2 + "px";
  heart.style.top = rect.top + "px";
  document.body.appendChild(heart);
  setTimeout(() => heart.remove(), 900);
}

/** Confeti ligero en CSS puro, para el resultado del sorteo de propuestas. */
export function confettiBurst() {
  const container = document.createElement("div");
  container.className = "confetti-container";
  const colors = ["#D8D8F4", "#6B6097", "#A5BFD0", "#E5B7BC", "#FFF1AD"];
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = Math.random() * 100 + "%";
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = Math.random() * 0.5 + "s";
    piece.style.animationDuration = 2.2 + Math.random() * 1.2 + "s";
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    container.appendChild(piece);
  }
  document.body.appendChild(container);
  setTimeout(() => container.remove(), 3600);
}

// ---------- Marca ----------

export const CLUB_NAME = "No Shelf Control";

/**
 * Logotipo oficial del club (assets/logo.png). Si todavía no se ha copiado
 * el archivo, se usa un marcador de texto (assets/logo-placeholder.svg).
 */
export function logoHtml(className = "brand-logo") {
  return `<img class="${className}" src="assets/logo.png" alt="${CLUB_NAME}" onerror="this.onerror=null;this.src='assets/logo-placeholder.svg'" />`;
}
