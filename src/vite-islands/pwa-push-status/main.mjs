import cssText from "./style.css?inline";
import { createHomeAiRuntimeFacade } from "../../vite-app/runtime/home-ai-runtime-facade.mjs";
import {
  createPwaPushStatusState,
  transitionPwaPushScenario,
} from "./model.mjs";

const PWA_PUSH_STATUS_PREVIEW_VERSION = "20260704-vite-pwa-push-status-preview-v1";
const browserRoot = typeof window !== "undefined" ? window : globalThis;

const runtime = browserRoot.HomeAiRuntimeFacade || createHomeAiRuntimeFacade({
  root: browserRoot,
  mode: "vite-pwa-push-status-preview",
  clientVersion: PWA_PUSH_STATUS_PREVIEW_VERSION,
  appState: {
    pwaPushStatusPreview: true,
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
  if (root.querySelector("style[data-homeai-vite-pwa-push-status-style]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-homeai-vite-pwa-push-status-style", "true");
  style.textContent = cssText;
  root.prepend(style);
}

function currentState() {
  return runtime.state?.get?.().pwaPushStatusPreviewState || createPwaPushStatusState({
    secureContext: true,
    serviceWorker: true,
    pushManager: true,
    notification: true,
    serverEnabled: true,
    permission: "default",
    hasSubscription: false,
    displayMode: "browser",
  });
}

function setState(state, detail = {}) {
  runtime.state?.set?.({ pwaPushStatusPreviewState: state });
  runtime.events?.emit?.("pwa-push-status-preview:update", {
    action: state.button?.action || "",
    tone: state.button?.tone || "",
    permission: state.capabilities?.permission || "",
    displayMode: state.capabilities?.displayMode || "",
    ...detail,
  });
  runtime.feedback?.status?.(state.unavailableReason || state.button?.title || "PWA Push 状态已更新", {
    tone: state.button?.tone === "warning" ? "warning" : "info",
    detail: "pwa_push_status_preview",
  });
  return state;
}

function scenarioState(scenario) {
  const next = transitionPwaPushScenario(currentState(), scenario);
  setState(next, { scenario });
  return next;
}

function stateRows(state) {
  const caps = state.capabilities || {};
  const rows = [
    ["permission", caps.permission],
    ["displayMode", caps.displayMode],
    ["secureContext", String(caps.secureContext)],
    ["serviceWorker", String(caps.serviceWorker)],
    ["pushManager", String(caps.pushManager)],
    ["notification", String(caps.notification)],
    ["serverEnabled", String(caps.serverEnabled)],
    ["hasSubscription", String(caps.hasSubscription)],
    ["buttonAction", state.button?.action || ""],
    ["delivery", state.delivery?.text || ""],
  ];
  return rows.map(([label, value]) => `
    <li>
      <span class="vps-code">${escapeHtml(label)}</span>
      <span>${escapeHtml(value)}</span>
    </li>
  `).join("");
}

function render(root) {
  const state = currentState();
  const buttonClass = state.button?.tone === "enabled" ? "enabled" : state.button?.tone === "warning" ? "warning" : "";
  root.innerHTML = `
    <div class="homeai-vite-pwa-push-status">
      <div class="vps-shell">
        <header>
          <p class="vps-eyebrow">Vite island 开发预览</p>
          <h1 class="vps-title">PWA / Web Push 状态</h1>
          <p class="vps-subtitle">预览 Web Push 支持、通知权限、PWA 显示模式和顶部通知按钮计划。此页只使用显式 fixture，不请求通知权限、不注册 Service Worker、不创建真实订阅。</p>
        </header>
        <section class="vps-grid">
          <article class="vps-panel">
            <h2 class="vps-panel-title">场景</h2>
            <div class="vps-controls" aria-label="PWA push scenarios">
              <button type="button" class="vps-button ${state.button?.action === "enable" ? "active" : ""}" data-vps-scenario="available">可启用</button>
              <button type="button" class="vps-button ${state.button?.action === "renew" ? "active" : ""}" data-vps-scenario="subscribed">已订阅</button>
              <button type="button" class="vps-button" data-vps-scenario="ios_browser">iOS 未添加主屏幕</button>
              <button type="button" class="vps-button" data-vps-scenario="denied">权限已拒绝</button>
              <button type="button" class="vps-button" data-vps-scenario="server_missing">服务端未配置</button>
            </div>
            <ul class="vps-list" aria-label="PWA push state">${stateRows(state)}</ul>
          </article>
          <section class="vps-phone" aria-label="PWA mobile preview">
            <div class="vps-topbar">
              <strong>Home AI</strong>
              <button type="button" class="vps-push-control ${buttonClass}" title="${escapeHtml(state.button?.title || "")}" aria-label="${escapeHtml(state.button?.ariaLabel || "")}" data-vps-push-button>${escapeHtml(state.button?.text || "🔔")}</button>
            </div>
            <article class="vps-status-card">
              <h2>状态读回</h2>
              <p>按钮动作：<span class="vps-code">${escapeHtml(state.button?.action || "")}</span></p>
              <p>按钮标签：${escapeHtml(state.button?.title || "")}</p>
              <p>投递读回：${escapeHtml(state.delivery?.text || "")}</p>
              ${state.unavailableReason ? `<p class="vps-reason">${escapeHtml(state.unavailableReason)}</p>` : ""}
            </article>
          </section>
        </section>
      </div>
    </div>
  `;
  installStyles(root);
}

function wire(root) {
  root.querySelectorAll("[data-vps-scenario]").forEach((button) => {
    button.addEventListener("click", () => {
      scenarioState(button.dataset.vpsScenario || "available");
      render(root);
      wire(root);
    });
  });
  root.querySelector("[data-vps-push-button]")?.addEventListener("click", () => {
    const state = currentState();
    runtime.feedback?.toast?.(state.button?.title || "PWA Push", {
      tone: state.button?.tone === "warning" ? "warning" : "info",
      action: state.button?.action || "",
    });
  });
}

export function mount(target = document.querySelector("[data-homeai-vite-pwa-push-status]")) {
  if (!target) return null;
  installStyles(target);
  if (!runtime.state?.get?.().pwaPushStatusPreviewState) {
    setState(currentState(), { scenario: "init" });
  }
  render(target);
  wire(target);
  return {
    refresh() {
      render(target);
      wire(target);
    },
    setScenario(scenario) {
      scenarioState(scenario);
      render(target);
      wire(target);
    },
  };
}

browserRoot.HomeAIVitePwaPushStatusPreview = Object.freeze({
  version: PWA_PUSH_STATUS_PREVIEW_VERSION,
  mount,
  setScenario: scenarioState,
  state: currentState,
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => mount(), { once: true });
} else {
  mount();
}
