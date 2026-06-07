"use strict";

function cleanString(value) {
  return String(value || "").trim();
}

function createGatewayRunStreamCompletionService(options = {}) {
  const activeStreamForRun = typeof options.activeStreamForRun === "function"
    ? options.activeStreamForRun
    : (() => null);
  const handleStreamClosedWithoutTerminal = typeof options.handleStreamClosedWithoutTerminal === "function"
    ? options.handleStreamClosedWithoutTerminal
    : (() => ({ action: "closed_without_terminal_unhandled" }));
  const markRunCancelled = typeof options.markRunCancelled === "function"
    ? options.markRunCancelled
    : (() => {});
  const markRunFailed = typeof options.markRunFailed === "function"
    ? options.markRunFailed
    : (() => {});

  function handleStreamCompletion(publicRunId, threadId, messageId, controller) {
    const stream = activeStreamForRun(publicRunId);
    const visibleRunId = cleanString(stream?.realRunId || publicRunId);
    if (controller?.signal?.aborted && stream?.failureReason) {
      const failure = new Error(stream.failureReason);
      markRunFailed(threadId, messageId, visibleRunId, failure);
      return { action: "failed_after_abort_reason", runId: visibleRunId, error: failure };
    }
    if (controller?.signal?.aborted) {
      markRunCancelled(threadId, messageId, visibleRunId);
      return { action: "cancelled_after_abort", runId: visibleRunId };
    }
    if (stream?.terminalEventSeen) {
      return { action: "terminal_event_seen", runId: visibleRunId };
    }
    return handleStreamClosedWithoutTerminal(publicRunId, threadId, messageId);
  }

  return Object.freeze({
    handleStreamCompletion,
  });
}

module.exports = {
  createGatewayRunStreamCompletionService,
};
