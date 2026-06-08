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

const GATEWAY_RUN_EVENT_PHASES = Object.freeze({
  EVENT: "event",
  FINAL_MESSAGE_DONE: "final_message_done",
  OUTPUT_ITEM: "output_item",
  RESPONSE_CREATED: "response_created",
  TERMINAL: "terminal",
  TEXT_DELTA: "text_delta",
});

const GATEWAY_RUN_LIFECYCLE_PHASE_IDS = Object.freeze({
  PREPARATION: "preparation",
  TARGET_SELECTION: "target_selection",
  PLUGIN_CAPABILITY_PROBE: "plugin_capability_probe",
  MODEL_FIRST_PREFLIGHT: "model_first_preflight",
  STREAM_HANDOFF: "stream_handoff",
  STREAM_EVIDENCE: "stream_evidence",
  STREAM_LIVENESS: "stream_liveness",
  STREAM_RECOVERY: "stream_recovery",
  TERMINAL_PROJECTION: "terminal_projection",
  TOOLSET_ESCALATION: "toolset_escalation",
});

function contractEntry(phaseId, stableEvents, branchEvents, sourceFiles) {
  return Object.freeze({
    phaseId,
    stableEvents: Object.freeze(stableEvents.slice()),
    branchEvents: Object.freeze(branchEvents.slice()),
    sourceFiles: Object.freeze(sourceFiles.slice()),
  });
}

const GATEWAY_RUN_LIFECYCLE_CONTRACT = Object.freeze([
  contractEntry(
    GATEWAY_RUN_LIFECYCLE_PHASE_IDS.PREPARATION,
    ["run.request_preparing"],
    ["run.skill_preloaded", "run.wardrobe_workflow_gate_failed"],
    [
      "adapters/gateway-run-start-preparation-service.js",
      "adapters/gateway-run-start-event-service.js",
      "adapters/gateway-run-start-wardrobe-gate-service.js",
    ],
  ),
  contractEntry(
    GATEWAY_RUN_LIFECYCLE_PHASE_IDS.TARGET_SELECTION,
    ["run.context_ready", "run.gateway_selected"],
    [],
    [
      "adapters/gateway-run-start-target-service.js",
      "adapters/gateway-run-start-event-service.js",
    ],
  ),
  contractEntry(
    GATEWAY_RUN_LIFECYCLE_PHASE_IDS.PLUGIN_CAPABILITY_PROBE,
    [],
    ["plugin_capability_activated", "plugin_capability_unavailable"],
    [
      "adapters/gateway-run-start-event-service.js",
      "adapters/gateway-run-start-plugin-probe-service.js",
    ],
  ),
  contractEntry(
    GATEWAY_RUN_LIFECYCLE_PHASE_IDS.MODEL_FIRST_PREFLIGHT,
    [],
    [
      "run.toolset_selection_started",
      "run.toolset_selection_done",
      "run.toolset_selection_failed",
      "run.permission_preflight_done",
      "run.permission_preflight_fallback",
      "run.permission_required",
    ],
    [
      "adapters/gateway-run-start-event-service.js",
      "adapters/gateway-run-start-permission-service.js",
      "adapters/gateway-run-start-toolset-preflight-service.js",
    ],
  ),
  contractEntry(
    GATEWAY_RUN_LIFECYCLE_PHASE_IDS.STREAM_HANDOFF,
    ["run.request_sent"],
    [],
    ["adapters/gateway-run-start-stream-handoff-service.js"],
  ),
  contractEntry(
    GATEWAY_RUN_LIFECYCLE_PHASE_IDS.STREAM_EVIDENCE,
    [
      "response.created",
      "run.model_stream_started",
      "run.model_output_started",
      "message.delta",
      "response.output_text.delta",
      "response.output_item.added",
      "response.output_item.done",
      "response.output_text.done",
    ],
    ["run.final_message_started", "run.final_message_done", "run.tool_budget_exceeded"],
    [
      "adapters/gateway-run-lifecycle-service.js",
      "adapters/gateway-run-output-event-service.js",
      "adapters/gateway-run-stream-event-service.js",
      "adapters/gateway-run-stream-service.js",
    ],
  ),
  contractEntry(
    GATEWAY_RUN_LIFECYCLE_PHASE_IDS.STREAM_LIVENESS,
    [],
    [
      "run.model_first_byte_retrying",
      "run.gateway_start_timeout",
      "run.liveness_warning",
      "run.liveness_stale",
      "run.stream_failed",
    ],
    [
      "adapters/gateway-run-stream-failure-service.js",
      "adapters/gateway-run-stream-first-event-service.js",
      "adapters/gateway-run-stream-liveness-service.js",
    ],
  ),
  contractEntry(
    GATEWAY_RUN_LIFECYCLE_PHASE_IDS.STREAM_RECOVERY,
    ["run.stream_closed_without_terminal"],
    [],
    ["adapters/gateway-run-stream-close-recovery-service.js"],
  ),
  contractEntry(
    GATEWAY_RUN_LIFECYCLE_PHASE_IDS.TERMINAL_PROJECTION,
    [
      "response.completed",
      "run.completed",
      "response.failed",
      "run.failed",
      "response.incomplete",
      "run.cancelled",
    ],
    ["run.canceled"],
    [
      "adapters/gateway-run-lifecycle-service.js",
      "adapters/gateway-run-completion-service.js",
      "adapters/gateway-run-stream-event-service.js",
      "adapters/gateway-run-terminal-state-service.js",
    ],
  ),
  contractEntry(
    GATEWAY_RUN_LIFECYCLE_PHASE_IDS.TOOLSET_ESCALATION,
    [],
    ["run.toolset_escalation_required", "run.toolset_escalation_retrying"],
    [
      "adapters/gateway-run-completion-service.js",
      "adapters/gateway-run-toolset-escalation-retry-service.js",
    ],
  ),
]);

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

function classifyGatewayRunLifecycleEvent(value) {
  const eventName = normalizeGatewayRunEventName(value);
  const terminalStatus = terminalStatusForGatewayRunEvent(eventName);
  if (terminalStatus) {
    return { eventName, phase: GATEWAY_RUN_EVENT_PHASES.TERMINAL, terminalStatus };
  }
  if (eventName === "response.created") {
    return { eventName, phase: GATEWAY_RUN_EVENT_PHASES.RESPONSE_CREATED, terminalStatus: "" };
  }
  if (eventName === "message.delta" || eventName === "response.output_text.delta") {
    return { eventName, phase: GATEWAY_RUN_EVENT_PHASES.TEXT_DELTA, terminalStatus: "" };
  }
  if (eventName === "response.output_item.added" || eventName === "response.output_item.done") {
    return { eventName, phase: GATEWAY_RUN_EVENT_PHASES.OUTPUT_ITEM, terminalStatus: "" };
  }
  if (eventName === "response.output_text.done") {
    return { eventName, phase: GATEWAY_RUN_EVENT_PHASES.FINAL_MESSAGE_DONE, terminalStatus: "" };
  }
  return { eventName, phase: GATEWAY_RUN_EVENT_PHASES.EVENT, terminalStatus: "" };
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

function gatewayRunLifecycleContract() {
  return GATEWAY_RUN_LIFECYCLE_CONTRACT;
}

function gatewayRunLifecyclePhaseIds() {
  return Object.freeze(GATEWAY_RUN_LIFECYCLE_CONTRACT.map((entry) => entry.phaseId));
}

function gatewayRunLifecycleStableEvents() {
  return uniqueRunIds(GATEWAY_RUN_LIFECYCLE_CONTRACT.flatMap((entry) => entry.stableEvents));
}

function gatewayRunLifecycleBranchEvents() {
  return uniqueRunIds(GATEWAY_RUN_LIFECYCLE_CONTRACT.flatMap((entry) => entry.branchEvents));
}

function gatewayRunLifecycleAllEvents() {
  return uniqueRunIds([
    ...gatewayRunLifecycleStableEvents(),
    ...gatewayRunLifecycleBranchEvents(),
  ]);
}

function gatewayRunLifecycleSourceFiles() {
  return uniqueRunIds(GATEWAY_RUN_LIFECYCLE_CONTRACT.flatMap((entry) => entry.sourceFiles));
}

function sourceTextContainsEvent(sourceText, eventName) {
  const text = String(sourceText || "");
  const value = cleanString(eventName);
  if (!text || !value) return false;
  return text.includes(`"${value}"`)
    || text.includes(`'${value}'`)
    || text.includes(`\`${value}\``);
}

function gatewayRunLifecycleMissingSourceEvents(sourceTextByFile = {}, options = {}) {
  const includeBranchEvents = options.includeBranchEvents !== false;
  const missing = [];
  for (const entry of GATEWAY_RUN_LIFECYCLE_CONTRACT) {
    const events = includeBranchEvents
      ? [...entry.stableEvents, ...entry.branchEvents]
      : entry.stableEvents;
    for (const eventName of events) {
      const found = entry.sourceFiles.some((file) => sourceTextContainsEvent(sourceTextByFile[file], eventName));
      if (!found) {
        missing.push({
          phaseId: entry.phaseId,
          eventName,
          sourceFiles: entry.sourceFiles.slice(),
        });
      }
    }
  }
  return missing;
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
    classifyGatewayRunLifecycleEvent,
    extractGatewayRunIds,
    gatewayRunLifecycleAllEvents,
    gatewayRunLifecycleBranchEvents,
    gatewayRunLifecycleContract,
    gatewayRunLifecycleMissingSourceEvents,
    gatewayRunLifecyclePhaseIds,
    gatewayRunLifecycleSourceFiles,
    gatewayRunLifecycleStableEvents,
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
  GATEWAY_RUN_LIFECYCLE_CONTRACT,
  GATEWAY_RUN_EVENT_PHASES,
  GATEWAY_RUN_LIFECYCLE_PHASE_IDS,
  classifyGatewayRunLifecycleEvent,
  createGatewayRunLifecycleService,
  extractGatewayRunIds,
  gatewayRunLifecycleAllEvents,
  gatewayRunLifecycleBranchEvents,
  gatewayRunLifecycleContract,
  gatewayRunLifecycleMissingSourceEvents,
  gatewayRunLifecyclePhaseIds,
  gatewayRunLifecycleSourceFiles,
  gatewayRunLifecycleStableEvents,
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
