#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_MAC_ROOT = "/Users/hermes-host/HermesMobile";
const DEFAULT_LABEL = "com.hermesmobile.plugin.growth";
const DEFAULT_LAUNCH_DAEMONS_DIR = "/Library/LaunchDaemons";

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
  const nodePath = path.posix.join(macRoot, "runtime", "node-current", "bin", "node");
  const pluginRoot = path.posix.join(macRoot, "plugins", "growth");
  const dataDir = path.posix.join(pluginRoot, "data");
  const logsDir = path.posix.join(macRoot, "logs");
  const registrationKeyPath = path.posix.join(macRoot, "data", "plugin-secrets", "growth-registration-key.txt");
  const ownerAccessKeyPath = path.posix.join(macRoot, "data", "secrets", "owner-web-key.secret");
  const env = {
    PATH: `${path.posix.join(macRoot, "runtime", "node-current", "bin")}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
    GROWTH_PORT: "4881",
    GROWTH_DATA_DIR: dataDir,
    GROWTH_WORKSPACE_STORE_PATH: path.posix.join(dataDir, "workspaces.json"),
    GROWTH_SNAPSHOT_STORE_PATH: path.posix.join(dataDir, "growth-snapshots.json"),
    GROWTH_EVENT_OUTBOX_STORE_PATH: path.posix.join(dataDir, "growth-event-outbox.json"),
    GROWTH_REGISTRATION_KEY_PATH: registrationKeyPath,
    GROWTH_HOME_AI_API_BASE_URL: "http://127.0.0.1:8797",
    GROWTH_HOME_AI_ACCESS_KEY_PATH: ownerAccessKeyPath,
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
    <string>scripts/growth-server.js</string>
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
  <string>${xmlEscape(path.posix.join(logsDir, "plugin-growth.out.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(path.posix.join(logsDir, "plugin-growth.err.log"))}</string>
</dict>
</plist>
`;
}

function readPassword(filePath) {
  if (!filePath) return "";
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).find((line) => line.trim()) || "";
}

function runSudo(command, args, password, input = "") {
  const sudoArgs = password ? ["-S", "-p", "", command, ...args] : ["-n", command, ...args];
  const result = spawnSync("/usr/bin/sudo", sudoArgs, {
    input: password ? `${password}\n${input}` : input,
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

function plan(options = {}) {
  const macRoot = options.macRoot || DEFAULT_MAC_ROOT;
  return {
    label: DEFAULT_LABEL,
    plistPath: path.posix.join(options.launchDaemonsDir || DEFAULT_LAUNCH_DAEMONS_DIR, `${DEFAULT_LABEL}.plist`),
    pluginRoot: path.posix.join(macRoot, "plugins", "growth"),
    dataDir: path.posix.join(macRoot, "plugins", "growth", "data"),
    logPaths: [
      path.posix.join(macRoot, "logs", "plugin-growth.out.log"),
      path.posix.join(macRoot, "logs", "plugin-growth.err.log"),
    ],
    registrationKeyPath: path.posix.join(macRoot, "data", "plugin-secrets", "growth-registration-key.txt"),
    ownerAccessKeyPath: path.posix.join(macRoot, "data", "secrets", "owner-web-key.secret"),
    bootstrap: Boolean(options.bootstrap),
  };
}

function execute(options = {}) {
  const password = readPassword(options.passwordFile);
  if (options.passwordFile && !password) throw new Error("sudo_password_file_empty");
  const currentPlan = plan(options);
  const plist = plistFor(options);
  runSudo("/bin/mkdir", ["-p", currentPlan.pluginRoot, currentPlan.dataDir, path.posix.dirname(currentPlan.registrationKeyPath), path.posix.dirname(currentPlan.plistPath), path.posix.dirname(currentPlan.logPaths[0])], password);
  runSudo("/bin/sh", ["-c", [
    "set -eu",
    "key_path=\"$1\"",
    "if [ ! -s \"$key_path\" ]; then",
    "  umask 077",
    "  /usr/bin/openssl rand -base64 32 > \"$key_path\"",
    "fi",
    "/usr/sbin/chown hermes-host:staff \"$key_path\"",
    "/bin/chmod 600 \"$key_path\"",
  ].join("\n"), "sh", currentPlan.registrationKeyPath], password);
  runSudo("/usr/bin/tee", [currentPlan.plistPath], password, plist);
  runSudo("/usr/sbin/chown", ["root:wheel", currentPlan.plistPath], password);
  runSudo("/bin/chmod", ["644", currentPlan.plistPath], password);
  runSudo("/usr/sbin/chown", ["-R", "hermes-host:staff", currentPlan.pluginRoot], password);
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
  const payload = {
    ok: true,
    mode: options.execute ? "execute" : "plan",
    plan: currentPlan,
    plist: plistFor(options),
    plistSha256: crypto.createHash("sha256").update(plistFor(options)).digest("hex"),
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
