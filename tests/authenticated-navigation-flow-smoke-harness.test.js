"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const script = read("scripts/authenticated-navigation-flow-smoke.js");
const testMatrix = read("docs/TEST_MATRIX.md");
const mapDoc = read("docs/ARCHITECTURE_CODE_TEST_HARNESS_MAP.md");

assert.match(script, /argValue\("--access-key-path"/);
assert.match(script, /HERMES_NAV_FLOW_ACCESS_KEY_PATH/);
assert.match(script, /HERMES_WEB_AUTH_KEY_PATH/);
assert.match(script, /localStorage\.setItem\("hermesWebKey", key\)/);
assert.match(script, /name: "hermes_web_key"/);
assert.doesNotMatch(script, /console\.log\(accessKey/);
assert.doesNotMatch(script, /accessKeyPath:\s*accessKeyPath/);
assert.match(script, /#bottomChatMode/);
assert.match(script, /#bottomInboxMode/);
assert.match(script, /#bottomTasksMode/);
assert.match(script, /\.capability-plugin-icon-button/);
assert.match(script, /#topicPluginDock \.plugin-app-card/);
assert.match(script, /plugin_or_topic/);
assert.match(script, /return/);
assert.match(script, /getBoundingClientRect\(\)/);
assert.match(script, /bottomNavBounds/);
assert.match(script, /composerBounds/);
assert.match(script, /composerNavOverlap/);
assert.match(script, /viewportMetrics/);
assert.match(script, /horizontalOverflow/);
assert.match(script, /performance\.getEntriesByType\("longtask"\)/);
assert.match(script, /longTaskSummary/);
assert.match(script, /layoutStability/);
assert.match(script, /navigationTiming/);
assert.match(script, /tabSwitchTimingMs/);
assert.match(script, /staleSurfaceWarnings/);
assert.match(script, /stale_cached_surface_visible_after_switch/);
assert.match(script, /currentView/);
assert.match(script, /activeNav/);
assert.match(testMatrix, /authenticated-navigation-flow-smoke-harness\.test\.js/);
assert.match(testMatrix, /authenticated-navigation-flow-smoke\.js/);
assert.match(mapDoc, /authenticated-navigation-flow-smoke\.js/);

console.log("authenticated navigation flow smoke harness tests passed");
