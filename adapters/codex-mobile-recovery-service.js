"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

const DEFAULT_LABEL = "com.hermesmobile.plugin.codex-mobile";
const DEFAULT_PORT = 8787;
const DEFAULT_HTTP_TIMEOUT_MS = 2500;
const DEFAULT_COMMAND_TIMEOUT_MS = 15000;
const DEFAULT_RESTORE_TIMEOUT_MS = 70000;
const DEFAULT_MAX_WAIT_SECONDS = 45;

function stringValue(value) {
  return String(value || "").trim();
}

function numberValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function boolValue(value, fallback = false) {
  if (typeof value === "boolean") return value;
  const text = stringValue(value).toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
}

function boundedText(value, max = 500) {
  return stringValue(value).replace(/\s+/g, " ").slice(0, max);
}

function defaultScriptPath(appRoot = process.cwd()) {
  return path.resolve(appRoot, "..", "plugins", "codex-mobile-web", "restart-codex-mobile-host-macos.sh");
}

function safeProfileId(value) {
  const text = stringValue(value);
  if (!text) return "";
  if (!/^[A-Za-z0-9_.-]+$/.test(text)) {
    const err = new Error("Invalid Codex profile id.");
    err.status = 400;
    err.code = "invalid_codex_profile_id";
    throw err;
  }
  return text;
}

function safeCodexHome(value, allowExplicitCodexHome) {
  const text = stringValue(value);
  if (!text) return "";
  if (!allowExplicitCodexHome) {
    const err = new Error("Explicit Codex Home recovery is disabled.");
    err.status = 403;
    err.code = "codex_home_recovery_disabled";
    throw err;
  }
  if (!path.isAbsolute(text) || text.includes("\0")) {
    const err = new Error("Invalid Codex Home path.");
    err.status = 400;
    err.code = "invalid_codex_home";
    throw err;
  }
  return path.resolve(text);
}

function publicProfile(profile = {}) {
  const auth = profile.auth && typeof profile.auth === "object" ? profile.auth : {};
  return {
    id: stringValue(profile.id),
    label: stringValue(profile.label),
    codexHome: stringValue(profile.codexHome),
    active: Boolean(profile.active),
    exists: Boolean(profile.exists),
    auth: {
      status: stringValue(auth.status || "unknown"),
      label: stringValue(auth.label),
      email: stringValue(auth.email) || undefined,
      name: stringValue(auth.name) || undefined,
    },
  };
}

function publicListHomes(payload = {}) {
  return {
    ok: payload.ok !== false,
    storeFile: stringValue(payload.storeFile),
    activeProfileId: stringValue(payload.activeProfileId),
    activeCodexHome: stringValue(payload.activeCodexHome),
    profiles: Array.isArray(payload.profiles) ? payload.profiles.map(publicProfile) : [],
  };
}

function publicPlan(payload = {}) {
  return {
    ok: payload.ok !== false,
    serviceLabel: stringValue(payload.serviceLabel),
    plistPath: stringValue(payload.plistPath),
    profileId: stringValue(payload.profileId),
    codexHome: stringValue(payload.codexHome),
    port: Number(payload.port || 0),
    url: stringValue(payload.url),
    dryRun: Boolean(payload.dryRun),
  };
}

function execFilePromise(command, args, options = {}, execFileImpl = execFile) {
  return new Promise((resolve) => {
    execFileImpl(command, args, options, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        status: error && error.code !== undefined ? error.code : 0,
        signal: error?.signal || "",
        stdout: String(stdout || ""),
        stderr: String(stderr || ""),
        error: error ? boundedText(error.message || error, 500) : "",
      });
    });
  });
}

async function fetchJsonStatus(url, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return { ok: false, available: false, code: "fetch_unavailable", recoverableTransportFailure: false };
  }
  const AbortControllerImpl = options.AbortController || globalThis.AbortController;
  const controller = typeof AbortControllerImpl === "function" ? new AbortControllerImpl() : null;
  const timeout = setTimeout(() => {
    if (controller) controller.abort();
  }, options.timeoutMs || DEFAULT_HTTP_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller?.signal,
    });
    if (response && response.ok) {
      return { ok: true, available: true, code: "public_config_ok", httpStatus: response.status || 200 };
    }
    const status = Number(response?.status || 0);
    return {
      ok: false,
      available: false,
      code: status === 401 ? "auth_or_key_required" : "public_config_http_error",
      httpStatus: status,
      recoverableTransportFailure: false,
    };
  } catch (err) {
    const name = stringValue(err?.name);
    const message = boundedText(err?.message || err, 240);
    return {
      ok: false,
      available: false,
      code: name === "AbortError" ? "public_config_timeout" : "public_config_unreachable",
      error: message,
      recoverableTransportFailure: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseLaunchdRunning(stdout = "") {
  return /state\s*=\s*running/.test(String(stdout || ""));
}

function parseLaunchdLoaded(stdout = "") {
  return /type\s*=\s*LaunchDaemon/.test(String(stdout || "")) || /state\s*=/.test(String(stdout || ""));
}

function createCodexMobileRecoveryService(options = {}) {
  const env = options.env || process.env || {};
  const appRoot = options.appRoot || process.cwd();
  const scriptPath = path.resolve(stringValue(
    options.scriptPath
    || env.HOMEAI_CODEX_MOBILE_RECOVERY_SCRIPT
    || env.HERMES_MOBILE_CODEX_MOBILE_RECOVERY_SCRIPT
    || env.HERMES_WEB_CODEX_MOBILE_RECOVERY_SCRIPT,
  ) || defaultScriptPath(appRoot));
  const label = stringValue(options.label || env.CODEX_MOBILE_LAUNCHD_LABEL) || DEFAULT_LABEL;
  const port = numberValue(options.port || env.CODEX_MOBILE_PORT, DEFAULT_PORT);
  const publicConfigUrl = stringValue(options.publicConfigUrl) || `http://127.0.0.1:${port}/api/public-config`;
  const commandTimeoutMs = numberValue(options.commandTimeoutMs || env.HOMEAI_CODEX_MOBILE_RECOVERY_COMMAND_TIMEOUT_MS, DEFAULT_COMMAND_TIMEOUT_MS);
  const restoreTimeoutMs = numberValue(options.restoreTimeoutMs || env.HOMEAI_CODEX_MOBILE_RECOVERY_RESTORE_TIMEOUT_MS, DEFAULT_RESTORE_TIMEOUT_MS);
  const maxWaitSeconds = numberValue(options.maxWaitSeconds || env.HOMEAI_CODEX_MOBILE_RECOVERY_MAX_WAIT_SECONDS, DEFAULT_MAX_WAIT_SECONDS);
  const httpTimeoutMs = numberValue(options.httpTimeoutMs || env.HOMEAI_CODEX_MOBILE_RECOVERY_HTTP_TIMEOUT_MS, DEFAULT_HTTP_TIMEOUT_MS);
  const execFileImpl = options.execFile || execFile;
  const fetchImpl = options.fetch || globalThis.fetch;
  const lsofPath = stringValue(options.lsofPath || env.HOMEAI_LSOF_PATH) || "/usr/sbin/lsof";
  const launchctlPath = stringValue(options.launchctlPath || env.HOMEAI_LAUNCHCTL_PATH) || "/bin/launchctl";
  const allowExplicitCodexHome = options.allowExplicitCodexHome !== undefined
    ? Boolean(options.allowExplicitCodexHome)
    : boolValue(env.HOMEAI_CODEX_MOBILE_RECOVERY_ALLOW_CODEX_HOME, false);

  function assertScriptReady() {
    if (!fs.existsSync(scriptPath)) {
      const err = new Error(`Codex Mobile recovery script not found: ${scriptPath}`);
      err.status = 503;
      err.code = "codex_mobile_recovery_script_missing";
      throw err;
    }
  }

  async function runScript(args, timeoutMs = commandTimeoutMs) {
    assertScriptReady();
    const result = await execFilePromise(scriptPath, args, {
      cwd: path.dirname(scriptPath),
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    }, execFileImpl);
    if (!result.ok) {
      const err = new Error(result.stderr || result.error || "Codex Mobile recovery script failed.");
      err.status = 500;
      err.code = "codex_mobile_recovery_script_failed";
      err.result = {
        status: result.status,
        signal: result.signal,
        stderr: boundedText(result.stderr, 600),
        stdout: boundedText(result.stdout, 600),
      };
      throw err;
    }
    try {
      return JSON.parse(result.stdout || "{}");
    } catch (err) {
      const parseErr = new Error("Codex Mobile recovery script returned invalid JSON.");
      parseErr.status = 500;
      parseErr.code = "codex_mobile_recovery_invalid_json";
      parseErr.stdout = boundedText(result.stdout, 600);
      throw parseErr;
    }
  }

  async function status() {
    const [httpStatus, listenerResult, launchdResult] = await Promise.all([
      fetchJsonStatus(publicConfigUrl, { fetch: fetchImpl, timeoutMs: httpTimeoutMs, AbortController: options.AbortController }),
      execFilePromise(lsofPath, ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], { timeout: commandTimeoutMs }, execFileImpl),
      execFilePromise(launchctlPath, ["print", `system/${label}`], { timeout: commandTimeoutMs }, execFileImpl),
    ]);
    const listenerPresent = listenerResult.ok && listenerResult.stdout.trim().length > 0;
    const launchdLoaded = launchdResult.ok && parseLaunchdLoaded(launchdResult.stdout);
    const launchdRunning = launchdResult.ok && parseLaunchdRunning(launchdResult.stdout);
    const listenerMissing = !listenerPresent;
    const launchdMissingOrStopped = !launchdLoaded || !launchdRunning;
    const recoverable = !httpStatus.available
      && Boolean(httpStatus.recoverableTransportFailure)
      && (listenerMissing || launchdMissingOrStopped);
    return {
      ok: true,
      pluginId: "codex-mobile",
      serviceLabel: label,
      port,
      publicConfigUrl,
      scriptPath,
      available: Boolean(httpStatus.available),
      recoverable,
      reason: httpStatus.available
        ? "public_config_ok"
        : (recoverable ? "listener_missing_or_launchd_stopped" : httpStatus.code),
      publicConfig: httpStatus,
      listener: {
        present: listenerPresent,
        commandOk: listenerResult.ok,
        error: listenerResult.ok ? "" : boundedText(listenerResult.stderr || listenerResult.error, 240),
      },
      launchd: {
        loaded: launchdLoaded,
        running: launchdRunning,
        commandOk: launchdResult.ok,
        error: launchdResult.ok ? "" : boundedText(launchdResult.stderr || launchdResult.error, 240),
      },
    };
  }

  async function listHomes() {
    return publicListHomes(await runScript(["--list-homes", "--json"]));
  }

  function selectionArgs(input = {}) {
    const profileId = safeProfileId(input.profileId || input.profile_id);
    const codexHome = safeCodexHome(input.codexHome || input.codex_home, allowExplicitCodexHome);
    if (profileId && codexHome) {
      const err = new Error("Choose either profileId or codexHome, not both.");
      err.status = 400;
      err.code = "codex_mobile_recovery_selection_conflict";
      throw err;
    }
    if (profileId) return ["--profile-id", profileId];
    if (codexHome) return ["--codex-home", codexHome];
    return [];
  }

  async function plan(input = {}) {
    const args = [...selectionArgs(input), "--dry-run", "--json"];
    return publicPlan(await runScript(args));
  }

  async function restore(input = {}) {
    const force = boolValue(input.force || input.force_restore, false);
    const current = await status();
    if (!force && !current.recoverable) {
      const err = new Error("Codex Mobile recovery is not allowed for the current status.");
      err.status = current.available ? 409 : 412;
      err.code = current.available ? "codex_mobile_recovery_not_needed" : "codex_mobile_recovery_not_safe";
      err.current = current;
      throw err;
    }
    const args = [...selectionArgs(input), "--max-wait-seconds", String(maxWaitSeconds), "--json"];
    return {
      ok: true,
      before: current,
      recovery: publicPlan(await runScript(args, restoreTimeoutMs)),
    };
  }

  return {
    status,
    listHomes,
    plan,
    restore,
    scriptPath,
    publicConfigUrl,
  };
}

module.exports = {
  DEFAULT_LABEL,
  DEFAULT_PORT,
  createCodexMobileRecoveryService,
  defaultScriptPath,
};
