"use strict";

const { gatewayRunUserFacingError } = require("./gateway-run-error-message-service");

const TERMINAL_STATUSES = new Set(["done", "failed", "cancelled"]);

function cleanString(value) {
  return String(value || "").trim();
}

function defaultState() {
  return { threads: [] };
}

function compactFallback(value) {
  return value;
}

function safeErrorMessage(err) {
  return gatewayRunUserFacingError(err);
}

function stateProviderFor(options = {}) {
  if (typeof options.state === "function") return options.state;
  return () => options.state || defaultState();
}

function createGatewayRunTerminalStateService(options = {}) {
  const stateProvider = stateProviderFor(options);
  const activeStreams = options.activeStreams instanceof Map ? options.activeStreams : new Map();
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : (() => new Date().toISOString());
  const saveState = typeof options.saveState === "function" ? options.saveState : (() => {});
  const broadcast = typeof options.broadcast === "function" ? options.broadcast : (() => {});
  const compactMessage = typeof options.compactMessage === "function" ? options.compactMessage : compactFallback;
  const threadSummary = typeof options.threadSummary === "function" ? options.threadSummary : compactFallback;
  const clearStreamingSaveTimer = typeof options.clearStreamingSaveTimer === "function"
    ? options.clearStreamingSaveTimer
    : (() => {});
  const compactTerminalTopicContext = typeof options.compactTerminalTopicContext === "function"
    ? options.compactTerminalTopicContext
    : (() => null);
  const enqueueExternalDeliveryForTerminalMessage = typeof options.enqueueExternalDeliveryForTerminalMessage === "function"
    ? options.enqueueExternalDeliveryForTerminalMessage
    : (() => {});
  const notifyTaskTerminal = typeof options.notifyTaskTerminal === "function" ? options.notifyTaskTerminal : (() => {});
  const removeThreadActiveRun = typeof options.removeThreadActiveRun === "function" ? options.removeThreadActiveRun : (() => {});
  const scheduleNextQueuedRunForTaskGroup = typeof options.scheduleNextQueuedRunForTaskGroup === "function"
    ? options.scheduleNextQueuedRunForTaskGroup
    : (() => {});

  function state() {
    const value = stateProvider();
    return value && typeof value === "object" ? value : defaultState();
  }

  function threadAndMessage(threadId, messageId) {
    const thread = (state().threads || []).find((item) => item.id === threadId);
    if (!thread) return { missing: "missing_thread" };
    const message = (thread.messages || []).find((item) => item.id === messageId);
    if (!message) return { missing: "missing_message", thread };
    if (TERMINAL_STATUSES.has(String(message.status || ""))) return { missing: "terminal_ignored", message, thread };
    return { message, thread };
  }

  function markRunFailed(threadId, messageId, runId, err) {
    const target = threadAndMessage(threadId, messageId);
    if (target.missing) return { action: target.missing };
    const { thread, message } = target;
    clearStreamingSaveTimer();
    const failedAt = nowIso();
    message.status = "failed";
    message.error = safeErrorMessage(err);
    message.failedAt = failedAt;
    message.updatedAt = failedAt;
    enqueueExternalDeliveryForTerminalMessage(thread, message, "failed");
    removeThreadActiveRun(thread, runId, "failed");
    thread.updatedAt = failedAt;
    compactTerminalTopicContext(thread, message, "run-failed");
    saveState();
    broadcast({ type: "run.failed", threadId, runId, message: compactMessage(message), thread: threadSummary(thread) });
    notifyTaskTerminal(thread, message, "failed");
    scheduleNextQueuedRunForTaskGroup(thread, message.taskGroupId);
    return { action: "failed", error: message.error };
  }

  function markRunCancelled(threadId, messageId, runId) {
    const target = threadAndMessage(threadId, messageId);
    if (target.missing) return { action: target.missing };
    const { thread, message } = target;
    clearStreamingSaveTimer();
    const cancelledAt = nowIso();
    message.status = "cancelled";
    message.cancelledAt = cancelledAt;
    message.updatedAt = cancelledAt;
    removeThreadActiveRun(thread, runId, "idle");
    thread.updatedAt = cancelledAt;
    compactTerminalTopicContext(thread, message, "run-cancelled");
    saveState();
    broadcast({ type: "run.cancelled", threadId, runId, message: compactMessage(message), thread: threadSummary(thread) });
    scheduleNextQueuedRunForTaskGroup(thread, message.taskGroupId);
    return { action: "cancelled" };
  }

  function reconcileDetachedActiveRuns(reason = "Hermes Mobile restarted while this task was running; the result stream is no longer attached. Please rerun the task.") {
    let changed = false;
    const failedAt = nowIso();
    for (const thread of state().threads || []) {
      let threadChanged = false;
      for (const message of thread.messages || []) {
        if (!["queued", "running"].includes(String(message.status || ""))) continue;
        const runId = cleanString(message.runId);
        if (message.status === "queued" && !runId) continue;
        if (runId && activeStreams.has(runId)) continue;
        message.status = "failed";
        message.error = reason;
        message.failedAt = failedAt;
        message.updatedAt = failedAt;
        enqueueExternalDeliveryForTerminalMessage(thread, message, "failed");
        if (runId) removeThreadActiveRun(thread, runId, "failed");
        changed = true;
        threadChanged = true;
        broadcast({ type: "run.failed", threadId: thread.id, runId, message: compactMessage(message), thread: threadSummary(thread) });
      }
      if (!thread.activeRunIds?.length && thread.status === "running") thread.status = "failed";
      if (threadChanged) thread.updatedAt = failedAt;
    }
    if (changed) saveState();
    for (const thread of state().threads || []) {
      if ((thread.activeRunIds || []).length) continue;
      const queued = (thread.messages || []).find((message) => (
        message.role === "assistant" && message.status === "queued" && !message.runId && message.taskGroupId
      ));
      if (queued) scheduleNextQueuedRunForTaskGroup(thread, queued.taskGroupId);
    }
    return changed;
  }

  return Object.freeze({
    markRunCancelled,
    markRunFailed,
    reconcileDetachedActiveRuns,
  });
}

module.exports = {
  createGatewayRunTerminalStateService,
};
