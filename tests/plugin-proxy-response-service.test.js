"use strict";

const assert = require("node:assert/strict");
const {
  binaryBodyBytesFromHeaders,
  codexReportedTotalMsFromJson,
  collectSafeBinaryResponseHeaders,
  streamBinaryResponseBody,
} = require("../adapters/plugin-proxy-response-service");

function response(headers = {}) {
  return {
    headers: {
      get(name) {
        const key = String(name || "").toLowerCase();
        return headers[key] || "";
      },
    },
  };
}

function testCollectSafeBinaryHeaders() {
  const headers = collectSafeBinaryResponseHeaders(response({
    "content-disposition": "inline; filename=\"image.png\"\r\nx-bad: 1",
    "content-length": "42",
    "cache-control": "private, max-age=60",
    "etag": "\"abc\"",
    "set-cookie": "secret=1",
    "content-encoding": "",
  }));
  assert.deepEqual(headers, {
    "Cache-Control": "private, max-age=60",
    "Content-Disposition": "inline; filename=\"image.png\" x-bad: 1",
    "Content-Length": "42",
    "ETag": "\"abc\"",
  });
}

function testContentLengthSkippedForEncodedBody() {
  const headers = collectSafeBinaryResponseHeaders(response({
    "content-length": "42",
    "content-encoding": "gzip",
  }));
  assert.equal(headers["Content-Length"], undefined);
  assert.equal(binaryBodyBytesFromHeaders(response({ "content-length": "42" })), 42);
}

async function testStreamBinaryResponseBodyUsesBodyStream() {
  const chunks = [Buffer.from([1, 2]), Buffer.from([3])];
  const writes = [];
  let ended = false;
  const upstream = {
    body: (async function* stream() {
      for (const chunk of chunks) yield chunk;
    })(),
    arrayBuffer() {
      throw new Error("arrayBuffer should not be used when a body stream is available");
    },
  };
  const res = {
    write(chunk) {
      writes.push(Buffer.from(chunk));
    },
    end() {
      ended = true;
    },
  };
  const bytes = await streamBinaryResponseBody(upstream, res);
  assert.equal(bytes, 3);
  assert.equal(ended, true);
  assert.deepEqual(Buffer.concat(writes), Buffer.from([1, 2, 3]));
}

function testCodexReportedTotalMs() {
  assert.equal(codexReportedTotalMsFromJson({
    thread: { mobileDiagnostics: { threadDetailTimings: { totalMs: 123.4 } } },
  }, "codex_thread_detail"), 123);
  assert.equal(codexReportedTotalMsFromJson({
    mobileDiagnostics: { threadListTimings: { totalMs: 88 } },
  }, "codex_thread_list"), 88);
  assert.equal(codexReportedTotalMsFromJson({ ok: true }, "codex_api"), 0);
}

async function run() {
  testCollectSafeBinaryHeaders();
  testContentLengthSkippedForEncodedBody();
  await testStreamBinaryResponseBodyUsesBodyStream();
  testCodexReportedTotalMs();
}

run().then(() => {
  console.log("plugin proxy response service tests passed");
}).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
