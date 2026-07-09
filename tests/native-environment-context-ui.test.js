"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const nativeEnvironmentUi = fs.readFileSync(path.join(repoRoot, "public", "app-composer-native-environment-ui.js"), "utf8");
const sendPipelineUi = fs.readFileSync(path.join(repoRoot, "public", "app-composer-send-pipeline-ui.js"), "utf8");
const nativeDoc = fs.readFileSync(path.join(repoRoot, "docs", "MODULES", "native-ios-shell.md"), "utf8");
const wardrobeSkill = fs.readFileSync(path.join(repoRoot, "skills", "productivity", "wardrobe-style-operations", "SKILL.md"), "utf8");

assert.match(nativeEnvironmentUi, /function nativeEnvironmentContextBridgeAvailable\(\)/);
assert.match(nativeEnvironmentUi, /CHAT_COMPOSER_NATIVE_ENVIRONMENT_MODEL_ESM_PATH/);
assert.match(nativeEnvironmentUi, /\/vite-islands\/chat-composer-native-environment-model\/chat-composer-native-environment-model\.js/);
assert.match(nativeEnvironmentUi, /importChatComposerNativeEnvironmentModel/);
assert.match(nativeEnvironmentUi, /currentChatComposerNativeEnvironmentModel/);
assert.match(nativeEnvironmentUi, /nativeEnvironmentBridgeAvailabilityPlan/);
assert.match(nativeEnvironmentUi, /window\.HomeAINativeEnvironmentCapability/);
assert.match(nativeEnvironmentUi, /window\.HomeAINativeEnvironment/);
assert.match(nativeEnvironmentUi, /homeAI\.nativeEnvironmentContext/);
assert.match(nativeEnvironmentUi, /nativeShell.*ios/s);
assert.match(nativeEnvironmentUi, /function nativeEnvironmentContextTargetAt\(text = ""\)/);
assert.match(nativeEnvironmentUi, /nativeEnvironmentContextTargetAtPlan/);
assert.match(nativeEnvironmentUi, /\\u660e\\u5929\|tomorrow/);
assert.match(nativeEnvironmentUi, /function nativeEnvironmentContextPurpose\(body = \{\}, text = ""\)/);
assert.match(nativeEnvironmentUi, /nativeEnvironmentContextPurposePlan/);
assert.match(nativeEnvironmentUi, /wardrobe_outfit/);
assert.match(nativeEnvironmentUi, /general_environment/);
assert.match(nativeEnvironmentUi, /function requestNativeEnvironmentContextForSend\(body = \{\}, text = ""\)/);
assert.match(nativeEnvironmentUi, /createNativeEnvironmentContextRequestPlan/);
assert.match(nativeEnvironmentUi, /window\.HomeAINativeEnvironment\.getContext\(request\)/);
assert.match(nativeEnvironmentUi, /setTimeout\(\(\) => resolve\(null\), 1200\)/);
assert.match(nativeEnvironmentUi, /function refreshNativeEnvironmentSnapshotForSend\(options = \{\}\)/);
assert.match(nativeEnvironmentUi, /nativeEnvironmentSnapshotRefreshPlan/);
assert.match(nativeEnvironmentUi, /nativeEnvironmentSnapshotUploadBodyPlan/);
assert.match(nativeEnvironmentUi, /\/api\/native\/environment-context/);
assert.match(nativeEnvironmentUi, /model_tool_snapshot/);
assert.match(nativeEnvironmentUi, /homeai:native-environment-refresh/);
assert.match(nativeEnvironmentUi, /installNativeEnvironmentSnapshotAutoRefresh\(\)/);
assert.match(sendPipelineUi, /await refreshNativeEnvironmentSnapshotForSend\(\)/);
assert.match(sendPipelineUi, /if \(input\.environmentContext\) body\.environmentContext = input\.environmentContext/);

assert.match(nativeDoc, /native_environment_context/);
assert.match(nativeDoc, /environmentContext/);
assert.match(nativeDoc, /cache refresh\s+for model tools, not prompt injection/);
assert.match(nativeDoc, /`current_environment` toolset/);
assert.match(wardrobeSkill, /environment_context/);
assert.match(wardrobeSkill, /fall back to the `weather` toolset/);

console.log("native environment context ui tests passed");
