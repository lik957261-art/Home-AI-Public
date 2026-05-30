"use strict";

const fs = require("node:fs");
const path = require("node:path");

const STORE_VERSION = 1;

function stringValue(value) {
  return String(value || "").trim();
}

function sanitizeId(value) {
  return stringValue(value).replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 96);
}

function defaultDataDir(env = process.env) {
  return stringValue(env.HERMES_WEB_DATA_DIR)
    || path.join(process.cwd(), "workspace", "hermes-web");
}

function defaultStorePath(options = {}) {
  return stringValue(options.storePath)
    || path.join(stringValue(options.dataDir) || defaultDataDir(options.env), "plugin-workspace-authorizations.json");
}

function emptyState() {
  return { version: STORE_VERSION, plugins: {} };
}

function normalizeRecord(record = {}) {
  const workspaceId = sanitizeId(record.workspaceId);
  if (!workspaceId || workspaceId === "owner") return null;
  return {
    workspaceId,
    status: stringValue(record.status) || "authorized",
    provisioningStatus: stringValue(record.provisioningStatus) || "not_started",
    createdAt: stringValue(record.createdAt),
    createdBy: stringValue(record.createdBy),
    updatedAt: stringValue(record.updatedAt),
    updatedBy: stringValue(record.updatedBy),
  };
}

function normalizeState(raw = {}) {
  const state = emptyState();
  const plugins = raw && typeof raw === "object" && raw.plugins && typeof raw.plugins === "object"
    ? raw.plugins
    : {};
  for (const [rawPluginId, rawPluginState] of Object.entries(plugins)) {
    const pluginId = sanitizeId(rawPluginId);
    if (!pluginId || !rawPluginState || typeof rawPluginState !== "object") continue;
    const records = {};
    const rawRecords = rawPluginState.records && typeof rawPluginState.records === "object"
      ? rawPluginState.records
      : {};
    for (const [rawWorkspaceId, rawRecord] of Object.entries(rawRecords)) {
      const record = normalizeRecord(Object.assign({}, rawRecord, { workspaceId: rawRecord?.workspaceId || rawWorkspaceId }));
      if (record) records[record.workspaceId] = record;
    }
    state.plugins[pluginId] = { records };
  }
  return state;
}

function createHermesPluginAuthorizationService(options = {}) {
  const storePath = defaultStorePath(options);
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();

  function loadState() {
    try {
      if (!fs.existsSync(storePath)) return emptyState();
      return normalizeState(JSON.parse(fs.readFileSync(storePath, "utf8")));
    } catch (_) {
      return emptyState();
    }
  }

  function saveState(state) {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    const normalized = normalizeState(state);
    const tempPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, storePath);
    return normalized;
  }

  function pluginState(state, pluginId) {
    const id = sanitizeId(pluginId);
    if (!id) return null;
    if (!state.plugins[id]) state.plugins[id] = { records: {} };
    return state.plugins[id];
  }

  function list() {
    const state = loadState();
    return Object.entries(state.plugins).map(([pluginId, value]) => ({
      pluginId,
      workspaces: Object.values(value.records || {}).filter((record) => record.status === "authorized"),
    }));
  }

  function authorizedWorkspaceIds(pluginId) {
    const id = sanitizeId(pluginId);
    const state = loadState();
    const records = state.plugins[id]?.records || {};
    return Object.values(records)
      .filter((record) => record.status === "authorized")
      .map((record) => record.workspaceId);
  }

  function isWorkspaceAuthorized(pluginId, workspaceId) {
    const id = sanitizeId(pluginId);
    const ws = sanitizeId(workspaceId);
    if (!id || !ws || ws === "owner") return false;
    const state = loadState();
    return state.plugins[id]?.records?.[ws]?.status === "authorized";
  }

  function grantWorkspace(input = {}) {
    const pluginId = sanitizeId(input.pluginId);
    const workspaceId = sanitizeId(input.workspaceId);
    if (!pluginId) return { ok: false, error: "plugin_id_required" };
    if (!workspaceId || workspaceId === "owner") return { ok: false, error: "workspace_id_required" };
    const state = loadState();
    const plugin = pluginState(state, pluginId);
    const existing = plugin.records[workspaceId] || {};
    const at = nowIso();
    const actor = stringValue(input.actor || "owner").slice(0, 120);
    plugin.records[workspaceId] = normalizeRecord(Object.assign({}, existing, {
      workspaceId,
      status: "authorized",
      provisioningStatus: stringValue(input.provisioningStatus || existing.provisioningStatus || "not_started"),
      createdAt: existing.createdAt || at,
      createdBy: existing.createdBy || actor,
      updatedAt: at,
      updatedBy: actor,
    }));
    const saved = saveState(state);
    return {
      ok: true,
      pluginId,
      workspaceId,
      record: saved.plugins[pluginId].records[workspaceId],
    };
  }

  function revokeWorkspace(input = {}) {
    const pluginId = sanitizeId(input.pluginId);
    const workspaceId = sanitizeId(input.workspaceId);
    if (!pluginId) return { ok: false, error: "plugin_id_required" };
    if (!workspaceId || workspaceId === "owner") return { ok: false, error: "workspace_id_required" };
    const state = loadState();
    const plugin = pluginState(state, pluginId);
    if (plugin.records[workspaceId]) delete plugin.records[workspaceId];
    saveState(state);
    return { ok: true, pluginId, workspaceId };
  }

  return {
    storePath,
    list,
    authorizedWorkspaceIds,
    isWorkspaceAuthorized,
    grantWorkspace,
    revokeWorkspace,
  };
}

module.exports = {
  createHermesPluginAuthorizationService,
  defaultStorePath,
  normalizeState,
};
