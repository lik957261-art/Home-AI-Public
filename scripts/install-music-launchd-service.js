#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_MAC_ROOT = "/Users/example/path";
const DEFAULT_LABEL = "com.hermesmobile.plugin.music";
const DEFAULT_LAUNCH_DAEMONS_DIR = "/Library/LaunchDaemons";
const DEFAULT_PORT = "4891";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_ROON_CORE_HOST = "192.168.100.190";
const DEFAULT_ROON_CORE_PORT = "9330";
const MUSIC_SERVICE_SCRIPT = "src/roon-first-server.js";
const LEGACY_MUSIC_SERVICE_SCRIPT = "src/server.js";

function argValue(argv, name, fallback = "") {
  const index = argv.indexOf(name);
  return index >= 0 ? (argv[index + 1] || fallback) : fallback;
}

function parseArgs(argv) {
  return {
    execute: argv.includes("--execute"),
    json: argv.includes("--json"),
    bootstrap: argv.includes("--bootstrap"),
    roonEnabled: argv.includes("--roon-disabled")
      ? "0"
      : argValue(argv, "--roon-enabled", process.env.MUSIC_ROON_ENABLED || "1"),
    macRoot: argValue(argv, "--mac-root", process.env.HERMES_MOBILE_MAC_ROOT || DEFAULT_MAC_ROOT),
    launchDaemonsDir: argValue(argv, "--launch-daemons-dir", DEFAULT_LAUNCH_DAEMONS_DIR),
    passwordFile: argValue(argv, "--password-file", process.env.HOMEAI_MAC_SUDO_PASSWORD_FILE || ""),
    host: argValue(argv, "--host", process.env.MUSIC_PLUGIN_HOST || DEFAULT_HOST),
    port: argValue(argv, "--port", process.env.MUSIC_PLUGIN_PORT || DEFAULT_PORT),
    roonCoreHost: argValue(argv, "--roon-core-host", process.env.MUSIC_ROON_CORE_HOST || DEFAULT_ROON_CORE_HOST),
    roonCorePort: argValue(argv, "--roon-core-port", process.env.MUSIC_ROON_CORE_PORT || DEFAULT_ROON_CORE_PORT),
    audioStagingDir: argValue(argv, "--audio-staging-dir", process.env.MUSIC_AUDIO_STAGING_DIR || ""),
    smbDirectConfig: argValue(argv, "--smb-direct-config", process.env.MUSIC_SMB_DIRECT_CONFIG || ""),
    audioPathRemaps: argValue(argv, "--audio-path-remaps", process.env.MUSIC_AUDIO_PATH_REMAPS || ""),
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
  const roonEnabled = String(options.roonEnabled ?? "1");
  const roonCoreHost = String(options.roonCoreHost || DEFAULT_ROON_CORE_HOST);
  const roonCorePort = String(options.roonCorePort || DEFAULT_ROON_CORE_PORT);
  const nodePath = path.posix.join(macRoot, "runtime", "node-current", "bin", "node");
  const pluginRoot = path.posix.join(macRoot, "plugins", "music");
  const logsDir = path.posix.join(macRoot, "logs");
  const runtimeDir = path.posix.join(pluginRoot, "runtime");
  const defaultAudioStagingDir = path.posix.join(macRoot, "data", "music", "audio-staging");
  const defaultSmbDirectConfig = path.posix.join(macRoot, "data", "music", "secrets", "smb-direct-config.json");
  const env = {
    PATH: `${path.posix.join(macRoot, "runtime", "node-current", "bin")}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
    NODE_ENV: "production",
    MUSIC_PLUGIN_HOST: host,
    MUSIC_PLUGIN_PORT: port,
    MUSIC_PLUGIN_PUBLIC_BASE_URL: `http://${host}:${port}`,
    MUSIC_ROON_ENABLED: roonEnabled,
    MUSIC_ROON_STATE_PATH: path.posix.join(runtimeDir, "roon-state.json"),
    MUSIC_LISTENING_DB_PATH: path.posix.join(runtimeDir, "listening-ledger.sqlite3"),
    MUSIC_AUDIO_STAGING_DIR: String(options.audioStagingDir || defaultAudioStagingDir),
    MUSIC_SMB_DIRECT_CONFIG: String(options.smbDirectConfig || defaultSmbDirectConfig),
  };
  if (roonCoreHost) env.MUSIC_ROON_CORE_HOST = roonCoreHost;
  if (roonCorePort) env.MUSIC_ROON_CORE_PORT = roonCorePort;
  if (options.audioPathRemaps) env.MUSIC_AUDIO_PATH_REMAPS = String(options.audioPathRemaps);
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
    <string>--no-warnings</string>
    <string>${xmlEscape(MUSIC_SERVICE_SCRIPT)}</string>
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
  <string>${xmlEscape(path.posix.join(logsDir, "plugin-music.out.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(path.posix.join(logsDir, "plugin-music.err.log"))}</string>
</dict>
</plist>
`;
}

function readPassword(filePath) {
  if (!filePath) return "";
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).find((line) => line.trim()) || "";
}

function runSudo(command, args, password, input = "") {
  const result = spawnSync("/usr/bin/sudo", ["-n", command, ...args], {
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

function runSudoRaw(command, args, password) {
  return spawnSync("/usr/bin/sudo", ["-n", command, ...args], {
    input: "",
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
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

function parseLsofPids(output = "") {
  return [...new Set(String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^p\d+$/.test(line))
    .map((line) => line.slice(1)))];
}

function processDetails(pid) {
  const result = spawnSync("/bin/ps", ["-p", String(pid), "-o", "user=", "-o", "command="], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  const line = String(result.stdout || "").trim();
  const match = line.match(/^(\S+)\s+([\s\S]+)$/);
  return {
    pid: String(pid),
    user: match ? match[1] : "",
    command: match ? match[2] : line,
  };
}

function portListeners(port, password = "") {
  const result = runSudoRaw("/usr/sbin/lsof", ["-nP", `-iTCP:${String(port)}`, "-sTCP:LISTEN", "-F", "p"], password);
  if (result.status !== 0 && !String(result.stdout || "").trim()) return [];
  return parseLsofPids(result.stdout).map(processDetails);
}

function allowedExistingListener(listener = {}, planInfo = {}) {
  const command = String(listener.command || "");
  if (listener.user !== "hermes-host") return false;
  const allowedScripts = [
    MUSIC_SERVICE_SCRIPT,
    LEGACY_MUSIC_SERVICE_SCRIPT,
    path.posix.join(planInfo.pluginRoot, MUSIC_SERVICE_SCRIPT),
    path.posix.join(planInfo.pluginRoot, LEGACY_MUSIC_SERVICE_SCRIPT),
  ];
  return allowedScripts.some((script) => command.includes(script));
}

function assertMusicPortAvailable(planInfo = {}, password = "") {
  const listeners = portListeners(planInfo.port || DEFAULT_PORT, password);
  const unexpected = listeners.filter((listener) => !allowedExistingListener(listener, planInfo));
  if (!unexpected.length) return listeners;
  const err = new Error(`music_port_in_use:${planInfo.host || DEFAULT_HOST}:${planInfo.port || DEFAULT_PORT}`);
  err.listeners = unexpected.map((listener) => ({
    pid: listener.pid,
    user: listener.user,
    command: String(listener.command || "").slice(0, 240),
  }));
  throw err;
}

function installRootOwnedTextFile(targetPath, text, password, mode = "644", owner = "root:wheel") {
  const tempPath = path.join(os.tmpdir(), `home-ai-music-launchd-${process.pid}-${crypto.randomUUID()}.tmp`);
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
    pluginRoot: path.posix.join(macRoot, "plugins", "music"),
    runtimeDir: path.posix.join(macRoot, "plugins", "music", "runtime"),
    logPaths: [
      path.posix.join(macRoot, "logs", "plugin-music.out.log"),
      path.posix.join(macRoot, "logs", "plugin-music.err.log"),
    ],
    host,
    port,
    baseUrl: `http://${host}:${port}`,
    roonEnabled: String(options.roonEnabled ?? "1"),
    roonCoreHost: String(options.roonCoreHost || DEFAULT_ROON_CORE_HOST),
    roonCorePort: String(options.roonCorePort || DEFAULT_ROON_CORE_PORT),
    audioStagingDir: String(options.audioStagingDir || path.posix.join(macRoot, "data", "music", "audio-staging")),
    smbDirectConfig: String(options.smbDirectConfig || path.posix.join(macRoot, "data", "music", "secrets", "smb-direct-config.json")),
    audioPathRemapsConfigured: Boolean(options.audioPathRemaps),
    bootstrap: Boolean(options.bootstrap),
  };
}

function execute(options = {}) {
  const password = readPassword(options.passwordFile);
  if (options.passwordFile && !password) throw new Error("sudo_password_file_empty");
  authenticateSudo(password);
  const currentPlan = plan(options);
  assertMusicPortAvailable(currentPlan, password);
  const plist = plistFor(options);
  runSudo("/bin/mkdir", ["-p", currentPlan.pluginRoot, currentPlan.runtimeDir, path.posix.dirname(currentPlan.plistPath), path.posix.dirname(currentPlan.logPaths[0])], password);
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
    if (err?.listeners) payload.listeners = err.listeners;
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_LABEL,
  MUSIC_SERVICE_SCRIPT,
  allowedExistingListener,
  assertMusicPortAvailable,
  parseArgs,
  parseLsofPids,
  plan,
  plistFor,
};
