"use strict";

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

function createThreadViewService(deps = {}) {
  const maxApiTextChars = Math.max(1, Number(deps.maxApiTextChars || 80_000) || 80_000);
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
  const publicWeixinOutboundDelivery = typeof deps.publicWeixinOutboundDelivery === "function"
    ? deps.publicWeixinOutboundDelivery
    : (() => null);
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

  function taskGroupsForThread(thread = {}) {
    const groups = new Map();
    let currentTaskGroupId = "";
    const meta = normalizeTaskGroupMeta(thread?.taskGroupMeta);
    for (const message of thread?.messages || []) {
      let groupId = message.taskGroupId || "";
      if (!groupId) groupId = currentTaskGroupId || message.taskId || `task_${message.id}`;
      currentTaskGroupId = groupId;
      if (!groups.has(groupId)) {
        const groupMeta = meta[groupId] || {};
        groups.set(groupId, {
          id: groupId,
          title: groupMeta.title || "",
          messages: [],
          createdAt: message.createdAt,
          updatedAt: groupMeta.updatedAt || message.updatedAt || message.createdAt,
        });
      }
      const group = groups.get(groupId);
      group.messages.push(message);
      const updatedAt = message.completedAt || message.failedAt || message.cancelledAt || message.updatedAt || message.createdAt || "";
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
    const messages = group?.messages || [];
    const user = messages.find((message) => message.role === "user");
    return messageOwnerWorkspaceId(user || messages[0], fallback);
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
    return compactText(assistant?.content || "", 180) || taskGroupPrompt(group) || "No summary yet";
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
      externalDelivery: message.externalDelivery?.source === "weixin" && resolvedThread
        ? publicWeixinOutboundDelivery(resolvedThread, message)
        : null,
      elevationRequired: Boolean(message.elevationRequired),
      elevationScope: message.elevationScope || "",
      elevationReason: message.elevationReason || "",
      elevationSource: message.elevationSource || "",
      truncated: typeof message.content === "string" && message.content.length > maxApiTextChars,
    };
  }

  function compactThread(thread = {}, options = {}) {
    const messagePage = options.messagePage || null;
    const messages = Array.isArray(options.messages) ? options.messages : (thread.messages || []);
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
      chatGroup: publicChatGroup(thread),
      externalIngress: publicExternalIngress(thread),
      messages: messages.map((message) => compactMessage(message, thread)),
      messagesPage: messagePage,
      events: (thread.events || []).slice(-maxStoredEventsPerThread),
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
