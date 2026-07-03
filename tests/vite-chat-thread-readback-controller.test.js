"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadController() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/chat-runtime/thread-readback-controller.mjs",
  )).href;
  return import(`${url}?test=${Date.now()}-${Math.random()}`);
}

function baseState() {
  return {
    thread: {
      id: "thread_1",
      status: "running",
      activeRunId: "run_1",
      activeRunIds: ["run_1"],
      messages: [
        { id: "msg_user_1", role: "user", status: "done", content: "before" },
        { id: "msg_assistant_1", role: "assistant", status: "running", content: "partial" },
      ],
    },
    latestEventType: "message.delta",
    refreshRequests: [
      { reason: "terminal_summary", runId: "run_1", stickToBottom: true, delayMs: 180 },
    ],
    renderPatches: [
      { type: "streaming_patch", messageId: "msg_assistant_1" },
    ],
    diagnostics: [],
  };
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
  await test("thread readback controller stays pure and browser-boundary free", async () => {
    const source = read("src/vite-islands/chat-runtime/thread-readback-controller.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
    assert.doesNotMatch(source, /EventSource/);
  });

  await test("thread readback request builds classic thread read path", async () => {
    const controller = await loadController();
    const request = controller.buildThreadReadbackRequest({
      threadId: "thread 1",
      messageLimit: 30,
      taskGroupId: "task_1",
    });

    assert.equal(request.ok, true);
    assert.equal(request.method, "GET");
    assert.equal(request.path, "/api/threads/thread%201?messageLimit=30&taskGroupId=task_1");
    assert.equal(request.timeoutMs, 30000);

    const missing = controller.buildThreadReadbackRequest({});
    assert.equal(missing.ok, false);
    assert.equal(missing.code, "thread_id_missing");
  });

  await test("thread readback state merge replaces thread and clears refresh queue", async () => {
    const controller = await loadController();
    const state = controller.applyThreadReadbackState(baseState(), {
      source: "dev_mock",
      thread: {
        id: "thread_1",
        status: "done",
        activeRunId: "",
        activeRunIds: [],
        messages: [
          { id: "msg_user_1", role: "user", status: "done", content: "before" },
          { id: "msg_assistant_1", role: "assistant", status: "done", content: "final" },
        ],
      },
    }, {
      source: "unit_test",
    });

    assert.equal(state.latestEventType, "thread.readback");
    assert.equal(state.thread.status, "done");
    assert.deepEqual(state.thread.activeRunIds, []);
    assert.equal(state.thread.messages.find((message) => message.id === "msg_assistant_1").content, "final");
    assert.equal(state.refreshRequests.length, 0);
    assert.equal(state.renderPatches.at(-1).type, "thread_readback");
    assert.equal(state.renderPatches.at(-1).messageCount, 2);
  });

  await test("thread readback controller calls injected API and reports read status", async () => {
    const { createChatThreadReadbackController } = await loadController();
    let state = baseState();
    const calls = [];
    const statuses = [];
    const updates = [];
    const controller = createChatThreadReadbackController({
      api: async (routePath, options) => {
        calls.push({ routePath, options });
        return {
          source: "dev_mock",
          thread: {
            id: "thread_1",
            status: "done",
            activeRunId: "",
            activeRunIds: [],
            messages: [
              { id: "msg_user_1", role: "user", status: "done", content: "before" },
              { id: "msg_assistant_1", role: "assistant", status: "done", content: "final" },
            ],
          },
        };
      },
      source: "unit_test",
      getState: () => state,
      setState: (nextState, detail) => {
        state = nextState;
        updates.push({ state: nextState, detail });
      },
      onStatus: (status) => {
        statuses.push(status);
        return status;
      },
    });

    const result = await controller.readLatest({ messageLimit: 30 });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].routePath, "/api/threads/thread_1?messageLimit=30");
    assert.equal(calls[0].options.method, "GET");
    assert.equal(updates.length, 1);
    assert.equal(updates[0].detail.patch.type, "thread_readback");
    assert.equal(state.latestEventType, "thread.readback");
    assert.equal(state.thread.messages.find((message) => message.id === "msg_assistant_1").content, "final");
    assert.deepEqual(statuses.map((status) => status.status), ["reading", "read"]);
    assert.equal(result.status.messageCount, 2);
  });

  await test("thread readback controller records bounded diagnostic on API failure", async () => {
    const { createChatThreadReadbackController } = await loadController();
    let state = baseState();
    const statuses = [];
    const controller = createChatThreadReadbackController({
      api: async () => {
        const error = new Error("thread_read_failed");
        error.code = "thread_read_failed";
        throw error;
      },
      source: "unit_test",
      getState: () => state,
      setState: (nextState) => {
        state = nextState;
      },
      onStatus: (status) => {
        statuses.push(status);
        return status;
      },
    });

    const result = await controller.readLatest();
    assert.equal(result.ok, false);
    assert.equal(result.status.status, "error");
    assert.equal(result.status.error, "thread_read_failed");
    assert.equal(state.latestEventType, "thread.readback_failed");
    assert.equal(state.diagnostics.at(-1).code, "thread_readback_missing_thread");
    assert.deepEqual(statuses.map((status) => status.status), ["reading", "error"]);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
