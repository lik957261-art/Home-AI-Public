"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { createMobileHttpRuntimeService } = require("../adapters/mobile-http-runtime-service");

function makeRequest(chunks = []) {
  const req = new EventEmitter();
  req.url = "/";
  req.headers = { host: "localhost" };
  req.writeChunks = () => {
    for (const chunk of chunks) req.emit("data", Buffer.from(chunk));
    req.emit("end");
  };
  return req;
}

function makeStaticRequest(url, headers = {}) {
  const req = makeRequest();
  req.url = url;
  req.method = "GET";
  req.headers = Object.assign({ host: "localhost" }, headers);
  return req;
}

async function readBody(service, req, maxBytes) {
  const promise = service.readBody(req, maxBytes);
  req.writeChunks();
  return promise;
}

function makeResponse() {
  const res = new EventEmitter();
  return Object.assign(res, {
    statusCode: 0,
    headers: {},
    body: Buffer.alloc(0),
    setHeader(name, value) {
      this.headers[name] = value;
    },
    hasHeader(name) {
      return Object.prototype.hasOwnProperty.call(this.headers, name);
    },
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = Object.assign({}, this.headers, headers);
    },
    end(body = "") {
      this.body = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ""));
      this.emit("finish");
    },
  });
}

function serveStatic(service, req, res) {
  return new Promise((resolve) => {
    res.once("finish", resolve);
    service.serveStatic(req, res);
  });
}

async function testReadBodyParsesJson() {
  const service = createMobileHttpRuntimeService({ clientVersionInfo: () => ({}) });
  const req = makeRequest(['{"text":"hello"}']);
  assert.deepEqual(await readBody(service, req, 100), { text: "hello" });
}

async function testReadBodyReportsTooLargeWithoutDestroyingSocket() {
  const service = createMobileHttpRuntimeService({ clientVersionInfo: () => ({}) });
  const req = makeRequest(['{"text":"', "1234567890", '"}']);
  req.destroy = () => {
    throw new Error("destroy should not be called for body limit errors");
  };

  await assert.rejects(
    () => readBody(service, req, 8),
    (err) => {
      assert.equal(err.status, 413);
      assert.equal(err.code, "request_body_too_large");
      assert.equal(err.message, "request body too large");
      return true;
    },
  );
}

async function testReadBodyReportsInvalidJson() {
  const service = createMobileHttpRuntimeService({ clientVersionInfo: () => ({}) });
  const req = makeRequest(["{bad json"]);

  await assert.rejects(
    () => readBody(service, req, 100),
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.code, "invalid_json_body");
      assert.equal(err.message, "invalid JSON body");
      return true;
    },
  );
}

function testSecurityHeadersAttachToJsonResponses() {
  const service = createMobileHttpRuntimeService({ clientVersionInfo: () => ({}) });
  const res = makeResponse();
  service.sendJson(res, 200, { ok: true });
  assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(res.headers["X-Frame-Options"], "SAMEORIGIN");
  assert.equal(res.headers["Referrer-Policy"], "no-referrer");
  assert.equal(res.headers["Strict-Transport-Security"], "max-age=15552000");
  assert.match(res.headers["Content-Security-Policy"], /default-src 'self'/);
  assert.match(res.headers["Content-Security-Policy"], /object-src 'none'/);
  assert.match(res.headers["Content-Security-Policy"], /media-src 'self' data: blob:/);
}

function testSecurityHeadersCanBeAttachedBeforeRouteWriteHead() {
  const service = createMobileHttpRuntimeService({ clientVersionInfo: () => ({}) });
  const req = makeRequest();
  const res = makeResponse();
  service.attachSecurityHeaders(req, res);
  res.writeHead(202, { "Content-Type": "text/event-stream" });
  assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(res.headers["Content-Type"], "text/event-stream");
  assert.match(res.headers["Content-Security-Policy"], /frame-src 'self' https:/);
}

async function testVersionedStaticAssetsUseImmutableCacheAndBrotli() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-mobile-http-"));
  const jsBody = "window.__hermesTest = '" + "x".repeat(2048) + "';\n";
  fs.writeFileSync(path.join(root, "app.js"), jsBody, "utf8");
  const service = createMobileHttpRuntimeService({
    clientVersionInfo: () => ({}),
    publicRoot: root,
    mimeByExt: { ".js": "text/javascript; charset=utf-8" },
  });
  const req = makeStaticRequest("/app.js?v=20260601-static-cache-test", { "accept-encoding": "br, gzip" });
  const res = makeResponse();

  await serveStatic(service, req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Cache-Control"], "public, max-age=31536000, immutable");
  assert.equal(res.headers["Content-Encoding"], "br");
  assert.equal(res.headers.Vary, "Accept-Encoding");
  assert.equal(zlib.brotliDecompressSync(res.body).toString("utf8"), jsBody);
}

async function testCompressedStaticAssetsAreCachedByFileVersion() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-mobile-http-"));
  const jsPath = path.join(root, "app.js");
  const firstBody = "window.__hermesCache = '" + "a".repeat(2048) + "';\n";
  fs.writeFileSync(jsPath, firstBody, "utf8");
  let brotliCalls = 0;
  const service = createMobileHttpRuntimeService({
    clientVersionInfo: () => ({}),
    publicRoot: root,
    mimeByExt: { ".js": "text/javascript; charset=utf-8" },
    zlib: {
      brotliCompressSync(data) {
        brotliCalls += 1;
        return zlib.brotliCompressSync(data);
      },
      gzipSync: zlib.gzipSync,
    },
  });

  for (let i = 0; i < 2; i += 1) {
    const res = makeResponse();
    await serveStatic(service, makeStaticRequest("/app.js?v=20260601-static-cache-test", { "accept-encoding": "br" }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(zlib.brotliDecompressSync(res.body).toString("utf8"), firstBody);
  }
  assert.equal(brotliCalls, 1);

  const nextBody = "window.__hermesCache = '" + "b".repeat(2048) + "';\n";
  fs.writeFileSync(jsPath, nextBody, "utf8");
  const changed = makeResponse();
  await serveStatic(service, makeStaticRequest("/app.js?v=20260601-static-cache-test2", { "accept-encoding": "br" }), changed);
  assert.equal(zlib.brotliDecompressSync(changed.body).toString("utf8"), nextBody);
  assert.equal(brotliCalls, 2);
}

async function testIndexAndServiceWorkerRemainNoCache() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-mobile-http-"));
  fs.writeFileSync(path.join(root, "index.html"), "<!doctype html>\n", "utf8");
  fs.writeFileSync(path.join(root, "service-worker.js"), "self.addEventListener('install',()=>{});\n", "utf8");
  const service = createMobileHttpRuntimeService({
    clientVersionInfo: () => ({}),
    publicRoot: root,
    mimeByExt: { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" },
  });

  for (const url of ["/", "/service-worker.js?v=20260601-static-cache-test"]) {
    const res = makeResponse();
    await serveStatic(service, makeStaticRequest(url, { "accept-encoding": "gzip" }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["Cache-Control"], "no-cache");
  }
}

async function testAppShellDefaultsToClassicWhenSwitchMissing() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-mobile-http-"));
  fs.writeFileSync(path.join(root, "index.html"), "<!doctype html><html><head></head><body>classic</body></html>\n", "utf8");
  const service = createMobileHttpRuntimeService({
    clientVersionInfo: () => ({}),
    publicRoot: root,
    shellModeConfigPath: path.join(root, "..", "missing-shell-mode.json"),
    mimeByExt: { ".html": "text/html; charset=utf-8" },
  });
  const res = makeResponse();

  await serveStatic(service, makeStaticRequest("/"), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["X-HomeAI-Shell-Mode"], "classic");
  assert.equal(res.headers["X-HomeAI-Shell-Mode-Source"], "config");
  assert.doesNotMatch(res.body.toString("utf8"), /data-home-ai-vite-production-bootstrap/);
}

async function testAppShellInjectsViteBootstrapWhenConfigured() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-mobile-http-"));
  const configPath = path.join(root, "home-ai-shell-mode.json");
  fs.writeFileSync(path.join(root, "index.html"), "<!doctype html><html lang=\"en\"><head></head><body>classic</body></html>\n", "utf8");
  fs.writeFileSync(configPath, JSON.stringify({ shellMode: "vite" }), "utf8");
  const service = createMobileHttpRuntimeService({
    clientVersionInfo: () => ({}),
    publicRoot: root,
    shellModeConfigPath: configPath,
    mimeByExt: { ".html": "text/html; charset=utf-8" },
  });
  const res = makeResponse();

  await serveStatic(service, makeStaticRequest("/"), res);

  const body = res.body.toString("utf8");
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["X-HomeAI-Shell-Mode"], "vite");
  assert.equal(res.headers["X-HomeAI-Shell-Mode-Source"], "config");
  assert.equal(res.headers["X-HomeAI-Vite-Bootstrap"], "/vite-islands/home-ai-production-bootstrap/home-ai-production-bootstrap.js");
  assert.match(body, /data-home-ai-shell-mode="vite"/);
  assert.match(body, /name="home-ai-shell-mode" content="vite"/);
  assert.match(body, /data-home-ai-vite-production-bootstrap="20260703-vite-production-cutover-v1"/);
}

async function testAppShellUsesFallbackConfigPath() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-mobile-http-"));
  const configPath = path.join(root, "home-ai-shell-mode.json");
  fs.writeFileSync(path.join(root, "index.html"), "<!doctype html><html><head></head><body>classic</body></html>\n", "utf8");
  fs.writeFileSync(configPath, JSON.stringify({ shellMode: "vite" }), "utf8");
  const service = createMobileHttpRuntimeService({
    clientVersionInfo: () => ({}),
    publicRoot: root,
    shellModeConfigPaths: [path.join(root, "missing-runtime-shell-mode.json"), configPath],
    mimeByExt: { ".html": "text/html; charset=utf-8" },
  });
  const res = makeResponse();

  await serveStatic(service, makeStaticRequest("/"), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["X-HomeAI-Shell-Mode"], "vite");
  assert.equal(res.headers["X-HomeAI-Shell-Mode-Source"], "config");
  assert.match(res.body.toString("utf8"), /data-home-ai-vite-production-bootstrap/);
}

async function testAppShellRequestOverrideCanRollbackToClassic() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-mobile-http-"));
  const configPath = path.join(root, "home-ai-shell-mode.json");
  fs.writeFileSync(path.join(root, "index.html"), "<!doctype html><html><head></head><body>classic</body></html>\n", "utf8");
  fs.writeFileSync(configPath, JSON.stringify({ shellMode: "vite" }), "utf8");
  const service = createMobileHttpRuntimeService({
    clientVersionInfo: () => ({}),
    publicRoot: root,
    shellModeConfigPath: configPath,
    mimeByExt: { ".html": "text/html; charset=utf-8" },
  });
  const res = makeResponse();

  await serveStatic(service, makeStaticRequest("/?homeAiShellMode=classic"), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["X-HomeAI-Shell-Mode"], "classic");
  assert.equal(res.headers["X-HomeAI-Shell-Mode-Source"], "request");
  assert.doesNotMatch(res.body.toString("utf8"), /data-home-ai-vite-production-bootstrap/);
}

async function testCompressedShellCacheDoesNotLeakBetweenModes() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-mobile-http-"));
  const configPath = path.join(root, "home-ai-shell-mode.json");
  fs.writeFileSync(
    path.join(root, "index.html"),
    `<!doctype html><html><head></head><body>${"classic".repeat(500)}</body></html>\n`,
    "utf8",
  );
  fs.writeFileSync(configPath, JSON.stringify({ shellMode: "classic" }), "utf8");
  const service = createMobileHttpRuntimeService({
    clientVersionInfo: () => ({}),
    publicRoot: root,
    shellModeConfigPath: configPath,
    mimeByExt: { ".html": "text/html; charset=utf-8" },
  });

  const classic = makeResponse();
  await serveStatic(service, makeStaticRequest("/", { "accept-encoding": "gzip" }), classic);
  assert.equal(classic.headers["X-HomeAI-Shell-Mode"], "classic");
  assert.doesNotMatch(zlib.gunzipSync(classic.body).toString("utf8"), /home-ai-production-bootstrap/);

  fs.writeFileSync(configPath, JSON.stringify({ shellMode: "vite" }), "utf8");
  const vite = makeResponse();
  await serveStatic(service, makeStaticRequest("/", { "accept-encoding": "gzip" }), vite);
  assert.equal(vite.headers["X-HomeAI-Shell-Mode"], "vite");
  assert.match(zlib.gunzipSync(vite.body).toString("utf8"), /home-ai-production-bootstrap/);
}

(async () => {
  await testReadBodyParsesJson();
  await testReadBodyReportsTooLargeWithoutDestroyingSocket();
  await testReadBodyReportsInvalidJson();
  testSecurityHeadersAttachToJsonResponses();
  testSecurityHeadersCanBeAttachedBeforeRouteWriteHead();
  await testVersionedStaticAssetsUseImmutableCacheAndBrotli();
  await testCompressedStaticAssetsAreCachedByFileVersion();
  await testIndexAndServiceWorkerRemainNoCache();
  await testAppShellDefaultsToClassicWhenSwitchMissing();
  await testAppShellInjectsViteBootstrapWhenConfigured();
  await testAppShellUsesFallbackConfigPath();
  await testAppShellRequestOverrideCanRollbackToClassic();
  await testCompressedShellCacheDoesNotLeakBetweenModes();
  console.log("mobile-http-runtime-service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
