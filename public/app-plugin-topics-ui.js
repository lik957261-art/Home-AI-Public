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
    sourceBadge: "\u8863",
    toolset: "wardrobe",
    deliveryHints: ["wardrobe", "\u8863\u6a71", "\u642d\u914d", "\u7a7f\u642d"],
    quickActions: Object.freeze([
      Object.freeze({ id: "style", label: "\u914d\u8863\u670d", type: "open_topic", glyph: "\u8863" }),
      Object.freeze({ id: "today", label: "\u4eca\u65e5\u7a7f\u642d", type: "open_topic", glyph: "\u65e5" }),
      Object.freeze({ id: "add", label: "\u5165\u5e93", type: "open_plugin", glyph: "+" }),
      Object.freeze({ id: "inventory", label: "\u8863\u7269\u76ee\u5f55", type: "open_directory", glyph: "\u76ee" }),
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
    quickActions: Object.freeze([
      Object.freeze({ id: "record", label: "\u8bb0\u4e00\u7b14", type: "open_plugin", glyph: "+" }),
      Object.freeze({ id: "voice", label: "\u4e00\u53e5\u8bdd\u8bb0\u8d26", type: "open_topic", glyph: "\u8bf4" }),
      Object.freeze({ id: "month", label: "\u672c\u6708\u8d26\u5355", type: "open_topic", glyph: "\u6708" }),
      Object.freeze({ id: "budget", label: "\u9884\u7b97\u68c0\u67e5", type: "open_topic", glyph: "\u9884" }),
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
    quickActions: Object.freeze([
      Object.freeze({ id: "reply", label: "\u5f85\u56de\u590d", type: "open_plugin", glyph: "\u56de" }),
      Object.freeze({ id: "search", label: "\u641c\u90ae\u4ef6", type: "open_plugin", glyph: "\u641c" }),
      Object.freeze({ id: "draft", label: "\u5199\u56de\u590d", type: "open_topic", glyph: "\u5199" }),
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
    quickActions: Object.freeze([
      Object.freeze({ id: "record", label: "\u8bb0\u5f55\u5065\u5eb7", type: "open_plugin", glyph: "+" }),
      Object.freeze({ id: "trend", label: "\u8d8b\u52bf", type: "open_plugin", glyph: "\u52bf" }),
      Object.freeze({ id: "advice", label: "\u95ee\u5efa\u8bae", type: "open_topic", glyph: "?" }),
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
    quickActions: Object.freeze([
      Object.freeze({ id: "new", label: "\u8bb0\u4e00\u6761", type: "open_plugin", glyph: "+" }),
      Object.freeze({ id: "search", label: "\u641c\u7b14\u8bb0", type: "open_plugin", glyph: "\u641c" }),
      Object.freeze({ id: "recent", label: "\u6700\u8fd1\u7b14\u8bb0", type: "open_plugin", glyph: "\u8fd1" }),
      Object.freeze({ id: "topic", label: "\u7b14\u8bb0\u8bdd\u9898", type: "open_topic", glyph: "\u8bdd" }),
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
    quickActions: Object.freeze([
      Object.freeze({ id: "recent", label: "\u6700\u8fd1\u76ee\u5f55", type: "open_plugin", glyph: "\u8fd1" }),
      Object.freeze({ id: "topics", label: "\u6587\u4ef6\u8bdd\u9898", type: "open_topic", glyph: "\u8bdd" }),
      Object.freeze({ id: "new-topic", label: "\u65b0\u5efa\u8bdd\u9898", type: "open_topic", glyph: "+" }),
    ]),
  }),
]);
const PLUGIN_TOPIC_USAGE_STORAGE_KEY = "hermesPluginTopicUsage";
const PLUGIN_TOPIC_ORDER_STORAGE_KEY = "hermesPluginTopicOrder";
const PLUGIN_TOPIC_USAGE_API_PATH = "/api/plugin-topic-usage";
const PLUGIN_TOPIC_USAGE_SYNC_DELAY_MS = 450;
const PLUGIN_TOPIC_USAGE_LOAD_TTL_MS = 30000;
const PLUGIN_APP_REORDER_HOLD_MS = 450;
const PLUGIN_APP_REORDER_CANCEL_PX = 10;
const CAPABILITY_QUICK_ACTION_LIMIT = 12;
const CAPABILITY_PLUGIN_APP_ACTION_ID = "__open_app";
let pluginAppSortDrag = null;
let pluginAppSortGlobalBound = false;
let pluginActionMenuCloseBound = false;
let pluginActionMenuSwipe = null;
let pluginTopicUsagePendingSync = null;
let pluginTopicUsageSyncTimer = 0;
const pluginTopicUsageLoadedAtByWorkspace = new Map();
const pluginTopicUsageLoadingWorkspaces = new Map();
const pluginTopicUsageLoadRetryAt = new Map();

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

function pluginTopicUsageWorkspaceId() {
  return String(state.selectedWorkspaceId || state.auth?.workspaceId || "owner").trim() || "owner";
}

function pluginTopicUsageApiReady() {
  return typeof api === "function" && Boolean(state.key || state.auth);
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
  try {
    const raw = localStorage.getItem(PLUGIN_TOPIC_USAGE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return normalizePluginTopicUsage(parsed);
  } catch {
    return normalizePluginTopicUsage({});
  }
}

function writePluginTopicUsage(usage) {
  try {
    localStorage.setItem(PLUGIN_TOPIC_USAGE_STORAGE_KEY, JSON.stringify(normalizePluginTopicUsage(usage)));
  } catch {
    // Best-effort cache only; server persistence is the source of truth.
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

function refreshPluginTopicUsageRoot() {
  if (state.viewMode !== "tasks" || state.currentTaskGroupId) return;
  if (typeof renderCurrentThread !== "function") return;
  const restoreScrollTop = $("conversation")?.scrollTop || 0;
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
  refreshPluginTopicUsageRoot();
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

function pluginTopicQuickActions(def) {
  return Array.isArray(def?.quickActions) ? def.quickActions : [];
}

function pluginTopicActionById(pluginId = "", actionId = "") {
  const def = pluginTopicDefById(pluginId);
  if (!def) return null;
  const id = String(actionId || "").trim();
  const action = pluginTopicQuickActions(def).find((item) => String(item.id || "") === id) || null;
  return action ? { def, action } : null;
}

function capabilityHubQuickActions(defs = []) {
  const usage = readPluginTopicUsage();
  const result = [];
  defs.forEach((def) => {
    const defIndex = pluginTopicDefinitionIndex(def.id);
    const pluginEntry = pluginTopicUsageEntry(usage, def.id);
    const pluginCount = Math.max(0, Number(pluginEntry.count) || 0);
    if (pluginCount) {
      result.push({
        def,
        action: pluginTopicAppQuickAction(def),
        count: pluginCount,
        lastUsedAt: Math.max(0, Number(pluginEntry.lastUsedAt) || 0),
        defIndex,
        actionIndex: pluginTopicQuickActions(def).length + 1,
      });
    }
    pluginTopicQuickActions(def).forEach((action, actionIndex) => {
      const entry = pluginTopicActionUsageEntry(usage, def.id, action.id);
      const count = Math.max(0, Number(entry.count) || 0);
      if (!count) return;
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
      || a.defIndex - b.defIndex
      || a.actionIndex - b.actionIndex
    ))
    .slice(0, CAPABILITY_QUICK_ACTION_LIMIT)
    .map(({ def, action }) => ({ def, action }));
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
  const actions = pluginTopicQuickActions(def);
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
  if (typeof renderCurrentThread === "function") renderCurrentThread({ stickToBottom: false, restoreScrollTop: $("conversation")?.scrollTop || 0 });
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
  const quickActions = capabilityHubQuickActions(defs);
  if (!quickActions.length) return "";
  return `<section class="capability-entry-hub" aria-label="\u80fd\u529b\u5165\u53e3">
    <section class="capability-frequent" aria-label="\u5feb\u6377\u5165\u53e3">
      <div class="capability-quick-grid" data-capability-quick-columns="3">
        ${quickActions.map(({ def, action }) => renderCapabilityQuickAction(def, action)).join("")}
      </div>
    </section>
  </section>`;
}

function renderPluginAppLauncher() {
  const defs = orderedPluginAppDefs(availablePluginTopicDefs());
  if (!defs.length) return "";
  const fillCount = Math.min(Math.max(defs.length, 1), 6);
  return `<section class="plugin-app-launcher" aria-label="\u63d2\u4ef6\u5e94\u7528">
    <div class="plugin-app-strip" role="list" data-plugin-count="${defs.length}" data-plugin-fill-count="${fillCount}">
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
  state.viewMode = "projects";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentTaskGroupId = "";
  state.currentThread = null;
  state.currentThreadId = "";
  if (typeof applyViewMode === "function") applyViewMode();
  if (typeof updateNavigationControls === "function") updateNavigationControls();
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
  const type = String(action.type || "").trim();
  recordPluginTopicUsage(def.id, action.id);
  if (type === "open_topic" || type === "start_chat_with_context" || type === "invoke_mcp_intent") {
    await openPluginTopicChat(def.id);
    return;
  }
  if (type === "open_directory") {
    await openPluginTopicDelivery(def.id);
    return;
  }
  await openPluginTopicApp(def.id, { recordUsage: false });
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
  root?.querySelectorAll?.(".capability-plugin-icon-button, .plugin-app-card[data-plugin-topic-open-app]").forEach((button) => {
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
  root?.querySelectorAll?.("[data-plugin-topic-open-app]").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (button.dataset.pluginActionMenuOpened === "1") {
        event.preventDefault();
        button.dataset.pluginActionMenuOpened = "";
        return;
      }
      if (button.dataset.pluginAppDragMoved === "1") {
        event.preventDefault();
        button.dataset.pluginAppDragMoved = "";
        return;
      }
      openPluginTopicApp(button.dataset.pluginTopicOpenApp).catch(showError);
    });
  });
  root?.querySelectorAll?.("[data-plugin-topic-action-plugin][data-plugin-topic-action-id]").forEach((button) => {
    button.addEventListener("click", () => {
      closePluginActionMenus(root);
      runPluginTopicAction(button.dataset.pluginTopicActionPlugin, button.dataset.pluginTopicActionId).catch(showError);
    });
  });
  root?.querySelectorAll?.("[data-plugin-topic-move]").forEach((button) => {
    button.addEventListener("click", () => {
      closePluginActionMenus(root);
      movePluginAppOrder(button.dataset.pluginTopicMove, button.dataset.pluginTopicMoveDir || "up");
    });
  });
  root?.querySelectorAll?.("[data-plugin-topic-open-topic]").forEach((button) => {
    button.addEventListener("click", () => openPluginTopicChat(button.dataset.pluginTopicOpenTopic).catch(showError));
  });
  root?.querySelectorAll?.("[data-plugin-topic-open-delivery]").forEach((button) => {
    button.addEventListener("click", () => openPluginTopicDelivery(button.dataset.pluginTopicOpenDelivery).catch(showError));
  });
  wireCapabilityPluginMenus(root);
  wirePluginAppManualSorting(root);
}
