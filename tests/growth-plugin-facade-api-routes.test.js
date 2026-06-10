"use strict";

const assert = require("node:assert/strict");
const {
  GROWTH_PLUGIN_FACADE_API_ROUTE_SPECS,
  createGrowthPluginFacadeApiRoutes,
} = require("../server-routes/growth-plugin-facade-api-routes");

function makeResponse() {
  return {
    statusCode: 0,
    body: "",
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(body = "") {
      this.body += String(body);
    },
  };
}

function makeDeps(options = {}) {
  const calls = [];
  const facade = options.facade || {
    status(input) {
      calls.push({ type: "status", input });
      return { facadeVersion: 1, migrationStage: "host_facade" };
    },
    board(input) {
      calls.push({ type: "board", input });
      return { facadeVersion: 1, board: { cards: [] } };
    },
    card(input) {
      calls.push({ type: "card", input });
      return input.taskCardId === "card_1"
        ? { facadeVersion: 1, card: { taskCardId: "card_1" } }
        : { facadeVersion: 1, card: null };
    },
  };
  const deps = {
    calls,
    authCanAccessWorkspace: options.authCanAccessWorkspace || ((auth, workspaceId) => workspaceId === auth.workspaceId),
    growthPluginFacadeService: facade,
    isOwnerAuth: options.isOwnerAuth || ((auth) => Boolean(auth?.owner)),
    requireWorkspaceAccess(req, res, workspaceId) {
      calls.push({ type: "requireWorkspaceAccess", workspaceId });
      return options.workspaceAccess === false ? null : workspaceId;
    },
    sendJson(res, status, payload) {
      calls.push({ type: "sendJson", status, payload });
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(payload));
    },
  };
  return deps;
}

async function handle(routes, method, path, auth) {
  const res = makeResponse();
  const url = new URL(path, "http://localhost");
  const result = await routes.handle({ method, url: path }, res, url, { auth });
  return { res, result };
}

async function testRouteInventory() {
  const deps = makeDeps();
  const routes = createGrowthPluginFacadeApiRoutes(deps);

  assert.equal(GROWTH_PLUGIN_FACADE_API_ROUTE_SPECS.length, 3);
  assert.equal(routes.list().length, 3);
  assert.equal(routes.match({ method: "GET", path: "/api/growth/v1/status" }).id, "growth-plugin-facade-status");
  assert.equal(routes.match({ method: "GET", path: "/api/growth/v1/cards/card_1" }).id, "growth-plugin-facade-card");
  assert.equal(routes.match({ method: "POST", path: "/api/growth/v1/status" }), null);
}

async function testStatusUsesOwnerDefaultWorkspace() {
  const deps = makeDeps();
  const routes = createGrowthPluginFacadeApiRoutes(deps);
  const { res, result } = await handle(routes, "GET", "/api/growth/v1/status", { ok: true, owner: true });

  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true, facadeVersion: 1, migrationStage: "host_facade" });
  assert.deepEqual(deps.calls.slice(0, 2), [
    { type: "requireWorkspaceAccess", workspaceId: "weixin_stephen" },
    {
      type: "status",
      input: {
        workspaceId: "weixin_stephen",
        learnerId: "weixin_stephen",
        studentId: "weixin_stephen",
        limit: null,
        owner: true,
        viewerRole: "owner",
      },
    },
  ]);
}

async function testMemberCannotReadAnotherLearner() {
  const deps = makeDeps();
  const routes = createGrowthPluginFacadeApiRoutes(deps);
  const { res } = await handle(
    routes,
    "GET",
    "/api/growth/v1/board?workspaceId=weixin_child&learnerId=weixin_other",
    { ok: true, owner: false, workspaceId: "weixin_child" },
  );

  assert.equal(res.statusCode, 403);
  assert.deepEqual(JSON.parse(res.body), { ok: false, error: "Learner access is not allowed" });
}

async function testCardLookupAndNotFound() {
  const deps = makeDeps();
  const routes = createGrowthPluginFacadeApiRoutes(deps);
  const found = await handle(
    routes,
    "GET",
    "/api/growth/v1/cards/card_1?workspaceId=weixin_child",
    { ok: true, owner: false, workspaceId: "weixin_child" },
  );
  const missing = await handle(
    routes,
    "GET",
    "/api/growth/v1/cards/missing?workspaceId=weixin_child",
    { ok: true, owner: false, workspaceId: "weixin_child" },
  );

  assert.equal(found.res.statusCode, 200);
  assert.equal(JSON.parse(found.res.body).card.taskCardId, "card_1");
  assert.equal(missing.res.statusCode, 404);
  assert.deepEqual(JSON.parse(missing.res.body), { ok: false, error: "Growth card not found" });
}

function testDependencyValidation() {
  assert.throws(() => createGrowthPluginFacadeApiRoutes({}), /require isOwnerAuth/);
  assert.throws(() => createGrowthPluginFacadeApiRoutes({
    isOwnerAuth() {},
    requireWorkspaceAccess() {},
    sendJson() {},
  }), /require growthPluginFacadeService/);
}

async function run() {
  await testRouteInventory();
  await testStatusUsesOwnerDefaultWorkspace();
  await testMemberCannotReadAnotherLearner();
  await testCardLookupAndNotFound();
  testDependencyValidation();
  console.log("growth plugin facade api route tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
