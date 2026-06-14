"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function stringValue(value) {
  return String(value || "").trim();
}

function defaultDataDir(env = process.env) {
  return stringValue(env.HERMES_WEB_DATA_DIR)
    || stringValue(env.HERMES_MOBILE_DATA_DIR)
    || path.join(process.cwd(), "workspace", "hermes-web");
}

function moiraWorkspaceRoot(input = {}) {
  const dataDir = stringValue(input.dataDir) || defaultDataDir(input.env);
  const workspaceId = stringValue(input.workspaceId);
  if (!workspaceId) return "";
  return path.join(dataDir, "drive", "users", workspaceId);
}

function moiraWorkspaceKeyPath(input = {}) {
  const root = moiraWorkspaceRoot(input);
  return root ? path.join(root, ".hermes-moira", "access-key.txt") : "";
}

function moiraWorkspaceConfigPath(input = {}) {
  const root = moiraWorkspaceRoot(input);
  return root ? path.join(root, ".hermes-moira", "config.json") : "";
}

function moiraApiBaseUrl(manifestUrl = "") {
  try {
    return new URL(stringValue(manifestUrl)).origin;
  } catch (_) {
    return "http://127.0.0.1:4174";
  }
}

function generateMoiraWorkspaceKey() {
  return `hmoi_${crypto.randomBytes(32).toString("base64url")}`;
}

function ensureMoiraWorkspaceKey(input = {}) {
  const keyPath = moiraWorkspaceKeyPath(input);
  if (!keyPath) return { ok: false, error: "workspace_id_required" };
  let existing = "";
  try {
    existing = fs.existsSync(keyPath) ? fs.readFileSync(keyPath, "utf8").trim() : "";
  } catch (_) {
    return { ok: false, error: "moira_plugin_key_read_failed" };
  }
  if (existing) return { ok: true, keyPath, key: existing, created: false };
  try {
    const key = generateMoiraWorkspaceKey();
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    fs.writeFileSync(keyPath, `${key}\n`, { encoding: "utf8", mode: 0o600 });
    return { ok: true, keyPath, key, created: true };
  } catch (_) {
    return { ok: false, error: "moira_plugin_key_write_failed" };
  }
}

function writeMoiraWorkspaceConfig(input = {}) {
  const configPath = moiraWorkspaceConfigPath(input);
  if (!configPath) return { ok: false, error: "workspace_id_required" };
  const workspaceId = stringValue(input.workspaceId);
  const config = {
    schema_version: 1,
    api_base_url: stringValue(input.apiBaseUrl) || moiraApiBaseUrl(input.moiraManifestUrl),
    workspace_id: workspaceId,
    display_name: stringValue(input.displayName) || workspaceId,
    access_key_file: "access-key.txt",
    provisioned_by: "hermes-mobile",
    updated_at: new Date().toISOString(),
  };
  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    return { ok: true, configPath };
  } catch (_) {
    return { ok: false, error: "moira_plugin_config_write_failed" };
  }
}

function createMoiraPluginProvisioningService(options = {}) {
  const dataDir = options.dataDir;
  const env = options.env || process.env;

  async function provisionWorkspace(input = {}) {
    const workspaceId = stringValue(input.workspaceId);
    if (!workspaceId) return { ok: false, error: "workspace_id_required" };
    const key = ensureMoiraWorkspaceKey({ dataDir, env, workspaceId });
    if (!key.ok) {
      return {
        ok: false,
        error: key.error || "moira_plugin_key_failed",
        keyCreated: Boolean(key.created),
      };
    }
    const config = writeMoiraWorkspaceConfig(Object.assign({}, input, {
      dataDir,
      env,
      workspaceId,
      moiraManifestUrl: input.moiraManifestUrl,
    }));
    if (!config.ok) {
      return {
        ok: false,
        error: config.error || "moira_plugin_config_failed",
        keyCreated: Boolean(key.created),
      };
    }
    return {
      ok: true,
      workspaceId,
      keyCreated: Boolean(key.created),
      configCreated: true,
      configPath: config.configPath,
    };
  }

  return { provisionWorkspace };
}

module.exports = {
  createMoiraPluginProvisioningService,
  ensureMoiraWorkspaceKey,
  generateMoiraWorkspaceKey,
  moiraApiBaseUrl,
  moiraWorkspaceConfigPath,
  moiraWorkspaceKeyPath,
  moiraWorkspaceRoot,
  writeMoiraWorkspaceConfig,
};
