import {
  buildComposerActionState,
} from "./composer-model.mjs";
import {
  messageActiveStatus,
  messageTerminalStatus,
  sortedMessages,
} from "./model.mjs";

const CHAT_DETAIL_MODEL_VERSION = "20260702-vite-chat-detail-model-v1";

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function normalizeMessages(messages) {
  return Array.isArray(messages) ? sortedMessages(messages) : [];
}

function messageTextPreview(message = {}) {
  const content = cleanString(message.content || message.text || message.summary || "", 240);
  if (content) return content;
  if (message.localPendingSend && message.role === "assistant") return "正在准备模型回复";
  return "";
}

function buildChatMessageRow(message = {}) {
  const status = cleanString(message.status || "", 80);
  const role = cleanString(message.role || "assistant", 40);
  const active = messageActiveStatus(message);
  const terminal = messageTerminalStatus(message);
  const localPending = Boolean(message.localPendingSend);
  return Object.freeze({
    id: cleanString(message.id || message.messageId, 180),
    role,
    status,
    tone: localPending ? "pending" : active ? "active" : terminal ? "terminal" : "normal",
    runId: cleanString(message.runId || message.run_id || "", 180),
    taskGroupId: cleanString(message.taskGroupId || message.task_group_id || "", 180),
    messageKind: cleanString(message.messageKind || message.message_kind || "", 80),
    contentPreview: messageTextPreview(message),
    contentLength: String(message.content || "").length,
    active,
    terminal,
    localPending,
    hasUsage: Boolean(message.usage),
    hasActions: Boolean(message.actionMetadata || message.actions || message.pluginAction),
    updatedAt: cleanString(message.updatedAt || message.updated_at || "", 80),
  });
}

function filterMessagesForTaskGroup(messages = [], taskGroupId = "") {
  const groupId = cleanString(taskGroupId, 180);
  if (!groupId) return messages;
  return messages.filter((message) => cleanString(message.taskGroupId || message.task_group_id || "", 180) === groupId);
}

function buildChatDetailViewModel(input = {}) {
  const thread = input.thread || {};
  const messages = filterMessagesForTaskGroup(normalizeMessages(thread.messages), input.taskGroupId);
  const rows = messages.map(buildChatMessageRow);
  const activeRows = rows.filter((row) => row.active);
  const terminalRows = rows.filter((row) => row.terminal);
  const pendingRows = rows.filter((row) => row.localPending);
  const latest = rows[rows.length - 1] || null;
  const composer = buildComposerActionState(Object.assign({
    enabled: Boolean(thread.id),
    activeRunIds: Array.isArray(thread.activeRunIds) ? thread.activeRunIds : (thread.activeRunId ? [thread.activeRunId] : []),
    singleWindowView: Boolean(thread.singleWindow),
  }, input.composer || {}));
  return Object.freeze({
    version: CHAT_DETAIL_MODEL_VERSION,
    threadId: cleanString(thread.id || input.threadId || "", 180),
    taskGroupId: cleanString(input.taskGroupId || "", 180),
    rowCount: rows.length,
    activeCount: activeRows.length,
    terminalCount: terminalRows.length,
    pendingCount: pendingRows.length,
    latestMessageId: latest?.id || "",
    latestContentPreview: latest?.contentPreview || "",
    composer,
    rows: Object.freeze(rows),
  });
}

export {
  CHAT_DETAIL_MODEL_VERSION,
  buildChatDetailViewModel,
  buildChatMessageRow,
  filterMessagesForTaskGroup,
};
