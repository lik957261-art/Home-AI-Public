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
    write(chunk = "") {
      this.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    },
    end(body = "") {
      if (Buffer.isBuffer(body)) {
        this.body = body;
        return;
      }
      if (body) this.write(body);
    },
  };
}

function makeRequest(method = "GET", chunks = []) {
  return {
    method,
    headers: {},
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield Buffer.from(chunk);
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

function testBase64Url(value = "") {
  return Buffer.from(String(value), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function testProxyCookieName(pluginId, workspaceId, cookieName) {
  return `hmplugin_${testBase64Url(pluginId)}_${testBase64Url(workspaceId)}_${testBase64Url(cookieName)}`;
}

function makeRoutes(overrides = {}) {
  const calls = { access: [], owner: [], list: [], manifest: [], grants: [], revokes: [], notifications: [], broadcasts: [], audit: [] };
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
    readBody(req) {
      return Promise.resolve(req.body || {});
    },
    broadcast(event) {
      calls.broadcasts.push(event);
    },
    auditPluginManifestRequest(event) {
      calls.audit.push(event);
    },
    authenticateRequest(req) {
      return req.auth || { workspaceId: "owner", isOwner: true };
    },
    requireOwner(req, res) {
      calls.owner.push(req.auth?.workspaceId || "owner");
      if (req.auth && !req.auth.isOwner && req.auth.workspaceId !== "owner") {
        sendJson(res, 403, { ok: false, error: "owner_required" });
        return null;
      }
      return req.auth || { workspaceId: "owner", isOwner: true };
    },
    isOwnerAuth(auth) {
      return Boolean(auth?.isOwner || auth?.workspaceId === "owner");
    },
    hermesPluginService: {
      list(input = {}) {
        calls.list.push(input);
        if (!input.ownerAuthorized && input.workspaceId !== "owner") return [];
        return [
          { id: "wardrobe", manifestUrl: "http://nas/plugin.json" },
          { id: "codex-mobile", manifestUrl: "http://127.0.0.1:8787/api/v1/hermes/plugin/manifest" },
          { id: "finance", manifestUrl: "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest" },
        ];
      },
      listInstalled() {
        return [
          { id: "wardrobe", manifestUrl: "http://nas/plugin.json", allowWorkspaceGrant: true, authorizedWorkspaceIds: ["weixin_wuping"] },
          { id: "codex-mobile", manifestUrl: "http://127.0.0.1:8787/api/v1/hermes/plugin/manifest", allowWorkspaceGrant: false, authorizedWorkspaceIds: [] },
          { id: "finance", manifestUrl: "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest", allowWorkspaceGrant: true, authorizedWorkspaceIds: [] },
        ];
      },
      grantWorkspace(input) {
        calls.grants.push(input);
        return { ok: true, pluginId: input.id, workspaceId: input.workspaceId };
      },
      revokeWorkspace(input) {
        calls.revokes.push(input);
        return { ok: true, pluginId: input.pluginId, workspaceId: input.workspaceId };
      },
      manifest(input) {
        calls.manifest.push(input);
        if (!input.ownerAuthorized && input.workspaceId !== "owner" && input.id === "codex-mobile") {
          return Promise.resolve({ ok: false, available: false, id: input.id, code: "plugin_workspace_not_authorized" });
        }
        return Promise.resolve({ ok: true, available: true, id: input.id, entry: { url: "http://nas/?embed=hermes" } });
      },
      pluginManifestUrl(id) {
        if (id === "codex-mobile") return "http://127.0.0.1:8787/api/v1/hermes/plugin/manifest";
        if (id === "finance") return "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest";
        return "http://nas/plugin.json";
      },
    },
    hermesPluginNotificationService: {
      postNotification(input) {
        calls.notifications.push(input);
        return Promise.resolve({
          ok: true,
          inboxItem: { id: "ainb-plugin-1", workspaceId: input.workspaceId },
          push: { enabled: true, attempted: 1, sent: 1, failed: 0, removed: 0 },
        });
      },
    },
    fetch() {
      throw new Error("unexpected fetch");
    },
  }, overrides);
  return { calls, routes: createHermesPluginApiRoutes(deps) };
}

async function testSpecs() {
  assert.equal(HERMES_PLUGIN_API_ROUTE_SPECS.length, 7);
  assert.equal(HERMES_PLUGIN_API_ROUTE_SPECS[0].path, "/api/hermes-plugins/admin");
  assert.equal(HERMES_PLUGIN_API_ROUTE_SPECS[3].path, "/api/hermes-plugins");
  assert.match(String(HERMES_PLUGIN_API_ROUTE_SPECS[4].pathRegex), /manifest/);
  assert.match(String(HERMES_PLUGIN_API_ROUTE_SPECS[5].pathRegex), /notifications/);
  assert.match(String(HERMES_PLUGIN_API_ROUTE_SPECS[6].pathRegex), /proxy/);
  assert.equal(HERMES_PLUGIN_API_ROUTE_SPECS[6].authMode, "access-key");
  assert.equal(HERMES_PLUGIN_API_ROUTE_SPECS[6].authRequired, true);
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
  assert.equal(parseBody(res).plugins[2].manifestPath, "/api/hermes-plugins/finance/manifest");
}

async function testListRouteUsesEffectiveWorkspaceForOwnerSwitch() {
  const { calls, routes } = makeRoutes();
  const res = makeResponse();
  const result = await routes.handle(
    { method: "GET", auth: { workspaceId: "owner", isOwner: true } },
    res,
    makeUrl("/api/hermes-plugins?workspaceId=weixin_wuping"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.access, ["weixin_wuping"]);
  assert.deepEqual(calls.list, [{ workspaceId: "weixin_wuping", ownerAuthorized: false }]);
  assert.deepEqual(parseBody(res).plugins, []);
}

async function testAdminListRouteRequiresOwner() {
  const { calls, routes } = makeRoutes();
  const res = makeResponse();
  const result = await routes.handle({ method: "GET", auth: { workspaceId: "owner", isOwner: true } }, res, makeUrl("/api/hermes-plugins/admin"));
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.owner, ["owner"]);
  const body = parseBody(res);
  assert.equal(body.plugins[0].id, "wardrobe");
  assert.equal(body.plugins[1].allowWorkspaceGrant, false);
}

async function testGrantAndRevokeRoutesRequireOwner() {
  const { calls, routes } = makeRoutes();
  const grantRes = makeResponse();
  const grantReq = makeRequest("POST");
  grantReq.body = { workspaceId: "weixin_wuping", displayName: "吴萍" };
  await routes.handle(grantReq, grantRes, makeUrl("/api/hermes-plugins/finance/workspaces"));
  assert.equal(grantRes.statusCode, 200);
  assert.deepEqual(calls.grants, [{ id: "finance", workspaceId: "weixin_wuping", displayName: "吴萍", actor: "owner" }]);

  const revokeRes = makeResponse();
  await routes.handle(makeRequest("DELETE"), revokeRes, makeUrl("/api/hermes-plugins/finance/workspaces/weixin_wuping"));
  assert.equal(revokeRes.statusCode, 200);
  assert.deepEqual(calls.revokes, [{ pluginId: "finance", workspaceId: "weixin_wuping" }]);
}

async function testWardrobeManifestRoute() {
  const { calls, routes } = makeRoutes();
  const res = makeResponse();
  const result = await routes.handle({ method: "GET" }, res, makeUrl("/api/hermes-plugins/wardrobe/manifest?workspaceId=weixin_wuping&appOrigin=https%3A%2F%2Fhermes.example.test&appearanceTheme=dark&appearanceFontSize=large"));
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.access, ["weixin_wuping"]);
  assert.deepEqual(calls.manifest, [{
    id: "wardrobe",
    workspaceId: "weixin_wuping",
    ownerAuthorized: false,
    appOrigin: "https://hermes.example.test",
    appearance: { theme: "dark", fontSize: "large" },
    launchPlugin: true,
  }]);
  assert.equal(parseBody(res).entry.url, "http://nas/?embed=hermes");
  assert.deepEqual(res.headers["Set-Cookie"], [
    "wardrobe_session=; Path=/api/hermes-plugins/wardrobe/proxy; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax",
    `${testProxyCookieName("wardrobe", "owner", "wardrobe_session")}=; Path=/api/hermes-plugins/wardrobe/proxy; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`,
    `${testProxyCookieName("wardrobe", "weixin_wuping", "wardrobe_session")}=; Path=/api/hermes-plugins/wardrobe/proxy; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`,
  ]);
  assert.deepEqual(calls.audit, [{
    eventType: "plugin_manifest_request",
    pluginId: "wardrobe",
    workspaceId: "weixin_wuping",
    appOriginPresent: true,
    requestedAppearance: { theme: "dark", fontSize: "large" },
    responseAppearance: { theme: "", fontSize: "" },
    available: true,
    code: "",
    tokenStatus: "",
    sameOriginProxy: false,
  }]);
}

async function testMoiraManifestRouteForwardsPluginRoute() {
  const { calls, routes } = makeRoutes();
  const res = makeResponse();
  const result = await routes.handle(
    { method: "GET" },
    res,
    makeUrl("/api/hermes-plugins/moira/manifest?workspaceId=weixin_wuping&pluginRoute=saved_records&pluginItemId=chart_cd1e23e6"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.manifest, [{
    id: "moira",
    workspaceId: "weixin_wuping",
    ownerAuthorized: false,
    appOrigin: "",
    appearance: { theme: "", fontSize: "" },
    launchPlugin: true,
    pluginRoute: "saved_records",
    pluginItemId: "chart_cd1e23e6",
  }]);
}

async function testCodexManifestRoute() {
  const { calls, routes } = makeRoutes();
  const res = makeResponse();
  const result = await routes.handle({ method: "GET" }, res, makeUrl("/api/hermes-plugins/codex-mobile/manifest?workspaceId=owner&appOrigin=https%3A%2F%2Fhermes.example.test&appearanceTheme=system&appearanceFontSize=default"));
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.access, ["owner"]);
  assert.deepEqual(calls.manifest, [{
    id: "codex-mobile",
    workspaceId: "owner",
    ownerAuthorized: true,
    appOrigin: "https://hermes.example.test",
    appearance: { theme: "system", fontSize: "default" },
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

async function testCodexManifestRouteUsesEffectiveWorkspaceForOwnerSwitch() {
  const { calls, routes } = makeRoutes();
  const res = makeResponse();
  const result = await routes.handle(
    { method: "GET", auth: { workspaceId: "owner", isOwner: true } },
    res,
    makeUrl("/api/hermes-plugins/codex-mobile/manifest?workspaceId=weixin_wuping"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(parseBody(res).available, false);
  assert.equal(parseBody(res).code, "plugin_workspace_not_authorized");
  assert.equal(calls.manifest[0].ownerAuthorized, false);
}

async function testFinanceManifestRoute() {
  const { calls, routes } = makeRoutes();
  const res = makeResponse();
  const result = await routes.handle(
    { method: "GET" },
    res,
    makeUrl("/api/hermes-plugins/finance/manifest?workspaceId=owner&appOrigin=https%3A%2F%2Fhermes.example.test"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.access, ["owner"]);
  assert.deepEqual(calls.manifest, [{
    id: "finance",
    workspaceId: "owner",
    ownerAuthorized: true,
    appOrigin: "https://hermes.example.test",
    appearance: { theme: "", fontSize: "" },
    launchPlugin: true,
  }]);
}

async function testWorkspaceBlockStopsRoute() {
  const { calls, routes } = makeRoutes();
  const res = makeResponse();
  await routes.handle({ method: "GET" }, res, makeUrl("/api/hermes-plugins/wardrobe/manifest?workspaceId=blocked"));
  assert.equal(res.statusCode, 403);
  assert.deepEqual(calls.manifest, []);
}

async function testPluginProxyRequiresWorkspaceAccessBeforeFetch() {
  const access = [];
  const fetchCalls = [];
  const { routes } = makeRoutes({
    requireWorkspaceAccess(req, res, workspaceId) {
      access.push(workspaceId);
      sendJson(res, 403, { error: "Workspace access is not allowed" });
      return "";
    },
    fetch() {
      fetchCalls.push(true);
      throw new Error("proxy must not fetch without workspace access");
    },
  });
  const res = makeResponse();
  const result = await routes.handle(
    makeRequest("GET"),
    res,
    makeUrl("/api/hermes-plugins/finance/proxy/api/finance/overview?workspaceId=owner"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(access, ["owner"]);
  assert.deepEqual(fetchCalls, []);
}

async function testPluginProxyDeniesUnauthorizedWorkspacePlugin() {
  const fetchCalls = [];
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [];
      },
      manifest() {
        return Promise.resolve({ ok: false, available: false, id: "finance" });
      },
      pluginManifestUrl(id) {
        return id === "finance" ? "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest" : "";
      },
    },
    fetch() {
      fetchCalls.push(true);
      throw new Error("proxy must not fetch unauthorized plugins");
    },
  });
  const res = makeResponse();
  const result = await routes.handle(
    makeRequest("GET"),
    res,
    makeUrl("/api/hermes-plugins/finance/proxy/api/finance/overview?workspaceId=weixin_wuping"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(fetchCalls, []);
  assert.equal(parseBody(res).error, "plugin_workspace_not_authorized");
}

async function testCodexProxyIgnoresPluginQueryKeyForHomeAuth() {
  const fetchCalls = [];
  const { routes } = makeRoutes({
    authenticateRequest(req) {
      const parsed = new URL(req.url || "/", "http://localhost");
      const key = parsed.searchParams.get("key") || "";
      const cookie = String(req.headers?.cookie || "");
      if (key === "home-owner-key") return { workspaceId: "owner", isOwner: true, source: "query" };
      if (cookie.includes("hermes_web_key=home-owner-key")) return { workspaceId: "owner", isOwner: true, source: "cookie" };
      return { workspaceId: "", isOwner: false };
    },
    requireWorkspaceAccess(req, res, workspaceId) {
      if (!req.auth?.isOwner) {
        sendJson(res, 403, { error: "Workspace access is not allowed" });
        return "";
      }
      return workspaceId || "owner";
    },
    fetch(url, options = {}) {
      fetchCalls.push({ url, options });
      assert.equal(
        url,
        "http://127.0.0.1:8787/api/uploads/file?path=%2Ftmp%2Fphoto.jpg&key=cps_plugin_session&workspaceId=owner",
      );
      assert.equal(options.headers["x-hermes-plugin-workspace-id"], "owner");
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "image/jpeg" : "" },
        arrayBuffer: () => Promise.resolve(Uint8Array.from([0xff, 0xd8, 0xff]).buffer),
      });
    },
  });
  const req = makeRequest("GET");
  req.headers.cookie = "hermes_web_key=home-owner-key";
  req.url = "/api/hermes-plugins/codex-mobile/proxy/api/uploads/file?path=%2Ftmp%2Fphoto.jpg&key=cps_plugin_session&workspaceId=owner";
  const res = makeResponse();
  const result = await routes.handle(req, res, makeUrl(req.url));
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(req.auth.source, "cookie");
  assert.equal(fetchCalls.length, 1);
}

async function testPluginProxyForwardsOwnerOnlyActorContext() {
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "growth", manifestUrl: "http://127.0.0.1:4881/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "growth" });
      },
      pluginManifestUrl(id) {
        return id === "growth" ? "http://127.0.0.1:4881/api/v1/hermes/plugin/manifest" : "";
      },
    },
    fetch(url, options = {}) {
      assert.equal(url, "http://127.0.0.1:4881/api/v1/growth/view-targets?workspaceId=weixin_stephen");
      assert.equal(options.headers["x-hermes-plugin-workspace-id"], "weixin_stephen");
      assert.equal(options.headers["x-hermes-plugin-actor-workspace-id"], "owner");
      assert.equal(options.headers["x-hermes-plugin-actor-role"], "owner");
      assert.equal(Object.prototype.hasOwnProperty.call(options.headers, "x-hermes-plugin-accessible-workspaces"), false);
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : "" },
        text: () => Promise.resolve(JSON.stringify({ ok: true, targets: [] })),
      });
    },
  });
  const req = makeRequest("GET");
  req.auth = { ok: true, workspaceId: "owner", isOwner: true, role: "owner" };
  const res = makeResponse();
  const result = await routes.handle(
    req,
    res,
    makeUrl("/api/hermes-plugins/growth/proxy/api/v1/growth/view-targets?workspaceId=weixin_stephen"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(parseBody(res).ok, true);
}

async function testGrowthProxyAttachesServerSideWorkspaceBearerForWrites() {
  const authorizationCalls = [];
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "growth", manifestUrl: "http://127.0.0.1:4881/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "growth" });
      },
      pluginManifestUrl(id) {
        return id === "growth" ? "http://127.0.0.1:4881/api/v1/hermes/plugin/manifest" : "";
      },
      pluginProxyAuthorizationHeader(input) {
        authorizationCalls.push(input);
        return "Bearer growth-workspace-secret";
      },
    },
    fetch(url, options = {}) {
      assert.equal(url, "http://127.0.0.1:4881/api/v1/growth/cards/generate?workspaceId=weixin_stephen");
      assert.equal(options.headers.Authorization, "Bearer growth-workspace-secret");
      assert.equal(Object.prototype.hasOwnProperty.call(options.headers, "authorization"), false);
      assert.equal(options.headers["x-hermes-plugin-workspace-id"], "weixin_stephen");
      assert.deepEqual(JSON.parse(options.body), {
        workspace_id: "weixin_stephen",
        target_node_id: "kg_bridge_academic_english_for_igcse_and_a_level"
      });
      return Promise.resolve({
        ok: true,
        status: 201,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : "" },
        text: () => Promise.resolve(JSON.stringify({ ok: true, published: { taskCardId: "ltask_generated" } })),
      });
    },
  });
  const req = makeRequest("POST", [JSON.stringify({
    workspace_id: "weixin_stephen",
    target_node_id: "kg_bridge_academic_english_for_igcse_and_a_level"
  })]);
  req.headers.authorization = "Bearer browser-supplied-value";
  req.auth = { ok: true, workspaceId: "owner", isOwner: true, role: "owner" };
  const res = makeResponse();
  const result = await routes.handle(
    req,
    res,
    makeUrl("/api/hermes-plugins/growth/proxy/api/v1/growth/cards/generate?workspaceId=weixin_stephen"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(authorizationCalls, [{ pluginId: "growth", workspaceId: "weixin_stephen" }]);
  assert.equal(parseBody(res).published.taskCardId, "ltask_generated");
}

async function testHealthProxyAttachesServerSideWorkspaceBearerForReads() {
  const authorizationCalls = [];
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "health", manifestUrl: "http://127.0.0.1:4877/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "health" });
      },
      pluginManifestUrl(id) {
        return id === "health" ? "http://127.0.0.1:4877/api/v1/hermes/plugin/manifest" : "";
      },
      pluginProxyAuthorizationHeader(input) {
        authorizationCalls.push(input);
        return "Bearer health-workspace-secret";
      },
    },
    fetch(url, options = {}) {
      assert.equal(url, "http://127.0.0.1:4877/api/v1/apple-health/sync-state?workspaceId=owner");
      assert.equal(options.headers.Authorization, "Bearer health-workspace-secret");
      assert.equal(Object.prototype.hasOwnProperty.call(options.headers, "authorization"), false);
      assert.equal(options.headers["x-hermes-plugin-workspace-id"], "owner");
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : "" },
        text: () => Promise.resolve(JSON.stringify({ ok: true, domains: {} })),
      });
    },
  });
  const req = makeRequest("GET");
  req.headers.authorization = "Bearer browser-supplied-value";
  req.auth = { ok: true, workspaceId: "owner", isOwner: true, role: "owner" };
  const res = makeResponse();
  const result = await routes.handle(
    req,
    res,
    makeUrl("/api/hermes-plugins/health/proxy/api/v1/apple-health/sync-state?workspaceId=owner"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(authorizationCalls, [{ pluginId: "health", workspaceId: "owner" }]);
  assert.equal(parseBody(res).ok, true);
}

async function testHealthProxyWriteRequiresExplicitWorkspace() {
  let authorizationCallCount = 0;
  let fetchCallCount = 0;
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "health", manifestUrl: "http://127.0.0.1:4877/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "health" });
      },
      pluginManifestUrl(id) {
        return id === "health" ? "http://127.0.0.1:4877/api/v1/hermes/plugin/manifest" : "";
      },
      pluginProxyAuthorizationHeader() {
        authorizationCallCount += 1;
        return "Bearer owner-health-secret";
      },
    },
    fetch() {
      fetchCallCount += 1;
      throw new Error("health write without an explicit workspace must not reach upstream");
    },
  });
  const req = makeRequest("POST", [JSON.stringify({ samples: [] })]);
  req.auth = { ok: true, workspaceId: "owner", isOwner: true, role: "owner" };
  const res = makeResponse();
  const result = await routes.handle(
    req,
    res,
    makeUrl("/api/hermes-plugins/health/proxy/api/v1/apple-health/sync"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 400);
  assert.equal(parseBody(res).error, "health_proxy_workspace_required");
  assert.equal(authorizationCallCount, 0);
  assert.equal(fetchCallCount, 0);
}

async function testHealthProxyOwnerWriteTargetsNonOwnerWorkspaceKey() {
  const authorizationCalls = [];
  const { routes } = makeRoutes({
    hermesPluginService: {
      list(input = {}) {
        assert.deepEqual(input, { workspaceId: "liyushuang", ownerAuthorized: false });
        return [{ id: "health", manifestUrl: "http://127.0.0.1:4877/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "health" });
      },
      pluginManifestUrl(id) {
        return id === "health" ? "http://127.0.0.1:4877/api/v1/hermes/plugin/manifest" : "";
      },
      pluginProxyAuthorizationHeader(input) {
        authorizationCalls.push(input);
        return "Bearer liyushuang-health-secret";
      },
    },
    fetch(url, options = {}) {
      assert.equal(url, "http://127.0.0.1:4877/api/v1/apple-health/sync?workspaceId=liyushuang");
      assert.equal(options.headers.Authorization, "Bearer liyushuang-health-secret");
      assert.equal(options.headers["x-hermes-plugin-workspace-id"], "liyushuang");
      assert.equal(options.headers["x-hermes-plugin-actor-workspace-id"], "owner");
      assert.equal(options.headers["x-hermes-plugin-actor-role"], "owner");
      assert.equal(Object.prototype.hasOwnProperty.call(options.headers, "authorization"), false);
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : "" },
        text: () => Promise.resolve(JSON.stringify({ ok: true, imported: 0 })),
      });
    },
  });
  const req = makeRequest("POST", [JSON.stringify({ samples: [] })]);
  req.headers.authorization = "Bearer browser-supplied-value";
  req.auth = { ok: true, workspaceId: "owner", isOwner: true, role: "owner" };
  const res = makeResponse();
  const result = await routes.handle(
    req,
    res,
    makeUrl("/api/hermes-plugins/health/proxy/api/v1/apple-health/sync?workspaceId=liyushuang"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(authorizationCalls, [{ pluginId: "health", workspaceId: "liyushuang" }]);
  assert.equal(parseBody(res).ok, true);
}

async function testHealthProxyNativeSyncPreservesHeaderWorkspace() {
  const authorizationCalls = [];
  const { routes } = makeRoutes({
    hermesPluginService: {
      list(input = {}) {
        assert.deepEqual(input, { workspaceId: "liyushuang", ownerAuthorized: false });
        return [{ id: "health", manifestUrl: "http://127.0.0.1:4877/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "health" });
      },
      pluginManifestUrl(id) {
        return id === "health" ? "http://127.0.0.1:4877/api/v1/hermes/plugin/manifest" : "";
      },
      pluginProxyAuthorizationHeader(input) {
        authorizationCalls.push(input);
        return "Bearer liyushuang-health-secret";
      },
    },
    fetch(url, options = {}) {
      assert.equal(url, "http://127.0.0.1:4877/api/v1/apple-health/sync");
      assert.equal(options.headers.Authorization, "Bearer liyushuang-health-secret");
      assert.equal(options.headers["x-hermes-plugin-workspace-id"], "liyushuang");
      assert.equal(options.headers["x-hermes-plugin-actor-workspace-id"], "owner");
      assert.equal(options.headers["x-hermes-plugin-actor-role"], "owner");
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : "" },
        text: () => Promise.resolve(JSON.stringify({ ok: true, imported: 0 })),
      });
    },
  });
  const req = makeRequest("POST", [JSON.stringify({ samples: [] })]);
  req.headers["x-hermes-plugin-workspace-id"] = "liyushuang";
  req.auth = { ok: true, workspaceId: "owner", isOwner: true, role: "owner" };
  const res = makeResponse();
  const result = await routes.handle(
    req,
    res,
    makeUrl("/api/hermes-plugins/health/proxy/api/v1/apple-health/sync"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(authorizationCalls, [{ pluginId: "health", workspaceId: "liyushuang" }]);
  assert.equal(parseBody(res).ok, true);
}

async function testPluginNotificationRoute() {
  const { calls, routes } = makeRoutes();
  const res = makeResponse();
  const req = makeRequest("POST");
  req.body = {
    workspaceId: "weixin_wuping",
    eventId: "evt-1",
    title: "插件通知",
    summary: "插件事件摘要",
  };
  const result = await routes.handle(
    req,
    res,
    makeUrl("/api/hermes-plugins/wardrobe/notifications?workspaceId=owner"),
    { auth: { workspaceId: "weixin_wuping" } },
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 202);
  assert.deepEqual(calls.access, ["weixin_wuping"]);
  assert.equal(calls.notifications[0].pluginId, "wardrobe");
  assert.equal(calls.notifications[0].workspaceId, "weixin_wuping");
  assert.equal(calls.notifications[0].auth.workspaceId, "weixin_wuping");
  assert.deepEqual(calls.broadcasts, [{
    type: "actionInbox.updated",
    workspaceId: "weixin_wuping",
    itemId: "ainb-plugin-1",
    sourceType: "plugin",
    pluginId: "wardrobe",
  }]);
  assert.equal(parseBody(res).inboxItem.id, "ainb-plugin-1");
}

async function testCodexProxyRewritesHtmlAndUsesUpstream() {
  const fetchCalls = [];
  const { routes } = makeRoutes({
    fetch(url, options = {}) {
      fetchCalls.push({ url, options });
      assert.equal(url, "http://127.0.0.1:8787/?embed=hermes&workspaceId=owner");
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : "" },
        text: () => Promise.resolve('<link rel="stylesheet" href="/styles.css"><script src="/app.js"></script>'),
      });
    },
  });
  const res = makeResponse();
  const result = await routes.handle(
    makeRequest("GET"),
    res,
    makeUrl("/api/hermes-plugins/codex-mobile/proxy/?embed=hermes&workspaceId=owner"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /href="\/api\/hermes-plugins\/codex-mobile\/proxy\/styles\.css\?workspaceId=owner"/);
  assert.match(res.body, /src="\/api\/hermes-plugins\/codex-mobile\/proxy\/app\.js\?workspaceId=owner"/);
  assert.equal(fetchCalls[0].options.headers["x-hermes-plugin-workspace-id"], "owner");
}

async function testCodexProxyDoesNotInjectWorkspaceIdIntoJavascriptPathConstants() {
  const { routes } = makeRoutes({
    fetch(url, options = {}) {
      assert.equal(url, "http://127.0.0.1:8787/app.js?workspaceId=owner");
      assert.equal(options.headers["x-hermes-plugin-workspace-id"], "owner");
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "text/javascript; charset=utf-8" : "" },
        text: () => Promise.resolve([
          'if (parsed.pathname.startsWith("/api/")) return true;',
          'if (parsed.pathname === "/api/uploads/file") return "upload";',
          'return authenticatedApiContentUrl(`/api/uploads/file?${params.toString()}`);',
        ].join("\n")),
      });
    },
  });
  const res = makeResponse();
  const result = await routes.handle(
    makeRequest("GET"),
    res,
    makeUrl("/api/hermes-plugins/codex-mobile/proxy/app.js?workspaceId=owner"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /parsed\.pathname\.startsWith\("\/api\/hermes-plugins\/codex-mobile\/proxy\/api\/"\)/);
  assert.match(res.body, /parsed\.pathname === "\/api\/hermes-plugins\/codex-mobile\/proxy\/api\/uploads\/file"/);
  assert.match(res.body, /`\/api\/hermes-plugins\/codex-mobile\/proxy\/api\/uploads\/file\?\$\{params\.toString\(\)\}`/);
  assert.equal(res.body.includes("?workspaceId=owner"), false);
  assert.equal(res.body.includes("/api/?workspaceId=owner"), false);
}

async function testMoiraProxyHtmlAllowsDeclaredWasmEvalCsp() {
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "moira", manifestUrl: "http://127.0.0.1:4174/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "moira" });
      },
      pluginManifestUrl(id) {
        assert.equal(id, "moira");
        return "http://127.0.0.1:4174/api/v1/hermes/plugin/manifest";
      },
      pluginProxyRuntimeSecurity(input) {
        assert.equal(input.pluginId, "moira");
        return { wasmEval: true };
      },
    },
    fetch(url, options = {}) {
      assert.equal(url, "http://127.0.0.1:4174/?embed=hermes&workspaceId=owner");
      assert.equal(options.headers["x-hermes-plugin-workspace-id"], "owner");
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : "" },
        text: () => Promise.resolve('<script src="/app.js"></script>'),
      });
    },
  });
  const res = makeResponse();
  const result = await routes.handle(
    makeRequest("GET"),
    res,
    makeUrl("/api/hermes-plugins/moira/proxy/?embed=hermes&workspaceId=owner"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /src="\/api\/hermes-plugins\/moira\/proxy\/app\.js\?workspaceId=owner"/);
  assert.match(res.headers["Content-Security-Policy"], /default-src 'self'/);
  assert.match(res.headers["Content-Security-Policy"], /object-src 'none'/);
  assert.match(
    res.headers["Content-Security-Policy"],
    /script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' 'unsafe-eval'/,
  );
}

async function testMoiraProxyInfersWorkspaceFromNamespacedSessionCookie() {
  const sessionCookie = testProxyCookieName("moira", "weixin_wuping", "moira_hermes_session");
  const { routes } = makeRoutes({
    hermesPluginService: {
      list(input = {}) {
        assert.equal(input.workspaceId, "weixin_wuping");
        return [{ id: "moira", manifestUrl: "http://127.0.0.1:4174/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "moira" });
      },
      pluginManifestUrl(id) {
        assert.equal(id, "moira");
        return "http://127.0.0.1:4174/api/v1/hermes/plugin/manifest";
      },
      pluginProxyAuthorizationHeader(input) {
        assert.equal(input.pluginId, "moira");
        assert.equal(input.workspaceId, "weixin_wuping");
        return "Bearer workspace-key";
      },
    },
    fetch(url, options = {}) {
      assert.equal(url, "http://127.0.0.1:4174/api/moira/records");
      assert.equal(options.method, "POST");
      assert.equal(options.headers["x-hermes-plugin-workspace-id"], "weixin_wuping");
      assert.equal(options.headers.cookie, "moira_hermes_session=session-value");
      assert.equal(options.headers.Authorization, "Bearer workspace-key");
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : "" },
        text: () => Promise.resolve(JSON.stringify({ ok: true, record: { id: "chart_1" }, records: [] })),
      });
    },
  });
  const req = makeRequest("POST", [JSON.stringify({ record: { id: "chart_1" }, setDefault: true })]);
  req.headers.cookie = `${sessionCookie}=session-value`;
  req.auth = { workspaceId: "owner", isOwner: true };
  const res = makeResponse();
  const result = await routes.handle(
    req,
    res,
    makeUrl("/api/hermes-plugins/moira/proxy/api/moira/records"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(parseBody(res).ok, true);
}

async function testCodexProxyStreamsEventSource() {
  let textCalled = false;
  let arrayBufferCalled = false;
  const { routes } = makeRoutes({
    fetch(url, options = {}) {
      assert.equal(url, "http://127.0.0.1:8787/api/events?key=session-key&workspaceId=owner");
      assert.equal(options.headers["x-hermes-plugin-workspace-id"], "owner");
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: {
          get: (name) => name.toLowerCase() === "content-type" ? "text/event-stream; charset=utf-8" : "",
        },
        body: [
          Buffer.from('data: {"type":"status"}\n\n'),
          Buffer.from(": keepalive\n\n"),
        ],
        text() {
          textCalled = true;
          return Promise.resolve("");
        },
        arrayBuffer() {
          arrayBufferCalled = true;
          return Promise.resolve(Buffer.from(""));
        },
      });
    },
  });
  const res = makeResponse();
  const result = await routes.handle(
    makeRequest("GET"),
    res,
    makeUrl("/api/hermes-plugins/codex-mobile/proxy/api/events?key=session-key&workspaceId=owner"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "text/event-stream; charset=utf-8");
  assert.equal(res.headers["Cache-Control"], "no-cache, no-transform");
  assert.equal(res.headers["Connection"], "keep-alive");
  assert.equal(res.headers["X-Accel-Buffering"], "no");
  assert.match(res.body, /data: \{"type":"status"\}/);
  assert.match(res.body, /: keepalive/);
  assert.equal(textCalled, false);
  assert.equal(arrayBufferCalled, false);
}

async function testCodexProxyPreservesLaunchCookieAndRedirect() {
  const { routes } = makeRoutes({
    fetch(url, options = {}) {
      assert.equal(url, "http://127.0.0.1:8787/?embed=hermes&codexPluginLaunch=token&workspaceId=owner");
      assert.equal(options.redirect, "manual");
      return Promise.resolve({
        ok: true,
        status: 302,
        headers: {
          get(name) {
            const lower = name.toLowerCase();
            if (lower === "content-type") return "text/plain";
            if (lower === "location") return "http://127.0.0.1:8787/?embed=hermes&workspaceId=owner";
            return "";
          },
          getSetCookie() {
            return ["codex_mobile_plugin_session=session-value; Path=/; HttpOnly; SameSite=Lax"];
          },
        },
        text: () => Promise.resolve(""),
        arrayBuffer: () => Promise.resolve(Buffer.from("")),
      });
    },
  });
  const res = makeResponse();
  const result = await routes.handle(
    makeRequest("GET"),
    res,
    makeUrl("/api/hermes-plugins/codex-mobile/proxy/?embed=hermes&codexPluginLaunch=token&workspaceId=owner"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 302);
  assert.equal(
    res.headers.Location,
    "/api/hermes-plugins/codex-mobile/proxy/?embed=hermes&workspaceId=owner",
  );
  assert.deepEqual(res.headers["Set-Cookie"], [
    "codex_mobile_plugin_session=; Path=/api/hermes-plugins/codex-mobile/proxy; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax",
    `${testProxyCookieName("codex-mobile", "owner", "codex_mobile_plugin_session")}=; Path=/api/hermes-plugins/codex-mobile/proxy; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`,
    `${testProxyCookieName("codex-mobile", "owner", "codex_mobile_plugin_session")}=session-value; Path=/api/hermes-plugins/codex-mobile/proxy; HttpOnly; SameSite=Lax`,
  ]);
}

async function testFinanceProxyUsesConfiguredLocalUpstreamAndForwardsOrigin() {
  const fetchCalls = [];
  const { calls, routes } = makeRoutes({
    fetch(url, options = {}) {
      fetchCalls.push({ url, options });
      assert.equal(url, "http://127.0.0.1:8791/finance.html?embed=hermes&workspaceId=owner");
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : "" },
        text: () => Promise.resolve('<link rel="manifest" href="/manifest.webmanifest"><script src="/app-finance-ui.js"></script>'),
      });
    },
  });
  const req = makeRequest("GET");
  req.headers.host = "hermes.example.test";
  req.headers["x-forwarded-proto"] = "https";
  const res = makeResponse();
  const result = await routes.handle(
    req,
    res,
    makeUrl("/api/hermes-plugins/finance/proxy/finance.html?embed=hermes&workspaceId=owner"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /href="\/api\/hermes-plugins\/finance\/proxy\/manifest\.webmanifest\?workspaceId=owner"/);
  assert.match(res.body, /src="\/api\/hermes-plugins\/finance\/proxy\/app-finance-ui\.js\?workspaceId=owner"/);
  assert.deepEqual(calls.access, ["owner"]);
  assert.deepEqual(calls.list, [{ workspaceId: "owner", ownerAuthorized: true }]);
  assert.equal(fetchCalls[0].options.headers["x-hermes-plugin-workspace-id"], "owner");
  assert.equal(fetchCalls[0].options.headers["x-hermes-public-origin"], "https://hermes.example.test");
}

async function testFinanceProxyNamespacesSessionCookieAndRedirectForWorkspace() {
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "finance", manifestUrl: "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "finance" });
      },
      pluginManifestUrl(id) {
        return id === "finance" ? "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest" : "";
      },
    },
    fetch(url, options = {}) {
      assert.equal(url, "http://127.0.0.1:8791/finance.html?launch=finance_once&workspaceId=weixin_test_1");
      assert.equal(options.redirect, "manual");
      return Promise.resolve({
        ok: true,
        status: 302,
        headers: {
          get(name) {
            const lower = name.toLowerCase();
            if (lower === "content-type") return "text/plain";
            if (lower === "location") return "http://127.0.0.1:8791/finance.html?embed=hermes";
            return "";
          },
          getSetCookie() {
            return ["finance_hermes_session=finance-session; Domain=127.0.0.1; Path=/; HttpOnly; SameSite=Lax"];
          },
        },
        text: () => Promise.resolve(""),
        arrayBuffer: () => Promise.resolve(Buffer.from("")),
      });
    },
  });
  const res = makeResponse();
  const result = await routes.handle(
    makeRequest("GET"),
    res,
    makeUrl("/api/hermes-plugins/finance/proxy/finance.html?launch=finance_once&workspaceId=weixin_test_1"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.Location, "/api/hermes-plugins/finance/proxy/finance.html?embed=hermes&workspaceId=weixin_test_1");
  assert.deepEqual(res.headers["Set-Cookie"], [
    "finance_hermes_session=; Path=/api/hermes-plugins/finance/proxy; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax",
    `${testProxyCookieName("finance", "owner", "finance_hermes_session")}=; Path=/api/hermes-plugins/finance/proxy; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`,
    `${testProxyCookieName("finance", "weixin_test_1", "finance_hermes_session")}=; Path=/api/hermes-plugins/finance/proxy; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`,
    "finance_session=; Path=/api/hermes-plugins/finance/proxy; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax",
    `${testProxyCookieName("finance", "owner", "finance_session")}=; Path=/api/hermes-plugins/finance/proxy; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`,
    `${testProxyCookieName("finance", "weixin_test_1", "finance_session")}=; Path=/api/hermes-plugins/finance/proxy; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`,
    `${testProxyCookieName("finance", "weixin_test_1", "finance_hermes_session")}=finance-session; Path=/api/hermes-plugins/finance/proxy; HttpOnly; SameSite=Lax`,
  ]);
}

async function testPluginProxyPreservesExternalOAuthRedirectLocation() {
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "music", manifestUrl: "http://127.0.0.1:4891/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "music" });
      },
      pluginManifestUrl(id) {
        return id === "music" ? "http://127.0.0.1:4891/api/v1/hermes/plugin/manifest" : "";
      },
    },
    fetch(url, options = {}) {
      assert.equal(url, "http://127.0.0.1:4891/api/v1/music/tidal/oauth/authorize?workspaceId=owner");
      assert.equal(options.redirect, "manual");
      return Promise.resolve({
        ok: true,
        status: 302,
        headers: {
          get(name) {
            const lower = name.toLowerCase();
            if (lower === "content-type") return "text/plain";
            if (lower === "location") return "https://login.tidal.com/authorize?state=redacted";
            return "";
          },
          getSetCookie() {
            return [];
          },
        },
        text: () => Promise.resolve(""),
        arrayBuffer: () => Promise.resolve(Buffer.from("")),
      });
    },
  });
  const res = makeResponse();
  const result = await routes.handle(
    makeRequest("GET"),
    res,
    makeUrl("/api/hermes-plugins/music/proxy/api/v1/music/tidal/oauth/authorize?workspaceId=owner"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.Location, "https://login.tidal.com/authorize?state=redacted");
}

function makeMusicProxyDeps(overrides = {}) {
  return makeRoutes(Object.assign({
    hermesPluginService: {
      list() {
        return [{ id: "music", manifestUrl: "http://127.0.0.1:4891/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "music" });
      },
      pluginManifestUrl(id) {
        return id === "music" ? "http://127.0.0.1:4891/api/v1/hermes/plugin/manifest" : "";
      },
      pluginProxyAuthorizationHeader(input) {
        assert.deepEqual(input, { pluginId: "music", workspaceId: "owner" });
        return "Bearer music-workspace-secret";
      },
    },
  }, overrides));
}

async function testMusicTidalOAuthCallbackBypassesWorkspaceGate() {
  const access = [];
  const fetchCalls = [];
  const { routes } = makeMusicProxyDeps({
    requireWorkspaceAccess(_req, _res, workspaceId) {
      access.push(workspaceId);
      throw new Error("public callback must not require workspace access");
    },
    fetch(url, options = {}) {
      fetchCalls.push({ url, options });
      assert.equal(
        url,
        "http://127.0.0.1:4891/api/v1/music/tidal/oauth/callback/?code=dummy-code&state=dummy-state",
      );
      assert.equal(options.method, "GET");
      assert.equal(options.redirect, "manual");
      assert.equal(options.headers["x-hermes-plugin-workspace-id"], "owner");
      assert.equal(options.headers.Authorization, "Bearer music-workspace-secret");
      assert.equal(Object.prototype.hasOwnProperty.call(options.headers, "cookie"), false);
      return Promise.resolve({
        ok: false,
        status: 400,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : "" },
        text: () => Promise.resolve(JSON.stringify({ ok: false, error: "state_mismatch" })),
      });
    },
  });
  const res = makeResponse();
  const result = await routes.handle(
    makeRequest("GET"),
    res,
    makeUrl("/api/hermes-plugins/music/proxy/api/v1/music/tidal/oauth/callback/?code=dummy-code&state=dummy-state"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(access, []);
  assert.equal(fetchCalls.length, 1);
  assert.equal(parseBody(res).error, "state_mismatch");
}

async function testMusicTidalOAuthCallbackWithErrorBypassesWorkspaceGate() {
  const access = [];
  const { routes } = makeMusicProxyDeps({
    requireWorkspaceAccess(_req, _res, workspaceId) {
      access.push(workspaceId);
      throw new Error("public callback error must not require workspace access");
    },
    fetch(url, options = {}) {
      assert.equal(
        url,
        "http://127.0.0.1:4891/api/v1/music/tidal/oauth/callback/?error=access_denied&state=dummy-state",
      );
      assert.equal(options.headers["x-hermes-plugin-workspace-id"], "owner");
      return Promise.resolve({
        ok: false,
        status: 400,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : "" },
        text: () => Promise.resolve(JSON.stringify({ ok: false, error: "access_denied" })),
      });
    },
  });
  const res = makeResponse();
  await routes.handle(
    makeRequest("GET"),
    res,
    makeUrl("/api/hermes-plugins/music/proxy/api/v1/music/tidal/oauth/callback/?error=access_denied&state=dummy-state"),
  );
  assert.equal(res.statusCode, 400);
  assert.deepEqual(access, []);
  assert.equal(parseBody(res).error, "access_denied");
}

async function testMusicTidalOAuthCallbackExceptionIsNarrow() {
  const cases = [
    {
      name: "missing-state",
      method: "GET",
      url: "/api/hermes-plugins/music/proxy/api/v1/music/tidal/oauth/callback/?code=dummy-code",
      access: "owner",
    },
    {
      name: "missing-code-or-error",
      method: "GET",
      url: "/api/hermes-plugins/music/proxy/api/v1/music/tidal/oauth/callback/?state=dummy-state",
      access: "owner",
    },
    {
      name: "non-get",
      method: "POST",
      url: "/api/hermes-plugins/music/proxy/api/v1/music/tidal/oauth/callback/?code=dummy-code&state=dummy-state",
      access: "owner",
    },
    {
      name: "non-callback-path",
      method: "GET",
      url: "/api/hermes-plugins/music/proxy/api/v1/music/tidal/oauth/authorize?code=dummy-code&state=dummy-state",
      access: "owner",
    },
    {
      name: "non-music",
      method: "GET",
      url: "/api/hermes-plugins/finance/proxy/api/v1/music/tidal/oauth/callback/?code=dummy-code&state=dummy-state",
      access: "owner",
      pluginId: "finance",
      manifestUrl: "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest",
    },
  ];
  for (const item of cases) {
    const access = [];
    const fetchCalls = [];
    const pluginId = item.pluginId || "music";
    const manifestUrl = item.manifestUrl || "http://127.0.0.1:4891/api/v1/hermes/plugin/manifest";
    const { routes } = makeRoutes({
      requireWorkspaceAccess(req, res, workspaceId) {
        access.push(workspaceId);
        sendJson(res, 403, { error: "Workspace access is not allowed", case: item.name });
        return "";
      },
      hermesPluginService: {
        list() {
          return [{ id: pluginId, manifestUrl }];
        },
        manifest() {
          return Promise.resolve({ ok: true, available: true, id: pluginId });
        },
        pluginManifestUrl(id) {
          return id === pluginId ? manifestUrl : "";
        },
      },
      fetch() {
        fetchCalls.push(item.name);
        throw new Error(`narrow exception failed for ${item.name}`);
      },
    });
    const res = makeResponse();
    const result = await routes.handle(
      makeRequest(item.method),
      res,
      makeUrl(item.url),
    );
    assert.equal(result.handled, true, item.name);
    assert.equal(res.statusCode, 403, item.name);
    assert.deepEqual(access, [item.access], item.name);
    assert.deepEqual(fetchCalls, [], item.name);
    assert.equal(parseBody(res).error, "Workspace access is not allowed", item.name);
  }
}

async function testFinanceProxyRewritesFinanceApiJsonUrls() {
  const { routes } = makeRoutes({
    fetch(url, options = {}) {
      assert.equal(url, "http://127.0.0.1:8791/api/finance/receipts/1?workspaceId=owner");
      assert.equal(options.headers["x-hermes-plugin-workspace-id"], "owner");
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : "" },
        text: () => Promise.resolve(JSON.stringify({
          receiptUrl: "/api/finance/receipts/1/image",
          note: "Do not rewrite prose mentioning /api/not-a-resource.",
        })),
      });
    },
  });
  const res = makeResponse();
  const result = await routes.handle(
    makeRequest("GET"),
    res,
    makeUrl("/api/hermes-plugins/finance/proxy/api/finance/receipts/1?workspaceId=owner"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /"receiptUrl":"\/api\/hermes-plugins\/finance\/proxy\/api\/finance\/receipts\/1\/image\?workspaceId=owner"/);
  assert.match(res.body, /"note":"Do not rewrite prose mentioning \/api\/not-a-resource\."/);
}

async function testNoteProxyRewritesAttachmentJsonUrls() {
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "note", manifestUrl: "http://127.0.0.1:4181/api/v1/hermes/plugin/manifest" }];
      },
      manifest(input) {
        assert.equal(input.id, "note");
        return Promise.resolve({ ok: true, available: true, id: "note", entry: { url: "http://127.0.0.1:4181/?embed=hermes" } });
      },
      pluginManifestUrl(id) {
        assert.equal(id, "note");
        return "http://127.0.0.1:4181/api/v1/hermes/plugin/manifest";
      },
    },
    fetch(url, options = {}) {
      assert.equal(url, "http://127.0.0.1:4181/api/v1/app/notes/note-1?workspaceId=owner");
      assert.equal(options.headers["x-hermes-plugin-workspace-id"], "owner");
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : "" },
        text: () => Promise.resolve(JSON.stringify({
          note: {
            id: "note-1",
            body: '<img src="/api/v1/app/attachments/att-1" alt="">',
            attachments: [{
              id: "att-1",
              kind: "image",
              url: "/api/v1/app/attachments/att-1",
              previewUrl: "/api/v1/app/attachments/att-1/preview",
              thumbnailUrl: "/api/v1/app/attachments/att-1/thumbnail",
              downloadUrl: "/api/v1/app/attachments/att-1?download=1",
            }],
            prose: "Do not rewrite prose mentioning /api/v1/app/attachments/att-text.",
          },
        })),
      });
    },
  });
  const res = makeResponse();
  const result = await routes.handle(
    makeRequest("GET"),
    res,
    makeUrl("/api/hermes-plugins/note/proxy/api/v1/app/notes/note-1?workspaceId=owner"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  const body = parseBody(res);
  assert.equal(
    body.note.attachments[0].url,
    "/api/hermes-plugins/note/proxy/api/v1/app/attachments/att-1?workspaceId=owner",
  );
  assert.equal(
    body.note.attachments[0].previewUrl,
    "/api/hermes-plugins/note/proxy/api/v1/app/attachments/att-1/preview?workspaceId=owner",
  );
  assert.equal(
    body.note.attachments[0].thumbnailUrl,
    "/api/hermes-plugins/note/proxy/api/v1/app/attachments/att-1/thumbnail?workspaceId=owner",
  );
  assert.equal(
    body.note.attachments[0].downloadUrl,
    "/api/hermes-plugins/note/proxy/api/v1/app/attachments/att-1?download=1&workspaceId=owner",
  );
  assert.match(
    body.note.body,
    /src="\/api\/hermes-plugins\/note\/proxy\/api\/v1\/app\/attachments\/att-1\?workspaceId=owner"/,
  );
  assert.equal(body.note.prose, "Do not rewrite prose mentioning /api/v1/app/attachments/att-text.");
}

async function testFinanceProxyForwardsOnlyCurrentWorkspaceSessionCookie() {
  const fetchCalls = [];
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "finance", manifestUrl: "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "finance" });
      },
      pluginManifestUrl(id) {
        return id === "finance" ? "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest" : "";
      },
    },
    fetch(url, options = {}) {
      fetchCalls.push({ url, options });
      assert.equal(url, "http://127.0.0.1:8791/api/finance/overview?workspaceId=weixin_test_1");
      assert.equal(options.headers.cookie, "finance_hermes_session=test-finance-session");
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : "" },
        text: () => Promise.resolve(JSON.stringify({ ok: true })),
      });
    },
  });
  const req = makeRequest("GET");
  req.headers.cookie = [
    `${testProxyCookieName("finance", "owner", "finance_hermes_session")}=owner-finance-session`,
    `${testProxyCookieName("finance", "weixin_test_1", "finance_hermes_session")}=test-finance-session`,
    "finance_hermes_session=legacy-owner-session",
    "hermes_session=host-session",
  ].join("; ");
  const res = makeResponse();
  const result = await routes.handle(
    req,
    res,
    makeUrl("/api/hermes-plugins/finance/proxy/api/finance/overview?workspaceId=weixin_test_1"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(fetchCalls.length, 1);
}

async function testFinanceProxyRewritesBrowserApiCallsWithWorkspaceId() {
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "finance", manifestUrl: "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "finance" });
      },
      pluginManifestUrl(id) {
        return id === "finance" ? "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest" : "";
      },
    },
    fetch(url, options = {}) {
      assert.equal(url, "http://127.0.0.1:8791/app-finance-ui.js?workspaceId=weixin_wuping");
      assert.equal(options.headers["x-hermes-plugin-workspace-id"], "weixin_wuping");
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "application/javascript; charset=utf-8" : "" },
        text: () => Promise.resolve("fetch('/api/finance/overview'); fetch(`/api/finance/transactions?limit=5`);"),
      });
    },
  });
  const res = makeResponse();
  const result = await routes.handle(
    makeRequest("GET"),
    res,
    makeUrl("/api/hermes-plugins/finance/proxy/app-finance-ui.js?workspaceId=weixin_wuping"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /fetch\('\/api\/hermes-plugins\/finance\/proxy\/api\/finance\/overview'\)/);
  assert.match(res.body, /fetch\(`\/api\/hermes-plugins\/finance\/proxy\/api\/finance\/transactions\?limit=5`\)/);
  assert.equal(res.body.includes("workspaceId=weixin_wuping"), false);
}

async function testFinanceProxyRejectsAmbiguousWorkspaceCookiesWithoutWorkspaceHint() {
  const fetchCalls = [];
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "finance", manifestUrl: "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "finance" });
      },
      pluginManifestUrl(id) {
        return id === "finance" ? "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest" : "";
      },
    },
    fetch() {
      fetchCalls.push(true);
      throw new Error("ambiguous workspace cookies must not reach upstream");
    },
  });
  const req = makeRequest("GET");
  req.headers.cookie = [
    `${testProxyCookieName("finance", "owner", "finance_hermes_session")}=owner-finance-session`,
    `${testProxyCookieName("finance", "weixin_wuping", "finance_hermes_session")}=wuping-finance-session`,
  ].join("; ");
  const res = makeResponse();
  const result = await routes.handle(
    req,
    res,
    makeUrl("/api/hermes-plugins/finance/proxy/api/finance/overview"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 400);
  assert.equal(parseBody(res).error, "plugin_proxy_workspace_ambiguous");
  assert.equal(fetchCalls.length, 0);
}

async function testWardrobeProxyRewritesSessionCookieScope() {
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "wardrobe", manifestUrl: "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "wardrobe" });
      },
      pluginManifestUrl(id) {
        return id === "wardrobe" ? "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest" : "";
      },
    },
    fetch(url, options = {}) {
      assert.equal(url, "http://127.0.0.1:8765/?embed=hermes&launch=wpl_once&workspaceId=weixin_test_1");
      assert.equal(options.redirect, "manual");
      return Promise.resolve({
        ok: false,
        status: 302,
        headers: {
          get(name) {
            const lower = name.toLowerCase();
            if (lower === "content-type") return "text/plain";
            if (lower === "location") return "http://127.0.0.1:8765/?embed=hermes";
            return "";
          },
          getSetCookie() {
            return [
              "wardrobe_session=session-value; Domain=192.168.10.99; Path=/; HttpOnly; SameSite=None; Secure",
            ];
          },
        },
        arrayBuffer: () => Promise.resolve(Buffer.from("")),
      });
    },
  });
  const res = makeResponse();
  const result = await routes.handle(
    makeRequest("GET"),
    res,
    makeUrl("/api/hermes-plugins/wardrobe/proxy/?embed=hermes&launch=wpl_once&workspaceId=weixin_test_1"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.Location, "/api/hermes-plugins/wardrobe/proxy/?embed=hermes&workspaceId=weixin_test_1");
  assert.deepEqual(res.headers["Set-Cookie"], [
    "wardrobe_session=; Path=/api/hermes-plugins/wardrobe/proxy; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax",
    `${testProxyCookieName("wardrobe", "owner", "wardrobe_session")}=; Path=/api/hermes-plugins/wardrobe/proxy; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`,
    `${testProxyCookieName("wardrobe", "weixin_test_1", "wardrobe_session")}=; Path=/api/hermes-plugins/wardrobe/proxy; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`,
    `${testProxyCookieName("wardrobe", "weixin_test_1", "wardrobe_session")}=session-value; Path=/api/hermes-plugins/wardrobe/proxy; HttpOnly; SameSite=None; Secure`,
  ]);
}

async function testPluginLaunchProxyDoesNotForwardExistingSessionCookiesAndClearsStaleCookies() {
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "wardrobe", manifestUrl: "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "wardrobe" });
      },
      pluginManifestUrl(id) {
        return id === "wardrobe" ? "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest" : "";
      },
    },
    fetch(url, options = {}) {
      assert.equal(url, "http://127.0.0.1:8765/?embed=hermes&launch=wpl_once&workspaceId=weixin_test_1");
      assert.equal(Object.hasOwn(options.headers, "cookie"), false);
      return Promise.resolve({
        ok: true,
        status: 302,
        headers: {
          get(name) {
            const lower = name.toLowerCase();
            if (lower === "content-type") return "text/plain";
            if (lower === "location") return "http://127.0.0.1:8765/?embed=hermes";
            return "";
          },
          getSetCookie() {
            return [
              "wardrobe_session=fresh-session; Path=/; HttpOnly; SameSite=None; Secure",
            ];
          },
        },
        arrayBuffer: () => Promise.resolve(Buffer.from("")),
      });
    },
  });
  const req = makeRequest("GET");
  req.headers.cookie = [
    `${testProxyCookieName("wardrobe", "owner", "wardrobe_session")}=owner-session`,
    `${testProxyCookieName("wardrobe", "weixin_test_1", "wardrobe_session")}=old-test-session`,
    "wardrobe_session=legacy-session",
  ].join("; ");
  const res = makeResponse();
  const result = await routes.handle(
    req,
    res,
    makeUrl("/api/hermes-plugins/wardrobe/proxy/?embed=hermes&launch=wpl_once&workspaceId=weixin_test_1"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 302);
  assert.deepEqual(res.headers["Set-Cookie"], [
    "wardrobe_session=; Path=/api/hermes-plugins/wardrobe/proxy; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax",
    `${testProxyCookieName("wardrobe", "owner", "wardrobe_session")}=; Path=/api/hermes-plugins/wardrobe/proxy; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`,
    `${testProxyCookieName("wardrobe", "weixin_test_1", "wardrobe_session")}=; Path=/api/hermes-plugins/wardrobe/proxy; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`,
    `${testProxyCookieName("wardrobe", "weixin_test_1", "wardrobe_session")}=fresh-session; Path=/api/hermes-plugins/wardrobe/proxy; HttpOnly; SameSite=None; Secure`,
  ]);
}

async function testWardrobeProxyForwardsOnlyCurrentWorkspaceSessionCookie() {
  const fetchCalls = [];
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "wardrobe", manifestUrl: "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "wardrobe" });
      },
      pluginManifestUrl(id) {
        return id === "wardrobe" ? "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest" : "";
      },
    },
    fetch(url, options = {}) {
      fetchCalls.push({ url, options });
      assert.equal(url, "http://127.0.0.1:8765/api/items?workspaceId=weixin_test_1");
      assert.equal(options.headers.cookie, "wardrobe_session=test-session");
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : "" },
        text: () => Promise.resolve(JSON.stringify({ ok: true })),
      });
    },
  });
  const req = makeRequest("GET");
  req.headers.cookie = [
    `${testProxyCookieName("wardrobe", "owner", "wardrobe_session")}=owner-session`,
    `${testProxyCookieName("wardrobe", "weixin_test_1", "wardrobe_session")}=test-session`,
    "wardrobe_session=legacy-owner-session",
    "hermes_session=host-session",
  ].join("; ");
  const res = makeResponse();
  const result = await routes.handle(
    req,
    res,
    makeUrl("/api/hermes-plugins/wardrobe/proxy/api/items?workspaceId=weixin_test_1"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(fetchCalls.length, 1);
}

async function testWardrobeProxyUsesConfiguredLanUpstream() {
  const fetchCalls = [];
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "wardrobe", manifestUrl: "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "wardrobe" });
      },
      pluginManifestUrl(id) {
        return id === "wardrobe" ? "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest" : "";
      },
    },
    fetch(url, options = {}) {
      fetchCalls.push({ url, options });
      assert.equal(url, "http://127.0.0.1:8765/?embed=hermes&launch=wpl_once&workspaceId=owner");
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : "" },
        text: () => Promise.resolve('<link rel="stylesheet" href="/styles.css"><script src="/app.js"></script>'),
      });
    },
  });
  const res = makeResponse();
  const result = await routes.handle(
    makeRequest("GET"),
    res,
    makeUrl("/api/hermes-plugins/wardrobe/proxy/?embed=hermes&launch=wpl_once&workspaceId=owner"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /href="\/api\/hermes-plugins\/wardrobe\/proxy\/styles\.css\?workspaceId=owner"/);
  assert.match(res.body, /src="\/api\/hermes-plugins\/wardrobe\/proxy\/app\.js\?workspaceId=owner"/);
  assert.equal(fetchCalls[0].options.headers["x-hermes-plugin-workspace-id"], "owner");
}

async function testWardrobeProxyPreservesTemplateLiteralApiUrls() {
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "wardrobe", manifestUrl: "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "wardrobe" });
      },
      pluginManifestUrl(id) {
        return id === "wardrobe" ? "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest" : "";
      },
    },
    fetch(url) {
      assert.equal(url, "http://127.0.0.1:8765/app.js?workspaceId=owner");
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "application/javascript; charset=utf-8" : "" },
        text: () => Promise.resolve([
          'return fetch(`/api/auth/status?_ts=${Date.now()}_${attempt}`, { cache: "no-store" });',
          'await fetch(`/api/threads${params}`);',
          'await fetch(`/api/client-events?key=${encodeURIComponent(state.key)}`);',
        ].join("\n")),
      });
    },
  });
  const res = makeResponse();
  const result = await routes.handle(
    makeRequest("GET"),
    res,
    makeUrl("/api/hermes-plugins/wardrobe/proxy/app.js?workspaceId=owner"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /`\/api\/hermes-plugins\/wardrobe\/proxy\/api\/auth\/status\?_ts=\$\{Date\.now\(\)\}_\$\{attempt\}`/);
  assert.match(res.body, /`\/api\/hermes-plugins\/wardrobe\/proxy\/api\/threads\$\{params\}`/);
  assert.match(res.body, /`\/api\/hermes-plugins\/wardrobe\/proxy\/api\/client-events\?key=\$\{encodeURIComponent\(state\.key\)\}`/);
  assert.equal(res.body.includes("workspaceId=owner"), false);
  assert.equal(res.body.includes("Date.now(&workspaceId"), false);
}

async function testWardrobeProxyNormalizesUnsafeOriginForUpload() {
  const requestBody = "--boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"photo.jpg\"\r\n\r\njpeg\r\n--boundary--\r\n";
  const fetchCalls = [];
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "wardrobe", manifestUrl: "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "wardrobe" });
      },
      pluginManifestUrl(id) {
        return id === "wardrobe" ? "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest" : "";
      },
    },
    fetch(url, options = {}) {
      fetchCalls.push({ url, options });
      assert.equal(url, "http://127.0.0.1:8765/api/items/1/photos?workspaceId=owner");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.origin, "http://127.0.0.1:8765");
      assert.equal(options.headers.referer, "http://127.0.0.1:8765/api/items/1/photos?workspaceId=owner");
      assert.equal(options.headers["x-hermes-public-origin"], "https://hermes-xuxin.synology.me:8445");
      assert.equal(options.headers["x-forwarded-origin"], "https://hermes-xuxin.synology.me:8445");
      assert.equal(options.headers["content-type"], "multipart/form-data; boundary=boundary");
      assert.equal(String(options.headers.origin).includes("hermes-xuxin"), false);
      assert.deepEqual(Buffer.from(options.body), Buffer.from(requestBody));
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : "" },
        text: () => Promise.resolve(JSON.stringify({ ok: true })),
      });
    },
  });
  const req = makeRequest("POST", [requestBody]);
  req.headers = {
    origin: "https://hermes-xuxin.synology.me:8445",
    referer: "https://hermes-xuxin.synology.me:8445/hermes-mobile/",
    "content-type": "multipart/form-data; boundary=boundary",
    "content-length": String(Buffer.byteLength(requestBody)),
  };
  const res = makeResponse();
  const result = await routes.handle(
    req,
    res,
    makeUrl("/api/hermes-plugins/wardrobe/proxy/api/items/1/photos?workspaceId=owner"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(fetchCalls.length, 1);
}

async function testPluginProxyRewritesJsonImageUrls() {
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "wardrobe", manifestUrl: "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "wardrobe" });
      },
      pluginManifestUrl(id) {
        return id === "wardrobe" ? "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest" : "";
      },
    },
    fetch(url, options = {}) {
      assert.equal(url, "http://127.0.0.1:8765/api/items/1?workspaceId=owner");
      assert.equal(options.headers["x-hermes-plugin-workspace-id"], "owner");
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : "" },
        text: () => Promise.resolve(JSON.stringify({
          imageUrl: "http://127.0.0.1:8765/uploads/item-1.jpg",
          thumb: "/media/thumb-1.webp",
          icon: "/static/icon.png",
        })),
      });
    },
  });
  const res = makeResponse();
  const result = await routes.handle(
    makeRequest("GET"),
    res,
    makeUrl("/api/hermes-plugins/wardrobe/proxy/api/items/1?workspaceId=owner"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /"imageUrl":"\/api\/hermes-plugins\/wardrobe\/proxy\/uploads\/item-1\.jpg\?workspaceId=owner"/);
  assert.match(res.body, /"thumb":"\/api\/hermes-plugins\/wardrobe\/proxy\/media\/thumb-1\.webp\?workspaceId=owner"/);
  assert.match(res.body, /"icon":"\/api\/hermes-plugins\/wardrobe\/proxy\/static\/icon\.png\?workspaceId=owner"/);
  assert.equal(res.body.includes("192.168.10.99"), false);
}

async function testPluginProxyDoesNotCorruptJsonProse() {
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "codex-mobile", manifestUrl: "http://127.0.0.1:8787/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "codex-mobile" });
      },
      pluginManifestUrl(id) {
        return id === "codex-mobile" ? "http://127.0.0.1:8787/api/v1/hermes/plugin/manifest" : "";
      },
    },
    fetch(url) {
      assert.equal(url, "http://127.0.0.1:8787/api/threads/thread-1");
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : "" },
        text: () => Promise.resolve(JSON.stringify({
          text: 'Do not rewrite prose like CSS url(/uploads/example.jpg) inside a thread message.',
          imageUrl: "/uploads/item-1.jpg",
          uploadUrl: "/api/uploads/file?path=input.jpg",
          generatedImageUrl: "/api/generated-images/file?id=image-1",
          previewContentUrl: "/api/files/preview/content?threadId=thread-1&path=out.png",
          wardrobePhotoUrl: "/api/photos/12/content?thumb=1",
          wardrobeItemThumbnailUrl: "/api/v1/items/LP-1/photos/primary/thumbnail",
          wardrobeOutfitPhotoUrl: "/api/outfit-photos/44/content",
          wardrobeFeaturedPhotoUrl: "/api/featured-look-photos/45/content",
          apiText: "/api/threads/thread-1",
          apiOriginText: "http://127.0.0.1:8787/api/threads/thread-1",
          nested: {
            thumb: "http://127.0.0.1:8787/media/thumb-1.webp",
            upload: "http://127.0.0.1:8787/api/uploads/file?path=input.jpg",
          },
        })),
      });
    },
  });
  const res = makeResponse();
  const result = await routes.handle(
    makeRequest("GET"),
    res,
    makeUrl("/api/hermes-plugins/codex-mobile/proxy/api/threads/thread-1"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  const body = parseBody(res);
  assert.equal(body.text, "Do not rewrite prose like CSS url(/uploads/example.jpg) inside a thread message.");
  assert.equal(body.imageUrl, "/api/hermes-plugins/codex-mobile/proxy/uploads/item-1.jpg?workspaceId=owner");
  assert.equal(body.uploadUrl, "/api/hermes-plugins/codex-mobile/proxy/api/uploads/file?path=input.jpg&workspaceId=owner");
  assert.equal(body.generatedImageUrl, "/api/hermes-plugins/codex-mobile/proxy/api/generated-images/file?id=image-1&workspaceId=owner");
  assert.equal(body.previewContentUrl, "/api/hermes-plugins/codex-mobile/proxy/api/files/preview/content?threadId=thread-1&path=out.png&workspaceId=owner");
  assert.equal(body.wardrobePhotoUrl, "/api/hermes-plugins/codex-mobile/proxy/api/photos/12/content?thumb=1&workspaceId=owner");
  assert.equal(body.wardrobeItemThumbnailUrl, "/api/hermes-plugins/codex-mobile/proxy/api/v1/items/LP-1/photos/primary/thumbnail?workspaceId=owner");
  assert.equal(body.wardrobeOutfitPhotoUrl, "/api/hermes-plugins/codex-mobile/proxy/api/outfit-photos/44/content?workspaceId=owner");
  assert.equal(body.wardrobeFeaturedPhotoUrl, "/api/hermes-plugins/codex-mobile/proxy/api/featured-look-photos/45/content?workspaceId=owner");
  assert.equal(body.apiText, "/api/threads/thread-1");
  assert.equal(body.apiOriginText, "http://127.0.0.1:8787/api/threads/thread-1");
  assert.equal(body.nested.thumb, "/api/hermes-plugins/codex-mobile/proxy/media/thumb-1.webp?workspaceId=owner");
  assert.equal(body.nested.upload, "/api/hermes-plugins/codex-mobile/proxy/api/uploads/file?path=input.jpg&workspaceId=owner");
}

async function testPluginProxyForwardsBinaryImages() {
  const body = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "codex-mobile", manifestUrl: "http://127.0.0.1:8787/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "codex-mobile" });
      },
      pluginManifestUrl(id) {
        return id === "codex-mobile" ? "http://127.0.0.1:8787/api/v1/hermes/plugin/manifest" : "";
      },
    },
    fetch(url) {
      assert.equal(url, "http://127.0.0.1:8787/uploads/screenshot.jpg");
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "image/jpeg" : "" },
        arrayBuffer: () => Promise.resolve(body),
      });
    },
  });
  const res = makeResponse();
  const result = await routes.handle(
    makeRequest("GET"),
    res,
    makeUrl("/api/hermes-plugins/codex-mobile/proxy/uploads/screenshot.jpg"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "image/jpeg");
  assert.deepEqual(Buffer.from(res.body), body);
}

async function testWardrobeProxyNormalizesThumbnailQuerySuffix() {
  const body = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const { calls, routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "wardrobe", manifestUrl: "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "wardrobe" });
      },
      pluginManifestUrl(id) {
        return id === "wardrobe" ? "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest" : "";
      },
    },
    fetch(url, options = {}) {
      assert.equal(url, "http://127.0.0.1:8765/api/photos/584/content?workspaceId=owner&thumb=1");
      assert.equal(options.headers["x-hermes-plugin-workspace-id"], "owner");
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "image/jpeg" : "" },
        arrayBuffer: () => Promise.resolve(body),
      });
    },
  });
  const res = makeResponse();
  const result = await routes.handle(
    makeRequest("GET"),
    res,
    makeUrl("/api/hermes-plugins/wardrobe/proxy/api/photos/584/content?workspaceId=owner?thumb=1"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "image/jpeg");
  assert.deepEqual(calls.access, ["owner"]);
  assert.deepEqual(Buffer.from(res.body), body);
}

async function testWardrobeProxyInjectsUploadFileInputCompatibilityCss() {
  const css = ".upload-btn input { display: none; }";
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "wardrobe", manifestUrl: "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "wardrobe" });
      },
      pluginManifestUrl(id) {
        return id === "wardrobe" ? "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest" : "";
      },
    },
    fetch(url) {
      assert.equal(url, "http://127.0.0.1:8765/styles.css?v=1");
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "text/css; charset=utf-8" : "" },
        text: () => Promise.resolve(css),
      });
    },
  });
  const res = makeResponse();
  const result = await routes.handle(
    makeRequest("GET"),
    res,
    makeUrl("/api/hermes-plugins/wardrobe/proxy/styles.css?v=1"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Hermes embedded-plugin upload compatibility/);
  assert.match(res.body, /\.upload-btn input\[type="file"\],[\s\S]*?\.upload-btn input\.entity-photo-input \{[\s\S]*?display: block !important;[\s\S]*?opacity: 0;/);
}

async function testPluginProxyPreservesQuotedCssUrlSyntax() {
  const css = [
    ".hero {",
    "  background: url(\"/assets/wacai-ledger-bg.svg\") center / cover no-repeat;",
    "}",
    ".icon { background: url('/icons/finance-icon.svg') center / contain no-repeat; }",
    ".plain { background: url(/media/thumb.webp) center / cover no-repeat; }",
    ".finance-bottom-nav { position: fixed; bottom: 126px; }",
  ].join("\n");
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "finance", manifestUrl: "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "finance" });
      },
      pluginManifestUrl(id) {
        return id === "finance" ? "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest" : "";
      },
    },
    fetch(url) {
      assert.equal(url, "http://127.0.0.1:8791/styles.css?v=finance-replica&workspaceId=owner");
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "text/css; charset=utf-8" : "" },
        text: () => Promise.resolve(css),
      });
    },
  });
  const res = makeResponse();
  const result = await routes.handle(
    makeRequest("GET"),
    res,
    makeUrl("/api/hermes-plugins/finance/proxy/styles.css?v=finance-replica&workspaceId=owner"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /url\("\/api\/hermes-plugins\/finance\/proxy\/assets\/wacai-ledger-bg\.svg\?workspaceId=owner"\) center/);
  assert.match(res.body, /url\('\/api\/hermes-plugins\/finance\/proxy\/icons\/finance-icon\.svg\?workspaceId=owner'\) center/);
  assert.match(res.body, /url\(\/api\/hermes-plugins\/finance\/proxy\/media\/thumb\.webp\?workspaceId=owner\) center/);
  assert.match(res.body, /\.finance-bottom-nav \{ position: fixed; bottom: 126px; \}/);
  assert.doesNotMatch(res.body, /wacai-ledger-bg\.svg\?workspaceId=owner\) center/);
}

async function run() {
  await testSpecs();
  await testAdminListRouteRequiresOwner();
  await testGrantAndRevokeRoutesRequireOwner();
  await testListRoute();
  await testListRouteUsesEffectiveWorkspaceForOwnerSwitch();
  await testWardrobeManifestRoute();
  await testMoiraManifestRouteForwardsPluginRoute();
  await testCodexManifestRoute();
  await testCodexManifestRouteDeniesNonOwnerWithoutPluginGrant();
  await testCodexManifestRouteUsesEffectiveWorkspaceForOwnerSwitch();
  await testFinanceManifestRoute();
  await testWorkspaceBlockStopsRoute();
  await testPluginProxyRequiresWorkspaceAccessBeforeFetch();
  await testPluginProxyDeniesUnauthorizedWorkspacePlugin();
  await testCodexProxyIgnoresPluginQueryKeyForHomeAuth();
  await testPluginProxyForwardsOwnerOnlyActorContext();
  await testGrowthProxyAttachesServerSideWorkspaceBearerForWrites();
  await testHealthProxyAttachesServerSideWorkspaceBearerForReads();
  await testHealthProxyWriteRequiresExplicitWorkspace();
  await testHealthProxyOwnerWriteTargetsNonOwnerWorkspaceKey();
  await testHealthProxyNativeSyncPreservesHeaderWorkspace();
  await testPluginNotificationRoute();
  await testCodexProxyRewritesHtmlAndUsesUpstream();
  await testCodexProxyDoesNotInjectWorkspaceIdIntoJavascriptPathConstants();
  await testMoiraProxyHtmlAllowsDeclaredWasmEvalCsp();
  await testMoiraProxyInfersWorkspaceFromNamespacedSessionCookie();
  await testCodexProxyStreamsEventSource();
  await testCodexProxyPreservesLaunchCookieAndRedirect();
  await testFinanceProxyUsesConfiguredLocalUpstreamAndForwardsOrigin();
  await testFinanceProxyNamespacesSessionCookieAndRedirectForWorkspace();
  await testPluginProxyPreservesExternalOAuthRedirectLocation();
  await testMusicTidalOAuthCallbackBypassesWorkspaceGate();
  await testMusicTidalOAuthCallbackWithErrorBypassesWorkspaceGate();
  await testMusicTidalOAuthCallbackExceptionIsNarrow();
  await testFinanceProxyRewritesFinanceApiJsonUrls();
  await testNoteProxyRewritesAttachmentJsonUrls();
  await testFinanceProxyForwardsOnlyCurrentWorkspaceSessionCookie();
  await testFinanceProxyRewritesBrowserApiCallsWithWorkspaceId();
  await testFinanceProxyRejectsAmbiguousWorkspaceCookiesWithoutWorkspaceHint();
  await testWardrobeProxyRewritesSessionCookieScope();
  await testPluginLaunchProxyDoesNotForwardExistingSessionCookiesAndClearsStaleCookies();
  await testWardrobeProxyForwardsOnlyCurrentWorkspaceSessionCookie();
  await testWardrobeProxyUsesConfiguredLanUpstream();
  await testWardrobeProxyPreservesTemplateLiteralApiUrls();
  await testWardrobeProxyNormalizesUnsafeOriginForUpload();
  await testPluginProxyRewritesJsonImageUrls();
  await testPluginProxyDoesNotCorruptJsonProse();
  await testPluginProxyForwardsBinaryImages();
  await testWardrobeProxyNormalizesThumbnailQuerySuffix();
  await testWardrobeProxyInjectsUploadFileInputCompatibilityCss();
  await testPluginProxyPreservesQuotedCssUrlSyntax();
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
