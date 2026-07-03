"use strict";

const assert = require("node:assert/strict");
const {
  OWNER_SYSTEM_CONSOLE_ROUTE_SPECS,
  createOwnerSystemConsoleApiRoutes,
} = require("../server-routes/owner-system-console-api-routes");

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

function parseJson(res) {
  return res.body ? JSON.parse(res.body) : null;
}

function makeRoutes(overrides = {}) {
  const calls = [];
  const deps = Object.assign({
    ownerSystemConsoleService: {
      async overview() {
        calls.push("overview");
        return {
          ok: true,
          overallStatus: "ok",
          policy: { ownerOnly: true, readOnlyMvp: true },
        };
      },
      async systemStatus() {
        calls.push("systemStatus");
        return {
          overallStatus: "ok",
          signals: [],
        };
      },
    },
    requireOwner(req, res) {
      if (req.headers?.["x-owner"] === "yes") return { principalId: "owner" };
      res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Owner access required" }));
      return null;
    },
    sendJson(res, status, data) {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
    },
  }, overrides);
  return { routes: createOwnerSystemConsoleApiRoutes(deps), calls };
}

async function request(routes, method, pathname, headers = { "x-owner": "yes" }) {
  const res = makeResponse();
  const result = await routes.handle({ method, url: pathname, headers }, res, { pathname });
  return { result, res, body: parseJson(res) };
}

async function testRouteMetadata() {
  assert.deepEqual(OWNER_SYSTEM_CONSOLE_ROUTE_SPECS.map((route) => route.id), [
    "owner-system-console-overview",
    "owner-system-console-system-status",
  ]);
  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/owner/system-console" }).id, "owner-system-console-overview");
  assert.equal(routes.match({ method: "GET", path: "/api/owner/system-console/system-status" }).id, "owner-system-console-system-status");
  assert.equal(routes.summary().total, 2);
  assert.equal(routes.summary().byAuthMode.owner, 2);
  assert.equal(routes.summary().byRiskLevel.owner, 2);
}

async function testOwnerGateAndFallthrough() {
  const { routes, calls } = makeRoutes();

  const miss = await request(routes, "GET", "/api/status");
  assert.equal(miss.result.handled, false);
  assert.equal(miss.res.statusCode, 0);

  const denied = await request(routes, "GET", "/api/owner/system-console", {});
  assert.equal(denied.result.handled, true);
  assert.equal(denied.res.statusCode, 403);
  assert.deepEqual(denied.body, { error: "Owner access required" });
  assert.deepEqual(calls, []);
}

async function testOverviewAndSystemStatus() {
  const { routes, calls } = makeRoutes();
  const overview = await request(routes, "GET", "/api/owner/system-console");
  assert.equal(overview.res.statusCode, 200);
  assert.deepEqual(overview.body, {
    ok: true,
    console: {
      ok: true,
      overallStatus: "ok",
      policy: { ownerOnly: true, readOnlyMvp: true },
    },
  });

  const status = await request(routes, "GET", "/api/owner/system-console/system-status");
  assert.equal(status.res.statusCode, 200);
  assert.deepEqual(status.body, {
    ok: true,
    systemStatus: {
      overallStatus: "ok",
      signals: [],
    },
  });
  assert.deepEqual(calls, ["overview", "systemStatus"]);
}

async function testErrorsAreBounded() {
  const { routes } = makeRoutes({
    ownerSystemConsoleService: {
      async overview() {
        const err = new Error("collector exploded with private details that must not appear");
        err.status = 503;
        err.code = "owner_console_collector_failed";
        throw err;
      },
      async systemStatus() {
        return {};
      },
    },
  });
  const result = await request(routes, "GET", "/api/owner/system-console");
  assert.equal(result.res.statusCode, 503);
  assert.deepEqual(result.body, {
    ok: false,
    error: "owner_console_collector_failed",
  });
}

async function run() {
  await testRouteMetadata();
  await testOwnerGateAndFallthrough();
  await testOverviewAndSystemStatus();
  await testErrorsAreBounded();
  console.log("owner system console api routes tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
