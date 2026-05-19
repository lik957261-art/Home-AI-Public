"use strict";

const { resolveSearchSourceForMessage: defaultResolveSearchSourceForMessage } = require("./search-source-routing-service");

const DEFAULT_SINGLE_WINDOW_CHAT_TASK_GROUP_ID = "chat";
const DEFAULT_SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID = "group-chat";
const DEFAULT_VALID_REASONING_EFFORTS = new Set(["none", "low", "medium", "high"]);
const DEFAULT_MAX_USER_MESSAGE_CHARS = 240_000;

function cleanString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function objectValue(value, fallback = {}) {
  return value && typeof value === "object" ? value : fallback;
}

function maybeCall(fn, fallback) {
  return typeof fn === "function" ? fn : fallback;
}

function positiveInteger(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
}

function normalizeSingleWindowMode(value) {
  return String(value || "").trim().toLowerCase() === "chat" ? "chat" : "task";
}

function defaultSingleWindowChatTaskGroupId(requestedTaskGroupId = "", groupChatTaskGroupId = DEFAULT_SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID) {
  return cleanString(requestedTaskGroupId) === groupChatTaskGroupId
    ? groupChatTaskGroupId
    : DEFAULT_SINGLE_WINDOW_CHAT_TASK_GROUP_ID;
}

function defaultSanitizeTaskGroupId(value) {
  return cleanString(value).slice(0, 160);
}

function defaultNormalizeTaskGroupMeta(value) {
  return objectValue(value);
}

function hasReasoningEffort(validReasoningEfforts, effort) {
  const value = cleanString(effort).toLowerCase();
  if (!value) return false;
  if (validReasoningEfforts && typeof validReasoningEfforts.has === "function") return validReasoningEfforts.has(value);
  if (Array.isArray(validReasoningEfforts)) return validReasoningEfforts.includes(value);
  return DEFAULT_VALID_REASONING_EFFORTS.has(value);
}

function errorResult(status, error, extra = {}) {
  return {
    ok: false,
    status,
    error,
    response: Object.assign({ error }, extra),
  };
}

function mergeAccessPolicyContexts(...policies) {
  const list = (value) => Array.isArray(value) ? value : (value ? [value] : []);
  const out = {};
  for (const policy of policies) {
    if (!policy || typeof policy !== "object") continue;
    const existingToolsets = out.allowed_toolsets || [];
    const existingConnectorProfiles = out.connector_profiles || {};
    Object.assign(out, policy);
    out.allowed_toolsets = [
      ...existingToolsets,
      ...list(policy.allowed_toolsets || policy.allowedToolsets),
    ];
    out.connector_profiles = Object.assign(
      {},
      existingConnectorProfiles,
      policy.connector_profiles || policy.connectorProfiles || {},
    );
  }
  if (Array.isArray(out.allowed_toolsets)) {
    const seen = new Set();
    out.allowed_toolsets = out.allowed_toolsets
      .map((item) => cleanString(item))
      .filter((item) => {
        if (!item || seen.has(item)) return false;
        seen.add(item);
        return true;
      });
  }
  if (!Object.keys(out.connector_profiles || {}).length) delete out.connector_profiles;
  delete out.allowedToolsets;
  delete out.connectorProfiles;
  return Object.keys(out).length ? out : null;
}

function createThreadMessageCreateService(options = {}) {
  const groupChatTaskGroupId = cleanString(options.groupChatTaskGroupId, DEFAULT_SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID);
  const validReasoningEfforts = options.validReasoningEfforts || DEFAULT_VALID_REASONING_EFFORTS;
  const maxUserMessageChars = positiveInteger(
    options.maxUserMessageChars || options.maxMessageChars,
    DEFAULT_MAX_USER_MESSAGE_CHARS,
  );

  const authCanAccessWorkspace = maybeCall(options.authCanAccessWorkspace, () => false);
  const buildUserMessageContent = maybeCall(options.buildUserMessageContent, (text) => cleanString(text));
  const broadcast = maybeCall(options.broadcast, () => {});
  const chatGroupMemberWorkspaceIds = maybeCall(options.chatGroupMemberWorkspaceIds, () => []);
  const compactMessage = maybeCall(options.compactMessage, (message) => message);
  const deriveTitle = maybeCall(options.deriveTitle, (text) => cleanString(text, "New thread"));
  const detectDirectKanbanCreateRequest = maybeCall(options.detectDirectKanbanCreateRequest, () => false);
  const detectDirectTodoCreateIntent = maybeCall(options.detectDirectTodoCreateIntent, () => null);
  const detectDirectTodoCreateIntentForWeb = maybeCall(options.detectDirectTodoCreateIntentForWeb, () => null);
  const directTodoCreateEnabled = maybeCall(options.directTodoCreateEnabled, () => false);
  const formatDirectTodoCreateSuccessMessage = maybeCall(options.formatDirectTodoCreateSuccessMessage, () => "");
  const gatewayRoutingForModelRun = maybeCall(options.gatewayRoutingForModelRun, () => ({ securityLevel: "user", maintenance: false }));
  const isKanbanCaseTopicThread = maybeCall(options.isKanbanCaseTopicThread, () => false);
  const isOwnerAuth = maybeCall(options.isOwnerAuth, () => false);
  const kanbanCaseTopicPermissionsForTaskGroup = maybeCall(options.kanbanCaseTopicPermissionsForTaskGroup, () => null);
  const kanbanSingleCardCasePayload = maybeCall(options.kanbanSingleCardCasePayload, () => ({}));
  const makeId = maybeCall(options.makeId, (prefix = "id") => `${prefix}-${Date.now()}`);
  const normalizeTaskGroupMeta = maybeCall(options.normalizeTaskGroupMeta, defaultNormalizeTaskGroupMeta);
  const nowIso = maybeCall(options.nowIso, () => new Date().toISOString());
  const ownerElevationInstructions = maybeCall(options.ownerElevationInstructions, () => "");
  const publicArtifactFromClient = maybeCall(options.publicArtifactFromClient, (value) => objectValue(value, null));
  const removeThreadActiveRun = maybeCall(options.removeThreadActiveRun, () => {});
  const resolveSearchSourceForMessage = maybeCall(options.resolveSearchSourceForMessage, defaultResolveSearchSourceForMessage);
  const resolveTaskDirectoryAttachment = maybeCall(options.resolveTaskDirectoryAttachment, () => null);
  const runConcurrencyError = maybeCall(options.runConcurrencyError, () => null);
  const runConcurrencySnapshot = maybeCall(options.runConcurrencySnapshot, () => null);
  const sanitizeTaskGroupId = maybeCall(options.sanitizeTaskGroupId, defaultSanitizeTaskGroupId);
  const saveState = maybeCall(options.saveState, () => {});
  const semanticTaskDirectoryAttachment = maybeCall(options.semanticTaskDirectoryAttachment, () => null);
  const senderInfoForWorkspace = maybeCall(options.senderInfoForWorkspace, (workspaceId) => ({
    senderWorkspaceId: cleanString(workspaceId, "owner"),
    senderPrincipalId: cleanString(workspaceId, "owner"),
    senderLabel: cleanString(workspaceId, "owner"),
  }));
  const singleWindowChatTaskGroupId = maybeCall(
    options.singleWindowChatTaskGroupId,
    (requestedTaskGroupId) => defaultSingleWindowChatTaskGroupId(requestedTaskGroupId, groupChatTaskGroupId),
  );
  const startRunForThread = maybeCall(options.startRunForThread, async () => ({ status: "started" }));
  const taskDirectoryAttachmentForGroup = maybeCall(options.taskDirectoryAttachmentForGroup, () => null);
  const taskGroupHasRunningRun = maybeCall(options.taskGroupHasRunningRun, () => false);
  const threadSummary = maybeCall(options.threadSummary, (thread) => thread);
  const todoAssigneeLabel = maybeCall(options.todoAssigneeLabel, (_workspaceId, principalId) => cleanString(principalId, "owner"));
  const useKanbanTodoBackend = maybeCall(options.useKanbanTodoBackend, () => false);
  const workspaceIdForPrincipal = maybeCall(options.workspaceIdForPrincipal, (principalId) => cleanString(principalId));
  const notifyGroupChatMentions = maybeCall(options.notifyGroupChatMentions, () => {});
  const notifyTodoCreated = maybeCall(options.notifyTodoCreated, () => {});
  const workspacePrincipal = maybeCall(options.workspacePrincipal, (workspaceId) => cleanString(workspaceId, "owner"));

  function normalizeBody(body = {}) {
    const source = objectValue(body);
    return {
      source,
      text: cleanString(source.text),
      uploadArtifacts: Array.isArray(source.artifacts) ? source.artifacts : [],
      singleWindowMode: normalizeSingleWindowMode(source.singleWindowMode || source.single_window_mode || ""),
      requestedActorWorkspaceId: cleanString(source.workspaceId || source.actorWorkspaceId || source.actor_workspace_id || ""),
      requestedReasoningEffort: cleanString(source.reasoning_effort),
    };
  }

  function validateThreadAvailability(thread) {
    if (!thread) return errorResult(404, "Thread not found");
    if (!thread.singleWindow && (thread.activeRunId || (thread.activeRunIds || []).length)) {
      return errorResult(409, "Thread already has an active Hermes run");
    }
    return { ok: true };
  }

  function resolveQuotedMessage(thread, body, singleWindowMode) {
    const replyToMessageId = singleWindowMode === "chat"
      ? ""
      : (body.replyToMessageId ? String(body.replyToMessageId).slice(0, 120) : "");
    const quotedMessage = replyToMessageId
      ? (thread.messages || []).find((message) => message.id === replyToMessageId)
      : null;
    if (replyToMessageId && !quotedMessage) {
      return errorResult(400, "Quoted message not found");
    }
    return { ok: true, replyToMessageId, quotedMessage };
  }

  function resolveTaskGroup(thread, body, singleWindowMode, quotedMessage) {
    const bodyTaskGroupId = body.taskGroupId ? sanitizeTaskGroupId(body.taskGroupId) : "";
    const quotedTaskGroupId = quotedMessage?.taskGroupId ? sanitizeTaskGroupId(quotedMessage.taskGroupId) : "";
    if (bodyTaskGroupId && quotedTaskGroupId && bodyTaskGroupId !== quotedTaskGroupId) {
      return errorResult(400, "Quoted message does not belong to the requested task group");
    }

    const requestedTaskGroupId = bodyTaskGroupId || quotedTaskGroupId;
    const normalizedTaskGroupMeta = normalizeTaskGroupMeta(thread.taskGroupMeta);
    const requestedCaseTopicChat = Boolean(
      thread.singleWindow
      && singleWindowMode === "chat"
      && isKanbanCaseTopicThread(thread)
      && requestedTaskGroupId
      && normalizedTaskGroupMeta[requestedTaskGroupId]?.sharedTopic
    );
    const taskGroupId = thread.singleWindow
      ? (
        requestedCaseTopicChat
          ? requestedTaskGroupId
          : (singleWindowMode === "chat" ? singleWindowChatTaskGroupId(requestedTaskGroupId) : (requestedTaskGroupId || makeId("task")))
      )
      : "";

    if (thread.singleWindow && taskGroupId === groupChatTaskGroupId && singleWindowMode !== "chat") {
      return errorResult(400, "Group chat messages must use chat mode");
    }

    return {
      ok: true,
      bodyTaskGroupId,
      quotedTaskGroupId,
      requestedTaskGroupId,
      normalizedTaskGroupMeta,
      requestedCaseTopicChat,
      taskGroupId,
    };
  }

  function resolveGroupChat(thread, singleWindowMode, taskGroupId, requestedCaseTopicChat) {
    const groupMemberIds = chatGroupMemberWorkspaceIds(thread);
    const requestedGroupChat = Boolean(
      thread.singleWindow
      && singleWindowMode === "chat"
      && taskGroupId === groupChatTaskGroupId
    );
    const isGroupChatMessage = requestedGroupChat && groupMemberIds.length > 0;
    if (requestedGroupChat && !isGroupChatMessage) {
      return errorResult(403, "Group chat is not enabled for this thread");
    }

    const isCaseTopicChatMessage = requestedCaseTopicChat && groupMemberIds.length > 0;
    if (requestedCaseTopicChat && !isCaseTopicChatMessage) {
      return errorResult(403, "Shared learning topic chat is not enabled for this thread");
    }

    return {
      ok: true,
      groupMemberIds,
      requestedGroupChat,
      isGroupChatMessage,
      isCaseTopicChatMessage,
    };
  }

  function resolveActorWorkspaceId(thread, body, auth, groupMemberIds, isGroupChatMessage, isCaseTopicChatMessage) {
    let actorWorkspaceId = thread.workspaceId;
    const requestedActorWorkspaceId = cleanString(body.workspaceId || body.actorWorkspaceId || body.actor_workspace_id || "");
    if (requestedActorWorkspaceId && authCanAccessWorkspace(auth, requestedActorWorkspaceId)) {
      actorWorkspaceId = requestedActorWorkspaceId;
    } else if (!isOwnerAuth(auth) && auth?.workspaceId) {
      actorWorkspaceId = auth.workspaceId;
    }
    if ((isGroupChatMessage || isCaseTopicChatMessage) && !groupMemberIds.includes(actorWorkspaceId)) {
      return errorResult(403, "Selected workspace is not a group chat member");
    }
    return { ok: true, actorWorkspaceId };
  }

  function resolveMessageKind(body, isGroupChatMessage, isCaseTopicChatMessage) {
    const requested = cleanString(body.messageKind || body.message_kind);
    return (isGroupChatMessage || isCaseTopicChatMessage) && requested === "plain" ? "plain" : "ai";
  }

  function resolveGatewayRouting(auth, text, body, actorWorkspaceId, messageKind) {
    if (messageKind !== "ai") return { ok: true, gatewayRouting: { securityLevel: "user", maintenance: false } };
    try {
      return {
        ok: true,
        gatewayRouting: gatewayRoutingForModelRun(auth, text, Object.assign({}, body, { actorWorkspaceId })),
      };
    } catch (err) {
      return errorResult(err.status || 403, err.message || String(err), {
        code: err.code || "gateway_security_boundary",
        operatorRequired: Boolean(err.operatorRequired),
        elevationRequired: Boolean(err.elevationRequired),
        elevationScope: err.elevationScope || "",
      });
    }
  }

  function resolveDirectoryAttachment(thread, body, text, singleWindowMode, requestedTaskGroupId, isCaseTopicChatMessage) {
    const allowAutomaticDirectoryAttachment = singleWindowMode !== "chat";
    return resolveTaskDirectoryAttachment(thread, body.directory || body.directoryRoute || {})
      || ((singleWindowMode === "chat" && !isCaseTopicChatMessage) ? null : taskDirectoryAttachmentForGroup(thread, requestedTaskGroupId))
      || (allowAutomaticDirectoryAttachment ? semanticTaskDirectoryAttachment(thread, text) : null);
  }

  function buildMessages(thread, body, normalized, context) {
    const {
      actorWorkspaceId,
      createdAt,
      directoryAttachment,
      messageKind,
      quotedMessage,
      reasoningEffort,
      singleWindowMode,
      taskGroupId,
      searchSource,
    } = context;
    const senderInfo = senderInfoForWorkspace(actorWorkspaceId);
    const userMessage = {
      id: makeId("msg"),
      role: "user",
      content: buildUserMessageContent(normalized.text, normalized.uploadArtifacts),
      status: "done",
      createdAt,
      updatedAt: createdAt,
      submittedAt: createdAt,
      artifacts: normalized.uploadArtifacts.map(publicArtifactFromClient).filter(Boolean),
      taskGroupId,
      messageKind,
      senderWorkspaceId: senderInfo.senderWorkspaceId,
      senderPrincipalId: senderInfo.senderPrincipalId,
      senderLabel: senderInfo.senderLabel,
      actorWorkspaceId,
      replyToMessageId: quotedMessage?.id || "",
      directoryAliases: directoryAttachment ? [directoryAttachment] : [],
      directoryRoute: directoryAttachment || null,
      reasoningEffort,
      singleWindowMode,
    };
    if (searchSource?.explicit) {
      userMessage.searchSource = searchSource.source;
      userMessage.sourceIntent = searchSource.sourceIntent;
      userMessage.sourceMode = searchSource.sourceMode;
    }

    const assistantMessage = {
      id: makeId("msg"),
      role: "assistant",
      content: "",
      status: "queued",
      runId: null,
      createdAt,
      updatedAt: createdAt,
      queuedAt: createdAt,
      artifacts: [],
      taskGroupId,
      messageKind: "ai",
      senderWorkspaceId: "hermes",
      senderPrincipalId: "hermes",
      senderLabel: "Hermes",
      actorWorkspaceId,
      reasoningEffort,
      singleWindowMode,
    };
    if (searchSource?.explicit) {
      assistantMessage.searchSource = searchSource.source;
      assistantMessage.sourceIntent = searchSource.sourceIntent;
      assistantMessage.sourceMode = searchSource.sourceMode;
    }

    return { userMessage, assistantMessage };
  }

  function directActionForPlan(thread, text) {
    if (useKanbanTodoBackend() && detectDirectKanbanCreateRequest(text)) {
      return { type: "kanban", action: "direct-kanban-create" };
    }
    const todoIntent = directTodoCreateEnabled()
      ? (detectDirectTodoCreateIntentForWeb(text, thread.workspaceId) || detectDirectTodoCreateIntent(text, thread.workspaceId))
      : null;
    if (todoIntent) {
      return { type: "todo", action: "direct-todo-create", intent: todoIntent };
    }
    return { type: "none", action: "" };
  }

  function buildDirectTodoAddPayload(plan) {
    const intent = plan?.directAction?.intent;
    if (!intent) return null;
    return {
      workspaceId: plan.thread.workspaceId,
      assignee: intent.assignee,
      content: intent.content,
      dueTime: intent.dueTime,
      suppressExternalNotice: true,
      reminderLeadMinutes: null,
      recurrence: "none",
      recurrenceDays: "",
      recurrenceUntil: "",
      manualOnly: true,
    };
  }

  function buildDirectKanbanAddPayload(plan, kanbanDraft = {}) {
    if (plan?.directAction?.type !== "kanban") return null;
    return Object.assign({
      workspaceId: plan.thread.workspaceId,
      assignee: kanbanDraft.assignee,
      assigneeLabel: todoAssigneeLabel(plan.thread.workspaceId, kanbanDraft.assignee),
      content: kanbanDraft.content,
      description: kanbanDraft.description,
      dueTime: kanbanDraft.dueTime,
      reason: kanbanDraft.reason,
    }, kanbanSingleCardCasePayload(kanbanDraft.content, kanbanDraft.description, plan.text));
  }

  function buildFollowUpInstructions(thread, singleWindowMode, requestedTaskGroupId) {
    if (!thread.singleWindow) return "";
    if (singleWindowMode === "chat") {
      return "The latest user message is a Hermes Mobile continuous-chat turn. Treat it as part of the supplied same-task conversation_history.";
    }
    if (requestedTaskGroupId) {
      return "The latest user message is an explicit Web quote/reply to an existing task group. Treat it as a follow-up to the supplied same-task conversation_history, not as a new independent task.";
    }
    return "";
  }

  function buildRunOptions(thread, body, context) {
    const followUpInstructions = buildFollowUpInstructions(thread, context.singleWindowMode, context.requestedTaskGroupId);
    const searchSource = context.searchSource || {};
    const runOptions = {
      reasoning_effort: context.reasoningEffort,
      singleWindowMode: context.singleWindowMode,
      actorWorkspaceId: context.actorWorkspaceId,
      gatewayRouting: context.gatewayRouting,
      instructions: [
        body.instructions || "",
        searchSource.instructions || "",
        ownerElevationInstructions(body),
        followUpInstructions,
      ].filter(Boolean).join("\n\n"),
    };
    if (searchSource.explicit) {
      runOptions.searchSource = searchSource.source;
      runOptions.sourceIntent = searchSource.sourceIntent;
      runOptions.sourceMode = searchSource.sourceMode;
    }
    if (body.model) runOptions.model = body.model;
    if (body.reasoning && typeof body.reasoning === "object") runOptions.reasoning = body.reasoning;
    const accessPolicyContext = mergeAccessPolicyContexts(
      body.access_policy_context && typeof body.access_policy_context === "object" ? body.access_policy_context : null,
      searchSource.accessPolicyContext,
    );
    if (accessPolicyContext) {
      runOptions.access_policy_context = accessPolicyContext;
    }
    return { runOptions, followUpInstructions };
  }

  function compactResponseDescriptor(thread, body, singleWindowMode, taskGroupId) {
    if (thread.singleWindow && singleWindowMode === "chat") {
      return {
        type: "message-page",
        options: {
          mode: "chat",
          taskGroupId,
          groupChat: taskGroupId === groupChatTaskGroupId,
          limit: body.messageLimit || body.message_limit,
        },
      };
    }
    return { type: "thread", options: {} };
  }

  function prepareThreadMessageCreate(input = {}) {
    const thread = input.thread;
    const availability = validateThreadAvailability(thread);
    if (!availability.ok) return availability;

    const body = objectValue(input.body);
    const normalized = normalizeBody(body);
    if (!normalized.text && !normalized.uploadArtifacts.length) {
      return errorResult(400, "Message text is required");
    }
    if (normalized.text && normalized.text.length > maxUserMessageChars) {
      return errorResult(413, "Message is too large. Please attach it as a file or split it into smaller messages.", {
        code: "message_text_too_large",
        maxChars: maxUserMessageChars,
      });
    }

    const auth = objectValue(input.auth, null);
    const createdAt = input.createdAt || nowIso();
    const titleUpdate = thread.title === "New thread"
      ? { shouldUpdate: true, title: deriveTitle(normalized.text) }
      : { shouldUpdate: false, title: thread.title || "" };

    const quoted = resolveQuotedMessage(thread, body, normalized.singleWindowMode);
    if (!quoted.ok) return quoted;

    const taskGroup = resolveTaskGroup(thread, body, normalized.singleWindowMode, quoted.quotedMessage);
    if (!taskGroup.ok) return taskGroup;

    const groupChat = resolveGroupChat(thread, normalized.singleWindowMode, taskGroup.taskGroupId, taskGroup.requestedCaseTopicChat);
    if (!groupChat.ok) return groupChat;

    if (thread.singleWindow && normalized.singleWindowMode !== "chat") {
      const caseTopicPermissions = kanbanCaseTopicPermissionsForTaskGroup(thread, taskGroup.taskGroupId, auth);
      if (caseTopicPermissions && !caseTopicPermissions.canSubmitStudy && !caseTopicPermissions.canManage) {
        return errorResult(403, "This shared learning topic is read-only for the current workspace");
      }
    }

    const actor = resolveActorWorkspaceId(
      thread,
      body,
      auth,
      groupChat.groupMemberIds,
      groupChat.isGroupChatMessage,
      groupChat.isCaseTopicChatMessage,
    );
    if (!actor.ok) return actor;

    const messageKind = resolveMessageKind(body, groupChat.isGroupChatMessage, groupChat.isCaseTopicChatMessage);
    const searchSource = resolveSearchSourceForMessage(body, normalized.text);
    const routingBody = Object.assign({}, body, {
      searchSource: searchSource.source,
      search_source: searchSource.source,
      sourceIntent: searchSource.sourceIntent,
      source_intent: searchSource.sourceIntent,
      sourceMode: searchSource.sourceMode,
      source_mode: searchSource.sourceMode,
    });
    const routing = resolveGatewayRouting(auth, normalized.text, routingBody, actor.actorWorkspaceId, messageKind);
    if (!routing.ok) return routing;

    const reasoningEffort = hasReasoningEffort(validReasoningEfforts, normalized.requestedReasoningEffort)
      ? normalized.requestedReasoningEffort
      : "";
    const directoryAttachment = resolveDirectoryAttachment(
      thread,
      body,
      normalized.text,
      normalized.singleWindowMode,
      taskGroup.requestedTaskGroupId,
      groupChat.isCaseTopicChatMessage,
    );
    const messages = buildMessages(thread, body, normalized, {
      actorWorkspaceId: actor.actorWorkspaceId,
      createdAt,
      directoryAttachment,
      messageKind,
      quotedMessage: quoted.quotedMessage,
      reasoningEffort,
      searchSource,
      singleWindowMode: normalized.singleWindowMode,
      taskGroupId: taskGroup.taskGroupId,
    });

    const basePlan = {
      ok: true,
      thread,
      auth,
      body,
      normalizedBody: normalized,
      text: normalized.text,
      uploadArtifacts: normalized.uploadArtifacts,
      createdAt,
      titleUpdate,
      quotedMessage: quoted.quotedMessage,
      replyToMessageId: quoted.replyToMessageId,
      requestedTaskGroupId: taskGroup.requestedTaskGroupId,
      taskGroupId: taskGroup.taskGroupId,
      requestedCaseTopicChat: taskGroup.requestedCaseTopicChat,
      groupMemberIds: groupChat.groupMemberIds,
      isGroupChatMessage: groupChat.isGroupChatMessage,
      isCaseTopicChatMessage: groupChat.isCaseTopicChatMessage,
      actorWorkspaceId: actor.actorWorkspaceId,
      senderInfo: {
        senderWorkspaceId: messages.userMessage.senderWorkspaceId,
        senderPrincipalId: messages.userMessage.senderPrincipalId,
        senderLabel: messages.userMessage.senderLabel,
      },
      messageKind,
      gatewayRouting: routing.gatewayRouting,
      reasoningEffort,
      searchSource,
      directoryAttachment,
      userMessage: messages.userMessage,
      assistantMessage: messages.assistantMessage,
      responseDescriptor: compactResponseDescriptor(thread, body, normalized.singleWindowMode, taskGroup.taskGroupId),
    };

    if ((groupChat.isGroupChatMessage || groupChat.isCaseTopicChatMessage) && messageKind === "plain") {
      return Object.assign(basePlan, {
        nextAction: "plain-message",
        directAction: { type: "none", action: "" },
      });
    }

    const directAction = directActionForPlan(thread, normalized.text);
    if (directAction.type !== "none") {
      return Object.assign(basePlan, {
        nextAction: directAction.action,
        directAction,
      });
    }

    const run = buildRunOptions(thread, body, {
      actorWorkspaceId: actor.actorWorkspaceId,
      gatewayRouting: routing.gatewayRouting,
      reasoningEffort,
      requestedTaskGroupId: taskGroup.requestedTaskGroupId,
      searchSource,
      singleWindowMode: normalized.singleWindowMode,
    });
    messages.assistantMessage.runOptions = run.runOptions;

    const queueBehindActiveChatRun = Boolean(
      thread.singleWindow
      && normalized.singleWindowMode === "chat"
      && taskGroup.taskGroupId
      && taskGroupHasRunningRun(thread, taskGroup.taskGroupId)
    );
    if (!queueBehindActiveChatRun) {
      const concurrencyError = runConcurrencyError(actor.actorWorkspaceId);
      if (concurrencyError) {
        return errorResult(concurrencyError.status || 429, concurrencyError.message, {
          code: concurrencyError.code,
          concurrency: concurrencyError.snapshot || runConcurrencySnapshot(),
        });
      }
    }

    return Object.assign(basePlan, {
      nextAction: queueBehindActiveChatRun ? "queue-run" : "start-run",
      directAction,
      followUpInstructions: run.followUpInstructions,
      runOptions: run.runOptions,
      queueBehindActiveChatRun,
    });
  }

  function applyTitleUpdate(thread, plan) {
    if (plan?.titleUpdate?.shouldUpdate) thread.title = plan.titleUpdate.title;
    return thread.title;
  }

  function ensureMessageArray(thread) {
    if (!Array.isArray(thread.messages)) thread.messages = [];
    return thread.messages;
  }

  function broadcastThreadUpdated(thread) {
    broadcast({ type: "thread.updated", threadId: thread.id, thread: threadSummary(thread) });
  }

  function broadcastMessageUpdated(thread, message) {
    broadcast({
      type: "message.updated",
      threadId: thread.id,
      message: compactMessage(message),
      thread: threadSummary(thread),
    });
  }

  function commitPlainMessage(thread, plan) {
    applyTitleUpdate(thread, plan);
    ensureMessageArray(thread).push(plan.userMessage);
    thread.status = (thread.activeRunIds || []).length ? "running" : "idle";
    thread.updatedAt = plan.createdAt;
    saveState();
    broadcastThreadUpdated(thread);
    broadcastMessageUpdated(thread, plan.userMessage);
    notifyGroupChatMentions(thread, plan.userMessage);
    return {
      ok: true,
      status: 201,
      nextAction: "plain-message",
      thread,
      message: plan.userMessage,
    };
  }

  function markRunStartFailed(thread, assistantMessage, err) {
    const failedAt = nowIso();
    assistantMessage.status = "failed";
    assistantMessage.error = err?.message || String(err);
    assistantMessage.failedAt = failedAt;
    assistantMessage.updatedAt = failedAt;
    removeThreadActiveRun(thread, assistantMessage.runId, "failed");
    thread.updatedAt = failedAt;
    saveState();
    broadcast({
      type: "run.failed",
      threadId: thread.id,
      runId: assistantMessage.runId || "",
      message: compactMessage(assistantMessage),
      thread: threadSummary(thread),
    });
    return { status: "failed", failedAt, error: assistantMessage.error };
  }

  async function commitRunMessageAndDispatch(thread, plan) {
    applyTitleUpdate(thread, plan);
    ensureMessageArray(thread).push(plan.userMessage, plan.assistantMessage);
    thread.status = plan.queueBehindActiveChatRun && (thread.activeRunIds || []).length ? "running" : "queued";
    thread.updatedAt = plan.createdAt;
    saveState();
    broadcastThreadUpdated(thread);
    broadcastMessageUpdated(thread, plan.userMessage);
    broadcastMessageUpdated(thread, plan.assistantMessage);
    if (plan.isGroupChatMessage) notifyGroupChatMentions(thread, plan.userMessage);

    if (plan.queueBehindActiveChatRun) {
      return {
        ok: true,
        status: 202,
        run: { status: "queued", taskGroupId: plan.taskGroupId, engine: "responses" },
        thread,
      };
    }

    try {
      const run = await startRunForThread(thread, plan.userMessage, plan.assistantMessage, plan.runOptions);
      return { ok: true, status: 202, run, thread };
    } catch (err) {
      markRunStartFailed(thread, plan.assistantMessage, err);
      return {
        ok: false,
        status: err.status || 502,
        error: plan.assistantMessage.error,
        thread,
      };
    }
  }

  function directTodoSuccessNotification(result, plan) {
    const assigneeWorkspaceId = workspaceIdForPrincipal(plan.directAction?.intent?.assignee);
    const updates = [{ type: "todos.updated", workspaceId: plan.thread.workspaceId }];
    if (assigneeWorkspaceId && assigneeWorkspaceId !== plan.thread.workspaceId) {
      updates.push({ type: "todos.updated", workspaceId: assigneeWorkspaceId });
    }
    notifyTodoCreated(result, workspacePrincipal(plan.thread.workspaceId));
    return updates;
  }

  function directKanbanSuccessNotifications(plan, kanbanDraft = {}) {
    const assigneeWorkspaceId = workspaceIdForPrincipal(kanbanDraft.assignee || "");
    const updates = [
      { type: "kanban.updated", workspaceId: plan.thread.workspaceId },
      { type: "todos.updated", workspaceId: plan.thread.workspaceId },
    ];
    if (assigneeWorkspaceId && assigneeWorkspaceId !== plan.thread.workspaceId) {
      updates.push({ type: "kanban.updated", workspaceId: assigneeWorkspaceId });
      updates.push({ type: "todos.updated", workspaceId: assigneeWorkspaceId });
    }
    return updates;
  }

  return {
    applyTitleUpdate,
    buildDirectKanbanAddPayload,
    buildDirectTodoAddPayload,
    buildFollowUpInstructions,
    buildRunOptions,
    commitPlainMessage,
    commitRunMessageAndDispatch,
    compactResponseDescriptor,
    directKanbanSuccessNotifications,
    directTodoSuccessNotification,
    formatDirectTodoCreateSuccessMessage,
    normalizeBody,
    prepareThreadMessageCreate,
    resolveActorWorkspaceId,
    resolveDirectoryAttachment,
    resolveGroupChat,
    resolveMessageKind,
    resolveQuotedMessage,
    resolveTaskGroup,
    validateThreadAvailability,
  };
}

module.exports = {
  createThreadMessageCreateService,
  defaultSingleWindowChatTaskGroupId,
  normalizeSingleWindowMode,
};
