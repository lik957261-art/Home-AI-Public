"use strict";

const assert = require("node:assert/strict");

const {
  createGatewayRunStreamCloseRecoveryService,
} = require("../adapters/gateway-run-stream-close-recovery-service");

function makeService(streams, events = [], cancellations = []) {
  return createGatewayRunStreamCloseRecoveryService({
    activeStreamForRun: (runId) => streams.get(runId),
    emitRunStreamEvent(publicRunId, eventName, preview, options = {}) {
      events.push({ type: "stream", publicRunId, event: eventName, preview, options });
      return true;
    },
    markRunCancelled: (...args) => cancellations.push(args),
    onHermesRunEvent: (event) => events.push(event),
  });
}

function testCompletesFromReceivedModelOutput() {
  const streams = new Map([[
    "public_run",
    { realRunId: "real_response", firstModelOutputAt: 1234 },
  ]]);
  const events = [];
  const cancellations = [];
  const service = makeService(streams, events, cancellations);

  const result = service.handleStreamClosedWithoutTerminal("public_run", "thread_1", "message_1");

  assert.deepEqual(result, { action: "completed_from_stream_output", runId: "real_response" });
  assert.deepEqual(cancellations, []);
  const streamEvent = events.find((event) => event.type === "stream");
  assert.equal(streamEvent.event, "run.stream_closed_without_terminal");
  assert.equal(streamEvent.publicRunId, "public_run");
  assert.equal(streamEvent.options.runId, "real_response");
  assert.equal(streamEvent.options.error, undefined);
  const completion = events.find((event) => event.event === "response.completed");
  assert.equal(completion.run_id, "real_response");
  assert.equal(completion.hermes_mobile_stream_recovery, true);
  assert.equal(completion.hermes_mobile_synthetic, true);
}

function testCancelsWhenNoModelOutputArrived() {
  const streams = new Map([[
    "public_run",
    { realRunId: "real_response", firstModelOutputAt: 0 },
  ]]);
  const events = [];
  const cancellations = [];
  const service = makeService(streams, events, cancellations);

  const result = service.handleStreamClosedWithoutTerminal("public_run", "thread_1", "message_1");

  assert.deepEqual(result, { action: "cancelled_without_output", runId: "real_response" });
  assert.deepEqual(cancellations, [["thread_1", "message_1", "real_response"]]);
  const streamEvent = events.find((event) => event.type === "stream");
  assert.equal(streamEvent.event, "run.stream_closed_without_terminal");
  assert.equal(streamEvent.options.runId, "real_response");
  assert.equal(streamEvent.options.error, true);
  assert.equal(events.some((event) => event.event === "response.completed"), false);
}

function testMissingStreamFallsBackToPublicRunId() {
  const events = [];
  const cancellations = [];
  const service = makeService(new Map(), events, cancellations);

  const result = service.handleStreamClosedWithoutTerminal("public_run", "thread_1", "message_1");

  assert.deepEqual(result, { action: "cancelled_without_output", runId: "public_run" });
  assert.deepEqual(cancellations, [["thread_1", "message_1", "public_run"]]);
  assert.equal(events[0].options.runId, "public_run");
  assert.equal(events[0].options.error, true);
}

testCompletesFromReceivedModelOutput();
testCancelsWhenNoModelOutputArrived();
testMissingStreamFallsBackToPublicRunId();

console.log("gateway run stream close recovery service tests passed");
