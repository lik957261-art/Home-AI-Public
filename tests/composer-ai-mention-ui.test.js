"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const serverJs = fs.readFileSync(path.join(repoRoot, "server.js"), "utf8");
const appJs = fs.readFileSync(path.join(repoRoot, "public", "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(repoRoot, "public", "index.html"), "utf8");
const stylesCss = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");

assert.match(serverJs, /const REASONING_EFFORT_OPTIONS = Object\.freeze\(\[/);
assert.match(serverJs, /shortLabel: "Xhigh"/);
assert.match(serverJs, /function parseAgentRuntimeConfigFromYaml\(text\)/);
assert.match(serverJs, /function runtimeModelConfigInfo\(\)/);
assert.match(serverJs, /function assistantLabelForRuntimeConfig\(info = \{\}\)/);
assert.match(serverJs, /model:\s*\{\s*default: info\.defaultModel/s);

assert.equal(appJs.includes("AI_MENTION_OPTIONS"), false);
assert.match(appJs, /function composerAiMentionOptions\(\)/);
assert.ok(appJs.includes("mentionText: `@${label}`"));
assert.ok(appJs.includes("mentionText: `@${label} ${shortLabel}`"));
assert.match(appJs, /if \(option\.value === defaultEffort\) continue/);
assert.match(appJs, /if \(effort === "xhigh"\) return "Xhigh"/);
assert.match(appJs, /function composerAiMentionInfo\(text\)/);
assert.match(appJs, /function composerMentionAvailable\(\)/);
assert.match(appJs, /return state\.viewMode === "single" \|\| state\.viewMode === "tasks"/);
assert.match(appJs, /function ownerElevationComposerAvailable\(\)/);
assert.match(appJs, /state\.auth\?\.isOwner && state\.selectedWorkspaceId === "owner"/);
assert.match(appJs, /function ownerElevationMentionOptions\(\)/);
assert.match(appJs, /mentionText: "#高权限本次"/);
assert.match(appJs, /function activateOwnerElevationOnce\(options = \{\}\)/);
assert.match(appJs, /\/api\/owner-elevation\/once/);
assert.match(appJs, /ownerElevationOnceToken/);
assert.match(appJs, /body\.ownerElevationOnceToken = state\.ownerElevationOnceToken/);
assert.match(appJs, /stripOwnerElevationOnceTags\(text\)/);
assert.match(appJs, /if \(member\.ownerElevationOnce\) clearOwnerElevationOnce\(\);/);
assert.equal(appJs.includes('showPushToast("本次高权限已授权"'), false);
assert.match(appJs, /const ownerElevationOnceTag = ownerElevationComposerAvailable\(\) \? ownerElevationOnceTagInfo\(text\) : null/);
assert.match(appJs, /function composerGatewayPermissionLabel\(\)/);
assert.match(appJs, /function activeRunGatewayPermissionLabel\(\)/);
assert.match(appJs, /function messageUsesHighPermissionGateway\(message = \{\}\)/);
assert.doesNotMatch(appJs, /Gateway 权限 高（运行中）/);
assert.doesNotMatch(appJs, /Gateway 权限 低（运行中）/);
assert.match(appJs, /\? \{ label: "Gateway 权限 高", tone: "active" \}/);
assert.match(appJs, /Gateway 权限 高（本次）/);
assert.match(appJs, /Gateway 权限 高（限时）/);
assert.match(appJs, /Gateway 权限 低/);
assert.equal(appJs.includes('showPushToast(body ? `${title}: ${body}` : title, "success")'), false);
assert.match(appJs, /Do not duplicate real Web Push notifications with an in-app toast/);
assert.match(appJs, /function applyReasoningInfo\(info = \{\}\)/);
assert.match(appJs, /state\.assistantLabel = String\(info\.assistantLabel/);
assert.match(appJs, /function renderUsage\(usage, message = \{\}\)/);
assert.match(appJs, /\["Model", usageModelLabel\(usage, message, apiCallRows\)\]/);
assert.match(appJs, /\["Reasoning", usageReasoningLabel\(usage, message, apiCallRows\)\]/);
assert.match(appJs, /function selectedComposerReasoningEffort\(text = getComposerText\(\)\)/);
assert.match(appJs, /const aiMention = composerAiMentionInfo\(text\)/);
assert.match(appJs, /const reasoningEffort = selectedComposerReasoningEffort\(text\)/);
assert.match(appJs, /if \(reasoningEffort\) body\.reasoning_effort = reasoningEffort/);

assert.equal(indexHtml.includes("taskReasoningSelect"), false);
assert.equal(stylesCss.includes("taskReasoningSelect"), false);
assert.equal(stylesCss.includes("reasoning-visible"), false);
assert.equal(appJs.includes('$("#taskReasoningSelect")'), false);
assert.equal(appJs.includes('"taskReasoningSelect"'), false);

console.log("composer AI mention UI tests passed");
