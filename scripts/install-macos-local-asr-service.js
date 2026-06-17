"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_ROOT = "/Users/example/path";
const PYTHON = "/usr/bin/python3";

const ENGINES = Object.freeze({
  funasr: {
    id: "funasr",
    serviceId: "funasr-local",
    label: "com.hermesmobile.funasr-local",
    serviceRel: "services/funasr-local",
    port: "8002",
    env: {
      PORT: "8002",
      HOST: "127.0.0.1",
      LOCAL_ASR_SERVICE_ID: "funasr-local",
      FUNASR_MODEL: "paraformer-zh",
      FUNASR_VAD_MODEL: "fsmn-vad",
      FUNASR_PUNC_MODEL: "ct-punc",
      FUNASR_DEVICE: "cpu",
      FUNASR_BATCH_SIZE_S: "60",
      FUNASR_MERGE_VAD: "1",
      FUNASR_MERGE_LENGTH_S: "15",
      FUNASR_STREAMING_MODEL: "paraformer-zh-streaming",
      FUNASR_STREAMING_SAMPLE_RATE: "16000",
      FUNASR_STREAMING_CHUNK_SIZE: "0,10,5",
      FUNASR_STREAMING_ENCODER_LOOK_BACK: "4",
      FUNASR_STREAMING_DECODER_LOOK_BACK: "1",
      FUNASR_STREAMING_MAX_SECONDS: "45",
    },
  },
  sensevoice: {
    id: "sensevoice",
    serviceId: "sensevoice-local",
    label: "com.hermesmobile.sensevoice-local",
    serviceRel: "services/sensevoice-local",
    port: "8003",
    env: {
      PORT: "8003",
      HOST: "127.0.0.1",
      LOCAL_ASR_SERVICE_ID: "sensevoice-local",
      SENSEVOICE_MODEL: "iic/SenseVoiceSmall",
      SENSEVOICE_VAD_MODEL: "fsmn-vad",
      SENSEVOICE_DEVICE: "cpu",
      SENSEVOICE_BATCH_SIZE_S: "60",
      SENSEVOICE_MERGE_VAD: "1",
      SENSEVOICE_MERGE_LENGTH_S: "15",
      SENSEVOICE_USE_ITN: "1",
    },
  },
});

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
  const tempPath = path.join(os.tmpdir(), `home-ai-local-asr-${process.pid}-${Date.now()}.tmp`);
  fs.writeFileSync(tempPath, text, { encoding: "utf8", mode: 0o600 });
  try {
    sudo("/usr/bin/install", ["-m", "644", "-o", "root", "-g", "wheel", tempPath, targetPath], password);
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch (_err) {}
  }
}

function paths(root, engine) {
  const sourceRoot = path.posix.join(root, "app", engine.serviceRel);
  const serviceRoot = path.posix.join(root, engine.serviceRel);
  return {
    root,
    sourceRoot,
    serviceRoot,
    sourceAppPy: path.posix.join(sourceRoot, "app.py"),
    appPy: path.posix.join(serviceRoot, "app.py"),
    requirements: path.posix.join(serviceRoot, "requirements.txt"),
    start: path.posix.join(serviceRoot, "start.sh"),
    venvRoot: path.posix.join(serviceRoot, ".venv"),
    venvPython: path.posix.join(serviceRoot, ".venv", "bin", "python"),
    pip: path.posix.join(serviceRoot, ".venv", "bin", "pip"),
    modelsRoot: path.posix.join(serviceRoot, "models"),
    tmpRoot: path.posix.join(serviceRoot, "tmp"),
    logsRoot: path.posix.join(root, "logs"),
    stdoutLog: path.posix.join(root, "logs", `${engine.serviceId}.out.log`),
    stderrLog: path.posix.join(root, "logs", `${engine.serviceId}.err.log`),
    plistPath: `/Library/LaunchDaemons/${engine.label}.plist`,
    healthUrl: `http://127.0.0.1:${engine.port}/health`,
  };
}

function plistFor(root, engine) {
  const p = paths(root, engine);
  const env = Object.assign({}, engine.env, {
    MODELSCOPE_CACHE: path.posix.join(p.modelsRoot, "modelscope"),
  });
  if (engine.id === "funasr") env.FUNASR_TMP_DIR = p.tmpRoot;
  if (engine.id === "sensevoice") env.SENSEVOICE_TMP_DIR = p.tmpRoot;
  const envRows = Object.entries(env)
    .map(([key, value]) => `    <key>${xmlEscape(key)}</key>\n    <string>${xmlEscape(value)}</string>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(engine.label)}</string>
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

function waitForHealth(url, timeoutMs = 90000) {
  const started = Date.now();
  let last = "";
  while (Date.now() - started < timeoutMs) {
    const result = spawnSync("/usr/bin/curl", ["-fsS", "-m", "3", url], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (result.status === 0) {
      const body = String(result.stdout || "").slice(0, 1600);
      try {
        const parsed = JSON.parse(body);
        if (parsed && parsed.package_available === false) {
          return { ok: false, body, error: "asr_package_unavailable" };
        }
      } catch (_err) {}
      return { ok: true, body };
    }
    last = String(result.stderr || result.stdout || "").slice(0, 600);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  return { ok: false, error: last || "health_timeout" };
}

function selectedEngine() {
  const value = String(argValue(["--engine", "--service"], "funasr")).trim().toLowerCase();
  if (!ENGINES[value]) {
    throw new Error(`unsupported_engine:${value}`);
  }
  return ENGINES[value];
}

function main() {
  const root = argValue("--root", process.env.HERMES_MOBILE_MAC_ROOT || DEFAULT_ROOT);
  const passwordFile = argValue("--password-file", process.env.HOMEAI_MAC_SUDO_PASSWORD_FILE || "");
  const execute = hasFlag("--execute");
  const skipPip = hasFlag("--skip-pip");
  const json = hasFlag("--json");
  const engine = selectedEngine();
  const password = readPassword(passwordFile);
  const p = paths(root, engine);
  const plan = {
    engine: engine.id,
    serviceId: engine.serviceId,
    label: engine.label,
    root,
    sourceRoot: p.sourceRoot,
    serviceRoot: p.serviceRoot,
    plistPath: p.plistPath,
    healthUrl: p.healthUrl,
    execute,
    skipPip,
  };
  if (!execute) {
    console.log(json ? JSON.stringify({ ok: true, plan }, null, 2) : `plan ${engine.label} ${p.serviceRoot}`);
    return;
  }

  sudo("/bin/test", ["-f", p.sourceAppPy], password);
  sudo("/bin/mkdir", ["-p", p.serviceRoot, p.logsRoot], password);
  sudo("/usr/bin/rsync", ["-a", "--delete", "--exclude", ".venv/", "--exclude", "models/", "--exclude", "tmp/", `${p.sourceRoot}/`, `${p.serviceRoot}/`], password);
  sudo("/bin/chmod", ["755", p.start], password);
  sudo("/bin/mkdir", ["-p", p.modelsRoot, path.posix.join(p.modelsRoot, "modelscope"), p.tmpRoot], password);
  sudo("/usr/sbin/chown", ["-R", "hermes-host:staff", p.serviceRoot, p.logsRoot], password);
  sudo("/bin/chmod", ["755", p.serviceRoot, p.modelsRoot, path.posix.join(p.modelsRoot, "modelscope"), p.tmpRoot], password);
  if (!fs.existsSync(p.venvPython)) {
    sudo(PYTHON, ["-m", "venv", p.venvRoot], password);
  }
  if (!skipPip) {
    sudo(p.pip, ["install", "--upgrade", "pip"], password);
    sudo(p.pip, ["install", "-r", p.requirements], password);
  }
  sudo("/usr/bin/touch", [p.stdoutLog, p.stderrLog], password);
  sudo("/usr/sbin/chown", ["hermes-host:staff", p.stdoutLog, p.stderrLog], password);
  installRootOwnedTextFile(p.plistPath, plistFor(root, engine), password);
  sudo("/usr/bin/plutil", ["-lint", p.plistPath], password);
  sudo("/bin/sh", ["-c", `/bin/launchctl bootout system ${shQuote(p.plistPath)} >/dev/null 2>&1 || true`], password);
  sudo("/bin/launchctl", ["bootstrap", "system", p.plistPath], password);
  sudo("/bin/launchctl", ["kickstart", "-k", `system/${engine.label}`], password);
  const health = waitForHealth(p.healthUrl, 90000);
  const result = { ok: health.ok, plan, health };
  console.log(json ? JSON.stringify(result, null, 2) : `installed ${engine.label} health=${health.ok}`);
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
  ENGINES,
  paths,
  plistFor,
};
