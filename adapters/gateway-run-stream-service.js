"use strict";

const { livenessDecisionAfterCheck } = require("./gateway-run-lifecycle-service");

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
  const gatewayUrlForRunFallback = typeof options.gatewayUrlForRun === "function"
    ? options.gatewayUrlForRun
    : (() => "");
  const onHermesRunEvent = typeof options.onHermesRunEvent === "function"
    ? options.onHermesRunEvent
    : (() => {});
  const markRunFailed = typeof options.markRunFailed === "function" ? options.markRunFailed : (() => {});
  const markRunCancelled = typeof options.markRunCancelled === "function" ? options.markRunCancelled : (() => {});
  const setIntervalFn = typeof options.setInterval === "function" ? options.setInterval : setInterval;
  const clearIntervalFn = typeof options.clearInterval === "function" ? options.clearInterval : clearInterval;
  const abortControllerFactory = typeof options.abortControllerFactory === "function"
    ? options.abortControllerFactory
    : (() => new AbortController());
  const abortSignal = options.abortSignal || AbortSignal;
  const livenessDecision = typeof options.livenessDecisionAfterCheck === "function"
    ? options.livenessDecisionAfterCheck
    : livenessDecisionAfterCheck;

  function configured(name, fallback = 0) {
    return readNumber(options[name], fallback);
  }

  function configuredForStream(stream, name, fallback = 0) {
    const value = stream && Object.prototype.hasOwnProperty.call(stream, name)
      ? stream[name]
      : options[name];
    return readNumber(value, fallback);
  }

  function activeStreamForRun(runId) {
    return activeStreams.get(cleanString(runId));
  }

  function activeStreamCount() {
    return new Set(activeStreams.values()).size;
  }

  function gatewayUrlForRun(runId) {
    const active = activeStreamForRun(runId);
    if (active?.gatewayUrl) return active.gatewayUrl;
    return cleanString(gatewayUrlForRunFallback(runId));
  }

  function gatewayTargetFromActiveStream(active) {
    if (!active?.gatewayUrl) return null;
    return {
      apiBase: active.gatewayUrl,
      apiKey: active.gatewayApiKey || "",
      name: active.gatewayName || "",
      profile: active.gatewayProfile || "",
      pooled: active.gatewaySource === "worker_pool",
      source: active.gatewaySource || "",
    };
  }

  function gatewayTargetForRun(runId) {
    const activeTarget = gatewayTargetFromActiveStream(activeStreamForRun(runId));
    if (activeTarget) return activeTarget;
    const pool = gatewayPool();
    if (!pool || typeof pool.targetForGatewayUrl !== "function") {
      throw new Error("Gateway run stream service requires gatewayPool.targetForGatewayUrl");
    }
    return pool.targetForGatewayUrl(gatewayUrlForRun(runId));
  }

  function registerActiveStream(runId, streamState = {}) {
    const id = cleanString(runId);
    if (!id) throw new Error("runId is required");
    activeStreams.set(id, streamState);
    return streamState;
  }

  function registerRunAlias(publicRunId, realRunId) {
    const publicId = cleanString(publicRunId);
    const realId = cleanString(realRunId);
    if (!publicId || !realId || publicId === realId) return activeStreamForRun(publicId) || null;
    const stream = activeStreamForRun(publicId);
    if (!stream) return null;
    stream.realRunId = realId;
    activeStreams.set(realId, stream);
    return stream;
  }

  function cleanupRunAliases(runId) {
    const id = cleanString(runId);
    if (!id) return 0;
    const stream = activeStreamForRun(id);
    if (!stream) {
      return activeStreams.delete(id) ? 1 : 0;
    }
    let removed = 0;
    for (const [key, value] of [...activeStreams.entries()]) {
      if (value !== stream) continue;
      activeStreams.delete(key);
      removed += 1;
    }
    return removed;
  }

  function abortActiveStreamAsFailed(publicRunId, reason) {
    const stream = activeStreamForRun(publicRunId);
    if (!stream || stream.failureReason) return false;
    stream.failureReason = cleanString(reason);
    try {
      stream.controller?.abort?.();
    } catch (_) {}
    return true;
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
        abortActiveStreamAsFailed(publicRunId, `Hermes Gateway no longer reports run ${stream.realRunId} after ${Math.round(decision.elapsedMs / 1000)} seconds without response events; the Web task was marked stale and the queue was released.`);
        return decision;
      }
      if (decision.shouldWarn) {
        stream.lastLivenessWarningAt = decision.lastWarningAt;
        logger.warn?.(`Hermes Mobile run liveness check got 404 for ${stream.realRunId}; keeping the active stream open because long-running Gateway tools can be absent from /v1/runs.`);
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
    if (eventName === "response.created" && stream && responseRunId) {
      registerRunAlias(fallbackRunId || originalRunId || visibleRunId, responseRunId);
    }
    const forwardedRunId = eventName === "response.created"
      ? (fallbackRunId || originalRunId || visibleRunId)
      : (responseRunId || stream?.realRunId || visibleRunId || fallbackRunId);
    onHermesRunEvent(Object.assign({}, event, { run_id: forwardedRunId || fallbackRunId || visibleRunId }));
    return { eventName, originalRunId, responseRunId, runId: visibleRunId, stream: stream || null };
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
    if (!id || activeStreams.has(id)) return null;
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
      apiTimeoutMs: streamOptions.apiTimeoutMs,
      runStartTimeoutMs: streamOptions.runStartTimeoutMs,
      runLivenessCheckAfterMs: streamOptions.runLivenessCheckAfterMs,
      runLivenessStaleAfterMs: streamOptions.runLivenessStaleAfterMs,
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
    activeStreams.set(id, streamState);
    readResponseEvents(id, body, controller.signal)
      .then(() => {
        const stream = activeStreamForRun(id);
        const visibleRunId = stream?.realRunId || id;
        markRunFailed(threadId, messageId, visibleRunId, new Error("Hermes stream ended without a terminal completion event; please rerun the task."));
      })
      .catch((err) => {
        const stream = activeStreamForRun(id);
        const visibleRunId = stream?.realRunId || id;
        if (controller.signal?.aborted && stream?.failureReason) markRunFailed(threadId, messageId, visibleRunId, new Error(stream.failureReason));
        else if (controller.signal?.aborted) markRunCancelled(threadId, messageId, visibleRunId);
        else markRunFailed(threadId, messageId, visibleRunId, err);
      })
      .finally(() => {
        const stream = activeStreamForRun(id);
        if (stream?.livenessTimer) clearIntervalFn(stream.livenessTimer);
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
