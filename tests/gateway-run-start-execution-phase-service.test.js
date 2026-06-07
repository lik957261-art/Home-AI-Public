"use strict";

const assert = require("node:assert/strict");
const { createGatewayRunStartExecutionPhaseService } = require("../adapters/gateway-run-start-execution-phase-service");

async function testExecutionPhaseRunsPreflightAndStreamHandoff() {
  const calls = {
    preflights: [],
    streamHandoffs: [],
    streamOptions: [],
  };
  const thread = { id: "thread_1" };
  const assistantMessage = { id: "assistant_1" };
  const userMessage = { id: "user_1", content: "run task" };
  const request = { body: { input: "hello" } };
  const updatedRequest = { body: { input: "hello", enabled_toolsets: ["file"] } };
  const effectiveRunOptions = { model: "gpt-test" };
  const updatedRunOptions = { model: "gpt-test", modelFirstToolsetSelection: { selectedToolsets: ["file"] } };
  const gatewayTarget = { name: "lowgw1", profile: "owner-low" };
  const streamOptions = { gatewayUrl: "http://worker.gateway", apiTimeoutMs: 1000 };
  const startResult = { status: "started", run_id: "web_test_1" };
  const service = createGatewayRunStartExecutionPhaseService({
    applyModelFirstToolsetPreflight: async (args) => {
      calls.preflights.push(args);
      return { effectiveRunOptions: updatedRunOptions, request: updatedRequest };
    },
    startStreamHandoff: (args) => {
      calls.streamHandoffs.push(args);
      return startResult;
    },
    streamOptionsForGatewayTarget: (...args) => {
      calls.streamOptions.push(args);
      return streamOptions;
    },
  });

  const result = await service.runExecutionPhase({
    assistantMessage,
    effectiveRunOptions,
    gatewayTarget,
    gatewayUrl: "http://worker.gateway",
    request,
    runOptions: { model: "gpt-original", searchSource: "web" },
    taskId: "web_test_1",
    thread,
    userMessage,
  });

  assert.equal(result, startResult);
  assert.deepEqual(calls.streamOptions, [[gatewayTarget, { model: "gpt-original", searchSource: "web" }, { gatewayUrl: "http://worker.gateway" }]]);
  assert.deepEqual(calls.preflights, [{
    assistantMessage,
    effectiveRunOptions,
    gatewayTarget,
    gatewayUrl: "http://worker.gateway",
    request,
    taskId: "web_test_1",
    thread,
    userMessage,
  }]);
  assert.deepEqual(calls.streamHandoffs, [{
    assistantMessage,
    effectiveRunOptions: updatedRunOptions,
    gatewayTarget,
    gatewayUrl: "http://worker.gateway",
    request: updatedRequest,
    streamOptions,
    taskId: "web_test_1",
    thread,
    userMessage,
  }]);
}

async function testExecutionPhaseStopsOnPreflightTerminalResult() {
  const calls = { streamHandoffs: 0, streamOptions: 0 };
  const terminalResult = { status: "needs_elevation", run_id: "web_test_1" };
  const service = createGatewayRunStartExecutionPhaseService({
    applyModelFirstToolsetPreflight: async () => ({ terminalResult }),
    startStreamHandoff: () => { calls.streamHandoffs += 1; },
    streamOptionsForGatewayTarget: () => {
      calls.streamOptions += 1;
      return { gatewayUrl: "http://worker.gateway" };
    },
  });

  const result = await service.runExecutionPhase({
    assistantMessage: { id: "assistant_1" },
    effectiveRunOptions: {},
    gatewayTarget: { name: "lowgw1" },
    gatewayUrl: "http://worker.gateway",
    request: { body: {} },
    runOptions: {},
    taskId: "web_test_1",
    thread: { id: "thread_1" },
    userMessage: { id: "user_1" },
  });

  assert.equal(result, terminalResult);
  assert.equal(calls.streamOptions, 1);
  assert.equal(calls.streamHandoffs, 0);
}

async function testExecutionPhaseFallsBackToOriginalRequest() {
  const request = { body: { input: "hello" } };
  const calls = { streamHandoffs: [] };
  const service = createGatewayRunStartExecutionPhaseService({
    applyModelFirstToolsetPreflight: async () => ({}),
    startStreamHandoff: (args) => {
      calls.streamHandoffs.push(args);
      return { status: "started" };
    },
    streamOptionsForGatewayTarget: () => ({ gatewayUrl: "http://worker.gateway" }),
  });

  await service.runExecutionPhase({
    assistantMessage: { id: "assistant_1" },
    effectiveRunOptions: { model: "gpt-test" },
    gatewayTarget: { name: "lowgw1" },
    gatewayUrl: "http://worker.gateway",
    request,
    taskId: "web_test_1",
    thread: { id: "thread_1" },
    userMessage: { id: "user_1" },
  });

  assert.equal(calls.streamHandoffs[0].request, request);
}

Promise.resolve()
  .then(testExecutionPhaseRunsPreflightAndStreamHandoff)
  .then(testExecutionPhaseStopsOnPreflightTerminalResult)
  .then(testExecutionPhaseFallsBackToOriginalRequest)
  .then(() => {
    console.log("gateway run-start execution phase service tests passed");
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
