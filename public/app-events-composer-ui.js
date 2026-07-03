"use strict";

function applyEvent(payload) {
  if (!payload || !payload.type) return;
  if (payload.clientVersion) handleClientVersion(payload.clientVersion, payload.type);
  if (payload.type === "client.version") return;
  if (payload.type === "todos.updated") {
    if (state.viewMode === "todos" && (!payload.workspaceId || payload.workspaceId === state.selectedWorkspaceId)) {
      loadTodos().catch(showError);
    }
    return;
  }
  if (payload.type === "learning-coins.updated") return;
  if (payload.type === "snapshot") {
    const drafts = state.threads.filter(isDraftThread).filter(threadMatchesSelection);
    const incoming = (payload.threads || state.threads).filter(threadMatchesSelection);
    const currentSummary = incoming.find((thread) => thread.id === state.currentThreadId);
    state.threads = [
      ...drafts,
      ...incoming.filter((thread) => !drafts.some((draft) => draft.id === thread.id)),
    ];
    renderThreads();
    if (shouldRefreshCurrentThreadForSummary(currentSummary)) {
      requestCurrentThreadRefresh({ stickToBottom: false, delayMs: 80 });
    }
    return;
  }
  if (payload.thread) upsertThreadSummary(payload.thread);
  if (payload.type === "thread.updated" && state.currentThread && payload.thread?.id === state.currentThread.id) {
    const beforeTaskRootSignature = isCurrentTopicRootListView() && typeof taskListRootRenderSignature === "function"
      ? taskListRootRenderSignature(state.currentThread)
      : "";
    const beforeTaskRootScrollTop = beforeTaskRootSignature ? ($("conversation")?.scrollTop || 0) : 0;
    const summaryHasRunningState = summaryHasActiveRun(payload.thread);
    const wasRunning = currentThreadHasPendingMessages(state.currentThread) || summaryHasRunningState;
    const terminalSummaryRefresh = wasRunning && !summaryHasRunningState;
    const shouldRefreshForSummary = shouldRefreshCurrentThreadForSummary(payload.thread);
    state.currentThread = mergeCurrentThread(payload.thread);
    if (typeof mergeTaskListThreadFromThreadUpdate === "function") {
      mergeTaskListThreadFromThreadUpdate(state.currentThread);
    }
    const afterTaskRootSignature = beforeTaskRootSignature && typeof taskListRootRenderSignature === "function"
      ? taskListRootRenderSignature(state.currentThread)
      : "";
    const topicRootUnchanged = Boolean(
      beforeTaskRootSignature
      && beforeTaskRootSignature === afterTaskRootSignature
      && $("conversation")?.querySelector(".directory-topic-launcher, [data-open-task], .empty-state")
    );
    if (shouldRefreshForSummary || terminalSummaryRefresh) {
      requestCurrentThreadRefresh({
        stickToBottom: terminalSummaryRefresh && (Boolean(state.currentTaskGroupId) || (state.viewMode === "single" && state.singleWindowMode === "chat")),
        delayMs: terminalSummaryRefresh ? 180 : 120,
      });
    }
    if (wasRunning) {
      updateComposerAction();
      renderComposerContext();
      scheduleTopicRootListRefresh(120);
      return;
    }
    if (topicRootUnchanged) {
      const conversation = $("conversation");
      if (conversation && beforeTaskRootScrollTop > 0 && conversation.scrollTop < beforeTaskRootScrollTop) {
        conversation.scrollTop = Math.min(beforeTaskRootScrollTop, Math.max(0, conversation.scrollHeight - conversation.clientHeight));
      }
      if (typeof rememberTaskListScrollPosition === "function") rememberTaskListScrollPosition();
      if (typeof scheduleConversationViewportRefresh === "function") scheduleConversationViewportRefresh(conversation);
      return;
    }
    renderCurrentThread({ stickToBottom: false });
    return;
  }
  if (payload.type === "message.delta") {
    appendDelta(payload.threadId, payload.messageId, payload.delta || "", payload);
    return;
  }
  if (payload.type === "run.event") {
    appendRunEventToCurrentThread(payload);
    return;
  }
  if (payload.type === "task.deleted" && state.currentThread && payload.threadId === state.currentThread.id) {
    state.currentThread = payload.thread || state.currentThread;
    if (state.currentTaskGroupId === payload.taskGroupId) state.currentTaskGroupId = "";
    renderThreads();
    renderCurrentThread({ stickToBottom: true });
    return;
  }
  if (payload.type === "task.renamed" && state.currentThread && payload.threadId === state.currentThread.id) {
    state.currentThread = payload.thread || state.currentThread;
    renderThreads();
    renderCurrentThread({ stickToBottom: false });
    return;
  }
  if (payload.message) upsertCachedChatScopeMessage(payload.threadId, payload.message, payload.thread);
  if (payload.message && state.currentThread && payload.threadId === state.currentThread.id) {
    upsertMessage(payload.message);
    if (payload.thread) {
      state.currentThread.status = payload.thread.status;
      state.currentThread.activeRunId = payload.thread.activeRunId;
      state.currentThread.activeRunIds = payload.thread.activeRunIds || [];
      state.currentThread.updatedAt = payload.thread.updatedAt;
    }
    if (typeof mergeTaskListThreadFromThreadUpdate === "function") {
      mergeTaskListThreadFromThreadUpdate(state.currentThread);
    }
    scheduleTopicRootListRefresh(120);
  }
}
