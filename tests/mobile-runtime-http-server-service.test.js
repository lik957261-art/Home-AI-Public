"use strict";

const assert = require("node:assert/strict");

const {
  createMobileRuntimeHttpServerService,
} = require("../adapters/mobile-runtime-http-server-service");

function createService(overrides = {}) {
  const logs = [];
  const errors = [];
  const events = [];
  const activeStreams = new Map();
  const server = {
    listenArgs: null,
    listen(port, host, callback) {
      this.listenArgs = { port, host };
      callback();
    },
  };
  const service = createMobileRuntimeHttpServerService(Object.assign({
    activeStreams,
    authProvider: { ownerKeySource: () => "file" },
    dataDir: "/data",
    disableAuth: false,
    effectiveHermesApiBase: () => "http://api",
    eventStreamApiRoutes: { handle: async () => ({ handled: false }) },
    getUrl: (req) => new URL(req.url, "http://local"),
    host: "127.0.0.1",
    http: { createServer: (handler) => { server.handler = handler; return server; } },
    httpRuntimeService: { attachSecurityHeaders: (_req, res) => { res.headersAttached = true; } },
    logger: { log: (value) => logs.push(value), error: (value) => errors.push(value) },
    mobileApiDispatcher: { handle: async (_req, res) => { res.dispatched = true; } },
    mobileApiServices: { learningGrowthSubmissionService: { scheduleEvaluationQueue: () => events.push("queue") } },
    port: 8797,
    process: {
      on: (name, handler) => events.push(["on", name, typeof handler]),
      exit: (code) => events.push(["exit", code]),
    },
    reconcileDetachedActiveRuns: () => events.push("reconcile"),
    sendJson: (res, status, data) => { res.sent = { status, data }; },
    serveStatic: (_req, res) => { res.static = true; },
    webPushDeliveryService: {
      startAutomationWebPushDispatcher: () => events.push("automation-push"),
      startTodoWebPushDispatcher: () => events.push("todo-push"),
    },
  }, overrides));
  return { activeStreams, errors, events, logs, server, service };
}

(async () => {
  const { events, logs, server, service } = createService();
  const started = service.start();
  assert.equal(started, server);
  assert.deepEqual(server.listenArgs, { port: 8797, host: "127.0.0.1" });
  assert.deepEqual(events.slice(0, 3), [["on", "SIGINT", "function"], ["on", "SIGTERM", "function"], "reconcile"]);
  assert.equal(events.includes("todo-push"), true);
  assert.equal(events.includes("automation-push"), true);
  assert.equal(events.includes("queue"), true);
  assert.match(logs.join("\n"), /Owner key source is file/);

  const apiResponse = {};
  await service.requestHandler({ method: "GET", url: "/api/status" }, apiResponse);
  assert.equal(apiResponse.headersAttached, true);
  assert.equal(apiResponse.dispatched, true);

  const staticResponse = {};
  await service.requestHandler({ method: "GET", url: "/app.js" }, staticResponse);
  assert.equal(staticResponse.headersAttached, true);
  assert.equal(staticResponse.static, true);

  const streamService = createService({ eventStreamApiRoutes: { handle: async (_req, res) => { res.stream = true; return { handled: true }; } } }).service;
  const streamResponse = {};
  await streamService.requestHandler({ method: "GET", url: "/api/events" }, streamResponse);
  assert.equal(streamResponse.stream, true);
  assert.equal(streamResponse.dispatched, undefined);

  const failure = createService({ eventStreamApiRoutes: { handle: async () => { throw new Error("boom"); } } });
  const failureResponse = {};
  await failure.service.requestHandler({ method: "GET", url: "/api/status" }, failureResponse);
  assert.equal(failureResponse.sent.status, 500);
  assert.match(failure.errors[0], /boom/);

  const streamedFailure = createService({ eventStreamApiRoutes: { handle: async (_req, res) => { res.headersSent = true; throw new Error("stream abort"); } } });
  const streamedFailureResponse = {};
  await streamedFailure.service.requestHandler({ method: "GET", url: "/api/hermes-plugins/codex-mobile/proxy/api/events" }, streamedFailureResponse);
  assert.equal(streamedFailureResponse.sent, undefined);
  assert.match(streamedFailure.errors[0], /stream abort/);

  const shutdownFixture = createService();
  let aborted = false;
  shutdownFixture.activeStreams.set("run_1", { controller: { abort: () => { aborted = true; } } });
  shutdownFixture.service.shutdown();
  assert.equal(aborted, true);
  assert.deepEqual(shutdownFixture.events, [["exit", 0]]);

  assert.throws(() => createMobileRuntimeHttpServerService({}), /requires activeStreams/);
})();

console.log("mobile runtime HTTP server service tests passed");
