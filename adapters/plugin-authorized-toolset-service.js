"use strict";

const { discoverPluginWorkspaceIdsFromAccessKeys } = require("./hermes-plugin-service");

const DEFAULT_GATEWAY_PLUGIN_TOOLSETS = Object.freeze({
  wardrobe: "wardrobe",
  finance: "finance",
  note: "note",
  health: "health",
});
const DEFAULT_CACHE_TTL_MS = 30 * 1000;

function stringValue(value) {
  return String(value || "").trim();
}

function defaultDataDir(env = process.env) {
  return stringValue(env.HERMES_WEB_DATA_DIR)
    || stringValue(env.HERMES_MOBILE_DATA_DIR)
    || "";
}

function dedupe(values = []) {
  const out = [];
  for (const item of Array.isArray(values) ? values : []) {
    const text = stringValue(item);
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

function normalizeWorkspaceId(value) {
  return stringValue(value).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 120) || "owner";
}

function normalizePluginToolsetMap(input = {}) {
  return Object.fromEntries(Object.entries(Object.assign({}, DEFAULT_GATEWAY_PLUGIN_TOOLSETS, input))
    .map(([pluginId, toolset]) => [stringValue(pluginId).toLowerCase(), stringValue(toolset)])
    .filter(([pluginId, toolset]) => pluginId && toolset));
}

function createPluginAuthorizedToolsetService(options = {}) {
  const env = options.env || process.env;
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : () => Date.now();
  const cacheTtlMs = Math.max(0, Number(options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS) || 0);
  const pluginToolsets = normalizePluginToolsetMap(options.pluginToolsets || options.pluginToolsetMap);
  const cache = new Map();

  function resolveDataDir() {
    return stringValue(typeof options.dataDir === "function" ? options.dataDir() : options.dataDir) || defaultDataDir(env);
  }

  function discoveredWorkspaceIds(pluginId) {
    try {
      return discoverPluginWorkspaceIdsFromAccessKeys(pluginId, {
        dataDir: resolveDataDir(),
        env,
        maxKeySearchDepth: options.maxKeySearchDepth,
      }).map(normalizeWorkspaceId);
    } catch (_) {
      return [];
    }
  }

  function computeToolsetsForWorkspace(workspaceId) {
    const targetWorkspaceId = normalizeWorkspaceId(workspaceId);
    const out = [];
    for (const [pluginId, toolset] of Object.entries(pluginToolsets)) {
      if (discoveredWorkspaceIds(pluginId).includes(targetWorkspaceId)) out.push(toolset);
    }
    return dedupe(out);
  }

  function toolsetsForWorkspace(workspaceId = "owner") {
    const targetWorkspaceId = normalizeWorkspaceId(workspaceId);
    const key = `${resolveDataDir()}|${targetWorkspaceId}`;
    const cached = cache.get(key);
    const now = nowMs();
    if (cached && cacheTtlMs > 0 && now - cached.at < cacheTtlMs) {
      return cached.toolsets.slice();
    }
    const toolsets = computeToolsetsForWorkspace(targetWorkspaceId);
    cache.set(key, { at: now, toolsets });
    return toolsets.slice();
  }

  function clearCache() {
    cache.clear();
  }

  return {
    clearCache,
    toolsetsForWorkspace,
  };
}

module.exports = {
  DEFAULT_GATEWAY_PLUGIN_TOOLSETS,
  createPluginAuthorizedToolsetService,
};
