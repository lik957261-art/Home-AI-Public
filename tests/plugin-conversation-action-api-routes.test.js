"use strict";

const assert = require("node:assert/strict");
const { createPluginConversationActionApiRoutes } = require("../server-routes/plugin-conversation-action-api-routes");

function makeResponse() {
  return {
    statusCode: 0,
    body: "",
    headers: {},
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = Object.assign({}, headers);
    },
    end(chunk = "") {
      this.body += String(chunk);
    },
  };
}

function makeReq(method, url, body = {}) {
  return { method, url, headers: {}, body };
}

function jsonBody(res) {
  return JSON.parse(res.body || "{}");
}

function createDeps(options = {}) {
  const calls = [];
  const thread = options.thread || {
    id: "thread_1",
    workspaceId: "owner",
    messages: [{ id: "assistant_1", role: "assistant" }],
  };
  return {
    calls,
    deps: {
      pluginConversationActionBridgeService: options.bridgeService || {
        async createRequest(input) {
          calls.push({ type: "createRequest", input });
          return { ok: true, inboxItem: { id: "ainb_plugin_1" }, autoDispatched: false };
        },
        async dispatchTaskCard(input) {
          calls.push({ type: "dispatchTaskCard", input });
          return {
            ok: true,
            inboxItem: { id: input.itemId, status: "done" },
            taskCardIds: ["ttc_plugin_1"],
            taskCardResult: { cardIds: ["ttc_plugin_1"] },
          };
        },
      },
      findThreadForRequest(_req, threadId) {
        calls.push({ type: "findThreadForRequest", threadId });
        return threadId === thread.id ? thread : null;
      },
      broadcast(event) {
        calls.push({ type: "broadcast", event });
      },
      async readBody(req) {
        calls.push({ type: "readBody" });
        return req.body || {};
      },
      requireOwner(req, res) {
        calls.push({ type: "requireOwner" });
        if (options.denyOwner) {
          res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: false, error: "owner_required" }));
          return null;
        }
        return { owner: true };
      },
      requireWorkspaceAccess(req, res, workspaceId) {
        calls.push({ type: "requireWorkspaceAccess", workspaceId });
        if (options.denyWorkspace) {
          res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: false, error: "workspace_denied" }));
          return "";
        }
        return workspaceId;
      },
      wardrobeOutfitWearIntentActionService: options.wardrobeOutfitWearIntentActionService || {
        async execute(input) {
          calls.push({ type: "executeWardrobeOutfitWearIntent", input });
          return {
            ok: true,
            status: 200,
            actionState: { status: input.confirmReplace ? "stored" : "needs_confirmation" },
            message: { id: input.message.id, pluginActions: { wardrobeOutfitWearIntent: { status: "needs_confirmation" } } },
            thread: { id: input.thread.id },
          };
        },
      },
      sendJson(res, status, payload) {
        calls.push({ type: "sendJson", status, payload });
        res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(payload));
      },
    },
  };
}

async function testCreateRequestRequiresWorkspaceAndNotifiesOwner() {
  const { deps, calls } = createDeps();
  const routes = createPluginConversationActionApiRoutes(deps);
  const req = makeReq("POST", "/api/plugin-conversation/actions", {
    workspaceId: "weixin_fanfan",
    pluginId: "health",
    requestType: "catalog_gap",
    summary: "Add push_up.",
  });
  const res = makeResponse();
  const result = await routes.handle(req, res, new URL(req.url, "http://localhost"), { auth: { workspaceId: "weixin_fanfan" } });
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 202);
  assert.equal(jsonBody(res).inboxItem.id, "ainb_plugin_1");
  assert.deepEqual(calls.find((call) => call.type === "requireWorkspaceAccess").workspaceId, "weixin_fanfan");
  assert.equal(calls.find((call) => call.type === "createRequest").input.pluginId, "health");
  assert.equal(calls.find((call) => call.type === "createRequest").input.workspaceId, "weixin_fanfan");
  assert.deepEqual(calls.find((call) => call.type === "broadcast").event, {
    type: "actionInbox.updated",
    workspaceId: "owner",
    itemId: "ainb_plugin_1",
  });
}

async function testOwnerDispatchesTaskCardWithPrompt() {
  const { deps, calls } = createDeps();
  const routes = createPluginConversationActionApiRoutes(deps);
  const req = makeReq("POST", "/api/plugin-conversation/actions/ainb_plugin_1/task-card", {
    ownerPrompt: "Use the existing catalog pattern.",
  });
  const res = makeResponse();
  await routes.handle(req, res, new URL(req.url, "http://localhost"), { auth: { principalId: "owner" } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(jsonBody(res).taskCardIds, ["ttc_plugin_1"]);
  assert.deepEqual(calls.find((call) => call.type === "dispatchTaskCard").input, {
    itemId: "ainb_plugin_1",
    ownerPrompt: "Use the existing catalog pattern.",
    actor: "owner",
  });
}

async function testDeniedWorkspaceStopsCreate() {
  const { deps, calls } = createDeps({ denyWorkspace: true });
  const routes = createPluginConversationActionApiRoutes(deps);
  const req = makeReq("POST", "/api/plugin-conversation/actions", { workspaceId: "owner", pluginId: "health" });
  const res = makeResponse();
  await routes.handle(req, res, new URL(req.url, "http://localhost"), { auth: { workspaceId: "owner" } });
  assert.equal(res.statusCode, 403);
  assert.equal(calls.some((call) => call.type === "createRequest"), false);
}

async function testDeniedOwnerStopsDispatch() {
  const { deps, calls } = createDeps({ denyOwner: true });
  const routes = createPluginConversationActionApiRoutes(deps);
  const req = makeReq("POST", "/api/plugin-conversation/actions/ainb_plugin_1/task-card", {});
  const res = makeResponse();
  await routes.handle(req, res, new URL(req.url, "http://localhost"));
  assert.equal(res.statusCode, 403);
  assert.equal(calls.some((call) => call.type === "dispatchTaskCard"), false);
}

async function testWardrobeOutfitWearIntentExecutesDeterministicAction() {
  const { deps, calls } = createDeps();
  const routes = createPluginConversationActionApiRoutes(deps);
  const req = makeReq("POST", "/api/plugin-conversation/actions/wardrobe/outfit-wear-intent", {
    workspaceId: "owner",
    threadId: "thread_1",
    messageId: "assistant_1",
    confirmReplace: true,
  });
  const res = makeResponse();
  await routes.handle(req, res, new URL(req.url, "http://localhost"), { auth: { workspaceId: "owner", principalId: "owner" } });
  assert.equal(res.statusCode, 200);
  assert.equal(jsonBody(res).actionState.status, "stored");
  const executeInput = calls.find((call) => call.type === "executeWardrobeOutfitWearIntent").input;
  assert.equal(executeInput.thread.id, "thread_1");
  assert.equal(executeInput.message.id, "assistant_1");
  assert.equal(executeInput.workspaceId, "owner");
  assert.equal(executeInput.principalId, "owner");
  assert.equal(executeInput.confirmReplace, true);
  assert.equal(executeInput.mode, undefined);
  assert.equal(calls.some((call) => call.type === "createRequest"), false);
  assert.equal(calls.some((call) => call.type === "dispatchTaskCard"), false);
}

function testNoRouteFallsThrough() {
  const { deps } = createDeps();
  const routes = createPluginConversationActionApiRoutes(deps);
  return routes.handle(makeReq("GET", "/api/plugin-conversation/actions"), makeResponse(), new URL("http://localhost/api/plugin-conversation/actions"))
    .then((result) => assert.equal(result.handled, false));
}

function testDependencyValidation() {
  assert.throws(() => createPluginConversationActionApiRoutes({}), /require readBody/);
  const { deps } = createDeps();
  assert.throws(() => createPluginConversationActionApiRoutes(Object.assign({}, deps, {
    pluginConversationActionBridgeService: { createRequest() {} },
  })), /dispatchTaskCard/);
}

async function run() {
  await testCreateRequestRequiresWorkspaceAndNotifiesOwner();
  await testOwnerDispatchesTaskCardWithPrompt();
  await testDeniedWorkspaceStopsCreate();
  await testDeniedOwnerStopsDispatch();
  await testWardrobeOutfitWearIntentExecutesDeterministicAction();
  await testNoRouteFallsThrough();
  testDependencyValidation();
  console.log("plugin conversation action API route tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
