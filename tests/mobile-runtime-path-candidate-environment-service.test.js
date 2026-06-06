"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const {
  createMobileRuntimePathCandidateEnvironment,
  wslUncPathCandidates,
} = require("../adapters/mobile-runtime-path-candidate-environment-service");

function testWslUncCandidatesAreOptIn() {
  assert.deepEqual(wslUncPathCandidates({ env: {}, wslDistro: "Ubuntu-24.04" }, "/home/hermes/.hermes", ".env"), []);
  assert.deepEqual(
    wslUncPathCandidates(
      { env: { HERMES_MOBILE_ALLOW_WSL_UNC_PROBES: "1" }, wslDistro: "Ubuntu-24.04" },
      "/home/hermes/.hermes",
      ".env",
    ),
    [
      "\\\\wsl.localhost\\Ubuntu-24.04\\home\\hermes\\.hermes\\.env",
      "\\\\wsl$\\Ubuntu-24.04\\home\\hermes\\.hermes\\.env",
    ],
  );
}

function testPathCandidatesWithoutLegacyWeixin() {
  const runtime = createMobileRuntimePathCandidateEnvironment({
    env: {
      HERMES_WEB_HERMES_ENV_PATH: "C:\\config\\.env",
      HERMES_WEB_HERMES_API_KEY_PATH: "C:\\keys\\api.secret",
      HERMES_WEB_WORKSPACE_USERS_PATH: "C:\\config\\workspace-users.json",
      HERMES_WEB_WEIXIN_USERS_PATH: "C:\\legacy\\weixin-users.json",
      HERMES_WEB_HERMES_CONFIG_PATH: "C:\\config\\hermes.yaml",
      HERMES_CONFIG_PATH: "C:\\config\\config.yaml",
      HERMES_MOBILE_ALLOW_WSL_REASONING_CONFIG_LOOKUP: "on",
      HERMES_MOBILE_STATUS_INCLUDE_CATALOG: "true",
      HERMES_WEB_GATEWAY_POOL_MANIFEST: "C:\\config\\gateway-manifest.json",
      HERMES_WEB_PROJECT_MAP_PATH: "C:\\config\\projects.json",
    },
    localConfigRoot: "C:\\repo\\config",
    windowsHome: "C:\\Users\\owner",
    wslDistro: "Ubuntu-24.04",
    wslHome: "/home/hermes",
    wslHermesHome: "/home/hermes/.hermes",
  });
  assert.equal(runtime.ENABLE_LEGACY_WEIXIN_COMPAT, false);
  assert.deepEqual(runtime.HERMES_ENV_PATHS, ["C:\\config\\.env"]);
  assert.deepEqual(runtime.HERMES_API_KEY_PATHS, [
    "C:\\keys\\api.secret",
    path.join("C:\\Users\\owner", ".hermes-windows", "hermes-api-server-key.secret"),
  ]);
  assert.deepEqual(runtime.WORKSPACE_USERS_PATHS, [
    "C:\\config\\workspace-users.json",
    path.join("C:\\repo\\config", "access-control", "workspace-users.json"),
    "C:\\legacy\\weixin-users.json",
  ]);
  assert.deepEqual([...runtime.EXPLICIT_HERMES_CONFIG_PATHS], [
    "C:\\config\\hermes.yaml",
    "C:\\config\\config.yaml",
  ]);
  assert.equal(runtime.ALLOW_WSL_REASONING_CONFIG_LOOKUP, true);
  assert.equal(runtime.STATUS_INCLUDE_CATALOG, true);
  assert.deepEqual(runtime.GATEWAY_POOL_MANIFEST_PATHS, ["C:\\config\\gateway-manifest.json"]);
  assert.deepEqual(runtime.PROJECT_MAP_PATHS, [
    "C:\\config\\projects.json",
    path.join("C:\\repo\\config", "project-directory-map.json"),
  ]);
}

function testLegacyWeixinAndWslCandidates() {
  const runtime = createMobileRuntimePathCandidateEnvironment({
    env: {
      HERMES_WEB_ENABLE_LEGACY_WEIXIN_COMPAT: "1",
      HERMES_MOBILE_ALLOW_WSL_UNC_PROBES: "1",
    },
    localConfigRoot: "C:\\repo\\config",
    windowsHome: "C:\\Users\\owner",
    wslDistro: "Ubuntu-24.04",
    wslHome: "/home/hermes",
    wslHermesHome: "/home/hermes/.hermes",
  });
  assert.equal(runtime.ENABLE_LEGACY_WEIXIN_COMPAT, true);
  assert.ok(runtime.HERMES_ENV_PATHS.includes("\\\\wsl.localhost\\Ubuntu-24.04\\home\\hermes\\.hermes\\.env"));
  assert.ok(runtime.WORKSPACE_USERS_PATHS.includes("\\\\wsl.localhost\\Ubuntu-24.04\\home\\hermes\\.hermes\\access-control\\weixin-users.json"));
  assert.ok(runtime.WORKSPACE_ROUTE_MAP_PATHS.includes("\\\\wsl.localhost\\Ubuntu-24.04\\home\\hermes\\.hermes\\access-control\\weixin-routing-map.json"));
  assert.ok(runtime.GITHUB_CLI_HOSTS_PATHS.includes("\\\\wsl.localhost\\Ubuntu-24.04\\home\\hermes\\.config\\gh\\hosts.yml"));
}

testWslUncCandidatesAreOptIn();
testPathCandidatesWithoutLegacyWeixin();
testLegacyWeixinAndWslCandidates();

console.log("mobile runtime path candidate environment service tests passed");
