"use strict";

const assert = require("node:assert/strict");
const { createCodexMobileRecoveryApiRoutes } = require("../server-routes/codex-mobile-recovery-api-routes");

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = Object.assign({}, this.headers, headers);
    },
    end(body = "") {
      this.body += String(body);
    },
  };
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return Promise.resolve(req.body || {});
}

async function testOwnerStatusRoute() {
  const routes = createCodexMobileRecoveryApiRoutes({
    readBody,
    requireOwner: () => ({ ok: true, workspaceId: "owner" }),
    sendJson,
    codexMobileRecoveryService: {
      status: async () => ({ ok: true, available: false, recoverable: true }),
      listHomes: async () => ({ ok: true, profiles: [] }),
      plan: async () => ({ ok: true }),
      restore: async () => ({ ok: true }),
    },
  });
  const res = makeResponse();

  const result = await routes.handle({ method: "GET", url: "/api/codex-mobile/recovery/status" }, res, new URL("http://localhost/api/codex-mobile/recovery/status"));

  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true, available: false, recoverable: true });
}

async function testNonOwnerIsBlocked() {
  let called = false;
  const routes = createCodexMobileRecoveryApiRoutes({
    readBody,
    requireOwner: (_req, res) => {
      sendJson(res, 403, { error: "Owner required" });
      return null;
    },
    sendJson,
    codexMobileRecoveryService: {
      status: async () => {
        called = true;
        return { ok: true };
      },
      listHomes: async () => ({ ok: true }),
      plan: async () => ({ ok: true }),
      restore: async () => ({ ok: true }),
    },
  });
  const res = makeResponse();

  const result = await routes.handle({ method: "GET", url: "/api/codex-mobile/recovery/status" }, res, new URL("http://localhost/api/codex-mobile/recovery/status"));

  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 403);
  assert.equal(called, false);
}

async function testRestoreErrorCarriesCurrentStatus() {
  const err = new Error("not safe");
  err.status = 412;
  err.code = "codex_mobile_recovery_not_safe";
  err.current = { available: false, recoverable: false, reason: "auth_or_key_required" };
  const routes = createCodexMobileRecoveryApiRoutes({
    readBody,
    requireOwner: () => ({ ok: true, workspaceId: "owner" }),
    sendJson,
    codexMobileRecoveryService: {
      status: async () => ({ ok: true }),
      listHomes: async () => ({ ok: true }),
      plan: async () => ({ ok: true }),
      restore: async () => {
        throw err;
      },
    },
  });
  const res = makeResponse();

  await routes.handle({ method: "POST", body: { profileId: "previous" } }, res, new URL("http://localhost/api/codex-mobile/recovery/restore"));

  assert.equal(res.statusCode, 412);
  assert.deepEqual(JSON.parse(res.body), {
    ok: false,
    error: "not safe",
    code: "codex_mobile_recovery_not_safe",
    current: { available: false, recoverable: false, reason: "auth_or_key_required" },
  });
}

async function run() {
  await testOwnerStatusRoute();
  await testNonOwnerIsBlocked();
  await testRestoreErrorCarriesCurrentStatus();
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
