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
    get: [],
    list: [],
    snooze: [],
    workspaceAccess: [],
  };
  const items = new Map([
    ["item-1", { id: "item-1", workspaceId: "child", status: "open", title: "Review" }],
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
    broadcast(payload) {
      calls.broadcast.push(payload);
    },
    readBody(req) {
      return Promise.resolve(req.body || {});
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
    "action-inbox-detail",
    "action-inbox-action",
  ]);
  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/action-inbox" }).id, "action-inbox-list");
  assert.equal(routes.match({ method: "POST", path: "/api/action-inbox" }).id, "action-inbox-create");
  assert.equal(routes.match({ method: "GET", path: "/api/action-inbox/item%2F1" }).id, "action-inbox-detail");
  assert.equal(routes.match({ method: "POST", path: "/api/action-inbox/item-1/complete" }).id, "action-inbox-action");

  const miss = await request(routes, "GET", "/api/status");
  assert.equal(miss.result.handled, false);
  assert.equal(miss.res.statusCode, 0);
}

async function testListAndCreate() {
  const { routes, calls } = makeRoutes();
  const listed = await request(routes, "GET", "/api/action-inbox?workspaceId=child&status=open&sourceType=growth&limit=5&search=review");
  assert.equal(listed.res.statusCode, 200);
  assert.deepEqual(calls.workspaceAccess, ["child"]);
  assert.deepEqual(calls.list, [{
    workspaceId: "child",
    status: "open",
    sourceType: "growth",
    itemType: "",
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
  assert.equal(calls.complete[0].itemId, "item-1");
  assert.equal(calls.complete[0].workspaceId, "child");
  assert.deepEqual(calls.broadcast.at(-1), { type: "actionInbox.updated", workspaceId: "child", itemId: "item-1", action: "complete" });
}

async function main() {
  await testRouteMetadataAndFallthrough();
  await testListAndCreate();
  await testDetailAndMutationsUseItemWorkspace();
  console.log("action-inbox-api-routes tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
