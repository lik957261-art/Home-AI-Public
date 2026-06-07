"use strict";

const assert = require("node:assert/strict");
const { createMobileRuntimeGatewayFacadeService } = require("../adapters/mobile-runtime-gateway-facade-service");

const calls = {
  pool: 0,
  provisioning: 0,
  runner: 0,
  telemetry: 0,
  workerLauncher: 0,
};
const state = {
  threads: [
    { workspaceId: "owner", activeRuns: [{ runId: "run-1" }] },
  ],
};
let elasticMode = "hybrid";

const poolEvents = [];
const facade = createMobileRuntimeGatewayFacadeService({
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
      load: () => ({ workers: [] }),
      releaseRun: (runId, idleStatus) => {
        poolEvents.push(["release", runId, idleStatus]);
        return true;
      },
      replaceRun: (oldRunId, newRunId) => {
        poolEvents.push(["replace", oldRunId, newRunId]);
        return true;
      },
      runnerFor: () => ({ streamResponses: async () => {} }),
    };
  },
  createGatewayRunner(options) {
    calls.runner += 1;
    return {
      apiBase: options.apiBase(),
      apiKey: options.apiKey(),
      timeoutMs: options.timeoutMs(),
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
  runConcurrencyPolicy: {
    snapshot: (threads) => ({ active: threads.reduce((sum, thread) => sum + (thread.activeRuns || []).length, 0) }),
    limitError: (_threads, workspaceId) => workspaceId === "blocked"
      ? { code: "run_concurrency_limit", message: "Too many active runs", status: 429, workspaceId }
      : null,
  },
  state: () => state,
  toolRoot: "/tool-root",
});

(async () => {
assert.equal(calls.pool, 0);
assert.deepEqual(facade.runConcurrencySnapshot(), { active: 1 });
assert.equal(facade.runConcurrencyError("owner"), null);
assert.throws(() => facade.assertRunConcurrencyCapacity("blocked"), (error) => {
  assert.equal(error.status, 429);
  assert.equal(error.code, "run_concurrency_limit");
  assert.equal(error.details.workspaceId, "blocked");
  return true;
});
assert.equal(facade.releaseGatewayRunTarget("run-before"), false);
assert.equal(facade.replaceGatewayRunTarget("old-before", "new-before"), false);

assert.deepEqual(facade.singleGatewayRunner(), {
  apiBase: "http://gateway.example",
  apiKey: "fixture-key",
  timeoutMs: 1234,
});
assert.equal(facade.singleGatewayRunner(), facade.singleGatewayRunner());
assert.equal(calls.runner, 1);

const target = await facade.chooseGatewayRunTarget({ purpose: "test" }, { runId: "run-2" });
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
assert.deepEqual(facade.gatewayWorkerProfileLauncher().startWorkerProfile("lowgw1"), { action: "start", args: ["lowgw1"] });
assert.deepEqual(facade.gatewayWorkerProfileLauncher().stopWorkerProfile("lowgw1"), { action: "stop", args: ["lowgw1"] });
assert.equal(calls.workerLauncher, 1);
assert.deepEqual(facade.gatewayWorkerProfileLauncher().elasticConfig, { mode: "hybrid" });
assert.equal(facade.releaseGatewayRunTarget("run-2", "idle"), true);
assert.equal(facade.replaceGatewayRunTarget("run-2", "run-3"), true);
assert.deepEqual(poolEvents, [
  ["release", "run-2", "idle"],
  ["replace", "run-2", "run-3"],
]);
elasticMode = "cold";
assert.equal(facade.resetGatewayRuntimeConfig(), true);
const refreshedTarget = await facade.chooseGatewayRunTarget({ purpose: "refresh" }, { runId: "run-refresh" });
assert.equal(refreshedTarget.elasticMode, "cold");
assert.equal(calls.pool, 2);
assert.deepEqual(facade.gatewayWorkerProfileLauncher().elasticConfig, { mode: "cold" });
assert.equal(calls.workerLauncher, 2);

assert.deepEqual(facade.getGatewayWorkspaceProvisioningService().ensureWorkspaceGateway({ workspaceId: "owner" }), {
  workspaceId: "owner",
  created: true,
});
assert.equal(facade.getGatewayWorkspaceProvisioningService(), facade.getGatewayWorkspaceProvisioningService());
assert.equal(calls.provisioning, 1);

assert.deepEqual(facade.gatewayUsageTelemetry().supplementUsage({ input: 1 }, { profile: "lowgw1" }), {
  usage: { input: 1 },
  target: { profile: "lowgw1" },
});
assert.equal(facade.gatewayUsageTelemetry().enabled, true);
assert.deepEqual(facade.gatewayUsageTelemetry().manifestPaths, ["manifest.json"]);
assert.deepEqual(facade.gatewayUsageTelemetry().profileRoots, ["/profiles"]);
assert.equal(calls.telemetry, 1);

assert.throws(() => createMobileRuntimeGatewayFacadeService({}), /requires effectiveHermesApiBase/);

console.log("mobile runtime gateway facade service tests passed");
})().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
