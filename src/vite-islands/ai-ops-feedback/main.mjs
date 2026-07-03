import cssText from "./style.css?inline";
import { createHomeAiRuntimeFacade } from "../../vite-app/runtime/home-ai-runtime-facade.mjs";
import {
  DEFAULT_CATEGORY,
  FEEDBACK_CATEGORIES,
  buildFeedbackPayload,
  normalizeCategory,
  ownerConsoleAvailable,
  ownerConsoleLabel,
  summarizeSubmissionResult,
} from "./model.mjs";

const FEEDBACK_API_PATH = "/api/v1/home-ai/diagnostics/events";
const PREVIEW_VERSION = "20260702-vite-aiops-feedback-dev-v1";
const browserRoot = typeof window !== "undefined" ? window : globalThis;
const ownerPreviewEnabled = (() => {
  try {
    return new URLSearchParams(browserRoot.location?.search || "").get("ownerPreview") === "1";
  } catch (_error) {
    return false;
  }
})();
const runtime = browserRoot.HomeAiRuntimeFacade || createHomeAiRuntimeFacade({
  root: browserRoot,
  mode: "vite-ai-ops-feedback-preview",
  clientVersion: PREVIEW_VERSION,
  appState: {
    aiOpsFeedbackPreview: true,
    auth: { isOwner: ownerPreviewEnabled },
    selectedWorkspaceId: "owner",
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
  if (root.querySelector("style[data-homeai-vite-aiops-feedback-style]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-homeai-vite-aiops-feedback-style", "true");
  style.textContent = cssText;
  root.prepend(style);
}

function runtimeState() {
  return runtime.state?.get?.() || {};
}

function ownerCapabilities() {
  return {
    ownerSystemConsole: typeof browserRoot.openOwnerSystemConsoleSurface === "function",
  };
}

function categoryButtons(activeCategory) {
  return FEEDBACK_CATEGORIES.map((category) => `
    <button
      class="aof-category${category.id === activeCategory ? " active" : ""}"
      type="button"
      data-aof-category="${escapeHtml(category.id)}"
      aria-pressed="${category.id === activeCategory ? "true" : "false"}"
    >${escapeHtml(category.label)}</button>
  `).join("");
}

function renderShell(root, state = runtimeState()) {
  const activeCategory = normalizeCategory(state.aiOpsFeedbackCategory || DEFAULT_CATEGORY);
  const capabilities = ownerCapabilities();
  const ownerVisible = ownerConsoleAvailable(state, capabilities);
  root.innerHTML = `
    <div class="homeai-vite-aiops-feedback">
      <div class="aof-shell">
        <header class="aof-topbar">
          <div>
            <p class="aof-eyebrow">Vite island 开发预览</p>
            <h1 class="aof-title">AI Ops 反馈菜单</h1>
            <p class="aof-subtitle">复刻三指长按反馈菜单的可迁移 UI。当前页面只用于开发验证，不替换 classic shell。</p>
          </div>
          <div class="aof-state">
            <span class="aof-badge">${escapeHtml(runtime.mode || "vite-preview")}</span>
            <span class="aof-badge ${ownerVisible ? "ok" : "muted"}">${escapeHtml(ownerConsoleLabel(state, capabilities))}</span>
          </div>
        </header>

        <section class="aof-panel" role="dialog" aria-label="AI Ops 反馈菜单">
          <div class="aof-context">
            <strong>当前页面</strong>
            <span>${escapeHtml(runtime.route?.current?.().pathname || "/vite-ai-ops-feedback-preview/")}</span>
          </div>
          <div class="aof-categories" role="group" aria-label="反馈类型">
            ${categoryButtons(activeCategory)}
          </div>
          <label class="aof-note-label">
            <span>补充一句</span>
            <textarea data-aof-note maxlength="260" rows="3" placeholder="可以不填；不要输入密码、密钥或隐私正文">${escapeHtml(state.aiOpsFeedbackNote || "")}</textarea>
          </label>
          <p class="aof-status" data-aof-status>将只提交最近的状态、计数和错误码。</p>
          <div class="aof-actions">
            <button class="aof-button secondary" type="button" data-aof-owner-console${ownerVisible ? "" : " disabled"}>${escapeHtml(ownerConsoleLabel(state, capabilities))}</button>
            <button class="aof-button" type="button" data-aof-submit>提交</button>
          </div>
        </section>
      </div>
    </div>
  `;
  installStyles(root);
}

function setStatus(root, message, tone = "") {
  const target = root.querySelector("[data-aof-status]");
  if (target) {
    target.textContent = message;
    target.dataset.tone = tone;
  }
  runtime.feedback?.status?.(message, { tone, source: "vite-ai-ops-feedback" });
}

async function submitFeedback(root) {
  const state = runtimeState();
  const note = root.querySelector("[data-aof-note]")?.value || "";
  const category = normalizeCategory(state.aiOpsFeedbackCategory || DEFAULT_CATEGORY);
  const payload = buildFeedbackPayload({
    category,
    note,
    route: runtime.route?.current?.() || {},
    state,
    native: runtime.native || {},
    capabilities: ownerCapabilities(),
  });
  runtime.state?.set?.({
    aiOpsFeedbackNote: note,
    aiOpsFeedbackSubmissionStatus: "submitting",
  });
  runtime.events?.emit?.("ai-ops-feedback:submit:start", {
    category: payload.category,
    route: payload.route,
  });
  setStatus(root, "正在提交...", "pending");
  try {
    const result = await runtime.api(FEEDBACK_API_PATH, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const message = summarizeSubmissionResult(result || {});
    runtime.state?.set?.({
      aiOpsFeedbackSubmissionStatus: "submitted",
      aiOpsFeedbackCaseId: result?.case_id || result?.caseId || "",
    });
    runtime.events?.emit?.("ai-ops-feedback:submit:success", {
      category: payload.category,
      caseId: result?.case_id || result?.caseId || "",
    });
    setStatus(root, message, "ok");
    return result;
  } catch (error) {
    runtime.state?.set?.({
      aiOpsFeedbackSubmissionStatus: "error",
      aiOpsFeedbackError: error?.code || error?.message || "submit_failed",
    });
    runtime.events?.emit?.("ai-ops-feedback:submit:error", {
      category: payload.category,
      error: error?.code || error?.message || "submit_failed",
    });
    setStatus(root, "提交失败。", "error");
    return null;
  }
}

function openOwnerConsole(root) {
  const state = runtimeState();
  if (!ownerConsoleAvailable(state, ownerCapabilities())) {
    setStatus(root, ownerConsoleLabel(state, ownerCapabilities()), "warning");
    return;
  }
  Promise.resolve(browserRoot.openOwnerSystemConsoleSurface({ trigger: "vite_ai_ops_feedback_preview" }))
    .then(() => {
      runtime.events?.emit?.("ai-ops-feedback:owner-console-opened", {});
      runtime.feedback?.toast?.("已打开系统控制台", { tone: "success" });
    })
    .catch((error) => {
      runtime.events?.emit?.("ai-ops-feedback:owner-console-error", {
        error: error?.code || error?.message || "open_failed",
      });
      setStatus(root, "系统控制台打开失败。", "error");
    });
}

function wire(root) {
  root.querySelectorAll("[data-aof-category]").forEach((button) => {
    button.addEventListener("click", () => {
      runtime.state?.set?.({ aiOpsFeedbackCategory: button.dataset.aofCategory || DEFAULT_CATEGORY });
      renderShell(root);
      wire(root);
    });
  });
  root.querySelector("[data-aof-note]")?.addEventListener("input", (event) => {
    runtime.state?.set?.({ aiOpsFeedbackNote: event.target.value || "" });
  });
  root.querySelector("[data-aof-submit]")?.addEventListener("click", () => submitFeedback(root));
  root.querySelector("[data-aof-owner-console]")?.addEventListener("click", () => openOwnerConsole(root));
}

export function mount(target = document.querySelector("[data-homeai-vite-aiops-feedback]")) {
  if (!target) return null;
  renderShell(target);
  wire(target);
  return {
    refresh() {
      renderShell(target);
      wire(target);
    },
    submit: () => submitFeedback(target),
  };
}

browserRoot.HomeAIViteAiOpsFeedbackPreview = Object.freeze({
  mount,
  payloadPreview: (input = {}) => buildFeedbackPayload(Object.assign({
    route: runtime.route?.current?.() || {},
    state: runtimeState(),
    native: runtime.native || {},
    capabilities: ownerCapabilities(),
  }, input)),
  runtimeSnapshot: () => runtime.snapshot(),
});

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mount(), { once: true });
  } else {
    mount();
  }
}
