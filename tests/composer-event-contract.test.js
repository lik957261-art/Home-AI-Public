"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assertIncludes(text, expected, label) {
  assert.ok(text.includes(expected), `${label} should include ${expected}`);
}

function createRuntimeContext() {
  const timers = new Map();
  const context = {
    console,
    Promise,
    Date,
    Math,
    Number,
    URLSearchParams,
    timers,
    nextTimerId: 0,
    renderCalls: [],
    refreshApiCalls: [],
    selfCheckCalls: [],
    runProgressCalls: [],
    streamRenderCalls: [],
    topicRefreshCalls: [],
    protectActive: true,
    state: {
      key: "",
      viewMode: "single",
      singleWindowMode: "chat",
      currentTaskGroupId: "",
      selectedWorkspaceId: "owner",
      currentThreadId: "thread_contract",
      primaryNavigationSeq: 0,
      threads: [],
      currentThreadRefreshSeq: 0,
      currentThread: {
        id: "thread_contract",
        singleWindow: true,
        status: "running",
        activeRunId: "run_contract",
        activeRunIds: ["run_contract"],
        updatedAt: "2026-07-01T01:00:00.000Z",
        messages: [{
          id: "assistant_contract",
          role: "assistant",
          status: "running",
          runId: "run_contract",
          content: "streaming answer",
          createdAt: "2026-07-01T01:00:01.000Z",
        }],
      },
    },
    window: {
      clearTimeout(id) {
        timers.delete(id);
      },
      setTimeout(fn, delay) {
        const id = ++context.nextTimerId;
        timers.set(id, { fn, delay });
        return id;
      },
    },
    $: () => ({
      scrollTop: 640,
      scrollHeight: 1200,
      clientHeight: 400,
      querySelector: () => null,
    }),
    conversationUserScrollProtectActive() {
      return context.protectActive;
    },
    conversationReadAnchorActive: () => false,
    isNearBottom: () => true,
    shouldForceChatStickToBottom: () => false,
    activeThreadRunIds(thread = {}) {
      const ids = [];
      if (thread.activeRunId) ids.push(thread.activeRunId);
      if (Array.isArray(thread.activeRunIds)) ids.push(...thread.activeRunIds);
      return Array.from(new Set(ids.filter(Boolean)));
    },
    isSingleWindowChatView: () => true,
    isTaskWindowView: () => false,
    chatMessagePageParams: () => "messageLimit=30",
    CHAT_MESSAGE_INITIAL_LIMIT: 30,
    TASK_MESSAGE_INITIAL_LIMIT: 30,
    currentSearchText: () => "",
    threadGroupMemberIds: () => [],
    isDraftThread: () => false,
    renderThreads: () => {},
    loadTodos: async () => {},
    handleClientVersion: () => {},
    upsertCachedChatScopeMessage: () => false,
    appendDelta: () => {},
    appendRunEventToCurrentThread: () => {},
    updateComposerAction: () => {},
    renderComposerContext: () => {},
    taskListRootRenderSignature: () => "",
    mergeTaskListThreadFromThreadUpdate: () => {},
    scheduleConversationViewportRefresh: () => {},
    taskListGroupsForThread: () => [],
    taskMatchesDirectoryFilter: () => true,
    taskDisplayId: () => "",
    taskPrompt: () => "",
    taskSummary: () => "",
    currentTaskThreadIsSharedTopicThread: () => false,
    rememberTaskListThread: () => {},
    offerOwnerElevationForMessage: () => Promise.resolve(),
    showError: (err) => {
      throw err;
    },
    localPendingSendReplacedByIncoming: () => false,
    mergeServerMessage: (existing, incoming) => Object.assign({}, existing || {}, incoming || {}),
    sortedThreadMessages: (messages) => messages.slice().sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || ""))),
    scheduleStreamingMessageRender(message) {
      context.streamRenderCalls.push({ id: message.id, status: message.status });
      return true;
    },
    scheduleRunProgressRenderForRun(runId) {
      context.runProgressCalls.push(runId);
      return true;
    },
    scheduleRenderCurrentThread() {
      context.renderCalls.push({ fullRender: true });
    },
    scheduleComposerTerminalSelfCheck(message) {
      context.selfCheckCalls.push({ id: message.id, status: message.status });
    },
    scheduleTopicRootListRefresh(delayMs) {
      context.topicRefreshCalls.push(delayMs);
    },
    mergeCurrentThread(thread = {}) {
      return Object.assign({}, context.state.currentThread, thread, {
        messages: Array.isArray(thread.messages) ? thread.messages : context.state.currentThread.messages,
      });
    },
    summarizeThread(thread = {}) {
      return {
        id: thread.id,
        status: thread.status,
        updatedAt: thread.updatedAt,
        activeRunId: thread.activeRunId,
        activeRunIds: thread.activeRunIds,
        singleWindow: thread.singleWindow,
        workspaceId: thread.workspaceId || "owner",
      };
    },
    renderCurrentThread(options = {}) {
      context.renderCalls.push({
        stickToBottom: Boolean(options.stickToBottom),
        messageCount: context.state.currentThread?.messages?.length || 0,
        hasUsage: Boolean(context.state.currentThread?.messages?.some((message) => message?.usage)),
      });
    },
    async api(url) {
      context.refreshApiCalls.push(url);
      return {
        thread: {
          id: "thread_contract",
          singleWindow: true,
          status: "done",
          activeRunId: "",
          activeRunIds: [],
          updatedAt: "2026-07-01T01:00:06.000Z",
          messages: [{
            id: "assistant_contract",
            role: "assistant",
            status: "done",
            runId: "run_contract",
            content: "final answer",
            usage: { totalTokens: 42 },
            createdAt: "2026-07-01T01:00:01.000Z",
            completedAt: "2026-07-01T01:00:05.000Z",
          }],
        },
      };
    },
  };
  context.globalThis = context;
  return context;
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

async function runTerminalSummaryScenario() {
  const context = createRuntimeContext();
  vm.createContext(context);
  for (const file of [
    "public/app-composer-refresh-scheduler.js",
    "public/app-composer-current-thread-refresh-ui.js",
    "public/app-composer-viewport-ui.js",
    "public/app-composer-message-invalidation-ui.js",
    "public/app-composer-event-state-ui.js",
    "public/app-events-composer-ui.js",
  ]) {
    vm.runInContext(read(file), context, { filename: file });
  }

  context.applyEvent({
    type: "thread.updated",
    thread: {
      id: "thread_contract",
      singleWindow: true,
      workspaceId: "owner",
      status: "done",
      activeRunId: "",
      activeRunIds: [],
      updatedAt: "2026-07-01T01:00:05.000Z",
    },
  });

  assert.equal(context.timers.size, 1, "terminal summary should schedule one detail refresh");
  const [timer] = Array.from(context.timers.values());
  assert.equal(timer.delay, 180, "terminal summary refresh should use bounded receipt delay");
  assert.equal(context.renderCalls.length, 0, "terminal summary should not repaint before detail receipt");

  await timer.fn();
  await flushMicrotasks();

  assert.deepEqual(context.refreshApiCalls, ["/api/threads/thread_contract?messageLimit=30"]);
  assert.equal(context.renderCalls.length, 1);
  assert.equal(context.renderCalls[0].stickToBottom, false, "protected user scroll must override terminal stick-to-bottom");
  assert.equal(context.renderCalls[0].hasUsage, true, "detail refresh should make terminal receipt metadata visible");
  assert.equal(context.state.currentThread.messages[0].usage.totalTokens, 42);
}

function verifyContractDocs() {
  const contractPath = "docs/IMPLEMENTATION_NOTES/composer-event-contract.md";
  const contract = read(contractPath);
  const docsIndex = read("docs/DOCS_INDEX.md");
  const staticClient = read("docs/MODULES/static-client.md");
  const map = read("docs/ARCHITECTURE_CODE_TEST_HARNESS_MAP.md");
  const testMatrix = read("docs/TEST_MATRIX.md");

  for (const marker of [
    "Run lifecycle",
    "Message delta",
    "Tool output / metadata",
    "Receipt",
    "Diagnostic",
    "composer_terminal_receipt_missing",
    "composer_scroll_protection_bypassed",
    "node tests/composer-event-contract.test.js",
  ]) {
    assertIncludes(contract, marker, contractPath);
  }
  for (const doc of [docsIndex, staticClient, map, testMatrix]) {
    assertIncludes(doc, contractPath, "Composer event contract linkage");
  }
}

(async () => {
  verifyContractDocs();
  await runTerminalSummaryScenario();
  console.log("composer event contract tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
