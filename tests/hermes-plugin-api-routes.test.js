"use strict";

const assert = require("node:assert/strict");
const {
  HERMES_PLUGIN_API_ROUTE_SPECS,
  createHermesPluginApiRoutes,
} = require("../server-routes/hermes-plugin-api-routes");

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
  const calls = { access: [], manifest: [] };
  const deps = Object.assign({
    requireWorkspaceAccess(req, res, workspaceId) {
      calls.access.push(workspaceId);
      if (workspaceId === "blocked") {
        sendJson(res, 403, { error: "blocked" });
        return "";
      }
      return workspaceId || "owner";
    },
    sendJson,
    authenticateRequest(req) {
      return req.auth || { workspaceId: "owner", isOwner: true };
    },
    isOwnerAuth(auth) {
      return Boolean(auth?.isOwner || auth?.workspaceId === "owner");
    },
    hermesPluginService: {
      list(input = {}) {
        if (!input.ownerAuthorized && input.workspaceId !== "owner") return [];
        return [
          { id: "wardrobe", manifestUrl: "http://nas/plugin.json" },
          { id: "codex-mobile", manifestUrl: "http://127.0.0.1:8787/api/v1/hermes/plugin/manifest" },
        ];
      },
      manifest(input) {
        calls.manifest.push(input);
        if (!input.ownerAuthorized && input.workspaceId !== "owner" && input.id === "codex-mobile") {
          return Promise.resolve({ ok: false, available: false, id: input.id, code: "plugin_workspace_not_authorized" });
        }
        return Promise.resolve({ ok: true, available: true, id: input.id, entry: { url: "http://nas/?embed=hermes" } });
      },
    },
  }, overrides);
  return { calls, routes: createHermesPluginApiRoutes(deps) };
}

async function testSpecs() {
  assert.equal(HERMES_PLUGIN_API_ROUTE_SPECS.length, 2);
  assert.equal(HERMES_PLUGIN_API_ROUTE_SPECS[0].path, "/api/hermes-plugins");
  assert.match(String(HERMES_PLUGIN_API_ROUTE_SPECS[1].pathRegex), /hermes-plugins/);
}

async function testListRoute() {
  const { calls, routes } = makeRoutes();
  const res = makeResponse();
  const result = await routes.handle({ method: "GET" }, res, makeUrl("/api/hermes-plugins?workspaceId=owner"));
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.access, ["owner"]);
  assert.equal(parseBody(res).plugins[0].manifestPath, "/api/hermes-plugins/wardrobe/manifest");
  assert.equal(parseBody(res).plugins[1].manifestPath, "/api/hermes-plugins/codex-mobile/manifest");
}

async function testWardrobeManifestRoute() {
  const { calls, routes } = makeRoutes();
  const res = makeResponse();
  const result = await routes.handle({ method: "GET" }, res, makeUrl("/api/hermes-plugins/wardrobe/manifest?workspaceId=weixin_wuping&appOrigin=https%3A%2F%2Fhermes.example.test"));
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.access, ["weixin_wuping"]);
  assert.deepEqual(calls.manifest, [{
    id: "wardrobe",
    workspaceId: "weixin_wuping",
    ownerAuthorized: true,
    appOrigin: "https://hermes.example.test",
    launchPlugin: true,
  }]);
  assert.equal(parseBody(res).entry.url, "http://nas/?embed=hermes");
}

async function testCodexManifestRoute() {
  const { calls, routes } = makeRoutes();
  const res = makeResponse();
  const result = await routes.handle({ method: "GET" }, res, makeUrl("/api/hermes-plugins/codex-mobile/manifest?workspaceId=owner&appOrigin=https%3A%2F%2Fhermes.example.test"));
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.access, ["owner"]);
  assert.deepEqual(calls.manifest, [{
    id: "codex-mobile",
    workspaceId: "owner",
    ownerAuthorized: true,
    appOrigin: "https://hermes.example.test",
    launchPlugin: true,
  }]);
}

async function testCodexManifestRouteDeniesNonOwnerWithoutPluginGrant() {
  const { calls, routes } = makeRoutes();
  const res = makeResponse();
  const result = await routes.handle(
    { method: "GET", auth: { workspaceId: "weixin_wuping", isOwner: false } },
    res,
    makeUrl("/api/hermes-plugins/codex-mobile/manifest?workspaceId=weixin_wuping"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(parseBody(res).available, false);
  assert.equal(parseBody(res).code, "plugin_workspace_not_authorized");
  assert.equal(calls.manifest[0].ownerAuthorized, false);
}

async function testWorkspaceBlockStopsRoute() {
  const { calls, routes } = makeRoutes();
  const res = makeResponse();
  await routes.handle({ method: "GET" }, res, makeUrl("/api/hermes-plugins/wardrobe/manifest?workspaceId=blocked"));
  assert.equal(res.statusCode, 403);
  assert.deepEqual(calls.manifest, []);
}

async function run() {
  await testSpecs();
  await testListRoute();
  await testWardrobeManifestRoute();
  await testCodexManifestRoute();
  await testCodexManifestRouteDeniesNonOwnerWithoutPluginGrant();
  await testWorkspaceBlockStopsRoute();
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
