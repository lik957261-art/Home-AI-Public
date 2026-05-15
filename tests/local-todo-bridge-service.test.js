"use strict";

const assert = require("node:assert/strict");

const {
  createLocalTodoBridgeService,
  localTodoAuthorized,
  localTodoMatchesList,
  parseLocalTodoDue,
} = require("../adapters/local-todo-bridge-service");

function makeJsonService() {
  let snapshot = {};
  const writes = [];
  const service = createLocalTodoBridgeService({
    storePath: "local-todos.json",
    readJsonStore(filePath, fallback) {
      assert.equal(filePath, "local-todos.json");
      return snapshot.todos ? JSON.parse(JSON.stringify(snapshot)) : fallback;
    },
    writeJsonStore(filePath, value) {
      assert.equal(filePath, "local-todos.json");
      snapshot = JSON.parse(JSON.stringify(value));
      writes.push(snapshot);
    },
    nowIso: () => "2026-05-15T01:02:03.000Z",
    createTodoId: () => `todo-${writes.length + 1}`,
    formatLocalDateTime: () => "2026-05-16 09:30",
  });
  return {
    service,
    state: () => snapshot,
    writes,
  };
}

function makeSqliteService() {
  const rows = new Map();
  const audits = [];
  const store = {
    listTodoItems(options) {
      return Array.from(rows.values()).filter((row) => (
        options.sourcePrincipal === "owner"
        || row.assignee_principal_id === options.sourcePrincipal
        || row.created_by_principal === options.sourcePrincipal
      ));
    },
    importTodoItem(row) {
      rows.set(row.id, Object.assign({}, row));
    },
    getTodoItem(id) {
      const row = rows.get(id);
      return row ? Object.assign({}, row) : null;
    },
    deleteTodoItem(id) {
      rows.delete(id);
    },
    audit(type, payload) {
      audits.push({ type, payload });
    },
  };
  const service = createLocalTodoBridgeService({
    storePath: "unused.json",
    readJsonStore: () => ({}),
    writeJsonStore: () => {},
    useSqliteServiceStore: () => true,
    mobileSqliteStore: () => store,
    nowIso: () => "2026-05-15T01:02:03.000Z",
    createTodoId: () => "todo-sqlite",
    formatLocalDateTime: () => "2026-05-16 09:30",
  });
  return { service, rows, audits };
}

async function testJsonBridgeLifecycle() {
  const harness = makeJsonService();
  const { service } = harness;

  assert.deepEqual(await service.run({ action: "list", source_principal: "alice" }), { ok: true, todos: [] });
  assert.deepEqual(await service.run({ action: "add", source_principal: "alice", content: "" }), {
    ok: false,
    error: "Todo content is required",
  });

  const added = await service.run({
    action: "add",
    source_principal: "alice",
    content: "Review architecture",
    due_time: "2026-05-16 09:30",
    assignee: "bob",
  });
  assert.equal(added.ok, true);
  assert.equal(added.id, "todo-1");
  assert.equal(added.assignee_principal_id, "bob");
  assert.equal(added.created_by_principal, "alice");
  assert.equal(added.due_local, "2026-05-16 09:30");

  assert.equal((await service.run({ action: "list", source_principal: "alice" })).todos.length, 1);
  assert.equal((await service.run({ action: "list", source_principal: "bob" })).todos.length, 1);
  assert.equal((await service.run({ action: "list", source_principal: "charlie" })).todos.length, 0);

  const completed = await service.run({ action: "complete", source_principal: "bob", todo_id: "todo-1" });
  assert.equal(completed.status, "completed");
  assert.equal(completed.completed_at, "2026-05-15T01:02:03.000Z");

  const postponed = await service.run({
    action: "postpone",
    source_principal: "alice",
    todo_id: "todo-1",
    due_time: "2026-05-17 10:00",
  });
  assert.equal(postponed.ok, true);
  assert.equal(postponed.due_local, "2026-05-16 09:30");

  const mark = await service.run({
    action: "web_mark_push",
    source_principal: "alice",
    markKey: "mk1",
    todoId: "todo-1",
    principalId: "alice",
    messageType: "todo_due",
    status: "sent",
  });
  assert.equal(mark.ok, true);
  assert.equal(harness.state().pushMarks.mk1.todoId, "todo-1");
  assert.deepEqual(await service.run({ action: "web_pending_pushes" }), { ok: true, events: [] });
  assert.equal((await service.run({ action: "delete", source_principal: "alice", todo_id: "todo-1" })).ok, true);
  assert.equal(harness.state().todos.length, 0);
}

async function testSqliteBridgeLifecycle() {
  const { service, rows, audits } = makeSqliteService();
  const added = await service.run({
    action: "add",
    source_principal: "owner",
    content: "SQLite todo",
    due_time: "2026-05-16 09:30",
  });
  assert.equal(added.id, "todo-sqlite");
  assert.equal(added.source, "sqlite");
  assert.equal(rows.get("todo-sqlite").content, "SQLite todo");

  assert.equal((await service.run({ action: "list", source_principal: "owner" })).todos.length, 1);
  assert.equal((await service.run({ action: "cancel", source_principal: "owner", todo_id: "todo-sqlite" })).status, "cancelled");
  assert.equal((await service.run({ action: "delete", source_principal: "owner", todo_id: "todo-sqlite" })).ok, true);
  assert.equal(rows.has("todo-sqlite"), false);

  await service.run({ action: "web_mark_push", source_principal: "owner", todoId: "todo-x", markKey: "mk" });
  assert.equal(audits[0].type, "todo_web_push_mark");
  assert.equal(audits[0].payload.targetId, "todo-x");
}

function testPureHelpers() {
  assert.equal(parseLocalTodoDue("2026-05-16 09:30"), new Date("2026-05-16T09:30").toISOString());
  assert.equal(parseLocalTodoDue("bad"), "");
  const row = { assignee_principal_id: "bob", created_by_principal: "alice" };
  assert.equal(localTodoAuthorized(row, "owner"), true);
  assert.equal(localTodoAuthorized(row, "alice"), true);
  assert.equal(localTodoAuthorized(row, "bob"), true);
  assert.equal(localTodoAuthorized(row, "charlie"), false);
  assert.equal(localTodoMatchesList(row, "alice", "created"), true);
  assert.equal(localTodoMatchesList(row, "bob", "created"), false);
  assert.equal(localTodoMatchesList(row, "bob", "mine"), true);
}

(async () => {
  await testJsonBridgeLifecycle();
  await testSqliteBridgeLifecycle();
  testPureHelpers();
  console.log("local todo bridge service tests passed");
})();
