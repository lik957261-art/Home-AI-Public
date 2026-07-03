"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadDataSource() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/navigation-shell/task-topic-data-source.mjs",
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
  await test("task/topic data source stays pure and browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/task-topic-data-source.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
  });

  await test("read request targets the existing read-only thread endpoint", async () => {
    const dataSource = await loadDataSource();
    const request = dataSource.taskTopicReadRequest({
      taskListThreadId: "thread_root",
    });
    assert.equal(request.ok, true);
    assert.equal(request.method, "GET");
    assert.equal(request.source, "thread_read_api");
    assert.equal(request.threadId, "thread_root");
    assert.equal(request.path, "/api/threads/thread_root?messageMode=tasks&messageLimit=30");

    const scoped = dataSource.taskTopicReadRequest({
      taskListThreadId: "thread_root",
      currentTaskGroupId: "topic_docs",
    }, {
      messageLimit: 8,
    });
    assert.equal(scoped.path, "/api/threads/thread_root?messageMode=tasks&messageLimit=8&taskGroupId=topic_docs");
  });

  await test("missing thread id and missing api are explicit skipped states", async () => {
    const dataSource = await loadDataSource();
    const missing = dataSource.taskTopicReadRequest({});
    assert.equal(missing.ok, false);
    assert.equal(missing.skipReason, "missing_thread_id");

    const skipped = await dataSource.loadTaskTopicRootThread({
      state: { taskListThreadId: "thread_root" },
    });
    assert.equal(skipped.ok, false);
    assert.equal(skipped.skipped, true);
    assert.equal(skipped.error, "api_unavailable");
  });

  await test("loader normalizes thread payloads and keeps request evidence", async () => {
    const dataSource = await loadDataSource();
    const calls = [];
    const result = await dataSource.loadTaskTopicRootThread({
      state: { taskListThreadId: "thread_root" },
      taskGroupId: "topic_docs",
      api: async (pathValue, options) => {
        calls.push({ pathValue, options });
        return {
          ok: true,
          source: "vite_dev_preview_mock",
          mockVersion: "mock-v1",
          thread: {
            id: "thread_root",
            messagesPage: {
              mode: "tasks",
              taskGroupId: "topic_docs",
              total: 5,
              loaded: 2,
              limit: 30,
              hasMoreBefore: true,
              oldestMessageId: "msg_old",
              newestMessageId: "msg_new",
            },
            messages: [{ id: "msg_old" }, { id: "msg_new" }],
            taskGroups: [{ id: "topic_docs", title: "Docs" }],
          },
        };
      },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].pathValue, "/api/threads/thread_root?messageMode=tasks&messageLimit=30&taskGroupId=topic_docs");
    assert.deepEqual(calls[0].options, { method: "GET" });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, false);
    assert.equal(result.threadId, "thread_root");
    assert.equal(result.selectedTaskGroupId, "topic_docs");
    assert.equal(result.messageMode, "tasks");
    assert.equal(result.messageCount, 5);
    assert.equal(result.totalMessageCount, 5);
    assert.equal(result.loadedMessageCount, 2);
    assert.equal(result.hasMoreBefore, true);
    assert.equal(result.oldestMessageId, "msg_old");
    assert.equal(result.newestMessageId, "msg_new");
    assert.equal(result.source, "vite_dev_preview_mock");
    assert.equal(result.mockVersion, "mock-v1");
    assert.equal(result.request.source, "thread_read_api");
  });

  await test("message count prefers bounded arrays before total metadata", async () => {
    const dataSource = await loadDataSource();
    assert.equal(dataSource.threadReadMessageCount({ messages: [{}, {}, {}], messagesPage: { total: 9 } }), 3);
    assert.equal(dataSource.threadReadMessageCount({ items: [{}, {}], messagesPage: { total: 9 } }), 2);
    assert.equal(dataSource.threadReadMessageCount({ messagesPage: { items: [{}], total: 9 } }), 1);
    assert.equal(dataSource.threadReadMessageCount({ messagesPage: { messages: [{}, {}], total: 9 } }), 2);
    assert.equal(dataSource.threadReadMessageCount({ messagesPage: { total: 9 } }), 9);
    assert.equal(dataSource.threadReadMessageCount({ messagesPage: { total: -1 } }), 0);
  });

  await test("loader reports real thread-read pagination totals separately from loaded messages", async () => {
    const dataSource = await loadDataSource();
    const thread = {
      id: "thread_root",
      messages: [{ id: "msg_1" }, { id: "msg_2" }],
      messagesPage: {
        mode: "tasks",
        taskGroupId: "topic_docs",
        total: 12,
        loaded: 2,
        hasMoreBefore: true,
        oldestMessageId: "msg_1",
        newestMessageId: "msg_2",
      },
    };
    assert.equal(dataSource.threadReadTotalMessageCount(thread), 12);
    assert.equal(dataSource.threadReadLoadedMessageCount(thread), 2);
    const normalized = dataSource.normalizeThreadReadPayload({ thread }, { taskGroupId: "topic_docs" });
    assert.equal(normalized.messageCount, 12);
    assert.equal(normalized.totalMessageCount, 12);
    assert.equal(normalized.loadedMessageCount, 2);
    assert.equal(normalized.hasMoreBefore, true);
  });

  await test("loader returns bounded failures from api errors or malformed payloads", async () => {
    const dataSource = await loadDataSource();
    const malformed = await dataSource.loadTaskTopicRootThread({
      state: { taskListThreadId: "thread_root" },
      api: async () => ({ ok: true, source: "vite_dev_preview_mock" }),
    });
    assert.equal(malformed.ok, false);
    assert.equal(malformed.error, "thread_payload_missing");

    const failed = await dataSource.loadTaskTopicRootThread({
      state: { taskListThreadId: "thread_root" },
      api: async () => {
        const error = new Error("server busy");
        error.status = 503;
        throw error;
      },
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.skipped, false);
    assert.equal(failed.error, "server busy");
    assert.equal(failed.status, 503);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
