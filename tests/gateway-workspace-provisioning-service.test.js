"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createGatewayWorkspaceProvisioningService } = require("../adapters/gateway-workspace-provisioning-service");

function withManifest(manifest, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-gateway-provision-"));
  const manifestPath = path.join(root, "gateway-pool-manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  try {
    return fn(manifestPath);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function readManifest(manifestPath) {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function createService(manifestPath) {
  return createGatewayWorkspaceProvisioningService({
    manifestPaths: () => [manifestPath],
    nowIso: () => "2026-05-22T12:00:00.000Z",
  });
}

function baseWorker(profile, workspaceId, port) {
  return {
    name: profile,
    profile,
    host: "127.0.0.1",
    port,
    provider: "openai-codex",
    api_key: "secret",
    securityLevel: "user",
    allowMaintenance: false,
    allowedWorkspaceIds: [workspaceId],
    skillProfile: `workspace:${workspaceId}`,
    skillWorkspaceIds: [workspaceId],
    tags: ["official", "clean", "low-privilege", "user"],
    telemetryStateDbPath: `C:\\ProgramData\\HermesMobile\\gateway-worker\\telemetry\\profiles\\${profile}\\state.db`,
    telemetryResponseStoreDbPath: `C:\\ProgramData\\HermesMobile\\gateway-worker\\telemetry\\profiles\\${profile}\\response_store.db`,
  };
}

function deepseekWorker(profile, workspaceId, port) {
  return Object.assign(baseWorker(profile, workspaceId, port), {
    provider: "deepseek",
    tags: ["official", "clean", "low-privilege", "user", "deepseek"],
  });
}

function testProvisionNewWorkspaceWorkerAppendsAfterStableGrokPort() {
  withManifest({
    enabled: true,
    workers: [
      baseWorker("lowgw1", "owner", 18751),
      baseWorker("lowgw2", "weixin_stephen", 18752),
      Object.assign(baseWorker("grokgw1", "*", 18753), {
        provider: "xai-oauth",
        allowedWorkspaceIds: ["*"],
        skillProfile: "grok",
        skillWorkspaceIds: ["*"],
        tags: ["official", "clean", "low-privilege", "user", "grok", "xai-oauth"],
      }),
      deepseekWorker("deepseekgw2", "weixin_stephen", 18754),
    ],
  }, (manifestPath) => {
    const result = createService(manifestPath).ensureWorkspaceGateway({ workspaceId: "xuyan" });
    assert.equal(result.ok, true);
    assert.equal(result.provisioned, true);
    assert.equal(result.profile, "lowgw3");
    assert.deepEqual(result.provisionedWorkers, ["lowgw3", "lowgw4", "deepseekgw3"]);
    assert.deepEqual(result.profiles, ["lowgw3", "lowgw4", "deepseekgw3"]);
    assert.equal(result.openAiWorkerCount, 2);
    assert.equal(result.deepseekWorkerCount, 1);
    assert.equal(result.replicaMetadataUpdated, true);
    assert.equal(result.port, 18755);
    assert.equal(result.restartRequired, true);
    assert.equal(result.skillStoreProvisioned, true);
    assert.equal(fs.existsSync(result.skillStorePath), true);
    assert.equal(result.skillStorePath.endsWith(path.join("skill-profiles", "xuyan", "skills")), true);

    const manifest = readManifest(manifestPath);
    const worker = manifest.workers.find((item) => item.profile === "lowgw3");
    const secondWorker = manifest.workers.find((item) => item.profile === "lowgw4");
    const deepseek = manifest.workers.find((item) => item.profile === "deepseekgw3");
    assert.equal(worker.provider, "openai-codex");
    assert.equal(worker.replicaId, "lowgw3");
    assert.equal(worker.profileAlias, "lowgw3");
    assert.equal(worker.profileTemplateKey, "xuyan|user|openai-codex");
    assert.equal(worker.poolKey, "xuyan|user|openai-codex");
    assert.deepEqual(worker.allowedWorkspaceIds, ["xuyan"]);
    assert.deepEqual(worker.skillWorkspaceIds, ["xuyan"]);
    assert.equal(worker.skillProfile, "workspace:xuyan");
    assert.equal(path.basename(worker.apiKeyFile), "hm-xuyan-openai-1.key");
    assert.equal(path.basename(secondWorker.apiKeyFile), "hm-xuyan-openai-2.key");
    assert.equal(path.basename(deepseek.apiKeyFile), "hm-xuyan-deepseek-1.key");
    assert.equal(fs.existsSync(worker.apiKeyFile), true);
    assert.equal(fs.existsSync(secondWorker.apiKeyFile), true);
    assert.equal(fs.existsSync(deepseek.apiKeyFile), true);
    assert.equal(worker.api_key, undefined);
    assert.equal(worker.telemetryStateDbPath.endsWith("\\lowgw3\\state.db"), true);
    assert.equal(manifest.workers.find((item) => item.profile === "grokgw1").port, 18753);
    assert.deepEqual(secondWorker.allowedWorkspaceIds, ["xuyan"]);
    assert.equal(secondWorker.profileTemplateKey, "xuyan|user|openai-codex");
    assert.equal(deepseek.provider, "deepseek");
    assert.equal(deepseek.replicaId, "deepseekgw3");
    assert.equal(deepseek.profileTemplateKey, "xuyan|user|deepseek");
    assert.equal(deepseek.poolKey, "xuyan|user|deepseek");
    assert.deepEqual(deepseek.allowedWorkspaceIds, ["xuyan"]);
    assert.deepEqual(deepseek.skillWorkspaceIds, ["xuyan"]);
    assert.equal(deepseek.skillProfile, "workspace:xuyan");
    assert.equal(manifest.workers[manifest.workers.length - 1].profile, "deepseekgw3");
  });
}

function testExistingWorkspaceIsIdempotent() {
  withManifest({
    enabled: true,
    workers: [
      baseWorker("lowgw7", "weixin_stephen", 18757),
      deepseekWorker("deepseekgw7", "weixin_stephen", 18767),
    ],
  }, (manifestPath) => {
    const result = createService(manifestPath).ensureWorkspaceGateway({ workspaceId: "weixin_stephen" });
    assert.equal(result.ok, true);
    assert.equal(result.provisioned, true);
    assert.deepEqual(result.provisionedWorkers, ["lowgw8", "lowgw7", "deepseekgw7"]);
    assert.equal(result.openAiWorkerCount, 2);
    assert.equal(result.deepseekWorkerCount, 1);
    assert.equal(result.replicaMetadataUpdated, true);
    assert.equal(result.restartRequired, true);
    assert.equal(result.skillStoreProvisioned, true);
    assert.equal(fs.existsSync(result.skillStorePath), true);
    assert.equal(readManifest(manifestPath).workers.length, 3);

    const second = createService(manifestPath).ensureWorkspaceGateway({ workspaceId: "weixin_stephen" });
    assert.equal(second.provisioned, false);
    assert.equal(second.restartRequired, false);
    assert.equal(second.skillStoreProvisioned, false);
    assert.equal(second.replicaMetadataUpdated, false);
    assert.equal(second.openAiWorkerCount, 2);
    assert.equal(second.deepseekWorkerCount, 1);
  });
}

function testRefreshProfileBindingMarksExistingWorkspaceProfiles() {
  withManifest({
    enabled: true,
    workers: [
      Object.assign(baseWorker("lowgw9", "weixin_wuping", 18759), {
        osUser: "hm-wuping",
        launchdLabel: "com.hermesmobile.gateway.hm-wuping.openai.1",
      }),
      baseWorker("lowgw10", "weixin_wuping", 18760),
      deepseekWorker("deepseekgw9", "weixin_wuping", 18769),
    ],
  }, (manifestPath) => {
    const result = createService(manifestPath).ensureWorkspaceGateway({
      workspaceId: "weixin_wuping",
      refreshProfileBinding: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.provisioned, true);
    assert.equal(result.profileBindingRefreshed, true);
    assert.equal(result.replicaMetadataUpdated, true);
    assert.equal(result.restartRequired, true);
    assert.equal(result.macUser, "hm-wuping");
    assert.deepEqual(result.workerOsUsers, ["hm-wuping"]);
    assert.deepEqual(result.provisionedWorkers, ["lowgw9", "lowgw10", "deepseekgw9"]);
    const manifest = readManifest(manifestPath);
    assert.equal(manifest.updatedAt, "2026-05-22T12:00:00.000Z");
    assert.equal(manifest.workers.find((item) => item.profile === "lowgw9").pluginBindingUpdatedAt, "2026-05-22T12:00:00.000Z");
    assert.equal(manifest.workers.find((item) => item.profile === "lowgw9").profileTemplateKey, "weixin_wuping|user|openai-codex");
    assert.equal(manifest.workers.find((item) => item.profile === "deepseekgw9").pluginBindingUpdatedAt, "2026-05-22T12:00:00.000Z");
    assert.equal(manifest.workers.find((item) => item.profile === "deepseekgw9").profileTemplateKey, "weixin_wuping|user|deepseek");
  });
}

function testOwnerWorkspaceSkipped() {
  withManifest({ enabled: true, workers: [] }, (manifestPath) => {
    const result = createService(manifestPath).ensureWorkspaceGateway({ workspaceId: "owner" });
    assert.equal(result.skipped, true);
    assert.equal(readManifest(manifestPath).workers.length, 0);
  });
}

testProvisionNewWorkspaceWorkerAppendsAfterStableGrokPort();
testExistingWorkspaceIsIdempotent();
testRefreshProfileBindingMarksExistingWorkspaceProfiles();
testOwnerWorkspaceSkipped();

console.log("gateway-workspace-provisioning-service tests passed");
