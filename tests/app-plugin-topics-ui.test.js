"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const pluginTopicsUi = fs.readFileSync(path.join(repoRoot, "public", "app-plugin-topics-ui.js"), "utf8");
const directoryTopicsUi = fs.readFileSync(path.join(repoRoot, "public", "app-directory-topics-ui.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");

function functionBody(source, name) {
  const match = source.match(new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `Missing function ${name}`);
  return match[1];
}

const recordUsageBody = functionBody(pluginTopicsUi, "recordPluginTopicUsage");
const quickActionsBody = functionBody(pluginTopicsUi, "capabilityHubQuickActions");
const quickActionRenderBody = functionBody(pluginTopicsUi, "renderCapabilityQuickAction");
const entryHubBody = functionBody(pluginTopicsUi, "renderCapabilityEntryHub");
const openAppBody = functionBody(pluginTopicsUi, "openPluginTopicApp");
const runActionBody = functionBody(pluginTopicsUi, "runPluginTopicAction");

assert.match(pluginTopicsUi, /const CAPABILITY_QUICK_ACTION_LIMIT = 9;/);
assert.match(pluginTopicsUi, /const CAPABILITY_PLUGIN_APP_ACTION_ID = "__open_app";/);
assert.match(pluginTopicsUi, /const PLUGIN_TOPIC_USAGE_API_PATH = "\/api\/plugin-topic-usage";/);
assert.match(pluginTopicsUi, /const PLUGIN_TOPIC_USAGE_LOAD_TTL_MS = 30000;/);
assert.match(pluginTopicsUi, /function pluginTopicAppQuickAction/);
assert.match(pluginTopicsUi, /function pluginTopicActionUsageKey/);
assert.match(pluginTopicsUi, /function pluginTopicUsageRecentlyLoaded/);
assert.match(pluginTopicsUi, /function loadPluginTopicUsageFromServer/);
assert.match(pluginTopicsUi, /function schedulePluginTopicUsageSync/);
assert.match(pluginTopicsUi, /function ensurePluginTopicUsageLoaded/);
assert.match(pluginTopicsUi, /const pluginTopicUsageMemoryCacheByWorkspace = new Map\(\);/);
assert.match(pluginTopicsUi, /function pluginTopicUsageStorageKey\(workspaceId = pluginTopicUsageWorkspaceId\(\)\)/);
assert.match(pluginTopicsUi, /\$\{PLUGIN_TOPIC_USAGE_STORAGE_KEY\}:\$\{id\}/);
assert.match(pluginTopicsUi, /localStorage\.getItem\(storageKey\)/);
assert.match(pluginTopicsUi, /localStorage\.setItem\(pluginTopicUsageStorageKey\(workspaceId\), JSON\.stringify\(pluginTopicUsageMemoryCache\)\)/);
assert.match(pluginTopicsUi, /function refreshPluginTopicUsageRoot\(options = \{\}\)/);
assert.match(pluginTopicsUi, /const restoreScrollTop = options\.revealQuickActions \? 0 : \(\$\("conversation"\)\?\.scrollTop \|\| 0\);/);
assert.match(recordUsageBody, /usage\.actions = actions;/);
assert.match(recordUsageBody, /usage\.plugins = plugins;/);
assert.match(recordUsageBody, /refreshPluginTopicUsageRoot\(\{ revealQuickActions: true \}\);/);
assert.match(recordUsageBody, /schedulePluginTopicUsageSync\(usage\);/);
assert.match(pluginTopicsUi, /api\(`\$\{PLUGIN_TOPIC_USAGE_API_PATH\}\?\$\{params\.toString\(\)\}`/);
assert.match(pluginTopicsUi, /method: "PATCH"/);
assert.match(pluginTopicsUi, /workspaceId: pending\.workspaceId, usage: pending\.usage/);
assert.match(openAppBody, /if \(options\.recordUsage !== false\) recordPluginTopicUsage\(def\.id\);/);
assert.doesNotMatch(openAppBody, /action\.id/);
assert.match(runActionBody, /recordPluginTopicUsage\(def\.id, action\.id\);/);
assert.match(runActionBody, /openPluginTopicApp\(def\.id, \{ recordUsage: false \}\);/);

assert.doesNotMatch(quickActionsBody, /preferred/);
assert.match(quickActionsBody, /const pluginEntry = pluginTopicUsageEntry\(usage, def\.id\);/);
assert.match(quickActionsBody, /action: pluginTopicAppQuickAction\(def\),/);
assert.match(quickActionsBody, /const count = Math\.max\(0, Number\(entry\.count\) \|\| 0\);/);
assert.match(quickActionsBody, /if \(!count\) return;/);
assert.match(quickActionsBody, /b\.count - a\.count/);
assert.match(quickActionsBody, /b\.lastUsedAt - a\.lastUsedAt/);
assert.match(entryHubBody, /if \(!quickActions\.length\) return "";/);
assert.match(entryHubBody, /ensurePluginTopicUsageLoaded\(\);/);
assert.match(entryHubBody, /data-capability-quick-columns="3"/);
assert.match(quickActionRenderBody, /action\?\.type === "open_plugin_app"/);
assert.match(quickActionRenderBody, /data-plugin-topic-open-app/);
assert.doesNotMatch(quickActionRenderBody, /capability-action-source/);

assert.match(directoryTopicsUi, /plugin-topic-app-icon directory directory-topic-folder-icon/);
assert.doesNotMatch(directoryTopicsUi, /directory-topic-association-label/);
assert.doesNotMatch(directoryTopicsUi, /directory-topic-subtitle/);
assert.doesNotMatch(directoryTopicsUi, /directory-topic-chip-badge/);

assert.match(stylesCss, /\.capability-quick-grid \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
assert.match(stylesCss, /\.capability-action-source \{[\s\S]*?display: none;/);
assert.match(stylesCss, /--topic-plugin-dock-height: 78px;/);
assert.match(stylesCss, /\.app\.task-list-mode \.topbar \{[\s\S]*?display: none !important;/);
assert.match(stylesCss, /--mobile-bottom-nav-visual-drop: 10px;/);
assert.match(stylesCss, /--mobile-bottom-nav-bottom: var\(--mobile-bottom-nav-bottom-runtime, var\(--mobile-bottom-nav-comfort-inset\)\);/);
assert.match(stylesCss, /\.bottom-nav \{[\s\S]*?bottom: var\(--mobile-bottom-nav-bottom\);/);
assert.match(stylesCss, /--topic-plugin-dock-bottom: var\(--topic-plugin-dock-bottom-runtime, var\(--mobile-bottom-nav-offset-height\)\);/);
assert.match(stylesCss, /\.app\.task-list-mode \.conversation > \.directory-topic-launcher:first-child,[\s\S]*?margin-top: max\(16px, calc\(env\(safe-area-inset-top\) \+ 4px\)\);/);
assert.match(stylesCss, /\.app\.task-list-mode \.conversation > \.capability-entry-hub:first-child/);
assert.match(stylesCss, /\.app\.task-list-mode \.conversation \{[\s\S]*?padding-bottom: var\(--topic-plugin-dock-reserved-height\);/);
assert.match(stylesCss, /\.app\.task-list-mode \{[\s\S]*?padding-bottom: 0;/);

function createPluginTopicHarness(options = {}) {
  const storage = new Map();
  const timers = [];
  const renderCalls = [];
  const failLocalStorageWrites = options.failLocalStorageWrites === true;
  const sandbox = {
    console,
    URLSearchParams,
    Date,
    state: {
      selectedWorkspaceId: "owner",
      auth: { workspaceId: "owner" },
      key: "test-key",
      viewMode: "tasks",
      currentTaskGroupId: "",
    },
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        if (failLocalStorageWrites) throw new Error("local_storage_write_blocked");
        storage.set(key, String(value));
      },
      removeItem(key) {
        storage.delete(key);
      },
    },
    window: {
      setTimeout(fn, delayMs = 0) {
        timers.push({ fn, delayMs: Number(delayMs) || 0 });
        return timers.length;
      },
      clearTimeout() {},
    },
    $: (id) => (id === "conversation" ? { scrollTop: 72 } : null),
    renderCurrentThread: (options) => renderCalls.push(options || {}),
    wardrobePluginNavigationAvailable: () => true,
    EMBEDDED_PLUGIN_DEFS: { finance: {}, email: {}, health: {}, note: {} },
    embeddedPluginNavigationAvailable: () => true,
    escapeHtml: (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch])),
    api: async () => ({ usage: {} }),
  };
  vm.createContext(sandbox);
  vm.runInContext(`${pluginTopicsUi}
globalThis.__pluginTopicHarness = {
  readUsage: readPluginTopicUsage,
  writeUsage: writePluginTopicUsage,
  recordUsage: recordPluginTopicUsage,
  quickKeys: () => capabilityHubQuickActions(availablePluginTopicDefs()).map(({ def, action }) => def.id + ":" + action.id),
};`, sandbox);
  return {
    ...sandbox.__pluginTopicHarness,
    setWorkspace(workspaceId) {
      sandbox.state.selectedWorkspaceId = workspaceId;
      sandbox.state.auth.workspaceId = workspaceId;
    },
    renderCalls,
    flushRootRefreshTimers() {
      const pending = timers.splice(0, timers.length).filter((item) => item.delayMs === 0);
      pending.forEach((item) => item.fn());
    },
  };
}

{
  const harness = createPluginTopicHarness();
  harness.writeUsage({
    actions: {
      "finance:record": { count: 5, lastUsedAt: 1000 },
      "email:search": { count: 4, lastUsedAt: 900 },
      "note:search": { count: 3, lastUsedAt: 800 },
    },
  });

  assert.equal(harness.quickKeys()[0], "finance:record");
  for (let i = 0; i < 6; i += 1) harness.recordUsage("wardrobe", "style");
  harness.flushRootRefreshTimers();

  assert.equal(harness.quickKeys()[0], "wardrobe:style");
  assert.equal(harness.readUsage().actions["wardrobe:style"].count, 6);
  assert.ok(harness.renderCalls.length >= 1, "usage changes must refresh the root quick-action projection");
  assert.equal(harness.renderCalls.at(-1).restoreScrollTop, 0, "usage promotion must reveal the top quick-action row");

  harness.setWorkspace("weixin_wuping");
  assert.equal(harness.quickKeys().length, 0, "quick actions must not reuse another workspace's cache");
  harness.recordUsage("finance", "record");
  harness.flushRootRefreshTimers();
  assert.equal(harness.quickKeys()[0], "finance:record");

  harness.setWorkspace("owner");
  assert.equal(harness.quickKeys()[0], "wardrobe:style", "owner quick actions must remain isolated from Wuping usage");
}

{
  const harness = createPluginTopicHarness({ failLocalStorageWrites: true });
  for (let i = 0; i < 3; i += 1) harness.recordUsage("wardrobe", "style");
  harness.flushRootRefreshTimers();

  assert.equal(harness.quickKeys()[0], "wardrobe:style");
  assert.equal(harness.readUsage().actions["wardrobe:style"].count, 3);
  assert.ok(harness.renderCalls.length >= 1, "memory usage projection must refresh even when localStorage writes fail");
  assert.equal(harness.renderCalls.at(-1).restoreScrollTop, 0, "memory projection refresh must reveal the top quick-action row");
}

function createDirectoryTopicHarness() {
  const storage = new Map();
  const sandbox = {
    console,
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
    },
    escapeHtml: (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch])),
    formatTime: (value) => String(value || ""),
    taskShortTitle: (group) => group.title || "",
    taskTitle: (group) => group.title || "",
  };
  vm.createContext(sandbox);
  vm.runInContext(`${directoryTopicsUi}
globalThis.__directoryTopicHarness = {
  render: renderDirectoryTopicCards,
  setCollapsed: setDirectoryTopicCollapsed,
};`, sandbox);
  return sandbox.__directoryTopicHarness;
}

function directoryCollection(key, updatedAt) {
  return {
    key,
    label: key,
    updatedAt,
    defaultGroup: { id: `${key}-default`, title: `${key} default`, updatedAt },
    groups: [
      { id: `${key}-default`, title: `${key} default`, updatedAt },
      { id: `${key}-second`, title: `${key} second`, updatedAt },
    ],
  };
}

function directoryCardCollapsed(html, key) {
  return new RegExp(`directory-topic-card collapsed" data-directory-topic-card="${key}"`).test(html);
}

{
  const harness = createDirectoryTopicHarness();
  const collections = [
    directoryCollection("dir-1", "2026-06-08T12:00:00.000Z"),
    directoryCollection("dir-2", "2026-06-08T11:00:00.000Z"),
    directoryCollection("dir-3", "2026-06-08T10:00:00.000Z"),
    directoryCollection("dir-4", "2026-06-08T09:00:00.000Z"),
  ];

  const initial = harness.render(collections);
  assert.equal(directoryCardCollapsed(initial, "dir-1"), false);
  assert.equal(directoryCardCollapsed(initial, "dir-2"), false);
  assert.equal(directoryCardCollapsed(initial, "dir-3"), false);
  assert.equal(directoryCardCollapsed(initial, "dir-4"), true);

  harness.setCollapsed("dir-1", true);
  assert.equal(directoryCardCollapsed(harness.render(collections), "dir-1"), true);

  harness.setCollapsed("dir-4", false);
  assert.equal(directoryCardCollapsed(harness.render(collections), "dir-4"), false);
}

function createPluginContextColdRestoreHarness() {
  const calls = { api: [], renderCurrentThread: [], renderThreads: 0, setComposerEnabled: [] };
  const nodes = {
    app: { classList: { remove() {} } },
    conversation: { innerHTML: "", scrollTop: 33 },
    threadTitle: { textContent: "old" },
    threadMeta: { textContent: "old" },
    interruptRun: { disabled: false },
  };
  const sandbox = {
    console,
    Promise,
    URLSearchParams,
    TASK_MESSAGE_INITIAL_LIMIT: 40,
    state: {
      selectedWorkspaceId: "owner",
      pluginContextNavPluginId: "wardrobe",
      viewMode: "wardrobe",
      currentTaskGroupId: "",
      currentThread: null,
      currentThreadId: "",
      threads: [],
    },
    localStorage: { setItem() {}, getItem() { return null; } },
    $: (id) => nodes[id] || null,
    clearQuotedReply() {},
    closeBottomPluginMenu() {},
    normalizeMobileViewportAfterViewChange() {},
    applyViewMode() {},
    renderThreads() { calls.renderThreads += 1; },
    updateNavigationControls() {},
    updateTopicPluginDockChrome() {},
    isTaskListView: () => true,
    api: async (path, options) => {
      calls.api.push({ path, body: JSON.parse(options.body || "{}") });
      return {
        thread: { id: "task-root", workspaceId: "owner", singleWindow: true, messages: [] },
        caseTopicThreads: [],
      };
    },
    mergeCurrentThread: (thread) => thread,
    summarizeThread: (thread) => ({ id: thread.id, workspaceId: thread.workspaceId }),
    rememberTaskListThread(thread) {
      sandbox.state.taskListThread = thread;
      sandbox.state.taskListThreadId = thread.id;
    },
    renderCurrentThread(options) { calls.renderCurrentThread.push(options); },
    setComposerEnabled(value) { calls.setComposerEnabled.push(value); },
    showError: (err) => { throw err; },
    escapeHtml: (value) => String(value ?? ""),
  };
  vm.createContext(sandbox);
  vm.runInContext(`${pluginTopicsUi}
globalThis.__pluginContextColdRestoreHarness = {
  exitPluginContextToTopicHome,
  refreshPluginContextTopicHomeAfterColdRestore,
};`, sandbox);
  return { sandbox, calls, nodes, ...sandbox.__pluginContextColdRestoreHarness };
}

(async () => {
  const harness = createPluginContextColdRestoreHarness();
  harness.exitPluginContextToTopicHome();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.sandbox.state.viewMode, "tasks");
  assert.equal(harness.sandbox.state.pluginContextNavPluginId, "");
  assert.equal(harness.calls.api.length, 1, "cold plugin-context exit must fetch the topic root thread");
  assert.deepEqual(harness.calls.api[0].body, {
    workspaceId: "owner",
    groupChat: false,
    weixinChat: false,
    messageMode: "tasks",
    taskGroupId: "",
    messageLimit: 40,
  });
  assert.equal(harness.sandbox.state.currentThreadId, "task-root");
  assert.equal(harness.sandbox.state.taskListThreadId, "task-root");
  assert.equal(harness.calls.renderCurrentThread.at(-1).stickToBottom, false);
  assert.equal(harness.calls.renderCurrentThread.at(-1).restoreScrollTop, 0);
  assert.deepEqual(harness.calls.setComposerEnabled, [true]);
  assert.notEqual(harness.nodes.conversation.innerHTML, `<div class="empty-state">Create a thread to start a zero-context Home AI task.</div>`);

  console.log("app plugin topics UI tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
