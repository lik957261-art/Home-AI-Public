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
    "src/vite-islands/chat-runtime/event-stream-adapter.mjs",
  )).href;
  return import(`${url}?test=${Date.now()}-${Math.random()}`);
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
    id: "thread_chat_stream_adapter_test",
    status: "running",
    activeRunId: "run_1",
    activeRunIds: ["run_1"],
    messages: [
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
  await test("event-stream adapter stays pure and does not own live transport", async () => {
    const source = read("src/vite-islands/chat-runtime/event-stream-adapter.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /new\s+EventSource\b/);
    assert.doesNotMatch(source, /\bEventSource\s*\(/);
    assert.doesNotMatch(source, /document\./);
  });

  await test("parses MessageEvent-style data frame and applies message delta", async () => {
    const adapter = await loadAdapter();
    const model = await loadModel();
    const state = model.initialChatRuntimeState({ thread: initialThread() });
    const result = adapter.applyChatEventStreamRecord(state, {
      data: JSON.stringify({
        type: "message.delta",
        threadId: "thread_chat_stream_adapter_test",
        messageId: "msg_assistant_1",
        delta: "流式片段",
        updatedAt: "2026-07-02T09:00:02.000Z",
      }),
    });
    const view = model.buildChatRuntimeViewModel(result.state);
    assert.equal(result.ok, true);
    assert.equal(result.applied, true);
    assert.equal(result.source, "message_event");
    assert.equal(result.eventType, "message.delta");
    assert.equal(view.messages[0].contentPreview, "流式片段");
    assert.equal(view.latestPatchType, "streaming_patch");
    assert.equal(view.refreshRequestCount, 0);
  });

  await test("parses browser MessageEvent data from prototype accessors", async () => {
    const adapter = await loadAdapter();
    const model = await loadModel();
    const state = model.initialChatRuntimeState({ thread: initialThread() });
    const eventLike = Object.create({
      get data() {
        return JSON.stringify({
          type: "message.delta",
          threadId: "thread_chat_stream_adapter_test",
          messageId: "msg_assistant_1",
          delta: "真实 MessageEvent",
          updatedAt: "2026-07-02T09:00:03.000Z",
        });
      },
    });
    const result = adapter.applyChatEventStreamRecord(state, eventLike);
    const view = model.buildChatRuntimeViewModel(result.state);
    assert.equal(Object.prototype.hasOwnProperty.call(eventLike, "data"), false);
    assert.equal(result.ok, true);
    assert.equal(result.applied, true);
    assert.equal(result.source, "message_event");
    assert.equal(view.messages[0].contentPreview, "真实 MessageEvent");
  });

  await test("invalid JSON frame records bounded diagnostic without applying event", async () => {
    const adapter = await loadAdapter();
    const model = await loadModel();
    const state = model.initialChatRuntimeState({ thread: initialThread() });
    const result = adapter.applyChatEventStreamRecord(state, {
      data: "{\"type\":\"message.delta\"",
    });
    const view = model.buildChatRuntimeViewModel(result.state);
    assert.equal(result.ok, false);
    assert.equal(result.applied, false);
    assert.equal(result.eventType, "");
    assert.equal(view.appliedEventCount, 0);
    assert.equal(view.diagnostics[0].code, "event_stream_invalid_json");
    assert.equal(view.latestEventType, "event_stream.invalid");
  });

  await test("non-chat and client-version events are ignored with diagnostics", async () => {
    const adapter = await loadAdapter();
    const model = await loadModel();
    const state = model.initialChatRuntimeState({ thread: initialThread() });
    const clientVersion = adapter.applyChatEventStreamRecord(state, {
      data: JSON.stringify({ type: "client.version", clientVersion: "20260702" }),
    });
    const todos = adapter.applyChatEventStreamRecord(clientVersion.state, {
      type: "todos.updated",
      workspaceId: "owner",
    });
    const view = model.buildChatRuntimeViewModel(todos.state);
    assert.equal(clientVersion.ignored, true);
    assert.equal(todos.ignored, true);
    assert.deepEqual(
      view.diagnostics.map((diagnostic) => diagnostic.code),
      [
        "event_stream_ignored_client_version",
        "event_stream_ignored_non_chat_event",
      ],
    );
    assert.equal(view.messages[0].contentPreview, "");
  });

  await test("terminal assistant frame delegates to model refresh semantics", async () => {
    const adapter = await loadAdapter();
    const model = await loadModel();
    const state = model.initialChatRuntimeState({ thread: initialThread() });
    const result = adapter.applyChatEventStreamRecord(state, {
      type: "message",
      threadId: "thread_chat_stream_adapter_test",
      message: {
        id: "msg_assistant_1",
        role: "assistant",
        status: "done",
        runId: "run_1",
        content: "完成",
        updatedAt: "2026-07-02T09:00:05.000Z",
      },
    }, {
      userScrollProtected: true,
    });
    const view = model.buildChatRuntimeViewModel(result.state);
    assert.equal(result.applied, true);
    assert.equal(view.latestRefreshReason, "terminal_receipt");
    assert.equal(view.refreshRequests[0].stickToBottom, false);
    assert.equal(view.messages[0].terminal, true);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
