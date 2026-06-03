(function () {
  const siteKey = (window.APP_CONFIG && window.APP_CONFIG.TURNSTILE_SITE_KEY) || "";
  let token = null;
  let widgetId = null;
  let scriptPromise = null;

  function isEnabled() {
    return Boolean(siteKey);
  }

  function setToken(value) {
    token = value || null;
  }

  function getToken() {
    return token;
  }

  function reset() {
    token = null;
    if (window.turnstile && widgetId !== null) {
      window.turnstile.reset(widgetId);
    }
  }

  function loadScript() {
    if (!isEnabled()) return Promise.resolve(false);
    if (window.turnstile) return Promise.resolve(true);
    if (scriptPromise) return scriptPromise;

    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(true);
      script.onerror = () => reject(new Error("Could not load CAPTCHA."));
      document.head.appendChild(script);
    });

    return scriptPromise;
  }

  async function render(containerId) {
    if (!isEnabled()) return false;

    await loadScript();
    const container = document.getElementById(containerId);
    if (!container || !window.turnstile) return false;

    container.innerHTML = "";
    reset();

    widgetId = window.turnstile.render(container, {
      sitekey: siteKey,
      theme: "dark",
      callback: setToken,
      "expired-callback": () => setToken(null),
      "error-callback": () => setToken(null)
    });

    return true;
  }

  async function requireToken() {
    if (!isEnabled()) return null;
    if (!token) {
      throw new Error("Complete the security check before continuing.");
    }
    return token;
  }

  async function authOptions(extra) {
    const captchaToken = await requireToken();
    const options = { ...(extra || {}) };
    if (captchaToken) options.captchaToken = captchaToken;
    return options;
  }

  function afterAttempt() {
    reset();
  }

  window.AuthCaptcha = {
    isEnabled,
    render,
    requireToken,
    authOptions,
    afterAttempt,
    reset,
    getToken,
    setToken
  };
})();
