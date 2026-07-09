"use strict";

const COMPOSER_SEND_TIMEOUT_MS = 30000;
const CHAT_COMPOSER_SEND_PIPELINE_MODEL_ESM_PATH = "/vite-islands/chat-composer-send-pipeline-model/chat-composer-send-pipeline-model.js";
let chatComposerSendPipelineModel = null;
let chatComposerSendPipelineModelPromise = null;

function importChatComposerSendPipelineModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (chatComposerSendPipelineModel) return Promise.resolve(chatComposerSendPipelineModel);
  if (!chatComposerSendPipelineModelPromise) {
    const importer = typeof rootRef.__homeAiImportComposerSendPipelineModel === "function"
      ? rootRef.__homeAiImportComposerSendPipelineModel
      : (path) => import(path);
    chatComposerSendPipelineModelPromise = Promise.resolve()
      .then(() => importer(CHAT_COMPOSER_SEND_PIPELINE_MODEL_ESM_PATH))
      .then((model) => {
        chatComposerSendPipelineModel = model || null;
        return chatComposerSendPipelineModel;
      })
      .catch((error) => {
        chatComposerSendPipelineModelPromise = null;
        throw error;
      });
  }
  return chatComposerSendPipelineModelPromise;
}

function currentChatComposerSendPipelineModel() {
  return chatComposerSendPipelineModel;
}

importChatComposerSendPipelineModel().catch(() => null);

function currentClientNotificationChannel() {
  try {
    const root = typeof document !== "undefined" ? document.documentElement : null;
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search || "") : null;
    const input = {
      nativeShellQuery: params?.get("nativeShell") || "",
      documentNativeShell: root?.dataset?.nativeShell || "",
      documentNativeShellClass: root?.classList?.contains("native-shell-ios") === true,
      storageNativeShell: typeof localStorage !== "undefined" ? localStorage.getItem("homeAI.nativeShell") : "",
    };
    const model = currentChatComposerSendPipelineModel();
    if (typeof model?.composerClientNotificationChannel === "function") {
      return model.composerClientNotificationChannel(input);
    }
    return input.nativeShellQuery === "ios"
      || input.documentNativeShell === "ios"
      || input.documentNativeShellClass
      || input.storageNativeShell === "ios"
      ? "native_ios_apns"
      : "web_push";
  } catch (_) {
    return "web_push";
  }
}

function classicComposerSendRequestPlan(input = {}) {
  const model = currentChatComposerSendPipelineModel();
  if (typeof model?.createClassicComposerSendRequestPlan === "function") {
    return model.createClassicComposerSendRequestPlan(input);
  }
  const body = {
    text: input.text,
    artifacts: input.pendingArtifacts,
    workspaceId: input.workspaceId,
    notificationChannel: input.notificationChannel,
  };
  if (input.searchSourceFields) Object.assign(body, input.searchSourceFields);
  const ownerModelElevationRequired = Boolean(input.ownerModelElevationRequired ?? input.aiMention?.ownerElevationRequired ?? input.chatGptProRequested);
  const ownerModelOnceApproved = Boolean(input.ownerModelOnceApproved || input.chatGptProOnceApproved) && ownerModelElevationRequired;
  if (input.ownerElevationActive || input.ownerElevationOnceTag || ownerModelOnceApproved) {
    body.maintenanceMode = true;
    body.maintenance_mode = true;
    body.elevationScope = input.chatGptProRequested ? "chatgpt_pro_generate" : "owner_high_privilege";
    if (input.ownerElevationOnceTag || ownerModelOnceApproved) {
      body.ownerElevationOnceToken = input.ownerElevationOnceToken;
    }
  }
  if (input.chatGptProRequested) {
    body.chatGptProGenerate = true;
    body.chatgpt_pro_generate = true;
    body.requiredTool = "chatgpt_pro_generate";
  }
  if (input.viewMode === "single") {
    body.singleWindowMode = input.singleWindowMode === "chat" ? "chat" : "task";
    if (input.singleWindowMode === "chat") {
      body.taskGroupId = input.groupChatView
        ? input.singleWindowGroupChatTaskGroupId
        : input.singleWindowChatTaskGroupId;
      body.messageLimit = input.chatMessageInitialLimit;
    } else if (input.currentTaskGroupId) {
      body.taskGroupId = input.currentTaskGroupId;
      body.messageLimit = input.taskDetailMessageInitialLimit;
    }
    if (input.groupChatView) body.messageKind = input.aiMention?.mentionsAi ? "ai" : "plain";
  }
  if (input.viewMode === "tasks" && input.currentTaskGroupId) {
    body.taskGroupId = input.currentTaskGroupId;
    if (input.pluginTopicDirectory?.projectId) body.directory = input.pluginTopicDirectory;
    if (input.pluginTopicInstruction) body.instructions = [body.instructions || "", input.pluginTopicInstruction].filter(Boolean).join("\n\n");
    if (input.sharedTopicGroup) {
      body.singleWindowMode = "chat";
      body.messageKind = input.aiMention?.mentionsAi ? "ai" : "plain";
      body.messageLimit = input.taskDetailMessageInitialLimit;
    }
  }
  if (input.reasoningEffort) body.reasoning_effort = input.reasoningEffort;
  if (input.model) body.model = input.model;
  if (input.provider) body.provider = input.provider;
  if (input.environmentContext) body.environmentContext = input.environmentContext;
  if (input.quotedReply) {
    body.taskGroupId = input.quotedReply.taskGroupId;
    body.replyToMessageId = input.quotedReply.messageId;
  }
  const createsNewTask = input.viewMode === "tasks" && !body.taskGroupId;
  const consumedPendingDirectory = input.directoryTopicDraftSend && Boolean(input.pendingTaskDirectory?.projectId);
  if (createsNewTask && input.pendingTaskDirectory?.projectId) body.directory = input.pendingTaskDirectory;
  return {
    body,
    createsNewTask,
    consumedPendingDirectory,
    serializedBody: JSON.stringify(body),
  };
}

function classicElevatedComposerSendBodyPlan(input = {}) {
  const model = currentChatComposerSendPipelineModel();
  if (typeof model?.createElevatedRetryBody === "function") return model.createElevatedRetryBody(input);
  const requestBody = input.requestBody || {};
  const elevatedBody = Object.assign({}, requestBody, {
    maintenanceMode: true,
    maintenance_mode: true,
    elevationScope: input.elevationScope || "shared_skill_write",
  });
  if (requestBody.chatGptProGenerate || requestBody.chatgpt_pro_generate) {
    elevatedBody.elevationScope = "chatgpt_pro_generate";
  }
  if (input.ownerElevationOnceToken) elevatedBody.ownerElevationOnceToken = input.ownerElevationOnceToken;
  return {
    body: elevatedBody,
    serializedBody: JSON.stringify(elevatedBody),
  };
}

function composerSendPipelinePlanInput(input = {}) {
  const taskDetailLimit = typeof taskDetailMessageInitialLimit === "function" ? taskDetailMessageInitialLimit() : 30;
  const groupChatView = isGroupChatView();
  let sharedTopicGroup = null;
  let pluginTopicDirectory = null;
  let pluginTopicInstructionValue = "";
  if (state.viewMode === "tasks" && state.currentTaskGroupId) {
    sharedTopicGroup = typeof selectedSharedTopicGroup === "function" ? selectedSharedTopicGroup() : null;
    const pluginTopicDef = typeof pluginTopicDefForGroupId === "function"
      ? pluginTopicDefForGroupId(state.currentTaskGroupId)
      : null;
    if (pluginTopicDef) {
      pluginTopicDirectory = typeof pluginTopicDeliveryAttachment === "function" ? pluginTopicDeliveryAttachment(pluginTopicDef) : null;
      pluginTopicInstructionValue = typeof pluginTopicInstruction === "function" ? pluginTopicInstruction(pluginTopicDef) : "";
    }
  }
  return {
    text: input.text,
    pendingArtifacts: state.pendingArtifacts,
    workspaceId: state.selectedWorkspaceId,
    notificationChannel: input.notificationChannel || currentClientNotificationChannel(),
    searchSourceFields: input.searchSourceFields,
    aiMention: input.aiMention,
    chatGptProRequested: input.chatGptProRequested,
    ownerModelElevationRequired: input.ownerModelElevationRequired,
    ownerModelOnceApproved: input.ownerModelOnceApproved,
    ownerElevationActive: ownerElevationActive(),
    ownerElevationOnceTag: Boolean(input.ownerElevationOnceTag),
    chatGptProOnceApproved: Boolean(input.chatGptProOnceApproved),
    ownerElevationOnceToken: state.ownerElevationOnceToken,
    viewMode: state.viewMode,
    singleWindowMode: state.singleWindowMode,
    currentTaskGroupId: state.currentTaskGroupId,
    groupChatView,
    singleWindowGroupChatTaskGroupId: SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID,
    singleWindowChatTaskGroupId: SINGLE_WINDOW_CHAT_TASK_GROUP_ID,
    chatMessageInitialLimit: CHAT_MESSAGE_INITIAL_LIMIT,
    taskDetailMessageInitialLimit: taskDetailLimit,
    pluginTopicDirectory,
    pluginTopicInstruction: pluginTopicInstructionValue,
    sharedTopicGroup,
    reasoningEffort: input.reasoningEffort,
    model: input.model,
    provider: input.provider,
    environmentContext: input.environmentContext,
    quotedReply: input.quotedReply,
    directoryTopicDraftSend: input.directoryTopicDraftSend,
    pendingTaskDirectory: state.pendingTaskDirectory,
  };
}

async function sendMessage(event) {
  event?.preventDefault?.();
  if (state.composerComposing) {
    state.composerSendAfterComposition = true;
    $("messageInput")?.blur();
    scheduleComposerSendAfterCompositionFallback();
    return;
  }
  if (isChatSearchMode()) {
    performChatSearch();
    return;
  }
  if (isComposerStopMode()) {
    const button = $("sendMessage");
    button.disabled = true;
    try {
      await interruptRun();
    } finally {
      button.disabled = false;
      updateComposerAction();
    }
    return;
  }
  if (!state.currentThreadId && state.viewMode === "single") await loadSingleWindow();
  if (!state.currentThreadId) return;
  let text = getComposerText().trim();
  const originalText = text;
  const ownerElevationOnceTag = ownerElevationComposerAvailable() ? ownerElevationOnceTagInfo(text) : null;
  let ownerElevationOnceRequested = false;
  if (ownerElevationOnceTag) {
    text = stripOwnerElevationOnceTags(text);
  }
  if (!text && !state.pendingArtifacts.length) {
    if (ownerElevationOnceTag) clearOwnerElevationOnce();
    return;
  }
  if (typeof voiceLearningModeActive === "function" && voiceLearningModeActive()) {
    if (ownerElevationOnceTag) clearOwnerElevationOnce();
    await handleVoiceLearningComposerSend(text);
    return;
  }
  const directoryTopicDraftSend = typeof isDirectoryTopicDraftActive === "function"
    ? isDirectoryTopicDraftActive()
    : state.viewMode === "tasks"
      && !state.currentTaskGroupId
      && Boolean(state.pendingTaskDirectory?.projectId)
      && Boolean(state.directoryReturnRoute);
  if (directoryTopicDraftSend && state.directoryTopicDraftSendInFlight) {
    return;
  }
  if (directoryTopicDraftSend) {
    state.directoryTopicDraftSendInFlight = true;
  }
  const aiMention = composerAiMentionInfo(text);
  const searchSourceFields = composerSearchSourceBodyFields(text);
  const chatGptProRequested = Boolean(aiMention.chatGptPro);
  const ownerModelElevationRequired = Boolean(aiMention.ownerElevationRequired);
  const ownerModelApprovalLabel = aiMention.moa ? "Hermes Agent MoA" : (chatGptProRequested ? "ChatGPT Pro" : "This model");
  if (ownerModelElevationRequired && !ownerElevationComposerAvailable() && !ownerElevationActive()) {
    showError(new Error(`${ownerModelApprovalLabel} requires Owner high-privilege approval.`));
    return;
  }
  if (isDraftThread(state.currentThread)) await materializeCurrentThread();
  if (!state.currentThreadId) {
    if (ownerElevationOnceTag) clearOwnerElevationOnce();
    return;
  }
  if (ownerElevationOnceTag) {
    clearOwnerElevationOnce();
    const ok = await activateOwnerElevationOnce({ confirm: false });
    if (!ok) return;
    ownerElevationOnceRequested = true;
  }
  let chatGptProOnceApproved = false;
  let ownerModelOnceApproved = false;
  if (ownerModelElevationRequired && !ownerElevationActive() && !ownerElevationOnceTag) {
    clearOwnerElevationOnce();
    const approvalMessage = aiMention.moa
      ? "Approve Hermes Agent MoA routing for this message only? This sends the run to the Owner maintenance Gateway while preserving provider=moa and model=default for Hermes Agent."
      : "Approve ChatGPT Pro tool routing for this message only? This sends the run to the Owner maintenance Gateway and exposes only the ChatGPT Pro tool for the approved request.";
    const ok = await activateOwnerElevationOnce({
      message: approvalMessage,
    });
    if (!ok) return;
    ownerElevationOnceRequested = true;
    ownerModelOnceApproved = true;
    chatGptProOnceApproved = chatGptProRequested;
  }
  if (state.composerSendInFlight) return;
  state.composerSendInFlight = true;
  closeGroupMentionMenu();
  $("sendMessage").disabled = true;
  let requestBody = null;
  let createsNewTask = false;
  let consumedPendingDirectory = false;
  let optimisticSend = null;
  let sendThreadId = "";
  let sendRouteSnapshot = null;
  try {
    sendThreadId = state.currentThreadId || state.currentThread?.id || "";
    sendRouteSnapshot = typeof currentThreadRouteSnapshot === "function" ? currentThreadRouteSnapshot() : null;
    const reasoningEffort = selectedComposerReasoningEffort(text);
    const selectedModel = selectedComposerModel(text);
    const provider = selectedComposerProvider(text);
    const basePlanInput = composerSendPipelinePlanInput({
      text,
      aiMention,
      searchSourceFields,
      chatGptProRequested,
      ownerModelElevationRequired,
      ownerModelOnceApproved,
      ownerElevationOnceTag,
      chatGptProOnceApproved,
      reasoningEffort,
      model: selectedModel,
      provider,
      directoryTopicDraftSend,
    });
    let requestPlan = classicComposerSendRequestPlan(basePlanInput);
    let body = Object.assign({}, requestPlan.body);
    await refreshNativeEnvironmentSnapshotForSend();
    const environmentContext = await requestNativeEnvironmentContextForSend(body, text);
    const quotedReply = activeQuotedReplyForSend();
    requestPlan = classicComposerSendRequestPlan(Object.assign({}, basePlanInput, {
      environmentContext,
      quotedReply,
    }));
    body = Object.assign({}, requestPlan.body);
    createsNewTask = requestPlan.createsNewTask;
    consumedPendingDirectory = requestPlan.consumedPendingDirectory;
    requestBody = body;
    const serializedBody = requestPlan.serializedBody || JSON.stringify(body);
    const sizeError = composerRequestSizeError(text, serializedBody);
    if (sizeError) {
      showError(new Error(sizeError));
      return;
    }
    setComposerText("");
    suppressComposerAutoFocus(1800);
    blurComposerInput();
    lockComposerSendToBottom();
    optimisticSend = appendOptimisticSendMessages(body, text);
    const result = await api(`/api/threads/${encodeURIComponent(sendThreadId)}/messages`, {
      method: "POST",
      body: serializedBody,
      timeoutMs: COMPOSER_SEND_TIMEOUT_MS,
    });
    clearOptimisticSendMessages(optimisticSend, { render: false });
    handleSendMessageResult(result, createsNewTask, consumedPendingDirectory, {
      threadId: sendThreadId,
      routeSnapshot: sendRouteSnapshot,
    });
    if (typeof commitPendingVoiceInputFinalText === "function") commitPendingVoiceInputFinalText(text, body);
    clearComposerAfterSuccessfulSend(originalText);
  } catch (err) {
    const clearedOptimisticSend = clearOptimisticSendMessages(optimisticSend, { render: true });
    if (
      clearedOptimisticSend
      && typeof requestCurrentThreadRefresh === "function"
      && (typeof currentThreadRouteMatches !== "function" || currentThreadRouteMatches(sendRouteSnapshot))
    ) {
      requestCurrentThreadRefresh({ stickToBottom: true, delayMs: 500, routeSnapshot: sendRouteSnapshot });
    }
    if (shouldOfferOwnerElevation(err) && requestBody) {
      const prompt = ownerElevationConfirmMessage(err);
      const ok = await openOwnerElevationApprovalDialog({
        title: "Owner Approval",
        message: prompt,
        detail: err.elevationReason || "",
      });
      if (ok) {
        try {
          let onceToken = "";
          if (!ownerElevationActive()) {
            await activateOwnerElevationOnce({ confirm: false });
            onceToken = state.ownerElevationOnceToken;
            ownerElevationOnceRequested = true;
          }
          const elevatedBodyPlan = classicElevatedComposerSendBodyPlan({
            requestBody,
            elevationScope: err.elevationScope || err.code || "shared_skill_write",
            ownerElevationOnceToken: onceToken,
          });
          const elevatedBody = Object.assign({}, elevatedBodyPlan.body);
          const serializedElevatedBody = elevatedBodyPlan.serializedBody || JSON.stringify(elevatedBody);
          const elevatedSizeError = composerRequestSizeError(elevatedBody.text || "", serializedElevatedBody);
          if (elevatedSizeError) throw new Error(elevatedSizeError);
          const result = await api(`/api/threads/${encodeURIComponent(sendThreadId)}/messages`, {
            method: "POST",
            body: serializedElevatedBody,
          });
          handleSendMessageResult(result, createsNewTask, consumedPendingDirectory, {
            threadId: sendThreadId,
            routeSnapshot: sendRouteSnapshot,
          });
          if (typeof commitPendingVoiceInputFinalText === "function") commitPendingVoiceInputFinalText(elevatedBody.text || "", elevatedBody);
          clearComposerAfterSuccessfulSend(elevatedBody.text || originalText);
          return;
        } catch (elevatedErr) {
          setComposerText(originalText);
          showError(elevatedErr);
          return;
        }
      }
      setComposerText(originalText);
      showError(new Error("已取消 Owner 提权，未执行这次越权请求。"));
      return;
    }
    setComposerText(originalText);
    showError(err);
  } finally {
    if (ownerElevationOnceRequested) clearOwnerElevationOnce();
    state.composerSendInFlight = false;
    if (directoryTopicDraftSend) state.directoryTopicDraftSendInFlight = false;
    $("sendMessage").disabled = false;
    updateComposerAction();
  }
}
