"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
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

async function readBody(service, req, maxBytes) {
  const promise = service.readBody(req, maxBytes);
  req.writeChunks();
  return promise;
}

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
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
      this.body = body;
    },
  };
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

(async () => {
  await testReadBodyParsesJson();
  await testReadBodyReportsTooLargeWithoutDestroyingSocket();
  await testReadBodyReportsInvalidJson();
  testSecurityHeadersAttachToJsonResponses();
  testSecurityHeadersCanBeAttachedBeforeRouteWriteHead();
  console.log("mobile-http-runtime-service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
