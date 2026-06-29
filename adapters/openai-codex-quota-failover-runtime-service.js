"use strict";

const {
  publicSummary: openAiCodexAuthPoolSummary,
  rotateAfterUsageLimit,
} = require("./openai-codex-shared-auth-pool-service");

function optionFunction(options, name, fallback = null) {
  const value = options[name];
  if (typeof value === "function") return value;
  if (value !== undefined) return () => value;
  if (fallback) return fallback;
  throw new Error(`OpenAiCodexQuotaFailoverRuntimeService requires ${name}`);
}

function readJsonFile(fs, filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(fs, filePath, value) {
  let currentStat = null;
  try { currentStat = fs.statSync(filePath); } catch (_) {}
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: currentStat ? currentStat.mode & 0o777 : 0o600 });
  if (currentStat) {
    try { fs.chownSync(tmp, currentStat.uid, currentStat.gid); } catch (_) {}
    try { fs.chmodSync(tmp, currentStat.mode & 0o777); } catch (_) {}
  }
  fs.renameSync(tmp, filePath);
  if (currentStat) {
    try { fs.chownSync(filePath, currentStat.uid, currentStat.gid); } catch (_) {}
    try { fs.chmodSync(filePath, currentStat.mode & 0o777); } catch (_) {}
  }
}

function gatewayWorkerRoot(options, path, gatewayPoolElasticConfig) {
  const config = gatewayPoolElasticConfig() || {};
  return String(
    options.gatewayWorkerRoot
    || config.HERMES_MOBILE_GATEWAY_WORKER_ROOT
    || config.HERMES_WEB_GATEWAY_WORKER_ROOT
    || config.gatewayWorkerRoot
    || path.join(path.dirname(options.toolRoot || process.cwd()), "gateway-worker"),
  ).trim();
}

function sharedAuthFile(options, path, gatewayPoolElasticConfig) {
  return String(
    options.openAiCodexSharedAuthFile
    || options.openaiCodexSharedAuthFile
    || path.join(gatewayWorkerRoot(options, path, gatewayPoolElasticConfig), "telemetry", "profiles", "shared-auth", "auth.json"),
  ).trim();
}

function healthyGatewayWorkerResult(result) {
  if (!result || typeof result !== "object") return false;
  return result.ok === true || result.status === "ok" || result.health?.status === "ok";
}

function createOpenAiCodexQuotaFailoverRuntimeService(options = {}) {
  const fs = options.fs;
  const path = options.path;
  if (!fs || typeof fs !== "object") throw new Error("OpenAiCodexQuotaFailoverRuntimeService requires fs");
  if (!path || typeof path !== "object") throw new Error("OpenAiCodexQuotaFailoverRuntimeService requires path");
  const gatewayPool = optionFunction(options, "gatewayPool");
  const gatewayPoolElasticConfig = optionFunction(options, "gatewayPoolElasticConfig", () => ({}));
  const gatewayWorkerProfileLauncher = optionFunction(options, "gatewayWorkerProfileLauncher");
  const nowIso = optionFunction(options, "nowIso", () => new Date().toISOString());

  function rotateOpenAiCodexCredentialPoolAfterUsageLimit(input = {}) {
    const filePath = sharedAuthFile(options, path, gatewayPoolElasticConfig);
    const doc = readJsonFile(fs, filePath);
    const rotated = rotateAfterUsageLimit(doc, Object.assign({
      nowIso: nowIso(),
      nowMs: Date.now(),
    }, input));
    if (rotated.changed) writeJsonAtomic(fs, filePath, rotated.doc);
    return {
      ok: Boolean(rotated.rotated),
      changed: Boolean(rotated.changed),
      rotated: Boolean(rotated.rotated),
      reason: rotated.reason || "",
      activeProfileId: rotated.active_profile_id || rotated.summary?.active_profile_id || "",
      previousProfileId: rotated.previous_profile_id || "",
      summary: rotated.summary || openAiCodexAuthPoolSummary(rotated.doc || doc),
    };
  }

  async function restartRunningGatewayWorkers(input = {}) {
    const loaded = gatewayPool().load();
    const workers = Array.isArray(loaded.workers) ? loaded.workers : [];
    const targets = [];
    for (const worker of workers) {
      try {
        const health = await gatewayPool().runnerFor(worker).request("/health", { timeoutMs: options.gatewayPoolHealthTimeoutMs || 5000 });
        if (healthyGatewayWorkerResult(health)) targets.push(worker);
      } catch (_) {}
    }
    const restarted = [];
    const failures = [];
    for (const worker of targets) {
      try {
        const reason = input.reason || "openai_codex_credential_pool_rotated";
        await gatewayWorkerProfileLauncher().stopWorkerProfile(worker, { reason });
        await gatewayWorkerProfileLauncher().startWorkerProfile(worker, { reason });
        restarted.push({ profile: worker.profile || worker.name || "", provider: worker.provider || "" });
      } catch (err) {
        failures.push({
          profile: worker.profile || worker.name || "",
          provider: worker.provider || "",
          code: err?.code || "gateway_restart_failed",
        });
      }
    }
    return {
      ok: failures.length === 0,
      scanned: workers.length,
      restartedCount: restarted.length,
      failureCount: failures.length,
      restarted,
      failures,
    };
  }

  return Object.freeze({
    restartRunningGatewayWorkers,
    rotateOpenAiCodexCredentialPoolAfterUsageLimit,
  });
}

module.exports = {
  createOpenAiCodexQuotaFailoverRuntimeService,
  healthyGatewayWorkerResult,
  sharedAuthFile,
};
