"use strict";

const { modelStreamEventPreview } = require("./gateway-run-stream-event-service");

function cleanString(value) {
  return String(value || "").trim();
}

function createGatewayRunStreamCloseRecoveryService(options = {}) {
  const activeStreamForRun = typeof options.activeStreamForRun === "function"
    ? options.activeStreamForRun
    : (() => null);
  const emitRunStreamEvent = typeof options.emitRunStreamEvent === "function"
    ? options.emitRunStreamEvent
    : (() => false);
  const markRunCancelled = typeof options.markRunCancelled === "function"
    ? options.markRunCancelled
    : (() => {});
  const onHermesRunEvent = typeof options.onHermesRunEvent === "function"
    ? options.onHermesRunEvent
    : (() => {});

  function handleStreamClosedWithoutTerminal(publicRunId, threadId, messageId) {
    const stream = activeStreamForRun(publicRunId);
    const visibleRunId = cleanString(stream?.realRunId || publicRunId);
    if (stream?.firstModelOutputAt) {
      emitRunStreamEvent(
        publicRunId,
        "run.stream_closed_without_terminal",
        modelStreamEventPreview(
          "\u6a21\u578b\u6d41\u7f3a\u5c11\u5b8c\u6210\u4e8b\u4ef6\uff0c\u5df2\u7528\u5df2\u6536\u5230\u7684\u5185\u5bb9\u5b8c\u6210\u56de\u6267",
          { recovery: "response.completed" },
        ),
        { runId: visibleRunId },
      );
      onHermesRunEvent({
        event: "response.completed",
        run_id: visibleRunId,
        response: { id: visibleRunId },
        output: "",
        hermes_mobile_synthetic: true,
        hermes_mobile_stream_recovery: true,
      });
      return { action: "completed_from_stream_output", runId: visibleRunId };
    }
    emitRunStreamEvent(
      publicRunId,
      "run.stream_closed_without_terminal",
      modelStreamEventPreview(
        "\u6a21\u578b\u6d41\u63d0\u524d\u7ed3\u675f\uff0c\u6ca1\u6709\u6536\u5230\u53ef\u7528\u8f93\u51fa\uff0c\u5df2\u91ca\u653e\u961f\u5217",
        { recovery: "cancelled" },
      ),
      { runId: visibleRunId, error: true },
    );
    markRunCancelled(threadId, messageId, visibleRunId);
    return { action: "cancelled_without_output", runId: visibleRunId };
  }

  return Object.freeze({
    handleStreamClosedWithoutTerminal,
  });
}

module.exports = {
  createGatewayRunStreamCloseRecoveryService,
};
