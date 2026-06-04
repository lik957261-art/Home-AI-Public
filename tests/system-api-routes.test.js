"use strict";

const assert = require("node:assert/strict");
const { createGatewayStatusProjection } = require("../adapters/gateway-status-projection");
const { createSystemApiRoutes, SYSTEM_API_ROUTE_SPECS } = require("../server-routes/system-api-routes");

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

function makeRoutes(overrides = {}) {
  const calls = [];
  const gatewayStatusProjection = createGatewayStatusProjection({
    isOwnerAuth(auth) {
      return auth?.workspaceId === "owner";
    },
  });
  const deps = Object.assign({
    authenticateRequest(req) {
      const key = req.headers?.["x-hermes-web-key"] || "";
      if (key === "owner") return { ok: true, workspaceId: "owner", principalId: "owner" };
      if (key === "user") return { ok: true, workspaceId: "alpha", principalId: "alpha-user" };
      return { ok: false };
    },
    appUpdateStatus() {
      calls.push("appUpdateStatus");
      return Promise.resolve({
        ok: true,
        currentVersion: "20260514-2100",
        latestVersion: "20260514-2130",
        updateAvailable: true,
        canFastForward: true,
      });
    },
    applyAppUpdate() {
      calls.push("applyAppUpdate");
      return Promise.resolve({ ok: true, updated: true, restartRequired: true });
    },
    clientVersionInfo(clientVersion = "") {
      return {
        version: "20260514-2130",
        clientVersion,
        refreshRequired: Boolean(clientVersion && clientVersion !== "20260514-2130"),
        checkedAt: "2026-05-14T13:30:00.000Z",
      };
    },
    getHermesStatus() {
      calls.push("getHermesStatus");
      return Promise.resolve({
        ok: true,
        health: { status: "ok" },
        gatewayPool: { enabled: true, workers: [{ id: "lowgw1", url: "http://127.0.0.1:18751", healthy: true }] },
      });
    },
    isOwnerAuth(auth) {
      return auth?.workspaceId === "owner";
    },
    publicConcurrencyForAuth(auth) {
      return auth.workspaceId === "owner" ? { activeGlobal: 1 } : { activeForWorkspace: 1 };
    },
    publicGatewayPoolStatusForAuth(auth, pool) {
      return gatewayStatusProjection.publicGatewayPoolStatusForAuth(auth, pool);
    },
    publicOwnerElevationStatus(auth) {
      return { owner: auth.workspaceId === "owner", active: false };
    },
    publicPushStatus() {
      return { enabled: true, publicKey: "public-key", subject: "mailto:owner@example.invalid", subscriptionCount: 2 };
    },
    publicReasoningInfoForAuth(auth) {
      return { defaultEffort: "medium", owner: auth.workspaceId === "owner" };
    },
    requestClientVersion(req) {
      return req.queryClientVersion || req.headers?.["x-hermes-web-client-version"] || "";
    },
    sendJson,
    compactText(value, maxChars) {
      return String(value || "").slice(0, maxChars);
    },
    display: {
      ownerLabel: "Owner",
      ownerDriveRootNames: ["ChatGPT-Drive"],
      ownerRootFallbackLabel: "Owner root",
    },
    includeStatusCatalog: true,
    loadCatalog() {
      return { sources: [{ kind: "test-catalog" }] };
    },
    _calls: calls,
  }, overrides);
  return { routes: createSystemApiRoutes(deps), deps };
}

async function testRouteMetadataAndMatching() {
  assert.deepEqual(SYSTEM_API_ROUTE_SPECS.map((route) => route.id), [
    "client-version",
    "status",
    "app-update-status",
    "app-update-apply",
  ]);

  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/status" }).id, "status");
  assert.equal(routes.match({ method: "POST", path: "/api/app-update/apply" }).id, "app-update-apply");
  assert.equal(routes.match({ method: "GET", path: "/api/app-update/apply" }), null);

  const summary = routes.summary({ public: true });
  assert.equal(summary.total, 4);
  assert.deepEqual(summary.byAuthMode, { none: 1, "access-key": 1, owner: 2 });
  assert.equal(JSON.stringify(summary).includes("/api/status"), false);
}

async function testAuthFailureAndFallthrough() {
  const { routes } = makeRoutes();

  const miss = makeResponse();
  const missResult = await routes.handle({ method: "GET", url: "/api/other", headers: {} }, miss, { pathname: "/api/other" });
  assert.equal(missResult.handled, false);
  assert.equal(miss.statusCode, 0);

  const res = makeResponse();
  const result = await routes.handle({ method: "GET", url: "/api/status", headers: {} }, res, { pathname: "/api/status" });
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(JSON.parse(res.body), { error: "Unauthorized" });
}

async function testClientVersionShape() {
  const { routes } = makeRoutes();
  const anonRes = makeResponse();
  const anonResult = await routes.handle({
    method: "GET",
    url: "/api/client-version?clientVersion=old",
    queryClientVersion: "old",
    headers: {},
  }, anonRes, { pathname: "/api/client-version" });

  assert.equal(anonResult.handled, true);
  assert.equal(anonRes.statusCode, 200);
  assert.deepEqual(JSON.parse(anonRes.body), {
    version: "20260514-2130",
    clientVersion: "old",
    refreshRequired: true,
    checkedAt: "2026-05-14T13:30:00.000Z",
  });

  const res = makeResponse();
  const result = await routes.handle({
    method: "GET",
    url: "/api/client-version?clientVersion=old",
    queryClientVersion: "old",
    headers: { "x-hermes-web-key": "user" },
  }, res, { pathname: "/api/client-version" });

  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), {
    version: "20260514-2130",
    clientVersion: "old",
    refreshRequired: true,
    checkedAt: "2026-05-14T13:30:00.000Z",
    reasoning: { defaultEffort: "medium", owner: false },
  });
}

async function testStatusShapeForWorkspaceAndOwner() {
  const { routes, deps } = makeRoutes();

  const userRes = makeResponse();
  await routes.handle({
    method: "GET",
    url: "/api/status?clientVersion=query-only",
    headers: { "x-hermes-web-key": "user", "x-hermes-web-client-version": "20260514-2100" },
  }, userRes, { pathname: "/api/status" });
  const userStatus = JSON.parse(userRes.body);
  assert.equal(userRes.statusCode, 200);
  assert.equal(userStatus.ok, true);
  assert.deepEqual(userStatus.gatewayPool, {
    enabled: true,
    mode: "",
    workerCount: 1,
    healthy: 1,
    running: 1,
    configuredStopped: 0,
    failed: 0,
    elastic: false,
    queueDepth: 0,
    providerMatrix: [
      {
        provider: "openai-codex",
        label: "ChatGPT",
        user: { configured: 1, running: 1, healthy: 1, stopped: 0, failed: 0 },
        ownerMaintenance: { configured: 0, running: 0, healthy: 0, stopped: 0, failed: 0 },
      },
    ],
  });
  assert.equal(Object.hasOwn(userStatus, "catalog"), false);
  assert.deepEqual(userStatus.display, {
    ownerLabel: "Owner",
    ownerDriveRootNames: ["ChatGPT-Drive"],
    ownerRootFallbackLabel: "Owner root",
  });
  assert.deepEqual(userStatus.push, { enabled: true, publicKey: "public-key", subject: "mailto:owner@example.invalid", subscriptionCount: 2 });
  assert.deepEqual(userStatus.reasoning, { defaultEffort: "medium", owner: false });
  assert.deepEqual(userStatus.concurrency, { activeForWorkspace: 1 });
  assert.deepEqual(userStatus.ownerElevation, { owner: false, active: false });
  assert.equal(userStatus.clientVersion.clientVersion, "20260514-2100");

  const ownerRes = makeResponse();
  await routes.handle({ method: "GET", url: "/api/status", headers: { "x-hermes-web-key": "owner" } }, ownerRes, { pathname: "/api/status" });
  const ownerStatus = JSON.parse(ownerRes.body);
  assert.deepEqual(ownerStatus.catalog, [{ kind: "test-catalog" }]);
  assert.equal(ownerStatus.gatewayPool.workers[0].url, "http://127.0.0.1:18751");
  assert.deepEqual(deps._calls.filter((call) => call === "getHermesStatus"), ["getHermesStatus", "getHermesStatus"]);
}

async function testAppUpdateOwnerOnlyAndErrorShapes() {
  const { routes, deps } = makeRoutes();

  const forbidden = makeResponse();
  await routes.handle({ method: "GET", url: "/api/app-update/status", headers: { "x-hermes-web-key": "user" } }, forbidden, { pathname: "/api/app-update/status" });
  assert.equal(forbidden.statusCode, 403);
  assert.deepEqual(JSON.parse(forbidden.body), { error: "Owner access is required" });
  assert.deepEqual(deps._calls.filter((call) => call === "appUpdateStatus"), []);

  const statusRes = makeResponse();
  await routes.handle({ method: "GET", url: "/api/app-update/status", headers: { "x-hermes-web-key": "owner" } }, statusRes, { pathname: "/api/app-update/status" });
  assert.equal(statusRes.statusCode, 200);
  assert.equal(JSON.parse(statusRes.body).updateAvailable, true);

  const applyRes = makeResponse();
  await routes.handle({ method: "POST", url: "/api/app-update/apply", headers: { "x-hermes-web-key": "owner" } }, applyRes, { pathname: "/api/app-update/apply" });
  assert.equal(applyRes.statusCode, 200);
  assert.deepEqual(JSON.parse(applyRes.body), { ok: true, updated: true, restartRequired: true });

  const failingStatus = makeRoutes({
    appUpdateStatus() {
      throw new Error("network unavailable and remote version check failed");
    },
  }).routes;
  const failStatusRes = makeResponse();
  await failingStatus.handle({ method: "GET", url: "/api/app-update/status", headers: { "x-hermes-web-key": "owner" } }, failStatusRes, { pathname: "/api/app-update/status" });
  assert.equal(failStatusRes.statusCode, 200);
  assert.deepEqual(JSON.parse(failStatusRes.body), {
    ok: false,
    updateAvailable: false,
    warning: "network unavailable and remote version check failed",
  });

  const failingApply = makeRoutes({
    applyAppUpdate() {
      return Promise.resolve({ ok: false, error: "Working tree is not clean; update was not applied." });
    },
  }).routes;
  const failApplyRes = makeResponse();
  await failingApply.handle({ method: "POST", url: "/api/app-update/apply", headers: { "x-hermes-web-key": "owner" } }, failApplyRes, { pathname: "/api/app-update/apply" });
  assert.equal(failApplyRes.statusCode, 409);
  assert.deepEqual(JSON.parse(failApplyRes.body), { ok: false, error: "Working tree is not clean; update was not applied." });
}

function testDependencyValidation() {
  assert.throws(
    () => createSystemApiRoutes({}),
    /system api routes require authenticateRequest/,
  );
}

async function run() {
  await testRouteMetadataAndMatching();
  await testAuthFailureAndFallthrough();
  await testClientVersionShape();
  await testStatusShapeForWorkspaceAndOwner();
  await testAppUpdateOwnerOnlyAndErrorShapes();
  testDependencyValidation();
  console.log("system api routes tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
