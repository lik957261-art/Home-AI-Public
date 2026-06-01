"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public", "app-event-stream-ui.js"), "utf8");

let renderCalls = 0;
let bottomStickCalls = 0;
const state = {
  currentThread: {
    id: "thread_chat",
    messages: [],
  },
  viewMode: "single",
  singleWindowMode: "chat",
  forceChatStickToBottomUntil: 0,
  conversationViewportBottomFollowUntil: 0,
  conversationViewportSettleUntil: 0,
  conversationPinnedToBottom: false,
};

const context = {
  console,
  Date,
  Math,
  state,
  renderCurrentThread(options = {}) {
    renderCalls += 1;
    context.lastRenderOptions = options;
  },
  scheduleConversationBottomStick() {
    bottomStickCalls += 1;
  },
  isSingleWindowChatView() {
    return state.viewMode === "single" && state.singleWindowMode === "chat";
  },
  activeChatTaskGroupId() {
    return "chat-default";
  },
};

vm.createContext(context);
vm.runInContext(`${source}
globalThis.pendingSendTestApi = {
  appendOptimisticSendMessages,
  clearOptimisticSendMessages,
  optimisticSendShouldAppendAssistant,
};`, context);

const {
  appendOptimisticSendMessages,
  clearOptimisticSendMessages,
  optimisticSendShouldAppendAssistant,
} = context.pendingSendTestApi;

const token = appendOptimisticSendMessages({ messageKind: "ai" }, "hello");
assert.ok(token);
assert.strictEqual(renderCalls, 1);
assert.strictEqual(bottomStickCalls, 1);
assert.strictEqual(state.currentThread.messages.length, 2);
assert.strictEqual(state.currentThread.messages.map((message) => message.role).join(","), "user,assistant");
assert.strictEqual(state.currentThread.messages[0].content, "hello");
assert.strictEqual(state.currentThread.messages[0].taskGroupId, "chat-default");
assert.strictEqual(state.currentThread.messages[1].status, "queued");
assert.strictEqual(state.currentThread.messages[1].taskGroupId, "chat-default");
assert.strictEqual(state.currentThread.messages[1].localPendingSend, true);
assert.ok(state.forceChatStickToBottomUntil > 0);

assert.strictEqual(clearOptimisticSendMessages(token, { render: false }), true);
assert.strictEqual(renderCalls, 1);
assert.strictEqual(state.currentThread.messages.length, 0);

const plainToken = appendOptimisticSendMessages({ messageKind: "plain" }, "plain group note");
assert.ok(plainToken);
assert.strictEqual(state.currentThread.messages.length, 1);
assert.strictEqual(state.currentThread.messages[0].role, "user");
assert.strictEqual(optimisticSendShouldAppendAssistant({ messageKind: "plain" }), false);

assert.strictEqual(clearOptimisticSendMessages(plainToken), true);
assert.strictEqual(renderCalls, 3);
assert.strictEqual(state.currentThread.messages.length, 0);

console.log("composer send pending feedback tests passed");
