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
    "src/vite-islands/chat-runtime/model.mjs",
  )).href;
  return import(`${url}?test=${Date.now()}-${Math.random()}`);
}

function initialThread() {
  return {
    id: "thread_chat_runtime_test",
    status: "running",
    activeRunId: "run_1",
    activeRunIds: ["run_1"],
    updatedAt: "2026-07-02T09:00:00.000Z",
    messages: [
      {
        id: "msg_user_1",
        role: "user",
        status: "done",
        content: "请总结。",
        createdAt: "2026-07-02T09:00:00.000Z",
        updatedAt: "2026-07-02T09:00:00.000Z",
      },
      {
        id: "msg_assistant_1",
        role: "assistant",
        status: "running",
        runId: "run_1",
        content: "",
        createdAt: "2026-07-02T09:00:01.000Z",
        updatedAt: "2026-07-02T09:00:01.000Z",
      },
    ],
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
  await test("chat runtime model stays pure and browser-boundary free", async () => {
    const source = read("src/vite-islands/chat-runtime/model.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
    assert.doesNotMatch(source, /EventSource/);
  });

  await test("bounded live append keeps a tail and records truncation", async () => {
    const model = await loadModel();
    const next = model.appendStreamingMessageBounded("A".repeat(900), "B".repeat(900), {
      maxChars: 20,
    });
    assert.match(next, /^\[live content truncated: 1800 chars total\]/);
    assert.ok(next.endsWith("B".repeat(750)), "minimum maxChars guard keeps bounded tail");
    assert.equal(next.length < 1200, true);
  });

  await test("message.delta patches visible assistant content without refresh", async () => {
    const model = await loadModel();
    const state = model.initialChatRuntimeState({ thread: initialThread() });
    const next = model.applyChatRuntimeEvent(state, {
      type: "message.delta",
      threadId: "thread_chat_runtime_test",
      messageId: "msg_assistant_1",
      delta: "第一段",
      updatedAt: "2026-07-02T09:00:02.000Z",
      firstFeedbackAt: "2026-07-02T09:00:02.000Z",
    });
    const view = model.buildChatRuntimeViewModel(next);
    const assistant = view.messages.find((message) => message.id === "msg_assistant_1");
    assert.equal(next.appliedEventCount, 1);
    assert.equal(view.latestEventType, "message.delta");
    assert.equal(assistant.contentPreview, "第一段");
    assert.equal(view.latestPatchType, "streaming_patch");
    assert.equal(view.refreshRequestCount, 0);
    assert.equal(next.thread.messages.find((message) => message.id === "msg_assistant_1").firstFeedbackAt, "2026-07-02T09:00:02.000Z");
  });

  await test("terminal assistant message requests thread refresh but respects scroll protection", async () => {
    const model = await loadModel();
    const state = model.initialChatRuntimeState({ thread: initialThread() });
    const next = model.applyChatRuntimeEvent(state, {
      type: "message",
      threadId: "thread_chat_runtime_test",
      message: {
        id: "msg_assistant_1",
        role: "assistant",
        status: "done",
        runId: "run_1",
        content: "完成。",
        updatedAt: "2026-07-02T09:00:03.000Z",
      },
      thread: {
        id: "thread_chat_runtime_test",
        status: "done",
        activeRunId: "",
        activeRunIds: [],
        updatedAt: "2026-07-02T09:00:03.000Z",
      },
    }, {
      userScrollProtected: true,
    });
    const view = model.buildChatRuntimeViewModel(next);
    assert.equal(view.latestPatchType, "message_upsert");
    assert.equal(view.latestRefreshReason, "terminal_receipt");
    assert.equal(view.refreshRequests[0].stickToBottom, false);
    assert.equal(view.refreshRequests[0].protectedByUserScroll, true);
    assert.equal(view.messages.find((message) => message.id === "msg_assistant_1").terminal, true);
  });

  await test("thread.updated terminal summary schedules bounded refresh", async () => {
    const model = await loadModel();
    const state = model.initialChatRuntimeState({ thread: initialThread() });
    const next = model.applyChatRuntimeEvent(state, {
      type: "thread.updated",
      thread: {
        id: "thread_chat_runtime_test",
        status: "done",
        activeRunId: "",
        activeRunIds: [],
        updatedAt: "2026-07-02T09:00:04.000Z",
      },
    });
    const view = model.buildChatRuntimeViewModel(next);
    assert.equal(view.latestPatchType, "thread_summary");
    assert.equal(view.latestRefreshReason, "terminal_summary");
    assert.equal(view.refreshRequests[0].delayMs, 180);
    assert.equal(view.refreshRequests[0].stickToBottom, true);
  });

  await test("scope mismatches emit diagnostics and do not mutate the active thread", async () => {
    const model = await loadModel();
    const state = model.initialChatRuntimeState({ thread: initialThread() });
    const next = model.applyChatRuntimeEvent(state, {
      type: "message.delta",
      threadId: "thread_other",
      messageId: "msg_assistant_1",
      delta: "不应显示",
    });
    const view = model.buildChatRuntimeViewModel(next);
    const assistant = view.messages.find((message) => message.id === "msg_assistant_1");
    assert.equal(assistant.contentPreview, "");
    assert.equal(view.refreshRequestCount, 0);
    assert.deepEqual(view.diagnostics.map((diagnostic) => diagnostic.code), ["delta_ignored_scope_mismatch"]);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
