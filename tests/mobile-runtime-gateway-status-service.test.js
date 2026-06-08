"use strict";

const assert = require("node:assert/strict");
const {
  createMobileRuntimeGatewayStatusService,
} = require("../adapters/mobile-runtime-gateway-status-service");

async function run() {
  let runnerStatus = { ok: true, error: null, health: { status: "ok" } };
  let poolStatus = { enabled: true, mode: "hybrid", workers: [{ healthy: true }] };
  let poolStatusError = null;
  let healthy = true;
  const service = createMobileRuntimeGatewayStatusService({
    gatewayPool: () => ({
      status: async () => {
        if (poolStatusError) throw poolStatusError;
        return poolStatus;
      },
    }),
    gatewayPoolStatusHealthy: (status) => Boolean(status && healthy),
    singleGatewayRunner: () => ({
      status: async () => Object.assign({}, runnerStatus),
    }),
  });

  const okStatus = await service.getHermesStatus();
  assert.equal(okStatus.ok, true);
  assert.deepEqual(okStatus.gatewayPool, poolStatus);

  poolStatusError = new Error("pool unavailable");
  const poolFailureStatus = await service.getHermesStatus();
  assert.equal(poolFailureStatus.ok, true);
  assert.deepEqual(poolFailureStatus.gatewayPool, { enabled: false, error: "pool unavailable" });

  poolStatusError = null;
  runnerStatus = { ok: false, error: "single runner unavailable" };
  const fallbackStatus = await service.getHermesStatus();
  assert.equal(fallbackStatus.ok, true);
  assert.equal(fallbackStatus.error, null);
  assert.equal(fallbackStatus.fallbackError, "single runner unavailable");
  assert.deepEqual(fallbackStatus.health, { status: "ok", platform: "gateway-pool" });

  healthy = false;
  const unhealthyStatus = await service.getHermesStatus();
  assert.equal(unhealthyStatus.ok, false);
  assert.equal(unhealthyStatus.error, "single runner unavailable");
  assert.deepEqual(unhealthyStatus.gatewayPool, poolStatus);

  assert.throws(() => createMobileRuntimeGatewayStatusService({}), /requires gatewayPool/);
  assert.throws(() => createMobileRuntimeGatewayStatusService({ gatewayPool: () => ({}) }), /requires singleGatewayRunner/);

  console.log("mobile runtime gateway status service tests passed");
}

run().catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
