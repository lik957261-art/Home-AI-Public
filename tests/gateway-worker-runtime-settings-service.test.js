"use strict";

const assert = require("node:assert/strict");
const {
  gatewayWorkerSettingsToElasticConfig,
  mergeGatewayWorkerRuntimeSettings,
  normalizeGatewayWorkerRuntimeSettings,
  publicGatewayWorkerRuntimeSettings,
} = require("../adapters/gateway-worker-runtime-settings-service");

function testNormalizeAndMerge() {
  assert.deepEqual(normalizeGatewayWorkerRuntimeSettings({
    ownerMinWarm: "0",
    workspace_max_workers: "3.8",
    idleTtlMinutes: 1,
    ignored: 99,
  }), {
    ownerMinWarm: 0,
    workspaceMaxWorkers: 3,
    idleTtlMinutes: 1,
  });
  assert.deepEqual(mergeGatewayWorkerRuntimeSettings(
    { ownerMinWarm: 1, workspaceMaxWorkers: 2 },
    { ownerMinWarm: "", globalMaxWorkers: 12 },
    { strict: true },
  ), {
    workspaceMaxWorkers: 2,
    globalMaxWorkers: 12,
  });
  assert.throws(
    () => mergeGatewayWorkerRuntimeSettings({}, { globalMaxWorkers: 999 }, { strict: true }),
    /Global worker cap/,
  );
}

function testElasticMappingAndPublicEffectiveSettings() {
  const base = {
    HERMES_MOBILE_GATEWAY_OWNER_MIN_WARM: "1",
    HERMES_MOBILE_GATEWAY_WORKSPACE_MAX_WORKERS: "2",
    HERMES_MOBILE_GATEWAY_WORKER_IDLE_TTL_MINUTES: "60",
  };
  const elastic = gatewayWorkerSettingsToElasticConfig({
    ownerMinWarm: 0,
    workspaceMaxWorkers: 3,
    idleTtlMinutes: 1,
  }, base);
  assert.equal(elastic.HERMES_MOBILE_GATEWAY_OWNER_MIN_WARM, "0");
  assert.equal(elastic.HERMES_WEB_GATEWAY_OWNER_MIN_WARM, "0");
  assert.equal(elastic.HERMES_MOBILE_GATEWAY_WORKSPACE_MAX_WORKERS, "3");
  assert.equal(elastic.HERMES_MOBILE_GATEWAY_WORKER_IDLE_TTL_MINUTES, "1");

  const publicSettings = publicGatewayWorkerRuntimeSettings({
    ownerMinWarm: 0,
    workspaceMaxWorkers: 3,
    idleTtlMinutes: 1,
  }, base);
  assert.equal(publicSettings.overrides.ownerMinWarm, 0);
  assert.equal(publicSettings.effective.ownerMinWarm, 0);
  assert.equal(publicSettings.effective.workspaceMaxWorkers, 3);
  assert.equal(publicSettings.effective.idleTtlMinutes, 1);
  assert.equal(publicSettings.definitions.some((item) => item.key === "ownerMaintenanceMaxWorkers"), true);
}

testNormalizeAndMerge();
testElasticMappingAndPublicEffectiveSettings();

console.log("gateway worker runtime settings service tests passed");
