import cssText from "./style.css?inline";
import { createHomeAiRuntimeFacade } from "../../vite-app/runtime/home-ai-runtime-facade.mjs";
import {
  closeDialogState,
  createDialogState,
  dialogButtonPlan,
  dialogCanCancel,
  dialogNeedsInput,
  normalizeDialogOptions,
} from "./model.mjs";

const DIALOG_SHEET_PREVIEW_VERSION = "20260704-vite-dialog-sheet-preview-v1";
const browserRoot = typeof window !== "undefined" ? window : globalThis;

const runtime = browserRoot.HomeAiRuntimeFacade || createHomeAiRuntimeFacade({
  root: browserRoot,
  mode: "vite-dialog-sheet-preview",
  clientVersion: DIALOG_SHEET_PREVIEW_VERSION,
  appState: {
    dialogSheetPreview: true,
  },
  attachClassicCompatibility: true,
});

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function installStyles(root) {
  if (root.querySelector("style[data-homeai-vite-dialog-sheet-style]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-homeai-vite-dialog-sheet-style", "true");
  style.textContent = cssText;
  root.prepend(style);
}

function currentDialogState() {
  return runtime.state?.get?.().dialogSheetPreviewState || createDialogState("confirm", {
    title: "删除话题",
    message: "此操作只在 Vite dev preview 中模拟，不会修改真实数据。",
    detail: "确认/取消结果会写入 runtime state，用于替代 classic 全局 dialog 的 ESM 状态模型。",
    confirmLabel: "删除",
    danger: true,
  });
}

function setDialogState(state, detail = {}) {
  runtime.state?.set?.({ dialogSheetPreviewState: state });
  runtime.events?.emit?.("dialog-sheet-preview:update", {
    kind: state.kind,
    open: state.open,
    settled: state.result?.settled === true,
    reason: state.result?.reason || "",
    ...detail,
  });
}

function openDialog(kind, options = {}) {
  const state = createDialogState(kind, options);
  setDialogState(state, { action: "open" });
  return state;
}

function settleDialog(reason, inputValue = "") {
  const next = closeDialogState(currentDialogState(), reason, inputValue);
  setDialogState(next, { action: "settle" });
  return next;
}

function inputMarkup(state) {
  if (!dialogNeedsInput(state)) return "";
  const options = normalizeDialogOptions(state.options || {});
  const inputId = "viteDialogSheetInput";
  if (options.multiline) {
    return `
      <label class="vds-field" for="${inputId}">
        <span>${escapeHtml(options.inputLabel)}</span>
        <textarea id="${inputId}" rows="4" data-vds-input placeholder="${escapeHtml(options.placeholder)}">${escapeHtml(options.defaultValue)}</textarea>
      </label>
    `;
  }
  return `
    <label class="vds-field" for="${inputId}">
      <span>${escapeHtml(options.inputLabel)}</span>
      <input id="${inputId}" data-vds-input type="text" value="${escapeHtml(options.defaultValue)}" placeholder="${escapeHtml(options.placeholder)}">
    </label>
  `;
}

function buttonMarkup(state) {
  return dialogButtonPlan(state).map((button) => {
    const attr = button.id === "cancel" ? "data-vds-cancel" : "data-vds-confirm";
    const className = button.id === "cancel" ? "vds-dialog-cancel" : `vds-dialog-confirm ${button.tone === "danger" ? "danger" : ""}`;
    return `<button type="button" class="${className.trim()}" ${attr}>${escapeHtml(button.label)}</button>`;
  }).join("");
}

function dialogMarkup(state) {
  if (!state.open) return "";
  const options = normalizeDialogOptions(state.options || {});
  return `
    <div class="vds-overlay" data-vds-overlay>
      <section class="vds-sheet" role="dialog" aria-modal="true" aria-labelledby="viteDialogSheetTitle">
        <header class="vds-sheet-head">
          <h2 class="vds-sheet-title" id="viteDialogSheetTitle">${escapeHtml(options.title)}</h2>
          ${dialogCanCancel(state) ? '<button type="button" class="vds-close" data-vds-cancel aria-label="关闭">×</button>' : ""}
        </header>
        ${options.message ? `<p class="vds-message">${escapeHtml(options.message)}</p>` : ""}
        ${options.detail ? `<p class="vds-detail">${escapeHtml(options.detail)}</p>` : ""}
        ${inputMarkup(state)}
        <div class="vds-actions">${buttonMarkup(state)}</div>
      </section>
    </div>
  `;
}

function resultRows(state) {
  const rows = [
    ["kind", state.kind],
    ["open", String(Boolean(state.open))],
    ["settled", String(Boolean(state.result?.settled))],
    ["reason", state.result?.reason || "pending"],
    ["value", state.result?.value == null ? "null" : String(state.result.value)],
    ["canCancel", String(dialogCanCancel(state))],
  ];
  return rows.map(([label, value]) => `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `).join("");
}

function render(root) {
  const state = currentDialogState();
  root.innerHTML = `
    <div class="homeai-vite-dialog-sheet">
      <div class="vds-shell">
        <header class="vds-topbar">
          <div>
            <p class="vds-eyebrow">Vite island 开发预览</p>
            <h1 class="vds-title">Dialog Sheet</h1>
            <p class="vds-subtitle">预览 confirm / prompt / message 的 ESM 状态模型、按钮计划、输入框和关闭结果。此页不替换 classic 全局 dialog。</p>
          </div>
        </header>
        <section class="vds-controls" aria-label="Dialog variants">
          <button type="button" class="vds-button ${state.kind === "confirm" ? "active" : ""}" data-vds-open="confirm">Confirm</button>
          <button type="button" class="vds-button ${state.kind === "prompt" ? "active" : ""}" data-vds-open="prompt">Prompt</button>
          <button type="button" class="vds-button ${state.kind === "message" ? "active" : ""}" data-vds-open="message">Message</button>
        </section>
        <section class="vds-stage">
          <div class="vds-preview-page">
            <article class="vds-card">
              <strong>开发态页面内容</strong>
              <p>Sheet 应保持 viewport 内可读、可取消，并通过 runtime state 记录结果。</p>
            </article>
            <dl class="vds-result">${resultRows(state)}</dl>
          </div>
          ${dialogMarkup(state)}
        </section>
      </div>
    </div>
  `;
  installStyles(root);
}

function wire(root) {
  root.querySelectorAll("[data-vds-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const kind = button.dataset.vdsOpen || "message";
      openDialog(kind, {
        title: kind === "prompt" ? "重命名话题" : kind === "message" ? "已完成" : "删除话题",
        message: kind === "message" ? "操作已完成。" : "此操作只在 Vite dev preview 中模拟。",
        detail: "结果只写入 runtime state，不修改生产数据。",
        confirmLabel: kind === "confirm" ? "删除" : "确认",
        cancelLabel: "取消",
        inputLabel: "名称",
        defaultValue: kind === "prompt" ? "Vite 迁移" : "",
        placeholder: "输入名称",
        danger: kind === "confirm",
      });
      render(root);
      wire(root);
    });
  });
  root.querySelectorAll("[data-vds-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      settleDialog("cancel");
      render(root);
      wire(root);
    });
  });
  root.querySelector("[data-vds-confirm]")?.addEventListener("click", () => {
    settleDialog("confirm", root.querySelector("[data-vds-input]")?.value || "");
    render(root);
    wire(root);
  });
  root.querySelector("[data-vds-overlay]")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget && dialogCanCancel(currentDialogState())) {
      settleDialog("backdrop");
      render(root);
      wire(root);
    }
  });
}

export function mount(target = document.querySelector("[data-homeai-vite-dialog-sheet]")) {
  if (!target) return null;
  installStyles(target);
  if (!runtime.state?.get?.().dialogSheetPreviewState) setDialogState(currentDialogState(), { action: "init" });
  render(target);
  wire(target);
  return {
    refresh() {
      render(target);
      wire(target);
    },
    openDialog(kind, options) {
      openDialog(kind, options);
      render(target);
      wire(target);
    },
    settle(reason, value) {
      settleDialog(reason, value);
      render(target);
      wire(target);
    },
  };
}

browserRoot.HomeAIViteDialogSheetPreview = Object.freeze({
  version: DIALOG_SHEET_PREVIEW_VERSION,
  mount,
  openDialog,
  settleDialog,
  state: currentDialogState,
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => mount(), { once: true });
} else {
  mount();
}
