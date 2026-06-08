"use strict";

const { gatewayPoolStatusHealthy: defaultGatewayPoolStatusHealthy } = require("./gateway-status-projection");

function requireFunction(options, name) {
  const value = options[name];
  if (typeof value === "function") return value;
  throw new Error(`MobileRuntimeGatewayStatusService requires ${name}`);
}

function createMobileRuntimeGatewayStatusService(options = {}) {
  const gatewayPool = requireFunction(options, "gatewayPool");
  const gatewayPoolStatusHealthy = typeof options.gatewayPoolStatusHealthy === "function"
    ? options.gatewayPoolStatusHealthy
    : defaultGatewayPoolStatusHealthy;
  const singleGatewayRunner = requireFunction(options, "singleGatewayRunner");

  async function getHermesStatus() {
    const status = await singleGatewayRunner().status();
    let poolStatus = null;
    try {
      poolStatus = await gatewayPool().status();
      status.gatewayPool = poolStatus;
    } catch (err) {
      status.gatewayPool = { enabled: false, error: err.message || String(err) };
    }
    if (!status.ok && gatewayPoolStatusHealthy(poolStatus)) {
      status.fallbackError = status.error || "";
      status.error = null;
      status.health = status.health || { status: "ok", platform: "gateway-pool" };
      status.ok = true;
    }
    return status;
  }

  return Object.freeze({
    getHermesStatus,
  });
}

module.exports = {
  createMobileRuntimeGatewayStatusService,
};
