"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const appJs = fs.readFileSync(path.join(repoRoot, "public", "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(repoRoot, "public", "index.html"), "utf8");
const stylesCss = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");

assert.match(appJs, /VIRTUAL_GROUP_AI_MEMBER/);
assert.match(appJs, /function groupChatMentionsAi\(text\)/);
assert.match(appJs, /body\.messageKind = aiMention\.mentionsAi \? "ai" : "plain"/);
assert.match(appJs, /return \[VIRTUAL_GROUP_AI_MEMBER, \.\.\.realMembers\]/);
assert.match(appJs, /groupChatMentionMembers\(state\.currentThread, \{ includeAi: false \}\)/);

assert.equal(indexHtml.includes("chatAiToggle"), false);
assert.equal(appJs.includes("chatAiToggle"), false);
assert.equal(stylesCss.includes("chat-ai-toggle"), false);

console.log("group-chat UI tests passed");
