"use strict";

const assert = require("node:assert/strict");
const {
  OWNER_ELEVATION_API_ROUTE_SPECS,
  createOwnerElevationApiRoutes,
} = require("../server-routes/owner-elevation-api-routes");

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

function makeRoutes(overrides = {}) {
  const calls = {
    once: [],
    grant: [],
    revoke: [],
    readBody: [],
    status: [],
  };
  const state = {
    active: false,
    grantId: "",
  };
  const deps = Object.assign({
    requireOwner(req, res) {
      if (req.headers?.["x-owner"] !== "yes") {
        sendJson(res, 403, { error: "Owner access is required" });
        return null;
      }
      return { workspaceId: "owner", principalId: "owner-principal" };
    },
    readBody(req) {
      calls.readBody.push(req.body || {});
      return Promise.resolve(req.body || {});
    },
    sendJson,
    publicOwnerElevationStatus(auth) {
      calls.status.push(auth);
      return {
        available: true,
        active: state.active,
        grantId: state.grantId,
        currentPermission: state.active ? "owner-maintenance" : "standard",
      };
    },
    grantOwnerElevationOnce(auth) {
      calls.once.push(auth);
      return {
        token: "once-token",
        expiresAt: "2026-05-14T13:02:00.000Z",
        grantedAt: "2026-05-14T13:00:00.000Z",
        grantId: "internal-grant-id",
        allowedOperations: ["single_run"],
      };
    },
    grantOwnerElevation(auth, durationMinutes) {
      calls.grant.push({ auth, durationMinutes });
      state.active = true;
      state.grantId = `owner-time-${durationMinutes}`;
      return {
        grantId: state.grantId,
        durationMinutes,
        expiresAt: "2026-05-14T13:15:00.000Z",
      };
    },
    revokeOwnerElevation(auth) {
      calls.revoke.push(auth);
      state.active = false;
      state.grantId = "";
      return true;
    },
  }, overrides);
  return { routes: createOwnerElevationApiRoutes(deps), calls, state };
}

async function request(routes, method, path, body, headers = { "x-owner": "yes" }) {
  const res = makeResponse();
  const result = await routes.handle({ method, url: path, headers, body }, res, makeUrl(path));
  return { result, res, body: parseBody(res) };
}

async function testRouteMetadataAndFallthrough() {
  assert.deepEqual(OWNER_ELEVATION_API_ROUTE_SPECS.map((route) => route.id), [
    "owner-elevation-status",
    "owner-elevation-once",
    "owner-elevation-grant",
    "owner-elevation-revoke",
  ]);

  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/owner-elevation" }).id, "owner-elevation-status");
  assert.equal(routes.match({ method: "POST", path: "/api/owner-elevation/once" }).id, "owner-elevation-once");
  assert.equal(routes.match({ method: "POST", path: "/api/owner-elevation" }).id, "owner-elevation-grant");
  assert.equal(routes.match({ method: "DELETE", path: "/api/owner-elevation" }).id, "owner-elevation-revoke");
  assert.equal(routes.match({ method: "PATCH", path: "/api/owner-elevation" }), null);

  const summary = routes.summary({ public: true });
  assert.equal(summary.total, 4);
  assert.deepEqual(summary.byAuthMode, { owner: 4 });
  assert.deepEqual(summary.byRiskLevel, { owner: 4 });
  assert.equal(JSON.stringify(summary).includes("/api/owner-elevation"), false);

  const listed = routes.list({ public: true });
  assert.equal(Object.hasOwn(listed[0], "path"), false);
  assert.equal(listed.every((route) => route.ownerOnly && route.moduleKey === "owner-elevation"), true);

  const miss = await request(routes, "GET", "/api/status", {});
  assert.equal(miss.result.handled, false);
  assert.equal(miss.res.statusCode, 0);
}

async function testOwnerOnly() {
  const { routes, calls } = makeRoutes();
  const denied = await request(routes, "GET", "/api/owner-elevation", {}, {});

  assert.equal(denied.result.handled, true);
  assert.equal(denied.res.statusCode, 403);
  assert.deepEqual(denied.body, { error: "Owner access is required" });
  assert.equal(calls.status.length, 0);
  assert.equal(calls.once.length, 0);
  assert.equal(calls.grant.length, 0);
  assert.equal(calls.revoke.length, 0);
}

async function testStatusAndOnceTokenShape() {
  const { routes, calls } = makeRoutes();
  const status = await request(routes, "GET", "/api/owner-elevation", {});
  assert.equal(status.res.statusCode, 200);
  assert.deepEqual(status.body, {
    ok: true,
    ownerElevation: {
      available: true,
      active: false,
      grantId: "",
      currentPermission: "standard",
    },
  });

  const once = await request(routes, "POST", "/api/owner-elevation/once", {});
  assert.equal(once.res.statusCode, 200);
  assert.equal(calls.once.length, 1);
  assert.deepEqual(once.body.ownerElevationOnce, {
    token: "once-token",
    expiresAt: "2026-05-14T13:02:00.000Z",
    grantedAt: "2026-05-14T13:00:00.000Z",
  });
  assert.equal(Object.hasOwn(once.body.ownerElevationOnce, "grantId"), false);
  assert.equal(Object.hasOwn(once.body.ownerElevationOnce, "allowedOperations"), false);
  assert.equal(once.body.ownerElevation.currentPermission, "standard");
}

async function testDurationGrantAndDeleteRevoke() {
  const { routes, calls } = makeRoutes();
  const granted = await request(routes, "POST", "/api/owner-elevation", { durationMinutes: 15 });

  assert.equal(granted.res.statusCode, 200);
  assert.equal(calls.readBody.length, 1);
  assert.equal(calls.grant.length, 1);
  assert.equal(calls.grant[0].durationMinutes, 15);
  assert.equal(granted.body.ok, true);
  assert.deepEqual(granted.body.ownerElevation, {
    available: true,
    active: true,
    grantId: "owner-time-15",
    currentPermission: "owner-maintenance",
  });

  const snakeCaseGrant = await request(routes, "POST", "/api/owner-elevation", { duration_minutes: 30 });
  assert.equal(snakeCaseGrant.res.statusCode, 200);
  assert.equal(calls.grant[1].durationMinutes, 30);
  assert.equal(snakeCaseGrant.body.ownerElevation.grantId, "owner-time-30");

  const revoked = await request(routes, "DELETE", "/api/owner-elevation", {});
  assert.equal(revoked.res.statusCode, 200);
  assert.equal(calls.revoke.length, 1);
  assert.deepEqual(revoked.body, {
    ok: true,
    ownerElevation: {
      available: true,
      active: false,
      grantId: "",
      currentPermission: "standard",
    },
  });
}

async function testReadBodyAndBusinessErrors() {
  const invalid = makeRoutes({
    readBody() {
      return Promise.reject(new Error("bad json"));
    },
  });
  const invalidResult = await request(invalid.routes, "POST", "/api/owner-elevation", {});
  assert.equal(invalidResult.res.statusCode, 400);
  assert.deepEqual(invalidResult.body, { error: "bad json" });

  const durationError = new Error("Unsupported owner elevation duration");
  durationError.status = 400;
  const failingGrant = makeRoutes({
    grantOwnerElevation() {
      throw durationError;
    },
  });
  const failedGrant = await request(failingGrant.routes, "POST", "/api/owner-elevation", { durationMinutes: 999 });
  assert.equal(failedGrant.res.statusCode, 400);
  assert.deepEqual(failedGrant.body, {
    error: "Unsupported owner elevation duration",
    ownerElevation: {
      available: true,
      active: false,
      grantId: "",
      currentPermission: "standard",
    },
  });

  const onceError = new Error("Owner maintenance runs are disabled by server configuration");
  onceError.status = 409;
  const failingOnce = makeRoutes({
    grantOwnerElevationOnce() {
      throw onceError;
    },
  });
  const failedOnce = await request(failingOnce.routes, "POST", "/api/owner-elevation/once", {});
  assert.equal(failedOnce.res.statusCode, 409);
  assert.equal(failedOnce.body.error, "Owner maintenance runs are disabled by server configuration");
  assert.equal(failedOnce.body.ownerElevation.currentPermission, "standard");
}

function testDependencyValidation() {
  assert.throws(
    () => createOwnerElevationApiRoutes({}),
    /owner elevation api routes require requireOwner/,
  );
}

async function run() {
  await testRouteMetadataAndFallthrough();
  await testOwnerOnly();
  await testStatusAndOnceTokenShape();
  await testDurationGrantAndDeleteRevoke();
  await testReadBodyAndBusinessErrors();
  testDependencyValidation();
  console.log("owner elevation api routes tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
