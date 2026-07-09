"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-thread-state-ui.js"), "utf8");

function createElement() {
  const element = {
    dataset: { chatRenderSignature: "old" },
    textContent: "",
    innerHTML: "",
    scrollTop: 0,
    querySelector(selector) {
      if (selector === "[data-message-id]" && this.__hasMessage) return { dataset: { messageId: "m1" } };
      if (selector === ".directory-topic-launcher, [data-open-task], .empty-state" && this.__hasTaskRoot) return {};
      if (selector === "[data-retry-single-window-chat]") return { addEventListener() {} };
      return null;
    },
  };
  return element;
}

function createHarness(fakeModel = null) {
  const calls = [];
  const elements = new Map();
  const conversation = createElement();
  elements.set("conversation", conversation);
  elements.set("threadTitle", { textContent: "" });
  elements.set("threadMeta", { textContent: "" });
  elements.set("interruptRun", { disabled: false });
  const context = {
    console,
    Promise,
    JSON,
    Map,
    Set,
    window: {
      __homeAiImportThreadStateModel(importPath) {
        calls.push(["import", importPath]);
        return Promise.resolve(fakeModel);
      },
      clearTimeout() {},
      setTimeout(fn, delay) {
        calls.push(["setTimeout", delay]);
        return 1;
      },
    },
    localStorage: {
      setItem(key, value) {
        calls.push(["localStorage.setItem", key, value]);
      },
    },
    state: {
      singleWindowRequestSeq: 2,
      selectedWorkspaceId: "owner",
      viewMode: "single",
      singleWindowMode: "chat",
      groupChatOpen: false,
      currentTaskGroupId: "",
      currentThread: { id: "thread_before", messages: [] },
      currentThreadId: "thread_before",
      threads: [],
      singleWindowChatPendingRecoveryAttempts: 3,
    },
    MESSAGE_TIMESTAMP_FIELDS: ["createdAt", "updatedAt"],
    CHAT_MESSAGE_INITIAL_LIMIT: 30,
    TASK_MESSAGE_INITIAL_LIMIT: 80,
    GROUP_MESSAGE_REVOKED_TEXT: "revoked",
    $: (id) => elements.get(id) || null,
    activeChatRunIds: () => [],
    activeThreadRunIds: () => [],
    chatMessagesForThread: (thread) => thread?.messages || [],
    currentUserCanUseGroupChatThread: () => true,
    selectedWorkspaceInThreadGroup: () => false,
    taskDetailMessageInitialLimit: () => 12,
    mergeMessagesPage: (_existingPage, incomingPage) => incomingPage || null,
    localPendingSendReplacedByIncoming: () => false,
    shouldPreserveMessageOutsideIncomingPage: () => false,
    sortedThreadMessages: (messages) => messages,
    activeChatTaskGroupId: () => "chat",
    taskListGroupsForThread: () => [],
    sharedCaseTopicGroupsForTaskList: () => [],
    pluginTopicGroupsForTaskList: () => [],
    topicGroupVisibleInTaskList: () => true,
    taskMatchesDirectoryFilter: () => true,
    isPluginTopicTaskGroup: () => false,
    directoryTopicCollectionsForGroups: () => [],
    pluginTopicFilterDirectoryTopicCollectionsForRoot: (collections) => collections,
    directoryTopicCollectionGroupIds: () => new Set(),
    currentSearchText: () => "",
    messageDisplayTimestamp: () => "",
    renderThreads: () => calls.push(["renderThreads"]),
    renderCurrentThread: (options) => calls.push(["renderCurrentThread", options]),
    setComposerEnabled: (enabled) => calls.push(["setComposerEnabled", enabled]),
    configureComposer: (options) => calls.push(["configureComposer", options]),
    renderChatScopeHeader: (thread) => calls.push(["renderChatScopeHeader", thread?.id || null]),
    updateNavigationControls: () => calls.push(["updateNavigationControls"]),
    ensureVerticalScrollAffordance: () => calls.push(["ensureVerticalScrollAffordance"]),
    scheduleMessageScrollButtonVisibility: () => calls.push(["scheduleMessageScrollButtonVisibility"]),
    startupPerfMark: (name, payload) => calls.push(["startupPerfMark", name, payload]),
    startupPerfStep(_name, fn) {
      return Promise.resolve(fn());
    },
    api(pathValue, options) {
      calls.push(["api", pathValue, options]);
      return Promise.resolve({
        thread: {
          id: "thread_after",
          singleWindow: true,
          workspaceId: "owner",
          messages: [{ id: "m1", content: "hello", status: "done" }],
          messagesPage: { mode: "chat", total: 1 },
        },
        caseTopicThreads: [],
      });
    },
    mergeChatScopeThread: (_existingThread, incomingThread) => incomingThread,
    rememberChatScopeThread: (thread) => calls.push(["rememberChatScopeThread", thread?.id]),
    scheduleKanbanTopicCardSnapshotRefresh: () => calls.push(["scheduleKanbanTopicCardSnapshotRefresh"]),
    rememberTaskListThread: (thread) => calls.push(["rememberTaskListThread", thread?.id]),
    scheduleConversationViewportRefresh: () => calls.push(["scheduleConversationViewportRefresh"]),
    showError(error) {
      throw error;
    },
    escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    },
    __calls: calls,
    __conversation: conversation,
  };
  vm.createContext(context);
  vm.runInContext(`${source}
globalThis.__threadStateHarness = {
  THREAD_STATE_MODEL_ESM_PATH,
  importThreadStateModel,
  currentThreadStateModel,
  currentSingleWindowMessageMode,
  singleWindowRequestStillCurrent,
  singleWindowSurfaceCacheKeyForRequest,
  currentMainConversationSurfaceCacheKey,
  mainConversationSurfaceRequestForCurrentView,
  renderSingleWindowChatPendingShell,
  renderSingleWindowChatErrorShell,
  groupChatOpenLocalStoragePlan,
  setGroupChatOpenStorage,
  loadSingleWindow,
};`, context, { filename: "app-thread-state-ui.js" });
  return context;
}

async function flushImport() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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
  await test("classic thread-state adapter declares bounded ESM import path", () => {
    assert.match(source, /THREAD_STATE_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/thread-state-model\/thread-state-model\.js/);
    assert.match(source, /__homeAiImportThreadStateModel/);
    assert.match(source, /importThreadStateModel/);
    assert.match(source, /currentThreadStateModel/);
    assert.match(source, /singleWindowRequestStillCurrentPlan/);
    assert.match(source, /singleWindowRequestBodyPlan/);
    assert.match(source, /groupChatOpenStoragePlan/);
  });

  await test("classic adapter consumes ESM model for pure decisions", async () => {
    const modelCalls = [];
    const fakeModel = {
      currentSingleWindowMessageModePlan(input) {
        modelCalls.push(["mode", input.state.viewMode]);
        return { messageMode: "chat" };
      },
      singleWindowRequestStillCurrentPlan(input) {
        modelCalls.push(["fresh", input.request.seq]);
        return { stillCurrent: true };
      },
      singleWindowSurfaceCacheKeyPlan(input) {
        modelCalls.push(["cacheKey", input.request.messageMode]);
        return { key: "model-cache-key" };
      },
      currentMainConversationSurfaceCacheKeyPlan(input) {
        modelCalls.push(["currentCacheKey", input.directoryTopicDraftActive]);
        return { key: "model-current-cache-key" };
      },
      mainConversationSurfaceRequestPlan(input) {
        modelCalls.push(["surfaceRequest", input.messageMode]);
        return { request: { seq: 2, workspaceId: "owner", viewMode: "single", singleWindowMode: "chat", taskGroupId: "", messageMode: "chat", groupChat: false } };
      },
      singleWindowPendingShellPlan(input) {
        modelCalls.push(["pending", input.options.reason]);
        return { applies: true, resetRecoveryAttempts: true, reason: "model_pending", shouldScheduleRecovery: false };
      },
      singleWindowErrorShellPlan(input) {
        modelCalls.push(["error", input.error.code]);
        return { applies: true, status: "model_timeout", statusSuffix: " (model_timeout)" };
      },
      groupChatOpenStoragePlan(open) {
        modelCalls.push(["storage", open]);
        return { key: "hermesWebGroupChatOpen", value: open ? "1" : "0" };
      },
      singleWindowRequestPlan(input) {
        modelCalls.push(["request", input.options.reason]);
        return Object.freeze({
          request: Object.freeze({
            seq: 3,
            workspaceId: "owner",
            viewMode: "single",
            singleWindowMode: "chat",
            taskGroupId: "",
            messageMode: "chat",
            groupChat: false,
          }),
        });
      },
      singleWindowRequestBodyPlan(input) {
        modelCalls.push(["body", input.request.seq]);
        assert.equal(Object.isFrozen(input.request), false);
        return {
          path: "/api/single-window",
          method: "POST",
          timeoutMs: 12000,
          body: {
            workspaceId: "owner",
            groupChat: false,
            messageMode: "chat",
            taskGroupId: "",
            messageLimit: 30,
          },
        };
      },
      singleWindowRefreshRenderPlan(input) {
        modelCalls.push(["render", input.messageMode]);
        return { skipUnchangedChatRender: false, skipUnchangedTaskRender: false, restoreTaskListScrollTop: null };
      },
    };
    const context = createHarness(fakeModel);
    await context.__threadStateHarness.importThreadStateModel(context.window);

    assert.equal(context.__threadStateHarness.currentSingleWindowMessageMode(), "chat");
    assert.equal(context.__threadStateHarness.singleWindowRequestStillCurrent({ seq: 2, messageMode: "chat" }), true);
    assert.equal(context.__threadStateHarness.singleWindowSurfaceCacheKeyForRequest({ messageMode: "chat" }), "model-cache-key");
    assert.equal(context.__threadStateHarness.currentMainConversationSurfaceCacheKey(), "model-current-cache-key");
    assert.equal(context.__threadStateHarness.mainConversationSurfaceRequestForCurrentView().messageMode, "chat");
    assert.equal(context.__threadStateHarness.renderSingleWindowChatPendingShell({ reason: "adapter_test" }), true);
    assert.equal(context.state.singleWindowChatPendingRecoveryAttempts, 0);
    assert.equal(context.__threadStateHarness.renderSingleWindowChatErrorShell({ code: "timeout" }), true);
    assert.match(context.__conversation.innerHTML, /model_timeout/);
    context.__threadStateHarness.setGroupChatOpenStorage(true);

    await context.__threadStateHarness.loadSingleWindow({ skipSingleWindowCache: true, reason: "adapter_load" });
    const apiCall = context.__calls.find((call) => call[0] === "api");
    assert.equal(apiCall[1], "/api/single-window");
    assert.deepEqual(JSON.parse(apiCall[2].body), {
      workspaceId: "owner",
      groupChat: false,
      messageMode: "chat",
      taskGroupId: "",
      messageLimit: 30,
    });
    assert.equal(context.state.currentThread.id, "thread_after");
    assert.equal(context.state.currentThreadId, "thread_after");
    assert.ok(modelCalls.some((call) => call[0] === "request"));
    assert.ok(modelCalls.some((call) => call[0] === "body"));
    assert.ok(modelCalls.some((call) => call[0] === "render"));
    assert.ok(modelCalls.some((call) => call[0] === "storage"));
  });

  await test("classic fallback remains usable without loaded ESM model", async () => {
    const context = createHarness({});
    await flushImport();
    context.threadStateModel = null;
    context.threadStateModelPromise = null;

    assert.equal(context.__threadStateHarness.currentSingleWindowMessageMode(), "chat");
    assert.equal(context.__threadStateHarness.singleWindowRequestStillCurrent({
      seq: 2,
      workspaceId: "owner",
      viewMode: "single",
      singleWindowMode: "chat",
      messageMode: "chat",
      groupChat: false,
    }), true);
    assert.equal(context.__threadStateHarness.singleWindowSurfaceCacheKeyForRequest({
      workspaceId: "owner",
      messageMode: "chat",
      groupChat: false,
    }), "single:owner:chat:private");
    const storagePlan = context.__threadStateHarness.groupChatOpenLocalStoragePlan(false);
    assert.equal(storagePlan.key, "hermesWebGroupChatOpen");
    assert.equal(storagePlan.value, "0");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
