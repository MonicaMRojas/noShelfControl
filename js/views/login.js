// ============================================================
// VISTA: Inicio de sesión / registro
// ============================================================

import {
  signInWithGoogle,
  signInWithEmail,
  registerWithEmail,
  resetPassword,
  authErrorMessage,
} from "../auth.js";
import { logoHtml, showToast } from "../utils.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function renderLogin(container) {
  container.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <div class="auth-logo">${logoHtml("auth-logo-img")}</div>
        <p class="auth-subtitle">Tu rincón acogedor para leer en compañía.</p>

        <button id="btn-google" class="btn btn-google" type="button">
          <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 35.5 27 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.6 5.1C9.6 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.6 5.6C40.7 36.6 44 30.9 44 24c0-1.3-.1-2.7-.4-3.5z"/>
          </svg>
          Continuar con Google
        </button>

        <div class="auth-divider"><span>o con tu correo</span></div>

        <form id="form-email" class="auth-form" novalidate>
          <input type="email" id="email" placeholder="Correo electrónico" autocomplete="email" inputmode="email" />
          <input type="password" id="password" placeholder="Contraseña (mínimo 6 caracteres)" autocomplete="current-password" />
          <p class="field-error" id="auth-error" role="alert" hidden></p>
          <div class="auth-actions">
            <button type="submit" id="btn-login" class="btn btn-primary">Entrar</button>
            <button type="button" id="btn-register" class="btn btn-outline">Crear cuenta</button>
          </div>
        </form>

        <button type="button" id="btn-forgot" class="btn-link">¿Has olvidado tu contraseña?</button>

        <p class="auth-footnote handwritten">Un espacio privado para las lectoras de No Shelf Control</p>
      </div>
    </div>
  `;

  const form = container.querySelector("#form-email");
  const emailInput = container.querySelector("#email");
  const passInput = container.querySelector("#password");
  const errorEl = container.querySelector("#auth-error");
  const loginBtn = container.querySelector("#btn-login");
  const registerBtn = container.querySelector("#btn-register");

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = !msg;
  }

  function setBusy(busy) {
    loginBtn.disabled = busy;
    registerBtn.disabled = busy;
  }

  /** Valida el formulario; devuelve true si es correcto o muestra el error. */
  function validate({ forRegister }) {
    const email = emailInput.value.trim();
    const password = passInput.value;
    if (!email) {
      showError("Escribe tu correo electrónico.");
      emailInput.focus();
      return false;
    }
    if (!EMAIL_RE.test(email)) {
      showError("El correo electrónico no parece válido.");
      emailInput.focus();
      return false;
    }
    if (!password) {
      showError("Escribe tu contraseña.");
      passInput.focus();
      return false;
    }
    if (forRegister && password.length < 6) {
      showError("La contraseña debe tener al menos 6 caracteres.");
      passInput.focus();
      return false;
    }
    showError("");
    return true;
  }

  container.querySelector("#btn-google").addEventListener("click", async () => {
    showError("");
    try {
      await signInWithGoogle();
    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
        showError(authErrorMessage(err));
      }
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validate({ forRegister: false })) return;
    setBusy(true);
    try {
      await signInWithEmail(emailInput.value.trim(), passInput.value);
    } catch (err) {
      showError(authErrorMessage(err));
      setBusy(false);
    }
  });

  registerBtn.addEventListener("click", async () => {
    if (!validate({ forRegister: true })) return;
    setBusy(true);
    try {
      await registerWithEmail(emailInput.value.trim(), passInput.value);
    } catch (err) {
      showError(authErrorMessage(err));
      setBusy(false);
    }
  });

  container.querySelector("#btn-forgot").addEventListener("click", async () => {
    const email = emailInput.value.trim();
    if (!email || !EMAIL_RE.test(email)) {
      showError("Escribe tu correo arriba y pulsa de nuevo para recibir el enlace.");
      emailInput.focus();
      return;
    }
    try {
      await resetPassword(email);
      showError("");
      showToast("Te hemos enviado un correo para restablecer la contraseña.", "success");
    } catch (err) {
      showError(authErrorMessage(err));
    }
  });
}
