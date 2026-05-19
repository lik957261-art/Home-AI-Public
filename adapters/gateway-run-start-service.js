"use strict";

const DEFAULT_TOOL_SCHEMA_EPOCH = "20260513-audio-file-v1";
const DEFAULT_SINGLE_WINDOW_PROJECT_ID = "single-window";
const DEFAULT_GROUP_CHAT_TASK_GROUP_ID = "group-chat";

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
  const makePublicTaskId = maybeCall(options.makePublicTaskId, () => `web_${Date.now()}`);
  const gatewaySkillRoutingForWorkspace = maybeCall(options.gatewaySkillRoutingForWorkspace, () => ({}));
  const chooseGatewayRunTarget = maybeCall(options.chooseGatewayRunTarget, async () => ({ apiBase: "" }));
  const addThreadActiveRun = maybeCall(options.addThreadActiveRun, () => {});
  const removeThreadActiveRun = maybeCall(options.removeThreadActiveRun, () => {});
  const saveState = maybeCall(options.saveState, () => {});
  const broadcast = maybeCall(options.broadcast, () => {});
  const compactMessage = maybeCall(options.compactMessage, (message) => message);
  const threadSummary = maybeCall(options.threadSummary, (thread) => thread);
  const streamResponse = maybeCall(options.streamResponse, () => null);

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
    const runPolicy = runOptions.access_policy_context && typeof runOptions.access_policy_context === "object"
      ? sanitizePolicy(mergeAccessPolicyOverride(basePolicy, runOptions.access_policy_context), policyHardeningOptions)
      : basePolicy;
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
      runOptions.instructions || "",
    ].filter(Boolean).join("\n\n");
    const body = {
      input: userMessage?.content,
      stream: true,
      store: true,
      conversation,
      conversation_history: buildConversationHistory(thread, userMessage?.id, runPolicy),
      instructions,
      access_policy_context: runPolicy,
    };
    if (runOptions.model) body.model = runOptions.model;
    if (runOptions.reasoning_effort) body.reasoning_effort = runOptions.reasoning_effort;
    if (runOptions.reasoning && typeof runOptions.reasoning === "object") body.reasoning = runOptions.reasoning;

    const gatewayRouting = Object.assign({}, requestedGatewayRouting, {
      purpose: "user_run",
      workspaceId: actorWorkspaceId,
      taskGroupId: userMessage?.taskGroupId || "",
      model: body.model || "",
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
      runPolicy,
      taskDirectory,
      toolSchemaEpoch,
      assistantMessage,
    };
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

    const request = buildRunRequest(thread, userMessage, assistantMessage, runOptions);
    const taskId = makePublicTaskId("web");
    assistantMessage.runOptions = Object.assign({}, assistantMessage.runOptions || {}, {
      access_policy_context: request.runPolicy,
      gatewayConversation: request.body.conversation,
      toolSchemaEpoch,
    });
    if (runOptions.searchSource) assistantMessage.runOptions.searchSource = cleanString(runOptions.searchSource);
    if (runOptions.sourceIntent) assistantMessage.runOptions.sourceIntent = cleanString(runOptions.sourceIntent);
    if (runOptions.sourceMode) assistantMessage.runOptions.sourceMode = cleanString(runOptions.sourceMode);

    const gatewayTarget = await chooseGatewayRunTarget(request.gatewayRouting);
    const { gatewayUrl } = applyStartedRunState(thread, assistantMessage, taskId, gatewayTarget, nowIso());
    saveState();
    broadcastMessageUpdated(thread, assistantMessage);
    streamResponse(taskId, thread.id, assistantMessage.id, request.body, {
      gatewayUrl,
      gatewayApiKey: gatewayTarget?.apiKey || "",
      gatewayName: gatewayTarget?.name || "",
      gatewayProfile: gatewayTarget?.profile || "",
      gatewaySource: gatewayTarget?.source || "",
    });
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
