"use strict";

const assert = require("node:assert/strict");
const { createGatewayRunStreamingSaveService } = require("../adapters/gateway-run-streaming-save-service");

function testImmediateSaveWhenThrottleDisabled() {
  let saved = 0;
  const service = createGatewayRunStreamingSaveService({
    saveState: () => { saved += 1; },
    streamingSaveThrottleMs: 0,
  });

  service.scheduleStreamingStateSave();
  service.scheduleStreamingStateSave();

  assert.equal(saved, 2);
}

function testCoalescesPendingSaveAndUnrefsTimer() {
  let timerFn = null;
  let unrefCalled = false;
  let saved = 0;
  const service = createGatewayRunStreamingSaveService({
    saveState: () => { saved += 1; },
    setTimeout(fn, delay) {
      assert.equal(delay, 1200);
      timerFn = fn;
      return { unref() { unrefCalled = true; } };
    },
    streamingSaveThrottleMs: 1200,
  });

  service.scheduleStreamingStateSave();
  service.scheduleStreamingStateSave();

  assert.equal(saved, 0);
  assert.equal(unrefCalled, true);
  assert.equal(typeof timerFn, "function");
  timerFn();
  assert.equal(saved, 1);
  service.scheduleStreamingStateSave();
  assert.equal(saved, 1);
}

function testClearCancelsPendingSave() {
  let cleared = 0;
  let saved = 0;
  let timerFn = null;
  const service = createGatewayRunStreamingSaveService({
    clearTimeout(timer) {
      assert.equal(timer.id, "timer_1");
      cleared += 1;
      timerFn = null;
    },
    saveState: () => { saved += 1; },
    setTimeout(fn) {
      timerFn = fn;
      return { id: "timer_1" };
    },
    streamingSaveThrottleMs: 500,
  });

  service.scheduleStreamingStateSave();
  assert.equal(typeof timerFn, "function");
  service.clearStreamingSaveTimer();
  assert.equal(cleared, 1);
  assert.equal(timerFn, null);
  assert.equal(saved, 0);
  service.scheduleStreamingStateSave();
  assert.equal(typeof timerFn, "function");
}

function testTimerSaveErrorsAreLoggedAndDoNotKeepPending() {
  const errors = [];
  let timerFn = null;
  let attempts = 0;
  const service = createGatewayRunStreamingSaveService({
    logError: (value) => errors.push(String(value)),
    saveState() {
      attempts += 1;
      if (attempts === 1) throw new Error("disk busy");
    },
    setTimeout(fn) {
      timerFn = fn;
      return {};
    },
    streamingSaveThrottleMs: 10,
  });

  service.scheduleStreamingStateSave();
  timerFn();
  assert.equal(attempts, 1);
  assert.equal(errors.some((value) => value.includes("disk busy")), true);
  service.scheduleStreamingStateSave();
  timerFn();
  assert.equal(attempts, 2);
}

testImmediateSaveWhenThrottleDisabled();
testCoalescesPendingSaveAndUnrefsTimer();
testClearCancelsPendingSave();
testTimerSaveErrorsAreLoggedAndDoNotKeepPending();
