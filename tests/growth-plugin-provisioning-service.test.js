"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  canonicalGrowthWorkspaceId,
  createGrowthPluginProvisioningService,
  findGrowthOwnerKeyPath,
  growthWorkspaceConfigPath,
  growthWorkspaceKeyPath,
  growthWorkspaceRegistrationUrl,
  sha256,
} = require("../adapters/growth-plugin-provisioning-service");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hermes-growth-provision-"));
}

async function testCreatesWorkspaceKeyRegistersHashAndWritesConfig() {
  const dataDir = tempDir();
  const ownerKeyPath = path.join(dataDir, "plugin-secrets", "growth-owner-key.txt");
  fs.mkdirSync(path.dirname(ownerKeyPath), { recursive: true });
  fs.writeFileSync(ownerKeyPath, "growth-owner-test-key\n", "utf8");
  const calls = [];
  const service = createGrowthPluginProvisioningService({
    dataDir,
    env: {},
    fetch(url, options = {}) {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          ok: true,
          workspace_id: "growth:weixin_growth",
          hermes_workspace_id: "weixin_growth",
        }),
      });
    },
  });
  const result = await service.provisionWorkspace({
    workspaceId: "weixin_growth",
    displayName: "Growth User",
    growthManifestUrl: "http://127.0.0.1:4881/api/v1/hermes/plugin/manifest",
  });

  assert.equal(result.ok, true);
  assert.equal(result.keyCreated, true);
  assert.equal(result.configCreated, true);
  assert.equal(result.growthWorkspaceId, "growth:weixin_growth");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:4881/api/v1/hermes/plugin/workspaces");
  assert.equal(calls[0].options.headers.Authorization, "Bearer growth-owner-test-key");
  assert.equal(calls[0].body.owner, "hermes");
  assert.equal(calls[0].body.workspace_id, "growth:weixin_growth");
  assert.equal(calls[0].body.target_workspace_id, "weixin_growth");
  assert.equal(calls[0].body.hermes_workspace_id, "weixin_growth");
  assert.deepEqual(calls[0].body.scopes, ["growth:read", "growth:write"]);
  assert.match(calls[0].body.access_key_hash, /^[a-f0-9]{64}$/);

  const keyPath = growthWorkspaceKeyPath({ dataDir, workspaceId: "weixin_growth" });
  const rawKey = fs.readFileSync(keyPath, "utf8").trim();
  assert.match(rawKey, /^hgr_/);
  assert.equal(calls[0].body.access_key_hash, sha256(rawKey));
  assert.equal(JSON.stringify(calls[0].body).includes(rawKey), false);

  const configPath = growthWorkspaceConfigPath({ dataDir, workspaceId: "weixin_growth" });
  assert.equal(result.configPath, configPath);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.equal(config.api_base_url, "http://127.0.0.1:4881");
  assert.equal(config.workspace_id, "growth:weixin_growth");
  assert.equal(config.hermes_workspace_id, "weixin_growth");
  assert.equal(config.access_key_file, "access-key.txt");
  assert.equal(config.display_name, "Growth User");
  assert.equal(JSON.stringify(config).includes(rawKey), false);
  assert.equal(JSON.stringify(result).includes(rawKey), false);
  assert.equal(JSON.stringify(result).includes("growth-owner-test-key"), false);
}

async function testProvisioningCanUseRegistrationKeyEnvAlias() {
  const dataDir = tempDir();
  const calls = [];
  const service = createGrowthPluginProvisioningService({
    dataDir,
    env: { GROWTH_REGISTRATION_KEY: "growth-registration-env-key" },
    fetch(url, options = {}) {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true, workspace_id: "growth:weixin_growth" }),
      });
    },
  });
  const result = await service.provisionWorkspace({
    workspaceId: "weixin_growth",
    growthManifestUrl: "http://127.0.0.1:4881/api/v1/hermes/plugin/manifest",
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.Authorization, "Bearer growth-registration-env-key");
  assert.equal(JSON.stringify(result).includes("growth-registration-env-key"), false);
}

async function testProvisioningFailsClosedWithoutOwnerKey() {
  const dataDir = tempDir();
  let fetchCalled = false;
  const service = createGrowthPluginProvisioningService({
    dataDir,
    env: {},
    fetch() {
      fetchCalled = true;
      throw new Error("fetch must not run without growth registration key");
    },
  });
  const result = await service.provisionWorkspace({
    workspaceId: "weixin_growth",
    growthManifestUrl: "http://127.0.0.1:4881/api/v1/hermes/plugin/manifest",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "growth_owner_key_missing");
  assert.equal(fetchCalled, false);
  assert.equal(fs.existsSync(growthWorkspaceKeyPath({ dataDir, workspaceId: "weixin_growth" })), false);
}

function testHelpers() {
  const dataDir = tempDir();
  const ownerKeyPath = path.join(dataDir, "plugin-secrets", "growth-owner-key.txt");
  fs.mkdirSync(path.dirname(ownerKeyPath), { recursive: true });
  fs.writeFileSync(ownerKeyPath, "growth-owner-test-key\n", "utf8");
  assert.equal(findGrowthOwnerKeyPath({ dataDir, env: {} }), ownerKeyPath);
  assert.equal(findGrowthOwnerKeyPath({ dataDir, env: { GROWTH_REGISTRATION_KEY_PATH: ownerKeyPath } }), ownerKeyPath);
  assert.equal(
    growthWorkspaceRegistrationUrl("http://127.0.0.1:4881/api/v1/hermes/plugin/manifest"),
    "http://127.0.0.1:4881/api/v1/hermes/plugin/workspaces",
  );
  assert.equal(canonicalGrowthWorkspaceId("owner"), "growth:owner");
  assert.equal(canonicalGrowthWorkspaceId("growth:owner"), "growth:owner");
}

(async () => {
  testHelpers();
  await testCreatesWorkspaceKeyRegistersHashAndWritesConfig();
  await testProvisioningCanUseRegistrationKeyEnvAlias();
  await testProvisioningFailsClosedWithoutOwnerKey();
  console.log("growth-plugin-provisioning-service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
