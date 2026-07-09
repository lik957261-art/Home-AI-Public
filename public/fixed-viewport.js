"use strict";

const FIXED_VIEWPORT_CONTROLLER_ESM_PATH = "/vite-islands/fixed-viewport-controller/fixed-viewport-controller.js";

function installClassicFixedViewportFallback() {
  const prevent = (event) => {
    event.preventDefault();
  };

  document.documentElement.classList.add("fixed-viewport");

  for (const name of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(name, prevent, { passive: false });
  }

  document.addEventListener("touchmove", (event) => {
    if (event.touches && event.touches.length > 1) event.preventDefault();
  }, { passive: false });

  let lastTouchEnd = 0;
  document.addEventListener("touchend", (event) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) event.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  document.addEventListener("wheel", (event) => {
    if (event.ctrlKey || event.metaKey) event.preventDefault();
  }, { passive: false });
}

function importFixedViewportController(rootRef = window) {
  const importer = typeof rootRef.__homeAiImportFixedViewportController === "function"
    ? rootRef.__homeAiImportFixedViewportController
    : (path) => import(path);
  return Promise.resolve().then(() => importer(FIXED_VIEWPORT_CONTROLLER_ESM_PATH));
}

importFixedViewportController()
  .then((model) => {
    if (typeof model?.installFixedViewportController === "function") {
      model.installFixedViewportController({ documentRef: document, now: () => Date.now() });
      return;
    }
    installClassicFixedViewportFallback();
  })
  .catch(() => installClassicFixedViewportFallback());
