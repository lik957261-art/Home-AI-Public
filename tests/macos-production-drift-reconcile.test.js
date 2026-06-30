"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "macos-production-drift-reconcile.js");
const script = fs.readFileSync(scriptPath, "utf8");
const {
  openAiCodexManifestUsers,
  parseArgs,
  pluginLocalBindingRepairPlan,
  pluginRequiredSkillRepairPlan,
  pluginProvisioningStatusRepairPlan,
  requiredPluginSkillIssueParts,
  reconcileCodexSharedAuthPermissions,
  reconcileGatewayProfileFilePlugins,
  reconcileGatewayStartScriptEnvironment,
  reconcilePluginLocalBindings,
  reconcilePluginRequiredSkills,
  reconcilePluginProvisioningStatuses,
  reconcileMusicRuntimeCoverPermissions,
  reconcileUntrackedGatewayLaunchd,
  runReconcile,
} = require(scriptPath);

assert.match(script, /buildAudit/);
assert.match(script, /installedGatewayChecks/);
assert.match(script, /unsafe_launchd_plist_path/);
assert.match(script, /\/Library\/LaunchDaemons\/com\.hermesmobile\.gateway\./);
assert.match(script, /launchctl", \["bootout", "system", plistPath\]/);
assert.match(script, /production-drift-audit", "quarantine"/);
assert.match(script, /codex-shared-auth-permissions/);
assert.match(script, /codex-shared-auth-document/);
assert.match(script, /gateway-profile-file-plugins/);
assert.match(script, /gateway-start-script-env/);
assert.match(script, /gateway-telemetry-access/);
assert.match(script, /profile_dir\/auth\.json/);
assert.match(script, /user:hermes-host allow list,add_file,search,delete_child/);
assert.match(script, /music-runtime-cover-permissions/);
assert.match(script, /plugin-required-skill/);
assert.match(script, /plugin_required_skill_/);
assert.match(script, /installWardrobeSkill/);
assert.match(script, /plugin-provisioning-status/);
assert.match(script, /plugin-local-binding/);
assert.match(script, /createGrowthPluginProvisioningService/);
assert.match(script, /createMoiraPluginProvisioningService/);
assert.match(script, /updateProvisioningStatus/);

assert.deepEqual(parseArgs(["--root", "/tmp/root", "--execute", "--json"]), {
  root: "/tmp/root",
  execute: true,
  json: true,
});

const dryRunRows = reconcileUntrackedGatewayLaunchd({
  installedGatewayChecks: [
    {
      label: "com.hermesmobile.gateway.hm-owner.openai.1",
      trackedByManifest: true,
      plistPath: "/Library/LaunchDaemons/com.hermesmobile.gateway.hm-owner.openai.1.plist",
      startScriptPath: "/Users/example/path",
    },
    {
      label: "com.hermesmobile.gateway.hm-owner.maintenance.openai.1",
      trackedByManifest: false,
      plistPath: "/Library/LaunchDaemons/com.hermesmobile.gateway.hm-owner.maintenance.openai.1.plist",
      startScriptPath: "/Users/example/path",
    },
  ],
}, {
  root: "/Users/example/path",
  execute: false,
});

assert.equal(dryRunRows.length, 1);
assert.equal(dryRunRows[0].type, "untracked-gateway-launchd");
assert.equal(dryRunRows[0].label, "com.hermesmobile.gateway.hm-owner.maintenance.openai.1");
assert.equal(dryRunRows[0].action, "plan");
assert.equal(dryRunRows[0].moveStatus, null);
assert.equal(dryRunRows[0].bootoutStatus, null);

assert.throws(() => reconcileUntrackedGatewayLaunchd({
  installedGatewayChecks: [
    {
      label: "com.hermesmobile.listener",
      trackedByManifest: false,
      plistPath: "/Library/LaunchDaemons/com.hermesmobile.listener.plist",
      startScriptPath: "/Users/example/path",
    },
  ],
}), /unsafe_launchd_plist_path/);

assert.throws(() => reconcileUntrackedGatewayLaunchd({
  installedGatewayChecks: [
    {
      label: "com.hermesmobile.gateway.bad",
      trackedByManifest: false,
      plistPath: "/tmp/com.hermesmobile.gateway.bad.plist",
      startScriptPath: "/tmp/start.sh",
    },
  ],
}), /unsafe_launchd_plist_path/);

const auditWithPluginBindingDrift = {
  issues: [
    "plugin_local_binding_incomplete:owner:growth",
    "plugin_local_binding_incomplete:weixin_wuping:moira",
    "plugin_local_binding_incomplete:legacy:unknown",
  ],
  pluginAuthorizations: [
    { workspaceId: "owner", pluginId: "growth", status: "active", provisioningStatus: "ok", enabled: true },
    { workspaceId: "weixin_wuping", pluginId: "moira", status: "authorized", provisioningStatus: "not_supported", enabled: true },
    { workspaceId: "legacy", pluginId: "unknown", status: "authorized", provisioningStatus: "not_supported", enabled: true },
  ],
  byWorkspace: {
    owner: { localPluginBindings: [{ pluginId: "growth", complete: false }] },
    weixin_wuping: { localPluginBindings: [{ pluginId: "moira", complete: false }] },
    legacy: { localPluginBindings: [{ pluginId: "unknown", complete: false }] },
  },
};

const auditWithPluginProvisioningStatusDrift = {
  issues: [
    "plugin_provisioning_not_active:weixin_test_1:wardrobe:provisioning_failed",
    "plugin_provisioning_not_active:weixin_missing:wardrobe:provisioning_failed",
  ],
  pluginAuthorizations: [
    { workspaceId: "weixin_test_1", pluginId: "wardrobe", status: "authorized", provisioningStatus: "provisioning_failed", enabled: true },
    { workspaceId: "weixin_missing", pluginId: "wardrobe", status: "authorized", provisioningStatus: "provisioning_failed", enabled: true },
  ],
  byWorkspace: {
    weixin_test_1: {
      localPluginBindings: [{ pluginId: "wardrobe", complete: true }],
      requiredPluginSkills: [{ pluginId: "wardrobe", complete: true, listenerCanReadSkillFile: true }],
    },
    weixin_missing: {
      localPluginBindings: [{ pluginId: "wardrobe", complete: false }],
      requiredPluginSkills: [{ pluginId: "wardrobe", complete: true, listenerCanReadSkillFile: true }],
    },
  },
};

const auditWithRequiredSkillDrift = {
  issues: [
    "plugin_required_skill_incomplete:owner:wardrobe:productivity/wardrobe-style-operations",
    "plugin_required_skill_unreadable:weixin_wuping:wardrobe:productivity/wardrobe-style-operations",
    "plugin_required_skill_incomplete:legacy:unknown:productivity/unknown-skill",
  ],
  byWorkspace: {
    owner: { workers: [{ osUser: "hm-owner" }] },
    weixin_wuping: { workers: [{ osUser: "hm-wuping" }] },
    legacy: { workers: [] },
  },
};

assert.deepEqual(
  requiredPluginSkillIssueParts("plugin_required_skill_unreadable:owner:wardrobe:productivity/wardrobe-style-operations"),
  {
    issueKind: "unreadable",
    workspaceId: "owner",
    pluginId: "wardrobe",
    skillId: "productivity/wardrobe-style-operations",
  },
);
assert.equal(requiredPluginSkillIssueParts("plugin_local_binding_incomplete:owner:growth"), null);

const pluginRepairPlan = pluginLocalBindingRepairPlan(auditWithPluginBindingDrift, {
  root: "/Users/example/path",
  plugins: [
    { id: "growth", manifestUrl: "http://127.0.0.1:4881/api/v1/hermes/plugin/manifest" },
    { id: "moira", manifestUrl: "http://127.0.0.1:4174/api/v1/hermes/plugin/manifest" },
  ],
});
assert.equal(pluginRepairPlan.length, 3);
assert.deepEqual(pluginRepairPlan.map((row) => `${row.workspaceId}:${row.pluginId}:${row.supported}:${row.action}`), [
  "owner:growth:true:plan",
  "weixin_wuping:moira:true:plan",
  "legacy:unknown:false:plan",
]);
assert.equal(JSON.stringify(pluginRepairPlan).includes("access-key-value"), false);

const provisioningStatusPlan = pluginProvisioningStatusRepairPlan(auditWithPluginProvisioningStatusDrift, { execute: true });
assert.deepEqual(provisioningStatusPlan.map((row) => `${row.workspaceId}:${row.pluginId}:${row.action}:${row.ok}`), [
  "weixin_test_1:wardrobe:activate:true",
  "weixin_missing:wardrobe:plan:false",
]);

const tempRoot = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "homeai-drift-reconcile-"));
const tempAppRoot = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "homeai-drift-reconcile-app-"));
fs.mkdirSync(path.join(tempRoot, "data"), { recursive: true });
fs.mkdirSync(path.join(tempRoot, "gateway-worker", "telemetry", "profiles", "shared-auth"), { recursive: true });
fs.mkdirSync(path.join(tempRoot, "plugins", "music"), { recursive: true });
const wardrobeSkillSource = path.join(tempAppRoot, "skills", "productivity", "wardrobe-style-operations");
fs.mkdirSync(path.join(wardrobeSkillSource, "references"), { recursive: true });
fs.mkdirSync(path.join(wardrobeSkillSource, "scripts"), { recursive: true });
fs.writeFileSync(path.join(wardrobeSkillSource, "SKILL.md"), [
  "---",
  "name: wardrobe-style-operations",
  "description: Test wardrobe skill template without credentials.",
  "---",
  "",
  "# Wardrobe Style Operations",
  "",
  "Use this keyless template for wardrobe read/write planning.",
  "x".repeat(2300),
].join("\n"), "utf8");
fs.writeFileSync(path.join(wardrobeSkillSource, "references", "wardrobe-program-api.md"), "# Program API\n", "utf8");
fs.writeFileSync(path.join(wardrobeSkillSource, "references", "wardrobe-style-policy.md"), "# Style Policy\n", "utf8");
fs.writeFileSync(path.join(wardrobeSkillSource, "scripts", "render_wardrobe_phone_pdf.py"), "print('ok')\n", "utf8");
for (const pluginName of ["hermes-mobile-docx", "hermes-mobile-pptx", "hermes-mobile-pdf", "hermes-mobile-audio", "hermes-mobile-archive"]) {
  const pluginDir = path.join(tempAppRoot, "gateway-plugins", pluginName);
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, "plugin.yaml"), `name: ${pluginName}\n`, "utf8");
  fs.writeFileSync(path.join(pluginDir, "__init__.py"), "# test plugin\n", "utf8");
}
fs.writeFileSync(path.join(tempRoot, "data", "gateway-pool-manifest-mac.json"), JSON.stringify({
  workers: [
    { provider: "openai-codex", osUser: "hm-owner" },
    { provider: "openai-codex", osUser: "hm-owner" },
    { provider: "deepseek", osUser: "hm-owner" },
    { provider: "openai-codex", osUser: "hm-wuping" },
  ],
}));
fs.writeFileSync(path.join(tempRoot, "gateway-worker", "telemetry", "profiles", "shared-auth", "auth.json"), "{}\n");
fs.writeFileSync(path.join(tempRoot, "gateway-worker", "telemetry", "profiles", "shared-auth", "auth.lock"), "");
fs.writeFileSync(path.join(tempRoot, "plugins", "music", "runtime-placeholder"), "");
const profileDir = path.join(tempRoot, "users", "hm-owner", "HermesWorkspace", ".hermes-gateway", "profiles", "hm-owner-openai-1");
fs.mkdirSync(path.join(profileDir, "plugins"), { recursive: true });
fs.writeFileSync(path.join(profileDir, "config.yaml"), "provider: openai-codex\n", "utf8");

const requiredSkillPlan = pluginRequiredSkillRepairPlan(auditWithRequiredSkillDrift, {
  root: tempRoot,
  execute: true,
  listenerUser: "hermes-host",
});
assert.deepEqual(requiredSkillPlan.map((row) => `${row.workspaceId}:${row.pluginId}:${row.issueKind}:${row.supported}:${row.action}:${row.ok}`), [
  "owner:wardrobe:incomplete:true:repair:true",
  "weixin_wuping:wardrobe:unreadable:true:repair:true",
  "legacy:unknown:incomplete:false:plan:false",
]);
assert.equal(requiredSkillPlan.find((row) => row.workspaceId === "owner").profileId, "owner-full");

const requiredSkillRepair = reconcilePluginRequiredSkills(auditWithRequiredSkillDrift, {
  root: tempRoot,
  appPath: tempAppRoot,
  execute: true,
  listenerUser: "hermes-host",
  applyAcl: false,
  userExists: () => true,
});
assert.equal(requiredSkillRepair.length, 3);
assert.equal(requiredSkillRepair.find((row) => row.workspaceId === "owner").ok, true);
assert.equal(requiredSkillRepair.find((row) => row.workspaceId === "weixin_wuping").ok, true);
assert.equal(requiredSkillRepair.find((row) => row.workspaceId === "legacy").ok, false);
assert.equal(fs.existsSync(path.join(tempRoot, "data", "skill-profiles", "owner-full", "skills", "productivity", "wardrobe-style-operations", "SKILL.md")), true);
assert.equal(fs.existsSync(path.join(tempRoot, "data", "skill-profiles", "weixin_wuping", "skills", "productivity", "wardrobe-style-operations", "scripts", "render_wardrobe_phone_pdf.py")), true);
assert.deepEqual(requiredSkillRepair.find((row) => row.workspaceId === "weixin_wuping").aclUsers.sort(), ["hermes-host", "hm-wuping"]);
assert.equal(JSON.stringify(requiredSkillRepair).includes("wd_live_"), false);

assert.deepEqual(openAiCodexManifestUsers(tempRoot), ["hm-owner", "hm-wuping"]);

const codexSharedAuthPlan = reconcileCodexSharedAuthPermissions({}, {
  root: tempRoot,
  execute: false,
});
assert.equal(codexSharedAuthPlan.length, 2);
assert.equal(codexSharedAuthPlan[0].type, "codex-shared-auth-document");
assert.equal(codexSharedAuthPlan[1].type, "codex-shared-auth-permissions");
assert.equal(codexSharedAuthPlan[1].action, "plan");
assert.equal(codexSharedAuthPlan[1].userCount, 2);
assert.equal(codexSharedAuthPlan[1].fileCount, 2);
assert.equal(JSON.stringify(codexSharedAuthPlan).includes("access_token"), false);

const missingAuthRoot = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "homeai-drift-missing-auth-"));
const operatorCodexHome = path.join(missingAuthRoot, "operator-codex-home");
const missingProfileDir = path.join(missingAuthRoot, "users", "hm-owner", "HermesWorkspace", ".hermes-gateway", "profiles", "hm-owner-openai-1");
fs.mkdirSync(operatorCodexHome, { recursive: true });
fs.mkdirSync(missingProfileDir, { recursive: true });
fs.mkdirSync(path.join(missingAuthRoot, "data"), { recursive: true });
fs.writeFileSync(path.join(operatorCodexHome, "auth.json"), JSON.stringify({
  auth_mode: "chatgpt",
  tokens: { access_token: "access-token", refresh_token: "refresh-token" },
}, null, 2));
fs.writeFileSync(path.join(missingAuthRoot, "data", "gateway-pool-manifest-mac.json"), JSON.stringify({
  workers: [{ provider: "openai-codex", osUser: "hm-owner" }],
}));
const missingSharedAuthRows = reconcileCodexSharedAuthPermissions({
  profileChecks: [{
    profile: "hm-owner-openai-1",
    provider: "openai-codex",
    osUser: "",
    profileDir: missingProfileDir,
  }],
}, {
  root: missingAuthRoot,
  execute: true,
  codexHomeCandidates: [operatorCodexHome],
  openAiCodexManifestUsers: () => [],
});
assert.equal(missingSharedAuthRows.find((row) => row.type === "codex-shared-auth-document").ok, true);
assert.equal(fs.existsSync(path.join(missingAuthRoot, "gateway-worker", "telemetry", "profiles", "shared-auth", "auth.json")), true);
assert.equal(fs.existsSync(path.join(missingAuthRoot, "gateway-worker", "telemetry", "profiles", "shared-auth", "auth.lock")), true);
assert.equal(fs.lstatSync(path.join(missingProfileDir, "auth.json")).isSymbolicLink(), true);
assert.equal(JSON.stringify(missingSharedAuthRows).includes("access-token"), false);

const musicCoverPlan = reconcileMusicRuntimeCoverPermissions({}, {
  root: tempRoot,
  execute: false,
});
assert.equal(musicCoverPlan.length, 1);
assert.equal(musicCoverPlan[0].type, "music-runtime-cover-permissions");
assert.equal(musicCoverPlan[0].action, "plan");
assert.equal(musicCoverPlan[0].directoryCount, 4);
assert.equal(JSON.stringify(musicCoverPlan).includes("image_base64"), false);

const filePluginAudit = {
  profileChecks: [{
    profile: "hm-owner-openai-1",
    osUser: "",
    profileDir,
    filePlugins: [
      { plugin: "hermes-mobile-docx", complete: false },
      { plugin: "hermes-mobile-pptx", complete: false },
      { plugin: "hermes-mobile-pdf", complete: false },
      { plugin: "hermes-mobile-audio", complete: false },
      { plugin: "hermes-mobile-archive", complete: false },
    ],
  }],
};
const filePluginPlan = reconcileGatewayProfileFilePlugins(filePluginAudit, {
  root: tempRoot,
  appPath: tempAppRoot,
});
assert.equal(filePluginPlan.length, 1);
assert.equal(filePluginPlan[0].pluginCount, 5);
assert.equal(filePluginPlan[0].action, "plan");
const filePluginSync = reconcileGatewayProfileFilePlugins(filePluginAudit, {
  root: tempRoot,
  appPath: tempAppRoot,
  execute: true,
});
assert.equal(filePluginSync[0].ok, true);
assert.equal(fs.existsSync(path.join(profileDir, "plugins", "hermes-mobile-pptx", "plugin.yaml")), true);
assert.match(fs.readFileSync(path.join(profileDir, "config.yaml"), "utf8"), /pptx_plugin_enabled:\s*true/);
assert.equal(JSON.stringify(filePluginSync).includes("access_token"), false);

(async () => {
  const calls = [];
  const savedStatuses = [];
  const rows = await reconcilePluginLocalBindings(auditWithPluginBindingDrift, {
    root: "/Users/example/path",
    execute: true,
    plugins: [
      { id: "growth", manifestUrl: "http://127.0.0.1:4881/api/v1/hermes/plugin/manifest" },
      { id: "moira", manifestUrl: "http://127.0.0.1:4174/api/v1/hermes/plugin/manifest" },
    ],
    growthProvisioningService: {
      provisionWorkspace(input) {
        calls.push({ pluginId: "growth", input });
        return Promise.resolve({ ok: true, keyCreated: true, configCreated: true, growthWorkspaceId: "growth:owner" });
      },
    },
    moiraProvisioningService: {
      provisionWorkspace(input) {
        calls.push({ pluginId: "moira", input });
        return Promise.resolve({ ok: true, keyCreated: false, configCreated: true });
      },
    },
    authorizationService: {
      updateProvisioningStatus(input) {
        savedStatuses.push(input);
        return { ok: true };
      },
    },
  });
  assert.equal(rows.length, 3);
  assert.equal(rows.find((row) => row.pluginId === "growth").ok, true);
  assert.equal(rows.find((row) => row.pluginId === "moira").ok, true);
  assert.equal(rows.find((row) => row.pluginId === "unknown").ok, false);
  assert.deepEqual(calls.map((call) => `${call.pluginId}:${call.input.workspaceId}`), ["growth:owner", "moira:weixin_wuping"]);
  assert.deepEqual(savedStatuses.map((item) => `${item.pluginId}:${item.workspaceId}:${item.provisioningStatus}`), [
    "growth:owner:active",
    "moira:weixin_wuping:active",
  ]);
  assert.equal(JSON.stringify(rows).includes("access-key-value"), false);

  const provisioningUpdates = [];
  const provisioningRows = await reconcilePluginProvisioningStatuses(auditWithPluginProvisioningStatusDrift, {
    execute: true,
    authorizationService: {
      updateProvisioningStatus(input) {
        provisioningUpdates.push(input);
        return { ok: true };
      },
    },
  });
  assert.equal(provisioningRows.length, 2);
  assert.equal(provisioningRows.find((row) => row.workspaceId === "weixin_test_1").ok, true);
  assert.equal(provisioningRows.find((row) => row.workspaceId === "weixin_missing").ok, false);
  assert.deepEqual(provisioningUpdates.map((item) => `${item.pluginId}:${item.workspaceId}:${item.provisioningStatus}`), [
    "wardrobe:weixin_test_1:active",
  ]);

  const report = await runReconcile({
    root: tempRoot,
    execute: false,
    appPath: tempAppRoot,
    launchDaemonsDir: path.join(tempRoot, "LaunchDaemons"),
    usersRoot: path.join(tempRoot, "Users"),
    buildAudit: () => ({ issues: [], installedGatewayChecks: [] }),
  });
  assert.equal(report.execute, false);
  assert.ok(report.rows.some((row) => row.type === "codex-shared-auth-permissions"));
  assert.ok(report.rows.some((row) => row.type === "music-runtime-cover-permissions"));

  console.log("macOS production drift reconcile tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
