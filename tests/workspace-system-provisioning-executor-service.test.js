"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  createWorkspaceSystemProvisioningExecutorService,
  safeLaunchdLabel,
  safeMacUser,
  safeProfile,
  safeWorkspaceId,
} = require("../adapters/workspace-system-provisioning-executor-service");

function posixTempRoot() {
  const dir = `/tmp/hm-workspace-executor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fakeRunFactory(calls, overrides = {}) {
  return function fakeRun(command, args = [], options = {}) {
    calls.push({ command, args, input: options.input || "" });
    const key = [command, ...args].join(" ");
    if (typeof overrides[key] === "function") return overrides[key](command, args, options);
    if (command === "/usr/bin/id") return { status: 1, stdout: "", stderr: "" };
    if (command === "/usr/bin/dscl" && args.includes("UniqueID")) {
      return { status: 0, stdout: "root 0\nalice 501\nbob 502\n", stderr: "" };
    }
    if (command === "/bin/launchctl" && args[0] === "print") return { status: 1, stdout: "", stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
}

function baseContext(root) {
  return {
    workspaceId: "xulu",
    macUser: "hm-xulu",
    paths: {
      liveRoot: root,
      dataRoot: `${root}/data`,
      driveRoot: `${root}/data/drive`,
      workspaceDataRoot: `${root}/data/drive/users/xulu`,
      workerHome: `${root}/users/hm-xulu`,
      workerWorkspaceRoot: `${root}/users/hm-xulu/HermesWorkspace`,
    },
    gateway: {
      manifestPath: `${root}/data/gateway-pool-manifest-mac.json`,
      profiles: ["lowgw31", "deepseekgw31"],
    },
  };
}

async function testValidationHelpersAndDisabledStates() {
  assert.equal(safeWorkspaceId("Xu Lu"), "");
  assert.equal(safeWorkspaceId("xulu"), "xulu");
  assert.equal(safeMacUser("hm-xulu"), "hm-xulu");
  assert.equal(safeMacUser("root"), "");
  assert.equal(safeProfile("lowgw31"), "lowgw31");
  assert.equal(safeLaunchdLabel("com.hermesmobile.gateway.hm-xulu.openai.1"), "com.hermesmobile.gateway.hm-xulu.openai.1");

  const disabled = createWorkspaceSystemProvisioningExecutorService({ platform: "darwin" });
  assert.deepEqual(await disabled.runStep("ensure_mac_user", { workspaceId: "xulu", macUser: "hm-xulu" }), {
    ok: false,
    error: "workspace_system_executor_disabled",
  });

  const nonDarwin = createWorkspaceSystemProvisioningExecutorService({ forceEnabled: true, platform: "win32" });
  assert.deepEqual(await nonDarwin.runStep("ensure_mac_user", { workspaceId: "xulu", macUser: "hm-xulu" }), {
    ok: false,
    error: "macos_system_executor_requires_darwin",
  });
  assert.equal((await nonDarwin.runStep("raw_shell", {})).error, "system_action_unavailable:raw_shell");
}

async function testEnsureMacUserCreatesHiddenAccount() {
  const calls = [];
  const service = createWorkspaceSystemProvisioningExecutorService({
    forceEnabled: true,
    platform: "darwin",
    run: fakeRunFactory(calls),
    useSudoWrites: false,
  });
  const result = await service.runStep("ensure_mac_user", {
    workspaceId: "xulu",
    macUser: "hm-xulu",
    paths: {
      workerHome: "/Users/hm-xulu",
      workerWorkspaceRoot: "/Users/hm-xulu/HermesWorkspace",
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.uid, 503);
  assert.ok(calls.some((call) => call.command === "/usr/bin/dscl" && call.args.includes("IsHidden")));
  assert.ok(calls.some((call) => call.command === "/usr/sbin/createhomedir"));
}

async function testEnsureLaunchdMaterializesWorkerFilesAndManifest() {
  const root = posixTempRoot();
  const calls = [];
  try {
    const context = baseContext(root);
    writeJson(context.gateway.manifestPath, {
      enabled: true,
      workers: [
        {
          profile: "lowgw31",
          provider: "openai-codex",
          port: 18781,
          enabled: true,
          allowedWorkspaceIds: ["xulu"],
          skillWorkspaceIds: ["xulu"],
          apiKeyFile: `${root}/data/secrets/lowgw31.secret`,
          launchdLabel: "com.hermesmobile.gateway.hm-old.openai.1",
          telemetryStateDbPath: "/Users/hm-old/HermesWorkspace/.hermes-gateway/profiles/lowgw31/state.db",
        },
        {
          profile: "deepseekgw31",
          provider: "deepseek",
          port: 18782,
          enabled: true,
          allowedWorkspaceIds: ["xulu"],
          skillWorkspaceIds: ["xulu"],
          apiKeyFile: `${root}/data/secrets/deepseekgw31.secret`,
        },
      ],
    });
    fs.mkdirSync(`${root}/data/secrets/gateway-workers`, { recursive: true });
    fs.writeFileSync(`${root}/data/secrets/lowgw31.secret`, "gateway-key\n", "utf8");
    fs.writeFileSync(`${root}/data/secrets/deepseekgw31.secret`, "gateway-key\n", "utf8");
    fs.writeFileSync(`${root}/data/secrets/deepseek-api-key.secret`, "provider-key\n", "utf8");
    const service = createWorkspaceSystemProvisioningExecutorService({
      forceEnabled: true,
      fs,
      launchDaemonsDir: `${root}/LaunchDaemons`,
      liveRoot: root,
      path,
      platform: "darwin",
      run: fakeRunFactory(calls),
      useSudoWrites: false,
    });
    const result = await service.runStep("ensure_launchd_services", context);

    assert.equal(result.ok, true);
    assert.equal(result.workers.length, 2);
    const manifest = JSON.parse(fs.readFileSync(context.gateway.manifestPath, "utf8"));
    assert.equal(manifest.workers[0].osUser, "hm-xulu");
    assert.equal(manifest.workers[0].launchdLabel, "com.hermesmobile.gateway.hm-xulu.openai.1");
    assert.equal(manifest.workers[0].telemetryStateDbPath, `${root}/users/hm-xulu/HermesWorkspace/.hermes-gateway/profiles/lowgw31/state.db`);
    assert.equal(manifest.workers[1].launchdLabel, "com.hermesmobile.gateway.hm-xulu.deepseek.1");
    assert.ok(manifest.workers[0].telemetryStateDbPath.endsWith("/profiles/lowgw31/state.db"));

    const plist = fs.readFileSync(`${root}/LaunchDaemons/com.hermesmobile.gateway.hm-xulu.openai.1.plist`, "utf8");
    assert.match(plist, /<key>UserName<\/key><string>hm-xulu<\/string>/);
    assert.match(plist, /<key>RunAtLoad<\/key><false\/>/);
    assert.match(plist, /<key>KeepAlive<\/key><false\/>/);

    const startScript = fs.readFileSync(`${root}/users/hm-xulu/HermesWorkspace/.hermes-gateway/start-lowgw31.sh`, "utf8");
    assert.match(startScript, /HERMES_MOBILE_DOCX_ALLOWED_ROOTS/);
    assert.match(startScript, /HERMES_MOBILE_HTTP_CREDENTIAL_ROOTS/);
    assert.match(startScript, /HERMES_MOBILE_HTTP_SAVE_ROOT/);
    assert.match(startScript, /HERMES_MOBILE_VIDEO_OUTPUT_ROOT/);
    assert.match(startScript, /\$\{ROOT\}\/data\/drive|\$ROOT\/data\/drive/);
    assert.match(startScript, /API_SERVER_KEY/);
    assert.doesNotMatch(startScript, /RUNTIME_HERMES/);
    assert.match(startScript, /\$RUNTIME_PYTHON" -m hermes_cli\.main gateway run --replace --accept-hooks/);
    assert.ok(calls.some((call) => call.command === "/bin/chmod" && call.args.includes("+a") && call.args.includes("user:hm-xulu allow read,readattr,readextattr,readsecurity") && call.args.includes(context.gateway.manifestPath)));
    assert.ok(calls.some((call) => call.command === "/bin/chmod" && call.args.includes("+a") && call.args.includes("user:hm-xulu allow read,readattr,readextattr,readsecurity") && call.args.includes(`${root}/data/secrets/lowgw31.secret`)));
    assert.ok(calls.some((call) => call.command === "/bin/chmod" && call.args.includes("+a") && call.args.includes("user:hm-xulu allow read,readattr,readextattr,readsecurity") && call.args.includes(`${root}/data/secrets/deepseek-api-key.secret`)));

    const config = fs.readFileSync(`${root}/users/hm-xulu/HermesWorkspace/.hermes-gateway/profiles/lowgw31/config.yaml`, "utf8");
    assert.match(config, /provider: openai-codex/);
    assert.match(config, /port: 18781/);
    assert.ok(calls.some((call) => call.command === "/bin/launchctl" && call.args[0] === "bootstrap"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testEnsureLaunchdSyncsHealthBindingAndRendersMcpConfig() {
  const root = posixTempRoot();
  const calls = [];
  try {
    const context = baseContext(root);
    writeJson(context.gateway.manifestPath, {
      enabled: true,
      workers: [{
        profile: "lowgw31",
        provider: "openai-codex",
        port: 18781,
        enabled: true,
        allowedWorkspaceIds: ["xulu"],
        skillWorkspaceIds: ["xulu"],
        apiKeyFile: `${root}/data/secrets/lowgw31.secret`,
      }],
    });
    fs.mkdirSync(`${root}/data/drive/users/xulu/.hermes-health`, { recursive: true });
    fs.writeFileSync(`${root}/data/drive/users/xulu/.hermes-health/access-key.txt`, "health-key\n", "utf8");
    fs.writeFileSync(`${root}/data/drive/users/xulu/.hermes-health/config.json`, "{\"workspace_id\":\"health:xulu\"}\n", "utf8");
    fs.mkdirSync(`${root}/data/drive/users/xulu/.hermes-growth`, { recursive: true });
    fs.writeFileSync(`${root}/data/drive/users/xulu/.hermes-growth/access-key.txt`, "growth-key\n", "utf8");
    fs.writeFileSync(`${root}/data/drive/users/xulu/.hermes-growth/config.json`, "{\"workspace_id\":\"growth:xulu\"}\n", "utf8");
    fs.mkdirSync(`${root}/gateway-worker/health-mcp/scripts`, { recursive: true });
    fs.writeFileSync(`${root}/gateway-worker/health-mcp/scripts/mcp-health-wrapper.js`, "module.exports = {};\n", "utf8");
    fs.mkdirSync(`${root}/plugins/growth/scripts`, { recursive: true });
    fs.writeFileSync(`${root}/plugins/growth/scripts/growth-mcp-wrapper.js`, "module.exports = {};\n", "utf8");
    fs.mkdirSync(`${root}/plugins/growth/src/mcp`, { recursive: true });
    fs.writeFileSync(`${root}/plugins/growth/src/mcp/growth-mcp-schemas.js`, "module.exports = {};\n", "utf8");
    const service = createWorkspaceSystemProvisioningExecutorService({
      forceEnabled: true,
      fs,
      launchDaemonsDir: `${root}/LaunchDaemons`,
      liveRoot: root,
      path,
      platform: "darwin",
      run: fakeRunFactory(calls),
      useSudoWrites: false,
    });
    const result = await service.runStep("ensure_launchd_services", context);

    assert.equal(result.ok, true);
    assert.deepEqual(result.syncedGatewayMcpAssets, ["growth"]);
    assert.deepEqual(result.syncedPluginBindings, ["health", "growth"]);
    assert.equal(fs.existsSync(`${root}/users/hm-xulu/HermesWorkspace/.hermes-health/access-key.txt`), true);
    assert.equal(fs.existsSync(`${root}/users/hm-xulu/HermesWorkspace/.hermes-health/config.json`), true);
    assert.equal(fs.existsSync(`${root}/users/hm-xulu/HermesWorkspace/.hermes-growth/access-key.txt`), true);
    assert.equal(fs.existsSync(`${root}/users/hm-xulu/HermesWorkspace/.hermes-growth/config.json`), true);
    assert.equal(fs.existsSync(`${root}/gateway-worker/growth-mcp/scripts/growth-mcp-wrapper.js`), true);
    assert.equal(fs.existsSync(`${root}/gateway-worker/growth-mcp/src/mcp/growth-mcp-schemas.js`), true);
    const config = fs.readFileSync(`${root}/users/hm-xulu/HermesWorkspace/.hermes-gateway/profiles/lowgw31/config.yaml`, "utf8");
    assert.match(config, /  - health/);
    assert.match(config, /  - growth/);
    assert.match(config, /mcp_servers:\n[\s\S]*  health:/);
    assert.match(config, /mcp_servers:\n[\s\S]*  growth:/);
    assert.match(config, new RegExp(`${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\/gateway-worker\\/health-mcp\\/scripts\\/mcp-health-wrapper\\.js`));
    assert.match(config, new RegExp(`${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\/gateway-worker\\/growth-mcp\\/scripts\\/growth-mcp-wrapper\\.js`));
    assert.match(config, /--workspace\n\s+- .*HermesWorkspace/);
    const updatedManifest = JSON.parse(fs.readFileSync(context.gateway.manifestPath, "utf8"));
    assert.ok(updatedManifest.workers[0].toolsets.includes("web"));
    assert.ok(updatedManifest.workers[0].toolsets.includes("health"));
    assert.ok(updatedManifest.workers[0].toolsets.includes("growth"));
    assert.deepEqual(updatedManifest.workers[0].mcpServers.slice().sort(), ["growth", "health"]);
    assert.equal(updatedManifest.workers[0].configPath, `${root}/users/hm-xulu/HermesWorkspace/.hermes-gateway/profiles/lowgw31/config.yaml`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testEnsureLaunchdKickstartsWorkersWhenRequested() {
  const root = posixTempRoot();
  const calls = [];
  try {
    const context = Object.assign(baseContext(root), {
      gateway: Object.assign({}, baseContext(root).gateway, {
        kickstart: true,
        profiles: ["lowgw31"],
      }),
    });
    writeJson(context.gateway.manifestPath, {
      enabled: true,
      workers: [{
        profile: "lowgw31",
        provider: "openai-codex",
        port: 18781,
        enabled: true,
        allowedWorkspaceIds: ["xulu"],
        skillWorkspaceIds: ["xulu"],
        apiKeyFile: `${root}/data/secrets/lowgw31.secret`,
      }],
    });
    const service = createWorkspaceSystemProvisioningExecutorService({
      forceEnabled: true,
      fs,
      launchDaemonsDir: `${root}/LaunchDaemons`,
      liveRoot: root,
      path,
      platform: "darwin",
      run: fakeRunFactory(calls, {
        "/bin/launchctl print system/com.hermesmobile.gateway.hm-xulu.openai.1": () => ({ status: 0, stdout: "", stderr: "" }),
      }),
      useSudoWrites: false,
    });
    const result = await service.runStep("ensure_launchd_services", context);

    assert.equal(result.ok, true);
    assert.deepEqual(result.kickstarted, [{
      profile: "lowgw31",
      label: "com.hermesmobile.gateway.hm-xulu.openai.1",
    }]);
    assert.ok(calls.some((call) => (
      call.command === "/bin/launchctl"
      && call.args[0] === "kickstart"
      && call.args[1] === "-k"
      && call.args[2] === "system/com.hermesmobile.gateway.hm-xulu.openai.1"
    )));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testRepairWorkspaceAclSkipsSystemUsersRoot() {
  const root = "/Users/hermes-host/HermesMobile";
  const calls = [];
  const service = createWorkspaceSystemProvisioningExecutorService({
    forceEnabled: true,
    liveRoot: root,
    platform: "darwin",
    run: fakeRunFactory(calls),
    useSudoWrites: false,
  });

  const result = await service.runStep("repair_workspace_acl", {
    workspaceId: "xulu",
    macUser: "hm-xulu",
    paths: {
      liveRoot: root,
      dataRoot: `${root}/data`,
      driveRoot: `${root}/data/drive`,
      workspaceDataRoot: `${root}/data/drive/users/xulu`,
      workerHome: "/Users/hm-xulu",
      workerWorkspaceRoot: "/Users/hm-xulu/HermesWorkspace",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.some((call) => call.command === "/bin/chmod" && call.args.includes("/Users")), false);
  assert.equal(calls.some((call) => call.command === "/bin/chmod" && call.args.includes("/Users/hermes-host")), true);
  assert.equal(calls.some((call) => call.command === "/bin/chmod" && call.args.includes(`${root}/data/skill-profiles/xulu`)), true);
  assert.equal(calls.some((call) => call.command === "/bin/chmod" && call.args.includes(`${root}/data/skill-profiles`)), true);
}

async function testRunSmokesIncludesPluginsAndToolsetGate() {
  const root = "/tmp/hm-workspace-executor-smoke";
  const calls = [];
  const profileAuditStdout = JSON.stringify({
    ok: true,
    issues: [],
    warnings: [],
    byWorkspace: {
      xulu: {
        workers: [{ profile: "lowgw31" }],
      },
    },
  });
  const service = createWorkspaceSystemProvisioningExecutorService({
    forceEnabled: true,
    liveRoot: root,
    platform: "darwin",
    run: fakeRunFactory(calls, {
      [`${root}/runtime/node-current/bin/node ${root}/app/scripts/macos-production-profile-audit.js --root ${root} --expected-workspaces xulu --json --no-strict --expected-plugins wardrobe,note --required-workspace-plugins xulu:wardrobe,note`]: () => ({ status: 0, stdout: profileAuditStdout, stderr: "" }),
      [`${root}/runtime/node-current/bin/node ${root}/app/scripts/macos-gateway-manifest-toolset-smoke.js --root ${root} --json`]: () => ({ status: 0, stdout: "{\"ok\":true}", stderr: "" }),
      [`${root}/runtime/node-current/bin/node ${root}/app/scripts/macos-worker-filesystem-access-harness.js --root ${root} --json`]: () => ({ status: 0, stdout: "{\"ok\":true}", stderr: "" }),
    }),
  });

  const result = await service.runStep("run_workspace_onboarding_smokes", Object.assign(baseContext(root), {
    pluginIds: ["wardrobe", "note"],
  }));

  assert.equal(result.ok, true);
  assert.ok(calls.some((call) => call.args.includes("--expected-plugins") && call.args.includes("wardrobe,note")));
  assert.ok(calls.some((call) => call.args.includes("--no-strict")));
  assert.ok(calls.some((call) => call.args.includes("--required-workspace-plugins") && call.args.includes("xulu:wardrobe,note")));
  assert.ok(calls.some((call) => call.args[0].endsWith("macos-gateway-manifest-toolset-smoke.js")));
}

async function testRunSmokesIgnoresUnrelatedProfileAuditIssues() {
  const root = "/tmp/hm-workspace-executor-smoke";
  const calls = [];
  const profileAuditStdout = JSON.stringify({
    ok: false,
    issues: [
      "plugin_local_binding_incomplete:legacy:email",
    ],
    warnings: [
      "skill_root_empty:xulu",
      "telemetry_state_db_missing:legacygw1",
    ],
    byWorkspace: {
      xulu: {
        workers: [{ profile: "lowgw31" }],
      },
    },
  });
  const service = createWorkspaceSystemProvisioningExecutorService({
    forceEnabled: true,
    liveRoot: root,
    platform: "darwin",
    run: fakeRunFactory(calls, {
      [`${root}/runtime/node-current/bin/node ${root}/app/scripts/macos-production-profile-audit.js --root ${root} --expected-workspaces xulu --json --no-strict --expected-plugins wardrobe,note --required-workspace-plugins xulu:wardrobe,note`]: () => ({ status: 0, stdout: profileAuditStdout, stderr: "" }),
      [`${root}/runtime/node-current/bin/node ${root}/app/scripts/macos-gateway-manifest-toolset-smoke.js --root ${root} --json`]: () => ({ status: 0, stdout: "{\"ok\":true}", stderr: "" }),
      [`${root}/runtime/node-current/bin/node ${root}/app/scripts/macos-worker-filesystem-access-harness.js --root ${root} --json`]: () => ({ status: 0, stdout: "{\"ok\":true}", stderr: "" }),
    }),
  });

  const result = await service.runStep("run_workspace_onboarding_smokes", Object.assign(baseContext(root), {
    pluginIds: ["wardrobe", "note"],
  }));

  assert.equal(result.ok, true);
  assert.equal(result.profileAudit.auditOk, false);
  assert.deepEqual(result.profileAudit.targetIssues, []);
  assert.deepEqual(result.profileAudit.targetWarnings, ["skill_root_empty:xulu"]);
  assert.equal(result.profileAudit.ignoredIssueCount, 1);
}

async function testRunSmokesFailsForTargetProfileAuditIssues() {
  const root = "/tmp/hm-workspace-executor-smoke";
  const calls = [];
  const profileAuditStdout = JSON.stringify({
    ok: false,
    issues: [
      "access_key_missing:xulu",
      "plugin_local_binding_incomplete:legacy:email",
    ],
    warnings: [],
    byWorkspace: {
      xulu: {
        workers: [{ profile: "lowgw31" }],
      },
    },
  });
  const service = createWorkspaceSystemProvisioningExecutorService({
    forceEnabled: true,
    liveRoot: root,
    platform: "darwin",
    run: fakeRunFactory(calls, {
      [`${root}/runtime/node-current/bin/node ${root}/app/scripts/macos-production-profile-audit.js --root ${root} --expected-workspaces xulu --json --no-strict --expected-plugins wardrobe,note --required-workspace-plugins xulu:wardrobe,note`]: () => ({ status: 0, stdout: profileAuditStdout, stderr: "" }),
    }),
  });

  const result = await service.runStep("run_workspace_onboarding_smokes", Object.assign(baseContext(root), {
    pluginIds: ["wardrobe", "note"],
  }));

  assert.equal(result.ok, false);
  assert.equal(result.error, "profile_audit_failed");
  assert.deepEqual(result.profileAudit.targetIssues, ["access_key_missing:xulu"]);
  assert.equal(calls.some((call) => call.args[0]?.endsWith("macos-gateway-manifest-toolset-smoke.js")), false);
}

async function run() {
  await testValidationHelpersAndDisabledStates();
  await testEnsureMacUserCreatesHiddenAccount();
  await testEnsureLaunchdMaterializesWorkerFilesAndManifest();
  await testEnsureLaunchdSyncsHealthBindingAndRendersMcpConfig();
  await testEnsureLaunchdKickstartsWorkersWhenRequested();
  await testRepairWorkspaceAclSkipsSystemUsersRoot();
  await testRunSmokesIncludesPluginsAndToolsetGate();
  await testRunSmokesIgnoresUnrelatedProfileAuditIssues();
  await testRunSmokesFailsForTargetProfileAuditIssues();
  console.log("workspace system provisioning executor service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
