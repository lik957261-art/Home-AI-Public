"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

const DEFAULT_COOLDOWN_MS = 120000;
const DEFAULT_COMMAND_TIMEOUT_MS = 10000;
const DEFAULT_RETRY_DELAY_MS = 1200;
const SAFE_LAUNCHD_LABEL_PREFIX = "com.hermesmobile.plugin.";

function stringValue(value) {
  return String(value || "").trim();
}

function bounded(value, max = 160) {
  return stringValue(value).replace(/\s+/g, " ").slice(0, max);
}

function boolFromEnv(value, fallback = false) {
  const text = stringValue(value).toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
}

function numberFromEnv(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function envKeyForPlugin(pluginId, suffix) {
  return `HERMES_MOBILE_PLUGIN_${stringValue(pluginId).toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_${suffix}`;
}

function normalizeUrl(value = "") {
  try {
    const parsed = new URL(stringValue(value));
    parsed.hash = "";
    return parsed.toString();
  } catch (_) {
    return stringValue(value);
  }
}

function isLoopbackOrPrivateHostname(hostname = "") {
  const host = stringValue(hostname).toLowerCase();
  if (!host) return false;
  if (["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"].includes(host)) return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  const match = host.match(/^172\.(\d+)\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function isLocalOrPrivateManifestUrl(value = "") {
  try {
    const parsed = new URL(stringValue(value));
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    return isLoopbackOrPrivateHostname(parsed.hostname);
  } catch (_) {
    return false;
  }
}

function isSafeLaunchdLabel(label = "") {
  const text = stringValue(label);
  return text.startsWith(SAFE_LAUNCHD_LABEL_PREFIX)
    && /^[A-Za-z0-9_.-]+$/.test(text)
    && !text.includes("..");
}

function readPluginSources(filePath = "") {
  const target = stringValue(filePath);
  if (!target) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(target, "utf8"));
    return Array.isArray(raw?.plugins) ? raw.plugins : [];
  } catch (_) {
    return [];
  }
}

function resolvePluginLaunchdLabel(input = {}, options = {}) {
  const env = options.env || process.env || {};
  const pluginId = stringValue(input.pluginId || input.id);
  const manifestUrl = normalizeUrl(input.manifestUrl);
  const direct = stringValue(input.launchdLabel || input.label);
  if (direct) return direct;

  const envSpecific = stringValue(env[envKeyForPlugin(pluginId, "LAUNCHD_LABEL")]);
  if (envSpecific) return envSpecific;

  const sources = Array.isArray(options.pluginSources)
    ? options.pluginSources
    : readPluginSources(options.pluginSourcesPath || path.join(process.cwd(), "config", "public-plugin-sources.json"));
  const matched = sources.find((item) => {
    const sourceId = stringValue(item?.id);
    if (sourceId && sourceId === pluginId) return true;
    if (manifestUrl && normalizeUrl(item?.manifestUrl) === manifestUrl) return true;
    return false;
  });
  if (matched?.launchdLabel) return stringValue(matched.launchdLabel);

  if (pluginId) return `${SAFE_LAUNCHD_LABEL_PREFIX}${pluginId}`;
  return "";
}

function recoverableManifestFailure(failure = {}) {
  const code = stringValue(failure.code);
  if (code === "plugin_manifest_error" || code === "plugin_manifest_timeout") return true;
  if (code !== "plugin_manifest_fetch_failed") return false;
  const status = Number(failure.status || 0);
  return status === 0 || status === 502 || status === 503 || status === 504;
}

function execFilePromise(command, args, options = {}, execFileImpl = execFile) {
  return new Promise((resolve) => {
    execFileImpl(command, args, options, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error?.code === undefined ? 0 : stringValue(error.code),
        signal: stringValue(error?.signal),
        stdout: bounded(stdout, 240),
        stderr: bounded(stderr, 240),
        error: error ? bounded(error.message || error) : "",
      });
    });
  });
}

function createPluginLaunchRecoveryService(options = {}) {
  const env = options.env || process.env || {};
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : () => Date.now();
  const execFileImpl = options.execFile || execFile;
  const platform = stringValue(options.platform || process.platform);
  const cooldownMs = numberFromEnv(
    env.HERMES_MOBILE_PLUGIN_RECOVERY_COOLDOWN_MS || env.HERMES_WEB_PLUGIN_RECOVERY_COOLDOWN_MS,
    options.cooldownMs ?? DEFAULT_COOLDOWN_MS,
  );
  const commandTimeoutMs = numberFromEnv(
    env.HERMES_MOBILE_PLUGIN_RECOVERY_COMMAND_TIMEOUT_MS || env.HERMES_WEB_PLUGIN_RECOVERY_COMMAND_TIMEOUT_MS,
    options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
  );
  const retryDelayMs = numberFromEnv(
    env.HERMES_MOBILE_PLUGIN_RECOVERY_RETRY_DELAY_MS || env.HERMES_WEB_PLUGIN_RECOVERY_RETRY_DELAY_MS,
    options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
  );
  const command = stringValue(
    options.command
    || env.HERMES_MOBILE_PLUGIN_RECOVERY_COMMAND
    || env.HERMES_WEB_PLUGIN_RECOVERY_COMMAND,
  );
  const launchctlPath = stringValue(options.launchctlPath || env.HERMES_MOBILE_LAUNCHCTL_PATH) || "/bin/launchctl";
  const enabled = options.enabled !== undefined
    ? options.enabled === true
    : boolFromEnv(
      env.HERMES_MOBILE_PLUGIN_RECOVERY_ENABLED || env.HERMES_WEB_PLUGIN_RECOVERY_ENABLED,
      platform === "darwin",
    );
  const lastAttemptByLabel = options.lastAttemptByLabel instanceof Map ? options.lastAttemptByLabel : new Map();

  async function recover(input = {}) {
    const pluginId = stringValue(input.pluginId || input.id);
    const manifestUrl = stringValue(input.manifestUrl);
    const failure = input.failure || {};
    const label = resolvePluginLaunchdLabel({
      pluginId,
      manifestUrl,
      launchdLabel: input.launchdLabel,
    }, {
      env,
      pluginSources: options.pluginSources,
      pluginSourcesPath: options.pluginSourcesPath,
    });
    const base = {
      attempted: false,
      restarted: false,
      pluginId,
      launchdLabel: isSafeLaunchdLabel(label) ? label : "",
      retryDelayMs,
    };
    if (!enabled) return Object.assign(base, { reason: "plugin_recovery_disabled" });
    if (!recoverableManifestFailure(failure)) return Object.assign(base, { reason: "manifest_failure_not_recoverable" });
    if (!isLocalOrPrivateManifestUrl(manifestUrl)) return Object.assign(base, { reason: "manifest_url_not_local" });
    if (!isSafeLaunchdLabel(label)) return Object.assign(base, { reason: "unsafe_launchd_label" });

    const now = nowMs();
    const last = Number(lastAttemptByLabel.get(label) || 0);
    if (cooldownMs > 0 && last && now - last < cooldownMs) {
      return Object.assign(base, {
        reason: "plugin_recovery_cooldown",
        cooldownMs,
        nextAllowedInMs: Math.max(0, cooldownMs - (now - last)),
      });
    }
    lastAttemptByLabel.set(label, now);

    const args = command
      ? ["--plugin-id", pluginId, "--launchd-label", label, "--manifest-url", manifestUrl, "--reason", stringValue(failure.code)]
      : ["kickstart", "-k", `system/${label}`];
    const executable = command || launchctlPath;
    const method = command ? "command" : "launchctl";
    const result = await execFilePromise(executable, args, { timeout: commandTimeoutMs }, execFileImpl);
    return Object.assign(base, {
      attempted: true,
      restarted: result.ok,
      method,
      reason: result.ok ? "plugin_recovery_restart_requested" : "plugin_recovery_restart_failed",
      exitCode: result.code,
      signal: result.signal,
      error: result.ok ? "" : result.error,
    });
  }

  return {
    recover,
    retryDelayMs,
    cooldownMs,
  };
}

module.exports = {
  DEFAULT_COOLDOWN_MS,
  DEFAULT_COMMAND_TIMEOUT_MS,
  DEFAULT_RETRY_DELAY_MS,
  SAFE_LAUNCHD_LABEL_PREFIX,
  createPluginLaunchRecoveryService,
  isLocalOrPrivateManifestUrl,
  isSafeLaunchdLabel,
  recoverableManifestFailure,
  resolvePluginLaunchdLabel,
};
