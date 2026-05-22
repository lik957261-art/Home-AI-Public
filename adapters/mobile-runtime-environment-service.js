"use strict";

const path = require("node:path");
const os = require("node:os");
const { normalizeStringList } = require("./runtime-state-normalization-service");

function normalizeOwnerElevationDurations(value) {
  const parsed = normalizeStringList(value)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0 && item <= 240)
    .map((item) => Math.round(item));
  const unique = [...new Set(parsed)].sort((a, b) => a - b);
  return unique.length ? unique : [5, 15, 30, 60];
}

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function createMobileRuntimeEnvironment(options = {}) {
  const env = options.env || process.env;
  function normalizeAutoMode(value) {
    const text = String(value || "").trim();
    if (!text) return "auto";
    if (/^(1|true|yes|on)$/i.test(text)) return "on";
    if (/^(0|false|no|off)$/i.test(text)) return "off";
    if (/^auto$/i.test(text)) return "auto";
    return "auto";
  }
  
  function nonNegativeMilliseconds(value, fallback) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    return fallback;
  }
  
  const TOOL_ROOT = options.toolRoot || path.resolve(__dirname, "..");
  const REPO_ROOT = path.resolve(env.HERMES_WEB_REPO_ROOT || env.HERMES_MOBILE_ROOT || TOOL_ROOT);
  const PUBLIC_ROOT = path.join(TOOL_ROOT, "public");
  const INDEX_HTML_PATH = path.join(PUBLIC_ROOT, "index.html");
  const UPDATE_REMOTE_NAME = env.HERMES_MOBILE_UPDATE_REMOTE || env.HERMES_WEB_UPDATE_REMOTE || "origin";
  const UPDATE_BRANCH = env.HERMES_MOBILE_UPDATE_BRANCH || env.HERMES_WEB_UPDATE_BRANCH || "main";
  const UPDATE_VERSION_URL = env.HERMES_MOBILE_UPDATE_VERSION_URL || env.HERMES_WEB_UPDATE_VERSION_URL || "";
  const UPDATE_CHECK_TIMEOUT_MS = Number(env.HERMES_MOBILE_UPDATE_CHECK_TIMEOUT_MS || env.HERMES_WEB_UPDATE_CHECK_TIMEOUT_MS || "6000");
  const DEFAULT_TODO_BRIDGE_SCRIPT = path.join(TOOL_ROOT, "todo_bridge.py");
  const DEFAULT_CRON_BRIDGE_SCRIPT = path.join(TOOL_ROOT, "cron_bridge.py");
  const DEFAULT_DIRECTORY_BRIDGE_SCRIPT = path.join(TOOL_ROOT, "directory_bridge.py");
  const DEFAULT_SKILL_BRIDGE_SCRIPT = path.join(TOOL_ROOT, "skill_bridge.py");
  const LOCAL_CONFIG_ROOT = path.resolve(env.HERMES_WEB_CONFIG_DIR || path.join(REPO_ROOT, "config"));
  const PERMISSION_APPROVAL_MARKER = "HERMES_PERMISSION_APPROVAL_REQUIRED";
  
  const HOST = env.HERMES_WEB_HOST || "0.0.0.0";
  const PORT = Number(env.HERMES_WEB_PORT || "8797");
  const HERMES_API_BASE = stripTrailingSlash(
    env.HERMES_WEB_HERMES_API_BASE || env.HERMES_API_BASE || "http://127.0.0.1:8642",
  );
  const HERMES_API_TIMEOUT_MS = Number(env.HERMES_WEB_HERMES_API_TIMEOUT_MS || "8000");
  const GATEWAY_POOL_ENABLED = env.HERMES_WEB_GATEWAY_POOL_ENABLED || "auto";
  const GATEWAY_SKILL_PROFILE_ROUTING = normalizeAutoMode(
    env.HERMES_MOBILE_GATEWAY_SKILL_PROFILE_ROUTING
    || env.HERMES_WEB_GATEWAY_SKILL_PROFILE_ROUTING
    || "auto",
  );
  const GATEWAY_USAGE_TELEMETRY_ENABLED = (
    env.HERMES_MOBILE_GATEWAY_USAGE_TELEMETRY_ENABLED
    || env.HERMES_WEB_GATEWAY_USAGE_TELEMETRY_ENABLED
    || "auto"
  );
  const GATEWAY_USAGE_TELEMETRY_PROFILE_ROOTS = normalizeStringList(
    env.HERMES_MOBILE_GATEWAY_TELEMETRY_PROFILES_ROOTS
    || env.HERMES_WEB_GATEWAY_TELEMETRY_PROFILES_ROOTS
    || "",
  );
  const GATEWAY_POOL_HEALTH_TIMEOUT_MS = Number(env.HERMES_WEB_GATEWAY_POOL_HEALTH_TIMEOUT_MS || "5000");
  const RUN_START_TIMEOUT_MS = Number(env.HERMES_WEB_RUN_START_TIMEOUT_MS || "90000");
  const RUN_STREAMING_SAVE_THROTTLE_MS = nonNegativeMilliseconds(env.HERMES_MOBILE_RUN_STREAMING_SAVE_THROTTLE_MS || env.HERMES_WEB_RUN_STREAMING_SAVE_THROTTLE_MS, 1200);
  const RUN_LIVENESS_CHECK_AFTER_MS = Number(env.HERMES_WEB_RUN_LIVENESS_CHECK_AFTER_MS || "120000");
  const RUN_LIVENESS_CHECK_INTERVAL_MS = Number(env.HERMES_WEB_RUN_LIVENESS_CHECK_INTERVAL_MS || "45000");
  const RUN_LIVENESS_STALE_AFTER_MS = Number(env.HERMES_WEB_RUN_LIVENESS_STALE_AFTER_MS || "0");
  const RUN_CONCURRENCY_MAX_GLOBAL = Number(env.HERMES_WEB_MAX_ACTIVE_RUNS || "0");
  const RUN_CONCURRENCY_MAX_PER_WORKSPACE = Number(env.HERMES_WEB_MAX_ACTIVE_RUNS_PER_WORKSPACE || "0");
  const DISABLE_AUTH = /^(1|true|yes|on)$/i.test(env.HERMES_WEB_DISABLE_AUTH || "");
  const DATA_DIR = path.resolve(env.HERMES_WEB_DATA_DIR || path.join(REPO_ROOT, "workspace", "hermes-web"));
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
  const AUTH_KEY_PATH = path.resolve(env.HERMES_WEB_AUTH_KEY_PATH || path.join(REPO_ROOT, ".hermes_web_secret_key"));
  const WEB_PUSH_VAPID_PATH = path.resolve(
    env.HERMES_WEB_VAPID_PATH || env.WEB_PUSH_VAPID_PATH || path.join(DATA_DIR, "web-push-vapid.json"),
  );
  const WSL_DISTRO = env.HERMES_WEB_WSL_DISTRO || "Ubuntu-24.04";
  const WINDOWS_HOME = env.USERPROFILE || os.homedir() || "";
  const WSL_USER = env.HERMES_WEB_WSL_USER || env.WSL_USER || env.USER || "hermes";
  const WSL_HOME = stripTrailingSlash(env.HERMES_WEB_WSL_HOME || `/home/${WSL_USER}`);
  const WSL_HERMES_HOME = stripTrailingSlash(env.HERMES_WEB_WSL_HERMES_HOME || `${WSL_HOME}/.hermes`);
  function wslUncPathCandidates(root, ...parts) {
    const allowWslUnc = /^(1|true|yes|on)$/i.test(
      env.HERMES_MOBILE_ALLOW_WSL_UNC_PROBES
      || env.HERMES_WEB_ALLOW_WSL_UNC_PROBES
      || "",
    );
    if (!allowWslUnc) return [];
    const normalizedRoot = String(root || "").replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "");
    if (!normalizedRoot) return [];
    const suffix = parts
      .map((part) => String(part || "").replaceAll("\\", "/").replace(/^\/+|\/+$/g, ""))
      .filter(Boolean)
      .join("/");
    const full = [normalizedRoot, suffix].filter(Boolean).join("/").replaceAll("/", "\\");
    return [
      `\\\\wsl.localhost\\${WSL_DISTRO}\\${full}`,
      `\\\\wsl$\\${WSL_DISTRO}\\${full}`,
    ];
  }
  const ENABLE_LEGACY_WEIXIN_COMPAT = /^(1|true|yes|on)$/i.test(
    env.HERMES_WEB_ENABLE_LEGACY_WEIXIN_COMPAT || env.HERMES_WEB_LEGACY_WEIXIN_COMPAT || "",
  );
  const HERMES_ENV_PATHS = [
    env.HERMES_WEB_HERMES_ENV_PATH,
    ...wslUncPathCandidates(WSL_HERMES_HOME, ".env"),
  ].filter(Boolean);
  const HERMES_API_KEY_PATHS = [
    env.HERMES_WEB_HERMES_API_KEY_PATH,
    path.join(WINDOWS_HOME, ".hermes-windows", "hermes-api-server-key.secret"),
  ].filter(Boolean);
  const WORKSPACE_USERS_PATHS = [
    env.HERMES_WEB_WORKSPACE_USERS_PATH,
    ...wslUncPathCandidates(WSL_HERMES_HOME, "access-control", "workspace-users.json"),
    path.join(LOCAL_CONFIG_ROOT, "access-control", "workspace-users.json"),
    env.HERMES_WEB_WEIXIN_USERS_PATH,
    ...(ENABLE_LEGACY_WEIXIN_COMPAT ? wslUncPathCandidates(WSL_HERMES_HOME, "access-control", "weixin-users.json") : []),
    ...(ENABLE_LEGACY_WEIXIN_COMPAT ? [path.join(LOCAL_CONFIG_ROOT, "access-control", "weixin-users.json")] : []),
  ].filter(Boolean);
  const WORKSPACE_ROUTE_MAP_PATHS = [
    env.HERMES_WEB_WORKSPACE_ROUTE_MAP_PATH,
    ...wslUncPathCandidates(WSL_HERMES_HOME, "access-control", "workspace-routing-map.json"),
    path.join(LOCAL_CONFIG_ROOT, "access-control", "workspace-routing-map.json"),
    env.HERMES_WEB_WEIXIN_ROUTE_MAP_PATH,
    ...(ENABLE_LEGACY_WEIXIN_COMPAT ? wslUncPathCandidates(WSL_HERMES_HOME, "access-control", "weixin-routing-map.json") : []),
    ...(ENABLE_LEGACY_WEIXIN_COMPAT ? [path.join(LOCAL_CONFIG_ROOT, "access-control", "weixin-routing-map.json")] : []),
  ].filter(Boolean);
  const HERMES_CONFIG_PATHS = [
    env.HERMES_WEB_HERMES_CONFIG_PATH,
    env.HERMES_CONFIG_PATH,
    ...wslUncPathCandidates(WSL_HERMES_HOME, "config.yaml"),
    path.join(LOCAL_CONFIG_ROOT, "hermes-config.yaml"),
    path.join(LOCAL_CONFIG_ROOT, "config.yaml"),
  ].filter(Boolean);
  const EXPLICIT_HERMES_CONFIG_PATHS = new Set([
    env.HERMES_WEB_HERMES_CONFIG_PATH,
    env.HERMES_CONFIG_PATH,
  ].map((item) => String(item || "").trim()).filter(Boolean));
  const ALLOW_WSL_REASONING_CONFIG_LOOKUP = /^(1|true|yes|on)$/i.test(
    env.HERMES_MOBILE_ALLOW_WSL_REASONING_CONFIG_LOOKUP
    || env.HERMES_WEB_ALLOW_WSL_REASONING_CONFIG_LOOKUP
    || "",
  );
  const STATUS_INCLUDE_CATALOG = /^(1|true|yes|on)$/i.test(
    env.HERMES_MOBILE_STATUS_INCLUDE_CATALOG
    || env.HERMES_WEB_STATUS_INCLUDE_CATALOG
    || "",
  );
  const GATEWAY_POOL_MANIFEST_PATHS = [
    env.HERMES_WEB_GATEWAY_POOL_MANIFEST,
    ...wslUncPathCandidates(WSL_HERMES_HOME, "worker-pool.json"),
  ].filter(Boolean);
  const GOOGLE_TOKEN_PATHS = [
    env.HERMES_WEB_GOOGLE_TOKEN_PATH,
    ...wslUncPathCandidates(WSL_HERMES_HOME, "google_token.json"),
  ].filter(Boolean);
  const GOOGLE_CLIENT_SECRET_PATHS = [
    env.HERMES_WEB_GOOGLE_CLIENT_SECRET_PATH,
    ...wslUncPathCandidates(WSL_HERMES_HOME, "google_client_secret.json"),
  ].filter(Boolean);
  const OUTLOOK_GRAPH_TOKEN_PATHS = [
    env.HERMES_WEB_OUTLOOK_GRAPH_TOKEN_PATH,
    ...wslUncPathCandidates(WSL_HERMES_HOME, "microsoft-graph-outlook-mail", "token.json"),
  ].filter(Boolean);
  const GITHUB_CLI_HOSTS_PATHS = [
    env.HERMES_WEB_GITHUB_CLI_HOSTS_PATH,
    path.join(WINDOWS_HOME, "AppData", "Roaming", "GitHub CLI", "hosts.yml"),
    ...wslUncPathCandidates(WSL_HOME, ".config", "gh", "hosts.yml"),
  ].filter(Boolean);
  const PROJECT_MAP_PATHS = [
    env.HERMES_WEB_PROJECT_MAP_PATH,
    path.join(LOCAL_CONFIG_ROOT, "project-directory-map.json"),
  ].filter(Boolean);
  
  const MAX_BODY_BYTES = 2_000_000;
  const MAX_HISTORY_MESSAGES = 30;
  const CHAT_CONTEXT_MAX_MESSAGES = Math.max(0, Number(env.HERMES_WEB_CHAT_CONTEXT_MAX_MESSAGES || "16") || 16);
  const CHAT_CONTEXT_MAX_CHARS = Math.max(1000, Number(env.HERMES_WEB_CHAT_CONTEXT_MAX_CHARS || "20000") || 20000);
  const CONTEXT_ASSEMBLY_MODE = String(env.HERMES_MOBILE_CONTEXT_ASSEMBLY_MODE || env.HERMES_WEB_CONTEXT_ASSEMBLY_MODE || "layered").trim().toLowerCase() || "layered";
  const CONTEXT_COMPACTION_ENABLED = !/^(0|false|no|off)$/i.test(env.HERMES_MOBILE_CONTEXT_COMPACTION_ENABLED || env.HERMES_WEB_CONTEXT_COMPACTION_ENABLED || "1");
  const MAX_MESSAGE_CHARS = 240_000;
  const MAX_API_TEXT_CHARS = 80_000;
  const THREAD_MESSAGE_INITIAL_LIMIT = Math.max(10, Number(env.HERMES_MOBILE_THREAD_MESSAGE_INITIAL_LIMIT || env.HERMES_WEB_THREAD_MESSAGE_INITIAL_LIMIT || "60") || 60);
  const THREAD_MESSAGE_PAGE_LIMIT = Math.max(10, Number(env.HERMES_MOBILE_THREAD_MESSAGE_PAGE_LIMIT || env.HERMES_WEB_THREAD_MESSAGE_PAGE_LIMIT || "40") || 40);
  const THREAD_MESSAGE_SEARCH_LIMIT = Math.max(10, Number(env.HERMES_MOBILE_THREAD_MESSAGE_SEARCH_LIMIT || env.HERMES_WEB_THREAD_MESSAGE_SEARCH_LIMIT || "120") || 120);
  const MAX_EVENT_PREVIEW_CHARS = 1600;
  const MAX_STORED_EVENTS_PER_THREAD = 80;
  const MAX_UPLOAD_BYTES = Number(env.HERMES_WEB_MAX_UPLOAD_BYTES || "104857600");
  const MAX_FILE_PREVIEW_CHARS = Number(env.HERMES_WEB_MAX_FILE_PREVIEW_CHARS || "180000");
  const SOURCE_MARKDOWN_SEARCH_LIMIT = Number(
    env.HERMES_MOBILE_SOURCE_MARKDOWN_SEARCH_LIMIT
    || env.HERMES_WEB_SOURCE_MARKDOWN_SEARCH_LIMIT
    || "2000",
  );
  const WEIXIN_FORWARD_MARKDOWN_MAX_BYTES = Number(
    env.HERMES_MOBILE_WEIXIN_MARKDOWN_FORWARD_MAX_BYTES
    || env.HERMES_WEB_WEIXIN_MARKDOWN_FORWARD_MAX_BYTES
    || String(2 * 1024 * 1024),
  );
  const TODO_BRIDGE_TIMEOUT_MS = Number(env.HERMES_WEB_TODO_BRIDGE_TIMEOUT_MS || "15000");
  const KANBAN_BRIDGE_TIMEOUT_MS = Number(env.HERMES_MOBILE_KANBAN_BRIDGE_TIMEOUT_MS || env.HERMES_WEB_KANBAN_BRIDGE_TIMEOUT_MS || "20000");
  const CRON_BRIDGE_TIMEOUT_MS = Number(env.HERMES_WEB_CRON_BRIDGE_TIMEOUT_MS || "15000");
  const CRON_BRIDGE_STDOUT_LIMIT_BYTES = Number(env.HERMES_MOBILE_CRON_BRIDGE_STDOUT_LIMIT_BYTES || env.HERMES_WEB_CRON_BRIDGE_STDOUT_LIMIT_BYTES || "50000000");
  const CRON_LIST_CACHE_TTL_MS = Number(env.HERMES_WEB_CRON_LIST_CACHE_TTL_MS || "12000");
  const AUTOMATION_CREATE_TIMEOUT_MS = Number(env.HERMES_WEB_AUTOMATION_CREATE_TIMEOUT_MS || "60000");
  const AUTOMATION_CREATE_MODEL = env.HERMES_WEB_AUTOMATION_CREATE_MODEL || "gpt-5.4-mini";
  const LEARNING_GROWTH_JIT_MODEL = env.HERMES_MOBILE_LEARNING_GROWTH_JIT_MODEL || env.HERMES_WEB_LEARNING_GROWTH_JIT_MODEL || "gpt-5.5";
  const LEARNING_GROWTH_JIT_REASONING_EFFORT = env.HERMES_MOBILE_LEARNING_GROWTH_JIT_REASONING_EFFORT || env.HERMES_WEB_LEARNING_GROWTH_JIT_REASONING_EFFORT || "xhigh";
  const DIRECTORY_BRIDGE_TIMEOUT_MS = Number(env.HERMES_WEB_DIRECTORY_BRIDGE_TIMEOUT_MS || "15000");
  const SKILL_BRIDGE_TIMEOUT_MS = Number(env.HERMES_WEB_SKILL_BRIDGE_TIMEOUT_MS || "12000");
  const CRON_OUTPUT_ROOT = stripTrailingSlash(env.HERMES_WEB_CRON_OUTPUT_ROOT || `${WSL_HERMES_HOME}/cron/output`);
  const CRON_RUN_LOG_ROOT = stripTrailingSlash(env.HERMES_WEB_RUN_LOG_ROOT || `${WSL_HERMES_HOME}/run-logs`);
  const TODO_BACKEND = String(env.HERMES_WEB_TODO_BACKEND || "local").trim().toLowerCase();
  const KANBAN_COMMAND = String(env.HERMES_MOBILE_KANBAN_COMMAND || env.HERMES_WEB_KANBAN_COMMAND || "hermes").trim() || "hermes";
  const KANBAN_COMMAND_ARGS = String(env.HERMES_MOBILE_KANBAN_COMMAND_ARGS || env.HERMES_WEB_KANBAN_COMMAND_ARGS || "").trim();
  const KANBAN_TODO_META_PATH = path.resolve(env.HERMES_MOBILE_KANBAN_TODO_META_PATH || env.HERMES_WEB_KANBAN_TODO_META_PATH || path.join(DATA_DIR, "kanban-todo-meta.json"));
  const KANBAN_CARD_LIST_CACHE_PATH = path.resolve(env.HERMES_MOBILE_KANBAN_CARD_LIST_CACHE_PATH || env.HERMES_WEB_KANBAN_CARD_LIST_CACHE_PATH || path.join(DATA_DIR, "kanban-card-list-cache.json"));
  const KANBAN_CASE_SHARE_PATH = path.resolve(env.HERMES_MOBILE_KANBAN_CASE_SHARE_PATH || env.HERMES_WEB_KANBAN_CASE_SHARE_PATH || path.join(DATA_DIR, "kanban-case-shares.json"));
  const KANBAN_WORKSPACE_PATH_STYLE = String(env.HERMES_MOBILE_KANBAN_WORKSPACE_PATH_STYLE || env.HERMES_WEB_KANBAN_WORKSPACE_PATH_STYLE || "").trim().toLowerCase();
  const KANBAN_DEPENDENCY_RECONCILE_INTERVAL_MS = Math.max(5000, Number(env.HERMES_MOBILE_KANBAN_DEPENDENCY_RECONCILE_INTERVAL_MS || env.HERMES_WEB_KANBAN_DEPENDENCY_RECONCILE_INTERVAL_MS || "30000") || 30000);
  const KANBAN_CARD_LIST_CACHE_TTL_MS = Math.max(0, Number(env.HERMES_MOBILE_KANBAN_CARD_LIST_CACHE_TTL_MS || env.HERMES_WEB_KANBAN_CARD_LIST_CACHE_TTL_MS || String(30 * 60 * 1000)) || 0);
  const KANBAN_BLOCKED_PUSH_DELAY_MINUTES = Math.max(0, Number(env.HERMES_MOBILE_KANBAN_BLOCKED_PUSH_DELAY_MINUTES || env.HERMES_WEB_KANBAN_BLOCKED_PUSH_DELAY_MINUTES || "10") || 0);
  const KANBAN_MULTI_AGENT_DEFAULT_PARALLEL = 3;
  const KANBAN_MULTI_AGENT_MAX_PARALLEL = Math.max(KANBAN_MULTI_AGENT_DEFAULT_PARALLEL, Math.min(12, Number(env.HERMES_MOBILE_KANBAN_MULTI_AGENT_MAX_PARALLEL || env.HERMES_WEB_KANBAN_MULTI_AGENT_MAX_PARALLEL || "8") || 8));
  const KANBAN_MULTI_AGENT_MAX_CARDS = 8;
  const KANBAN_MULTI_AGENT_PLAN_TIMEOUT_MS = Number(env.HERMES_MOBILE_KANBAN_PLAN_TIMEOUT_MS || env.HERMES_WEB_KANBAN_PLAN_TIMEOUT_MS || "90000");
  const KANBAN_READING_PLAN_MAX_SESSIONS = Math.max(1, Math.min(60, Number(env.HERMES_MOBILE_READING_PLAN_MAX_SESSIONS || env.HERMES_WEB_READING_PLAN_MAX_SESSIONS || "31") || 31));
  const KANBAN_READING_ANALYSIS_TIMEOUT_MS = Number(env.HERMES_MOBILE_READING_ANALYSIS_TIMEOUT_MS || env.HERMES_WEB_READING_ANALYSIS_TIMEOUT_MS || "120000");
  const KANBAN_READING_TRANSCRIBE_TIMEOUT_MS = Number(env.HERMES_MOBILE_READING_TRANSCRIBE_TIMEOUT_MS || env.HERMES_WEB_READING_TRANSCRIBE_TIMEOUT_MS || "240000");
  const KANBAN_READING_TRANSCRIBE_SCRIPT = path.resolve(env.HERMES_MOBILE_READING_TRANSCRIBE_SCRIPT || env.HERMES_WEB_READING_TRANSCRIBE_SCRIPT || path.join(TOOL_ROOT, "scripts", "transcribe-reading-audio.ps1"));
  const KANBAN_READING_ARTIFACT_ROOT = path.resolve(env.HERMES_MOBILE_READING_ARTIFACT_ROOT || env.HERMES_WEB_READING_ARTIFACT_ROOT || path.join(DATA_DIR, "artifacts", "kanban-reading"));
  const KANBAN_READING_COVER_MAX_BYTES = Math.max(1, Math.min(MAX_UPLOAD_BYTES, Number(env.HERMES_MOBILE_READING_COVER_MAX_BYTES || env.HERMES_WEB_READING_COVER_MAX_BYTES || String(20 * 1024 * 1024)) || (20 * 1024 * 1024)));
  const KANBAN_SOURCE_DOCUMENT_MAX_BYTES = Math.max(1, Math.min(MAX_UPLOAD_BYTES, Number(env.HERMES_MOBILE_KANBAN_SOURCE_DOCUMENT_MAX_BYTES || env.HERMES_WEB_KANBAN_SOURCE_DOCUMENT_MAX_BYTES || String(20 * 1024 * 1024)) || (20 * 1024 * 1024)));
  const KANBAN_READING_QUIZ_TARGETING_VERSION = "20260513-score-weakness-v1";
  const KANBAN_STUDY_CASE_MODES = new Set(["study-plan"]);
  const KANBAN_ASSESSMENT_CASE_MODES = new Set(["assessment-plan"]);
  const KANBAN_STUDY_SHARED_FOLDER_NAME = "\u5b66\u4e60\u8ba1\u5212";
  const KANBAN_CASE_TOPIC_KIND = "case-topic";
  const KANBAN_ASSESSMENT_PLAN_MAX_EXAMS = Math.max(1, Math.min(30, Number(env.HERMES_MOBILE_ASSESSMENT_PLAN_MAX_EXAMS || "30") || 30));
  const KANBAN_ASSESSMENT_MAX_QUESTIONS = Math.max(5, Math.min(40, Number(env.HERMES_MOBILE_ASSESSMENT_MAX_QUESTIONS || "40") || 40));
  const KANBAN_ASSESSMENT_MODEL_TIMEOUT_MS = Number(env.HERMES_MOBILE_ASSESSMENT_MODEL_TIMEOUT_MS || "180000");
  const AUTOMATION_BACKEND = String(env.HERMES_WEB_AUTOMATION_BACKEND || "local").trim().toLowerCase();
  const LOCAL_TODO_STORE_PATH = path.resolve(env.HERMES_WEB_TODO_STORE_PATH || path.join(DATA_DIR, "todos.json"));
  const LOCAL_AUTOMATION_STORE_PATH = path.resolve(env.HERMES_WEB_AUTOMATION_STORE_PATH || path.join(DATA_DIR, "automations.json"));
  const SERVICE_STORE_BACKEND = String(env.HERMES_WEB_SERVICE_STORE || "").trim().toLowerCase();
  const MOBILE_SQLITE_DB_PATH = path.resolve(env.HERMES_WEB_DB_PATH || path.join(DATA_DIR, "hermes-mobile.sqlite3"));
  const BRIDGE_HOST_URL = stripTrailingSlash(env.HERMES_MOBILE_BRIDGE_HOST_URL || env.HERMES_WEB_BRIDGE_HOST_URL || "");
  const BRIDGE_HOST_KEY_PATH = env.HERMES_MOBILE_BRIDGE_HOST_KEY_PATH || env.HERMES_WEB_BRIDGE_HOST_KEY_PATH || "";
  const OWNER_MAINTENANCE_RUNS_ENABLED = /^(1|true|yes|on)$/i.test(env.HERMES_MOBILE_ALLOW_OWNER_MAINTENANCE_RUNS || env.HERMES_WEB_ALLOW_OWNER_MAINTENANCE_RUNS || "");
  const OWNER_ELEVATION_DURATION_OPTIONS_MINUTES = normalizeOwnerElevationDurations(env.HERMES_MOBILE_OWNER_ELEVATION_MINUTES || env.HERMES_WEB_OWNER_ELEVATION_MINUTES || "5,15,30,60");
  const OWNER_ELEVATION_DEFAULT_MINUTES = OWNER_ELEVATION_DURATION_OPTIONS_MINUTES.includes(15)
    ? 15
    : OWNER_ELEVATION_DURATION_OPTIONS_MINUTES[0];
  const OWNER_ELEVATION_ONCE_TTL_MS = Number(env.HERMES_MOBILE_OWNER_ELEVATION_ONCE_TTL_MS || env.HERMES_WEB_OWNER_ELEVATION_ONCE_TTL_MS || "120000");
  const WEB_PUSH_ENABLED = !/^(0|false|no|off)$/i.test(env.HERMES_WEB_PUSH_ENABLED || env.WEB_PUSH_ENABLED || "1");
  const WEB_PUSH_SUBJECT = env.WEB_PUSH_SUBJECT || env.HERMES_WEB_PUSH_SUBJECT || "mailto:hermes-mobile@example.invalid";
  const TODO_WEB_PUSH_ENABLED = !/^(0|false|no|off)$/i.test(env.HERMES_WEB_TODO_PUSH_ENABLED || "1");
  const TODO_WEB_PUSH_INTERVAL_MS = Number(env.HERMES_WEB_TODO_PUSH_INTERVAL_MS || "60000");
  const WEB_PUSH_START_DELAY_MS = nonNegativeMilliseconds(
    env.HERMES_MOBILE_WEB_PUSH_START_DELAY_MS
    || env.HERMES_WEB_WEB_PUSH_START_DELAY_MS,
    120000,
  );
  const TODO_WEB_PUSH_START_DELAY_MS = nonNegativeMilliseconds(
    env.HERMES_MOBILE_TODO_PUSH_START_DELAY_MS
    || env.HERMES_WEB_TODO_PUSH_START_DELAY_MS,
    WEB_PUSH_START_DELAY_MS,
  );
  const TODO_WEB_PUSH_RECENT_CREATE_MINUTES = Number(env.HERMES_WEB_TODO_PUSH_RECENT_CREATE_MINUTES || "30");
  const TODO_WEB_PUSH_RECEIPT_RETRY_MINUTES = Number(env.HERMES_WEB_TODO_PUSH_RECEIPT_RETRY_MINUTES || "3");
  const TODO_WEB_PUSH_RECEIPT_RETRY_LIMIT = Number(env.HERMES_WEB_TODO_PUSH_RECEIPT_RETRY_LIMIT || "3");
  const WEIXIN_DELIVERY_RETRY_LIMIT = Math.max(0, Number(
    env.HERMES_MOBILE_WEIXIN_DELIVERY_RETRY_LIMIT
    || env.HERMES_WEB_WEIXIN_DELIVERY_RETRY_LIMIT
    || "3",
  ) || 0);
  const WEIXIN_DELIVERY_RETRY_BASE_MS = Math.max(1000, Number(
    env.HERMES_MOBILE_WEIXIN_DELIVERY_RETRY_BASE_MS
    || env.HERMES_WEB_WEIXIN_DELIVERY_RETRY_BASE_MS
    || "60000",
  ) || 60000);
  const WEIXIN_DELIVERY_RETRY_MAX_MS = Math.max(WEIXIN_DELIVERY_RETRY_BASE_MS, Number(
    env.HERMES_MOBILE_WEIXIN_DELIVERY_RETRY_MAX_MS
    || env.HERMES_WEB_WEIXIN_DELIVERY_RETRY_MAX_MS
    || "600000",
  ) || 600000);
  const WEIXIN_INGRESS_ATTACHMENT_CONTEXT_WINDOW_MS = Math.max(0, Number(
    env.HERMES_MOBILE_WEIXIN_ATTACHMENT_CONTEXT_WINDOW_MS
    || env.HERMES_WEB_WEIXIN_ATTACHMENT_CONTEXT_WINDOW_MS
    || "30000",
  ) || 30000);
  const AUTOMATION_WEB_PUSH_ENABLED = !/^(0|false|no|off)$/i.test(env.HERMES_WEB_AUTOMATION_PUSH_ENABLED || "1");
  const AUTOMATION_WEB_PUSH_INTERVAL_MS = Number(env.HERMES_WEB_AUTOMATION_PUSH_INTERVAL_MS || "60000");
  const AUTOMATION_WEB_PUSH_START_DELAY_MS = nonNegativeMilliseconds(
    env.HERMES_MOBILE_AUTOMATION_PUSH_START_DELAY_MS
    || env.HERMES_WEB_AUTOMATION_PUSH_START_DELAY_MS,
    WEB_PUSH_START_DELAY_MS,
  );
  const SINGLE_WINDOW_CHAT_TASK_GROUP_ID = "chat";
  const SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID = "group-chat";
  const GROUP_MESSAGE_REVOKED_TEXT = "\u6d88\u606f\u5df2\u64a4\u56de";
  const GROUP_AI_REPLY_REVOKED_TEXT = "\u5173\u8054\u7684 AI \u56de\u590d\u5df2\u64a4\u56de";
  const SINGLE_WINDOW_PROJECT_ID = "single-window";
  const SINGLE_WINDOW_THREAD_TITLE = "Single Window";
  const OWNER_LABEL = env.HERMES_WEB_OWNER_LABEL || "Owner";
  const OWNER_ROOT_FALLBACK_LABEL = env.HERMES_WEB_OWNER_ROOT_LABEL || "Hermes Owner";
  const OWNER_DRIVE_ROOT_NAMES = normalizeStringList(env.HERMES_WEB_OWNER_DRIVE_ROOT_NAMES || "ChatGPT-Drive");
  const GENERIC_OWNER_TOPIC_PROJECT_PREFIXES = normalizeStringList(
    env.HERMES_WEB_GENERIC_OWNER_PROJECT_PREFIXES || "owner-",
  );
  const GENERIC_OWNER_TOPIC_PROJECT_IDS = new Set(normalizeStringList(
    env.HERMES_WEB_GENERIC_OWNER_PROJECT_IDS || "hermes-sync-folder",
  ));
  const PRINCIPAL_LABEL_PREFIXES = normalizeStringList(
    env.HERMES_WEB_PRINCIPAL_LABEL_PREFIXES || (ENABLE_LEGACY_WEIXIN_COMPAT ? "weixin_" : ""),
  );
  const REASONING_EFFORT_OPTIONS = Object.freeze([
    { value: "low", label: "Low", shortLabel: "\u4f4e" },
    { value: "medium", label: "Medium", shortLabel: "\u4e2d" },
    { value: "high", label: "High", shortLabel: "\u9ad8" },
    { value: "xhigh", label: "Xhigh", shortLabel: "Xhigh" },
  ]);
  const VALID_REASONING_EFFORTS = new Set(REASONING_EFFORT_OPTIONS.map((item) => item.value));
  const MESSAGE_TIME_FIELDS = Object.freeze([
    "submittedAt",
    "queuedAt",
    "startedAt",
    "firstFeedbackAt",
    "completedAt",
    "failedAt",
    "cancelledAt",
  ]);
  
  const MIME_BY_EXT = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".pdf": "application/pdf",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".opus": "audio/ogg",
    ".amr": "audio/amr",
    ".md": "text/markdown; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  
  function isSingleWindowConversationTaskGroupId(value) {
    const id = String(value || "");
    return id === SINGLE_WINDOW_CHAT_TASK_GROUP_ID || id === SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID;
  }
  
  function singleWindowChatTaskGroupId(requestedTaskGroupId = "") {
    return String(requestedTaskGroupId || "").trim() === SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID
      ? SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID
      : SINGLE_WINDOW_CHAT_TASK_GROUP_ID;
  }
  
  const AUTOMATION_PUSH_DELIVERABLE_EXTENSIONS = new Set([".md", ".pdf", ".doc", ".docx", ".xlsx", ".pptx"]);
  const AUTOMATION_PUSH_DELIVERABLE_LOOKBACK_MS = Number(env.HERMES_WEB_AUTOMATION_PUSH_DELIVERABLE_LOOKBACK_MS || String(30 * 60 * 1000));
  const AUTOMATION_PUSH_DELIVERABLE_FUTURE_GRACE_MS = Number(env.HERMES_WEB_AUTOMATION_PUSH_DELIVERABLE_FUTURE_GRACE_MS || String(30 * 60 * 1000));
  const AUTOMATION_PUSH_INITIAL_LOOKBACK_MS = Number(env.HERMES_WEB_AUTOMATION_PUSH_INITIAL_LOOKBACK_MS || String(24 * 60 * 60 * 1000));
  const MAX_STATE_BACKUPS = Number(env.HERMES_WEB_MAX_STATE_BACKUPS || "80");
  const STATE_BACKUP_MIN_INTERVAL_MS = Number(env.HERMES_WEB_STATE_BACKUP_MIN_INTERVAL_MS || String(10 * 60 * 1000));
  const DIRECT_TODO_CREATE_SETTING = String(env.HERMES_MOBILE_DIRECT_KANBAN_CREATE || env.HERMES_WEB_DIRECT_TODO_CREATE || "").trim();
  const BOOT_TRACE_PATH = env.HERMES_MOBILE_BOOT_TRACE_PATH || env.HERMES_WEB_BOOT_TRACE_PATH || "";
  
  return {
    TOOL_ROOT,
    REPO_ROOT,
    PUBLIC_ROOT,
    INDEX_HTML_PATH,
    UPDATE_REMOTE_NAME,
    UPDATE_BRANCH,
    UPDATE_VERSION_URL,
    UPDATE_CHECK_TIMEOUT_MS,
    DEFAULT_TODO_BRIDGE_SCRIPT,
    DEFAULT_CRON_BRIDGE_SCRIPT,
    DEFAULT_DIRECTORY_BRIDGE_SCRIPT,
    DEFAULT_SKILL_BRIDGE_SCRIPT,
    LOCAL_CONFIG_ROOT,
    PERMISSION_APPROVAL_MARKER,
    HOST,
    PORT,
    HERMES_API_BASE,
    HERMES_API_TIMEOUT_MS,
    GATEWAY_POOL_ENABLED,
    GATEWAY_SKILL_PROFILE_ROUTING,
    GATEWAY_USAGE_TELEMETRY_ENABLED,
    GATEWAY_USAGE_TELEMETRY_PROFILE_ROOTS,
    GATEWAY_POOL_HEALTH_TIMEOUT_MS,
    RUN_START_TIMEOUT_MS,
    RUN_STREAMING_SAVE_THROTTLE_MS,
    RUN_LIVENESS_CHECK_AFTER_MS,
    RUN_LIVENESS_CHECK_INTERVAL_MS,
    RUN_LIVENESS_STALE_AFTER_MS,
    RUN_CONCURRENCY_MAX_GLOBAL,
    RUN_CONCURRENCY_MAX_PER_WORKSPACE,
    DISABLE_AUTH,
    DATA_DIR,
    STATE_PATH,
    STATE_BACKUP_DIR,
    SHARED_DIRECTORIES_PATH,
    AUDIT_EVENT_LOG_PATH,
    ACCESS_KEYS_PATH,
    LOCAL_WORKSPACES_PATH,
    RUNTIME_CONFIG_PATH,
    LEARNING_COIN_STORE_PATH,
    WEIXIN_INGRESS_KEY_PATHS,
    WEIXIN_INGRESS_DEFAULT_WORKSPACE,
    GROUP_DELIVERIES_DIR,
    OWNER_DEFAULT_WORKSPACE,
    WORKSPACE_UPLOAD_DIR_NAME,
    WORKSPACE_UPLOAD_SUBDIR,
    AUTH_KEY_PATH,
    WEB_PUSH_VAPID_PATH,
    WSL_DISTRO,
    WINDOWS_HOME,
    WSL_USER,
    WSL_HOME,
    WSL_HERMES_HOME,
    ENABLE_LEGACY_WEIXIN_COMPAT,
    HERMES_ENV_PATHS,
    HERMES_API_KEY_PATHS,
    WORKSPACE_USERS_PATHS,
    WORKSPACE_ROUTE_MAP_PATHS,
    HERMES_CONFIG_PATHS,
    EXPLICIT_HERMES_CONFIG_PATHS,
    ALLOW_WSL_REASONING_CONFIG_LOOKUP,
    STATUS_INCLUDE_CATALOG,
    GATEWAY_POOL_MANIFEST_PATHS,
    GOOGLE_TOKEN_PATHS,
    GOOGLE_CLIENT_SECRET_PATHS,
    OUTLOOK_GRAPH_TOKEN_PATHS,
    GITHUB_CLI_HOSTS_PATHS,
    PROJECT_MAP_PATHS,
    MAX_BODY_BYTES,
    MAX_HISTORY_MESSAGES,
    CHAT_CONTEXT_MAX_MESSAGES,
    CHAT_CONTEXT_MAX_CHARS,
    CONTEXT_ASSEMBLY_MODE,
    CONTEXT_COMPACTION_ENABLED,
    MAX_MESSAGE_CHARS,
    MAX_API_TEXT_CHARS,
    THREAD_MESSAGE_INITIAL_LIMIT,
    THREAD_MESSAGE_PAGE_LIMIT,
    THREAD_MESSAGE_SEARCH_LIMIT,
    MAX_EVENT_PREVIEW_CHARS,
    MAX_STORED_EVENTS_PER_THREAD,
    MAX_UPLOAD_BYTES,
    MAX_FILE_PREVIEW_CHARS,
    SOURCE_MARKDOWN_SEARCH_LIMIT,
    WEIXIN_FORWARD_MARKDOWN_MAX_BYTES,
    TODO_BRIDGE_TIMEOUT_MS,
    KANBAN_BRIDGE_TIMEOUT_MS,
    CRON_BRIDGE_TIMEOUT_MS,
    CRON_BRIDGE_STDOUT_LIMIT_BYTES,
    CRON_LIST_CACHE_TTL_MS,
    AUTOMATION_CREATE_TIMEOUT_MS,
    AUTOMATION_CREATE_MODEL,
    LEARNING_GROWTH_JIT_MODEL,
    LEARNING_GROWTH_JIT_REASONING_EFFORT,
    DIRECTORY_BRIDGE_TIMEOUT_MS,
    SKILL_BRIDGE_TIMEOUT_MS,
    CRON_OUTPUT_ROOT,
    CRON_RUN_LOG_ROOT,
    TODO_BACKEND,
    KANBAN_COMMAND,
    KANBAN_COMMAND_ARGS,
    KANBAN_TODO_META_PATH,
    KANBAN_CARD_LIST_CACHE_PATH,
    KANBAN_CASE_SHARE_PATH,
    KANBAN_WORKSPACE_PATH_STYLE,
    KANBAN_DEPENDENCY_RECONCILE_INTERVAL_MS,
    KANBAN_CARD_LIST_CACHE_TTL_MS,
    KANBAN_BLOCKED_PUSH_DELAY_MINUTES,
    KANBAN_MULTI_AGENT_DEFAULT_PARALLEL,
    KANBAN_MULTI_AGENT_MAX_PARALLEL,
    KANBAN_MULTI_AGENT_MAX_CARDS,
    KANBAN_MULTI_AGENT_PLAN_TIMEOUT_MS,
    KANBAN_READING_PLAN_MAX_SESSIONS,
    KANBAN_READING_ANALYSIS_TIMEOUT_MS,
    KANBAN_READING_TRANSCRIBE_TIMEOUT_MS,
    KANBAN_READING_TRANSCRIBE_SCRIPT,
    KANBAN_READING_ARTIFACT_ROOT,
    KANBAN_READING_COVER_MAX_BYTES,
    KANBAN_SOURCE_DOCUMENT_MAX_BYTES,
    KANBAN_READING_QUIZ_TARGETING_VERSION,
    KANBAN_STUDY_CASE_MODES,
    KANBAN_ASSESSMENT_CASE_MODES,
    KANBAN_STUDY_SHARED_FOLDER_NAME,
    KANBAN_CASE_TOPIC_KIND,
    KANBAN_ASSESSMENT_PLAN_MAX_EXAMS,
    KANBAN_ASSESSMENT_MAX_QUESTIONS,
    KANBAN_ASSESSMENT_MODEL_TIMEOUT_MS,
    AUTOMATION_BACKEND,
    LOCAL_TODO_STORE_PATH,
    LOCAL_AUTOMATION_STORE_PATH,
    SERVICE_STORE_BACKEND,
    MOBILE_SQLITE_DB_PATH,
    BRIDGE_HOST_URL,
    BRIDGE_HOST_KEY_PATH,
    OWNER_MAINTENANCE_RUNS_ENABLED,
    OWNER_ELEVATION_DURATION_OPTIONS_MINUTES,
    OWNER_ELEVATION_DEFAULT_MINUTES,
    OWNER_ELEVATION_ONCE_TTL_MS,
    WEB_PUSH_ENABLED,
    WEB_PUSH_SUBJECT,
    TODO_WEB_PUSH_ENABLED,
    TODO_WEB_PUSH_INTERVAL_MS,
    WEB_PUSH_START_DELAY_MS,
    TODO_WEB_PUSH_START_DELAY_MS,
    TODO_WEB_PUSH_RECENT_CREATE_MINUTES,
    TODO_WEB_PUSH_RECEIPT_RETRY_MINUTES,
    TODO_WEB_PUSH_RECEIPT_RETRY_LIMIT,
    WEIXIN_DELIVERY_RETRY_LIMIT,
    WEIXIN_DELIVERY_RETRY_BASE_MS,
    WEIXIN_DELIVERY_RETRY_MAX_MS,
    WEIXIN_INGRESS_ATTACHMENT_CONTEXT_WINDOW_MS,
    AUTOMATION_WEB_PUSH_ENABLED,
    AUTOMATION_WEB_PUSH_INTERVAL_MS,
    AUTOMATION_WEB_PUSH_START_DELAY_MS,
    SINGLE_WINDOW_CHAT_TASK_GROUP_ID,
    SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID,
    isSingleWindowConversationTaskGroupId,
    singleWindowChatTaskGroupId,
    GROUP_MESSAGE_REVOKED_TEXT,
    GROUP_AI_REPLY_REVOKED_TEXT,
    SINGLE_WINDOW_PROJECT_ID,
    SINGLE_WINDOW_THREAD_TITLE,
    OWNER_LABEL,
    OWNER_ROOT_FALLBACK_LABEL,
    OWNER_DRIVE_ROOT_NAMES,
    GENERIC_OWNER_TOPIC_PROJECT_PREFIXES,
    GENERIC_OWNER_TOPIC_PROJECT_IDS,
    PRINCIPAL_LABEL_PREFIXES,
    REASONING_EFFORT_OPTIONS,
    VALID_REASONING_EFFORTS,
    MESSAGE_TIME_FIELDS,
    MIME_BY_EXT,
    AUTOMATION_PUSH_DELIVERABLE_EXTENSIONS,
    AUTOMATION_PUSH_DELIVERABLE_LOOKBACK_MS,
    AUTOMATION_PUSH_DELIVERABLE_FUTURE_GRACE_MS,
    AUTOMATION_PUSH_INITIAL_LOOKBACK_MS,
    MAX_STATE_BACKUPS,
    STATE_BACKUP_MIN_INTERVAL_MS,
    DIRECT_TODO_CREATE_SETTING,
    BOOT_TRACE_PATH,
  };
}

module.exports = {
  createMobileRuntimeEnvironment,
};
