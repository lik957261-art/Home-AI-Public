"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const context = {
  console,
  state: {
    viewMode: "single",
    singleWindowMode: "chat",
    currentTaskGroupId: "",
    currentThread: null,
    threads: [],
  },
  streamRenderCalls: [],
  runProgressCalls: [],
  refreshCalls: [],
  selfCheckCalls: [],
  fullRenderCalls: 0,
  renderThreadCalls: 0,
  protectActive: false,
  nearBottom: true,
  $: () => ({ scrollHeight: 1200, scrollTop: 900, clientHeight: 300 }),
  isNearBottom() {
    return context.nearBottom;
  },
  shouldForceChatStickToBottom: () => false,
  conversationReadAnchorActive: () => false,
  conversationUserScrollProtectActive() {
    return context.protectActive;
  },
  localPendingSendReplacedByIncoming: () => false,
  sortedThreadMessages: (messages) => messages.slice().sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || ""))),
  mergeServerMessage(existing, incoming) {
    return Object.assign({}, existing || {}, incoming || {});
  },
  currentTaskThreadIsSharedTopicThread: () => false,
  rememberTaskListThread: () => {},
  offerOwnerElevationForMessage: () => Promise.resolve(),
  showError: () => {},
  renderThreads() {
    context.renderThreadCalls += 1;
  },
  scheduleStreamingMessageRender(message) {
    context.streamRenderCalls.push({ id: message?.id, status: message?.status });
    return true;
  },
  scheduleRunProgressRenderForRun(runId) {
    context.runProgressCalls.push(runId);
    return true;
  },
  scheduleRenderCurrentThread() {
    context.fullRenderCalls += 1;
  },
  requestCurrentThreadRefresh(options = {}) {
    context.refreshCalls.push(options);
  },
  scheduleComposerTerminalSelfCheck(message = {}) {
    context.selfCheckCalls.push({ id: message.id, status: message.status });
  },
  threadGroupMemberIds: () => [],
  currentSearchText: () => "",
  isSingleWindowChatView: () => true,
  taskListGroupsForThread: () => [],
  taskMatchesDirectoryFilter: () => true,
  taskDisplayId: () => "",
  taskPrompt: () => "",
  taskSummary: () => "",
  renderChatScopeHeader: () => {},
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(repoRoot, "public", "app-composer-viewport-ui.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(repoRoot, "public", "app-composer-message-invalidation-ui.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(repoRoot, "public", "app-composer-event-state-ui.js"), "utf8"), context);

function resetThread(status = "running") {
  context.state.currentThread = {
    id: "thread_receipt",
    activeRunId: "run_receipt",
    activeRunIds: ["run_receipt"],
    messages: [
      {
        id: "user_receipt",
        role: "user",
        status: "done",
        content: "prompt",
        createdAt: "2026-06-30T10:00:00.000Z",
      },
      {
        id: "assistant_receipt",
        role: "assistant",
        status,
        runId: "run_receipt",
        content: "streamed text",
        createdAt: "2026-06-30T10:00:01.000Z",
      },
    ],
  };
  context.streamRenderCalls = [];
  context.runProgressCalls = [];
  context.refreshCalls = [];
  context.selfCheckCalls = [];
  context.fullRenderCalls = 0;
  context.renderThreadCalls = 0;
  context.protectActive = false;
  context.nearBottom = true;
}

resetThread();
context.upsertMessage({
  id: "assistant_receipt",
  role: "assistant",
  status: "done",
  runId: "run_receipt",
  content: "final receipt",
  usage: { totalTokens: 42 },
  createdAt: "2026-06-30T10:00:01.000Z",
  completedAt: "2026-06-30T10:00:08.000Z",
});
assert.deepEqual(context.streamRenderCalls, [{ id: "assistant_receipt", status: "done" }]);
assert.deepEqual(context.runProgressCalls, []);
assert.equal(context.fullRenderCalls, 0);
assert.equal(context.refreshCalls.length, 1);
assert.equal(context.refreshCalls[0].delayMs, 0);
assert.equal(context.refreshCalls[0].stickToBottom, true);
assert.deepEqual(context.selfCheckCalls, [{ id: "assistant_receipt", status: "done" }]);
assert.equal(context.state.currentThread.messages[1].usage.totalTokens, 42);
assert.equal(context.state.currentThread.messages[1].status, "done");

resetThread();
context.protectActive = true;
context.upsertMessage({
  id: "assistant_receipt",
  role: "assistant",
  status: "done",
  runId: "run_receipt",
  content: "final receipt",
  createdAt: "2026-06-30T10:00:01.000Z",
});
assert.equal(context.refreshCalls.length, 1);
assert.equal(context.refreshCalls[0].stickToBottom, false);

resetThread();
context.nearBottom = false;
context.upsertMessage({
  id: "assistant_receipt",
  role: "assistant",
  status: "done",
  runId: "run_receipt",
  content: "final receipt",
  createdAt: "2026-06-30T10:00:01.000Z",
});
assert.equal(context.refreshCalls.length, 1);
assert.equal(context.refreshCalls[0].stickToBottom, false);

resetThread();
context.upsertMessage({
  id: "assistant_receipt",
  role: "assistant",
  status: "running",
  runId: "run_receipt",
  content: "new streamed text",
  createdAt: "2026-06-30T10:00:01.000Z",
});
assert.deepEqual(context.streamRenderCalls, [{ id: "assistant_receipt", status: "running" }]);
assert.deepEqual(context.runProgressCalls, ["run_receipt"]);
assert.equal(context.refreshCalls.length, 0);
assert.equal(context.fullRenderCalls, 0);

context.scheduleStreamingMessageRender = () => false;
resetThread();
context.upsertMessage({
  id: "assistant_receipt",
  role: "assistant",
  status: "done",
  runId: "run_receipt",
  content: "final receipt",
  createdAt: "2026-06-30T10:00:01.000Z",
});
assert.equal(context.fullRenderCalls, 1);
assert.equal(context.refreshCalls.length, 1);
assert.equal(context.refreshCalls[0].delayMs, 0);

console.log("composer message invalidation UI tests passed");
