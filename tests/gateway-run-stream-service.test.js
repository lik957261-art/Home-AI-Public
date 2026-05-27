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
  assert.deepEqual(events.map((event) => event.event), ["run.model_stream_started", "response.created"]);
  assert.equal(events[0].run_id, "real_response");
  assert.equal(events[1].run_id, "public_run");

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
    timeoutMs: 5000,
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

async function testStreamSpecificLivenessOverrides() {
  const activeStreams = new Map();
  const controller = createController();
  const stream = Object.assign(baseStream(controller), {
    realRunId: "real_response",
    lastEventAt: 0,
    runLivenessCheckAfterMs: 30 * 60 * 1000,
    runLivenessStaleAfterMs: 0,
  });
  const service = createGatewayRunStreamService({
    activeStreams,
    gatewayPool: createGatewayPool({
      checkRun: async () => {
        throw new Error("should not check before stream override delay");
      },
    }),
    nowMs: () => 100000,
    runLivenessCheckAfterMs: 0,
    runLivenessStaleAfterMs: 50000,
  });
  service.registerActiveStream("public_run", stream);

  const decision = await service.checkActiveStreamLiveness("public_run");

  assert.equal(decision.action, "recent_event");
  assert.equal(controller.signal.aborted, false);
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
  assert.deepEqual(events.map((event) => event.event), [
    "run.model_stream_started",
    "response.created",
    "run.model_output_started",
    "message.delta",
  ]);
  assert.equal(events[0].run_id, "real_response");
  assert.equal(events[1].run_id, "public_run");
  assert.equal(events[2].run_id, "real_response");
  assert.equal(events[3].run_id, "real_response");
}

function testNoFirstEventWarningIsVisibleButDoesNotResetGatewayEventTime() {
  const activeStreams = new Map();
  const events = [];
  const timers = [];
  const service = createGatewayRunStreamService({
    activeStreams,
    gatewayPool: createGatewayPool({
      streamResponses: async () => new Promise(() => {}),
    }),
    nowMs: (() => {
      let value = 1000;
      return () => value;
    })(),
    onHermesRunEvent: (event) => events.push(event),
    setTimeout: (fn, ms) => {
      timers.push({ fn, ms });
      return { unref() {} };
    },
    clearTimeout: () => {},
    modelFirstByteWarningMs: 45000,
  });

  const stream = service.streamResponse("public_run", "thread_1", "message_1", { input: "hello" }, {});
  assert.equal(timers[0].ms, 45000);
  assert.equal(stream.lastEventAt, 1000);
  timers[0].fn();

  assert.equal(stream.lastEventAt, 1000);
  assert.equal(events.at(-1).event, "run.model_first_byte_retrying");
  assert.equal(events.at(-1).run_id, "public_run");
  assert.match(events.at(-1).preview, /attempt=1/);
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

function testWebSearchBudgetAbortsAfterConfiguredLimit() {
  const activeStreams = new Map();
  const controller = createController();
  const stream = baseStream(controller);
  const events = [];
  const service = createGatewayRunStreamService({
    activeStreams,
    gatewayPool: createGatewayPool(),
    nowMs: () => 2000,
    onHermesRunEvent: (event) => events.push(event),
    webSearchMaxCalls: 2,
  });
  service.registerActiveStream("public_run", stream);
  service.recordGatewayEvent("public_run", { event: "response.created", response: { id: "real_response" } });

  const first = service.recordGatewayEvent("public_run", {
    event: "response.output_item.added",
    response_id: "real_response",
    item: { type: "function_call", name: "mobile_web_search", call_id: "search_1" },
  });
  const second = service.recordGatewayEvent("public_run", {
    event: "response.output_item.added",
    response_id: "real_response",
    item: { type: "function_call", name: "mobile_web_search", call_id: "search_2" },
  });
  const third = service.recordGatewayEvent("public_run", {
    event: "response.output_item.added",
    response_id: "real_response",
    item: { type: "function_call", name: "mobile_web_search", call_id: "search_3" },
  });

  assert.equal(first.toolBudget.action, "counted");
  assert.equal(second.toolBudget.action, "counted");
  assert.equal(third.toolBudget.action, "aborted");
  assert.equal(third.toolBudget.count, 3);
  assert.equal(third.toolBudget.limit, 2);
  assert.equal(controller.abortCount, 1);
  assert.match(stream.failureReason, /mobile_web_search exceeded the configured Web search limit \(3\/2\)/);
  assert.equal(stream.toolBudgetCounters.webSearch, 3);
  const budgetEvent = events.find((event) => event.event === "run.tool_budget_exceeded");
  assert.ok(budgetEvent);
  assert.equal(budgetEvent.run_id, "real_response");
  assert.equal(budgetEvent.error, true);
  assert.match(budgetEvent.preview, /tool=mobile_web_search/);
  assert.match(budgetEvent.preview, /count=3/);
  assert.match(budgetEvent.preview, /limit=2/);
}

function testHostedWebSearchBudgetUsesOutputItemType() {
  const activeStreams = new Map();
  const controller = createController();
  const stream = baseStream(controller);
  const service = createGatewayRunStreamService({
    activeStreams,
    gatewayPool: createGatewayPool(),
    webSearchMaxCalls: 1,
  });
  service.registerActiveStream("public_run", stream);

  const first = service.recordGatewayEvent("public_run", {
    event: "response.output_item.added",
    item: { type: "web_search_call", id: "hosted_search_1" },
  });
  const second = service.recordGatewayEvent("public_run", {
    event: "response.output_item.added",
    item: { type: "web_search_call", id: "hosted_search_2" },
  });

  assert.equal(first.toolBudget.action, "counted");
  assert.equal(first.toolBudget.tool, "web_search_call");
  assert.equal(second.toolBudget.action, "aborted");
  assert.equal(controller.abortCount, 1);
}

(async () => {
  testAliasRegistrationAndCleanup();
  await testStopBehaviorUsesAbortThenGatewayStop();
  await testLiveness404WarnsAndContinuesByDefault();
  await testLivenessStaleAbortWhenOptedIn();
  await testStreamSpecificLivenessOverrides();
  await testReadResponseEventsWrapsGatewayRunnerAndEventHook();
  testNoFirstEventWarningIsVisibleButDoesNotResetGatewayEventTime();
  testGatewayTargetLookup();
  testWebSearchBudgetAbortsAfterConfiguredLimit();
  testHostedWebSearchBudgetUsesOutputItemType();
  console.log("gateway-run-stream-service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
