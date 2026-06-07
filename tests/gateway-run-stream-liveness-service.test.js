"use strict";

const assert = require("node:assert/strict");
const {
  createGatewayRunStreamLivenessService,
  createTimeoutSignal,
} = require("../adapters/gateway-run-stream-liveness-service");

function createController() {
  const signal = { aborted: false };
  return {
    signal,
    abortCount: 0,
    abort() {
      this.abortCount += 1;
      signal.aborted = true;
    },
  };
}

function baseStream(controller = createController()) {
  return {
    controller,
    gatewayUrl: "http://worker.gateway",
    gatewayApiKey: "worker-key",
    realRunId: "real_response",
    startedAt: 1000,
    lastEventAt: 1000,
    livenessMisses: 0,
    lastLivenessWarningAt: 0,
    failureReason: "",
  };
}

function createGatewayPool(overrides = {}) {
  return {
    runnerFor(target) {
      return {
        checkRun: overrides.checkRun || (async () => ({})),
        target,
      };
    },
  };
}

function serviceForStream(stream, overrides = {}) {
  const events = overrides.events || [];
  const warnings = overrides.warnings || [];
  const aborted = overrides.aborted || [];
  return createGatewayRunStreamLivenessService({
    activeStreamForRun: () => stream,
    abortActiveStreamAsFailed: (...args) => {
      aborted.push(args);
      stream.failureReason = args[1] || "";
      stream.controller?.abort?.();
      return true;
    },
    abortSignal: overrides.abortSignal,
    configuredForStream: (_stream, name, fallback = 0) => (
      Object.prototype.hasOwnProperty.call(stream || {}, name) ? stream[name] : fallback
    ),
    emitRunStreamEvent: (...args) => {
      events.push(args);
      return true;
    },
    gatewayPool: overrides.gatewayPool || createGatewayPool(overrides),
    gatewayTargetForRun: () => ({ apiBase: "http://worker.gateway", apiKey: "worker-key" }),
    livenessDecisionAfterCheck: overrides.livenessDecisionAfterCheck,
    logger: { warn: (message) => warnings.push(message) },
    nowMs: overrides.nowMs || (() => 100000),
  });
}

async function testMissingStream() {
  const service = createGatewayRunStreamLivenessService();
  assert.deepEqual(await service.checkActiveStreamLiveness("missing"), { action: "missing" });
}

async function testStartTimeoutAbortsBeforeRealRun() {
  const controller = createController();
  const stream = Object.assign(baseStream(controller), {
    realRunId: "",
    startedAt: 1000,
    runStartTimeoutMs: 5000,
  });
  const events = [];
  const aborted = [];
  const service = serviceForStream(stream, { events, aborted, nowMs: () => 10000 });

  const decision = await service.checkActiveStreamLiveness("public_run");

  assert.deepEqual(decision, { action: "abort_start_timeout" });
  assert.equal(controller.abortCount, 1);
  assert.equal(events[0][1], "run.gateway_start_timeout");
  assert.match(events[0][2], /timeout=5s/);
  assert.match(aborted[0][1], /did not create a run within 5 seconds/);
}

async function testRecentEventSkipsGatewayCheck() {
  const stream = Object.assign(baseStream(), {
    lastEventAt: 90000,
    runLivenessCheckAfterMs: 30000,
  });
  let checked = false;
  const service = serviceForStream(stream, {
    checkRun: async () => {
      checked = true;
    },
  });

  assert.deepEqual(await service.checkActiveStreamLiveness("public_run"), { action: "recent_event" });
  assert.equal(checked, false);
}

async function testAliveResetsMissesAndUsesTimeoutSignal() {
  const stream = Object.assign(baseStream(), {
    apiTimeoutMs: 1500,
    livenessMisses: 2,
    lastLivenessWarningAt: 123,
  });
  let receivedOptions = null;
  const service = serviceForStream(stream, {
    abortSignal: { timeout: (ms) => ({ timeoutMs: ms }) },
    checkRun: async (_runId, options) => {
      receivedOptions = options;
    },
  });

  const decision = await service.checkActiveStreamLiveness("public_run");

  assert.deepEqual(decision, { action: "alive" });
  assert.equal(stream.livenessMisses, 0);
  assert.equal(stream.lastLivenessWarningAt, 0);
  assert.deepEqual(receivedOptions, {
    gatewayUrl: "http://worker.gateway",
    apiKey: "worker-key",
    signal: { timeoutMs: 1500 },
  });
}

async function test404WarningContinues() {
  const stream = Object.assign(baseStream(), { lastEventAt: 40000 });
  const events = [];
  const warnings = [];
  const service = serviceForStream(stream, {
    events,
    warnings,
    checkRun: async () => {
      const err = new Error("not found");
      err.status = 404;
      throw err;
    },
  });

  const decision = await service.checkActiveStreamLiveness("public_run");

  assert.equal(decision.action, "continue_after_404");
  assert.equal(stream.livenessMisses, 1);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /keeping the active stream open/);
  assert.equal(events[0][1], "run.liveness_warning");
}

async function testStaleAbort() {
  const controller = createController();
  const stream = Object.assign(baseStream(controller), {
    lastEventAt: 0,
    runLivenessStaleAfterMs: 50000,
  });
  const events = [];
  const aborted = [];
  const service = serviceForStream(stream, {
    events,
    aborted,
    checkRun: async () => {
      const err = new Error("not found");
      err.status = 404;
      throw err;
    },
  });

  const decision = await service.checkActiveStreamLiveness("public_run");

  assert.equal(decision.action, "abort_stale");
  assert.equal(controller.signal.aborted, true);
  assert.equal(events[0][1], "run.liveness_stale");
  assert.match(aborted[0][1], /no longer reports run real_response/);
}

function testTimeoutSignal() {
  assert.equal(createTimeoutSignal(null, 5000), undefined);
  assert.deepEqual(createTimeoutSignal({ timeout: (ms) => ({ ms }) }, 10), { ms: 1000 });
  assert.deepEqual(createTimeoutSignal({ timeout: (ms) => ({ ms }) }, 1500), { ms: 1500 });
}

(async () => {
  await testMissingStream();
  await testStartTimeoutAbortsBeforeRealRun();
  await testRecentEventSkipsGatewayCheck();
  await testAliveResetsMissesAndUsesTimeoutSignal();
  await test404WarningContinues();
  await testStaleAbort();
  testTimeoutSignal();
  console.log("gateway run stream liveness service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
