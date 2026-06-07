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
assert.match(pluginTopicsUi, /let pluginTopicUsageMemoryCache = normalizePluginTopicUsage\(\{\}\);/);
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
assert.match(stylesCss, /--mobile-bottom-nav-bottom: var\(--mobile-bottom-nav-bottom-runtime, 0px\);/);
assert.match(stylesCss, /\.bottom-nav \{[\s\S]*?bottom: var\(--mobile-bottom-nav-bottom\);/);
assert.match(stylesCss, /--topic-plugin-dock-bottom: var\(--topic-plugin-dock-bottom-runtime, var\(--mobile-bottom-nav-offset-height\)\);/);
assert.match(stylesCss, /\.app\.task-list-mode \.conversation > \.directory-topic-launcher:first-child,[\s\S]*?margin-top: max\(16px, calc\(env\(safe-area-inset-top\) \+ 4px\)\);/);

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

console.log("app plugin topics UI tests passed");
