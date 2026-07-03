"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadDetailModel() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/chat-runtime/chat-detail-model.mjs",
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

function fixtureThread() {
  return {
    id: "thread_1",
    singleWindow: true,
    activeRunId: "run_1",
    activeRunIds: ["run_1"],
    messages: [
      {
        id: "m1",
        role: "user",
        status: "done",
        content: "任务消息",
        taskGroupId: "task_1",
        createdAt: "2026-07-02T12:00:00.000Z",
      },
      {
        id: "m2",
        role: "assistant",
        status: "running",
        content: "处理中",
        taskGroupId: "task_1",
        createdAt: "2026-07-02T12:00:01.000Z",
      },
      {
        id: "m3",
        role: "assistant",
        status: "done",
        content: "其它 topic",
        taskGroupId: "task_2",
        createdAt: "2026-07-02T12:00:02.000Z",
      },
      {
        id: "local_send_assistant",
        role: "assistant",
        status: "queued",
        taskGroupId: "task_1",
        localPendingSend: true,
        createdAt: "2026-07-02T12:00:03.000Z",
      },
    ],
  };
}

(async () => {
  await test("chat detail model stays pure and browser-boundary free", async () => {
    const source = read("src/vite-islands/chat-runtime/chat-detail-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
    assert.doesNotMatch(source, /EventSource/);
  });

  await test("chat detail projection filters selected task group and exposes bounded rows", async () => {
    const model = await loadDetailModel();
    const view = model.buildChatDetailViewModel({
      thread: fixtureThread(),
      taskGroupId: "task_1",
      composer: {
        enabled: true,
        text: "",
      },
    });

    assert.equal(view.threadId, "thread_1");
    assert.equal(view.taskGroupId, "task_1");
    assert.equal(view.rowCount, 3);
    assert.deepEqual(view.rows.map((row) => row.id), ["m1", "m2", "local_send_assistant"]);
    assert.equal(view.activeCount, 2);
    assert.equal(view.pendingCount, 1);
    assert.equal(view.latestMessageId, "local_send_assistant");
    assert.equal(view.latestContentPreview, "正在准备模型回复");
    assert.equal(view.rows[1].tone, "active");
    assert.equal(view.rows[2].tone, "pending");
  });

  await test("chat detail projection includes composer action state", async () => {
    const model = await loadDetailModel();
    const view = model.buildChatDetailViewModel({
      thread: fixtureThread(),
      composer: {
        enabled: true,
        text: "",
        activeRunIds: ["run_1"],
        singleWindowView: true,
      },
    });

    assert.equal(view.composer.mode, "stop");
    assert.equal(view.composer.label, "停止");
    assert.equal(view.composer.disabled, false);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
