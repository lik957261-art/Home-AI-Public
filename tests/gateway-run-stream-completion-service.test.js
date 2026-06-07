"use strict";

const assert = require("node:assert/strict");

const {
  createGatewayRunStreamCompletionService,
} = require("../adapters/gateway-run-stream-completion-service");

function controller(aborted = false) {
  return { signal: { aborted } };
}

function makeService(streams, closed = [], failures = [], cancellations = []) {
  return createGatewayRunStreamCompletionService({
    activeStreamForRun: (runId) => streams.get(runId),
    handleStreamClosedWithoutTerminal(...args) {
      closed.push(args);
      return { action: "closed_without_terminal", args };
    },
    markRunCancelled: (...args) => cancellations.push(args),
    markRunFailed: (...args) => failures.push(args),
  });
}

function testTerminalEventSeenDoesNothing() {
  const streams = new Map([["public_run", { realRunId: "real_response", terminalEventSeen: true }]]);
  const closed = [];
  const failures = [];
  const cancellations = [];
  const service = makeService(streams, closed, failures, cancellations);

  const result = service.handleStreamCompletion("public_run", "thread_1", "message_1", controller(false));

  assert.deepEqual(result, { action: "terminal_event_seen", runId: "real_response" });
  assert.deepEqual(closed, []);
  assert.deepEqual(failures, []);
  assert.deepEqual(cancellations, []);
}

function testNoTerminalDelegatesToCloseRecovery() {
  const streams = new Map([["public_run", { realRunId: "real_response", terminalEventSeen: false }]]);
  const closed = [];
  const failures = [];
  const cancellations = [];
  const service = makeService(streams, closed, failures, cancellations);

  const result = service.handleStreamCompletion("public_run", "thread_1", "message_1", controller(false));

  assert.deepEqual(result, {
    action: "closed_without_terminal",
    args: ["public_run", "thread_1", "message_1"],
  });
  assert.deepEqual(closed, [["public_run", "thread_1", "message_1"]]);
  assert.deepEqual(failures, []);
  assert.deepEqual(cancellations, []);
}

function testAbortedStreamWithFailureReasonMarksFailed() {
  const streams = new Map([[
    "public_run",
    { realRunId: "real_response", failureReason: "Gateway stream marked stale" },
  ]]);
  const closed = [];
  const failures = [];
  const cancellations = [];
  const service = makeService(streams, closed, failures, cancellations);

  const result = service.handleStreamCompletion("public_run", "thread_1", "message_1", controller(true));

  assert.equal(result.action, "failed_after_abort_reason");
  assert.equal(result.runId, "real_response");
  assert.equal(result.error.message, "Gateway stream marked stale");
  assert.equal(failures.length, 1);
  assert.equal(failures[0][0], "thread_1");
  assert.equal(failures[0][1], "message_1");
  assert.equal(failures[0][2], "real_response");
  assert.equal(failures[0][3].message, "Gateway stream marked stale");
  assert.deepEqual(closed, []);
  assert.deepEqual(cancellations, []);
}

function testAbortedStreamWithoutFailureReasonMarksCancelled() {
  const streams = new Map([["public_run", { realRunId: "real_response", failureReason: "" }]]);
  const closed = [];
  const failures = [];
  const cancellations = [];
  const service = makeService(streams, closed, failures, cancellations);

  const result = service.handleStreamCompletion("public_run", "thread_1", "message_1", controller(true));

  assert.deepEqual(result, { action: "cancelled_after_abort", runId: "real_response" });
  assert.deepEqual(closed, []);
  assert.deepEqual(failures, []);
  assert.deepEqual(cancellations, [["thread_1", "message_1", "real_response"]]);
}

function testMissingStreamFallsBackToCloseRecovery() {
  const closed = [];
  const service = makeService(new Map(), closed);

  const result = service.handleStreamCompletion("public_run", "thread_1", "message_1", controller(false));

  assert.deepEqual(result.args, ["public_run", "thread_1", "message_1"]);
  assert.deepEqual(closed, [["public_run", "thread_1", "message_1"]]);
}

testTerminalEventSeenDoesNothing();
testNoTerminalDelegatesToCloseRecovery();
testAbortedStreamWithFailureReasonMarksFailed();
testAbortedStreamWithoutFailureReasonMarksCancelled();
testMissingStreamFallsBackToCloseRecovery();

console.log("gateway run stream completion service tests passed");
