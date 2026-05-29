(function (global) {
  let isRegisterMode = false;

  function showError(msg) {
    const el = document.getElementById("authError");
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle("hidden", !msg);
  }

  function setLoading(loading) {
    const btn = document.getElementById("emailAuthBtn");
    const googleBtn = document.getElementById("googleSignInBtn");
    if (btn) btn.disabled = loading;
    if (googleBtn) googleBtn.disabled = loading;
  }

  function setMode(register) {
    isRegisterMode = register;
    const btn = document.getElementById("emailAuthBtn");
    const toggle = document.getElementById("toggleAuthModeBtn");
    const toggleText = toggle?.parentElement;
    if (btn) btn.textContent = register ? "Crear cuenta" : "Iniciar sesión";
    if (toggle) toggle.textContent = register ? "Ya tengo cuenta" : "Crear cuenta";
    if (toggleText) {
      toggleText.childNodes[0].textContent = register ? "¿Ya tenés cuenta? " : "¿No tenés cuenta? ";
    }
    const pwdInput = document.getElementById("authPassword");
    if (pwdInput) pwdInput.autocomplete = register ? "new-password" : "current-password";
    showError("");
  }

  async function handleEmailSubmit(e) {
    e.preventDefault();
    showError("");
    const email = document.getElementById("authEmail")?.value.trim();
    const password = document.getElementById("authPassword")?.value;
    if (!email || !password) return showError("Completá email y contraseña");

    setLoading(true);
    try {
      if (isRegisterMode) {
        const data = await global.UserAuth.signUpWithEmail(email, password);
        if (data?.user && !data.session) {
          showError("Revisá tu email para confirmar la cuenta");
        }
      } else {
        await global.UserAuth.signInWithEmail(email, password);
      }
    } catch (err) {
      showError(translateAuthError(err.message));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    showError("");
    setLoading(true);
    try {
      await global.UserAuth.signInWithGoogle();
    } catch (err) {
      showError(translateAuthError(err.message));
      setLoading(false);
    }
  }

  function translateAuthError(msg) {
    if (!msg) return "Error desconocido";
    if (msg.includes("Invalid login credentials")) return "Email o contraseña incorrectos";
    if (msg.includes("Email not confirmed")) return "Confirmá tu email antes de ingresar";
    if (msg.includes("User already registered")) return "Ya existe una cuenta con ese email";
    if (msg.includes("Password should be")) return "La contraseña debe tener al menos 6 caracteres";
    if (msg.includes("Unable to validate")) return "Email inválido";
    return msg;
  }

  function init() {
    document.getElementById("emailAuthForm")?.addEventListener("submit", handleEmailSubmit);
    document.getElementById("googleSignInBtn")?.addEventListener("click", handleGoogleSignIn);
    document.getElementById("toggleAuthModeBtn")?.addEventListener("click", () => setMode(!isRegisterMode));
  }

  global.LoginScreen = { init };
})(window);
