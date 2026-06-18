"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { normalizeEnvironmentContext } = require("./environment-context-service");

const DEFAULT_TTL_SECONDS = 15 * 60;
const MAX_TTL_SECONDS = 60 * 60;

function cleanString(value, max = 160) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function objectValue(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

function parseTime(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : 0;
}

function ttlSeconds(value, fallback = DEFAULT_TTL_SECONDS) {
  const number = Math.floor(Number(value || fallback) || fallback);
  return Math.max(1, Math.min(MAX_TTL_SECONDS, number));
}

function snapshotKey(workspaceId, principalId, deviceId = "") {
  return [
    cleanString(workspaceId, 120) || "owner",
    cleanString(principalId, 120) || cleanString(workspaceId, 120) || "owner",
    cleanString(deviceId, 120) || "current",
  ].join("::");
}

function compactContext(context = {}) {
  const normalized = normalizeEnvironmentContext(context);
  if (!normalized) return null;
  if (normalized.weather) {
    delete normalized.weather.current;
    delete normalized.weather.hourlyForecast;
    delete normalized.weather.dailyForecast;
    delete normalized.weather.weatherKitFailure;
  }
  return normalized;
}

function readJsonFile(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function writeJsonFile(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, filePath);
}

function createCurrentEnvironmentContextService(options = {}) {
  const storagePath = path.resolve(
    options.storagePath
    || process.env.HERMES_MOBILE_ENVIRONMENT_CONTEXT_SNAPSHOT_PATH
    || process.env.HERMES_WEB_ENVIRONMENT_CONTEXT_SNAPSHOT_PATH
    || path.join(options.dataDir || process.env.HERMES_WEB_DATA_DIR || path.join(process.cwd(), "workspace", "hermes-web"), "environment-context-snapshots.json"),
  );
  const clock = typeof options.nowMs === "function" ? options.nowMs : Date.now;

  function readStore() {
    const store = readJsonFile(storagePath);
    if (!store.snapshots || typeof store.snapshots !== "object") store.snapshots = {};
    return store;
  }

  function writeStore(store) {
    writeJsonFile(storagePath, Object.assign({}, store, { updatedAt: nowIso(clock()) }));
  }

  function upsert(input = {}) {
    const workspaceId = cleanString(input.workspaceId || input.workspace_id, 120) || "owner";
    const principalId = cleanString(input.principalId || input.principal_id, 120) || workspaceId;
    const deviceId = cleanString(input.deviceId || input.device_id || input.sessionId || input.session_id || "current", 120) || "current";
    const context = compactContext(input.environmentContext || input.environment_context || input.context || input);
    if (!context) return { ok: false, status: 400, error: "environment_context_empty" };
    const createdAtMs = clock();
    const ttl = ttlSeconds(context.cacheTtlSeconds || input.ttlSeconds || input.ttl_seconds);
    const record = {
      workspaceId,
      principalId,
      deviceId,
      updatedAt: nowIso(createdAtMs),
      expiresAt: nowIso(createdAtMs + ttl * 1000),
      ttlSeconds: ttl,
      context,
    };
    const store = readStore();
    store.snapshots[snapshotKey(workspaceId, principalId, deviceId)] = record;
    if (deviceId !== "current") {
      store.snapshots[snapshotKey(workspaceId, principalId, "current")] = Object.assign({}, record, { deviceId: "current" });
    }
    writeStore(store);
    return { ok: true, snapshot: publicSnapshot(record, { includeContext: false }) };
  }

  function publicSnapshot(record = {}, options = {}) {
    const out = {
      workspaceId: record.workspaceId,
      principalId: record.principalId,
      deviceId: record.deviceId,
      updatedAt: record.updatedAt,
      expiresAt: record.expiresAt,
      ttlSeconds: record.ttlSeconds,
      expired: parseTime(record.expiresAt) <= clock(),
    };
    if (options.includeContext) out.context = record.context;
    Object.keys(out).forEach((key) => {
      if (out[key] === "" || out[key] === undefined || out[key] === null) delete out[key];
    });
    return out;
  }

  function get(input = {}) {
    const workspaceId = cleanString(input.workspaceId || input.workspace_id, 120) || "owner";
    const principalId = cleanString(input.principalId || input.principal_id, 120) || workspaceId;
    const deviceId = cleanString(input.deviceId || input.device_id || "current", 120) || "current";
    const record = objectValue(readStore().snapshots)[snapshotKey(workspaceId, principalId, deviceId)]
      || objectValue(readStore().snapshots)[snapshotKey(workspaceId, principalId, "current")];
    if (!record) {
      return { ok: false, status: 404, error: "current_environment_unavailable", reason: "snapshot_missing", workspaceId, principalId };
    }
    const snapshot = publicSnapshot(record, { includeContext: true });
    if (snapshot.expired) {
      return { ok: false, status: 410, error: "current_environment_unavailable", reason: "snapshot_expired", snapshot };
    }
    return { ok: true, snapshot, environmentContext: snapshot.context };
  }

  return Object.freeze({
    get,
    storagePath,
    upsert,
  });
}

module.exports = {
  createCurrentEnvironmentContextService,
  snapshotKey,
};
