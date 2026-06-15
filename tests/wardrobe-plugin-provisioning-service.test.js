"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  DEFAULT_WARDROBE_SCOPES,
  createWardrobePluginProvisioningService,
  installWardrobeSkill,
  readWardrobeWorkspaceConfig,
  sha256Hex,
  validateWardrobeSkillBundle,
  wardrobePhotoCacheDir,
  wardrobeRegistrationUrl,
  wardrobeWorkspaceConfigPath,
  wardrobeWorkspaceIdForHermesWorkspace,
  wardrobeWorkspaceKeyPath,
} = require("../adapters/wardrobe-plugin-provisioning-service");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hermes-wardrobe-provision-"));
}

function writeCompleteTemplate(repoRoot, options = {}) {
  const templateDir = options.templateDir || path.join(repoRoot, "skills", "productivity", "wardrobe-style-operations");
  fs.mkdirSync(templateDir, { recursive: true });
  fs.writeFileSync(path.join(templateDir, "SKILL.md"), [
    "---",
    "name: wardrobe-style-operations",
    "description: Complete keyless Wardrobe MCP operation bundle.",
    "---",
    "",
    "# Wardrobe Style Operations",
    "",
    "Use wardrobe MCP. Do not read access-key.txt. Credentials live only in the workspace .hermes-wardrobe directory.",
    "Consult references/wardrobe-program-api.md before using Program API contracts.",
    "",
    Array.from({ length: 80 }, (_, index) => `Rule ${index + 1}: keep Wardrobe reads, writes, photo checks, and outfit history scoped to the active Hermes workspace.`).join("\n"),
    options.includeSensitiveToken ? `Test fixture token ${`wd_${"live"}_${"x".repeat(16)}`}` : "",
  ].join("\n"), "utf8");
  const referencesDir = path.join(templateDir, "references");
  fs.mkdirSync(referencesDir, { recursive: true });
  fs.writeFileSync(path.join(referencesDir, "wardrobe-program-api.md"), "# Wardrobe Program API\n\nUse server-side MCP/API contracts only.\n", "utf8");
  fs.writeFileSync(path.join(referencesDir, "wardrobe-judgment-pitfalls.md"), "# Wardrobe Judgment Pitfalls\n\nAvoid cross-owner contamination.\n", "utf8");
  const scriptsDir = path.join(templateDir, "scripts");
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.writeFileSync(path.join(scriptsDir, "render_wardrobe_phone_pdf.py"), "def main():\n    return 0\n\nif __name__ == \"__main__\":\n    raise SystemExit(main())\n", "utf8");
  return templateDir;
}

function writeShortTemplate(templateDir) {
  fs.mkdirSync(templateDir, { recursive: true });
  fs.writeFileSync(path.join(templateDir, "SKILL.md"), [
    "---",
    "name: wardrobe-style-operations",
    "---",
    "",
    "Use wardrobe MCP. Do not read access-key.txt.",
  ].join("\n"), "utf8");
}

function readTextTree(rootDir) {
  const parts = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
      } else if (entry.isFile() && [".md", ".py", ".txt", ".json"].includes(path.extname(entry.name).toLowerCase())) {
        parts.push(fs.readFileSync(entryPath, "utf8"));
      }
    }
  }
  walk(rootDir);
  return parts.join("\n");
}

async function testProvisionCreatesKeyConfigRegistrationSkillAndGatewayBinding() {
  const dataDir = tempDir();
  const repoRoot = tempDir();
  const registrationKey = `wd_${"live"}_${"r".repeat(40)}`;
  const ownerKey = `wd_${"live"}_${"owner".repeat(10)}`;
  const ownerKeyPath = path.join(dataDir, "drive", "users", "owner", ".hermes-wardrobe", "access-key.txt");
  fs.mkdirSync(path.dirname(ownerKeyPath), { recursive: true });
  fs.writeFileSync(ownerKeyPath, `${ownerKey}\n`, "utf8");
  writeCompleteTemplate(repoRoot);
  const calls = [];
  const gatewayCalls = [];
  const service = createWardrobePluginProvisioningService({
    dataDir,
    repoRoot,
    wardrobeRegistrationAccessKey: registrationKey,
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
    wardrobeManifestUrl: "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest",
  });
  assert.equal(result.ok, true);
  assert.equal(result.keyCreated, true);
  assert.equal(result.wardrobeWorkspaceId, "wardrobe:weixin_test_wardrobe");
  assert.equal(result.skillInstalled, true);
  assert.equal(result.skillSource, "bundle_copy");
  assert.equal(result.skillSourceKind, "repo_template");
  assert.equal(result.skillBundle.ok, true);
  assert.equal(result.skillBundle.hasProgramApiReference, true);
  assert.equal(result.skillBundle.hasRenderPdfScript, true);
  assert.equal(result.skillBundle.referenceFiles >= 2, true);
  assert.deepEqual(result.gatewayProfiles, ["lowgw21", "lowgw22", "deepseekgw21"]);
  assert.equal(result.gatewayRestartRequired, true);
  assert.equal(result.gatewayProfileBindingRefreshed, true);
  assert.deepEqual(gatewayCalls, [{ workspaceId: "weixin_test_wardrobe", refreshProfileBinding: true }]);

  const keyPath = wardrobeWorkspaceKeyPath({ dataDir, workspaceId: "weixin_test_wardrobe" });
  const configPath = wardrobeWorkspaceConfigPath({ dataDir, workspaceId: "weixin_test_wardrobe" });
  assert.equal(fs.existsSync(keyPath), true);
  assert.equal(fs.existsSync(configPath), true);
  const rawKey = fs.readFileSync(keyPath, "utf8").trim();
  assert.match(rawKey, /^wd_live_/);
  const config = readWardrobeWorkspaceConfig({ dataDir, workspaceId: "weixin_test_wardrobe" });
  assert.equal(config.api_base_url, "http://127.0.0.1:8765");
  assert.equal(config.workspace_id, wardrobeWorkspaceIdForHermesWorkspace("weixin_test_wardrobe"));
  assert.equal(config.hermes_workspace_id, "weixin_test_wardrobe");
  assert.equal(config.owner_display_name, "Test Wardrobe");
  assert.equal(config.access_key_file, ".hermes-wardrobe/access-key.txt");
  assert.equal(config.cache_dir, ".hermes-cache");
  assert.equal(config.photo_cache_dir, wardrobePhotoCacheDir({ dataDir, workspaceId: "weixin_test_wardrobe" }));
  assert.equal(fs.existsSync(config.photo_cache_dir), true);
  assert.match(config.photo_cache_dir, /[/\\]artifacts[/\\]wardrobe-thumbnails[/\\]weixin_test_wardrobe$/);
  assert.deepEqual(config.scopes, DEFAULT_WARDROBE_SCOPES);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:8765/api/v1/hermes/plugin/workspaces");
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${registrationKey}`);
  assert.equal(calls[0].options.headers["Content-Type"], "application/json; charset=utf-8");
  assert.equal(calls[0].body.workspace_id, "wardrobe:weixin_test_wardrobe");
  assert.equal(calls[0].body.hermes_workspace_id, "weixin_test_wardrobe");
  assert.equal(calls[0].body.owner, "weixin_test_wardrobe");
  assert.equal(calls[0].body.access_key, rawKey);
  assert.equal(calls[0].body.access_key_sha256, sha256Hex(rawKey));
  assert.equal(calls[0].body.access_key_hash, sha256Hex(rawKey));
  assert.equal(calls[0].body.replace_existing_key, true);
  assert.deepEqual(calls[0].body.scopes, DEFAULT_WARDROBE_SCOPES);
  assert.equal(JSON.stringify(result).includes(rawKey), false);
  assert.equal(JSON.stringify(result).includes(registrationKey), false);
  assert.equal(JSON.stringify(result).includes(ownerKey), false);

  const skillDir = path.join(dataDir, "skill-profiles", "weixin_test_wardrobe", "skills", "productivity", "wardrobe-style-operations");
  const skillPath = path.join(skillDir, "SKILL.md");
  assert.equal(fs.existsSync(skillPath), true);
  assert.equal(fs.existsSync(path.join(skillDir, "references", "wardrobe-program-api.md")), true);
  assert.equal(fs.existsSync(path.join(skillDir, "references", "wardrobe-judgment-pitfalls.md")), true);
  assert.equal(fs.existsSync(path.join(skillDir, "scripts", "render_wardrobe_phone_pdf.py")), true);
  const targetValidation = validateWardrobeSkillBundle(skillDir);
  assert.equal(targetValidation.ok, true);
  const skillText = fs.readFileSync(skillPath, "utf8");
  assert.match(skillText, /wardrobe MCP/i);
  assert.equal(skillText.length > 2048, true);
  const bundleText = readTextTree(skillDir);
  assert.equal(skillText.includes(rawKey), false);
  assert.equal(bundleText.includes(rawKey), false);
  assert.equal(bundleText.includes(registrationKey), false);
  assert.equal(bundleText.includes(ownerKey), false);
  assert.equal(/wd_live_[A-Za-z0-9_-]{8,}/.test(bundleText), false);
  assert.equal(/wpl_[A-Za-z0-9_-]{8,}/.test(bundleText), false);
  assert.equal(/Authorization:\s*Bearer\s+[A-Za-z0-9._~+/-]{8,}/i.test(bundleText), false);
}

async function testRegistrationFailureKeepsRawKeyOutOfResult() {
  const dataDir = tempDir();
  const service = createWardrobePluginProvisioningService({
    dataDir,
    wardrobeRegistrationAccessKey: `wd_${"live"}_${"f".repeat(40)}`,
    fetch() {
      return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
    },
  });
  const result = await service.provisionWorkspace({
    workspaceId: "weixin_wardrobe_fail",
    displayName: "Fail",
    wardrobeManifestUrl: "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "wardrobe_registration_failed_503");
  assert.equal(result.keyCreated, true);
  assert.equal(result.configWritten, true);
  const rawKey = fs.readFileSync(wardrobeWorkspaceKeyPath({ dataDir, workspaceId: "weixin_wardrobe_fail" }), "utf8").trim();
  assert.equal(JSON.stringify(result).includes(rawKey), false);
}

async function testRegistrationKeyMissingReturnsBoundedFailure() {
  const dataDir = tempDir();
  const service = createWardrobePluginProvisioningService({
    dataDir,
    fetch() {
      throw new Error("missing registration key should fail before fetch");
    },
  });
  const result = await service.provisionWorkspace({
    workspaceId: "weixin_wardrobe_missing_registration",
    displayName: "Missing Registration",
    wardrobeManifestUrl: "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "wardrobe_registration_key_missing");
  assert.equal(result.keyCreated, true);
  assert.equal(result.configWritten, true);
  const rawKey = fs.readFileSync(wardrobeWorkspaceKeyPath({ dataDir, workspaceId: "weixin_wardrobe_missing_registration" }), "utf8").trim();
  assert.equal(JSON.stringify(result).includes(rawKey), false);
}

async function testInvalidExistingWorkspaceKeyIsReplacedBeforeRegistration() {
  const dataDir = tempDir();
  writeCompleteTemplate(path.join(dataDir, "skill-profiles", "owner-full"));
  const keyPath = wardrobeWorkspaceKeyPath({ dataDir, workspaceId: "weixin_invalid_key" });
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, "hwd_invalid_legacy_key\n", "utf8");
  const calls = [];
  const service = createWardrobePluginProvisioningService({
    dataDir,
    wardrobeRegistrationAccessKey: `wd_${"live"}_${"i".repeat(40)}`,
    gatewayWorkspaceProvisioningService: {
      ensureWorkspaceGateway() {
        return { ok: true };
      },
    },
    fetch(url, options) {
      calls.push({ url, body: JSON.parse(options.body) });
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ result: { workspace_id: "wardrobe:weixin_invalid_key", owner: "weixin_invalid_key" } }),
      });
    },
  });
  const result = await service.provisionWorkspace({
    workspaceId: "weixin_invalid_key",
    displayName: "Invalid Key",
    wardrobeManifestUrl: "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest",
  });
  assert.equal(result.ok, true);
  const rawKey = fs.readFileSync(keyPath, "utf8").trim();
  assert.match(rawKey, /^wd_live_/);
  assert.equal(calls[0].body.access_key, rawKey);
  assert.equal(calls[0].body.access_key.includes("hwd_invalid"), false);
}

function testIncompleteTemplateFailsInsteadOfWritingBuiltInFallback() {
  const dataDir = tempDir();
  const templateDir = path.join(tempDir(), "wardrobe-style-operations");
  const skillStorePath = path.join(dataDir, "skill-profiles", "weixin_short_template", "skills");
  writeShortTemplate(templateDir);
  const result = installWardrobeSkill({
    dataDir,
    workspaceId: "weixin_short_template",
    skillStorePath,
    wardrobeSkillTemplatePath: templateDir,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "wardrobe_skill_bundle_incomplete");
  assert.equal(fs.existsSync(path.join(skillStorePath, "productivity", "wardrobe-style-operations", "SKILL.md")), false);
}

function testSensitiveTemplateFailsClosed() {
  const dataDir = tempDir();
  const templateDir = writeCompleteTemplate(tempDir(), { includeSensitiveToken: true });
  const skillStorePath = path.join(dataDir, "skill-profiles", "weixin_sensitive_template", "skills");
  const result = installWardrobeSkill({
    dataDir,
    workspaceId: "weixin_sensitive_template",
    skillStorePath,
    wardrobeSkillTemplatePath: templateDir,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "wardrobe_skill_bundle_incomplete");
  assert.equal(result.invalidCandidates[0].reason, "wardrobe_skill_sensitive_content");
  assert.equal(fs.existsSync(path.join(skillStorePath, "productivity", "wardrobe-style-operations", "SKILL.md")), false);
}

function testRegistrationUrlFromManifestOrigin() {
  assert.equal(
    wardrobeRegistrationUrl("http://127.0.0.1:8765/api/v1/hermes/plugin/manifest"),
    "http://127.0.0.1:8765/api/v1/hermes/plugin/workspaces",
  );
}

(async () => {
  await testProvisionCreatesKeyConfigRegistrationSkillAndGatewayBinding();
  await testRegistrationFailureKeepsRawKeyOutOfResult();
  await testRegistrationKeyMissingReturnsBoundedFailure();
  await testInvalidExistingWorkspaceKeyIsReplacedBeforeRegistration();
  testIncompleteTemplateFailsInsteadOfWritingBuiltInFallback();
  testSensitiveTemplateFailsClosed();
  testRegistrationUrlFromManifestOrigin();
  console.log("wardrobe-plugin-provisioning-service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
