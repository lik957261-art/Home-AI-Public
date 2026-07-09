const CHAT_COMPOSER_CURRENT_THREAD_REFRESH_MODEL_VERSION = "20260704-vite-chat-composer-current-thread-refresh-model-v1";

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).replace(/\u00a0/g, " ").trim().slice(0, Math.max(1, Number(max) || 4000));
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function arrayFrom(value) {
  return Array.isArray(value) ? value : [];
}

function stateThreadId(state = {}) {
  return cleanString(state.currentThreadId || state.currentThread?.id || "", 160);
}

function currentThreadRouteSnapshotPlan(input = {}) {
  const state = input.state && typeof input.state === "object" ? input.state : {};
  return Object.freeze({
    version: CHAT_COMPOSER_CURRENT_THREAD_REFRESH_MODEL_VERSION,
    snapshot: Object.freeze({
      viewMode: cleanString(state.viewMode, 80),
      singleWindowMode: cleanString(state.singleWindowMode, 80),
      currentTaskGroupId: cleanString(state.currentTaskGroupId, 160),
      selectedWorkspaceId: cleanString(state.selectedWorkspaceId, 160),
      currentThreadId: stateThreadId(state),
      primaryNavigationSeq: finiteNumber(state.primaryNavigationSeq, 0),
    }),
  });
}

function currentThreadRouteMatchesPlan(input = {}) {
  const state = input.state && typeof input.state === "object" ? input.state : {};
  const snapshot = input.snapshot && typeof input.snapshot === "object" ? input.snapshot : null;
  if (!snapshot) {
    return Object.freeze({ version: CHAT_COMPOSER_CURRENT_THREAD_REFRESH_MODEL_VERSION, matches: true });
  }
  const currentThreadId = stateThreadId(state);
  const snapshotThreadId = cleanString(snapshot.currentThreadId, 160);
  const matches = (
    cleanString(state.viewMode, 80) === cleanString(snapshot.viewMode, 80)
    && cleanString(state.singleWindowMode, 80) === cleanString(snapshot.singleWindowMode, 80)
    && cleanString(state.currentTaskGroupId, 160) === cleanString(snapshot.currentTaskGroupId, 160)
    && cleanString(state.selectedWorkspaceId, 160) === cleanString(snapshot.selectedWorkspaceId, 160)
    && finiteNumber(state.primaryNavigationSeq, 0) === finiteNumber(snapshot.primaryNavigationSeq, 0)
    && (!snapshotThreadId || !currentThreadId || currentThreadId === snapshotThreadId)
  );
  return Object.freeze({
    version: CHAT_COMPOSER_CURRENT_THREAD_REFRESH_MODEL_VERSION,
    matches,
  });
}

function currentThreadHasPendingMessagesPlan(input = {}) {
  const thread = input.thread && typeof input.thread === "object" ? input.thread : null;
  const activeRunIds = arrayFrom(input.activeRunIds).filter(Boolean);
  const hasActiveAssistantMessage = thread
    ? arrayFrom(thread.messages).some((message) => (
      message?.role === "assistant"
      && (message.status === "queued" || message.status === "running")
    ))
    : false;
  return Object.freeze({
    version: CHAT_COMPOSER_CURRENT_THREAD_REFRESH_MODEL_VERSION,
    hasPendingMessages: Boolean(thread && (activeRunIds.length || hasActiveAssistantMessage)),
  });
}

function summaryHasActiveRunPlan(input = {}) {
  const summary = input.summary && typeof input.summary === "object" ? input.summary : null;
  return Object.freeze({
    version: CHAT_COMPOSER_CURRENT_THREAD_REFRESH_MODEL_VERSION,
    hasActiveRun: Boolean(
      (Array.isArray(summary?.activeRunIds) && summary.activeRunIds.length)
      || summary?.activeRunId
      || summary?.status === "queued"
      || summary?.status === "running"
    ),
  });
}

function shouldRefreshCurrentThreadForSummaryPlan(input = {}) {
  const summary = input.summary && typeof input.summary === "object" ? input.summary : null;
  const currentThread = input.currentThread && typeof input.currentThread === "object" ? input.currentThread : null;
  if (!summary || !currentThread || summary.id !== currentThread.id) {
    return Object.freeze({
      version: CHAT_COMPOSER_CURRENT_THREAD_REFRESH_MODEL_VERSION,
      shouldRefresh: false,
    });
  }
  const summaryUpdated = cleanString(summary.updatedAt, 80);
  const currentUpdated = cleanString(currentThread.updatedAt, 80);
  const summaryNewer = Boolean(summaryUpdated && currentUpdated && summaryUpdated > currentUpdated);
  const shouldRefresh = summaryNewer || (Boolean(input.currentThreadHasPendingMessages) && !summaryHasActiveRunPlan({ summary }).hasActiveRun);
  return Object.freeze({
    version: CHAT_COMPOSER_CURRENT_THREAD_REFRESH_MODEL_VERSION,
    shouldRefresh,
  });
}

function currentThreadRefreshDelayPlan(input = {}) {
  const options = input.options && typeof input.options === "object" ? input.options : {};
  const hasDelay = Object.prototype.hasOwnProperty.call(options, "delayMs");
  const fallbackDelayMs = finiteNumber(input.fallbackDelayMs, 120);
  const value = finiteNumber(hasDelay ? options.delayMs : fallbackDelayMs, fallbackDelayMs);
  return Object.freeze({
    version: CHAT_COMPOSER_CURRENT_THREAD_REFRESH_MODEL_VERSION,
    delayMs: Math.max(0, value),
  });
}

function currentThreadRefreshDueAtPlan(input = {}) {
  const nowMs = finiteNumber(input.nowMs, 0);
  const delayMs = currentThreadRefreshDelayPlan({ options: input.options, fallbackDelayMs: input.fallbackDelayMs }).delayMs;
  return Object.freeze({
    version: CHAT_COMPOSER_CURRENT_THREAD_REFRESH_MODEL_VERSION,
    dueAt: nowMs + delayMs,
    delayMs,
  });
}

export {
  CHAT_COMPOSER_CURRENT_THREAD_REFRESH_MODEL_VERSION,
  currentThreadHasPendingMessagesPlan,
  currentThreadRefreshDelayPlan,
  currentThreadRefreshDueAtPlan,
  currentThreadRouteMatchesPlan,
  currentThreadRouteSnapshotPlan,
  shouldRefreshCurrentThreadForSummaryPlan,
  summaryHasActiveRunPlan,
};
