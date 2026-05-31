"use strict";

function workerHealthyCount(workers) {
  return (Array.isArray(workers) ? workers : []).filter((worker) => worker?.healthy === true).length;
}

function workerExpectedRunning(worker = {}) {
  if (Object.hasOwn(worker, "expectedRunning")) return Boolean(worker.expectedRunning);
  const state = String(worker.state || worker.lifecycleState || "").trim();
  if (!state) return true;
  return !["configured", "retired"].includes(state);
}

function workerConfiguredStoppedCount(workers) {
  return (Array.isArray(workers) ? workers : []).filter((worker) => {
    const state = String(worker?.state || worker?.lifecycleState || "").trim();
    return state === "configured" || state === "retired" || workerExpectedRunning(worker) === false;
  }).length;
}

function workerRunningCount(workers) {
  return (Array.isArray(workers) ? workers : []).filter((worker) => workerExpectedRunning(worker)).length;
}

function workerFailedCount(workers) {
  return (Array.isArray(workers) ? workers : []).filter((worker) => {
    const state = String(worker?.state || worker?.lifecycleState || "").trim();
    return state === "failed" || (workerExpectedRunning(worker) && worker?.healthy === false);
  }).length;
}

function providerLabel(provider) {
  const value = String(provider || "").trim();
  if (value === "openai-codex") return "ChatGPT";
  if (value === "deepseek") return "DeepSeek";
  if (value === "xai-oauth") return "Grok";
  return value || "Default";
}

function emptyProviderTier() {
  return {
    configured: 0,
    running: 0,
    healthy: 0,
    stopped: 0,
    failed: 0,
  };
}

function buildGatewayProviderMatrix(pool) {
  if (!pool || typeof pool !== "object") return [];
  const workers = Array.isArray(pool.workers) ? pool.workers : [];
  const order = ["openai-codex", "deepseek", "xai-oauth"];
  const byProvider = new Map();
  for (const worker of workers) {
    const provider = String(worker?.provider || "openai-codex").trim() || "openai-codex";
    if (!byProvider.has(provider)) {
      byProvider.set(provider, {
        provider,
        label: providerLabel(provider),
        user: emptyProviderTier(),
        ownerMaintenance: emptyProviderTier(),
      });
    }
    const row = byProvider.get(provider);
    const tier = String(worker?.securityLevel || "").trim() === "owner-maintenance"
      ? row.ownerMaintenance
      : row.user;
    tier.configured += 1;
    if (workerExpectedRunning(worker)) tier.running += 1;
    else tier.stopped += 1;
    if (worker?.healthy === true) tier.healthy += 1;
    if (String(worker?.state || worker?.lifecycleState || "").trim() === "failed" || (workerExpectedRunning(worker) && worker?.healthy === false)) tier.failed += 1;
  }
  return [...byProvider.values()].sort((a, b) => {
    const ai = order.indexOf(a.provider);
    const bi = order.indexOf(b.provider);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.provider.localeCompare(b.provider);
  });
}

function publicGatewayPoolStatus(pool) {
  if (!pool || typeof pool !== "object") return null;
  const workers = Array.isArray(pool.workers) ? pool.workers : [];
  return {
    enabled: Boolean(pool.enabled),
    mode: pool.mode || "",
    workerCount: Number(pool.workerCount || workers.length || 0),
    healthy: workerHealthyCount(workers),
    running: Number(pool.runningWorkerCount || workerRunningCount(workers) || 0),
    configuredStopped: workerConfiguredStoppedCount(workers),
    failed: workerFailedCount(workers),
    elastic: Boolean(pool.elastic),
    queueDepth: Math.max(0, Number(pool.queueDepth || 0) || 0),
    providerMatrix: buildGatewayProviderMatrix(pool),
  };
}

function gatewayPoolStatusHealthy(poolStatus) {
  if (!poolStatus?.enabled) return false;
  const workers = Array.isArray(poolStatus.workers) ? poolStatus.workers : [];
  if (String(poolStatus.mode || "").trim() === "hybrid" || poolStatus.elastic) {
    return workerFailedCount(workers) === 0;
  }
  return workerHealthyCount(workers) > 0;
}

function createGatewayStatusProjection(options = {}) {
  const isOwnerAuth = typeof options.isOwnerAuth === "function" ? options.isOwnerAuth : () => false;

  function publicGatewayPoolStatusForAuth(auth, pool) {
    if (isOwnerAuth(auth) && pool && typeof pool === "object") {
      return Object.assign({}, pool, {
        providerMatrix: buildGatewayProviderMatrix(pool),
      });
    }
    return publicGatewayPoolStatus(pool);
  }

  return Object.freeze({
    publicGatewayPoolStatus,
    publicGatewayPoolStatusForAuth,
    gatewayPoolStatusHealthy,
  });
}

module.exports = {
  buildGatewayProviderMatrix,
  createGatewayStatusProjection,
  publicGatewayPoolStatus,
  gatewayPoolStatusHealthy,
};
