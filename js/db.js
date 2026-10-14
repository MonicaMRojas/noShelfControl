// ============================================================
// ACCESO A FIRESTORE
// ============================================================
// Todas las lecturas/escrituras a la base de datos pasan por aquí.
// Colecciones: users, books, reviews, proposalRounds, bookProposals
// (ver README para el esquema completo).
// ============================================================

import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
  runTransaction,
  onSnapshot,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { db } from "./firebase-init.js";
import { normalizeBookText, toDateObject, PROPOSAL_ROUND_DAYS, MAX_PROPOSALS_PER_USER } from "./utils.js";

// ---------------- Usuarias ----------------

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createUserProfile(uid, data) {
  await setDoc(doc(db, "users", uid), {
    name: data.name,
    surname: data.surname,
    photoURL: data.photoURL || "",
    quote: data.quote || "",
    favoriteGenre: data.favoriteGenre,
    role: "member",
    createdAt: serverTimestamp(),
  });
}

export async function updateUserProfile(uid, data) {
  await updateDoc(doc(db, "users", uid), data);
}

/** Admin: cambia el rol de otra integrante ("member" | "admin"). Las reglas lo comprueban en el servidor. */
export async function adminSetUserRole(uid, role) {
  if (role !== "member" && role !== "admin") throw new Error("Rol no válido");
  await updateDoc(doc(db, "users", uid), { role });
}

export async function getAllUsers() {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------------- Libros ----------------

export async function getBooks() {
  const q = query(collection(db, "books"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getBook(bookId) {
  const snap = await getDoc(doc(db, "books", bookId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Devuelve el libro actual del club (status = "leyendo_ahora"), si existe. */
export async function getCurrentClubBook() {
  const q = query(
    collection(db, "books"),
    where("status", "==", "leyendo_ahora"),
    orderBy("createdAt", "desc"),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

export async function createBook(data) {
  const ref = await addDoc(collection(db, "books"), {
    autoProposals: true,
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateBook(bookId, data) {
  await updateDoc(doc(db, "books", bookId), data);
}

export async function deleteBook(bookId) {
  await deleteDoc(doc(db, "books", bookId));
}

/** Convierte `bookId` en el libro actual del club y pasa a "finalizado" cualquier otro. */
export async function setCurrentClubBook(bookId) {
  const q = query(collection(db, "books"), where("status", "==", "leyendo_ahora"));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach((d) => {
    if (d.id !== bookId) batch.update(d.ref, { status: "finalizado" });
  });
  batch.update(doc(db, "books", bookId), { status: "leyendo_ahora" });
  await batch.commit();
}

// ---------------- Reseñas / valoraciones ----------------
// Cada reseña usa como ID "{uid}_{bookId}" para garantizar que cada
// usuaria solo tenga una valoración por libro.

function reviewId(uid, bookId) {
  return `${uid}_${bookId}`;
}

export async function getReview(uid, bookId) {
  const snap = await getDoc(doc(db, "reviews", reviewId(uid, bookId)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function upsertReview(uid, bookId, data) {
  const ref = doc(db, "reviews", reviewId(uid, bookId));
  const existing = await getDoc(ref);
  const payload = {
    userId: uid,
    bookId,
    ...data,
    updatedAt: serverTimestamp(),
  };
  if (!existing.exists()) {
    payload.createdAt = serverTimestamp();
  }
  await setDoc(ref, payload, { merge: true });
}

export async function getReviewsForBook(bookId) {
  const q = query(collection(db, "reviews"), where("bookId", "==", bookId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getReviewsForUser(uid) {
  const q = query(collection(db, "reviews"), where("userId", "==", uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Todas las reseñas del club (panel de administración: participación por integrante). */
export async function getAllReviews() {
  const snap = await getDocs(collection(db, "reviews"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------------- Progreso de lectura ----------------
// Vive en el mismo documento reviews/{uid_bookId} (ver upsertReview), no en
// una colección aparte: progressPercentage es siempre el dato normalizado
// (aunque se registre por página) y es lo que se muestra en biblioteca,
// club y perfiles.

/** Actualiza el progreso de lectura de una usuaria para un libro (reviews/{uid}_{bookId}). */
export async function updateReadingProgress(uid, bookId, data) {
  await upsertReview(uid, bookId, { ...data, progressUpdatedAt: serverTimestamp() });
}

/**
 * Todas las reseñas del club con estado "leyendo", en una sola consulta
 * (para "El Club": se cruza en JS con getAllUsers()/getBooks() ya cargados,
 * sin una consulta por integrante).
 */
export async function getClubCurrentReads() {
  const q = query(collection(db, "reviews"), where("readingStatus", "==", "leyendo"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getRecentReviews(maxResults = 6) {
  const q = query(
    collection(db, "reviews"),
    where("readingStatus", "==", "leido"),
    orderBy("updatedAt", "desc"),
    limit(maxResults)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------------- Utilidades sobre reseñas ----------------

export function averageRating(reviews = []) {
  const puntuados = reviews.filter((r) => typeof r.rating === "number" && r.rating > 0);
  if (!puntuados.length) return 0;
  return puntuados.reduce((sum, r) => sum + r.rating, 0) / puntuados.length;
}

// ============================================================
// PROPUESTAS DE LECTURA (proposalRounds + bookProposals)
// ============================================================
// No hay Cloud Functions. Reparto de responsabilidades:
//
// - Cualquier integrante puede proponer / borrar SUS propuestas mientras
//   la ronda esté dentro de su ventana [opensAt, closesAt) (lo comprueban
//   las reglas con la hora del servidor, no el navegador).
// - Si el libro actual tiene `autoProposals: true` y ya pasó su fecha de
//   reunión, cualquier integrante que entre crea la ronda automática
//   (id = id del libro, así nunca se duplica). Las reglas validan que la
//   ronda sea exactamente "recién abierta, vacía, sin ganador".
// - SOLO las administradoras cierran la ronda y hacen el sorteo. Si nadie
//   entra justo al vencer `closesAt`, la ronda queda "pendiente de sorteo":
//   las propuestas ya están bloqueadas por las reglas y, al entrar una
//   administradora, la app lo detecta y ofrece completarlo.
// ============================================================

/** Error de negocio de propuestas: `err.code` identifica el motivo. */
export class ProposalError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function roundRef(roundId) {
  return doc(db, "proposalRounds", roundId);
}

function proposalsCollection() {
  return collection(db, "bookProposals");
}

/**
 * ID determinista: roundId + título y autor normalizados. Mismo libro en la
 * misma ronda = mismo documento, y las reglas exigen que el ID tenga
 * exactamente esta forma, así que no se puede duplicar ni saltándose la app.
 * (normalizeBookText solo deja letras, números y espacios: es seguro como ID.)
 */
function buildProposalId(roundId, normalizedTitle, normalizedAuthor) {
  return `${roundId}_${normalizedTitle}_${normalizedAuthor}`;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Estado "efectivo" de una ronda según la hora actual:
 *  - "scheduled": abierta pero aún no ha llegado opensAt
 *  - "open": admite propuestas
 *  - "pending_draw": venció closesAt y falta el sorteo (lo hace una administradora)
 *  - "closed": cerrada (con o sin ganador)
 */
export function roundPhase(round, now = Date.now()) {
  if (!round) return null;
  if (round.status === "closed") return "closed";
  const opens = round.opensAt?.toMillis ? round.opensAt.toMillis() : null;
  const closes = round.closesAt?.toMillis ? round.closesAt.toMillis() : null;
  if (opens && now < opens) return "scheduled";
  if (closes && now >= closes) return "pending_draw";
  return "open";
}

// ---------------- Lectura de rondas ----------------

export async function getProposalRound(roundId) {
  const snap = await getDoc(roundRef(roundId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** La ronda más reciente creada (abierta o cerrada), o null si nunca ha habido ninguna. */
export async function getLatestProposalRound() {
  const q = query(collection(db, "proposalRounds"), orderBy("createdAt", "desc"), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

/** Admin: historial de rondas, la más reciente primero. */
export async function getAllProposalRounds() {
  const q = query(collection(db, "proposalRounds"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Escucha en tiempo real la ronda de propuestas más reciente. Devuelve la función para cancelar la suscripción. */
export function listenToLatestProposalRound(callback) {
  const q = query(collection(db, "proposalRounds"), orderBy("createdAt", "desc"), limit(1));
  return onSnapshot(
    q,
    (snap) => {
      if (snap.empty) {
        callback(null);
        return;
      }
      const d = snap.docs[0];
      callback({ id: d.id, ...d.data() });
    },
    (err) => console.warn("No se ha podido escuchar la ronda de propuestas:", err)
  );
}

// ---------------- Apertura automática (opcional, sin Cloud Functions) ----------------

/**
 * Se llama al entrar en la app. Si el libro actual del club tiene activada
 * la apertura automática, ya ha llegado a su fecha de reunión y todavía no
 * hay ninguna ronda para él, la crea y abre durante 7 días.
 * No cierra ni sortea nunca: eso es cosa de las administradoras.
 */
export async function ensureAutoRound() {
  const currentBook = await getCurrentClubBook();
  if (!currentBook || currentBook.autoProposals !== true || !currentBook.meetingDate) return null;

  const meetingDate = toDateObject(currentBook.meetingDate);
  if (!meetingDate || Number.isNaN(meetingDate.getTime()) || new Date() < meetingDate) return null;

  // Si ya hay una ronda para este libro (automática o creada a mano), no crear otra.
  const latest = await getLatestProposalRound();
  if (latest && (latest.id === currentBook.id || latest.sourceBookId === currentBook.id)) return latest;

  const ref = roundRef(currentBook.id);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) return;
      tx.set(ref, {
        sourceBookId: currentBook.id,
        sourceMeetingDate: currentBook.meetingDate,
        title: "",
        opensAt: serverTimestamp(),
        openedAt: serverTimestamp(),
        closesAt: Timestamp.fromDate(addDays(new Date(), PROPOSAL_ROUND_DAYS)),
        status: "open",
        visible: true,
        winnerProposalId: null,
        winnerBookTitle: null,
        winnerBookAuthor: null,
        proposalCounts: {},
        addedToLibrary: false,
        createdAt: serverTimestamp(),
        closedAt: null,
        createdBy: "auto",
      });
    });
  } catch (err) {
    console.warn("No se ha podido abrir la ronda de propuestas automáticamente:", err);
  }
  return getProposalRound(currentBook.id);
}

// ---------------- Propuestas ----------------

function sortByCreated(list) {
  return list.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
}

/** Todas las propuestas de una ronda, ordenadas por fecha de creación. */
export async function getProposalsForRound(roundId) {
  const q = query(proposalsCollection(), where("roundId", "==", roundId));
  const snap = await getDocs(q);
  return sortByCreated(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

/** Escucha en tiempo real las propuestas de una ronda. Devuelve la función para cancelar la suscripción. */
export function listenToProposals(roundId, callback) {
  const q = query(proposalsCollection(), where("roundId", "==", roundId));
  return onSnapshot(
    q,
    (snap) => callback(sortByCreated(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
    (err) => console.warn("No se han podido escuchar las propuestas:", err)
  );
}

/**
 * Propone un libro en una ronda abierta. Transacción atómica: comprueba que
 * la ronda admite propuestas ahora mismo, que el libro no esté ya propuesto
 * y que la usuaria no supere sus 5 propuestas. Las reglas de Firestore
 * repiten las mismas comprobaciones con la hora del servidor.
 */
export async function submitProposal(roundId, uid, { title, author, genre }) {
  const cleanTitle = title.trim();
  const cleanAuthor = author.trim();
  const normalizedTitle = normalizeBookText(cleanTitle);
  const normalizedAuthor = normalizeBookText(cleanAuthor);
  if (!normalizedTitle || !normalizedAuthor) throw new ProposalError("INVALID");

  const propRef = doc(db, "bookProposals", buildProposalId(roundId, normalizedTitle, normalizedAuthor));
  const rRef = roundRef(roundId);

  await runTransaction(db, async (tx) => {
    const roundSnap = await tx.get(rRef);
    if (!roundSnap.exists() || roundPhase({ id: roundId, ...roundSnap.data() }) !== "open") {
      throw new ProposalError("ROUND_CLOSED");
    }
    const existingSnap = await tx.get(propRef);
    if (existingSnap.exists()) {
      throw new ProposalError("DUPLICATE");
    }
    const counts = roundSnap.data().proposalCounts || {};
    const current = counts[uid] || 0;
    if (current >= MAX_PROPOSALS_PER_USER) {
      throw new ProposalError("LIMIT_REACHED");
    }
    tx.set(propRef, {
      roundId,
      userId: uid,
      title: cleanTitle,
      author: cleanAuthor,
      genre: genre || null,
      normalizedTitle,
      normalizedAuthor,
      createdAt: serverTimestamp(),
    });
    tx.update(rRef, { [`proposalCounts.${uid}`]: current + 1 });
  });

  return propRef.id;
}

async function deleteProposalAndDecrement(proposalId, { requireOwnerUid } = {}) {
  const propRef = doc(db, "bookProposals", proposalId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(propRef);
    if (!snap.exists()) return;
    const data = snap.data();
    if (requireOwnerUid && data.userId !== requireOwnerUid) {
      throw new ProposalError("NOT_OWNER");
    }
    const rRef = roundRef(data.roundId);
    const roundSnap = await tx.get(rRef);
    tx.delete(propRef);
    if (roundSnap.exists()) {
      const counts = roundSnap.data().proposalCounts || {};
      const current = counts[data.userId] || 0;
      tx.update(rRef, { [`proposalCounts.${data.userId}`]: Math.max(0, current - 1) });
    }
  });
}

/** La propia usuaria elimina una de sus propuestas (solo mientras la ronda esté abierta). */
export function deleteMyProposal(proposalId, uid) {
  return deleteProposalAndDecrement(proposalId, { requireOwnerUid: uid });
}

/** Una administradora elimina cualquier propuesta, en cualquier momento. */
export function adminDeleteProposal(proposalId) {
  return deleteProposalAndDecrement(proposalId);
}

// ---------------- Sorteo (solo administradoras) ----------------

/** Entero aleatorio en [0, max) con la fuente criptográfica del navegador. */
function randomIndex(max) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

/**
 * Sortea el libro ganador entre todas las propuestas de la ronda y la cierra.
 * Es idempotente: si la ronda ya está cerrada o ya tiene ganador, no hace
 * nada, así que dos administradoras pulsando a la vez no generan dos
 * resultados distintos. El resultado queda guardado en Firestore y todas lo
 * ven igual.
 */
export async function drawProposalWinner(roundId) {
  const rRef = roundRef(roundId);
  // El SDK de navegador solo permite tx.get() sobre documentos concretos,
  // no sobre queries: las propuestas se leen antes de abrir la transacción.
  // La garantía de "un único sorteo" la da la comprobación del estado de
  // la ronda DENTRO de la transacción.
  const proposalsSnap = await getDocs(query(proposalsCollection(), where("roundId", "==", roundId)));
  const proposals = proposalsSnap.docs;

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(rRef);
    if (!snap.exists()) throw new ProposalError("ROUND_NOT_FOUND");
    const round = snap.data();
    if (round.status === "closed" || round.winnerProposalId) {
      return { alreadyClosed: true };
    }
    if (proposals.length === 0) {
      tx.update(rRef, { status: "closed", closedAt: serverTimestamp() });
      return { noProposals: true };
    }
    const winner = proposals[randomIndex(proposals.length)];
    const winnerData = winner.data();
    tx.update(rRef, {
      status: "closed",
      winnerProposalId: winner.id,
      winnerBookTitle: winnerData.title,
      winnerBookAuthor: winnerData.author,
      winnerBookGenre: winnerData.genre || null,
      closedAt: serverTimestamp(),
    });
    return { winnerProposalId: winner.id };
  });
}

// ---------------- Administración de rondas ----------------

/**
 * Admin: crea una ronda nueva.
 *  - opensAt: Date de apertura (null = abrir ahora)
 *  - closesAt: Date de cierre (por defecto, apertura + `days`)
 *  - visible: si la sección "Propuestas" se muestra ya a las integrantes
 */
export async function adminCreateRound(
  uid,
  { title = "", opensAt = null, closesAt = null, days = PROPOSAL_ROUND_DAYS, visible = true } = {}
) {
  const currentBook = await getCurrentClubBook();
  const start = opensAt || new Date();
  const end = closesAt || addDays(start, days);
  if (end.getTime() <= start.getTime()) throw new ProposalError("INVALID_DATES");

  const ref = await addDoc(collection(db, "proposalRounds"), {
    sourceBookId: currentBook?.id || null,
    sourceMeetingDate: currentBook?.meetingDate || null,
    title: title.trim(),
    opensAt: opensAt ? Timestamp.fromDate(opensAt) : serverTimestamp(),
    openedAt: opensAt ? Timestamp.fromDate(opensAt) : serverTimestamp(),
    closesAt: Timestamp.fromDate(end),
    status: "open",
    visible,
    winnerProposalId: null,
    winnerBookTitle: null,
    winnerBookAuthor: null,
    proposalCounts: {},
    addedToLibrary: false,
    createdAt: serverTimestamp(),
    closedAt: null,
    createdBy: uid,
  });
  return ref.id;
}

/** Admin: cierra una ronda ya mismo y sortea el ganador, aunque no haya vencido. */
export function adminCloseRoundNow(roundId) {
  return drawProposalWinner(roundId);
}

/**
 * Admin: abre una ronda ahora mismo (si estaba programada) o la reabre
 * (si estaba cerrada o pendiente de sorteo): limpia el ganador y da
 * `days` días desde este momento.
 */
export async function adminOpenRoundNow(roundId, days = PROPOSAL_ROUND_DAYS) {
  await updateDoc(roundRef(roundId), {
    status: "open",
    opensAt: serverTimestamp(),
    openedAt: serverTimestamp(),
    closesAt: Timestamp.fromDate(addDays(new Date(), days)),
    winnerProposalId: null,
    winnerBookTitle: null,
    winnerBookAuthor: null,
    winnerBookGenre: null,
    addedToLibrary: false,
    closedAt: null,
  });
}

/** Admin: reprograma las fechas de apertura y cierre (y el título) de una ronda. */
export async function adminUpdateRoundSchedule(roundId, { opensAt, closesAt, title }) {
  if (closesAt.getTime() <= opensAt.getTime()) throw new ProposalError("INVALID_DATES");
  const patch = {
    opensAt: Timestamp.fromDate(opensAt),
    openedAt: Timestamp.fromDate(opensAt),
    closesAt: Timestamp.fromDate(closesAt),
  };
  if (typeof title === "string") patch.title = title.trim();
  await updateDoc(roundRef(roundId), patch);
}

/** Admin: muestra/oculta la sección de propuestas sin tocar ninguna propuesta. */
export async function adminSetRoundVisibility(roundId, visible) {
  await updateDoc(roundRef(roundId), { visible });
}

/** Admin: elige manualmente otra propuesta como ganadora (por si el sorteo se equivocó). */
export async function adminSetWinnerManually(roundId, proposalId) {
  const propSnap = await getDoc(doc(db, "bookProposals", proposalId));
  if (!propSnap.exists()) throw new ProposalError("PROPOSAL_NOT_FOUND");
  const p = propSnap.data();
  await updateDoc(roundRef(roundId), {
    status: "closed",
    winnerProposalId: proposalId,
    winnerBookTitle: p.title,
    winnerBookAuthor: p.author,
    winnerBookGenre: p.genre || null,
    addedToLibrary: false,
    closedAt: serverTimestamp(),
  });
}

/** Admin: borra todas las propuestas de la ronda y la reabre desde cero. */
export async function adminResetRound(roundId, days = PROPOSAL_ROUND_DAYS) {
  const proposalsSnap = await getDocs(query(proposalsCollection(), where("roundId", "==", roundId)));
  const batch = writeBatch(db);
  proposalsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.update(roundRef(roundId), {
    status: "open",
    winnerProposalId: null,
    winnerBookTitle: null,
    winnerBookAuthor: null,
    winnerBookGenre: null,
    addedToLibrary: false,
    proposalCounts: {},
    closedAt: null,
    opensAt: serverTimestamp(),
    openedAt: serverTimestamp(),
    closesAt: Timestamp.fromDate(addDays(new Date(), days)),
  });
  await batch.commit();
}

/** Admin: elimina una ronda y todas sus propuestas. Si era la automática de un libro, desactiva la apertura automática de ese libro. */
export async function adminDeleteRound(round) {
  const proposalsSnap = await getDocs(query(proposalsCollection(), where("roundId", "==", round.id)));
  const batch = writeBatch(db);
  proposalsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(roundRef(round.id));
  if (round.createdBy === "auto" && round.sourceBookId) {
    // Sin esto, la ronda automática se volvería a crear en cuanto alguien entrase.
    batch.update(doc(db, "books", round.sourceBookId), { autoProposals: false });
  }
  await batch.commit();
}

/** Admin: crea en `books` el libro ganador de la ronda (una sola vez, atómico). */
export async function adminAddWinnerToLibrary(round) {
  if (!round.winnerBookTitle) throw new ProposalError("NO_WINNER");
  const bookRef = doc(collection(db, "books"));
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roundRef(round.id));
    if (!snap.exists()) throw new ProposalError("ROUND_NOT_FOUND");
    const data = snap.data();
    if (data.addedToLibrary) throw new ProposalError("ALREADY_ADDED");
    tx.set(bookRef, {
      title: data.winnerBookTitle,
      author: data.winnerBookAuthor || "",
      genre: data.winnerBookGenre || "",
      synopsis: "",
      coverURL: "",
      pages: null,
      readingDate: null,
      meetingDate: null,
      status: "proximamente",
      autoProposals: true,
      createdAt: serverTimestamp(),
    });
    tx.update(roundRef(round.id), { addedToLibrary: true, addedBookId: bookRef.id });
  });
  return bookRef.id;
}
