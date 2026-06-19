"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const eventStreamUi = fs.readFileSync(path.join(repoRoot, "public", "app-event-stream-ui.js"), "utf8");
const nativeDoc = fs.readFileSync(path.join(repoRoot, "docs", "MODULES", "native-ios-shell.md"), "utf8");
const wardrobeSkill = fs.readFileSync(path.join(repoRoot, "skills", "productivity", "wardrobe-style-operations", "SKILL.md"), "utf8");

assert.match(eventStreamUi, /function nativeEnvironmentContextBridgeAvailable\(\)/);
assert.match(eventStreamUi, /window\.HomeAINativeEnvironmentCapability/);
assert.match(eventStreamUi, /window\.HomeAINativeEnvironment/);
assert.match(eventStreamUi, /homeAI\.nativeEnvironmentContext/);
assert.match(eventStreamUi, /nativeShell.*ios/s);
assert.match(eventStreamUi, /function nativeEnvironmentContextTargetAt\(text = ""\)/);
assert.match(eventStreamUi, /\\u660e\\u5929\|tomorrow/);
assert.match(eventStreamUi, /function nativeEnvironmentContextPurpose\(body = \{\}, text = ""\)/);
assert.match(eventStreamUi, /wardrobe_outfit/);
assert.match(eventStreamUi, /general_environment/);
assert.match(eventStreamUi, /function requestNativeEnvironmentContextForSend\(body = \{\}, text = ""\)/);
assert.match(eventStreamUi, /window\.HomeAINativeEnvironment\.getContext\(request\)/);
assert.match(eventStreamUi, /setTimeout\(\(\) => resolve\(null\), 1200\)/);
assert.match(eventStreamUi, /function refreshNativeEnvironmentSnapshotForSend\(options = \{\}\)/);
assert.match(eventStreamUi, /\/api\/native\/environment-context/);
assert.match(eventStreamUi, /model_tool_snapshot/);
assert.match(eventStreamUi, /homeai:native-environment-refresh/);
assert.match(eventStreamUi, /installNativeEnvironmentSnapshotAutoRefresh\(\)/);
assert.match(eventStreamUi, /await refreshNativeEnvironmentSnapshotForSend\(\)/);
assert.match(eventStreamUi, /if \(environmentContext\) body\.environmentContext = environmentContext/);

assert.match(nativeDoc, /native_environment_context/);
assert.match(nativeDoc, /environmentContext/);
assert.match(nativeDoc, /cache refresh\s+for model tools, not prompt injection/);
assert.match(nativeDoc, /`current_environment` toolset/);
assert.match(wardrobeSkill, /environment_context/);
assert.match(wardrobeSkill, /fall back to the `weather` toolset/);

console.log("native environment context ui tests passed");
