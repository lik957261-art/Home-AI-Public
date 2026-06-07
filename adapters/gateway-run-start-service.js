"use strict";

const { createPluginCapabilityProbeService } = require("./plugin-capability-probe-service");
const {
  cleanString,
  createGatewayRunRequestBuilderService,
  defaultDedupe,
  expandSelectedToolsetsWithCompanions,
  objectValue,
  policyThreadForRun,
  resolveActorWorkspaceId,
} = require("./gateway-run-request-builder-service");
const { createGatewayRunStartAssistantOptionsService } = require("./gateway-run-start-assistant-options-service");
const { createGatewayRunStartEventService } = require("./gateway-run-start-event-service");
const {
  createGatewayRunStartStreamOptionsService,
  isChatGptProRunOptions,
} = require("./gateway-run-start-stream-options-service");
const { createGatewayRunStartStateService } = require("./gateway-run-start-state-service");
const { evaluateWardrobeOutfitWorkflowGate } = require("./wardrobe-outfit-workflow-gate-service");

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
  const pluginCapabilityProbeService = options.pluginCapabilityProbeService
    || createPluginCapabilityProbeService({ dedupe, nowMs });
  const probePluginCapabilities = maybeCall(
    options.probePluginCapabilities,
    (...args) => pluginCapabilityProbeService.probePluginCapabilities(...args),
  );
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
  const selectRunToolsetsWithModel = typeof options.selectRunToolsetsWithModel === "function" ? options.selectRunToolsetsWithModel : null;
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
  const appendGatewaySchedulerEvent = (...args) => runStartEventService.appendGatewaySchedulerEvent(...args);
  const appendPluginCapabilityProbeEvents = (...args) => runStartEventService.appendPluginCapabilityProbeEvents(...args);
  const appendRequiredSkillPreloadEvents = (...args) => runStartEventService.appendRequiredSkillPreloadEvents(...args);
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
  const applyPreparingRunState = (...args) => runStartStateService.applyPreparingRunState(...args);
  const applyStartedRunState = (...args) => runStartStateService.applyStartedRunState(...args);
  const broadcastMessageUpdated = (...args) => runStartStateService.broadcastMessageUpdated(...args);
  const markStartFailed = (...args) => runStartStateService.markStartFailed(...args);
  const assistantOptionsService = options.assistantOptionsService || createGatewayRunStartAssistantOptionsService({
    toolSchemaEpoch,
  });
  const applyAssistantRunOptions = (...args) => assistantOptionsService.applyAssistantRunOptions(...args);
  const applyWardrobeWorkflowGateMetadata = (...args) => assistantOptionsService.applyWardrobeWorkflowGateMetadata(...args);

  function restoreAuthorizedToolsetsForSelectionFallback(request = {}, selection = {}) {
    const authorized = dedupe(
      selection.authorizedToolsets
      || selection.authorized_toolsets
      || request.runPolicy?.authorized_toolsets
      || request.runPolicy?.authorizedToolsets
      || request.body?.access_policy_context?.authorized_toolsets
      || request.body?.access_policy_context?.authorizedToolsets
      || [],
    );
    const active = dedupe(
      selection.activeToolsets
      || selection.active_toolsets
      || request.runPolicy?.active_schema_set?.active_toolsets
      || request.body?.access_policy_context?.active_schema_set?.active_toolsets
      || request.runPolicy?.allowed_toolsets
      || request.runPolicy?.allowedToolsets
      || request.body?.access_policy_context?.allowed_toolsets
      || request.body?.access_policy_context?.allowedToolsets
      || [],
    );
    const allowed = active.length ? active : authorized;
    if (!allowed.length) return request;
    const nextActiveSchemaSet = request.runPolicy?.active_schema_set
      ? Object.assign({}, request.runPolicy.active_schema_set, {
        active_toolsets: allowed,
        omitted_plugin_toolsets: (request.runPolicy.active_schema_set.omitted_plugin_toolsets || [])
          .filter((toolset) => !allowed.includes(toolset)),
      })
      : null;
    request.runPolicy = Object.assign({}, request.runPolicy || {}, {
      authorized_toolsets: authorized.length ? authorized : allowed,
      allowed_toolsets: allowed,
    });
    if (nextActiveSchemaSet) request.runPolicy.active_schema_set = nextActiveSchemaSet;
    request.body.access_policy_context = Object.assign({}, request.body.access_policy_context || {}, {
      authorized_toolsets: authorized.length ? authorized : allowed,
      allowed_toolsets: allowed,
    });
    if (nextActiveSchemaSet) request.body.access_policy_context.active_schema_set = nextActiveSchemaSet;
    request.body.enabled_toolsets = allowed;
    return request;
  }

  function completeModelPermissionRequest(thread, assistantMessage, taskId, selection = {}) {
    const completedAt = nowIso();
    const scope = cleanString(selection.elevationScope || selection.elevation_scope || "owner_high_privilege");
    const reason = cleanString(selection.elevationReason || selection.reason || "This request needs Owner approval before Hermes Mobile can run it.");
    assistantMessage.status = "done";
    assistantMessage.content = "\u6b64\u8bf7\u6c42\u8d85\u51fa\u5f53\u524d Gateway \u6743\u9650\u8303\u56f4\uff0c\u9700\u8981 Owner \u6388\u6743\u540e\u624d\u80fd\u7ee7\u7eed\u3002";
    assistantMessage.elevationRequired = true;
    assistantMessage.elevationScope = scope;
    assistantMessage.elevationReason = reason;
    assistantMessage.elevationSource = cleanString(selection.elevationSource || "model_toolset_permission_selector");
    if (!assistantMessage.firstFeedbackAt) assistantMessage.firstFeedbackAt = completedAt;
    assistantMessage.completedAt = completedAt;
    assistantMessage.updatedAt = completedAt;
    removeThreadActiveRun(thread, taskId, "idle");
    thread.status = "idle";
    thread.updatedAt = completedAt;
    appendRunStartEvent(thread, assistantMessage, "run.permission_required", permissionSelectionPreview(selection));
    saveState(undefined, { reason: "run-request-preparing", skipSqliteRuntimeReplace: true });
    broadcastMessageUpdated(thread, assistantMessage);
  }

  function appendToolsetEscalationInstructions(request = {}, selection = {}, selectedToolsets = []) {
    const selected = dedupe(selectedToolsets);
    const authorized = dedupe(selection.authorizedToolsets || []);
    const omitted = authorized.filter((item) => !selected.includes(item));
    if (!selected.length || !omitted.length) return request;
    request.body.instructions = [
      request.body.instructions || "",
      [
        "Toolset routing: a model-first selector chose the enabled execution toolsets listed below.",
        `Enabled toolsets: ${selected.join(", ")}`,
        "If the task requires an omitted authorized toolset, stop and reply with HERMES_TOOLSET_ESCALATION_REQUIRED plus compact JSON: {\"toolsets\":[\"toolset_id\"],\"reason\":\"short reason\"}.",
        `Omitted authorized toolsets: ${omitted.join(", ")}`,
      ].join("\n"),
    ].filter(Boolean).join("\n\n");
    return request;
  }

  function appendWardrobeWorkflowGateInstructions(request = {}, gate = {}) {
    if (!gate?.active || !gate.ok || !gate.instructionBlock) return request;
    if (String(request.body?.instructions || "").includes("Wardrobe outfit workflow gate:")) return request;
    request.body.instructions = [
      request.body.instructions || "",
      gate.instructionBlock,
    ].filter(Boolean).join("\n\n");
    return request;
  }

  function evaluateWardrobeGate(request = {}, userMessage = {}, stage = "pre_stream", gatewayTarget = null, gateOptions = {}) {
    const gate = evaluateWardrobeOutfitWorkflowGate({ request, userMessage, stage, gatewayTarget });
    request.wardrobeOutfitWorkflowGate = gate;
    if (gateOptions.appendInstructions) appendWardrobeWorkflowGateInstructions(request, gate);
    return gate;
  }

  function completeWardrobeWorkflowGateFailure(thread, assistantMessage, taskId, gate = {}) {
    appendRunStartEvent(thread, assistantMessage, "run.wardrobe_workflow_gate_failed", gate.eventPreview || "");
    const err = new Error(gate.message || "Wardrobe workflow gate failed.");
    err.code = gate.errorCode || "wardrobe_workflow_gate_failed";
    err.details = {
      reason: cleanString(gate.reason),
      missingToolsets: gate.missingToolsets || [],
      missingSkills: gate.missingSkills || [],
      workflow: cleanString(gate.workflow),
      stage: cleanString(gate.stage),
    };
    const result = markStartFailed(thread, assistantMessage, err, {
      runId: taskId,
      content: gate.message,
    });
    return {
      run_id: taskId,
      status: "failed",
      engine: "responses",
      error: result.error,
    };
  }

  async function startRunForThread(thread, userMessage, assistantMessage, runOptions = {}) {
    const actorWorkspaceId = resolveActorWorkspaceId(thread, userMessage, runOptions);
    assertRunConcurrencyCapacity(actorWorkspaceId);
    assistantMessage.actorWorkspaceId = actorWorkspaceId;

    const taskId = makePublicTaskId("web");
    applyPreparingRunState(thread, assistantMessage, taskId, nowIso());
    saveState(undefined, { reason: "run-gateway-selected", skipSqliteRuntimeReplace: true });
    broadcastMessageUpdated(thread, assistantMessage);
    appendRunStartEvent(thread, assistantMessage, "run.request_preparing", "正在准备上下文和选择 Gateway");

    let effectiveRunOptions = runOptions;
    let request = buildRunRequest(thread, userMessage, assistantMessage, effectiveRunOptions);
    let wardrobeGate = evaluateWardrobeGate(request, userMessage, "pre_gateway");
    applyAssistantRunOptions(assistantMessage, request, effectiveRunOptions);
    applyWardrobeWorkflowGateMetadata(assistantMessage, wardrobeGate);
    appendRequiredSkillPreloadEvents(thread, assistantMessage, request);
    if (wardrobeGate.active && !wardrobeGate.ok) {
      return completeWardrobeWorkflowGateFailure(thread, assistantMessage, taskId, wardrobeGate);
    }

    const gatewayTarget = await chooseGatewayRunTarget(request.gatewayRouting, {
      runId: taskId,
      onEvent: (event) => appendGatewaySchedulerEvent(thread, taskId, event),
    });
    wardrobeGate = evaluateWardrobeGate(request, userMessage, "gateway_selected", gatewayTarget);
    applyWardrobeWorkflowGateMetadata(assistantMessage, wardrobeGate);
    if (wardrobeGate.active && !wardrobeGate.ok) {
      return completeWardrobeWorkflowGateFailure(thread, assistantMessage, taskId, wardrobeGate);
    }
    const { gatewayUrl } = applyStartedRunState(thread, assistantMessage, taskId, gatewayTarget, nowIso());
    assistantMessage.model = cleanString(request.body.model || request.gatewayRouting.model || gatewayTarget?.model || gatewayTarget?.defaultModel);
    assistantMessage.modelProvider = cleanString(request.body.provider || request.gatewayRouting.provider || gatewayTarget?.provider);
    if (!assistantMessage.reasoningEffort) {
      assistantMessage.reasoningEffort = cleanString(request.body.reasoning_effort || request.gatewayRouting.reasoning_effort);
    }
    saveState();
    broadcastMessageUpdated(thread, assistantMessage);
    const probeRequests = Array.isArray(request.pluginCapabilityContext?.probeRequests)
      ? request.pluginCapabilityContext.probeRequests
      : [];
    const hasGatewayToolsetMetadata = Array.isArray(gatewayTarget?.toolsets)
      || Array.isArray(gatewayTarget?.enabledToolsets)
      || Array.isArray(gatewayTarget?.enabled_toolsets);
    const shouldProbePluginCapabilities = probeRequests.length
      && (typeof options.probePluginCapabilities === "function" || hasGatewayToolsetMetadata);
    if (!shouldProbePluginCapabilities) {
      appendRunStartEvent(thread, assistantMessage, "run.context_ready", contextReadyPreview(request));
    }
    appendRunStartEvent(thread, assistantMessage, "run.gateway_selected", gatewaySelectedPreview(gatewayTarget, request));
    if (shouldProbePluginCapabilities) {
      const probeResult = await probePluginCapabilities({
        requests: probeRequests,
        request,
        gatewayTarget,
        thread,
        userMessage,
        assistantMessage,
        runOptions: effectiveRunOptions,
      }) || {};
      const probeResults = Array.isArray(probeResult.probes) ? probeResult.probes : [];
      if (probeResults.length) {
        effectiveRunOptions = Object.assign({}, effectiveRunOptions, {
          pluginCapabilityProbeResults: probeResults,
        });
        request = buildRunRequest(thread, userMessage, assistantMessage, effectiveRunOptions);
        wardrobeGate = evaluateWardrobeGate(request, userMessage, "after_plugin_probe", gatewayTarget);
        applyAssistantRunOptions(assistantMessage, request, effectiveRunOptions);
        applyWardrobeWorkflowGateMetadata(assistantMessage, wardrobeGate);
        appendPluginCapabilityProbeEvents(thread, assistantMessage, probeResults);
      }
      if (wardrobeGate.active && !wardrobeGate.ok) {
        return completeWardrobeWorkflowGateFailure(thread, assistantMessage, taskId, wardrobeGate);
      }
      appendRunStartEvent(thread, assistantMessage, "run.context_ready", contextReadyPreview(request));
    }
    const streamOptions = streamOptionsService.streamOptionsForGatewayTarget(gatewayTarget, runOptions, { gatewayUrl });
    const forcedModelFirstSelection = objectValue(effectiveRunOptions.modelFirstToolsetSelection, null);
    const forcedSelectedToolsets = dedupe(
      forcedModelFirstSelection?.selectedToolsets
      || forcedModelFirstSelection?.selected_toolsets
      || [],
    );
    const skipModelFirstSelector = Boolean(
      forcedSelectedToolsets.length
      && (
        effectiveRunOptions.skipModelFirstToolsetSelection
        || forcedModelFirstSelection?.skipSelector
        || forcedModelFirstSelection?.force
      ),
    );
    if (skipModelFirstSelector) {
      const selection = Object.assign({}, forcedModelFirstSelection, {
        enabled: true,
        ok: true,
        reason: cleanString(forcedModelFirstSelection.reason) || "forced_model_first_toolsets",
        selectedToolsets: forcedSelectedToolsets,
        authorizedToolsets: dedupe(forcedModelFirstSelection.authorizedToolsets || forcedModelFirstSelection.authorized_toolsets || forcedSelectedToolsets),
        durationMs: Math.max(0, Number(forcedModelFirstSelection.durationMs || forcedModelFirstSelection.duration_ms || 0) || 0),
      });
      request = appendToolsetEscalationInstructions(request, selection, forcedSelectedToolsets);
      request.toolsetRouting = request.runPolicy?.toolset_routing || request.toolsetRouting || toolsetSelectionRouting(selection, forcedSelectedToolsets);
      request.runPolicy = Object.assign({}, request.runPolicy || {}, { toolset_routing: request.toolsetRouting });
      request.body.access_policy_context = Object.assign({}, request.body.access_policy_context || {}, { toolset_routing: request.toolsetRouting });
      request.body.enabled_toolsets = dedupe(request.runPolicy?.allowed_toolsets || request.runPolicy?.allowedToolsets || request.body.enabled_toolsets || []);
      wardrobeGate = evaluateWardrobeGate(request, userMessage, "forced_toolset_selection", gatewayTarget);
      applyAssistantRunOptions(assistantMessage, request, effectiveRunOptions);
      applyWardrobeWorkflowGateMetadata(assistantMessage, wardrobeGate);
      appendRunStartEvent(thread, assistantMessage, "run.toolset_selection_done", toolsetSelectionPreview(selection, forcedSelectedToolsets));
    } else if (selectRunToolsetsWithModel && !isChatGptProRunOptions(effectiveRunOptions)) {
      appendRunStartEvent(thread, assistantMessage, "run.toolset_selection_started", "");
      let selection = null;
      try {
        selection = await selectRunToolsetsWithModel({
          thread,
          userMessage,
          assistantMessage,
          runOptions: effectiveRunOptions,
          request,
          gatewayTarget,
          taskId,
        });
      } catch (err) {
        selection = { enabled: true, ok: false, reason: "selector_exception", error: cleanString(err?.message || err) };
      }
      const rawSelectedToolsets = dedupe(selection?.selectedToolsets || selection?.selected_toolsets || []);
      const selectedToolsets = selection?.toolsetSelectionDisabled
        ? rawSelectedToolsets
        : expandSelectedToolsetsWithCompanions(rawSelectedToolsets, request?.runPolicy || {});
      if (selection?.enabled && selection.elevationRequired) {
        completeModelPermissionRequest(thread, assistantMessage, taskId, selection);
        return {
          run_id: taskId,
          status: "needs_elevation",
          engine: "responses",
          gatewayUrl,
          gatewayName: gatewayTarget?.name || "",
          gatewayProfile: gatewayTarget?.profile || "",
          gatewaySource: gatewayTarget?.source || "",
        };
      }
      if (selection?.enabled && selection.ok && selectedToolsets.length) {
        const routing = toolsetSelectionRouting(selection, selectedToolsets);
        const selectedRunOptions = Object.assign({}, effectiveRunOptions, {
          modelFirstToolsetSelection: {
            selectedToolsets,
            toolsetSelectionDisabled: Boolean(selection.toolsetSelectionDisabled),
            routing,
          },
        });
        request = appendToolsetEscalationInstructions(
          buildRunRequest(thread, userMessage, assistantMessage, selectedRunOptions),
          selection,
          selectedToolsets,
        );
        request.toolsetRouting = routing;
        request.runPolicy = Object.assign({}, request.runPolicy || {}, { toolset_routing: routing });
        request.body.access_policy_context = Object.assign({}, request.body.access_policy_context || {}, { toolset_routing: routing });
        request.body.enabled_toolsets = dedupe(request.runPolicy?.allowed_toolsets || request.runPolicy?.allowedToolsets || request.body.enabled_toolsets || []);
        wardrobeGate = evaluateWardrobeGate(request, userMessage, "after_toolset_selection", gatewayTarget);
        applyAssistantRunOptions(assistantMessage, request, selectedRunOptions);
        applyWardrobeWorkflowGateMetadata(assistantMessage, wardrobeGate);
        appendRunStartEvent(thread, assistantMessage, preflightResultEventName(selection, true), toolsetSelectionPreview(selection, selectedToolsets));
      } else if (selection?.enabled) {
        request = restoreAuthorizedToolsetsForSelectionFallback(request, selection || {});
        wardrobeGate = evaluateWardrobeGate(request, userMessage, "after_toolset_fallback", gatewayTarget);
        applyWardrobeWorkflowGateMetadata(assistantMessage, wardrobeGate);
        appendRunStartEvent(thread, assistantMessage, preflightResultEventName(selection, false), toolsetSelectionFallbackPreview(selection || {}));
      }
    }
    wardrobeGate = evaluateWardrobeGate(request, userMessage, "pre_stream", gatewayTarget, { appendInstructions: true });
    applyAssistantRunOptions(assistantMessage, request, effectiveRunOptions);
    applyWardrobeWorkflowGateMetadata(assistantMessage, wardrobeGate);
    if (wardrobeGate.active && !wardrobeGate.ok) {
      return completeWardrobeWorkflowGateFailure(thread, assistantMessage, taskId, wardrobeGate);
    }
    appendRunStartEvent(thread, assistantMessage, "run.request_sent", "等待模型或工具返回");
    request.body.enabled_toolsets = dedupe(request.runPolicy?.allowed_toolsets || request.runPolicy?.allowedToolsets || request.body.enabled_toolsets || []);
    saveState();
    streamResponse(taskId, thread.id, assistantMessage.id, request.body, streamOptions);
    return {
      run_id: taskId,
      status: "started",
      engine: "responses",
      gatewayUrl,
      gatewayName: gatewayTarget?.name || "",
      gatewayProfile: gatewayTarget?.profile || "",
      gatewaySource: gatewayTarget?.source || "",
    };
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
