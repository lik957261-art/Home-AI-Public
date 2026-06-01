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

(async () => {
  await testReadBodyParsesJson();
  await testReadBodyReportsTooLargeWithoutDestroyingSocket();
  await testReadBodyReportsInvalidJson();
  testSecurityHeadersAttachToJsonResponses();
  testSecurityHeadersCanBeAttachedBeforeRouteWriteHead();
  await testVersionedStaticAssetsUseImmutableCacheAndBrotli();
  await testCompressedStaticAssetsAreCachedByFileVersion();
  await testIndexAndServiceWorkerRemainNoCache();
  console.log("mobile-http-runtime-service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
