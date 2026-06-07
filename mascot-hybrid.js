(function () {
  "use strict";

  const GLB_PATH = "models/quiet.glb";
  let modelViewerPromise;

  function shouldLoad3D() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return true;
    if (conn.saveData) return false;
    if (conn.effectiveType === "slow-2g" || conn.effectiveType === "2g") return false;
    return true;
  }

  function loadModelViewer() {
    if (window.customElements && customElements.get("model-viewer")) {
      return Promise.resolve();
    }
    if (modelViewerPromise) return modelViewerPromise;
    modelViewerPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.type = "module";
      s.src = "https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("model-viewer failed to load"));
      document.head.appendChild(s);
    });
    return modelViewerPromise;
  }

  function initHybrid(root) {
    const viewer = root.querySelector(".mascot-hybrid-3d");
    if (!viewer || !shouldLoad3D()) return;

    const start = () => {
      loadModelViewer()
        .then(() => {
          viewer.setAttribute("src", GLB_PATH);
          viewer.addEventListener("load", () => root.classList.add("mascot-hybrid-loaded"), { once: true });
          viewer.addEventListener("error", () => {}, { once: true });
        })
        .catch(() => {});
    };

    if ("requestIdleCallback" in window) {
      requestIdleCallback(start, { timeout: 10000 });
    } else {
      window.addEventListener("load", () => setTimeout(start, 2000), { once: true });
    }
  }

  function boot() {
    document.querySelectorAll(".mascot-hybrid").forEach(initHybrid);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
