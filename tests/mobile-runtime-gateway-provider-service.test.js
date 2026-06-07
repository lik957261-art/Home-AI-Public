"use strict";

const assert = require("node:assert/strict");
const {
  createMobileRuntimeGatewayProviderService,
} = require("../adapters/mobile-runtime-gateway-provider-service");

const calls = {
  pool: 0,
  provisioning: 0,
  runner: 0,
  telemetry: 0,
  workerLauncher: 0,
};
let elasticMode = "hybrid";
let runnerStatus = { ok: true, error: null, health: { status: "ok" } };
let poolStatus = { enabled: true, mode: "eager", workers: [{ healthy: true }] };
let poolStatusError = null;

function makeService() {
  const poolEvents = [];
  const service = createMobileRuntimeGatewayProviderService({
    apiTimeoutMs: () => 1234,
    createGatewayPoolProvider(options) {
      calls.pool += 1;
      return {
        chooseTarget: (hints, context) => ({
          profile: "lowgw1",
          hints,
          context,
          fallback: options.fallbackApiBase(),
          epoch: options.toolSchemaEpoch(),
          elasticMode: options.elastic.mode,
        }),
        status: async () => {
          if (poolStatusError) throw poolStatusError;
          return poolStatus;
        },
        releaseRun: (runId, idleStatus) => {
          poolEvents.push(["release", runId, idleStatus]);
          return true;
        },
        replaceRun: (oldRunId, newRunId) => {
          poolEvents.push(["replace", oldRunId, newRunId]);
          return true;
        },
      };
    },
    createGatewayRunner(options) {
      calls.runner += 1;
      return {
        apiBase: options.apiBase(),
        apiKey: options.apiKey(),
        timeoutMs: options.timeoutMs(),
        status: async () => Object.assign({}, runnerStatus),
      };
    },
    createGatewayUsageTelemetryProvider(options) {
      calls.telemetry += 1;
      return {
        enabled: options.enabled(),
        manifestPaths: options.manifestPaths(),
        profileRoots: options.profileRoots(),
        supplementUsage: (usage, target) => ({ usage, target }),
      };
    },
    createGatewayWorkerProfileLaunchService(options) {
      calls.workerLauncher += 1;
      return {
        elasticConfig: options.elasticConfig,
        startWorkerProfile: (...args) => ({ action: "start", args }),
        stopWorkerProfile: (...args) => ({ action: "stop", args }),
        toolRoot: options.toolRoot,
      };
    },
    createGatewayWorkspaceProvisioningService(options) {
      calls.provisioning += 1;
      return {
        manifestPaths: options.manifestPaths(),
        nowIso: options.nowIso(),
        ensureWorkspaceGateway: ({ workspaceId }) => ({ workspaceId, created: true }),
      };
    },
    effectiveHermesApiBase: () => "http://gateway.example",
    fs: {},
    gatewayPoolElasticConfig: () => ({ mode: elasticMode }),
    gatewayPoolEnabled: () => true,
    gatewayPoolHealthTimeoutMs: 500,
    gatewayPoolManifestPaths: () => ["manifest.json"],
    gatewayPoolStartMode: () => "hybrid",
    gatewayToolSchemaEpoch: () => "epoch-1",
    gatewayUsageTelemetryEnabled: () => true,
    gatewayUsageTelemetryProfileRoots: () => ["/profiles"],
    loadHermesApiKey: () => "fixture-key",
    nowIso: () => "2026-06-07T00:00:00.000Z",
    path: { join: (...parts) => parts.join("/") },
    toolRoot: "/tool-root",
  });
  return { poolEvents, service };
}

async function run() {
  const { poolEvents, service } = makeService();

  assert.equal(service.releaseGatewayRunTarget("run-before"), false);
  assert.equal(service.replaceGatewayRunTarget("old-before", "new-before"), false);

  assert.equal(service.singleGatewayRunner().apiBase, "http://gateway.example");
  assert.equal(service.singleGatewayRunner().apiKey, "fixture-key");
  assert.equal(service.singleGatewayRunner().timeoutMs, 1234);
  assert.equal(service.singleGatewayRunner(), service.singleGatewayRunner());
  assert.equal(calls.runner, 1);

  const target = await service.chooseGatewayRunTarget({ purpose: "test" }, { runId: "run-2" });
  assert.deepEqual(target, {
    profile: "lowgw1",
    hints: { purpose: "test" },
    context: { runId: "run-2" },
    fallback: "http://gateway.example",
    epoch: "epoch-1",
    elasticMode: "hybrid",
  });
  assert.equal(calls.pool, 1);
  assert.equal(calls.workerLauncher, 0);

  assert.deepEqual(service.gatewayWorkerProfileLauncher().startWorkerProfile("lowgw1"), { action: "start", args: ["lowgw1"] });
  assert.deepEqual(service.gatewayWorkerProfileLauncher().stopWorkerProfile("lowgw1"), { action: "stop", args: ["lowgw1"] });
  assert.equal(calls.workerLauncher, 1);
  assert.deepEqual(service.gatewayWorkerProfileLauncher().elasticConfig, { mode: "hybrid" });
  assert.equal(service.releaseGatewayRunTarget("run-2", "idle"), true);
  assert.equal(service.replaceGatewayRunTarget("run-2", "run-3"), true);
  assert.deepEqual(poolEvents, [
    ["release", "run-2", "idle"],
    ["replace", "run-2", "run-3"],
  ]);

  elasticMode = "cold";
  assert.equal(service.resetGatewayRuntimeConfig(), true);
  const refreshedTarget = await service.chooseGatewayRunTarget({ purpose: "refresh" }, { runId: "run-refresh" });
  assert.equal(refreshedTarget.elasticMode, "cold");
  assert.equal(calls.pool, 2);
  assert.deepEqual(service.gatewayWorkerProfileLauncher().elasticConfig, { mode: "cold" });
  assert.equal(calls.workerLauncher, 2);

  assert.deepEqual(service.getGatewayWorkspaceProvisioningService().ensureWorkspaceGateway({ workspaceId: "owner" }), {
    workspaceId: "owner",
    created: true,
  });
  assert.equal(service.getGatewayWorkspaceProvisioningService(), service.getGatewayWorkspaceProvisioningService());
  assert.equal(calls.provisioning, 1);

  assert.deepEqual(service.gatewayUsageTelemetry().supplementUsage({ input: 1 }, { profile: "lowgw1" }), {
    usage: { input: 1 },
    target: { profile: "lowgw1" },
  });
  assert.equal(service.gatewayUsageTelemetry().enabled, true);
  assert.deepEqual(service.gatewayUsageTelemetry().manifestPaths, ["manifest.json"]);
  assert.deepEqual(service.gatewayUsageTelemetry().profileRoots, ["/profiles"]);
  assert.equal(calls.telemetry, 1);

  const hermesStatus = await service.getHermesStatus();
  assert.equal(hermesStatus.ok, true);
  assert.deepEqual(hermesStatus.gatewayPool, poolStatus);

  poolStatusError = new Error("pool status failed");
  const degradedStatus = await service.getHermesStatus();
  assert.equal(degradedStatus.ok, true);
  assert.deepEqual(degradedStatus.gatewayPool, { enabled: false, error: "pool status failed" });

  poolStatusError = null;
  runnerStatus = { ok: false, error: "single runner unavailable" };
  poolStatus = { enabled: true, mode: "eager", workers: [{ healthy: true }] };
  const fallbackStatus = await service.getHermesStatus();
  assert.equal(fallbackStatus.ok, true);
  assert.equal(fallbackStatus.error, null);
  assert.equal(fallbackStatus.fallbackError, "single runner unavailable");
  assert.deepEqual(fallbackStatus.health, { status: "ok", platform: "gateway-pool" });

  assert.throws(() => createMobileRuntimeGatewayProviderService({}), /requires effectiveHermesApiBase/);

  console.log("mobile runtime gateway provider service tests passed");
}

run().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
