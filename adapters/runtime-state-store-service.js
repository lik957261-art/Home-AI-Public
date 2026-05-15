"use strict";

const DEFAULT_RUNTIME_STATE = Object.freeze({
  schemaVersion: 1,
  workspaces: {},
  accessKeys: {},
  threads: [],
  artifacts: [],
  pushSubscriptions: [],
  pushDeliveries: [],
  pushReceipts: [],
  sharedDirectories: {},
  todos: [],
  automations: [],
  kanbanCaseShares: {},
  auditLog: [],
});

const ARRAY_FIELDS = new Set([
  "threads",
  "artifacts",
  "pushSubscriptions",
  "pushDeliveries",
  "pushReceipts",
  "todos",
  "automations",
  "auditLog",
]);

const OBJECT_FIELDS = new Set([
  "workspaces",
  "accessKeys",
  "sharedDirectories",
  "kanbanCaseShares",
]);

function safeCloneJson(value, fallback = null) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return safeCloneJson(fallback, null);
  }
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeArray(value) {
  return Array.isArray(value) ? safeCloneJson(value, []) : [];
}

function normalizeObject(value) {
  return isPlainObject(value) ? safeCloneJson(value, {}) : {};
}

function normalizeThread(thread) {
  const normalized = normalizeObject(thread);
  normalized.id = String(normalized.id || "");
  normalized.workspaceId = String(normalized.workspaceId || "");
  normalized.messages = normalizeArray(normalized.messages);
  normalized.messageCount = normalized.messages.length;
  return normalized;
}

function mergeRuntimeStateWithDefaults(input = {}, defaults = DEFAULT_RUNTIME_STATE) {
  const base = normalizeObject(defaults);
  const source = normalizeObject(input);
  const merged = Object.assign({}, base, source);

  for (const field of ARRAY_FIELDS) {
    merged[field] = normalizeArray(source[field] !== undefined ? source[field] : base[field]);
  }
  for (const field of OBJECT_FIELDS) {
    merged[field] = normalizeObject(source[field] !== undefined ? source[field] : base[field]);
  }

  const schemaVersion = Number(source.schemaVersion || base.schemaVersion || 1);
  merged.schemaVersion = Number.isFinite(schemaVersion) && schemaVersion > 0 ? schemaVersion : 1;
  merged.threads = normalizeArray(merged.threads).map(normalizeThread);
  return merged;
}

function countMessages(value) {
  if (Array.isArray(value)) return value.length;
  if (isPlainObject(value) && Array.isArray(value.messages)) return value.messages.length;
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
}

function decideMessageCountOverwrite(existing, next, options = {}) {
  const existingCount = countMessages(existing);
  const nextCount = countMessages(next);
  const allowDecrease = Boolean(options.allowDecrease);

  if (nextCount === existingCount) {
    return { overwrite: false, reason: "unchanged", existingCount, nextCount };
  }
  if (nextCount > existingCount) {
    return { overwrite: true, reason: "increase", existingCount, nextCount };
  }
  if (allowDecrease) {
    return { overwrite: true, reason: "allowed_decrease", existingCount, nextCount };
  }
  return { overwrite: false, reason: "stale_decrease_guard", existingCount, nextCount };
}

function backupSortKey(backup) {
  const createdAtMs = Date.parse(String(backup?.createdAt || backup?.mtime || ""));
  if (Number.isFinite(createdAtMs)) return createdAtMs;
  const numeric = Number(backup?.createdAtMs || backup?.mtimeMs || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function decideBackupPruning(backups, options = {}) {
  const maxBackups = Math.max(0, Number(options.maxBackups || 0) || 0);
  const entries = normalizeArray(backups).map((backup, index) => ({
    backup: normalizeObject(backup),
    index,
    sortKey: backupSortKey(backup),
  }));
  entries.sort((a, b) => (b.sortKey - a.sortKey) || (a.index - b.index));

  const keep = entries.slice(0, maxBackups).map((entry) => entry.backup);
  const prune = entries.slice(maxBackups).map((entry) => entry.backup);
  return { keep, prune, maxBackups };
}

function createRuntimeStateStoreService(options = {}) {
  const defaults = mergeRuntimeStateWithDefaults(options.defaults || DEFAULT_RUNTIME_STATE);

  return Object.freeze({
    defaults: safeCloneJson(defaults, {}),
    safeCloneJson,
    mergeRuntimeStateWithDefaults: (input) => mergeRuntimeStateWithDefaults(input, defaults),
    decideMessageCountOverwrite,
    decideBackupPruning,
  });
}

module.exports = {
  DEFAULT_RUNTIME_STATE,
  safeCloneJson,
  mergeRuntimeStateWithDefaults,
  decideMessageCountOverwrite,
  decideBackupPruning,
  createRuntimeStateStoreService,
};
