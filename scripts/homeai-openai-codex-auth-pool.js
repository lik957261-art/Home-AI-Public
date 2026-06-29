#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  importCodexHomeCredential,
  publicSummary,
  rotateAfterUsageLimit,
} = require("../adapters/openai-codex-shared-auth-pool-service");

const DEFAULT_MAC_ROOT = "/Users/example/path";
const DEFAULT_LAUNCH_DAEMONS_DIR = "/Library/LaunchDaemons";
const GATEWAY_LABEL_PREFIX = "com.hermesmobile.gateway.";

function cleanString(value) {
  return String(value || "").trim();
}

function parseArgs(argv) {
  const out = {
    root: process.env.HERMES_MOBILE_MAC_ROOT || DEFAULT_MAC_ROOT,
    sharedAuthFile: "",
    backupDir: "",
    importCodexHome: "",
    profileId: "",
    label: "",
    makeActive: false,
    rotateOnLimit: false,
    restartGateways: false,
    launchDaemonsDir: DEFAULT_LAUNCH_DAEMONS_DIR,
    passwordFile: process.env.HOMEAI_MAC_SUDO_PASSWORD_FILE || "",
    execute: false,
    json: false,
    privilegedChild: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") out.root = argv[++index] || out.root;
    else if (arg === "--shared-auth-file") out.sharedAuthFile = argv[++index] || "";
    else if (arg === "--backup-dir") out.backupDir = argv[++index] || "";
    else if (arg === "--import-codex-home") out.importCodexHome = argv[++index] || "";
    else if (arg === "--profile-id") out.profileId = argv[++index] || "";
    else if (arg === "--label") out.label = argv[++index] || "";
    else if (arg === "--make-active") out.makeActive = true;
    else if (arg === "--rotate-on-limit") out.rotateOnLimit = true;
    else if (arg === "--restart-gateways") out.restartGateways = true;
    else if (arg === "--launch-daemons-dir") out.launchDaemonsDir = argv[++index] || out.launchDaemonsDir;
    else if (arg === "--password-file") out.passwordFile = argv[++index] || "";
    else if (arg === "--execute") out.execute = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--privileged-child") out.privilegedChild = true;
    else if (arg === "--help") {
      console.log([
        "Usage:",
        "  node scripts/homeai-openai-codex-auth-pool.js --json",
        "  node scripts/homeai-openai-codex-auth-pool.js --import-codex-home /Users/example/path --profile-id homeai-default --make-active --execute --json",
        "  node scripts/homeai-openai-codex-auth-pool.js --rotate-on-limit --restart-gateways --execute --json",
        "",
        "Manages Home AI's own OpenAI-Codex shared-auth credential pool.",
        "It never follows the current Codex active profile unless that home is explicitly passed.",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  out.root = path.resolve(out.root);
  if (!out.sharedAuthFile) out.sharedAuthFile = path.join(out.root, "gateway-worker", "telemetry", "profiles", "shared-auth", "auth.json");
  if (!out.backupDir) out.backupDir = path.join(out.root, "backups", "auth-repair");
  return out;
}

function isRootProcess() {
  return typeof process.getuid === "function" && process.getuid() === 0;
}

function readPassword(filePath = "") {
  if (!filePath) return "";
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).find((line) => line.trim()) || "";
}

function sanitizedChildArgs(argv = []) {
  const out = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--password-file") {
      index += 1;
      continue;
    }
    if (arg === "--privileged-child") continue;
    out.push(arg);
  }
  out.push("--privileged-child");
  return out;
}

function runPrivilegedSelf(options, argv = process.argv.slice(2)) {
  const password = readPassword(options.passwordFile);
  const sudoArgs = password
    ? ["-S", "-p", "", process.execPath, __filename, ...sanitizedChildArgs(argv)]
    : ["-n", process.execPath, __filename, ...sanitizedChildArgs(argv)];
  const result = spawnSync("/usr/bin/sudo", sudoArgs, {
    input: password ? `${password}\n` : "",
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const err = new Error(password ? "sudo_authentication_failed" : "sudo_authentication_required");
    err.status = result.status;
    throw err;
  }
  return result;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, value) {
  let currentStat = null;
  try { currentStat = fs.statSync(filePath); } catch (_) {}
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: currentStat ? currentStat.mode & 0o777 : 0o600 });
  if (currentStat) {
    try { fs.chownSync(tmp, currentStat.uid, currentStat.gid); } catch (_) {}
    try { fs.chmodSync(tmp, currentStat.mode & 0o777); } catch (_) {}
  }
  fs.renameSync(tmp, filePath);
  if (currentStat) {
    try { fs.chownSync(filePath, currentStat.uid, currentStat.gid); } catch (_) {}
    try { fs.chmodSync(filePath, currentStat.mode & 0o777); } catch (_) {}
  }
}

function gatewayLaunchdLabels(launchDaemonsDir = DEFAULT_LAUNCH_DAEMONS_DIR) {
  let entries = [];
  try {
    entries = fs.readdirSync(launchDaemonsDir, { withFileTypes: true });
  } catch (_) {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.startsWith(GATEWAY_LABEL_PREFIX) && name.endsWith(".plist"))
    .map((name) => name.slice(0, -".plist".length))
    .sort();
}

function launchdState(stdout = "") {
  const match = String(stdout || "").match(/\bstate\s*=\s*([^\n]+)/);
  return match ? match[1].trim().toLowerCase() : "";
}

function restartRunningGatewayLaunchDaemons(options = {}) {
  const run = options.spawnSync || spawnSync;
  const labels = gatewayLaunchdLabels(options.launchDaemonsDir);
  const restarted = [];
  const skipped = [];
  const failures = [];
  for (const label of labels) {
    const printResult = run("/bin/launchctl", ["print", `system/${label}`], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    if (printResult.status !== 0) {
      skipped.push({ label, reason: "not_loaded" });
      continue;
    }
    const state = launchdState(printResult.stdout);
    if (state !== "running") {
      skipped.push({ label, reason: state ? `state_${state}` : "state_unknown" });
      continue;
    }
    const kickstartResult = run("/bin/launchctl", ["kickstart", "-k", `system/${label}`], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    if (kickstartResult.status !== 0) {
      failures.push({ label, error: "launchctl_kickstart_failed", status: kickstartResult.status });
      continue;
    }
    restarted.push({ label });
  }
  return {
    ok: failures.length === 0,
    scanned: labels.length,
    restartedCount: restarted.length,
    skippedCount: skipped.length,
    failureCount: failures.length,
    restarted,
    skipped: skipped.slice(0, 10),
    failures,
  };
}

function backupSharedAuth(options, now) {
  fs.mkdirSync(options.backupDir, { recursive: true, mode: 0o700 });
  const backupPath = path.join(options.backupDir, `${now.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}-openai-codex-homeai-auth-pool.json`);
  fs.copyFileSync(options.sharedAuthFile, backupPath);
  fs.chmodSync(backupPath, 0o600);
  return backupPath;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.execute && !options.privilegedChild && !isRootProcess()) {
    const result = runPrivilegedSelf(options);
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr && !options.json) process.stderr.write(result.stderr);
    process.exit(result.status || 0);
  }
  const now = new Date().toISOString();
  let doc = readJson(options.sharedAuthFile);
  let result = { changed: false, doc, summary: publicSummary(doc) };
  if (options.importCodexHome) {
    const sourceAuth = readJson(path.join(path.resolve(options.importCodexHome), "auth.json"));
    result = importCodexHomeCredential(doc, sourceAuth, {
      importedFrom: path.resolve(options.importCodexHome),
      label: options.label,
      makeActive: options.makeActive,
      nowIso: now,
      profileId: options.profileId,
    });
    doc = result.doc;
  }
  if (options.rotateOnLimit) {
    result = rotateAfterUsageLimit(doc, { nowIso: now });
    doc = result.doc;
  }
  let backupPath = "";
  if (options.execute && result.changed) {
    backupPath = backupSharedAuth(options, now);
    writeJsonAtomic(options.sharedAuthFile, doc);
  }
  const gatewayRestart = options.execute && options.restartGateways && (result.rotated || (result.imported && options.makeActive))
    ? restartRunningGatewayLaunchDaemons({ launchDaemonsDir: options.launchDaemonsDir })
    : null;
  const payload = {
    ok: !gatewayRestart || gatewayRestart.ok,
    mode: options.execute ? "execute" : "plan",
    changed: Boolean(result.changed),
    rotated: Boolean(result.rotated),
    imported: Boolean(result.imported),
    reason: result.reason || "",
    backupPath,
    sharedAuthFile: options.sharedAuthFile,
    summary: result.summary || publicSummary(doc),
    gatewayRestart,
  };
  if (!payload.ok) payload.error = "gateway_restart_failed";
  if (options.json || !options.execute) console.log(JSON.stringify(payload, null, 2));
  else console.log(payload.ok ? "homeai openai-codex auth pool updated" : "homeai openai-codex auth pool update failed");
  if (!payload.ok) process.exit(1);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }, null, 2));
    process.exit(1);
  }
}

module.exports = {
  gatewayLaunchdLabels,
  launchdState,
  parseArgs,
  restartRunningGatewayLaunchDaemons,
  sanitizedChildArgs,
};
