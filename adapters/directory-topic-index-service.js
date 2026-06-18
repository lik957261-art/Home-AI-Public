"use strict";

function cleanString(value, max = 0) {
  const text = String(value || "").trim();
  return max > 0 ? text.slice(0, max) : text;
}

function objectValue(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function messageTimelineTimestamp(message = {}) {
  return message.completedAt || message.failedAt || message.cancelledAt || message.submittedAt || message.updatedAt || message.createdAt || "";
}

function defaultComparablePath(value) {
  return String(value || "").trim().replaceAll("\\", "/").replace(/\/+$/g, "").toLowerCase();
}

function defaultCompactText(value, max = 96) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!max || text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}...`;
}

function canonicalDirectoryRoute(route = {}) {
  const source = objectValue(route, null);
  if (!source) return null;
  const out = {
    label: cleanString(source.label || source.projectLabel || ""),
    root: cleanString(source.root || ""),
    path: cleanString(source.path || ""),
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
    const rawValue = cleanString(source[name] || source[name.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)] || "");
    if (rawValue) out[name] = rawValue;
  }
  if (!out.label && !out.root && !out.path && !out.projectId) return null;
  return out;
}

function stripReceiptMetadataComments(text = "") {
  return String(text || "").replace(/<!--\s*homeai-note(?:-[a-z]+)?[\s\S]*?-->/gi, "").trim();
}

function receiptTitleMetadata(text = "", max = 96, compactText = defaultCompactText) {
  const source = String(text || "");
  const single = source.match(/<!--\s*homeai-note-title\s*[:\uff1a]\s*([\s\S]*?)-->/i);
  if (single) return compactText(single[1], max);
  const blockRe = /<!--\s*homeai-note\b([\s\S]*?)-->/gi;
  let match;
  while ((match = blockRe.exec(source))) {
    const body = String(match[1] || "");
    for (const line of body.split(/\r?\n/)) {
      const title = String(line || "").trim().match(/^title\s*[:\uff1a]\s*(.+)$/i);
      if (title) return compactText(title[1], max);
    }
  }
  return "";
}

function cleanReceiptTitleLine(line = "") {
  let text = String(line || "").trim();
  text = text.replace(/^#{1,4}\s+/, "");
  text = text.replace(/^[-*+\u2022\u00b7]\s+/, "");
  text = text.replace(/!\[[^\]]*]\([^)]+\)/g, "");
  text = text.replace(/\[[^\]]*]\([^)]+\)/g, (match) => match.replace(/^\[|\]\([^)]+\)$/g, ""));
  text = text.replace(/[`*_~>#]/g, "");
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (/^(attachments?|source|conversation|time|error|\u9644\u4ef6|\u6765\u6e90|\u4f1a\u8bdd|\u65f6\u95f4)[:\uff1a]?/i.test(text)) return "";
  if (/^(按现在的状态|我的判断是|结论先说|先说结论|我查了一下|我看了一下|简单说|整体看|总体看|目前看)[\s\uff1a:，,。.!！?？]*$/i.test(text)) return "";
  return text;
}

function receiptSummaryTitleFromText(text = "", options = {}) {
  const compactText = typeof options.compactText === "function" ? options.compactText : defaultCompactText;
  const max = Math.max(8, Number(options.max || 96) || 96);
  const metadataTitle = receiptTitleMetadata(text, max, compactText);
  if (metadataTitle) return metadataTitle;
  const clean = stripReceiptMetadataComments(text);
  const heading = clean.split(/\r?\n/)
    .map((line) => String(line || "").trim().match(/^#{1,4}\s+(.+)$/))
    .find(Boolean)?.[1] || "";
  const candidate = cleanReceiptTitleLine(heading)
    || clean.split(/\r?\n/).map(cleanReceiptTitleLine).find(Boolean)
    || "";
  return compactText(candidate, max);
}

function createDirectoryTopicIndexService(options = {}) {
  const comparablePath = typeof options.comparablePath === "function" ? options.comparablePath : defaultComparablePath;
  const compactText = typeof options.compactText === "function" ? options.compactText : defaultCompactText;
  const normalizeTaskGroupMeta = typeof options.normalizeTaskGroupMeta === "function"
    ? options.normalizeTaskGroupMeta
    : objectValue;
  const isConversationTaskGroupId = typeof options.isConversationTaskGroupId === "function"
    ? options.isConversationTaskGroupId
    : (() => false);

  function isExcludedTaskGroupId(value) {
    const id = cleanString(value);
    return !id || id.startsWith("plugin:") || id.startsWith("case_") || isConversationTaskGroupId(id);
  }

  function routeOwnerWorkspaceId(route = {}, fallback = "") {
    return cleanString(
      route.workspaceId
        || route.workspace_id
        || route.ownerWorkspaceId
        || route.owner_workspace_id
        || route.actorWorkspaceId
        || route.actor_workspace_id
        || fallback,
    );
  }

  function routeKey(route = {}, fallbackWorkspaceId = "") {
    const source = objectValue(route, null);
    if (!source) return "";
    const root = comparablePath(source.root || source.path || "");
    const routeId = cleanString(source.projectId || source.id);
    if (!routeId && !root) return "";
    return [
      routeOwnerWorkspaceId(source, fallbackWorkspaceId),
      routeId,
      cleanString(source.subprojectId),
      root,
    ].join("|");
  }

  function routeLabel(route = {}) {
    return cleanString(route.label || route.projectLabel || route.projectId || route.id || route.path || route.root || "Directory");
  }

  function topicIndexFromMeta(thread = {}, taskGroupId = "", meta = {}) {
    const groupId = cleanString(taskGroupId);
    const source = objectValue(meta);
    const directoryRoute = canonicalDirectoryRoute(source.directoryRoute);
    const directoryRouteKey = cleanString(source.directoryRouteKey || routeKey(directoryRoute, source.ownerWorkspaceId || thread.workspaceId));
    if (!groupId || !directoryRouteKey || isExcludedTaskGroupId(groupId)) return null;
    return {
      id: cleanString(source.id || `${directoryRouteKey}:${groupId}`),
      workspaceId: cleanString(source.ownerWorkspaceId || source.workspaceId || routeOwnerWorkspaceId(directoryRoute, thread.workspaceId) || thread.workspaceId),
      directoryRouteKey,
      directoryRoute,
      route: directoryRoute,
      routeLabel: routeLabel(directoryRoute),
      topicThreadId: cleanString(source.topicThreadId || thread.id),
      taskGroupId: groupId,
      title: cleanString(source.title, 160),
      purpose: cleanString(source.purpose, 80),
      isDefault: Boolean(source.isDefault),
      sortOrder: Number.isFinite(Number(source.sortOrder)) ? Number(source.sortOrder) : 0,
      lastMessageId: cleanString(source.lastMessageId),
      lastReceiptTitle: cleanString(source.lastReceiptTitle, 160),
      lastUserPromptTitle: cleanString(source.lastUserPromptTitle, 160),
      messageCount: Math.max(0, Number(source.messageCount || 0) || 0),
      createdAt: cleanString(source.createdAt || thread.createdAt),
      updatedAt: cleanString(source.updatedAt || source.createdAt || thread.updatedAt || thread.createdAt),
    };
  }

  function listTopicIndexes(thread = {}) {
    const meta = normalizeTaskGroupMeta(thread.taskGroupMeta);
    return Object.entries(meta)
      .map(([taskGroupId, value]) => topicIndexFromMeta(thread, taskGroupId, value))
      .filter(Boolean)
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }

  function topicGroupProjection(topic = {}) {
    const title = topic.title || topic.lastReceiptTitle || topic.lastUserPromptTitle || "";
    const messages = [];
    if (topic.lastUserPromptTitle) {
      messages.push({
        id: `${topic.taskGroupId}:last-user`,
        role: "user",
        content: topic.lastUserPromptTitle,
        taskGroupId: topic.taskGroupId,
        createdAt: topic.updatedAt,
        updatedAt: topic.updatedAt,
      });
    }
    if (topic.lastReceiptTitle) {
      messages.push({
        id: `${topic.taskGroupId}:last-receipt`,
        role: "assistant",
        content: topic.lastReceiptTitle,
        taskGroupId: topic.taskGroupId,
        createdAt: topic.updatedAt,
        updatedAt: topic.updatedAt,
      });
    }
    return {
      id: topic.taskGroupId,
      title,
      ownerWorkspaceId: topic.workspaceId,
      directoryRoute: topic.directoryRoute || topic.route || null,
      directoryRouteKey: topic.directoryRouteKey,
      lastMessageId: topic.lastMessageId || "",
      lastReceiptTitle: topic.lastReceiptTitle || "",
      lastUserPromptTitle: topic.lastUserPromptTitle || "",
      createdAt: topic.createdAt,
      updatedAt: topic.updatedAt,
      messages,
    };
  }

  function listCollections(thread = {}, options = {}) {
    const limitDirectories = Math.max(1, Math.min(100, Number(options.limitDirectories || 40) || 40));
    const topicsPerDirectory = Math.max(1, Math.min(50, Number(options.topicsPerDirectory || 8) || 8));
    const byRoute = new Map();
    for (const topic of listTopicIndexes(thread)) {
      if (!byRoute.has(topic.directoryRouteKey)) {
        byRoute.set(topic.directoryRouteKey, {
          key: topic.directoryRouteKey,
          workspaceId: topic.workspaceId,
          route: topic.directoryRoute,
          label: topic.routeLabel,
          topicCount: 0,
          groups: [],
          topics: [],
          defaultGroup: null,
          defaultTopic: null,
          updatedAt: "",
          hasMoreTopics: false,
          nextCursor: "",
        });
      }
      const collection = byRoute.get(topic.directoryRouteKey);
      collection.topicCount += 1;
      if (!collection.updatedAt || String(topic.updatedAt || "") > String(collection.updatedAt || "")) {
        collection.updatedAt = topic.updatedAt || collection.updatedAt;
      }
      if (collection.topics.length < topicsPerDirectory) {
        collection.topics.push(topic);
        const group = topicGroupProjection(topic);
        collection.groups.push(group);
        if (topic.isDefault || !collection.defaultTopic) {
          collection.defaultTopic = topic;
          collection.defaultGroup = group;
        }
      } else {
        collection.hasMoreTopics = true;
        collection.nextCursor = topic.updatedAt || topic.taskGroupId;
      }
    }
    return [...byRoute.values()]
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
      .slice(0, limitDirectories);
  }

  function summarizeMessageForIndex(message = {}) {
    const at = messageTimelineTimestamp(message);
    if (message.role === "assistant") {
      return {
        lastReceiptTitle: receiptSummaryTitleFromText(message.content || "", { max: 96, compactText }),
        lastReceiptAt: at,
      };
    }
    if (message.role === "user") {
      const prompt = compactText(message.content || "", 96);
      return {
        lastUserPromptTitle: prompt,
        lastUserPromptAt: at,
        fallbackTitle: compactText(message.content || "", 80),
      };
    }
    return {};
  }

  function upsertThreadTopicIndex(thread = {}, input = {}) {
    const taskGroupId = cleanString(input.taskGroupId);
    if (!taskGroupId || isExcludedTaskGroupId(taskGroupId)) return null;
    const meta = normalizeTaskGroupMeta(thread.taskGroupMeta);
    const existing = objectValue(meta[taskGroupId]);
    const directoryRoute = canonicalDirectoryRoute(input.directoryRoute || input.directoryAttachment || existing.directoryRoute);
    const directoryRouteKey = cleanString(input.directoryRouteKey || existing.directoryRouteKey || routeKey(directoryRoute, input.ownerWorkspaceId || input.actorWorkspaceId || thread.workspaceId));
    if (!directoryRoute || !directoryRouteKey) return null;
    const message = objectValue(input.message, null);
    const messageSummary = message ? summarizeMessageForIndex(message) : {};
    const inputUpdatedAt = cleanString(input.updatedAt || input.createdAt || messageTimelineTimestamp(message || {}) || new Date().toISOString());
    const existingUpdatedAt = cleanString(existing.updatedAt);
    const updatedAt = !existingUpdatedAt || String(inputUpdatedAt) >= String(existingUpdatedAt)
      ? inputUpdatedAt
      : existingUpdatedAt;
    const existingMessageAt = [existing.lastReceiptAt, existing.lastUserPromptAt, existing.lastMessageAt, existing.updatedAt]
      .map(cleanString)
      .filter(Boolean)
      .sort()
      .pop() || "";
    const messageCanRefreshLastMessage = !existingMessageAt || String(inputUpdatedAt) >= String(existingMessageAt);
    const existingReceiptAt = cleanString(existing.lastReceiptAt || (existing.lastReceiptTitle ? existing.updatedAt : ""));
    const existingPromptAt = cleanString(existing.lastUserPromptAt || (existing.lastUserPromptTitle ? existing.updatedAt : ""));
    const nextMessageSummary = {};
    if (messageSummary.lastReceiptTitle && (!existingReceiptAt || String(messageSummary.lastReceiptAt || updatedAt) >= String(existingReceiptAt))) {
      nextMessageSummary.lastReceiptTitle = messageSummary.lastReceiptTitle;
      nextMessageSummary.lastReceiptAt = cleanString(messageSummary.lastReceiptAt || updatedAt);
    }
    if (messageSummary.lastUserPromptTitle && (!existingPromptAt || String(messageSummary.lastUserPromptAt || updatedAt) >= String(existingPromptAt))) {
      nextMessageSummary.lastUserPromptTitle = messageSummary.lastUserPromptTitle;
      nextMessageSummary.lastUserPromptAt = cleanString(messageSummary.lastUserPromptAt || updatedAt);
    }
    const next = Object.assign({}, existing, {
      ownerWorkspaceId: cleanString(existing.ownerWorkspaceId || input.ownerWorkspaceId || input.actorWorkspaceId || routeOwnerWorkspaceId(directoryRoute, thread.workspaceId) || thread.workspaceId),
      directoryRoute,
      directoryRouteKey,
      title: cleanString(input.title || existing.title || messageSummary.fallbackTitle, 160),
      updatedAt,
      createdAt: cleanString(existing.createdAt || input.createdAt || updatedAt),
      lastMessageId: messageCanRefreshLastMessage
        ? cleanString(input.lastMessageId || message?.id || existing.lastMessageId)
        : cleanString(existing.lastMessageId || input.lastMessageId || message?.id),
      messageCount: Math.max(Number(existing.messageCount || 0) || 0, Number(input.messageCount || 0) || 0),
    }, nextMessageSummary);
    thread.taskGroupMeta = meta;
    thread.taskGroupMeta[taskGroupId] = next;
    return next;
  }

  function repairThreadIndexFromMessages(thread = {}, options = {}) {
    const limit = Math.max(1, Number(options.limit || 5000) || 5000);
    let scanned = 0;
    let updated = 0;
    for (const message of arrayValue(thread.messages)) {
      if (scanned >= limit) break;
      scanned += 1;
      const taskGroupId = cleanString(message.taskGroupId);
      if (!taskGroupId || isExcludedTaskGroupId(taskGroupId)) continue;
      const meta = normalizeTaskGroupMeta(thread.taskGroupMeta);
      const existing = objectValue(meta[taskGroupId], null);
      const directoryRoute = message.directoryRoute || existing?.directoryRoute || null;
      if (!directoryRoute) continue;
      const before = JSON.stringify(objectValue(normalizeTaskGroupMeta(thread.taskGroupMeta)[taskGroupId]));
      upsertThreadTopicIndex(thread, {
        taskGroupId,
        directoryRoute,
        actorWorkspaceId: message.actorWorkspaceId || message.senderWorkspaceId || thread.workspaceId,
        createdAt: message.createdAt,
        updatedAt: messageTimelineTimestamp(message),
        lastMessageId: message.id,
        message,
      });
      const after = JSON.stringify(objectValue(normalizeTaskGroupMeta(thread.taskGroupMeta)[taskGroupId]));
      if (before !== after) updated += 1;
    }
    return { scanned, updated };
  }

  return {
    listCollections,
    listTopicIndexes,
    repairThreadIndexFromMessages,
    routeKey,
    topicGroupProjection,
    topicIndexFromMeta,
    upsertThreadTopicIndex,
  };
}

module.exports = {
  canonicalDirectoryRoute,
  createDirectoryTopicIndexService,
  receiptSummaryTitleFromText,
};
