"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { createGatewayWorkspaceProvisioningService } = require("../adapters/gateway-workspace-provisioning-service");
const { createHermesPluginService, configuredPlugins } = require("../adapters/hermes-plugin-service");
const { createWorkspaceSystemProvisioningExecutorService } = require("../adapters/workspace-system-provisioning-executor-service");

const DEFAULT_ROOT = "/Users/example/path";
const DEFAULT_WORKSPACE_MAP = "owner:hm-owner:owner,weixin_wuping:hm-wuping:weixin_wuping,weixin_stephen:hm-stephen:weixin_stephen,user-981731fe:hm-xuyan:user-981731fe,test:hm-test:test";
const DEFAULT_LISTENER_USER = "hermes-host";
const EMAIL_BINDING_DIR = ".hermes-email";
const DEFAULT_ALLOWED_ERRORS = new Set([
  "workspace_gateway_workers_missing",
  "macos_system_executor_requires_darwin",
]);

function stringValue(value) {
  return String(value || "").trim();
}

function boolValue(value) {
  return /^(1|true|yes|on)$/i.test(stringValue(value));
}

function compactError(value) {
  return stringValue(value).replace(/\s+/g, " ").slice(0, 180) || "plugin_workspace_provisioning_failed";
}

function compactDetails(value = {}) {
  if (!value || typeof value !== "object") return {};
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (item == null) continue;
    if (/key|token|secret|credential|password/i.test(key)) {
      out[key] = Boolean(item);
    } else if (typeof item === "string") {
      out[key] = compactError(item);
    } else if (typeof item === "number" || typeof item === "boolean") {
      out[key] = item;
    }
  }
  return out;
}

function sleep(ms) {
  const delay = Math.max(0, Number(ms || 0));
  if (!delay) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    root: process.env.HOMEAI_ROOT || DEFAULT_ROOT,
    appSource: "",
    workspaceMap: process.env.HOMEAI_WORKSPACE_MAP || DEFAULT_WORKSPACE_MAP,
    output: "text",
    allowNonDarwin: false,
    skipGatewayRefresh: false,
    strict: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") {
      options.root = argv[++index] || "";
    } else if (arg === "--app-source") {
      options.appSource = argv[++index] || "";
    } else if (arg === "--workspace-map") {
      options.workspaceMap = argv[++index] || "";
    } else if (arg === "--json") {
      options.output = "json";
    } else if (arg === "--allow-non-darwin") {
      options.allowNonDarwin = true;
    } else if (arg === "--skip-gateway-refresh") {
      options.skipGatewayRefresh = true;
    } else if (arg === "--strict") {
      options.strict = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      const err = new Error(`unknown argument: ${arg}`);
      err.exitCode = 2;
      throw err;
    }
  }
  return options;
}

function usage() {
  return [
    "Usage: node scripts/macos-plugin-workspace-provisioning-apply.js --root <path> [--app-source <path>] [--workspace-map <csv>] [--json] [--strict]",
    "",
    "Applies the first-install plugin workspace provisioning plan: creates bounded",
    "workspace plugin grants/keys/config, registers plugin workspaces through local",
    "plugin endpoints, and refreshes Gateway worker profile materialization.",
  ].join("\n");
}

function parseWorkspaceMap(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [workspaceId, macUser, driveName] = entry.split(":").map((item) => item.trim());
      return { workspaceId, macUser, driveName: driveName || workspaceId };
    });
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, value, mode = 0o640) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o750 });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode });
  try { fs.chmodSync(file, mode); } catch (_) {}
}

function pluginRowsFromConfig(config = {}) {
  const plugins = Array.isArray(config.plugins) ? config.plugins : [];
  return plugins
    .map((plugin) => ({
      id: stringValue(plugin.id),
      manifestUrl: stringValue(plugin.manifestUrl),
      launchdLabel: stringValue(plugin.launchdLabel),
      publicDefault: plugin.publicDefault === true,
      special: plugin.special === true,
      operatorAuthenticated: plugin.operatorAuthenticated === true,
    }))
    .filter((plugin) => plugin.id && plugin.manifestUrl);
}

function desiredWorkspacePlugins(planWorkspace = {}, fallbackPluginIds = []) {
  const fromPlan = Array.isArray(planWorkspace.plugins)
    ? planWorkspace.plugins.map((plugin) => stringValue(plugin.pluginId)).filter(Boolean)
    : [];
  return [...new Set((fromPlan.length ? fromPlan : fallbackPluginIds).filter(Boolean))];
}

function pluginConfigForService(pluginRows = []) {
  return pluginRows.map((plugin) => ({
    id: plugin.id === "codex-mobile-web" ? "codex-mobile" : plugin.id,
    manifestUrl: plugin.manifestUrl,
    launchdLabel: plugin.launchdLabel,
    allowWorkspaceGrant: !plugin.special,
  }));
}

function redactedProvisioning(value = {}) {
  if (!value || typeof value !== "object") return {};
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (/key|token|secret|credential/i.test(key)) out[key] = Boolean(item);
    else if (typeof item === "string") out[key] = item.slice(0, 180);
    else if (typeof item === "number" || typeof item === "boolean" || item == null) out[key] = item;
    else if (Array.isArray(item)) out[key] = item.map((entry) => stringValue(entry).slice(0, 80)).filter(Boolean).slice(0, 12);
  }
  return out;
}

function compatibleSecretEnv(root) {
  const dataDir = path.join(root, "data");
  const pluginSecrets = path.join(dataDir, "plugin-secrets");
  return {
    HERMES_WEB_DATA_DIR: dataDir,
    HERMES_MOBILE_DATA_DIR: dataDir,
    HERMES_MOBILE_ROOT: root,
    HERMES_WEB_ROOT: root,
    HERMES_MOBILE_WARDROBE_REGISTRATION_ACCESS_KEY_PATH: path.join(pluginSecrets, "wardrobe-registration-access-key.txt"),
    HERMES_MOBILE_GROWTH_PLUGIN_OWNER_KEY_PATH: path.join(pluginSecrets, "growth-owner-key.txt"),
    HERMES_MOBILE_HEALTH_PLUGIN_OWNER_KEY_PATH: path.join(pluginSecrets, "health-owner-key.txt"),
    HERMES_MOBILE_NOTE_PLUGIN_OWNER_KEY_PATH: path.join(pluginSecrets, "note-owner-key.txt"),
    HERMES_MOBILE_EMAIL_PLUGIN_OWNER_KEY_PATH: path.join(pluginSecrets, "email-owner-key.txt"),
    GROWTH_REGISTRATION_KEY_PATH: path.join(pluginSecrets, "growth-registration-key.txt"),
    HEALTHY_REGISTRATION_KEY_PATH: path.join(pluginSecrets, "health-registration-key.txt"),
    NOTE_REGISTRATION_KEY_PATH: path.join(pluginSecrets, "note-registration-key.txt"),
    EMAIL_HERMES_OWNER_KEY_FILE: path.join(pluginSecrets, "email-registration-key.txt"),
  };
}

function spawnChecked(spawnSync, command, args = [], options = {}) {
  const result = spawnSync(command, args, Object.assign({ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }, options));
  if (result.status !== 0) {
    const err = new Error(`command_failed:${path.basename(command)}`);
    err.details = {
      status: result.status,
      stdout: compactError(result.stdout || ""),
      stderr: compactError(result.stderr || ""),
    };
    throw err;
  }
  return result;
}

function emailWorkspaceRoot(root, workspaceId) {
  return path.join(root, "data", "drive", "users", workspaceId);
}

function emailBindingDir(root, workspaceId) {
  return path.join(emailWorkspaceRoot(root, workspaceId), EMAIL_BINDING_DIR);
}

function ensureDarwinEmailBindingAcl({ root, workspaceId, macUser, listenerUser, spawnSync }) {
  const dir = emailBindingDir(root, workspaceId);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  if (process.platform !== "darwin" || typeof process.getuid !== "function" || process.getuid() !== 0) {
    return { dir };
  }
  const narrowWriteAcl = [
    "list",
    "add_file",
    "search",
    "delete_child",
    "readattr",
    "writeattr",
    "readextattr",
    "writeextattr",
    "readsecurity",
    "file_inherit",
    "directory_inherit",
  ].join(",");
  spawnChecked(spawnSync, "/usr/sbin/chown", ["-R", `${macUser}:staff`, dir]);
  spawnChecked(spawnSync, "/bin/chmod", ["700", dir]);
  spawnChecked(spawnSync, "/bin/chmod", ["+a", `user:${listenerUser} allow ${narrowWriteAcl}`, dir]);
  return { dir, listenerAcl: true };
}

function finalizeDarwinEmailBindingAcl({ root, workspaceId, macUser, listenerUser, spawnSync }) {
  const dir = emailBindingDir(root, workspaceId);
  if (!fs.existsSync(dir)) return { dir, existed: false };
  fs.chmodSync(dir, 0o700);
  for (const name of ["access-key.txt", "config.json"]) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) fs.chmodSync(file, 0o600);
  }
  if (process.platform !== "darwin" || typeof process.getuid !== "function" || process.getuid() !== 0) {
    return { dir, existed: true };
  }
  const narrowWriteAcl = [
    "list",
    "add_file",
    "search",
    "delete_child",
    "readattr",
    "writeattr",
    "readextattr",
    "writeextattr",
    "readsecurity",
    "file_inherit",
    "directory_inherit",
  ].join(",");
  spawnChecked(spawnSync, "/usr/sbin/chown", ["-R", `${macUser}:staff`, dir]);
  spawnChecked(spawnSync, "/bin/chmod", ["700", dir]);
  spawnChecked(spawnSync, "/bin/chmod", ["+a", `user:${listenerUser} allow ${narrowWriteAcl}`, dir]);
  return { dir, existed: true, listenerAcl: true };
}

function contextPaths(root, workspaceId, macUser) {
  return {
    liveRoot: root,
    dataRoot: path.join(root, "data"),
    driveRoot: path.join(root, "data", "drive"),
    workspaceDataRoot: path.join(root, "data", "drive", "users", workspaceId),
    workerHome: path.join("/Users", macUser),
    workerWorkspaceRoot: path.join("/Users", macUser, "HermesWorkspace"),
  };
}

async function apply(options = {}) {
  const root = path.resolve(options.root || DEFAULT_ROOT);
  const appSource = path.resolve(options.appSource || path.join(root, "app"));
  const repoRoot = fs.existsSync(path.join(root, "app")) ? path.join(root, "app") : appSource;
  const dataDir = path.join(root, "data");
  const planPath = path.join(dataDir, "plugin-workspace-provisioning-plan.json");
  const reportPath = path.join(dataDir, "plugin-workspace-provisioning-apply.json");
  const sourceConfigPath = path.join(repoRoot, "config", "public-plugin-sources.json");
  const config = readJson(sourceConfigPath, {});
  const pluginRows = pluginRowsFromConfig(config);
  const publicPluginIds = pluginRows.filter((plugin) => plugin.publicDefault && !plugin.special).map((plugin) => plugin.id);
  const plan = readJson(planPath, null);
  const workspaces = Array.isArray(plan?.workspaces) && plan.workspaces.length
    ? plan.workspaces
    : parseWorkspaceMap(options.workspaceMap).map((workspace) => ({
      workspaceId: workspace.workspaceId,
      macUser: workspace.macUser,
      driveName: workspace.driveName,
      plugins: publicPluginIds.map((pluginId) => ({ pluginId })),
    }));
  const byWorkspace = new Map(parseWorkspaceMap(options.workspaceMap).map((workspace) => [workspace.workspaceId, workspace]));
  const env = Object.assign({}, process.env, compatibleSecretEnv(root));
  const actions = [];
  const issues = [];
  const workspaceReports = [];
  const specialPluginIds = pluginRows.filter((plugin) => plugin.special).map((plugin) => plugin.id);
  const spawnSync = options.spawnSync || require("node:child_process").spawnSync;
  const listenerUser = stringValue(env.HERMES_MOBILE_LISTENER_USER || env.HERMES_WEB_LISTENER_USER) || DEFAULT_LISTENER_USER;
  const retryCount = Math.max(1, Number(options.retryCount || 4));
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs == null ? 750 : options.retryDelayMs));

  const gatewayWorkspaceProvisioningService = createGatewayWorkspaceProvisioningService({
    manifestPaths: [path.join(dataDir, "gateway-pool-manifest-mac.json")],
    skillProfilesRoot: path.join(dataDir, "skill-profiles"),
    profileHomeRoot: "/Users",
  });
  const systemProvisioningExecutor = createWorkspaceSystemProvisioningExecutorService({
    liveRoot: root,
    enabled: true,
    useSudoWrites: false,
    allowNonDarwin: Boolean(options.allowNonDarwin),
    launchDaemonsDir: process.env.HOMEAI_LAUNCH_DAEMONS_DIR || "/Library/LaunchDaemons",
    env,
  });
  const hermesPluginService = createHermesPluginService({
    dataDir,
    env,
    repoRoot,
    plugins: pluginConfigForService(pluginRows),
    fetch: options.fetch || global.fetch,
    gatewayWorkspaceProvisioningService,
    requireSystemGatewayRefresh: false,
  });

  for (const workspace of workspaces) {
    const workspaceId = stringValue(workspace.workspaceId);
    const mapped = byWorkspace.get(workspaceId) || {};
    const macUser = stringValue(workspace.macUser || mapped.macUser || (workspaceId === "owner" ? "hm-owner" : ""));
    const displayName = stringValue(workspace.displayName || workspace.driveName || mapped.driveName || workspaceId);
    const pluginIds = desiredWorkspacePlugins(workspace, publicPluginIds);
    const workspaceReport = {
      workspaceId,
      macUser,
      displayName,
      status: "pending",
      activeCount: 0,
      skippedCount: 0,
      failedCount: 0,
      plugins: [],
      gateway: {},
    };
    if (!workspaceId || !macUser) {
      workspaceReport.status = "failed";
      workspaceReport.failedCount += 1;
      workspaceReport.plugins.push({ pluginId: "", status: "failed", error: "workspace_or_mac_user_required" });
      workspaceReports.push(workspaceReport);
      issues.push({ code: "workspace_or_mac_user_required", workspaceId });
      continue;
    }

    for (const pluginId of pluginIds) {
      const row = pluginRows.find((plugin) => plugin.id === pluginId || (plugin.id === "codex-mobile-web" && pluginId === "codex-mobile"));
      if (!row) {
        workspaceReport.failedCount += 1;
        workspaceReport.plugins.push({ pluginId, status: "failed", error: "plugin_source_config_missing" });
        issues.push({ code: "plugin_source_config_missing", workspaceId, pluginId });
        continue;
      }
      if (row.special) {
        workspaceReport.skippedCount += 1;
        workspaceReport.plugins.push({
          pluginId: row.id,
          status: workspaceId === "owner" ? "owner_gateway_profile" : "manual_required",
          reason: row.operatorAuthenticated ? "operator_authenticated_plugin" : "special_plugin",
        });
        continue;
      }
      try {
        if (row.id === "email") {
          ensureDarwinEmailBindingAcl({ root, workspaceId, macUser, listenerUser, spawnSync });
          actions.push({ action: "prepare-email-workspace-binding", workspaceId, pluginId: row.id, directory: `${EMAIL_BINDING_DIR}` });
        }
        let result = null;
        let lastError = null;
        for (let attempt = 1; attempt <= retryCount; attempt += 1) {
          try {
            result = await hermesPluginService.grantWorkspace({
              id: row.id,
              pluginId: row.id,
              workspaceId,
              displayName,
              actor: "macos-first-install",
              skipGatewayRefresh: true,
              macUser,
            });
            lastError = null;
          } catch (err) {
            lastError = err;
            result = null;
          }
          const failedResult = !result || result.ok === false || result.provisioning?.status === "provisioning_failed";
          const retryable = failedResult && /fetch failed|ECONNREFUSED|ECONNRESET|EPIPE|ETIMEDOUT|timeout|AbortError/i.test(
            stringValue(lastError?.message || result?.error || result?.provisioning?.error),
          );
          if (!retryable || attempt >= retryCount) break;
          actions.push({ action: "retry-plugin-workspace-provisioning", workspaceId, pluginId: row.id, attempt, reason: compactError(lastError?.message || result?.error || result?.provisioning?.error) });
          await sleep(retryDelayMs);
        }
        if (lastError) throw lastError;
        const failed = !result || result.ok === false || result.provisioning?.status === "provisioning_failed";
        if (failed) {
          const error = compactError(result?.error || result?.provisioning?.error || `${row.id}_provisioning_failed`);
          workspaceReport.failedCount += 1;
          workspaceReport.plugins.push({
            pluginId: row.id,
            status: "failed",
            error,
            provisioning: redactedProvisioning(result?.provisioning),
          });
          issues.push({ code: "plugin_workspace_provisioning_failed", workspaceId, pluginId: row.id, error });
          continue;
        }
        if (row.id === "email") {
          finalizeDarwinEmailBindingAcl({ root, workspaceId, macUser, listenerUser, spawnSync });
          actions.push({ action: "finalize-email-workspace-binding", workspaceId, pluginId: row.id, directory: `${EMAIL_BINDING_DIR}` });
        }
        workspaceReport.activeCount += 1;
        workspaceReport.plugins.push({
          pluginId: row.id,
          status: "active",
          provisioning: redactedProvisioning(result.provisioning),
        });
      } catch (err) {
        const error = compactError(err?.message || err);
        workspaceReport.failedCount += 1;
        workspaceReport.plugins.push({ pluginId: row.id, status: "failed", error });
        issues.push({ code: "plugin_workspace_provisioning_exception", workspaceId, pluginId: row.id, error });
      }
    }

    if (!options.skipGatewayRefresh) {
      const context = {
        workspaceId,
        macUser,
        pluginIds: pluginIds.filter((pluginId) => !specialPluginIds.includes(pluginId)),
        paths: contextPaths(root, workspaceId, macUser),
        gateway: { kickstart: true },
      };
      if (workspaceId !== "owner") {
        const gateway = gatewayWorkspaceProvisioningService.ensureWorkspaceGateway({
          workspaceId,
          macUser,
          refreshProfileBinding: true,
          bindingChanged: true,
        });
        workspaceReport.gateway.profileBinding = gateway?.ok === false
          ? { ok: false, error: compactError(gateway.reason || gateway.error || "gateway_profile_binding_failed") }
          : {
            ok: true,
            profiles: Array.isArray(gateway?.profiles) ? gateway.profiles : [],
            profileBindingRefreshed: Boolean(gateway?.profileBindingRefreshed),
          };
        context.gateway = Object.assign({}, context.gateway, gateway?.manifestPath ? { manifestPath: gateway.manifestPath } : {}, {
          profiles: Array.isArray(gateway?.profiles) ? gateway.profiles : [],
        });
      } else {
        workspaceReport.gateway.profileBinding = { ok: true, status: "owner-existing-workers" };
      }
      const launchd = await systemProvisioningExecutor.runStep("ensure_launchd_services", context);
      if (!launchd || launchd.ok === false) {
        const error = compactError(launchd?.error || "gateway_launchd_refresh_failed");
        workspaceReport.gateway.launchd = { ok: false, error, details: compactDetails(launchd?.details) };
        if (!DEFAULT_ALLOWED_ERRORS.has(error)) {
          issues.push({ code: "gateway_launchd_refresh_failed", workspaceId, error, details: compactDetails(launchd?.details) });
        }
      } else {
        workspaceReport.gateway.launchd = {
          ok: true,
          workerCount: Array.isArray(launchd.workers) ? launchd.workers.length : 0,
          syncedPluginBindings: Array.isArray(launchd.syncedPluginBindings) ? launchd.syncedPluginBindings : [],
          syncedGatewayMcpAssets: Array.isArray(launchd.syncedGatewayMcpAssets) ? launchd.syncedGatewayMcpAssets : [],
          kickstartedCount: Array.isArray(launchd.kickstarted) ? launchd.kickstarted.length : 0,
        };
      }
    }
    workspaceReport.status = workspaceReport.failedCount === 0
      ? "active"
      : (workspaceReport.activeCount > 0 || workspaceReport.skippedCount > 0 ? "partial" : "failed");
    workspaceReports.push(workspaceReport);
  }

  const activeCount = workspaceReports.reduce((sum, workspace) => sum + workspace.activeCount, 0);
  const failedCount = workspaceReports.reduce((sum, workspace) => sum + workspace.failedCount, 0);
  const skippedCount = workspaceReports.reduce((sum, workspace) => sum + workspace.skippedCount, 0);
  const blockingIssues = options.strict ? issues : issues.filter((issue) => !String(issue.error || issue.code || "").includes("_owner_key_missing"));
  const report = {
    ok: blockingIssues.length === 0,
    schemaVersion: 1,
    generatedBy: "install-macos-production apply-plugin-workspace-provisioning",
    generatedAt: new Date().toISOString(),
    phase: "apply-plugin-workspace-provisioning",
    root,
    planPath,
    sourceConfigPath,
    createsPluginKeys: true,
    createsWorkspaceGrants: true,
    callsPluginBindEndpoints: true,
    gatewayProfileRefresh: !options.skipGatewayRefresh,
    workspaceCount: workspaceReports.length,
    pluginCount: workspaceReports.reduce((sum, workspace) => sum + workspace.plugins.length, 0),
    activeCount,
    skippedCount,
    failedCount,
    strict: Boolean(options.strict),
    status: failedCount === 0 ? "active" : (activeCount > 0 ? "partial" : "failed"),
    workspaces: workspaceReports,
    actionCount: actions.length,
    actions,
    issues,
    privacy: {
      rawKeysReturned: false,
      rawTokensReturned: false,
    },
  };
  writeJson(reportPath, report, 0o640);
  return Object.assign({}, report, { reportPath });
}

async function main() {
  let options;
  try {
    options = parseArgs();
  } catch (err) {
    console.error(err.message || String(err));
    process.exit(err.exitCode || 2);
  }
  if (options.help) {
    console.log(usage());
    return;
  }
  const report = await apply(options);
  if (options.output === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`plugin workspace provisioning apply: ${report.ok ? "ok" : "failed"} (${report.status})\n`);
  }
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    const report = {
      ok: false,
      schemaVersion: 1,
      phase: "apply-plugin-workspace-provisioning",
      error: compactError(err?.message || err),
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  apply,
  compatibleSecretEnv,
  parseArgs,
  pluginRowsFromConfig,
};
