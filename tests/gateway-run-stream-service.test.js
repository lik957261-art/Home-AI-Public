"use strict";

const assert = require("node:assert/strict");
const { createGatewayRunStreamService } = require("../adapters/gateway-run-stream-service");

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

function createGatewayPool(overrides = {}) {
  return {
    targetForGatewayUrl(gatewayUrl) {
      return { apiBase: gatewayUrl || "http://fallback.gateway", apiKey: "fallback-key", name: "fallback" };
    },
    runnerFor(target) {
      return {
        stopRun: overrides.stopRun || (async () => {}),
        checkRun: overrides.checkRun || (async () => ({})),
        streamResponses: overrides.streamResponses || (async () => ({})),
        target,
      };
    },
  };
}

function baseStream(controller = createController()) {
  return {
    threadId: "thread_1",
    messageId: "message_1",
    controller,
    gatewayUrl: "http://worker.gateway",
    gatewayApiKey: "worker-key",
    gatewayName: "lowgw1",
    gatewayProfile: "lowgw1",
    gatewaySource: "worker_pool",
    startedAt: 1000,
    lastEventAt: 1000,
    livenessMisses: 0,
    lastLivenessWarningAt: 0,
    failureReason: "",
  };
}

function testAliasRegistrationAndCleanup() {
  const activeStreams = new Map();
  const events = [];
  const stream = baseStream();
  const service = createGatewayRunStreamService({
    activeStreams,
    gatewayPool: createGatewayPool(),
    nowMs: () => 2000,
    onHermesRunEvent: (event) => events.push(event),
  });

  service.registerActiveStream("public_run", stream);
  const recorded = service.recordGatewayEvent("public_run", {
    event: "response.created",
    response: { id: "real_response" },
  });

  assert.equal(recorded.eventName, "response.created");
  assert.equal(stream.realRunId, "real_response");
  assert.equal(stream.lastEventAt, 2000);
  assert.equal(activeStreams.get("public_run"), stream);
  assert.equal(activeStreams.get("real_response"), stream);
  assert.equal(events.length, 1);
  assert.equal(events[0].run_id, "public_run");

  assert.equal(service.activeStreamCount(), 1);
  assert.equal(service.cleanupRunAliases("public_run"), 2);
  assert.equal(activeStreams.has("public_run"), false);
  assert.equal(activeStreams.has("real_response"), false);
}

async function testStopBehaviorUsesAbortThenGatewayStop() {
  const activeStreams = new Map();
  const controller = createController();
  const stream = baseStream(controller);
  const stopCalls = [];
  const service = createGatewayRunStreamService({
    activeStreams,
    gatewayUrlForRun: (runId) => `http://${runId}.gateway`,
    gatewayPool: createGatewayPool({
      stopRun: async (runId, options) => {
        stopCalls.push({ runId, options });
        if (runId === "gone_run") {
          const err = new Error("missing");
          err.status = 404;
          throw err;
        }
      },
    }),
  });

  service.registerActiveStream("public_run", stream);
  const stopped = await service.stopRunIds(["public_run", "public_run", "remote_run", "gone_run"]);

  assert.deepEqual(stopped, ["public_run", "remote_run", "gone_run"]);
  assert.equal(controller.abortCount, 1);
  assert.deepEqual(stopCalls.map((call) => call.runId), ["remote_run", "gone_run"]);
  assert.deepEqual(stopCalls[0].options, {
    gatewayUrl: "http://remote_run.gateway",
    apiKey: "fallback-key",
  });
}

async function testLiveness404WarnsAndContinuesByDefault() {
  const activeStreams = new Map();
  const controller = createController();
  const stream = Object.assign(baseStream(controller), {
    realRunId: "real_response",
    lastEventAt: 40000,
  });
  const warnings = [];
  const service = createGatewayRunStreamService({
    activeStreams,
    gatewayPool: createGatewayPool({
      checkRun: async () => {
        const err = new Error("not found");
        err.status = 404;
        throw err;
      },
    }),
    nowMs: () => 100000,
    runLivenessCheckAfterMs: 0,
    runLivenessStaleAfterMs: 0,
    apiTimeoutMs: 1500,
    abortSignal: { timeout: (ms) => ({ timeoutMs: ms }) },
    logger: { warn: (message) => warnings.push(message) },
  });
  service.registerActiveStream("public_run", stream);

  const decision = await service.checkActiveStreamLiveness("public_run");

  assert.equal(decision.action, "continue_after_404");
  assert.equal(decision.shouldAbort, false);
  assert.equal(stream.livenessMisses, 1);
  assert.equal(controller.signal.aborted, false);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /keeping the active stream open/);
}

async function testLivenessStaleAbortWhenOptedIn() {
  const activeStreams = new Map();
  const controller = createController();
  const stream = Object.assign(baseStream(controller), {
    realRunId: "real_response",
    lastEventAt: 0,
  });
  const service = createGatewayRunStreamService({
    activeStreams,
    gatewayPool: createGatewayPool({
      checkRun: async () => {
        const err = new Error("not found");
        err.status = 404;
        throw err;
      },
    }),
    nowMs: () => 100000,
    runLivenessCheckAfterMs: 0,
    runLivenessStaleAfterMs: 50000,
    logger: { warn: () => {} },
  });
  service.registerActiveStream("public_run", stream);

  const decision = await service.checkActiveStreamLiveness("public_run");

  assert.equal(decision.action, "abort_stale");
  assert.equal(decision.shouldAbort, true);
  assert.equal(controller.signal.aborted, true);
  assert.match(stream.failureReason, /no longer reports run real_response/);
}

async function testReadResponseEventsWrapsGatewayRunnerAndEventHook() {
  const activeStreams = new Map();
  const events = [];
  let receivedBody = null;
  let receivedOptions = null;
  const stream = baseStream();
  const service = createGatewayRunStreamService({
    activeStreams,
    gatewayPool: createGatewayPool({
      streamResponses: async (body, options) => {
        receivedBody = body;
        receivedOptions = options;
        options.onEvent({ event: "response.created", response: { id: "real_response" } });
        options.onEvent({ event: "message.delta", delta: "hello" });
        return { ok: true };
      },
    }),
    nowMs: () => 3000,
    onHermesRunEvent: (event) => events.push(event),
  });
  service.registerActiveStream("public_run", stream);

  await service.readResponseEvents("public_run", { input: "redacted" }, { aborted: false });

  assert.deepEqual(receivedBody, { input: "redacted" });
  assert.equal(receivedOptions.gatewayUrl, "http://worker.gateway");
  assert.equal(receivedOptions.apiKey, "worker-key");
  assert.equal(activeStreams.get("real_response"), stream);
  assert.equal(stream.realRunId, "real_response");
  assert.deepEqual(events.map((event) => event.event), ["response.created", "message.delta"]);
  assert.equal(events[0].run_id, "public_run");
  assert.equal(events[1].run_id, "public_run");
}

function testGatewayTargetLookup() {
  const activeStreams = new Map();
  const service = createGatewayRunStreamService({
    activeStreams,
    gatewayUrlForRun: () => "http://stored.gateway",
    gatewayPool: createGatewayPool(),
  });
  service.registerActiveStream("public_run", baseStream());

  assert.deepEqual(service.gatewayTargetForRun("public_run"), {
    apiBase: "http://worker.gateway",
    apiKey: "worker-key",
    name: "lowgw1",
    profile: "lowgw1",
    pooled: true,
    source: "worker_pool",
  });
  assert.deepEqual(service.gatewayTargetForRun("detached_run"), {
    apiBase: "http://stored.gateway",
    apiKey: "fallback-key",
    name: "fallback",
  });
}

(async () => {
  testAliasRegistrationAndCleanup();
  await testStopBehaviorUsesAbortThenGatewayStop();
  await testLiveness404WarnsAndContinuesByDefault();
  await testLivenessStaleAbortWhenOptedIn();
  await testReadResponseEventsWrapsGatewayRunnerAndEventHook();
  testGatewayTargetLookup();
  console.log("gateway-run-stream-service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
