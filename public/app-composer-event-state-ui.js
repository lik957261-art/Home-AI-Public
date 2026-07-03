"use strict";

function threadMatchesSelection(thread) {
  if (!thread) return false;
  if (
    state.selectedWorkspaceId
    && thread.workspaceId !== state.selectedWorkspaceId
    && !threadGroupMemberIds(thread).includes(state.selectedWorkspaceId)
  ) return false;
  if (state.viewMode === "single" || state.viewMode === "tasks") {
    if (!thread.singleWindow) return false;
    const search = currentSearchText().toLowerCase();
    if (state.viewMode === "tasks" && state.currentThread?.id === thread.id) {
      return taskListGroupsForThread(state.currentThread).some((group) => {
        if (!taskMatchesDirectoryFilter(group)) return false;
        if (!search) return true;
        return `${taskDisplayId(group)}\n${taskPrompt(group)}\n${taskSummary(group)}`.toLowerCase().includes(search);
      });
    }
    if (!search) return true;
    return `${thread.title || ""}\n${thread.preview || ""}`.toLowerCase().includes(search);
  }
  if (state.selectedProjectId && thread.projectId !== state.selectedProjectId) return false;
  if (state.selectedSubprojectId && (thread.subprojectId || "") !== state.selectedSubprojectId) return false;
  const search = currentSearchText().toLowerCase();
  if (!search) return true;
  return `${thread.title || ""}\n${thread.preview || ""}`.toLowerCase().includes(search);
}

function upsertThreadSummary(thread) {
  if (!thread) return;
  const index = state.threads.findIndex((item) => item.id === thread.id);
  if (!threadMatchesSelection(thread)) {
    if (index >= 0) state.threads.splice(index, 1);
    renderThreads();
    return;
  }
  if (index >= 0) state.threads[index] = Object.assign({}, state.threads[index], thread);
  else state.threads.unshift(thread);
  state.threads.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  renderThreads();
}

function upsertMessage(message) {
  if (!state.currentThread || !message) return;
  const messages = (state.currentThread.messages || [])
    .filter((item) => !localPendingSendReplacedByIncoming(item, [message], state.currentThread.messages || []));
  const index = messages.findIndex((item) => item.id === message.id);
  if (index >= 0) messages[index] = mergeServerMessage(messages[index], message);
  else messages.push(message);
  state.currentThread.messages = sortedThreadMessages(messages);
  if (state.viewMode === "tasks" && state.currentThread?.singleWindow && !currentTaskThreadIsSharedTopicThread()) {
    rememberTaskListThread(state.currentThread);
  }
  const mergedMessage = index >= 0 ? state.currentThread.messages.find((item) => item.id === message.id) || message : message;
  offerOwnerElevationForMessage(mergedMessage).catch(showError);
  if (state.viewMode === "tasks") renderThreads();
  invalidateComposerMessageProjection(mergedMessage, {
    existingIndex: index,
    delayMs: 0,
  });
}

function upsertCachedChatScopeMessage(threadId, message, threadSummary = null) {
  if (!threadId || !message) return false;
  let touched = false;
  const update = (thread) => {
    const messages = (thread.messages || [])
      .filter((item) => !localPendingSendReplacedByIncoming(item, [message], thread.messages || []));
    const index = messages.findIndex((item) => item.id === message.id);
    if (index >= 0) messages[index] = mergeServerMessage(messages[index], message);
    else messages.push(message);
    touched = true;
    return Object.assign({}, thread, threadSummary || {}, {
      messages: sortedThreadMessages(messages),
      updatedAt: threadSummary?.updatedAt || message.updatedAt || thread.updatedAt,
    });
  };
  if (state.groupChatThread?.id === threadId) {
    state.groupChatThread = update(state.groupChatThread);
    state.groupChatAvailable = true;
    state.groupChatThreadId = state.groupChatThread.id;
  }
  if (state.privateChatThread?.id === threadId) {
    state.privateChatThread = update(state.privateChatThread);
  }
  if (touched && isSingleWindowChatView()) renderChatScopeHeader(state.currentThread);
  return touched;
}
