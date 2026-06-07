"use strict";

const assert = require("node:assert/strict");
const { createGatewayRunStartStreamHandoffService } = require("../adapters/gateway-run-start-stream-handoff-service");

function testStartStreamHandoffProjectsFinalStateAndStartsStream() {
  const calls = {
    assistantOptions: [],
    events: [],
    metadata: [],
    saved: 0,
    streams: [],
    wardrobeChecks: [],
  };
  const service = createGatewayRunStartStreamHandoffService({
    dedupe: (values) => [...new Set((values || []).filter(Boolean))],
    appendRunStartEvent: (...args) => calls.events.push(args),
    applyAssistantRunOptions: (...args) => calls.assistantOptions.push(args),
    applyWardrobeWorkflowGateMetadata: (...args) => calls.metadata.push(args),
    completeWardrobeWorkflowGateFailure: () => {
      throw new Error("gate failure should not run on an ok gate");
    },
    evaluateWardrobeGate: (...args) => {
      calls.wardrobeChecks.push(args);
      return { active: true, ok: true, stage: args[2] };
    },
    saveState: () => { calls.saved += 1; },
    streamResponse: (...args) => calls.streams.push(args),
  });
  const thread = { id: "thread_1" };
  const assistantMessage = { id: "assistant_1" };
  const userMessage = { id: "user_1", content: "match outfit" };
  const gatewayTarget = { name: "lowgw1", profile: "owner-low", source: "worker_pool" };
  const request = {
    body: { enabled_toolsets: ["file", "http"] },
    runPolicy: { allowed_toolsets: ["wardrobe", "file", "wardrobe"] },
  };
  const streamOptions = { gatewayUrl: "http://worker.gateway", apiTimeoutMs: 1000 };

  const result = service.startStreamHandoff({
    assistantMessage,
    effectiveRunOptions: { model: "gpt-test" },
    gatewayTarget,
    gatewayUrl: "http://worker.gateway",
    request,
    streamOptions,
    taskId: "web_test_1",
    thread,
    userMessage,
  });

  assert.deepEqual(result, {
    run_id: "web_test_1",
    status: "started",
    engine: "responses",
    gatewayUrl: "http://worker.gateway",
    gatewayName: "lowgw1",
    gatewayProfile: "owner-low",
    gatewaySource: "worker_pool",
  });
  assert.deepEqual(calls.wardrobeChecks, [[
    request,
    userMessage,
    "pre_stream",
    gatewayTarget,
    { appendInstructions: true },
  ]]);
  assert.deepEqual(calls.assistantOptions, [[assistantMessage, request, { model: "gpt-test" }]]);
  assert.deepEqual(calls.metadata, [[assistantMessage, { active: true, ok: true, stage: "pre_stream" }]]);
  assert.deepEqual(calls.events, [[thread, assistantMessage, "run.request_sent", "等待模型或工具返回"]]);
  assert.deepEqual(request.body.enabled_toolsets, ["wardrobe", "file"]);
  assert.equal(calls.saved, 1);
  assert.deepEqual(calls.streams, [[
    "web_test_1",
    "thread_1",
    "assistant_1",
    request.body,
    streamOptions,
  ]]);
}

function testStartStreamHandoffStopsBeforeStreamOnWardrobeGateFailure() {
  const calls = {
    events: [],
    saved: 0,
    streams: [],
  };
  const failureResult = { status: "failed", reason: "wardrobe gate failed" };
  const service = createGatewayRunStartStreamHandoffService({
    appendRunStartEvent: (...args) => calls.events.push(args),
    applyAssistantRunOptions: () => {},
    applyWardrobeWorkflowGateMetadata: () => {},
    completeWardrobeWorkflowGateFailure: (...args) => {
      assert.equal(args[0].id, "thread_1");
      assert.equal(args[1].id, "assistant_1");
      assert.equal(args[2], "web_test_1");
      assert.deepEqual(args[3], { active: true, ok: false, reason: "missing_rule" });
      return failureResult;
    },
    evaluateWardrobeGate: () => ({ active: true, ok: false, reason: "missing_rule" }),
    saveState: () => { calls.saved += 1; },
    streamResponse: (...args) => calls.streams.push(args),
  });

  const result = service.startStreamHandoff({
    assistantMessage: { id: "assistant_1" },
    gatewayTarget: { name: "lowgw1" },
    gatewayUrl: "http://worker.gateway",
    request: { body: { enabled_toolsets: ["wardrobe"] } },
    streamOptions: {},
    taskId: "web_test_1",
    thread: { id: "thread_1" },
    userMessage: { id: "user_1" },
  });

  assert.equal(result, failureResult);
  assert.deepEqual(calls.events, []);
  assert.equal(calls.saved, 0);
  assert.deepEqual(calls.streams, []);
}

testStartStreamHandoffProjectsFinalStateAndStartsStream();
testStartStreamHandoffStopsBeforeStreamOnWardrobeGateFailure();

console.log("gateway run-start stream handoff service tests passed");
