import cssText from "./style.css?inline";
import { createHomeAiRuntimeFacade } from "../../vite-app/runtime/home-ai-runtime-facade.mjs";
import {
  buildPluginHostViewModel,
  decidePluginIframeLifecycleAction,
} from "./model.mjs";

const PREVIEW_VERSION = "20260703-vite-plugin-host-dev-v1";
const browserRoot = typeof window !== "undefined" ? window : globalThis;

const pluginDefinitions = Object.freeze([
  Object.freeze({
    id: "finance",
    title: "记账",
    manifestPath: "/api/hermes-plugins/finance/manifest",
    residentFrame: true,
  }),
  Object.freeze({
    id: "codex-mobile",
    title: "Codex Mobile",
    manifestPath: "/api/hermes-plugins/codex-mobile/manifest",
    residentFrame: true,
  }),
  Object.freeze({
    id: "movie",
    title: "电影",
    manifestPath: "/api/hermes-plugins/movie/manifest",
    residentFrame: true,
  }),
]);

const fallbackManifests = Object.freeze({
  finance: Object.freeze({
    ok: true,
    id: "finance",
    title: "记账",
    kind: "embedded_app",
    available: true,
    version: "vite-dev-plugin-host-fixture",
    workspaceId: "owner",
    entry: Object.freeze({
      url: "/plugins/finance/?workspaceId=owner&mode=vite-dev-preview",
      origin: "same-origin",
    }),
    embed: Object.freeze({
      tokenStatus: "not_required",
      refreshOnVersionChange: true,
    }),
    actions: Object.freeze(["record", "transactions"]),
  }),
});

const runtime = browserRoot.HomeAiRuntimeFacade || createHomeAiRuntimeFacade({
  root: browserRoot,
  mode: "vite-plugin-host-preview",
  clientVersion: PREVIEW_VERSION,
  appState: {
    selectedWorkspaceId: "owner",
    pluginHostPreview: true,
    selectedPluginId: "finance",
    pluginHostLastStatus: {
      level: "info",
      text: "插件 Host 预览使用 bounded manifest，不读取真实 launch token。",
    },
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
  if (root.querySelector("style[data-homeai-vite-plugin-host-style]")) return;
  const styleTarget = root.head || root;
  const style = document.createElement("style");
  style.setAttribute("data-homeai-vite-plugin-host-style", "true");
  style.textContent = cssText;
  styleTarget.prepend(style);
}

function currentState() {
  return runtime.state?.get?.() || {};
}

function selectedPluginId() {
  const state = currentState();
  const id = String(state.selectedPluginId || pluginDefinitions[0].id);
  return pluginDefinitions.some((definition) => definition.id === id) ? id : pluginDefinitions[0].id;
}

function selectedDefinition() {
  const id = selectedPluginId();
  return pluginDefinitions.find((definition) => definition.id === id) || pluginDefinitions[0];
}

function selectedManifest(definition = selectedDefinition()) {
  const state = currentState();
  return state.pluginHostManifest || fallbackManifests[definition.id] || {
    ok: false,
    id: definition.id,
    title: definition.title,
    kind: "embedded_app",
    available: false,
    code: "vite_plugin_host_manifest_not_loaded",
  };
}

function setStatus(level, text, detail = "") {
  runtime.state?.set?.({
    pluginHostLastStatus: {
      level: String(level || "info"),
      text: String(text || ""),
      detail: String(detail || ""),
    },
  });
  runtime.events?.emit?.("plugin-host-preview:status", {
    level: String(level || "info"),
    text: String(text || ""),
    detail: String(detail || ""),
  });
}

function statusModel() {
  const status = currentState().pluginHostLastStatus || {};
  return {
    level: String(status.level || "info"),
    text: String(status.text || "插件 Host 预览使用 bounded manifest，不读取真实 launch token。"),
    detail: String(status.detail || ""),
  };
}

function lifecycleScenario() {
  return currentState().pluginHostLifecycleScenario || {
    reason: "manifest_refresh",
    loaded: true,
    shellLoading: false,
    currentUrl: "/api/hermes-plugins/codex-mobile/proxy/?workspaceId=owner&launch=old-token",
    nextUrl: "/api/hermes-plugins/codex-mobile/proxy/?workspaceId=owner&launch=new-token",
    loadingStartedAt: 0,
    now: 15000,
  };
}

function pluginTabs(activeId) {
  return pluginDefinitions.map((definition) => `
    <button
      type="button"
      class="php-tab${definition.id === activeId ? " active" : ""}"
      data-plugin-id="${escapeHtml(definition.id)}"
      aria-pressed="${definition.id === activeId ? "true" : "false"}"
    >${escapeHtml(definition.title)}</button>
  `).join("");
}

function evidenceRows(model) {
  const rows = [
    ["Plugin", model.pluginId],
    ["状态", model.statusLabel],
    ["Workspace", model.workspaceId],
    ["Manifest", model.manifest.path],
    ["版本", model.manifest.version || "未返回"],
    ["入口", model.iframe.boundedEntryLabel || "不可用"],
    ["Launch token", model.refresh.usesLaunchToken ? "存在 · 已隐藏" : "未返回"],
    ["刷新策略", model.refresh.requiresFreshManifest ? "短 TTL + version refresh" : "常规 TTL"],
  ];
  return rows.map(([label, value]) => `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `).join("");
}

function renderIframePane(model) {
  if (!model.iframe.enabled) {
    return `
      <section class="php-frame unavailable">
        <p>${escapeHtml(model.statusLabel)}</p>
        <small>${escapeHtml(model.evidence.join(" · "))}</small>
      </section>
    `;
  }
  const srcdoc = `<!doctype html><html lang="zh-CN"><body style="margin:0;font:14px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;color:#15171a;display:grid;place-content:center;min-height:100vh;text-align:center"><main><strong>${escapeHtml(model.iframe.title)}</strong><br><span>Vite Plugin Host preview iframe</span></main></body></html>`;
  return `
    <section class="php-frame">
      <iframe
        title="${escapeHtml(model.iframe.title)}"
        srcdoc="${escapeHtml(srcdoc)}"
        data-intended-src="${escapeHtml(model.iframe.src)}"
        data-plugin-id="${escapeHtml(model.pluginId)}"
        loading="lazy"
      ></iframe>
    </section>
  `;
}

function lifecyclePanel(model) {
  const decision = decidePluginIframeLifecycleAction(Object.assign({
    pluginId: model.pluginId,
    manifest: { id: model.pluginId, entry: { url: model.iframe.src } },
  }, lifecycleScenario()));
  return `
    <section class="php-lifecycle" aria-label="Plugin iframe lifecycle evidence">
      <div>
        <strong>iframe lifecycle：${escapeHtml(decision.action)}</strong>
        <small>${escapeHtml(decision.explanation)}</small>
      </div>
      <div class="php-toolbar compact">
        <button type="button" data-lifecycle-scenario="token_refresh">token refresh</button>
        <button type="button" data-lifecycle-scenario="loaded_timeout">loaded timeout</button>
        <button type="button" data-lifecycle-scenario="loading_timeout">loading timeout</button>
        <button type="button" data-lifecycle-scenario="entry_change">entry change</button>
      </div>
      <p class="php-status info">${escapeHtml(decision.boundedEvidence.join(" · "))}</p>
    </section>
  `;
}

function renderShell(root) {
  const definition = selectedDefinition();
  const manifest = selectedManifest(definition);
  const model = buildPluginHostViewModel(definition, manifest, {
    workspaceId: currentState().selectedWorkspaceId || "owner",
    isOwner: currentState().isOwner !== false,
    currentProtocol: browserRoot.location?.protocol || "https:",
  });
  const status = statusModel();
  root.innerHTML = `
    <div class="homeai-vite-plugin-host">
      <div class="php-shell">
        <header class="php-topbar">
          <div>
            <p class="php-eyebrow">Vite island 开发预览</p>
            <h1 class="php-title">Plugin Host</h1>
          </div>
          <span class="php-badge ${escapeHtml(model.status)}">${escapeHtml(model.statusLabel)}</span>
        </header>
        <nav class="php-tabs" aria-label="Plugin preview tabs">
          ${pluginTabs(model.pluginId)}
        </nav>
        <div class="php-toolbar">
          <button type="button" data-refresh-manifest>刷新 manifest</button>
          <button type="button" data-owner-toggle>${currentState().isOwner === false ? "切到 Owner" : "模拟非 Owner"}</button>
        </div>
        <p class="php-status ${escapeHtml(status.level)}">${escapeHtml(status.text)}${status.detail ? ` · ${escapeHtml(status.detail)}` : ""}</p>
        ${renderIframePane(model)}
        ${lifecyclePanel(model)}
        <dl class="php-evidence">${evidenceRows(model)}</dl>
      </div>
    </div>
  `;
}

async function refreshManifest(root) {
  const definition = selectedDefinition();
  const workspaceId = String(currentState().selectedWorkspaceId || "owner");
  const query = new URLSearchParams({ workspaceId });
  setStatus("loading", "正在读取 bounded manifest");
  try {
    const manifest = await runtime.api(`${definition.manifestPath}?${query.toString()}`);
    runtime.state?.set?.({
      pluginHostManifest: manifest,
    });
    setStatus("ok", "Manifest 已读取", manifest?.version || "");
  } catch (error) {
    runtime.state?.set?.({
      pluginHostManifest: {
        ok: false,
        id: definition.id,
        title: definition.title,
        kind: "embedded_app",
        available: false,
        code: error?.message || "manifest_read_failed",
      },
    });
    setStatus("error", "Manifest 读取失败", error?.message || "unknown");
  }
  renderShell(root);
}

function bindActions(root) {
  root.addEventListener("click", (event) => {
    const tab = event.target?.closest?.("[data-plugin-id]");
    if (tab) {
      runtime.state?.set?.({
        selectedPluginId: tab.getAttribute("data-plugin-id"),
        pluginHostManifest: null,
      });
      setStatus("info", "已切换 Plugin，等待读取 manifest");
      renderShell(root);
      return;
    }
    const lifecycleButton = event.target?.closest?.("[data-lifecycle-scenario]");
    if (lifecycleButton) {
      const scenario = lifecycleButton.getAttribute("data-lifecycle-scenario");
      const baseUrl = "/api/hermes-plugins/codex-mobile/proxy/?workspaceId=owner";
      const scenarios = {
        token_refresh: {
          reason: "manifest_refresh",
          loaded: true,
          shellLoading: false,
          currentUrl: `${baseUrl}&launch=old-token`,
          nextUrl: `${baseUrl}&launch=new-token`,
          loadingStartedAt: 0,
          now: 15000,
        },
        loaded_timeout: {
          reason: "navigation_health_timeout",
          loaded: true,
          shellLoading: false,
          currentUrl: `${baseUrl}&launch=stable`,
          nextUrl: `${baseUrl}&launch=stable`,
          loadingStartedAt: 0,
          now: 30000,
        },
        loading_timeout: {
          reason: "navigation_health_timeout",
          loaded: false,
          shellLoading: true,
          currentUrl: `${baseUrl}&launch=stable`,
          nextUrl: `${baseUrl}&launch=stable`,
          loadingStartedAt: 0,
          now: 30000,
          healthTimeoutMs: 12000,
        },
        entry_change: {
          reason: "manifest_refresh",
          loaded: true,
          shellLoading: false,
          currentUrl: `${baseUrl}&pluginRoute=thread-list&launch=old-token`,
          nextUrl: `${baseUrl}&pluginRoute=quota&launch=new-token`,
          loadingStartedAt: 0,
          now: 30000,
        },
      };
      runtime.state?.set?.({ pluginHostLifecycleScenario: scenarios[scenario] || scenarios.token_refresh });
      setStatus("info", "iframe lifecycle scenario 已更新", scenario);
      renderShell(root);
      return;
    }
    if (event.target?.closest?.("[data-refresh-manifest]")) {
      refreshManifest(root);
      return;
    }
    if (event.target?.closest?.("[data-owner-toggle]")) {
      runtime.state?.set?.({ isOwner: currentState().isOwner === false });
      setStatus("info", "权限状态已切换");
      renderShell(root);
    }
  });
}

function mount() {
  const root = document.querySelector("[data-vite-plugin-host-root]");
  if (!root) return;
  installStyles(document);
  renderShell(root);
  bindActions(root);
  browserRoot.HomeAIVitePluginHostPreview = Object.freeze({
    version: PREVIEW_VERSION,
    render: () => renderShell(root),
    refreshManifest: () => refreshManifest(root),
    selectPlugin: (pluginId) => {
      runtime.state?.set?.({ selectedPluginId: String(pluginId || "finance"), pluginHostManifest: null });
      renderShell(root);
    },
    state: () => runtime.state?.get?.() || {},
  });
}

mount();
