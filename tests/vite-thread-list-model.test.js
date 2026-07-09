"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/thread-list-model.mjs");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadModel() {
  return import(`${pathToFileURL(modelPath).href}?test=${Date.now()}-${Math.random()}`);
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
  await test("thread-list model stays browser-boundary free", () => {
    const source = read("src/vite-islands/chat-runtime/thread-list-model.mjs");
    assert.doesNotMatch(source, /\b(?:Window|window|document|localStorage|sessionStorage|fetch|setTimeout|setInterval|globalThis)\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("plans sidebar delegate, empty, and thread card states", async () => {
    const model = await loadModel();
    assert.equal(model.threadSidebarListPlan({ viewMode: "automation" }).delegate, "automation");
    assert.equal(model.threadSidebarListPlan({ viewMode: "single" }).clearList, true);
    assert.equal(model.threadSidebarListPlan({ viewMode: "project", threads: [] }).emptyText, "No threads in this project.");
    const plan = model.threadSidebarListPlan({
      viewMode: "project",
      currentThreadId: "thread-1",
      threads: [
        { id: "thread-1", title: "Main", preview: "Hello", status: "running", updatedAtLabel: "now" },
        { id: "topic-thread", singleWindowTask: true, sourceThreadId: "source", taskGroupId: "task-1", updatedAtLabel: "later" },
      ],
    });
    assert.equal(plan.version, model.THREAD_LIST_MODEL_VERSION);
    assert.deepEqual(plan.cards.map((card) => [card.type, card.active, card.title, card.meta]), [
      ["thread", true, "Main", "running | now"],
      ["projectTask", false, "task-1", "topic | idle | later"],
    ]);
  });

  await test("plans chat scope header and history pagers", async () => {
    const model = await loadModel();
    const header = model.chatScopeHeaderPlan({
      singleWindowChatView: true,
      hasThread: true,
      groupSelected: false,
      canSelectGroup: true,
      unread: { chat: 8, group: 120 },
    });
    assert.equal(header.visible, true);
    assert.deepEqual(header.buttons.map((button) => [button.scope, button.selected, button.disabled, button.unreadText, button.ariaLabel]), [
      ["chat", true, false, "", "聊天"],
      ["group", false, false, "99+", "群，99+条未读"],
    ]);
    assert.equal(model.chatHistoryPagerPlan({
      singleWindowChatView: true,
      page: { total: 10 },
      messageCount: 5,
    }).visible, true);
    assert.equal(model.taskHistoryPagerPlan({
      taskDetailView: true,
      page: { mode: "tasks", taskGroupId: "task-1", total: 5 },
      taskGroupId: "task-1",
      messageCount: 6,
      loading: false,
    }).visible, false);
    assert.equal(model.taskHistoryPagerPlan({
      taskDetailView: true,
      page: { mode: "tasks", taskGroupId: "task-1", total: 5 },
      taskGroupId: "task-1",
      messageCount: 6,
      loading: true,
    }).label, "加载中...");
  });

  await test("plans chat signatures, reuse, pending task messages, and directory signatures", async () => {
    const model = await loadModel();
    const signature = model.chatConversationRenderSignaturePlan({
      scope: "group",
      threadId: "thread-1",
      historyPager: "<pager>",
      searchOpen: true,
      searchQuery: "needle",
      searchIndex: 2,
      searchMatches: ["m1", "m2"],
      messages: [
        { id: "m1", role: "assistant", status: "running", content: "content", runProgress: { status: "running" } },
      ],
    }).signature;
    assert.match(signature, /"scope":"group"/);
    assert.equal(model.chatRenderReusePlan({
      singleWindowChatView: true,
      hasConversation: true,
      signature,
      existingSignature: signature,
      hasRenderedContent: true,
    }).reuse, true);
    assert.equal(model.taskGroupPendingMessagesPlan({
      taskGroupId: "task-1",
      thread: { messages: [{ taskGroupId: "task-1", status: "queued" }] },
    }).pending, true);
    assert.equal(model.directoryTopicRenderSignaturePlan({
      threadId: "thread-1",
      groups: [
        { id: "b", routeKey: "route-b", pluginTopic: true },
        { id: "a", routeKey: "route-a", sharedTopic: true, sourceThreadId: "source" },
      ],
    }).signature, "thread-1::a:route-a::shared:source|b:route-b:plugin::");
  });

  await test("plans current thread chrome and transient message projection", async () => {
    const model = await loadModel();
    assert.deepEqual(model.currentThreadChromePlan({ hasThread: false }).composer, {
      enabled: false,
      placeholder: "Message Home AI...",
    });
    const projection = model.chatMessageProjectionPlan({
      singleWindowChatView: true,
      displayMessages: [],
      sourceMessageCount: 2,
      hasRenderedMessages: true,
      pendingMessages: true,
      refreshInFlight: false,
    });
    assert.equal(projection.transientGap, true);
    assert.equal(projection.keepRendered, true);
    assert.equal(projection.emptyText, "Refreshing messages...");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
