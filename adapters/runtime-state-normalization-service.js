"use strict";

function defaultDedupe(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function normalizeStringList(value) {
  const raw = Array.isArray(value)
    ? value
    : (typeof value === "string" ? value.split(",") : (value ? [value] : []));
  return defaultDedupe(raw.map((item) => String(item || "").trim()).filter(Boolean));
}

function normalizeStringMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const normalizedKey = String(key || "").trim();
    const normalizedValue = String(rawValue || "").trim();
    if (normalizedKey && normalizedValue) out[normalizedKey] = normalizedValue;
  }
  return out;
}

function normalizeExternalIngress(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const sourceName = String(source.source || "").trim();
  if (!sourceName) return null;
  return {
    source: sourceName.slice(0, 80),
    threadKey: String(source.threadKey || source.thread_key || "").slice(0, 120),
    eventId: String(source.eventId || source.event_id || "").slice(0, 160),
    accountId: String(source.accountId || source.account_id || "").slice(0, 160),
    chatId: String(source.chatId || source.chat_id || "").slice(0, 240),
    userId: String(source.userId || source.user_id || "").slice(0, 240),
    principalId: String(source.principalId || source.principal_id || "").slice(0, 160),
    workspaceId: String(source.workspaceId || source.workspace_id || "").slice(0, 160),
    senderLabel: String(source.senderLabel || source.sender_label || "").slice(0, 120),
    status: String(source.status || "").slice(0, 80),
    createdAt: String(source.createdAt || source.created_at || ""),
    updatedAt: String(source.updatedAt || source.updated_at || ""),
  };
}

function normalizeExternalDelivery(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const sourceName = String(source.source || "").trim();
  if (!sourceName) return null;
  return Object.assign({}, source, {
    source: sourceName.slice(0, 80),
    deliveryId: String(source.deliveryId || source.delivery_id || "").slice(0, 160),
    status: String(source.status || "waiting").slice(0, 80),
    accountId: String(source.accountId || source.account_id || "").slice(0, 160),
    chatId: String(source.chatId || source.chat_id || "").slice(0, 240),
    userId: String(source.userId || source.user_id || "").slice(0, 240),
    eventId: String(source.eventId || source.event_id || "").slice(0, 160),
    updatedAt: String(source.updatedAt || source.updated_at || ""),
  });
}

function stateMessageCount(value) {
  const threads = Array.isArray(value?.threads) ? value.threads : [];
  return threads.reduce((total, thread) => total + (Array.isArray(thread?.messages) ? thread.messages.length : 0), 0);
}

function stateThreadCount(value) {
  return Array.isArray(value?.threads) ? value.threads.length : 0;
}

function stateBackupTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function safeStateBackupReason(reason) {
  return String(reason || "save").toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "save";
}

function createRuntimeStateNormalizationService(options = {}) {
  const bootTrace = typeof options.bootTrace === "function" ? options.bootTrace : () => {};
  const chatGroupMemberWorkspaceIds = typeof options.chatGroupMemberWorkspaceIds === "function" ? options.chatGroupMemberWorkspaceIds : () => [];
  const compactFullContent = typeof options.compactFullContent === "function" ? options.compactFullContent : (value) => String(value || "");
  const dedupe = typeof options.dedupe === "function" ? options.dedupe : defaultDedupe;
  const findWorkspace = typeof options.findWorkspace === "function" ? options.findWorkspace : () => true;
  const makeId = typeof options.makeId === "function" ? options.makeId : (prefix) => `${prefix}_${Date.now()}`;
  const normalizePushDelivery = typeof options.normalizePushDelivery === "function" ? options.normalizePushDelivery : (item) => item;
  const normalizePushReceipt = typeof options.normalizePushReceipt === "function" ? options.normalizePushReceipt : (item) => item;
  const normalizePushSubscription = typeof options.normalizePushSubscription === "function" ? options.normalizePushSubscription : (item) => item;
  const normalizeSingleWindowMode = typeof options.normalizeSingleWindowMode === "function" ? options.normalizeSingleWindowMode : (value) => String(value || "task");
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const singleWindowChatTaskGroupId = typeof options.singleWindowChatTaskGroupId === "function" ? options.singleWindowChatTaskGroupId : () => "chat";
  const workspaceLabel = typeof options.workspaceLabel === "function" ? options.workspaceLabel : (workspaceId) => String(workspaceId || "");
  const groupMessageRevokedText = String(options.groupMessageRevokedText || "Message revoked");
  const kanbanCaseTopicKind = String(options.kanbanCaseTopicKind || "case-topic");
  const maxEventPreviewChars = Math.max(0, Number(options.maxEventPreviewChars || 240) || 240);
  const maxStoredEventsPerThread = Math.max(1, Number(options.maxStoredEventsPerThread || 80) || 80);
  const messageTimeFields = Array.isArray(options.messageTimeFields) ? options.messageTimeFields : [];
  const singleWindowChatTaskGroupIdValue = String(options.singleWindowChatTaskGroupIdValue || "chat");
  const singleWindowGroupChatTaskGroupId = String(options.singleWindowGroupChatTaskGroupId || "group-chat");
  const validReasoningEfforts = options.validReasoningEfforts instanceof Set
    ? options.validReasoningEfforts
    : new Set(Array.isArray(options.validReasoningEfforts) ? options.validReasoningEfforts : []);

  function defaultState() {
    return {
      schemaVersion: 1,
      threads: [],
      artifacts: [],
      pushSubscriptions: [],
      pushReceipts: [],
      pushDeliveries: [],
      automationPushMarks: {},
      voiceInput: {},
    };
  }

  function compactEventPreview(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch (_) {
      return String(value || "");
    }
  }

  function suppressEventPreview(eventName, toolName) {
    const text = `${eventName || ""} ${toolName || ""}`.toLowerCase();
    return text.includes("function_call") || text.includes("call_output") || toolName === "message";
  }

  function normalizeThreadEvent(event = {}) {
    const source = event && typeof event === "object" && !Array.isArray(event) ? event : {};
    const eventName = String(source.event || source.type || "event").trim().slice(0, 120) || "event";
    const tool = String(source.tool || source.item?.type || "").trim().slice(0, 80);
    const preview = suppressEventPreview(eventName, tool)
      ? ""
      : compactEventPreview(source.preview || source.text || source.error || "").slice(0, maxEventPreviewChars);
    return {
      id: String(source.id || "").slice(0, 80),
      event: eventName,
      timestamp: source.timestamp || "",
      runId: String(source.runId || source.run_id || "").slice(0, 120),
      tool,
      preview,
      duration: source.duration || null,
      error: Boolean(source.error),
    };
  }

  function normalizeState(value, normalizeOptions = {}) {
    const next = value && typeof value === "object" ? value : {};
    bootTrace("normalizeState start");
    const threads = Array.isArray(next.threads) ? next.threads.map((thread) => normalizeThread(thread, normalizeOptions)) : [];
    bootTrace(`normalizeState threads ${threads.length}`);
    const pushSubscriptions = Array.isArray(next.pushSubscriptions) ? next.pushSubscriptions.map((item) => normalizePushSubscription(item, normalizeOptions)).filter(Boolean) : [];
    bootTrace(`normalizeState pushSubscriptions ${pushSubscriptions.length}`);
    const pushReceipts = Array.isArray(next.pushReceipts) ? next.pushReceipts.map(normalizePushReceipt).filter(Boolean).slice(-200) : [];
    bootTrace(`normalizeState pushReceipts ${pushReceipts.length}`);
    const pushDeliveries = Array.isArray(next.pushDeliveries) ? next.pushDeliveries.map(normalizePushDelivery).filter(Boolean).slice(-200) : [];
    bootTrace(`normalizeState pushDeliveries ${pushDeliveries.length}`);
    return {
      schemaVersion: 1,
      threads,
      artifacts: Array.isArray(next.artifacts) ? next.artifacts : [],
      pushSubscriptions,
      pushReceipts,
      pushDeliveries,
      automationPushMarks: next.automationPushMarks && typeof next.automationPushMarks === "object" && !Array.isArray(next.automationPushMarks)
        ? next.automationPushMarks
        : {},
      voiceInput: next.voiceInput && typeof next.voiceInput === "object" && !Array.isArray(next.voiceInput)
        ? next.voiceInput
        : {},
    };
  }

  function normalizeChatGroup(value, ownerWorkspaceId = "owner", normalizeOptions = {}) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const ownerId = String(ownerWorkspaceId || "owner").trim() || "owner";
    let memberWorkspaceIds = normalizeStringList(
      source.memberWorkspaceIds || source.member_workspace_ids || source.members || source.workspaceIds,
    );
    if (!normalizeOptions.skipCatalogLookups) memberWorkspaceIds = memberWorkspaceIds.filter((workspaceId) => findWorkspace(workspaceId));
    if (source.enabled) memberWorkspaceIds.unshift(ownerId);
    const normalizedMembers = dedupe(memberWorkspaceIds);
    const kind = String(source.kind || source.type || "").trim() === kanbanCaseTopicKind ? kanbanCaseTopicKind : "";
    const topicKey = String(source.topicKey || source.topic_key || "").trim().slice(0, 160);
    return {
      enabled: Boolean(source.enabled),
      memberWorkspaceIds: source.enabled ? normalizedMembers : [],
      kind,
      topicKey,
      createdAt: String(source.createdAt || source.created_at || ""),
      updatedAt: String(source.updatedAt || source.updated_at || ""),
    };
  }

  function normalizeThread(thread, normalizeOptions = {}) {
    const now = new Date().toISOString();
    const normalized = {
      id: String(thread.id || makeId("thread")),
      title: String(thread.title || "New thread"),
      workspaceId: String(thread.workspaceId || "owner"),
      projectId: String(thread.projectId || "general"),
      subprojectId: String(thread.subprojectId || ""),
      singleWindow: Boolean(thread.singleWindow),
      hermesSessionId: String(thread.hermesSessionId || `web_${makeId("session")}`),
      status: String(thread.status || "idle"),
      activeRunId: thread.activeRunId || null,
      activeRunIds: Array.isArray(thread.activeRunIds) ? thread.activeRunIds.map(String).filter(Boolean) : dedupe([thread.activeRunId].filter(Boolean)),
      createdAt: thread.createdAt || now,
      updatedAt: thread.updatedAt || now,
      taskGroupMeta: normalizeTaskGroupMeta(thread.taskGroupMeta),
      chatGroup: normalizeChatGroup(thread.chatGroup || thread.groupChat, thread.workspaceId || "owner", normalizeOptions),
      externalIngress: normalizeExternalIngress(thread.externalIngress || thread.external_ingress),
      messages: Array.isArray(thread.messages) ? thread.messages : [],
      events: Array.isArray(thread.events) ? thread.events.slice(-maxStoredEventsPerThread).map(normalizeThreadEvent) : [],
    };
    normalized.messages = normalizeThreadMessages(normalized, normalized.messages, normalizeOptions);
    return normalized;
  }

  function normalizeThreadMessages(thread, messages, normalizeOptions = {}) {
    const normalized = messages.map((message) => {
      const next = message && typeof message === "object" ? Object.assign({}, message) : {};
      next.id = String(next.id || makeId("msg"));
      next.role = String(next.role || "assistant");
      next.content = String(next.content || "");
      next.status = String(next.status || "done");
      next.createdAt = next.createdAt || nowIso();
      next.updatedAt = next.updatedAt || next.createdAt;
      for (const field of messageTimeFields) {
        if (next[field]) next[field] = String(next[field]);
      }
      next.artifacts = Array.isArray(next.artifacts) ? next.artifacts : [];
      next.directoryAliases = Array.isArray(next.directoryAliases) ? next.directoryAliases : [];
      next.directoryRoute = next.directoryRoute && typeof next.directoryRoute === "object" ? next.directoryRoute : null;
      next.messageKind = String(next.messageKind || next.message_kind || "").trim() === "plain" ? "plain" : "ai";
      next.senderWorkspaceId = String(next.senderWorkspaceId || next.sender_workspace_id || next.actorWorkspaceId || thread.workspaceId || "").trim();
      next.senderPrincipalId = String(next.senderPrincipalId || next.sender_principal_id || "").trim();
      next.senderLabel = String(next.senderLabel || next.sender_label || "").trim();
      next.gatewayUrl = String(next.gatewayUrl || next.gateway_url || "").trim();
      next.gatewayName = String(next.gatewayName || next.gateway_name || "").trim();
      next.gatewayProfile = String(next.gatewayProfile || next.gateway_profile || "").trim();
      next.gatewaySource = String(next.gatewaySource || next.gateway_source || "").trim();
      next.externalIngress = normalizeExternalIngress(next.externalIngress || next.external_ingress);
      next.externalDelivery = normalizeExternalDelivery(next.externalDelivery || next.external_delivery);
      if (!next.senderLabel && next.senderWorkspaceId) {
        next.senderLabel = normalizeOptions.skipCatalogLookups ? next.senderWorkspaceId : workspaceLabel(next.senderWorkspaceId);
      }
      next.revokedAt = String(next.revokedAt || next.revoked_at || "").trim();
      next.revokedByWorkspaceId = String(next.revokedByWorkspaceId || next.revoked_by_workspace_id || "").trim();
      next.revokedByPrincipalId = String(next.revokedByPrincipalId || next.revoked_by_principal_id || "").trim();
      next.revokedByLabel = String(next.revokedByLabel || next.revoked_by_label || "").trim();
      if (next.revokedAt) {
        next.content = next.content || groupMessageRevokedText;
        next.error = null;
        next.artifacts = [];
        next.directoryAliases = [];
        next.directoryRoute = null;
      }
      const reasoningEffort = String(next.reasoningEffort || next.reasoning_effort || "").trim();
      next.reasoningEffort = validReasoningEfforts.has(reasoningEffort) ? reasoningEffort : "";
      if (next.role === "user" && !next.submittedAt) next.submittedAt = next.createdAt;
      if (next.role === "assistant") {
        if (!next.queuedAt) next.queuedAt = next.createdAt;
        if (next.status === "done" && !next.completedAt && (next.content || next.artifacts.length)) next.completedAt = next.updatedAt;
        if (next.status === "failed" && !next.failedAt) next.failedAt = next.updatedAt;
        if (next.status === "cancelled" && !next.cancelledAt) next.cancelledAt = next.updatedAt;
      }
      if (next.taskGroupId) next.taskGroupId = sanitizeTaskGroupId(next.taskGroupId);
      if (thread.singleWindow) {
        const rawSingleWindowMode = String(next.singleWindowMode || next.single_window_mode || "").trim();
        const weixinIngressMessage = next.externalIngress?.source === "weixin" || next.externalDelivery?.source === "weixin";
        const conversationMessage = isSingleWindowConversationTaskGroupId(next.taskGroupId) || weixinIngressMessage;
        next.singleWindowMode = normalizeSingleWindowMode(rawSingleWindowMode || (conversationMessage ? "chat" : "task"));
        if (next.singleWindowMode === "chat") next.taskGroupId = singleWindowChatTaskGroupId(next.taskGroupId);
      }
      if (
        thread.singleWindow
        && next.messageKind === "plain"
        && next.taskGroupId === singleWindowChatTaskGroupIdValue
        && chatGroupMemberWorkspaceIds(thread, normalizeOptions).length
      ) {
        next.taskGroupId = singleWindowGroupChatTaskGroupId;
      }
      return next;
    });
    if (!thread.singleWindow) return normalized;

    let currentTaskGroupId = "";
    for (let i = 0; i < normalized.length; i += 1) {
      const message = normalized[i];
      if (message.taskGroupId) {
        currentTaskGroupId = message.taskGroupId;
        continue;
      }
      if (message.role === "user" || !currentTaskGroupId) {
        const nextAssistant = normalized[i + 1]?.role === "assistant" ? normalized[i + 1] : null;
        currentTaskGroupId = sanitizeTaskGroupId(
          nextAssistant?.taskGroupId || nextAssistant?.taskId || message.taskId || `task_${message.id}`,
        );
      }
      message.taskGroupId = currentTaskGroupId;
    }
    return normalized;
  }

  function isSingleWindowConversationTaskGroupId(value) {
    const id = String(value || "");
    return id === singleWindowChatTaskGroupIdValue || id === singleWindowGroupChatTaskGroupId;
  }

  function sanitizeTaskGroupId(value) {
    const cleaned = String(value || "")
      .trim()
      .replace(/[^A-Za-z0-9_.:-]+/g, "_")
      .slice(0, 96);
    return cleaned || makeId("task");
  }

  function sanitizeTaskTitle(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
  }

  function normalizeTaskGroupMeta(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const out = {};
    const own = (object, property) => Object.prototype.hasOwnProperty.call(object, property);
    const snakeName = (name) => name.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
    const metaValue = (meta, name) => {
      const snake = snakeName(name);
      if (own(meta, name)) return meta[name];
      if (own(meta, snake)) return meta[snake];
      return undefined;
    };
    const metaString = (meta, name, max = 0) => {
      const rawValue = metaValue(meta, name);
      const text = rawValue == null ? "" : String(rawValue).trim();
      return max > 0 ? text.slice(0, max) : text;
    };
    const metaNumber = (meta, name) => {
      const rawValue = metaValue(meta, name);
      const number = Number(rawValue);
      return Number.isFinite(number) ? number : null;
    };
    const metaBoolean = (meta, name) => {
      const rawValue = metaValue(meta, name);
      if (rawValue === true) return true;
      if (rawValue === false || rawValue == null) return false;
      return /^(1|true|yes|on)$/i.test(String(rawValue).trim());
    };
    for (const [rawKey, rawMeta] of Object.entries(source)) {
      const key = sanitizeTaskGroupId(rawKey);
      if (!key || !rawMeta || typeof rawMeta !== "object" || Array.isArray(rawMeta)) continue;
      const title = sanitizeTaskTitle(rawMeta.title || rawMeta.name || "");
      const lastReceiptTitle = String(rawMeta.lastReceiptTitle || rawMeta.last_receipt_title || "").replace(/\s+/g, " ").trim().slice(0, 500);
      const lastUserPromptTitle = String(rawMeta.lastUserPromptTitle || rawMeta.last_user_prompt_title || "").replace(/\s+/g, " ").trim().slice(0, 500);
      const pluginTopic = Boolean(rawMeta.pluginTopic || rawMeta.plugin_topic || key.startsWith("plugin:"));
      const lastMessageId = String(rawMeta.lastMessageId || rawMeta.last_message_id || "").trim().slice(0, 160);
      if (!title && !lastReceiptTitle && !lastUserPromptTitle && !pluginTopic && !rawMeta.directoryRoute) continue;
      out[key] = {
        title,
        updatedAt: String(rawMeta.updatedAt || rawMeta.renamedAt || nowIso()),
      };
      if (pluginTopic) out[key].pluginTopic = true;
      if (lastReceiptTitle) out[key].lastReceiptTitle = lastReceiptTitle;
      if (lastUserPromptTitle) out[key].lastUserPromptTitle = lastUserPromptTitle;
      if (lastMessageId) out[key].lastMessageId = lastMessageId;
      if (rawMeta.createdAt || rawMeta.created_at) out[key].createdAt = String(rawMeta.createdAt || rawMeta.created_at || "");
      for (const name of ["directoryRouteKey", "ownerWorkspaceId", "workspaceId", "lastReceiptAt", "lastUserPromptAt", "purpose"]) {
        const rawValue = metaString(rawMeta, name);
        if (rawValue) out[key][name] = rawValue;
      }
      const messageCount = metaNumber(rawMeta, "messageCount");
      if (messageCount !== null) out[key].messageCount = Math.max(0, messageCount || 0);
      const sortOrder = metaNumber(rawMeta, "sortOrder");
      if (sortOrder !== null) out[key].sortOrder = sortOrder || 0;
      if (metaBoolean(rawMeta, "isDefault")) out[key].isDefault = true;
      if (rawMeta.sharedTopic) out[key].sharedTopic = true;
      for (const name of ["kanbanCaseId", "kanbanCaseMode", "kanbanCaseOwnerWorkspaceId", "sharedDirectoryPath", "caseDirectoryPath"]) {
        const rawValue = String(rawMeta[name] || "").trim();
        if (rawValue) out[key][name] = rawValue;
      }
      for (const name of ["performerWorkspaceIds", "viewerWorkspaceIds"]) {
        if (Array.isArray(rawMeta[name])) out[key][name] = dedupe(rawMeta[name]);
      }
      if (rawMeta.directoryRoute && typeof rawMeta.directoryRoute === "object" && !Array.isArray(rawMeta.directoryRoute)) {
        const route = rawMeta.directoryRoute;
        const directoryRoute = {
          label: String(route.label || "").trim(),
          root: String(route.root || "").trim(),
          path: String(route.path || "").trim(),
        };
        for (const name of [
          "projectId",
          "subprojectId",
          "workspaceId",
          "ownerWorkspaceId",
          "actorWorkspaceId",
          "targetWorkspaceId",
          "dataWorkspaceId",
          "permission",
          "source",
        ]) {
          const rawValue = String(route[name] || "").trim();
          if (rawValue) directoryRoute[name] = rawValue;
        }
        out[key].directoryRoute = directoryRoute;
      }
    }
    return out;
  }

  return Object.freeze({
    compactFullContent,
    defaultState,
    normalizeChatGroup,
    normalizeExternalDelivery,
    normalizeExternalIngress,
    normalizeState,
    normalizeStringList,
    normalizeStringMap,
    normalizeTaskGroupMeta,
    normalizeThread,
    normalizeThreadMessages,
    safeStateBackupReason,
    sanitizeTaskGroupId,
    sanitizeTaskTitle,
    stateBackupTimestamp,
    stateMessageCount,
    stateThreadCount,
  });
}

module.exports = {
  createRuntimeStateNormalizationService,
  normalizeExternalDelivery,
  normalizeExternalIngress,
  normalizeStringList,
  normalizeStringMap,
  safeStateBackupReason,
  stateBackupTimestamp,
  stateMessageCount,
  stateThreadCount,
};
