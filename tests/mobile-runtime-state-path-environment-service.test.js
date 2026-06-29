"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const {
  createMobileRuntimeStatePathEnvironment,
} = require("../adapters/mobile-runtime-state-path-environment-service");

function testDefaultDataDerivedPaths() {
  const repoRoot = path.resolve("C:\\repo\\home-ai");
  const runtime = createMobileRuntimeStatePathEnvironment({
    env: {},
    repoRoot,
  });
  const dataDir = path.join(repoRoot, "workspace", "hermes-web");
  assert.equal(runtime.DATA_DIR, dataDir);
  assert.equal(runtime.STATE_PATH, path.join(dataDir, "state.json"));
  assert.equal(runtime.STATE_BACKUP_DIR, path.join(dataDir, "backups"));
  assert.equal(runtime.SHARED_DIRECTORIES_PATH, path.join(dataDir, "shared-directories.json"));
  assert.equal(runtime.ACCESS_KEYS_PATH, path.join(dataDir, "access-keys.json"));
  assert.equal(runtime.AUDIT_OWNER_READONLY_KEY_PATH, path.join(dataDir, "secrets", "audit-owner-readonly-web-key.secret"));
  assert.equal(runtime.LOCAL_WORKSPACES_PATH, path.join(dataDir, "workspaces.json"));
  assert.equal(runtime.RUNTIME_CONFIG_PATH, path.join(dataDir, "runtime-config.json"));
  assert.equal(runtime.GROUP_DELIVERIES_DIR, path.join(dataDir, "artifacts", "group-deliveries"));
  assert.equal(runtime.OWNER_DEFAULT_WORKSPACE, path.join(dataDir, "drive"));
  assert.equal(runtime.AUTH_KEY_PATH, path.join(repoRoot, ".hermes_web_secret_key"));
  assert.equal(runtime.WEB_PUSH_VAPID_PATH, path.join(dataDir, "web-push-vapid.json"));
  assert.equal(runtime.LOCAL_TODO_STORE_PATH, path.join(dataDir, "todos.json"));
  assert.equal(runtime.LOCAL_AUTOMATION_STORE_PATH, path.join(dataDir, "automations.json"));
  assert.equal(runtime.MOBILE_SQLITE_DB_PATH, path.join(dataDir, "hermes-mobile.sqlite3"));
  assert.equal(runtime.WORKSPACE_UPLOAD_DIR_NAME, ".hermes-mobile");
  assert.equal(runtime.WORKSPACE_UPLOAD_SUBDIR, "uploads");
}

function testPathOverridesAndNormalization() {
  const runtime = createMobileRuntimeStatePathEnvironment({
    env: {
      HERMES_WEB_DATA_DIR: "C:\\prod\\data",
      HERMES_MOBILE_AUDIT_EVENT_LOG_PATH: "C:\\logs\\audit.jsonl",
      HERMES_MOBILE_AUDIT_OWNER_READONLY_KEY_PATH: "C:\\keys\\audit-owner-readonly.secret",
      HERMES_MOBILE_LEARNING_COIN_STORE_PATH: "C:\\coins\\coins.json",
      HERMES_WEB_OWNER_DEFAULT_WORKSPACE: "C:\\owner\\drive",
      HERMES_WEB_AUTH_KEY_PATH: "C:\\keys\\auth.secret",
      HERMES_WEB_VAPID_PATH: "C:\\keys\\vapid.json",
      HERMES_WEB_TODO_STORE_PATH: "C:\\stores\\todos.json",
      HERMES_WEB_AUTOMATION_STORE_PATH: "C:\\stores\\automations.json",
      HERMES_WEB_SERVICE_STORE: " SQLite ",
      HERMES_WEB_DB_PATH: "C:\\db\\home.sqlite3",
    },
    repoRoot: "C:\\repo\\home-ai",
  });
  assert.equal(runtime.DATA_DIR, path.resolve("C:\\prod\\data"));
  assert.equal(runtime.AUDIT_EVENT_LOG_PATH, path.resolve("C:\\logs\\audit.jsonl"));
  assert.equal(runtime.AUDIT_OWNER_READONLY_KEY_PATH, path.resolve("C:\\keys\\audit-owner-readonly.secret"));
  assert.equal(runtime.LEARNING_COIN_STORE_PATH, path.resolve("C:\\coins\\coins.json"));
  assert.equal(runtime.OWNER_DEFAULT_WORKSPACE, path.resolve("C:\\owner\\drive"));
  assert.equal(runtime.AUTH_KEY_PATH, path.resolve("C:\\keys\\auth.secret"));
  assert.equal(runtime.WEB_PUSH_VAPID_PATH, path.resolve("C:\\keys\\vapid.json"));
  assert.equal(runtime.LOCAL_TODO_STORE_PATH, path.resolve("C:\\stores\\todos.json"));
  assert.equal(runtime.LOCAL_AUTOMATION_STORE_PATH, path.resolve("C:\\stores\\automations.json"));
  assert.equal(runtime.SERVICE_STORE_BACKEND, "sqlite");
  assert.equal(runtime.MOBILE_SQLITE_DB_PATH, path.resolve("C:\\db\\home.sqlite3"));
}

testDefaultDataDerivedPaths();
testPathOverridesAndNormalization();

console.log("mobile runtime state path environment service tests passed");
