"use strict";

const defaultFs = require("node:fs");
const defaultPath = require("node:path");
const { spawn: defaultSpawn } = require("node:child_process");

function cleanString(value) {
  return String(value || "").trim();
}

function readTimeoutMs(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.max(5000, Math.floor(number));
}

function sanitizeProcessText(value) {
  return cleanString(value)
    .replace(/[A-Za-z0-9+/=_-]{24,}/g, "[redacted]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/\b(access|refresh|owner|workspace|api)?_?key\s*[:=]?\s+[^\s;,.]+/gi, "$1_key [redacted]")
    .slice(-800);
}

function publicArgs(args = []) {
  const result = [];
  for (let index = 0; index < args.length; index += 1) {
    const item = String(args[index] || "");
    result.push(item);
    if (/key|secret|token/i.test(item) && index + 1 < args.length) {
      result.push("[redacted]");
      index += 1;
    }
  }
  return result;
}

function createGatewayWorkerProfileLaunchService(options = {}) {
  const fs = options.fs || defaultFs;
  const path = options.path || defaultPath;
  const spawn = options.spawn || defaultSpawn;
  const toolRoot = cleanString(options.toolRoot || process.cwd());
  const elasticConfig = options.elasticConfig || {};

  function gatewayPoolScriptPath() {
    return path.join(toolRoot, "scripts", "start-gateway-pool.ps1");
  }

  function startTimeoutMs(context = {}) {
    return readTimeoutMs(
      context.timeoutMs
      || elasticConfig.HERMES_MOBILE_GATEWAY_START_TIMEOUT_MS
      || elasticConfig.HERMES_WEB_GATEWAY_START_TIMEOUT_MS
      || elasticConfig.startTimeoutMs,
      120000,
    );
  }

  function stopTimeoutMs(context = {}) {
    return readTimeoutMs(context.timeoutMs || elasticConfig.stopTimeoutMs, 60000);
  }

  function runGatewayPoolScript(args = [], timeoutMs = 120000) {
    const script = gatewayPoolScriptPath();
    if (!fs.existsSync(script)) {
      const err = new Error(`Gateway pool script not found: ${script}`);
      err.code = "gateway_pool_script_missing";
      throw err;
    }
    return new Promise((resolve, reject) => {
      const child = spawn("powershell.exe", [
        "-NoProfile",
        "-WindowStyle", "Hidden",
        "-ExecutionPolicy", "Bypass",
        "-File", script,
        ...args,
      ], {
        cwd: toolRoot,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const finishReject = (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      };
      const finishResolve = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const timer = setTimeout(() => {
        try { child.kill(); } catch (_) {}
        const err = new Error("Gateway pool script timed out.");
        err.code = "gateway_pool_script_timeout";
        err.details = { script, args: publicArgs(args) };
        finishReject(err);
      }, readTimeoutMs(timeoutMs, 120000));
      if (timer && typeof timer.unref === "function") timer.unref();
      child.stdout?.on?.("data", (chunk) => { stdout += chunk.toString(); });
      child.stderr?.on?.("data", (chunk) => { stderr += chunk.toString(); });
      child.on("error", (err) => {
        clearTimeout(timer);
        finishReject(err);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          finishResolve({ ok: true, code, stdout, stderr });
          return;
        }
        const err = new Error(`Gateway pool script failed with exit code ${code}.`);
        err.code = "gateway_pool_script_failed";
        err.details = {
          code,
          stderr: sanitizeProcessText(stderr),
          stdout: sanitizeProcessText(stdout),
          args: publicArgs(args),
        };
        finishReject(err);
      });
    });
  }

  async function startWorkerProfile(worker = {}, context = {}) {
    const profile = cleanString(worker.profile || worker.name);
    if (!profile) {
      const err = new Error("Gateway worker profile is missing.");
      err.code = "profile_missing";
      throw err;
    }
    if (cleanString(worker.securityLevel).toLowerCase() === "owner-maintenance" || worker.allowMaintenance) {
      return runGatewayPoolScript(["-OwnerMaintenanceOnly"], startTimeoutMs(context));
    }
    return runGatewayPoolScript(["-StartProfiles", profile, "-NoStopExisting"], startTimeoutMs(context));
  }

  async function stopWorkerProfile(worker = {}, context = {}) {
    const profile = cleanString(worker.profile || worker.name);
    if (!profile) return { ok: false, reason: "profile_missing" };
    if (cleanString(worker.securityLevel).toLowerCase() === "owner-maintenance" || worker.allowMaintenance) {
      return { ok: true, skipped: true, reason: "owner_maintenance_not_idle_reaped" };
    }
    return runGatewayPoolScript(["-StopProfiles", profile], stopTimeoutMs(context));
  }

  return {
    gatewayPoolScriptPath,
    runGatewayPoolScript,
    startWorkerProfile,
    stopWorkerProfile,
  };
}

module.exports = {
  createGatewayWorkerProfileLaunchService,
  publicArgs,
  sanitizeProcessText,
};
