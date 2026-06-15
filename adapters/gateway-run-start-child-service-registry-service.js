"use strict";

const {
  cleanString,
  createGatewayRunRequestBuilderService,
  defaultDedupe,
  objectValue,
} = require("./gateway-run-request-builder-service");
const { createGatewayRunStartAssistantOptionsService } = require("./gateway-run-start-assistant-options-service");
const { createGatewayRunStartEventService } = require("./gateway-run-start-event-service");
const { createGatewayRunStartExecutionPhaseService } = require("./gateway-run-start-execution-phase-service");
const { createGatewayRunStartPermissionService } = require("./gateway-run-start-permission-service");
const { createGatewayRunStartPluginProbeService } = require("./gateway-run-start-plugin-probe-service");
const { createGatewayRunStartPreparationService } = require("./gateway-run-start-preparation-service");
const { createGatewayRunStartStreamHandoffService } = require("./gateway-run-start-stream-handoff-service");
const { createGatewayRunStartStreamOptionsService } = require("./gateway-run-start-stream-options-service");
const { createGatewayRunStartStateService } = require("./gateway-run-start-state-service");
const { createGatewayRunStartTargetPhaseService } = require("./gateway-run-start-target-phase-service");
const { createGatewayRunStartTargetService } = require("./gateway-run-start-target-service");
const { createGatewayRunStartToolsetPreflightService } = require("./gateway-run-start-toolset-preflight-service");
const { createGatewayRunStartToolsetSelectionService } = require("./gateway-run-start-toolset-selection-service");
const { createGatewayRunStartWardrobeGateService } = require("./gateway-run-start-wardrobe-gate-service");

const DEFAULT_TOOL_SCHEMA_EPOCH = "20260513-audio-file-v1";

function maybeCall(fn, fallback) {
  return typeof fn === "function" ? fn : fallback;
}

function createGatewayRunStartChildServiceRegistry(options = {}) {
  const factories = Object.assign({
    createGatewayRunRequestBuilderService,
    createGatewayRunStartAssistantOptionsService,
    createGatewayRunStartEventService,
    createGatewayRunStartExecutionPhaseService,
    createGatewayRunStartPermissionService,
    createGatewayRunStartPluginProbeService,
    createGatewayRunStartPreparationService,
    createGatewayRunStartStreamHandoffService,
    createGatewayRunStartStreamOptionsService,
    createGatewayRunStartStateService,
    createGatewayRunStartTargetPhaseService,
    createGatewayRunStartTargetService,
    createGatewayRunStartToolsetPreflightService,
    createGatewayRunStartToolsetSelectionService,
    createGatewayRunStartWardrobeGateService,
  }, options.factories || {});
  const toolSchemaEpoch = cleanString(options.toolSchemaEpoch, DEFAULT_TOOL_SCHEMA_EPOCH);
  const dedupe = maybeCall(options.dedupe, defaultDedupe);
  const nowIso = maybeCall(options.nowIso, () => new Date().toISOString());
  const nowMs = maybeCall(options.nowMs, () => Date.now());
  const addThreadEvent = maybeCall(options.addThreadEvent, (thread, event) => {
    if (!thread || !event) return;
    thread.events = Array.isArray(thread.events) ? thread.events : [];
    thread.events.push(event);
  });
  const addThreadActiveRun = maybeCall(options.addThreadActiveRun, () => {});
  const removeThreadActiveRun = maybeCall(options.removeThreadActiveRun, () => {});
  const saveState = maybeCall(options.saveState, () => {});
  const broadcast = maybeCall(options.broadcast, () => {});
  const compactMessage = maybeCall(options.compactMessage, (message) => message);
  const threadSummary = maybeCall(options.threadSummary, (thread) => thread);
  const streamResponse = maybeCall(options.streamResponse, () => null);
  const requestBuilderService = options.requestBuilderService || factories.createGatewayRunRequestBuilderService({
    accessPolicyHardeningOptionsForGatewayRouting: maybeCall(options.accessPolicyHardeningOptionsForGatewayRouting, () => ({})),
    buildAccessPolicy: maybeCall(options.buildAccessPolicy, () => ({})),
    buildConversationHistory: maybeCall(options.buildConversationHistory, () => []),
    buildHermesInstructions: maybeCall(options.buildHermesInstructions, () => ""),
    buildPluginCapabilityContext: options.buildPluginCapabilityContext,
    dedupe,
    effectiveProjectForThread: maybeCall(options.effectiveProjectForThread, () => ({})),
    ensureGroupChatSharedArtifactCopies: maybeCall(options.ensureGroupChatSharedArtifactCopies, () => []),
    findWorkspace: maybeCall(options.findWorkspace, () => null),
    gatewayConversationId: maybeCall(options.gatewayConversationId, () => ""),
    gatewaySkillRoutingForWorkspace: maybeCall(options.gatewaySkillRoutingForWorkspace, () => ({})),
    groupChatDeliveryRootForThread: maybeCall(options.groupChatDeliveryRootForThread, () => ""),
    groupChatTaskGroupId: options.groupChatTaskGroupId,
    loadRequiredSkillPreloads: maybeCall(options.loadRequiredSkillPreloads, () => []),
    mergeAccessPolicyOverride: maybeCall(options.mergeAccessPolicyOverride, (basePolicy, overridePolicy) => Object.assign(
      {},
      objectValue(basePolicy),
      objectValue(overridePolicy),
    )),
    mkdirSync: maybeCall(options.mkdirSync || options.fs?.mkdirSync, () => {}),
    pluginCapabilityActivationService: options.pluginCapabilityActivationService,
    projectForTaskDirectoryAttachment: maybeCall(options.projectForTaskDirectoryAttachment, () => ({})),
    routeRunToolsets: maybeCall(options.routeRunToolsets, ({ policy }) => ({ policy: objectValue(policy), routing: null })),
    sanitizePolicy: maybeCall(options.sanitizePolicy, (policy) => objectValue(policy)),
    singleWindowProjectId: options.singleWindowProjectId,
    taskDirectoryAttachmentForMessage: maybeCall(options.taskDirectoryAttachmentForMessage, () => null),
    toolSchemaEpoch,
    windowsPathToWsl: maybeCall(options.windowsPathToWsl, (value) => value),
  });
  const buildGroupChatRunContext = (...args) => requestBuilderService.buildGroupChatRunContext(...args);
  const buildRunRequest = (...args) => requestBuilderService.buildRunRequest(...args);
  const runStartEventService = options.runStartEventService || factories.createGatewayRunStartEventService({
    addThreadEvent,
    broadcast,
    dedupe,
    gatewayHealthDiagnosticService: options.gatewayHealthDiagnosticService,
    nowMs,
    threadSummary,
  });
  const appendRunStartEvent = (...args) => runStartEventService.appendRunStartEvent(...args);
  const appendPluginCapabilityProbeEvents = (...args) => runStartEventService.appendPluginCapabilityProbeEvents(...args);
  const contextReadyPreview = (...args) => runStartEventService.contextReadyPreview(...args);
  const gatewaySelectedPreview = (...args) => runStartEventService.gatewaySelectedPreview(...args);
  const toolsetSelectionRouting = (...args) => runStartEventService.toolsetSelectionRouting(...args);
  const toolsetSelectionPreview = (...args) => runStartEventService.toolsetSelectionPreview(...args);
  const toolsetSelectionFallbackPreview = (...args) => runStartEventService.toolsetSelectionFallbackPreview(...args);
  const preflightResultEventName = (...args) => runStartEventService.preflightResultEventName(...args);
  const permissionSelectionPreview = (...args) => runStartEventService.permissionSelectionPreview(...args);
  const streamOptionsService = options.streamOptionsService || factories.createGatewayRunStartStreamOptionsService({
    runExplicitWebSearchMaxCalls: options.runExplicitWebSearchMaxCalls,
    runWebSearchMaxCalls: options.runWebSearchMaxCalls,
  });
  const runStartStateService = options.runStartStateService || factories.createGatewayRunStartStateService({
    addThreadActiveRun,
    broadcast,
    compactMessage,
    nowIso,
    removeThreadActiveRun,
    saveState,
    threadSummary,
  });
  const applyStartedRunState = (...args) => runStartStateService.applyStartedRunState(...args);
  const broadcastMessageUpdated = (...args) => runStartStateService.broadcastMessageUpdated(...args);
  const markStartFailed = (...args) => runStartStateService.markStartFailed(...args);
  const assistantOptionsService = options.assistantOptionsService || factories.createGatewayRunStartAssistantOptionsService({ toolSchemaEpoch });
  const applyAssistantRunOptions = (...args) => assistantOptionsService.applyAssistantRunOptions(...args);
  const applyWardrobeWorkflowGateMetadata = (...args) => assistantOptionsService.applyWardrobeWorkflowGateMetadata(...args);
  const wardrobeGateService = options.wardrobeGateService || factories.createGatewayRunStartWardrobeGateService({
    appendRunStartEvent,
    markStartFailed,
  });
  const evaluateWardrobeGate = (...args) => wardrobeGateService.evaluateWardrobeGate(...args);
  const completeWardrobeWorkflowGateFailure = (...args) => wardrobeGateService.completeWardrobeWorkflowGateFailure(...args);
  const toolsetSelectionService = options.toolsetSelectionService || factories.createGatewayRunStartToolsetSelectionService({ dedupe });
  const appendToolsetEscalationInstructions = (...args) => toolsetSelectionService.appendToolsetEscalationInstructions(...args);
  const restoreAuthorizedToolsetsForSelectionFallback = (...args) => toolsetSelectionService.restoreAuthorizedToolsetsForSelectionFallback(...args);
  const targetService = options.targetService || factories.createGatewayRunStartTargetService({
    appendGatewaySchedulerEvent: (...args) => runStartEventService.appendGatewaySchedulerEvent(...args),
    appendRunStartEvent,
    applyStartedRunState,
    broadcastMessageUpdated,
    chooseGatewayRunTarget: maybeCall(options.chooseGatewayRunTarget, async () => ({ apiBase: "" })),
    contextReadyPreview,
    gatewaySelectedPreview,
    saveState,
  });
  const permissionService = options.permissionService || factories.createGatewayRunStartPermissionService({
    appendRunStartEvent,
    broadcastMessageUpdated,
    nowIso,
    permissionSelectionPreview,
    removeThreadActiveRun,
    saveState,
  });
  const completeModelPermissionRequest = (...args) => permissionService.completeModelPermissionRequest(...args);
  const toolsetPreflightService = options.toolsetPreflightService || factories.createGatewayRunStartToolsetPreflightService({
    appendRunStartEvent,
    appendToolsetEscalationInstructions,
    applyAssistantRunOptions,
    applyWardrobeWorkflowGateMetadata,
    buildRunRequest,
    completeModelPermissionRequest,
    dedupe,
    evaluateWardrobeGate,
    preflightResultEventName,
    restoreAuthorizedToolsetsForSelectionFallback,
    selectRunToolsetsWithModel: options.selectRunToolsetsWithModel,
    toolsetSelectionFallbackPreview,
    toolsetSelectionPreview,
    toolsetSelectionRouting,
  });
  const applyModelFirstToolsetPreflight = (...args) => toolsetPreflightService.applyModelFirstToolsetPreflight(...args);
  const pluginProbeService = options.pluginProbeService || factories.createGatewayRunStartPluginProbeService({
    appendPluginCapabilityProbeEvents,
    appendRunStartEvent,
    applyAssistantRunOptions,
    applyWardrobeWorkflowGateMetadata,
    buildRunRequest,
    contextReadyPreview,
    dedupe,
    evaluateWardrobeGate,
    nowMs,
    pluginCapabilityProbeService: options.pluginCapabilityProbeService,
    probePluginCapabilities: options.probePluginCapabilities,
  });
  const runPluginCapabilityProbe = (...args) => pluginProbeService.runPluginCapabilityProbe(...args);
  const targetPhaseService = options.targetPhaseService || factories.createGatewayRunStartTargetPhaseService({
    applyGatewayTargetStart: (...args) => targetService.applyGatewayTargetStart(...args),
    applyWardrobeWorkflowGateMetadata,
    completeWardrobeWorkflowGateFailure,
    evaluateWardrobeGate,
    nowIso,
    projectGatewayTargetReadyEvents: (...args) => targetService.projectGatewayTargetReadyEvents(...args),
    runPluginCapabilityProbe,
    selectGatewayRunTarget: (...args) => targetService.selectGatewayRunTarget(...args),
  });
  const streamHandoffService = options.streamHandoffService || factories.createGatewayRunStartStreamHandoffService({
    appendRunStartEvent,
    applyAssistantRunOptions,
    applyWardrobeWorkflowGateMetadata,
    completeWardrobeWorkflowGateFailure,
    dedupe,
    evaluateWardrobeGate,
    saveState,
    streamResponse,
  });
  const executionPhaseService = options.executionPhaseService || factories.createGatewayRunStartExecutionPhaseService({
    applyModelFirstToolsetPreflight,
    startStreamHandoff: (...args) => streamHandoffService.startStreamHandoff(...args),
    streamOptionsForGatewayTarget: (...args) => streamOptionsService.streamOptionsForGatewayTarget(...args),
  });
  const preparationService = options.preparationService || factories.createGatewayRunStartPreparationService({
    appendRequiredSkillPreloadEvents: (...args) => runStartEventService.appendRequiredSkillPreloadEvents(...args),
    appendRunStartEvent,
    applyAssistantRunOptions,
    applyPreparingRunState: (...args) => runStartStateService.applyPreparingRunState(...args),
    applyWardrobeWorkflowGateMetadata,
    assertRunConcurrencyCapacity: maybeCall(options.assertRunConcurrencyCapacity, () => {}),
    broadcastMessageUpdated,
    buildRunRequest,
    completeWardrobeWorkflowGateFailure,
    evaluateWardrobeGate,
    makePublicTaskId: maybeCall(options.makePublicTaskId, () => `web_${Date.now()}`),
    nowIso,
    saveState,
  });

  return Object.freeze({
    applyStartedRunState,
    buildGroupChatRunContext,
    buildRunRequest,
    executionPhaseService,
    markStartFailed,
    preparationService,
    probeOverridePresent: typeof options.probePluginCapabilities === "function",
    targetPhaseService,
  });
}

module.exports = {
  createGatewayRunStartChildServiceRegistry,
};
