"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadModel() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/navigation-shell/task-topic-cache-reconciliation-model.mjs",
  )).href;
  return import(`${url}?test=${Date.now()}-${Math.random()}`);
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
  await test("cache reconciliation model stays pure and browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/task-topic-cache-reconciliation-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
  });

  await test("root read patch updates task-list root cache and clears selected detail cache", async () => {
    const model = await loadModel();
    const rootThread = {
      id: "thread_root",
      messagesPage: { mode: "tasks", taskGroupId: "", total: 4, loaded: 4 },
      taskGroups: [{ id: "topic_root" }],
    };
    const patch = model.buildTaskTopicReadStatePatch({
      ok: true,
      thread: rootThread,
      threadId: "thread_root",
      selectedTaskGroupId: "",
      messageMode: "tasks",
      messageCount: 4,
      totalMessageCount: 4,
      loadedMessageCount: 4,
      source: "thread_view_service_fixture",
    });

    assert.equal(patch.taskTopicReadStatus, "ok");
    assert.equal(patch.taskTopicReadTaskGroupId, "");
    assert.equal(patch.taskListThread, rootThread);
    assert.equal(patch.taskListThreadId, "thread_root");
    assert.equal(patch.taskListRootCache.signature, "thread_root:root");
    assert.equal(patch.taskTopicSelectedThread, null);
    assert.equal(patch.taskTopicSelectedThreadId, "");
    assert.equal(patch.taskTopicSelectedCache, null);
  });

  await test("selected topic read patch does not overwrite root task-list thread", async () => {
    const model = await loadModel();
    const rootThread = { id: "thread_root", taskGroups: [{ id: "topic_root" }] };
    const selectedThread = {
      id: "thread_root",
      messagesPage: { mode: "tasks", taskGroupId: "topic_docs", total: 3, loaded: 2 },
      messages: [{ id: "msg_2" }, { id: "msg_3" }],
      taskGroups: [{ id: "topic_docs" }],
    };
    const patch = model.buildTaskTopicReadStatePatch({
      ok: true,
      thread: selectedThread,
      threadId: "thread_root",
      selectedTaskGroupId: "topic_docs",
      messageMode: "tasks",
      messageCount: 3,
      totalMessageCount: 3,
      loadedMessageCount: 2,
      hasMoreBefore: true,
      oldestMessageId: "msg_2",
      newestMessageId: "msg_3",
      source: "thread_view_service_fixture",
    }, {
      taskListThread: rootThread,
      taskListRootCache: { signature: "thread_root:root" },
    });

    assert.equal(patch.taskTopicReadStatus, "ok");
    assert.equal(patch.taskTopicReadTaskGroupId, "topic_docs");
    assert.equal(patch.taskTopicReadTotalMessageCount, 3);
    assert.equal(patch.taskTopicReadLoadedMessageCount, 2);
    assert.equal(patch.taskTopicReadHasMoreBefore, true);
    assert.equal(patch.taskTopicSelectedThread, selectedThread);
    assert.equal(patch.taskTopicSelectedThreadId, "thread_root");
    assert.equal(patch.taskTopicSelectedCache.signature, "thread_root:topic_docs");
    assert.equal(Object.prototype.hasOwnProperty.call(patch, "taskListThread"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(patch, "taskListRootCache"), false);

    const nextState = Object.assign({}, {
      taskListThread: rootThread,
      taskListRootCache: { signature: "thread_root:root" },
    }, patch);
    assert.equal(nextState.taskListThread, rootThread);
    assert.equal(nextState.taskListRootCache.signature, "thread_root:root");
    assert.equal(nextState.taskTopicSelectedThread, selectedThread);
  });

  await test("failure patches preserve existing thread caches", async () => {
    const model = await loadModel();
    const patch = model.buildTaskTopicReadStatePatch({
      ok: false,
      skipped: false,
      error: "server busy",
      request: { taskGroupId: "topic_docs" },
      source: "thread_read_api",
    });
    assert.equal(patch.taskTopicReadStatus, "error");
    assert.equal(patch.taskTopicReadError, "server busy");
    assert.equal(patch.taskTopicReadTaskGroupId, "topic_docs");
    assert.equal(Object.prototype.hasOwnProperty.call(patch, "taskListThread"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(patch, "taskTopicSelectedThread"), false);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
