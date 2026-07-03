"use strict";

function threadGroupMemberIds(thread = state.currentThread) {
  return Array.isArray(thread?.chatGroup?.memberWorkspaceIds) ? thread.chatGroup.memberWorkspaceIds : [];
}

function isThreadGroupChat(thread = state.currentThread) {
  return Boolean(thread?.singleWindow && thread?.chatGroup?.enabled && threadGroupMemberIds(thread).length);
}

function selectedWorkspaceInThreadGroup(thread = state.currentThread) {
  return isThreadGroupChat(thread) && threadGroupMemberIds(thread).includes(state.selectedWorkspaceId);
}

function currentUserCanUseGroupChatThread(thread = state.currentThread) {
  return selectedWorkspaceInThreadGroup(thread) || Boolean(state.auth?.isOwner && isThreadGroupChat(thread));
}

function isGroupChatView() {
  return isSingleWindowChatView() && state.groupChatOpen && currentUserCanUseGroupChatThread(state.currentThread);
}

function groupChatSelectable(thread = state.currentThread) {
  return Boolean(thread?.singleWindow && (
    selectedWorkspaceInThreadGroup(thread)
    || state.groupChatAvailable
    || state.auth?.isOwner
  ));
}

function mergeChatScopeThread(existingThread, incomingThread) {
  if (!incomingThread) return existingThread || null;
  if (!existingThread || existingThread.id !== incomingThread.id) return incomingThread;
  const existingPage = existingThread.messagesPage || null;
  const incomingPage = incomingThread.messagesPage || null;
  const incomingMessages = Array.isArray(incomingThread.messages) ? incomingThread.messages : [];
  const existingThreadMessages = existingThread.messages || [];
  if (incomingPage && !incomingMessages.length && existingThreadMessages.length) {
    const messagesPage = mergeMessagesPage(existingPage, incomingPage, chatMessagesForThread(existingThread, incomingPage.taskGroupId || activeChatTaskGroupId()));
    return Object.assign({}, existingThread, incomingThread, { messages: existingThreadMessages, messagesPage });
  }
  const existingMessages = new Map((existingThread.messages || []).map((message) => [message.id, message]));
  const incomingIds = new Set();
  const messages = incomingMessages.map((message) => {
    incomingIds.add(message.id);
    return mergeServerMessage(existingMessages.get(message.id), message);
  });
  for (const message of existingThread.messages || []) {
    if (localPendingSendReplacedByIncoming(message, incomingMessages, existingThread.messages || [])) continue;
    if (!incomingIds.has(message.id) && (!incomingPage || shouldPreserveMessageOutsideIncomingPage(message))) {
      messages.push(message);
    }
  }
  const sortedMessages = sortedThreadMessages(messages);
  const pageMessages = incomingPage?.mode === "chat" || existingPage?.mode === "chat"
    ? sortedMessages.filter((message) => String(message?.taskGroupId || "") === String((incomingPage || existingPage)?.taskGroupId || activeChatTaskGroupId()))
    : sortedMessages;
  const messagesPage = incomingPage || existingPage
    ? mergeMessagesPage(existingPage, incomingPage, pageMessages)
    : null;
  return Object.assign({}, existingThread, incomingThread, { messages: sortedMessages, messagesPage });
}

function rememberChatScopeThread(thread) {
  if (!thread?.singleWindow) return;
  const pageMode = String(thread.messagesPage?.mode || "").trim();
  if (pageMode && pageMode !== "chat") return;
  if (!pageMode && Array.isArray(thread.taskGroups) && thread.taskGroups.length) return;
  if (selectedWorkspaceInThreadGroup(thread)) {
    state.groupChatThread = mergeChatScopeThread(state.groupChatThread, thread);
    state.groupChatThreadId = state.groupChatThread?.id || thread.id || "";
    state.groupChatAvailable = true;
    return;
  }
  if (thread.workspaceId === state.selectedWorkspaceId) {
    state.privateChatThread = mergeChatScopeThread(state.privateChatThread, thread);
  }
}

function chatScopeThread(thread, scope) {
  const normalized = String(scope || "").trim().toLowerCase();
  if (normalized === "group") {
    if (thread?.id && thread.id === state.groupChatThread?.id) return thread;
    return state.groupChatThread || (selectedWorkspaceInThreadGroup(thread) ? thread : null);
  }
  if (thread?.id && thread.id === state.privateChatThread?.id) return thread;
  return state.privateChatThread || (!selectedWorkspaceInThreadGroup(thread) ? thread : null);
}

function chatScopeTaskGroupId(scope) {
  return String(scope || "").trim().toLowerCase() === "group"
    ? SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID
    : SINGLE_WINDOW_CHAT_TASK_GROUP_ID;
}

function activeChatScope() {
  return isGroupChatView() ? "group" : "chat";
}

function chatScopeReadStorageKey(scope) {
  const normalized = String(scope || "chat").trim().toLowerCase() || "chat";
  const workspaceId = String(state.selectedWorkspaceId || state.auth?.workspaceId || "").trim() || "workspace-unselected";
  return `hermesChatScopeRead:${workspaceId}:${normalized}:${chatScopeTaskGroupId(scope)}`;
}

function chatScopeMessageTimeMs(message) {
  const parsed = Date.parse(String(messageTimelineTimestamp(message) || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestChatScopeMessageTimeMs(thread, scope) {
  const sourceThread = chatScopeThread(thread, scope);
  return Math.max(0, ...chatMessagesForThread(sourceThread, chatScopeTaskGroupId(scope)).map(chatScopeMessageTimeMs));
}

function chatScopeReadAt(scope) {
  const value = Number(localStorage.getItem(chatScopeReadStorageKey(scope)) || "0");
  return Number.isFinite(value) && value > 0 ? value : CHAT_SCOPE_SESSION_STARTED_AT;
}

function setChatScopeReadAt(scope, value) {
  const timestamp = Math.max(0, Number(value) || 0);
  if (timestamp) localStorage.setItem(chatScopeReadStorageKey(scope), String(timestamp));
}

function ensureChatScopeReadBaselines(thread = state.currentThread) {
  if (!isSingleWindowChatView() || !thread) return;
  // Missing read markers initialize from the page-load timestamp.
  // That avoids counting old group messages while preserving badges for new SSE messages.
}

function markActiveChatScopeRead(thread = state.currentThread) {
  if (!isSingleWindowChatView() || !thread) return;
  const scope = activeChatScope();
  const latest = latestChatScopeMessageTimeMs(thread, scope);
  if (latest) setChatScopeReadAt(scope, latest);
}

function isOwnChatScopeMessage(message) {
  if (message?.role !== "user") return false;
  const ownerWorkspaceId = messageOwnerWorkspaceId(message, "");
  return Boolean(ownerWorkspaceId && ownerWorkspaceId === state.selectedWorkspaceId);
}

function unreadChatScopeCount(thread, scope) {
  const sourceThread = chatScopeThread(thread, scope);
  if (!isSingleWindowChatView() || !sourceThread) return 0;
  const readAt = chatScopeReadAt(scope);
  if (!readAt) return 0;
  return chatMessagesForThread(sourceThread, chatScopeTaskGroupId(scope))
    .filter((message) => chatScopeMessageTimeMs(message) > readAt)
    .filter((message) => !isOwnChatScopeMessage(message))
    .length;
}

function groupChatMemberLabels(thread = state.currentThread) {
  const members = Array.isArray(thread?.chatGroup?.members) ? thread.chatGroup.members : [];
  const labels = members.length ? members.map((item) => item.label || item.workspaceId).filter(Boolean) : threadGroupMemberIds(thread).map((workspaceId) => {
    const workspace = state.workspaces.find((item) => item.id === workspaceId);
    return workspace?.label || workspaceId;
  }).filter(Boolean);
  return [...new Set([...labels, assistantDisplayLabel()])];
}

function groupChatMentionMembers(thread = state.currentThread, options = {}) {
  const members = Array.isArray(thread?.chatGroup?.members) && thread.chatGroup.members.length
    ? thread.chatGroup.members
    : threadGroupMemberIds(thread).map((workspaceId) => {
      const workspace = state.workspaces.find((item) => item.id === workspaceId);
      return { workspaceId, label: workspace?.label || workspaceId };
    });
  const realMembers = members
    .map((member) => ({
      workspaceId: String(member.workspaceId || "").trim(),
      label: String(member.label || member.workspaceId || "").trim(),
    }))
    .filter((member) => member.workspaceId && member.workspaceId !== state.selectedWorkspaceId);
  if (options.includeAi === false) return realMembers;
  return [virtualAssistantMember(), ...realMembers];
}
