"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const SESSION_USAGE_COLUMNS = [
  "id",
  "input_tokens",
  "output_tokens",
  "cache_read_tokens",
  "cache_write_tokens",
  "reasoning_tokens",
  "api_call_count",
  "billing_provider",
  "billing_base_url",
  "billing_mode",
  "estimated_cost_usd",
  "actual_cost_usd",
  "cost_status",
  "cost_source",
  "pricing_version",
];

function readOption(value) {
  return typeof value === "function" ? value() : value;
}

function cleanList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value.split(/[,\n;]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function envEnabled(value) {
  const text = String(value || "").trim();
  if (!text) return "auto";
  if (/^(1|true|yes|on|auto)$/i.test(text)) return text.toLowerCase() === "auto" ? "auto" : "on";
  if (/^(0|false|no|off)$/i.test(text)) return "off";
  return "auto";
}

function parseJson(text, fallback = null) {
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch (_) {
    return fallback;
  }
}

function sqlQuoteIdent(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

function sqliteBundleExists(dbPath) {
  return Boolean(dbPath && fs.existsSync(dbPath));
}

function copySqliteBundle(dbPath, label = "state") {
  if (!sqliteBundleExists(dbPath)) return null;
  const safeLabel = String(label || "state").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 48) || "state";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `hermes-gateway-telemetry-${safeLabel}-`));
  const target = path.join(dir, path.basename(dbPath));
  try {
    fs.copyFileSync(dbPath, target);
    for (const suffix of ["-wal", "-shm"]) {
      const sourceSidecar = `${dbPath}${suffix}`;
      if (fs.existsSync(sourceSidecar)) fs.copyFileSync(sourceSidecar, `${target}${suffix}`);
    }
    return {
      path: target,
      cleanup() {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch (_) {}
      },
    };
  } catch (_) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {}
    return null;
  }
}

function withReadonlyDatabase(dbPath, label, fn) {
  const copy = copySqliteBundle(dbPath, label);
  if (!copy) return null;
  let db = null;
  try {
    db = new DatabaseSync(copy.path, { open: true, readOnly: true });
    try {
      db.exec("PRAGMA query_only = ON;");
    } catch (_) {}
    return fn(db);
  } catch (_) {
    return null;
  } finally {
    if (db) {
      try {
        db.close();
      } catch (_) {}
    }
    copy.cleanup();
  }
}

function tableColumns(db, tableName) {
  try {
    return new Set(db.prepare(`PRAGMA table_info(${sqlQuoteIdent(tableName)})`).all().map((row) => row.name));
  } catch (_) {
    return new Set();
  }
}

function responseSessionIdFromData(dataText) {
  const data = parseJson(dataText, null);
  if (!data || typeof data !== "object") return "";
  return String(
    data.session_id
    || data.sessionId
    || data.response?.session_id
    || data.response?.sessionId
    || data.metadata?.session_id
    || data.metadata?.sessionId
    || "",
  ).trim();
}

function readSessionIdForResponse(responseStoreDbPath, responseId) {
  const id = String(responseId || "").trim();
  if (!id) return "";
  return withReadonlyDatabase(responseStoreDbPath, "response-store", (db) => {
    try {
      const row = db.prepare("SELECT data FROM responses WHERE response_id = ? LIMIT 1").get(id);
      const exact = responseSessionIdFromData(row?.data || "");
      if (exact) return exact;
      if (!id.startsWith("resp_") || id.length < 28) return "";
      const prefix = id.slice(0, 24);
      const matches = db.prepare("SELECT data FROM responses WHERE response_id LIKE ? ORDER BY accessed_at DESC LIMIT 2").all(`${prefix}%`);
      if (matches.length !== 1) return "";
      return responseSessionIdFromData(matches[0]?.data || "");
    } catch (_) {
      return "";
    }
  }) || "";
}

function readSessionUsage(stateDbPath, sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) return null;
  return withReadonlyDatabase(stateDbPath, "state", (db) => {
    const columns = tableColumns(db, "sessions");
    if (!columns.has("id")) return null;
    const selected = SESSION_USAGE_COLUMNS.filter((column) => columns.has(column));
    if (!selected.length) return null;
    const sql = `SELECT ${selected.map(sqlQuoteIdent).join(", ")} FROM sessions WHERE id = ? LIMIT 1`;
    try {
      return db.prepare(sql).get(id) || null;
    } catch (_) {
      return null;
    }
  });
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hasMeaningfulTelemetry(usage = {}) {
  return Boolean(
    numberOrNull(usage.cache_read_tokens) !== null
    || numberOrNull(usage.cached_input_tokens) !== null
    || numberOrNull(usage.api_calls) !== null
    || numberOrNull(usage.api_call_count) !== null
    || numberOrNull(usage.estimated_cost_usd) !== null
    || numberOrNull(usage.actual_cost_usd) !== null
    || String(usage.cost_status || "").trim()
  );
}

function numericUsage(base, ...keys) {
  for (const key of keys) {
    const value = numberOrNull(base?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function sessionTotal(row, baseUsage) {
  const input = numberOrNull(row.input_tokens) || 0;
  const cached = numberOrNull(row.cache_read_tokens) || 0;
  const cacheWrite = numberOrNull(row.cache_write_tokens) || 0;
  const output = numberOrNull(row.output_tokens) || 0;
  if (
    numberOrNull(row.input_tokens) !== null
    || numberOrNull(row.cache_read_tokens) !== null
    || numberOrNull(row.cache_write_tokens) !== null
    || numberOrNull(row.output_tokens) !== null
  ) {
    return input + cached + cacheWrite + output;
  }
  const existing = numericUsage(baseUsage, "total_tokens", "total");
  return existing !== null ? existing : 0;
}

function usageFromSession(row, baseUsage = {}, context = {}) {
  if (!row) return baseUsage || null;
  const next = Object.assign({}, baseUsage || {});
  const originalInput = numericUsage(baseUsage, "input_tokens", "prompt_tokens", "input");
  const sessionInput = numberOrNull(row.input_tokens);
  const sessionOutput = numberOrNull(row.output_tokens);
  const cacheRead = numberOrNull(row.cache_read_tokens);
  const cacheWrite = numberOrNull(row.cache_write_tokens);
  const reasoning = numberOrNull(row.reasoning_tokens);
  const apiCalls = numberOrNull(row.api_call_count);
  const estimatedCost = numberOrNull(row.estimated_cost_usd);
  const actualCost = numberOrNull(row.actual_cost_usd);

  if (originalInput !== null && sessionInput !== null && originalInput !== sessionInput) {
    next.gateway_reported_input_tokens = originalInput;
  }
  if (sessionInput !== null) {
    next.input_tokens = sessionInput;
    next.uncached_input_tokens = sessionInput;
  }
  if (sessionOutput !== null) next.output_tokens = sessionOutput;
  if (cacheRead !== null) {
    next.cache_read_tokens = cacheRead;
    next.cached_input_tokens = cacheRead;
  }
  if (cacheWrite !== null) next.cache_write_tokens = cacheWrite;
  if (reasoning !== null) next.reasoning_tokens = reasoning;
  if (apiCalls !== null) {
    next.api_calls = apiCalls;
    next.api_call_count = apiCalls;
  }
  if (estimatedCost !== null) next.estimated_cost_usd = estimatedCost;
  if (actualCost !== null) next.actual_cost_usd = actualCost;
  if (actualCost !== null || estimatedCost !== null) {
    next.api_cost_usd = actualCost !== null ? actualCost : estimatedCost;
  }
  if (row.billing_provider) next.billing_provider = String(row.billing_provider);
  if (row.billing_mode) next.billing_mode = String(row.billing_mode);
  if (row.cost_status) next.cost_status = String(row.cost_status);
  if (row.cost_source) next.cost_source = String(row.cost_source);
  if (row.pricing_version) next.pricing_version = String(row.pricing_version);
  next.total_tokens = sessionTotal(row, baseUsage);
  next.telemetry_source = "gateway_sessiondb";
  if (context.profile) next.telemetry_profile = context.profile;
  return next;
}

function manifestProfileRootCandidates(manifestPaths) {
  const roots = [];
  for (const manifestPath of cleanList(manifestPaths)) {
    const dir = path.dirname(manifestPath);
    if (!dir || dir === "." || dir === manifestPath) continue;
    roots.push(path.join(dir, "profiles"));
  }
  return roots;
}

function uniqueExistingPaths(paths) {
  const out = [];
  const seen = new Set();
  for (const item of paths) {
    const value = String(item || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    if (fs.existsSync(value)) out.push(value);
  }
  return out;
}

function profileNameCandidates(runRef = {}) {
  return cleanList([
    runRef.telemetryProfile,
    runRef.telemetry_profile,
    runRef.profile,
    runRef.gatewayProfile,
  ]);
}

function workerTelemetryStateDbPath(worker = {}) {
  return String(worker.telemetryStateDbPath || worker.telemetry_state_db_path || worker.stateDbPath || worker.state_db_path || "").trim();
}

function workerTelemetryResponseDbPath(worker = {}) {
  return String(
    worker.telemetryResponseStoreDbPath
    || worker.telemetry_response_store_db_path
    || worker.responseStoreDbPath
    || worker.response_store_db_path
    || "",
  ).trim();
}

function manifestDbCandidatesForRun(runRef = {}, manifestPaths = []) {
  const profiles = new Set(profileNameCandidates(runRef));
  if (!profiles.size) return [];
  const candidates = [];
  for (const manifestPath of cleanList(manifestPaths)) {
    let manifest = null;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch (_) {
      continue;
    }
    for (const worker of Array.isArray(manifest?.workers) ? manifest.workers : []) {
      if (!worker || typeof worker !== "object" || worker.enabled === false) continue;
      const workerProfiles = cleanList([
        worker.telemetryProfile,
        worker.telemetry_profile,
        worker.profile,
        worker.name,
        worker.id,
      ]);
      if (!workerProfiles.some((profile) => profiles.has(profile))) continue;
      const stateDbPath = workerTelemetryStateDbPath(worker);
      const responseStoreDbPath = workerTelemetryResponseDbPath(worker);
      if (!stateDbPath || !responseStoreDbPath) continue;
      candidates.push({
        profile: workerProfiles.find((profile) => profiles.has(profile)) || "",
        stateDbPath,
        responseStoreDbPath,
      });
    }
  }
  return candidates;
}

function dbCandidatesForRun(runRef = {}, profileRoots = [], manifestPaths = []) {
  const candidates = [];
  const explicitState = String(runRef.telemetryStateDbPath || runRef.telemetry_state_db_path || "").trim();
  const explicitResponse = String(runRef.telemetryResponseStoreDbPath || runRef.telemetry_response_store_db_path || "").trim();
  if (explicitState && explicitResponse) {
    candidates.push({
      profile: String(runRef.telemetryProfile || runRef.profile || runRef.gatewayProfile || "").trim(),
      stateDbPath: explicitState,
      responseStoreDbPath: explicitResponse,
    });
  }
  candidates.push(...manifestDbCandidatesForRun(runRef, manifestPaths));
  for (const profile of profileNameCandidates(runRef)) {
    for (const root of profileRoots) {
      const profileDir = path.join(root, profile);
      candidates.push({
        profile,
        stateDbPath: path.join(profileDir, "state.db"),
        responseStoreDbPath: path.join(profileDir, "response_store.db"),
      });
    }
  }
  return candidates.filter((item) => sqliteBundleExists(item.stateDbPath) && sqliteBundleExists(item.responseStoreDbPath));
}

function createGatewayUsageTelemetryProvider(options = {}) {
  function mode() {
    return envEnabled(readOption(options.enabled));
  }

  function profileRoots() {
    const explicit = cleanList(readOption(options.profileRoots));
    const fromManifests = manifestProfileRootCandidates(readOption(options.manifestPaths));
    return uniqueExistingPaths([...explicit, ...fromManifests]);
  }

  function supplementUsage(baseUsage, runRef = {}) {
    const currentMode = mode();
    if (currentMode === "off") return baseUsage || null;
    const responseId = String(runRef.responseId || runRef.response_id || runRef.runId || runRef.run_id || "").trim();
    if (!responseId) return baseUsage || null;
    if (currentMode === "auto" && hasMeaningfulTelemetry(baseUsage || {})) return baseUsage || null;
    const candidates = dbCandidatesForRun(runRef, profileRoots(), readOption(options.manifestPaths));
    for (const candidate of candidates) {
      const sessionId = readSessionIdForResponse(candidate.responseStoreDbPath, responseId);
      if (!sessionId) continue;
      const sessionUsage = readSessionUsage(candidate.stateDbPath, sessionId);
      if (!sessionUsage) continue;
      return usageFromSession(sessionUsage, baseUsage || {}, { profile: candidate.profile });
    }
    return baseUsage || null;
  }

  return {
    profileRoots,
    supplementUsage,
  };
}

module.exports = {
  createGatewayUsageTelemetryProvider,
  dbCandidatesForRun,
  manifestDbCandidatesForRun,
  manifestProfileRootCandidates,
  responseSessionIdFromData,
  usageFromSession,
};
