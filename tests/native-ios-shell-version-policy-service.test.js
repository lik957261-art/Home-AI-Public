"use strict";

const assert = require("node:assert/strict");
const {
  DEFAULT_IOS_SHELL_MINIMUM_BUILD,
  DEFAULT_TESTFLIGHT_URL,
  createNativeIosShellVersionPolicyService,
  normalizePolicy,
  parsePositiveInteger,
  safeTestFlightUrl,
} = require("../adapters/native-ios-shell-version-policy-service");

function testDefaultPolicyDoesNotLockOutBuild35() {
  const service = createNativeIosShellVersionPolicyService({ env: {} });
  const result = service.evaluate({ platform: "ios", buildNumber: "35", version: "1.0" });

  assert.equal(result.ok, true);
  assert.equal(result.platform, "ios");
  assert.equal(result.minimumBuild, DEFAULT_IOS_SHELL_MINIMUM_BUILD);
  assert.equal(result.latestBuild >= result.minimumBuild, true);
  assert.equal(result.currentBuild, 35);
  assert.equal(result.version, "1.0");
  assert.equal(result.updateRequired, false);
  assert.equal(result.message, "");
  assert.equal(result.testFlightUrl, DEFAULT_TESTFLIGHT_URL);
}

function testOldBuildRequiresUpdate() {
  const service = createNativeIosShellVersionPolicyService({
    minimumBuild: 36,
    latestBuild: 37,
    testFlightUrl: "https://testflight.apple.com/join/MTdEfYEt",
  });
  const result = service.evaluate({ platform: "ios", buildNumber: "35", version: "1.0.1" });

  assert.equal(result.ok, true);
  assert.equal(result.minimumBuild, 36);
  assert.equal(result.latestBuild, 37);
  assert.equal(result.currentBuild, 35);
  assert.equal(result.updateRequired, true);
  assert.match(result.message, /TestFlight/);
}

function testMalformedBuildFailsClosedWithBoundedPolicy() {
  const service = createNativeIosShellVersionPolicyService({ minimumBuild: 36, latestBuild: 36 });
  const result = service.evaluate({ platform: "ios", buildNumber: "35b", version: "1.0" });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.code, "ios_shell_build_invalid");
  assert.equal(result.updateRequired, true);
  assert.equal(result.minimumBuild, 36);
  assert.equal(result.latestBuild, 36);
  assert.equal(result.testFlightUrl, DEFAULT_TESTFLIGHT_URL);
}

function testUnsupportedPlatformFailsClosed() {
  const service = createNativeIosShellVersionPolicyService({ env: {} });
  const result = service.evaluate({ platform: "android", buildNumber: "1" });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.code, "ios_shell_platform_unsupported");
  assert.equal(result.platform, "android");
  assert.equal(result.updateRequired, true);
}

function testEnvDrivenPolicyAndSafeTestFlightUrl() {
  const service = createNativeIosShellVersionPolicyService({
    env: {
      HOMEAI_NATIVE_IOS_MINIMUM_BUILD: "40",
      HOMEAI_NATIVE_IOS_LATEST_BUILD: "39",
      HOMEAI_NATIVE_IOS_TESTFLIGHT_URL: "https://testflight.apple.com/join/abc_DEF-123",
      HOMEAI_NATIVE_IOS_UPDATE_MESSAGE: "请更新 TestFlight 后继续使用。",
    },
  });
  const summary = service.policySummary();

  assert.equal(summary.minimumBuild, 40);
  assert.equal(summary.latestBuild, 40);
  assert.equal(summary.testFlightUrl, "https://testflight.apple.com/join/abc_DEF-123");
  assert.equal(summary.updateMessage, "请更新 TestFlight 后继续使用。");
}

function testSafeUrlAndIntegerHelpers() {
  assert.equal(parsePositiveInteger("35"), 35);
  assert.equal(parsePositiveInteger(""), null);
  assert.equal(parsePositiveInteger("35.1"), null);
  assert.equal(safeTestFlightUrl("https://example.com/join/MTdEfYEt"), DEFAULT_TESTFLIGHT_URL);
  assert.equal(safeTestFlightUrl("https://testflight.apple.com/join/MTdEfYEt?token=x"), DEFAULT_TESTFLIGHT_URL);
  assert.equal(normalizePolicy({ minimumBuild: "bad" }).minimumBuild, DEFAULT_IOS_SHELL_MINIMUM_BUILD);
}

testDefaultPolicyDoesNotLockOutBuild35();
testOldBuildRequiresUpdate();
testMalformedBuildFailsClosedWithBoundedPolicy();
testUnsupportedPlatformFailsClosed();
testEnvDrivenPolicyAndSafeTestFlightUrl();
testSafeUrlAndIntegerHelpers();
console.log("native ios shell version policy service tests passed");
