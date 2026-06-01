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
      ownerMaintenanceMaxWorkers: 2,
      workspaceMinWarm: 0,
      workspaceMaxWorkers: 2,
      globalMaxWorkers: 8,
      idleTtlMs: 60_000,
      startTimeoutMs: 5_000,
      startHealthWaitMs: 0,
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
    worker("deepseekgw1", { provider: "deepseek", allowedWorkspaceIds: ["owner"], skillWorkspaceIds: ["owner"] }),
    worker("lowgw1", { allowedWorkspaceIds: ["owner"], skillWorkspaceIds: ["owner"] }),
    worker("lowgw5", { allowedWorkspaceIds: ["weixin_test_1"], skillWorkspaceIds: ["weixin_test_1"] }),
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

async function testOwnerMaintenanceWorkersDoNotConsumeUserWorkerCap() {
  const { calls, scheduler } = createHarness({
    config: { ownerMaxWorkers: 4, workspaceMaxWorkers: 2, globalMaxWorkers: 8 },
    initialHealthy: ["officialclean1", "officialclean2", "deepseekmaint1"],
  });
  const maintenanceWorkers = [
    worker("officialclean1", { securityLevel: "owner-maintenance", allowedWorkspaceIds: ["owner"], skillWorkspaceIds: [] }),
    worker("officialclean2", { securityLevel: "owner-maintenance", allowedWorkspaceIds: ["owner"], skillWorkspaceIds: [] }),
    worker("deepseekmaint1", { provider: "deepseek", securityLevel: "owner-maintenance", allowedWorkspaceIds: ["owner"], skillWorkspaceIds: [] }),
  ];
  const userWorkers = ["lowgw1", "lowgw2", "lowgw3", "lowgw4", "lowgw5"].map((profile) => (
    worker(profile, { allowedWorkspaceIds: ["owner"], skillWorkspaceIds: ["owner"] })
  ));
  for (const item of maintenanceWorkers) scheduler.markWorkerWarm(item);
  const workers = [...maintenanceWorkers, ...userWorkers];
  const choose = (runId) => scheduler.chooseTarget({
    allWorkers: workers,
    candidates: userWorkers,
    hints: { workspaceId: "owner", provider: "openai-codex", securityLevel: "user" },
    runId,
    onEvent: (event) => calls.events.push(event),
  });

  assert.equal((await choose("run-owner-user-1")).profile, "lowgw1");
  assert.equal((await choose("run-owner-user-2")).profile, "lowgw2");
  assert.equal((await choose("run-owner-user-3")).profile, "lowgw3");
  assert.equal((await choose("run-owner-user-4")).profile, "lowgw4");

  const queued = choose("run-owner-user-5");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls.events.at(-1).reason, "workspace_capacity");
  scheduler.releaseRun("run-owner-user-1", "idle");
  assert.equal((await queued).profile, "lowgw1");
}

async function testOwnerMaintenanceUsesSeparateOnDemandCap() {
  const { calls, scheduler } = createHarness({
    config: { ownerMaxWorkers: 4, ownerMaintenanceMaxWorkers: 2, workspaceMaxWorkers: 2, globalMaxWorkers: 8 },
  });
  const maintenanceWorkers = [
    worker("officialclean1", { securityLevel: "owner-maintenance", allowedWorkspaceIds: ["owner"], skillWorkspaceIds: [] }),
    worker("officialclean2", { securityLevel: "owner-maintenance", allowedWorkspaceIds: ["owner"], skillWorkspaceIds: [] }),
    worker("officialclean3", { securityLevel: "owner-maintenance", allowedWorkspaceIds: ["owner"], skillWorkspaceIds: [] }),
  ];
  const choose = (runId) => scheduler.chooseTarget({
    allWorkers: maintenanceWorkers,
    candidates: maintenanceWorkers,
    hints: { workspaceId: "owner", provider: "openai-codex", securityLevel: "owner-maintenance", maintenance: true },
    runId,
    onEvent: (event) => calls.events.push(event),
  });

  assert.equal((await choose("run-maint-1")).profile, "officialclean1");
  assert.equal((await choose("run-maint-2")).profile, "officialclean2");

  const queued = choose("run-maint-3");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls.events.at(-1).event, "run.gateway_worker_queued");
  assert.equal(calls.events.at(-1).reason, "workspace_capacity");
  assert.deepEqual(calls.starts, ["officialclean1", "officialclean2"]);

  scheduler.releaseRun("run-maint-1", "idle");
  assert.equal((await queued).profile, "officialclean1");
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

async function testRunIdReplacementReleasesWorkerSlot() {
  const { calls, scheduler } = createHarness();
  const workers = [worker("lowgw6", { allowedWorkspaceIds: ["weixin_test_1"], skillWorkspaceIds: ["weixin_test_1"] })];

  assert.equal((await scheduler.chooseTarget({
    allWorkers: workers,
    candidates: workers,
    hints: { workspaceId: "weixin_test_1", provider: "openai-codex", securityLevel: "user" },
    runId: "web_public_run",
    onEvent: (event) => calls.events.push(event),
  })).profile, "lowgw6");
  assert.equal(scheduler.status(workers).workers[0].activeRunCount, 1);

  assert.equal(scheduler.replaceRun("web_public_run", "resp_real_run"), true);
  assert.equal(scheduler.releaseRun("resp_real_run", "idle"), true);
  assert.equal(scheduler.status(workers).workers[0].activeRunCount, 0);
  assert.equal(scheduler.status(workers).workers[0].state, "idle");
  assert.equal(scheduler.releaseRun("web_public_run", "idle"), false);
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

async function testOwnerDeepSeekUsesSeparateTwoWorkerCapAndNoWarmBaseline() {
  const { calls, scheduler } = createHarness({
    config: { ownerMaxWorkers: 4, ownerDeepSeekMaxWorkers: 2, globalMaxWorkers: 8 },
  });
  const openaiWorkers = ["lowgw1", "lowgw2", "lowgw3", "lowgw4"].map((profile) => (
    worker(profile, { provider: "openai-codex", allowedWorkspaceIds: ["owner"], skillWorkspaceIds: ["owner"] })
  ));
  const deepseekWorkers = ["deepseekgw1", "deepseekgw2", "deepseekgw3"].map((profile) => (
    worker(profile, { provider: "deepseek", allowedWorkspaceIds: ["owner"], skillWorkspaceIds: ["owner"] })
  ));
  const workers = [...deepseekWorkers, ...openaiWorkers];
  assert.deepEqual(scheduler.planHybridStartup(workers).startProfiles, ["lowgw1"]);

  const chooseOpenAi = (runId) => scheduler.chooseTarget({
    allWorkers: workers,
    candidates: openaiWorkers,
    hints: { workspaceId: "owner", provider: "openai-codex", securityLevel: "user" },
    runId,
  });
  const chooseDeepSeek = (runId) => scheduler.chooseTarget({
    allWorkers: workers,
    candidates: deepseekWorkers,
    hints: { workspaceId: "owner", provider: "deepseek", securityLevel: "user" },
    runId,
    onEvent: (event) => calls.events.push(event),
  });

  assert.equal((await chooseOpenAi("run-openai-1")).profile, "lowgw1");
  assert.equal((await chooseOpenAi("run-openai-2")).profile, "lowgw2");
  assert.equal((await chooseOpenAi("run-openai-3")).profile, "lowgw3");
  assert.equal((await chooseOpenAi("run-openai-4")).profile, "lowgw4");
  assert.equal((await chooseDeepSeek("run-deepseek-1")).profile, "deepseekgw1");
  assert.equal((await chooseDeepSeek("run-deepseek-2")).profile, "deepseekgw2");

  const queued = chooseDeepSeek("run-deepseek-3");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls.events.at(-1).event, "run.gateway_worker_queued");
  assert.equal(calls.events.at(-1).reason, "workspace_capacity");
  scheduler.releaseRun("run-deepseek-1", "idle");
  assert.equal((await queued).profile, "deepseekgw1");
}

async function testNonOwnerDeepSeekUsesSingleWorkerCapSeparateFromOpenAi() {
  const { calls, scheduler } = createHarness({
    config: { workspaceMaxWorkers: 2, workspaceDeepSeekMaxWorkers: 1, globalMaxWorkers: 8 },
  });
  const openaiWorkers = ["lowgw5", "lowgw13"].map((profile) => (
    worker(profile, { provider: "openai-codex", allowedWorkspaceIds: ["weixin_wuping"], skillWorkspaceIds: ["weixin_wuping"] })
  ));
  const deepseekWorkers = ["deepseekgw5", "deepseekgw13"].map((profile) => (
    worker(profile, { provider: "deepseek", allowedWorkspaceIds: ["weixin_wuping"], skillWorkspaceIds: ["weixin_wuping"] })
  ));
  const workers = [...openaiWorkers, ...deepseekWorkers];
  const chooseOpenAi = (runId) => scheduler.chooseTarget({
    allWorkers: workers,
    candidates: openaiWorkers,
    hints: { workspaceId: "weixin_wuping", provider: "openai-codex", securityLevel: "user" },
    runId,
  });
  const chooseDeepSeek = (runId) => scheduler.chooseTarget({
    allWorkers: workers,
    candidates: deepseekWorkers,
    hints: { workspaceId: "weixin_wuping", provider: "deepseek", securityLevel: "user" },
    runId,
    onEvent: (event) => calls.events.push(event),
  });

  assert.equal((await chooseOpenAi("run-openai-a")).profile, "lowgw5");
  assert.equal((await chooseOpenAi("run-openai-b")).profile, "lowgw13");
  assert.equal((await chooseDeepSeek("run-deepseek-a")).profile, "deepseekgw5");

  const queued = chooseDeepSeek("run-deepseek-b");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls.events.at(-1).reason, "workspace_capacity");
  scheduler.releaseRun("run-deepseek-a", "idle");
  assert.equal((await queued).profile, "deepseekgw5");
}

async function testPostStartHealthPollAvoidsEarlyFalseFailure() {
  let now = 1_778_000_000_000;
  const calls = { events: [], starts: [], healthy: [], sleeps: [] };
  let healthyAfterChecks = 0;
  const scheduler = createGatewayElasticWorkerScheduler({
    nowMs: () => now,
    sleep: async (ms) => {
      calls.sleeps.push(ms);
      now += ms;
    },
    config: {
      ownerMaxWorkers: 4,
      workspaceMaxWorkers: 2,
      globalMaxWorkers: 4,
      startTimeoutMs: 1000,
      startHealthWaitMs: 3000,
      startHealthPollMs: 500,
    },
    isHealthy: async (candidate) => {
      calls.healthy.push(candidate.profile);
      healthyAfterChecks += 1;
      return healthyAfterChecks >= 3;
    },
    startWorker: async (candidate) => {
      calls.starts.push(candidate.profile);
      return { ok: true };
    },
  });

  const target = await scheduler.chooseTarget({
    allWorkers: [worker("lowgw6")],
    candidates: [worker("lowgw6")],
    hints: { workspaceId: "weixin_test_1" },
    runId: "run-delayed-health",
    onEvent: (event) => calls.events.push(event),
  });

  assert.equal(target.profile, "lowgw6");
  assert.deepEqual(calls.starts, ["lowgw6"]);
  assert.equal(calls.healthy.length, 3);
  assert.deepEqual(calls.sleeps, [500]);
  assert.equal(calls.events.at(-1).event, "run.gateway_worker_started");
}

async function testWildcardWarmWorkerDoesNotPinSyntheticWorkspace() {
  const { calls, scheduler } = createHarness({ initialHealthy: ["grokgw1"] });
  const grok = worker("grokgw1", {
    provider: "xai-oauth",
    allowedWorkspaceIds: ["*"],
    skillWorkspaceIds: ["*"],
    skillProfile: "grok",
  });

  scheduler.markWorkerWarm(grok);
  const target = await scheduler.chooseTarget({
    allWorkers: [grok],
    candidates: [grok],
    hints: {
      workspaceId: "owner",
      provider: "xai-oauth",
      securityLevel: "user",
      preferred_worker_profiles: ["grokgw1"],
    },
    runId: "run-grok-owner",
    onEvent: (event) => calls.events.push(event),
  });

  assert.equal(target.profile, "grokgw1");
  assert.deepEqual(calls.starts, []);
  assert.equal(calls.events.at(-1).event, "run.gateway_worker_reused");
  assert.equal(scheduler.status([grok]).queueDepth, 0);
}

async function testStatusReconciliationWakesProfileAffinityQueue() {
  const { calls, scheduler } = createHarness({
    initialHealthy: ["grokgw1"],
    config: { workspaceMaxWorkers: 2, globalMaxWorkers: 8, queueWaitTimeoutMs: 30_000 },
  });
  const grok = worker("grokgw1", {
    provider: "xai-oauth",
    allowedWorkspaceIds: ["*"],
    skillWorkspaceIds: ["*"],
    skillProfile: "grok",
  });

  scheduler.markWorkerWarm(grok, { workspaceId: "other_workspace", provider: "xai-oauth" });
  const queued = scheduler.chooseTarget({
    allWorkers: [grok],
    candidates: [grok],
    hints: { workspaceId: "owner", provider: "xai-oauth", securityLevel: "user" },
    runId: "run-grok-queued",
    onEvent: (event) => calls.events.push(event),
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(scheduler.status([grok]).queueDepth, 1);
  assert.equal(calls.events.at(-1).reason, "profile_affinity");

  scheduler.markWorkerWarm(grok);
  const target = await queued;
  assert.equal(target.profile, "grokgw1");
  assert.equal(scheduler.status([grok]).queueDepth, 0);
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
      err.details = {
        stderr: "nested script said workspace_key abcdefghijklmnopqrstuvwxyz and port is busy",
        stdout: "LOW_GATEWAYS_STARTED should not be treated as success here",
      };
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
  assert.match(calls.events.at(-1).diagnostic, /nested script said/);
  assert.match(calls.events.at(-1).diagnostic, /stdout:/);
  assert.equal(JSON.stringify(calls.events).includes("lowgw1-secret"), false);
  assert.equal(JSON.stringify(calls.events).includes("abcdefghijklmnopqrstuvwxyz"), false);
}

function testConfigDefaultsAndAliases() {
  const config = normalizeElasticSchedulerConfig({
    HERMES_MOBILE_GATEWAY_OWNER_MIN_WARM: "1",
    HERMES_WEB_GATEWAY_OWNER_MAINTENANCE_MAX_WORKERS: "2",
    HERMES_WEB_GATEWAY_WORKSPACE_MAX_WORKERS: "2",
    HERMES_MOBILE_GATEWAY_WORKER_IDLE_TTL_MINUTES: "180",
  });
  assert.equal(config.ownerMinWarm, 1);
  assert.equal(config.ownerMaintenanceMaxWorkers, 2);
  assert.equal(config.workspaceMaxWorkers, 2);
  assert.equal(config.ownerDeepSeekMaxWorkers, 2);
  assert.equal(config.workspaceDeepSeekMaxWorkers, 1);
  assert.equal(config.idleTtlMs, 180 * 60 * 1000);
  assert.equal(normalizeElasticSchedulerConfig({}).startTimeoutMs, 300_000);
  assert.equal(normalizeElasticSchedulerConfig({}).startHealthWaitMs, 30_000);
}

(async () => {
  testConfigDefaultsAndAliases();
  await testStartupPlanKeepsOnlyOwnerWarmBaseline();
  await testWarmCompatibleWorkerIsReusedWithoutStarting();
  await testAlreadyRunningConfiguredWorkerIsReusedWithoutRestart();
  await testOwnerExpandsToFourThenQueuesUntilRelease();
  await testOwnerMaintenanceWorkersDoNotConsumeUserWorkerCap();
  await testOwnerMaintenanceUsesSeparateOnDemandCap();
  await testNonOwnerExpandsToTwoThenQueues();
  await testRunIdReplacementReleasesWorkerSlot();
  await testGlobalCapQueuesBeforeWorkspaceCap();
  await testProviderSwitchStartsMatchingProviderOnly();
  await testOwnerDeepSeekUsesSeparateTwoWorkerCapAndNoWarmBaseline();
  await testNonOwnerDeepSeekUsesSingleWorkerCapSeparateFromOpenAi();
  await testPostStartHealthPollAvoidsEarlyFalseFailure();
  await testWildcardWarmWorkerDoesNotPinSyntheticWorkspace();
  await testStatusReconciliationWakesProfileAffinityQueue();
  await testIdleReaperStopsOnlyExpiredIdleWorkers();
  await testLaunchFailureUsesBoundedDiagnosticWithoutSecrets();
  console.log("gateway elastic worker scheduler tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
