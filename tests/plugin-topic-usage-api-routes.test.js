"use strict";

const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { createPluginTopicUsageApiRoutes } = require("../server-routes/plugin-topic-usage-api-routes");
const { createPluginTopicUsageService } = require("../adapters/plugin-topic-usage-service");

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
      this.body += String(body);
    },
  };
}

function makeRequest(method, url, body = null, auth = { ok: true, workspaceId: "owner" }) {
  let sent = false;
  const req = new Readable({
    read() {
      if (sent) return;
      sent = true;
      if (body == null) this.push(null);
      else {
        this.push(JSON.stringify(body));
        this.push(null);
      }
    },
  });
  req.method = method;
  req.url = url;
  req.headers = {};
  req.auth = auth;
  return req;
}

function readBody(req, maxBytes = 128 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        const err = new Error("request body too large");
        err.status = 413;
        reject(err);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      resolve(raw ? JSON.parse(raw) : {});
    });
    req.on("error", reject);
  });
}

function createRoutes() {
  let stored = null;
  const service = createPluginTopicUsageService({
    storePath: "memory://plugin-topic-usage.json",
    readJsonStore(_path, fallback) {
      return stored ? JSON.parse(JSON.stringify(stored)) : fallback;
    },
    writeJsonStore(_path, value) {
      stored = JSON.parse(JSON.stringify(value));
    },
    nowIso: () => "2026-06-07T00:00:00.000Z",
  });
  const routes = createPluginTopicUsageApiRoutes({
    pluginTopicUsageService: service,
    readBody,
    requireWorkspaceAccess(req, res, workspaceId) {
      const requested = String(workspaceId || "owner").trim() || "owner";
      const auth = req.auth || {};
      if (auth.isOwner || requested === auth.workspaceId) return requested;
      res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Forbidden" }));
      return "";
    },
    sendJson(res, status, payload) {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(payload));
    },
  });
  return { routes, service };
}

async function testPatchMergesUsage() {
  const { routes } = createRoutes();
  const req = makeRequest("PATCH", "/api/plugin-topic-usage", {
    workspaceId: "owner",
    usage: {
      plugins: { finance: { count: 1, lastUsedAt: 100 } },
      actions: { "wardrobe:style": { count: 2, lastUsedAt: 200 } },
    },
  });
  const res = makeResponse();

  const result = await routes.handle(req, res, new URL(req.url, "http://localhost"), { auth: req.auth });

  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, true);
  assert.deepEqual(body.usage.plugins.finance, { count: 1, lastUsedAt: 100 });
  assert.deepEqual(body.usage.actions["wardrobe:style"], { count: 2, lastUsedAt: 200 });
  assert.deepEqual(body.preferences.pinnedBottomTabs, []);
  assert.deepEqual(body.preferences.pluginOrder, []);
}

async function testPatchMergesPreferencesWithoutFakeUsageBucket() {
  const { routes, service } = createRoutes();
  service.mergeWorkspaceUsage("owner", { plugins: { finance: { count: 3, lastUsedAt: 300 } } });
  const req = makeRequest("PATCH", "/api/plugin-topic-usage", {
    workspaceId: "owner",
    preferences: {
      pinnedBottomTabs: ["finance", "wardrobe", "health", "note"],
      pluginOrder: ["health", "finance", "wardrobe"],
    },
  });
  const res = makeResponse();

  await routes.handle(req, res, new URL(req.url, "http://localhost"), { auth: req.auth });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.deepEqual(body.usage.plugins.finance, { count: 3, lastUsedAt: 300 });
  assert.equal(body.usage.plugins.preferences, undefined);
  assert.deepEqual(body.preferences.pinnedBottomTabs, ["finance", "wardrobe", "health"]);
  assert.deepEqual(body.preferences.pluginOrder, ["health", "finance", "wardrobe"]);
  assert.equal(body.preferencesUpdatedAt, "2026-06-07T00:00:00.000Z");
}

async function testPatchPartialPreferencesPreservesExistingOrder() {
  const { routes, service } = createRoutes();
  service.mergeWorkspaceUsage("owner", {}, {
    pinnedBottomTabs: ["finance"],
    pluginOrder: ["health", "finance", "wardrobe"],
  });
  const req = makeRequest("PATCH", "/api/plugin-topic-usage", {
    workspaceId: "owner",
    preferences: {
      pinnedBottomTabs: ["wardrobe"],
    },
  });
  const res = makeResponse();

  await routes.handle(req, res, new URL(req.url, "http://localhost"), { auth: req.auth });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.deepEqual(body.preferences.pinnedBottomTabs, ["wardrobe"]);
  assert.deepEqual(body.preferences.pluginOrder, ["health", "finance", "wardrobe"]);
}

async function testGetReadsWorkspaceUsage() {
  const { routes, service } = createRoutes();
  service.mergeWorkspaceUsage("owner", { plugins: { finance: { count: 3, lastUsedAt: 300 } } }, {
    pinnedBottomTabs: ["finance"],
    pluginOrder: ["finance", "wardrobe"],
  });
  const req = makeRequest("GET", "/api/plugin-topic-usage?workspaceId=owner");
  const res = makeResponse();

  await routes.handle(req, res, new URL(req.url, "http://localhost"), { auth: req.auth });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.workspaceId, "owner");
  assert.deepEqual(body.usage.plugins.finance, { count: 3, lastUsedAt: 300 });
  assert.deepEqual(body.preferences.pinnedBottomTabs, ["finance"]);
  assert.deepEqual(body.preferences.pluginOrder, ["finance", "wardrobe"]);
  assert.equal(body.preferencesUpdatedAt, "2026-06-07T00:00:00.000Z");
}

async function testWorkspaceSpoofIsRejected() {
  const { routes } = createRoutes();
  const req = makeRequest("GET", "/api/plugin-topic-usage?workspaceId=owner", null, { ok: true, workspaceId: "weixin_wuping" });
  const res = makeResponse();

  await routes.handle(req, res, new URL(req.url, "http://localhost"), { auth: req.auth });

  assert.equal(res.statusCode, 403);
  assert.deepEqual(JSON.parse(res.body), { error: "Forbidden" });
}

function testRouteInventorySurface() {
  const { routes } = createRoutes();
  assert.equal(routes.list().length, 2);
  assert.equal(routes.match({ method: "GET", path: "/api/plugin-topic-usage" }).id, "plugin-topic-usage-read");
  assert.equal(routes.match({ method: "PUT", path: "/api/plugin-topic-usage" }).id, "plugin-topic-usage-merge");
  assert.equal(routes.summary().byGroup["plugin-topics"], 2);
}

async function run() {
  await testPatchMergesUsage();
  await testPatchMergesPreferencesWithoutFakeUsageBucket();
  await testPatchPartialPreferencesPreservesExistingOrder();
  await testGetReadsWorkspaceUsage();
  await testWorkspaceSpoofIsRejected();
  testRouteInventorySurface();
  console.log("plugin topic usage api route tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
