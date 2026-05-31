"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  DEFAULT_WARDROBE_SCOPES,
  createWardrobePluginProvisioningService,
  readWardrobeWorkspaceConfig,
  sha256Hex,
  wardrobeRegistrationUrl,
  wardrobeWorkspaceConfigPath,
  wardrobeWorkspaceIdForHermesWorkspace,
  wardrobeWorkspaceKeyPath,
} = require("../adapters/wardrobe-plugin-provisioning-service");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hermes-wardrobe-provision-"));
}

function writeTemplate(repoRoot) {
  const templateDir = path.join(repoRoot, "skills", "productivity", "wardrobe-style-operations");
  fs.mkdirSync(templateDir, { recursive: true });
  fs.writeFileSync(path.join(templateDir, "SKILL.md"), [
    "---",
    "name: wardrobe-style-operations",
    "---",
    "",
    "Use wardrobe MCP. Do not read access-key.txt.",
  ].join("\n"), "utf8");
}

async function testProvisionCreatesKeyConfigRegistrationSkillAndGatewayBinding() {
  const dataDir = tempDir();
  const repoRoot = tempDir();
  writeTemplate(repoRoot);
  const calls = [];
  const gatewayCalls = [];
  const service = createWardrobePluginProvisioningService({
    dataDir,
    repoRoot,
    nowIso: () => "2026-06-01T00:00:00.000Z",
    gatewayWorkspaceProvisioningService: {
      ensureWorkspaceGateway(input) {
        gatewayCalls.push(input);
        const skillStorePath = path.join(dataDir, "skill-profiles", input.workspaceId, "skills");
        fs.mkdirSync(skillStorePath, { recursive: true });
        return {
          ok: true,
          profiles: ["lowgw21", "lowgw22", "deepseekgw21"],
          restartRequired: true,
          profileBindingRefreshed: true,
          skillStorePath,
        };
      },
    },
    fetch(url, options) {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          ok: true,
          result: {
            workspace_id: "wardrobe:weixin_test_wardrobe",
            owner: "weixin_test_wardrobe",
            created: true,
          },
        }),
      });
    },
  });
  const result = await service.provisionWorkspace({
    workspaceId: "weixin_test_wardrobe",
    displayName: "Test Wardrobe",
    wardrobeManifestUrl: "http://192.168.10.99:8765/api/v1/hermes/plugin/manifest",
  });
  assert.equal(result.ok, true);
  assert.equal(result.keyCreated, true);
  assert.equal(result.wardrobeWorkspaceId, "wardrobe:weixin_test_wardrobe");
  assert.equal(result.skillInstalled, true);
  assert.deepEqual(result.gatewayProfiles, ["lowgw21", "lowgw22", "deepseekgw21"]);
  assert.equal(result.gatewayRestartRequired, true);
  assert.equal(result.gatewayProfileBindingRefreshed, true);
  assert.deepEqual(gatewayCalls, [{ workspaceId: "weixin_test_wardrobe", refreshProfileBinding: true }]);

  const keyPath = wardrobeWorkspaceKeyPath({ dataDir, workspaceId: "weixin_test_wardrobe" });
  const configPath = wardrobeWorkspaceConfigPath({ dataDir, workspaceId: "weixin_test_wardrobe" });
  assert.equal(fs.existsSync(keyPath), true);
  assert.equal(fs.existsSync(configPath), true);
  const rawKey = fs.readFileSync(keyPath, "utf8").trim();
  assert.match(rawKey, /^hwd_/);
  const config = readWardrobeWorkspaceConfig({ dataDir, workspaceId: "weixin_test_wardrobe" });
  assert.equal(config.api_base_url, "http://192.168.10.99:8765");
  assert.equal(config.workspace_id, wardrobeWorkspaceIdForHermesWorkspace("weixin_test_wardrobe"));
  assert.equal(config.hermes_workspace_id, "weixin_test_wardrobe");
  assert.equal(config.owner_display_name, "Test Wardrobe");
  assert.equal(config.access_key_file, ".hermes-wardrobe/access-key.txt");
  assert.equal(config.cache_dir, ".hermes-cache");
  assert.deepEqual(config.scopes, DEFAULT_WARDROBE_SCOPES);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://192.168.10.99:8765/api/v1/hermes/plugin/workspaces");
  assert.equal(calls[0].options.headers["Content-Type"], "application/json; charset=utf-8");
  assert.equal(calls[0].body.workspace_id, "wardrobe:weixin_test_wardrobe");
  assert.equal(calls[0].body.hermes_workspace_id, "weixin_test_wardrobe");
  assert.equal(calls[0].body.owner, "weixin_test_wardrobe");
  assert.equal(calls[0].body.access_key_sha256, sha256Hex(rawKey));
  assert.equal(calls[0].body.access_key_hash, sha256Hex(rawKey));
  assert.deepEqual(calls[0].body.scopes, DEFAULT_WARDROBE_SCOPES);
  assert.equal(JSON.stringify(calls[0].body).includes(rawKey), false);
  assert.equal(JSON.stringify(result).includes(rawKey), false);

  const skillPath = path.join(dataDir, "skill-profiles", "weixin_test_wardrobe", "skills", "productivity", "wardrobe-style-operations", "SKILL.md");
  assert.equal(fs.existsSync(skillPath), true);
  const skillText = fs.readFileSync(skillPath, "utf8");
  assert.match(skillText, /wardrobe MCP/i);
  assert.equal(skillText.includes(rawKey), false);
}

async function testRegistrationFailureKeepsRawKeyOutOfResult() {
  const dataDir = tempDir();
  const service = createWardrobePluginProvisioningService({
    dataDir,
    fetch() {
      return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
    },
  });
  const result = await service.provisionWorkspace({
    workspaceId: "weixin_wardrobe_fail",
    displayName: "Fail",
    wardrobeManifestUrl: "http://192.168.10.99:8765/api/v1/hermes/plugin/manifest",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "wardrobe_registration_failed_503");
  assert.equal(result.keyCreated, true);
  assert.equal(result.configWritten, true);
  const rawKey = fs.readFileSync(wardrobeWorkspaceKeyPath({ dataDir, workspaceId: "weixin_wardrobe_fail" }), "utf8").trim();
  assert.equal(JSON.stringify(result).includes(rawKey), false);
}

function testRegistrationUrlFromManifestOrigin() {
  assert.equal(
    wardrobeRegistrationUrl("http://192.168.10.99:8765/api/v1/hermes/plugin/manifest"),
    "http://192.168.10.99:8765/api/v1/hermes/plugin/workspaces",
  );
}

(async () => {
  await testProvisionCreatesKeyConfigRegistrationSkillAndGatewayBinding();
  await testRegistrationFailureKeepsRawKeyOutOfResult();
  testRegistrationUrlFromManifestOrigin();
  console.log("wardrobe-plugin-provisioning-service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
