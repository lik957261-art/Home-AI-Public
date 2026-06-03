"use strict";

const PLUGIN_TOPIC_DEFS = Object.freeze([
  Object.freeze({
    id: "wardrobe",
    viewMode: "wardrobe",
    label: "\u8863\u6a71",
    subtitle: "\u642d\u914d\u3001\u5165\u5e93\u548c\u98ce\u683c\u5206\u6790",
    iconClass: "nav-wardrobe-icon",
    appIconClass: "wardrobe",
    appIconGlyph: "\u8863",
    toolset: "wardrobe",
    deliveryHints: ["wardrobe", "\u8863\u6a71", "\u642d\u914d", "\u7a7f\u642d"],
  }),
  Object.freeze({
    id: "finance",
    viewMode: "finance",
    label: "\u8bb0\u8d26",
    subtitle: "\u8d26\u672c\u3001\u6d41\u6c34\u548c\u7edf\u8ba1\u62a5\u544a",
    iconClass: "nav-finance-icon",
    appIconClass: "finance",
    appIconGlyph: "\u00a5",
    toolset: "finance",
    deliveryHints: ["finance", "\u8bb0\u8d26", "\u8d22\u52a1", "\u8d26\u672c"],
  }),
  Object.freeze({
    id: "email",
    viewMode: "email",
    label: "\u90ae\u7bb1",
    subtitle: "\u90ae\u4ef6\u6e05\u6d17\u3001\u641c\u7d22\u548c\u6458\u8981",
    iconClass: "nav-email-icon",
    appIconClass: "outlook",
    appIconGlyph: "O",
    toolset: "email",
    deliveryHints: ["email", "\u90ae\u7bb1", "\u90ae\u4ef6", "\u6536\u4ef6"],
  }),
  Object.freeze({
    id: "health",
    viewMode: "health",
    label: "\u5065\u5eb7",
    subtitle: "\u8bad\u7ec3\u3001\u8eab\u4f53\u6307\u6807\u548c\u5065\u5eb7\u62a5\u544a",
    iconClass: "nav-health-icon",
    appIconClass: "health",
    appIconGlyph: "+",
    toolset: "health",
    deliveryHints: ["health", "\u5065\u5eb7", "\u8bad\u7ec3", "\u4f53\u91cd", "\u7528\u836f"],
  }),
  Object.freeze({
    id: "note",
    viewMode: "note",
    label: "\u7b14\u8bb0",
    subtitle: "\u7b14\u8bb0\u3001\u6458\u8981\u548c\u8d44\u6599\u6574\u7406",
    iconClass: "nav-note-icon",
    appIconClass: "note",
    appIconGlyph: "N",
    toolset: "note",
    deliveryHints: ["note", "\u7b14\u8bb0", "\u6458\u8981", "\u8d44\u6599"],
  }),
  Object.freeze({
    id: "directory",
    builtinKind: "directory",
    viewMode: "projects",
    label: "\u76ee\u5f55",
    subtitle: "\u6587\u4ef6\u3001\u8d44\u6599\u548c\u76ee\u5f55\u8bdd\u9898",
    iconClass: "nav-directory-icon",
    appIconClass: "directory",
    appIconGlyph: "\u76ee",
    toolset: "",
    deliveryHints: ["directory", "\u76ee\u5f55", "\u6587\u4ef6", "\u8d44\u6599"],
  }),
]);
const PLUGIN_TOPIC_USAGE_STORAGE_KEY = "hermesPluginTopicUsage";
const PLUGIN_TOPIC_ORDER_STORAGE_KEY = "hermesPluginTopicOrder";
let pluginAppSortDrag = null;

function pluginTopicId(value = "") {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function pluginTopicGroupId(pluginId = "") {
  const id = pluginTopicId(pluginId);
  return id ? `plugin:${id}` : "";
}

function pluginTopicDefById(pluginId = "") {
  const id = pluginTopicId(pluginId);
  return PLUGIN_TOPIC_DEFS.find((item) => item.id === id) || null;
}

function pluginTopicDefForGroupId(taskGroupId = "") {
  const text = String(taskGroupId || "").trim();
  if (!text.startsWith("plugin:")) return null;
  return pluginTopicDefById(text.slice("plugin:".length));
}

function pluginTopicDefForViewMode(viewMode = state.viewMode) {
  const mode = String(viewMode || "").trim();
  if (!mode) return null;
  const viewModeDef = PLUGIN_TOPIC_DEFS.find((item) => !item.builtinKind && item.viewMode === mode) || null;
  if (viewModeDef) return viewModeDef;
  if (mode === "tasks") {
    const groupDef = pluginTopicDefForGroupId(state.currentTaskGroupId);
    if (groupDef && !groupDef.builtinKind) return groupDef;
  }
  const contextDef = pluginTopicDefById(state.pluginContextNavPluginId);
  if (!contextDef || contextDef.builtinKind) return null;
  if (mode === "tasks" && state.currentTaskGroupId === pluginTopicGroupId(contextDef.id)) return contextDef;
  if (mode === "projects") return contextDef;
  return null;
}

function pluginTopicBottomButtonId(def) {
  const id = String(def?.id || "").trim();
  if (id === "wardrobe") return "bottomWardrobeMode";
  if (id === "finance") return "bottomFinanceMode";
  if (id === "email") return "bottomEmailMode";
  if (id === "health") return "bottomHealthMode";
  if (id === "note") return "bottomNoteMode";
  return "";
}

function hideActivePluginHostsForPluginTopicNavigation() {
  if (typeof setWardrobePluginHostVisible === "function") setWardrobePluginHostVisible(false);
  if (typeof setEmbeddedPluginHostVisible === "function" && typeof EMBEDDED_PLUGIN_DEFS === "object") {
    Object.values(EMBEDDED_PLUGIN_DEFS || {}).forEach((def) => setEmbeddedPluginHostVisible(def, false));
  }
  const app = $("app");
  app?.classList.remove("wardrobe-plugin-host-active", "embedded-plugin-host-active");
  ["codex", "finance", "email", "health", "note"].forEach((id) => {
    app?.classList.remove(`${id}-plugin-host-active`);
  });
}

function exitPluginContextToTopicHome() {
  hideActivePluginHostsForPluginTopicNavigation();
  if (typeof closeBottomPluginMenu === "function") closeBottomPluginMenu();
  clearQuotedReply({ render: false });
  state.scrollFeedback = null;
  state.sidebarSwipe = null;
  state.pluginContextNavPluginId = "";
  state.viewMode = "tasks";
  state.currentTaskGroupId = "";
  state.taskDirectoryFilter = null;
  state.pendingTaskDirectory = null;
  state.pendingTaskReasoningEffort = "";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  if (typeof normalizeMobileViewportAfterViewChange === "function") normalizeMobileViewportAfterViewChange();
  if (typeof applyViewMode === "function") applyViewMode();
  renderPluginContextTopicHomeAfterExit();
}

function renderPluginContextTopicHomeAfterExit() {
  const restoreScrollTop = typeof taskListReturnScrollTop === "function" ? taskListReturnScrollTop() : 0;
  const cached = state.taskListThread;
  const selectedWorkspaceId = String(state.selectedWorkspaceId || "").trim();
  const cachedMatchesWorkspace = cached?.id && (
    !selectedWorkspaceId
    || cached.workspaceId === selectedWorkspaceId
    || (typeof threadGroupMemberIds === "function" && threadGroupMemberIds(cached).includes(selectedWorkspaceId))
  );
  if (cachedMatchesWorkspace) {
    state.currentThread = cached;
    state.currentThreadId = cached.id;
    if (typeof summarizeThread === "function") state.threads = [summarizeThread(cached)];
  } else if (state.currentThread?.singleWindow && typeof summarizeThread === "function") {
    state.threads = [summarizeThread(state.currentThread)];
  }
  if (typeof renderThreads === "function") renderThreads();
  if (typeof renderCurrentThread === "function") renderCurrentThread({ stickToBottom: false, restoreScrollTop });
  if (typeof updateNavigationControls === "function") updateNavigationControls();
  if (typeof updateTopicPluginDockChrome === "function" && typeof isTaskListView === "function") updateTopicPluginDockChrome(isTaskListView());
}

function isPluginTopicTaskGroup(group = {}) {
  if (group?.pluginTopic) return true;
  return Boolean(pluginTopicDefForGroupId(group?.id || group?.taskGroupId || ""));
}

function pluginTopicNavigationAvailable(def) {
  if (!def?.id) return false;
  if (def.builtinKind === "directory") return true;
  if (def.id === "wardrobe") {
    return typeof wardrobePluginNavigationAvailable === "function" && wardrobePluginNavigationAvailable();
  }
  const embeddedDef = typeof EMBEDDED_PLUGIN_DEFS !== "undefined" ? EMBEDDED_PLUGIN_DEFS[def.id] : null;
  return Boolean(embeddedDef && typeof embeddedPluginNavigationAvailable === "function" && embeddedPluginNavigationAvailable(embeddedDef));
}

function availablePluginTopicDefs() {
  return PLUGIN_TOPIC_DEFS.filter(pluginTopicNavigationAvailable);
}

function readPluginTopicUsage() {
  try {
    const raw = localStorage.getItem(PLUGIN_TOPIC_USAGE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writePluginTopicUsage(usage) {
  try {
    localStorage.setItem(PLUGIN_TOPIC_USAGE_STORAGE_KEY, JSON.stringify(usage || {}));
  } catch {
    // Best-effort ordering hint only; navigation must not depend on localStorage.
  }
}

function recordPluginTopicUsage(pluginId) {
  const def = pluginTopicDefById(pluginId);
  if (!def || def.builtinKind) return;
  const usage = readPluginTopicUsage();
  const current = usage[def.id] && typeof usage[def.id] === "object" ? usage[def.id] : {};
  usage[def.id] = {
    count: Math.max(0, Number(current.count) || 0) + 1,
    lastUsedAt: Date.now(),
  };
  writePluginTopicUsage(usage);
}

function pluginTopicDefinitionIndex(pluginId) {
  const id = pluginTopicId(pluginId);
  const index = PLUGIN_TOPIC_DEFS.findIndex((item) => item.id === id);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function readPluginTopicOrder() {
  try {
    const raw = localStorage.getItem(PLUGIN_TOPIC_ORDER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(pluginTopicId).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writePluginTopicOrder(ids = []) {
  try {
    localStorage.setItem(PLUGIN_TOPIC_ORDER_STORAGE_KEY, JSON.stringify(ids.map(pluginTopicId).filter(Boolean)));
  } catch {
    // Manual order is a local preference; navigation must still work without it.
  }
}

function orderedPluginAppDefs(defs = []) {
  const manualOrder = readPluginTopicOrder();
  const manualIndex = new Map(manualOrder.map((id, index) => [id, index]));
  return [...defs].sort((a, b) => {
    const aManual = manualIndex.has(a.id) ? manualIndex.get(a.id) : Number.MAX_SAFE_INTEGER;
    const bManual = manualIndex.has(b.id) ? manualIndex.get(b.id) : Number.MAX_SAFE_INTEGER;
    if (aManual !== bManual) return aManual - bManual;
    return pluginTopicDefinitionIndex(a.id) - pluginTopicDefinitionIndex(b.id);
  });
}

function persistPluginAppOrderFromStrip(strip) {
  const ids = [...(strip?.querySelectorAll?.("[data-plugin-topic-sort-id]") || [])]
    .map((item) => item.dataset.pluginTopicSortId || "")
    .filter(Boolean);
  if (ids.length) writePluginTopicOrder(ids);
}

function pluginTopicSearchText(def) {
  return [
    def?.id,
    def?.label,
    def?.subtitle,
    def?.toolset,
    ...(Array.isArray(def?.deliveryHints) ? def.deliveryHints : []),
  ].filter(Boolean).join("\n").toLowerCase();
}

function pluginTopicDirectoryProjectText(project) {
  return [
    project?.id,
    project?.label,
    project?.root,
    project?.source,
    ...(Array.isArray(project?.aliases) ? project.aliases : []),
  ].filter(Boolean).join("\n").toLowerCase();
}

function pluginTopicDirectoryBasePath() {
  const workspace = typeof currentWorkspace === "function" ? currentWorkspace() : null;
  return String(workspace?.defaultWorkspace || "").trim()
    || (typeof directoryRootCreateBasePath === "function" ? directoryRootCreateBasePath() : "")
    || (typeof currentDirectoryTarget === "function" ? currentDirectoryTarget()?.root || "" : "");
}

function pluginTopicJoinPath(base, ...segments) {
  const root = String(base || "").trim().replace(/[\\/]+$/g, "");
  if (!root) return "";
  const separator = root.includes("\\") ? "\\" : "/";
  const tail = segments
    .map((item) => String(item || "").trim().replace(/^[\\/]+|[\\/]+$/g, ""))
    .filter(Boolean)
    .join(separator);
  return tail ? `${root}${separator}${tail}` : root;
}

function pluginTopicFolderName(def) {
  return String(def?.label || def?.id || "").trim();
}

function pluginTopicDirectoryPath(def) {
  const base = pluginTopicDirectoryBasePath();
  const folder = pluginTopicFolderName(def);
  return base && folder ? pluginTopicJoinPath(base, "\u63d2\u4ef6", folder) : "";
}

function pluginTopicDirectoryRoute(def) {
  const path = pluginTopicDirectoryPath(def);
  if (!path) return null;
  const project = (typeof matchingDirectoryProject === "function" ? matchingDirectoryProject(path) : null)
    || (typeof currentDirectoryTarget === "function" ? currentDirectoryTarget() : null);
  if (!project?.id || !project?.root || typeof directoryAttachmentFromRoute !== "function") return null;
  return directoryAttachmentFromRoute(project.id, "", path, `${def.label} \u8d44\u6599`);
}

function pluginTopicDeliveryAttachment(def) {
  return pluginTopicDirectoryRoute(def);
}

async function pluginTopicCreateDirectory(path, name) {
  const safeName = String(name || "").trim();
  if (!path || !safeName) return;
  const threadId = await ensureDirectoryThread();
  try {
    await api("/api/directories/create", {
      method: "POST",
      body: JSON.stringify({ threadId, path, name: safeName }),
    });
  } catch (err) {
    if (err?.status !== 409 && !/already exists/i.test(err?.message || "")) throw err;
  }
}

async function ensurePluginTopicDirectory(def) {
  const base = pluginTopicDirectoryBasePath();
  const folder = pluginTopicFolderName(def);
  if (!base || !folder) throw new Error("\u63d2\u4ef6\u76ee\u5f55\u6839\u8def\u5f84\u4e0d\u53ef\u7528\u3002");
  await pluginTopicCreateDirectory(base, "\u63d2\u4ef6");
  const pluginRoot = pluginTopicJoinPath(base, "\u63d2\u4ef6");
  await pluginTopicCreateDirectory(pluginRoot, folder);
  await loadProjects();
  return pluginTopicDirectoryRoute(def) || {
    projectId: currentProject()?.id || "",
    subprojectId: "",
    label: `${def.label} \u8d44\u6599`,
    path: pluginTopicJoinPath(pluginRoot, folder),
    root: directoryRootForPath(pluginTopicJoinPath(pluginRoot, folder), base),
  };
}

function pluginTopicMessages(thread, taskGroupId) {
  return (thread?.messages || []).filter((message) => String(message?.taskGroupId || "") === taskGroupId);
}

function pluginTopicGroupsForTaskList(thread) {
  return availablePluginTopicDefs().filter((def) => !def.builtinKind).map((def) => {
    const id = pluginTopicGroupId(def.id);
    const messages = pluginTopicMessages(thread, id);
    const latest = messages[messages.length - 1] || null;
    const delivery = pluginTopicDeliveryAttachment(def);
    return {
      id,
      pluginTopic: true,
      pluginId: def.id,
      title: def.label,
      prompt: def.subtitle,
      summary: def.toolset ? `MCP: ${def.toolset}` : "",
      updatedAt: latest?.updatedAt || latest?.createdAt || "0000-00-00T00:00:00.000Z",
      messages,
      directoryRoute: delivery || null,
    };
  });
}

function renderPluginTopicActions(def) {
  if (def?.builtinKind === "directory") return "";
  return `<div class="plugin-topic-actions" aria-label="${escapeHtml(`${def.label}\u5feb\u6377\u64cd\u4f5c`)}">
    <button class="plugin-topic-action" type="button" data-plugin-topic-open-topic="${escapeHtml(def.id)}" aria-label="${escapeHtml(`\u6253\u5f00${def.label}\u8bdd\u9898`)}" title="\u8bdd\u9898">
      <span class="plugin-topic-action-icon chat" aria-hidden="true"></span>
    </button>
    <button class="plugin-topic-action" type="button" data-plugin-topic-open-delivery="${escapeHtml(def.id)}" aria-label="${escapeHtml(`\u6253\u5f00${def.label}\u8d44\u6599\u76ee\u5f55`)}" title="\u8d44\u6599\u76ee\u5f55">
      <span class="plugin-topic-action-icon folder" aria-hidden="true"></span>
    </button>
  </div>`;
}

function renderPluginTopicStats(def, options = {}) {
  if (def?.builtinKind !== "directory") return "";
  const rootCount = Number(options.directoryRootCount || 0);
  const topicCount = Number(options.directoryTopicCount || 0);
  const stats = [
    rootCount > 0 ? `${rootCount} \u4e2a\u76ee\u5f55` : "",
    `${Math.max(0, topicCount)} \u4e2a\u7ed1\u5b9a\u8bdd\u9898`,
  ].filter(Boolean);
  return `<span class="plugin-topic-stats">${stats.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</span>`;
}

function renderPluginTopicCards(options = {}) {
  const defs = availablePluginTopicDefs().filter((def) => def.builtinKind === "directory");
  if (!defs.length) return "";
  return `<section class="plugin-topic-launcher" aria-label="\u63d2\u4ef6\u4e3b\u9898">
    <div class="plugin-topic-grid">
      ${defs.map((def) => {
        const specialClass = def.builtinKind === "directory" ? " directory-special-plugin" : "";
        return `
        <article class="plugin-topic-card${specialClass}" data-plugin-topic-card="${escapeHtml(def.id)}">
          <button class="plugin-topic-card-main" type="button" data-plugin-topic-open-app="${escapeHtml(def.id)}" aria-label="${escapeHtml(`\u6253\u5f00${def.label}\u63d2\u4ef6`)}">
            <span class="plugin-topic-app-icon ${escapeHtml(def.appIconClass || def.id)}" data-plugin-icon="${escapeHtml(def.appIconGlyph || "")}" aria-hidden="true"></span>
            <span class="plugin-topic-text">
              <span class="plugin-topic-title">${escapeHtml(def.label)}</span>
              <span class="plugin-topic-subtitle">${escapeHtml(def.subtitle)}</span>
              ${renderPluginTopicStats(def, options)}
            </span>
          </button>
          ${renderPluginTopicActions(def)}
        </article>
      `;
      }).join("")}
    </div>
  </section>`;
}

function renderPluginAppLauncher() {
  const defs = orderedPluginAppDefs(availablePluginTopicDefs().filter((def) => !def.builtinKind));
  if (!defs.length) return "";
  return `<section class="plugin-app-launcher" aria-label="\u63d2\u4ef6\u5e94\u7528">
    <div class="plugin-app-strip" role="list">
      ${defs.map((def) => `
        <button class="plugin-app-card" type="button" role="listitem" data-plugin-topic-open-app="${escapeHtml(def.id)}" data-plugin-topic-sort-id="${escapeHtml(def.id)}" aria-label="${escapeHtml(`\u6253\u5f00${def.label}\u63d2\u4ef6`)}">
          <span class="plugin-topic-app-icon ${escapeHtml(def.appIconClass || def.id)}" data-plugin-icon="${escapeHtml(def.appIconGlyph || "")}" aria-hidden="true"></span>
          <span class="plugin-app-label">${escapeHtml(def.label)}</span>
        </button>
      `).join("")}
    </div>
  </section>`;
}

async function openBuiltInDirectoryPlugin() {
  if (typeof preparePrimaryNavigationChange === "function") preparePrimaryNavigationChange();
  else if (typeof closeBottomPluginMenu === "function") closeBottomPluginMenu();
  clearQuotedReply({ render: false });
  if (typeof normalizeMobileViewportAfterViewChange === "function") normalizeMobileViewportAfterViewChange();
  state.directoryReturnRoute = typeof captureDirectoryReturnRoute === "function" ? captureDirectoryReturnRoute() : null;
  state.viewMode = "projects";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentTaskGroupId = "";
  state.currentThread = null;
  state.currentThreadId = "";
  if (typeof resetDirectoryPath === "function") resetDirectoryPath();
  await loadProjects();
  await loadDirectoryView({ resetPath: true });
}

async function openBuiltInDirectoryTopicList() {
  if (typeof preparePrimaryNavigationChange === "function") preparePrimaryNavigationChange();
  else if (typeof closeBottomPluginMenu === "function") closeBottomPluginMenu();
  clearQuotedReply({ render: false });
  if (typeof normalizeMobileViewportAfterViewChange === "function") normalizeMobileViewportAfterViewChange();
  state.viewMode = "tasks";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentTaskGroupId = "";
  await loadSelectedView({ forceTaskListReload: true });
}

async function openPluginTopicApp(pluginId) {
  const def = pluginTopicDefById(pluginId);
  if (!def || !pluginTopicNavigationAvailable(def)) return;
  if (def.builtinKind === "directory") {
    await openBuiltInDirectoryPlugin();
    return;
  }
  recordPluginTopicUsage(def.id);
  if (typeof preparePrimaryNavigationChange === "function") preparePrimaryNavigationChange();
  else if (typeof closeBottomPluginMenu === "function") closeBottomPluginMenu();
  clearQuotedReply({ render: false });
  state.pluginContextNavPluginId = def.id;
  if (def.id === "wardrobe" && typeof rememberWardrobePluginReturnRoute === "function") rememberWardrobePluginReturnRoute();
  if (def.id === "finance" && typeof rememberFinancePluginReturnRoute === "function") rememberFinancePluginReturnRoute();
  if (def.id === "email" && typeof rememberEmailPluginReturnRoute === "function") rememberEmailPluginReturnRoute();
  if (def.id === "health" && typeof rememberHealthPluginReturnRoute === "function") rememberHealthPluginReturnRoute();
  if (def.id === "note" && typeof rememberNotePluginReturnRoute === "function") rememberNotePluginReturnRoute();
  state.viewMode = def.viewMode;
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentTaskGroupId = "";
  state.currentThread = null;
  state.currentThreadId = "";
  await loadSelectedView();
}

async function openPluginTopicChat(pluginId, options = {}) {
  const def = pluginTopicDefById(pluginId);
  if (!def || !pluginTopicNavigationAvailable(def)) return;
  if (def.builtinKind === "directory") {
    await openBuiltInDirectoryTopicList();
    return;
  }
  const deferViewModeApplyUntilLoaded = Boolean(options.deferViewModeApplyUntilLoaded);
  if (typeof preparePrimaryNavigationChange === "function") preparePrimaryNavigationChange();
  else if (typeof closeBottomPluginMenu === "function") closeBottomPluginMenu();
  hideActivePluginHostsForPluginTopicNavigation();
  clearQuotedReply({ render: false });
  state.pluginContextNavPluginId = def.id;
  state.viewMode = "tasks";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentTaskGroupId = pluginTopicGroupId(def.id);
  state.taskDirectoryFilter = null;
  state.pendingTaskDirectory = pluginTopicDeliveryAttachment(def);
  state.pendingTaskReasoningEffort = "";
  state.pendingTaskReasoningExplicit = false;
  if (typeof normalizeMobileViewportAfterViewChange === "function") normalizeMobileViewportAfterViewChange();
  if (!deferViewModeApplyUntilLoaded && typeof applyViewMode === "function") applyViewMode();
  await loadSingleWindow();
  if (deferViewModeApplyUntilLoaded && typeof applyViewMode === "function") applyViewMode();
  ensurePluginTopicDirectory(def)
    .then((directory) => {
      if (state.viewMode === "tasks" && state.currentTaskGroupId === pluginTopicGroupId(def.id)) {
        state.pendingTaskDirectory = directory;
      }
    })
    .catch((err) => {
      const message = err?.message || String(err || "");
      if (message) showPushToast(`插件目录暂时不可用：${message}`, "warning");
    });
  if (isMobileLayout()) closeSidebar();
  focusComposerSoon();
}

async function openPluginTopicDelivery(pluginId) {
  const def = pluginTopicDefById(pluginId);
  if (!def || !pluginTopicNavigationAvailable(def)) return;
  if (def.builtinKind === "directory") {
    await openBuiltInDirectoryPlugin();
    return;
  }
  if (typeof preparePrimaryNavigationChange === "function") preparePrimaryNavigationChange();
  else if (typeof closeBottomPluginMenu === "function") closeBottomPluginMenu();
  hideActivePluginHostsForPluginTopicNavigation();
  clearQuotedReply({ render: false });
  state.pluginContextNavPluginId = def.id;
  const returnRoute = typeof captureDirectoryReturnRoute === "function" ? captureDirectoryReturnRoute() : null;
  if (returnRoute) {
    returnRoute.viewMode = "tasks";
    returnRoute.currentTaskGroupId = "";
  }
  const directory = await ensurePluginTopicDirectory(def);
  const project = (state.projects || []).find((item) => item.id === directory?.projectId)
    || (typeof matchingDirectoryProject === "function" ? matchingDirectoryProject(directory?.path) : null)
    || (typeof currentDirectoryTarget === "function" ? currentDirectoryTarget() : null);
  state.viewMode = "projects";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentTaskGroupId = "";
  state.currentThread = null;
  state.currentThreadId = "";
  state.directoryReturnRoute = returnRoute;
  if (typeof applyViewMode === "function") applyViewMode();
  if (project?.root && directory?.path) {
    state.selectedProjectId = project.id;
    localStorage.setItem("hermesWebProject", state.selectedProjectId);
    if ($("projectSelect")) $("projectSelect").value = state.selectedProjectId;
    if (typeof persistSelectedSubproject === "function") persistSelectedSubproject("");
    if (typeof renderSubprojects === "function") renderSubprojects();
    state.directoryPath = directory.path;
    state.directoryRootPath = directory.root || project.root;
    state.sharedDirectoryManagerOpen = false;
    await loadDirectoryView({ preserveScroll: false });
    return;
  }
  if (typeof resetDirectoryPath === "function") resetDirectoryPath();
  if (typeof showPushToast === "function") showPushToast("\u672a\u627e\u5230\u63d2\u4ef6\u8d44\u6599\u76ee\u5f55\uff0c\u5df2\u6253\u5f00\u76ee\u5f55\u9996\u9875\u3002", "info");
  await loadDirectoryView({ resetPath: true });
}

function pluginTopicInstruction(def) {
  if (!def?.id) return "";
  return [
    `This is the Hermes Mobile plugin-bound topic for ${def.label}.`,
    `Use the ${def.toolset || def.id} plugin MCP as the primary structured data source only if that toolset is actually available in this workspace.`,
    "Use the plugin file directory only for cleaned user-facing outputs and supporting context; do not mirror private plugin databases into the topic.",
  ].join(" ");
}

function wirePluginAppManualSorting(root) {
  root?.querySelectorAll?.("[data-plugin-topic-sort-id]").forEach((card) => {
    if (card.dataset.pluginAppSortBound) return;
    card.dataset.pluginAppSortBound = "1";
    card.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const strip = card.closest(".plugin-app-strip");
      if (!strip) return;
      pluginAppSortDrag = {
        card,
        strip,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
      };
      try {
        card.setPointerCapture?.(event.pointerId);
      } catch (_) {}
    });
    card.addEventListener("pointermove", (event) => {
      const drag = pluginAppSortDrag;
      if (!drag || drag.card !== card || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.dragging) {
        if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
        drag.dragging = true;
        card.classList.add("plugin-app-card-dragging");
        drag.strip.classList.add("plugin-app-strip-sorting");
      }
      event.preventDefault();
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-plugin-topic-sort-id]");
      if (target && target !== card && target.closest(".plugin-app-strip") === drag.strip) {
        const rect = target.getBoundingClientRect();
        const before = event.clientX < rect.left + rect.width / 2;
        drag.strip.insertBefore(card, before ? target : target.nextSibling);
        persistPluginAppOrderFromStrip(drag.strip);
      }
    }, { passive: false });
    const finish = (event) => {
      const drag = pluginAppSortDrag;
      if (!drag || drag.card !== card || drag.pointerId !== event.pointerId) return;
      pluginAppSortDrag = null;
      try {
        card.releasePointerCapture?.(event.pointerId);
      } catch (_) {}
      card.classList.remove("plugin-app-card-dragging");
      drag.strip.classList.remove("plugin-app-strip-sorting");
      if (drag.dragging) {
        persistPluginAppOrderFromStrip(drag.strip);
        card.dataset.pluginAppDragMoved = "1";
        window.setTimeout(() => {
          if (card.dataset.pluginAppDragMoved === "1") card.dataset.pluginAppDragMoved = "";
        }, 0);
      }
    };
    card.addEventListener("pointerup", finish);
    card.addEventListener("pointercancel", finish);
  });
}

function wirePluginTopicCards(root) {
  root?.querySelectorAll?.("[data-plugin-topic-open-app]").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (button.dataset.pluginAppDragMoved === "1") {
        event.preventDefault();
        button.dataset.pluginAppDragMoved = "";
        return;
      }
      openPluginTopicApp(button.dataset.pluginTopicOpenApp).catch(showError);
    });
  });
  root?.querySelectorAll?.("[data-plugin-topic-open-topic]").forEach((button) => {
    button.addEventListener("click", () => openPluginTopicChat(button.dataset.pluginTopicOpenTopic).catch(showError));
  });
  root?.querySelectorAll?.("[data-plugin-topic-open-delivery]").forEach((button) => {
    button.addEventListener("click", () => openPluginTopicDelivery(button.dataset.pluginTopicOpenDelivery).catch(showError));
  });
  wirePluginAppManualSorting(root);
}
