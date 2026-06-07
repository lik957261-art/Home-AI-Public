"use strict";

const { livenessDecisionAfterCheck } = require("./gateway-run-lifecycle-service");
const { gatewayRunUserFacingError } = require("./gateway-run-error-message-service");
const { createGatewayRunStreamRegistryService } = require("./gateway-run-stream-registry-service");

function cleanString(value) {
  return String(value || "").trim();
}

function defaultDedupe(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const text = cleanString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function readNumber(value, fallback = 0) {
  const raw = typeof value === "function" ? value() : value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function provider(value, fallback) {
  return typeof value === "function" ? value() : (value ?? fallback);
}

function responseRunIdFromEvent(event = {}) {
  return cleanString(event.response?.id || event.response_id || event.responseId || "");
}

function originalRunIdFromEvent(event = {}) {
  return cleanString(event.run_id || event.runId || "");
}

function eventNameFromEvent(event = {}) {
  return cleanString(event.event || event.type || "");
}

const WEB_SEARCH_TOOL_NAMES = new Set(["mobile_web_search", "web_search", "web_search_call"]);
const TERMINAL_GATEWAY_EVENTS = new Set([
  "response.completed",
  "run.completed",
  "response.failed",
  "run.failed",
  "response.incomplete",
  "run.cancelled",
]);

function outputItemFromEvent(event = {}) {
  return event.item || event.output_item || event.outputItem || {};
}

function toolCallNameFromEvent(event = {}) {
  if (eventNameFromEvent(event) !== "response.output_item.added") return "";
  const item = outputItemFromEvent(event);
  const itemType = cleanString(item.type || event.item_type || event.itemType).toLowerCase();
  const name = cleanString(
    item.name
    || item.function?.name
    || item.tool_name
    || item.toolName
    || event.name
    || event.tool_name
    || event.toolName,
  );
  if (name) return name;
  if (itemType === "web_search_call") return "web_search_call";
  return "";
}

function isWebSearchToolCall(name) {
  return WEB_SEARCH_TOOL_NAMES.has(cleanString(name).toLowerCase());
}

function outputItemHasMessageText(item = {}) {
  if (cleanString(item.type).toLowerCase() !== "message") return false;
  for (const part of Array.isArray(item.content) ? item.content : []) {
    if (part?.type === "output_text" && cleanString(part.text)) return true;
  }
  return false;
}

function safeErrorMessage(err) {
  return gatewayRunUserFacingError(err);
}

function modelStreamEventPreview(message, details = {}) {
  const suffix = Object.entries(details || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
  return suffix ? `${message} (${suffix})` : message;
}

function createTimeoutSignal(abortSignal, timeoutMs) {
  if (!abortSignal || typeof abortSignal.timeout !== "function") return undefined;
  return abortSignal.timeout(Math.max(1000, timeoutMs));
}

function createGatewayRunStreamService(options = {}) {
  const activeStreams = options.activeStreams instanceof Map ? options.activeStreams : new Map();
  const dedupe = typeof options.dedupe === "function" ? options.dedupe : defaultDedupe;
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
  const abortSignal = options.abortSignal || AbortSignal;
  const livenessDecision = typeof options.livenessDecisionAfterCheck === "function"
    ? options.livenessDecisionAfterCheck
    : livenessDecisionAfterCheck;
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

  function recordToolBudgetForEvent(publicRunId, event, stream) {
    const toolName = toolCallNameFromEvent(event);
    if (!stream || !isWebSearchToolCall(toolName)) return { action: "ignored" };
    const limit = Math.max(0, Math.floor(configuredForStream(stream, "webSearchMaxCalls", configured("webSearchMaxCalls", 0))));
    if (!limit) return { action: "disabled", tool: toolName };
    stream.toolBudgetCounters = stream.toolBudgetCounters || Object.create(null);
    const count = Math.max(0, Number(stream.toolBudgetCounters.webSearch || 0) || 0) + 1;
    stream.toolBudgetCounters.webSearch = count;
    if (count <= limit) {
      return { action: "counted", tool: toolName, group: "web_search", count, limit };
    }
    const reason = `Hermes Mobile stopped this run because ${toolName} exceeded the configured Web search limit (${count}/${limit}).`;
    const runId = stream.realRunId || publicRunId;
    emitRunStreamEvent(
      publicRunId,
      "run.tool_budget_exceeded",
      modelStreamEventPreview("\u7f51\u7edc\u641c\u7d22\u8d85\u8fc7\u8fd0\u884c\u9884\u7b97\uff0c\u5df2\u505c\u6b62\u8fd0\u884c", {
        tool: toolName,
        count,
        limit,
      }),
      { runId, error: true },
    );
    abortActiveStreamAsFailed(publicRunId, reason);
    return { action: "aborted", tool: toolName, group: "web_search", count, limit, reason };
  }

  function clearStreamTimers(stream) {
    if (!stream) return;
    if (stream.firstEventTimer) clearTimeoutFn(stream.firstEventTimer);
    stream.firstEventTimer = null;
  }

  function scheduleFirstEventWarning(publicRunId, stream) {
    const warningMs = Math.max(0, configuredForStream(stream, "modelFirstByteWarningMs", 45000));
    if (!warningMs || stream?.firstGatewayEventAt || stream?.failureReason) return;
    if (stream.firstEventTimer) clearTimeoutFn(stream.firstEventTimer);
    stream.firstEventTimer = setTimeoutFn(() => {
      const current = activeStreamForRun(publicRunId);
      if (!current || current.firstGatewayEventAt || current.failureReason) return;
      current.firstEventWarningCount = Math.max(0, Number(current.firstEventWarningCount || 0) || 0) + 1;
      const elapsedSeconds = Math.max(1, Math.round((nowMs() - Number(current.startedAt || nowMs())) / 1000));
      emitRunStreamEvent(
        publicRunId,
        "run.model_first_byte_retrying",
        modelStreamEventPreview("模型连接已等待首个流式事件，可能正在重试", {
          elapsed: `${elapsedSeconds}s`,
          attempt: current.firstEventWarningCount,
        }),
      );
      scheduleFirstEventWarning(publicRunId, current);
    }, warningMs);
    if (typeof stream.firstEventTimer?.unref === "function") stream.firstEventTimer.unref();
  }

  async function stopRunIds(runIds) {
    const stopped = [];
    const stopTimeoutMs = Math.max(1000, configured("stopTimeoutMs", Math.min(configured("apiTimeoutMs", 8000), 5000)));
    for (const runId of dedupe(runIds || [])) {
      const stream = activeStreamForRun(runId);
      if (stream?.controller) {
        stream.controller.abort();
        stopped.push(runId);
        continue;
      }
      try {
        const target = gatewayTargetForRun(runId);
        const pool = gatewayPool();
        if (!pool || typeof pool.runnerFor !== "function") {
          throw new Error("Gateway run stream service requires gatewayPool.runnerFor");
        }
        await pool.runnerFor(target).stopRun(runId, {
          gatewayUrl: target.apiBase,
          apiKey: target.apiKey,
          timeoutMs: stopTimeoutMs,
        });
      } catch (err) {
        if (Number(err?.status) !== 404) throw err;
      }
      stopped.push(runId);
    }
    return stopped;
  }

  async function checkActiveStreamLiveness(publicRunId) {
    const stream = activeStreamForRun(publicRunId);
    if (!stream) return { action: "missing" };
    const now = nowMs();
    const runStartTimeoutMs = Math.max(0, configuredForStream(stream, "runStartTimeoutMs", 0));
    if (!stream.realRunId) {
      if (runStartTimeoutMs > 0 && now - Number(stream.startedAt || now) >= runStartTimeoutMs) {
        emitRunStreamEvent(publicRunId, "run.gateway_start_timeout", modelStreamEventPreview("Gateway 未创建真实运行，准备释放队列", {
          timeout: `${Math.round(runStartTimeoutMs / 1000)}s`,
        }), { error: true });
        abortActiveStreamAsFailed(publicRunId, `Hermes Gateway did not create a run within ${Math.round(runStartTimeoutMs / 1000)} seconds; the queued task was released.`);
        return { action: "abort_start_timeout" };
      }
      return { action: "waiting_for_real_run" };
    }

    const checkAfterMs = Math.max(0, configuredForStream(stream, "runLivenessCheckAfterMs", 0));
    if (checkAfterMs > 0 && now - Number(stream.lastEventAt || now) < checkAfterMs) {
      return { action: "recent_event" };
    }

    try {
      const target = gatewayTargetForRun(publicRunId);
      const pool = gatewayPool();
      if (!pool || typeof pool.runnerFor !== "function") {
        throw new Error("Gateway run stream service requires gatewayPool.runnerFor");
      }
      await pool.runnerFor(target).checkRun(stream.realRunId, {
        gatewayUrl: target.apiBase,
        apiKey: target.apiKey,
        signal: createTimeoutSignal(abortSignal, configuredForStream(stream, "apiTimeoutMs", 30000)),
      });
      stream.livenessMisses = 0;
      stream.lastLivenessWarningAt = 0;
      return { action: "alive" };
    } catch (err) {
      const decision = livenessDecision({
        status: err?.status,
        error: err,
        nowMs: now,
        lastEventAtMs: stream.lastEventAt,
        staleAfterMs: configuredForStream(stream, "runLivenessStaleAfterMs", 0),
        livenessMisses: stream.livenessMisses,
        lastWarningAtMs: stream.lastLivenessWarningAt,
      });
      if (decision.action === "ignore_error") return decision;
      stream.livenessMisses = decision.livenessMisses;
      if (decision.shouldAbort) {
        emitRunStreamEvent(publicRunId, "run.liveness_stale", modelStreamEventPreview("Gateway 运行状态超时，准备释放队列", {
          elapsed: `${Math.round(decision.elapsedMs / 1000)}s`,
        }), { error: true });
        abortActiveStreamAsFailed(publicRunId, `Hermes Gateway no longer reports run ${stream.realRunId} after ${Math.round(decision.elapsedMs / 1000)} seconds without response events; the Web task was marked stale and the queue was released.`);
        return decision;
      }
      if (decision.shouldWarn) {
        stream.lastLivenessWarningAt = decision.lastWarningAt;
        logger.warn?.(`Hermes Mobile run liveness check got 404 for ${stream.realRunId}; keeping the active stream open because long-running Gateway tools can be absent from /v1/runs.`);
        emitRunStreamEvent(publicRunId, "run.liveness_warning", "Gateway 暂时未报告该运行；保持等待");
      }
      return decision;
    }
  }

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
    if (stream && TERMINAL_GATEWAY_EVENTS.has(eventName)) stream.terminalEventSeen = true;
    if (eventName === "response.created" && stream && responseRunId) {
      registerRunAlias(fallbackRunId || originalRunId || visibleRunId, responseRunId);
    }
    if (stream && !stream.firstGatewayEventAt) {
      stream.firstGatewayEventAt = nowMs();
      clearStreamTimers(stream);
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

  function handleStreamClosedWithoutTerminal(publicRunId, threadId, messageId) {
    const stream = activeStreamForRun(publicRunId);
    const visibleRunId = cleanString(stream?.realRunId || publicRunId);
    if (stream?.firstModelOutputAt) {
      emitRunStreamEvent(
        publicRunId,
        "run.stream_closed_without_terminal",
        modelStreamEventPreview(
          "\u6a21\u578b\u6d41\u7f3a\u5c11\u5b8c\u6210\u4e8b\u4ef6\uff0c\u5df2\u7528\u5df2\u6536\u5230\u7684\u5185\u5bb9\u5b8c\u6210\u56de\u6267",
          { recovery: "response.completed" },
        ),
        { runId: visibleRunId },
      );
      onHermesRunEvent({
        event: "response.completed",
        run_id: visibleRunId,
        response: { id: visibleRunId },
        output: "",
        hermes_mobile_synthetic: true,
        hermes_mobile_stream_recovery: true,
      });
      return { action: "completed_from_stream_output", runId: visibleRunId };
    }
    emitRunStreamEvent(
      publicRunId,
      "run.stream_closed_without_terminal",
      modelStreamEventPreview(
        "\u6a21\u578b\u6d41\u63d0\u524d\u7ed3\u675f\uff0c\u6ca1\u6709\u6536\u5230\u53ef\u7528\u8f93\u51fa\uff0c\u5df2\u91ca\u653e\u961f\u5217",
        { recovery: "cancelled" },
      ),
      { runId: visibleRunId, error: true },
    );
    markRunCancelled(threadId, messageId, visibleRunId);
    return { action: "cancelled_without_output", runId: visibleRunId };
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
        clearStreamTimers(stream);
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
