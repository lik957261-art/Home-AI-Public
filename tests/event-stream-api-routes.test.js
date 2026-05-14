"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  EVENT_STREAM_API_ROUTE_SPECS,
  createEventStreamApiRoutes,
} = require("../server-routes/event-stream-api-routes");

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    chunks: [],
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = Object.assign({}, headers);
    },
    write(chunk = "") {
      this.chunks.push(String(chunk));
      this.body += String(chunk);
    },
    end(body = "") {
      this.body += String(body);
    },
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function makeUrl(path) {
  return new URL(path, "http://localhost");
}

function makeRequest(method = "GET", url = "/api/events") {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = {};
  return req;
}

function makeRoutes(overrides = {}) {
  const clients = new Set();
  const calls = {
    clearInterval: [],
    intervals: [],
    prune: 0,
  };
  let version = "20260514";
  const deps = Object.assign({
    activeStreams() {
      return new Map([["run-1", {}]]);
    },
    authenticateRequest(req) {
      return req.unauthorized ? { ok: false } : { ok: true, workspaceId: "owner" };
    },
    clientVersionInfo(reported) {
      return { version, reported, refreshRequired: reported !== version };
    },
    clients,
    effectiveHermesApiBase() {
      return "http://127.0.0.1:8642";
    },
    pruneEmptyThreads() {
      calls.prune += 1;
    },
    readClientVersion() {
      return version;
    },
    runConcurrencySnapshot() {
      return { activeGlobal: 1 };
    },
    sendJson,
    setInterval(fn, ms) {
      const id = { fn, ms };
      calls.intervals.push(id);
      return id;
    },
    clearInterval(id) {
      calls.clearInterval.push(id);
    },
    state() {
      return {
        threads: [
          { id: "visible", workspaceId: "owner" },
          { id: "hidden", workspaceId: "other" },
        ],
      };
    },
    threadAccessibleToAuth(auth, thread) {
      return auth.workspaceId === thread.workspaceId;
    },
    threadSummary(thread) {
      return { id: thread.id };
    },
  }, overrides);
  return {
    calls,
    clients,
    routes: createEventStreamApiRoutes(deps),
    setVersion(next) {
      version = next;
    },
  };
}

async function request(routes, req, res) {
  return routes.handle(req, res, makeUrl(req.url), {});
}

async function testMetadataAndFallthrough() {
  assert.deepEqual(EVENT_STREAM_API_ROUTE_SPECS.map((route) => route.id), ["events"]);
  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/events" }).id, "events");
  assert.equal(routes.match({ method: "POST", path: "/api/events" }).id, "events");
  assert.equal(routes.summary({ public: true }).byModule.events, 1);
  const res = makeResponse();
  const result = await request(routes, makeRequest("GET", "/api/status"), res);
  assert.equal(result.handled, false);
}

async function testUnauthorized() {
  const { routes, clients } = makeRoutes();
  const req = makeRequest();
  req.unauthorized = true;
  const res = makeResponse();
  const result = await request(routes, req, res);
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 401);
  assert.equal(clients.size, 0);
  assert.deepEqual(JSON.parse(res.body), { error: "Unauthorized" });
}

async function testSnapshotHeartbeatAndClose() {
  const ctx = makeRoutes();
  const req = makeRequest("GET", "/api/events?clientVersion=20260514");
  const res = makeResponse();
  const result = await request(ctx.routes, req, res);

  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "text/event-stream; charset=utf-8");
  assert.equal(ctx.calls.prune, 1);
  assert.equal(ctx.clients.size, 1);
  assert.equal(ctx.calls.intervals.length, 1);
  const snapshot = JSON.parse(res.chunks[0].replace(/^data: /, "").trim());
  assert.equal(snapshot.type, "snapshot");
  assert.deepEqual(snapshot.threads, [{ id: "visible" }]);
  assert.equal(snapshot.status.activeRuns, 1);

  ctx.calls.intervals[0].fn();
  assert.match(res.body, /: keepalive/);

  ctx.setVersion("20260515");
  ctx.calls.intervals[0].fn();
  assert.match(res.body, /"type":"client.version"/);

  req.emit("close");
  assert.equal(ctx.clients.size, 0);
  assert.deepEqual(ctx.calls.clearInterval, [ctx.calls.intervals[0]]);
}

function testDependencyValidation() {
  assert.throws(
    () => createEventStreamApiRoutes({}),
    /event stream api routes require authenticateRequest/,
  );
}

async function run() {
  await testMetadataAndFallthrough();
  await testUnauthorized();
  await testSnapshotHeartbeatAndClose();
  testDependencyValidation();
  console.log("event stream api routes tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
