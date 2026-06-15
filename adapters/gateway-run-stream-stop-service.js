"use strict";

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

function createGatewayRunStreamStopService(options = {}) {
  const activeStreamForRun = typeof options.activeStreamForRun === "function"
    ? options.activeStreamForRun
    : (() => null);
  const dedupe = typeof options.dedupe === "function" ? options.dedupe : defaultDedupe;
  const gatewayPool = typeof options.gatewayPool === "function"
    ? options.gatewayPool
    : (() => options.gatewayPool);
  const gatewayTargetForRun = typeof options.gatewayTargetForRun === "function"
    ? options.gatewayTargetForRun
    : (() => ({}));

  function stopTimeoutMs() {
    const apiTimeoutMs = readNumber(options.apiTimeoutMs, 8000);
    return Math.max(1000, readNumber(options.stopTimeoutMs, Math.min(apiTimeoutMs, 5000)));
  }

  async function stopRunIds(runIds) {
    const stopped = [];
    const timeoutMs = stopTimeoutMs();
    for (const runId of dedupe(runIds || [])) {
      const stream = activeStreamForRun(runId);
      if (stream?.controller) {
        stream.userStopRequested = true;
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
          timeoutMs,
        });
      } catch (err) {
        if (Number(err?.status) !== 404) throw err;
      }
      stopped.push(runId);
    }
    return stopped;
  }

  return Object.freeze({
    stopRunIds,
  });
}

module.exports = {
  createGatewayRunStreamStopService,
  defaultDedupe,
};
