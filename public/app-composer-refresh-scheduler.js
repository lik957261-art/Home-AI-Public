"use strict";

(function registerComposerRefreshScheduler(global) {
  function refreshDelayMs(options = {}) {
    const hasDelay = Object.prototype.hasOwnProperty.call(options || {}, "delayMs");
    const value = Number(hasDelay ? options.delayMs : 120);
    return Math.max(0, Number.isFinite(value) ? value : 120);
  }

  function timerDueAt(nowMs, options = {}) {
    const now = Number(nowMs);
    const base = Number.isFinite(now) ? now : 0;
    return base + refreshDelayMs(options);
  }

  function shouldKeepScheduledRefresh(state = {}, dueAt = 0) {
    const existingDueAt = Number(state.currentThreadRefreshDueAt || 0) || 0;
    return Boolean(state.currentThreadRefreshTimer && existingDueAt && existingDueAt <= dueAt);
  }

  function shouldKeepPendingRefresh(state = {}, options = {}) {
    if (!state.currentThreadRefreshPending || !state.currentThreadRefreshPendingOptions) return false;
    return refreshDelayMs(state.currentThreadRefreshPendingOptions) <= refreshDelayMs(options);
  }

  function pendingDelayMs(options = {}, maxDelayMs = 180) {
    const limit = Number(maxDelayMs);
    const boundedLimit = Number.isFinite(limit) ? Math.max(0, limit) : 180;
    return Math.min(refreshDelayMs(options), boundedLimit);
  }

  global.ComposerRefreshScheduler = Object.freeze({
    refreshDelayMs,
    timerDueAt,
    shouldKeepScheduledRefresh,
    shouldKeepPendingRefresh,
    pendingDelayMs,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
