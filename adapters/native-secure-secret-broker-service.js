"use strict";

const crypto = require("node:crypto");

const DEFAULT_ALLOWED_SOURCES = Object.freeze(["ios_clipboard"]);
const DEFAULT_ALLOWED_TARGET_PLUGINS = Object.freeze(["codex"]);
const DEFAULT_ALLOWED_PURPOSES = Object.freeze(["current_task"]);
const DEFAULT_TTL_SECONDS = 600;
const MAX_TTL_SECONDS = 900;
const MAX_SECRET_BYTES = 64 * 1024;
const MAX_SECRET_USES = 3;

function nowMsDefault() {
  return Date.now();
}

function clean(value, max = 200) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function normalizeSet(values) {
  return new Set((values || []).map((value) => clean(value, 120)).filter(Boolean));
}

function error(code, status = 400, message = code) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function sha256Prefix(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex").slice(0, 16);
}

function bytesForSecret(value) {
  return Buffer.byteLength(String(value || ""), "utf8");
}

function publicMetadata(record, nowMs = nowMsDefault()) {
  const expiresAtMs = Number(record.expiresAtMs || 0);
  const remainingUses = Math.max(0, Number(record.maxUses || 0) - Number(record.useCount || 0));
  return {
    secretRef: record.secretRef,
    source: record.source,
    targetPlugin: record.targetPlugin,
    purpose: record.purpose,
    workspaceId: record.workspaceId,
    principalId: record.principalId,
    createdAt: new Date(record.createdAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    expired: expiresAtMs <= nowMs,
    maxUses: record.maxUses,
    useCount: record.useCount,
    remainingUses,
    valueBytes: record.valueBytes,
    valueSha256Prefix: record.valueSha256Prefix,
  };
}

function authWorkspace(auth) {
  return clean(auth?.workspaceId || "", 120);
}

function createNativeSecureSecretBrokerService(options = {}) {
  const secrets = new Map();
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : nowMsDefault;
  const randomBytes = typeof options.randomBytes === "function" ? options.randomBytes : crypto.randomBytes;
  const allowedSources = normalizeSet(options.allowedSources || DEFAULT_ALLOWED_SOURCES);
  const allowedTargetPlugins = normalizeSet(options.allowedTargetPlugins || DEFAULT_ALLOWED_TARGET_PLUGINS);
  const allowedPurposes = normalizeSet(options.allowedPurposes || DEFAULT_ALLOWED_PURPOSES);
  const defaultTtlSeconds = clampInteger(options.defaultTtlSeconds, DEFAULT_TTL_SECONDS, 30, MAX_TTL_SECONDS);
  const maxTtlSeconds = clampInteger(options.maxTtlSeconds, MAX_TTL_SECONDS, 60, MAX_TTL_SECONDS);
  const maxSecretBytes = clampInteger(options.maxSecretBytes, MAX_SECRET_BYTES, 1024, MAX_SECRET_BYTES);
  const defaultMaxUses = clampInteger(options.defaultMaxUses, 1, 1, MAX_SECRET_USES);
  const maxSecretUses = clampInteger(options.maxSecretUses, MAX_SECRET_USES, 1, MAX_SECRET_USES);

  function createRef() {
    return `sec_${randomBytes(18).toString("base64url")}`;
  }

  function pruneExpired(now = nowMs()) {
    let pruned = 0;
    for (const [secretRef, record] of secrets.entries()) {
      if (Number(record.expiresAtMs || 0) > now) continue;
      record.value = "";
      secrets.delete(secretRef);
      pruned += 1;
    }
    return pruned;
  }

  function assertUsableAuth(auth, action) {
    if (!auth?.ok) throw error("secure_secret_unauthorized", 401);
    if (auth.auditReadOnly || auth.keySource === "audit_owner_readonly") {
      throw error("secure_secret_readonly_key_denied", 403);
    }
    const workspaceId = authWorkspace(auth);
    if (!workspaceId) throw error("secure_secret_workspace_required", 403);
    return {
      action,
      workspaceId,
      principalId: clean(auth.principalId || workspaceId, 160) || workspaceId,
      role: clean(auth.role || "", 60),
      isOwner: Boolean(auth.isOwner || auth.role === "owner"),
    };
  }

  function normalizeCreateInput(input = {}) {
    const source = clean(input.source, 80);
    const targetPlugin = clean(input.targetPlugin || input.target_plugin, 80);
    const purpose = clean(input.purpose, 80);
    if (!allowedSources.has(source)) throw error("secure_secret_source_not_allowed", 400);
    if (!allowedTargetPlugins.has(targetPlugin)) throw error("secure_secret_target_not_allowed", 400);
    if (!allowedPurposes.has(purpose)) throw error("secure_secret_purpose_not_allowed", 400);
    if (typeof input.value !== "string") throw error("secure_secret_value_required", 400);
    const value = input.value;
    const valueBytes = bytesForSecret(value);
    if (valueBytes <= 0) throw error("secure_secret_value_required", 400);
    if (valueBytes > maxSecretBytes) throw error("secure_secret_value_too_large", 413);
    const ttlSeconds = clampInteger(input.ttlSeconds ?? input.ttl_seconds, defaultTtlSeconds, 30, maxTtlSeconds);
    const maxUses = clampInteger(input.maxUses ?? input.max_uses, defaultMaxUses, 1, maxSecretUses);
    return { source, targetPlugin, purpose, value, valueBytes, ttlSeconds, maxUses };
  }

  function createSecret({ auth, input = {} } = {}) {
    pruneExpired();
    const actor = assertUsableAuth(auth, "create");
    const normalized = normalizeCreateInput(input);
    const createdAtMs = nowMs();
    const expiresAtMs = createdAtMs + normalized.ttlSeconds * 1000;
    const secretRef = createRef();
    const record = {
      secretRef,
      source: normalized.source,
      targetPlugin: normalized.targetPlugin,
      purpose: normalized.purpose,
      workspaceId: actor.workspaceId,
      principalId: actor.principalId,
      role: actor.role,
      createdAtMs,
      expiresAtMs,
      maxUses: normalized.maxUses,
      useCount: 0,
      value: normalized.value,
      valueBytes: normalized.valueBytes,
      valueSha256Prefix: sha256Prefix(normalized.value),
    };
    secrets.set(secretRef, record);
    return Object.assign({ ok: true }, publicMetadata(record, createdAtMs));
  }

  function resolveSecret({ auth, secretRef, targetPlugin, purpose, consume = true } = {}) {
    const actor = assertUsableAuth(auth, "resolve");
    const ref = clean(secretRef, 120);
    if (!ref) throw error("secure_secret_ref_required", 400);
    const record = secrets.get(ref);
    if (!record) throw error("secure_secret_not_found", 404);
    const currentNowMs = nowMs();
    if (Number(record.expiresAtMs || 0) <= currentNowMs) {
      record.value = "";
      secrets.delete(ref);
      throw error("secure_secret_expired", 410);
    }
    if (record.workspaceId !== actor.workspaceId) {
      throw error("secure_secret_workspace_denied", 403);
    }
    const normalizedTarget = clean(targetPlugin || "", 80);
    if (!normalizedTarget) throw error("secure_secret_target_required", 400);
    if (normalizedTarget !== record.targetPlugin) {
      throw error("secure_secret_target_mismatch", 403);
    }
    const normalizedPurpose = clean(purpose || "", 80);
    if (normalizedPurpose && normalizedPurpose !== record.purpose) {
      throw error("secure_secret_purpose_mismatch", 403);
    }
    if (!record.value || Number(record.useCount || 0) >= Number(record.maxUses || 0)) {
      throw error("secure_secret_used_up", 410);
    }
    const value = record.value;
    if (consume !== false) {
      record.useCount += 1;
      if (record.useCount >= record.maxUses) {
        record.value = "";
      }
    }
    return Object.assign({ ok: true, value }, publicMetadata(record, currentNowMs));
  }

  function describeSecret({ auth, secretRef } = {}) {
    const actor = assertUsableAuth(auth, "describe");
    const ref = clean(secretRef, 120);
    if (!ref) throw error("secure_secret_ref_required", 400);
    const record = secrets.get(ref);
    if (!record) throw error("secure_secret_not_found", 404);
    if (record.workspaceId !== actor.workspaceId) throw error("secure_secret_workspace_denied", 403);
    return Object.assign({ ok: true }, publicMetadata(record, nowMs()));
  }

  return {
    createSecret,
    describeSecret,
    pruneExpired,
    resolveSecret,
    size: () => secrets.size,
    _unsafeSnapshotForTest: () => Array.from(secrets.values()).map((record) => Object.assign({}, record)),
  };
}

module.exports = {
  DEFAULT_TTL_SECONDS,
  MAX_SECRET_BYTES,
  MAX_TTL_SECONDS,
  createNativeSecureSecretBrokerService,
  publicMetadata,
};
