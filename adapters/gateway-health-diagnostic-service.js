"use strict";

const fs = require("node:fs");
const path = require("node:path");

function cleanString(value, limit = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function safeSegment(value) {
  return cleanString(value, 80).replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    return null;
  }
}

function fileMeta(filePath) {
  const out = {
    configured: Boolean(cleanString(filePath)),
    path: cleanString(filePath, 500),
    exists: false,
    readableByHost: false,
  };
  if (!out.configured) return out;
  try {
    const stat = fs.statSync(filePath);
    out.exists = stat.isFile();
  } catch (_) {
    return out;
  }
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    out.readableByHost = true;
  } catch (_) {
    out.readableByHost = false;
  }
  return out;
}

function workerProfile(worker = {}) {
  return cleanString(worker.profile || worker.name || worker.id);
}

function workerApiBase(worker = {}) {
  const explicit = cleanString(worker.url || worker.gatewayUrl || worker.gateway_url || worker.apiBase || worker.api_base, 500);
  if (explicit) return explicit.replace(/\/+$/, "");
  const host = cleanString(worker.host || "127.0.0.1", 120) || "127.0.0.1";
  const port = Number(worker.port || 0);
  return port > 0 ? `http://${host}:${port}` : "";
}

function workerApiKeyFile(worker = {}) {
  return cleanString(worker.apiKeyFile || worker.api_key_file || worker.apiKeyPath || worker.api_key_path, 500);
}

function workerProviderKeyFiles(worker = {}, dataDir = "") {
  const values = [
    worker.deepseekApiKeyFile,
    worker.deepseek_api_key_file,
    worker.providerKeyFile,
    worker.provider_key_file,
  ].map((item) => cleanString(item, 500)).filter(Boolean);
  if (dataDir && cleanString(worker.provider).toLowerCase() === "deepseek") {
    values.push(path.join(dataDir, "secrets", "deepseek-api-key.secret"));
  }

  return [...new Set(values)];
}

function optionalLegacyProviderKeyFallback(dataDir = "") {
  if (!dataDir) return null;
  return fileMeta(path.join(dataDir, "secrets", "deepseek-api-key.secret"));
}

function extractFailureCode(event = {}, err = null) {
  return cleanString(
    event.failureCode
    || event.lastFailureCode
    || event.details?.failureCode
    || err?.details?.failureCode
    || err?.failureCode
    || err?.code,
  );
}

function isGatewayHealthFailure(input = {}) {
  const event = input.event || {};
  const err = input.err || input.error || null;
  const code = cleanString(err?.code);
  const failureCode = extractFailureCode(event, err);
  return failureCode === "health_check_failed"
    || (code === "gateway_elastic_worker_start_failed" && failureCode === "health_check_failed");
}

function isGatewayRunFailure(input = {}) {
  const event = input.event || {};
  const eventName = cleanString(event.event || event.type || input.eventName);
  if (isGatewayHealthFailure(input)) return true;
  if (input.status === "failed" || event.status === "failed") return true;
  return [
    "run.failed",
    "response.failed",
    "run.stream_failed",
    "run.liveness_stale",
    "run.gateway_start_timeout",
    "run.toolset_selection_failed",
    "run.wardrobe_workflow_gate_failed",
    "run.wardrobe_outfit_completion_gate_failed",
  ].includes(eventName);
}

function createGatewayHealthDiagnosticService(options = {}) {
  const dataDir = cleanString(options.dataDir || process.env.HERMES_WEB_DATA_DIR || process.env.HERMES_MOBILE_DATA_DIR, 500);
  const reportRoot = cleanString(options.reportRoot, 500) || (dataDir ? path.join(dataDir, "diagnostics", "gateway-runtime") : "");
  const manifestPaths = typeof options.manifestPaths === "function"
    ? options.manifestPaths
    : (() => Array.isArray(options.manifestPaths) ? options.manifestPaths : []);
  const fetchImpl = typeof options.fetch === "function" ? options.fetch : globalThis.fetch;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : (() => new Date().toISOString());
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : (() => Date.now());
  const setImmediateImpl = typeof options.setImmediate === "function" ? options.setImmediate : setImmediate;
  const logger = options.logger || console;
  const cooldownMs = Math.max(0, Number(options.cooldownMs || 5 * 60 * 1000) || 0);
  const recent = new Map();

  function loadManifest() {
    const checked = [];
    for (const rawPath of manifestPaths().map((item) => cleanString(item, 500)).filter(Boolean)) {
      checked.push(rawPath);
      const data = readJsonFile(rawPath);
      if (data && Array.isArray(data.workers)) {
        return { path: rawPath, checked, workers: data.workers };
      }
    }
    return { path: "", checked, workers: [] };
  }

  async function healthCheck(worker = {}) {
    const apiBase = workerApiBase(worker);
    const keyPath = workerApiKeyFile(worker);
    const keyMeta = fileMeta(keyPath);
    if (!apiBase) return { attempted: false, ok: false, reason: "worker_api_base_missing" };
    if (!keyMeta.readableByHost) return { attempted: false, ok: false, reason: "worker_api_key_unreadable_by_host" };
    if (typeof fetchImpl !== "function") return { attempted: false, ok: false, reason: "fetch_unavailable" };
    let key = "";
    try {
      key = fs.readFileSync(keyPath, "utf8").trim();
    } catch (_) {
      return { attempted: false, ok: false, reason: "worker_api_key_read_failed" };
    }
    try {
      const res = await fetchImpl(`${apiBase}/health`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout ? AbortSignal.timeout(3500) : undefined,
      });
      return { attempted: true, ok: res.status >= 200 && res.status < 300, status: res.status };
    } catch (err) {
      return { attempted: true, ok: false, error: cleanString(err?.message || err, 240) };
    }
  }

  function repairGuidance(report) {
    const profile = report.worker.profileId || report.trigger.profileId || "selected worker";
    const kind = cleanString(report.kind) || "gateway_run_failure";
    return {
      autoRepairPolicy: "report_only",
      safeActions: [],
      codexRepairTaskCard: {
        eligible: true,
        requiresOwnerApproval: true,
        status: "pending_owner_approval",
        suggestedTitle: kind === "gateway_worker_health_failure"
          ? `Repair Gateway health check failure for ${profile}`
          : `Repair Gateway run failure for ${profile}`,
        scope: "runtime_config_or_code_repair",
        prompt: [
          "Use the Gateway runtime diagnostic report as evidence.",
          "Inspect the affected workspace Gateway worker manifest, launchd state, key-file ACLs, provider-key ACLs, health endpoint, run events, and terminal failure state.",
          "All repair actions must be performed by a Codex repair thread after Owner approval.",
          "Prefer a bounded runtime/config repair before code changes, but do not execute changes from the diagnostic worker itself.",
          "Do not print raw secrets or copy private file contents.",
        ].join(" "),
      },
    };
  }

  function findWorkerByProfile(manifest, profileId) {
    return manifest.workers.find((item) => workerProfile(item) === profileId)
      || manifest.workers.find((item) => cleanString(item.id || item.name) === profileId)
      || null;
  }

  function workerMetaFor(worker, profileId) {
    return worker ? {
      profileId: workerProfile(worker),
      provider: cleanString(worker.provider),
      workspaceIds: Array.isArray(worker.allowedWorkspaceIds || worker.allowed_workspace_ids)
        ? (worker.allowedWorkspaceIds || worker.allowed_workspace_ids).map((item) => cleanString(item)).filter(Boolean)
        : [],
      apiBase: workerApiBase(worker),
      launchdLabel: cleanString(worker.launchdLabel || worker.label),
      apiKeyFile: fileMeta(workerApiKeyFile(worker)),
      providerKeyFiles: workerProviderKeyFiles(worker, dataDir).map(fileMeta),
      optionalLegacyProviderKeyFallback: optionalLegacyProviderKeyFallback(dataDir),
    } : { profileId, missing: true };
  }

  function writeReport(report, profileId) {
    if (!reportRoot) return report;
    fs.mkdirSync(reportRoot, { recursive: true });
    const stamp = report.createdAt.replace(/[^0-9A-Za-z]+/g, "-").replace(/-+$/g, "");
    const name = `${stamp}-${safeSegment(report.kind)}-${safeSegment(profileId)}-${safeSegment(report.trigger.runId)}.json`;
    const target = path.join(reportRoot, name);
    report.repair.codexRepairTaskCard.reportPath = target;
    fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    report.reportPath = target;
    return report;
  }

  async function runGatewayWorkerFailureDiagnostic(input = {}) {
    const event = input.event || {};
    const manifest = loadManifest();
    const profileId = cleanString(event.profileId || event.profile || event.workerId || input.profileId);
    const worker = findWorkerByProfile(manifest, profileId);
    const workerMeta = workerMetaFor(worker, profileId);
    const report = {
      schemaVersion: 1,
      kind: "gateway_worker_health_failure",
      createdAt: nowIso(),
      trigger: {
        eventName: cleanString(event.event),
        failureCode: extractFailureCode(event, input.err || input.error),
        runId: cleanString(input.runId || event.runId || event.run_id),
        threadId: cleanString(input.threadId || input.thread?.id),
        messageId: cleanString(input.messageId || input.message?.id),
        workspaceId: cleanString(event.workspaceId || input.workspaceId || input.thread?.workspaceId),
        profileId,
        provider: cleanString(event.provider),
        diagnostic: cleanString(event.diagnostic, 500),
      },
      manifest: {
        found: Boolean(manifest.path),
        path: manifest.path,
        checkedPaths: manifest.checked,
        workerCount: manifest.workers.length,
        workerFound: Boolean(worker),
      },
      worker: workerMeta,
      checks: {
        health: worker ? await healthCheck(worker) : { attempted: false, ok: false, reason: "worker_not_found" },
      },
    };
    report.repair = repairGuidance(report);
    return writeReport(report, profileId);
  }

  async function runGatewayRunFailureDiagnostic(input = {}) {
    const event = input.event || {};
    const stream = input.stream || {};
    const manifest = loadManifest();
    const profileId = cleanString(
      event.profileId
      || event.profile
      || input.profileId
      || stream.gatewayProfile
      || stream.gatewayName,
    );
    const worker = findWorkerByProfile(manifest, profileId);
    const workerMeta = workerMetaFor(worker, profileId);
    const runId = cleanString(input.runId || event.runId || event.run_id || input.message?.runId);
    const report = {
      schemaVersion: 1,
      kind: "gateway_run_failure",
      createdAt: nowIso(),
      trigger: {
        eventName: cleanString(event.event || event.type || input.eventName || "run.failed"),
        failureCode: extractFailureCode(event, input.err || input.error),
        runId,
        threadId: cleanString(input.threadId || input.thread?.id),
        messageId: cleanString(input.messageId || input.message?.id),
        workspaceId: cleanString(event.workspaceId || input.workspaceId || input.thread?.workspaceId),
        profileId,
        provider: cleanString(event.provider || stream.provider),
        diagnostic: cleanString(event.diagnostic || event.preview || input.err?.message || input.error?.message || input.error || input.err, 500),
      },
      manifest: {
        found: Boolean(manifest.path),
        path: manifest.path,
        checkedPaths: manifest.checked,
        workerCount: manifest.workers.length,
        workerFound: Boolean(worker),
      },
      worker: Object.assign({}, workerMeta, {
        activeStream: {
          gatewayUrl: cleanString(stream.gatewayUrl, 500),
          gatewayName: cleanString(stream.gatewayName),
          gatewayProfile: cleanString(stream.gatewayProfile),
          gatewaySource: cleanString(stream.gatewaySource),
          startedAt: Math.max(0, Number(stream.startedAt || 0) || 0),
          lastEventAt: Math.max(0, Number(stream.lastEventAt || 0) || 0),
          firstGatewayEventAt: Math.max(0, Number(stream.firstGatewayEventAt || 0) || 0),
          firstModelOutputAt: Math.max(0, Number(stream.firstModelOutputAt || 0) || 0),
          terminalEventSeen: Boolean(stream.terminalEventSeen),
          failureReason: cleanString(stream.failureReason, 300),
        },
      }),
      message: {
        id: cleanString(input.message?.id),
        status: cleanString(input.message?.status),
        taskGroupId: cleanString(input.message?.taskGroupId),
        contentLength: String(input.message?.content || "").length,
      },
      checks: {
        health: worker ? await healthCheck(worker) : { attempted: false, ok: false, reason: "worker_not_found" },
      },
    };
    report.repair = repairGuidance(report);
    return writeReport(report, profileId || "unknown");
  }

  function triggerGatewayWorkerFailureDiagnostic(input = {}) {
    if (!isGatewayHealthFailure(input)) return { scheduled: false, reason: "not_health_check_failed" };
    const event = input.event || {};
    const profileId = cleanString(event.profileId || event.profile || event.workerId || input.profileId);
    const runId = cleanString(input.runId || event.runId || event.run_id);
    const key = `${profileId}:${runId || "no-run"}`;
    const last = recent.get(key) || 0;
    const now = nowMs();
    if (cooldownMs && last && now - last < cooldownMs) return { scheduled: false, reason: "cooldown" };
    recent.set(key, now);
    setImmediateImpl(() => {
      runGatewayWorkerFailureDiagnostic(input).catch((err) => {
        try {
          logger.error?.(`Gateway health diagnostic failed: ${err.message || String(err)}`);
        } catch (_) {}
      });
    });
    return { scheduled: true, reason: "health_check_failed", profileId, runId };
  }

  function triggerGatewayRunFailureDiagnostic(input = {}) {
    if (!isGatewayRunFailure(input)) return { scheduled: false, reason: "not_gateway_run_failure" };
    const event = input.event || {};
    const stream = input.stream || {};
    const profileId = cleanString(event.profileId || event.profile || input.profileId || stream.gatewayProfile || stream.gatewayName);
    const runId = cleanString(input.runId || event.runId || event.run_id || input.message?.runId);
    const key = `run:${profileId || "unknown"}:${runId || input.messageId || "no-run"}`;
    const last = recent.get(key) || 0;
    const now = nowMs();
    if (cooldownMs && last && now - last < cooldownMs) return { scheduled: false, reason: "cooldown" };
    recent.set(key, now);
    setImmediateImpl(() => {
      runGatewayRunFailureDiagnostic(input).catch((err) => {
        try {
          logger.error?.(`Gateway run failure diagnostic failed: ${err.message || String(err)}`);
        } catch (_) {}
      });
    });
    return { scheduled: true, reason: "gateway_run_failure", profileId, runId };
  }

  return Object.freeze({
    isGatewayHealthFailure,
    isGatewayRunFailure,
    runGatewayRunFailureDiagnostic,
    runGatewayWorkerFailureDiagnostic,
    triggerGatewayRunFailureDiagnostic,
    triggerGatewayWorkerFailureDiagnostic,
  });
}

module.exports = {
  createGatewayHealthDiagnosticService,
  isGatewayHealthFailure,
  isGatewayRunFailure,
};
