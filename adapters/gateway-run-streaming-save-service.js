"use strict";

function createGatewayRunStreamingSaveService(options = {}) {
  const saveState = typeof options.saveState === "function" ? options.saveState : (() => {});
  const setTimer = typeof options.setTimeout === "function" ? options.setTimeout : setTimeout;
  const clearTimer = typeof options.clearTimeout === "function" ? options.clearTimeout : clearTimeout;
  const streamingSaveThrottleMs = Math.max(0, Number(options.streamingSaveThrottleMs ?? 1200) || 0);
  const logError = typeof options.logError === "function" ? options.logError : ((err) => {
    try {
      console.error(err);
    } catch (_) {}
  });
  let streamingSaveTimer = null;
  let streamingSavePending = false;

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

  return Object.freeze({
    clearStreamingSaveTimer,
    scheduleStreamingStateSave,
  });
}

module.exports = {
  createGatewayRunStreamingSaveService,
};
