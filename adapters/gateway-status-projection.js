"use strict";

function workerHealthyCount(workers) {
  return (Array.isArray(workers) ? workers : []).filter((worker) => worker?.healthy === true).length;
}

function publicGatewayPoolStatus(pool) {
  if (!pool || typeof pool !== "object") return null;
  const workers = Array.isArray(pool.workers) ? pool.workers : [];
  return {
    enabled: Boolean(pool.enabled),
    mode: pool.mode || "",
    workerCount: Number(pool.workerCount || workers.length || 0),
    healthy: workerHealthyCount(workers),
  };
}

function gatewayPoolStatusHealthy(poolStatus) {
  if (!poolStatus?.enabled) return false;
  return workerHealthyCount(poolStatus.workers) > 0;
}

function createGatewayStatusProjection(options = {}) {
  const isOwnerAuth = typeof options.isOwnerAuth === "function" ? options.isOwnerAuth : () => false;

  function publicGatewayPoolStatusForAuth(auth, pool) {
    if (isOwnerAuth(auth)) return pool || null;
    return publicGatewayPoolStatus(pool);
  }

  return Object.freeze({
    publicGatewayPoolStatus,
    publicGatewayPoolStatusForAuth,
    gatewayPoolStatusHealthy,
  });
}

module.exports = {
  createGatewayStatusProjection,
  publicGatewayPoolStatus,
  gatewayPoolStatusHealthy,
};
