"use strict";

const assert = require("node:assert/strict");
const {
  createGatewayRunLifecycleService,
  extractGatewayRunIds,
  isTerminalGatewayRunEvent,
  livenessDecisionAfterCheck,
  nextQueuedRunPairForTaskGroup,
  normalizeGatewayRunEventName,
  queuedNextRunDecision,
  terminalStatusForGatewayRunEvent,
  uniqueRunIds,
  withActiveRunAdded,
  withActiveRunRemoved,
  withActiveRunReplaced,
} = require("../adapters/gateway-run-lifecycle-service");

function testEventNameNormalizationAndTerminalStatus() {
  assert.equal(normalizeGatewayRunEventName({ type: " RESPONSE_OUTPUT_TEXT_DELTA " }), "response.output_text.delta");
  assert.equal(normalizeGatewayRunEventName({ type: " RESPONSE_OUTPUT_TEXT_DONE " }), "response.output_text.done");
  assert.equal(normalizeGatewayRunEventName("run.canceled"), "run.cancelled");
  assert.equal(terminalStatusForGatewayRunEvent({ event: "response.completed" }), "done");
  assert.equal(terminalStatusForGatewayRunEvent({ event: "run.failed" }), "failed");
  assert.equal(terminalStatusForGatewayRunEvent({ event: "response.incomplete" }), "cancelled");
  assert.equal(isTerminalGatewayRunEvent({ event: "message.delta" }), false);
}

function testRunIdExtractionPrefersVisibleResponseIdExceptCreated() {
  assert.deepEqual(extractGatewayRunIds({
    event: "response.created",
    run_id: "public_run",
    response: { id: "real_response" },
  }), {
    eventName: "response.created",
    originalRunId: "public_run",
    responseRunId: "real_response",
    runId: "public_run",
  });

  assert.deepEqual(extractGatewayRunIds({
    event: "response.completed",
    runId: "public_run",
    response: { id: "real_response" },
  }), {
    eventName: "response.completed",
    originalRunId: "public_run",
    responseRunId: "real_response",
    runId: "real_response",
  });
}

function testActiveRunIdsArePureAndDeduped() {
  const original = { id: "thread", status: "queued", activeRunIds: ["a", "a"], activeRunId: "a" };
  const added = withActiveRunAdded(original, "b");
  assert.deepEqual(added.activeRunIds, ["a", "b"]);
  assert.equal(added.activeRunId, "b");
  assert.deepEqual(original.activeRunIds, ["a", "a"]);

  const replaced = withActiveRunReplaced(added, "b", "real_b");
  assert.deepEqual(replaced.activeRunIds, ["a", "real_b"]);
  assert.equal(replaced.activeRunId, "real_b");

  const removed = withActiveRunRemoved(replaced, "real_b", "idle");
  assert.deepEqual(removed.activeRunIds, ["a"]);
  assert.equal(removed.activeRunId, "a");
  assert.equal(removed.status, "running");

  const empty = withActiveRunRemoved(removed, "a", "failed");
  assert.deepEqual(empty.activeRunIds, []);
  assert.equal(empty.activeRunId, null);
  assert.equal(empty.status, "failed");
  assert.deepEqual(uniqueRunIds(["", "x", "x", " y "]), ["x", "y"]);
}

function sampleThread() {
  return {
    id: "thread",
    singleWindow: true,
    status: "queued",
    activeRunIds: [],
    messages: [
      { id: "u1", role: "user", taskGroupId: "g1", content: "redacted" },
      { id: "a1", role: "assistant", taskGroupId: "g1", status: "queued", runId: "" },
      { id: "u2", role: "user", taskGroupId: "g2", content: "redacted" },
      { id: "a2", role: "assistant", taskGroupId: "g2", status: "running", runId: "run_g2" },
    ],
  };
}

function testQueuedNextRunDecision() {
  const thread = sampleThread();
  const pair = nextQueuedRunPairForTaskGroup(thread, "g1");
  assert.equal(pair.user.id, "u1");
  assert.equal(pair.assistant.id, "a1");
  assert.equal(queuedNextRunDecision(thread, "g1").action, "start");
  assert.equal(queuedNextRunDecision(thread, "g2").action, "wait");
  assert.deepEqual(queuedNextRunDecision(Object.assign({}, thread, { singleWindow: false }), "g1"), {
    action: "none",
    reason: "not_single_window",
  });
  assert.equal(queuedNextRunDecision({ singleWindow: true, status: "queued", activeRunIds: [], messages: [] }, "g1").action, "set_idle");
}

function testLiveness404AllowsContinueByDefault() {
  const decision = livenessDecisionAfterCheck({
    status: 404,
    nowMs: 100000,
    lastEventAtMs: 40000,
    staleAfterMs: 0,
    livenessMisses: 2,
    lastWarningAtMs: 0,
  });
  assert.equal(decision.action, "continue_after_404");
  assert.equal(decision.shouldAbort, false);
  assert.equal(decision.shouldWarn, true);
  assert.equal(decision.livenessMisses, 3);

  assert.equal(livenessDecisionAfterCheck({
    status: 404,
    nowMs: 100000,
    lastEventAtMs: 40000,
    staleAfterMs: 50000,
  }).action, "abort_stale");
  assert.equal(livenessDecisionAfterCheck({ ok: true, livenessMisses: 4 }).livenessMisses, 0);
  assert.equal(livenessDecisionAfterCheck({ status: 502, livenessMisses: 4 }).action, "ignore_error");
}

function testFactoryExportsPureService() {
  const service = createGatewayRunLifecycleService();
  assert.equal(service.normalizeGatewayRunEventName("RUN_COMPLETED"), "run.completed");
  assert.equal(service.terminalStatusForGatewayRunEvent("RUN_COMPLETED"), "done");
}

testEventNameNormalizationAndTerminalStatus();
testRunIdExtractionPrefersVisibleResponseIdExceptCreated();
testActiveRunIdsArePureAndDeduped();
testQueuedNextRunDecision();
testLiveness404AllowsContinueByDefault();
testFactoryExportsPureService();

console.log("gateway-run-lifecycle-service tests passed");
