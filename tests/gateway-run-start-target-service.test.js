"use strict";

const assert = require("node:assert/strict");

const {
  createGatewayRunStartTargetService,
  hasGatewayToolsetMetadata,
  probeRequestsForRequest,
  shouldProbePluginCapabilities,
} = require("../adapters/gateway-run-start-target-service");

function baseRequest(overrides = {}) {
  return Object.assign({
    body: {
      model: "gpt-test",
      provider: "openai-codex",
      reasoning_effort: "medium",
    },
    gatewayRouting: {
      model: "routing-model",
      provider: "routing-provider",
      reasoning_effort: "high",
    },
    pluginCapabilityContext: {},
  }, overrides);
}

async function testSelectGatewayTargetPassesSchedulerEventCallback() {
  const events = [];
  const service = createGatewayRunStartTargetService({
    chooseGatewayRunTarget: async (routing, context) => {
      assert.deepEqual(routing, { model: "gpt-test" });
      assert.equal(context.runId, "run_1");
      context.onEvent({ type: "worker.started" });
      return { apiBase: "http://worker.gateway" };
    },
    appendGatewaySchedulerEvent: (thread, runId, event) => events.push({ thread, runId, event }),
  });

  const thread = { id: "thread_1" };
  const target = await service.selectGatewayRunTarget({ gatewayRouting: { model: "gpt-test" } }, "run_1", thread);

  assert.equal(target.apiBase, "http://worker.gateway");
  assert.deepEqual(events, [{ thread, runId: "run_1", event: { type: "worker.started" } }]);
}

function testApplyGatewayTargetStartProjectsAssistantMetadata() {
  const calls = [];
  const service = createGatewayRunStartTargetService({
    applyStartedRunState: (thread, assistant, taskId, gatewayTarget, startedAt) => {
      calls.push({ type: "started", thread, assistant, taskId, gatewayTarget, startedAt });
      return { gatewayUrl: gatewayTarget.apiBase };
    },
    saveState: () => calls.push({ type: "save" }),
    broadcastMessageUpdated: (thread, assistant) => calls.push({ type: "broadcast", thread, assistant }),
  });
  const thread = { id: "thread_1" };
  const assistant = {};
  const gatewayTarget = { apiBase: "http://worker.gateway", model: "target-model", provider: "target-provider" };

  const result = service.applyGatewayTargetStart(thread, assistant, "run_1", baseRequest(), gatewayTarget, "2026-06-08T00:00:00.000Z");

  assert.equal(result.gatewayUrl, "http://worker.gateway");
  assert.equal(assistant.model, "gpt-test");
  assert.equal(assistant.modelProvider, "openai-codex");
  assert.equal(assistant.reasoningEffort, "medium");
  assert.deepEqual(calls.map((item) => item.type), ["started", "save", "broadcast"]);
}

function testApplyGatewayTargetStartPreservesExistingReasoningEffortAndFallsBackToTarget() {
  const service = createGatewayRunStartTargetService({
    applyStartedRunState: () => ({ gatewayUrl: "http://worker.gateway" }),
  });
  const assistant = { reasoningEffort: "manual" };
  const request = baseRequest({
    body: {},
    gatewayRouting: {},
  });

  service.applyGatewayTargetStart({}, assistant, "run_1", request, {
    model: "target-model",
    provider: "target-provider",
  }, "now");

  assert.equal(assistant.model, "target-model");
  assert.equal(assistant.modelProvider, "target-provider");
  assert.equal(assistant.reasoningEffort, "manual");
}

function testProjectGatewayTargetReadyEventsWithoutProbe() {
  const events = [];
  const service = createGatewayRunStartTargetService({
    appendRunStartEvent: (_thread, _assistant, event, preview) => events.push({ event, preview }),
    contextReadyPreview: () => "context-ready",
    gatewaySelectedPreview: () => "gateway-selected",
  });

  const result = service.projectGatewayTargetReadyEvents({}, {}, baseRequest(), {}, {});

  assert.equal(result.shouldProbePluginCapabilities, false);
  assert.deepEqual(result.probeRequests, []);
  assert.deepEqual(events, [
    { event: "run.context_ready", preview: "context-ready" },
    { event: "run.gateway_selected", preview: "gateway-selected" },
  ]);
}

function testProjectGatewayTargetReadyEventsWithProbeDefersContextReady() {
  const events = [];
  const request = baseRequest({
    pluginCapabilityContext: {
      probeRequests: [{ pluginId: "finance" }],
    },
  });
  const service = createGatewayRunStartTargetService({
    appendRunStartEvent: (_thread, _assistant, event, preview) => events.push({ event, preview }),
    contextReadyPreview: () => "context-ready",
    gatewaySelectedPreview: () => "gateway-selected",
  });

  const result = service.projectGatewayTargetReadyEvents({}, {}, request, { enabledToolsets: ["finance"] }, {});

  assert.equal(result.shouldProbePluginCapabilities, true);
  assert.deepEqual(result.probeRequests, [{ pluginId: "finance" }]);
  assert.deepEqual(events, [{ event: "run.gateway_selected", preview: "gateway-selected" }]);
}

function testProbeHelpers() {
  const request = baseRequest({ pluginCapabilityContext: { probeRequests: [{ pluginId: "wardrobe" }] } });
  assert.deepEqual(probeRequestsForRequest(request), [{ pluginId: "wardrobe" }]);
  assert.equal(hasGatewayToolsetMetadata({ toolsets: [] }), true);
  assert.equal(hasGatewayToolsetMetadata({}), false);
  assert.equal(shouldProbePluginCapabilities(request, {}, false), false);
  assert.equal(shouldProbePluginCapabilities(request, {}, true), true);
  assert.equal(shouldProbePluginCapabilities(request, { enabled_toolsets: ["wardrobe"] }, false), true);
}

async function main() {
  await testSelectGatewayTargetPassesSchedulerEventCallback();
  testApplyGatewayTargetStartProjectsAssistantMetadata();
  testApplyGatewayTargetStartPreservesExistingReasoningEffortAndFallsBackToTarget();
  testProjectGatewayTargetReadyEventsWithoutProbe();
  testProjectGatewayTargetReadyEventsWithProbeDefersContextReady();
  testProbeHelpers();
  console.log("gateway run start target service tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
