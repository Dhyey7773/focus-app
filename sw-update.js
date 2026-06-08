(function () {
  "use strict";

  if (!("serviceWorker" in navigator)) return;

  const VERSION_KEY = "quiet-focus-cache-version";
  let waitingWorker = null;

  function hasActiveFocusSession() {
    try {
      const raw = localStorage.getItem("quiet-focus-v1");
      if (!raw) return false;
      const profile = JSON.parse(raw);
      const active = profile?.activeSession;
      return active && active.mode !== "complete";
    } catch {
      return false;
    }
  }

  function showUpdateBanner() {
    if (document.getElementById("qf-update-banner")) return;

    const banner = document.createElement("div");
    banner.id = "qf-update-banner";
    banner.setAttribute("role", "status");
    banner.innerHTML =
      '<p><strong>Update available</strong> — Refresh for the latest Quiet Focus.</p>' +
      '<div class="qf-update-actions">' +
      '<button type="button" class="qf-update-refresh">Refresh</button>' +
      '<button type="button" class="qf-update-later">Later</button>' +
      "</div>";

    if (!document.getElementById("qf-update-style")) {
      const style = document.createElement("style");
      style.id = "qf-update-style";
      style.textContent =
        "#qf-update-banner{position:fixed;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:9999;" +
        "width:min(420px,calc(100vw - 24px));padding:14px 16px;border-radius:14px;background:#12151a;color:#f0f2f7;" +
        "border:1px solid rgba(148,218,177,0.25);box-shadow:0 12px 40px rgba(0,0,0,0.45);font:14px/1.45 system-ui,sans-serif}" +
        "#qf-update-banner p{margin:0 0 10px}#qf-update-banner strong{color:#94dab1;font-weight:600}" +
        ".qf-update-actions{display:flex;gap:8px}.qf-update-actions button{border-radius:10px;padding:8px 14px;font:inherit;cursor:pointer;border:1px solid transparent}" +
        ".qf-update-refresh{background:#f0f2f7;color:#07080a;font-weight:500}.qf-update-later{background:transparent;color:rgba(238,242,248,0.72);border-color:rgba(255,255,255,0.12)}";
      document.head.appendChild(style);
    }

    document.body.appendChild(banner);

    banner.querySelector(".qf-update-refresh")?.addEventListener("click", () => {
      if (hasActiveFocusSession()) {
        alert("Finish or pause your focus session first, then tap Refresh.");
        return;
      }
      if (waitingWorker) waitingWorker.postMessage({ type: "SKIP_WAITING" });
      window.location.reload();
    });

    banner.querySelector(".qf-update-later")?.addEventListener("click", () => banner.remove());
  }

  function noteVersion(version) {
    if (!version) return;
    const prev = localStorage.getItem(VERSION_KEY);
    localStorage.setItem(VERSION_KEY, version);
    if (prev && prev !== version && navigator.serviceWorker.controller) {
      showUpdateBanner();
    }
  }

  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "QF_CACHE_READY") {
      noteVersion(event.data.version);
    }
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        waitingWorker = registration.waiting;
        showUpdateBanner();
      }

      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && registration.waiting) {
            waitingWorker = registration.waiting;
            if (navigator.serviceWorker.controller) showUpdateBanner();
          }
        });
      });

      setInterval(() => registration.update(), 60 * 60 * 1000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") registration.update();
      });
    }).catch(() => {});
  });
})();
