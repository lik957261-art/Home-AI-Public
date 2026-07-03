"use strict";

function currentThreadRouteSnapshot() {
  return {
    viewMode: String(state.viewMode || ""),
    singleWindowMode: String(state.singleWindowMode || ""),
    currentTaskGroupId: String(state.currentTaskGroupId || ""),
    selectedWorkspaceId: String(state.selectedWorkspaceId || ""),
    currentThreadId: String(state.currentThreadId || state.currentThread?.id || ""),
    primaryNavigationSeq: Number(state.primaryNavigationSeq || 0) || 0,
  };
}

function currentThreadRouteMatches(snapshot = null) {
  if (!snapshot || typeof snapshot !== "object") return true;
  if (String(state.viewMode || "") !== String(snapshot.viewMode || "")) return false;
  if (String(state.singleWindowMode || "") !== String(snapshot.singleWindowMode || "")) return false;
  if (String(state.currentTaskGroupId || "") !== String(snapshot.currentTaskGroupId || "")) return false;
  if (String(state.selectedWorkspaceId || "") !== String(snapshot.selectedWorkspaceId || "")) return false;
  if ((Number(state.primaryNavigationSeq || 0) || 0) !== (Number(snapshot.primaryNavigationSeq || 0) || 0)) return false;
  const currentThreadId = String(state.currentThreadId || state.currentThread?.id || "");
  const snapshotThreadId = String(snapshot.currentThreadId || "");
  if (snapshotThreadId && currentThreadId && currentThreadId !== snapshotThreadId) return false;
  return true;
}

function composerRefreshScheduler() {
  return window.ComposerRefreshScheduler || globalThis.ComposerRefreshScheduler || null;
}

function cancelCurrentThreadNavigationRefreshes() {
  window.clearTimeout(state.currentThreadRefreshTimer);
  state.currentThreadRefreshTimer = 0;
  state.currentThreadRefreshDueAt = 0;
  state.currentThreadRefreshPending = false;
  state.currentThreadRefreshPendingOptions = null;
  state.currentThreadRefreshSeq = (Number(state.currentThreadRefreshSeq || 0) || 0) + 1;
  window.clearTimeout(state.topicRootListRefreshTimer);
  state.topicRootListRefreshTimer = 0;
  if (typeof clearRunProgressFallbackThreadRefresh === "function") {
    clearRunProgressFallbackThreadRefresh();
  }
}

function isCurrentTopicRootListView() {
  return Boolean(state.viewMode === "tasks" && state.currentThread?.singleWindow && !state.currentTaskGroupId);
}

function scheduleTopicRootListRefresh(delayMs = 140) {
  if (!isCurrentTopicRootListView()) return;
  window.clearTimeout(state.topicRootListRefreshTimer);
  const conversation = $("conversation");
  const restoreScrollTop = conversation?.scrollTop || 0;
  const routeSnapshot = currentThreadRouteSnapshot();
  const beforeSignature = typeof taskListRootRenderSignature === "function"
    ? taskListRootRenderSignature(state.currentThread)
    : "";
  state.topicRootListRefreshTimer = window.setTimeout(() => {
    state.topicRootListRefreshTimer = 0;
    if (!currentThreadRouteMatches(routeSnapshot)) return;
    if (!isCurrentTopicRootListView()) return;
    const afterSignature = typeof taskListRootRenderSignature === "function"
      ? taskListRootRenderSignature(state.currentThread)
      : "";
    if (beforeSignature && beforeSignature === afterSignature && $("conversation")?.querySelector(".directory-topic-launcher, [data-open-task], .empty-state")) {
      if (typeof rememberTaskListScrollPosition === "function") rememberTaskListScrollPosition();
      if (typeof scheduleConversationViewportRefresh === "function") scheduleConversationViewportRefresh($("conversation"));
      return;
    }
    const liveScrollTop = $("conversation")?.scrollTop || 0;
    const restoreAtRefreshTop = Math.abs(liveScrollTop - restoreScrollTop) > 1
      ? liveScrollTop
      : restoreScrollTop;
    renderCurrentThread({ stickToBottom: false, restoreScrollTop: restoreAtRefreshTop });
  }, Math.max(0, Number(delayMs) || 0));
}

function currentThreadHasPendingMessages(thread = state.currentThread) {
  return Boolean(
    thread
    && (
      activeThreadRunIds(thread).length
      || (thread.messages || []).some((message) => (
        message?.role === "assistant"
        && ["queued", "running"].includes(String(message.status || ""))
      ))
    )
  );
}

function summaryHasActiveRun(summary) {
  return Boolean(
    (Array.isArray(summary?.activeRunIds) && summary.activeRunIds.length)
    || summary?.activeRunId
    || ["queued", "running"].includes(String(summary?.status || ""))
  );
}

function shouldRefreshCurrentThreadForSummary(summary) {
  if (!summary || !state.currentThread || summary.id !== state.currentThread.id) return false;
  const summaryUpdated = String(summary.updatedAt || "");
  const currentUpdated = String(state.currentThread.updatedAt || "");
  if (summaryUpdated && currentUpdated && summaryUpdated > currentUpdated) return true;
  return currentThreadHasPendingMessages() && !summaryHasActiveRun(summary);
}

async function refreshCurrentThreadFromServer(options = {}) {
  const routeSnapshot = options.routeSnapshot || currentThreadRouteSnapshot();
  const refreshSeq = Number.isFinite(Number(options.refreshSeq))
    ? Number(options.refreshSeq)
    : (Number(state.currentThreadRefreshSeq || 0) || 0);
  const threadId = String(routeSnapshot.currentThreadId || state.currentThreadId || state.currentThread?.id || "");
  if (!threadId || !["single", "tasks"].includes(String(routeSnapshot.viewMode || state.viewMode || ""))) return;
  if (refreshSeq !== (Number(state.currentThreadRefreshSeq || 0) || 0) || !currentThreadRouteMatches(routeSnapshot)) return;
  if (state.currentThreadRefreshInFlight) {
    const scheduler = composerRefreshScheduler();
    const keepPending = scheduler?.shouldKeepPendingRefresh?.(state, options)
      ?? (
        state.currentThreadRefreshPending
        && state.currentThreadRefreshPendingOptions
        && currentThreadRefreshDelayMs(state.currentThreadRefreshPendingOptions) <= currentThreadRefreshDelayMs(options)
      );
    if (keepPending) return;
    state.currentThreadRefreshPending = true;
    state.currentThreadRefreshPendingOptions = Object.assign({}, options, { routeSnapshot, refreshSeq });
    return;
  }
  state.currentThreadRefreshInFlight = true;
  state.currentThreadRefreshInFlightSeq = refreshSeq;
  state.currentThreadRefreshPending = false;
  const userScrollProtected = typeof conversationUserScrollProtectActive === "function" && conversationUserScrollProtectActive();
  const stickToBottom = userScrollProtected
    ? false
    : Object.prototype.hasOwnProperty.call(options, "stickToBottom")
    ? Boolean(options.stickToBottom || shouldForceChatStickToBottom())
    : (shouldForceChatStickToBottom() || isNearBottom());
  const beforeTaskRootSignature = isCurrentTopicRootListView() && typeof taskListRootRenderSignature === "function"
    ? taskListRootRenderSignature(state.currentThread)
    : "";
  const beforeTaskRootScrollTop = beforeTaskRootSignature ? ($("conversation")?.scrollTop || 0) : 0;
  try {
    let params = "";
    if (isSingleWindowChatView()) {
      params = `?${chatMessagePageParams({ limit: CHAT_MESSAGE_INITIAL_LIMIT })}`;
    } else if (isTaskWindowView()) {
      const query = new URLSearchParams({
        messageMode: "tasks",
        messageLimit: String(state.currentTaskGroupId
          ? (typeof taskDetailMessageInitialLimit === "function" ? taskDetailMessageInitialLimit() : 30)
          : TASK_MESSAGE_INITIAL_LIMIT),
      });
      if (state.currentTaskGroupId) query.set("taskGroupId", state.currentTaskGroupId);
      params = `?${query}`;
    }
    const result = await api(`/api/threads/${encodeURIComponent(threadId)}${params}`);
    if (refreshSeq !== (Number(state.currentThreadRefreshSeq || 0) || 0) || !currentThreadRouteMatches(routeSnapshot)) return;
    if ((state.currentThreadId || state.currentThread?.id || "") !== threadId) return;
    state.currentThread = mergeCurrentThread(result.thread);
    state.currentThreadId = state.currentThread?.id || threadId;
    upsertThreadSummary(summarizeThread(state.currentThread));
    const afterTaskRootSignature = beforeTaskRootSignature && typeof taskListRootRenderSignature === "function"
      ? taskListRootRenderSignature(state.currentThread)
      : "";
    if (
      beforeTaskRootSignature
      && beforeTaskRootSignature === afterTaskRootSignature
      && $("conversation")?.querySelector(".directory-topic-launcher, [data-open-task], .empty-state")
    ) {
      if (typeof rememberTaskListThread === "function") rememberTaskListThread(state.currentThread);
      if (typeof rememberTaskListScrollPosition === "function") rememberTaskListScrollPosition();
      const conversation = $("conversation");
      if (conversation && beforeTaskRootScrollTop > 0 && conversation.scrollTop < beforeTaskRootScrollTop) {
        conversation.scrollTop = Math.min(beforeTaskRootScrollTop, Math.max(0, conversation.scrollHeight - conversation.clientHeight));
      }
      if (typeof scheduleConversationViewportRefresh === "function") scheduleConversationViewportRefresh(conversation);
      return;
    }
    renderCurrentThread({ stickToBottom });
  } catch (err) {
    if (options.reportError) showError(err);
  } finally {
    if (state.currentThreadRefreshInFlightSeq === refreshSeq) {
      state.currentThreadRefreshInFlight = false;
      state.currentThreadRefreshInFlightSeq = 0;
      if (state.currentThreadRefreshPending) {
        const pendingOptions = state.currentThreadRefreshPendingOptions || options;
        state.currentThreadRefreshPending = false;
        state.currentThreadRefreshPendingOptions = null;
        requestCurrentThreadRefresh(Object.assign({}, pendingOptions, {
          delayMs: composerRefreshScheduler()?.pendingDelayMs?.(pendingOptions, 180) ?? Math.min(currentThreadRefreshDelayMs(pendingOptions), 180),
        }));
      }
    }
  }
}

function currentThreadRefreshDelayMs(options = {}) {
  const scheduler = composerRefreshScheduler();
  if (typeof scheduler?.refreshDelayMs === "function") return scheduler.refreshDelayMs(options);
  const hasDelay = Object.prototype.hasOwnProperty.call(options, "delayMs");
  const value = Number(hasDelay ? options.delayMs : 120);
  return Math.max(0, Number.isFinite(value) ? value : 120);
}

function requestCurrentThreadRefresh(options = {}) {
  if (!state.currentThreadId || !["single", "tasks"].includes(state.viewMode)) return;
  const delayMs = currentThreadRefreshDelayMs(options);
  const scheduler = composerRefreshScheduler();
  const dueAt = typeof scheduler?.timerDueAt === "function"
    ? scheduler.timerDueAt(Date.now(), options)
    : Date.now() + delayMs;
  const existingDueAt = Number(state.currentThreadRefreshDueAt || 0) || 0;
  const keepScheduled = scheduler?.shouldKeepScheduledRefresh?.(state, dueAt)
    ?? Boolean(state.currentThreadRefreshTimer && existingDueAt && existingDueAt <= dueAt);
  if (keepScheduled) return;
  window.clearTimeout(state.currentThreadRefreshTimer);
  const routeSnapshot = options.routeSnapshot || currentThreadRouteSnapshot();
  const refreshSeq = Number.isFinite(Number(options.refreshSeq))
    ? Number(options.refreshSeq)
    : (Number(state.currentThreadRefreshSeq || 0) || 0);
  state.currentThreadRefreshDueAt = dueAt;
  state.currentThreadRefreshTimer = window.setTimeout(() => {
    state.currentThreadRefreshTimer = 0;
    state.currentThreadRefreshDueAt = 0;
    if (refreshSeq !== (Number(state.currentThreadRefreshSeq || 0) || 0) || !currentThreadRouteMatches(routeSnapshot)) return;
    refreshCurrentThreadFromServer(Object.assign({}, options, { routeSnapshot, refreshSeq })).catch(() => {});
  }, delayMs);
}
