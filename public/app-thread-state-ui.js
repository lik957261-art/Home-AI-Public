"use strict";

function summarizeThread(thread) {
  const messages = thread?.messages || [];
  const last = [...messages].reverse().find((msg) => msg.content);
  return {
    id: thread.id,
    title: thread.title,
    workspaceId: thread.workspaceId,
    projectId: thread.projectId,
    subprojectId: thread.subprojectId || "",
    singleWindow: Boolean(thread.singleWindow),
    status: thread.status,
    activeRunId: thread.activeRunId,
    activeRunIds: thread.activeRunIds || [],
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    chatGroup: thread.chatGroup || null,
    preview: last ? last.content.slice(0, 180) : "",
  };
}

function mergeServerMessage(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;
  const merged = Object.assign({}, existing, incoming);
  const existingContent = String(existing.content || "");
  const incomingContent = String(incoming.content || "");
  const incomingStatus = String(incoming.status || "");
  const shouldKeepLiveContent =
    existingContent &&
    (!incomingContent || (incomingStatus === "running" && incomingContent.length < existingContent.length));
  if (shouldKeepLiveContent) merged.content = existingContent;
  if (incoming.revokedAt) {
    merged.content = incomingContent || GROUP_MESSAGE_REVOKED_TEXT;
    merged.artifacts = [];
    merged.usage = incoming.usage || null;
    merged.error = incoming.error || null;
  }
  if (!incoming.revokedAt && Array.isArray(existing.artifacts) && existing.artifacts.length && !merged.artifacts?.length) {
    merged.artifacts = existing.artifacts;
  }
  if (!incoming.revokedAt && existing.usage && !incoming.usage) merged.usage = existing.usage;
  if (!incoming.revokedAt && Array.isArray(existing.loadedSkills) && existing.loadedSkills.length && !incoming.loadedSkills?.length) {
    merged.loadedSkills = existing.loadedSkills;
  }
  if (!incoming.revokedAt && existing.model && !incoming.model) merged.model = existing.model;
  if (!incoming.revokedAt && existing.modelProvider && !incoming.modelProvider) merged.modelProvider = existing.modelProvider;
  for (const field of MESSAGE_TIMESTAMP_FIELDS) {
    if (existing[field] && !incoming[field]) merged[field] = existing[field];
  }
  return merged;
}

function mergeCurrentThread(incomingThread) {
  if (!incomingThread) return state.currentThread;
  if (!state.currentThread || state.currentThread.id !== incomingThread.id) return incomingThread;
  const existingPage = state.currentThread.messagesPage || null;
  const incomingPage = incomingThread.messagesPage || null;
  const incomingHasMessageList = Array.isArray(incomingThread.messages);
  const incomingMessages = incomingHasMessageList ? incomingThread.messages : [];
  const existingThreadMessages = state.currentThread.messages || [];
  if (!incomingHasMessageList) {
    return Object.assign({}, state.currentThread, incomingThread, {
      messages: existingThreadMessages,
      messagesPage: existingPage,
    });
  }
  if (incomingPage && !incomingMessages.length && existingThreadMessages.length) {
    const messagesPage = mergeMessagesPage(existingPage, incomingPage, chatMessagesForThread(state.currentThread));
    return Object.assign({}, state.currentThread, incomingThread, { messages: existingThreadMessages, messagesPage });
  }
  const existingMessages = new Map((state.currentThread.messages || []).map((message) => [message.id, message]));
  const incomingIds = new Set();
  const existingThreadMessagesAll = state.currentThread.messages || [];
  const messages = incomingMessages.map((message) => {
    incomingIds.add(message.id);
    const merged = mergeServerMessage(existingMessages.get(message.id), message);
    if (!Array.isArray(merged.localRunProgressEvents) || !merged.localRunProgressEvents.length) {
      const localEvents = typeof localPendingRunProgressEventsForIncoming === "function"
        ? localPendingRunProgressEventsForIncoming(message, incomingMessages, existingThreadMessagesAll)
        : [];
      if (localEvents.length) merged.localRunProgressEvents = localEvents;
    }
    return merged;
  });
  for (const message of state.currentThread.messages || []) {
    if (localPendingSendReplacedByIncoming(message, incomingMessages, state.currentThread.messages || [])) continue;
    const shouldPreserveExisting = incomingPage
      ? shouldPreserveMessageOutsideIncomingPage(message, incomingThread)
      : (!incomingHasMessageList || shouldPreserveMessageOutsideIncomingPage(message, incomingThread));
    if (!incomingIds.has(message.id) && shouldPreserveExisting) {
      messages.push(message);
    }
  }
  const sortedMessages = sortedThreadMessages(messages);
  const chatMessages = incomingPage?.mode === "chat" || existingPage?.mode === "chat"
    ? sortedMessages.filter((message) => String(message?.taskGroupId || "") === String((incomingPage || existingPage)?.taskGroupId || activeChatTaskGroupId()))
    : sortedMessages;
  const messagesPage = incomingPage || existingPage
    ? mergeMessagesPage(existingPage, incomingPage, chatMessages)
    : null;
  return Object.assign({}, state.currentThread, incomingThread, { messages: sortedMessages, messagesPage });
}

function currentSingleWindowMessageMode() {
  return state.viewMode === "single" && state.singleWindowMode === "chat"
    ? "chat"
    : (state.viewMode === "tasks" || (state.viewMode === "single" && state.singleWindowMode === "task") ? "tasks" : "");
}

function singleWindowRequestStillCurrent(request = {}) {
  if (state.singleWindowRequestSeq !== request.seq) return false;
  if (String(state.selectedWorkspaceId || "") !== request.workspaceId) return false;
  if (String(state.viewMode || "") !== request.viewMode) return false;
  if (String(state.singleWindowMode || "") !== request.singleWindowMode) return false;
  if (currentSingleWindowMessageMode() !== request.messageMode) return false;
  if (request.messageMode === "tasks") {
    return String(state.currentTaskGroupId || "") === request.taskGroupId;
  }
  if (request.messageMode === "chat") {
    const currentWeixinChat = Boolean(state.viewMode === "single" && state.singleWindowMode === "chat" && state.weixinChatOpen);
    const currentGroupChat = currentWeixinChat ? false : Boolean(state.viewMode === "single" && state.singleWindowMode === "chat" && state.groupChatOpen);
    return currentWeixinChat === request.weixinChat && currentGroupChat === request.groupChat;
  }
  return true;
}

function cachedSingleWindowThreadForRequest(request = {}) {
  if (String(request.messageMode || "") !== "chat") return null;
  const workspaceId = String(request.workspaceId || "").trim();
  const cached = request.weixinChat
    ? state.weixinChatThread
    : request.groupChat
      ? state.groupChatThread
      : state.privateChatThread;
  if (!cached?.id || !cached.singleWindow) return null;
  if (request.weixinChat) return isThreadWeixinChat(cached) ? cached : null;
  if (request.groupChat) return currentUserCanUseGroupChatThread(cached) ? cached : null;
  if (isThreadWeixinChat(cached) || selectedWorkspaceInThreadGroup(cached)) return null;
  if (workspaceId && String(cached.workspaceId || "") !== workspaceId) return null;
  return cached;
}

function mainConversationSurfaceCache() {
  if (!state.mainConversationSurfaceCache || typeof state.mainConversationSurfaceCache !== "object") {
    state.mainConversationSurfaceCache = {};
  }
  return state.mainConversationSurfaceCache;
}

function singleWindowSurfaceCacheKeyForRequest(request = {}) {
  const workspaceId = String(request.workspaceId || state.selectedWorkspaceId || "owner").trim() || "owner";
  const messageMode = String(request.messageMode || "").trim();
  if (messageMode === "chat") {
    const chatScope = request.weixinChat ? "weixin" : request.groupChat ? "group" : "private";
    return `single:${workspaceId}:chat:${chatScope}`;
  }
  if (messageMode === "tasks" && !String(request.taskGroupId || "").trim()) {
    return `single:${workspaceId}:tasks:root`;
  }
  return "";
}

function currentMainConversationSurfaceCacheKey() {
  const workspaceId = String(state.selectedWorkspaceId || "owner").trim() || "owner";
  if (state.viewMode === "single" && state.singleWindowMode === "chat") {
    const chatScope = state.weixinChatOpen ? "weixin" : state.groupChatOpen ? "group" : "private";
    return `single:${workspaceId}:chat:${chatScope}`;
  }
  if (state.viewMode === "tasks" && !state.currentTaskGroupId) {
    if (typeof isDirectoryTopicDraftActive === "function" && isDirectoryTopicDraftActive()) return "";
    return `single:${workspaceId}:tasks:root`;
  }
  return "";
}

function threadForSurfaceRequest(request = {}) {
  const messageMode = String(request.messageMode || "").trim();
  if (messageMode === "chat") return cachedSingleWindowThreadForRequest(request);
  if (messageMode === "tasks" && !String(request.taskGroupId || "").trim() && typeof taskListThreadCacheEligible === "function") {
    return taskListThreadCacheEligible(state.taskListThread) ? state.taskListThread : null;
  }
  return null;
}

function stableConversationSignatureHash(value = "") {
  const text = String(value || "");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36);
}

function stableConversationJsonHash(value) {
  if (value === undefined || value === null) return "";
  try {
    return stableConversationSignatureHash(JSON.stringify(value));
  } catch {
    return stableConversationSignatureHash(String(value || ""));
  }
}

function chatMessageRenderSignature(message = {}) {
  const artifacts = Array.isArray(message.artifacts)
    ? message.artifacts.map((artifact) => [
      artifact?.id || "",
      artifact?.name || "",
      artifact?.path || "",
      artifact?.url || "",
      artifact?.mime || "",
      artifact?.size || "",
    ].join(",")).join(";")
    : "";
  const loadedSkills = Array.isArray(message.loadedSkills)
    ? message.loadedSkills.map((skill) => [
      skill?.id || "",
      skill?.path || "",
      skill?.name || "",
      skill?.label || "",
      skill?.status || "",
    ].join(",")).join(";")
    : "";
  const runIds = [
    message.originalRunId,
    message.responseRunId,
    message.runId,
    message.taskId,
  ].map((value) => String(value || "").trim()).filter(Boolean).join(",");
  return [
    message?.id || "",
    message?.role || "",
    message?.status || "",
    message?.taskGroupId || "",
    message?.messageKind || "",
    message?.senderWorkspaceId || "",
    message?.actorWorkspaceId || "",
    message?.senderLabel || "",
    message?.revokedAt || "",
    typeof messageDisplayTimestamp === "function" ? messageDisplayTimestamp(message) : "",
    stableConversationSignatureHash(message?.content || ""),
    stableConversationSignatureHash(message?.error || ""),
    stableConversationSignatureHash(artifacts),
    stableConversationSignatureHash(loadedSkills),
    stableConversationJsonHash(message?.usage),
    stableConversationJsonHash(message?.externalDelivery),
    stableConversationJsonHash(message?.localRunProgressEvents),
    runIds,
    message?.model || "",
    message?.modelProvider || "",
  ].join(":");
}

function taskListRootRenderSignature(thread = state.currentThread) {
  if (!thread?.id) return "";
  const sourceGroups = typeof taskListGroupsForThread === "function"
    ? taskListGroupsForThread(thread)
    : (thread.taskGroups || []);
  const sharedGroups = typeof sharedCaseTopicGroupsForTaskList === "function"
    ? sharedCaseTopicGroupsForTaskList(thread)
    : [];
  const pluginGroups = typeof pluginTopicGroupsForTaskList === "function"
    ? pluginTopicGroupsForTaskList(thread)
    : [];
  const groups = sourceGroups
    .filter((group) => (typeof topicGroupVisibleInTaskList === "function" ? topicGroupVisibleInTaskList(group) : true))
    .concat(sharedGroups)
    .concat(pluginGroups)
    .filter((group) => (typeof taskMatchesDirectoryFilter === "function" ? taskMatchesDirectoryFilter(group) : true));
  const directorySourceGroups = groups.filter((group) => !(typeof isPluginTopicTaskGroup === "function" ? isPluginTopicTaskGroup(group) : group.pluginTopic));
  const rawCollections = Array.isArray(thread.directoryTopicCollections)
    ? thread.directoryTopicCollections
    : (typeof directoryTopicCollectionsForGroups === "function" ? directoryTopicCollectionsForGroups(directorySourceGroups) : []);
  const visibleCollections = typeof pluginTopicFilterDirectoryTopicCollectionsForRoot === "function"
    ? pluginTopicFilterDirectoryTopicCollectionsForRoot(rawCollections)
    : rawCollections;
  const directoryGroupIds = typeof directoryTopicCollectionGroupIds === "function"
    ? directoryTopicCollectionGroupIds(rawCollections)
    : new Set();
  const visibleGroups = groups.filter((group) => {
    if (typeof isPluginTopicTaskGroup === "function" ? isPluginTopicTaskGroup(group) : group.pluginTopic) return false;
    return !directoryGroupIds.has(group.id);
  });
  return stableConversationJsonHash({
    threadId: thread.id,
    search: typeof currentSearchText === "function" ? currentSearchText().toLowerCase() : "",
    filter: state.taskDirectoryFilter || null,
    pluginCards: pluginGroups.map((group) => [
      group?.id || "",
      group?.pluginId || "",
      group?.title || "",
      group?.summary || "",
      group?.updatedAt || "",
      stableConversationJsonHash(group?.directoryRoute || null),
    ]),
    directoryCollections: visibleCollections.map((collection) => [
      collection?.key || "",
      collection?.label || "",
      collection?.updatedAt || "",
      stableConversationJsonHash(collection?.route || null),
      (collection?.groups || []).map((group) => [
        group?.id || "",
        group?.title || "",
        group?.summary || "",
        group?.status || "",
        group?.updatedAt || "",
      ]),
    ]),
    visibleGroups: visibleGroups.map((group) => [
      group?.id || "",
      group?.title || "",
      group?.summary || "",
      group?.status || "",
      group?.updatedAt || "",
      group?.pluginTopic ? "plugin" : "",
      group?.sharedTopic ? "shared" : "",
      group?.sourceThreadId || "",
    ]),
  });
}

function mainConversationSurfaceThreadSignature(key = "", thread = state.currentThread) {
  if (!key || !thread?.id) return "";
  const page = thread.messagesPage || {};
  const chatSurface = key.includes(":chat:");
  const taskRootSurface = key.includes(":tasks:root");
  const messages = (thread.messages || []).map((message) => (
    chatSurface
      ? chatMessageRenderSignature(message)
      : [
        message?.id || "",
        message?.status || "",
        message?.updatedAt || "",
        message?.completedAt || "",
        message?.revokedAt || "",
        String(message?.content || "").length,
        Array.isArray(message?.artifacts) ? message.artifacts.length : 0,
        Array.isArray(message?.localRunProgressEvents) ? message.localRunProgressEvents.length : 0,
      ].join(":")
  )).join("|");
  const events = chatSurface && Array.isArray(thread.events)
    ? stableConversationJsonHash(thread.events.map((event) => [
      event?.runId || "",
      event?.event || event?.type || "",
      event?.status || "",
      event?.timestamp || "",
      event?.tool || event?.functionName || "",
      event?.error || "",
      event?.preview || "",
    ]))
    : "";
  const groups = key.includes(":tasks:root")
    ? taskListRootRenderSignature(thread)
    : "";
  const collections = taskRootSurface && Array.isArray(thread.directoryTopicCollections)
    ? thread.directoryTopicCollections.map((collection) => [
      collection?.key || "",
      collection?.updatedAt || "",
      (collection?.groups || []).map((group) => group?.id || "").join(","),
    ].join(":")).sort().join("|")
    : "";
  return [
    thread.id,
    page.mode || "",
    page.total || "",
    page.taskGroupId || "",
    page.oldestMessageId || "",
    page.hasMoreBefore === false ? "no-more-before" : "",
    messages,
    events,
    groups,
    collections,
  ].join("||");
}

function mainConversationSurfaceRequestForCurrentView() {
  const messageMode = currentSingleWindowMessageMode();
  if (!(messageMode === "chat" || (messageMode === "tasks" && !state.currentTaskGroupId))) return null;
  const weixinChat = Boolean(state.viewMode === "single" && state.singleWindowMode === "chat" && state.weixinChatOpen);
  const groupChat = weixinChat ? false : Boolean(state.viewMode === "single" && state.singleWindowMode === "chat" && state.groupChatOpen);
  return {
    seq: state.singleWindowRequestSeq,
    workspaceId: String(state.selectedWorkspaceId || ""),
    viewMode: String(state.viewMode || ""),
    singleWindowMode: String(state.singleWindowMode || ""),
    taskGroupId: String(state.currentTaskGroupId || ""),
    messageMode,
    weixinChat,
    groupChat,
  };
}

function parkCurrentMainConversationSurfaceForNavigation() {
  state.pendingMainConversationSurfacePark = null;
  return false;
}

function commitPendingMainConversationSurfacePark() {
  state.pendingMainConversationSurfacePark = null;
  return false;
}

function applyRestoredMainConversationSurfaceChrome(request = {}, thread = null, cacheEntry = null) {
  if (request.messageMode === "tasks") {
    $("threadTitle").textContent = "话题列表";
    $("threadMeta").textContent = "";
    $("interruptRun").disabled = !activeThreadRunIds(thread).length;
    if (typeof configureComposer === "function") {
      configureComposer({ enabled: false, hidden: true, placeholder: "Open a topic to reply" });
    }
    if (typeof renderPluginAppLauncher === "function" && typeof setTopicPluginDock === "function") {
      setTopicPluginDock(renderPluginAppLauncher());
    }
  } else {
    $("threadTitle").textContent = request.groupChat ? "群聊" : "";
    $("threadMeta").textContent = "";
    $("interruptRun").disabled = !activeChatRunIds(thread).length;
    if (typeof renderChatScopeHeader === "function") renderChatScopeHeader(thread);
    if (typeof configureComposer === "function") configureComposer({ enabled: true, placeholder: "Message Home AI..." });
  }
  if (typeof updateNavigationControls === "function") updateNavigationControls();
  if (cacheEntry && typeof ensureVerticalScrollAffordance === "function") ensureVerticalScrollAffordance($("conversation"));
  if (typeof scheduleMessageScrollButtonVisibility === "function") scheduleMessageScrollButtonVisibility($("conversation"));
}

function restoreMainConversationSurfaceForRequest(request = {}, options = {}) {
  state.pendingMainConversationSurfacePark = null;
  state.mainConversationSurfaceActiveKey = "";
  state.mainConversationSurfaceRestoredKey = "";
  state.mainConversationSurfaceRestoredSignature = "";
  return false;
}

function restoreMainConversationSurfaceForCurrentViewShell(options = {}) {
  return false;
}

function retainRestoredMainConversationSurfaceIfFresh(options = {}) {
  return false;
}

function renderCachedSingleWindowThreadForRequest(request = {}, options = {}) {
  if (!singleWindowRequestStillCurrent(request)) return false;
  const cached = cachedSingleWindowThreadForRequest(request);
  if (!cached) return false;
  if (state.currentThread?.id === cached.id && state.currentThreadId === cached.id) return false;
  state.currentThread = cached;
  state.currentThreadId = cached.id;
  state.threads = [summarizeThread(cached)];
  if (state.viewMode !== "tasks") state.currentTaskGroupId = "";
  renderThreads();
  renderCurrentThread({ stickToBottom: options.stickToBottom !== false });
  setComposerEnabled(true);
  startupPerfMark("single-window-cache-render", {
    messages: Array.isArray(cached.messages) ? cached.messages.length : 0,
    totalMessages: cached.messagesPage?.total || 0,
  });
  return true;
}

function renderCachedSingleWindowThreadForCurrentViewShell(options = {}) {
  if (!(state.viewMode === "single" && state.singleWindowMode === "chat")) return false;
  const request = {
    seq: state.singleWindowRequestSeq,
    workspaceId: String(state.selectedWorkspaceId || ""),
    viewMode: String(state.viewMode || ""),
    singleWindowMode: String(state.singleWindowMode || ""),
    taskGroupId: "",
    messageMode: "chat",
    weixinChat: Boolean(state.weixinChatOpen),
    groupChat: state.weixinChatOpen ? false : Boolean(state.groupChatOpen),
  };
  return renderCachedSingleWindowThreadForRequest(request, options);
}

function renderSingleWindowChatPendingShell(options = {}) {
  if (!(state.viewMode === "single" && state.singleWindowMode === "chat")) return false;
  const conversation = $("conversation");
  if (!conversation) return false;
  renderThreads();
  $("threadTitle").textContent = "";
  $("threadMeta").textContent = "";
  $("interruptRun").disabled = true;
  if (typeof renderChatScopeHeader === "function") renderChatScopeHeader(null);
  if (typeof configureComposer === "function") {
    configureComposer({ enabled: false, shellLocked: true, placeholder: "Message Home AI..." });
  }
  conversation.innerHTML = `<div class="empty-state">正在载入聊天...</div>`;
  conversation.scrollTop = 0;
  state.conversationPinnedToBottom = true;
  if (typeof updateNavigationControls === "function") updateNavigationControls();
  if (typeof ensureVerticalScrollAffordance === "function") ensureVerticalScrollAffordance(conversation);
  if (typeof scheduleMessageScrollButtonVisibility === "function") scheduleMessageScrollButtonVisibility(conversation);
  startupPerfMark("single-window-chat-pending-shell", {
    reason: String(options.reason || "no-cache").slice(0, 80),
  });
  if (typeof scheduleSingleWindowChatPendingRecovery === "function") {
    scheduleSingleWindowChatPendingRecovery(options.reason || "pending-shell");
  }
  return true;
}

function clearSingleWindowChatPendingRecovery() {
  const timer = Number(state.singleWindowChatPendingRecoveryTimer || 0) || 0;
  if (timer) window.clearTimeout(timer);
  state.singleWindowChatPendingRecoveryTimer = 0;
}

function singleWindowChatPendingShellVisible() {
  if (!(state.viewMode === "single" && state.singleWindowMode === "chat")) return false;
  const conversation = $("conversation");
  if (!conversation) return false;
  if (conversation.querySelector("[data-message-id]")) return false;
  return /正在载入聊天/.test(String(conversation.textContent || ""));
}

function scheduleSingleWindowChatPendingRecovery(reason = "pending-shell", delayMs = 2200) {
  clearSingleWindowChatPendingRecovery();
  state.singleWindowChatPendingRecoveryTimer = window.setTimeout(() => {
    state.singleWindowChatPendingRecoveryTimer = 0;
    if (!singleWindowChatPendingShellVisible()) return;
    const attempts = Number(state.singleWindowChatPendingRecoveryAttempts || 0) || 0;
    if (attempts >= 2) {
      startupPerfMark("single-window-chat-pending-recovery-give-up", {
        reason: String(reason || "").slice(0, 80),
      });
      return;
    }
    if (Number(state.singleWindowLoadInFlightSeq || 0)) {
      scheduleSingleWindowChatPendingRecovery("request-in-flight", 1600);
      return;
    }
    state.singleWindowChatPendingRecoveryAttempts = attempts + 1;
    startupPerfMark("single-window-chat-pending-recovery", {
      reason: String(reason || "").slice(0, 80),
      attempt: state.singleWindowChatPendingRecoveryAttempts,
    });
    loadSingleWindow({ skipSingleWindowCache: true, pendingRecovery: true }).catch(showError);
  }, Math.max(800, Number(delayMs) || 2200));
}

async function loadSingleWindow(options = {}) {
  const request = {
    seq: state.singleWindowRequestSeq + 1,
    workspaceId: String(state.selectedWorkspaceId || ""),
    viewMode: String(state.viewMode || ""),
    singleWindowMode: String(state.singleWindowMode || ""),
    taskGroupId: String(state.currentTaskGroupId || ""),
    messageMode: currentSingleWindowMessageMode(),
  };
  state.singleWindowRequestSeq = request.seq;
  const weixinChat = Boolean(options.weixinChat ?? (
    state.viewMode === "single"
    && state.singleWindowMode === "chat"
    && state.weixinChatOpen
  ));
  const groupChat = weixinChat ? false : (options.groupChat ?? (
    state.viewMode === "single"
    && state.singleWindowMode === "chat"
    && state.groupChatOpen
  ));
  request.weixinChat = weixinChat;
  request.groupChat = groupChat;
  const messageMode = request.messageMode;
  let renderedCachedSingleWindow = false;
  if (!options.skipSingleWindowCache) {
    renderedCachedSingleWindow = renderCachedSingleWindowThreadForRequest(request, options);
  }
  if (messageMode === "chat" && !renderedCachedSingleWindow) {
    renderSingleWindowChatPendingShell({
      reason: options.reason || (options.pendingRecovery ? "pending_recovery" : "chat_cache_miss"),
    });
  }
  const refreshSurfaceKey = typeof singleWindowSurfaceCacheKeyForRequest === "function"
    ? singleWindowSurfaceCacheKeyForRequest(request)
    : "";
  const beforeRefreshSignature = refreshSurfaceKey && typeof mainConversationSurfaceThreadSignature === "function"
    ? mainConversationSurfaceThreadSignature(refreshSurfaceKey, state.currentThread)
    : "";
  state.singleWindowLoadInFlightSeq = request.seq;
  const result = await startupPerfStep("single-window-api", () => api("/api/single-window", {
    method: "POST",
    body: JSON.stringify({
      workspaceId: request.workspaceId,
      groupChat,
      weixinChat,
      messageMode,
      taskGroupId: messageMode === "tasks" ? request.taskGroupId : "",
      messageLimit: messageMode === "tasks" ? TASK_MESSAGE_INITIAL_LIMIT : CHAT_MESSAGE_INITIAL_LIMIT,
    }),
    timeoutMs: 12000,
  })).finally(() => {
    if (state.singleWindowLoadInFlightSeq === request.seq) state.singleWindowLoadInFlightSeq = 0;
  });
  if (!singleWindowRequestStillCurrent(request)) {
    if (singleWindowChatPendingShellVisible()) scheduleSingleWindowChatPendingRecovery("stale-request", 900);
    return;
  }
  clearSingleWindowChatPendingRecovery();
  state.singleWindowChatPendingRecoveryAttempts = 0;
  startupPerfMark("single-window-payload", {
    messages: Array.isArray(result.thread?.messages) ? result.thread.messages.length : 0,
    totalMessages: result.thread?.messagesPage?.total || 0,
    caseTopicThreads: Array.isArray(result.caseTopicThreads) ? result.caseTopicThreads.length : 0,
  });
  state.currentThread = mergeCurrentThread(result.thread);
  if (result.groupChatThread) {
    state.groupChatThread = mergeChatScopeThread(state.groupChatThread, result.groupChatThread);
    state.groupChatThreadId = state.groupChatThread?.id || result.groupChatThreadId || "";
  }
  if (result.weixinChatThread) {
    state.weixinChatThread = mergeChatScopeThread(state.weixinChatThread, result.weixinChatThread);
    state.weixinChatThreadId = state.weixinChatThread?.id || result.weixinChatThreadId || "";
  }
  state.caseTopicThreads = Array.isArray(result.caseTopicThreads) ? result.caseTopicThreads : [];
  if (messageMode === "tasks") scheduleKanbanTopicCardSnapshotRefresh();
  state.groupChatAvailable = Boolean(result.groupChatAvailable || selectedWorkspaceInThreadGroup(state.currentThread));
  state.weixinChatAvailable = Boolean(result.weixinChatAvailable || isThreadWeixinChat(state.currentThread));
  rememberChatScopeThread(state.currentThread);
  if (weixinChat && !isThreadWeixinChat(state.currentThread)) {
    state.weixinChatOpen = false;
    localStorage.setItem("hermesWebWeixinChatOpen", "0");
  }
  if (isThreadWeixinChat(state.currentThread)) {
    state.weixinChatOpen = true;
    state.groupChatOpen = false;
    localStorage.setItem("hermesWebWeixinChatOpen", "1");
    localStorage.setItem("hermesWebGroupChatOpen", "0");
  }
  if (groupChat && !currentUserCanUseGroupChatThread(state.currentThread)) {
    state.groupChatOpen = false;
    localStorage.setItem("hermesWebGroupChatOpen", "0");
  }
  state.currentThreadId = state.currentThread.id;
  state.threads = [summarizeThread(state.currentThread)];
  if (state.viewMode !== "tasks") state.currentTaskGroupId = "";
  if (messageMode === "tasks") rememberTaskListThread(state.currentThread);
  const afterRefreshSignature = refreshSurfaceKey && typeof mainConversationSurfaceThreadSignature === "function"
    ? mainConversationSurfaceThreadSignature(refreshSurfaceKey, state.currentThread)
    : "";
  const skipUnchangedChatRender = messageMode === "chat"
    && beforeRefreshSignature
    && beforeRefreshSignature === afterRefreshSignature
    && $("conversation")?.querySelector("[data-message-id]");
  const skipUnchangedTaskRender = messageMode === "tasks"
    && !state.currentTaskGroupId
    && beforeRefreshSignature
    && beforeRefreshSignature === afterRefreshSignature
    && $("conversation")?.querySelector(".directory-topic-launcher, [data-open-task], .empty-state");
  const restoreTaskListScrollTop = options.preserveTaskListScroll
    && messageMode === "tasks"
    && !state.currentTaskGroupId
    ? (
      Number.isFinite(Number(options.restoreTaskListScrollTop))
        ? Math.max(0, Number(options.restoreTaskListScrollTop) || 0)
        : $("conversation")?.scrollTop || 0
    )
    : null;
  state.mainConversationSurfaceRestoredKey = "";
  state.mainConversationSurfaceRestoredSignature = "";
  if (skipUnchangedChatRender || skipUnchangedTaskRender) {
    startupPerfMark(skipUnchangedTaskRender ? "single-window-task-refresh-render-skip" : "single-window-refresh-render-skip", {
      messages: Array.isArray(state.currentThread?.messages) ? state.currentThread.messages.length : 0,
      totalMessages: state.currentThread?.messagesPage?.total || 0,
      taskGroups: Array.isArray(state.currentThread?.taskGroups) ? state.currentThread.taskGroups.length : 0,
    });
    if (typeof applyRestoredMainConversationSurfaceChrome === "function") {
      applyRestoredMainConversationSurfaceChrome(request, state.currentThread);
    }
    if (typeof scheduleConversationViewportRefresh === "function") scheduleConversationViewportRefresh($("conversation"));
  } else {
    renderThreads();
    await startupPerfStep("render-current-thread", () => {
      renderCurrentThread({
        stickToBottom: restoreTaskListScrollTop === null,
        restoreScrollTop: restoreTaskListScrollTop,
      });
      return Promise.resolve();
    });
  }
  setComposerEnabled(true);
}

async function selectChatScope(scope) {
  closeTopMoreMenu();
  clearQuotedReply({ render: false });
  state.currentTaskGroupId = "";
  if (String(scope || "").trim().toLowerCase() !== "group") {
    state.groupChatOpen = false;
    state.weixinChatOpen = false;
    localStorage.setItem("hermesWebGroupChatOpen", "0");
    localStorage.setItem("hermesWebWeixinChatOpen", "0");
    await loadSingleWindow({ groupChat: false, weixinChat: false });
    return;
  }
  if (isGroupChatView()) {
    renderCurrentThread({ stickToBottom: false });
    return;
  }
  state.weixinChatOpen = false;
  state.groupChatOpen = true;
  localStorage.setItem("hermesWebWeixinChatOpen", "0");
  localStorage.setItem("hermesWebGroupChatOpen", "1");
  try {
    await loadSingleWindow({ groupChat: true, weixinChat: false });
  } catch (err) {
    state.groupChatOpen = false;
    localStorage.setItem("hermesWebGroupChatOpen", "0");
    throw err;
  }
  if (currentUserCanUseGroupChatThread(state.currentThread)) {
    state.groupChatOpen = true;
    localStorage.setItem("hermesWebGroupChatOpen", "1");
    renderCurrentThread({ stickToBottom: true });
    return;
  }
  state.groupChatOpen = false;
  localStorage.setItem("hermesWebGroupChatOpen", "0");
  throw new Error("Group chat is not available for this workspace yet.");
}

async function toggleGroupChat() {
  await selectChatScope(isGroupChatView() ? "chat" : "group");
}

async function selectWeixinChat(open = true) {
  closeTopMoreMenu();
  clearQuotedReply({ render: false });
  state.currentTaskGroupId = "";
  state.weixinChatOpen = Boolean(open);
  state.groupChatOpen = false;
  localStorage.setItem("hermesWebWeixinChatOpen", state.weixinChatOpen ? "1" : "0");
  localStorage.setItem("hermesWebGroupChatOpen", "0");
  await loadSingleWindow({ weixinChat: state.weixinChatOpen, groupChat: false });
}

async function toggleWeixinChat() {
  await selectWeixinChat(!isWeixinChatView());
}
