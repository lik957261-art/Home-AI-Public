"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  buildAudit,
} = require("./macos-production-profile-audit");
const {
  repairGatewayStartScripts,
} = require("./macos-gateway-start-script-bridge-env-repair");
const {
  repair: repairGatewayTelemetry,
} = require("./macos-gateway-telemetry-repair");
const {
  syncDoc: syncOpenAiCodexAuthDoc,
} = require("./sync-openai-codex-shared-auth-from-codex-home");
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

const REQUIRED_PROFILE_FILE_PLUGINS = Object.freeze([
  "hermes-mobile-docx",
  "hermes-mobile-pptx",
  "hermes-mobile-pdf",
  "hermes-mobile-audio",
  "hermes-mobile-archive",
]);

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

function writeJsonAtomic(file, value, mode = 0o600) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode });
  fs.renameSync(tmp, file);
  safeChmod(file, mode);
}

function safeChmod(target, mode) {
  try {
    fs.chmodSync(target, mode);
    return true;
  } catch (err) {
    return false;
  }
}

function compactToAbsolute(value, root) {
  return String(value || "").replaceAll("<root>", root);
}

function appRootFromOptions(options = {}) {
  return path.resolve(options.appPath || path.join(__dirname, ".."));
}

function chmodRecursive(target, mode) {
  safeChmod(target, mode);
  let entries = [];
  try {
    entries = fs.readdirSync(target, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const entry of entries) {
    const child = path.join(target, entry.name);
    chmodRecursive(child, entry.isDirectory() ? mode : 0o600);
  }
}

function chownRecursive(target, owner) {
  if (!owner) return { status: null, stderr: "" };
  return run("/usr/sbin/chown", ["-R", owner, target]);
}

function chownSymlink(file, owner) {
  if (!owner) return { status: null, stderr: "" };
  return run("/usr/sbin/chown", ["-h", owner, file]);
}

function openAiCodexManifestUsers(root) {
  const manifest = readJson(path.join(root, "data", "gateway-pool-manifest-mac.json")) || {};
  return [...new Set((manifest.workers || [])
    .filter((worker) => String(worker.provider || "openai-codex").trim() === "openai-codex")
    .map((worker) => String(worker.osUser || "").trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function candidateCodexHomes(options = {}) {
  if (Array.isArray(options.codexHomeCandidates) && options.codexHomeCandidates.length) {
    return options.codexHomeCandidates.map((item) => path.resolve(String(item || ""))).filter(Boolean);
  }
  const users = [
    process.env.SUDO_USER,
    process.env.LOGNAME,
    process.env.USER,
    os.userInfo?.().username,
  ]
    .map((item) => String(item || "").trim())
    .filter((item) => item && item !== "root");
  const homes = users.map((user) => path.join("/Users", user, ".codex"));
  const home = os.homedir();
  if (home && !home.includes("/var/root")) homes.push(path.join(home, ".codex"));
  return [...new Set(homes)];
}

function findReadableCodexHome(options = {}) {
  for (const codexHome of candidateCodexHomes(options)) {
    const authFile = path.join(codexHome, "auth.json");
    if (!fs.existsSync(authFile)) continue;
    const auth = readJson(authFile);
    if (auth?.tokens?.access_token && auth?.tokens?.refresh_token) {
      return { codexHome, auth };
    }
  }
  return { codexHome: "", auth: null };
}

function ensureSharedAuthDocument(sharedAuthRoot, options = {}) {
  const execute = Boolean(options.execute);
  const authFile = path.join(sharedAuthRoot, "auth.json");
  const lockFile = path.join(sharedAuthRoot, "auth.lock");
  const row = {
    type: "codex-shared-auth-document",
    action: execute ? "sync" : "plan",
    sharedAuthRoot: compactPath(sharedAuthRoot, options.root || ""),
    authExistsBefore: fs.existsSync(authFile),
    lockExistsBefore: fs.existsSync(lockFile),
    sourceCodexHome: "",
    updated: false,
    lockCreated: false,
    ok: true,
    error: "",
  };
  if (row.authExistsBefore && row.lockExistsBefore) return row;
  const source = findReadableCodexHome(options);
  row.sourceCodexHome = source.codexHome;
  if (!source.auth && !row.authExistsBefore) {
    row.ok = false;
    row.error = "operator_codex_auth_missing";
    return row;
  }
  if (!execute) return row;
  fs.mkdirSync(sharedAuthRoot, { recursive: true, mode: 0o700 });
  if (!row.authExistsBefore) {
    const target = {};
    const synced = syncOpenAiCodexAuthDoc(target, source.auth, {
      codexHome: source.codexHome,
      source: "operator-codex-home",
      activeProfileId: "",
    }, new Date().toISOString());
    writeJsonAtomic(authFile, synced.doc, 0o600);
    row.updated = true;
  }
  if (!fs.existsSync(lockFile)) {
    fs.writeFileSync(lockFile, "", { encoding: "utf8", mode: 0o600 });
    row.lockCreated = true;
  }
  return row;
}

function openAiProfileChecks(audit = {}) {
  return (audit.profileChecks || []).filter((check) => String(check.provider || "").trim() === "openai-codex");
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
  const documentRow = ensureSharedAuthDocument(sharedAuthRoot, Object.assign({}, options, { root }));
  const profileRows = [];
  const linkedFiles = ["auth.json", "auth.lock"].map((name) => path.join(sharedAuthRoot, name));
  for (const check of openAiProfileChecks(audit)) {
    const profile = String(check.profile || "").trim();
    const osUser = String(check.osUser || "").trim();
    const profileDir = compactToAbsolute(check.profileDir || "", root);
    if (!profile || !profileDir) continue;
    const row = {
      type: "codex-shared-auth-profile-link",
      action: execute ? "link" : "plan",
      profile,
      osUser,
      profileDir: compactPath(profileDir, root),
      linked: false,
      ok: true,
      error: "",
    };
    if (execute && documentRow.ok && linkedFiles.every((file) => fs.existsSync(file))) {
      try {
        fs.mkdirSync(profileDir, { recursive: true, mode: 0o700 });
        for (const name of ["auth.json", "auth.lock"]) {
          const target = path.join(profileDir, name);
          const source = path.join(sharedAuthRoot, name);
          fs.rmSync(target, { recursive: true, force: true });
          fs.symlinkSync(source, target);
          chownSymlink(target, osUser ? `${osUser}:staff` : "");
        }
        row.linked = true;
      } catch (err) {
        row.ok = false;
        row.error = String(err?.message || err).replace(/\s+/g, " ").slice(0, 160);
      }
    }
    profileRows.push(row);
  }
  const currentFiles = ["auth.json", "auth.lock"]
    .map((name) => path.join(sharedAuthRoot, name))
    .filter((file) => fs.existsSync(file));
  const row = {
    type: "codex-shared-auth-permissions",
    action: execute ? "repair" : "plan",
    sharedAuthRoot: compactPath(sharedAuthRoot, root),
    manifestPath: compactPath(manifestPath, root),
    userCount: users.length,
    fileCount: currentFiles.length,
    status: null,
    ok: true,
    error: "",
  };
  if (!documentRow.ok) {
    row.action = "skip";
    row.skipped = true;
    row.reason = documentRow.error;
    row.ok = false;
    return [documentRow, ...profileRows, row];
  }
  if (!fs.existsSync(manifestPath) || !fs.existsSync(sharedAuthRoot) || !users.length || !currentFiles.length) {
    row.action = "skip";
    row.skipped = true;
    row.reason = !fs.existsSync(manifestPath)
      ? "manifest_missing"
      : !fs.existsSync(sharedAuthRoot)
        ? "shared_auth_root_missing"
        : !users.length
          ? "openai_codex_manifest_users_missing"
          : "shared_auth_files_missing";
    row.ok = false;
    return [documentRow, ...profileRows, row];
  }
  if (!execute) return [documentRow, ...profileRows, row];

  const userBlock = users.join("\n");
  const fileBlock = currentFiles.map((file) => shQuote(file)).join(" ");
  const parentDirs = [
    path.dirname(root),
    root,
    path.join(root, "gateway-worker"),
    path.join(root, "gateway-worker", "telemetry"),
    path.join(root, "gateway-worker", "telemetry", "profiles"),
  ]
    .filter((dir) => fs.existsSync(dir))
    .map((dir) => shQuote(dir))
    .join(" ");
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
  for d in ${parentDirs || ":SKIP:"}; do
    [ "$d" = ":SKIP:" ] && continue
    /bin/chmod +a "user:$user allow search,readattr,readextattr,readsecurity" "$d" 2>/dev/null || true
  done
  /bin/chmod +a "user:$user allow list,add_file,search,delete_child,readattr,writeattr,readextattr,writeextattr,readsecurity,file_inherit,directory_inherit" "$shared" 2>/dev/null || true
  for profile_dir in "/Users/$user/HermesWorkspace/.hermes-gateway/profiles"/*; do
    [ -d "$profile_dir" ] || continue
    [ -L "$profile_dir/auth.json" ] || continue
    target="$(/bin/readlink "$profile_dir/auth.json" 2>/dev/null || true)"
    case "$target" in
      "$shared"/*)
        /bin/chmod +a# 0 "user:hermes-host allow list,add_file,search,delete_child,readattr,writeattr,readextattr,writeextattr,readsecurity" "$profile_dir" 2>/dev/null || true
        ;;
    esac
  done
  for f in ${fileBlock}; do
    [ -e "$f" ] || continue
    /bin/chmod +a "user:$user allow read,write,append,readattr,writeattr,readextattr,writeextattr,readsecurity" "$f" 2>/dev/null || true
    /usr/bin/sudo -n -u "$user" /bin/test -r "$f"
    /usr/bin/sudo -n -u "$user" /bin/test -w "$f"
  done
done <<USERS
${userBlock}
USERS
printf '{"ok":true,"userCount":%s,"fileCount":%s}\\n' ${users.length} ${currentFiles.length}
`;
  const result = runShell(script);
  row.status = result.status;
  row.stdout = String(result.stdout || "").slice(0, 400);
  row.stderr = String(result.stderr || "").slice(0, 400);
  row.ok = result.status === 0;
  if (!row.ok) row.error = "codex_shared_auth_permission_repair_failed";
  return [documentRow, ...profileRows, row];
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

function configKeyForFilePlugin(pluginName = "") {
  return String(pluginName || "").replace(/^hermes-mobile-/, "").replace(/[^a-z0-9_]+/gi, "_").toLowerCase() + "_plugin_enabled";
}

function ensureConfigPluginEnabled(configPath, pluginName) {
  const key = configKeyForFilePlugin(pluginName);
  let text = "";
  try {
    text = fs.readFileSync(configPath, "utf8");
  } catch (_) {
    return false;
  }
  const pattern = new RegExp(`^\\s*${key}\\s*:`, "m");
  if (pattern.test(text)) return false;
  fs.writeFileSync(configPath, `${text.replace(/\s*$/, "")}\n${key}: true\n`, "utf8");
  return true;
}

function missingFilePluginsForProfile(check = {}) {
  return (check.filePlugins || [])
    .filter((item) => item && item.complete === false)
    .map((item) => String(item.plugin || "").trim())
    .filter((item) => REQUIRED_PROFILE_FILE_PLUGINS.includes(item));
}

function reconcileGatewayProfileFilePlugins(audit, options = {}) {
  const root = path.resolve(options.root || "/Users/example/path");
  const execute = Boolean(options.execute);
  const appRoot = appRootFromOptions(options);
  const sourceRoot = path.join(appRoot, "gateway-plugins");
  const rows = [];
  for (const check of audit.profileChecks || []) {
    const missing = missingFilePluginsForProfile(check);
    if (!missing.length) continue;
    const profile = String(check.profile || "").trim();
    const osUser = String(check.osUser || "").trim();
    const profileDir = compactToAbsolute(check.profileDir || "", root);
    const row = {
      type: "gateway-profile-file-plugins",
      action: execute ? "sync" : "plan",
      profile,
      osUser,
      profileDir: compactPath(profileDir, root),
      pluginCount: missing.length,
      synced: [],
      ok: true,
      error: "",
    };
    if (execute) {
      try {
        const pluginRoot = path.join(profileDir, "plugins");
        fs.mkdirSync(pluginRoot, { recursive: true, mode: 0o700 });
        for (const pluginName of missing) {
          const source = path.join(sourceRoot, pluginName);
          const target = path.join(pluginRoot, pluginName);
          if (!fs.existsSync(path.join(source, "plugin.yaml")) || !fs.existsSync(path.join(source, "__init__.py"))) {
            throw new Error(`gateway_profile_plugin_source_missing:${pluginName}`);
          }
          fs.rmSync(target, { recursive: true, force: true });
          fs.cpSync(source, target, { recursive: true, force: true });
          chmodRecursive(target, 0o700);
          chownRecursive(target, osUser ? `${osUser}:staff` : "");
          ensureConfigPluginEnabled(path.join(profileDir, "config.yaml"), pluginName);
          row.synced.push(pluginName);
        }
      } catch (err) {
        row.ok = false;
        row.error = String(err?.message || err).replace(/\s+/g, " ").slice(0, 160);
      }
    }
    rows.push(row);
  }
  return rows;
}

function reconcileGatewayStartScriptEnvironment(options = {}) {
  const root = path.resolve(options.root || "/Users/example/path");
  const result = repairGatewayStartScripts({
    root,
    launchDaemonsDir: options.launchDaemonsDir || "/Library/LaunchDaemons",
    usersRoot: options.usersRoot,
    execute: Boolean(options.execute),
  });
  return [{
    type: "gateway-start-script-env",
    action: options.execute ? "repair" : "plan",
    scanned: result.scanned,
    changed: result.changed,
    written: result.written,
    ok: Boolean(result.ok),
    errors: (result.errors || []).slice(0, 20),
  }];
}

function reconcileGatewayTelemetryAccess(options = {}) {
  const root = path.resolve(options.root || "/Users/example/path");
  const result = repairGatewayTelemetry({
    root,
    manifest: path.join(root, "data", "gateway-pool-manifest-mac.json"),
    listenerUser: options.listenerUser || process.env.HERMES_MOBILE_LISTENER_USER || "hermes-host",
    write: Boolean(options.execute),
    grantListenerRead: Boolean(options.execute),
  });
  return [{
    type: "gateway-telemetry-access",
    action: options.execute ? "repair" : "plan",
    changed: Boolean(result.changed),
    wrote: Boolean(result.wrote),
    issueCount: (result.issues || []).length,
    warningCount: (result.warnings || []).length,
    ok: Boolean(result.ok),
    issues: (result.issues || []).slice(0, 20),
  }];
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
    ...reconcileGatewayProfileFilePlugins(audit, options),
    ...reconcileGatewayStartScriptEnvironment(options),
    ...reconcileGatewayTelemetryAccess(options),
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
      if (row.type === "codex-shared-auth-document") return row.ok !== false;
      if (row.type === "codex-shared-auth-profile-link") return row.ok !== false;
      if (row.type === "gateway-profile-file-plugins") return row.ok !== false;
      if (row.type === "gateway-start-script-env") return row.ok !== false;
      if (row.type === "gateway-telemetry-access") return row.ok !== false;
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
  reconcileGatewayProfileFilePlugins,
  reconcileGatewayStartScriptEnvironment,
  reconcileGatewayTelemetryAccess,
  reconcilePluginLocalBindings,
  reconcilePluginProvisioningStatuses,
  reconcileMusicRuntimeCoverPermissions,
  reconcileUntrackedGatewayLaunchd,
  runReconcile,
};
