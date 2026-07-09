"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-events-composer-ui.js"), "utf8");

function createHarness(fakeModel = null) {
  const calls = [];
  const conversation = {
    scrollTop: 0,
    scrollHeight: 1000,
    clientHeight: 400,
    querySelector: () => null,
  };
  const context = {
    console,
    Promise,
    globalThis: null,
    window: {
      __homeAiImportChatComposerEventsModel(importPath) {
        context.importedPath = importPath;
        return Promise.resolve(fakeModel);
      },
    },
    state: {
      currentTaskGroupId: "",
      currentThread: {
        id: "thread-1",
        status: "running",
        activeRunIds: ["run-1"],
        messages: [{ id: "assistant-1", role: "assistant", status: "running", runId: "run-1" }],
      },
      currentThreadId: "thread-1",
      selectedWorkspaceId: "owner",
      singleWindowMode: "chat",
      threads: [],
      viewMode: "single",
    },
    $: (id) => (id === "conversation" ? conversation : null),
    handleClientVersion: (version, type) => calls.push(["clientVersion", version, type]),
    loadTodos: () => {
      calls.push("loadTodos");
      return Promise.resolve();
    },
    showError: (error) => {
      throw error;
    },
    isDraftThread: () => false,
    threadMatchesSelection: () => true,
    renderThreads: () => calls.push("renderThreads"),
    shouldRefreshCurrentThreadForSummary: () => false,
    requestCurrentThreadRefresh: (options) => calls.push(["refresh", options]),
    upsertThreadSummary: (thread) => calls.push(["summary", thread.id]),
    taskListRootRenderSignature: () => "",
    isCurrentTopicRootListView: () => false,
    summaryHasActiveRun: (thread) => Boolean(thread?.activeRunId || thread?.activeRunIds?.length),
    currentThreadHasPendingMessages: (thread) => Boolean(thread?.messages?.some((message) => ["queued", "running"].includes(message.status))),
    mergeCurrentThread: (thread) => Object.assign({}, context.state.currentThread, thread),
    mergeTaskListThreadFromThreadUpdate: (thread) => calls.push(["mergeTaskList", thread.id]),
    updateComposerAction: () => calls.push("updateComposerAction"),
    renderComposerContext: () => calls.push("renderComposerContext"),
    scheduleTopicRootListRefresh: (delay) => calls.push(["topicRefresh", delay]),
    rememberTaskListScrollPosition: () => calls.push("rememberScroll"),
    scheduleConversationViewportRefresh: () => calls.push("viewportRefresh"),
    renderCurrentThread: (options = {}) => calls.push(["renderCurrentThread", options]),
    appendDelta: (...args) => calls.push(["appendDelta", ...args]),
    appendRunEventToCurrentThread: (payload) => calls.push(["runEvent", payload.runId || ""]),
    upsertCachedChatScopeMessage: (...args) => calls.push(["cacheMessage", args[1]?.id || ""]),
    upsertMessage: (message) => calls.push(["upsertMessage", message.id]),
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-events-composer-ui.js" });
  return { calls, context };
}

function comparable(value) {
  return JSON.parse(JSON.stringify(value));
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

(async () => {
  await test("classic events composer adapter declares bounded ESM import path", () => {
    assert.match(source, /CHAT_COMPOSER_EVENTS_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/chat-composer-events-model\/chat-composer-events-model\.js/);
    assert.match(source, /__homeAiImportChatComposerEventsModel/);
    assert.match(source, /currentChatComposerEventsModel/);
    assert.match(source, /composerEventTypePlan/);
    assert.match(source, /currentThreadUpdatedEventPlan/);
  });

  await test("classic adapter consumes ESM model for todos refresh planning", async () => {
    const modelCalls = [];
    const fakeModel = {
      composerEventTypePlan(payload) {
        modelCalls.push(["type", payload.type]);
        return { valid: true, type: payload.type, clientVersion: "client-v1", clientVersionOnly: false, ignored: false };
      },
      todosUpdatedEventPlan(input) {
        modelCalls.push(["todos", input.viewMode, input.workspaceId]);
        return { shouldLoadTodos: true };
      },
    };
    const { calls, context } = createHarness(fakeModel);
    await context.importChatComposerEventsModel(context.window);
    context.state.viewMode = "single";
    context.applyEvent({ type: "todos.updated", workspaceId: "child", clientVersion: "ignored-by-model" });
    assert.equal(context.importedPath, "/vite-islands/chat-composer-events-model/chat-composer-events-model.js");
    assert.deepEqual(comparable(calls), [["clientVersion", "client-v1", "todos.updated"], "loadTodos"]);
    assert.deepEqual(comparable(modelCalls), [["type", "todos.updated"], ["todos", "single", "child"]]);
  });

  await test("classic adapter consumes ESM model for terminal thread.updated planning", async () => {
    const modelCalls = [];
    const fakeModel = {
      composerEventTypePlan(payload) {
        return { valid: true, type: payload.type, clientVersion: "", clientVersionOnly: false, ignored: false };
      },
      currentThreadUpdatedEventPlan(input) {
        modelCalls.push(["thread", input.beforeTaskRootSignature || "", input.afterTaskRootSignature || ""]);
        return {
          applies: true,
          wasRunning: true,
          terminalSummaryRefresh: true,
          shouldRefreshForSummary: false,
          refreshRequest: { stickToBottom: true, delayMs: 180 },
          outcome: "active_run_state",
        };
      },
    };
    const { calls, context } = createHarness(fakeModel);
    await context.importChatComposerEventsModel(context.window);
    context.applyEvent({
      type: "thread.updated",
      thread: { id: "thread-1", status: "done", activeRunId: "", activeRunIds: [] },
    });
    assert.deepEqual(comparable(calls), [
      ["summary", "thread-1"],
      ["mergeTaskList", "thread-1"],
      ["refresh", { stickToBottom: true, delayMs: 180 }],
      "updateComposerAction",
      "renderComposerContext",
      ["topicRefresh", 120],
    ]);
    assert.equal(modelCalls.length, 2);
  });

  await test("classic fallback remains usable without loaded ESM model", () => {
    const { calls, context } = createHarness({});
    context.chatComposerEventsModel = null;
    context.chatComposerEventsModelPromise = null;
    context.state.currentTaskGroupId = "task-a";
    context.applyEvent({
      type: "task.deleted",
      threadId: "thread-1",
      taskGroupId: "task-a",
      thread: { id: "thread-1", messages: [] },
    });
    assert.equal(context.state.currentTaskGroupId, "");
    assert.deepEqual(comparable(calls), [["summary", "thread-1"], "renderThreads", ["renderCurrentThread", { stickToBottom: true }]]);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
