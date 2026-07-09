import cssText from "./style.css?inline";
import { createHomeAiRuntimeFacade } from "../../vite-app/runtime/home-ai-runtime-facade.mjs";
import {
  addToastToPreviewState,
  createStatusState,
  createToastState,
  createToastStatusPreviewState,
  dismissToastState,
  recordToastAction,
  setStatusInPreviewState,
} from "./model.mjs";

const TOAST_STATUS_PREVIEW_VERSION = "20260704-vite-toast-status-preview-v1";
const browserRoot = typeof window !== "undefined" ? window : globalThis;

const runtime = browserRoot.HomeAiRuntimeFacade || createHomeAiRuntimeFacade({
  root: browserRoot,
  mode: "vite-toast-status-preview",
  clientVersion: TOAST_STATUS_PREVIEW_VERSION,
  appState: {
    toastStatusPreview: true,
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
  if (root.querySelector("style[data-homeai-vite-toast-status-style]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-homeai-vite-toast-status-style", "true");
  style.textContent = cssText;
  root.prepend(style);
}

function currentPreviewState() {
  return runtime.state?.get?.().toastStatusPreviewState || createToastStatusPreviewState({
    toastMessage: "已保存到 Home AI",
    toastTone: "success",
    statusMessage: "连接正常",
    statusDetail: "runtime facade feedback channel",
  });
}

function setPreviewState(state, eventType = "toast-status-preview:update", detail = {}) {
  runtime.state?.set?.({ toastStatusPreviewState: state });
  runtime.events?.emit?.(eventType, {
    visible: Boolean(state.toast?.visible),
    toastTone: state.toast?.tone || "",
    statusTone: state.status?.tone || "",
    lastAction: state.lastAction || "",
    ...detail,
  });
  return state;
}

function showPreviewToast(message, options = {}) {
  const toast = createToastState(message, options);
  const state = addToastToPreviewState(currentPreviewState(), toast);
  runtime.feedback?.toast?.(toast.message, {
    tone: toast.tone,
    actionId: toast.actionId,
    actionLabel: toast.actionLabel,
  });
  return setPreviewState(state, "feedback:toast", { action: "toast" });
}

function setPreviewStatus(message, options = {}) {
  const status = createStatusState(message, options);
  const state = setStatusInPreviewState(currentPreviewState(), status);
  runtime.feedback?.status?.(status.message, {
    tone: status.tone,
    detail: status.detail,
  });
  return setPreviewState(state, "feedback:status", { action: "status" });
}

function dismissPreviewToast() {
  const state = currentPreviewState();
  return setPreviewState({
    ...state,
    toast: dismissToastState(state.toast),
    lastAction: "dismiss",
  }, "toast-status-preview:dismiss", { action: "dismiss" });
}

function clickPreviewToastAction() {
  const state = currentPreviewState();
  return setPreviewState({
    ...state,
    toast: recordToastAction(state.toast),
    lastAction: "toast_action",
  }, "toast-status-preview:action", { action: "toast_action" });
}

function toastMarkup(toast) {
  const hidden = toast?.visible === false ? " hidden" : "";
  const tone = toast?.tone || "info";
  return `
    <div class="vts-toast ${escapeHtml(tone)}${hidden}" role="status" aria-live="polite" aria-label="${escapeHtml(toast?.ariaLabel || toast?.message || "")}" data-vts-toast>
      <span>${escapeHtml(toast?.message || "")}</span>
      ${toast?.actionable ? `<button type="button" class="vts-toast-action" data-vts-action>${escapeHtml(toast.actionLabel || "查看")}</button>` : ""}
    </div>
  `;
}

function historyMarkup(history = []) {
  return history.map((toast) => `
    <li>
      <span class="vts-code">${escapeHtml(toast.tone)}</span>
      <span>${escapeHtml(toast.message)}${toast.actionable ? ` / ${escapeHtml(toast.actionLabel || toast.actionId)}` : ""}</span>
    </li>
  `).join("");
}

function render(root) {
  const state = currentPreviewState();
  root.innerHTML = `
    <div class="homeai-vite-toast-status">
      <div class="vts-shell">
        <header class="vts-topbar">
          <div>
            <p class="vts-eyebrow">Vite island 开发预览</p>
            <h1 class="vts-title">Toast / Status</h1>
            <p class="vts-subtitle">预览 runtime facade 的 toast 与 status 反馈通道。此页只验证 ESM 状态模型和开发态 UI，不替换 classic PWA toast。</p>
          </div>
        </header>
        <section class="vts-grid">
          <article class="vts-panel">
            <h2 class="vts-panel-title">反馈动作</h2>
            <div class="vts-controls" aria-label="Toast status actions">
              <button type="button" class="vts-button primary" data-vts-demo="success">Success toast</button>
              <button type="button" class="vts-button" data-vts-demo="warning">Warning toast</button>
              <button type="button" class="vts-button danger" data-vts-demo="error">Error toast</button>
              <button type="button" class="vts-button" data-vts-demo="action">Action toast</button>
              <button type="button" class="vts-button" data-vts-demo="status">Status</button>
              <button type="button" class="vts-button" data-vts-demo="dismiss">Dismiss</button>
            </div>
            <ul class="vts-history" aria-label="Toast history">${historyMarkup(state.history)}</ul>
          </article>
          <section class="vts-phone" aria-label="Mobile preview">
            <div class="vts-chat">
              <p class="vts-bubble">请把调试输出保持为 bounded metadata。</p>
              <p class="vts-bubble self">收到。Toast 与 status 只通过 runtime facade 投影。</p>
            </div>
            <div class="vts-status" data-vts-status>
              <strong>${escapeHtml(state.status?.tone || "info")}</strong>
              <span>${escapeHtml(state.status?.message || "")}</span>
              ${state.status?.detail ? `<span class="vts-code">${escapeHtml(state.status.detail)}</span>` : ""}
            </div>
            ${toastMarkup(state.toast)}
          </section>
        </section>
      </div>
    </div>
  `;
  installStyles(root);
}

function wire(root) {
  root.querySelectorAll("[data-vts-demo]").forEach((button) => {
    button.addEventListener("click", () => {
      const demo = button.dataset.vtsDemo || "success";
      if (demo === "dismiss") {
        dismissPreviewToast();
      } else if (demo === "status") {
        setPreviewStatus("开发预览已连接", {
          tone: "info",
          detail: "feedback:status",
        });
      } else if (demo === "action") {
        showPreviewToast("有一条可查看的结果", {
          tone: "info",
          actionLabel: "查看",
          actionId: "open-result",
        });
      } else {
        showPreviewToast(demo === "error" ? "操作失败，已保留现场" : demo === "warning" ? "需要确认后继续" : "已保存到 Home AI", {
          tone: demo,
        });
      }
      render(root);
      wire(root);
    });
  });
  root.querySelector("[data-vts-action]")?.addEventListener("click", () => {
    clickPreviewToastAction();
    render(root);
    wire(root);
  });
}

export function mount(target = document.querySelector("[data-homeai-vite-toast-status]")) {
  if (!target) return null;
  installStyles(target);
  if (!runtime.state?.get?.().toastStatusPreviewState) {
    setPreviewState(currentPreviewState(), "toast-status-preview:init", { action: "init" });
  }
  render(target);
  wire(target);
  return {
    refresh() {
      render(target);
      wire(target);
    },
    showToast(message, options) {
      showPreviewToast(message, options);
      render(target);
      wire(target);
    },
    setStatus(message, options) {
      setPreviewStatus(message, options);
      render(target);
      wire(target);
    },
  };
}

browserRoot.HomeAIViteToastStatusPreview = Object.freeze({
  version: TOAST_STATUS_PREVIEW_VERSION,
  mount,
  showToast: showPreviewToast,
  setStatus: setPreviewStatus,
  state: currentPreviewState,
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => mount(), { once: true });
} else {
  mount();
}
