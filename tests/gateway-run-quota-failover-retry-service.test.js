"use strict";

const assert = require("node:assert/strict");
const {
  createGatewayRunQuotaFailoverRetryService,
  gatewayOutputLooksLikeOpenAiCodexUsageLimit,
} = require("../adapters/gateway-run-quota-failover-retry-service");

function makeHarness(overrides = {}) {
  const calls = {
    broadcasts: [],
    failed: [],
    restarted: [],
    rotations: [],
    saved: 0,
    starts: [],
  };
  const thread = {
    id: "thread-1",
    activeRunIds: ["run-1"],
    events: [],
    messages: [
      { id: "user-1", role: "user", content: "retry this" },
      { id: "assistant-1", role: "assistant", status: "running", runId: "run-1", content: "partial", runOptions: { provider: "openai-codex" } },
    ],
    status: "running",
  };
  const service = createGatewayRunQuotaFailoverRetryService(Object.assign({
    addThreadEvent: (targetThread, event) => targetThread.events.push(event),
    broadcast: (payload) => calls.broadcasts.push(payload),
    compactMessage: (message) => ({ id: message.id, status: message.status, content: message.content }),
    maxQuotaFailoverRetries: 2,
    notifyTaskTerminal: (_thread, _message, status) => calls.failed.push(status),
    nowIso: () => "2026-06-27T08:00:00.000Z",
    nowMs: () => 1000,
    removeThreadActiveRun: (targetThread, runId, status) => {
      targetThread.activeRunIds = targetThread.activeRunIds.filter((item) => item !== runId);
      targetThread.status = status;
    },
    restartRunningGatewayWorkers: async (input) => {
      calls.restarted.push(input);
      return { ok: true, restartedCount: 2 };
    },
    rotateOpenAiCodexCredentialPoolAfterUsageLimit: (input) => {
      calls.rotations.push(input);
      return {
        rotated: true,
        previousProfileId: "homeai-previous",
        activeProfileId: "homeai-default",
        summary: { pool_size: 2 },
      };
    },
    saveState: () => { calls.saved += 1; },
    setImmediate: (fn) => fn(),
    startQuotaFailoverRun: async (...args) => calls.starts.push(args),
    threadSummary: (targetThread) => ({ id: targetThread.id }),
  }, overrides));
  return { calls, message: thread.messages[1], service, thread };
}

async function testQuotaDetectorIsNarrow() {
  assert.equal(gatewayOutputLooksLikeOpenAiCodexUsageLimit("API call failed after 3 retries: HTTP 429: The usage limit has been reached"), true);
  assert.equal(gatewayOutputLooksLikeOpenAiCodexUsageLimit("API call failed after 3 retries: HTTP 500: server error"), false);
  assert.equal(gatewayOutputLooksLikeOpenAiCodexUsageLimit("Gateway stream aborted before completion"), false);
}

async function testRetryRotatesHomeAiPoolRestartsGatewaysAndRequeuesRun() {
  const { calls, message, service, thread } = makeHarness();
  const ok = service.startQuotaFailoverRetry(thread, message, {
    output: "API call failed after 3 retries: HTTP 429: The usage limit has been reached",
    previousRunId: "run-1",
  });

  assert.equal(ok, true);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(message.status, "queued");
  assert.equal(message.content, "");
  assert.equal(message.openAiCodexQuotaFailoverAttempts, 1);
  assert.deepEqual(thread.activeRunIds, []);
  assert.equal(thread.status, "idle");
  assert.equal(thread.events.at(-1).event, "run.openai_codex_quota_failover_retrying");
  assert.equal(calls.rotations.length, 1);
  assert.deepEqual(calls.restarted, [{ reason: "openai_codex_credential_pool_rotated" }]);
  assert.equal(calls.starts.length, 1);
  assert.equal(calls.starts[0][0], thread);
  assert.equal(calls.starts[0][1].id, "user-1");
  assert.equal(calls.starts[0][2], message);
  assert.equal(calls.starts[0][3].openAiCodexQuotaFailoverRetry.activeProfileId, "homeai-default");
}

async function testNoAlternateLeavesOriginalFailurePathAvailable() {
  const { message, service, thread } = makeHarness({
    rotateOpenAiCodexCredentialPoolAfterUsageLimit: () => ({
      rotated: false,
      reason: "openai_codex_credential_pool_no_alternate",
    }),
  });
  const ok = service.startQuotaFailoverRetry(thread, message, {
    output: "API call failed after 3 retries: HTTP 429: The usage limit has been reached",
    previousRunId: "run-1",
  });

  assert.equal(ok, false);
  assert.equal(message.status, "running");
  assert.equal(message.content, "partial");
}

async function run() {
  await testQuotaDetectorIsNarrow();
  await testRetryRotatesHomeAiPoolRestartsGatewaysAndRequeuesRun();
  await testNoAlternateLeavesOriginalFailurePathAvailable();
  console.log("gateway run quota failover retry service tests passed");
}

run().catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
