"use strict";

const assert = require("node:assert/strict");
const { createNativeSecureSecretBrokerService } = require("../adapters/native-secure-secret-broker-service");
const {
  NATIVE_SECURE_SECRET_API_ROUTE_SPECS,
  createNativeSecureSecretApiRoutes,
  secretRefFromPath,
} = require("../server-routes/native-secure-secret-api-routes");

function makeResponse() {
  return {
    statusCode: 0,
    payload: null,
    writeHead(status) {
      this.statusCode = status;
    },
    end() {},
  };
}

function auth(workspaceId = "owner", extra = {}) {
  return Object.assign({
    ok: true,
    role: workspaceId === "owner" ? "owner" : "workspace",
    workspaceId,
    principalId: workspaceId,
    isOwner: workspaceId === "owner",
  }, extra);
}

function createRoutes(options = {}) {
  const readBodyCalls = [];
  const broker = options.broker || createNativeSecureSecretBrokerService({
    nowMs: () => options.nowMs || 1_000_000,
    randomBytes: (size) => Buffer.alloc(size, 7),
  });
  const routes = createNativeSecureSecretApiRoutes({
    nativeSecureSecretBrokerService: broker,
    readBody: async (req) => {
      readBodyCalls.push(req.url || "");
      return req.body || {};
    },
    requireWorkspaceAccess(req, res, workspaceId) {
      if (workspaceId === "blocked") {
        res.statusCode = 403;
        res.payload = { ok: false, code: "workspace_blocked" };
        return "";
      }
      return workspaceId;
    },
    sendJson(res, status, payload) {
      res.statusCode = status;
      res.payload = payload;
    },
  });
  return { broker, readBodyCalls, routes };
}

async function callRoute(routes, method, pathname, body, routeAuth = auth()) {
  const res = makeResponse();
  const req = { method, url: pathname, body };
  const url = new URL(pathname, "http://localhost");
  const result = await routes.handle(req, res, url, { auth: routeAuth });
  return { result, res };
}

async function testCreateRouteRedactsValueAndIgnoresWorkspaceOverride() {
  const { routes } = createRoutes();
  const secret = "fake-api-key-for-route-test";
  const { result, res } = await callRoute(routes, "POST", "/api/native/secure-secrets", {
    source: "ios_clipboard",
    targetPlugin: "codex",
    purpose: "current_task",
    ttlSeconds: 600,
    workspaceId: "owner",
    value: secret,
  }, auth("mk"));

  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.ok, true);
  assert.match(res.payload.secretRef, /^sec_/);
  assert.equal(res.payload.workspaceId, "mk");
  assert.equal(res.payload.targetPlugin, "codex");
  assert.equal(Object.hasOwn(res.payload, "value"), false);
  assert.equal(JSON.stringify(res.payload).includes(secret), false);
}

async function testResolveRouteRequiresSameWorkspaceAndConsumesOnce() {
  const { routes } = createRoutes();
  const secret = "fake-secret-resolve-route";
  const create = await callRoute(routes, "POST", "/api/native/secure-secrets", {
    source: "ios_clipboard",
    targetPlugin: "codex",
    purpose: "current_task",
    value: secret,
  }, auth("owner"));
  const secretRef = create.res.payload.secretRef;

  const denied = await callRoute(routes, "POST", `/api/native/secure-secrets/${encodeURIComponent(secretRef)}/resolve`, {
    targetPlugin: "codex",
    purpose: "current_task",
  }, auth("mk"));
  assert.equal(denied.res.statusCode, 403);
  assert.equal(denied.res.payload.code, "secure_secret_workspace_denied");

  const resolved = await callRoute(routes, "POST", `/api/native/secure-secrets/${encodeURIComponent(secretRef)}/resolve`, {
    targetPlugin: "codex",
    purpose: "current_task",
  }, auth("owner"));
  assert.equal(resolved.res.statusCode, 200);
  assert.equal(resolved.res.payload.value, secret);
  assert.equal(resolved.res.payload.remainingUses, 0);

  const used = await callRoute(routes, "POST", `/api/native/secure-secrets/${encodeURIComponent(secretRef)}/resolve`, {
    targetPlugin: "codex",
    purpose: "current_task",
  }, auth("owner"));
  assert.equal(used.res.statusCode, 410);
  assert.equal(used.res.payload.code, "secure_secret_used_up");
}

async function testReadonlyAuthDeniedWithoutValueEcho() {
  const { readBodyCalls, routes } = createRoutes();
  const secret = "fake-readonly-route-secret";
  const { res } = await callRoute(routes, "POST", "/api/native/secure-secrets", {
    source: "ios_clipboard",
    targetPlugin: "codex",
    purpose: "current_task",
    value: secret,
  }, auth("owner", { auditReadOnly: true, keySource: "audit_owner_readonly" }));

  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.code, "secure_secret_readonly_key_denied");
  assert.equal(JSON.stringify(res.payload).includes(secret), false);
  assert.equal(readBodyCalls.length, 0);
}

function testRouteSpecsAndSecretRefExtraction() {
  assert.deepEqual(NATIVE_SECURE_SECRET_API_ROUTE_SPECS.map((route) => route.id), [
    "native-secure-secret-create",
    "native-secure-secret-resolve",
  ]);
  assert.equal(secretRefFromPath("/api/native/secure-secrets/sec_abc/resolve"), "sec_abc");
  assert.equal(secretRefFromPath("/api/native/secure-secrets/sec_abc"), "");
}

async function run() {
  await testCreateRouteRedactsValueAndIgnoresWorkspaceOverride();
  await testResolveRouteRequiresSameWorkspaceAndConsumesOnce();
  await testReadonlyAuthDeniedWithoutValueEcho();
  testRouteSpecsAndSecretRefExtraction();
  console.log("native secure secret api routes tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
