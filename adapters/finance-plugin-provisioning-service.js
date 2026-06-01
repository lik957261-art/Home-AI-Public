"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_FINANCE_BIND_PATH = "/api/v1/hermes/plugin/users/bind";

function stringValue(value) {
  return String(value || "").trim();
}

function boundedError(value) {
  return stringValue(value).replace(/\s+/g, " ").slice(0, 160) || "finance_plugin_provisioning_failed";
}

function defaultDataDir(env = process.env) {
  return stringValue(env.HERMES_WEB_DATA_DIR)
    || stringValue(env.HERMES_MOBILE_DATA_DIR)
    || path.join(process.cwd(), "workspace", "hermes-web");
}

function financeWorkspaceKeyPath(input = {}) {
  const dataDir = stringValue(input.dataDir) || defaultDataDir(input.env);
  const workspaceId = stringValue(input.workspaceId);
  if (!workspaceId) return "";
  return path.join(dataDir, "drive", "users", workspaceId, ".hermes-finance", "access-key.txt");
}

function financeWorkspaceConfigPath(input = {}) {
  const keyPath = financeWorkspaceKeyPath(input);
  return keyPath ? path.join(path.dirname(keyPath), "config.json") : "";
}

function generateFinanceWorkspaceKey() {
  return `hfin_${crypto.randomBytes(32).toString("base64url")}`;
}

function ensureFinanceWorkspaceKey(input = {}) {
  const keyPath = financeWorkspaceKeyPath(input);
  if (!keyPath) return { ok: false, error: "workspace_id_required" };
  let existing = "";
  try {
    existing = fs.existsSync(keyPath) ? fs.readFileSync(keyPath, "utf8").trim() : "";
  } catch (_) {
    return { ok: false, error: "finance_plugin_key_read_failed" };
  }
  if (existing) {
    return { ok: true, keyPath, created: false };
  }
  try {
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    fs.writeFileSync(keyPath, `${generateFinanceWorkspaceKey()}\n`, { encoding: "utf8", mode: 0o600 });
    return { ok: true, keyPath, created: true };
  } catch (_) {
    return { ok: false, error: "finance_plugin_key_write_failed" };
  }
}

function financeBindUrl(manifestUrl = "") {
  try {
    return new URL(DEFAULT_FINANCE_BIND_PATH, stringValue(manifestUrl)).toString();
  } catch (_) {
    return "";
  }
}

function financeApiBaseUrl(manifestUrl = "") {
  try {
    return new URL(stringValue(manifestUrl)).origin;
  } catch (_) {
    return "http://127.0.0.1:8791";
  }
}

function safeJsonId(value) {
  return stringValue(value).slice(0, 120);
}

function writeFinanceWorkspaceConfig(input = {}) {
  const configPath = financeWorkspaceConfigPath(input);
  if (!configPath) return { ok: false, error: "workspace_id_required" };
  const workspaceId = stringValue(input.workspaceId);
  const config = {
    schema_version: 1,
    api_base_url: stringValue(input.apiBaseUrl) || financeApiBaseUrl(input.financeManifestUrl),
    workspace_id: workspaceId,
    hermes_workspace_id: workspaceId,
    access_key_file: "access-key.txt",
    display_name: stringValue(input.displayName) || workspaceId,
    role: stringValue(input.role) || "owner",
    provisioned_by: "hermes-mobile",
    updated_at: new Date().toISOString(),
  };
  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    return { ok: true, configPath };
  } catch (_) {
    return { ok: false, error: "finance_plugin_config_write_failed" };
  }
}

function createFinancePluginProvisioningService(options = {}) {
  const fetchImpl = options.fetch || global.fetch;
  const dataDir = options.dataDir;
  const env = options.env || process.env;

  async function bindWorkspaceUser(input = {}) {
    if (typeof fetchImpl !== "function") return { ok: false, error: "fetch_unavailable" };
    const workspaceId = stringValue(input.workspaceId);
    if (!workspaceId) return { ok: false, error: "workspace_id_required" };
    const url = financeBindUrl(input.financeManifestUrl);
    if (!url) return { ok: false, error: "finance_bind_url_invalid" };
    const body = {
      target_workspace_id: workspaceId,
      display_name: stringValue(input.displayName) || workspaceId,
      role: stringValue(input.role) || "owner",
      admin_workspace_id: stringValue(input.adminWorkspaceId) || "owner",
    };
    let response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      return { ok: false, error: boundedError(err?.message || err) };
    }
    if (!response || !response.ok) {
      return { ok: false, status: response?.status || 0, error: `finance_bind_failed_${response?.status || 0}` };
    }
    let payload = {};
    try {
      payload = await response.json();
    } catch (_) {
      payload = {};
    }
    const result = payload.result || payload;
    return {
      ok: true,
      status: response.status || 200,
      financeUserId: safeJsonId(result.user?.id || result.user_id || result.userId),
      ledgerId: safeJsonId(result.ledger?.id || result.ledger_id || result.ledgerId),
      created: Boolean(result.created || payload.created),
    };
  }

  async function provisionWorkspace(input = {}) {
    const workspaceId = stringValue(input.workspaceId);
    const key = ensureFinanceWorkspaceKey({ dataDir, env, workspaceId });
    if (!key.ok) return { ok: false, error: key.error || "finance_plugin_key_failed" };
    const bind = await bindWorkspaceUser(input);
    if (!bind.ok) {
      return {
        ok: false,
        error: bind.error || "finance_bind_failed",
        status: bind.status || 0,
        keyCreated: key.created,
      };
    }
    const config = writeFinanceWorkspaceConfig(Object.assign({}, input, { dataDir, env }));
    if (!config.ok) {
      return {
        ok: false,
        error: config.error || "finance_plugin_config_failed",
        keyCreated: key.created,
      };
    }
    return {
      ok: true,
      keyCreated: key.created,
      configPath: config.configPath,
      financeUserId: bind.financeUserId,
      ledgerId: bind.ledgerId,
      created: bind.created,
    };
  }

  return {
    bindWorkspaceUser,
    ensureWorkspaceKey: (input = {}) => ensureFinanceWorkspaceKey(Object.assign({ dataDir, env }, input)),
    provisionWorkspace,
  };
}

module.exports = {
  DEFAULT_FINANCE_BIND_PATH,
  createFinancePluginProvisioningService,
  financeApiBaseUrl,
  ensureFinanceWorkspaceKey,
  financeBindUrl,
  financeWorkspaceConfigPath,
  financeWorkspaceKeyPath,
  generateFinanceWorkspaceKey,
  writeFinanceWorkspaceConfig,
};
