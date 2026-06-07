"use strict";

const { gatewayRunUserFacingError } = require("./gateway-run-error-message-service");
const { cleanString } = require("./gateway-run-request-builder-service");

function maybeCall(fn, fallback) {
  return typeof fn === "function" ? fn : fallback;
}

function createGatewayRunStartStateService(options = {}) {
  const nowIso = maybeCall(options.nowIso, () => new Date().toISOString());
  const addThreadActiveRun = maybeCall(options.addThreadActiveRun, () => {});
  const removeThreadActiveRun = maybeCall(options.removeThreadActiveRun, () => {});
  const saveState = maybeCall(options.saveState, () => {});
  const broadcast = maybeCall(options.broadcast, () => {});
  const compactMessage = maybeCall(options.compactMessage, (message) => message);
  const threadSummary = maybeCall(options.threadSummary, (thread) => thread);

  function ensureActiveRun(thread, taskId) {
    const id = cleanString(taskId);
    if (!id) return;
    const activeRunIds = Array.isArray(thread?.activeRunIds) ? thread.activeRunIds.map(cleanString) : [];
    if (!activeRunIds.includes(id)) {
      addThreadActiveRun(thread, id);
    } else {
      thread.activeRunId = id;
    }
  }

  function applyPreparingRunState(thread, assistantMessage, taskId, startedAt = nowIso()) {
    assistantMessage.runId = taskId;
    assistantMessage.taskId = taskId;
    assistantMessage.status = "running";
    assistantMessage.startedAt = assistantMessage.startedAt || startedAt;
    assistantMessage.updatedAt = startedAt;
    ensureActiveRun(thread, taskId);
    thread.status = "running";
    thread.updatedAt = startedAt;
    return { startedAt };
  }

  function applyStartedRunState(thread, assistantMessage, taskId, gatewayTarget, startedAt = nowIso()) {
    const gatewayUrl = cleanString(gatewayTarget?.apiBase);
    assistantMessage.runId = taskId;
    assistantMessage.taskId = taskId;
    assistantMessage.gatewayUrl = gatewayUrl;
    assistantMessage.gatewayName = cleanString(gatewayTarget?.name);
    assistantMessage.gatewayProfile = cleanString(gatewayTarget?.profile);
    assistantMessage.gatewaySource = cleanString(gatewayTarget?.source);
    assistantMessage.status = "running";
    assistantMessage.startedAt = assistantMessage.startedAt || startedAt;
    assistantMessage.updatedAt = startedAt;
    ensureActiveRun(thread, taskId);
    thread.status = "running";
    thread.updatedAt = startedAt;
    return { gatewayUrl, startedAt };
  }

  function broadcastMessageUpdated(thread, assistantMessage) {
    broadcast({
      type: "message.updated",
      threadId: thread.id,
      message: compactMessage(assistantMessage),
      thread: threadSummary(thread),
    });
  }

  function markStartFailed(thread, assistantMessage, err, values = {}) {
    const failedAt = nowIso();
    const runId = cleanString(values.runId || assistantMessage?.runId);
    assistantMessage.status = "failed";
    assistantMessage.error = gatewayRunUserFacingError(err);
    if (values.content) assistantMessage.content = cleanString(values.content);
    assistantMessage.failedAt = failedAt;
    assistantMessage.updatedAt = failedAt;
    removeThreadActiveRun(thread, runId, "failed");
    thread.updatedAt = failedAt;
    saveState();
    broadcast({
      type: "run.failed",
      threadId: thread.id,
      runId,
      message: compactMessage(assistantMessage),
      thread: threadSummary(thread),
    });
    return { status: "failed", runId, failedAt, error: assistantMessage.error };
  }

  return Object.freeze({
    applyPreparingRunState,
    applyStartedRunState,
    broadcastMessageUpdated,
    ensureActiveRun,
    markStartFailed,
  });
}

module.exports = {
  createGatewayRunStartStateService,
};
