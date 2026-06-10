"use strict";

const path = require("node:path");
const {
  cleanPluginId,
  cleanWorkspaceId,
  comparableDirectoryPath,
  normalizeDirectoryRoute,
} = require("./plugin-directory-context-binding-service");

const STORE_SCHEMA_VERSION = 1;
const CONTEXT_ELIGIBLE_ROLES = new Set([
  "cleaned_summary",
  "pinned_context",
  "topic_bound",
  "context_source",
  "stage_summary",
]);
const NON_CONTEXT_ROLES = new Set([
  "delivery_only",
  "raw_source",
  "temporary_result",
  "archive",
]);

function cleanTopicId(value = "") {
  return String(value || "").trim().slice(0, 160);
}

function cleanFileRole(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "delivery_only";
}

function roleContextEligible(role = "") {
  const clean = cleanFileRole(role);
  if (NON_CONTEXT_ROLES.has(clean)) return false;
  return CONTEXT_ELIGIBLE_ROLES.has(clean);
}

function defaultStorePath(options = {}) {
  if (options.storePath) return String(options.storePath);
  const dataDir = String(
    options.dataDir
    || process.env.HERMES_WEB_DATA_DIR
    || process.env.HERMES_MOBILE_DATA_DIR
    || path.join(process.cwd(), "workspace", "hermes-web"),
  );
  return path.join(dataDir, "plugin-topic-context-sources.json");
}

function emptyState() {
  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    updatedAt: "",
    workspaces: {},
  };
}

function normalizeContextSource(value = {}, options = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const directoryRoute = source.directoryRoute || source.directory_route || source.route || null;
  const normalizedRoute = directoryRoute ? normalizeDirectoryRoute(directoryRoute, {
    workspaceId: source.workspaceId || source.workspace_id || options.workspaceId || "",
  }) : null;
  const workspaceId = cleanWorkspaceId(source.workspaceId || source.workspace_id || normalizedRoute?.workspaceId || options.workspaceId || "");
  const pluginId = cleanPluginId(source.pluginId || source.plugin_id || options.pluginId || "");
  const topicId = cleanTopicId(source.topicId || source.topic_id || source.taskGroupId || source.task_group_id || options.topicId || "");
  const fileRoute = comparableDirectoryPath(source.fileRoute || source.file_route || source.path || source.localPath || source.local_path || "");
  if (!workspaceId || !pluginId || !fileRoute) return null;
  const fileRole = cleanFileRole(source.fileRole || source.file_role || source.role);
  const contextEligible = Object.hasOwn(source, "contextEligible")
    ? Boolean(source.contextEligible)
    : Object.hasOwn(source, "context_eligible")
      ? Boolean(source.context_eligible)
      : roleContextEligible(fileRole);
  return {
    id: String(source.id || `${workspaceId}:${pluginId}:${topicId || "*"}:${fileRoute}`).trim().slice(0, 360),
    workspaceId,
    pluginId,
    topicId,
    directoryRoute: normalizedRoute,
    directoryRouteKey: String(source.directoryRouteKey || source.directory_route_key || normalizedRoute?.key || "").trim(),
    fileRoute,
    fileRole,
    contextEligible,
    topicScope: String(source.topicScope || source.topic_scope || (topicId ? "topic" : "plugin")).trim().slice(0, 80),
    sourceSkillId: String(source.sourceSkillId || source.source_skill_id || "").trim().slice(0, 160),
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
    const sources = {};
    for (const rawSource of Array.isArray(record.sources) ? record.sources : Object.values(record.sources || {})) {
      const contextSource = normalizeContextSource(rawSource, { workspaceId });
      if (contextSource) sources[contextSource.id] = contextSource;
    }
    out.workspaces[workspaceId] = {
      updatedAt: String(record.updatedAt || record.updated_at || ""),
      sources,
    };
  }
  return out;
}

function createPluginTopicContextSourceService(options = {}) {
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

  function listSources(input = {}) {
    const workspaceId = cleanWorkspaceId(input.workspaceId || input.workspace_id || "");
    const pluginId = cleanPluginId(input.pluginId || input.plugin_id || "");
    const topicId = cleanTopicId(input.topicId || input.topic_id || "");
    const eligibleOnly = input.eligibleOnly !== false && input.contextEligible !== false;
    const maxEntries = Math.max(1, Math.min(200, Number(input.maxEntries || input.limit || 40) || 40));
    const state = readState();
    const sources = Object.values(state.workspaces[workspaceId]?.sources || {})
      .filter((source) => !pluginId || source.pluginId === pluginId)
      .filter((source) => !topicId || !source.topicId || source.topicId === topicId)
      .filter((source) => !eligibleOnly || source.contextEligible)
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || a.fileRoute.localeCompare(b.fileRoute))
      .slice(0, maxEntries);
    return {
      ok: true,
      workspaceId,
      pluginId,
      topicId,
      sources,
    };
  }

  function upsertSource(input = {}) {
    const timestamp = nowIso();
    const source = normalizeContextSource(Object.assign({}, input, { updatedAt: timestamp }), {
      nowIso,
      workspaceId: input.workspaceId || input.workspace_id,
    });
    if (!source) {
      const err = new Error("invalid_plugin_topic_context_source");
      err.code = "invalid_plugin_topic_context_source";
      throw err;
    }
    const state = readState();
    const record = state.workspaces[source.workspaceId] || { updatedAt: "", sources: {} };
    record.sources[source.id] = source;
    record.updatedAt = timestamp;
    state.workspaces[source.workspaceId] = record;
    writeState(state);
    return {
      ok: true,
      workspaceId: source.workspaceId,
      source,
    };
  }

  return {
    listSources,
    normalizeContextSource: (value) => normalizeContextSource(value, { nowIso }),
    roleContextEligible,
    storePath,
    upsertSource,
  };
}

module.exports = {
  CONTEXT_ELIGIBLE_ROLES,
  NON_CONTEXT_ROLES,
  STORE_SCHEMA_VERSION,
  cleanFileRole,
  createPluginTopicContextSourceService,
  normalizeContextSource,
  roleContextEligible,
};
