"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createHealthPluginProvisioningService,
  canonicalHealthWorkspaceId,
  healthWorkspaceConfigPath,
  healthWorkspaceKeyPath,
  healthWorkspaceRegistrationUrl,
  findHealthOwnerKeyPath,
  sha256,
} = require("../adapters/health-plugin-provisioning-service");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hermes-health-provision-"));
}

async function testCreatesWorkspaceKeyRegistersHashAndWritesConfig() {
  const dataDir = tempDir();
  const ownerKeyPath = path.join(dataDir, "plugin-secrets", "health-owner-key.txt");
  fs.mkdirSync(path.dirname(ownerKeyPath), { recursive: true });
  fs.writeFileSync(ownerKeyPath, "health-owner-test-key\n", "utf8");
  const calls = [];
  const service = createHealthPluginProvisioningService({
    dataDir,
    env: {},
    fetch(url, options = {}) {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          ok: true,
          workspace_id: "health:weixin_health",
          hermes_workspace_id: "weixin_health",
        }),
      });
    },
  });
  const result = await service.provisionWorkspace({
    workspaceId: "weixin_health",
    displayName: "Health User",
    healthManifestUrl: "http://127.0.0.1:4877/api/v1/hermes/plugin/manifest",
  });
  assert.equal(result.ok, true);
  assert.equal(result.keyCreated, true);
  assert.equal(result.configCreated, true);
  assert.equal(result.healthWorkspaceId, "health:weixin_health");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:4877/api/v1/hermes/plugin/workspaces");
  assert.equal(calls[0].options.headers.Authorization, "Bearer health-owner-test-key");
  assert.equal(calls[0].body.owner, "hermes");
  assert.equal(calls[0].body.workspace_id, "weixin_health");
  assert.equal(calls[0].body.target_workspace_id, "weixin_health");
  assert.equal(calls[0].body.hermes_workspace_id, "weixin_health");
  assert.deepEqual(calls[0].body.scopes, ["health:read", "health:write", "reports:read", "records:write"]);
  assert.match(calls[0].body.access_key_hash, /^[a-f0-9]{64}$/);

  const keyPath = healthWorkspaceKeyPath({ dataDir, workspaceId: "weixin_health" });
  assert.equal(fs.existsSync(keyPath), true);
  const rawKey = fs.readFileSync(keyPath, "utf8").trim();
  assert.match(rawKey, /^hhlt_/);
  assert.equal(calls[0].body.access_key_hash, sha256(rawKey));
  assert.equal(JSON.stringify(calls[0].body).includes(rawKey), false);

  const configPath = healthWorkspaceConfigPath({ dataDir, workspaceId: "weixin_health" });
  assert.equal(result.configPath, configPath);
  assert.equal(fs.existsSync(configPath), true);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.equal(config.base_url, "http://127.0.0.1:4877");
  assert.equal(config.api_base_url, "http://127.0.0.1:4877");
  assert.equal(config.workspace_id, "health:weixin_health");
  assert.equal(config.hermes_workspace_id, "weixin_health");
  assert.equal(config.access_key_file, "access-key.txt");
  assert.equal(config.display_name, "Health User");
  assert.equal(JSON.stringify(config).includes(rawKey), false);
  assert.equal(JSON.stringify(result).includes(rawKey), false);
  assert.equal(JSON.stringify(result).includes("health-owner-test-key"), false);
}

async function testOwnerProvisioningUsesBareRegistrationAndCanonicalConfig() {
  const dataDir = tempDir();
  const ownerKeyPath = path.join(dataDir, "plugin-secrets", "health-owner-key.txt");
  fs.mkdirSync(path.dirname(ownerKeyPath), { recursive: true });
  fs.writeFileSync(ownerKeyPath, "health-owner-test-key\n", "utf8");
  const calls = [];
  const service = createHealthPluginProvisioningService({
    dataDir,
    env: {},
    fetch(url, options = {}) {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          ok: true,
          workspace_id: "health:owner",
          hermes_workspace_id: "owner",
          status: "active",
        }),
      });
    },
  });
  const result = await service.provisionWorkspace({
    workspaceId: "owner",
    displayName: "Owner",
    healthManifestUrl: "http://127.0.0.1:4877/api/v1/hermes/plugin/manifest",
  });
  assert.equal(result.ok, true);
  assert.equal(result.healthWorkspaceId, "health:owner");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.workspace_id, "owner");
  assert.equal(calls[0].body.target_workspace_id, "owner");
  assert.equal(calls[0].body.hermes_workspace_id, "owner");
  assert.equal(calls[0].body.access_key_hash.length, 64);
  assert.equal(JSON.stringify(calls[0].body).includes("health-owner-test-key"), false);

  const keyPath = healthWorkspaceKeyPath({ dataDir, workspaceId: "owner" });
  const rawKey = fs.readFileSync(keyPath, "utf8").trim();
  assert.equal(calls[0].body.access_key_hash, sha256(rawKey));

  const config = JSON.parse(fs.readFileSync(healthWorkspaceConfigPath({ dataDir, workspaceId: "owner" }), "utf8"));
  assert.equal(config.workspace_id, "health:owner");
  assert.equal(config.hermes_workspace_id, "owner");
  assert.equal(config.base_url, "http://127.0.0.1:4877");
  assert.equal(JSON.stringify(config).includes(rawKey), false);
}

async function testProvisioningCanUseHealthyRegistrationKeyEnvAlias() {
  const dataDir = tempDir();
  const calls = [];
  const service = createHealthPluginProvisioningService({
    dataDir,
    env: { HEALTHY_REGISTRATION_KEY: "health-registration-env-key" },
    fetch(url, options = {}) {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true, workspace_id: "health:weixin_health" }),
      });
    },
  });
  const result = await service.provisionWorkspace({
    workspaceId: "weixin_health",
    healthManifestUrl: "http://127.0.0.1:4877/api/v1/hermes/plugin/manifest",
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.Authorization, "Bearer health-registration-env-key");
  assert.equal(calls[0].body.workspace_id, "weixin_health");
  assert.equal(calls[0].body.target_workspace_id, "weixin_health");
  assert.equal(JSON.stringify(result).includes("health-registration-env-key"), false);
}

async function testProvisioningFailsClosedWithoutOwnerKey() {
  const dataDir = tempDir();
  let fetchCalled = false;
  const service = createHealthPluginProvisioningService({
    dataDir,
    env: {},
    fetch() {
      fetchCalled = true;
      throw new Error("fetch must not run without health registration key");
    },
  });
  const result = await service.provisionWorkspace({
    workspaceId: "weixin_health",
    healthManifestUrl: "http://127.0.0.1:4877/api/v1/hermes/plugin/manifest",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "health_owner_key_missing");
  assert.equal(fetchCalled, false);
  assert.equal(fs.existsSync(healthWorkspaceKeyPath({ dataDir, workspaceId: "weixin_health" })), false);
}

function testHelpers() {
  const dataDir = tempDir();
  const ownerKeyPath = path.join(dataDir, "plugin-secrets", "health-owner-key.txt");
  fs.mkdirSync(path.dirname(ownerKeyPath), { recursive: true });
  fs.writeFileSync(ownerKeyPath, "health-owner-test-key\n", "utf8");
  assert.equal(findHealthOwnerKeyPath({ dataDir, env: {} }), ownerKeyPath);
  assert.equal(findHealthOwnerKeyPath({ dataDir, env: { HEALTHY_REGISTRATION_KEY_PATH: ownerKeyPath } }), ownerKeyPath);
  assert.equal(
    healthWorkspaceRegistrationUrl("http://127.0.0.1:4877/api/v1/hermes/plugin/manifest"),
    "http://127.0.0.1:4877/api/v1/hermes/plugin/workspaces",
  );
  assert.equal(canonicalHealthWorkspaceId("owner"), "health:owner");
  assert.equal(canonicalHealthWorkspaceId("health:owner"), "health:owner");
}

(async () => {
  testHelpers();
  await testCreatesWorkspaceKeyRegistersHashAndWritesConfig();
  await testOwnerProvisioningUsesBareRegistrationAndCanonicalConfig();
  await testProvisioningCanUseHealthyRegistrationKeyEnvAlias();
  await testProvisioningFailsClosedWithoutOwnerKey();
  console.log("health-plugin-provisioning-service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
