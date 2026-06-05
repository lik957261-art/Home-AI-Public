"use strict";

const assert = require("node:assert/strict");
const {
  createMobileRuntimeEnvironment,
  resolveAutomationBackend,
} = require("../adapters/mobile-runtime-environment-service");

function testAutomationBackendDefaults() {
  assert.equal(resolveAutomationBackend({}), "local");
  assert.equal(resolveAutomationBackend({ HERMES_WEB_AUTOMATION_BACKEND: "local" }), "local");
  assert.equal(resolveAutomationBackend({ HERMES_WEB_AUTOMATION_BACKEND: "hermes_cron" }), "hermes_cron");
  assert.equal(resolveAutomationBackend({ HERMES_MOBILE_AUTOMATION_BACKEND: "hermes_cron" }), "hermes_cron");
  assert.equal(resolveAutomationBackend({
    HERMES_WEB_SERVICE_STORE: "sqlite",
  }), "hermes_cron");
  assert.equal(resolveAutomationBackend({
    HERMES_WEB_SERVICE_STORE: "sqlite",
    HERMES_WEB_AUTOMATION_BACKEND: "local",
  }), "local");
}

function testRuntimeEnvironmentProjectsResolvedBackend() {
  const sqliteRuntime = createMobileRuntimeEnvironment({
    env: {
      HERMES_WEB_SERVICE_STORE: "sqlite",
      HERMES_WEB_DATA_DIR: "C:\\tmp\\hermes-data",
    },
    toolRoot: process.cwd(),
  });
  assert.equal(sqliteRuntime.AUTOMATION_BACKEND, "hermes_cron");

  const explicitLocalRuntime = createMobileRuntimeEnvironment({
    env: {
      HERMES_WEB_SERVICE_STORE: "sqlite",
      HERMES_WEB_AUTOMATION_BACKEND: "local",
      HERMES_WEB_DATA_DIR: "C:\\tmp\\hermes-data",
    },
    toolRoot: process.cwd(),
  });
  assert.equal(explicitLocalRuntime.AUTOMATION_BACKEND, "local");
}

function testRuntimeEnvironmentProjectsGatewayProfileLaunchScript() {
  const mobileScript = "/opt/homeai/gateway-worker/macos-launch-gateway-profile.sh";
  const webScript = "/opt/homeai/gateway-worker/web-launch-gateway-profile.sh";
  const mobileRuntime = createMobileRuntimeEnvironment({
    env: {
      HERMES_WEB_DATA_DIR: "C:\\tmp\\hermes-data",
      HERMES_MOBILE_GATEWAY_PROFILE_LAUNCH_SCRIPT: mobileScript,
      HERMES_WEB_GATEWAY_PROFILE_LAUNCH_SCRIPT: webScript,
    },
    toolRoot: process.cwd(),
  });
  assert.equal(mobileRuntime.GATEWAY_POOL_ELASTIC_CONFIG.HERMES_MOBILE_GATEWAY_PROFILE_LAUNCH_SCRIPT, mobileScript);
  assert.equal(mobileRuntime.GATEWAY_POOL_ELASTIC_CONFIG.HERMES_WEB_GATEWAY_PROFILE_LAUNCH_SCRIPT, webScript);
  assert.equal(mobileRuntime.GATEWAY_POOL_ELASTIC_CONFIG.profileLaunchScript, mobileScript);

  const webRuntime = createMobileRuntimeEnvironment({
    env: {
      HERMES_WEB_DATA_DIR: "C:\\tmp\\hermes-data",
      HERMES_WEB_GATEWAY_PROFILE_LAUNCH_SCRIPT: webScript,
    },
    toolRoot: process.cwd(),
  });
  assert.equal(webRuntime.GATEWAY_POOL_ELASTIC_CONFIG.profileLaunchScript, webScript);
}

testAutomationBackendDefaults();
testRuntimeEnvironmentProjectsResolvedBackend();
testRuntimeEnvironmentProjectsGatewayProfileLaunchScript();

console.log("mobile runtime environment service tests passed");
