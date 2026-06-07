"use strict";

function cleanString(value) {
  return String(value || "").trim();
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

function createGatewayRunStreamRegistryService(options = {}) {
  const activeStreams = options.activeStreams instanceof Map ? options.activeStreams : new Map();
  const gatewayPool = typeof options.gatewayPool === "function" ? options.gatewayPool : (() => options.gatewayPool);
  const gatewayUrlForRunFallback = typeof options.gatewayUrlForRun === "function" ? options.gatewayUrlForRun : (() => "");

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

  function gatewayTargetForRun(runId) {
    const activeTarget = gatewayTargetFromActiveStream(activeStreamForRun(runId));
    if (activeTarget) return activeTarget;
    const pool = gatewayPool();
    if (!pool || typeof pool.targetForGatewayUrl !== "function") {
      throw new Error("Gateway run stream registry service requires gatewayPool.targetForGatewayUrl");
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
    if (!stream) return activeStreams.delete(id) ? 1 : 0;
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

  return Object.freeze({
    activeStreamCount,
    activeStreamForRun,
    activeStreams,
    abortActiveStreamAsFailed,
    cleanupRunAliases,
    gatewayTargetForRun,
    gatewayUrlForRun,
    registerActiveStream,
    registerRunAlias,
  });
}

module.exports = {
  createGatewayRunStreamRegistryService,
  gatewayTargetFromActiveStream,
};
