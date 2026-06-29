"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { discoverPluginWorkspaceIdsFromAccessKeys } = require("./hermes-plugin-service");

const DEFAULT_GATEWAY_PLUGIN_TOOLSETS = Object.freeze({
  wardrobe: "wardrobe",
  finance: "finance",
  note: "note",
  health: "health",
  email: "email",
  growth: "growth",
  moira: "moira",
  music: "music",
  movie: "movie",
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

function moiraBindingCompleteAt(workspaceRoot) {
  const configDir = path.join(workspaceRoot, ".hermes-moira");
  const configPath = path.join(configDir, "config.json");
  try {
    if (!fs.statSync(configPath).isFile()) return false;
  } catch (_) {
    return false;
  }
  let keyFile = "access-key.txt";
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    keyFile = stringValue(parsed.access_key_file || parsed.accessKeyFile) || keyFile;
  } catch (_) {
    keyFile = "access-key.txt";
  }
  if (!keyFile || path.basename(keyFile) !== keyFile) return false;
  const explicitKey = path.join(configDir, keyFile);
  const fallbackKeys = [explicitKey, path.join(configDir, "access-key.txt"), path.join(configDir, "workspace-key.txt")];
  return fallbackKeys.some((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch (_) {
      return false;
    }
  });
}

function moiraWorkspaceRoot(dataDir, workspaceId, maxDepth = 4) {
  const userRoot = path.join(dataDir, "drive", "users", normalizeWorkspaceId(workspaceId));
  function walk(dir, depth) {
    if (depth > maxDepth) return "";
    if (moiraBindingCompleteAt(dir)) return dir;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return "";
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === ".hermes-cache" || entry.name === "node_modules" || entry.name === ".git") continue;
      const found = walk(path.join(dir, entry.name), depth + 1);
      if (found) return found;
    }
    return "";
  }
  return walk(userRoot, 0);
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

  function moiraToolsetAuthorizedForWorkspace(workspaceId) {
    const dataDir = resolveDataDir();
    const targetWorkspaceId = normalizeWorkspaceId(workspaceId);
    return Boolean(moiraWorkspaceRoot(dataDir, targetWorkspaceId, options.maxKeySearchDepth));
  }

  function computeToolsetsForWorkspace(workspaceId) {
    const targetWorkspaceId = normalizeWorkspaceId(workspaceId);
    const out = [];
    for (const [pluginId, toolset] of Object.entries(pluginToolsets)) {
      if (pluginId === "moira") {
        if (moiraToolsetAuthorizedForWorkspace(targetWorkspaceId)) out.push(toolset);
      } else if (pluginId === "music" || pluginId === "movie") {
        if (targetWorkspaceId === "owner") out.push(toolset);
      } else if (discoveredWorkspaceIds(pluginId).includes(targetWorkspaceId)) {
        out.push(toolset);
      }
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
