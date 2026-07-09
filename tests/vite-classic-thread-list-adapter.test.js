"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-thread-list-ui.js"), "utf8");

function createElement() {
  return {
    innerHTML: "",
    hidden: false,
    dataset: {},
    listeners: [],
    querySelector(selector) {
      if (selector === "[data-message-id], .chat-history-pager, .empty-state" && this.innerHTML) return {};
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener(type, handler) {
      this.listeners.push([type, handler]);
    },
    setAttribute(name, value) {
      this[name] = value;
    },
  };
}

function createHarness(fakeModel = null) {
  const calls = [];
  const elements = {
    threadList: createElement(),
    chatScopeHeader: createElement(),
  };
  const context = {
    console,
    Promise,
    Date,
    globalThis: null,
    window: {
      __homeAiImportThreadListModel(importPath) {
        calls.push(["import", importPath]);
        return Promise.resolve(fakeModel);
      },
    },
    state: {
      viewMode: "project",
      singleWindowMode: "chat",
      threads: [],
      currentThreadId: "thread-1",
      chatSearchOpen: false,
      chatSearchIndex: 0,
      chatSearchMatches: [],
      olderChatMessagesLoading: false,
      olderTaskMessagesLoading: false,
    },
    $: (id) => elements[id] || createElement(),
    escapeHtml(value) {
      return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    },
    formatTime(value) {
      return value ? `fmt:${value}` : "";
    },
    renderAutomationView: () => calls.push(["renderAutomationView"]),
    renderActionInboxView: () => calls.push(["renderActionInboxView"]),
    renderTodoList: () => calls.push(["renderTodoList"]),
    renderDirectorySidebar: () => calls.push(["renderDirectorySidebar"]),
    openProjectTask: () => Promise.resolve(),
    selectThread: () => Promise.resolve(),
    showError: (error) => calls.push(["showError", error?.message || error]),
    isSingleWindowChatView: () => true,
    ensureChatScopeReadBaselines: () => calls.push(["ensureChatScopeReadBaselines"]),
    markActiveChatScopeRead: () => calls.push(["markActiveChatScopeRead"]),
    isGroupChatView: () => false,
    groupChatSelectable: () => true,
    unreadChatScopeCount: (_thread, scope) => (scope === "group" ? 12 : 0),
    chatMessagesForThread: (thread) => thread?.messages || [],
    isTaskDetailView: () => true,
    isChatSearchMode: () => false,
    taskGroupMessagesForThread: (thread) => thread?.taskMessages || [],
    currentChatSearchQuery: () => "query",
    activeChatScope: () => "chat",
    directoryTopicPrimaryRoute: (group) => group.route || null,
    directoryTopicRouteKey: (route) => route?.key || "",
    __calls: calls,
    __elements: elements,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${source}
globalThis.__threadListHarness = {
  THREAD_LIST_MODEL_ESM_PATH,
  importThreadListModel,
  currentThreadListModel,
  renderThreads,
  renderChatScopeHeader,
  renderChatHistoryPager,
  renderTaskHistoryPager,
  chatConversationRenderSignature,
  chatMessagesAlreadyRendered,
  taskGroupHasPendingMessages,
  directoryTopicRenderSignature,
};`, context, { filename: "app-thread-list-ui.js" });
  return context;
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
  await test("classic thread-list adapter declares bounded ESM import path", () => {
    assert.match(source, /THREAD_LIST_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/thread-list-model\/thread-list-model\.js/);
    assert.match(source, /__homeAiImportThreadListModel/);
    assert.match(source, /importThreadListModel/);
    assert.match(source, /currentThreadListModel/);
    assert.match(source, /threadSidebarListPlan/);
    assert.match(source, /chatConversationRenderSignaturePlan/);
  });

  await test("classic adapter consumes ESM model for pure thread-list plans", async () => {
    const modelCalls = [];
    const fakeModel = {
      threadSidebarListPlan(input) {
        modelCalls.push(["threadSidebarListPlan", input.currentThreadId]);
        return {
          cards: [
            { type: "thread", id: "model-thread", active: true, title: "Model Thread", preview: "Model preview", meta: "model | now" },
          ],
        };
      },
      chatScopeHeaderPlan(input) {
        modelCalls.push(["chatScopeHeaderPlan", input.unread.group]);
        return {
          visible: true,
          buttons: [
            { scope: "chat", label: "Model Chat", selected: true, disabled: false, unreadText: "", ariaLabel: "Model Chat" },
            { scope: "group", label: "Model Group", selected: false, disabled: false, unreadText: "12", ariaLabel: "Model Group，12条未读" },
          ],
        };
      },
      chatHistoryPagerPlan() {
        modelCalls.push(["chatHistoryPagerPlan"]);
        return { visible: true, disabled: true, label: "Model loading" };
      },
      taskHistoryPagerPlan() {
        modelCalls.push(["taskHistoryPagerPlan"]);
        return { visible: true, disabled: false, label: "Model older" };
      },
      chatConversationRenderSignaturePlan(input) {
        modelCalls.push(["chatConversationRenderSignaturePlan", input.threadId]);
        return { signature: "model-signature" };
      },
      chatRenderReusePlan(input) {
        modelCalls.push(["chatRenderReusePlan", input.signature]);
        return { reuse: true };
      },
      taskGroupPendingMessagesPlan(input) {
        modelCalls.push(["taskGroupPendingMessagesPlan", input.taskGroupId]);
        return { pending: true };
      },
      directoryTopicRenderSignaturePlan(input) {
        modelCalls.push(["directoryTopicRenderSignaturePlan", input.threadId]);
        return { signature: "model-directory-signature" };
      },
    };
    const context = createHarness(fakeModel);
    await context.__threadListHarness.importThreadListModel(context.window);
    context.state.threads = [{ id: "thread-1", title: "Classic", updatedAt: "now" }];
    context.__threadListHarness.renderThreads();
    assert.match(context.__elements.threadList.innerHTML, /Model Thread/);
    context.__threadListHarness.renderChatScopeHeader({ id: "thread-1" });
    assert.match(context.__elements.chatScopeHeader.innerHTML, /Model Group/);
    assert.match(context.__threadListHarness.renderChatHistoryPager({ messages: [] }), /Model loading/);
    assert.match(context.__threadListHarness.renderTaskHistoryPager({ messagesPage: { mode: "tasks", taskGroupId: "task-1" } }, "task-1"), /Model older/);
    assert.equal(context.__threadListHarness.chatConversationRenderSignature([], ""), "model-signature");
    assert.equal(context.__threadListHarness.chatMessagesAlreadyRendered({ dataset: { chatRenderSignature: "x" }, querySelector: () => ({}) }, "x"), true);
    assert.equal(context.__threadListHarness.taskGroupHasPendingMessages({}, "task-1"), true);
    assert.equal(context.__threadListHarness.directoryTopicRenderSignature("thread-1", []), "model-directory-signature");
    assert.ok(modelCalls.some((call) => call[0] === "threadSidebarListPlan"));
    assert.ok(context.__calls.some((call) => call[0] === "import" && call[1] === "/vite-islands/thread-list-model/thread-list-model.js"));
  });

  await test("classic adapter preserves legacy behavior before model load", () => {
    const context = createHarness(null);
    context.state.threads = [
      { id: "thread-1", title: "Classic", preview: "Preview", status: "idle", updatedAt: "t1" },
      { id: "thread-2", singleWindowTask: true, sourceThreadId: "source", taskGroupId: "task-1", status: "running", updatedAt: "t2" },
    ];
    context.__threadListHarness.renderThreads();
    assert.match(context.__elements.threadList.innerHTML, /Classic/);
    assert.match(context.__elements.threadList.innerHTML, /data-project-task-thread="source"/);
    context.__threadListHarness.renderChatScopeHeader({ id: "thread-1" });
    assert.match(context.__elements.chatScopeHeader.innerHTML, /data-chat-scope="group"/);
    assert.match(context.__threadListHarness.renderChatHistoryPager({ messagesPage: { total: 2 }, messages: [{}] }), /Load earlier messages/);
    assert.equal(context.__threadListHarness.taskGroupHasPendingMessages({
      messages: [{ taskGroupId: "task-1", status: "running" }],
    }, "task-1"), true);
    assert.equal(context.__threadListHarness.directoryTopicRenderSignature("thread-1", [
      { id: "g1", route: { key: "route" }, sharedTopic: true },
    ]), "thread-1::g1:route::shared:");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
