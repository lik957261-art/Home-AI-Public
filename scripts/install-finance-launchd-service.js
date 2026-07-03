#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  baseParseArgs,
  buildLaunchdPlist,
  createPlan,
  payloadFor,
  servicePaths,
} = require("./plugin-launchd-service-helper");

const DEFAULT_LABEL = "com.hermesmobile.plugin.finance";
const RECURRING_AUTO_POST_ENABLED = "1";
const RECURRING_AUTO_POST_INTERVAL_MS = "300000";
const SPEC = Object.freeze({
  pluginId: "finance",
  sourceDir: "finance",
  label: DEFAULT_LABEL,
  defaultPort: "8791",
});

function parseArgs(argv) {
  const parsed = baseParseArgs(argv, {
    port: process.env.FINANCE_MCP_PORT || "8791",
    host: process.env.FINANCE_MCP_HOST || "127.0.0.1",
  });
  return Object.assign(parsed, {
    requireWorkspaceKeyHashes: argv.includes("--require-workspace-key-hashes"),
  });
}

function plan(options = {}) {
  const currentPlan = createPlan(options, SPEC);
  const workspaceKeyHashInfo = financeWorkspaceKeyHashInfo(options.macRoot);
  return Object.assign(currentPlan, {
    workspaceKeyHashCount: workspaceKeyHashInfo.workspaceIds.length,
    workspaceKeyHashWorkspaceIds: workspaceKeyHashInfo.workspaceIds,
  });
}

function safeWorkspaceId(value = "") {
  const text = String(value || "").trim();
  if (!text || text.length > 160) return "";
  if (text === "." || text === ".." || /[/\\\0]/.test(text)) return "";
  return text;
}

function readJsonObject(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_err) {
    return {};
  }
}

function configuredKeyFileNames(config = {}) {
  const configured = String(config.access_key_file || config.accessKeyFile || "").trim();
  const candidates = [];
  if (configured && path.posix.basename(configured) === configured && !configured.includes("\\")) {
    candidates.push(configured);
  }
  candidates.push("access-key.txt", "workspace-key.txt");
  return [...new Set(candidates)];
}

function readFirstExistingKey(bindingDir, keyFileNames = []) {
  for (const name of keyFileNames) {
    const keyPath = path.join(bindingDir, name);
    try {
      if (!fs.existsSync(keyPath) || !fs.statSync(keyPath).isFile()) continue;
      const key = fs.readFileSync(keyPath, "utf8").trim();
      if (key) return { key, keyFileName: name };
    } catch (_err) {
      return { error: "finance_workspace_key_unreadable", keyFileName: name };
    }
  }
  return { error: "finance_workspace_key_missing", keyFileName: "" };
}

function financeWorkspaceKeyHash(workspaceId, workspaceKey) {
  return `sha256:${crypto.createHash("sha256").update(`${workspaceId}:${workspaceKey}`).digest("hex")}`;
}

function financeWorkspaceKeyHashInfo(macRoot = "") {
  const root = path.resolve(macRoot || process.env.HERMES_MOBILE_MAC_ROOT || "/Users/example/path");
  const usersRoot = path.join(root, "data", "drive", "users");
  const hashes = {};
  const rows = [];
  try {
    for (const name of fs.readdirSync(usersRoot).sort()) {
      const workspaceDir = path.join(usersRoot, name);
      const bindingDir = path.join(workspaceDir, ".hermes-finance");
      const configPath = path.join(bindingDir, "config.json");
      try {
        if (!fs.statSync(workspaceDir).isDirectory()) continue;
        if (!fs.existsSync(configPath)) continue;
      } catch (_err) {
        continue;
      }
      const config = readJsonObject(configPath);
      const workspaceId = safeWorkspaceId(config.hermes_workspace_id || config.workspace_id || name);
      if (!workspaceId) continue;
      const keyResult = readFirstExistingKey(bindingDir, configuredKeyFileNames(config));
      if (!keyResult.key) {
        rows.push({ workspaceId, active: false, error: keyResult.error || "finance_workspace_key_missing" });
        continue;
      }
      hashes[workspaceId] = financeWorkspaceKeyHash(workspaceId, keyResult.key);
      rows.push({
        workspaceId,
        active: true,
        config: true,
        keyFileName: keyResult.keyFileName,
      });
    }
  } catch (_err) {
    return { hashes: {}, workspaceIds: [], rows: [], usersRoot, unreadable: true };
  }
  const workspaceIds = Object.keys(hashes).sort();
  const sortedHashes = {};
  for (const workspaceId of workspaceIds) sortedHashes[workspaceId] = hashes[workspaceId];
  return { hashes: sortedHashes, workspaceIds, rows, usersRoot, unreadable: false };
}

function financeLaunchEnv(options = {}) {
  const info = financeWorkspaceKeyHashInfo(options.macRoot);
  return {
    info,
    workspaceKeyHashesJson: JSON.stringify(info.hashes),
    allowedWorkspaces: [...new Set(["owner", ...info.workspaceIds])].sort().join(","),
  };
}

function plistFor(options = {}) {
  const currentPlan = plan(options);
  const paths = servicePaths(options, SPEC);
  const launchEnv = financeLaunchEnv(options);
  return buildLaunchdPlist({
    label: DEFAULT_LABEL,
    userName: currentPlan.serviceUser,
    workingDirectory: currentPlan.pluginRoot,
    programArguments: [paths.nodePath, "server.js"],
    environment: {
      PATH: `${path.posix.dirname(paths.nodePath)}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
      NODE_ENV: "production",
      FINANCE_MCP_HOST: currentPlan.host,
      FINANCE_MCP_PORT: currentPlan.port,
      FINANCE_MCP_DB_PATH: path.posix.join(currentPlan.pluginRoot, "data", "finance.sqlite3"),
      FINANCE_IMAGE_DB_PATH: path.posix.join(currentPlan.pluginRoot, "data", "finance-images.sqlite3"),
      FINANCE_HERMES_OWNER_WORKSPACE_ID: "owner",
      FINANCE_HERMES_ALLOWED_WORKSPACES: launchEnv.allowedWorkspaces,
      FINANCE_HERMES_WORKSPACE_KEY_HASHES_JSON: launchEnv.workspaceKeyHashesJson,
      FINANCE_RECURRING_AUTO_POST: RECURRING_AUTO_POST_ENABLED,
      FINANCE_RECURRING_AUTO_POST_INTERVAL_MS: RECURRING_AUTO_POST_INTERVAL_MS,
    },
    stdoutLog: currentPlan.logPaths[0],
    stderrLog: currentPlan.logPaths[1],
  });
}

function redactPlistForOutput(plist, options = {}) {
  const info = financeWorkspaceKeyHashInfo(options.macRoot);
  return String(plist || "").replace(
    /(<key>FINANCE_HERMES_WORKSPACE_KEY_HASHES_JSON<\/key>\s*<string>)([^<]*)(<\/string>)/,
    `$1[redacted:workspace-count=${info.workspaceIds.length}]$3`,
  );
}

function safePayloadFor(options, spec, currentPlan, plist) {
  const payload = payloadFor(options, spec, currentPlan, plist);
  const info = financeWorkspaceKeyHashInfo(options.macRoot);
  payload.plan = Object.assign({}, payload.plan, {
    workspaceKeyHashCount: info.workspaceIds.length,
    workspaceKeyHashWorkspaceIds: info.workspaceIds,
  });
  payload.plist = redactPlistForOutput(plist, options);
  payload.workspaceKeyHashSource = "workspace-local-finance-config-and-key";
  payload.workspaceKeyHashCount = info.workspaceIds.length;
  payload.workspaceKeyHashWorkspaceIds = info.workspaceIds;
  return payload;
}

function writeTextFile(filePath, text, mode = 0o644) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(path.dirname(filePath), `.tmp-${process.pid}-${Date.now()}`);
  fs.writeFileSync(tempPath, text, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, filePath);
  fs.chmodSync(filePath, mode);
}

function runChecked(command, args = []) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status === 0) return result;
  const err = new Error(`command_failed:${path.basename(command)}`);
  err.status = result.status;
  err.stderr = String(result.stderr || "").slice(0, 400);
  throw err;
}

function install(options = {}) {
  const currentPlan = plan(options);
  const info = financeWorkspaceKeyHashInfo(options.macRoot);
  if (options.requireWorkspaceKeyHashes && info.workspaceIds.length === 0) {
    throw new Error("finance_workspace_key_hashes_missing");
  }
  const plist = plistFor(options);
  writeTextFile(currentPlan.plistPath, plist, 0o644);
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    try {
      fs.chownSync(currentPlan.plistPath, 0, 0);
    } catch (_err) {
      // Non-standard test roots may not allow ownership changes. The plist mode
      // and launchctl validation still catch malformed output.
    }
  }
  runChecked("/usr/bin/plutil", ["-lint", currentPlan.plistPath]);
  const result = safePayloadFor(options, SPEC, currentPlan, plist);
  result.mode = "execute";
  result.installed = true;
  result.plistPath = currentPlan.plistPath;
  if (options.bootstrap) {
    runChecked("/bin/sh", ["-c", `/bin/launchctl bootout system ${JSON.stringify(currentPlan.plistPath)} >/dev/null 2>&1 || true`]);
    runChecked("/bin/launchctl", ["bootstrap", "system", currentPlan.plistPath]);
    runChecked("/bin/launchctl", ["kickstart", "-k", `system/${DEFAULT_LABEL}`]);
    result.bootstrapped = true;
    result.kickstarted = true;
  }
  return result;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const currentPlan = plan(options);
  const plist = plistFor(options);
  const payload = options.execute
    ? install(options)
    : safePayloadFor(options, SPEC, currentPlan, plist);
  console.log(JSON.stringify(payload, null, 2));
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
  DEFAULT_LABEL,
  RECURRING_AUTO_POST_ENABLED,
  RECURRING_AUTO_POST_INTERVAL_MS,
  financeLaunchEnv,
  financeWorkspaceKeyHash,
  financeWorkspaceKeyHashInfo,
  install,
  parseArgs,
  plan,
  plistFor,
  safePayloadFor,
};
