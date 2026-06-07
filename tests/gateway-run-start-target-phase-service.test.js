"use strict";

const assert = require("node:assert/strict");
const { createGatewayRunStartTargetPhaseService } = require("../adapters/gateway-run-start-target-phase-service");

async function testTargetPhaseRunsGatewayStartAndPluginProbe() {
  const calls = {
    gateMetadata: [],
    gatewayStarts: [],
    probes: [],
    readyEvents: [],
    selected: [],
    wardrobeChecks: [],
  };
  const thread = { id: "thread_1" };
  const assistantMessage = { id: "assistant_1" };
  const userMessage = { id: "user_1", content: "use plugin" };
  const request = { body: { input: "hello" } };
  const updatedRequest = { body: { input: "hello", plugin: true } };
  const effectiveRunOptions = { model: "gpt-test" };
  const updatedRunOptions = { model: "gpt-test", pluginCapabilityProbeResults: [{ plugin_id: "finance" }] };
  const gatewayTarget = { name: "lowgw1", profile: "owner-low", source: "worker_pool" };
  const gatewayGate = { active: true, ok: true, stage: "gateway_selected" };
  const probeGate = { active: true, ok: true, stage: "after_plugin_probe" };
  const service = createGatewayRunStartTargetPhaseService({
    applyGatewayTargetStart: (...args) => {
      calls.gatewayStarts.push(args);
      return { gatewayUrl: "http://worker.gateway" };
    },
    applyWardrobeWorkflowGateMetadata: (...args) => calls.gateMetadata.push(args),
    completeWardrobeWorkflowGateFailure: () => {
      throw new Error("gate failure should not run on an ok gate");
    },
    evaluateWardrobeGate: (...args) => {
      calls.wardrobeChecks.push(args);
      return gatewayGate;
    },
    nowIso: () => "2026-06-08T01:02:03.000Z",
    projectGatewayTargetReadyEvents: (...args) => {
      calls.readyEvents.push(args);
      return {
        probeRequests: [{ plugin_id: "finance" }],
        shouldProbePluginCapabilities: true,
      };
    },
    runPluginCapabilityProbe: async (args) => {
      calls.probes.push(args);
      return {
        effectiveRunOptions: updatedRunOptions,
        request: updatedRequest,
        wardrobeGate: probeGate,
      };
    },
    selectGatewayRunTarget: async (...args) => {
      calls.selected.push(args);
      return gatewayTarget;
    },
  });

  const result = await service.runTargetSelectedPhase({
    assistantMessage,
    effectiveRunOptions,
    probeOverridePresent: true,
    request,
    taskId: "web_test_1",
    thread,
    userMessage,
  });

  assert.deepEqual(calls.selected, [[request, "web_test_1", thread]]);
  assert.deepEqual(calls.wardrobeChecks, [[request, userMessage, "gateway_selected", gatewayTarget]]);
  assert.deepEqual(calls.gateMetadata, [[assistantMessage, gatewayGate]]);
  assert.deepEqual(calls.gatewayStarts, [[thread, assistantMessage, "web_test_1", request, gatewayTarget, "2026-06-08T01:02:03.000Z"]]);
  assert.deepEqual(calls.readyEvents, [[thread, assistantMessage, request, gatewayTarget, { probeOverridePresent: true }]]);
  assert.deepEqual(calls.probes, [{
    assistantMessage,
    effectiveRunOptions,
    gatewayTarget,
    probeRequests: [{ plugin_id: "finance" }],
    request,
    shouldProbePluginCapabilities: true,
    thread,
    userMessage,
    wardrobeGate: gatewayGate,
  }]);
  assert.deepEqual(result, {
    effectiveRunOptions: updatedRunOptions,
    gatewayTarget,
    gatewayUrl: "http://worker.gateway",
    request: updatedRequest,
    wardrobeGate: probeGate,
  });
}

async function testTargetPhaseStopsOnGatewaySelectedGateFailure() {
  const calls = { gatewayStarts: 0, probes: 0 };
  const gatewayTarget = { name: "lowgw1" };
  const wardrobeGate = { active: true, ok: false, reason: "missing_rule" };
  const terminalResult = { status: "failed", reason: "wardrobe gate failed" };
  const service = createGatewayRunStartTargetPhaseService({
    applyGatewayTargetStart: () => { calls.gatewayStarts += 1; },
    applyWardrobeWorkflowGateMetadata: () => {},
    completeWardrobeWorkflowGateFailure: (...args) => {
      assert.equal(args[0].id, "thread_1");
      assert.equal(args[1].id, "assistant_1");
      assert.equal(args[2], "web_test_1");
      assert.equal(args[3], wardrobeGate);
      return terminalResult;
    },
    evaluateWardrobeGate: () => wardrobeGate,
    runPluginCapabilityProbe: async () => { calls.probes += 1; },
    selectGatewayRunTarget: async () => gatewayTarget,
  });

  const result = await service.runTargetSelectedPhase({
    assistantMessage: { id: "assistant_1" },
    effectiveRunOptions: {},
    request: { body: {} },
    taskId: "web_test_1",
    thread: { id: "thread_1" },
    userMessage: { id: "user_1" },
  });

  assert.deepEqual(result, { gatewayTarget, wardrobeGate, terminalResult });
  assert.equal(calls.gatewayStarts, 0);
  assert.equal(calls.probes, 0);
}

async function testTargetPhaseStopsOnPluginProbeGateFailure() {
  const request = { body: {} };
  const gatewayTarget = { name: "lowgw1" };
  const wardrobeGate = { active: true, ok: true, stage: "gateway_selected" };
  const probeGate = { active: true, ok: false, reason: "probe_missing_skill" };
  const terminalResult = { status: "failed", reason: "probe gate failed" };
  const service = createGatewayRunStartTargetPhaseService({
    applyGatewayTargetStart: () => ({ gatewayUrl: "http://worker.gateway" }),
    applyWardrobeWorkflowGateMetadata: () => {},
    completeWardrobeWorkflowGateFailure: (...args) => {
      assert.equal(args[3], probeGate);
      return terminalResult;
    },
    evaluateWardrobeGate: () => wardrobeGate,
    projectGatewayTargetReadyEvents: () => ({ probeRequests: [], shouldProbePluginCapabilities: false }),
    runPluginCapabilityProbe: async () => ({
      gateFailed: true,
      request,
      wardrobeGate: probeGate,
    }),
    selectGatewayRunTarget: async () => gatewayTarget,
  });

  const result = await service.runTargetSelectedPhase({
    assistantMessage: { id: "assistant_1" },
    effectiveRunOptions: { model: "gpt-test" },
    request,
    taskId: "web_test_1",
    thread: { id: "thread_1" },
    userMessage: { id: "user_1" },
  });

  assert.deepEqual(result, {
    effectiveRunOptions: { model: "gpt-test" },
    gatewayTarget,
    gatewayUrl: "http://worker.gateway",
    request,
    wardrobeGate: probeGate,
    terminalResult,
  });
}

Promise.resolve()
  .then(testTargetPhaseRunsGatewayStartAndPluginProbe)
  .then(testTargetPhaseStopsOnGatewaySelectedGateFailure)
  .then(testTargetPhaseStopsOnPluginProbeGateFailure)
  .then(() => {
    console.log("gateway run-start target phase service tests passed");
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
