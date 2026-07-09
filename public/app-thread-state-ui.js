"use strict";

const THREAD_STATE_MODEL_ESM_PATH = "/vite-islands/thread-state-model/thread-state-model.js";
let threadStateModel = null;
let threadStateModelPromise = null;

function importThreadStateModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (threadStateModel) return Promise.resolve(threadStateModel);
  if (!threadStateModelPromise) {
    const importer = typeof rootRef.__homeAiImportThreadStateModel === "function"
      ? rootRef.__homeAiImportThreadStateModel
      : (path) => import(path);
    threadStateModelPromise = Promise.resolve()
      .then(() => importer(THREAD_STATE_MODEL_ESM_PATH))
      .then((model) => {
        threadStateModel = model || null;
        return threadStateModel;
      })
      .catch((error) => {
        threadStateModelPromise = null;
        throw error;
      });
  }
  return threadStateModelPromise;
}

function currentThreadStateModel() {
  return threadStateModel;
}

if (typeof window !== "undefined") {
  importThreadStateModel().catch(() => null);
}

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
  if (!incoming.revokedAt && existing.pluginActions && !incoming.pluginActions) {
    merged.pluginActions = existing.pluginActions;
  }
  if (!incoming.revokedAt && existing.model && !incoming.model) merged.model = existing.model;
  if (!incoming.revokedAt && existing.modelProvider && !incoming.modelProvider) merged.modelProvider = existing.modelProvider;
  for (const field of MESSAGE_TIMESTAMP_FIELDS) {
    if (existing[field] && !incoming[field]) merged[field] = existing[field];
  }
  return merged;
}

function selectedTaskDetailGroupId() {
  const groupId = String(state.currentTaskGroupId || "").trim();
  if (!groupId) return "";
  if (state.viewMode === "tasks") return groupId;
  if (state.viewMode === "single" && state.singleWindowMode === "task") return groupId;
  return "";
}

function isRootTaskMessagesPage(page = null) {
  const mode = String(page?.mode || "").trim().toLowerCase();
  if (mode !== "tasks" && mode !== "task") return false;
  return !String(page?.taskGroupId || "").trim();
}

function mergeCurrentThread(incomingThread) {
  if (!incomingThread) return state.currentThread;
  if (!state.currentThread || state.currentThread.id !== incomingThread.id) return incomingThread;
  const existingPage = state.currentThread.messagesPage || null;
  const incomingPage = incomingThread.messagesPage || null;
  const incomingHasMessageList = Array.isArray(incomingThread.messages);
  const incomingMessages = incomingHasMessageList ? incomingThread.messages : [];
  const existingThreadMessages = state.currentThread.messages || [];
  if (selectedTaskDetailGroupId() && isRootTaskMessagesPage(incomingPage)) {
    return Object.assign({}, state.currentThread, incomingThread, {
      messages: existingThreadMessages,
      messagesPage: existingPage,
    });
  }
  if (!incomingHasMessageList) {
    return Object.assign({}, state.currentThread, incomingThread, {
      messages: existingThreadMessages,
      messagesPage: existingPage,
    });
  }
  if (incomingPage && !incomingMessages.length && existingThreadMessages.length) {
    const scopedMessages = typeof messagesForPageScope === "function"
      ? messagesForPageScope(state.currentThread, incomingPage)
      : chatMessagesForThread(state.currentThread);
    const messagesPage = mergeMessagesPage(existingPage, incomingPage, scopedMessages);
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
  const scopedPage = incomingPage || existingPage;
  const scopedThread = Object.assign({}, state.currentThread, incomingThread, { messages: sortedMessages });
  const chatMessages = scopedPage && typeof messagesForPageScope === "function"
    ? messagesForPageScope(scopedThread, scopedPage)
    : (incomingPage?.mode === "chat" || existingPage?.mode === "chat"
      ? sortedMessages.filter((message) => String(message?.taskGroupId || "") === String((incomingPage || existingPage)?.taskGroupId || activeChatTaskGroupId()))
      : sortedMessages);
  const messagesPage = incomingPage || existingPage
    ? mergeMessagesPage(existingPage, incomingPage, chatMessages)
    : null;
  return Object.assign({}, state.currentThread, incomingThread, { messages: sortedMessages, messagesPage });
}

function currentSingleWindowMessageMode() {
  const model = currentThreadStateModel();
  if (typeof model?.currentSingleWindowMessageModePlan === "function") {
    return model.currentSingleWindowMessageModePlan({ state }).messageMode;
  }
  return state.viewMode === "single" && state.singleWindowMode === "chat"
    ? "chat"
    : (state.viewMode === "tasks" || (state.viewMode === "single" && state.singleWindowMode === "task") ? "tasks" : "");
}

function singleWindowRequestStillCurrent(request = {}) {
  const model = currentThreadStateModel();
  if (typeof model?.singleWindowRequestStillCurrentPlan === "function") {
    return model.singleWindowRequestStillCurrentPlan({
      state,
      request,
      currentMessageMode: currentSingleWindowMessageMode(),
    }).stillCurrent;
  }
  if (state.singleWindowRequestSeq !== request.seq) return false;
  if (String(state.selectedWorkspaceId || "") !== request.workspaceId) return false;
  if (String(state.viewMode || "") !== request.viewMode) return false;
  if (String(state.singleWindowMode || "") !== request.singleWindowMode) return false;
  if (currentSingleWindowMessageMode() !== request.messageMode) return false;
  if (request.messageMode === "tasks") {
    return String(state.currentTaskGroupId || "") === request.taskGroupId;
  }
  if (request.messageMode === "chat") {
    const currentGroupChat = Boolean(state.viewMode === "single" && state.singleWindowMode === "chat" && state.groupChatOpen);
    return currentGroupChat === request.groupChat;
  }
  return true;
}

function cachedSingleWindowThreadForRequest(request = {}) {
  if (String(request.messageMode || "") !== "chat") return null;
  const workspaceId = String(request.workspaceId || "").trim();
  const cached = request.groupChat ? state.groupChatThread : state.privateChatThread;
  if (!cached?.id || !cached.singleWindow) return null;
  if (request.groupChat) return currentUserCanUseGroupChatThread(cached) ? cached : null;
  if (selectedWorkspaceInThreadGroup(cached)) return null;
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
  const model = currentThreadStateModel();
  if (typeof model?.singleWindowSurfaceCacheKeyPlan === "function") {
    return model.singleWindowSurfaceCacheKeyPlan({ state, request }).key;
  }
  const workspaceId = String(request.workspaceId || state.selectedWorkspaceId || "owner").trim() || "owner";
  const messageMode = String(request.messageMode || "").trim();
  if (messageMode === "chat") {
    const chatScope = request.groupChat ? "group" : "private";
    return `single:${workspaceId}:chat:${chatScope}`;
  }
  if (messageMode === "tasks" && !String(request.taskGroupId || "").trim()) {
    return `single:${workspaceId}:tasks:root`;
  }
  return "";
}

function currentMainConversationSurfaceCacheKey() {
  const model = currentThreadStateModel();
  if (typeof model?.currentMainConversationSurfaceCacheKeyPlan === "function") {
    return model.currentMainConversationSurfaceCacheKeyPlan({
      state,
      directoryTopicDraftActive: typeof isDirectoryTopicDraftActive === "function" && isDirectoryTopicDraftActive(),
    }).key;
  }
  const workspaceId = String(state.selectedWorkspaceId || "owner").trim() || "owner";
  if (state.viewMode === "single" && state.singleWindowMode === "chat") {
    const chatScope = state.groupChatOpen ? "group" : "private";
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
    stableConversationJsonHash(message?.pluginActions),
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
  const model = currentThreadStateModel();
  if (typeof model?.mainConversationSurfaceRequestPlan === "function") {
    return model.mainConversationSurfaceRequestPlan({
      state,
      messageMode: currentSingleWindowMessageMode(),
    }).request;
  }
  const messageMode = currentSingleWindowMessageMode();
  if (!(messageMode === "chat" || (messageMode === "tasks" && !state.currentTaskGroupId))) return null;
  const groupChat = Boolean(state.viewMode === "single" && state.singleWindowMode === "chat" && state.groupChatOpen);
  return {
    seq: state.singleWindowRequestSeq,
    workspaceId: String(state.selectedWorkspaceId || ""),
    viewMode: String(state.viewMode || ""),
    singleWindowMode: String(state.singleWindowMode || ""),
    taskGroupId: String(state.currentTaskGroupId || ""),
    messageMode,
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
  const conversation = $("conversation");
  const alreadyShowingThread = Boolean(
    state.currentThread?.id === cached.id
    && state.currentThreadId === cached.id
    && conversation?.dataset?.chatRenderSignature
    && conversation?.querySelector("[data-message-id]")
  );
  if (alreadyShowingThread) return false;
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
    groupChat: Boolean(state.groupChatOpen),
  };
  return renderCachedSingleWindowThreadForRequest(request, options);
}

function renderSingleWindowChatPendingShell(options = {}) {
  const model = currentThreadStateModel();
  const plan = typeof model?.singleWindowPendingShellPlan === "function"
    ? model.singleWindowPendingShellPlan({ state, options })
    : null;
  if (plan && !plan.applies) return false;
  if (!plan && !(state.viewMode === "single" && state.singleWindowMode === "chat")) return false;
  const conversation = $("conversation");
  if (!conversation) return false;
  if (plan ? plan.resetRecoveryAttempts : !options.pendingRecovery) {
    state.singleWindowChatPendingRecoveryAttempts = 0;
  }
  renderThreads();
  $("threadTitle").textContent = "";
  $("threadMeta").textContent = "";
  $("interruptRun").disabled = true;
  if (typeof renderChatScopeHeader === "function") renderChatScopeHeader(null);
  if (typeof configureComposer === "function") {
    configureComposer({ enabled: false, shellLocked: true, placeholder: "Message Home AI..." });
  }
  delete conversation.dataset.chatRenderSignature;
  conversation.innerHTML = `<div class="empty-state">正在载入聊天...</div>`;
  conversation.scrollTop = 0;
  state.conversationPinnedToBottom = true;
  if (typeof updateNavigationControls === "function") updateNavigationControls();
  if (typeof ensureVerticalScrollAffordance === "function") ensureVerticalScrollAffordance(conversation);
  if (typeof scheduleMessageScrollButtonVisibility === "function") scheduleMessageScrollButtonVisibility(conversation);
  startupPerfMark("single-window-chat-pending-shell", {
    reason: String(plan?.reason || options.reason || "no-cache").slice(0, 80),
  });
  if ((plan ? plan.shouldScheduleRecovery : true) && typeof scheduleSingleWindowChatPendingRecovery === "function") {
    scheduleSingleWindowChatPendingRecovery(plan?.reason || options.reason || "pending-shell");
  }
  return true;
}

function renderSingleWindowChatErrorShell(err = null) {
  const model = currentThreadStateModel();
  const plan = typeof model?.singleWindowErrorShellPlan === "function"
    ? model.singleWindowErrorShellPlan({ state, error: err })
    : null;
  if (plan && !plan.applies) return false;
  if (!plan && !(state.viewMode === "single" && state.singleWindowMode === "chat")) return false;
  const conversation = $("conversation");
  if (!conversation) return false;
  delete conversation.dataset.chatRenderSignature;
  const status = plan?.status || err?.status || err?.statusCode || err?.code || "";
  const suffix = plan ? escapeHtml(plan.statusSuffix || "") : (status ? ` (${escapeHtml(status)})` : "");
  conversation.innerHTML = `<div class="empty-state">聊天加载失败${suffix}<br><button type="button" class="secondary" data-retry-single-window-chat>重试</button></div>`;
  conversation.querySelector("[data-retry-single-window-chat]")?.addEventListener("click", () => {
    loadSingleWindow({ skipSingleWindowCache: true, reason: "manual_retry" }).catch(showError);
  });
  if (typeof configureComposer === "function") {
    configureComposer({ enabled: false, shellLocked: true, placeholder: "Message Home AI..." });
  }
  startupPerfMark("single-window-chat-error-shell", {
    status: String(status || "").slice(0, 80),
  });
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

function groupChatOpenLocalStoragePlan(open) {
  const model = currentThreadStateModel();
  if (typeof model?.groupChatOpenStoragePlan === "function") {
    return model.groupChatOpenStoragePlan(open);
  }
  return {
    key: "hermesWebGroupChatOpen",
    value: open ? "1" : "0",
  };
}

function setGroupChatOpenStorage(open) {
  const plan = groupChatOpenLocalStoragePlan(open);
  localStorage.setItem(plan.key, plan.value);
}

function scheduleSingleWindowChatPendingRecovery(reason = "pending-shell", delayMs = 2200) {
  clearSingleWindowChatPendingRecovery();
  state.singleWindowChatPendingRecoveryTimer = window.setTimeout(() => {
    state.singleWindowChatPendingRecoveryTimer = 0;
    if (!singleWindowChatPendingShellVisible()) return;
    if (renderCachedSingleWindowThreadForCurrentViewShell({ stickToBottom: true })) {
      startupPerfMark("single-window-chat-pending-cache-recovery", {
        reason: String(reason || "").slice(0, 80),
      });
      return;
    }
    const attempts = Number(state.singleWindowChatPendingRecoveryAttempts || 0) || 0;
    if (attempts >= 2) {
      startupPerfMark("single-window-chat-pending-recovery-give-up", {
        reason: String(reason || "").slice(0, 80),
      });
      renderSingleWindowChatErrorShell({ code: "recovery_timeout" });
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
  const model = currentThreadStateModel();
  const requestPlan = typeof model?.singleWindowRequestPlan === "function"
    ? model.singleWindowRequestPlan({
      state,
      options,
      messageMode: currentSingleWindowMessageMode(),
    })
    : null;
  const request = Object.assign({}, requestPlan?.request || {
      seq: state.singleWindowRequestSeq + 1,
      workspaceId: String(state.selectedWorkspaceId || ""),
      viewMode: String(state.viewMode || ""),
      singleWindowMode: String(state.singleWindowMode || ""),
      taskGroupId: String(state.currentTaskGroupId || ""),
      messageMode: currentSingleWindowMessageMode(),
    });
  state.singleWindowRequestSeq = request.seq;
  const groupChat = Boolean(options.groupChat ?? (
    state.viewMode === "single"
    && state.singleWindowMode === "chat"
    && state.groupChatOpen
  ));
  request.groupChat = groupChat;
  const messageMode = request.messageMode;
  let renderedCachedSingleWindow = false;
  if (!options.skipSingleWindowCache) {
    renderedCachedSingleWindow = renderCachedSingleWindowThreadForRequest(request, options);
  }
  if (messageMode === "chat" && !renderedCachedSingleWindow) {
    renderSingleWindowChatPendingShell({
      reason: options.reason || (options.pendingRecovery ? "pending_recovery" : "chat_cache_miss"),
      pendingRecovery: Boolean(options.pendingRecovery),
    });
  }
  const refreshSurfaceKey = typeof singleWindowSurfaceCacheKeyForRequest === "function"
    ? singleWindowSurfaceCacheKeyForRequest(request)
    : "";
  const beforeRefreshSignature = refreshSurfaceKey && typeof mainConversationSurfaceThreadSignature === "function"
    ? mainConversationSurfaceThreadSignature(refreshSurfaceKey, state.currentThread)
    : "";
  state.singleWindowLoadInFlightSeq = request.seq;
  let result;
  try {
    const apiPlan = typeof model?.singleWindowRequestBodyPlan === "function"
      ? model.singleWindowRequestBodyPlan({
        request,
        chatMessageLimit: CHAT_MESSAGE_INITIAL_LIMIT,
        taskMessageLimit: TASK_MESSAGE_INITIAL_LIMIT,
        taskDetailMessageLimit: request.taskGroupId ? taskDetailMessageInitialLimit() : TASK_MESSAGE_INITIAL_LIMIT,
      })
      : {
        path: "/api/single-window",
        method: "POST",
        body: {
          workspaceId: request.workspaceId,
          groupChat,
          messageMode,
          taskGroupId: messageMode === "tasks" ? request.taskGroupId : "",
          messageLimit: messageMode === "tasks"
            ? (request.taskGroupId ? taskDetailMessageInitialLimit() : TASK_MESSAGE_INITIAL_LIMIT)
            : CHAT_MESSAGE_INITIAL_LIMIT,
        },
        timeoutMs: 12000,
      };
    result = await startupPerfStep("single-window-api", () => api(apiPlan.path || "/api/single-window", {
      method: apiPlan.method || "POST",
      body: JSON.stringify(apiPlan.body || {}),
      timeoutMs: apiPlan.timeoutMs || 12000,
    }));
  } catch (err) {
    if (messageMode === "chat" && singleWindowChatPendingShellVisible()) {
      if (!renderCachedSingleWindowThreadForCurrentViewShell({ stickToBottom: true })) {
        renderSingleWindowChatErrorShell(err);
      }
    }
    throw err;
  } finally {
    if (state.singleWindowLoadInFlightSeq === request.seq) state.singleWindowLoadInFlightSeq = 0;
  }
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
  state.caseTopicThreads = Array.isArray(result.caseTopicThreads) ? result.caseTopicThreads : [];
  if (messageMode === "tasks") scheduleKanbanTopicCardSnapshotRefresh();
  state.groupChatAvailable = Boolean(result.groupChatAvailable || selectedWorkspaceInThreadGroup(state.currentThread));
  rememberChatScopeThread(state.currentThread);
  if (groupChat && !currentUserCanUseGroupChatThread(state.currentThread)) {
    state.groupChatOpen = false;
    setGroupChatOpenStorage(false);
  }
  state.currentThreadId = state.currentThread.id;
  state.threads = [summarizeThread(state.currentThread)];
  if (state.viewMode !== "tasks") state.currentTaskGroupId = "";
  if (messageMode === "tasks") rememberTaskListThread(state.currentThread);
  const afterRefreshSignature = refreshSurfaceKey && typeof mainConversationSurfaceThreadSignature === "function"
    ? mainConversationSurfaceThreadSignature(refreshSurfaceKey, state.currentThread)
    : "";
  const renderPlan = typeof model?.singleWindowRefreshRenderPlan === "function"
    ? model.singleWindowRefreshRenderPlan({
      messageMode,
      currentTaskGroupId: state.currentTaskGroupId,
      beforeRefreshSignature,
      afterRefreshSignature,
      hasRenderedChatMessages: Boolean($("conversation")?.querySelector("[data-message-id]")),
      hasRenderedTaskRoot: Boolean($("conversation")?.querySelector(".directory-topic-launcher, [data-open-task], .empty-state")),
      preserveTaskListScroll: Boolean(options.preserveTaskListScroll),
      restoreTaskListScrollTop: options.restoreTaskListScrollTop,
      currentScrollTop: $("conversation")?.scrollTop || 0,
    })
    : null;
  const skipUnchangedChatRender = renderPlan
    ? renderPlan.skipUnchangedChatRender
    : (
      messageMode === "chat"
      && beforeRefreshSignature
      && beforeRefreshSignature === afterRefreshSignature
      && $("conversation")?.querySelector("[data-message-id]")
    );
  const skipUnchangedTaskRender = renderPlan
    ? renderPlan.skipUnchangedTaskRender
    : (
      messageMode === "tasks"
      && !state.currentTaskGroupId
      && beforeRefreshSignature
      && beforeRefreshSignature === afterRefreshSignature
      && $("conversation")?.querySelector(".directory-topic-launcher, [data-open-task], .empty-state")
    );
  const restoreTaskListScrollTop = renderPlan
    ? renderPlan.restoreTaskListScrollTop
    : (options.preserveTaskListScroll
      && messageMode === "tasks"
      && !state.currentTaskGroupId
      ? (
        Number.isFinite(Number(options.restoreTaskListScrollTop))
          ? Math.max(0, Number(options.restoreTaskListScrollTop) || 0)
          : $("conversation")?.scrollTop || 0
      )
      : null);
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
    setGroupChatOpenStorage(false);
    await loadSingleWindow({ groupChat: false });
    return;
  }
  if (isGroupChatView()) {
    renderCurrentThread({ stickToBottom: false });
    return;
  }
  state.groupChatOpen = true;
  setGroupChatOpenStorage(true);
  try {
    await loadSingleWindow({ groupChat: true });
  } catch (err) {
    state.groupChatOpen = false;
    setGroupChatOpenStorage(false);
    throw err;
  }
  if (currentUserCanUseGroupChatThread(state.currentThread)) {
    state.groupChatOpen = true;
    setGroupChatOpenStorage(true);
    renderCurrentThread({ stickToBottom: true });
    return;
  }
  state.groupChatOpen = false;
  setGroupChatOpenStorage(false);
  throw new Error("Group chat is not available for this workspace yet.");
}

async function toggleGroupChat() {
  await selectChatScope(isGroupChatView() ? "chat" : "group");
}
