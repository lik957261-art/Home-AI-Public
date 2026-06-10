"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_GROWTH_WORKSPACE_REGISTRATION_PATH = "/api/v1/hermes/plugin/workspaces";
const DEFAULT_GROWTH_SCOPES = Object.freeze(["growth:read", "growth:write"]);

function stringValue(value) {
  return String(value || "").trim();
}

function boundedError(value) {
  return stringValue(value).replace(/\s+/g, " ").slice(0, 160) || "growth_plugin_provisioning_failed";
}

function defaultDataDir(env = process.env) {
  return stringValue(env.HERMES_WEB_DATA_DIR)
    || stringValue(env.HERMES_MOBILE_DATA_DIR)
    || path.join(process.cwd(), "workspace", "hermes-web");
}

function growthWorkspaceRoot(input = {}) {
  const dataDir = stringValue(input.dataDir) || defaultDataDir(input.env);
  const workspaceId = stringValue(input.workspaceId);
  if (!workspaceId) return "";
  return path.join(dataDir, "drive", "users", workspaceId);
}

function growthWorkspaceKeyPath(input = {}) {
  const root = growthWorkspaceRoot(input);
  return root ? path.join(root, ".hermes-growth", "access-key.txt") : "";
}

function growthWorkspaceConfigPath(input = {}) {
  const root = growthWorkspaceRoot(input);
  return root ? path.join(root, ".hermes-growth", "config.json") : "";
}

function generateGrowthWorkspaceKey() {
  return `hgr_${crypto.randomBytes(32).toString("base64url")}`;
}

function sha256(value = "") {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function canonicalGrowthWorkspaceId(workspaceId = "") {
  const clean = stringValue(workspaceId);
  if (!clean) return "";
  return clean.startsWith("growth:") ? clean : `growth:${clean}`;
}

function ensureGrowthWorkspaceKey(input = {}) {
  const keyPath = growthWorkspaceKeyPath(input);
  if (!keyPath) return { ok: false, error: "workspace_id_required" };
  let existing = "";
  try {
    existing = fs.existsSync(keyPath) ? fs.readFileSync(keyPath, "utf8").trim() : "";
  } catch (_) {
    return { ok: false, error: "growth_plugin_key_read_failed" };
  }
  if (existing) return { ok: true, keyPath, key: existing, created: false };
  try {
    const key = generateGrowthWorkspaceKey();
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    fs.writeFileSync(keyPath, `${key}\n`, { encoding: "utf8", mode: 0o600 });
    return { ok: true, keyPath, key, created: true };
  } catch (_) {
    return { ok: false, error: "growth_plugin_key_write_failed" };
  }
}

function growthWorkspaceRegistrationUrl(manifestUrl = "") {
  try {
    return new URL(DEFAULT_GROWTH_WORKSPACE_REGISTRATION_PATH, stringValue(manifestUrl)).toString();
  } catch (_) {
    return "";
  }
}

function growthApiBaseUrl(manifestUrl = "") {
  try {
    return new URL(stringValue(manifestUrl)).origin;
  } catch (_) {
    return "http://127.0.0.1:4881";
  }
}

function findGrowthOwnerKeyPath(input = {}, options = {}) {
  const env = input.env || options.env || process.env;
  const explicit = stringValue(input.growthOwnerKeyPath || options.growthOwnerKeyPath)
    || stringValue(env.HERMES_MOBILE_GROWTH_PLUGIN_OWNER_KEY_PATH)
    || stringValue(env.HERMES_MOBILE_PLUGIN_GROWTH_OWNER_KEY_PATH)
    || stringValue(env.GROWTH_REGISTRATION_KEY_PATH)
    || stringValue(env.GROWTH_HERMES_OWNER_KEY_FILE);
  if (explicit && fs.existsSync(explicit)) return explicit;
  const dataDir = stringValue(input.dataDir || options.dataDir) || defaultDataDir(env);
  const defaultPath = path.join(dataDir, "plugin-secrets", "growth-owner-key.txt");
  return fs.existsSync(defaultPath) ? defaultPath : "";
}

function readGrowthOwnerKey(input = {}, options = {}) {
  const env = input.env || options.env || process.env;
  const inline = stringValue(input.growthOwnerKey || options.growthOwnerKey)
    || stringValue(env.HERMES_MOBILE_GROWTH_PLUGIN_OWNER_KEY)
    || stringValue(env.HERMES_MOBILE_PLUGIN_GROWTH_OWNER_KEY)
    || stringValue(env.GROWTH_REGISTRATION_KEY);
  if (inline) return { ok: true, ownerKey: inline, source: "inline" };
  const keyPath = findGrowthOwnerKeyPath(input, options);
  if (!keyPath) return { ok: false, error: "growth_owner_key_missing" };
  try {
    const ownerKey = fs.readFileSync(keyPath, "utf8").trim();
    if (!ownerKey) return { ok: false, error: "growth_owner_key_empty" };
    return { ok: true, ownerKey, source: "file" };
  } catch (_) {
    return { ok: false, error: "growth_owner_key_read_failed" };
  }
}

function writeGrowthWorkspaceConfig(input = {}) {
  const configPath = growthWorkspaceConfigPath(input);
  if (!configPath) return { ok: false, error: "workspace_id_required" };
  const workspaceId = stringValue(input.workspaceId);
  const scopes = Array.isArray(input.scopes) && input.scopes.length ? input.scopes : [...DEFAULT_GROWTH_SCOPES];
  const config = {
    schema_version: 1,
    api_base_url: stringValue(input.apiBaseUrl) || growthApiBaseUrl(input.growthManifestUrl),
    workspace_id: canonicalGrowthWorkspaceId(input.growthWorkspaceId || input.growth_workspace_id || workspaceId),
    hermes_workspace_id: workspaceId,
    display_name: stringValue(input.displayName) || workspaceId,
    access_key_file: "access-key.txt",
    scopes,
    provisioned_by: "hermes-mobile",
    updated_at: new Date().toISOString(),
  };
  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    return { ok: true, configPath };
  } catch (_) {
    return { ok: false, error: "growth_plugin_config_write_failed" };
  }
}

function createGrowthPluginProvisioningService(options = {}) {
  const fetchImpl = options.fetch || global.fetch;
  const dataDir = options.dataDir;
  const env = options.env || process.env;

  async function registerWorkspace(input = {}) {
    if (typeof fetchImpl !== "function") return { ok: false, error: "fetch_unavailable" };
    const workspaceId = stringValue(input.workspaceId);
    if (!workspaceId) return { ok: false, error: "workspace_id_required" };
    const registrationUrl = growthWorkspaceRegistrationUrl(input.growthManifestUrl);
    if (!registrationUrl) return { ok: false, error: "growth_workspace_registration_url_invalid" };
    const ownerKey = readGrowthOwnerKey({ dataDir, env }, options);
    if (!ownerKey.ok) return { ok: false, error: ownerKey.error };
    const key = ensureGrowthWorkspaceKey({ dataDir, env, workspaceId });
    if (!key.ok) return { ok: false, error: key.error || "growth_plugin_key_failed" };
    const scopes = Array.isArray(input.scopes) && input.scopes.length ? input.scopes : [...DEFAULT_GROWTH_SCOPES];
    let response;
    try {
      response = await fetchImpl(registrationUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${ownerKey.ownerKey}`,
        },
        body: JSON.stringify({
          owner: "hermes",
          workspace_id: canonicalGrowthWorkspaceId(workspaceId),
          target_workspace_id: workspaceId,
          hermes_workspace_id: workspaceId,
          display_name: stringValue(input.displayName || input.display_name) || workspaceId,
          access_key_hash: sha256(key.key),
          scopes,
        }),
      });
    } catch (err) {
      return { ok: false, error: boundedError(err?.message || err), keyCreated: key.created };
    }
    if (!response || !response.ok) {
      return { ok: false, status: response?.status || 0, error: `growth_workspace_registration_failed_${response?.status || 0}`, keyCreated: key.created };
    }
    let payload = {};
    try {
      payload = await response.json();
    } catch (_) {
      payload = {};
    }
    return {
      ok: payload.ok !== false,
      status: response.status || 200,
      keyCreated: key.created,
      workspaceId: stringValue(payload.hermes_workspace_id || workspaceId),
      growthWorkspaceId: canonicalGrowthWorkspaceId(payload.workspace_id || workspaceId),
      scopes,
    };
  }

  async function provisionWorkspace(input = {}) {
    const registered = await registerWorkspace(input);
    if (!registered.ok) {
      return {
        ok: false,
        error: registered.error || "growth_workspace_registration_failed",
        status: registered.status || 0,
        keyCreated: Boolean(registered.keyCreated),
      };
    }
    const config = writeGrowthWorkspaceConfig(Object.assign({}, input, {
      dataDir,
      env,
      growthWorkspaceId: registered.growthWorkspaceId,
      scopes: registered.scopes,
    }));
    if (!config.ok) {
      return {
        ok: false,
        error: config.error || "growth_plugin_config_failed",
        keyCreated: Boolean(registered.keyCreated),
      };
    }
    return Object.assign({}, registered, {
      ok: true,
      configPath: config.configPath,
      configCreated: true,
    });
  }

  return {
    provisionWorkspace,
    registerWorkspace,
  };
}

module.exports = {
  DEFAULT_GROWTH_SCOPES,
  DEFAULT_GROWTH_WORKSPACE_REGISTRATION_PATH,
  canonicalGrowthWorkspaceId,
  createGrowthPluginProvisioningService,
  ensureGrowthWorkspaceKey,
  findGrowthOwnerKeyPath,
  generateGrowthWorkspaceKey,
  growthApiBaseUrl,
  growthWorkspaceConfigPath,
  growthWorkspaceKeyPath,
  growthWorkspaceRegistrationUrl,
  readGrowthOwnerKey,
  sha256,
  writeGrowthWorkspaceConfig,
};
