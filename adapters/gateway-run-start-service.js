"use strict";

const {
  cleanString,
  createGatewayRunRequestBuilderService,
  defaultDedupe,
  objectValue,
  policyThreadForRun,
  resolveActorWorkspaceId,
} = require("./gateway-run-request-builder-service");
const { createGatewayRunStartAssistantOptionsService } = require("./gateway-run-start-assistant-options-service");
const { createGatewayRunStartEventService } = require("./gateway-run-start-event-service");
const { createGatewayRunStartPermissionService } = require("./gateway-run-start-permission-service");
const { createGatewayRunStartPluginProbeService } = require("./gateway-run-start-plugin-probe-service");
const { createGatewayRunStartPreparationService } = require("./gateway-run-start-preparation-service");
const { createGatewayRunStartStreamHandoffService } = require("./gateway-run-start-stream-handoff-service");
const {
  createGatewayRunStartStreamOptionsService,
} = require("./gateway-run-start-stream-options-service");
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

function createGatewayRunStartService(options = {}) {
  const toolSchemaEpoch = cleanString(options.toolSchemaEpoch, DEFAULT_TOOL_SCHEMA_EPOCH);

  const dedupe = maybeCall(options.dedupe, defaultDedupe);
  const nowIso = maybeCall(options.nowIso, () => new Date().toISOString());
  const assertRunConcurrencyCapacity = maybeCall(options.assertRunConcurrencyCapacity, () => {});
  const accessPolicyHardeningOptionsForGatewayRouting = maybeCall(
    options.accessPolicyHardeningOptionsForGatewayRouting,
    () => ({}),
  );
  const taskDirectoryAttachmentForMessage = maybeCall(options.taskDirectoryAttachmentForMessage, () => null);
  const projectForTaskDirectoryAttachment = maybeCall(options.projectForTaskDirectoryAttachment, () => ({}));
  const effectiveProjectForThread = maybeCall(options.effectiveProjectForThread, () => ({}));
  const findWorkspace = maybeCall(options.findWorkspace, () => null);
  const buildAccessPolicy = maybeCall(options.buildAccessPolicy, () => ({}));
  const sanitizePolicy = maybeCall(options.sanitizePolicy, (policy) => objectValue(policy));
  const mergeAccessPolicyOverride = maybeCall(options.mergeAccessPolicyOverride, (basePolicy, overridePolicy) => Object.assign(
    {},
    objectValue(basePolicy),
    objectValue(overridePolicy),
  ));
  const groupChatDeliveryRootForThread = maybeCall(options.groupChatDeliveryRootForThread, () => "");
  const windowsPathToWsl = maybeCall(options.windowsPathToWsl, (value) => value);
  const ensureGroupChatSharedArtifactCopies = maybeCall(options.ensureGroupChatSharedArtifactCopies, () => []);
  const mkdirSync = maybeCall(options.mkdirSync || options.fs?.mkdirSync, () => {});
  const gatewayConversationId = maybeCall(options.gatewayConversationId, () => "");
  const buildConversationHistory = maybeCall(options.buildConversationHistory, () => []);
  const buildHermesInstructions = maybeCall(options.buildHermesInstructions, () => "");
  const loadRequiredSkillPreloads = maybeCall(options.loadRequiredSkillPreloads, () => []);
  const nowMs = maybeCall(options.nowMs, () => Date.now());
  const routeRunToolsets = maybeCall(options.routeRunToolsets, ({ policy }) => ({ policy: objectValue(policy), routing: null }));
  const makePublicTaskId = maybeCall(options.makePublicTaskId, () => `web_${Date.now()}`);
  const gatewaySkillRoutingForWorkspace = maybeCall(options.gatewaySkillRoutingForWorkspace, () => ({}));
  const chooseGatewayRunTarget = maybeCall(options.chooseGatewayRunTarget, async () => ({ apiBase: "" }));
  const addThreadActiveRun = maybeCall(options.addThreadActiveRun, () => {});
  const addThreadEvent = maybeCall(options.addThreadEvent, (thread, event) => {
    if (!thread || !event) return;
    thread.events = Array.isArray(thread.events) ? thread.events : [];
    thread.events.push(event);
  });
  const removeThreadActiveRun = maybeCall(options.removeThreadActiveRun, () => {});
  const saveState = maybeCall(options.saveState, () => {});
  const broadcast = maybeCall(options.broadcast, () => {});
  const compactMessage = maybeCall(options.compactMessage, (message) => message);
  const threadSummary = maybeCall(options.threadSummary, (thread) => thread);
  const streamResponse = maybeCall(options.streamResponse, () => null);
  const requestBuilderService = options.requestBuilderService || createGatewayRunRequestBuilderService({
    accessPolicyHardeningOptionsForGatewayRouting,
    buildAccessPolicy,
    buildConversationHistory,
    buildHermesInstructions,
    buildPluginCapabilityContext: options.buildPluginCapabilityContext,
    dedupe,
    effectiveProjectForThread,
    ensureGroupChatSharedArtifactCopies,
    findWorkspace,
    gatewayConversationId,
    gatewaySkillRoutingForWorkspace,
    groupChatDeliveryRootForThread,
    groupChatTaskGroupId: options.groupChatTaskGroupId,
    loadRequiredSkillPreloads,
    mergeAccessPolicyOverride,
    mkdirSync,
    pluginCapabilityActivationService: options.pluginCapabilityActivationService,
    projectForTaskDirectoryAttachment,
    routeRunToolsets,
    sanitizePolicy,
    singleWindowProjectId: options.singleWindowProjectId,
    taskDirectoryAttachmentForMessage,
    toolSchemaEpoch,
    windowsPathToWsl,
  });
  const buildGroupChatRunContext = (...args) => requestBuilderService.buildGroupChatRunContext(...args);
  const buildRunRequest = (...args) => requestBuilderService.buildRunRequest(...args);
  const runStartEventService = options.runStartEventService || createGatewayRunStartEventService({
    addThreadEvent,
    broadcast,
    dedupe,
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
  const streamOptionsService = options.streamOptionsService || createGatewayRunStartStreamOptionsService({
    runExplicitWebSearchMaxCalls: options.runExplicitWebSearchMaxCalls,
    runWebSearchMaxCalls: options.runWebSearchMaxCalls,
  });
  const runStartStateService = options.runStartStateService || createGatewayRunStartStateService({
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
  const assistantOptionsService = options.assistantOptionsService || createGatewayRunStartAssistantOptionsService({
    toolSchemaEpoch,
  });
  const applyAssistantRunOptions = (...args) => assistantOptionsService.applyAssistantRunOptions(...args);
  const applyWardrobeWorkflowGateMetadata = (...args) => assistantOptionsService.applyWardrobeWorkflowGateMetadata(...args);
  const wardrobeGateService = options.wardrobeGateService || createGatewayRunStartWardrobeGateService({
    appendRunStartEvent,
    markStartFailed,
  });
  const evaluateWardrobeGate = (...args) => wardrobeGateService.evaluateWardrobeGate(...args);
  const completeWardrobeWorkflowGateFailure = (...args) => wardrobeGateService.completeWardrobeWorkflowGateFailure(...args);
  const toolsetSelectionService = options.toolsetSelectionService || createGatewayRunStartToolsetSelectionService({ dedupe });
  const appendToolsetEscalationInstructions = (...args) => toolsetSelectionService.appendToolsetEscalationInstructions(...args);
  const restoreAuthorizedToolsetsForSelectionFallback = (...args) => toolsetSelectionService.restoreAuthorizedToolsetsForSelectionFallback(...args);
  const targetService = options.targetService || createGatewayRunStartTargetService({
    appendGatewaySchedulerEvent: (...args) => runStartEventService.appendGatewaySchedulerEvent(...args),
    appendRunStartEvent,
    applyStartedRunState,
    broadcastMessageUpdated,
    chooseGatewayRunTarget,
    contextReadyPreview,
    gatewaySelectedPreview,
    saveState,
  });
  const permissionService = options.permissionService || createGatewayRunStartPermissionService({
    appendRunStartEvent,
    broadcastMessageUpdated,
    nowIso,
    permissionSelectionPreview,
    removeThreadActiveRun,
    saveState,
  });
  const completeModelPermissionRequest = (...args) => permissionService.completeModelPermissionRequest(...args);
  const toolsetPreflightService = options.toolsetPreflightService || createGatewayRunStartToolsetPreflightService({
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
  const pluginProbeService = options.pluginProbeService || createGatewayRunStartPluginProbeService({
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
  const targetPhaseService = options.targetPhaseService || createGatewayRunStartTargetPhaseService({
    applyGatewayTargetStart: (...args) => targetService.applyGatewayTargetStart(...args),
    applyWardrobeWorkflowGateMetadata,
    completeWardrobeWorkflowGateFailure,
    evaluateWardrobeGate,
    nowIso,
    projectGatewayTargetReadyEvents: (...args) => targetService.projectGatewayTargetReadyEvents(...args),
    runPluginCapabilityProbe,
    selectGatewayRunTarget: (...args) => targetService.selectGatewayRunTarget(...args),
  });
  const streamHandoffService = options.streamHandoffService || createGatewayRunStartStreamHandoffService({
    appendRunStartEvent,
    applyAssistantRunOptions,
    applyWardrobeWorkflowGateMetadata,
    completeWardrobeWorkflowGateFailure,
    dedupe,
    evaluateWardrobeGate,
    saveState,
    streamResponse,
  });
  const preparationService = options.preparationService || createGatewayRunStartPreparationService({
    appendRequiredSkillPreloadEvents: (...args) => runStartEventService.appendRequiredSkillPreloadEvents(...args),
    appendRunStartEvent,
    applyAssistantRunOptions,
    applyPreparingRunState: (...args) => runStartStateService.applyPreparingRunState(...args),
    applyWardrobeWorkflowGateMetadata,
    assertRunConcurrencyCapacity,
    broadcastMessageUpdated,
    buildRunRequest,
    completeWardrobeWorkflowGateFailure,
    evaluateWardrobeGate,
    makePublicTaskId,
    nowIso,
    saveState,
  });

  async function startRunForThread(thread, userMessage, assistantMessage, runOptions = {}) {
    const prepared = preparationService.prepareRunStart({ thread, userMessage, assistantMessage, runOptions });
    if (prepared.terminalResult) return prepared.terminalResult;
    const taskId = prepared.taskId;
    let effectiveRunOptions = prepared.effectiveRunOptions || runOptions;
    let request = prepared.request;

    const targetPhase = await targetPhaseService.runTargetSelectedPhase({
      assistantMessage,
      effectiveRunOptions,
      probeOverridePresent: typeof options.probePluginCapabilities === "function",
      request,
      taskId,
      thread,
      userMessage,
    });
    if (targetPhase.terminalResult) return targetPhase.terminalResult;
    effectiveRunOptions = targetPhase.effectiveRunOptions || effectiveRunOptions;
    request = targetPhase.request || request;
    const { gatewayTarget, gatewayUrl } = targetPhase;
    const streamOptions = streamOptionsService.streamOptionsForGatewayTarget(gatewayTarget, runOptions, { gatewayUrl });
    const preflight = await applyModelFirstToolsetPreflight({
      assistantMessage,
      effectiveRunOptions,
      gatewayTarget,
      gatewayUrl,
      request,
      taskId,
      thread,
      userMessage,
    });
    if (preflight?.terminalResult) {
      return preflight.terminalResult;
    }
    request = preflight?.request || request;
    return streamHandoffService.startStreamHandoff({
      assistantMessage,
      effectiveRunOptions,
      gatewayTarget,
      gatewayUrl,
      request,
      streamOptions,
      taskId,
      thread,
      userMessage,
    });
  }

  return {
    applyStartedRunState,
    buildGroupChatRunContext,
    buildRunRequest,
    markStartFailed,
    policyThreadForRun,
    resolveActorWorkspaceId,
    startRunForThread,
  };
}

module.exports = {
  createGatewayRunStartService,
  policyThreadForRun,
  resolveActorWorkspaceId,
};
