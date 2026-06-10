"use strict";

const path = require("node:path");

const STORE_SCHEMA_VERSION = 1;
const CLAIM_MODES = new Set(["claimed_by_plugin", "auxiliary_context"]);
const CONTEXT_ROLES = new Set(["primary_evidence", "legacy_context", "delivery_context"]);

function cleanWorkspaceId(value = "") {
  return String(value || "").trim().slice(0, 160) || "owner";
}

function cleanPluginId(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function cleanTopicId(value = "") {
  return String(value || "").trim().slice(0, 160);
}

function comparableDirectoryPath(value = "") {
  return String(value || "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "")
    .toLowerCase();
}

function normalizeDirectoryRoute(route = {}, options = {}) {
  const source = route && typeof route === "object" && !Array.isArray(route) ? route : {};
  const workspaceId = cleanWorkspaceId(
    options.workspaceId
    || source.workspaceId
    || source.workspace_id
    || source.ownerWorkspaceId
    || source.owner_workspace_id
    || source.actorWorkspaceId
    || source.actor_workspace_id
    || "",
  );
  const pathValue = comparableDirectoryPath(source.path || source.root || source.directoryPath || source.directory_path || "");
  const rootValue = comparableDirectoryPath(source.root || source.path || source.directoryRoot || source.directory_root || "");
  const projectId = String(source.projectId || source.project_id || source.id || "").trim().slice(0, 160);
  const subprojectId = String(source.subprojectId || source.subproject_id || "").trim().slice(0, 160);
  const key = [workspaceId, projectId, subprojectId, pathValue || rootValue].join("|");
  return {
    workspaceId,
    projectId,
    subprojectId,
    label: String(source.label || source.name || projectId || "").trim().slice(0, 160),
    path: String(source.path || source.root || "").trim(),
    root: String(source.root || source.path || "").trim(),
    key,
  };
}

function defaultStorePath(options = {}) {
  if (options.storePath) return String(options.storePath);
  const dataDir = String(
    options.dataDir
    || process.env.HERMES_WEB_DATA_DIR
    || process.env.HERMES_MOBILE_DATA_DIR
    || path.join(process.cwd(), "workspace", "hermes-web"),
  );
  return path.join(dataDir, "plugin-directory-context-bindings.json");
}

function emptyState() {
  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    updatedAt: "",
    workspaces: {},
  };
}

function normalizeClaimMode(value = "") {
  const mode = String(value || "").trim();
  return CLAIM_MODES.has(mode) ? mode : "claimed_by_plugin";
}

function normalizeContextRole(value = "") {
  const role = String(value || "").trim();
  return CONTEXT_ROLES.has(role) ? role : "legacy_context";
}

function normalizeBinding(value = {}, options = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const route = normalizeDirectoryRoute(source.directoryRoute || source.directory_route || source.route || {}, {
    workspaceId: source.workspaceId || source.workspace_id || options.workspaceId || "",
  });
  const workspaceId = cleanWorkspaceId(source.workspaceId || source.workspace_id || route.workspaceId || options.workspaceId || "");
  const pluginId = cleanPluginId(source.pluginId || source.plugin_id || options.pluginId || "");
  const directoryRouteKey = String(source.directoryRouteKey || source.directory_route_key || route.key || "").trim();
  if (!workspaceId || !pluginId || !directoryRouteKey) return null;
  const claimMode = normalizeClaimMode(source.claimMode || source.claim_mode);
  const hideDefault = claimMode === "claimed_by_plugin";
  return {
    id: String(source.id || `${workspaceId}:${pluginId}:${directoryRouteKey}`).trim().slice(0, 260),
    workspaceId,
    pluginId,
    directoryRoute: Object.assign({}, route, { workspaceId }),
    directoryRouteKey,
    claimMode,
    contextRole: normalizeContextRole(source.contextRole || source.context_role),
    hideFromDirectoryTopicRoot: Object.hasOwn(source, "hideFromDirectoryTopicRoot")
      ? Boolean(source.hideFromDirectoryTopicRoot)
      : Object.hasOwn(source, "hide_from_directory_topic_root")
        ? Boolean(source.hide_from_directory_topic_root)
        : hideDefault,
    defaultTopicId: cleanTopicId(source.defaultTopicId || source.default_topic_id || `plugin:${pluginId}`),
    createdAt: String(source.createdAt || source.created_at || options.nowIso?.() || "").trim(),
    updatedAt: String(source.updatedAt || source.updated_at || options.nowIso?.() || "").trim(),
  };
}

function normalizeState(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const out = emptyState();
  out.updatedAt = String(source.updatedAt || source.updated_at || "");
  const workspaces = source.workspaces && typeof source.workspaces === "object" && !Array.isArray(source.workspaces)
    ? source.workspaces
    : {};
  for (const [rawWorkspaceId, rawRecord] of Object.entries(workspaces)) {
    const workspaceId = cleanWorkspaceId(rawWorkspaceId);
    const record = rawRecord && typeof rawRecord === "object" && !Array.isArray(rawRecord) ? rawRecord : {};
    const bindings = {};
    for (const rawBinding of Array.isArray(record.bindings) ? record.bindings : Object.values(record.bindings || {})) {
      const binding = normalizeBinding(rawBinding, { workspaceId });
      if (binding) bindings[binding.directoryRouteKey] = binding;
    }
    out.workspaces[workspaceId] = {
      updatedAt: String(record.updatedAt || record.updated_at || ""),
      bindings,
    };
  }
  return out;
}

function createPluginDirectoryContextBindingService(options = {}) {
  const fs = options.fs || require("node:fs");
  const storePath = defaultStorePath(options);
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
    return normalizeState(readJsonStore(storePath, emptyState()));
  }

  function writeState(state) {
    const normalized = normalizeState(state);
    normalized.schemaVersion = STORE_SCHEMA_VERSION;
    normalized.updatedAt = nowIso();
    writeJsonStore(storePath, normalized);
    return normalized;
  }

  function listWorkspaceBindings(workspaceId = "owner", options = {}) {
    const id = cleanWorkspaceId(workspaceId);
    const state = readState();
    const bindings = Object.values(state.workspaces[id]?.bindings || {})
      .filter((binding) => !options.pluginId || binding.pluginId === cleanPluginId(options.pluginId))
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || a.directoryRouteKey.localeCompare(b.directoryRouteKey));
    return {
      ok: true,
      workspaceId: id,
      bindings,
    };
  }

  function upsertBinding(input = {}) {
    const timestamp = nowIso();
    const binding = normalizeBinding(Object.assign({}, input, { updatedAt: timestamp }), { nowIso, workspaceId: input.workspaceId || input.workspace_id });
    if (!binding) {
      const err = new Error("invalid_plugin_directory_context_binding");
      err.code = "invalid_plugin_directory_context_binding";
      throw err;
    }
    const state = readState();
    const record = state.workspaces[binding.workspaceId] || { updatedAt: "", bindings: {} };
    const existing = record.bindings[binding.directoryRouteKey] || {};
    record.bindings[binding.directoryRouteKey] = Object.assign({}, binding, {
      createdAt: existing.createdAt || binding.createdAt || timestamp,
      updatedAt: timestamp,
    });
    record.updatedAt = timestamp;
    state.workspaces[binding.workspaceId] = record;
    writeState(state);
    return {
      ok: true,
      workspaceId: binding.workspaceId,
      binding: record.bindings[binding.directoryRouteKey],
    };
  }

  function bindingForRoute(workspaceId, route = {}) {
    const normalized = normalizeDirectoryRoute(route, { workspaceId });
    const state = readState();
    return state.workspaces[normalized.workspaceId]?.bindings?.[normalized.key] || null;
  }

  function claimedDirectoryKeys(workspaceId = "owner", options = {}) {
    const keys = new Set();
    for (const binding of listWorkspaceBindings(workspaceId, options).bindings) {
      if (binding.claimMode === "claimed_by_plugin" && binding.hideFromDirectoryTopicRoot) {
        keys.add(binding.directoryRouteKey);
      }
    }
    return keys;
  }

  function filterDirectoryTopicCollections(workspaceId = "owner", collections = []) {
    const hidden = claimedDirectoryKeys(workspaceId);
    return (collections || []).filter((collection) => !hidden.has(String(collection?.key || "")));
  }

  return {
    bindingForRoute,
    claimedDirectoryKeys,
    cleanPluginId,
    cleanWorkspaceId,
    comparableDirectoryPath,
    filterDirectoryTopicCollections,
    listWorkspaceBindings,
    normalizeBinding: (value) => normalizeBinding(value, { nowIso }),
    normalizeDirectoryRoute,
    storePath,
    upsertBinding,
  };
}

module.exports = {
  CLAIM_MODES,
  CONTEXT_ROLES,
  STORE_SCHEMA_VERSION,
  cleanPluginId,
  cleanWorkspaceId,
  comparableDirectoryPath,
  createPluginDirectoryContextBindingService,
  normalizeBinding,
  normalizeDirectoryRoute,
};
