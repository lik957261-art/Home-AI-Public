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
    "src/vite-islands/navigation-shell/task-group-model.mjs",
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
  await test("task group model remains browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/task-group-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /\bdocument\s*\./);
  });

  await test("task group model filters scoped messages and removes synthetic summaries", async () => {
    const model = await loadModel();
    const thread = {
      id: "thread",
      messages: [
        { id: "g1:last-user", taskGroupId: "g1", role: "user", createdAt: "2026-01-01T00:00:01Z" },
        { id: "m2", taskGroupId: "g1", role: "assistant", createdAt: "2026-01-01T00:00:03Z" },
        { id: "m1", taskGroupId: "g1", role: "user", createdAt: "2026-01-01T00:00:02Z" },
        { id: "m3", taskGroupId: "chat", role: "user", createdAt: "2026-01-01T00:00:04Z" },
      ],
    };
    assert.deepEqual(
      model.taskGroupMessagesForThreadPlan(thread, "g1").map((message) => message.id),
      ["m1", "m2"],
    );
    assert.deepEqual(
      model.chatMessagesForThreadPlan(thread, "chat").map((message) => message.id),
      ["m3"],
    );
    assert.equal(model.oldestLoadedChatMessageIdPlan({ thread, taskGroupId: "chat" }), "m3");
  });

  await test("task group model builds page params and preview thread without changing unrelated messages", async () => {
    const model = await loadModel();
    const entries = model.messagePageParamsPlan({
      mode: "tasks",
      taskGroupId: "task-1",
      limit: 12,
      before: "m1",
      search: "receipt",
    });
    assert.deepEqual(entries, [
      ["messageMode", "tasks"],
      ["limit", "12"],
      ["taskGroupId", "task-1"],
      ["before", "m1"],
      ["search", "receipt"],
    ]);
    const thread = {
      id: "thread",
      messagesPage: { mode: "tasks", taskGroupId: "task-1", hasMoreBefore: true },
      messages: [
        { id: "a", taskGroupId: "task-1", createdAt: "2026-01-01T00:00:01Z" },
        { id: "b", taskGroupId: "task-1", createdAt: "2026-01-01T00:00:02Z" },
        { id: "c", taskGroupId: "task-1", createdAt: "2026-01-01T00:00:03Z" },
        { id: "other", taskGroupId: "task-2", createdAt: "2026-01-01T00:00:04Z" },
      ],
    };
    const preview = model.taskDetailPreviewThreadPlan({ thread, taskGroupId: "task-1", limit: 2 });
    assert.deepEqual(preview.messages.map((message) => message.id), ["b", "c", "other"]);
    assert.deepEqual(preview.messagesPage, thread.messagesPage);
  });

  await test("task group model detects active runs and reconciles pending send messages", async () => {
    const model = await loadModel();
    assert.equal(model.incomingThreadHasActiveRunPlan({ status: "running" }), true);
    assert.equal(model.shouldPreserveMessageOutsideIncomingPagePlan({ status: "queued" }, { activeRunIds: ["run_1"] }), true);
    const existing = [
      {
        id: "local-user",
        role: "user",
        taskGroupId: "task-1",
        content: "hello",
        localPendingSend: true,
        localPendingSendId: "send-1",
      },
      {
        id: "local-assistant",
        role: "assistant",
        taskGroupId: "task-1",
        localPendingSend: true,
        localPendingSendId: "send-1",
        localRunProgressEvents: [{ type: "run.started" }],
      },
    ];
    const incoming = [{ id: "server-user", role: "user", taskGroupId: "task-1", content: "hello" }];
    assert.equal(model.localPendingSendReplacedByIncomingPlan(existing[0], incoming, existing), true);
    assert.deepEqual(
      model.localPendingRunProgressEventsForIncomingPlan(
        { id: "server-assistant", role: "assistant", taskGroupId: "task-1" },
        [{ id: "server-assistant", role: "assistant", taskGroupId: "task-1" }],
        existing,
      ),
      [{ type: "run.started" }],
    );
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
