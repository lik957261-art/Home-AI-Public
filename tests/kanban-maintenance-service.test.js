"use strict";

const assert = require("node:assert/strict");
const { createKanbanMaintenanceService } = require("../adapters/kanban-maintenance-service");

async function run() {
  let now = 1000;
  let filePresent = false;
  const writes = [];
  const broadcasts = [];
  const reconciles = [];
  const logs = [];
  const store = {
    entries: {
      [["owner", "mine", "open", "", "120", ""].join("\0")]: {
        savedAt: 900,
        payload: { ok: true, data: [{ id: "cached-card" }] },
      },
    },
  };
  const service = createKanbanMaintenanceService({
    cardListCachePath: "kanban-card-list-cache.json",
    cardListCacheTtlMs: 500,
    dependencyReconcileIntervalMs: 100,
    nowMs: () => now,
    nowIso: () => "2026-05-14T12:00:00.000Z",
    fileExists: () => filePresent,
    readJsonStore: () => store,
    writeJsonStore: (_path, value) => writes.push(value),
    useKanbanTodoBackend: () => true,
    kanbanCardProvider: {
      async reconcileDependencyBlocks(args) {
        reconciles.push(args);
        return { ok: true, released: [{ id: "card-1" }] };
      },
    },
    broadcast: (event) => broadcasts.push(event),
    logger: {
      info: (message) => logs.push(["info", message]),
      warn: (message) => logs.push(["warn", message]),
    },
  });

  assert.equal(service.cacheKey({ workspaceId: "owner" }), ["owner", "mine", "open", "", "120", ""].join("\0"));
  const cached = service.readCardListCache({ workspaceId: "owner" });
  assert.equal(cached.cache.hit, true);
  assert.equal(cached.cache.ageMs, 100);
  assert.equal(cached.data[0].id, "cached-card");

  now = 1600;
  assert.equal(service.readCardListCache({ workspaceId: "owner" }), null);

  service.writeCardListCache({ workspaceId: "owner", includeCompleted: true, limit: 20 }, { ok: true, data: [{ id: "fresh" }] });
  assert.equal(writes.length, 1);
  assert.equal(Object.keys(writes[0].entries).length, 1);
  assert.equal(writes[0].updatedAt, "2026-05-14T12:00:00.000Z");

  filePresent = true;
  service.clearCardListCache("owner");
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[1].entries, {});

  now = 2000;
  const reconcile = await service.maybeReconcileDependencyBlocks("owner", { limit: 300 });
  assert.equal(reconcile.ok, true);
  assert.equal(reconciles[0].workspaceId, "owner");
  assert.equal(reconciles[0].limit, 300);
  assert.equal(broadcasts.length, 2);
  assert.equal(broadcasts[0].type, "kanban.updated");
  assert.equal(broadcasts[1].type, "todos.updated");
  assert.equal(logs[0][0], "info");

  const recent = await service.maybeReconcileDependencyBlocks("owner");
  assert.deepEqual(recent, { ok: true, skipped: true, reason: "recent", workspaceId: "owner" });

  const scheduled = service.scheduleDependencyReconcile("owner");
  assert.deepEqual(scheduled, { ok: true, skipped: true, reason: "background" });

  const disabled = createKanbanMaintenanceService({
    useKanbanTodoBackend: () => false,
  });
  assert.deepEqual(await disabled.maybeReconcileDependencyBlocks("owner"), {
    ok: true,
    skipped: true,
    reason: "kanban_backend_disabled",
  });
}

run().then(() => {
  console.log("kanban-maintenance-service tests passed");
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
