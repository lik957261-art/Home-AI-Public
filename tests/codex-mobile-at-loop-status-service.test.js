"use strict";

const assert = require("node:assert/strict");
const {
  createCodexMobileAtLoopStatusService,
  normalizeCodexAtLoopBody,
} = require("../adapters/codex-mobile-at-loop-status-service");

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

async function testFetchesAndProjectsBoundedRuntimeStatus() {
  const calls = [];
  const service = createCodexMobileAtLoopStatusService({
    statusUrl: "http://127.0.0.1:8787/api/at-loop/status",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({
        ok: true,
        status: "ok",
        counts: { open: 2, waitingReturn: 1, blocked: 0, duplicateSuppressed: 1, verifiedClosed: 3 },
        items: [{
          loopId: "loop_1",
          target: "home-ai",
          status: "waiting_return",
          currentRole: "product_audit",
          blockedReason: "/Users/example/path",
        }],
      });
    },
    AbortController: null,
  });
  const result = await service.status();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:8787/api/at-loop/status");
  assert.deepEqual(calls[0].options.headers, { Accept: "application/json" });
  assert.equal(result.status, "ok");
  assert.equal(result.counts.open, 2);
  assert.equal(result.counts.waitingReturn, 1);
  assert.equal(result.counts.duplicateSuppressed, 1);
  assert.equal(result.counts.verifiedClosed, 3);
  assert.equal(result.items[0].loopId, "loop_1");
  assert.equal(result.items[0].blockedReason, "redacted");
  assert.equal(result.source.name, "codex-mobile-at-loop-status");
  assert.equal(result.policy.codexMobileRuntime, true);
  assert.doesNotMatch(JSON.stringify(result), /must-not-leak/);
}

async function testTransportFailureFailsClosedWithoutThrowing() {
  const service = createCodexMobileAtLoopStatusService({
    fetchImpl: async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:8787");
    },
    AbortController: null,
  });
  const result = await service.status();
  assert.equal(result.status, "blocked");
  assert.equal(result.counts.blocked, 1);
  assert.equal(result.items[0].blockedReason, "codex_at_loop_status_unreachable");
  assert.equal(result.items[0].nextRoute, "codex_mobile_runtime_repair");
  assert.doesNotMatch(JSON.stringify(result), /127\.0\.0\.1|ECONNREFUSED/);
}

function testNormalizerAcceptsAlternateCodexShapes() {
  const normalized = normalizeCodexAtLoopBody({
    ok: true,
    status: {
      status: "ok",
      summary: { running: 1, waiting_return: 2, duplicate_suppressed: 3, completed: 4 },
      loops: [{ id: "loop_alt", target_workspace_id: "finance", current_role: "requirements" }],
    },
  });
  assert.equal(normalized.status, "ok");
  assert.equal(normalized.counts.open, 1);
  assert.equal(normalized.counts.waitingReturn, 2);
  assert.equal(normalized.counts.duplicateSuppressed, 3);
  assert.equal(normalized.counts.verifiedClosed, 4);
  assert.equal(normalized.items[0].loopId, "loop_alt");
  assert.equal(normalized.items[0].target, "finance");
}

async function run() {
  await testFetchesAndProjectsBoundedRuntimeStatus();
  await testTransportFailureFailsClosedWithoutThrowing();
  testNormalizerAcceptsAlternateCodexShapes();
  console.log("codex mobile at-loop status service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
