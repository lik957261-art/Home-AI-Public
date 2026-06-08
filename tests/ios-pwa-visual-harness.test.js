"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "ios-pwa-visual-harness.js");
const script = fs.readFileSync(scriptPath, "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const runbook = fs.readFileSync(path.join(repoRoot, "docs", "RUNBOOKS", "macos-ios-simulator-appium.md"), "utf8");
const mobileContract = fs.readFileSync(path.join(repoRoot, "docs", "PLATFORM_CONTRACTS", "plugin-mobile-ui-visual-contract.md"), "utf8");
const platformContract = fs.readFileSync(path.join(repoRoot, "docs", "PLATFORM_CONTRACTS", "plugin-workspace-platform-contract.md"), "utf8");
const testMatrix = fs.readFileSync(path.join(repoRoot, "docs", "TEST_MATRIX.md"), "utf8");
const rolloutStatus = fs.readFileSync(path.join(repoRoot, "docs", "IMPLEMENTATION_NOTES", "plugin-workspace-contract-rollout-status.md"), "utf8");

const {
  SCENARIOS,
  assertDirectoryDarkStatus,
  assertEmbeddedPluginShell,
  parseArgs,
} = require("../scripts/ios-pwa-visual-harness");

assert.equal(packageJson.scripts["ios:pwa:visual"], "node scripts/ios-pwa-visual-harness.js");

assert.ok(SCENARIOS["directory-dark-status"]);
assert.ok(SCENARIOS["embedded-plugin-shell"]);
assert.deepEqual(parseArgs(["--scenario", "embedded-plugin-shell", "--plugin-id", "finance"]).pluginId, "finance");

assert.match(script, /\/api\/stream-info/);
assert.match(script, /\/api\/deep-state/);
assert.match(script, /\/api\/action/);
assert.match(script, /\/api\/screenshot\?force=1/);
assert.match(script, /directory-dark-status/);
assert.match(script, /embedded-plugin-shell/);
assert.match(script, /\.directory-status/);
assert.match(script, /\.directory-shell/);
assert.match(script, /--ui-surface-muted/);
assert.match(script, /paleDirectoryRegression/);
assert.match(script, /\.embedded-plugin-shell\[data-plugin-id=/);
assert.match(script, /\.embedded-plugin-frame/);
assert.match(script, /\.wardrobe-plugin-frame/);
assert.match(script, /boundedUrl/);
assert.doesNotMatch(script, /owner-web-key\.secret|HOMEAI_MAC_SUDO_PASSWORD_FILE|X-Hermes-Web-Key/i);

const directoryPass = assertDirectoryDarkStatus({
  theme: "dark",
  appClass: "projects-mode",
  mutedSurfaceRaw: "rgba(255, 255, 255, 0.10)",
  mutedSurfaceResolved: "rgba(255, 255, 255, 0.1)",
  shellBackground: "rgb(16, 18, 20)",
  statusBackground: "rgba(255, 255, 255, 0.1)",
  rects: {
    shell: { width: 390, height: 700 },
    status: { width: 330, height: 44 },
  },
});
assert.equal(directoryPass.ok, true);

const directoryFail = assertDirectoryDarkStatus({
  theme: "dark",
  mutedSurfaceResolved: "rgba(255, 255, 255, 0.1)",
  shellBackground: "rgb(16, 18, 20)",
  statusBackground: "rgba(255, 255, 252, 0.78)",
  rects: {
    shell: { width: 390, height: 700 },
    status: { width: 330, height: 44 },
  },
});
assert.equal(directoryFail.ok, false);
assert.ok(directoryFail.assertions.some((item) => item.name === "directory_status_not_pale_cream" && !item.pass));

const embeddedPass = assertEmbeddedPluginShell({
  pluginId: "finance",
  viewport: { visualWidth: 390, width: 390 },
  shell: { exists: true, rect: { left: 0, right: 390, width: 390, height: 720 } },
  frame: { exists: true, rect: { left: 0, right: 390, width: 390, height: 650 } },
});
assert.equal(embeddedPass.ok, true);

const embeddedFail = assertEmbeddedPluginShell({
  pluginId: "finance",
  viewport: { visualWidth: 390, width: 390 },
  shell: { exists: true, rect: { left: 0, right: 390, width: 390, height: 720 } },
  frame: { exists: true, rect: { left: -12, right: 430, width: 442, height: 650 } },
});
assert.equal(embeddedFail.ok, false);
assert.ok(embeddedFail.assertions.some((item) => item.name === "plugin_frame_has_no_horizontal_overflow" && !item.pass));

for (const doc of [runbook, mobileContract, platformContract, testMatrix, rolloutStatus]) {
  assert.match(doc, /npm run ios:pwa:visual/);
  assert.match(doc, /ios-pwa-visual-harness\.js/);
}

assert.match(platformContract, /`ios_visual_harness_command`/);
assert.match(mobileContract, /directory-dark-status/);
assert.match(mobileContract, /embedded-plugin-shell/);
assert.match(testMatrix, /node tests\\ios-pwa-visual-harness\.test\.js/);

console.log("iOS PWA visual harness tests passed");
