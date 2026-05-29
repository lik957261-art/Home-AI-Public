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

function makeRoutes(overrides = {}) {
  const calls = { access: [], manifest: [], notifications: [], broadcasts: [] };
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
      pluginManifestUrl(id) {
        return id === "codex-mobile" ? "http://127.0.0.1:8787/api/v1/hermes/plugin/manifest" : "http://nas/plugin.json";
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
  assert.equal(HERMES_PLUGIN_API_ROUTE_SPECS.length, 4);
  assert.equal(HERMES_PLUGIN_API_ROUTE_SPECS[0].path, "/api/hermes-plugins");
  assert.match(String(HERMES_PLUGIN_API_ROUTE_SPECS[1].pathRegex), /hermes-plugins/);
  assert.match(String(HERMES_PLUGIN_API_ROUTE_SPECS[2].pathRegex), /notifications/);
  assert.match(String(HERMES_PLUGIN_API_ROUTE_SPECS[3].pathRegex), /proxy/);
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
  assert.match(res.body, /href="\/api\/hermes-plugins\/codex-mobile\/proxy\/styles\.css"/);
  assert.match(res.body, /src="\/api\/hermes-plugins\/codex-mobile\/proxy\/app\.js"/);
  assert.equal(fetchCalls[0].options.headers["x-hermes-plugin-workspace-id"], "owner");
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
    "codex_mobile_plugin_session=session-value; Path=/api/hermes-plugins/codex-mobile/proxy; HttpOnly; SameSite=Lax",
  ]);
}

async function testWardrobeProxyRewritesSessionCookieScope() {
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "wardrobe", manifestUrl: "http://192.168.10.99:8765/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "wardrobe" });
      },
      pluginManifestUrl(id) {
        return id === "wardrobe" ? "http://192.168.10.99:8765/api/v1/hermes/plugin/manifest" : "";
      },
    },
    fetch(url, options = {}) {
      assert.equal(url, "http://192.168.10.99:8765/?embed=hermes&launch=wpl_once&workspaceId=owner");
      assert.equal(options.redirect, "manual");
      return Promise.resolve({
        ok: false,
        status: 302,
        headers: {
          get(name) {
            const lower = name.toLowerCase();
            if (lower === "content-type") return "text/plain";
            if (lower === "location") return "http://192.168.10.99:8765/?embed=hermes";
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
    makeUrl("/api/hermes-plugins/wardrobe/proxy/?embed=hermes&launch=wpl_once&workspaceId=owner"),
  );
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.Location, "/api/hermes-plugins/wardrobe/proxy/?embed=hermes");
  assert.deepEqual(res.headers["Set-Cookie"], [
    "wardrobe_session=session-value; Path=/api/hermes-plugins/wardrobe/proxy; HttpOnly; SameSite=None; Secure",
  ]);
}

async function testWardrobeProxyUsesConfiguredLanUpstream() {
  const fetchCalls = [];
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "wardrobe", manifestUrl: "http://192.168.10.99:8765/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "wardrobe" });
      },
      pluginManifestUrl(id) {
        return id === "wardrobe" ? "http://192.168.10.99:8765/api/v1/hermes/plugin/manifest" : "";
      },
    },
    fetch(url, options = {}) {
      fetchCalls.push({ url, options });
      assert.equal(url, "http://192.168.10.99:8765/?embed=hermes&launch=wpl_once&workspaceId=owner");
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
  assert.match(res.body, /href="\/api\/hermes-plugins\/wardrobe\/proxy\/styles\.css"/);
  assert.match(res.body, /src="\/api\/hermes-plugins\/wardrobe\/proxy\/app\.js"/);
  assert.equal(fetchCalls[0].options.headers["x-hermes-plugin-workspace-id"], "owner");
}

async function testPluginProxyRewritesJsonImageUrls() {
  const { routes } = makeRoutes({
    hermesPluginService: {
      list() {
        return [{ id: "wardrobe", manifestUrl: "http://192.168.10.99:8765/api/v1/hermes/plugin/manifest" }];
      },
      manifest() {
        return Promise.resolve({ ok: true, available: true, id: "wardrobe" });
      },
      pluginManifestUrl(id) {
        return id === "wardrobe" ? "http://192.168.10.99:8765/api/v1/hermes/plugin/manifest" : "";
      },
    },
    fetch(url, options = {}) {
      assert.equal(url, "http://192.168.10.99:8765/api/items/1?workspaceId=owner");
      assert.equal(options.headers["x-hermes-plugin-workspace-id"], "owner");
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : "" },
        text: () => Promise.resolve(JSON.stringify({
          imageUrl: "http://192.168.10.99:8765/uploads/item-1.jpg",
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
  assert.match(res.body, /"imageUrl":"\/api\/hermes-plugins\/wardrobe\/proxy\/uploads\/item-1\.jpg"/);
  assert.match(res.body, /"thumb":"\/api\/hermes-plugins\/wardrobe\/proxy\/media\/thumb-1\.webp"/);
  assert.match(res.body, /"icon":"\/api\/hermes-plugins\/wardrobe\/proxy\/static\/icon\.png"/);
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
          previewContentUrl: "/api/files/preview/content?threadId=thread-1&path=out.png",
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
  assert.equal(body.imageUrl, "/api/hermes-plugins/codex-mobile/proxy/uploads/item-1.jpg");
  assert.equal(body.uploadUrl, "/api/hermes-plugins/codex-mobile/proxy/api/uploads/file?path=input.jpg");
  assert.equal(body.previewContentUrl, "/api/hermes-plugins/codex-mobile/proxy/api/files/preview/content?threadId=thread-1&path=out.png");
  assert.equal(body.apiText, "/api/threads/thread-1");
  assert.equal(body.apiOriginText, "http://127.0.0.1:8787/api/threads/thread-1");
  assert.equal(body.nested.thumb, "/api/hermes-plugins/codex-mobile/proxy/media/thumb-1.webp");
  assert.equal(body.nested.upload, "/api/hermes-plugins/codex-mobile/proxy/api/uploads/file?path=input.jpg");
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

async function run() {
  await testSpecs();
  await testListRoute();
  await testWardrobeManifestRoute();
  await testCodexManifestRoute();
  await testCodexManifestRouteDeniesNonOwnerWithoutPluginGrant();
  await testWorkspaceBlockStopsRoute();
  await testPluginNotificationRoute();
  await testCodexProxyRewritesHtmlAndUsesUpstream();
  await testCodexProxyPreservesLaunchCookieAndRedirect();
  await testWardrobeProxyRewritesSessionCookieScope();
  await testWardrobeProxyUsesConfiguredLanUpstream();
  await testPluginProxyRewritesJsonImageUrls();
  await testPluginProxyDoesNotCorruptJsonProse();
  await testPluginProxyForwardsBinaryImages();
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
