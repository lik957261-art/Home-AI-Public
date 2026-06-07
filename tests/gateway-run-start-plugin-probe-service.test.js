"use strict";

const assert = require("node:assert/strict");
const {
  createGatewayRunStartPluginProbeService,
} = require("../adapters/gateway-run-start-plugin-probe-service");

function makeHarness(overrides = {}) {
  const calls = {
    assistantOptions: [],
    events: [],
    probeEvents: [],
    probes: [],
    wardrobe: [],
  };
  const service = createGatewayRunStartPluginProbeService(Object.assign({
    appendPluginCapabilityProbeEvents: (_thread, _assistant, probes) => calls.probeEvents.push(probes),
    appendRunStartEvent: (_thread, _assistant, event, preview) => calls.events.push({ event, preview }),
    applyAssistantRunOptions: (_assistant, request, runOptions) => calls.assistantOptions.push({ request, runOptions }),
    applyWardrobeWorkflowGateMetadata: (_assistant, gate) => calls.wardrobe.push(gate),
    buildRunRequest: (_thread, _user, _assistant, runOptions) => ({
      id: "rebuilt",
      pluginCapabilityProbeResults: runOptions.pluginCapabilityProbeResults,
    }),
    contextReadyPreview: (request) => `ready:${request.id}`,
    evaluateWardrobeGate: (_request, _user, stage) => ({ active: false, ok: true, stage }),
    probePluginCapabilities: async (input) => {
      calls.probes.push(input);
      return { probes: [{ pluginId: "finance", toolset: "finance", ok: true }] };
    },
  }, overrides));
  return { calls, service };
}

async function testProbeResultsRebuildRequestAndProjectEvents() {
  const { calls, service } = makeHarness();
  const result = await service.runPluginCapabilityProbe({
    shouldProbePluginCapabilities: true,
    probeRequests: [{ pluginId: "finance", toolset: "finance" }],
    request: { id: "initial" },
    effectiveRunOptions: { model: "gpt-test" },
    thread: {},
    userMessage: {},
    assistantMessage: {},
    gatewayTarget: { profile: "lowgw-finance" },
    wardrobeGate: { active: false, ok: true, stage: "gateway_selected" },
  });

  assert.equal(calls.probes.length, 1);
  assert.deepEqual(calls.probes[0].requests, [{ pluginId: "finance", toolset: "finance" }]);
  assert.equal(result.request.id, "rebuilt");
  assert.deepEqual(result.effectiveRunOptions.pluginCapabilityProbeResults, [{ pluginId: "finance", toolset: "finance", ok: true }]);
  assert.deepEqual(calls.probeEvents[0], [{ pluginId: "finance", toolset: "finance", ok: true }]);
  assert.deepEqual(calls.wardrobe, [{ active: false, ok: true, stage: "after_plugin_probe" }]);
  assert.deepEqual(calls.events, [{ event: "run.context_ready", preview: "ready:rebuilt" }]);
}

async function testProbeWithoutResultsOnlyProjectsContextReady() {
  const { calls, service } = makeHarness({
    probePluginCapabilities: async (input) => {
      calls.probes.push(input);
      return { probes: [] };
    },
  });
  const request = { id: "initial" };
  const runOptions = { model: "gpt-test" };

  const result = await service.runPluginCapabilityProbe({
    shouldProbePluginCapabilities: true,
    request,
    effectiveRunOptions: runOptions,
    thread: {},
    userMessage: {},
    assistantMessage: {},
    wardrobeGate: { active: false, ok: true },
  });

  assert.equal(result.request, request);
  assert.equal(result.effectiveRunOptions, runOptions);
  assert.deepEqual(calls.probeEvents, []);
  assert.deepEqual(calls.wardrobe, []);
  assert.deepEqual(calls.events, [{ event: "run.context_ready", preview: "ready:initial" }]);
}

async function testProbeGateFailureReturnsWithoutContextReady() {
  const { calls, service } = makeHarness({
    evaluateWardrobeGate: () => ({ active: true, ok: false, reason: "missing_skill" }),
  });

  const result = await service.runPluginCapabilityProbe({
    shouldProbePluginCapabilities: true,
    request: { id: "initial" },
    effectiveRunOptions: {},
    thread: {},
    userMessage: {},
    assistantMessage: {},
    wardrobeGate: { active: false, ok: true },
  });

  assert.equal(result.gateFailed, true);
  assert.deepEqual(result.wardrobeGate, { active: true, ok: false, reason: "missing_skill" });
  assert.deepEqual(calls.events, []);
  assert.equal(calls.probeEvents.length, 1);
}

async function testSkipProbeIsNoop() {
  const { calls, service } = makeHarness();
  const request = { id: "initial" };

  const result = await service.runPluginCapabilityProbe({
    shouldProbePluginCapabilities: false,
    request,
    effectiveRunOptions: {},
    wardrobeGate: { active: false, ok: true },
  });

  assert.equal(result.request, request);
  assert.deepEqual(calls.probes, []);
  assert.deepEqual(calls.events, []);
}

Promise.resolve()
  .then(testProbeResultsRebuildRequestAndProjectEvents)
  .then(testProbeWithoutResultsOnlyProjectsContextReady)
  .then(testProbeGateFailureReturnsWithoutContextReady)
  .then(testSkipProbeIsNoop)
  .then(() => console.log("gateway run-start plugin probe service tests passed"));
