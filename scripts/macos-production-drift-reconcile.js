"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  buildAudit,
} = require("./macos-production-profile-audit");
const {
  createGrowthPluginProvisioningService,
} = require("../adapters/growth-plugin-provisioning-service");
const {
  createMoiraPluginProvisioningService,
} = require("../adapters/moira-plugin-provisioning-service");
const {
  createHermesPluginAuthorizationService,
} = require("../adapters/hermes-plugin-authorization-service");
const {
  configuredPlugins,
} = require("../adapters/hermes-plugin-service");

function parseArgs(argv = []) {
  const out = {
    root: process.env.HERMES_MOBILE_ROOT || "/Users/example/path",
    execute: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") out.root = argv[++index] || out.root;
    else if (arg === "--execute") out.execute = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--help") {
      console.log([
        "Usage: node scripts/macos-production-drift-reconcile.js --root <HermesMobile root> [--execute] [--json]",
        "  Reconciles selected low-risk Mac production drift classes.",
        "  Current execute action: unload and quarantine untracked Gateway LaunchDaemon plists.",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function compactPath(value, root) {
  return String(value || "").replaceAll(root, "<root>");
}

function run(command, args = []) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    status: result.status == null ? 1 : result.status,
    stdout: String(result.stdout || "").slice(0, 1200),
    stderr: String(result.stderr || "").slice(0, 1200),
  };
}

function shQuote(value) {
  return `'${String(value || "").replaceAll("'", "'\\''")}'`;
}

function runShell(script) {
  return run("/bin/bash", ["-lc", script]);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return null;
  }
}

function openAiCodexManifestUsers(root) {
  const manifest = readJson(path.join(root, "data", "gateway-pool-manifest-mac.json")) || {};
  return [...new Set((manifest.workers || [])
    .filter((worker) => String(worker.provider || "openai-codex").trim() === "openai-codex")
    .map((worker) => String(worker.osUser || "").trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function assertSafeGatewayPlist(plistPath) {
  const value = String(plistPath || "");
  if (!value.startsWith("/Library/LaunchDaemons/com.hermesmobile.gateway.")) {
    throw new Error("unsafe_launchd_plist_path");
  }
  if (!value.endsWith(".plist")) {
    throw new Error("unsafe_launchd_plist_suffix");
  }
}

function reconcileUntrackedGatewayLaunchd(audit, options = {}) {
  const root = path.resolve(options.root || "/Users/example/path");
  const execute = Boolean(options.execute);
  const rows = [];
  const quarantineRoot = path.join(root, "data", "production-drift-audit", "quarantine", timestamp());
  for (const item of audit.installedGatewayChecks || []) {
    if (item.trackedByManifest) continue;
    const plistPath = String(item.plistPath || "");
    assertSafeGatewayPlist(plistPath);
    const row = {
      type: "untracked-gateway-launchd",
      label: item.label,
      plistPath: compactPath(plistPath, root),
      startScriptPath: compactPath(item.startScriptPath, root),
      action: execute ? "quarantine" : "plan",
      quarantinedPath: "",
      bootoutStatus: null,
      moveStatus: null,
    };
    if (execute) {
      fs.mkdirSync(quarantineRoot, { recursive: true, mode: 0o750 });
      const bootout = run("/bin/launchctl", ["bootout", "system", plistPath]);
      row.bootoutStatus = bootout.status;
      const target = path.join(quarantineRoot, path.basename(plistPath));
      fs.renameSync(plistPath, target);
      row.moveStatus = 0;
      row.quarantinedPath = compactPath(target, root);
    }
    rows.push(row);
  }
  return rows;
}

function reconcileCodexSharedAuthPermissions(audit, options = {}) {
  const root = path.resolve(options.root || "/Users/example/path");
  const execute = Boolean(options.execute);
  const sharedAuthRoot = path.join(root, "gateway-worker", "telemetry", "profiles", "shared-auth");
  const manifestPath = path.join(root, "data", "gateway-pool-manifest-mac.json");
  const users = typeof options.openAiCodexManifestUsers === "function"
    ? options.openAiCodexManifestUsers(root)
    : openAiCodexManifestUsers(root);
  const files = ["auth.json", "auth.lock"]
    .map((name) => path.join(sharedAuthRoot, name))
    .filter((file) => fs.existsSync(file));
  const row = {
    type: "codex-shared-auth-permissions",
    action: execute ? "repair" : "plan",
    sharedAuthRoot: compactPath(sharedAuthRoot, root),
    manifestPath: compactPath(manifestPath, root),
    userCount: users.length,
    fileCount: files.length,
    status: null,
    ok: true,
    error: "",
  };
  if (!fs.existsSync(manifestPath) || !fs.existsSync(sharedAuthRoot) || !users.length || !files.length) {
    row.action = "skip";
    row.skipped = true;
    row.reason = !fs.existsSync(manifestPath)
      ? "manifest_missing"
      : !fs.existsSync(sharedAuthRoot)
        ? "shared_auth_root_missing"
        : !users.length
          ? "openai_codex_manifest_users_missing"
          : "shared_auth_files_missing";
    return [row];
  }
  if (!execute) return [row];

  const userBlock = users.join("\n");
  const fileBlock = files.map((file) => shQuote(file)).join(" ");
  const script = `
set -e
shared=${shQuote(sharedAuthRoot)}
/usr/sbin/chgrp hermes-workers "$shared" 2>/dev/null || true
/bin/chmod 770 "$shared" 2>/dev/null || true
for f in ${fileBlock}; do
  [ -e "$f" ] || continue
  /usr/sbin/chgrp hermes-workers "$f" 2>/dev/null || true
  /bin/chmod 660 "$f" 2>/dev/null || true
done
while IFS= read -r user; do
  [ -n "$user" ] || continue
  /bin/chmod +a "user:$user allow list,add_file,search,delete_child,readattr,writeattr,readextattr,writeextattr,readsecurity,file_inherit,directory_inherit" "$shared" 2>/dev/null || true
  for f in ${fileBlock}; do
    [ -e "$f" ] || continue
    /bin/chmod +a "user:$user allow read,write,append,readattr,writeattr,readextattr,writeextattr,readsecurity" "$f" 2>/dev/null || true
    /usr/bin/sudo -n -u "$user" /bin/test -r "$f"
    /usr/bin/sudo -n -u "$user" /bin/test -w "$f"
  done
done <<USERS
${userBlock}
USERS
printf '{"ok":true,"userCount":%s,"fileCount":%s}\\n' ${users.length} ${files.length}
`;
  const result = runShell(script);
  row.status = result.status;
  row.stdout = String(result.stdout || "").slice(0, 400);
  row.stderr = String(result.stderr || "").slice(0, 400);
  row.ok = result.status === 0;
  if (!row.ok) row.error = "codex_shared_auth_permission_repair_failed";
  return [row];
}

function reconcileMusicRuntimeCoverPermissions(audit, options = {}) {
  const root = path.resolve(options.root || "/Users/example/path");
  const execute = Boolean(options.execute);
  const pluginRoot = path.join(root, "plugins", "music");
  const runtimeRoot = path.join(pluginRoot, "runtime");
  const ownerUser = options.musicOwnerUser || "hm-owner";
  const directories = ["", "cover-cache", "cover-plan-cache", "cover-backups"]
    .map((name) => name ? path.join(runtimeRoot, name) : runtimeRoot);
  const sqliteFiles = ["music.sqlite", "music.sqlite-wal", "music.sqlite-shm"]
    .map((name) => path.join(runtimeRoot, name))
    .filter((file) => fs.existsSync(file));
  const row = {
    type: "music-runtime-cover-permissions",
    action: execute ? "repair" : "plan",
    ownerUser,
    runtimeRoot: compactPath(runtimeRoot, root),
    directoryCount: directories.length,
    sqliteFileCount: sqliteFiles.length,
    status: null,
    ok: true,
    error: "",
  };
  if (!fs.existsSync(pluginRoot)) {
    row.action = "skip";
    row.skipped = true;
    row.reason = "music_plugin_missing";
    return [row];
  }
  if (!execute) return [row];

  const directoryBlock = directories.map((dir) => shQuote(dir)).join(" ");
  const sqliteBlock = sqliteFiles.map((file) => shQuote(file)).join(" ");
  const dirAcl = `user:${ownerUser} allow list,add_file,add_subdirectory,search,delete_child,readattr,writeattr,readextattr,writeextattr,readsecurity,file_inherit,directory_inherit`;
  const fileAcl = `user:${ownerUser} allow read,write,append,readattr,writeattr,readextattr,writeextattr,readsecurity`;
  const script = `
set -e
for dir in ${directoryBlock}; do
  /bin/mkdir -p "$dir"
  /bin/chmod +a ${shQuote(dirAcl)} "$dir" 2>/dev/null || true
done
for f in ${sqliteBlock || ":SKIP:"}; do
  [ "$f" = ":SKIP:" ] && continue
  [ -e "$f" ] || continue
  /bin/chmod +a ${shQuote(fileAcl)} "$f" 2>/dev/null || true
done
/usr/bin/sudo -n -u ${shQuote(ownerUser)} /bin/test -d ${shQuote(path.join(runtimeRoot, "cover-plan-cache"))}
/usr/bin/sudo -n -u ${shQuote(ownerUser)} /bin/test -w ${shQuote(path.join(runtimeRoot, "cover-plan-cache"))}
/usr/bin/sudo -n -u ${shQuote(ownerUser)} /bin/test -d ${shQuote(path.join(runtimeRoot, "cover-backups"))}
/usr/bin/sudo -n -u ${shQuote(ownerUser)} /bin/test -w ${shQuote(path.join(runtimeRoot, "cover-backups"))}
printf '{"ok":true,"directoryCount":%s,"sqliteFileCount":%s}\\n' ${directories.length} ${sqliteFiles.length}
`;
  const result = runShell(script);
  row.status = result.status;
  row.stdout = String(result.stdout || "").slice(0, 400);
  row.stderr = String(result.stderr || "").slice(0, 400);
  row.ok = result.status === 0;
  if (!row.ok) row.error = "music_runtime_cover_permission_repair_failed";
  return [row];
}

function pluginLocalBindingIssueParts(issue = "") {
  const match = String(issue || "").match(/^plugin_local_binding_incomplete:([^:]+):([^:]+)$/);
  if (!match) return null;
  return { workspaceId: match[1], pluginId: match[2] };
}

function pluginBindingComplete(audit = {}, workspaceId = "", pluginId = "") {
  const bindings = audit.byWorkspace?.[workspaceId]?.localPluginBindings || [];
  return Boolean(bindings.find((binding) => binding.pluginId === pluginId)?.complete);
}

function enabledPluginAuthorizationRow(audit = {}, workspaceId = "", pluginId = "") {
  return (audit.pluginAuthorizations || []).find((row) => (
    row.workspaceId === workspaceId
    && row.pluginId === pluginId
    && row.enabled
  )) || null;
}

function pluginProvisioningIssueParts(issue = "") {
  const match = String(issue || "").match(/^plugin_provisioning_not_active:([^:]+):([^:]+):([^:]+)$/);
  if (!match) return null;
  return { workspaceId: match[1], pluginId: match[2], provisioningStatus: match[3] };
}

function pluginManifestUrl(pluginId = "", options = {}) {
  const plugin = (options.plugins || configuredPlugins({ env: options.env || process.env }))
    .find((item) => item.id === pluginId);
  return plugin?.manifestUrl || "";
}

function requiredPluginSkillsComplete(audit = {}, workspaceId = "", pluginId = "") {
  const skills = audit.byWorkspace?.[workspaceId]?.requiredPluginSkills || [];
  const relevant = skills.filter((item) => item.pluginId === pluginId);
  return relevant.length === 0 || relevant.every((item) => item.complete && item.listenerCanReadSkillFile !== false);
}

function pluginProvisioningStatusRepairPlan(audit = {}, options = {}) {
  const rows = [];
  for (const issue of audit.issues || []) {
    const parts = pluginProvisioningIssueParts(issue);
    if (!parts) continue;
    const { workspaceId, pluginId, provisioningStatus } = parts;
    const authorization = enabledPluginAuthorizationRow(audit, workspaceId, pluginId);
    const localBindingComplete = pluginBindingComplete(audit, workspaceId, pluginId);
    const requiredSkillsComplete = requiredPluginSkillsComplete(audit, workspaceId, pluginId);
    const repairable = Boolean(authorization && localBindingComplete && requiredSkillsComplete);
    rows.push({
      type: "plugin-provisioning-status",
      workspaceId,
      pluginId,
      provisioningStatus,
      localBindingComplete,
      requiredSkillsComplete,
      action: options.execute && repairable ? "activate" : "plan",
      ok: !options.execute || repairable,
      error: repairable ? "" : "plugin_provisioning_status_evidence_incomplete",
    });
  }
  return rows;
}

function pluginLocalBindingRepairPlan(audit = {}, options = {}) {
  const root = path.resolve(options.root || "/Users/example/path");
  const supported = new Set(["growth", "moira"]);
  const rows = [];
  for (const issue of audit.issues || []) {
    const parts = pluginLocalBindingIssueParts(issue);
    if (!parts) continue;
    const { workspaceId, pluginId } = parts;
    const authorization = enabledPluginAuthorizationRow(audit, workspaceId, pluginId);
    const manifestUrl = pluginManifestUrl(pluginId, options);
    const supportedProvisioning = supported.has(pluginId);
    rows.push({
      type: "plugin-local-binding",
      workspaceId,
      pluginId,
      status: authorization?.status || "",
      provisioningStatus: authorization?.provisioningStatus || "",
      supported: supportedProvisioning,
      action: options.execute && supportedProvisioning ? "provision" : "plan",
      manifestUrl,
      localBindingComplete: pluginBindingComplete(audit, workspaceId, pluginId),
      configPath: compactPath(path.join(root, "data", "drive", "users", workspaceId, `.hermes-${pluginId}`, "config.json"), root),
      keyPath: compactPath(path.join(root, "data", "drive", "users", workspaceId, `.hermes-${pluginId}`, "access-key.txt"), root),
      ok: !options.execute,
      error: supportedProvisioning ? "" : "plugin_binding_repair_not_supported",
    });
  }
  return rows;
}

async function reconcilePluginLocalBindings(audit, options = {}) {
  const execute = Boolean(options.execute);
  const root = path.resolve(options.root || "/Users/example/path");
  const dataDir = path.join(root, "data");
  const env = options.env || process.env;
  const rows = pluginLocalBindingRepairPlan(audit, options);
  if (!execute) return rows;

  const growthService = options.growthProvisioningService || createGrowthPluginProvisioningService({
    dataDir,
    env,
    fetch: options.fetch || global.fetch,
    growthOwnerKey: options.growthOwnerKey,
    growthOwnerKeyPath: options.growthOwnerKeyPath,
  });
  const moiraService = options.moiraProvisioningService || createMoiraPluginProvisioningService({
    dataDir,
    env,
  });
  const authorizationService = options.authorizationService || createHermesPluginAuthorizationService({
    dataDir,
    env,
  });

  for (const row of rows) {
    if (!row.supported) {
      row.ok = false;
      continue;
    }
    let result;
    if (row.pluginId === "growth") {
      result = await growthService.provisionWorkspace({
        workspaceId: row.workspaceId,
        displayName: row.workspaceId,
        growthManifestUrl: row.manifestUrl,
      });
    } else if (row.pluginId === "moira") {
      result = await moiraService.provisionWorkspace({
        workspaceId: row.workspaceId,
        displayName: row.workspaceId,
        moiraManifestUrl: row.manifestUrl,
      });
    } else {
      result = { ok: false, error: "plugin_binding_repair_not_supported" };
    }

    row.ok = Boolean(result?.ok);
    row.keyCreated = Boolean(result?.keyCreated);
    row.configCreated = Boolean(result?.configCreated || result?.configPath);
    row.error = row.ok ? "" : String(result?.error || "plugin_binding_repair_failed").replace(/\s+/g, " ").slice(0, 160);
    if (row.ok && typeof authorizationService.updateProvisioningStatus === "function") {
      authorizationService.updateProvisioningStatus({
        pluginId: row.pluginId,
        workspaceId: row.workspaceId,
        actor: "macos-production-drift-reconcile",
        provisioningStatus: "active",
        provisioningError: "",
      });
      row.provisioningStatus = "active";
    }
  }
  return rows;
}

async function reconcilePluginProvisioningStatuses(audit, options = {}) {
  const execute = Boolean(options.execute);
  const rows = pluginProvisioningStatusRepairPlan(audit, options);
  if (!execute) return rows;
  const root = path.resolve(options.root || "/Users/example/path");
  const dataDir = path.join(root, "data");
  const authorizationService = options.authorizationService || createHermesPluginAuthorizationService({
    dataDir,
    env: options.env || process.env,
  });
  for (const row of rows) {
    if (row.action !== "activate") {
      row.ok = false;
      continue;
    }
    const result = authorizationService.updateProvisioningStatus({
      pluginId: row.pluginId,
      workspaceId: row.workspaceId,
      actor: "macos-production-drift-reconcile",
      provisioningStatus: "active",
      provisioningError: "",
    });
    row.ok = Boolean(result?.ok);
    row.provisioningStatus = row.ok ? "active" : row.provisioningStatus;
    row.error = row.ok ? "" : String(result?.error || "plugin_provisioning_status_repair_failed").replace(/\s+/g, " ").slice(0, 160);
  }
  return rows;
}

async function runReconcile(options = {}) {
  const auditBuilder = typeof options.buildAudit === "function" ? options.buildAudit : buildAudit;
  const audit = auditBuilder({
    root: options.root,
    expectedWorkspaces: ["owner"],
    strict: false,
  });
  const rows = [
    ...reconcileUntrackedGatewayLaunchd(audit, options),
    ...reconcileCodexSharedAuthPermissions(audit, options),
    ...reconcileMusicRuntimeCoverPermissions(audit, options),
    ...await reconcilePluginLocalBindings(audit, options),
    ...await reconcilePluginProvisioningStatuses(audit, options),
  ];
  return {
    ok: rows.every((row) => {
      if (row.type === "untracked-gateway-launchd") return row.moveStatus == null || row.moveStatus === 0;
      if (row.type === "plugin-local-binding") return row.ok !== false;
      if (row.type === "plugin-provisioning-status") return row.ok !== false;
      if (row.type === "codex-shared-auth-permissions") return row.ok !== false;
      if (row.type === "music-runtime-cover-permissions") return row.ok !== false;
      return true;
    }),
    execute: Boolean(options.execute),
    actionCount: rows.length,
    rows,
  };
}

if (require.main === module) {
  (async () => {
    const options = parseArgs(process.argv.slice(2));
    const report = await runReconcile(options);
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`macos_production_drift_reconcile ok=${report.ok} execute=${report.execute} actionCount=${report.actionCount}`);
      for (const row of report.rows) console.log(`${row.action} ${row.type} ${row.label}`);
    }
    if (!report.ok) process.exit(1);
  })().catch((err) => {
    console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }, null, 2));
    process.exit(1);
  });
}

module.exports = {
  openAiCodexManifestUsers,
  pluginLocalBindingIssueParts,
  pluginLocalBindingRepairPlan,
  pluginProvisioningIssueParts,
  pluginProvisioningStatusRepairPlan,
  parseArgs,
  reconcileCodexSharedAuthPermissions,
  reconcilePluginLocalBindings,
  reconcilePluginProvisioningStatuses,
  reconcileMusicRuntimeCoverPermissions,
  reconcileUntrackedGatewayLaunchd,
  runReconcile,
};
