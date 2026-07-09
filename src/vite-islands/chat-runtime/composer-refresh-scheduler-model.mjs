export const CHAT_COMPOSER_REFRESH_SCHEDULER_MODEL_VERSION = "20260704.composer-refresh-scheduler.v1";

export function composerRefreshDelayMsPlan(input = {}) {
  const options = input.options || {};
  const fallbackDelayMs = Number.isFinite(Number(input.fallbackDelayMs)) ? Number(input.fallbackDelayMs) : 120;
  const hasDelay = Object.prototype.hasOwnProperty.call(options || {}, "delayMs");
  const value = Number(hasDelay ? options.delayMs : fallbackDelayMs);
  return Object.freeze({
    version: CHAT_COMPOSER_REFRESH_SCHEDULER_MODEL_VERSION,
    delayMs: Math.max(0, Number.isFinite(value) ? value : fallbackDelayMs),
  });
}

export function composerRefreshTimerDueAtPlan(input = {}) {
  const now = Number(input.nowMs);
  const base = Number.isFinite(now) ? now : 0;
  return Object.freeze({
    version: CHAT_COMPOSER_REFRESH_SCHEDULER_MODEL_VERSION,
    dueAt: base + composerRefreshDelayMsPlan({ options: input.options }).delayMs,
  });
}

export function composerKeepScheduledRefreshPlan(input = {}) {
  const state = input.state || {};
  const dueAt = Number(input.dueAt || 0) || 0;
  const existingDueAt = Number(state.currentThreadRefreshDueAt || 0) || 0;
  return Object.freeze({
    version: CHAT_COMPOSER_REFRESH_SCHEDULER_MODEL_VERSION,
    keep: Boolean(state.currentThreadRefreshTimer && existingDueAt && existingDueAt <= dueAt),
  });
}

export function composerKeepPendingRefreshPlan(input = {}) {
  const state = input.state || {};
  const keep = Boolean(
    state.currentThreadRefreshPending
      && state.currentThreadRefreshPendingOptions
      && composerRefreshDelayMsPlan({ options: state.currentThreadRefreshPendingOptions }).delayMs
        <= composerRefreshDelayMsPlan({ options: input.options }).delayMs,
  );
  return Object.freeze({
    version: CHAT_COMPOSER_REFRESH_SCHEDULER_MODEL_VERSION,
    keep,
  });
}

export function composerPendingRefreshDelayPlan(input = {}) {
  const limit = Number(input.maxDelayMs);
  const boundedLimit = Number.isFinite(limit) ? Math.max(0, limit) : 180;
  return Object.freeze({
    version: CHAT_COMPOSER_REFRESH_SCHEDULER_MODEL_VERSION,
    delayMs: Math.min(composerRefreshDelayMsPlan({ options: input.options }).delayMs, boundedLimit),
  });
}
