"use strict";

const assert = require("node:assert/strict");
const { createGatewayRunStartStateService } = require("../adapters/gateway-run-start-state-service");

function makeHarness() {
  const calls = {
    broadcasts: [],
    removedRuns: [],
    saved: 0,
  };
  const service = createGatewayRunStartStateService({
    nowIso: () => "2026-05-15T01:02:03.000Z",
    addThreadActiveRun: (thread, runId) => {
      thread.activeRunIds = [...(thread.activeRunIds || []), runId];
      thread.activeRunId = runId;
    },
    removeThreadActiveRun: (thread, runId, idleStatus) => {
      calls.removedRuns.push({ threadId: thread.id, runId, idleStatus });
    },
    saveState: () => { calls.saved += 1; },
    broadcast: (payload) => calls.broadcasts.push(payload),
    compactMessage: (message) => ({ id: message.id, status: message.status, runId: message.runId }),
    threadSummary: (thread) => ({ id: thread.id, status: thread.status, activeRunIds: thread.activeRunIds || [] }),
  });
  return { calls, service };
}

function testApplyPreparingRunStateCreatesVisibleActiveRun() {
  const { service } = makeHarness();
  const thread = { id: "thread_1", status: "idle" };
  const assistant = { id: "assistant_1", status: "queued" };

  const result = service.applyPreparingRunState(thread, assistant, "run_1");

  assert.deepEqual(result, { startedAt: "2026-05-15T01:02:03.000Z" });
  assert.equal(assistant.runId, "run_1");
  assert.equal(assistant.taskId, "run_1");
  assert.equal(assistant.status, "running");
  assert.equal(assistant.startedAt, "2026-05-15T01:02:03.000Z");
  assert.equal(thread.status, "running");
  assert.equal(thread.activeRunId, "run_1");
  assert.deepEqual(thread.activeRunIds, ["run_1"]);
}

function testApplyStartedRunStateKeepsExistingStartedAtAndGatewayMetadata() {
  const { service } = makeHarness();
  const thread = { id: "thread_1", status: "running", activeRunIds: ["run_2"] };
  const assistant = {
    id: "assistant_1",
    status: "running",
    startedAt: "2026-05-15T00:00:00.000Z",
  };

  const result = service.applyStartedRunState(thread, assistant, "run_2", {
    apiBase: " http://gateway.worker ",
    name: "lowgw1",
    profile: "owner-low-1",
    source: "worker_pool",
  });

  assert.deepEqual(result, {
    gatewayUrl: "http://gateway.worker",
    startedAt: "2026-05-15T01:02:03.000Z",
  });
  assert.equal(assistant.startedAt, "2026-05-15T00:00:00.000Z");
  assert.equal(assistant.gatewayUrl, "http://gateway.worker");
  assert.equal(assistant.gatewayName, "lowgw1");
  assert.equal(assistant.gatewayProfile, "owner-low-1");
  assert.equal(assistant.gatewaySource, "worker_pool");
  assert.equal(thread.activeRunId, "run_2");
  assert.deepEqual(thread.activeRunIds, ["run_2"]);
}

function testBroadcastMessageUpdatedUsesCompactedPayload() {
  const { calls, service } = makeHarness();
  const thread = { id: "thread_1", status: "running", activeRunIds: ["run_1"] };
  const assistant = { id: "assistant_1", status: "running", runId: "run_1", private: "ignored" };

  service.broadcastMessageUpdated(thread, assistant);

  assert.deepEqual(calls.broadcasts[0], {
    type: "message.updated",
    threadId: "thread_1",
    message: { id: "assistant_1", status: "running", runId: "run_1" },
    thread: { id: "thread_1", status: "running", activeRunIds: ["run_1"] },
  });
}

function testMarkStartFailedUsesInjectedHooks() {
  const { calls, service } = makeHarness();
  const thread = { id: "thread_1", status: "running" };
  const assistant = { id: "assistant_1", runId: "run_failed_1", status: "running" };

  const result = service.markStartFailed(thread, assistant, new Error("gateway down"));

  assert.deepEqual(result, {
    status: "failed",
    runId: "run_failed_1",
    failedAt: "2026-05-15T01:02:03.000Z",
    error: "gateway down",
  });
  assert.equal(assistant.status, "failed");
  assert.equal(assistant.error, "gateway down");
  assert.deepEqual(calls.removedRuns, [{ threadId: "thread_1", runId: "run_failed_1", idleStatus: "failed" }]);
  assert.equal(calls.saved, 1);
  assert.equal(calls.broadcasts[0].type, "run.failed");
}

function testMarkStartFailedFormatsGatewayCapacityError() {
  const { service } = makeHarness();
  const thread = { id: "thread_1", status: "running" };
  const assistant = { id: "assistant_1", runId: "run_capacity_1", status: "running" };
  const err = new Error("Gateway worker queue timed out for workspace_capacity.");
  err.code = "gateway_elastic_queue_timeout";
  err.details = { reason: "workspace_capacity", workspaceId: "owner", queueDepth: 2 };

  const result = service.markStartFailed(thread, assistant, err);

  assert.match(result.error, /\u5f53\u524d\u5de5\u4f5c\u533a\u7684 AI \u6267\u884c\u901a\u9053\u5df2\u6ee1/);
  assert.equal(assistant.error, result.error);
  assert.doesNotMatch(assistant.error, /workspace_capacity/);
}

testApplyPreparingRunStateCreatesVisibleActiveRun();
testApplyStartedRunStateKeepsExistingStartedAtAndGatewayMetadata();
testBroadcastMessageUpdatedUsesCompactedPayload();
testMarkStartFailedUsesInjectedHooks();
testMarkStartFailedFormatsGatewayCapacityError();

console.log("gateway run-start state service tests passed");
