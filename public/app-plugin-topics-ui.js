"use strict";

function pluginRouteAction(id, label, route, glyph, priority = 10) {
  return Object.freeze({
    id,
    label,
    glyph,
    priority,
    placement: Object.freeze(["plugin_drawer_frequent", "dock_long_press", "search"]),
    entry: Object.freeze({
      type: "plugin_route",
      pluginRoute: route || id,
    }),
  });
}

function directoryCapabilityAction(id, label, route, glyph, priority = 10) {
  return Object.freeze({
    id,
    label,
    glyph,
    priority,
    placement: Object.freeze(["plugin_drawer_frequent", "dock_long_press", "search"]),
    entry: Object.freeze({
      type: "directory_route",
      pluginRoute: route || id,
    }),
  });
}

const PLUGIN_TOPIC_DEFS = Object.freeze([
  Object.freeze({
    id: "codex-mobile",
    viewMode: "codex",
    label: "Codex",
    subtitle: "代码任务、线程和交付回执",
    iconClass: "nav-codex-icon",
    appIconClass: "codex",
    appIconGlyph: "C",
    sourceBadge: "C",
    toolset: "codex",
    deliveryHints: ["codex", "code", "代码", "线程"],
    actions: Object.freeze([]),
  }),
  Object.freeze({
    id: "wardrobe",
    viewMode: "wardrobe",
    label: "\u8863\u6a71",
    subtitle: "\u642d\u914d\u3001\u5165\u5e93\u548c\u98ce\u683c\u5206\u6790",
    iconClass: "nav-wardrobe-icon",
    appIconClass: "wardrobe",
    appIconGlyph: "\u8863",
    sourceBadge: "\u8863",
    toolset: "wardrobe",
    deliveryHints: ["wardrobe", "\u8863\u6a71", "\u642d\u914d", "\u7a7f\u642d"],
    actions: Object.freeze([
      pluginRouteAction("style", "\u914d\u8863\u670d", "style", "\u8863", 10),
      pluginRouteAction("today", "\u4eca\u65e5\u7a7f\u642d", "today", "\u65e5", 20),
      pluginRouteAction("add_item", "\u8863\u7269\u5165\u5e93", "add_item", "+", 30),
      pluginRouteAction("inventory", "\u8863\u7269\u76ee\u5f55", "inventory", "\u76ee", 40),
      pluginRouteAction("outfit_history", "\u7a7f\u642d\u8bb0\u5f55", "outfit_history", "\u8bb0", 50),
      pluginRouteAction("packing", "\u51fa\u884c\u6253\u5305", "packing", "\u5305", 60),
    ]),
  }),
  Object.freeze({
    id: "finance",
    viewMode: "finance",
    label: "\u8bb0\u8d26",
    subtitle: "\u8d26\u672c\u3001\u6d41\u6c34\u548c\u7edf\u8ba1\u62a5\u544a",
    iconClass: "nav-finance-icon",
    appIconClass: "finance",
    appIconGlyph: "\u00a5",
    sourceBadge: "\u8d26",
    toolset: "finance",
    deliveryHints: ["finance", "\u8bb0\u8d26", "\u8d22\u52a1", "\u8d26\u672c"],
    actions: Object.freeze([
      pluginRouteAction("record", "\u8bb0\u4e00\u7b14", "record", "+", 10),
      pluginRouteAction("voice_record", "\u4e00\u53e5\u8bdd\u8bb0\u8d26", "voice_record", "\u8bf4", 20),
      pluginRouteAction("month_stats", "\u672c\u6708\u7edf\u8ba1", "month_stats", "\u6708", 30),
      pluginRouteAction("year_stats", "\u5f53\u5e74\u7edf\u8ba1", "year_stats", "\u5e74", 40),
      pluginRouteAction("assets", "\u8d44\u4ea7\u72b6\u51b5", "assets", "\u8d44", 50),
      pluginRouteAction("budget", "\u9884\u7b97\u68c0\u67e5", "budget", "\u9884", 60),
      pluginRouteAction("transactions", "\u6700\u8fd1\u6d41\u6c34", "transactions", "\u6d41", 70),
    ]),
  }),
  Object.freeze({
    id: "email",
    viewMode: "email",
    label: "\u90ae\u7bb1",
    subtitle: "\u90ae\u4ef6\u6e05\u6d17\u3001\u641c\u7d22\u548c\u6458\u8981",
    iconClass: "nav-email-icon",
    appIconClass: "outlook",
    appIconGlyph: "O",
    sourceBadge: "\u90ae",
    toolset: "email",
    deliveryHints: ["email", "\u90ae\u7bb1", "\u90ae\u4ef6", "\u6536\u4ef6"],
    actions: Object.freeze([
      pluginRouteAction("inbox", "\u6536\u4ef6\u7bb1", "inbox", "\u6536", 10),
      pluginRouteAction("needs_reply", "\u5f85\u56de\u590d", "needs_reply", "\u56de", 20),
      pluginRouteAction("search", "\u641c\u90ae\u4ef6", "search", "\u641c", 30),
      pluginRouteAction("compose", "\u5199\u90ae\u4ef6", "compose", "\u5199", 40),
      pluginRouteAction("digest", "\u90ae\u4ef6\u6458\u8981", "digest", "\u6458", 50),
      pluginRouteAction("cleanup", "\u6e05\u7406\u90ae\u4ef6", "cleanup", "\u6e05", 60),
    ]),
  }),
  Object.freeze({
    id: "health",
    viewMode: "health",
    label: "\u5065\u5eb7",
    subtitle: "\u8bad\u7ec3\u3001\u8eab\u4f53\u6307\u6807\u548c\u5065\u5eb7\u62a5\u544a",
    iconClass: "nav-health-icon",
    appIconClass: "health",
    appIconGlyph: "+",
    sourceBadge: "\u5eb7",
    toolset: "health",
    deliveryHints: ["health", "\u5065\u5eb7", "\u8bad\u7ec3", "\u4f53\u91cd", "\u7528\u836f"],
    actions: Object.freeze([
      pluginRouteAction("record_metric", "\u8bb0\u5f55\u6307\u6807", "record_metric", "+", 10),
      pluginRouteAction("trend", "\u8d8b\u52bf", "trend", "\u52bf", 20),
      pluginRouteAction("workout", "\u8bb0\u5f55\u8bad\u7ec3", "workout", "\u8bad", 30),
      pluginRouteAction("report", "\u5065\u5eb7\u62a5\u544a", "report", "\u62a5", 40),
      pluginRouteAction("medication", "\u7528\u836f/\u8865\u5242", "medication", "\u836f", 50),
      pluginRouteAction("advice", "\u95ee\u5065\u5eb7\u5efa\u8bae", "advice", "?", 60),
    ]),
  }),
  Object.freeze({
    id: "note",
    viewMode: "note",
    label: "\u7b14\u8bb0",
    subtitle: "\u7b14\u8bb0\u3001\u6458\u8981\u548c\u8d44\u6599\u6574\u7406",
    iconClass: "nav-note-icon",
    appIconClass: "note",
    appIconGlyph: "N",
    sourceBadge: "\u7b14",
    toolset: "note",
    deliveryHints: ["note", "\u7b14\u8bb0", "\u6458\u8981", "\u8d44\u6599"],
    actions: Object.freeze([
      pluginRouteAction("new_note", "\u8bb0\u4e00\u6761", "new_note", "+", 10),
      pluginRouteAction("search", "\u641c\u7b14\u8bb0", "search", "\u641c", 20),
      pluginRouteAction("recent", "\u6700\u8fd1\u7b14\u8bb0", "recent", "\u8fd1", 30),
      pluginRouteAction("capture", "\u5feb\u901f\u6458\u5f55", "capture", "\u6458", 40),
      pluginRouteAction("notebooks", "\u7b14\u8bb0\u672c", "notebooks", "\u672c", 50),
      pluginRouteAction("receipt_notes", "Hermes \u56de\u6267\u7b14\u8bb0", "receipt_notes", "\u56de", 60),
    ]),
  }),
  Object.freeze({
    id: "growth",
    viewMode: "growth",
    label: "\u6210\u957f",
    subtitle: "\u5b66\u4e60\u4efb\u52a1\u3001\u5361\u7247\u548c\u80fd\u529b\u8fdb\u5ea6",
    iconClass: "nav-learning-icon",
    appIconClass: "growth",
    appIconGlyph: "\u957f",
    sourceBadge: "\u957f",
    toolset: "growth",
    deliveryHints: ["growth", "\u6210\u957f", "\u5b66\u4e60", "\u4efb\u52a1", "\u5361\u7247"],
    actions: Object.freeze([
      pluginRouteAction("today_tasks", "\u4eca\u65e5\u4efb\u52a1", "today_tasks", "\u65e5", 10),
      pluginRouteAction("cards", "\u6210\u957f\u5361\u7247", "cards", "\u5361", 20),
      pluginRouteAction("submit_work", "\u63d0\u4ea4\u4f5c\u4e1a", "submit_work", "\u4ea4", 30),
      pluginRouteAction("review", "\u590d\u76d8", "review", "\u590d", 40),
      pluginRouteAction("stage_assessment", "\u9636\u6bb5\u6d4b\u8bc4", "stage_assessment", "\u6d4b", 50),
      pluginRouteAction("rewards", "\u5956\u52b1/\u901a\u5b9d", "rewards", "\u5956", 60),
    ]),
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
    sourceBadge: "\u76ee",
    toolset: "",
    deliveryHints: ["directory", "\u76ee\u5f55", "\u6587\u4ef6", "\u8d44\u6599"],
    actions: Object.freeze([
      directoryCapabilityAction("recent", "\u6700\u8fd1\u76ee\u5f55", "recent", "\u8fd1", 10),
      directoryCapabilityAction("topics", "\u6587\u4ef6\u8bdd\u9898", "topics", "\u8bdd", 20),
      directoryCapabilityAction("new_topic", "\u65b0\u5efa\u6587\u4ef6\u8bdd\u9898", "new_topic", "+", 30),
      directoryCapabilityAction("open_root", "\u6253\u5f00\u76ee\u5f55", "open_root", "\u76ee", 40),
      directoryCapabilityAction("imports", "\u5bfc\u5165/\u6574\u7406\u6587\u4ef6", "imports", "\u5bfc", 50),
    ]),
  }),
]);
const PLUGIN_TOPIC_USAGE_STORAGE_KEY = "hermesPluginTopicUsage";
const PLUGIN_TOPIC_ORDER_STORAGE_KEY = "hermesPluginTopicOrder";
const PLUGIN_TOPIC_EXPANDED_STORAGE_KEY = "hermesPluginTopicExpanded";
const PLUGIN_TOPIC_USAGE_API_PATH = "/api/plugin-topic-usage";
const PLUGIN_TOPIC_BINDINGS_API_PATH = "/api/plugin-topic-bindings";
const PLUGIN_TOPIC_USAGE_SYNC_DELAY_MS = 450;
const PLUGIN_TOPIC_USAGE_LOAD_TTL_MS = 30000;
const PLUGIN_TOPIC_BINDINGS_LOAD_TTL_MS = 30000;
const PLUGIN_APP_REORDER_HOLD_MS = 450;
const PLUGIN_APP_REORDER_CANCEL_PX = 10;
const GLOBAL_PLUGIN_DOCK_STATE_STORAGE_KEY = "hermesGlobalPluginDockExpanded";
const PLUGIN_BOTTOM_TABS_STORAGE_KEY = "hermesPinnedPluginBottomTabs";
const BOTTOM_NAV_MAX_VISIBLE_TABS = 6;
const BOTTOM_NAV_BASE_VISIBLE_TABS = 3;
const GLOBAL_PLUGIN_DOCK_DRAG_SLOP_PX = 10;
const GLOBAL_PLUGIN_DOCK_DIRECTION_RATIO = 1.45;
const GLOBAL_PLUGIN_DOCK_TRIGGER_DISTANCE_PX = 28;
const GLOBAL_PLUGIN_DOCK_TRIGGER_VELOCITY_MIN_DISTANCE_PX = 24;
const GLOBAL_PLUGIN_DOCK_TRIGGER_VELOCITY_PX_MS = 0.45;
const CAPABILITY_QUICK_ACTION_LIMIT = 9;
const PLUGIN_DRAWER_QUICK_ACTION_LIMIT = 6;
const CAPABILITY_PLUGIN_APP_ACTION_ID = "__open_app";
const PLUGIN_TOPIC_ACTION_MANIFEST_LOAD_TTL_MS = 60000;
let pluginAppSortDrag = null;
let pluginAppSortGlobalBound = false;
let pluginActionMenuCloseBound = false;
let pluginActionMenuSwipe = null;
let pluginTopicUsagePendingSync = null;
let pluginTopicUsageSyncTimer = 0;
let pluginTopicActionManifestRefreshTimer = 0;
let globalPluginDockGesture = null;
let globalPluginDockGestureBound = false;
const pluginTopicUsageLoadedAtByWorkspace = new Map();
const pluginTopicUsageLoadingWorkspaces = new Map();
const pluginTopicUsageLoadRetryAt = new Map();
const pluginTopicUsageMemoryCacheByWorkspace = new Map();
const pluginTopicActionManifestLoadedAt = new Map();
const pluginTopicActionManifestLoading = new Map();
let pluginTopicUsageMemoryCache = normalizePluginTopicUsage({});
const pluginTopicBindingsLoadedAtByWorkspace = new Map();
const pluginTopicBindingsLoadingWorkspaces = new Map();
const pluginTopicBindingsLoadRetryAt = new Map();
const pluginTopicBindingProjectionByWorkspace = new Map();

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

function pluginTopicSelectedTaskGroup(thread = state.currentThread, taskGroupId = state.currentTaskGroupId) {
  const id = String(taskGroupId || "").trim();
  if (!id || !thread) return null;
  const groups = typeof taskGroupsForThread === "function" ? taskGroupsForThread(thread) : [];
  return groups.find((group) => String(group?.id || "") === id) || null;
}

function pluginTopicClaimForTaskGroup(group = null) {
  if (!group || group.pluginTopic) return null;
  const route = typeof directoryTopicPrimaryRoute === "function" ? directoryTopicPrimaryRoute(group) : group.directoryRoute;
  if (!route) return null;
  return pluginTopicDirectoryClaimForRoute(route, group);
}

function pluginTopicDefForTaskGroup(group = null) {
  if (!group) return null;
  const def = pluginTopicDefForGroupId(group.id || group.taskGroupId || "");
  if (def && !def.builtinKind) return def;
  const claim = pluginTopicClaimForTaskGroup(group);
  if (claim?.pluginId) return pluginTopicDefById(claim.pluginId);
  return null;
}

function pluginTopicDefForCurrentTaskGroupId(taskGroupId = state.currentTaskGroupId) {
  const def = pluginTopicDefForGroupId(taskGroupId);
  if (def && !def.builtinKind) return def;
  return pluginTopicDefForTaskGroup(pluginTopicSelectedTaskGroup(state.currentThread, taskGroupId));
}

function pluginTopicDefForViewMode(viewMode = state.viewMode) {
  const mode = String(viewMode || "").trim();
  if (!mode) return null;
  const viewModeDef = PLUGIN_TOPIC_DEFS.find((item) => !item.builtinKind && item.viewMode === mode) || null;
  if (viewModeDef) return viewModeDef;
  if (mode === "tasks") {
    const groupDef = pluginTopicDefForGroupId(state.currentTaskGroupId);
    if (groupDef && !groupDef.builtinKind) return groupDef;
    const selectedDef = pluginTopicDefForCurrentTaskGroupId(state.currentTaskGroupId);
    if (selectedDef && !selectedDef.builtinKind) return selectedDef;
  }
  const contextDef = pluginTopicDefById(state.pluginContextNavPluginId);
  if (!contextDef || contextDef.builtinKind) return null;
  if (mode === "tasks" && state.currentTaskGroupId === pluginTopicGroupId(contextDef.id)) return contextDef;
  if (mode === "tasks") {
    const selected = pluginTopicSelectedTaskGroup();
    const selectedDef = pluginTopicDefForTaskGroup(selected);
    if (selectedDef?.id === contextDef.id) return contextDef;
  }
  if (mode === "projects") return contextDef;
  return null;
}

function pluginTopicBottomButtonId(def) {
  const id = String(def?.id || "").trim();
  if (id === "wardrobe") return "bottomWardrobeMode";
  if (id === "codex-mobile") return "bottomCodexMode";
  if (id === "finance") return "bottomFinanceMode";
  if (id === "email") return "bottomEmailMode";
  if (id === "health") return "bottomHealthMode";
  if (id === "note") return "bottomNoteMode";
  if (id === "growth") return "bottomGrowthMode";
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
  if (!state.currentThread?.id) {
    state.currentThread = null;
    state.currentThreadId = "";
    state.threads = [];
    if (typeof renderThreads === "function") renderThreads();
    const conversation = $("conversation");
    if (conversation) conversation.innerHTML = `<div class="empty-state small">\u52a0\u8f7d\u4e2d...</div>`;
    if ($("threadTitle")) $("threadTitle").textContent = "";
    if ($("threadMeta")) $("threadMeta").textContent = "";
    if ($("interruptRun")) $("interruptRun").disabled = true;
    if (typeof updateNavigationControls === "function") updateNavigationControls();
    refreshPluginContextTopicHomeAfterColdRestore(restoreScrollTop).catch(showError);
    return;
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

async function refreshPluginContextTopicHomeAfterColdRestore(restoreScrollTop = 0) {
  if (state.pluginContextTopicHomeRefreshLoading) return false;
  if (typeof api !== "function") return false;
  const seq = (state.pluginContextTopicHomeRefreshSeq || 0) + 1;
  state.pluginContextTopicHomeRefreshSeq = seq;
  state.pluginContextTopicHomeRefreshLoading = true;
  try {
    const workspaceId = String(state.selectedWorkspaceId || "").trim();
    const result = await api("/api/single-window", {
      method: "POST",
      body: JSON.stringify({
        workspaceId,
        groupChat: false,
        weixinChat: false,
        messageMode: "tasks",
        taskGroupId: "",
        messageLimit: TASK_MESSAGE_INITIAL_LIMIT,
      }),
      timeoutMs: 12000,
    });
    if (state.pluginContextTopicHomeRefreshSeq !== seq) return false;
    if (state.viewMode !== "tasks" || state.currentTaskGroupId || state.pluginContextNavPluginId) return false;
    if (!result?.thread?.id) return false;
    state.currentThread = typeof mergeCurrentThread === "function" ? mergeCurrentThread(result.thread) : result.thread;
    state.currentThreadId = state.currentThread.id;
    state.caseTopicThreads = Array.isArray(result.caseTopicThreads) ? result.caseTopicThreads : [];
    state.groupChatAvailable = Boolean(result.groupChatAvailable || (typeof selectedWorkspaceInThreadGroup === "function" && selectedWorkspaceInThreadGroup(state.currentThread)));
    state.weixinChatAvailable = Boolean(result.weixinChatAvailable || (typeof isThreadWeixinChat === "function" && isThreadWeixinChat(state.currentThread)));
    if (typeof rememberTaskListThread === "function") rememberTaskListThread(state.currentThread);
    if (typeof summarizeThread === "function") state.threads = [summarizeThread(state.currentThread)];
    if (typeof renderThreads === "function") renderThreads();
    if (typeof renderCurrentThread === "function") renderCurrentThread({ stickToBottom: false, restoreScrollTop });
    if (typeof setComposerEnabled === "function") setComposerEnabled(true);
    if (typeof updateNavigationControls === "function") updateNavigationControls();
    if (typeof updateTopicPluginDockChrome === "function" && typeof isTaskListView === "function") updateTopicPluginDockChrome(isTaskListView());
    return true;
  } finally {
    if (state.pluginContextTopicHomeRefreshSeq === seq) state.pluginContextTopicHomeRefreshLoading = false;
  }
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

function pluginTopicBindingWorkspaceId() {
  return String(state.selectedWorkspaceId || state.auth?.workspaceId || "owner").trim() || "owner";
}

function normalizePluginTopicBindingProjection(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const topics = Array.isArray(source.topics) ? source.topics : [];
  const directoryClaims = Array.isArray(source.directoryClaims || source.directory_claims)
    ? (source.directoryClaims || source.directory_claims)
    : [];
  return {
    topics: topics.filter((topic) => topic && typeof topic === "object"),
    directoryClaims: directoryClaims.filter((claim) => claim && typeof claim === "object"),
  };
}

function readPluginTopicBindingProjection(workspaceId = pluginTopicBindingWorkspaceId()) {
  const id = String(workspaceId || "owner").trim() || "owner";
  return pluginTopicBindingProjectionByWorkspace.get(id) || normalizePluginTopicBindingProjection({});
}

function writePluginTopicBindingProjection(workspaceId = pluginTopicBindingWorkspaceId(), value = {}) {
  const id = String(workspaceId || "owner").trim() || "owner";
  const projection = normalizePluginTopicBindingProjection(value);
  pluginTopicBindingProjectionByWorkspace.set(id, projection);
  return projection;
}

function pluginTopicBindingsRecentlyLoaded(workspaceId = pluginTopicBindingWorkspaceId()) {
  const loadedAt = pluginTopicBindingsLoadedAtByWorkspace.get(String(workspaceId || "").trim()) || 0;
  return loadedAt > 0 && Date.now() - loadedAt < PLUGIN_TOPIC_BINDINGS_LOAD_TTL_MS;
}

function markPluginTopicBindingsLoaded(workspaceId = pluginTopicBindingWorkspaceId()) {
  const id = String(workspaceId || "").trim();
  if (id) pluginTopicBindingsLoadedAtByWorkspace.set(id, Date.now());
}

function refreshPluginTopicBindingsRoot(options = {}) {
  if (state.viewMode !== "tasks" || state.currentTaskGroupId) return;
  window.setTimeout(() => {
    if (state.viewMode === "tasks" && !state.currentTaskGroupId) {
      renderCurrentThread({
        stickToBottom: false,
        restoreScrollTop: options.restoreScrollTop ?? ($("conversation")?.scrollTop || 0),
        directoryTopicCollectionsReady: true,
      });
    }
  }, 0);
}

async function loadPluginTopicBindingsFromServer(workspaceId = pluginTopicBindingWorkspaceId()) {
  if (typeof api !== "function" || !workspaceId) return null;
  const params = new URLSearchParams({ workspaceId });
  const result = await api(`${PLUGIN_TOPIC_BINDINGS_API_PATH}?${params.toString()}`, { timeoutMs: 8000 });
  writePluginTopicBindingProjection(workspaceId, result || {});
  markPluginTopicBindingsLoaded(workspaceId);
  refreshPluginTopicBindingsRoot();
  return result;
}

function ensurePluginTopicBindingsLoaded() {
  const workspaceId = pluginTopicBindingWorkspaceId();
  if (!workspaceId || pluginTopicBindingsRecentlyLoaded(workspaceId)) return;
  if (pluginTopicBindingsLoadingWorkspaces.has(workspaceId)) return;
  const now = Date.now();
  if (now < (pluginTopicBindingsLoadRetryAt.get(workspaceId) || 0)) return;
  const request = loadPluginTopicBindingsFromServer(workspaceId)
    .catch(() => {
      pluginTopicBindingsLoadRetryAt.set(workspaceId, Date.now() + 30000);
      return null;
    })
    .finally(() => {
      pluginTopicBindingsLoadingWorkspaces.delete(workspaceId);
    });
  pluginTopicBindingsLoadingWorkspaces.set(workspaceId, request);
}

function pluginTopicDirectoryRouteKey(route = null, group = null) {
  if (typeof directoryTopicRouteKey === "function") return directoryTopicRouteKey(route, group);
  if (!route) return "";
  const owner = String(
    route.workspaceId
    || route.workspace_id
    || route.ownerWorkspaceId
    || route.owner_workspace_id
    || group?.ownerWorkspaceId
    || "",
  ).trim();
  const cleanPath = (value) => String(value || "").trim().replaceAll("\\", "/").replace(/\/+/g, "/").replace(/\/$/, "").toLowerCase();
  const root = cleanPath(route.root || route.path || "");
  const routeId = String(route.projectId || route.id || "").trim();
  if (!routeId && !root) return "";
  return [owner, routeId, route.subprojectId || "", root].join("|");
}

function pluginTopicRouteInferenceText(route = {}) {
  return [
    route?.pluginId,
    route?.plugin_id,
    route?.contextPluginId,
    route?.context_plugin_id,
    route?.projectId,
    route?.project_id,
    route?.id,
    route?.root,
    route?.path,
  ].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean).join("\n");
}

function pluginTopicInferPluginIdFromRoute(route = {}, group = {}) {
  const explicit = pluginTopicId(
    route?.pluginId
    || route?.plugin_id
    || route?.contextPluginId
    || route?.context_plugin_id
    || group?.pluginId
    || group?.plugin_id
    || "",
  );
  if (explicit && pluginTopicDefById(explicit)) return explicit;
  const text = pluginTopicRouteInferenceText(route);
  if (!text) return "";
  for (const def of availablePluginTopicDefs()) {
    if (def.builtinKind) continue;
    const id = pluginTopicId(def.id);
    if (id && new RegExp(`(^|[/\\\\:_-])${id}($|[/\\\\:_-])`, "i").test(text)) return id;
    const hints = [def.label, ...(Array.isArray(def.deliveryHints) ? def.deliveryHints : [])]
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean);
    if (hints.some((hint) => hint && text.includes(hint))) return id;
  }
  return "";
}

function pluginTopicDefaultDirectoryClaimForRoute(route = {}, group = null) {
  const pluginId = pluginTopicInferPluginIdFromRoute(route, group || {});
  const key = pluginTopicDirectoryRouteKey(route, group);
  if (!pluginId || !key) return null;
  return {
    workspaceId: pluginTopicBindingWorkspaceId(),
    pluginId,
    directoryRouteKey: key,
    claimMode: "claimed_by_plugin",
    contextRole: "legacy_context",
    hideFromDirectoryTopicRoot: true,
    defaultTopicId: pluginTopicGroupId(pluginId),
  };
}

function pluginTopicDirectoryClaimForRoute(route = {}, group = null) {
  const key = pluginTopicDirectoryRouteKey(route, group);
  if (!key) return null;
  const claims = readPluginTopicBindingProjection().directoryClaims || [];
  const explicit = claims.find((claim) => String(claim?.directoryRouteKey || claim?.directory_route_key || "") === key);
  if (explicit) {
    return {
      workspaceId: String(explicit.workspaceId || explicit.workspace_id || pluginTopicBindingWorkspaceId()).trim() || "owner",
      pluginId: pluginTopicId(explicit.pluginId || explicit.plugin_id || ""),
      directoryRouteKey: key,
      claimMode: String(explicit.claimMode || explicit.claim_mode || "claimed_by_plugin"),
      contextRole: String(explicit.contextRole || explicit.context_role || "legacy_context"),
      hideFromDirectoryTopicRoot: explicit.hideFromDirectoryTopicRoot !== false && explicit.hide_from_directory_topic_root !== false,
      defaultTopicId: String(explicit.defaultTopicId || explicit.default_topic_id || ""),
    };
  }
  return pluginTopicDefaultDirectoryClaimForRoute(route, group);
}

function pluginTopicDirectoryClaimHidesRoot(claim = null) {
  return Boolean(claim && claim.claimMode === "claimed_by_plugin" && claim.hideFromDirectoryTopicRoot !== false);
}

function pluginTopicClaimedDirectoryTopicCollections(collections = []) {
  return (collections || []).filter((collection) => {
    const claim = pluginTopicDirectoryClaimForRoute(collection?.route, collection?.defaultGroup);
    return pluginTopicDirectoryClaimHidesRoot(claim);
  });
}

function pluginTopicFilterDirectoryTopicCollectionsForRoot(collections = []) {
  return (collections || []).filter((collection) => {
    const claim = pluginTopicDirectoryClaimForRoute(collection?.route, collection?.defaultGroup);
    return !pluginTopicDirectoryClaimHidesRoot(claim);
  });
}

function pluginTopicClaimedCollectionsForPlugin(collections = [], pluginId = "") {
  const id = pluginTopicId(pluginId);
  if (!id) return [];
  return pluginTopicClaimedDirectoryTopicCollections(collections)
    .filter((collection) => pluginTopicDirectoryClaimForRoute(collection?.route, collection?.defaultGroup)?.pluginId === id);
}

function globalPluginDockWorkspaceId() {
  return String(state.selectedWorkspaceId || state.auth?.workspaceId || "owner").trim() || "owner";
}

function globalPluginDockStorageKey() {
  return `${GLOBAL_PLUGIN_DOCK_STATE_STORAGE_KEY}:${globalPluginDockWorkspaceId()}`;
}

function pluginBottomTabsStorageKey(workspaceId = globalPluginDockWorkspaceId()) {
  const id = String(workspaceId || "owner").trim() || "owner";
  return `${PLUGIN_BOTTOM_TABS_STORAGE_KEY}:${id}`;
}

function pluginBottomTabCapacity() {
  return Math.max(0, BOTTOM_NAV_MAX_VISIBLE_TABS - BOTTOM_NAV_BASE_VISIBLE_TABS);
}

function readPinnedPluginBottomTabs(workspaceId = globalPluginDockWorkspaceId()) {
  try {
    const raw = localStorage.getItem(pluginBottomTabsStorageKey(workspaceId));
    const values = JSON.parse(raw || "[]");
    if (!Array.isArray(values)) return [];
    return [...new Set(values.map(pluginTopicId).filter(Boolean))];
  } catch {
    return [];
  }
}

function writePinnedPluginBottomTabs(ids = [], workspaceId = globalPluginDockWorkspaceId()) {
  const allowed = new Set(orderedPluginAppDefs(availablePluginTopicDefs())
    .filter((def) => !def.builtinKind)
    .map((def) => def.id));
  const normalized = [...new Set((ids || []).map(pluginTopicId).filter((id) => id && allowed.has(id)))]
    .slice(0, pluginBottomTabCapacity());
  try {
    localStorage.setItem(pluginBottomTabsStorageKey(workspaceId), JSON.stringify(normalized));
  } catch {
    // Bottom-tab pinning is a local UI preference; failure only disables persistence.
  }
  return normalized;
}

function pinnedPluginBottomTabIds() {
  const capacity = pluginBottomTabCapacity();
  if (!capacity) return [];
  const saved = readPinnedPluginBottomTabs();
  if (!saved.length) return [];
  const available = orderedPluginAppDefs(availablePluginTopicDefs())
    .filter((def) => !def.builtinKind && pluginTopicNavigationAvailable(def));
  const availableIds = new Set(available.map((def) => def.id));
  return saved.filter((id) => availableIds.has(id)).slice(0, capacity);
}

function pluginBottomTabPinned(pluginId = "") {
  const id = pluginTopicId(pluginId);
  return Boolean(id && readPinnedPluginBottomTabs().includes(id));
}

function pluginBottomTabPinAvailable(pluginId = "") {
  const id = pluginTopicId(pluginId);
  if (!id) return false;
  if (pluginBottomTabPinned(id)) return true;
  return pinnedPluginBottomTabIds().length < pluginBottomTabCapacity();
}

function setPluginBottomTabPinned(pluginId = "", pinned = true) {
  const id = pluginTopicId(pluginId);
  const def = pluginTopicDefById(id);
  if (!id || !def || def.builtinKind || !pluginTopicNavigationAvailable(def)) return false;
  const current = readPinnedPluginBottomTabs()
    .filter((item) => item !== id)
    .filter((item) => {
      const itemDef = pluginTopicDefById(item);
      return itemDef && !itemDef.builtinKind && pluginTopicNavigationAvailable(itemDef);
    });
  if (pinned) {
    if (current.length >= pluginBottomTabCapacity()) return false;
    current.push(id);
  }
  writePinnedPluginBottomTabs(current);
  if (typeof updateNavigationControls === "function") updateNavigationControls();
  if (typeof refreshPluginAppOrderSurfaces === "function") refreshPluginAppOrderSurfaces();
  return true;
}

function syncPinnedPluginBottomTabs(pluginContextNav = false) {
  if (pluginContextNav) return [];
  const pinnedIds = pinnedPluginBottomTabIds();
  const visible = new Set(pinnedIds);
  PLUGIN_TOPIC_DEFS.forEach((def) => {
    if (!def || def.builtinKind) return;
    const buttonId = pluginTopicBottomButtonId(def);
    const button = buttonId ? $(buttonId) : null;
    if (!button) return;
    const shouldShow = visible.has(def.id);
    setBottomTabHidden(button, !shouldShow);
    if (shouldShow) updateBottomNavLabel(buttonId, def.label || "");
  });
  return pinnedIds;
}

function readGlobalPluginDockExpandedPreference() {
  try {
    return localStorage.getItem(globalPluginDockStorageKey()) === "1";
  } catch {
    return false;
  }
}

function writeGlobalPluginDockExpandedPreference(expanded) {
  try {
    localStorage.setItem(globalPluginDockStorageKey(), expanded ? "1" : "0");
  } catch {
    // The Dock still works without persisted local preference.
  }
}

function globalPluginDockCollapsedOffsetPx() {
  const cssPx = typeof mobileBottomCssPx === "function"
    ? mobileBottomCssPx
    : (name, fallback = 0) => {
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      const number = Number.parseFloat(value);
      return Number.isFinite(number) ? number : fallback;
    };
  const height = Math.max(0, Math.ceil(cssPx("--topic-plugin-dock-height", 78)));
  const collapsed = Math.max(0, Math.ceil(cssPx("--topic-plugin-dock-collapsed-height", 30)));
  return Math.max(0, height - collapsed);
}

function renderGlobalPluginDockHandle() {
  return `<button class="topic-plugin-dock-handle" type="button" data-global-plugin-dock-handle aria-label="\u5c55\u5f00\u63d2\u4ef6\u5165\u53e3" aria-expanded="false">
    <span class="topic-plugin-dock-grabber" aria-hidden="true"></span>
  </button>`;
}

function globalPluginDockLauncherPresent(dock = $("topicPluginDock")) {
  return Boolean(dock?.querySelector?.(".plugin-app-launcher .plugin-app-card"));
}

function applyGlobalPluginDockState(dock = $("topicPluginDock"), expanded = readGlobalPluginDockExpandedPreference()) {
  if (!dock) return false;
  const next = Boolean(expanded);
  const app = $("app");
  dock.classList.toggle("global-plugin-dock-expanded", next);
  dock.classList.toggle("global-plugin-dock-collapsed", !next);
  app?.classList.toggle("global-plugin-dock-expanded-mode", next);
  app?.classList.toggle("global-plugin-dock-collapsed-mode", !next);
  dock.dataset.globalPluginDockState = next ? "expanded" : "collapsed";
  dock.style.removeProperty("--global-plugin-dock-gesture-offset");
  const handle = dock.querySelector("[data-global-plugin-dock-handle]");
  if (handle) {
    handle.setAttribute("aria-expanded", next ? "true" : "false");
    handle.setAttribute("aria-label", next ? "\u6536\u8d77\u63d2\u4ef6\u5165\u53e3" : "\u5c55\u5f00\u63d2\u4ef6\u5165\u53e3");
  }
  return next;
}

function setGlobalPluginDockExpanded(expanded, options = {}) {
  const dock = $("topicPluginDock");
  if (!dock) return false;
  if (options.persist !== false) writeGlobalPluginDockExpandedPreference(Boolean(expanded));
  applyGlobalPluginDockState(dock, Boolean(expanded));
  if (!expanded && typeof closePluginActionMenus === "function") closePluginActionMenus(dock);
  if (typeof updateMobileBottomNavReservation === "function") updateMobileBottomNavReservation();
  if (typeof settleMobileBottomNavReservation === "function") {
    settleMobileBottomNavReservation(`global_plugin_dock_${expanded ? "expand" : "collapse"}`, [0, 120, 260]);
  }
  return Boolean(expanded);
}

function syncGlobalPluginDockState(dock = $("topicPluginDock")) {
  if (!dock || !globalPluginDockLauncherPresent(dock)) return false;
  if (!dock.classList.contains("global-plugin-dock-expanded") && !dock.classList.contains("global-plugin-dock-collapsed")) {
    applyGlobalPluginDockState(dock, readGlobalPluginDockExpandedPreference());
  } else {
    applyGlobalPluginDockState(dock, dock.classList.contains("global-plugin-dock-expanded"));
  }
  return true;
}

function globalPluginDockHostSurfaceEligible() {
  const app = $("app");
  if (!app || app.classList.contains("hidden")) return false;
  if (!isMobileLayout()) return false;
  const view = String(state.viewMode || "");
  const pluginAppSurface = ["wardrobe", "finance", "email", "health", "note", "growth"].includes(view);
  if (state.keyboardViewportActive || document.documentElement.classList.contains("keyboard-viewport-active")) return false;
  if (state.mobileBrowserShellBlocked || app.classList.contains("mobile-browser-shell-blocked")) return false;
  if (app.classList.contains("embedded-plugin-preview-fullscreen-active")) return false;
  if (app.classList.contains("main-back-visible") && !pluginAppSurface) return false;
  if (app.classList.contains("plugin-context-nav-mode") && !pluginAppSurface) return false;
  if (pluginAppSurface) return true;
  if (view === "single") return state.singleWindowMode === "chat";
  if (view === "tasks") return !state.currentTaskGroupId;
  if (view === "projects") return !state.directoryPluginContextActive;
  if (view === "todos") return !(typeof isTodoDetailView === "function" && isTodoDetailView()) && !(typeof kanbanComposerOpen === "function" && kanbanComposerOpen());
  if (view === "inbox") {
    return !(typeof isActionInboxDetailView === "function" && isActionInboxDetailView())
      && !(typeof isActionInboxCreateView === "function" && isActionInboxCreateView());
  }
  if (view === "automation") return !(typeof isAutomationDetailView === "function" && isAutomationDetailView());
  if (view === "learning") return !state.selectedLearningTaskCardId && !state.learningGrowthSettingsOpen;
  return false;
}

function ensureGlobalPluginDockContent() {
  const dock = $("topicPluginDock");
  if (!dock || globalPluginDockLauncherPresent(dock)) return globalPluginDockLauncherPresent(dock);
  if (typeof renderPluginAppLauncher !== "function" || typeof setTopicPluginDock !== "function") return false;
  const html = renderPluginAppLauncher();
  if (!html) return false;
  setTopicPluginDock(html);
  return globalPluginDockLauncherPresent(dock);
}

function updateSidebarPluginLauncher() {
  const launcher = $("sidePluginLauncher");
  if (!launcher) return false;
  const defs = orderedPluginAppDefs(availablePluginTopicDefs());
  const html = renderPluginAppDesktop(defs);
  launcher.innerHTML = html;
  const hasContent = Boolean(html);
  launcher.hidden = !hasContent;
  launcher.setAttribute("aria-hidden", hasContent ? "false" : "true");
  if (hasContent && typeof wirePluginTopicCards === "function") wirePluginTopicCards(launcher);
  return hasContent;
}

function resetGlobalPluginDockGesture() {
  const dock = $("topicPluginDock");
  globalPluginDockGesture = null;
  dock?.classList.remove("global-plugin-dock-dragging", "global-plugin-dock-gesture-pending");
  dock?.style.removeProperty("--global-plugin-dock-gesture-offset");
}

function globalPluginDockGesturePoint(event) {
  const touch = event?.touches?.[0] || event?.changedTouches?.[0];
  if (touch) return { x: touch.clientX, y: touch.clientY };
  if (typeof event?.clientX === "number" && typeof event?.clientY === "number") return { x: event.clientX, y: event.clientY };
  return null;
}

function globalPluginDockOwnsTouchTarget(target) {
  if (!target?.closest) return false;
  const dock = $("topicPluginDock");
  if (!dock || dock.hidden || !globalPluginDockHostSurfaceEligible()) return false;
  if (!target.closest(".topic-plugin-dock")) return false;
  return true;
}

function beginGlobalPluginDockGesture(event) {
  const dock = $("topicPluginDock");
  if (!dock || dock.hidden || !globalPluginDockHostSurfaceEligible()) return;
  if (event?.pointerType === "mouse" && event.button !== 0) return;
  const point = globalPluginDockGesturePoint(event);
  if (!point) return;
  const expanded = dock.classList.contains("global-plugin-dock-expanded");
  globalPluginDockGesture = {
    pointerId: typeof event.pointerId === "number" ? event.pointerId : null,
    startX: point.x,
    startY: point.y,
    currentX: point.x,
    currentY: point.y,
    startedAt: Date.now(),
    expanded,
    locked: "",
    cancelled: false,
  };
  dock.classList.add("global-plugin-dock-gesture-pending");
  try {
    if (typeof event.pointerId === "number") event.currentTarget?.setPointerCapture?.(event.pointerId);
  } catch (_) {}
}

function moveGlobalPluginDockGesture(event) {
  const gesture = globalPluginDockGesture;
  if (!gesture || gesture.cancelled) return;
  if (gesture.pointerId !== null && typeof event.pointerId === "number" && event.pointerId !== gesture.pointerId) return;
  const point = globalPluginDockGesturePoint(event);
  if (!point) return;
  gesture.currentX = point.x;
  gesture.currentY = point.y;
  const dx = point.x - gesture.startX;
  const dy = point.y - gesture.startY;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const dock = $("topicPluginDock");
  if (!dock) return;
  if (!gesture.locked) {
    if (Math.max(absX, absY) < GLOBAL_PLUGIN_DOCK_DRAG_SLOP_PX) return;
    if (absX > absY * GLOBAL_PLUGIN_DOCK_DIRECTION_RATIO) {
      gesture.locked = "horizontal";
      dock.classList.remove("global-plugin-dock-gesture-pending");
      return;
    }
    if (absY <= absX * GLOBAL_PLUGIN_DOCK_DIRECTION_RATIO) return;
    gesture.locked = "vertical";
    dock.classList.add("global-plugin-dock-dragging");
  }
  if (gesture.locked !== "vertical") return;
  event.preventDefault?.();
  event.stopPropagation?.();
  const collapsedOffset = globalPluginDockCollapsedOffsetPx();
  const startOffset = gesture.expanded ? 0 : collapsedOffset;
  const nextOffset = Math.max(0, Math.min(collapsedOffset, startOffset + dy));
  dock.style.setProperty("--global-plugin-dock-gesture-offset", `${Math.round(nextOffset)}px`);
}

function finishGlobalPluginDockGesture(event = null) {
  const gesture = globalPluginDockGesture;
  if (!gesture) return;
  const dock = $("topicPluginDock");
  const point = globalPluginDockGesturePoint(event) || { x: gesture.currentX, y: gesture.currentY };
  const dy = point.y - gesture.startY;
  const elapsed = Math.max(1, Date.now() - gesture.startedAt);
  const velocity = dy / elapsed;
  const valid = gesture.locked === "vertical" && !gesture.cancelled;
  resetGlobalPluginDockGesture();
  if (!valid) return;
  const velocityCanTrigger = Math.abs(dy) >= GLOBAL_PLUGIN_DOCK_TRIGGER_VELOCITY_MIN_DISTANCE_PX;
  const expandTriggered = dy < -GLOBAL_PLUGIN_DOCK_TRIGGER_DISTANCE_PX
    || (velocityCanTrigger && velocity < -GLOBAL_PLUGIN_DOCK_TRIGGER_VELOCITY_PX_MS);
  const collapseTriggered = dy > GLOBAL_PLUGIN_DOCK_TRIGGER_DISTANCE_PX
    || (velocityCanTrigger && velocity > GLOBAL_PLUGIN_DOCK_TRIGGER_VELOCITY_PX_MS);
  const shouldExpand = gesture.expanded
    ? !collapseTriggered
    : expandTriggered;
  dock?.setAttribute("data-global-plugin-dock-gesture-settled-at", String(Date.now()));
  setGlobalPluginDockExpanded(shouldExpand, { persist: true });
}

function handleGlobalPluginDockClick(event) {
  const dock = $("topicPluginDock");
  if (!dock || dock.hidden) return;
  const settledAt = Number(dock.getAttribute("data-global-plugin-dock-gesture-settled-at") || 0);
  if (settledAt && Date.now() - settledAt < 260) {
    event.preventDefault?.();
    return;
  }
  setGlobalPluginDockExpanded(!dock.classList.contains("global-plugin-dock-expanded"), { persist: true });
}

function wireGlobalPluginDockGestures(root) {
  const dock = root?.id === "topicPluginDock" ? root : $("topicPluginDock");
  const handle = dock?.querySelector?.("[data-global-plugin-dock-handle]");
  if (!dock || !handle || handle.dataset.globalPluginDockGestureBound === "1") return;
  handle.dataset.globalPluginDockGestureBound = "1";
  handle.addEventListener("click", handleGlobalPluginDockClick);
  handle.addEventListener("pointerdown", beginGlobalPluginDockGesture);
  if (!window.PointerEvent) handle.addEventListener("touchstart", beginGlobalPluginDockGesture, { passive: true });
  if (globalPluginDockGestureBound) return;
  globalPluginDockGestureBound = true;
  document.addEventListener("pointermove", moveGlobalPluginDockGesture, { capture: true, passive: false });
  document.addEventListener("pointerup", finishGlobalPluginDockGesture, { capture: true });
  document.addEventListener("pointercancel", finishGlobalPluginDockGesture, { capture: true });
  if (!window.PointerEvent) {
    document.addEventListener("touchmove", moveGlobalPluginDockGesture, { capture: true, passive: false });
    document.addEventListener("touchend", finishGlobalPluginDockGesture, { capture: true });
    document.addEventListener("touchcancel", finishGlobalPluginDockGesture, { capture: true });
  }
}

function closeGlobalPluginDockForNavigation(options = {}) {
  resetGlobalPluginDockGesture();
  const dock = $("topicPluginDock");
  if (dock?.classList.contains("global-plugin-dock-expanded") && typeof setGlobalPluginDockExpanded === "function") {
    dock.classList.add("global-plugin-dock-navigation-settling");
    setGlobalPluginDockExpanded(false, { persist: options.persist !== false });
    window.setTimeout(() => {
      dock.classList.remove("global-plugin-dock-navigation-settling");
    }, typeof prefersReducedMotion === "function" && prefersReducedMotion() ? 0 : 220);
  }
  if (typeof closePluginActionMenus === "function") closePluginActionMenus(document);
}

function pluginTopicUsageWorkspaceId() {
  return String(state.selectedWorkspaceId || state.auth?.workspaceId || "owner").trim() || "owner";
}

function pluginTopicUsageApiReady() {
  return typeof api === "function" && Boolean(state.key || state.auth);
}

function pluginTopicUsageStorageKey(workspaceId = pluginTopicUsageWorkspaceId()) {
  const id = String(workspaceId || "owner").trim() || "owner";
  return `${PLUGIN_TOPIC_USAGE_STORAGE_KEY}:${id}`;
}

function normalizePluginTopicUsageEntry(entry) {
  const source = entry && typeof entry === "object" && !Array.isArray(entry) ? entry : {};
  const count = Math.max(0, Math.floor(Number(source.count) || 0));
  const lastUsedAt = Math.max(0, Math.floor(Number(source.lastUsedAt || source.last_used_at) || 0));
  return count || lastUsedAt ? { count, lastUsedAt } : null;
}

function normalizePluginTopicUsageBucket(bucket) {
  const source = bucket && typeof bucket === "object" && !Array.isArray(bucket) ? bucket : {};
  const out = {};
  Object.entries(source).forEach(([key, entry]) => {
    const id = String(key || "").trim().toLowerCase().slice(0, 96);
    const normalized = normalizePluginTopicUsageEntry(entry);
    if (id && normalized) out[id] = normalized;
  });
  return out;
}

function normalizePluginTopicUsage(usage) {
  const source = usage && typeof usage === "object" && !Array.isArray(usage) ? usage : {};
  const plugins = Object.assign({}, source.plugins && typeof source.plugins === "object" ? source.plugins : {});
  Object.entries(source).forEach(([key, entry]) => {
    if (key === "plugins" || key === "actions") return;
    if (entry && typeof entry === "object" && !Array.isArray(entry)) plugins[key] = entry;
  });
  return {
    plugins: normalizePluginTopicUsageBucket(plugins),
    actions: normalizePluginTopicUsageBucket(source.actions),
  };
}

function mergePluginTopicUsage(baseUsage, incomingUsage) {
  const base = normalizePluginTopicUsage(baseUsage);
  const incoming = normalizePluginTopicUsage(incomingUsage);
  const merged = { plugins: {}, actions: {} };
  ["plugins", "actions"].forEach((bucketName) => {
    const keys = new Set([...Object.keys(base[bucketName]), ...Object.keys(incoming[bucketName])]);
    keys.forEach((key) => {
      const current = base[bucketName][key] || {};
      const next = incoming[bucketName][key] || {};
      const entry = normalizePluginTopicUsageEntry({
        count: Math.max(Number(current.count || 0), Number(next.count || 0)),
        lastUsedAt: Math.max(Number(current.lastUsedAt || 0), Number(next.lastUsedAt || 0)),
      });
      if (entry) merged[bucketName][key] = entry;
    });
  });
  return merged;
}

function pluginTopicUsageEqual(a, b) {
  return JSON.stringify(normalizePluginTopicUsage(a)) === JSON.stringify(normalizePluginTopicUsage(b));
}

function readPluginTopicUsage() {
  const workspaceId = pluginTopicUsageWorkspaceId();
  const storageKey = pluginTopicUsageStorageKey(workspaceId);
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      pluginTopicUsageMemoryCache = normalizePluginTopicUsage(JSON.parse(raw));
      pluginTopicUsageMemoryCacheByWorkspace.set(workspaceId, pluginTopicUsageMemoryCache);
      return pluginTopicUsageMemoryCache;
    }
  } catch {
    // Fall back to the in-memory projection below.
  }
  pluginTopicUsageMemoryCache = pluginTopicUsageMemoryCacheByWorkspace.get(workspaceId) || normalizePluginTopicUsage({});
  return pluginTopicUsageMemoryCache;
}

function writePluginTopicUsage(usage) {
  const workspaceId = pluginTopicUsageWorkspaceId();
  pluginTopicUsageMemoryCache = normalizePluginTopicUsage(usage);
  pluginTopicUsageMemoryCacheByWorkspace.set(workspaceId, pluginTopicUsageMemoryCache);
  try {
    localStorage.setItem(pluginTopicUsageStorageKey(workspaceId), JSON.stringify(pluginTopicUsageMemoryCache));
  } catch {
    // Best-effort disk cache only; keep the in-memory projection usable.
  }
}

function markPluginTopicUsageLoaded(workspaceId = pluginTopicUsageWorkspaceId()) {
  const id = String(workspaceId || "").trim();
  if (id) pluginTopicUsageLoadedAtByWorkspace.set(id, Date.now());
}

function pluginTopicUsageRecentlyLoaded(workspaceId = pluginTopicUsageWorkspaceId()) {
  const loadedAt = pluginTopicUsageLoadedAtByWorkspace.get(String(workspaceId || "").trim()) || 0;
  return loadedAt > 0 && Date.now() - loadedAt < PLUGIN_TOPIC_USAGE_LOAD_TTL_MS;
}

function refreshPluginTopicUsageRoot(options = {}) {
  if (!["tasks"].includes(String(state.viewMode || "")) || state.currentTaskGroupId) return;
  if (typeof renderCurrentThread !== "function") return;
  const restoreScrollTop = options.revealQuickActions ? 0 : ($("conversation")?.scrollTop || 0);
  window.setTimeout(() => {
    if (state.viewMode === "tasks" && !state.currentTaskGroupId) {
      renderCurrentThread({ stickToBottom: false, restoreScrollTop });
    }
  }, 0);
}

async function flushPluginTopicUsageSync() {
  if (!pluginTopicUsagePendingSync || !pluginTopicUsageApiReady()) return;
  const pending = pluginTopicUsagePendingSync;
  pluginTopicUsagePendingSync = null;
  try {
    const result = await api(PLUGIN_TOPIC_USAGE_API_PATH, {
      method: "PATCH",
      body: JSON.stringify({ workspaceId: pending.workspaceId, usage: pending.usage }),
      timeoutMs: 8000,
    });
    const serverUsage = normalizePluginTopicUsage(result?.usage);
    const merged = mergePluginTopicUsage(readPluginTopicUsage(), serverUsage);
    if (!pluginTopicUsageEqual(readPluginTopicUsage(), merged)) {
      writePluginTopicUsage(merged);
      refreshPluginTopicUsageRoot();
    }
    markPluginTopicUsageLoaded(pending.workspaceId);
  } catch (_) {
    pluginTopicUsagePendingSync = pending;
  }
}

function schedulePluginTopicUsageSync(usage = readPluginTopicUsage()) {
  if (!pluginTopicUsageApiReady()) return;
  pluginTopicUsagePendingSync = {
    workspaceId: pluginTopicUsageWorkspaceId(),
    usage: normalizePluginTopicUsage(usage),
  };
  if (pluginTopicUsageSyncTimer) window.clearTimeout(pluginTopicUsageSyncTimer);
  pluginTopicUsageSyncTimer = window.setTimeout(() => {
    pluginTopicUsageSyncTimer = 0;
    flushPluginTopicUsageSync().catch(() => {});
  }, PLUGIN_TOPIC_USAGE_SYNC_DELAY_MS);
}

async function loadPluginTopicUsageFromServer(workspaceId = pluginTopicUsageWorkspaceId()) {
  if (!pluginTopicUsageApiReady() || !workspaceId) return null;
  const params = new URLSearchParams({ workspaceId });
  const result = await api(`${PLUGIN_TOPIC_USAGE_API_PATH}?${params.toString()}`, { timeoutMs: 8000 });
  const serverUsage = normalizePluginTopicUsage(result?.usage);
  const localUsage = readPluginTopicUsage();
  const merged = mergePluginTopicUsage(localUsage, serverUsage);
  if (!pluginTopicUsageEqual(localUsage, merged)) {
    writePluginTopicUsage(merged);
    refreshPluginTopicUsageRoot();
  }
  if (!pluginTopicUsageEqual(serverUsage, merged)) schedulePluginTopicUsageSync(merged);
  markPluginTopicUsageLoaded(workspaceId);
  return merged;
}

function ensurePluginTopicUsageLoaded() {
  const workspaceId = pluginTopicUsageWorkspaceId();
  if (!pluginTopicUsageApiReady() || !workspaceId || pluginTopicUsageRecentlyLoaded(workspaceId)) return;
  if (pluginTopicUsageLoadingWorkspaces.has(workspaceId)) return;
  const now = Date.now();
  if (now < (pluginTopicUsageLoadRetryAt.get(workspaceId) || 0)) return;
  const request = loadPluginTopicUsageFromServer(workspaceId)
    .catch(() => {
      pluginTopicUsageLoadRetryAt.set(workspaceId, Date.now() + 30000);
    })
    .finally(() => {
      pluginTopicUsageLoadingWorkspaces.delete(workspaceId);
    });
  pluginTopicUsageLoadingWorkspaces.set(workspaceId, request);
}

function pluginTopicActionUsageKey(pluginId = "", actionId = "") {
  const plugin = pluginTopicId(pluginId);
  const action = String(actionId || "").trim();
  return plugin && action ? `${plugin}:${action}` : "";
}

function pluginTopicUsageBucket(usage, bucketName) {
  const bucket = usage?.[bucketName];
  return bucket && typeof bucket === "object" && !Array.isArray(bucket) ? bucket : {};
}

function pluginTopicUsageEntry(usage, pluginId = "") {
  const id = pluginTopicId(pluginId);
  const current = pluginTopicUsageBucket(usage, "plugins")[id] || usage?.[id] || {};
  return current && typeof current === "object" && !Array.isArray(current) ? current : {};
}

function pluginTopicActionUsageEntry(usage, pluginId = "", actionId = "") {
  const key = pluginTopicActionUsageKey(pluginId, actionId);
  const current = key ? pluginTopicUsageBucket(usage, "actions")[key] : {};
  return current && typeof current === "object" && !Array.isArray(current) ? current : {};
}

function pluginTopicAppQuickAction(def) {
  return {
    id: CAPABILITY_PLUGIN_APP_ACTION_ID,
    label: def?.label || "",
    type: "open_plugin_app",
    glyph: def?.appIconGlyph || def?.sourceBadge || "",
  };
}

function recordPluginTopicUsage(pluginId, actionId = "") {
  const def = pluginTopicDefById(pluginId);
  if (!def) return;
  const usage = readPluginTopicUsage();
  const now = Date.now();
  const actionKey = pluginTopicActionUsageKey(def.id, actionId);
  if (actionKey) {
    const actions = { ...pluginTopicUsageBucket(usage, "actions") };
    const current = actions[actionKey] && typeof actions[actionKey] === "object" ? actions[actionKey] : {};
    actions[actionKey] = {
      count: Math.max(0, Number(current.count) || 0) + 1,
      lastUsedAt: now,
    };
    usage.actions = actions;
  } else {
    const plugins = { ...pluginTopicUsageBucket(usage, "plugins") };
    const current = pluginTopicUsageEntry(usage, def.id);
    plugins[def.id] = {
      count: Math.max(0, Number(current.count) || 0) + 1,
      lastUsedAt: now,
    };
    usage.plugins = plugins;
  }
  writePluginTopicUsage(usage);
  refreshPluginTopicUsageRoot({ revealQuickActions: true });
  schedulePluginTopicUsageSync(usage);
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

function pluginTopicCapabilityActionsEnabled(def) {
  return Boolean(def?.id && def.id !== "codex-mobile");
}

function pluginTopicActionManifestKey(def) {
  const workspaceId = pluginTopicUsageWorkspaceId();
  return `${workspaceId}:${pluginTopicId(def?.id || "")}`;
}

function pluginTopicCurrentManifest(def) {
  if (!def || def.builtinKind) return null;
  const workspaceId = pluginTopicUsageWorkspaceId();
  if (def.id === "wardrobe") {
    if (typeof currentWardrobePluginManifest === "function") return currentWardrobePluginManifest();
    const wardrobeManifest = state.wardrobePluginManifest || null;
    if (wardrobeManifest && (!wardrobeManifest.workspaceId || wardrobeManifest.workspaceId === workspaceId)) return wardrobeManifest;
    return null;
  }
  const embeddedDef = typeof EMBEDDED_PLUGIN_DEFS !== "undefined" ? EMBEDDED_PLUGIN_DEFS[def.id] : null;
  if (embeddedDef && typeof embeddedPluginCurrentManifest === "function") return embeddedPluginCurrentManifest(embeddedDef);
  const record = state.embeddedPlugins?.[def.id] || null;
  const manifest = record?.manifest || null;
  if (manifest && (!manifest.workspaceId || manifest.workspaceId === workspaceId)) return manifest;
  return null;
}

function pluginTopicManifestActions(def) {
  const manifest = pluginTopicCurrentManifest(def);
  if (!manifest || manifest.available === false || !Array.isArray(manifest.actions)) return [];
  return manifest.actions;
}

function pluginTopicActionSource(def) {
  const manifestActions = pluginTopicManifestActions(def);
  if (manifestActions.length) return manifestActions;
  return Array.isArray(def?.actions)
    ? def.actions
    : Array.isArray(def?.quickActions)
      ? def.quickActions
      : [];
}

function pluginTopicActionManifestRecentlyLoaded(def) {
  const key = pluginTopicActionManifestKey(def);
  const loadedAt = pluginTopicActionManifestLoadedAt.get(key) || 0;
  return loadedAt > 0 && Date.now() - loadedAt < PLUGIN_TOPIC_ACTION_MANIFEST_LOAD_TTL_MS;
}

function markPluginTopicActionManifestLoaded(def) {
  const key = pluginTopicActionManifestKey(def);
  if (key) pluginTopicActionManifestLoadedAt.set(key, Date.now());
}

async function refreshPluginTopicActionManifest(def, options = {}) {
  if (!def || def.builtinKind || def.id === "codex-mobile" || !pluginTopicNavigationAvailable(def)) return false;
  if (!options.force && pluginTopicActionManifestRecentlyLoaded(def)) return false;
  const key = pluginTopicActionManifestKey(def);
  if (pluginTopicActionManifestLoading.has(key)) return false;
  const loader = (async () => {
    if (def.id === "wardrobe" && typeof loadWardrobePluginManifest === "function") {
      await loadWardrobePluginManifest({ force: true });
      return true;
    }
    const embeddedDef = typeof EMBEDDED_PLUGIN_DEFS !== "undefined" ? EMBEDDED_PLUGIN_DEFS[def.id] : null;
    if (embeddedDef && typeof loadEmbeddedPluginManifest === "function") {
      await loadEmbeddedPluginManifest(embeddedDef, { force: true });
      return true;
    }
    return false;
  })();
  pluginTopicActionManifestLoading.set(key, loader);
  try {
    const loaded = await loader;
    markPluginTopicActionManifestLoaded(def);
    return loaded;
  } catch (_) {
    markPluginTopicActionManifestLoaded(def);
    return false;
  } finally {
    pluginTopicActionManifestLoading.delete(key);
  }
}

function schedulePluginTopicActionProjectionRefresh() {
  if (pluginTopicActionManifestRefreshTimer) return;
  pluginTopicActionManifestRefreshTimer = window.setTimeout(() => {
    pluginTopicActionManifestRefreshTimer = 0;
    if (typeof refreshPluginAppOrderSurfaces === "function") refreshPluginAppOrderSurfaces();
  }, 0);
}

function ensurePluginTopicActionManifestsLoaded(defs = []) {
  if (!Array.isArray(defs) || !defs.length) return;
  defs.forEach((def) => {
    if (!def || def.builtinKind || def.id === "codex-mobile") return;
    if (pluginTopicManifestActions(def).length || pluginTopicActionManifestRecentlyLoaded(def)) return;
    refreshPluginTopicActionManifest(def)
      .then((loaded) => {
        if (loaded) schedulePluginTopicActionProjectionRefresh();
      })
      .catch(() => {});
  });
}

function pluginTopicNormalizeAction(def, action, index = 0) {
  if (!def || !action || typeof action !== "object") return null;
  const id = pluginTopicId(action.id);
  const label = String(action.label || "").trim();
  if (!id || !label) return null;
  const rawEntry = action.entry && typeof action.entry === "object" ? action.entry : {};
  const legacyType = String(action.type || "").trim();
  const entryType = String(rawEntry.type || legacyType || "plugin_route").trim();
  const pluginRoute = String(rawEntry.pluginRoute || rawEntry.route || action.pluginRoute || action.route || id).trim();
  const placement = Array.isArray(action.placement)
    ? action.placement.map((item) => String(item || "").trim()).filter(Boolean)
    : ["plugin_drawer_frequent", "dock_long_press", "search"];
  return {
    id,
    label,
    description: String(action.description || "").trim(),
    glyph: String(action.glyph || def.sourceBadge || "").trim().slice(0, 2),
    priority: Number.isFinite(Number(action.priority)) ? Number(action.priority) : index + 1,
    placement,
    entry: {
      type: entryType,
      pluginRoute,
      pluginItemId: String(rawEntry.pluginItemId || rawEntry.itemId || action.pluginItemId || "").trim(),
      pluginThreadId: String(rawEntry.pluginThreadId || rawEntry.threadId || action.pluginThreadId || "").trim(),
      pluginTaskId: String(rawEntry.pluginTaskId || rawEntry.taskId || action.pluginTaskId || "").trim(),
      sourceTurnId: String(rawEntry.sourceTurnId || rawEntry.turnId || action.sourceTurnId || "").trim(),
    },
  };
}

function pluginTopicQuickActions(def, options = {}) {
  if (!pluginTopicCapabilityActionsEnabled(def)) return [];
  const placement = String(options.placement || "").trim();
  const source = pluginTopicActionSource(def);
  return source
    .map((action, index) => pluginTopicNormalizeAction(def, action, index))
    .filter(Boolean)
    .filter((action) => {
      if (!placement || !action.placement.length || action.placement.includes(placement)) return true;
      if (placement === "plugin_drawer_frequent" && action.placement.includes("capability_hub")) return true;
      if (placement === "capability_hub" && action.placement.includes("plugin_drawer_frequent")) return true;
      return false;
    })
    .sort((a, b) => a.priority - b.priority);
}

function pluginTopicActionById(pluginId = "", actionId = "") {
  const def = pluginTopicDefById(pluginId);
  if (!def) return null;
  const id = String(actionId || "").trim();
  const action = pluginTopicQuickActions(def).find((item) => String(item.id || "") === id) || null;
  return action ? { def, action } : null;
}

function capabilityHubQuickActions(defs = [], options = {}) {
  const usage = readPluginTopicUsage();
  const includeDefaults = options.includeDefaults === true;
  const placement = String(options.placement || "plugin_drawer_frequent").trim() || "plugin_drawer_frequent";
  const includePluginLaunches = options.includePluginLaunches !== false;
  const limit = Math.max(1, Math.min(12, Math.floor(Number(options.limit) || CAPABILITY_QUICK_ACTION_LIMIT)));
  const result = [];
  defs.forEach((def) => {
    if (!pluginTopicCapabilityActionsEnabled(def)) return;
    const defIndex = pluginTopicDefinitionIndex(def.id);
    const pluginEntry = pluginTopicUsageEntry(usage, def.id);
    const pluginCount = Math.max(0, Number(pluginEntry.count) || 0);
    const actions = pluginTopicQuickActions(def, { placement });
    if (pluginCount && includePluginLaunches) {
      result.push({
        def,
        action: pluginTopicAppQuickAction(def),
        count: pluginCount,
        lastUsedAt: Math.max(0, Number(pluginEntry.lastUsedAt) || 0),
        defIndex,
        actionIndex: actions.length + 1,
      });
    }
    actions.forEach((action, actionIndex) => {
      const entry = pluginTopicActionUsageEntry(usage, def.id, action.id);
      const count = Math.max(0, Number(entry.count) || 0);
      if (!count && !includeDefaults) return;
      result.push({
        def,
        action,
        count,
        lastUsedAt: Math.max(0, Number(entry.lastUsedAt) || 0),
        defIndex,
        actionIndex,
      });
    });
  });
  return result
    .sort((a, b) => (
      b.count - a.count
      || b.lastUsedAt - a.lastUsedAt
      || a.actionIndex - b.actionIndex
      || a.defIndex - b.defIndex
    ))
    .slice(0, limit)
    .map(({ def, action }) => ({ def, action }));
}

function pluginDrawerFrequentActions(defs = [], options = {}) {
  return capabilityHubQuickActions(defs, {
    includeDefaults: options.includeDefaults !== false,
    includePluginLaunches: false,
    placement: "plugin_drawer_frequent",
    limit: PLUGIN_DRAWER_QUICK_ACTION_LIMIT,
  });
}

function pluginTopicActionLabel(def, action) {
  return String(action?.label || def?.label || "").trim();
}

function renderCapabilityQuickAction(def, action) {
  const sourceBadge = String(def?.sourceBadge || def?.label || "").trim().slice(0, 2);
  const dataAttrs = action?.type === "open_plugin_app"
    ? `data-plugin-topic-open-app="${escapeHtml(def.id)}"`
    : `data-plugin-topic-action-plugin="${escapeHtml(def.id)}" data-plugin-topic-action-id="${escapeHtml(action.id)}"`;
  return `<button class="capability-quick-action" type="button" ${dataAttrs} aria-label="${escapeHtml(`${pluginTopicActionLabel(def, action)}\uff0c${def.label}`)}">
    <span class="capability-action-glyph" aria-hidden="true">${escapeHtml(action.glyph || sourceBadge || "")}</span>
    <span class="capability-action-label">${escapeHtml(pluginTopicActionLabel(def, action))}</span>
  </button>`;
}

function renderCapabilityActionMenu(def) {
  const actions = pluginTopicQuickActions(def, { placement: "dock_long_press" });
  const bottomButtonId = pluginTopicBottomButtonId(def);
  const pinEligible = Boolean(bottomButtonId && !def.builtinKind);
  const pinned = pinEligible && pluginBottomTabPinned(def.id);
  const pinAvailable = pinEligible && pluginBottomTabPinAvailable(def.id);
  const menuActions = actions.map((action) => `
    <button class="capability-menu-item" type="button" data-plugin-topic-action-plugin="${escapeHtml(def.id)}" data-plugin-topic-action-id="${escapeHtml(action.id)}">
      <span class="capability-menu-glyph" aria-hidden="true">${escapeHtml(action.glyph || def.sourceBadge || "")}</span>
      <span class="capability-menu-text">${escapeHtml(pluginTopicActionLabel(def, action))}</span>
    </button>
  `).join("");
  return `<div class="capability-action-menu" role="menu" aria-label="${escapeHtml(`${def.label}\u5feb\u6377\u64cd\u4f5c`)}" data-plugin-topic-action-menu="${escapeHtml(def.id)}" hidden>
    <div class="capability-menu-head">
      <span class="plugin-topic-app-icon ${escapeHtml(def.appIconClass || def.id)}" data-plugin-icon="${escapeHtml(def.appIconGlyph || "")}" aria-hidden="true"></span>
      <span class="capability-menu-title">${escapeHtml(def.label)}</span>
    </div>
    ${menuActions}
    <button class="capability-menu-item" type="button" data-plugin-topic-open-app="${escapeHtml(def.id)}">
      <span class="capability-menu-glyph" aria-hidden="true">\u2197</span>
      <span class="capability-menu-text">\u6253\u5f00\u63d2\u4ef6</span>
    </button>
    ${pinEligible ? `<button class="capability-menu-item" type="button" data-plugin-bottom-tab-toggle="${escapeHtml(def.id)}" data-plugin-bottom-tab-pinned="${pinned ? "1" : "0"}"${(!pinned && !pinAvailable) ? " disabled" : ""}>
      <span class="capability-menu-glyph" aria-hidden="true">${pinned ? "\u2605" : "\u2606"}</span>
      <span class="capability-menu-text">${pinned ? "\u4ece\u5e95\u90e8\u79fb\u9664" : (pinAvailable ? "\u56fa\u5b9a\u5230\u5e95\u90e8" : "\u5e95\u90e8\u5df2\u6ee1")}</span>
    </button>` : ""}
    <div class="capability-menu-order">
      <button class="capability-menu-order-button" type="button" data-plugin-topic-move="${escapeHtml(def.id)}" data-plugin-topic-move-dir="up">\u524d\u79fb</button>
      <button class="capability-menu-order-button" type="button" data-plugin-topic-move="${escapeHtml(def.id)}" data-plugin-topic-move-dir="down">\u540e\u79fb</button>
    </div>
  </div>`;
}

function persistPluginAppOrderFromStrip(strip) {
  const ids = [...(strip?.querySelectorAll?.("[data-plugin-topic-sort-id]") || [])]
    .map((item) => item.dataset.pluginTopicSortId || "")
    .filter(Boolean);
  if (ids.length) writePluginTopicOrder(ids);
}

function movePluginAppOrder(pluginId = "", direction = "up") {
  const defs = orderedPluginAppDefs(availablePluginTopicDefs());
  const ids = defs.map((def) => def.id);
  const id = pluginTopicId(pluginId);
  const index = ids.indexOf(id);
  if (index < 0) return;
  const nextIndex = direction === "down" ? Math.min(ids.length - 1, index + 1) : Math.max(0, index - 1);
  if (nextIndex === index) return;
  const [item] = ids.splice(index, 1);
  ids.splice(nextIndex, 0, item);
  writePluginTopicOrder(ids);
  refreshPluginAppOrderSurfaces();
}

function refreshPluginAppOrderSurfaces() {
  const dock = $("topicPluginDock");
  const dockHadContent = typeof globalPluginDockLauncherPresent === "function"
    ? globalPluginDockLauncherPresent(dock)
    : Boolean(dock?.querySelector?.(".plugin-app-card"));
  const wasExpanded = Boolean(dock?.classList?.contains("global-plugin-dock-expanded"));
  if (typeof updateSidebarPluginLauncher === "function") updateSidebarPluginLauncher();
  if (!dockHadContent || typeof renderPluginAppLauncher !== "function" || typeof setTopicPluginDock !== "function") return;
  setTopicPluginDock(renderPluginAppLauncher());
  if (typeof applyGlobalPluginDockState === "function") applyGlobalPluginDockState(dock, wasExpanded);
  if (typeof updateTopicPluginDockChrome === "function") {
    updateTopicPluginDockChrome(typeof isTaskListView === "function" ? isTaskListView() : false);
  }
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

function renderPluginTopicStats(def, options = {}) {
  if (!def || def.builtinKind) return "";
  const claimedCollections = pluginTopicClaimedCollectionsForPlugin(options.claimedDirectoryTopicCollections || [], def.id);
  const historyCount = claimedCollections.reduce((total, collection) => total + (collection.groups?.length || 0), 0);
  const stats = [
    historyCount > 0 ? `${historyCount} \u4e2a\u4e13\u9898` : "\u9ed8\u8ba4\u8bdd\u9898",
  ].filter(Boolean);
  return `<span class="plugin-topic-stats">${stats.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</span>`;
}

function pluginTopicCollectionUpdatedAt(collections = []) {
  return (collections || [])
    .map((collection) => Date.parse(collection?.updatedAt || collection?.defaultGroup?.updatedAt || ""))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0] || 0;
}

function pluginTopicRowMeta(def, childEntries = [], options = {}) {
  if (!def || def.builtinKind) return "";
  if (!childEntries.length) return "\u9ed8\u8ba4\u8bdd\u9898";
  const claimedCollections = pluginTopicClaimedCollectionsForPlugin(options.claimedDirectoryTopicCollections || [], def.id);
  const updatedAtValue = pluginTopicCollectionUpdatedAt(claimedCollections);
  const updated = updatedAtValue ? formatTime(new Date(updatedAtValue).toISOString()) : "";
  return [ `${childEntries.length} \u4e2a\u4e13\u9898`, updated ].filter(Boolean).join("\u3000");
}

function pluginTopicExpandedStorageKey(workspaceId = pluginTopicUsageWorkspaceId()) {
  const id = String(workspaceId || "owner").trim() || "owner";
  return `${PLUGIN_TOPIC_EXPANDED_STORAGE_KEY}:${id}`;
}

function readExpandedPluginTopics(workspaceId = pluginTopicUsageWorkspaceId()) {
  try {
    const raw = localStorage.getItem(pluginTopicExpandedStorageKey(workspaceId));
    const values = JSON.parse(raw || "[]");
    return new Set(Array.isArray(values) ? values.map(pluginTopicId).filter(Boolean) : []);
  } catch (_) {
    return new Set();
  }
}

function writeExpandedPluginTopics(expanded, workspaceId = pluginTopicUsageWorkspaceId()) {
  try {
    localStorage.setItem(pluginTopicExpandedStorageKey(workspaceId), JSON.stringify([...expanded].map(pluginTopicId).filter(Boolean)));
  } catch (_) {}
}

function setPluginTopicExpanded(pluginId, expanded) {
  const id = pluginTopicId(pluginId);
  if (!id) return;
  const expandedTopics = readExpandedPluginTopics();
  if (expanded) expandedTopics.add(id);
  else expandedTopics.delete(id);
  writeExpandedPluginTopics(expandedTopics);
}

function pluginTopicChildEntries(def, options = {}) {
  if (!def || def.builtinKind) return [];
  return pluginTopicSwitcherEntries(def)
    .filter((entry) => entry.kind === "claimed_directory" && entry.taskGroupId);
}

function renderPluginTopicCards(options = {}) {
  ensurePluginTopicBindingsLoaded();
  const defs = orderedPluginAppDefs(availablePluginTopicDefs())
    .filter((def) => !def.builtinKind && def.id !== "codex-mobile");
  if (!defs.length) return "";
  const expandedTopics = readExpandedPluginTopics();
  return `<section class="plugin-topic-launcher" aria-label="\u63d2\u4ef6\u8bdd\u9898">
    <div class="plugin-topic-list">
      ${defs.map((def) => {
        const childEntries = pluginTopicChildEntries(def, options);
        const hasChildren = childEntries.length > 0;
        const expanded = hasChildren && expandedTopics.has(def.id);
        const bodyAttrs = hasChildren
          ? `data-plugin-topic-toggle="${escapeHtml(def.id)}" aria-expanded="${expanded ? "true" : "false"}" aria-label="${escapeHtml(`${expanded ? "\u6536\u8d77" : "\u5c55\u5f00"}${def.label}\u8bdd\u9898`)}"`
          : `data-plugin-topic-open-topic="${escapeHtml(def.id)}" aria-label="${escapeHtml(`\u6253\u5f00${def.label}\u8bdd\u9898`)}"`;
        return `
        <article class="plugin-topic-card${expanded ? "" : " collapsed"}${hasChildren ? " has-children" : " single-topic"}" data-plugin-topic-card="${escapeHtml(def.id)}">
          <div class="plugin-topic-card-main-row">
            <button class="plugin-topic-icon-entry" type="button" data-plugin-topic-open-topic="${escapeHtml(def.id)}" aria-label="${escapeHtml(`\u6253\u5f00${def.label}\u9ed8\u8ba4\u8bdd\u9898`)}">
              <span class="plugin-topic-app-icon ${escapeHtml(def.appIconClass || def.id)}" data-plugin-icon="${escapeHtml(def.appIconGlyph || "")}" aria-hidden="true"></span>
            </button>
            <button class="plugin-topic-row-body" type="button" ${bodyAttrs}>
              <span class="plugin-topic-text">
                <span class="plugin-topic-title">${escapeHtml(def.label)}</span>
                <span class="plugin-topic-subtitle">${escapeHtml(pluginTopicRowMeta(def, childEntries, options))}</span>
              </span>
            </button>
            ${hasChildren ? `<button class="plugin-topic-row-toggle" type="button" ${bodyAttrs}>
              <span class="plugin-topic-row-chevron directory-topic-chevron" aria-hidden="true"></span>
            </button>` : `<span class="plugin-topic-row-chevron-placeholder" aria-hidden="true"></span>`}
          </div>
          ${hasChildren ? `<div class="plugin-topic-child-list directory-topic-bound-list" aria-label="${escapeHtml(`${def.label}\u4e13\u9898\u8bdd\u9898`)}">
            ${childEntries.map((entry) => `<button class="plugin-topic-child-row directory-topic-chip" type="button" data-plugin-claimed-topic-open="${escapeHtml(entry.taskGroupId)}" data-plugin-claimed-topic-plugin="${escapeHtml(entry.pluginId)}">
              <span class="plugin-topic-action-icon chat" aria-hidden="true"></span>
              <span class="plugin-topic-child-title directory-topic-chip-title">${escapeHtml(entry.title || "\u4e13\u9898\u8bdd\u9898")}</span>
            </button>`).join("")}
          </div>` : ""}
        </article>
      `;
      }).join("")}
    </div>
  </section>`;
}

function pluginTopicSwitcherEntries(def, thread = state.currentThread) {
  if (!def || def.builtinKind || !thread) return [];
  const entries = [{
    kind: "default",
    pluginId: def.id,
    taskGroupId: pluginTopicGroupId(def.id),
    title: `${def.label}\u9ed8\u8ba4\u8bdd\u9898`,
    subtitle: "\u63d2\u4ef6\u8bdd\u9898",
  }];
  const groups = (typeof taskGroupsForThread === "function" ? taskGroupsForThread(thread) : [])
    .filter((group) => !isPluginTopicTaskGroup(group));
  const collections = typeof directoryTopicCollectionsForGroups === "function"
    ? directoryTopicCollectionsForGroups(groups)
    : [];
  for (const collection of pluginTopicClaimedCollectionsForPlugin(collections, def.id)) {
    for (const group of collection.groups || []) {
      entries.push({
        kind: "claimed_directory",
        pluginId: def.id,
        taskGroupId: group.id,
        title: typeof directoryTopicDisplayTitle === "function" ? directoryTopicDisplayTitle(group) : (group.title || "\u5386\u53f2\u4e13\u9898"),
        subtitle: collection.label || "\u5386\u53f2\u76ee\u5f55\u8bdd\u9898",
      });
    }
  }
  entries.push({
    kind: "new",
    pluginId: def.id,
    taskGroupId: "",
    title: "\u65b0\u5efa\u4e13\u9898\u8bdd\u9898",
    subtitle: "\u5148\u4ece\u9ed8\u8ba4\u8bdd\u9898\u53d1\u8d77",
  });
  return entries;
}

function pluginTopicCurrentSwitcherLabel(def, group = null) {
  if (!def) return "\u8bdd\u9898";
  if (!group || String(group.id || "") === pluginTopicGroupId(def.id)) return `${def.label} · \u9ed8\u8ba4\u8bdd\u9898`;
  const title = typeof directoryTopicDisplayTitle === "function" ? directoryTopicDisplayTitle(group) : (group.title || "\u4e13\u9898\u8bdd\u9898");
  return `${def.label} · ${title}`;
}

function renderPluginTopicSwitcher(group = null) {
  const def = pluginTopicDefForTaskGroup(group) || pluginTopicDefForViewMode(state.viewMode);
  if (!def || def.builtinKind) return "";
  const entries = pluginTopicSwitcherEntries(def);
  const currentGroupId = String(group?.id || state.currentTaskGroupId || "");
  return `<section class="plugin-topic-switcher" data-plugin-topic-switcher="${escapeHtml(def.id)}">
    <button class="plugin-topic-switch-button" type="button" data-plugin-topic-switch-toggle aria-expanded="false">
      <span>${escapeHtml(pluginTopicCurrentSwitcherLabel(def, group))}</span>
      <span class="plugin-topic-switch-chevron" aria-hidden="true"></span>
    </button>
    <div class="plugin-topic-switch-panel" data-plugin-topic-switch-panel hidden>
      ${entries.map((entry) => {
        const active = entry.taskGroupId && entry.taskGroupId === currentGroupId;
        const attrs = entry.kind === "new"
          ? `data-plugin-topic-new-topic="${escapeHtml(entry.pluginId)}"`
          : entry.kind === "default"
            ? `data-plugin-topic-open-topic="${escapeHtml(entry.pluginId)}"`
            : `data-plugin-claimed-topic-open="${escapeHtml(entry.taskGroupId)}" data-plugin-claimed-topic-plugin="${escapeHtml(entry.pluginId)}"`;
        return `<button class="plugin-topic-switch-item${active ? " active" : ""}" type="button" ${attrs}>
          <span class="plugin-topic-switch-item-title">${escapeHtml(entry.title)}</span>
          <span class="plugin-topic-switch-item-subtitle">${escapeHtml(entry.subtitle)}</span>
        </button>`;
      }).join("")}
    </div>
  </section>`;
}

function openPluginClaimedDirectoryTopic(pluginId, taskGroupId) {
  const def = pluginTopicDefById(pluginId);
  if (!def || def.builtinKind || !taskGroupId) return;
  state.pluginContextNavPluginId = def.id;
  if (typeof openTaskGroupFromList === "function") {
    openTaskGroupFromList(taskGroupId);
  } else {
    state.currentTaskGroupId = taskGroupId;
    renderCurrentThread({ stickToBottom: true });
  }
  if (typeof updateNavigationControls === "function") updateNavigationControls();
}

function wirePluginTopicSwitcher(root) {
  const switcher = root?.querySelector?.("[data-plugin-topic-switcher]");
  if (!switcher || switcher.dataset.pluginTopicSwitcherBound === "1") return;
  switcher.dataset.pluginTopicSwitcherBound = "1";
  const toggle = switcher.querySelector("[data-plugin-topic-switch-toggle]");
  const panel = switcher.querySelector("[data-plugin-topic-switch-panel]");
  toggle?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const open = Boolean(panel?.hidden);
    if (panel) panel.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  panel?.addEventListener("click", (event) => event.stopPropagation());
  panel?.querySelectorAll?.("[data-plugin-claimed-topic-open]").forEach((button) => {
    button.addEventListener("click", () => {
      if (panel) panel.hidden = true;
      toggle?.setAttribute("aria-expanded", "false");
      openPluginClaimedDirectoryTopic(button.dataset.pluginClaimedTopicPlugin, button.dataset.pluginClaimedTopicOpen);
    });
  });
  panel?.querySelectorAll?.("[data-plugin-topic-open-topic]").forEach((button) => {
    button.addEventListener("click", () => {
      if (panel) panel.hidden = true;
      toggle?.setAttribute("aria-expanded", "false");
      openPluginTopicChat(button.dataset.pluginTopicOpenTopic).catch(showError);
    });
  });
  panel?.querySelectorAll?.("[data-plugin-topic-new-topic]").forEach((button) => {
    button.addEventListener("click", () => {
      if (panel) panel.hidden = true;
      toggle?.setAttribute("aria-expanded", "false");
      openPluginTopicChat(button.dataset.pluginTopicNewTopic).catch(showError);
      if (typeof showPushToast === "function") showPushToast("\u5df2\u8fdb\u5165\u63d2\u4ef6\u9ed8\u8ba4\u8bdd\u9898\uff0c\u53ef\u76f4\u63a5\u53d1\u8d77\u65b0\u4e13\u9898\u3002", "info");
    });
  });
}

function renderPluginAppDesktop(defs = []) {
  if (!defs.length) return "";
  return `<section class="capability-plugin-desktop" aria-label="\u63d2\u4ef6">
    <div class="capability-section-head">
      <h3>\u63d2\u4ef6</h3>
      <span>\u70b9\u56fe\u6807\u6253\u5f00\uff0c\u957f\u6309\u9009\u62e9\u5feb\u6377\u52a8\u4f5c</span>
    </div>
    <div class="capability-plugin-grid" role="list" data-plugin-count="${defs.length}">
      ${defs.map((def) => `
        <div class="capability-plugin-cell" role="listitem">
          <button class="plugin-app-card capability-plugin-icon-button" type="button" data-plugin-topic-open-app="${escapeHtml(def.id)}" data-plugin-topic-sort-id="${escapeHtml(def.id)}" aria-label="${escapeHtml(`\u6253\u5f00${def.label}`)}">
            <span class="plugin-topic-app-icon ${escapeHtml(def.appIconClass || def.id)}" data-plugin-icon="${escapeHtml(def.appIconGlyph || "")}" aria-hidden="true"></span>
            <span class="plugin-app-label">${escapeHtml(def.label)}</span>
          </button>
          ${renderCapabilityActionMenu(def)}
        </div>
      `).join("")}
    </div>
  </section>`;
}

function renderCapabilityEntryHub(options = {}) {
  ensurePluginTopicUsageLoaded();
  const defs = orderedPluginAppDefs(availablePluginTopicDefs());
  if (!defs.length) return "";
  const quickActions = capabilityHubQuickActions(defs, { includeDefaults: options.includeDefaults === true });
  if (!quickActions.length) return "";
  return `<section class="capability-entry-hub" aria-label="\u80fd\u529b\u5165\u53e3">
    <section class="capability-frequent" aria-label="\u5feb\u6377\u5165\u53e3">
      <div class="capability-quick-grid" data-capability-quick-columns="3">
        ${quickActions.map(({ def, action }) => renderCapabilityQuickAction(def, action)).join("")}
      </div>
    </section>
  </section>`;
}

function renderCapabilityView(options = {}) {
  const conversation = $("conversation");
  if (!conversation) return;
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  state.skillDetail = null;
  const pluginAppDock = typeof renderPluginAppLauncher === "function" ? renderPluginAppLauncher() : "";
  const capabilityEntryHub = renderCapabilityEntryHub(Object.assign({}, options, { includeDefaults: true }));
  $("threadTitle").textContent = "能力";
  $("threadMeta").textContent = "快捷操作";
  $("interruptRun").disabled = true;
  if (typeof configureComposer === "function") configureComposer({ enabled: false, placeholder: "选择一个能力开始" });
  conversation.innerHTML = capabilityEntryHub || `<div class="empty-state">暂无常用能力。先从插件抽屉打开插件或使用插件菜单，常用能力会出现在这里。</div>`;
  if (typeof setTopicPluginDock === "function") setTopicPluginDock(pluginAppDock);
  if (typeof wirePluginTopicCards === "function") wirePluginTopicCards(conversation);
  if (typeof updateNavigationControls === "function") updateNavigationControls();
  if (typeof ensureVerticalScrollAffordance === "function") ensureVerticalScrollAffordance();
  if (Number.isFinite(Number(options.restoreScrollTop))) conversation.scrollTop = Math.max(0, Number(options.restoreScrollTop) || 0);
}

function renderPluginDrawerQuickActionMenu(quickActions = []) {
  const menuActions = quickActions.map(({ def, action }) => `
    <button class="capability-menu-item" type="button" data-plugin-topic-action-plugin="${escapeHtml(def.id)}" data-plugin-topic-action-id="${escapeHtml(action.id)}">
      <span class="capability-menu-glyph" aria-hidden="true">${escapeHtml(action.glyph || def.sourceBadge || "")}</span>
      <span class="capability-menu-text">${escapeHtml(pluginTopicActionLabel(def, action))}</span>
    </button>
  `).join("");
  return `<div class="capability-action-menu plugin-drawer-action-menu" role="menu" aria-label="\u5e38\u7528\u5feb\u6377\u80fd\u529b" data-plugin-drawer-action-menu hidden>
    <div class="capability-menu-head plugin-drawer-menu-head">
      <span class="plugin-drawer-quick-icon" aria-hidden="true">\u5feb</span>
      <span class="capability-menu-title">\u5e38\u7528</span>
    </div>
    ${menuActions || `<div class="capability-menu-empty">\u6682\u65e0\u5e38\u7528\u5feb\u6377\u80fd\u529b</div>`}
  </div>`;
}

function renderPluginAppLauncher() {
  const defs = orderedPluginAppDefs(availablePluginTopicDefs());
  if (!defs.length) return "";
  ensurePluginTopicActionManifestsLoaded(defs);
  const quickActions = pluginDrawerFrequentActions(defs, { includeDefaults: true });
  const cardsCount = defs.length + 1;
  const fillCount = Math.min(Math.max(cardsCount, 1), 6);
  return `<section class="plugin-app-launcher" aria-label="\u63d2\u4ef6\u5e94\u7528">
    <div class="plugin-app-strip" role="list" data-plugin-count="${defs.length}" data-plugin-fill-count="${fillCount}" data-plugin-drawer-card-count="${cardsCount}">
      <button class="plugin-app-card plugin-drawer-quick-card" type="button" role="listitem" data-plugin-drawer-quick-actions aria-label="\u6253\u5f00\u5e38\u7528\u5feb\u6377\u80fd\u529b">
        <span class="plugin-drawer-quick-icon" aria-hidden="true">\u5feb</span>
        <span class="plugin-app-label">\u5e38\u7528</span>
      </button>
      ${renderPluginDrawerQuickActionMenu(quickActions)}
      ${defs.map((def) => `
        <button class="plugin-app-card" type="button" role="listitem" data-plugin-topic-open-app="${escapeHtml(def.id)}" data-plugin-topic-sort-id="${escapeHtml(def.id)}" aria-label="${escapeHtml(`\u6253\u5f00${def.label}\u63d2\u4ef6`)}">
          <span class="plugin-topic-app-icon ${escapeHtml(def.appIconClass || def.id)}" data-plugin-icon="${escapeHtml(def.appIconGlyph || "")}" aria-hidden="true"></span>
          <span class="plugin-app-label">${escapeHtml(def.label)}</span>
        </button>
        ${renderCapabilityActionMenu(def)}
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
  state.directoryPluginContextActive = true;
  state.viewMode = "projects";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentTaskGroupId = "";
  state.currentThread = null;
  state.currentThreadId = "";
  if (typeof applyViewMode === "function") applyViewMode();
  if (typeof updateNavigationControls === "function") updateNavigationControls();
  if (typeof resetDirectoryPath === "function") resetDirectoryPath();
  if (typeof loadProjects === "function") await loadProjects();
  if (typeof loadSelectedView === "function") await loadSelectedView();
  else await loadDirectoryView({ resetPath: true });
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

function pluginTopicActionOpenRoute(action) {
  const entry = action?.entry && typeof action.entry === "object" ? action.entry : {};
  const route = {
    pluginActionId: String(action?.id || "").trim(),
    pluginRoute: String(entry.pluginRoute || action?.pluginRoute || action?.route || action?.id || "").trim(),
    pluginItemId: String(entry.pluginItemId || "").trim(),
    pluginThreadId: String(entry.pluginThreadId || "").trim(),
    pluginTaskId: String(entry.pluginTaskId || "").trim(),
    sourceTurnId: String(entry.sourceTurnId || "").trim(),
  };
  return Object.fromEntries(Object.entries(route).filter(([, value]) => value));
}

function setPluginTopicAppOpenRoute(def, route = {}) {
  if (!def || def.builtinKind) return false;
  if (def.id === "wardrobe" && typeof setWardrobePluginOpenRoute === "function") return setWardrobePluginOpenRoute(route);
  if (def.id === "codex-mobile" && typeof setCodexPluginOpenRoute === "function") return setCodexPluginOpenRoute(route);
  if (def.id === "finance" && typeof setFinancePluginOpenRoute === "function") return setFinancePluginOpenRoute(route);
  if (def.id === "email" && typeof setEmailPluginOpenRoute === "function") return setEmailPluginOpenRoute(route);
  if (def.id === "health" && typeof setHealthPluginOpenRoute === "function") return setHealthPluginOpenRoute(route);
  if (def.id === "note" && typeof setNotePluginOpenRoute === "function") return setNotePluginOpenRoute(route);
  if (def.id === "growth" && typeof setGrowthPluginOpenRoute === "function") return setGrowthPluginOpenRoute(route);
  const embeddedDef = typeof EMBEDDED_PLUGIN_DEFS !== "undefined" ? EMBEDDED_PLUGIN_DEFS[def.id] : null;
  return Boolean(embeddedDef && typeof setEmbeddedPluginOpenRoute === "function" && setEmbeddedPluginOpenRoute(embeddedDef, route));
}

async function openPluginTopicApp(pluginId, options = {}) {
  const def = pluginTopicDefById(pluginId);
  if (!def || !pluginTopicNavigationAvailable(def)) return;
  if (options.recordUsage !== false) recordPluginTopicUsage(def.id);
  if (def.builtinKind === "directory") {
    await openBuiltInDirectoryPlugin();
    return;
  }
  if (typeof preparePrimaryNavigationChange === "function") preparePrimaryNavigationChange();
  else if (typeof closeBottomPluginMenu === "function") closeBottomPluginMenu();
  clearQuotedReply({ render: false });
  state.pluginContextNavPluginId = def.id;
  if (def.id === "wardrobe" && typeof rememberWardrobePluginReturnRoute === "function") rememberWardrobePluginReturnRoute();
  if (def.id === "finance" && typeof rememberFinancePluginReturnRoute === "function") rememberFinancePluginReturnRoute();
  if (def.id === "email" && typeof rememberEmailPluginReturnRoute === "function") rememberEmailPluginReturnRoute();
  if (def.id === "health" && typeof rememberHealthPluginReturnRoute === "function") rememberHealthPluginReturnRoute();
  if (def.id === "note" && typeof rememberNotePluginReturnRoute === "function") rememberNotePluginReturnRoute();
  if (def.id === "growth" && typeof rememberGrowthPluginReturnRoute === "function") rememberGrowthPluginReturnRoute();
  setPluginTopicAppOpenRoute(def, options.action ? pluginTopicActionOpenRoute(options.action) : (options.route || {}));
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
  state.forceChatStickToBottomUntil = Date.now() + 12000;
  state.conversationPinnedToBottom = true;
  if (typeof normalizeMobileViewportAfterViewChange === "function") normalizeMobileViewportAfterViewChange();
  if (!deferViewModeApplyUntilLoaded && typeof applyViewMode === "function") applyViewMode();
  await loadSingleWindow();
  if (deferViewModeApplyUntilLoaded && typeof applyViewMode === "function") applyViewMode();
  if (typeof scheduleConversationBottomStick === "function") scheduleConversationBottomStick();
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
  state.directoryPluginContextActive = false;
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

async function runPluginTopicAction(pluginId, actionId) {
  const resolved = pluginTopicActionById(pluginId, actionId);
  if (!resolved) return;
  const { def, action } = resolved;
  const entry = action.entry && typeof action.entry === "object" ? action.entry : {};
  const type = String(entry.type || action.type || "").trim();
  const route = String(entry.pluginRoute || action.pluginRoute || action.route || action.id || "").trim();
  recordPluginTopicUsage(def.id, action.id);
  if (type === "directory_route") {
    if (route === "topics" || route === "new_topic") {
      await openBuiltInDirectoryTopicList();
      if (route === "new_topic" && typeof showPushToast === "function") showPushToast("\u5df2\u6253\u5f00\u6587\u4ef6\u8bdd\u9898\u5217\u8868\uff0c\u53ef\u9009\u62e9\u76ee\u5f55\u540e\u65b0\u5efa\u8bdd\u9898\u3002", "info");
      return;
    }
    await openBuiltInDirectoryPlugin();
    return;
  }
  if (type === "plugin_topic" || type === "open_topic" || type === "start_chat_with_context") {
    await openPluginTopicChat(def.id);
    return;
  }
  if (type === "plugin_delivery" || type === "open_directory") {
    await openPluginTopicDelivery(def.id);
    return;
  }
  await openPluginTopicApp(def.id, { recordUsage: false, action });
}

function pluginTopicInstruction(def) {
  if (!def?.id) return "";
  return [
    `This is the Hermes Mobile plugin-bound topic for ${def.label}.`,
    `Use the ${def.toolset || def.id} plugin MCP as the primary structured data source only if that toolset is actually available in this workspace.`,
    "Use the plugin file directory only for cleaned user-facing outputs and supporting context; do not mirror private plugin databases into the topic.",
  ].join(" ");
}

function clearPluginAppSortHold(drag) {
  if (!drag?.holdTimer) return;
  window.clearTimeout(drag.holdTimer);
  drag.holdTimer = null;
}

function markPluginAppSortMoved(card) {
  card.dataset.pluginAppDragMoved = "1";
  window.setTimeout(() => {
    if (card.dataset.pluginAppDragMoved === "1") card.dataset.pluginAppDragMoved = "";
  }, 0);
}

function cancelPluginAppSortDrag(event = null) {
  const drag = pluginAppSortDrag;
  if (!drag) return;
  pluginAppSortDrag = null;
  clearPluginAppSortHold(drag);
  drag.card.classList.remove("plugin-app-card-dragging");
  drag.strip.classList.remove("plugin-app-strip-sorting");
  if (event?.pointerId === drag.pointerId) {
    try {
      drag.card.releasePointerCapture?.(event.pointerId);
    } catch (_) {}
  }
}

function startPluginAppSortDrag(drag) {
  if (!drag || pluginAppSortDrag !== drag || drag.dragging) return;
  clearPluginAppSortHold(drag);
  drag.dragging = true;
  drag.card.classList.add("plugin-app-card-dragging");
  drag.strip.classList.add("plugin-app-strip-sorting");
  try {
    drag.card.setPointerCapture?.(drag.pointerId);
  } catch (_) {}
}

function maybeScrollPluginAppStripDuringSort(strip, clientX) {
  if (!strip || strip.scrollWidth <= strip.clientWidth) return;
  const rect = strip.getBoundingClientRect();
  const edge = Math.min(56, rect.width * 0.2);
  const step = 18;
  if (clientX < rect.left + edge) {
    strip.scrollLeft = Math.max(0, strip.scrollLeft - step);
  } else if (clientX > rect.right - edge) {
    strip.scrollLeft = Math.min(strip.scrollWidth - strip.clientWidth, strip.scrollLeft + step);
  }
}

function movePluginAppSortCard(drag, clientX, clientY) {
  maybeScrollPluginAppStripDuringSort(drag.strip, clientX);
  const target = document.elementFromPoint(clientX, clientY)?.closest?.("[data-plugin-topic-sort-id]");
  if (target && target !== drag.card && target.closest(".plugin-app-strip") === drag.strip) {
    const rect = target.getBoundingClientRect();
    const before = clientX < rect.left + rect.width / 2;
    drag.strip.insertBefore(drag.card, before ? target : target.nextSibling);
    persistPluginAppOrderFromStrip(drag.strip);
  }
}

function handlePluginAppSortPointerMove(event) {
  const drag = pluginAppSortDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (!drag.dragging) {
    if (Math.abs(dx) < PLUGIN_APP_REORDER_CANCEL_PX && Math.abs(dy) < PLUGIN_APP_REORDER_CANCEL_PX) return;
    cancelPluginAppSortDrag(event);
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  movePluginAppSortCard(drag, event.clientX, event.clientY);
}

function finishPluginAppSortPointer(event) {
  const drag = pluginAppSortDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  pluginAppSortDrag = null;
  clearPluginAppSortHold(drag);
  try {
    drag.card.releasePointerCapture?.(event.pointerId);
  } catch (_) {}
  drag.card.classList.remove("plugin-app-card-dragging");
  drag.strip.classList.remove("plugin-app-strip-sorting");
  if (drag.dragging) {
    event.preventDefault?.();
    event.stopPropagation?.();
    persistPluginAppOrderFromStrip(drag.strip);
    markPluginAppSortMoved(drag.card);
  }
}

function wirePluginAppSortDocumentEvents(root) {
  if (pluginAppSortGlobalBound) return;
  const doc = root?.nodeType === 9 ? root : root?.ownerDocument || document;
  pluginAppSortGlobalBound = true;
  doc.addEventListener("pointermove", handlePluginAppSortPointerMove, { passive: false, capture: true });
  doc.addEventListener("pointerup", finishPluginAppSortPointer, { capture: true });
  doc.addEventListener("pointercancel", finishPluginAppSortPointer, { capture: true });
}

function wirePluginAppManualSorting(root) {
  wirePluginAppSortDocumentEvents(root);
  root?.querySelectorAll?.(".plugin-app-strip [data-plugin-topic-sort-id]").forEach((card) => {
    if (card.dataset.pluginAppSortBound) return;
    if (pluginAppCardHasActionMenu(card)) return;
    card.dataset.pluginAppSortBound = "1";
    card.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const strip = card.closest(".plugin-app-strip");
      if (!strip) return;
      cancelPluginAppSortDrag();
      pluginAppSortDrag = {
        card,
        strip,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
      };
      const drag = pluginAppSortDrag;
      drag.holdTimer = window.setTimeout(() => startPluginAppSortDrag(drag), PLUGIN_APP_REORDER_HOLD_MS);
    });
    card.addEventListener("contextmenu", (event) => {
      if (pluginAppSortDrag?.card === card || card.dataset.pluginAppDragMoved === "1") event.preventDefault();
    });
  });
}

function wirePluginAppStripScrollGuard(root) {
  root?.querySelectorAll?.(".plugin-app-strip").forEach((strip) => {
    if (strip.dataset.pluginAppScrollGuardBound === "1") return;
    strip.dataset.pluginAppScrollGuardBound = "1";
    let startX = 0;
    let startY = 0;
    let activeCard = null;
    const markScrolled = () => {
      if (!activeCard) return;
      const card = activeCard;
      card.dataset.pluginAppDragMoved = "1";
      window.setTimeout(() => {
        if (card.dataset.pluginAppDragMoved === "1") card.dataset.pluginAppDragMoved = "";
      }, 180);
    };
    const pointFromEvent = (event) => {
      const touch = event?.touches?.[0] || event?.changedTouches?.[0];
      if (touch) return { x: touch.clientX, y: touch.clientY };
      if (typeof event?.clientX === "number" && typeof event?.clientY === "number") return { x: event.clientX, y: event.clientY };
      return null;
    };
    const begin = (event) => {
      const point = pointFromEvent(event);
      if (!point) return;
      startX = point.x;
      startY = point.y;
      activeCard = event.target?.closest?.(".plugin-app-card") || null;
    };
    const move = (event) => {
      if (!activeCard) return;
      const point = pointFromEvent(event);
      if (!point) return;
      const dx = point.x - startX;
      const dy = point.y - startY;
      if (Math.abs(dx) >= PLUGIN_APP_REORDER_CANCEL_PX && Math.abs(dx) > Math.abs(dy) * 1.15) markScrolled();
    };
    const end = () => {
      activeCard = null;
    };
    strip.addEventListener("pointerdown", begin, { passive: true });
    strip.addEventListener("pointermove", move, { passive: true });
    strip.addEventListener("pointerup", end, { passive: true });
    strip.addEventListener("pointercancel", end, { passive: true });
    strip.addEventListener("touchstart", begin, { passive: true });
    strip.addEventListener("touchmove", move, { passive: true });
    strip.addEventListener("touchend", end, { passive: true });
    strip.addEventListener("touchcancel", end, { passive: true });
  });
}

function closePluginActionMenus(root = document) {
  pluginActionMenuSwipe = null;
  root?.querySelectorAll?.(".capability-action-menu:not([hidden])").forEach((menu) => {
    menu.hidden = true;
    menu.closest(".capability-plugin-cell")?.classList.remove("menu-open");
  });
  root?.querySelectorAll?.(".plugin-app-card.menu-open").forEach((button) => {
    button.classList.remove("menu-open");
  });
  root?.querySelectorAll?.(".capability-menu-open").forEach((scope) => {
    scope.classList.remove("capability-menu-open");
  });
}

function pluginActionMenuIsOpen(root = document) {
  return Boolean(root?.querySelector?.(".capability-action-menu:not([hidden])"));
}

function pluginActionMenuDismissPoint(event) {
  const touch = event?.touches?.[0] || event?.changedTouches?.[0];
  if (touch) return { x: touch.clientX, y: touch.clientY };
  if (typeof event?.clientX === "number" && typeof event?.clientY === "number") {
    return { x: event.clientX, y: event.clientY };
  }
  return null;
}

function targetInsidePluginActionMenu(target) {
  return Boolean(target?.closest?.(".capability-plugin-cell.menu-open, .plugin-app-card.menu-open, .capability-action-menu:not([hidden])"));
}

function wirePluginActionMenuSwipeDismiss(menu) {
  if (!menu || menu.dataset.pluginActionMenuSwipeDismissBound === "1") return;
  menu.dataset.pluginActionMenuSwipeDismissBound = "1";
  let startPoint = null;
  let pointerStartPoint = null;
  menu.addEventListener("touchstart", (touchEvent) => {
    if (touchEvent.touches?.length > 1) {
      startPoint = null;
      return;
    }
    startPoint = pluginActionMenuDismissPoint(touchEvent);
  }, { passive: true });
  menu.addEventListener("touchmove", (touchEvent) => {
    if (!startPoint) return;
    const point = pluginActionMenuDismissPoint(touchEvent);
    if (!point) return;
    const dx = point.x - startPoint.x;
    const dy = point.y - startPoint.y;
    if (dx >= 48 && Math.abs(dy) <= 40) {
      closePluginActionMenus(document);
    }
  }, { passive: true });
  const clear = () => {
    startPoint = null;
  };
  menu.addEventListener("touchend", clear, { passive: true });
  menu.addEventListener("touchcancel", clear, { passive: true });
  menu.addEventListener("pointerdown", (pointerEvent) => {
    if (pointerEvent.pointerType === "mouse" && pointerEvent.button !== 0) return;
    pointerStartPoint = pluginActionMenuDismissPoint(pointerEvent);
  });
  menu.addEventListener("pointermove", (pointerEvent) => {
    if (!pointerStartPoint) return;
    const point = pluginActionMenuDismissPoint(pointerEvent);
    if (!point) return;
    const dx = point.x - pointerStartPoint.x;
    const dy = point.y - pointerStartPoint.y;
    if (dx >= 48 && Math.abs(dy) <= 40) {
      closePluginActionMenus(document);
    }
  });
  const clearPointer = () => {
    pointerStartPoint = null;
  };
  menu.addEventListener("pointerup", clearPointer);
  menu.addEventListener("pointercancel", clearPointer);
}

function pluginActionMenuForButton(button) {
  if (button?.dataset?.pluginDrawerQuickActions !== undefined) {
    const strip = button.closest?.(".plugin-app-strip");
    return {
      host: button,
      scope: strip?.closest(".topic-plugin-dock") || strip?.closest(".plugin-app-launcher") || strip,
      menu: strip?.querySelector?.("[data-plugin-drawer-action-menu]") || null,
    };
  }
  const pluginId = pluginTopicId(button?.dataset?.pluginTopicOpenApp || button?.dataset?.pluginTopicSortId || "");
  const cell = button?.closest?.(".capability-plugin-cell");
  if (cell) {
    return {
      host: cell,
      scope: cell.closest(".capability-entry-hub") || cell,
      menu: cell.querySelector(".capability-action-menu"),
    };
  }
  const strip = button?.closest?.(".plugin-app-strip");
  if (!strip || !pluginId) return { host: null, scope: null, menu: null };
  const menus = [...strip.querySelectorAll(".capability-action-menu")];
  const menu = menus.find((item) => pluginTopicId(item.dataset.pluginTopicActionMenu || "") === pluginId) || null;
  return {
    host: button,
    scope: strip.closest(".topic-plugin-dock") || strip.closest(".plugin-app-launcher") || strip,
    menu,
  };
}

function pluginAppCardHasActionMenu(card) {
  return Boolean(pluginActionMenuForButton(card).menu);
}

function pluginActionMenuPluginIdForButton(button) {
  return pluginTopicId(button?.dataset?.pluginTopicOpenApp || button?.dataset?.pluginTopicSortId || "");
}

function refreshPluginActionMenuManifestForButton(button) {
  if (button?.dataset?.pluginDrawerQuickActions !== undefined) {
    ensurePluginTopicActionManifestsLoaded(orderedPluginAppDefs(availablePluginTopicDefs()));
    return;
  }
  const pluginId = pluginActionMenuPluginIdForButton(button);
  const def = pluginTopicDefById(pluginId);
  if (!def || def.builtinKind || def.id === "codex-mobile") return;
  refreshPluginTopicActionManifest(def)
    .then((loaded) => {
      if (loaded && !pluginActionMenuIsOpen(document)) schedulePluginTopicActionProjectionRefresh();
    })
    .catch(() => {});
}

function openPluginActionMenu(button, event = null) {
  const { host, scope, menu } = pluginActionMenuForButton(button);
  if (!host || !menu) return;
  event?.preventDefault?.();
  event?.stopPropagation?.();
  closePluginActionMenus(scope || document);
  menu.hidden = false;
  wirePluginActionMenuSwipeDismiss(menu);
  host.classList.add("menu-open");
  scope?.classList?.add("capability-menu-open");
  refreshPluginActionMenuManifestForButton(button);
  if (button) {
    button.dataset.pluginActionMenuOpened = "1";
    window.setTimeout(() => {
      if (button.dataset.pluginActionMenuOpened === "1") button.dataset.pluginActionMenuOpened = "";
    }, 1200);
  }
  if (!pluginActionMenuCloseBound) {
    pluginActionMenuCloseBound = true;
    document.addEventListener("pointerdown", (pointerEvent) => {
      if (!pluginActionMenuIsOpen(document)) return;
      if (targetInsidePluginActionMenu(pointerEvent.target)) return;
      closePluginActionMenus(document);
    }, { capture: true });
    document.addEventListener("click", (clickEvent) => {
      if (targetInsidePluginActionMenu(clickEvent.target)) return;
      closePluginActionMenus(document);
    }, { capture: true });
    document.addEventListener("touchstart", (touchEvent) => {
      if (!pluginActionMenuIsOpen(document) || touchEvent.touches?.length > 1) {
        pluginActionMenuSwipe = null;
        return;
      }
      if (!targetInsidePluginActionMenu(touchEvent.target)) {
        closePluginActionMenus(document);
        return;
      }
      const point = pluginActionMenuDismissPoint(touchEvent);
      pluginActionMenuSwipe = point ? { x: point.x, y: point.y } : null;
    }, { capture: true, passive: true });
    document.addEventListener("touchmove", (touchEvent) => {
      if (!pluginActionMenuSwipe || !pluginActionMenuIsOpen(document)) return;
      const point = pluginActionMenuDismissPoint(touchEvent);
      if (!point) return;
      const dx = point.x - pluginActionMenuSwipe.x;
      const dy = point.y - pluginActionMenuSwipe.y;
      if (dx >= 48 && Math.abs(dy) <= 40) {
        closePluginActionMenus(document);
      }
    }, { capture: true, passive: true });
    document.addEventListener("touchend", () => {
      pluginActionMenuSwipe = null;
    }, { capture: true, passive: true });
    document.addEventListener("touchcancel", () => {
      pluginActionMenuSwipe = null;
    }, { capture: true, passive: true });
    document.addEventListener("keydown", (keyEvent) => {
      if (keyEvent.key === "Escape") closePluginActionMenus(document);
    });
  }
}

function wireCapabilityPluginMenus(root) {
  root?.querySelectorAll?.(".capability-plugin-icon-button, .plugin-app-card[data-plugin-topic-open-app], .plugin-app-card[data-plugin-drawer-quick-actions]").forEach((button) => {
    if (button.dataset.capabilityMenuBound) return;
    if (!pluginActionMenuForButton(button).menu) return;
    button.dataset.capabilityMenuBound = "1";
    let timer = null;
    let startPoint = null;
    const clearTimer = () => {
      if (!timer) return;
      window.clearTimeout(timer);
      timer = null;
    };
    const pointFromEvent = (event) => {
      const touch = event?.touches?.[0] || event?.changedTouches?.[0];
      if (touch) return { x: touch.clientX, y: touch.clientY };
      if (typeof event?.clientX === "number" && typeof event?.clientY === "number") return { x: event.clientX, y: event.clientY };
      const box = button.getBoundingClientRect();
      return { x: box.left + (box.width / 2), y: box.top + (box.height / 2) };
    };
    const armLongPress = (event) => {
      clearTimer();
      startPoint = pointFromEvent(event);
      timer = window.setTimeout(() => {
        timer = null;
        openPluginActionMenu(button);
      }, PLUGIN_APP_REORDER_HOLD_MS);
    };
    const clearOnMove = (event) => {
      if (!timer || !startPoint) return;
      const point = pointFromEvent(event);
      const dx = point.x - startPoint.x;
      const dy = point.y - startPoint.y;
      if (Math.abs(dx) >= PLUGIN_APP_REORDER_CANCEL_PX || Math.abs(dy) >= PLUGIN_APP_REORDER_CANCEL_PX) clearTimer();
    };
    button.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      armLongPress(event);
    });
    button.addEventListener("touchstart", (event) => {
      if (event.touches && event.touches.length > 1) return;
      armLongPress(event);
    }, { passive: true });
    button.addEventListener("touchmove", clearOnMove, { passive: true });
    button.addEventListener("pointerup", clearTimer);
    button.addEventListener("pointercancel", clearTimer);
    button.addEventListener("pointerleave", clearTimer);
    button.addEventListener("touchend", clearTimer);
    button.addEventListener("touchcancel", clearTimer);
    button.addEventListener("contextmenu", (event) => openPluginActionMenu(button, event));
  });
}

function wirePluginTopicCards(root) {
  root?.querySelectorAll?.("[data-plugin-drawer-quick-actions]").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (button.dataset.pluginAppDragMoved === "1") {
        event.preventDefault();
        button.dataset.pluginAppDragMoved = "";
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      openPluginActionMenu(button, event);
    });
  });
  root?.querySelectorAll?.("[data-plugin-topic-open-app]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.dataset.pluginActionMenuOpened === "1") {
        button.dataset.pluginActionMenuOpened = "";
        return;
      }
      if (button.dataset.pluginAppDragMoved === "1") {
        button.dataset.pluginAppDragMoved = "";
        return;
      }
      closePluginActionMenus(document);
      if (button.closest?.(".topic-plugin-dock") && typeof setGlobalPluginDockExpanded === "function") {
        setGlobalPluginDockExpanded(false, { persist: false });
      }
      openPluginTopicApp(button.dataset.pluginTopicOpenApp).catch(showError);
    });
  });
  root?.querySelectorAll?.("[data-plugin-topic-action-plugin][data-plugin-topic-action-id]").forEach((button) => {
    button.addEventListener("click", () => {
      closePluginActionMenus(root);
      if (button.closest?.(".topic-plugin-dock") && typeof setGlobalPluginDockExpanded === "function") {
        setGlobalPluginDockExpanded(false, { persist: false });
      }
      runPluginTopicAction(button.dataset.pluginTopicActionPlugin, button.dataset.pluginTopicActionId).catch(showError);
    });
  });
  root?.querySelectorAll?.("[data-plugin-topic-move]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof cancelPluginAppSortDrag === "function") cancelPluginAppSortDrag();
      if (typeof resetGlobalPluginDockGesture === "function") resetGlobalPluginDockGesture();
      closePluginActionMenus(document);
      movePluginAppOrder(button.dataset.pluginTopicMove, button.dataset.pluginTopicMoveDir || "up");
    });
  });
  root?.querySelectorAll?.("[data-plugin-bottom-tab-toggle]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const pluginId = button.dataset.pluginBottomTabToggle || "";
      const pinned = button.dataset.pluginBottomTabPinned === "1";
      const ok = setPluginBottomTabPinned(pluginId, !pinned);
      closePluginActionMenus(document);
      if (typeof showPushToast === "function") {
        if (ok) showPushToast(pinned ? "\u5df2\u4ece\u5e95\u90e8\u79fb\u9664" : "\u5df2\u56fa\u5b9a\u5230\u5e95\u90e8", "success");
        else showPushToast("\u5e95\u90e8\u6807\u7b7e\u5df2\u6ee1", "warning");
      }
    });
  });
  root?.querySelectorAll?.(".plugin-topic-launcher [data-plugin-topic-toggle]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const pluginId = button.dataset.pluginTopicToggle || "";
      if (!pluginId) return;
      const card = button.closest?.("[data-plugin-topic-card]");
      const expanded = Boolean(card?.classList.contains("collapsed"));
      setPluginTopicExpanded(pluginId, expanded);
      card?.classList.toggle("collapsed", !expanded);
      button.setAttribute("aria-expanded", expanded ? "true" : "false");
    });
  });
  root?.querySelectorAll?.("[data-plugin-topic-open-topic]").forEach((button) => {
    button.addEventListener("click", () => openPluginTopicChat(button.dataset.pluginTopicOpenTopic).catch(showError));
  });
  root?.querySelectorAll?.(".plugin-topic-launcher [data-plugin-claimed-topic-open]").forEach((button) => {
    button.addEventListener("click", () => {
      openPluginClaimedDirectoryTopic(button.dataset.pluginClaimedTopicPlugin, button.dataset.pluginClaimedTopicOpen);
    });
  });
  root?.querySelectorAll?.("[data-plugin-topic-open-delivery]").forEach((button) => {
    button.addEventListener("click", () => openPluginTopicDelivery(button.dataset.pluginTopicOpenDelivery).catch(showError));
  });
  wireCapabilityPluginMenus(root);
  wirePluginAppStripScrollGuard(root);
  wirePluginAppManualSorting(root);
}
