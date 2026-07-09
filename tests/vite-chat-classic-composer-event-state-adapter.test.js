"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-composer-event-state-ui.js"), "utf8");

function createHarness(fakeModel = null) {
  const calls = [];
  const context = {
    console,
    Promise,
    globalThis: null,
    window: {
      __homeAiImportChatComposerEventStateModel(importPath) {
        context.importedPath = importPath;
        return Promise.resolve(fakeModel);
      },
    },
    state: {
      selectedWorkspaceId: "owner",
      viewMode: "tasks",
      currentThread: {
        id: "thread_current",
        singleWindow: true,
        messages: [{
          id: "assistant_existing",
          role: "assistant",
          status: "running",
          content: "old",
          createdAt: "2026-07-04T01:00:00.000Z",
        }],
      },
      threads: [{
        id: "thread_old",
        title: "Old",
        workspaceId: "owner",
        singleWindow: true,
        updatedAt: "2026-07-03T00:00:00.000Z",
      }],
      groupChatThread: {
        id: "thread_group",
        messages: [],
        updatedAt: "2026-07-03T00:00:00.000Z",
      },
      groupChatAvailable: false,
      groupChatThreadId: "",
      privateChatThread: {
        id: "thread_private",
        messages: [],
        updatedAt: "2026-07-03T00:00:00.000Z",
      },
    },
    threadGroupMemberIds(thread = {}) {
      calls.push(["members", thread.id || ""]);
      return thread.memberWorkspaceIds || [];
    },
    currentSearchText() {
      calls.push("search");
      return "";
    },
    taskListGroupsForThread() {
      calls.push("groups");
      return [];
    },
    taskMatchesDirectoryFilter() {
      return true;
    },
    taskDisplayId() {
      return "";
    },
    taskPrompt() {
      return "";
    },
    taskSummary() {
      return "";
    },
    renderThreads() {
      calls.push("renderThreads");
    },
    localPendingSendReplacedByIncoming() {
      return false;
    },
    mergeServerMessage(existing, incoming) {
      return Object.assign({}, existing || {}, incoming || {});
    },
    sortedThreadMessages(messages) {
      return messages.slice().sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    },
    currentTaskThreadIsSharedTopicThread() {
      calls.push("sharedTopic");
      return false;
    },
    rememberTaskListThread(thread) {
      calls.push(["remember", thread.id]);
    },
    offerOwnerElevationForMessage(message) {
      calls.push(["elevation", message.id]);
      return Promise.resolve();
    },
    showError(error) {
      calls.push(["error", error?.message || String(error || "")]);
    },
    invalidateComposerMessageProjection(message, options) {
      calls.push(["invalidate", message.id, options.existingIndex]);
    },
    isSingleWindowChatView() {
      calls.push("singleWindowChat");
      return true;
    },
    renderChatScopeHeader(thread) {
      calls.push(["chatScope", thread?.id || ""]);
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-composer-event-state-ui.js" });
  return { calls, context };
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
  await test("classic composer event-state adapter declares bounded ESM import path", () => {
    assert.match(source, /CHAT_COMPOSER_EVENT_STATE_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/chat-composer-event-state-model\/chat-composer-event-state-model\.js/);
    assert.match(source, /__homeAiImportChatComposerEventStateModel/);
    assert.match(source, /currentChatComposerEventStateModel/);
    assert.match(source, /threadMatchesSelectionPlan/);
    assert.match(source, /currentMessageUpsertPlan/);
    assert.match(source, /cachedChatScopeMessagePlan/);
  });

  await test("classic adapter consumes ESM model for thread summary upserts", async () => {
    const modelCalls = [];
    const fakeModel = {
      threadMatchesSelectionPlan(input = {}) {
        modelCalls.push(["match", input.threadId, input.selectedWorkspaceId]);
        return true;
      },
      threadSummaryUpsertPlan(input = {}) {
        modelCalls.push(["summary", input.existingIndex, input.matchesSelection]);
        return { action: "insert", shouldRenderThreads: true };
      },
    };
    const { calls, context } = createHarness(fakeModel);
    await context.importChatComposerEventStateModel(context.window);

    context.upsertThreadSummary({
      id: "thread_new",
      title: "New",
      workspaceId: "owner",
      singleWindow: true,
      updatedAt: "2026-07-04T00:00:00.000Z",
    });

    assert.equal(context.importedPath, "/vite-islands/chat-composer-event-state-model/chat-composer-event-state-model.js");
    assert.equal(context.state.threads[0].id, "thread_new");
    assert.ok(calls.includes("renderThreads"));
    assert.deepEqual(modelCalls, [
      ["match", "thread_new", "owner"],
      ["summary", -1, true],
    ]);
  });

  await test("classic adapter consumes ESM model for current message upsert actions", async () => {
    const fakeModel = {
      currentMessageUpsertPlan(input = {}) {
        assert.equal(input.currentThreadExists, true);
        assert.equal(input.messageExists, true);
        return {
          shouldUpsert: true,
          shouldRememberTaskListThread: true,
          shouldOfferOwnerElevation: true,
          shouldRenderThreads: true,
          shouldInvalidateProjection: true,
        };
      },
    };
    const { calls, context } = createHarness(fakeModel);
    await context.importChatComposerEventStateModel(context.window);

    context.upsertMessage({
      id: "assistant_existing",
      role: "assistant",
      status: "done",
      content: "new",
      createdAt: "2026-07-04T01:00:00.000Z",
    });

    assert.equal(context.state.currentThread.messages.length, 1);
    assert.equal(context.state.currentThread.messages[0].status, "done");
    assert.ok(calls.some((entry) => Array.isArray(entry) && entry[0] === "remember"));
    assert.ok(calls.includes("renderThreads"));
    assert.ok(calls.some((entry) => Array.isArray(entry) && entry[0] === "elevation"));
    assert.ok(calls.some((entry) => Array.isArray(entry) && entry[0] === "invalidate"));
  });

  await test("classic adapter consumes ESM model for cached chat-scope updates", async () => {
    const fakeModel = {
      cachedChatScopeMessagePlan(input = {}) {
        assert.equal(input.groupThreadMatches, true);
        assert.equal(input.privateThreadMatches, false);
        return {
          shouldUpdateGroupChat: true,
          shouldUpdatePrivateChat: false,
          touched: true,
          shouldRenderChatScopeHeader: true,
        };
      },
    };
    const { calls, context } = createHarness(fakeModel);
    await context.importChatComposerEventStateModel(context.window);

    const touched = context.upsertCachedChatScopeMessage("thread_group", {
      id: "message_group",
      role: "assistant",
      status: "done",
      createdAt: "2026-07-04T02:00:00.000Z",
    }, {
      updatedAt: "2026-07-04T02:00:01.000Z",
    });

    assert.equal(touched, true);
    assert.equal(context.state.groupChatAvailable, true);
    assert.equal(context.state.groupChatThreadId, "thread_group");
    assert.deepEqual(context.state.groupChatThread.messages.map((message) => message.id), ["message_group"]);
    assert.equal(context.state.privateChatThread.messages.length, 0);
    assert.ok(calls.some((entry) => Array.isArray(entry) && entry[0] === "chatScope"));
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
