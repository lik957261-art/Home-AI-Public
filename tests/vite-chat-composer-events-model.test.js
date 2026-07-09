"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/composer-events-model.mjs");

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

  await test("composer events model stays browser-global free", () => {
    const source = fs.readFileSync(modelPath, "utf8");
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bdocument\s*\./);
    assert.doesNotMatch(source, /\blocalStorage\b/);
    assert.doesNotMatch(source, /\bfetch\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
  });

  await test("classifies event type and todos refresh decisions", () => {
    assert.equal(model.composerEventTypePlan({ type: "client.version", clientVersion: "v1" }).clientVersionOnly, true);
    assert.equal(model.composerEventTypePlan({ type: "learning-coins.updated" }).ignored, true);
    assert.equal(model.composerEventTypePlan({}).valid, false);
    assert.equal(model.todosUpdatedEventPlan({
      type: "todos.updated",
      viewMode: "todos",
      workspaceId: "owner",
      selectedWorkspaceId: "owner",
    }).shouldLoadTodos, true);
    assert.equal(model.todosUpdatedEventPlan({
      type: "todos.updated",
      viewMode: "single",
      workspaceId: "owner",
      selectedWorkspaceId: "owner",
    }).shouldLoadTodos, false);
  });

  await test("plans terminal thread.updated refresh and render outcomes", () => {
    const terminal = model.currentThreadUpdatedEventPlan({
      type: "thread.updated",
      threadId: "thread-1",
      currentThreadId: "thread-1",
      currentThreadHasPendingMessages: true,
      summaryHasRunningState: false,
      shouldRefreshForSummary: false,
      currentTaskGroupId: "plugin:wardrobe",
      viewMode: "tasks",
      singleWindowMode: "task",
    });
    assert.equal(terminal.applies, true);
    assert.equal(terminal.wasRunning, true);
    assert.equal(terminal.terminalSummaryRefresh, true);
    assert.deepEqual(terminal.refreshRequest, { stickToBottom: true, delayMs: 180 });
    assert.equal(terminal.outcome, "active_run_state");

    const stableRoot = model.currentThreadUpdatedEventPlan({
      type: "thread.updated",
      threadId: "thread-1",
      currentThreadId: "thread-1",
      beforeTaskRootSignature: "same",
      afterTaskRootSignature: "same",
      topicRootPresent: true,
    });
    assert.equal(stableRoot.outcome, "preserve_topic_root");
  });

  await test("plans task and message event projection", () => {
    assert.deepEqual(model.currentTaskEventPlan({
      type: "task.deleted",
      threadId: "thread-1",
      currentThreadId: "thread-1",
      taskGroupId: "task-a",
      currentTaskGroupId: "task-a",
    }), {
      version: model.CHAT_COMPOSER_EVENTS_MODEL_VERSION,
      applies: true,
      action: "task_deleted",
      clearCurrentTaskGroupId: true,
      stickToBottom: true,
    });
    const message = model.currentMessageEventPlan({
      hasMessage: true,
      hasThread: true,
      threadId: "thread-1",
      currentThreadId: "thread-1",
    });
    assert.equal(message.shouldUpsertCachedChatScopeMessage, true);
    assert.equal(message.shouldUpsertCurrentMessage, true);
    assert.equal(message.shouldApplyThreadSummary, true);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
