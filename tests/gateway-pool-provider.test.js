"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createGatewayPoolProvider, normalizeSecurityLevel, normalizeWorker, orderedWorkers } = require("../adapters/gateway-pool-provider");
const { createGatewayRunner } = require("../adapters/gateway-runner");

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: init.status || 200,
    headers: Object.assign({ "content-type": "application/json" }, init.headers || {}),
  });
}

function tempManifest(value) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-gateway-pool-"));
  const file = path.join(dir, "worker-pool.json");
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return { dir, file };
}

function testNormalizeWorker() {
  assert.deepEqual(normalizeWorker({ profile: "worker1", port: 8651, api_key: "k" }), {
    id: "worker1",
    name: "worker1",
    profile: "worker1",
    apiBase: "http://127.0.0.1:8651",
    apiKey: "k",
    provider: "",
    tags: [],
    toolsets: [],
    securityLevel: "unspecified",
    allowedWorkspaceIds: [],
    allowMaintenance: false,
    skillProfile: "",
    skillWorkspaceIds: [],
    telemetryProfile: "worker1",
    telemetryStateDbPath: "",
    telemetryResponseStoreDbPath: "",
  });
  const skillWorker = normalizeWorker({
    profile: "lowgw5",
    port: 18755,
    security_level: "low",
    skill_profile: "workspace:weixin_example_user",
    skill_workspace_ids: "weixin_example_user,weixin_test",
  });
  assert.equal(skillWorker.skillProfile, "workspace:weixin_example_user");
  assert.deepEqual(skillWorker.skillWorkspaceIds, ["weixin_example_user", "weixin_test"]);
  assert.deepEqual(normalizeWorker({ profile: "toolgw", port: 18777, toolsets: ["web", "finance"] }).toolsets, ["web", "finance"]);
  assert.equal(normalizeSecurityLevel("low-privilege"), "user");
  assert.equal(normalizeSecurityLevel("admin"), "owner-maintenance");
  assert.equal(normalizeWorker({ enabled: false, port: 1 }), null);
}

function testOrderingHonorsHints() {
  const workers = [
    normalizeWorker({ name: "a", profile: "worker1", port: 8651, tags: ["fast"], securityLevel: "user" }),
    normalizeWorker({ name: "b", profile: "worker2", port: 8652, tags: ["gpu"], securityLevel: "user" }),
    normalizeWorker({ name: "c", profile: "worker3", port: 8653, tags: ["fast"], securityLevel: "user" }),
  ];
  assert.deepEqual(orderedWorkers(workers, 1, {}).map((w) => w.name), ["b", "c", "a"]);
  assert.deepEqual(orderedWorkers(workers, 0, { worker_tags: ["fast"] }).map((w) => w.name), ["a", "c"]);
  assert.deepEqual(orderedWorkers(workers, 0, { worker_profile: "worker2" }).map((w) => w.name), ["b"]);
}

function testOrderingHonorsProviderAndPreferredProfileHints() {
  const workers = [
    normalizeWorker({ name: "openai", profile: "lowgw1", port: 18751, provider: "openai-codex", securityLevel: "user", skillWorkspaceIds: ["*"] }),
    normalizeWorker({ name: "grok", profile: "grokgw1", port: 18761, provider: "xai-oauth", securityLevel: "user", skillWorkspaceIds: ["*"] }),
    normalizeWorker({ name: "deepseek-owner", profile: "deepseekgw1", port: 18764, provider: "deepseek", securityLevel: "user", allowedWorkspaceIds: ["owner"], skillWorkspaceIds: ["owner"] }),
    normalizeWorker({ name: "deepseek-owner-extra", profile: "deepseekgw2", port: 18767, provider: "deepseek", securityLevel: "user", allowedWorkspaceIds: ["owner"], skillWorkspaceIds: ["owner"] }),
    normalizeWorker({ name: "deepseek-wuping", profile: "deepseekgw5", port: 18765, provider: "deepseek", securityLevel: "user", skillWorkspaceIds: ["weixin_wuping"] }),
    normalizeWorker({ name: "deepseek-other", profile: "deepseekgw6", port: 18768, provider: "deepseek", securityLevel: "user", allowedWorkspaceIds: ["weixin_example_user"], skillWorkspaceIds: ["weixin_example_user"] }),
    normalizeWorker({ name: "deepseek-owner-99", profile: "deepseekgw99", port: 18766, provider: "deepseek", securityLevel: "user", allowedWorkspaceIds: ["owner"], skillWorkspaceIds: ["owner"] }),
  ];
  assert.deepEqual(
    orderedWorkers(workers, 1, { securityLevel: "user" }).map((w) => w.name),
    ["openai"],
  );
  assert.deepEqual(
    orderedWorkers(workers, 0, { provider: "xai-oauth", preferred_worker_profiles: ["grokgw1"], skillWorkspaceId: "owner", requireSkillProfile: true }).map((w) => w.name),
    ["grok"],
  );
  assert.deepEqual(
    orderedWorkers(workers, 0, { provider: "deepseek", preferred_worker_profiles: ["deepseekgw1", "deepseekgw2", "deepseekgw99", "deepseekgw5"], workspaceId: "owner", skillWorkspaceId: "owner", requireSkillProfile: true }).map((w) => w.name),
    ["deepseek-owner", "deepseek-owner-extra", "deepseek-owner-99"],
  );
  assert.deepEqual(
    orderedWorkers(workers, 0, { provider: "deepseek", preferred_worker_profiles: ["deepseekgw1", "deepseekgw2", "deepseekgw99", "deepseekgw5"], workspaceId: "weixin_wuping", skillWorkspaceId: "weixin_wuping", requireSkillProfile: true }).map((w) => w.name),
    ["deepseek-wuping"],
  );
  assert.deepEqual(
    orderedWorkers(workers, 0, { provider: "deepseek", preferred_worker_profiles: ["deepseekgw1", "deepseekgw2", "deepseekgw99", "deepseekgw5"], workspaceId: "weixin_example_user", skillWorkspaceId: "weixin_example_user", requireSkillProfile: true }).map((w) => w.name),
    ["deepseek-other"],
  );
  assert.deepEqual(
    orderedWorkers(workers, 0, { provider: "deepseek", preferred_worker_profiles: ["deepseekgw1", "deepseekgw2", "deepseekgw99", "deepseekgw5"], workspaceId: "unknown", skillWorkspaceId: "unknown", requireSkillProfile: true }).map((w) => w.name),
    [],
  );
}

function testOrderingHonorsSkillWorkspaceHints() {
  const workers = [
    normalizeWorker({ name: "owner", profile: "lowgw1", port: 18751, securityLevel: "user", skillWorkspaceIds: ["owner"] }),
    normalizeWorker({ name: "example_user", profile: "lowgw5", port: 18755, securityLevel: "user", skillWorkspaceIds: ["weixin_example_user"] }),
    normalizeWorker({ name: "shared", profile: "lowgw10", port: 18760, securityLevel: "user", skillWorkspaceIds: ["*"] }),
  ];
  assert.deepEqual(
    orderedWorkers(workers, 0, { securityLevel: "user", skillWorkspaceId: "owner", requireSkillProfile: true }).map((w) => w.name),
    ["owner", "shared"],
  );
  assert.deepEqual(
    orderedWorkers(workers, 0, { securityLevel: "user", skillWorkspaceId: "weixin_example_user", requireSkillProfile: true }).map((w) => w.name),
    ["example_user", "shared"],
  );
  assert.deepEqual(
    orderedWorkers(workers, 0, { securityLevel: "user", skillWorkspaceId: "unknown", requireSkillProfile: true }).map((w) => w.name),
    ["shared"],
  );
}

function testOrderingHonorsRequiredToolsetsWithinWorkspaceProfilePool() {
  const workers = [
    normalizeWorker({
      name: "owner-complete",
      profile: "lowgw1",
      port: 18751,
      provider: "openai-codex",
      securityLevel: "user",
      allowedWorkspaceIds: ["owner"],
      skillWorkspaceIds: ["owner"],
      toolsets: ["web", "search", "finance"],
    }),
    normalizeWorker({
      name: "owner-stale",
      profile: "lowgw10",
      port: 18760,
      provider: "openai-codex",
      securityLevel: "user",
      allowedWorkspaceIds: ["owner"],
      skillWorkspaceIds: ["owner"],
      toolsets: ["web", "search"],
    }),
    normalizeWorker({
      name: "wuping-finance",
      profile: "lowgw13",
      port: 18763,
      provider: "openai-codex",
      securityLevel: "user",
      allowedWorkspaceIds: ["weixin_wuping"],
      skillWorkspaceIds: ["weixin_wuping"],
      toolsets: ["web", "search", "finance"],
    }),
  ];
  assert.deepEqual(
    orderedWorkers(workers, 1, {
      provider: "openai-codex",
      securityLevel: "user",
      workspaceId: "owner",
      skillWorkspaceId: "owner",
      requireSkillProfile: true,
      requiredToolsets: ["finance"],
    }).map((w) => w.name),
    ["owner-complete"],
  );
  assert.deepEqual(
    orderedWorkers(workers, 0, {
      provider: "openai-codex",
      securityLevel: "user",
      workspaceId: "owner",
      skillWorkspaceId: "owner",
      requireSkillProfile: true,
      requiredToolsets: ["finance", "health"],
    }).map((w) => w.name),
    [],
  );
}

async function testChooseTargetHonorsProfileConfigToolsets() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-gateway-profile-config-"));
  const goodProfileDir = path.join(dir, "telemetry", "profiles", "lowgw1");
  const staleProfileDir = path.join(dir, "telemetry", "profiles", "lowgw10");
  fs.mkdirSync(goodProfileDir, { recursive: true });
  fs.mkdirSync(staleProfileDir, { recursive: true });
  fs.writeFileSync(path.join(goodProfileDir, "config.yaml"), [
    "model:",
    "  provider: openai-codex",
    "toolsets:",
    "  - web",
    "  - finance",
    "platform_toolsets:",
    "  api_server:",
    "    - web",
    "    - finance",
  ].join("\n"), "utf8");
  fs.writeFileSync(path.join(staleProfileDir, "config.yaml"), [
    "model:",
    "  provider: openai-codex",
    "toolsets:",
    "  - web",
  ].join("\n"), "utf8");
  const manifest = tempManifest({
    enabled: true,
    workers: [
      {
        name: "stale-owner",
        profile: "lowgw10",
        port: 18760,
        provider: "openai-codex",
        securityLevel: "user",
        allowedWorkspaceIds: ["owner"],
        skillWorkspaceIds: ["owner"],
        telemetryStateDbPath: path.join(staleProfileDir, "state.db"),
      },
      {
        name: "finance-owner",
        profile: "lowgw1",
        port: 18751,
        provider: "openai-codex",
        securityLevel: "user",
        allowedWorkspaceIds: ["owner"],
        skillWorkspaceIds: ["owner"],
        telemetryStateDbPath: path.join(goodProfileDir, "state.db"),
      },
    ],
  });
  const provider = createGatewayPoolProvider({
    enabled: "auto",
    manifestPaths: [manifest.file],
    fallbackApiBase: "http://fallback.example.test",
    createGatewayRunner,
    fetchImpl: async () => jsonResponse({ status: "ok" }),
  });
  const chosen = await provider.chooseTarget({
    provider: "openai-codex",
    securityLevel: "user",
    workspaceId: "owner",
    skillWorkspaceId: "owner",
    requireSkillProfile: true,
    requiredToolsets: ["finance"],
  });
  assert.equal(chosen.name, "finance-owner");
  fs.rmSync(manifest.dir, { recursive: true, force: true });
  fs.rmSync(dir, { recursive: true, force: true });
}

async function testChooseHealthyWorkerAndLookupSecretByUrl() {
  const manifest = tempManifest({
    enabled: true,
    workers: [
      { name: "bad", profile: "worker1", host: "127.0.0.1", port: 8651, api_key: "bad-key", enabled: true, securityLevel: "user" },
      { name: "good", profile: "worker2", host: "127.0.0.1", port: 8652, api_key: "good-key", enabled: true, securityLevel: "user" },
    ],
  });
  const auth = [];
  const provider = createGatewayPoolProvider({
    enabled: "auto",
    manifestPaths: [manifest.file],
    fallbackApiBase: "http://fallback.example.test",
    fallbackApiKey: "fallback-key",
    createGatewayRunner,
    fetchImpl: async (url, options) => {
      auth.push(options.headers.Authorization);
      if (url.includes(":8651/")) return jsonResponse({ error: "down" }, { status: 503 });
      return jsonResponse({ status: "ok" });
    },
  });

  const chosen = await provider.chooseTarget();
  assert.equal(chosen.name, "good");
  assert.equal(chosen.apiBase, "http://127.0.0.1:8652");
  assert.equal(chosen.apiKey, "good-key");
  assert.deepEqual(auth, ["Bearer bad-key", "Bearer good-key"]);
  assert.equal(provider.targetForGatewayUrl("http://127.0.0.1:8652/").apiKey, "good-key");
  fs.rmSync(manifest.dir, { recursive: true, force: true });
}

async function testChooseHonorsSkillWorkspaceIds() {
  const manifest = tempManifest({
    enabled: true,
    workers: [
      { name: "owner", profile: "lowgw1", port: 18751, securityLevel: "user", allowedWorkspaceIds: ["*"], skillWorkspaceIds: ["owner"] },
      { name: "example_user", profile: "lowgw5", port: 18755, securityLevel: "user", allowedWorkspaceIds: ["*"], skillWorkspaceIds: ["weixin_example_user"] },
    ],
  });
  const provider = createGatewayPoolProvider({
    enabled: "auto",
    manifestPaths: [manifest.file],
    fallbackApiBase: "http://fallback.example.test",
    createGatewayRunner,
    fetchImpl: async () => jsonResponse({ status: "ok" }),
  });
  const chosen = await provider.chooseTarget({
    securityLevel: "user",
    workspaceId: "weixin_example_user",
    skillWorkspaceId: "weixin_example_user",
  });
  assert.equal(chosen.name, "example_user");
  fs.rmSync(manifest.dir, { recursive: true, force: true });
}

async function testSkillRoutingStaysCompatibleWithoutManifestFields() {
  const manifest = tempManifest({
    enabled: true,
    workers: [
      { name: "legacy", profile: "worker1", port: 18751, securityLevel: "user", allowedWorkspaceIds: ["*"] },
    ],
  });
  const provider = createGatewayPoolProvider({
    enabled: "auto",
    manifestPaths: [manifest.file],
    fallbackApiBase: "http://fallback.example.test",
    createGatewayRunner,
    fetchImpl: async () => jsonResponse({ status: "ok" }),
  });
  const chosen = await provider.chooseTarget({
    securityLevel: "user",
    workspaceId: "owner",
    skillWorkspaceId: "owner",
  });
  assert.equal(chosen.name, "legacy");
  await assert.rejects(() => provider.chooseTarget({
    securityLevel: "user",
    workspaceId: "owner",
    skillWorkspaceId: "owner",
    requireSkillProfile: true,
  }), {
    code: "gateway_user_worker_unavailable",
  });
  fs.rmSync(manifest.dir, { recursive: true, force: true });
}

async function testFallsBackWhenManifestMissing() {
  const provider = createGatewayPoolProvider({
    enabled: "auto",
    manifestPaths: [path.join(os.tmpdir(), `missing-${Date.now()}.json`)],
    fallbackApiBase: "http://fallback.example.test/",
    fallbackApiKey: "fallback-key",
    createGatewayRunner,
    fetchImpl: async () => jsonResponse({ status: "ok" }),
  });
  const chosen = await provider.chooseTarget({ securityLevel: "owner-maintenance", maintenance: true });
  assert.equal(chosen.source, "fallback");
  assert.equal(chosen.apiBase, "http://fallback.example.test");
  assert.equal(chosen.apiKey, "fallback-key");
}

async function testProviderSpecificOwnerMaintenanceFailsClosedWithoutWorker() {
  const manifest = tempManifest({
    enabled: true,
    workers: [
      { name: "openai-maint", profile: "officialclean1", host: "127.0.0.1", port: 18651, provider: "openai-codex", securityLevel: "owner-maintenance", allowMaintenance: true },
    ],
  });
  const provider = createGatewayPoolProvider({
    enabled: "auto",
    manifestPaths: [manifest.file],
    fallbackApiBase: "http://fallback.example.test/",
    fallbackApiKey: "fallback-key",
    createGatewayRunner,
    fetchImpl: async () => jsonResponse({ status: "ok" }),
  });
  await assert.rejects(() => provider.chooseTarget({
    provider: "deepseek",
    securityLevel: "owner-maintenance",
    maintenance: true,
  }), {
    code: "gateway_provider_worker_unavailable",
  });
  fs.rmSync(manifest.dir, { recursive: true, force: true });
}

async function testProviderSpecificOwnerMaintenanceChoosesDeepSeekWorker() {
  const manifest = tempManifest({
    enabled: true,
    workers: [
      { name: "openai-maint", profile: "officialclean1", host: "127.0.0.1", port: 18651, provider: "openai-codex", securityLevel: "owner-maintenance", allowMaintenance: true },
      { name: "deepseek-maint", profile: "deepseekmaint1", host: "127.0.0.1", port: 18653, provider: "deepseek", securityLevel: "owner-maintenance", allowMaintenance: true },
    ],
  });
  const provider = createGatewayPoolProvider({
    enabled: "auto",
    manifestPaths: [manifest.file],
    fallbackApiBase: "http://fallback.example.test/",
    fallbackApiKey: "fallback-key",
    createGatewayRunner,
    fetchImpl: async () => jsonResponse({ status: "ok" }),
  });
  const chosen = await provider.chooseTarget({
    provider: "deepseek",
    securityLevel: "owner-maintenance",
    maintenance: true,
    preferred_worker_profiles: ["deepseekmaint1"],
  });
  assert.equal(chosen.name, "deepseek-maint");
  assert.equal(chosen.source, "worker_pool");
  fs.rmSync(manifest.dir, { recursive: true, force: true });
}

async function testUserRunsFailClosedWithoutUserWorker() {
  const manifest = tempManifest({
    enabled: true,
    workers: [
      { name: "admin", profile: "owner", host: "127.0.0.1", port: 8653, securityLevel: "owner-maintenance" },
    ],
  });
  const provider = createGatewayPoolProvider({
    enabled: "auto",
    manifestPaths: [manifest.file],
    fallbackApiBase: "http://fallback.example.test",
    createGatewayRunner,
    fetchImpl: async () => jsonResponse({ status: "ok" }),
  });
  await assert.rejects(() => provider.chooseTarget({ securityLevel: "user", workspaceId: "weixin_example_user" }), {
    code: "gateway_user_worker_unavailable",
  });
  const chosen = await provider.chooseTarget({ securityLevel: "owner-maintenance", maintenance: true });
  assert.equal(chosen.name, "admin");
  fs.rmSync(manifest.dir, { recursive: true, force: true });
}

async function testHybridModeStartsCompatibleWorkerAndEmitsBoundedEvents() {
  const manifest = tempManifest({
    enabled: true,
    workers: [
      { name: "owner-openai", profile: "lowgw1", port: 18751, api_key: "owner-secret", provider: "openai-codex", securityLevel: "user", allowedWorkspaceIds: ["owner"], skillWorkspaceIds: ["owner"] },
      { name: "owner-deepseek", profile: "deepseekgw1", port: 18764, api_key: "deepseek-secret", provider: "deepseek", securityLevel: "user", allowedWorkspaceIds: ["owner"], skillWorkspaceIds: ["owner"] },
    ],
  });
  const healthyProfiles = new Set();
  const started = [];
  const events = [];
  const provider = createGatewayPoolProvider({
    enabled: "auto",
    startMode: "hybrid",
    elastic: { ownerMaxWorkers: 4, workspaceMaxWorkers: 2, globalMaxWorkers: 4 },
    manifestPaths: [manifest.file],
    fallbackApiBase: "http://fallback.example.test",
    createGatewayRunner,
    startWorkerProfile: async (worker) => {
      started.push(worker.profile);
      healthyProfiles.add(worker.profile);
    },
    fetchImpl: async (url) => {
      if (url.includes(":18764/") && healthyProfiles.has("deepseekgw1")) return jsonResponse({ status: "ok" });
      if (url.includes(":18751/") && healthyProfiles.has("lowgw1")) return jsonResponse({ status: "ok" });
      return jsonResponse({ error: "down" }, { status: 503 });
    },
  });

  const chosen = await provider.chooseTarget({
    provider: "deepseek",
    securityLevel: "user",
    workspaceId: "owner",
    skillWorkspaceId: "owner",
  }, {
    runId: "run-deepseek",
    onEvent: (event) => events.push(event),
  });

  assert.equal(chosen.profile, "deepseekgw1");
  assert.deepEqual(started, ["deepseekgw1"]);
  assert.deepEqual(events.map((event) => event.event), [
    "run.gateway_worker_starting",
    "run.gateway_worker_started",
  ]);
  assert.equal(JSON.stringify(events).includes("deepseek-secret"), false);
  fs.rmSync(manifest.dir, { recursive: true, force: true });
}

async function testHybridModeStartsOwnerMaintenanceProfileOnDemand() {
  const manifest = tempManifest({
    enabled: true,
    workers: [
      { name: "openai-maint", profile: "officialclean1", port: 18651, api_key: "owner-maint-secret", provider: "openai-codex", securityLevel: "owner-maintenance", allowMaintenance: true, allowedWorkspaceIds: ["owner"] },
      { name: "deepseek-maint", profile: "deepseekmaint1", port: 18653, api_key: "deepseek-maint-secret", provider: "deepseek", securityLevel: "owner-maintenance", allowMaintenance: true, allowedWorkspaceIds: ["owner"] },
    ],
  });
  const healthyProfiles = new Set();
  const started = [];
  const events = [];
  const provider = createGatewayPoolProvider({
    enabled: "auto",
    startMode: "hybrid",
    elastic: { ownerMaintenanceMaxWorkers: 2, globalMaxWorkers: 4 },
    manifestPaths: [manifest.file],
    fallbackApiBase: "http://fallback.example.test",
    createGatewayRunner,
    startWorkerProfile: async (worker) => {
      started.push(worker.profile);
      healthyProfiles.add(worker.profile);
    },
    fetchImpl: async (url) => {
      if (url.includes(":18653/") && healthyProfiles.has("deepseekmaint1")) return jsonResponse({ status: "ok" });
      if (url.includes(":18651/") && healthyProfiles.has("officialclean1")) return jsonResponse({ status: "ok" });
      return jsonResponse({ error: "down" }, { status: 503 });
    },
  });

  const chosen = await provider.chooseTarget({
    provider: "deepseek",
    securityLevel: "owner-maintenance",
    maintenance: true,
    workspaceId: "owner",
  }, {
    runId: "run-maint-deepseek",
    onEvent: (event) => events.push(event),
  });

  assert.equal(chosen.profile, "deepseekmaint1");
  assert.deepEqual(started, ["deepseekmaint1"]);
  assert.deepEqual(events.map((event) => event.event), [
    "run.gateway_worker_starting",
    "run.gateway_worker_started",
  ]);
  assert.equal(JSON.stringify(events).includes("deepseek-maint-secret"), false);
  fs.rmSync(manifest.dir, { recursive: true, force: true });
}

async function testHybridStatusReportsConfiguredStoppedAsExpectedState() {
  const manifest = tempManifest({
    enabled: true,
    workers: [
      { name: "owner-openai", profile: "lowgw1", port: 18751, provider: "openai-codex", securityLevel: "user", allowedWorkspaceIds: ["owner"], skillWorkspaceIds: ["owner"] },
      { name: "child-openai", profile: "lowgw5", port: 18755, provider: "openai-codex", securityLevel: "user", allowedWorkspaceIds: ["weixin_test_1"], skillWorkspaceIds: ["weixin_test_1"] },
    ],
  });
  const provider = createGatewayPoolProvider({
    enabled: "auto",
    startMode: "hybrid",
    manifestPaths: [manifest.file],
    fallbackApiBase: "http://fallback.example.test",
    createGatewayRunner,
    fetchImpl: async () => jsonResponse({ error: "not running" }, { status: 503 }),
  });

  const status = await provider.status();
  assert.equal(status.mode, "hybrid");
  assert.equal(status.elastic, true);
  assert.equal(status.runningWorkerCount, 0);
  assert.deepEqual(status.workers.map((item) => item.state), ["configured", "configured"]);
  assert.deepEqual(status.workers.map((item) => item.expectedRunning), [false, false]);
  assert.deepEqual(status.workers.map((item) => item.healthy), [null, null]);
  fs.rmSync(manifest.dir, { recursive: true, force: true });
}

async function testHybridStatusObservesAlreadyRunningWarmWorker() {
  const manifest = tempManifest({
    enabled: true,
    workers: [
      { name: "owner-openai", profile: "lowgw1", port: 18751, provider: "openai-codex", securityLevel: "user", allowedWorkspaceIds: ["owner"], skillWorkspaceIds: ["owner"] },
      { name: "child-openai", profile: "lowgw5", port: 18755, provider: "openai-codex", securityLevel: "user", allowedWorkspaceIds: ["weixin_test_1"], skillWorkspaceIds: ["weixin_test_1"] },
    ],
  });
  const provider = createGatewayPoolProvider({
    enabled: "auto",
    startMode: "hybrid",
    manifestPaths: [manifest.file],
    fallbackApiBase: "http://fallback.example.test",
    createGatewayRunner,
    fetchImpl: async (url) => {
      if (url.includes(":18751/")) return jsonResponse({ status: "ok" });
      return jsonResponse({ error: "not running" }, { status: 503 });
    },
  });

  const status = await provider.status();
  assert.equal(status.runningWorkerCount, 1);
  assert.deepEqual(status.workers.map((item) => item.state), ["warm", "configured"]);
  assert.deepEqual(status.workers.map((item) => item.expectedRunning), [true, false]);
  assert.deepEqual(status.workers.map((item) => item.healthy), [true, null]);
  fs.rmSync(manifest.dir, { recursive: true, force: true });
}

async function testHybridStatusClearsStoppedWarmWorker() {
  const manifest = tempManifest({
    enabled: true,
    workers: [
      { name: "owner-maint", profile: "officialclean1", port: 18651, provider: "openai-codex", securityLevel: "owner-maintenance", allowMaintenance: true, allowedWorkspaceIds: ["owner"] },
    ],
  });
  let healthy = true;
  const provider = createGatewayPoolProvider({
    enabled: "auto",
    startMode: "hybrid",
    manifestPaths: [manifest.file],
    fallbackApiBase: "http://fallback.example.test",
    createGatewayRunner,
    fetchImpl: async () => (healthy
      ? jsonResponse({ status: "ok" })
      : jsonResponse({ error: "not running" }, { status: 503 })),
  });

  const warmStatus = await provider.status();
  assert.equal(warmStatus.workers[0].state, "warm");
  assert.equal(warmStatus.workers[0].expectedRunning, true);
  assert.equal(warmStatus.workers[0].healthy, true);

  healthy = false;
  const stoppedStatus = await provider.status();
  assert.equal(stoppedStatus.runningWorkerCount, 0);
  assert.equal(stoppedStatus.workers[0].state, "configured");
  assert.equal(stoppedStatus.workers[0].expectedRunning, false);
  assert.equal(stoppedStatus.workers[0].healthy, null);
  fs.rmSync(manifest.dir, { recursive: true, force: true });
}

(async () => {
  testNormalizeWorker();
  testOrderingHonorsHints();
  testOrderingHonorsProviderAndPreferredProfileHints();
  testOrderingHonorsSkillWorkspaceHints();
  testOrderingHonorsRequiredToolsetsWithinWorkspaceProfilePool();
  await testChooseHealthyWorkerAndLookupSecretByUrl();
  await testChooseHonorsSkillWorkspaceIds();
  await testChooseTargetHonorsProfileConfigToolsets();
  await testSkillRoutingStaysCompatibleWithoutManifestFields();
  await testFallsBackWhenManifestMissing();
  await testProviderSpecificOwnerMaintenanceFailsClosedWithoutWorker();
  await testProviderSpecificOwnerMaintenanceChoosesDeepSeekWorker();
  await testUserRunsFailClosedWithoutUserWorker();
  await testHybridModeStartsCompatibleWorkerAndEmitsBoundedEvents();
  await testHybridModeStartsOwnerMaintenanceProfileOnDemand();
  await testHybridStatusReportsConfiguredStoppedAsExpectedState();
  await testHybridStatusObservesAlreadyRunningWarmWorker();
  await testHybridStatusClearsStoppedWarmWorker();
  console.log("gateway-pool-provider tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
