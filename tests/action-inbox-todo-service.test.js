"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createActionInboxService } = require("../adapters/action-inbox-service");
const { createActionInboxTodoService } = require("../adapters/action-inbox-todo-service");
const { createMobileSqliteStore } = require("../adapters/mobile-sqlite-store");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "home-ai-action-inbox-todo-"));
}

function makeHarness(now = "2026-06-13T10:00:00.000Z") {
  const dir = tempDir();
  const store = createMobileSqliteStore({ dbPath: path.join(dir, "todo.sqlite3") });
  const pushes = [];
  const actionInboxService = createActionInboxService({
    compactText: (value, max = 1000) => String(value || "").slice(0, max),
    makeId: (prefix) => `${prefix}_test`,
    nowIso: () => now,
    store,
  });
  const service = createActionInboxTodoService({
    actionInboxService,
    appRouteUrl: (params) => `/?${new URLSearchParams(params).toString()}`,
    compactText: (value, max = 1000) => String(value || "").slice(0, max),
    makeId: (prefix) => `${prefix}_test`,
    nowIso: () => now,
    sendPushNotification: async (payload, options) => {
      pushes.push({ payload, options });
      return { enabled: true, attempted: 1, sent: 1, failed: 0, removed: 0 };
    },
    workspacePrincipal: (workspaceId) => `principal:${workspaceId}`,
  });
  return { actionInboxService, dir, pushes, service, store };
}

function cleanup(h) {
  h.store.close();
  fs.rmSync(h.dir, { recursive: true, force: true });
}

async function testModelDraftValidationDoesNotParseRawText() {
  const h = makeHarness();
  try {
    const result = h.service.validateDraft({ text: "提醒吴萍明天交资料" });
    assert.equal(result.ok, true);
    assert.equal(result.needsConfirmation, true);
    assert.ok(result.missingFields.includes("modelStructuredDraft"));
  } finally {
    cleanup(h);
  }
}

async function testCreateAssignedTodoSendsPushToAssignee() {
  const h = makeHarness();
  try {
    const result = await h.service.createTodo({
      title: "提交发票",
      creatorWorkspaceId: "owner",
      assigneeWorkspaceId: "child",
      dueAt: "2026-06-14T01:00:00.000Z",
      confirmed: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.item.workspaceId, "child");
    assert.equal(result.item.assigneeWorkspaceId, "child");
    assert.equal(result.item.sourceRef.creatorWorkspaceId, "owner");
    assert.equal(result.item.status, "open");
    assert.equal(h.pushes.length, 1);
    assert.deepEqual(h.pushes[0].options.principalIds, ["principal:child"]);
    assert.equal(h.pushes[0].payload.data.viewMode, "inbox");
  } finally {
    cleanup(h);
  }
}

async function testFutureReminderWaitsUntilTick() {
  const h = makeHarness();
  try {
    const created = await h.service.createTodo({
      title: "三点吃药",
      creatorWorkspaceId: "owner",
      assigneeWorkspaceId: "child",
      remindAt: "2026-06-13T15:00:00.000Z",
      confirmed: true,
    });
    assert.equal(created.ok, true);
    assert.equal(created.item.status, "waiting");
    assert.equal(h.pushes.length, 1);
    assert.equal(h.pushes[0].payload.data.messageType, "todo_reminder_scheduled");

    const early = await h.service.activateDueReminders({ now: "2026-06-13T14:59:00.000Z" });
    assert.equal(early.activatedCount, 0);

    const due = await h.service.activateDueReminders({ now: "2026-06-13T15:00:00.000Z" });
    assert.equal(due.activatedCount, 1);
    assert.equal(due.items[0].status, "open");
    assert.equal(h.pushes.length, 2);
    assert.equal(h.pushes[1].payload.data.messageType, "todo_reminder_due");
  } finally {
    cleanup(h);
  }
}

async function testCompletionCreatesCreatorReceipt() {
  const h = makeHarness();
  try {
    const created = await h.service.createTodo({
      title: "提交发票",
      creatorWorkspaceId: "owner",
      assigneeWorkspaceId: "child",
      confirmed: true,
    });
    h.pushes.length = 0;
    const done = await h.service.completeTodoItem({
      itemId: created.item.id,
      actorWorkspaceId: "child",
      actorPrincipalId: "principal:child",
    });
    assert.equal(done.ok, true);
    assert.equal(done.item.status, "done");
    const ownerItems = h.actionInboxService.listItems({ workspaceId: "owner" }).items;
    assert.equal(ownerItems.length, 1);
    assert.equal(ownerItems[0].title, "待办已完成");
    assert.equal(ownerItems[0].sourceRef.completedTodoItemId, created.item.id);
    assert.equal(h.pushes.length, 1);
    assert.deepEqual(h.pushes[0].options.principalIds, ["principal:owner"]);
  } finally {
    cleanup(h);
  }
}

(async () => {
  await testModelDraftValidationDoesNotParseRawText();
  await testCreateAssignedTodoSendsPushToAssignee();
  await testFutureReminderWaitsUntilTick();
  await testCompletionCreatesCreatorReceipt();
  console.log("action inbox todo service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
