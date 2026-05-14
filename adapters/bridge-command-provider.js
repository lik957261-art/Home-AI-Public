"use strict";

const path = require("node:path");

function valueFrom(value) {
  return typeof value === "function" ? value() : value;
}

function compactBridgeText(value, maxLength) {
  const text = String(value || "");
  const limit = Math.max(0, Number(maxLength) || 0);
  if (!limit || text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

function envValue(env, name) {
  if (!name) return "";
  return String((env || process.env)[name] || "").trim();
}

function resolveScriptPath(env, envName, defaultPath) {
  const configured = envValue(env, envName);
  if (configured) return configured;
  return path.resolve(defaultPath);
}

function uncWslToPath(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^\\\\wsl(?:\.localhost|\$)\\[^\\]+\\(.+)$/i);
  if (!match) return "";
  return `/${match[1].replaceAll("\\", "/")}`;
}

function isWslAbsolutePath(value) {
  return /^\//.test(String(value || "").trim());
}

function createBridgeCommandProvider(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const wslDistro = options.wslDistro || (() => "Ubuntu-24.04");
  const windowsPathToWsl = options.windowsPathToWsl || ((value) => String(value || "").replaceAll("\\", "/"));

  function script(envName, defaultPath) {
    return resolveScriptPath(env, envName, defaultPath);
  }

  function scriptPathForWsl(scriptPath) {
    const text = String(scriptPath || "").trim();
    const unc = uncWslToPath(text);
    if (unc) return unc;
    if (isWslAbsolutePath(text)) return text;
    return windowsPathToWsl(text);
  }

  function wslEnvArgs(names = []) {
    const entries = [];
    for (const name of names || []) {
      const key = String(name || "").trim();
      if (!key) continue;
      const value = envValue(env, key);
      if (!value) continue;
      entries.push(`${key}=${value}`);
    }
    return entries;
  }

  function python(scriptPath, envNames = []) {
    if (platform === "win32") {
      const envArgs = wslEnvArgs([
        "HERMES_HOME",
        "HERMES_WEB_HERMES_HOME",
        "PYTHONPATH",
        ...envNames,
      ]);
      return {
        command: "wsl.exe",
        args: [
          "-d",
          String(valueFrom(wslDistro) || "Ubuntu-24.04"),
          "--",
          ...(envArgs.length ? ["env", ...envArgs] : []),
          "python3",
          scriptPathForWsl(scriptPath),
        ],
      };
    }
    return {
      command: "python3",
      args: [String(scriptPath || "")],
    };
  }

  return {
    python,
    runJsonCommand: (commandSpec, payload = {}, runOptions = {}) => runJsonBridgeCommand(Object.assign({}, runOptions, {
      commandSpec,
      payload,
    })),
    script,
    scriptPathForWsl,
    wslEnvArgs,
  };
}

function runJsonBridgeCommand(options = {}) {
  const spawn = options.spawn;
  if (typeof spawn !== "function") throw new Error("spawn is required");
  const commandSpec = options.commandSpec || {};
  const command = String(commandSpec.command || "");
  const args = Array.isArray(commandSpec.args) ? commandSpec.args : [];
  const label = String(options.label || "Bridge").trim() || "Bridge";
  const timeoutMs = Math.max(1, Number(options.timeoutMs) || 30000);
  const stdoutLimitBytes = Math.max(1, Number(options.stdoutLimitBytes) || 2_000_000);
  const stderrLimitBytes = Math.max(1, Number(options.stderrLimitBytes) || 200_000);
  const stderrPreviewBytes = Math.max(1, Number(options.stderrPreviewBytes) || 1200);
  const compactText = typeof options.compactText === "function" ? options.compactText : compactBridgeText;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`${label} timed out`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > stdoutLimitBytes) stdout = stdout.slice(-stdoutLimitBytes);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > stderrLimitBytes) stderr = stderr.slice(-stderrLimitBytes);
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      let result = null;
      try {
        result = JSON.parse(stdout.trim() || "{}");
      } catch (err) {
        reject(new Error(`${label} returned invalid JSON: ${err.message || String(err)}`));
        return;
      }
      if (code !== 0 && !result.error) {
        reject(new Error(stderr.trim() || `${label} exited with ${code}`));
        return;
      }
      if (stderr.trim()) result.stderr = compactText(stderr.trim(), stderrPreviewBytes);
      resolve(result);
    });
    child.stdin.end(JSON.stringify(options.payload || {}));
  });
}

module.exports = {
  createBridgeCommandProvider,
  runJsonBridgeCommand,
};
