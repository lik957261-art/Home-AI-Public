"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadComposerController() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/chat-runtime/composer-controller.mjs",
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
  await test("composer controller stays pure and browser-boundary free", async () => {
    const source = read("src/vite-islands/chat-runtime/composer-controller.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
    assert.doesNotMatch(source, /EventSource/);
  });

  await test("composer controller sends with optimistic row then merges readback", async () => {
    const { createComposerController } = await loadComposerController();
    let thread = {
      id: "thread_1",
      status: "idle",
      messages: [{ id: "existing", role: "user", content: "before" }],
    };
    let draft = "继续";
    let nextIndex = 0;
    let token = null;
    let pendingArtifacts = [{ id: "artifact_1", name: "note.md" }];
    const statuses = [];
    const threadUpdates = [];
    const calls = [];
    const controller = createComposerController({
      api: async (pathName, options) => {
        calls.push({ pathName, options });
        return {
          source: "dev_mock",
          run: { run_id: "run_1" },
          thread: {
            id: "thread_1",
            status: "running",
            activeRunIds: ["run_1"],
            messages: [
              { id: "msg_assistant_1", role: "assistant", status: "running", content: "" },
            ],
          },
        };
      },
      source: "unit_test",
      getThread: () => thread,
      setThread: (nextThread, detail) => {
        thread = nextThread;
        threadUpdates.push({ thread: nextThread, detail });
      },
      getDraft: () => draft,
      setDraft: (value) => {
        draft = value;
      },
      getPendingArtifacts: () => pendingArtifacts,
      clearPendingArtifacts: () => {
        pendingArtifacts = [];
      },
      getNextIndex: () => nextIndex,
      setNextIndex: (value) => {
        nextIndex = value;
      },
      setOptimisticToken: (value) => {
        token = value;
      },
      onStatus: (status) => {
        statuses.push(status);
        return status;
      },
      nowIso: () => "2026-07-03T01:00:00.000Z",
      queuedAtIso: () => "2026-07-03T01:00:01.000Z",
      baseIdPrefix: "local_test",
    });

    const result = await controller.send({
      body: {
        taskGroupId: "task_1",
        singleWindowMode: "task",
        messageLimit: 30,
        reasoning_effort: "medium",
      },
      workspaceId: "owner",
      notificationChannel: "web_push",
    });

    assert.equal(result.ok, true);
    assert.equal(draft, "");
    assert.equal(nextIndex, 1);
    assert.equal(token, null);
    assert.deepEqual(pendingArtifacts, []);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].pathName, "/api/threads/thread_1/messages");
    const requestBody = JSON.parse(calls[0].options.body);
    assert.equal(requestBody.text, "继续");
    assert.equal(requestBody.taskGroupId, "task_1");
    assert.equal(requestBody.reasoning_effort, "medium");
    assert.equal(requestBody.artifacts.length, 1);
    assert.equal(threadUpdates.length, 2);
    assert.equal(threadUpdates[0].detail.patch.type, "composer_send_started");
    assert.equal(threadUpdates[0].thread.messages.at(-1).localPendingSend, true);
    assert.equal(threadUpdates[1].detail.patch.type, "composer_send_result");
    assert.equal(thread.messages.some((message) => message.localPendingSend), false);
    assert.equal(thread.messages.at(-1).id, "msg_assistant_1");
    assert.deepEqual(statuses.map((status) => status.status), ["sending", "sent"]);
    assert.equal(result.status.runId, "run_1");
  });

  await test("composer controller blocks empty sends before API call", async () => {
    const { createComposerController } = await loadComposerController();
    const calls = [];
    const statuses = [];
    const controller = createComposerController({
      api: async () => {
        calls.push("api");
        return {};
      },
      getThread: () => ({ id: "thread_1", messages: [] }),
      getDraft: () => "  ",
      getPendingArtifacts: () => [],
      onStatus: (status) => {
        statuses.push(status);
        return status;
      },
    });

    const result = await controller.send();
    assert.equal(result.ok, false);
    assert.equal(result.status.status, "blocked");
    assert.equal(result.status.error, "message_content_missing");
    assert.deepEqual(calls, []);
    assert.deepEqual(statuses.map((status) => status.status), ["blocked"]);
  });

  await test("composer controller rolls back optimistic rows on API failure", async () => {
    const { createComposerController } = await loadComposerController();
    const originalThread = Object.freeze({
      id: "thread_1",
      messages: Object.freeze([{ id: "existing", role: "user", content: "before" }]),
    });
    let thread = originalThread;
    let token = null;
    const updates = [];
    const controller = createComposerController({
      api: async () => {
        const error = new Error("gateway_failed");
        error.code = "gateway_failed";
        throw error;
      },
      getThread: () => thread,
      setThread: (nextThread, detail) => {
        thread = nextThread;
        updates.push({ thread: nextThread, detail });
      },
      getDraft: () => "继续",
      setDraft: () => {},
      getNextIndex: () => 0,
      setNextIndex: () => {},
      setOptimisticToken: (value) => {
        token = value;
      },
    });

    const result = await controller.send();
    assert.equal(result.ok, false);
    assert.equal(result.status.status, "error");
    assert.equal(result.status.error, "gateway_failed");
    assert.equal(token, null);
    assert.equal(updates.length, 2);
    assert.equal(updates[0].thread.messages.length, 3);
    assert.deepEqual(updates[1].thread.messages, originalThread.messages);
  });

  await test("composer controller interrupts run and projects stopped status", async () => {
    const { createComposerController } = await loadComposerController();
    let thread = {
      id: "thread_1",
      status: "running",
      activeRunIds: ["run_1"],
      messages: [{ id: "msg_assistant_1", role: "assistant", status: "running", content: "" }],
    };
    const calls = [];
    const statuses = [];
    const controller = createComposerController({
      api: async (pathName, options) => {
        calls.push({ pathName, options });
        return {
          source: "dev_mock",
          runIds: ["run_1"],
          thread: {
            id: "thread_1",
            status: "cancelled",
            activeRunIds: [],
            messages: [
              { id: "msg_assistant_1", role: "assistant", status: "cancelled", content: "" },
            ],
          },
        };
      },
      getThread: () => thread,
      setThread: (nextThread) => {
        thread = nextThread;
      },
      onStatus: (status) => {
        statuses.push(status);
        return status;
      },
    });

    const result = await controller.interrupt();
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].pathName, "/api/threads/thread_1/interrupt");
    assert.equal(thread.status, "cancelled");
    assert.deepEqual(thread.activeRunIds, []);
    assert.deepEqual(statuses.map((status) => status.status), ["stopping", "stopped"]);
    assert.equal(result.status.runId, "run_1");
  });

  await test("composer result merge deduplicates readback messages", async () => {
    const { mergeComposerResultThread } = await loadComposerController();
    const merged = mergeComposerResultThread(
      {
        id: "thread_1",
        messages: [
          { id: "msg_1", role: "user", content: "one" },
          { id: "msg_2", role: "assistant", content: "two" },
        ],
      },
      {
        id: "thread_1",
        status: "done",
        messages: [
          { id: "msg_2", role: "assistant", content: "two duplicate" },
          { id: "msg_3", role: "assistant", content: "three" },
        ],
      },
    );
    assert.equal(merged.status, "done");
    assert.deepEqual(merged.messages.map((message) => message.id), ["msg_1", "msg_2", "msg_3"]);
    assert.equal(merged.messages[1].content, "two");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
