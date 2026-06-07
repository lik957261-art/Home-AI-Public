"use strict";

const assert = require("node:assert/strict");
const {
  createGatewayRunTerminalStateService,
} = require("../adapters/gateway-run-terminal-state-service");

function makeHarness(overrides = {}) {
  const thread = {
    id: "thread_1",
    status: "running",
    activeRunId: "run_1",
    activeRunIds: ["run_1"],
    messages: [
      { id: "user_1", role: "user", status: "done", taskGroupId: "chat" },
      { id: "assistant_1", role: "assistant", status: "running", runId: "run_1", taskGroupId: "chat" },
    ],
  };
  const state = { threads: [thread] };
  const activeStreams = new Map([["run_1", { threadId: "thread_1", messageId: "assistant_1" }]]);
  const calls = {
    broadcasts: [],
    cleared: 0,
    compacted: [],
    enqueued: [],
    notified: [],
    removed: [],
    saved: 0,
    scheduled: [],
  };
  const service = createGatewayRunTerminalStateService(Object.assign({
    state: () => state,
    activeStreams,
    nowIso: () => "2026-06-08T01:02:03.000Z",
    clearStreamingSaveTimer: () => { calls.cleared += 1; },
    saveState: () => { calls.saved += 1; },
    broadcast: (payload) => calls.broadcasts.push(payload),
    compactMessage: (message) => ({ id: message.id, status: message.status, error: message.error || "" }),
    threadSummary: (item) => ({ id: item.id, status: item.status, activeRunIds: item.activeRunIds || [] }),
    enqueueExternalDeliveryForTerminalMessage: (item, message, status) => calls.enqueued.push({ threadId: item.id, messageId: message.id, status }),
    notifyTaskTerminal: (item, message, status) => calls.notified.push({ threadId: item.id, messageId: message.id, status }),
    removeThreadActiveRun: (item, runId, idleStatus) => {
      calls.removed.push({ threadId: item.id, runId, idleStatus });
      item.activeRunIds = (item.activeRunIds || []).filter((value) => value !== runId);
      item.activeRunId = item.activeRunIds[0] || null;
      item.status = item.activeRunIds.length ? "running" : idleStatus;
    },
    compactTerminalTopicContext: (item, message, reason) => calls.compacted.push({ threadId: item.id, messageId: message.id, reason }),
    scheduleNextQueuedRunForTaskGroup: (item, taskGroupId) => calls.scheduled.push({ threadId: item.id, taskGroupId }),
  }, overrides));
  return { activeStreams, calls, service, state, thread, message: thread.messages[1] };
}

function testMarkRunFailedMutatesTerminalStateAndNotifies() {
  const { calls, message, service, thread } = makeHarness();
  const err = new Error("Gateway worker queue timed out for workspace_capacity.");
  err.code = "gateway_elastic_queue_timeout";
  err.details = { reason: "workspace_capacity" };

  const result = service.markRunFailed(thread.id, message.id, "run_1", err);

  assert.equal(result.action, "failed");
  assert.match(result.error, /AI/);
  assert.equal(message.status, "failed");
  assert.equal(message.failedAt, "2026-06-08T01:02:03.000Z");
  assert.equal(thread.status, "failed");
  assert.deepEqual(calls.cleared, 1);
  assert.deepEqual(calls.enqueued, [{ threadId: "thread_1", messageId: "assistant_1", status: "failed" }]);
  assert.deepEqual(calls.notified, [{ threadId: "thread_1", messageId: "assistant_1", status: "failed" }]);
  assert.deepEqual(calls.compacted, [{ threadId: "thread_1", messageId: "assistant_1", reason: "run-failed" }]);
  assert.deepEqual(calls.removed, [{ threadId: "thread_1", runId: "run_1", idleStatus: "failed" }]);
  assert.equal(calls.saved, 1);
  assert.equal(calls.broadcasts[0].type, "run.failed");
  assert.deepEqual(calls.scheduled, [{ threadId: "thread_1", taskGroupId: "chat" }]);
}

function testMarkRunCancelledMutatesTerminalStateWithoutNotification() {
  const { calls, message, service, thread } = makeHarness();

  const result = service.markRunCancelled(thread.id, message.id, "run_1");

  assert.deepEqual(result, { action: "cancelled" });
  assert.equal(message.status, "cancelled");
  assert.equal(message.cancelledAt, "2026-06-08T01:02:03.000Z");
  assert.equal(thread.status, "idle");
  assert.deepEqual(calls.enqueued, []);
  assert.deepEqual(calls.notified, []);
  assert.deepEqual(calls.compacted, [{ threadId: "thread_1", messageId: "assistant_1", reason: "run-cancelled" }]);
  assert.equal(calls.broadcasts[0].type, "run.cancelled");
  assert.deepEqual(calls.scheduled, [{ threadId: "thread_1", taskGroupId: "chat" }]);
}

function testTerminalStatusAndMissingTargetsAreIgnored() {
  const { message, service, thread } = makeHarness();

  assert.deepEqual(service.markRunFailed("missing", message.id, "run_1", new Error("x")), { action: "missing_thread" });
  assert.deepEqual(service.markRunCancelled(thread.id, "missing", "run_1"), { action: "missing_message" });
  message.status = "done";
  assert.deepEqual(service.markRunFailed(thread.id, message.id, "run_1", new Error("x")), { action: "terminal_ignored" });
}

function testReconcileDetachedActiveRunsFailsDetachedAndSchedulesQueued() {
  const { activeStreams, calls, service, state, thread } = makeHarness();
  activeStreams.clear();
  thread.messages.push({ id: "user_2", role: "user", status: "done", taskGroupId: "chat" });
  thread.messages.push({ id: "assistant_2", role: "assistant", status: "queued", runId: "", taskGroupId: "chat" });

  const changed = service.reconcileDetachedActiveRuns("detached");

  assert.equal(changed, true);
  assert.equal(state.threads[0].messages[1].status, "failed");
  assert.equal(state.threads[0].messages[1].error, "detached");
  assert.deepEqual(calls.enqueued, [{ threadId: "thread_1", messageId: "assistant_1", status: "failed" }]);
  assert.equal(calls.saved, 1);
  assert.deepEqual(calls.scheduled, [{ threadId: "thread_1", taskGroupId: "chat" }]);
}

testMarkRunFailedMutatesTerminalStateAndNotifies();
testMarkRunCancelledMutatesTerminalStateWithoutNotification();
testTerminalStatusAndMissingTargetsAreIgnored();
testReconcileDetachedActiveRunsFailsDetachedAndSchedulesQueued();

console.log("gateway run terminal state service tests passed");
