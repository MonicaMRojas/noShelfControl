// ============================================================
// VISTA: Bienvenida / creación de perfil (primer acceso)
// ============================================================

import { createUserProfile } from "../db.js";
import { signOutUser } from "../auth.js";
import { GENRES, compressImageToDataUrl, logoHtml, showToast, validateImageFile } from "../utils.js";

export function renderOnboarding(container, { user, onComplete }) {
  let photoDataUrl = null;
  const suggestedName = (user?.displayName || "").split(" ")[0] || "";

  container.innerHTML = `
    <div class="auth-screen onboarding-screen">
      <div class="auth-card onboarding-card">
        <div class="auth-logo">${logoHtml("auth-logo-img auth-logo-small")}</div>
        <h1 class="auth-title">Bienvenida a No Shelf Control</h1>
        <p class="auth-subtitle">Antes de entrar en la biblioteca, cuéntanos un poquito sobre ti.</p>

        <form id="form-onboarding" class="onboarding-form" novalidate>
          <div class="photo-picker">
            <label for="photo-input" class="photo-preview" id="photo-preview">
              <span class="photo-placeholder">Foto de perfil</span>
            </label>
            <input type="file" id="photo-input" accept="image/*" hidden />
          </div>

          <div class="form-row">
            <div class="form-field">
              <label for="name">Nombre</label>
              <input type="text" id="name" maxlength="40" placeholder="Ej. Laura" value="${suggestedName.replace(/"/g, "")}" />
            </div>
            <div class="form-field">
              <label for="surname">Apellidos</label>
              <input type="text" id="surname" maxlength="60" placeholder="Ej. García" />
            </div>
          </div>

          <div class="form-field">
            <label for="quote">Una frase que te represente <span class="optional">(opcional)</span></label>
            <input type="text" id="quote" maxlength="120" placeholder="Ej. Solo un capítulo más" />
          </div>

          <div class="form-field">
            <label for="genre">Tu género literario favorito</label>
            <select id="genre">
              <option value="" disabled selected>Elige un género</option>
              ${GENRES.map((g) => `<option value="${g}">${g}</option>`).join("")}
            </select>
          </div>

          <div class="form-field" id="custom-genre-wrap" hidden>
            <label for="custom-genre">¿Cuál?</label>
            <input type="text" id="custom-genre" maxlength="40" placeholder="Escribe tu género favorito" />
          </div>

          <p class="field-error" id="onboarding-error" role="alert" hidden></p>

          <button type="submit" class="btn btn-primary btn-block" id="btn-submit">
            Entrar al club
          </button>
        </form>
        <button type="button" id="btn-cancel" class="btn-link">Cerrar sesión</button>
      </div>
    </div>
  `;

  const errorEl = container.querySelector("#onboarding-error");
  const showError = (msg) => {
    errorEl.textContent = msg;
    errorEl.hidden = !msg;
  };

  const photoInput = container.querySelector("#photo-input");
  const photoPreview = container.querySelector("#photo-preview");
  photoInput.addEventListener("change", async () => {
    const file = photoInput.files[0];
    if (!file) return;
    const check = validateImageFile(file, 8);
    if (!check.valid) {
      showToast(check.error, "error");
      photoInput.value = "";
      return;
    }
    photoPreview.innerHTML = '<span class="photo-placeholder">Procesando...</span>';
    try {
      photoDataUrl = await compressImageToDataUrl(file);
      photoPreview.style.backgroundImage = `url(${photoDataUrl})`;
      photoPreview.innerHTML = "";
    } catch (err) {
      console.error(err);
      showToast("No se ha podido procesar la imagen.", "error");
      photoInput.value = "";
      photoDataUrl = null;
      photoPreview.style.backgroundImage = "";
      photoPreview.innerHTML = '<span class="photo-placeholder">Foto de perfil</span>';
    }
  });

  const genreSelect = container.querySelector("#genre");
  const customWrap = container.querySelector("#custom-genre-wrap");
  const customInput = container.querySelector("#custom-genre");
  genreSelect.addEventListener("change", () => {
    customWrap.hidden = genreSelect.value !== "Otro";
  });

  container.querySelector("#btn-cancel").addEventListener("click", () => signOutUser());

  const form = container.querySelector("#form-onboarding");
  const submitBtn = container.querySelector("#btn-submit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = container.querySelector("#name").value.trim();
    const surname = container.querySelector("#surname").value.trim();
    const quote = container.querySelector("#quote").value.trim();
    let favoriteGenre = genreSelect.value;
    if (favoriteGenre === "Otro") {
      favoriteGenre = customInput.value.trim();
      if (!favoriteGenre) {
        showError("Escribe tu género favorito.");
        customInput.focus();
        return;
      }
    }
    if (!name || !surname) {
      showError("Tu nombre y tus apellidos son obligatorios.");
      return;
    }
    if (!favoriteGenre) {
      showError("Elige tu género literario favorito.");
      return;
    }
    showError("");

    submitBtn.disabled = true;
    submitBtn.textContent = "Creando tu perfil...";
    try {
      await createUserProfile(user.uid, {
        name,
        surname,
        quote,
        favoriteGenre,
        photoURL: photoDataUrl || "",
      });
      showToast(`¡Bienvenida, ${name}!`, "success");
      onComplete && onComplete();
    } catch (err) {
      console.error(err);
      showError("No se ha podido crear tu perfil. Inténtalo de nuevo.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Entrar al club";
    }
  });
}
