"use strict";

const { gatewayRunUserFacingError } = require("./gateway-run-error-message-service");
const {
  expandCommonWebEscalationToolsets,
  findEscalationUserMessage,
  routeOmittedAuthorizedToolsets,
  routeSelectedToolsets,
  uniqueCleanStrings,
} = require("./gateway-run-toolset-escalation-service");

const DEFAULT_MAX_TOOLSET_ESCALATION_RETRIES = 1;

function cleanString(value) {
  return String(value || "").trim();
}

function compactFallback(value) {
  return value;
}

function createGatewayRunToolsetEscalationRetryService(options = {}) {
  const startToolsetEscalationRun = typeof options.startToolsetEscalationRun === "function"
    ? options.startToolsetEscalationRun
    : null;
  const maxToolsetEscalationRetries = Math.max(
    0,
    Number(options.maxToolsetEscalationRetries ?? DEFAULT_MAX_TOOLSET_ESCALATION_RETRIES) || 0,
  );
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : (() => new Date().toISOString());
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : (() => Date.now());
  const addThreadEvent = typeof options.addThreadEvent === "function" ? options.addThreadEvent : (() => {});
  const saveState = typeof options.saveState === "function" ? options.saveState : (() => {});
  const broadcast = typeof options.broadcast === "function" ? options.broadcast : (() => {});
  const compactMessage = typeof options.compactMessage === "function" ? options.compactMessage : compactFallback;
  const threadSummary = typeof options.threadSummary === "function" ? options.threadSummary : compactFallback;
  const notifyTaskTerminal = typeof options.notifyTaskTerminal === "function" ? options.notifyTaskTerminal : (() => {});
  const scheduleImmediate = typeof options.setImmediate === "function"
    ? options.setImmediate
    : (typeof options.scheduleImmediate === "function" ? options.scheduleImmediate : setImmediate);
  const broadcastMessageUpdated = typeof options.broadcastMessageUpdated === "function"
    ? options.broadcastMessageUpdated
    : ((thread, message) => broadcast({
      type: "message.updated",
      threadId: thread.id,
      message: compactMessage(message),
      thread: threadSummary(thread),
    }));

  function startEscalatedToolsetRetry(thread, message, request, previousRunId) {
    const retryableToolsets = uniqueCleanStrings(request?.retryableToolsets || request?.toolsets || []);
    if (!startToolsetEscalationRun || !retryableToolsets.length) return false;
    const attempts = Math.max(0, Number(message.toolsetEscalationAttempts || 0) || 0);
    if (attempts >= maxToolsetEscalationRetries) return false;
    const userMessage = findEscalationUserMessage(thread, message);
    if (!userMessage) return false;
    const authorizedToolsets = uniqueCleanStrings([
      ...routeSelectedToolsets(message),
      ...retryableToolsets,
      ...routeOmittedAuthorizedToolsets(message),
    ]);
    const selectedToolsets = expandCommonWebEscalationToolsets(
      uniqueCleanStrings([...routeSelectedToolsets(message), ...retryableToolsets]),
      authorizedToolsets,
    );
    const previousSelectedToolsets = routeSelectedToolsets(message);
    if (selectedToolsets.length === previousSelectedToolsets.length
      && selectedToolsets.every((toolset) => previousSelectedToolsets.includes(toolset))) {
      return false;
    }
    const omittedAfterRetry = authorizedToolsets.filter((toolset) => !selectedToolsets.includes(toolset));
    const retryRouting = {
      mode: "model_first",
      reason: "toolset_escalation_retry",
      selected_toolsets: selectedToolsets,
      omitted_authorized_toolsets: omittedAfterRetry,
      authorized_toolset_count: authorizedToolsets.length,
      duration_ms: 0,
      escalated_from_run_id: cleanString(previousRunId),
    };
    const existingRunOptions = message.runOptions && typeof message.runOptions === "object" ? message.runOptions : {};
    const retryInstructions = [
      existingRunOptions.instructions || "",
      "Toolset escalation retry: the previous execution determined that additional authorized toolsets were required. Continue the same user task with the expanded enabled toolsets. Do not repeat the escalation marker unless another omitted authorized toolset is genuinely required.",
    ].filter(Boolean).join("\n\n");
    const retryRunOptions = Object.assign({}, existingRunOptions, {
      instructions: retryInstructions,
      skipModelFirstToolsetSelection: true,
      toolsetEscalationRetry: {
        previousRunId: cleanString(previousRunId),
        requestedToolsets: retryableToolsets,
        reason: request.reason,
        attempt: attempts + 1,
      },
      modelFirstToolsetSelection: {
        skipSelector: true,
        force: true,
        reason: "toolset_escalation_retry",
        selectedToolsets,
        authorizedToolsets,
        durationMs: 0,
        routing: retryRouting,
      },
    });

    const retryAt = nowIso();
    message.status = "queued";
    message.content = "";
    message.error = "";
    message.completedAt = "";
    message.failedAt = "";
    message.cancelledAt = "";
    message.updatedAt = retryAt;
    message.toolsetEscalationAttempts = attempts + 1;
    message.toolsetEscalationRequired = false;
    message.toolsetEscalationToolsets = [];
    message.toolsetEscalationReason = "";
    message.toolsetEscalationSource = "";
    thread.updatedAt = retryAt;
    addThreadEvent(thread, {
      event: "run.toolset_escalation_retrying",
      timestamp: nowMs() / 1000,
      runId: cleanString(previousRunId),
      tool: "toolset",
      preview: JSON.stringify({
        requested_toolsets: retryableToolsets,
        selected_toolsets: selectedToolsets,
        attempt: attempts + 1,
      }),
      error: false,
    });
    broadcastMessageUpdated(thread, message);
    scheduleImmediate(() => {
      Promise.resolve(startToolsetEscalationRun(thread, userMessage, message, retryRunOptions)).catch((err) => {
        const failedAt = nowIso();
        message.status = "failed";
        message.error = gatewayRunUserFacingError(err);
        message.failedAt = failedAt;
        message.updatedAt = failedAt;
        thread.updatedAt = failedAt;
        saveState();
        broadcast({
          type: "run.failed",
          threadId: thread.id,
          runId: cleanString(message.runId),
          message: compactMessage(message),
          thread: threadSummary(thread),
        });
        notifyTaskTerminal(thread, message, "failed");
      });
    });
    return true;
  }

  return Object.freeze({
    startEscalatedToolsetRetry,
  });
}

module.exports = {
  createGatewayRunToolsetEscalationRetryService,
};
