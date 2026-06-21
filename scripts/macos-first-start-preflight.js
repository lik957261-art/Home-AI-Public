"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_ROOT = "/Users/example/path";
const DEFAULT_BASE = "http://127.0.0.1:8797";

const REQUIRED_SOURCE_FILES = [
  "scripts/production-status-smoke.js",
  "scripts/macos-production-profile-audit.js",
  "scripts/macos-production-drift-reconcile.js",
  "scripts/homeai-production-drift-audit-watchdog.sh",
  "scripts/macos-worker-filesystem-access-harness.js",
  "scripts/macos-gateway-manifest-toolset-smoke.js",
  "scripts/macos-plugin-directory-production-smoke.js",
  "scripts/macos-bound-directory-preview-smoke.js",
  "scripts/macos-production-closure-validation.js",
  "scripts/production-self-diagnostics.js",
];

const FOLLOW_UP_DIAGNOSTICS = [
  {
    id: "status-smoke",
    command: "<node> <app>/scripts/production-status-smoke.js --access-key-file <owner-key-file> --base <base> --json",
  },
  {
    id: "profile-audit",
    command: "sudo <node> <app>/scripts/macos-production-profile-audit.js --root <root> --json",
  },
  {
    id: "worker-filesystem-access",
    command: "sudo <node> <app>/scripts/macos-worker-filesystem-access-harness.js --root <root> --json",
  },
  {
    id: "production-closure",
    command: "sudo <node> <app>/scripts/macos-production-closure-validation.js --root <root> --json",
  },
];

const DEFAULT_BUSINESS_PLUGIN_IDS = Object.freeze([
  "email",
  "finance",
  "growth",
  "health",
  "note",
  "wardrobe",
]);

function parseArgs(argv = []) {
  const out = {
    root: process.env.HERMES_MOBILE_ROOT || DEFAULT_ROOT,
    app: "",
    node: "",
    base: process.env.HERMES_MOBILE_SMOKE_BASE || DEFAULT_BASE,
    ownerKeyFile: "",
    manifest: "",
    launchdDir: process.env.HOMEAI_LAUNCH_DAEMONS_DIR || "/Library/LaunchDaemons",
    networkMode: process.env.HERMES_MOBILE_NETWORK_MODE || "",
    sourceOnly: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") out.root = argv[++index] || out.root;
    else if (arg === "--app") out.app = argv[++index] || out.app;
    else if (arg === "--node") out.node = argv[++index] || out.node;
    else if (arg === "--base") out.base = argv[++index] || out.base;
    else if (arg === "--owner-key-file") out.ownerKeyFile = argv[++index] || out.ownerKeyFile;
    else if (arg === "--manifest") out.manifest = argv[++index] || out.manifest;
    else if (arg === "--launchd-dir") out.launchdDir = argv[++index] || out.launchdDir;
    else if (arg === "--network-mode") out.networkMode = argv[++index] || out.networkMode;
    else if (arg === "--source-only") out.sourceOnly = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--help") {
      process.stdout.write([
        "Usage: node scripts/macos-first-start-preflight.js [--source-only] [--root <path>] [--network-mode direct|proxy] [--json]",
        "  Read-only first-start preflight for a Home AI macOS production install.",
        "  Source-only mode verifies required diagnostic scripts without inspecting a host.",
      ].join("\n") + "\n");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  out.root = path.resolve(out.root || DEFAULT_ROOT);
  out.app = path.resolve(out.app || path.join(out.root, "app"));
  out.node = path.resolve(out.node || path.join(out.root, "runtime", "node-current", "bin", "node"));
  out.base = String(out.base || DEFAULT_BASE).replace(/\/+$/, "");
  out.ownerKeyFile = path.resolve(out.ownerKeyFile || path.join(out.root, "data", "secrets", "owner-web-key.secret"));
  out.manifest = path.resolve(out.manifest || path.join(out.root, "data", "gateway-pool-manifest-mac.json"));
  out.launchdDir = path.resolve(out.launchdDir || "/Library/LaunchDaemons");
  out.networkMode = String(out.networkMode || "").trim().toLowerCase();
  return out;
}

function pathStatus(filePath) {
  try {
    fs.statSync(filePath);
    return "exists";
  } catch (err) {
    if (err && err.code === "EACCES") return "unreadable";
    if (err && err.code === "ENOENT") return "missing";
    return "error";
  }
}

function fileExists(filePath) {
  try {
    return pathStatus(filePath) === "exists";
  } catch {
    return false;
  }
}

function isExecutable(stat) {
  return Boolean(stat.mode & 0o111);
}

function modeOctal(stat) {
  return `0${(stat.mode & 0o777).toString(8).padStart(3, "0")}`;
}

function checkRequiredSourceFiles(repoRoot, issues) {
  for (const relativePath of REQUIRED_SOURCE_FILES) {
    if (!fileExists(path.join(repoRoot, relativePath))) {
      issues.push({ code: "first_start_required_source_missing", path: relativePath });
    }
  }
}

function checkOwnerKey(options, issues) {
  const status = pathStatus(options.ownerKeyFile);
  if (status === "missing") {
    issues.push({ code: "owner_key_file_missing", path: "<owner-key-file>" });
    return;
  }
  if (status !== "exists") {
    issues.push({ code: "owner_key_file_unreadable", path: "<owner-key-file>" });
    return;
  }
  let stat;
  let text = "";
  try {
    stat = fs.statSync(options.ownerKeyFile);
    text = fs.readFileSync(options.ownerKeyFile, "utf8");
  } catch (_err) {
    issues.push({ code: "owner_key_file_unreadable", path: "<owner-key-file>" });
    return;
  }
  if (!text.split(/\r?\n/).some((line) => line.trim())) {
    issues.push({ code: "owner_key_file_empty", path: "<owner-key-file>" });
  }
  if ((stat.mode & 0o077) !== 0) {
    issues.push({ code: "owner_key_file_mode_too_open", mode: modeOctal(stat), path: "<owner-key-file>" });
  }
}

function readTextIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (err) {
    return null;
  }
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_err) {
    return null;
  }
}

function checkPluginWorkspaceProvisioningPlan(options, issues) {
  const planPath = path.join(options.root, "data", "plugin-workspace-provisioning-plan.json");
  const status = pathStatus(planPath);
  if (status === "missing") {
    issues.push({ code: "plugin_workspace_provisioning_plan_missing", path: "<root>/data/plugin-workspace-provisioning-plan.json" });
    return;
  }
  if (status !== "exists") {
    issues.push({ code: "plugin_workspace_provisioning_plan_unreadable", path: "<root>/data/plugin-workspace-provisioning-plan.json" });
    return;
  }
  const plan = readJsonIfExists(planPath);
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    issues.push({ code: "plugin_workspace_provisioning_plan_invalid_json", path: "<root>/data/plugin-workspace-provisioning-plan.json" });
    return;
  }
  if (plan.schemaVersion !== 1) {
    issues.push({ code: "plugin_workspace_provisioning_plan_schema_invalid", path: "<root>/data/plugin-workspace-provisioning-plan.json" });
  }
  if (String(plan.generatedBy || "") !== "install-macos-production plan-plugin-workspace-provisioning") {
    issues.push({ code: "plugin_workspace_provisioning_plan_generator_invalid", path: "<root>/data/plugin-workspace-provisioning-plan.json" });
  }
  if (plan.createsPluginKeys !== false) {
    issues.push({ code: "plugin_workspace_provisioning_plan_creates_keys_unexpected", path: "<root>/data/plugin-workspace-provisioning-plan.json" });
  }
  if (plan.createsWorkspaceGrants !== false) {
    issues.push({ code: "plugin_workspace_provisioning_plan_creates_grants_unexpected", path: "<root>/data/plugin-workspace-provisioning-plan.json" });
  }
  if (plan.callsPluginBindEndpoints !== false) {
    issues.push({ code: "plugin_workspace_provisioning_plan_calls_bind_unexpected", path: "<root>/data/plugin-workspace-provisioning-plan.json" });
  }
  const pluginIds = Array.isArray(plan.defaultBusinessPluginIds)
    ? plan.defaultBusinessPluginIds.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  for (const pluginId of DEFAULT_BUSINESS_PLUGIN_IDS) {
    if (!pluginIds.includes(pluginId)) {
      issues.push({ code: "plugin_workspace_provisioning_plan_default_plugin_missing", pluginId });
    }
  }
  const workspaces = Array.isArray(plan.workspaces) ? plan.workspaces : [];
  if (!workspaces.length) {
    issues.push({ code: "plugin_workspace_provisioning_plan_workspaces_empty", path: "<root>/data/plugin-workspace-provisioning-plan.json" });
  }
  for (const workspace of workspaces) {
    const workspaceId = String(workspace?.workspaceId || "").trim();
    if (!workspaceId) {
      issues.push({ code: "plugin_workspace_provisioning_plan_workspace_id_missing" });
      continue;
    }
    const plugins = Array.isArray(workspace.plugins) ? workspace.plugins : [];
    if (!plugins.length) {
      issues.push({ code: "plugin_workspace_provisioning_plan_workspace_plugins_empty", workspaceId });
      continue;
    }
    for (const pluginId of DEFAULT_BUSINESS_PLUGIN_IDS) {
      if (!plugins.some((plugin) => String(plugin?.pluginId || "").trim() === pluginId)) {
        issues.push({ code: "plugin_workspace_provisioning_plan_workspace_plugin_missing", workspaceId, pluginId });
      }
    }
  }
}

function checkExecutableFile(filePath, codePrefix, issues, compactPath) {
  const status = pathStatus(filePath);
  if (status === "missing") {
    issues.push({ code: `${codePrefix}_missing`, path: compactPath });
    return;
  }
  if (status !== "exists") {
    issues.push({ code: `${codePrefix}_unreadable`, path: compactPath });
    return;
  }
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      issues.push({ code: `${codePrefix}_not_file`, path: compactPath });
    } else if (!isExecutable(stat)) {
      issues.push({ code: `${codePrefix}_not_executable`, path: compactPath, mode: modeOctal(stat) });
    }
  } catch (_err) {
    issues.push({ code: `${codePrefix}_unreadable`, path: compactPath });
  }
}

function checkProductionDriftWatchdog(options, issues) {
  const appReconcile = path.join(options.app, "scripts", "macos-production-drift-reconcile.js");
  const appWatchdog = path.join(options.app, "scripts", "homeai-production-drift-audit-watchdog.sh");
  const hermesWatchdog = path.join(options.root, "data", "hermes-home", "scripts", "homeai-production-drift-audit-watchdog.sh");
  const driftOutputDir = path.join(options.root, "data", "production-drift-audit");
  const driftPlist = path.join(options.launchdDir, "com.hermesmobile.production-drift-audit.plist");

  const appReconcileStatus = pathStatus(appReconcile);
  if (appReconcileStatus === "missing") issues.push({ code: "production_drift_reconcile_script_missing", path: "<app>/scripts/macos-production-drift-reconcile.js" });
  else if (appReconcileStatus !== "exists") issues.push({ code: "production_drift_reconcile_script_unreadable", path: "<app>/scripts/macos-production-drift-reconcile.js" });

  const appWatchdogStatus = pathStatus(appWatchdog);
  if (appWatchdogStatus === "missing") issues.push({ code: "production_drift_app_watchdog_script_missing", path: "<app>/scripts/homeai-production-drift-audit-watchdog.sh" });
  else if (appWatchdogStatus !== "exists") issues.push({ code: "production_drift_app_watchdog_script_unreadable", path: "<app>/scripts/homeai-production-drift-audit-watchdog.sh" });
  checkExecutableFile(hermesWatchdog, "production_drift_installed_watchdog_script", issues, "<root>/data/hermes-home/scripts/homeai-production-drift-audit-watchdog.sh");

  const outputStatus = pathStatus(driftOutputDir);
  if (outputStatus === "missing") issues.push({ code: "production_drift_output_dir_missing", path: "<root>/data/production-drift-audit" });
  else if (outputStatus !== "exists") issues.push({ code: "production_drift_output_dir_unreadable", path: "<root>/data/production-drift-audit" });

  const plistStatus = pathStatus(driftPlist);
  if (plistStatus === "missing") {
    issues.push({ code: "production_drift_launchd_plist_missing", path: "<launchd-dir>/com.hermesmobile.production-drift-audit.plist" });
    return;
  }
  if (plistStatus !== "exists") {
    issues.push({ code: "production_drift_launchd_plist_unreadable", path: "<launchd-dir>/com.hermesmobile.production-drift-audit.plist" });
    return;
  }
  const plist = readTextIfExists(driftPlist);
  if (!plist) {
    issues.push({ code: "production_drift_launchd_plist_unreadable", path: "<launchd-dir>/com.hermesmobile.production-drift-audit.plist" });
    return;
  }
  if (!plist.includes("<string>com.hermesmobile.production-drift-audit</string>")) {
    issues.push({ code: "production_drift_launchd_label_missing", path: "<launchd-dir>/com.hermesmobile.production-drift-audit.plist" });
  }
  if (!plist.includes("homeai-production-drift-audit-watchdog.sh")) {
    issues.push({ code: "production_drift_launchd_watchdog_program_missing", path: "<launchd-dir>/com.hermesmobile.production-drift-audit.plist" });
  }
  if (!/<key>HOMEAI_PRODUCTION_DRIFT_AUTO_REPAIR<\/key>\s*<string>1<\/string>/.test(plist)) {
    issues.push({ code: "production_drift_launchd_auto_repair_disabled", path: "<launchd-dir>/com.hermesmobile.production-drift-audit.plist" });
  }
}

function checkHost(options, issues) {
  const rootStatus = pathStatus(options.root);
  if (rootStatus === "missing") issues.push({ code: "mac_root_missing", path: "<root>" });
  else if (rootStatus !== "exists") issues.push({ code: "mac_root_unreadable", path: "<root>" });
  const appStatus = pathStatus(options.app);
  if (appStatus === "missing") issues.push({ code: "mac_app_missing", path: "<app>" });
  else if (appStatus !== "exists") issues.push({ code: "mac_app_unreadable", path: "<app>" });
  const nodeStatus = pathStatus(options.node);
  if (nodeStatus === "missing") issues.push({ code: "mac_node_missing", path: "<node>" });
  else if (nodeStatus !== "exists") issues.push({ code: "mac_node_unreadable", path: "<node>" });
  const dataStatus = pathStatus(path.join(options.root, "data"));
  if (dataStatus === "missing") issues.push({ code: "mac_data_root_missing", path: "<root>/data" });
  else if (dataStatus !== "exists") issues.push({ code: "mac_data_root_unreadable", path: "<root>/data" });
  const manifestStatus = pathStatus(options.manifest);
  if (manifestStatus === "missing") issues.push({ code: "gateway_manifest_missing", path: "<root>/data/gateway-pool-manifest-mac.json" });
  else if (manifestStatus !== "exists") issues.push({ code: "gateway_manifest_unreadable", path: "<root>/data/gateway-pool-manifest-mac.json" });
  if (!["direct", "proxy"].includes(options.networkMode)) {
    issues.push({ code: "network_mode_missing_or_invalid", required: "direct|proxy" });
  }
  try {
    const parsed = new URL(options.base);
    if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(parsed.hostname)) {
      issues.push({ code: "base_url_not_loopback_http", base: options.base });
    }
  } catch {
    issues.push({ code: "base_url_invalid", base: options.base });
  }
  checkOwnerKey(options, issues);
  checkProductionDriftWatchdog(options, issues);
  checkPluginWorkspaceProvisioningPlan(options, issues);
}

function buildReport(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || REPO_ROOT);
  const normalized = {
    ...options,
    root: path.resolve(options.root || DEFAULT_ROOT),
  };
  normalized.app = path.resolve(options.app || path.join(normalized.root, "app"));
  normalized.node = path.resolve(options.node || path.join(normalized.root, "runtime", "node-current", "bin", "node"));
  normalized.base = String(options.base || DEFAULT_BASE).replace(/\/+$/, "");
  normalized.ownerKeyFile = path.resolve(options.ownerKeyFile || path.join(normalized.root, "data", "secrets", "owner-web-key.secret"));
  normalized.manifest = path.resolve(options.manifest || path.join(normalized.root, "data", "gateway-pool-manifest-mac.json"));
  normalized.launchdDir = path.resolve(options.launchdDir || process.env.HOMEAI_LAUNCH_DAEMONS_DIR || "/Library/LaunchDaemons");
  normalized.networkMode = String(options.networkMode || process.env.HERMES_MOBILE_NETWORK_MODE || "").trim().toLowerCase();

  const issues = [];
  checkRequiredSourceFiles(repoRoot, issues);
  if (!options.sourceOnly) checkHost(normalized, issues);
  return {
    ok: issues.length === 0,
    schemaVersion: 1,
    mode: options.sourceOnly ? "source-only" : "host-and-source",
    repoRoot,
    root: normalized.root,
    base: normalized.base,
    networkMode: normalized.networkMode || "",
    launchdDir: normalized.launchdDir,
    requiredSourceFileCount: REQUIRED_SOURCE_FILES.length,
    followUpDiagnostics: FOLLOW_UP_DIAGNOSTICS,
    issues,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = buildReport(args);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else if (report.ok) {
    console.log(`macos_first_start_preflight ok mode=${report.mode}`);
  } else {
    console.error(`macos_first_start_preflight failed mode=${report.mode}`);
    for (const issue of report.issues) console.error(`- ${issue.code}`);
  }
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  FOLLOW_UP_DIAGNOSTICS,
  DEFAULT_BUSINESS_PLUGIN_IDS,
  REQUIRED_SOURCE_FILES,
  buildReport,
  parseArgs,
  pathStatus,
};
