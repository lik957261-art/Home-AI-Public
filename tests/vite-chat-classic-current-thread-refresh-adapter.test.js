"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-composer-current-thread-refresh-ui.js"), "utf8");

function createHarness(fakeModel) {
  const timers = new Map();
  let nextTimerId = 0;
  const context = {
    console,
    Date: Object.assign(function DateShim(...args) {
      return args.length ? new Date(...args) : new Date(1000);
    }, Date, {
      now: () => 1000,
    }),
    Promise,
    JSON,
    URLSearchParams,
    encodeURIComponent,
    timers,
    globalThis: null,
    window: {
      clearTimeout(id) {
        timers.delete(id);
      },
      setTimeout(fn, delay) {
        const id = ++nextTimerId;
        timers.set(id, { fn, delay });
        return id;
      },
      __homeAiImportChatComposerCurrentThreadRefreshModel(importPath) {
        context.importedPath = importPath;
        return Promise.resolve(fakeModel);
      },
    },
    state: {
      viewMode: "single",
      singleWindowMode: "chat",
      currentTaskGroupId: "",
      selectedWorkspaceId: "owner",
      currentThreadId: "thread_refresh",
      currentThread: {
        id: "thread_refresh",
        updatedAt: "2026-07-04T10:00:00.000Z",
        messages: [{ role: "assistant", status: "running", runId: "run_live" }],
      },
      currentThreadRefreshDueAt: 0,
      currentThreadRefreshSeq: 0,
      primaryNavigationSeq: 1,
    },
    activeThreadRunIds: () => [],
    isSingleWindowChatView: () => true,
    isTaskWindowView: () => false,
    isCurrentTopicRootListView: () => false,
    chatMessagePageParams: () => "limit=30",
    CHAT_MESSAGE_INITIAL_LIMIT: 30,
    TASK_MESSAGE_INITIAL_LIMIT: 30,
    api() {
      return Promise.resolve({ thread: context.state.currentThread });
    },
    mergeCurrentThread(thread) {
      return thread;
    },
    summarizeThread(thread) {
      return { id: thread.id };
    },
    upsertThreadSummary() {},
    renderCurrentThread() {},
    showError(error) {
      throw error;
    },
    shouldForceChatStickToBottom: () => false,
    isNearBottom: () => false,
    conversationUserScrollProtectActive: () => false,
    $() {
      return null;
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-composer-current-thread-refresh-ui.js" });
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
  await test("classic current-thread refresh adapter declares bounded ESM import path", () => {
    assert.match(source, /CHAT_COMPOSER_CURRENT_THREAD_REFRESH_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/chat-composer-current-thread-refresh-model\/chat-composer-current-thread-refresh-model\.js/);
    assert.match(source, /__homeAiImportChatComposerCurrentThreadRefreshModel/);
    assert.match(source, /currentChatComposerCurrentThreadRefreshModel/);
    assert.match(source, /currentThreadRouteSnapshotPlan/);
    assert.match(source, /shouldRefreshCurrentThreadForSummaryPlan/);
  });

  await test("classic adapter consumes ESM model for route and summary refresh decisions", async () => {
    const calls = [];
    const fakeModel = {
      currentThreadRouteSnapshotPlan(input) {
        calls.push(["snapshot", input.state.currentThreadId]);
        return { snapshot: { viewMode: "single", currentThreadId: "from_model", primaryNavigationSeq: 4 } };
      },
      currentThreadRouteMatchesPlan(input) {
        calls.push(["matches", input.snapshot?.currentThreadId]);
        return { matches: input.snapshot?.currentThreadId === "from_model" };
      },
      currentThreadHasPendingMessagesPlan(input) {
        calls.push(["pending", input.thread?.id]);
        return { hasPendingMessages: true };
      },
      summaryHasActiveRunPlan(input) {
        calls.push(["summary_active", input.summary?.status]);
        return { hasActiveRun: false };
      },
      shouldRefreshCurrentThreadForSummaryPlan(input) {
        calls.push(["summary_refresh", input.summary?.id, input.currentThreadHasPendingMessages]);
        return { shouldRefresh: true };
      },
      currentThreadRefreshDelayPlan(input) {
        calls.push(["delay", input.options?.delayMs]);
        return { delayMs: 75 };
      },
      currentThreadRefreshDueAtPlan(input) {
        calls.push(["due", input.nowMs]);
        return { dueAt: 1075, delayMs: 75 };
      },
    };
    const context = createHarness(fakeModel);
    await context.importChatComposerCurrentThreadRefreshModel(context.window);

    assert.deepEqual(context.currentThreadRouteSnapshot(), {
      viewMode: "single",
      currentThreadId: "from_model",
      primaryNavigationSeq: 4,
    });
    assert.equal(context.currentThreadRouteMatches({ currentThreadId: "from_model" }), true);
    assert.equal(context.currentThreadRouteMatches({ currentThreadId: "other" }), false);
    assert.equal(context.currentThreadHasPendingMessages(), true);
    assert.equal(context.summaryHasActiveRun({ status: "completed" }), false);
    assert.equal(context.shouldRefreshCurrentThreadForSummary({ id: "thread_refresh" }), true);
    assert.equal(context.currentThreadRefreshDelayMs({ delayMs: 200 }), 75);
    context.requestCurrentThreadRefresh({ delayMs: 200 });
    assert.equal(context.state.currentThreadRefreshDueAt, 1075);
    assert.equal(context.timers.size, 1);
    assert.deepEqual(calls.map((entry) => entry[0]), [
      "snapshot",
      "matches",
      "matches",
      "pending",
      "summary_active",
      "pending",
      "summary_refresh",
      "delay",
      "delay",
      "due",
      "snapshot",
    ]);
  });

  await test("classic fallback remains usable without loaded ESM model", () => {
    const context = createHarness({});
    context.chatComposerCurrentThreadRefreshModel = null;
    context.chatComposerCurrentThreadRefreshModelPromise = null;
    const snapshot = context.currentThreadRouteSnapshot();
    assert.equal(snapshot.currentThreadId, "thread_refresh");
    assert.equal(context.currentThreadRouteMatches(snapshot), true);
    assert.equal(context.currentThreadHasPendingMessages(), true);
    assert.equal(context.summaryHasActiveRun({ status: "running" }), true);
    assert.equal(context.currentThreadRefreshDelayMs({ delayMs: 20 }), 20);
    context.requestCurrentThreadRefresh({ delayMs: 20 });
    assert.equal(context.state.currentThreadRefreshDueAt, 1020);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
