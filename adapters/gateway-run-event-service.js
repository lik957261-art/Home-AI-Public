"use strict";

const {
  GATEWAY_RUN_EVENT_PHASES,
  classifyGatewayRunLifecycleEvent,
  extractGatewayRunIds,
  withActiveRunRemoved,
  withActiveRunReplaced,
} = require("./gateway-run-lifecycle-service");
const {
  createGatewayRunCompletionService,
  extractCompletedOutput,
} = require("./gateway-run-completion-service");
const { createGatewayRunDeltaEventService } = require("./gateway-run-delta-event-service");
const { createGatewayRunOutputEventService } = require("./gateway-run-output-event-service");
const { createGatewayRunTerminalStateService } = require("./gateway-run-terminal-state-service");
const { createGatewayRunResponseCreatedService } = require("./gateway-run-response-created-service");
const { createGatewayRunStreamingSaveService } = require("./gateway-run-streaming-save-service");
const { createGatewayRunToolsetEscalationRetryService } = require("./gateway-run-toolset-escalation-retry-service");
const { gatewayRunUserFacingErrorFromEvent } = require("./gateway-run-error-message-service");

function cleanString(value) {
  return String(value || "").trim();
}

function compactFallback(value) {
  return value;
}

function defaultState() {
  return { threads: [] };
}

function isSyntheticHermesMobileRunEvent(event = {}) {
  return Boolean(event.hermes_mobile_synthetic || event.hermesMobileSynthetic);
}

function defaultAppendBounded(current, delta, maxChars = 12000) {
  const next = `${current || ""}${delta || ""}`;
  if (next.length <= maxChars) return next;
  const side = Math.floor(maxChars * 0.45);
  return `${next.slice(0, side)}\n\n[content truncated live: ${next.length} chars total]\n\n${next.slice(-side)}`;
}

function findRunTargetInState(state, runId) {
  const id = cleanString(runId);
  if (!id) return null;
  for (const thread of state?.threads || []) {
    const message = (thread.messages || []).find((item) => cleanString(item.runId) === id);
    if (message) return { threadId: thread.id, messageId: message.id };
  }
  return null;
}

function createGatewayRunEventService(options = {}) {
  const stateProvider = typeof options.state === "function"
    ? options.state
    : (() => options.state || defaultState());
  const activeStreams = options.activeStreams instanceof Map ? options.activeStreams : new Map();
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : (() => new Date().toISOString());
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : (() => Date.now());
  const maxMessageChars = Math.max(1, Number(options.maxMessageChars || 12000) || 12000);
  const finalMessageTerminalFallbackMs = Math.max(0, Number(options.finalMessageTerminalFallbackMs || 1500) || 1500);

  const appendBounded = typeof options.appendBounded === "function" ? options.appendBounded : defaultAppendBounded;
  const compactFullContent = typeof options.compactFullContent === "function"
    ? options.compactFullContent
    : ((value) => defaultAppendBounded("", value, maxMessageChars));
  const saveState = typeof options.saveState === "function" ? options.saveState : (() => {});
  const logError = typeof options.logError === "function" ? options.logError : ((err) => {
    try {
      console.error(err);
    } catch (_) {}
  });
  const topicContextCompactionService = options.topicContextCompactionService || null;
  const broadcast = typeof options.broadcast === "function" ? options.broadcast : (() => {});
  const compactMessage = typeof options.compactMessage === "function" ? options.compactMessage : compactFallback;
  const threadSummary = typeof options.threadSummary === "function" ? options.threadSummary : compactFallback;
  const addThreadEvent = typeof options.addThreadEvent === "function" ? options.addThreadEvent : (() => {});
  const registerArtifactsFromText = typeof options.registerArtifactsFromText === "function"
    ? options.registerArtifactsFromText
    : (() => []);
  const supplementGatewayUsage = typeof options.supplementGatewayUsage === "function"
    ? options.supplementGatewayUsage
    : ((usage) => usage);
  const modelPermissionApprovalRequest = typeof options.modelPermissionApprovalRequest === "function"
    ? options.modelPermissionApprovalRequest
    : (() => null);
  const isOrdinaryToolSchemaElevationRequest = typeof options.isOrdinaryToolSchemaElevationRequest === "function"
    ? options.isOrdinaryToolSchemaElevationRequest
    : (() => false);
  const stripPermissionApprovalMarkers = typeof options.stripPermissionApprovalMarkers === "function"
    ? options.stripPermissionApprovalMarkers
    : ((text) => String(text || ""));
  const enqueueExternalDeliveryForTerminalMessage = typeof options.enqueueExternalDeliveryForTerminalMessage === "function"
    ? options.enqueueExternalDeliveryForTerminalMessage
    : (() => {});
  const replaceThreadActiveRun = typeof options.replaceThreadActiveRun === "function"
    ? options.replaceThreadActiveRun
    : ((thread, oldRunId, newRunId) => Object.assign(thread, withActiveRunReplaced(thread, oldRunId, newRunId)));
  const removeThreadActiveRun = typeof options.removeThreadActiveRun === "function"
    ? options.removeThreadActiveRun
    : ((thread, runId, idleStatus) => Object.assign(thread, withActiveRunRemoved(thread, runId, idleStatus)));
  const scheduleNextQueuedRunForTaskGroup = typeof options.scheduleNextQueuedRunForTaskGroup === "function"
    ? options.scheduleNextQueuedRunForTaskGroup
    : (() => {});
  const setTimeoutFn = typeof options.setTimeout === "function" ? options.setTimeout : setTimeout;
  const clearTimeoutFn = typeof options.clearTimeout === "function" ? options.clearTimeout : clearTimeout;
  const notifyTaskTerminal = typeof options.notifyTaskTerminal === "function"
    ? options.notifyTaskTerminal
    : ((thread, message, status) => options.webPushDeliveryService?.notifyTaskTerminal?.(thread, message, status));
  const finalMessageTerminalFallbackTimers = new Map();
  let completionService = null;
  let deltaEventService = null;
  let outputEventService = null;
  let responseCreatedService = null;
  let streamingStateSaveService = null;
  let terminalStateService = null;
  let toolsetEscalationRetryService = null;

  function state() {
    const value = stateProvider();
    return value && typeof value === "object" ? value : defaultState();
  }

  function findRunTarget(runId) {
    const id = cleanString(runId);
    const active = activeStreams.get(id);
    if (active?.threadId && active?.messageId) {
      return { threadId: active.threadId, messageId: active.messageId };
    }
    return findRunTargetInState(state(), id);
  }

  function resolveRunEventContext(event = {}) {
    const ids = extractGatewayRunIds(event);
    const stream = activeStreams.get(ids.runId)
      || activeStreams.get(ids.originalRunId)
      || activeStreams.get(ids.responseRunId)
      || null;
    if (stream && !isSyntheticHermesMobileRunEvent(event)) stream.lastEventAt = nowMs();
    const target = findRunTarget(ids.runId)
      || findRunTarget(ids.originalRunId)
      || findRunTarget(ids.responseRunId);
    const thread = target ? (state().threads || []).find((item) => item.id === target.threadId) : null;
    const message = thread ? (thread.messages || []).find((item) => item.id === target.messageId) : null;
    return Object.assign({}, ids, { stream, target, thread: thread || null, message: message || null });
  }

  function broadcastMessageUpdated(thread, message) {
    broadcast({
      type: "message.updated",
      threadId: thread.id,
      message: compactMessage(message),
      thread: threadSummary(thread),
    });
  }

  function finalMessageTerminalFallbackKey(thread, message, runId) {
    const id = cleanString(runId || message?.runId || "");
    if (!thread?.id || !message?.id || !id) return "";
    return `${thread.id}:${message.id}:${id}`;
  }

  function clearFinalMessageTerminalFallback(thread, message, runId) {
    const key = finalMessageTerminalFallbackKey(thread, message, runId);
    if (!key) return;
    const timer = finalMessageTerminalFallbackTimers.get(key);
    if (timer) clearTimeoutFn(timer);
    finalMessageTerminalFallbackTimers.delete(key);
  }

  function outputItemLooksLikeFinalMessage(event = {}) {
    const item = event.item || event.output_item || event.outputItem || {};
    const type = cleanString(item.type).toLowerCase();
    const role = cleanString(item.role).toLowerCase();
    if (type && type !== "message") return false;
    if (role && role !== "assistant") return false;
    return Boolean(extractCompletedOutput({ response: { output: [item] } }) || cleanString(event.text));
  }

  function scheduleFinalMessageTerminalFallback(context, event = {}) {
    if (!finalMessageTerminalFallbackMs) return;
    const { thread, message, runId, responseRunId, originalRunId, stream } = context;
    if (!thread || !message) return;
    if (!["queued", "running"].includes(cleanString(message.status))) return;
    const visibleRunId = cleanString(responseRunId || stream?.realRunId || message.runId || runId || originalRunId);
    const key = finalMessageTerminalFallbackKey(thread, message, visibleRunId);
    if (!key) return;
    clearFinalMessageTerminalFallback(thread, message, visibleRunId);
    const timer = setTimeoutFn(() => {
      finalMessageTerminalFallbackTimers.delete(key);
      if (!["queued", "running"].includes(cleanString(message.status))) return;
      const activeIds = Array.isArray(thread.activeRunIds) ? thread.activeRunIds.map(cleanString) : [];
      const stillActive = activeIds.includes(visibleRunId) || cleanString(thread.activeRunId) === visibleRunId || cleanString(message.runId) === visibleRunId;
      if (!stillActive) return;
      applyHermesRunEvent({
        event: "response.completed",
        run_id: visibleRunId,
        response: { id: visibleRunId },
        output: cleanString(message.content),
        hermes_mobile_synthetic: true,
        hermes_mobile_final_message_fallback: true,
      });
    }, finalMessageTerminalFallbackMs);
    finalMessageTerminalFallbackTimers.set(key, timer);
    if (typeof timer?.unref === "function") timer.unref();
  }

  function compactTerminalTopicContext(thread, message, reason) {
    if (!topicContextCompactionService || typeof topicContextCompactionService.compactTaskGroup !== "function") return null;
    if (!message?.taskGroupId) return null;
    try {
      return topicContextCompactionService.compactTaskGroup(thread, message.taskGroupId, { reason });
    } catch (err) {
      logError(`Hermes Mobile topic context compaction failed: ${err.message || String(err)}`);
      return { changed: false, error: err.message || String(err) };
    }
  }

  function getTerminalStateService() {
    if (!terminalStateService) {
      terminalStateService = options.terminalStateService || createGatewayRunTerminalStateService({
        activeStreams,
        broadcast,
        clearStreamingSaveTimer: () => getStreamingStateSaveService().clearStreamingSaveTimer(),
        compactMessage,
        compactTerminalTopicContext,
        enqueueExternalDeliveryForTerminalMessage, isOrdinaryToolSchemaElevationRequest,
        gatewayHealthDiagnosticService: options.gatewayHealthDiagnosticService,
        modelPermissionApprovalRequest,
        notifyTaskTerminal,
        nowIso,
        removeThreadActiveRun,
        saveState,
        scheduleNextQueuedRunForTaskGroup,
        state,
        threadSummary,
      });
    }
    return terminalStateService;
  }

  function getToolsetEscalationRetryService() {
    if (!toolsetEscalationRetryService) {
      toolsetEscalationRetryService = options.toolsetEscalationRetryService || createGatewayRunToolsetEscalationRetryService({
        addThreadEvent,
        broadcast,
        broadcastMessageUpdated,
        compactMessage,
        maxToolsetEscalationRetries: options.maxToolsetEscalationRetries,
        notifyTaskTerminal,
        nowIso,
        nowMs,
        saveState,
        setImmediate: options.setImmediate,
        startToolsetEscalationRun: options.startToolsetEscalationRun,
        threadSummary,
      });
    }
    return toolsetEscalationRetryService;
  }

  function getCompletionService() {
    if (!completionService) {
      completionService = options.completionService || createGatewayRunCompletionService({
        addThreadEvent,
        broadcast,
        clearStreamingSaveTimer: () => getStreamingStateSaveService().clearStreamingSaveTimer(),
        compactFullContent,
        compactMessage,
        compactTerminalTopicContext,
        directoryTopicIndexService: options.directoryTopicIndexService,
        enqueueExternalDeliveryForTerminalMessage,
        isOrdinaryToolSchemaElevationRequest,
        markRunFailed,
        modelPermissionApprovalRequest,
        notifyTaskTerminal,
        nowIso,
        nowMs,
        registerArtifactsFromText,
        removeThreadActiveRun,
        saveState,
        scheduleNextQueuedRunForTaskGroup,
        startEscalatedToolsetRetry: (thread, message, request, previousRunId) => (
          getToolsetEscalationRetryService().startEscalatedToolsetRetry(thread, message, request, previousRunId)
        ),
        stripPermissionApprovalMarkers,
        supplementGatewayUsage,
        threadSummary,
      });
    }
    return completionService;
  }

  function getDeltaEventService() {
    if (!deltaEventService) {
      deltaEventService = options.deltaEventService || createGatewayRunDeltaEventService({
        appendBounded,
        broadcast,
        broadcastMessageUpdated,
        maxMessageChars,
        nowIso,
        scheduleStreamingStateSave: () => getStreamingStateSaveService().scheduleStreamingStateSave(),
        threadSummary,
      });
    }
    return deltaEventService;
  }

  function getResponseCreatedService() {
    if (!responseCreatedService) {
      responseCreatedService = options.responseCreatedService || createGatewayRunResponseCreatedService({
        activeStreams,
        broadcastMessageUpdated,
        replaceThreadActiveRun,
        saveState,
      });
    }
    return responseCreatedService;
  }

  function getOutputEventService() {
    if (!outputEventService) {
      outputEventService = options.outputEventService || createGatewayRunOutputEventService({
        addThreadEvent,
        broadcast,
        broadcastMessageUpdated,
        compactFullContent,
        nowIso,
        nowMs,
        saveState,
        scheduleStreamingStateSave: () => getStreamingStateSaveService().scheduleStreamingStateSave(),
        threadSummary,
      });
    }
    return outputEventService;
  }

  function getStreamingStateSaveService() {
    if (!streamingStateSaveService) {
      streamingStateSaveService = options.streamingStateSaveService || createGatewayRunStreamingSaveService({
        clearTimeout: options.clearTimeout,
        logError,
        saveState,
        setTimeout: options.setTimeout,
        streamingSaveThrottleMs: options.streamingSaveThrottleMs,
      });
    }
    return streamingStateSaveService;
  }

  function markRunFailed(threadId, messageId, runId, err) {
    return getTerminalStateService().markRunFailed(threadId, messageId, runId, err);
  }

  function markRunCancelled(threadId, messageId, runId) {
    return getTerminalStateService().markRunCancelled(threadId, messageId, runId);
  }

  function applyHermesRunEvent(event = {}) {
    const context = resolveRunEventContext(event);
    const { eventName, runId, thread, message } = context;
    if (!thread || !message) return { action: "missing_target", eventName, runId };
    const lifecycleEvent = classifyGatewayRunLifecycleEvent(eventName);

    if (lifecycleEvent.phase === GATEWAY_RUN_EVENT_PHASES.RESPONSE_CREATED) {
      return getResponseCreatedService().markResponseCreated(context);
    }
    if (lifecycleEvent.phase === GATEWAY_RUN_EVENT_PHASES.TEXT_DELTA) {
      return getDeltaEventService().applyDelta(context, event);
    }
    if (lifecycleEvent.phase === GATEWAY_RUN_EVENT_PHASES.OUTPUT_ITEM) {
      const result = getOutputEventService().recordOutputItemEvent(context, event);
      if (context.eventName === "response.output_item.done" && outputItemLooksLikeFinalMessage(event)) {
        scheduleFinalMessageTerminalFallback(context, event);
      }
      return result;
    }
    if (lifecycleEvent.phase === GATEWAY_RUN_EVENT_PHASES.FINAL_MESSAGE_DONE) {
      const result = getOutputEventService().recordFinalMessageDoneEvent(context, event);
      scheduleFinalMessageTerminalFallback(context, event);
      return result;
    }

    addThreadEvent(thread, event);

    if (lifecycleEvent.terminalStatus === "done") {
      clearFinalMessageTerminalFallback(thread, message, runId);
      return getCompletionService().markRunCompleted(context, event);
    }
    if (lifecycleEvent.terminalStatus === "failed") {
      clearFinalMessageTerminalFallback(thread, message, runId);
      return markRunFailed(thread.id, message.id, runId, gatewayRunUserFacingErrorFromEvent(event));
    }
    if (lifecycleEvent.terminalStatus === "cancelled") {
      clearFinalMessageTerminalFallback(thread, message, runId);
      return markRunCancelled(thread.id, message.id, runId);
    }

    saveState();
    broadcast({ type: "run.event", threadId: thread.id, runId, event: thread.events?.[thread.events.length - 1], thread: threadSummary(thread) });
    return { action: "event", eventName };
  }

  function reconcileDetachedActiveRuns(reason = "Hermes Mobile restarted while this task was running; the result stream is no longer attached. Please rerun the task.") {
    return getTerminalStateService().reconcileDetachedActiveRuns(reason);
  }

  return Object.freeze({
    activeStreams,
    applyHermesRunEvent,
    extractCompletedOutput,
    findRunTarget,
    markRunCancelled,
    markRunFailed,
    reconcileDetachedActiveRuns,
    resolveRunEventContext,
  });
}

module.exports = {
  createGatewayRunEventService,
  extractCompletedOutput,
  findRunTargetInState,
};
