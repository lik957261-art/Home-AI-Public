"use strict";

(function attachAppDialogUi(global) {
  const APP_DIALOG_ESM_MODEL_PATH = "/vite-islands/dialog-sheet-model/dialog-sheet-model.js";
  let appDialogModelPromise = null;

  function escapeDialogHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function isUsableDialogModel(model) {
    return Boolean(
      model
        && typeof model.createDialogState === "function"
        && typeof model.closeDialogState === "function"
        && typeof model.dialogButtonPlan === "function"
        && typeof model.dialogCanCancel === "function"
        && typeof model.dialogNeedsInput === "function"
        && typeof model.normalizeDialogOptions === "function",
    );
  }

  function importDialogModel() {
    if (isUsableDialogModel(global.HomeAiDialogSheetModel)) {
      return Promise.resolve(global.HomeAiDialogSheetModel);
    }
    if (!appDialogModelPromise) {
      appDialogModelPromise = (typeof global.__homeAiImportDialogSheetModel === "function"
        ? global.__homeAiImportDialogSheetModel(APP_DIALOG_ESM_MODEL_PATH)
        : import(APP_DIALOG_ESM_MODEL_PATH)
      ).then((model) => (isUsableDialogModel(model) ? model : null)).catch(() => null);
    }
    return appDialogModelPromise;
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

  function createFallbackDialogState(kind, options = {}) {
    return {
      kind: ["confirm", "prompt", "message"].includes(kind) ? kind : "message",
      open: true,
      options: normalizeDialogOptions(options),
      result: {
        settled: false,
        value: null,
        reason: "",
      },
    };
  }

  function closeFallbackDialogState(state = {}, reason = "cancel", promptValue = "") {
    const kind = state.kind === "confirm" || state.kind === "prompt" || state.kind === "message"
      ? state.kind
      : "message";
    let value = true;
    if (kind === "confirm") value = false;
    if (kind === "prompt") value = null;
    if (reason === "confirm") value = kind === "prompt" ? String(promptValue ?? "") : true;
    return Object.assign({}, state, {
      open: false,
      result: {
        settled: true,
        value,
        reason: String(reason || "cancel"),
      },
    });
  }

  function dialogOptions(model, state) {
    if (model) return model.normalizeDialogOptions(state.options || {});
    return normalizeDialogOptions(state.options || {});
  }

  function dialogCanCancel(model, state) {
    if (model) return model.dialogCanCancel(state);
    return state.kind !== "message";
  }

  function dialogNeedsInput(model, state) {
    if (model) return model.dialogNeedsInput(state);
    return state.kind === "prompt";
  }

  function dialogButtonPlan(model, state) {
    if (model) return model.dialogButtonPlan(state);
    const opts = dialogOptions(model, state);
    const buttons = [];
    if (state.kind !== "message") {
      buttons.push({ id: "cancel", label: opts.cancelLabel, role: "cancel", tone: "neutral" });
    }
    buttons.push({
      id: "confirm",
      label: opts.confirmLabel,
      role: "confirm",
      tone: opts.danger ? "danger" : "primary",
    });
    return buttons;
  }

  function closeDialogState(model, state, reason, promptValue) {
    if (model) return model.closeDialogState(state, reason, promptValue);
    return closeFallbackDialogState(state, reason, promptValue);
  }

  async function openAppDialog(kind, options = {}) {
    const overlay = ensureAppDialogOverlay();
    if (!overlay) {
      if (kind === "confirm") return Promise.resolve(false);
      if (kind === "prompt") return Promise.resolve(null);
      return Promise.resolve(true);
    }
    const model = await importDialogModel();
    const state = model ? model.createDialogState(kind, options) : createFallbackDialogState(kind, options);
    const opts = dialogOptions(model, state);
    const inputId = `appDialogInput-${Date.now().toString(36)}`;
    const inputMarkup = dialogNeedsInput(model, state)
      ? `<label class="app-dialog-field" for="${inputId}">
          <span>${escapeDialogHtml(opts.inputLabel || "输入")}</span>
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
    const buttonMarkup = dialogButtonPlan(model, state).map((button) => {
      if (button.id === "cancel") {
        return `<button class="app-dialog-cancel" type="button" data-app-dialog-cancel>${escapeDialogHtml(button.label)}</button>`;
      }
      return `<button class="app-dialog-confirm${button.tone === "danger" ? " danger" : ""}" type="button" data-app-dialog-confirm>${escapeDialogHtml(button.label)}</button>`;
    }).join("");
    const canCancel = dialogCanCancel(model, state);
    overlay.innerHTML = `<section class="app-dialog-sheet access-key-sheet" role="dialog" aria-modal="true" aria-labelledby="appDialogTitle">
      <header class="access-key-header app-dialog-header">
        <div>
          <div id="appDialogTitle" class="access-key-title">${escapeDialogHtml(opts.title)}</div>
        </div>
        ${canCancel ? '<button class="icon-button" type="button" data-app-dialog-cancel aria-label="关闭">&#10005;</button>' : ""}
      </header>
      ${messageMarkup}
      ${detailMarkup}
      ${inputMarkup}
      <div class="app-dialog-actions">
        ${buttonMarkup}
      </div>
    </section>`;
    overlay.classList.remove("hidden");
    return new Promise((resolve) => {
      let settled = false;
      const finish = (reason, promptValue = "") => {
        if (settled) return;
        settled = true;
        global.document.removeEventListener("keydown", onKeydown);
        overlay.removeEventListener("click", onBackdropClick);
        overlay.classList.add("hidden");
        overlay.innerHTML = "";
        const closed = closeDialogState(model, state, reason, promptValue);
        resolve(closed.result?.value);
      };
      const onKeydown = (event) => {
        if (event.key === "Escape" && dialogCanCancel(model, state)) finish("cancel");
        if (event.key === "Enter" && !dialogNeedsInput(model, state)) finish("confirm");
      };
      const onBackdropClick = (event) => {
        if (event.target === overlay && dialogCanCancel(model, state)) finish("backdrop");
      };
      overlay.addEventListener("click", onBackdropClick);
      global.document.addEventListener("keydown", onKeydown);
      overlay.querySelectorAll("[data-app-dialog-cancel]").forEach((button) => {
        button.addEventListener("click", () => finish("cancel"));
      });
      overlay.querySelector("[data-app-dialog-confirm]")?.addEventListener("click", () => {
        if (dialogNeedsInput(model, state)) {
          const input = overlay.querySelector(`#${inputId}`);
          finish("confirm", input?.value ?? "");
          return;
        }
        finish("confirm");
      });
      global.requestAnimationFrame?.(() => {
        const input = dialogNeedsInput(model, state) ? overlay.querySelector(`#${inputId}`) : null;
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
