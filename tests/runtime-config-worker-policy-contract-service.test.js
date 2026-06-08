"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRuntimeConfigProvider } = require("../adapters/runtime-config-provider");
const {
  createRuntimeConfigWorkerPolicyContractService,
} = require("../adapters/runtime-config-worker-policy-contract-service");

function baseElasticConfig() {
  return {
    HERMES_MOBILE_GATEWAY_OWNER_MIN_WARM: "1",
    HERMES_WEB_GATEWAY_OWNER_MIN_WARM: "1",
    HERMES_MOBILE_GATEWAY_WORKSPACE_MAX_WORKERS: "2",
    HERMES_WEB_GATEWAY_WORKSPACE_MAX_WORKERS: "2",
    HERMES_MOBILE_GATEWAY_WORKER_IDLE_TTL_MINUTES: "60",
    HERMES_WEB_GATEWAY_WORKER_IDLE_TTL_MINUTES: "60",
  };
}

function testWorkerPolicyContractPassesWhenSavePublicAndLauncherAgree() {
  const service = createRuntimeConfigWorkerPolicyContractService();
  const config = {
    gatewayWorkerSettings: {
      ownerMinWarm: 0,
      workspaceMaxWorkers: 3,
      globalMaxWorkers: 9,
      idleTtlMinutes: 1,
    },
  };
  const expectedElastic = {
    ...baseElasticConfig(),
    HERMES_MOBILE_GATEWAY_OWNER_MIN_WARM: "0",
    HERMES_WEB_GATEWAY_OWNER_MIN_WARM: "0",
    HERMES_MOBILE_GATEWAY_WORKSPACE_MAX_WORKERS: "3",
    HERMES_WEB_GATEWAY_WORKSPACE_MAX_WORKERS: "3",
    HERMES_MOBILE_GATEWAY_ELASTIC_MAX_WORKERS: "9",
    HERMES_WEB_GATEWAY_ELASTIC_MAX_WORKERS: "9",
    HERMES_MOBILE_GATEWAY_WORKER_IDLE_TTL_MINUTES: "1",
    HERMES_WEB_GATEWAY_WORKER_IDLE_TTL_MINUTES: "1",
  };
  const result = service.workerPolicyContract({
    baseElasticConfig: baseElasticConfig(),
    config,
    launcherElasticConfig: expectedElastic,
    publicConfig: {
      gatewayWorkerSettings: config.gatewayWorkerSettings,
      gatewayWorkerEffectiveSettings: {
        ownerMinWarm: 0,
        ownerMaxWorkers: 4,
        ownerDeepSeekMaxWorkers: 2,
        ownerMaintenanceMaxWorkers: 2,
        workspaceMinWarm: 0,
        workspaceMaxWorkers: 3,
        workspaceDeepSeekMaxWorkers: 1,
        globalMaxWorkers: 9,
        idleTtlMinutes: 1,
        idleTtlMs: 60000,
      },
      gatewayWorkerSettingDefinitions: [
        { key: "ownerMinWarm", label: "Owner warm workers", max: 64 },
        { key: "ownerMaxWorkers", label: "Owner worker cap", max: 64 },
        { key: "ownerDeepSeekMaxWorkers", label: "Owner DeepSeek worker cap", max: 64 },
        { key: "ownerMaintenanceMaxWorkers", label: "Owner maintenance worker cap", max: 64 },
        { key: "workspaceMinWarm", label: "Workspace warm workers", max: 64 },
        { key: "workspaceMaxWorkers", label: "Workspace worker cap", max: 64 },
        { key: "workspaceDeepSeekMaxWorkers", label: "Workspace DeepSeek worker cap", max: 64 },
        { key: "globalMaxWorkers", label: "Global worker cap", max: 256 },
        { key: "idleTtlMinutes", label: "Idle cooldown minutes", max: 1440 },
      ],
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.expectedElasticEnv.HERMES_MOBILE_GATEWAY_OWNER_MIN_WARM, "0");
  assert.equal(result.expectedElasticEnv.HERMES_WEB_GATEWAY_WORKSPACE_MAX_WORKERS, "3");
  assert.equal(result.effective.globalMaxWorkers, 9);
}

function testWorkerPolicyContractReportsMismatches() {
  const service = createRuntimeConfigWorkerPolicyContractService();
  const result = service.workerPolicyContract({
    baseElasticConfig: baseElasticConfig(),
    config: { gatewayWorkerSettings: { ownerMinWarm: 0, workspaceMaxWorkers: 3 } },
    launcherElasticConfig: {
      ...baseElasticConfig(),
      HERMES_MOBILE_GATEWAY_OWNER_MIN_WARM: "1",
      HERMES_WEB_GATEWAY_OWNER_MIN_WARM: "1",
    },
    publicConfig: {
      gatewayWorkerSettings: { ownerMinWarm: 1 },
      gatewayWorkerEffectiveSettings: { ownerMinWarm: 1, workspaceMaxWorkers: 2, idleTtlMinutes: 60, idleTtlMs: 3600000 },
      gatewayWorkerSettingDefinitions: [{ key: "ownerMinWarm", label: "Owner warm workers", max: 64 }],
    },
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.includes("public_worker_overrides_mismatch:ownerMinWarm"));
  assert.ok(result.issues.includes("public_worker_effective_mismatch:workspaceMaxWorkers"));
  assert.ok(result.issues.includes("launcher_worker_env_mismatch:HERMES_MOBILE_GATEWAY_OWNER_MIN_WARM"));
  assert.ok(result.issues.includes("definition_missing:workspaceMaxWorkers"));
}

function makeProvider() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-runtime-worker-contract-"));
  return createRuntimeConfigProvider({
    storagePath: () => path.join(tempDir, "runtime-config.json"),
    ensureDataDir: () => fs.mkdirSync(tempDir, { recursive: true }),
    nowIso: () => "2026-06-09T00:00:00.000Z",
    defaultHermesApiBase: () => "http://127.0.0.1:8797",
    defaultWebPushSubject: () => "mailto:owner@example.invalid",
    defaultWebPushVapidPath: () => path.join(tempDir, "vapid.json"),
    apiKeyPaths: () => [],
    envPaths: () => [],
    gatewayWorkerElasticConfig: baseElasticConfig,
  });
}

function testProviderProjectsSavedPolicyToPublicAndLauncherContract() {
  const provider = makeProvider();
  provider.save({
    gatewayWorkerSettings: {
      ownerMinWarm: 0,
      workspaceMaxWorkers: 3,
      globalMaxWorkers: 9,
      idleTtlMinutes: 1,
    },
  }, "owner");

  const contract = provider.workerPolicyContract();
  assert.equal(contract.ok, true);
  assert.deepEqual(contract.issues, []);
  assert.deepEqual(contract.publicProjection.overrides, {
    ownerMinWarm: 0,
    workspaceMaxWorkers: 3,
    globalMaxWorkers: 9,
    idleTtlMinutes: 1,
  });
  assert.equal(contract.publicProjection.effective.ownerMinWarm, 0);
  assert.equal(contract.publicProjection.effective.workspaceMaxWorkers, 3);
  assert.equal(contract.launcherProjection.HERMES_MOBILE_GATEWAY_WORKSPACE_MAX_WORKERS, "3");
  assert.equal(contract.launcherProjection.HERMES_WEB_GATEWAY_WORKER_IDLE_TTL_MINUTES, "1");
}

function testProviderContractUsesBaseDefaultsAfterClearingOverrides() {
  const provider = makeProvider();
  provider.save({ gatewayWorkerSettings: { ownerMinWarm: 0, workspaceMaxWorkers: 3 } }, "owner");
  provider.save({ gatewayWorkerSettings: { ownerMinWarm: "", workspaceMaxWorkers: "" } }, "owner");

  const contract = provider.workerPolicyContract();
  assert.equal(contract.ok, true);
  assert.deepEqual(contract.publicProjection.overrides, {});
  assert.equal(contract.publicProjection.effective.ownerMinWarm, 1);
  assert.equal(contract.publicProjection.effective.workspaceMaxWorkers, 2);
  assert.equal(contract.launcherProjection.HERMES_MOBILE_GATEWAY_OWNER_MIN_WARM, "1");
}

testWorkerPolicyContractPassesWhenSavePublicAndLauncherAgree();
testWorkerPolicyContractReportsMismatches();
testProviderProjectsSavedPolicyToPublicAndLauncherContract();
testProviderContractUsesBaseDefaultsAfterClearingOverrides();

console.log("runtime config worker policy contract service tests passed");
