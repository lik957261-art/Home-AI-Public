"use strict";

const path = require("node:path");

const STORE_SCHEMA_VERSION = 2;
const DEFAULT_MAX_BUCKET_ENTRIES = 96;
const DEFAULT_MAX_PINNED_BOTTOM_TABS = 3;
const DEFAULT_MAX_PLUGIN_ORDER_ENTRIES = 64;

function clampInteger(value, max = Number.MAX_SAFE_INTEGER) {
  const n = Math.floor(Number(value) || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, max);
}

function cleanUsageKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function cleanWorkspaceId(value = "") {
  return String(value || "").trim().slice(0, 160) || "owner";
}

function cleanPreferencePluginId(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function normalizeUsageEntry(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const count = clampInteger(source.count, 1_000_000_000);
  const lastUsedAt = clampInteger(source.lastUsedAt || source.last_used_at, 9_999_999_999_999);
  if (!count && !lastUsedAt) return null;
  return { count, lastUsedAt };
}

function trimBucket(bucket, maxEntries) {
  return Object.fromEntries(Object.entries(bucket || {})
    .sort((a, b) => (
      Number(b[1]?.count || 0) - Number(a[1]?.count || 0)
      || Number(b[1]?.lastUsedAt || 0) - Number(a[1]?.lastUsedAt || 0)
      || String(a[0]).localeCompare(String(b[0]))
    ))
    .slice(0, maxEntries));
}

function normalizeBucket(value, maxEntries = DEFAULT_MAX_BUCKET_ENTRIES) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const out = {};
  for (const [rawKey, rawEntry] of Object.entries(source)) {
    const key = cleanUsageKey(rawKey);
    const entry = normalizeUsageEntry(rawEntry);
    if (key && entry) out[key] = entry;
  }
  return trimBucket(out, maxEntries);
}

function normalizeUsage(value, options = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const maxEntries = Math.max(1, Number(options.maxBucketEntries || DEFAULT_MAX_BUCKET_ENTRIES) || DEFAULT_MAX_BUCKET_ENTRIES);
  const pluginBucket = Object.assign({}, source.plugins && typeof source.plugins === "object" ? source.plugins : {});
  for (const [key, entry] of Object.entries(source)) {
    if (["plugins", "actions", "preferences", "prefs", "updatedAt", "updated_at", "preferencesUpdatedAt", "preferences_updated_at"].includes(key)) continue;
    if (entry && typeof entry === "object" && !Array.isArray(entry)) pluginBucket[key] = entry;
  }
  return {
    plugins: normalizeBucket(pluginBucket, maxEntries),
    actions: normalizeBucket(source.actions, maxEntries),
  };
}

function mergeUsage(baseUsage, incomingUsage, options = {}) {
  const maxEntries = Math.max(1, Number(options.maxBucketEntries || DEFAULT_MAX_BUCKET_ENTRIES) || DEFAULT_MAX_BUCKET_ENTRIES);
  const base = normalizeUsage(baseUsage, { maxBucketEntries: maxEntries });
  const incoming = normalizeUsage(incomingUsage, { maxBucketEntries: maxEntries });
  const merged = { plugins: {}, actions: {} };
  for (const bucketName of ["plugins", "actions"]) {
    const keys = new Set([...Object.keys(base[bucketName]), ...Object.keys(incoming[bucketName])]);
    for (const key of keys) {
      const current = base[bucketName][key] || {};
      const next = incoming[bucketName][key] || {};
      const entry = normalizeUsageEntry({
        count: Math.max(Number(current.count || 0), Number(next.count || 0)),
        lastUsedAt: Math.max(Number(current.lastUsedAt || 0), Number(next.lastUsedAt || 0)),
      });
      if (entry) merged[bucketName][key] = entry;
    }
    merged[bucketName] = trimBucket(merged[bucketName], maxEntries);
  }
  return merged;
}

function normalizePinnedBottomTabs(value, maxEntries = DEFAULT_MAX_PINNED_BOTTOM_TABS) {
  const source = Array.isArray(value) ? value : [];
  const limit = Math.max(0, Number(maxEntries) || DEFAULT_MAX_PINNED_BOTTOM_TABS);
  const out = [];
  for (const raw of source) {
    const id = cleanPreferencePluginId(raw);
    if (id && !out.includes(id)) out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}

function normalizePluginOrder(value, maxEntries = DEFAULT_MAX_PLUGIN_ORDER_ENTRIES) {
  const source = Array.isArray(value) ? value : [];
  const limit = Math.max(0, Number(maxEntries) || DEFAULT_MAX_PLUGIN_ORDER_ENTRIES);
  const out = [];
  for (const raw of source) {
    const id = cleanPreferencePluginId(raw);
    if (id && !out.includes(id)) out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}

function normalizePreferences(value, options = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const maxPinnedBottomTabs = Math.max(
    0,
    Number(options.maxPinnedBottomTabs || DEFAULT_MAX_PINNED_BOTTOM_TABS) || DEFAULT_MAX_PINNED_BOTTOM_TABS,
  );
  const maxPluginOrderEntries = Math.max(
    0,
    Number(options.maxPluginOrderEntries || DEFAULT_MAX_PLUGIN_ORDER_ENTRIES) || DEFAULT_MAX_PLUGIN_ORDER_ENTRIES,
  );
  return {
    pinnedBottomTabs: normalizePinnedBottomTabs(
      source.pinnedBottomTabs || source.pinned_bottom_tabs || source.bottomTabs || source.bottom_tabs,
      maxPinnedBottomTabs,
    ),
    pluginOrder: normalizePluginOrder(
      source.pluginOrder || source.plugin_order || source.drawerOrder || source.drawer_order,
      maxPluginOrderEntries,
    ),
  };
}

function hasPreferenceField(source, names) {
  return Boolean(source && names.some((name) => Object.prototype.hasOwnProperty.call(source, name)));
}

function mergePreferences(existingPreferences, incomingPreferences, options = {}) {
  const existing = normalizePreferences(existingPreferences, options);
  const source = incomingPreferences && typeof incomingPreferences === "object" && !Array.isArray(incomingPreferences)
    ? incomingPreferences
    : {};
  const out = { ...existing };
  if (hasPreferenceField(source, ["pinnedBottomTabs", "pinned_bottom_tabs", "bottomTabs", "bottom_tabs"])) {
    out.pinnedBottomTabs = normalizePreferences(source, options).pinnedBottomTabs;
  }
  if (hasPreferenceField(source, ["pluginOrder", "plugin_order", "drawerOrder", "drawer_order"])) {
    out.pluginOrder = normalizePreferences(source, options).pluginOrder;
  }
  return out;
}

function emptyState() {
  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    updatedAt: "",
    workspaces: {},
  };
}

function normalizeState(value, options = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const out = emptyState();
  out.updatedAt = String(source.updatedAt || source.updated_at || "");
  const workspaces = source.workspaces && typeof source.workspaces === "object" && !Array.isArray(source.workspaces)
    ? source.workspaces
    : {};
  for (const [rawWorkspaceId, rawRecord] of Object.entries(workspaces)) {
    const workspaceId = cleanWorkspaceId(rawWorkspaceId);
    const record = rawRecord && typeof rawRecord === "object" && !Array.isArray(rawRecord) ? rawRecord : {};
    out.workspaces[workspaceId] = {
      updatedAt: String(record.updatedAt || record.updated_at || ""),
      usage: normalizeUsage(record.usage || record, options),
      preferences: normalizePreferences(record.preferences, options),
      preferencesUpdatedAt: String(record.preferencesUpdatedAt || record.preferences_updated_at || ""),
    };
  }
  return out;
}

function defaultStorePath(options = {}) {
  if (options.storePath) return String(options.storePath);
  const dataDir = String(
    options.dataDir
    || process.env.HERMES_WEB_DATA_DIR
    || process.env.HERMES_MOBILE_DATA_DIR
    || path.join(process.cwd(), "workspace", "hermes-web"),
  );
  return path.join(dataDir, "plugin-topic-usage.json");
}

function createPluginTopicUsageService(options = {}) {
  const fs = options.fs || require("node:fs");
  const storePath = defaultStorePath(options);
  const maxBucketEntries = Math.max(1, Number(options.maxBucketEntries || DEFAULT_MAX_BUCKET_ENTRIES) || DEFAULT_MAX_BUCKET_ENTRIES);
  const maxPinnedBottomTabs = Math.max(0, Number(options.maxPinnedBottomTabs || DEFAULT_MAX_PINNED_BOTTOM_TABS) || DEFAULT_MAX_PINNED_BOTTOM_TABS);
  const maxPluginOrderEntries = Math.max(0, Number(options.maxPluginOrderEntries || DEFAULT_MAX_PLUGIN_ORDER_ENTRIES) || DEFAULT_MAX_PLUGIN_ORDER_ENTRIES);
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const readJsonStore = typeof options.readJsonStore === "function"
    ? options.readJsonStore
    : (filePath, fallback) => {
      try {
        if (!fs.existsSync(filePath)) return fallback;
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
      } catch (_) {
        return fallback;
      }
    };
  const writeJsonStore = typeof options.writeJsonStore === "function"
    ? options.writeJsonStore
    : (filePath, value) => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    };

  function readState() {
    return normalizeState(readJsonStore(storePath, emptyState()), { maxBucketEntries, maxPinnedBottomTabs, maxPluginOrderEntries });
  }

  function writeState(state) {
    const normalized = normalizeState(state, { maxBucketEntries, maxPinnedBottomTabs, maxPluginOrderEntries });
    normalized.schemaVersion = STORE_SCHEMA_VERSION;
    normalized.updatedAt = nowIso();
    writeJsonStore(storePath, normalized);
    return normalized;
  }

  function readWorkspaceUsage(workspaceId = "owner") {
    const id = cleanWorkspaceId(workspaceId);
    const state = readState();
    const record = state.workspaces[id] || {};
    return {
      ok: true,
      workspaceId: id,
      updatedAt: String(record.updatedAt || ""),
      usage: normalizeUsage(record.usage, { maxBucketEntries }),
      preferences: normalizePreferences(record.preferences, { maxPinnedBottomTabs, maxPluginOrderEntries }),
      preferencesUpdatedAt: String(record.preferencesUpdatedAt || ""),
    };
  }

  function mergeWorkspaceUsage(workspaceId = "owner", incomingUsage = {}, incomingPreferences = undefined) {
    const id = cleanWorkspaceId(workspaceId);
    const state = readState();
    const existing = state.workspaces[id] || {};
    const updatedAt = nowIso();
    const nextRecord = {
      updatedAt,
      usage: mergeUsage(existing.usage, incomingUsage, { maxBucketEntries }),
      preferences: normalizePreferences(existing.preferences, { maxPinnedBottomTabs, maxPluginOrderEntries }),
      preferencesUpdatedAt: String(existing.preferencesUpdatedAt || ""),
    };
    if (incomingPreferences !== undefined) {
      nextRecord.preferences = mergePreferences(existing.preferences, incomingPreferences, { maxPinnedBottomTabs, maxPluginOrderEntries });
      nextRecord.preferencesUpdatedAt = updatedAt;
    }
    state.workspaces[id] = nextRecord;
    writeState(state);
    return {
      ok: true,
      workspaceId: id,
      updatedAt,
      usage: state.workspaces[id].usage,
      preferences: state.workspaces[id].preferences,
      preferencesUpdatedAt: state.workspaces[id].preferencesUpdatedAt,
    };
  }

  return {
    mergeWorkspaceUsage,
    normalizePreferences: (preferences) => normalizePreferences(preferences, { maxPinnedBottomTabs, maxPluginOrderEntries }),
    normalizeUsage: (usage) => normalizeUsage(usage, { maxBucketEntries }),
    readWorkspaceUsage,
    storePath,
  };
}

module.exports = {
  STORE_SCHEMA_VERSION,
  createPluginTopicUsageService,
  mergeUsage,
  normalizePreferences,
  normalizeUsage,
};
