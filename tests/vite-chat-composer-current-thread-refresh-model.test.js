"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/composer-current-thread-refresh-model.mjs");

async function loadModel() {
  return import(pathToFileURL(modelPath).href);
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
  const model = await loadModel();

  await test("current-thread refresh model stays browser-global free", () => {
    const source = fs.readFileSync(modelPath, "utf8");
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bdocument\s*\./);
    assert.doesNotMatch(source, /\blocalStorage\b/);
    assert.doesNotMatch(source, /\bfetch\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
  });

  await test("route snapshot and match planning preserve navigation guards", () => {
    const state = {
      viewMode: "single",
      singleWindowMode: "chat",
      currentTaskGroupId: "",
      selectedWorkspaceId: "owner",
      currentThreadId: "thread_1",
      currentThread: { id: "thread_1" },
      primaryNavigationSeq: 2,
    };
    const snapshot = model.currentThreadRouteSnapshotPlan({ state }).snapshot;
    assert.deepEqual(snapshot, {
      viewMode: "single",
      singleWindowMode: "chat",
      currentTaskGroupId: "",
      selectedWorkspaceId: "owner",
      currentThreadId: "thread_1",
      primaryNavigationSeq: 2,
    });
    assert.equal(model.currentThreadRouteMatchesPlan({ state, snapshot }).matches, true);
    assert.equal(model.currentThreadRouteMatchesPlan({
      state: Object.assign({}, state, { primaryNavigationSeq: 3 }),
      snapshot,
    }).matches, false);
    assert.equal(model.currentThreadRouteMatchesPlan({
      state: Object.assign({}, state, { currentThreadId: "thread_2" }),
      snapshot,
    }).matches, false);
  });

  await test("pending message and summary refresh planning preserve terminal receipt rules", () => {
    const thread = {
      id: "thread_1",
      updatedAt: "2026-07-04T10:00:00.000Z",
      messages: [
        { role: "assistant", status: "completed", runId: "run_done" },
        { role: "assistant", status: "running", runId: "run_live" },
      ],
    };
    assert.equal(model.currentThreadHasPendingMessagesPlan({ thread, activeRunIds: [] }).hasPendingMessages, true);
    assert.equal(model.currentThreadHasPendingMessagesPlan({
      thread: { id: "thread_2", messages: [{ role: "user", status: "running", runId: "user_run" }] },
      activeRunIds: ["user_run"],
    }).hasPendingMessages, true);
    assert.equal(model.summaryHasActiveRunPlan({ summary: { status: "running" } }).hasActiveRun, true);
    assert.equal(model.summaryHasActiveRunPlan({ summary: { status: "completed" } }).hasActiveRun, false);
    assert.equal(model.shouldRefreshCurrentThreadForSummaryPlan({
      summary: { id: "thread_1", updatedAt: "2026-07-04T10:01:00.000Z" },
      currentThread: thread,
      currentThreadHasPendingMessages: false,
    }).shouldRefresh, true);
    assert.equal(model.shouldRefreshCurrentThreadForSummaryPlan({
      summary: { id: "thread_1", updatedAt: "2026-07-04T09:59:00.000Z", status: "completed" },
      currentThread: thread,
      currentThreadHasPendingMessages: true,
    }).shouldRefresh, true);
    assert.equal(model.shouldRefreshCurrentThreadForSummaryPlan({
      summary: { id: "other", updatedAt: "2026-07-04T10:01:00.000Z" },
      currentThread: thread,
      currentThreadHasPendingMessages: true,
    }).shouldRefresh, false);
  });

  await test("refresh delay and due-at planning stay bounded", () => {
    assert.equal(model.currentThreadRefreshDelayPlan({ options: { delayMs: 0 } }).delayMs, 0);
    assert.equal(model.currentThreadRefreshDelayPlan({ options: { delayMs: -5 } }).delayMs, 0);
    assert.equal(model.currentThreadRefreshDelayPlan({ options: {} }).delayMs, 120);
    assert.deepEqual(model.currentThreadRefreshDueAtPlan({
      nowMs: 1000,
      options: { delayMs: 80 },
    }), {
      version: model.CHAT_COMPOSER_CURRENT_THREAD_REFRESH_MODEL_VERSION,
      dueAt: 1080,
      delayMs: 80,
    });
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
