"use strict";

const fs = require("node:fs");

const DIRECT_KEY_ENV_NAMES = Object.freeze([
  "HERMES_WEB_HERMES_API_KEY",
  "HERMES_API_KEY",
  "API_SERVER_KEY",
]);

function readOption(value) {
  return typeof value === "function" ? value() : value;
}

function listOption(value) {
  const resolved = readOption(value);
  return Array.isArray(resolved) ? resolved.filter(Boolean) : [];
}

function directEnvKey(env = {}) {
  for (const name of DIRECT_KEY_ENV_NAMES) {
    const value = String(env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

function parseKeyFileText(text) {
  const raw = String(text || "").trim();
  const match = raw.match(/^\s*(?:export\s+)?(?:API_SERVER_KEY|HERMES_API_KEY)\s*=\s*(.+?)\s*$/m);
  const value = match ? match[1].replace(/^['"]|['"]$/g, "").trim() : raw;
  return value || "";
}

function parseEnvFileText(text) {
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?(?:API_SERVER_KEY|HERMES_API_KEY)\s*=\s*(.+?)\s*$/);
    if (!match) continue;
    const value = match[1].replace(/^['"]|['"]$/g, "").trim();
    if (value) return value;
  }
  return "";
}

function createRuntimeConfigKeyService(options = {}) {
  const load = typeof options.load === "function" ? options.load : () => ({});
  const fileExists = typeof options.fileExists === "function" ? options.fileExists : (targetPath) => fs.existsSync(targetPath);
  const readFile = typeof options.readFile === "function" ? options.readFile : (targetPath) => fs.readFileSync(targetPath, "utf8");
  const apiKeyPaths = () => listOption(options.apiKeyPaths);
  const envPaths = () => listOption(options.envPaths);

  function configuredHermesApiKeyPaths(config = load()) {
    const runtimePath = String(config?.hermesApiKeyPath || "").trim();
    return [runtimePath, ...apiKeyPaths()].filter(Boolean);
  }

  function loadHermesApiKey(env = process.env) {
    const direct = directEnvKey(env);
    if (direct) return direct;
    for (const keyPath of configuredHermesApiKeyPaths()) {
      try {
        if (keyPath && fileExists(keyPath)) {
          const value = parseKeyFileText(readFile(keyPath));
          if (value) return value;
        }
      } catch (_) {}
    }
    for (const envPath of envPaths()) {
      try {
        if (envPath && fileExists(envPath)) {
          const value = parseEnvFileText(readFile(envPath));
          if (value) return value;
        }
      } catch (_) {}
    }
    return "";
  }

  function hermesApiKeyStatus(env = process.env) {
    if (directEnvKey(env)) return { configured: true, source: "env", path: "" };
    for (const keyPath of configuredHermesApiKeyPaths()) {
      try {
        if (keyPath && fileExists(keyPath) && String(readFile(keyPath)).trim()) {
          return { configured: true, source: "file", path: keyPath };
        }
      } catch (_) {}
    }
    for (const envPath of envPaths()) {
      try {
        if (envPath && fileExists(envPath) && /^\s*(?:export\s+)?(?:API_SERVER_KEY|HERMES_API_KEY)\s*=/m.test(readFile(envPath))) {
          return { configured: true, source: "env-file", path: envPath };
        }
      } catch (_) {}
    }
    return { configured: false, source: "", path: "" };
  }

  return Object.freeze({
    configuredHermesApiKeyPaths,
    hermesApiKeyStatus,
    loadHermesApiKey,
  });
}

module.exports = {
  createRuntimeConfigKeyService,
  parseEnvFileText,
  parseKeyFileText,
};
