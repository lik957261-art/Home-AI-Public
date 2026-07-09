const CHAT_COMPOSER_EVENTS_MODEL_VERSION = "20260704-vite-chat-composer-events-model-v1";

function cleanString(value, max = 240) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 240));
}

function composerEventTypePlan(payload = {}) {
  const type = cleanString(payload?.type, 160);
  return Object.freeze({
    version: CHAT_COMPOSER_EVENTS_MODEL_VERSION,
    valid: Boolean(payload && type),
    type,
    clientVersion: cleanString(payload?.clientVersion, 160),
    clientVersionOnly: type === "client.version",
    ignored: type === "learning-coins.updated",
  });
}

function todosUpdatedEventPlan(input = {}) {
  return Object.freeze({
    version: CHAT_COMPOSER_EVENTS_MODEL_VERSION,
    shouldLoadTodos: Boolean(
      input.type === "todos.updated"
      && input.viewMode === "todos"
      && (!input.workspaceId || input.workspaceId === input.selectedWorkspaceId)
    ),
  });
}

function currentThreadUpdatedEventPlan(input = {}) {
  const applies = Boolean(input.type === "thread.updated" && input.currentThreadId && input.threadId === input.currentThreadId);
  if (!applies) {
    return Object.freeze({
      version: CHAT_COMPOSER_EVENTS_MODEL_VERSION,
      applies: false,
      wasRunning: false,
      terminalSummaryRefresh: false,
      refreshRequest: null,
      outcome: "",
    });
  }
  const summaryHasRunningState = Boolean(input.summaryHasRunningState);
  const wasRunning = Boolean(input.currentThreadHasPendingMessages || summaryHasRunningState);
  const terminalSummaryRefresh = Boolean(wasRunning && !summaryHasRunningState);
  const shouldRefreshForSummary = Boolean(input.shouldRefreshForSummary);
  const stickToBottom = Boolean(
    terminalSummaryRefresh
    && (
      input.currentTaskGroupId
      || (input.viewMode === "single" && input.singleWindowMode === "chat")
    )
  );
  const topicRootUnchanged = Boolean(
    input.beforeTaskRootSignature
    && input.beforeTaskRootSignature === input.afterTaskRootSignature
    && input.topicRootPresent
  );
  let outcome = "render_current_thread";
  if (wasRunning) outcome = "active_run_state";
  else if (topicRootUnchanged) outcome = "preserve_topic_root";
  return Object.freeze({
    version: CHAT_COMPOSER_EVENTS_MODEL_VERSION,
    applies: true,
    wasRunning,
    terminalSummaryRefresh,
    shouldRefreshForSummary,
    topicRootUnchanged,
    refreshRequest: shouldRefreshForSummary || terminalSummaryRefresh
      ? Object.freeze({
        stickToBottom,
        delayMs: terminalSummaryRefresh ? 180 : 120,
      })
      : null,
    outcome,
  });
}

function currentTaskEventPlan(input = {}) {
  const applies = Boolean(
    (input.type === "task.deleted" || input.type === "task.renamed")
    && input.currentThreadId
    && input.threadId === input.currentThreadId
  );
  return Object.freeze({
    version: CHAT_COMPOSER_EVENTS_MODEL_VERSION,
    applies,
    action: applies ? input.type.replace(".", "_") : "",
    clearCurrentTaskGroupId: Boolean(applies && input.type === "task.deleted" && input.currentTaskGroupId === input.taskGroupId),
    stickToBottom: input.type === "task.deleted",
  });
}

function currentMessageEventPlan(input = {}) {
  const hasMessage = Boolean(input.hasMessage);
  const currentThreadMatch = Boolean(input.currentThreadId && input.threadId === input.currentThreadId);
  return Object.freeze({
    version: CHAT_COMPOSER_EVENTS_MODEL_VERSION,
    shouldUpsertCachedChatScopeMessage: hasMessage,
    shouldUpsertCurrentMessage: hasMessage && currentThreadMatch,
    shouldApplyThreadSummary: Boolean(hasMessage && currentThreadMatch && input.hasThread),
    shouldMergeTaskListThread: hasMessage && currentThreadMatch,
    shouldScheduleTopicRootRefresh: hasMessage && currentThreadMatch,
  });
}

export {
  CHAT_COMPOSER_EVENTS_MODEL_VERSION,
  composerEventTypePlan,
  currentMessageEventPlan,
  currentTaskEventPlan,
  currentThreadUpdatedEventPlan,
  todosUpdatedEventPlan,
};
