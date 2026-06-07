"use strict";

const { createPluginCapabilityProbeService } = require("./plugin-capability-probe-service");
const { gatewayRunUserFacingError } = require("./gateway-run-error-message-service");
const {
  cleanString,
  createGatewayRunRequestBuilderService,
  defaultDedupe,
  expandSelectedToolsetsWithCompanions,
  mergeSkillEntries,
  objectValue,
  policyThreadForRun,
  resolveActorWorkspaceId,
  skillPreloadRunOptionsMetadata,
} = require("./gateway-run-request-builder-service");
const { evaluateWardrobeOutfitWorkflowGate } = require("./wardrobe-outfit-workflow-gate-service");

const DEFAULT_TOOL_SCHEMA_EPOCH = "20260513-audio-file-v1";
const CHATGPT_PRO_MIN_WAIT_MS = 30 * 60 * 1000;

function isChatGptProRunOptions(runOptions = {}) {
  const text = [
    runOptions.requiredTool,
    runOptions.elevationScope,
    runOptions.sourceIntent,
    runOptions.provider,
  ].map((value) => cleanString(value).toLowerCase()).join(" ");
  return text.includes("chatgpt_pro_generate");
}

function isExplicitWebSearchRunOptions(runOptions = {}) {
  const text = [
    runOptions.searchSource,
    runOptions.search_source,
    runOptions.sourceIntent,
    runOptions.source_intent,
  ].map((value) => cleanString(value).toLowerCase()).join(" ");
  return /\b(web|web_search|search|x|x_search)\b/.test(text);
}

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
  const runWebSearchMaxCalls = Math.max(0, Math.floor(Number(options.runWebSearchMaxCalls) || 0));
  const runExplicitWebSearchMaxCalls = Math.max(0, Math.floor(Number(options.runExplicitWebSearchMaxCalls) || 0));
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

  function appendRunStartEvent(thread, assistantMessage, eventName, preview) {
    const runId = cleanString(assistantMessage?.runId || assistantMessage?.taskId);
    if (!thread || !runId) return;
    addThreadEvent(thread, {
      event: eventName,
      timestamp: nowMs() / 1000,
      runId,
      tool: "hermes_mobile",
      preview,
      error: false,
    });
    broadcast({
      type: "run.event",
      threadId: thread.id,
      runId,
      event: thread.events?.[thread.events.length - 1],
      thread: threadSummary(thread),
    });
  }

  function appendGatewaySchedulerEvent(thread, runId, event = {}) {
    const eventName = cleanString(event.event || "");
    const id = cleanString(runId || event.runId || event.run_id);
    if (!thread || !id || !eventName.startsWith("run.gateway_worker_")) return;
    const preview = JSON.stringify({
      reason: cleanString(event.reason),
      profileId: cleanString(event.profileId || event.profile || event.workerId),
      provider: cleanString(event.provider),
      workspaceId: cleanString(event.workspaceId),
      permissionTier: cleanString(event.permissionTier),
      state: cleanString(event.state),
      queueDepth: Math.max(0, Number(event.queueDepth || 0) || 0),
      warmUntil: cleanString(event.warmUntil),
      idleExpiresAt: cleanString(event.idleExpiresAt),
      lastStartDurationMs: Math.max(0, Number(event.lastStartDurationMs || 0) || 0),
      failureCode: cleanString(event.failureCode || event.lastFailureCode),
      diagnostic: cleanString(event.diagnostic).slice(0, 160),
    });
    addThreadEvent(thread, {
      event: eventName,
      timestamp: Number(event.timestampMs || 0) > 0 ? Number(event.timestampMs) / 1000 : nowMs() / 1000,
      runId: id,
      tool: "hermes_mobile",
      preview,
      error: Boolean(event.error || eventName.endsWith("_failed")),
    });
    broadcast({
      type: "run.event",
      threadId: thread.id,
      runId: id,
      event: thread.events?.[thread.events.length - 1],
      thread: threadSummary(thread),
    });
  }

  function appendPluginCapabilityProbeEvents(thread, assistantMessage, probeResults = []) {
    const runId = cleanString(assistantMessage?.runId || assistantMessage?.taskId);
    if (!thread || !runId) return;
    for (const item of Array.isArray(probeResults) ? probeResults : []) {
      const pluginId = cleanString(item?.pluginId || item?.plugin_id);
      const toolset = cleanString(item?.toolset);
      if (!pluginId || !toolset) continue;
      const ok = item.ok === true || cleanString(item.status).toLowerCase() === "activated";
      addThreadEvent(thread, {
        event: ok ? "plugin_capability_activated" : "plugin_capability_unavailable",
        timestamp: nowMs() / 1000,
        runId,
        tool: "plugin_capability",
        preview: JSON.stringify({
          pluginId,
          toolset,
          status: ok ? "activated" : "unavailable",
          diagnostic: cleanString(item.diagnostic).slice(0, 120),
          evidence: cleanString(item.evidence).slice(0, 80),
          gatewayProfile: cleanString(item.gatewayProfile || item.gateway_profile).slice(0, 80),
          duration_ms: Math.max(0, Number(item.durationMs || item.duration_ms || 0) || 0),
        }),
        error: !ok,
      });
      broadcast({
        type: "run.event",
        threadId: thread.id,
        runId,
        event: thread.events?.[thread.events.length - 1],
        thread: threadSummary(thread),
      });
    }
  }

  function contextReadyPreview(request = {}) {
    const summary = request.conversationHistorySummary || {};
    const count = Math.max(0, Number(summary.messageCount || 0) || 0);
    const chars = Math.max(0, Number(summary.estimatedChars || 0) || 0);
    return `上下文 ${count} 条，约 ${chars} 字`;
  }

  function gatewaySelectedPreview(gatewayTarget = {}, request = {}) {
    const parts = [
      cleanString(gatewayTarget?.profile || gatewayTarget?.name),
      cleanString(request?.body?.model || gatewayTarget?.model || gatewayTarget?.defaultModel),
      cleanString(request?.body?.provider || gatewayTarget?.provider),
    ].filter(Boolean);
    return parts.join(" · ");
  }

  function toolsetSelectionRouting(selection = {}, selectedToolsets = []) {
    const selected = dedupe(selectedToolsets);
    const authorized = dedupe(selection.authorizedToolsets || []);
    const omitted = authorized.filter((item) => !selected.includes(item));
    return {
      mode: selection.toolsetSelectionDisabled ? "permission_preflight" : "model_first",
      reason: cleanString(selection.reason) || "model_selected",
      selected_toolsets: selected,
      omitted_authorized_toolsets: omitted,
      authorized_toolset_count: Math.max(0, Number(selection.authorizedToolsets?.length || 0) || 0),
      duration_ms: Math.max(0, Number(selection.durationMs || 0) || 0),
      toolset_selection_disabled: Boolean(selection.toolsetSelectionDisabled),
    };
  }

  function toolsetSelectionPreview(selection = {}, selectedToolsets = []) {
    return JSON.stringify({
      selected_toolsets: dedupe(selectedToolsets),
      duration_ms: Math.max(0, Number(selection.durationMs || 0) || 0),
      reason: cleanString(selection.reason) || "model_selected",
      toolset_selection_disabled: Boolean(selection.toolsetSelectionDisabled),
    });
  }

  function toolsetSelectionFallbackPreview(selection = {}) {
    return JSON.stringify({
      reason: cleanString(selection.reason) || "fallback_full_toolsets",
      duration_ms: Math.max(0, Number(selection.durationMs || 0) || 0),
      error: cleanString(selection.error).slice(0, 180),
    });
  }

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

  function preflightResultEventName(selection = {}, ok = false) {
    if (selection?.toolsetSelectionDisabled || cleanString(selection?.mode) === "permission_preflight") {
      return ok ? "run.permission_preflight_done" : "run.permission_preflight_fallback";
    }
    return ok ? "run.toolset_selection_done" : "run.toolset_selection_failed";
  }

  function permissionSelectionPreview(selection = {}) {
    return JSON.stringify({
      scope: cleanString(selection.elevationScope || selection.elevation_scope || "owner_high_privilege"),
      reason: cleanString(selection.elevationReason || selection.reason || "permission_approval_required"),
      duration_ms: Math.max(0, Number(selection.durationMs || 0) || 0),
    });
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

  function applyAssistantRunOptions(assistantMessage, request, sourceRunOptions = {}) {
    assistantMessage.runOptions = Object.assign({}, assistantMessage.runOptions || {}, {
      access_policy_context: request.runPolicy,
      gatewayConversation: request.body.conversation,
      toolSchemaEpoch,
    });
    const preloadMetadata = skillPreloadRunOptionsMetadata(request.requiredSkillPreloads);
    if (preloadMetadata.length) {
      assistantMessage.runOptions.requiredSkillPreloads = preloadMetadata;
      assistantMessage.loadedSkills = mergeSkillEntries(assistantMessage.loadedSkills, preloadMetadata);
    }
    if (request.pluginCapabilityContext) {
      assistantMessage.runOptions.activeSchemaSet = request.pluginCapabilityContext.activeSchemaSet;
      assistantMessage.runOptions.pluginCapabilityCatalog = request.pluginCapabilityContext.catalog;
      if (request.pluginCapabilityContext.probeResults?.length) {
        assistantMessage.runOptions.pluginCapabilityProbeResults = request.pluginCapabilityContext.probeResults;
      }
    }
    if (request.toolsetRouting) assistantMessage.runOptions.toolsetRouting = request.toolsetRouting;
    if (sourceRunOptions.searchSource) assistantMessage.runOptions.searchSource = cleanString(sourceRunOptions.searchSource);
    if (sourceRunOptions.sourceIntent) assistantMessage.runOptions.sourceIntent = cleanString(sourceRunOptions.sourceIntent);
    if (sourceRunOptions.sourceMode) assistantMessage.runOptions.sourceMode = cleanString(sourceRunOptions.sourceMode);
  }

  function appendRequiredSkillPreloadEvents(thread, assistantMessage, request = {}) {
    const metadata = skillPreloadRunOptionsMetadata(request.requiredSkillPreloads);
    if (!metadata.length) return;
    const runId = cleanString(assistantMessage?.runId || assistantMessage?.taskId);
    if (!thread || !runId) return;
    for (const item of metadata.filter((entry) => !entry.missing)) {
      addThreadEvent(thread, {
        event: "run.skill_preloaded",
        timestamp: nowMs() / 1000,
        runId,
        tool: "skill_view",
        preview: JSON.stringify({ name: item.path, source: "required_preload" }),
        error: false,
      });
    }
    broadcast({ type: "thread.updated", thread: threadSummary(thread) });
  }

  function applyWardrobeWorkflowGateMetadata(assistantMessage, gate = {}) {
    if (!gate?.active) return;
    assistantMessage.runOptions = Object.assign({}, assistantMessage.runOptions || {}, {
      wardrobeOutfitWorkflowGate: gate.runOptionsMetadata || null,
    });
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

  function ensureActiveRun(thread, taskId) {
    const id = cleanString(taskId);
    if (!id) return;
    const activeRunIds = Array.isArray(thread?.activeRunIds) ? thread.activeRunIds.map(cleanString) : [];
    if (!activeRunIds.includes(id)) {
      addThreadActiveRun(thread, id);
    } else {
      thread.activeRunId = id;
    }
  }

  function applyPreparingRunState(thread, assistantMessage, taskId, startedAt = nowIso()) {
    assistantMessage.runId = taskId;
    assistantMessage.taskId = taskId;
    assistantMessage.status = "running";
    assistantMessage.startedAt = assistantMessage.startedAt || startedAt;
    assistantMessage.updatedAt = startedAt;
    ensureActiveRun(thread, taskId);
    thread.status = "running";
    thread.updatedAt = startedAt;
    return { startedAt };
  }

  function applyStartedRunState(thread, assistantMessage, taskId, gatewayTarget, startedAt = nowIso()) {
    const gatewayUrl = cleanString(gatewayTarget?.apiBase);
    assistantMessage.runId = taskId;
    assistantMessage.taskId = taskId;
    assistantMessage.gatewayUrl = gatewayUrl;
    assistantMessage.gatewayName = cleanString(gatewayTarget?.name);
    assistantMessage.gatewayProfile = cleanString(gatewayTarget?.profile);
    assistantMessage.gatewaySource = cleanString(gatewayTarget?.source);
    assistantMessage.status = "running";
    assistantMessage.startedAt = assistantMessage.startedAt || startedAt;
    assistantMessage.updatedAt = startedAt;
    ensureActiveRun(thread, taskId);
    thread.status = "running";
    thread.updatedAt = startedAt;
    return { gatewayUrl, startedAt };
  }

  function broadcastMessageUpdated(thread, assistantMessage) {
    broadcast({
      type: "message.updated",
      threadId: thread.id,
      message: compactMessage(assistantMessage),
      thread: threadSummary(thread),
    });
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
    const streamOptions = {
      gatewayUrl,
      gatewayApiKey: gatewayTarget?.apiKey || "",
      gatewayName: gatewayTarget?.name || "",
      gatewayProfile: gatewayTarget?.profile || "",
      gatewaySource: gatewayTarget?.source || "",
    };
    if (runExplicitWebSearchMaxCalls > 0 && isExplicitWebSearchRunOptions(runOptions)) {
      streamOptions.webSearchMaxCalls = runExplicitWebSearchMaxCalls;
    } else if (runWebSearchMaxCalls > 0) {
      streamOptions.webSearchMaxCalls = runWebSearchMaxCalls;
    }
    if (isChatGptProRunOptions(runOptions)) {
      streamOptions.runStartTimeoutMs = CHATGPT_PRO_MIN_WAIT_MS;
      streamOptions.runLivenessCheckAfterMs = CHATGPT_PRO_MIN_WAIT_MS;
      streamOptions.runLivenessStaleAfterMs = 0;
      streamOptions.modelFirstByteWarningMs = CHATGPT_PRO_MIN_WAIT_MS;
    }
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

  function markStartFailed(thread, assistantMessage, err, options = {}) {
    const failedAt = nowIso();
    const runId = cleanString(options.runId || assistantMessage?.runId);
    assistantMessage.status = "failed";
    assistantMessage.error = gatewayRunUserFacingError(err);
    if (options.content) assistantMessage.content = cleanString(options.content);
    assistantMessage.failedAt = failedAt;
    assistantMessage.updatedAt = failedAt;
    removeThreadActiveRun(thread, runId, "failed");
    thread.updatedAt = failedAt;
    saveState();
    broadcast({
      type: "run.failed",
      threadId: thread.id,
      runId,
      message: compactMessage(assistantMessage),
      thread: threadSummary(thread),
    });
    return { status: "failed", runId, failedAt, error: assistantMessage.error };
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
