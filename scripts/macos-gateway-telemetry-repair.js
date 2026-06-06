"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_ROOT = "/Users/hermes-host/HermesMobile";
const DEFAULT_LISTENER_USER = "hermes-host";

function parseArgs(argv) {
  const out = {
    root: process.env.HERMES_MOBILE_ROOT || DEFAULT_ROOT,
    manifest: "",
    listenerUser: process.env.HERMES_MOBILE_LISTENER_USER || DEFAULT_LISTENER_USER,
    write: false,
    grantListenerRead: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") out.root = argv[++index] || out.root;
    else if (arg === "--manifest") out.manifest = argv[++index] || out.manifest;
    else if (arg === "--listener-user") out.listenerUser = argv[++index] || out.listenerUser;
    else if (arg === "--write") out.write = true;
    else if (arg === "--grant-listener-read") out.grantListenerRead = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--help") {
      console.log([
        "Usage: node scripts/macos-gateway-telemetry-repair.js [options]",
        "  --root <dir>              Mac production root, default /Users/hermes-host/HermesMobile",
        "  --manifest <file>         Gateway Pool manifest, default <root>/data/gateway-pool-manifest-mac.json",
        "  --listener-user <user>    Hermes Mobile listener user, default hermes-host",
        "  --write                   Write manifest telemetry paths after creating a backup",
        "  --grant-listener-read     Add read-only ACLs for the listener user on profile DB paths",
        "  --json                    Print bounded JSON metadata",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!out.manifest) out.manifest = path.join(out.root, "data", "gateway-pool-manifest-mac.json");
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function exists(file) {
  try {
    return fs.existsSync(file);
  } catch (_) {
    return false;
  }
}

function compactPath(value, root) {
  return String(value || "").replaceAll(root, "<root>");
}

function workerWorkspaceIds(worker = {}) {
  const out = new Set();
  for (const key of ["allowedWorkspaceIds", "allowed_workspace_ids", "skillWorkspaceIds", "skill_workspace_ids"]) {
    const values = Array.isArray(worker[key]) ? worker[key] : [];
    for (const item of values) {
      const text = String(item || "").trim();
      if (text && text !== "*") out.add(text);
    }
  }
  return [...out];
}

function osUserForWorker(worker = {}) {
  const explicit = String(worker.osUser || worker.os_user || worker.runAsUser || worker.run_as_user || "").trim();
  if (explicit) return explicit;
  const label = String(worker.launchdLabel || worker.launchd_label || "").trim();
  const match = label.match(/com\.hermesmobile\.gateway\.(hm-[a-z0-9-]+)\./i);
  if (match) return match[1];
  const workspace = workerWorkspaceIds(worker)[0] || "owner";
  if (workspace === "owner") return "hm-owner";
  if (workspace === "weixin_wuping") return "hm-wuping";
  if (workspace === "weixin_stephen") return "hm-stephen";
  if (workspace === "weixin_test_1") return "hm-test";
  if (workspace === "user-981731fe") return "hm-xuyan";
  if (workspace === "user-a87aaa61") return "hm-xulu";
  return "";
}

function profileName(worker = {}) {
  return String(worker.profile || worker.name || "").trim();
}

function profileDirForWorker(worker = {}) {
  const profile = profileName(worker);
  const osUser = osUserForWorker(worker);
  if (!profile || !osUser) return "";
  return path.posix.join("/Users", osUser, "HermesWorkspace", ".hermes-gateway", "profiles", profile);
}

function telemetryPathsForWorker(worker = {}) {
  const directState = String(worker.telemetryStateDbPath || worker.telemetry_state_db_path || worker.stateDbPath || worker.state_db_path || "").trim();
  const directResponse = String(worker.telemetryResponseStoreDbPath || worker.telemetry_response_store_db_path || worker.responseStoreDbPath || worker.response_store_db_path || "").trim();
  const profileDir = profileDirForWorker(worker);
  return {
    profileDir,
    stateDbPath: directState || (profileDir ? path.posix.join(profileDir, "state.db") : ""),
    responseStoreDbPath: directResponse || (profileDir ? path.posix.join(profileDir, "response_store.db") : ""),
  };
}

function backupPath(file) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${file}.${stamp}.bak`;
}

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function chmodAcl(target, listenerUser, permissions) {
  if (process.platform !== "darwin") return { ok: true, skipped: true };
  const acl = `${listenerUser} allow ${permissions}`;
  const result = run("chmod", ["+a", acl, target]);
  return {
    ok: result.status === 0,
    status: result.status,
    stderr: String(result.stderr || "").trim().slice(-300),
  };
}

function ensureListenerAclForProfile(profileDir, listenerUser) {
  const touched = [];
  const dirs = [
    path.posix.dirname(path.posix.dirname(path.posix.dirname(path.posix.dirname(profileDir)))),
    path.posix.dirname(path.posix.dirname(path.posix.dirname(profileDir))),
    path.posix.dirname(path.posix.dirname(profileDir)),
    path.posix.dirname(profileDir),
    profileDir,
  ];
  const uniqueDirs = [...new Set(dirs.filter(Boolean))];
  for (const dir of uniqueDirs) {
    if (!exists(dir)) continue;
    const isProfileDir = dir === profileDir;
    const permissions = isProfileDir
      ? "list,search,readattr,readextattr,readsecurity,file_inherit,directory_inherit"
      : "search,readattr,readextattr,readsecurity";
    const result = chmodAcl(dir, listenerUser, permissions);
    touched.push({ path: dir, type: "dir", result });
  }
  for (const file of [
    path.posix.join(profileDir, "state.db"),
    path.posix.join(profileDir, "state.db-wal"),
    path.posix.join(profileDir, "state.db-shm"),
    path.posix.join(profileDir, "response_store.db"),
    path.posix.join(profileDir, "response_store.db-wal"),
    path.posix.join(profileDir, "response_store.db-shm"),
  ]) {
    if (!exists(file)) continue;
    const result = chmodAcl(file, listenerUser, "read,readattr,readextattr,readsecurity");
    touched.push({ path: file, type: "file", result });
  }
  return touched;
}

function listenerCanRead(file, listenerUser) {
  if (!file) return false;
  if (process.platform === "darwin" && listenerUser) {
    const result = run("sudo", ["-u", listenerUser, "test", "-r", file]);
    return result.status === 0;
  }
  try {
    fs.accessSync(file, fs.constants.R_OK);
    return true;
  } catch (_) {
    return false;
  }
}

function repair(options) {
  const manifest = readJson(options.manifest);
  const workers = Array.isArray(manifest.workers) ? manifest.workers : [];
  const rows = [];
  let changed = false;
  for (const worker of workers) {
    const profile = profileName(worker);
    const paths = telemetryPathsForWorker(worker);
    const before = {
      stateDbPath: String(worker.telemetryStateDbPath || worker.telemetry_state_db_path || ""),
      responseStoreDbPath: String(worker.telemetryResponseStoreDbPath || worker.telemetry_response_store_db_path || ""),
    };
    if (paths.stateDbPath && before.stateDbPath !== paths.stateDbPath) {
      worker.telemetryStateDbPath = paths.stateDbPath;
      changed = true;
    }
    if (paths.responseStoreDbPath && before.responseStoreDbPath !== paths.responseStoreDbPath) {
      worker.telemetryResponseStoreDbPath = paths.responseStoreDbPath;
      changed = true;
    }
    const aclChanges = options.grantListenerRead && paths.profileDir
      ? ensureListenerAclForProfile(paths.profileDir, options.listenerUser)
      : [];
    rows.push({
      profile,
      osUser: osUserForWorker(worker),
      profileDir: compactPath(paths.profileDir, options.root),
      stateExists: exists(paths.stateDbPath),
      responseExists: exists(paths.responseStoreDbPath),
      listenerCanReadState: listenerCanRead(paths.stateDbPath, options.listenerUser),
      listenerCanReadResponse: listenerCanRead(paths.responseStoreDbPath, options.listenerUser),
      manifestHadStatePath: Boolean(before.stateDbPath),
      manifestHadResponsePath: Boolean(before.responseStoreDbPath),
      aclTouchCount: aclChanges.length,
      aclFailures: aclChanges
        .filter((item) => item.result && item.result.ok === false)
        .map((item) => ({ type: item.type, path: compactPath(item.path, options.root), stderr: item.result.stderr })),
    });
  }
  let backup = "";
  if (changed && options.write) {
    backup = backupPath(options.manifest);
    fs.copyFileSync(options.manifest, backup);
    writeJson(options.manifest, manifest);
  }
  const issues = [];
  const warnings = [];
  for (const row of rows) {
    if (!row.profile) issues.push("telemetry_profile_missing");
    if (!row.stateExists) warnings.push(`telemetry_state_db_missing:${row.profile}`);
    if (!row.responseExists) warnings.push(`telemetry_response_store_missing:${row.profile}`);
    if (row.stateExists && !row.listenerCanReadState) issues.push(`telemetry_state_db_unreadable:${row.profile}`);
    if (row.responseExists && !row.listenerCanReadResponse) issues.push(`telemetry_response_store_unreadable:${row.profile}`);
    for (const failure of row.aclFailures) issues.push(`telemetry_acl_failed:${row.profile}:${failure.type}`);
  }
  return {
    ok: issues.length === 0,
    changed,
    wrote: Boolean(changed && options.write),
    backup: backup ? compactPath(backup, options.root) : "",
    manifest: compactPath(options.manifest, options.root),
    listenerUser: options.listenerUser,
    rows,
    issues,
    warnings,
  };
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  const result = repair(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`macos_gateway_telemetry_repair ok=${result.ok} changed=${result.changed} wrote=${result.wrote} issues=${result.issues.length} warnings=${result.warnings.length}`);
    if (result.backup) console.log(`backup ${result.backup}`);
    for (const issue of result.issues) console.log(`issue ${issue}`);
    for (const warning of result.warnings) console.log(`warning ${warning}`);
  }
  if (!result.ok) process.exit(1);
}

module.exports = {
  osUserForWorker,
  parseArgs,
  repair,
  telemetryPathsForWorker,
};
