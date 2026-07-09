"use strict";

(function registerComposerRefreshScheduler(global) {
  const CHAT_COMPOSER_REFRESH_SCHEDULER_MODEL_ESM_PATH = "/vite-islands/chat-composer-refresh-scheduler-model/chat-composer-refresh-scheduler-model.js";
  let chatComposerRefreshSchedulerModel = null;
  let chatComposerRefreshSchedulerModelPromise = null;

  function importChatComposerRefreshSchedulerModel(rootRef = global) {
    if (chatComposerRefreshSchedulerModel) return Promise.resolve(chatComposerRefreshSchedulerModel);
    if (!chatComposerRefreshSchedulerModelPromise) {
      const importer = typeof rootRef.__homeAiImportChatComposerRefreshSchedulerModel === "function"
        ? rootRef.__homeAiImportChatComposerRefreshSchedulerModel
        : (path) => import(path);
      chatComposerRefreshSchedulerModelPromise = Promise.resolve()
        .then(() => importer(CHAT_COMPOSER_REFRESH_SCHEDULER_MODEL_ESM_PATH))
        .then((model) => {
          chatComposerRefreshSchedulerModel = model || null;
          return chatComposerRefreshSchedulerModel;
        })
        .catch((error) => {
          chatComposerRefreshSchedulerModelPromise = null;
          throw error;
        });
    }
    return chatComposerRefreshSchedulerModelPromise;
  }

  function currentChatComposerRefreshSchedulerModel() {
    return chatComposerRefreshSchedulerModel;
  }

  importChatComposerRefreshSchedulerModel().catch(() => null);

  function refreshDelayMs(options = {}) {
    const model = currentChatComposerRefreshSchedulerModel();
    if (typeof model?.composerRefreshDelayMsPlan === "function") {
      return model.composerRefreshDelayMsPlan({ options }).delayMs;
    }
    const hasDelay = Object.prototype.hasOwnProperty.call(options || {}, "delayMs");
    const value = Number(hasDelay ? options.delayMs : 120);
    return Math.max(0, Number.isFinite(value) ? value : 120);
  }

  function timerDueAt(nowMs, options = {}) {
    const model = currentChatComposerRefreshSchedulerModel();
    if (typeof model?.composerRefreshTimerDueAtPlan === "function") {
      return model.composerRefreshTimerDueAtPlan({ nowMs, options }).dueAt;
    }
    const now = Number(nowMs);
    const base = Number.isFinite(now) ? now : 0;
    return base + refreshDelayMs(options);
  }

  function shouldKeepScheduledRefresh(state = {}, dueAt = 0) {
    const model = currentChatComposerRefreshSchedulerModel();
    if (typeof model?.composerKeepScheduledRefreshPlan === "function") {
      return Boolean(model.composerKeepScheduledRefreshPlan({ state, dueAt }).keep);
    }
    const existingDueAt = Number(state.currentThreadRefreshDueAt || 0) || 0;
    return Boolean(state.currentThreadRefreshTimer && existingDueAt && existingDueAt <= dueAt);
  }

  function shouldKeepPendingRefresh(state = {}, options = {}) {
    const model = currentChatComposerRefreshSchedulerModel();
    if (typeof model?.composerKeepPendingRefreshPlan === "function") {
      return Boolean(model.composerKeepPendingRefreshPlan({ state, options }).keep);
    }
    if (!state.currentThreadRefreshPending || !state.currentThreadRefreshPendingOptions) return false;
    return refreshDelayMs(state.currentThreadRefreshPendingOptions) <= refreshDelayMs(options);
  }

  function pendingDelayMs(options = {}, maxDelayMs = 180) {
    const model = currentChatComposerRefreshSchedulerModel();
    if (typeof model?.composerPendingRefreshDelayPlan === "function") {
      return model.composerPendingRefreshDelayPlan({ options, maxDelayMs }).delayMs;
    }
    const limit = Number(maxDelayMs);
    const boundedLimit = Number.isFinite(limit) ? Math.max(0, limit) : 180;
    return Math.min(refreshDelayMs(options), boundedLimit);
  }

  global.ComposerRefreshScheduler = Object.freeze({
    importChatComposerRefreshSchedulerModel,
    currentChatComposerRefreshSchedulerModel,
    refreshDelayMs,
    timerDueAt,
    shouldKeepScheduledRefresh,
    shouldKeepPendingRefresh,
    pendingDelayMs,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
