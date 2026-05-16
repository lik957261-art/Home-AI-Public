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

(async () => {
  await testReadBodyParsesJson();
  await testReadBodyReportsTooLargeWithoutDestroyingSocket();
  await testReadBodyReportsInvalidJson();
  console.log("mobile-http-runtime-service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
