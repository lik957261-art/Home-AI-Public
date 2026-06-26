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
const topicCardsBody = functionBody(pluginTopicsUi, "renderPluginTopicCards");
const rowMetaBody = functionBody(pluginTopicsUi, "pluginTopicRowMeta");
const childEntriesBody = functionBody(pluginTopicsUi, "pluginTopicChildEntries");
const switcherBody = functionBody(pluginTopicsUi, "renderPluginTopicSwitcher");
const wireSwitcherBody = functionBody(pluginTopicsUi, "wirePluginTopicSwitcher");
const openAppBody = functionBody(pluginTopicsUi, "openPluginTopicApp");
const runActionBody = functionBody(pluginTopicsUi, "runPluginTopicAction");
const movePluginAppOrderBody = functionBody(pluginTopicsUi, "movePluginAppOrder");

assert.match(pluginTopicsUi, /const CAPABILITY_QUICK_ACTION_LIMIT = 9;/);
assert.match(pluginTopicsUi, /const CAPABILITY_PLUGIN_APP_ACTION_ID = "__open_app";/);
assert.match(pluginTopicsUi, /const PLUGIN_TOPIC_USAGE_API_PATH = "\/api\/plugin-topic-usage";/);
assert.match(pluginTopicsUi, /const PLUGIN_TOPIC_BINDINGS_API_PATH = "\/api\/plugin-topic-bindings";/);
assert.match(pluginTopicsUi, /const PLUGIN_TOPIC_USAGE_LOAD_TTL_MS = 30000;/);
assert.match(pluginTopicsUi, /const PLUGIN_TOPIC_ACTION_MANIFEST_LOAD_TTL_MS = 60000;/);
assert.match(pluginTopicsUi, /const PLUGIN_TOPIC_BINDINGS_LOAD_TTL_MS = 30000;/);
assert.match(pluginTopicsUi, /const GLOBAL_PLUGIN_DOCK_DIRECTION_RATIO = 1\.45;/);
assert.match(pluginTopicsUi, /id: "movie"[\s\S]*?viewMode: "movie"[\s\S]*?label: "\\u5f71\\u9662"[\s\S]*?actions: Object\.freeze\(\[\]\)/);
assert.match(pluginTopicsUi, /if \(id === "movie"\) return "bottomMovieMode";/);
assert.match(pluginTopicsUi, /function pluginTopicAppQuickAction/);
assert.match(pluginTopicsUi, /function pluginTopicCurrentManifest/);
assert.match(pluginTopicsUi, /function pluginTopicManifestActions/);
assert.match(pluginTopicsUi, /function pluginTopicActionSource/);
assert.match(pluginTopicsUi, /function refreshPluginTopicActionManifest/);
assert.match(pluginTopicsUi, /function ensurePluginTopicActionManifestsLoaded/);
assert.match(pluginTopicsUi, /function pluginTopicActionUsageKey/);
assert.match(pluginTopicsUi, /function pluginTopicUsageRecentlyLoaded/);
assert.match(pluginTopicsUi, /function loadPluginTopicUsageFromServer/);
assert.match(pluginTopicsUi, /function schedulePluginTopicUsageSync/);
assert.match(pluginTopicsUi, /function normalizePluginTopicPreferences/);
assert.match(pluginTopicsUi, /function schedulePluginTopicPreferencesSync/);
assert.match(pluginTopicsUi, /function flushPluginTopicPreferencesSync/);
assert.match(pluginTopicsUi, /function applyPluginTopicPreferencesFromServer/);
assert.match(pluginTopicsUi, /body: JSON\.stringify\(\{ workspaceId: pending\.workspaceId, preferences: pending\.preferences \}\)/);
assert.match(pluginTopicsUi, /preferencesUpdatedAt/);
assert.match(pluginTopicsUi, /function ensurePluginTopicUsageLoaded/);
assert.match(pluginTopicsUi, /function ensurePluginTopicBindingsLoaded/);
assert.match(pluginTopicsUi, /function pluginTopicDirectoryClaimForRoute/);
assert.match(pluginTopicsUi, /function pluginTopicFilterDirectoryTopicCollectionsForRoot/);
assert.match(pluginTopicsUi, /function renderPluginTopicSwitcher/);
assert.match(pluginTopicsUi, /function openPluginClaimedDirectoryTopic/);
assert.match(switcherBody, /return "";/);
assert.doesNotMatch(switcherBody, /data-plugin-topic-switcher|plugin-topic-switch-button|plugin-topic-switch-panel/);
assert.match(wireSwitcherBody, /return;/);
assert.match(pluginTopicsUi, /function wirePluginAppStripScrollGuard\(root\)/);
assert.match(pluginTopicsUi, /strip\.addEventListener\("touchmove", move, \{ passive: true \}\)/);
assert.match(pluginTopicsUi, /Math\.abs\(dx\) >= PLUGIN_APP_REORDER_CANCEL_PX && Math\.abs\(dx\) > Math\.abs\(dy\) \* 1\.15/);
assert.match(pluginTopicsUi, /const pluginTopicUsageMemoryCacheByWorkspace = new Map\(\);/);
assert.match(pluginTopicsUi, /function pluginTopicUsageStorageKey\(workspaceId = pluginTopicUsageWorkspaceId\(\)\)/);
assert.match(pluginTopicsUi, /\$\{PLUGIN_TOPIC_USAGE_STORAGE_KEY\}:\$\{id\}/);
assert.match(pluginTopicsUi, /localStorage\.getItem\(storageKey\)/);
assert.match(pluginTopicsUi, /localStorage\.setItem\(pluginTopicUsageStorageKey\(workspaceId\), JSON\.stringify\(pluginTopicUsageMemoryCache\)\)/);
assert.match(pluginTopicsUi, /function normalizePinnedPluginBottomTabIds/);
assert.match(pluginTopicsUi, /pluginOrder: readPluginTopicOrder\(workspaceId\),/);
assert.match(pluginTopicsUi, /function normalizePluginTopicOrder\(ids = \[\]\)/);
assert.match(pluginTopicsUi, /function pluginTopicOrderStorageKey\(workspaceId = pluginTopicUsageWorkspaceId\(\)\)/);
assert.match(pluginTopicsUi, /function wirePinnedPluginBottomTabUnpin\(button, pluginId = ""\)/);
assert.match(pluginTopicsUi, /function openPluginBottomTabMenu\(button, pluginId = "", event = null\)/);
assert.match(pluginTopicsUi, /data-plugin-bottom-tab-reorder/);
assert.match(pluginTopicsUi, /function startPluginBottomTabSortMode\(pluginId = ""\)/);
assert.match(pluginTopicsUi, /function movePinnedPluginBottomTabBefore\(pluginId = "", beforePluginId = "", after = false\)/);
assert.match(pluginTopicsUi, /button\.addEventListener\("contextmenu", \(event\) => openMenu\(event\)\);/);
assert.match(pluginTopicsUi, /const drawerDefs = defs\.filter\(\(def\) => !pluginBottomTabPinned\(def\.id\)\);/);
assert.match(pluginTopicsUi, /data-plugin-count="\$\{drawerDefs\.length\}"/);
assert.match(pluginTopicsUi, /applyPluginTopicPreferencesFromServer\(serverPreferences, workspaceId\);/);
assert.match(pluginTopicsUi, /function refreshPluginTopicUsageRoot\(options = \{\}\)/);
assert.match(pluginTopicsUi, /const restoreScrollTop = options\.revealQuickActions \? 0 : \(\$\("conversation"\)\?\.scrollTop \|\| 0\);/);
assert.match(pluginTopicsUi, /function refreshPluginAppOrderSurfaces\(options = \{\}\)/);
assert.match(pluginTopicsUi, /const force = options\.force === true;/);
assert.match(pluginTopicsUi, /\(\(!force && !dockHadContent\) \|\| typeof renderPluginAppLauncher !== "function" \|\| typeof setTopicPluginDock !== "function"\) return;/);
assert.match(movePluginAppOrderBody, /refreshPluginAppOrderSurfaces\(\);/);
assert.doesNotMatch(movePluginAppOrderBody, /renderCurrentThread/);
assert.match(pluginTopicsUi, /button\.addEventListener\("click", \(event\) => \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?event\.stopPropagation\(\);[\s\S]*?cancelPluginAppSortDrag\(\);[\s\S]*?resetGlobalPluginDockGesture\(\);[\s\S]*?closePluginActionMenus\(document\);[\s\S]*?movePluginAppOrder/);
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
assert.match(runActionBody, /openPluginTopicApp\(def\.id, \{ recordUsage: false, action \}\);/);
assert.match(topicCardsBody, /filter\(\(def\) => !def\.builtinKind && def\.id !== "codex-mobile"\)/);
assert.match(topicCardsBody, /data-plugin-topic-open-topic/);
assert.match(topicCardsBody, /plugin-topic-icon-entry" type="button" data-plugin-topic-open-app/);
assert.doesNotMatch(topicCardsBody, /data-plugin-topic-toggle/);
assert.doesNotMatch(topicCardsBody, /data-plugin-claimed-topic-open/);
assert.match(topicCardsBody, /plugin-topic-list/);
assert.match(topicCardsBody, /plugin-topic-row-chevron-placeholder/);
assert.match(pluginTopicsUi, /function pluginTopicRecentMessageEntries/);
assert.match(pluginTopicsUi, /function pluginTopicMessagePreviewText/);
assert.match(pluginTopicsUi, /function topicReceiptSummaryTitleFromText/);
assert.match(pluginTopicsUi, /function topicReceiptTitleLooksLikeFragment/);
assert.match(pluginTopicsUi, /function topicReceiptSummaryTitleFromGroup/);
assert.match(pluginTopicsUi, /group\?\.lastReceiptTitle/);
assert.ok(
  functionBody(pluginTopicsUi, "topicReceiptSummaryTitleFromGroup").indexOf("group?.lastReceiptTitle")
    < functionBody(pluginTopicsUi, "topicReceiptSummaryTitleFromGroup").indexOf("const messages = Array.isArray"),
  "topic row summaries must prefer persisted receipt metadata over stale cached messages",
);
assert.match(pluginTopicsUi, /function pluginTopicGroupForDef/);
assert.match(pluginTopicsUi, /const group = pluginTopicGroupForDef\(def, options\.thread \|\| state\.currentThread\);/);
assert.match(pluginTopicsUi, /homeai-note-title/);
assert.match(pluginTopicsUi, /homeai-note\\b/);
assert.match(pluginTopicsUi, /const PLUGIN_TOPIC_ROW_SUMMARY_MAX = 64;/);
assert.match(pluginTopicsUi, /function pluginTopicCompactRowSummary/);
assert.match(pluginTopicsUi, /const receiptTitle = topicReceiptSummaryTitleFromMessage\(message, \{ max, allowFirstLine: false \}\);/);
assert.match(pluginTopicsUi, /topicReceiptSummaryTitleFromGroup\(group, \{ max: PLUGIN_TOPIC_ROW_SUMMARY_MAX, allowBodyFallback: false \}\)/);
assert.match(pluginTopicsUi, /pluginTopicRecentMessageEntries\(def, options\.thread \|\| state\.currentThread, 1, \{ max: PLUGIN_TOPIC_ROW_SUMMARY_MAX \}\)/);
assert.match(topicCardsBody, /plugin-topic-separator/);
assert.match(pluginTopicsUi, /String\(message\?\.role \|\| ""\) === "assistant"/);
assert.doesNotMatch(pluginTopicsUi, /message\?\.role \|\| ""\) !== "system"/);
assert.doesNotMatch(pluginTopicsUi, /const user = messages\.find/);
assert.match(childEntriesBody, /pluginTopicRecentMessageEntries\(def, options\.thread \|\| state\.currentThread, 2\)/);
assert.doesNotMatch(topicCardsBody, /plugin-topic-child-list/);
assert.doesNotMatch(topicCardsBody, /plugin-topic-child-meta/);
assert.match(topicCardsBody, /<span class="plugin-topic-title">\$\{escapeHtml\(def\.label\)\}<\/span>/);
assert.doesNotMatch(topicCardsBody, /plugin-topic-title">\$\{escapeHtml\(`\$\{def\.label\}\\u8bdd\\u9898`\)\}/);
assert.doesNotMatch(rowMetaBody, /\\u9ed8\\u8ba4\\u8bdd\\u9898/);
assert.doesNotMatch(rowMetaBody, /\\u6700\\u8fd1/);
assert.match(rowMetaBody, /\\u6682\\u65e0\\u56de\\u6267\\u6982\\u8981/);
assert.doesNotMatch(topicCardsBody, /readExpandedPluginTopics\(\)/);
assert.match(pluginTopicsUi, /function pluginTopicDirectoryClaimHidesRoot\(claim = null\) \{[\s\S]*?return false;/);
assert.match(pluginTopicsUi, /const PLUGIN_TOPIC_EXPANDED_STORAGE_KEY = "hermesPluginTopicExpanded";/);
assert.match(pluginTopicsUi, /function pluginTopicExpandedStorageKey\(workspaceId = pluginTopicUsageWorkspaceId\(\)\)/);
assert.match(pluginTopicsUi, /function setPluginTopicExpanded\(pluginId, expanded\)/);

assert.doesNotMatch(quickActionsBody, /preferred/);
assert.match(quickActionsBody, /const pluginEntry = pluginTopicUsageEntry\(usage, def\.id\);/);
assert.match(pluginTopicsUi, /const source = pluginTopicActionSource\(def\);/);
assert.match(pluginTopicsUi, /ensurePluginTopicActionManifestsLoaded\(defs\);/);
assert.match(quickActionsBody, /action: pluginTopicAppQuickAction\(def\),/);
assert.match(quickActionsBody, /const count = Math\.max\(0, Number\(entry\.count\) \|\| 0\);/);
assert.match(quickActionsBody, /const includeDefaults = options\.includeDefaults === true;/);
assert.match(quickActionsBody, /if \(!count && !includeDefaults\) return;/);
assert.match(quickActionsBody, /b\.count - a\.count/);
assert.match(quickActionsBody, /b\.lastUsedAt - a\.lastUsedAt/);
assert.match(entryHubBody, /if \(!quickActions\.length\) return "";/);
assert.match(entryHubBody, /ensurePluginTopicUsageLoaded\(\);/);
assert.match(entryHubBody, /data-capability-quick-columns="3"/);
assert.match(quickActionRenderBody, /action\?\.type === "open_plugin_app"/);
assert.match(quickActionRenderBody, /data-plugin-topic-open-app/);
assert.doesNotMatch(quickActionRenderBody, /capability-action-source/);

assert.doesNotMatch(directoryTopicsUi, /directory-topic-folder-icon/);
assert.match(directoryTopicsUi, /data-directory-topic-open-root/);
assert.match(directoryTopicsUi, /data-directory-topic-root-toggle/);
assert.match(directoryTopicsUi, /function directoryTopicRootCollapsedStorageKey/);
assert.match(directoryTopicsUi, /function readDirectoryTopicRootCollapsed/);
assert.match(directoryTopicsUi, /function setDirectoryTopicRootCollapsed/);
assert.match(directoryTopicsUi, /function directoryTopicRootBucketsForCollections/);
assert.match(directoryTopicsUi, /directory-topic-subdirectory-label/);
assert.doesNotMatch(directoryTopicsUi, /<button class="directory-topic-root-entry"[\s\S]*?data-directory-topic-open-root/);
assert.match(directoryTopicsUi, /directory-topic-root-icon/);
assert.match(directoryTopicsUi, /rootBuckets\.length[\s\S]*?topicCount/);
assert.match(directoryTopicsUi, /const routeId = String\(route\.projectId \|\| route\.id \|\| ""\)\.trim\(\);/);
assert.doesNotMatch(directoryTopicsUi, /directory-topic-association-label/);
assert.doesNotMatch(directoryTopicsUi, /directory-topic-subtitle/);
assert.doesNotMatch(directoryTopicsUi, /directory-topic-chip-badge/);
assert.match(directoryTopicsUi, /const baseTitle = String\(group\?\.title \|\| ""\)\.trim\(\);/);
assert.match(directoryTopicsUi, /topicReceiptSummaryTitleFromGroup\(group, \{ max: 120 \}\)/);
assert.match(directoryTopicsUi, /function directoryTopicDisplayParts\(group\)/);
assert.match(directoryTopicsUi, /const title = baseTitle \|\| receiptTitle \|\| "\\u6682\\u65e0\\u56de\\u6267\\u6982\\u8981";/);
assert.match(directoryTopicsUi, /const summary = baseTitle && receiptTitle && receiptTitle !== baseTitle \? receiptTitle : "";/);
assert.match(directoryTopicsUi, /fullTitle: summary \? `\$\{title\}\\uFF5C\$\{summary\}` : title,/);
assert.match(directoryTopicsUi, /directory-topic-chip-copy\$\{display\.summary \? " has-summary" : ""\}/);
assert.match(directoryTopicsUi, /directory-topic-chip-summary/);

assert.match(stylesCss, /\.capability-quick-grid \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
assert.match(stylesCss, /\.capability-action-source \{[\s\S]*?display: none;/);
assert.match(stylesCss, /--topic-plugin-dock-height: 78px;/);
assert.match(stylesCss, /\.app\.task-list-mode \.topbar,[\s\S]*?\.app\.capability-mode \.topbar \{[\s\S]*?display: none !important;/);
assert.match(stylesCss, /--mobile-bottom-nav-visual-drop: 10px;/);
assert.match(stylesCss, /--mobile-bottom-nav-bottom: var\(--mobile-bottom-nav-bottom-runtime, var\(--mobile-bottom-nav-comfort-inset\)\);/);
assert.match(stylesCss, /\.bottom-nav \{[\s\S]*?bottom: var\(--mobile-bottom-nav-bottom\);/);
assert.match(stylesCss, /--topic-plugin-dock-bottom: var\(--topic-plugin-dock-bottom-runtime, var\(--mobile-bottom-nav-offset-height\)\);/);
assert.match(stylesCss, /\.app\.task-list-mode \.conversation > \.directory-topic-launcher:first-child,[\s\S]*?margin-top: max\(16px, calc\(env\(safe-area-inset-top\) \+ 4px\)\);/);
assert.match(stylesCss, /\.app\.capability-mode \.conversation > \.capability-entry-hub:first-child/);
assert.match(stylesCss, /\.app\.task-list-mode \.conversation,[\s\S]*?\.app\.capability-mode \.conversation \{[\s\S]*?padding-bottom: var\(--topic-plugin-dock-reserved-height\);/);
assert.match(stylesCss, /\.app\.task-list-mode,[\s\S]*?\.app\.capability-mode \{[\s\S]*?padding-bottom: 0;/);
assert.match(stylesCss, /\.plugin-topic-list \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?gap: 2px;/);
assert.match(stylesCss, /\.plugin-topic-card \{[\s\S]*?border-bottom: 1px solid var\(--ui-hairline\);[\s\S]*?box-shadow: none;/);
assert.match(stylesCss, /\.plugin-topic-card-main,[\s\S]*?\.plugin-topic-card-main-row \{[\s\S]*?grid-template-columns: 56px minmax\(0, 1fr\) 16px;/);
assert.match(stylesCss, /\.plugin-topic-icon-entry \{[\s\S]*?width: 56px;/);
assert.match(stylesCss, /\.plugin-topic-row-body \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
assert.match(stylesCss, /\.plugin-topic-text \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: max-content 1px minmax\(0, 1fr\);[\s\S]*?align-items: center;/);
assert.match(stylesCss, /\.plugin-topic-separator \{[\s\S]*?width: 1px;[\s\S]*?align-self: stretch;[\s\S]*?background: color-mix/);
assert.match(stylesCss, /\.plugin-topic-subtitle \{[\s\S]*?white-space: normal;/);
assert.match(stylesCss, /\.directory-topic-text \{[\s\S]*?display: flex;[\s\S]*?align-items: baseline;/);
assert.match(stylesCss, /\.directory-topic-chip \{[\s\S]*?justify-items: start;[\s\S]*?text-align: left;/);
assert.match(stylesCss, /\.directory-topic-chip-title \{[\s\S]*?color: var\(--ink\);/);
assert.match(stylesCss, /\.directory-topic-chip \{[\s\S]*?overflow: visible;/);
assert.match(stylesCss, /\.directory-topic-chip-copy \{[\s\S]*?flex-wrap: wrap;[\s\S]*?overflow: visible;/);
assert.match(stylesCss, /\.directory-topic-chip-title \{[\s\S]*?white-space: normal;[\s\S]*?overflow-wrap: anywhere;/);
assert.match(stylesCss, /\.directory-topic-chip-summary \{[\s\S]*?color: var\(--muted\);/);
assert.doesNotMatch(stylesCss, /\.directory-topic-chip-copy\.has-summary \.directory-topic-chip-title \{[\s\S]*?max-width: 46%;/);
assert.match(stylesCss, /\.plugin-topic-card\.collapsed \.plugin-topic-row-chevron::before \{[\s\S]*?transform: rotate\(-45deg\);/);
assert.match(stylesCss, /\.plugin-topic-child-list \{[\s\S]*?margin-left: 52px;[\s\S]*?padding: 0 0 7px 9px;/);
assert.match(stylesCss, /@media \(max-width: 760px\) \{[\s\S]*?\.plugin-topic-child-list \{[\s\S]*?margin-left: 24px;[\s\S]*?padding: 0 0 7px 9px;/);
assert.match(stylesCss, /\.plugin-topic-card\.collapsed \.plugin-topic-child-list \{[\s\S]*?display: none;/);
assert.match(stylesCss, /\.directory-topic-root-entry \{[\s\S]*?grid-template-columns: 56px minmax\(0, 1fr\) 16px;/);
assert.match(stylesCss, /\.directory-topic-root-icon-entry,[\s\S]*?\.directory-topic-root-toggle,[\s\S]*?\.directory-topic-root-chevron-button \{[\s\S]*?min-height: 48px;/);
assert.match(stylesCss, /\.directory-topic-root-icon-entry \{[\s\S]*?width: 56px;[\s\S]*?place-items: center;/);
assert.match(stylesCss, /\.directory-topic-root-icon\.plugin-topic-app-icon\.directory \{[\s\S]*?width: 32px;[\s\S]*?height: 32px;[\s\S]*?--directory-folder-body-width: 26px;[\s\S]*?border-radius: 9px;[\s\S]*?background: linear-gradient/);
assert.match(stylesCss, /\.directory-topic-launcher\.root-collapsed \.directory-topic-grid \{[\s\S]*?display: none;/);

{
  const sandbox = {
    compactDisplayText: (value, max) => String(value || "").slice(0, max),
  };
  vm.createContext(sandbox);
  vm.runInContext(`${pluginTopicsUi}
globalThis.__topicReceiptSummaryTitleFromGroup = topicReceiptSummaryTitleFromGroup;`, sandbox);
  assert.equal(
    sandbox.__topicReceiptSummaryTitleFromGroup({
      lastReceiptTitle: "最新回执概要",
      messages: [{ role: "assistant", content: "上一条旧回执" }],
    }, { max: 120 }),
    "最新回执概要",
    "persisted receipt metadata must override stale assistant message summaries",
  );
}

{
  const longReceipt = "这是一个异常长的插件回执摘要，过去可能会把完整回执的一大段内容直接塞进插件话题列表，导致某个插件话题摘要接近一百六十字并挤压列表布局。";
  const sandbox = {
    state: {
      currentThread: {
        id: "thread_owner",
        messages: [],
      },
    },
    compactDisplayText: (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max),
    cleanDisplayText: (value) => String(value || "").replace(/\s+/g, " ").trim(),
    taskGroupsForThread: () => [{
      id: "plugin:music",
      lastReceiptTitle: longReceipt,
      messages: [{ role: "assistant", content: longReceipt }],
    }],
  };
  vm.createContext(sandbox);
  vm.runInContext(`${pluginTopicsUi}
globalThis.__pluginTopicRowMeta = pluginTopicRowMeta;
globalThis.__pluginTopicDefById = pluginTopicDefById;`, sandbox);
  const summary = sandbox.__pluginTopicRowMeta(sandbox.__pluginTopicDefById("music"));
  assert.equal(summary, "暂无回执概要", "plugin topic row summary must not expose body-like persisted receipts");
}

{
  const sandbox = {
    state: {
      currentThread: {
        id: "thread_owner",
        messages: [],
      },
    },
    compactDisplayText: (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max),
    cleanDisplayText: (value) => String(value || "").replace(/\s+/g, " ").trim(),
    taskGroupsForThread: () => [{
      id: "plugin:music",
      lastReceiptTitle: "感。",
      messages: [{ role: "assistant", content: "感。", updatedAt: "2026-06-18T13:00:00.000Z" }],
    }],
  };
  vm.createContext(sandbox);
  vm.runInContext(`${pluginTopicsUi}
globalThis.__pluginTopicRowMeta = pluginTopicRowMeta;
globalThis.__pluginTopicDefById = pluginTopicDefById;`, sandbox);
  const summary = sandbox.__pluginTopicRowMeta(sandbox.__pluginTopicDefById("music"));
  assert.equal(summary, "暂无回执概要", "plugin topic row summary must hide fragment receipt metadata");
}

{
  const sandbox = {
    state: {
      currentThread: {
        id: "thread_owner",
        messages: [
          {
            id: "music-receipt",
            role: "assistant",
            taskGroupId: "plugin:music",
            content: "# Roon 收藏夹分析\n\n我刚看了你的收藏列表，下面是详细说明。",
            updatedAt: "2026-06-18T13:00:00.000Z",
          },
        ],
      },
    },
    compactDisplayText: (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max),
    cleanDisplayText: (value) => String(value || "").replace(/\s+/g, " ").trim(),
    taskGroupsForThread: () => [{
      id: "plugin:music",
      lastReceiptTitle: "",
      messages: [],
    }],
    formatTime: () => "13:00",
  };
  vm.createContext(sandbox);
  vm.runInContext(`${pluginTopicsUi}
globalThis.__pluginTopicRowMeta = pluginTopicRowMeta;
globalThis.__pluginTopicDefById = pluginTopicDefById;`, sandbox);
  const summary = sandbox.__pluginTopicRowMeta(sandbox.__pluginTopicDefById("music"));
  assert.equal(summary, "Roon 收藏夹分析", "plugin topic row summary may use a Markdown heading title");
}

function createPluginTopicHarness(options = {}) {
  const storage = new Map();
  const timers = [];
  const renderCalls = [];
  const failLocalStorageWrites = options.failLocalStorageWrites === true;
  const unavailableEmbeddedIds = new Set(options.unavailableEmbeddedIds || []);
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
      embeddedPlugins: {},
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
    EMBEDDED_PLUGIN_DEFS: {
      "codex-mobile": { id: "codex-mobile" },
      finance: { id: "finance" },
      email: { id: "email" },
      health: { id: "health" },
      note: { id: "note" },
      growth: { id: "growth" },
      moira: { id: "moira" },
    },
    embeddedPluginNavigationAvailable: (def) => !unavailableEmbeddedIds.has(String(def?.id || "")),
    currentWorkspace: () => ({ defaultWorkspace: "/workspace/owner" }),
    matchingDirectoryProject: () => ({ id: "owner-root", root: "/workspace/owner", label: "Owner" }),
    directoryAttachmentFromRoute: (projectId, subprojectId, pathText, label) => ({
      projectId,
      subprojectId,
      path: pathText,
      root: "/workspace/owner",
      label,
    }),
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
  applyServerPreferences: applyPluginTopicPreferencesFromServer,
  readPinnedTabs: readPinnedPluginBottomTabs,
  readPluginOrder: readPluginTopicOrder,
  quickKeys: () => capabilityHubQuickActions(availablePluginTopicDefs()).map(({ def, action }) => def.id + ":" + action.id),
  actionIds: (pluginId) => pluginTopicQuickActions(pluginTopicDefById(pluginId)).map((action) => action.id + ":" + action.entry.pluginRoute),
  menuHtml: (pluginId) => renderCapabilityActionMenu(pluginTopicDefById(pluginId)),
  launcherHtml: () => renderPluginAppLauncher(),
  switcherHtml: (group) => renderPluginTopicSwitcher(group),
  topicGroups: (thread) => pluginTopicGroupsForTaskList(thread),
  pinBottomTabs: (ids) => writePinnedPluginBottomTabs(ids, state.selectedWorkspaceId || "owner", { sync: false }),
  setManifestActions: (pluginId, actions, workspaceId = state.selectedWorkspaceId || "owner") => {
    state.embeddedPlugins[pluginId] = state.embeddedPlugins[pluginId] || {};
    state.embeddedPlugins[pluginId].manifest = { ok: true, available: true, workspaceId, actions };
  },
};`, sandbox);
  return {
    ...sandbox.__pluginTopicHarness,
    setWorkspace(workspaceId) {
      sandbox.state.selectedWorkspaceId = workspaceId;
      sandbox.state.auth.workspaceId = workspaceId;
    },
    setEmbeddedAvailable(pluginId, available = true) {
      const id = String(pluginId || "").trim();
      if (!id) return;
      if (available) unavailableEmbeddedIds.delete(id);
      else unavailableEmbeddedIds.add(id);
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

{
  const harness = createPluginTopicHarness();
  harness.setManifestActions("finance", [
    {
      id: "scan_receipt",
      label: "扫票据",
      placement: ["plugin_drawer_frequent", "dock_long_press", "search"],
      priority: 1,
      entry: { type: "plugin_route", pluginRoute: "receipt" },
    },
  ]);

  assert.deepEqual(harness.actionIds("finance"), ["scan_receipt:receipt"]);
  const menuHtml = harness.menuHtml("finance");
  assert.match(menuHtml, /data-plugin-topic-action-id="scan_receipt"/, "plugin popup menu must render manifest actions");
  assert.match(menuHtml, /data-plugin-bottom-tab-toggle="finance"/, "plugin popup menu must keep the bottom-tab pin control");
assert.match(menuHtml, /data-plugin-topic-move-dir="up"/, "plugin popup menu must keep the move-up control");
  assert.match(menuHtml, /data-plugin-topic-move-dir="down"/, "plugin popup menu must keep the move-down control");
  assert.match(menuHtml, /data-plugin-topic-reorder="finance"/, "plugin popup menu must expose explicit reorder mode");
  assert.ok(
    menuHtml.indexOf('data-plugin-bottom-tab-toggle="finance"') < menuHtml.indexOf('data-plugin-topic-action-id="scan_receipt"'),
    "pin controls must stay above plugin actions so they remain visible on mobile",
  );
  assert.ok(
    menuHtml.indexOf('data-plugin-topic-move-dir="up"') < menuHtml.indexOf('data-plugin-topic-action-id="scan_receipt"'),
    "move controls must stay above plugin actions so they remain visible on mobile",
  );
  assert.ok(
    menuHtml.indexOf('data-plugin-topic-reorder="finance"') < menuHtml.indexOf('data-plugin-topic-action-id="scan_receipt"'),
    "reorder controls must stay above plugin actions so they remain visible on mobile",
  );
  assert.doesNotMatch(menuHtml, /data-plugin-topic-action-id="record"/, "manifest actions must replace host fallback actions after load");
  harness.recordUsage("finance", "scan_receipt");
  harness.flushRootRefreshTimers();
  assert.equal(harness.quickKeys()[0], "finance:scan_receipt", "manifest actions must feed the Dock frequent action menu");

  const codexMenuHtml = harness.menuHtml("codex-mobile");
  assert.match(codexMenuHtml, /data-plugin-topic-open-app="codex-mobile"/, "Codex drawer menu must keep the open action");
  assert.match(codexMenuHtml, /data-plugin-topic-reorder="codex-mobile"/, "Codex drawer menu must support explicit reorder mode");
  assert.match(codexMenuHtml, /data-plugin-topic-move="codex-mobile"/, "Codex drawer menu must support bounded move controls");
  assert.match(codexMenuHtml, /data-plugin-bottom-tab-toggle="codex-mobile"/, "Codex must support the same bottom-tab pin menu as other plugins");
}

{
  const harness = createPluginTopicHarness();
  assert.match(harness.launcherHtml(), /data-plugin-topic-open-app="finance"/, "unpinned finance app icon must be visible in the drawer");
  harness.pinBottomTabs(["finance"]);
  const launcherHtml = harness.launcherHtml();
  assert.doesNotMatch(launcherHtml, /data-plugin-topic-open-app="finance"/, "pinned finance app icon must be hidden from the drawer");
  assert.match(launcherHtml, /data-plugin-topic-open-app="wardrobe"/, "unfixed plugin app icons must remain in the drawer");

  harness.pinBottomTabs(["codex-mobile", "finance"]);
  const codexLauncherHtml = harness.launcherHtml();
  assert.doesNotMatch(codexLauncherHtml, /data-plugin-topic-open-app="codex-mobile"/, "pinned Codex must be hidden from the drawer like other pinned plugins");
  assert.doesNotMatch(codexLauncherHtml, /data-plugin-topic-open-app="finance"/, "eligible pinned plugin app icons must still be hidden from the drawer");
}

{
  const harness = createPluginTopicHarness({ unavailableEmbeddedIds: ["codex-mobile"] });
  harness.applyServerPreferences({
    pinnedBottomTabs: ["codex-mobile", "finance"],
    pluginOrder: ["codex-mobile", "finance", "wardrobe"],
  }, "owner");
  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.readPinnedTabs("owner"))),
    ["codex-mobile", "finance"],
    "server-pinned tabs must survive a cold start before Codex manifest availability is known",
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.readPluginOrder("owner").slice(0, 3))),
    ["codex-mobile", "finance", "wardrobe"],
    "server drawer order must preserve temporarily unavailable plugin ids",
  );
  harness.setEmbeddedAvailable("codex-mobile", true);
  const launcherHtml = harness.launcherHtml();
  assert.doesNotMatch(
    launcherHtml,
    /data-plugin-topic-open-app="codex-mobile"/,
    "pinned Codex must not reappear in the drawer after delayed manifest availability returns",
  );
  assert.doesNotMatch(
    launcherHtml,
    /data-plugin-topic-open-app="finance"/,
    "pinned Finance must remain hidden from the drawer after delayed manifest availability returns",
  );
}

{
  const harness = createPluginTopicHarness({ unavailableEmbeddedIds: ["codex-mobile"] });
  harness.applyServerPreferences({
    pluginOrder: ["codex-mobile", "finance", "wardrobe"],
  }, "owner");
  harness.setEmbeddedAvailable("codex-mobile", true);
  const launcherHtml = harness.launcherHtml();
  assert.ok(
    launcherHtml.indexOf('data-plugin-topic-open-app="codex-mobile"') < launcherHtml.indexOf('data-plugin-topic-open-app="finance"'),
    "delayed Codex manifest availability must restore its server-saved drawer order without another server round trip",
  );
}

{
  const harness = createPluginTopicHarness();
  assert.equal(harness.switcherHtml({ id: "plugin:wardrobe" }), "", "plugin topic detail must not render a topic dropdown");
  const wardrobeGroup = harness.topicGroups({ messages: [] }).find((group) => group.id === "plugin:wardrobe");
  assert.equal(wardrobeGroup.directoryRoute.projectId, "owner-root", "default plugin topic must expose the plugin delivery directory chip route");
  assert.equal(wardrobeGroup.directoryRoute.label, "衣橱 资料");
  assert.match(wardrobeGroup.directoryRoute.path, /\/插件\/衣橱$/);
}

function createDirectoryTopicHarness(options = {}) {
  const storage = new Map();
  const sandbox = {
    console,
    state: {
      selectedWorkspaceId: "owner",
      auth: { workspaceId: "owner" },
      projects: options.projects || [],
    },
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
    taskGroupOwnerWorkspaceId: (group) => group.ownerWorkspaceId || group.messages?.[0]?.senderWorkspaceId || "",
    projectDisplayLabel: (project) => project?.label || project?.id || "",
    directoryRouteDisplayPath: (route, fallbackLabel = "") => {
      const project = (sandbox.state.projects || []).find((item) => item.id === route?.projectId);
      const child = route?.subprojectId ? (project?.children || []).find((item) => item.id === route.subprojectId) : null;
      const rootLabel = project?.label || route?.label || fallbackLabel || "";
      return child ? `${rootLabel} / ${child.label || child.id}` : rootLabel;
    },
    topicReceiptSummaryTitleFromGroup: (group) => group.lastReceiptTitle || "",
  };
  vm.createContext(sandbox);
  vm.runInContext(`${directoryTopicsUi}
globalThis.__directoryTopicHarness = {
  render: renderDirectoryTopicCards,
  collections: directoryTopicCollectionsForGroups,
  rootBuckets: directoryTopicRootBucketsForCollections,
  setCollapsed: setDirectoryTopicCollapsed,
  setRootCollapsed: setDirectoryTopicRootCollapsed,
};`, sandbox);
  return sandbox.__directoryTopicHarness;
}

function createPluginDirectoryClaimHarness() {
  const storage = new Map();
  const sandbox = {
    console,
    Date,
    URLSearchParams,
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
        storage.set(key, String(value));
      },
    },
    window: {
      setTimeout(fn) {
        return fn();
      },
      clearTimeout() {},
    },
    $: () => null,
    renderCurrentThread: () => {},
    wardrobePluginNavigationAvailable: () => true,
    EMBEDDED_PLUGIN_DEFS: { finance: {}, email: {}, health: {}, note: {}, growth: {} },
    embeddedPluginNavigationAvailable: () => true,
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
    taskGroupOwnerWorkspaceId: (group) => group.ownerWorkspaceId || group.messages?.[0]?.senderWorkspaceId || "",
    api: async () => ({ topics: [], directoryClaims: [] }),
  };
  vm.createContext(sandbox);
  vm.runInContext(`${pluginTopicsUi}
${directoryTopicsUi}
globalThis.__pluginDirectoryClaimHarness = {
  collections: directoryTopicCollectionsForGroups,
  claimed: pluginTopicClaimedDirectoryTopicCollections,
  visible: pluginTopicFilterDirectoryTopicCollectionsForRoot,
  writeProjection: writePluginTopicBindingProjection,
  routeKey: directoryTopicRouteKey,
};`, sandbox);
  return sandbox.__pluginDirectoryClaimHarness;
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
  assert.equal(/directory-topic-launcher root-collapsed/.test(initial), false);
  assert.match(initial, /class="directory-topic-root-icon-entry"[\s\S]*?data-directory-topic-open-root/);
  assert.match(initial, /class="directory-topic-root-toggle"[\s\S]*?data-directory-topic-root-toggle/);
  assert.equal(directoryCardCollapsed(initial, "dir-1"), false);
  assert.equal(directoryCardCollapsed(initial, "dir-2"), true);
  assert.equal(directoryCardCollapsed(initial, "dir-3"), true);
  assert.equal(directoryCardCollapsed(initial, "dir-4"), true);

  harness.setRootCollapsed(true);
  assert.equal(/directory-topic-launcher root-collapsed/.test(harness.render(collections)), true);
  harness.setRootCollapsed(false);
  assert.equal(/directory-topic-launcher root-collapsed/.test(harness.render(collections)), false);

  harness.setCollapsed("dir-1", true);
  assert.equal(directoryCardCollapsed(harness.render(collections), "dir-1"), true);

  harness.setCollapsed("dir-4", false);
  assert.equal(directoryCardCollapsed(harness.render(collections), "dir-4"), false);
}

{
  const harness = createDirectoryTopicHarness({
    projects: [{
      id: "fanfan",
      label: "凡凡",
      root: "/drive/凡凡",
      children: [
        { id: "study", label: "学业计划", root: "/drive/凡凡/学业计划" },
        { id: "health", label: "健康", root: "/drive/凡凡/健康" },
        { id: "python", label: "Python", root: "/drive/凡凡/Python" },
      ],
    }],
  });
  const collections = harness.collections([
    {
      id: "study-plan-topic",
      title: "学业计划跟进",
      ownerWorkspaceId: "owner",
      updatedAt: "2026-06-25T08:00:00.000Z",
      directoryRoute: { projectId: "fanfan", subprojectId: "study", label: "学业计划", root: "/drive/凡凡/学业计划", path: "/drive/凡凡/学业计划", ownerWorkspaceId: "owner" },
    },
    {
      id: "health-topic",
      title: "健康记录",
      ownerWorkspaceId: "owner",
      updatedAt: "2026-06-25T07:00:00.000Z",
      directoryRoute: { projectId: "fanfan", subprojectId: "health", label: "健康", root: "/drive/凡凡/健康", path: "/drive/凡凡/健康", ownerWorkspaceId: "owner" },
    },
    {
      id: "python-topic",
      title: "Python 练习",
      ownerWorkspaceId: "owner",
      updatedAt: "2026-06-25T06:00:00.000Z",
      directoryRoute: { projectId: "fanfan", subprojectId: "python", label: "Python", root: "/drive/凡凡/Python", path: "/drive/凡凡/Python", ownerWorkspaceId: "owner" },
    },
  ]);
  const buckets = harness.rootBuckets(collections);
  const html = harness.render(collections);

  assert.equal(collections.length, 3, "directory route collections remain concrete per child directory");
  assert.equal(buckets.length, 1, "child directory topic collections should render under one root bucket");
  assert.equal(buckets[0].label, "凡凡");
  assert.deepEqual(
    JSON.parse(JSON.stringify(buckets[0].collections.map((item) => item.rootInfo.childLabel).sort())),
    ["Python", "健康", "学业计划"].sort(),
  );
  assert.match(html, /data-directory-topic-card="owner\|fanfan\|\|\/drive\/凡凡"/);
  assert.match(html, /<span class="directory-topic-title">凡凡<\/span>/);
  assert.match(html, /3 个子目录/);
  assert.match(html, /<div class="directory-topic-subdirectory-label"><span>学业计划<\/span><span>1 个话题<\/span><\/div>/);
  assert.match(html, /<div class="directory-topic-subdirectory-label"><span>健康<\/span><span>1 个话题<\/span><\/div>/);
  assert.match(html, /<div class="directory-topic-subdirectory-label"><span>Python<\/span><span>1 个话题<\/span><\/div>/);
  assert.equal((html.match(/data-directory-topic-card=/g) || []).length, 1, "root grouping must not flatten child directories as separate parent cards");
}

{
  const harness = createDirectoryTopicHarness();
  const manualTitle = "Stephen 2026 年体检复盘和指标跟踪";
  const groups = [
    {
      id: "manual-directory-topic",
      title: manualTitle,
      lastReceiptTitle: "最近一次体检报告重点",
      ownerWorkspaceId: "owner",
      updatedAt: "2026-06-18T12:00:00.000Z",
      directoryRoute: {
        projectId: "health",
        label: "健康",
        root: "/data/drive/users/owner/健康",
        path: "/data/drive/users/owner/健康",
      },
    },
  ];
  const html = harness.render(harness.collections(groups));

  assert.match(html, new RegExp(`<span class="directory-topic-chip-title">${manualTitle}</span>`));
  assert.match(html, /class="directory-topic-chip-copy has-summary"/);
  assert.match(html, /<span class="directory-topic-chip-summary">最近一次体检报告重点<\/span>/);
}

{
  const harness = createDirectoryTopicHarness();
  const groups = [
    {
      id: "wuping-health",
      title: "吴萍健康",
      ownerWorkspaceId: "weixin_wuping",
      updatedAt: "2026-06-08T12:00:00.000Z",
      directoryRoute: {
        projectId: "health",
        label: "健康",
        root: "/shared/health",
        path: "/shared/health",
      },
    },
    {
      id: "fanfan-health",
      title: "凡凡健康",
      ownerWorkspaceId: "fanfan",
      updatedAt: "2026-06-08T11:00:00.000Z",
      directoryRoute: {
        projectId: "health",
        label: "健康",
        root: "/shared/health",
        path: "/shared/health",
      },
    },
  ];
  const collections = harness.collections(groups);

  assert.equal(collections.length, 2, "directory-bound topics from different owners must not merge");
  assert.deepEqual(Array.from(collections.map((item) => item.groups[0].id).sort()), ["fanfan-health", "wuping-health"]);
}

{
  const harness = createDirectoryTopicHarness();
  const groups = [
    {
      id: "stephen-health",
      title: "Stephen2026年体检",
      ownerWorkspaceId: "weixin_wuping",
      updatedAt: "2026-06-09T12:00:00.000Z",
      directoryRoute: {
        label: "健康",
        root: "/data/drive/users/weixin_stephen/Hermes-Stephen/健康",
        path: "/data/drive/users/weixin_stephen/Hermes-Stephen/健康",
        ownerWorkspaceId: "weixin_stephen",
      },
    },
    {
      id: "wuping-health",
      title: "把我历史上的健康数据分析一下",
      ownerWorkspaceId: "weixin_wuping",
      updatedAt: "2026-06-09T10:38:00.000Z",
      directoryRoute: {
        label: "健康",
        root: "/data/drive/users/weixin_wuping/Hermes-吴萍/健康",
        path: "/data/drive/users/weixin_wuping/Hermes-吴萍/健康",
        ownerWorkspaceId: "weixin_wuping",
      },
    },
  ];
  const collections = harness.collections(groups);

  assert.equal(collections.length, 2, "same-label Health directories from different roots must render as separate collections");
  assert.deepEqual(Array.from(collections.map((item) => item.groups[0].id).sort()), ["stephen-health", "wuping-health"]);
}

{
  const harness = createPluginDirectoryClaimHarness();
  const groups = [
    {
      id: "health-history",
      title: "健康历史",
      ownerWorkspaceId: "owner",
      updatedAt: "2026-06-09T12:00:00.000Z",
      directoryRoute: { projectId: "health", path: "/users/owner/health", ownerWorkspaceId: "owner" },
    },
    {
      id: "family-docs",
      title: "家庭资料",
      ownerWorkspaceId: "owner",
      updatedAt: "2026-06-09T11:00:00.000Z",
      directoryRoute: { projectId: "family", path: "/users/owner/family", ownerWorkspaceId: "owner" },
    },
  ];
  const collections = harness.collections(groups);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.claimed(collections).flatMap((item) => item.groups.map((group) => group.id)))), []);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.visible(collections).flatMap((item) => item.groups.map((group) => group.id)).sort())), ["family-docs", "health-history"]);
}

{
  const harness = createPluginDirectoryClaimHarness();
  const group = {
    id: "health-reference",
    title: "健康辅助资料",
    ownerWorkspaceId: "owner",
    updatedAt: "2026-06-09T12:00:00.000Z",
    directoryRoute: { projectId: "health", path: "/users/owner/health-reference", ownerWorkspaceId: "owner" },
  };
  const collections = harness.collections([group]);
  harness.writeProjection("owner", {
    directoryClaims: [{
      pluginId: "health",
      directoryRouteKey: collections[0].key,
      claimMode: "auxiliary_context",
      hideFromDirectoryTopicRoot: false,
    }],
  });

  assert.equal(harness.claimed(collections).length, 0, "auxiliary context must not hide a directory topic collection");
  assert.equal(harness.visible(collections).length, 1);
}

function createPluginContextColdRestoreHarness(options = {}) {
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
      currentThread: options.currentThread || null,
      currentThreadId: options.currentThread?.id || "",
      threads: [],
      taskListThread: options.taskListThread || null,
      taskListThreadId: options.taskListThread?.id || "",
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
    taskListThreadCacheEligible(thread) {
      if (!thread?.id || !thread.singleWindow) return false;
      const page = thread.messagesPage || {};
      return !(String(page.mode || "").trim().toLowerCase() === "tasks" && String(page.taskGroupId || "").trim());
    },
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

  const pollutedDetailThread = {
    id: "plugin-detail-thread",
    workspaceId: "owner",
    singleWindow: true,
    messages: [],
    messagesPage: { mode: "tasks", taskGroupId: "plugin:finance" },
  };
  const pollutedHarness = createPluginContextColdRestoreHarness({
    currentThread: pollutedDetailThread,
    taskListThread: pollutedDetailThread,
  });
  pollutedHarness.exitPluginContextToTopicHome();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(pollutedHarness.calls.api.length, 1, "polluted plugin detail cache must be ignored and refetched");
  assert.equal(pollutedHarness.sandbox.state.currentThreadId, "task-root");
  assert.equal(pollutedHarness.sandbox.state.taskListThreadId, "task-root");
  assert.deepEqual(pollutedHarness.calls.setComposerEnabled, [true]);

  console.log("app plugin topics UI tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
