export const CHAT_COMPOSER_MESSAGE_INVALIDATION_MODEL_VERSION = "20260704.composer-message-invalidation.v1";

const TERMINAL_MESSAGE_STATUSES = new Set(["done", "failed", "cancelled"]);
const ACTIVE_MESSAGE_STATUSES = new Set(["queued", "running"]);

function normalizedStatus(message = {}) {
  return String(message?.status || "").trim().toLowerCase();
}

function safeDelayMs(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

export function composerMessageTerminalStatusPlan(message = {}) {
  return TERMINAL_MESSAGE_STATUSES.has(normalizedStatus(message));
}

export function composerMessageActiveStatusPlan(message = {}) {
  return ACTIVE_MESSAGE_STATUSES.has(normalizedStatus(message));
}

export function composerTerminalReceiptRefreshPlan(input = {}) {
  const terminal = Boolean(input.terminal);
  const hasRefreshFunction = Boolean(input.hasRefreshFunction);
  const stickToBottom = Boolean(input.stickToBottom);
  const userScrollProtected = Boolean(input.userScrollProtected);
  const hasProtectedScrollReporter = Boolean(input.hasProtectedScrollReporter);
  const hasSelfCheckScheduler = Boolean(input.hasSelfCheckScheduler);
  if (!terminal || !hasRefreshFunction) {
    return {
      version: CHAT_COMPOSER_MESSAGE_INVALIDATION_MODEL_VERSION,
      shouldRefresh: false,
      refreshOptions: null,
      shouldReportProtectedScrollBypass: false,
      shouldScheduleSelfCheck: false,
    };
  }
  return {
    version: CHAT_COMPOSER_MESSAGE_INVALIDATION_MODEL_VERSION,
    shouldRefresh: true,
    refreshOptions: {
      stickToBottom,
      delayMs: safeDelayMs(input.delayMs),
    },
    shouldReportProtectedScrollBypass: Boolean(
      stickToBottom
      && userScrollProtected
      && hasProtectedScrollReporter
    ),
    shouldScheduleSelfCheck: hasSelfCheckScheduler,
  };
}

export function composerMessageProjectionPlan(input = {}) {
  const existingIndex = Number(input.existingIndex);
  const existingVisibleMessage = Number.isFinite(existingIndex) && existingIndex >= 0;
  const assistantMessage = input.messageRole === "assistant";
  const terminal = Boolean(input.terminal);
  const active = Boolean(input.active);
  const streamRendered = Boolean(input.streamRendered);
  const runProgressRunId = String(input.runId || input.fallbackRunId || "");
  if (existingVisibleMessage && assistantMessage && streamRendered) {
    return {
      version: CHAT_COMPOSER_MESSAGE_INVALIDATION_MODEL_VERSION,
      result: "patched",
      shouldScheduleFullRender: false,
      shouldRequestTerminalReceiptRefresh: terminal,
      shouldScheduleRunProgress: active,
      runProgressRunId,
    };
  }
  return {
    version: CHAT_COMPOSER_MESSAGE_INVALIDATION_MODEL_VERSION,
    result: "scheduled",
    shouldScheduleFullRender: true,
    shouldRequestTerminalReceiptRefresh: terminal,
    shouldScheduleRunProgress: false,
    runProgressRunId: "",
  };
}
