"use strict";

const path = require("node:path");

function createMobileRuntimeStatePathEnvironment(options = {}) {
  const env = options.env || process.env;
  const repoRoot = options.repoRoot || process.cwd();
  const DATA_DIR = path.resolve(env.HERMES_WEB_DATA_DIR || path.join(repoRoot, "workspace", "hermes-web"));
  const STATE_PATH = path.join(DATA_DIR, "state.json");
  const STATE_BACKUP_DIR = path.join(DATA_DIR, "backups");
  const SHARED_DIRECTORIES_PATH = path.join(DATA_DIR, "shared-directories.json");
  const AUDIT_EVENT_LOG_PATH = path.resolve(env.HERMES_MOBILE_AUDIT_EVENT_LOG_PATH || env.HERMES_WEB_AUDIT_EVENT_LOG_PATH || path.join(DATA_DIR, "audit-events.jsonl"));
  const ACCESS_KEYS_PATH = path.join(DATA_DIR, "access-keys.json");
  const LOCAL_WORKSPACES_PATH = path.join(DATA_DIR, "workspaces.json");
  const RUNTIME_CONFIG_PATH = path.join(DATA_DIR, "runtime-config.json");
  const LEARNING_COIN_STORE_PATH = path.resolve(env.HERMES_MOBILE_LEARNING_COIN_STORE_PATH || env.HERMES_WEB_LEARNING_COIN_STORE_PATH || path.join(DATA_DIR, "learning-coins.json"));
  const WEIXIN_INGRESS_KEY_PATHS = [
    env.HERMES_MOBILE_WEIXIN_INGRESS_KEY_PATH,
    env.HERMES_WEB_WEIXIN_INGRESS_KEY_PATH,
    path.join(DATA_DIR, "weixin-ingress.secret"),
  ].filter(Boolean);
  const WEIXIN_INGRESS_DEFAULT_WORKSPACE = String(
    env.HERMES_MOBILE_WEIXIN_INGRESS_DEFAULT_WORKSPACE
      || env.HERMES_WEB_WEIXIN_INGRESS_DEFAULT_WORKSPACE
      || "",
  ).trim();
  const GROUP_DELIVERIES_DIR = path.join(DATA_DIR, "artifacts", "group-deliveries");
  const OWNER_DEFAULT_WORKSPACE = path.resolve(env.HERMES_WEB_OWNER_DEFAULT_WORKSPACE || path.join(DATA_DIR, "drive"));
  const WORKSPACE_UPLOAD_DIR_NAME = ".hermes-mobile";
  const WORKSPACE_UPLOAD_SUBDIR = "uploads";
  const AUTH_KEY_PATH = path.resolve(env.HERMES_WEB_AUTH_KEY_PATH || path.join(repoRoot, ".hermes_web_secret_key"));
  const WEB_PUSH_VAPID_PATH = path.resolve(
    env.HERMES_WEB_VAPID_PATH || env.WEB_PUSH_VAPID_PATH || path.join(DATA_DIR, "web-push-vapid.json"),
  );
  const LOCAL_TODO_STORE_PATH = path.resolve(env.HERMES_WEB_TODO_STORE_PATH || path.join(DATA_DIR, "todos.json"));
  const LOCAL_AUTOMATION_STORE_PATH = path.resolve(env.HERMES_WEB_AUTOMATION_STORE_PATH || path.join(DATA_DIR, "automations.json"));
  const SERVICE_STORE_BACKEND = String(env.HERMES_WEB_SERVICE_STORE || "").trim().toLowerCase();
  const MOBILE_SQLITE_DB_PATH = path.resolve(env.HERMES_WEB_DB_PATH || path.join(DATA_DIR, "hermes-mobile.sqlite3"));

  return Object.freeze({
    ACCESS_KEYS_PATH,
    AUDIT_EVENT_LOG_PATH,
    AUTH_KEY_PATH,
    DATA_DIR,
    GROUP_DELIVERIES_DIR,
    LEARNING_COIN_STORE_PATH,
    LOCAL_AUTOMATION_STORE_PATH,
    LOCAL_TODO_STORE_PATH,
    LOCAL_WORKSPACES_PATH,
    MOBILE_SQLITE_DB_PATH,
    OWNER_DEFAULT_WORKSPACE,
    RUNTIME_CONFIG_PATH,
    SERVICE_STORE_BACKEND,
    SHARED_DIRECTORIES_PATH,
    STATE_BACKUP_DIR,
    STATE_PATH,
    WEB_PUSH_VAPID_PATH,
    WEIXIN_INGRESS_DEFAULT_WORKSPACE,
    WEIXIN_INGRESS_KEY_PATHS,
    WORKSPACE_UPLOAD_DIR_NAME,
    WORKSPACE_UPLOAD_SUBDIR,
  });
}

module.exports = {
  createMobileRuntimeStatePathEnvironment,
};
