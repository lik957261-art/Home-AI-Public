"use strict";

const path = require("node:path");
const {
  cleanPluginId,
  cleanWorkspaceId,
  normalizeDirectoryRoute,
} = require("./plugin-directory-context-binding-service");

const STORE_SCHEMA_VERSION = 1;
const TOPIC_KINDS = new Set(["default_plugin_topic", "claimed_directory_topic", "user_special_topic"]);

function cleanTopicId(value = "") {
  return String(value || "").trim().slice(0, 160);
}

function normalizeTopicKind(value = "") {
  const kind = String(value || "").trim();
  return TOPIC_KINDS.has(kind) ? kind : "user_special_topic";
}

function defaultStorePath(options = {}) {
  if (options.storePath) return String(options.storePath);
  const dataDir = String(
    options.dataDir
    || process.env.HERMES_WEB_DATA_DIR
    || process.env.HERMES_MOBILE_DATA_DIR
    || path.join(process.cwd(), "workspace", "hermes-web"),
  );
  return path.join(dataDir, "plugin-topic-bindings.json");
}

function emptyState() {
  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    updatedAt: "",
    workspaces: {},
  };
}

function normalizeTopicBinding(value = {}, options = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const workspaceId = cleanWorkspaceId(source.workspaceId || source.workspace_id || options.workspaceId || "");
  const pluginId = cleanPluginId(source.pluginId || source.plugin_id || options.pluginId || "");
  const topicId = cleanTopicId(source.topicId || source.topic_id || source.taskGroupId || source.task_group_id || (pluginId ? `plugin:${pluginId}` : ""));
  if (!workspaceId || !pluginId || !topicId) return null;
  const directoryRoute = source.directoryRoute || source.directory_route || source.route || null;
  const normalizedRoute = directoryRoute ? normalizeDirectoryRoute(directoryRoute, { workspaceId }) : null;
  return {
    id: String(source.id || `${workspaceId}:${pluginId}:${topicId}`).trim().slice(0, 260),
    workspaceId,
    pluginId,
    topicId,
    title: String(source.title || source.label || "").trim().slice(0, 180),
    topicKind: normalizeTopicKind(source.topicKind || source.topic_kind || source.kind),
    directoryRoute: normalizedRoute,
    directoryRouteKey: String(source.directoryRouteKey || source.directory_route_key || normalizedRoute?.key || "").trim(),
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
    const topics = {};
    for (const rawTopic of Array.isArray(record.topics) ? record.topics : Object.values(record.topics || {})) {
      const topic = normalizeTopicBinding(rawTopic, { workspaceId });
      if (topic) topics[topic.topicId] = topic;
    }
    out.workspaces[workspaceId] = {
      updatedAt: String(record.updatedAt || record.updated_at || ""),
      topics,
    };
  }
  return out;
}

function defaultPluginTopicBinding(workspaceId = "owner", plugin = {}, nowIso = () => "") {
  const pluginId = cleanPluginId(plugin.id || plugin.pluginId || plugin.plugin_id || "");
  if (!pluginId) return null;
  return normalizeTopicBinding({
    workspaceId,
    pluginId,
    topicId: `plugin:${pluginId}`,
    title: `${plugin.label || plugin.title || pluginId}话题`,
    topicKind: "default_plugin_topic",
  }, { nowIso });
}

function createPluginTopicBindingService(options = {}) {
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

  function listWorkspaceTopicBindings(workspaceId = "owner", options = {}) {
    const id = cleanWorkspaceId(workspaceId);
    const pluginId = cleanPluginId(options.pluginId || "");
    const state = readState();
    const topics = Object.values(state.workspaces[id]?.topics || {})
      .filter((topic) => !pluginId || topic.pluginId === pluginId)
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || a.topicId.localeCompare(b.topicId));
    return {
      ok: true,
      workspaceId: id,
      topics,
    };
  }

  function listTopicProjection(workspaceId = "owner", options = {}) {
    const id = cleanWorkspaceId(workspaceId);
    const defaults = (options.plugins || [])
      .map((plugin) => defaultPluginTopicBinding(id, plugin, nowIso))
      .filter(Boolean);
    const stored = listWorkspaceTopicBindings(id, options).topics;
    const byTopicId = new Map(defaults.map((topic) => [topic.topicId, topic]));
    for (const topic of stored) byTopicId.set(topic.topicId, Object.assign({}, byTopicId.get(topic.topicId) || {}, topic));
    return {
      ok: true,
      workspaceId: id,
      topics: [...byTopicId.values()],
    };
  }

  function upsertTopicBinding(input = {}) {
    const timestamp = nowIso();
    const topic = normalizeTopicBinding(Object.assign({}, input, { updatedAt: timestamp }), {
      nowIso,
      workspaceId: input.workspaceId || input.workspace_id,
    });
    if (!topic) {
      const err = new Error("invalid_plugin_topic_binding");
      err.code = "invalid_plugin_topic_binding";
      throw err;
    }
    const state = readState();
    const record = state.workspaces[topic.workspaceId] || { updatedAt: "", topics: {} };
    const existing = record.topics[topic.topicId] || {};
    record.topics[topic.topicId] = Object.assign({}, topic, {
      createdAt: existing.createdAt || topic.createdAt || timestamp,
      updatedAt: timestamp,
    });
    record.updatedAt = timestamp;
    state.workspaces[topic.workspaceId] = record;
    writeState(state);
    return {
      ok: true,
      workspaceId: topic.workspaceId,
      topic: record.topics[topic.topicId],
    };
  }

  return {
    defaultPluginTopicBinding: (workspaceId, plugin) => defaultPluginTopicBinding(workspaceId, plugin, nowIso),
    listTopicProjection,
    listWorkspaceTopicBindings,
    normalizeTopicBinding: (value) => normalizeTopicBinding(value, { nowIso }),
    storePath,
    upsertTopicBinding,
  };
}

module.exports = {
  STORE_SCHEMA_VERSION,
  TOPIC_KINDS,
  createPluginTopicBindingService,
  defaultPluginTopicBinding,
  normalizeTopicBinding,
};
