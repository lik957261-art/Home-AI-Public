"use strict";

const TERMINAL_EVENT_STATUSES = Object.freeze({
  "response.completed": "done",
  "run.completed": "done",
  "response.failed": "failed",
  "run.failed": "failed",
  "response.incomplete": "cancelled",
  "run.cancelled": "cancelled",
  "run.canceled": "cancelled",
  cancelled: "cancelled",
  canceled: "cancelled",
});

function cleanString(value) {
  return String(value || "").trim();
}

function normalizeGatewayRunEventName(value) {
  const raw = typeof value === "object" && value
    ? (value.event || value.type || value.name || "")
    : value;
  const name = cleanString(raw).toLowerCase().replace(/_/g, ".");
  if (name === "response.output.text.delta") return "response.output_text.delta";
  if (name === "response.output.text.done") return "response.output_text.done";
  if (name === "response.output.item.added") return "response.output_item.added";
  if (name === "response.output.item.done") return "response.output_item.done";
  if (name === "run.canceled") return "run.cancelled";
  return name;
}

function extractGatewayRunIds(event = {}) {
  const eventName = normalizeGatewayRunEventName(event);
  const originalRunId = cleanString(event.run_id || event.runId || "");
  const responseRunId = cleanString(event.response?.id || event.response_id || event.responseId || "");
  const eventRunId = cleanString(event.id || "");
  const runId = eventName === "response.created"
    ? (originalRunId || responseRunId || eventRunId)
    : (responseRunId || originalRunId || eventRunId);
  return {
    eventName,
    originalRunId,
    responseRunId,
    runId,
  };
}

function terminalStatusForGatewayRunEvent(value) {
  const eventName = normalizeGatewayRunEventName(value);
  return TERMINAL_EVENT_STATUSES[eventName] || "";
}

function isTerminalGatewayRunEvent(value) {
  return Boolean(terminalStatusForGatewayRunEvent(value));
}

function uniqueRunIds(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const id = cleanString(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function withActiveRunAdded(thread = {}, runId) {
  const id = cleanString(runId);
  const activeRunIds = uniqueRunIds([...(thread.activeRunIds || []), id]);
  return Object.assign({}, thread, {
    activeRunIds,
    activeRunId: id || activeRunIds[activeRunIds.length - 1] || null,
  });
}

function withActiveRunReplaced(thread = {}, oldRunId, newRunId) {
  const oldId = cleanString(oldRunId);
  const newId = cleanString(newRunId);
  const activeRunIds = uniqueRunIds((thread.activeRunIds || [])
    .map((item) => (cleanString(item) === oldId ? newId : item))
    .filter(Boolean));
  let activeRunId = thread.activeRunId;
  if (cleanString(activeRunId) === oldId) activeRunId = newId || null;
  if (!activeRunId && activeRunIds.length) activeRunId = activeRunIds[activeRunIds.length - 1];
  return Object.assign({}, thread, { activeRunIds, activeRunId: activeRunId || null });
}

function withActiveRunRemoved(thread = {}, runId, idleStatus = "idle") {
  const id = cleanString(runId);
  const activeRunIds = uniqueRunIds(thread.activeRunIds || []).filter((item) => item !== id);
  const activeRunId = cleanString(thread.activeRunId) === id
    ? (activeRunIds[activeRunIds.length - 1] || null)
    : (thread.activeRunId || activeRunIds[activeRunIds.length - 1] || null);
  return Object.assign({}, thread, {
    activeRunIds,
    activeRunId,
    status: activeRunIds.length ? "running" : idleStatus,
  });
}

function taskGroupHasRunningRun(thread = {}, taskGroupId) {
  const groupId = cleanString(taskGroupId);
  if (!groupId) return false;
  return (Array.isArray(thread.messages) ? thread.messages : []).some((message) => (
    message?.role === "assistant"
    && cleanString(message.taskGroupId) === groupId
    && cleanString(message.status) === "running"
  ));
}

function nextQueuedRunPairForTaskGroup(thread = {}, taskGroupId) {
  const groupId = cleanString(taskGroupId);
  if (!groupId) return null;
  const messages = Array.isArray(thread.messages) ? thread.messages : [];
  for (let i = 0; i < messages.length; i += 1) {
    const assistant = messages[i];
    if (
      assistant?.role !== "assistant"
      || cleanString(assistant.taskGroupId) !== groupId
      || cleanString(assistant.status) !== "queued"
      || cleanString(assistant.runId)
    ) {
      continue;
    }
    const user = messages[i - 1];
    if (user?.role === "user" && cleanString(user.taskGroupId) === groupId) {
      return { user, assistant };
    }
  }
  return null;
}

function queuedNextRunDecision(thread = {}, taskGroupId) {
  const groupId = cleanString(taskGroupId);
  if (!thread.singleWindow || !groupId) return { action: "none", reason: "not_single_window" };
  if (taskGroupHasRunningRun(thread, groupId)) return { action: "wait", reason: "task_group_running" };
  const pair = nextQueuedRunPairForTaskGroup(thread, groupId);
  if (pair) return { action: "start", reason: "queued_pair_ready", pair };
  if (!uniqueRunIds(thread.activeRunIds || []).length && cleanString(thread.status) === "queued") {
    return { action: "set_idle", reason: "queue_empty" };
  }
  return { action: "none", reason: "queue_empty" };
}

function livenessDecisionAfterCheck(input = {}) {
  const status = Number(input.status ?? input.error?.status ?? 0);
  const now = Number(input.nowMs ?? input.now ?? Date.now());
  const lastEventAt = Number(input.lastEventAtMs ?? input.lastEventAt ?? now);
  const elapsedMs = Math.max(0, now - lastEventAt);
  const staleAfterMs = Math.max(0, Number(input.staleAfterMs || 0));
  const previousMisses = Math.max(0, Number(input.livenessMisses || input.previousMisses || 0));
  const lastWarningAt = Math.max(0, Number(input.lastWarningAtMs || input.lastLivenessWarningAt || 0));
  const warningIntervalMs = Math.max(0, Number(input.warningIntervalMs || 300000));

  if (status === 0 || input.ok === true) {
    return {
      action: "alive",
      shouldAbort: false,
      shouldWarn: false,
      livenessMisses: 0,
      elapsedMs,
      lastWarningAt: 0,
    };
  }

  if (status !== 404) {
    return {
      action: "ignore_error",
      shouldAbort: false,
      shouldWarn: false,
      livenessMisses: previousMisses,
      elapsedMs,
      lastWarningAt,
    };
  }

  const livenessMisses = previousMisses + 1;
  if (staleAfterMs > 0 && elapsedMs >= staleAfterMs) {
    return {
      action: "abort_stale",
      shouldAbort: true,
      shouldWarn: false,
      livenessMisses,
      elapsedMs,
      lastWarningAt,
    };
  }

  const shouldWarn = !lastWarningAt || now - lastWarningAt >= warningIntervalMs;
  return {
    action: "continue_after_404",
    shouldAbort: false,
    shouldWarn,
    livenessMisses,
    elapsedMs,
    lastWarningAt: shouldWarn ? now : lastWarningAt,
  };
}

function createGatewayRunLifecycleService() {
  return {
    extractGatewayRunIds,
    isTerminalGatewayRunEvent,
    livenessDecisionAfterCheck,
    nextQueuedRunPairForTaskGroup,
    normalizeGatewayRunEventName,
    queuedNextRunDecision,
    taskGroupHasRunningRun,
    terminalStatusForGatewayRunEvent,
    uniqueRunIds,
    withActiveRunAdded,
    withActiveRunRemoved,
    withActiveRunReplaced,
  };
}

module.exports = {
  createGatewayRunLifecycleService,
  extractGatewayRunIds,
  isTerminalGatewayRunEvent,
  livenessDecisionAfterCheck,
  nextQueuedRunPairForTaskGroup,
  normalizeGatewayRunEventName,
  queuedNextRunDecision,
  taskGroupHasRunningRun,
  terminalStatusForGatewayRunEvent,
  uniqueRunIds,
  withActiveRunAdded,
  withActiveRunRemoved,
  withActiveRunReplaced,
};
