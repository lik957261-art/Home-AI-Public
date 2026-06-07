"use strict";

const assert = require("node:assert/strict");

const {
  createGatewayRunStreamFirstEventService,
} = require("../adapters/gateway-run-stream-first-event-service");

function makeService(streams, events = [], timers = [], cleared = []) {
  return createGatewayRunStreamFirstEventService({
    activeStreamForRun: (runId) => streams.get(runId),
    clearTimeout: (timer) => cleared.push(timer),
    configuredForStream: (stream, name, fallback) => (
      Object.prototype.hasOwnProperty.call(stream, name) ? stream[name] : fallback
    ),
    emitRunStreamEvent(publicRunId, eventName, preview) {
      events.push({ publicRunId, event: eventName, preview });
      return true;
    },
    nowMs: () => 61000,
    setTimeout(fn, ms) {
      const timer = { fn, ms, unrefCalled: false, unref() { this.unrefCalled = true; } };
      timers.push(timer);
      return timer;
    },
  });
}

function testSchedulesWarningAndReschedulesUntilFirstEventArrives() {
  const stream = {
    firstEventTimer: null,
    firstEventWarningCount: 0,
    firstGatewayEventAt: 0,
    failureReason: "",
    modelFirstByteWarningMs: 45000,
    startedAt: 1000,
  };
  const streams = new Map([["public_run", stream]]);
  const events = [];
  const timers = [];
  const cleared = [];
  const service = makeService(streams, events, timers, cleared);

  const timer = service.scheduleFirstEventWarning("public_run", stream);
  assert.equal(timer.ms, 45000);
  assert.equal(timer.unrefCalled, true);

  timer.fn();
  assert.equal(stream.firstEventWarningCount, 1);
  assert.equal(events[0].event, "run.model_first_byte_retrying");
  assert.equal(events[0].publicRunId, "public_run");
  assert.match(events[0].preview, /elapsed=60s/);
  assert.match(events[0].preview, /attempt=1/);
  assert.equal(timers.length, 2);
  assert.equal(cleared.length, 1);
}

function testSkipsWhenEventOrFailureAlreadyExists() {
  const events = [];
  const timers = [];
  const service = makeService(new Map(), events, timers);

  assert.equal(service.scheduleFirstEventWarning("run_a", { firstGatewayEventAt: 123 }), null);
  assert.equal(service.scheduleFirstEventWarning("run_b", { failureReason: "failed" }), null);
  assert.equal(service.scheduleFirstEventWarning("run_c", { modelFirstByteWarningMs: 0 }), null);
  assert.equal(timers.length, 0);
  assert.equal(events.length, 0);
}

function testTimerCallbackSkipsMissingOrAlreadyStartedStream() {
  const stream = {
    firstEventTimer: null,
    firstEventWarningCount: 0,
    firstGatewayEventAt: 0,
    failureReason: "",
    modelFirstByteWarningMs: 1000,
    startedAt: 1000,
  };
  const streams = new Map([["public_run", stream]]);
  const events = [];
  const timers = [];
  const service = makeService(streams, events, timers);

  service.scheduleFirstEventWarning("public_run", stream);
  stream.firstGatewayEventAt = 2000;
  timers[0].fn();

  assert.equal(events.length, 0);
  assert.equal(stream.firstEventWarningCount, 0);
}

function testClearFirstEventTimer() {
  const timer = { id: "timer" };
  const stream = { firstEventTimer: timer };
  const cleared = [];
  const service = makeService(new Map(), [], [], cleared);

  assert.equal(service.clearFirstEventTimer(stream), true);
  assert.deepEqual(cleared, [timer]);
  assert.equal(stream.firstEventTimer, null);
  assert.equal(service.clearFirstEventTimer(null), false);
}

testSchedulesWarningAndReschedulesUntilFirstEventArrives();
testSkipsWhenEventOrFailureAlreadyExists();
testTimerCallbackSkipsMissingOrAlreadyStartedStream();
testClearFirstEventTimer();

console.log("gateway run stream first event service tests passed");
