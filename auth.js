(function () {
  const EMAIL_PATTERN =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

  const DISPOSABLE_DOMAINS = new Set([
    "mailinator.com",
    "guerrillamail.com",
    "guerrillamail.net",
    "sharklasers.com",
    "grr.la",
    "10minutemail.com",
    "10minutemail.net",
    "tempmail.com",
    "temp-mail.org",
    "throwaway.email",
    "yopmail.com",
    "trashmail.com",
    "getnada.com",
    "maildrop.cc",
    "fakeinbox.com",
    "dispostable.com",
    "mailnesia.com",
    "mintemail.com",
    "spamgourmet.com",
    "mytemp.email",
    "emailondeck.com",
    "tmpmail.net",
    "tmpmail.org",
    "burnermail.io",
    "inboxkitten.com",
    "mailcatch.com",
    "mohmal.com",
    "harakirimail.com",
    "mailpoof.com",
    "tempr.email",
    "discard.email",
    "mail.tm",
    "ethereal.email"
  ]);

  const config = window.APP_CONFIG || {};
  let supabase = null;

  if (config.SUPABASE_URL && config.SUPABASE_ANON_KEY && window.supabase) {
    supabase = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    window.supabaseClient = supabase;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function normalizeEmail(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function emailDomain(email) {
    const parts = email.split("@");
    return parts.length === 2 ? parts[1] : "";
  }

  function isDisposableDomain(domain) {
    if (!domain) return true;
    if (DISPOSABLE_DOMAINS.has(domain)) return true;
    const segments = domain.split(".");
    if (segments.length > 2) {
      const parent = segments.slice(-2).join(".");
      if (DISPOSABLE_DOMAINS.has(parent)) return true;
    }
    return false;
  }

  function validateEmail(email) {
    if (!email) return "Enter your email address.";
    if (!EMAIL_PATTERN.test(email)) return "Enter a valid email address (name@domain.com).";
    const domain = emailDomain(email);
    if (!domain.includes(".")) return "That email domain does not look valid.";
    if (isDisposableDomain(domain)) {
      return "Use a real inbox — temporary email services are not allowed.";
    }
    return null;
  }

  function validatePassword(password, { signup } = {}) {
    if (!password) return "Enter your password.";
    if (signup && password.length < 8) {
      return "Password must be at least 8 characters.";
    }
    return null;
  }

  function setFieldError(inputId, message) {
    const input = $(inputId);
    const error = $(`${inputId}-error`);
    if (!input || !error) return;
    input.setAttribute("aria-invalid", message ? "true" : "false");
    error.textContent = message || "";
  }

  function clearAuthErrors() {
    ["auth-login-email", "auth-login-password", "auth-signup-email", "auth-signup-password"].forEach(
      (id) => setFieldError(id, "")
    );
    const banner = $("auth-banner");
    if (banner) {
      banner.textContent = "";
      banner.classList.remove("show", "success");
    }
  }

  function showBanner(message, type = "error") {
    const banner = $("auth-banner");
    if (!banner) return;
    banner.textContent = message;
    banner.classList.add("show");
    banner.classList.toggle("success", type === "success");
  }

  function showAuthPanel(name) {
    document.querySelectorAll(".auth-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.panel === name);
    });
    clearAuthErrors();
  }

  function setAuthBusy(busy) {
    document.querySelectorAll(".auth-form button[type='submit']").forEach((button) => {
      button.disabled = busy;
    });
  }

  function showApp(user) {
    const gate = $("auth-gate");
    const surface = document.querySelector(".app-surface");
    const tabBar = document.querySelector(".tab-bar");
    if (gate) gate.hidden = true;
    if (surface) surface.hidden = false;
    if (tabBar) tabBar.hidden = false;

    const account = $("account-email");
    const signOut = $("sign-out-button");
    if (account && user?.email) {
      account.textContent = user.email;
      if (signOut) signOut.hidden = false;
    } else if (signOut) {
      signOut.hidden = true;
    }

    window.dispatchEvent(
      new CustomEvent("focus-app-ready", { detail: { user } })
    );
  }

  function showAuthGate() {
    const gate = $("auth-gate");
    const surface = document.querySelector(".app-surface");
    const tabBar = document.querySelector(".tab-bar");
    if (gate) gate.hidden = false;
    if (surface) surface.hidden = true;
    if (tabBar) tabBar.hidden = true;
    showAuthPanel("login");
  }

  async function handleLogin(event) {
    event.preventDefault();
    clearAuthErrors();
    if (!supabase) {
      showBanner("Add Supabase keys in config.js to enable sign in.");
      return;
    }

    const email = normalizeEmail($("auth-login-email").value);
    const password = $("auth-login-password").value;
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);

    if (emailError) setFieldError("auth-login-email", emailError);
    if (passwordError) setFieldError("auth-login-password", passwordError);
    if (emailError || passwordError) return;

    setAuthBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthBusy(false);

    if (error) {
      if (/email not confirmed/i.test(error.message)) {
        showBanner("Confirm your email first — check your inbox for the verification link.");
      } else if (/invalid login credentials/i.test(error.message)) {
        showBanner("Incorrect email or password.");
      } else {
        showBanner(error.message);
      }
      return;
    }

    showApp(data.user);
  }

  async function handleSignup(event) {
    event.preventDefault();
    clearAuthErrors();
    if (!supabase) {
      showBanner("Add Supabase keys in config.js to enable sign up.");
      return;
    }

    const email = normalizeEmail($("auth-signup-email").value);
    const password = $("auth-signup-password").value;
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password, { signup: true });

    if (emailError) setFieldError("auth-signup-email", emailError);
    if (passwordError) setFieldError("auth-signup-password", passwordError);
    if (emailError || passwordError) return;

    setAuthBusy(true);
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo }
    });
    setAuthBusy(false);

    if (error) {
      if (/already registered/i.test(error.message)) {
        showBanner("This email already has an account. Try signing in.");
      } else {
        showBanner(error.message);
      }
      return;
    }

    $("verify-email-address").textContent = email;
    showAuthPanel("verify");
  }

  async function handleSignOut() {
    if (supabase) await supabase.auth.signOut();
    showAuthGate();
    clearAuthErrors();
  }

  function bindAuthUi() {
    $("auth-login-form")?.addEventListener("submit", handleLogin);
    $("auth-signup-form")?.addEventListener("submit", handleSignup);
    $("auth-show-signup")?.addEventListener("click", () => showAuthPanel("signup"));
    $("auth-show-login")?.addEventListener("click", () => showAuthPanel("login"));
    $("auth-back-login")?.addEventListener("click", () => showAuthPanel("login"));
    $("sign-out-button")?.addEventListener("click", handleSignOut);

    supabase?.auth.onAuthStateChange((_event, session) => {
      if (session?.user) showApp(session.user);
    });
  }

  async function initAuth() {
    bindAuthUi();
    const surface = document.querySelector(".app-surface");
    const tabBar = document.querySelector(".tab-bar");
    if (surface) surface.hidden = true;
    if (tabBar) tabBar.hidden = true;

    if (!supabase) {
      showApp(null);
      return;
    }

    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      showApp(data.session.user);
      return;
    }

    showAuthGate();
  }

  window.FocusAuth = {
    getSupabase: () => supabase,
    validateEmail,
    initAuth
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAuth);
  } else {
    initAuth();
  }
})();
