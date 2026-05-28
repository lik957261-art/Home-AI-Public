"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_WARDROBE_PLUGIN_MANIFEST_URL = "http://192.168.10.99:8765/api/v1/hermes/plugin/manifest";
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_KEY_SEARCH_DEPTH = 6;

function stringValue(value) {
  return String(value || "").trim();
}

function configuredWardrobeManifestUrl(env = process.env) {
  return stringValue(env.HERMES_MOBILE_WARDROBE_PLUGIN_MANIFEST_URL)
    || stringValue(env.HERMES_MOBILE_PLUGIN_WARDROBE_MANIFEST_URL)
    || DEFAULT_WARDROBE_PLUGIN_MANIFEST_URL;
}

function configuredPlugins(options = {}) {
  const env = options.env || process.env;
  const explicit = Array.isArray(options.plugins) ? options.plugins : [];
  const plugins = explicit.length ? explicit : [{
    id: "wardrobe",
    manifestUrl: configuredWardrobeManifestUrl(env),
  }];
  return plugins
    .map((item) => ({
      id: stringValue(item.id),
      manifestUrl: stringValue(item.manifestUrl || item.url),
    }))
    .filter((item) => item.id && item.manifestUrl);
}

function safeUrl(value, base = "") {
  const text = stringValue(value);
  if (!text) return "";
  try {
    return new URL(text, base || undefined).toString();
  } catch (_) {
    return "";
  }
}

function originOf(value = "") {
  try {
    return new URL(value).origin;
  } catch (_) {
    return "";
  }
}

function pathValue(value = "") {
  return stringValue(value).replace(/\\/g, "/").split("/").filter(Boolean).slice(-2).join("/");
}

function safeJoinUrl(baseUrl = "", relativePath = "") {
  const base = safeUrl(baseUrl);
  const relative = stringValue(relativePath);
  if (!base || !relative) return "";
  return safeUrl(relative, base);
}

function defaultDataDir(env = process.env) {
  return stringValue(env.HERMES_WEB_DATA_DIR)
    || path.join(process.cwd(), "workspace", "hermes-web");
}

function findWardrobeAccessKeyPath(input = {}, options = {}) {
  const explicit = stringValue(input.wardrobeAccessKeyPath || options.wardrobeAccessKeyPath);
  if (explicit && fs.existsSync(explicit)) return explicit;
  const workspaceId = stringValue(input.workspaceId || "owner");
  const dataDir = stringValue(options.dataDir) || defaultDataDir(options.env);
  const workspaceRoot = path.join(dataDir, "drive", "users", workspaceId);
  const targetParts = [".hermes-wardrobe", "access-key.txt"];
  const maxDepth = Number(options.maxKeySearchDepth || DEFAULT_MAX_KEY_SEARCH_DEPTH);

  function walk(dir, depth) {
    if (depth > maxDepth) return "";
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return "";
    }
    const direct = path.join(dir, ...targetParts);
    if (fs.existsSync(direct)) return direct;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === ".hermes-cache" || entry.name === "node_modules" || entry.name === ".git") continue;
      const found = walk(path.join(dir, entry.name), depth + 1);
      if (found) return found;
    }
    return "";
  }

  return walk(workspaceRoot, 0);
}

function frameAncestorsAllows(csp = "", appOrigin = "", entryOrigin = "") {
  const origin = stringValue(appOrigin);
  if (!origin) return true;
  const directive = stringValue(csp)
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith("frame-ancestors "));
  if (!directive) return true;
  const sources = directive.split(/\s+/).slice(1).map((part) => part.trim()).filter(Boolean);
  if (!sources.length) return true;
  if (sources.includes("*")) return true;
  if (sources.includes("'none'")) return false;
  const normalizedEntryOrigin = originOf(entryOrigin);
  return sources.some((source) => {
    if (source === "'self'") return normalizedEntryOrigin && normalizedEntryOrigin === origin;
    if (source.endsWith(":")) return origin.startsWith(source);
    if (source.includes("*")) {
      const escaped = source.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*");
      return new RegExp(`^${escaped}$`).test(origin);
    }
    return source === origin;
  });
}

function normalizeManifest(raw = {}, source = {}) {
  const manifestUrl = stringValue(source.manifestUrl);
  const id = stringValue(raw.id || source.id);
  const entryUrl = safeUrl(raw.entry?.url || raw.entryUrl || raw.url, manifestUrl);
  if (!id) throw new Error("plugin_manifest_id_required");
  if (!entryUrl) throw new Error("plugin_manifest_entry_url_required");
  const programBaseUrl = safeUrl(raw.program_api?.base_url || raw.programApi?.baseUrl || "", manifestUrl);
  return {
    ok: true,
    available: true,
    id,
    title: stringValue(raw.title) || id,
    description: stringValue(raw.description),
    kind: stringValue(raw.kind || raw.type || "embedded_app"),
    version: stringValue(raw.version),
    source: {
      manifestUrl,
      origin: originOf(manifestUrl),
      fetchedAt: stringValue(source.fetchedAt),
    },
    entry: {
      type: stringValue(raw.entry?.type || "web"),
      url: entryUrl,
      origin: originOf(entryUrl),
      framePolicy: stringValue(raw.entry?.frame_policy || raw.entry?.framePolicy),
    },
    embed: {
      mode: "same_window_iframe",
      url: entryUrl,
      requiresSignedToken: true,
      tokenStatus: "pending_plugin_registration",
    },
    mcp: {
      server: stringValue(raw.mcp?.server),
      toolset: stringValue(raw.mcp?.toolset),
      version: stringValue(raw.mcp?.version),
      requiredTools: Array.isArray(raw.mcp?.required_tools) ? raw.mcp.required_tools.map(stringValue).filter(Boolean) : [],
    },
    programApi: {
      baseUrl: programBaseUrl,
      origin: originOf(programBaseUrl),
      pluginManifestPath: stringValue(raw.program_api?.plugin_manifest),
      workspaceRegistrationPath: stringValue(raw.program_api?.workspace_registration),
      pluginLaunchPath: stringValue(raw.program_api?.plugin_launch),
      syncSchemaVersion: raw.program_api?.sync_schema_version || null,
    },
    ownerBinding: {
      strategy: stringValue(raw.owner_binding?.strategy),
      configFile: pathValue(raw.owner_binding?.config_file),
      cacheDir: pathValue(raw.owner_binding?.cache_dir),
      rawKeyReturnedByWardrobe: raw.owner_binding?.raw_key_returned_by_wardrobe === true,
    },
    permissions: {
      registerWorkspaceRequires: Array.isArray(raw.permissions?.register_workspace_requires)
        ? raw.permissions.register_workspace_requires.map(stringValue).filter(Boolean)
        : [],
      ownerTokenScopes: Array.isArray(raw.permissions?.owner_token_scopes)
        ? raw.permissions.owner_token_scopes.map(stringValue).filter(Boolean)
        : [],
    },
  };
}

async function withWardrobeLaunchEntry(manifest, input = {}, fetchImpl, options = {}) {
  if (input.launchPlugin !== true) return manifest;
  if (!manifest?.available || !manifest?.programApi?.pluginLaunchPath || typeof fetchImpl !== "function") return manifest;
  const workspaceId = stringValue(input.workspaceId || "owner");
  const keyPath = findWardrobeAccessKeyPath(input, options);
  if (!keyPath) {
    return Object.assign({}, manifest, {
      available: false,
      code: "plugin_launch_key_missing",
      warning: "Wardrobe workspace access key file was not found for this workspace.",
      embed: Object.assign({}, manifest.embed, {
        tokenStatus: "workspace_key_missing",
      }),
    });
  }
  let accessKey = "";
  try {
    accessKey = fs.readFileSync(keyPath, "utf8").trim();
  } catch (err) {
    return Object.assign({}, manifest, {
      available: false,
      code: "plugin_launch_key_read_failed",
      warning: stringValue(err?.message || err).slice(0, 300),
      embed: Object.assign({}, manifest.embed, {
        tokenStatus: "workspace_key_read_failed",
      }),
    });
  }
  const launchUrl = safeJoinUrl(manifest.programApi.baseUrl || manifest.source?.manifestUrl, manifest.programApi.pluginLaunchPath);
  if (!launchUrl || !accessKey) return manifest;
  try {
    const response = await fetchImpl(launchUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ workspace_id: workspaceId }),
    });
    if (!response?.ok) {
      return Object.assign({}, manifest, {
        available: false,
        code: "plugin_launch_failed",
        status: response?.status || 0,
        warning: "Wardrobe plugin launch token request failed.",
        embed: Object.assign({}, manifest.embed, {
          tokenStatus: "launch_failed",
        }),
      });
    }
    const launch = await response.json();
    const entryUrl = safeJoinUrl(manifest.programApi.baseUrl || manifest.source?.manifestUrl, launch?.entry_path);
    if (!entryUrl) {
      return Object.assign({}, manifest, {
        available: false,
        code: "plugin_launch_entry_missing",
        warning: "Wardrobe plugin launch response did not include a valid entry path.",
        embed: Object.assign({}, manifest.embed, {
          tokenStatus: "launch_entry_missing",
        }),
      });
    }
    return Object.assign({}, manifest, {
      entry: Object.assign({}, manifest.entry, {
        url: entryUrl,
        origin: originOf(entryUrl),
      }),
      embed: Object.assign({}, manifest.embed, {
        url: entryUrl,
        tokenStatus: "launch_token_issued",
        expiresIn: Number(launch?.expires_in || 0) || null,
      }),
    });
  } catch (err) {
    return Object.assign({}, manifest, {
      available: false,
      code: "plugin_launch_error",
      warning: stringValue(err?.message || err).slice(0, 300),
      embed: Object.assign({}, manifest.embed, {
        tokenStatus: "launch_error",
      }),
    });
  }
}

async function validateFrameAncestors(manifest, input = {}, fetchImpl) {
  const appOrigin = originOf(input.appOrigin || "");
  if (!appOrigin || !manifest?.entry?.url || typeof fetchImpl !== "function") return manifest;
  try {
    const response = await fetchImpl(manifest.entry.url, {
      method: "GET",
      headers: { Accept: "text/html,*/*" },
    });
    const csp = response?.headers?.get?.("content-security-policy")
      || response?.headers?.get?.("Content-Security-Policy")
      || "";
    if (frameAncestorsAllows(csp, appOrigin, manifest.entry.origin)) return manifest;
    return Object.assign({}, manifest, {
      available: false,
      code: "plugin_frame_ancestors_blocked",
      warning: "plugin entry frame-ancestors does not allow the current Hermes origin",
      embed: Object.assign({}, manifest.embed, {
        blockedByFrameAncestors: true,
        appOrigin,
      }),
    });
  } catch (err) {
    return Object.assign({}, manifest, {
      available: false,
      code: "plugin_entry_frame_probe_failed",
      warning: stringValue(err?.message || err).slice(0, 300),
      embed: Object.assign({}, manifest.embed, {
        frameProbeFailed: true,
        appOrigin,
      }),
    });
  }
}

function createHermesPluginService(options = {}) {
  const fetchImpl = options.fetch || global.fetch;
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const plugins = configuredPlugins(options);
  const launchOptions = {
    dataDir: options.dataDir,
    env: options.env,
    maxKeySearchDepth: options.maxKeySearchDepth,
    wardrobeAccessKeyPath: options.wardrobeAccessKeyPath,
  };

  function list() {
    return plugins.map((item) => ({ id: item.id, manifestUrl: item.manifestUrl }));
  }

  async function manifest(input = {}) {
    const id = stringValue(input.id || "wardrobe");
    const plugin = plugins.find((item) => item.id === id);
    if (!plugin) {
      return { ok: false, available: false, id, code: "plugin_not_registered" };
    }
    if (typeof fetchImpl !== "function") {
      return { ok: false, available: false, id, code: "fetch_unavailable" };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(plugin.manifestUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response || !response.ok) {
        return {
          ok: false,
          available: false,
          id,
          code: "plugin_manifest_fetch_failed",
          status: response?.status || 0,
        };
      }
      const raw = await response.json();
      const manifest = normalizeManifest(raw, {
        id,
        manifestUrl: plugin.manifestUrl,
        fetchedAt: nowIso(),
      });
      const frameCheckedManifest = await validateFrameAncestors(manifest, input, fetchImpl);
      return withWardrobeLaunchEntry(frameCheckedManifest, input, fetchImpl, launchOptions);
    } catch (err) {
      return {
        ok: false,
        available: false,
        id,
        code: err?.name === "AbortError" ? "plugin_manifest_timeout" : "plugin_manifest_error",
        warning: stringValue(err?.message || err).slice(0, 300),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return { list, manifest };
}

module.exports = {
  DEFAULT_WARDROBE_PLUGIN_MANIFEST_URL,
  createHermesPluginService,
  findWardrobeAccessKeyPath,
  frameAncestorsAllows,
  normalizeManifest,
};
