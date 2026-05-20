"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const SINGLE_WINDOW_GROUP_CHAT_API_ROUTE_SPECS = Object.freeze([
  {
    id: "single-window",
    method: "POST",
    path: "/api/single-window",
    group: "thread",
    moduleKey: "single-window",
    handlerKey: "singleWindow",
    summary: "Open a workspace single-window thread.",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["thread", "workspace"],
    tags: ["thread", "single-window"],
  },
  {
    id: "thread-group-chat-update",
    method: "PATCH",
    pathRegex: /^\/api\/threads\/[^/]+\/group-chat$/,
    group: "thread",
    moduleKey: "group-chat",
    handlerKey: "threadGroupChatUpdate",
    summary: "Update Owner-managed group chat membership.",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    riskLevel: "owner",
    resourceTypes: ["thread", "group-chat"],
    tags: ["thread", "group-chat"],
  },
  {
    id: "thread-message-revoke",
    method: "POST",
    pathRegex: /^\/api\/threads\/[^/]+\/messages\/[^/]+\/revoke$/,
    group: "thread",
    moduleKey: "group-chat",
    handlerKey: "threadMessageRevoke",
    summary: "Revoke a group chat message.",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["thread", "message"],
    tags: ["thread", "group-chat", "revoke"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`single-window group chat api routes require ${name}`);
  }
}

function getState(deps) {
  return typeof deps.state === "function" ? deps.state() : deps.state;
}

function decodeThreadId(pathname, regex) {
  const match = String(pathname || "").match(regex);
  return match ? decodeURIComponent(match[1]) : "";
}

function decodeThreadMessageIds(pathname) {
  const match = String(pathname || "").match(/^\/api\/threads\/([^/]+)\/messages\/([^/]+)\/revoke$/);
  return {
    threadId: match ? decodeURIComponent(match[1]) : "",
    messageId: match ? decodeURIComponent(match[2]) : "",
  };
}

function createSingleWindowGroupChatApiRoutes(deps = {}) {
  requireFunctions(deps, [
    "authenticateRequest",
    "broadcast",
    "canRevokeGroupChatMessage",
    "compactMessage",
    "compactThread",
    "compactThreadWithMessagePage",
    "ensureSingleWindowThread",
    "ensureWeixinSingleWindowThread",
    "findGroupChatThreadForWorkspace",
    "findThreadForRequest",
    "findWeixinSingleWindowThreadForWorkspace",
    "findWorkspace",
    "groupAssistantReplyForUserMessage",
    "groupMessageRevoker",
    "kanbanCaseTopicThreadsForWorkspace",
    "normalizeChatGroup",
    "normalizeStringList",
    "nowIso",
    "readBody",
    "removeThreadActiveRun",
    "requireOwner",
    "requireWorkspaceAccess",
    "revokeGroupMessagePayload",
    "saveState",
    "scheduleNextQueuedRunForTaskGroup",
    "sendJson",
    "stopRunIds",
    "threadAccessibleToAuth",
    "threadSummary",
    "weixinForwardTargetsForWorkspace",
  ]);
  if (!deps.state) throw new Error("single-window group chat api routes require state");

  const registry = createApiRouteRegistry(SINGLE_WINDOW_GROUP_CHAT_API_ROUTE_SPECS);
  const threadMessageInitialLimit = Math.max(10, Number(deps.threadMessageInitialLimit || 60) || 60);
  const groupMessageRevokedText = String(deps.groupMessageRevokedText || "Message revoked");
  const groupAiReplyRevokedText = String(deps.groupAiReplyRevokedText || "Associated AI reply revoked");
  const groupChatTaskGroupId = String(deps.groupChatTaskGroupId || "group-chat");

  async function handleSingleWindow(req, res, _url, context = {}) {
    const body = await deps.readBody(req);
    const auth = context.auth || deps.authenticateRequest(req);
    const workspaceId = deps.requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    const weixinRequested = Boolean(body.weixinChat || body.weixin_chat);
    let weixinThread = weixinRequested
      ? deps.ensureWeixinSingleWindowThread(workspaceId)
      : deps.findWeixinSingleWindowThreadForWorkspace(workspaceId);
    const groupRequested = !weixinRequested && Boolean(body.groupChat || body.group_chat);
    const availableGroupThread = deps.findGroupChatThreadForWorkspace(workspaceId);
    const groupChatAvailable = Boolean(availableGroupThread && deps.threadAccessibleToAuth(auth, availableGroupThread));
    const groupThread = groupRequested && groupChatAvailable ? availableGroupThread : null;
    const thread = weixinRequested
      ? weixinThread
      : (groupThread || deps.ensureSingleWindowThread(workspaceId, { allowGroupThread: false }));
    if (!thread) {
      deps.sendJson(res, 400, { error: "Unknown workspace or single-window project" });
      return;
    }
    if (!weixinRequested) weixinThread = deps.findWeixinSingleWindowThreadForWorkspace(workspaceId);
    const weixinTargets = deps.weixinForwardTargetsForWorkspace(workspaceId, auth);
    const weixinChatAvailable = Boolean(
      (weixinThread && deps.threadAccessibleToAuth(auth, weixinThread))
      || weixinTargets.length
    );
    deps.broadcast({ type: "thread.updated", thread: deps.threadSummary(thread) });
    const messageMode = String(body.messageMode || body.message_mode || "").trim().toLowerCase();
    const wantsMessagePage = ["chat", "tasks", "task"].includes(messageMode);
    const responseThread = wantsMessagePage
      ? deps.compactThreadWithMessagePage(thread, {
        mode: messageMode,
        groupChat: groupRequested && !weixinRequested,
        taskGroupId: messageMode === "tasks" || messageMode === "task"
          ? ""
          : (body.taskGroupId || body.task_group_id || ""),
        limit: body.messageLimit || body.message_limit || threadMessageInitialLimit,
      })
      : deps.compactThread(thread);
    const groupChatThread = groupRequested && groupChatAvailable
      ? deps.compactThreadWithMessagePage(availableGroupThread, {
        mode: "chat",
        groupChat: true,
        limit: body.messageLimit || body.message_limit || threadMessageInitialLimit,
      })
      : null;
    const weixinChatThread = weixinRequested && weixinThread && deps.threadAccessibleToAuth(auth, weixinThread)
      ? deps.compactThreadWithMessagePage(weixinThread, {
        mode: "chat",
        groupChat: false,
        limit: body.messageLimit || body.message_limit || threadMessageInitialLimit,
      })
      : null;
    const caseTopicThreads = messageMode === "tasks" || messageMode === "task"
      ? deps.kanbanCaseTopicThreadsForWorkspace(auth, workspaceId).map((topicThread) => deps.compactThreadWithMessagePage(topicThread, {
        mode: "tasks",
        limit: body.messageLimit || body.message_limit || threadMessageInitialLimit,
      }))
      : [];
    deps.sendJson(res, 200, {
      thread: responseThread,
      groupChatAvailable,
      groupChatThreadId: groupChatAvailable ? availableGroupThread.id : "",
      groupChatThread,
      weixinChatAvailable,
      weixinChatThreadId: weixinChatThread ? weixinThread.id : "",
      weixinChatThread,
      caseTopicThreads,
    });
  }

  async function handleGroupChatUpdate(req, res, url) {
    const auth = deps.requireOwner(req, res);
    if (!auth) return;
    const thread = deps.findThreadForRequest(req, decodeThreadId(url.pathname, /^\/api\/threads\/([^/]+)\/group-chat$/));
    if (!thread) {
      deps.sendJson(res, 404, { error: "Thread not found" });
      return;
    }
    if (!thread.singleWindow) {
      deps.sendJson(res, 400, { error: "Group chat is only supported for single-window chat" });
      return;
    }
    const body = await deps.readBody(req).catch(() => ({}));
    const enabled = body.enabled !== false;
    const now = deps.nowIso();
    const current = deps.normalizeChatGroup(thread.chatGroup || {}, thread.workspaceId);
    const memberWorkspaceIds = deps.normalizeStringList(
      body.memberWorkspaceIds || body.member_workspace_ids || body.members || current.memberWorkspaceIds,
    ).filter((workspaceId) => deps.findWorkspace(workspaceId));
    thread.chatGroup = deps.normalizeChatGroup({
      enabled,
      memberWorkspaceIds,
      createdAt: current.createdAt || now,
      updatedAt: now,
    }, thread.workspaceId);
    thread.updatedAt = now;
    deps.saveState();
    deps.broadcast({ type: "thread.updated", threadId: thread.id, thread: deps.compactThread(thread) });
    deps.sendJson(res, 200, { ok: true, thread: deps.compactThread(thread) });
  }

  async function handleMessageRevoke(req, res, url, context = {}) {
    const auth = context.auth || deps.authenticateRequest(req);
    const { threadId, messageId } = decodeThreadMessageIds(url.pathname);
    const thread = deps.findThreadForRequest(req, threadId);
    if (!thread) {
      deps.sendJson(res, 404, { error: "Thread not found" });
      return;
    }
    const message = (thread.messages || []).find((item) => String(item.id || "") === messageId);
    if (!message) {
      deps.sendJson(res, 404, { error: "Message not found" });
      return;
    }
    if (!deps.canRevokeGroupChatMessage(auth, thread, message)) {
      deps.sendJson(res, 403, { error: "This group chat message cannot be revoked by the current account" });
      return;
    }
    const now = deps.nowIso();
    const revoker = deps.groupMessageRevoker(auth);
    const pairedAssistant = message.messageKind === "ai" ? deps.groupAssistantReplyForUserMessage(thread, message) : null;
    const touchedMessages = [message];
    const touchedArtifactIds = new Set();
    const rememberArtifacts = (item) => {
      for (const artifact of Array.isArray(item?.artifacts) ? item.artifacts : []) {
        if (artifact?.id) touchedArtifactIds.add(String(artifact.id));
      }
    };
    const shouldRevokePairedAssistant = Boolean(pairedAssistant && !pairedAssistant.revokedAt);
    const activeRunIds = [];
    rememberArtifacts(message);
    if (shouldRevokePairedAssistant) {
      rememberArtifacts(pairedAssistant);
      if (["queued", "running"].includes(pairedAssistant.status) && pairedAssistant.runId) {
        activeRunIds.push(pairedAssistant.runId);
      }
    }
    let stoppedRunIds = [];
    try {
      stoppedRunIds = await deps.stopRunIds(activeRunIds);
    } catch (err) {
      deps.sendJson(res, err.status || 502, { error: err.message || String(err) });
      return;
    }
    deps.revokeGroupMessagePayload(message, now, revoker, groupMessageRevokedText);
    if (shouldRevokePairedAssistant) {
      deps.revokeGroupMessagePayload(pairedAssistant, now, revoker, groupAiReplyRevokedText);
      pairedAssistant.status = "cancelled";
      pairedAssistant.cancelledAt = now;
      pairedAssistant.completedAt = "";
      pairedAssistant.failedAt = "";
      touchedMessages.push(pairedAssistant);
    }
    for (const runId of stoppedRunIds) deps.removeThreadActiveRun(thread, runId, "idle");
    const touchedMessageIds = new Set(touchedMessages.map((item) => String(item.id || "")).filter(Boolean));
    const state = getState(deps);
    state.artifacts = (state.artifacts || []).filter((artifact) => {
      if (touchedArtifactIds.has(String(artifact.id || ""))) return false;
      if (artifact.threadId === thread.id && touchedMessageIds.has(String(artifact.messageId || ""))) return false;
      return true;
    });
    thread.status = (thread.activeRunIds || []).length ? "running" : "idle";
    thread.updatedAt = now;
    deps.saveState(state, { reason: "group-message-revoke", forceBackup: true });
    deps.broadcast({ type: "thread.updated", threadId: thread.id, thread: deps.threadSummary(thread) });
    for (const touched of touchedMessages) {
      deps.broadcast({ type: "message.updated", threadId: thread.id, message: deps.compactMessage(touched), thread: deps.threadSummary(thread) });
    }
    if (shouldRevokePairedAssistant) deps.scheduleNextQueuedRunForTaskGroup(thread, groupChatTaskGroupId);
    deps.sendJson(res, 200, {
      ok: true,
      stoppedRunIds,
      messages: touchedMessages.map(deps.compactMessage),
      thread: deps.compactThread(thread),
    });
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    if (route.id === "single-window") await handleSingleWindow(req, res, url, context);
    else if (route.id === "thread-group-chat-update") await handleGroupChatUpdate(req, res, url, context);
    else if (route.id === "thread-message-revoke") await handleMessageRevoke(req, res, url, context);
    else return { handled: false };

    return { handled: true, route, auth: context.auth };
  }

  return {
    handle,
    list(options) {
      return registry.list(options);
    },
    match(request) {
      return registry.match(request);
    },
    summary(options) {
      return registry.summary(options);
    },
  };
}

module.exports = {
  SINGLE_WINDOW_GROUP_CHAT_API_ROUTE_SPECS,
  createSingleWindowGroupChatApiRoutes,
};
