"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createMobileSqliteStore } = require("../adapters/mobile-sqlite-store");
const { createActionInboxService } = require("../adapters/action-inbox-service");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hermes-action-inbox-service-"));
}

function makeHarness() {
  const dir = tempDir();
  const store = createMobileSqliteStore({ dbPath: path.join(dir, "action-inbox.sqlite3") });
  const service = createActionInboxService({
    compactText: (value, max = 1000) => String(value || "").slice(0, max),
    makeId: (prefix) => `${prefix}_test`,
    nowIso: () => "2026-05-26T00:00:00.000Z",
    store,
  });
  return { dir, service, store };
}

function cleanup(harness) {
  harness.store.close();
  fs.rmSync(harness.dir, { recursive: true, force: true });
}

function testManualItemLifecycle() {
  const h = makeHarness();
  try {
    const created = h.service.createManualItem({
      workspaceId: "owner",
      title: "Review delivery",
      summary: "Open the result.",
      auth: { principalId: "owner" },
    });
    assert.equal(created.ok, true);
    assert.equal(created.item.workspaceId, "owner");
    assert.equal(created.item.status, "open");
    assert.equal(created.item.sourceType, "manual");
    assert.equal(h.store.listActionInboxEvents(created.item.id).at(-1).eventType, "source_created");

    const listed = h.service.listItems({ workspaceId: "owner" });
    assert.deepEqual(listed.items.map((item) => item.id), [created.item.id]);
    assert.equal(listed.counts.byStatus.open, 1);

    const done = h.service.completeItem({
      itemId: created.item.id,
      auth: { principalId: "owner" },
      payload: { reason: "handled" },
    });
    assert.equal(done.ok, true);
    assert.equal(done.item.status, "done");
    assert.equal(done.item.completedAt, "2026-05-26T00:00:00.000Z");
    assert.deepEqual(h.service.listItems({ workspaceId: "owner" }).items, []);
    assert.deepEqual(h.service.listItems({ workspaceId: "owner", includeDone: true }).items.map((item) => item.id), [created.item.id]);
  } finally {
    cleanup(h);
  }
}

function testSourceDedupeAndTerminalProtection() {
  const h = makeHarness();
  try {
    const first = h.service.upsertSourceItem({
      workspaceId: "child",
      sourceType: "automation",
      sourceId: "job-1",
      itemType: "delivery",
      title: "Automation complete",
      summary: "Report ready.",
      dedupeKey: "automation:job-1:sig-a",
    });
    const second = h.service.upsertSourceItem({
      workspaceId: "child",
      sourceType: "automation",
      sourceId: "job-1",
      itemType: "delivery",
      title: "Automation complete updated",
      summary: "Report ready again.",
      dedupeKey: "automation:job-1:sig-a",
    });
    assert.equal(second.item.id, first.item.id);
    assert.equal(second.item.title, "Automation complete updated");
    assert.equal(h.store.listActionInboxEvents(first.item.id).length, 2);

    const dismissed = h.service.dismissItem({ itemId: first.item.id });
    assert.equal(dismissed.item.status, "dismissed");
    const sourceAgain = h.service.upsertSourceItem({
      workspaceId: "child",
      sourceType: "automation",
      sourceId: "job-1",
      itemType: "delivery",
      title: "Automation complete reopened attempt",
      summary: "Should remain dismissed.",
      dedupeKey: "automation:job-1:sig-a",
    });
    assert.equal(sourceAgain.item.status, "dismissed");
  } finally {
    cleanup(h);
  }
}

function testSourceDedupePreservesExistingSourceRefOnSparseUpdate() {
  const h = makeHarness();
  try {
    const first = h.service.upsertSourceItem({
      workspaceId: "owner",
      sourceType: "plugin_conversation",
      sourceId: "pcr_home_ai_full",
      itemType: "approval",
      title: "Home AI repair",
      summary: "Full server-side request.",
      dedupeKey: "plugin-conversation-repair:home-ai:sig-a:owner",
      sourceRef: {
        sourceThreadId: "thread-1",
        sourceTurnId: "assistant-1",
        targetWorkspace: "/Users/example/path",
      },
      rawJson: {
        pluginConversationActionBridge: {
          request: {
            sourceThreadId: "thread-1",
            sourceTurnId: "assistant-1",
          },
        },
      },
    });
    const second = h.service.upsertSourceItem({
      workspaceId: "owner",
      sourceType: "plugin_conversation",
      sourceId: "pcr_home_ai_sparse",
      itemType: "approval",
      title: "Home AI repair",
      summary: "Sparse client fallback request.",
      dedupeKey: "plugin-conversation-repair:home-ai:sig-a:owner",
      sourceRef: {
        targetWorkspace: "/Users/example/path",
      },
      rawJson: {
        pluginConversationActionBridge: {
          request: {},
        },
      },
    });
    assert.equal(second.item.id, first.item.id);
    assert.equal(second.item.sourceRef.sourceThreadId, "thread-1");
    assert.equal(second.item.sourceRef.sourceTurnId, "assistant-1");
    assert.equal(second.item.pluginConversationActionBridge.request.sourceThreadId, "thread-1");
    assert.equal(second.item.pluginConversationActionBridge.request.sourceTurnId, "assistant-1");
  } finally {
    cleanup(h);
  }
}

function testDefaultListHidesOrdinaryChatReceipts() {
  const h = makeHarness();
  try {
    const chat = h.service.upsertSourceItem({
      id: "chat-receipt-item",
      workspaceId: "owner",
      sourceType: "chat",
      sourceId: "receipt-1",
      itemType: "info",
      title: "Task completed",
      summary: "Ordinary active chat task receipt.",
      dedupeKey: "chat:receipt-1",
    });
    const todo = h.service.upsertSourceItem({
      id: "manual-todo-item",
      workspaceId: "owner",
      sourceType: "manual",
      sourceId: "todo-1",
      itemType: "todo",
      title: "Take medicine",
      dedupeKey: "manual:todo-1",
    });
    const listed = h.service.listItems({ workspaceId: "owner" });
    assert.deepEqual(listed.items.map((item) => item.id), [todo.item.id]);
    assert.equal(listed.counts.bySourceType.chat, undefined);
    assert.equal(listed.counts.byStatus.open, 1);
    const explicitChat = h.service.listItems({ workspaceId: "owner", sourceType: "chat" });
    assert.deepEqual(explicitChat.items.map((item) => item.id), [chat.item.id]);
  } finally {
    cleanup(h);
  }
}

function testDefaultListHidesLowSignalScheduledAuditRows() {
  const h = makeHarness();
  try {
    const auditInfo = h.service.upsertSourceItem({
      id: "audit-info",
      workspaceId: "owner",
      sourceType: "automation",
      sourceId: "homeai_visual_music",
      itemType: "delivery",
      title: "Music visual audit completed",
      summary: "No user action required.",
      sourceRef: {
        kind: "visual_polish_audit_run",
        triggerMode: "scheduled",
        severity: "info",
      },
      dedupeKey: "automation-audit:owner:homeai_visual_music:delivery",
    });
    const auditError = h.service.upsertSourceItem({
      id: "audit-error",
      workspaceId: "owner",
      sourceType: "automation",
      sourceId: "homeai_visual_finance",
      itemType: "error",
      title: "Finance visual audit failed",
      summary: "Needs attention.",
      sourceRef: {
        kind: "visual_polish_audit_run",
        triggerMode: "scheduled",
        severity: "high",
      },
      dedupeKey: "automation-audit:owner:homeai_visual_finance:error",
    });
    const manualAudit = h.service.upsertSourceItem({
      id: "manual-audit-review",
      workspaceId: "owner",
      sourceType: "automation",
      sourceId: "manual-audit-1",
      itemType: "review",
      title: "Manual audit review",
      sourceRef: {
        kind: "plugin_workspace_audit",
        triggerMode: "manual",
        severity: "normal",
      },
      dedupeKey: "plugin-audit:owner:codex:alignment:review",
    });
    const listed = h.service.listItems({ workspaceId: "owner" });
    assert.deepEqual(listed.items.map((item) => item.id), [manualAudit.item.id, auditError.item.id]);
    assert.equal(listed.counts.bySourceType.automation, 2);
    const explicitAutomation = h.service.listItems({ workspaceId: "owner", sourceType: "automation" });
    assert.deepEqual(new Set(explicitAutomation.items.map((item) => item.id)), new Set([auditInfo.item.id, auditError.item.id, manualAudit.item.id]));
    const includeSystemAudit = h.service.listItems({ workspaceId: "owner", includeSystemAudit: true });
    assert.deepEqual(new Set(includeSystemAudit.items.map((item) => item.id)), new Set([auditInfo.item.id, auditError.item.id, manualAudit.item.id]));
  } finally {
    cleanup(h);
  }
}

function testDefaultListSortsNewestItemsFirst() {
  const h = makeHarness();
  try {
    const delivery = h.service.upsertSourceItem({
      id: "automation-delivery",
      workspaceId: "owner",
      sourceType: "automation",
      sourceId: "job-1",
      itemType: "delivery",
      title: "Automation report",
      summary: "Report ready.",
      updatedAt: "2026-05-26T12:00:00.000Z",
      dedupeKey: "automation:job-1:sig",
    });
    const todo = h.service.upsertSourceItem({
      id: "manual-todo",
      workspaceId: "owner",
      sourceType: "manual",
      sourceId: "todo-1",
      itemType: "todo",
      title: "Pay school fee",
      dueAt: "2026-05-27T00:00:00.000Z",
      updatedAt: "2026-05-26T09:00:00.000Z",
      dedupeKey: "todo:todo-1",
    });
    const scheduledTodo = h.service.upsertSourceItem({
      id: "scheduled-todo",
      workspaceId: "owner",
      sourceType: "automation",
      sourceId: "job-2",
      itemType: "todo",
      priority: "high",
      title: "Weekly bag check",
      sourceRef: { automationId: "job-2", scheduledTodo: true },
      updatedAt: "2026-05-26T11:00:00.000Z",
      dedupeKey: "automation:job-2:sig",
    });
    const listed = h.service.listItems({ workspaceId: "owner", excludedItemTypes: ["todo"] });
    assert.deepEqual(listed.items.map((item) => item.id), [
      delivery.item.id,
    ]);
    assert.equal(listed.counts.byItemType.todo, undefined);
    const todoListed = h.service.listItems({ workspaceId: "owner", itemType: "todo" });
    assert.deepEqual(todoListed.items.map((item) => item.id), [
      scheduledTodo.item.id,
      todo.item.id,
    ]);
  } finally {
    cleanup(h);
  }
}

testManualItemLifecycle();
testSourceDedupeAndTerminalProtection();
testSourceDedupePreservesExistingSourceRefOnSparseUpdate();
testDefaultListHidesOrdinaryChatReceipts();
testDefaultListHidesLowSignalScheduledAuditRows();
testDefaultListSortsNewestItemsFirst();
console.log("action-inbox-service tests passed");
