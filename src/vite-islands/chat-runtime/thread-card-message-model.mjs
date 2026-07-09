const THREAD_CARD_MESSAGE_MODEL_VERSION = "20260705-vite-thread-card-message-model-v1";

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).replace(/\u00a0/g, " ").trim().slice(0, Math.max(1, Number(max) || 4000));
}

function classSuffix(value, max = 240) {
  const text = cleanString(value, max);
  return text ? ` ${text}` : "";
}

function taskCardViewPlan(input = {}) {
  const id = cleanString(input.id, 240);
  const sharedTopic = Boolean(input.sharedTopic || input.sourceThreadId);
  const sourceThreadId = cleanString(input.sourceThreadId, 240);
  const title = cleanString(input.title || "Untitled topic", 500) || "Untitled topic";
  return Object.freeze({
    version: THREAD_CARD_MESSAGE_MODEL_VERSION,
    id,
    title,
    updatedAtLabel: cleanString(input.updatedAtLabel, 160),
    sharedTopic,
    articleClassSuffix: sharedTopic ? " shared-topic-card" : "",
    deleteVisible: !sharedTopic,
    menuVisible: !sharedTopic,
    assetsVisible: !sharedTopic,
    docsEmpty: !input.hasArtifact,
    sourceThreadId,
    sharedBadgeLabel: sharedTopic ? cleanString(input.sourceThreadTitle || "共享学习话题", 240) : "",
  });
}

function messageTaskGroupIdPlan(message = {}) {
  return Object.freeze({
    version: THREAD_CARD_MESSAGE_MODEL_VERSION,
    taskGroupId: cleanString(message?.taskGroupId, 240),
  });
}

function quotePreviewPlan(input = {}) {
  return Object.freeze({
    version: THREAD_CARD_MESSAGE_MODEL_VERSION,
    preview: cleanString(input.contentPreview, 500)
      || cleanString(input.taskSummary, 500)
      || cleanString(input.taskTitle, 500)
      || cleanString(input.defaultLabel || "Quoted topic", 240)
      || "Quoted topic",
  });
}

function messageQuoteActionPlan(input = {}) {
  const visible = Boolean(
    input.singleWindowView
    && !input.singleWindowChatView
    && input.role === "assistant"
    && input.taskGroupId
  );
  const taskDisplayId = cleanString(input.taskDisplayId, 240);
  return Object.freeze({
    version: THREAD_CARD_MESSAGE_MODEL_VERSION,
    visible,
    messageId: cleanString(input.messageId, 240),
    title: visible ? `引用 ${taskDisplayId}` : "",
    label: visible ? `引用 ${cleanString(input.shortTaskDisplayId || taskDisplayId, 120)}` : "",
  });
}

function groupMessageRevokeActionPlan(input = {}) {
  const message = input.message || {};
  const selectedWorkspaceId = cleanString(input.selectedWorkspaceId, 240);
  const authWorkspaceId = cleanString(input.authWorkspaceId, 240);
  const activeWorkspaceId = selectedWorkspaceId || authWorkspaceId;
  const senderWorkspaceId = cleanString(message.senderWorkspaceId, 240);
  const visible = Boolean(
    input.groupChatView
    && message
    && !message.revokedAt
    && message.role === "user"
    && cleanString(message.taskGroupId, 240) === cleanString(input.groupChatTaskGroupId, 240)
    && (input.isOwner || (activeWorkspaceId && activeWorkspaceId === senderWorkspaceId))
  );
  const label = cleanString(input.revokeLabel || "撤回", 120) || "撤回";
  return Object.freeze({
    version: THREAD_CARD_MESSAGE_MODEL_VERSION,
    visible,
    messageId: cleanString(message.id, 240),
    label,
  });
}

function messageSenderLabelPlan(input = {}) {
  const useSenderLabel = Boolean(input.groupChatView || input.sharedTopic);
  const role = cleanString(input.role, 80);
  const roleLabel = useSenderLabel && role === "user"
    ? (cleanString(input.senderLabel, 240) || cleanString(input.workspaceLabel, 240) || "You")
    : (role === "user" ? "You" : "Home AI");
  return Object.freeze({
    version: THREAD_CARD_MESSAGE_MODEL_VERSION,
    useSenderLabel,
    roleLabel,
    kindLabel: useSenderLabel && role === "user" && input.messageKind === "ai" ? " · AI" : "",
  });
}

function messageArticlePlan(input = {}) {
  const revoked = Boolean(input.revoked);
  const role = cleanString(input.role || "assistant", 80) || "assistant";
  const status = !revoked && input.status && input.status !== "done" ? ` - ${cleanString(input.status, 120)}` : "";
  const activeAssistant = Boolean(!revoked && role === "assistant" && ["queued", "running"].includes(cleanString(input.status, 80)));
  const activeAssistantClass = activeAssistant ? " streaming-active" : "";
  const preservePromptClass = activeAssistant ? classSuffix(input.preservePromptClass, 160) : "";
  const searchClass = classSuffix(input.searchClass, 160);
  return Object.freeze({
    version: THREAD_CARD_MESSAGE_MODEL_VERSION,
    revoked,
    roleClass: role,
    status,
    activeAssistant,
    articleClass: `message ${role}${searchClass}${activeAssistantClass}${preservePromptClass}${revoked ? " revoked" : ""}`,
    messageId: cleanString(input.messageId, 240),
    scrollEligible: Boolean(input.scrollEligible),
    showUsage: Boolean(!revoked && input.hasUsage),
    showError: Boolean(!revoked && input.hasError),
    showArtifacts: Boolean(!revoked && input.hasArtifacts),
    showExternalDelivery: !revoked,
    showRunProgress: !revoked,
    bodyMode: revoked ? "revoked" : "content",
  });
}

function quotedReplyStatePlan(input = {}) {
  if (!input.singleWindowView || input.singleWindowChatView || !input.message?.taskGroupId) {
    return Object.freeze({ version: THREAD_CARD_MESSAGE_MODEL_VERSION, ok: false, quote: null });
  }
  const label = cleanString(input.taskDisplayId, 240);
  return Object.freeze({
    version: THREAD_CARD_MESSAGE_MODEL_VERSION,
    ok: true,
    quote: Object.freeze({
      taskGroupId: cleanString(input.message.taskGroupId, 240),
      messageId: cleanString(input.message.id, 240),
      label,
      shortLabel: cleanString(input.shortTaskDisplayId || label, 120),
      preview: cleanString(input.preview, 500),
    }),
  });
}

function activeQuotedReplyPlan(input = {}) {
  const quote = input.quote || null;
  const active = Boolean(
    !input.singleWindowChatView
    && input.viewMode === "single"
    && quote?.taskGroupId
    && quote?.messageId
    && input.panelPresent
    && !input.panelHidden
    && cleanString(input.panelMessageId, 240) === cleanString(quote.messageId, 240)
    && cleanString(input.panelTaskGroupId, 240) === cleanString(quote.taskGroupId, 240)
  );
  return Object.freeze({
    version: THREAD_CARD_MESSAGE_MODEL_VERSION,
    quote: active ? quote : null,
  });
}

export {
  THREAD_CARD_MESSAGE_MODEL_VERSION,
  activeQuotedReplyPlan,
  groupMessageRevokeActionPlan,
  messageArticlePlan,
  messageQuoteActionPlan,
  messageSenderLabelPlan,
  messageTaskGroupIdPlan,
  quotePreviewPlan,
  quotedReplyStatePlan,
  taskCardViewPlan,
};
