"use strict";

const assert = require("node:assert/strict");
const {
  TODO_API_ROUTE_SPECS,
  createTodoApiRoutes,
} = require("../server-routes/todo-api-routes");

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = Object.assign({}, headers);
    },
    end(body = "") {
      this.body = body;
    },
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function parseBody(res) {
  return JSON.parse(res.body || "{}");
}

function makeUrl(path) {
  return new URL(path, "http://localhost");
}

function makeRoutes(overrides = {}) {
  const calls = {
    add: [],
    broadcast: [],
    cacheClear: [],
    error: [],
    inbox: [],
    list: [],
    mutate: [],
    notify: [],
    owner: [],
    pushTick: [],
    reconcile: [],
    workspaceAccess: [],
  };
  const deps = Object.assign({
    boolParam(value) {
      return /^(1|true|yes|on)$/i.test(String(value || ""));
    },
    broadcast(payload) {
      calls.broadcast.push(payload);
    },
    clearKanbanCardListCache(workspaceId) {
      calls.cacheClear.push(workspaceId);
    },
    maybeReconcileKanbanDependencyBlocks(workspaceId) {
      calls.reconcile.push(workspaceId);
      return Promise.resolve({ ok: true, workspaceId });
    },
    notifyTodoCreated(result, principalId) {
      calls.notify.push({ id: result.id, principalId });
    },
    actionInboxService: {
      listItems(input) {
        calls.list.push(input);
        return {
          ok: true,
          items: [{ id: "ainb-todo-1", title: "Task", status: "open", workspaceId: input.workspaceId, assigneeWorkspaceId: input.workspaceId, sourceRef: { creatorWorkspaceId: input.workspaceId } }],
          counts: { byStatus: { open: 1 } },
          source: { name: "action_inbox" },
        };
      },
      upsertSourceItem(input) {
        calls.inbox.push(input);
        return { ok: true, item: { id: "ainb-todo-new", workspaceId: input.workspaceId } };
      },
      dismissItem(input) {
        calls.mutate.push(Object.assign({ action: "dismiss" }, input));
        return { ok: true, item: { id: input.itemId, status: "dismissed", workspaceId: input.workspaceId } };
      },
    },
    actionInboxTodoService: {
      createTodo(input) {
        calls.add.push(input);
        return Promise.resolve({
          ok: true,
          item: { id: "ainb-todo-new", title: input.title, status: "open", workspaceId: input.assigneeWorkspaceId, assigneeWorkspaceId: input.assigneeWorkspaceId, sourceRef: { creatorWorkspaceId: input.creatorWorkspaceId } },
          creatorTrackingItem: input.creatorWorkspaceId !== input.assigneeWorkspaceId ? { id: "ainb-sent-new", workspaceId: input.creatorWorkspaceId } : null,
        });
      },
      completeTodoItem(input) {
        calls.mutate.push(Object.assign({ action: "complete" }, input));
        return Promise.resolve({ ok: true, item: { id: input.itemId, status: "done", workspaceId: input.workspaceId } });
      },
    },
    publicTodo(result) {
      return { id: result.id, title: result.content || result.title || "" };
    },
    readBody(req) {
      return Promise.resolve(req.body || {});
    },
    requireOwner(req, res) {
      calls.owner.push(req.owner === true);
      if (req.owner === true) return true;
      sendJson(res, 403, { error: "Owner access is required" });
      return false;
    },
    requireWorkspaceAccess(req, res, workspaceId) {
      calls.workspaceAccess.push(workspaceId);
      if (workspaceId === "blocked") {
        sendJson(res, 403, { error: "Workspace access is not allowed" });
        return "";
      }
      return String(workspaceId || "owner");
    },
    runTodoWebPushTick(payload) {
      calls.pushTick.push(payload);
      return Promise.resolve({ ok: true, dryRun: payload.dryRun, limit: payload.limit });
    },
    sendJson,
    todoErrorResponse(res, result) {
      calls.error.push(result);
      sendJson(res, result.status || 400, { error: result.error || "Todo failed", result });
    },
    todoProvider: {
      listTodos(payload) {
        calls.list.push(payload);
        return Promise.resolve({
          ok: true,
          data: [{ id: "todo-1", title: "Task" }],
          assignees: [{ id: "owner", label: "Owner" }],
          source: { name: "hermes_kanban" },
        });
      },
      addTodo(payload) {
        calls.add.push(payload);
        return Promise.resolve({ ok: true, id: "todo-new", content: payload.content });
      },
      mutateTodo(payload) {
        calls.mutate.push(payload);
        return Promise.resolve({ ok: true, id: payload.todoId, action: payload.action });
      },
    },
    useKanbanTodoBackend() {
      return true;
    },
    workspacePrincipal(workspaceId) {
      return `principal-${workspaceId}`;
    },
  }, overrides);
  return { routes: createTodoApiRoutes(deps), calls };
}

async function request(routes, method, path, options = {}) {
  const res = makeResponse();
  const result = await routes.handle(
    { method, url: path, headers: {}, body: options.body || {}, owner: options.owner },
    res,
    makeUrl(path),
    Object.hasOwn(options, "auth") ? { auth: options.auth } : {},
  );
  return { result, res, body: parseBody(res) };
}

async function testRouteMetadataAndFallthrough() {
  assert.deepEqual(TODO_API_ROUTE_SPECS.map((route) => route.id), [
    "todos-list",
    "todos-create",
    "todos-push-tick",
    "todos-action",
  ]);
  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/todos" }).id, "todos-list");
  assert.equal(routes.match({ method: "POST", path: "/api/todos" }).id, "todos-create");
  assert.equal(routes.match({ method: "POST", path: "/api/todos/todo%2F1/block" }).id, "todos-action");
  assert.equal(routes.match({ method: "POST", path: "/api/todos/push/tick" }).id, "todos-push-tick");
  assert.equal(routes.match({ method: "GET", path: "/api/todos/todo-1/block" }), null);

  const summary = routes.summary({ public: true });
  assert.equal(summary.total, 4);
  assert.deepEqual(summary.byAuthMode, { "access-key": 3, owner: 1 });
  assert.equal(JSON.stringify(summary).includes("/api/todos"), false);

  const miss = await request(routes, "GET", "/api/status");
  assert.equal(miss.result.handled, false);
  assert.equal(miss.res.statusCode, 0);
}

async function testListRunsMaintenanceAndProvider() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "GET", "/api/todos?workspaceId=child&scope=all&includeCompleted=1&assignee=stephen&limit=7&search=math");
  assert.equal(got.result.handled, true);
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.workspaceAccess, ["child"]);
  assert.deepEqual(calls.list, [{
    workspaceId: "child",
    itemType: "todo",
    includeDone: true,
    limit: 7,
    search: "math",
  }]);
  assert.deepEqual(got.body, {
    data: [{ id: "ainb-todo-1", content: "Task", title: "Task", summary: "", status: "open", assignee: "child", assigneeLabel: "child", createdBy: "child", dueAt: "", dueLocal: "", source: "action_inbox", workspaceId: "child" }],
    assignees: [],
    source: { name: "action_inbox_todos", compatibilityRoute: "/api/todos" },
    maintenance: null,
  });
}

async function testListSkipsMaintenanceWhenKanbanBackendOff() {
  const { routes, calls } = makeRoutes({
    useKanbanTodoBackend() {
      return false;
    },
  });
  const got = await request(routes, "GET", "/api/todos?workspaceId=owner");
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.reconcile, []);
  assert.equal(got.body.maintenance, null);
}

async function testCreateBroadcastsAndNotifies() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "POST", "/api/todos", {
    body: {
      workspaceId: "child",
      assignee: "stephen",
      content: "Read chapter 1",
      due_time: "21:00",
      reminder_lead_minutes: 10,
      recurrence: "daily",
      recurrence_days: "1,2,3",
      recurrence_until: "2026-06-01",
    },
  });
  assert.equal(got.res.statusCode, 201);
  assert.deepEqual(calls.add, [{
    creatorWorkspaceId: "child",
    assigneeWorkspaceId: "stephen",
    title: "Read chapter 1",
    summary: "",
    dueAt: "21:00",
    remindAt: "",
    priority: "normal",
    confirmed: true,
    actorPrincipalId: "principal-child",
  }]);
  assert.deepEqual(calls.broadcast, [
    { type: "actionInbox.updated", workspaceId: "stephen", itemId: "ainb-todo-new", action: "todo-create" },
    { type: "actionInbox.updated", workspaceId: "child", itemId: "ainb-sent-new", action: "todo-assigned" },
  ]);
  assert.deepEqual(calls.cacheClear, []);
  assert.deepEqual(calls.notify, []);
  assert.deepEqual(got.body.todo, { id: "ainb-todo-new", content: "Read chapter 1", title: "Read chapter 1", summary: "", status: "open", assignee: "stephen", assigneeLabel: "stephen", createdBy: "child", dueAt: "", dueLocal: "", source: "action_inbox", workspaceId: "stephen" });
}

async function testActionDecodesTodoIdAndBroadcasts() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "POST", "/api/todos/todo%2F42/complete?workspaceId=child", {
    body: {
      comment: "needs revision",
      title: "New title",
      description: "Details",
      recurrence_scope: "future",
      author: "manager",
    },
  });
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.mutate, [{
    action: "complete",
    workspaceId: "child",
    itemId: "todo/42",
    actorPrincipalId: "principal-child",
    comment: "needs revision",
  }]);
  assert.deepEqual(calls.cacheClear, []);
  assert.deepEqual(calls.broadcast, [{ type: "actionInbox.updated", workspaceId: "child", itemId: "todo/42", action: "complete" }]);
  assert.deepEqual(got.body, { ok: true, result: { ok: true, item: { id: "todo/42", status: "done", workspaceId: "child" } } });
}

async function testPushTickOwnerOnlyAndErrorShape() {
  const { routes, calls } = makeRoutes();
  const denied = await request(routes, "POST", "/api/todos/push/tick", { body: { dryRun: true } });
  assert.equal(denied.res.statusCode, 403);
  assert.deepEqual(calls.pushTick, []);

  const got = await request(routes, "POST", "/api/todos/push/tick?dryRun=1&limit=5", { owner: true });
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.pushTick, [{ dryRun: true, limit: 5 }]);

  const failing = makeRoutes({
    runTodoWebPushTick() {
      throw new Error("push failed");
    },
  });
  const failed = await request(failing.routes, "POST", "/api/todos/push/tick", { owner: true });
  assert.equal(failed.res.statusCode, 500);
  assert.deepEqual(failed.body, { ok: false, error: "push failed" });
}

async function testProviderFailuresUseTodoErrorResponse() {
  const { routes, calls } = makeRoutes({
    actionInboxService: {
      listItems() {
        return { ok: false, status: 503, error: "list down" };
      },
      dismissItem() {
        return { ok: false, status: 404, error: "missing" };
      },
    },
    actionInboxTodoService: {
      createTodo() {
        return Promise.resolve({ ok: false, status: 409, error: "duplicate" });
      },
      completeTodoItem() {
        return Promise.resolve({ ok: false, status: 404, error: "missing" });
      },
    },
  });
  const list = await request(routes, "GET", "/api/todos");
  assert.equal(list.res.statusCode, 503);
  const add = await request(routes, "POST", "/api/todos", { body: { content: "x" } });
  assert.equal(add.res.statusCode, 409);
  const mutate = await request(routes, "POST", "/api/todos/todo-1/complete");
  assert.equal(mutate.res.statusCode, 404);
  assert.deepEqual([list.body.error, add.body.error, mutate.body.error], ["list down", "duplicate", "missing"]);
}

function testDependencyValidation() {
  assert.throws(
    () => createTodoApiRoutes({}),
    /todo api routes require boolParam/,
  );
  assert.throws(
    () => createTodoApiRoutes({
      boolParam() {},
      broadcast() {},
      clearKanbanCardListCache() {},
      maybeReconcileKanbanDependencyBlocks() {},
      notifyTodoCreated() {},
      publicTodo() {},
      readBody() {},
      requireOwner() {},
      requireWorkspaceAccess() {},
      runTodoWebPushTick() {},
      sendJson() {},
      workspacePrincipal() {},
      actionInboxService: {},
    }),
    /todo api routes require actionInboxService\.listItems\/dismissItem/,
  );
}

(async () => {
  await testRouteMetadataAndFallthrough();
  await testListRunsMaintenanceAndProvider();
  await testListSkipsMaintenanceWhenKanbanBackendOff();
  await testCreateBroadcastsAndNotifies();
  await testActionDecodesTodoIdAndBroadcasts();
  await testPushTickOwnerOnlyAndErrorShape();
  await testProviderFailuresUseTodoErrorResponse();
  testDependencyValidation();
  console.log("todo api routes tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
