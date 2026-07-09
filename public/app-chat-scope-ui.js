"use strict";

const CHAT_SCOPE_MODEL_ESM_PATH = "/vite-islands/chat-scope-model/chat-scope-model.js";
let chatScopeModel = null;
let chatScopeModelPromise = null;

function importChatScopeModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (chatScopeModel) return Promise.resolve(chatScopeModel);
  if (!chatScopeModelPromise) {
    const importer = typeof rootRef.__homeAiImportChatScopeModel === "function"
      ? rootRef.__homeAiImportChatScopeModel
      : (path) => import(path);
    chatScopeModelPromise = Promise.resolve()
      .then(() => importer(CHAT_SCOPE_MODEL_ESM_PATH))
      .then((model) => {
        chatScopeModel = model || null;
        return chatScopeModel;
      })
      .catch((error) => {
        chatScopeModelPromise = null;
        throw error;
      });
  }
  return chatScopeModelPromise;
}

function currentChatScopeModel() {
  return chatScopeModel;
}

if (typeof window !== "undefined") {
  importChatScopeModel().catch(() => null);
}

function threadGroupMemberIds(thread = state.currentThread) {
  const model = currentChatScopeModel();
  if (typeof model?.threadGroupMemberIdsPlan === "function") {
    return model.threadGroupMemberIdsPlan(thread).memberIds || [];
  }
  return Array.isArray(thread?.chatGroup?.memberWorkspaceIds) ? thread.chatGroup.memberWorkspaceIds : [];
}

function isThreadGroupChat(thread = state.currentThread) {
  const model = currentChatScopeModel();
  if (typeof model?.isThreadGroupChatPlan === "function") {
    return Boolean(model.isThreadGroupChatPlan({ thread, memberIds: threadGroupMemberIds(thread) }).groupChat);
  }
  return Boolean(thread?.singleWindow && thread?.chatGroup?.enabled && threadGroupMemberIds(thread).length);
}

function selectedWorkspaceInThreadGroup(thread = state.currentThread) {
  const model = currentChatScopeModel();
  if (typeof model?.selectedWorkspaceInThreadGroupPlan === "function") {
    return Boolean(model.selectedWorkspaceInThreadGroupPlan({
      thread,
      memberIds: threadGroupMemberIds(thread),
      selectedWorkspaceId: state.selectedWorkspaceId,
      groupChat: isThreadGroupChat(thread),
    }).selected);
  }
  return isThreadGroupChat(thread) && threadGroupMemberIds(thread).includes(state.selectedWorkspaceId);
}

function currentUserCanUseGroupChatThread(thread = state.currentThread) {
  const model = currentChatScopeModel();
  if (typeof model?.currentUserCanUseGroupChatThreadPlan === "function") {
    return Boolean(model.currentUserCanUseGroupChatThreadPlan({
      thread,
      memberIds: threadGroupMemberIds(thread),
      selectedWorkspaceId: state.selectedWorkspaceId,
      selectedWorkspaceInThreadGroup: selectedWorkspaceInThreadGroup(thread),
      isOwner: state.auth?.isOwner,
      groupChat: isThreadGroupChat(thread),
    }).canUse);
  }
  return selectedWorkspaceInThreadGroup(thread) || Boolean(state.auth?.isOwner && isThreadGroupChat(thread));
}

function isGroupChatView() {
  const model = currentChatScopeModel();
  if (typeof model?.groupChatViewPlan === "function") {
    return Boolean(model.groupChatViewPlan({
      singleWindowChatView: isSingleWindowChatView(),
      groupChatOpen: state.groupChatOpen,
      canUseGroupChatThread: currentUserCanUseGroupChatThread(state.currentThread),
    }).groupChatView);
  }
  return isSingleWindowChatView() && state.groupChatOpen && currentUserCanUseGroupChatThread(state.currentThread);
}

function groupChatSelectable(thread = state.currentThread) {
  const model = currentChatScopeModel();
  if (typeof model?.groupChatSelectablePlan === "function") {
    return Boolean(model.groupChatSelectablePlan({
      thread,
      selectedWorkspaceInThreadGroup: selectedWorkspaceInThreadGroup(thread),
      groupChatAvailable: state.groupChatAvailable,
      isOwner: state.auth?.isOwner,
    }).selectable);
  }
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
  const model = currentChatScopeModel();
  if (typeof model?.chatScopeTaskGroupIdPlan === "function") {
    return model.chatScopeTaskGroupIdPlan({
      scope,
      groupTaskGroupId: SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID,
      chatTaskGroupId: SINGLE_WINDOW_CHAT_TASK_GROUP_ID,
    }).taskGroupId;
  }
  return String(scope || "").trim().toLowerCase() === "group"
    ? SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID
    : SINGLE_WINDOW_CHAT_TASK_GROUP_ID;
}

function activeChatScope() {
  const model = currentChatScopeModel();
  if (typeof model?.activeChatScopePlan === "function") {
    return model.activeChatScopePlan({ groupChatView: isGroupChatView() }).scope;
  }
  return isGroupChatView() ? "group" : "chat";
}

function chatScopeReadStorageKey(scope) {
  const model = currentChatScopeModel();
  if (typeof model?.chatScopeReadStorageKeyPlan === "function") {
    return model.chatScopeReadStorageKeyPlan({
      scope,
      selectedWorkspaceId: state.selectedWorkspaceId,
      authWorkspaceId: state.auth?.workspaceId,
      taskGroupId: chatScopeTaskGroupId(scope),
    }).key;
  }
  const normalized = String(scope || "chat").trim().toLowerCase() || "chat";
  const workspaceId = String(state.selectedWorkspaceId || state.auth?.workspaceId || "").trim() || "workspace-unselected";
  return `hermesChatScopeRead:${workspaceId}:${normalized}:${chatScopeTaskGroupId(scope)}`;
}

function chatScopeMessageTimeMs(message) {
  const model = currentChatScopeModel();
  if (typeof model?.chatScopeMessageTimeMsPlan === "function") {
    return model.chatScopeMessageTimeMsPlan({ timestamp: messageTimelineTimestamp(message) }).timeMs;
  }
  const parsed = Date.parse(String(messageTimelineTimestamp(message) || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestChatScopeMessageTimeMs(thread, scope) {
  const sourceThread = chatScopeThread(thread, scope);
  const messageTimes = chatMessagesForThread(sourceThread, chatScopeTaskGroupId(scope)).map(chatScopeMessageTimeMs);
  const model = currentChatScopeModel();
  if (typeof model?.latestChatScopeMessageTimeMsPlan === "function") {
    return model.latestChatScopeMessageTimeMsPlan({ messageTimes }).latestMs;
  }
  return Math.max(0, ...messageTimes);
}

function chatScopeReadAt(scope) {
  const value = Number(localStorage.getItem(chatScopeReadStorageKey(scope)) || "0");
  const model = currentChatScopeModel();
  if (typeof model?.chatScopeReadAtPlan === "function") {
    return model.chatScopeReadAtPlan({ storedValue: value, sessionStartedAt: CHAT_SCOPE_SESSION_STARTED_AT }).readAt;
  }
  return Number.isFinite(value) && value > 0 ? value : CHAT_SCOPE_SESSION_STARTED_AT;
}

function setChatScopeReadAt(scope, value) {
  const model = currentChatScopeModel();
  const plan = typeof model?.setChatScopeReadAtPlan === "function"
    ? model.setChatScopeReadAtPlan({ scope, value, key: chatScopeReadStorageKey(scope) })
    : null;
  const timestamp = plan?.timestamp ?? Math.max(0, Number(value) || 0);
  if (plan ? plan.shouldWrite : timestamp) {
    localStorage.setItem(plan?.storage?.key || chatScopeReadStorageKey(scope), plan?.storage?.value || String(timestamp));
  }
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
  const model = currentChatScopeModel();
  if (message?.role !== "user") return false;
  const ownerWorkspaceId = messageOwnerWorkspaceId(message, "");
  if (typeof model?.isOwnChatScopeMessagePlan === "function") {
    return Boolean(model.isOwnChatScopeMessagePlan({
      role: message?.role,
      ownerWorkspaceId,
      selectedWorkspaceId: state.selectedWorkspaceId,
    }).own);
  }
  return Boolean(ownerWorkspaceId && ownerWorkspaceId === state.selectedWorkspaceId);
}

function unreadChatScopeCount(thread, scope) {
  const sourceThread = chatScopeThread(thread, scope);
  if (!isSingleWindowChatView() || !sourceThread) return 0;
  const readAt = chatScopeReadAt(scope);
  if (!readAt) return 0;
  const messages = chatMessagesForThread(sourceThread, chatScopeTaskGroupId(scope))
    .map((message) => ({
      timeMs: chatScopeMessageTimeMs(message),
      own: isOwnChatScopeMessage(message),
    }));
  const model = currentChatScopeModel();
  if (typeof model?.unreadChatScopeCountPlan === "function") {
    return model.unreadChatScopeCountPlan({
      singleWindowChatView: isSingleWindowChatView(),
      sourceThreadExists: Boolean(sourceThread),
      readAt,
      messages,
    }).count;
  }
  return messages
    .filter((message) => message.timeMs > readAt)
    .filter((message) => !message.own)
    .length;
}

function groupChatMemberLabels(thread = state.currentThread) {
  const members = Array.isArray(thread?.chatGroup?.members) ? thread.chatGroup.members : [];
  const workspaceLabelsById = Object.fromEntries((state.workspaces || []).map((item) => [item.id, item.label || item.id]));
  const model = currentChatScopeModel();
  if (typeof model?.groupChatMemberLabelsPlan === "function") {
    return model.groupChatMemberLabelsPlan({
      members,
      memberIds: threadGroupMemberIds(thread),
      workspaceLabelsById,
      assistantLabel: assistantDisplayLabel(),
    }).labels || [];
  }
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
  const model = currentChatScopeModel();
  if (typeof model?.groupChatMentionMembersPlan === "function") {
    return model.groupChatMentionMembersPlan({
      members,
      memberIds: threadGroupMemberIds(thread),
      workspaceLabelsById: Object.fromEntries((state.workspaces || []).map((item) => [item.id, item.label || item.id])),
      selectedWorkspaceId: state.selectedWorkspaceId,
      includeAi: options.includeAi,
      assistantMember: virtualAssistantMember(),
    }).members || [];
  }
  const realMembers = members
    .map((member) => ({
      workspaceId: String(member.workspaceId || "").trim(),
      label: String(member.label || member.workspaceId || "").trim(),
    }))
    .filter((member) => member.workspaceId && member.workspaceId !== state.selectedWorkspaceId);
  if (options.includeAi === false) return realMembers;
  return [virtualAssistantMember(), ...realMembers];
}
