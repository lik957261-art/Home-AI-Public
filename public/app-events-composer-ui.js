"use strict";

const STREAMING_MESSAGE_LIVE_BUFFER_CHARS = 16000;
const STREAMING_MESSAGE_RENDER_THROTTLE_MS = 90;

function appendStreamingMessageBounded(current, delta) {
  const next = `${current || ""}${delta || ""}`;
  if (next.length <= STREAMING_MESSAGE_LIVE_BUFFER_CHARS) return next;
  const tailChars = Math.floor(STREAMING_MESSAGE_LIVE_BUFFER_CHARS * 0.75);
  const tail = next.slice(-tailChars);
  return `[live content truncated: ${next.length} chars total]\n\n${tail}`;
}

function scheduleRenderCurrentThread() {
  if (state.renderScheduled) return;
  const conversation = $("conversation");
  if (!conversation) return;
  state.shouldStickToBottom = shouldForceChatStickToBottom() || isNearBottom();
  state.preservedBottomOffset = conversation.scrollHeight - conversation.scrollTop;
  state.renderScheduled = true;
  requestAnimationFrame(() => {
    state.renderScheduled = false;
    renderCurrentThread({ stickToBottom: state.shouldStickToBottom });
  });
}

function isCurrentTopicRootListView() {
  return Boolean(state.viewMode === "tasks" && state.currentThread?.singleWindow && !state.currentTaskGroupId);
}

function scheduleTopicRootListRefresh(delayMs = 140) {
  if (!isCurrentTopicRootListView()) return;
  window.clearTimeout(state.topicRootListRefreshTimer);
  const conversation = $("conversation");
  const restoreScrollTop = conversation?.scrollTop || 0;
  state.topicRootListRefreshTimer = window.setTimeout(() => {
    state.topicRootListRefreshTimer = 0;
    if (!isCurrentTopicRootListView()) return;
    renderCurrentThread({ stickToBottom: false, restoreScrollTop });
  }, Math.max(0, Number(delayMs) || 0));
}

function renderStreamingMessageContent(message) {
  if (!message?.id || message.role !== "assistant") return false;
  if (isChatSearchMode() && currentChatSearchQuery()) return false;
  const article = messageElementById(message.id);
  const body = article?.querySelector?.(".message-body");
  const content = body?.querySelector?.(".text-content");
  if (!article || !body || !content || message.revokedAt) return false;
  const shouldStick = shouldForceChatStickToBottom() || isNearBottom();
  const messageStatus = String(message.status || "");
  const active = ["queued", "running"].includes(messageStatus);
  try {
    article.classList.toggle("streaming-active", active);
    content.outerHTML = renderText(message.content || "", message);
  } catch (err) {
    console.warn("renderStreamingMessageContent failed", err);
    content.className = "text-content plain-text";
    content.textContent = String(message.content || "");
  }
  if (shouldStick) {
    const conversation = $("conversation");
    conversation.scrollTop = conversation.scrollHeight;
    state.conversationPinnedToBottom = true;
    if (isSingleWindowChatView()) scheduleConversationBottomStick();
  } else {
    state.conversationPinnedToBottom = false;
  }
  scheduleMessageScrollButtonVisibility($("conversation"));
  if (!active) {
    scheduleMessageScrollButtonVisibilitySettle(article, [120, 360]);
  }
  return true;
}

function scheduleStreamingMessageRender(message) {
  if (!message?.id) return false;
  const id = String(message.id);
  if (state.streamingMessageRenderScheduled.has(id)) return true;
  state.streamingMessageRenderScheduled.add(id);
  const contentLength = String(message.content || "").length;
  const minDelay = contentLength > ACTIVE_MESSAGE_RICH_RENDER_LIMIT ? 180 : STREAMING_MESSAGE_RENDER_THROTTLE_MS;
  const lastAt = state.streamingMessageRenderLastAt.get(id) || 0;
  const delay = minDelay ? Math.max(0, minDelay - (Date.now() - lastAt)) : 0;
  const render = () => requestAnimationFrame(() => {
    state.streamingMessageRenderScheduled.delete(id);
    state.streamingMessageRenderLastAt.set(id, Date.now());
    if (!renderStreamingMessageContent(message)) scheduleRenderCurrentThread();
  });
  if (delay) window.setTimeout(render, delay);
  else render();
  return true;
}

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
  if (
    index >= 0
    && mergedMessage?.role === "assistant"
    && scheduleStreamingMessageRender(mergedMessage)
  ) {
    if (["queued", "running"].includes(String(mergedMessage.status || ""))) {
      scheduleRunProgressRenderForRun(mergedMessage.runId || state.currentThread.activeRunId || "");
    }
    return;
  }
  scheduleRenderCurrentThread();
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
  if (state.weixinChatThread?.id === threadId) {
    state.weixinChatThread = update(state.weixinChatThread);
    state.weixinChatAvailable = true;
    state.weixinChatThreadId = state.weixinChatThread.id;
  }
  if (state.privateChatThread?.id === threadId) {
    state.privateChatThread = update(state.privateChatThread);
  }
  if (touched && isSingleWindowChatView()) renderChatScopeHeader(state.currentThread);
  return touched;
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
  const threadId = state.currentThreadId || state.currentThread?.id || "";
  if (!threadId || !["single", "tasks"].includes(state.viewMode)) return;
  if (state.currentThreadRefreshInFlight) {
    state.currentThreadRefreshPending = true;
    return;
  }
  state.currentThreadRefreshInFlight = true;
  state.currentThreadRefreshPending = false;
  const stickToBottom = Object.prototype.hasOwnProperty.call(options, "stickToBottom")
    ? Boolean(options.stickToBottom || shouldForceChatStickToBottom())
    : (shouldForceChatStickToBottom() || isNearBottom());
  try {
    let params = "";
    if (isSingleWindowChatView()) {
      params = `?${chatMessagePageParams({ limit: CHAT_MESSAGE_INITIAL_LIMIT })}`;
    } else if (isTaskWindowView()) {
      const query = new URLSearchParams({
        messageMode: "tasks",
        messageLimit: String(TASK_MESSAGE_INITIAL_LIMIT),
      });
      if (state.currentTaskGroupId) query.set("taskGroupId", state.currentTaskGroupId);
      params = `?${query}`;
    }
    const result = await api(`/api/threads/${encodeURIComponent(threadId)}${params}`);
    if ((state.currentThreadId || state.currentThread?.id || "") !== threadId) return;
    state.currentThread = mergeCurrentThread(result.thread);
    state.currentThreadId = state.currentThread?.id || threadId;
    upsertThreadSummary(summarizeThread(state.currentThread));
    renderCurrentThread({ stickToBottom });
  } catch (err) {
    if (options.reportError) showError(err);
  } finally {
    state.currentThreadRefreshInFlight = false;
    if (state.currentThreadRefreshPending) {
      state.currentThreadRefreshPending = false;
      requestCurrentThreadRefresh(Object.assign({}, options, { delayMs: 180 }));
    }
  }
}

function requestCurrentThreadRefresh(options = {}) {
  if (!state.currentThreadId || !["single", "tasks"].includes(state.viewMode)) return;
  window.clearTimeout(state.currentThreadRefreshTimer);
  const delayMs = Math.max(0, Number(options.delayMs || 120));
  state.currentThreadRefreshTimer = window.setTimeout(() => {
    state.currentThreadRefreshTimer = 0;
    refreshCurrentThreadFromServer(options).catch(() => {});
  }, delayMs);
}

function appendDelta(threadId, messageId, delta, payload = {}) {
  if (!state.currentThread || state.currentThread.id !== threadId) return;
  const message = (state.currentThread.messages || []).find((item) => item.id === messageId);
  if (!message) return;
  const updatedAt = payload.updatedAt || new Date().toISOString();
  message.content = appendStreamingMessageBounded(message.content || "", delta || "");
  if (!message.firstFeedbackAt) message.firstFeedbackAt = payload.firstFeedbackAt || updatedAt;
  message.updatedAt = updatedAt;
  if (!scheduleStreamingMessageRender(message)) scheduleRenderCurrentThread();
}

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
    const summaryHasRunningState = summaryHasActiveRun(payload.thread);
    const wasRunning = currentThreadHasPendingMessages(state.currentThread) || summaryHasRunningState;
    const terminalSummaryRefresh = wasRunning && !summaryHasRunningState;
    const shouldRefreshForSummary = shouldRefreshCurrentThreadForSummary(payload.thread);
    state.currentThread = mergeCurrentThread(payload.thread);
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
    scheduleTopicRootListRefresh(120);
    if (
      payload.message.role === "assistant"
      && ["done", "failed", "cancelled"].includes(String(payload.message.status || ""))
    ) {
      requestCurrentThreadRefresh({ stickToBottom: true, delayMs: 260 });
    }
    if (payload.thread) {
      state.currentThread.status = payload.thread.status;
      state.currentThread.activeRunId = payload.thread.activeRunId;
      state.currentThread.activeRunIds = payload.thread.activeRunIds || [];
      state.currentThread.updatedAt = payload.thread.updatedAt;
    }
  }
}
