"use strict";

const { livenessDecisionAfterCheck } = require("./gateway-run-lifecycle-service");
const { modelStreamEventPreview } = require("./gateway-run-stream-event-service");

function createTimeoutSignal(abortSignal, timeoutMs) {
  if (!abortSignal || typeof abortSignal.timeout !== "function") return undefined;
  return abortSignal.timeout(Math.max(1000, timeoutMs));
}

function createGatewayRunStreamLivenessService(options = {}) {
  const activeStreamForRun = typeof options.activeStreamForRun === "function"
    ? options.activeStreamForRun
    : (() => null);
  const abortActiveStreamAsFailed = typeof options.abortActiveStreamAsFailed === "function"
    ? options.abortActiveStreamAsFailed
    : (() => false);
  const configuredForStream = typeof options.configuredForStream === "function"
    ? options.configuredForStream
    : ((_stream, _name, fallback = 0) => fallback);
  const emitRunStreamEvent = typeof options.emitRunStreamEvent === "function"
    ? options.emitRunStreamEvent
    : (() => false);
  const gatewayPool = typeof options.gatewayPool === "function"
    ? options.gatewayPool
    : (() => options.gatewayPool);
  const gatewayTargetForRun = typeof options.gatewayTargetForRun === "function"
    ? options.gatewayTargetForRun
    : (() => ({}));
  const livenessDecision = typeof options.livenessDecisionAfterCheck === "function"
    ? options.livenessDecisionAfterCheck
    : livenessDecisionAfterCheck;
  const logger = options.logger || console;
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : (() => Date.now());
  const abortSignal = options.abortSignal || AbortSignal;

  async function checkActiveStreamLiveness(publicRunId) {
    const stream = activeStreamForRun(publicRunId);
    if (!stream) return { action: "missing" };
    const now = nowMs();
    const runStartTimeoutMs = Math.max(0, configuredForStream(stream, "runStartTimeoutMs", 0));
    if (!stream.realRunId) {
      if (runStartTimeoutMs > 0 && now - Number(stream.startedAt || now) >= runStartTimeoutMs) {
        emitRunStreamEvent(publicRunId, "run.gateway_start_timeout", modelStreamEventPreview(
          "\u0047\u0061\u0074\u0065\u0077\u0061\u0079 \u672a\u521b\u5efa\u771f\u5b9e\u8fd0\u884c\uff0c\u51c6\u5907\u91ca\u653e\u961f\u5217",
          { timeout: `${Math.round(runStartTimeoutMs / 1000)}s` },
        ), { error: true });
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
        throw new Error("Gateway run stream liveness service requires gatewayPool.runnerFor");
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
        emitRunStreamEvent(publicRunId, "run.liveness_stale", modelStreamEventPreview(
          "\u0047\u0061\u0074\u0065\u0077\u0061\u0079 \u8fd0\u884c\u72b6\u6001\u8d85\u65f6\uff0c\u51c6\u5907\u91ca\u653e\u961f\u5217",
          { elapsed: `${Math.round(decision.elapsedMs / 1000)}s` },
        ), { error: true });
        abortActiveStreamAsFailed(publicRunId, `Hermes Gateway no longer reports run ${stream.realRunId} after ${Math.round(decision.elapsedMs / 1000)} seconds without response events; the Web task was marked stale and the queue was released.`);
        return decision;
      }
      if (decision.shouldWarn) {
        stream.lastLivenessWarningAt = decision.lastWarningAt;
        logger.warn?.(`Hermes Mobile run liveness check got 404 for ${stream.realRunId}; keeping the active stream open because long-running Gateway tools can be absent from /v1/runs.`);
        emitRunStreamEvent(publicRunId, "run.liveness_warning", "\u0047\u0061\u0074\u0065\u0077\u0061\u0079 \u6682\u65f6\u672a\u62a5\u544a\u8be5\u8fd0\u884c\uff1b\u4fdd\u6301\u7b49\u5f85");
      }
      return decision;
    }
  }

  return Object.freeze({
    checkActiveStreamLiveness,
  });
}

module.exports = {
  createGatewayRunStreamLivenessService,
  createTimeoutSignal,
};
