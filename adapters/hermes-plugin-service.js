"use strict";

const DEFAULT_WARDROBE_PLUGIN_MANIFEST_URL = "http://192.168.10.99:8765/api/v1/hermes/plugin/manifest";
const DEFAULT_TIMEOUT_MS = 8000;

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

function createHermesPluginService(options = {}) {
  const fetchImpl = options.fetch || global.fetch;
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const plugins = configuredPlugins(options);

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
      return normalizeManifest(raw, {
        id,
        manifestUrl: plugin.manifestUrl,
        fetchedAt: nowIso(),
      });
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
  normalizeManifest,
};
