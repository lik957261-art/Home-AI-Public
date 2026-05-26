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

testManualItemLifecycle();
testSourceDedupeAndTerminalProtection();
console.log("action-inbox-service tests passed");
