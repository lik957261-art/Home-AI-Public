"use strict";

(function attachAppDialogUi(global) {
  function escapeDialogHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function ensureAppDialogOverlay() {
    if (!global.document?.body) return null;
    let overlay = global.document.querySelector("[data-app-dialog-overlay]");
    if (!overlay) {
      overlay = global.document.createElement("div");
      overlay.className = "app-dialog-overlay hidden";
      overlay.dataset.appDialogOverlay = "1";
      global.document.body.appendChild(overlay);
    }
    return overlay;
  }

  function normalizeDialogOptions(options = {}) {
    return {
      title: String(options.title || "确认操作"),
      message: String(options.message || ""),
      detail: String(options.detail || ""),
      confirmLabel: String(options.confirmLabel || "确认"),
      cancelLabel: String(options.cancelLabel || "取消"),
      danger: Boolean(options.danger),
      defaultValue: String(options.defaultValue ?? ""),
      placeholder: String(options.placeholder || ""),
      multiline: Boolean(options.multiline),
      selectText: options.selectText !== false,
    };
  }

  function openAppDialog(kind, options = {}) {
    const overlay = ensureAppDialogOverlay();
    if (!overlay) {
      if (kind === "confirm") return Promise.resolve(false);
      if (kind === "prompt") return Promise.resolve(null);
      return Promise.resolve(true);
    }
    const opts = normalizeDialogOptions(options);
    const inputId = `appDialogInput-${Date.now().toString(36)}`;
    const inputMarkup = kind === "prompt"
      ? `<label class="app-dialog-field" for="${inputId}">
          <span>${escapeDialogHtml(options.inputLabel || "输入")}</span>
          ${opts.multiline
            ? `<textarea id="${inputId}" rows="5" placeholder="${escapeDialogHtml(opts.placeholder)}">${escapeDialogHtml(opts.defaultValue)}</textarea>`
            : `<input id="${inputId}" type="text" value="${escapeDialogHtml(opts.defaultValue)}" placeholder="${escapeDialogHtml(opts.placeholder)}" autocomplete="off">`}
        </label>`
      : "";
    const messageMarkup = opts.message
      ? `<div class="app-dialog-message">${escapeDialogHtml(opts.message).replace(/\n/g, "<br>")}</div>`
      : "";
    const detailMarkup = opts.detail
      ? `<div class="app-dialog-detail">${escapeDialogHtml(opts.detail).replace(/\n/g, "<br>")}</div>`
      : "";
    const cancelMarkup = kind === "message"
      ? ""
      : `<button class="app-dialog-cancel" type="button" data-app-dialog-cancel>${escapeDialogHtml(opts.cancelLabel)}</button>`;
    overlay.innerHTML = `<section class="app-dialog-sheet access-key-sheet" role="dialog" aria-modal="true" aria-labelledby="appDialogTitle">
      <header class="access-key-header app-dialog-header">
        <div>
          <div id="appDialogTitle" class="access-key-title">${escapeDialogHtml(opts.title)}</div>
        </div>
        <button class="icon-button" type="button" data-app-dialog-cancel aria-label="关闭">&#10005;</button>
      </header>
      ${messageMarkup}
      ${detailMarkup}
      ${inputMarkup}
      <div class="app-dialog-actions">
        ${cancelMarkup}
        <button class="app-dialog-confirm${opts.danger ? " danger" : ""}" type="button" data-app-dialog-confirm>${escapeDialogHtml(opts.confirmLabel)}</button>
      </div>
    </section>`;
    overlay.classList.remove("hidden");
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        global.document.removeEventListener("keydown", onKeydown);
        overlay.removeEventListener("click", onBackdropClick);
        overlay.classList.add("hidden");
        overlay.innerHTML = "";
        resolve(value);
      };
      const onKeydown = (event) => {
        if (event.key === "Escape") finish(kind === "confirm" ? false : null);
        if (event.key === "Enter" && kind !== "prompt") finish(true);
      };
      const onBackdropClick = (event) => {
        if (event.target === overlay) finish(kind === "confirm" ? false : null);
      };
      overlay.addEventListener("click", onBackdropClick);
      global.document.addEventListener("keydown", onKeydown);
      overlay.querySelectorAll("[data-app-dialog-cancel]").forEach((button) => {
        button.addEventListener("click", () => finish(kind === "confirm" ? false : null));
      });
      overlay.querySelector("[data-app-dialog-confirm]")?.addEventListener("click", () => {
        if (kind === "prompt") {
          const input = overlay.querySelector(`#${inputId}`);
          finish(input?.value ?? "");
          return;
        }
        finish(true);
      });
      global.requestAnimationFrame?.(() => {
        const input = kind === "prompt" ? overlay.querySelector(`#${inputId}`) : null;
        const target = input || overlay.querySelector("[data-app-dialog-confirm]");
        target?.focus?.({ preventScroll: true });
        if (input && opts.selectText) {
          try {
            input.setSelectionRange(0, input.value.length);
          } catch (_) {
            input.select?.();
          }
        }
      });
    });
  }

  global.openAppConfirmDialog = (options = {}) => openAppDialog("confirm", options);
  global.openAppPromptDialog = (options = {}) => openAppDialog("prompt", options);
  global.openAppMessageDialog = (options = {}) => openAppDialog("message", options);
})(typeof window !== "undefined" ? window : globalThis);
