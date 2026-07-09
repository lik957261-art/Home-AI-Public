"use strict";

const CHAT_COMPOSER_MESSAGE_INVALIDATION_MODEL_ESM_PATH = "/vite-islands/chat-composer-message-invalidation-model/chat-composer-message-invalidation-model.js";
let chatComposerMessageInvalidationModel = null;
let chatComposerMessageInvalidationModelPromise = null;

function importChatComposerMessageInvalidationModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (chatComposerMessageInvalidationModel) return Promise.resolve(chatComposerMessageInvalidationModel);
  if (!chatComposerMessageInvalidationModelPromise) {
    const importer = typeof rootRef.__homeAiImportChatComposerMessageInvalidationModel === "function"
      ? rootRef.__homeAiImportChatComposerMessageInvalidationModel
      : (path) => import(path);
    chatComposerMessageInvalidationModelPromise = Promise.resolve()
      .then(() => importer(CHAT_COMPOSER_MESSAGE_INVALIDATION_MODEL_ESM_PATH))
      .then((model) => {
        chatComposerMessageInvalidationModel = model || null;
        return chatComposerMessageInvalidationModel;
      })
      .catch((error) => {
        chatComposerMessageInvalidationModelPromise = null;
        throw error;
      });
  }
  return chatComposerMessageInvalidationModelPromise;
}

function currentChatComposerMessageInvalidationModel() {
  return chatComposerMessageInvalidationModel;
}

if (typeof window !== "undefined") {
  importChatComposerMessageInvalidationModel().catch(() => null);
}

function composerMessageTerminalStatus(message = {}) {
  const model = currentChatComposerMessageInvalidationModel();
  if (typeof model?.composerMessageTerminalStatusPlan === "function") {
    return Boolean(model.composerMessageTerminalStatusPlan(message));
  }
  return ["done", "failed", "cancelled"].includes(String(message?.status || ""));
}

function composerMessageActiveStatus(message = {}) {
  const model = currentChatComposerMessageInvalidationModel();
  if (typeof model?.composerMessageActiveStatusPlan === "function") {
    return Boolean(model.composerMessageActiveStatusPlan(message));
  }
  return ["queued", "running"].includes(String(message?.status || ""));
}

function requestComposerTerminalReceiptRefresh(message = {}, options = {}) {
  const terminal = composerMessageTerminalStatus(message);
  const hasRefreshFunction = typeof requestCurrentThreadRefresh === "function";
  if (!terminal || !hasRefreshFunction) return false;
  const stickToBottom = composerTerminalReceiptStickToBottom();
  const userScrollProtected = typeof conversationUserScrollProtectActive === "function"
    && conversationUserScrollProtectActive();
  const hasProtectedScrollReporter = typeof composerSelfCheckReportProtectedScrollBypass === "function";
  const hasSelfCheckScheduler = typeof scheduleComposerTerminalSelfCheck === "function";
  const model = currentChatComposerMessageInvalidationModel();
  const plan = typeof model?.composerTerminalReceiptRefreshPlan === "function"
    ? model.composerTerminalReceiptRefreshPlan({
      terminal,
      hasRefreshFunction,
      stickToBottom,
      userScrollProtected,
      hasProtectedScrollReporter,
      hasSelfCheckScheduler,
      delayMs: options.delayMs,
    })
    : {
      shouldRefresh: terminal && hasRefreshFunction,
      refreshOptions: {
        stickToBottom,
        delayMs: Number.isFinite(Number(options.delayMs)) ? Math.max(0, Number(options.delayMs)) : 0,
      },
      shouldReportProtectedScrollBypass: Boolean(stickToBottom && userScrollProtected && hasProtectedScrollReporter),
      shouldScheduleSelfCheck: hasSelfCheckScheduler,
    };
  if (!plan.shouldRefresh || !plan.refreshOptions) return false;
  if (plan.shouldReportProtectedScrollBypass) {
    composerSelfCheckReportProtectedScrollBypass("terminal_receipt_refresh");
  }
  requestCurrentThreadRefresh(plan.refreshOptions);
  if (plan.shouldScheduleSelfCheck) {
    scheduleComposerTerminalSelfCheck(message);
  }
  return true;
}

function invalidateComposerMessageProjection(message = {}, options = {}) {
  const existingIndex = Number(options.existingIndex);
  const existingVisibleMessage = Number.isFinite(existingIndex) && existingIndex >= 0;
  const assistantMessage = message?.role === "assistant";
  const terminalMessage = composerMessageTerminalStatus(message);
  const activeMessage = composerMessageActiveStatus(message);
  let streamRendered = false;
  if (
    existingVisibleMessage
    && assistantMessage
    && typeof scheduleStreamingMessageRender === "function"
    && scheduleStreamingMessageRender(message)
  ) {
    streamRendered = true;
  }
  const model = currentChatComposerMessageInvalidationModel();
  const plan = typeof model?.composerMessageProjectionPlan === "function"
    ? model.composerMessageProjectionPlan({
      existingIndex,
      messageRole: message?.role || "",
      terminal: terminalMessage,
      active: activeMessage,
      streamRendered,
      runId: message.runId || "",
      fallbackRunId: state.currentThread?.activeRunId || "",
    })
    : {
      result: streamRendered ? "patched" : "scheduled",
      shouldScheduleFullRender: !streamRendered,
      shouldRequestTerminalReceiptRefresh: terminalMessage,
      shouldScheduleRunProgress: streamRendered && activeMessage,
      runProgressRunId: message.runId || state.currentThread?.activeRunId || "",
    };
  if (plan.shouldScheduleRunProgress && typeof scheduleRunProgressRenderForRun === "function") {
    scheduleRunProgressRenderForRun(plan.runProgressRunId || "");
  }
  if (plan.shouldScheduleFullRender && typeof scheduleRenderCurrentThread === "function") {
    scheduleRenderCurrentThread();
  }
  if (plan.shouldRequestTerminalReceiptRefresh) requestComposerTerminalReceiptRefresh(message, options);
  return plan.result || (streamRendered ? "patched" : "scheduled");
}
