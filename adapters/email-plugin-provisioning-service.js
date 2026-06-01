"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_EMAIL_WORKSPACE_REGISTRATION_PATH = "/api/v1/hermes/plugin/workspaces";

function stringValue(value) {
  return String(value || "").trim();
}

function boundedError(value) {
  return stringValue(value).replace(/\s+/g, " ").slice(0, 160) || "email_plugin_provisioning_failed";
}

function defaultDataDir(env = process.env) {
  return stringValue(env.HERMES_WEB_DATA_DIR)
    || stringValue(env.HERMES_MOBILE_DATA_DIR)
    || path.join(process.cwd(), "workspace", "hermes-web");
}

function emailWorkspaceRoot(input = {}) {
  const dataDir = stringValue(input.dataDir) || defaultDataDir(input.env);
  const workspaceId = stringValue(input.workspaceId);
  if (!workspaceId) return "";
  return path.join(dataDir, "drive", "users", workspaceId);
}

function emailWorkspaceKeyPath(input = {}) {
  const root = emailWorkspaceRoot(input);
  return root ? path.join(root, ".hermes-email", "access-key.txt") : "";
}

function emailWorkspaceConfigPath(input = {}) {
  const root = emailWorkspaceRoot(input);
  return root ? path.join(root, ".hermes-email", "config.json") : "";
}

function emailWorkspaceRegistrationUrl(manifestUrl = "") {
  try {
    return new URL(DEFAULT_EMAIL_WORKSPACE_REGISTRATION_PATH, stringValue(manifestUrl)).toString();
  } catch (_) {
    return "";
  }
}

function findEmailOwnerKeyPath(input = {}, options = {}) {
  const env = input.env || options.env || process.env;
  const explicit = stringValue(input.emailOwnerKeyPath || options.emailOwnerKeyPath)
    || stringValue(env.HERMES_MOBILE_EMAIL_PLUGIN_OWNER_KEY_PATH)
    || stringValue(env.HERMES_MOBILE_PLUGIN_EMAIL_OWNER_KEY_PATH)
    || stringValue(env.EMAIL_HERMES_OWNER_KEY_FILE);
  if (explicit && fs.existsSync(explicit)) return explicit;
  const dataDir = stringValue(input.dataDir || options.dataDir) || defaultDataDir(env);
  const defaultPath = path.join(dataDir, "plugin-secrets", "email-owner-key.txt");
  return fs.existsSync(defaultPath) ? defaultPath : "";
}

function readEmailOwnerKey(input = {}, options = {}) {
  const env = input.env || options.env || process.env;
  const inline = stringValue(input.emailOwnerKey || options.emailOwnerKey)
    || stringValue(env.HERMES_MOBILE_EMAIL_PLUGIN_OWNER_KEY)
    || stringValue(env.HERMES_MOBILE_PLUGIN_EMAIL_OWNER_KEY);
  if (inline) return { ok: true, ownerKey: inline, source: "inline" };
  const keyPath = findEmailOwnerKeyPath(input, options);
  if (!keyPath) return { ok: false, error: "email_owner_key_missing" };
  try {
    const ownerKey = fs.readFileSync(keyPath, "utf8").trim();
    if (!ownerKey) return { ok: false, error: "email_owner_key_empty" };
    return { ok: true, ownerKey, source: "file" };
  } catch (_) {
    return { ok: false, error: "email_owner_key_read_failed" };
  }
}

function createEmailPluginProvisioningService(options = {}) {
  const fetchImpl = options.fetch || global.fetch;
  const dataDir = options.dataDir;
  const env = options.env || process.env;

  async function registerWorkspace(input = {}) {
    if (typeof fetchImpl !== "function") return { ok: false, error: "fetch_unavailable" };
    const workspaceId = stringValue(input.workspaceId);
    if (!workspaceId) return { ok: false, error: "workspace_id_required" };
    const registrationUrl = emailWorkspaceRegistrationUrl(input.emailManifestUrl);
    if (!registrationUrl) return { ok: false, error: "email_workspace_registration_url_invalid" };
    const ownerKey = readEmailOwnerKey({ dataDir, env }, options);
    if (!ownerKey.ok) return { ok: false, error: ownerKey.error };

    const workspaceRoot = emailWorkspaceRoot({ dataDir, env, workspaceId });
    const body = {
      workspace_id: workspaceId,
      workspace_name: stringValue(input.workspaceName || input.workspace_name) || workspaceId,
      display_name: stringValue(input.displayName || input.display_name) || workspaceId,
      workspace_root: workspaceRoot,
    };
    let response;
    try {
      response = await fetchImpl(registrationUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${ownerKey.ownerKey}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      return { ok: false, error: boundedError(err?.message || err) };
    }
    if (!response || !response.ok) {
      return { ok: false, status: response?.status || 0, error: `email_workspace_registration_failed_${response?.status || 0}` };
    }
    let payload = {};
    try {
      payload = await response.json();
    } catch (_) {
      payload = {};
    }
    const keyPath = emailWorkspaceKeyPath({ dataDir, env, workspaceId });
    const configPath = emailWorkspaceConfigPath({ dataDir, env, workspaceId });
    return {
      ok: Boolean(payload.ok !== false),
      status: response.status || 200,
      keyCreated: fs.existsSync(keyPath),
      configCreated: fs.existsSync(configPath),
      created: Boolean(payload.created),
      workspaceId: stringValue(payload.workspace_id || workspaceId),
    };
  }

  async function provisionWorkspace(input = {}) {
    const registered = await registerWorkspace(input);
    if (!registered.ok) {
      return {
        ok: false,
        error: registered.error || "email_workspace_registration_failed",
        status: registered.status || 0,
        keyCreated: Boolean(registered.keyCreated),
        configCreated: Boolean(registered.configCreated),
      };
    }
    if (!registered.keyCreated || !registered.configCreated) {
      return {
        ok: false,
        error: !registered.keyCreated ? "email_workspace_key_missing_after_registration" : "email_workspace_config_missing_after_registration",
        keyCreated: Boolean(registered.keyCreated),
        configCreated: Boolean(registered.configCreated),
      };
    }
    return registered;
  }

  return {
    provisionWorkspace,
    registerWorkspace,
  };
}

module.exports = {
  DEFAULT_EMAIL_WORKSPACE_REGISTRATION_PATH,
  createEmailPluginProvisioningService,
  emailWorkspaceConfigPath,
  emailWorkspaceKeyPath,
  emailWorkspaceRegistrationUrl,
  findEmailOwnerKeyPath,
  readEmailOwnerKey,
};
