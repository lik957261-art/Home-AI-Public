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

testAutomationBackendDefaults();
testRuntimeEnvironmentProjectsResolvedBackend();

console.log("mobile runtime environment service tests passed");
