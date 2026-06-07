"use strict";

const assert = require("node:assert/strict");
const { createMobileRuntimeBootTraceService } = require("../adapters/mobile-runtime-boot-trace-service");

function testDisabledTraceDoesNotTouchFs() {
  const calls = [];
  const service = createMobileRuntimeBootTraceService({
    fs: {
      mkdirSync() { calls.push("mkdir"); },
      appendFileSync() { calls.push("append"); },
    },
    path: { dirname: () => "." },
    tracePath: "",
  });

  service.bootTrace("ready");
  assert.deepEqual(calls, []);
}

function testWritesTraceLine() {
  const calls = [];
  const service = createMobileRuntimeBootTraceService({
    fs: {
      mkdirSync(target, options) { calls.push(["mkdir", target, options]); },
      appendFileSync(target, text, encoding) { calls.push(["append", target, text, encoding]); },
    },
    path: { dirname: (value) => value.replace(/[/\\][^/\\]+$/, "") },
    process: { pid: 42 },
    nowIso: () => "2026-06-08T00:00:00.000Z",
    tracePath: "C:\\trace\\boot.log",
  });

  service.bootTrace("constants ready");
  assert.deepEqual(calls, [
    ["mkdir", "C:\\trace", { recursive: true }],
    ["append", "C:\\trace\\boot.log", "2026-06-08T00:00:00.000Z pid=42 constants ready\n", "utf8"],
  ]);
}

function testTraceErrorsAreBestEffort() {
  const service = createMobileRuntimeBootTraceService({
    fs: {
      mkdirSync() { throw new Error("denied"); },
      appendFileSync() { throw new Error("denied"); },
    },
    path: { dirname: () => "." },
    tracePath: "trace.log",
  });

  assert.doesNotThrow(() => service.bootTrace("ready"));
}

testDisabledTraceDoesNotTouchFs();
testWritesTraceLine();
testTraceErrorsAreBestEffort();
console.log("mobile runtime boot trace service tests passed");
