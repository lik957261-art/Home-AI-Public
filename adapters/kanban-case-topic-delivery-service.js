"use strict";

const crypto = require("node:crypto");

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function compactText(value, maxChars = 160) {
  const text = cleanString(value).replace(/\s+/g, " ");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}\u2026`;
}

function cardField(card = {}, names = []) {
  for (const name of names) {
    const value = card?.[name];
    if (value !== undefined && value !== null && cleanString(value)) return cleanString(value);
  }
  return "";
}

function cardId(card = {}) {
  return cardField(card, ["id", "cardId", "card_id", "todoId", "todo_id"]);
}

function cardCompleted(card = {}) {
  const status = cardField(card, ["status"]).toLowerCase();
  const kanbanStatus = cardField(card, ["kanbanStatus", "kanban_status"]).toLowerCase();
  return status === "completed" || kanbanStatus === "done";
}

function cardOutputs(card = {}) {
  const outputs = asArray(card.kanbanOutputs).length ? card.kanbanOutputs : card.outputs;
  return asArray(outputs)
    .filter((item) => item && typeof item === "object")
    .slice(0, 12)
    .map((item) => ({
      id: cleanString(item.id),
      name: cleanString(item.name || item.displayName || item.title || item.label),
      mime: cleanString(item.mime || item.contentType || item.content_type),
      size: Number(item.size || 0) || 0,
      url: cleanString(item.url),
      path: cleanString(item.path),
      displayPath: cleanString(item.displayPath || item.display_path),
      workspaceId: cleanString(item.workspaceId || item.workspace_id),
      source: cleanString(item.source || "kanban-output"),
      createdAt: cleanString(item.createdAt || item.created_at),
      updatedAt: cleanString(item.updatedAt || item.updated_at),
    }));
}

function stableMessageId(id) {
  const hash = crypto.createHash("sha1").update(cleanString(id) || "card").digest("hex").slice(0, 18);
  return `case_topic_card_${hash}`;
}

function buildMessageContent(card = {}, outputs = []) {
  const title = compactText(cardField(card, ["content", "title", "name"]) || cardId(card), 120);
  const completedAt = cardField(card, ["completedAt", "completed_at", "kanbanCompletedAt", "kanban_completed_at"]);
  return [
    "\u5b66\u4e60\u5361\u7247\u5df2\u5b8c\u6210\u3002",
    title ? `\u5361\u7247\uff1a${title}` : "",
    completedAt ? `\u5b8c\u6210\u65f6\u95f4\uff1a${completedAt}` : "",
    outputs.length
      ? `\u4ea4\u4ed8\u6587\u4ef6\uff1a${outputs.length} \u4e2a\uff0c\u5df2\u4f5c\u4e3a\u672c\u6d88\u606f\u9644\u4ef6\u3002`
      : "\u4ea4\u4ed8\u6587\u4ef6\uff1a\u6682\u65e0\u3002",
  ].filter(Boolean).join("\n");
}

function defaultNormalizeTaskGroupMeta(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.assign({}, value) : {};
}

function defaultSortMessages(messages) {
  return [...asArray(messages)].sort((left, right) => String(left?.createdAt || "").localeCompare(String(right?.createdAt || "")));
}

function createKanbanCaseTopicDeliveryService(deps = {}) {
  const stateFn = typeof deps.state === "function" ? deps.state : () => deps.state || {};
  const saveState = typeof deps.saveState === "function" ? deps.saveState : () => {};
  const broadcast = typeof deps.broadcast === "function" ? deps.broadcast : () => {};
  const makeId = typeof deps.makeId === "function" ? deps.makeId : (prefix) => `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
  const nowIso = typeof deps.nowIso === "function" ? deps.nowIso : () => new Date().toISOString();
  const normalizeTaskGroupMeta = typeof deps.normalizeTaskGroupMeta === "function" ? deps.normalizeTaskGroupMeta : defaultNormalizeTaskGroupMeta;
  const sortMessages = typeof deps.sortMessagesChronologically === "function" ? deps.sortMessagesChronologically : defaultSortMessages;
  const threadSummary = typeof deps.threadSummary === "function" ? deps.threadSummary : (thread) => thread;

  function findTopicThread(state, topicThreadId, taskGroupId) {
    const threads = asArray(state?.threads);
    return threads.find((thread) => cleanString(thread?.id) === topicThreadId)
      || threads.find((thread) => Boolean(normalizeTaskGroupMeta(thread?.taskGroupMeta)[taskGroupId]))
      || null;
  }

  function syncCompletedCard(card = {}) {
    if (!cardCompleted(card)) return { ok: true, delivered: false, reason: "not_completed" };
    const id = cardId(card);
    if (!id) return { ok: false, delivered: false, error: "missing_card_id" };
    const topicThreadId = cardField(card, ["topicThreadId", "topic_thread_id"]);
    const topicTaskGroupId = cardField(card, ["topicTaskGroupId", "topic_task_group_id"]);
    if (!topicThreadId || !topicTaskGroupId) return { ok: true, delivered: false, reason: "missing_topic_binding" };

    const currentState = stateFn();
    if (!currentState || typeof currentState !== "object") return { ok: false, delivered: false, error: "state_unavailable" };
    if (!Array.isArray(currentState.threads)) currentState.threads = [];
    const thread = findTopicThread(currentState, topicThreadId, topicTaskGroupId);
    if (!thread) return { ok: true, delivered: false, reason: "topic_thread_missing" };

    const now = nowIso();
    const outputs = cardOutputs(card);
    const messageId = stableMessageId(id);
    const messages = asArray(thread.messages);
    const existingIndex = messages.findIndex((message) => (
      cleanString(message?.id) === messageId
      || (cleanString(message?.source) === "kanban-case-topic-delivery" && cleanString(message?.kanbanCardId) === id)
    ));
    const previous = existingIndex >= 0 ? messages[existingIndex] : null;
    const nextMessage = Object.assign({}, previous || {}, {
      id: previous?.id || messageId || makeId("case_topic_card"),
      role: "assistant",
      content: buildMessageContent(card, outputs),
      status: "done",
      createdAt: previous?.createdAt || now,
      updatedAt: now,
      completedAt: now,
      artifacts: outputs,
      taskGroupId: topicTaskGroupId,
      messageKind: "plain",
      senderWorkspaceId: "hermes",
      senderPrincipalId: "hermes",
      senderLabel: "Hermes Mobile",
      actorWorkspaceId: cleanString(thread.workspaceId || card.workspaceId || card.workspace_id),
      singleWindowMode: "task",
      source: "kanban-case-topic-delivery",
      kanbanCardId: id,
      gatewayUrl: "",
      gatewayName: "",
      gatewayProfile: "",
      gatewaySource: "",
      externalIngress: null,
      externalDelivery: null,
      revokedAt: "",
      revokedByWorkspaceId: "",
      revokedByPrincipalId: "",
      revokedByLabel: "",
      reasoningEffort: "",
    });
    if (existingIndex >= 0) messages[existingIndex] = nextMessage;
    else messages.push(nextMessage);
    thread.messages = sortMessages(messages);
    thread.updatedAt = now;
    saveState(currentState, { reason: "kanban-case-topic-delivery", forceBackup: true });
    broadcast({ type: "thread.updated", thread: threadSummary(thread) });
    return {
      ok: true,
      delivered: true,
      threadId: cleanString(thread.id),
      taskGroupId: topicTaskGroupId,
      messageId: nextMessage.id,
      artifactCount: outputs.length,
      updatedExisting: existingIndex >= 0,
    };
  }

  return Object.freeze({
    syncCompletedCard,
  });
}

module.exports = {
  createKanbanCaseTopicDeliveryService,
  cardCompleted,
  cardOutputs,
};
