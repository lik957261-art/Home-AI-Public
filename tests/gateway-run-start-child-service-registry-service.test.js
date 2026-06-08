"use strict";

const assert = require("node:assert/strict");
const { createGatewayRunStartChildServiceRegistry } = require("../adapters/gateway-run-start-child-service-registry-service");
const { createGatewayRunStartService } = require("../adapters/gateway-run-start-service");

function makeFactories(calls) {
  const service = (name, methods) => {
    calls.push({ factory: name, methods: Object.keys(methods) });
    return methods;
  };
  return {
    createGatewayRunRequestBuilderService: (options) => service("request", {
      buildGroupChatRunContext: (...args) => ({ kind: "group", args }),
      buildRunRequest: (...args) => ({ kind: "request", args, toolSchemaEpoch: options.toolSchemaEpoch }),
    }),
    createGatewayRunStartAssistantOptionsService: (options) => service("assistantOptions", {
      applyAssistantRunOptions: (...args) => ({ kind: "assistant", args, toolSchemaEpoch: options.toolSchemaEpoch }),
      applyWardrobeWorkflowGateMetadata: (...args) => ({ kind: "wardrobeMetadata", args }),
    }),
    createGatewayRunStartEventService: (options) => service("event", {
      appendGatewaySchedulerEvent: (...args) => ({ kind: "scheduler", args, now: options.nowMs() }),
      appendPluginCapabilityProbeEvents: (...args) => ({ kind: "probeEvents", args }),
      appendRequiredSkillPreloadEvents: (...args) => ({ kind: "skillPreload", args }),
      appendRunStartEvent: (...args) => ({ kind: "runEvent", args }),
      contextReadyPreview: () => "context-ready",
      gatewaySelectedPreview: () => "gateway-selected",
      permissionSelectionPreview: () => "permission",
      preflightResultEventName: () => "preflight.done",
      toolsetSelectionFallbackPreview: () => "fallback",
      toolsetSelectionPreview: () => "selection",
      toolsetSelectionRouting: () => ({ mode: "test" }),
    }),
    createGatewayRunStartExecutionPhaseService: (options) => service("execution", {
      runExecutionPhase: (...args) => ({ kind: "execution", args, optionKeys: Object.keys(options) }),
    }),
    createGatewayRunStartPermissionService: () => service("permission", {
      completeModelPermissionRequest: (...args) => ({ kind: "permission", args }),
    }),
    createGatewayRunStartPluginProbeService: () => service("pluginProbe", {
      runPluginCapabilityProbe: (...args) => ({ kind: "pluginProbe", args }),
    }),
    createGatewayRunStartPreparationService: (options) => service("preparation", {
      prepareRunStart: (...args) => ({ kind: "prepare", args, optionKeys: Object.keys(options) }),
    }),
    createGatewayRunStartStreamHandoffService: () => service("streamHandoff", {
      startStreamHandoff: (...args) => ({ kind: "streamHandoff", args }),
    }),
    createGatewayRunStartStreamOptionsService: () => service("streamOptions", {
      streamOptionsForGatewayTarget: (...args) => ({ kind: "streamOptions", args }),
    }),
    createGatewayRunStartStateService: () => service("state", {
      applyPreparingRunState: (...args) => ({ kind: "preparingState", args }),
      applyStartedRunState: (...args) => ({ kind: "startedState", args }),
      broadcastMessageUpdated: (...args) => ({ kind: "broadcast", args }),
      markStartFailed: (...args) => ({ kind: "failed", args }),
    }),
    createGatewayRunStartTargetPhaseService: (options) => service("targetPhase", {
      runTargetSelectedPhase: (...args) => ({ kind: "targetPhase", args, optionKeys: Object.keys(options) }),
    }),
    createGatewayRunStartTargetService: () => service("target", {
      applyGatewayTargetStart: (...args) => ({ kind: "targetStart", args }),
      projectGatewayTargetReadyEvents: (...args) => ({ kind: "targetEvents", args }),
      selectGatewayRunTarget: (...args) => ({ kind: "selectTarget", args }),
    }),
    createGatewayRunStartToolsetPreflightService: (options) => service("toolsetPreflight", {
      applyModelFirstToolsetPreflight: (...args) => ({ kind: "preflight", args, optionKeys: Object.keys(options) }),
    }),
    createGatewayRunStartToolsetSelectionService: () => service("toolsetSelection", {
      appendToolsetEscalationInstructions: (...args) => ({ kind: "escalationInstructions", args }),
      restoreAuthorizedToolsetsForSelectionFallback: (...args) => ({ kind: "restoreToolsets", args }),
    }),
    createGatewayRunStartWardrobeGateService: () => service("wardrobeGate", {
      completeWardrobeWorkflowGateFailure: (...args) => ({ kind: "wardrobeFailure", args }),
      evaluateWardrobeGate: (...args) => ({ kind: "wardrobeGate", args }),
    }),
  };
}

function testRegistryBuildsStartChildServicesAndDelegatesPublicHelpers() {
  const calls = [];
  const registry = createGatewayRunStartChildServiceRegistry({
    factories: makeFactories(calls),
    nowMs: () => 1234,
    probePluginCapabilities: () => {},
    toolSchemaEpoch: "epoch-test",
  });

  assert.deepEqual(calls.map((call) => call.factory), [
    "request",
    "event",
    "streamOptions",
    "state",
    "assistantOptions",
    "wardrobeGate",
    "toolsetSelection",
    "target",
    "permission",
    "toolsetPreflight",
    "pluginProbe",
    "targetPhase",
    "streamHandoff",
    "execution",
    "preparation",
  ]);
  assert.equal(registry.probeOverridePresent, true);
  assert.equal(registry.buildRunRequest("thread").toolSchemaEpoch, "epoch-test");
  assert.equal(registry.buildGroupChatRunContext("thread").kind, "group");
  assert.equal(registry.applyStartedRunState("thread").kind, "startedState");
  assert.equal(registry.markStartFailed("thread").kind, "failed");
  assert.equal(registry.preparationService.prepareRunStart({}).kind, "prepare");
  assert.ok(registry.preparationService.prepareRunStart({}).optionKeys.includes("assertRunConcurrencyCapacity"));
  assert.equal(registry.targetPhaseService.runTargetSelectedPhase({}).kind, "targetPhase");
  assert.ok(registry.targetPhaseService.runTargetSelectedPhase({}).optionKeys.includes("runPluginCapabilityProbe"));
  assert.equal(registry.executionPhaseService.runExecutionPhase({}).kind, "execution");
  assert.ok(registry.executionPhaseService.runExecutionPhase({}).optionKeys.includes("applyModelFirstToolsetPreflight"));
}

async function testStartServiceCanUseInjectedChildRegistry() {
  const calls = [];
  const childServices = {
    applyStartedRunState: () => {},
    buildGroupChatRunContext: () => ({}),
    buildRunRequest: () => ({}),
    markStartFailed: () => {},
    preparationService: {
      prepareRunStart(args) {
        calls.push(["prepare", args.runOptions.mode]);
        return {
          effectiveRunOptions: { fromPrepare: true },
          request: { body: { input: "prepared" } },
          taskId: "run_1",
        };
      },
    },
    probeOverridePresent: true,
    targetPhaseService: {
      async runTargetSelectedPhase(args) {
        calls.push(["target", args.probeOverridePresent, args.effectiveRunOptions.fromPrepare]);
        return {
          effectiveRunOptions: { fromTarget: true },
          gatewayTarget: { apiBase: "http://gateway" },
          gatewayUrl: "http://gateway",
          request: { body: { input: "target" } },
        };
      },
    },
    executionPhaseService: {
      runExecutionPhase(args) {
        calls.push(["execution", args.effectiveRunOptions.fromTarget, args.request.body.input]);
        return { status: "started", run_id: args.taskId };
      },
    },
  };
  const service = createGatewayRunStartService({ childServices });

  const result = await service.startRunForThread({ id: "thread" }, { id: "user" }, { id: "assistant" }, { mode: "test" });

  assert.deepEqual(result, { status: "started", run_id: "run_1" });
  assert.deepEqual(calls, [
    ["prepare", "test"],
    ["target", true, true],
    ["execution", true, "target"],
  ]);
}

testRegistryBuildsStartChildServicesAndDelegatesPublicHelpers();
testStartServiceCanUseInjectedChildRegistry().then(() => {
  console.log("gateway run start child service registry tests passed");
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
