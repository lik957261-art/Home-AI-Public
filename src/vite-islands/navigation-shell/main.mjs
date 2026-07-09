import cssText from "./style.css?inline";
import { createHomeAiRuntimeFacade } from "../../vite-app/runtime/home-ai-runtime-facade.mjs";
import {
  VIEW_MODES,
  buildNavigationShellViewModel,
  normalizeViewMode,
} from "./model.mjs";
import {
  navigationPreviewUrlForPatch,
  navigationRoutePatchFromCurrentRoute,
  previewRouteSummary,
  routePatchFromState,
} from "./route-sync-model.mjs";
import { loadTaskTopicRootThread } from "./task-topic-data-source.mjs";
import { buildTaskTopicReadStatePatch } from "./task-topic-cache-reconciliation-model.mjs";
import { findTaskTopicAction } from "./task-topic-action-model.mjs";
import { buildSelectedTopicViewModel } from "./task-topic-selected-view-model.mjs";
import {
  renderSelectedTopicDetailHtml,
  renderTaskTopicRootHtml,
} from "./task-topic-root-renderer.mjs";

const PREVIEW_VERSION = "20260702-vite-navigation-shell-dev-v1";
const browserRoot = typeof window !== "undefined" ? window : globalThis;
let popstateTarget = null;
let taskTopicLoadSeq = 0;

function previewThreadFixture() {
  return {
    id: "thread_vite_navigation_preview",
    taskGroups: [
      {
        id: "topic_daily_ops",
        title: "日常运维",
        summary: "检查 Gateway 与插件状态",
        status: "open",
        updatedAt: "2026-07-02T09:20:00.000Z",
      },
      {
        id: "topic_directory_docs",
        title: "Vite 改造文档",
        summary: "目录绑定话题",
        status: "open",
        updatedAt: "2026-07-02T10:00:00.000Z",
        directoryRoute: {
          workspaceId: "owner",
          projectId: "home-ai-docs",
          root: "/Home AI/docs",
          label: "Home AI / docs",
        },
      },
    ],
    pluginTopicGroups: [
      {
        id: "plugin_wardrobe_topic",
        pluginId: "wardrobe",
        pluginTopic: true,
        title: "衣橱",
        updatedAt: "2026-07-02T08:30:00.000Z",
      },
    ],
  };
}

function previewDetailThreadFixture() {
  return {
    id: "thread_vite_navigation_detail_preview",
    singleWindow: true,
    messagesPage: { mode: "tasks", taskGroupId: "topic_daily_ops", total: 2 },
    taskGroups: [
      {
        id: "topic_daily_ops",
        title: "日常运维详情",
        status: "open",
        updatedAt: "2026-07-02T09:25:00.000Z",
      },
    ],
  };
}

const runtime = browserRoot.HomeAiRuntimeFacade || createHomeAiRuntimeFacade({
  root: browserRoot,
  mode: "vite-navigation-shell-preview",
  clientVersion: PREVIEW_VERSION,
  appState: {
    auth: { isOwner: true },
    navigationShellPreview: true,
    selectedWorkspaceId: "owner",
    singleWindowMode: "task",
    currentThreadId: "thread_vite_navigation_detail_preview",
    currentThread: previewDetailThreadFixture(),
    taskListThreadId: "thread_vite_navigation_preview",
    taskListThread: previewThreadFixture(),
    taskListRootCache: { signature: "preview-topic-root" },
    topicRootCache: { signature: "preview-directory-topic-root" },
    viewMode: "tasks",
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
  if (root.querySelector("style[data-homeai-vite-navigation-shell-style]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-homeai-vite-navigation-shell-style", "true");
  style.textContent = cssText;
  root.prepend(style);
}

function runtimeState() {
  return runtime.state?.get?.() || {};
}

function previewDefaults(state = {}) {
  return {
    auth: Object.assign({ isOwner: true }, state.auth || {}),
    navigationShellPreview: true,
    selectedWorkspaceId: state.selectedWorkspaceId || "owner",
    singleWindowMode: state.singleWindowMode || "task",
    taskListRootCache: state.taskListRootCache || { signature: "preview-topic-root" },
    topicRootCache: state.topicRootCache || { signature: "preview-directory-topic-root" },
    currentThreadId: state.currentThreadId || "thread_vite_navigation_detail_preview",
    currentThread: state.currentThread || previewDetailThreadFixture(),
    taskListThreadId: state.taskListThreadId || "thread_vite_navigation_preview",
    taskListThread: state.taskListThread || previewThreadFixture(),
    viewMode: state.viewMode || "tasks",
  };
}

function routePatchFromBrowser() {
  return navigationRoutePatchFromCurrentRoute(runtime.route?.current?.()).routePatch;
}

function ensurePreviewStateFromRoute() {
  const state = runtimeState();
  runtime.state?.set?.(Object.assign(
    previewDefaults(state),
    state,
    routePatchFromBrowser(),
    { navigationShellPreview: true },
  ));
}

function syncPreviewRouteFromState(state = runtimeState(), options = {}) {
  const mode = options.mode === "replace" ? "replace" : "push";
  const routePatch = routePatchFromState(state);
  const nextUrl = navigationPreviewUrlForPatch(routePatch, runtime.route?.current?.());
  const current = runtime.route?.current?.() || {};
  const currentUrl = `${current.pathname || ""}${current.search || ""}`;
  if (nextUrl === currentUrl) return nextUrl;
  const historyState = Object.assign({}, browserRoot.history?.state || {}, {
    homeAiViteNavigationShellPreview: true,
    route: previewRouteSummary(routePatch),
  });
  if (mode === "replace") {
    runtime.route?.replace?.(nextUrl, historyState);
  } else {
    runtime.route?.push?.(nextUrl, historyState);
  }
  runtime.events?.emit?.("navigation-shell-preview:route-synced", {
    mode,
    url: nextUrl,
    route: previewRouteSummary(routePatch),
  });
  return nextUrl;
}

function patchTaskTopicReadState(patch = {}) {
  runtime.state?.set?.(Object.assign({
    navigationShellPreview: true,
  }, patch));
}

async function loadTaskTopicRoot(root, options = {}) {
  const seq = taskTopicLoadSeq + 1;
  taskTopicLoadSeq = seq;
  patchTaskTopicReadState({
    taskTopicReadStatus: "loading",
    taskTopicReadError: "",
    taskTopicReadSource: "",
  });
  if (root) {
    renderShell(root);
    wire(root);
  }
  const result = await loadTaskTopicRootThread({
    api: runtime.api,
    state: runtimeState(),
    threadId: options.threadId,
    taskGroupId: options.taskGroupId,
    messageLimit: options.messageLimit,
  });
  if (seq !== taskTopicLoadSeq) return result;
  patchTaskTopicReadState(buildTaskTopicReadStatePatch(result, runtimeState()));
  runtime.events?.emit?.("navigation-shell-preview:task-topic-root-read", {
    ok: Boolean(result.ok),
    skipped: Boolean(result.skipped),
    status: runtimeState().taskTopicReadStatus || "",
    error: runtimeState().taskTopicReadError || "",
    threadId: result.threadId || result.request?.threadId || "",
    taskGroupId: runtimeState().taskTopicReadTaskGroupId || "",
    messageCount: runtimeState().taskTopicReadMessageCount || 0,
    source: result.source || "",
  });
  if (root) {
    renderShell(root);
    wire(root);
  }
  return result;
}

function setViewMode(viewMode, options = {}) {
  const normalized = normalizeViewMode(viewMode);
  const nextPatch = {
    navigationShellPreview: true,
    viewMode: normalized,
    singleWindowMode: normalized === "tasks" ? "task" : "chat",
  };
  if (normalized !== "tasks") {
    Object.assign(nextPatch, {
      currentTaskGroupId: "",
      taskGroupId: "",
      pluginContextNavPluginId: "",
      pluginId: "",
    });
  }
  runtime.route?.setViewMode?.(normalized, { source: "vite-navigation-shell-preview" });
  runtime.state?.set?.(nextPatch);
  const url = syncPreviewRouteFromState(runtimeState(), { mode: options.historyMode || "push" });
  runtime.events?.emit?.("navigation-shell-preview:view-mode-changed", {
    viewMode: normalized,
    url,
  });
  if (normalized === "tasks" && options.loadRoot !== false) {
    loadTaskTopicRoot(options.root || null).catch((error) => {
      runtime.feedback?.error?.(error, { source: "vite-navigation-shell-preview" });
    });
  }
  return normalized;
}

function activateTopicAction(actionId, root) {
  const model = buildNavigationShellViewModel(runtimeState(), {
    isOwner: Boolean(runtimeState().auth?.isOwner),
  });
  const action = findTaskTopicAction(model.taskTopicActions, actionId);
  if (!action?.enabled) {
    runtime.events?.emit?.("navigation-shell-preview:topic-action-unavailable", {
      actionId,
      disabledReason: action?.disabledReason || "not_found",
    });
    return null;
  }
  runtime.state?.set?.(Object.assign({
    navigationShellPreview: true,
    lastTopicActionId: action.actionId,
    lastTopicActionKind: action.kind,
    lastClassicFallbackHref: action.classicFallbackHref,
  }, action.routePatch || {}));
  runtime.route?.setViewMode?.("tasks", {
    source: "vite-navigation-shell-preview",
    topicActionId: action.actionId,
  });
  const url = syncPreviewRouteFromState(runtimeState(), { mode: "push" });
  runtime.events?.emit?.("navigation-shell-preview:topic-action", {
    actionId: action.actionId,
    kind: action.kind,
    routePatch: action.routePatch,
    classicFallbackHref: action.classicFallbackHref,
    url,
  });
  renderShell(root);
  wire(root);
  loadTaskTopicRoot(root, {
    threadId: action.routePatch?.threadId,
    taskGroupId: action.routePatch?.taskGroupId,
  }).catch((error) => {
    runtime.feedback?.error?.(error, { source: "vite-navigation-shell-preview" });
  });
  return action;
}

function restorePreviewRouteFromHistory(root) {
  runtime.state?.set?.(Object.assign(
    previewDefaults(runtimeState()),
    runtimeState(),
    routePatchFromBrowser(),
    { navigationShellPreview: true },
  ));
  runtime.events?.emit?.("navigation-shell-preview:route-restored", {
    route: previewRouteSummary(routePatchFromState(runtimeState())),
  });
  renderShell(root);
  wire(root);
  loadTaskTopicRoot(root, {
    taskGroupId: runtimeState().currentTaskGroupId || runtimeState().taskGroupId || "",
  }).catch((error) => {
    runtime.feedback?.error?.(error, { source: "vite-navigation-shell-preview" });
  });
}

function wirePopstate(root) {
  if (popstateTarget === root) return;
  popstateTarget = root;
  browserRoot.addEventListener?.("popstate", () => {
    if (!popstateTarget) return;
    restorePreviewRouteFromHistory(popstateTarget);
  });
}

function tabButtons(model) {
  return model.tabs.map((tab) => `
    <button
      type="button"
      class="vns-tab${tab.selected ? " active" : ""}"
      data-vns-view-mode="${escapeHtml(tab.viewMode)}"
      aria-pressed="${tab.selected ? "true" : "false"}"
      ${tab.disabled ? "disabled" : ""}
    >
      <span>${escapeHtml(tab.label)}</span>
      <small>${escapeHtml(tab.surface)}</small>
    </button>
  `).join("");
}

function taskTopicReadStatusLabel(status = "") {
  switch (String(status || "")) {
    case "ok":
      return "已读取";
    case "loading":
      return "读取中";
    case "skipped":
      return "已跳过";
    case "error":
      return "读取失败";
    default:
      return "fixture";
  }
}

function taskTopicReadSourceLabel(source = "") {
  switch (String(source || "")) {
    case "vite_dev_preview_mock":
      return "Vite dev mock";
    case "thread_read_api":
      return "线程只读 API";
    default:
      return source || "fixture";
  }
}

function cacheFacts(cache, state = {}) {
  const rows = [
    ["任务根", cache.taskListRoot],
    ["话题根", cache.topicRoot],
    ["当前线程", cache.currentThread],
    ["缓存数量", String(cache.cacheCount)],
    ["数据读取", taskTopicReadStatusLabel(state.taskTopicReadStatus)],
    ["读取来源", taskTopicReadSourceLabel(state.taskTopicReadSource)],
  ];
  if (state.taskTopicReadError) rows.push(["读取错误", state.taskTopicReadError]);
  if (state.taskTopicReadTaskGroupId) rows.push(["选中话题", state.taskTopicReadTaskGroupId]);
  if (state.taskTopicReadMessageMode) rows.push(["消息模式", state.taskTopicReadMessageMode]);
  if (state.taskTopicReadMessageCount != null) rows.push(["消息数", String(state.taskTopicReadMessageCount)]);
  if (state.taskTopicReadLoadedMessageCount != null) rows.push(["已加载消息", String(state.taskTopicReadLoadedMessageCount)]);
  if (state.taskTopicReadHasMoreBefore) rows.push(["更多历史", "有"]);
  return rows.map(([label, value]) => `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `).join("");
}

function renderShell(root, state = runtimeState()) {
  const model = buildNavigationShellViewModel(state, {
    isOwner: Boolean(state.auth?.isOwner),
  });
  const selectedTopicView = buildSelectedTopicViewModel(state.taskTopicSelectedThread || state.taskListThread || {}, state);
  root.innerHTML = `
    <div class="homeai-vite-navigation-shell">
      <div class="vns-shell">
        <header class="vns-topbar">
          <div>
            <p class="vns-eyebrow">Vite island 开发预览</p>
            <h1 class="vns-title">导航 Shell 预览</h1>
            <p class="vns-subtitle">预览主导航、话题/任务入口和生产路由。当前页面不替换生产根 shell。</p>
          </div>
          <div class="vns-badges">
            <span class="vns-badge">${escapeHtml(runtime.mode || "vite-preview")}</span>
            <span class="vns-badge ok">${model.isOwner ? "Owner" : "成员"}</span>
          </div>
        </header>

        <nav class="vns-tabs" aria-label="主导航预览">
          ${tabButtons(model)}
        </nav>

        <section class="vns-panel" aria-label="导航状态">
          <div class="vns-active">
            <p class="vns-panel-label">当前 Surface</p>
            <h2>${escapeHtml(model.label)}</h2>
            <p>${escapeHtml(model.description)}</p>
            <a class="vns-link" href="${escapeHtml(model.classicFallbackHref)}">用生产 Shell 打开同一路由</a>
          </div>

          <dl class="vns-facts">
            <div><dt>View mode</dt><dd><code>${escapeHtml(model.viewMode)}</code></dd></div>
            <div><dt>Single window</dt><dd><code>${escapeHtml(model.singleWindowMode)}</code></dd></div>
            <div><dt>默认生产 Shell</dt><dd>${escapeHtml(model.productionDefaultShell)}</dd></div>
            <div><dt>迁移状态</dt><dd>${escapeHtml(model.migrationStatus)}</dd></div>
          </dl>
        </section>

        <section class="vns-grid" aria-label="缓存和边界">
          <article class="vns-card">
            <h2>缓存 Shell</h2>
            <dl class="vns-cache">
              ${cacheFacts(model.cache, state)}
            </dl>
          </article>
          <article class="vns-card">
            <h2>迁移边界</h2>
            <ul>
              ${model.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}
            </ul>
          </article>
        </section>

        ${renderTaskTopicRootHtml(model.taskTopicShell, model.taskTopicCompatibility, model.taskTopicActions)}
        ${renderSelectedTopicDetailHtml(selectedTopicView)}
      </div>
    </div>
  `;
  installStyles(root);
}

function wire(root) {
  root.querySelectorAll("[data-vns-view-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      setViewMode(button.dataset.vnsViewMode || "tasks", { historyMode: "push" });
      renderShell(root);
      wire(root);
    });
  });
  root.querySelectorAll("[data-vns-topic-action]").forEach((button) => {
    button.addEventListener("click", () => {
      activateTopicAction(button.dataset.vnsTopicAction || "", root);
    });
  });
}

export function mount(target = document.querySelector("[data-homeai-vite-navigation-shell]")) {
  if (!target) return null;
  installStyles(target);
  ensurePreviewStateFromRoute();
  syncPreviewRouteFromState(runtimeState(), { mode: "replace" });
  wirePopstate(target);
  renderShell(target);
  wire(target);
  loadTaskTopicRoot(target).catch((error) => {
    runtime.feedback?.error?.(error, { source: "vite-navigation-shell-preview" });
  });
  return {
    refresh() {
      renderShell(target);
      wire(target);
    },
    setViewMode(viewMode) {
      setViewMode(viewMode, { historyMode: "push" });
      renderShell(target);
      wire(target);
    },
    activateTopicAction(actionId) {
      return activateTopicAction(actionId, target);
    },
    loadTaskTopicRoot(options = {}) {
      return loadTaskTopicRoot(target, options);
    },
  };
}

browserRoot.HomeAIViteNavigationShellPreview = Object.freeze({
  mount,
  activateTopicAction: (actionId) => activateTopicAction(actionId, document.querySelector("[data-homeai-vite-navigation-shell]")),
  loadTaskTopicRoot: (options = {}) => loadTaskTopicRoot(document.querySelector("[data-homeai-vite-navigation-shell]"), options),
  modelPreview: (state = runtimeState(), options = {}) => buildNavigationShellViewModel(state, options),
  routePreview: () => previewRouteSummary(routePatchFromState(runtimeState())),
  runtimeSnapshot: () => runtime.snapshot(),
  viewModes: VIEW_MODES,
});

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mount(), { once: true });
  } else {
    mount();
  }
}
