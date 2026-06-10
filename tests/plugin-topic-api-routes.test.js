"use strict";

const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { createPluginDirectoryContextBindingService } = require("../adapters/plugin-directory-context-binding-service");
const { createPluginTopicBindingService } = require("../adapters/plugin-topic-binding-service");
const { createPluginTopicContextSourceService } = require("../adapters/plugin-topic-context-source-service");
const { createPluginTopicApiRoutes } = require("../server-routes/plugin-topic-api-routes");
const { createPluginTopicContextApiRoutes } = require("../server-routes/plugin-topic-context-api-routes");

function createMemoryStore() {
  let state = null;
  return {
    readJsonStore(_path, fallback) {
      return state ? JSON.parse(JSON.stringify(state)) : fallback;
    },
    writeJsonStore(_path, value) {
      state = JSON.parse(JSON.stringify(value));
    },
  };
}

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

function readBody(req, maxBytes = 256 * 1024) {
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

function routeDeps(extra = {}) {
  return Object.assign({
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
  }, extra);
}

function createBindingRoutes() {
  const topicStore = createMemoryStore();
  const directoryStore = createMemoryStore();
  return createPluginTopicApiRoutes(routeDeps({
    pluginTopicBindingService: createPluginTopicBindingService({
      storePath: "memory://plugin-topic-bindings.json",
      readJsonStore: topicStore.readJsonStore,
      writeJsonStore: topicStore.writeJsonStore,
      nowIso: () => "2026-06-10T00:00:00.000Z",
    }),
    pluginDirectoryContextBindingService: createPluginDirectoryContextBindingService({
      storePath: "memory://plugin-directory-context-bindings.json",
      readJsonStore: directoryStore.readJsonStore,
      writeJsonStore: directoryStore.writeJsonStore,
      nowIso: () => "2026-06-10T00:00:00.000Z",
    }),
  }));
}

function createContextRoutes() {
  const store = createMemoryStore();
  return createPluginTopicContextApiRoutes(routeDeps({
    pluginTopicContextSourceService: createPluginTopicContextSourceService({
      storePath: "memory://plugin-topic-context-sources.json",
      readJsonStore: store.readJsonStore,
      writeJsonStore: store.writeJsonStore,
      nowIso: () => "2026-06-10T00:00:00.000Z",
    }),
  }));
}

async function testUpsertsAndReadsBindings() {
  const routes = createBindingRoutes();
  const patchReq = makeRequest("PATCH", "/api/plugin-topic-bindings", {
    workspaceId: "weixin_wuping",
    topic: { pluginId: "health", topicId: "health:kidney", title: "IgA 肾病专题" },
    directoryClaim: {
      pluginId: "health",
      directoryRoute: { projectId: "health", path: "/users/wuping/health", ownerWorkspaceId: "weixin_wuping" },
      claimMode: "claimed_by_plugin",
    },
  }, { ok: true, workspaceId: "weixin_wuping" });
  const patchRes = makeResponse();

  await routes.handle(patchReq, patchRes, new URL(patchReq.url, "http://localhost"), { auth: patchReq.auth });
  assert.equal(patchRes.statusCode, 200);
  const patched = JSON.parse(patchRes.body);
  assert.equal(patched.topics[0].pluginId, "health");
  assert.equal(patched.directoryClaims[0].pluginId, "health");

  const getReq = makeRequest("GET", "/api/plugin-topic-bindings?workspaceId=weixin_wuping&pluginId=health", null, { ok: true, workspaceId: "weixin_wuping" });
  const getRes = makeResponse();
  await routes.handle(getReq, getRes, new URL(getReq.url, "http://localhost"), { auth: getReq.auth });
  assert.equal(JSON.parse(getRes.body).directoryClaims.length, 1);
}

async function testContextSourcesReturnOnlyEligibleByDefault() {
  const routes = createContextRoutes();
  for (const source of [
    { pluginId: "health", fileRoute: "/health/summary.md", fileRole: "cleaned_summary" },
    { pluginId: "health", fileRoute: "/health/raw.pdf", fileRole: "delivery_only" },
  ]) {
    const req = makeRequest("PATCH", "/api/plugin-topic-context-sources", Object.assign({ workspaceId: "owner" }, source));
    const res = makeResponse();
    await routes.handle(req, res, new URL(req.url, "http://localhost"), { auth: req.auth });
    assert.equal(res.statusCode, 200);
  }

  const getReq = makeRequest("GET", "/api/plugin-topic-context-sources?workspaceId=owner&pluginId=health");
  const getRes = makeResponse();
  await routes.handle(getReq, getRes, new URL(getReq.url, "http://localhost"), { auth: getReq.auth });

  const body = JSON.parse(getRes.body);
  assert.deepEqual(body.sources.map((item) => item.fileRoute), ["/health/summary.md"]);
}

function testRouteInventory() {
  const bindingRoutes = createBindingRoutes();
  const contextRoutes = createContextRoutes();
  assert.equal(bindingRoutes.summary().byGroup["plugin-topics"], 2);
  assert.equal(contextRoutes.summary().byGroup["plugin-topics"], 2);
  assert.equal(bindingRoutes.match({ method: "GET", path: "/api/plugin-topic-bindings" }).id, "plugin-topic-bindings-read");
  assert.equal(contextRoutes.match({ method: "PATCH", path: "/api/plugin-topic-context-sources" }).id, "plugin-topic-context-source-upsert");
}

async function run() {
  await testUpsertsAndReadsBindings();
  await testContextSourcesReturnOnlyEligibleByDefault();
  testRouteInventory();
  console.log("plugin topic api route tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
