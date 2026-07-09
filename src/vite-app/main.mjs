import cssText from "./style.css?inline";
import { createHomeAiRuntimeFacade } from "./runtime/home-ai-runtime-facade.mjs";

const APP_PREVIEW_VERSION = "20260702-vite-app-runtime-facade-v1";
const APP_PREVIEW_PHASE = "phase-2-runtime-facade";
const MANIFEST_PATH = "/vite-islands/.vite/manifest.json";
const BUILT_PREVIEW_PATH = "/vite-preview/home-ai-app.html";
const HOME_AI_ROOT_PATH = "/";
const OWNER_CONSOLE_PREVIEW_PATH = "/vite-preview/owner-system-console.html";
const AI_OPS_FEEDBACK_PREVIEW_PATH = "/vite-preview/ai-ops-feedback.html";
const VOICE_INPUT_STATUS_PREVIEW_PATH = "/vite-preview/voice-input-status.html";
const NAVIGATION_SHELL_PREVIEW_PATH = "/vite-preview/navigation-shell.html";
const DOCUMENT_PREVIEW_PATH = "/vite-preview/document-preview.html";
const PLUGIN_HOST_PREVIEW_PATH = "/vite-preview/plugin-host.html";
const DIALOG_SHEET_PREVIEW_PATH = "/vite-preview/dialog-sheet.html";
const TOAST_STATUS_PREVIEW_PATH = "/vite-preview/toast-status.html";
const PWA_PUSH_STATUS_PREVIEW_PATH = "/vite-preview/pwa-push-status.html";
const runtime = createHomeAiRuntimeFacade({
  root: window,
  mode: "vite-app-preview",
  clientVersion: APP_PREVIEW_VERSION,
  appState: {
    previewVersion: APP_PREVIEW_VERSION,
    phase: APP_PREVIEW_PHASE,
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
  if (root.querySelector("style[data-homeai-vite-app-preview-style]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-homeai-vite-app-preview-style", "true");
  style.textContent = cssText;
  root.prepend(style);
}

function buildMetadata(manifest = null, runtimeFacade = runtime) {
  const appEntry = manifest?.["src/vite-app/main.mjs"] || manifest?.["home-ai-app-preview"];
  const runtimeSnapshot = runtimeFacade?.snapshot?.() || {};
  return {
    previewVersion: APP_PREVIEW_VERSION,
    phase: APP_PREVIEW_PHASE,
    productionDefaultShell: "vite",
    rootShellPath: HOME_AI_ROOT_PATH,
    builtPreviewPath: BUILT_PREVIEW_PATH,
    manifestPath: MANIFEST_PATH,
    manifestAvailable: Boolean(manifest),
    builtEntryFile: appEntry?.file || "",
    ownerConsoleIslandAvailable: Boolean(manifest?.["src/vite-islands/owner-system-console/main.mjs"]),
    aiOpsFeedbackIslandAvailable: Boolean(manifest?.["src/vite-islands/ai-ops-feedback/main.mjs"]),
    voiceInputStatusIslandAvailable: Boolean(manifest?.["src/vite-islands/voice-input-status/main.mjs"]),
    navigationShellIslandAvailable: Boolean(manifest?.["src/vite-islands/navigation-shell/main.mjs"]),
    documentPreviewIslandAvailable: Boolean(manifest?.["src/vite-islands/document-preview/main.mjs"]),
    pluginHostIslandAvailable: Boolean(manifest?.["src/vite-islands/plugin-host/main.mjs"]),
    dialogSheetIslandAvailable: Boolean(manifest?.["src/vite-islands/dialog-sheet/main.mjs"]),
    toastStatusIslandAvailable: Boolean(manifest?.["src/vite-islands/toast-status/main.mjs"]),
    pwaPushStatusIslandAvailable: Boolean(manifest?.["src/vite-islands/pwa-push-status/main.mjs"]),
    runtimeFacadeVersion: runtimeSnapshot.version || "",
    runtimeRoutePath: runtimeSnapshot.route?.pathname || "",
    runtimeNativeMode: runtimeSnapshot.native?.isNativeShell ? "native-shell" : "browser",
    runtimeHasAccessKey: Boolean(runtimeSnapshot.hasAccessKey),
  };
}

async function loadManifest() {
  if (import.meta.env?.DEV) return null;
  try {
    const response = await fetch(MANIFEST_PATH, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch (_error) {
    return null;
  }
}

function card(label, value, meta, tone = "preview") {
  return `
    <article class="vap-card">
      <p class="vap-card-label">${escapeHtml(label)}</p>
      <div class="vap-card-value">${escapeHtml(value)}</div>
      <p class="vap-meta"><span class="vap-badge ${escapeHtml(tone)}">${escapeHtml(tone === "ok" ? "可用" : tone === "blocked" ? "未切换" : "预览")}</span> ${escapeHtml(meta)}</p>
    </article>
  `;
}

function renderPreview(root, metadata) {
  root.innerHTML = `
    <div class="homeai-vite-app-preview">
      <div class="vap-shell">
        <header class="vap-topbar">
          <div>
            <p class="vap-eyebrow">Vite app preview host</p>
            <h1 class="vap-title">Home AI Vite 应用预览</h1>
            <p class="vap-subtitle">这是开发环境的完整应用预览入口。当前生产根 shell 是 Vite-only；本预览不替换生产根入口。</p>
          </div>
          <nav class="vap-actions" aria-label="预览入口">
            <a class="vap-button" href="${escapeHtml(HOME_AI_ROOT_PATH)}">打开 Home AI shell</a>
            <a class="vap-button secondary" href="${escapeHtml(OWNER_CONSOLE_PREVIEW_PATH)}">系统控制台预览</a>
            <a class="vap-button secondary" href="${escapeHtml(AI_OPS_FEEDBACK_PREVIEW_PATH)}">反馈菜单预览</a>
            <a class="vap-button secondary" href="${escapeHtml(VOICE_INPUT_STATUS_PREVIEW_PATH)}">语音状态预览</a>
            <a class="vap-button secondary" href="${escapeHtml(NAVIGATION_SHELL_PREVIEW_PATH)}">导航 Shell 预览</a>
            <a class="vap-button secondary" href="${escapeHtml(DOCUMENT_PREVIEW_PATH)}">文件预览策略</a>
            <a class="vap-button secondary" href="${escapeHtml(PLUGIN_HOST_PREVIEW_PATH)}">Plugin Host 预览</a>
            <a class="vap-button secondary" href="${escapeHtml(DIALOG_SHEET_PREVIEW_PATH)}">Dialog Sheet 预览</a>
            <a class="vap-button secondary" href="${escapeHtml(TOAST_STATUS_PREVIEW_PATH)}">Toast / Status 预览</a>
            <a class="vap-button secondary" href="${escapeHtml(PWA_PUSH_STATUS_PREVIEW_PATH)}">PWA Push 状态</a>
          </nav>
        </header>

        <section class="vap-grid" aria-label="预览状态">
          ${card("运行阶段", "Phase 2", "Runtime facade 已接入，业务 surface 后续迁移。", "preview")}
          ${card("生产默认入口", "Vite-only", "Classic runtime path 已退役。", "ok")}
          ${card("Runtime facade", metadata.runtimeFacadeVersion ? "已启用" : "未就绪", metadata.runtimeFacadeVersion || "not_collected", metadata.runtimeFacadeVersion ? "ok" : "blocked")}
        </section>

        <section class="vap-panel-grid">
          <article class="vap-panel">
            <h2 class="vap-panel-title">迁移边界</h2>
            <ul class="vap-list">
              <li>不加载 <code>public/index.html</code> 的 101 个 classic script tags。</li>
              <li>不读取 legacy 全局 state 或 boot-order globals。</li>
              <li>后续 surface 必须通过明确 import 或 runtime facade 接入。</li>
              <li><code>window.HomeAiRuntimeFacade</code> 仅作为过渡兼容点。</li>
              <li>回滚通过 Git/source history 和部署备份执行，不通过运行时 Classic switch。</li>
            </ul>
          </article>

          <article class="vap-panel">
            <h2 class="vap-panel-title">Build metadata</h2>
            <ul class="vap-list">
              <li>Preview version: <code>${escapeHtml(metadata.previewVersion)}</code></li>
              <li>Phase: <code>${escapeHtml(metadata.phase)}</code></li>
              <li>Runtime facade: <code>${escapeHtml(metadata.runtimeFacadeVersion || "not_collected")}</code></li>
              <li>Runtime route: <code>${escapeHtml(metadata.runtimeRoutePath || "not_collected")}</code></li>
              <li>Runtime mode: <code>${escapeHtml(metadata.runtimeNativeMode || "not_collected")}</code></li>
              <li>Built entry: <code>${escapeHtml(metadata.builtEntryFile || "not_collected")}</code></li>
              <li>Root shell: <code>${escapeHtml(metadata.rootShellPath)}</code></li>
              <li>Built preview: <code>${escapeHtml(metadata.builtPreviewPath)}</code></li>
              <li>AI Ops feedback island: <code>${metadata.aiOpsFeedbackIslandAvailable ? "available" : "not_collected"}</code></li>
              <li>Voice status island: <code>${metadata.voiceInputStatusIslandAvailable ? "available" : "not_collected"}</code></li>
              <li>Navigation shell island: <code>${metadata.navigationShellIslandAvailable ? "available" : "not_collected"}</code></li>
              <li>Document preview island: <code>${metadata.documentPreviewIslandAvailable ? "available" : "not_collected"}</code></li>
              <li>Plugin host island: <code>${metadata.pluginHostIslandAvailable ? "available" : "not_collected"}</code></li>
              <li>Dialog sheet island: <code>${metadata.dialogSheetIslandAvailable ? "available" : "not_collected"}</code></li>
              <li>Toast status island: <code>${metadata.toastStatusIslandAvailable ? "available" : "not_collected"}</code></li>
              <li>PWA push status island: <code>${metadata.pwaPushStatusIslandAvailable ? "available" : "not_collected"}</code></li>
            </ul>
          </article>
        </section>
      </div>
    </div>
  `;
  installStyles(root);
}

function renderError(root, error) {
  root.innerHTML = `
    <div class="homeai-vite-app-preview">
      <div class="vap-shell">
        <div class="vap-error">
          Vite 应用预览启动失败：${escapeHtml(error?.message || "unknown_error")}。请返回 Home AI shell，或查看开发控制台。
        </div>
      </div>
    </div>
  `;
  installStyles(root);
}

async function loadPreview(root) {
  try {
    if (new URLSearchParams(window.location.search).has("simulateError")) {
      throw new Error("simulated_preview_error");
    }
    const manifest = await loadManifest();
    renderPreview(root, buildMetadata(manifest));
  } catch (error) {
    renderError(root, error);
  }
}

export function mount(target = document.querySelector("[data-homeai-vite-app-preview]")) {
  if (!target) return null;
  installStyles(target);
  loadPreview(target);
  return {
    refresh: () => loadPreview(target),
  };
}

window.HomeAIViteAppPreview = Object.freeze({
  mount,
  buildMetadata,
  runtimeSnapshot: () => runtime.snapshot(),
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => mount(), { once: true });
} else {
  mount();
}
