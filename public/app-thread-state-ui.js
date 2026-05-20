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
  const existingMessages = new Map((state.currentThread.messages || []).map((message) => [message.id, message]));
  const incomingIds = new Set();
  const messages = (incomingThread.messages || []).map((message) => {
    incomingIds.add(message.id);
    return mergeServerMessage(existingMessages.get(message.id), message);
  });
  for (const message of state.currentThread.messages || []) {
    if (!incomingIds.has(message.id)) messages.push(message);
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

async function loadSingleWindow(options = {}) {
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
  const messageMode = isSingleWindowChatView()
    ? "chat"
    : (state.viewMode === "tasks" || state.singleWindowMode === "task" ? "tasks" : "");
  const result = await api("/api/single-window", {
    method: "POST",
    body: JSON.stringify({
      workspaceId: state.selectedWorkspaceId,
      groupChat,
      weixinChat,
      messageMode,
      taskGroupId: messageMode === "tasks" ? state.currentTaskGroupId : "",
      messageLimit: messageMode === "tasks" ? TASK_MESSAGE_INITIAL_LIMIT : CHAT_MESSAGE_INITIAL_LIMIT,
    }),
    timeoutMs: 12000,
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
  if (groupChat && !selectedWorkspaceInThreadGroup(state.currentThread)) {
    state.groupChatOpen = false;
    localStorage.setItem("hermesWebGroupChatOpen", "0");
  }
  state.currentThreadId = state.currentThread.id;
  state.threads = [summarizeThread(state.currentThread)];
  if (state.viewMode !== "tasks") state.currentTaskGroupId = "";
  if (messageMode === "tasks") rememberTaskListThread(state.currentThread);
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
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
  localStorage.setItem("hermesWebWeixinChatOpen", "0");
  await loadSingleWindow({ groupChat: true, weixinChat: false });
  if (selectedWorkspaceInThreadGroup(state.currentThread)) {
    state.groupChatOpen = true;
    localStorage.setItem("hermesWebGroupChatOpen", "1");
    renderCurrentThread({ stickToBottom: true });
    return;
  }
  if (!state.auth?.isOwner) {
    state.groupChatOpen = false;
    localStorage.setItem("hermesWebGroupChatOpen", "0");
    throw new Error("当前账号还没有可加入的群聊");
  }
  const ownerId = state.currentThread?.workspaceId || state.selectedWorkspaceId || "owner";
  const memberWorkspaceIds = [...new Set([ownerId, state.selectedWorkspaceId || ownerId].filter(Boolean))];
  const result = await api(`/api/threads/${encodeURIComponent(state.currentThread.id)}/group-chat`, {
    method: "PATCH",
    body: JSON.stringify({ enabled: true, memberWorkspaceIds }),
  });
  state.currentThread = mergeCurrentThread(result.thread);
  state.currentThreadId = state.currentThread.id;
  state.threads = [summarizeThread(state.currentThread)];
  state.groupChatOpen = true;
  localStorage.setItem("hermesWebGroupChatOpen", "1");
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
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
