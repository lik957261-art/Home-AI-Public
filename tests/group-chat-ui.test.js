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
assert.match(appJs, /return \[virtualAssistantMember\(\), \.\.\.realMembers\]/);
assert.match(appJs, /groupChatMentionMembers\(state\.currentThread, \{ includeAi: false \}\)/);
assert.match(indexHtml, /id="chatScopeHeader"/);
assert.match(appJs, /function renderChatScopeHeader\(thread\)/);
assert.match(appJs, /function wireChatScopeHeader\(root\)/);
assert.match(appJs, /function unreadChatScopeCount\(thread, scope\)/);
assert.match(appJs, /hermesChatScopeRead:/);
assert.match(appJs, /chat-scope-header-badge/);
assert.match(appJs, /function selectChatScope\(scope\)/);
assert.match(appJs, /await selectChatScope\(isGroupChatView\(\) \? "chat" : "group"\)/);
assert.match(appJs, /toggleGroupChat\.hidden = true/);
assert.doesNotMatch(appJs, /function renderChatScopeSwitcher/);
assert.doesNotMatch(appJs, /function wireChatScopeSwitcher/);
assert.doesNotMatch(stylesCss, /\.chat-scope-switcher/);
assert.match(stylesCss, /\.chat-scope-header/);
assert.match(stylesCss, /\.chat-scope-header-badge/);

assert.equal(indexHtml.includes("chatAiToggle"), false);
assert.equal(appJs.includes("chatAiToggle"), false);
assert.equal(stylesCss.includes("chat-ai-toggle"), false);

console.log("group-chat UI tests passed");
