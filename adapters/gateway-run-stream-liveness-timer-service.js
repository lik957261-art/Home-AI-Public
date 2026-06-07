"use strict";

function readIntervalMs(configured) {
  return Math.max(0, Number(configured("runLivenessCheckIntervalMs", 0)) || 0);
}

function createGatewayRunStreamLivenessTimerService(options = {}) {
  const checkActiveStreamLiveness = typeof options.checkActiveStreamLiveness === "function"
    ? options.checkActiveStreamLiveness
    : (async () => ({ action: "missing" }));
  const clearIntervalFn = typeof options.clearInterval === "function" ? options.clearInterval : clearInterval;
  const configured = typeof options.configured === "function" ? options.configured : (() => 0);
  const logger = options.logger || console;
  const setIntervalFn = typeof options.setInterval === "function" ? options.setInterval : setInterval;

  function scheduleLivenessTimer(publicRunId, stream) {
    if (!stream) return null;
    const intervalMs = readIntervalMs(configured);
    if (intervalMs <= 0) return null;
    const timer = setIntervalFn(() => {
      Promise.resolve(checkActiveStreamLiveness(publicRunId)).catch((err) => {
        logger.error?.(`Hermes Mobile run liveness check failed: ${err.message || String(err)}`);
      });
    }, Math.max(5000, intervalMs));
    if (typeof timer?.unref === "function") timer.unref();
    stream.livenessTimer = timer;
    return timer;
  }

  function clearLivenessTimer(stream) {
    if (!stream?.livenessTimer) return false;
    clearIntervalFn(stream.livenessTimer);
    stream.livenessTimer = null;
    return true;
  }

  return Object.freeze({
    clearLivenessTimer,
    scheduleLivenessTimer,
  });
}

module.exports = {
  createGatewayRunStreamLivenessTimerService,
  readIntervalMs,
};
