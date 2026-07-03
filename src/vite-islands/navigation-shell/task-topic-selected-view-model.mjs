const SELECTED_TOPIC_DETAIL_LIMIT = 4;
const TEXT_PREVIEW_LIMIT = 160;

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function boundedArray(value) {
  return Array.isArray(value) ? value : [];
}

function positiveLimit(value, fallback = SELECTED_TOPIC_DETAIL_LIMIT) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isFinite(parsed) && parsed > 0) return Math.min(parsed, 20);
  return fallback;
}

function normalizedRole(value = "") {
  const role = cleanString(value || "unknown", 40).toLowerCase();
  if (["user", "assistant", "system", "tool"].includes(role)) return role;
  return role || "unknown";
}

function textPart(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return value.text || value.content || value.summary || value.title || "";
}

function contentPreview(value) {
  if (Array.isArray(value)) {
    return cleanString(value.map(textPart).filter(Boolean).join(" "), TEXT_PREVIEW_LIMIT);
  }
  if (value && typeof value === "object") {
    return cleanString(textPart(value), TEXT_PREVIEW_LIMIT);
  }
  return cleanString(value, TEXT_PREVIEW_LIMIT);
}

function messageCandidates(thread = {}) {
  const pages = thread.messagesPage && typeof thread.messagesPage === "object" ? thread.messagesPage : {};
  const sources = [
    pages.items,
    pages.messages,
    pages.data,
    pages.results,
    thread.messages,
    thread.items,
  ];
  return boundedArray(sources.find((items) => Array.isArray(items) && items.length));
}

function messagePreview(message = {}) {
  const content = contentPreview(
    message.content
      ?? message.text
      ?? message.summary
      ?? message.title
      ?? "",
  );
  return Object.freeze({
    id: cleanString(message.id || message.messageId || "", 120),
    role: normalizedRole(message.role),
    status: cleanString(message.status || message.state || message.run?.status || "", 80),
    textPreview: content || "(无文本预览)",
    artifactCount: boundedArray(message.artifacts).length,
    attachmentCount: boundedArray(message.attachments).length,
    toolCallCount: boundedArray(message.toolCalls || message.tool_calls).length,
    taskGroupId: cleanString(message.taskGroupId || message.groupId || "", 160),
  });
}

function selectedTopicMessages(thread = {}, selectedTaskGroupId = "", options = {}) {
  const taskGroupId = cleanString(selectedTaskGroupId, 160);
  if (!taskGroupId && options.includeRootMessages !== true) return Object.freeze([]);
  const limit = positiveLimit(options.limit, SELECTED_TOPIC_DETAIL_LIMIT);
  return Object.freeze(messageCandidates(thread)
    .filter((message) => {
      if (!taskGroupId) return true;
      const messageTaskGroupId = cleanString(message?.taskGroupId || message?.groupId || "", 160);
      return !messageTaskGroupId || messageTaskGroupId === taskGroupId;
    })
    .slice(0, limit)
    .map(messagePreview));
}

function buildSelectedTopicViewModel(thread = {}, state = {}, options = {}) {
  const page = thread.messagesPage && typeof thread.messagesPage === "object" ? thread.messagesPage : {};
  const selectedTaskGroupId = cleanString(
    options.taskGroupId
      || state.taskTopicReadTaskGroupId
      || state.currentTaskGroupId
      || state.taskGroupId
      || page.taskGroupId
      || "",
    160,
  );
  const previewMessages = selectedTopicMessages(thread, selectedTaskGroupId, options);
  const loadedMessageCount = Number.isFinite(Number(state.taskTopicReadLoadedMessageCount))
    ? Number(state.taskTopicReadLoadedMessageCount)
    : Number.isFinite(Number(page.loaded))
      ? Number(page.loaded)
      : previewMessages.length;
  const totalMessageCount = Number.isFinite(Number(state.taskTopicReadTotalMessageCount))
    ? Number(state.taskTopicReadTotalMessageCount)
    : Number.isFinite(Number(state.taskTopicReadMessageCount))
      ? Number(state.taskTopicReadMessageCount)
      : Number.isFinite(Number(page.total))
        ? Number(page.total)
        : loadedMessageCount;
  return Object.freeze({
    status: selectedTaskGroupId ? "selected" : "root",
    selectedTaskGroupId,
    messageMode: cleanString(state.taskTopicReadMessageMode || page.mode || "tasks", 80),
    messageCount: Math.max(0, totalMessageCount),
    totalMessageCount: Math.max(0, totalMessageCount),
    loadedMessageCount: Math.max(0, loadedMessageCount),
    hasMoreBefore: Boolean(state.taskTopicReadHasMoreBefore || page.hasMoreBefore),
    oldestMessageId: cleanString(state.taskTopicReadOldestMessageId || page.oldestMessageId || "", 120),
    newestMessageId: cleanString(state.taskTopicReadNewestMessageId || page.newestMessageId || "", 120),
    previewMessages,
    source: cleanString(state.taskTopicReadSource || options.source || "thread_read_api", 120),
    emptyText: selectedTaskGroupId
      ? "这个话题当前没有可预览消息。"
      : "当前为话题根读回，选择一个话题后显示消息摘要。",
  });
}

export {
  SELECTED_TOPIC_DETAIL_LIMIT,
  TEXT_PREVIEW_LIMIT,
  buildSelectedTopicViewModel,
  cleanString,
  contentPreview,
  messageCandidates,
  messagePreview,
  selectedTopicMessages,
};
