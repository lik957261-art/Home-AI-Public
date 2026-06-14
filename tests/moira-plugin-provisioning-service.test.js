"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createMoiraPluginProvisioningService,
  moiraApiBaseUrl,
  moiraWorkspaceConfigPath,
  moiraWorkspaceKeyPath,
} = require("../adapters/moira-plugin-provisioning-service");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hermes-moira-provision-"));
}

async function testCreatesWorkspaceKeyAndConfig() {
  const dataDir = tempDir();
  const service = createMoiraPluginProvisioningService({ dataDir, env: {} });
  const result = await service.provisionWorkspace({
    workspaceId: "weixin_moira",
    displayName: "Moira User",
    moiraManifestUrl: "http://127.0.0.1:4174/api/v1/hermes/plugin/manifest",
  });

  assert.equal(result.ok, true);
  assert.equal(result.keyCreated, true);
  assert.equal(result.configCreated, true);
  const keyPath = moiraWorkspaceKeyPath({ dataDir, workspaceId: "weixin_moira" });
  const rawKey = fs.readFileSync(keyPath, "utf8").trim();
  assert.match(rawKey, /^hmoi_/);
  assert.equal(JSON.stringify(result).includes(rawKey), false);

  const configPath = moiraWorkspaceConfigPath({ dataDir, workspaceId: "weixin_moira" });
  assert.equal(result.configPath, configPath);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.equal(config.api_base_url, "http://127.0.0.1:4174");
  assert.equal(config.workspace_id, "weixin_moira");
  assert.equal(config.display_name, "Moira User");
  assert.equal(config.access_key_file, "access-key.txt");
  assert.equal(JSON.stringify(config).includes(rawKey), false);
}

async function testProvisioningReusesExistingKey() {
  const dataDir = tempDir();
  const keyPath = moiraWorkspaceKeyPath({ dataDir, workspaceId: "weixin_moira" });
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, "existing-moira-key\n", "utf8");
  const service = createMoiraPluginProvisioningService({ dataDir, env: {} });
  const result = await service.provisionWorkspace({
    workspaceId: "weixin_moira",
    displayName: "Moira User",
    moiraManifestUrl: "http://127.0.0.1:4174/api/v1/hermes/plugin/manifest",
  });

  assert.equal(result.ok, true);
  assert.equal(result.keyCreated, false);
  assert.equal(fs.readFileSync(keyPath, "utf8").trim(), "existing-moira-key");
  const config = JSON.parse(fs.readFileSync(moiraWorkspaceConfigPath({ dataDir, workspaceId: "weixin_moira" }), "utf8"));
  assert.equal(config.workspace_id, "weixin_moira");
}

async function testProvisioningFailsClosedWithoutWorkspaceId() {
  const dataDir = tempDir();
  const service = createMoiraPluginProvisioningService({ dataDir, env: {} });
  const result = await service.provisionWorkspace({
    moiraManifestUrl: "http://127.0.0.1:4174/api/v1/hermes/plugin/manifest",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "workspace_id_required");
}

function testHelpers() {
  assert.equal(
    moiraApiBaseUrl("http://127.0.0.1:4174/api/v1/hermes/plugin/manifest"),
    "http://127.0.0.1:4174",
  );
  assert.equal(moiraApiBaseUrl("not a url"), "http://127.0.0.1:4174");
}

(async () => {
  testHelpers();
  await testCreatesWorkspaceKeyAndConfig();
  await testProvisioningReusesExistingKey();
  await testProvisioningFailsClosedWithoutWorkspaceId();
  console.log("moira-plugin-provisioning-service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
