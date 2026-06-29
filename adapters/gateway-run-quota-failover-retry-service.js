"use strict";

const { gatewayRunUserFacingError } = require("./gateway-run-error-message-service");

const DEFAULT_MAX_QUOTA_FAILOVER_RETRIES = 2;

function cleanString(value) {
  return String(value || "").trim();
}

function compactFallback(value) {
  return value;
}

function gatewayOutputLooksLikeOpenAiCodexUsageLimit(output) {
  const text = cleanString(output).replace(/\s+/g, " ");
  if (!text) return false;
  return /API call failed after \d+ retr(?:y|ies): HTTP 429:/i.test(text)
    && /\busage limit (?:has been )?reached\b/i.test(text);
}

function findQuotaFailoverUserMessage(thread, assistantMessage) {
  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  const index = messages.findIndex((item) => item && item.id === assistantMessage?.id);
  for (let cursor = index >= 0 ? index - 1 : messages.length - 1; cursor >= 0; cursor -= 1) {
    const message = messages[cursor];
    if (message?.role === "user") return message;
  }
  return null;
}

function createGatewayRunQuotaFailoverRetryService(options = {}) {
  const rotateOpenAiCodexCredentialPoolAfterUsageLimit = typeof options.rotateOpenAiCodexCredentialPoolAfterUsageLimit === "function"
    ? options.rotateOpenAiCodexCredentialPoolAfterUsageLimit
    : null;
  const restartRunningGatewayWorkers = typeof options.restartRunningGatewayWorkers === "function"
    ? options.restartRunningGatewayWorkers
    : null;
  const startQuotaFailoverRun = typeof options.startQuotaFailoverRun === "function"
    ? options.startQuotaFailoverRun
    : null;
  const maxQuotaFailoverRetries = Math.max(0, Number(options.maxQuotaFailoverRetries ?? DEFAULT_MAX_QUOTA_FAILOVER_RETRIES) || 0);
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : (() => new Date().toISOString());
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : (() => Date.now());
  const addThreadEvent = typeof options.addThreadEvent === "function" ? options.addThreadEvent : (() => {});
  const saveState = typeof options.saveState === "function" ? options.saveState : (() => {});
  const broadcast = typeof options.broadcast === "function" ? options.broadcast : (() => {});
  const compactMessage = typeof options.compactMessage === "function" ? options.compactMessage : compactFallback;
  const threadSummary = typeof options.threadSummary === "function" ? options.threadSummary : compactFallback;
  const notifyTaskTerminal = typeof options.notifyTaskTerminal === "function" ? options.notifyTaskTerminal : (() => {});
  const removeThreadActiveRun = typeof options.removeThreadActiveRun === "function" ? options.removeThreadActiveRun : (() => {});
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

  function failRetry(thread, message, err) {
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
  }

  function startQuotaFailoverRetry(thread, message, input = {}) {
    const output = cleanString(input.output || input.error?.message || input.error || "");
    if (!gatewayOutputLooksLikeOpenAiCodexUsageLimit(output)) return false;
    if (!rotateOpenAiCodexCredentialPoolAfterUsageLimit || !restartRunningGatewayWorkers || !startQuotaFailoverRun) return false;
    const attempts = Math.max(0, Number(message.openAiCodexQuotaFailoverAttempts || 0) || 0);
    if (attempts >= maxQuotaFailoverRetries) return false;
    const userMessage = findQuotaFailoverUserMessage(thread, message);
    if (!userMessage) return false;
    let rotation = null;
    try {
      rotation = rotateOpenAiCodexCredentialPoolAfterUsageLimit({
        reason: "usage_limit_reached",
        previousRunId: cleanString(input.previousRunId || input.runId),
      });
    } catch (_) {
      return false;
    }
    if (!rotation?.rotated) return false;

    const retryAt = nowIso();
    const existingRunOptions = message.runOptions && typeof message.runOptions === "object" ? message.runOptions : {};
    const retryRunOptions = Object.assign({}, existingRunOptions, {
      openAiCodexQuotaFailoverRetry: {
        previousRunId: cleanString(input.previousRunId || input.runId),
        previousProfileId: rotation.previousProfileId || "",
        activeProfileId: rotation.activeProfileId || "",
        attempt: attempts + 1,
        reason: "usage_limit_reached",
      },
    });
    removeThreadActiveRun(thread, cleanString(input.previousRunId || input.runId || message.runId), "idle");
    message.status = "queued";
    message.content = "";
    message.error = "";
    message.completedAt = "";
    message.failedAt = "";
    message.cancelledAt = "";
    message.updatedAt = retryAt;
    message.openAiCodexQuotaFailoverAttempts = attempts + 1;
    thread.updatedAt = retryAt;
    addThreadEvent(thread, {
      event: "run.openai_codex_quota_failover_retrying",
      timestamp: nowMs() / 1000,
      runId: cleanString(input.previousRunId || input.runId || message.runId),
      tool: "gateway",
      preview: JSON.stringify({
        attempt: attempts + 1,
        previous_profile_id: rotation.previousProfileId || "",
        active_profile_id: rotation.activeProfileId || "",
        pool_size: rotation.summary?.pool_size || 0,
        reason: "usage_limit_reached",
      }),
      error: false,
    });
    broadcastMessageUpdated(thread, message);
    scheduleImmediate(() => {
      Promise.resolve()
        .then(() => restartRunningGatewayWorkers({ reason: "openai_codex_credential_pool_rotated" }))
        .then(() => startQuotaFailoverRun(thread, userMessage, message, retryRunOptions))
        .catch((err) => failRetry(thread, message, err));
    });
    return true;
  }

  return Object.freeze({
    startQuotaFailoverRetry,
  });
}

module.exports = {
  createGatewayRunQuotaFailoverRetryService,
  findQuotaFailoverUserMessage,
  gatewayOutputLooksLikeOpenAiCodexUsageLimit,
};
