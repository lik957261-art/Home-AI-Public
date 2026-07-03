"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadAdapter() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/navigation-shell/task-topic-compatibility-adapter.mjs",
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
  await test("task/topic compatibility adapter stays pure and browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/task-topic-compatibility-adapter.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
  });

  await test("adapter prefers classic taskListThread cache for task/topic roots", async () => {
    const adapter = await loadAdapter();
    const detailThread = {
      id: "thread_detail",
      singleWindow: true,
      messagesPage: { mode: "tasks", taskGroupId: "topic_detail" },
      taskGroups: [{ id: "topic_detail", title: "Detail" }],
    };
    const rootThread = {
      id: "thread_root",
      singleWindow: true,
      updatedAt: "2026-07-02T12:00:00.000Z",
      taskGroups: [{ id: "topic_root", title: "Root" }],
      pluginTopicGroups: [{ id: "plugin", pluginId: "wardrobe" }],
    };
    const selection = adapter.selectTaskTopicRootThread({
      currentThread: detailThread,
      taskListThread: rootThread,
      taskListThreadId: "thread_root",
    });
    assert.equal(selection.source, "state.taskListThread");
    assert.equal(selection.threadId, "thread_root");
    assert.equal(selection.usedTaskListThreadCache, true);
    assert.equal(selection.topicCount, 2);
  });

  await test("adapter skips ineligible task detail cache and falls back to current thread", async () => {
    const adapter = await loadAdapter();
    const ineligibleTaskListThread = {
      id: "thread_root_detail_page",
      singleWindow: true,
      messagesPage: { mode: "tasks", taskGroupId: "topic_a" },
      taskGroups: [{ id: "topic_a" }],
    };
    const currentThread = {
      id: "thread_current",
      singleWindow: true,
      taskGroups: [{ id: "topic_current" }],
    };
    const selection = adapter.selectTaskTopicRootThread({
      currentThread,
      taskListThread: ineligibleTaskListThread,
    });
    assert.equal(selection.source, "state.currentThread");
    assert.equal(selection.threadId, "thread_current");
    assert.equal(selection.usedTaskListThreadCache, false);
  });

  await test("compatibility state derives bounded task-list cache signature", async () => {
    const adapter = await loadAdapter();
    const rootThread = {
      id: "thread_root",
      singleWindow: true,
      updatedAt: "2026-07-02T12:00:00.000Z",
      taskGroups: [{ id: "topic_root" }],
      directoryTopicCollections: [{ key: "docs", groups: [{ id: "topic_root" }] }],
    };
    const compatible = adapter.buildTaskTopicCompatibilityState({
      currentThread: { id: "thread_detail", singleWindow: true },
      taskListThread: rootThread,
    });
    assert.equal(compatible.source, "state.taskListThread");
    assert.equal(compatible.state.currentThread.id, "thread_root");
    assert.equal(compatible.state.currentThreadId, "thread_root");
    assert.match(compatible.cacheSignature, /^thread_root:2:2026-07-02T12:00:00\.000Z$/);
    assert.equal(compatible.state.taskListRootCache.signature, compatible.cacheSignature);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
