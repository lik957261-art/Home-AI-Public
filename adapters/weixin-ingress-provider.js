"use strict";

const crypto = require("node:crypto");

const MATCH_KEYS = Object.freeze({
  account: new Set(["accountid", "account_id", "adapteraccountid", "adapter_account_id", "weixinaccountid", "weixin_account_id"]),
  chat: new Set(["chatid", "chat_id", "conversationid", "conversation_id", "roomid", "room_id"]),
  user: new Set(["userid", "user_id", "openid", "open_id", "senderid", "sender_id"]),
  principal: new Set(["principalid", "principal_id"]),
});

function trimString(value, maxLength = 1000) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => trimString(item, 500)).filter(Boolean);
  const text = trimString(value, 500);
  return text ? [text] : [];
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function snakeOrCamel(source, camel, snake = "") {
  if (!source || typeof source !== "object") return "";
  return source[camel] ?? source[snake || camel.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)] ?? "";
}

function normalizeAttachments(value) {
  const items = Array.isArray(value) ? value : [];
  return items.slice(0, 20).map((item) => {
    if (!item || typeof item !== "object") return null;
    return {
      name: trimString(item.name || item.filename || item.file_name || "", 240),
      mime: trimString(item.mime || item.contentType || item.content_type || "", 120),
      url: trimString(item.url || item.href || "", 2000),
      path: trimString(item.path || item.localPath || item.local_path || "", 2000),
      size: Math.max(0, Number(item.size || item.bytes || 0) || 0),
    };
  }).filter((item) => item && (item.name || item.url || item.path));
}

function canonicalEventFingerprint(event) {
  return JSON.stringify({
    source: event.source,
    accountId: event.accountId,
    chatId: event.chatId,
    userId: event.userId,
    principalId: event.principalId,
    workspaceId: event.workspaceId,
    text: event.text,
    timestamp: event.timestamp,
    attachments: event.attachments.map((item) => ({
      name: item.name,
      path: item.path,
      url: item.url,
      size: item.size,
    })),
  });
}

function normalizeInboundEvent(body = {}) {
  const source = body && typeof body === "object" ? body : {};
  const text = trimString(
    source.text ?? source.content ?? source.message ?? source.body ?? source.prompt ?? "",
    240000,
  );
  const attachments = normalizeAttachments(source.attachments || source.files || []);
  if (!text && !attachments.length) {
    const err = new Error("Weixin ingress event must include text or attachments");
    err.status = 400;
    throw err;
  }
  const event = {
    source: "weixin",
    eventId: trimString(source.eventId || source.event_id || source.id || source.messageId || source.message_id || source.msgId || source.msg_id || "", 160),
    accountId: trimString(snakeOrCamel(source, "accountId", "account_id"), 160),
    chatId: trimString(snakeOrCamel(source, "chatId", "chat_id"), 240),
    userId: trimString(snakeOrCamel(source, "userId", "user_id"), 240),
    principalId: trimString(snakeOrCamel(source, "principalId", "principal_id"), 160),
    workspaceId: trimString(snakeOrCamel(source, "workspaceId", "workspace_id"), 160),
    senderLabel: trimString(source.senderLabel || source.sender_label || source.sender || source.nickname || "", 120),
    text,
    attachments,
    timestamp: trimString(source.timestamp || source.createdAt || source.created_at || new Date().toISOString(), 80),
    rawType: trimString(source.type || source.messageType || source.message_type || "", 80),
  };
  if (!event.eventId) event.eventId = `wx_${hashValue(canonicalEventFingerprint(event)).slice(0, 32)}`;
  return event;
}

function isInboundHeartbeatEvent(event) {
  const text = trimString(event?.text || "", 20);
  const attachments = Array.isArray(event?.attachments) ? event.attachments : [];
  return (text === "#" || text === "＃") && attachments.length === 0;
}

function keyName(value) {
  return String(value || "").replace(/[^A-Za-z0-9_]/g, "").toLowerCase();
}

function collectWorkspaceMatchValues(value, depth = 0, out = null) {
  const target = out || { account: new Set(), chat: new Set(), user: new Set(), principal: new Set() };
  if (!value || typeof value !== "object" || depth > 5) return target;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 50)) collectWorkspaceMatchValues(item, depth + 1, target);
    return target;
  }
  for (const [key, raw] of Object.entries(value)) {
    const normalizedKey = keyName(key);
    const asList = normalizeList(raw);
    if (MATCH_KEYS.account.has(normalizedKey)) asList.forEach((item) => target.account.add(item));
    if (MATCH_KEYS.chat.has(normalizedKey)) asList.forEach((item) => target.chat.add(item));
    if (MATCH_KEYS.user.has(normalizedKey)) asList.forEach((item) => target.user.add(item));
    if (MATCH_KEYS.principal.has(normalizedKey)) asList.forEach((item) => target.principal.add(item));
    if (raw && typeof raw === "object") collectWorkspaceMatchValues(raw, depth + 1, target);
  }
  return target;
}

function setHas(set, value) {
  const text = trimString(value, 500);
  return Boolean(text && set.has(text));
}

function workspaceMatchesEvent(workspace, event) {
  if (!workspace || !event) return false;
  const values = collectWorkspaceMatchValues(workspace);
  if (event.principalId && (workspace.id === event.principalId || setHas(values.principal, event.principalId))) return true;
  const accountMatched = event.accountId && setHas(values.account, event.accountId);
  const chatMatched = event.chatId && setHas(values.chat, event.chatId);
  const userMatched = event.userId && setHas(values.user, event.userId);
  if (accountMatched && (chatMatched || userMatched)) return true;
  if (!event.accountId && (chatMatched || userMatched)) return true;
  return false;
}

function normalizeAck(body = {}) {
  const source = body && typeof body === "object" ? body : {};
  const status = trimString(source.status || source.deliveryStatus || source.delivery_status || "", 40).toLowerCase();
  if (!["sent", "failed", "skipped"].includes(status)) {
    const err = new Error("Delivery ack status must be sent, failed, or skipped");
    err.status = 400;
    throw err;
  }
  return {
    status,
    providerMessageId: trimString(source.providerMessageId || source.provider_message_id || source.messageId || source.message_id || "", 200),
    error: trimString(source.error || source.errorMessage || source.error_message || "", 1000),
    rawStatus: trimString(source.rawStatus || source.raw_status || "", 500),
    acknowledgedAt: trimString(source.acknowledgedAt || source.acknowledged_at || new Date().toISOString(), 80),
  };
}

function createWeixinIngressProvider(options = {}) {
  const listWorkspaces = typeof options.listWorkspaces === "function" ? options.listWorkspaces : () => [];
  const workspaceIdForPrincipal = typeof options.workspaceIdForPrincipal === "function" ? options.workspaceIdForPrincipal : () => "";
  const defaultWorkspaceId = typeof options.defaultWorkspaceId === "function" ? options.defaultWorkspaceId : () => "";

  function resolveWorkspaceId(event) {
    const requestedWorkspace = trimString(event?.workspaceId || "", 160);
    if (requestedWorkspace && listWorkspaces().some((workspace) => workspace.id === requestedWorkspace)) return requestedWorkspace;
    const principalWorkspace = event?.principalId ? workspaceIdForPrincipal(event.principalId) : "";
    if (principalWorkspace && listWorkspaces().some((workspace) => workspace.id === principalWorkspace)) return principalWorkspace;
    const matched = listWorkspaces().find((workspace) => workspaceMatchesEvent(workspace, event));
    if (matched?.id) return matched.id;
    const fallback = trimString(defaultWorkspaceId(), 160);
    return fallback && listWorkspaces().some((workspace) => workspace.id === fallback) ? fallback : "";
  }

  function threadKey(event) {
    const account = event?.accountId || "unknown-account";
    const route = event?.chatId || event?.userId || event?.principalId || "unknown-chat";
    return `weixin:${hashValue(`${account}|${route}`).slice(0, 24)}`;
  }

  function deliveryId(threadId, messageId) {
    return `wxout_${hashValue(`${threadId}:${messageId}`).slice(0, 24)}`;
  }

  return {
    deliveryId,
    isInboundHeartbeatEvent,
    normalizeAck,
    normalizeInboundEvent,
    resolveWorkspaceId,
    threadKey,
    workspaceMatchesEvent,
  };
}

module.exports = {
  createWeixinIngressProvider,
  isInboundHeartbeatEvent,
  normalizeAck,
  normalizeInboundEvent,
  workspaceMatchesEvent,
};
