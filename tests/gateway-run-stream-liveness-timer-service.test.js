"use strict";

const assert = require("node:assert/strict");

const {
  createGatewayRunStreamLivenessTimerService,
  readIntervalMs,
} = require("../adapters/gateway-run-stream-liveness-timer-service");

function testReadIntervalMsNormalizesValues() {
  assert.equal(readIntervalMs(() => 1000), 1000);
  assert.equal(readIntervalMs(() => "2500"), 2500);
  assert.equal(readIntervalMs(() => -1), 0);
  assert.equal(readIntervalMs(() => "bad"), 0);
}

function testSchedulesTimerWithMinimumIntervalAndUnref() {
  const calls = [];
  const timers = [];
  const stream = {};
  const service = createGatewayRunStreamLivenessTimerService({
    checkActiveStreamLiveness: async (runId) => calls.push(runId),
    configured: () => 100,
    setInterval(fn, ms) {
      const timer = { fn, ms, unrefCalled: false, unref() { this.unrefCalled = true; } };
      timers.push(timer);
      return timer;
    },
  });

  const timer = service.scheduleLivenessTimer("public_run", stream);

  assert.equal(timer.ms, 5000);
  assert.equal(timer.unrefCalled, true);
  assert.equal(stream.livenessTimer, timer);
  timers[0].fn();
  return Promise.resolve().then(() => {
    assert.deepEqual(calls, ["public_run"]);
  });
}

function testSkipsWhenIntervalDisabledOrStreamMissing() {
  const timers = [];
  const service = createGatewayRunStreamLivenessTimerService({
    configured: () => 0,
    setInterval: () => {
      timers.push("unexpected");
      return {};
    },
  });

  assert.equal(service.scheduleLivenessTimer("public_run", {}), null);
  assert.equal(service.scheduleLivenessTimer("public_run", null), null);
  assert.deepEqual(timers, []);
}

function testLogsRejectedLivenessCheck() {
  const errors = [];
  const timers = [];
  const service = createGatewayRunStreamLivenessTimerService({
    checkActiveStreamLiveness: async () => {
      throw new Error("liveness failed");
    },
    configured: () => 6000,
    logger: { error: (message) => errors.push(message) },
    setInterval(fn, ms) {
      const timer = { fn, ms };
      timers.push(timer);
      return timer;
    },
  });

  service.scheduleLivenessTimer("public_run", {});
  timers[0].fn();
  return Promise.resolve().then(() => {
    assert.equal(errors.length, 1);
    assert.match(errors[0], /liveness failed/);
  });
}

function testClearLivenessTimer() {
  const cleared = [];
  const timer = { id: "timer" };
  const stream = { livenessTimer: timer };
  const service = createGatewayRunStreamLivenessTimerService({
    clearInterval: (value) => cleared.push(value),
  });

  assert.equal(service.clearLivenessTimer(stream), true);
  assert.deepEqual(cleared, [timer]);
  assert.equal(stream.livenessTimer, null);
  assert.equal(service.clearLivenessTimer(stream), false);
  assert.equal(service.clearLivenessTimer(null), false);
}

(async () => {
  testReadIntervalMsNormalizesValues();
  await testSchedulesTimerWithMinimumIntervalAndUnref();
  testSkipsWhenIntervalDisabledOrStreamMissing();
  await testLogsRejectedLivenessCheck();
  testClearLivenessTimer();
  console.log("gateway run stream liveness timer service tests passed");
})();
