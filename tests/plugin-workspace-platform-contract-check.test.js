"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "plugin-workspace-platform-contract-check.js");
const { CONTRACT_VERSION, PLUGINS } = require("../scripts/plugin-workspace-platform-contract-check");

function write(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, "utf8");
}

function pointerFor(plugin, overrides = {}) {
  const windowsDevBaseUrl = overrides.windowsDevBaseUrl || `http://127.0.0.1:${plugin.port}`;
  const macosProductionBaseUrl = overrides.macosProductionBaseUrl || `http://127.0.0.1:${plugin.port}`;
  const manifestUrl = overrides.manifestUrl || `http://127.0.0.1:${plugin.port}/api/v1/hermes/plugin/manifest`;
  return [
    "# Home AI Platform Contract Pointer",
    "",
    "Last updated: 2026-06-06.",
    `Home AI platform contract version: \`${CONTRACT_VERSION}\`.`,
    "",
    "## Canonical Home AI Docs",
    "",
    "- `plugin-workspace-platform-contract.md`",
    "- `plugin-mobile-ui-visual-contract.md`",
    "- `macos-production-access.md`",
    "- `mcp-tool-upgrade-closure.md`",
    "- `macos-ios-simulator-appium.md`",
    "- `reference-memory-graph-v1.md`",
    "- `reference-memory-graph-harness-plan.md`",
    "",
    "## Plugin-Local Facts",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| \`plugin_id\` | \`${plugin.id}\` |`,
    `| \`workspace_path_windows\` | \`fixture/${plugin.dirName}\` |`,
    `| \`production_source_path_macos\` | \`${plugin.macSourcePaths[0]}\` |`,
    "| `production_data_root_macos` | `/Users/hermes-host/HermesMobile/data` |",
    `| \`windows_dev_base_url\` | \`${windowsDevBaseUrl}\` |`,
    `| \`macos_production_base_url\` | \`${macosProductionBaseUrl}\` |`,
    `| \`launchd_label\` | \`${plugin.launchdLabel}\` |`,
    `| \`manifest_url\` | \`${manifestUrl}\` |`,
    "| `mcp_command` | `fixture` |",
    "| `mcp_schema_endpoint` | `fixture` |",
    "| `deploy_command` | `fixture` |",
    "| `reference_contract_status` | `planned` |",
    "| `mobile_visual_harness_status` | `planned` |",
    "| `ios_live_debug_available` | `yes` |",
    "",
    "Do not record raw secrets or credentials here.",
  ].join("\n");
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-plugin-contract-"));
  const repo = path.join(root, "Agent");
  write(path.join(repo, "docs", "IMPLEMENTATION_NOTES", "plugin-workspace-contract-rollout-status.md"), [
    "# Plugin Workspace Contract Rollout Status",
    "Finance Wardrobe Note Email Health",
    "docs/HOME_AI_PLATFORM_CONTRACT.md",
    "Codex Mobile Web is a special insertion and is excluded.",
    "plugin-workspace-platform-contract-check.js",
    "plugin-workspace-platform-contract-check.test.js",
  ].join("\n"));
  write(path.join(repo, "docs", "PLATFORM_CONTRACTS", "plugin-workspace-platform-contract.md"), "plugin-workspace-platform-contract-check.js\n");
  write(path.join(repo, "docs", "TEST_MATRIX.md"), "plugin-workspace-platform-contract-check.test.js\n");
  write(path.join(repo, "docs", "DOCS_INDEX.md"), "plugin-workspace-contract-rollout-status.md\n");
  for (const plugin of PLUGINS) {
    const workspace = path.join(root, plugin.dirName);
    write(path.join(workspace, "docs", "HOME_AI_PLATFORM_CONTRACT.md"), pointerFor(plugin));
    write(path.join(workspace, ".agent-context", "HANDOFF.md"), `## Home AI Platform Contract Pointer\n${CONTRACT_VERSION}\n`);
  }
  return { root, repo };
}

function makeCentralOnlyFixture() {
  const fixture = makeFixture();
  for (const plugin of PLUGINS) {
    fs.rmSync(path.join(fixture.root, plugin.dirName), { recursive: true, force: true });
  }
  return fixture;
}

function run(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
  });
}

function testFixturePasses() {
  const fixture = makeFixture();
  const result = run(["--repo-root", fixture.repo, "--workspace-root", fixture.root, "--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.checkedPlugins, ["finance", "wardrobe", "note", "email", "health"]);
  assert.deepEqual(parsed.excludedPlugins, ["codex-mobile"]);
}

function testUnknownPluginFailsAndCodexIsNotADescriptor() {
  const result = run(["--plugin", "codex-mobile", "--json"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown plugin id/);
  assert.ok(!PLUGINS.some((plugin) => plugin.id.includes("codex")));
}

function testSingleRepositoryCheckoutReportsBoundedPointerMissing() {
  const fixture = makeCentralOnlyFixture();
  const result = run(["--repo-root", fixture.repo, "--workspace-root", fixture.root, "--json"]);
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.central.issues.length, 0);
  assert.equal(parsed.plugins.every((plugin) => !plugin.pointerExists), true);
  assert.deepEqual(
    parsed.issues,
    PLUGINS.map((plugin) => `${plugin.id}:pointer_missing`),
  );
}

function testPointerRejectsPublicRuntimeUrls() {
  const fixture = makeFixture();
  const plugin = PLUGINS.find((item) => item.id === "finance");
  write(path.join(fixture.root, plugin.dirName, "docs", "HOME_AI_PLATFORM_CONTRACT.md"), pointerFor(plugin, {
    macosProductionBaseUrl: "https://hermes-xuxin.synology.me:8445",
    manifestUrl: "https://hermes-xuxin.synology.me:8445/api/v1/hermes/plugin/manifest",
  }));
  const result = run(["--repo-root", fixture.repo, "--workspace-root", fixture.root, "--plugin", "finance", "--json"]);
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.issues.includes("finance:runtime_url_not_loopback:macos_production_base_url"));
  assert.ok(parsed.issues.includes("finance:runtime_url_not_loopback:manifest_url"));
  assert.ok(parsed.issues.some((issue) => issue.startsWith("finance:pointer_forbidden_runtime_domain:")));
}

function testRepositoryContractIsCurrentlyClosed() {
  const result = run(["--json"]);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.central.issues.length, 0);
  const pointerCount = parsed.plugins.filter((plugin) => plugin.pointerExists).length;
  if (pointerCount === 0 && process.env.GITHUB_ACTIONS === "true") {
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.deepEqual(
      parsed.issues,
      PLUGINS.map((plugin) => `${plugin.id}:pointer_missing`),
    );
    return;
  }
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(pointerCount, 5);
}

function testScriptDoesNotHandleSecretsOrSudo() {
  const script = fs.readFileSync(scriptPath, "utf8");
  assert.doesNotMatch(script, /password-file|sudo\s+-S|X-Hermes-Web-Key|Access Key/i);
  assert.match(script, /--probe-mac/);
  assert.match(script, /ssh/);
  assert.match(script, /launchctl/);
  assert.match(script, /curl/);
}

testFixturePasses();
testUnknownPluginFailsAndCodexIsNotADescriptor();
testSingleRepositoryCheckoutReportsBoundedPointerMissing();
testPointerRejectsPublicRuntimeUrls();
testRepositoryContractIsCurrentlyClosed();
testScriptDoesNotHandleSecretsOrSudo();

console.log("plugin workspace platform contract checker tests passed");
