const CHAT_COMPOSER_SEND_PIPELINE_MODEL_VERSION = "20260704-vite-chat-composer-send-pipeline-model-v1";

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).replace(/\u00a0/g, " ").trim().slice(0, Math.max(1, Number(max) || 4000));
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeArtifacts(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeNullableObject(value) {
  return isObject(value) ? value : null;
}

function composerClientNotificationChannel(input = {}) {
  return input.nativeShellQuery === "ios"
    || input.documentNativeShell === "ios"
    || input.documentNativeShellClass === true
    || input.storageNativeShell === "ios"
    ? "native_ios_apns"
    : "web_push";
}

function appendInstruction(existing, instruction) {
  const base = cleanString(existing, 20000);
  const extra = cleanString(instruction, 20000);
  return [base, extra].filter(Boolean).join("\n\n");
}

function createClassicComposerSendRequestPlan(input = {}) {
  const text = cleanString(input.text, 240000);
  const aiMention = isObject(input.aiMention) ? input.aiMention : {};
  const searchSourceFields = normalizeNullableObject(input.searchSourceFields);
  const body = {
    text,
    artifacts: normalizeArtifacts(input.pendingArtifacts),
    workspaceId: cleanString(input.workspaceId, 120),
    notificationChannel: cleanString(input.notificationChannel || "web_push", 80) || "web_push",
  };
  if (searchSourceFields) Object.assign(body, searchSourceFields);

  const chatGptProRequested = Boolean(input.chatGptProRequested ?? aiMention.chatGptPro);
  const ownerModelElevationRequired = Boolean(input.ownerModelElevationRequired ?? aiMention.ownerElevationRequired ?? chatGptProRequested);
  const ownerElevationOnceTag = Boolean(input.ownerElevationOnceTag);
  const ownerModelOnceApproved = Boolean(input.ownerModelOnceApproved || input.chatGptProOnceApproved) && ownerModelElevationRequired;
  if (input.ownerElevationActive || ownerElevationOnceTag || ownerModelOnceApproved) {
    body.maintenanceMode = true;
    body.maintenance_mode = true;
    body.elevationScope = chatGptProRequested ? "chatgpt_pro_generate" : "owner_high_privilege";
    if (ownerElevationOnceTag || ownerModelOnceApproved) {
      body.ownerElevationOnceToken = cleanString(input.ownerElevationOnceToken, 240);
    }
  }
  if (chatGptProRequested) {
    body.chatGptProGenerate = true;
    body.chatgpt_pro_generate = true;
    body.requiredTool = "chatgpt_pro_generate";
  }

  const viewMode = cleanString(input.viewMode, 40);
  const singleWindowMode = cleanString(input.singleWindowMode, 40);
  const currentTaskGroupId = cleanString(input.currentTaskGroupId, 180);
  if (viewMode === "single") {
    body.singleWindowMode = singleWindowMode === "chat" ? "chat" : "task";
    if (singleWindowMode === "chat") {
      body.taskGroupId = input.groupChatView
        ? cleanString(input.singleWindowGroupChatTaskGroupId, 180)
        : cleanString(input.singleWindowChatTaskGroupId, 180);
      body.messageLimit = Number(input.chatMessageInitialLimit) || 80;
    } else if (currentTaskGroupId) {
      body.taskGroupId = currentTaskGroupId;
      body.messageLimit = Number(input.taskDetailMessageInitialLimit) || 30;
    }
    if (input.groupChatView) body.messageKind = aiMention.mentionsAi ? "ai" : "plain";
  }

  if (viewMode === "tasks" && currentTaskGroupId) {
    body.taskGroupId = currentTaskGroupId;
    const pluginDirectory = normalizeNullableObject(input.pluginTopicDirectory);
    if (pluginDirectory?.projectId) body.directory = pluginDirectory;
    const pluginInstruction = cleanString(input.pluginTopicInstruction, 20000);
    if (pluginInstruction) body.instructions = appendInstruction(body.instructions, pluginInstruction);
    if (input.sharedTopicGroup) {
      body.singleWindowMode = "chat";
      body.messageKind = aiMention.mentionsAi ? "ai" : "plain";
      body.messageLimit = Number(input.taskDetailMessageInitialLimit) || 30;
    }
  }

  const reasoningEffort = cleanString(input.reasoningEffort, 80);
  if (reasoningEffort) body.reasoning_effort = reasoningEffort;
  const model = cleanString(input.model, 200);
  if (model) body.model = model;
  const provider = cleanString(input.provider, 120);
  if (provider) body.provider = provider;
  const environmentContext = normalizeNullableObject(input.environmentContext);
  if (environmentContext) body.environmentContext = environmentContext;
  const quotedReply = normalizeNullableObject(input.quotedReply);
  if (quotedReply) {
    body.taskGroupId = cleanString(quotedReply.taskGroupId, 180);
    body.replyToMessageId = cleanString(quotedReply.messageId, 180);
  }

  const directoryTopicDraftSend = Boolean(input.directoryTopicDraftSend);
  const pendingTaskDirectory = normalizeNullableObject(input.pendingTaskDirectory);
  const createsNewTask = viewMode === "tasks" && !body.taskGroupId;
  const consumedPendingDirectory = directoryTopicDraftSend && Boolean(pendingTaskDirectory?.projectId);
  if (createsNewTask && pendingTaskDirectory?.projectId) body.directory = pendingTaskDirectory;

  return Object.freeze({
    version: CHAT_COMPOSER_SEND_PIPELINE_MODEL_VERSION,
    body: Object.freeze(body),
    createsNewTask,
    consumedPendingDirectory,
    chatGptProRequested,
    ownerModelElevationRequired,
    serializedBody: JSON.stringify(body),
  });
}

function createElevatedRetryBody(input = {}) {
  const requestBody = isObject(input.requestBody) ? input.requestBody : {};
  const elevatedBody = Object.assign({}, requestBody, {
    maintenanceMode: true,
    maintenance_mode: true,
    elevationScope: cleanString(input.elevationScope || "shared_skill_write", 120),
  });
  if (requestBody.chatGptProGenerate || requestBody.chatgpt_pro_generate) {
    elevatedBody.elevationScope = "chatgpt_pro_generate";
  }
  const onceToken = cleanString(input.ownerElevationOnceToken, 240);
  if (onceToken) elevatedBody.ownerElevationOnceToken = onceToken;
  return Object.freeze({
    version: CHAT_COMPOSER_SEND_PIPELINE_MODEL_VERSION,
    body: Object.freeze(elevatedBody),
    serializedBody: JSON.stringify(elevatedBody),
  });
}

export {
  CHAT_COMPOSER_SEND_PIPELINE_MODEL_VERSION,
  composerClientNotificationChannel,
  createClassicComposerSendRequestPlan,
  createElevatedRetryBody,
};
