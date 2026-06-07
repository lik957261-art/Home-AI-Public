"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

assert.match(pluginTopicsUi, /const CAPABILITY_QUICK_ACTION_LIMIT = 12;/);
assert.match(pluginTopicsUi, /function pluginTopicActionUsageKey/);
assert.match(recordUsageBody, /usage\.actions = actions;/);
assert.match(recordUsageBody, /usage\.plugins = plugins;/);
assert.match(openAppBody, /recordPluginTopicUsage\(def\.id\);/);
assert.doesNotMatch(openAppBody, /action\.id/);
assert.match(runActionBody, /recordPluginTopicUsage\(def\.id, action\.id\);/);

assert.doesNotMatch(quickActionsBody, /preferred/);
assert.match(quickActionsBody, /const count = Math\.max\(0, Number\(entry\.count\) \|\| 0\);/);
assert.match(quickActionsBody, /if \(!count\) return;/);
assert.match(quickActionsBody, /b\.count - a\.count/);
assert.match(quickActionsBody, /b\.lastUsedAt - a\.lastUsedAt/);
assert.match(entryHubBody, /if \(!quickActions\.length\) return "";/);
assert.match(entryHubBody, /data-capability-quick-columns="3"/);
assert.doesNotMatch(quickActionRenderBody, /capability-action-source/);

assert.match(directoryTopicsUi, /plugin-topic-app-icon directory directory-topic-folder-icon/);
assert.doesNotMatch(directoryTopicsUi, /directory-topic-association-label/);
assert.doesNotMatch(directoryTopicsUi, /directory-topic-subtitle/);
assert.doesNotMatch(directoryTopicsUi, /directory-topic-chip-badge/);

assert.match(stylesCss, /\.capability-quick-grid \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
assert.match(stylesCss, /\.capability-action-source \{[\s\S]*?display: none;/);
assert.match(stylesCss, /--topic-plugin-dock-height: 78px;/);
assert.match(stylesCss, /\.app\.task-list-mode \.topbar \{[\s\S]*?display: none !important;/);
assert.match(stylesCss, /\.bottom-nav \{[\s\S]*?bottom: -6px;/);

console.log("app plugin topics UI tests passed");
