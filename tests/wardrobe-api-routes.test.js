"use strict";

const assert = require("node:assert/strict");
const {
  WARDROBE_API_ROUTE_SPECS,
  createWardrobeApiRoutes,
} = require("../server-routes/wardrobe-api-routes");

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

function makeUrl(value) {
  return new URL(value, "http://localhost");
}

function parseBody(res) {
  return JSON.parse(res.body || "{}");
}

function makeRoutes(overrides = {}) {
  const calls = { access: [], projects: [], overview: [] };
  const deps = Object.assign({
    compactText(value) {
      return String(value || "").slice(0, 800);
    },
    requireWorkspaceAccess(req, res, workspaceId) {
      calls.access.push(workspaceId);
      if (workspaceId === "blocked") {
        sendJson(res, 403, { error: "blocked" });
        return "";
      }
      return workspaceId || "owner";
    },
    sendJson,
    sharedDirectoryProjectionService: {
      publicProjectsForWorkspace(workspaceId) {
        calls.projects.push(workspaceId);
        return Promise.resolve([{ id: "p1", label: "衣橱", root: "C:\\Wardrobe" }]);
      },
    },
    wardrobeProjectionService: {
      overview(input) {
        calls.overview.push(input);
        return Promise.resolve({ ok: true, available: true, overview: { itemCount: 1 } });
      },
    },
  }, overrides);
  return { calls, routes: createWardrobeApiRoutes(deps) };
}

async function testSpecs() {
  assert.equal(WARDROBE_API_ROUTE_SPECS.length, 1);
  assert.equal(WARDROBE_API_ROUTE_SPECS[0].id, "wardrobe-overview");
  assert.equal(WARDROBE_API_ROUTE_SPECS[0].path, "/api/wardrobe/overview");
}

async function testOverviewRoute() {
  const { calls, routes } = makeRoutes();
  const res = makeResponse();
  const result = await routes.handle({ method: "GET" }, res, makeUrl("/api/wardrobe/overview?workspaceId=owner"));
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.access, ["owner"]);
  assert.deepEqual(calls.projects, ["owner"]);
  assert.equal(calls.overview[0].workspaceId, "owner");
  assert.deepEqual(calls.overview[0].filters, { q: "", brand: "", section: "" });
  assert.equal(calls.overview[0].projects[0].root, "C:\\Wardrobe");
  assert.equal(parseBody(res).available, true);
}

async function testOverviewRoutePassesFilters() {
  const { calls, routes } = makeRoutes();
  const res = makeResponse();
  await routes.handle(
    { method: "GET" },
    res,
    makeUrl("/api/wardrobe/overview?workspaceId=owner&q=polo&brand=Zegna&section=watch"),
  );
  assert.deepEqual(calls.overview[0].filters, { q: "polo", brand: "Zegna", section: "watch" });
}

async function testWorkspaceBlockStopsRoute() {
  const { calls, routes } = makeRoutes();
  const res = makeResponse();
  await routes.handle({ method: "GET" }, res, makeUrl("/api/wardrobe/overview?workspaceId=blocked"));
  assert.equal(res.statusCode, 403);
  assert.deepEqual(calls.projects, []);
  assert.deepEqual(calls.overview, []);
}

async function run() {
  await testSpecs();
  await testOverviewRoute();
  await testOverviewRoutePassesFilters();
  await testWorkspaceBlockStopsRoute();
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
