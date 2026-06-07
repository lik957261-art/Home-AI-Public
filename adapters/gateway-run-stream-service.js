"use strict";

const { gatewayRunUserFacingError } = require("./gateway-run-error-message-service");
const { createGatewayRunStreamEventService } = require("./gateway-run-stream-event-service");
const { createGatewayRunStreamCloseRecoveryService } = require("./gateway-run-stream-close-recovery-service");
const { createGatewayRunStreamFirstEventService } = require("./gateway-run-stream-first-event-service");
const { createGatewayRunStreamLivenessService } = require("./gateway-run-stream-liveness-service");
const { createGatewayRunStreamRegistryService } = require("./gateway-run-stream-registry-service");
const { createGatewayRunStreamStopService } = require("./gateway-run-stream-stop-service");

function cleanString(value) {
  return String(value || "").trim();
}

function readNumber(value, fallback = 0) {
  const raw = typeof value === "function" ? value() : value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function provider(value, fallback) {
  return typeof value === "function" ? value() : (value ?? fallback);
}

function safeErrorMessage(err) {
  return gatewayRunUserFacingError(err);
}

function createGatewayRunStreamService(options = {}) {
  const activeStreams = options.activeStreams instanceof Map ? options.activeStreams : new Map();
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : (() => Date.now());
  const logger = options.logger || console;
  const gatewayPool = typeof options.gatewayPool === "function"
    ? options.gatewayPool
    : (() => options.gatewayPool);
  const singleGatewayRunner = typeof options.singleGatewayRunner === "function"
    ? options.singleGatewayRunner
    : (() => options.singleGatewayRunner);
  const onHermesRunEvent = typeof options.onHermesRunEvent === "function"
    ? options.onHermesRunEvent
    : (() => {});
  const markRunFailed = typeof options.markRunFailed === "function" ? options.markRunFailed : (() => {});
  const markRunCancelled = typeof options.markRunCancelled === "function" ? options.markRunCancelled : (() => {});
  const setIntervalFn = typeof options.setInterval === "function" ? options.setInterval : setInterval;
  const clearIntervalFn = typeof options.clearInterval === "function" ? options.clearInterval : clearInterval;
  const setTimeoutFn = typeof options.setTimeout === "function" ? options.setTimeout : setTimeout;
  const clearTimeoutFn = typeof options.clearTimeout === "function" ? options.clearTimeout : clearTimeout;
  const abortControllerFactory = typeof options.abortControllerFactory === "function"
    ? options.abortControllerFactory
    : (() => new AbortController());
  const streamRegistryService = options.streamRegistryService || createGatewayRunStreamRegistryService({
    activeStreams,
    gatewayPool,
    gatewayUrlForRun: options.gatewayUrlForRun,
  });
  const activeStreamForRun = (...args) => streamRegistryService.activeStreamForRun(...args);
  const activeStreamCount = (...args) => streamRegistryService.activeStreamCount(...args);
  const gatewayUrlForRun = (...args) => streamRegistryService.gatewayUrlForRun(...args);
  const gatewayTargetForRun = (...args) => streamRegistryService.gatewayTargetForRun(...args);
  const registerActiveStream = (...args) => streamRegistryService.registerActiveStream(...args);
  const registerRunAlias = (...args) => streamRegistryService.registerRunAlias(...args);
  const cleanupRunAliases = (...args) => streamRegistryService.cleanupRunAliases(...args);
  const abortActiveStreamAsFailed = (...args) => streamRegistryService.abortActiveStreamAsFailed(...args);

  function configured(name, fallback = 0) {
    return readNumber(options[name], fallback);
  }

  function configuredForStream(stream, name, fallback = 0) {
    const value = stream && Object.prototype.hasOwnProperty.call(stream, name)
      ? stream[name]
      : options[name];
    return readNumber(value, fallback);
  }

  function emitRunStreamEvent(publicRunId, eventName, preview = "", eventOptions = {}) {
    const publicId = cleanString(publicRunId);
    const stream = activeStreamForRun(publicId);
    const runId = cleanString(eventOptions.runId || stream?.realRunId || publicId);
    if (!runId) return false;
    onHermesRunEvent({
      event: eventName,
      run_id: runId,
      timestamp: nowMs() / 1000,
      tool: "hermes_mobile",
      preview: cleanString(preview),
      error: Boolean(eventOptions.error),
      hermes_mobile_synthetic: true,
    });
    return true;
  }

  const streamEventService = options.streamEventService || createGatewayRunStreamEventService({
    abortActiveStreamAsFailed,
    emitRunStreamEvent,
    webSearchMaxCallsForStream: (stream) => configuredForStream(
      stream,
      "webSearchMaxCalls",
      configured("webSearchMaxCalls", 0),
    ),
  });
  const eventNameFromEvent = (...args) => streamEventService.eventNameFromEvent(...args);
  const originalRunIdFromEvent = (...args) => streamEventService.originalRunIdFromEvent(...args);
  const responseRunIdFromEvent = (...args) => streamEventService.responseRunIdFromEvent(...args);
  const outputItemFromEvent = (...args) => streamEventService.outputItemFromEvent(...args);
  const outputItemHasMessageText = (...args) => streamEventService.outputItemHasMessageText(...args);
  const isTerminalGatewayEvent = (...args) => streamEventService.isTerminalGatewayEvent(...args);
  const recordToolBudgetForEvent = (...args) => streamEventService.recordToolBudgetForEvent(...args);
  const streamLivenessService = options.streamLivenessService || createGatewayRunStreamLivenessService({
    abortActiveStreamAsFailed,
    abortSignal: options.abortSignal || AbortSignal,
    activeStreamForRun,
    configuredForStream,
    emitRunStreamEvent,
    gatewayPool,
    gatewayTargetForRun,
    livenessDecisionAfterCheck: options.livenessDecisionAfterCheck,
    logger,
    nowMs,
  });
  const checkActiveStreamLiveness = (...args) => streamLivenessService.checkActiveStreamLiveness(...args);
  const streamCloseRecoveryService = options.streamCloseRecoveryService || createGatewayRunStreamCloseRecoveryService({
    activeStreamForRun,
    emitRunStreamEvent,
    markRunCancelled,
    onHermesRunEvent,
  });
  const handleStreamClosedWithoutTerminal = (...args) => (
    streamCloseRecoveryService.handleStreamClosedWithoutTerminal(...args)
  );
  const streamStopService = options.streamStopService || createGatewayRunStreamStopService({
    activeStreamForRun,
    apiTimeoutMs: options.apiTimeoutMs,
    dedupe: options.dedupe,
    gatewayPool,
    gatewayTargetForRun,
    stopTimeoutMs: options.stopTimeoutMs,
  });
  const stopRunIds = (...args) => streamStopService.stopRunIds(...args);
  const streamFirstEventService = options.streamFirstEventService || createGatewayRunStreamFirstEventService({
    activeStreamForRun,
    clearTimeout: clearTimeoutFn,
    configuredForStream,
    emitRunStreamEvent,
    nowMs,
    setTimeout: setTimeoutFn,
  });
  const clearFirstEventTimer = (...args) => streamFirstEventService.clearFirstEventTimer(...args);
  const scheduleFirstEventWarning = (...args) => streamFirstEventService.scheduleFirstEventWarning(...args);

  function recordGatewayEvent(runId, event = {}) {
    const fallbackRunId = cleanString(runId);
    const eventName = eventNameFromEvent(event);
    const originalRunId = originalRunIdFromEvent(event);
    const responseRunId = responseRunIdFromEvent(event);
    const visibleRunId = eventName === "response.created"
      ? (originalRunId || fallbackRunId || responseRunId)
      : (responseRunId || originalRunId || fallbackRunId);
    const stream = activeStreamForRun(visibleRunId)
      || activeStreamForRun(originalRunId)
      || activeStreamForRun(responseRunId)
      || activeStreamForRun(fallbackRunId);
    if (stream) stream.lastEventAt = nowMs();
    if (stream && isTerminalGatewayEvent(eventName)) stream.terminalEventSeen = true;
    if (eventName === "response.created" && stream && responseRunId) {
      registerRunAlias(fallbackRunId || originalRunId || visibleRunId, responseRunId);
    }
    if (stream && !stream.firstGatewayEventAt) {
      stream.firstGatewayEventAt = nowMs();
      clearFirstEventTimer(stream);
      emitRunStreamEvent(fallbackRunId || originalRunId || visibleRunId, "run.model_stream_started", "已收到模型流式事件");
    }
    const item = outputItemFromEvent(event);
    const eventCarriesModelText = (
      eventName === "message.delta"
      || eventName === "response.output_text.delta"
      || (eventName === "response.output_text.done" && cleanString(event.text))
      || ((eventName === "response.output_item.added" || eventName === "response.output_item.done") && outputItemHasMessageText(item))
    );
    if (stream && !stream.firstModelOutputAt && eventCarriesModelText) {
      stream.firstModelOutputAt = nowMs();
      emitRunStreamEvent(fallbackRunId || originalRunId || visibleRunId, "run.model_output_started", "模型已开始输出文本");
    }
    const publicRunId = fallbackRunId || originalRunId || visibleRunId || responseRunId;
    const toolBudget = stream ? recordToolBudgetForEvent(publicRunId, event, stream) : { action: "missing_stream" };
    const forwardedRunId = eventName === "response.created"
      ? (fallbackRunId || originalRunId || visibleRunId)
      : (responseRunId || stream?.realRunId || visibleRunId || fallbackRunId);
    onHermesRunEvent(Object.assign({}, event, { run_id: forwardedRunId || fallbackRunId || visibleRunId }));
    return { eventName, originalRunId, responseRunId, runId: visibleRunId, stream: stream || null, toolBudget };
  }

  async function readResponseEvents(runId, body, signal) {
    const target = gatewayTargetForRun(runId);
    const pool = gatewayPool();
    if (!pool || typeof pool.runnerFor !== "function") {
      throw new Error("Gateway run stream service requires gatewayPool.runnerFor");
    }
    return pool.runnerFor(target).streamResponses(body, {
      signal,
      gatewayUrl: target.apiBase,
      apiKey: target.apiKey,
      onEvent: (event) => recordGatewayEvent(runId, event),
    });
  }

  function streamResponse(runId, threadId, messageId, body, streamOptions = {}) {
    const id = cleanString(runId);
    if (!id || activeStreamForRun(id)) return null;
    const controller = streamOptions.controller || abortControllerFactory();
    const defaultRunner = provider(singleGatewayRunner, null);
    const startedAt = nowMs();
    const streamState = {
      threadId,
      messageId,
      controller,
      engine: "responses",
      gatewayUrl: streamOptions.gatewayUrl || defaultRunner?.apiBase?.() || "",
      gatewayApiKey: streamOptions.gatewayApiKey || "",
      gatewayName: streamOptions.gatewayName || "",
      gatewayProfile: streamOptions.gatewayProfile || "",
      gatewaySource: streamOptions.gatewaySource || "",
      startedAt,
      lastEventAt: startedAt,
      livenessTimer: null,
      livenessMisses: 0,
      lastLivenessWarningAt: 0,
      failureReason: "",
      firstGatewayEventAt: 0,
      firstModelOutputAt: 0,
      firstEventWarningCount: 0,
      firstEventTimer: null,
      terminalEventSeen: false,
      apiTimeoutMs: streamOptions.apiTimeoutMs,
      modelFirstByteWarningMs: streamOptions.modelFirstByteWarningMs,
      runStartTimeoutMs: streamOptions.runStartTimeoutMs,
      runLivenessCheckAfterMs: streamOptions.runLivenessCheckAfterMs,
      runLivenessStaleAfterMs: streamOptions.runLivenessStaleAfterMs,
      webSearchMaxCalls: streamOptions.webSearchMaxCalls,
      toolBudgetCounters: Object.create(null),
    };
    const livenessIntervalMs = Math.max(0, configured("runLivenessCheckIntervalMs", 0));
    if (livenessIntervalMs > 0) {
      streamState.livenessTimer = setIntervalFn(() => {
        checkActiveStreamLiveness(id).catch((err) => {
          logger.error?.(`Hermes Mobile run liveness check failed: ${err.message || String(err)}`);
        });
      }, Math.max(5000, livenessIntervalMs));
      if (typeof streamState.livenessTimer?.unref === "function") streamState.livenessTimer.unref();
    }
    registerActiveStream(id, streamState);
    scheduleFirstEventWarning(id, streamState);
    readResponseEvents(id, body, controller.signal)
      .then(() => {
        const stream = activeStreamForRun(id);
        const visibleRunId = stream?.realRunId || id;
        if (controller.signal?.aborted && stream?.failureReason) {
          markRunFailed(threadId, messageId, visibleRunId, new Error(stream.failureReason));
        } else if (controller.signal?.aborted) {
          markRunCancelled(threadId, messageId, visibleRunId);
        } else if (stream?.terminalEventSeen) {
          return;
        } else {
          handleStreamClosedWithoutTerminal(id, threadId, messageId);
        }
      })
      .catch((err) => {
        const stream = activeStreamForRun(id);
        const visibleRunId = stream?.realRunId || id;
        emitRunStreamEvent(id, "run.stream_failed", safeErrorMessage(err), { runId: visibleRunId, error: true });
        if (controller.signal?.aborted && stream?.failureReason) markRunFailed(threadId, messageId, visibleRunId, new Error(stream.failureReason));
        else if (controller.signal?.aborted) markRunCancelled(threadId, messageId, visibleRunId);
        else markRunFailed(threadId, messageId, visibleRunId, err);
      })
      .finally(() => {
        const stream = activeStreamForRun(id);
        if (stream?.livenessTimer) clearIntervalFn(stream.livenessTimer);
        clearFirstEventTimer(stream);
        cleanupRunAliases(id);
      });
    return streamState;
  }

  return {
    activeStreamCount,
    activeStreamForRun,
    activeStreams,
    abortActiveStreamAsFailed,
    checkActiveStreamLiveness,
    cleanupRunAliases,
    gatewayTargetForRun,
    gatewayUrlForRun,
    readResponseEvents,
    recordGatewayEvent,
    registerActiveStream,
    registerRunAlias,
    stopRunIds,
    streamResponse,
  };
}

module.exports = {
  createGatewayRunStreamService,
};
