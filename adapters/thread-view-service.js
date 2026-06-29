"use strict";

const {
  createDirectoryTopicIndexService,
  receiptSummaryTitleFromText,
} = require("./directory-topic-index-service");
const { publicPluginActions } = require("./wardrobe-outfit-wear-intent-action-service");

function defaultCompactText(value, maxChars) {
  const text = String(value || "");
  if (!maxChars || text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.45);
  const tail = maxChars - head;
  return `${text.slice(0, head)}\n\n[truncated: ${text.length} chars total]\n\n${text.slice(-tail)}`;
}

function normalizeTaskGroupMetaFallback(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeLoadedSkill(value = {}) {
  const path = String(value.path || value.skillPath || value.name || value.id || "").trim();
  if (!path) return null;
  const parts = path.split(/[\\/]+/).filter(Boolean);
  const id = String(value.id || parts[parts.length - 1] || path).trim();
  const namespace = String(value.namespace || (parts.length > 1 ? parts.slice(0, -1).join("/") : "")).trim();
  return {
    id,
    label: String(value.label || id || path).trim(),
    path,
    namespace,
  };
}

function loadedSkillsForPublicMessage(message = {}) {
  const byPath = new Map();
  for (const item of Array.isArray(message.loadedSkills) ? message.loadedSkills : []) {
    const skill = normalizeLoadedSkill(item);
    if (skill && !byPath.has(skill.path)) byPath.set(skill.path, skill);
  }
  return [...byPath.values()];
}

function normalizeToolName(value) {
  const text = String(
    value && typeof value === "object"
      ? (value.name || value.tool || value.function || value.functionName || value.function_name || value.label || value.id || "")
      : value || "",
  ).trim();
  if (!text || !/^[A-Za-z0-9_.:-]+$/.test(text)) return "";
  const lower = text.toLowerCase();
  if (["message", "function_call", "function_call_output", "skill_view"].includes(lower)) return "";
  return text.slice(0, 96);
}

function parseJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const text = String(value || "").trim();
  if (!text || !/^[{[]/.test(text)) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function toolNameFromEventPreview(value) {
  const parsed = parseJsonObject(value);
  return normalizeToolName(parsed || value);
}

function addLoadedTool(map, value) {
  const name = toolNameFromEventPreview(value);
  if (!name) return;
  const id = name.toLowerCase();
  if (!map.has(id)) map.set(id, { id, name, label: name });
}

function messageRunIds(message = {}) {
  return new Set([
    message.runId,
    message.originalRunId,
    message.responseRunId,
    message.gatewayRunId,
    message.usage?.runId,
  ].map((value) => String(value || "").trim()).filter(Boolean));
}

function loadedToolsForPublicMessage(message = {}, thread = null) {
  const byName = new Map();
  for (const item of Array.isArray(message.loadedTools) ? message.loadedTools : []) addLoadedTool(byName, item);
  const runIds = messageRunIds(message);
  if (thread && runIds.size) {
    for (const event of Array.isArray(thread.events) ? thread.events : []) {
      const runId = String(event?.runId || event?.run_id || "").trim();
      if (!runId || !runIds.has(runId)) continue;
      const tool = String(event?.tool || event?.item?.type || "").trim().toLowerCase();
      if (tool !== "function_call" && tool !== "function_call_output") continue;
      addLoadedTool(byName, event.preview || event.arguments || event.input || event.text || "");
    }
  }
  return [...byName.values()];
}

function assistantReceiptTitle(message = {}, max = 96) {
  return receiptSummaryTitleFromText(message?.content || "", { max });
}

function createThreadViewService(deps = {}) {
  const maxApiTextChars = Math.max(1, Number(deps.maxApiTextChars || 80_000) || 80_000);
  const maxEventPreviewChars = Math.max(0, Number(deps.maxEventPreviewChars || 240) || 240);
  const maxStoredEventsPerThread = Math.max(1, Number(deps.maxStoredEventsPerThread || 80) || 80);
  const threadMessageInitialLimit = Math.max(10, Number(deps.threadMessageInitialLimit || 60) || 60);
  const threadMessageSearchLimit = Math.max(10, Number(deps.threadMessageSearchLimit || 120) || 120);
  const singleWindowChatTaskGroupId = String(deps.singleWindowChatTaskGroupId || "chat");
  const singleWindowGroupChatTaskGroupId = String(deps.singleWindowGroupChatTaskGroupId || "group-chat");
  const singleWindowProjectId = String(deps.singleWindowProjectId || "single-window");
  const compactText = typeof deps.compactText === "function" ? deps.compactText : defaultCompactText;
  const normalizeTaskGroupMeta = typeof deps.normalizeTaskGroupMeta === "function"
    ? deps.normalizeTaskGroupMeta
    : normalizeTaskGroupMetaFallback;
  const isSingleWindowConversationTaskGroupId = typeof deps.isSingleWindowConversationTaskGroupId === "function"
    ? deps.isSingleWindowConversationTaskGroupId
    : ((value) => [singleWindowChatTaskGroupId, singleWindowGroupChatTaskGroupId].includes(String(value || "")));
  const publicChatGroup = typeof deps.publicChatGroup === "function"
    ? deps.publicChatGroup
    : (() => ({ enabled: false, kind: "", memberWorkspaceIds: [] }));
  const publicExternalIngress = typeof deps.publicExternalIngress === "function"
    ? deps.publicExternalIngress
    : (() => null);
  const compactArtifactsForMessage = typeof deps.compactArtifactsForMessage === "function"
    ? deps.compactArtifactsForMessage
    : ((message) => (Array.isArray(message?.artifacts) ? message.artifacts : []));
  const findThreadForMessage = typeof deps.findThreadForMessage === "function"
    ? deps.findThreadForMessage
    : (() => null);
  const sanitizeTaskTitle = typeof deps.sanitizeTaskTitle === "function"
    ? deps.sanitizeTaskTitle
    : ((value) => String(value || "").trim());
  const comparablePath = typeof deps.comparablePath === "function"
    ? deps.comparablePath
    : ((value) => String(value || "").trim().replaceAll("\\", "/").toLowerCase());
  const searchableText = typeof deps.searchableText === "function"
    ? deps.searchableText
    : ((value) => String(value || "").toLowerCase().replace(/\s+/g, ""));
  const projectSearchLabels = typeof deps.projectSearchLabels === "function"
    ? deps.projectSearchLabels
    : ((project) => [project?.label, project?.id].filter(Boolean));
  const directoryTopicIndexService = deps.directoryTopicIndexService || createDirectoryTopicIndexService({
    comparablePath,
    compactText,
    normalizeTaskGroupMeta,
    isConversationTaskGroupId: isSingleWindowConversationTaskGroupId,
  });

  function stateThreads() {
    const state = typeof deps.state === "function" ? deps.state() : deps.state;
    return Array.isArray(state?.threads) ? state.threads : [];
  }

  function threadSummary(thread = {}) {
    const last = [...(thread.messages || [])].reverse().find((msg) => msg.content);
    return {
      id: thread.id,
      title: thread.title,
      workspaceId: thread.workspaceId,
      projectId: thread.projectId,
      subprojectId: thread.subprojectId || "",
      singleWindow: Boolean(thread.singleWindow),
      status: thread.status,
      activeRunId: thread.activeRunId,
      activeRunIds: Array.isArray(thread.activeRunIds) ? thread.activeRunIds : [],
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      chatGroup: publicChatGroup(thread),
      externalIngress: publicExternalIngress(thread),
      preview: last ? compactText(last.content, 180) : "",
    };
  }

  function shouldSuppressEventPreview(eventName, toolName) {
    const text = `${eventName || ""} ${toolName || ""}`.toLowerCase();
    return text.includes("function_call") || text.includes("call_output") || toolName === "message";
  }

  function compactThreadEvent(event = {}) {
    const source = event && typeof event === "object" && !Array.isArray(event) ? event : {};
    const eventName = String(source.event || source.type || "event").trim().slice(0, 120) || "event";
    const tool = String(source.tool || source.item?.type || "").trim().slice(0, 80);
    const rawPreview = source.preview || source.text || source.error || "";
    return {
      id: String(source.id || "").slice(0, 80),
      event: eventName,
      timestamp: source.timestamp || "",
      runId: String(source.runId || source.run_id || "").slice(0, 120),
      tool,
      preview: shouldSuppressEventPreview(eventName, tool) ? "" : compactText(rawPreview, maxEventPreviewChars),
      duration: source.duration || null,
      error: Boolean(source.error),
    };
  }

  function taskGroupsForThread(thread = {}) {
    const groups = new Map();
    let currentTaskGroupId = "";
    const meta = normalizeTaskGroupMeta(thread?.taskGroupMeta);
    for (const message of thread?.messages || []) {
      let groupId = message.taskGroupId || "";
      if (!groupId) groupId = currentTaskGroupId || message.taskId || `task_${message.id}`;
      currentTaskGroupId = groupId;
      const pluginTopicGroup = String(groupId || "").startsWith("plugin:");
      if (!groups.has(groupId)) {
        const groupMeta = meta[groupId] || {};
        groups.set(groupId, {
          id: groupId,
          title: groupMeta.title || "",
          lastReceiptTitle: String(groupMeta.lastReceiptTitle || "").trim(),
          lastUserPromptTitle: String(groupMeta.lastUserPromptTitle || "").trim(),
          lastMessageId: String(groupMeta.lastMessageId || "").trim(),
          sharedTopic: Boolean(groupMeta.sharedTopic),
          kanbanCaseId: String(groupMeta.kanbanCaseId || "").trim(),
          kanbanCaseMode: String(groupMeta.kanbanCaseMode || "").trim(),
          performerWorkspaceIds: Array.isArray(groupMeta.performerWorkspaceIds) ? groupMeta.performerWorkspaceIds : [],
          viewerWorkspaceIds: Array.isArray(groupMeta.viewerWorkspaceIds) ? groupMeta.viewerWorkspaceIds : [],
          directoryRoute: groupMeta.directoryRoute && typeof groupMeta.directoryRoute === "object" ? groupMeta.directoryRoute : null,
          pluginTopic: Boolean(groupMeta.pluginTopic || pluginTopicGroup),
          sourceThreadId: String(groupMeta.sourceThreadId || "").trim(),
          ownerWorkspaceId: String(groupMeta.ownerWorkspaceId || groupMeta.workspaceId || "").trim(),
          messages: [],
          createdAt: message.createdAt,
          updatedAt: groupMeta.updatedAt || message.updatedAt || message.createdAt,
        });
      }
      const group = groups.get(groupId);
      group.messages.push(message);
      const updatedAt = message.completedAt || message.failedAt || message.cancelledAt || message.updatedAt || message.createdAt || "";
      const messageCanRefreshMeta = !group.updatedAt || String(updatedAt || "") >= String(group.updatedAt || "");
      if (message.role === "assistant" && message.content && (!group.lastReceiptTitle || messageCanRefreshMeta)) {
        group.lastReceiptTitle = assistantReceiptTitle(message, 96);
      } else if (message.role === "user" && message.content && (!group.lastUserPromptTitle || messageCanRefreshMeta)) {
        group.lastUserPromptTitle = compactText(message.content || "", 160);
      }
      if (message.id && messageCanRefreshMeta) group.lastMessageId = String(message.id || "").trim();
      if (!group.pluginTopic && !group.directoryRoute && message.directoryRoute && typeof message.directoryRoute === "object") {
        group.directoryRoute = message.directoryRoute;
      }
      if (!group.ownerWorkspaceId) {
        group.ownerWorkspaceId = messageOwnerWorkspaceId(message, thread?.workspaceId || "");
      }
      if (String(updatedAt) > String(group.updatedAt || "")) group.updatedAt = updatedAt;
    }
    return [...groups.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  function messageOwnerWorkspaceId(message, fallback = "") {
    return String(
      message?.actorWorkspaceId
        || message?.senderWorkspaceId
        || message?.workspaceId
        || fallback
        || "",
    ).trim();
  }

  function taskGroupOwnerWorkspaceId(group, fallback = "") {
    if (group?.ownerWorkspaceId) return String(group.ownerWorkspaceId || "").trim();
    const messages = group?.messages || [];
    const user = messages.find((message) => message.role === "user");
    return messageOwnerWorkspaceId(user || messages[0], fallback);
  }

  function createTaskGroupFromMeta(groupId, groupMeta = {}, thread = {}) {
    const pluginTopicGroup = String(groupId || "").startsWith("plugin:");
    return {
      id: groupId,
      title: groupMeta.title || "",
      lastReceiptTitle: String(groupMeta.lastReceiptTitle || "").trim(),
      lastUserPromptTitle: String(groupMeta.lastUserPromptTitle || "").trim(),
      lastMessageId: String(groupMeta.lastMessageId || "").trim(),
      sharedTopic: Boolean(groupMeta.sharedTopic),
      kanbanCaseId: String(groupMeta.kanbanCaseId || "").trim(),
      kanbanCaseMode: String(groupMeta.kanbanCaseMode || "").trim(),
      performerWorkspaceIds: Array.isArray(groupMeta.performerWorkspaceIds) ? groupMeta.performerWorkspaceIds : [],
      viewerWorkspaceIds: Array.isArray(groupMeta.viewerWorkspaceIds) ? groupMeta.viewerWorkspaceIds : [],
      directoryRoute: !pluginTopicGroup && groupMeta.directoryRoute && typeof groupMeta.directoryRoute === "object" ? groupMeta.directoryRoute : null,
      pluginTopic: Boolean(groupMeta.pluginTopic || pluginTopicGroup),
      sourceThreadId: String(groupMeta.sourceThreadId || "").trim(),
      ownerWorkspaceId: String(groupMeta.ownerWorkspaceId || groupMeta.workspaceId || thread.workspaceId || "").trim(),
      messages: [],
      createdAt: groupMeta.createdAt || groupMeta.updatedAt || thread.createdAt || "",
      updatedAt: groupMeta.updatedAt || groupMeta.createdAt || thread.updatedAt || "",
    };
  }

  function taskGroupsFromMeta(thread = {}) {
    const meta = normalizeTaskGroupMeta(thread?.taskGroupMeta);
    return Object.entries(meta)
      .filter(([groupId]) => String(groupId || "").trim())
      .map(([groupId, groupMeta]) => createTaskGroupFromMeta(groupId, groupMeta || {}, thread));
  }

  function mergeMessagesIntoTaskGroupMap(groups, messages = [], thread = {}) {
    let currentTaskGroupId = "";
    const meta = normalizeTaskGroupMeta(thread?.taskGroupMeta);
    for (const message of messages || []) {
      let groupId = message.taskGroupId || "";
      if (!groupId) groupId = currentTaskGroupId || message.taskId || `task_${message.id}`;
      currentTaskGroupId = groupId;
      if (!groups.has(groupId)) {
        groups.set(groupId, createTaskGroupFromMeta(groupId, meta[groupId] || {}, thread));
      }
      const group = groups.get(groupId);
      group.messages.push(message);
      const updatedAt = message.completedAt || message.failedAt || message.cancelledAt || message.updatedAt || message.createdAt || "";
      const messageCanRefreshMeta = !group.updatedAt || String(updatedAt || "") >= String(group.updatedAt || "");
      if (message.role === "assistant" && message.content && (!group.lastReceiptTitle || messageCanRefreshMeta)) {
        group.lastReceiptTitle = assistantReceiptTitle(message, 96);
      } else if (message.role === "user" && message.content && (!group.lastUserPromptTitle || messageCanRefreshMeta)) {
        group.lastUserPromptTitle = compactText(message.content || "", 160);
      }
      if (message.id && messageCanRefreshMeta) group.lastMessageId = String(message.id || "").trim();
      if (!group.pluginTopic && !group.directoryRoute && message.directoryRoute && typeof message.directoryRoute === "object") {
        group.directoryRoute = message.directoryRoute;
      }
      if (!group.ownerWorkspaceId) {
        group.ownerWorkspaceId = messageOwnerWorkspaceId(message, thread?.workspaceId || "");
      }
      if (!group.createdAt) group.createdAt = message.createdAt || "";
      if (String(updatedAt) > String(group.updatedAt || "")) group.updatedAt = updatedAt;
    }
    return groups;
  }

  function taskGroupsForProjection(thread = {}, messages = []) {
    const groups = new Map(taskGroupsFromMeta(thread).map((group) => [group.id, group]));
    mergeMessagesIntoTaskGroupMap(groups, messages, thread);
    return [...groups.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  function compactTaskGroupForDirectoryIndex(group = {}, thread = {}) {
    const messages = Array.isArray(group.messages) ? group.messages : [];
    const firstUser = messages.find((message) => message.role === "user") || null;
    const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant" && message.content) || null;
    const latestMessage = [...messages].reverse().find(Boolean) || null;
    const compactMessages = [firstUser, latestAssistant || latestMessage].filter(Boolean);
    const byId = new Map(compactMessages.map((message) => [message.id || `${message.role}:${message.createdAt || ""}`, message]));
    return {
      id: group.id,
      title: String(group.title || "").trim(),
      lastReceiptTitle: String(group.lastReceiptTitle || "").trim(),
      lastUserPromptTitle: String(group.lastUserPromptTitle || "").trim(),
      lastMessageId: String(group.lastMessageId || "").trim(),
      ownerWorkspaceId: taskGroupOwnerWorkspaceId(group, thread.workspaceId || ""),
      sharedTopic: Boolean(group.sharedTopic),
      kanbanCaseId: String(group.kanbanCaseId || "").trim(),
      kanbanCaseMode: String(group.kanbanCaseMode || "").trim(),
      performerWorkspaceIds: Array.isArray(group.performerWorkspaceIds) ? group.performerWorkspaceIds : [],
      viewerWorkspaceIds: Array.isArray(group.viewerWorkspaceIds) ? group.viewerWorkspaceIds : [],
      directoryRoute: group.directoryRoute || null,
      pluginTopic: Boolean(group.pluginTopic),
      sourceThreadId: String(group.sourceThreadId || "").trim(),
      createdAt: group.createdAt || "",
      updatedAt: group.updatedAt || "",
      messages: [...byId.values()].map((message) => compactMessage(message, thread)),
    };
  }

  function hasDirectoryTopicIndexGap(thread = {}) {
    const meta = normalizeTaskGroupMeta(thread.taskGroupMeta);
    for (const message of Array.isArray(thread.messages) ? thread.messages : []) {
      const taskGroupId = String(message?.taskGroupId || "").trim();
      if (
        !taskGroupId
        || taskGroupId.startsWith("plugin:")
        || taskGroupId.startsWith("case_")
        || !message?.directoryRoute
        || isSingleWindowConversationTaskGroupId(taskGroupId)
      ) {
        continue;
      }
      const indexed = meta[taskGroupId];
      if (!indexed || !indexed.directoryRoute) return true;
    }
    return false;
  }

  function directoryTopicCollectionsForThread(thread = {}) {
    const indexedThread = Object.assign({}, thread, {
      taskGroupMeta: normalizeTaskGroupMeta(thread.taskGroupMeta),
      messages: Array.isArray(thread.messages) ? thread.messages : [],
    });
    if (indexedThread.messages.length || hasDirectoryTopicIndexGap(indexedThread)) {
      directoryTopicIndexService.repairThreadIndexFromMessages(indexedThread, { limit: 5000 });
    }
    return directoryTopicIndexService.listCollections(indexedThread);
  }

  function taskGroupTaskId(group) {
    const assistant = [...(group?.messages || [])].reverse().find((message) => message.role === "assistant");
    return assistant?.taskId || assistant?.runId || group?.id || "task";
  }

  function taskGroupPrompt(group) {
    const user = (group?.messages || []).find((message) => message.role === "user");
    return compactText(user?.content || "", 180);
  }

  function taskGroupTitle(group) {
    return sanitizeTaskTitle(group?.title || "") || taskGroupPrompt(group) || taskGroupTaskId(group);
  }

  function taskGroupPreview(group) {
    const assistant = [...(group?.messages || [])].reverse().find((message) => message.role === "assistant" && message.content);
    return assistantReceiptTitle(assistant, 96) || taskGroupPrompt(group) || "No summary yet";
  }

  function taskGroupStatus(group) {
    if ((group?.messages || []).some((message) => message.status === "running" || message.status === "queued")) return "running";
    if ((group?.messages || []).some((message) => message.status === "failed")) return "failed";
    if ((group?.messages || []).some((message) => message.status === "cancelled")) return "cancelled";
    return "done";
  }

  function taskGroupHaystack(group) {
    const parts = [group?.id || "", group?.title || "", taskGroupTaskId(group)];
    for (const message of group?.messages || []) {
      parts.push(message.content || "", message.taskId || "", message.runId || "");
      if (message.directoryRoute) {
        parts.push(message.directoryRoute.label || "", message.directoryRoute.path || "", message.directoryRoute.root || "");
      }
      for (const alias of Array.isArray(message.directoryAliases) ? message.directoryAliases : []) {
        parts.push(alias?.label || "", alias?.path || "", alias?.root || "");
      }
      for (const artifact of Array.isArray(message.artifacts) ? message.artifacts : []) {
        parts.push(artifact.name || "", artifact.path || "", artifact.displayPath || "", artifact.url || "");
      }
    }
    return parts.join("\n");
  }

  function textIncludesPath(text, root) {
    const raw = String(text || "").replaceAll("\\", "/").toLowerCase();
    const original = String(root || "").replaceAll("\\", "/").replace(/\/+$/g, "").toLowerCase();
    const comparable = comparablePath(root);
    return Boolean(
      original && raw.includes(original) ||
      comparable && raw.includes(comparable)
    );
  }

  function taskGroupMatchesProject(group, project, subproject = null) {
    const target = subproject || project;
    if (!target) return false;
    const haystack = taskGroupHaystack(group);
    if (target.root && textIncludesPath(haystack, target.root)) return true;
    if (!subproject && project?.root && textIncludesPath(haystack, project.root)) return true;
    const normalized = searchableText(haystack);
    for (const label of projectSearchLabels(target, subproject && project ? project.label || "" : "")) {
      const key = searchableText(label);
      if (key.length >= 2 && normalized.includes(key)) return true;
    }
    return false;
  }

  function singleWindowProjectTaskSummaries(workspaceId, project, subproject, search = "") {
    if (!workspaceId || !project || project.id === singleWindowProjectId) return [];
    const lowerSearch = String(search || "").trim().toLowerCase();
    const out = [];
    for (const thread of stateThreads()) {
      if (!thread.singleWindow || thread.workspaceId !== workspaceId) continue;
      for (const group of taskGroupsForThread(thread)) {
        if (taskGroupOwnerWorkspaceId(group, thread.workspaceId) !== workspaceId) continue;
        if (!taskGroupMatchesProject(group, project, subproject)) continue;
        const haystack = `${taskGroupTaskId(group)}\n${taskGroupPrompt(group)}\n${taskGroupPreview(group)}\n${taskGroupHaystack(group)}`.toLowerCase();
        if (lowerSearch && !haystack.includes(lowerSearch)) continue;
        out.push({
          id: `single-task:${thread.id}:${group.id}`,
          title: taskGroupTitle(group),
          workspaceId: thread.workspaceId,
          projectId: project.id,
          subprojectId: subproject?.id || "",
          singleWindowTask: true,
          sourceThreadId: thread.id,
          taskGroupId: group.id,
          status: taskGroupStatus(group),
          activeRunId: "",
          activeRunIds: [],
          createdAt: group.createdAt,
          updatedAt: group.updatedAt,
          preview: taskGroupPreview(group),
        });
      }
    }
    return out;
  }

  function clampPositiveInteger(value, fallback, maxValue = 500) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(maxValue, Math.max(1, Math.floor(parsed)));
  }

  function messagePageTaskGroupId(options = {}) {
    return String(
      options.taskGroupId
        || options.task_group_id
        || (options.groupChat ? singleWindowGroupChatTaskGroupId : singleWindowChatTaskGroupId),
    ).trim() || singleWindowChatTaskGroupId;
  }

  function messagesForThreadMode(thread, options = {}) {
    const messages = Array.isArray(thread?.messages) ? thread.messages : [];
    const mode = String(options.mode || options.messageMode || "").trim().toLowerCase();
    if (mode === "tasks" || mode === "task") {
      const taskGroupId = String(options.taskGroupId || options.task_group_id || "").trim();
      return messages.filter((message) => {
        const groupId = String(message?.taskGroupId || "");
        if (isSingleWindowConversationTaskGroupId(groupId)) return false;
        return !taskGroupId || groupId === taskGroupId;
      });
    }
    if (mode !== "chat") return messages;
    const taskGroupId = messagePageTaskGroupId(options);
    return messages.filter((message) => String(message?.taskGroupId || "") === taskGroupId);
  }

  function threadMessagesPage(thread, options = {}) {
    const limit = clampPositiveInteger(options.limit, threadMessageInitialLimit, 300);
    const allMessages = messagesForThreadMode(thread, options);
    const mode = String(options.mode || options.messageMode || "all").trim().toLowerCase();
    const beforeId = String(options.before || options.beforeMessageId || options.before_message_id || "").trim();
    const beforeIndex = beforeId ? allMessages.findIndex((message) => String(message?.id || "") === beforeId) : -1;
    const end = beforeIndex >= 0 ? beforeIndex : allMessages.length;
    const start = Math.max(0, end - limit);
    const messages = allMessages.slice(start, end);
    return {
      messages,
      page: {
        mode: mode || "all",
        taskGroupId: mode === "chat"
          ? messagePageTaskGroupId(options)
          : String(options.taskGroupId || options.task_group_id || "").trim(),
        total: allMessages.length,
        limit,
        loaded: messages.length,
        hasMoreBefore: start > 0,
        oldestMessageId: messages[0]?.id || "",
        newestMessageId: messages[messages.length - 1]?.id || "",
        before: beforeId,
      },
    };
  }

  function messageSearchText(message = {}) {
    const artifacts = Array.isArray(message.artifacts)
      ? message.artifacts.map((artifact) => [
        artifact?.name,
        artifact?.path,
        artifact?.mime,
      ].filter(Boolean).join(" ")).join("\n")
      : "";
    return [
      message.role,
      message.content,
      message.error,
      artifacts,
    ].filter(Boolean).join("\n").toLowerCase();
  }

  function searchThreadMessages(thread, options = {}) {
    const query = String(options.search || options.q || "").trim().toLowerCase();
    const limit = clampPositiveInteger(options.limit, threadMessageSearchLimit, 300);
    const mode = String(options.mode || options.messageMode || "chat").trim().toLowerCase();
    if (!query) {
      return {
        messages: [],
        page: {
          mode: mode || "chat",
          search: "",
          totalMatches: 0,
          limit,
          hasMoreMatches: false,
        },
      };
    }
    const allMessages = messagesForThreadMode(thread, options);
    const matches = allMessages.filter((message) => messageSearchText(message).includes(query));
    return {
      messages: matches.slice(0, limit),
      page: {
        mode: mode || "chat",
        taskGroupId: mode === "chat"
          ? messagePageTaskGroupId(options)
          : String(options.taskGroupId || options.task_group_id || "").trim(),
        search: query,
        total: allMessages.length,
        totalMatches: matches.length,
        limit,
        hasMoreMatches: matches.length > limit,
        oldestMessageId: matches[0]?.id || "",
        newestMessageId: matches[Math.min(matches.length, limit) - 1]?.id || "",
      },
    };
  }

  function compactMessage(message = {}, thread = null) {
    const resolvedThread = thread || findThreadForMessage(message);
    const gatewayRouting = message.runOptions?.gatewayRouting || {};
    return {
      id: message.id,
      role: message.role,
      content: compactText(message.content || "", maxApiTextChars),
      status: message.status || "done",
      runId: message.runId || null,
      originalRunId: message.originalRunId || null,
      responseRunId: message.responseRunId || null,
      taskId: message.taskId || null,
      taskGroupId: message.taskGroupId || "",
      messageKind: message.messageKind || "ai",
      actorWorkspaceId: message.actorWorkspaceId || "",
      senderWorkspaceId: message.senderWorkspaceId || "",
      senderPrincipalId: message.senderPrincipalId || "",
      senderLabel: message.senderLabel || "",
      replyToMessageId: message.replyToMessageId || "",
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      submittedAt: message.submittedAt || null,
      queuedAt: message.queuedAt || null,
      startedAt: message.startedAt || null,
      firstFeedbackAt: message.firstFeedbackAt || null,
      completedAt: message.completedAt || null,
      failedAt: message.failedAt || null,
      cancelledAt: message.cancelledAt || null,
      revokedAt: message.revokedAt || null,
      revokedByWorkspaceId: message.revokedByWorkspaceId || "",
      revokedByPrincipalId: message.revokedByPrincipalId || "",
      revokedByLabel: message.revokedByLabel || "",
      usage: message.usage || null,
      loadedSkills: loadedSkillsForPublicMessage(message),
      loadedTools: loadedToolsForPublicMessage(message, resolvedThread),
      model: message.model || message.modelName || message.runOptions?.model || "",
      modelProvider: message.modelProvider || message.model_provider || message.provider || message.runOptions?.provider || "",
      error: message.error || null,
      artifacts: compactArtifactsForMessage(message, resolvedThread),
      directoryAliases: Array.isArray(message.directoryAliases) ? message.directoryAliases : [],
      directoryRoute: message.directoryRoute || null,
      reasoningEffort: message.reasoningEffort || "",
      gatewayName: message.gatewayName || "",
      gatewayProfile: message.gatewayProfile || "",
      gatewaySource: message.gatewaySource || "",
      gatewaySecurityLevel: gatewayRouting.securityLevel || gatewayRouting.security_level || "",
      gatewayMaintenance: Boolean(gatewayRouting.maintenance || gatewayRouting.allowMaintenance || gatewayRouting.allow_maintenance),
      gatewayMaintenanceCategory: gatewayRouting.maintenanceCategory || gatewayRouting.maintenance_category || "",
      externalDelivery: null,
      elevationRequired: Boolean(message.elevationRequired),
      elevationScope: message.elevationScope || "",
      elevationReason: message.elevationReason || "",
      elevationSource: message.elevationSource || "",
      toolsetEscalationRequired: Boolean(message.toolsetEscalationRequired),
      toolsetEscalationToolsets: Array.isArray(message.toolsetEscalationToolsets) ? message.toolsetEscalationToolsets : [],
      toolsetEscalationReason: message.toolsetEscalationReason || "",
      toolsetEscalationSource: message.toolsetEscalationSource || "",
      pluginActions: publicPluginActions(message.pluginActions || {}, {
        workspaceId: message.actorWorkspaceId || message.senderWorkspaceId || resolvedThread?.workspaceId || "",
        principalId: message.senderPrincipalId || message.actorPrincipalId || message.actorWorkspaceId || message.senderWorkspaceId || resolvedThread?.workspaceId || "",
      }),
      truncated: typeof message.content === "string" && message.content.length > maxApiTextChars,
    };
  }

  function compactThread(thread = {}, options = {}) {
    const messagePage = options.messagePage || null;
    const messages = Array.isArray(options.messages) ? options.messages : (thread.messages || []);
    const taskGroups = taskGroupsForProjection(thread, messages)
      .filter((group) => !isSingleWindowConversationTaskGroupId(group.id));
    return {
      id: thread.id,
      title: thread.title,
      workspaceId: thread.workspaceId,
      projectId: thread.projectId,
      subprojectId: thread.subprojectId || "",
      singleWindow: Boolean(thread.singleWindow),
      hermesSessionId: thread.hermesSessionId,
      status: thread.status,
      activeRunId: thread.activeRunId,
      activeRunIds: Array.isArray(thread.activeRunIds) ? thread.activeRunIds : [],
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      taskGroupMeta: normalizeTaskGroupMeta(thread.taskGroupMeta),
      taskGroups: taskGroups.map((group) => compactTaskGroupForDirectoryIndex(group, thread)),
      directoryTopicCollections: directoryTopicCollectionsForThread(thread),
      chatGroup: publicChatGroup(thread),
      externalIngress: publicExternalIngress(thread),
      messages: messages.map((message) => compactMessage(message, thread)),
      messagesPage: messagePage,
      events: (thread.events || []).slice(-maxStoredEventsPerThread).map(compactThreadEvent),
    };
  }

  function compactThreadWithMessagePage(thread, options = {}) {
    const page = threadMessagesPage(thread, options);
    return compactThread(thread, { messages: page.messages, messagePage: page.page });
  }

  return {
    compactMessage,
    compactThread,
    compactThreadWithMessagePage,
    messageOwnerWorkspaceId,
    messagePageTaskGroupId,
    messagesForThreadMode,
    searchThreadMessages,
    singleWindowProjectTaskSummaries,
    taskGroupHaystack,
    taskGroupMatchesProject,
    taskGroupOwnerWorkspaceId,
    taskGroupPreview,
    taskGroupsForThread,
    taskGroupStatus,
    taskGroupTaskId,
    taskGroupTitle,
    taskGroupPrompt,
    textIncludesPath,
    threadMessagesPage,
    threadSummary,
  };
}

module.exports = {
  createThreadViewService,
};
