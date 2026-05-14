"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { spawn, spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const webpush = require("web-push");
const { createAccessPolicyProvider } = require("./adapters/access-policy-provider");
const { createAuthProvider } = require("./adapters/auth-provider");
const { createAutomationProvider } = require("./adapters/automation-provider");
const { createBridgeCommandProvider } = require("./adapters/bridge-command-provider");
const { createAutomationDeliveryRequirement, createDeliveryBoundaryInstructions } = require("./adapters/delivery-boundary-provider");
const { createDisplayPathProvider } = require("./adapters/display-path-provider");
const { createExternalIntegrationProvider } = require("./adapters/external-integration-provider");
const { createFilesystemMountProvider } = require("./adapters/filesystem-mount-provider");
const { createGatewayPoolProvider } = require("./adapters/gateway-pool-provider");
const { createGatewayRunner } = require("./adapters/gateway-runner");
const { createGatewayUsageTelemetryProvider } = require("./adapters/gateway-usage-telemetry-provider");
const { createKanbanCardProvider } = require("./adapters/kanban-card-provider");
const { createKanbanTodoBridge } = require("./adapters/kanban-provider");
const { createProjectDiscoveryProvider } = require("./adapters/project-discovery-provider");
const { createRuntimeConfigProvider } = require("./adapters/runtime-config-provider");
const { createRunConcurrencyPolicy } = require("./adapters/run-concurrency-policy");
const { createSecurityBoundaryProvider } = require("./adapters/security-boundary-provider");
const { createSharedDirectoryProvider } = require("./adapters/shared-directory-provider");
const { createSkillDetailProvider } = require("./adapters/skill-detail-provider");
const { createWorkspaceBindingsProvider } = require("./adapters/workspace-bindings-provider");
const { createWorkspaceProjectProvider } = require("./adapters/workspace-project-provider");
const { createTodoProvider } = require("./adapters/todo-provider");
const { createWeixinIngressProvider } = require("./adapters/weixin-ingress-provider");

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

const TOOL_ROOT = __dirname;
const REPO_ROOT = path.resolve(process.env.HERMES_WEB_REPO_ROOT || process.env.HERMES_MOBILE_ROOT || TOOL_ROOT);
const PUBLIC_ROOT = path.join(TOOL_ROOT, "public");
const INDEX_HTML_PATH = path.join(PUBLIC_ROOT, "index.html");
const UPDATE_REMOTE_NAME = process.env.HERMES_MOBILE_UPDATE_REMOTE || process.env.HERMES_WEB_UPDATE_REMOTE || "origin";
const UPDATE_BRANCH = process.env.HERMES_MOBILE_UPDATE_BRANCH || process.env.HERMES_WEB_UPDATE_BRANCH || "main";
const UPDATE_VERSION_URL = process.env.HERMES_MOBILE_UPDATE_VERSION_URL || process.env.HERMES_WEB_UPDATE_VERSION_URL || "";
const UPDATE_CHECK_TIMEOUT_MS = Number(process.env.HERMES_MOBILE_UPDATE_CHECK_TIMEOUT_MS || process.env.HERMES_WEB_UPDATE_CHECK_TIMEOUT_MS || "6000");
const DEFAULT_TODO_BRIDGE_SCRIPT = path.join(TOOL_ROOT, "todo_bridge.py");
const DEFAULT_CRON_BRIDGE_SCRIPT = path.join(TOOL_ROOT, "cron_bridge.py");
const DEFAULT_DIRECTORY_BRIDGE_SCRIPT = path.join(TOOL_ROOT, "directory_bridge.py");
const DEFAULT_SKILL_BRIDGE_SCRIPT = path.join(TOOL_ROOT, "skill_bridge.py");
const LOCAL_CONFIG_ROOT = path.resolve(process.env.HERMES_WEB_CONFIG_DIR || path.join(REPO_ROOT, "config"));
const PERMISSION_APPROVAL_MARKER = "HERMES_PERMISSION_APPROVAL_REQUIRED";

const HOST = process.env.HERMES_WEB_HOST || "0.0.0.0";
const PORT = Number(process.env.HERMES_WEB_PORT || "8797");
const HERMES_API_BASE = stripTrailingSlash(
  process.env.HERMES_WEB_HERMES_API_BASE || process.env.HERMES_API_BASE || "http://127.0.0.1:8642",
);
const HERMES_API_TIMEOUT_MS = Number(process.env.HERMES_WEB_HERMES_API_TIMEOUT_MS || "8000");
const GATEWAY_POOL_ENABLED = process.env.HERMES_WEB_GATEWAY_POOL_ENABLED || "auto";
const GATEWAY_SKILL_PROFILE_ROUTING = normalizeAutoMode(
  process.env.HERMES_MOBILE_GATEWAY_SKILL_PROFILE_ROUTING
  || process.env.HERMES_WEB_GATEWAY_SKILL_PROFILE_ROUTING
  || "auto",
);
const GATEWAY_USAGE_TELEMETRY_ENABLED = (
  process.env.HERMES_MOBILE_GATEWAY_USAGE_TELEMETRY_ENABLED
  || process.env.HERMES_WEB_GATEWAY_USAGE_TELEMETRY_ENABLED
  || "auto"
);
const GATEWAY_USAGE_TELEMETRY_PROFILE_ROOTS = normalizeStringList(
  process.env.HERMES_MOBILE_GATEWAY_TELEMETRY_PROFILES_ROOTS
  || process.env.HERMES_WEB_GATEWAY_TELEMETRY_PROFILES_ROOTS
  || "",
);
const GATEWAY_POOL_HEALTH_TIMEOUT_MS = Number(process.env.HERMES_WEB_GATEWAY_POOL_HEALTH_TIMEOUT_MS || "5000");
const RUN_START_TIMEOUT_MS = Number(process.env.HERMES_WEB_RUN_START_TIMEOUT_MS || "90000");
const RUN_LIVENESS_CHECK_AFTER_MS = Number(process.env.HERMES_WEB_RUN_LIVENESS_CHECK_AFTER_MS || "120000");
const RUN_LIVENESS_CHECK_INTERVAL_MS = Number(process.env.HERMES_WEB_RUN_LIVENESS_CHECK_INTERVAL_MS || "45000");
const RUN_LIVENESS_STALE_AFTER_MS = Number(process.env.HERMES_WEB_RUN_LIVENESS_STALE_AFTER_MS || "0");
const RUN_CONCURRENCY_MAX_GLOBAL = Number(process.env.HERMES_WEB_MAX_ACTIVE_RUNS || "0");
const RUN_CONCURRENCY_MAX_PER_WORKSPACE = Number(process.env.HERMES_WEB_MAX_ACTIVE_RUNS_PER_WORKSPACE || "0");
const DISABLE_AUTH = /^(1|true|yes|on)$/i.test(process.env.HERMES_WEB_DISABLE_AUTH || "");
const DATA_DIR = path.resolve(process.env.HERMES_WEB_DATA_DIR || path.join(REPO_ROOT, "workspace", "hermes-web"));
const STATE_PATH = path.join(DATA_DIR, "state.json");
const STATE_BACKUP_DIR = path.join(DATA_DIR, "backups");
const SHARED_DIRECTORIES_PATH = path.join(DATA_DIR, "shared-directories.json");
const ACCESS_KEYS_PATH = path.join(DATA_DIR, "access-keys.json");
const LOCAL_WORKSPACES_PATH = path.join(DATA_DIR, "workspaces.json");
const RUNTIME_CONFIG_PATH = path.join(DATA_DIR, "runtime-config.json");
const WEIXIN_INGRESS_KEY_PATHS = [
  process.env.HERMES_MOBILE_WEIXIN_INGRESS_KEY_PATH,
  process.env.HERMES_WEB_WEIXIN_INGRESS_KEY_PATH,
  path.join(DATA_DIR, "weixin-ingress.secret"),
].filter(Boolean);
const WEIXIN_INGRESS_DEFAULT_WORKSPACE = String(
  process.env.HERMES_MOBILE_WEIXIN_INGRESS_DEFAULT_WORKSPACE
    || process.env.HERMES_WEB_WEIXIN_INGRESS_DEFAULT_WORKSPACE
    || "",
).trim();
const GROUP_DELIVERIES_DIR = path.join(DATA_DIR, "artifacts", "group-deliveries");
const OWNER_DEFAULT_WORKSPACE = path.resolve(process.env.HERMES_WEB_OWNER_DEFAULT_WORKSPACE || path.join(DATA_DIR, "drive"));
const WORKSPACE_UPLOAD_DIR_NAME = ".hermes-mobile";
const WORKSPACE_UPLOAD_SUBDIR = "uploads";
const AUTH_KEY_PATH = path.resolve(process.env.HERMES_WEB_AUTH_KEY_PATH || path.join(REPO_ROOT, ".hermes_web_secret_key"));
const WEB_PUSH_VAPID_PATH = path.resolve(
  process.env.HERMES_WEB_VAPID_PATH || process.env.WEB_PUSH_VAPID_PATH || path.join(DATA_DIR, "web-push-vapid.json"),
);
const WSL_DISTRO = process.env.HERMES_WEB_WSL_DISTRO || "Ubuntu-24.04";
const WINDOWS_HOME = process.env.USERPROFILE || os.homedir() || "";
const WSL_USER = process.env.HERMES_WEB_WSL_USER || process.env.WSL_USER || process.env.USER || "hermes";
const WSL_HOME = stripTrailingSlash(process.env.HERMES_WEB_WSL_HOME || `/home/${WSL_USER}`);
const WSL_HERMES_HOME = stripTrailingSlash(process.env.HERMES_WEB_WSL_HERMES_HOME || `${WSL_HOME}/.hermes`);
const ENABLE_LEGACY_WEIXIN_COMPAT = /^(1|true|yes|on)$/i.test(
  process.env.HERMES_WEB_ENABLE_LEGACY_WEIXIN_COMPAT || process.env.HERMES_WEB_LEGACY_WEIXIN_COMPAT || "",
);
const HERMES_ENV_PATHS = [
  process.env.HERMES_WEB_HERMES_ENV_PATH,
  ...wslUncPathCandidates(WSL_HERMES_HOME, ".env"),
].filter(Boolean);
const HERMES_API_KEY_PATHS = [
  process.env.HERMES_WEB_HERMES_API_KEY_PATH,
  path.join(WINDOWS_HOME, ".hermes-windows", "hermes-api-server-key.secret"),
].filter(Boolean);
const WORKSPACE_USERS_PATHS = [
  process.env.HERMES_WEB_WORKSPACE_USERS_PATH,
  ...wslUncPathCandidates(WSL_HERMES_HOME, "access-control", "workspace-users.json"),
  path.join(LOCAL_CONFIG_ROOT, "access-control", "workspace-users.json"),
  process.env.HERMES_WEB_WEIXIN_USERS_PATH,
  ...(ENABLE_LEGACY_WEIXIN_COMPAT ? wslUncPathCandidates(WSL_HERMES_HOME, "access-control", "weixin-users.json") : []),
  ...(ENABLE_LEGACY_WEIXIN_COMPAT ? [path.join(LOCAL_CONFIG_ROOT, "access-control", "weixin-users.json")] : []),
].filter(Boolean);
const WORKSPACE_ROUTE_MAP_PATHS = [
  process.env.HERMES_WEB_WORKSPACE_ROUTE_MAP_PATH,
  ...wslUncPathCandidates(WSL_HERMES_HOME, "access-control", "workspace-routing-map.json"),
  path.join(LOCAL_CONFIG_ROOT, "access-control", "workspace-routing-map.json"),
  process.env.HERMES_WEB_WEIXIN_ROUTE_MAP_PATH,
  ...(ENABLE_LEGACY_WEIXIN_COMPAT ? wslUncPathCandidates(WSL_HERMES_HOME, "access-control", "weixin-routing-map.json") : []),
  ...(ENABLE_LEGACY_WEIXIN_COMPAT ? [path.join(LOCAL_CONFIG_ROOT, "access-control", "weixin-routing-map.json")] : []),
].filter(Boolean);
const HERMES_CONFIG_PATHS = [
  process.env.HERMES_WEB_HERMES_CONFIG_PATH,
  process.env.HERMES_CONFIG_PATH,
  ...wslUncPathCandidates(WSL_HERMES_HOME, "config.yaml"),
  path.join(LOCAL_CONFIG_ROOT, "hermes-config.yaml"),
  path.join(LOCAL_CONFIG_ROOT, "config.yaml"),
].filter(Boolean);
const EXPLICIT_HERMES_CONFIG_PATHS = new Set([
  process.env.HERMES_WEB_HERMES_CONFIG_PATH,
  process.env.HERMES_CONFIG_PATH,
].map((item) => String(item || "").trim()).filter(Boolean));
const ALLOW_WSL_REASONING_CONFIG_LOOKUP = /^(1|true|yes|on)$/i.test(
  process.env.HERMES_MOBILE_ALLOW_WSL_REASONING_CONFIG_LOOKUP
  || process.env.HERMES_WEB_ALLOW_WSL_REASONING_CONFIG_LOOKUP
  || "",
);
const STATUS_INCLUDE_CATALOG = /^(1|true|yes|on)$/i.test(
  process.env.HERMES_MOBILE_STATUS_INCLUDE_CATALOG
  || process.env.HERMES_WEB_STATUS_INCLUDE_CATALOG
  || "",
);
const GATEWAY_POOL_MANIFEST_PATHS = [
  process.env.HERMES_WEB_GATEWAY_POOL_MANIFEST,
  ...wslUncPathCandidates(WSL_HERMES_HOME, "worker-pool.json"),
].filter(Boolean);
const GOOGLE_TOKEN_PATHS = [
  process.env.HERMES_WEB_GOOGLE_TOKEN_PATH,
  ...wslUncPathCandidates(WSL_HERMES_HOME, "google_token.json"),
].filter(Boolean);
const GOOGLE_CLIENT_SECRET_PATHS = [
  process.env.HERMES_WEB_GOOGLE_CLIENT_SECRET_PATH,
  ...wslUncPathCandidates(WSL_HERMES_HOME, "google_client_secret.json"),
].filter(Boolean);
const OUTLOOK_GRAPH_TOKEN_PATHS = [
  process.env.HERMES_WEB_OUTLOOK_GRAPH_TOKEN_PATH,
  ...wslUncPathCandidates(WSL_HERMES_HOME, "microsoft-graph-outlook-mail", "token.json"),
].filter(Boolean);
const GITHUB_CLI_HOSTS_PATHS = [
  process.env.HERMES_WEB_GITHUB_CLI_HOSTS_PATH,
  path.join(WINDOWS_HOME, "AppData", "Roaming", "GitHub CLI", "hosts.yml"),
  ...wslUncPathCandidates(WSL_HOME, ".config", "gh", "hosts.yml"),
].filter(Boolean);
const PROJECT_MAP_PATHS = [
  process.env.HERMES_WEB_PROJECT_MAP_PATH,
  path.join(LOCAL_CONFIG_ROOT, "project-directory-map.json"),
].filter(Boolean);

const MAX_BODY_BYTES = 2_000_000;
const MAX_HISTORY_MESSAGES = 30;
const CHAT_CONTEXT_MAX_MESSAGES = Math.max(0, Number(process.env.HERMES_WEB_CHAT_CONTEXT_MAX_MESSAGES || "16") || 16);
const CHAT_CONTEXT_MAX_CHARS = Math.max(1000, Number(process.env.HERMES_WEB_CHAT_CONTEXT_MAX_CHARS || "20000") || 20000);
const MAX_MESSAGE_CHARS = 240_000;
const MAX_API_TEXT_CHARS = 80_000;
const THREAD_MESSAGE_INITIAL_LIMIT = Math.max(10, Number(process.env.HERMES_MOBILE_THREAD_MESSAGE_INITIAL_LIMIT || process.env.HERMES_WEB_THREAD_MESSAGE_INITIAL_LIMIT || "60") || 60);
const THREAD_MESSAGE_PAGE_LIMIT = Math.max(10, Number(process.env.HERMES_MOBILE_THREAD_MESSAGE_PAGE_LIMIT || process.env.HERMES_WEB_THREAD_MESSAGE_PAGE_LIMIT || "40") || 40);
const THREAD_MESSAGE_SEARCH_LIMIT = Math.max(10, Number(process.env.HERMES_MOBILE_THREAD_MESSAGE_SEARCH_LIMIT || process.env.HERMES_WEB_THREAD_MESSAGE_SEARCH_LIMIT || "120") || 120);
const MAX_EVENT_PREVIEW_CHARS = 1600;
const MAX_STORED_EVENTS_PER_THREAD = 80;
const MAX_UPLOAD_BYTES = Number(process.env.HERMES_WEB_MAX_UPLOAD_BYTES || "104857600");
const MAX_FILE_PREVIEW_CHARS = Number(process.env.HERMES_WEB_MAX_FILE_PREVIEW_CHARS || "180000");
const SOURCE_MARKDOWN_SEARCH_LIMIT = Number(
  process.env.HERMES_MOBILE_SOURCE_MARKDOWN_SEARCH_LIMIT
  || process.env.HERMES_WEB_SOURCE_MARKDOWN_SEARCH_LIMIT
  || "2000",
);
const WEIXIN_FORWARD_MARKDOWN_MAX_BYTES = Number(
  process.env.HERMES_MOBILE_WEIXIN_MARKDOWN_FORWARD_MAX_BYTES
  || process.env.HERMES_WEB_WEIXIN_MARKDOWN_FORWARD_MAX_BYTES
  || String(2 * 1024 * 1024),
);
const TODO_BRIDGE_TIMEOUT_MS = Number(process.env.HERMES_WEB_TODO_BRIDGE_TIMEOUT_MS || "15000");
const KANBAN_BRIDGE_TIMEOUT_MS = Number(process.env.HERMES_MOBILE_KANBAN_BRIDGE_TIMEOUT_MS || process.env.HERMES_WEB_KANBAN_BRIDGE_TIMEOUT_MS || "20000");
const CRON_BRIDGE_TIMEOUT_MS = Number(process.env.HERMES_WEB_CRON_BRIDGE_TIMEOUT_MS || "15000");
const CRON_BRIDGE_STDOUT_LIMIT_BYTES = Number(process.env.HERMES_MOBILE_CRON_BRIDGE_STDOUT_LIMIT_BYTES || process.env.HERMES_WEB_CRON_BRIDGE_STDOUT_LIMIT_BYTES || "50000000");
const CRON_LIST_CACHE_TTL_MS = Number(process.env.HERMES_WEB_CRON_LIST_CACHE_TTL_MS || "12000");
const AUTOMATION_CREATE_TIMEOUT_MS = Number(process.env.HERMES_WEB_AUTOMATION_CREATE_TIMEOUT_MS || "60000");
const AUTOMATION_CREATE_MODEL = process.env.HERMES_WEB_AUTOMATION_CREATE_MODEL || "gpt-5.4-mini";
const DIRECTORY_BRIDGE_TIMEOUT_MS = Number(process.env.HERMES_WEB_DIRECTORY_BRIDGE_TIMEOUT_MS || "15000");
const SKILL_BRIDGE_TIMEOUT_MS = Number(process.env.HERMES_WEB_SKILL_BRIDGE_TIMEOUT_MS || "12000");
const CRON_OUTPUT_ROOT = stripTrailingSlash(process.env.HERMES_WEB_CRON_OUTPUT_ROOT || `${WSL_HERMES_HOME}/cron/output`);
const CRON_RUN_LOG_ROOT = stripTrailingSlash(process.env.HERMES_WEB_RUN_LOG_ROOT || `${WSL_HERMES_HOME}/run-logs`);
const TODO_BACKEND = String(process.env.HERMES_WEB_TODO_BACKEND || "local").trim().toLowerCase();
const KANBAN_COMMAND = String(process.env.HERMES_MOBILE_KANBAN_COMMAND || process.env.HERMES_WEB_KANBAN_COMMAND || "hermes").trim() || "hermes";
const KANBAN_COMMAND_ARGS = String(process.env.HERMES_MOBILE_KANBAN_COMMAND_ARGS || process.env.HERMES_WEB_KANBAN_COMMAND_ARGS || "").trim();
const KANBAN_TODO_META_PATH = path.resolve(process.env.HERMES_MOBILE_KANBAN_TODO_META_PATH || process.env.HERMES_WEB_KANBAN_TODO_META_PATH || path.join(DATA_DIR, "kanban-todo-meta.json"));
const KANBAN_CARD_LIST_CACHE_PATH = path.resolve(process.env.HERMES_MOBILE_KANBAN_CARD_LIST_CACHE_PATH || process.env.HERMES_WEB_KANBAN_CARD_LIST_CACHE_PATH || path.join(DATA_DIR, "kanban-card-list-cache.json"));
const KANBAN_CASE_SHARE_PATH = path.resolve(process.env.HERMES_MOBILE_KANBAN_CASE_SHARE_PATH || process.env.HERMES_WEB_KANBAN_CASE_SHARE_PATH || path.join(DATA_DIR, "kanban-case-shares.json"));
const KANBAN_WORKSPACE_PATH_STYLE = String(process.env.HERMES_MOBILE_KANBAN_WORKSPACE_PATH_STYLE || process.env.HERMES_WEB_KANBAN_WORKSPACE_PATH_STYLE || "").trim().toLowerCase();
const KANBAN_DEPENDENCY_RECONCILE_INTERVAL_MS = Math.max(5000, Number(process.env.HERMES_MOBILE_KANBAN_DEPENDENCY_RECONCILE_INTERVAL_MS || process.env.HERMES_WEB_KANBAN_DEPENDENCY_RECONCILE_INTERVAL_MS || "30000") || 30000);
const KANBAN_CARD_LIST_CACHE_TTL_MS = Math.max(0, Number(process.env.HERMES_MOBILE_KANBAN_CARD_LIST_CACHE_TTL_MS || process.env.HERMES_WEB_KANBAN_CARD_LIST_CACHE_TTL_MS || String(30 * 60 * 1000)) || 0);
const KANBAN_BLOCKED_PUSH_DELAY_MINUTES = Math.max(0, Number(process.env.HERMES_MOBILE_KANBAN_BLOCKED_PUSH_DELAY_MINUTES || process.env.HERMES_WEB_KANBAN_BLOCKED_PUSH_DELAY_MINUTES || "10") || 0);
const KANBAN_MULTI_AGENT_MAX_PARALLEL = 3;
const KANBAN_MULTI_AGENT_MAX_CARDS = 8;
const KANBAN_MULTI_AGENT_PLAN_TIMEOUT_MS = Number(process.env.HERMES_MOBILE_KANBAN_PLAN_TIMEOUT_MS || process.env.HERMES_WEB_KANBAN_PLAN_TIMEOUT_MS || "90000");
const KANBAN_READING_PLAN_MAX_SESSIONS = Math.max(1, Math.min(60, Number(process.env.HERMES_MOBILE_READING_PLAN_MAX_SESSIONS || process.env.HERMES_WEB_READING_PLAN_MAX_SESSIONS || "31") || 31));
const KANBAN_READING_ANALYSIS_TIMEOUT_MS = Number(process.env.HERMES_MOBILE_READING_ANALYSIS_TIMEOUT_MS || process.env.HERMES_WEB_READING_ANALYSIS_TIMEOUT_MS || "120000");
const KANBAN_READING_TRANSCRIBE_TIMEOUT_MS = Number(process.env.HERMES_MOBILE_READING_TRANSCRIBE_TIMEOUT_MS || process.env.HERMES_WEB_READING_TRANSCRIBE_TIMEOUT_MS || "240000");
const KANBAN_READING_TRANSCRIBE_SCRIPT = path.resolve(process.env.HERMES_MOBILE_READING_TRANSCRIBE_SCRIPT || process.env.HERMES_WEB_READING_TRANSCRIBE_SCRIPT || path.join(__dirname, "scripts", "transcribe-reading-audio.ps1"));
const KANBAN_READING_ARTIFACT_ROOT = path.resolve(process.env.HERMES_MOBILE_READING_ARTIFACT_ROOT || process.env.HERMES_WEB_READING_ARTIFACT_ROOT || path.join(DATA_DIR, "artifacts", "kanban-reading"));
const KANBAN_READING_COVER_MAX_BYTES = Math.max(1, Math.min(MAX_UPLOAD_BYTES, Number(process.env.HERMES_MOBILE_READING_COVER_MAX_BYTES || process.env.HERMES_WEB_READING_COVER_MAX_BYTES || String(20 * 1024 * 1024)) || (20 * 1024 * 1024)));
const KANBAN_READING_QUIZ_TARGETING_VERSION = "20260513-score-weakness-v1";
const KANBAN_STUDY_CASE_MODES = new Set(["study-plan"]);
const KANBAN_ASSESSMENT_CASE_MODES = new Set(["assessment-plan"]);
const KANBAN_STUDY_SHARED_FOLDER_NAME = "\u5b66\u4e60\u8ba1\u5212";
const KANBAN_CASE_TOPIC_KIND = "case-topic";
const KANBAN_ASSESSMENT_PLAN_MAX_EXAMS = Math.max(1, Math.min(30, Number(process.env.HERMES_MOBILE_ASSESSMENT_PLAN_MAX_EXAMS || "30") || 30));
const KANBAN_ASSESSMENT_MAX_QUESTIONS = Math.max(5, Math.min(40, Number(process.env.HERMES_MOBILE_ASSESSMENT_MAX_QUESTIONS || "40") || 40));
const KANBAN_ASSESSMENT_MODEL_TIMEOUT_MS = Number(process.env.HERMES_MOBILE_ASSESSMENT_MODEL_TIMEOUT_MS || "180000");
const AUTOMATION_BACKEND = String(process.env.HERMES_WEB_AUTOMATION_BACKEND || "local").trim().toLowerCase();
const LOCAL_TODO_STORE_PATH = path.resolve(process.env.HERMES_WEB_TODO_STORE_PATH || path.join(DATA_DIR, "todos.json"));
const LOCAL_AUTOMATION_STORE_PATH = path.resolve(process.env.HERMES_WEB_AUTOMATION_STORE_PATH || path.join(DATA_DIR, "automations.json"));
const SERVICE_STORE_BACKEND = String(process.env.HERMES_WEB_SERVICE_STORE || "").trim().toLowerCase();
const MOBILE_SQLITE_DB_PATH = path.resolve(process.env.HERMES_WEB_DB_PATH || path.join(DATA_DIR, "hermes-mobile.sqlite3"));
const BRIDGE_HOST_URL = stripTrailingSlash(process.env.HERMES_MOBILE_BRIDGE_HOST_URL || process.env.HERMES_WEB_BRIDGE_HOST_URL || "");
const BRIDGE_HOST_KEY_PATH = process.env.HERMES_MOBILE_BRIDGE_HOST_KEY_PATH || process.env.HERMES_WEB_BRIDGE_HOST_KEY_PATH || "";
let bridgeHostKeyCache = { path: "", value: "" };
const OWNER_MAINTENANCE_RUNS_ENABLED = /^(1|true|yes|on)$/i.test(process.env.HERMES_MOBILE_ALLOW_OWNER_MAINTENANCE_RUNS || process.env.HERMES_WEB_ALLOW_OWNER_MAINTENANCE_RUNS || "");
const OWNER_ELEVATION_DURATION_OPTIONS_MINUTES = normalizeOwnerElevationDurations(process.env.HERMES_MOBILE_OWNER_ELEVATION_MINUTES || process.env.HERMES_WEB_OWNER_ELEVATION_MINUTES || "5,15,30,60");
const OWNER_ELEVATION_DEFAULT_MINUTES = OWNER_ELEVATION_DURATION_OPTIONS_MINUTES.includes(15)
  ? 15
  : OWNER_ELEVATION_DURATION_OPTIONS_MINUTES[0];
let ownerElevationGrant = null;
let ownerElevationOnceGrants = new Map();
const OWNER_ELEVATION_ONCE_TTL_MS = Number(process.env.HERMES_MOBILE_OWNER_ELEVATION_ONCE_TTL_MS || process.env.HERMES_WEB_OWNER_ELEVATION_ONCE_TTL_MS || "120000");
const WEB_PUSH_ENABLED = !/^(0|false|no|off)$/i.test(process.env.HERMES_WEB_PUSH_ENABLED || process.env.WEB_PUSH_ENABLED || "1");
const WEB_PUSH_SUBJECT = process.env.WEB_PUSH_SUBJECT || process.env.HERMES_WEB_PUSH_SUBJECT || "mailto:hermes-mobile@example.invalid";
const TODO_WEB_PUSH_ENABLED = !/^(0|false|no|off)$/i.test(process.env.HERMES_WEB_TODO_PUSH_ENABLED || "1");
const TODO_WEB_PUSH_INTERVAL_MS = Number(process.env.HERMES_WEB_TODO_PUSH_INTERVAL_MS || "60000");
const WEB_PUSH_START_DELAY_MS = nonNegativeMilliseconds(
  process.env.HERMES_MOBILE_WEB_PUSH_START_DELAY_MS
  || process.env.HERMES_WEB_WEB_PUSH_START_DELAY_MS,
  120000,
);
const TODO_WEB_PUSH_START_DELAY_MS = nonNegativeMilliseconds(
  process.env.HERMES_MOBILE_TODO_PUSH_START_DELAY_MS
  || process.env.HERMES_WEB_TODO_PUSH_START_DELAY_MS,
  WEB_PUSH_START_DELAY_MS,
);
const TODO_WEB_PUSH_RECENT_CREATE_MINUTES = Number(process.env.HERMES_WEB_TODO_PUSH_RECENT_CREATE_MINUTES || "30");
const TODO_WEB_PUSH_RECEIPT_RETRY_MINUTES = Number(process.env.HERMES_WEB_TODO_PUSH_RECEIPT_RETRY_MINUTES || "3");
const TODO_WEB_PUSH_RECEIPT_RETRY_LIMIT = Number(process.env.HERMES_WEB_TODO_PUSH_RECEIPT_RETRY_LIMIT || "3");
const WEIXIN_DELIVERY_RETRY_LIMIT = Math.max(0, Number(
  process.env.HERMES_MOBILE_WEIXIN_DELIVERY_RETRY_LIMIT
  || process.env.HERMES_WEB_WEIXIN_DELIVERY_RETRY_LIMIT
  || "3",
) || 0);
const WEIXIN_DELIVERY_RETRY_BASE_MS = Math.max(1000, Number(
  process.env.HERMES_MOBILE_WEIXIN_DELIVERY_RETRY_BASE_MS
  || process.env.HERMES_WEB_WEIXIN_DELIVERY_RETRY_BASE_MS
  || "60000",
) || 60000);
const WEIXIN_DELIVERY_RETRY_MAX_MS = Math.max(WEIXIN_DELIVERY_RETRY_BASE_MS, Number(
  process.env.HERMES_MOBILE_WEIXIN_DELIVERY_RETRY_MAX_MS
  || process.env.HERMES_WEB_WEIXIN_DELIVERY_RETRY_MAX_MS
  || "600000",
) || 600000);
const WEIXIN_INGRESS_ATTACHMENT_CONTEXT_WINDOW_MS = Math.max(0, Number(
  process.env.HERMES_MOBILE_WEIXIN_ATTACHMENT_CONTEXT_WINDOW_MS
  || process.env.HERMES_WEB_WEIXIN_ATTACHMENT_CONTEXT_WINDOW_MS
  || "30000",
) || 30000);
const AUTOMATION_WEB_PUSH_ENABLED = !/^(0|false|no|off)$/i.test(process.env.HERMES_WEB_AUTOMATION_PUSH_ENABLED || "1");
const AUTOMATION_WEB_PUSH_INTERVAL_MS = Number(process.env.HERMES_WEB_AUTOMATION_PUSH_INTERVAL_MS || "60000");
const AUTOMATION_WEB_PUSH_START_DELAY_MS = nonNegativeMilliseconds(
  process.env.HERMES_MOBILE_AUTOMATION_PUSH_START_DELAY_MS
  || process.env.HERMES_WEB_AUTOMATION_PUSH_START_DELAY_MS,
  WEB_PUSH_START_DELAY_MS,
);
const SINGLE_WINDOW_CHAT_TASK_GROUP_ID = "chat";
const SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID = "group-chat";
const GROUP_MESSAGE_REVOKED_TEXT = "\u6d88\u606f\u5df2\u64a4\u56de";
const GROUP_AI_REPLY_REVOKED_TEXT = "\u5173\u8054\u7684 AI \u56de\u590d\u5df2\u64a4\u56de";
const SINGLE_WINDOW_PROJECT_ID = "single-window";
const SINGLE_WINDOW_THREAD_TITLE = "Single Window";
const OWNER_LABEL = process.env.HERMES_WEB_OWNER_LABEL || "Owner";
const OWNER_ROOT_FALLBACK_LABEL = process.env.HERMES_WEB_OWNER_ROOT_LABEL || "Hermes Owner";
const OWNER_DRIVE_ROOT_NAMES = normalizeStringList(process.env.HERMES_WEB_OWNER_DRIVE_ROOT_NAMES || "ChatGPT-Drive");
const GENERIC_OWNER_TOPIC_PROJECT_PREFIXES = normalizeStringList(
  process.env.HERMES_WEB_GENERIC_OWNER_PROJECT_PREFIXES || "owner-",
);
const GENERIC_OWNER_TOPIC_PROJECT_IDS = new Set(normalizeStringList(
  process.env.HERMES_WEB_GENERIC_OWNER_PROJECT_IDS || "hermes-sync-folder",
));
const PRINCIPAL_LABEL_PREFIXES = normalizeStringList(
  process.env.HERMES_WEB_PRINCIPAL_LABEL_PREFIXES || (ENABLE_LEGACY_WEIXIN_COMPAT ? "weixin_" : ""),
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
const AUTOMATION_PUSH_DELIVERABLE_LOOKBACK_MS = Number(process.env.HERMES_WEB_AUTOMATION_PUSH_DELIVERABLE_LOOKBACK_MS || String(30 * 60 * 1000));
const AUTOMATION_PUSH_DELIVERABLE_FUTURE_GRACE_MS = Number(process.env.HERMES_WEB_AUTOMATION_PUSH_DELIVERABLE_FUTURE_GRACE_MS || String(30 * 60 * 1000));
const AUTOMATION_PUSH_INITIAL_LOOKBACK_MS = Number(process.env.HERMES_WEB_AUTOMATION_PUSH_INITIAL_LOOKBACK_MS || String(24 * 60 * 60 * 1000));
const MAX_STATE_BACKUPS = Number(process.env.HERMES_WEB_MAX_STATE_BACKUPS || "80");
const STATE_BACKUP_MIN_INTERVAL_MS = Number(process.env.HERMES_WEB_STATE_BACKUP_MIN_INTERVAL_MS || String(10 * 60 * 1000));
const DIRECT_TODO_CREATE_SETTING = String(process.env.HERMES_MOBILE_DIRECT_KANBAN_CREATE || process.env.HERMES_WEB_DIRECT_TODO_CREATE || "").trim();
const BOOT_TRACE_PATH = process.env.HERMES_MOBILE_BOOT_TRACE_PATH || process.env.HERMES_WEB_BOOT_TRACE_PATH || "";

function bootTrace(label) {
  if (!BOOT_TRACE_PATH) return;
  try {
    fs.mkdirSync(path.dirname(BOOT_TRACE_PATH), { recursive: true });
    fs.appendFileSync(BOOT_TRACE_PATH, `${new Date().toISOString()} pid=${process.pid} ${label}\n`, "utf8");
  } catch (_) {}
}

bootTrace("constants ready");

let clients = new Set();
let activeStreams = new Map();
let gatewayRunner = null;
let gatewayPoolProvider = null;
let gatewayUsageTelemetryProvider = null;
let lastStateBackupAt = 0;
let workspaceProjectProvider = null;
const dynamicProjectCache = new Map();
const sourceMarkdownSearchCache = new Map();
let state = null;
let sqliteServiceStore = null;
const runConcurrencyPolicy = createRunConcurrencyPolicy({
  maxGlobal: () => RUN_CONCURRENCY_MAX_GLOBAL,
  maxPerWorkspace: () => RUN_CONCURRENCY_MAX_PER_WORKSPACE,
});
bootTrace("concurrency ready");
const authProvider = createAuthProvider({
  disableAuth: () => DISABLE_AUTH,
  envKey: () => process.env.HERMES_WEB_KEY || "",
  authKeyPath: () => AUTH_KEY_PATH,
  accessKeysPath: () => ACCESS_KEYS_PATH,
  allowMemoryKey: () => /^(1|true|yes|on)$/i.test(process.env.HERMES_WEB_ALLOW_MEMORY_KEY || ""),
  nowIso,
  ensureDataDir,
  findWorkspace,
  workspacePrincipal,
  listWorkspaces: () => loadCatalog().workspaces,
});
bootTrace("auth ready");
const weixinIngressProvider = createWeixinIngressProvider({
  listWorkspaces: () => loadCatalog().workspaces,
  workspaceIdForPrincipal,
  defaultWorkspaceId: () => WEIXIN_INGRESS_DEFAULT_WORKSPACE,
});
bootTrace("ingress ready");
const runtimeConfigProvider = createRuntimeConfigProvider({
  storagePath: () => RUNTIME_CONFIG_PATH,
  ensureDataDir,
  nowIso,
  defaultHermesApiBase: () => HERMES_API_BASE,
  apiKeyPaths: () => HERMES_API_KEY_PATHS,
  envPaths: () => HERMES_ENV_PATHS,
  defaultWebPushSubject: () => WEB_PUSH_SUBJECT,
  defaultWebPushVapidPath: () => WEB_PUSH_VAPID_PATH,
});
bootTrace("runtime config ready");
let clientVersionCache = { mtimeMs: 0, version: "" };
let defaultReasoningCache = { cacheKey: "", value: null };
let webPushConfig = initializeWebPush();
bootTrace("web push ready");
let todoWebPushRunning = false;
let automationWebPushRunning = false;

const filesystemMountProvider = createFilesystemMountProvider({
  wslDistro: WSL_DISTRO,
  windowsHome: WINDOWS_HOME,
  repoRoot: REPO_ROOT,
  dataDir: DATA_DIR,
  volume1WindowsRoot: () => process.env.HERMES_WEB_VOLUME1_WINDOWS_ROOT || "",
  disabledVolume1Shares: () => normalizeStringList(process.env.HERMES_WEB_DISABLED_VOLUME1_WINDOWS_MIRROR_SHARES || ""),
  allowedArtifactRoots: () => String(process.env.HERMES_WEB_ALLOWED_ARTIFACT_ROOTS || ""),
});
bootTrace("filesystem mount ready");

const securityBoundaryProvider = createSecurityBoundaryProvider({
  allowUnrestricted: () => process.env.HERMES_MOBILE_SECURITY_ALLOW_UNRESTRICTED || process.env.HERMES_WEB_SECURITY_ALLOW_UNRESTRICTED || "",
  allowDeveloperToolsets: () => process.env.HERMES_MOBILE_SECURITY_ALLOW_DEVELOPER_TOOLSETS || process.env.HERMES_WEB_SECURITY_ALLOW_DEVELOPER_TOOLSETS || "",
  protectedRoots: () => dedupe([
    REPO_ROOT,
    TOOL_ROOT,
    PUBLIC_ROOT,
    LOCAL_CONFIG_ROOT,
    path.dirname(AUTH_KEY_PATH),
    WINDOWS_HOME ? path.join(WINDOWS_HOME, ".hermes-windows") : "",
    process.env.HERMES_WEB_HERMES_HOME,
    process.env.HERMES_MOBILE_HERMES_HOME,
    process.env.HERMES_WEB_HERMES_REPO,
    process.env.HERMES_MOBILE_HERMES_REPO,
    WSL_HERMES_HOME,
    `${WSL_HOME}/.hermes-update-sandboxes`,
    ...GATEWAY_USAGE_TELEMETRY_PROFILE_ROOTS,
    ...normalizeStringList(process.env.HERMES_MOBILE_SECURITY_PROTECTED_ROOTS || process.env.HERMES_WEB_SECURITY_PROTECTED_ROOTS || ""),
  ].filter(Boolean)),
  protectedFiles: () => dedupe([
    STATE_PATH,
    ACCESS_KEYS_PATH,
    LOCAL_WORKSPACES_PATH,
    RUNTIME_CONFIG_PATH,
    SHARED_DIRECTORIES_PATH,
    AUTH_KEY_PATH,
    WEB_PUSH_VAPID_PATH,
    LOCAL_TODO_STORE_PATH,
    LOCAL_AUTOMATION_STORE_PATH,
    MOBILE_SQLITE_DB_PATH,
    ...WEIXIN_INGRESS_KEY_PATHS,
    ...HERMES_ENV_PATHS,
    ...HERMES_API_KEY_PATHS,
    ...WORKSPACE_USERS_PATHS,
    ...WORKSPACE_ROUTE_MAP_PATHS,
    ...HERMES_CONFIG_PATHS,
    ...GATEWAY_POOL_MANIFEST_PATHS,
    ...GOOGLE_TOKEN_PATHS,
    ...GOOGLE_CLIENT_SECRET_PATHS,
    ...OUTLOOK_GRAPH_TOKEN_PATHS,
    ...GITHUB_CLI_HOSTS_PATHS,
    ...normalizeStringList(process.env.HERMES_MOBILE_SECURITY_PROTECTED_FILES || process.env.HERMES_WEB_SECURITY_PROTECTED_FILES || ""),
  ].filter(Boolean)),
  allowedExceptionRoots: () => dedupe([
    OWNER_DEFAULT_WORKSPACE,
    path.join(DATA_DIR, "drive"),
    path.join(DATA_DIR, "artifacts"),
    path.join(DATA_DIR, "uploads"),
    GROUP_DELIVERIES_DIR,
    CRON_OUTPUT_ROOT,
    CRON_RUN_LOG_ROOT,
    ...normalizeStringList(process.env.HERMES_MOBILE_SECURITY_ALLOWED_EXCEPTIONS || process.env.HERMES_WEB_SECURITY_ALLOWED_EXCEPTIONS || ""),
  ].filter(Boolean)),
});
bootTrace("security boundary ready");

const bridgeCommandProvider = createBridgeCommandProvider({
  wslDistro: () => WSL_DISTRO,
  windowsPathToWsl: (value) => windowsPathToWsl(value),
});
const TODO_BRIDGE_SCRIPT = bridgeCommandProvider.script("HERMES_WEB_TODO_BRIDGE_SCRIPT", DEFAULT_TODO_BRIDGE_SCRIPT);
const CRON_BRIDGE_SCRIPT = bridgeCommandProvider.script("HERMES_WEB_CRON_BRIDGE_SCRIPT", DEFAULT_CRON_BRIDGE_SCRIPT);
const DIRECTORY_BRIDGE_SCRIPT = bridgeCommandProvider.script("HERMES_WEB_DIRECTORY_BRIDGE_SCRIPT", DEFAULT_DIRECTORY_BRIDGE_SCRIPT);
const SKILL_BRIDGE_SCRIPT = bridgeCommandProvider.script("HERMES_WEB_SKILL_BRIDGE_SCRIPT", DEFAULT_SKILL_BRIDGE_SCRIPT);
bootTrace("bridge commands ready");

const sharedDirectoryProvider = createSharedDirectoryProvider({
  storagePath: SHARED_DIRECTORIES_PATH,
  ensureDataDir,
  nowIso,
  readJsonFirst,
  usersPaths: WORKSPACE_USERS_PATHS,
  loadCatalog,
  findWorkspace,
  workspacePrincipal,
  isRootAllowed: (root) => !securityBoundaryProvider.rootConflictsWithProtected(root),
});
bootTrace("shared directories ready");

const accessPolicyProvider = createAccessPolicyProvider({
  uploadCacheRoot: () => path.join(DATA_DIR, "uploads"),
  sharedRoots: (principalId) => sharedDirectoryRoots(principalId),
});
bootTrace("access policy ready");

const projectDiscoveryProvider = createProjectDiscoveryProvider({
  repoRoot: REPO_ROOT,
  singleWindowProjectId: SINGLE_WINDOW_PROJECT_ID,
  singleWindowThreadTitle: SINGLE_WINDOW_THREAD_TITLE,
  ownerDriveRootNames: OWNER_DRIVE_ROOT_NAMES,
  normalizeLocalPath,
  runDirectoryBridge,
  sharedProjectsForWorkspace: sharedDirectoryProjectsForWorkspace,
  workspacePrincipal,
  findWorkspace,
  makeId,
});
bootTrace("project discovery ready");

bootTrace("before loadState");
state = loadState();
bootTrace("after loadState");

const workspaceBindingsProvider = createWorkspaceBindingsProvider({
  interfaceToolsetsJson: () => process.env.HERMES_WEB_WORKSPACE_INTERFACE_TOOLSETS_JSON || "",
  ownerExternalAccessPolicy: () => ownerExternalAccessPolicy(),
  ownerExternalInterfaceBindings: () => ownerExternalInterfaceBindings(),
});
bootTrace("workspace bindings ready");

const displayPathProvider = createDisplayPathProvider({
  ownerDriveRootNames: () => OWNER_DRIVE_ROOT_NAMES,
  ownerRootFallbackLabel: () => OWNER_ROOT_FALLBACK_LABEL,
  normalizeLocalPath: (value) => normalizeLocalPath(value),
});
bootTrace("display paths ready");

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function isUncPath(value) {
  return /^\\\\/.test(String(value || ""));
}

function wslUncPathCandidates(root, ...parts) {
  const allowWslUnc = /^(1|true|yes|on)$/i.test(
    process.env.HERMES_MOBILE_ALLOW_WSL_UNC_PROBES
    || process.env.HERMES_WEB_ALLOW_WSL_UNC_PROBES
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

function loadRuntimeConfig() {
  return runtimeConfigProvider.load();
}

function saveRuntimeConfig(input, actor = "owner") {
  return runtimeConfigProvider.save(input, actor);
}

function effectiveHermesApiBase(config = loadRuntimeConfig()) {
  return runtimeConfigProvider.effectiveHermesApiBase(config);
}

function effectiveWebPushSubject(config = loadRuntimeConfig()) {
  return runtimeConfigProvider.effectiveWebPushSubject(config);
}

function effectiveWebPushVapidPath(config = loadRuntimeConfig()) {
  return runtimeConfigProvider.effectiveWebPushVapidPath(config);
}

function publicRuntimeConfig() {
  return runtimeConfigProvider.publicConfig({
    pushStatus: publicPushStatus(),
    webPushConfig,
    webPushEnabled: WEB_PUSH_ENABLED,
  });
}

function loadHermesApiKey() {
  return runtimeConfigProvider.loadHermesApiKey();
}

function singleGatewayRunner() {
  if (!gatewayRunner) {
    gatewayRunner = createGatewayRunner({
      apiBase: () => effectiveHermesApiBase(),
      apiKey: () => loadHermesApiKey(),
      timeoutMs: () => HERMES_API_TIMEOUT_MS,
    });
  }
  return gatewayRunner;
}

function gatewayPool() {
  if (!gatewayPoolProvider) {
    gatewayPoolProvider = createGatewayPoolProvider({
      enabled: () => GATEWAY_POOL_ENABLED,
      manifestPaths: () => GATEWAY_POOL_MANIFEST_PATHS,
      fallbackApiBase: () => effectiveHermesApiBase(),
      fallbackApiKey: () => loadHermesApiKey(),
      timeoutMs: () => HERMES_API_TIMEOUT_MS,
      healthTimeoutMs: GATEWAY_POOL_HEALTH_TIMEOUT_MS,
      createGatewayRunner,
    });
  }
  return gatewayPoolProvider;
}

function gatewayUsageTelemetry() {
  if (!gatewayUsageTelemetryProvider) {
    gatewayUsageTelemetryProvider = createGatewayUsageTelemetryProvider({
      enabled: () => GATEWAY_USAGE_TELEMETRY_ENABLED,
      profileRoots: () => GATEWAY_USAGE_TELEMETRY_PROFILE_ROOTS,
      manifestPaths: () => GATEWAY_POOL_MANIFEST_PATHS,
    });
  }
  return gatewayUsageTelemetryProvider;
}

async function chooseGatewayRunTarget(hints = {}) {
  return gatewayPool().chooseTarget(hints);
}

function gatewayTargetForRun(runId) {
  const active = activeStreams.get(runId);
  if (active?.gatewayUrl) {
    return {
      apiBase: active.gatewayUrl,
      apiKey: active.gatewayApiKey || "",
      name: active.gatewayName || "",
      profile: active.gatewayProfile || "",
      pooled: active.gatewaySource === "worker_pool",
      source: active.gatewaySource || "",
    };
  }
  const gatewayUrl = gatewayUrlForRun(runId);
  return gatewayPool().targetForGatewayUrl(gatewayUrl);
}

function runConcurrencySnapshot() {
  return runConcurrencyPolicy.snapshot(state?.threads || []);
}

function runConcurrencyError(workspaceId) {
  return runConcurrencyPolicy.limitError(state?.threads || [], workspaceId);
}

function assertRunConcurrencyCapacity(workspaceId) {
  const error = runConcurrencyError(workspaceId);
  if (!error) return;
  const err = new Error(error.message);
  err.status = error.status || 429;
  err.code = error.code;
  err.details = error;
  throw err;
}

function publicReasoningInfoForAuth(auth) {
  const info = defaultReasoningInfo();
  const shared = {
    defaultEffort: info.defaultEffort || "medium",
    efforts: REASONING_EFFORT_OPTIONS,
    assistantLabel: info.assistantLabel || "AI",
    model: {
      default: info.defaultModel || "",
      provider: info.provider || "",
      label: info.assistantLabel || "AI",
    },
  };
  if (isOwnerAuth(auth)) {
    return Object.assign({}, shared, {
      source: info.source || "",
      model: Object.assign({}, shared.model, {
        baseUrl: info.baseUrl || "",
      }),
    });
  }
  return shared;
}

function publicGatewayPoolStatusForAuth(auth, pool) {
  if (isOwnerAuth(auth)) return pool || null;
  if (!pool || typeof pool !== "object") return null;
  const workers = Array.isArray(pool.workers) ? pool.workers : [];
  const includeFinalAssessment = raw.includeFinalAssessment !== false && raw.include_final_assessment !== false;
  if (includeFinalAssessment) {
    const finalQuestionCount = Math.max(5, Math.min(KANBAN_ASSESSMENT_MAX_QUESTIONS, Number(raw.finalQuestionCount || raw.final_question_count || 20) || 20));
    const finalDurationMinutes = Math.max(5, Math.min(180, Number(raw.finalDurationMinutes || raw.final_duration_minutes || 30) || 30));
    const finalPassingScore = Math.max(50, Math.min(100, Number(raw.finalPassingScore || raw.final_passing_score || 80) || 80));
    const finalConfig = {
      schemaVersion: 1,
      kind: "final-study-assessment",
      subject,
      subjectId: normalizeKanbanAssessmentSubjectId(subject),
      learnerName,
      courseLevel: compactText(raw.courseLevel || raw.course_level || "学习计划阶段结束", 80),
      questionCount: finalQuestionCount,
      durationMinutes: finalDurationMinutes,
      passingScore: finalPassingScore,
      difficulty: compactText(raw.finalDifficulty || raw.final_difficulty || "覆盖本阶段全部内容，难度高于每日小测", 160),
      retakeUntilPass: true,
      examIndex: sessions + 1,
      examCount: sessions + 1,
      finalExam: true,
    };
    cards.push({
      clientId: "final-assessment",
      title: `${learnerName}${subject}阶段结束综合考试`,
      day: sessions + 1,
      dueTime: readingPlanDueTime(startDate, timeOfDay, sessions),
      description: compactText([
        `学习计划：${summary}`,
        "最终阶段性考试，不再安排中间阶段测。",
        `题量：${finalQuestionCount} 题`,
        `时长：${finalDurationMinutes} 分钟`,
        `通过线：${finalPassingScore} 分`,
        "考试范围必须覆盖本阶段全部学习内容；未达到通过线时保持重考状态，直到通过为止。",
        sourceText ? `本阶段学习要求：\n${sourceText}` : "",
      ].filter(Boolean).join("\n\n"), 1800),
      caseTemplate: "final-assessment",
      config: finalConfig,
      deliverables: ["阶段综合考卷", "自动评分", "阶段学习成果诊断", "补强与重考建议"],
      acceptance: [
        `完成 ${finalQuestionCount} 题综合考试`,
        `得分达到 ${finalPassingScore}/100`,
        "未达标则继续重考",
        "生成阶段总结报告",
      ],
    });
  }
  return {
    enabled: Boolean(pool.enabled),
    mode: pool.mode || "",
    workerCount: Number(pool.workerCount || workers.length || 0),
    healthy: workers.filter((worker) => worker.healthy === true).length,
  };
}

function publicConcurrencyForAuth(auth) {
  if (isOwnerAuth(auth)) return runConcurrencySnapshot();
  const snapshot = runConcurrencySnapshot();
  const workspaceId = String(auth?.workspaceId || "").trim();
  return {
    maxPerWorkspace: snapshot.maxPerWorkspace,
    activeForWorkspace: workspaceId ? (snapshot.activeByWorkspace[workspaceId] || 0) : 0,
  };
}

function mentionSearchText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function workspaceMentionCandidates(workspace = {}) {
  const policy = workspace.policy && typeof workspace.policy === "object" ? workspace.policy : {};
  return dedupe([
    workspace.id,
    workspace.workspaceId,
    workspace.label,
    workspace.name,
    workspace.displayName,
    workspace.principalId,
    policy.principal_id,
    policy.principal_label,
    ...(Array.isArray(workspace.aliases) ? workspace.aliases : []),
  ].map((item) => String(item || "").trim()).filter(Boolean));
}

function mentionedWorkspaceIdsInText(text) {
  const haystack = mentionSearchText(text);
  if (!haystack) return [];
  const matches = [];
  for (const workspace of loadCatalog().workspaces || []) {
    const workspaceId = String(workspace?.id || "").trim();
    if (!workspaceId) continue;
    for (const candidate of workspaceMentionCandidates(workspace)) {
      const needle = mentionSearchText(candidate);
      if (needle.length < 2) continue;
      if (haystack.includes(needle)) {
        matches.push(workspaceId);
        break;
      }
    }
  }
  return dedupe(matches);
}

function textLooksLikeAutomationWrite(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  const mentionsAutomation = (
    /automation|cron|scheduled?\s+(?:job|task)|timer\s+job/i.test(raw)
    || /\u81ea\u52a8\u5316|\u81ea\u52a8\u4efb\u52a1|\u5b9a\u65f6\u4efb\u52a1|\u5b9a\u65f6|\u89e6\u53d1\u65f6\u95f4|\u8ba1\u5212\u4efb\u52a1/.test(raw)
  );
  const hasWriteAction = (
    /create|add|update|modify|edit|change|delete|remove|pause|resume|enable|disable|reschedule|set/i.test(raw)
    || /\u521b\u5efa|\u65b0\u589e|\u66f4\u65b0|\u4fee\u6539|\u7f16\u8f91|\u6539\u4e3a|\u8c03\u6574|\u5220\u9664|\u79fb\u9664|\u6682\u505c|\u6062\u590d|\u542f\u7528|\u7981\u7528|\u8bbe\u7f6e|\u6539\u5230|\u6539\u6210/.test(raw)
  );
  return mentionsAutomation && hasWriteAction;
}

function classifyAutomationAdminIntentForRun(text, options = {}) {
  const actorWorkspaceId = String(options.actorWorkspaceId || options.actor_workspace_id || "").trim();
  let mentionedWorkspaceIds = [];
  if (textLooksLikeAutomationWrite(text)) {
    mentionedWorkspaceIds = mentionedWorkspaceIdsInText(text);
    if (mentionedWorkspaceIds.some((workspaceId) => workspaceId && workspaceId !== actorWorkspaceId)) {
      return {
        category: "automation_admin_write",
        elevationRequired: true,
        elevationScope: "automation_admin_write",
        message: "This looks like a cross-account automation management request. Confirm elevation to route this one run to an Owner maintenance Gateway.",
      };
    }
  }
  const classification = securityBoundaryProvider.classifyAutomationAdminWriteIntent(text);
  if (!classification) return null;
  if (mentionedWorkspaceIds.length && !mentionedWorkspaceIds.some((workspaceId) => workspaceId !== actorWorkspaceId)) return null;
  return classification;
}

function gatewayRoutingForModelRun(auth, text, options = {}) {
  const explicitMaintenance = Boolean(options.maintenanceMode || options.maintenance_mode);
  if (explicitMaintenance) {
    const onceToken = options.ownerElevationOnceToken || options.owner_elevation_once_token || "";
    if (consumeOwnerElevationOnce(auth, onceToken) || isOwnerElevationActive(auth)) {
      return {
        securityLevel: "owner-maintenance",
        maintenance: true,
        maintenanceCategory: options.elevationScope || options.elevation_scope || "owner_high_privilege",
      };
    }
    const err = new Error("Owner high-privilege authorization is not active. Use the Owner navigation permission control before running this request.");
    err.status = isOwnerAuth(auth) ? 409 : 403;
    err.code = "owner_high_privilege_required";
    err.operatorRequired = true;
    err.elevationRequired = Boolean(isOwnerAuth(auth));
    err.elevationScope = options.elevationScope || options.elevation_scope || "owner_high_privilege";
    throw err;
  }
  const classification = securityBoundaryProvider.classifyMaintenanceIntent(text)
    || classifyAutomationAdminIntentForRun(text, options)
    || securityBoundaryProvider.classifySharedSkillWriteIntent(text);
  if (!classification) return { securityLevel: "user", maintenance: false };
  const err = new Error(classification.message);
  err.status = isOwnerAuth(auth) ? 409 : 403;
  err.code = classification.category;
  err.operatorRequired = true;
  err.elevationRequired = Boolean(isOwnerAuth(auth) && classification.elevationRequired);
  err.elevationScope = classification.elevationScope || classification.category;
  throw err;
}

function sharedSkillElevationInstructions(options = {}) {
  const scope = String(options.elevationScope || options.elevation_scope || "").trim();
  if (scope !== "shared_skill_write") return "";
  return [
    "APPROVED OWNER ELEVATION: this run is allowed to create or update a shared/system Skill only.",
    "If a Skill should be available to all workspaces, place it in the shared Skill namespace, for example `shared/<skill-id>/SKILL.md`, through the current official Hermes Skill store.",
    "Do not modify unrelated Skills, runtime secrets, product source, worker manifests, or user-private workspace files.",
    "If the requested Skill is actually private to one workspace, do not use this elevated shared scope.",
  ].join("\n");
}

function ownerElevationInstructions(options = {}) {
  const scope = String(options.elevationScope || options.elevation_scope || "").trim();
  if (scope === "owner_high_privilege") {
    return [
      "APPROVED OWNER HIGH-PRIVILEGE RUN: this run is routed to an Owner maintenance Gateway because the Owner explicitly authorized high-privilege execution in Hermes Mobile.",
      "Use elevated tools only for the latest user request. Do not make unrelated changes, expose raw secrets, print keys/tokens, or modify worker manifests/runtime configuration unless the user explicitly requested that exact maintenance action.",
      "Image editing, object removal, background cleanup, P image requests, and erase/inpainting requests inside the current workspace are ordinary user work, not maintenance work. Even in an elevated run, use ChatGPT Image 2 image editing tools when available; do not use local PIL/OpenCV/rembg/SAM/ffmpeg/terminal/code image repair unless the user explicitly asks for local image processing.",
      "If the requested target is ambiguous, stop and ask for clarification instead of guessing.",
    ].join("\n");
  }
  if (scope === "shared_skill_write") return sharedSkillElevationInstructions(options);
  if (scope === "automation_admin_write") {
    return [
      "APPROVED OWNER ELEVATION: this run is allowed to inspect and update the Automation/CRON job explicitly requested in the latest user message.",
      "Limit the operation to the named target account/workspace and named automation job. Do not modify unrelated jobs, Access Keys, runtime secrets, worker manifests, product source, or user-private files.",
      "If the exact target job is ambiguous, stop and ask for clarification instead of guessing.",
      "Report the old schedule and new schedule in the final receipt.",
    ].join("\n");
  }
  return "";
}

function sanitizeElevationScope(value) {
  const scope = String(value || "").trim();
  if (/^[A-Za-z][A-Za-z0-9_-]{0,80}$/.test(scope)) return scope;
  return "owner_high_privilege";
}

function parsePermissionApprovalMarker(text) {
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    const markerIndex = line.indexOf(PERMISSION_APPROVAL_MARKER);
    if (markerIndex < 0) continue;
    const trailing = line.slice(markerIndex + PERMISSION_APPROVAL_MARKER.length).trim();
    let parsed = {};
    if (trailing.startsWith("{")) {
      try {
        parsed = JSON.parse(trailing);
      } catch (_) {
        parsed = {};
      }
    }
    return {
      elevationRequired: true,
      elevationScope: sanitizeElevationScope(parsed.scope || parsed.elevationScope || "owner_high_privilege"),
      elevationReason: compactText(parsed.reason || parsed.message || "Model permission boundary requested Owner approval.", 240),
      elevationSource: "model_permission_boundary",
    };
  }
  return null;
}

function stripPermissionApprovalMarkers(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => !line.includes(PERMISSION_APPROVAL_MARKER))
    .join("\n")
    .trim();
}

function inferPermissionApprovalRequest(text) {
  const raw = String(text || "");
  if (!raw.trim()) return null;
  const permissionDenied = (
    /outside\s+(?:the\s+)?current\s+(?:workspace\/Gateway\s+)?permission\s+scope/i.test(raw)
    || /permission\s+boundary|access_policy_context|current\s+Gateway\s+permission/i.test(raw)
    || /当前.*权限|权限范围|权限边界|超出.*权限|不在.*权限|无法访问.*路径/.test(raw)
  );
  const elevationHint = (
    /Owner|approval|approve|elevation|maintenance|high[-_\s]?privilege/i.test(raw)
    || /提权|高权限|批准|授权|Owner/.test(raw)
  );
  if (!permissionDenied || !elevationHint) return null;
  return {
    elevationRequired: true,
    elevationScope: "owner_high_privilege",
    elevationReason: compactText(raw.replace(/\s+/g, " ").trim(), 240),
    elevationSource: "model_permission_boundary_heuristic",
  };
}

function modelPermissionApprovalRequest(text, message = {}) {
  const routing = message.runOptions?.gatewayRouting || {};
  if (routing.maintenance || routing.allowMaintenance || routing.allow_maintenance) return null;
  const markerRequest = parsePermissionApprovalMarker(text);
  return markerRequest || inferPermissionApprovalRequest(text);
}

function precedingUserMessageForAssistant(thread, assistantMessage) {
  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  const index = messages.findIndex((item) => String(item.id || "") === String(assistantMessage?.id || ""));
  for (let i = (index >= 0 ? index - 1 : messages.length - 1); i >= 0; i -= 1) {
    const candidate = messages[i];
    if (!candidate || candidate.role !== "user") continue;
    if (assistantMessage?.taskGroupId && candidate.taskGroupId !== assistantMessage.taskGroupId) continue;
    return candidate;
  }
  return null;
}

function gatewaySkillRoutingForWorkspace(workspaceId, routing = {}) {
  if (GATEWAY_SKILL_PROFILE_ROUTING === "off") return {};
  const securityLevel = String(routing.securityLevel || routing.security_level || "user").trim();
  const maintenance = Boolean(routing.maintenance || routing.allowMaintenance || routing.allow_maintenance);
  if (maintenance || /^owner[-_]maintenance$/i.test(securityLevel)) return {};
  const skillWorkspaceId = String(workspaceId || "").trim();
  if (!skillWorkspaceId) return {};
  const hints = { skillWorkspaceId };
  if (GATEWAY_SKILL_PROFILE_ROUTING === "on") hints.requireSkillProfile = true;
  return hints;
}

function isOwnerMaintenanceGatewayRouting(routing = {}) {
  const securityLevel = String(routing.securityLevel || routing.security_level || "").trim();
  return Boolean(routing.maintenance || routing.allowMaintenance || routing.allow_maintenance || /^owner[-_]maintenance$/i.test(securityLevel));
}

function accessPolicyHardeningOptionsForGatewayRouting(routing = {}) {
  const allowMaintenanceTools = isOwnerMaintenanceGatewayRouting(routing);
  return {
    allowUnrestricted: allowMaintenanceTools,
    allowDeveloperToolsets: allowMaintenanceTools,
  };
}

function ownerSetupStatus() {
  return authProvider.ownerSetupStatus();
}

function createInitialOwnerKey() {
  return authProvider.createInitialOwnerKey();
}

function getUrl(req) {
  return new URL(req.url, `http://${req.headers.host || "localhost"}`);
}

function workspaceIdSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function workspaceIdFromUsername(value) {
  const raw = String(value || "").trim();
  const slug = workspaceIdSlug(raw);
  if (slug) return slug;
  if (!raw) return "";
  return `user-${hashValue(raw).slice(0, 8)}`;
}

function titleCaseWorkspaceId(value) {
  const parts = String(value || "")
    .replace(/^user[-_]+/i, "")
    .split(/[-_\s.]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.map((part) => {
    if (part.length <= 2) return part.toUpperCase();
    return `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`;
  }).join(" ");
}

function defaultWorkspaceLabel(value, workspaceId) {
  const raw = String(value || "").trim();
  if (raw && /[^\x00-\x7F]/.test(raw)) return raw.slice(0, 80);
  return titleCaseWorkspaceId(raw || workspaceId) || workspaceId || "User";
}

function safeWorkspaceFolderName(value, fallback = "workspace") {
  const text = String(value || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 80);
  return text || fallback;
}

function localWorkspaceDefaults(input = {}, previous = {}) {
  const username = String(input.username || input.userName || input.workspaceId || input.workspace_id || input.id || previous.id || "").trim();
  const id = workspaceIdFromUsername(input.workspaceId || input.workspace_id || input.id || username) || previous.id || "";
  const label = String(input.label || input.name || "").trim()
    || String(previous.label || "").trim()
    || defaultWorkspaceLabel(username, id);
  const folderName = safeWorkspaceFolderName(label, id || "workspace");
  const defaultWorkspace = String(input.defaultWorkspace || input.default_workspace || input.root || previous.defaultWorkspace || "").trim()
    || path.join(OWNER_DEFAULT_WORKSPACE, folderName);
  const allowedRoots = normalizeStringList(
    input.allowedRoots
      || input.allowed_roots
      || input.root
      || input.defaultWorkspace
      || input.default_workspace
      || previous.allowedRoots
      || defaultWorkspace,
  );
  if (securityBoundaryProvider?.rootConflictsWithProtected(defaultWorkspace)) {
    const err = new Error("Workspace root is blocked by the Hermes Mobile security boundary");
    err.status = 403;
    throw err;
  }
  const safeAllowedRoots = securityBoundaryProvider?.filterRoots(allowedRoots) || allowedRoots;
  if (allowedRoots.length && !safeAllowedRoots.length) {
    const err = new Error("Workspace allowed roots are blocked by the Hermes Mobile security boundary");
    err.status = 403;
    throw err;
  }
  return {
    workspaceId: id,
    label,
    defaultWorkspace,
    allowedRoots: safeAllowedRoots.length ? safeAllowedRoots : [defaultWorkspace],
    allowedToolsets: normalizeStringList(input.allowedToolsets || input.allowed_toolsets || previous.allowedToolsets || []),
    connectorProfiles: normalizeStringMap(input.connectorProfiles || input.connector_profiles || previous.connectorProfiles || {}),
  };
}

function normalizeLocalWorkspaceRecord(record) {
  const source = record && typeof record === "object" ? record : {};
  const id = workspaceIdSlug(source.id || source.workspaceId || source.workspace_id);
  if (!id || id === "owner") return null;
  const label = String(source.label || source.name || id).trim() || id;
  const defaultWorkspace = String(source.defaultWorkspace || source.default_workspace || source.root || "").trim();
  const allowedRoots = normalizeStringList(source.allowedRoots || source.allowed_roots || defaultWorkspace);
  if (securityBoundaryProvider?.rootConflictsWithProtected(defaultWorkspace)) return null;
  const safeAllowedRoots = securityBoundaryProvider?.filterRoots(allowedRoots) || allowedRoots;
  return {
    id,
    label,
    accessMode: String(source.accessMode || source.access_mode || "restricted").trim() || "restricted",
    defaultWorkspace,
    allowedRoots: safeAllowedRoots,
    aliases: normalizeStringList(source.aliases),
    allowedToolsets: normalizeStringList(source.allowedToolsets || source.allowed_toolsets),
    connectorProfiles: normalizeStringMap(source.connectorProfiles || source.connector_profiles),
    createdAt: String(source.createdAt || ""),
    updatedAt: String(source.updatedAt || source.createdAt || ""),
    createdBy: String(source.createdBy || "owner"),
  };
}

function normalizeLocalWorkspaceStore(value) {
  const source = value && typeof value === "object" ? value : {};
  const raw = Array.isArray(source.workspaces) ? source.workspaces : [];
  const workspaces = [];
  const seen = new Set();
  for (const item of raw) {
    const record = normalizeLocalWorkspaceRecord(item);
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    workspaces.push(record);
  }
  return {
    schemaVersion: 1,
    workspaces,
    updatedAt: String(source.updatedAt || ""),
  };
}

function loadLocalWorkspaceStore() {
  ensureDataDir();
  try {
    return normalizeLocalWorkspaceStore(JSON.parse(fs.readFileSync(LOCAL_WORKSPACES_PATH, "utf8")));
  } catch (_) {
    return normalizeLocalWorkspaceStore({});
  }
}

function saveLocalWorkspaceStore(store) {
  ensureDataDir();
  const normalized = normalizeLocalWorkspaceStore(Object.assign({}, store, { updatedAt: nowIso() }));
  fs.writeFileSync(LOCAL_WORKSPACES_PATH, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

function localWorkspaceRecords() {
  return loadLocalWorkspaceStore().workspaces || [];
}

function upsertLocalWorkspace(input, actor = "owner") {
  const rawId = input.workspaceId || input.workspace_id || input.id || "";
  const id = workspaceIdFromUsername(rawId || input.username || input.userName);
  if (!id) {
    const err = new Error("Workspace id is required");
    err.status = 400;
    throw err;
  }
  if (id === "owner") {
    const err = new Error("Owner workspace already exists");
    err.status = 409;
    throw err;
  }
  const existing = findWorkspace(id);
  if (existing && existing.source !== "local-workspace") {
    const err = new Error("Workspace id is already managed by the external workspace provider");
    err.status = 409;
    throw err;
  }
  const now = nowIso();
  const store = loadLocalWorkspaceStore();
  const previous = store.workspaces.find((item) => item.id === id) || {};
  const defaults = localWorkspaceDefaults(Object.assign({}, input, { workspaceId: id }), previous);
  const record = normalizeLocalWorkspaceRecord(Object.assign({}, previous, input, {
    id,
    label: defaults.label,
    defaultWorkspace: defaults.defaultWorkspace,
    allowedRoots: defaults.allowedRoots,
    allowedToolsets: defaults.allowedToolsets,
    connectorProfiles: defaults.connectorProfiles,
    createdAt: previous.createdAt || now,
    updatedAt: now,
    createdBy: previous.createdBy || actor || "owner",
  }));
  if (!record) {
    const err = new Error("Invalid workspace");
    err.status = 400;
    throw err;
  }
  const next = store.workspaces.filter((item) => item.id !== id);
  next.push(record);
  saveLocalWorkspaceStore(Object.assign({}, store, { workspaces: next }));
  invalidateCatalogCache();
  dynamicProjectCache.delete(id);
  return record;
}

function deleteLocalWorkspace(workspaceId) {
  const id = workspaceIdSlug(workspaceId);
  if (!id || id === "owner") {
    const err = new Error("Invalid workspace");
    err.status = 400;
    throw err;
  }
  const workspace = findWorkspace(id);
  if (workspace && workspace.source !== "local-workspace") {
    const err = new Error("Workspace is managed by the external workspace provider");
    err.status = 409;
    throw err;
  }
  const store = loadLocalWorkspaceStore();
  const previousCount = store.workspaces.length;
  const next = store.workspaces.filter((item) => item.id !== id);
  if (next.length === previousCount) {
    const err = new Error("Local workspace not found");
    err.status = 404;
    throw err;
  }
  saveLocalWorkspaceStore(Object.assign({}, store, { workspaces: next }));
  authProvider.deleteWorkspaceAccessKey(id);
  invalidateCatalogCache();
  dynamicProjectCache.delete(id);
  return { id };
}

function authenticateRequest(req) {
  return authProvider.authenticateRequest(req);
}

function isAuthorized(req) {
  return authenticateRequest(req).ok;
}

function isOwnerAuth(auth) {
  return authProvider.isOwnerAuth(auth);
}

function currentOwnerElevationGrant(now = Date.now()) {
  if (!ownerElevationGrant || !ownerElevationGrant.expiresAtMs || ownerElevationGrant.expiresAtMs <= now) {
    ownerElevationGrant = null;
    return null;
  }
  return ownerElevationGrant;
}

function isOwnerElevationActive(auth) {
  return Boolean(isOwnerAuth(auth) && OWNER_MAINTENANCE_RUNS_ENABLED && currentOwnerElevationGrant());
}

function pruneOwnerElevationOnceGrants(now = Date.now()) {
  for (const [token, grant] of ownerElevationOnceGrants.entries()) {
    if (!grant?.expiresAtMs || grant.expiresAtMs <= now) ownerElevationOnceGrants.delete(token);
  }
}

function grantOwnerElevationOnce(auth) {
  if (!isOwnerAuth(auth)) {
    const err = new Error("Owner access is required");
    err.status = 403;
    throw err;
  }
  if (!OWNER_MAINTENANCE_RUNS_ENABLED) {
    const err = new Error("Owner maintenance runs are disabled by server configuration");
    err.status = 409;
    throw err;
  }
  pruneOwnerElevationOnceGrants();
  const token = crypto.randomBytes(24).toString("base64url");
  const grantedAtMs = Date.now();
  const ttlMs = Math.max(30_000, OWNER_ELEVATION_ONCE_TTL_MS || 120_000);
  const grant = {
    token,
    grantedAt: new Date(grantedAtMs).toISOString(),
    expiresAt: new Date(grantedAtMs + ttlMs).toISOString(),
    expiresAtMs: grantedAtMs + ttlMs,
    grantedBy: auth.principalId || auth.workspaceId || "owner",
  };
  ownerElevationOnceGrants.set(token, grant);
  return grant;
}

function consumeOwnerElevationOnce(auth, token) {
  if (!isOwnerAuth(auth) || !OWNER_MAINTENANCE_RUNS_ENABLED) return false;
  const normalized = String(token || "").trim();
  if (!normalized) return false;
  pruneOwnerElevationOnceGrants();
  const grant = ownerElevationOnceGrants.get(normalized);
  if (!grant) return false;
  const principal = auth.principalId || auth.workspaceId || "owner";
  if (grant.grantedBy && grant.grantedBy !== principal) return false;
  ownerElevationOnceGrants.delete(normalized);
  return true;
}

function publicOwnerElevationStatus(auth) {
  const owner = isOwnerAuth(auth);
  const grant = owner ? currentOwnerElevationGrant() : null;
  const remainingMs = grant ? Math.max(0, grant.expiresAtMs - Date.now()) : 0;
  return {
    available: Boolean(owner && OWNER_MAINTENANCE_RUNS_ENABLED),
    active: Boolean(grant),
    currentPermission: grant ? "owner-maintenance" : "standard",
    label: grant ? "高权限运行" : "普通权限",
    expiresAt: grant?.expiresAt || "",
    grantedAt: grant?.grantedAt || "",
    remainingMs,
    durationOptionsMinutes: OWNER_ELEVATION_DURATION_OPTIONS_MINUTES.slice(),
    defaultDurationMinutes: OWNER_ELEVATION_DEFAULT_MINUTES,
    reason: !owner
      ? "Owner access is required"
      : (OWNER_MAINTENANCE_RUNS_ENABLED ? "" : "Owner maintenance runs are disabled by server configuration"),
  };
}

function grantOwnerElevation(auth, durationMinutes) {
  if (!isOwnerAuth(auth)) {
    const err = new Error("Owner access is required");
    err.status = 403;
    throw err;
  }
  if (!OWNER_MAINTENANCE_RUNS_ENABLED) {
    const err = new Error("Owner maintenance runs are disabled by server configuration");
    err.status = 409;
    throw err;
  }
  const requested = Math.round(Number(durationMinutes || OWNER_ELEVATION_DEFAULT_MINUTES));
  if (!OWNER_ELEVATION_DURATION_OPTIONS_MINUTES.includes(requested)) {
    const err = new Error("Unsupported owner elevation duration");
    err.status = 400;
    throw err;
  }
  const grantedAtMs = Date.now();
  const expiresAtMs = grantedAtMs + requested * 60 * 1000;
  ownerElevationGrant = {
    grantedAt: new Date(grantedAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    expiresAtMs,
    durationMinutes: requested,
    grantedBy: auth.principalId || auth.workspaceId || "owner",
  };
  return ownerElevationGrant;
}

function revokeOwnerElevation(auth) {
  if (!isOwnerAuth(auth)) {
    const err = new Error("Owner access is required");
    err.status = 403;
    throw err;
  }
  ownerElevationGrant = null;
}

function authCanAccessWorkspace(auth, workspaceId) {
  return authProvider.authCanAccessWorkspace(auth, workspaceId);
}

function chatGroupMemberWorkspaceIds(thread) {
  if (!thread?.singleWindow) return [];
  const group = normalizeChatGroup(thread.chatGroup || {}, thread.workspaceId);
  return group.enabled ? group.memberWorkspaceIds : [];
}

function messageContainsArtifact(message, artifact) {
  const artifactId = String(artifact?.id || "");
  if (!message || !artifactId) return false;
  return (message.artifacts || []).some((item) => String(item?.id || "") === artifactId);
}

function groupChatArtifactAccessibleToAuth(auth, thread, artifact) {
  if (!auth?.ok || !auth.workspaceId || !thread?.singleWindow) return false;
  if (!chatGroupMemberWorkspaceIds(thread).includes(auth.workspaceId)) return false;
  const message = (thread.messages || []).find((item) => String(item?.id || "") === String(artifact?.messageId || ""));
  return Boolean(message?.taskGroupId === SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID && messageContainsArtifact(message, artifact));
}

function artifactAccessibleToAuth(auth, thread, artifact) {
  if (authCanAccessWorkspace(auth, thread?.workspaceId || "")) return true;
  return groupChatArtifactAccessibleToAuth(auth, thread, artifact);
}

function findArtifactReference(artifact) {
  const artifactId = String(artifact?.id || "");
  if (!artifactId) return null;
  for (const thread of state.threads || []) {
    for (const message of thread.messages || []) {
      if (messageContainsArtifact(message, artifact)) return { thread, message };
    }
  }
  return null;
}

function findArtifactReferenceById(artifactId) {
  const id = String(artifactId || "");
  if (!id) return null;
  for (const thread of state.threads || []) {
    for (const message of thread.messages || []) {
      const artifact = (message.artifacts || []).find((item) => String(item?.id || "") === id);
      if (artifact) return { thread, message, artifact };
    }
  }
  return null;
}

function resolveArtifactPathFromMessage(artifact, message) {
  const name = String(artifact?.name || "").trim();
  const candidates = extractArtifactPaths(message?.content || "")
    .map((rawPath) => {
      const localPath = normalizeLocalPath(rawPath);
      return { rawPath, localPath };
    })
    .filter((candidate) => candidate.localPath && fs.existsSync(candidate.localPath));
  if (!candidates.length) return null;
  if (name) {
    const matched = candidates.find((candidate) => path.basename(candidate.localPath) === name || path.basename(candidate.rawPath) === name);
    if (matched) return matched;
  }
  return candidates.length === 1 ? candidates[0] : null;
}

function threadAccessibleToAuth(auth, thread) {
  if (!thread) return false;
  if (authCanAccessWorkspace(auth, thread.workspaceId)) return true;
  if (!auth?.ok || !auth.workspaceId) return false;
  return chatGroupMemberWorkspaceIds(thread).includes(auth.workspaceId);
}

function pushWorkspaceForAuth(auth, requestedWorkspaceId = "owner") {
  const requested = String(requestedWorkspaceId || auth?.workspaceId || "owner").trim() || "owner";
  if (isOwnerAuth(auth)) return findWorkspace(requested) ? requested : "owner";
  return String(auth?.workspaceId || requestedWorkspaceId || "owner").trim() || "owner";
}

function publicWorkspacesForAuth(auth) {
  const workspaces = loadCatalog().workspaces;
  if (isOwnerAuth(auth)) return workspaces;
  return workspaces.filter((workspace) => workspace.id === auth?.workspaceId);
}

function requireOwner(req, res) {
  const auth = authenticateRequest(req);
  if (!isOwnerAuth(auth)) {
    sendJson(res, 403, { error: "Owner access is required" });
    return null;
  }
  return auth;
}

function requireWorkspaceAccess(req, res, workspaceId) {
  const id = String(workspaceId || "owner").trim() || "owner";
  if (!findWorkspace(id)) {
    sendJson(res, 400, { error: "Unknown workspace" });
    return "";
  }
  if (!authCanAccessWorkspace(authenticateRequest(req), id)) {
    sendJson(res, 403, { error: "Workspace access is not allowed" });
    return "";
  }
  return id;
}

function threadAccessibleToRequest(req, thread) {
  return threadAccessibleToAuth(authenticateRequest(req), thread);
}

function findThreadForRequest(req, threadId) {
  const thread = state.threads.find((item) => item.id === String(threadId || ""));
  return threadAccessibleToRequest(req, thread) ? thread : null;
}

function findThreadForAuth(auth, threadId) {
  const thread = state.threads.find((item) => item.id === String(threadId || ""));
  return threadAccessibleToAuth(auth, thread) ? thread : null;
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(OWNER_DEFAULT_WORKSPACE, { recursive: true });
}

function ensureStateBackupDir() {
  fs.mkdirSync(STATE_BACKUP_DIR, { recursive: true });
}

function defaultState() {
  return {
    schemaVersion: 1,
    threads: [],
    artifacts: [],
    pushSubscriptions: [],
    pushReceipts: [],
    pushDeliveries: [],
    automationPushMarks: {},
  };
}

function loadState() {
  bootTrace("loadState enter");
  ensureDataDir();
  bootTrace("loadState ensured data dir");
  if (useSqliteServiceStore()) return loadStateFromSqlite();
  bootTrace("loadState json mode");
  let raw = "";
  let parsed = null;
  try {
    raw = fs.readFileSync(STATE_PATH, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") {
      const fresh = defaultState();
      writeStateFile(fresh);
      return fresh;
    }
    throw err;
  }
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    backupStateFile("parse-failed", { force: true, rawFallback: true });
    console.error(`Hermes Mobile state parse failed; wrote fresh state after backup: ${err.message || String(err)}`);
    const fresh = defaultState();
    writeStateFile(fresh);
    return fresh;
  }
  backupStateFile("startup", { force: true });
  try {
      const normalized = normalizeState(parsed, { skipCatalogLookups: true });
    if (pushSubscriptionScopeSignature(parsed.pushSubscriptions) !== pushSubscriptionScopeSignature(normalized.pushSubscriptions)) {
      saveState(normalized, { reason: "normalize-push-subscriptions" });
    }
    return normalized;
  } catch (err) {
    backupStateFile("normalize-failed", { force: true, rawFallback: true });
    throw err;
  }
}

function loadStateFromSqlite() {
  bootTrace("loadState sqlite enter");
  const store = mobileSqliteStore();
  bootTrace("loadState sqlite store ready");
  const counts = store.runtimeStateCounts();
  bootTrace(`loadState sqlite counts ${JSON.stringify(counts)}`);
  const hasRuntimeRows = Object.values(counts).some((value) => Number(value || 0) > 0);
  if (!hasRuntimeRows) {
    bootTrace("loadState sqlite empty runtime");
    const existing = readStateFileIfValid();
    if (existing) {
      bootTrace("loadState sqlite import state-file source");
      backupStateFile("sqlite-import-source", { force: true });
      const normalized = normalizeState(existing, { skipCatalogLookups: true });
      bootTrace("loadState sqlite state-file normalized");
      store.replaceRuntimeState(normalized);
      bootTrace("loadState sqlite state-file imported");
      writeStateFile(normalized);
      bootTrace("loadState sqlite state-file snapshot written");
      return normalized;
    }
    const fresh = defaultState();
    bootTrace("loadState sqlite writing fresh state");
    store.replaceRuntimeState(fresh);
    bootTrace("loadState sqlite fresh imported");
    writeStateFile(fresh);
    bootTrace("loadState sqlite fresh snapshot written");
    return fresh;
  }
  bootTrace("loadState sqlite before exportRuntimeState");
  const exported = store.exportRuntimeState();
  bootTrace("loadState sqlite after exportRuntimeState");
  const normalized = normalizeState(exported, { skipCatalogLookups: true });
  bootTrace("loadState sqlite after normalizeState");
  writeStateFile(normalized);
  bootTrace("loadState sqlite snapshot written");
  return normalized;
}

function normalizeState(value, options = {}) {
  const next = value && typeof value === "object" ? value : {};
  bootTrace("normalizeState start");
  const threads = Array.isArray(next.threads) ? next.threads.map((thread) => normalizeThread(thread, options)) : [];
  bootTrace(`normalizeState threads ${threads.length}`);
  const pushSubscriptions = Array.isArray(next.pushSubscriptions) ? next.pushSubscriptions.map((item) => normalizePushSubscription(item, options)).filter(Boolean) : [];
  bootTrace(`normalizeState pushSubscriptions ${pushSubscriptions.length}`);
  const pushReceipts = Array.isArray(next.pushReceipts) ? next.pushReceipts.map(normalizePushReceipt).filter(Boolean).slice(-200) : [];
  bootTrace(`normalizeState pushReceipts ${pushReceipts.length}`);
  const pushDeliveries = Array.isArray(next.pushDeliveries) ? next.pushDeliveries.map(normalizePushDelivery).filter(Boolean).slice(-200) : [];
  bootTrace(`normalizeState pushDeliveries ${pushDeliveries.length}`);
  return {
    schemaVersion: 1,
    threads,
    artifacts: Array.isArray(next.artifacts) ? next.artifacts : [],
    pushSubscriptions,
    pushReceipts,
    pushDeliveries,
    automationPushMarks: next.automationPushMarks && typeof next.automationPushMarks === "object" && !Array.isArray(next.automationPushMarks)
      ? next.automationPushMarks
      : {},
  };
}

function normalizePushDelivery(item) {
  if (!item || typeof item !== "object") return null;
  const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  const result = item.result && typeof item.result === "object" ? item.result : {};
  return {
    id: String(item.id || makeId("pushdel")).slice(0, 80),
    sentAt: String(item.sentAt || nowIso()),
    title: String(payload.title || item.title || "").slice(0, 160),
    tag: String(payload.tag || item.tag || "").slice(0, 240),
    messageType: String(data.messageType || item.messageType || "").slice(0, 80),
    principalIds: normalizeStringList(item.principalIds || item.principalId || []),
    workspaceId: String(data.workspaceId || item.workspaceId || "").slice(0, 120),
    taskGroupId: String(data.taskGroupId || "").slice(0, 120),
    messageId: String(data.messageId || "").slice(0, 120),
    todoId: String(data.todoId || "").slice(0, 120),
    automationId: String(data.automationId || "").slice(0, 120),
    attempted: Number(result.attempted || item.attempted || 0),
    sent: Number(result.sent || item.sent || 0),
    failed: Number(result.failed || item.failed || 0),
    removed: Number(result.removed || item.removed || 0),
  };
}

function normalizePushReceipt(item) {
  if (!item || typeof item !== "object") return null;
  const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  const notification = item.notification && typeof item.notification === "object" ? item.notification : {};
  return {
    id: String(item.id || makeId("receipt")),
    receivedAt: String(item.receivedAt || nowIso()),
    version: String(item.version || "").slice(0, 80),
    foreground: Boolean(item.foreground),
    shown: notification.shown !== false,
    error: String(notification.error || "").slice(0, 500),
    title: String(payload.title || "").slice(0, 160),
    tag: String(payload.tag || "").slice(0, 240),
    markKey: String(data.markKey || item.markKey || "").slice(0, 240),
    todoId: String(data.todoId || item.todoId || "").slice(0, 120),
    testId: String(data.testId || item.testId || "").slice(0, 120),
    messageType: String(data.messageType || item.messageType || "").slice(0, 80),
    principalId: String(data.principalId || item.principalId || "").slice(0, 120),
    workspaceId: String(data.workspaceId || item.workspaceId || "").slice(0, 120),
    url: String(data.url || "").slice(0, 500),
  };
}

function normalizePushSubscription(item, options = {}) {
  if (!item || typeof item !== "object") return null;
  const subscription = item.subscription && typeof item.subscription === "object" ? item.subscription : item;
  const endpoint = String(subscription.endpoint || item.endpoint || "").trim();
  if (!endpoint) return null;
  const now = nowIso();
  const workspaceIds = normalizeStringList(item.workspaceIds || item.workspaceId || item.workspaces);
  const principalIds = normalizeStringList(item.principalIds || item.principalId || item.principals || (workspaceIds.length ? workspacePrincipal(workspaceIds[0]) : "owner"));
  const scopedPrincipalIds = scopedPushPrincipalIds(principalIds);
  const scopedWorkspaceIds = scopedPushWorkspaceIds(scopedPrincipalIds[0], workspaceIds, options);
  return {
    id: String(item.id || `push_${hashValue(endpoint).slice(0, 16)}`),
    endpointHash: hashValue(endpoint),
    subscription,
    deviceLabel: String(item.deviceLabel || "").slice(0, 120),
    userAgent: String(item.userAgent || "").slice(0, 240),
    principalIds: scopedPrincipalIds,
    workspaceIds: scopedWorkspaceIds,
    createdAt: item.createdAt || now,
    updatedAt: item.updatedAt || now,
    lastSuccessAt: item.lastSuccessAt || null,
    lastError: item.lastError || null,
    disabledAt: item.disabledAt || null,
  };
}

function scopedPushPrincipalIds(principalIds) {
  const principals = normalizeStringList(principalIds);
  if (!principals.length) return ["owner"];
  if (principals.includes("owner")) return ["owner"];
  return [principals[principals.length - 1]];
}

function scopedPushWorkspaceIds(principalId, workspaceIds = [], options = {}) {
  const principal = String(principalId || "owner").trim() || "owner";
  if (principal === "owner") return ["owner"];
  const workspaceId = options.skipCatalogLookups
    ? (normalizeStringList(workspaceIds)[0] || principal)
    : (workspaceIdForPrincipal(principal) || normalizeStringList(workspaceIds)[0] || "");
  return workspaceId ? [workspaceId] : [];
}

function pushSubscriptionScopeSignature(items) {
  return JSON.stringify((Array.isArray(items) ? items : []).map((item) => {
    const subscription = item?.subscription && typeof item.subscription === "object" ? item.subscription : item;
    const endpoint = String(subscription?.endpoint || item?.endpoint || "").trim();
    return {
      endpointHash: String(item?.endpointHash || (endpoint ? hashValue(endpoint) : "")),
      principalIds: normalizeStringList(item?.principalIds || item?.principalId || item?.principals),
      workspaceIds: normalizeStringList(item?.workspaceIds || item?.workspaceId || item?.workspaces),
    };
  }).sort((a, b) => a.endpointHash.localeCompare(b.endpointHash)));
}

function normalizeStringList(value) {
  const raw = Array.isArray(value)
    ? value
    : (typeof value === "string" ? value.split(",") : (value ? [value] : []));
  return dedupe(raw.map((item) => String(item || "").trim()).filter(Boolean));
}

function normalizeStringMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const normalizedKey = String(key || "").trim();
    const normalizedValue = String(rawValue || "").trim();
    if (normalizedKey && normalizedValue) out[normalizedKey] = normalizedValue;
  }
  return out;
}

function stripPrincipalLabelPrefixes(value) {
  let text = String(value || "").trim();
  for (const prefix of PRINCIPAL_LABEL_PREFIXES) {
    if (prefix && text.startsWith(prefix)) text = text.slice(prefix.length);
  }
  return text;
}

function normalizeChatGroup(value, ownerWorkspaceId = "owner", options = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const ownerId = String(ownerWorkspaceId || "owner").trim() || "owner";
  let memberWorkspaceIds = normalizeStringList(
    source.memberWorkspaceIds || source.member_workspace_ids || source.members || source.workspaceIds,
  );
  if (!options.skipCatalogLookups) memberWorkspaceIds = memberWorkspaceIds.filter((workspaceId) => findWorkspace(workspaceId));
  if (source.enabled) memberWorkspaceIds.unshift(ownerId);
  const normalizedMembers = dedupe(memberWorkspaceIds);
  const kind = String(source.kind || source.type || "").trim() === KANBAN_CASE_TOPIC_KIND ? KANBAN_CASE_TOPIC_KIND : "";
  const topicKey = String(source.topicKey || source.topic_key || "").trim().slice(0, 160);
  return {
    enabled: Boolean(source.enabled),
    memberWorkspaceIds: source.enabled ? normalizedMembers : [],
    kind,
    topicKey,
    createdAt: String(source.createdAt || source.created_at || ""),
    updatedAt: String(source.updatedAt || source.updated_at || ""),
  };
}

function normalizeExternalIngress(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const sourceName = String(source.source || "").trim();
  if (!sourceName) return null;
  return {
    source: sourceName.slice(0, 80),
    threadKey: String(source.threadKey || source.thread_key || "").slice(0, 120),
    eventId: String(source.eventId || source.event_id || "").slice(0, 160),
    accountId: String(source.accountId || source.account_id || "").slice(0, 160),
    chatId: String(source.chatId || source.chat_id || "").slice(0, 240),
    userId: String(source.userId || source.user_id || "").slice(0, 240),
    principalId: String(source.principalId || source.principal_id || "").slice(0, 160),
    workspaceId: String(source.workspaceId || source.workspace_id || "").slice(0, 160),
    senderLabel: String(source.senderLabel || source.sender_label || "").slice(0, 120),
    status: String(source.status || "").slice(0, 80),
    createdAt: String(source.createdAt || source.created_at || ""),
    updatedAt: String(source.updatedAt || source.updated_at || ""),
  };
}

function normalizeExternalDelivery(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const sourceName = String(source.source || "").trim();
  if (!sourceName) return null;
  return Object.assign({}, source, {
    source: sourceName.slice(0, 80),
    deliveryId: String(source.deliveryId || source.delivery_id || "").slice(0, 160),
    status: String(source.status || "waiting").slice(0, 80),
    accountId: String(source.accountId || source.account_id || "").slice(0, 160),
    chatId: String(source.chatId || source.chat_id || "").slice(0, 240),
    userId: String(source.userId || source.user_id || "").slice(0, 240),
    eventId: String(source.eventId || source.event_id || "").slice(0, 160),
    updatedAt: String(source.updatedAt || source.updated_at || ""),
  });
}

function normalizeThread(thread, options = {}) {
  const now = new Date().toISOString();
  const normalized = {
    id: String(thread.id || makeId("thread")),
    title: String(thread.title || "New thread"),
    workspaceId: String(thread.workspaceId || "owner"),
    projectId: String(thread.projectId || "general"),
    subprojectId: String(thread.subprojectId || ""),
    singleWindow: Boolean(thread.singleWindow),
    hermesSessionId: String(thread.hermesSessionId || `web_${makeId("session")}`),
    status: String(thread.status || "idle"),
    activeRunId: thread.activeRunId || null,
    activeRunIds: Array.isArray(thread.activeRunIds) ? thread.activeRunIds.map(String).filter(Boolean) : dedupe([thread.activeRunId].filter(Boolean)),
    createdAt: thread.createdAt || now,
    updatedAt: thread.updatedAt || now,
    taskGroupMeta: normalizeTaskGroupMeta(thread.taskGroupMeta),
    chatGroup: normalizeChatGroup(thread.chatGroup || thread.groupChat, thread.workspaceId || "owner", options),
    externalIngress: normalizeExternalIngress(thread.externalIngress || thread.external_ingress),
    messages: Array.isArray(thread.messages) ? thread.messages : [],
    events: Array.isArray(thread.events) ? thread.events.slice(-MAX_STORED_EVENTS_PER_THREAD) : [],
  };
  normalized.messages = normalizeThreadMessages(normalized, normalized.messages, options);
  return normalized;
}

function normalizeThreadMessages(thread, messages, options = {}) {
  const normalized = messages.map((message) => {
    const next = message && typeof message === "object" ? Object.assign({}, message) : {};
    next.id = String(next.id || makeId("msg"));
    next.role = String(next.role || "assistant");
    next.content = String(next.content || "");
    next.status = String(next.status || "done");
    next.createdAt = next.createdAt || nowIso();
    next.updatedAt = next.updatedAt || next.createdAt;
    for (const field of MESSAGE_TIME_FIELDS) {
      if (next[field]) next[field] = String(next[field]);
    }
    next.artifacts = Array.isArray(next.artifacts) ? next.artifacts : [];
    next.directoryAliases = Array.isArray(next.directoryAliases) ? next.directoryAliases : [];
    next.directoryRoute = next.directoryRoute && typeof next.directoryRoute === "object" ? next.directoryRoute : null;
    next.messageKind = String(next.messageKind || next.message_kind || "").trim() === "plain" ? "plain" : "ai";
    next.senderWorkspaceId = String(next.senderWorkspaceId || next.sender_workspace_id || next.actorWorkspaceId || thread.workspaceId || "").trim();
    next.senderPrincipalId = String(next.senderPrincipalId || next.sender_principal_id || "").trim();
    next.senderLabel = String(next.senderLabel || next.sender_label || "").trim();
    next.gatewayUrl = String(next.gatewayUrl || next.gateway_url || "").trim();
    next.gatewayName = String(next.gatewayName || next.gateway_name || "").trim();
    next.gatewayProfile = String(next.gatewayProfile || next.gateway_profile || "").trim();
    next.gatewaySource = String(next.gatewaySource || next.gateway_source || "").trim();
    next.externalIngress = normalizeExternalIngress(next.externalIngress || next.external_ingress);
    next.externalDelivery = normalizeExternalDelivery(next.externalDelivery || next.external_delivery);
    if (!next.senderLabel && next.senderWorkspaceId) {
      next.senderLabel = options.skipCatalogLookups ? next.senderWorkspaceId : workspaceLabel(next.senderWorkspaceId);
    }
    next.revokedAt = String(next.revokedAt || next.revoked_at || "").trim();
    next.revokedByWorkspaceId = String(next.revokedByWorkspaceId || next.revoked_by_workspace_id || "").trim();
    next.revokedByPrincipalId = String(next.revokedByPrincipalId || next.revoked_by_principal_id || "").trim();
    next.revokedByLabel = String(next.revokedByLabel || next.revoked_by_label || "").trim();
    if (next.revokedAt) {
      next.content = next.content || GROUP_MESSAGE_REVOKED_TEXT;
      next.error = null;
      next.artifacts = [];
      next.directoryAliases = [];
      next.directoryRoute = null;
    }
    const reasoningEffort = String(next.reasoningEffort || next.reasoning_effort || "").trim();
    next.reasoningEffort = VALID_REASONING_EFFORTS.has(reasoningEffort) ? reasoningEffort : "";
    if (next.role === "user" && !next.submittedAt) next.submittedAt = next.createdAt;
    if (next.role === "assistant") {
      if (!next.queuedAt) next.queuedAt = next.createdAt;
      if (next.status === "done" && !next.completedAt && (next.content || next.artifacts.length)) next.completedAt = next.updatedAt;
    if (next.status === "failed" && !next.failedAt) next.failedAt = next.updatedAt;
      if (next.status === "cancelled" && !next.cancelledAt) next.cancelledAt = next.updatedAt;
    }
    if (next.taskGroupId) next.taskGroupId = sanitizeTaskGroupId(next.taskGroupId);
    if (thread.singleWindow) {
      const rawSingleWindowMode = String(next.singleWindowMode || next.single_window_mode || "").trim();
      const weixinIngressMessage = next.externalIngress?.source === "weixin" || next.externalDelivery?.source === "weixin";
      const conversationMessage = isSingleWindowConversationTaskGroupId(next.taskGroupId) || weixinIngressMessage;
      next.singleWindowMode = normalizeSingleWindowMode(rawSingleWindowMode || (conversationMessage ? "chat" : "task"));
      if (next.singleWindowMode === "chat") next.taskGroupId = singleWindowChatTaskGroupId(next.taskGroupId);
    }
    if (
      thread.singleWindow
      && next.messageKind === "plain"
      && next.taskGroupId === SINGLE_WINDOW_CHAT_TASK_GROUP_ID
      && chatGroupMemberWorkspaceIds(thread).length
    ) {
      next.taskGroupId = SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID;
    }
    return next;
  });
  if (!thread.singleWindow) return normalized;

  let currentTaskGroupId = "";
  for (let i = 0; i < normalized.length; i += 1) {
    const message = normalized[i];
    if (message.taskGroupId) {
      currentTaskGroupId = message.taskGroupId;
      continue;
    }
    if (message.role === "user" || !currentTaskGroupId) {
      const nextAssistant = normalized[i + 1]?.role === "assistant" ? normalized[i + 1] : null;
      currentTaskGroupId = sanitizeTaskGroupId(
        nextAssistant?.taskGroupId || nextAssistant?.taskId || message.taskId || `task_${message.id}`,
      );
    }
    message.taskGroupId = currentTaskGroupId;
  }
  return normalized;
}

function sanitizeTaskGroupId(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_.:-]+/g, "_")
    .slice(0, 96);
  return cleaned || makeId("task");
}

function sanitizeTaskTitle(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function normalizeTaskGroupMeta(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const out = {};
  for (const [rawKey, rawMeta] of Object.entries(source)) {
    const key = sanitizeTaskGroupId(rawKey);
    if (!key || !rawMeta || typeof rawMeta !== "object" || Array.isArray(rawMeta)) continue;
    const title = sanitizeTaskTitle(rawMeta.title || rawMeta.name || "");
    if (!title) continue;
    out[key] = {
      title,
      updatedAt: String(rawMeta.updatedAt || rawMeta.renamedAt || nowIso()),
    };
  }
  return out;
}

function stateMessageCount(value) {
  const threads = Array.isArray(value?.threads) ? value.threads : [];
  return threads.reduce((total, thread) => total + (Array.isArray(thread?.messages) ? thread.messages.length : 0), 0);
}

function stateThreadCount(value) {
  return Array.isArray(value?.threads) ? value.threads.length : 0;
}

function stateBackupTimestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function safeStateBackupReason(reason) {
  return String(reason || "save").toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "save";
}

function backupStateFile(reason = "save", options = {}) {
  ensureDataDir();
  if (!fs.existsSync(STATE_PATH)) return null;
  const now = Date.now();
  if (!options.force && lastStateBackupAt && now - lastStateBackupAt < STATE_BACKUP_MIN_INTERVAL_MS) return null;
  let raw = "";
  try {
    raw = fs.readFileSync(STATE_PATH, "utf8");
  } catch (_) {
    return null;
  }
  if (!raw.trim()) return null;
  let summary = "unreadable";
  if (!options.rawFallback) {
    try {
      const parsed = JSON.parse(raw);
      summary = `${stateThreadCount(parsed)}t-${stateMessageCount(parsed)}m`;
    } catch (_) {
      summary = "unreadable";
    }
  }
  ensureStateBackupDir();
  const filePath = path.join(STATE_BACKUP_DIR, `state-auto-${stateBackupTimestamp()}-${safeStateBackupReason(reason)}-${summary}.json`);
  try {
    fs.writeFileSync(filePath, raw, "utf8");
    lastStateBackupAt = now;
    pruneStateBackups();
    return filePath;
  } catch (err) {
    console.error(`Hermes Mobile state backup failed: ${err.message || String(err)}`);
    return null;
  }
}

function pruneStateBackups() {
  if (!Number.isFinite(MAX_STATE_BACKUPS) || MAX_STATE_BACKUPS <= 0) return;
  let entries = [];
  try {
    entries = fs.readdirSync(STATE_BACKUP_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^state-auto-.*\.json$/i.test(entry.name))
      .map((entry) => {
        const filePath = path.join(STATE_BACKUP_DIR, entry.name);
        const stat = fs.statSync(filePath);
        return { filePath, mtimeMs: stat.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch (_) {
    return;
  }
  for (const entry of entries.slice(MAX_STATE_BACKUPS)) {
    try {
      fs.unlinkSync(entry.filePath);
    } catch (_) {
      // Best-effort retention cleanup only.
    }
  }
}

function readStateFileIfValid() {
  try {
    if (!fs.existsSync(STATE_PATH)) return null;
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch (_) {
    return null;
  }
}

function shouldRefuseStateOverwrite(previous, next, options = {}) {
  if (options.allowMessageDrop) return false;
  const previousMessages = stateMessageCount(previous);
  const nextMessages = stateMessageCount(next);
  if (previousMessages < 5) return false;
  const dropped = previousMessages - nextMessages;
  return dropped >= Math.max(6, Math.ceil(previousMessages * 0.4));
}

function writeStateFile(next) {
  ensureDataDir();
  const tmp = `${STATE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  fs.renameSync(tmp, STATE_PATH);
}

function saveState(next = state, options = {}) {
  ensureDataDir();
  const previous = readStateFileIfValid();
  if (previous && shouldRefuseStateOverwrite(previous, next, options)) {
    const backupPath = backupStateFile(`refused-${options.reason || "message-drop"}`, { force: true });
    const previousMessages = stateMessageCount(previous);
    const nextMessages = stateMessageCount(next);
    throw new Error(`Refusing to overwrite Hermes Mobile state: message count would drop from ${previousMessages} to ${nextMessages}.${backupPath ? ` Backup: ${backupPath}` : ""}`);
  }
  const previousMessages = previous ? stateMessageCount(previous) : 0;
  const nextMessages = stateMessageCount(next);
  if (previousMessages && previousMessages !== nextMessages) {
    backupStateFile(options.reason || "message-count-change", { force: options.forceBackup });
  } else {
    backupStateFile(options.reason || "periodic-save");
  }
  if (useSqliteServiceStore()) {
    mobileSqliteStore().replaceRuntimeState(next);
  }
  writeStateFile(next);
}

function isDiscardableEmptyThread(thread) {
  const threadId = String(thread?.id || "");
  const hasArtifacts = (state.artifacts || []).some((artifact) => String(artifact.threadId || "") === threadId);
  const timestamp = Date.parse(thread?.updatedAt || thread?.createdAt || "");
  const oldEnough = !Number.isFinite(timestamp) || Date.now() - timestamp > 60_000;
  return Boolean(
    thread &&
    !thread.singleWindow &&
    !(thread.messages || []).length &&
    !(thread.activeRunId || (thread.activeRunIds || []).length) &&
    !hasArtifacts &&
    oldEnough
  );
}

function pruneEmptyThreads() {
  const removedIds = new Set();
  state.threads = (state.threads || []).filter((thread) => {
    if (!isDiscardableEmptyThread(thread)) return true;
    removedIds.add(thread.id);
    return false;
  });
  if (!removedIds.size) return 0;
  state.artifacts = (state.artifacts || []).filter((artifact) => !removedIds.has(String(artifact.threadId || "")));
  saveState();
  return removedIds.size;
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeClientVersion(value) {
  return String(value || "").trim();
}

function normalizeReasoningEffort(value) {
  const effort = String(value || "").trim().toLowerCase();
  if (effort === "minimal") return "low";
  if (effort === "none") return "none";
  if (VALID_REASONING_EFFORTS.has(effort)) return effort;
  return "";
}

function normalizeOwnerElevationDurations(value) {
  const parsed = normalizeStringList(value)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0 && item <= 240)
    .map((item) => Math.round(item));
  const unique = [...new Set(parsed)].sort((a, b) => a - b);
  return unique.length ? unique : [5, 15, 30, 60];
}

function normalizeSingleWindowMode(value) {
  return String(value || "").trim().toLowerCase() === "chat" ? "chat" : "task";
}

function unquoteYamlScalar(value) {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

function assignRuntimeConfigYamlValue(result, section, key, value) {
  const normalizedSection = String(section || "").trim().toLowerCase();
  const normalizedKey = String(key || "").trim().toLowerCase().replace(/-/g, "_");
  const scalar = unquoteYamlScalar(value);
  if (!scalar) return;
  if (normalizedSection === "agent" && normalizedKey === "reasoning_effort") result.reasoningEffort = scalar;
  if (normalizedSection === "model" && normalizedKey === "default") result.defaultModel = scalar;
  if (normalizedSection === "model" && normalizedKey === "provider") result.provider = scalar;
  if (normalizedSection === "model" && normalizedKey === "base_url") result.baseUrl = scalar;
}

function parseAgentRuntimeConfigFromYaml(text) {
  const result = { reasoningEffort: "", defaultModel: "", provider: "", baseUrl: "" };
  let section = "";
  let sectionIndent = -1;
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const noComment = rawLine.replace(/\s+#.*$/, "");
    if (!noComment.trim()) continue;
    const dotted = noComment.match(/^\s*(agent|model)\.([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/i);
    if (dotted) {
      assignRuntimeConfigYamlValue(result, dotted[1], dotted[2], dotted[3]);
      continue;
    }
    const topSection = noComment.match(/^(\s*)(agent|model)\s*:\s*$/i);
    if (topSection) {
      section = topSection[2].toLowerCase();
      sectionIndent = topSection[1].length;
      continue;
    }
    if (section) {
      const indent = (noComment.match(/^(\s*)/) || ["", ""])[1].length;
      if (indent <= sectionIndent) {
        section = "";
        sectionIndent = -1;
      } else {
        const scalar = noComment.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
        if (scalar) assignRuntimeConfigYamlValue(result, section, scalar[1], scalar[2]);
      }
    }
  }
  return result;
}

function parseAgentReasoningEffortFromYaml(text) {
  return parseAgentRuntimeConfigFromYaml(text).reasoningEffort;
}

function configPathReadableForRuntimeInfo(configPath) {
  const text = String(configPath || "").trim();
  return Boolean(text && (
    !isUncPath(text)
    || EXPLICIT_HERMES_CONFIG_PATHS.has(text)
    || ALLOW_WSL_REASONING_CONFIG_LOOKUP
  ));
}

function gatewayPoolConfigPathCandidates() {
  const candidates = [];
  try {
    const loaded = gatewayPool().load();
    for (const worker of loaded.workers || []) {
      for (const dbPath of [worker.telemetryStateDbPath, worker.telemetryResponseStoreDbPath]) {
        if (dbPath) candidates.push(path.join(path.dirname(dbPath), "config.yaml"));
      }
      for (const root of GATEWAY_USAGE_TELEMETRY_PROFILE_ROOTS) {
        if (worker.profile) candidates.push(path.join(root, worker.profile, "config.yaml"));
        if (worker.telemetryProfile && worker.telemetryProfile !== worker.profile) {
          candidates.push(path.join(root, worker.telemetryProfile, "config.yaml"));
        }
      }
    }
  } catch (_) {}
  return candidates;
}

function runtimeConfigPathCandidates() {
  const base = HERMES_CONFIG_PATHS.filter(configPathReadableForRuntimeInfo);
  return dedupe([...gatewayPoolConfigPathCandidates(), ...base]).filter(configPathReadableForRuntimeInfo);
}

function assistantLabelForRuntimeConfig(info = {}) {
  const provider = String(info.provider || "").trim();
  const baseUrl = String(info.baseUrl || "").trim();
  const model = String(info.defaultModel || "").trim();
  if (/openai-codex/i.test(provider) || /chatgpt\.com\/backend-api\/codex/i.test(baseUrl)) return "ChatGPT";
  if (/claude/i.test(provider) || /^claude/i.test(model)) return "Claude";
  if (/gemini/i.test(provider) || /^gemini/i.test(model)) return "Gemini";
  if (/qwen/i.test(provider) || /^qwen/i.test(model)) return "Qwen";
  if (/deepseek/i.test(provider) || /^deepseek/i.test(model)) return "DeepSeek";
  if (provider) return provider;
  if (model) return model;
  return "AI";
}

function runtimeModelConfigInfo() {
  const configPaths = runtimeConfigPathCandidates();
  const parts = configPaths.map((item) => {
    try {
      const stat = fs.statSync(item);
      return `${item}:${stat.mtimeMs}`;
    } catch (_) {
      return `${item}:missing`;
    }
  }).join("|");
  if (defaultReasoningCache.value && defaultReasoningCache.cacheKey === parts) return defaultReasoningCache.value;
  const envEffort = normalizeReasoningEffort(process.env.HERMES_WEB_DEFAULT_REASONING_EFFORT || "");
  for (const configPath of configPaths) {
    try {
      if (!configPath || !fs.existsSync(configPath)) continue;
      const parsed = parseAgentRuntimeConfigFromYaml(fs.readFileSync(configPath, "utf8"));
      const effort = normalizeReasoningEffort(envEffort || parsed.reasoningEffort);
      if (effort || parsed.defaultModel || parsed.provider || parsed.baseUrl) {
        const value = {
          defaultEffort: effort || "medium",
          defaultModel: parsed.defaultModel || "",
          provider: parsed.provider || "",
          baseUrl: parsed.baseUrl || "",
          assistantLabel: assistantLabelForRuntimeConfig(parsed),
          source: configPath,
          efforts: REASONING_EFFORT_OPTIONS,
        };
        defaultReasoningCache = { cacheKey: parts, value };
        return value;
      }
    } catch (_) {}
  }
  const fallback = {
    defaultEffort: envEffort || "medium",
    defaultModel: "",
    provider: "",
    baseUrl: "",
    assistantLabel: "AI",
    source: envEffort ? "env:HERMES_WEB_DEFAULT_REASONING_EFFORT" : "gateway-default",
    efforts: REASONING_EFFORT_OPTIONS,
  };
  defaultReasoningCache = { cacheKey: parts || "no-config", value: fallback };
  return fallback;
}

function defaultReasoningInfo() {
  return runtimeModelConfigInfo();
}

function readClientVersion() {
  try {
    const stat = fs.statSync(INDEX_HTML_PATH);
    if (clientVersionCache.version && clientVersionCache.mtimeMs === stat.mtimeMs) return clientVersionCache.version;
    const html = fs.readFileSync(INDEX_HTML_PATH, "utf8");
    const explicit = html.match(/\bdata-client-version=["']([^"']+)["']/i)
      || html.match(/<meta\s+name=["']hermes-web-client-version["']\s+content=["']([^"']+)["'][^>]*>/i)
      || html.match(/\/app\.js\?v=([A-Za-z0-9._-]+)/i);
    clientVersionCache = {
      mtimeMs: stat.mtimeMs,
      version: normalizeClientVersion(explicit?.[1] || "unknown"),
    };
    return clientVersionCache.version;
  } catch (_) {
    return clientVersionCache.version || "unknown";
  }
}

function clientVersionInfo(clientVersion = "") {
  const current = readClientVersion();
  const reported = normalizeClientVersion(clientVersion);
  return {
    version: current,
    clientVersion: reported,
    refreshRequired: Boolean(reported && current && current !== "unknown" && current !== reported),
    checkedAt: nowIso(),
  };
}

function compareClientVersions(a, b) {
  const left = normalizeClientVersion(a);
  const right = normalizeClientVersion(b);
  if (left === right) return 0;
  const parse = (value) => {
    const match = value.match(/^(\d{8})-(\d{4})$/);
    return match ? Number(`${match[1]}${match[2]}`) : NaN;
  };
  const leftNumber = parse(left);
  const rightNumber = parse(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return left.localeCompare(right);
}

function runGitSync(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: options.cwd || REPO_ROOT,
    encoding: "utf8",
    windowsHide: true,
    timeout: options.timeoutMs || UPDATE_CHECK_TIMEOUT_MS,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || "").trim(),
    stderr: compactText(String(result.stderr || result.error?.message || "").trim(), 600),
  };
}

function gitRemoteRawIndexUrl(remoteUrl, branch = UPDATE_BRANCH) {
  const raw = String(remoteUrl || "").trim();
  if (!raw) return "";
  let owner = "";
  let repo = "";
  let match = raw.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (match) {
    owner = match[1];
    repo = match[2];
  } else {
    try {
      const url = new URL(raw);
      if (!/github\.com$/i.test(url.hostname)) return "";
      const parts = url.pathname.replace(/^\/+/, "").replace(/\.git$/i, "").split("/");
      owner = parts[0] || "";
      repo = parts[1] || "";
    } catch (_) {
      return "";
    }
  }
  if (!owner || !repo) return "";
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/public/index.html`;
}

async function fetchTextWithTimeout(url, timeoutMs = UPDATE_CHECK_TIMEOUT_MS) {
  const response = await fetch(url, { signal: AbortSignal.timeout(Math.max(1000, timeoutMs)), cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

function parseClientVersionFromHtml(html) {
  const explicit = String(html || "").match(/\bdata-client-version=["']([^"']+)["']/i)
    || String(html || "").match(/<meta\s+name=["']hermes-web-client-version["']\s+content=["']([^"']+)["'][^>]*>/i)
    || String(html || "").match(/\/app\.js\?v=([A-Za-z0-9._-]+)/i);
  return normalizeClientVersion(explicit?.[1] || "");
}

function gitRepositoryStatus() {
  const inside = runGitSync(["rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok || inside.stdout !== "true") {
    return { available: false, clean: false, reason: "Current app directory is not a git checkout." };
  }
  const head = runGitSync(["rev-parse", "HEAD"]);
  const branch = runGitSync(["rev-parse", "--abbrev-ref", "HEAD"]);
  const remote = runGitSync(["remote", "get-url", UPDATE_REMOTE_NAME]);
  const dirty = runGitSync(["status", "--porcelain", "--untracked-files=normal"]);
  const clean = dirty.ok && !dirty.stdout;
  return {
    available: true,
    clean,
    dirty: dirty.stdout ? compactText(dirty.stdout, 600) : "",
    head: head.ok ? head.stdout : "",
    branch: branch.ok ? branch.stdout : "",
    remoteConfigured: remote.ok,
    remoteName: UPDATE_REMOTE_NAME,
    remoteUrl: remote.ok ? remote.stdout : "",
    updateBranch: UPDATE_BRANCH,
  };
}

async function appUpdateStatus() {
  const currentVersion = readClientVersion();
  const repo = gitRepositoryStatus();
  let latestVersion = "";
  let latestCommit = "";
  let checkError = "";
  if (repo.available) {
    const versionUrl = UPDATE_VERSION_URL || gitRemoteRawIndexUrl(repo.remoteUrl, UPDATE_BRANCH);
    if (versionUrl) {
      try {
        latestVersion = parseClientVersionFromHtml(await fetchTextWithTimeout(versionUrl));
      } catch (err) {
        checkError = `Version check failed: ${err.message || String(err)}`;
      }
    } else {
      checkError = "No GitHub raw version URL is configured.";
    }
    const remoteHead = runGitSync(["ls-remote", UPDATE_REMOTE_NAME, `refs/heads/${UPDATE_BRANCH}`]);
    if (remoteHead.ok) latestCommit = String(remoteHead.stdout.split(/\s+/)[0] || "");
    else if (!checkError) checkError = remoteHead.stderr || "GitHub branch check failed.";
  }
  const updateAvailable = Boolean(latestVersion && compareClientVersions(latestVersion, currentVersion) > 0)
    || Boolean(latestCommit && repo.head && latestCommit !== repo.head);
  return {
    ok: true,
    currentVersion,
    latestVersion,
    updateAvailable,
    latestCommit,
    currentCommit: repo.head || "",
    repository: {
      available: repo.available,
      clean: repo.clean,
      dirty: repo.dirty || "",
      branch: repo.branch || "",
      remoteName: repo.remoteName || UPDATE_REMOTE_NAME,
      updateBranch: UPDATE_BRANCH,
    },
    canFastForward: Boolean(repo.available && repo.clean && updateAvailable),
    warning: checkError || repo.reason || "",
    checkedAt: nowIso(),
  };
}

async function applyAppUpdate() {
  const status = await appUpdateStatus();
  if (!status.repository.available) return Object.assign({}, status, { ok: false, error: status.warning || "App directory is not a git checkout." });
  if (!status.repository.clean) return Object.assign({}, status, { ok: false, error: "Working tree is not clean; update was not applied." });
  const fetchResult = runGitSync(["fetch", UPDATE_REMOTE_NAME, UPDATE_BRANCH], { timeoutMs: 30000 });
  if (!fetchResult.ok) return Object.assign({}, status, { ok: false, error: fetchResult.stderr || "git fetch failed." });
  const remoteRef = `${UPDATE_REMOTE_NAME}/${UPDATE_BRANCH}`;
  const localHead = runGitSync(["rev-parse", "HEAD"]);
  const remoteHead = runGitSync(["rev-parse", remoteRef]);
  if (!remoteHead.ok) return Object.assign({}, status, { ok: false, error: `Cannot resolve ${remoteRef}.` });
  if (localHead.ok && localHead.stdout === remoteHead.stdout) {
    return Object.assign({}, status, { ok: true, updated: false, upToDate: true, latestCommit: remoteHead.stdout });
  }
  const ancestor = runGitSync(["merge-base", "--is-ancestor", "HEAD", remoteRef]);
  if (!ancestor.ok) {
    return Object.assign({}, status, { ok: false, error: "Remote branch is not a fast-forward from the current checkout." });
  }
  const merge = runGitSync(["merge", "--ff-only", remoteRef], { timeoutMs: 30000 });
  if (!merge.ok) return Object.assign({}, status, { ok: false, error: merge.stderr || "git fast-forward failed." });
  clientVersionCache = { mtimeMs: 0, version: "" };
  return Object.assign({}, await appUpdateStatus(), {
    ok: true,
    updated: true,
    restartRequired: true,
    message: "Updated by git fast-forward. Restart Hermes Mobile if server code changed.",
  });
}

function requestClientVersion(req) {
  const url = getUrl(req);
  return url.searchParams.get("clientVersion") || req.headers["x-hermes-web-client-version"] || "";
}

function attachClientVersionHeaders(req, res) {
  const info = clientVersionInfo(requestClientVersion(req));
  res.setHeader("X-Hermes-Web-Version", info.version);
  res.setHeader("X-Hermes-Web-Client-Version", info.clientVersion || "");
  res.setHeader("X-Hermes-Web-Refresh-Required", info.refreshRequired ? "1" : "0");
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function windowsPathToWsl(value) {
  return filesystemMountProvider.windowsPathToWsl(value);
}

function safeStorageSegment(value, fallback = "item") {
  return String(value || fallback)
    .replace(/[^A-Za-z0-9_.:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96) || fallback;
}

function groupChatDeliveryRootForThread(thread) {
  return path.join(GROUP_DELIVERIES_DIR, safeStorageSegment(thread?.id || "thread"));
}

function groupChatSharedAttachmentRootForThread(thread) {
  return path.join(groupChatDeliveryRootForThread(thread), "shared-attachments");
}

function storedArtifactForMessageArtifact(artifact = {}) {
  const id = String(artifact?.id || "").trim();
  const stored = id ? (state.artifacts || []).find((item) => String(item.id || "") === id) : null;
  return Object.assign({}, stored || {}, artifact || {});
}

function groupChatMessagesForRun(thread, latestUserMessage) {
  if (!thread?.singleWindow || latestUserMessage?.taskGroupId !== SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID) return [];
  const messages = thread.messages || [];
  const latestIndex = messages.findIndex((message) => String(message?.id || "") === String(latestUserMessage?.id || ""));
  return messages
    .slice(0, latestIndex >= 0 ? latestIndex + 1 : messages.length)
    .filter((message) => message?.taskGroupId === SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID)
    .filter((message) => !message.revokedAt);
}

function safeArtifactCopyName(artifact = {}, index = 0) {
  const id = String(artifact.id || "").trim() || `artifact-${index + 1}`;
  const name = safeFileName(artifact.name || artifact.path || id);
  return `${safeStorageSegment(id)}-${name}`;
}

function ensureGroupChatSharedArtifactCopies(thread, latestUserMessage, deliveryRoot) {
  if (!deliveryRoot || latestUserMessage?.taskGroupId !== SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID) return [];
  const messages = groupChatMessagesForRun(thread, latestUserMessage);
  const copyRoot = path.join(deliveryRoot, "shared-attachments");
  const copies = [];
  const seen = new Set();
  fs.mkdirSync(copyRoot, { recursive: true });
  for (const message of messages) {
    for (const messageArtifact of Array.isArray(message.artifacts) ? message.artifacts : []) {
      const artifact = storedArtifactForMessageArtifact(messageArtifact);
      const artifactId = String(artifact.id || messageArtifact.id || "").trim();
      const rawPath = String(artifact.path || artifact.localPath || artifact.displayPath || "").trim();
      const localPath = normalizeLocalPath(rawPath) || rawPath;
      const key = artifactId || localPath.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      if (!localPath || securityBoundaryProvider.isProtectedPath(localPath) || securityBoundaryProvider.isProtectedPath(rawPath)) continue;
      let stat = null;
      try {
        stat = fs.statSync(localPath);
      } catch (_) {
        continue;
      }
      if (!stat.isFile()) continue;
      const copyPath = path.join(copyRoot, safeArtifactCopyName(artifact, copies.length));
      try {
        if (!samePath(localPath, copyPath)) fs.copyFileSync(localPath, copyPath);
      } catch (_) {
        continue;
      }
      copies.push({
        id: artifactId,
        name: artifact.name || path.basename(localPath),
        originalPath: rawPath || localPath,
        copyPath,
        copyPathForModel: windowsPathToWsl(copyPath) || copyPath,
        messageId: message.id || "",
        senderWorkspaceId: message.senderWorkspaceId || "",
      });
    }
  }
  return copies;
}

function backendIsLocal(value, bridgeNames = []) {
  const backend = String(value || "").trim().toLowerCase();
  return !bridgeNames.includes(backend);
}

function useLocalTodoBackend() {
  return backendIsLocal(TODO_BACKEND, ["bridge", "plugin", "hermes", "hermes_todos", "kanban", "hermes_kanban"]);
}

function useKanbanTodoBackend() {
  return ["kanban", "hermes_kanban"].includes(TODO_BACKEND);
}

function directTodoCreateEnabled() {
  if (/^(0|false|no|off)$/i.test(DIRECT_TODO_CREATE_SETTING)) return false;
  if (/^(1|true|yes|on)$/i.test(DIRECT_TODO_CREATE_SETTING)) return true;
  return false;
}

function useLocalAutomationBackend() {
  return backendIsLocal(AUTOMATION_BACKEND, ["bridge", "cron", "hermes", "hermes_cron"]);
}

function useSqliteServiceStore() {
  return SERVICE_STORE_BACKEND === "sqlite";
}

function mobileSqliteStore() {
  if (!sqliteServiceStore) {
    const { createMobileSqliteStore } = require("./adapters/mobile-sqlite-store");
    sqliteServiceStore = createMobileSqliteStore({ dbPath: MOBILE_SQLITE_DB_PATH });
    sqliteServiceStore.migrate();
  }
  return sqliteServiceStore;
}

function readJsonStore(filePath, fallback) {
  ensureDataDir();
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    return fallback;
  }
}

function writeJsonStore(filePath, value) {
  ensureDataDir();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, filePath);
}

function bridgeHostKey() {
  const envKey = String(process.env.HERMES_MOBILE_BRIDGE_HOST_KEY || process.env.HERMES_WEB_BRIDGE_HOST_KEY || "").trim();
  if (envKey) return envKey;
  if (!BRIDGE_HOST_KEY_PATH) return "";
  const normalizedPath = path.resolve(BRIDGE_HOST_KEY_PATH);
  if (bridgeHostKeyCache.path === normalizedPath && bridgeHostKeyCache.value) return bridgeHostKeyCache.value;
  const value = String(fs.readFileSync(normalizedPath, "utf8") || "").trim();
  bridgeHostKeyCache = { path: normalizedPath, value };
  return value;
}

async function runBridgeHost(kind, payload, timeoutMs) {
  if (!BRIDGE_HOST_URL) return null;
  const key = bridgeHostKey();
  if (!key) throw new Error("Hermes Mobile bridge host key is not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 15000));
  try {
    const response = await fetch(`${BRIDGE_HOST_URL}/bridge/${encodeURIComponent(kind)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload || {}),
      signal: controller.signal,
    });
    let parsed = {};
    try {
      parsed = await response.json();
    } catch (_) {
      parsed = {};
    }
    if (!response.ok) {
      throw new Error(parsed?.error || `Hermes Mobile bridge host returned HTTP ${response.status}`);
    }
    return parsed;
  } catch (err) {
    if (err?.name === "AbortError") throw new Error(`${kind} bridge host timed out`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function localTodoStore() {
  const raw = readJsonStore(LOCAL_TODO_STORE_PATH, {});
  return {
    schemaVersion: 1,
    todos: Array.isArray(raw?.todos) ? raw.todos.filter((item) => item && typeof item === "object") : [],
    pushMarks: raw?.pushMarks && typeof raw.pushMarks === "object" && !Array.isArray(raw.pushMarks) ? raw.pushMarks : {},
    updatedAt: String(raw?.updatedAt || ""),
  };
}

function saveLocalTodoStore(store) {
  writeJsonStore(LOCAL_TODO_STORE_PATH, Object.assign({}, store, {
    schemaVersion: 1,
    updatedAt: nowIso(),
  }));
}

function parseLocalTodoDue(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const normalized = text.includes("T") ? text : text.replace(/\s+/, "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function localTodoDueLocal(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "" : formatLocalDateTime(date);
}

function localTodoAuthorized(row, source) {
  const principal = String(source || "").trim();
  if (!principal) return false;
  if (principal === "owner") return true;
  return [row?.assignee_principal_id, row?.created_by_principal].map((item) => String(item || "").trim()).includes(principal);
}

function localTodoMatchesList(row, source, scope) {
  const principal = String(source || "").trim();
  if (!principal) return false;
  if (principal === "owner") return true;
  const normalizedScope = String(scope || "mine").trim().toLowerCase();
  if (normalizedScope === "created") return String(row?.created_by_principal || "") === principal;
  return localTodoAuthorized(row, principal);
}

async function runSqliteTodoBridge(payload = {}) {
  const action = String(payload.action || "").trim().toLowerCase();
  const source = String(payload.source_principal || "owner").trim() || "owner";
  const store = mobileSqliteStore();
  const now = nowIso();

  if (action === "list") {
    return {
      ok: true,
      todos: store.listTodoItems({
        sourcePrincipal: source,
        scope: payload.scope || "mine",
        includeCompleted: Boolean(payload.include_completed),
        assignee: payload.assignee || "",
        limit: payload.limit || 80,
      }),
    };
  }

  if (action === "add") {
    const content = String(payload.content || "").trim();
    const dueAt = parseLocalTodoDue(payload.due_time);
    if (!content) return { ok: false, error: "Todo content is required" };
    if (!dueAt) return { ok: false, error: "Todo due time is required" };
    const assignee = String(payload.assignee || source).trim() || source;
    const row = {
      id: `todo_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`,
      content,
      status: "open",
      assignee_principal_id: assignee,
      assignee_label: assignee,
      created_by_principal: source,
      due_at: dueAt,
      due_local: localTodoDueLocal(dueAt),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      reminder_lead_minutes: Number(payload.reminder_lead_minutes || 0) || 0,
      recurrence_kind: String(payload.recurrence || "none"),
      recurrence_label: String(payload.recurrence || "none"),
      recurrence_days: String(payload.recurrence_days || ""),
      recurrence_series_id: "",
      recurrence_template: false,
      source: "sqlite",
      created_at: now,
      updated_at: now,
      completed_at: "",
      cancelled_at: "",
      ok: true,
    };
    store.importTodoItem(row);
    return row;
  }

  const todoId = String(payload.todo_id || "").trim();
  const row = store.getTodoItem(todoId);

  if (["complete", "cancel", "postpone", "delete"].includes(action)) {
    if (!row) return { ok: false, error: "No matching todo found." };
    if (!localTodoAuthorized(row, source)) return { ok: false, error: "Not authorized to mutate this todo." };
  }

  if (action === "complete") {
    row.status = "completed";
    row.completed_at = now;
    row.updated_at = now;
    store.importTodoItem(row);
    return Object.assign({}, row, { ok: true, action });
  }
  if (action === "cancel") {
    row.status = "cancelled";
    row.cancelled_at = now;
    row.updated_at = now;
    store.importTodoItem(row);
    return Object.assign({}, row, { ok: true, action });
  }
  if (action === "postpone") {
    const dueAt = parseLocalTodoDue(payload.due_time);
    if (!dueAt) return { ok: false, error: "due_time is required" };
    row.due_at = dueAt;
    row.due_local = localTodoDueLocal(dueAt);
    row.updated_at = now;
    store.importTodoItem(row);
    return Object.assign({}, row, { ok: true, action });
  }
  if (action === "delete") {
    store.deleteTodoItem(todoId);
    return Object.assign({}, row, { ok: true, action });
  }
  if (action === "web_pending_pushes") return { ok: true, events: [] };
  if (action === "web_mark_push") {
    store.audit("todo_web_push_mark", {
      actorWorkspaceId: "system",
      actorPrincipalId: source,
      targetType: "todo",
      targetId: String(payload.todoId || payload.todo_id || ""),
      payload: {
        markKey: String(payload.markKey || payload.mark_key || ""),
        principalId: String(payload.principalId || payload.principal_id || ""),
        messageType: String(payload.messageType || payload.message_type || ""),
        status: String(payload.status || "sent"),
      },
    });
    return { ok: true };
  }
  return { ok: false, error: `unknown action: ${action}` };
}

async function runLocalTodoBridge(payload = {}) {
  if (useSqliteServiceStore()) return runSqliteTodoBridge(payload);
  const action = String(payload.action || "").trim().toLowerCase();
  const source = String(payload.source_principal || "owner").trim() || "owner";
  const store = localTodoStore();
  const now = nowIso();

  if (action === "list") {
    const includeCompleted = Boolean(payload.include_completed);
    const assignee = String(payload.assignee || "").trim();
    const limit = Math.max(1, Math.min(200, Number(payload.limit) || 80));
    let rows = store.todos.filter((row) => localTodoMatchesList(row, source, payload.scope || "mine"));
    if (!includeCompleted) rows = rows.filter((row) => String(row.status || "") === "open");
    if (assignee) rows = rows.filter((row) => String(row.assignee_principal_id || "") === assignee);
    rows = rows.sort((a, b) => String(a.due_at || a.created_at || "").localeCompare(String(b.due_at || b.created_at || ""))).slice(0, limit);
    return { ok: true, todos: rows };
  }

  if (action === "add") {
    const content = String(payload.content || "").trim();
    const dueAt = parseLocalTodoDue(payload.due_time);
    if (!content) return { ok: false, error: "Todo content is required" };
    if (!dueAt) return { ok: false, error: "Todo due time is required" };
    const assignee = String(payload.assignee || source).trim() || source;
    const row = {
      id: `todo_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`,
      content,
      status: "open",
      assignee_principal_id: assignee,
      assignee_label: assignee,
      created_by_principal: source,
      due_at: dueAt,
      due_local: localTodoDueLocal(dueAt),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      reminder_lead_minutes: Number(payload.reminder_lead_minutes || 0) || 0,
      recurrence_kind: String(payload.recurrence || "none"),
      recurrence_label: String(payload.recurrence || "none"),
      recurrence_days: String(payload.recurrence_days || ""),
      recurrence_series_id: "",
      recurrence_template: false,
      created_at: now,
      updated_at: now,
      completed_at: "",
      cancelled_at: "",
      ok: true,
    };
    store.todos.push(row);
    saveLocalTodoStore(store);
    return row;
  }

  const todoId = String(payload.todo_id || "").trim();
  const index = store.todos.findIndex((row) => String(row.id || "") === todoId);
  const row = index >= 0 ? store.todos[index] : null;

  if (["complete", "cancel", "postpone", "delete"].includes(action)) {
    if (!row) return { ok: false, error: "No matching todo found." };
    if (!localTodoAuthorized(row, source)) return { ok: false, error: "Not authorized to mutate this todo." };
  }

  if (action === "complete") {
    row.status = "completed";
    row.completed_at = now;
    row.updated_at = now;
    saveLocalTodoStore(store);
    return Object.assign({}, row, { ok: true, action });
  }
  if (action === "cancel") {
    row.status = "cancelled";
    row.cancelled_at = now;
    row.updated_at = now;
    saveLocalTodoStore(store);
    return Object.assign({}, row, { ok: true, action });
  }
  if (action === "postpone") {
    const dueAt = parseLocalTodoDue(payload.due_time);
    if (!dueAt) return { ok: false, error: "due_time is required" };
    row.due_at = dueAt;
    row.due_local = localTodoDueLocal(dueAt);
    row.updated_at = now;
    saveLocalTodoStore(store);
    return Object.assign({}, row, { ok: true, action });
  }
  if (action === "delete") {
    store.todos.splice(index, 1);
    saveLocalTodoStore(store);
    return Object.assign({}, row, { ok: true, action });
  }
  if (action === "web_pending_pushes") return { ok: true, events: [] };
  if (action === "web_mark_push") {
    store.pushMarks[String(payload.markKey || payload.mark_key || "")] = {
      todoId: String(payload.todoId || payload.todo_id || ""),
      principalId: String(payload.principalId || payload.principal_id || ""),
      messageType: String(payload.messageType || payload.message_type || ""),
      status: String(payload.status || "sent"),
      updatedAt: now,
    };
    saveLocalTodoStore(store);
    return { ok: true };
  }
  return { ok: false, error: `unknown action: ${action}` };
}

function runTodoBridge(payload) {
  if (useKanbanTodoBackend()) return kanbanTodoBridge.run(payload);
  if (useLocalTodoBackend()) return runLocalTodoBridge(payload);
  if (BRIDGE_HOST_URL) return runBridgeHost("todo", payload, TODO_BRIDGE_TIMEOUT_MS);
  return new Promise((resolve, reject) => {
    const bridge = bridgeCommandProvider.python(TODO_BRIDGE_SCRIPT, [
      "HERMES_WEB_TODO_PLUGIN_NAME",
      "HERMES_WEB_TODO_PLUGIN_PATH",
    ]);
    const { command, args } = bridge;
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error("Todo bridge timed out"));
    }, TODO_BRIDGE_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > CRON_BRIDGE_STDOUT_LIMIT_BYTES) stdout = stdout.slice(-CRON_BRIDGE_STDOUT_LIMIT_BYTES);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 200_000) stderr = stderr.slice(-200_000);
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      let result = null;
      try {
        result = JSON.parse(stdout.trim() || "{}");
      } catch (err) {
        reject(new Error(`Todo bridge returned invalid JSON: ${err.message || String(err)}`));
        return;
      }
      if (code !== 0 && !result.error) {
        reject(new Error(stderr.trim() || `Todo bridge exited with ${code}`));
        return;
      }
      if (stderr.trim()) result.stderr = compactText(stderr.trim(), 1200);
      resolve(result);
    });
    child.stdin.end(JSON.stringify(payload || {}));
  });
}

const todoProvider = createTodoProvider({
  runBridge: runTodoBridge,
  workspacePrincipal,
  todoAssigneesForWorkspace,
  publicTodo,
  sourceName: () => useLocalTodoBackend()
    ? (useSqliteServiceStore() ? "sqlite_todos" : "local_todos")
    : (useKanbanTodoBackend() ? "hermes_kanban" : (process.env.HERMES_WEB_TODO_PLUGIN_NAME || "hermes_todos")),
});

const kanbanCardProvider = createKanbanCardProvider({
  runBridge: (payload) => kanbanTodoBridge.run(payload),
  workspacePrincipal,
  assigneesForWorkspace: todoAssigneesForWorkspace,
  publicCard: publicTodo,
  sourceName: () => "hermes_kanban",
});
const kanbanDependencyReconcileLastRun = new Map();
const kanbanCardListCache = new Map();
let kanbanCardListCacheStoreLoaded = false;

function localAutomationStore() {
  const raw = readJsonStore(LOCAL_AUTOMATION_STORE_PATH, {});
  return {
    schemaVersion: 1,
    jobs: Array.isArray(raw?.jobs) ? raw.jobs.filter((item) => item && typeof item === "object") : [],
    updatedAt: String(raw?.updatedAt || ""),
  };
}

function saveLocalAutomationStore(store) {
  writeJsonStore(LOCAL_AUTOMATION_STORE_PATH, Object.assign({}, store, {
    schemaVersion: 1,
    updatedAt: nowIso(),
  }));
}

function normalizeLocalAutomationSkills(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  return raw.map((item) => String(item || "").trim()).filter(Boolean);
}

function localAutomationScheduleText(job) {
  return String(job.scheduleText || job.schedule || "").trim() || "manual";
}

function localAutomationStatus(job) {
  if (!job.enabled) return "paused";
  if (job.lastError) return "error";
  return job.status || "scheduled";
}

function publicLocalAutomationJob(job) {
  const schedule = localAutomationScheduleText(job);
  return {
    id: String(job.id || ""),
    name: compactText(job.name || job.id || "Automation", 120),
    prompt: compactText(job.prompt || "", 4000),
    promptPreview: compactText(job.prompt || "", 220),
    skills: normalizeLocalAutomationSkills(job.skills),
    model: compactText(job.model || "", 80),
    provider: compactText(job.provider || "", 80),
    schedule,
    scheduleText: schedule,
    scheduleKind: String(job.scheduleKind || "local"),
    repeat: String(job.repeat || "forever"),
    enabled: job.enabled !== false,
    state: String(job.state || (job.enabled === false ? "paused" : "scheduled")),
    status: localAutomationStatus(job),
    nextRunAt: String(job.nextRunAt || ""),
    lastRunAt: String(job.lastRunAt || ""),
    lastStatus: String(job.lastStatus || ""),
    lastError: compactText(job.lastError || "", 400),
    lastDeliveryError: compactText(job.lastDeliveryError || "", 400),
    deliver: compactText(job.deliver || "local", 160),
    ownerPrincipalId: compactText(job.ownerPrincipalId || "owner", 120),
    workdir: compactText(job.workdir || "", 600),
    hasScript: false,
    hasWorkdir: Boolean(job.workdir),
    hasContextFrom: false,
    outputDocuments: Array.isArray(job.outputDocuments) ? job.outputDocuments : [],
  };
}

async function runSqliteCronBridge(payload = {}) {
  const action = String(payload.action || "").trim().toLowerCase();
  const store = mobileSqliteStore();
  const now = nowIso();

  if (action === "list") {
    const includeDisabled = Boolean(payload.include_disabled);
    const jobs = store.listAutomationJobs({
      ownerPrincipalId: payload.owner_principal_id || "owner",
      includeDisabled,
    }).map(publicLocalAutomationJob).sort(automationListSortByLatestDeliverable);
    return {
      ok: true,
      jobs,
      source: {
        name: "sqlite_automations",
        available: true,
        jobCount: jobs.length,
        pathKind: "sqlite",
      },
    };
  }

  if (action === "create") {
    const draft = payload.job && typeof payload.job === "object" ? payload.job : {};
    const ownerPrincipalId = String(payload.owner_principal_id || "owner").trim() || "owner";
    const schedule = String(draft.schedule || draft.scheduleText || draft.schedule_text || "").trim() || "manual";
    const job = {
      id: `auto_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`,
      name: compactText(draft.name || draft.title || payload.text || "Automation", 120),
      prompt: String(draft.prompt || payload.text || "").trim(),
      schedule,
      scheduleText: schedule,
      scheduleKind: "sqlite",
      repeat: String(draft.repeat || "forever"),
      enabled: true,
      state: "scheduled",
      status: "scheduled",
      nextRunAt: "",
      lastRunAt: "",
      lastStatus: "",
      lastError: "",
      lastDeliveryError: "",
      deliver: String(draft.deliver || "local"),
      ownerPrincipalId,
      workdir: String(draft.workdir || ""),
      skills: normalizeLocalAutomationSkills(draft.skills),
      model: String(draft.model || ""),
      provider: String(draft.provider || ""),
      outputDocuments: [],
      source: "sqlite",
      createdAt: now,
      updatedAt: now,
    };
    if (!payload.dry_run) store.importAutomationJob(job);
    return {
      ok: true,
      job: publicLocalAutomationJob(job),
      source: { name: "sqlite_automations", available: true, pathKind: "sqlite" },
    };
  }

  const jobId = String(payload.job_id || "").trim();
  const job = store.getAutomationJob(jobId);
  if (["delete", "pause", "resume", "update"].includes(action) && !job) {
    return { ok: false, error: "Automation job not found" };
  }
  if (job && String(job.ownerPrincipalId || "owner") !== String(payload.owner_principal_id || "owner")) {
    return { ok: false, error: "Automation job is not owned by this workspace" };
  }

  if (action === "delete") {
    if (!payload.dry_run) store.deleteAutomationJob(jobId);
    return {
      ok: true,
      deletedJob: publicLocalAutomationJob(job),
      source: { name: "sqlite_automations", available: true, pathKind: "sqlite" },
    };
  }
  if (action === "pause" || action === "resume") {
    job.enabled = action === "resume";
    job.state = job.enabled ? "scheduled" : "paused";
    job.status = job.state;
    job.updatedAt = now;
    if (!payload.dry_run) store.importAutomationJob(job);
    return {
      ok: true,
      job: publicLocalAutomationJob(job),
      source: { name: "sqlite_automations", available: true, pathKind: "sqlite" },
    };
  }
  if (action === "update") {
    const patch = payload.patch && typeof payload.patch === "object" ? payload.patch : {};
    for (const [field, value] of Object.entries({
      name: patch.name,
      prompt: patch.prompt,
      schedule: patch.schedule,
      scheduleText: patch.schedule,
      deliver: patch.deliver,
      model: patch.model,
      provider: patch.provider,
      workdir: patch.workdir,
    })) {
      if (value !== undefined) job[field] = String(value || "");
    }
    if (patch.skills !== undefined) job.skills = normalizeLocalAutomationSkills(patch.skills);
    job.updatedAt = now;
    if (!payload.dry_run) store.importAutomationJob(job);
    return {
      ok: true,
      job: publicLocalAutomationJob(job),
      source: { name: "sqlite_automations", available: true, pathKind: "sqlite" },
    };
  }

  return { ok: false, error: `unknown action: ${action}` };
}

async function runLocalCronBridge(payload = {}) {
  if (useSqliteServiceStore()) return runSqliteCronBridge(payload);
  const action = String(payload.action || "").trim().toLowerCase();
  const store = localAutomationStore();
  const now = nowIso();

  if (action === "list") {
    const includeDisabled = Boolean(payload.include_disabled);
    let jobs = store.jobs.map(publicLocalAutomationJob);
    if (!includeDisabled) jobs = jobs.filter((job) => job.enabled);
    return {
      ok: true,
      jobs,
      source: {
        name: "local_automations",
        available: true,
        jobCount: jobs.length,
        pathKind: "local",
      },
    };
  }

  if (action === "create") {
    const draft = payload.job && typeof payload.job === "object" ? payload.job : {};
    const ownerPrincipalId = String(payload.owner_principal_id || "owner").trim() || "owner";
    const schedule = String(draft.schedule || draft.scheduleText || draft.schedule_text || "").trim() || "manual";
    const job = {
      id: `auto_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`,
      name: compactText(draft.name || draft.title || payload.text || "Automation", 120),
      prompt: String(draft.prompt || payload.text || "").trim(),
      schedule,
      scheduleText: schedule,
      scheduleKind: "local",
      repeat: String(draft.repeat || "forever"),
      enabled: true,
      state: "scheduled",
      status: "scheduled",
      nextRunAt: "",
      lastRunAt: "",
      lastStatus: "",
      lastError: "",
      lastDeliveryError: "",
      deliver: String(draft.deliver || "local"),
      ownerPrincipalId,
      workdir: String(draft.workdir || ""),
      skills: normalizeLocalAutomationSkills(draft.skills),
      model: String(draft.model || ""),
      provider: String(draft.provider || ""),
      outputDocuments: [],
      createdAt: now,
      updatedAt: now,
    };
    if (!payload.dry_run) {
      store.jobs.push(job);
      saveLocalAutomationStore(store);
    }
    return {
      ok: true,
      job: publicLocalAutomationJob(job),
      source: { name: "local_automations", available: true, pathKind: "local" },
    };
  }

  const jobId = String(payload.job_id || "").trim();
  const index = store.jobs.findIndex((job) => String(job.id || "") === jobId);
  const job = index >= 0 ? store.jobs[index] : null;
  if (["delete", "pause", "resume", "update"].includes(action) && !job) {
    return { ok: false, error: "Automation job not found" };
  }
  if (job && String(job.ownerPrincipalId || "owner") !== String(payload.owner_principal_id || "owner")) {
    return { ok: false, error: "Automation job is not owned by this workspace" };
  }

  if (action === "delete") {
    if (!payload.dry_run) {
      store.jobs.splice(index, 1);
      saveLocalAutomationStore(store);
    }
    return {
      ok: true,
      deletedJob: publicLocalAutomationJob(job),
      source: { name: "local_automations", available: true, pathKind: "local" },
    };
  }
  if (action === "pause" || action === "resume") {
    job.enabled = action === "resume";
    job.state = job.enabled ? "scheduled" : "paused";
    job.status = job.state;
    job.updatedAt = now;
    if (!payload.dry_run) saveLocalAutomationStore(store);
    return {
      ok: true,
      job: publicLocalAutomationJob(job),
      source: { name: "local_automations", available: true, pathKind: "local" },
    };
  }
  if (action === "update") {
    const patch = payload.patch && typeof payload.patch === "object" ? payload.patch : {};
    for (const [field, value] of Object.entries({
      name: patch.name,
      prompt: patch.prompt,
      schedule: patch.schedule,
      scheduleText: patch.schedule,
      deliver: patch.deliver,
      model: patch.model,
      provider: patch.provider,
      workdir: patch.workdir,
    })) {
      if (value !== undefined) job[field] = String(value || "");
    }
    if (patch.skills !== undefined) job.skills = normalizeLocalAutomationSkills(patch.skills);
    job.updatedAt = now;
    if (!payload.dry_run) saveLocalAutomationStore(store);
    return {
      ok: true,
      job: publicLocalAutomationJob(job),
      source: { name: "local_automations", available: true, pathKind: "local" },
    };
  }

  return { ok: false, error: `unknown action: ${action}` };
}

function runCronBridge(payload) {
  if (useLocalAutomationBackend()) return runLocalCronBridge(payload);
  if (BRIDGE_HOST_URL) return runBridgeHost("cron", payload, CRON_BRIDGE_TIMEOUT_MS);
  return new Promise((resolve, reject) => {
    const bridge = bridgeCommandProvider.python(CRON_BRIDGE_SCRIPT, [
      "HERMES_WEB_CRON_JOBS_PATH",
      "HERMES_CRON_JOBS_PATH",
      "HERMES_WEB_CRON_JOBS_FALLBACK_PATH",
      "HERMES_WEB_CRON_OUTPUT_ROOT",
    ]);
    const { command, args } = bridge;
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error("Cron bridge timed out"));
    }, CRON_BRIDGE_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 2_000_000) stdout = stdout.slice(-2_000_000);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 200_000) stderr = stderr.slice(-200_000);
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      let result = null;
      try {
        result = JSON.parse(stdout.trim() || "{}");
      } catch (err) {
        reject(new Error(`Cron bridge returned invalid JSON: ${err.message || String(err)}`));
        return;
      }
      if (code !== 0 && !result.error) {
        reject(new Error(stderr.trim() || `Cron bridge exited with ${code}`));
        return;
      }
      if (stderr.trim()) result.stderr = compactText(stderr.trim(), 1200);
      resolve(result);
    });
    child.stdin.end(JSON.stringify(payload || {}));
  });
}

const automationProvider = createAutomationProvider({
  runBridge: runCronBridge,
  cacheTtlMs: CRON_LIST_CACHE_TTL_MS,
  cronOutputRoot: CRON_OUTPUT_ROOT,
  runLogRoot: CRON_RUN_LOG_ROOT,
  extraDeliverableRoots: () => String(process.env.HERMES_WEB_AUTOMATION_DELIVERABLE_ROOTS || "")
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean),
  normalizeLocalPath,
  isPathAllowed,
  isPathProtected: (value) => securityBoundaryProvider.isProtectedPath(value),
  mimeFor,
  findWorkspace,
  authCanAccessWorkspace,
  workspacePrincipal,
  jobMatchesOwner: cronJobMatchesOwner,
});

const externalIntegrationProvider = createExternalIntegrationProvider({
  envPaths: HERMES_ENV_PATHS,
  configPaths: HERMES_CONFIG_PATHS,
  githubCliHostsPaths: GITHUB_CLI_HOSTS_PATHS,
  googleTokenPaths: GOOGLE_TOKEN_PATHS,
  googleClientSecretPaths: GOOGLE_CLIENT_SECRET_PATHS,
  outlookGraphTokenPaths: OUTLOOK_GRAPH_TOKEN_PATHS,
});

function clearCronListCache() {
  automationProvider.clearListCache();
}

async function runCronListBridgeCached(options = {}) {
  return automationProvider.listJobs(Object.assign({ limit: 0 }, options));
}

function runDirectoryBridge(payload) {
  if (BRIDGE_HOST_URL) return runBridgeHost("directory", payload, DIRECTORY_BRIDGE_TIMEOUT_MS);
  return new Promise((resolve, reject) => {
    const bridge = bridgeCommandProvider.python(DIRECTORY_BRIDGE_SCRIPT, [
      "HERMES_WEB_VOLUME1_MOUNT_HELPERS_JSON",
    ]);
    const { command, args } = bridge;
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error("Directory bridge timed out"));
    }, DIRECTORY_BRIDGE_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 4_000_000) stdout = stdout.slice(-4_000_000);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 200_000) stderr = stderr.slice(-200_000);
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      let result = null;
      try {
        result = JSON.parse(stdout.trim() || "{}");
      } catch (err) {
        reject(new Error(`Directory bridge returned invalid JSON: ${err.message || String(err)}`));
        return;
      }
      if (code !== 0 && !result.error) {
        reject(new Error(stderr.trim() || `Directory bridge exited with ${code}`));
        return;
      }
      if (stderr.trim()) result.stderr = compactText(stderr.trim(), 1200);
      resolve(result);
    });
    child.stdin.end(JSON.stringify(payload || {}));
  });
}

const skillDetailProvider = createSkillDetailProvider({
  timeoutMs: SKILL_BRIDGE_TIMEOUT_MS,
  compactText,
  spawn,
  bridgeCommand: () => {
    return bridgeCommandProvider.python(SKILL_BRIDGE_SCRIPT, [
      "HERMES_WEB_SKILLS_ROOT",
    ]);
  },
});

const kanbanTodoBridge = createKanbanTodoBridge({
  command: KANBAN_COMMAND,
  baseArgs: KANBAN_COMMAND_ARGS,
  timeoutMs: KANBAN_BRIDGE_TIMEOUT_MS,
  metadataPath: KANBAN_TODO_META_PATH,
  boardForWorkspace: (workspaceId, principalId) => `workspace-${workspaceId || principalId || "default"}`,
  assigneeForWorkspace: kanbanExecutableProfileForWorkspace,
  boardNameForWorkspace: (workspaceId, principalId) => {
    const workspace = findWorkspace(workspaceId || principalId || "owner");
    return workspace?.label ? `Hermes Mobile ${workspace.label}` : `Hermes Mobile ${workspaceId || principalId || "default"}`;
  },
  workspacePathForWorkspace: (workspaceId) => {
    const root = workspaceDefaultRoot(workspaceId);
    if (!root) return "";
    const commandLooksWsl = /^(?:wsl|wsl\.exe)$/i.test(path.basename(KANBAN_COMMAND));
    if (KANBAN_WORKSPACE_PATH_STYLE === "native") return root;
    if (KANBAN_WORKSPACE_PATH_STYLE === "wsl" || commandLooksWsl) return windowsPathToWsl(root);
    return root;
  },
});

function workerAllowsWorkspace(worker, workspaceId) {
  if (!worker || !workspaceId) return false;
  const allowed = Array.isArray(worker.allowedWorkspaceIds) ? worker.allowedWorkspaceIds : [];
  const skills = Array.isArray(worker.skillWorkspaceIds) ? worker.skillWorkspaceIds : [];
  return allowed.includes("*")
    || allowed.includes(workspaceId)
    || skills.includes("*")
    || skills.includes(workspaceId);
}

const kanbanExecutableProfileCursor = new Map();

function workerProfileId(worker) {
  return String(worker?.profile || worker?.id || worker?.name || "").trim();
}

function kanbanProfileAssignmentCounts(workspace, profiles) {
  const profileSet = new Set((Array.isArray(profiles) ? profiles : []).map(String).filter(Boolean));
  const counts = new Map([...profileSet].map((profile) => [profile, 0]));
  if (!KANBAN_TODO_META_PATH || !profileSet.size) return counts;
  try {
    const parsed = JSON.parse(fs.readFileSync(KANBAN_TODO_META_PATH, "utf8"));
    const todos = parsed?.todos && typeof parsed.todos === "object" ? Object.values(parsed.todos) : [];
    for (const meta of todos) {
      if (String(meta?.workspaceId || meta?.workspace_id || "") !== workspace) continue;
      if (meta?.deletedAt || meta?.deleted_at || meta?.cancelledAt || meta?.cancelled_at || meta?.completedAt || meta?.completed_at) continue;
      const profile = String(meta?.kanbanAssignee || meta?.kanban_assignee || "").trim();
      if (profileSet.has(profile)) counts.set(profile, (counts.get(profile) || 0) + 1);
    }
  } catch (_) {
    // Missing or corrupt metadata should not block Kanban card creation.
  }
  return counts;
}

function nextKanbanExecutableProfile(workspace, workers) {
  const pool = (Array.isArray(workers) ? workers : []).filter((worker) => workerProfileId(worker));
  if (!pool.length) return "";
  const counts = kanbanProfileAssignmentCounts(workspace, pool.map(workerProfileId));
  const lowestCount = Math.min(...pool.map((worker) => counts.get(workerProfileId(worker)) || 0));
  const leastLoaded = pool.filter((worker) => (counts.get(workerProfileId(worker)) || 0) === lowestCount);
  const key = [
    String(workspace || "default").trim() || "default",
    leastLoaded.map(workerProfileId).join(","),
  ].join("|");
  const previous = kanbanExecutableProfileCursor.get(key) || "";
  const previousIndex = leastLoaded.findIndex((worker) => workerProfileId(worker) === previous);
  const nextIndex = (previousIndex + 1) % leastLoaded.length;
  const profile = workerProfileId(leastLoaded[nextIndex]);
  kanbanExecutableProfileCursor.set(key, profile);
  return profile;
}

function kanbanExecutableProfileForWorkspace(workspaceId, principalId, requestedAssignee = "") {
  const workspace = String(workspaceId || principalId || requestedAssignee || "owner").trim() || "owner";
  try {
    const loaded = gatewayPool().load();
    const workers = Array.isArray(loaded?.workers) ? loaded.workers : [];
    const candidates = workers
      .filter((worker) => worker?.profile && worker.securityLevel === "user" && !worker.allowMaintenance)
      .filter((worker) => workerAllowsWorkspace(worker, workspace));
    const explicit = String(requestedAssignee || "").trim();
    const explicitWorker = candidates.find((worker) => workerProfileId(worker) === explicit);
    if (explicitWorker) return workerProfileId(explicitWorker);
    const exactSkill = candidates.filter((worker) => (worker.skillWorkspaceIds || []).includes(workspace));
    const exactAllowed = candidates.filter((worker) => (worker.allowedWorkspaceIds || []).includes(workspace));
    const wildcard = candidates.filter((worker) => (worker.skillWorkspaceIds || []).includes("*") || (worker.allowedWorkspaceIds || []).includes("*"));
    return nextKanbanExecutableProfile(workspace, exactSkill.length ? exactSkill : (exactAllowed.length ? exactAllowed : (wildcard.length ? wildcard : candidates)));
  } catch (_) {
    return "";
  }
}

function workspacePrincipal(workspaceId) {
  const workspace = findWorkspace(workspaceId || "owner");
  return String(workspace?.policy?.principal_id || workspace?.id || "owner");
}

function todoAssigneesForWorkspace(workspaceId) {
  const catalog = loadCatalog();
  const source = workspacePrincipal(workspaceId);
  const allowedMap = catalog.routeMap?.principal_allowed_targets || {};
  let allowed = allowedMap[source];
  if (!Array.isArray(allowed)) allowed = allowed ? [allowed] : [source];
  const allowAll = allowed.includes("*") || source === "owner";
  const ids = new Set(allowAll ? catalog.workspaces.map((item) => item.id) : allowed.map(String));
  ids.add(source);
  return catalog.workspaces
    .filter((item) => ids.has(item.id))
    .map((item) => ({
      id: item.id,
      label: item.label || item.id,
      role: item.role || "user",
    }));
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatLocalDateTime(date) {
  return [
    date.getFullYear(),
    "-",
    pad2(date.getMonth() + 1),
    "-",
    pad2(date.getDate()),
    " ",
    pad2(date.getHours()),
    ":",
    pad2(date.getMinutes()),
  ].join("");
}

function todoAssigneeLabel(workspaceId, principalId) {
  return todoAssigneesForWorkspace(workspaceId).find((item) => item.id === principalId)?.label || principalId;
}

function resolveTodoAssigneeFromText(text, workspaceId) {
  const source = workspacePrincipal(workspaceId);
  const candidates = [];
  for (const item of todoAssigneesForWorkspace(workspaceId)) {
    const labels = [item.label, item.id, stripPrincipalLabelPrefixes(item.id)].filter(Boolean);
    for (const label of labels) candidates.push({ id: item.id, label: String(label) });
  }
  candidates.sort((a, b) => b.label.length - a.label.length);
  const rawText = String(text || "");
  const matched = candidates.find((item) => item.label && rawText.includes(item.label));
  return matched?.id || source;
}

function parseTodoDueFromText(text, now = new Date()) {
  const raw = String(text || "");
  const iso = raw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T]*(\d{1,2})(?::|：)?(\d{1,2})?/);
  if (iso) {
    const date = new Date(now);
    date.setFullYear(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    date.setHours(Number(iso[4]), Number(iso[5] || 0), 0, 0);
    return { dueTime: formatLocalDateTime(date), raw: iso[0] };
  }
  const match = raw.match(/(今天|明天|后天)?\s*(今晚|明早|凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2})\s*(?:点|:|：)\s*(半|\d{1,2}\s*分?)?/);
  if (!match) return null;
  const date = new Date(now);
  const dateWord = match[1] || "";
  const timeWord = match[2] || "";
  let dayOffset = dateWord === "后天" ? 2 : dateWord === "明天" || timeWord === "明早" ? 1 : 0;
  date.setDate(date.getDate() + dayOffset);
  let hour = Number(match[3]);
  let minute = 0;
  const minuteRaw = String(match[4] || "").trim();
  if (minuteRaw === "半") minute = 30;
  else if (minuteRaw) minute = Number((minuteRaw.match(/\d{1,2}/) || ["0"])[0]);
  if ((timeWord === "下午" || timeWord === "晚上" || timeWord === "今晚") && hour < 12) hour += 12;
  if (timeWord === "中午" && hour < 11) hour += 12;
  date.setHours(hour, minute, 0, 0);
  return { dueTime: formatLocalDateTime(date), raw: match[0] };
}

function detectDirectTodoCreateIntent(text, workspaceId) {
  const rawText = String(text || "").trim();
  if (!rawText || !/(待办|看板|卡片|kanban|todo|to-do)/i.test(rawText)) return null;
  if (!/(新增|新建|创建|开启|添加|加|安排|提醒)/.test(rawText)) return null;
  const due = parseTodoDueFromText(rawText);
  if (!due?.dueTime) return null;
  const assignee = resolveTodoAssigneeFromText(rawText, workspaceId);
  const assigneeLabel = todoAssigneeLabel(workspaceId, assignee);
  let content = rawText;
  for (const token of [assigneeLabel, assignee, stripPrincipalLabelPrefixes(assignee)].filter(Boolean)) {
    content = content.replace(new RegExp(`(?:给|为|帮)?\\s*${escapeRegExp(token)}`, "g"), " ");
  }
  content = content
    .replace(due.raw, " ")
    .replace(/(?:请|帮我|给我|我想|我要|需要)?\s*(?:新增|新建|创建|开启|添加|加|安排|提醒)\s*(?:一个|一条|一张)?\s*(?:待办(?:事项)?|看板(?:卡片)?|卡片|kanban|todo|to-do)/ig, " ")
    .replace(/(?:待办(?:事项)?|看板(?:卡片)?|卡片|kanban|todo|to-do)/ig, " ")
    .replace(/[，,。；;：:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!content) return null;
  return { assignee, assigneeLabel, dueTime: due.dueTime, content };
}

function parseWebTodoDueFromText(text, now = new Date()) {
  const raw = String(text || "");
  const iso = raw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T]*(\d{1,2})(?:[:\uff1a])?(\d{1,2})?/);
  if (iso) {
    const date = new Date(now);
    date.setFullYear(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    date.setHours(Number(iso[4]), Number(iso[5] || 0), 0, 0);
    return { dueTime: formatLocalDateTime(date), raw: iso[0] };
  }
  const match = raw.match(/(\u4eca\u5929|\u660e\u5929|\u540e\u5929)?\s*(\u4eca\u665a|\u660e\u65e9|\u51cc\u6668|\u65e9\u4e0a|\u4e0a\u5348|\u4e2d\u5348|\u4e0b\u5348|\u665a\u4e0a)?\s*(\d{1,2})\s*(?:\u70b9|[:\uff1a])\s*(\u534a|\d{1,2}\s*\u5206?)?/);
  if (!match) return null;
  const date = new Date(now);
  const dateWord = match[1] || "";
  const timeWord = match[2] || "";
  let dayOffset = dateWord === "\u540e\u5929" ? 2 : dateWord === "\u660e\u5929" || timeWord === "\u660e\u65e9" ? 1 : 0;
  date.setDate(date.getDate() + dayOffset);
  let hour = Number(match[3]);
  let minute = 0;
  const minuteRaw = String(match[4] || "").trim();
  if (minuteRaw === "\u534a") minute = 30;
  else if (minuteRaw) minute = Number((minuteRaw.match(/\d{1,2}/) || ["0"])[0]);
  if ((timeWord === "\u4e0b\u5348" || timeWord === "\u665a\u4e0a" || timeWord === "\u4eca\u665a") && hour < 12) hour += 12;
  if (timeWord === "\u4e2d\u5348" && hour < 11) hour += 12;
  if (!dateWord && !timeWord && hour < 12 && now.getHours() >= 12) hour += 12;
  date.setHours(hour, minute, 0, 0);
  if (!dateWord && date.getTime() <= now.getTime()) {
    date.setDate(date.getDate() + 1);
  }
  return { dueTime: formatLocalDateTime(date), raw: match[0] };
}

function detectDirectTodoCreateIntentForWeb(text, workspaceId) {
  const rawText = String(text || "").trim();
  if (!rawText || !/(\u5f85\u529e|\u770b\u677f|\u5361\u7247|kanban|todo|to-do)/i.test(rawText)) return null;
  if (!/(\u65b0\u589e|\u65b0\u5efa|\u521b\u5efa|\u5f00\u542f|\u6dfb\u52a0|\u589e\u52a0|\u5b89\u6392|\u63d0\u9192|\u52a0)/.test(rawText)) return null;
  const due = parseWebTodoDueFromText(rawText);
  if (!due?.dueTime) return null;
  const assignee = resolveTodoAssigneeFromText(rawText, workspaceId);
  const assigneeLabel = todoAssigneeLabel(workspaceId, assignee);
  let content = rawText;
  for (const token of [assigneeLabel, assignee, stripPrincipalLabelPrefixes(assignee)].filter(Boolean)) {
    content = content.replace(new RegExp(`(?:\\u7ed9|\\u4e3a|\\u5e2e)?\\s*${escapeRegExp(token)}`, "g"), " ");
  }
  content = content
    .replace(due.raw, " ")
    .replace(/(?:\u8bf7|\u5e2e\u6211|\u7ed9\u6211|\u6211\u60f3|\u6211\u8981|\u9700\u8981)?\s*(?:\u65b0\u589e|\u65b0\u5efa|\u521b\u5efa|\u5f00\u542f|\u6dfb\u52a0|\u589e\u52a0|\u5b89\u6392|\u63d0\u9192|\u52a0)\s*(?:\u4e00\u4e2a|\u4e00\u6761|\u4e00\u5f20)?\s*(?:\u5f85\u529e(?:\u4e8b\u9879)?|\u770b\u677f(?:\u5361\u7247)?|\u5361\u7247|kanban|todo|to-do)/ig, " ")
    .replace(/(?:\u8bf7|\u5e2e\u6211|\u7ed9\u6211|\u6211\u60f3|\u6211\u8981|\u9700\u8981)?\s*(?:\u65b0\u589e|\u65b0\u5efa|\u521b\u5efa|\u5f00\u542f|\u6dfb\u52a0|\u589e\u52a0|\u5b89\u6392|\u63d0\u9192|\u52a0)/ig, " ")
    .replace(/(?:\u4e00\u4e2a|\u4e00\u6761|\u4e00\u5f20)?\s*(?:\u5f85\u529e(?:\u4e8b\u9879)?|\u770b\u677f(?:\u5361\u7247)?|\u5361\u7247|kanban|todo|to-do)/ig, " ")
    .replace(/(?:\u5f85\u529e(?:\u4e8b\u9879)?|\u770b\u677f(?:\u5361\u7247)?|\u5361\u7247|kanban|todo|to-do)/ig, " ")
    .replace(/\u7684/g, " ")
    .replace(/[\uff0c,.\u3002\uff1b;\uff1a:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!content) return null;
  return { assignee, assigneeLabel, dueTime: due.dueTime, content };
}

function detectDirectKanbanCreateRequest(text) {
  const rawText = String(text || "").trim();
  if (!rawText) return false;
  if (!/(看板|卡片|kanban|board)/i.test(rawText)) return false;
  return /(\badd\b|\bcreate\b|\bnew\b|新增|新建|创建|增加|添加|加入|放进|放入|安排|登记|记录|补建|补录|生成)/i.test(rawText);
}

function directTodoCreateNeedsKanbanFields(todo) {
  if (!todo || typeof todo !== "object") return useKanbanTodoBackend();
  const source = String(todo.source || "").trim().toLowerCase();
  if (source === "kanban" || source === "hermes_kanban") return true;
  return useKanbanTodoBackend();
}

function verifyDirectTodoCreateResult(todo) {
  const id = String(todo?.id || "").trim();
  if (!id) {
    return { ok: false, error: "Todo created but no visible card id returned." };
  }
  if (directTodoCreateNeedsKanbanFields(todo)) {
    const board = String(todo?.kanbanBoard || "").trim();
    const status = String(todo?.kanbanStatus || "").trim();
    if (!board || !status) {
      return { ok: false, error: "Kanban card creation returned without board/status metadata." };
    }
  }
  return { ok: true, error: "" };
}

function formatDirectTodoCreateSuccessMessage(intent, todo) {
  const assigneeLabel = String(intent?.assigneeLabel || "").trim() || "owner";
  const dueTime = String(intent?.dueTime || "").trim() || "no due time";
  const content = String(intent?.content || "").trim() || String(todo?.content || "").trim() || "todo";
  const id = String(todo?.id || "").trim();
  const source = String(todo?.source || "").trim() || "unknown";
  const board = String(todo?.kanbanBoard || "").trim();
  const status = String(todo?.kanbanStatus || "").trim();
  const details = [`ID: ${id}`, `Source: ${source}`];
  if (board) details.push(`Board: ${board}`);
  if (status) details.push(`Status: ${status}`);
  return `\u5df2\u65b0\u589e\u770b\u677f\u5361\u7247\uff1a${assigneeLabel} | ${dueTime} | ${content}\n${details.join(" | ")}`;
}

function isKanbanStudyCaseMode(mode) {
  return KANBAN_STUDY_CASE_MODES.has(String(mode || "").trim());
}

function isKanbanAssessmentCaseMode(mode) {
  return KANBAN_ASSESSMENT_CASE_MODES.has(String(mode || "").trim());
}

function normalizeWorkspaceIdList(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[,\s;，、]+/);
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const id = String(item || "").trim();
    if (!id || seen.has(id) || !findWorkspace(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function kanbanCaseShareStore() {
  const raw = readJsonStore(KANBAN_CASE_SHARE_PATH, { schemaVersion: 1, cases: {} });
  return {
    schemaVersion: 1,
    cases: raw?.cases && typeof raw.cases === "object" && !Array.isArray(raw.cases) ? raw.cases : {},
  };
}

function saveKanbanCaseShareStore(store) {
  writeJsonStore(KANBAN_CASE_SHARE_PATH, Object.assign({ schemaVersion: 1 }, store || {}));
}

function kanbanCaseShareKey(ownerWorkspaceId, caseId) {
  return `${String(ownerWorkspaceId || "owner").trim() || "owner"}::${String(caseId || "").trim()}`;
}

function readKanbanCaseShare(ownerWorkspaceId, caseId) {
  const key = kanbanCaseShareKey(ownerWorkspaceId, caseId);
  const share = kanbanCaseShareStore().cases[key];
  return share && typeof share === "object" && !Array.isArray(share) ? share : null;
}

function upsertKanbanCaseShare(ownerWorkspaceId, caseId, input = {}) {
  const owner = String(ownerWorkspaceId || "owner").trim() || "owner";
  const id = String(caseId || "").trim();
  if (!id) return null;
  const performerWorkspaceIds = normalizeWorkspaceIdList(
    input.performerWorkspaceIds
    || input.performer_workspace_ids
    || input.targetWorkspaceIds
    || input.target_workspace_ids
    || input.performerWorkspaceId
    || input.performer_workspace_id
    || input.targetWorkspaceId
    || input.target_workspace_id
    || "",
  ).filter((workspaceId) => workspaceId !== owner);
  const viewerWorkspaceIds = normalizeWorkspaceIdList(
    input.viewerWorkspaceIds
    || input.viewer_workspace_ids
    || input.readonlyWorkspaceIds
    || input.readonly_workspace_ids
    || input.sharedViewerWorkspaceIds
    || input.shared_viewer_workspace_ids
    || "",
  ).filter((workspaceId) => workspaceId !== owner && !performerWorkspaceIds.includes(workspaceId));
  const managerWorkspaceIds = normalizeWorkspaceIdList(
    input.managerWorkspaceIds
    || input.manager_workspace_ids
    || "",
  ).filter((workspaceId) => workspaceId !== owner);
  const topic = input.topic && typeof input.topic === "object" && !Array.isArray(input.topic) ? input.topic : input;
  const store = kanbanCaseShareStore();
  const key = kanbanCaseShareKey(owner, id);
  const previous = store.cases[key] && typeof store.cases[key] === "object" ? store.cases[key] : {};
  const share = {
    schemaVersion: 1,
    ownerWorkspaceId: owner,
    caseId: id,
    performerWorkspaceIds,
    viewerWorkspaceIds,
    managerWorkspaceIds,
    topicThreadId: String(topic.topicThreadId || topic.topic_thread_id || previous.topicThreadId || "").trim(),
    topicTaskGroupId: String(topic.topicTaskGroupId || topic.topic_task_group_id || previous.topicTaskGroupId || "").trim(),
    sharedDirectoryPath: String(topic.sharedDirectoryPath || topic.shared_directory_path || previous.sharedDirectoryPath || "").trim(),
    caseDirectoryPath: String(topic.caseDirectoryPath || topic.case_directory_path || previous.caseDirectoryPath || "").trim(),
    updatedAt: nowIso(),
    createdAt: previous.createdAt || nowIso(),
  };
  store.cases[key] = share;
  saveKanbanCaseShareStore(store);
  return share;
}

function kanbanCaseRoleForAuth(auth, ownerWorkspaceId, caseId) {
  const owner = String(ownerWorkspaceId || "owner").trim() || "owner";
  if (isOwnerAuth(auth) || authCanAccessWorkspace(auth, owner)) return "manager";
  const actorWorkspaceId = String(auth?.workspaceId || "").trim();
  if (!actorWorkspaceId) return "";
  const share = readKanbanCaseShare(owner, caseId);
  if (!share) return "";
  if (normalizeWorkspaceIdList(share.managerWorkspaceIds).includes(actorWorkspaceId)) return "manager";
  if (normalizeWorkspaceIdList(share.performerWorkspaceIds).includes(actorWorkspaceId)) return "performer";
  if (normalizeWorkspaceIdList(share.viewerWorkspaceIds).includes(actorWorkspaceId)) return "viewer";
  return "";
}

function kanbanCaseRoleForWorkspaceActor(actorWorkspaceId, ownerWorkspaceId, caseId, auth = null) {
  const owner = String(ownerWorkspaceId || "owner").trim() || "owner";
  const actor = String(actorWorkspaceId || "").trim();
  if (!actor) return kanbanCaseRoleForAuth(auth, owner, caseId);
  if (actor === owner) return "manager";
  const share = readKanbanCaseShare(owner, caseId);
  if (!share) return isOwnerAuth(auth) ? "manager" : "";
  if (normalizeWorkspaceIdList(share.managerWorkspaceIds).includes(actor)) return "manager";
  if (normalizeWorkspaceIdList(share.performerWorkspaceIds).includes(actor)) return "performer";
  if (normalizeWorkspaceIdList(share.viewerWorkspaceIds).includes(actor)) return "viewer";
  return isOwnerAuth(auth) ? "manager" : "";
}

function kanbanActorPermissions(role) {
  const normalized = String(role || "").trim();
  if (normalized === "manager") {
    return {
      canView: true,
      canManage: true,
      canRevise: true,
      canDelete: true,
      canComment: true,
      canSubmitStudy: true,
      canAnswerQuiz: true,
    };
  }
  if (normalized === "performer") {
    return {
      canView: true,
      canManage: false,
      canRevise: false,
      canDelete: false,
      canComment: false,
      canSubmitStudy: true,
      canAnswerQuiz: true,
    };
  }
  if (normalized === "viewer") {
    return {
      canView: true,
      canManage: false,
      canRevise: false,
      canDelete: false,
      canComment: false,
      canSubmitStudy: false,
      canAnswerQuiz: false,
    };
  }
  return {
    canView: false,
    canManage: false,
    canRevise: false,
    canDelete: false,
    canComment: false,
    canSubmitStudy: false,
    canAnswerQuiz: false,
  };
}

function annotateKanbanCardForAuth(card, auth, options = {}) {
  if (!card || typeof card !== "object") return card;
  const workspaceId = String(card.workspaceId || card.workspace_id || "").trim() || "owner";
  const caseId = String(card.kanbanCaseId || card.kanban_case_id || "").trim();
  const role = caseId
    ? (options.actorWorkspaceId
      ? kanbanCaseRoleForWorkspaceActor(options.actorWorkspaceId, workspaceId, caseId, auth)
      : kanbanCaseRoleForAuth(auth, workspaceId, caseId))
    : (authCanAccessWorkspace(auth, workspaceId) ? "manager" : "");
  if (!role) return card;
  return Object.assign({}, card, {
    kanbanActorRole: role,
    kanbanActorPermissions: kanbanActorPermissions(role),
    kanbanShareOwnerWorkspaceId: workspaceId,
  });
}

function annotateKanbanCardsForAuth(cards, auth, options = {}) {
  return (Array.isArray(cards) ? cards : []).map((card) => annotateKanbanCardForAuth(card, auth, options));
}

function kanbanCaseTopicPermissionsForTaskGroup(thread, taskGroupId, auth) {
  if (!isKanbanCaseTopicThread(thread) || !taskGroupId) return null;
  const meta = normalizeTaskGroupMeta(thread.taskGroupMeta)[taskGroupId] || {};
  const caseId = String(meta.kanbanCaseId || meta.kanban_case_id || "").trim();
  const ownerWorkspaceId = String(meta.kanbanCaseOwnerWorkspaceId || meta.kanban_case_owner_workspace_id || thread.workspaceId || "owner").trim() || "owner";
  if (!caseId) return null;
  const role = kanbanCaseRoleForAuth(auth, ownerWorkspaceId, caseId);
  return kanbanActorPermissions(role);
}

function kanbanShareActorWorkspaceId(auth, selectedWorkspaceId = "") {
  const selected = String(selectedWorkspaceId || "").trim();
  return isOwnerAuth(auth) && selected && selected !== "owner"
    ? selected
    : String(auth?.workspaceId || "").trim();
}

function kanbanCaseSharesForActor(auth, selectedWorkspaceId = "") {
  const actorWorkspaceId = kanbanShareActorWorkspaceId(auth, selectedWorkspaceId);
  if (!actorWorkspaceId) return [];
  const cases = Object.values(kanbanCaseShareStore().cases || {});
  return cases.filter((share) => {
    if (!share || typeof share !== "object") return false;
    return normalizeWorkspaceIdList(share.managerWorkspaceIds).includes(actorWorkspaceId)
      || normalizeWorkspaceIdList(share.performerWorkspaceIds).includes(actorWorkspaceId)
      || normalizeWorkspaceIdList(share.viewerWorkspaceIds).includes(actorWorkspaceId);
  });
}

async function sharedKanbanCardsForAuth(auth, selectedWorkspaceId, listArgs = {}) {
  const actorWorkspaceId = kanbanShareActorWorkspaceId(auth, selectedWorkspaceId);
  const shares = kanbanCaseSharesForActor(auth, selectedWorkspaceId).filter((share) => (
    String(share.ownerWorkspaceId || "owner") !== String(selectedWorkspaceId || "owner")
  ));
  if (!shares.length) return [];
  const byOwner = new Map();
  for (const share of shares) {
    const owner = String(share.ownerWorkspaceId || "owner").trim() || "owner";
    if (!byOwner.has(owner)) byOwner.set(owner, new Set());
    byOwner.get(owner).add(String(share.caseId || "").trim());
  }
  const out = [];
  for (const [ownerWorkspaceId, caseIds] of byOwner.entries()) {
    const result = await kanbanCardProvider.listCards(Object.assign({}, listArgs, {
      workspaceId: ownerWorkspaceId,
      includeCompleted: true,
      limit: Math.max(Number(listArgs.limit || 120), 500),
    })).catch((err) => ({ ok: false, error: err?.message || String(err) }));
    if (!result?.ok) continue;
    for (const card of result.data || []) {
      if (caseIds.has(String(card.kanbanCaseId || "").trim())) {
        out.push(annotateKanbanCardForAuth(card, auth, { actorWorkspaceId }));
      }
    }
  }
  return out;
}

function kanbanPermissionAllows(role, capability) {
  const permissions = kanbanActorPermissions(role);
  if (capability === "view") return permissions.canView;
  if (capability === "submitStudy") return permissions.canSubmitStudy;
  if (capability === "answerQuiz") return permissions.canAnswerQuiz;
  if (capability === "comment") return permissions.canComment;
  if (capability === "revise") return permissions.canRevise;
  if (capability === "delete") return permissions.canDelete;
  return permissions.canManage;
}

async function resolveKanbanCardAccess(req, res, workspaceId, cardId, capability = "view") {
  const id = String(workspaceId || "owner").trim() || "owner";
  if (!findWorkspace(id)) {
    sendJson(res, 400, { error: "Unknown workspace" });
    return null;
  }
  const auth = authenticateRequest(req);
  if (authCanAccessWorkspace(auth, id)) return { workspaceId: id, auth, role: "manager", context: null, card: null };
  const context = await readingContextForCard(id, cardId).catch(() => null);
  const card = context?.current || null;
  if (!card) {
    sendJson(res, 404, { error: "Kanban card not found" });
    return null;
  }
  const role = kanbanCaseRoleForAuth(auth, id, card.kanbanCaseId);
  if (!role || !kanbanPermissionAllows(role, capability)) {
    sendJson(res, 403, { error: "Kanban card access is not allowed" });
    return null;
  }
  return { workspaceId: id, auth, role, context, card };
}

function publicTodo(row) {
  const workspaceId = String(row.workspace_id || row.workspaceId || "").trim();
  const kanbanResult = String(row.kanban_result || row.kanbanResult || "");
  const payload = {
    id: String(row.id || ""),
    workspaceId,
    content: String(row.content || ""),
    status: String(row.status || ""),
    assignee: String(row.assignee_principal_id || row.assignee || ""),
    assigneeLabel: String(row.assignee_label || row.assignee_principal_id || ""),
    createdBy: String(row.created_by_principal || row.createdBy || ""),
    dueAt: String(row.due_at || ""),
    dueLocal: String(row.due_local || ""),
    timezone: String(row.timezone || ""),
    reminderLeadMinutes: Number(row.reminder_lead_minutes || 0),
    recurrence: String(row.recurrence_kind || "none"),
    recurrenceLabel: String(row.recurrence_label || ""),
    recurrenceDays: String(row.recurrence_days || ""),
    recurrenceSeriesId: String(row.recurrence_series_id || ""),
    recurrenceTemplate: Boolean(row.recurrence_template),
    source: String(row.source || ""),
    kanbanBoard: String(row.kanban_board || row.kanbanBoard || ""),
    kanbanStatus: String(row.kanban_status || row.kanbanStatus || ""),
    kanbanAssignee: String(row.kanban_assignee || row.kanbanAssignee || ""),
    kanbanPriority: Number(row.kanban_priority || row.kanbanPriority || 0),
    kanbanTenant: String(row.kanban_tenant || row.kanbanTenant || ""),
    kanbanWorkspaceKind: String(row.kanban_workspace_kind || row.kanbanWorkspaceKind || ""),
    kanbanCreatedBy: String(row.kanban_created_by || row.kanbanCreatedBy || ""),
    kanbanStartedAt: String(row.kanban_started_at || row.kanbanStartedAt || ""),
    kanbanCompletedAt: String(row.kanban_completed_at || row.kanbanCompletedAt || ""),
    kanbanResult,
    kanbanOutputs: publicKanbanOutputsFromText(workspaceId, kanbanResult),
    kanbanBlockReason: String(row.kanban_block_reason || row.kanbanBlockReason || ""),
    kanbanMaxRetries: Number(row.kanban_max_retries || row.kanbanMaxRetries || 0),
    kanbanSkills: Array.isArray(row.kanban_skills || row.kanbanSkills)
      ? (row.kanban_skills || row.kanbanSkills).map((item) => String(item || "")).filter(Boolean).slice(0, 8)
      : [],
    kanbanCaseId: String(row.kanban_case_id || row.kanbanCaseId || ""),
    kanbanCaseMode: String(row.kanban_case_mode || row.kanbanCaseMode || ""),
    kanbanCaseTemplate: String(row.kanban_case_template || row.kanbanCaseTemplate || ""),
    kanbanCaseSourceText: String(row.kanban_case_source_text || row.kanbanCaseSourceText || ""),
    kanbanCaseSummary: String(row.kanban_case_summary || row.kanbanCaseSummary || ""),
    kanbanCaseCover: publicKanbanCoverFile(workspaceId, row.kanban_case_cover || row.kanbanCaseCover || null),
    kanbanCaseCardId: String(row.kanban_case_card_id || row.kanbanCaseCardId || ""),
    kanbanCaseCardIndex: Number(row.kanban_case_card_index || row.kanbanCaseCardIndex || 0),
    kanbanCaseCardCount: Number(row.kanban_case_card_count || row.kanbanCaseCardCount || 0),
    kanbanCaseDependsOn: Array.isArray(row.kanban_case_depends_on || row.kanbanCaseDependsOn)
      ? (row.kanban_case_depends_on || row.kanbanCaseDependsOn).map((item) => String(item || "")).filter(Boolean).slice(0, 12)
      : [],
    kanbanCaseDeliverables: Array.isArray(row.kanban_case_deliverables || row.kanbanCaseDeliverables)
      ? (row.kanban_case_deliverables || row.kanbanCaseDeliverables).map((item) => String(item || "")).filter(Boolean).slice(0, 8)
      : [],
    kanbanCaseAcceptance: Array.isArray(row.kanban_case_acceptance || row.kanbanCaseAcceptance)
      ? (row.kanban_case_acceptance || row.kanbanCaseAcceptance).map((item) => String(item || "")).filter(Boolean).slice(0, 8)
      : [],
    kanbanCaseCardGoal: String(row.kanban_case_card_goal || row.kanbanCaseCardGoal || ""),
    kanbanRevisionOf: String(row.kanban_revision_of || row.kanbanRevisionOf || ""),
    kanbanRevisionRequest: String(row.kanban_revision_request || row.kanbanRevisionRequest || ""),
    kanbanRevisionRequestedAt: String(row.kanban_revision_requested_at || row.kanbanRevisionRequestedAt || ""),
    kanbanRevisionRequestedBy: String(row.kanban_revision_requested_by || row.kanbanRevisionRequestedBy || ""),
    kanbanRevisionCount: Number(row.kanban_revision_count || row.kanbanRevisionCount || 0),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    completedAt: String(row.completed_at || ""),
    cancelledAt: String(row.cancelled_at || ""),
  };
  if (isKanbanStudyCaseMode(payload.kanbanCaseMode) && payload.kanbanCaseTemplate !== "final-assessment") {
    payload.readingSubmission = publicKanbanReadingSubmissionSummary(workspaceId, payload);
    payload.studySubmission = payload.readingSubmission;
    payload.kanbanStudyKind = payload.kanbanCaseTemplate || "custom";
  }
  if (isKanbanAssessmentCaseMode(payload.kanbanCaseMode) || payload.kanbanCaseTemplate === "final-assessment") {
    payload.assessmentExam = publicKanbanAssessmentSummary(workspaceId, payload);
    payload.kanbanAssessmentKind = payload.kanbanCaseTemplate || "assessment";
    if (payload.assessmentExam && !payload.assessmentExam.lastAttempt && String(payload.assessmentExam.status || "") !== "completed") {
      payload.status = payload.status === "cancelled" ? payload.status : "open";
      payload.kanbanStatus = payload.kanbanStatus === "archived" ? payload.kanbanStatus : "blocked";
      payload.kanbanCompletedAt = "";
      payload.completedAt = "";
      payload.kanbanResult = "";
      payload.kanbanOutputs = [];
    }
  }
  return payload;
}

function kanbanOutputAccessThread(workspaceId) {
  const workspace = String(workspaceId || "owner").trim() || "owner";
  return {
    id: `kanban-output-${workspace}`,
    workspaceId: workspace,
    projectId: "general",
    subprojectId: "",
    singleWindow: false,
  };
}

function kanbanOutputCaseIdFromPath(workspaceId, rawPath) {
  const localPath = normalizeLocalPath(rawPath);
  if (!localPath) return "";
  const root = path.resolve(KANBAN_READING_ARTIFACT_ROOT, safeStorageSegment(workspaceId || "owner"));
  const relative = path.relative(root, localPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return "";
  return relative.split(/[\\/]+/)[0] || "";
}

function authCanAccessKanbanOutput(auth, workspaceId, rawPath) {
  const workspace = String(workspaceId || "owner").trim() || "owner";
  if (authCanAccessWorkspace(auth, workspace)) return true;
  const caseId = kanbanOutputCaseIdFromPath(workspace, rawPath);
  if (!caseId) return false;
  return Boolean(kanbanCaseRoleForAuth(auth, workspace, caseId));
}

function resolveKanbanOutputFile(workspaceId, rawPath, auth = null) {
  const workspace = String(workspaceId || "owner").trim() || "owner";
  if (auth && !authCanAccessKanbanOutput(auth, workspace, rawPath)) return { status: 404, error: "File not found" };
  const displayPath = String(rawPath || "").trim();
  const localPath = normalizeLocalPath(displayPath);
  if (!displayPath || !localPath) return { status: 404, error: "File not found" };
  const thread = kanbanOutputAccessThread(workspace);
  if (!isPathAllowedForThread(thread, localPath, displayPath)) return { status: 404, error: "File not found or not allowed" };
  let stat;
  try {
    stat = fs.statSync(localPath);
  } catch (_) {
    return { status: 404, error: "File not found" };
  }
  if (!stat.isFile()) return { status: 400, error: "Path is not a file" };
  return {
    file: {
      localPath,
      displayPath: logicalUserPathFallback(displayPath, path.basename(localPath)),
      name: path.basename(localPath),
      mime: mimeFor(localPath),
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
    },
  };
}

function publicKanbanOutputFile(workspaceId, rawPath) {
  const resolved = resolveKanbanOutputFile(workspaceId, rawPath, null);
  if (!resolved.file) return null;
  const params = new URLSearchParams({ workspaceId: String(workspaceId || "owner"), path: String(rawPath || "") });
  return {
    name: resolved.file.name,
    path: String(rawPath || ""),
    displayPath: resolved.file.displayPath,
    mime: resolved.file.mime,
    size: resolved.file.size,
    updatedAt: resolved.file.updatedAt,
    url: `/api/kanban/cards/output?${params.toString()}`,
  };
}

function publicKanbanCoverFile(workspaceId, rawCover) {
  const cover = rawCover && typeof rawCover === "object" && !Array.isArray(rawCover)
    ? rawCover
    : { path: String(rawCover || "") };
  const coverPath = String(cover.path || "").trim();
  if (!coverPath) return null;
  const file = publicKanbanOutputFile(workspaceId, coverPath);
  if (!file) return null;
  return Object.assign({}, file, {
    role: "cover",
    name: cover.name || file.name,
    mime: cover.mime || file.mime,
    size: Number(cover.size || file.size || 0) || 0,
  });
}

function publicKanbanOutputsFromText(workspaceId, text) {
  const workspace = String(workspaceId || "").trim();
  if (!workspace) return [];
  return extractArtifactPaths(text)
    .map((item) => publicKanbanOutputFile(workspace, item))
    .filter(Boolean)
    .slice(0, 12);
}

function publicKanbanReadingSubmissionSummary(workspaceId, card = {}) {
  const mode = String(card?.kanbanCaseMode || card?.kanban_case_mode || "").trim();
  if (!isKanbanStudyCaseMode(mode)) return null;
  const cardId = String(card?.id || card?.cardId || "").trim();
  if (!cardId) return null;
  const currentCard = {
    kanbanCaseId: String(card?.kanbanCaseId || card?.kanban_case_id || "").trim(),
  };
  const state = readKanbanReadingSubmissionState(workspaceId, cardId, currentCard);
  if (!state || typeof state !== "object") return null;
  const attempts = Array.isArray(state.attempts) ? state.attempts : [];
  const lastAttempt = attempts.length ? attempts[attempts.length - 1] : null;
  return {
    status: String(state.status || "quiz_pending"),
    submittedAt: String(state.submittedAt || ""),
    completedAt: String(state.completedAt || ""),
    quizAvailable: Boolean(state.quiz),
    quizUrl: String(state.quizUrl || readingQuizUrl(workspaceId, cardId)),
    analysisOutput: state.analysisPath ? publicKanbanOutputFile(workspaceId, state.analysisPath) : null,
    lastAttempt: lastAttempt ? {
      submittedAt: String(lastAttempt.submittedAt || ""),
      score: Number(lastAttempt.score || 0),
      correctCount: Number(lastAttempt.correctCount || 0),
      total: Number(lastAttempt.total || 10),
      passed: Boolean(lastAttempt.passed),
    } : null,
  };
}

function eventPreviewText(event) {
  if (!event || typeof event !== "object") return "";
  const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
  return compactText(payload.note || payload.summary || payload.error || event.message || event.kind || "", 360);
}

function publicKanbanCardDetail(workspaceId, detail = {}) {
  const runs = Array.isArray(detail.runs) ? detail.runs : [];
  const events = Array.isArray(detail.events) ? detail.events : [];
  const comments = Array.isArray(detail.comments) ? detail.comments : [];
  const latestRun = [...runs].reverse().find((run) => run && (run.summary || run.metadata));
  const summary = compactText(
    detail.latest_summary
    || detail.latestSummary
    || detail.task?.result
    || latestRun?.summary
    || "",
    4000,
  );
  const outputPaths = new Set();
  for (const run of runs) {
    const outputs = run?.metadata?.outputs;
    if (Array.isArray(outputs)) outputs.forEach((item) => outputPaths.add(String(item || "")));
  }
  for (const comment of comments) {
    const commentText = [comment?.text, comment?.body, comment?.comment].filter(Boolean).join("\n");
    for (const pathText of extractArtifactPaths(commentText)) outputPaths.add(pathText);
  }
  for (const pathText of extractArtifactPaths(summary)) outputPaths.add(pathText);
  for (const pathText of extractArtifactPaths(detail.log || "")) outputPaths.add(pathText);
  const outputs = [...outputPaths].map((item) => publicKanbanOutputFile(workspaceId, item)).filter(Boolean);
  return {
    summary,
    outputs,
    comments: comments.slice(-12).map((comment) => ({
      author: String(comment.author || comment.created_by || ""),
      text: compactText(comment.text || comment.body || comment.comment || "", 800),
      createdAt: dateStringFromTaskLike(comment.created_at || comment.createdAt || ""),
    })),
    events: events.slice(-20).map((event) => ({
      kind: String(event.kind || ""),
      preview: eventPreviewText(event),
      createdAt: dateStringFromTaskLike(event.created_at || event.createdAt || ""),
    })).filter((event) => event.kind || event.preview),
    runs: runs.slice(-8).map((run) => ({
      id: String(run.id || ""),
      profile: String(run.profile || ""),
      status: String(run.status || ""),
      outcome: String(run.outcome || ""),
      summary: compactText(run.summary || "", 1200),
      startedAt: dateStringFromTaskLike(run.started_at || run.startedAt || ""),
      endedAt: dateStringFromTaskLike(run.ended_at || run.endedAt || ""),
    })),
    logTail: compactText(detail.log || "", 4000),
  };
}

function dateStringFromTaskLike(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d+(?:\.\d+)?$/.test(text)) return dateStringFromTaskLike(Number(text));
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}

function boolParam(value) {
  return /^(1|true|yes|on)$/i.test(String(value || ""));
}

function cronJobMatchesSearch(job, search) {
  if (!search) return true;
  return [
    job?.id,
    job?.name,
    job?.promptPreview,
    job?.schedule,
    job?.status,
    job?.deliver,
    job?.ownerPrincipalId,
    ...(Array.isArray(job?.skills) ? job.skills : []),
    ...(Array.isArray(job?.outputDocuments) ? job.outputDocuments.map((doc) => doc?.name || "") : []),
  ].join("\n").toLowerCase().includes(search);
}

function cronJobMatchesOwner(job, ownerPrincipalId) {
  const owner = String(job?.ownerPrincipalId || "").trim();
  const expected = String(ownerPrincipalId || "").trim();
  if (!expected) return false;
  if (owner) return owner === expected;
  return expected === "owner";
}

function responseTextFromValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(responseTextFromValue).filter(Boolean).join("");
  if (typeof value !== "object") return "";
  if (typeof value.output_text === "string") return value.output_text;
  if (typeof value.text === "string") return value.text;
  if (typeof value.content === "string") return value.content;
  return [
    responseTextFromValue(value.output),
    responseTextFromValue(value.content),
    responseTextFromValue(value.message),
    responseTextFromValue(value.response),
  ].filter(Boolean).join("");
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("Hermes model returned an empty automation draft");
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  try {
    return JSON.parse(candidate);
  } catch (_) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new Error("Hermes model did not return valid JSON for the automation draft");
  }
}

async function hermesModelText(body, timeoutMs = AUTOMATION_CREATE_TIMEOUT_MS) {
  let text = "";
  const gatewayTarget = await chooseGatewayRunTarget({ purpose: "automation_draft" });
  const response = await gatewayPool().runnerFor(gatewayTarget).streamResponses(body, {
    signal: AbortSignal.timeout(Math.max(5000, timeoutMs)),
    gatewayUrl: gatewayTarget.apiBase,
    apiKey: gatewayTarget.apiKey,
    onEvent: (event) => {
      const eventName = String(event.event || event.type || "");
      if (eventName === "message.delta" || eventName === "response.output_text.delta") {
        text += String(event.delta || event.text || "");
      } else {
        text += responseTextFromValue(event.output_text || event.output || event.message || "");
      }
    },
  });
  if (!response?.body?.getReader) text += responseTextFromValue(response);
  return text.trim();
}

function runProcessText(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const timeoutMs = Math.max(1000, Number(options.timeoutMs || 30000));
    const maxOutputBytes = Math.max(8192, Number(options.maxOutputBytes || 2_000_000));
    const child = spawn(command, args.map(String), {
      cwd: options.cwd || undefined,
      env: options.env || process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const append = (current, chunk) => (current + chunk.toString("utf8")).slice(-maxOutputBytes);
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      const err = new Error(`${command} timed out after ${timeoutMs}ms`);
      err.code = "ETIMEDOUT";
      err.stdout = stdout;
      err.stderr = stderr;
      reject(err);
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      err.stdout = stdout;
      err.stderr = stderr;
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr, code });
        return;
      }
      const err = new Error(`${command} exited with code ${code}`);
      err.code = code;
      err.stdout = stdout;
      err.stderr = stderr;
      reject(err);
    });
  });
}

function arrayOfStrings(value, limit = 12) {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return dedupe(raw.map((item) => String(item || "").trim()).filter(Boolean)).slice(0, limit);
}

function normalizeAutomationSchedule(value) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  return String(value.expr || value.expression || value.cron || value.run_at || value.runAt || value.interval || value.display || "").trim();
}

function normalizeAutomationRepeat(value, schedule) {
  if (value == null || value === "" || /^forever$/i.test(String(value))) return null;
  if (/^once$/i.test(String(value))) return 1;
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return /\bevery\b|[*]/i.test(String(schedule || "")) ? null : 1;
}

function normalizeAutomationDraft(raw, sourceText) {
  const draft = raw && typeof raw === "object" ? raw : {};
  if (draft.needs_clarification || draft.needsClarification) {
    throw new Error(compactText(draft.clarification || draft.question || "Automation request needs clarification", 240));
  }
  const schedule = normalizeAutomationSchedule(draft.schedule || draft.scheduleText || draft.schedule_text || draft.cron);
  if (!schedule) throw new Error("Hermes model did not produce a schedule for the automation");
  const name = compactText(draft.name || draft.title || sourceText, 80);
  const promptBase = String(draft.prompt || draft.task || draft.goal || draft.objective || sourceText || "").trim();
  if (!promptBase) throw new Error("Hermes model did not produce an automation prompt");
  const prompt = [
    promptBase,
    "",
    createAutomationDeliveryRequirement(),
  ].join("\n");
  return {
    name,
    prompt,
    schedule,
    repeat: normalizeAutomationRepeat(draft.repeat, schedule),
    deliver: "local",
    skills: arrayOfStrings(draft.skills),
    enabled_toolsets: arrayOfStrings(draft.enabled_toolsets || draft.enabledToolsets),
    model: typeof draft.model === "string" ? draft.model.trim() : "",
    provider: typeof draft.provider === "string" ? draft.provider.trim() : "",
  };
}

async function interpretAutomationNaturalLanguage(text, workspace, ownerPrincipalId) {
  const prompt = [
    "You interpret a natural-language request into one Hermes CRON automation draft.",
    "Return strict JSON only. Do not include Markdown fences or prose.",
    "Use Asia/Shanghai local time. Current server time is " + nowIso() + ".",
    "The schedule field must be directly accepted by Hermes cron: examples are `30m`, `every 2h`, `0 8 * * *`, or an ISO timestamp.",
    "For daily/weekly/monthly recurring Chinese requests, prefer a 5-field cron expression in Asia/Shanghai wall-clock time.",
    "If required schedule or task intent is missing, return {\"needs_clarification\":true,\"clarification\":\"...\"}.",
    "Schema: {\"name\":\"short title\",\"prompt\":\"self-contained unattended task prompt\",\"schedule\":\"Hermes schedule string\",\"repeat\":null,\"skills\":[],\"enabled_toolsets\":[]}",
    `Workspace principal: ${ownerPrincipalId}. Workspace label: ${workspace?.label || workspace?.id || ""}.`,
    "User request:",
    text,
  ].join("\n\n");
  const output = await hermesModelText({
    input: prompt,
    stream: true,
    store: false,
    model: AUTOMATION_CREATE_MODEL,
    reasoning_effort: "low",
    conversation: `hermes_web_automation_create_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    instructions: "Extract exactly one automation definition. Return JSON only.",
    access_policy_context: sanitizePolicy(workspace?.policy || {}),
  });
  return normalizeAutomationDraft(extractJsonObject(output), text);
}

function normalizeKanbanDraft(raw, sourceText, workspaceId) {
  const draft = raw && typeof raw === "object" ? raw : {};
  if (draft.needs_clarification || draft.needsClarification) {
    throw new Error(compactText(draft.clarification || draft.question || "Kanban request needs clarification", 240));
  }
  const content = compactText(
    draft.content || draft.title || draft.name || draft.card || draft.task || sourceText,
    160,
  );
  if (!content) throw new Error("Hermes model did not produce Kanban card content");
  return {
    content,
    description: compactText(draft.description || draft.details || draft.notes || "", 4000),
    assignee: String(draft.assignee || draft.owner || workspaceId || "owner").trim() || "owner",
    dueTime: String(draft.dueTime || draft.due_time || draft.due || draft.deadline || "").trim(),
    reason: compactText(draft.reason || "Created from Hermes Mobile natural-language Kanban request.", 240),
  };
}

async function interpretKanbanNaturalLanguage(text, workspace, ownerPrincipalId) {
  const prompt = [
    "You interpret a natural-language request into one Hermes Mobile Kanban card draft.",
    "Return strict JSON only. Do not include Markdown fences or prose.",
    "Use Asia/Shanghai local time. Current server time is " + nowIso() + ".",
    "This is for a Kanban execution board, not a reminder todo list.",
    "Infer a short actionable card content/title and an optional description.",
    "Keep proper nouns such as Gmail, Hotmail, MINJI, Hermes in the original language.",
    "If assignee is omitted, default to the workspace principal.",
    "If due time is omitted or unclear, leave dueTime empty.",
    "If required execution intent is missing, return {\"needs_clarification\":true,\"clarification\":\"...\"}.",
    "Schema: {\"content\":\"short card title\",\"description\":\"optional details\",\"assignee\":\"workspace principal id or empty\",\"dueTime\":\"YYYY-MM-DD HH:mm or empty\",\"reason\":\"optional short note\"}",
    `Workspace principal: ${ownerPrincipalId}. Workspace label: ${workspace?.label || workspace?.id || ""}.`,
    "User request:",
    text,
  ].join("\n\n");
  const output = await hermesModelText({
    input: prompt,
    stream: true,
    store: false,
    model: AUTOMATION_CREATE_MODEL,
    reasoning_effort: "low",
    conversation: `hermes_web_kanban_create_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    instructions: "Extract exactly one Kanban card draft. Return JSON only.",
    access_policy_context: sanitizePolicy(workspace?.policy || {}),
  });
  return normalizeKanbanDraft(extractJsonObject(output), text, ownerPrincipalId);
}

function kanbanPlanFallbackCards(sourceText) {
  const topic = compactText(sourceText, 80) || "Kanban work";
  return [
    {
      title: `Scope and acceptance: ${topic}`,
      description: "Clarify the objective, inputs, constraints, deliverables, and acceptance criteria before execution.",
      deliverables: ["Short execution brief", "Acceptance checklist"],
      acceptance: ["Scope is specific enough for worker cards", "Unknown inputs or risks are listed"],
      dependsOn: [],
    },
    {
      title: `Execute primary work: ${topic}`,
      description: "Perform the main implementation, research, cleanup, or production work described by the request.",
      deliverables: ["Primary output files or changes", "Progress notes"],
      acceptance: ["Main requested outcome is completed or blocked with evidence"],
      dependsOn: [1],
    },
    {
      title: `Verify and risk review: ${topic}`,
      description: "Validate the output, record evidence, and identify risks, missing inputs, and follow-up work.",
      deliverables: ["Verification notes", "Risk list"],
      acceptance: ["Validation evidence is attached to the card receipt"],
      dependsOn: [2],
    },
    {
      title: `Integrate final receipt: ${topic}`,
      description: "Read upstream card receipts and produce the final user-facing summary with deliverables and next steps.",
      deliverables: ["Final receipt", "Consolidated deliverable links"],
      acceptance: ["Final response references upstream outputs and unresolved risks"],
      dependsOn: [1, 2, 3],
    },
  ];
}

function kanbanPlanDependencyRefs(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return String(value).split(/[,;\n]+/g);
}

function normalizeKanbanPlan(raw, sourceText, workspaceId) {
  const draft = raw && typeof raw === "object" ? raw : {};
  if (draft.needs_clarification || draft.needsClarification) {
    throw new Error(compactText(draft.clarification || draft.question || "Kanban plan needs clarification", 240));
  }
  const rawCards = Array.isArray(draft.cards) && draft.cards.length
    ? draft.cards
    : kanbanPlanFallbackCards(sourceText);
  const cards = rawCards.slice(0, KANBAN_MULTI_AGENT_MAX_CARDS).map((item, index) => {
    const card = item && typeof item === "object" ? item : { title: String(item || "") };
    const title = compactText(card.title || card.content || card.name || card.task || `Kanban card ${index + 1}`, 160);
    return {
      clientId: String(card.clientId || card.id || `card-${index + 1}`).trim() || `card-${index + 1}`,
      title,
      description: compactText(card.description || card.details || card.goal || "", 1200),
      deliverables: arrayOfStrings(card.deliverables || card.outputs || card.artifacts, 6),
      acceptance: arrayOfStrings(card.acceptance || card.acceptanceCriteria || card.validation || card.verify, 6),
      assignee: String(card.assignee || "").trim(),
      dependencyRefs: kanbanPlanDependencyRefs(card.dependsOn || card.depends_on || card.dependencies || card.blockedBy || card.after),
    };
  }).filter((card) => card.title);

  if (!cards.length) throw new Error("Hermes model did not produce Kanban plan cards");

  const byId = new Map(cards.map((card) => [card.clientId.toLowerCase(), card]));
  const byTitle = new Map(cards.map((card) => [card.title.toLowerCase(), card]));
  for (const [index, card] of cards.entries()) {
    const deps = [];
    for (const ref of card.dependencyRefs) {
      const text = String(ref || "").trim();
      if (!text) continue;
      const numeric = text.match(/\d+/)?.[0];
      const byNumber = numeric ? cards[Number(numeric) - 1] : null;
      const resolved = byId.get(text.toLowerCase())
        || byTitle.get(text.toLowerCase())
        || byNumber
        || cards.find((candidate) => candidate.title.toLowerCase().includes(text.toLowerCase()));
      if (resolved && resolved !== card && cards.indexOf(resolved) < index) deps.push(resolved.clientId);
    }
    card.dependsOn = dedupe(deps);
    delete card.dependencyRefs;
  }

  const initialRunnableIds = new Set();
  for (const card of cards) {
    if (card.dependsOn.length) continue;
    if (initialRunnableIds.size >= KANBAN_MULTI_AGENT_MAX_PARALLEL) continue;
    initialRunnableIds.add(card.clientId);
  }
  for (const card of cards) card.initialRunnable = initialRunnableIds.has(card.clientId);

  return {
    id: String(draft.id || `kanban-plan-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`),
    mode: "multi-agent",
    workspaceId: String(workspaceId || "owner"),
    sourceText: compactText(draft.sourceText || sourceText, 4000),
    summary: compactText(draft.summary || draft.goal || sourceText, 500),
    maxParallel: KANBAN_MULTI_AGENT_MAX_PARALLEL,
    cards,
  };
}

async function planKanbanMultiAgent(text, workspace, ownerPrincipalId) {
  const sourceText = compactText(text, 8000);
  if (!sourceText) throw new Error("Kanban plan text is required");
  const prompt = [
    "You are the Hermes Mobile Kanban planner.",
    "Return strict JSON only. Do not include Markdown fences or prose.",
    "The user is creating a multi-Agent execution plan for a Kanban board.",
    `The maximum parallel worker count is fixed at ${KANBAN_MULTI_AGENT_MAX_PARALLEL}. Do not propose more than ${KANBAN_MULTI_AGENT_MAX_PARALLEL} first-wave runnable cards.`,
    "Create 3 to 8 cards. Make cards independently executable when possible, but add dependencies for integration, verification, or sequential work.",
    "Every card must have a short actionable title, a description, expected deliverables, acceptance criteria, and dependsOn as 1-based card numbers.",
    "Add a final integration or verification card when the work has multiple outputs.",
    "Schema: {\"summary\":\"...\",\"cards\":[{\"title\":\"...\",\"description\":\"...\",\"deliverables\":[\"...\"],\"acceptance\":[\"...\"],\"dependsOn\":[1]}]}",
    `Workspace principal: ${ownerPrincipalId}. Workspace label: ${workspace?.label || workspace?.id || ""}.`,
    "User request:",
    sourceText,
  ].join("\n\n");
  const output = await hermesModelText({
    input: prompt,
    stream: true,
    store: false,
    model: AUTOMATION_CREATE_MODEL,
    reasoning_effort: "medium",
    conversation: `hermes_web_kanban_plan_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    instructions: "Plan a multi-Agent Kanban decomposition. Return JSON only.",
    access_policy_context: sanitizePolicy(workspace?.policy || {}),
  }, KANBAN_MULTI_AGENT_PLAN_TIMEOUT_MS);
  try {
    return normalizeKanbanPlan(extractJsonObject(output), sourceText, workspace?.id || ownerPrincipalId || "owner");
  } catch (err) {
    const fallback = normalizeKanbanPlan({
      summary: sourceText,
      cards: kanbanPlanFallbackCards(sourceText),
    }, sourceText, workspace?.id || ownerPrincipalId || "owner");
    fallback.warning = compactText(`Planner JSON fallback used: ${err.message || String(err)}`, 300);
    return fallback;
  }
}

function kanbanPlanCardDescription(plan, card) {
  const dependencyLabels = kanbanPlanDependencyLabelsForServer(plan, card);
  return [
    `Multi-Agent plan: ${plan.summary || plan.sourceText || ""}`,
    `Source request:\n${plan.sourceText || ""}`,
    `Card goal:\n${card.description || card.title || ""}`,
    card.deliverables?.length ? `Expected deliverables:\n- ${card.deliverables.join("\n- ")}` : "",
    card.acceptance?.length ? `Acceptance criteria:\n- ${card.acceptance.join("\n- ")}` : "",
    dependencyLabels.length ? `Dependencies:\n- ${dependencyLabels.join("\n- ")}` : "",
    `Concurrency rule: Hermes Mobile may run at most ${KANBAN_MULTI_AGENT_MAX_PARALLEL} first-wave cards from this plan in parallel. Cards outside that wave are blocked until dependencies complete or the Owner unblocks them.`,
  ].filter(Boolean).join("\n\n");
}

function kanbanPlanDependencyLabelsForServer(plan, card) {
  const cards = Array.isArray(plan?.cards) ? plan.cards : [];
  const byId = new Map(cards.map((item) => [String(item.clientId || ""), item]));
  return (Array.isArray(card?.dependsOn) ? card.dependsOn : [])
    .map((id) => byId.get(String(id || ""))?.title || String(id || "").trim())
    .filter(Boolean);
}

function kanbanSingleCardCasePayload(content, description = "", sourceText = "") {
  const title = compactText(content || sourceText || "Kanban card", 180);
  const source = compactText(sourceText || description || content || "", 2000);
  return {
    caseId: `kanban-single-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    caseMode: "single-card",
    caseSourceText: source,
    caseSummary: title,
    caseCardId: "single",
    caseCardIndex: 1,
    caseCardCount: 1,
    caseCardGoal: compactText(description || content || "", 1200),
  };
}

async function createKanbanPlanCards(workspaceId, planInput, options = {}) {
  const plan = normalizeKanbanPlan(planInput, planInput?.sourceText || options.sourceText || "", workspaceId);
  const created = [];
  const byClientId = new Map();
  const runnableIds = new Set(plan.cards.filter((card) => !card.dependsOn.length).slice(0, KANBAN_MULTI_AGENT_MAX_PARALLEL).map((card) => card.clientId));

  for (const [cardIndex, card] of plan.cards.entries()) {
    const assignee = card.assignee || options.assignee || "";
    const cardCaseTemplate = card.caseTemplate || plan.template;
    const cardSourceText = compactText([
      plan.sourceText,
      card.config ? assessmentConfigLine(card.config) : "",
    ].filter(Boolean).join("\n\n"), 3000);
    const result = await kanbanCardProvider.addCard({
      workspaceId,
      assignee,
      assigneeLabel: todoAssigneeLabel(workspaceId, assignee),
      content: card.title,
      description: kanbanPlanCardDescription(plan, card),
      dueTime: "",
      reason: "Created from Hermes Mobile multi-Agent Kanban planner.",
      idempotencyKey: `hm-plan-${crypto.createHash("sha256").update(`${plan.id}\0${card.clientId}`).digest("hex").slice(0, 24)}`,
      caseId: plan.id,
      caseMode: plan.mode,
      caseSourceText: compactText(plan.sourceText, 2000),
      caseSummary: compactText(plan.summary, 500),
      caseCardId: card.clientId,
      caseCardIndex: cardIndex + 1,
      caseCardCount: plan.cards.length,
      caseDependsOn: card.dependsOn,
      caseDeliverables: card.deliverables,
      caseAcceptance: card.acceptance,
      caseCardGoal: card.description || card.title,
    });
    if (!result?.ok) {
      return { ok: false, error: result?.error || "Kanban card creation failed", plan, cards: created, result };
    }
    const publicCard = publicTodo(result);
    const verification = verifyDirectTodoCreateResult(publicCard);
    if (!verification.ok) {
      return { ok: false, error: verification.error, plan, cards: created, result };
    }
    byClientId.set(card.clientId, publicCard);
    const dependencyLabels = kanbanPlanDependencyLabelsForServer(plan, card);
    const shouldBlock = !runnableIds.has(card.clientId);
    let blocked = false;
    let blockError = "";
    let blockReason = "";
    if (shouldBlock) {
      blockReason = dependencyLabels.length
        ? `Waiting for planned upstream cards: ${dependencyLabels.join(" / ")}.`
        : `Waiting for a free multi-Agent execution slot; Hermes Mobile max parallel is ${KANBAN_MULTI_AGENT_MAX_PARALLEL}.`;
      const blockedResult = await kanbanCardProvider.mutateCard({
        action: "block",
        workspaceId,
        cardId: publicCard.id,
        reason: blockReason,
        author: "Hermes Mobile",
      });
      blocked = Boolean(blockedResult?.ok);
      blockError = blocked ? "" : (blockedResult?.error || "Failed to block planned card");
    }
    const createdEntry = {
      clientId: card.clientId,
      title: card.title,
      card: publicCard,
      blocked,
      blockReason,
      blockError,
      dependsOn: card.dependsOn.map((id) => byClientId.get(id)?.id || id),
    };
    created.push(createdEntry);
    if (shouldBlock && !blocked) {
      return {
        ok: false,
        error: `Planned card ${publicCard.id} was created but could not be blocked: ${blockError}`,
        plan,
        cards: created,
      };
    }
  }

  return { ok: true, plan, cards: created, maxParallel: KANBAN_MULTI_AGENT_MAX_PARALLEL };
}

function normalizeReadingPlanTime(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2})(?::|：)(\d{1,2})$/);
  if (!match) return "21:00";
  const hour = Math.max(0, Math.min(23, Number(match[1]) || 0));
  const minute = Math.max(0, Math.min(59, Number(match[2]) || 0));
  return `${pad2(hour)}:${pad2(minute)}`;
}

function normalizeReadingPlanStartDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/);
  const now = new Date();
  if (!match) return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  return `${match[1]}-${pad2(Number(match[2]))}-${pad2(Number(match[3]))}`;
}

function readingPlanDueTime(startDate, timeOfDay, dayOffset) {
  const dateMatch = String(startDate || "").match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  const timeMatch = normalizeReadingPlanTime(timeOfDay).match(/^(\d{2}):(\d{2})$/);
  const date = dateMatch
    ? new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), Number(timeMatch[1]), Number(timeMatch[2]), 0, 0)
    : new Date();
  date.setDate(date.getDate() + Math.max(0, Number(dayOffset) || 0));
  return formatLocalDateTime(date);
}

function normalizeKanbanStudyTemplate(raw = {}) {
  const value = String(
    raw.studyTemplate
    || raw.study_template
    || raw.caseTemplate
    || raw.case_template
    || raw.template
    || raw.kind
    || "",
  ).trim().toLowerCase();
  if (["reading", "read", "book", "english-reading", "reading-retell"].includes(value)) return "reading";
  return "custom";
}

function kanbanCardStudyTemplate(card = {}) {
  return String(card?.kanbanCaseTemplate || card?.kanban_case_template || card?.studyTemplate || card?.study_template || "custom").trim().toLowerCase() || "custom";
}

function kanbanCardUsesReadingTemplate(card = {}) {
  return kanbanCardStudyTemplate(card) === "reading";
}

function normalizeKanbanStudyPlan(raw = {}, workspaceId = "owner") {
  const mode = "study-plan";
  const template = normalizeKanbanStudyTemplate(raw);
  const readingTemplate = template === "reading";
  const contentTitle = compactText(
    raw.contentTitle
    || raw.content_title
    || raw.bookTitle
    || raw.book_title
    || raw.title
    || "",
    120,
  );
  if (!contentTitle) throw new Error("Study plan contentTitle is required");
  const learnerName = compactText(
    raw.learnerName
    || raw.learner_name
    || raw.readerName
    || raw.reader_name
    || raw.reader
    || raw.targetName
    || raw.target_name
    || "学习者",
    80,
  );
  const subject = compactText(raw.subject || raw.domain || (readingTemplate ? "英语阅读" : "学习"), 80);
  const activity = compactText(raw.activity || raw.activityType || raw.activity_type || (readingTemplate ? "阅读复述" : "提交成果并考核"), 120);
  const submissionLabel = compactText(raw.submissionLabel || raw.submission_label || (readingTemplate ? "复述录音" : "学习成果文件或文字"), 120);
  const sessions = Math.max(1, Math.min(KANBAN_READING_PLAN_MAX_SESSIONS, Number(raw.sessions || raw.sessionCount || raw.session_count || 10) || 10));
  const startDate = normalizeReadingPlanStartDate(raw.startDate || raw.start_date);
  const timeOfDay = normalizeReadingPlanTime(raw.timeOfDay || raw.time_of_day || raw.startTime || raw.start_time);
  const reminderLeadMinutes = Math.max(0, Math.min(24 * 60, Number(raw.reminderLeadMinutes ?? raw.reminder_lead_minutes ?? 15) || 0));
  const sourceText = compactText(raw.sourceText || raw.source_text || raw.text || raw.notes || "", 4000);
  const performerWorkspaceIds = normalizeWorkspaceIdList(
    raw.performerWorkspaceIds
    || raw.performer_workspace_ids
    || raw.targetWorkspaceIds
    || raw.target_workspace_ids
    || raw.performerWorkspaceId
    || raw.performer_workspace_id
    || raw.targetWorkspaceId
    || raw.target_workspace_id
    || "",
  ).filter((id) => id !== String(workspaceId || "owner"));
  const viewerWorkspaceIds = normalizeWorkspaceIdList(
    raw.viewerWorkspaceIds
    || raw.viewer_workspace_ids
    || raw.readonlyWorkspaceIds
    || raw.readonly_workspace_ids
    || "",
  ).filter((id) => id !== String(workspaceId || "owner") && !performerWorkspaceIds.includes(id));
  const summary = compactText(`${learnerName}：${subject} - ${contentTitle}`, 180);
  const id = String(raw.id || `study-plan-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`);
  const cards = Array.from({ length: sessions }, (_, index) => {
    const day = index + 1;
    const title = readingTemplate
      ? `${learnerName}阅读《${contentTitle}》第 ${day}/${sessions} 次：录音复述`
      : `${learnerName}${subject}第 ${day}/${sessions} 次：提交成果`;
    const description = compactText([
      `学习计划：${summary}`,
      `第 ${day} 次，共 ${sessions} 次。`,
      `领域/科目：${subject}`,
      `当天任务：${activity}`,
      `提交要求：${submissionLabel}`,
      readingTemplate
        ? "当天阅读完成后，需要上传语音复述或总结录音。Hermes Mobile 会先转写录音，再结合前面已完成卡片的反馈生成评价、针对性单选考卷和下一次指导；答卷 10 题全对后，本卡片才会完成。"
        : "当天学习完成后，提交成果文件、文字说明或录音。Hermes Mobile 会提取可读内容、生成评价、针对性单选考卷和下一次指导；答卷 10 题全对后，本卡片才会完成。",
      sourceText ? `整体要求：\n${sourceText}` : "",
    ].filter(Boolean).join("\n\n"), 1800);
    return {
      clientId: `${template}-session-${day}`,
      title,
      day,
      dueTime: readingPlanDueTime(startDate, timeOfDay, index),
      description,
      deliverables: readingTemplate
        ? ["读后复述录音", "AI阅读评价", "针对性单选考卷", "下一次阅读指导"]
        : ["学习成果提交", "AI评价", "针对性单选考卷", "下一次学习指导"],
      acceptance: readingTemplate
        ? ["已上传当天录音", "已生成转写和AI评价", "10题单选考卷全对", "卡片完成结果包含分析文件"]
        : ["已提交当天学习成果", "已生成AI评价", "10题单选考卷全对", "卡片完成结果包含分析文件"],
    };
  });
  return {
    id,
    mode,
    template,
    workspaceId: String(workspaceId || "owner"),
    bookTitle: contentTitle,
    contentTitle,
    readerName: learnerName,
    learnerName,
    subject,
    activity,
    submissionLabel,
    sessions,
    startDate,
    timeOfDay,
    reminderLeadMinutes,
    sourceText,
    summary,
    performerWorkspaceIds,
    viewerWorkspaceIds,
    cards,
  };
}

function kanbanPlanLearnerLabel(plan = {}) {
  return compactText(
    plan.learnerName
    || plan.readerName
    || plan.targetName
    || plan.target_name
    || "\u5b66\u4e60\u8005",
    60,
  ) || "\u5b66\u4e60\u8005";
}

function kanbanCaseTopicTitle(plan = {}) {
  return compactText(
    plan.contentTitle
    || plan.bookTitle
    || plan.title
    || plan.subject
    || plan.summary
    || plan.id
    || "\u5b66\u4e60\u8ba1\u5212",
    120,
  ) || "\u5b66\u4e60\u8ba1\u5212";
}

function kanbanLearnerSharedFolderName(plan = {}) {
  const learner = kanbanPlanLearnerLabel(plan);
  return safeDirectoryName(`${learner}\u5171\u4eab\u76ee\u5f55`)
    || `learner-${safeStorageSegment(learner, "learner")}`;
}

function kanbanCaseDirectoryName(plan = {}) {
  const title = kanbanCaseTopicTitle(plan);
  const id = safeStorageSegment(plan.id || "case", "case");
  const titlePart = safeStorageSegment(title, "plan").slice(0, 48);
  return safeDirectoryName(`${id}-${titlePart}`) || id;
}

function kanbanCaseMemberWorkspaceIds(plan = {}, ownerWorkspaceId = "owner") {
  return dedupe([
    ownerWorkspaceId,
    ...(Array.isArray(plan.performerWorkspaceIds) ? plan.performerWorkspaceIds : []),
    ...(Array.isArray(plan.viewerWorkspaceIds) ? plan.viewerWorkspaceIds : []),
  ].filter(Boolean));
}

function ensureKanbanCaseSharedDirectory(ownerWorkspaceId, plan = {}) {
  const owner = String(ownerWorkspaceId || "owner").trim() || "owner";
  const ownerRoot = workspaceDefaultRoot(owner);
  const targets = kanbanCaseMemberWorkspaceIds(plan, owner).filter((workspaceId) => workspaceId !== owner);
  if (!ownerRoot || !targets.length) return null;
  const learner = kanbanPlanLearnerLabel(plan);
  const learnerRoot = path.join(ownerRoot, kanbanLearnerSharedFolderName(plan));
  const sharedRoot = path.join(learnerRoot, KANBAN_STUDY_SHARED_FOLDER_NAME);
  const caseDirectory = path.join(sharedRoot, kanbanCaseDirectoryName(plan));
  assertChildPathInside(ownerRoot, learnerRoot);
  assertChildPathInside(learnerRoot, sharedRoot);
  assertChildPathInside(sharedRoot, caseDirectory);
  fs.mkdirSync(caseDirectory, { recursive: true });
  const share = upsertSharedDirectory({
    path: sharedRoot,
    label: `${learner}${KANBAN_STUDY_SHARED_FOLDER_NAME}`,
    createdAt: nowIso(),
    createdBy: owner,
    createdByPrincipalId: workspacePrincipal(owner),
    permission: "read_only",
    scope: "selected_workspaces",
    targetWorkspaceIds: targets,
    aliases: [learner, KANBAN_STUDY_SHARED_FOLDER_NAME, `${learner}${KANBAN_STUDY_SHARED_FOLDER_NAME}`],
    source: "hermes-mobile-study-plan",
  });
  return {
    sharedDirectoryPath: sharedRoot,
    caseDirectoryPath: caseDirectory,
    share,
    directoryRoute: {
      label: `${learner} / ${KANBAN_STUDY_SHARED_FOLDER_NAME} / ${kanbanCaseTopicTitle(plan)}`,
      root: caseDirectory,
      path: caseDirectory,
    },
  };
}

function kanbanCaseTopicKey(ownerWorkspaceId, plan = {}) {
  return `study:${safeStorageSegment(ownerWorkspaceId || "owner", "owner")}:${safeStorageSegment(kanbanPlanLearnerLabel(plan), "learner").toLowerCase()}`;
}

function findKanbanCaseTopicThread(ownerWorkspaceId, topicKey) {
  const owner = String(ownerWorkspaceId || "owner").trim() || "owner";
  const key = String(topicKey || "").trim();
  return (state.threads || []).find((thread) => (
    thread?.singleWindow
    && thread.workspaceId === owner
    && isKanbanCaseTopicThread(thread)
    && normalizeChatGroup(thread.chatGroup || {}, owner).topicKey === key
  )) || null;
}

function ensureKanbanCaseTopicThread(ownerWorkspaceId, plan = {}, directoryInfo = null) {
  const owner = String(ownerWorkspaceId || "owner").trim() || "owner";
  const members = kanbanCaseMemberWorkspaceIds(plan, owner);
  if (members.length <= 1) return null;
  const now = nowIso();
  const topicKey = kanbanCaseTopicKey(owner, plan);
  let thread = findKanbanCaseTopicThread(owner, topicKey);
  if (!thread) {
    thread = createSingleWindowThread(owner, {
      title: `${kanbanPlanLearnerLabel(plan)}${KANBAN_STUDY_SHARED_FOLDER_NAME}`,
      chatGroup: {
        enabled: true,
        kind: KANBAN_CASE_TOPIC_KIND,
        topicKey,
        memberWorkspaceIds: members,
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    });
    state.threads.unshift(thread);
  } else {
    const group = normalizeChatGroup(thread.chatGroup || {}, owner);
    thread.chatGroup = Object.assign({}, group, {
      enabled: true,
      kind: KANBAN_CASE_TOPIC_KIND,
      topicKey,
      memberWorkspaceIds: dedupe([...(group.memberWorkspaceIds || []), ...members]),
      createdAt: group.createdAt || now,
      updatedAt: now,
    });
  }
  const taskGroupId = `case_${safeStorageSegment(plan.id || makeId("case"), "case")}`;
  thread.taskGroupMeta = normalizeTaskGroupMeta(thread.taskGroupMeta);
  thread.taskGroupMeta[taskGroupId] = Object.assign({}, thread.taskGroupMeta[taskGroupId] || {}, {
    title: kanbanCaseTopicTitle(plan),
    updatedAt: now,
    sharedTopic: true,
    kanbanCaseId: plan.id || "",
    kanbanCaseMode: plan.mode || "",
    kanbanCaseOwnerWorkspaceId: owner,
    performerWorkspaceIds: plan.performerWorkspaceIds || [],
    viewerWorkspaceIds: plan.viewerWorkspaceIds || [],
    directoryRoute: directoryInfo?.directoryRoute || null,
    sharedDirectoryPath: directoryInfo?.sharedDirectoryPath || "",
    caseDirectoryPath: directoryInfo?.caseDirectoryPath || "",
  });
  if (!(thread.messages || []).some((message) => message.taskGroupId === taskGroupId)) {
    const sender = senderInfoForWorkspace(owner);
    thread.messages = sortMessagesChronologically([...(thread.messages || []), {
      id: makeId("msg"),
      role: "user",
      content: [
        `${KANBAN_STUDY_SHARED_FOLDER_NAME}\u8bdd\u9898\uff1a${kanbanCaseTopicTitle(plan)}`,
        directoryInfo?.caseDirectoryPath ? `Directory: ${directoryInfo.caseDirectoryPath}` : "",
      ].filter(Boolean).join("\n"),
      status: "done",
      taskGroupId,
      messageKind: "plain",
      singleWindowMode: "task",
      actorWorkspaceId: owner,
      senderWorkspaceId: sender.senderWorkspaceId,
      senderPrincipalId: sender.senderPrincipalId,
      senderLabel: sender.senderLabel,
      directoryRoute: directoryInfo?.directoryRoute || null,
      directoryAliases: directoryInfo?.directoryRoute ? [directoryInfo.directoryRoute] : [],
      createdAt: now,
      updatedAt: now,
      submittedAt: now,
    }]);
  }
  thread.updatedAt = now;
  saveState(state, { reason: "kanban-case-topic", forceBackup: true });
  broadcast({ type: "thread.updated", thread: threadSummary(thread) });
  return { thread, taskGroupId };
}

async function createKanbanStudyPlanCards(workspaceId, input = {}) {
  const plan = normalizeKanbanStudyPlan(input, workspaceId);
  const cover = saveKanbanReadingCoverUpload(workspaceId, plan.id, input.coverImage || input.cover_image || input.cover || null);
  if (cover) plan.cover = publicKanbanCoverFile(workspaceId, cover) || cover;
  const directoryInfo = ensureKanbanCaseSharedDirectory(workspaceId, plan);
  const topic = ensureKanbanCaseTopicThread(workspaceId, plan, directoryInfo);
  const share = upsertKanbanCaseShare(workspaceId, plan.id, {
    performerWorkspaceIds: plan.performerWorkspaceIds,
    viewerWorkspaceIds: plan.viewerWorkspaceIds,
    managerWorkspaceIds: input.managerWorkspaceIds || input.manager_workspace_ids || [],
    topicThreadId: topic?.thread?.id || "",
    topicTaskGroupId: topic?.taskGroupId || "",
    sharedDirectoryPath: directoryInfo?.sharedDirectoryPath || "",
    caseDirectoryPath: directoryInfo?.caseDirectoryPath || "",
  });
  const performerAssignee = plan.performerWorkspaceIds[0] ? workspacePrincipal(plan.performerWorkspaceIds[0]) : "";
  const requestedAssignee = input.assignee || performerAssignee || workspacePrincipal(workspaceId);
  const created = [];
  for (const [index, card] of plan.cards.entries()) {
    const cardCaseTemplate = card.caseTemplate || plan.template;
    const cardSourceText = compactText([
      plan.sourceText,
      card.config ? assessmentConfigLine(card.config) : "",
    ].filter(Boolean).join("\n\n"), 3000);
    const description = compactText([
      card.description,
      cover ? "封面图片已上传，可在 Hermes Mobile 学习计划中预览。" : "",
    ].filter(Boolean).join("\n\n"), 1800);
    const result = await kanbanCardProvider.addCard({
      workspaceId,
      assignee: requestedAssignee,
      assigneeLabel: todoAssigneeLabel(workspaceId, requestedAssignee),
      content: card.title,
      description,
      dueTime: card.dueTime,
      reminderLeadMinutes: plan.reminderLeadMinutes,
      reason: "Created from Hermes Mobile study plan.",
      idempotencyKey: `hm-${plan.mode}-${crypto.createHash("sha256").update(`${plan.id}\0${card.clientId}`).digest("hex").slice(0, 24)}`,
      caseId: plan.id,
      caseMode: plan.mode,
      caseTemplate: cardCaseTemplate,
      caseSourceText: cardSourceText,
      caseSummary: plan.summary,
      caseCover: cover || null,
      caseCardId: card.clientId,
      caseCardIndex: index + 1,
      caseCardCount: plan.cards.length,
      caseDependsOn: index > 0 ? [plan.cards[index - 1].clientId] : [],
      caseDeliverables: card.deliverables,
      caseAcceptance: card.acceptance,
      caseCardGoal: compactText([
        card.config ? assessmentConfigLine(card.config) : "",
        card.description,
      ].filter(Boolean).join("\n\n"), 1800),
    });
    if (!result?.ok) {
      return { ok: false, error: result?.error || "Study plan card creation failed", plan, cards: created, result };
    }
    let publicCard = publicTodo(result);
    let blocked = false;
    let blockError = "";
    let blockReason = "";
    if (index > 0) {
      blockReason = "Waiting for previous study session completion; Hermes Mobile shows only the current study session.";
      const blockedResult = await kanbanCardProvider.mutateCard({
        action: "block",
        workspaceId,
        cardId: publicCard.id,
        reason: blockReason,
        author: "Hermes Mobile",
      });
      blocked = Boolean(blockedResult?.ok);
      blockError = blocked ? "" : (blockedResult?.error || "Failed to block future reading session");
      if (blocked) publicCard = publicTodo(blockedResult);
    }
    created.push({
      clientId: card.clientId,
      day: card.day,
      dueTime: card.dueTime,
      card: publicCard,
      blocked,
      blockReason,
      blockError,
      dependsOn: index > 0 ? [plan.cards[index - 1].clientId] : [],
    });
    if (index > 0 && !blocked) {
      return {
        ok: false,
        error: `Study plan card ${publicCard.id} was created but could not be parked: ${blockError}`,
        plan,
        cards: created,
      };
    }
  }
  return {
    ok: true,
    plan,
    cards: created,
    share,
    topic: topic ? {
      threadId: topic.thread.id,
      taskGroupId: topic.taskGroupId,
      title: kanbanCaseTopicTitle(plan),
    } : null,
    sharedDirectory: directoryInfo ? {
      path: directoryInfo.sharedDirectoryPath,
      caseDirectoryPath: directoryInfo.caseDirectoryPath,
      permission: "read_only",
    } : null,
  };
}

function normalizeKanbanAssessmentSubjectId(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (/math|数学|數學|amc/.test(text)) return "math";
  if (/english|英语|英文|reading|language/.test(text)) return "english";
  if (/science|科学|科學|physics|chemistry|biology/.test(text)) return "science";
  if (/history|历史|歷史/.test(text)) return "history";
  if (/chinese|中文|语文|語文/.test(text)) return "chinese";
  return safeSlug(text || "assessment", "assessment").slice(0, 40) || "assessment";
}

function normalizeKanbanAssessmentPlan(raw = {}, workspaceId = "owner", options = {}) {
  const ownerWorkspaceId = String(workspaceId || "owner").trim() || "owner";
  const linkedStudyPlan = Boolean(options.linkedStudyPlan);
  const subject = compactText(raw.subject || raw.domain || raw.course || "数学", 80);
  const subjectId = normalizeKanbanAssessmentSubjectId(subject);
  const learnerName = compactText(raw.learnerName || raw.learner_name || raw.targetName || raw.target_name || "学习者", 80);
  const courseLevel = compactText(raw.courseLevel || raw.course_level || raw.grade || raw.level || "阶段检测", 80);
  const title = compactText(raw.title || raw.planTitle || raw.plan_title || `${learnerName} ${subject} 考试计划`, 140);
  const examCount = Math.max(1, Math.min(KANBAN_ASSESSMENT_PLAN_MAX_EXAMS, Number(raw.examCount || raw.exam_count || raw.sessions || 10) || 10));
  const questionCount = Math.max(5, Math.min(KANBAN_ASSESSMENT_MAX_QUESTIONS, Number(raw.questionCount || raw.question_count || 20) || 20));
  const durationMinutes = Math.max(5, Math.min(180, Number(raw.durationMinutes || raw.duration_minutes || 30) || 30));
  const passingScore = Math.max(50, Math.min(100, Number(raw.passingScore || raw.passing_score || 80) || 80));
  const intervalDays = Math.max(1, Math.min(60, Number(raw.intervalDays || raw.interval_days || raw.examIntervalDays || raw.exam_interval_days || 14) || 14));
  const startDate = normalizeReadingPlanStartDate(raw.startDate || raw.start_date);
  const timeOfDay = normalizeReadingPlanTime(raw.timeOfDay || raw.time_of_day || raw.startTime || raw.start_time);
  const reminderLeadMinutes = Math.max(0, Math.min(24 * 60, Number(raw.reminderLeadMinutes ?? raw.reminder_lead_minutes ?? 30) || 0));
  const difficulty = compactText(raw.difficulty || raw.difficultyMix || raw.difficulty_mix || "基础30% / 中等50% / 挑战20%", 160);
  const blueprint = compactText(raw.blueprint || raw.examBlueprint || raw.exam_blueprint || raw.sourceText || raw.source_text || raw.text || "", 4000);
  const retakeUntilPass = raw.retakeUntilPass ?? raw.retake_until_pass ?? true;
  const performerWorkspaceIds = normalizeWorkspaceIdList(
    raw.performerWorkspaceIds
    || raw.performer_workspace_ids
    || raw.targetWorkspaceIds
    || raw.target_workspace_ids
    || raw.performerWorkspaceId
    || raw.performer_workspace_id
    || raw.targetWorkspaceId
    || raw.target_workspace_id
    || "",
  ).filter((id) => id !== ownerWorkspaceId);
  const viewerWorkspaceIds = normalizeWorkspaceIdList(
    raw.viewerWorkspaceIds
    || raw.viewer_workspace_ids
    || raw.readonlyWorkspaceIds
    || raw.readonly_workspace_ids
    || "",
  ).filter((id) => id !== ownerWorkspaceId && !performerWorkspaceIds.includes(id));
  const id = String(raw.id || `assessment-plan-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`);
  const summary = compactText(`${learnerName}：${subject} ${courseLevel} - ${title}`, 180);
  const baseConfig = {
    schemaVersion: 1,
    kind: linkedStudyPlan ? "final-study-assessment" : "assessment-plan",
    subject,
    subjectId,
    learnerName,
    courseLevel,
    questionCount,
    durationMinutes,
    passingScore,
    difficulty,
    retakeUntilPass: Boolean(retakeUntilPass),
  };
  const cards = Array.from({ length: examCount }, (_, index) => {
    const number = index + 1;
    const finalExam = linkedStudyPlan && number === examCount;
    const config = Object.assign({}, baseConfig, {
      examIndex: number,
      examCount,
      finalExam,
    });
    const cardTitle = finalExam
      ? `${learnerName}${subject}阶段结束综合考试`
      : `${learnerName}${subject}第 ${number}/${examCount} 次正式测试`;
    const description = compactText([
      `考试计划：${summary}`,
      `科目：${subject}`,
      `阶段：${courseLevel}`,
      `题量：${questionCount} 题`,
      `时长：${durationMinutes} 分钟`,
      `通过线：${passingScore} 分`,
      `难度：${difficulty}`,
      "这是正式检测卡片，难度高于每日小测；低于通过线时不完成卡片，继续保持重考状态。",
      finalExam ? "这是学习计划的最终阶段考试；只有达到通过线后，阶段学习计划才算完成。" : "",
      blueprint ? `考试蓝图：\n${blueprint}` : "",
    ].filter(Boolean).join("\n\n"), 1800);
    return {
      clientId: finalExam ? "final-assessment" : `assessment-exam-${number}`,
      title: cardTitle,
      dueTime: readingPlanDueTime(startDate, timeOfDay, index * intervalDays),
      description,
      config,
      deliverables: ["正式考卷", "自动评分", "能力诊断", "错题与补强建议"],
      acceptance: [
        `完成 ${questionCount} 题正式测试`,
        `得分达到 ${passingScore}/100`,
        "未达标则保留为重考状态",
        "生成考试报告和下一步补强建议",
      ],
    };
  });
  return {
    id,
    mode: linkedStudyPlan ? "study-plan" : "assessment-plan",
    template: linkedStudyPlan ? "final-assessment" : subjectId,
    workspaceId: ownerWorkspaceId,
    subject,
    subjectId,
    learnerName,
    courseLevel,
    title,
    examCount,
    questionCount,
    durationMinutes,
    passingScore,
    intervalDays,
    startDate,
    timeOfDay,
    reminderLeadMinutes,
    difficulty,
    blueprint,
    retakeUntilPass: Boolean(retakeUntilPass),
    summary,
    performerWorkspaceIds,
    viewerWorkspaceIds,
    cards,
  };
}

function assessmentConfigLine(config = {}) {
  return `ASSESSMENT_CONFIG:${Buffer.from(JSON.stringify(config)).toString("base64url")}`;
}

function parseAssessmentConfigLine(text = "") {
  const match = String(text || "").match(/ASSESSMENT_CONFIG:([A-Za-z0-9_-]+)/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_) {
    return null;
  }
}

function kanbanAssessmentConfigFromCard(card = {}) {
  const parsed = parseAssessmentConfigLine([
    card.kanbanCaseCardGoal,
    card.kanban_case_card_goal,
    card.description,
    card.kanbanCaseSourceText,
    card.kanban_case_source_text,
  ].filter(Boolean).join("\n"));
  const subject = compactText(parsed?.subject || card.kanbanCaseTemplate || card.kanban_case_template || "assessment", 80);
  return {
    subject,
    subjectId: normalizeKanbanAssessmentSubjectId(parsed?.subjectId || parsed?.subject_id || subject),
    learnerName: compactText(parsed?.learnerName || parsed?.learner_name || "学习者", 80),
    courseLevel: compactText(parsed?.courseLevel || parsed?.course_level || "阶段检测", 80),
    questionCount: Math.max(5, Math.min(KANBAN_ASSESSMENT_MAX_QUESTIONS, Number(parsed?.questionCount || parsed?.question_count || 20) || 20)),
    durationMinutes: Math.max(5, Math.min(180, Number(parsed?.durationMinutes || parsed?.duration_minutes || 30) || 30)),
    passingScore: Math.max(50, Math.min(100, Number(parsed?.passingScore || parsed?.passing_score || 80) || 80)),
    difficulty: compactText(parsed?.difficulty || "基础30% / 中等50% / 挑战20%", 160),
    retakeUntilPass: parsed?.retakeUntilPass !== false && parsed?.retake_until_pass !== false,
    examIndex: Number(parsed?.examIndex || parsed?.exam_index || card.kanbanCaseCardIndex || card.kanban_case_card_index || 1) || 1,
    examCount: Number(parsed?.examCount || parsed?.exam_count || card.kanbanCaseCardCount || card.kanban_case_card_count || 1) || 1,
    finalExam: Boolean(parsed?.finalExam || parsed?.final_exam),
  };
}

async function createKanbanAssessmentPlanCards(workspaceId, input = {}, options = {}) {
  const plan = normalizeKanbanAssessmentPlan(input, workspaceId, options);
  const directoryInfo = ensureKanbanCaseSharedDirectory(workspaceId, plan);
  const topic = ensureKanbanCaseTopicThread(workspaceId, plan, directoryInfo);
  const share = upsertKanbanCaseShare(workspaceId, plan.id, {
    performerWorkspaceIds: plan.performerWorkspaceIds,
    viewerWorkspaceIds: plan.viewerWorkspaceIds,
    managerWorkspaceIds: input.managerWorkspaceIds || input.manager_workspace_ids || [],
    topicThreadId: topic?.thread?.id || "",
    topicTaskGroupId: topic?.taskGroupId || "",
    sharedDirectoryPath: directoryInfo?.sharedDirectoryPath || "",
    caseDirectoryPath: directoryInfo?.caseDirectoryPath || "",
  });
  const performerAssignee = plan.performerWorkspaceIds[0] ? workspacePrincipal(plan.performerWorkspaceIds[0]) : "";
  const requestedAssignee = input.assignee || performerAssignee || workspacePrincipal(workspaceId);
  const created = [];
  for (const [index, card] of plan.cards.entries()) {
    const sourceText = compactText([plan.blueprint, assessmentConfigLine(card.config)].filter(Boolean).join("\n\n"), 3000);
    const result = await kanbanCardProvider.addCard({
      workspaceId,
      assignee: requestedAssignee,
      assigneeLabel: todoAssigneeLabel(workspaceId, requestedAssignee),
      content: card.title,
      description: card.description,
      dueTime: card.dueTime,
      reminderLeadMinutes: plan.reminderLeadMinutes,
      reason: "Created from Hermes Mobile assessment plan.",
      idempotencyKey: `hm-${plan.mode}-${crypto.createHash("sha256").update(`${plan.id}\0${card.clientId}`).digest("hex").slice(0, 24)}`,
      caseId: plan.id,
      caseMode: plan.mode,
      caseTemplate: plan.template,
      caseSourceText: sourceText,
      caseSummary: plan.summary,
      caseCardId: card.clientId,
      caseCardIndex: index + 1,
      caseCardCount: plan.cards.length,
      caseDependsOn: index > 0 ? [plan.cards[index - 1].clientId] : [],
      caseDeliverables: card.deliverables,
      caseAcceptance: card.acceptance,
      caseCardGoal: compactText(`${assessmentConfigLine(card.config)}\n\n${card.description}`, 1800),
    });
    if (!result?.ok) {
      return { ok: false, error: result?.error || "Assessment plan card creation failed", plan, cards: created, result };
    }
    let publicCard = publicTodo(result);
    let blocked = false;
    let blockError = "";
    let blockReason = "";
    {
      blockReason = index > 0
        ? "Waiting for previous assessment completion; Hermes Mobile opens the next assessment card after the prior exam passes."
        : "Manual formal assessment is open in Hermes Mobile; parked from official worker execution.";
      const blockedResult = await kanbanCardProvider.mutateCard({
        action: "block",
        workspaceId,
        cardId: publicCard.id,
        reason: blockReason,
        author: "Hermes Mobile",
      });
      blocked = Boolean(blockedResult?.ok);
      blockError = blocked ? "" : (blockedResult?.error || "Failed to block future assessment");
      if (blocked) publicCard = publicTodo(blockedResult);
    }
    created.push({
      clientId: card.clientId,
      dueTime: card.dueTime,
      card: publicCard,
      blocked,
      blockReason,
      blockError,
      dependsOn: index > 0 ? [plan.cards[index - 1].clientId] : [],
    });
    if (!blocked) {
      return {
        ok: false,
        error: `Assessment plan card ${publicCard.id} was created but could not be parked: ${blockError}`,
        plan,
        cards: created,
      };
    }
  }
  return {
    ok: true,
    plan,
    cards: created,
    share,
    topic: topic ? {
      threadId: topic.thread.id,
      taskGroupId: topic.taskGroupId,
      title: kanbanCaseTopicTitle(plan),
    } : null,
    sharedDirectory: directoryInfo ? {
      path: directoryInfo.sharedDirectoryPath,
      caseDirectoryPath: directoryInfo.caseDirectoryPath,
      permission: "read_only",
    } : null,
  };
}

function isReadingAudioUpload(filename, mime) {
  const ext = path.extname(String(filename || "")).toLowerCase();
  return /^audio\//i.test(String(mime || "")) || [".mp3", ".m4a", ".wav", ".aac", ".ogg", ".opus", ".amr"].includes(ext);
}

function readingArtifactDirectory(workspaceId, caseId, cardId) {
  const dir = path.join(
    KANBAN_READING_ARTIFACT_ROOT,
    safeStorageSegment(workspaceId || "owner"),
    safeStorageSegment(caseId || "study-plan"),
    safeStorageSegment(cardId || "card"),
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function isReadingCoverImageUpload(filename, mime) {
  const ext = path.extname(String(filename || "")).toLowerCase();
  const allowedExt = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".heic", ".heif"];
  const normalizedMime = String(mime || "").toLowerCase();
  return allowedExt.includes(ext) && /^image\/(png|jpe?g|webp|gif|heic|heif)$/i.test(normalizedMime || mimeFor(filename));
}

function saveKanbanReadingCoverUpload(workspaceId, planId, rawCover = null) {
  if (!rawCover || typeof rawCover !== "object" || Array.isArray(rawCover)) return null;
  const data = String(rawCover.dataBase64 || rawCover.data_base64 || "");
  if (!data) return null;
  const filename = safeFileName(rawCover.filename || rawCover.name || "book-cover.jpg");
  const mime = String(rawCover.type || rawCover.mime || rawCover.mimeType || rawCover.mime_type || mimeFor(filename) || "").trim();
  if (!isReadingCoverImageUpload(filename, mime)) {
    const err = new Error("Study plan cover must be a PNG, JPEG, WebP, GIF, HEIC, or HEIF image");
    err.status = 400;
    throw err;
  }
  const buffer = Buffer.from(data, "base64");
  if (!buffer.length || buffer.length > KANBAN_READING_COVER_MAX_BYTES) {
    const err = new Error("Invalid or too-large study plan cover image");
    err.status = 400;
    throw err;
  }
  const dir = readingArtifactDirectory(workspaceId, planId, "cover");
  const filePath = path.join(dir, `${Date.now()}-${crypto.randomBytes(3).toString("hex")}-${filename}`);
  fs.writeFileSync(filePath, buffer);
  return { path: filePath, name: filename, mime, size: buffer.length };
}

function saveKanbanReadingAudioUpload(workspaceId, cardId, body = {}, currentCard = null) {
  const filename = safeFileName(body.filename || "reading-audio.m4a");
  const mime = String(body.type || body.mime || body.mimeType || body.mime_type || mimeFor(filename) || "").trim();
  if (!isReadingAudioUpload(filename, mime)) {
    const err = new Error("Reading submission must be an audio file");
    err.status = 400;
    throw err;
  }
  const data = String(body.dataBase64 || body.data_base64 || "");
  if (!data) {
    const err = new Error("Missing dataBase64");
    err.status = 400;
    throw err;
  }
  const buffer = Buffer.from(data, "base64");
  if (!buffer.length || buffer.length > MAX_UPLOAD_BYTES) {
    const err = new Error("Invalid or too-large upload");
    err.status = 400;
    throw err;
  }
  const dir = readingArtifactDirectory(workspaceId, currentCard?.kanbanCaseId || "study-plan", cardId);
  const filePath = path.join(dir, `${Date.now()}-${crypto.randomBytes(3).toString("hex")}-${filename}`);
  fs.writeFileSync(filePath, buffer);
  return { path: filePath, name: filename, mime, size: buffer.length };
}

function isStudyTextUpload(filename, mime) {
  const ext = path.extname(String(filename || "")).toLowerCase();
  const type = String(mime || "").toLowerCase();
  return /^text\//i.test(type)
    || ["application/json", "application/csv"].includes(type)
    || [".txt", ".md", ".markdown", ".csv", ".json", ".docx"].includes(ext);
}

function saveKanbanStudySubmissionUpload(workspaceId, cardId, body = {}, currentCard = null) {
  const inlineText = compactText(body.submissionText || body.submission_text || body.text || "", 60000);
  if (inlineText) {
    const dir = readingArtifactDirectory(workspaceId, currentCard?.kanbanCaseId || "study-plan", cardId);
    const filePath = path.join(dir, `${Date.now()}-${crypto.randomBytes(3).toString("hex")}-study-submission.txt`);
    fs.writeFileSync(filePath, inlineText, "utf8");
    return {
      path: filePath,
      name: "study-submission.txt",
      mime: "text/plain; charset=utf-8",
      size: Buffer.byteLength(inlineText, "utf8"),
      kind: "text",
    };
  }
  const filename = safeFileName(body.filename || "study-submission");
  const mime = String(body.type || body.mime || body.mimeType || body.mime_type || mimeFor(filename) || "").trim();
  if (isReadingAudioUpload(filename, mime)) {
    return Object.assign(saveKanbanReadingAudioUpload(workspaceId, cardId, body, currentCard), { kind: "audio" });
  }
  if (!isStudyTextUpload(filename, mime)) {
    const err = new Error("Study submission must be an audio file, plain text/Markdown/CSV/JSON, or DOCX file");
    err.status = 400;
    throw err;
  }
  const data = String(body.dataBase64 || body.data_base64 || "");
  if (!data) {
    const err = new Error("Missing dataBase64");
    err.status = 400;
    throw err;
  }
  const buffer = Buffer.from(data, "base64");
  if (!buffer.length || buffer.length > MAX_UPLOAD_BYTES) {
    const err = new Error("Invalid or too-large upload");
    err.status = 400;
    throw err;
  }
  const dir = readingArtifactDirectory(workspaceId, currentCard?.kanbanCaseId || "study-plan", cardId);
  const filePath = path.join(dir, `${Date.now()}-${crypto.randomBytes(3).toString("hex")}-${filename}`);
  fs.writeFileSync(filePath, buffer);
  return { path: filePath, name: filename, mime, size: buffer.length, kind: path.extname(filename).toLowerCase() === ".docx" ? "docx" : "text" };
}

async function extractKanbanStudySubmissionEvidence(upload) {
  if (upload.kind === "audio" || isReadingAudioUpload(upload.name, upload.mime)) {
    const transcription = await transcribeKanbanReadingAudio(upload.path);
    return Object.assign({}, transcription, { sourceKind: "audio", sourcePath: upload.path });
  }
  if (upload.kind === "docx" || path.extname(upload.path).toLowerCase() === ".docx") {
    const preview = extractDocxText(upload.path);
    const text = compactText(preview.text || "", 30000);
    if (!text) throw new Error("DOCX extraction returned empty text");
    return { text, language: "", sourceKind: "docx", sourcePath: upload.path };
  }
  const preview = textFilePreview(upload.path);
  const text = compactText(preview.text || "", 30000);
  if (!text) throw new Error("Text extraction returned empty text");
  return { text, language: "", sourceKind: "text", sourcePath: upload.path };
}

async function transcribeKanbanReadingAudio(audioPath) {
  if (!fs.existsSync(KANBAN_READING_TRANSCRIBE_SCRIPT)) {
    throw new Error(`Reading audio transcription script is not installed: ${KANBAN_READING_TRANSCRIBE_SCRIPT}`);
  }
  const result = await runProcessText("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    KANBAN_READING_TRANSCRIBE_SCRIPT,
    "-AudioPath",
    audioPath,
    "-TimeoutSeconds",
    String(Math.ceil(KANBAN_READING_TRANSCRIBE_TIMEOUT_MS / 1000)),
  ], {
    timeoutMs: KANBAN_READING_TRANSCRIBE_TIMEOUT_MS + 15000,
    maxOutputBytes: 4_000_000,
  });
  const parsed = extractJsonObject(result.stdout || "{}");
  if (!parsed?.ok) throw new Error(compactText(parsed?.error || result.stderr || "Reading audio transcription failed", 800));
  const text = compactText(parsed.text || "", 20000);
  if (!text) throw new Error("Reading audio transcription returned empty text");
  return Object.assign({}, parsed, { text });
}

function kanbanCardRevisionOf(card = {}) {
  return String(card.kanbanRevisionOf || card.kanban_revision_of || "").trim();
}

function kanbanCardEffectiveCaseIndex(card = {}, byId = new Map()) {
  const originalId = kanbanCardRevisionOf(card);
  const original = originalId ? byId.get(originalId) : null;
  const value = original
    ? Number(original.kanbanCaseCardIndex || original.kanban_case_card_index || 0)
    : Number(card.kanbanCaseCardIndex || card.kanban_case_card_index || 0);
  return value || 0;
}

function kanbanCardUpdatedTimestamp(card = {}) {
  const parsed = Date.parse(card.updatedAt || card.updated_at || card.completedAt || card.completed_at || card.createdAt || card.created_at || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function visibleKanbanCaseCards(cards = []) {
  const byId = new Map();
  for (const card of cards || []) {
    const id = String(card?.id || "").trim();
    if (id) byId.set(id, card);
  }
  const baseIds = new Set((cards || [])
    .filter((card) => !kanbanCardRevisionOf(card))
    .map((card) => String(card?.id || "").trim())
    .filter(Boolean));
  const revisionsByOriginal = new Map();
  for (const card of cards || []) {
    const originalId = kanbanCardRevisionOf(card);
    if (!originalId) continue;
    const previous = revisionsByOriginal.get(originalId);
    const previousRank = Number(previous?.kanbanRevisionCount || previous?.kanban_revision_count || 0) || 0;
    const nextRank = Number(card?.kanbanRevisionCount || card?.kanban_revision_count || 0) || 0;
    if (!previous || nextRank > previousRank || (
      nextRank === previousRank
      && kanbanCardUpdatedTimestamp(card) >= kanbanCardUpdatedTimestamp(previous)
    )) {
      revisionsByOriginal.set(originalId, card);
    }
  }
  const visible = [];
  for (const card of cards || []) {
    if (kanbanCardRevisionOf(card)) continue;
    const id = String(card?.id || "").trim();
    visible.push(revisionsByOriginal.get(id) || card);
  }
  for (const card of cards || []) {
    const originalId = kanbanCardRevisionOf(card);
    if (originalId && !baseIds.has(originalId)) visible.push(card);
  }
  return visible.sort((left, right) => {
    const leftIndex = kanbanCardEffectiveCaseIndex(left, byId) || 999;
    const rightIndex = kanbanCardEffectiveCaseIndex(right, byId) || 999;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return kanbanCardUpdatedTimestamp(left) - kanbanCardUpdatedTimestamp(right);
  });
}

async function readingContextForCard(workspaceId, cardId) {
  const listed = await kanbanCardProvider.listCards({
    workspaceId,
    includeCompleted: true,
    scope: "mine",
    limit: 500,
  });
  const cards = Array.isArray(listed?.data) ? listed.data : [];
  const rawCurrent = cards.find((card) => String(card.id) === String(cardId)) || null;
  const caseId = String(rawCurrent?.kanbanCaseId || "").trim();
  const rawSiblings = caseId
    ? cards
      .filter((card) => String(card.kanbanCaseId || "") === caseId)
      .sort((a, b) => (Number(a.kanbanCaseCardIndex || 0) - Number(b.kanbanCaseCardIndex || 0)) || String(a.id).localeCompare(String(b.id)))
    : [];
  const siblings = visibleKanbanCaseCards(rawSiblings);
  const replacement = rawCurrent && !kanbanCardRevisionOf(rawCurrent)
    ? siblings.find((card) => kanbanCardRevisionOf(card) === String(rawCurrent.id))
    : null;
  const current = siblings.find((card) => String(card.id) === String(cardId)) || replacement || rawCurrent;
  const byId = new Map(rawSiblings.map((card) => [String(card.id || ""), card]));
  const currentIndex = kanbanCardEffectiveCaseIndex(current, byId) || Number(current?.kanbanCaseCardIndex || 0) || 0;
  const prior = siblings.filter((card) => kanbanCardEffectiveCaseIndex(card, byId) < currentIndex);
  return { current, siblings, rawSiblings, prior };
}

async function analyzeKanbanReadingSubmission(workspaceId, cardId, currentCard, priorCards, transcription, notes = "") {
  const readingTemplate = kanbanCardUsesReadingTemplate(currentCard);
  const previousContext = (priorCards || [])
    .filter((card) => String(card.kanbanResult || "").trim())
    .map((card) => [
      `Session ${card.kanbanCaseCardIndex || "?"}: ${card.content || card.id}`,
      compactText(card.kanbanResult, 1200),
    ].join("\n"))
    .slice(-8)
    .join("\n\n---\n\n");
  const prompt = [
    readingTemplate
      ? "You are evaluating a child's book-reading retelling submission for a Hermes Mobile study plan."
      : "You are evaluating a child's study-plan submission for Hermes Mobile.",
    "Return Markdown only, concise but specific. Do not include JSON or code fences.",
    readingTemplate
      ? "Use the current transcript as primary evidence. Use previous session feedback only as context for continuity."
      : "Use the current extracted submission text as primary evidence. Use previous session feedback only as context for continuity.",
    readingTemplate
      ? "Include a score out of 100. Break the score down by fluency, grammar, vocabulary, comprehension, organization, and continuity. Base the score on the transcript; do not claim acoustic pronunciation evidence unless it is supported by transcription notes."
      : "Include a score out of 100. Break the score down according to the subject/domain, accuracy, method, completeness, clarity, and continuity. Base the score only on the submitted evidence and parent notes.",
    "Make the score actionable: list the main deductions, quote or paraphrase transcript evidence for each weakness, and explain which skill each deduction affects.",
    "Include a dedicated quiz-target section with 3-5 concrete targets derived only from today's transcript and analysis. For each target include category, transcript evidence, why it affected the score, desired correction/practice pattern, and difficulty level.",
    "Do not invent weaknesses, grammar mistakes, vocabulary gaps, or story details that are not supported by the transcript, parent notes, current card, or previous-session context.",
    readingTemplate
      ? "Required analysis sections include: score out of 100, deductions, today's weakness and error patterns, quiz targets, comprehension, retelling quality, English grammar/expression, vocabulary/sentence patterns, comparison with previous sessions, next-session advice, and parent observation points."
      : "Required analysis sections include: score out of 100, deductions, today's weakness and error patterns, quiz targets, subject accuracy, method/process quality, expression/clarity, comparison with previous sessions, next-session advice, and parent observation points.",
    "Include these sections: 本次评分（100分）, 本次理解, 复述质量, 英语表达与语法, 词汇与句型, 与前次相比, 下一次建议, 家长可观察点.",
    "If this is the final session in the reading template, also include sections: 整本书总结 and 总分（100分）.",
    "Include these sections: 本次理解, 复述质量, 表达与逻辑, 与前次相比, 下一次建议, 家长可观察点.",
    `${readingTemplate ? "Reading study plan" : "Study plan"}: ${currentCard?.kanbanCaseSummary || ""}`,
    `Current card: ${currentCard?.content || cardId}`,
    `Session: ${currentCard?.kanbanCaseCardIndex || ""}/${currentCard?.kanbanCaseCardCount || ""}`,
    currentCard?.kanbanCaseSourceText ? `Original requirement:\n${currentCard.kanbanCaseSourceText}` : "",
    previousContext ? `Previous completed session context:\n${previousContext}` : "Previous completed session context: none yet.",
    notes ? `Parent notes:\n${compactText(notes, 2000)}` : "",
    `${readingTemplate ? "Transcript" : "Submission evidence"}:\n${transcription.text}`,
  ].filter(Boolean).join("\n\n");
  const output = await hermesModelText({
    input: prompt,
    stream: true,
    store: false,
    model: AUTOMATION_CREATE_MODEL,
    reasoning_effort: "medium",
    conversation: `hermes_web_reading_analysis_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    instructions: readingTemplate ? "Evaluate the reading retelling transcript. Return Markdown only." : "Evaluate the study submission. Return Markdown only.",
    access_policy_context: sanitizePolicy(findWorkspace(workspaceId)?.policy || {}),
  }, KANBAN_READING_ANALYSIS_TIMEOUT_MS);
  return compactText(output || "", 12000);
}

function normalizeKanbanReadingQuiz(raw = {}) {
  const questions = (Array.isArray(raw.questions) ? raw.questions : [])
    .map((item, index) => {
      const choices = (Array.isArray(item?.choices) ? item.choices : [])
        .map((choice) => compactText(choice, 260))
        .filter(Boolean)
        .slice(0, 4);
      const answerIndex = Number(item?.answerIndex ?? item?.answer_index ?? item?.correctIndex ?? item?.correct_index);
      return {
        id: compactText(item?.id || `q${index + 1}`, 40),
        prompt: compactText(item?.prompt || item?.question || "", 600),
        choices,
        answerIndex: Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < choices.length ? answerIndex : -1,
        explanation: compactText(item?.explanation || "", 600),
        skill: compactText(item?.skill || item?.category || "", 80),
      };
    })
    .filter((item) => item.prompt && item.choices.length >= 2 && item.answerIndex >= 0)
    .slice(0, 10);
  if (questions.length !== 10) throw new Error(`Reading quiz generation returned ${questions.length} valid questions; expected 10`);
  return {
    title: compactText(raw.title || "Reading practice quiz", 160),
    passingScore: 100,
    questions,
  };
}

function publicKanbanReadingQuiz(quiz = {}) {
  return {
    title: String(quiz.title || "Reading practice quiz"),
    passingScore: 100,
    questions: (Array.isArray(quiz.questions) ? quiz.questions : []).map((item, index) => ({
      id: String(item.id || `q${index + 1}`),
      prompt: String(item.prompt || ""),
      choices: Array.isArray(item.choices) ? item.choices.map((choice) => String(choice || "")) : [],
      skill: String(item.skill || ""),
    })),
  };
}

async function generateKanbanReadingQuiz(workspaceId, cardId, currentCard, transcription, analysis, notes = "") {
  const readingTemplate = kanbanCardUsesReadingTemplate(currentCard);
  const prompt = [
    readingTemplate
      ? "Generate a practice quiz for a child's book-reading retelling session inside a Hermes Mobile study plan."
      : "Generate a practice quiz for a child's study-plan session.",
    "Return JSON only. No Markdown, no comments, no code fences.",
    "The quiz must contain exactly 10 single-answer multiple-choice questions.",
    readingTemplate
      ? "This is a targeted remediation quiz, not a generic book quiz. Every question must be traceable to today's score deductions, weakness/error patterns, quiz targets, transcript evidence, or parent notes."
      : "This is a targeted remediation quiz, not a generic subject quiz. Every question must be traceable to today's score deductions, weakness/error patterns, quiz targets, submitted evidence, or parent notes.",
    readingTemplate
      ? "At least 7 of 10 questions must directly train weaknesses or mistakes found in today's transcript/analysis. Up to 2 questions may check today's story comprehension or sequence, and up to 1 question may train next-retelling structure."
      : "At least 7 of 10 questions must directly train weaknesses or mistakes found in today's submission/analysis. Up to 2 questions may check core subject understanding, and up to 1 question may train better study/reporting structure.",
    readingTemplate
      ? "Do not invent unrelated trivia, random grammar drills, or vocabulary that is not connected to the transcript, the analysis, or the current reading card."
      : "Do not invent unrelated trivia or random drills that are not connected to the submitted evidence, the analysis, or the current study card.",
    "Calibrate difficulty from the analysis score: below 70 should focus on basic comprehension, sequence, and simple sentence correction; 70-84 should use applied grammar/vocabulary choices and sentence ordering; 85 or above should use nuanced grammar, vocabulary precision, retelling structure, and inference. If no score is clear, use medium difficulty but still target explicit weaknesses.",
    "The skill field must be a concise focus label, for example grammar: tense error from today's retelling, vocabulary: precise action verb, comprehension: missing event order, or organization: clearer retelling sequence.",
    "Each explanation must say why the correct answer addresses the specific weakness or error from today's analysis.",
    "Use this exact schema: {\"title\":\"...\",\"questions\":[{\"id\":\"q1\",\"skill\":\"specific weakness focus\",\"prompt\":\"...\",\"choices\":[\"...\",\"...\",\"...\",\"...\"],\"answerIndex\":0,\"explanation\":\"...\"}]}",
    "Each question must have 4 choices and one 0-based answerIndex.",
    "Do not reveal answer keys in prompt text or choices.",
    `Current card: ${currentCard?.content || cardId}`,
    `Session: ${currentCard?.kanbanCaseCardIndex || ""}/${currentCard?.kanbanCaseCardCount || ""}`,
    currentCard?.kanbanCaseSourceText ? `Original requirement:\n${currentCard.kanbanCaseSourceText}` : "",
    notes ? `Parent notes:\n${compactText(notes, 2000)}` : "",
    `Analysis:\n${compactText(analysis, 6000)}`,
    `${readingTemplate ? "Transcript" : "Submission evidence"}:\n${compactText(transcription.text, 8000)}`,
  ].filter(Boolean).join("\n\n");
  const output = await hermesModelText({
    input: prompt,
    stream: false,
    store: false,
    model: AUTOMATION_CREATE_MODEL,
    reasoning_effort: "medium",
    conversation: `hermes_web_reading_quiz_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    instructions: "Generate exactly 10 multiple-choice quiz questions as JSON.",
    access_policy_context: sanitizePolicy(findWorkspace(workspaceId)?.policy || {}),
  }, KANBAN_READING_ANALYSIS_TIMEOUT_MS);
  return normalizeKanbanReadingQuiz(extractJsonObject(output || ""));
}

function readingQuizUrl(workspaceId, cardId) {
  const params = new URLSearchParams({
    view: "todos",
    workspaceId: String(workspaceId || "owner"),
    todoId: String(cardId || ""),
    readingQuiz: "1",
  });
  return `/?${params.toString()}`;
}

function readingSubmissionStatePath(workspaceId, cardId, currentCard = null) {
  return path.join(readingArtifactDirectory(workspaceId, currentCard?.kanbanCaseId || "study-plan", cardId), "latest-reading-submission.json");
}

function readKanbanReadingSubmissionState(workspaceId, cardId, currentCard = null) {
  return readJsonStore(readingSubmissionStatePath(workspaceId, cardId, currentCard), null);
}

function writeKanbanReadingSubmissionState(workspaceId, cardId, currentCard, state) {
  const payload = Object.assign({ schemaVersion: 1, updatedAt: nowIso() }, state || {});
  writeJsonStore(readingSubmissionStatePath(workspaceId, cardId, currentCard), payload);
  return payload;
}

function kanbanReadingCardTimestamp(card = {}) {
  const parsed = Date.parse(card.updatedAt || card.completedAt || card.createdAt || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function findKanbanReadingSubmissionState(workspaceId, cardId, context = {}) {
  const requestedId = String(cardId || "").trim();
  const current = context.current || { id: requestedId, content: requestedId };
  const siblings = Array.isArray(context.siblings) ? context.siblings : [];
  const candidates = [];
  if (current) candidates.push(current);
  const revisions = siblings
    .filter((card) => String(card?.kanbanRevisionOf || "").trim() === requestedId)
    .sort((left, right) => kanbanReadingCardTimestamp(right) - kanbanReadingCardTimestamp(left));
  candidates.push(...revisions);
  const seen = new Set();
  for (const candidate of candidates) {
    const candidateId = String(candidate?.id || requestedId).trim();
    if (!candidateId || seen.has(candidateId)) continue;
    seen.add(candidateId);
    const state = readKanbanReadingSubmissionState(workspaceId, candidateId, candidate);
    if (state?.quiz) return { state, card: candidate, cardId: candidateId };
  }
  return { state: null, card: current, cardId: requestedId };
}

function kanbanReadingQuizNeedsRetarget(state = {}) {
  if (!state?.quiz) return false;
  if (String(state.quizTargetingVersion || "") === KANBAN_READING_QUIZ_TARGETING_VERSION) return false;
  if (String(state.status || "") === "completed") return false;
  if (!String(state?.transcription?.text || "").trim() || !String(state.analysis || "").trim()) return false;
  const attempts = Array.isArray(state.attempts) ? state.attempts : [];
  return attempts.length === 0;
}

async function ensureKanbanReadingQuizTargeted(workspaceId, cardId, currentCard, state = {}) {
  if (!kanbanReadingQuizNeedsRetarget(state)) return { state, retargeted: false, error: "" };
  try {
    const transcription = Object.assign({}, state.transcription || {}, {
      text: compactText(state?.transcription?.text || "", 20000),
    });
    const quiz = await generateKanbanReadingQuiz(workspaceId, cardId, currentCard, transcription, state.analysis, state.notes || "");
    const nextState = writeKanbanReadingSubmissionState(workspaceId, cardId, currentCard, Object.assign({}, state, {
      quiz,
      quizTargetingVersion: KANBAN_READING_QUIZ_TARGETING_VERSION,
      quizRetargetedAt: nowIso(),
      quizUrl: state.quizUrl || readingQuizUrl(workspaceId, cardId),
    }));
    return { state: nextState, retargeted: true, error: "" };
  } catch (err) {
    console.warn("[reading-quiz] targeted quiz regeneration failed", { cardId, error: err?.message || String(err) });
    return { state, retargeted: false, error: compactText(err?.message || String(err), 240) };
  }
}

function writeKanbanReadingAnalysisFile(workspaceId, cardId, currentCard, audio, transcription, analysis, quiz, notes = "") {
  const dir = readingArtifactDirectory(workspaceId, currentCard?.kanbanCaseId || "study-plan", cardId);
  const stem = safeFileName(`${currentCard?.kanbanCaseCardIndex || "session"}-${currentCard?.content || cardId}`).replace(/\.[^.]+$/, "");
  const readingTemplate = kanbanCardUsesReadingTemplate(currentCard);
  const mdPath = path.join(dir, `${Date.now()}-${stem}-${readingTemplate ? "reading" : "study"}-analysis.md`);
  const lines = [
    `# ${currentCard?.content || (readingTemplate ? "Reading submission analysis" : "Study submission analysis")}`,
    "",
    `- Card: ${cardId}`,
    `- Plan: ${currentCard?.kanbanCaseSummary || ""}`,
    `- Submission: ${audio.path}`,
    `- Submitted: ${nowIso()}`,
  ];
  if (notes) lines.push(`- Parent notes: ${notes}`);
  lines.push(
    "",
    "## AI Evaluation",
    "",
    analysis || "No analysis was generated.",
    "",
    "## Practice Quiz",
    "",
    `Quiz link: ${readingQuizUrl(workspaceId, cardId)}`,
    "",
    `Complete all 10 questions correctly in Hermes Mobile to finish this ${readingTemplate ? "reading" : "study"} card.`,
    "",
    readingTemplate ? "## Transcript" : "## Submission Evidence",
    "",
    transcription.text,
  );
  if (quiz?.questions?.length) {
    lines.push("", "## Quiz Question Preview", "");
    for (const [index, question] of quiz.questions.entries()) {
      lines.push(`${index + 1}. ${question.prompt}`);
    }
  }
  const markdown = lines.join("\n");
  fs.writeFileSync(mdPath, markdown, "utf8");
  return mdPath;
}

async function submitKanbanReadingSubmission(workspaceId, cardId, body = {}) {
  const context = await readingContextForCard(workspaceId, cardId);
  const currentCard = context.current || { id: cardId, content: cardId };
  const readingTemplate = kanbanCardUsesReadingTemplate(currentCard);
  const audio = readingTemplate
    ? Object.assign(saveKanbanReadingAudioUpload(workspaceId, cardId, body, currentCard), { kind: "audio" })
    : saveKanbanStudySubmissionUpload(workspaceId, cardId, body, currentCard);
  const transcription = readingTemplate
    ? Object.assign(await transcribeKanbanReadingAudio(audio.path), { sourceKind: "audio", sourcePath: audio.path })
    : await extractKanbanStudySubmissionEvidence(audio);
  const notes = compactText(body.notes || body.comment || "", 2000);
  const analysis = await analyzeKanbanReadingSubmission(workspaceId, cardId, currentCard, context.prior, transcription, notes);
  const quiz = await generateKanbanReadingQuiz(workspaceId, cardId, currentCard, transcription, analysis, notes);
  const analysisPath = writeKanbanReadingAnalysisFile(workspaceId, cardId, currentCard, audio, transcription, analysis, quiz, notes);
  const quizUrl = readingQuizUrl(workspaceId, cardId);
  const submissionState = writeKanbanReadingSubmissionState(workspaceId, cardId, currentCard, {
    status: "quiz_pending",
    workspaceId,
    cardId,
    cardTitle: currentCard.content || cardId,
    analysisPath,
    audio: { path: audio.path, name: audio.name, mime: audio.mime, size: audio.size, kind: audio.kind || transcription.sourceKind || "" },
    transcription: { text: transcription.text, language: transcription.language || "", sourceKind: transcription.sourceKind || "" },
    analysis,
    quiz,
    quizTargetingVersion: KANBAN_READING_QUIZ_TARGETING_VERSION,
    quizUrl,
    notes,
    attempts: [],
    submittedAt: nowIso(),
  });
  const commented = await kanbanCardProvider.mutateCard({
    action: "comment",
    workspaceId,
    cardId,
    comment: [
      readingTemplate ? "Reading retelling audio uploaded and analyzed." : "Study submission uploaded and analyzed.",
      "The full Markdown analysis is attached; complete the 10-question quiz with all answers correct to finish this card.",
      `Quiz: ${quizUrl}`,
      `MEDIA: ${analysisPath}`,
    ].join("\n"),
    author: "Hermes Mobile",
  }).catch(() => null);
  if (!commented?.ok) return { ok: false, error: commented?.error || "Reading submission comment failed", analysisPath };
  return {
    ok: true,
    card: publicTodo(commented),
    audio: { path: audio.path, name: audio.name, mime: audio.mime, size: audio.size, kind: audio.kind || transcription.sourceKind || "" },
    transcription: { text: transcription.text, language: transcription.language || "", sourceKind: transcription.sourceKind || "" },
    analysis,
    analysisPath,
    quiz: publicKanbanReadingQuiz(quiz),
    quizUrl,
    status: submissionState.status,
  };
}

async function getKanbanReadingQuiz(workspaceId, cardId) {
  const context = await readingContextForCard(workspaceId, cardId);
  const lookup = findKanbanReadingSubmissionState(workspaceId, cardId, context);
  let state = lookup.state;
  if (!state?.quiz) return { ok: false, status: 404, error: "Reading quiz is not available yet" };
  const targeted = await ensureKanbanReadingQuizTargeted(workspaceId, lookup.cardId, lookup.card || context.current, state);
  state = targeted.state;
  return {
    ok: true,
    canonicalCardId: lookup.cardId,
    quiz: publicKanbanReadingQuiz(state.quiz),
    quizTargetingVersion: String(state.quizTargetingVersion || ""),
    quizRetargeted: Boolean(targeted.retargeted),
    quizRetargetError: targeted.error || "",
    quizUrl: state.quizUrl || readingQuizUrl(workspaceId, lookup.cardId),
    analysisPath: state.analysisPath || "",
    status: state.status || "quiz_pending",
    attempts: Array.isArray(state.attempts) ? state.attempts.map((attempt) => ({
      submittedAt: attempt.submittedAt || "",
      score: Number(attempt.score || 0),
      passed: Boolean(attempt.passed),
    })).slice(-5) : [],
  };
}

async function submitKanbanReadingQuiz(workspaceId, cardId, body = {}) {
  const context = await readingContextForCard(workspaceId, cardId);
  const lookup = findKanbanReadingSubmissionState(workspaceId, cardId, context);
  const currentCard = lookup.card || context.current || { id: lookup.cardId || cardId, content: cardId };
  const state = lookup.state;
  if (!state?.quiz) return { ok: false, status: 404, error: "Reading quiz is not available yet" };
  if (String(state.status || "") === "completed") {
    return { ok: true, passed: true, score: 100, status: "completed", canonicalCardId: lookup.cardId, quiz: publicKanbanReadingQuiz(state.quiz) };
  }
  const answers = Array.isArray(body.answers)
    ? body.answers
    : (body.answers && typeof body.answers === "object" ? state.quiz.questions.map((question) => body.answers[question.id]) : []);
  const results = state.quiz.questions.map((question, index) => {
    const answerIndex = Number(answers[index]);
    const correct = Number.isInteger(answerIndex) && answerIndex === Number(question.answerIndex);
    return {
      id: question.id || `q${index + 1}`,
      correct,
      answerIndex: Number.isInteger(answerIndex) ? answerIndex : -1,
      correctIndex: Number(question.answerIndex),
      explanation: question.explanation || "",
    };
  });
  const correctCount = results.filter((item) => item.correct).length;
  const score = Math.round((correctCount / Math.max(1, results.length)) * 100);
  const passed = correctCount === 10 && results.length === 10;
  const attempt = {
    submittedAt: nowIso(),
    score,
    correctCount,
    total: results.length,
    passed,
    results,
  };
  const nextState = Object.assign({}, state, {
    status: passed ? "completed" : "quiz_pending",
    attempts: [...(Array.isArray(state.attempts) ? state.attempts : []), attempt].slice(-20),
    completedAt: passed ? nowIso() : state.completedAt || "",
  });
  writeKanbanReadingSubmissionState(workspaceId, lookup.cardId, currentCard, nextState);
  if (!passed) {
    return {
      ok: true,
      passed: false,
      score,
      correctCount,
      total: results.length,
      results: results.map((item) => ({
        id: item.id,
        correct: item.correct,
        explanation: item.correct ? "" : item.explanation,
      })),
      quiz: publicKanbanReadingQuiz(state.quiz),
      canonicalCardId: lookup.cardId,
    };
  }
  const readingTemplate = kanbanCardUsesReadingTemplate(currentCard);
  const resultText = [
    readingTemplate ? "Reading retelling quiz passed." : "Study submission quiz passed.",
    "Quiz score: 100/100.",
    "",
    `MEDIA: ${state.analysisPath}`,
  ].join("\n");
  await kanbanCardProvider.mutateCard({
    action: "comment",
    workspaceId,
    cardId: lookup.cardId,
    comment: `${readingTemplate ? "Reading" : "Study"} quiz passed with 10/10 correct answers. Completing this card.`,
    author: "Hermes Mobile",
  }).catch(() => null);
  const completed = await kanbanCardProvider.mutateCard({
    action: "complete",
    workspaceId,
    cardId: lookup.cardId,
    result: resultText,
    author: "Hermes Mobile",
  });
  if (!completed?.ok) return { ok: false, error: completed?.error || "Reading card completion failed", score };
  await maybeReconcileKanbanDependencyBlocks(workspaceId, { force: true, limit: 500 }).catch(() => null);
  return {
    ok: true,
    passed: true,
    canonicalCardId: lookup.cardId,
    score,
    correctCount,
    total: results.length,
    card: publicTodo(completed),
    status: "completed",
  };
}

function isKanbanAssessmentCard(card = {}) {
  const mode = String(card?.kanbanCaseMode || card?.kanban_case_mode || "").trim();
  const template = String(card?.kanbanCaseTemplate || card?.kanban_case_template || "").trim();
  return isKanbanAssessmentCaseMode(mode) || (isKanbanStudyCaseMode(mode) && template === "final-assessment");
}

function assessmentExamStatePath(workspaceId, cardId, currentCard = null) {
  return path.join(readingArtifactDirectory(workspaceId, currentCard?.kanbanCaseId || "assessment-plan", cardId), "latest-assessment-exam.json");
}

function readKanbanAssessmentExamState(workspaceId, cardId, currentCard = null) {
  return readJsonStore(assessmentExamStatePath(workspaceId, cardId, currentCard), null);
}

function writeKanbanAssessmentExamState(workspaceId, cardId, currentCard, state) {
  const payload = Object.assign({ schemaVersion: 1, updatedAt: nowIso() }, state || {});
  writeJsonStore(assessmentExamStatePath(workspaceId, cardId, currentCard), payload);
  return payload;
}

function seededNumber(seedText) {
  let value = 2166136261;
  const text = String(seedText || "");
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function seededRandom(seedText) {
  let seed = seededNumber(seedText) || 1;
  return () => {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507);
    seed = Math.imul(seed ^ (seed >>> 13), 3266489909);
    return ((seed ^= seed >>> 16) >>> 0) / 4294967296;
  };
}

function assessmentChoiceSet(correct, distractors, random) {
  const seen = new Set();
  const values = [correct, ...(Array.isArray(distractors) ? distractors : [])]
    .map((value) => String(value))
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  while (values.length < 4) {
    const candidate = String(Number(correct) + (values.length + 1) * (random() > 0.5 ? 1 : -1));
    if (!seen.has(candidate)) {
      seen.add(candidate);
      values.push(candidate);
    }
  }
  const choices = values.slice(0, 4);
  for (let index = choices.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [choices[index], choices[swap]] = [choices[swap], choices[index]];
  }
  return { choices, answerIndex: choices.indexOf(String(correct)) };
}

function mathQuestionWithChoices(id, skill, prompt, correct, distractors, explanation, random) {
  const choiceSet = assessmentChoiceSet(correct, distractors, random);
  return {
    id,
    skill,
    prompt,
    choices: choiceSet.choices,
    answerIndex: choiceSet.answerIndex,
    explanation,
    verification: "deterministic-template",
  };
}

function gcdInt(a, b) {
  let left = Math.abs(Number(a) || 0);
  let right = Math.abs(Number(b) || 0);
  while (right) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left || 1;
}

function fractionText(numerator, denominator) {
  const divisor = gcdInt(numerator, denominator);
  return `${numerator / divisor}/${denominator / divisor}`;
}

function assessmentLooksLikeAmc8(config = {}, seedText = "") {
  const text = [
    config.subject,
    config.subjectId,
    config.courseLevel,
    config.difficulty,
    seedText,
  ].map((item) => String(item || "").toLowerCase()).join(" ");
  return /amc\s*8|amc8|mathcounts|competition|contest/.test(text)
    || /竞赛|奥数|美国数学/.test(text);
}

function generateVerifiedAmc8AssessmentQuestions(config = {}, seedText = "") {
  const random = seededRandom(seedText);
  const count = Math.max(5, Math.min(KANBAN_ASSESSMENT_MAX_QUESTIONS, Number(config.questionCount || 20) || 20));
  const int = (min, max) => min + Math.floor(random() * (max - min + 1));
  const questions = [];
  for (let index = 0; index < count; index += 1) {
    const type = index % 10;
    const id = `q${index + 1}`;
    if (type === 0) {
      const x = int(4, 16);
      const a = int(2, 7);
      const b = int(3, 11);
      const c = a * (x + b);
      questions.push(mathQuestionWithChoices(id, "AMC 8 algebra", `If ${a}(x + ${b}) = ${c}, what is x?`, x, [x + b, x - 1, c - b, a + b], `Divide by ${a} to get x + ${b} = ${x + b}, so x = ${x}.`, random));
    } else if (type === 1) {
      const width = int(6, 15);
      const height = int(5, 14);
      const cut = int(2, Math.min(width, height) - 1);
      const correct = width * height - cut * cut;
      questions.push(mathQuestionWithChoices(id, "AMC 8 geometry area", `A ${width} by ${height} rectangle has a ${cut} by ${cut} square removed from one corner. What area remains?`, correct, [width * height, correct + cut, 2 * (width + height) - cut * cut, correct - cut], `The original area is ${width * height}; the removed square area is ${cut * cut}; remaining area is ${correct}.`, random));
    } else if (type === 2) {
      const sides = int(7, 14);
      const correct = sides * (sides - 3) / 2;
      questions.push(mathQuestionWithChoices(id, "AMC 8 combinatorics", `How many diagonals does a convex ${sides}-gon have?`, correct, [sides * (sides - 1) / 2, sides * (sides - 3), correct + sides, correct - sides], `A polygon has n(n-3)/2 diagonals, so ${sides}(${sides}-3)/2 = ${correct}.`, random));
    } else if (type === 3) {
      const red = int(3, 8);
      const blue = int(4, 9);
      const total = red + blue;
      const numerator = red * blue * 2;
      const denominator = total * (total - 1);
      const correct = fractionText(numerator, denominator);
      questions.push(mathQuestionWithChoices(id, "AMC 8 probability", `A bag has ${red} red and ${blue} blue balls. Two balls are drawn without replacement. What is the probability the colors are different?`, correct, [fractionText(red * blue, denominator), fractionText(red * (red - 1), denominator), fractionText(blue * (blue - 1), denominator), fractionText(numerator, total * total)], `Different colors can occur as RB or BR, giving ${red}*${blue}*2 favorable ordered outcomes out of ${total}*${total - 1}.`, random));
    } else if (type === 4) {
      const primes = [[2, 3], [2, 5], [3, 5], [2, 7]][int(0, 3)];
      const expA = int(2, 4);
      const expB = int(1, 3);
      const correct = (expA + 1) * (expB + 1);
      questions.push(mathQuestionWithChoices(id, "AMC 8 number theory", `How many positive divisors does ${primes[0]}^${expA} * ${primes[1]}^${expB} have?`, correct, [expA * expB, correct - 1, correct + expA, expA + expB + 1], `For p^a q^b, the divisor count is (a+1)(b+1) = ${correct}.`, random));
    } else if (type === 5) {
      const boys = int(3, 7);
      const girls = int(4, 9);
      const scale = int(4, 11);
      const addedGirls = int(2, 8);
      const correct = boys * scale;
      const totalAfter = (boys + girls) * scale + addedGirls;
      questions.push(mathQuestionWithChoices(id, "AMC 8 ratio", `A club has boys:girls = ${boys}:${girls}. After ${addedGirls} girls join, there are ${totalAfter} students. How many boys are in the club?`, correct, [girls * scale, correct + addedGirls, totalAfter - correct, correct - addedGirls], `Before the new girls, the total was ${totalAfter - addedGirls}; one ratio unit is ${scale}, so boys = ${boys}*${scale}.`, random));
    } else if (type === 6) {
      const countScores = int(4, 7);
      const average = int(12, 20);
      const newScore = int(21, 30);
      const newAverageNumerator = average * countScores + newScore;
      const correct = fractionText(newAverageNumerator, countScores + 1);
      questions.push(mathQuestionWithChoices(id, "AMC 8 averages", `${countScores} numbers have average ${average}. A new number ${newScore} is added. What is the new average?`, correct, [String(average + newScore), fractionText(average + newScore, 2), fractionText(newAverageNumerator, countScores), String(average + 1)], `The new sum is ${average * countScores}+${newScore}=${newAverageNumerator}, divided by ${countScores + 1}.`, random));
    } else if (type === 7) {
      const divisor = int(5, 13);
      const quotient = int(8, 25);
      const remainder = int(1, divisor - 1);
      const value = divisor * quotient + remainder;
      const multiplier = int(3, 9);
      const correct = (value * multiplier) % divisor;
      questions.push(mathQuestionWithChoices(id, "AMC 8 modular arithmetic", `When ${value} is multiplied by ${multiplier}, what is the remainder upon division by ${divisor}?`, correct, [(remainder + multiplier) % divisor, remainder, divisor - correct, (correct + 1) % divisor], `${value} leaves remainder ${remainder}; ${remainder}*${multiplier} leaves remainder ${correct} mod ${divisor}.`, random));
    } else if (type === 8) {
      const slow = int(3, 7);
      const fast = slow + int(2, 5);
      const hours = int(2, 5);
      const correct = (fast - slow) * hours;
      questions.push(mathQuestionWithChoices(id, "AMC 8 rate", `Runner A travels ${slow} miles per hour and Runner B travels ${fast} miles per hour in the same direction. After ${hours} hours, how many miles farther has B traveled?`, correct, [fast * hours, slow * hours, correct + slow, fast - slow], `Only the speed difference matters: (${fast}-${slow})*${hours} = ${correct}.`, random));
    } else {
      const first = int(2, 9);
      const diff = int(3, 8);
      const term = int(9, 16);
      const correct = first + (term - 1) * diff;
      questions.push(mathQuestionWithChoices(id, "AMC 8 sequences", `The first term of an arithmetic sequence is ${first}, and the common difference is ${diff}. What is the ${term}th term?`, correct, [first + term * diff, correct - diff, correct + diff, first * term], `The ${term}th term is ${first}+(${term}-1)*${diff} = ${correct}.`, random));
    }
  }
  return questions;
}

function generateVerifiedMathAssessmentQuestions(config = {}, seedText = "") {
  if (assessmentLooksLikeAmc8(config, seedText)) return generateVerifiedAmc8AssessmentQuestions(config, seedText);
  const random = seededRandom(seedText);
  const count = Math.max(5, Math.min(KANBAN_ASSESSMENT_MAX_QUESTIONS, Number(config.questionCount || 20) || 20));
  const int = (min, max) => min + Math.floor(random() * (max - min + 1));
  const questions = [];
  for (let index = 0; index < count; index += 1) {
    const type = index % 10;
    const id = `q${index + 1}`;
    if (type === 0) {
      const a = int(12, 80);
      const b = int(8, 60);
      const c = int(3, 9);
      const correct = a + b * c;
      questions.push(mathQuestionWithChoices(id, "arithmetic: operation order", `${a} + ${b} × ${c} = ?`, correct, [a + b + c, (a + b) * c, correct + b, correct - c], `先算乘法 ${b} × ${c}，再加 ${a}。`, random));
    } else if (type === 1) {
      const x = int(3, 18);
      const a = int(2, 9);
      const b = int(4, 30);
      const c = a * x + b;
      questions.push(mathQuestionWithChoices(id, "algebra: linear equation", `If ${a}x + ${b} = ${c}, what is x?`, x, [x + 1, x - 1, a + b, c - b], `移项后 ${a}x=${c - b}，所以 x=${x}。`, random));
    } else if (type === 2) {
      const base = int(8, 30) * 10;
      const rate = [10, 15, 20, 25, 30, 40][int(0, 5)];
      const correct = Math.round(base * rate / 100);
      questions.push(mathQuestionWithChoices(id, "percentage", `${base} 的 ${rate}% 是多少？`, correct, [correct + 5, correct - 5, Math.round(base / rate), base - correct], `${rate}% = ${rate}/100，所以结果是 ${correct}。`, random));
    } else if (type === 3) {
      const left = int(2, 7);
      const right = int(3, 9);
      const unit = int(4, 12);
      const total = (left + right) * unit;
      const correct = left * unit;
      questions.push(mathQuestionWithChoices(id, "ratio", `A:B = ${left}:${right}，如果 A+B=${total}，A 是多少？`, correct, [right * unit, correct + unit, total - correct + unit, total], `总份数 ${left + right}，每份 ${unit}，A=${left} 份。`, random));
    } else if (type === 4) {
      const w = int(4, 14);
      const h = int(5, 16);
      const correct = w * h;
      questions.push(mathQuestionWithChoices(id, "geometry: rectangle area", `长方形长 ${w}、宽 ${h}，面积是多少？`, correct, [2 * (w + h), correct + w, correct + h, w + h], `长方形面积 = 长 × 宽 = ${correct}。`, random));
    } else if (type === 5) {
      const a = int(55, 95);
      const b = int(55, 95);
      const c = int(55, 95);
      const targetAvg = int(70, 90);
      const correct = targetAvg * 4 - a - b - c;
      questions.push(mathQuestionWithChoices(id, "average", `四次测验平均分要达到 ${targetAvg}。前三次是 ${a}, ${b}, ${c}，第四次需要多少分？`, correct, [correct + 5, correct - 5, targetAvg, Math.round((a + b + c) / 3)], `四次总分需 ${targetAvg * 4}，减去前三次即可。`, random));
    } else if (type === 6) {
      const red = int(2, 8);
      const blue = int(2, 8);
      const total = red + blue;
      questions.push(mathQuestionWithChoices(id, "probability", `袋子里有 ${red} 个红球和 ${blue} 个蓝球，随机取 1 个，取到红球的概率是？`, `${red}/${total}`, [`${blue}/${total}`, `${red}/${blue}`, `${total}/${red}`, `1/${total}`], `有利结果 ${red} 个，总结果 ${total} 个。`, random));
    } else if (type === 7) {
      const start = int(2, 12);
      const step = int(3, 9);
      const correct = start + step * 5;
      questions.push(mathQuestionWithChoices(id, "sequence", `数列 ${start}, ${start + step}, ${start + step * 2}, ${start + step * 3}, ... 的第 6 项是多少？`, correct, [correct - step, correct + step, start * 6, step * 6], `第 6 项比第 1 项多 5 个公差。`, random));
    } else if (type === 8) {
      const n = int(4, 16);
      const divisor = int(3, 9);
      const remainder = int(0, divisor - 1);
      const value = n * divisor + remainder;
      questions.push(mathQuestionWithChoices(id, "number theory: remainder", `${value} 除以 ${divisor} 的余数是多少？`, remainder, [divisor - remainder, remainder + 1, n, divisor], `${value}=${divisor}×${n}+${remainder}。`, random));
    } else {
      const price = int(12, 48);
      const countItems = int(3, 9);
      const paid = Math.ceil(price * countItems / 10) * 10 + 10;
      const correct = paid - price * countItems;
      questions.push(mathQuestionWithChoices(id, "word problem", `每本练习册 ${price} 元，买 ${countItems} 本，付 ${paid} 元，应找回多少元？`, correct, [correct + price, correct - 1, paid - price, price * countItems], `总价 ${price * countItems}，找回 ${paid}-${price * countItems}=${correct}。`, random));
    }
  }
  return questions;
}

function normalizeKanbanAssessmentExam(raw = {}, config = {}) {
  const questionLimit = Math.max(5, Math.min(KANBAN_ASSESSMENT_MAX_QUESTIONS, Number(config.questionCount || raw.questionCount || raw.question_count || 20) || 20));
  const questions = (Array.isArray(raw.questions) ? raw.questions : [])
    .map((item, index) => {
      const choices = (Array.isArray(item?.choices) ? item.choices : [])
        .map((choice) => compactText(choice, 320))
        .filter(Boolean)
        .slice(0, 4);
      const answerIndex = Number(item?.answerIndex ?? item?.answer_index ?? item?.correctIndex ?? item?.correct_index);
      return {
        id: compactText(item?.id || `q${index + 1}`, 40),
        skill: compactText(item?.skill || item?.category || "", 100),
        prompt: compactText(item?.prompt || item?.question || "", 900),
        choices,
        answerIndex: Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < choices.length ? answerIndex : -1,
        explanation: compactText(item?.explanation || "", 900),
        verification: compactText(item?.verification || raw.verification || "model-generated", 80),
      };
    })
    .filter((item) => item.prompt && item.choices.length >= 2 && item.answerIndex >= 0)
    .slice(0, questionLimit);
  if (questions.length !== questionLimit) throw new Error(`Assessment exam generation returned ${questions.length} valid questions; expected ${questionLimit}`);
  return {
    title: compactText(raw.title || `${config.subject || "Assessment"} formal exam`, 160),
    subject: compactText(raw.subject || config.subject || "", 80),
    subjectId: compactText(raw.subjectId || raw.subject_id || config.subjectId || "", 80),
    questionCount: questionLimit,
    durationMinutes: Math.max(5, Math.min(180, Number(config.durationMinutes || raw.durationMinutes || raw.duration_minutes || 30) || 30)),
    passingScore: Math.max(50, Math.min(100, Number(config.passingScore || raw.passingScore || raw.passing_score || 80) || 80)),
    verification: compactText(raw.verification || (questions.every((item) => item.verification === "deterministic-template") ? "deterministic-template" : "model-generated"), 80),
    questions,
  };
}

async function generateKanbanAssessmentExam(workspaceId, cardId, currentCard, config = {}) {
  const assessmentSeedText = [
    workspaceId,
    cardId,
    currentCard?.updatedAt || "",
    currentCard?.content || "",
    currentCard?.kanbanCaseSourceText || "",
    currentCard?.kanbanCaseCardGoal || "",
    currentCard?.kanbanRevisionRequest || "",
    config.courseLevel || "",
    config.difficulty || "",
  ].join("\0");
  if (normalizeKanbanAssessmentSubjectId(config.subjectId || config.subject) === "math") {
    return normalizeKanbanAssessmentExam({
      title: `${config.subject || "数学"}正式测试`,
      subject: config.subject || "数学",
      subjectId: "math",
      verification: "deterministic-template",
      questions: generateVerifiedMathAssessmentQuestions(config, assessmentSeedText),
    }, config);
  }
  const prompt = [
    "Generate a formal assessment exam as JSON only. No Markdown, no comments, no code fences.",
    "The exam must use single-answer multiple-choice questions.",
    "Questions should be more comprehensive and harder than a daily practice quiz.",
    "Do not copy copyrighted exam questions. Create original questions or generic skill checks.",
    "Every question needs exactly 4 choices, one 0-based answerIndex, one concise skill tag, and a brief explanation.",
    "The answer key must be internally consistent. Avoid questions that require external images, audio, or ambiguous current events.",
    "Use this schema: {\"title\":\"...\",\"subject\":\"...\",\"verification\":\"model-generated\",\"questions\":[{\"id\":\"q1\",\"skill\":\"...\",\"prompt\":\"...\",\"choices\":[\"...\",\"...\",\"...\",\"...\"],\"answerIndex\":0,\"explanation\":\"...\"}]}",
    `Subject: ${config.subject || ""}`,
    `Learner: ${config.learnerName || ""}`,
    `Course level: ${config.courseLevel || ""}`,
    `Question count: ${config.questionCount || 20}`,
    `Duration minutes: ${config.durationMinutes || 30}`,
    `Passing score: ${config.passingScore || 80}`,
    `Difficulty blueprint: ${config.difficulty || ""}`,
    currentCard?.kanbanCaseCardGoal ? `Current card instruction:\n${compactText(currentCard.kanbanCaseCardGoal.replace(/ASSESSMENT_CONFIG:[A-Za-z0-9_-]+/g, ""), 1200)}` : "",
    currentCard?.kanbanCaseSourceText ? `Plan blueprint:\n${compactText(currentCard.kanbanCaseSourceText.replace(/ASSESSMENT_CONFIG:[A-Za-z0-9_-]+/g, ""), 5000)}` : "",
  ].filter(Boolean).join("\n\n");
  const output = await hermesModelText({
    input: prompt,
    stream: false,
    store: false,
    model: AUTOMATION_CREATE_MODEL,
    reasoning_effort: "medium",
    conversation: `hermes_web_assessment_exam_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    instructions: "Generate a formal multiple-choice assessment exam as JSON.",
    access_policy_context: sanitizePolicy(findWorkspace(workspaceId)?.policy || {}),
  }, KANBAN_ASSESSMENT_MODEL_TIMEOUT_MS);
  return normalizeKanbanAssessmentExam(extractJsonObject(output || ""), config);
}

function publicKanbanAssessmentExam(exam = {}, state = {}) {
  return {
    title: String(exam.title || "Formal assessment"),
    subject: String(exam.subject || ""),
    subjectId: String(exam.subjectId || ""),
    questionCount: Number(exam.questionCount || (Array.isArray(exam.questions) ? exam.questions.length : 0)) || 0,
    durationMinutes: Number(exam.durationMinutes || 30) || 30,
    passingScore: Number(exam.passingScore || 80) || 80,
    verification: String(exam.verification || ""),
    startedAt: String(state.startedAt || ""),
    status: String(state.status || "in_progress"),
    questions: (Array.isArray(exam.questions) ? exam.questions : []).map((item, index) => ({
      id: String(item.id || `q${index + 1}`),
      prompt: String(item.prompt || ""),
      choices: Array.isArray(item.choices) ? item.choices.map((choice) => String(choice || "")) : [],
      skill: String(item.skill || ""),
    })),
  };
}

function assessmentExamUrl(workspaceId, cardId) {
  const params = new URLSearchParams({
    view: "todos",
    workspaceId: String(workspaceId || "owner"),
    todoId: String(cardId || ""),
    assessmentExam: "1",
  });
  return `/?${params.toString()}`;
}

function publicKanbanAssessmentSummary(workspaceId, card = {}) {
  if (!isKanbanAssessmentCard(card)) return null;
  const cardId = String(card?.id || card?.cardId || "").trim();
  if (!cardId) return null;
  const state = readKanbanAssessmentExamState(workspaceId, cardId, card);
  const config = kanbanAssessmentConfigFromCard(card);
  const attempts = Array.isArray(state?.attempts) ? state.attempts : [];
  const lastAttempt = attempts.length ? attempts[attempts.length - 1] : null;
  return {
    status: String(state?.status || "not_started"),
    startedAt: String(state?.startedAt || ""),
    completedAt: String(state?.completedAt || ""),
    examAvailable: Boolean(state?.exam),
    examUrl: assessmentExamUrl(workspaceId, cardId),
    questionCount: Number(state?.exam?.questionCount || config.questionCount || 20) || 20,
    durationMinutes: Number(state?.exam?.durationMinutes || config.durationMinutes || 30) || 30,
    passingScore: Number(state?.exam?.passingScore || config.passingScore || 80) || 80,
    finalExam: Boolean(config.finalExam),
    verification: String(state?.exam?.verification || ""),
    lastAttempt: lastAttempt ? {
      submittedAt: lastAttempt.submittedAt || "",
      score: Number(lastAttempt.score || 0),
      correctCount: Number(lastAttempt.correctCount || 0),
      total: Number(lastAttempt.total || 0),
      passingScore: Number(lastAttempt.passingScore || config.passingScore || 80),
      passed: Boolean(lastAttempt.passed),
    } : null,
  };
}

function kanbanAssessmentStateCompleted(workspaceId, card = {}) {
  const cardId = String(card?.id || card?.cardId || "").trim();
  if (!cardId || !isKanbanAssessmentCard(card)) return false;
  const state = readKanbanAssessmentExamState(workspaceId, cardId, card);
  const attempts = Array.isArray(state?.attempts) ? state.attempts : [];
  const lastAttempt = attempts.length ? attempts[attempts.length - 1] : null;
  return String(state?.status || "") === "completed" || Boolean(lastAttempt?.passed);
}

function kanbanAssessmentPriorComplete(workspaceId, priorCards = []) {
  return (priorCards || [])
    .filter((card) => isKanbanAssessmentCard(card))
    .every((card) => kanbanAssessmentStateCompleted(workspaceId, card));
}

function kanbanAssessmentArchived(card = {}) {
  const kanbanStatus = String(card?.kanbanStatus || card?.kanban_status || "").trim().toLowerCase();
  const status = String(card?.status || "").trim().toLowerCase();
  return kanbanStatus === "archived" || status === "cancelled";
}

function kanbanAssessmentCanStart(card = {}, state = null, priorCards = [], workspaceId = "owner") {
  if (state?.exam) return true;
  if (kanbanAssessmentArchived(card)) return false;
  if (!kanbanAssessmentPriorComplete(workspaceId, priorCards)) return false;
  return true;
}

function assessmentExamReportPath(workspaceId, cardId, currentCard, exam, attempt) {
  const dir = readingArtifactDirectory(workspaceId, currentCard?.kanbanCaseId || "assessment-plan", cardId);
  const mdPath = path.join(dir, `${Date.now()}-${safeFileName(currentCard?.content || cardId)}-assessment-report.md`);
  const wrong = (attempt.results || []).filter((item) => !item.correct);
  const lines = [
    `# ${currentCard?.content || exam.title || "Assessment Report"}`,
    "",
    `- Card: ${cardId}`,
    `- Subject: ${exam.subject || ""}`,
    `- Score: ${attempt.score}/100`,
    `- Correct: ${attempt.correctCount}/${attempt.total}`,
    `- Passing score: ${exam.passingScore}/100`,
    `- Passed: ${attempt.passed ? "yes" : "no"}`,
    `- Submitted: ${attempt.submittedAt}`,
    "",
    "## Summary",
    "",
    attempt.passed
      ? "This formal assessment reached the passing score."
      : "This formal assessment did not reach the passing score. Retake is required before the card can complete.",
    "",
    "## Incorrect Items",
    "",
    wrong.length ? wrong.map((item) => `- ${item.id}: ${item.explanation || "Review this skill."}`).join("\n") : "None.",
  ];
  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");
  return mdPath;
}

async function getKanbanAssessmentExam(workspaceId, cardId) {
  const context = await readingContextForCard(workspaceId, cardId);
  const currentCard = context.current || { id: cardId, content: cardId };
  if (!isKanbanAssessmentCard(currentCard)) return { ok: false, status: 404, error: "Assessment exam is not available for this card" };
  const canonicalCardId = String(currentCard.id || cardId);
  const existing = readKanbanAssessmentExamState(workspaceId, canonicalCardId, currentCard);
  if (!kanbanAssessmentCanStart(currentCard, existing, context.prior || [], workspaceId)) {
    return { ok: false, status: 409, error: "Assessment exam is not open yet" };
  }
  if (existing?.exam) {
    return {
      ok: true,
      exam: publicKanbanAssessmentExam(existing.exam, existing),
      status: existing.status || "in_progress",
      attempts: Array.isArray(existing.attempts) ? existing.attempts.map((attempt) => ({
        submittedAt: attempt.submittedAt || "",
        score: Number(attempt.score || 0),
        passed: Boolean(attempt.passed),
      })).slice(-5) : [],
    };
  }
  const config = kanbanAssessmentConfigFromCard(currentCard);
  const exam = await generateKanbanAssessmentExam(workspaceId, canonicalCardId, currentCard, config);
  const state = writeKanbanAssessmentExamState(workspaceId, canonicalCardId, currentCard, {
    status: "in_progress",
    workspaceId,
    cardId: canonicalCardId,
    cardTitle: currentCard.content || cardId,
    config,
    exam,
    startedAt: nowIso(),
    attempts: [],
  });
  return { ok: true, exam: publicKanbanAssessmentExam(exam, state), status: state.status, attempts: [] };
}

async function submitKanbanAssessmentExam(workspaceId, cardId, body = {}) {
  const context = await readingContextForCard(workspaceId, cardId);
  const currentCard = context.current || { id: cardId, content: cardId };
  if (!isKanbanAssessmentCard(currentCard)) return { ok: false, status: 404, error: "Assessment exam is not available for this card" };
  const canonicalCardId = String(currentCard.id || cardId);
  let state = readKanbanAssessmentExamState(workspaceId, canonicalCardId, currentCard);
  if (!state?.exam) {
    const generated = await getKanbanAssessmentExam(workspaceId, canonicalCardId);
    if (!generated.ok) return generated;
    state = readKanbanAssessmentExamState(workspaceId, canonicalCardId, currentCard);
  }
  const exam = state.exam;
  const answers = Array.isArray(body.answers)
    ? body.answers
    : (body.answers && typeof body.answers === "object" ? exam.questions.map((question) => body.answers[question.id]) : []);
  const results = exam.questions.map((question, index) => {
    const answerIndex = Number(answers[index]);
    const correct = Number.isInteger(answerIndex) && answerIndex === Number(question.answerIndex);
    return {
      id: question.id || `q${index + 1}`,
      skill: question.skill || "",
      correct,
      answerIndex: Number.isInteger(answerIndex) ? answerIndex : -1,
      correctIndex: Number(question.answerIndex),
      explanation: question.explanation || "",
    };
  });
  const correctCount = results.filter((item) => item.correct).length;
  const score = Math.round((correctCount / Math.max(1, results.length)) * 100);
  const passingScore = Number(exam.passingScore || state.config?.passingScore || 80) || 80;
  const passed = score >= passingScore;
  const attempt = {
    submittedAt: nowIso(),
    score,
    correctCount,
    total: results.length,
    passingScore,
    passed,
    results,
  };
  const reportPath = assessmentExamReportPath(workspaceId, canonicalCardId, currentCard, exam, attempt);
  const nextState = Object.assign({}, state, {
    status: passed ? "completed" : "retake_required",
    attempts: [...(Array.isArray(state.attempts) ? state.attempts : []), attempt].slice(-20),
    lastReportPath: reportPath,
    completedAt: passed ? nowIso() : state.completedAt || "",
  });
  writeKanbanAssessmentExamState(workspaceId, canonicalCardId, currentCard, nextState);
  const resultComment = [
    `Formal assessment scored ${score}/100; passing score ${passingScore}/100.`,
    passed ? "Assessment passed. Completing this card." : "Assessment did not pass. Retake is required; this card remains open.",
    `MEDIA: ${reportPath}`,
  ].join("\n");
  await kanbanCardProvider.mutateCard({
    action: "comment",
    workspaceId,
    cardId: canonicalCardId,
    comment: resultComment,
    author: "Hermes Mobile",
  }).catch(() => null);
  if (!passed) {
    return {
      ok: true,
      passed: false,
      status: "retake_required",
      score,
      correctCount,
      total: results.length,
      passingScore,
      reportPath,
      results: results.map((item) => ({ id: item.id, skill: item.skill, correct: item.correct, explanation: item.correct ? "" : item.explanation })),
      exam: publicKanbanAssessmentExam(exam, nextState),
    };
  }
  const completed = await kanbanCardProvider.mutateCard({
    action: "complete",
    workspaceId,
    cardId: canonicalCardId,
    result: [
      `Formal assessment passed with ${score}/100.`,
      `Correct: ${correctCount}/${results.length}.`,
      `MEDIA: ${reportPath}`,
    ].join("\n"),
    author: "Hermes Mobile",
  });
  if (!completed?.ok) return { ok: false, error: completed?.error || "Assessment card completion failed", score };
  await maybeReconcileKanbanDependencyBlocks(workspaceId, { force: true, limit: 500 }).catch(() => null);
  return {
    ok: true,
    passed: true,
    status: "completed",
    score,
    correctCount,
    total: results.length,
    passingScore,
    reportPath,
    card: publicTodo(completed),
  };
}

async function maybeReconcileKanbanDependencyBlocks(workspaceId, options = {}) {
  if (!useKanbanTodoBackend()) return { ok: true, skipped: true, reason: "kanban_backend_disabled" };
  const id = String(workspaceId || "owner").trim() || "owner";
  const now = Date.now();
  const last = kanbanDependencyReconcileLastRun.get(id) || 0;
  if (!options.force && now - last < KANBAN_DEPENDENCY_RECONCILE_INTERVAL_MS) {
    return { ok: true, skipped: true, reason: "recent", workspaceId: id };
  }
  kanbanDependencyReconcileLastRun.set(id, now);
  const result = await kanbanCardProvider.reconcileDependencyBlocks({
    workspaceId: id,
    limit: options.limit || 500,
  });
  const released = Array.isArray(result?.released) ? result.released : [];
  for (const item of released) {
    const cardId = String(item?.id || "");
    broadcast({ type: "kanban.updated", workspaceId: id, cardId, action: "dependency-unblocked" });
    broadcast({ type: "todos.updated", workspaceId: id, todoId: cardId, action: "dependency-unblocked" });
  }
  if (released.length) clearKanbanCardListCache(id);
  if (released.length) {
    console.info(`Hermes Kanban dependency reconcile released ${released.length} card(s) for workspace ${id}.`);
  }
  return Object.assign({ workspaceId: id }, result || {});
}

function kanbanCardListCacheKey(args = {}) {
  return [
    String(args.workspaceId || "owner"),
    String(args.scope || "mine"),
    args.includeCompleted ? "all" : "open",
    String(args.assignee || ""),
    String(args.limit || 120),
    String(args.search || ""),
  ].join("\0");
}

function readKanbanCardListCache(args = {}) {
  if (!KANBAN_CARD_LIST_CACHE_TTL_MS) return null;
  const key = kanbanCardListCacheKey(args);
  if (!kanbanCardListCacheStoreLoaded) {
    const store = readJsonStore(KANBAN_CARD_LIST_CACHE_PATH, { entries: {} });
    const entries = store?.entries && typeof store.entries === "object" ? store.entries : {};
    for (const [entryKey, entry] of Object.entries(entries)) {
      if (entry && typeof entry === "object") kanbanCardListCache.set(entryKey, entry);
    }
    kanbanCardListCacheStoreLoaded = true;
  }
  const cached = kanbanCardListCache.get(key);
  if (!cached) return null;
  if (Date.now() - Number(cached.savedAt || 0) > KANBAN_CARD_LIST_CACHE_TTL_MS) {
    kanbanCardListCache.delete(key);
    return null;
  }
  return Object.assign({}, cached.payload, {
    cache: { hit: true, ageMs: Date.now() - Number(cached.savedAt || 0) },
  });
}

function writeKanbanCardListCache(args = {}, payload = {}) {
  if (!KANBAN_CARD_LIST_CACHE_TTL_MS) return;
  const entry = {
    savedAt: Date.now(),
    payload,
  };
  kanbanCardListCache.set(kanbanCardListCacheKey(args), entry);
  const entries = {};
  const now = Date.now();
  for (const [key, value] of kanbanCardListCache.entries()) {
    if (now - Number(value?.savedAt || 0) <= KANBAN_CARD_LIST_CACHE_TTL_MS) entries[key] = value;
  }
  writeJsonStore(KANBAN_CARD_LIST_CACHE_PATH, { schemaVersion: 1, updatedAt: nowIso(), entries });
}

function clearKanbanCardListCache(workspaceId = "") {
  const prefix = workspaceId ? `${String(workspaceId)}\0` : "";
  for (const key of kanbanCardListCache.keys()) {
    if (!prefix || key.startsWith(prefix)) kanbanCardListCache.delete(key);
  }
  if (fs.existsSync(KANBAN_CARD_LIST_CACHE_PATH)) {
    const entries = {};
    for (const [key, value] of kanbanCardListCache.entries()) entries[key] = value;
    writeJsonStore(KANBAN_CARD_LIST_CACHE_PATH, { schemaVersion: 1, updatedAt: nowIso(), entries });
  }
}

function scheduleKanbanDependencyReconcile(workspaceId) {
  maybeReconcileKanbanDependencyBlocks(workspaceId)
    .catch((err) => console.warn(`Hermes Kanban dependency reconcile failed for workspace ${workspaceId}: ${err.message || err}`));
  return { ok: true, skipped: true, reason: "background" };
}

function todoErrorResponse(res, result, fallbackStatus = 400) {
  sendJson(res, fallbackStatus, { error: result?.error || "Todo operation failed", result });
}

function kanbanErrorResponse(res, result, fallbackStatus = 400) {
  sendJson(res, fallbackStatus, { error: result?.error || "Kanban operation failed", result });
}

function mimeFor(file) {
  return MIME_BY_EXT[path.extname(file).toLowerCase()] || "application/octet-stream";
}

function contentDisposition(disposition, filename) {
  const safeDisposition = disposition === "attachment" ? "attachment" : "inline";
  const safeAscii = String(filename || "file")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_")
    .slice(0, 160) || "file";
  return `${safeDisposition}; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(filename || "file")}`;
}

function loadVapidConfig() {
  const envPublic = process.env.WEB_PUSH_VAPID_PUBLIC_KEY || process.env.HERMES_WEB_VAPID_PUBLIC_KEY || "";
  const envPrivate = process.env.WEB_PUSH_VAPID_PRIVATE_KEY || process.env.HERMES_WEB_VAPID_PRIVATE_KEY || "";
  const envSubject = process.env.WEB_PUSH_SUBJECT || process.env.HERMES_WEB_PUSH_SUBJECT || "";
  if (envPublic && envPrivate) {
    return { publicKey: envPublic, privateKey: envPrivate, subject: envSubject || WEB_PUSH_SUBJECT, source: "env" };
  }
  const runtime = loadRuntimeConfig();
  const vapidPath = effectiveWebPushVapidPath(runtime);
  const subject = effectiveWebPushSubject(runtime);
  try {
    if (fs.existsSync(vapidPath)) {
      const parsed = JSON.parse(fs.readFileSync(vapidPath, "utf8"));
      if (parsed.publicKey && parsed.privateKey) {
        return {
          publicKey: String(parsed.publicKey),
          privateKey: String(parsed.privateKey),
          subject: String(parsed.subject || subject),
          source: vapidPath,
        };
      }
    }
  } catch (_) {}
  if (!WEB_PUSH_ENABLED) return null;
  const keys = webpush.generateVAPIDKeys();
  const generated = { publicKey: keys.publicKey, privateKey: keys.privateKey, subject };
  try {
    fs.mkdirSync(path.dirname(vapidPath), { recursive: true });
    fs.writeFileSync(vapidPath, JSON.stringify(generated, null, 2), { encoding: "utf8", mode: 0o600 });
  } catch (_) {
    // Keep the generated pair in memory for this process if persistence fails.
  }
  return Object.assign({ source: fs.existsSync(vapidPath) ? vapidPath : "memory" }, generated);
}

function initializeWebPush() {
  if (!WEB_PUSH_ENABLED) return null;
  const config = loadVapidConfig();
  if (!config?.publicKey || !config?.privateKey) return null;
  try {
    webpush.setVapidDetails(config.subject || WEB_PUSH_SUBJECT, config.publicKey, config.privateKey);
    return config;
  } catch (err) {
    console.error(`Hermes Mobile Push disabled: ${err.message || String(err)}`);
    return null;
  }
}

function generateWebPushVapidConfig(options = {}) {
  if (!WEB_PUSH_ENABLED) {
    const err = new Error("Web Push is disabled");
    err.status = 409;
    throw err;
  }
  if (process.env.WEB_PUSH_VAPID_PUBLIC_KEY || process.env.HERMES_WEB_VAPID_PUBLIC_KEY || process.env.WEB_PUSH_VAPID_PRIVATE_KEY || process.env.HERMES_WEB_VAPID_PRIVATE_KEY) {
    const err = new Error("Web Push VAPID keys are configured by environment variables");
    err.status = 409;
    throw err;
  }
  const runtime = loadRuntimeConfig();
  const vapidPath = effectiveWebPushVapidPath(runtime);
  if (fs.existsSync(vapidPath) && !options.overwrite) {
    const err = new Error("VAPID key file already exists");
    err.status = 409;
    throw err;
  }
  const keys = webpush.generateVAPIDKeys();
  const generated = {
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
    subject: effectiveWebPushSubject(runtime),
  };
  fs.mkdirSync(path.dirname(vapidPath), { recursive: true });
  fs.writeFileSync(vapidPath, JSON.stringify(generated, null, 2), { encoding: "utf8", mode: 0o600 });
  webPushConfig = initializeWebPush();
  return {
    source: vapidPath,
    publicKey: generated.publicKey,
    subject: generated.subject,
  };
}

function xmlDecode(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function findZipEntry(buffer, entryName) {
  const minEocdOffset = Math.max(0, buffer.length - 0xffff - 22);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= minEocdOffset; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Invalid ZIP file");
  const centralDirectorySize = buffer.readUInt32LE(eocd + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocd + 16);
  let offset = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;
  while (offset + 46 <= end && offset + 46 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameBuffer = buffer.subarray(offset + 46, offset + 46 + fileNameLength);
    const name = nameBuffer.toString(flags & 0x0800 ? "utf8" : "latin1");
    if (name === entryName) {
      const local = localHeaderOffset;
      if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error("Invalid ZIP local header");
      const localNameLength = buffer.readUInt16LE(local + 26);
      const localExtraLength = buffer.readUInt16LE(local + 28);
      const dataStart = local + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return compressed;
      if (method === 8) return zlib.inflateRawSync(compressed);
      throw new Error(`Unsupported ZIP compression method: ${method}`);
    }
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return null;
}

function extractDocxText(filePath) {
  const buffer = fs.readFileSync(filePath);
  const xmlBuffer = findZipEntry(buffer, "word/document.xml");
  if (!xmlBuffer) throw new Error("DOCX document body not found");
  const xml = xmlBuffer.toString("utf8");
  const body = xml.match(/<w:body[\s\S]*?<\/w:body>/)?.[0] || xml;
  const paragraphs = [];
  const paragraphPattern = /<w:p\b[\s\S]*?<\/w:p>/g;
  let paragraphMatch;
  while ((paragraphMatch = paragraphPattern.exec(body))) {
    const paragraph = paragraphMatch[0];
    let text = "";
    const tokenPattern = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>|<w:cr\b[^>]*\/>/g;
    let tokenMatch;
    while ((tokenMatch = tokenPattern.exec(paragraph))) {
      const token = tokenMatch[0];
      if (token.startsWith("<w:t")) text += xmlDecode(tokenMatch[1] || "");
      else if (token.startsWith("<w:tab")) text += "\t";
      else text += "\n";
    }
    text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (text) paragraphs.push(text);
  }
  const fullText = paragraphs.join("\n\n").trim();
  const truncated = fullText.length > MAX_FILE_PREVIEW_CHARS;
  return {
    text: truncated ? fullText.slice(0, MAX_FILE_PREVIEW_CHARS) : fullText,
    totalChars: fullText.length,
    truncated,
  };
}

function textFilePreview(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const truncated = raw.length > MAX_FILE_PREVIEW_CHARS;
  return {
    text: truncated ? raw.slice(0, MAX_FILE_PREVIEW_CHARS) : raw,
    totalChars: raw.length,
    truncated,
  };
}

function serveStatic(req, res) {
  const url = getUrl(req);
  const pathname = url.pathname === "/hermes-mobile" ? "/hermes-mobile/" : url.pathname;
  const rel = decodeURIComponent((pathname === "/" || pathname === "/hermes-mobile/") ? "/index.html" : pathname);
  const target = path.normalize(path.join(PUBLIC_ROOT, rel));
  if (!target.startsWith(PUBLIC_ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(target, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": mimeFor(target),
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
}

function readJsonFirst(paths, fallback = {}) {
  for (const candidate of paths) {
    const p = String(candidate || "").trim();
    if (!p) continue;
    try {
      bootTrace(`readJsonFirst candidate ${isUncPath(p) ? "unc" : "local"} ${path.basename(p) || "root"}`);
      if (!fs.existsSync(p)) continue;
      bootTrace(`readJsonFirst exists ${path.basename(p) || "root"}`);
      const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
      bootTrace(`readJsonFirst parsed ${path.basename(p) || "root"}`);
      return { data: parsed, path: p };
    } catch (_) {
      // Try the next candidate. Recovery copies can be stale or damaged.
    }
  }
  return { data: fallback, path: "" };
}

function sharedDirectoryLabel(rawPath) {
  return sharedDirectoryProvider.label(rawPath);
}

function normalizeSharePermission(value) {
  return sharedDirectoryProvider.normalizePermission(value);
}

function normalizeShareTargets(value) {
  return sharedDirectoryProvider.normalizeTargets(value);
}

function normalizeShareScope(value, targets) {
  return sharedDirectoryProvider.normalizeScope(value, targets);
}

function normalizeSharedDirectoryRecord(item) {
  return sharedDirectoryProvider.normalizeRecord(item);
}

function loadSharedDirectoryRecords() {
  return sharedDirectoryProvider.loadRecords();
}

function saveSharedDirectoryRecords(records) {
  sharedDirectoryProvider.saveRecords(records);
}

function sharedDirectoryRoots(workspaceId = "") {
  return sharedDirectoryProvider.roots(workspaceId, workspaceId);
}

function sharedDirectoryId(record) {
  return sharedDirectoryProvider.id(record);
}

function sharedDirectoryPermissionLabel(record) {
  return sharedDirectoryProvider.permissionLabel(record);
}

function sharedDirectoryCreator(record, workspaces = null) {
  return sharedDirectoryProvider.creator(record, workspaces);
}

function shareAppliesToWorkspace(record, workspaceId) {
  return sharedDirectoryProvider.appliesToWorkspace(record, workspaceId);
}

function canManageSharedDirectory(record, workspaceId) {
  return sharedDirectoryProvider.canManage(record, workspaceId);
}

function publicSharedDirectory(record, workspaceId = "owner") {
  return sharedDirectoryProvider.publicRecord(record, workspaceId);
}

function removeSharedDirectoryRecord(identifier, workspaceId = "owner") {
  return sharedDirectoryProvider.removeRecord(identifier, workspaceId);
}

function aclSharedDirectoryRecords() {
  return sharedDirectoryProvider.aclRecords();
}

function sharedDirectoriesForWorkspace(workspaceId = "owner") {
  return sharedDirectoryProvider.directoriesForWorkspace(workspaceId);
}

function removeAclSharedDirectoryRecord(identifier, workspaceId = "owner") {
  return sharedDirectoryProvider.removeAcl(identifier, workspaceId);
}

function updateSharedDirectoryAccess(identifier, workspaceId = "owner", updates = {}) {
  return sharedDirectoryProvider.updateAccess(identifier, workspaceId, updates);
}

function upsertSharedDirectory(record) {
  securityBoundaryProvider.assertRootNotProtected(record?.path || record?.root || "", "Shared directory is blocked by the Hermes Mobile security boundary");
  return sharedDirectoryProvider.upsert(record);
}

function sanitizePolicy(policy, hardeningOptions = {}) {
  return securityBoundaryProvider.hardenAccessPolicy(accessPolicyProvider.sanitize(policy), hardeningOptions);
}

function dedupe(values) {
  return [...new Set((values || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function getWorkspaceProjectProvider() {
  if (!workspaceProjectProvider) {
    workspaceProjectProvider = createWorkspaceProjectProvider({
      readJsonFirst,
      usersPaths: WORKSPACE_USERS_PATHS,
      routeMapPaths: WORKSPACE_ROUTE_MAP_PATHS,
      projectMapPaths: PROJECT_MAP_PATHS,
      repoRoot: REPO_ROOT,
      defaultOwnerWorkspace: () => OWNER_DEFAULT_WORKSPACE,
      ownerLabel: () => OWNER_LABEL,
      normalizeStringList,
      buildAccessPolicy,
      projectsForWorkspace,
      localWorkspaces: localWorkspaceRecords,
      ownerAliases: () => process.env.HERMES_WEB_OWNER_ALIASES || "owner",
      fallbackOwnerPolicy: () => sanitizePolicy({
        principal_id: "owner",
        principal_label: OWNER_LABEL,
        access_mode: "unrestricted",
        default_workspace: OWNER_DEFAULT_WORKSPACE,
        source_platform: "web",
        reason: "hermes_web_fallback_owner",
      }),
    });
  }
  return workspaceProjectProvider;
}

function invalidateCatalogCache() {
  if (workspaceProjectProvider) workspaceProjectProvider.invalidate();
}

function loadCatalog() {
  bootTrace("loadCatalog enter");
  const catalog = getWorkspaceProjectProvider().loadCatalog();
  bootTrace(`loadCatalog done workspaces=${catalog.workspaces.length} projects=${catalog.projects.length}`);
  return catalog;
}

function mergeDefaultExternalAccessPolicy(policy) {
  const source = policy && typeof policy === "object" ? policy : {};
  const additions = workspaceBindingsProvider.accessPolicyAdditions(source);
  return Object.assign({}, source, {
    allowed_toolsets: dedupe([
      ...(source.allowed_toolsets || []),
      ...(additions.allowed_toolsets || []),
    ]),
    connector_profiles: Object.assign(
      {},
      source.connector_profiles || {},
      additions.connector_profiles || {},
    ),
  });
}

function mergeAccessPolicyOverride(basePolicy, overridePolicy) {
  const base = basePolicy && typeof basePolicy === "object" ? basePolicy : {};
  const override = overridePolicy && typeof overridePolicy === "object" ? overridePolicy : {};
  const merged = Object.assign({}, base, override);
  merged.allowed_toolsets = dedupe([
    ...(base.allowed_toolsets || []),
    ...(override.allowed_toolsets || []),
  ]);
  merged.connector_profiles = Object.assign(
    {},
    base.connector_profiles || {},
    override.connector_profiles || {},
  );
  return merged;
}

function buildAccessPolicy(route, user, project, hardeningOptions = {}) {
  const policy = mergeDefaultExternalAccessPolicy(accessPolicyProvider.build(route, user, project));
  return securityBoundaryProvider.hardenAccessPolicy(policy, hardeningOptions);
}

function sharedDirectoryProjectsForWorkspace(workspaceId, workspaces = null) {
  return sharedDirectoryProvider.projectsForWorkspace(workspaceId, workspaces);
}

function projectsForWorkspace(workspace, projectEntries, workspaces = null) {
  return projectDiscoveryProvider.projectsForWorkspace(workspace, projectEntries, workspaces);
}

function cachedDynamicProjectsForWorkspace(workspaceId) {
  const cached = dynamicProjectCache.get(String(workspaceId || ""));
  if (!cached || Date.now() > cached.expiresAt) {
    dynamicProjectCache.delete(String(workspaceId || ""));
    return [];
  }
  return cached.projects || [];
}

function setDynamicProjectsForWorkspace(workspaceId, projects) {
  dynamicProjectCache.set(String(workspaceId || ""), {
    expiresAt: Date.now() + 30_000,
    projects: dedupeProjects(projects || []),
  });
}

function allProjectsForWorkspaceSync(workspaceId) {
  return dedupeProjects([
    ...loadCatalog().projects.filter((item) => item.workspaceId === workspaceId),
    ...cachedDynamicProjectsForWorkspace(workspaceId),
  ]);
}

async function publicProjectsForWorkspace(workspaceId) {
  const catalog = loadCatalog();
  const workspace = catalog.workspaces.find((item) => item.id === workspaceId);
  const base = catalog.projects.filter((item) => item.workspaceId === workspaceId);
  if (!workspace || workspace.id === "owner" || workspace.policy?.access_mode === "unrestricted") return base;
  const root = String(workspace.defaultWorkspace || workspace.policy?.default_workspace || "").trim();
  if (!root.startsWith("/volume1/")) return base;
  let dynamic = cachedDynamicProjectsForWorkspace(workspaceId);
  if (!dynamic.length) {
    dynamic = await remoteWorkspaceDirectoryProjects(workspace);
    setDynamicProjectsForWorkspace(workspaceId, dynamic);
  }
  return dedupeProjects([...dynamic, ...base]);
}

function isShareableRootProject(project) {
  return projectDiscoveryProvider.isShareableRootProject(project);
}

async function shareableRootProjectForPath(workspaceId, displayPath) {
  const key = comparablePath(displayPath);
  if (!key) return null;
  const projects = await publicProjectsForWorkspace(workspaceId);
  return projects.find((project) => isShareableRootProject(project) && comparablePath(project.root) === key) || null;
}

async function remoteWorkspaceDirectoryProjects(workspace) {
  return projectDiscoveryProvider.remoteWorkspaceDirectoryProjects(workspace);
}

function dedupeProjects(projects) {
  return projectDiscoveryProvider.dedupeProjects(projects);
}

function hashId(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex").slice(0, 10);
}

function findWorkspace(id) {
  return loadCatalog().workspaces.find((item) => item.id === id) || null;
}

function findProject(workspaceId, projectId) {
  return allProjectsForWorkspaceSync(workspaceId).find((item) => item.workspaceId === workspaceId && item.id === projectId) || null;
}

function findSubproject(project, subprojectId) {
  if (!project || !subprojectId) return null;
  return (project.children || []).find((item) => item.id === subprojectId) || null;
}

function effectiveProjectForThread(thread) {
  const project = findProject(thread.workspaceId, thread.projectId);
  const subproject = findSubproject(project, thread.subprojectId);
  if (!subproject) return project;
  return Object.assign({}, subproject, {
    workspaceId: project.workspaceId,
    parentProjectId: project.id,
    parentLabel: project.label,
  });
}

function policyForThread(thread) {
  const workspace = findWorkspace(thread.workspaceId);
  const project = effectiveProjectForThread(thread);
  return buildAccessPolicy(workspace?.policy || workspace || {}, {}, project);
}

function sharedProjectOwnerLabel(project) {
  return displayPathProvider.sharedProjectOwnerLabel(project);
}

function ownerDriveRootIndex(parts) {
  return displayPathProvider.ownerDriveRootIndex(parts);
}

function sharedProjectRootOwnerLabel(project) {
  return displayPathProvider.sharedProjectRootOwnerLabel(project);
}

function sharedProjectDisplayLabel(project) {
  return displayPathProvider.sharedProjectDisplayLabel(project);
}

function directoryRouteDisplayLabel(project, child = null) {
  return displayPathProvider.directoryRouteDisplayLabel(project, child);
}

function directoryRouteCandidatesForWorkspace(workspaceId) {
  const candidates = [];
  for (const project of allProjectsForWorkspaceSync(workspaceId).filter((item) => !item.hidden)) {
    if (project.source === "workspace-default") continue;
    if (project.root) {
      candidates.push({
        root: project.root,
        label: directoryRouteDisplayLabel(project),
      });
    }
    for (const child of project.children || []) {
      if (!child.root) continue;
      candidates.push({
        root: child.root,
        label: directoryRouteDisplayLabel(project, child),
      });
    }
  }
  return candidates.sort((a, b) => comparablePath(b.root).length - comparablePath(a.root).length);
}

function relativeDisplayTail(rawPath, rootPath) {
  const rawLocal = normalizeLocalPath(rawPath);
  const rootLocal = normalizeLocalPath(rootPath);
  if (rawLocal && rootLocal) {
    const relative = path.relative(rootLocal, rawLocal);
    if (relative && relative !== "." && !relative.startsWith("..") && !path.isAbsolute(relative)) {
      return relative.split(/[\\/]+/g).filter(Boolean).join(" / ");
    }
  }
  const raw = String(rawPath || "").replaceAll("\\", "/");
  const root = String(rootPath || "").replaceAll("\\", "/").replace(/\/+$/g, "");
  if (raw && root && raw.toLowerCase().startsWith(`${root.toLowerCase()}/`)) {
    return raw.slice(root.length + 1).split("/").filter(Boolean).join(" / ");
  }
  return "";
}

function logicalUserPathFallback(rawPath, fallbackLabel = "") {
  return displayPathProvider.logicalUserPathFallback(rawPath, fallbackLabel);
}

function logicalDirectoryDisplayPath(thread, rawPath, fallbackLabel = "") {
  const value = String(rawPath || "").trim();
  if (!value) return fallbackLabel || "";
  for (const candidate of directoryRouteCandidatesForWorkspace(thread.workspaceId)) {
    if (
      !pathInsideAnyRoot(value, [candidate.root])
      && !pathInsideAnyRoot(normalizeLocalPath(value), [normalizeLocalPath(candidate.root)])
    ) {
      continue;
    }
    const tail = relativeDisplayTail(value, candidate.root);
    return [candidate.label, tail].filter(Boolean).join(" / ");
  }
  const workspace = findWorkspace(thread.workspaceId);
  const workspaceRoot = workspace?.defaultWorkspace || workspace?.policy?.default_workspace || "";
  if (
    workspaceRoot
    && (
      pathInsideAnyRoot(value, [workspaceRoot])
      || pathInsideAnyRoot(normalizeLocalPath(value), [normalizeLocalPath(workspaceRoot)])
    )
  ) {
    const tail = relativeDisplayTail(value, workspaceRoot);
    return tail || fallbackLabel || workspace.label || "目录";
  }
  return logicalUserPathFallback(value, fallbackLabel);
}

function isGroupChatThread(thread) {
  return Boolean(normalizeChatGroup(thread?.chatGroup || {}, thread?.workspaceId || "owner").enabled);
}

function isKanbanCaseTopicThread(thread) {
  const group = normalizeChatGroup(thread?.chatGroup || {}, thread?.workspaceId || "owner");
  return Boolean(thread?.singleWindow && group.enabled && group.kind === KANBAN_CASE_TOPIC_KIND);
}

function isExternalIngressThread(thread) {
  return Boolean(thread?.externalIngress?.source);
}

function isWeixinSingleWindowThread(thread) {
  return Boolean(thread?.singleWindow && thread?.externalIngress?.source === "weixin");
}

function publicExternalIngress(thread) {
  const ingress = normalizeExternalIngress(thread?.externalIngress || null);
  if (!ingress) return null;
  return {
    source: ingress.source,
    type: ingress.source,
    workspaceId: ingress.workspaceId || thread.workspaceId || "",
    senderLabel: ingress.senderLabel || "",
    status: ingress.status || "",
    updatedAt: ingress.updatedAt || "",
  };
}

function latestMessageTimestamp(messages) {
  return (messages || []).reduce((latest, message) => {
    const value = message?.completedAt || message?.failedAt || message?.cancelledAt || message?.updatedAt || message?.createdAt || "";
    return String(value) > String(latest || "") ? value : latest;
  }, "");
}

function messageChronologyRank(message) {
  if (message?.role === "user") return 0;
  if (message?.role === "assistant") return 1;
  return 2;
}

function sortMessagesChronologically(messages) {
  return [...(messages || [])].sort((a, b) => (
    String(a?.createdAt || "").localeCompare(String(b?.createdAt || ""))
    || messageChronologyRank(a) - messageChronologyRank(b)
    || String(a?.submittedAt || a?.queuedAt || "").localeCompare(String(b?.submittedAt || b?.queuedAt || ""))
    || String(a?.id || "").localeCompare(String(b?.id || ""))
  ));
}

function createSingleWindowThread(workspaceId, overrides = {}) {
  const now = nowIso();
  return normalizeThread(Object.assign({
    id: makeId("thread"),
    title: SINGLE_WINDOW_THREAD_TITLE,
    workspaceId,
    projectId: SINGLE_WINDOW_PROJECT_ID,
    subprojectId: "",
    singleWindow: true,
    hermesSessionId: `web_single_${makeId("session")}`,
    status: "idle",
    createdAt: now,
    updatedAt: now,
    messages: [],
    events: [],
  }, overrides));
}

function weixinThreadSeed(workspaceId, source = {}) {
  const now = nowIso();
  let threadKey = String(source.threadKey || source.thread_key || "").trim();
  if (!threadKey && (source.accountId || source.account_id || source.chatId || source.chat_id || source.userId || source.user_id)) {
    try {
      threadKey = weixinIngressProvider.threadKey(source);
    } catch (_) {
      threadKey = "";
    }
  }
  return normalizeExternalIngress({
    source: "weixin",
    threadKey,
    eventId: source.eventId || source.event_id || "",
    accountId: source.accountId || source.account_id || "",
    chatId: source.chatId || source.chat_id || "",
    userId: source.userId || source.user_id || "",
    principalId: source.principalId || source.principal_id || "",
    workspaceId,
    senderLabel: source.senderLabel || source.sender_label || "",
    status: source.status || "window",
    createdAt: source.createdAt || source.created_at || now,
    updatedAt: source.updatedAt || source.updated_at || now,
  });
}

function findWeixinSingleWindowThreadForWorkspace(workspaceId) {
  const id = String(workspaceId || "").trim();
  if (!id) return null;
  return (state.threads || [])
    .filter((thread) => (
      thread?.workspaceId === id
      && isWeixinSingleWindowThread(thread)
      && !isGroupChatThread(thread)
    ))
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0] || null;
}

function createWeixinSingleWindowThread(workspaceId, seed = {}) {
  return createSingleWindowThread(workspaceId, {
    title: "Weixin",
    hermesSessionId: `web_weixin_${makeId("session")}`,
    externalIngress: weixinThreadSeed(workspaceId, seed),
  });
}

function messageBelongsToWeixinWindow(message) {
  return Boolean(
    message?.externalIngress?.source === "weixin"
    || message?.externalDelivery?.source === "weixin"
    || message?.runOptions?.gatewayRouting?.source === "weixin"
  );
}

function updateThreadChronology(thread) {
  const latest = latestMessageTimestamp(thread.messages);
  if (latest) thread.updatedAt = latest;
  const earliest = (thread.messages || [])
    .map((message) => message.createdAt || "")
    .filter(Boolean)
    .sort()[0];
  if (earliest && String(earliest) < String(thread.createdAt || "")) {
    thread.createdAt = earliest;
  }
}

function migrateWeixinMessagesToDedicatedThread(workspaceId, targetThread = null) {
  const id = String(workspaceId || "").trim();
  if (!id) return null;
  let target = targetThread || findWeixinSingleWindowThreadForWorkspace(id);
  let changed = false;
  for (const sourceThread of state.threads || []) {
    if (
      !sourceThread?.singleWindow
      || sourceThread.workspaceId !== id
      || isGroupChatThread(sourceThread)
      || isWeixinSingleWindowThread(sourceThread)
    ) {
      continue;
    }
    const hasActiveRun = (sourceThread.activeRunIds || []).length
      || (sourceThread.messages || []).some((message) => ["queued", "running"].includes(message?.status));
    if (hasActiveRun) continue;
    const moveMessages = (sourceThread.messages || []).filter(messageBelongsToWeixinWindow);
    if (!moveMessages.length) continue;
    if (!target) {
      target = createWeixinSingleWindowThread(id, moveMessages[0]?.externalIngress || moveMessages[0]?.externalDelivery || {});
      state.threads.unshift(target);
    }
    const moveIds = new Set(moveMessages.map((message) => String(message?.id || "")).filter(Boolean));
    const existingIds = new Set((target.messages || []).map((message) => String(message?.id || "")));
    const movedMessages = [];
    const keptMessages = [];
    for (const message of sourceThread.messages || []) {
      const messageId = String(message?.id || "");
      if (!moveIds.has(messageId)) {
        keptMessages.push(message);
        continue;
      }
      if (messageId && existingIds.has(messageId)) continue;
      const moved = Object.assign({}, message, {
        taskGroupId: SINGLE_WINDOW_CHAT_TASK_GROUP_ID,
        singleWindowMode: "chat",
      });
      if (moved.externalDelivery) {
        moved.externalDelivery = normalizeExternalDelivery(Object.assign({}, moved.externalDelivery, {
          threadId: target.id,
          taskGroupId: SINGLE_WINDOW_CHAT_TASK_GROUP_ID,
          updatedAt: moved.externalDelivery.updatedAt || moved.updatedAt || nowIso(),
        }));
      }
      movedMessages.push(moved);
      if (messageId) existingIds.add(messageId);
    }
    target.messages = sortMessagesChronologically([...(target.messages || []), ...movedMessages]);
    updateThreadChronology(target);
    sourceThread.messages = keptMessages;
    updateThreadChronology(sourceThread);
    for (const artifact of state.artifacts || []) {
      if (moveIds.has(String(artifact.messageId || ""))) artifact.threadId = target.id;
    }
    changed = true;
  }
  if (changed) {
    saveState(state, { reason: "weixin-single-window-split", forceBackup: true });
  }
  return target;
}

function ensureWeixinSingleWindowThread(workspaceId, seed = {}) {
  const workspace = findWorkspace(workspaceId);
  const project = findProject(workspaceId, SINGLE_WINDOW_PROJECT_ID);
  if (!workspace || !project) return null;
  let thread = findWeixinSingleWindowThreadForWorkspace(workspaceId);
  let changed = false;
  if (!thread) {
    thread = createWeixinSingleWindowThread(workspaceId, seed);
    state.threads.unshift(thread);
    changed = true;
  }
  const nextIngress = weixinThreadSeed(workspaceId, Object.assign({}, thread.externalIngress || {}, seed || {}, {
    createdAt: thread.externalIngress?.createdAt || thread.createdAt,
    updatedAt: nowIso(),
  }));
  if (JSON.stringify(nextIngress) !== JSON.stringify(thread.externalIngress || null)) {
    thread.externalIngress = nextIngress;
    changed = true;
  }
  const migrated = migrateWeixinMessagesToDedicatedThread(workspaceId, thread);
  if (migrated && migrated.id === thread.id) thread = migrated;
  if (changed) saveState();
  return thread;
}

function taskGroupHasActiveRun(group) {
  return (group?.messages || []).some((message) => (
    message?.status === "queued"
    || message?.status === "running"
  ));
}

function migratePrivateSingleWindowGroups(workspaceId) {
  const id = String(workspaceId || "").trim();
  if (!id) return null;
  let privateThread = (state.threads || []).find((thread) => (
    thread.workspaceId === id
    && thread.singleWindow
    && !isGroupChatThread(thread)
    && !isExternalIngressThread(thread)
  )) || null;
  const groupThreads = (state.threads || []).filter((thread) => (
    thread?.singleWindow
    && isGroupChatThread(thread)
    && !isKanbanCaseTopicThread(thread)
    && (thread.workspaceId === id || chatGroupMemberWorkspaceIds(thread).includes(id))
  ));
  const externalIngressThreads = (state.threads || []).filter((thread) => (
    thread?.singleWindow
    && thread.workspaceId === id
    && !isGroupChatThread(thread)
    && isExternalIngressThread(thread)
    && !isWeixinSingleWindowThread(thread)
  ));
  let changed = false;
  for (const groupThread of groupThreads) {
    const moveMessageIds = new Set();
    const moveArtifactIds = new Set();
    const moveTaskGroupMeta = {};
    for (const group of taskGroupsForThread(groupThread)) {
      if (group.id === SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID) continue;
      if (taskGroupOwnerWorkspaceId(group, groupThread.workspaceId) !== id) continue;
      if (taskGroupHasActiveRun(group)) continue;
      const meta = normalizeTaskGroupMeta(groupThread.taskGroupMeta)[group.id];
      if (meta) moveTaskGroupMeta[group.id] = meta;
      for (const message of group.messages || []) {
        moveMessageIds.add(String(message.id || ""));
        for (const artifact of Array.isArray(message.artifacts) ? message.artifacts : []) {
          if (artifact?.id) moveArtifactIds.add(String(artifact.id));
        }
      }
    }
    if (!moveMessageIds.size) continue;
    if (!privateThread) {
      privateThread = createSingleWindowThread(id);
      state.threads.unshift(privateThread);
    }
    const existingMessageIds = new Set((privateThread.messages || []).map((message) => String(message.id || "")));
    const movedMessages = [];
    const keptMessages = [];
    for (const message of groupThread.messages || []) {
      const messageId = String(message.id || "");
      if (moveMessageIds.has(messageId)) {
        if (!existingMessageIds.has(messageId)) {
          movedMessages.push(message);
          existingMessageIds.add(messageId);
        }
      } else {
        keptMessages.push(message);
      }
    }
    privateThread.messages = sortMessagesChronologically([...(privateThread.messages || []), ...movedMessages]);
    privateThread.taskGroupMeta = Object.assign(
      {},
      normalizeTaskGroupMeta(privateThread.taskGroupMeta),
      moveTaskGroupMeta,
    );
    const privateLatest = latestMessageTimestamp(privateThread.messages);
    if (privateLatest) privateThread.updatedAt = privateLatest;
    const privateEarliest = (privateThread.messages || [])
      .map((message) => message.createdAt || "")
      .filter(Boolean)
      .sort()[0];
    if (privateEarliest && String(privateEarliest) < String(privateThread.createdAt || "")) {
      privateThread.createdAt = privateEarliest;
    }
    groupThread.messages = keptMessages;
    const groupMeta = normalizeTaskGroupMeta(groupThread.taskGroupMeta);
    for (const key of Object.keys(moveTaskGroupMeta)) delete groupMeta[key];
    groupThread.taskGroupMeta = groupMeta;
    groupThread.updatedAt = latestMessageTimestamp(groupThread.messages) || nowIso();
    for (const artifact of state.artifacts || []) {
      if (moveMessageIds.has(String(artifact.messageId || "")) || moveArtifactIds.has(String(artifact.id || ""))) {
        artifact.threadId = privateThread.id;
      }
    }
    changed = true;
  }
  for (const externalThread of externalIngressThreads) {
    const hasActiveRun = (externalThread.activeRunIds || []).length
      || (externalThread.messages || []).some((message) => ["queued", "running"].includes(message?.status));
    if (hasActiveRun) continue;
    const sourceMessages = externalThread.messages || [];
    if (!sourceMessages.length) {
      state.threads = (state.threads || []).filter((thread) => thread.id !== externalThread.id);
      changed = true;
      continue;
    }
    if (!privateThread) {
      privateThread = createSingleWindowThread(id);
      state.threads.unshift(privateThread);
    }
    const existingMessageIds = new Set((privateThread.messages || []).map((message) => String(message.id || "")));
    const movedMessages = [];
    const movedMessageIds = new Set();
    for (const message of sourceMessages) {
      const messageId = String(message?.id || "");
      if (messageId && existingMessageIds.has(messageId)) continue;
      const moved = Object.assign({}, message, {
        taskGroupId: SINGLE_WINDOW_CHAT_TASK_GROUP_ID,
        singleWindowMode: "chat",
      });
      if (moved.externalDelivery) {
        moved.externalDelivery = normalizeExternalDelivery(Object.assign({}, moved.externalDelivery, {
          threadId: privateThread.id,
          taskGroupId: SINGLE_WINDOW_CHAT_TASK_GROUP_ID,
          updatedAt: moved.externalDelivery.updatedAt || moved.updatedAt || nowIso(),
        }));
      }
      movedMessages.push(moved);
      if (messageId) {
        existingMessageIds.add(messageId);
        movedMessageIds.add(messageId);
      }
    }
    if (movedMessages.length) {
      privateThread.messages = sortMessagesChronologically([...(privateThread.messages || []), ...movedMessages]);
      const privateLatest = latestMessageTimestamp(privateThread.messages);
      if (privateLatest) privateThread.updatedAt = privateLatest;
      const privateEarliest = (privateThread.messages || [])
        .map((message) => message.createdAt || "")
        .filter(Boolean)
        .sort()[0];
      if (privateEarliest && String(privateEarliest) < String(privateThread.createdAt || "")) {
        privateThread.createdAt = privateEarliest;
      }
      for (const artifact of state.artifacts || []) {
        if (movedMessageIds.has(String(artifact.messageId || ""))) artifact.threadId = privateThread.id;
      }
    }
    state.threads = (state.threads || []).filter((thread) => thread.id !== externalThread.id);
    changed = true;
  }
  if (changed) {
    saveState(state, { reason: "single-window-private-split", forceBackup: true });
  }
  return privateThread;
}

function ensureSingleWindowThread(workspaceId, options = {}) {
  const workspace = findWorkspace(workspaceId);
  const project = findProject(workspaceId, SINGLE_WINDOW_PROJECT_ID);
  if (!workspace || !project) return null;
  const allowGroupThread = Boolean(options.allowGroupThread);
  if (!allowGroupThread) {
    migrateWeixinMessagesToDedicatedThread(workspaceId);
    const migrated = migratePrivateSingleWindowGroups(workspaceId);
    if (migrated) return migrated;
  }
  let thread = state.threads.find((item) => (
    item.workspaceId === workspaceId
    && item.singleWindow
    && (allowGroupThread || !isGroupChatThread(item))
    && (allowGroupThread || !isExternalIngressThread(item))
  ));
  if (thread) return thread;
  thread = createSingleWindowThread(workspaceId);
  state.threads.unshift(thread);
  saveState();
  return thread;
}

function findGroupChatThreadForWorkspace(workspaceId) {
  const id = String(workspaceId || "").trim();
  if (!id) return null;
  return (state.threads || [])
    .filter((thread) => thread?.singleWindow && !isKanbanCaseTopicThread(thread) && chatGroupMemberWorkspaceIds(thread).includes(id))
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0] || null;
}

function kanbanCaseTopicThreadsForWorkspace(auth, workspaceId) {
  const id = String(workspaceId || "").trim();
  if (!id) return [];
  return (state.threads || [])
    .filter((thread) => isKanbanCaseTopicThread(thread))
    .filter((thread) => chatGroupMemberWorkspaceIds(thread).includes(id))
    .filter((thread) => threadAccessibleToAuth(auth, thread))
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

function workspaceLabel(workspaceId) {
  const workspace = findWorkspace(String(workspaceId || ""));
  return workspace?.label || workspace?.id || String(workspaceId || "");
}

function senderInfoForWorkspace(workspaceId) {
  const id = String(workspaceId || "owner").trim() || "owner";
  return {
    senderWorkspaceId: id,
    senderPrincipalId: workspacePrincipal(id),
    senderLabel: workspaceLabel(id),
  };
}

function publicChatGroup(thread) {
  const group = normalizeChatGroup(thread?.chatGroup || {}, thread?.workspaceId || "owner");
  return {
    enabled: group.enabled,
    kind: group.kind || "",
    topicKey: group.topicKey || "",
    memberWorkspaceIds: group.memberWorkspaceIds,
    members: group.memberWorkspaceIds.map((workspaceId) => ({
      workspaceId,
      label: workspaceLabel(workspaceId),
    })),
    createdAt: group.createdAt || "",
    updatedAt: group.updatedAt || "",
  };
}

function ownerExternalInterfaceBindings() {
  return externalIntegrationProvider.ownerInterfaceBindings();
}

function ownerExternalAccessPolicy() {
  return externalIntegrationProvider.ownerAccessPolicy();
}

function publicWorkspaceAccessKeyStatus(workspace) {
  return authProvider.publicWorkspaceAccessKeyStatus(workspace);
}

function publicWorkspaceBindings(workspace) {
  return workspaceBindingsProvider.publicBindings(workspace);
}

function publicWorkspace(workspace) {
  const policy = workspace.policy || {};
  const isLocalWorkspace = workspace.source === "local-workspace";
  const workDirectories = dedupe([
    workspace.defaultWorkspace,
    policy.default_workspace,
    policy.sync_root,
    policy.download_root,
    ...(Array.isArray(policy.allowed_roots) ? policy.allowed_roots : []),
    ...(Array.isArray(policy.delivery_roots) ? policy.delivery_roots : []),
  ].filter(Boolean))
    .filter((item) => !securityBoundaryProvider.rootConflictsWithProtected(item))
    .map((item) => ({ path: item }));
  return {
    id: workspace.id,
    label: workspace.label,
    role: workspace.role,
    source: workspace.source || "",
    accessMode: workspace.accessMode,
    defaultWorkspace: workspace.defaultWorkspace,
    accessKey: String(policy.principal_id || workspace.id || ""),
    principalId: String(policy.principal_id || workspace.id || ""),
    accountId: workspace.accountId || policy.source_chat_id_alt || "",
    userId: workspace.userId || policy.source_user_id || "",
    chatId: workspace.chatId || policy.source_chat_id || "",
    target: workspace.target || "",
    contextTokenAvailable: workspace.contextTokenAvailable,
    outboundStatus: workspace.outboundStatus || "",
    workDirectories,
    accessKeyStatus: publicWorkspaceAccessKeyStatus(workspace),
    bindings: publicWorkspaceBindings(workspace),
    aliases: workspace.aliases || [],
    sessionMode: workspace.sessionMode || "",
    responseStyle: workspace.responseStyle || "",
    showTaskId: workspace.showTaskId,
    maxParallelTasks: workspace.maxParallelTasks || 0,
    localConfig: isLocalWorkspace ? {
      defaultWorkspace: String(workspace.defaultWorkspace || policy.default_workspace || ""),
      allowedRoots: Array.isArray(policy.allowed_roots) ? securityBoundaryProvider.filterRoots(policy.allowed_roots) : [],
      allowedToolsets: Array.isArray(policy.allowed_toolsets) ? policy.allowed_toolsets : [],
      connectorProfiles: policy.connector_profiles && typeof policy.connector_profiles === "object" ? policy.connector_profiles : {},
    } : null,
  };
}

function publicAccessKeyStatus(workspace, record = null) {
  return authProvider.publicAccessKeyStatus(workspace, record);
}

function listWorkspaceAccessKeyStatuses(auth, options = {}) {
  return authProvider.listWorkspaceAccessKeyStatuses(auth, options);
}

function rotateWorkspaceAccessKey(workspaceId, options = {}) {
  return authProvider.rotateWorkspaceAccessKey(workspaceId, options);
}

function revokeWorkspaceAccessKey(workspaceId, options = {}) {
  return authProvider.revokeWorkspaceAccessKey(workspaceId, options);
}

function rotateGlobalAccessKey(options = {}) {
  return authProvider.rotateGlobalAccessKey(options);
}

function pathInsideAnyRoot(candidate, roots) {
  const normalized = comparablePath(candidate);
  return (roots || []).some((root) => {
    const r = comparablePath(root);
    return normalized === r || normalized.startsWith(`${r}/`);
  });
}

function pathRelativePartsUnderRoot(candidate, root) {
  const normalized = comparablePath(candidate);
  const r = comparablePath(root);
  if (!normalized || !r || normalized === r || !normalized.startsWith(`${r}/`)) return null;
  return normalized.slice(r.length + 1).split("/").filter(Boolean);
}

function pathDirectChildOfRoot(candidate, root) {
  const parts = pathRelativePartsUnderRoot(candidate, root);
  return Boolean(parts && parts.length === 1);
}

function comparablePath(value) {
  let p = String(value || "").trim().replaceAll("\\", "/");
  p = p.replace(/^\/\/wsl(?:\.localhost|\$)?\/[^/]+/i, "");
  p = p.replace(/^\/mnt\/([a-zA-Z])\//, (_, drive) => `${drive.toLowerCase()}:/`);
  p = p.replace(/^([A-Z]):\//, (_, drive) => `${drive.toLowerCase()}:/`);
  return p.replace(/\/+$/, "").toLowerCase();
}

function searchableText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function projectSearchLabels(project, parentLabel = "") {
  const labels = directoryAliasLabels(project, parentLabel);
  if (project.label) labels.push(project.label);
  if (parentLabel && project.label) labels.push(`${parentLabel}${project.label}`);
  return dedupe(labels.map(String).filter((label) => searchableText(label).length >= 2));
}

function semanticProjectMatches(thread, latestText) {
  const search = searchableText(latestText);
  if (!search) return [];
  const matches = [];
  const projects = loadCatalog().projects.filter((item) => item.workspaceId === thread.workspaceId && !item.hidden);
  for (const project of projects) {
    for (const label of projectSearchLabels(project)) {
      const key = searchableText(label);
      if (key && search.includes(key)) {
        matches.push({
          projectId: project.id || "",
          subprojectId: "",
          label: project.label || label,
          alias: label,
          root: project.root || "",
          score: key.length * 100 + comparablePath(project.root).length,
        });
      }
    }
    for (const child of project.children || []) {
      const parentLabel = project.label || "";
      for (const label of projectSearchLabels(child, parentLabel)) {
        const key = searchableText(label);
        if (key && search.includes(key)) {
          matches.push({
            projectId: project.id || "",
            subprojectId: child.id || "",
            label: parentLabel ? `${parentLabel} / ${child.label || label}` : (child.label || label),
            alias: label,
            root: child.root || "",
            score: key.length * 100 + comparablePath(child.root).length,
          });
        }
      }
    }
  }
  const byRoot = new Map();
  for (const match of matches.filter((item) => item.root)) {
    const key = comparablePath(match.root);
    const prev = byRoot.get(key);
    if (!prev || match.score > prev.score) byRoot.set(key, match);
  }
  return suppressGenericOwnerTopicMatches([...byRoot.values()].sort((a, b) => b.score - a.score)).slice(0, 5);
}

function pathMatchesRoot(candidatePath, rootPath) {
  const candidate = comparablePath(candidatePath);
  const root = comparablePath(rootPath);
  return Boolean(candidate && root && (candidate === root || candidate.startsWith(`${root}/`)));
}

function directoryAttachmentCandidatesForThread(thread) {
  const candidates = [];
  for (const project of allProjectsForWorkspaceSync(thread.workspaceId).filter((item) => !item.hidden)) {
    if (!project.root || project.id === SINGLE_WINDOW_PROJECT_ID || project.source === "workspace-default") continue;
    candidates.push({
      projectId: project.id || "",
      subprojectId: "",
      label: directoryRouteDisplayLabel(project),
      root: project.root || "",
    });
    for (const child of project.children || []) {
      if (!child.root) continue;
      candidates.push({
        projectId: project.id || "",
        subprojectId: child.id || "",
        label: directoryRouteDisplayLabel(project, child),
        root: child.root || "",
      });
    }
  }
  return candidates.sort((a, b) => comparablePath(b.root).length - comparablePath(a.root).length);
}

function normalizeTaskDirectoryAttachment(thread, attachment) {
  if (!attachment?.root && !attachment?.path) return null;
  const root = String(attachment.root || attachment.path || "").trim();
  const requestedPath = String(attachment.path || root).trim();
  const pathValue = requestedPath && pathMatchesRoot(requestedPath, root) ? requestedPath : root;
  if (!isDirectoryBrowserPathAllowedForThread(thread, "", pathValue)) return null;
  const label = String(attachment.label || "").trim() || logicalDirectoryDisplayPath(thread, pathValue, "Directory");
  return {
    projectId: String(attachment.projectId || ""),
    subprojectId: String(attachment.subprojectId || ""),
    label,
    path: pathValue,
    root,
  };
}

function resolveTaskDirectoryAttachment(thread, raw = {}) {
  if (!raw || typeof raw !== "object") return null;
  const projectId = String(raw.projectId || "").trim();
  const subprojectId = String(raw.subprojectId || "").trim();
  const requestedPath = String(raw.path || "").trim();
  const rawRoot = String(raw.root || "").trim();
  const candidates = directoryAttachmentCandidatesForThread(thread);
  let match = null;
  if (projectId) {
    match = candidates.find((item) => item.projectId === projectId && (subprojectId ? item.subprojectId === subprojectId : !item.subprojectId))
      || candidates.find((item) => item.projectId === projectId && (!subprojectId || item.subprojectId === subprojectId));
  }
  if (!match && requestedPath) {
    match = candidates.find((item) => pathMatchesRoot(requestedPath, item.root));
  }
  if (!match && (rawRoot || requestedPath)) {
    return normalizeTaskDirectoryAttachment(thread, {
      projectId,
      subprojectId,
      label: String(raw.label || "").trim(),
      root: rawRoot || requestedPath,
      path: requestedPath || rawRoot,
    });
  }
  if (!match) return null;
  return normalizeTaskDirectoryAttachment(thread, Object.assign({}, match, {
    label: String(raw.label || "").trim() || match.label,
    path: requestedPath || match.root,
  }));
}

function semanticTaskDirectoryAttachment(thread, latestText) {
  if (!thread.singleWindow) return null;
  const matches = semanticProjectMatches(thread, latestText);
  const match = matches.find((item) => !isDeliveryProjectMatch(item)) || matches[0];
  if (!match?.root) return null;
  return normalizeTaskDirectoryAttachment(thread, {
    projectId: match.projectId || "",
    subprojectId: match.subprojectId || "",
    label: match.label || match.alias || "",
    path: match.root,
    root: match.root,
  });
}

function isDeliveryProjectMatch(match) {
  const projectId = String(match?.projectId || "");
  const root = comparablePath(match?.root || "");
  return isGenericOwnerTopicProjectId(projectId) || root.includes("hermes\u540c\u6b65\u6587\u4ef6\u5939");
}

function uniqueTaskDirectoryAttachments(items) {
  const unique = new Map();
  for (const item of items || []) {
    if (!item?.root && !item?.path) continue;
    const key = [
      item.projectId || "",
      item.subprojectId || "",
      comparablePath(item.root || item.path || ""),
    ].join("|");
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}

function messageTaskDirectoryHaystack(message) {
  const parts = [message?.content || ""];
  if (message?.directoryRoute) {
    parts.push(message.directoryRoute.label || "", message.directoryRoute.path || "", message.directoryRoute.root || "");
  }
  for (const alias of Array.isArray(message?.directoryAliases) ? message.directoryAliases : []) {
    parts.push(alias?.label || "", alias?.path || "", alias?.root || "");
  }
  for (const artifact of Array.isArray(message?.artifacts) ? message.artifacts : []) {
    parts.push(artifact?.name || "", artifact?.path || "", artifact?.displayPath || "", artifact?.url || "");
  }
  return parts.join("\n");
}

function taskDirectoryAttachmentCandidatesForMessage(thread, message) {
  const rawCandidates = [];
  if (message?.directoryRoute) rawCandidates.push(message.directoryRoute);
  for (const alias of Array.isArray(message?.directoryAliases) ? message.directoryAliases : []) {
    if (alias) rawCandidates.push(alias);
  }
  const haystack = messageTaskDirectoryHaystack(message);
  for (const candidate of directoryAttachmentCandidatesForThread(thread)) {
    if (textIncludesPath(haystack, candidate.root)) rawCandidates.push(candidate);
  }
  return uniqueTaskDirectoryAttachments(rawCandidates
    .map((raw) => resolveTaskDirectoryAttachment(thread, raw || {}))
    .filter(Boolean));
}

function taskDirectoryAttachmentForGroup(thread, taskGroupId) {
  if (!taskGroupId) return null;
  for (const message of thread.messages || []) {
    if (message.taskGroupId !== taskGroupId) continue;
    const candidates = taskDirectoryAttachmentCandidatesForMessage(thread, message);
    const binding = candidates.find((item) => !isDeliveryProjectMatch(item));
    if (binding) return binding;
  }
  return null;
}

function taskDirectoryAttachmentForMessage(thread, message) {
  const direct = normalizeTaskDirectoryAttachment(thread, message?.directoryRoute || {});
  if (direct) return direct;
  if (thread?.singleWindow && isSingleWindowConversationTaskGroupId(message?.taskGroupId)) return null;
  return taskDirectoryAttachmentForGroup(thread, message?.taskGroupId || "");
}

function isGenericOwnerTopicProjectId(projectId) {
  const value = String(projectId || "");
  return GENERIC_OWNER_TOPIC_PROJECT_IDS.has(value)
    || GENERIC_OWNER_TOPIC_PROJECT_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function isContextAnchorProjectMatch(match) {
  if (!match?.root) return false;
  if (match.subprojectId) return false;
  if (isGenericOwnerTopicProjectId(match.projectId)) return false;
  if (match.projectId === SINGLE_WINDOW_PROJECT_ID) return false;
  return true;
}

function suppressGenericOwnerTopicMatches(matches) {
  const anchors = matches.filter(isContextAnchorProjectMatch);
  if (!anchors.length) return matches;
  return matches.filter((match) => {
    if (!isGenericOwnerTopicProjectId(match.projectId)) return true;
    return anchors.some((anchor) => pathInsideAnyRoot(match.root, [anchor.root]));
  });
}

function semanticProjectRoutingInstructions(thread, latestText) {
  if (!thread.singleWindow) return "";
  const matches = semanticProjectMatches(thread, latestText);
  if (!matches.length) return "";
  return [
    "Semantic project-directory matches from the latest user request:",
    ...matches.map((item) => `- ${item.label} (matched alias: ${item.alias}) => ${item.root}`),
    "Use the most specific matched project root for file search, report generation, and directory aliases.",
    "If a semantic project match exists, do not emit a generic `目录别名：默认目录=...`; emit the matched project alias/path instead.",
  ].join("\n");
}

function projectForTaskDirectoryAttachment(thread, attachment) {
  if (!attachment) return effectiveProjectForThread(thread);
  const project = findProject(thread.workspaceId, attachment.projectId);
  const child = findSubproject(project, attachment.subprojectId);
  const base = child
    ? Object.assign({}, child, { workspaceId: project.workspaceId, parentProjectId: project.id, parentLabel: project.label })
    : (project || {});
  return Object.assign({}, base, {
    id: attachment.subprojectId || attachment.projectId || base.id || "attached-directory",
    label: attachment.label || base.label || "Attached directory",
    root: attachment.path || attachment.root || base.root || "",
  });
}

function formatAccessPolicyInstructionSummary(policy = {}) {
  const lines = [
    "Current run access policy summary (authoritative; supersedes older permission statements in conversation_history):",
  ];
  const principal = String(policy.principal_id || policy.principalId || "").trim();
  const accessMode = String(policy.access_mode || policy.accessMode || "restricted").trim() || "restricted";
  const roots = dedupe([
    policy.default_workspace || policy.defaultWorkspace || "",
    ...(policy.allowed_roots || policy.allowedRoots || []),
  ].filter(Boolean));
  const toolsets = dedupe(policy.allowed_toolsets || policy.allowedToolsets || []);
  const connectorProfiles = policy.connector_profiles && typeof policy.connector_profiles === "object"
    ? Object.keys(policy.connector_profiles).sort()
    : [];
  if (principal) lines.push(`- Principal: ${principal}`);
  lines.push(`- Access mode: ${accessMode}`);
  if (roots.length) lines.push(`- Allowed roots: ${roots.join("; ")}`);
  if (toolsets.length) lines.push(`- Enabled toolsets: ${toolsets.join(", ")}`);
  const callableHints = callableFunctionHintsForToolsets(toolsets);
  if (callableHints.length) {
    lines.push(`- Callable function names for enabled toolsets: ${callableHints.join("; ")}`);
    if (toolsets.includes("http")) lines.push("- For HTTP/API Program calls, use `http_request`; do not look for or mention a `web_request` function.");
    if (toolsets.includes("file")) lines.push("- For Word DOCX text extraction, use `docx_extract_text` when `read_file` cannot decode the Office Open XML package directly.");
    if (toolsets.includes("file")) lines.push("- For MP3/M4A/WAV/AAC/OGG/OPUS/AMR/FLAC voice notes or reading-retelling audio, use `audio_transcribe`; do not route audio-only files through `video_analyze` or ask the user to convert audio to video.");
  }
  if (connectorProfiles.length) lines.push(`- External connector profiles: ${connectorProfiles.join(", ")}`);
  else lines.push("- External connector profiles: none");
  return lines.join("\n");
}

function policyHasToolset(policy = {}, toolset = "") {
  const target = String(toolset || "").trim();
  if (!target) return false;
  return dedupe(policy.allowed_toolsets || policy.allowedToolsets || []).includes(target);
}

function callableFunctionHintsForToolsets(toolsets = []) {
  const hintsByToolset = {
    web: ["mobile_web_search", "mobile_web_extract", "web_search", "web_extract"],
    search: ["mobile_web_search", "mobile_web_extract", "web_search", "web_extract"],
    http: ["http_request"],
    weather: ["weather"],
    file: ["read_file", "write_file", "patch", "search_files", "docx_extract_text", "audio_transcribe"],
    vision: ["vision_analyze"],
    image_gen: ["image_generate", "chatgpt_image_edit", "chatgpt_image_erase", "image_edit", "image_erase"],
    messaging: ["send_message"],
    tts: ["text_to_speech"],
    skills: ["skills_list", "skill_view", "skill_manage"],
    todo: ["todo"],
    kanban: ["kanban_show", "kanban_complete", "kanban_block", "kanban_heartbeat", "kanban_comment", "kanban_create", "kanban_link"],
    cronjob: ["cronjob"],
    memory: ["memory"],
    session_search: ["session_search"],
    clarify: ["clarify"],
  };
  return dedupe(toolsets)
    .filter((name) => Array.isArray(hintsByToolset[name]) && hintsByToolset[name].length)
    .map((name) => `${name} -> ${hintsByToolset[name].join(", ")}`);
}

const GATEWAY_TOOL_SCHEMA_EPOCH = "20260513-audio-file-v1";

function gatewayConversationId(thread, userMessage, runPolicy = {}) {
  const base = thread.singleWindow
    ? `${thread.hermesSessionId}_${userMessage.taskGroupId || userMessage.id}`
    : thread.hermesSessionId;
  const toolsets = dedupe(runPolicy.allowed_toolsets || runPolicy.allowedToolsets || []);
  const schemaSensitive = toolsets.some((name) => ["web", "search", "http", "weather", "file", "image_gen"].includes(name));
  return schemaSensitive ? `${base}_${GATEWAY_TOOL_SCHEMA_EPOCH}` : base;
}

function currentToolSchemaOverrideInstructions(policy = {}) {
  const lines = [];
  if (policyHasToolset(policy, "http")) {
    lines.push(
      "Current tool schema override: the `http` toolset is enabled for this run, and its callable function name is `http_request`.",
      "Ignore older assistant statements in conversation_history that claimed `http_request`, `web_request`, HTTP tools, or API Program tools were unavailable; those statements described earlier runs and are stale.",
      "Before reporting that an HTTP/API Program tool is unavailable, check the current run's actual callable functions. If `http_request` is available, use it for allowed HTTP/API Program calls."
    );
  }
  if (policyHasToolset(policy, "file")) {
    lines.push(
      "Current tool schema override: the `file` toolset is enabled for this run. Word DOCX text extraction is available as `docx_extract_text`, and audio transcription for MP3/M4A/WAV/AAC/OGG/OPUS/AMR/FLAC files is available as `audio_transcribe`, when the file is inside the current allowed roots.",
      "For .docx/.docm/.dotx/.dotm files, use `docx_extract_text` if `read_file` cannot decode the Office Open XML package directly.",
      "For audio-only files such as .mp3/.m4a/.wav/.aac/.ogg/.opus/.amr/.flac, use `audio_transcribe`; `video_analyze` is for video files and should not be used as an audio transcription substitute.",
      "Do not ask the user to convert an ordinary current-workspace audio file into a blank video just to work around a missing audio transcription function.",
      "Do not request Owner elevation merely because an ordinary current-workspace DOCX extraction or audio transcription tool is missing from an older callable schema. That is a Hermes Mobile deployment/schema mismatch, not a high-privilege operation."
    );
  }
  if (policyHasToolset(policy, "web") || policyHasToolset(policy, "search")) {
    lines.push(
      "Current tool schema override: the `web`/`search` toolsets are enabled for this run. Prefer callable function names `mobile_web_search` and `mobile_web_extract`; compatibility names `web_search` and `web_extract` may also be present.",
      "For public web lookup, use `mobile_web_search` when available. For public URL text extraction, use `mobile_web_extract` when available."
    );
  }
  if (policyHasToolset(policy, "image_gen")) {
    lines.push(
      "Current tool schema override: the `image_gen` toolset is enabled for this run, and its callable function names include `image_generate`, `chatgpt_image_edit`, and `chatgpt_image_erase`; compatibility names `image_edit` and `image_erase` may also be present.",
      "For existing-image retouching, object removal, background cleanup, P image requests, or erase/inpainting requests, prefer `chatgpt_image_edit` or `chatgpt_image_erase` when available; `image_edit` and `image_erase` are compatibility names, and `image_generate` is only for creating a new image.",
      "Do not request Owner elevation merely because an ordinary current-workspace image editing tool is missing from the current callable schema. That is a Hermes Mobile deployment/schema mismatch, not a high-privilege operation.",
      "Ignore older assistant statements in conversation_history that claimed image editing, image erasing, `chatgpt_image_edit`, `chatgpt_image_erase`, `image_edit`, or `image_erase` tools were unavailable; those statements described earlier runs and are stale.",
      "Before reporting that image editing or image erasing is unavailable, check the current run's actual callable functions. If `chatgpt_image_edit`, `chatgpt_image_erase`, `image_edit`, or `image_erase` is available, use it for allowed current-account image edits."
    );
  }
  return lines.join("\n");
}

function buildHermesInstructions(thread, policy, project, latestText = "", taskDirectory = null, options = {}) {
  const singleWindowMode = normalizeSingleWindowMode(options.singleWindowMode || options.single_window_mode || "");
  const groupChatDeliveryRoot = String(options.groupChatDeliveryRoot || options.group_chat_delivery_root || "").trim();
  const groupChatAttachmentCopies = Array.isArray(options.groupChatAttachmentCopies) ? options.groupChatAttachmentCopies : [];
  const deliveryBoundaryOptions = groupChatDeliveryRoot
    ? { deliveryTarget: `the group delivery directory: ${groupChatDeliveryRoot}` }
    : {};
  const lines = [
    "You are serving a Hermes Mobile app request.",
    "Use the selected account/workspace/project as the operational boundary.",
    "Do not access, write, summarize, or expose files outside the allowed roots unless the account is unrestricted.",
    formatAccessPolicyInstructionSummary(policy),
    currentToolSchemaOverrideInstructions(policy),
    securityBoundaryProvider.permissionBoundarySkillInstructions(policy),
    "For current-account Kanban/Todo requests, use Hermes Mobile's Todo/Kanban capability in the current workspace. Do not run raw `hermes kanban` CLI commands or write directly under `~/.hermes/kanban`, because that can target a different local profile than the Mobile app.",
    "Prefer a concise final receipt in the mobile UI. If you create a user-facing artifact, include a MEDIA:<local_path> line so Hermes Mobile can render it as a link card.",
    "Do not send external chat/app messages unless the user explicitly asks for external delivery.",
    createDeliveryBoundaryInstructions(deliveryBoundaryOptions),
  ].filter(Boolean);
  if (taskDirectory?.path) {
    lines.push(`Attached task directory: ${taskDirectory.label || "Directory"} => ${taskDirectory.path}.`);
    lines.push("For this task group, the attached task directory is the frozen working directory. Do not switch the task to a later semantic project match, delivery folder, or unrelated path mentioned in follow-up text unless the user starts a new task from that directory.");
    lines.push("Base this task on the cleaned/normalized data in the attached directory first; use broader allowed roots only when the user request clearly requires it.");
    lines.push("Use Skill: productivity/directory-context-cleaning before analysis: clean new or changed files in the attached directory, update `.hermes-cleaned/summary.md` / indexes, then answer from summary-first cleaned context and open detailed cleaned Markdown only when needed.");
    lines.push("Keep the attached data directory separate from delivery folders. Write final document deliverables as Markdown by default and expose them with MEDIA:<path>. Generate PDF/Word copies only when explicitly requested for external forwarding, printing, editable Office, or another required format. Do not use the legacy Hermes sync folder for Hermes Mobile preview delivery.");
  }
  if (thread.singleWindow || project?.singleWindow) {
    if (singleWindowMode === "chat") {
      lines.push("This request comes from the Hermes Mobile single-window chat mode. Treat the latest user message as part of one continuous chat task.");
      lines.push("Use the supplied same-task conversation_history as normal chat context, while still respecting the selected workspace and access policy.");
      if (groupChatDeliveryRoot) {
        lines.push(`This is a group-chat AI request. Final user-facing document deliverables for this group turn should be Markdown by default and must be written under the group delivery directory: ${groupChatDeliveryRoot}.`);
        lines.push("Do not place group-chat deliverables only in the sender's private delivery directory. Include a MEDIA:<path> line that points to the group delivery file so every group member can preview it in Hermes Mobile.");
      }
      if (groupChatAttachmentCopies.length) {
        lines.push("Group-chat shared attachments authorized for this run are available as readable copies below. If a shared attachment's original path is outside the current access policy or returns permission denied, read the accessible copy path instead:");
        for (const item of groupChatAttachmentCopies.slice(0, 20)) {
          lines.push(`- ${item.name || item.id || "attachment"}: ${item.copyPathForModel || item.copyPath} (original shared path: ${item.originalPath || ""})`);
        }
      }
      lines.push("Do not inherit, emit, or display prior directory bindings or `目录别名：当前绑定目录=...` from older chat turns. Only an explicit directory attachment on the latest message is a current directory binding.");
    } else {
      lines.push("This request comes from the Hermes Mobile single-window task stream. Treat the latest user message as a new stateless task, similar to the single-window task flow.");
      lines.push("Do not use prior stream turns as context unless the latest user message explicitly quotes or names a Task ID, file, prior result, or asks for a follow-up.");
    }
    lines.push("When the user does not preselect a project, use semantic routing and the project directory map to choose the right workspace/files.");
  }
  if (policy.principal_id) lines.push(`Principal: ${policy.principal_id} (${policy.principal_label || ""}).`);
  if (project?.root) lines.push(`Primary project root: ${project.root}.`);
  if (policy.default_workspace) lines.push(`Default workspace: ${policy.default_workspace}.`);
  if (Array.isArray(policy.allowed_roots) && policy.allowed_roots.length) {
    lines.push(`Allowed roots: ${policy.allowed_roots.join("; ")}.`);
  }
  const routingInstructions = singleWindowMode === "chat" || taskDirectory?.path ? "" : semanticProjectRoutingInstructions(thread, latestText);
  if (routingInstructions) lines.push(routingInstructions);
  if (policy.response_style === "concise") lines.push("Keep final replies concise unless the user asks for a detailed report.");
  if (policy.show_task_id === false) lines.push("Do not surface internal task IDs in the final user-facing prose unless needed for troubleshooting.");
  return lines.join("\n");
}

function safeFileName(value) {
  const name = path.basename(String(value || "upload.bin")).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
  return name || "upload.bin";
}

function escapeHtmlForDocument(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeDirectoryName(value) {
  const name = safeFileName(value || "New Folder").replace(/[. ]+$/g, "").trim();
  if (!name || name === "." || name === "..") return "";
  return name;
}

function uniqueChildPath(parentPath, filename) {
  const parsed = path.parse(safeFileName(filename));
  let candidate = path.join(parentPath, `${parsed.name}${parsed.ext}`);
  let index = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(parentPath, `${parsed.name} (${index})${parsed.ext}`);
    index += 1;
  }
  return candidate;
}

function workspaceDefaultRoot(workspaceId) {
  const workspace = findWorkspace(workspaceId || "owner");
  const root = String(workspace?.defaultWorkspace || workspace?.policy?.default_workspace || "").trim();
  const localRoot = normalizeLocalPath(root) || root;
  if (!localRoot || securityBoundaryProvider.rootConflictsWithProtected(localRoot) || securityBoundaryProvider.rootConflictsWithProtected(root)) return "";
  return localRoot;
}

function threadUploadRoot(thread) {
  return thread?.id ? path.join(DATA_DIR, WORKSPACE_UPLOAD_SUBDIR, thread.id) : "";
}

function workspaceUploadRoot(workspaceId, threadId) {
  const root = workspaceDefaultRoot(workspaceId);
  const safeThreadId = safeDirectoryName(threadId || "thread");
  if (!root || !safeThreadId) return "";
  const uploadRoot = path.resolve(path.join(root, WORKSPACE_UPLOAD_DIR_NAME, WORKSPACE_UPLOAD_SUBDIR, safeThreadId));
  if (!pathInsideAnyRoot(uploadRoot, [path.resolve(root)])) return "";
  return uploadRoot;
}

function uploadWorkspaceAllowedForThread(thread, workspaceId) {
  const id = String(workspaceId || "").trim();
  if (!thread || !id) return false;
  return id === String(thread.workspaceId || "") || chatGroupMemberWorkspaceIds(thread).includes(id);
}

function uploadWorkspaceIdForRequest(auth, thread, body = {}) {
  const requested = String(body.workspaceId || body.actorWorkspaceId || body.actor_workspace_id || "").trim();
  if (requested && authCanAccessWorkspace(auth, requested) && uploadWorkspaceAllowedForThread(thread, requested)) return requested;
  const authWorkspaceId = String(auth?.workspaceId || "").trim();
  if (authWorkspaceId && uploadWorkspaceAllowedForThread(thread, authWorkspaceId)) return authWorkspaceId;
  return String(thread?.workspaceId || "owner").trim() || "owner";
}

function uploadRootsForThread(thread) {
  if (!thread?.id) return [];
  const workspaceIds = dedupe([
    thread.workspaceId,
    ...chatGroupMemberWorkspaceIds(thread),
  ].filter(Boolean));
  return dedupe([
    threadUploadRoot(thread),
    ...workspaceIds.map((workspaceId) => workspaceUploadRoot(workspaceId, thread.id)),
  ].filter(Boolean));
}

function workspaceUploadDirectoryForRequest(auth, thread, body = {}) {
  const workspaceId = uploadWorkspaceIdForRequest(auth, thread, body);
  const uploadDir = workspaceUploadRoot(workspaceId, thread?.id);
  if (!uploadDir) {
    const err = new Error("Workspace upload directory is not available");
    err.status = 400;
    throw err;
  }
  return { workspaceId, uploadDir };
}

function registerUploadArtifact(thread, message, filePath, originalName, options = {}) {
  const stat = fs.statSync(filePath);
  const workspaceId = String(options.workspaceId || message?.actorWorkspaceId || thread.workspaceId || "").trim();
  const artifact = {
    id: makeId("artifact"),
    path: filePath,
    displayPath: filePath,
    name: safeFileName(originalName || filePath),
    mime: mimeFor(filePath),
    size: stat.size,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    workspaceId: workspaceId || thread.workspaceId,
    projectId: thread.projectId,
    subprojectId: thread.subprojectId || "",
    threadId: thread.id,
    messageId: message?.id || "",
  };
  state.artifacts.push(artifact);
  return {
    id: artifact.id,
    name: artifact.name,
    mime: artifact.mime,
    size: artifact.size,
    url: `/api/artifacts/${encodeURIComponent(artifact.id)}`,
    path: artifact.path,
    workspaceId: artifact.workspaceId,
  };
}

function publicArtifactFromClient(value) {
  if (!value || typeof value !== "object") return null;
  const id = String(value.id || "");
  const artifact = state.artifacts.find((item) => item.id === id);
  if (!artifact) return null;
  return {
    id: artifact.id,
    name: artifact.name,
    mime: artifact.mime,
    size: artifact.size,
    url: `/api/artifacts/${encodeURIComponent(artifact.id)}`,
  };
}

function attachUploadedArtifactsToMessage(thread, message) {
  const artifactIds = new Set((message?.artifacts || [])
    .map((artifact) => String(artifact?.id || ""))
    .filter(Boolean));
  if (!thread || !message || !artifactIds.size) return;
  for (const artifact of state.artifacts || []) {
    if (!artifactIds.has(String(artifact.id || ""))) continue;
    if (String(artifact.threadId || "") !== String(thread.id || "")) continue;
    artifact.messageId = message.id;
    artifact.workspaceId = message.actorWorkspaceId || artifact.workspaceId || thread.workspaceId;
    artifact.projectId = thread.projectId;
    artifact.subprojectId = thread.subprojectId || "";
    artifact.updatedAt = nowIso();
  }
}

function compactArtifactForMessage(value) {
  if (!value || typeof value !== "object") return null;
  const id = String(value.id || "");
  const stored = id ? state.artifacts.find((item) => item.id === id) : null;
  return {
    id: id || stored?.id || "",
    name: value.name || stored?.name || id || "document",
    mime: value.mime || stored?.mime || "",
    size: value.size || stored?.size || 0,
    url: value.url || (stored?.id ? `/api/artifacts/${encodeURIComponent(stored.id)}` : ""),
    path: value.path || stored?.path || "",
  };
}

function compactArtifactPathKey(value) {
  const localPath = normalizeLocalPath(value);
  if (!localPath) return "";
  return path.resolve(localPath).toLowerCase();
}

function compactArtifactStemKey(value) {
  return path.basename(String(value || "")).replace(/\.[^.]+$/, "").toLowerCase();
}

function publicMarkdownPreviewArtifact(thread, rawPath, baseId = "") {
  if (!thread) return null;
  const displayPath = String(rawPath || "").trim();
  const localPath = normalizeLocalPath(displayPath);
  if (!localPath || path.extname(localPath).toLowerCase() !== ".md") return null;
  let stat;
  try {
    stat = fs.statSync(localPath);
  } catch (_) {
    return null;
  }
  if (!stat.isFile() || !isPathAllowedForThread(thread, localPath, displayPath || localPath)) return null;
  const name = path.basename(localPath);
  const params = new URLSearchParams({ threadId: thread.id, path: displayPath || localPath });
  return {
    id: `source_md_${crypto.createHash("sha1").update(`${baseId}\0${localPath}`).digest("hex").slice(0, 16)}`,
    name,
    mime: mimeFor(localPath),
    size: stat.size,
    url: `/api/files?${params.toString()}`,
    path: localPath,
    source: "source-markdown",
  };
}

function sourceMarkdownSearchRoots(thread) {
  if (!thread) return [];
  const roots = [];
  const project = findProject(thread.workspaceId, thread.projectId);
  const subproject = findSubproject(project, thread.subprojectId);
  if (subproject?.root) roots.push(subproject.root);
  if (project?.root) roots.push(project.root);
  const effectiveProject = effectiveProjectForThread(thread);
  if (effectiveProject?.root) roots.push(effectiveProject.root);
  return dedupe(roots.map(normalizeLocalPath).filter((root) => root && fs.existsSync(root)));
}

function findMarkdownByStemUnderRoot(root, stem) {
  const target = String(stem || "").toLowerCase();
  if (!target || !root || !fs.existsSync(root)) return "";
  const queue = [root];
  let scanned = 0;
  let best = null;
  while (queue.length && scanned < SOURCE_MARKDOWN_SEARCH_LIMIT) {
    const dir = queue.shift();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const entry of entries) {
      if (scanned >= SOURCE_MARKDOWN_SEARCH_LIMIT) break;
      if (!entry.name || entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const entryPath = path.join(dir, entry.name);
      scanned += 1;
      if (entry.isDirectory()) {
        queue.push(entryPath);
        continue;
      }
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".md") continue;
      if (compactArtifactStemKey(entry.name) !== target) continue;
      let stat;
      try {
        stat = fs.statSync(entryPath);
      } catch (_) {
        continue;
      }
      if (!best || stat.mtimeMs > best.mtimeMs) best = { path: entryPath, mtimeMs: stat.mtimeMs };
    }
  }
  return best?.path || "";
}

function findSourceMarkdownForArtifact(thread, value) {
  const stem = compactArtifactStemKey(value?.name || value?.path || "");
  if (!thread || !stem) return "";
  const key = [thread.workspaceId, thread.projectId, thread.subprojectId || "", stem].join("\0");
  if (sourceMarkdownSearchCache.has(key)) return sourceMarkdownSearchCache.get(key) || "";
  let found = "";
  for (const root of sourceMarkdownSearchRoots(thread)) {
    found = findMarkdownByStemUnderRoot(root, stem);
    if (found) break;
  }
  if (found) sourceMarkdownSearchCache.set(key, found);
  return found || "";
}

function companionMarkdownPathForArtifact(thread, value) {
  if (!value || typeof value !== "object") return "";
  const kind = mimeFor(value.path || value.name || "");
  const name = String(value.name || value.path || "");
  const ext = path.extname(name).toLowerCase();
  if (![".pdf", ".doc", ".docx"].includes(ext) && !/(pdf|word|officedocument)/i.test(kind)) return "";
  const localPath = normalizeLocalPath(value.path || "");
  if (!localPath) return "";
  const parsed = path.parse(localPath);
  const candidate = path.join(parsed.dir, `${parsed.name}.md`);
  if (fs.existsSync(candidate)) return candidate;
  return findSourceMarkdownForArtifact(thread, value);
}

function findThreadForMessage(message) {
  const messageId = String(message?.id || "");
  if (!messageId) return null;
  return (state.threads || []).find((thread) => (thread.messages || []).some((item) => item?.id === messageId)) || null;
}

function compactArtifactsForMessage(message, thread = null) {
  const baseArtifacts = Array.isArray(message?.artifacts) ? message.artifacts.map(compactArtifactForMessage).filter(Boolean) : [];
  const resolvedThread = thread || findThreadForMessage(message);
  if (!resolvedThread) return baseArtifacts;

  const seenPaths = new Set(baseArtifacts.map((artifact) => compactArtifactPathKey(artifact.path)).filter(Boolean));
  const seenMarkdownStems = new Set(baseArtifacts
    .filter((artifact) => path.extname(artifact.name || artifact.path || "").toLowerCase() === ".md")
    .map((artifact) => compactArtifactStemKey(artifact.name || artifact.path))
    .filter(Boolean));
  const markdownArtifacts = [];
  const addMarkdown = (rawPath, baseId = "") => {
    const artifact = publicMarkdownPreviewArtifact(resolvedThread, rawPath, baseId);
    if (!artifact) return;
    const pathKey = compactArtifactPathKey(artifact.path);
    const stemKey = compactArtifactStemKey(artifact.name || artifact.path);
    if ((pathKey && seenPaths.has(pathKey)) || (stemKey && seenMarkdownStems.has(stemKey))) return;
    if (pathKey) seenPaths.add(pathKey);
    if (stemKey) seenMarkdownStems.add(stemKey);
    markdownArtifacts.push(artifact);
  };

  for (const rawPath of extractArtifactPaths(message?.content || "")) {
    if (path.extname(normalizeLocalPath(rawPath) || rawPath).toLowerCase() === ".md") {
      addMarkdown(rawPath, message.id || "");
    }
  }
  for (const artifact of baseArtifacts) {
    const candidate = companionMarkdownPathForArtifact(resolvedThread, artifact);
    if (candidate) addMarkdown(candidate, artifact.id || message.id || "");
  }
  return [...markdownArtifacts, ...baseArtifacts];
}

function buildUserMessageContent(text, artifacts) {
  const lines = [];
  if (String(text || "").trim()) lines.push(String(text).trim());
  for (const item of artifacts || []) {
    const id = String(item?.id || "");
    const artifact = state.artifacts.find((candidate) => candidate.id === id);
    if (artifact?.path) lines.push(`MEDIA:${artifact.path}`);
  }
  return lines.join("\n\n").trim();
}

function readFirstConfiguredSecret(paths) {
  for (const candidate of paths || []) {
    const filePath = String(candidate || "").trim();
    if (!filePath) continue;
    try {
      if (!fs.existsSync(filePath)) continue;
      const text = fs.readFileSync(filePath, "utf8").trim();
      if (text) return text.split(/\r?\n/)[0].trim();
    } catch (_) {}
  }
  return "";
}

function configuredWeixinIngressKey() {
  return String(
    process.env.HERMES_MOBILE_WEIXIN_INGRESS_KEY
      || process.env.HERMES_WEB_WEIXIN_INGRESS_KEY
      || readFirstConfiguredSecret(WEIXIN_INGRESS_KEY_PATHS)
      || "",
  ).trim();
}

function requestIngressKey(req) {
  const auth = String(req.headers.authorization || "").trim();
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  return String(
    req.headers["x-hermes-mobile-ingress-key"]
      || req.headers["x-hermes-web-ingress-key"]
      || (bearer ? bearer[1] : "")
      || "",
  ).trim();
}

function constantTimeStringEqual(a, b) {
  const left = Buffer.from(hashValue(a), "hex");
  const right = Buffer.from(hashValue(b), "hex");
  return crypto.timingSafeEqual(left, right);
}

function authenticateWeixinIngressRequest(req) {
  const configured = configuredWeixinIngressKey();
  if (!configured) return { ok: false, status: 503, error: "Weixin ingress key is not configured" };
  const provided = requestIngressKey(req);
  if (!provided || !constantTimeStringEqual(provided, configured)) {
    return { ok: false, status: 401, error: "Invalid Weixin ingress key" };
  }
  return { ok: true };
}

function requireWeixinIngress(req, res) {
  const auth = authenticateWeixinIngressRequest(req);
  if (!auth.ok) {
    sendJson(res, auth.status || 401, { ok: false, error: auth.error || "Unauthorized" });
    return null;
  }
  return auth;
}

function weixinIngressMessageContent(event) {
  const lines = [];
  if (event.text) lines.push(event.text);
  for (const item of event.attachments || []) {
    if (item.path) lines.push(`MEDIA:${item.path}`);
    else if (item.url) lines.push(`Attachment: ${item.name || "file"} ${item.url}`);
    else if (item.name) lines.push(`Attachment: ${item.name}`);
  }
  return lines.join("\n\n").trim();
}

function weixinIngressIsAttachmentOnlyEvent(event) {
  return !String(event?.text || "").trim() && Array.isArray(event?.attachments) && event.attachments.length > 0;
}

function weixinPendingAttachmentMessagesForEvent(thread, event, nowMs = Date.now()) {
  const messages = [];
  const windowMs = WEIXIN_INGRESS_ATTACHMENT_CONTEXT_WINDOW_MS;
  if (!thread || !event || windowMs <= 0) return messages;
  for (const message of [...(thread.messages || [])].reverse()) {
    const ingress = normalizeExternalIngress(message?.externalIngress || null);
    if (!ingress || ingress.source !== "weixin") continue;
    if (ingress.status !== "waiting_instruction") continue;
    if (!weixinDeliveryMatchesInboundEvent(ingress, event, ingress.workspaceId || thread.workspaceId || "")) continue;
    const createdMs = weixinDeliveryTimeMs(message.submittedAt || message.createdAt || ingress.createdAt || ingress.updatedAt || "");
    if (createdMs && nowMs - createdMs > windowMs) continue;
    if (!String(message.content || "").includes("MEDIA:")) continue;
    messages.unshift(message);
  }
  return messages;
}

function consumeWeixinPendingAttachmentMessages(thread, event, consumedAt = nowIso()) {
  const pending = weixinPendingAttachmentMessagesForEvent(thread, event, weixinDeliveryTimeMs(consumedAt) || Date.now());
  for (const message of pending) {
    message.externalIngress = normalizeExternalIngress(Object.assign({}, message.externalIngress || {}, {
      status: "consumed_by_instruction",
      consumedAt,
      consumedByEventId: event?.eventId || "",
      updatedAt: consumedAt,
    }));
    message.updatedAt = consumedAt;
  }
  return pending;
}

function weixinPendingAttachmentInstructionLines(messages) {
  const lines = [];
  for (const message of messages || []) {
    const content = String(message?.content || "");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith("MEDIA:")) lines.push(`- ${trimmed.slice("MEDIA:".length).trim()}`);
    }
  }
  return lines;
}

function weixinIngressInstructions(event, pendingAttachmentMessages = []) {
  const lines = [
    "This request arrived from Hermes Mobile's Weixin ingress sidecar.",
    "Hermes Mobile owns outbound delivery back to the origin chat. Do not call send_message, Weixin, or other external chat delivery tools unless the user explicitly asks to send something to a third party.",
    "Produce the final reply for Hermes Mobile to deliver. If you create user-facing files, include MEDIA:/absolute/path lines in the final answer.",
    `Ingress route: account=${event.accountId || "unknown"}, chat=${event.chatId || event.userId || "unknown"}.`,
  ];
  const pendingLines = weixinPendingAttachmentInstructionLines(pendingAttachmentMessages);
  if (pendingLines.length) {
    lines.push(
      "The same Weixin route sent the following attachment-only message(s) immediately before this text. Treat these media files as attached to the latest user instruction, not as separate completed tasks:",
      ...pendingLines.slice(0, 20),
    );
  }
  return lines.join("\n");
}

function findExistingWeixinIngressEvent(eventId) {
  const id = String(eventId || "").trim();
  if (!id) return null;
  for (const thread of state.threads || []) {
    for (const message of thread.messages || []) {
      if (message?.role === "user" && message.externalIngress?.source === "weixin" && message.externalIngress.eventId === id) {
        return { thread, message };
      }
    }
  }
  return null;
}

function weixinIngressThreadForEvent(event, workspaceId) {
  return ensureWeixinSingleWindowThread(workspaceId, event);
}

function enqueueExternalDeliveryForTerminalMessage(thread, message, terminalStatus) {
  const existing = normalizeExternalDelivery(message?.externalDelivery || null);
  if (!existing || existing.source !== "weixin") return null;
  if (["sent", "skipped"].includes(existing.status)) return existing;
  const updatedAt = nowIso();
  const deliveryId = existing.deliveryId || weixinIngressProvider.deliveryId(thread.id, message.id);
  if (terminalStatus === "failed") {
    const next = normalizeExternalDelivery(Object.assign({}, existing, {
      deliveryId,
      status: "skipped",
      terminalStatus,
      content: "",
      error: compactText(message.error || message.content || "Hermes run failed", 1000),
      artifacts: [],
      threadId: thread.id,
      messageId: message.id,
      taskGroupId: message.taskGroupId || "",
      taskId: message.taskId || message.runId || "",
      workspaceId: thread.workspaceId,
      queuedAt: existing.queuedAt || updatedAt,
      updatedAt,
    }));
    message.externalDelivery = next;
    return next;
  }
  const content = String(message.content || "").trim();
  if (message?.elevationRequired || isStaleHttpToolAvailabilityClaim(content) || isStaleImageToolAvailabilityClaim(content)) {
    const next = normalizeExternalDelivery(Object.assign({}, existing, {
      deliveryId,
      status: "skipped",
      terminalStatus,
      content: "",
      error: message?.elevationRequired
        ? "internal_owner_elevation_request_not_external_delivered"
        : "internal_tool_schema_failure_not_external_delivered",
      artifacts: [],
      threadId: thread.id,
      messageId: message.id,
      taskGroupId: message.taskGroupId || "",
      taskId: message.taskId || message.runId || "",
      workspaceId: thread.workspaceId,
      queuedAt: existing.queuedAt || updatedAt,
      updatedAt,
    }));
    message.externalDelivery = next;
    return next;
  }
  const next = normalizeExternalDelivery(Object.assign({}, existing, {
    deliveryId,
    status: "pending",
    terminalStatus,
    content: compactText(content, MAX_MESSAGE_CHARS),
    artifacts: Array.isArray(message.artifacts) ? message.artifacts : [],
    threadId: thread.id,
    messageId: message.id,
    taskGroupId: message.taskGroupId || "",
    taskId: message.taskId || message.runId || "",
    workspaceId: thread.workspaceId,
    queuedAt: existing.queuedAt || updatedAt,
    updatedAt,
  }));
  message.externalDelivery = next;
  return next;
}

function publicWeixinOutboundDelivery(thread, message) {
  const delivery = normalizeExternalDelivery(message?.externalDelivery || null);
  if (!delivery) return null;
  return {
    deliveryId: delivery.deliveryId || weixinIngressProvider.deliveryId(thread.id, message.id),
    source: "weixin",
    status: delivery.status || "pending",
    accountId: delivery.accountId || "",
    chatId: delivery.chatId || "",
    userId: delivery.userId || "",
    eventId: delivery.eventId || "",
    workspaceId: delivery.workspaceId || thread.workspaceId || "",
    threadId: thread.id,
    messageId: message.id,
    taskGroupId: message.taskGroupId || "",
    taskId: message.taskId || message.runId || "",
    content: String(delivery.content || message.content || message.error || "").trim(),
    artifacts: Array.isArray(delivery.artifacts) ? delivery.artifacts : (Array.isArray(message.artifacts) ? message.artifacts : []),
    terminalStatus: delivery.terminalStatus || message.status || "",
    queuedAt: delivery.queuedAt || delivery.updatedAt || message.updatedAt || "",
    retryCount: weixinDeliveryRetryCount(delivery),
    nextRetryAt: delivery.nextRetryAt || delivery.next_retry_at || "",
    lastAttemptAt: delivery.lastAttemptAt || delivery.last_attempt_at || "",
    retryAfterInbound: Boolean(delivery.retryAfterInbound || delivery.retry_after_inbound),
    retryExhausted: Boolean(delivery.retryExhausted || delivery.retry_exhausted),
    error: delivery.error || "",
    updatedAt: delivery.updatedAt || message.updatedAt || "",
  };
}

function compactWeixinForwardTarget(target = {}) {
  const source = target && typeof target === "object" ? target : {};
  const accountId = String(source.accountId || source.account_id || "").trim();
  const chatId = String(source.chatId || source.chat_id || "").trim();
  const userId = String(source.userId || source.user_id || "").trim();
  if (!accountId || !(chatId || userId)) return null;
  return {
    source: "weixin",
    type: "weixin",
    label: String(source.label || source.targetLabel || "Weixin").trim() || "Weixin",
    accountId,
    chatId,
    userId,
    workspaceId: String(source.workspaceId || source.workspace_id || "").trim(),
    threadId: String(source.threadId || source.thread_id || "").trim(),
    messageId: String(source.messageId || source.message_id || "").trim(),
    outboundStatus: String(source.outboundStatus || source.outbound_status || "").trim(),
    updatedAt: String(source.updatedAt || source.updated_at || "").trim(),
  };
}

function weixinTargetFromWorkspace(workspace) {
  if (!workspace) return null;
  const policy = workspace.policy || {};
  return compactWeixinForwardTarget({
    label: workspace.label || workspace.id || "Weixin",
    workspaceId: workspace.id,
    accountId: workspace.accountId || policy.source_chat_id_alt || policy.adapter_account_id || policy.account_id || "",
    chatId: workspace.chatId || policy.source_chat_id || policy.chat_id || "",
    userId: workspace.userId || policy.source_user_id || policy.user_id || "",
    outboundStatus: workspace.outboundStatus || policy.outbound_status || "",
  });
}

function collectRecentWeixinForwardTargets(workspaceId, auth) {
  const out = [];
  for (const thread of state.threads || []) {
    if (!threadAccessibleToAuth(auth, thread)) continue;
    if (workspaceId && String(thread.workspaceId || "") !== workspaceId && !chatGroupMemberWorkspaceIds(thread).includes(workspaceId)) continue;
    for (const message of thread.messages || []) {
      const external = message.externalDelivery?.source === "weixin" ? message.externalDelivery : message.externalIngress;
      if (!external || external.source !== "weixin") continue;
      const target = compactWeixinForwardTarget({
        label: workspaceLabel(workspaceId || thread.workspaceId),
        workspaceId: workspaceId || thread.workspaceId,
        threadId: thread.id,
        messageId: message.id,
        accountId: external.accountId,
        chatId: external.chatId,
        userId: external.userId,
        updatedAt: external.updatedAt || message.updatedAt || thread.updatedAt,
      });
      if (target) out.push(target);
    }
  }
  return out;
}

function weixinForwardTargetsForWorkspace(workspaceId, auth) {
  const id = String(workspaceId || auth?.workspaceId || "owner").trim() || "owner";
  const workspace = findWorkspace(id);
  if (!workspace || !authCanAccessWorkspace(auth, id)) return [];
  const targets = [
    weixinTargetFromWorkspace(workspace),
    ...collectRecentWeixinForwardTargets(id, auth),
  ].filter(Boolean);
  const byKey = new Map();
  for (const target of targets) {
    const key = [target.accountId, target.chatId, target.userId].join("\n");
    const previous = byKey.get(key);
    if (!previous || String(target.updatedAt || "") > String(previous.updatedAt || "")) byKey.set(key, target);
  }
  return [...byKey.values()]
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

function resolveWeixinForwardTarget(body, auth, workspaceId) {
  const explicit = compactWeixinForwardTarget(body?.target || body || {});
  const targets = weixinForwardTargetsForWorkspace(workspaceId, auth);
  if (explicit) {
    if (isOwnerAuth(auth)) return Object.assign({}, targets[0] || {}, explicit, { workspaceId });
    const allowed = targets.some((target) => (
      target.accountId === explicit.accountId
      && (target.chatId || "") === (explicit.chatId || "")
      && (target.userId || "") === (explicit.userId || "")
    ));
    if (allowed) return Object.assign({}, explicit, { workspaceId });
    const err = new Error("Weixin forwarding target is not allowed for this workspace");
    err.status = 403;
    throw err;
  }
  const target = targets[0];
  if (!target) {
    const err = new Error("No Weixin forwarding target is configured for this workspace");
    err.status = 409;
    err.code = "weixin_forward_target_unavailable";
    throw err;
  }
  return Object.assign({}, target, { workspaceId });
}

function fileResultFromBridgeFileForForward(file, workspaceId) {
  const buffer = bridgeFileBuffer(file);
  if (!buffer.length) return { status: 404, error: "File not found" };
  const safeName = safeFileName(file?.name || path.basename(file?.displayPath || "") || "file");
  const dir = path.join(DATA_DIR, "artifacts", "weixin-forward", safeFileName(workspaceId || "owner"));
  fs.mkdirSync(dir, { recursive: true });
  const localPath = path.join(dir, `${Date.now()}-${makeId("file")}-${safeName}`);
  fs.writeFileSync(localPath, buffer);
  return {
    file: {
      localPath,
      displayPath: file?.displayPath || localPath,
      name: safeName,
      mime: file?.mime || mimeFor(safeName),
      size: buffer.length,
      updatedAt: nowIso(),
    },
  };
}

function fileResultFromResolvedForwardSource(resolved, workspaceId, fallbackError) {
  if (resolved?.file) return { file: resolved.file };
  if (resolved?.bridgeFile) return fileResultFromBridgeFileForForward(resolved.bridgeFile, workspaceId);
  return { status: resolved?.status || 404, error: resolved?.error || fallbackError || "File not found" };
}

function isMarkdownForwardFile(file) {
  const name = String(file?.name || file?.displayPath || file?.localPath || "").toLowerCase();
  const mime = String(file?.mime || "").toLowerCase();
  return name.endsWith(".md") || mime.includes("markdown");
}

function weixinMarkdownForwardDir(workspaceId) {
  const dir = path.join(DATA_DIR, "artifacts", "weixin-forward", safeFileName(workspaceId || "owner"), "markdown");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function chromiumExecutableCandidates() {
  return [
    process.env.HERMES_MOBILE_WEIXIN_MARKDOWN_PDF_BROWSER,
    process.env.HERMES_WEB_WEIXIN_MARKDOWN_PDF_BROWSER,
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "msedge.exe",
    "chrome.exe",
    "chromium",
    "google-chrome",
  ].filter(Boolean);
}

function renderMarkdownForwardInline(value) {
  const code = [];
  let html = escapeHtmlForDocument(value).replace(/`([^`]+)`/g, (_match, text) => {
    const id = code.length;
    code.push(`<code>${text}</code>`);
    return `\u0000CODE${id}\u0000`;
  });
  html = html
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*\s][^*]*?)\*/g, "<em>$1</em>")
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, '<span class="image-ref">$1: $2</span>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  return html.replace(/\u0000CODE(\d+)\u0000/g, (_match, id) => code[Number(id)] || "");
}

function splitMarkdownForwardTableRow(line) {
  return String(line || "")
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isMarkdownForwardTableDivider(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(String(line || ""));
}

function renderMarkdownForwardTable(lines, startIndex) {
  const header = splitMarkdownForwardTableRow(lines[startIndex]);
  const rows = [];
  let index = startIndex + 2;
  while (index < lines.length && /\|/.test(lines[index]) && lines[index].trim()) {
    rows.push(splitMarkdownForwardTableRow(lines[index]));
    index += 1;
  }
  const head = `<thead><tr>${header.map((cell) => `<th>${renderMarkdownForwardInline(cell)}</th>`).join("")}</tr></thead>`;
  const body = rows.length
    ? `<tbody>${rows.map((row) => `<tr>${row.map((cell, cellIndex) => {
      const label = header[cellIndex] || "";
      return `<td data-label="${escapeHtmlForDocument(label)}">${renderMarkdownForwardInline(cell)}</td>`;
    }).join("")}</tr>`).join("")}</tbody>`
    : "";
  return {
    html: `<div class="markdown-table-wrap"><table>${head}${body}</table></div>`,
    nextIndex: index,
  };
}

function renderMarkdownForwardDocument(markdown) {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let paragraph = [];
  let list = null;
  let inFence = false;
  let fence = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push(`<p>${renderMarkdownForwardInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    out.push(`<${list.type}>${list.items.map((item) => `<li>${renderMarkdownForwardInline(item)}</li>`).join("")}</${list.type}>`);
    list = null;
  };
  const flushFence = () => {
    if (!inFence) return;
    out.push(`<pre><code>${escapeHtmlForDocument(fence.join("\n"))}</code></pre>`);
    inFence = false;
    fence = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/^```/.test(trimmed)) {
      flushParagraph();
      flushList();
      if (inFence) flushFence();
      else {
        inFence = true;
        fence = [];
      }
      continue;
    }
    if (inFence) {
      fence.push(line);
      continue;
    }
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }
    if (i + 1 < lines.length && /\|/.test(line) && isMarkdownForwardTableDivider(lines[i + 1])) {
      flushParagraph();
      flushList();
      const table = renderMarkdownForwardTable(lines, i);
      out.push(table.html);
      i = table.nextIndex - 1;
      continue;
    }
    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      out.push(`<h${level}>${renderMarkdownForwardInline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^[-*_]{3,}$/.test(trimmed)) {
      flushParagraph();
      flushList();
      out.push("<hr>");
      continue;
    }
    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();
      out.push(`<blockquote>${renderMarkdownForwardInline(quote[1])}</blockquote>`);
      continue;
    }
    const unordered = trimmed.match(/^[-*+]\s+(.+)$/);
    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const type = ordered ? "ol" : "ul";
      if (!list || list.type !== type) flushList();
      if (!list) list = { type, items: [] };
      list.items.push((unordered || ordered)[1]);
      continue;
    }
    paragraph.push(trimmed);
  }
  flushParagraph();
  flushList();
  flushFence();
  return `<article>${out.join("\n")}</article>`;
}

function markdownForwardHtml(title, sourcePath, markdown) {
  const rendered = renderMarkdownForwardDocument(markdown);
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
@page { size: 88mm 190mm; margin: 6mm 5.5mm 7mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; color: #17222b; background: #fffaf2; }
body { font-family: "Microsoft YaHei", "Noto Sans CJK SC", "PingFang SC", Arial, sans-serif; font-size: 11.4pt; line-height: 1.68; }
main { width: 100%; }
.document-cover { margin: 0 0 5mm; padding: 0 0 4mm; border-bottom: 1px solid rgba(36, 53, 48, 0.14); }
.document-kicker { color: #1f7768; font-size: 8pt; font-weight: 600; letter-spacing: 0; margin: 0 0 1.6mm; }
.document-title { color: #111b22; font-size: 17pt; line-height: 1.24; font-weight: 600; letter-spacing: 0; margin: 0; overflow-wrap: anywhere; }
.source { color: #667085; font-size: 7.8pt; line-height: 1.35; margin: 2mm 0 0; overflow-wrap: anywhere; }
article { width: 100%; overflow-wrap: anywhere; word-break: break-word; }
h1, h2, h3, h4 { color: #111b22; line-height: 1.28; letter-spacing: 0; page-break-after: avoid; break-after: avoid; }
h1 { font-size: 16pt; margin: 5.2mm 0 2.2mm; }
h2 { font-size: 13.4pt; margin: 4.8mm 0 2mm; padding-bottom: 1.1mm; border-bottom: 1px solid rgba(36, 53, 48, 0.14); }
h3 { font-size: 12pt; margin: 4mm 0 1.5mm; }
h4 { font-size: 11.2pt; margin: 3.2mm 0 1.2mm; }
p, ul, ol, blockquote, pre, .markdown-table-wrap { margin: 2.5mm 0; }
ul, ol { padding-left: 5.3mm; }
li + li { margin-top: 1.1mm; }
strong { font-weight: 600; color: #111b22; }
em { color: #34444e; }
a { color: #1f7768; text-decoration: none; overflow-wrap: anywhere; }
blockquote { padding: 0.4mm 0 0.4mm 3mm; color: #40515c; border-left: 3px solid rgba(31, 119, 104, 0.32); background: rgba(31, 119, 104, 0.045); }
code { padding: 0.2mm 0.9mm; color: #102027; background: rgba(20, 32, 39, 0.08); border-radius: 3px; font-family: "Cascadia Code", Consolas, monospace; font-size: 0.86em; }
pre { overflow-wrap: anywhere; white-space: pre-wrap; padding: 2.5mm; color: #142027; background: rgba(20, 32, 39, 0.075); border: 1px solid rgba(36, 53, 48, 0.1); border-radius: 6px; line-height: 1.52; }
pre code { padding: 0; background: transparent; border-radius: 0; font-size: 0.9em; }
hr { margin: 4mm 0; border: 0; border-top: 1px solid rgba(36, 53, 48, 0.16); }
.image-ref { display: inline-block; max-width: 100%; padding: 1mm 1.5mm; color: #40515c; background: rgba(31, 119, 104, 0.06); border-radius: 4px; overflow-wrap: anywhere; }
.markdown-table-wrap { border: 0; border-radius: 0; background: transparent; }
table, thead, tbody, tr, th, td { display: block; width: 100%; }
thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
tr { margin: 0 0 2.6mm; border: 1px solid rgba(36, 53, 48, 0.14); border-radius: 6px; background: rgba(255, 255, 255, 0.68); overflow: hidden; page-break-inside: avoid; break-inside: avoid; }
td { display: grid; grid-template-columns: minmax(18mm, 36%) minmax(0, 1fr); gap: 2mm; align-items: start; padding: 2mm 2.2mm; border: 0; border-bottom: 1px solid rgba(36, 53, 48, 0.11); overflow-wrap: anywhere; word-break: break-word; }
td:last-child { border-bottom: 0; }
td::before { content: attr(data-label); color: #42515c; font-size: 0.82em; font-weight: 600; line-height: 1.35; }
td[data-label=""] { grid-template-columns: 1fr; }
td[data-label=""]::before { content: none; }
</style>
</head>
<body>
<main>
<section class="document-cover">
<div class="document-kicker">Hermes Mobile / Weixin readable PDF</div>
<h1 class="document-title">${escapeHtmlForDocument(title || "Markdown")}</h1>
<div class="source">${escapeHtmlForDocument(sourcePath || "")}</div>
</section>
${rendered}
</main>
</body>
</html>`;
}

function findFirstExistingFile(paths) {
  for (const candidate of paths || []) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (_) {
      // Ignore inaccessible candidate paths.
    }
  }
  return "";
}

function renderMarkdownForwardPdf(markdownPath, workspaceId, title) {
  const source = normalizeLocalPath(markdownPath);
  if (!source || !fs.existsSync(source) || !fs.statSync(source).isFile()) return null;
  const stat = fs.statSync(source);
  if (stat.size > WEIXIN_FORWARD_MARKDOWN_MAX_BYTES) return null;
  const markdown = fs.readFileSync(source, "utf8");
  const dir = weixinMarkdownForwardDir(workspaceId);
  const stem = path.parse(safeFileName(title || source)).name || "markdown";
  const id = `${Date.now()}-${makeId("md")}`;
  const htmlPath = path.join(dir, `${id}-${stem}.html`);
  const pdfPath = path.join(dir, `${id}-${stem}.pdf`);
  fs.writeFileSync(htmlPath, markdownForwardHtml(stem, source, markdown), "utf8");
  const browser = findFirstExistingFile(chromiumExecutableCandidates()) || chromiumExecutableCandidates().find((candidate) => !path.isAbsolute(candidate));
  if (!browser) return null;
  const result = spawnSync(browser, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    `--print-to-pdf=${pdfPath}`,
    pathToFileURL(htmlPath).href,
  ], {
    windowsHide: true,
    timeout: 30000,
    stdio: "ignore",
  });
  if (result.error || result.status !== 0) return null;
  if (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).size < 500) return null;
  return pdfPath;
}

function materializeMarkdownForwardText(markdownPath, workspaceId, title) {
  const source = normalizeLocalPath(markdownPath);
  if (!source || !fs.existsSync(source) || !fs.statSync(source).isFile()) return null;
  const stat = fs.statSync(source);
  const maxBytes = Math.max(1024, WEIXIN_FORWARD_MARKDOWN_MAX_BYTES);
  if (stat.size > maxBytes) return null;
  const dir = weixinMarkdownForwardDir(workspaceId);
  const stem = path.parse(safeFileName(title || source)).name || "markdown";
  const outPath = path.join(dir, `${Date.now()}-${makeId("md")}-${stem}.txt`);
  fs.writeFileSync(outPath, fs.readFileSync(source, "utf8"), "utf8");
  return outPath;
}

function materializeWeixinForwardFile(file, workspaceId) {
  if (!isMarkdownForwardFile(file)) return file;
  const source = normalizeLocalPath(file?.localPath || "");
  const name = safeFileName(file?.name || path.basename(source || "markdown.md"));
  const pdfPath = renderMarkdownForwardPdf(source, workspaceId, name);
  const outPath = pdfPath || materializeMarkdownForwardText(source, workspaceId, name);
  if (!outPath) return file;
  const stat = fs.statSync(outPath);
  return Object.assign({}, file, {
    localPath: outPath,
    displayPath: outPath,
    name: `${path.parse(name).name || "markdown"}${path.extname(outPath).toLowerCase()}`,
    mime: mimeFor(outPath),
    size: stat.size,
    updatedAt: nowIso(),
    sourceMarkdownPath: source,
  });
}

async function resolveFileFromSourceUrlForRequest(sourceUrl, auth) {
  const raw = String(sourceUrl || "").trim();
  if (!raw) return null;
  let parsed;
  try {
    parsed = new URL(raw, "http://hermes-mobile.local");
  } catch (_) {
    return { status: 400, error: "Invalid sourceUrl" };
  }
  const artifactMatch = parsed.pathname.match(/^\/api\/artifacts\/([^/]+)$/);
  if (artifactMatch) {
    const resolved = resolveArtifactForRequest(decodeURIComponent(artifactMatch[1]), auth);
    if (!resolved.artifact) return { status: resolved.status || 404, error: resolved.error || "Artifact not found" };
    const artifact = resolved.artifact;
    return {
      file: {
        localPath: artifact.localPath || artifact.path,
        displayPath: artifact.displayPath || artifact.path || "",
        name: artifact.name || path.basename(artifact.localPath || artifact.path || "file"),
        mime: artifact.mime || mimeFor(artifact.localPath || artifact.path || ""),
        size: Number(artifact.size || 0) || 0,
        artifact,
      },
      thread: resolved.thread,
    };
  }
  if (parsed.pathname === "/api/files" || parsed.pathname === "/api/files/preview") {
    return resolveFileForBrowserRequest(parsed.searchParams, auth);
  }
  if (parsed.pathname === "/api/automations/output" || parsed.pathname === "/api/automations/output/preview") {
    const workspaceId = String(parsed.searchParams.get("workspaceId") || auth?.workspaceId || "owner").trim() || "owner";
    const resolved = await resolveAuthorizedCronOutputFile(parsed.searchParams, auth);
    return fileResultFromResolvedForwardSource(resolved, workspaceId, "Automation output not found");
  }
  if (parsed.pathname === "/api/automations/deliverable" || parsed.pathname === "/api/automations/deliverable/preview") {
    const workspaceId = String(parsed.searchParams.get("workspaceId") || auth?.workspaceId || "owner").trim() || "owner";
    const resolved = await resolveAuthorizedCronDeliverableFile(parsed.searchParams, auth);
    return fileResultFromResolvedForwardSource(resolved, workspaceId, "Automation deliverable not found");
  }
  if (parsed.pathname === "/api/kanban/cards/output" || parsed.pathname === "/api/kanban/cards/output/preview") {
    const workspaceId = String(parsed.searchParams.get("workspaceId") || auth?.workspaceId || "owner").trim() || "owner";
    const resolved = resolveKanbanOutputFile(workspaceId, parsed.searchParams.get("path") || "", auth);
    return fileResultFromResolvedForwardSource(resolved, workspaceId, "Kanban output not found");
  }
  return { status: 400, error: "Unsupported file source for Weixin forwarding" };
}

async function resolveWeixinForwardFile(body, auth) {
  const source = body && typeof body === "object" ? body : {};
  const artifactId = String(source.artifactId || source.artifact_id || "").trim();
  if (artifactId) {
    const resolved = resolveArtifactForRequest(artifactId, auth);
    if (!resolved.artifact) return { status: resolved.status || 404, error: resolved.error || "Artifact not found" };
    const artifact = resolved.artifact;
    return {
      file: {
        localPath: artifact.localPath || artifact.path,
        displayPath: artifact.displayPath || artifact.path || "",
        name: artifact.name || path.basename(artifact.localPath || artifact.path || "file"),
        mime: artifact.mime || mimeFor(artifact.localPath || artifact.path || ""),
        size: Number(artifact.size || 0) || 0,
        artifact,
      },
      thread: resolved.thread,
    };
  }
  const sourceUrl = String(source.sourceUrl || source.source_url || source.url || "").trim();
  if (sourceUrl) return resolveFileFromSourceUrlForRequest(sourceUrl, auth);
  const threadId = String(source.threadId || source.thread_id || "").trim();
  const displayPath = String(source.path || source.displayPath || source.display_path || "").trim();
  if (threadId && displayPath) {
    const params = new URLSearchParams({ threadId, path: displayPath });
    return resolveFileForBrowserRequest(params, auth);
  }
  return { status: 400, error: "Missing artifactId, sourceUrl, or threadId/path" };
}

function publicArtifactForWeixinForward(file, thread, message) {
  const localPath = normalizeLocalPath(file?.localPath || "");
  if (!localPath || !fs.existsSync(localPath)) return null;
  const stat = fs.statSync(localPath);
  const existing = file?.artifact?.id
    ? state.artifacts.find((item) => String(item.id || "") === String(file.artifact.id || ""))
    : null;
  const record = existing || {
    id: makeId("artifact"),
    path: localPath,
    displayPath: String(file.displayPath || localPath),
    name: safeFileName(file.name || localPath),
    mime: file.mime || mimeFor(localPath),
    size: stat.size,
    createdAt: nowIso(),
    workspaceId: thread.workspaceId,
    projectId: thread.projectId,
    subprojectId: thread.subprojectId || "",
    threadId: thread.id,
    messageId: message.id,
  };
  if (!existing) state.artifacts.push(record);
  return {
    id: record.id,
    name: record.name || path.basename(localPath),
    mime: record.mime || mimeFor(localPath),
    size: stat.size,
    url: `/api/artifacts/${encodeURIComponent(record.id)}`,
    path: localPath,
  };
}

async function createWeixinFileForwardDelivery(auth, body = {}) {
  const workspaceId = String(body.workspaceId || body.workspace_id || auth?.workspaceId || "owner").trim() || "owner";
  if (!authCanAccessWorkspace(auth, workspaceId)) {
    const err = new Error("Workspace access is not allowed");
    err.status = 403;
    throw err;
  }
  const resolved = await resolveWeixinForwardFile(body, auth);
  if (!resolved?.file) {
    const err = new Error(resolved?.error || "File not found");
    err.status = resolved?.status || 404;
    throw err;
  }
  const forwardFile = materializeWeixinForwardFile(resolved.file, workspaceId);
  const localPath = normalizeLocalPath(forwardFile.localPath || "");
  if (!localPath || !fs.existsSync(localPath) || !fs.statSync(localPath).isFile()) {
    const err = new Error("File not found");
    err.status = 404;
    throw err;
  }
  const target = resolveWeixinForwardTarget(body, auth, workspaceId);
  const requestedThreadId = String(body.threadId || body.thread_id || "").trim();
  const requestedThread = requestedThreadId ? findThreadForAuth(auth, requestedThreadId) : null;
  const thread = requestedThread && isWeixinSingleWindowThread(requestedThread)
    ? requestedThread
    : ensureWeixinSingleWindowThread(workspaceId, target);
  const createdAt = nowIso();
  const caption = String(body.caption ?? body.text ?? "").trim();
  const message = {
    id: makeId("msg"),
    role: "assistant",
    content: compactText(caption, 1000),
    status: "done",
    createdAt,
    updatedAt: createdAt,
    completedAt: createdAt,
    artifacts: [],
    taskGroupId: SINGLE_WINDOW_CHAT_TASK_GROUP_ID,
    messageKind: "plain",
    senderWorkspaceId: "hermes",
    senderPrincipalId: "hermes",
    senderLabel: "Hermes",
    actorWorkspaceId: workspaceId,
    singleWindowMode: "chat",
  };
  const artifact = publicArtifactForWeixinForward(forwardFile, thread, message);
  if (!artifact) {
    const err = new Error("File could not be registered for forwarding");
    err.status = 500;
    throw err;
  }
  message.artifacts = [artifact];
  message.externalDelivery = normalizeExternalDelivery({
    source: "weixin",
    deliveryId: weixinIngressProvider.deliveryId(thread.id, message.id),
    status: "pending",
    accountId: target.accountId,
    chatId: target.chatId,
    userId: target.userId,
    workspaceId,
    content: message.content,
    artifacts: message.artifacts,
    terminalStatus: "manual_forward",
    queuedAt: createdAt,
    updatedAt: createdAt,
  });
  thread.messages.push(message);
  thread.status = (thread.activeRunIds || []).length ? "running" : "idle";
  thread.updatedAt = createdAt;
  saveState();
  broadcast({ type: "thread.updated", thread: threadSummary(thread) });
  broadcast({ type: "message.updated", threadId: thread.id, message: compactMessage(message, thread), thread: threadSummary(thread) });
  return {
    ok: true,
    target,
    delivery: publicWeixinOutboundDelivery(thread, message),
    message: compactMessage(message, thread),
    thread: compactThread(thread),
  };
}

function userFacingWeixinRunError(err) {
  const raw = String(err?.message || err || "").trim();
  if (!raw) return "Hermes run failed before producing a reply.";
  if (/terminated|cancelled|canceled|aborted/i.test(raw)) {
    return "运行被终止，未生成回复。";
  }
  return raw;
}

function weixinDeliveryTimeMs(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function weixinDeliveryRetryCount(delivery) {
  return Math.max(0, Number(delivery?.retryCount || delivery?.retry_count || 0) || 0);
}

function weixinDeliveryRetryDelayMs(retryCount) {
  const exponent = Math.max(0, Math.min(8, (Number(retryCount) || 1) - 1));
  return Math.min(WEIXIN_DELIVERY_RETRY_MAX_MS, WEIXIN_DELIVERY_RETRY_BASE_MS * (2 ** exponent));
}

function isWeixinInboundWakeRequiredFailure(ack = {}) {
  const text = [
    ack?.error,
    ack?.rawStatus,
    ack?.raw_status,
    ack?.message,
  ].map((item) => String(item || "")).join("\n");
  return /(?:^|[^A-Za-z0-9_])ret(?:urn)?(?:code)?\s*[:=]\s*-2(?:[^0-9]|$)/i.test(text)
    || /(?:^|[^A-Za-z0-9_])ret\s*(?:\u7b49\u4e8e|\u4e3a|\u662f)\s*-2(?:[^0-9]|$)/i.test(text)
    || /(?:^|[^A-Za-z0-9_])ret\s+-2(?:[^0-9]|$)/i.test(text);
}

function isWeixinDeliveryRetryable(delivery, nowMs = Date.now()) {
  if (!delivery || delivery.source !== "weixin" || delivery.status !== "failed") return false;
  if (delivery.retryAfterInbound || delivery.retry_after_inbound) return false;
  if (WEIXIN_DELIVERY_RETRY_LIMIT <= 0) return false;
  const retryCount = weixinDeliveryRetryCount(delivery);
  if (retryCount >= WEIXIN_DELIVERY_RETRY_LIMIT) return false;
  const nextRetryMs = weixinDeliveryTimeMs(delivery.nextRetryAt || delivery.next_retry_at || "");
  return !nextRetryMs || nextRetryMs <= nowMs;
}

function weixinDeliveryMatchesStatusFilter(delivery, status, nowMs = Date.now()) {
  if (!delivery || delivery.source !== "weixin") return false;
  if (!status || status === "all") return true;
  if (status === "pending") return delivery.status === "pending" || isWeixinDeliveryRetryable(delivery, nowMs);
  if (status === "retryable" || status === "retry") return isWeixinDeliveryRetryable(delivery, nowMs);
  if (status === "failed") return delivery.status === "failed" || delivery.status === "waiting_inbound";
  return delivery.status === status;
}

function weixinDeliveryMatchesInboundEvent(delivery, event, workspaceId) {
  if (!delivery || !event) return false;
  const deliveryWorkspaceId = String(delivery.workspaceId || delivery.workspace_id || "").trim();
  if (deliveryWorkspaceId && workspaceId && deliveryWorkspaceId !== workspaceId) return false;
  const deliveryAccountId = String(delivery.accountId || delivery.account_id || "").trim();
  const eventAccountId = String(event.accountId || event.account_id || "").trim();
  if (deliveryAccountId && eventAccountId && deliveryAccountId !== eventAccountId) return false;
  const deliveryChatId = String(delivery.chatId || delivery.chat_id || "").trim();
  const eventChatId = String(event.chatId || event.chat_id || "").trim();
  if (deliveryChatId && eventChatId) return deliveryChatId === eventChatId;
  const deliveryUserId = String(delivery.userId || delivery.user_id || "").trim();
  const eventUserId = String(event.userId || event.user_id || "").trim();
  if (deliveryUserId && eventUserId) return deliveryUserId === eventUserId;
  const deliveryRoute = deliveryChatId || deliveryUserId;
  const eventRoute = eventChatId || eventUserId;
  if (deliveryRoute && eventRoute) return deliveryRoute === eventRoute;
  return Boolean(deliveryAccountId && eventAccountId && deliveryAccountId === eventAccountId);
}

function wakeWeixinOutboundDeliveriesForInboundEvent(event, workspaceId) {
  const awakenedAt = nowIso();
  const woke = [];
  for (const thread of state.threads || []) {
    for (const message of thread.messages || []) {
      const delivery = normalizeExternalDelivery(message?.externalDelivery || null);
      if (!delivery || delivery.source !== "weixin") continue;
      const waitingInbound = delivery.status === "waiting_inbound" || delivery.retryAfterInbound || delivery.retry_after_inbound;
      if (!waitingInbound) continue;
      if (!weixinDeliveryMatchesInboundEvent(delivery, event, workspaceId)) continue;
      message.externalDelivery = normalizeExternalDelivery(Object.assign({}, delivery, {
        status: "pending",
        retryAfterInbound: false,
        retryWakeAt: awakenedAt,
        retryWakeEventId: event?.eventId || "",
        nextRetryAt: "",
        updatedAt: awakenedAt,
      }));
      message.updatedAt = awakenedAt;
      thread.updatedAt = awakenedAt;
      woke.push({ thread, message });
    }
  }
  if (!woke.length) return { count: 0, deliveryIds: [] };
  saveState();
  const deliveryIds = [];
  for (const item of woke) {
    const publicDelivery = publicWeixinOutboundDelivery(item.thread, item.message);
    if (publicDelivery?.deliveryId) deliveryIds.push(publicDelivery.deliveryId);
    broadcast({ type: "thread.updated", thread: threadSummary(item.thread) });
    broadcast({ type: "message.updated", threadId: item.thread.id, message: compactMessage(item.message, item.thread), thread: threadSummary(item.thread) });
  }
  return { count: woke.length, deliveryIds };
}

function pendingWeixinOutboundDeliveries(filters = {}) {
  const status = String(filters.status || "pending").trim().toLowerCase();
  const accountId = String(filters.accountId || "").trim();
  const limit = Math.max(1, Math.min(100, Number(filters.limit || 20) || 20));
  const nowMs = Date.now();
  const out = [];
  for (const thread of state.threads || []) {
    for (const message of thread.messages || []) {
      const delivery = normalizeExternalDelivery(message?.externalDelivery || null);
      if (!delivery || delivery.source !== "weixin") continue;
      if (!weixinDeliveryMatchesStatusFilter(delivery, status, nowMs)) continue;
      if (accountId && delivery.accountId !== accountId) continue;
      const publicDelivery = publicWeixinOutboundDelivery(thread, message);
      if (publicDelivery) out.push(publicDelivery);
    }
  }
  return out
    .sort((a, b) => String(a.queuedAt || a.nextRetryAt || a.updatedAt).localeCompare(String(b.queuedAt || b.nextRetryAt || b.updatedAt)))
    .slice(0, limit);
}

function ackWeixinOutboundDelivery(deliveryId, ack) {
  const id = String(deliveryId || "").trim();
  if (!id) return null;
  for (const thread of state.threads || []) {
    for (const message of thread.messages || []) {
      const delivery = normalizeExternalDelivery(message?.externalDelivery || null);
      const candidateId = delivery?.deliveryId || weixinIngressProvider.deliveryId(thread.id, message.id);
      if (!delivery || candidateId !== id) continue;
      const acknowledgedAt = ack.acknowledgedAt || nowIso();
      const failureRetryCount = ack.status === "failed" ? weixinDeliveryRetryCount(delivery) + 1 : weixinDeliveryRetryCount(delivery);
      const waitForInbound = ack.status === "failed" && isWeixinInboundWakeRequiredFailure(ack);
      const retryExhausted = ack.status === "failed"
        && !waitForInbound
        && WEIXIN_DELIVERY_RETRY_LIMIT > 0
        && failureRetryCount >= WEIXIN_DELIVERY_RETRY_LIMIT;
      const retryBaseMs = weixinDeliveryTimeMs(acknowledgedAt) || Date.now();
      const nextRetryAt = ack.status === "failed" && !waitForInbound && !retryExhausted && WEIXIN_DELIVERY_RETRY_LIMIT > 0
        ? new Date(retryBaseMs + weixinDeliveryRetryDelayMs(failureRetryCount)).toISOString()
        : "";
      message.externalDelivery = normalizeExternalDelivery(Object.assign({}, delivery, {
        deliveryId: candidateId,
        status: waitForInbound ? "waiting_inbound" : ack.status,
        providerMessageId: ack.status === "sent" ? ack.providerMessageId : "",
        error: ack.status === "sent" ? "" : ack.error,
        rawStatus: ack.rawStatus,
        acknowledgedAt,
        lastAttemptAt: acknowledgedAt,
        failedAt: ack.status === "failed" ? acknowledgedAt : "",
        sentAt: ack.status === "sent" ? acknowledgedAt : "",
        retryCount: failureRetryCount,
        retryAfterInbound: waitForInbound,
        retryExhausted,
        nextRetryAt,
        updatedAt: acknowledgedAt,
      }));
      message.updatedAt = acknowledgedAt;
      thread.updatedAt = message.updatedAt;
      saveState();
      const publicDelivery = publicWeixinOutboundDelivery(thread, message);
      broadcast({ type: "thread.updated", thread: threadSummary(thread) });
      broadcast({ type: "message.updated", threadId: thread.id, message: compactMessage(message, thread), thread: threadSummary(thread) });
      return publicDelivery;
    }
  }
  return null;
}

async function startWeixinIngressEvent(body) {
  const event = weixinIngressProvider.normalizeInboundEvent(body);
  if (weixinIngressProvider.isInboundHeartbeatEvent(event)) {
    const workspaceId = weixinIngressProvider.resolveWorkspaceId(event);
    const workspace = workspaceId ? findWorkspace(workspaceId) : null;
    const awakenedOutbound = workspace ? wakeWeixinOutboundDeliveriesForInboundEvent(event, workspaceId) : { count: 0, deliveryIds: [] };
    return {
      ok: true,
      heartbeat: true,
      eventId: event.eventId,
      workspaceId: workspaceId || "",
      skipped: !workspace,
      reason: workspace ? "weixin_ingress_heartbeat" : "unmatched_workspace_route",
      awakenedOutbound,
    };
  }
  const duplicate = findExistingWeixinIngressEvent(event.eventId);
  if (duplicate) {
    const workspaceId = weixinIngressProvider.resolveWorkspaceId(event) || duplicate.thread?.workspaceId || "";
    const workspace = workspaceId ? findWorkspace(workspaceId) : null;
    const awakenedOutbound = workspace ? wakeWeixinOutboundDeliveriesForInboundEvent(event, workspaceId) : { count: 0, deliveryIds: [] };
    return {
      ok: true,
      duplicate: true,
      eventId: event.eventId,
      awakenedOutbound,
      thread: compactThread(duplicate.thread),
      message: compactMessage(duplicate.message),
    };
  }
  const workspaceId = weixinIngressProvider.resolveWorkspaceId(event);
  if (!workspaceId || !findWorkspace(workspaceId)) {
    return {
      ok: true,
      skipped: true,
      reason: "unmatched_workspace_route",
      eventId: event.eventId,
    };
  }
  const awakenedOutbound = wakeWeixinOutboundDeliveriesForInboundEvent(event, workspaceId);
  const attachmentOnly = weixinIngressIsAttachmentOnlyEvent(event);
  if (!attachmentOnly) {
    const maintenanceIntent = securityBoundaryProvider.classifyMaintenanceIntent(weixinIngressMessageContent(event));
    if (maintenanceIntent) {
      const err = new Error(maintenanceIntent.message);
      err.status = 403;
      err.result = { code: maintenanceIntent.category, operatorRequired: true };
      throw err;
    }
  }
  const thread = weixinIngressThreadForEvent(event, workspaceId);
  const taskGroupId = SINGLE_WINDOW_CHAT_TASK_GROUP_ID;
  const createdAt = nowIso();
  const senderInfo = senderInfoForWorkspace(workspaceId);
  const ingressStatus = attachmentOnly ? "waiting_instruction" : "received";
  const ingressMeta = normalizeExternalIngress(Object.assign({}, event, {
    threadKey: weixinIngressProvider.threadKey(event),
    workspaceId,
    status: ingressStatus,
    createdAt,
    updatedAt: createdAt,
  }));
  if (attachmentOnly) {
    const userMessage = {
      id: makeId("msg"),
      role: "user",
      content: weixinIngressMessageContent(event),
      status: "done",
      createdAt,
      updatedAt: createdAt,
      submittedAt: createdAt,
      artifacts: [],
      taskGroupId,
      messageKind: "ai",
      senderWorkspaceId: senderInfo.senderWorkspaceId,
      senderPrincipalId: senderInfo.senderPrincipalId,
      senderLabel: event.senderLabel || senderInfo.senderLabel,
      actorWorkspaceId: workspaceId,
      externalIngress: ingressMeta,
      singleWindowMode: "chat",
      awaitingInstruction: true,
    };
    thread.messages.push(userMessage);
    thread.status = (thread.activeRunIds || []).length ? "running" : "idle";
    thread.updatedAt = createdAt;
    saveState();
    broadcast({ type: "thread.updated", thread: threadSummary(thread) });
    broadcast({ type: "message.updated", threadId: thread.id, message: compactMessage(userMessage), thread: threadSummary(thread) });
    return {
      ok: true,
      duplicate: false,
      awaitingInstruction: true,
      eventId: event.eventId,
      awakenedOutbound,
      run: { status: "waiting_instruction", taskGroupId },
      thread: compactThread(thread),
    };
  }
  const pendingAttachmentMessages = consumeWeixinPendingAttachmentMessages(thread, event, createdAt);
  const queueBehindActiveRun = taskGroupHasRunningRun(thread, taskGroupId);
  if (!queueBehindActiveRun) {
    const concurrencyError = runConcurrencyError(workspaceId);
    if (concurrencyError) throw concurrencyError;
  }
  const userMessage = {
    id: makeId("msg"),
    role: "user",
    content: weixinIngressMessageContent(event),
    status: "done",
    createdAt,
    updatedAt: createdAt,
    submittedAt: createdAt,
    artifacts: [],
    taskGroupId,
    messageKind: "ai",
    senderWorkspaceId: senderInfo.senderWorkspaceId,
    senderPrincipalId: senderInfo.senderPrincipalId,
    senderLabel: event.senderLabel || senderInfo.senderLabel,
    actorWorkspaceId: workspaceId,
    externalIngress: ingressMeta,
    singleWindowMode: "chat",
  };
  const assistantMessage = {
    id: makeId("msg"),
    role: "assistant",
    content: "",
    status: "queued",
    runId: null,
    createdAt,
    updatedAt: createdAt,
    queuedAt: createdAt,
    artifacts: [],
    taskGroupId,
    messageKind: "ai",
    senderWorkspaceId: "hermes",
    senderPrincipalId: "hermes",
    senderLabel: "Hermes",
    actorWorkspaceId: workspaceId,
    singleWindowMode: "chat",
    externalDelivery: normalizeExternalDelivery({
      source: "weixin",
      status: "waiting",
      accountId: event.accountId,
      chatId: event.chatId,
      userId: event.userId,
      eventId: event.eventId,
      workspaceId,
      createdAt,
      updatedAt: createdAt,
    }),
  };
  const runOptions = {
    singleWindowMode: "chat",
    actorWorkspaceId: workspaceId,
    instructions: weixinIngressInstructions(event, pendingAttachmentMessages),
    gatewayRouting: {
      source: "weixin",
      workspaceId,
      accountId: event.accountId,
      chatId: event.chatId || event.userId || "",
    },
  };
  assistantMessage.runOptions = runOptions;
  thread.messages.push(userMessage, assistantMessage);
  thread.status = queueBehindActiveRun && (thread.activeRunIds || []).length ? "running" : "queued";
  thread.updatedAt = createdAt;
  saveState();
  broadcast({ type: "thread.updated", thread: threadSummary(thread) });
  broadcast({ type: "message.updated", threadId: thread.id, message: compactMessage(userMessage), thread: threadSummary(thread) });
  broadcast({ type: "message.updated", threadId: thread.id, message: compactMessage(assistantMessage), thread: threadSummary(thread) });
  if (queueBehindActiveRun) {
    return { ok: true, duplicate: false, eventId: event.eventId, awakenedOutbound, run: { status: "queued", taskGroupId }, thread: compactThread(thread) };
  }
  try {
    const run = await startRunForThread(thread, userMessage, assistantMessage, runOptions);
    return { ok: true, duplicate: false, eventId: event.eventId, awakenedOutbound, run, thread: compactThread(thread) };
  } catch (err) {
    const failedAt = nowIso();
    assistantMessage.status = "failed";
    assistantMessage.error = userFacingWeixinRunError(err);
    assistantMessage.failedAt = failedAt;
    assistantMessage.updatedAt = failedAt;
    enqueueExternalDeliveryForTerminalMessage(thread, assistantMessage, "failed");
    removeThreadActiveRun(thread, assistantMessage.runId, "failed");
    thread.updatedAt = failedAt;
    saveState();
    broadcast({ type: "run.failed", threadId: thread.id, message: compactMessage(assistantMessage), thread: threadSummary(thread) });
    return {
      ok: false,
      accepted: true,
      eventId: event.eventId,
      awakenedOutbound,
      error: assistantMessage.error,
      run: { status: "failed", taskGroupId },
      thread: compactThread(thread),
    };
  }
}

function threadSummary(thread) {
  const last = [...(thread.messages || [])].reverse().find((msg) => msg.content);
  return {
    id: thread.id,
    title: thread.title,
    workspaceId: thread.workspaceId,
    projectId: thread.projectId,
    subprojectId: thread.subprojectId || "",
    singleWindow: Boolean(thread.singleWindow),
    status: thread.status,
    activeRunId: thread.activeRunId,
    activeRunIds: Array.isArray(thread.activeRunIds) ? thread.activeRunIds : [],
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    chatGroup: publicChatGroup(thread),
    externalIngress: publicExternalIngress(thread),
    preview: last ? compactText(last.content, 180) : "",
  };
}

function taskGroupsForThread(thread) {
  const groups = new Map();
  let currentTaskGroupId = "";
  const meta = normalizeTaskGroupMeta(thread?.taskGroupMeta);
  for (const message of thread?.messages || []) {
    let groupId = message.taskGroupId || "";
    if (!groupId) groupId = currentTaskGroupId || message.taskId || `task_${message.id}`;
    currentTaskGroupId = groupId;
    if (!groups.has(groupId)) {
      const groupMeta = meta[groupId] || {};
      groups.set(groupId, {
        id: groupId,
        title: groupMeta.title || "",
        messages: [],
        createdAt: message.createdAt,
        updatedAt: groupMeta.updatedAt || message.updatedAt || message.createdAt,
      });
    }
    const group = groups.get(groupId);
    group.messages.push(message);
    const updatedAt = message.completedAt || message.failedAt || message.cancelledAt || message.updatedAt || message.createdAt || "";
    if (String(updatedAt) > String(group.updatedAt || "")) group.updatedAt = updatedAt;
  }
  return [...groups.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function messageOwnerWorkspaceId(message, fallback = "") {
  return String(
    message?.actorWorkspaceId
    || message?.senderWorkspaceId
    || message?.workspaceId
    || fallback
    || "",
  ).trim();
}

function taskGroupOwnerWorkspaceId(group, fallback = "") {
  const messages = group?.messages || [];
  const user = messages.find((message) => message.role === "user");
  return messageOwnerWorkspaceId(user || messages[0], fallback);
}

function taskGroupTaskId(group) {
  const assistant = [...(group?.messages || [])].reverse().find((message) => message.role === "assistant");
  return assistant?.taskId || assistant?.runId || group?.id || "task";
}

function taskGroupPrompt(group) {
  const user = (group?.messages || []).find((message) => message.role === "user");
  return compactText(user?.content || "", 180);
}

function taskGroupTitle(group) {
  return sanitizeTaskTitle(group?.title || "") || taskGroupPrompt(group) || taskGroupTaskId(group);
}

function taskGroupPreview(group) {
  const assistant = [...(group?.messages || [])].reverse().find((message) => message.role === "assistant" && message.content);
  return compactText(assistant?.content || "", 180) || taskGroupPrompt(group) || "No summary yet";
}

function taskGroupStatus(group) {
  if ((group?.messages || []).some((message) => message.status === "running" || message.status === "queued")) return "running";
  if ((group?.messages || []).some((message) => message.status === "failed")) return "failed";
  if ((group?.messages || []).some((message) => message.status === "cancelled")) return "cancelled";
  return "done";
}

function taskGroupHaystack(group) {
  const parts = [group?.id || "", group?.title || "", taskGroupTaskId(group)];
  for (const message of group?.messages || []) {
    parts.push(message.content || "", message.taskId || "", message.runId || "");
    if (message.directoryRoute) {
      parts.push(message.directoryRoute.label || "", message.directoryRoute.path || "", message.directoryRoute.root || "");
    }
    for (const alias of Array.isArray(message.directoryAliases) ? message.directoryAliases : []) {
      parts.push(alias?.label || "", alias?.path || "", alias?.root || "");
    }
    for (const artifact of Array.isArray(message.artifacts) ? message.artifacts : []) {
      parts.push(artifact.name || "", artifact.path || "", artifact.displayPath || "", artifact.url || "");
    }
  }
  return parts.join("\n");
}

function textIncludesPath(text, root) {
  const raw = String(text || "").replaceAll("\\", "/").toLowerCase();
  const original = String(root || "").replaceAll("\\", "/").replace(/\/+$/g, "").toLowerCase();
  const comparable = comparablePath(root);
  return Boolean(
    original && raw.includes(original) ||
    comparable && raw.includes(comparable)
  );
}

function taskGroupMatchesProject(group, project, subproject = null) {
  const target = subproject || project;
  if (!target) return false;
  const haystack = taskGroupHaystack(group);
  if (target.root && textIncludesPath(haystack, target.root)) return true;
  if (!subproject && project?.root && textIncludesPath(haystack, project.root)) return true;
  const normalized = searchableText(haystack);
  for (const label of projectSearchLabels(target, subproject && project ? project.label || "" : "")) {
    const key = searchableText(label);
    if (key.length >= 2 && normalized.includes(key)) return true;
  }
  return false;
}

function singleWindowProjectTaskSummaries(workspaceId, project, subproject, search = "") {
  if (!workspaceId || !project || project.id === SINGLE_WINDOW_PROJECT_ID) return [];
  const lowerSearch = String(search || "").trim().toLowerCase();
  const out = [];
  for (const thread of state.threads) {
    if (!thread.singleWindow || thread.workspaceId !== workspaceId) continue;
    for (const group of taskGroupsForThread(thread)) {
      if (taskGroupOwnerWorkspaceId(group, thread.workspaceId) !== workspaceId) continue;
      if (!taskGroupMatchesProject(group, project, subproject)) continue;
      const haystack = `${taskGroupTaskId(group)}\n${taskGroupPrompt(group)}\n${taskGroupPreview(group)}\n${taskGroupHaystack(group)}`.toLowerCase();
      if (lowerSearch && !haystack.includes(lowerSearch)) continue;
      out.push({
        id: `single-task:${thread.id}:${group.id}`,
        title: taskGroupTitle(group),
        workspaceId: thread.workspaceId,
        projectId: project.id,
        subprojectId: subproject?.id || "",
        singleWindowTask: true,
        sourceThreadId: thread.id,
        taskGroupId: group.id,
        status: taskGroupStatus(group),
        activeRunId: "",
        activeRunIds: [],
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        preview: taskGroupPreview(group),
      });
    }
  }
  return out;
}

function clampPositiveInteger(value, fallback, maxValue = 500) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(maxValue, Math.max(1, Math.floor(parsed)));
}

function messagesForThreadMode(thread, options = {}) {
  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  const mode = String(options.mode || options.messageMode || "").trim().toLowerCase();
  if (mode === "tasks" || mode === "task") {
    const taskGroupId = String(options.taskGroupId || options.task_group_id || "").trim();
    return messages.filter((message) => {
      const groupId = String(message?.taskGroupId || "");
      if (isSingleWindowConversationTaskGroupId(groupId)) return false;
      return !taskGroupId || groupId === taskGroupId;
    });
  }
  if (mode !== "chat") return messages;
  const taskGroupId = messagePageTaskGroupId(options);
  return messages.filter((message) => String(message?.taskGroupId || "") === taskGroupId);
}

function messagePageTaskGroupId(options = {}) {
  return String(
    options.taskGroupId
    || options.task_group_id
    || (options.groupChat ? SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID : SINGLE_WINDOW_CHAT_TASK_GROUP_ID),
  ).trim() || SINGLE_WINDOW_CHAT_TASK_GROUP_ID;
}

function threadMessagesPage(thread, options = {}) {
  const limit = clampPositiveInteger(options.limit, THREAD_MESSAGE_INITIAL_LIMIT, 300);
  const allMessages = messagesForThreadMode(thread, options);
  const mode = String(options.mode || options.messageMode || "all").trim().toLowerCase();
  const beforeId = String(options.before || options.beforeMessageId || options.before_message_id || "").trim();
  const beforeIndex = beforeId ? allMessages.findIndex((message) => String(message?.id || "") === beforeId) : -1;
  const end = beforeIndex >= 0 ? beforeIndex : allMessages.length;
  const start = Math.max(0, end - limit);
  const messages = allMessages.slice(start, end);
  return {
    messages,
    page: {
      mode: mode || "all",
      taskGroupId: mode === "chat"
        ? messagePageTaskGroupId(options)
        : String(options.taskGroupId || options.task_group_id || "").trim(),
      total: allMessages.length,
      limit,
      loaded: messages.length,
      hasMoreBefore: start > 0,
      oldestMessageId: messages[0]?.id || "",
      newestMessageId: messages[messages.length - 1]?.id || "",
      before: beforeId,
    },
  };
}

function messageSearchText(message = {}) {
  const artifacts = Array.isArray(message.artifacts)
    ? message.artifacts.map((artifact) => [
      artifact?.name,
      artifact?.path,
      artifact?.mime,
    ].filter(Boolean).join(" ")).join("\n")
    : "";
  return [
    message.role,
    message.content,
    message.error,
    artifacts,
  ].filter(Boolean).join("\n").toLowerCase();
}

function searchThreadMessages(thread, options = {}) {
  const query = String(options.search || options.q || "").trim().toLowerCase();
  const limit = clampPositiveInteger(options.limit, THREAD_MESSAGE_SEARCH_LIMIT, 300);
  if (!query) {
    return {
      messages: [],
      page: {
        mode: String(options.mode || options.messageMode || "chat"),
        search: "",
        totalMatches: 0,
        limit,
        hasMoreMatches: false,
      },
    };
  }
  const allMessages = messagesForThreadMode(thread, options);
  const matches = allMessages.filter((message) => messageSearchText(message).includes(query));
  return {
    messages: matches.slice(0, limit),
    page: {
      mode: String(options.mode || options.messageMode || "chat"),
      taskGroupId: messagePageTaskGroupId(options),
      search: query,
      total: allMessages.length,
      totalMatches: matches.length,
      limit,
      hasMoreMatches: matches.length > limit,
      oldestMessageId: matches[0]?.id || "",
      newestMessageId: matches[Math.min(matches.length, limit) - 1]?.id || "",
    },
  };
}

function compactThread(thread, options = {}) {
  const messagePage = options.messagePage || null;
  const messages = Array.isArray(options.messages) ? options.messages : (thread.messages || []);
  return {
    id: thread.id,
    title: thread.title,
    workspaceId: thread.workspaceId,
    projectId: thread.projectId,
    subprojectId: thread.subprojectId || "",
    singleWindow: Boolean(thread.singleWindow),
    hermesSessionId: thread.hermesSessionId,
    status: thread.status,
    activeRunId: thread.activeRunId,
    activeRunIds: Array.isArray(thread.activeRunIds) ? thread.activeRunIds : [],
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    taskGroupMeta: normalizeTaskGroupMeta(thread.taskGroupMeta),
    chatGroup: publicChatGroup(thread),
    externalIngress: publicExternalIngress(thread),
    messages: messages.map((message) => compactMessage(message, thread)),
    messagesPage: messagePage,
    events: (thread.events || []).slice(-MAX_STORED_EVENTS_PER_THREAD),
  };
}

function compactThreadWithMessagePage(thread, options = {}) {
  const page = threadMessagesPage(thread, options);
  return compactThread(thread, { messages: page.messages, messagePage: page.page });
}

function compactMessage(message, thread = null) {
  thread = thread || findThreadForMessage(message);
  const gatewayRouting = message.runOptions?.gatewayRouting || {};
  return {
    id: message.id,
    role: message.role,
    content: compactText(message.content || "", MAX_API_TEXT_CHARS),
    status: message.status || "done",
    runId: message.runId || null,
    taskId: message.taskId || null,
    taskGroupId: message.taskGroupId || "",
    messageKind: message.messageKind || "ai",
    actorWorkspaceId: message.actorWorkspaceId || "",
    senderWorkspaceId: message.senderWorkspaceId || "",
    senderPrincipalId: message.senderPrincipalId || "",
    senderLabel: message.senderLabel || "",
    replyToMessageId: message.replyToMessageId || "",
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    submittedAt: message.submittedAt || null,
    queuedAt: message.queuedAt || null,
    startedAt: message.startedAt || null,
    firstFeedbackAt: message.firstFeedbackAt || null,
    completedAt: message.completedAt || null,
    failedAt: message.failedAt || null,
    cancelledAt: message.cancelledAt || null,
    revokedAt: message.revokedAt || null,
    revokedByWorkspaceId: message.revokedByWorkspaceId || "",
    revokedByPrincipalId: message.revokedByPrincipalId || "",
    revokedByLabel: message.revokedByLabel || "",
    usage: message.usage || null,
    error: message.error || null,
    artifacts: compactArtifactsForMessage(message, thread),
    directoryAliases: Array.isArray(message.directoryAliases) ? message.directoryAliases : [],
    directoryRoute: message.directoryRoute || null,
    reasoningEffort: message.reasoningEffort || "",
    gatewayName: message.gatewayName || "",
    gatewayProfile: message.gatewayProfile || "",
    gatewaySource: message.gatewaySource || "",
    gatewaySecurityLevel: gatewayRouting.securityLevel || gatewayRouting.security_level || "",
    gatewayMaintenance: Boolean(gatewayRouting.maintenance || gatewayRouting.allowMaintenance || gatewayRouting.allow_maintenance),
    gatewayMaintenanceCategory: gatewayRouting.maintenanceCategory || gatewayRouting.maintenance_category || "",
    externalDelivery: message.externalDelivery?.source === "weixin" && thread ? publicWeixinOutboundDelivery(thread, message) : null,
    elevationRequired: Boolean(message.elevationRequired),
    elevationScope: message.elevationScope || "",
    elevationReason: message.elevationReason || "",
    elevationSource: message.elevationSource || "",
    truncated: typeof message.content === "string" && message.content.length > MAX_API_TEXT_CHARS,
  };
}

function compactText(value, maxChars) {
  const text = String(value || "");
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.45);
  const tail = maxChars - head;
  return `${text.slice(0, head)}\n\n[truncated: ${text.length} chars total]\n\n${text.slice(-tail)}`;
}

function compactEventPreview(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value || "");
  }
}

function addThreadEvent(thread, event) {
  thread.events = thread.events || [];
  thread.events.push({
    event: String(event.event || event.type || "event"),
    timestamp: event.timestamp || Date.now() / 1000,
    runId: event.runId || event.run_id || null,
    tool: event.tool || null,
    preview: compactText(compactEventPreview(event.preview || event.text || event.error || ""), MAX_EVENT_PREVIEW_CHARS),
    duration: event.duration || null,
    error: Boolean(event.error),
  });
  if (thread.events.length > MAX_STORED_EVENTS_PER_THREAD) {
    thread.events = thread.events.slice(-MAX_STORED_EVENTS_PER_THREAD);
  }
}

function broadcast(payload) {
  const body = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of [...clients]) {
    if (!clientCanReceivePayload(client, payload)) continue;
    const res = client.res || client;
    try {
      res.write(body);
    } catch (_) {
      clients.delete(client);
    }
  }
}

function payloadWorkspaceId(payload) {
  return String(
    payload?.workspaceId
      || payload?.thread?.workspaceId
      || payload?.message?.workspaceId
      || payload?.todo?.workspaceId
      || "",
  );
}

function clientCanReceivePayload(client, payload) {
  const auth = client?.auth || { ok: true, role: "owner", isOwner: true };
  if (isOwnerAuth(auth)) return true;
  const threadId = payload?.threadId || payload?.thread?.id || payload?.message?.threadId || "";
  if (threadId) {
    const thread = state.threads.find((item) => item.id === String(threadId));
    if (thread) return threadAccessibleToAuth(auth, thread);
  }
  const workspaceId = payloadWorkspaceId(payload);
  if (workspaceId) return authCanAccessWorkspace(auth, workspaceId);
  return true;
}

function pushSubscriptionCount() {
  return (state.pushSubscriptions || []).filter((item) => item && !item.disabledAt).length;
}

function publicPushStatus() {
  return {
    enabled: Boolean(webPushConfig),
    publicKey: webPushConfig?.publicKey || "",
    subject: webPushConfig?.subject || "",
    subscriptionCount: pushSubscriptionCount(),
  };
}

function recordPushReceipt(body = {}) {
  const normalized = normalizePushReceipt(Object.assign({}, body, {
    id: makeId("receipt"),
    receivedAt: nowIso(),
  }));
  if (!normalized) return null;
  state.pushReceipts = [...(state.pushReceipts || []), normalized].slice(-200);
  saveState();
  if (normalized.markKey && normalized.principalId) {
    markTodoWebPush({
      markKey: normalized.markKey,
      todoId: normalized.todoId,
      principalId: normalized.principalId,
      messageType: normalized.messageType || "message",
    }, normalized.shown ? "shown" : "receipt_failed", {
      countAttempt: false,
      error: normalized.error || "",
    }).catch((err) => {
      console.error(`Hermes Todo Web Push receipt mark failed: ${err.message || String(err)}`);
    });
  }
  return normalized;
}

function savePushSubscription(subscription, meta = {}) {
  const workspaceId = String(meta.workspaceId || "").trim();
  const principalId = String(meta.principalId || (workspaceId ? workspacePrincipal(workspaceId) : "") || "").trim();
  const normalized = normalizePushSubscription({
    subscription,
    deviceLabel: meta.deviceLabel,
    userAgent: meta.userAgent,
    workspaceIds: workspaceId ? [workspaceId] : [],
    principalIds: principalId ? [principalId] : [],
  });
  if (!normalized) throw new Error("Invalid push subscription");
  state.pushSubscriptions = state.pushSubscriptions || [];
  const index = state.pushSubscriptions.findIndex((item) => item.endpointHash === normalized.endpointHash);
  if (index >= 0) {
    const existing = state.pushSubscriptions[index];
    state.pushSubscriptions[index] = Object.assign({}, state.pushSubscriptions[index], normalized, {
      createdAt: existing.createdAt || normalized.createdAt,
      updatedAt: nowIso(),
      disabledAt: null,
      lastError: null,
      principalIds: normalized.principalIds || [],
      workspaceIds: normalized.workspaceIds || [],
    });
  } else {
    state.pushSubscriptions.push(normalized);
  }
  saveState();
  const saved = state.pushSubscriptions.find((item) => item.endpointHash === normalized.endpointHash) || normalized;
  return {
    id: saved.id,
    endpointHash: saved.endpointHash,
    principalIds: saved.principalIds || [],
    workspaceIds: saved.workspaceIds || [],
  };
}

function removePushSubscription(subscriptionOrEndpoint) {
  const endpoint = typeof subscriptionOrEndpoint === "string"
    ? subscriptionOrEndpoint
    : String(subscriptionOrEndpoint?.endpoint || "");
  if (!endpoint) return false;
  const hash = hashValue(endpoint);
  const before = (state.pushSubscriptions || []).length;
  state.pushSubscriptions = (state.pushSubscriptions || []).filter((item) => item.endpointHash !== hash);
  if (state.pushSubscriptions.length !== before) saveState();
  return state.pushSubscriptions.length !== before;
}

async function sendPushNotification(payload, options = {}) {
  if (!webPushConfig) return { enabled: false, attempted: 0, sent: 0, failed: 0, removed: 0 };
  const targetPrincipals = normalizeStringList(options.principalIds || options.principalId || []);
  const subscriptions = (state.pushSubscriptions || []).filter((item) => {
    if (!item || item.disabledAt || !item.subscription?.endpoint) return false;
    if (!targetPrincipals.length) return true;
    const principals = normalizeStringList(item.principalIds || "owner");
    return principals.some((principal) => targetPrincipals.includes(principal));
  });
  let sent = 0;
  let failed = 0;
  let removed = 0;
  const now = nowIso();
  const body = JSON.stringify(payload);
  for (const item of subscriptions) {
    try {
      await webpush.sendNotification(item.subscription, body, {
        TTL: options.ttl || 60 * 60,
        urgency: options.urgency || "normal",
      });
      item.lastSuccessAt = now;
      item.lastError = null;
      item.updatedAt = now;
      sent += 1;
    } catch (err) {
      failed += 1;
      item.lastError = err.message || String(err);
      item.updatedAt = now;
      if (err.statusCode === 404 || err.statusCode === 410) {
        item.disabledAt = now;
        removed += 1;
      }
    }
  }
  const result = { enabled: true, attempted: subscriptions.length, sent, failed, removed };
  state.pushDeliveries = [...(state.pushDeliveries || []), normalizePushDelivery({
    id: makeId("pushdel"),
    sentAt: now,
    payload,
    principalIds: targetPrincipals,
    result,
  })].filter(Boolean).slice(-200);
  saveState();
  return result;
}

function appRouteUrl(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const text = String(value ?? "").trim();
    if (text) query.set(key, text);
  }
  const serialized = query.toString();
  return serialized ? `/?${serialized}` : "/";
}

function taskDetailUrl(thread, message) {
  return appRouteUrl({
    view: "tasks",
    workspaceId: thread?.workspaceId || "owner",
    taskGroupId: message?.taskGroupId || "",
    messageId: message?.id || "",
  });
}

function terminalNotificationRoute(thread, message) {
  const workspaceId = thread?.workspaceId || "owner";
  if (thread?.singleWindow && message?.taskGroupId === SINGLE_WINDOW_CHAT_TASK_GROUP_ID) {
    const params = { view: "single", workspaceId };
    if (isWeixinSingleWindowThread(thread)) params.weixinChat = "1";
    return {
      url: appRouteUrl(params),
      viewMode: "single",
    };
  }
  return {
    url: taskDetailUrl(thread, message),
    viewMode: "tasks",
  };
}

function todoDetailUrl(event) {
  const principalId = event?.principalId || "";
  return appRouteUrl({
    view: "todos",
    workspaceId: event?.workspaceId || workspaceIdForPrincipal(principalId),
    todoId: event?.todoId || "",
    messageType: event?.messageType || "",
    localDate: event?.localDate || "",
  });
}

function taskPromptForMessage(thread, message) {
  const taskGroupId = message?.taskGroupId || "";
  const user = [...(thread.messages || [])]
    .reverse()
    .find((item) => item.role === "user" && (!taskGroupId || item.taskGroupId === taskGroupId));
  return compactText(String(user?.content || thread.title || "Hermes task"), 120).replace(/\s+/g, " ").trim();
}

function notificationBodyForMessage(thread, message, fallback) {
  const prompt = taskPromptForMessage(thread, message);
  const summary = compactText(String(message?.content || "").replace(/^Task ID:\s*\S+/i, "").trim(), 140)
    .replace(/MEDIA:\s*\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return summary || prompt || fallback;
}

function normalizeMentionAlias(value) {
  return String(value || "")
    .replace(/^@+/, "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

function trimMentionToken(value) {
  return String(value || "")
    .replace(/^[\s@]+/, "")
    .replace(/[.,，。!！?？:：;；、)）\]】}>"'`]+$/g, "")
    .trim();
}

function groupMentionCandidates(thread) {
  return chatGroupMemberWorkspaceIds(thread).map((workspaceId) => {
    const workspace = findWorkspace(workspaceId) || {};
    const principalId = workspacePrincipal(workspaceId);
    const label = workspaceLabel(workspaceId);
    const aliases = dedupe([
      workspaceId,
      principalId,
      label,
      workspace.label,
      workspace.name,
    ].map((item) => String(item || "").trim()).filter(Boolean));
    return { workspaceId, principalId, label, aliases };
  });
}

function groupMentionWorkspaceIds(thread, text, senderWorkspaceId = "") {
  const candidates = groupMentionCandidates(thread);
  if (!candidates.length || !String(text || "").includes("@")) return [];
  const byAlias = new Map();
  for (const candidate of candidates) {
    for (const alias of candidate.aliases || []) {
      const normalized = normalizeMentionAlias(alias);
      if (normalized) byAlias.set(normalized, candidate.workspaceId);
    }
  }
  const mentioned = new Set();
  const source = String(text || "").replace(/\u00a0/g, " ");
  const tokenPattern = /@([^\s@]{1,80})/g;
  let match = null;
  while ((match = tokenPattern.exec(source))) {
    const token = normalizeMentionAlias(trimMentionToken(match[1] || ""));
    const workspaceId = token ? byAlias.get(token) : "";
    if (workspaceId && workspaceId !== senderWorkspaceId) mentioned.add(workspaceId);
  }
  return [...mentioned];
}

function notifyGroupChatMentions(thread, userMessage) {
  if (!thread?.singleWindow || userMessage?.taskGroupId !== SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID) {
    return Promise.resolve([]);
  }
  const mentionedWorkspaceIds = groupMentionWorkspaceIds(thread, userMessage.content || "", userMessage.senderWorkspaceId || "");
  if (!mentionedWorkspaceIds.length) return Promise.resolve([]);
  const senderLabel = userMessage.senderLabel || workspaceLabel(userMessage.senderWorkspaceId || "") || "Hermes Mobile";
  const body = compactText(String(userMessage.content || "").replace(/\s+/g, " ").trim(), 180);
  const jobs = mentionedWorkspaceIds.map((workspaceId) => {
    const principalId = workspacePrincipal(workspaceId);
    return sendPushNotification({
      title: "群聊 @你",
      body: `${senderLabel}: ${body || "有人在群聊中提到了你"}`,
      tag: `hermes-group-mention-${thread.id}-${userMessage.id}-${workspaceId}`,
      renotify: true,
      requireInteraction: true,
      silent: false,
      timestamp: Date.now(),
      vibrate: [200, 100, 200],
      data: {
        url: appRouteUrl({ view: "single", workspaceId, groupChat: "1", threadId: thread.id, messageId: userMessage.id }),
        viewMode: "single",
        workspaceId,
        principalId,
        messageType: "group_mention",
        threadId: thread.id,
        messageId: userMessage.id,
        senderWorkspaceId: userMessage.senderWorkspaceId || "",
        requireInteraction: true,
      },
    }, {
      principalIds: [principalId],
      urgency: "high",
      ttl: 24 * 60 * 60,
    });
  });
  return Promise.all(jobs).catch((err) => {
    console.error(`Hermes group mention Web Push send failed: ${err.message || String(err)}`);
    return [];
  });
}

function groupMessageRevoker(auth) {
  const workspaceId = isOwnerAuth(auth) ? "owner" : String(auth?.workspaceId || "").trim();
  return senderInfoForWorkspace(workspaceId || "owner");
}

function canRevokeGroupChatMessage(auth, thread, message) {
  if (!auth?.ok || !thread?.singleWindow || !message) return false;
  if (message.role !== "user") return false;
  if (message.taskGroupId !== SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID) return false;
  if (message.revokedAt) return false;
  if (isOwnerAuth(auth)) return true;
  const workspaceId = String(auth.workspaceId || "").trim();
  return Boolean(workspaceId && workspaceId === String(message.senderWorkspaceId || "").trim());
}

function groupAssistantReplyForUserMessage(thread, userMessage) {
  const messages = thread?.messages || [];
  const index = messages.findIndex((message) => message.id === userMessage?.id);
  if (index < 0) return null;
  const assistant = messages[index + 1];
  if (
    assistant?.role === "assistant"
    && assistant.taskGroupId === SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID
    && assistant.messageKind !== "plain"
  ) {
    return assistant;
  }
  return null;
}

function revokeGroupMessagePayload(message, now, revoker, text) {
  message.content = text || GROUP_MESSAGE_REVOKED_TEXT;
  message.revokedAt = now;
  message.revokedByWorkspaceId = revoker.senderWorkspaceId || "";
  message.revokedByPrincipalId = revoker.senderPrincipalId || "";
  message.revokedByLabel = revoker.senderLabel || "";
  message.error = null;
  message.artifacts = [];
  message.usage = null;
  message.directoryAliases = [];
  message.directoryRoute = null;
  message.updatedAt = now;
}

function notifyTaskTerminal(thread, message, status) {
  if (thread?.singleWindow && message?.taskGroupId === SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID) return;
  const principalId = workspacePrincipal(thread.workspaceId || "owner");
  const workspaceId = thread.workspaceId || workspaceIdForPrincipal(principalId) || "owner";
  const messageType = status === "failed" ? "task_failed" : "task_completed";
  const title = status === "failed" ? "\u4efb\u52a1\u5931\u8d25" : "\u4efb\u52a1\u5b8c\u6210";
  const fallback = status === "failed" ? (message.error || "Task failed") : "Task completed";
  const body = notificationBodyForMessage(thread, message, fallback);
  const route = terminalNotificationRoute(thread, message);
  sendPushNotification({
    title,
    body,
    tag: `hermes-task-${message.id || message.runId || Date.now()}`,
    renotify: true,
    requireInteraction: true,
    silent: false,
    timestamp: Date.now(),
    vibrate: [200, 100, 200],
    data: {
      url: route.url,
      viewMode: route.viewMode,
      workspaceId,
      principalId,
      messageType,
      threadId: thread.id,
      taskGroupId: message.taskGroupId || "",
      messageId: message.id,
      runId: message.runId || "",
      status,
      requireInteraction: true,
    },
  }, {
    principalIds: [principalId],
    urgency: "high",
    ttl: 24 * 60 * 60,
  }).catch((err) => {
    console.error(`Hermes Mobile Push send failed: ${err.message || String(err)}`);
  });
}

function activePushPrincipals() {
  const principals = new Set();
  for (const item of state.pushSubscriptions || []) {
    if (!item || item.disabledAt || !item.subscription?.endpoint) continue;
    for (const principal of normalizeStringList(item.principalIds || "owner")) principals.add(principal);
  }
  return [...principals];
}

function confirmedTodoPushMarkKeys() {
  const keys = new Set();
  for (const receipt of state.pushReceipts || []) {
    if (!receipt || receipt.shown === false) continue;
    const markKey = String(receipt.markKey || "").trim();
    if (!markKey) continue;
    keys.add(markKey);
  }
  return [...keys];
}

function todoPushPayload(event) {
  const principalId = event?.principalId || "";
  const workspaceId = event?.workspaceId || workspaceIdForPrincipal(principalId);
  const todoId = event?.todoId || "";
  const messageType = event?.messageType || "";
  const title = compactText(event?.title || "待办提醒", 80) || "待办提醒";
  const body = compactText(event?.body || "", 220).replace(/\s+/g, " ").trim() || "待办有更新";
  return {
    title,
    body,
    tag: event?.tag || `hermes-todo-${event?.markKey || event?.todoId || Date.now()}`,
    renotify: true,
    requireInteraction: true,
    silent: false,
    timestamp: Date.now(),
    vibrate: [200, 100, 200],
    data: Object.assign({}, event?.data || {}, {
      url: todoDetailUrl(Object.assign({}, event, { workspaceId, principalId, todoId, messageType })),
      viewMode: "todos",
      workspaceId,
      todoId,
      principalId,
      messageType,
      localDate: event?.localDate || "",
      markKey: event?.markKey || "",
      requireInteraction: true,
    }),
  };
}

async function markTodoWebPush(event, status, options = {}) {
  if (!event?.markKey || !event?.principalId) return null;
  return todoProvider.markWebPush({
    markKey: event.markKey,
    todoId: event.todoId || "",
    principalId: event.principalId,
    messageType: event.messageType || "message",
    localDate: event.localDate || "",
    status: status || "sent",
    countAttempt: options.countAttempt !== false,
    error: options.error || "",
  }).catch((err) => {
    console.error(`Hermes Todo Web Push mark failed: ${err.message || String(err)}`);
    return null;
  });
}

async function deliverTodoWebPushEvent(event) {
  const result = await sendPushNotification(todoPushPayload(event), {
    principalId: event.principalId,
    urgency: event.urgency || "high",
    ttl: 24 * 60 * 60,
  });
  if (result.attempted > 0) {
    await markTodoWebPush(event, result.sent > 0 ? "sent" : "failed");
  }
  return Object.assign({}, result, {
    markKey: event.markKey || "",
    principalId: event.principalId || "",
    messageType: event.messageType || "",
  });
}

async function runTodoWebPushTick(options = {}) {
  if (!TODO_WEB_PUSH_ENABLED) return { ok: true, enabled: false, events: [], deliveries: [] };
  const principals = activePushPrincipals();
  const reconcileResults = [];
  if (useKanbanTodoBackend()) {
    const workspaceIds = dedupe((principals.length ? principals : ["owner"]).map((principalId) => workspaceIdForPrincipal(principalId))).slice(0, 20);
    for (const workspaceId of workspaceIds) {
      try {
        reconcileResults.push(await maybeReconcileKanbanDependencyBlocks(workspaceId, { limit: 500 }));
      } catch (err) {
        reconcileResults.push({ ok: false, workspaceId, error: err.message || String(err) });
      }
    }
  }
  if (!webPushConfig || !principals.length) {
    return { ok: true, enabled: Boolean(webPushConfig), principals, reconcileResults, events: [], deliveries: [] };
  }
  const pending = await todoProvider.pendingPushes({
    sourcePrincipal: "owner",
    principals,
    limit: options.limit || 100,
    recentCreateMinutes: TODO_WEB_PUSH_RECENT_CREATE_MINUTES,
    confirmedMarkKeys: confirmedTodoPushMarkKeys(),
    retryWithoutReceiptMinutes: TODO_WEB_PUSH_RECEIPT_RETRY_MINUTES,
    retryLimit: TODO_WEB_PUSH_RECEIPT_RETRY_LIMIT,
    blockedNotificationDelayMinutes: KANBAN_BLOCKED_PUSH_DELAY_MINUTES,
  });
  const events = Array.isArray(pending.events) ? pending.events : [];
  if (options.dryRun) {
    return {
      ok: true,
      enabled: true,
      principals,
      events: events.map((event) => Object.assign({}, event, { payload: todoPushPayload(event) })),
      reconcileResults,
      deliveries: [],
    };
  }
  const deliveries = [];
  for (const event of events) {
    try {
      deliveries.push(await deliverTodoWebPushEvent(event));
    } catch (err) {
      deliveries.push({
        markKey: event?.markKey || "",
        principalId: event?.principalId || "",
        messageType: event?.messageType || "",
        error: err.message || String(err),
      });
    }
  }
  return { ok: true, enabled: true, principals, reconcileResults, events, deliveries };
}

function startTodoWebPushDispatcher() {
  const interval = Math.max(15000, Number(TODO_WEB_PUSH_INTERVAL_MS) || 60000);
  if (!TODO_WEB_PUSH_ENABLED) return;
  const tick = () => {
    if (todoWebPushRunning) return;
    todoWebPushRunning = true;
    runTodoWebPushTick()
      .catch((err) => console.error(`Hermes Todo Web Push tick failed: ${err.message || String(err)}`))
      .finally(() => {
        todoWebPushRunning = false;
      });
  };
  scheduleBackgroundWebPushDispatcher(tick, interval, TODO_WEB_PUSH_START_DELAY_MS);
}

function scheduleBackgroundWebPushDispatcher(tick, interval, initialDelay) {
  const startDelay = Math.max(0, Number(initialDelay) || 0);
  setTimeout(() => {
    tick();
    setInterval(tick, interval);
  }, startDelay);
}

function automationOwnerPrincipal(job) {
  return String(job?.ownerPrincipalId || "").trim() || "owner";
}

function workspaceIdForPrincipal(principalId) {
  const principal = String(principalId || "owner").trim() || "owner";
  const workspace = loadCatalog().workspaces.find((item) => {
    const itemPrincipal = String(item?.policy?.principal_id || item?.id || "").trim() || "owner";
    return item.id === principal || itemPrincipal === principal;
  });
  return workspace?.id || (principal === "owner" ? "owner" : principal);
}

function automationTitleForPush(job) {
  return compactText(job?.name || job?.id || "Hermes CRON", 120).replace(/\s+/g, " ").trim() || "Hermes CRON";
}

function automationTimeMs(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function automationDeliverableExtension(doc) {
  return path.extname(String(doc?.name || "")).toLowerCase();
}

function automationDeliverableTimeMs(doc) {
  return Math.max(
    automationTimeMs(doc?.runOutputUpdatedAt),
    automationTimeMs(doc?.updatedAt),
  );
}

function automationLatestDeliverableTimeMs(job) {
  return Math.max(0, ...(Array.isArray(job?.outputDocuments) ? job.outputDocuments : []).map(automationDeliverableTimeMs));
}

function automationListSortByLatestDeliverable(left, right) {
  const leftDelivery = automationLatestDeliverableTimeMs(left);
  const rightDelivery = automationLatestDeliverableTimeMs(right);
  if (leftDelivery !== rightDelivery) return rightDelivery - leftDelivery;
  const leftNext = automationTimeMs(left?.nextRunAt);
  const rightNext = automationTimeMs(right?.nextRunAt);
  if (Boolean(leftNext) !== Boolean(rightNext)) return leftNext ? -1 : 1;
  if (leftNext && rightNext && leftNext !== rightNext) return leftNext - rightNext;
  return String(left?.name || left?.id || "").localeCompare(String(right?.name || right?.id || ""));
}

function automationPushMarkDeliverableTimeMs(mark) {
  if (!mark || typeof mark !== "object") return 0;
  return Math.max(
    automationTimeMs(mark.deliverableTimeAt),
    automationTimeMs(mark.deliverableUpdatedAt),
    automationTimeMs(mark.runOutputUpdatedAt),
  );
}

function automationLatestDeliverableForPush(job, existingMark = null) {
  const lastRunMs = automationTimeMs(job?.lastRunAt);
  if (!lastRunMs) return null;
  const previousDeliverableMs = automationPushMarkDeliverableTimeMs(existingMark);
  const nowWithGrace = Date.now() + AUTOMATION_PUSH_DELIVERABLE_FUTURE_GRACE_MS;
  const candidates = (Array.isArray(job?.outputDocuments) ? job.outputDocuments : [])
    .filter((doc) => {
      const ext = automationDeliverableExtension(doc);
      if (!AUTOMATION_PUSH_DELIVERABLE_EXTENSIONS.has(ext)) return false;
      if (!doc?.url || Number(doc?.size || 0) <= 0) return false;
      const docTimeMs = automationDeliverableTimeMs(doc);
      if (!docTimeMs) return false;
      // Web Push is tied to delivery-file freshness, not CRON execution time.
      // A silent CRON run that only advances lastRunAt must not re-notify for the
      // same unchanged Markdown/PDF/Office file.
      if (previousDeliverableMs && docTimeMs <= previousDeliverableMs) return false;
      if (docTimeMs < lastRunMs - AUTOMATION_PUSH_DELIVERABLE_LOOKBACK_MS) return false;
      if (docTimeMs > nowWithGrace) return false;
      return true;
    })
    .sort((left, right) => automationDeliverableTimeMs(right) - automationDeliverableTimeMs(left));
  return candidates[0] || null;
}

function automationPushSignature(job, latestDoc = null) {
  const lastRunAt = String(job?.lastRunAt || "").trim();
  if (!lastRunAt) return "";
  const docSignature = latestDoc ? [
    String(latestDoc.name || "").trim(),
    String(latestDoc.updatedAt || "").trim(),
    String(latestDoc.runOutputUpdatedAt || "").trim(),
    String(latestDoc.url || "").trim(),
  ].join(":") : "no-deliverable";
  return [
    lastRunAt,
    String(job?.lastStatus || "").trim(),
    String(job?.status || "").trim(),
    String(job?.lastError || "").trim(),
    String(job?.lastDeliveryError || "").trim(),
    docSignature,
  ].join("|");
}

function automationPushMarkSignature(mark) {
  if (!mark) return "";
  if (typeof mark === "string") return mark;
  if (typeof mark === "object") return String(mark.signature || "");
  return "";
}

function isRecentInitialAutomationDeliverable(latestDoc = null) {
  const docTimeMs = automationDeliverableTimeMs(latestDoc);
  if (!docTimeMs) return false;
  return Date.now() - docTimeMs <= Math.max(0, AUTOMATION_PUSH_INITIAL_LOOKBACK_MS);
}

function setAutomationPushMark(job, signature, latestDoc = null) {
  state.automationPushMarks = state.automationPushMarks || {};
  state.automationPushMarks[String(job?.id || "")] = {
    signature,
    lastRunAt: String(job?.lastRunAt || ""),
    lastStatus: String(job?.lastStatus || job?.status || ""),
    deliverableName: latestDoc ? String(latestDoc.name || "") : "",
    deliverableUpdatedAt: latestDoc ? String(latestDoc.updatedAt || "") : "",
    runOutputUpdatedAt: latestDoc ? String(latestDoc.runOutputUpdatedAt || "") : "",
    deliverableTimeAt: latestDoc ? new Date(automationDeliverableTimeMs(latestDoc)).toISOString() : "",
    updatedAt: nowIso(),
  };
}

function automationPushEventForJob(job, latestDoc, signature) {
  const jobId = String(job?.id || "").trim();
  if (!jobId || !String(job?.lastRunAt || "").trim()) return null;
  if (!latestDoc) return null;
  const principalId = automationOwnerPrincipal(job);
  const workspaceId = workspaceIdForPrincipal(principalId);
  const failed = /error|fail/i.test(String(job?.lastStatus || job?.status || "")) || Boolean(job?.lastError || job?.lastDeliveryError);
  const title = failed ? "\u81ea\u52a8\u5316\u4efb\u52a1\u5931\u8d25" : "\u81ea\u52a8\u5316\u4efb\u52a1\u5b8c\u6210";
  const body = compactText([
    automationTitleForPush(job),
    `\u4ea4\u4ed8\u6587\u4ef6: ${latestDoc.name}`,
  ].filter(Boolean).join("\n"), 220);
  const params = new URLSearchParams({ view: "automation", workspaceId, automationId: jobId });
  return {
    jobId,
    principalId,
    workspaceId,
    signature,
    latestDoc,
    payload: {
      title,
      body,
      tag: `hermes-automation-${jobId}-${hashValue(signature).slice(0, 12)}`,
      renotify: true,
      requireInteraction: true,
      silent: false,
      timestamp: Date.now(),
      vibrate: [200, 100, 200],
      data: {
        url: `/?${params.toString()}`,
        viewMode: "automation",
        workspaceId,
        automationId: jobId,
        principalId,
        messageType: failed ? "automation_failed" : "automation_completed",
        lastRunAt: job.lastRunAt || "",
        status: job.lastStatus || job.status || "",
        requireInteraction: true,
      },
    },
  };
}

async function runAutomationWebPushTick(options = {}) {
  if (!AUTOMATION_WEB_PUSH_ENABLED) return { ok: true, enabled: false, events: [], initialized: [], deliveries: [] };
  const principals = activePushPrincipals();
  if (!webPushConfig || !principals.length) {
    return { ok: true, enabled: Boolean(webPushConfig), principals, events: [], initialized: [], deliveries: [] };
  }
  const result = await automationProvider.listJobs({ includeDisabled: true, bypassCache: true, limit: 0 });
  if (!result?.ok) {
    return { ok: false, enabled: true, principals, events: [], initialized: [], deliveries: [], error: result?.error || "Hermes CRON bridge failed" };
  }
  state.automationPushMarks = state.automationPushMarks || {};
  const principalSet = new Set(principals);
  const events = [];
  const initialized = [];
  let marksChanged = false;
  const limit = Math.max(1, Number(options.limit || 100));
  for (const job of result.jobs || []) {
    const jobId = String(job?.id || "").trim();
    const principalId = automationOwnerPrincipal(job);
    if (!jobId || !principalSet.has(principalId)) continue;
    const existingMark = state.automationPushMarks[jobId];
    const latestDoc = automationLatestDeliverableForPush(job, existingMark);
    if (!latestDoc) continue;
    const signature = automationPushSignature(job, latestDoc);
    if (!signature) continue;
    const existing = automationPushMarkSignature(existingMark);
    if (existing === signature) continue;
    const event = automationPushEventForJob(job, latestDoc, signature);
    if (!event) continue;
    if (!existing && !options.includeInitial && !isRecentInitialAutomationDeliverable(latestDoc)) {
      initialized.push({ jobId, principalId, signature });
      if (!options.dryRun) {
        setAutomationPushMark(job, signature, latestDoc);
        marksChanged = true;
      }
      continue;
    }
    events.push(event);
    if (events.length >= limit) break;
  }
  if (options.dryRun) return { ok: true, enabled: true, principals, events, initialized, deliveries: [] };
  const deliveries = [];
  for (const event of events) {
    const delivery = await sendPushNotification(event.payload, {
      principalId: event.principalId,
      urgency: "high",
      ttl: 24 * 60 * 60,
    });
    deliveries.push(Object.assign({}, delivery, {
      jobId: event.jobId,
      principalId: event.principalId,
      workspaceId: event.workspaceId,
    }));
    setAutomationPushMark({ id: event.jobId, lastRunAt: event.payload.data.lastRunAt, lastStatus: event.payload.data.status }, event.signature, event.latestDoc);
    marksChanged = true;
  }
  if (marksChanged) saveState();
  return { ok: true, enabled: true, principals, events, initialized, deliveries };
}

function startAutomationWebPushDispatcher() {
  const interval = Math.max(15000, Number(AUTOMATION_WEB_PUSH_INTERVAL_MS) || 60000);
  if (!AUTOMATION_WEB_PUSH_ENABLED) return;
  const tick = () => {
    if (automationWebPushRunning) return;
    automationWebPushRunning = true;
    runAutomationWebPushTick()
      .catch((err) => console.error(`Hermes Automation Web Push tick failed: ${err.message || String(err)}`))
      .finally(() => {
        automationWebPushRunning = false;
      });
  };
  scheduleBackgroundWebPushDispatcher(tick, interval, AUTOMATION_WEB_PUSH_START_DELAY_MS);
}

function notifyTodoCreated(result, sourcePrincipal = "") {
  const todo = publicTodo(result || {});
  if (!todo.id || !todo.assignee) return;
  if (sourcePrincipal && todo.assignee === sourcePrincipal) return;
  const event = {
    markKey: `todo:${todo.id}:created_by_other`,
    todoId: todo.id,
    principalId: todo.assignee,
    messageType: "created_by_other",
    title: "新增待办",
    body: `新增待办：\n${todo.content}\n截止：${todo.dueLocal || todo.dueAt || ""}`,
    tag: `hermes-todo-${todo.id}-created-by-other`,
    data: { viewMode: "todos", todoId: todo.id, principalId: todo.assignee, messageType: "created_by_other" },
  };
  deliverTodoWebPushEvent(event).catch((err) => {
    console.error(`Hermes Todo Web Push send failed: ${err.message || String(err)}`);
  });
}

async function hermesRequest(apiPath, options = {}) {
  return singleGatewayRunner().request(apiPath, options);
}

async function getHermesStatus() {
  const status = await singleGatewayRunner().status();
  let poolStatus = null;
  try {
    poolStatus = await gatewayPool().status();
    status.gatewayPool = poolStatus;
  } catch (err) {
    status.gatewayPool = { enabled: false, error: err.message || String(err) };
  }
  if (!status.ok && gatewayPoolStatusHealthy(poolStatus)) {
    status.fallbackError = status.error || "";
    status.error = null;
    status.health = status.health || { status: "ok", platform: "gateway-pool" };
    status.ok = true;
  }
  return status;
}

function gatewayPoolStatusHealthy(poolStatus) {
  if (!poolStatus?.enabled) return false;
  const workers = Array.isArray(poolStatus.workers) ? poolStatus.workers : [];
  return workers.some((worker) => worker?.healthy === true);
}

function isToolUnavailableClaimText(text) {
  const content = String(text || "");
  if (!content.trim()) return false;
  return (
    /not available|unavailable|missing|no callable|no\s+.*tool|cannot call|can't call|unable to call|not exposed/i.test(content)
    || /\u6ca1\u6709|\u4ecd\u6ca1\u6709|\u672a\u770b\u5230|\u770b\u4e0d\u5230|\u672a\u6302\u8f7d|\u6ca1\u6302\u8f7d|\u7f3a\u5c11|\u4e0d\u53ef\u7528|\u65e0\u6cd5\u8c03\u7528|\u4e0d\u80fd\u8c03\u7528|\u4e0d\u80fd\u6267\u884c/.test(content)
  );
}

function isStaleHttpToolAvailabilityClaim(text) {
  const content = String(text || "");
  if (!content.trim()) return false;
  const mentionsHttpTool = /http_request|web_request|http\s*tool|http\s*function|HTTP\s*(?:工具|函数|方法)|HTTP\/API|API\s*Program/i.test(content);
  if (!mentionsHttpTool) return false;
  return isToolUnavailableClaimText(content);
}

function isStaleImageToolAvailabilityClaim(text) {
  const content = String(text || "");
  if (!content.trim()) return false;
  const mentionsImageTool = /image_generate|chatgpt_image_edit|chatgpt_image_erase|image_edit|image_erase|image\s*(?:tool|function|edit|erase|editing|retouch|inpainting)|ChatGPT\s*Image|P\s*\u56fe|\u4fee\u56fe|\u56fe\u7247\u7f16\u8f91|\u56fe\u50cf\u7f16\u8f91|\u5c40\u90e8\u64e6\u9664|\u64e6\u9664\u5de5\u5177/i.test(content);
  if (!mentionsImageTool) return false;
  return isToolUnavailableClaimText(content);
}

function isStaleDocxToolAvailabilityClaim(text) {
  const content = String(text || "");
  if (!content.trim()) return false;
  const mentionsDocxTool = /docx_extract_text|DOCX|docm|dotx|dotm|Word\s*(?:tool|function|parser|extract|unpack|document)|Office\s*Open\s*XML|Office\s*(?:tool|function|parser)|\u89e3\u5305|\u89e3\u6790\s*(?:Word|DOCX|docx)|Word\s*\u6587\u6863|\u6587\u6863\u89e3\u6790|\u89e3\u6790\u5de5\u5177/i.test(content);
  if (!mentionsDocxTool) return false;
  return isToolUnavailableClaimText(content);
}

function isStaleAudioToolAvailabilityClaim(text) {
  const content = String(text || "");
  if (!content.trim()) return false;
  const mentionsAudioTool = /audio_transcribe|audio\s*(?:tool|function|transcrib|transcription|ASR)|voice\s*(?:note|memo|recording)|Whisper|faster[-_ ]?whisper|speech[-_ ]?to[-_ ]?text|mp3|m4a|wav|aac|ogg|opus|amr|flac|video_analyze.*(?:mp3|audio)|(?:mp3|audio).*video_analyze|\u97f3\u9891|\u5f55\u97f3|\u8bed\u97f3|\u8f6c\u5199|\u542c\u5199|\u97f3\u9891\u8f6c\u6587\u5b57|\u590d\u8ff0\u5f55\u97f3/i.test(content);
  if (!mentionsAudioTool) return false;
  return isToolUnavailableClaimText(content);
}

function isOrdinaryToolSchemaElevationRequest(approvalRequest, output, message = {}) {
  if (!approvalRequest?.elevationRequired) return false;
  const scope = String(approvalRequest.elevationScope || "").trim();
  if (scope && scope !== "owner_high_privilege") return false;
  const text = String(output || "");
  const runPolicy = message?.runOptions?.access_policy_context || message?.runOptions?.accessPolicyContext || {};
  return (
    (policyHasToolset(runPolicy, "image_gen") && isStaleImageToolAvailabilityClaim(text))
    || (policyHasToolset(runPolicy, "http") && isStaleHttpToolAvailabilityClaim(text))
    || (policyHasToolset(runPolicy, "file") && isStaleDocxToolAvailabilityClaim(text))
    || (policyHasToolset(runPolicy, "file") && isStaleAudioToolAvailabilityClaim(text))
  );
}

function conversationHistoryContentForMessage(msg, policy = {}) {
  let content = stripDirectoryAliasLinesForChatHistory(msg?.content || "");
  if (msg?.role === "assistant" && policyHasToolset(policy, "http") && isStaleHttpToolAvailabilityClaim(content)) {
    content = [
      "[Stale assistant tool-availability claim omitted by Hermes Mobile.]",
      "The current run policy enables the `http` toolset; current callable functions supersede older assistant statements about `http_request` or HTTP/API Program availability.",
    ].join(" ");
  } else if (msg?.role === "assistant" && policyHasToolset(policy, "image_gen") && isStaleImageToolAvailabilityClaim(content)) {
    content = [
      "[Stale assistant tool-availability claim omitted by Hermes Mobile.]",
      "The current run policy enables the `image_gen` toolset; current callable functions supersede older assistant statements about `chatgpt_image_edit`, `chatgpt_image_erase`, `image_edit`, `image_erase`, or image editing availability.",
    ].join(" ");
  } else if (msg?.role === "assistant" && policyHasToolset(policy, "file") && isStaleDocxToolAvailabilityClaim(content)) {
    content = [
      "[Stale assistant tool-availability claim omitted by Hermes Mobile.]",
      "The current run policy enables the `file` toolset; current callable functions supersede older assistant statements about `docx_extract_text`, DOCX extraction, or Word parser availability.",
    ].join(" ");
  } else if (msg?.role === "assistant" && policyHasToolset(policy, "file") && isStaleAudioToolAvailabilityClaim(content)) {
    content = [
      "[Stale assistant tool-availability claim omitted by Hermes Mobile.]",
      "The current run policy enables the `file` toolset; current callable functions supersede older assistant statements about `audio_transcribe`, MP3/audio transcription, or video_analyze-as-audio-workaround availability.",
    ].join(" ");
  }
  return content;
}

function buildConversationHistory(thread, latestUserMessageId, policy = {}) {
  const allMessages = thread.messages || [];
  const latestIndex = allMessages.findIndex((msg) => msg.id === latestUserMessageId);
  const latest = latestIndex >= 0 ? allMessages[latestIndex] : null;
  if (thread.singleWindow && !latest?.taskGroupId) return [];
  const messages = allMessages
    .slice(0, latestIndex >= 0 ? latestIndex : allMessages.length)
    .filter((msg) => !thread.singleWindow || msg.taskGroupId === latest.taskGroupId)
    .filter((msg) => (msg.role === "user" || msg.role === "assistant") && msg.status !== "running")
    .filter((msg) => String(msg.content || "").trim());
  if (thread.singleWindow && isSingleWindowConversationTaskGroupId(latest?.taskGroupId)) {
    return compactConversationHistory(messages, CHAT_CONTEXT_MAX_MESSAGES, CHAT_CONTEXT_MAX_CHARS, policy);
  }
  return messages.slice(-MAX_HISTORY_MESSAGES).map((msg) => ({
    role: msg.role,
    content: compactText(conversationHistoryContentForMessage(msg, policy), MAX_API_TEXT_CHARS),
  }));
}

function stripDirectoryAliasLinesForChatHistory(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:[-*]\s*)?(?:目录别名|Directory aliases?)\s*[:：]/i.test(line))
    .join("\n")
    .trim();
}

function compactConversationHistory(messages, maxMessages, maxChars, policy = {}) {
  const recent = messages.slice(-Math.max(0, maxMessages));
  const result = [];
  let remainingChars = Math.max(0, maxChars);
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    if (remainingChars <= 0) break;
    const msg = recent[index];
    let content = conversationHistoryContentForMessage(msg, policy);
    if (!content) continue;
    if (msg.role === "user" && msg.senderLabel) {
      content = `${msg.senderLabel}: ${content}`;
    }
    if (content.length > remainingChars) {
      const marker = "[Earlier chat content omitted]\n";
      const allowed = Math.max(0, remainingChars - marker.length);
      content = allowed > 0 ? `${marker}${content.slice(-allowed)}` : content.slice(-remainingChars);
    }
    result.push({
      role: msg.role,
      content: compactText(content, Math.min(MAX_API_TEXT_CHARS, CHAT_CONTEXT_MAX_CHARS)),
    });
    remainingChars -= content.length;
  }
  return result.reverse();
}

function deriveTitle(text) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "New thread";
  return cleaned.length <= 42 ? cleaned : `${cleaned.slice(0, 42)}...`;
}

async function startRunForThread(thread, userMessage, assistantMessage, options = {}) {
  const actorWorkspaceId = String(options.actorWorkspaceId || userMessage.senderWorkspaceId || thread.workspaceId || "owner").trim() || "owner";
  assertRunConcurrencyCapacity(actorWorkspaceId);
  assistantMessage.actorWorkspaceId = actorWorkspaceId;
  const requestedGatewayRouting = Object.assign({}, options.gatewayRouting || {});
  const policyHardeningOptions = accessPolicyHardeningOptionsForGatewayRouting(requestedGatewayRouting);
  const policyThread = actorWorkspaceId === thread.workspaceId
    ? thread
    : Object.assign({}, thread, {
      workspaceId: actorWorkspaceId,
      projectId: SINGLE_WINDOW_PROJECT_ID,
      subprojectId: "",
    });
  const taskDirectory = taskDirectoryAttachmentForMessage(thread, userMessage);
  const project = taskDirectory ? projectForTaskDirectoryAttachment(thread, taskDirectory) : effectiveProjectForThread(policyThread);
  const workspace = findWorkspace(actorWorkspaceId);
  let policy = buildAccessPolicy(workspace?.policy || workspace || {}, {}, project, policyHardeningOptions);
  const groupChatDeliveryRoot = thread.singleWindow && userMessage.taskGroupId === SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID
    ? groupChatDeliveryRootForThread(thread)
    : "";
  const groupChatDeliveryRootForModel = groupChatDeliveryRoot ? windowsPathToWsl(groupChatDeliveryRoot) : "";
  const groupChatAttachmentCopies = groupChatDeliveryRoot
    ? ensureGroupChatSharedArtifactCopies(thread, userMessage, groupChatDeliveryRoot)
    : [];
  if (groupChatDeliveryRoot) {
    fs.mkdirSync(groupChatDeliveryRoot, { recursive: true });
    policy.allowed_roots = dedupe([...(policy.allowed_roots || []), groupChatDeliveryRootForModel, groupChatDeliveryRoot].filter(Boolean));
    policy.delivery_roots = dedupe([...(policy.delivery_roots || []), groupChatDeliveryRootForModel, groupChatDeliveryRoot].filter(Boolean));
    policy.cache_roots = dedupe([...(policy.cache_roots || []), groupChatDeliveryRootForModel, groupChatDeliveryRoot].filter(Boolean));
  }
  policy = sanitizePolicy(policy, policyHardeningOptions);
  const runPolicy = options.access_policy_context && typeof options.access_policy_context === "object"
    ? sanitizePolicy(mergeAccessPolicyOverride(policy, options.access_policy_context), policyHardeningOptions)
    : policy;
  const taskId = makePublicTaskId("web");
  const body = {
    input: userMessage.content,
    stream: true,
    store: true,
    conversation: gatewayConversationId(thread, userMessage, runPolicy),
    conversation_history: buildConversationHistory(thread, userMessage.id, runPolicy),
    instructions: [
      buildHermesInstructions(
        policyThread,
        runPolicy,
        project,
        userMessage.content,
        taskDirectory,
        Object.assign({}, options, { groupChatDeliveryRoot: groupChatDeliveryRootForModel, groupChatAttachmentCopies }),
      ),
      options.instructions || "",
    ].filter(Boolean).join("\n\n"),
    access_policy_context: runPolicy,
  };
  if (options.model) body.model = options.model;
  if (options.reasoning_effort) body.reasoning_effort = options.reasoning_effort;
  if (options.reasoning && typeof options.reasoning === "object") body.reasoning = options.reasoning;
  assistantMessage.runOptions = Object.assign({}, assistantMessage.runOptions || {}, {
    access_policy_context: runPolicy,
    gatewayConversation: body.conversation,
    toolSchemaEpoch: GATEWAY_TOOL_SCHEMA_EPOCH,
  });

  const gatewayRouting = Object.assign({}, requestedGatewayRouting, {
    purpose: "user_run",
    workspaceId: actorWorkspaceId,
    taskGroupId: userMessage.taskGroupId || "",
    model: body.model || "",
    reasoning_effort: body.reasoning_effort || "",
  });
  Object.assign(gatewayRouting, gatewaySkillRoutingForWorkspace(actorWorkspaceId, gatewayRouting));

  const gatewayTarget = await chooseGatewayRunTarget(gatewayRouting);
  const startedAt = nowIso();
  const gatewayUrl = gatewayTarget.apiBase;
  assistantMessage.runId = taskId;
  assistantMessage.taskId = taskId;
  assistantMessage.gatewayUrl = gatewayUrl;
  assistantMessage.gatewayName = gatewayTarget.name || "";
  assistantMessage.gatewayProfile = gatewayTarget.profile || "";
  assistantMessage.gatewaySource = gatewayTarget.source || "";
  assistantMessage.status = "running";
  assistantMessage.startedAt = assistantMessage.startedAt || startedAt;
  assistantMessage.updatedAt = startedAt;
  addThreadActiveRun(thread, taskId);
  thread.status = "running";
  thread.updatedAt = startedAt;
  saveState();
  broadcast({ type: "message.updated", threadId: thread.id, message: compactMessage(assistantMessage), thread: threadSummary(thread) });
  streamResponse(taskId, thread.id, assistantMessage.id, body, {
    gatewayUrl,
    gatewayApiKey: gatewayTarget.apiKey || "",
    gatewayName: gatewayTarget.name || "",
    gatewayProfile: gatewayTarget.profile || "",
    gatewaySource: gatewayTarget.source || "",
  });
  return {
    run_id: taskId,
    status: "started",
    engine: "responses",
    gatewayUrl,
    gatewayName: gatewayTarget.name || "",
    gatewayProfile: gatewayTarget.profile || "",
    gatewaySource: gatewayTarget.source || "",
  };
}

function makePublicTaskId(prefix) {
  const d = new Date();
  const stamp = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
    "_",
    String(d.getHours()).padStart(2, "0"),
    String(d.getMinutes()).padStart(2, "0"),
    String(d.getSeconds()).padStart(2, "0"),
  ].join("");
  return `${prefix}_${stamp}_${crypto.randomBytes(3).toString("hex")}`;
}

function addThreadActiveRun(thread, runId) {
  thread.activeRunIds = dedupe([...(thread.activeRunIds || []), runId]);
  thread.activeRunId = runId || thread.activeRunIds[thread.activeRunIds.length - 1] || null;
}

function replaceThreadActiveRun(thread, oldRunId, newRunId) {
  const runs = (thread.activeRunIds || []).map((item) => (item === oldRunId ? newRunId : item));
  thread.activeRunIds = dedupe(runs.filter(Boolean));
  if (thread.activeRunId === oldRunId) thread.activeRunId = newRunId;
  if (!thread.activeRunId && thread.activeRunIds.length) thread.activeRunId = thread.activeRunIds[thread.activeRunIds.length - 1];
}

function removeThreadActiveRun(thread, runId, idleStatus = "idle") {
  thread.activeRunIds = (thread.activeRunIds || []).filter((item) => item !== runId);
  if (thread.activeRunId === runId) thread.activeRunId = thread.activeRunIds[thread.activeRunIds.length - 1] || null;
  thread.status = thread.activeRunIds.length ? "running" : idleStatus;
}

function taskGroupHasRunningRun(thread, taskGroupId) {
  const groupId = String(taskGroupId || "");
  if (!thread || !groupId) return false;
  return (thread.messages || []).some((message) => (
    message.role === "assistant"
    && message.taskGroupId === groupId
    && message.status === "running"
  ));
}

function nextQueuedRunPairForTaskGroup(thread, taskGroupId) {
  const groupId = String(taskGroupId || "");
  if (!thread || !groupId) return null;
  const messages = thread.messages || [];
  for (let i = 0; i < messages.length; i += 1) {
    const assistant = messages[i];
    if (
      assistant?.role !== "assistant"
      || assistant.taskGroupId !== groupId
      || assistant.status !== "queued"
      || assistant.runId
    ) {
      continue;
    }
    const user = messages[i - 1];
    if (user?.role === "user" && user.taskGroupId === groupId) return { user, assistant };
  }
  return null;
}

function queuedRunInstructions(singleWindowMode) {
  if (singleWindowMode === "chat") {
    return "The latest user message is a queued Hermes Mobile continuous-chat turn. Treat it as the next message in the supplied same-task conversation_history.";
  }
  return "The latest user message is a queued mobile follow-up to an existing task group. Treat it as a follow-up to the supplied same-task conversation_history, not as a new independent task.";
}

function markQueuedRunStartFailed(thread, taskGroupId, err) {
  const pair = nextQueuedRunPairForTaskGroup(thread, taskGroupId);
  if (!pair) return;
  const failedAt = nowIso();
  pair.assistant.status = "failed";
  pair.assistant.error = err.message || String(err);
  pair.assistant.failedAt = failedAt;
  pair.assistant.updatedAt = failedAt;
  thread.status = (thread.activeRunIds || []).length ? "running" : "failed";
  thread.updatedAt = failedAt;
  saveState();
  broadcast({ type: "run.failed", threadId: thread.id, runId: "", message: compactMessage(pair.assistant), thread: threadSummary(thread) });
}

async function startNextQueuedRunForTaskGroup(thread, taskGroupId) {
  const groupId = String(taskGroupId || "");
  if (!thread?.singleWindow || !groupId || taskGroupHasRunningRun(thread, groupId)) return null;
  const pair = nextQueuedRunPairForTaskGroup(thread, groupId);
  if (!pair) {
    if (!(thread.activeRunIds || []).length && thread.status === "queued") {
      thread.status = "idle";
      thread.updatedAt = nowIso();
      saveState();
      broadcast({ type: "thread.updated", thread: threadSummary(thread) });
    }
    return null;
  }
  const singleWindowMode = normalizeSingleWindowMode(
    pair.assistant.singleWindowMode || pair.assistant.single_window_mode || pair.user.singleWindowMode || "",
  );
  const queuedOptions = Object.assign({}, pair.assistant.runOptions || {}, {
    reasoning_effort: pair.assistant.reasoningEffort || "",
    singleWindowMode,
    instructions: [
      pair.assistant.runOptions?.instructions || "",
      queuedRunInstructions(singleWindowMode),
    ].filter(Boolean).join("\n\n"),
  });
  return startRunForThread(thread, pair.user, pair.assistant, queuedOptions);
}

function scheduleNextQueuedRunForTaskGroup(thread, taskGroupId) {
  if (!thread?.singleWindow || !taskGroupId) return;
  setImmediate(() => {
    startNextQueuedRunForTaskGroup(thread, taskGroupId).catch((err) => {
      markQueuedRunStartFailed(thread, taskGroupId, err);
    });
  });
}

async function stopRunIds(runIds) {
  const stopped = [];
  for (const runId of dedupe((runIds || []).filter(Boolean))) {
    const stream = activeStreams.get(runId);
    if (stream?.controller) {
      stream.controller.abort();
      stopped.push(runId);
    } else {
      try {
        const target = gatewayTargetForRun(runId);
        await gatewayPool().runnerFor(target).stopRun(runId, {
          gatewayUrl: target.apiBase,
          apiKey: target.apiKey,
        });
      } catch (err) {
        if (err.status !== 404) throw err;
      }
      stopped.push(runId);
    }
  }
  return stopped;
}

function gatewayUrlForRun(runId) {
  const active = activeStreams.get(runId);
  if (active?.gatewayUrl) return active.gatewayUrl;
  for (const thread of state.threads || []) {
    const message = (thread.messages || []).find((item) => item.runId === runId);
    if (message?.gatewayUrl) return String(message.gatewayUrl || "");
  }
  return "";
}

function abortActiveStreamAsFailed(publicRunId, reason) {
  const stream = activeStreams.get(publicRunId);
  if (!stream || stream.failureReason) return;
  stream.failureReason = reason;
  try {
    stream.controller.abort();
  } catch (_) {}
}

async function checkActiveStreamLiveness(publicRunId) {
  const stream = activeStreams.get(publicRunId);
  if (!stream) return;
  const now = Date.now();
  if (!stream.realRunId) {
    if (RUN_START_TIMEOUT_MS > 0 && now - stream.startedAt >= RUN_START_TIMEOUT_MS) {
      abortActiveStreamAsFailed(publicRunId, `Hermes Gateway did not create a run within ${Math.round(RUN_START_TIMEOUT_MS / 1000)} seconds; the queued task was released.`);
    }
    return;
  }
  if (RUN_LIVENESS_CHECK_AFTER_MS > 0 && now - stream.lastEventAt < RUN_LIVENESS_CHECK_AFTER_MS) return;
  try {
    const target = gatewayTargetForRun(publicRunId);
    await gatewayPool().runnerFor(target).checkRun(stream.realRunId, {
      gatewayUrl: target.apiBase,
      apiKey: target.apiKey,
      signal: AbortSignal.timeout(Math.max(1000, HERMES_API_TIMEOUT_MS)),
    });
    stream.livenessMisses = 0;
    stream.lastLivenessWarningAt = 0;
  } catch (err) {
    if (err.status === 404) {
      stream.livenessMisses = (stream.livenessMisses || 0) + 1;
      const elapsedMs = now - stream.lastEventAt;
      if (RUN_LIVENESS_STALE_AFTER_MS > 0 && elapsedMs >= RUN_LIVENESS_STALE_AFTER_MS) {
        abortActiveStreamAsFailed(publicRunId, `Hermes Gateway no longer reports run ${stream.realRunId} after ${Math.round(elapsedMs / 1000)} seconds without response events; the Web task was marked stale and the queue was released.`);
        return;
      }
      if (!stream.lastLivenessWarningAt || now - stream.lastLivenessWarningAt >= 300000) {
        stream.lastLivenessWarningAt = now;
        console.warn(`Hermes Mobile run liveness check got 404 for ${stream.realRunId}; keeping the active stream open because long-running Gateway tools can be absent from /v1/runs.`);
      }
    }
  }
}

function streamResponse(runId, threadId, messageId, body, options = {}) {
  if (activeStreams.has(runId)) return;
  const controller = new AbortController();
  const streamState = {
    threadId,
    messageId,
    controller,
    engine: "responses",
    gatewayUrl: options.gatewayUrl || singleGatewayRunner().apiBase(),
    gatewayApiKey: options.gatewayApiKey || "",
    gatewayName: options.gatewayName || "",
    gatewayProfile: options.gatewayProfile || "",
    gatewaySource: options.gatewaySource || "",
    startedAt: Date.now(),
    lastEventAt: Date.now(),
    livenessTimer: null,
    livenessMisses: 0,
    lastLivenessWarningAt: 0,
    failureReason: "",
  };
  if (RUN_LIVENESS_CHECK_INTERVAL_MS > 0) {
    streamState.livenessTimer = setInterval(() => {
      checkActiveStreamLiveness(runId).catch((err) => {
        console.error(`Hermes Mobile run liveness check failed: ${err.message || String(err)}`);
      });
    }, Math.max(5000, RUN_LIVENESS_CHECK_INTERVAL_MS));
    if (typeof streamState.livenessTimer.unref === "function") streamState.livenessTimer.unref();
  }
  activeStreams.set(runId, streamState);
  readResponseEvents(runId, body, controller.signal)
    .then(() => {
      const stream = activeStreams.get(runId);
      const visibleRunId = stream?.realRunId || runId;
      markRunFailed(threadId, messageId, visibleRunId, new Error("Hermes stream ended without a terminal completion event; please rerun the task."));
    })
    .catch((err) => {
      const stream = activeStreams.get(runId);
      const visibleRunId = stream?.realRunId || runId;
      if (controller.signal.aborted && stream?.failureReason) markRunFailed(threadId, messageId, visibleRunId, new Error(stream.failureReason));
      else if (controller.signal.aborted) markRunCancelled(threadId, messageId, visibleRunId);
      else markRunFailed(threadId, messageId, visibleRunId, err);
    })
    .finally(() => {
      const stream = activeStreams.get(runId);
      if (stream?.livenessTimer) clearInterval(stream.livenessTimer);
      if (stream?.realRunId) activeStreams.delete(stream.realRunId);
      activeStreams.delete(runId);
    });
}

async function readResponseEvents(runId, body, signal) {
  const target = gatewayTargetForRun(runId);
  await gatewayPool().runnerFor(target).streamResponses(body, {
    signal,
    gatewayUrl: target.apiBase,
    apiKey: target.apiKey,
    onEvent: (event) => applyHermesRunEvent(Object.assign({ run_id: runId }, event)),
  });
}

function parseSseFrame(frame) {
  const dataLines = [];
  let eventName = "";
  for (const rawLine of String(frame || "").split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return null;
  try {
    const parsed = JSON.parse(dataLines.join("\n"));
    if (eventName && parsed && typeof parsed === "object" && !parsed.event) parsed.event = eventName;
    return parsed;
  } catch (_) {
    return null;
  }
}

function findRunTarget(runId) {
  const active = activeStreams.get(runId);
  if (active) return active;
  for (const thread of state.threads) {
    const msg = (thread.messages || []).find((item) => item.runId === runId);
    if (msg) return { threadId: thread.id, messageId: msg.id };
  }
  return null;
}

function supplementGatewayUsage(usage, runId, message = {}) {
  const target = gatewayTargetForRun(runId);
  return gatewayUsageTelemetry().supplementUsage(usage, Object.assign({}, target, {
    responseId: message.runId || runId,
    runId,
    gatewayProfile: message.gatewayProfile || target.profile || "",
    gatewayName: message.gatewayName || target.name || "",
    gatewayUrl: message.gatewayUrl || target.apiBase || "",
  }));
}

function applyHermesRunEvent(event) {
  const eventName = String(event.event || event.type || "");
  const originalRunId = event.run_id || event.runId || "";
  const responseRunId = event.response?.id || "";
  const runId = eventName === "response.created" ? (originalRunId || responseRunId) : (responseRunId || originalRunId);
  const streamForEvent = activeStreams.get(runId) || activeStreams.get(originalRunId) || activeStreams.get(responseRunId);
  if (streamForEvent) streamForEvent.lastEventAt = Date.now();
  const target = findRunTarget(runId);
  if (!target) return;
  const thread = state.threads.find((item) => item.id === target.threadId);
  if (!thread) return;
  const message = (thread.messages || []).find((item) => item.id === target.messageId);
  if (!message) return;

  if (eventName === "response.created" && event.response?.id) {
    const realId = String(event.response.id);
    if (realId && realId !== runId) {
      const stream = activeStreams.get(runId);
      if (stream) stream.realRunId = realId;
      activeStreams.set(realId, stream);
      message.runId = realId;
      replaceThreadActiveRun(thread, runId, realId);
    }
    saveState();
    broadcast({ type: "message.updated", threadId: thread.id, message: compactMessage(message), thread: threadSummary(thread) });
    return;
  }

  if (eventName === "message.delta" || eventName === "response.output_text.delta") {
    const delta = String(event.delta || event.text || "");
    if (delta) {
      const feedbackAt = nowIso();
      message.content = appendBounded(message.content || "", delta, MAX_MESSAGE_CHARS);
      if (!message.firstFeedbackAt) message.firstFeedbackAt = feedbackAt;
      message.updatedAt = feedbackAt;
      thread.updatedAt = feedbackAt;
      saveState();
      broadcast({
        type: "message.delta",
        threadId: thread.id,
        messageId: message.id,
        delta,
        firstFeedbackAt: message.firstFeedbackAt,
        updatedAt: message.updatedAt,
        thread: threadSummary(thread),
      });
    }
    return;
  }

  if (eventName === "response.output_item.added" || eventName === "response.output_item.done") {
    const item = event.item || {};
    addThreadEvent(thread, {
      event: eventName,
      timestamp: Date.now() / 1000,
      runId,
      tool: item.name || item.type || "",
      preview: item.arguments || item.output || "",
      error: false,
    });
    saveState();
    broadcast({ type: "run.event", threadId: thread.id, runId, event: thread.events[thread.events.length - 1], thread: threadSummary(thread) });
    return;
  }

  addThreadEvent(thread, event);

  if (eventName === "run.completed" || eventName === "response.completed") {
    const output = extractCompletedOutput(event) || String(message.content || "");
    const approvalRequest = modelPermissionApprovalRequest(output, message);
    const validApprovalRequest = isOrdinaryToolSchemaElevationRequest(approvalRequest, output, message) ? null : approvalRequest;
    const visibleOutput = approvalRequest ? stripPermissionApprovalMarkers(output) : output;
    const completedAt = nowIso();
    message.content = compactFullContent(visibleOutput || output);
    message.status = "done";
    message.usage = supplementGatewayUsage(event.usage || event.response?.usage || null, runId, message);
    if (validApprovalRequest) {
      message.elevationRequired = true;
      message.elevationScope = validApprovalRequest.elevationScope;
      message.elevationReason = validApprovalRequest.elevationReason;
      message.elevationSource = validApprovalRequest.elevationSource;
    } else {
      message.elevationRequired = false;
      message.elevationScope = "";
      message.elevationReason = "";
      message.elevationSource = "";
    }
    if (!message.firstFeedbackAt && (visibleOutput || output)) message.firstFeedbackAt = completedAt;
    message.completedAt = completedAt;
    message.updatedAt = completedAt;
    message.artifacts = registerArtifactsFromText(thread, message, visibleOutput || output);
    enqueueExternalDeliveryForTerminalMessage(thread, message, "done");
    removeThreadActiveRun(thread, runId, "idle");
    thread.updatedAt = completedAt;
    saveState();
    broadcast({ type: "run.completed", threadId: thread.id, runId, message: compactMessage(message), thread: threadSummary(thread) });
    notifyTaskTerminal(thread, message, "done");
    scheduleNextQueuedRunForTaskGroup(thread, message.taskGroupId);
    return;
  }

  if (eventName === "run.failed" || eventName === "response.failed") {
    const failedAt = nowIso();
    message.status = "failed";
    message.error = String(event.error?.message || event.error || "run failed");
    message.failedAt = failedAt;
    message.updatedAt = failedAt;
    enqueueExternalDeliveryForTerminalMessage(thread, message, "failed");
    removeThreadActiveRun(thread, runId, "failed");
    thread.updatedAt = failedAt;
    saveState();
    broadcast({ type: "run.failed", threadId: thread.id, runId, message: compactMessage(message), thread: threadSummary(thread) });
    notifyTaskTerminal(thread, message, "failed");
    scheduleNextQueuedRunForTaskGroup(thread, message.taskGroupId);
    return;
  }

  if (eventName === "run.cancelled" || eventName === "response.incomplete") {
    markRunCancelled(thread.id, message.id, runId);
    return;
  }

  saveState();
  broadcast({ type: "run.event", threadId: thread.id, runId, event: thread.events[thread.events.length - 1], thread: threadSummary(thread) });
}

function extractCompletedOutput(event) {
  if (event.output) return String(event.output);
  const response = event.response || {};
  const chunks = [];
  for (const item of Array.isArray(response.output) ? response.output : []) {
    if (item.type !== "message") continue;
    for (const part of Array.isArray(item.content) ? item.content : []) {
      if (part.type === "output_text" && part.text) chunks.push(String(part.text));
    }
  }
  return chunks.join("\n\n").trim();
}

function markRunFailed(threadId, messageId, runId, err) {
  const thread = state.threads.find((item) => item.id === threadId);
  if (!thread) return;
  const message = (thread.messages || []).find((item) => item.id === messageId);
  if (!message || ["done", "failed", "cancelled"].includes(message.status)) return;
  const failedAt = nowIso();
  message.status = "failed";
  message.error = err.message || String(err);
  message.failedAt = failedAt;
  message.updatedAt = failedAt;
  enqueueExternalDeliveryForTerminalMessage(thread, message, "failed");
  removeThreadActiveRun(thread, runId, "failed");
  thread.updatedAt = failedAt;
  saveState();
  broadcast({ type: "run.failed", threadId, runId, message: compactMessage(message), thread: threadSummary(thread) });
  notifyTaskTerminal(thread, message, "failed");
  scheduleNextQueuedRunForTaskGroup(thread, message.taskGroupId);
}

function markRunCancelled(threadId, messageId, runId) {
  const thread = state.threads.find((item) => item.id === threadId);
  if (!thread) return;
  const message = (thread.messages || []).find((item) => item.id === messageId);
  if (!message || ["done", "failed", "cancelled"].includes(message.status)) return;
  const cancelledAt = nowIso();
  message.status = "cancelled";
  message.cancelledAt = cancelledAt;
  message.updatedAt = cancelledAt;
  removeThreadActiveRun(thread, runId, "idle");
  thread.updatedAt = cancelledAt;
  saveState();
  broadcast({ type: "run.cancelled", threadId, runId, message: compactMessage(message), thread: threadSummary(thread) });
  scheduleNextQueuedRunForTaskGroup(thread, message.taskGroupId);
}

function reconcileDetachedActiveRuns(reason = "Hermes Mobile restarted while this task was running; the result stream is no longer attached. Please rerun the task.") {
  let changed = false;
  const failedAt = nowIso();
  for (const thread of state.threads || []) {
    let threadChanged = false;
    for (const message of thread.messages || []) {
      if (!["queued", "running"].includes(String(message.status || ""))) continue;
      const runId = String(message.runId || "");
      if (message.status === "queued" && !runId) continue;
      if (runId && activeStreams.has(runId)) continue;
      message.status = "failed";
      message.error = reason;
      message.failedAt = failedAt;
      message.updatedAt = failedAt;
      enqueueExternalDeliveryForTerminalMessage(thread, message, "failed");
      if (runId) removeThreadActiveRun(thread, runId, "failed");
      changed = true;
      threadChanged = true;
      broadcast({ type: "run.failed", threadId: thread.id, runId, message: compactMessage(message), thread: threadSummary(thread) });
    }
    if (!thread.activeRunIds?.length && thread.status === "running") thread.status = "failed";
    if (threadChanged) thread.updatedAt = failedAt;
  }
  if (changed) saveState();
  for (const thread of state.threads || []) {
    if ((thread.activeRunIds || []).length) continue;
    const queued = (thread.messages || []).find((message) => (
      message.role === "assistant" && message.status === "queued" && !message.runId && message.taskGroupId
    ));
    if (queued) scheduleNextQueuedRunForTaskGroup(thread, queued.taskGroupId);
  }
  return changed;
}

function appendBounded(current, delta, maxChars) {
  const next = `${current || ""}${delta || ""}`;
  if (next.length <= maxChars) return next;
  return `${next.slice(0, Math.floor(maxChars * 0.45))}\n\n[content truncated live: ${next.length} chars total]\n\n${next.slice(-Math.floor(maxChars * 0.45))}`;
}

function compactFullContent(value) {
  return compactText(value, MAX_MESSAGE_CHARS);
}

function registerArtifactsFromText(thread, message, text) {
  const paths = extractArtifactPaths(text);
  const artifacts = [];
  for (const rawPath of paths) {
    const localPath = normalizeLocalPath(rawPath);
    if (!localPath || !fs.existsSync(localPath) || !isPathAllowedForThread(thread, localPath, rawPath)) continue;
    const existing = state.artifacts.find((item) => samePath(item.path, localPath) || samePath(item.displayPath, rawPath));
    const stat = fs.statSync(localPath);
    const artifact = existing || {
      id: makeId("artifact"),
      path: localPath,
      displayPath: String(rawPath || localPath),
      name: path.basename(localPath),
      mime: mimeFor(localPath),
      size: stat.size,
      createdAt: nowIso(),
      workspaceId: thread.workspaceId,
      projectId: thread.projectId,
      subprojectId: thread.subprojectId || "",
      threadId: thread.id,
      messageId: message.id,
    };
    artifact.size = stat.size;
    artifact.threadId = thread.id;
    artifact.messageId = message.id;
    artifact.updatedAt = nowIso();
    if (!existing) state.artifacts.push(artifact);
    artifacts.push({
      id: artifact.id,
      name: artifact.name,
      mime: artifact.mime,
      size: artifact.size,
      url: `/api/artifacts/${encodeURIComponent(artifact.id)}`,
    });
  }
  return artifacts;
}

function samePath(a, b) {
  return path.resolve(String(a || "")).toLowerCase() === path.resolve(String(b || "")).toLowerCase();
}

function extractArtifactPaths(text) {
  const out = new Set();
  const source = String(text || "");
  for (const match of source.matchAll(/MEDIA:\s*([^\r\n]+)/g)) {
    addPathCandidate(out, match[1]);
  }
  const filePattern = /((?:[A-Za-z]:\\|\/mnt\/[A-Za-z]\/|\\\\wsl(?:\.localhost|\$)?\\)[^\r\n<>"'`]+?\.(?:pdf|png|jpe?g|webp|gif|mp4|mov|mp3|m4a|wav|docx|xlsx|pptx|md|txt|json|csv|html?|zip))/gi;
  for (const match of source.matchAll(filePattern)) {
    addPathCandidate(out, match[1]);
  }
  return [...out];
}

function addPathCandidate(set, value) {
  let text = String(value || "").trim();
  text = text.replace(/^["'`]+|["'`]+$/g, "");
  text = text.replace(/[)\].,;:]+$/g, "");
  if (text) set.add(text);
}

function volume1WindowsMirrorPath(rawPath) {
  return filesystemMountProvider.volume1WindowsMirrorPath(rawPath);
}

function normalizeLocalPath(rawPath) {
  return filesystemMountProvider.normalizeLocalPath(rawPath);
}

function allowedRoots() {
  return securityBoundaryProvider.filterRoots(filesystemMountProvider.resolvedAllowedRoots());
}

function isPathAllowed(filePath) {
  if (securityBoundaryProvider.isProtectedPath(filePath)) return false;
  return filesystemMountProvider.isPathAllowed(filePath);
}

function isPathAllowedForThread(thread, localPath, originalPath = "") {
  if (securityBoundaryProvider.isProtectedPath(localPath) || securityBoundaryProvider.isProtectedPath(originalPath)) return false;
  const uploadRoots = uploadRootsForThread(thread);
  if (uploadRoots.length && (
    pathInsideAnyRoot(localPath, uploadRoots)
    || pathInsideAnyRoot(originalPath || localPath, uploadRoots)
  )) {
    return true;
  }
  const policy = policyForThread(thread);
  if (policy.access_mode === "unrestricted" || policy.principal_id === "owner") {
    const ownerRoots = dedupe([
      ...loadCatalog().projects
        .filter((project) => project.workspaceId === "owner")
        .map((project) => project.root)
        .filter(Boolean),
      ...sharedDirectoryRoots(thread.workspaceId),
    ]);
    return isPathAllowed(localPath)
      || pathInsideAnyRoot(originalPath || localPath, ownerRoots)
      || pathInsideAnyRoot(localPath, ownerRoots.map(normalizeLocalPath));
  }
  const roots = dedupe([
    ...(policy.allowed_roots || []),
    ...(policy.delivery_roots || []),
    ...(policy.cache_roots || []),
    policy.sync_root,
    policy.download_root,
  ]);
  if (!roots.length) return false;
  return pathInsideAnyRoot(originalPath || localPath, roots)
    || pathInsideAnyRoot(localPath, roots)
    || pathInsideAnyRoot(localPath, roots.map(normalizeLocalPath));
}

function isDirectoryBrowserPathAllowedForThread(thread, localPath, originalPath = "") {
  if (securityBoundaryProvider.isProtectedPath(localPath) || securityBoundaryProvider.isProtectedPath(originalPath)) return false;
  if (isPathAllowedForThread(thread, localPath, originalPath)) return true;
  const policy = policyForThread(thread);
  if (!(policy.access_mode === "unrestricted" || policy.principal_id === "owner")) return false;
  const home = os.homedir();
  const ownerRoots = [
    home ? path.join(home, "Documents") : "",
    home ? path.join(home, "SynologyDrive") : "",
    path.join(REPO_ROOT, "workspace"),
    path.join(REPO_ROOT, "outbox"),
    ...sharedDirectoryRoots(thread.workspaceId),
    ...loadCatalog().projects
      .filter((project) => project.workspaceId === "owner")
      .flatMap((project) => [project.root, ...(project.children || []).map((child) => child.root)]),
  ].filter((root) => root && !securityBoundaryProvider.rootConflictsWithProtected(root));
  let realLocalPath = localPath;
  try {
    realLocalPath = fs.realpathSync.native(localPath);
  } catch (_) {}
  return pathInsideAnyRoot(realLocalPath, ownerRoots)
    || pathInsideAnyRoot(originalPath || localPath, ownerRoots)
    || pathInsideAnyRoot(realLocalPath, ownerRoots.map(normalizeLocalPath));
}

function directoryAliasKey(value) {
  return String(value || "")
    .replace(/^目录别名\s*[:：]\s*/, "")
    .replace(/^`+|`+$/g, "")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function directoryAliasLabels(project, parentLabel = "") {
  const labels = [
    project.label,
    ...(project.aliases || []),
  ].filter(Boolean);
  if (parentLabel && project.label) labels.push(`${parentLabel} / ${project.label}`);
  return labels;
}

function resolveDirectoryAlias(thread, alias) {
  const key = directoryAliasKey(alias);
  if (!key) return null;
  const projects = allProjectsForWorkspaceSync(thread.workspaceId).filter((project) => !project.hidden);
  for (const project of projects) {
    for (const label of directoryAliasLabels(project)) {
      if (directoryAliasKey(label) === key && project.root) return { label, path: project.root };
    }
    for (const child of project.children || []) {
      const parentLabel = project.label || "";
      for (const label of directoryAliasLabels(child, parentLabel)) {
        if (directoryAliasKey(label) === key && child.root) return { label, path: child.root };
      }
    }
  }
  return null;
}

function resolveBrowserPath(thread, query) {
  const rawPath = String(query.get("path") || "").trim();
  const alias = String(query.get("alias") || "").trim();
  const aliasResolved = alias ? resolveDirectoryAlias(thread, alias) : null;
  const resolved = aliasResolved || (rawPath ? { label: alias || path.basename(rawPath), path: rawPath } : null);
  if (!resolved?.path) return null;
  const localPath = normalizeLocalPath(resolved.path);
  if (!localPath || !fs.existsSync(localPath)) return null;
  if (!isDirectoryBrowserPathAllowedForThread(thread, localPath, resolved.path)) return null;
  const label = resolved.label || path.basename(localPath);
  return {
    label,
    displayPath: resolved.path,
    workspacePath: logicalDirectoryDisplayPath(thread, resolved.path, label),
    localPath,
  };
}

async function resolveVolume1RemoteBrowserPath(thread, fallback) {
  const displayPath = String(fallback?.path || "").trim();
  if (!displayPath.startsWith("/volume1/")) return null;
  if (!isDirectoryBrowserPathAllowedForThread(thread, "", displayPath)) return null;

  let result;
  try {
    result = await runDirectoryBridge({ action: "stat", path: displayPath });
  } catch (_) {
    return null;
  }
  if (!result?.ok || !result.entry) return null;
  const label = fallback?.label || result.entry.name || path.basename(displayPath);
  return {
    label,
    displayPath,
    workspacePath: logicalDirectoryDisplayPath(thread, displayPath, label),
    localPath: "",
    remote: "wsl",
    remotePath: displayPath,
    remoteEntry: result.entry,
  };
}

async function resolveBrowserPathAsync(thread, query) {
  const rawPath = String(query.get("path") || "").trim();
  const alias = String(query.get("alias") || "").trim();
  const aliasResolved = alias ? resolveDirectoryAlias(thread, alias) : null;
  const fallback = aliasResolved || (rawPath ? { label: alias || path.basename(rawPath), path: rawPath } : null);

  const remoteVolume1 = await resolveVolume1RemoteBrowserPath(thread, fallback);
  if (remoteVolume1) return remoteVolume1;

  return resolveBrowserPath(thread, query);
}

function directoryRequestParams(body = {}) {
  const params = new URLSearchParams();
  for (const name of ["threadId", "path", "alias"]) {
    const value = String(body[name] || "").trim();
    if (value) params.set(name, value);
  }
  return params;
}

function assertChildPathInside(parentPath, childPath) {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  const relative = path.relative(parent, child);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    const err = new Error("Target path escapes the current directory");
    err.status = 400;
    throw err;
  }
}

function protectedDirectoryRoots(thread) {
  const policy = policyForThread(thread);
  const roots = [
    policy.default_workspace,
    policy.sync_root,
    policy.download_root,
    ...(policy.allowed_roots || []),
    ...(policy.delivery_roots || []),
    ...allProjectsForWorkspaceSync(thread.workspaceId)
      .flatMap((project) => [project.root, ...(project.children || []).map((child) => child.root)]),
  ].filter(Boolean);
  return dedupe(roots.flatMap((root) => [root, normalizeLocalPath(root)].filter(Boolean)));
}

function isProtectedDirectoryRoot(thread, localPath, displayPath = "") {
  const localKey = comparablePath(localPath);
  const displayKey = comparablePath(displayPath);
  return protectedDirectoryRoots(thread).some((root) => {
    const key = comparablePath(root);
    return key && (key === localKey || key === displayKey);
  });
}

function directoryRootProjectForPathSync(thread, localPath, displayPath = "") {
  const localKey = comparablePath(localPath);
  const displayKey = comparablePath(displayPath);
  return allProjectsForWorkspaceSync(thread.workspaceId).find((project) => {
    const key = comparablePath(project?.root);
    return key && (key === localKey || key === displayKey);
  }) || null;
}

function isDeletableWorkspaceRootChild(thread, localPath, displayPath = "") {
  const policy = policyForThread(thread);
  const defaultWorkspace = policy.default_workspace || "";
  if (!defaultWorkspace) return false;
  const project = directoryRootProjectForPathSync(thread, localPath, displayPath);
  if (project) {
    const source = String(project.source || "");
    if (source !== "workspace-directory" && source !== "workspace-directory-wsl") return false;
    if (project.shared || project.hidden || project.singleWindow) return false;
    if (["general", "sync", "download"].includes(String(project.id || ""))) return false;
  }
  const candidates = [displayPath, localPath, normalizeLocalPath(localPath)].filter(Boolean);
  const hardProtected = [
    policy.default_workspace,
    policy.sync_root,
    policy.download_root,
    ...(policy.delivery_roots || []),
    ...(policy.cache_roots || []),
    ...sharedDirectoryRoots(thread.workspaceId),
  ].filter(Boolean);
  if (candidates.some((candidate) => hardProtected.some((root) => comparablePath(candidate) === comparablePath(root)))) {
    return false;
  }
  return candidates.some((candidate) => pathDirectChildOfRoot(candidate, defaultWorkspace));
}

function isOwnWritableDirectoryPath(thread, localPath, displayPath = "") {
  const policy = policyForThread(thread);
  if (policy.access_mode === "unrestricted" || policy.principal_id === "owner") return true;
  const roots = [
    policy.default_workspace,
    policy.sync_root,
    policy.download_root,
  ].filter(Boolean);
  return pathInsideAnyRoot(displayPath || localPath, roots)
    || pathInsideAnyRoot(localPath, roots.map(normalizeLocalPath));
}

function caseTopicDirectoryRoots(thread) {
  if (!isKanbanCaseTopicThread(thread)) return [];
  const roots = [];
  for (const meta of Object.values(normalizeTaskGroupMeta(thread.taskGroupMeta))) {
    if (!meta || typeof meta !== "object") continue;
    if (meta.directoryRoute?.root) roots.push(meta.directoryRoute.root);
    if (meta.directoryRoute?.path) roots.push(meta.directoryRoute.path);
    if (meta.caseDirectoryPath) roots.push(meta.caseDirectoryPath);
  }
  return dedupe(roots.filter(Boolean));
}

function isReadOnlyCaseTopicDirectoryForAuth(thread, auth, localPath, displayPath = "") {
  if (!isKanbanCaseTopicThread(thread)) return false;
  if (isOwnerAuth(auth) || authCanAccessWorkspace(auth, thread.workspaceId)) return false;
  const actorWorkspaceId = String(auth?.workspaceId || "").trim();
  if (!actorWorkspaceId || !chatGroupMemberWorkspaceIds(thread).includes(actorWorkspaceId)) return false;
  const roots = caseTopicDirectoryRoots(thread);
  if (!roots.length) return false;
  return pathInsideAnyRoot(displayPath || localPath, roots)
    || pathInsideAnyRoot(localPath, roots)
    || pathInsideAnyRoot(normalizeLocalPath(localPath), roots.map(normalizeLocalPath));
}

function isSharedDirectoryWriteAllowed(thread, localPath, displayPath = "", auth = null) {
  if (isReadOnlyCaseTopicDirectoryForAuth(thread, auth, localPath, displayPath)) return false;
  if (isOwnWritableDirectoryPath(thread, localPath, displayPath)) return true;
  return sharedDirectoryProvider.isWriteAllowed(thread, localPath, displayPath);
}

function publicManagedEntry(thread, parentDisplayPath, parentLocalPath, localPath) {
  const name = path.basename(localPath);
  return publicDirectoryEntry(thread, parentDisplayPath, parentLocalPath, {
    name,
    isDirectory: () => fs.statSync(localPath).isDirectory(),
  });
}

function joinDisplayPath(parent, name) {
  const base = String(parent || "");
  if (base.includes("/") && !base.includes("\\")) return `${base.replace(/\/+$/, "")}/${name}`;
  return path.join(base, name);
}

function publicDirectoryEntry(thread, parentDisplayPath, parentLocalPath, dirent) {
  if (isHiddenDirectoryEntryName(dirent.name)) return null;
  const localPath = path.join(parentLocalPath, dirent.name);
  let stat;
  try {
    stat = fs.statSync(localPath);
  } catch (_) {
    return null;
  }
  const displayPath = joinDisplayPath(parentDisplayPath || parentLocalPath, dirent.name);
  const isDirectory = stat.isDirectory();
  const params = new URLSearchParams({ threadId: thread.id, path: displayPath });
  const workspacePath = logicalDirectoryDisplayPath(thread, displayPath, dirent.name);
  return {
    name: dirent.name,
    type: isDirectory ? "directory" : "file",
    size: isDirectory ? 0 : stat.size,
    mtime: stat.mtime.toISOString(),
    mime: isDirectory ? "" : mimeFor(localPath),
    path: displayPath,
    displayPath: workspacePath,
    workspacePath,
    url: isDirectory ? `/directory-viewer.html?${params.toString()}` : `/api/files?${params.toString()}`,
  };
}

function publicRemoteDirectoryEntry(thread, parentDisplayPath, entry) {
  if (isHiddenDirectoryEntryName(entry?.name)) return null;
  const displayPath = String(entry?.path || joinDisplayPath(parentDisplayPath, entry?.name || ""));
  const isDirectory = entry?.type === "directory";
  const params = new URLSearchParams({ threadId: thread.id, path: displayPath });
  const workspacePath = logicalDirectoryDisplayPath(thread, displayPath, entry?.name || path.posix.basename(displayPath));
  return {
    name: String(entry?.name || path.posix.basename(displayPath) || "item"),
    type: isDirectory ? "directory" : "file",
    size: isDirectory ? 0 : Number(entry?.size || 0),
    mtime: String(entry?.mtime || ""),
    mime: isDirectory ? "" : String(entry?.mime || mimeFor(displayPath)),
    path: displayPath,
    displayPath: workspacePath,
    workspacePath,
    url: isDirectory ? `/directory-viewer.html?${params.toString()}` : `/api/files?${params.toString()}`,
  };
}

function directoryEntryTimeMs(entry) {
  const time = Date.parse(String(entry?.mtime || entry?.updatedAt || ""));
  return Number.isFinite(time) ? time : 0;
}

function compareDirectoryEntriesNewestFirst(a, b) {
  if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
  const timeDelta = directoryEntryTimeMs(b) - directoryEntryTimeMs(a);
  if (timeDelta) return timeDelta;
  return String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans-CN");
}

function isHiddenDirectoryEntryName(name) {
  const text = String(name || "").trim();
  return !text || text.startsWith(".") || text.startsWith("@") || text.startsWith("#");
}

function resolveFileForBrowserRequest(query, auth = null) {
  const artifactId = String(query.get("artifactId") || "").trim();
  if (artifactId) {
    const resolvedArtifact = resolveArtifactForRequest(artifactId, auth);
    if (!resolvedArtifact.artifact) return { status: resolvedArtifact.status || 404, error: resolvedArtifact.error || "Artifact not found" };
    const artifact = resolvedArtifact.artifact;
    const localPath = artifact.localPath || artifact.path;
    let stat;
    try {
      stat = fs.statSync(localPath);
    } catch (_) {
      return { status: 404, error: "Artifact not found" };
    }
    if (!stat.isFile()) return { status: 400, error: "Artifact path is not a file" };
    return {
      file: {
        localPath,
        displayPath: logicalUserPathFallback(artifact.displayPath || artifact.path || localPath, artifact.name || ""),
        name: artifact.name || path.basename(localPath),
        mime: artifact.mime || mimeFor(localPath),
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
      },
    };
  }

  const threadId = String(query.get("threadId") || "");
  const thread = state.threads.find((item) => item.id === threadId);
  if (!thread) return { status: 404, error: "Thread not found" };
  if (auth && !authCanAccessWorkspace(auth, thread.workspaceId)) return { status: 404, error: "Thread not found" };
  const resolved = resolveBrowserPath(thread, query);
  if (!resolved) return { status: 404, error: "File not found or not allowed" };
  let stat;
  try {
    stat = fs.statSync(resolved.localPath);
  } catch (_) {
    return { status: 404, error: "File not found" };
  }
  if (!stat.isFile()) return { status: 400, error: "Path is not a file" };
  return {
    file: {
      localPath: resolved.localPath,
      displayPath: resolved.workspacePath || logicalDirectoryDisplayPath(thread, resolved.displayPath, path.basename(resolved.localPath)),
      name: path.basename(resolved.localPath),
      mime: mimeFor(resolved.localPath),
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
    },
  };
}

function resolveArtifactForRequest(artifactId, auth = null) {
  let artifact = state.artifacts.find((item) => String(item.id || "") === String(artifactId || ""));
  let reference = null;
  if (!artifact) {
    reference = findArtifactReferenceById(artifactId);
    if (!reference) {
      return { status: 404, error: "Artifact not found" };
    }
    artifact = {
      ...reference.artifact,
      id: String(artifactId || ""),
      threadId: reference.thread.id,
      messageId: reference.message.id,
      workspaceId: reference.thread.workspaceId,
      projectId: reference.thread.projectId,
      subprojectId: reference.thread.subprojectId || "",
    };
  }
  let thread = null;
  let localPath = artifact.path ? normalizeLocalPath(artifact.path) : "";
  if (!localPath || !fs.existsSync(localPath)) {
    reference = reference || findArtifactReference(artifact);
    const recoveredPath = reference ? resolveArtifactPathFromMessage(artifact, reference.message) : null;
    if (!reference || !recoveredPath) {
      return { status: 404, error: "Artifact not found" };
    }
    thread = reference.thread;
    localPath = recoveredPath.localPath;
    artifact = {
      ...artifact,
      path: artifact.path || recoveredPath.rawPath,
      displayPath: artifact.displayPath || recoveredPath.rawPath,
      threadId: artifact.threadId || reference.thread.id,
      messageId: artifact.messageId || reference.message.id,
      workspaceId: artifact.workspaceId || reference.thread.workspaceId,
      localPath,
    };
  }
  if (artifact.threadId) {
    thread = thread || state.threads.find((item) => item.id === String(artifact.threadId || ""));
    if (!thread) return { status: 404, error: "Artifact not found" };
    if (auth && !artifactAccessibleToAuth(auth, thread, artifact)) {
      return { status: 404, error: "Artifact not found" };
    }
    if (!isPathAllowedForThread(thread, localPath, artifact.displayPath || artifact.path)) {
      return { status: 404, error: "Artifact not found" };
    }
    return { artifact: { ...artifact, localPath }, thread };
  }
  if (auth && !isOwnerAuth(auth)) {
    return { status: 404, error: "Artifact not found" };
  }
  if (!isPathAllowed(localPath)) {
    return { status: 404, error: "Artifact not found" };
  }
  return { artifact: { ...artifact, localPath }, thread: null };
}

async function resolveAuthorizedCronOutputFile(query, auth = null) {
  return automationProvider.resolveAuthorizedOutputFile({ query, auth });
}

async function resolveAuthorizedCronDeliverableFile(query, auth = null) {
  return automationProvider.resolveAuthorizedDeliverableFile({ query, auth });
}

function sendResolvedFile(res, file, query) {
  const disposition = /^(1|true|yes|on)$/i.test(String(query.get("download") || ""))
    ? "attachment"
    : "inline";
  res.writeHead(200, {
    "Content-Type": file.mime || mimeFor(file.localPath),
    "Content-Length": file.size,
    "Content-Disposition": contentDisposition(disposition, file.name || path.basename(file.localPath)),
    "Cache-Control": "private, max-age=60",
  });
  fs.createReadStream(file.localPath).pipe(res);
}

function bridgeFileBuffer(file) {
  return Buffer.from(String(file?.contentBase64 || ""), "base64");
}

function sendResolvedBridgeFile(res, file, query) {
  const buffer = bridgeFileBuffer(file);
  const disposition = /^(1|true|yes|on)$/i.test(String(query.get("download") || ""))
    ? "attachment"
    : "inline";
  res.writeHead(200, {
    "Content-Type": file.mime || mimeFor(file.name || file.displayPath || ""),
    "Content-Length": buffer.length,
    "Content-Disposition": contentDisposition(disposition, file.name || path.basename(file.displayPath || "automation-deliverable")),
    "Cache-Control": "private, max-age=60",
  });
  res.end(buffer);
}

function sendResolvedFilePreview(res, file) {
  const ext = path.extname(file.localPath).toLowerCase();
  try {
    let preview;
    if (ext === ".docx") preview = extractDocxText(file.localPath);
    else if ([".txt", ".md", ".csv", ".json"].includes(ext) || /^text\//i.test(file.mime)) preview = textFilePreview(file.localPath);
    else {
      sendJson(res, 415, { error: "Preview is not supported for this file type", name: file.name, mime: file.mime });
      return;
    }
    sendJson(res, 200, {
      name: file.name,
      mime: file.mime,
      size: file.size,
      updatedAt: file.updatedAt,
      path: file.displayPath,
      text: preview.text,
      totalChars: preview.totalChars,
      truncated: preview.truncated,
    });
  } catch (err) {
    sendJson(res, 422, { error: `Preview failed: ${err.message || String(err)}` });
  }
}

function sendResolvedBridgeFilePreview(res, file) {
  const ext = path.extname(file.name || file.displayPath || "").toLowerCase();
  try {
    const buffer = bridgeFileBuffer(file);
    let text = "";
    if ([".txt", ".md", ".csv", ".json"].includes(ext) || /^text\//i.test(file.mime || "")) {
      text = buffer.toString("utf8");
    } else {
      sendJson(res, 415, { error: "Preview is not supported for this file type", name: file.name, mime: file.mime });
      return;
    }
    const truncated = text.length > MAX_FILE_PREVIEW_CHARS;
    sendJson(res, 200, {
      name: file.name,
      mime: file.mime,
      size: file.size || buffer.length,
      updatedAt: file.updatedAt,
      path: file.displayPath,
      text: truncated ? text.slice(0, MAX_FILE_PREVIEW_CHARS) : text,
      totalChars: text.length,
      truncated,
    });
  } catch (err) {
    sendJson(res, 422, { error: `Preview failed: ${err.message || String(err)}` });
  }
}

function maybeRejectModelMaintenanceRequest(res, text, auth) {
  const classification = securityBoundaryProvider.classifyMaintenanceIntent(text);
  if (!classification) return false;
  sendJson(res, isOwnerAuth(auth) ? 409 : 403, {
    error: classification.message,
    code: classification.category,
    operatorRequired: true,
  });
  return true;
}

async function handleApi(req, res) {
  const url = getUrl(req);
  attachClientVersionHeaders(req, res);

  if (url.pathname === "/api/public-config") {
    sendJson(res, 200, Object.assign({ title: "Hermes Mobile" }, ownerSetupStatus()));
    return;
  }

  if (url.pathname === "/api/setup/status" && req.method === "GET") {
    sendJson(res, 200, ownerSetupStatus());
    return;
  }

  if (url.pathname === "/api/setup/owner" && req.method === "POST") {
    try {
      await readBody(req).catch(() => ({}));
      const result = createInitialOwnerKey();
      res.writeHead(201, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Set-Cookie": `hermes_web_key=${encodeURIComponent(result.key || "")}; Path=/; Max-Age=31536000; SameSite=Lax`,
      });
      res.end(JSON.stringify(Object.assign({ ok: true }, result, ownerSetupStatus())));
    } catch (err) {
      sendJson(res, err.status || 500, { error: err.message || String(err), setup: ownerSetupStatus() });
    }
    return;
  }

  if (url.pathname === "/api/login" && req.method === "POST") {
    const body = await readBody(req);
    const probe = { headers: Object.assign({}, req.headers, { "x-hermes-web-key": body.key || "" }), url: req.url };
    const auth = authenticateRequest(probe);
    if (!auth.ok) {
      sendJson(res, 401, { error: "Invalid key" });
      return;
    }
    res.writeHead(204, {
      "Set-Cookie": `hermes_web_key=${encodeURIComponent(body.key || "")}; Path=/; Max-Age=31536000; SameSite=Lax`,
      "Cache-Control": "no-store",
    });
    res.end();
    return;
  }

  if (url.pathname === "/api/ingress/weixin/events" && req.method === "POST") {
    if (!requireWeixinIngress(req, res)) return;
    const body = await readBody(req).catch((err) => ({ __error: err }));
    if (body.__error) {
      sendJson(res, 400, { ok: false, error: body.__error.message || "Invalid request body" });
      return;
    }
    try {
      const result = await startWeixinIngressEvent(body);
      sendJson(res, result.duplicate ? 200 : 202, result);
    } catch (err) {
      sendJson(res, err.status || 500, Object.assign({ ok: false, error: err.message || String(err) }, err.result || {}));
    }
    return;
  }

  if (url.pathname === "/api/ingress/weixin/outbound" && req.method === "GET") {
    if (!requireWeixinIngress(req, res)) return;
    const data = pendingWeixinOutboundDeliveries({
      status: url.searchParams.get("status") || "pending",
      accountId: url.searchParams.get("accountId") || url.searchParams.get("account_id") || "",
      limit: url.searchParams.get("limit") || "",
    });
    sendJson(res, 200, { ok: true, data });
    return;
  }

  const weixinOutboundAck = url.pathname.match(/^\/api\/ingress\/weixin\/outbound\/([^/]+)\/ack$/);
  if (weixinOutboundAck && req.method === "POST") {
    if (!requireWeixinIngress(req, res)) return;
    const body = await readBody(req).catch((err) => ({ __error: err }));
    if (body.__error) {
      sendJson(res, 400, { ok: false, error: body.__error.message || "Invalid request body" });
      return;
    }
    try {
      const ack = weixinIngressProvider.normalizeAck(body);
      const delivery = ackWeixinOutboundDelivery(decodeURIComponent(weixinOutboundAck[1]), ack);
      if (!delivery) {
        sendJson(res, 404, { ok: false, error: "Delivery not found" });
        return;
      }
      sendJson(res, 200, { ok: true, delivery });
    } catch (err) {
      sendJson(res, err.status || 500, { ok: false, error: err.message || String(err) });
    }
    return;
  }

  const auth = authenticateRequest(req);
  if (!auth.ok) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }

  if (url.pathname === "/api/client-version" && req.method === "GET") {
    sendJson(res, 200, Object.assign(clientVersionInfo(requestClientVersion(req)), { reasoning: publicReasoningInfoForAuth(auth) }));
    return;
  }

  if (url.pathname === "/api/app-update/status" && req.method === "GET") {
    if (!requireOwner(req, res)) return;
    try {
      sendJson(res, 200, await appUpdateStatus());
    } catch (err) {
      sendJson(res, 200, { ok: false, updateAvailable: false, warning: compactText(err.message || String(err), 800) });
    }
    return;
  }

  if (url.pathname === "/api/app-update/apply" && req.method === "POST") {
    if (!requireOwner(req, res)) return;
    try {
      const result = await applyAppUpdate();
      sendJson(res, result.ok ? 200 : 409, result);
    } catch (err) {
      sendJson(res, 500, { ok: false, error: compactText(err.message || String(err), 800) });
    }
    return;
  }

  if (url.pathname === "/api/status" && req.method === "GET") {
    bootTrace("request api/status enter");
    const status = await getHermesStatus();
    bootTrace("request api/status after getHermesStatus");
    status.gatewayPool = publicGatewayPoolStatusForAuth(auth, status.gatewayPool);
    if (isOwnerAuth(auth) && STATUS_INCLUDE_CATALOG) status.catalog = loadCatalog().sources;
    bootTrace("request api/status after optional catalog");
    status.display = {
      ownerLabel: OWNER_LABEL,
      ownerDriveRootNames: OWNER_DRIVE_ROOT_NAMES,
      ownerRootFallbackLabel: OWNER_ROOT_FALLBACK_LABEL,
    };
    status.push = publicPushStatus();
    bootTrace("request api/status after push status");
    status.reasoning = publicReasoningInfoForAuth(auth);
    bootTrace("request api/status after reasoning");
    status.concurrency = publicConcurrencyForAuth(auth);
    status.ownerElevation = publicOwnerElevationStatus(auth);
    status.clientVersion = clientVersionInfo(req.headers["x-hermes-web-client-version"] || "");
    bootTrace("request api/status before send");
    sendJson(res, 200, status);
    return;
  }

  if (url.pathname === "/api/weixin/forward-targets" && req.method === "GET") {
    const workspaceId = String(url.searchParams.get("workspaceId") || url.searchParams.get("workspace_id") || auth.workspaceId || "owner").trim() || "owner";
    if (!authCanAccessWorkspace(auth, workspaceId)) {
      sendJson(res, 403, { error: "Workspace access is not allowed" });
      return;
    }
    sendJson(res, 200, { ok: true, data: weixinForwardTargetsForWorkspace(workspaceId, auth) });
    return;
  }

  if (url.pathname === "/api/weixin/forward-file" && req.method === "POST") {
    const body = await readBody(req).catch((err) => ({ __error: err }));
    if (body.__error) {
      sendJson(res, 400, { error: body.__error.message || "Invalid request body" });
      return;
    }
    try {
      const result = await createWeixinFileForwardDelivery(auth, body);
      sendJson(res, 202, result);
    } catch (err) {
      sendJson(res, err.status || 500, {
        ok: false,
        error: err.message || String(err),
        code: err.code || "weixin_forward_failed",
      });
    }
    return;
  }

  if (url.pathname === "/api/owner-elevation" && req.method === "GET") {
    const ownerAuth = requireOwner(req, res);
    if (!ownerAuth) return;
    sendJson(res, 200, { ok: true, ownerElevation: publicOwnerElevationStatus(ownerAuth) });
    return;
  }

  if (url.pathname === "/api/owner-elevation/once" && req.method === "POST") {
    const ownerAuth = requireOwner(req, res);
    if (!ownerAuth) return;
    try {
      const grant = grantOwnerElevationOnce(ownerAuth);
      sendJson(res, 200, {
        ok: true,
        ownerElevationOnce: {
          token: grant.token,
          expiresAt: grant.expiresAt,
          grantedAt: grant.grantedAt,
        },
        ownerElevation: publicOwnerElevationStatus(ownerAuth),
      });
    } catch (err) {
      sendJson(res, err.status || 500, { error: err.message || String(err), ownerElevation: publicOwnerElevationStatus(ownerAuth) });
    }
    return;
  }

  if (url.pathname === "/api/owner-elevation" && req.method === "POST") {
    const ownerAuth = requireOwner(req, res);
    if (!ownerAuth) return;
    const body = await readBody(req).catch((err) => ({ __error: err }));
    if (body.__error) {
      sendJson(res, 400, { error: body.__error.message || "Invalid request body" });
      return;
    }
    try {
      grantOwnerElevation(ownerAuth, body.durationMinutes || body.duration_minutes);
      sendJson(res, 200, { ok: true, ownerElevation: publicOwnerElevationStatus(ownerAuth) });
    } catch (err) {
      sendJson(res, err.status || 500, { error: err.message || String(err), ownerElevation: publicOwnerElevationStatus(ownerAuth) });
    }
    return;
  }

  if (url.pathname === "/api/owner-elevation" && req.method === "DELETE") {
    const ownerAuth = requireOwner(req, res);
    if (!ownerAuth) return;
    try {
      revokeOwnerElevation(ownerAuth);
      sendJson(res, 200, { ok: true, ownerElevation: publicOwnerElevationStatus(ownerAuth) });
    } catch (err) {
      sendJson(res, err.status || 500, { error: err.message || String(err), ownerElevation: publicOwnerElevationStatus(ownerAuth) });
    }
    return;
  }

  if (url.pathname === "/api/runtime-config" && req.method === "GET") {
    if (!requireOwner(req, res)) return;
    sendJson(res, 200, { ok: true, config: publicRuntimeConfig() });
    return;
  }

  if (url.pathname === "/api/runtime-config" && req.method === "PATCH") {
    const ownerAuth = requireOwner(req, res);
    if (!ownerAuth) return;
    const body = await readBody(req).catch((err) => ({ __error: err }));
    if (body.__error) {
      sendJson(res, 400, { error: body.__error.message || "Invalid request body" });
      return;
    }
    try {
      saveRuntimeConfig(body, ownerAuth.principalId || "owner");
      webPushConfig = initializeWebPush();
      sendJson(res, 200, { ok: true, config: publicRuntimeConfig(), push: publicPushStatus() });
    } catch (err) {
      sendJson(res, err.status || 500, { error: err.message || String(err) });
    }
    return;
  }

  if (url.pathname === "/api/runtime-config/web-push/generate" && req.method === "POST") {
    if (!requireOwner(req, res)) return;
    const body = await readBody(req).catch(() => ({}));
    try {
      const generated = generateWebPushVapidConfig({ overwrite: boolParam(body.overwrite) });
      sendJson(res, 201, { ok: true, generated, config: publicRuntimeConfig(), push: publicPushStatus() });
    } catch (err) {
      sendJson(res, err.status || 500, { error: err.message || String(err), config: publicRuntimeConfig(), push: publicPushStatus() });
    }
    return;
  }

  if (url.pathname === "/api/runtime-config/web-push/reload" && req.method === "POST") {
    if (!requireOwner(req, res)) return;
    webPushConfig = initializeWebPush();
    sendJson(res, 200, { ok: Boolean(webPushConfig), config: publicRuntimeConfig(), push: publicPushStatus() });
    return;
  }

  if (url.pathname === "/api/runtime-config/test" && req.method === "POST") {
    if (!requireOwner(req, res)) return;
    const status = await getHermesStatus();
    status.concurrency = runConcurrencySnapshot();
    sendJson(res, 200, { ok: Boolean(status.ok), status, config: publicRuntimeConfig() });
    return;
  }

  if (url.pathname === "/api/push/vapid-public-key" && req.method === "GET") {
    sendJson(res, 200, publicPushStatus());
    return;
  }

  if (url.pathname === "/api/push/receipt" && req.method === "POST") {
    const body = await readBody(req).catch(() => ({}));
    const receipt = recordPushReceipt(body);
    sendJson(res, 201, { ok: Boolean(receipt), receipt });
    return;
  }

  if (url.pathname === "/api/push/receipts" && req.method === "GET") {
    if (!requireOwner(req, res)) return;
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || 50)));
    sendJson(res, 200, { ok: true, data: (state.pushReceipts || []).slice(-limit).reverse() });
    return;
  }

  if (url.pathname === "/api/push/deliveries" && req.method === "GET") {
    if (!requireOwner(req, res)) return;
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || 50)));
    sendJson(res, 200, { ok: true, data: (state.pushDeliveries || []).slice(-limit).reverse() });
    return;
  }

  if (url.pathname === "/api/push/subscribe" && req.method === "POST") {
    if (!webPushConfig) {
      sendJson(res, 503, { error: "Web Push is not configured", push: publicPushStatus() });
      return;
    }
    try {
      const body = await readBody(req);
      const subscription = body.subscription || body;
      const workspaceId = requireWorkspaceAccess(req, res, body.workspaceId || body.workspace_id || "owner");
      if (!workspaceId) return;
      const pushWorkspaceId = pushWorkspaceForAuth(authenticateRequest(req), workspaceId);
      const saved = savePushSubscription(subscription, {
        deviceLabel: body.deviceLabel || body.label || "",
        userAgent: req.headers["user-agent"] || "",
        workspaceId: pushWorkspaceId,
        principalId: workspacePrincipal(pushWorkspaceId),
      });
      sendJson(res, 201, { ok: true, subscription: saved, push: publicPushStatus() });
    } catch (err) {
      sendJson(res, 400, { error: err.message || String(err), push: publicPushStatus() });
    }
    return;
  }

  if (url.pathname === "/api/push/unsubscribe" && req.method === "POST") {
    const body = await readBody(req).catch(() => ({}));
    const endpoint = body.endpoint || body.subscription?.endpoint || "";
    const removed = removePushSubscription(endpoint || body.subscription || body);
    sendJson(res, 200, { ok: true, removed, push: publicPushStatus() });
    return;
  }

  if (url.pathname === "/api/push/test" && req.method === "POST") {
    const body = await readBody(req).catch(() => ({}));
    const workspaceId = requireWorkspaceAccess(req, res, body.workspaceId || body.workspace_id || "owner");
    if (!workspaceId) return;
    const pushWorkspaceId = pushWorkspaceForAuth(authenticateRequest(req), workspaceId);
    const targetPrincipalId = workspacePrincipal(pushWorkspaceId);
    const sentAt = nowIso();
    const testId = `test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const result = await sendPushNotification({
      title: "\u901a\u77e5\u6d4b\u8bd5",
      body: `Test notification ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`,
      tag: `hermes-web-test-${testId}`,
      renotify: true,
      requireInteraction: true,
      silent: false,
      timestamp: Date.now(),
      vibrate: [200, 100, 200, 100, 200],
      data: { url: appRouteUrl({ view: "tasks", workspaceId: pushWorkspaceId }), viewMode: "tasks", workspaceId: pushWorkspaceId, principalId: targetPrincipalId, messageType: "test", testId, sentAt, requireInteraction: true },
    }, { urgency: "high", ttl: 5 * 60, principalIds: [targetPrincipalId] });
    sendJson(res, 200, { ok: true, result, target: { workspaceId: pushWorkspaceId, principalId: targetPrincipalId, testId, sentAt }, push: publicPushStatus() });
    return;
  }

  if (url.pathname === "/api/workspaces" && req.method === "GET") {
    bootTrace("request api/workspaces enter");
    const catalog = loadCatalog();
    bootTrace("request api/workspaces after loadCatalog");
    sendJson(res, 200, { data: publicWorkspacesForAuth(auth).map(publicWorkspace), sources: catalog.sources, auth: { role: auth.role, workspaceId: auth.workspaceId, isOwner: isOwnerAuth(auth) } });
    bootTrace("request api/workspaces sent");
    return;
  }

  if (url.pathname === "/api/workspaces/defaults" && req.method === "GET") {
    const ownerAuth = requireOwner(req, res);
    if (!ownerAuth) return;
    try {
      const defaults = localWorkspaceDefaults({
        username: url.searchParams.get("username") || "",
        workspaceId: url.searchParams.get("workspaceId") || url.searchParams.get("id") || "",
        label: url.searchParams.get("label") || "",
      });
      sendJson(res, 200, {
        ok: true,
        defaults,
      });
    } catch (err) {
      sendJson(res, err.status || 500, { error: err.message || String(err) });
    }
    return;
  }

  if (url.pathname === "/api/workspaces" && req.method === "POST") {
    const ownerAuth = requireOwner(req, res);
    if (!ownerAuth) return;
    const body = await readBody(req).catch((err) => ({ __error: err }));
    if (body.__error) {
      sendJson(res, 400, { error: body.__error.message || "Invalid request body" });
      return;
    }
    try {
      const record = upsertLocalWorkspace(body, ownerAuth.principalId || "owner");
      const workspace = findWorkspace(record.id);
      sendJson(res, 201, { ok: true, workspace: publicWorkspace(workspace), record });
    } catch (err) {
      sendJson(res, err.status || 500, { error: err.message || String(err) });
    }
    return;
  }

  const workspaceAdmin = url.pathname.match(/^\/api\/workspaces\/([^/]+)$/);
  if (workspaceAdmin && ["PATCH", "DELETE"].includes(req.method)) {
    const ownerAuth = requireOwner(req, res);
    if (!ownerAuth) return;
    const workspaceId = decodeURIComponent(workspaceAdmin[1] || "");
    if (req.method === "PATCH") {
      const body = await readBody(req).catch((err) => ({ __error: err }));
      if (body.__error) {
        sendJson(res, 400, { error: body.__error.message || "Invalid request body" });
        return;
      }
      try {
        const record = upsertLocalWorkspace(Object.assign({}, body, { workspaceId }), ownerAuth.principalId || "owner");
        const workspace = findWorkspace(record.id);
        sendJson(res, 200, { ok: true, workspace: publicWorkspace(workspace), record });
      } catch (err) {
        sendJson(res, err.status || 500, { error: err.message || String(err) });
      }
      return;
    }
    try {
      const deleted = deleteLocalWorkspace(workspaceId);
      sendJson(res, 200, { ok: true, deleted });
    } catch (err) {
      sendJson(res, err.status || 500, { error: err.message || String(err) });
    }
    return;
  }

  if (url.pathname === "/api/access-keys" && req.method === "GET") {
    const accessAuth = requireOwner(req, res);
    if (!accessAuth) return;
    sendJson(res, 200, {
      ok: true,
      auth: {
        isOwner: isOwnerAuth(accessAuth),
        workspaceId: accessAuth.workspaceId || "",
        source: isOwnerAuth(accessAuth) ? authProvider.ownerKeySource() : "workspace",
        canRotateGlobal: isOwnerAuth(accessAuth) && authProvider.ownerKeySource() !== "env",
      },
      data: listWorkspaceAccessKeyStatuses(accessAuth, { workspaceId: url.searchParams.get("workspaceId") || "" }),
    });
    return;
  }

  if (url.pathname === "/api/access-keys/workspace" && req.method === "POST") {
    const accessAuth = requireOwner(req, res);
    if (!accessAuth) return;
    const body = await readBody(req).catch(() => ({}));
    const requestedWorkspaceId = String(body.workspaceId || body.workspace_id || "").trim();
    if (!requestedWorkspaceId) {
      sendJson(res, 400, { error: "workspaceId is required" });
      return;
    }
    try {
      const result = rotateWorkspaceAccessKey(requestedWorkspaceId, {
        dryRun: boolParam(body.dryRun || body.dry_run),
        actor: accessAuth.principalId || accessAuth.workspaceId || "owner",
      });
      sendJson(res, result.dryRun ? 200 : 201, {
        ok: true,
        key: result.key,
        workspace: result.record,
        dryRun: result.dryRun,
        requiresReLogin: false,
      });
    } catch (err) {
      sendJson(res, err.status || 500, { error: err.message || String(err) });
    }
    return;
  }

  const workspaceKeyAdmin = url.pathname.match(/^\/api\/access-keys\/workspace\/([^/]+)$/);
  if (workspaceKeyAdmin && req.method === "DELETE") {
    const accessAuth = requireOwner(req, res);
    if (!accessAuth) return;
    const requestedWorkspaceId = decodeURIComponent(workspaceKeyAdmin[1] || "").trim();
    if (!requestedWorkspaceId) {
      sendJson(res, 400, { error: "workspaceId is required" });
      return;
    }
    const body = await readBody(req).catch(() => ({}));
    try {
      const result = revokeWorkspaceAccessKey(requestedWorkspaceId, {
        dryRun: boolParam(body.dryRun || body.dry_run),
      });
      sendJson(res, 200, { ok: true, result, requiresReLogin: false });
    } catch (err) {
      sendJson(res, err.status || 500, { error: err.message || String(err) });
    }
    return;
  }

  if (url.pathname === "/api/access-keys/web" && req.method === "POST") {
    if (!requireOwner(req, res)) return;
    const body = await readBody(req).catch(() => ({}));
    try {
      const result = rotateGlobalAccessKey({ dryRun: boolParam(body.dryRun || body.dry_run) });
      sendJson(res, result.dryRun ? 200 : 201, {
        ok: true,
        key: result.key,
        auth: result.auth,
        dryRun: result.dryRun,
        requiresReLogin: !result.dryRun,
      });
    } catch (err) {
      sendJson(res, err.status || 500, { error: err.message || String(err) });
    }
    return;
  }

  if (url.pathname === "/api/projects" && req.method === "GET") {
    const workspaceId = requireWorkspaceAccess(req, res, url.searchParams.get("workspaceId") || "owner");
    if (!workspaceId) return;
    sendJson(res, 200, { data: await publicProjectsForWorkspace(workspaceId) });
    return;
  }

  if (url.pathname === "/api/directories/shared" && req.method === "GET") {
    const workspaceId = requireWorkspaceAccess(req, res, url.searchParams.get("workspaceId") || "owner");
    if (!workspaceId) return;
    const directories = sharedDirectoriesForWorkspace(workspaceId)
      .map((record) => publicSharedDirectory(record, workspaceId))
      .filter(Boolean);
    sendJson(res, 200, { ok: true, data: directories });
    return;
  }

  if (url.pathname === "/api/skills/detail" && req.method === "GET") {
    const skill = String(url.searchParams.get("skill") || "").trim();
    if (!skill) {
      sendJson(res, 400, { error: "Skill is required" });
      return;
    }
    try {
      const detail = await skillDetailProvider.detail(skill);
      sendJson(res, 200, { data: detail });
    } catch (err) {
      sendJson(res, err.status || 500, { error: compactText(err.message || String(err), 800), skill: err.skill || skill });
    }
    return;
  }

  if (url.pathname === "/api/automations" && req.method === "GET") {
    const workspaceId = requireWorkspaceAccess(req, res, url.searchParams.get("workspaceId") || "owner");
    if (!workspaceId) return;
    const ownerPrincipalId = workspacePrincipal(workspaceId);
    const requestedLimit = Number(url.searchParams.get("limit") || "200");
    const includeDisabled = boolParam(url.searchParams.get("includeDisabled") || "1");
    const bypassCache = boolParam(url.searchParams.get("refresh") || url.searchParams.get("fresh"));
    let result;
    try {
      result = await runCronListBridgeCached({ includeDisabled, bypassCache, ownerPrincipalId });
    } catch (err) {
      sendJson(res, 200, {
        data: [],
        source: { name: "hermes_cron", available: false, jobCount: 0, workspaceId, ownerPrincipalId },
        warning: compactText(err.message || String(err), 800),
      });
      return;
    }
    if (!result.ok) {
      sendJson(res, 200, {
        data: [],
        source: Object.assign({}, result.source || { name: "hermes_cron", available: false }, {
          jobCount: 0,
          workspaceId,
          ownerPrincipalId,
        }),
        warning: compactText(result.error || "Hermes CRON bridge failed", 800),
      });
      return;
    }
    const search = String(url.searchParams.get("search") || "").trim().toLowerCase();
    let jobs = (result.jobs || [])
      .filter((job) => cronJobMatchesOwner(job, ownerPrincipalId))
      .filter((job) => cronJobMatchesSearch(job, search))
      .sort(automationListSortByLatestDeliverable);
    if (requestedLimit > 0) jobs = jobs.slice(0, requestedLimit);
    sendJson(res, 200, {
      data: jobs,
      source: Object.assign({}, result.source || { name: "hermes_cron", available: true }, {
        jobCount: jobs.length,
        totalJobCount: result.source?.jobCount ?? (result.jobs || []).length,
        workspaceId,
        ownerPrincipalId,
      }),
      warning: result.warning || "",
    });
    return;
  }

  if (url.pathname === "/api/automations" && req.method === "POST") {
    const body = await readBody(req).catch(() => ({}));
    const workspaceId = requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    const workspace = findWorkspace(workspaceId);
    const text = String(body.text || body.prompt || "").trim();
    if (!text) {
      sendJson(res, 400, { error: "Automation description is required" });
      return;
    }
    const ownerPrincipalId = workspacePrincipal(workspaceId);
    let draft;
    try {
      draft = await interpretAutomationNaturalLanguage(text, workspace, ownerPrincipalId);
    } catch (err) {
      sendJson(res, err.status || 502, { error: compactText(err.message || String(err), 800) });
      return;
    }
    let result;
    try {
      result = await automationProvider.createJob({
        dryRun: boolParam(body.dryRun || body.dry_run),
        text,
        job: draft,
        ownerPrincipalId,
        accessPolicyContext: sanitizePolicy(workspace.policy || {}),
      });
    } catch (err) {
      sendJson(res, err.status || 500, { error: compactText(err.message || String(err), 800), draft });
      return;
    }
    if (!result.ok) {
      sendJson(res, 400, { error: compactText(result.error || "Hermes CRON create failed", 800), draft, result });
      return;
    }
    if (!boolParam(body.dryRun || body.dry_run)) clearCronListCache();
    sendJson(res, boolParam(body.dryRun || body.dry_run) ? 200 : 201, {
      ok: true,
      job: result.job,
      draft,
      source: Object.assign({}, result.source || {}, { workspaceId, ownerPrincipalId, interpreter: "hermes_model" }),
      dryRun: boolParam(body.dryRun || body.dry_run),
    });
    return;
  }

  const automationActionMatch = url.pathname.match(/^\/api\/automations\/([^/]+)\/(delete|pause|resume|update)$/);
  if (automationActionMatch && req.method === "POST") {
    const jobId = decodeURIComponent(automationActionMatch[1] || "");
    const action = automationActionMatch[2];
    const body = await readBody(req).catch(() => ({}));
    const workspaceId = requireWorkspaceAccess(req, res, body.workspaceId || url.searchParams.get("workspaceId") || "owner");
    if (!workspaceId) return;
    const workspace = findWorkspace(workspaceId);
    if (!jobId) {
      sendJson(res, 400, { error: "Automation job id is required" });
      return;
    }
    const ownerPrincipalId = workspacePrincipal(workspaceId);
    const dryRun = boolParam(body.dryRun ?? body.dry_run ?? url.searchParams.get("dryRun"));
    const patch = action === "update" ? {
      name: body.name,
      prompt: body.prompt,
      schedule: body.schedule,
      deliver: body.deliver,
      skills: body.skills,
      enabled_toolsets: body.enabled_toolsets || body.enabledToolsets,
      model: body.model,
      provider: body.provider,
      workdir: body.workdir,
    } : {};
    let result;
    try {
      result = await automationProvider.mutateJob({
        action,
        jobId,
        ownerPrincipalId,
        dryRun,
        patch,
        reason: String(body.reason || ""),
      });
    } catch (err) {
      sendJson(res, err.status || 500, { error: compactText(err.message || String(err), 800) });
      return;
    }
    if (!result.ok) {
      sendJson(res, result.status || 400, { error: compactText(result.error || "Hermes CRON action failed", 800), result });
      return;
    }
    if (!dryRun) clearCronListCache();
    sendJson(res, 200, {
      ok: true,
      job: result.job || null,
      deletedJob: result.deletedJob || null,
      source: Object.assign({}, result.source || {}, { workspaceId, ownerPrincipalId }),
      dryRun,
    });
    return;
  }

  if (url.pathname === "/api/automations/push/tick" && req.method === "POST") {
    if (!requireOwner(req, res)) return;
    const body = await readBody(req).catch(() => ({}));
    const result = await runAutomationWebPushTick({
      dryRun: boolParam(body.dryRun ?? body.dry_run ?? url.searchParams.get("dryRun")),
      includeInitial: boolParam(body.includeInitial ?? body.include_initial ?? url.searchParams.get("includeInitial")),
      limit: Number(body.limit || url.searchParams.get("limit") || 100),
    });
    sendJson(res, 200, result);
    return;
  }

  if (url.pathname === "/api/automations/deliverable" && req.method === "GET") {
    const resolved = await resolveAuthorizedCronDeliverableFile(url.searchParams, auth);
    if (resolved.bridgeFile) {
      sendResolvedBridgeFile(res, resolved.bridgeFile, url.searchParams);
      return;
    }
    if (!resolved.file) {
      sendJson(res, resolved.status || 404, { error: resolved.error || "Automation deliverable not found" });
      return;
    }
    sendResolvedFile(res, resolved.file, url.searchParams);
    return;
  }

  if (url.pathname === "/api/automations/deliverable/preview" && req.method === "GET") {
    const resolved = await resolveAuthorizedCronDeliverableFile(url.searchParams, auth);
    if (resolved.bridgeFile) {
      sendResolvedBridgeFilePreview(res, resolved.bridgeFile);
      return;
    }
    if (!resolved.file) {
      sendJson(res, resolved.status || 404, { error: resolved.error || "Automation deliverable not found" });
      return;
    }
    sendResolvedFilePreview(res, resolved.file);
    return;
  }

  if (url.pathname === "/api/automations/output" && req.method === "GET") {
    const resolved = await resolveAuthorizedCronOutputFile(url.searchParams, auth);
    if (resolved.bridgeFile) {
      sendResolvedBridgeFile(res, resolved.bridgeFile, url.searchParams);
      return;
    }
    if (!resolved.file) {
      sendJson(res, resolved.status || 404, { error: resolved.error || "Automation output not found" });
      return;
    }
    sendResolvedFile(res, resolved.file, url.searchParams);
    return;
  }

  if (url.pathname === "/api/automations/output/preview" && req.method === "GET") {
    const resolved = await resolveAuthorizedCronOutputFile(url.searchParams, auth);
    if (resolved.bridgeFile) {
      sendResolvedBridgeFilePreview(res, resolved.bridgeFile);
      return;
    }
    if (!resolved.file) {
      sendJson(res, resolved.status || 404, { error: resolved.error || "Automation output not found" });
      return;
    }
    sendResolvedFilePreview(res, resolved.file);
    return;
  }

  if (url.pathname === "/api/todos" && req.method === "GET") {
    const workspaceId = requireWorkspaceAccess(req, res, url.searchParams.get("workspaceId") || "owner");
    if (!workspaceId) return;
    let maintenance = null;
    if (useKanbanTodoBackend()) {
      maintenance = await maybeReconcileKanbanDependencyBlocks(workspaceId).catch((err) => ({ ok: false, error: err.message || String(err) }));
    }
    const result = await todoProvider.listTodos({
      workspaceId,
      scope: url.searchParams.get("scope") || "mine",
      includeCompleted: boolParam(url.searchParams.get("includeCompleted")),
      assignee: url.searchParams.get("assignee") || "",
      limit: Number(url.searchParams.get("limit") || "80"),
      search: url.searchParams.get("search") || "",
    });
    if (!result.ok) {
      todoErrorResponse(res, result.result || result);
      return;
    }
    sendJson(res, 200, {
      data: result.data,
      assignees: result.assignees,
      source: result.source,
      maintenance,
    });
    return;
  }

  if (url.pathname === "/api/kanban/cards" && req.method === "GET") {
    if (!useKanbanTodoBackend()) {
      sendJson(res, 409, { error: "Kanban backend is not enabled" });
      return;
    }
    const workspaceId = requireWorkspaceAccess(req, res, url.searchParams.get("workspaceId") || "owner");
    if (!workspaceId) return;
    const listArgs = {
      workspaceId,
      scope: url.searchParams.get("scope") || "mine",
      includeCompleted: boolParam(url.searchParams.get("includeCompleted")),
      assignee: url.searchParams.get("assignee") || "",
      limit: Number(url.searchParams.get("limit") || "120"),
      search: url.searchParams.get("search") || "",
    };
    const auth = authenticateRequest(req);
    const sharedCases = kanbanCaseSharesForActor(auth, workspaceId);
    const bypassCache = boolParam(url.searchParams.get("fresh")) || boolParam(url.searchParams.get("skipCache")) || boolParam(url.searchParams.get("noCache"));
    if (!bypassCache && !sharedCases.length) {
      const cached = readKanbanCardListCache(listArgs);
      if (cached) {
        scheduleKanbanDependencyReconcile(workspaceId);
        sendJson(res, 200, Object.assign({}, cached, { data: annotateKanbanCardsForAuth(cached.data, auth) }));
        return;
      }
    }
    const maintenance = scheduleKanbanDependencyReconcile(workspaceId);
    const result = await kanbanCardProvider.listCards(listArgs);
    if (!result.ok) {
      kanbanErrorResponse(res, result.result || result);
      return;
    }
    const sharedData = await sharedKanbanCardsForAuth(auth, workspaceId, listArgs);
    const data = annotateKanbanCardsForAuth(result.data, auth).concat(sharedData);
    const payload = {
      data,
      assignees: result.assignees,
      source: result.source,
      board: result.board,
      result: result.result,
      maintenance,
      sharedCases: sharedData.length,
    };
    if (!sharedCases.length) writeKanbanCardListCache(listArgs, payload);
    sendJson(res, 200, payload);
    return;
  }

  if (url.pathname === "/api/kanban/cards/output" && req.method === "GET") {
    const workspaceId = String(url.searchParams.get("workspaceId") || "owner").trim() || "owner";
    if (!findWorkspace(workspaceId)) {
      sendJson(res, 400, { error: "Unknown workspace" });
      return;
    }
    const resolved = resolveKanbanOutputFile(workspaceId, url.searchParams.get("path") || "", authenticateRequest(req));
    if (!resolved.file) {
      sendJson(res, resolved.status || 404, { error: resolved.error || "Kanban output not found" });
      return;
    }
    sendResolvedFile(res, resolved.file, url.searchParams);
    return;
  }

  if (url.pathname === "/api/kanban/cards/output/preview" && req.method === "GET") {
    const workspaceId = String(url.searchParams.get("workspaceId") || "owner").trim() || "owner";
    if (!findWorkspace(workspaceId)) {
      sendJson(res, 400, { error: "Unknown workspace" });
      return;
    }
    const resolved = resolveKanbanOutputFile(workspaceId, url.searchParams.get("path") || "", authenticateRequest(req));
    if (!resolved.file) {
      sendJson(res, resolved.status || 404, { error: resolved.error || "Kanban output not found" });
      return;
    }
    sendResolvedFilePreview(res, resolved.file);
    return;
  }

  const kanbanCardDetail = url.pathname.match(/^\/api\/kanban\/cards\/([^/]+)\/detail$/);
  if (kanbanCardDetail && req.method === "GET") {
    if (!useKanbanTodoBackend()) {
      sendJson(res, 409, { error: "Kanban backend is not enabled" });
      return;
    }
    const requestedWorkspaceId = url.searchParams.get("workspaceId") || "owner";
    const cardId = decodeURIComponent(kanbanCardDetail[1]);
    const access = await resolveKanbanCardAccess(req, res, requestedWorkspaceId, cardId, "view");
    if (!access) return;
    const workspaceId = access.workspaceId;
    const result = await kanbanCardProvider.cardDetail({
      workspaceId,
      cardId,
      logTail: Number(url.searchParams.get("logTail") || "12000"),
    });
    if (!result.ok) {
      kanbanErrorResponse(res, result.result || result);
      return;
    }
    sendJson(res, 200, {
      ok: true,
      detail: publicKanbanCardDetail(workspaceId, result),
      result,
    });
    return;
  }

  if (url.pathname === "/api/kanban/cards/plan" && req.method === "POST") {
    if (!useKanbanTodoBackend()) {
      sendJson(res, 409, { error: "Kanban backend is not enabled" });
      return;
    }
    const body = await readBody(req);
    const workspaceId = requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    const text = String(body.text || body.content || body.prompt || "").trim();
    if (!text) {
      sendJson(res, 400, { error: "Kanban plan text is required" });
      return;
    }
    try {
      const plan = await planKanbanMultiAgent(text, findWorkspace(workspaceId), workspacePrincipal(workspaceId));
      sendJson(res, 200, { ok: true, plan, maxParallel: KANBAN_MULTI_AGENT_MAX_PARALLEL });
    } catch (err) {
      sendJson(res, 502, { ok: false, error: compactText(err.message || String(err), 800) });
    }
    return;
  }

  if (url.pathname === "/api/kanban/cards/batch" && req.method === "POST") {
    if (!useKanbanTodoBackend()) {
      sendJson(res, 409, { error: "Kanban backend is not enabled" });
      return;
    }
    const body = await readBody(req);
    const workspaceId = requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    try {
      const result = await createKanbanPlanCards(workspaceId, body.plan || { cards: body.cards || [], sourceText: body.text || "" }, {
        assignee: body.assignee || "",
        sourceText: body.text || "",
      });
      if (!result.ok) {
        kanbanErrorResponse(res, result, 502);
        return;
      }
      clearKanbanCardListCache(workspaceId);
      broadcast({ type: "kanban.updated", workspaceId, action: "batch-add" });
      broadcast({ type: "todos.updated", workspaceId, action: "batch-add" });
      sendJson(res, 201, result);
    } catch (err) {
      sendJson(res, 500, { ok: false, error: compactText(err.message || String(err), 800) });
    }
    return;
  }

  if (url.pathname === "/api/kanban/cards/study-plan" && req.method === "POST") {
    if (!useKanbanTodoBackend()) {
      sendJson(res, 409, { error: "Kanban backend is not enabled" });
      return;
    }
    const body = await readBody(req, Math.ceil(KANBAN_READING_COVER_MAX_BYTES * 1.4) + 200000);
    const workspaceId = requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    try {
      const result = await createKanbanStudyPlanCards(workspaceId, body);
      if (!result.ok) {
        kanbanErrorResponse(res, result, 502);
        return;
      }
      clearKanbanCardListCache(workspaceId);
      broadcast({ type: "kanban.updated", workspaceId, action: "study-plan-add" });
      broadcast({ type: "todos.updated", workspaceId, action: "study-plan-add" });
      sendJson(res, 201, result);
    } catch (err) {
      sendJson(res, err.status || 500, { ok: false, error: compactText(err.message || String(err), 800) });
    }
    return;
  }

  if (url.pathname === "/api/kanban/cards/assessment-plan" && req.method === "POST") {
    if (!useKanbanTodoBackend()) {
      sendJson(res, 409, { error: "Kanban backend is not enabled" });
      return;
    }
    const body = await readBody(req, 240000);
    const workspaceId = requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    try {
      const result = await createKanbanAssessmentPlanCards(workspaceId, body);
      if (!result.ok) {
        kanbanErrorResponse(res, result, 502);
        return;
      }
      clearKanbanCardListCache(workspaceId);
      broadcast({ type: "kanban.updated", workspaceId, action: "assessment-plan-add" });
      broadcast({ type: "todos.updated", workspaceId, action: "assessment-plan-add" });
      sendJson(res, 201, result);
    } catch (err) {
      sendJson(res, err.status || 500, { ok: false, error: compactText(err.message || String(err), 800) });
    }
    return;
  }

  if (url.pathname === "/api/todos" && req.method === "POST") {
    const body = await readBody(req);
    const workspaceId = requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    const result = await todoProvider.addTodo({
      workspaceId,
      assignee: body.assignee || "",
      content: body.content || "",
      dueTime: body.dueTime || body.due_time || "",
      suppressExternalNotice: true,
      reminderLeadMinutes: body.reminderLeadMinutes ?? body.reminder_lead_minutes ?? null,
      recurrence: body.recurrence || "none",
      recurrenceDays: body.recurrenceDays || body.recurrence_days || "",
      recurrenceUntil: body.recurrenceUntil || body.recurrence_until || "",
    });
    if (!result.ok) {
      todoErrorResponse(res, result);
      return;
    }
    clearKanbanCardListCache(workspaceId);
    broadcast({ type: "todos.updated", workspaceId });
    notifyTodoCreated(result, workspacePrincipal(workspaceId));
    sendJson(res, 201, { todo: publicTodo(result), result });
    return;
  }

  if (url.pathname === "/api/kanban/cards" && req.method === "POST") {
    if (!useKanbanTodoBackend()) {
      sendJson(res, 409, { error: "Kanban backend is not enabled" });
      return;
    }
    const body = await readBody(req);
    const workspaceId = requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    const result = await kanbanCardProvider.addCard({
      workspaceId,
      assignee: body.assignee || "",
      assigneeLabel: todoAssigneeLabel(workspaceId, body.assignee || ""),
      content: body.content || body.title || "",
      description: body.description || "",
      dueTime: body.dueTime || body.due_time || "",
      reminderLeadMinutes: body.reminderLeadMinutes ?? body.reminder_lead_minutes ?? null,
      reason: body.reason || "",
      idempotencyKey: body.idempotencyKey || body.idempotency_key || "",
      ...(body.caseId || body.case_id ? {
        caseId: body.caseId || body.case_id || "",
        caseMode: body.caseMode || body.case_mode || "",
        caseTemplate: body.caseTemplate || body.case_template || "",
        caseSourceText: body.caseSourceText || body.case_source_text || "",
        caseSummary: body.caseSummary || body.case_summary || "",
        caseCardId: body.caseCardId || body.case_card_id || "",
        caseCardIndex: body.caseCardIndex ?? body.case_card_index ?? 0,
        caseCardCount: body.caseCardCount ?? body.case_card_count ?? 0,
        caseDependsOn: body.caseDependsOn || body.case_depends_on || [],
        caseDeliverables: body.caseDeliverables || body.case_deliverables || [],
        caseAcceptance: body.caseAcceptance || body.case_acceptance || [],
        caseCardGoal: body.caseCardGoal || body.case_card_goal || "",
      } : kanbanSingleCardCasePayload(body.content || body.title || "", body.description || "", body.sourceText || body.source_text || "")),
    });
    if (!result?.ok) {
      kanbanErrorResponse(res, result);
      return;
    }
    const card = publicTodo(result);
    const verification = verifyDirectTodoCreateResult(card);
    if (!verification.ok) {
      kanbanErrorResponse(res, { ok: false, error: verification.error, result }, 502);
      return;
    }
    clearKanbanCardListCache(workspaceId);
    broadcast({ type: "kanban.updated", workspaceId, cardId: card.id, action: "add" });
    broadcast({ type: "todos.updated", workspaceId, todoId: card.id, action: "add" });
    sendJson(res, 201, { card, result, verification });
    return;
  }

  if (url.pathname === "/api/todos/push/tick" && req.method === "POST") {
    if (!requireOwner(req, res)) return;
    const body = await readBody(req).catch(() => ({}));
    const dryRun = boolParam(body.dryRun ?? body.dry_run ?? url.searchParams.get("dryRun"));
    const limit = Number(body.limit || url.searchParams.get("limit") || 100);
    try {
      const result = await runTodoWebPushTick({ dryRun, limit });
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message || String(err) });
    }
    return;
  }

  const todoAction = url.pathname.match(/^\/api\/todos\/([^/]+)\/(complete|cancel|postpone|delete|block|unblock|comment|revise)$/);
  if (todoAction && req.method === "POST") {
    const body = await readBody(req).catch(() => ({}));
    const workspaceId = requireWorkspaceAccess(req, res, body.workspaceId || url.searchParams.get("workspaceId") || "owner");
    if (!workspaceId) return;
    const action = todoAction[2];
    const result = await todoProvider.mutateTodo({
      action,
      workspaceId,
      todoId: decodeURIComponent(todoAction[1]),
      assignee: body.assignee || "",
      recurrenceScope: body.recurrenceScope || body.recurrence_scope || "one",
      dueTime: body.dueTime || body.due_time || "",
      reason: body.reason || "",
      comment: body.comment || body.text || "",
      content: body.content || body.title || "",
      description: body.description || "",
      author: body.author || "",
    });
    if (!result.ok) {
      todoErrorResponse(res, result);
      return;
    }
    clearKanbanCardListCache(workspaceId);
    broadcast({ type: "todos.updated", workspaceId, todoId: result.id, action });
    sendJson(res, 200, { ok: true, result });
    return;
  }

  const kanbanReadingSubmission = url.pathname.match(/^\/api\/kanban\/cards\/([^/]+)\/(?:reading|study)-submission$/);
  if (kanbanReadingSubmission && req.method === "POST") {
    if (!useKanbanTodoBackend()) {
      sendJson(res, 409, { error: "Kanban backend is not enabled" });
      return;
    }
    const body = await readBody(req, Math.ceil(MAX_UPLOAD_BYTES * 1.4) + 8192).catch((err) => ({ __error: err }));
    if (body.__error) {
      sendJson(res, 400, { error: body.__error.message || "Invalid request body" });
      return;
    }
    const cardId = decodeURIComponent(kanbanReadingSubmission[1]);
    const access = await resolveKanbanCardAccess(req, res, body.workspaceId || url.searchParams.get("workspaceId") || "owner", cardId, "submitStudy");
    if (!access) return;
    const workspaceId = access.workspaceId;
    try {
      const result = await submitKanbanReadingSubmission(workspaceId, cardId, body);
      if (!result.ok) {
        kanbanErrorResponse(res, result, 502);
        return;
      }
      clearKanbanCardListCache(workspaceId);
      broadcast({ type: "kanban.updated", workspaceId, cardId, action: "reading-submission" });
      broadcast({ type: "todos.updated", workspaceId, todoId: cardId, action: "reading-submission" });
      if (result.card) result.card = annotateKanbanCardForAuth(result.card, access.auth);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, err.status || 500, { ok: false, error: compactText(err.message || String(err), 800) });
    }
    return;
  }

  const kanbanReadingQuiz = url.pathname.match(/^\/api\/kanban\/cards\/([^/]+)\/(?:reading|study)-quiz$/);
  if (kanbanReadingQuiz && (req.method === "GET" || req.method === "POST")) {
    if (!useKanbanTodoBackend()) {
      sendJson(res, 409, { error: "Kanban backend is not enabled" });
      return;
    }
    const body = req.method === "POST" ? await readBody(req).catch(() => ({})) : {};
    const cardId = decodeURIComponent(kanbanReadingQuiz[1]);
    const access = await resolveKanbanCardAccess(
      req,
      res,
      body.workspaceId || url.searchParams.get("workspaceId") || "owner",
      cardId,
      req.method === "POST" ? "answerQuiz" : "view",
    );
    if (!access) return;
    const workspaceId = access.workspaceId;
    try {
      const result = req.method === "POST"
        ? await submitKanbanReadingQuiz(workspaceId, cardId, body)
        : await getKanbanReadingQuiz(workspaceId, cardId);
      if (!result.ok) {
        sendJson(res, result.status || 400, { ok: false, error: result.error || "Reading quiz failed" });
        return;
      }
      if (req.method === "POST" && result.passed) {
        clearKanbanCardListCache(workspaceId);
        broadcast({ type: "kanban.updated", workspaceId, cardId, action: "reading-quiz-passed" });
        broadcast({ type: "todos.updated", workspaceId, todoId: cardId, action: "reading-quiz-passed" });
      }
      if (result.card) result.card = annotateKanbanCardForAuth(result.card, access.auth);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, err.status || 500, { ok: false, error: compactText(err.message || String(err), 800) });
    }
    return;
  }

  const kanbanAssessmentExam = url.pathname.match(/^\/api\/kanban\/cards\/([^/]+)\/assessment-exam$/);
  if (kanbanAssessmentExam && (req.method === "GET" || req.method === "POST")) {
    if (!useKanbanTodoBackend()) {
      sendJson(res, 409, { error: "Kanban backend is not enabled" });
      return;
    }
    const body = req.method === "POST" ? await readBody(req).catch(() => ({})) : {};
    const cardId = decodeURIComponent(kanbanAssessmentExam[1]);
    const access = await resolveKanbanCardAccess(
      req,
      res,
      body.workspaceId || url.searchParams.get("workspaceId") || "owner",
      cardId,
      req.method === "POST" ? "answerQuiz" : "view",
    );
    if (!access) return;
    const workspaceId = access.workspaceId;
    try {
      const result = req.method === "POST"
        ? await submitKanbanAssessmentExam(workspaceId, cardId, body)
        : await getKanbanAssessmentExam(workspaceId, cardId);
      if (!result.ok) {
        sendJson(res, result.status || 400, { ok: false, error: result.error || "Assessment exam failed" });
        return;
      }
      if (req.method === "POST") {
        clearKanbanCardListCache(workspaceId);
        broadcast({ type: "kanban.updated", workspaceId, cardId, action: result.passed ? "assessment-passed" : "assessment-retake" });
        broadcast({ type: "todos.updated", workspaceId, todoId: cardId, action: result.passed ? "assessment-passed" : "assessment-retake" });
      }
      if (result.card) result.card = annotateKanbanCardForAuth(result.card, access.auth);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, err.status || 500, { ok: false, error: compactText(err.message || String(err), 800) });
    }
    return;
  }

  const kanbanAction = url.pathname.match(/^\/api\/kanban\/cards\/([^/]+)\/(complete|cancel|postpone|delete|block|unblock|comment|revise)$/);
  if (kanbanAction && req.method === "POST") {
    if (!useKanbanTodoBackend()) {
      sendJson(res, 409, { error: "Kanban backend is not enabled" });
      return;
    }
    const body = await readBody(req).catch(() => ({}));
    const action = kanbanAction[2];
    const cardId = decodeURIComponent(kanbanAction[1]);
    const capability = action === "comment"
      ? "comment"
      : (action === "revise" ? "revise" : (action === "delete" || action === "cancel" ? "delete" : "manage"));
    const access = await resolveKanbanCardAccess(req, res, body.workspaceId || url.searchParams.get("workspaceId") || "owner", cardId, capability);
    if (!access) return;
    const workspaceId = access.workspaceId;
    const result = await kanbanCardProvider.mutateCard({
      action,
      workspaceId,
      cardId,
      assignee: body.assignee || "",
      dueTime: body.dueTime || body.due_time || "",
      reason: body.reason || "",
      comment: body.comment || body.text || "",
      content: body.content || body.title || "",
      description: body.description || "",
      author: body.author || "",
    });
    if (!result?.ok) {
      kanbanErrorResponse(res, result);
      return;
    }
    const resultCardId = String(result.id || cardId);
    clearKanbanCardListCache(workspaceId);
    broadcast({ type: "kanban.updated", workspaceId, cardId: resultCardId, action });
    broadcast({ type: "todos.updated", workspaceId, todoId: resultCardId, action });
    sendJson(res, 200, { ok: true, result });
    return;
  }

  if (url.pathname === "/api/single-window" && req.method === "POST") {
    const body = await readBody(req);
    const auth = authenticateRequest(req);
    const workspaceId = requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    const weixinRequested = Boolean(body.weixinChat || body.weixin_chat);
    let weixinThread = weixinRequested
      ? ensureWeixinSingleWindowThread(workspaceId)
      : findWeixinSingleWindowThreadForWorkspace(workspaceId);
    const groupRequested = !weixinRequested && Boolean(body.groupChat || body.group_chat);
    const availableGroupThread = findGroupChatThreadForWorkspace(workspaceId);
    const groupChatAvailable = Boolean(availableGroupThread && threadAccessibleToAuth(auth, availableGroupThread));
    const groupThread = groupRequested && groupChatAvailable ? availableGroupThread : null;
    const thread = weixinRequested
      ? weixinThread
      : (groupThread || ensureSingleWindowThread(workspaceId, { allowGroupThread: false }));
    if (!thread) {
      sendJson(res, 400, { error: "Unknown workspace or single-window project" });
      return;
    }
    if (!weixinRequested) weixinThread = findWeixinSingleWindowThreadForWorkspace(workspaceId);
    const weixinTargets = weixinForwardTargetsForWorkspace(workspaceId, auth);
    const weixinChatAvailable = Boolean(
      (weixinThread && threadAccessibleToAuth(auth, weixinThread))
      || weixinTargets.length
    );
    broadcast({ type: "thread.updated", thread: threadSummary(thread) });
    const messageMode = String(body.messageMode || body.message_mode || "").trim().toLowerCase();
    const wantsMessagePage = ["chat", "tasks", "task"].includes(messageMode);
    const responseThread = wantsMessagePage
      ? compactThreadWithMessagePage(thread, {
        mode: messageMode,
        groupChat: groupRequested && !weixinRequested,
        taskGroupId: body.taskGroupId || body.task_group_id || "",
        limit: body.messageLimit || body.message_limit || THREAD_MESSAGE_INITIAL_LIMIT,
      })
      : compactThread(thread);
    const groupChatThread = groupChatAvailable
      ? compactThreadWithMessagePage(availableGroupThread, {
        mode: "chat",
        groupChat: true,
        limit: body.messageLimit || body.message_limit || THREAD_MESSAGE_INITIAL_LIMIT,
      })
      : null;
    const weixinChatThread = weixinThread && threadAccessibleToAuth(auth, weixinThread)
      ? compactThreadWithMessagePage(weixinThread, {
        mode: "chat",
        groupChat: false,
        limit: body.messageLimit || body.message_limit || THREAD_MESSAGE_INITIAL_LIMIT,
      })
      : null;
    const caseTopicThreads = messageMode === "tasks" || messageMode === "task"
      ? kanbanCaseTopicThreadsForWorkspace(auth, workspaceId).map((topicThread) => compactThreadWithMessagePage(topicThread, {
        mode: "tasks",
        limit: body.messageLimit || body.message_limit || THREAD_MESSAGE_INITIAL_LIMIT,
      }))
      : [];
    sendJson(res, 200, {
      thread: responseThread,
      groupChatAvailable,
      groupChatThreadId: groupChatAvailable ? availableGroupThread.id : "",
      groupChatThread,
      weixinChatAvailable,
      weixinChatThreadId: weixinChatThread ? weixinThread.id : "",
      weixinChatThread,
      caseTopicThreads,
    });
    return;
  }

  if (url.pathname === "/api/threads" && req.method === "GET") {
    pruneEmptyThreads();
    const workspaceId = url.searchParams.get("workspaceId") || "";
    const projectId = url.searchParams.get("projectId") || "";
    const subprojectId = url.searchParams.get("subprojectId") || "";
    const search = String(url.searchParams.get("search") || "").trim().toLowerCase();
    if (workspaceId) {
      const allowedWorkspaceId = requireWorkspaceAccess(req, res, workspaceId);
      if (!allowedWorkspaceId) return;
    }
    const selectedProject = workspaceId && projectId ? findProject(workspaceId, projectId) : null;
    const selectedSubproject = selectedProject && subprojectId ? findSubproject(selectedProject, subprojectId) : null;
    let threads = state.threads.filter((item) => threadAccessibleToRequest(req, item));
    if (workspaceId) {
      threads = threads.filter((item) => item.workspaceId === workspaceId || chatGroupMemberWorkspaceIds(item).includes(workspaceId));
    }
    if (projectId) threads = threads.filter((item) => item.projectId === projectId);
    if (subprojectId) threads = threads.filter((item) => (item.subprojectId || "") === subprojectId);
    if (search) {
      threads = threads.filter((item) => {
        const haystack = `${item.title}\n${(item.messages || []).map((msg) => msg.content || "").join("\n")}`.toLowerCase();
        return haystack.includes(search);
      });
    }
    const summaries = [
      ...threads.map(threadSummary),
      ...singleWindowProjectTaskSummaries(workspaceId, selectedProject, selectedSubproject, search),
    ].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    sendJson(res, 200, { data: summaries });
    return;
  }

  if (url.pathname === "/api/threads" && req.method === "POST") {
    pruneEmptyThreads();
    const body = await readBody(req);
    const workspaceId = requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    const projectId = String(body.projectId || "general");
    const subprojectId = String(body.subprojectId || "");
    const workspace = findWorkspace(workspaceId);
    const project = findProject(workspaceId, projectId);
    if (!workspace) {
      sendJson(res, 400, { error: "Unknown workspace" });
      return;
    }
    if (!project) {
      sendJson(res, 400, { error: "Unknown project" });
      return;
    }
    if (subprojectId && !findSubproject(project, subprojectId)) {
      sendJson(res, 400, { error: "Unknown subproject" });
      return;
    }
    const thread = normalizeThread({
      id: makeId("thread"),
      title: String(body.title || "New thread").trim() || "New thread",
      workspaceId,
      projectId,
      subprojectId,
      hermesSessionId: `web_${makeId("session")}`,
      status: "idle",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      messages: [],
      events: [],
    });
    state.threads.unshift(thread);
    saveState();
    broadcast({ type: "thread.updated", thread: threadSummary(thread) });
    sendJson(res, 201, { thread: compactThread(thread) });
    return;
  }

  const threadRead = url.pathname.match(/^\/api\/threads\/([^/]+)$/);
  if (threadRead && req.method === "GET") {
    const thread = findThreadForRequest(req, decodeURIComponent(threadRead[1]));
    if (!thread) {
      sendJson(res, 404, { error: "Thread not found" });
      return;
    }
    if (isDiscardableEmptyThread(thread)) {
      pruneEmptyThreads();
      sendJson(res, 404, { error: "Thread not found" });
      return;
    }
    const messageMode = String(url.searchParams.get("messageMode") || url.searchParams.get("message_mode") || "").trim().toLowerCase();
    if (["chat", "tasks", "task"].includes(messageMode)) {
      sendJson(res, 200, {
        thread: compactThreadWithMessagePage(thread, {
          mode: messageMode,
          groupChat: boolParam(url.searchParams.get("groupChat") || url.searchParams.get("group_chat")),
          taskGroupId: url.searchParams.get("taskGroupId") || url.searchParams.get("task_group_id") || "",
          limit: url.searchParams.get("messageLimit") || url.searchParams.get("message_limit") || THREAD_MESSAGE_INITIAL_LIMIT,
        }),
      });
      return;
    }
    sendJson(res, 200, { thread: compactThread(thread) });
    return;
  }

  const threadMessagesRead = url.pathname.match(/^\/api\/threads\/([^/]+)\/messages$/);
  if (threadMessagesRead && req.method === "GET") {
    const thread = findThreadForRequest(req, decodeURIComponent(threadMessagesRead[1]));
    if (!thread) {
      sendJson(res, 404, { error: "Thread not found" });
      return;
    }
    const messageMode = String(url.searchParams.get("messageMode") || url.searchParams.get("message_mode") || "chat").trim().toLowerCase();
    const options = {
      mode: messageMode,
      groupChat: boolParam(url.searchParams.get("groupChat") || url.searchParams.get("group_chat")),
      taskGroupId: url.searchParams.get("taskGroupId") || url.searchParams.get("task_group_id") || "",
      before: url.searchParams.get("before") || "",
      limit: url.searchParams.get("limit") || THREAD_MESSAGE_PAGE_LIMIT,
      search: url.searchParams.get("search") || url.searchParams.get("q") || "",
    };
    const page = String(options.search || "").trim()
      ? searchThreadMessages(thread, Object.assign({}, options, { limit: url.searchParams.get("limit") || THREAD_MESSAGE_SEARCH_LIMIT }))
      : threadMessagesPage(thread, options);
    sendJson(res, 200, {
      messages: page.messages.map((message) => compactMessage(message, thread)),
      page: page.page,
    });
    return;
  }

  const upload = url.pathname.match(/^\/api\/threads\/([^/]+)\/uploads$/);
  if (upload && req.method === "POST") {
    const auth = authenticateRequest(req);
    const thread = findThreadForRequest(req, decodeURIComponent(upload[1]));
    if (!thread) {
      sendJson(res, 404, { error: "Thread not found" });
      return;
    }
    const body = await readBody(req, Math.ceil(MAX_UPLOAD_BYTES * 1.4) + 4096);
    const filename = safeFileName(body.filename || "upload.bin");
    const data = String(body.dataBase64 || "");
    if (!data) {
      sendJson(res, 400, { error: "Missing dataBase64" });
      return;
    }
    const buffer = Buffer.from(data, "base64");
    if (!buffer.length || buffer.length > MAX_UPLOAD_BYTES) {
      sendJson(res, 400, { error: "Invalid or too-large upload" });
      return;
    }
    let uploadTarget;
    try {
      uploadTarget = workspaceUploadDirectoryForRequest(auth, thread, body);
    } catch (err) {
      sendJson(res, err.status || 500, { error: err.message || String(err) });
      return;
    }
    const uploadDir = uploadTarget.uploadDir;
    fs.mkdirSync(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, `${Date.now()}-${crypto.randomBytes(3).toString("hex")}-${filename}`);
    fs.writeFileSync(filePath, buffer);
    const artifact = registerUploadArtifact(thread, null, filePath, filename, { workspaceId: uploadTarget.workspaceId });
    saveState();
    sendJson(res, 201, { artifact });
    return;
  }

  const groupChatRoute = url.pathname.match(/^\/api\/threads\/([^/]+)\/group-chat$/);
  if (groupChatRoute && req.method === "PATCH") {
    const auth = requireOwner(req, res);
    if (!auth) return;
    const thread = findThreadForRequest(req, decodeURIComponent(groupChatRoute[1]));
    if (!thread) {
      sendJson(res, 404, { error: "Thread not found" });
      return;
    }
    if (!thread.singleWindow) {
      sendJson(res, 400, { error: "Group chat is only supported for single-window chat" });
      return;
    }
    const body = await readBody(req).catch(() => ({}));
    const enabled = body.enabled !== false;
    const now = nowIso();
    const current = normalizeChatGroup(thread.chatGroup || {}, thread.workspaceId);
    const memberWorkspaceIds = normalizeStringList(
      body.memberWorkspaceIds || body.member_workspace_ids || body.members || current.memberWorkspaceIds,
    ).filter((workspaceId) => findWorkspace(workspaceId));
    thread.chatGroup = normalizeChatGroup({
      enabled,
      memberWorkspaceIds,
      createdAt: current.createdAt || now,
      updatedAt: now,
    }, thread.workspaceId);
    thread.updatedAt = now;
    saveState();
    broadcast({ type: "thread.updated", threadId: thread.id, thread: compactThread(thread) });
    sendJson(res, 200, { ok: true, thread: compactThread(thread) });
    return;
  }

  const threadMessages = url.pathname.match(/^\/api\/threads\/([^/]+)\/messages$/);
  if (threadMessages && req.method === "POST") {
    const thread = findThreadForRequest(req, decodeURIComponent(threadMessages[1]));
    if (!thread) {
      sendJson(res, 404, { error: "Thread not found" });
      return;
    }
    if (!thread.singleWindow && (thread.activeRunId || (thread.activeRunIds || []).length)) {
      sendJson(res, 409, { error: "Thread already has an active Hermes run" });
      return;
    }
    const body = await readBody(req);
    const text = String(body.text || "").trim();
    const uploadArtifacts = Array.isArray(body.artifacts) ? body.artifacts : [];
    if (!text && !uploadArtifacts.length) {
      sendJson(res, 400, { error: "Message text is required" });
      return;
    }
    const auth = authenticateRequest(req);
    const createdAt = nowIso();
    if (thread.title === "New thread") thread.title = deriveTitle(text);
    const singleWindowMode = normalizeSingleWindowMode(body.singleWindowMode || body.single_window_mode || "");
    const replyToMessageId = singleWindowMode === "chat" ? "" : (body.replyToMessageId ? String(body.replyToMessageId).slice(0, 120) : "");
    const quotedMessage = replyToMessageId
      ? (thread.messages || []).find((message) => message.id === replyToMessageId)
      : null;
    if (replyToMessageId && !quotedMessage) {
      sendJson(res, 400, { error: "Quoted message not found" });
      return;
    }
    const bodyTaskGroupId = body.taskGroupId ? sanitizeTaskGroupId(body.taskGroupId) : "";
    const quotedTaskGroupId = quotedMessage?.taskGroupId ? sanitizeTaskGroupId(quotedMessage.taskGroupId) : "";
    if (bodyTaskGroupId && quotedTaskGroupId && bodyTaskGroupId !== quotedTaskGroupId) {
      sendJson(res, 400, { error: "Quoted message does not belong to the requested task group" });
      return;
    }
    const requestedTaskGroupId = bodyTaskGroupId || quotedTaskGroupId;
    const taskGroupId = thread.singleWindow
      ? (singleWindowMode === "chat" ? singleWindowChatTaskGroupId(requestedTaskGroupId) : (requestedTaskGroupId || makeId("task")))
      : "";
    if (thread.singleWindow && taskGroupId === SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID && singleWindowMode !== "chat") {
      sendJson(res, 400, { error: "Group chat messages must use chat mode" });
      return;
    }
    const groupMemberIds = chatGroupMemberWorkspaceIds(thread);
    const requestedGroupChat = thread.singleWindow
      && singleWindowMode === "chat"
      && taskGroupId === SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID;
    const isGroupChatMessage = requestedGroupChat && groupMemberIds.length > 0;
    if (requestedGroupChat && !isGroupChatMessage) {
      sendJson(res, 403, { error: "Group chat is not enabled for this thread" });
      return;
    }
    if (thread.singleWindow && singleWindowMode !== "chat") {
      const caseTopicPermissions = kanbanCaseTopicPermissionsForTaskGroup(thread, taskGroupId, auth);
      if (caseTopicPermissions && !caseTopicPermissions.canSubmitStudy && !caseTopicPermissions.canManage) {
        sendJson(res, 403, { error: "This shared learning topic is read-only for the current workspace" });
        return;
      }
    }
    const compactResponseThread = () => (
      thread.singleWindow && singleWindowMode === "chat"
        ? compactThreadWithMessagePage(thread, {
          mode: "chat",
          taskGroupId,
          groupChat: taskGroupId === SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID,
          limit: body.messageLimit || body.message_limit || THREAD_MESSAGE_INITIAL_LIMIT,
        })
        : compactThread(thread)
    );
    let actorWorkspaceId = thread.workspaceId;
    const requestedActorWorkspaceId = String(body.workspaceId || body.actorWorkspaceId || body.actor_workspace_id || "").trim();
    if (requestedActorWorkspaceId && authCanAccessWorkspace(auth, requestedActorWorkspaceId)) {
      actorWorkspaceId = requestedActorWorkspaceId;
    } else if (!isOwnerAuth(auth) && auth?.workspaceId) {
      actorWorkspaceId = auth.workspaceId;
    }
    if (isGroupChatMessage && !groupMemberIds.includes(actorWorkspaceId)) {
      sendJson(res, 403, { error: "Selected workspace is not a group chat member" });
      return;
    }
    const senderInfo = senderInfoForWorkspace(actorWorkspaceId);
    const messageKind = isGroupChatMessage && String(body.messageKind || body.message_kind || "").trim() === "plain" ? "plain" : "ai";
    let gatewayRouting = { securityLevel: "user", maintenance: false };
    if (messageKind === "ai") {
      try {
        gatewayRouting = gatewayRoutingForModelRun(auth, text, Object.assign({}, body, { actorWorkspaceId }));
      } catch (err) {
        sendJson(res, err.status || 403, {
          error: err.message || String(err),
          code: err.code || "gateway_security_boundary",
          operatorRequired: Boolean(err.operatorRequired),
          elevationRequired: Boolean(err.elevationRequired),
          elevationScope: err.elevationScope || "",
        });
        return;
      }
    }
    const requestedReasoningEffort = String(body.reasoning_effort || "").trim();
    const reasoningEffort = VALID_REASONING_EFFORTS.has(requestedReasoningEffort) ? requestedReasoningEffort : "";
    const allowAutomaticDirectoryAttachment = singleWindowMode !== "chat";
    const directoryAttachment = resolveTaskDirectoryAttachment(thread, body.directory || body.directoryRoute || {})
      || (singleWindowMode === "chat" ? null : taskDirectoryAttachmentForGroup(thread, requestedTaskGroupId))
      || (allowAutomaticDirectoryAttachment ? semanticTaskDirectoryAttachment(thread, text) : null);
    const userMessage = {
      id: makeId("msg"),
      role: "user",
      content: buildUserMessageContent(text, uploadArtifacts),
      status: "done",
      createdAt,
      updatedAt: createdAt,
      submittedAt: createdAt,
      artifacts: uploadArtifacts.map(publicArtifactFromClient).filter(Boolean),
      taskGroupId,
      messageKind,
      senderWorkspaceId: senderInfo.senderWorkspaceId,
      senderPrincipalId: senderInfo.senderPrincipalId,
      senderLabel: senderInfo.senderLabel,
      actorWorkspaceId,
      replyToMessageId: quotedMessage?.id || "",
      directoryAliases: directoryAttachment ? [directoryAttachment] : [],
      directoryRoute: directoryAttachment || null,
      reasoningEffort,
      singleWindowMode,
    };
    attachUploadedArtifactsToMessage(thread, userMessage);
    const assistantMessage = {
      id: makeId("msg"),
      role: "assistant",
      content: "",
      status: "queued",
      runId: null,
      createdAt,
      updatedAt: createdAt,
      queuedAt: createdAt,
      artifacts: [],
      taskGroupId,
      messageKind: "ai",
      senderWorkspaceId: "hermes",
      senderPrincipalId: "hermes",
      senderLabel: "Hermes",
      actorWorkspaceId,
      reasoningEffort,
      singleWindowMode,
    };
    if (isGroupChatMessage && messageKind === "plain") {
      thread.messages.push(userMessage);
      thread.status = (thread.activeRunIds || []).length ? "running" : "idle";
      thread.updatedAt = createdAt;
      saveState();
      broadcast({ type: "thread.updated", threadId: thread.id, thread: threadSummary(thread) });
      broadcast({ type: "message.updated", threadId: thread.id, message: compactMessage(userMessage), thread: threadSummary(thread) });
      notifyGroupChatMentions(thread, userMessage);
      sendJson(res, 201, { ok: true, thread: compactResponseThread() });
      return;
    }
    const directKanbanCreate = useKanbanTodoBackend() && detectDirectKanbanCreateRequest(text);
    if (directKanbanCreate) {
      let result = null;
      let kanbanDraft = null;
      try {
        kanbanDraft = await interpretKanbanNaturalLanguage(text, findWorkspace(thread.workspaceId), workspacePrincipal(thread.workspaceId));
        result = await kanbanCardProvider.addCard({
          workspaceId: thread.workspaceId,
          assignee: kanbanDraft.assignee,
          assigneeLabel: todoAssigneeLabel(thread.workspaceId, kanbanDraft.assignee),
          content: kanbanDraft.content,
          description: kanbanDraft.description,
          dueTime: kanbanDraft.dueTime,
          reason: kanbanDraft.reason,
          ...kanbanSingleCardCasePayload(kanbanDraft.content, kanbanDraft.description, text),
        });
      } catch (err) {
        result = { ok: false, error: err.message || String(err) };
      }
      let createdCard = null;
      let directKanbanVerification = { ok: true, error: "" };
      if (result?.ok) {
        createdCard = publicTodo(result);
        directKanbanVerification = verifyDirectTodoCreateResult(createdCard);
        if (!directKanbanVerification.ok) {
          result = {
            ...(result && typeof result === "object" ? result : {}),
            ok: false,
            error: directKanbanVerification.error || "Kanban creation verification failed.",
          };
          createdCard = null;
        }
      }
      if (!result?.ok) {
        directKanbanVerification = {
          ok: false,
          error: String(result?.error || directKanbanVerification.error || ""),
        };
      }
      const finishedAt = nowIso();
      assistantMessage.status = result?.ok ? "done" : "failed";
      assistantMessage.content = result?.ok
        ? `已新增看板卡片：${todoAssigneeLabel(thread.workspaceId, kanbanDraft?.assignee || "")} | ${kanbanDraft?.dueTime || "no due time"} | ${kanbanDraft?.content || ""}`
        : `新增看板卡片失败：${result?.error || "Kanban card operation failed"}`;
      assistantMessage.error = result?.ok ? null : (result?.error || "Kanban operation failed");
      if (result?.ok && createdCard) {
        assistantMessage.content = formatDirectTodoCreateSuccessMessage({
          assigneeLabel: todoAssigneeLabel(thread.workspaceId, kanbanDraft?.assignee || ""),
          dueTime: kanbanDraft?.dueTime || "",
          content: kanbanDraft?.content || "",
        }, createdCard);
      }
      assistantMessage.completedAt = result?.ok ? finishedAt : "";
      assistantMessage.failedAt = result?.ok ? "" : finishedAt;
      assistantMessage.updatedAt = finishedAt;
      thread.messages.push(userMessage, assistantMessage);
      thread.status = "idle";
      thread.updatedAt = finishedAt;
      saveState();
      broadcast({ type: "thread.updated", thread: threadSummary(thread) });
      broadcast({ type: "message.updated", threadId: thread.id, message: compactMessage(userMessage), thread: threadSummary(thread) });
      broadcast({ type: "message.updated", threadId: thread.id, message: compactMessage(assistantMessage), thread: threadSummary(thread) });
      if (result?.ok) {
        const assigneeWorkspaceId = workspaceIdForPrincipal(kanbanDraft?.assignee || "");
        broadcast({ type: "kanban.updated", workspaceId: thread.workspaceId });
        broadcast({ type: "todos.updated", workspaceId: thread.workspaceId });
        if (assigneeWorkspaceId && assigneeWorkspaceId !== thread.workspaceId) {
          broadcast({ type: "kanban.updated", workspaceId: assigneeWorkspaceId });
          broadcast({ type: "todos.updated", workspaceId: assigneeWorkspaceId });
        }
      }
      sendJson(res, result?.ok ? 201 : 400, {
        ok: Boolean(result?.ok),
        card: result?.ok ? createdCard : null,
        result,
        verification: directKanbanVerification,
        thread: compactResponseThread(),
      });
      return;
    }
    const directTodoIntent = directTodoCreateEnabled()
      ? (detectDirectTodoCreateIntentForWeb(text, thread.workspaceId)
        || detectDirectTodoCreateIntent(text, thread.workspaceId))
      : null;
    if (directTodoIntent) {
      let result = null;
      try {
        result = await todoProvider.addTodo({
          workspaceId: thread.workspaceId,
          assignee: directTodoIntent.assignee,
          content: directTodoIntent.content,
          dueTime: directTodoIntent.dueTime,
          suppressExternalNotice: true,
          reminderLeadMinutes: null,
          recurrence: "none",
          recurrenceDays: "",
          recurrenceUntil: "",
        });
      } catch (err) {
        result = { ok: false, error: err.message || String(err) };
      }
      let createdTodo = null;
      let directTodoVerification = { ok: true, error: "" };
      if (result?.ok) {
        createdTodo = publicTodo(result);
        directTodoVerification = verifyDirectTodoCreateResult(createdTodo);
        if (!directTodoVerification.ok) {
          result = {
            ...(result && typeof result === "object" ? result : {}),
            ok: false,
            error: directTodoVerification.error || "Todo creation verification failed.",
          };
          createdTodo = null;
        }
      }
      if (!result?.ok) {
        directTodoVerification = {
          ok: false,
          error: String(result?.error || directTodoVerification.error || ""),
        };
      }
      const finishedAt = nowIso();
      assistantMessage.status = result?.ok ? "done" : "failed";
      assistantMessage.content = result?.ok
        ? `已新增待办：${directTodoIntent.assigneeLabel} | ${directTodoIntent.dueTime} | ${directTodoIntent.content}`
        : `新增待办失败：${result?.error || "Todo operation failed"}`;
      assistantMessage.error = result?.ok ? null : (result?.error || "Todo operation failed");
      assistantMessage.completedAt = result?.ok ? finishedAt : "";
      assistantMessage.failedAt = result?.ok ? "" : finishedAt;
      assistantMessage.updatedAt = finishedAt;
      thread.messages.push(userMessage, assistantMessage);
      thread.status = "idle";
      thread.updatedAt = finishedAt;
      saveState();
      broadcast({ type: "thread.updated", thread: threadSummary(thread) });
      broadcast({ type: "message.updated", threadId: thread.id, message: compactMessage(userMessage), thread: threadSummary(thread) });
      broadcast({ type: "message.updated", threadId: thread.id, message: compactMessage(assistantMessage), thread: threadSummary(thread) });
      if (result?.ok) {
        const assigneeWorkspaceId = workspaceIdForPrincipal(directTodoIntent.assignee);
        broadcast({ type: "todos.updated", workspaceId: thread.workspaceId });
        if (assigneeWorkspaceId && assigneeWorkspaceId !== thread.workspaceId) broadcast({ type: "todos.updated", workspaceId: assigneeWorkspaceId });
        notifyTodoCreated(result, workspacePrincipal(thread.workspaceId));
      }
      sendJson(res, result?.ok ? 201 : 400, {
        ok: Boolean(result?.ok),
        todo: result?.ok ? createdTodo : null,
        result,
        verification: directTodoVerification,
        thread: compactResponseThread(),
      });
      return;
    }
    const followUpInstructions = thread.singleWindow
      ? singleWindowMode === "chat"
        ? "The latest user message is a Hermes Mobile continuous-chat turn. Treat it as part of the supplied same-task conversation_history."
        : (requestedTaskGroupId
          ? "The latest user message is an explicit Web quote/reply to an existing task group. Treat it as a follow-up to the supplied same-task conversation_history, not as a new independent task."
          : "")
      : "";
    const runOptions = {
      reasoning_effort: reasoningEffort,
      singleWindowMode,
      actorWorkspaceId,
      gatewayRouting,
      instructions: [
        body.instructions || "",
        ownerElevationInstructions(body),
        followUpInstructions,
      ].filter(Boolean).join("\n\n"),
    };
    if (body.model) runOptions.model = body.model;
    if (body.reasoning && typeof body.reasoning === "object") runOptions.reasoning = body.reasoning;
    if (body.access_policy_context && typeof body.access_policy_context === "object") {
      runOptions.access_policy_context = body.access_policy_context;
    }
    assistantMessage.runOptions = runOptions;
    const queueBehindActiveChatRun = thread.singleWindow
      && singleWindowMode === "chat"
      && taskGroupId
      && taskGroupHasRunningRun(thread, taskGroupId);
    if (!queueBehindActiveChatRun) {
      const concurrencyError = runConcurrencyError(actorWorkspaceId);
      if (concurrencyError) {
        sendJson(res, concurrencyError.status || 429, {
          error: concurrencyError.message,
          code: concurrencyError.code,
          concurrency: concurrencyError.snapshot || runConcurrencySnapshot(),
        });
        return;
      }
    }
    thread.messages.push(userMessage, assistantMessage);
    thread.status = queueBehindActiveChatRun && (thread.activeRunIds || []).length ? "running" : "queued";
    thread.updatedAt = createdAt;
    saveState();
    broadcast({ type: "thread.updated", thread: threadSummary(thread) });
    broadcast({ type: "message.updated", threadId: thread.id, message: compactMessage(userMessage), thread: threadSummary(thread) });
    broadcast({ type: "message.updated", threadId: thread.id, message: compactMessage(assistantMessage), thread: threadSummary(thread) });
    if (isGroupChatMessage) notifyGroupChatMentions(thread, userMessage);
    if (queueBehindActiveChatRun) {
      sendJson(res, 202, { run: { status: "queued", taskGroupId, engine: "responses" }, thread: compactResponseThread() });
      return;
    }
    try {
      const run = await startRunForThread(thread, userMessage, assistantMessage, runOptions);
      sendJson(res, 202, { run, thread: compactResponseThread() });
    } catch (err) {
      const failedAt = nowIso();
      assistantMessage.status = "failed";
      assistantMessage.error = err.message || String(err);
      assistantMessage.failedAt = failedAt;
      assistantMessage.updatedAt = failedAt;
      removeThreadActiveRun(thread, assistantMessage.runId, "failed");
      thread.updatedAt = failedAt;
      saveState();
      broadcast({ type: "run.failed", threadId: thread.id, message: compactMessage(assistantMessage), thread: threadSummary(thread) });
      sendJson(res, err.status || 502, { error: assistantMessage.error, thread: compactResponseThread() });
    }
    return;
  }

  const messageOwnerElevation = url.pathname.match(/^\/api\/threads\/([^/]+)\/messages\/([^/]+)\/owner-elevation$/);
  if (messageOwnerElevation && req.method === "POST") {
    const ownerAuth = requireOwner(req, res);
    if (!ownerAuth) return;
    const thread = findThreadForRequest(req, decodeURIComponent(messageOwnerElevation[1]));
    if (!thread) {
      sendJson(res, 404, { error: "Thread not found" });
      return;
    }
    const messageId = decodeURIComponent(messageOwnerElevation[2]);
    const message = (thread.messages || []).find((item) => String(item.id || "") === messageId);
    if (!message || message.role !== "assistant") {
      sendJson(res, 404, { error: "Assistant message not found" });
      return;
    }
    if (!message.elevationRequired) {
      sendJson(res, 409, { error: "This message is not waiting for Owner elevation approval" });
      return;
    }
    const body = await readBody(req).catch((err) => ({ __error: err }));
    if (body.__error) {
      sendJson(res, 400, { error: body.__error.message || "Invalid request body" });
      return;
    }
    const userMessage = precedingUserMessageForAssistant(thread, message);
    if (!userMessage) {
      sendJson(res, 400, { error: "Original user message was not found" });
      return;
    }
    const actorWorkspaceId = "owner";
    const concurrencyError = runConcurrencyError(actorWorkspaceId);
    if (concurrencyError) {
      sendJson(res, concurrencyError.status || 429, {
        error: concurrencyError.message,
        code: concurrencyError.code,
        concurrency: concurrencyError.snapshot || runConcurrencySnapshot(),
      });
      return;
    }
    let assistantMessage = null;
    try {
      const elevationScope = sanitizeElevationScope(body.elevationScope || body.elevation_scope || message.elevationScope || "owner_high_privilege");
      const gatewayRouting = gatewayRoutingForModelRun(ownerAuth, userMessage.content, {
        actorWorkspaceId,
        maintenanceMode: true,
        ownerElevationOnceToken: body.ownerElevationOnceToken || body.owner_elevation_once_token || "",
        elevationScope,
      });
      const createdAt = nowIso();
      assistantMessage = {
        id: makeId("msg"),
        role: "assistant",
        content: "",
        status: "queued",
        runId: null,
        createdAt,
        updatedAt: createdAt,
        queuedAt: createdAt,
        artifacts: [],
        taskGroupId: userMessage.taskGroupId || message.taskGroupId || "",
        messageKind: "ai",
        senderWorkspaceId: "hermes",
        senderPrincipalId: "hermes",
        senderLabel: "Hermes",
        actorWorkspaceId,
        reasoningEffort: userMessage.reasoningEffort || message.reasoningEffort || "",
        singleWindowMode: userMessage.singleWindowMode || message.singleWindowMode || "",
        elevatedFromMessageId: message.id,
      };
      const runOptions = {
        reasoning_effort: assistantMessage.reasoningEffort,
        singleWindowMode: assistantMessage.singleWindowMode,
        actorWorkspaceId,
        gatewayRouting,
        instructions: ownerElevationInstructions({ elevationScope }),
      };
      assistantMessage.runOptions = runOptions;
      thread.messages.push(assistantMessage);
      thread.status = "queued";
      thread.updatedAt = createdAt;
      saveState();
      broadcast({ type: "message.updated", threadId: thread.id, message: compactMessage(assistantMessage), thread: threadSummary(thread) });
      const run = await startRunForThread(thread, userMessage, assistantMessage, runOptions);
      sendJson(res, 202, { ok: true, run, thread: compactThread(thread) });
    } catch (err) {
      if (assistantMessage) {
        const failedAt = nowIso();
        assistantMessage.status = "failed";
        assistantMessage.error = err.message || String(err);
        assistantMessage.failedAt = failedAt;
        assistantMessage.updatedAt = failedAt;
        removeThreadActiveRun(thread, assistantMessage.runId, "failed");
        thread.updatedAt = failedAt;
        saveState();
        broadcast({ type: "run.failed", threadId: thread.id, message: compactMessage(assistantMessage), thread: threadSummary(thread) });
      }
      sendJson(res, err.status || 502, {
        error: err.message || String(err),
        code: err.code || "owner_elevation_retry_failed",
        elevationRequired: Boolean(err.elevationRequired),
        elevationScope: err.elevationScope || "",
        thread: compactThread(thread),
      });
    }
    return;
  }

  const messageRevoke = url.pathname.match(/^\/api\/threads\/([^/]+)\/messages\/([^/]+)\/revoke$/);
  if (messageRevoke && req.method === "POST") {
    const auth = authenticateRequest(req);
    const thread = findThreadForRequest(req, decodeURIComponent(messageRevoke[1]));
    if (!thread) {
      sendJson(res, 404, { error: "Thread not found" });
      return;
    }
    const messageId = decodeURIComponent(messageRevoke[2]);
    const message = (thread.messages || []).find((item) => String(item.id || "") === messageId);
    if (!message) {
      sendJson(res, 404, { error: "Message not found" });
      return;
    }
    if (!canRevokeGroupChatMessage(auth, thread, message)) {
      sendJson(res, 403, { error: "This group chat message cannot be revoked by the current account" });
      return;
    }
    const now = nowIso();
    const revoker = groupMessageRevoker(auth);
    const pairedAssistant = message.messageKind === "ai" ? groupAssistantReplyForUserMessage(thread, message) : null;
    const touchedMessages = [message];
    const touchedArtifactIds = new Set();
    const rememberArtifacts = (item) => {
      for (const artifact of Array.isArray(item?.artifacts) ? item.artifacts : []) {
        if (artifact?.id) touchedArtifactIds.add(String(artifact.id));
      }
    };
    const shouldRevokePairedAssistant = Boolean(pairedAssistant && !pairedAssistant.revokedAt);
    const activeRunIds = [];
    rememberArtifacts(message);
    if (shouldRevokePairedAssistant) {
      rememberArtifacts(pairedAssistant);
      if (["queued", "running"].includes(pairedAssistant.status) && pairedAssistant.runId) {
        activeRunIds.push(pairedAssistant.runId);
      }
    }
    let stoppedRunIds = [];
    try {
      stoppedRunIds = await stopRunIds(activeRunIds);
    } catch (err) {
      sendJson(res, err.status || 502, { error: err.message || String(err) });
      return;
    }
    revokeGroupMessagePayload(message, now, revoker, GROUP_MESSAGE_REVOKED_TEXT);
    if (shouldRevokePairedAssistant) {
      revokeGroupMessagePayload(pairedAssistant, now, revoker, GROUP_AI_REPLY_REVOKED_TEXT);
      pairedAssistant.status = "cancelled";
      pairedAssistant.cancelledAt = now;
      pairedAssistant.completedAt = "";
      pairedAssistant.failedAt = "";
      touchedMessages.push(pairedAssistant);
    }
    for (const runId of stoppedRunIds) removeThreadActiveRun(thread, runId, "idle");
    const touchedMessageIds = new Set(touchedMessages.map((item) => String(item.id || "")).filter(Boolean));
    state.artifacts = (state.artifacts || []).filter((artifact) => {
      if (touchedArtifactIds.has(String(artifact.id || ""))) return false;
      if (artifact.threadId === thread.id && touchedMessageIds.has(String(artifact.messageId || ""))) return false;
      return true;
    });
    thread.status = (thread.activeRunIds || []).length ? "running" : "idle";
    thread.updatedAt = now;
    saveState(state, { reason: "group-message-revoke", forceBackup: true });
    broadcast({ type: "thread.updated", threadId: thread.id, thread: threadSummary(thread) });
    for (const touched of touchedMessages) {
      broadcast({ type: "message.updated", threadId: thread.id, message: compactMessage(touched), thread: threadSummary(thread) });
    }
    if (shouldRevokePairedAssistant) scheduleNextQueuedRunForTaskGroup(thread, SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID);
    sendJson(res, 200, {
      ok: true,
      stoppedRunIds,
      messages: touchedMessages.map(compactMessage),
      thread: compactThread(thread),
    });
    return;
  }

  const taskDelete = url.pathname.match(/^\/api\/threads\/([^/]+)\/tasks\/([^/]+)$/);
  if (taskDelete && req.method === "PATCH") {
    const thread = findThreadForRequest(req, decodeURIComponent(taskDelete[1]));
    if (!thread) {
      sendJson(res, 404, { error: "Thread not found" });
      return;
    }
    if (!thread.singleWindow) {
      sendJson(res, 400, { error: "Task rename is only supported for single-window task groups" });
      return;
    }
    const taskGroupId = sanitizeTaskGroupId(decodeURIComponent(taskDelete[2]));
    if (isSingleWindowConversationTaskGroupId(taskGroupId)) {
      sendJson(res, 400, { error: "Chat history cannot be renamed as a task" });
      return;
    }
    const groupMessages = (thread.messages || []).filter((message) => message.taskGroupId === taskGroupId);
    if (!groupMessages.length) {
      sendJson(res, 404, { error: "Task not found" });
      return;
    }
    const body = await readBody(req).catch(() => ({}));
    const title = sanitizeTaskTitle(body.title || body.name || "");
    if (!title) {
      sendJson(res, 400, { error: "Task title is required" });
      return;
    }
    const updatedAt = nowIso();
    thread.taskGroupMeta = normalizeTaskGroupMeta(thread.taskGroupMeta);
    thread.taskGroupMeta[taskGroupId] = { title, updatedAt };
    thread.updatedAt = updatedAt;
    saveState();
    broadcast({ type: "task.renamed", threadId: thread.id, taskGroupId, title, thread: compactThread(thread) });
    sendJson(res, 200, { ok: true, taskGroupId, title, thread: compactThread(thread) });
    return;
  }

  if (taskDelete && req.method === "DELETE") {
    const thread = findThreadForRequest(req, decodeURIComponent(taskDelete[1]));
    if (!thread) {
      sendJson(res, 404, { error: "Thread not found" });
      return;
    }
    if (!thread.singleWindow) {
      sendJson(res, 400, { error: "Task deletion is only supported for single-window task groups" });
      return;
    }
    const taskGroupId = sanitizeTaskGroupId(decodeURIComponent(taskDelete[2]));
    if (isSingleWindowConversationTaskGroupId(taskGroupId)) {
      sendJson(res, 400, { error: "Chat history cannot be deleted as a task" });
      return;
    }
    const deletedMessages = (thread.messages || []).filter((message) => message.taskGroupId === taskGroupId);
    if (!deletedMessages.length) {
      sendJson(res, 404, { error: "Task not found" });
      return;
    }
    const deletedMessageIds = new Set(deletedMessages.map((message) => message.id).filter(Boolean));
    const deletedArtifactIds = new Set();
    for (const message of deletedMessages) {
      for (const artifact of Array.isArray(message.artifacts) ? message.artifacts : []) {
        if (artifact?.id) deletedArtifactIds.add(String(artifact.id));
      }
    }
    const activeRunIds = deletedMessages
      .filter((message) => ["queued", "running"].includes(message.status))
      .map((message) => message.runId)
      .filter(Boolean);
    let stoppedRunIds = [];
    try {
      stoppedRunIds = await stopRunIds(activeRunIds);
    } catch (err) {
      sendJson(res, err.status || 502, { error: err.message || String(err) });
      return;
    }
    thread.activeRunIds = (thread.activeRunIds || []).filter((runId) => !activeRunIds.includes(runId));
    if (activeRunIds.includes(thread.activeRunId)) thread.activeRunId = thread.activeRunIds[thread.activeRunIds.length - 1] || null;
    thread.messages = (thread.messages || []).filter((message) => message.taskGroupId !== taskGroupId);
    if (thread.taskGroupMeta && typeof thread.taskGroupMeta === "object") delete thread.taskGroupMeta[taskGroupId];
    thread.status = thread.activeRunIds.length ? "running" : "idle";
    thread.updatedAt = nowIso();
    state.artifacts = (state.artifacts || []).filter((artifact) => {
      if (deletedArtifactIds.has(String(artifact.id || ""))) return false;
      if (artifact.threadId === thread.id && deletedMessageIds.has(String(artifact.messageId || ""))) return false;
      return true;
    });
    saveState(state, { allowMessageDrop: true, reason: "task-delete", forceBackup: true });
    broadcast({ type: "task.deleted", threadId: thread.id, taskGroupId, stoppedRunIds, thread: compactThread(thread) });
    sendJson(res, 200, { ok: true, taskGroupId, deletedMessages: deletedMessages.length, stoppedRunIds, thread: compactThread(thread) });
    return;
  }

  const interrupt = url.pathname.match(/^\/api\/threads\/([^/]+)\/interrupt$/);
  if (interrupt && req.method === "POST") {
    const thread = findThreadForRequest(req, decodeURIComponent(interrupt[1]));
    const body = await readBody(req).catch(() => ({}));
    const taskGroupId = body.taskGroupId ? sanitizeTaskGroupId(body.taskGroupId) : "";
    let runIds = thread ? dedupe([...(thread.activeRunIds || []), thread.activeRunId].filter(Boolean)) : [];
    if (thread && taskGroupId) {
      const groupRunIds = (thread.messages || [])
        .filter((message) => message.taskGroupId === taskGroupId)
        .filter((message) => ["queued", "running"].includes(message.status))
        .map((message) => message.runId)
        .filter(Boolean);
      runIds = runIds.filter((runId) => groupRunIds.includes(runId));
    }
    if (!thread || !runIds.length) {
      sendJson(res, 404, { error: "No active run for thread" });
      return;
    }
    try {
      await stopRunIds(runIds);
      sendJson(res, 200, { ok: true, runIds });
    } catch (err) {
      sendJson(res, err.status || 502, { error: err.message || String(err) });
    }
    return;
  }

  if (url.pathname === "/api/directories/preview" && req.method === "GET") {
    const threadId = String(url.searchParams.get("threadId") || "");
    const thread = findThreadForRequest(req, threadId);
    if (!thread) {
      sendJson(res, 404, { error: "Thread not found" });
      return;
    }
    const resolved = await resolveBrowserPathAsync(thread, url.searchParams);
    if (!resolved) {
      sendJson(res, 404, { error: "Directory not found or not allowed" });
      return;
    }
    if (resolved.remote === "wsl") {
      if (resolved.remoteEntry?.type !== "directory") {
        sendJson(res, 400, { error: "Path is not a directory" });
        return;
      }
      const result = await runDirectoryBridge({ action: "preview", path: resolved.displayPath }).catch((err) => ({ ok: false, error: err.message || String(err) }));
      if (!result?.ok) {
        sendJson(res, 404, { error: result?.error || "Directory not found" });
        return;
      }
      const entries = (result.entries || [])
        .map((entry) => publicRemoteDirectoryEntry(thread, resolved.displayPath, entry))
        .filter(Boolean)
        .sort(compareDirectoryEntriesNewestFirst)
        .slice(0, 300);
      sendJson(res, 200, {
        label: resolved.label,
        path: resolved.displayPath,
        displayPath: resolved.workspacePath,
        workspacePath: resolved.workspacePath,
        localPath: "",
        remote: "wsl",
        updatedAt: result.updatedAt || resolved.remoteEntry?.mtime || "",
        entryCount: entries.length,
        entries,
      });
      return;
    }
    let stat;
    try {
      stat = fs.statSync(resolved.localPath);
    } catch (_) {
      sendJson(res, 404, { error: "Directory not found" });
      return;
    }
    if (!stat.isDirectory()) {
      sendJson(res, 400, { error: "Path is not a directory" });
      return;
    }
    const entries = fs.readdirSync(resolved.localPath, { withFileTypes: true })
      .map((entry) => publicDirectoryEntry(thread, resolved.displayPath, resolved.localPath, entry))
      .filter(Boolean)
      .sort(compareDirectoryEntriesNewestFirst)
      .slice(0, 300);
    sendJson(res, 200, {
      label: resolved.label,
      path: resolved.displayPath,
      displayPath: resolved.workspacePath,
      workspacePath: resolved.workspacePath,
      localPath: resolved.localPath,
      updatedAt: stat.mtime.toISOString(),
      entryCount: entries.length,
      entries,
    });
    return;
  }

  if (url.pathname === "/api/directories/create" && req.method === "POST") {
    const body = await readBody(req).catch((err) => ({ __error: err }));
    if (body.__error) {
      sendJson(res, 400, { error: body.__error.message || "Invalid request body" });
      return;
    }
    const thread = findThreadForRequest(req, String(body.threadId || ""));
    if (!thread) {
      sendJson(res, 404, { error: "Thread not found" });
      return;
    }
    const resolved = await resolveBrowserPathAsync(thread, directoryRequestParams(body));
    if (!resolved) {
      sendJson(res, 404, { error: "Directory not found or not allowed" });
      return;
    }
    const name = safeDirectoryName(body.name || "");
    if (!name) {
      sendJson(res, 400, { error: "Invalid directory name" });
      return;
    }
    if (resolved.remote === "wsl") {
      if (resolved.remoteEntry?.type !== "directory") {
        sendJson(res, 400, { error: "Path is not a directory" });
        return;
      }
      if (!isSharedDirectoryWriteAllowed(thread, "", resolved.displayPath, authenticateRequest(req))) {
        sendJson(res, 403, { error: "Shared directory is read-only" });
        return;
      }
      const targetDisplayPath = joinDisplayPath(resolved.displayPath, name);
      if (!isDirectoryBrowserPathAllowedForThread(thread, "", targetDisplayPath)) {
        sendJson(res, 403, { error: "Target directory is not allowed" });
        return;
      }
      const result = await runDirectoryBridge({ action: "mkdir", path: resolved.displayPath, name }).catch((err) => ({ ok: false, error: err.message || String(err) }));
      if (!result?.ok) {
        const status = /already exists/i.test(result?.error || "") ? 409 : 500;
        sendJson(res, status, { error: result?.error || "Create directory failed" });
        return;
      }
      invalidateCatalogCache();
      dynamicProjectCache.delete(String(thread.workspaceId || ""));
      sendJson(res, 201, {
        ok: true,
        entry: publicRemoteDirectoryEntry(thread, resolved.displayPath, result.entry),
      });
      return;
    }
    let stat;
    try {
      stat = fs.statSync(resolved.localPath);
    } catch (_) {
      sendJson(res, 404, { error: "Directory not found" });
      return;
    }
    if (!stat.isDirectory()) {
      sendJson(res, 400, { error: "Path is not a directory" });
      return;
    }
    const targetLocalPath = path.join(resolved.localPath, name);
    const targetDisplayPath = joinDisplayPath(resolved.displayPath, name);
    try {
      if (!isSharedDirectoryWriteAllowed(thread, resolved.localPath, resolved.displayPath, authenticateRequest(req))) {
        sendJson(res, 403, { error: "Shared directory is read-only" });
        return;
      }
      assertChildPathInside(resolved.localPath, targetLocalPath);
      if (!isDirectoryBrowserPathAllowedForThread(thread, targetLocalPath, targetDisplayPath)) {
        sendJson(res, 403, { error: "Target directory is not allowed" });
        return;
      }
      if (fs.existsSync(targetLocalPath)) {
        sendJson(res, 409, { error: "Directory already exists" });
        return;
      }
      fs.mkdirSync(targetLocalPath);
      invalidateCatalogCache();
      dynamicProjectCache.delete(String(thread.workspaceId || ""));
      sendJson(res, 201, {
        ok: true,
        entry: publicManagedEntry(thread, resolved.displayPath, resolved.localPath, targetLocalPath),
      });
    } catch (err) {
      sendJson(res, err.status || 500, { error: err.message || String(err) });
    }
    return;
  }

  if (url.pathname === "/api/directories/upload" && req.method === "POST") {
    const body = await readBody(req, Math.ceil(MAX_UPLOAD_BYTES * 1.4) + 8192).catch((err) => ({ __error: err }));
    if (body.__error) {
      sendJson(res, 400, { error: body.__error.message || "Invalid request body" });
      return;
    }
    const thread = findThreadForRequest(req, String(body.threadId || ""));
    if (!thread) {
      sendJson(res, 404, { error: "Thread not found" });
      return;
    }
    const resolved = await resolveBrowserPathAsync(thread, directoryRequestParams(body));
    if (!resolved) {
      sendJson(res, 404, { error: "Directory not found or not allowed" });
      return;
    }
    const filename = safeFileName(body.filename || "upload.bin");
    const data = String(body.dataBase64 || "");
    if (!data) {
      sendJson(res, 400, { error: "Missing dataBase64" });
      return;
    }
    const buffer = Buffer.from(data, "base64");
    if (!buffer.length || buffer.length > MAX_UPLOAD_BYTES) {
      sendJson(res, 400, { error: "Invalid or too-large upload" });
      return;
    }
    if (resolved.remote === "wsl") {
      if (resolved.remoteEntry?.type !== "directory") {
        sendJson(res, 400, { error: "Path is not a directory" });
        return;
      }
      if (!isSharedDirectoryWriteAllowed(thread, "", resolved.displayPath, authenticateRequest(req))) {
        sendJson(res, 403, { error: "Shared directory is read-only" });
        return;
      }
      const targetDisplayPath = joinDisplayPath(resolved.displayPath, filename);
      if (!isDirectoryBrowserPathAllowedForThread(thread, "", targetDisplayPath)) {
        sendJson(res, 403, { error: "Target file is not allowed" });
        return;
      }
      const result = await runDirectoryBridge({
        action: "upload",
        path: resolved.displayPath,
        filename,
        dataBase64: data,
      }).catch((err) => ({ ok: false, error: err.message || String(err) }));
      if (!result?.ok) {
        sendJson(res, 500, { error: result?.error || "Upload failed" });
        return;
      }
      sendJson(res, 201, {
        ok: true,
        entry: publicRemoteDirectoryEntry(thread, resolved.displayPath, result.entry),
      });
      return;
    }
    let stat;
    try {
      stat = fs.statSync(resolved.localPath);
    } catch (_) {
      sendJson(res, 404, { error: "Directory not found" });
      return;
    }
    if (!stat.isDirectory()) {
      sendJson(res, 400, { error: "Path is not a directory" });
      return;
    }
    try {
      if (!isSharedDirectoryWriteAllowed(thread, resolved.localPath, resolved.displayPath, authenticateRequest(req))) {
        sendJson(res, 403, { error: "Shared directory is read-only" });
        return;
      }
      const targetLocalPath = uniqueChildPath(resolved.localPath, filename);
      const targetDisplayPath = joinDisplayPath(resolved.displayPath, path.basename(targetLocalPath));
      assertChildPathInside(resolved.localPath, targetLocalPath);
      if (!isDirectoryBrowserPathAllowedForThread(thread, targetLocalPath, targetDisplayPath)) {
        sendJson(res, 403, { error: "Target file is not allowed" });
        return;
      }
      fs.writeFileSync(targetLocalPath, buffer, { flag: "wx" });
      sendJson(res, 201, {
        ok: true,
        entry: publicManagedEntry(thread, resolved.displayPath, resolved.localPath, targetLocalPath),
      });
    } catch (err) {
      sendJson(res, err.status || 500, { error: err.message || String(err) });
    }
    return;
  }

  if (url.pathname === "/api/directories/share" && req.method === "POST") {
    const body = await readBody(req).catch((err) => ({ __error: err }));
    if (body.__error) {
      sendJson(res, 400, { error: body.__error.message || "Invalid request body" });
      return;
    }
    const thread = findThreadForRequest(req, String(body.threadId || ""));
    if (!thread) {
      sendJson(res, 404, { error: "Thread not found" });
      return;
    }
    const resolved = await resolveBrowserPathAsync(thread, directoryRequestParams(body));
    if (!resolved) {
      sendJson(res, 404, { error: "Directory not found or not allowed" });
      return;
    }
    const rootProject = await shareableRootProjectForPath(thread.workspaceId, resolved.displayPath);
    if (!rootProject) {
      sendJson(res, 400, { error: "Only first-level directories on the directory root page can be shared" });
      return;
    }
    let label = String(body.name || resolved.label || sharedDirectoryLabel(resolved.displayPath)).trim();
    if (resolved.remote === "wsl") {
      if (resolved.remoteEntry?.type !== "directory") {
        sendJson(res, 400, { error: "Only directories can be shared" });
        return;
      }
      label = String(rootProject.label || resolved.remoteEntry?.name || label || sharedDirectoryLabel(resolved.displayPath)).trim();
    } else {
      let stat;
      try {
        stat = fs.statSync(resolved.localPath);
      } catch (_) {
        sendJson(res, 404, { error: "Directory not found" });
        return;
      }
      if (!stat.isDirectory()) {
        sendJson(res, 400, { error: "Only directories can be shared" });
        return;
      }
      label = String(rootProject.label || path.basename(resolved.localPath) || label || sharedDirectoryLabel(resolved.displayPath)).trim();
    }
    const record = upsertSharedDirectory({
      path: resolved.displayPath,
      label,
      createdAt: nowIso(),
      createdBy: thread.workspaceId,
      createdByPrincipalId: workspacePrincipal(thread.workspaceId),
      permission: normalizeSharePermission(body.permission),
      scope: normalizeShareScope(body.scope, normalizeShareTargets(body)),
      targetWorkspaceIds: normalizeShareTargets(body),
    });
    invalidateCatalogCache();
    dynamicProjectCache.clear();
    sendJson(res, 200, {
      ok: true,
      shared: Object.assign({}, publicSharedDirectory(record, thread.workspaceId), {
        displayPath: resolved.workspacePath,
        workspacePath: resolved.workspacePath,
        source: "hermes-web-shared-directory",
      }),
    });
    return;
  }

  if (url.pathname === "/api/directories/unshare" && req.method === "POST") {
    const body = await readBody(req).catch((err) => ({ __error: err }));
    if (body.__error) {
      sendJson(res, 400, { error: body.__error.message || "Invalid request body" });
      return;
    }
    const workspaceId = requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    try {
      const record = removeSharedDirectoryRecord(body.id || body.path, workspaceId);
      invalidateCatalogCache();
      dynamicProjectCache.clear();
      sendJson(res, 200, { ok: true, removed: publicSharedDirectory(record, workspaceId) });
    } catch (err) {
      sendJson(res, err.status || 500, { error: err.message || String(err) });
    }
    return;
  }

  if (url.pathname === "/api/directories/share/update" && req.method === "POST") {
    const body = await readBody(req).catch((err) => ({ __error: err }));
    if (body.__error) {
      sendJson(res, 400, { error: body.__error.message || "Invalid request body" });
      return;
    }
    const workspaceId = requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    try {
      const record = updateSharedDirectoryAccess(body.id || body.path, workspaceId, body);
      invalidateCatalogCache();
      dynamicProjectCache.clear();
      sendJson(res, 200, { ok: true, shared: publicSharedDirectory(record, workspaceId) });
    } catch (err) {
      sendJson(res, err.status || 500, { error: err.message || String(err) });
    }
    return;
  }

  if (url.pathname === "/api/directories/delete" && req.method === "POST") {
    const body = await readBody(req).catch((err) => ({ __error: err }));
    if (body.__error) {
      sendJson(res, 400, { error: body.__error.message || "Invalid request body" });
      return;
    }
    const thread = findThreadForRequest(req, String(body.threadId || ""));
    if (!thread) {
      sendJson(res, 404, { error: "Thread not found" });
      return;
    }
    const resolved = await resolveBrowserPathAsync(thread, directoryRequestParams(body));
    if (!resolved) {
      sendJson(res, 404, { error: "Path not found or not allowed" });
      return;
    }
    if (resolved.remote === "wsl") {
      const isDirectory = resolved.remoteEntry?.type === "directory";
      if (!isSharedDirectoryWriteAllowed(thread, "", resolved.displayPath, authenticateRequest(req))) {
        sendJson(res, 403, { error: "Shared directory is read-only" });
        return;
      }
      if (isDirectory
        && isProtectedDirectoryRoot(thread, "", resolved.displayPath)
        && !isDeletableWorkspaceRootChild(thread, "", resolved.displayPath)) {
        sendJson(res, 400, { error: "Cannot delete a project/workspace root directory" });
        return;
      }
      const result = await runDirectoryBridge({ action: "delete", path: resolved.displayPath }).catch((err) => ({ ok: false, error: err.message || String(err) }));
      if (!result?.ok) {
        const code = /not empty/i.test(result?.error || "") ? 409 : 500;
        sendJson(res, code, { error: /not empty/i.test(result?.error || "") ? "Directory is not empty" : (result?.error || "Delete failed") });
        return;
      }
      invalidateCatalogCache();
      dynamicProjectCache.delete(String(thread.workspaceId || ""));
      sendJson(res, 200, {
        ok: true,
        deleted: {
          path: resolved.displayPath,
          displayPath: resolved.workspacePath,
          workspacePath: resolved.workspacePath,
          name: resolved.remoteEntry?.name || path.posix.basename(resolved.displayPath),
          type: isDirectory ? "directory" : "file",
        },
      });
      return;
    }
    let stat;
    try {
      stat = fs.statSync(resolved.localPath);
    } catch (_) {
      sendJson(res, 404, { error: "Path not found" });
      return;
    }
    if (!isSharedDirectoryWriteAllowed(thread, resolved.localPath, resolved.displayPath, authenticateRequest(req))) {
      sendJson(res, 403, { error: "Shared directory is read-only" });
      return;
    }
    if (stat.isDirectory()
      && isProtectedDirectoryRoot(thread, resolved.localPath, resolved.displayPath)
      && !isDeletableWorkspaceRootChild(thread, resolved.localPath, resolved.displayPath)) {
      sendJson(res, 400, { error: "Cannot delete a project/workspace root directory" });
      return;
    }
    try {
      if (stat.isDirectory()) {
        fs.rmdirSync(resolved.localPath);
      } else {
        fs.unlinkSync(resolved.localPath);
      }
      invalidateCatalogCache();
      dynamicProjectCache.delete(String(thread.workspaceId || ""));
      sendJson(res, 200, {
        ok: true,
        deleted: {
          path: resolved.displayPath,
          displayPath: resolved.workspacePath,
          workspacePath: resolved.workspacePath,
          name: path.basename(resolved.localPath),
          type: stat.isDirectory() ? "directory" : "file",
        },
      });
    } catch (err) {
      const code = err?.code === "ENOTEMPTY" || err?.code === "EEXIST" ? 409 : 500;
      sendJson(res, code, { error: err?.code === "ENOTEMPTY" ? "Directory is not empty" : (err.message || String(err)) });
    }
    return;
  }

  if (url.pathname === "/api/files/preview" && req.method === "GET") {
    const resolved = resolveFileForBrowserRequest(url.searchParams, auth);
    if (!resolved.file) {
      sendJson(res, resolved.status || 404, { error: resolved.error || "File not found" });
      return;
    }
    const file = resolved.file;
    const ext = path.extname(file.localPath).toLowerCase();
    try {
      let preview;
      if (ext === ".docx") preview = extractDocxText(file.localPath);
      else if ([".txt", ".md", ".csv", ".json"].includes(ext) || /^text\//i.test(file.mime)) preview = textFilePreview(file.localPath);
      else {
        sendJson(res, 415, { error: "Preview is not supported for this file type", name: file.name, mime: file.mime });
        return;
      }
      sendJson(res, 200, {
        name: file.name,
        mime: file.mime,
        size: file.size,
        updatedAt: file.updatedAt,
        path: file.displayPath,
        text: preview.text,
        totalChars: preview.totalChars,
        truncated: preview.truncated,
      });
    } catch (err) {
      sendJson(res, 422, { error: `Preview failed: ${err.message || String(err)}` });
    }
    return;
  }

  if (url.pathname === "/api/files" && req.method === "GET") {
    const resolved = resolveFileForBrowserRequest(url.searchParams, auth);
    if (!resolved.file) {
      sendJson(res, resolved.status || 404, { error: resolved.error || "File not found" });
      return;
    }
    const file = resolved.file;
    const disposition = /^(1|true|yes|on)$/i.test(String(url.searchParams.get("download") || ""))
      ? "attachment"
      : "inline";
    res.writeHead(200, {
      "Content-Type": file.mime || mimeFor(file.localPath),
      "Content-Length": file.size,
      "Content-Disposition": contentDisposition(disposition, file.name || path.basename(file.localPath)),
      "Cache-Control": "private, max-age=60",
    });
    fs.createReadStream(file.localPath).pipe(res);
    return;
  }

  const artifactRead = url.pathname.match(/^\/api\/artifacts\/([^/]+)$/);
  if (artifactRead && req.method === "GET") {
    const resolvedArtifact = resolveArtifactForRequest(decodeURIComponent(artifactRead[1]), auth);
    if (!resolvedArtifact.artifact) {
      sendJson(res, resolvedArtifact.status || 404, { error: resolvedArtifact.error || "Artifact not found" });
      return;
    }
    const artifact = resolvedArtifact.artifact;
    const artifactPath = artifact.localPath || artifact.path;
    const disposition = /^(1|true|yes|on)$/i.test(String(url.searchParams.get("download") || ""))
      ? "attachment"
      : "inline";
    res.writeHead(200, {
      "Content-Type": artifact.mime || mimeFor(artifactPath),
      "Content-Length": fs.statSync(artifactPath).size,
      "Content-Disposition": contentDisposition(disposition, artifact.name || path.basename(artifactPath)),
      "Cache-Control": "private, max-age=60",
    });
    fs.createReadStream(artifactPath).pipe(res);
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

function handleEvents(req, res) {
  const auth = authenticateRequest(req);
  if (!auth.ok) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }
  const url = getUrl(req);
  const reportedClientVersion = url.searchParams.get("clientVersion") || req.headers["x-hermes-web-client-version"] || "";
  let lastSentClientVersion = "";
  const sendClientVersionEvent = (force = false) => {
    const info = clientVersionInfo(reportedClientVersion);
    if (!force && info.version === lastSentClientVersion) return false;
    lastSentClientVersion = info.version;
    res.write(`data: ${JSON.stringify({ type: "client.version", clientVersion: info })}\n\n`);
    return true;
  };
  pruneEmptyThreads();
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`data: ${JSON.stringify({
    type: "snapshot",
    threads: state.threads.filter((thread) => threadAccessibleToAuth(auth, thread)).map(threadSummary),
    status: { apiBase: effectiveHermesApiBase(), activeRuns: activeStreams.size, concurrency: runConcurrencySnapshot() },
    clientVersion: clientVersionInfo(reportedClientVersion),
  })}\n\n`);
  lastSentClientVersion = readClientVersion();
  const client = { res, auth };
  clients.add(client);
  const heartbeat = setInterval(() => {
    try {
      if (!sendClientVersionEvent(false)) res.write(": keepalive\n\n");
    } catch (_) {
      clearInterval(heartbeat);
      clients.delete(client);
    }
  }, 25000);
  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(client);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = getUrl(req);
    if (url.pathname === "/api/events") {
      handleEvents(req, res);
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }
    serveStatic(req, res);
  } catch (err) {
    console.error(`Hermes Mobile request failed ${req.method || ""} ${req.url || ""}: ${err.stack || err.message || String(err)}`);
    sendJson(res, 500, { error: err.message || String(err) });
  }
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

reconcileDetachedActiveRuns();

function shutdown() {
  for (const stream of activeStreams.values()) {
    try {
      stream.controller.abort();
    } catch (_) {}
  }
  process.exit(0);
}

server.listen(PORT, HOST, () => {
  console.log(`Hermes Mobile listening on http://${HOST}:${PORT}`);
  console.log(`Hermes API base: ${effectiveHermesApiBase()}`);
  console.log(`State directory: ${DATA_DIR}`);
  console.log(DISABLE_AUTH ? "Authentication disabled by HERMES_WEB_DISABLE_AUTH." : `Authentication enabled; Owner key source is ${authProvider.ownerKeySource()}.`);
  if (!DISABLE_AUTH && authProvider.ownerKeySource() !== "env") {
    console.log("Current process login key is not printed; use the configured Owner key file or HERMES_WEB_KEY.");
  }
  startTodoWebPushDispatcher();
  startAutomationWebPushDispatcher();
});
