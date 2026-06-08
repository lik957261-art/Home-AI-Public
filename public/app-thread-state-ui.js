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
  if (incomingPage && !incomingMessages.length && existingThreadMessages.length) {
    const messagesPage = mergeMessagesPage(existingPage, incomingPage, chatMessagesForThread(state.currentThread));
    return Object.assign({}, state.currentThread, incomingThread, { messages: existingThreadMessages, messagesPage });
  }
  const existingMessages = new Map((state.currentThread.messages || []).map((message) => [message.id, message]));
  const incomingIds = new Set();
  const messages = incomingMessages.map((message) => {
    incomingIds.add(message.id);
    return mergeServerMessage(existingMessages.get(message.id), message);
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
    : (state.viewMode === "tasks" || state.singleWindowMode === "task" ? "tasks" : "");
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
  if (!options.skipSingleWindowCache) {
    renderCachedSingleWindowThreadForRequest(request, options);
  }
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
  }));
  if (!singleWindowRequestStillCurrent(request)) return;
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
  const restoreTaskListScrollTop = options.preserveTaskListScroll
    && messageMode === "tasks"
    && !state.currentTaskGroupId
    ? $("conversation")?.scrollTop || 0
    : null;
  renderThreads();
  await startupPerfStep("render-current-thread", () => {
    renderCurrentThread({
      stickToBottom: restoreTaskListScrollTop === null,
      restoreScrollTop: restoreTaskListScrollTop,
    });
    return Promise.resolve();
  });
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
