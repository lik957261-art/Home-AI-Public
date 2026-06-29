"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const SCRIPT = path.join(REPO_ROOT, "scripts", "install-macos-production.sh");

function run(args = []) {
  return execFileSync("bash", [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
}

function runWithEnv(args = [], env = {}) {
  return execFileSync("bash", [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function writeGatewayDocumentPluginFixtures(root) {
  for (const pluginName of [
    "hermes-mobile-docx",
    "hermes-mobile-pptx",
    "hermes-mobile-pdf",
    "hermes-mobile-audio",
    "hermes-mobile-archive",
  ]) {
    const dir = path.join(root, "app", "gateway-plugins", pluginName);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "plugin.yaml"), `name: ${pluginName}\n`, "utf8");
    fs.writeFileSync(path.join(dir, "__init__.py"), "# fixture\n", "utf8");
  }
}

function testScriptExistsAndIsSafeByDefault() {
  const source = fs.readFileSync(SCRIPT, "utf8");
  assert.match(source, /MODE="dry-run"/);
  assert.match(source, /public-install-preflight\.js/);
  assert.match(source, /execute_not_enabled/);
  assert.doesNotMatch(source, /launchctl bootstrap/);
}

function testDryRunJsonPlan() {
  const output = run(["--json"]);
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.mode, "dry-run");
  assert.equal(parsed.preflightOk, true);
  assert.equal(parsed.phaseCount, 19);
  assert.deepEqual(parsed.phases.map((phase) => phase.id), [
    "system-preflight",
    "install-dependencies",
    "create-service-users",
    "create-directory-layout",
    "install-hermes-mobile",
    "install-official-hermes-runtime",
    "configure-owner",
    "configure-workspace-isolation",
    "configure-gateway-profiles",
    "install-gateway-launchd-services",
    "repair-gateway-worker-acl",
    "configure-cron",
    "configure-plugins",
    "install-plugin-dependencies",
    "plan-plugin-workspace-provisioning",
    "install-launchd-services",
    "run-first-start-preflight",
    "run-smoke-tests",
    "print-access-info",
  ]);
  const firstStart = parsed.phases.find((phase) => phase.id === "run-first-start-preflight");
  assert.match(firstStart.command, /macos-first-start-preflight\.js/);
  assert.match(firstStart.command, /--network-mode <direct\|proxy>/);
  assert.match(firstStart.command, /--base http:\/\/127\.0\.0\.1:8797/);
  const smokeTests = parsed.phases.find((phase) => phase.id === "run-smoke-tests");
  assert.match(smokeTests.command, /macos-production-closure-validation\.js/);
  assert.match(smokeTests.command, /--root/);
  assert.match(smokeTests.command, /--base http:\/\/127\.0\.0\.1:8797/);
  assert.match(smokeTests.command, /--json/);
  const deps = parsed.phases.find((phase) => phase.id === "install-dependencies");
  assert.match(deps.command, /--phase install-dependencies/);
  assert.match(deps.command, /--npm-command/);
  const serviceUsers = parsed.phases.find((phase) => phase.id === "create-service-users");
  assert.match(serviceUsers.command, /--phase create-service-users/);
  assert.match(serviceUsers.command, /--service-users/);
  assert.match(serviceUsers.command, /HOMEAI_INSTALL_ALLOW_USER_CREATE=1/);
  const owner = parsed.phases.find((phase) => phase.id === "configure-owner");
  assert.match(owner.command, /--phase configure-owner/);
  assert.match(owner.command, /--owner-key-file/);
  const isolation = parsed.phases.find((phase) => phase.id === "configure-workspace-isolation");
  assert.match(isolation.command, /--phase configure-workspace-isolation/);
  assert.match(isolation.command, /--workspace-map/);
  assert.match(isolation.command, /HOMEAI_INSTALL_APPLY_WORKSPACE_ACL=1/);
  const gateway = parsed.phases.find((phase) => phase.id === "configure-gateway-profiles");
  assert.match(gateway.command, /--phase configure-gateway-profiles/);
  assert.match(gateway.command, /--gateway-openai-workers/);
  assert.match(gateway.command, /--gateway-deepseek-workers/);
  assert.match(gateway.command, /--gateway-owner-grok-workers/);
  assert.match(gateway.command, /--gateway-owner-maintenance-openai-workers/);
  assert.match(gateway.command, /--gateway-owner-maintenance-deepseek-workers/);
  const gatewayLaunchd = parsed.phases.find((phase) => phase.id === "install-gateway-launchd-services");
  assert.match(gatewayLaunchd.command, /--phase install-gateway-launchd-services/);
  assert.match(gatewayLaunchd.command, /HOMEAI_INSTALL_LAUNCHD_APPLY=1/);
  const gatewayAcl = parsed.phases.find((phase) => phase.id === "repair-gateway-worker-acl");
  assert.match(gatewayAcl.command, /--phase repair-gateway-worker-acl/);
  assert.match(gatewayAcl.command, /HOMEAI_INSTALL_APPLY_WORKSPACE_ACL=1/);
  const cron = parsed.phases.find((phase) => phase.id === "configure-cron");
  assert.match(cron.command, /--phase configure-cron/);
  assert.match(cron.command, /--cron-network-mode direct/);
  const plugins = parsed.phases.find((phase) => phase.id === "configure-plugins");
  assert.match(plugins.command, /--phase configure-plugins/);
  assert.match(plugins.command, /--plugin-source-mode plan/);
  const pluginDependencies = parsed.phases.find((phase) => phase.id === "install-plugin-dependencies");
  assert.match(pluginDependencies.command, /--phase install-plugin-dependencies/);
  assert.match(pluginDependencies.command, /--npm-command/);
  const pluginProvisioning = parsed.phases.find((phase) => phase.id === "plan-plugin-workspace-provisioning");
  assert.match(pluginProvisioning.command, /--phase plan-plugin-workspace-provisioning/);
  assert.match(pluginProvisioning.command, /--workspace-map/);
  const launchd = parsed.phases.find((phase) => phase.id === "install-launchd-services");
  assert.match(launchd.command, /--phase install-launchd-services/);
  assert.match(launchd.command, /HOMEAI_INSTALL_LAUNCHD_APPLY=1/);
  const directoryLayout = parsed.phases.find((phase) => phase.id === "create-directory-layout");
  assert.match(directoryLayout.command, /--phase create-directory-layout/);
  const installApp = parsed.phases.find((phase) => phase.id === "install-hermes-mobile");
  assert.match(installApp.command, /--phase install-hermes-mobile/);
  assert.match(installApp.command, /--app-source/);
  const runtime = parsed.phases.find((phase) => phase.id === "install-official-hermes-runtime");
  assert.match(runtime.command, /--phase install-official-hermes-runtime/);
  assert.match(runtime.command, /--node-command/);
  assert.match(runtime.command, /--python-command/);
  assert.match(runtime.command, /--hermes-agent-repository-url/);
  assert.match(runtime.command, /hermes-agent-public\.git/);
  const accessInfo = parsed.phases.find((phase) => phase.id === "print-access-info");
  assert.match(accessInfo.command, /--phase print-access-info/);
  assert.match(accessInfo.command, /--base http:\/\/127\.0\.0\.1:8797/);
}

function testGuidedDryRunJsonPlan() {
  const output = run(["--guided", "--json"]);
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.mode, "dry-run");
  assert.equal(parsed.guided, true);
  assert.deepEqual(parsed.guidedPlan.autoPhaseIds, [
    "create-directory-layout",
    "install-hermes-mobile",
    "install-official-hermes-runtime",
    "install-dependencies",
    "configure-owner",
    "configure-gateway-profiles",
    "install-gateway-launchd-services",
    "configure-cron",
    "configure-plugins",
    "install-plugin-dependencies",
    "plan-plugin-workspace-provisioning",
    "install-launchd-services",
    "print-access-info",
  ]);
  assert.deepEqual(parsed.guidedPlan.operatorPhaseIds, [
    "create-service-users",
    "configure-workspace-isolation",
    "repair-gateway-worker-acl",
    "run-first-start-preflight",
    "run-smoke-tests",
  ]);
  assert.deepEqual(parsed.guidedPlan.operatorSteps.map((step) => step.id), parsed.guidedPlan.operatorPhaseIds);
  const serviceUsersStep = parsed.guidedPlan.operatorSteps.find((step) => step.id === "create-service-users");
  assert.equal(serviceUsersStep.requiresSudo, true);
  assert.equal(serviceUsersStep.gate, "HOMEAI_INSTALL_ALLOW_USER_CREATE=1");
  assert.ok(serviceUsersStep.commands.some((command) => command.startsWith("sudo HOMEAI_INSTALL_ALLOW_USER_CREATE=1")));
  assert.ok(serviceUsersStep.evidenceRequired.includes("all required macOS service users exist"));
  const workspaceAclStep = parsed.guidedPlan.operatorSteps.find((step) => step.id === "configure-workspace-isolation");
  assert.equal(workspaceAclStep.requiresSudo, true);
  assert.equal(workspaceAclStep.gate, "HOMEAI_INSTALL_APPLY_WORKSPACE_ACL=1");
  assert.ok(workspaceAclStep.commands.some((command) => command.includes("--workspace-map")));
  const firstStartStep = parsed.guidedPlan.operatorSteps.find((step) => step.id === "run-first-start-preflight");
  assert.equal(firstStartStep.requiresSudo, false);
  assert.ok(firstStartStep.commands.some((command) => command.includes("--network-mode direct")));
  assert.equal(parsed.guidedPlan.executedCount, 0);
  assert.equal(parsed.guidedPlan.failedPhase, "");
  assert.deepEqual(parsed.guidedPlan.reports, []);
  assert.equal(parsed.phases.find((phase) => phase.id === "configure-owner").status, "guided-auto");
  assert.equal(parsed.phases.find((phase) => phase.id === "create-service-users").status, "operator-required");
}

function testGuidedExecuteRunsAutomaticPhasesOnly() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-guided-"));
  const fakePython = makeFakePython();
  const agentSource = makeFakeAgentSource();
  const fakeNpm = path.join(root, "fake-npm");
  fs.writeFileSync(fakeNpm, `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "10.0.0"
  exit 0
fi
if [ "$1" = "ci" ]; then
  mkdir -p node_modules/@homeai-guided
  echo "installed"
  exit 0
fi
echo "unexpected npm args: $*" >&2
exit 64
`, { mode: 0o755 });
  try {
    const output = run([
      "--execute",
      "--guided",
      "--root",
      root,
      "--npm-command",
      fakeNpm,
      "--python-command",
      fakePython,
      "--hermes-agent-source",
      agentSource,
      "--install-hermes-agent-dependencies",
      "0",
      "--json",
    ]);
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
    assert.equal(parsed.mode, "execute");
    assert.equal(parsed.guided, true);
    assert.equal(parsed.execution.phase, "guided");
    assert.equal(parsed.execution.ok, true);
    assert.equal(parsed.guidedPlan.executedCount, parsed.guidedPlan.autoPhaseIds.length);
    assert.deepEqual(parsed.guidedPlan.operatorSteps.map((step) => step.id), parsed.guidedPlan.operatorPhaseIds);
    assert.equal(parsed.guidedPlan.failedPhase, "");
    assert.equal(parsed.guidedPlan.reports.length, parsed.guidedPlan.autoPhaseIds.length);
    assert.deepEqual(parsed.guidedPlan.reports.map((report) => report.phase), parsed.guidedPlan.autoPhaseIds);
    assert.deepEqual(
      parsed.phases.filter((phase) => phase.status === "executed").map((phase) => phase.id).sort(),
      [...parsed.guidedPlan.autoPhaseIds].sort(),
    );
    assert.deepEqual(
      parsed.phases.filter((phase) => phase.status === "operator-required").map((phase) => phase.id).sort(),
      [...parsed.guidedPlan.operatorPhaseIds].sort(),
    );
    assert.ok(fs.existsSync(path.join(root, "data", "secrets", "owner-web-key.secret")));
    assert.ok(fs.existsSync(path.join(root, "app", "package.json")));
    assert.ok(fs.existsSync(path.join(root, "runtime", "node-current", "bin", "node")));
    assert.ok(fs.existsSync(path.join(root, "runtime", "hermes-agent-official", "venv", "bin", "python")));
    assert.ok(fs.existsSync(path.join(root, "app", "node_modules", "@homeai-guided")));
    assert.ok(fs.existsSync(path.join(root, "data", "gateway-pool-manifest-mac.json")));
    assert.ok(fs.existsSync(path.join(root, "data", "launchd-services-plan.json")));
    assert.doesNotMatch(JSON.stringify(parsed), /owner-key\n|secret-value/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testExecuteFailsClosed() {
  const result = spawnSync("bash", [SCRIPT, "--execute", "--json"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.issues.some((issue) => issue.code === "execute_phase_required"));
}

function makeFirstStartRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-first-start-"));
  fs.mkdirSync(path.join(root, "app", "scripts"), { recursive: true });
  fs.mkdirSync(path.join(root, "runtime", "node-current", "bin"), { recursive: true });
  fs.mkdirSync(path.join(root, "data", "secrets"), { recursive: true });
  fs.mkdirSync(path.join(root, "data", "hermes-home", "scripts"), { recursive: true });
  fs.mkdirSync(path.join(root, "data", "production-drift-audit"), { recursive: true });
  fs.mkdirSync(path.join(root, "launchd"), { recursive: true });
  fs.writeFileSync(path.join(root, "runtime", "node-current", "bin", "node"), "#!/bin/sh\n", { mode: 0o755 });
  fs.writeFileSync(path.join(root, "data", "gateway-pool-manifest-mac.json"), "{\"workers\":[]}\n");
  fs.writeFileSync(path.join(root, "data", "secrets", "owner-web-key.secret"), "owner-key\n", { mode: 0o600 });
  fs.writeFileSync(path.join(root, "data", "plugin-workspace-provisioning-plan.json"), JSON.stringify({
    schemaVersion: 1,
    generatedBy: "install-macos-production plan-plugin-workspace-provisioning",
    defaultBusinessPluginIds: ["email", "finance", "growth", "health", "note", "wardrobe"],
    excludedSpecialPluginIds: ["codex-mobile-web", "music"],
    createsPluginKeys: false,
    createsWorkspaceGrants: false,
    callsPluginBindEndpoints: false,
    workspaces: [
      {
        workspaceId: "owner",
        macUser: "hm-owner",
        plugins: ["email", "finance", "growth", "health", "note", "wardrobe"].map((pluginId) => ({
          pluginId,
          currentStatus: "pending",
        })),
      },
    ],
  }, null, 2));
  fs.writeFileSync(path.join(root, "app", "scripts", "macos-production-drift-reconcile.js"), "\"use strict\";\n");
  fs.writeFileSync(path.join(root, "app", "scripts", "homeai-production-drift-audit-watchdog.sh"), "#!/usr/bin/env bash\n");
  fs.writeFileSync(
    path.join(root, "data", "hermes-home", "scripts", "homeai-production-drift-audit-watchdog.sh"),
    "#!/usr/bin/env bash\n",
    { mode: 0o755 },
  );
  fs.writeFileSync(path.join(root, "launchd", "com.hermesmobile.production-drift-audit.plist"), [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
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
  return root;
}

function makeFakeDscl(existingUsers = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-dscl-"));
  const stateDir = path.join(dir, "state");
  fs.mkdirSync(stateDir, { recursive: true });
  for (const user of existingUsers) {
    fs.writeFileSync(path.join(stateDir, user), `UniqueID: 550\nPrimaryGroupID: 20\nUserShell: /usr/bin/false\nNFSHomeDirectory: /Users/${user}\n`);
  }
  const dsclPath = path.join(dir, "dscl");
  fs.writeFileSync(dsclPath, `#!/bin/sh
STATE=${JSON.stringify(stateDir)}
if [ "$1" = "." ] && [ "$2" = "-read" ]; then
  user=$(basename "$3")
  if [ -f "$STATE/$user" ]; then
    cat "$STATE/$user"
    exit 0
  fi
  echo "No such key: $3" >&2
  exit 185
fi
if [ "$1" = "." ] && [ "$2" = "-list" ]; then
  for file in "$STATE"/*; do
    [ -f "$file" ] || continue
    user=$(basename "$file")
    uid=$(awk '/UniqueID:/ {print $2; exit}' "$file")
    echo "$user $uid"
  done
  exit 0
fi
if [ "$1" = "." ] && [ "$2" = "-create" ]; then
  user=$(basename "$3")
  touch "$STATE/$user"
  if [ -n "$4" ] && [ -n "$5" ]; then
    printf '%s: %s\\n' "$4" "$5" >> "$STATE/$user"
  fi
  exit 0
fi
if [ "$1" = "." ] && [ "$2" = "-passwd" ]; then
  exit 0
fi
echo "unsupported dscl call: $*" >&2
exit 64
`, { mode: 0o755 });
  return { dir, dsclPath };
}

function testExecuteServiceUserPhasePassesWithExistingUsers() {
  const fake = makeFakeDscl(["hermes-host", "hm-owner"]);
  const parsed = JSON.parse(runWithEnv([
    "--execute",
    "--phase",
    "create-service-users",
    "--service-users",
    "hermes-host,hm-owner",
    "--json",
  ], {
    PATH: `${fake.dir}:${process.env.PATH}`,
  }));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.execution.phase, "create-service-users");
  assert.equal(parsed.execution.ok, true);
  assert.equal(parsed.execution.report.ok, true);
  assert.equal(parsed.execution.report.createdCount, 0);
  assert.deepEqual(parsed.execution.report.actions.map((item) => item.action), ["exists", "exists"]);
  const phase = parsed.phases.find((item) => item.id === "create-service-users");
  assert.equal(phase.status, "executed");
}

function testExecuteServiceUserPhaseFailsClosedForMissingUsers() {
  const fake = makeFakeDscl(["hermes-host"]);
  const result = spawnSync("bash", [
    SCRIPT,
    "--execute",
    "--phase",
    "create-service-users",
    "--service-users",
    "hermes-host,hm-owner",
    "--json",
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, PATH: `${fake.dir}:${process.env.PATH}` },
  });
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.execution.issueCodes.includes("service_user_missing"));
  assert.equal(parsed.execution.report.allowCreate, false);
}

function testExecuteServiceUserPhaseRequiresRootForCreation() {
  const fake = makeFakeDscl(["hermes-host"]);
  const result = spawnSync("bash", [
    SCRIPT,
    "--execute",
    "--phase",
    "create-service-users",
    "--service-users",
    "hm-owner",
    "--json",
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fake.dir}:${process.env.PATH}`,
      HOMEAI_INSTALL_ALLOW_USER_CREATE: "1",
    },
  });
  if (process.getuid && process.getuid() === 0) {
    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.execution.report.createdCount, 1);
    return;
  }
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.execution.issueCodes.includes("root_required_for_user_create"));
}

function testExecuteDirectoryLayoutPhaseIsIdempotent() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-layout-"));
  const first = JSON.parse(run([
    "--execute",
    "--phase",
    "create-directory-layout",
    "--root",
    root,
    "--json",
  ]));
  assert.equal(first.ok, true, JSON.stringify(first.issues, null, 2));
  assert.equal(first.execution.phase, "create-directory-layout");
  assert.equal(first.execution.ok, true);
  assert.equal(first.execution.report.ok, true);
  assert.ok(first.execution.report.createdCount > 0);
  assert.ok(first.execution.report.rollback.safeOnlyForEmptyDirectories);
  assert.ok(first.execution.report.rollback.commands.some((command) => command.includes("/data/secrets")));
  assert.equal(fs.statSync(path.join(root, "data", "secrets")).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(root, "tmp")).mode & 0o777, 0o700);
  const phase = first.phases.find((item) => item.id === "create-directory-layout");
  assert.equal(phase.status, "executed");

  const second = JSON.parse(run([
    "--execute",
    "--phase",
    "create-directory-layout",
    "--root",
    root,
    "--json",
  ]));
  assert.equal(second.ok, true, JSON.stringify(second.issues, null, 2));
  assert.equal(second.execution.report.createdCount, 0);
  assert.ok(second.execution.report.actions.every((action) => action.existed));
}

function testExecuteInstallHermesMobileCopiesOnlyToEmptyApp() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-app-"));
  const first = JSON.parse(run([
    "--execute",
    "--phase",
    "install-hermes-mobile",
    "--root",
    root,
    "--app-source",
    REPO_ROOT,
    "--json",
  ]));
  assert.equal(first.ok, true, JSON.stringify(first.issues, null, 2));
  assert.equal(first.execution.phase, "install-hermes-mobile");
  assert.equal(first.execution.ok, true);
  assert.equal(first.execution.report.ok, true);
  assert.ok(first.execution.report.fileCount > 100);
  assert.ok(first.execution.report.excludedCount >= 3);
  assert.equal(fs.existsSync(path.join(root, "app", "package.json")), true);
  assert.equal(fs.existsSync(path.join(root, "app", "public", "index.html")), true);
  assert.equal(fs.existsSync(path.join(root, "app", ".env")), false);
  assert.equal(fs.existsSync(path.join(root, "app", ".git")), false);
  assert.equal(fs.existsSync(path.join(root, "app", ".agent-context")), false);
  assert.equal(fs.existsSync(path.join(root, "app", "node_modules")), false);
  const phase = first.phases.find((item) => item.id === "install-hermes-mobile");
  assert.equal(phase.status, "executed");

  const second = spawnSync("bash", [
    SCRIPT,
    "--execute",
    "--phase",
    "install-hermes-mobile",
    "--root",
    root,
    "--app-source",
    REPO_ROOT,
    "--json",
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.notEqual(second.status, 0);
  const parsedSecond = JSON.parse(second.stdout);
  assert.equal(parsedSecond.ok, false);
  assert.ok(parsedSecond.issues.some((issue) => issue.code === "phase_execution_failed"));
  assert.ok(parsedSecond.execution.issueCodes.includes("target_app_not_empty"));
}

function makeFakeNode(version = "v24.14.1") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-node-"));
  const nodePath = path.join(dir, "node");
  fs.writeFileSync(nodePath, `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "${version}"; exit 0; fi\nexit 0\n`, { mode: 0o755 });
  return nodePath;
}

function makeFakeNpm({ fail = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-npm-"));
  const npmPath = path.join(dir, "npm");
  fs.writeFileSync(npmPath, `#!/bin/sh
if [ "$1" = "--version" ]; then echo "11.11.0"; exit 0; fi
if [ "$1" = "ci" ]; then
  ${fail ? "echo 'install failed' >&2; exit 42" : "mkdir -p node_modules/prod-package; echo installed; exit 0"}
fi
if [ "$1" = "install" ]; then
  ${fail ? "echo 'install failed' >&2; exit 42" : "mkdir -p node_modules/prod-package; echo installed; exit 0"}
fi
exit 1
`, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, "npx"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  return npmPath;
}

function makeFakePython(version = "Python 3.12.4") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-python-"));
  const pythonPath = path.join(dir, "python3.12");
  const script = `#!/bin/sh
if [ "$1" = "--version" ]; then echo "${version}"; exit 0; fi
if [ "$1" = "-m" ] && [ "$2" = "venv" ]; then
  dest="$3"
  mkdir -p "$dest/bin"
  cat > "$dest/bin/python" <<'PY'
#!/bin/sh
if [ "$1" = "--version" ]; then echo "Python 3.12.4"; exit 0; fi
if [ "$1" = "-m" ] && [ "$2" = "pip" ]; then
  if [ "$3" = "install" ] && [ "$4" = "-e" ]; then echo "editable install must not be used" >&2; exit 43; fi
  echo "pip ok"
  exit 0
fi
if [ "$1" = "-m" ] && [ "$2" = "hermes_cli.main" ]; then echo "hermes ok"; exit 0; fi
exit 0
PY
  chmod 755 "$dest/bin/python"
  exit 0
fi
exit 0
`;
  fs.writeFileSync(pythonPath, script, { mode: 0o755 });
  return pythonPath;
}

function makeFakeAgentSource() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-agent-source-"));
  fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
  fs.writeFileSync(path.join(dir, "pyproject.toml"), "[project]\nname='hermes-agent-fixture'\nversion='0.0.0'\n");
  return dir;
}

function makeFakePackagedAgentSource() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-packaged-agent-source-"));
  fs.writeFileSync(path.join(dir, "pyproject.toml"), "[project]\nname='hermes-agent-fixture'\nversion='0.0.0'\n");
  return dir;
}

function makeDependencyRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-deps-"));
  fs.mkdirSync(path.join(root, "app"), { recursive: true });
  fs.writeFileSync(path.join(root, "app", "package.json"), JSON.stringify({
    name: "homeai-deps-test",
    version: "1.0.0",
    dependencies: { "prod-package": "1.0.0" },
    devDependencies: { "dev-package": "1.0.0" },
  }, null, 2));
  fs.writeFileSync(path.join(root, "app", "package-lock.json"), JSON.stringify({
    name: "homeai-deps-test",
    version: "1.0.0",
    lockfileVersion: 3,
    packages: {
      "": {
        name: "homeai-deps-test",
        version: "1.0.0",
        dependencies: { "prod-package": "1.0.0" },
        devDependencies: { "dev-package": "1.0.0" },
      },
      "node_modules/prod-package": { version: "1.0.0" },
      "node_modules/dev-package": { version: "1.0.0", dev: true },
    },
  }, null, 2));
  return root;
}

function testExecuteDependencyPhaseUsesBoundedNpmCi() {
  const root = makeDependencyRoot();
  const npmPath = makeFakeNpm();
  const parsed = JSON.parse(run([
    "--execute",
    "--phase",
    "install-dependencies",
    "--root",
    root,
    "--npm-command",
    npmPath,
    "--json",
  ]));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.execution.phase, "install-dependencies");
  assert.equal(parsed.execution.ok, true);
  assert.equal(parsed.execution.report.ok, true);
  assert.equal(parsed.execution.report.npmVersion, "11.11.0");
  assert.equal(parsed.execution.report.installStatus, 0);
  assert.equal(parsed.execution.report.installedPackageCount, 1);
  assert.equal(fs.existsSync(path.join(root, "app", "node_modules", "prod-package")), true);
  const phase = parsed.phases.find((item) => item.id === "install-dependencies");
  assert.equal(phase.status, "executed");
}

function testExecuteDependencyPhaseFailsWithoutLockfile() {
  const root = makeDependencyRoot();
  fs.rmSync(path.join(root, "app", "package-lock.json"));
  const result = spawnSync("bash", [
    SCRIPT,
    "--execute",
    "--phase",
    "install-dependencies",
    "--root",
    root,
    "--npm-command",
    makeFakeNpm(),
    "--json",
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.execution.issueCodes.includes("package_lock_missing"));
}

function testExecuteDependencyPhaseReportsNpmFailureBoundedly() {
  const root = makeDependencyRoot();
  const result = spawnSync("bash", [
    SCRIPT,
    "--execute",
    "--phase",
    "install-dependencies",
    "--root",
    root,
    "--npm-command",
    makeFakeNpm({ fail: true }),
    "--json",
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.execution.issueCodes.includes("npm_ci_failed"));
  assert.ok(JSON.stringify(parsed.execution.report).length < 5000);
}

function testExecuteRuntimePhaseLinksNodeIdempotently() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-runtime-"));
  const nodePath = makeFakeNode();
  const npmPath = makeFakeNpm();
  const pythonPath = makeFakePython();
  const agentSource = makeFakeAgentSource();
  const first = JSON.parse(run([
    "--execute",
    "--phase",
    "install-official-hermes-runtime",
    "--root",
    root,
    "--node-command",
    nodePath,
    "--npm-command",
    npmPath,
    "--python-command",
    pythonPath,
    "--hermes-agent-source",
    agentSource,
    "--json",
  ]));
  assert.equal(first.ok, true, JSON.stringify(first.issues, null, 2));
  assert.equal(first.execution.phase, "install-official-hermes-runtime");
  assert.equal(first.execution.ok, true);
  assert.equal(first.execution.report.ok, true);
  const runtimeNode = path.join(root, "runtime", "node-current", "bin", "node");
  const runtimeNpm = path.join(root, "runtime", "node-current", "bin", "npm");
  const runtimePython = path.join(root, "runtime", "hermes-agent-official", "venv", "bin", "python");
  assert.equal(fs.lstatSync(runtimeNode).isSymbolicLink(), true);
  assert.equal(path.resolve(path.dirname(runtimeNode), fs.readlinkSync(runtimeNode)), nodePath);
  assert.equal(fs.lstatSync(runtimeNpm).isSymbolicLink(), true);
  assert.equal(path.resolve(path.dirname(runtimeNpm), fs.readlinkSync(runtimeNpm)), npmPath);
  assert.equal(fs.existsSync(runtimePython), true);
  assert.ok(first.execution.report.actions.some((action) => action.action === "runtime-node-symlink"));
  assert.ok(first.execution.report.actions.some((action) => action.action === "runtime-npm-symlink"));
  assert.ok(first.execution.report.actions.some((action) => action.action === "hermes-agent-source-exists"));
  assert.ok(first.execution.report.actions.some((action) => action.action === "hermes-agent-venv-create"));
  assert.ok(first.execution.report.actions.some((action) => action.action === "hermes-agent-dependencies-install"));
  const phase = first.phases.find((item) => item.id === "install-official-hermes-runtime");
  assert.equal(phase.status, "executed");

  const second = JSON.parse(run([
    "--execute",
    "--phase",
    "install-official-hermes-runtime",
    "--root",
    root,
    "--node-command",
    nodePath,
    "--npm-command",
    npmPath,
    "--python-command",
    pythonPath,
    "--hermes-agent-source",
    agentSource,
    "--json",
  ]));
  assert.equal(second.ok, true, JSON.stringify(second.issues, null, 2));
  assert.ok(second.execution.report.actions.some((action) => action.action === "runtime-node-already-linked"));
  assert.ok(second.execution.report.actions.some((action) => action.action === "runtime-npm-already-linked"));
  assert.ok(second.execution.report.actions.some((action) => action.action === "hermes-agent-venv-exists"));
}

function testExecuteRuntimePhaseAcceptsPackagedAgentSource() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-runtime-package-"));
  const parsed = JSON.parse(run([
    "--execute",
    "--phase",
    "install-official-hermes-runtime",
    "--root",
    root,
    "--node-command",
    makeFakeNode(),
    "--python-command",
    makeFakePython(),
    "--hermes-agent-source",
    makeFakePackagedAgentSource(),
    "--json",
  ]));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.ok(parsed.execution.report.actions.some((action) => action.action === "hermes-agent-packaged-source-exists"));
  assert.ok(parsed.execution.report.actions.some((action) => action.action === "hermes-agent-dependencies-install"));
}

function testExecuteRuntimePhaseFailsClosedForNonProjectAgentSource() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-runtime-non-project-"));
  const agentSource = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-agent-non-project-"));
  fs.writeFileSync(path.join(agentSource, "README.md"), "not a Python project\n");
  const result = spawnSync("bash", [
    SCRIPT,
    "--execute",
    "--phase",
    "install-official-hermes-runtime",
    "--root",
    root,
    "--node-command",
    makeFakeNode(),
    "--python-command",
    makeFakePython(),
    "--hermes-agent-source",
    agentSource,
    "--json",
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.execution.issueCodes.includes("hermes_agent_source_not_python_project"));
}

function testExecuteRuntimePhaseFailsOnDifferentExistingNode() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-runtime-conflict-"));
  const firstNode = makeFakeNode();
  const secondNode = makeFakeNode();
  const pythonPath = makeFakePython();
  const agentSource = makeFakeAgentSource();
  JSON.parse(run([
    "--execute",
    "--phase",
    "install-official-hermes-runtime",
    "--root",
    root,
    "--node-command",
    firstNode,
    "--python-command",
    pythonPath,
    "--hermes-agent-source",
    agentSource,
    "--json",
  ]));
  const result = spawnSync("bash", [
    SCRIPT,
    "--execute",
    "--phase",
    "install-official-hermes-runtime",
    "--root",
    root,
    "--node-command",
    secondNode,
    "--python-command",
    pythonPath,
    "--hermes-agent-source",
    agentSource,
    "--json",
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.execution.issueCodes.includes("runtime_node_symlink_target_mismatch"));
}

function testExecuteRuntimePhaseFailsClosedForOldPython() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-runtime-python-"));
  const result = spawnSync("bash", [
    SCRIPT,
    "--execute",
    "--phase",
    "install-official-hermes-runtime",
    "--root",
    root,
    "--node-command",
    makeFakeNode(),
    "--python-command",
    makeFakePython("Python 3.9.6"),
    "--hermes-agent-source",
    makeFakeAgentSource(),
    "--json",
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.execution.issueCodes.includes("python_version_too_old_or_unreadable"));
}

function testExecuteConfigureOwnerCreatesMissingKeyWithoutPrintingIt() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-owner-"));
  const parsed = JSON.parse(run([
    "--execute",
    "--phase",
    "configure-owner",
    "--root",
    root,
    "--json",
  ]));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.execution.phase, "configure-owner");
  assert.equal(parsed.execution.ok, true);
  assert.equal(parsed.execution.report.ok, true);
  assert.equal(parsed.execution.report.keyStatus, "present");
  assert.equal(parsed.execution.report.keyLength, 64);
  assert.equal(parsed.execution.report.actions.some((item) => item.action === "create"), true);
  const keyPath = path.join(root, "data", "secrets", "owner-web-key.secret");
  const key = fs.readFileSync(keyPath, "utf8").trim();
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(fs.statSync(keyPath).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(keyPath)).mode & 0o777, 0o700);
  assert.doesNotMatch(JSON.stringify(parsed), new RegExp(key));
  const phase = parsed.phases.find((item) => item.id === "configure-owner");
  assert.equal(phase.status, "executed");
}

function testExecuteConfigureOwnerPreservesExistingKeyAndTightensMode() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-owner-existing-"));
  const keyPath = path.join(root, "data", "secrets", "owner-web-key.secret");
  fs.mkdirSync(path.dirname(keyPath), { recursive: true, mode: 0o755 });
  fs.writeFileSync(keyPath, "existing-owner-key\n", { mode: 0o644 });
  const parsed = JSON.parse(run([
    "--execute",
    "--phase",
    "configure-owner",
    "--root",
    root,
    "--json",
  ]));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(fs.readFileSync(keyPath, "utf8"), "existing-owner-key\n");
  assert.equal(fs.statSync(keyPath).mode & 0o777, 0o600);
  assert.equal(parsed.execution.report.keyLength, "existing-owner-key".length);
  assert.equal(parsed.execution.report.actions.some((item) => item.action === "chmod"), true);
  assert.doesNotMatch(JSON.stringify(parsed), /existing-owner-key/);
}

function testExecuteConfigureOwnerFailsClosedForEmptyExistingKey() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-owner-empty-"));
  const keyPath = path.join(root, "data", "secrets", "owner-web-key.secret");
  fs.mkdirSync(path.dirname(keyPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(keyPath, "\n", { mode: 0o600 });
  const result = spawnSync("bash", [
    SCRIPT,
    "--execute",
    "--phase",
    "configure-owner",
    "--root",
    root,
    "--json",
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.execution.issueCodes.includes("owner_key_file_empty"));
}

function testExecuteWorkspaceIsolationCreatesBaselineScaffoldWithoutAcl() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-isolation-"));
  const parsed = JSON.parse(run([
    "--execute",
    "--phase",
    "configure-workspace-isolation",
    "--root",
    root,
    "--workspace-map",
    "owner:hm-owner:owner,weixin_wuping:hm-wuping:weixin_wuping",
    "--json",
  ]));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.execution.phase, "configure-workspace-isolation");
  assert.equal(parsed.execution.ok, true);
  assert.equal(parsed.execution.report.applyAcl, false);
  assert.equal(parsed.execution.report.workspaceMap.length, 2);
  assert.equal(fs.statSync(path.join(root, "data", "drive", "owner")).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(root, "data", "drive", "users", "weixin_wuping")).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(root, "data", "skill-profiles", "owner-full", "skills")).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(root, "data", "skill-profiles", "weixin_wuping", "memories")).mode & 0o777, 0o700);
  assert.ok(parsed.execution.report.aclPlan.some((item) => item.user === "hm-owner"));
  const phase = parsed.phases.find((item) => item.id === "configure-workspace-isolation");
  assert.equal(phase.status, "executed");
}

function testExecuteWorkspaceIsolationFailsClosedForInvalidMap() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-isolation-invalid-"));
  const result = spawnSync("bash", [
    SCRIPT,
    "--execute",
    "--phase",
    "configure-workspace-isolation",
    "--root",
    root,
    "--workspace-map",
    "../bad:hm-owner:owner",
    "--json",
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.execution.issueCodes.includes("workspace_map_invalid"));
}

function testExecuteWorkspaceIsolationRequiresRootForAclApply() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-isolation-acl-"));
  const result = spawnSync("bash", [
    SCRIPT,
    "--execute",
    "--phase",
    "configure-workspace-isolation",
    "--root",
    root,
    "--workspace-map",
    "owner:hm-owner:owner",
    "--json",
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      HOMEAI_INSTALL_APPLY_WORKSPACE_ACL: "1",
    },
  });
  if (process.getuid && process.getuid() === 0) {
    const parsed = JSON.parse(result.stdout);
    if (parsed.execution.issueCodes.includes("workspace_user_missing")) return;
    assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
    return;
  }
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.execution.issueCodes.includes("root_required_for_workspace_acl"));
}

function testExecuteGatewayProfilesCreatesManifestKeysAndConfigs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-gateway-"));
  const parsed = JSON.parse(run([
    "--execute",
    "--phase",
    "configure-gateway-profiles",
    "--root",
    root,
    "--workspace-map",
    "owner:hm-owner:owner,weixin_wuping:hm-wuping:weixin_wuping",
    "--gateway-openai-workers",
    "2",
    "--json",
  ]));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.execution.phase, "configure-gateway-profiles");
  assert.equal(parsed.execution.ok, true);
  assert.equal(parsed.execution.report.ok, true);
  assert.equal(parsed.execution.report.authStatus, "provider-auth-not-copied");
  assert.equal(parsed.execution.report.manifestWorkerCount, 10);
  assert.equal(parsed.execution.report.createdKeyFileCount, 10);

  const manifestPath = path.join(root, "data", "gateway-pool-manifest-mac.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.authStatus, "provider-auth-not-copied");
  assert.equal(manifest.workers.length, 10);
  const ownerWorker = manifest.workers.find((worker) => worker.profile === "hm-owner-openai-1");
  assert.equal(ownerWorker.provider, "openai-codex");
  assert.equal(ownerWorker.securityLevel, "user");
  assert.deepEqual(ownerWorker.allowedWorkspaceIds, ["owner"]);
  assert.deepEqual(ownerWorker.skillWorkspaceIds, ["owner"]);
  assert.equal(ownerWorker.skillProfile, "owner-full");
  assert.equal(ownerWorker.toolsets.includes("weather"), true);
  assert.equal(ownerWorker.toolsets.includes("clarify"), true);
  assert.equal(ownerWorker.api_key, undefined);
  assert.equal(path.basename(ownerWorker.apiKeyFile), "hm-owner-openai-1.key");
  assert.equal(fs.existsSync(ownerWorker.apiKeyFile), true);
  assert.equal(fs.statSync(ownerWorker.apiKeyFile).mode & 0o777, 0o600);
  assert.equal(fs.existsSync(ownerWorker.configPath), true);
  assert.match(fs.readFileSync(ownerWorker.configPath, "utf8"), /provider: openai-codex/);
  assert.match(fs.readFileSync(ownerWorker.configPath, "utf8"), /weather/);
  assert.equal(fs.lstatSync(path.join(path.dirname(ownerWorker.configPath), "skills")).isSymbolicLink(), true);
  const deepSeekWorker = manifest.workers.find((worker) => worker.profile === "hm-owner-deepseek-1");
  assert.equal(deepSeekWorker.provider, "deepseek");
  assert.equal(deepSeekWorker.securityLevel, "user");
  assert.equal(path.basename(deepSeekWorker.apiKeyFile), "hm-owner-deepseek-1.key");
  assert.match(fs.readFileSync(deepSeekWorker.configPath, "utf8"), /provider: deepseek/);
  assert.match(fs.readFileSync(deepSeekWorker.configPath, "utf8"), /default: deepseek-chat/);
  const grokWorker = manifest.workers.find((worker) => worker.profile === "grokgw1");
  assert.equal(grokWorker.provider, "xai-oauth");
  assert.equal(grokWorker.securityLevel, "user");
  assert.equal(grokWorker.toolsets.includes("video_gen"), true);
  assert.match(fs.readFileSync(grokWorker.configPath, "utf8"), /provider: xai-oauth/);
  assert.match(fs.readFileSync(grokWorker.configPath, "utf8"), /default: grok-4\.3/);
  const maintenanceWorker = manifest.workers.find((worker) => worker.profile === "officialclean1");
  assert.equal(maintenanceWorker.provider, "openai-codex");
  assert.equal(maintenanceWorker.securityLevel, "owner-maintenance");
  assert.equal(maintenanceWorker.allowMaintenance, true);
  assert.deepEqual(maintenanceWorker.allowedWorkspaceIds, ["owner"]);
  assert.equal(maintenanceWorker.toolsets.includes("chatgpt_pro"), true);
  assert.match(fs.readFileSync(maintenanceWorker.configPath, "utf8"), /provider: openai-codex/);
  const deepSeekMaintenanceWorker = manifest.workers.find((worker) => worker.profile === "deepseekmaint1");
  assert.equal(deepSeekMaintenanceWorker.provider, "deepseek");
  assert.equal(deepSeekMaintenanceWorker.securityLevel, "owner-maintenance");
  assert.equal(deepSeekMaintenanceWorker.allowMaintenance, true);
  assert.match(fs.readFileSync(deepSeekMaintenanceWorker.configPath, "utf8"), /provider: deepseek/);
  assert.match(fs.readFileSync(deepSeekMaintenanceWorker.configPath, "utf8"), /default: deepseek-chat/);
  const keyValue = fs.readFileSync(ownerWorker.apiKeyFile, "utf8").trim();
  assert.ok(keyValue.length >= 32);
  assert.doesNotMatch(JSON.stringify(parsed), new RegExp(keyValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const phase = parsed.phases.find((item) => item.id === "configure-gateway-profiles");
  assert.equal(phase.status, "executed");
}

function testExecuteGatewayProfilesPreservesExistingManifest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-gateway-existing-"));
  const keyPath = path.join(root, "data", "secrets", "gateway-workers", "existing.key");
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, "existing-key\n", { mode: 0o644 });
  const manifestPath = path.join(root, "data", "gateway-pool-manifest-mac.json");
  fs.writeFileSync(manifestPath, JSON.stringify({
    enabled: true,
    version: 1,
    workers: [{
      profile: "existing-profile",
      provider: "openai-codex",
      securityLevel: "user",
      allowedWorkspaceIds: ["owner"],
      skillWorkspaceIds: ["owner"],
      apiKeyFile: keyPath,
    }],
  }, null, 2));
  const parsed = JSON.parse(run([
    "--execute",
    "--phase",
    "configure-gateway-profiles",
    "--root",
    root,
    "--workspace-map",
    "owner:hm-owner:owner",
    "--json",
  ]));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.workers.length, 1);
  assert.equal(manifest.workers[0].profile, "existing-profile");
  assert.equal(fs.statSync(keyPath).mode & 0o777, 0o600);
  assert.equal(parsed.execution.report.actions.some((item) => item.action === "preserve-existing-manifest"), true);
}

function testExecuteGatewayProfilesFailsClosedForInlineApiKey() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-gateway-inline-key-"));
  const manifestPath = path.join(root, "data", "gateway-pool-manifest-mac.json");
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify({
    workers: [{
      profile: "bad-profile",
      provider: "openai-codex",
      securityLevel: "user",
      api_key: "do-not-inline",
    }],
  }, null, 2));
  const result = spawnSync("bash", [
    SCRIPT,
    "--execute",
    "--phase",
    "configure-gateway-profiles",
    "--root",
    root,
    "--workspace-map",
    "owner:hm-owner:owner",
    "--json",
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.execution.issueCodes.includes("gateway_manifest_inline_api_key_not_allowed"));
}

function testExecuteConfigurePluginsWritesSourcePlanWithoutWorkspaceGrants() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-plugins-"));
  const parsed = JSON.parse(run([
    "--execute",
    "--phase",
    "configure-plugins",
    "--root",
    root,
    "--plugin-source-mode",
    "plan",
    "--json",
  ]));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.execution.phase, "configure-plugins");
  assert.equal(parsed.execution.ok, true);
  assert.equal(parsed.execution.report.ok, true);
  assert.equal(parsed.execution.report.sourceMode, "plan");
  assert.equal(parsed.execution.report.workspaceGrantsCreated, false);
  assert.ok(parsed.execution.report.pluginCount >= 6);
  const planPath = path.join(root, "data", "plugin-source-plan.json");
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  assert.equal(plan.workspaceGrantsCreated, false);
  assert.equal(plan.mode, "plan");
  assert.equal(plan.plugins.some((plugin) => plugin.id === "music" && plugin.special === true), true);
  assert.equal(plan.plugins.some((plugin) => plugin.id === "wardrobe" && plugin.publicDefault === true), true);
  assert.equal(fs.existsSync(path.join(root, "plugins")), true);
  assert.equal(fs.existsSync(path.join(root, "plugins", "wardrobe")), false);
  const phase = parsed.phases.find((item) => item.id === "configure-plugins");
  assert.equal(phase.status, "executed");
}

function testExecuteConfigurePluginsFailsClosedForInvalidMode() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-plugins-invalid-mode-"));
  const result = spawnSync("bash", [
    SCRIPT,
    "--execute",
    "--phase",
    "configure-plugins",
    "--root",
    root,
    "--plugin-source-mode",
    "rewrite",
    "--json",
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.execution.issueCodes.includes("plugin_source_mode_invalid"));
}

function testExecuteConfigurePluginsCloneFailsOnNonGitTarget() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-plugins-clone-conflict-"));
  fs.mkdirSync(path.join(root, "plugins", "wardrobe"), { recursive: true });
  fs.writeFileSync(path.join(root, "plugins", "wardrobe", "README.txt"), "not git\n");
  const result = spawnSync("bash", [
    SCRIPT,
    "--execute",
    "--phase",
    "configure-plugins",
    "--root",
    root,
    "--plugin-source-mode",
    "clone",
    "--json",
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.execution.issueCodes.includes("plugin_target_exists_not_git_checkout"));
}

function testExecutePluginDependenciesInstallsNodeAndPythonPlugins() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-plugin-deps-"));
  const pluginRoot = path.join(root, "plugins");
  const nodePlugin = path.join(pluginRoot, "node-plugin");
  const npmInstallPlugin = path.join(pluginRoot, "npm-install-plugin");
  const pyPlugin = path.join(pluginRoot, "wardrobe");
  fs.mkdirSync(nodePlugin, { recursive: true });
  fs.mkdirSync(npmInstallPlugin, { recursive: true });
  fs.mkdirSync(pyPlugin, { recursive: true });
  fs.writeFileSync(path.join(nodePlugin, "package.json"), JSON.stringify({ name: "node-plugin", version: "1.0.0" }));
  fs.writeFileSync(path.join(nodePlugin, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: { "": { name: "node-plugin" } } }));
  fs.writeFileSync(path.join(npmInstallPlugin, "package.json"), JSON.stringify({ name: "npm-install-plugin", version: "1.0.0" }));
  fs.writeFileSync(path.join(pyPlugin, "requirements.txt"), "openpyxl==3.1.5\n");
  const agentPython = path.join(root, "runtime", "hermes-agent-official", "venv", "bin", "python");
  fs.mkdirSync(path.dirname(agentPython), { recursive: true });
  fs.writeFileSync(agentPython, `#!/bin/sh
if [ "$1" = "-m" ] && [ "$2" = "pip" ]; then echo "pip ok"; exit 0; fi
exit 0
`, { mode: 0o755 });
  const parsed = JSON.parse(run([
    "--execute",
    "--phase",
    "install-plugin-dependencies",
    "--root",
    root,
    "--npm-command",
    makeFakeNpm(),
    "--json",
  ]));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.execution.phase, "install-plugin-dependencies");
  assert.equal(parsed.execution.ok, true);
  assert.equal(parsed.execution.report.ok, true);
  assert.ok(parsed.execution.report.actions.some((action) => action.action === "npm-ci" && action.plugin === "node-plugin"));
  assert.ok(parsed.execution.report.actions.some((action) => action.action === "npm-install" && action.plugin === "npm-install-plugin"));
  assert.ok(parsed.execution.report.actions.some((action) => action.action === "pip-install" && action.plugin === "wardrobe"));
  const phase = parsed.phases.find((item) => item.id === "install-plugin-dependencies");
  assert.equal(phase.status, "executed");
}

function testExecutePluginWorkspaceProvisioningPlanDoesNotCreateSecretsOrGrants() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-plugin-provisioning-"));
  const parsed = JSON.parse(run([
    "--execute",
    "--phase",
    "plan-plugin-workspace-provisioning",
    "--root",
    root,
    "--workspace-map",
    "owner:hm-owner:owner,weixin_test:hm-test:weixin_test",
    "--json",
  ]));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.execution.phase, "plan-plugin-workspace-provisioning");
  assert.equal(parsed.execution.ok, true);
  assert.equal(parsed.execution.report.createsPluginKeys, false);
  assert.equal(parsed.execution.report.createsWorkspaceGrants, false);
  assert.equal(parsed.execution.report.callsPluginBindEndpoints, false);
  assert.equal(parsed.execution.report.workspaceCount, 2);
  const planPath = path.join(root, "data", "plugin-workspace-provisioning-plan.json");
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  assert.deepEqual(plan.defaultBusinessPluginIds.sort(), ["email", "finance", "growth", "health", "note", "wardrobe"]);
  assert.ok(plan.excludedSpecialPluginIds.includes("codex-mobile-web"));
  assert.ok(plan.excludedSpecialPluginIds.includes("music"));
  assert.equal(plan.createsPluginKeys, false);
  assert.equal(plan.createsWorkspaceGrants, false);
  assert.equal(plan.callsPluginBindEndpoints, false);
  assert.equal(fs.existsSync(path.join(root, "data", "plugin-workspace-authorizations.json")), false);
  assert.equal(fs.existsSync(path.join(root, "data", "drive", "users", "owner", ".hermes-finance", "access-key.txt")), false);
  const owner = plan.workspaces.find((workspace) => workspace.workspaceId === "owner");
  assert.equal(owner.defaultBusinessPluginCount, 6);
  assert.ok(owner.plugins.every((plugin) => plugin.currentStatus === "pending"));
}

function testExecutePluginWorkspaceProvisioningPlanDetectsPartialGatewayBinding() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-plugin-provisioning-partial-"));
  const financeDir = path.join(root, "data", "drive", "users", "owner", ".hermes-finance");
  fs.mkdirSync(financeDir, { recursive: true });
  fs.writeFileSync(path.join(financeDir, "config.json"), JSON.stringify({ access_key_file: "access-key.txt" }));
  fs.writeFileSync(path.join(financeDir, "access-key.txt"), "finance-secret\n");
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.writeFileSync(path.join(root, "data", "plugin-workspace-authorizations.json"), JSON.stringify({
    version: 1,
    plugins: {
      finance: {
        records: {
          owner: {
            workspaceId: "owner",
            status: "authorized",
            provisioningStatus: "active",
          },
        },
      },
    },
  }, null, 2));
  const parsed = JSON.parse(run([
    "--execute",
    "--phase",
    "plan-plugin-workspace-provisioning",
    "--root",
    root,
    "--workspace-map",
    "owner:hm-owner:owner",
    "--json",
  ]));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  const plan = JSON.parse(fs.readFileSync(path.join(root, "data", "plugin-workspace-provisioning-plan.json"), "utf8"));
  const finance = plan.workspaces[0].plugins.find((plugin) => plugin.pluginId === "finance");
  assert.equal(finance.currentStatus, "gateway_binding_pending");
  assert.equal(finance.authorized, true);
  assert.equal(finance.authorizationProvisioningStatus, "active");
  assert.equal(finance.dataConfigExists, true);
  assert.equal(finance.dataKeyExists, true);
  assert.equal(finance.workerConfigExists, false);
  assert.equal(finance.workerKeyExists, false);
}

function testExecuteConfigureCronCreatesCanonicalStoreAndHelpers() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-cron-"));
  const parsed = JSON.parse(run([
    "--execute",
    "--phase",
    "configure-cron",
    "--root",
    root,
    "--cron-network-mode",
    "direct",
    "--json",
  ]));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.execution.phase, "configure-cron");
  assert.equal(parsed.execution.ok, true);
  assert.equal(parsed.execution.report.ok, true);
  assert.equal(parsed.execution.report.businessJobsCreated, false);
  assert.equal(parsed.execution.report.launchdInstalled, false);
  assert.equal(parsed.execution.report.jobCount, 0);
  assert.ok(parsed.execution.report.skillCount >= 1);
  const jobsPath = path.join(root, "data", "hermes-home", "cron", "jobs.json");
  assert.deepEqual(JSON.parse(fs.readFileSync(jobsPath, "utf8")), { jobs: [] });
  assert.equal(fs.existsSync(path.join(root, "data", "hermes-home", "scripts", "hermes-mobile-cron-dispatcher.py")), true);
  assert.equal(fs.statSync(path.join(root, "data", "hermes-home", "scripts", "hermes-mobile-cron-dispatcher.py")).mode & 0o777, 0o755);
  assert.equal(fs.existsSync(path.join(root, "data", "hermes-home", "skills", "productivity", "home-ai-todo-intake", "SKILL.md")), true);
  const plan = JSON.parse(fs.readFileSync(path.join(root, "data", "cron-config-plan.json"), "utf8"));
  assert.equal(plan.businessJobsCreated, false);
  assert.equal(plan.launchdInstalled, false);
  assert.equal(plan.environment.HERMES_MOBILE_NETWORK_MODE, "direct");
  const audit = spawnSync(process.execPath, [
    path.join(REPO_ROOT, "scripts", "macos-automation-cron-audit.js"),
    "--root",
    root,
    "--app",
    REPO_ROOT,
    "--strict-config",
    "--json",
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.equal(audit.status, 0, audit.stdout || audit.stderr);
  const auditPayload = JSON.parse(audit.stdout);
  assert.equal(auditPayload.ok, true);
  assert.equal(auditPayload.jobCount, 0);
  const phase = parsed.phases.find((item) => item.id === "configure-cron");
  assert.equal(phase.status, "executed");
}

function testExecuteConfigureCronPreservesExistingJobsStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-cron-existing-"));
  const jobsPath = path.join(root, "data", "hermes-home", "cron", "jobs.json");
  fs.mkdirSync(path.dirname(jobsPath), { recursive: true });
  fs.writeFileSync(jobsPath, JSON.stringify({ jobs: [{ id: "existing", enabled: true, no_agent: true }] }, null, 2));
  const parsed = JSON.parse(run([
    "--execute",
    "--phase",
    "configure-cron",
    "--root",
    root,
    "--json",
  ]));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  const jobs = JSON.parse(fs.readFileSync(jobsPath, "utf8")).jobs;
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].id, "existing");
  assert.equal(parsed.execution.report.jobCount, 1);
  assert.equal(parsed.execution.report.actions.some((item) => item.action === "jobs-store-exists"), true);
}

function testExecuteConfigureCronFailsClosedForInvalidNetworkMode() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-cron-invalid-"));
  const result = spawnSync("bash", [
    SCRIPT,
    "--execute",
    "--phase",
    "configure-cron",
    "--root",
    root,
    "--cron-network-mode",
    "mesh",
    "--json",
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.execution.issueCodes.includes("cron_network_mode_invalid"));
}

function testExecuteLaunchdServicesStagesCorePlistsWithoutLoading() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-launchd-"));
  const codexRuntimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-codex-runtime-"));
  const codexProfileFile = path.join(codexRuntimeRoot, "codex-profiles.json");
  const financeDir = path.join(root, "data", "drive", "users", "owner", ".hermes-finance");
  fs.mkdirSync(financeDir, { recursive: true });
  fs.writeFileSync(path.join(financeDir, "config.json"), JSON.stringify({
    schema_version: 1,
    workspace_id: "owner",
    hermes_workspace_id: "owner",
    access_key_file: "access-key.txt",
  }, null, 2));
  fs.writeFileSync(path.join(financeDir, "access-key.txt"), "finance-secret\n", { mode: 0o600 });
  fs.writeFileSync(codexProfileFile, JSON.stringify({
    activeProfileId: "previous",
    profiles: [
      { id: "default", label: "Default", codexHome: "/Users/example/path" },
      { id: "previous", label: "Previous", codexHome: "/Users/example/path" },
    ],
  }, null, 2));
  const parsed = JSON.parse(runWithEnv([
    "--execute",
    "--phase",
    "install-launchd-services",
    "--root",
    root,
    "--json",
  ], {
    CODEX_MOBILE_PROFILE_FILE: codexProfileFile,
    CODEX_MOBILE_RUNTIME_DIR: codexRuntimeRoot,
  }));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.execution.phase, "install-launchd-services");
  assert.equal(parsed.execution.ok, true);
  assert.equal(parsed.execution.report.ok, true);
  assert.equal(parsed.execution.report.launchdInstalled, false);
  assert.equal(parsed.execution.report.launchdLoaded, false);
  assert.equal(parsed.execution.report.operatorInstallRequired, true);
  assert.equal(parsed.execution.report.serviceCount, 15);
  assert.equal(parsed.execution.report.pluginServiceCount, 10);
  const planPath = path.join(root, "data", "launchd-services-plan.json");
  const stagingDir = path.join(root, "data", "launchd-staging");
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  assert.equal(plan.launchdInstalled, false);
  assert.equal(plan.launchdLoaded, false);
  assert.equal(plan.operatorInstallRequired, true);
  assert.equal(plan.coreServiceCount, 5);
  assert.equal(plan.pluginServiceCount, 10);
  assert.deepEqual(plan.services.map((service) => service.label).sort(), [
    "com.hermesmobile.bridge-host",
    "com.hermesmobile.cron",
    "com.hermesmobile.listener",
    "com.hermesmobile.plugin.codex-mobile",
    "com.hermesmobile.plugin.email",
    "com.hermesmobile.plugin.finance",
    "com.hermesmobile.plugin.growth",
    "com.hermesmobile.plugin.health",
    "com.hermesmobile.plugin.moira",
    "com.hermesmobile.plugin.movie",
    "com.hermesmobile.plugin.music",
    "com.hermesmobile.plugin.note",
    "com.hermesmobile.plugin.wardrobe",
    "com.hermesmobile.production-drift-audit",
    "com.hermesmobile.workspace-system-helper",
  ]);
  assert.deepEqual(plan.services.filter((service) => service.kind === "plugin").map((service) => service.pluginId).sort(), [
    "codex-mobile",
    "email",
    "finance",
    "growth",
    "health",
    "moira",
    "movie",
    "music",
    "note",
    "wardrobe",
  ]);
  const listenerPlist = fs.readFileSync(path.join(stagingDir, "com.hermesmobile.listener.plist"), "utf8");
  assert.match(listenerPlist, /<string>com\.hermesmobile\.listener<\/string>/);
  assert.match(listenerPlist, /<string>8797<\/string>/);
  assert.match(listenerPlist, /<key>KeepAlive<\/key>/);
  const musicPlist = fs.readFileSync(path.join(stagingDir, "com.hermesmobile.plugin.music.plist"), "utf8");
  assert.match(musicPlist, /<string>com\.hermesmobile\.plugin\.music<\/string>/);
  assert.match(musicPlist, /<string>src\/roon-first-server\.js<\/string>/);
  const financePlist = fs.readFileSync(path.join(stagingDir, "com.hermesmobile.plugin.finance.plist"), "utf8");
  const expectedFinanceHash = `sha256:${crypto.createHash("sha256").update("owner:finance-secret").digest("hex")}`;
  assert.match(financePlist, /<key>FINANCE_HERMES_WORKSPACE_KEY_HASHES_JSON<\/key>/);
  assert.match(financePlist, new RegExp(expectedFinanceHash));
  assert.doesNotMatch(financePlist, /finance-secret/);
  const codexPlist = fs.readFileSync(path.join(stagingDir, "com.hermesmobile.plugin.codex-mobile.plist"), "utf8");
  assert.match(codexPlist, /<key>CODEX_HOME<\/key>\s*<string>\/Users\/xuxin\/\.codex-homes\/previous<\/string>/);
  assert.match(codexPlist, /<key>CODEX_MOBILE_PROFILE_FILE<\/key>/);
  assert.match(codexPlist, /<key>CODEX_MOBILE_REQUIRE_SHARED_APP_SERVER<\/key>\s*<string>1<\/string>/);
  assert.match(codexPlist, /<key>CODEX_MOBILE_PERSIST_OWNED_MUX<\/key>\s*<string>1<\/string>/);
  assert.match(codexPlist, /<key>CODEX_MOBILE_DISABLE_OWNED_MUX<\/key>\s*<string>0<\/string>/);
  assert.match(codexPlist, /\/Users\/xuxin\/\.codex-homes\/previous\/app-server-mux\/endpoint\.json/);
  const driftAuditPlist = fs.readFileSync(path.join(stagingDir, "com.hermesmobile.production-drift-audit.plist"), "utf8");
  assert.match(driftAuditPlist, /<key>HOMEAI_PRODUCTION_DRIFT_AUTO_REPAIR<\/key>\s*<string>1<\/string>/);
  const wardrobePlist = fs.readFileSync(path.join(stagingDir, "com.hermesmobile.plugin.wardrobe.plist"), "utf8");
  assert.match(wardrobePlist, /<string>app\.py<\/string>/);
  const phase = parsed.phases.find((item) => item.id === "install-launchd-services");
  assert.equal(phase.status, "executed");
}

function makeFakeLaunchctl() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-launchctl-"));
  const logPath = path.join(dir, "calls.log");
  const launchctlPath = path.join(dir, "launchctl");
  fs.writeFileSync(launchctlPath, `#!/bin/sh
printf '%s\\n' "$*" >> ${JSON.stringify(logPath)}
if [ "$1" = "unload" ]; then exit 36; fi
exit 0
`, { mode: 0o755 });
  return { launchctlPath, logPath };
}

function makeGatewayLaunchdRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-gateway-launchd-"));
  writeGatewayDocumentPluginFixtures(root);
  const parsed = JSON.parse(run([
    "--execute",
    "--phase",
    "configure-gateway-profiles",
    "--root",
    root,
    "--workspace-map",
    "owner:hm-owner:owner",
    "--gateway-openai-workers",
    "1",
    "--gateway-deepseek-workers",
    "0",
    "--gateway-owner-grok-workers",
    "0",
    "--gateway-owner-maintenance-openai-workers",
    "0",
    "--gateway-owner-maintenance-deepseek-workers",
    "0",
    "--json",
  ]));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  return root;
}

function testExecuteGatewayLaunchdServicesStagesWorkersWithoutLoading() {
  const root = makeGatewayLaunchdRoot();
  const parsed = JSON.parse(run([
    "--execute",
    "--phase",
    "install-gateway-launchd-services",
    "--root",
    root,
    "--json",
  ]));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.execution.phase, "install-gateway-launchd-services");
  assert.equal(parsed.execution.ok, true);
  assert.equal(parsed.execution.report.workerCount, 1);
  assert.equal(parsed.execution.report.launchdInstalled, false);
  assert.equal(parsed.execution.report.launchdLoaded, false);
  assert.equal(parsed.execution.report.operatorInstallRequired, true);
  const planPath = path.join(root, "data", "gateway-launchd-services-plan.json");
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  assert.equal(plan.workerCount, 1);
  assert.equal(plan.launchdInstalled, false);
  assert.equal(plan.launchdLoaded, false);
  assert.equal(plan.services[0].label, "com.hermesmobile.gateway.hm-owner.openai.1");
  assert.equal(plan.services[0].runAtLoad, false);
  assert.equal(plan.services[0].keepAlive, false);
  const startScript = fs.readFileSync(plan.services[0].startScript, "utf8");
  const profileDir = plan.services[0].profileDir;
  assert.match(startScript, /HERMES_MOBILE_BRIDGE_HOST_URL/);
  assert.match(startScript, /HERMES_WEB_BRIDGE_HOST_KEY_PATH/);
  assert.match(startScript, /HERMES_MOBILE_DOCX_ALLOWED_ROOTS/);
  assert.match(startScript, /HERMES_MOBILE_PPTX_ALLOWED_ROOTS/);
  assert.match(startScript, /HERMES_MOBILE_PPTX_OUTPUT_ROOTS/);
  assert.match(startScript, /HERMES_MOBILE_PDF_ALLOWED_ROOTS/);
  assert.match(startScript, /HERMES_MOBILE_PDF_OUTPUT_ROOTS/);
  assert.match(startScript, /HERMES_MOBILE_AUDIO_ALLOWED_ROOTS/);
  assert.match(startScript, /HERMES_MOBILE_ARCHIVE_ALLOWED_ROOTS/);
  assert.match(startScript, /HERMES_MOBILE_HTTP_CREDENTIAL_ROOTS="\$ROOT\/data\/drive\/users"/);
  assert.match(startScript, /API_SERVER_KEY/);
  assert.doesNotMatch(startScript, /gateway-key/);
  const configText = fs.readFileSync(path.join(profileDir, "config.yaml"), "utf8");
  for (const pluginName of ["hermes-mobile-docx", "hermes-mobile-pptx", "hermes-mobile-pdf", "hermes-mobile-audio", "hermes-mobile-archive"]) {
    assert.match(configText, new RegExp(escapeRegex(pluginName)));
    assert.ok(fs.existsSync(path.join(profileDir, "plugins", pluginName, "plugin.yaml")), `${pluginName} should be profile-local`);
  }
  const plist = fs.readFileSync(plan.services[0].stagedPlistPath, "utf8");
  assert.match(plist, /<key>RunAtLoad<\/key><false\/>/);
  assert.match(plist, /<key>KeepAlive<\/key><false\/>/);
  assert.match(plist, /<key>UserName<\/key><string>hm-owner<\/string>/);
  const phase = parsed.phases.find((item) => item.id === "install-gateway-launchd-services");
  assert.equal(phase.status, "executed");
}

function testGatewayLaunchdServicesHonorExistingExternalProfileLayout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-gateway-external-layout-"));
  const external = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-existing-gateway-layout-"));
  const profileDir = path.join(external, "HermesWorkspace", ".hermes-gateway", "profiles", "hm-owner-openai-1");
  fs.mkdirSync(profileDir, { recursive: true });
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  writeGatewayDocumentPluginFixtures(root);
  fs.writeFileSync(path.join(profileDir, "config.yaml"), "plugins:\n  enabled: []\n", "utf8");
  fs.writeFileSync(path.join(root, "data", "gateway-pool-manifest-mac.json"), JSON.stringify({
    workers: [{
      profile: "hm-owner-openai-1",
      osUser: "hm-owner",
      provider: "openai-codex",
      port: 18751,
      configPath: path.join(profileDir, "config.yaml"),
      apiKey: "fixture-key",
    }],
  }), "utf8");

  const parsed = JSON.parse(run([
    "--execute",
    "--phase",
    "install-gateway-launchd-services",
    "--root",
    root,
    "--json",
  ]));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  const plan = JSON.parse(fs.readFileSync(path.join(root, "data", "gateway-launchd-services-plan.json"), "utf8"));
  const startScript = plan.services[0].startScript;
  assert.equal(startScript, path.join(external, "HermesWorkspace", ".hermes-gateway", "start-hm-owner-openai-1.sh"));
  const startText = fs.readFileSync(startScript, "utf8");
  assert.match(startText, new RegExp(escapeRegex(`HERMES_WORKSPACE_ROOT=${JSON.stringify(path.join(external, "HermesWorkspace"))}`)));
  assert.match(startText, /HERMES_MOBILE_PDF_ALLOWED_ROOTS/);
  assert.match(startText, /HERMES_MOBILE_PPTX_ALLOWED_ROOTS/);
  assert.match(startText, /HERMES_MOBILE_PPTX_OUTPUT_ROOTS/);
  assert.match(startText, /HERMES_MOBILE_AUDIO_ALLOWED_ROOTS/);
  assert.match(startText, /HERMES_MOBILE_ARCHIVE_ALLOWED_ROOTS/);
  assert.match(startText, /HERMES_MOBILE_HTTP_CREDENTIAL_ROOTS="\$ROOT\/data\/drive\/users"/);
  const configText = fs.readFileSync(path.join(profileDir, "config.yaml"), "utf8");
  for (const pluginName of ["hermes-mobile-docx", "hermes-mobile-pptx", "hermes-mobile-pdf", "hermes-mobile-audio", "hermes-mobile-archive"]) {
    assert.match(configText, new RegExp(escapeRegex(pluginName)));
    assert.ok(fs.existsSync(path.join(profileDir, "plugins", pluginName, "plugin.yaml")), `${pluginName} should be profile-local`);
  }
  assert.doesNotMatch(startScript, new RegExp(escapeRegex(path.join(root, "users"))));
}

function testExecuteGatewayLaunchdServicesCanInstallAndLoadFromCentralGate() {
  const root = makeGatewayLaunchdRoot();
  const launchDaemonsDir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-gateway-launchdaemons-"));
  const fake = makeFakeLaunchctl();
  const parsed = JSON.parse(runWithEnv([
    "--execute",
    "--phase",
    "install-gateway-launchd-services",
    "--root",
    root,
    "--json",
  ], {
    HOMEAI_INSTALL_LAUNCHD_APPLY: "1",
    HOMEAI_LAUNCH_DAEMONS_DIR: launchDaemonsDir,
    HOMEAI_LAUNCHCTL: fake.launchctlPath,
  }));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.execution.phase, "install-gateway-launchd-services");
  assert.equal(parsed.execution.ok, true);
  assert.equal(parsed.execution.report.launchdInstalled, true);
  assert.equal(parsed.execution.report.launchdLoaded, true);
  assert.equal(parsed.execution.report.operatorInstallRequired, false);
  assert.equal(parsed.execution.report.workerCount, 1);
  const plan = JSON.parse(fs.readFileSync(path.join(root, "data", "gateway-launchd-services-plan.json"), "utf8"));
  assert.equal(plan.launchDaemonsDir, launchDaemonsDir);
  assert.equal(plan.services[0].installStatus, "installed-and-loaded");
  assert.equal(fs.existsSync(path.join(launchDaemonsDir, "com.hermesmobile.gateway.hm-owner.openai.1.plist")), true);
  const calls = fs.readFileSync(fake.logPath, "utf8").trim().split(/\n+/);
  assert.equal(calls.filter((line) => line.startsWith("load -w ")).length, 1);
  assert.equal(calls.filter((line) => line.startsWith("unload -w ")).length, 1);
  assert.ok(parsed.execution.report.rollback.commands.some((command) => command.includes("com.hermesmobile.gateway")));
}

function makeFakeAclCommands(users = ["hm-owner", "hermes-host"]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-acl-"));
  const logPath = path.join(dir, "calls.log");
  const idPath = path.join(dir, "id");
  const chmodPath = path.join(dir, "chmod");
  const chownPath = path.join(dir, "chown");
  fs.writeFileSync(idPath, `#!/bin/sh
if [ "$1" = "-u" ]; then
  case "$2" in
${users.map((user) => `    ${user}) echo 501; exit 0 ;;`).join("\n")}
  esac
fi
exit 1
`, { mode: 0o755 });
  for (const [file, name] of [[chmodPath, "chmod"], [chownPath, "chown"]]) {
    fs.writeFileSync(file, `#!/bin/sh
printf '%s %s\\n' ${JSON.stringify(name)} "$*" >> ${JSON.stringify(logPath)}
exit 0
`, { mode: 0o755 });
  }
  return { dir, logPath, idPath, chmodPath, chownPath };
}

function testExecuteGatewayWorkerAclWritesPlanWithoutApplying() {
  const root = makeGatewayLaunchdRoot();
  const parsed = JSON.parse(run([
    "--execute",
    "--phase",
    "repair-gateway-worker-acl",
    "--root",
    root,
    "--json",
  ]));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.execution.phase, "repair-gateway-worker-acl");
  assert.equal(parsed.execution.ok, true);
  assert.equal(parsed.execution.report.applyAcl, false);
  assert.equal(parsed.execution.report.workerCount, 1);
  assert.ok(parsed.execution.report.aclEntryCount > 0);
  const plan = JSON.parse(fs.readFileSync(path.join(root, "data", "gateway-worker-acl-plan.json"), "utf8"));
  assert.equal(plan.applyAcl, false);
  assert.equal(plan.applied, false);
  assert.ok(plan.aclPlan.some((entry) => entry.user === "hm-owner" && entry.path.endsWith("gateway-pool-manifest-mac.json")));
  assert.ok(plan.aclPlan.some((entry) => entry.user === "hermes-host" && entry.path.includes("gateway-workers")));
  const phase = parsed.phases.find((item) => item.id === "repair-gateway-worker-acl");
  assert.equal(phase.status, "executed");
}

function testExecuteGatewayWorkerAclCanApplyWithFakeCommands() {
  const root = makeGatewayLaunchdRoot();
  fs.writeFileSync(path.join(root, "data", "secrets", "bridge-host.secret"), "bridge-key\n", { mode: 0o600 });
  fs.writeFileSync(path.join(root, "data", "secrets", "deepseek-api-key.secret"), "provider-key\n", { mode: 0o600 });
  const fake = makeFakeAclCommands();
  const parsed = JSON.parse(runWithEnv([
    "--execute",
    "--phase",
    "repair-gateway-worker-acl",
    "--root",
    root,
    "--json",
  ], {
    HOMEAI_INSTALL_APPLY_WORKSPACE_ACL: "1",
    HOMEAI_INSTALL_ACL_TEST_MODE: "1",
    HOMEAI_ID: fake.idPath,
    HOMEAI_CHMOD: fake.chmodPath,
    HOMEAI_CHOWN: fake.chownPath,
  }));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.execution.report.applyAcl, true);
  assert.equal(parsed.execution.report.workerCount, 1);
  const plan = JSON.parse(fs.readFileSync(path.join(root, "data", "gateway-worker-acl-plan.json"), "utf8"));
  assert.equal(plan.applied, true);
  assert.ok(plan.aclPlan.some((entry) => entry.user === "hm-owner" && entry.path.endsWith("bridge-host.secret")));
  assert.ok(plan.aclPlan.some((entry) => entry.user === "hm-owner" && entry.path.endsWith("deepseek-api-key.secret")));
  const calls = fs.readFileSync(fake.logPath, "utf8");
  assert.match(calls, /chmod .*user:hm-owner allow read,readattr,readextattr,readsecurity/);
  assert.match(calls, /chmod .*user:hermes-host allow read,readattr,readextattr,readsecurity/);
  assert.match(calls, /chown -R hm-owner:staff/);
}

function testExecuteLaunchdServicesCanInstallAndLoadFromCentralGate() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-launchd-apply-"));
  const launchDaemonsDir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-launchdaemons-"));
  const fake = makeFakeLaunchctl();
  const parsed = JSON.parse(runWithEnv([
    "--execute",
    "--phase",
    "install-launchd-services",
    "--root",
    root,
    "--json",
  ], {
    HOMEAI_INSTALL_LAUNCHD_APPLY: "1",
    HOMEAI_LAUNCH_DAEMONS_DIR: launchDaemonsDir,
    HOMEAI_LAUNCHCTL: fake.launchctlPath,
  }));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.execution.phase, "install-launchd-services");
  assert.equal(parsed.execution.ok, true);
  assert.equal(parsed.execution.report.launchdInstalled, true);
  assert.equal(parsed.execution.report.launchdLoaded, true);
  assert.equal(parsed.execution.report.operatorInstallRequired, false);
  assert.equal(parsed.execution.report.serviceCount, 15);
  assert.equal(parsed.execution.report.pluginServiceCount, 10);
  const plan = JSON.parse(fs.readFileSync(path.join(root, "data", "launchd-services-plan.json"), "utf8"));
  assert.equal(plan.launchdInstalled, true);
  assert.equal(plan.launchdLoaded, true);
  assert.equal(plan.operatorInstallRequired, false);
  assert.equal(plan.launchDaemonsDir, launchDaemonsDir);
  assert.ok(plan.services.every((service) => service.productionPlistPath.startsWith(launchDaemonsDir)));
  assert.ok(plan.services.every((service) => service.installStatus === "installed-and-loaded"));
  assert.equal(fs.readdirSync(launchDaemonsDir).filter((name) => name.endsWith(".plist")).length, 15);
  const calls = fs.readFileSync(fake.logPath, "utf8").trim().split(/\n+/);
  assert.equal(calls.filter((line) => line.startsWith("load -w ")).length, 15);
  assert.equal(calls.filter((line) => line.startsWith("unload -w ")).length, 15);
  assert.ok(parsed.execution.report.actions.some((action) => action.action === "install-plist"));
  assert.ok(parsed.execution.report.rollback.commands.some((command) => command.includes("unload -w")));
}

function testExecuteReadOnlyFirstStartPhase() {
  const root = makeFirstStartRoot();
  const output = runWithEnv([
    "--execute",
    "--phase",
    "run-first-start-preflight",
    "--network-mode",
    "direct",
    "--root",
    root,
    "--json",
  ], { HOMEAI_LAUNCH_DAEMONS_DIR: path.join(root, "launchd") });
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.execution.phase, "run-first-start-preflight");
  assert.equal(parsed.execution.ok, true);
  const phase = parsed.phases.find((item) => item.id === "run-first-start-preflight");
  assert.equal(phase.status, "executed");
}

function testExecuteReadOnlySmokeTestsPhase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-installer-smoke-"));
  const scriptDir = path.join(root, "app", "scripts");
  fs.mkdirSync(scriptDir, { recursive: true });
  fs.writeFileSync(path.join(scriptDir, "macos-production-closure-validation.js"), "// fake closure script\n");
  const fakeNode = path.join(root, "fake-node");
  fs.writeFileSync(fakeNode, `#!/bin/sh
printf '%s\\n' '{"ok":true,"expectedVersion":"test-version","status":{"activeGlobal":0,"clientVersion":"test-version"},"finalStatus":{"activeGlobal":0,"clientVersion":"test-version"},"profileAudit":{"issueCount":0,"blockingWarningCount":0},"acl":{"failedCount":0},"pluginDirectory":{"ok":true},"boundDirectory":{"path":{"ok":true},"uiRoute":{"ok":true}},"wardrobeBinding":{"ok":true},"schemas":[],"scope":{"grokXai":"deferred_manual_oauth_not_included"}}'
`, { mode: 0o755 });
  const output = run([
    "--execute",
    "--phase",
    "run-smoke-tests",
    "--root",
    root,
    "--node-command",
    fakeNode,
    "--base",
    "http://127.0.0.1:8797",
    "--json",
  ]);
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.execution.phase, "run-smoke-tests");
  assert.equal(parsed.execution.ok, true);
  assert.equal(parsed.execution.report.ok, true);
  assert.equal(parsed.execution.report.phase, "run-smoke-tests");
  assert.equal(parsed.execution.report.rollback.notApplicable, true);
  assert.equal(parsed.execution.report.closure.ok, true);
  assert.equal(parsed.execution.report.closure.expectedVersion, "test-version");
  assert.equal(parsed.execution.report.closure.activeGlobal, 0);
  assert.equal(parsed.execution.report.closure.finalActiveGlobal, 0);
  assert.equal(parsed.execution.report.closure.profileIssueCount, 0);
  assert.equal(parsed.execution.report.closure.aclFailedCount, 0);
  assert.doesNotMatch(JSON.stringify(parsed.execution.report), /owner-web-key|weixin-ingress|secret-value/);
  const phase = parsed.phases.find((item) => item.id === "run-smoke-tests");
  assert.equal(phase.status, "executed");
}

function testExecuteReadOnlyAccessInfoPhase() {
  const root = makeFirstStartRoot();
  const output = run([
    "--execute",
    "--phase",
    "print-access-info",
    "--root",
    root,
    "--base",
    "http://127.0.0.1:8797/hermes-mobile",
    "--json",
  ]);
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.execution.phase, "print-access-info");
  assert.equal(parsed.execution.ok, true);
  assert.equal(parsed.execution.report.ok, true);
  assert.equal(parsed.execution.report.phase, "print-access-info");
  assert.equal(parsed.execution.report.root, root);
  assert.equal(parsed.execution.report.access.localUrl, "http://127.0.0.1:8797/hermes-mobile");
  assert.match(parsed.execution.report.paths.app, /app$/);
  assert.ok(parsed.execution.report.followUpCommands.some((command) => command.includes("production-status-smoke.js")));
  assert.doesNotMatch(JSON.stringify(parsed.execution.report), /owner-key\n|secret-value/);
  assert.match(JSON.stringify(parsed.execution.report), /<owner-key-file>/);
  const phase = parsed.phases.find((item) => item.id === "print-access-info");
  assert.equal(phase.status, "executed");
}

function testHelpDocumentsDryRunDefault() {
  const output = run(["--help"]);
  assert.match(output, /Default mode is --dry-run/);
  assert.match(output, /--guided/);
  assert.match(output, /one-command guided install report/);
  assert.match(output, /print-access-info/);
  assert.match(output, /central deploy script/);
}

testScriptExistsAndIsSafeByDefault();
testDryRunJsonPlan();
testGuidedDryRunJsonPlan();
testGuidedExecuteRunsAutomaticPhasesOnly();
testExecuteFailsClosed();
testExecuteServiceUserPhasePassesWithExistingUsers();
testExecuteServiceUserPhaseFailsClosedForMissingUsers();
testExecuteServiceUserPhaseRequiresRootForCreation();
testExecuteDirectoryLayoutPhaseIsIdempotent();
testExecuteInstallHermesMobileCopiesOnlyToEmptyApp();
testExecuteDependencyPhaseUsesBoundedNpmCi();
testExecuteDependencyPhaseFailsWithoutLockfile();
testExecuteDependencyPhaseReportsNpmFailureBoundedly();
testExecuteRuntimePhaseLinksNodeIdempotently();
testExecuteRuntimePhaseAcceptsPackagedAgentSource();
testExecuteRuntimePhaseFailsClosedForNonProjectAgentSource();
testExecuteRuntimePhaseFailsOnDifferentExistingNode();
testExecuteRuntimePhaseFailsClosedForOldPython();
testExecuteConfigureOwnerCreatesMissingKeyWithoutPrintingIt();
testExecuteConfigureOwnerPreservesExistingKeyAndTightensMode();
testExecuteConfigureOwnerFailsClosedForEmptyExistingKey();
testExecuteWorkspaceIsolationCreatesBaselineScaffoldWithoutAcl();
testExecuteWorkspaceIsolationFailsClosedForInvalidMap();
testExecuteWorkspaceIsolationRequiresRootForAclApply();
testExecuteGatewayProfilesCreatesManifestKeysAndConfigs();
testExecuteGatewayProfilesPreservesExistingManifest();
testExecuteGatewayProfilesFailsClosedForInlineApiKey();
testExecuteConfigurePluginsWritesSourcePlanWithoutWorkspaceGrants();
testExecuteConfigurePluginsFailsClosedForInvalidMode();
testExecuteConfigurePluginsCloneFailsOnNonGitTarget();
testExecutePluginDependenciesInstallsNodeAndPythonPlugins();
testExecutePluginWorkspaceProvisioningPlanDoesNotCreateSecretsOrGrants();
testExecutePluginWorkspaceProvisioningPlanDetectsPartialGatewayBinding();
testExecuteConfigureCronCreatesCanonicalStoreAndHelpers();
testExecuteConfigureCronPreservesExistingJobsStore();
testExecuteConfigureCronFailsClosedForInvalidNetworkMode();
testExecuteGatewayLaunchdServicesStagesWorkersWithoutLoading();
testGatewayLaunchdServicesHonorExistingExternalProfileLayout();
testExecuteGatewayLaunchdServicesCanInstallAndLoadFromCentralGate();
testExecuteGatewayWorkerAclWritesPlanWithoutApplying();
testExecuteGatewayWorkerAclCanApplyWithFakeCommands();
testExecuteLaunchdServicesStagesCorePlistsWithoutLoading();
testExecuteLaunchdServicesCanInstallAndLoadFromCentralGate();
testExecuteReadOnlyFirstStartPhase();
testExecuteReadOnlySmokeTestsPhase();
testExecuteReadOnlyAccessInfoPhase();
testHelpDocumentsDryRunDefault();

console.log("install macos production tests passed");
