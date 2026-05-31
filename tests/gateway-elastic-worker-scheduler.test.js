"use strict";

const assert = require("node:assert/strict");
const {
  buildGatewayWorkerCompatibilityKey,
  createGatewayElasticWorkerScheduler,
  normalizeElasticSchedulerConfig,
} = require("../adapters/gateway-elastic-worker-scheduler");

function worker(profile, overrides = {}) {
  const port = Number(overrides.port || 18000 + Number(String(profile).replace(/\D+/g, "") || 0));
  return Object.assign({
    id: profile,
    name: profile,
    profile,
    apiBase: `http://127.0.0.1:${port}`,
    apiKey: `${profile}-secret`,
    provider: "openai-codex",
    securityLevel: "user",
    allowedWorkspaceIds: ["*"],
    skillWorkspaceIds: ["*"],
  }, overrides);
}

function createHarness(overrides = {}) {
  let now = 1_778_000_000_000;
  const calls = {
    events: [],
    starts: [],
    stops: [],
    healthy: [],
  };
  const healthy = new Set(overrides.initialHealthy || []);
  const scheduler = createGatewayElasticWorkerScheduler(Object.assign({
    nowMs: () => now,
    setTimeout: () => 0,
    clearTimeout: () => {},
    config: {
      ownerMinWarm: 1,
      ownerMaxWorkers: 4,
      workspaceMinWarm: 0,
      workspaceMaxWorkers: 2,
      globalMaxWorkers: 8,
      idleTtlMs: 60_000,
      startTimeoutMs: 5_000,
      queueWaitTimeoutMs: 30_000,
    },
    isHealthy: async (candidate) => {
      calls.healthy.push(candidate.profile);
      return healthy.has(candidate.profile);
    },
    startWorker: async (candidate) => {
      calls.starts.push(candidate.profile);
      healthy.add(candidate.profile);
      return { ok: true };
    },
    stopWorker: async (candidate) => {
      calls.stops.push(candidate.profile);
      healthy.delete(candidate.profile);
      return { ok: true };
    },
  }, overrides));
  return {
    calls,
    scheduler,
    tick(ms) {
      now += ms;
    },
  };
}

async function testStartupPlanKeepsOnlyOwnerWarmBaseline() {
  const { scheduler } = createHarness();
  const workers = [
    worker("lowgw1", { allowedWorkspaceIds: ["owner"], skillWorkspaceIds: ["owner"] }),
    worker("lowgw5", { allowedWorkspaceIds: ["weixin_test_1"], skillWorkspaceIds: ["weixin_test_1"] }),
    worker("deepseekgw1", { provider: "deepseek", allowedWorkspaceIds: ["owner"], skillWorkspaceIds: ["owner"] }),
  ];
  const plan = scheduler.planHybridStartup(workers);
  assert.deepEqual(plan.ownerWarmProfiles, ["lowgw1"]);
  assert.deepEqual(plan.nonOwnerWarmProfiles, []);
  assert.deepEqual(plan.startProfiles, ["lowgw1"]);
}

async function testWarmCompatibleWorkerIsReusedWithoutStarting() {
  const { calls, scheduler } = createHarness({ initialHealthy: ["lowgw1"] });
  const workers = [worker("lowgw1", { allowedWorkspaceIds: ["owner"], skillWorkspaceIds: ["owner"] })];
  scheduler.markWorkerWarm(workers[0], { workspaceId: "owner" });

  const target = await scheduler.chooseTarget({
    allWorkers: workers,
    candidates: workers,
    hints: { workspaceId: "owner", provider: "openai-codex", securityLevel: "user" },
    runId: "run-owner-1",
    onEvent: (event) => calls.events.push(event),
  });

  assert.equal(target.profile, "lowgw1");
  assert.equal(target.schedulerEvent.reason, "worker_reused");
  assert.deepEqual(calls.starts, []);
  assert.equal(calls.events[0].event, "run.gateway_worker_reused");
  assert.equal(JSON.stringify(calls.events).includes("lowgw1-secret"), false);
}

async function testAlreadyRunningConfiguredWorkerIsReusedWithoutRestart() {
  const { calls, scheduler } = createHarness({ initialHealthy: ["lowgw1"] });
  const workers = [worker("lowgw1", { allowedWorkspaceIds: ["owner"], skillWorkspaceIds: ["owner"] })];

  const target = await scheduler.chooseTarget({
    allWorkers: workers,
    candidates: workers,
    hints: { workspaceId: "owner", provider: "openai-codex", securityLevel: "user" },
    runId: "run-owner-existing",
    onEvent: (event) => calls.events.push(event),
  });

  assert.equal(target.profile, "lowgw1");
  assert.equal(target.schedulerEvent.reason, "worker_reused");
  assert.deepEqual(calls.starts, []);
  assert.deepEqual(calls.healthy, ["lowgw1"]);
  assert.equal(calls.events[0].event, "run.gateway_worker_reused");
}

async function testOwnerExpandsToFourThenQueuesUntilRelease() {
  const { calls, scheduler } = createHarness();
  const workers = ["lowgw1", "lowgw2", "lowgw3", "lowgw4", "lowgw5"].map((profile) => (
    worker(profile, { allowedWorkspaceIds: ["owner"], skillWorkspaceIds: ["owner"] })
  ));
  const choose = (runId) => scheduler.chooseTarget({
    allWorkers: workers,
    candidates: workers,
    hints: { workspaceId: "owner", provider: "openai-codex", securityLevel: "user" },
    runId,
    onEvent: (event) => calls.events.push(event),
  });

  assert.equal((await choose("run-1")).profile, "lowgw1");
  assert.equal((await choose("run-2")).profile, "lowgw2");
  assert.equal((await choose("run-3")).profile, "lowgw3");
  assert.equal((await choose("run-4")).profile, "lowgw4");

  let settled = false;
  const queued = choose("run-5").then((target) => {
    settled = true;
    return target;
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(calls.events.at(-1).event, "run.gateway_worker_queued");
  assert.equal(calls.events.at(-1).reason, "workspace_capacity");

  scheduler.releaseRun("run-1", "idle");
  const target = await queued;
  assert.equal(settled, true);
  assert.equal(target.profile, "lowgw1");
  assert.equal(calls.starts.length, 4);
}

async function testNonOwnerExpandsToTwoThenQueues() {
  const { calls, scheduler } = createHarness({ config: { workspaceMaxWorkers: 2, globalMaxWorkers: 8 } });
  const workers = ["lowgw5", "lowgw6", "lowgw7"].map((profile) => (
    worker(profile, { allowedWorkspaceIds: ["weixin_test_1"], skillWorkspaceIds: ["weixin_test_1"] })
  ));
  const choose = (runId) => scheduler.chooseTarget({
    allWorkers: workers,
    candidates: workers,
    hints: { workspaceId: "weixin_test_1", provider: "openai-codex", securityLevel: "user" },
    runId,
    onEvent: (event) => calls.events.push(event),
  });

  assert.equal((await choose("run-a")).profile, "lowgw5");
  assert.equal((await choose("run-b")).profile, "lowgw6");
  const queued = choose("run-c");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls.events.at(-1).reason, "workspace_capacity");
  scheduler.releaseRun("run-a", "idle");
  assert.equal((await queued).profile, "lowgw5");
}

async function testGlobalCapQueuesBeforeWorkspaceCap() {
  const { calls, scheduler } = createHarness({ config: { ownerMaxWorkers: 4, workspaceMaxWorkers: 2, globalMaxWorkers: 2 } });
  const ownerWorkers = ["lowgw1", "lowgw2"].map((profile) => (
    worker(profile, { allowedWorkspaceIds: ["owner"], skillWorkspaceIds: ["owner"] })
  ));
  const userWorkers = ["lowgw5", "lowgw6"].map((profile) => (
    worker(profile, { allowedWorkspaceIds: ["weixin_test_1"], skillWorkspaceIds: ["weixin_test_1"] })
  ));
  await scheduler.chooseTarget({ allWorkers: [...ownerWorkers, ...userWorkers], candidates: ownerWorkers, hints: { workspaceId: "owner" }, runId: "run-1" });
  await scheduler.chooseTarget({ allWorkers: [...ownerWorkers, ...userWorkers], candidates: ownerWorkers, hints: { workspaceId: "owner" }, runId: "run-2" });

  const queued = scheduler.chooseTarget({
    allWorkers: [...ownerWorkers, ...userWorkers],
    candidates: userWorkers,
    hints: { workspaceId: "weixin_test_1" },
    runId: "run-3",
    onEvent: (event) => calls.events.push(event),
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls.events.at(-1).reason, "global_capacity");
  scheduler.releaseRun("run-1", "retired");
  assert.equal((await queued).profile, "lowgw5");
}

async function testProviderSwitchStartsMatchingProviderOnly() {
  const { calls, scheduler } = createHarness({ initialHealthy: ["lowgw1"] });
  const workers = [
    worker("lowgw1", { provider: "openai-codex", allowedWorkspaceIds: ["owner"], skillWorkspaceIds: ["owner"] }),
    worker("deepseekgw1", { provider: "deepseek", allowedWorkspaceIds: ["owner"], skillWorkspaceIds: ["owner"] }),
  ];
  scheduler.markWorkerWarm(workers[0], { workspaceId: "owner" });

  const target = await scheduler.chooseTarget({
    allWorkers: workers,
    candidates: [workers[1]],
    hints: { workspaceId: "owner", provider: "deepseek" },
    runId: "run-deepseek",
    onEvent: (event) => calls.events.push(event),
  });

  assert.equal(target.profile, "deepseekgw1");
  assert.deepEqual(calls.starts, ["deepseekgw1"]);
  assert.notEqual(buildGatewayWorkerCompatibilityKey(workers[0], { workspaceId: "owner", provider: "openai-codex" }), buildGatewayWorkerCompatibilityKey(workers[1], { workspaceId: "owner", provider: "deepseek" }));
}

async function testIdleReaperStopsOnlyExpiredIdleWorkers() {
  const { calls, scheduler, tick } = createHarness();
  const workers = [worker("lowgw1"), worker("lowgw2")];
  await scheduler.chooseTarget({ allWorkers: workers, candidates: workers, hints: { workspaceId: "owner" }, runId: "active-run" });
  await scheduler.chooseTarget({ allWorkers: workers, candidates: workers, hints: { workspaceId: "owner" }, runId: "idle-run" });
  scheduler.releaseRun("idle-run", "idle");
  tick(61_000);
  await scheduler.reapIdle(workers);
  assert.deepEqual(calls.stops, ["lowgw2"]);
  assert.equal(scheduler.status(workers).workers.find((item) => item.profile === "lowgw1").state, "busy");
}

async function testLaunchFailureUsesBoundedDiagnosticWithoutSecrets() {
  const calls = { events: [] };
  const scheduler = createGatewayElasticWorkerScheduler({
    nowMs: () => 1,
    config: { ownerMaxWorkers: 4, workspaceMaxWorkers: 2, globalMaxWorkers: 4, startTimeoutMs: 1000 },
    isHealthy: async () => false,
    startWorker: async () => {
      const err = new Error("port 18751 busy; key lowgw1-secret should stay private");
      err.code = "port_busy";
      throw err;
    },
  });
  const workers = [worker("lowgw1")];
  await assert.rejects(() => scheduler.chooseTarget({
    allWorkers: workers,
    candidates: workers,
    hints: { workspaceId: "owner" },
    runId: "run-fail",
    onEvent: (event) => calls.events.push(event),
  }), {
    code: "gateway_elastic_worker_start_failed",
  });
  assert.equal(calls.events.at(-1).event, "run.gateway_worker_start_failed");
  assert.equal(calls.events.at(-1).failureCode, "port_busy");
  assert.equal(JSON.stringify(calls.events).includes("lowgw1-secret"), false);
}

function testConfigDefaultsAndAliases() {
  const config = normalizeElasticSchedulerConfig({
    HERMES_MOBILE_GATEWAY_OWNER_MIN_WARM: "1",
    HERMES_WEB_GATEWAY_WORKSPACE_MAX_WORKERS: "2",
    HERMES_MOBILE_GATEWAY_WORKER_IDLE_TTL_MINUTES: "180",
  });
  assert.equal(config.ownerMinWarm, 1);
  assert.equal(config.workspaceMaxWorkers, 2);
  assert.equal(config.idleTtlMs, 180 * 60 * 1000);
}

(async () => {
  testConfigDefaultsAndAliases();
  await testStartupPlanKeepsOnlyOwnerWarmBaseline();
  await testWarmCompatibleWorkerIsReusedWithoutStarting();
  await testAlreadyRunningConfiguredWorkerIsReusedWithoutRestart();
  await testOwnerExpandsToFourThenQueuesUntilRelease();
  await testNonOwnerExpandsToTwoThenQueues();
  await testGlobalCapQueuesBeforeWorkspaceCap();
  await testProviderSwitchStartsMatchingProviderOnly();
  await testIdleReaperStopsOnlyExpiredIdleWorkers();
  await testLaunchFailureUsesBoundedDiagnosticWithoutSecrets();
  console.log("gateway elastic worker scheduler tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
