"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
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
  acquireDebugLaneLease,
  acquireHarnessLock,
  assertCommonHarness,
  assertDirectoryDarkStatus,
  assertEmbeddedPluginShell,
  defaultLockPath,
  parseArgs,
} = require("../scripts/ios-pwa-visual-harness");

assert.equal(packageJson.scripts["ios:pwa:visual"], "node scripts/ios-pwa-visual-harness.js");

assert.ok(SCENARIOS["directory-dark-status"]);
assert.ok(SCENARIOS["embedded-plugin-shell"]);
assert.deepEqual(parseArgs(["--scenario", "embedded-plugin-shell", "--plugin-id", "finance"]).pluginId, "finance");
assert.deepEqual(parseArgs(["--debug-url", "http://127.0.0.1:19074"]).lockFile, defaultLockPath({ debugUrl: "http://127.0.0.1:19074/" }));
assert.deepEqual(parseArgs(["--no-lock"]).noLock, true);
assert.deepEqual(parseArgs(["--expected-client-version", "v-test"]).expectedClientVersion, "v-test");
assert.deepEqual(parseArgs(["--min-screenshot-bytes", "0"]).minScreenshotBytes, 0);

assert.match(script, /\/api\/stream-info/);
assert.match(script, /\/api\/deep-state/);
assert.match(script, /\/api\/action/);
assert.match(script, /\/api\/screenshot\?force=1/);
assert.match(script, /\/api\/lease/);
assert.match(script, /\/api\/lease\/release/);
assert.match(script, /acquireDebugLaneLease/);
assert.match(script, /debug_lane_lease_unavailable/);
assert.match(script, /leaseToken/);
assert.equal(typeof acquireDebugLaneLease, "function");
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
assert.match(script, /acquireHarnessLock/);
assert.match(script, /ios_visual_harness_lock_timeout/);
assert.match(script, /report\.lease/);
assert.match(script, /--expected-client-version/);
assert.match(script, /screenshot_meets_min_bytes/);
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

const commonPass = assertCommonHarness({
  metrics: { clientVersion: "v1" },
  screenshot: { bytes: 8192, path: "/tmp/screenshot.png" },
}, { expectedClientVersion: "v1", minScreenshotBytes: 4096 });
assert.deepEqual(commonPass.map((item) => item.pass), [true, true]);

const commonFail = assertCommonHarness({
  metrics: { clientVersion: "old" },
  screenshot: { bytes: 12, path: "/tmp/screenshot.png" },
}, { expectedClientVersion: "new", minScreenshotBytes: 4096 });
assert.deepEqual(commonFail.map((item) => item.pass), [false, false]);

for (const doc of [runbook, mobileContract, platformContract, testMatrix, rolloutStatus]) {
  assert.match(doc, /npm run ios:pwa:visual/);
  assert.match(doc, /ios-pwa-visual-harness\.js/);
}

assert.match(platformContract, /`ios_visual_harness_command`/);
assert.match(mobileContract, /directory-dark-status/);
assert.match(mobileContract, /embedded-plugin-shell/);
assert.match(mobileContract, /--no-lock/);
assert.match(mobileContract, /debug lane lease/i);
assert.match(runbook, /--expected-client-version/);
assert.match(runbook, /--no-lock/);
assert.match(runbook, /debug_lane_locked/);
assert.match(platformContract, /--expected-client-version/);
assert.match(platformContract, /debug lane lease/i);
assert.match(testMatrix, /node tests\\ios-pwa-visual-harness\.test\.js/);

async function testLaneLockSerializesVisualHarnessRuns() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-ios-visual-lock-"));
  const lockFile = path.join(root, "lane.lock");
  const first = await acquireHarnessLock({ lockFile, debugUrl: "http://127.0.0.1:19073/", lockTimeoutMs: 100, lockStaleMs: 300000 });
  assert.equal(first.acquired, true);
  assert.ok(fs.existsSync(lockFile));
  try {
    await assert.rejects(
      () => acquireHarnessLock({ lockFile, debugUrl: "http://127.0.0.1:19073/", lockTimeoutMs: 30, lockStaleMs: 300000 }),
      /ios_visual_harness_lock_timeout/,
    );
  } finally {
    first.release();
  }
  assert.equal(fs.existsSync(lockFile), false);
  const second = await acquireHarnessLock({ lockFile, debugUrl: "http://127.0.0.1:19073/", lockTimeoutMs: 100, lockStaleMs: 300000 });
  second.release();
}

async function main() {
  await testLaneLockSerializesVisualHarnessRuns();
  console.log("iOS PWA visual harness tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
