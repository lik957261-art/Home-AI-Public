"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public", "app-run-progress-ui.js"), "utf8");

const testState = {
  runProgressRenderLastAt: new Map(),
  runProgressRenderScheduled: new Set(),
  runProgressTicker: 0,
  conversationPinnedToBottom: false,
  conversationViewportBottomFollowUntil: 0,
  suppressConversationPinUntil: 0,
};
let followConversationBottom = true;
let scrollCalls = 0;
let visibilityCalls = 0;
const fakeConversation = {
  scrollHeight: 1000,
  scrollTop: 700,
  clientHeight: 300,
  querySelector(selector) {
    if (selector === ".run-progress-panel") return fakeBody.inserted ? {} : null;
    return null;
  },
  querySelectorAll() { return []; },
};
const fakeContent = {
  insertAdjacentHTML(_position, html) {
    fakeBody.inserted = html;
    fakeConversation.scrollHeight = 1250;
  },
};
const fakeBody = {
  inserted: "",
  querySelector(selector) {
    if (selector === ".run-progress-panel.inline") return null;
    if (selector === ".text-content") return fakeContent;
    return null;
  },
  insertAdjacentHTML(_position, html) {
    this.inserted = html;
    fakeConversation.scrollHeight = 1250;
  },
};
const fakeArticle = {
  querySelector(selector) {
    return selector === ".message-body" ? fakeBody : null;
  },
};

const context = {
  console,
  Date,
  document: {},
  state: testState,
  window: {
    clearInterval() {},
    setInterval() { return 1; },
    setTimeout(fn) { fn(); return 1; },
  },
  requestAnimationFrame(fn) { fn(); },
  $() { return fakeConversation; },
  escapeHtml(value) {
    return String(value ?? "");
  },
  conversationViewportRefreshApplies() { return true; },
  shouldFollowConversationBottomDuringViewport() { return followConversationBottom; },
  scrollConversationToBottom() {
    scrollCalls += 1;
    fakeConversation.scrollTop = fakeConversation.scrollHeight;
    testState.conversationPinnedToBottom = true;
  },
  messageElementById(messageId) { return messageId === "msg_current" ? fakeArticle : null; },
  scheduleRenderCurrentThread() {},
  scheduleMessageScrollButtonVisibility() { visibilityCalls += 1; },
};

vm.createContext(context);
vm.runInContext(`${source}
globalThis.runProgressTestApi = {
  messageForRunProgress,
  renderMessageRunProgress,
  runProgressEvents,
  messageOwnRunIds,
  threadActiveRunIds,
  messageRunProgressIds,
  rememberMessageRunProgressId,
  renderMessageRunProgressInPlace,
  shouldKeepRunProgressPinnedToBottom,
};`, context);

const {
  messageForRunProgress,
  renderMessageRunProgress,
  runProgressEvents,
  messageOwnRunIds,
  threadActiveRunIds,
  messageRunProgressIds,
  rememberMessageRunProgressId,
  renderMessageRunProgressInPlace,
  shouldKeepRunProgressPinnedToBottom,
} = context.runProgressTestApi;

const thread = {
  id: "thread_current",
  activeRunId: "resp_current",
  activeRunIds: ["resp_current"],
  messages: [
    {
      id: "msg_old_terminal",
      role: "assistant",
      status: "done",
      runId: "resp_old",
      originalRunId: "web_old",
      responseRunId: "resp_old",
      createdAt: "2026-05-27T12:00:00.000Z",
    },
    {
      id: "msg_current",
      role: "assistant",
      status: "running",
      taskId: "web_current",
      originalRunId: "web_current",
      responseRunId: "resp_current",
      runId: "resp_current",
      createdAt: "2026-05-27T12:32:12.079Z",
      startedAt: "2026-05-27T12:32:12.894Z",
    },
  ],
  events: [
    {
      runId: "web_current",
      event: "run.context_ready",
      tool: "hermes_mobile",
      timestamp: "2026-05-27T12:32:13.555Z",
      preview: "context",
    },
    {
      runId: "web_current",
      event: "run.request_sent",
      tool: "hermes_mobile",
      timestamp: "2026-05-27T12:32:18.967Z",
      preview: "sent",
    },
    {
      runId: "resp_current",
      event: "run.model_stream_started",
      tool: "hermes_mobile",
      timestamp: "2026-05-27T12:32:20.553Z",
      preview: "",
    },
    {
      runId: "resp_current",
      event: "response.output_item.added",
      tool: "function_call",
      timestamp: "2026-05-27T12:32:28.423Z",
      preview: JSON.stringify({ name: "search_files" }),
    },
    {
      runId: "resp_current",
      event: "response.output_item.done",
      tool: "function_call_output",
      timestamp: "2026-05-27T12:32:29.423Z",
      preview: JSON.stringify({ callId: "call_search_files" }),
    },
    {
      runId: "resp_current",
      event: "response.output_item.added",
      tool: "function_call",
      timestamp: "2026-05-27T12:32:30.423Z",
      preview: { name: "image_edit", callId: "call_image_1" },
    },
    {
      runId: "resp_current",
      event: "response.output_item.done",
      tool: "function_call_output",
      timestamp: "2026-05-27T12:32:31.423Z",
      preview: { callId: "call_image_1" },
    },
  ],
};

assert.deepStrictEqual(Array.from(messageOwnRunIds(thread.messages[1])), ["web_current", "resp_current"]);
assert.deepStrictEqual(Array.from(threadActiveRunIds(thread)), ["resp_current"]);
assert.strictEqual(messageForRunProgress(thread, "resp_current")?.id, "msg_current");
assert.strictEqual(messageForRunProgress(thread, "web_current")?.id, "msg_current");

const fallbackThread = {
  id: "thread_pending",
  activeRunId: "resp_pending",
  activeRunIds: ["resp_pending"],
  messages: [
    { id: "msg_old_terminal", role: "assistant", status: "done", runId: "resp_old" },
    { id: "msg_active_pending_ids", role: "assistant", status: "running" },
  ],
};

assert.strictEqual(messageForRunProgress(fallbackThread, "resp_pending")?.id, "msg_active_pending_ids");
assert.strictEqual(messageForRunProgress(fallbackThread, "resp_missing"), null);

const currentRunEvents = runProgressEvents(thread, ["web_current", "resp_current"]);
assert.strictEqual(currentRunEvents.length, 7);

const html = renderMessageRunProgress(thread, thread.messages[1]);
assert.match(html, /Function search_files/);
assert.match(html, /Function result search_files/);
assert.match(html, /Function image_edit/);
assert.match(html, /Function result image_edit/);
assert.match(html, /\u8bf7\u6c42\u5df2\u53d1\u9001/);
assert.match(html, /\u6a21\u578b\u6d41\u5df2\u8fde\u63a5/);
assert.ok(html.indexOf("\u8bf7\u6c42\u5df2\u53d1\u9001") < html.indexOf("\u6a21\u578b\u6d41\u5df2\u8fde\u63a5"));
assert.ok(html.indexOf("\u6a21\u578b\u6d41\u5df2\u8fde\u63a5") < html.indexOf("Function search_files"));

const unrelatedActiveThread = {
  id: "thread_unrelated_active",
  activeRunId: "resp_slow",
  activeRunIds: ["resp_slow"],
  messages: [
    {
      id: "msg_slow",
      role: "assistant",
      status: "running",
      runId: "resp_slow",
      responseRunId: "resp_slow",
      startedAt: "2026-05-27T12:00:00.000Z",
    },
    {
      id: "msg_fast",
      role: "assistant",
      status: "running",
      taskId: "web_fast",
      originalRunId: "web_fast",
      responseRunId: "resp_fast",
      runId: "resp_fast",
      startedAt: "2026-05-27T12:01:05.000Z",
    },
  ],
  events: [
    {
      runId: "resp_slow",
      event: "response.output_item.added",
      tool: "function_call",
      timestamp: "2026-05-27T12:00:30.000Z",
      preview: JSON.stringify({ name: "slow_search" }),
    },
    {
      runId: "web_fast",
      event: "run.request_sent",
      tool: "hermes_mobile",
      timestamp: "2026-05-27T12:01:05.500Z",
    },
    {
      runId: "resp_fast",
      event: "response.output_item.added",
      tool: "function_call",
      timestamp: "2026-05-27T12:01:06.000Z",
      preview: JSON.stringify({ name: "wardrobe_test" }),
    },
  ],
};

const fastHtml = renderMessageRunProgress(unrelatedActiveThread, unrelatedActiveThread.messages[1]);
assert.match(fastHtml, /Function wardrobe_test/);
assert.doesNotMatch(fastHtml, /slow_search/);

const pendingThread = {
  id: "thread_pending_response",
  activeRunId: "resp_pending",
  activeRunIds: ["resp_pending"],
  messages: [
    {
      id: "msg_pending",
      role: "assistant",
      status: "running",
      taskId: "web_pending",
      originalRunId: "web_pending",
      runId: "web_pending",
      startedAt: "2026-05-27T12:02:00.000Z",
    },
  ],
  events: [
    {
      runId: "web_pending",
      event: "run.request_sent",
      tool: "hermes_mobile",
      timestamp: "2026-05-27T12:02:00.500Z",
    },
    {
      runId: "resp_pending",
      event: "run.model_stream_started",
      tool: "hermes_mobile",
      timestamp: "2026-05-27T12:02:01.000Z",
    },
  ],
};

const pendingMessage = messageForRunProgress(pendingThread, "resp_pending");
assert.strictEqual(pendingMessage?.id, "msg_pending");
assert.deepStrictEqual(Array.from(messageRunProgressIds(pendingThread, pendingMessage)), ["web_pending"]);
rememberMessageRunProgressId(pendingThread, pendingMessage, "resp_pending");
assert.deepStrictEqual(Array.from(messageRunProgressIds(pendingThread, pendingMessage)), ["web_pending", "resp_pending"]);
assert.match(renderMessageRunProgress(pendingThread, pendingMessage), /\u6a21\u578b\u6d41\u5df2\u8fde\u63a5/);

fakeBody.inserted = "";
fakeConversation.scrollHeight = 1000;
fakeConversation.scrollTop = 700;
followConversationBottom = true;
scrollCalls = 0;
visibilityCalls = 0;
assert.strictEqual(shouldKeepRunProgressPinnedToBottom(fakeConversation), true);
assert.strictEqual(renderMessageRunProgressInPlace(thread, thread.messages[1]), true);
assert.match(fakeBody.inserted, /run-progress-panel/);
assert.ok(scrollCalls >= 2);
assert.strictEqual(fakeConversation.scrollTop, fakeConversation.scrollHeight);
assert.strictEqual(testState.conversationPinnedToBottom, true);
assert.ok(testState.conversationViewportBottomFollowUntil >= Date.now());
assert.ok(visibilityCalls >= 1);

fakeBody.inserted = "";
fakeConversation.scrollHeight = 1000;
fakeConversation.scrollTop = 300;
testState.conversationPinnedToBottom = false;
testState.conversationViewportBottomFollowUntil = 0;
followConversationBottom = false;
scrollCalls = 0;
assert.strictEqual(shouldKeepRunProgressPinnedToBottom(fakeConversation), false);
assert.strictEqual(renderMessageRunProgressInPlace(thread, thread.messages[1]), true);
assert.strictEqual(scrollCalls, 0);
assert.strictEqual(fakeConversation.scrollTop, 300);

console.log("run progress UI behavior assertions passed");
