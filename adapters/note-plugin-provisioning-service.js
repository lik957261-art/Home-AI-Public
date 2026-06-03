"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_NOTE_WORKSPACE_REGISTRATION_PATH = "/api/v1/hermes/plugin/workspaces";
const DEFAULT_NOTE_SCOPES = Object.freeze(["notes:read", "notes:write", "notes:search"]);

function stringValue(value) {
  return String(value || "").trim();
}

function boundedError(value) {
  return stringValue(value).replace(/\s+/g, " ").slice(0, 160) || "note_plugin_provisioning_failed";
}

function defaultDataDir(env = process.env) {
  return stringValue(env.HERMES_WEB_DATA_DIR)
    || stringValue(env.HERMES_MOBILE_DATA_DIR)
    || path.join(process.cwd(), "workspace", "hermes-web");
}

function noteWorkspaceRoot(input = {}) {
  const dataDir = stringValue(input.dataDir) || defaultDataDir(input.env);
  const workspaceId = stringValue(input.workspaceId);
  if (!workspaceId) return "";
  return path.join(dataDir, "drive", "users", workspaceId);
}

function noteWorkspaceKeyPath(input = {}) {
  const root = noteWorkspaceRoot(input);
  return root ? path.join(root, ".hermes-note", "access-key.txt") : "";
}

function noteWorkspaceConfigPath(input = {}) {
  const root = noteWorkspaceRoot(input);
  return root ? path.join(root, ".hermes-note", "config.json") : "";
}

function generateNoteWorkspaceKey() {
  return `hnt_${crypto.randomBytes(32).toString("base64url")}`;
}

function sha256(value = "") {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function ensureNoteWorkspaceKey(input = {}) {
  const keyPath = noteWorkspaceKeyPath(input);
  if (!keyPath) return { ok: false, error: "workspace_id_required" };
  let existing = "";
  try {
    existing = fs.existsSync(keyPath) ? fs.readFileSync(keyPath, "utf8").trim() : "";
  } catch (_) {
    return { ok: false, error: "note_plugin_key_read_failed" };
  }
  if (existing) return { ok: true, keyPath, key: existing, created: false };
  try {
    const key = generateNoteWorkspaceKey();
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    fs.writeFileSync(keyPath, `${key}\n`, { encoding: "utf8", mode: 0o600 });
    return { ok: true, keyPath, key, created: true };
  } catch (_) {
    return { ok: false, error: "note_plugin_key_write_failed" };
  }
}

function noteWorkspaceRegistrationUrl(manifestUrl = "") {
  try {
    return new URL(DEFAULT_NOTE_WORKSPACE_REGISTRATION_PATH, stringValue(manifestUrl)).toString();
  } catch (_) {
    return "";
  }
}

function noteApiBaseUrl(manifestUrl = "") {
  try {
    return new URL(stringValue(manifestUrl)).origin;
  } catch (_) {
    return "http://127.0.0.1:4181";
  }
}

function canonicalNoteWorkspaceId(workspaceId = "") {
  const clean = stringValue(workspaceId);
  if (!clean) return "";
  return clean.startsWith("note:") ? clean : `note:${clean}`;
}

function findNoteOwnerKeyPath(input = {}, options = {}) {
  const env = input.env || options.env || process.env;
  const explicit = stringValue(input.noteOwnerKeyPath || options.noteOwnerKeyPath)
    || stringValue(env.HERMES_MOBILE_NOTE_PLUGIN_OWNER_KEY_PATH)
    || stringValue(env.HERMES_MOBILE_PLUGIN_NOTE_OWNER_KEY_PATH)
    || stringValue(env.NOTE_REGISTRATION_KEY_PATH)
    || stringValue(env.NOTE_HERMES_OWNER_KEY_FILE);
  if (explicit && fs.existsSync(explicit)) return explicit;
  const dataDir = stringValue(input.dataDir || options.dataDir) || defaultDataDir(env);
  const defaultPath = path.join(dataDir, "plugin-secrets", "note-owner-key.txt");
  return fs.existsSync(defaultPath) ? defaultPath : "";
}

function readNoteOwnerKey(input = {}, options = {}) {
  const env = input.env || options.env || process.env;
  const inline = stringValue(input.noteOwnerKey || options.noteOwnerKey)
    || stringValue(env.HERMES_MOBILE_NOTE_PLUGIN_OWNER_KEY)
    || stringValue(env.HERMES_MOBILE_PLUGIN_NOTE_OWNER_KEY)
    || stringValue(env.NOTE_REGISTRATION_KEY);
  if (inline) return { ok: true, ownerKey: inline, source: "inline" };
  const keyPath = findNoteOwnerKeyPath(input, options);
  if (!keyPath) return { ok: false, error: "note_owner_key_missing" };
  try {
    const ownerKey = fs.readFileSync(keyPath, "utf8").trim();
    if (!ownerKey) return { ok: false, error: "note_owner_key_empty" };
    return { ok: true, ownerKey, source: "file" };
  } catch (_) {
    return { ok: false, error: "note_owner_key_read_failed" };
  }
}

function writeNoteWorkspaceConfig(input = {}) {
  const configPath = noteWorkspaceConfigPath(input);
  if (!configPath) return { ok: false, error: "workspace_id_required" };
  const workspaceId = stringValue(input.workspaceId);
  const noteWorkspaceId = canonicalNoteWorkspaceId(input.noteWorkspaceId || input.note_workspace_id || workspaceId);
  const scopes = Array.isArray(input.scopes) && input.scopes.length ? input.scopes : [...DEFAULT_NOTE_SCOPES];
  const apiBaseUrl = stringValue(input.apiBaseUrl) || noteApiBaseUrl(input.noteManifestUrl);
  const config = {
    schema_version: 1,
    api_base_url: apiBaseUrl,
    workspace_id: noteWorkspaceId,
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
    return { ok: false, error: "note_plugin_config_write_failed" };
  }
}

function createNotePluginProvisioningService(options = {}) {
  const fetchImpl = options.fetch || global.fetch;
  const dataDir = options.dataDir;
  const env = options.env || process.env;

  async function registerWorkspace(input = {}) {
    if (typeof fetchImpl !== "function") return { ok: false, error: "fetch_unavailable" };
    const workspaceId = stringValue(input.workspaceId);
    if (!workspaceId) return { ok: false, error: "workspace_id_required" };
    const registrationUrl = noteWorkspaceRegistrationUrl(input.noteManifestUrl);
    if (!registrationUrl) return { ok: false, error: "note_workspace_registration_url_invalid" };
    const ownerKey = readNoteOwnerKey({ dataDir, env }, options);
    if (!ownerKey.ok) return { ok: false, error: ownerKey.error };
    const key = ensureNoteWorkspaceKey({ dataDir, env, workspaceId });
    if (!key.ok) return { ok: false, error: key.error || "note_plugin_key_failed" };
    const scopes = Array.isArray(input.scopes) && input.scopes.length ? input.scopes : [...DEFAULT_NOTE_SCOPES];
    const body = {
      owner: "hermes",
      workspace_id: canonicalNoteWorkspaceId(workspaceId),
      target_workspace_id: workspaceId,
      hermes_workspace_id: workspaceId,
      display_name: stringValue(input.displayName || input.display_name) || workspaceId,
      access_key_hash: sha256(key.key),
      scopes,
    };
    let response;
    try {
      response = await fetchImpl(registrationUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${ownerKey.ownerKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      return { ok: false, error: boundedError(err?.message || err), keyCreated: key.created };
    }
    if (!response || !response.ok) {
      return { ok: false, status: response?.status || 0, error: `note_workspace_registration_failed_${response?.status || 0}`, keyCreated: key.created };
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
      noteWorkspaceId: canonicalNoteWorkspaceId(payload.workspace_id || workspaceId),
      scopes,
    };
  }

  async function provisionWorkspace(input = {}) {
    const registered = await registerWorkspace(input);
    if (!registered.ok) {
      return {
        ok: false,
        error: registered.error || "note_workspace_registration_failed",
        status: registered.status || 0,
        keyCreated: Boolean(registered.keyCreated),
      };
    }
    const config = writeNoteWorkspaceConfig(Object.assign({}, input, {
      dataDir,
      env,
      noteWorkspaceId: registered.noteWorkspaceId,
      scopes: registered.scopes,
    }));
    if (!config.ok) {
      return {
        ok: false,
        error: config.error || "note_plugin_config_failed",
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
  DEFAULT_NOTE_SCOPES,
  DEFAULT_NOTE_WORKSPACE_REGISTRATION_PATH,
  createNotePluginProvisioningService,
  canonicalNoteWorkspaceId,
  ensureNoteWorkspaceKey,
  findNoteOwnerKeyPath,
  generateNoteWorkspaceKey,
  noteApiBaseUrl,
  noteWorkspaceConfigPath,
  noteWorkspaceKeyPath,
  noteWorkspaceRegistrationUrl,
  readNoteOwnerKey,
  sha256,
  writeNoteWorkspaceConfig,
};
