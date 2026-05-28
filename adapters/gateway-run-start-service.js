"use strict";

const DEFAULT_TOOL_SCHEMA_EPOCH = "20260513-audio-file-v1";
const DEFAULT_SINGLE_WINDOW_PROJECT_ID = "single-window";
const DEFAULT_GROUP_CHAT_TASK_GROUP_ID = "group-chat";
const CHATGPT_PRO_MIN_WAIT_MS = 30 * 60 * 1000;

function cleanString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function defaultDedupe(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const text = cleanString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function objectValue(value, fallback = {}) {
  return value && typeof value === "object" ? value : fallback;
}

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

function isPlainProbeMessage(text = "") {
  const value = cleanString(text);
  if (!value || value.length > 40) return false;
  return /^(?:test|testing|ping|pong|hi|hello|hey|ok|okay|\u6d4b\u8bd5|\u4f60\u597d|\u6536\u5230|\u597d|\u597d\u7684|\u8c22\u8c22)[\s.!?,\u3002\uff01\uff1f\uff0c]*$/i.test(value);
}

function expandSelectedToolsetsWithCompanions(selectedToolsets = [], policy = {}) {
  const selected = defaultDedupe(selectedToolsets);
  const routing = objectValue(policy.toolset_routing || policy.toolsetRouting, {});
  const suggested = defaultDedupe(routing.suggested_toolsets || routing.suggestedToolsets || []);
  const allowed = new Set(defaultDedupe(policy.allowed_toolsets || policy.allowedToolsets || []));
  const selectedSet = new Set(selected);
  const wardrobeCompanions = ["wardrobe", "vision", "file"];
  const hasWardrobeCompanionSuggestion = wardrobeCompanions.every((toolset) => suggested.includes(toolset));
  const selectedAnyWardrobeCompanion = wardrobeCompanions.some((toolset) => selectedSet.has(toolset));
  if (!hasWardrobeCompanionSuggestion || !selectedAnyWardrobeCompanion) return selected;
  const companionSet = new Set(wardrobeCompanions.filter((toolset) => allowed.has(toolset)));
  const companionSelected = suggested.filter((toolset) => companionSet.has(toolset));
  const restSelected = selected.filter((toolset) => !companionSet.has(toolset));
  return defaultDedupe([...companionSelected, ...restSelected]);
}

function maybeCall(fn, fallback) {
  return typeof fn === "function" ? fn : fallback;
}

function resolveActorWorkspaceId(thread = {}, userMessage = {}, options = {}) {
  return cleanString(
    options.actorWorkspaceId || userMessage.senderWorkspaceId || thread.workspaceId || "owner",
    "owner",
  );
}

function policyThreadForRun(thread = {}, actorWorkspaceId = "owner", singleWindowProjectId = DEFAULT_SINGLE_WINDOW_PROJECT_ID) {
  const workspaceId = cleanString(actorWorkspaceId, "owner");
  if (workspaceId === cleanString(thread.workspaceId)) return thread;
  return Object.assign({}, thread, {
    workspaceId,
    projectId: singleWindowProjectId,
    subprojectId: "",
  });
}

function createGatewayRunStartService(options = {}) {
  const singleWindowProjectId = cleanString(options.singleWindowProjectId, DEFAULT_SINGLE_WINDOW_PROJECT_ID);
  const groupChatTaskGroupId = cleanString(options.groupChatTaskGroupId, DEFAULT_GROUP_CHAT_TASK_GROUP_ID);
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
  const nowMs = maybeCall(options.nowMs, () => Date.now());
  const runWebSearchMaxCalls = Math.max(0, Math.floor(Number(options.runWebSearchMaxCalls) || 0));
  const runExplicitWebSearchMaxCalls = Math.max(0, Math.floor(Number(options.runExplicitWebSearchMaxCalls) || 0));

  function buildGroupChatRunContext(thread, userMessage, policy) {
    const deliveryRoot = thread?.singleWindow && cleanString(userMessage?.taskGroupId) === groupChatTaskGroupId
      ? cleanString(groupChatDeliveryRootForThread(thread))
      : "";
    if (!deliveryRoot) {
      return {
        groupChatAttachmentCopies: [],
        groupChatDeliveryRoot: "",
        groupChatDeliveryRootForModel: "",
        policy,
      };
    }

    const deliveryRootForModel = cleanString(windowsPathToWsl(deliveryRoot));
    const attachmentCopies = ensureGroupChatSharedArtifactCopies(thread, userMessage, deliveryRoot);
    mkdirSync(deliveryRoot, { recursive: true });
    const roots = [deliveryRootForModel, deliveryRoot].filter(Boolean);
    return {
      groupChatAttachmentCopies: Array.isArray(attachmentCopies) ? attachmentCopies : [],
      groupChatDeliveryRoot: deliveryRoot,
      groupChatDeliveryRootForModel: deliveryRootForModel,
      policy: Object.assign({}, policy, {
        allowed_roots: dedupe([...(policy.allowed_roots || []), ...roots]),
        delivery_roots: dedupe([...(policy.delivery_roots || []), ...roots]),
        cache_roots: dedupe([...(policy.cache_roots || []), ...roots]),
      }),
    };
  }

  function buildRunRequest(thread, userMessage, assistantMessage, runOptions = {}) {
    const actorWorkspaceId = resolveActorWorkspaceId(thread, userMessage, runOptions);
    const requestedGatewayRouting = Object.assign({}, objectValue(runOptions.gatewayRouting));
    const policyHardeningOptions = accessPolicyHardeningOptionsForGatewayRouting(requestedGatewayRouting);
    const policyThread = policyThreadForRun(thread, actorWorkspaceId, singleWindowProjectId);
    const taskDirectory = taskDirectoryAttachmentForMessage(thread, userMessage);
    const project = taskDirectory
      ? projectForTaskDirectoryAttachment(thread, taskDirectory)
      : effectiveProjectForThread(policyThread);
    const workspace = findWorkspace(actorWorkspaceId);
    const routePolicy = workspace?.policy || workspace || {};
    let basePolicy = buildAccessPolicy(routePolicy, {}, project, policyHardeningOptions);
    const groupChat = buildGroupChatRunContext(thread, userMessage, objectValue(basePolicy));
    basePolicy = sanitizePolicy(groupChat.policy, policyHardeningOptions);
    let runPolicy = runOptions.access_policy_context && typeof runOptions.access_policy_context === "object"
      ? sanitizePolicy(mergeAccessPolicyOverride(basePolicy, runOptions.access_policy_context), policyHardeningOptions)
      : basePolicy;
    const routedPolicy = routeRunToolsets({
      policy: runPolicy,
      thread,
      policyThread,
      userMessage,
      assistantMessage,
      runOptions,
      project,
      taskDirectory,
      groupChat,
      policyHardeningOptions,
    }) || {};
    runPolicy = sanitizePolicy(objectValue(routedPolicy.policy, runPolicy), policyHardeningOptions);
    const modelFirstSelection = objectValue(runOptions.modelFirstToolsetSelection, null);
    const modelFirstToolsets = expandSelectedToolsetsWithCompanions(
      dedupe(modelFirstSelection?.selectedToolsets || modelFirstSelection?.selected_toolsets || []),
      runPolicy,
    );
    if (modelFirstToolsets.length) {
      runPolicy = sanitizePolicy(Object.assign({}, runPolicy, {
        allowed_toolsets: modelFirstToolsets,
        toolset_routing: modelFirstSelection.routing || {
          mode: "model_first",
          reason: "model_selected",
          selected_toolsets: modelFirstToolsets,
        },
      }), policyHardeningOptions);
    }
    const conversation = gatewayConversationId(thread, userMessage, runPolicy);
    const instructions = [
      buildHermesInstructions(
        policyThread,
        runPolicy,
        project,
        userMessage?.content,
        taskDirectory,
        Object.assign({}, runOptions, {
          groupChatDeliveryRoot: groupChat.groupChatDeliveryRootForModel,
          groupChatAttachmentCopies: groupChat.groupChatAttachmentCopies,
        }),
      ),
      isPlainProbeMessage(userMessage?.content)
        ? "Latest-message override: the newest user message is only a ping, greeting, acknowledgement, or plain test. Answer it briefly from current state. Do not infer a previous tool/search intent from conversation history and do not call tools unless the newest message explicitly asks for a tool-backed action."
        : "",
      runOptions.instructions || "",
    ].filter(Boolean).join("\n\n");
    const conversationHistory = buildConversationHistory(thread, userMessage?.id, runPolicy);
    const body = {
      input: userMessage?.content,
      stream: true,
      store: true,
      conversation,
      conversation_history: conversationHistory,
      instructions,
      access_policy_context: runPolicy,
    };
    if (runOptions.model) body.model = runOptions.model;
    if (runOptions.provider) body.provider = runOptions.provider;
    if (runOptions.reasoning_effort) body.reasoning_effort = runOptions.reasoning_effort;
    if (runOptions.reasoning && typeof runOptions.reasoning === "object") body.reasoning = runOptions.reasoning;

    const gatewayRouting = Object.assign({}, requestedGatewayRouting, {
      purpose: "user_run",
      workspaceId: actorWorkspaceId,
      taskGroupId: userMessage?.taskGroupId || "",
      model: body.model || "",
      provider: body.provider || "",
      reasoning_effort: body.reasoning_effort || "",
    });
    if (runOptions.searchSource) gatewayRouting.searchSource = cleanString(runOptions.searchSource);
    if (runOptions.sourceIntent) gatewayRouting.sourceIntent = cleanString(runOptions.sourceIntent);
    if (runOptions.sourceMode) gatewayRouting.sourceMode = cleanString(runOptions.sourceMode);
    Object.assign(gatewayRouting, gatewaySkillRoutingForWorkspace(actorWorkspaceId, gatewayRouting));

    return {
      actorWorkspaceId,
      body,
      gatewayRouting,
      groupChat,
      policyHardeningOptions,
      policyThread,
      project,
      requestedGatewayRouting,
      toolsetRouting: runPolicy.toolset_routing || routedPolicy.routing || null,
      runPolicy,
      taskDirectory,
      toolSchemaEpoch,
      assistantMessage,
      conversationHistorySummary: summarizeConversationHistory(conversationHistory),
    };
  }

  function summarizeConversationHistory(messages = []) {
    const items = Array.isArray(messages) ? messages : [];
    return {
      messageCount: items.length,
      estimatedChars: items.reduce((sum, item) => sum + String(item?.content || "").length, 0),
    };
  }

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
      mode: "model_first",
      reason: cleanString(selection.reason) || "model_selected",
      selected_toolsets: selected,
      omitted_authorized_toolsets: omitted,
      authorized_toolset_count: Math.max(0, Number(selection.authorizedToolsets?.length || 0) || 0),
      duration_ms: Math.max(0, Number(selection.durationMs || 0) || 0),
    };
  }

  function toolsetSelectionPreview(selection = {}, selectedToolsets = []) {
    return JSON.stringify({
      selected_toolsets: dedupe(selectedToolsets),
      duration_ms: Math.max(0, Number(selection.durationMs || 0) || 0),
      reason: cleanString(selection.reason) || "model_selected",
    });
  }

  function toolsetSelectionFallbackPreview(selection = {}) {
    return JSON.stringify({
      reason: cleanString(selection.reason) || "fallback_full_toolsets",
      duration_ms: Math.max(0, Number(selection.durationMs || 0) || 0),
    });
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
    saveState();
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
    if (request.toolsetRouting) assistantMessage.runOptions.toolsetRouting = request.toolsetRouting;
    if (sourceRunOptions.searchSource) assistantMessage.runOptions.searchSource = cleanString(sourceRunOptions.searchSource);
    if (sourceRunOptions.sourceIntent) assistantMessage.runOptions.sourceIntent = cleanString(sourceRunOptions.sourceIntent);
    if (sourceRunOptions.sourceMode) assistantMessage.runOptions.sourceMode = cleanString(sourceRunOptions.sourceMode);
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
    addThreadActiveRun(thread, taskId);
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

    let request = buildRunRequest(thread, userMessage, assistantMessage, runOptions);
    const taskId = makePublicTaskId("web");
    applyAssistantRunOptions(assistantMessage, request, runOptions);

    const gatewayTarget = await chooseGatewayRunTarget(request.gatewayRouting);
    const { gatewayUrl } = applyStartedRunState(thread, assistantMessage, taskId, gatewayTarget, nowIso());
    assistantMessage.model = cleanString(request.body.model || request.gatewayRouting.model || gatewayTarget?.model || gatewayTarget?.defaultModel);
    assistantMessage.modelProvider = cleanString(request.body.provider || request.gatewayRouting.provider || gatewayTarget?.provider);
    if (!assistantMessage.reasoningEffort) {
      assistantMessage.reasoningEffort = cleanString(request.body.reasoning_effort || request.gatewayRouting.reasoning_effort);
    }
    saveState();
    broadcastMessageUpdated(thread, assistantMessage);
    appendRunStartEvent(thread, assistantMessage, "run.context_ready", contextReadyPreview(request));
    appendRunStartEvent(thread, assistantMessage, "run.gateway_selected", gatewaySelectedPreview(gatewayTarget, request));
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
    const forcedModelFirstSelection = objectValue(runOptions.modelFirstToolsetSelection, null);
    const forcedSelectedToolsets = dedupe(
      forcedModelFirstSelection?.selectedToolsets
      || forcedModelFirstSelection?.selected_toolsets
      || [],
    );
    const skipModelFirstSelector = Boolean(
      forcedSelectedToolsets.length
      && (
        runOptions.skipModelFirstToolsetSelection
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
      applyAssistantRunOptions(assistantMessage, request, runOptions);
      appendRunStartEvent(thread, assistantMessage, "run.toolset_selection_done", toolsetSelectionPreview(selection, forcedSelectedToolsets));
    } else if (selectRunToolsetsWithModel && !isChatGptProRunOptions(runOptions)) {
      appendRunStartEvent(thread, assistantMessage, "run.toolset_selection_started", "");
      let selection = null;
      try {
        selection = await selectRunToolsetsWithModel({
          thread,
          userMessage,
          assistantMessage,
          runOptions,
          request,
          gatewayTarget,
          taskId,
        });
      } catch (err) {
        selection = { enabled: true, ok: false, reason: "selector_exception", error: cleanString(err?.message || err) };
      }
      const rawSelectedToolsets = dedupe(selection?.selectedToolsets || selection?.selected_toolsets || []);
      const selectedToolsets = expandSelectedToolsetsWithCompanions(rawSelectedToolsets, request?.runPolicy || {});
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
        const selectedRunOptions = Object.assign({}, runOptions, {
          modelFirstToolsetSelection: {
            selectedToolsets,
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
        applyAssistantRunOptions(assistantMessage, request, selectedRunOptions);
        appendRunStartEvent(thread, assistantMessage, "run.toolset_selection_done", toolsetSelectionPreview(selection, selectedToolsets));
      } else if (selection?.enabled) {
        appendRunStartEvent(thread, assistantMessage, "run.toolset_selection_failed", toolsetSelectionFallbackPreview(selection || {}));
      }
    }
    appendRunStartEvent(thread, assistantMessage, "run.request_sent", "等待模型或工具返回");
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
    assistantMessage.error = err?.message || String(err || "");
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
