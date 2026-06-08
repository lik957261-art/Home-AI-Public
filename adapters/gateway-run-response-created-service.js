"use strict";

function createGatewayRunResponseCreatedService(options = {}) {
  const activeStreams = options.activeStreams instanceof Map ? options.activeStreams : new Map();
  const saveState = typeof options.saveState === "function" ? options.saveState : (() => {});
  const broadcastMessageUpdated = typeof options.broadcastMessageUpdated === "function"
    ? options.broadcastMessageUpdated
    : (() => {});
  const replaceThreadActiveRun = typeof options.replaceThreadActiveRun === "function"
    ? options.replaceThreadActiveRun
    : (() => {});

  function markResponseCreated(context = {}) {
    const { thread, message, runId, responseRunId, stream } = context;
    if (responseRunId && responseRunId !== runId) {
      const aliasStream = stream || activeStreams.get(runId);
      if (aliasStream) {
        aliasStream.realRunId = responseRunId;
        activeStreams.set(responseRunId, aliasStream);
      }
      if (!message.originalRunId) message.originalRunId = runId;
      message.responseRunId = responseRunId;
      message.runId = responseRunId;
      replaceThreadActiveRun(thread, runId, responseRunId);
    }
    saveState();
    broadcastMessageUpdated(thread, message);
    return { action: "response_created", runId, responseRunId };
  }

  return Object.freeze({
    markResponseCreated,
  });
}

module.exports = {
  createGatewayRunResponseCreatedService,
};
