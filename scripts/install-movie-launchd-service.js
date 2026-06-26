#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_MAC_ROOT = "/Users/example/path";
const DEFAULT_LABEL = "com.hermesmobile.plugin.movie";
const DEFAULT_LAUNCH_DAEMONS_DIR = "/Library/LaunchDaemons";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = "4195";

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
    host: argValue(argv, "--host", process.env.MOVIE_HOST || process.env.HOST || DEFAULT_HOST),
    port: argValue(argv, "--port", process.env.MOVIE_PORT || process.env.PORT || DEFAULT_PORT),
  };
}

function xmlEscape(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function envXml(env = {}) {
  return Object.entries(env).map(([key, value]) => [
    "      <key>", xmlEscape(key), "</key>\n",
    "      <string>", xmlEscape(value), "</string>",
  ].join("")).join("\n");
}

function plistFor(options = {}) {
  const currentPlan = plan(options);
  const nodePath = path.posix.join(currentPlan.macRoot, "runtime", "node-current", "bin", "node");
  const env = {
    PATH: `${path.posix.dirname(nodePath)}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
    NODE_ENV: "production",
    HOST: currentPlan.host,
    PORT: currentPlan.port,
    MOVIE_HOST: currentPlan.host,
    MOVIE_PORT: currentPlan.port,
    MOVIE_DATA_DIR: path.posix.join(currentPlan.pluginRoot, "data"),
    MOVIE_PUBLIC_BASE_URL: currentPlan.baseUrl,
  };
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${DEFAULT_LABEL}</string>
  <key>UserName</key>
  <string>hermes-host</string>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(currentPlan.pluginRoot)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(nodePath)}</string>
    <string>--no-warnings</string>
    <string>src/server.js</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${envXml(env)}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(currentPlan.logPaths[0])}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(currentPlan.logPaths[1])}</string>
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

function allowedExistingListener(listener = {}, currentPlan = {}) {
  const command = String(listener.command || "");
  return listener.user === currentPlan.serviceUser
    && command.includes(path.posix.join(currentPlan.pluginRoot, "src", "server.js"));
}

function assertMoviePortAvailable(currentPlan = {}, password = "") {
  const listeners = portListeners(currentPlan.port || DEFAULT_PORT, password);
  const unexpected = listeners.filter((listener) => !allowedExistingListener(listener, currentPlan));
  if (!unexpected.length) return listeners;
  const err = new Error(`movie_port_in_use:${currentPlan.host || DEFAULT_HOST}:${currentPlan.port || DEFAULT_PORT}`);
  err.listeners = unexpected.map((listener) => ({
    pid: listener.pid,
    user: listener.user,
    command: String(listener.command || "").slice(0, 240),
  }));
  throw err;
}

function installRootOwnedTextFile(targetPath, text, password, mode = "644", owner = "root:wheel") {
  const tempPath = path.join(os.tmpdir(), `home-ai-movie-launchd-${process.pid}-${crypto.randomUUID()}.tmp`);
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
  const pluginRoot = path.posix.join(macRoot, "plugins", "movie");
  const logsDir = path.posix.join(macRoot, "logs");
  return {
    label: DEFAULT_LABEL,
    pluginId: "movie",
    macRoot,
    plistPath: path.posix.join(options.launchDaemonsDir || DEFAULT_LAUNCH_DAEMONS_DIR, `${DEFAULT_LABEL}.plist`),
    pluginRoot,
    dataDir: path.posix.join(pluginRoot, "data"),
    logPaths: [
      path.posix.join(logsDir, "plugin-movie.out.log"),
      path.posix.join(logsDir, "plugin-movie.err.log"),
    ],
    host,
    port,
    baseUrl: `http://${host}:${port}`,
    serviceUser: "hermes-host",
    serviceGroup: "staff",
    bootstrap: Boolean(options.bootstrap),
  };
}

function execute(options = {}) {
  const password = readPassword(options.passwordFile);
  if (options.passwordFile && !password) throw new Error("sudo_password_file_empty");
  authenticateSudo(password);
  const currentPlan = plan(options);
  assertMoviePortAvailable(currentPlan, password);
  const plist = plistFor(options);
  runSudo("/bin/mkdir", ["-p", currentPlan.pluginRoot, currentPlan.dataDir, path.posix.dirname(currentPlan.plistPath), path.posix.dirname(currentPlan.logPaths[0])], password);
  for (const logPath of currentPlan.logPaths) runSudo("/usr/bin/touch", [logPath], password);
  runSudo("/usr/sbin/chown", ["-R", `${currentPlan.serviceUser}:${currentPlan.serviceGroup}`, currentPlan.pluginRoot], password);
  runSudo("/usr/sbin/chown", [`${currentPlan.serviceUser}:${currentPlan.serviceGroup}`, ...currentPlan.logPaths], password);
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

function payloadFor(options, currentPlan, plist) {
  return {
    ok: true,
    mode: options.execute ? "execute" : "plan",
    plan: currentPlan,
    plist,
    plistSha256: crypto.createHash("sha256").update(plist).digest("hex"),
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const currentPlan = options.execute ? execute(options) : plan(options);
  const plist = plistFor(options);
  console.log(JSON.stringify(payloadFor(options, currentPlan, plist), null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    const payload = { ok: false, error: err?.message || String(err) };
    if (err?.status != null) payload.status = err.status;
    if (err?.stderr) payload.stderr = err.stderr;
    if (err?.listeners) payload.listeners = err.listeners;
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_LABEL,
  DEFAULT_PORT,
  assertMoviePortAvailable,
  parseArgs,
  parseLsofPids,
  plan,
  plistFor,
};
