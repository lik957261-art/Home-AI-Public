#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_MAC_ROOT = "/Users/hermes-host/HermesMobile";
const DEFAULT_LABEL = "com.hermesmobile.plugin.moira";
const DEFAULT_LAUNCH_DAEMONS_DIR = "/Library/LaunchDaemons";
const DEFAULT_PORT = "4174";
const DEFAULT_HOST = "127.0.0.1";

function argValue(argv, name, fallback = "") {
  const index = argv.indexOf(name);
  return index >= 0 ? (argv[index + 1] || fallback) : fallback;
}

function parseArgs(argv) {
  return {
    execute: argv.includes("--execute"),
    json: argv.includes("--json"),
    bootstrap: argv.includes("--bootstrap"),
    macRoot: argValue(argv, "--mac-root", process.env.HERMES_MOBILE_MAC_ROOT || DEFAULT_MAC_ROOT),
    launchDaemonsDir: argValue(argv, "--launch-daemons-dir", DEFAULT_LAUNCH_DAEMONS_DIR),
    passwordFile: argValue(argv, "--password-file", process.env.HOMEAI_MAC_SUDO_PASSWORD_FILE || ""),
    host: argValue(argv, "--host", process.env.MOIRA_PLUGIN_HOST || DEFAULT_HOST),
    port: argValue(argv, "--port", process.env.MOIRA_PLUGIN_PORT || DEFAULT_PORT),
    ownerWorkspaceId: argValue(argv, "--owner-workspace-id", process.env.MOIRA_HERMES_OWNER_WORKSPACE_ID || "owner"),
    allowedWorkspaces: argValue(argv, "--allowed-workspaces", process.env.MOIRA_HERMES_ALLOWED_WORKSPACES || "owner"),
  };
}

function xmlEscape(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plistFor(options = {}) {
  const macRoot = options.macRoot || DEFAULT_MAC_ROOT;
  const host = options.host || DEFAULT_HOST;
  const port = String(options.port || DEFAULT_PORT);
  const nodePath = path.posix.join(macRoot, "runtime", "node-current", "bin", "node");
  const pluginRoot = path.posix.join(macRoot, "plugins", "moira");
  const logsDir = path.posix.join(macRoot, "logs");
  const env = {
    PATH: `${path.posix.join(macRoot, "runtime", "node-current", "bin")}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
    NODE_ENV: "production",
    MOIRA_PLUGIN_HOST: host,
    MOIRA_PLUGIN_PORT: port,
    MOIRA_PLUGIN_BASE_URL: `http://${host}:${port}`,
    MOIRA_HERMES_OWNER_WORKSPACE_ID: options.ownerWorkspaceId || "owner",
    MOIRA_HERMES_ALLOWED_WORKSPACES: options.allowedWorkspaces || "owner",
  };
  const envXml = Object.entries(env).map(([key, value]) => [
    "      <key>", xmlEscape(key), "</key>\n",
    "      <string>", xmlEscape(value), "</string>",
  ].join("")).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${DEFAULT_LABEL}</string>
  <key>UserName</key>
  <string>hermes-host</string>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(pluginRoot)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(nodePath)}</string>
    <string>server/moira-plugin-server.mjs</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${envXml}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(path.posix.join(logsDir, "plugin-moira.out.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(path.posix.join(logsDir, "plugin-moira.err.log"))}</string>
</dict>
</plist>
`;
}

function readPassword(filePath) {
  if (!filePath) return "";
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).find((line) => line.trim()) || "";
}

function runSudo(command, args, password, input = "") {
  const sudoArgs = ["-n", command, ...args];
  const result = spawnSync("/usr/bin/sudo", sudoArgs, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const err = new Error(`sudo_command_failed:${path.basename(command)}`);
    err.status = result.status;
    err.stderr = String(result.stderr || "").slice(0, 1000);
    throw err;
  }
  return result;
}

function authenticateSudo(password) {
  if (!password) return;
  const result = spawnSync("/usr/bin/sudo", ["-S", "-p", "", "-v"], {
    input: `${password}\n`,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const err = new Error("sudo_auth_failed");
    err.status = result.status;
    err.stderr = String(result.stderr || "").slice(0, 1000);
    throw err;
  }
}

function installRootOwnedTextFile(targetPath, text, password, mode = "644", owner = "root:wheel") {
  const tempPath = path.join(os.tmpdir(), `home-ai-moira-launchd-${process.pid}-${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(tempPath, text, { encoding: "utf8", mode: 0o600 });
  try {
    const [user, group = "wheel"] = owner.split(":");
    runSudo("/usr/bin/install", ["-m", mode, "-o", user, "-g", group, tempPath, targetPath], password);
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch (_) {
      // Best effort cleanup only.
    }
  }
}

function plan(options = {}) {
  const macRoot = options.macRoot || DEFAULT_MAC_ROOT;
  const host = options.host || DEFAULT_HOST;
  const port = String(options.port || DEFAULT_PORT);
  return {
    label: DEFAULT_LABEL,
    plistPath: path.posix.join(options.launchDaemonsDir || DEFAULT_LAUNCH_DAEMONS_DIR, `${DEFAULT_LABEL}.plist`),
    pluginRoot: path.posix.join(macRoot, "plugins", "moira"),
    logPaths: [
      path.posix.join(macRoot, "logs", "plugin-moira.out.log"),
      path.posix.join(macRoot, "logs", "plugin-moira.err.log"),
    ],
    host,
    port,
    baseUrl: `http://${host}:${port}`,
    ownerWorkspaceId: options.ownerWorkspaceId || "owner",
    allowedWorkspaces: options.allowedWorkspaces || "owner",
    bootstrap: Boolean(options.bootstrap),
  };
}

function execute(options = {}) {
  const password = readPassword(options.passwordFile);
  if (options.passwordFile && !password) throw new Error("sudo_password_file_empty");
  authenticateSudo(password);
  const currentPlan = plan(options);
  const plist = plistFor(options);
  runSudo("/bin/mkdir", ["-p", currentPlan.pluginRoot, path.posix.dirname(currentPlan.plistPath), path.posix.dirname(currentPlan.logPaths[0])], password);
  for (const logPath of currentPlan.logPaths) runSudo("/usr/bin/touch", [logPath], password);
  runSudo("/usr/sbin/chown", ["-R", "hermes-host:staff", currentPlan.pluginRoot], password);
  runSudo("/usr/sbin/chown", ["hermes-host:staff", ...currentPlan.logPaths], password);
  runSudo("/bin/chmod", ["640", ...currentPlan.logPaths], password);
  installRootOwnedTextFile(currentPlan.plistPath, plist, password, "644", "root:wheel");
  runSudo("/usr/bin/plutil", ["-lint", currentPlan.plistPath], password);
  if (options.bootstrap) {
    runSudo("/bin/sh", ["-c", "/bin/launchctl bootout system \"$1\" >/dev/null 2>&1 || true", "sh", currentPlan.plistPath], password);
    runSudo("/bin/launchctl", ["bootstrap", "system", currentPlan.plistPath], password);
    runSudo("/bin/launchctl", ["kickstart", "-k", `system/${DEFAULT_LABEL}`], password);
  }
  return currentPlan;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const currentPlan = options.execute ? execute(options) : plan(options);
  const plist = plistFor(options);
  const payload = {
    ok: true,
    mode: options.execute ? "execute" : "plan",
    plan: currentPlan,
    plist,
    plistSha256: crypto.createHash("sha256").update(plist).digest("hex"),
  };
  if (options.json || !options.execute) console.log(JSON.stringify(payload, null, 2));
  else console.log(`installed ${currentPlan.label}`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    const payload = { ok: false, error: err?.message || String(err) };
    if (err?.stderr) payload.stderr = err.stderr;
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_LABEL,
  parseArgs,
  plan,
  plistFor,
};
