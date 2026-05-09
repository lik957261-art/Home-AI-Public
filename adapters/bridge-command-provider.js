"use strict";

const path = require("node:path");

function valueFrom(value) {
  return typeof value === "function" ? value() : value;
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
    script,
    scriptPathForWsl,
    wslEnvArgs,
  };
}

module.exports = {
  createBridgeCommandProvider,
};
