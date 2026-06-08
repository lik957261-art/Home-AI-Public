"use strict";

const {
  extractGatewayRunIds,
  withActiveRunRemoved,
  withActiveRunReplaced,
} = require("./gateway-run-lifecycle-service");
const {
  createGatewayRunCompletionService,
  extractCompletedOutput,
} = require("./gateway-run-completion-service");
const {
  extractOutputItemText,
  loadedSkillFromRunEvent,
  loadedToolFromRunEvent,
  loadedToolFromOutputItem,
  mergeLoadedSkills,
  mergeLoadedTools,
  outputItemCallId,
  outputItemFunctionName,
  outputItemPreview,
  outputItemToolName,
  runToolNameForCallId,
} = require("./gateway-run-evidence-service");
const { createGatewayRunTerminalStateService } = require("./gateway-run-terminal-state-service");
const { createGatewayRunResponseCreatedService } = require("./gateway-run-response-created-service");
const { createGatewayRunToolsetEscalationRetryService } = require("./gateway-run-toolset-escalation-retry-service");
const {
  parseToolsetEscalationRequest,
  sanitizeToolsetEscalationVisibleText,
} = require("./gateway-run-toolset-escalation-service");

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

  const appendBounded = typeof options.appendBounded === "function" ? options.appendBounded : defaultAppendBounded;
  const compactFullContent = typeof options.compactFullContent === "function"
    ? options.compactFullContent
    : ((value) => defaultAppendBounded("", value, maxMessageChars));
  const saveState = typeof options.saveState === "function" ? options.saveState : (() => {});
  const setTimer = typeof options.setTimeout === "function" ? options.setTimeout : setTimeout;
  const clearTimer = typeof options.clearTimeout === "function" ? options.clearTimeout : clearTimeout;
  const streamingSaveThrottleMs = Math.max(0, Number(options.streamingSaveThrottleMs ?? 1200) || 0);
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
  const notifyTaskTerminal = typeof options.notifyTaskTerminal === "function"
    ? options.notifyTaskTerminal
    : ((thread, message, status) => options.webPushDeliveryService?.notifyTaskTerminal?.(thread, message, status));
  let streamingSaveTimer = null;
  let streamingSavePending = false;
  let completionService = null;
  let responseCreatedService = null;
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

  function clearStreamingSaveTimer() {
    if (streamingSaveTimer) clearTimer(streamingSaveTimer);
    streamingSaveTimer = null;
    streamingSavePending = false;
  }

  function scheduleStreamingStateSave() {
    if (!streamingSaveThrottleMs) {
      saveState();
      return;
    }
    if (streamingSavePending) return;
    streamingSavePending = true;
    streamingSaveTimer = setTimer(() => {
      streamingSaveTimer = null;
      streamingSavePending = false;
      try {
        saveState();
      } catch (err) {
        logError(`Hermes Mobile streaming state save failed: ${err.message || String(err)}`);
      }
    }, streamingSaveThrottleMs);
    if (streamingSaveTimer && typeof streamingSaveTimer.unref === "function") streamingSaveTimer.unref();
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
        clearStreamingSaveTimer,
        compactMessage,
        compactTerminalTopicContext,
        enqueueExternalDeliveryForTerminalMessage,
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
        clearStreamingSaveTimer,
        compactFullContent,
        compactMessage,
        compactTerminalTopicContext,
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

  function applyDelta(context, event) {
    const { thread, message } = context;
    const delta = String(event.delta || event.text || "");
    if (!delta) return { action: "empty_delta" };
    const feedbackAt = nowIso();
    const previousContent = String(message.content || "");
    const combinedContent = appendBounded(previousContent, delta, maxMessageChars);
    const sanitized = sanitizeToolsetEscalationVisibleText(combinedContent);
    if (sanitized.found) {
      const pendingRequest = parseToolsetEscalationRequest(combinedContent, message);
      if (pendingRequest) message.pendingToolsetEscalationRequest = pendingRequest;
      message.content = sanitized.text;
    } else {
      message.content = combinedContent;
    }
    if (!message.firstFeedbackAt) message.firstFeedbackAt = feedbackAt;
    message.updatedAt = feedbackAt;
    thread.updatedAt = feedbackAt;
    scheduleStreamingStateSave();
    const visibleDelta = sanitized.found && message.content.startsWith(previousContent)
      ? message.content.slice(previousContent.length)
      : delta;
    if (sanitized.found && !visibleDelta) {
      broadcastMessageUpdated(thread, message);
      return { action: "delta_suppressed_toolset_escalation" };
    }
    broadcast({
      type: "message.delta",
      threadId: thread.id,
      messageId: message.id,
      delta: visibleDelta,
      firstFeedbackAt: message.firstFeedbackAt,
      updatedAt: message.updatedAt,
      thread: threadSummary(thread),
    });
    return { action: sanitized.found ? "delta_sanitized_toolset_escalation" : "delta", delta: visibleDelta };
  }

  function applyMessageOutputText(context, text, source = "message_output") {
    const { thread, message } = context;
    const value = String(text || "");
    if (!value) return { action: `empty_${source}` };
    const feedbackAt = nowIso();
    const sanitized = sanitizeToolsetEscalationVisibleText(value);
    if (sanitized.found) {
      const pendingRequest = parseToolsetEscalationRequest(value, message);
      if (pendingRequest) message.pendingToolsetEscalationRequest = pendingRequest;
      message.content = compactFullContent(sanitized.text);
    } else {
      message.content = compactFullContent(value);
    }
    if (!message.firstFeedbackAt) message.firstFeedbackAt = feedbackAt;
    message.updatedAt = feedbackAt;
    thread.updatedAt = feedbackAt;
    scheduleStreamingStateSave();
    broadcastMessageUpdated(thread, message);
    return { action: sanitized.found ? `${source}_sanitized_toolset_escalation` : source };
  }

  function recordOutputItemEvent(context, event) {
    const { thread, runId, eventName, message, responseRunId, stream } = context;
    const eventRunId = cleanString(message?.runId || responseRunId || stream?.realRunId || runId);
    const item = event.item || event.output_item || event.outputItem || {};
    const tool = outputItemToolName(item);
    let preview = outputItemPreview(item);
    if (cleanString(tool).toLowerCase() === "function_call_output") {
      const callId = outputItemCallId(item);
      const name = outputItemFunctionName(item)
        || runToolNameForCallId(thread, eventRunId, callId)
        || runToolNameForCallId(thread, runId, callId);
      preview = (name || callId) ? JSON.stringify({ name, callId }) : "";
    }
    addThreadEvent(thread, {
      event: eventName,
      timestamp: nowMs() / 1000,
      runId: eventRunId || runId,
      tool,
      preview,
      error: false,
    });
    const loadedSkill = loadedSkillFromRunEvent({ tool, preview });
    if (loadedSkill) message.loadedSkills = mergeLoadedSkills(message.loadedSkills, loadedSkill);
    const loadedTool = loadedToolFromRunEvent({ tool, preview }) || loadedToolFromOutputItem(item);
    if (loadedTool) message.loadedTools = mergeLoadedTools(message.loadedTools, loadedTool);
    const outputText = extractOutputItemText(item);
    if (outputText) applyMessageOutputText(context, outputText, "output_item_text");
    saveState();
    broadcast({ type: "run.event", threadId: thread.id, runId: eventRunId || runId, event: thread.events?.[thread.events.length - 1], thread: threadSummary(thread) });
    if (eventName === "response.output_item.added" && cleanString(tool).toLowerCase() === "message") {
      addThreadEvent(thread, {
        event: "run.final_message_started",
        timestamp: nowMs() / 1000,
        runId: eventRunId || runId,
        tool: "message",
        preview: "",
        error: false,
      });
      saveState();
      broadcast({ type: "run.event", threadId: thread.id, runId: eventRunId || runId, event: thread.events?.[thread.events.length - 1], thread: threadSummary(thread) });
    }
    return { action: "output_item" };
  }

  function recordFinalMessageDoneEvent(context, event = {}) {
    const { thread, runId, message, responseRunId, stream } = context;
    const eventRunId = cleanString(message?.runId || responseRunId || stream?.realRunId || runId);
    const finalText = String(event.text || "");
    if (finalText) applyMessageOutputText(context, finalText, "output_text_done");
    addThreadEvent(thread, {
      event: "run.final_message_done",
      timestamp: nowMs() / 1000,
      runId: eventRunId || runId,
      tool: "message",
      preview: "",
      error: false,
    });
    saveState();
    broadcast({ type: "run.event", threadId: thread.id, runId: eventRunId || runId, event: thread.events?.[thread.events.length - 1], thread: threadSummary(thread) });
    return { action: "final_message_done" };
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

    if (eventName === "response.created") return getResponseCreatedService().markResponseCreated(context);
    if (eventName === "message.delta" || eventName === "response.output_text.delta") return applyDelta(context, event);
    if (eventName === "response.output_item.added" || eventName === "response.output_item.done") {
      return recordOutputItemEvent(context, event);
    }
    if (eventName === "response.output_text.done") return recordFinalMessageDoneEvent(context, event);

    addThreadEvent(thread, event);

    if (eventName === "run.completed" || eventName === "response.completed") return getCompletionService().markRunCompleted(context, event);
    if (eventName === "run.failed" || eventName === "response.failed") {
      return markRunFailed(thread.id, message.id, runId, event.error || "run failed");
    }
    if (eventName === "run.cancelled" || eventName === "response.incomplete") {
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
