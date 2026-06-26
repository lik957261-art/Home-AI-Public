"use strict";

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const out = {
    root: process.env.HERMES_MOBILE_ROOT || "/Users/example/path",
    app: "",
    plist: "/Library/LaunchDaemons/com.hermesmobile.cron.plist",
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") out.root = argv[++index] || out.root;
    else if (arg === "--app") out.app = argv[++index] || out.app;
    else if (arg === "--plist") out.plist = argv[++index] || out.plist;
    else if (arg === "--json") out.json = true;
    else if (arg === "--help") {
      console.log("Usage: node scripts/macos-automation-cron-launchd-smoke.js --root <mac-root> --json");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  out.root = path.resolve(out.root);
  out.app = path.resolve(out.app || path.join(out.root, "app"));
  return out;
}

function readPlist(plistPath) {
  const result = childProcess.spawnSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", plistPath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`plist_read_failed:${result.stderr || result.stdout || result.status}`);
  }
  return JSON.parse(result.stdout);
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function fileExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch (_) {
    return false;
  }
}

function addIssue(issues, code, detail = {}) {
  issues.push({ code, detail });
}

function buildReport(options = {}) {
  const root = path.resolve(options.root || "/Users/example/path");
  const app = path.resolve(options.app || path.join(root, "app"));
  const plist = options.plistObject || readPlist(options.plist || "/Library/LaunchDaemons/com.hermesmobile.cron.plist");
  const env = plist.EnvironmentVariables || {};
  const args = Array.isArray(plist.ProgramArguments) ? plist.ProgramArguments : [];
  const issues = [];
  const expected = {
    user: "hermes-host",
    jobsPath: path.join(root, "data", "hermes-home", "cron", "jobs.json"),
    outputRoot: path.join(root, "data", "hermes-home", "cron", "output"),
    dispatcher: path.join(app, "scripts", "hermes-mobile-cron-dispatcher.py"),
    dataScript: path.join(root, "data", "hermes-home", "scripts", "homeai-disaster-backup-cron.sh"),
    appScript: path.join(app, "scripts", "homeai-disaster-backup-cron.sh"),
  };

  if (plist.Label !== "com.hermesmobile.cron") addIssue(issues, "cron_launchd_label_unexpected", { label: plist.Label || "" });
  if (plist.UserName !== expected.user) addIssue(issues, "cron_launchd_user_unexpected", { user: plist.UserName || "" });
  if (!args.includes(expected.dispatcher) || !args.includes("--dispatch")) {
    addIssue(issues, "cron_launchd_dispatcher_unexpected", { argumentCount: args.length });
  }
  if (env.HERMES_WEB_CRON_JOBS_PATH !== expected.jobsPath) addIssue(issues, "cron_launchd_jobs_path_unexpected");
  if (env.HERMES_WEB_CRON_OUTPUT_ROOT !== expected.outputRoot) addIssue(issues, "cron_launchd_output_root_unexpected");
  if (!String(env.PYTHONPATH || "").includes(path.join(app, "gateway-runtime-overrides"))) addIssue(issues, "cron_launchd_pythonpath_missing_overrides");
  if (!String(env.PYTHONPATH || "").includes(path.join(root, "runtime", "hermes-agent-official", "source"))) addIssue(issues, "cron_launchd_pythonpath_missing_official_source");
  if (Number.parseInt(String(env.HERMES_CRON_SCRIPT_TIMEOUT || "0"), 10) < 1800) addIssue(issues, "cron_launchd_script_timeout_too_low");
  if (!String(env.HOMEAI_DISASTER_BACKUP_TRANSPORT || "").trim()) addIssue(issues, "cron_launchd_backup_transport_missing");
  if (String(env.HOMEAI_DISASTER_BACKUP_TRANSPORT || "auto") === "auto") {
    if (!String(env.HOMEAI_DISASTER_BACKUP_SSH_TARGET || "").trim()) addIssue(issues, "cron_launchd_backup_ssh_target_missing");
    if (!String(env.HOMEAI_DISASTER_BACKUP_SSH_DESTINATION || "").trim()) addIssue(issues, "cron_launchd_backup_ssh_destination_missing");
  }
  if (!fileExecutable(expected.dataScript)) addIssue(issues, "cron_launchd_data_script_not_executable");
  try {
    if (sha256(expected.appScript) !== sha256(expected.dataScript)) addIssue(issues, "cron_launchd_data_script_drift");
  } catch (err) {
    addIssue(issues, "cron_launchd_data_script_hash_failed", { detail: err && err.code ? err.code : "hash_failed" });
  }

  return {
    ok: issues.length === 0,
    schemaVersion: 1,
    label: plist.Label || "",
    user: plist.UserName || "",
    programArgumentCount: args.length,
    hasDispatchFlag: args.includes("--dispatch"),
    jobsPathOk: env.HERMES_WEB_CRON_JOBS_PATH === expected.jobsPath,
    outputRootOk: env.HERMES_WEB_CRON_OUTPUT_ROOT === expected.outputRoot,
    scriptTimeoutSeconds: Number.parseInt(String(env.HERMES_CRON_SCRIPT_TIMEOUT || "0"), 10) || 0,
    backupTransport: String(env.HOMEAI_DISASTER_BACKUP_TRANSPORT || ""),
    backupSshConfigured: Boolean(env.HOMEAI_DISASTER_BACKUP_SSH_TARGET && env.HOMEAI_DISASTER_BACKUP_SSH_DESTINATION),
    dataScriptExecutable: fileExecutable(expected.dataScript),
    issues,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildReport(options);
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else console.log(`automation cron launchd smoke: ok=${report.ok} issues=${report.issues.length}`);
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = {
  buildReport,
  parseArgs,
};
