"use strict";

const assert = require("node:assert/strict");
const {
  ACTION_INBOX_API_ROUTE_SPECS,
  createActionInboxApiRoutes,
} = require("../server-routes/action-inbox-api-routes");

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

function makeUrl(pathname) {
  return new URL(pathname, "http://localhost");
}

function makeRoutes(overrides = {}) {
  const calls = {
    broadcast: [],
    complete: [],
    create: [],
    dismiss: [],
    financeReview: [],
    get: [],
    interpretTodo: [],
    list: [],
    snooze: [],
    todoCreate: [],
    todoTick: [],
    todoValidate: [],
    todoComplete: [],
    workspaceAccess: [],
  };
  const items = new Map([
    ["item-1", { id: "item-1", workspaceId: "child", assigneeWorkspaceId: "child", itemType: "todo", status: "open", title: "Review" }],
  ]);
  const deps = Object.assign({
    actionInboxService: {
      listItems(input) {
        calls.list.push(input);
        return { ok: true, items: [...items.values()], counts: { byStatus: { open: 1 }, bySourceType: {} }, source: { name: "action_inbox" } };
      },
      createManualItem(input) {
        calls.create.push(input);
        return { ok: true, item: { id: "manual-1", workspaceId: input.workspaceId, status: "open" } };
      },
      getItem(input) {
        calls.get.push(input);
        const item = items.get(input.itemId);
        if (!item) return { ok: false, status: 404, error: "action_inbox_item_not_found" };
        return { ok: true, item, events: [] };
      },
      completeItem(input) {
        calls.complete.push(input);
        return { ok: true, item: Object.assign({}, items.get(input.itemId), { status: "done" }) };
      },
      dismissItem(input) {
        calls.dismiss.push(input);
        return { ok: true, item: Object.assign({}, items.get(input.itemId), { status: "dismissed" }) };
      },
      snoozeItem(input) {
        calls.snooze.push(input);
        return { ok: true, item: Object.assign({}, items.get(input.itemId), { status: "waiting" }) };
      },
    },
    actionInboxTodoService: {
      validateDraft(input) {
        calls.todoValidate.push(input);
        return { ok: true, draft: { title: input.title || "", assigneeWorkspaceId: input.assigneeWorkspaceId || "" }, needsConfirmation: false, missingFields: [] };
      },
      createTodo(input) {
        calls.todoCreate.push(input);
        return Promise.resolve({ ok: true, item: { id: "todo-1", workspaceId: input.assigneeWorkspaceId, assigneeWorkspaceId: input.assigneeWorkspaceId, itemType: "todo", status: "open" } });
      },
      activateDueReminders(input) {
        calls.todoTick.push(input);
        return Promise.resolve({ ok: true, items: [{ id: "todo-1", workspaceId: "child", assigneeWorkspaceId: "child" }], activatedCount: 1 });
      },
      completeTodoItem(input) {
        calls.todoComplete.push(input);
        return Promise.resolve({ ok: true, item: Object.assign({}, items.get(input.itemId), { itemType: "todo", status: "done" }) });
      },
    },
    financeLedgerJoinApprovalService: {
      reviewRequest(input) {
        calls.financeReview.push(input);
        return { ok: true, item: Object.assign({}, items.get(input.itemId), { status: input.decision === "approve" ? "done" : "dismissed" }) };
      },
    },
    interpretTodoNaturalLanguage(text, workspace, principalId) {
      calls.interpretTodo.push({ text, workspace, principalId });
      return Promise.resolve({
        title: "提交发票",
        summary: "自然语言生成",
        creatorWorkspaceId: workspace.id,
        assigneeWorkspaceId: "child",
        dueAt: "2026-06-14T18:00:00+08:00",
        recurrence: { kind: "none" },
        needsConfirmation: false,
        missingFields: [],
        confidence: 0.95,
        sourceText: text,
      });
    },
    findWorkspace(workspaceId) {
      return { id: workspaceId, label: `Workspace ${workspaceId}` };
    },
    listAssignableWorkspaces() {
      return [{ id: "child", displayName: "Child", aliases: ["孩子"] }];
    },
    broadcast(payload) {
      calls.broadcast.push(payload);
    },
    readBody(req) {
      return Promise.resolve(req.body || {});
    },
    requireOwner(req, res) {
      if (req.headers?.["x-owner"] === "0") {
        sendJson(res, 403, { error: "Owner access required" });
        return false;
      }
      return true;
    },
    requireWorkspaceAccess(req, res, workspaceId) {
      calls.workspaceAccess.push(workspaceId);
      if (workspaceId === "blocked") {
        sendJson(res, 403, { error: "Workspace access is not allowed" });
        return "";
      }
      return String(workspaceId || "owner");
    },
    sendJson,
    workspacePrincipal: (workspaceId) => `principal:${workspaceId}`,
  }, overrides);
  return { calls, routes: createActionInboxApiRoutes(deps) };
}

async function request(routes, method, path, options = {}) {
  const res = makeResponse();
  const result = await routes.handle(
    { method, url: path, headers: {}, body: options.body || {} },
    res,
    makeUrl(path),
    Object.hasOwn(options, "auth") ? { auth: options.auth } : {},
  );
  return { result, res, body: parseBody(res) };
}

async function testRouteMetadataAndFallthrough() {
  assert.deepEqual(ACTION_INBOX_API_ROUTE_SPECS.map((route) => route.id), [
    "action-inbox-list",
    "action-inbox-create",
    "action-inbox-todo-draft-validate",
    "action-inbox-todo-draft-interpret",
    "action-inbox-todo-create",
    "action-inbox-todo-tick",
    "action-inbox-detail",
    "action-inbox-action",
    "action-inbox-finance-ledger-join-review",
  ]);
  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/action-inbox" }).id, "action-inbox-list");
  assert.equal(routes.match({ method: "POST", path: "/api/action-inbox" }).id, "action-inbox-create");
  assert.equal(routes.match({ method: "POST", path: "/api/action-inbox/todo-drafts/validate" }).id, "action-inbox-todo-draft-validate");
  assert.equal(routes.match({ method: "POST", path: "/api/action-inbox/todo-drafts/interpret" }).id, "action-inbox-todo-draft-interpret");
  assert.equal(routes.match({ method: "POST", path: "/api/action-inbox/todos" }).id, "action-inbox-todo-create");
  assert.equal(routes.match({ method: "POST", path: "/api/action-inbox/todos/tick" }).id, "action-inbox-todo-tick");
  assert.equal(routes.match({ method: "GET", path: "/api/action-inbox/item%2F1" }).id, "action-inbox-detail");
  assert.equal(routes.match({ method: "POST", path: "/api/action-inbox/item-1/complete" }).id, "action-inbox-action");
  assert.equal(routes.match({ method: "POST", path: "/api/action-inbox/item-1/finance-ledger-join/approve" }).id, "action-inbox-finance-ledger-join-review");

  const miss = await request(routes, "GET", "/api/status");
  assert.equal(miss.result.handled, false);
  assert.equal(miss.res.statusCode, 0);
}

async function testTodoDraftCreateAndTickRoutes() {
  const { routes, calls } = makeRoutes();
  const draft = await request(routes, "POST", "/api/action-inbox/todo-drafts/validate", {
    auth: { principalId: "owner" },
    body: { workspaceId: "owner", title: "提交发票", assigneeWorkspaceId: "child" },
  });
  assert.equal(draft.res.statusCode, 200);
  assert.equal(calls.todoValidate[0].creatorWorkspaceId, "owner");

  const interpreted = await request(routes, "POST", "/api/action-inbox/todo-drafts/interpret", {
    auth: { principalId: "owner" },
    body: { workspaceId: "owner", text: "明天下午六点提醒孩子提交发票" },
  });
  assert.equal(interpreted.res.statusCode, 200);
  assert.equal(calls.interpretTodo.length, 1);
  assert.equal(calls.interpretTodo[0].text, "明天下午六点提醒孩子提交发票");
  assert.equal(calls.interpretTodo[0].workspace.id, "owner");
  assert.deepEqual(calls.interpretTodo[0].workspace.assignableWorkspaces, [{ id: "child", displayName: "Child", aliases: ["孩子"] }]);
  assert.equal(calls.interpretTodo[0].principalId, "owner");
  assert.equal(calls.todoValidate.at(-1).sourceText, "明天下午六点提醒孩子提交发票");
  assert.equal(interpreted.body.draft.title, "提交发票");
  assert.equal(interpreted.body.draft.sourceText, "明天下午六点提醒孩子提交发票");

  const created = await request(routes, "POST", "/api/action-inbox/todos", {
    auth: { principalId: "owner" },
    body: { creatorWorkspaceId: "owner", assigneeWorkspaceId: "child", title: "提交发票", confirmed: true },
  });
  assert.equal(created.res.statusCode, 201);
  assert.equal(calls.todoCreate[0].creatorWorkspaceId, "owner");
  assert.equal(calls.todoCreate[0].assigneeWorkspaceId, "child");
  assert.deepEqual(calls.broadcast.at(-2), { type: "actionInbox.updated", workspaceId: "child", itemId: "todo-1", action: "todo-create" });
  assert.deepEqual(calls.broadcast.at(-1), { type: "actionInbox.updated", workspaceId: "owner", itemId: "todo-1", action: "todo-assigned" });

  const tick = await request(routes, "POST", "/api/action-inbox/todos/tick", {
    auth: { principalId: "owner" },
    body: { now: "2026-06-13T15:00:00.000Z" },
  });
  assert.equal(tick.res.statusCode, 200);
  assert.equal(calls.todoTick[0].now, "2026-06-13T15:00:00.000Z");
  assert.deepEqual(calls.broadcast.at(-1), { type: "actionInbox.updated", workspaceId: "child", itemId: "todo-1", action: "todo-reminder-due" });
}

async function testFinanceLedgerJoinReviewUsesItemWorkspaceAndBroadcastsRefresh() {
  const { routes, calls } = makeRoutes();
  const approved = await request(routes, "POST", "/api/action-inbox/item-1/finance-ledger-join/approve", {
    auth: { principalId: "owner" },
    body: { role: "viewer" },
  });
  assert.equal(approved.res.statusCode, 200);
  assert.equal(calls.financeReview.length, 1);
  assert.equal(calls.financeReview[0].itemId, "item-1");
  assert.equal(calls.financeReview[0].decision, "approve");
  assert.equal(calls.financeReview[0].workspaceId, "child");
  assert.deepEqual(calls.financeReview[0].auth, { principalId: "owner" });
  assert.deepEqual(calls.broadcast.at(-2), {
    type: "actionInbox.updated",
    workspaceId: "child",
    itemId: "item-1",
    action: "finance-ledger-join-approve",
  });
  assert.deepEqual(calls.broadcast.at(-1), {
    type: "embeddedPlugin.refreshRequired",
    workspaceId: "child",
    pluginId: "finance",
    reason: "finance_ledger_join_reviewed",
  });
}

async function testListAndCreate() {
  const { routes, calls } = makeRoutes();
  const listed = await request(routes, "GET", "/api/action-inbox?workspaceId=child&status=open&sourceType=growth&excludeItemType=todo&limit=5&search=review");
  assert.equal(listed.res.statusCode, 200);
  assert.deepEqual(calls.workspaceAccess, ["child"]);
  assert.deepEqual(calls.list, [{
    workspaceId: "child",
    status: "open",
    sourceType: "growth",
    itemType: "",
    excludedItemTypes: ["todo"],
    search: "review",
    includeDone: false,
    limit: 5,
  }]);
  assert.equal(listed.body.items.length, 1);

  const created = await request(routes, "POST", "/api/action-inbox", {
    auth: { principalId: "owner" },
    body: { workspaceId: "child", title: "Manual", summary: "Check this" },
  });
  assert.equal(created.res.statusCode, 201);
  assert.equal(calls.create[0].workspaceId, "child");
  assert.deepEqual(calls.broadcast, [{ type: "actionInbox.updated", workspaceId: "child", itemId: "manual-1" }]);
}

async function testDetailAndMutationsUseItemWorkspace() {
  const { routes, calls } = makeRoutes();
  const detail = await request(routes, "GET", "/api/action-inbox/item-1");
  assert.equal(detail.res.statusCode, 200);
  assert.deepEqual(calls.workspaceAccess, ["child"]);

  const completed = await request(routes, "POST", "/api/action-inbox/item-1/complete", {
    auth: { principalId: "owner" },
    body: { reason: "done" },
  });
  assert.equal(completed.res.statusCode, 200);
  assert.equal(calls.complete[0]?.itemId, undefined);
  assert.equal(calls.todoComplete[0].itemId, "item-1");
  assert.equal(calls.todoComplete[0].workspaceId, "child");
  assert.deepEqual(calls.broadcast.at(-1), { type: "actionInbox.updated", workspaceId: "child", itemId: "item-1", action: "complete" });
}

async function main() {
  await testRouteMetadataAndFallthrough();
  await testListAndCreate();
  await testTodoDraftCreateAndTickRoutes();
  await testDetailAndMutationsUseItemWorkspace();
  await testFinanceLedgerJoinReviewUsesItemWorkspaceAndBroadcastsRefresh();
  console.log("action-inbox-api-routes tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
