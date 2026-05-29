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
    normalizeWorker({ name: "deepseek-owner", profile: "deepseekgw1", port: 18764, provider: "deepseek", securityLevel: "user", skillWorkspaceIds: ["owner"] }),
    normalizeWorker({ name: "deepseek-wuping", profile: "deepseekgw5", port: 18765, provider: "deepseek", securityLevel: "user", skillWorkspaceIds: ["weixin_wuping"] }),
    normalizeWorker({ name: "deepseek-shared", profile: "deepseekgw99", port: 18766, provider: "deepseek", securityLevel: "user", skillWorkspaceIds: ["*"] }),
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
    orderedWorkers(workers, 0, { provider: "deepseek", preferred_worker_profiles: ["deepseekgw1", "deepseekgw5", "deepseekgw99"], skillWorkspaceId: "owner", requireSkillProfile: true }).map((w) => w.name),
    ["deepseek-owner", "deepseek-shared"],
  );
  assert.deepEqual(
    orderedWorkers(workers, 0, { provider: "deepseek", preferred_worker_profiles: ["deepseekgw1", "deepseekgw5", "deepseekgw99"], skillWorkspaceId: "weixin_wuping", requireSkillProfile: true }).map((w) => w.name),
    ["deepseek-wuping", "deepseek-shared"],
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

(async () => {
  testNormalizeWorker();
  testOrderingHonorsHints();
  testOrderingHonorsProviderAndPreferredProfileHints();
  testOrderingHonorsSkillWorkspaceHints();
  await testChooseHealthyWorkerAndLookupSecretByUrl();
  await testChooseHonorsSkillWorkspaceIds();
  await testSkillRoutingStaysCompatibleWithoutManifestFields();
  await testFallsBackWhenManifestMissing();
  await testProviderSpecificOwnerMaintenanceFailsClosedWithoutWorker();
  await testProviderSpecificOwnerMaintenanceChoosesDeepSeekWorker();
  await testUserRunsFailClosedWithoutUserWorker();
  console.log("gateway-pool-provider tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
