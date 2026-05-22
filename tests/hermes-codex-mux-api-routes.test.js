"use strict";

const assert = require("node:assert/strict");
const {
  HERMES_CODEX_MUX_API_ROUTE_SPECS,
  createHermesCodexMuxApiRoutes,
} = require("../server-routes/hermes-codex-mux-api-routes");
const { createHermesCodexMuxService } = require("../adapters/hermes-codex-mux-service");

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

function makeReq(method, path, body) {
  return {
    method,
    url: path,
    headers: {},
    body,
  };
}

function makeRoutes(overrides = {}) {
  return createHermesCodexMuxApiRoutes(Object.assign({
    hermesCodexMuxService: createHermesCodexMuxService(),
    async readBody(req) {
      return req.body == null ? "" : JSON.stringify(req.body);
    },
    requireOwner() {
      return true;
    },
    sendJson,
  }, overrides));
}

async function request(routes, method, path, body) {
  const res = makeResponse();
  const result = await routes.handle(makeReq(method, path, body), res, makeUrl(path));
  return { result, res, body: parseBody(res) };
}

async function testRouteMetadata() {
  assert.equal(HERMES_CODEX_MUX_API_ROUTE_SPECS.length, 6);
  const routes = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/codex-mux/tasks" }).id, "codex-mux-tasks-list");
  assert.equal(routes.match({ method: "POST", path: "/api/codex-mux/tasks" }).id, "codex-mux-tasks-create");
  assert.equal(routes.match({ method: "GET", path: "/api/codex-mux/tasks/task-1" }).id, "codex-mux-task-detail");
  assert.equal(routes.match({ method: "GET", path: "/api/codex-mux/tasks/task-1/events" }).id, "codex-mux-task-events-list");
  assert.equal(routes.match({ method: "POST", path: "/api/codex-mux/tasks/task-1/events" }).id, "codex-mux-task-events-append");
  assert.equal(routes.match({ method: "POST", path: "/api/codex-mux/workers/codex-hermes-main/heartbeat" }).id, "codex-mux-worker-heartbeat");
}

async function testCreateListDetailEventAndHeartbeat() {
  const routes = makeRoutes();
  let response = await request(routes, "POST", "/api/codex-mux/tasks", {
    taskId: "hermes-codex-mux-v1",
    title: "Mux bridge",
    status: "open",
    assignedWorker: "codex-hermes-main",
    capsule: { taskId: "hermes-codex-mux-v1", assignedWorker: "codex-hermes-main" },
  });
  assert.equal(response.res.statusCode, 200);
  assert.equal(response.body.task.taskId, "hermes-codex-mux-v1");

  response = await request(routes, "GET", "/api/codex-mux/tasks?assignedWorker=codex-hermes-main&status=open,running");
  assert.equal(response.body.tasks.length, 1);

  response = await request(routes, "POST", "/api/codex-mux/workers/codex-hermes-main/heartbeat", {
    bridgeId: "hermes-mobile-codex-main",
    workspace: "C:\\Users\\xuxin\\Documents\\Agent",
    mode: "sticky",
    capabilities: ["codex.workspace.preflight"],
    currentTaskId: "hermes-codex-mux-v1",
  });
  assert.equal(response.body.heartbeat.workerId, "codex-hermes-main");

  response = await request(routes, "GET", "/api/codex-mux/tasks/hermes-codex-mux-v1");
  assert.equal(response.body.capsule.taskId, "hermes-codex-mux-v1");
  assert.equal(response.body.heartbeat.currentTaskId, "hermes-codex-mux-v1");

  response = await request(routes, "POST", "/api/codex-mux/tasks/hermes-codex-mux-v1/events", {
    type: "assistance.requested",
    from: "codex",
    workerId: "codex-hermes-main",
    payload: {
      requestId: "req_1",
      capability: "hermes.production.status.query",
      constraints: { noSecrets: true },
    },
  });
  assert.equal(response.body.event.requestId, "req_1");
  assert.equal(response.body.event.payload.constraints.noSecrets, true);

  response = await request(routes, "GET", "/api/codex-mux/tasks/hermes-codex-mux-v1/events");
  assert.equal(response.body.events.length, 1);
  assert.equal(response.body.events[0].type, "assistance.requested");
}

async function testOwnerRequired() {
  const routes = makeRoutes({
    requireOwner(req, res) {
      sendJson(res, 403, { error: "Owner access is required" });
      return false;
    },
  });
  const response = await request(routes, "GET", "/api/codex-mux/tasks");
  assert.equal(response.res.statusCode, 403);
  assert.equal(response.body.error, "Owner access is required");
}

async function run() {
  await testRouteMetadata();
  await testCreateListDetailEventAndHeartbeat();
  await testOwnerRequired();
  console.log("hermes-codex-mux-api-routes tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
