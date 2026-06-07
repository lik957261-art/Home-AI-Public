"use strict";

const assert = require("node:assert/strict");

const {
  createGatewayRunStreamFailureService,
} = require("../adapters/gateway-run-stream-failure-service");

function makeService(streams, events = [], failures = [], cancellations = []) {
  return createGatewayRunStreamFailureService({
    activeStreamForRun: (runId) => streams.get(runId),
    emitRunStreamEvent(publicRunId, eventName, preview, options = {}) {
      events.push({ publicRunId, event: eventName, preview, options });
      return true;
    },
    markRunCancelled: (...args) => cancellations.push(args),
    markRunFailed: (...args) => failures.push(args),
  });
}

function controller(aborted = false) {
  return { signal: { aborted } };
}

function testNormalErrorEmitsUserFacingFailureAndMarksFailed() {
  const streams = new Map([["public_run", { realRunId: "real_response" }]]);
  const events = [];
  const failures = [];
  const cancellations = [];
  const service = makeService(streams, events, failures, cancellations);
  const err = new Error("Invalid API key provided");

  const result = service.handleStreamFailure("public_run", "thread_1", "message_1", controller(false), err);

  assert.deepEqual(result, { action: "failed", runId: "real_response", error: err });
  assert.deepEqual(failures, [["thread_1", "message_1", "real_response", err]]);
  assert.deepEqual(cancellations, []);
  assert.equal(events[0].event, "run.stream_failed");
  assert.equal(events[0].publicRunId, "public_run");
  assert.equal(events[0].options.runId, "real_response");
  assert.equal(events[0].options.error, true);
  assert.match(events[0].preview, /API Key/);
}

function testAbortedStreamWithFailureReasonMarksFailedWithReason() {
  const streams = new Map([[
    "public_run",
    { realRunId: "real_response", failureReason: "Gateway run no longer reports live output" },
  ]]);
  const events = [];
  const failures = [];
  const cancellations = [];
  const service = makeService(streams, events, failures, cancellations);
  const err = new Error("aborted");

  const result = service.handleStreamFailure("public_run", "thread_1", "message_1", controller(true), err);

  assert.equal(result.action, "failed_after_abort_reason");
  assert.equal(result.runId, "real_response");
  assert.notEqual(result.error, err);
  assert.equal(result.error.message, "Gateway run no longer reports live output");
  assert.equal(failures.length, 1);
  assert.equal(failures[0][0], "thread_1");
  assert.equal(failures[0][1], "message_1");
  assert.equal(failures[0][2], "real_response");
  assert.equal(failures[0][3].message, "Gateway run no longer reports live output");
  assert.deepEqual(cancellations, []);
  assert.equal(events[0].options.runId, "real_response");
}

function testAbortedStreamWithoutFailureReasonMarksCancelled() {
  const streams = new Map([["public_run", { realRunId: "real_response", failureReason: "" }]]);
  const events = [];
  const failures = [];
  const cancellations = [];
  const service = makeService(streams, events, failures, cancellations);

  const result = service.handleStreamFailure(
    "public_run",
    "thread_1",
    "message_1",
    controller(true),
    new Error("aborted"),
  );

  assert.deepEqual(result, { action: "cancelled_after_abort", runId: "real_response" });
  assert.deepEqual(failures, []);
  assert.deepEqual(cancellations, [["thread_1", "message_1", "real_response"]]);
  assert.equal(events[0].event, "run.stream_failed");
  assert.equal(events[0].options.error, true);
}

function testMissingStreamFallsBackToPublicRunId() {
  const events = [];
  const failures = [];
  const cancellations = [];
  const service = makeService(new Map(), events, failures, cancellations);
  const err = new Error("upstream failed");

  const result = service.handleStreamFailure("public_run", "thread_1", "message_1", controller(false), err);

  assert.deepEqual(result, { action: "failed", runId: "public_run", error: err });
  assert.deepEqual(failures, [["thread_1", "message_1", "public_run", err]]);
  assert.deepEqual(cancellations, []);
  assert.equal(events[0].options.runId, "public_run");
}

testNormalErrorEmitsUserFacingFailureAndMarksFailed();
testAbortedStreamWithFailureReasonMarksFailedWithReason();
testAbortedStreamWithoutFailureReasonMarksCancelled();
testMissingStreamFallsBackToPublicRunId();

console.log("gateway run stream failure service tests passed");
