// ============================================================
// VISTA: Editar perfil
// ============================================================

import { state, setState } from "../state.js";
import { updateUserProfile } from "../db.js";
import { resetPassword, authErrorMessage } from "../auth.js";
import { navigate } from "../router.js";
import { GENRES, compressImageToDataUrl, escapeHtml, showToast, validateImageFile } from "../utils.js";

export function renderEditProfile(container) {
  const profile = state.profile;
  let photoDataUrl = null;
  const isCustomGenre = !!profile?.favoriteGenre && !GENRES.includes(profile.favoriteGenre);
  const canChangePassword = state.user.providerData.some((p) => p.providerId === "password");

  container.innerHTML = `
    <button class="btn-back" id="btn-back">← Volver</button>
    <h1>Editar perfil</h1>

    <form id="form-edit" class="onboarding-form" novalidate>
      <div class="photo-picker">
        <label for="photo-input" class="photo-preview" id="photo-preview" ${
          profile?.photoURL ? `style="background-image:url('${escapeHtml(profile.photoURL)}')"` : ""
        }>
          ${profile?.photoURL ? "" : '<span class="photo-placeholder">Foto de perfil</span>'}
        </label>
        <input type="file" id="photo-input" accept="image/*" hidden />
      </div>

      <div class="form-row">
        <div class="form-field">
          <label for="name">Nombre</label>
          <input type="text" id="name" maxlength="40" value="${escapeHtml(profile?.name || "")}" />
        </div>
        <div class="form-field">
          <label for="surname">Apellidos</label>
          <input type="text" id="surname" maxlength="60" value="${escapeHtml(profile?.surname || "")}" />
        </div>
      </div>

      <div class="form-field">
        <label for="quote">Frase que te representa</label>
        <input type="text" id="quote" maxlength="120" value="${escapeHtml(profile?.quote || "")}" />
      </div>

      <div class="form-field">
        <label for="genre">Género literario favorito</label>
        <select id="genre">
          ${GENRES.map(
            (g) =>
              `<option value="${g}" ${
                (!isCustomGenre && profile?.favoriteGenre === g) || (isCustomGenre && g === "Otro")
                  ? "selected"
                  : ""
              }>${g}</option>`
          ).join("")}
        </select>
      </div>

      <div class="form-field" id="custom-genre-wrap" ${isCustomGenre ? "" : "hidden"}>
        <label for="custom-genre">¿Cuál?</label>
        <input type="text" id="custom-genre" maxlength="40" value="${
          isCustomGenre ? escapeHtml(profile?.favoriteGenre || "") : ""
        }" />
      </div>

      <p class="field-error" id="edit-error" role="alert" hidden></p>
      <button type="submit" class="btn btn-primary btn-block">Guardar cambios</button>
    </form>

    ${
      canChangePassword
        ? `<button type="button" id="btn-change-password" class="btn btn-outline btn-block" style="margin-top:14px">Cambiar contraseña</button>`
        : ""
    }
  `;

  const errorEl = container.querySelector("#edit-error");
  const showError = (msg) => {
    errorEl.textContent = msg;
    errorEl.hidden = !msg;
  };

  container.querySelector("#btn-back").addEventListener("click", () => navigate("/profile"));

  container.querySelector("#btn-change-password")?.addEventListener("click", async () => {
    try {
      await resetPassword(state.user.email);
      showToast("Te hemos enviado un correo para cambiar la contraseña.", "success");
    } catch (err) {
      showToast(authErrorMessage(err), "error");
    }
  });

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
      photoPreview.innerHTML = '<span class="photo-placeholder">Foto de perfil</span>';
    }
  });

  const genreSelect = container.querySelector("#genre");
  const customWrap = container.querySelector("#custom-genre-wrap");
  const customInput = container.querySelector("#custom-genre");
  genreSelect.addEventListener("change", () => {
    customWrap.hidden = genreSelect.value !== "Otro";
  });

  const form = container.querySelector("#form-edit");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = container.querySelector("#name").value.trim();
    const surname = container.querySelector("#surname").value.trim();
    const quote = container.querySelector("#quote").value.trim();
    let favoriteGenre = genreSelect.value;
    if (favoriteGenre === "Otro") {
      favoriteGenre = customInput.value.trim() || "Otro";
    }
    if (!name || !surname) {
      showError("Tu nombre y tus apellidos son obligatorios.");
      return;
    }
    showError("");

    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Guardando...";
    try {
      const updates = { name, surname, quote, favoriteGenre };
      if (photoDataUrl) {
        updates.photoURL = photoDataUrl;
      }
      await updateUserProfile(state.user.uid, updates);
      setState({ profile: { ...state.profile, ...updates } });
      showToast("Perfil actualizado");
      navigate("/profile");
    } catch (err) {
      console.error(err);
      showError("No se ha podido guardar. Inténtalo de nuevo.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Guardar cambios";
    }
  });
}
