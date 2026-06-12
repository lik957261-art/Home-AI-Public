"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_ROOT = "/Users/hermes-host/HermesMobile";
const LABEL = "com.hermesmobile.whisper-large-v3-turbo";
const SERVICE_REL = "services/whisper-large-v3-turbo";
const PYTHON = "/usr/bin/python3";
const LOCAL_MODEL_DIRNAME = "mobiuslabsgmbh-faster-whisper-large-v3-turbo";

function argValue(name, fallback = "") {
  const names = Array.isArray(name) ? name : [name];
  for (let index = 2; index < process.argv.length; index += 1) {
    const item = process.argv[index];
    for (const key of names) {
      if (item === key && index + 1 < process.argv.length) return process.argv[index + 1];
      if (item.startsWith(`${key}=`)) return item.slice(key.length + 1);
    }
  }
  return fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).includes(name);
}

function shQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readPassword(file) {
  if (!file) return "";
  try {
    return fs.readFileSync(file, "utf8").trimEnd();
  } catch (_err) {
    return "";
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    input: options.input || "",
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const err = new Error(`${path.basename(command)}_failed`);
    err.status = result.status;
    err.stdout = String(result.stdout || "").slice(0, 1200);
    err.stderr = String(result.stderr || "").slice(0, 1200);
    throw err;
  }
  return result;
}

function sudo(command, args, password, input = "") {
  const sudoArgs = password ? ["-S", "-p", "", command, ...args] : ["-n", command, ...args];
  return run("/usr/bin/sudo", sudoArgs, { input: password ? `${password}\n${input}` : input });
}

function installRootOwnedTextFile(targetPath, text, password) {
  const tempPath = path.join(os.tmpdir(), `home-ai-whisper-${process.pid}-${Date.now()}.tmp`);
  fs.writeFileSync(tempPath, text, { encoding: "utf8", mode: 0o600 });
  try {
    sudo("/usr/bin/install", ["-m", "644", "-o", "root", "-g", "wheel", tempPath, targetPath], password);
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch (_err) {}
  }
}

function paths(root) {
  const sourceRoot = path.posix.join(root, "app", SERVICE_REL);
  const serviceRoot = path.posix.join(root, SERVICE_REL);
  return {
    root,
    sourceRoot,
    serviceRoot,
    sourceAppPy: path.posix.join(sourceRoot, "app.py"),
    appPy: path.posix.join(serviceRoot, "app.py"),
    requirements: path.posix.join(serviceRoot, "requirements.txt"),
    start: path.posix.join(serviceRoot, "start.sh"),
    venvPython: path.posix.join(serviceRoot, ".venv", "bin", "python"),
    pip: path.posix.join(serviceRoot, ".venv", "bin", "pip"),
    localModelDir: path.posix.join(serviceRoot, "models", LOCAL_MODEL_DIRNAME),
    logsRoot: path.posix.join(root, "logs"),
    stdoutLog: path.posix.join(root, "logs", "whisper-large-v3-turbo.out.log"),
    stderrLog: path.posix.join(root, "logs", "whisper-large-v3-turbo.err.log"),
    plistPath: `/Library/LaunchDaemons/${LABEL}.plist`,
  };
}

function plistFor(root) {
  const p = paths(root);
  const env = {
    PORT: "8001",
    HOST: "127.0.0.1",
    WHISPER_MODEL: "mobiuslabsgmbh/faster-whisper-large-v3-turbo",
    WHISPER_DEVICE: "cpu",
    WHISPER_COMPUTE_TYPE: "int8",
    WHISPER_BATCH_SIZE: "4",
    WHISPER_BEAM_SIZE: "5",
    HF_HOME: path.posix.join(p.serviceRoot, "models", "huggingface"),
    HF_ENDPOINT: "https://hf-mirror.com",
    WHISPER_TMP_DIR: path.posix.join(p.serviceRoot, "tmp"),
  };
  const envRows = Object.entries(env)
    .map(([key, value]) => `    <key>${xmlEscape(key)}</key>\n    <string>${xmlEscape(value)}</string>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>UserName</key>
  <string>hermes-host</string>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(p.serviceRoot)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(p.start)}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${envRows}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(p.stdoutLog)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(p.stderrLog)}</string>
</dict>
</plist>
`;
}

function waitForHealth(timeoutMs = 15000) {
  const started = Date.now();
  let last = "";
  while (Date.now() - started < timeoutMs) {
    const result = spawnSync("/usr/bin/curl", ["-fsS", "-m", "3", "http://127.0.0.1:8001/health"], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (result.status === 0) return { ok: true, body: String(result.stdout || "").slice(0, 1000) };
    last = String(result.stderr || result.stdout || "").slice(0, 600);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  return { ok: false, error: last || "health_timeout" };
}

function main() {
  const root = argValue("--root", process.env.HERMES_MOBILE_MAC_ROOT || DEFAULT_ROOT);
  const passwordFile = argValue("--password-file", process.env.HOMEAI_MAC_SUDO_PASSWORD_FILE || "");
  const execute = hasFlag("--execute");
  const json = hasFlag("--json");
  const password = readPassword(passwordFile);
  const p = paths(root);
  const plan = {
    label: LABEL,
    root,
    sourceRoot: p.sourceRoot,
    serviceRoot: p.serviceRoot,
    plistPath: p.plistPath,
    healthUrl: "http://127.0.0.1:8001/health",
    execute,
  };
  if (!execute) {
    console.log(json ? JSON.stringify({ ok: true, plan }, null, 2) : `plan ${LABEL} ${p.serviceRoot}`);
    return;
  }

  sudo("/bin/test", ["-f", p.sourceAppPy], password);
  sudo("/bin/mkdir", ["-p", p.serviceRoot, p.logsRoot], password);
  sudo("/usr/bin/rsync", ["-a", "--delete", "--exclude", ".venv/", "--exclude", "models/", "--exclude", "tmp/", `${p.sourceRoot}/`, `${p.serviceRoot}/`], password);
  sudo("/bin/chmod", ["755", p.start], password);
  sudo("/bin/mkdir", ["-p", p.localModelDir, path.posix.join(p.serviceRoot, "models", "huggingface"), path.posix.join(p.serviceRoot, "tmp")], password);
  sudo("/usr/sbin/chown", ["-R", "hermes-host:staff", p.serviceRoot, p.logsRoot], password);
  sudo("/bin/chmod", ["755", p.serviceRoot, path.posix.join(p.serviceRoot, "models"), p.localModelDir, path.posix.join(p.serviceRoot, "models", "huggingface"), path.posix.join(p.serviceRoot, "tmp")], password);
  if (!fs.existsSync(p.venvPython)) {
    sudo(PYTHON, ["-m", "venv", p.venvPython.replace(/\/bin\/python$/, "")], password);
  }
  sudo(p.pip, ["install", "--upgrade", "pip"], password);
  sudo(p.pip, ["install", "-r", p.requirements], password);
  sudo("/usr/bin/touch", [p.stdoutLog, p.stderrLog], password);
  sudo("/usr/sbin/chown", ["hermes-host:staff", p.stdoutLog, p.stderrLog], password);
  installRootOwnedTextFile(p.plistPath, plistFor(root), password);
  sudo("/usr/bin/plutil", ["-lint", p.plistPath], password);
  sudo("/bin/sh", ["-c", `/bin/launchctl bootout system ${shQuote(p.plistPath)} >/dev/null 2>&1 || true`], password);
  sudo("/bin/launchctl", ["bootstrap", "system", p.plistPath], password);
  sudo("/bin/launchctl", ["kickstart", "-k", `system/${LABEL}`], password);
  const health = waitForHealth(20000);
  const result = { ok: health.ok, plan, health };
  console.log(json ? JSON.stringify(result, null, 2) : `installed ${LABEL} health=${health.ok}`);
  if (!health.ok) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    const payload = { ok: false, error: err?.message || String(err) };
    if (err?.stderr) payload.stderr = err.stderr;
    if (err?.stdout) payload.stdout = err.stdout;
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  }
}

module.exports = {
  LABEL,
  paths,
  plistFor,
};
