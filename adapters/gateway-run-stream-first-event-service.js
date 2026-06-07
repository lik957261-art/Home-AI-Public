"use strict";

const { modelStreamEventPreview } = require("./gateway-run-stream-event-service");

function readNumber(value, fallback = 0) {
  const raw = typeof value === "function" ? value() : value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createGatewayRunStreamFirstEventService(options = {}) {
  const activeStreamForRun = typeof options.activeStreamForRun === "function"
    ? options.activeStreamForRun
    : (() => null);
  const clearTimeoutFn = typeof options.clearTimeout === "function" ? options.clearTimeout : clearTimeout;
  const configuredForStream = typeof options.configuredForStream === "function"
    ? options.configuredForStream
    : ((_stream, _name, fallback = 0) => fallback);
  const emitRunStreamEvent = typeof options.emitRunStreamEvent === "function"
    ? options.emitRunStreamEvent
    : (() => false);
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : (() => Date.now());
  const setTimeoutFn = typeof options.setTimeout === "function" ? options.setTimeout : setTimeout;

  function clearFirstEventTimer(stream) {
    if (!stream) return false;
    if (stream.firstEventTimer) clearTimeoutFn(stream.firstEventTimer);
    stream.firstEventTimer = null;
    return true;
  }

  function scheduleFirstEventWarning(publicRunId, stream) {
    if (!stream) return null;
    const warningMs = Math.max(0, readNumber(
      configuredForStream(stream, "modelFirstByteWarningMs", 45000),
      45000,
    ));
    if (!warningMs || stream.firstGatewayEventAt || stream.failureReason) return null;
    clearFirstEventTimer(stream);
    stream.firstEventTimer = setTimeoutFn(() => {
      const current = activeStreamForRun(publicRunId);
      if (!current || current.firstGatewayEventAt || current.failureReason) return;
      current.firstEventWarningCount = Math.max(0, Number(current.firstEventWarningCount || 0) || 0) + 1;
      const elapsedSeconds = Math.max(1, Math.round((nowMs() - Number(current.startedAt || nowMs())) / 1000));
      emitRunStreamEvent(
        publicRunId,
        "run.model_first_byte_retrying",
        modelStreamEventPreview(
          "\u6a21\u578b\u8fde\u63a5\u5df2\u7b49\u5f85\u9996\u4e2a\u6d41\u5f0f\u4e8b\u4ef6\uff0c\u53ef\u80fd\u6b63\u5728\u91cd\u8bd5",
          { elapsed: `${elapsedSeconds}s`, attempt: current.firstEventWarningCount },
        ),
      );
      scheduleFirstEventWarning(publicRunId, current);
    }, warningMs);
    if (typeof stream.firstEventTimer?.unref === "function") stream.firstEventTimer.unref();
    return stream.firstEventTimer;
  }

  return Object.freeze({
    clearFirstEventTimer,
    scheduleFirstEventWarning,
  });
}

module.exports = {
  createGatewayRunStreamFirstEventService,
};
