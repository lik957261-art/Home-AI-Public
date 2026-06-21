"use strict";

const crypto = require("node:crypto");
const path = require("node:path");

const DEFAULT_MAC_ROOT = "/Users/example/path";
const DEFAULT_LAUNCH_DAEMONS_DIR = "/Library/LaunchDaemons";

function argValue(argv, name, fallback = "") {
  const index = argv.indexOf(name);
  return index >= 0 ? (argv[index + 1] || fallback) : fallback;
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

function buildLaunchdPlist(service = {}) {
  const argsXml = (service.programArguments || []).map((item) => `    <string>${xmlEscape(item)}</string>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(service.label)}</string>
  <key>UserName</key>
  <string>${xmlEscape(service.userName || "hermes-host")}</string>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(service.workingDirectory)}</string>
  <key>ProgramArguments</key>
  <array>
${argsXml}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${envXml(service.environment || {})}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(service.stdoutLog)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(service.stderrLog)}</string>
</dict>
</plist>
`;
}

function baseParseArgs(argv, defaults = {}) {
  return {
    execute: argv.includes("--execute"),
    json: argv.includes("--json"),
    bootstrap: argv.includes("--bootstrap"),
    macRoot: argValue(argv, "--mac-root", process.env.HERMES_MOBILE_MAC_ROOT || defaults.macRoot || DEFAULT_MAC_ROOT),
    launchDaemonsDir: argValue(argv, "--launch-daemons-dir", defaults.launchDaemonsDir || DEFAULT_LAUNCH_DAEMONS_DIR),
    host: argValue(argv, "--host", defaults.host || "127.0.0.1"),
    port: argValue(argv, "--port", defaults.port || ""),
    serviceUser: argValue(argv, "--service-user", defaults.serviceUser || "hermes-host"),
  };
}

function servicePaths(options = {}, spec = {}) {
  const macRoot = options.macRoot || DEFAULT_MAC_ROOT;
  const sourceDir = spec.sourceDir || spec.pluginId;
  const pluginRoot = path.posix.join(macRoot, "plugins", sourceDir);
  const logsDir = path.posix.join(macRoot, "logs");
  const label = spec.label;
  return {
    macRoot,
    pluginRoot,
    logsDir,
    plistPath: path.posix.join(options.launchDaemonsDir || DEFAULT_LAUNCH_DAEMONS_DIR, `${label}.plist`),
    stdoutLog: path.posix.join(logsDir, `plugin-${spec.pluginId}.out.log`),
    stderrLog: path.posix.join(logsDir, `plugin-${spec.pluginId}.err.log`),
    nodePath: path.posix.join(macRoot, "runtime", "node-current", "bin", "node"),
    pythonPath: path.posix.join(macRoot, "runtime", "hermes-agent-official", "venv", "bin", "python"),
  };
}

function createPlan(options = {}, spec = {}) {
  const paths = servicePaths(options, spec);
  const host = options.host || "127.0.0.1";
  const port = String(options.port || spec.defaultPort || "");
  return {
    label: spec.label,
    pluginId: spec.pluginId,
    plistPath: paths.plistPath,
    pluginRoot: paths.pluginRoot,
    logPaths: [paths.stdoutLog, paths.stderrLog],
    host,
    port,
    baseUrl: port ? `http://${host}:${port}` : "",
    serviceUser: options.serviceUser || spec.serviceUser || "hermes-host",
    bootstrap: Boolean(options.bootstrap),
  };
}

function payloadFor(options, spec, plan, plist) {
  return {
    ok: true,
    mode: options.execute ? "execute" : "plan",
    plan,
    plist,
    plistSha256: crypto.createHash("sha256").update(plist).digest("hex"),
  };
}

module.exports = {
  DEFAULT_LAUNCH_DAEMONS_DIR,
  DEFAULT_MAC_ROOT,
  argValue,
  baseParseArgs,
  buildLaunchdPlist,
  createPlan,
  payloadFor,
  servicePaths,
  xmlEscape,
};
