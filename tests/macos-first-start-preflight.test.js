"use strict";

const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  DEFAULT_BUSINESS_PLUGIN_IDS,
  FOLLOW_UP_DIAGNOSTICS,
  REQUIRED_SOURCE_FILES,
  buildReport,
} = require("../scripts/macos-first-start-preflight");

const REPO_ROOT = path.resolve(__dirname, "..");

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-first-start-"));
  const appScripts = path.join(root, "app", "scripts");
  fs.mkdirSync(appScripts, { recursive: true });
  fs.mkdirSync(path.join(root, "runtime", "node-current", "bin"), { recursive: true });
  fs.mkdirSync(path.join(root, "data", "secrets"), { recursive: true });
  fs.mkdirSync(path.join(root, "data", "hermes-home", "scripts"), { recursive: true });
  fs.mkdirSync(path.join(root, "data", "production-drift-audit"), { recursive: true });
  fs.writeFileSync(path.join(root, "runtime", "node-current", "bin", "node"), "#!/bin/sh\n", { mode: 0o755 });
  fs.writeFileSync(path.join(root, "data", "gateway-pool-manifest-mac.json"), "{\"workers\":[]}\n");
  fs.writeFileSync(path.join(root, "data", "secrets", "owner-web-key.secret"), "owner-key\n", { mode: 0o600 });
  return root;
}

function makeLaunchdDir() {
  const launchdDir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-first-start-launchd-"));
  fs.writeFileSync(path.join(launchdDir, "com.hermesmobile.production-drift-audit.plist"), [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">",
    "<plist version=\"1.0\">",
    "<dict>",
    "  <key>Label</key>",
    "  <string>com.hermesmobile.production-drift-audit</string>",
    "  <key>ProgramArguments</key>",
    "  <array>",
    "    <string>/tmp/homeai/data/hermes-home/scripts/homeai-production-drift-audit-watchdog.sh</string>",
    "  </array>",
    "  <key>EnvironmentVariables</key>",
    "  <dict>",
    "    <key>HOMEAI_PRODUCTION_DRIFT_AUTO_REPAIR</key>",
    "    <string>1</string>",
    "  </dict>",
    "</dict>",
    "</plist>",
    "",
  ].join("\n"));
  return launchdDir;
}

function installProductionDriftScripts(root) {
  const appScripts = path.join(root, "app", "scripts");
  fs.writeFileSync(path.join(appScripts, "macos-production-drift-reconcile.js"), "\"use strict\";\n");
  fs.writeFileSync(path.join(appScripts, "homeai-production-drift-audit-watchdog.sh"), "#!/usr/bin/env bash\n");
  fs.writeFileSync(
    path.join(root, "data", "hermes-home", "scripts", "homeai-production-drift-audit-watchdog.sh"),
    "#!/usr/bin/env bash\n",
    { mode: 0o755 },
  );
}

function installPluginWorkspaceProvisioningPlan(root, overrides = {}) {
  const workspaces = overrides.workspaces || [
    {
      workspaceId: "owner",
      macUser: "hm-owner",
      defaultBusinessPluginCount: DEFAULT_BUSINESS_PLUGIN_IDS.length,
      plugins: DEFAULT_BUSINESS_PLUGIN_IDS.map((pluginId) => ({
        pluginId,
        currentStatus: "pending",
        complete: false,
        applyPath: "/api/workspace-onboarding/apply",
      })),
    },
  ];
  fs.writeFileSync(path.join(root, "data", "plugin-workspace-provisioning-plan.json"), JSON.stringify(Object.assign({
    schemaVersion: 1,
    generatedBy: "install-macos-production plan-plugin-workspace-provisioning",
    defaultBusinessPluginIds: DEFAULT_BUSINESS_PLUGIN_IDS,
    excludedSpecialPluginIds: ["codex-mobile-web", "music"],
    createsPluginKeys: false,
    createsWorkspaceGrants: false,
    callsPluginBindEndpoints: false,
    workspaces,
  }, overrides), null, 2));
}

function installPluginWorkspaceProvisioningApply(root, overrides = {}) {
  const workspaces = overrides.workspaces || [
    {
      workspaceId: "owner",
      macUser: "hm-owner",
      status: "active",
      activeCount: DEFAULT_BUSINESS_PLUGIN_IDS.length,
      plugins: DEFAULT_BUSINESS_PLUGIN_IDS.map((pluginId) => ({
        pluginId,
        status: "active",
      })),
      gateway: {
        launchd: {
          ok: true,
          workerCount: 1,
          syncedPluginBindings: DEFAULT_BUSINESS_PLUGIN_IDS,
        },
      },
    },
  ];
  fs.writeFileSync(path.join(root, "data", "plugin-workspace-provisioning-apply.json"), JSON.stringify(Object.assign({
    schemaVersion: 1,
    generatedBy: "install-macos-production apply-plugin-workspace-provisioning",
    ok: true,
    status: "active",
    createsPluginKeys: true,
    createsWorkspaceGrants: true,
    callsPluginBindEndpoints: true,
    workspaceCount: workspaces.length,
    activeCount: DEFAULT_BUSINESS_PLUGIN_IDS.length,
    failedCount: 0,
    workspaces,
    privacy: {
      rawKeysReturned: false,
      rawTokensReturned: false,
    },
  }, overrides), null, 2));
}

function testSourceOnlyPasses() {
  const report = buildReport({ repoRoot: REPO_ROOT, sourceOnly: true });
  assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
  assert.equal(report.requiredSourceFileCount, REQUIRED_SOURCE_FILES.length);
  assert.ok(FOLLOW_UP_DIAGNOSTICS.some((entry) => entry.id === "production-closure"));
}

function testHostModeCanPassWithTempRoot() {
  const root = makeTempRoot();
  const launchdDir = makeLaunchdDir();
  installProductionDriftScripts(root);
  installPluginWorkspaceProvisioningPlan(root);
  installPluginWorkspaceProvisioningApply(root);
  const report = buildReport({
    repoRoot: REPO_ROOT,
    root,
    launchdDir,
    networkMode: "direct",
    base: "http://127.0.0.1:8797",
  });
  assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
}

function testHostModeFailsClosedForMissingNetworkModeAndOpenKey() {
  const root = makeTempRoot();
  const launchdDir = makeLaunchdDir();
  installProductionDriftScripts(root);
  installPluginWorkspaceProvisioningPlan(root);
  installPluginWorkspaceProvisioningApply(root);
  fs.chmodSync(path.join(root, "data", "secrets", "owner-web-key.secret"), 0o644);
  const report = buildReport({ repoRoot: REPO_ROOT, root, launchdDir });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.code === "network_mode_missing_or_invalid"));
  assert.ok(report.issues.some((issue) => issue.code === "owner_key_file_mode_too_open"));
}

function testHostModeFailsClosedForMissingDriftWatchdogPlist() {
  const root = makeTempRoot();
  const launchdDir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-first-start-empty-launchd-"));
  installProductionDriftScripts(root);
  installPluginWorkspaceProvisioningPlan(root);
  installPluginWorkspaceProvisioningApply(root);
  const report = buildReport({ repoRoot: REPO_ROOT, root, launchdDir, networkMode: "direct" });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.code === "production_drift_launchd_plist_missing"));
}

function testHostModeFailsClosedForMissingPluginProvisioningPlan() {
  const root = makeTempRoot();
  const launchdDir = makeLaunchdDir();
  installProductionDriftScripts(root);
  const report = buildReport({ repoRoot: REPO_ROOT, root, launchdDir, networkMode: "direct" });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.code === "plugin_workspace_provisioning_plan_missing"));
}

function testHostModeFailsClosedForInvalidPluginProvisioningPlan() {
  const root = makeTempRoot();
  const launchdDir = makeLaunchdDir();
  installProductionDriftScripts(root);
  installPluginWorkspaceProvisioningPlan(root, {
    schemaVersion: 2,
    createsPluginKeys: true,
    defaultBusinessPluginIds: ["finance"],
    workspaces: [{ workspaceId: "owner", plugins: [{ pluginId: "finance" }] }],
  });
  installPluginWorkspaceProvisioningApply(root, {
    workspaces: [{
      workspaceId: "owner",
      macUser: "hm-owner",
      status: "active",
      plugins: DEFAULT_BUSINESS_PLUGIN_IDS.map((pluginId) => ({ pluginId, status: "active" })),
      gateway: { launchd: { ok: true } },
    }],
  });
  const report = buildReport({ repoRoot: REPO_ROOT, root, launchdDir, networkMode: "direct" });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.code === "plugin_workspace_provisioning_plan_schema_invalid"));
  assert.ok(report.issues.some((issue) => issue.code === "plugin_workspace_provisioning_plan_creates_keys_unexpected"));
  assert.ok(report.issues.some((issue) => issue.code === "plugin_workspace_provisioning_plan_default_plugin_missing" && issue.pluginId === "email"));
  assert.ok(report.issues.some((issue) => issue.code === "plugin_workspace_provisioning_plan_workspace_plugin_missing" && issue.pluginId === "email"));
}

function testHostModeFailsClosedForMissingPluginProvisioningApply() {
  const root = makeTempRoot();
  const launchdDir = makeLaunchdDir();
  installProductionDriftScripts(root);
  installPluginWorkspaceProvisioningPlan(root);
  const report = buildReport({ repoRoot: REPO_ROOT, root, launchdDir, networkMode: "direct" });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.code === "plugin_workspace_provisioning_apply_missing"));
}

function testHostModeFailsClosedForIncompletePluginProvisioningApply() {
  const root = makeTempRoot();
  const launchdDir = makeLaunchdDir();
  installProductionDriftScripts(root);
  installPluginWorkspaceProvisioningPlan(root);
  installPluginWorkspaceProvisioningApply(root, {
    ok: false,
    status: "partial",
    workspaces: [{
      workspaceId: "owner",
      macUser: "hm-owner",
      status: "partial",
      plugins: DEFAULT_BUSINESS_PLUGIN_IDS.filter((pluginId) => pluginId !== "moira").map((pluginId) => ({ pluginId, status: "active" })),
      gateway: { launchd: { ok: false } },
    }],
  });
  const report = buildReport({ repoRoot: REPO_ROOT, root, launchdDir, networkMode: "direct" });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.code === "plugin_workspace_provisioning_apply_failed"));
  assert.ok(report.issues.some((issue) => issue.code === "plugin_workspace_provisioning_apply_owner_plugin_not_active" && issue.pluginId === "moira"));
  assert.ok(report.issues.some((issue) => issue.code === "plugin_workspace_provisioning_apply_owner_gateway_not_refreshed"));
}

function testCliSourceOnly() {
  const output = execFileSync("node", ["scripts/macos-first-start-preflight.js", "--source-only", "--json"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.mode, "source-only");
}

function testCliHostFailureIsBounded() {
  const result = spawnSync("node", ["scripts/macos-first-start-preflight.js", "--root", "/tmp/homeai-missing-root", "--json"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.issues.some((issue) => issue.code === "mac_root_missing"));
  assert.doesNotMatch(result.stdout, /owner-key\n/);
}

function testPermissionDeniedIsNotReportedAsMissing() {
  const report = buildReport({
    repoRoot: REPO_ROOT,
    root: "/Users/example/path",
    networkMode: "direct",
  });
  const codes = report.issues.map((issue) => issue.code);
  if (codes.includes("gateway_manifest_unreadable")) {
    assert.ok(!codes.includes("gateway_manifest_missing"));
  }
  if (codes.includes("owner_key_file_unreadable")) {
    assert.ok(!codes.includes("owner_key_file_missing"));
  }
}

testSourceOnlyPasses();
testHostModeCanPassWithTempRoot();
testHostModeFailsClosedForMissingNetworkModeAndOpenKey();
testHostModeFailsClosedForMissingDriftWatchdogPlist();
testHostModeFailsClosedForMissingPluginProvisioningPlan();
testHostModeFailsClosedForInvalidPluginProvisioningPlan();
testHostModeFailsClosedForMissingPluginProvisioningApply();
testHostModeFailsClosedForIncompletePluginProvisioningApply();
testCliSourceOnly();
testCliHostFailureIsBounded();
testPermissionDeniedIsNotReportedAsMissing();

console.log("macos first-start preflight tests passed");
