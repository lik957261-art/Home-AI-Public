"use strict";

const assert = require("node:assert/strict");

const {
  createRuntimeConfigGatewayWorkerService,
} = require("../adapters/runtime-config-gateway-worker-service");

function makeService(options = {}) {
  return createRuntimeConfigGatewayWorkerService(Object.assign({
    gatewayWorkerElasticConfig: () => ({
      HERMES_MOBILE_GATEWAY_OWNER_MIN_WARM: "1",
      HERMES_MOBILE_GATEWAY_WORKSPACE_MAX_WORKERS: "2",
      HERMES_MOBILE_GATEWAY_WORKER_IDLE_TTL_MINUTES: "60",
    }),
    load: () => ({
      gatewayWorkerSettings: {
        ownerMinWarm: 0,
        workspaceMaxWorkers: 3,
        idleTtlMinutes: 1,
      },
    }),
  }, options));
}

function testBaseGatewayWorkerElasticConfigSupportsFunctionsAndObjects() {
  const fnService = makeService();
  assert.deepEqual(fnService.baseGatewayWorkerElasticConfig(), {
    HERMES_MOBILE_GATEWAY_OWNER_MIN_WARM: "1",
    HERMES_MOBILE_GATEWAY_WORKSPACE_MAX_WORKERS: "2",
    HERMES_MOBILE_GATEWAY_WORKER_IDLE_TTL_MINUTES: "60",
  });

  const objectService = makeService({
    gatewayWorkerElasticConfig: {
      HERMES_WEB_GATEWAY_OWNER_MIN_WARM: "4",
    },
  });
  assert.deepEqual(objectService.baseGatewayWorkerElasticConfig(), {
    HERMES_WEB_GATEWAY_OWNER_MIN_WARM: "4",
  });
  assert.deepEqual(makeService({ gatewayWorkerElasticConfig: null }).baseGatewayWorkerElasticConfig(), {});
}

function testElasticConfigUsesInjectedLoadWhenConfigOmitted() {
  const service = makeService();
  const elastic = service.gatewayWorkerElasticConfig();
  assert.equal(elastic.HERMES_MOBILE_GATEWAY_OWNER_MIN_WARM, "0");
  assert.equal(elastic.HERMES_WEB_GATEWAY_OWNER_MIN_WARM, "0");
  assert.equal(elastic.HERMES_MOBILE_GATEWAY_WORKSPACE_MAX_WORKERS, "3");
  assert.equal(elastic.HERMES_WEB_GATEWAY_WORKSPACE_MAX_WORKERS, "3");
  assert.equal(elastic.HERMES_MOBILE_GATEWAY_WORKER_IDLE_TTL_MINUTES, "1");
  assert.equal(elastic.HERMES_WEB_GATEWAY_WORKER_IDLE_TTL_MINUTES, "1");
}

function testExplicitConfigAndBaseOverride() {
  const service = makeService();
  const elastic = service.gatewayWorkerElasticConfig(
    { gatewayWorkerSettings: { globalMaxWorkers: 9 } },
    { HERMES_MOBILE_GATEWAY_ELASTIC_MAX_WORKERS: "8" },
  );
  assert.equal(elastic.HERMES_MOBILE_GATEWAY_ELASTIC_MAX_WORKERS, "9");
  assert.equal(elastic.HERMES_WEB_GATEWAY_ELASTIC_MAX_WORKERS, "9");
}

function testPublicRuntimeSettingsExposeOverridesAndEffectiveValues() {
  const service = makeService();
  const projected = service.gatewayWorkerRuntimeSettings();
  assert.equal(projected.overrides.ownerMinWarm, 0);
  assert.equal(projected.overrides.workspaceMaxWorkers, 3);
  assert.equal(projected.effective.ownerMinWarm, 0);
  assert.equal(projected.effective.workspaceMaxWorkers, 3);
  assert.equal(projected.effective.idleTtlMinutes, 1);
  assert.ok(projected.definitions.some((item) => item.key === "ownerMinWarm"));
}

testBaseGatewayWorkerElasticConfigSupportsFunctionsAndObjects();
testElasticConfigUsesInjectedLoadWhenConfigOmitted();
testExplicitConfigAndBaseOverride();
testPublicRuntimeSettingsExposeOverridesAndEffectiveValues();
console.log("runtime config gateway worker service tests passed");
