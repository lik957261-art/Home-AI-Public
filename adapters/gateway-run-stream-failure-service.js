"use strict";

const { gatewayRunUserFacingError } = require("./gateway-run-error-message-service");

function cleanString(value) {
  return String(value || "").trim();
}

function createGatewayRunStreamFailureService(options = {}) {
  const activeStreamForRun = typeof options.activeStreamForRun === "function"
    ? options.activeStreamForRun
    : (() => null);
  const emitRunStreamEvent = typeof options.emitRunStreamEvent === "function"
    ? options.emitRunStreamEvent
    : (() => false);
  const markRunCancelled = typeof options.markRunCancelled === "function"
    ? options.markRunCancelled
    : (() => {});
  const markRunFailed = typeof options.markRunFailed === "function"
    ? options.markRunFailed
    : (() => {});

  function handleStreamFailure(publicRunId, threadId, messageId, controller, err) {
    const stream = activeStreamForRun(publicRunId);
    const visibleRunId = cleanString(stream?.realRunId || publicRunId);
    emitRunStreamEvent(publicRunId, "run.stream_failed", gatewayRunUserFacingError(err), {
      runId: visibleRunId,
      error: true,
    });
    if (controller?.signal?.aborted && stream?.failureReason) {
      const failure = new Error(stream.failureReason);
      markRunFailed(threadId, messageId, visibleRunId, failure);
      return { action: "failed_after_abort_reason", runId: visibleRunId, error: failure };
    }
    if (controller?.signal?.aborted) {
      if (stream?.userStopRequested) {
        markRunCancelled(threadId, messageId, visibleRunId);
        return { action: "cancelled_after_user_stop", runId: visibleRunId };
      }
      markRunFailed(threadId, messageId, visibleRunId, err);
      return { action: "failed_after_untracked_abort", runId: visibleRunId, error: err };
    }
    markRunFailed(threadId, messageId, visibleRunId, err);
    return { action: "failed", runId: visibleRunId, error: err };
  }

  return Object.freeze({
    handleStreamFailure,
  });
}

module.exports = {
  createGatewayRunStreamFailureService,
};
