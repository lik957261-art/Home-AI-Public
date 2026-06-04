"use strict";

const defaultFs = require("node:fs");
const defaultPath = require("node:path");
const { spawn: defaultSpawn } = require("node:child_process");
const {
  normalizeGatewayWorkerReplica,
} = require("./gateway-profile-replica-model");

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

function readConfigString(config = {}, ...keys) {
  for (const key of keys) {
    const value = cleanString(config[key]);
    if (value) return value;
  }
  return "";
}

function safeGatewayProfileName(value) {
  const text = cleanString(value);
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(text) ? text : "";
}

function safeMetadataValue(value, maxLength = 160) {
  const text = cleanString(value);
  if (!text || text.length > maxLength) return "";
  return /^[A-Za-z0-9_.|:+-]+$/.test(text) ? text : "";
}

function gatewayLaunchMetadata(worker = {}, context = {}) {
  const hints = context.hints || {};
  const hasTemplateContext = Object.keys(hints).length
    || worker.templateKey
    || worker.profileTemplateKey
    || worker.poolKey
    || worker.capabilityHash
    || worker.capability_hash
    || worker.toolSchemaEpoch
    || worker.tool_schema_epoch;
  if (!hasTemplateContext) return {};
  const replica = normalizeGatewayWorkerReplica(worker, hints);
  const capabilityHash = safeMetadataValue(
    hints.capabilityHash
    || hints.capability_hash
    || worker.capabilityHash
    || worker.capability_hash,
    80,
  );
  const toolSchemaEpoch = safeMetadataValue(
    hints.toolSchemaEpoch
    || hints.tool_schema_epoch
    || worker.toolSchemaEpoch
    || worker.tool_schema_epoch,
    80,
  );
  const metadata = {
    poolKey: safeMetadataValue(replica.poolKey),
    profileTemplateKey: safeMetadataValue(replica.profileTemplateKey),
    templateKey: safeMetadataValue(replica.profileTemplateKey),
    replicaId: safeMetadataValue(replica.replicaId, 80),
    profileAlias: safeGatewayProfileName(replica.profileAlias),
    workspaceId: safeMetadataValue(replica.workspaceId, 80),
    permissionTier: safeMetadataValue(replica.permissionTier, 80),
    provider: safeMetadataValue(replica.provider, 80),
    capabilityHash,
    toolSchemaEpoch,
  };
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => Boolean(value)));
}

function metadataArgs(metadata = {}) {
  const out = [];
  const mapping = [
    ["-PoolKey", metadata.poolKey],
    ["-ProfileTemplateKey", metadata.profileTemplateKey || metadata.templateKey],
    ["-TemplateKey", metadata.templateKey || metadata.profileTemplateKey],
    ["-ReplicaId", metadata.replicaId],
  ];
  for (const [key, value] of mapping) {
    if (value) out.push(key, value);
  }
  return out;
}

function createGatewayWorkerProfileLaunchService(options = {}) {
  const fs = options.fs || defaultFs;
  const path = options.path || defaultPath;
  const spawn = options.spawn || defaultSpawn;
  const toolRoot = cleanString(options.toolRoot || process.cwd());
  const elasticConfig = options.elasticConfig || {};
  const gatewayWorkerRoot = cleanString(
    options.gatewayWorkerRoot
    || readConfigString(
      elasticConfig,
      "HERMES_MOBILE_GATEWAY_WORKER_ROOT",
      "HERMES_WEB_GATEWAY_WORKER_ROOT",
      "gatewayWorkerRoot",
    )
    || path.join(path.dirname(toolRoot), "gateway-worker"),
  );
  const scheduledTaskName = cleanString(
    options.scheduledTaskName
    || readConfigString(
      elasticConfig,
      "HERMES_MOBILE_GATEWAY_START_SCHEDULED_TASK_NAME",
      "HERMES_WEB_GATEWAY_START_SCHEDULED_TASK_NAME",
      "scheduledTaskName",
    ),
  );
  const launchRequestRoot = cleanString(
    options.launchRequestRoot
    || readConfigString(
      elasticConfig,
      "HERMES_MOBILE_GATEWAY_LAUNCH_REQUEST_ROOT",
      "HERMES_WEB_GATEWAY_LAUNCH_REQUEST_ROOT",
      "launchRequestRoot",
    )
    || (gatewayWorkerRoot ? path.join(gatewayWorkerRoot, "elastic-requests") : ""),
  );
  const profileLaunchScript = cleanString(
    options.profileLaunchScript
    || readConfigString(
      elasticConfig,
      "HERMES_MOBILE_GATEWAY_PROFILE_LAUNCH_SCRIPT",
      "HERMES_WEB_GATEWAY_PROFILE_LAUNCH_SCRIPT",
      "profileLaunchScript",
    ),
  );

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
        if (process.platform === "win32" && child.pid) {
          try {
            spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
              windowsHide: true,
              stdio: "ignore",
            });
          } catch (_) {
            try { child.kill(); } catch (_) {}
          }
        } else {
          try { child.kill(); } catch (_) {}
        }
        const err = new Error("Gateway pool script timed out.");
        err.code = "gateway_pool_script_timeout";
        err.details = {
          script,
          args: publicArgs(args),
          timeoutMs: readTimeoutMs(timeoutMs, 120000),
          stderr: sanitizeProcessText(stderr),
          stdout: sanitizeProcessText(stdout),
        };
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

  function runProfileLaunchScript(args = [], timeoutMs = 120000) {
    if (!profileLaunchScript) return null;
    if (!fs.existsSync(profileLaunchScript)) {
      const err = new Error(`Gateway profile launch script not found: ${profileLaunchScript}`);
      err.code = "gateway_profile_launch_script_missing";
      throw err;
    }
    return spawnCommand(profileLaunchScript, args, timeoutMs);
  }

  function spawnCommand(command, args = [], timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
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
        const err = new Error(`${command} timed out.`);
        err.code = "command_timeout";
        err.details = {
          command,
          args: publicArgs(args),
          stderr: sanitizeProcessText(stderr),
          stdout: sanitizeProcessText(stdout),
        };
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
        const err = new Error(`${command} failed with exit code ${code}.`);
        err.code = "command_failed";
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

  function requestIdFor(action, profiles = []) {
    const suffix = `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
    return ["gateway", cleanString(action), ...profiles].filter(Boolean).join("-").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120) + `-${suffix}`;
  }

  function ensureLaunchRequestDirs() {
    if (!launchRequestRoot) {
      const err = new Error("Gateway launch request root is not configured.");
      err.code = "gateway_launch_request_root_missing";
      throw err;
    }
    for (const name of ["pending", "results"]) {
      fs.mkdirSync(path.join(launchRequestRoot, name), { recursive: true });
    }
  }

  function readJsonFile(filePath) {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  }

  function waitForResult(resultPath, timeoutMs) {
    const started = Date.now();
    const deadline = started + readTimeoutMs(timeoutMs, 120000);
    return new Promise((resolve, reject) => {
      function tick() {
        try {
          if (fs.existsSync(resultPath)) {
            const result = readJsonFile(resultPath);
            if (result && result.ok) {
              resolve(Object.assign({ ok: true }, result));
              return;
            }
            const err = new Error(sanitizeProcessText(result?.message) || "Gateway scheduled launch request failed.");
            err.code = cleanString(result?.code) || "gateway_scheduled_launch_failed";
            err.details = {
              requestId: cleanString(result?.requestId),
              action: cleanString(result?.action),
              profiles: Array.isArray(result?.profiles) ? result.profiles.map(cleanString).filter(Boolean) : [],
              stderr: sanitizeProcessText(result?.stderr),
              stdout: sanitizeProcessText(result?.stdout),
            };
            reject(err);
            return;
          }
        } catch (err) {
          err.code = err.code || "gateway_scheduled_launch_result_unreadable";
          reject(err);
          return;
        }
        if (Date.now() >= deadline) {
          const err = new Error("Gateway scheduled launch request timed out.");
          err.code = "gateway_scheduled_launch_timeout";
          err.details = {
            resultFile: path.basename(resultPath),
            timeoutMs: readTimeoutMs(timeoutMs, 120000),
          };
          reject(err);
          return;
        }
        setTimeout(tick, 500);
      }
      tick();
    });
  }

  async function runScheduledGatewayRequest(action, profiles = [], timeoutMs = 120000, extra = {}) {
    if (!scheduledTaskName) return null;
    const safeProfiles = profiles.map(safeGatewayProfileName).filter(Boolean);
    if (profiles.length !== safeProfiles.length) {
      const err = new Error("Gateway scheduled launch request contains an unsafe profile name.");
      err.code = "gateway_profile_unsafe";
      throw err;
    }
    ensureLaunchRequestDirs();
    const requestId = requestIdFor(action, safeProfiles);
    const request = {
      version: 1,
      requestId,
      action: cleanString(action),
      profiles: safeProfiles,
      noStopExisting: Boolean(extra.noStopExisting),
      forceConfigure: Boolean(extra.forceConfigure),
      createdAt: new Date().toISOString(),
    };
    const metadata = extra.metadata && typeof extra.metadata === "object" ? extra.metadata : {};
    for (const key of ["poolKey", "profileTemplateKey", "templateKey", "replicaId", "profileAlias", "workspaceId", "permissionTier", "provider", "capabilityHash", "toolSchemaEpoch"]) {
      if (metadata[key]) request[key] = metadata[key];
    }
    const pendingDir = path.join(launchRequestRoot, "pending");
    const resultPath = path.join(launchRequestRoot, "results", `${requestId}.json`);
    const requestPath = path.join(pendingDir, `${requestId}.json`);
    const tempPath = `${requestPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(request, null, 2), "utf8");
    fs.renameSync(tempPath, requestPath);
    const resultPromise = waitForResult(resultPath, timeoutMs);
    try {
      await spawnCommand("schtasks.exe", ["/Run", "/TN", scheduledTaskName], 30000);
    } catch (err) {
      err.code = err.code || "gateway_scheduled_task_trigger_failed";
      err.details = Object.assign({}, err.details || {}, {
        scheduledTaskName,
        requestId,
      });
      throw err;
    }
    return resultPromise;
  }

  async function startWorkerProfile(worker = {}, context = {}) {
    const profile = cleanString(worker.profile || worker.name);
    if (!profile) {
      const err = new Error("Gateway worker profile is missing.");
      err.code = "profile_missing";
      throw err;
    }
    const metadata = gatewayLaunchMetadata(worker, context);
    if (cleanString(worker.securityLevel).toLowerCase() === "owner-maintenance" || worker.allowMaintenance) {
      const scheduledResult = await runScheduledGatewayRequest("ownerMaintenance", [profile], startTimeoutMs(context), { noStopExisting: true, metadata });
      if (scheduledResult) return scheduledResult;
      return runGatewayPoolScript(["-OwnerMaintenanceOnly", "-StartProfiles", profile, ...metadataArgs(metadata)], startTimeoutMs(context));
    }
    const scheduledResult = await runScheduledGatewayRequest("start", [profile], startTimeoutMs(context), { noStopExisting: true, metadata });
    if (scheduledResult) return scheduledResult;
    const scriptResult = runProfileLaunchScript(["--start-profiles", profile, "--no-stop-existing"], startTimeoutMs(context));
    if (scriptResult) return scriptResult;
    return runGatewayPoolScript(["-StartProfiles", profile, "-NoStopExisting", ...metadataArgs(metadata)], startTimeoutMs(context));
  }

  async function stopWorkerProfile(worker = {}, context = {}) {
    const profile = cleanString(worker.profile || worker.name);
    if (!profile) return { ok: false, reason: "profile_missing" };
    if (cleanString(worker.securityLevel).toLowerCase() === "owner-maintenance" || worker.allowMaintenance) {
      const scheduledResult = await runScheduledGatewayRequest("ownerMaintenanceStop", [profile], stopTimeoutMs(context));
      if (scheduledResult) return scheduledResult;
      return runGatewayPoolScript(["-OwnerMaintenanceOnly", "-StopProfiles", profile], stopTimeoutMs(context));
    }
    const scheduledResult = await runScheduledGatewayRequest("stop", [profile], stopTimeoutMs(context));
    if (scheduledResult) return scheduledResult;
    const scriptResult = runProfileLaunchScript(["--stop-profiles", profile], stopTimeoutMs(context));
    if (scriptResult) return scriptResult;
    return runGatewayPoolScript(["-StopProfiles", profile], stopTimeoutMs(context));
  }

  return {
    gatewayPoolScriptPath,
    runGatewayPoolScript,
    runScheduledGatewayRequest,
    startWorkerProfile,
    stopWorkerProfile,
  };
}

module.exports = {
  createGatewayWorkerProfileLaunchService,
  gatewayLaunchMetadata,
  publicArgs,
  sanitizeProcessText,
  safeGatewayProfileName,
  safeMetadataValue,
};
