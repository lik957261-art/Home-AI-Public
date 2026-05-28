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
    ],
  }, (manifestPath) => {
    const result = createService(manifestPath).ensureWorkspaceGateway({ workspaceId: "xuyan" });
    assert.equal(result.ok, true);
    assert.equal(result.provisioned, true);
    assert.equal(result.profile, "lowgw3");
    assert.equal(result.port, 18754);
    assert.equal(result.restartRequired, true);

    const manifest = readManifest(manifestPath);
    const worker = manifest.workers.find((item) => item.profile === "lowgw3");
    assert.equal(worker.provider, "openai-codex");
    assert.deepEqual(worker.allowedWorkspaceIds, ["xuyan"]);
    assert.deepEqual(worker.skillWorkspaceIds, ["xuyan"]);
    assert.equal(worker.skillProfile, "workspace:xuyan");
    assert.equal(worker.api_key, "secret");
    assert.equal(worker.telemetryStateDbPath.endsWith("\\lowgw3\\state.db"), true);
    assert.equal(manifest.workers.find((item) => item.profile === "grokgw1").port, 18753);
    assert.equal(manifest.workers[manifest.workers.length - 1].profile, "lowgw3");
  });
}

function testExistingWorkspaceIsIdempotent() {
  withManifest({
    enabled: true,
    workers: [baseWorker("lowgw7", "weixin_stephen", 18757)],
  }, (manifestPath) => {
    const result = createService(manifestPath).ensureWorkspaceGateway({ workspaceId: "weixin_stephen" });
    assert.equal(result.ok, true);
    assert.equal(result.provisioned, false);
    assert.equal(result.restartRequired, false);
    assert.equal(readManifest(manifestPath).workers.length, 1);
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
testOwnerWorkspaceSkipped();

console.log("gateway-workspace-provisioning-service tests passed");
