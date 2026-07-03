"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  VITE_DEV_BACKEND_PROXY_VERSION,
  createViteDevBackendProxyRequest,
  resolveViteDevBackendProxyConfig,
  sanitizeProxyRequestHeaders,
  viteDevBackendProxyBlockedRouteApplies,
  viteDevBackendProxyRouteApplies,
} = require("../adapters/vite-dev-backend-proxy-service");

const repoRoot = path.resolve(__dirname, "..");

function request(url, method = "GET", headers = {}) {
  return { url, method, headers };
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

test("dev backend proxy stays opt-in and validates backend base", () => {
  const off = resolveViteDevBackendProxyConfig({});
  assert.equal(off.enabled, false);
  assert.equal(off.requested, false);

  const blocked = resolveViteDevBackendProxyConfig({
    HOMEAI_VITE_DEV_BACKEND_PROXY: "1",
  });
  assert.equal(blocked.requested, true);
  assert.equal(blocked.enabled, false);
  assert.equal(blocked.blockedReason, "backend_base_url_invalid_or_missing");
  assert.equal(viteDevBackendProxyBlockedRouteApplies(request("/api/events"), blocked), true);

  const invalid = resolveViteDevBackendProxyConfig({
    HOMEAI_VITE_DEV_BACKEND_PROXY: "1",
    HOMEAI_VITE_DEV_BACKEND_BASE: "file:///tmp/private",
  });
  assert.equal(invalid.enabled, false);
  assert.equal(invalid.blockedReason, "backend_base_url_invalid_or_missing");

  const enabled = resolveViteDevBackendProxyConfig({
    HOMEAI_VITE_DEV_BACKEND_PROXY: "true",
    HOMEAI_VITE_DEV_BACKEND_BASE: "http://127.0.0.1:3100/",
  });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.baseUrl, "http://127.0.0.1:3100");
});

test("dev backend proxy applies only to bounded chat runtime parity routes", () => {
  const config = resolveViteDevBackendProxyConfig({
    HOMEAI_VITE_DEV_BACKEND_PROXY: "1",
    HOMEAI_VITE_DEV_BACKEND_BASE: "http://127.0.0.1:3100",
  });
  assert.equal(viteDevBackendProxyRouteApplies(request("/api/events?clientVersion=vite"), config), true);
  assert.equal(viteDevBackendProxyRouteApplies(request("/api/threads/thread_1"), config), true);
  assert.equal(viteDevBackendProxyRouteApplies(request("/api/threads/thread_1/messages", "POST"), config), true);
  assert.equal(viteDevBackendProxyRouteApplies(request("/api/threads/thread_1/interrupt", "POST"), config), true);
  assert.equal(viteDevBackendProxyRouteApplies(request("/api/threads/thread_1/uploads", "POST"), config), true);
  assert.equal(viteDevBackendProxyRouteApplies(request("/api/threads/thread_1/server-file-attachments", "POST"), config), true);
  assert.equal(viteDevBackendProxyRouteApplies(request("/api/owner/system-console"), config), false);
  assert.equal(viteDevBackendProxyRouteApplies(request("/api/threads/thread_1/messages", "GET"), config), false);
  assert.equal(viteDevBackendProxyRouteApplies(request("/api/threads/thread_1/delete", "POST"), config), false);
});

test("dev backend proxy builds target request without leaking hop-by-hop headers", () => {
  const config = resolveViteDevBackendProxyConfig({
    HOMEAI_VITE_DEV_BACKEND_PROXY: "1",
    HOMEAI_VITE_DEV_BACKEND_BASE: "http://127.0.0.1:3100/base",
  });
  const proxyRequest = createViteDevBackendProxyRequest(request(
    "/api/threads/thread_1/messages?clientVersion=vite",
    "POST",
    {
      host: "127.0.0.1:49369",
      connection: "keep-alive",
      "x-hermes-web-key": "owner-key",
      "x-hermes-web-client-version": "vite-dev",
      "content-type": "application/json",
    },
  ), config);

  assert.equal(proxyRequest.ok, true);
  assert.equal(proxyRequest.version, VITE_DEV_BACKEND_PROXY_VERSION);
  assert.equal(proxyRequest.routeKind, "composer_send");
  assert.equal(proxyRequest.method, "POST");
  assert.equal(proxyRequest.targetUrl, "http://127.0.0.1:3100/api/threads/thread_1/messages?clientVersion=vite");
  assert.equal(proxyRequest.headers.host, "127.0.0.1:3100");
  assert.equal(proxyRequest.headers.connection, undefined);
  assert.equal(proxyRequest.headers["x-hermes-web-key"], "owner-key");
  assert.equal(proxyRequest.headers["x-hermes-web-client-version"], "vite-dev");
});

test("dev backend proxy header sanitizer strips hop-by-hop headers", () => {
  const headers = sanitizeProxyRequestHeaders({
    Host: "vite.local",
    Connection: "keep-alive",
    TE: "trailers",
    "X-Test": "1",
  }, "https://example.test:9443");
  assert.deepEqual(headers, {
    "x-test": "1",
    host: "example.test:9443",
  });
});

test("vite config registers the real backend proxy before mocks", () => {
  const source = fs.readFileSync(path.join(repoRoot, "vite.config.js"), "utf8");
  assert.match(source, /devBackendProxyRoutes/);
  assert.match(source, /HOMEAI_VITE_DEV_BACKEND_PROXY|vite-dev-backend-proxy-service/);
  const proxyIndex = source.indexOf("devBackendProxyRoutes()");
  const eventMockIndex = source.indexOf("devPreviewEventStreamMockRoutes()");
  const apiMockIndex = source.indexOf("devPreviewApiMockRoutes()");
  assert.ok(proxyIndex >= 0);
  assert.ok(eventMockIndex > proxyIndex);
  assert.ok(apiMockIndex > proxyIndex);
});

if (process.exitCode) process.exit(process.exitCode);
