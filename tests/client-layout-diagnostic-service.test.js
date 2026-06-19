"use strict";

const assert = require("node:assert/strict");
const { createClientLayoutDiagnosticService, sanitizeValue } = require("../adapters/client-layout-diagnostic-service");

function testSanitizeRedactsSecretsAndContent() {
  const safe = sanitizeValue({
    clientVersion: "v1",
    accessKey: "secret",
    cookie: "secret",
    message_text: "private message",
    viewport: { innerHeight: 812.4567 },
    css: { mobileBottomContentSafeArea: "3px" },
    userAgent: "ua",
  });
  assert.equal(safe.clientVersion, "v1");
  assert.equal(safe.accessKey, "[redacted]");
  assert.equal(safe.cookie, "[redacted]");
  assert.equal(safe.message_text, "[redacted]");
  assert.equal(safe.viewport.innerHeight, 812.457);
  assert.equal(safe.css.mobileBottomContentSafeArea, "3px");
  assert.equal(safe.userAgent, "ua");
}

function testAppendAndListJsonl() {
  const writes = new Map();
  const calls = [];
  const service = createClientLayoutDiagnosticService({
    fs: {
      mkdirSync(target, options) { calls.push(["mkdir", target, options]); },
      appendFileSync(target, text, encoding) {
        calls.push(["append", target, encoding]);
        writes.set(target, `${writes.get(target) || ""}${text}`);
      },
      readFileSync(target, encoding) {
        assert.equal(encoding, "utf8");
        return writes.get(target) || "";
      },
    },
    path: { dirname: (value) => value.replace(/[/\\][^/\\]+$/, "") },
    nowIso: () => "2026-06-09T00:00:00.000Z",
    logPath: "/tmp/home-ai/client-layout.jsonl",
  });

  const entry = service.append({ event: "app_show", token: "secret", viewport: { innerHeight: 700 } }, {
    remoteAddress: "127.0.0.1",
    userAgent: "iPhone",
    authenticated: true,
  });
  assert.equal(entry.at, "2026-06-09T00:00:00.000Z");
  assert.equal(entry.payload.token, "[redacted]");
  assert.equal(calls[0][0], "mkdir");
  assert.equal(calls[1][0], "append");

  const rows = service.list();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].payload.event, "app_show");
  assert.equal(rows[0].payload.viewport.innerHeight, 700);
  assert.equal(rows[0].authenticated, true);
}

function testAppendRotatesOversizedLog() {
  const writes = new Map([["/tmp/home-ai/client-layout.jsonl", "x".repeat(160 * 1024)]]);
  const calls = [];
  const service = createClientLayoutDiagnosticService({
    fs: {
      mkdirSync() {},
      statSync(target) {
        return { size: (writes.get(target) || "").length };
      },
      writeFileSync(target, text, encoding) {
        calls.push(["truncate", target, encoding]);
        writes.set(target, text);
      },
      appendFileSync(target, text, encoding) {
        calls.push(["append", target, encoding]);
        writes.set(target, `${writes.get(target) || ""}${text}`);
      },
      readFileSync(target, encoding) {
        assert.equal(encoding, "utf8");
        return writes.get(target) || "";
      },
    },
    path: { dirname: (value) => value.replace(/[/\\][^/\\]+$/, "") },
    nowIso: () => "2026-06-09T00:00:00.000Z",
    logPath: "/tmp/home-ai/client-layout.jsonl",
    maxBytes: 200,
  });

  service.append({ event: "after_rotate" });
  assert.equal(calls[0][0], "truncate");
  assert.equal(calls[1][0], "append");
  const rows = service.list();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].payload.event, "after_rotate");
}

function testDisabledLogPathDoesNotThrow() {
  const service = createClientLayoutDiagnosticService({
    fs: {
      mkdirSync() { throw new Error("should not write"); },
      appendFileSync() { throw new Error("should not write"); },
      readFileSync() { throw new Error("should not read"); },
    },
    path: { dirname: () => "." },
    logPath: "",
  });
  assert.doesNotThrow(() => service.append({ event: "disabled" }));
  assert.deepEqual(service.list(), []);
}

testSanitizeRedactsSecretsAndContent();
testAppendAndListJsonl();
testAppendRotatesOversizedLog();
testDisabledLogPathDoesNotThrow();
console.log("client layout diagnostic service tests passed");
