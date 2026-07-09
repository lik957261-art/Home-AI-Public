"use strict";

const CHAT_COMPOSER_EVENTS_MODEL_ESM_PATH = "/vite-islands/chat-composer-events-model/chat-composer-events-model.js";
let chatComposerEventsModel = null;
let chatComposerEventsModelPromise = null;

function importChatComposerEventsModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (chatComposerEventsModel) return Promise.resolve(chatComposerEventsModel);
  if (!chatComposerEventsModelPromise) {
    const importer = typeof rootRef.__homeAiImportChatComposerEventsModel === "function"
      ? rootRef.__homeAiImportChatComposerEventsModel
      : (path) => import(path);
    chatComposerEventsModelPromise = Promise.resolve()
      .then(() => importer(CHAT_COMPOSER_EVENTS_MODEL_ESM_PATH))
      .then((model) => {
        chatComposerEventsModel = model || null;
        return chatComposerEventsModel;
      })
      .catch((error) => {
        chatComposerEventsModelPromise = null;
        throw error;
      });
  }
  return chatComposerEventsModelPromise;
}

function currentChatComposerEventsModel() {
  return chatComposerEventsModel;
}

if (typeof window !== "undefined") {
  importChatComposerEventsModel().catch(() => null);
}

function applyEvent(payload) {
  const model = currentChatComposerEventsModel();
  const typePlan = typeof model?.composerEventTypePlan === "function"
    ? model.composerEventTypePlan(payload)
    : {
      valid: Boolean(payload && payload.type),
      type: payload?.type || "",
      clientVersion: payload?.clientVersion || "",
      clientVersionOnly: payload?.type === "client.version",
      ignored: payload?.type === "learning-coins.updated",
    };
  if (!typePlan.valid) return;
  if (typePlan.clientVersion) handleClientVersion(typePlan.clientVersion, typePlan.type);
  if (typePlan.clientVersionOnly) return;
  if (typePlan.type === "todos.updated") {
    const todosPlan = typeof model?.todosUpdatedEventPlan === "function"
      ? model.todosUpdatedEventPlan({
        type: typePlan.type,
        workspaceId: payload.workspaceId,
        selectedWorkspaceId: state.selectedWorkspaceId,
        viewMode: state.viewMode,
      })
      : {
        shouldLoadTodos: state.viewMode === "todos" && (!payload.workspaceId || payload.workspaceId === state.selectedWorkspaceId),
      };
    if (todosPlan.shouldLoadTodos) {
      loadTodos().catch(showError);
    }
    return;
  }
  if (typePlan.ignored) return;
  if (typePlan.type === "snapshot") {
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
  const threadUpdatePlan = typeof model?.currentThreadUpdatedEventPlan === "function"
    ? model.currentThreadUpdatedEventPlan({
      type: typePlan.type,
      threadId: payload.thread?.id,
      currentThreadId: state.currentThread?.id,
      summaryHasRunningState: payload.thread ? summaryHasActiveRun(payload.thread) : false,
      currentThreadHasPendingMessages: state.currentThread ? currentThreadHasPendingMessages(state.currentThread) : false,
      shouldRefreshForSummary: payload.thread ? shouldRefreshCurrentThreadForSummary(payload.thread) : false,
      currentTaskGroupId: state.currentTaskGroupId,
      viewMode: state.viewMode,
      singleWindowMode: state.singleWindowMode,
    })
    : null;
  if (threadUpdatePlan?.applies || (typePlan.type === "thread.updated" && state.currentThread && payload.thread?.id === state.currentThread.id)) {
    const beforeTaskRootSignature = isCurrentTopicRootListView() && typeof taskListRootRenderSignature === "function"
      ? taskListRootRenderSignature(state.currentThread)
      : "";
    const beforeTaskRootScrollTop = beforeTaskRootSignature ? ($("conversation")?.scrollTop || 0) : 0;
    const summaryHasRunningState = summaryHasActiveRun(payload.thread);
    const wasRunning = threadUpdatePlan ? threadUpdatePlan.wasRunning : currentThreadHasPendingMessages(state.currentThread) || summaryHasRunningState;
    const terminalSummaryRefresh = threadUpdatePlan ? threadUpdatePlan.terminalSummaryRefresh : wasRunning && !summaryHasRunningState;
    const shouldRefreshForSummary = threadUpdatePlan ? threadUpdatePlan.shouldRefreshForSummary : shouldRefreshCurrentThreadForSummary(payload.thread);
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
    const threadUpdateRenderPlan = typeof model?.currentThreadUpdatedEventPlan === "function"
      ? model.currentThreadUpdatedEventPlan({
        type: typePlan.type,
        threadId: payload.thread?.id,
        currentThreadId: state.currentThread?.id,
        summaryHasRunningState,
        currentThreadHasPendingMessages: wasRunning && !summaryHasRunningState,
        shouldRefreshForSummary,
        currentTaskGroupId: state.currentTaskGroupId,
        viewMode: state.viewMode,
        singleWindowMode: state.singleWindowMode,
        beforeTaskRootSignature,
        afterTaskRootSignature,
        topicRootPresent: topicRootUnchanged,
      })
      : null;
    const refreshRequest = threadUpdatePlan?.refreshRequest || (
      shouldRefreshForSummary || terminalSummaryRefresh
        ? {
          stickToBottom: terminalSummaryRefresh && (Boolean(state.currentTaskGroupId) || (state.viewMode === "single" && state.singleWindowMode === "chat")),
          delayMs: terminalSummaryRefresh ? 180 : 120,
        }
        : null
    );
    if (refreshRequest) {
      requestCurrentThreadRefresh(refreshRequest);
    }
    const threadUpdateOutcome = threadUpdateRenderPlan?.outcome || (wasRunning ? "active_run_state" : (topicRootUnchanged ? "preserve_topic_root" : "render_current_thread"));
    if (threadUpdateOutcome === "active_run_state") {
      updateComposerAction();
      renderComposerContext();
      scheduleTopicRootListRefresh(120);
      return;
    }
    if (threadUpdateOutcome === "preserve_topic_root") {
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
  if (typePlan.type === "message.delta") {
    appendDelta(payload.threadId, payload.messageId, payload.delta || "", payload);
    return;
  }
  if (typePlan.type === "run.event") {
    appendRunEventToCurrentThread(payload);
    return;
  }
  const taskPlan = typeof model?.currentTaskEventPlan === "function"
    ? model.currentTaskEventPlan({
      type: typePlan.type,
      threadId: payload.threadId,
      currentThreadId: state.currentThread?.id,
      taskGroupId: payload.taskGroupId,
      currentTaskGroupId: state.currentTaskGroupId,
    })
    : null;
  if ((taskPlan?.applies && taskPlan.action === "task_deleted") || (typePlan.type === "task.deleted" && state.currentThread && payload.threadId === state.currentThread.id)) {
    state.currentThread = payload.thread || state.currentThread;
    if (taskPlan ? taskPlan.clearCurrentTaskGroupId : state.currentTaskGroupId === payload.taskGroupId) state.currentTaskGroupId = "";
    renderThreads();
    renderCurrentThread({ stickToBottom: true });
    return;
  }
  if ((taskPlan?.applies && taskPlan.action === "task_renamed") || (typePlan.type === "task.renamed" && state.currentThread && payload.threadId === state.currentThread.id)) {
    state.currentThread = payload.thread || state.currentThread;
    renderThreads();
    renderCurrentThread({ stickToBottom: false });
    return;
  }
  const messagePlan = typeof model?.currentMessageEventPlan === "function"
    ? model.currentMessageEventPlan({
      hasMessage: Boolean(payload.message),
      hasThread: Boolean(payload.thread),
      threadId: payload.threadId,
      currentThreadId: state.currentThread?.id,
    })
    : {
      shouldUpsertCachedChatScopeMessage: Boolean(payload.message),
      shouldUpsertCurrentMessage: Boolean(payload.message && state.currentThread && payload.threadId === state.currentThread.id),
      shouldApplyThreadSummary: Boolean(payload.message && state.currentThread && payload.threadId === state.currentThread.id && payload.thread),
      shouldMergeTaskListThread: Boolean(payload.message && state.currentThread && payload.threadId === state.currentThread.id),
      shouldScheduleTopicRootRefresh: Boolean(payload.message && state.currentThread && payload.threadId === state.currentThread.id),
    };
  if (messagePlan.shouldUpsertCachedChatScopeMessage) upsertCachedChatScopeMessage(payload.threadId, payload.message, payload.thread);
  if (messagePlan.shouldUpsertCurrentMessage) {
    upsertMessage(payload.message);
    if (messagePlan.shouldApplyThreadSummary) {
      state.currentThread.status = payload.thread.status;
      state.currentThread.activeRunId = payload.thread.activeRunId;
      state.currentThread.activeRunIds = payload.thread.activeRunIds || [];
      state.currentThread.updatedAt = payload.thread.updatedAt;
    }
    if (messagePlan.shouldMergeTaskListThread && typeof mergeTaskListThreadFromThreadUpdate === "function") {
      mergeTaskListThreadFromThreadUpdate(state.currentThread);
    }
    if (messagePlan.shouldScheduleTopicRootRefresh) scheduleTopicRootListRefresh(120);
  }
}
