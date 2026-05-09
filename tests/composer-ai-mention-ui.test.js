"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const appJs = fs.readFileSync(path.join(repoRoot, "public", "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(repoRoot, "public", "index.html"), "utf8");
const stylesCss = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");

assert.match(appJs, /const AI_MENTION_OPTIONS = Object\.freeze/);
assert.match(appJs, /mentionText: "@AI \\u9ad8"/);
assert.match(appJs, /function composerAiMentionInfo\(text\)/);
assert.match(appJs, /function composerMentionAvailable\(\)/);
assert.match(appJs, /return state\.viewMode === "single" \|\| state\.viewMode === "tasks"/);
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
