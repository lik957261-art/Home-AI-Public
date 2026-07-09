"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const scriptText = fs.readFileSync(path.join(repoRoot, "scripts", "central-visual-harness-broker.js"), "utf8");
const platformContract = fs.readFileSync(path.join(repoRoot, "docs", "PLATFORM_CONTRACTS", "plugin-workspace-platform-contract.md"), "utf8");
const mobileContract = fs.readFileSync(path.join(repoRoot, "docs", "PLATFORM_CONTRACTS", "plugin-mobile-ui-visual-contract.md"), "utf8");
const harnessMatrix = fs.readFileSync(path.join(repoRoot, "docs", "IMPLEMENTATION_NOTES", "harness-required-matrix.md"), "utf8");
const testMatrix = fs.readFileSync(path.join(repoRoot, "docs", "TEST_MATRIX.md"), "utf8");
const architectureMap = fs.readFileSync(path.join(repoRoot, "docs", "ARCHITECTURE_CODE_TEST_HARNESS_MAP.md"), "utf8");

const {
  appendBrokerMarker,
  buildChildCommand,
  buildPlan,
  discoverPluginLocalHarness,
  parseArgs,
  redactArgv,
  runBroker,
  selectHarness,
  listSupported,
  summarizeChildOutput,
  validatePluginEvidence,
} = require("../scripts/central-visual-harness-broker");

function tempCentralRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-central-visual-broker-"));
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(root, "node_modules", "playwright"), { recursive: true });
  fs.writeFileSync(path.join(root, "node_modules", "playwright", "index.js"), "module.exports = {};\n");
  for (const script of [
    "playwright-visual-smoke.js",
    "authenticated-navigation-flow-smoke.js",
    "ios-pwa-visual-harness.js",
  ]) {
    fs.writeFileSync(path.join(root, "scripts", script), "#!/usr/bin/env node\n");
  }
  return root;
}

function tempPluginRoot(scriptName = "visual:central-compatible") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-plugin-visual-broker-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    scripts: {
      [scriptName]: "node visual-harness.js",
    },
  }, null, 2));
  return root;
}

function pluginEvidence(overrides = {}) {
  return Object.assign({
    ok: true,
    status: "passed",
    schemaVersion: 1,
    pluginId: "music",
    scenario: "embedded-plugin-shell",
    surface: "embedded-plugin",
    harnessKind: "plugin-local-compatible",
    mode: "execute",
    viewport: "390x844",
    baseUrlOrigin: "http://127.0.0.1:8797",
    assertions: [
      { code: "plugin_shell_visible", pass: true },
      { code: "plugin_rows_stable", pass: true },
    ],
    screenshotPresent: true,
    artifactCount: 1,
    clientVersion: "test-client",
  }, overrides);
}

assert.equal(packageJson.scripts["visual:central"], "node scripts/central-visual-harness-broker.js");
assert.match(scriptText, /blocked_central_visual_harness_unavailable/);
assert.match(scriptText, /playwright_unavailable/);
assert.match(scriptText, /debug_server_unavailable/);
assert.match(scriptText, /--access-key-path/);
assert.match(scriptText, /accessKeyPathLabel/);
assert.match(scriptText, /plugin_visual_evidence_invalid/);
assert.match(scriptText, /plugin_visual_harness_missing/);
assert.doesNotMatch(scriptText, /console\.log\(.*accessKeyPath/);

const parsed = parseArgs([
  "--surface", "embedded-plugin",
  "--plugin-id", "music",
  "--scenario", "embedded-plugin-shell",
  "--base-url", "http://127.0.0.1:8797",
  "--debug-url", "http://127.0.0.1:19073/",
  "--viewport", "390x844",
  "--access-key-path", "/private/owner-web-key.secret",
  "--json",
]);
assert.equal(parsed.surface, "embedded-plugin");
assert.equal(parsed.pluginId, "music");
assert.equal(parsed.scenario, "embedded-plugin-shell");
assert.equal(parsed.accessKeyPath, "/private/owner-web-key.secret");
assert.equal(selectHarness(parsed), "browser-mobile");

const iosParsed = parseArgs(["--surface", "embedded-plugin", "--plugin-id", "music", "--scenario", "embedded-plugin-shell", "--ios"]);
assert.equal(selectHarness(iosParsed), "ios-pwa-visual");
const localParsed = parseArgs([
  "--plugin-id", "music",
  "--scenario", "embedded-plugin-shell",
  "--delegate-local",
  "--plugin-root", "/private/plugin-root",
]);
assert.equal(selectHarness(localParsed), "plugin-local-compatible");

assert.equal(selectHarness(parseArgs(["--scenario", "authenticated-navigation"])), "authenticated-navigation");
const directoryComposerParsed = parseArgs(["--scenario", "directory-topic-composer-long-input-shrink"]);
assert.equal(selectHarness(directoryComposerParsed), "browser-mobile");
const directoryComposerCommand = buildChildCommand(directoryComposerParsed, "browser-mobile", repoRoot);
assert.ok(directoryComposerCommand.argv.includes("--scenario"));
assert.ok(directoryComposerCommand.argv.includes("directory-topic-composer-long-input-shrink"));
assert.ok(listSupported().scenarios.browserMobile.includes("directory-topic-composer-long-input-shrink"));
assert.equal(appendBrokerMarker("http://127.0.0.1:8797/?x=1"), "http://127.0.0.1:8797/?x=1&_hmv=central-visual-broker");
assert.deepEqual(
  redactArgv(["--access-key-path", "/private/key.secret", "--url", "http://x.test/?launchToken=abc&ok=1"]),
  ["--access-key-path", "<access-key-path:redacted>", "--url", "http://x.test/?launchToken=REDACTED&ok=1"],
);

(async () => {
  const centralRoot = tempCentralRoot();
  const browserPlan = await buildPlan(parsed, { repoRoot: centralRoot });
  assert.equal(browserPlan.ok, true);
  assert.equal(browserPlan.status, "preflight_passed");
  assert.equal(browserPlan.selectedHarness, "browser-mobile");
  assert.equal(browserPlan.playwrightAvailable, true);
  assert.ok(browserPlan.commandPreview.includes("<access-key-path:redacted>"));
  assert.ok(!JSON.stringify(browserPlan).includes("/private/owner-web-key.secret"));

  const authPlan = await buildPlan(parseArgs(["--scenario", "authenticated-navigation"]), { repoRoot: centralRoot });
  assert.equal(authPlan.ok, false);
  assert.equal(authPlan.status, "invalid_request");
  assert.ok(authPlan.issues.some((issue) => issue.code === "access_key_path_required"));

  const missingPlaywrightRoot = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-central-visual-no-playwright-"));
  fs.mkdirSync(path.join(missingPlaywrightRoot, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(missingPlaywrightRoot, "scripts", "playwright-visual-smoke.js"), "");
  const unavailablePlan = await buildPlan(parsed, { repoRoot: missingPlaywrightRoot });
  assert.equal(unavailablePlan.ok, false);
  assert.equal(unavailablePlan.status, "blocked_central_visual_harness_unavailable");
  assert.ok(unavailablePlan.issues.some((issue) => issue.code === "playwright_unavailable"));

  const iosPlan = await buildPlan(parseArgs([
    "--surface", "embedded-plugin",
    "--plugin-id", "music",
    "--scenario", "embedded-plugin-shell",
    "--ios",
    "--preflight-only",
  ]), {
    repoRoot: centralRoot,
    fetchImpl: async () => ({ status: 200 }),
  });
  assert.equal(iosPlan.ok, true);
  assert.equal(iosPlan.selectedHarness, "ios-pwa-visual");
  assert.equal(iosPlan.requiresDebugServer, true);
  assert.ok(iosPlan.commandPreview.includes("--preflight-only"));
  assert.ok(iosPlan.commandPreview.includes("--plugin-id"));

  const debugDownPlan = await buildPlan(parseArgs([
    "--surface", "embedded-plugin",
    "--plugin-id", "music",
    "--scenario", "embedded-plugin-shell",
    "--ios",
  ]), {
    repoRoot: centralRoot,
    fetchImpl: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  assert.equal(debugDownPlan.ok, false);
  assert.equal(debugDownPlan.status, "blocked_central_visual_harness_unavailable");
  assert.ok(debugDownPlan.issues.some((issue) => issue.code === "debug_server_unavailable"));

  const child = buildChildCommand(iosParsed, "ios-pwa-visual", centralRoot);
  assert.ok(child.argv.includes("--scenario"));
  assert.ok(child.argv.includes("embedded-plugin-shell"));
  assert.ok(child.argv.includes("--plugin-id"));
  assert.ok(child.argv.includes("music"));

  const executed = await runBroker(parsed, {
    repoRoot: centralRoot,
    spawnSync: () => ({
      status: 0,
      stdout: JSON.stringify({
        ok: true,
        clientVersion: "test-version",
        screenshotPath: "/private/screenshot.png",
        warnings: [{ code: "bounded_warning" }],
      }),
      stderr: "private log that should not be copied",
    }),
  });
  assert.equal(executed.ok, true);
  assert.equal(executed.status, "preflight_passed");
  assert.equal(executed.exitCode, undefined);

  const executeOptions = Object.assign({}, parsed, { execute: true });
  const executeResult = await runBroker(executeOptions, {
    repoRoot: centralRoot,
    spawnSync: () => ({
      status: 0,
      stdout: JSON.stringify({
        ok: true,
        clientVersion: "test-version",
        screenshotPath: "/private/screenshot.png",
        warnings: [{ code: "bounded_warning" }],
      }),
      stderr: "private log that should not be copied",
    }),
  });
  assert.equal(executeResult.ok, true);
  assert.equal(executeResult.status, "executed");
  assert.equal(executeResult.child.clientVersion, "test-version");
  assert.deepEqual(executeResult.child.warningCodes, ["bounded_warning"]);
  assert.equal(executeResult.child.screenshotPresent, true);
  assert.ok(!JSON.stringify(executeResult).includes("private log"));
  assert.ok(!JSON.stringify(executeResult).includes("/private/screenshot.png"));

  const preflightExecute = await runBroker(Object.assign({}, parsed, { execute: true, preflightOnly: true }), {
    repoRoot: centralRoot,
    spawnSync: () => {
      throw new Error("preflight should not spawn browser smoke");
    },
  });
  assert.equal(preflightExecute.ok, true);
  assert.equal(preflightExecute.status, "preflight_passed");
  assert.equal(preflightExecute.mode, "preflight");

  const summary = summarizeChildOutput(JSON.stringify({
    ok: false,
    layout: { failures: [{ code: "composer_bottom_nav_overlap" }] },
    assertions: [{ name: "screenshot_meets_min_bytes", pass: false }],
  }), "");
  assert.deepEqual(summary.failureCodes, ["composer_bottom_nav_overlap", "screenshot_meets_min_bytes"]);

  const pluginRoot = tempPluginRoot();
  const localPlan = await buildPlan(parseArgs([
    "--surface", "embedded-plugin",
    "--plugin-id", "music",
    "--scenario", "embedded-plugin-shell",
    "--delegate-local",
    "--plugin-root", pluginRoot,
    "--base-url", "http://127.0.0.1:8797",
    "--workspace-id", "owner",
    "--viewport", "390x844",
    "--access-key-path", "/private/owner-web-key.secret",
  ]), { repoRoot: centralRoot });
  assert.equal(localPlan.ok, true);
  assert.equal(localPlan.selectedHarness, "plugin-local-compatible");
  assert.equal(localPlan.pluginHarnessScript, "visual:central-compatible");
  assert.equal(localPlan.centralSignoffRequired, true);
  assert.equal(localPlan.localEvidenceRole, "supplemental");
  assert.ok(localPlan.commandPreview.includes("visual:central-compatible"));
  assert.ok(localPlan.commandPreview.includes("--scenario"));
  assert.ok(localPlan.commandPreview.includes("--plugin-id"));
  assert.ok(localPlan.commandPreview.includes("--base-url"));
  assert.ok(localPlan.commandPreview.includes("--workspace-id"));
  assert.ok(localPlan.commandPreview.includes("--viewport"));
  assert.ok(localPlan.commandPreview.includes("<access-key-path:redacted>"));
  assert.ok(!JSON.stringify(localPlan).includes(pluginRoot));
  assert.ok(!JSON.stringify(localPlan).includes("/private/owner-web-key.secret"));

  const discovered = discoverPluginLocalHarness({ pluginId: "music", pluginRoot }, centralRoot);
  assert.equal(discovered.ok, true);
  assert.equal(discovered.scriptName, "visual:central-compatible");

  const fallbackPluginRoot = tempPluginRoot("visual:plugin");
  const fallbackPlan = await buildPlan(parseArgs([
    "--plugin-id", "music",
    "--scenario", "browser-mobile",
    "--delegate-local",
    "--plugin-root", fallbackPluginRoot,
  ]), { repoRoot: centralRoot });
  assert.equal(fallbackPlan.ok, true);
  assert.equal(fallbackPlan.pluginHarnessScript, "visual:plugin");
  assert.equal(fallbackPlan.centralSignoffRequired, false);

  const localExecute = await runBroker(Object.assign({}, parseArgs([
    "--surface", "embedded-plugin",
    "--plugin-id", "music",
    "--scenario", "embedded-plugin-shell",
    "--delegate-local",
    "--plugin-root", pluginRoot,
    "--execute",
    "--access-key-path", "/private/owner-web-key.secret",
  ])), {
    repoRoot: centralRoot,
    spawnSync: (command, argv, spawnOptions) => {
      assert.equal(command, "npm");
      assert.deepEqual(argv.slice(0, 3), ["run", "visual:central-compatible", "--"]);
      assert.equal(spawnOptions.cwd, pluginRoot);
      assert.ok(argv.includes("--scenario"));
      assert.ok(argv.includes("--plugin-id"));
      assert.ok(argv.includes("--base-url"));
      assert.ok(argv.includes("--workspace-id"));
      assert.ok(argv.includes("--viewport"));
      assert.ok(argv.includes("--access-key-path"));
      return {
        status: 0,
        stdout: JSON.stringify(pluginEvidence()),
        stderr: "private plugin log that should not be copied",
      };
    },
  });
  assert.equal(localExecute.ok, true);
  assert.equal(localExecute.status, "executed");
  assert.equal(localExecute.child.evidence.pluginId, "music");
  assert.equal(localExecute.child.evidence.assertionCount, 2);
  assert.ok(!JSON.stringify(localExecute).includes("private plugin log"));
  assert.ok(!JSON.stringify(localExecute).includes(pluginRoot));
  assert.ok(!JSON.stringify(localExecute).includes("/private/owner-web-key.secret"));

  const malformedLocal = await runBroker(Object.assign({}, parseArgs([
    "--plugin-id", "music",
    "--scenario", "embedded-plugin-shell",
    "--delegate-local",
    "--plugin-root", pluginRoot,
    "--execute",
  ])), {
    repoRoot: centralRoot,
    spawnSync: () => ({
      status: 0,
      stdout: "not-json",
      stderr: "",
    }),
  });
  assert.equal(malformedLocal.ok, false);
  assert.equal(malformedLocal.status, "plugin_visual_evidence_invalid");
  assert.ok(malformedLocal.child.issues.some((issue) => issue.code === "plugin_visual_evidence_invalid"));

  const missingLocal = await buildPlan(parseArgs([
    "--plugin-id", "music",
    "--scenario", "embedded-plugin-shell",
    "--delegate-local",
    "--plugin-root", fs.mkdtempSync(path.join(os.tmpdir(), "homeai-plugin-no-harness-")),
  ]), { repoRoot: centralRoot });
  assert.equal(missingLocal.ok, false);
  assert.equal(missingLocal.status, "blocked_central_visual_harness_unavailable");
  assert.ok(missingLocal.issues.some((issue) => issue.code === "plugin_visual_harness_missing"));

  const evidenceFile = path.join(os.tmpdir(), `homeai-plugin-evidence-${Date.now()}.json`);
  fs.writeFileSync(evidenceFile, JSON.stringify(pluginEvidence()));
  const verifyResult = await runBroker(parseArgs([
    "--plugin-id", "music",
    "--scenario", "embedded-plugin-shell",
    "--verify-evidence", evidenceFile,
  ]), { repoRoot: centralRoot });
  assert.equal(verifyResult.ok, true);
  assert.equal(verifyResult.status, "preflight_passed");
  assert.equal(verifyResult.mode, "verify-evidence");
  assert.equal(verifyResult.evidence.pluginId, "music");
  assert.ok(!JSON.stringify(verifyResult).includes(evidenceFile));

  const invalidEvidence = validatePluginEvidence(pluginEvidence({ cookie: "private-cookie-marker" }), { pluginId: "music", scenario: "embedded-plugin-shell" });
  assert.equal(invalidEvidence.ok, false);
  assert.ok(invalidEvidence.issues.some((issue) => issue.field === "privacy_marker"));

  for (const doc of [platformContract, mobileContract, harnessMatrix, testMatrix, architectureMap]) {
    assert.match(doc, /central-visual-harness-broker\.js|visual:central/);
  }

  console.log("central visual harness broker tests passed");
})().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
