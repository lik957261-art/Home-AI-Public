"use strict";

const assert = require("node:assert/strict");
const { createPublicApiRoutes } = require("../server-routes/public-api-routes");

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

function makeRoutes(overrides = {}) {
  const setup = { setupRequired: false, ownerConfigured: true };
  const deps = Object.assign({
    authenticateRequest(req) {
      return req.headers?.["x-hermes-web-key"] === "valid" ? { ok: true, workspaceId: "owner" } : { ok: false };
    },
    createInitialOwnerKey() {
      return { key: "created-key", workspaceId: "owner" };
    },
    ownerSetupStatus() {
      return setup;
    },
    readBody(req) {
      return Promise.resolve(req.body || {});
    },
    sendJson(res, status, data) {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
    },
  }, overrides);
  return createPublicApiRoutes(deps);
}

async function testPublicConfigAndSetupStatus() {
  const routes = makeRoutes();

  const publicRes = makeResponse();
  const publicResult = await routes.handle({ method: "POST", url: "/api/public-config", headers: {} }, publicRes, { pathname: "/api/public-config" });
  assert.equal(publicResult.handled, true);
  assert.equal(publicRes.statusCode, 200);
  assert.deepEqual(JSON.parse(publicRes.body), { title: "Home AI", setupRequired: false, ownerConfigured: true });

  const setupRes = makeResponse();
  const setupResult = await routes.handle({ method: "GET", url: "/api/setup/status", headers: {} }, setupRes, { pathname: "/api/setup/status" });
  assert.equal(setupResult.handled, true);
  assert.equal(setupRes.statusCode, 200);
  assert.deepEqual(JSON.parse(setupRes.body), { setupRequired: false, ownerConfigured: true });
}

async function testOwnerSetupCookieAndErrorShape() {
  const routes = makeRoutes();
  const res = makeResponse();
  const result = await routes.handle({ method: "POST", url: "/api/setup/owner", headers: {}, body: {} }, res, { pathname: "/api/setup/owner" });

  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 201);
  assert.match(res.headers["Set-Cookie"], /^hermes_web_key=created-key; Path=\//);
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.deepEqual(JSON.parse(res.body), {
    ok: true,
    key: "created-key",
    workspaceId: "owner",
    setupRequired: false,
    ownerConfigured: true,
  });

  const failingRoutes = makeRoutes({
    createInitialOwnerKey() {
      const err = new Error("already configured");
      err.status = 409;
      throw err;
    },
  });
  const failRes = makeResponse();
  await failingRoutes.handle({ method: "POST", url: "/api/setup/owner", headers: {}, body: {} }, failRes, { pathname: "/api/setup/owner" });
  assert.equal(failRes.statusCode, 409);
  assert.deepEqual(JSON.parse(failRes.body), {
    error: "already configured",
    setup: { setupRequired: false, ownerConfigured: true },
  });
}

async function testLoginSuccessAndFailure() {
  const routes = makeRoutes();

  const invalid = makeResponse();
  await routes.handle({ method: "POST", url: "/api/login", headers: {}, body: { key: "bad" } }, invalid, { pathname: "/api/login" });
  assert.equal(invalid.statusCode, 401);
  assert.deepEqual(JSON.parse(invalid.body), { error: "Invalid key" });

  const valid = makeResponse();
  await routes.handle({ method: "POST", url: "/api/login", headers: {}, body: { key: "valid" } }, valid, { pathname: "/api/login" });
  assert.equal(valid.statusCode, 204);
  assert.match(valid.headers["Set-Cookie"], /^hermes_web_key=valid; Path=\//);
  assert.equal(valid.headers["Cache-Control"], "no-store");
  assert.equal(valid.body, "");
}

async function testClientLayoutDiagnosticsWriteAndRead() {
  const rows = [];
  const routes = makeRoutes({
    clientLayoutDiagnosticService: {
      logPath: "/tmp/client-layout.jsonl",
      append(body, meta) {
        rows.push({ body, meta });
        return { at: "2026-06-09T00:00:00.000Z" };
      },
      list() {
        return [{ at: "2026-06-09T00:00:00.000Z", payload: { event: "app_show" } }];
      },
    },
  });

  const writeRes = makeResponse();
  const writeResult = await routes.handle({
    method: "POST",
    url: "/api/client-layout-diagnostics",
    headers: { "user-agent": "iPhone" },
    socket: { remoteAddress: "127.0.0.1" },
    body: { event: "app_show", accessKey: "secret" },
  }, writeRes, { pathname: "/api/client-layout-diagnostics" });
  assert.equal(writeResult.handled, true);
  assert.equal(writeRes.statusCode, 202);
  assert.deepEqual(JSON.parse(writeRes.body), {
    ok: true,
    stored: true,
    at: "2026-06-09T00:00:00.000Z",
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].body.event, "app_show");
  assert.equal(rows[0].meta.userAgent, "iPhone");

  const unauthorizedRead = makeResponse();
  await routes.handle({
    method: "GET",
    url: "/api/client-layout-diagnostics",
    headers: {},
  }, unauthorizedRead, {
    pathname: "/api/client-layout-diagnostics",
    searchParams: new URLSearchParams(),
  });
  assert.equal(unauthorizedRead.statusCode, 401);

  const readRes = makeResponse();
  await routes.handle({
    method: "GET",
    url: "/api/client-layout-diagnostics",
    headers: { "x-hermes-web-key": "valid" },
  }, readRes, {
    pathname: "/api/client-layout-diagnostics",
    searchParams: new URLSearchParams("limit=1"),
  });
  assert.equal(readRes.statusCode, 200);
  assert.deepEqual(JSON.parse(readRes.body), {
    ok: true,
    path: "/tmp/client-layout.jsonl",
    entries: [{ at: "2026-06-09T00:00:00.000Z", payload: { event: "app_show" } }],
  });
}

async function testNonMatchingRouteFallsThrough() {
  const routes = makeRoutes();
  const res = makeResponse();
  const result = await routes.handle({ method: "GET", url: "/api/status", headers: {} }, res, { pathname: "/api/status" });
  assert.equal(result.handled, false);
  assert.equal(res.statusCode, 0);
}

async function run() {
  await testPublicConfigAndSetupStatus();
  await testOwnerSetupCookieAndErrorShape();
  await testLoginSuccessAndFailure();
  await testClientLayoutDiagnosticsWriteAndRead();
  await testNonMatchingRouteFallsThrough();
  console.log("public api routes tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
