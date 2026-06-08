"use strict";

const assert = require("node:assert/strict");
const {
  createMobileRuntimeGatewayEnvironment,
} = require("../adapters/mobile-runtime-gateway-environment-service");
const {
  nonNegativeInteger,
  nonNegativeMilliseconds,
  normalizeAutoMode,
} = require("../adapters/mobile-runtime-env-value-service");

function testGatewayProfileLaunchScriptPrecedence() {
  const mobileScript = "/opt/homeai/gateway-worker/macos-launch-gateway-profile.sh";
  const webScript = "/opt/homeai/gateway-worker/web-launch-gateway-profile.sh";
  const runtime = createMobileRuntimeGatewayEnvironment({
    env: {
      HERMES_MOBILE_GATEWAY_PROFILE_LAUNCH_SCRIPT: mobileScript,
      HERMES_WEB_GATEWAY_PROFILE_LAUNCH_SCRIPT: webScript,
    },
  });
  assert.equal(runtime.GATEWAY_POOL_ELASTIC_CONFIG.HERMES_MOBILE_GATEWAY_PROFILE_LAUNCH_SCRIPT, mobileScript);
  assert.equal(runtime.GATEWAY_POOL_ELASTIC_CONFIG.HERMES_WEB_GATEWAY_PROFILE_LAUNCH_SCRIPT, webScript);
  assert.equal(runtime.GATEWAY_POOL_ELASTIC_CONFIG.profileLaunchScript, mobileScript);

  const webRuntime = createMobileRuntimeGatewayEnvironment({
    env: {
      HERMES_WEB_GATEWAY_PROFILE_LAUNCH_SCRIPT: webScript,
    },
  });
  assert.equal(webRuntime.GATEWAY_POOL_ELASTIC_CONFIG.profileLaunchScript, webScript);
}

function testGatewayRoutingAndTelemetryParsing() {
  const runtime = createMobileRuntimeGatewayEnvironment({
    env: {
      HERMES_MOBILE_GATEWAY_SKILL_PROFILE_ROUTING: "yes",
      HERMES_MOBILE_GATEWAY_USAGE_TELEMETRY_ENABLED: "0",
      HERMES_MOBILE_GATEWAY_TELEMETRY_PROFILES_ROOTS: " /a , /b,,/c ",
      HERMES_MOBILE_RUN_WEB_SEARCH_MAX_CALLS: "3.9",
      HERMES_MOBILE_RUN_EXPLICIT_WEB_SEARCH_MAX_CALLS: "-2",
      HERMES_MOBILE_RUN_STREAMING_SAVE_THROTTLE_MS: "-1",
      HERMES_WEB_RUN_STREAMING_SAVE_THROTTLE_MS: "-2",
      HERMES_MOBILE_GATEWAY_OWNER_DEEPSEEK_MAX_WORKERS: "2",
      HERMES_MOBILE_GATEWAY_OWNER_MAINTENANCE_MAX_WORKERS: "1",
      HERMES_MOBILE_GATEWAY_WORKSPACE_DEEPSEEK_MAX_WORKERS: "1",
    },
  });
  assert.equal(runtime.GATEWAY_SKILL_PROFILE_ROUTING, "on");
  assert.equal(runtime.GATEWAY_USAGE_TELEMETRY_ENABLED, "0");
  assert.deepEqual(runtime.GATEWAY_USAGE_TELEMETRY_PROFILE_ROOTS, ["/a", "/b", "/c"]);
  assert.equal(runtime.RUN_WEB_SEARCH_MAX_CALLS, 3);
  assert.equal(runtime.RUN_EXPLICIT_WEB_SEARCH_MAX_CALLS, 20);
  assert.equal(runtime.RUN_STREAMING_SAVE_THROTTLE_MS, 1200);
  assert.equal(runtime.GATEWAY_POOL_ELASTIC_CONFIG.HERMES_MOBILE_GATEWAY_OWNER_DEEPSEEK_MAX_WORKERS, "2");
  assert.equal(runtime.GATEWAY_POOL_ELASTIC_CONFIG.HERMES_MOBILE_GATEWAY_OWNER_MAINTENANCE_MAX_WORKERS, "1");
  assert.equal(runtime.GATEWAY_POOL_ELASTIC_CONFIG.HERMES_MOBILE_GATEWAY_WORKSPACE_DEEPSEEK_MAX_WORKERS, "1");
}

function testGatewaySelectorDefaultsAndOverrides() {
  const runtime = createMobileRuntimeGatewayEnvironment({
    env: {
      HERMES_MOBILE_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION: "true",
      HERMES_MOBILE_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_TIMEOUT_MS: "25",
      HERMES_MOBILE_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_STOP_TIMEOUT_MS: "100",
      HERMES_MOBILE_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_MODEL: "custom-selector",
      HERMES_MOBILE_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_PROVIDER: "openai",
      HERMES_MOBILE_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_REASONING_EFFORT: "medium",
      HERMES_MOBILE_GATEWAY_MODEL_PERMISSION_PREFLIGHT: "on",
      HERMES_MOBILE_GATEWAY_MODEL_PERMISSION_PREFLIGHT_TIMEOUT_MS: "10",
    },
  });
  assert.equal(runtime.GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_ENABLED, true);
  assert.equal(runtime.GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_TIMEOUT_MS, 1000);
  assert.equal(runtime.GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_STOP_TIMEOUT_MS, 500);
  assert.equal(runtime.GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_MODEL, "custom-selector");
  assert.equal(runtime.GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_PROVIDER, "openai");
  assert.equal(runtime.GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_REASONING_EFFORT, "medium");
  assert.equal(runtime.GATEWAY_MODEL_PERMISSION_PREFLIGHT_ENABLED, true);
  assert.equal(runtime.GATEWAY_MODEL_PERMISSION_PREFLIGHT_TIMEOUT_MS, 1000);
}

function testSharedValueHelpers() {
  assert.equal(normalizeAutoMode("true"), "on");
  assert.equal(normalizeAutoMode("false"), "off");
  assert.equal(normalizeAutoMode("auto"), "auto");
  assert.equal(normalizeAutoMode("unexpected"), "auto");
  assert.equal(nonNegativeMilliseconds("0", 10), 0);
  assert.equal(nonNegativeMilliseconds("-1", 10), 10);
  assert.equal(nonNegativeInteger("3.8", 1), 3);
  assert.equal(nonNegativeInteger("bad", 1), 1);
}

testGatewayProfileLaunchScriptPrecedence();
testGatewayRoutingAndTelemetryParsing();
testGatewaySelectorDefaultsAndOverrides();
testSharedValueHelpers();

console.log("mobile runtime gateway environment service tests passed");
