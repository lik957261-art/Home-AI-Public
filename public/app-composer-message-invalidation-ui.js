"use strict";

function composerMessageTerminalStatus(message = {}) {
  return ["done", "failed", "cancelled"].includes(String(message?.status || ""));
}

function composerMessageActiveStatus(message = {}) {
  return ["queued", "running"].includes(String(message?.status || ""));
}

function requestComposerTerminalReceiptRefresh(message = {}, options = {}) {
  if (!composerMessageTerminalStatus(message)) return false;
  if (typeof requestCurrentThreadRefresh !== "function") return false;
  const stickToBottom = composerTerminalReceiptStickToBottom();
  if (
    stickToBottom
    && typeof conversationUserScrollProtectActive === "function"
    && conversationUserScrollProtectActive()
    && typeof composerSelfCheckReportProtectedScrollBypass === "function"
  ) {
    composerSelfCheckReportProtectedScrollBypass("terminal_receipt_refresh");
  }
  requestCurrentThreadRefresh({
    stickToBottom,
    delayMs: Number.isFinite(Number(options.delayMs)) ? Math.max(0, Number(options.delayMs)) : 0,
  });
  if (typeof scheduleComposerTerminalSelfCheck === "function") {
    scheduleComposerTerminalSelfCheck(message);
  }
  return true;
}

function invalidateComposerMessageProjection(message = {}, options = {}) {
  const existingIndex = Number(options.existingIndex);
  const existingVisibleMessage = Number.isFinite(existingIndex) && existingIndex >= 0;
  const assistantMessage = message?.role === "assistant";
  const terminalMessage = composerMessageTerminalStatus(message);
  if (
    existingVisibleMessage
    && assistantMessage
    && typeof scheduleStreamingMessageRender === "function"
    && scheduleStreamingMessageRender(message)
  ) {
    if (composerMessageActiveStatus(message) && typeof scheduleRunProgressRenderForRun === "function") {
      scheduleRunProgressRenderForRun(message.runId || state.currentThread?.activeRunId || "");
    }
    if (terminalMessage) requestComposerTerminalReceiptRefresh(message, options);
    return "patched";
  }
  if (typeof scheduleRenderCurrentThread === "function") scheduleRenderCurrentThread();
  if (terminalMessage) requestComposerTerminalReceiptRefresh(message, options);
  return "scheduled";
}
