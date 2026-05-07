"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { spawn } = require("node:child_process");
const webpush = require("web-push");
const { createAccessPolicyProvider } = require("./adapters/access-policy-provider");
const { createAuthProvider } = require("./adapters/auth-provider");
const { createAutomationProvider } = require("./adapters/automation-provider");
const { createBridgeCommandProvider } = require("./adapters/bridge-command-provider");
const { createDisplayPathProvider } = require("./adapters/display-path-provider");
const { createExternalIntegrationProvider } = require("./adapters/external-integration-provider");
const { createFilesystemMountProvider } = require("./adapters/filesystem-mount-provider");
const { createGatewayPoolProvider } = require("./adapters/gateway-pool-provider");
const { createGatewayRunner } = require("./adapters/gateway-runner");
const { createProjectDiscoveryProvider } = require("./adapters/project-discovery-provider");
const { createRuntimeConfigProvider } = require("./adapters/runtime-config-provider");
const { createRunConcurrencyPolicy } = require("./adapters/run-concurrency-policy");
const { createSharedDirectoryProvider } = require("./adapters/shared-directory-provider");
const { createSkillDetailProvider } = require("./adapters/skill-detail-provider");
const { createWorkspaceBindingsProvider } = require("./adapters/workspace-bindings-provider");
const { createWorkspaceProjectProvider } = require("./adapters/workspace-project-provider");
const { createTodoProvider } = require("./adapters/todo-provider");

const TOOL_ROOT = __dirname;
const REPO_ROOT = path.resolve(process.env.HERMES_WEB_REPO_ROOT || process.env.HERMES_MOBILE_ROOT || TOOL_ROOT);
const PUBLIC_ROOT = path.join(TOOL_ROOT, "public");
const INDEX_HTML_PATH = path.join(PUBLIC_ROOT, "index.html");
const DEFAULT_TODO_BRIDGE_SCRIPT = path.join(TOOL_ROOT, "todo_bridge.py");
const DEFAULT_CRON_BRIDGE_SCRIPT = path.join(TOOL_ROOT, "cron_bridge.py");
const DEFAULT_DIRECTORY_BRIDGE_SCRIPT = path.join(TOOL_ROOT, "directory_bridge.py");
const DEFAULT_SKILL_BRIDGE_SCRIPT = path.join(TOOL_ROOT, "skill_bridge.py");
const LOCAL_CONFIG_ROOT = path.resolve(process.env.HERMES_WEB_CONFIG_DIR || path.join(REPO_ROOT, "config"));

const HOST = process.env.HERMES_WEB_HOST || "0.0.0.0";
const PORT = Number(process.env.HERMES_WEB_PORT || "8797");
const HERMES_API_BASE = stripTrailingSlash(
  process.env.HERMES_WEB_HERMES_API_BASE || process.env.HERMES_API_BASE || "http://127.0.0.1:8642",
);
const HERMES_API_TIMEOUT_MS = Number(process.env.HERMES_WEB_HERMES_API_TIMEOUT_MS || "8000");
const GATEWAY_POOL_ENABLED = process.env.HERMES_WEB_GATEWAY_POOL_ENABLED || "auto";
const GATEWAY_POOL_HEALTH_TIMEOUT_MS = Number(process.env.HERMES_WEB_GATEWAY_POOL_HEALTH_TIMEOUT_MS || "5000");
const RUN_START_TIMEOUT_MS = Number(process.env.HERMES_WEB_RUN_START_TIMEOUT_MS || "90000");
const RUN_LIVENESS_CHECK_AFTER_MS = Number(process.env.HERMES_WEB_RUN_LIVENESS_CHECK_AFTER_MS || "120000");
const RUN_LIVENESS_CHECK_INTERVAL_MS = Number(process.env.HERMES_WEB_RUN_LIVENESS_CHECK_INTERVAL_MS || "45000");
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
const GROUP_DELIVERIES_DIR = path.join(DATA_DIR, "artifacts", "group-deliveries");
const OWNER_DEFAULT_WORKSPACE = path.resolve(process.env.HERMES_WEB_OWNER_DEFAULT_WORKSPACE || path.join(DATA_DIR, "drive"));
const AUTH_KEY_PATH = path.resolve(process.env.HERMES_WEB_AUTH_KEY_PATH || path.join(REPO_ROOT, ".hermes_web_secret_key"));
const WEB_PUSH_VAPID_PATH = path.resolve(
  process.env.HERMES_WEB_VAPID_PATH || process.env.WEB_PUSH_VAPID_PATH || path.join(DATA_DIR, "web-push-vapid.json"),
);
const WSL_DISTRO = process.env.HERMES_WEB_WSL_DISTRO || "Ubuntu-24.04";
const WINDOWS_HOME = process.env.USERPROFILE || os.homedir() || "";
const WSL_USER = process.env.HERMES_WEB_WSL_USER || process.env.WSL_USER || process.env.USER || "hermes";
const WSL_HOME = stripTrailingSlash(process.env.HERMES_WEB_WSL_HOME || `/home/${WSL_USER}`);
const WSL_HERMES_HOME = stripTrailingSlash(process.env.HERMES_WEB_WSL_HERMES_HOME || `${WSL_HOME}/.hermes`);
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
  process.env.HERMES_WEB_WEIXIN_USERS_PATH,
  ...wslUncPathCandidates(WSL_HERMES_HOME, "access-control", "workspace-users.json"),
  ...wslUncPathCandidates(WSL_HERMES_HOME, "access-control", "weixin-users.json"),
  path.join(LOCAL_CONFIG_ROOT, "access-control", "workspace-users.json"),
  path.join(LOCAL_CONFIG_ROOT, "access-control", "weixin-users.json"),
].filter(Boolean);
const WORKSPACE_ROUTE_MAP_PATHS = [
  process.env.HERMES_WEB_WORKSPACE_ROUTE_MAP_PATH,
  process.env.HERMES_WEB_WEIXIN_ROUTE_MAP_PATH,
  ...wslUncPathCandidates(WSL_HERMES_HOME, "access-control", "workspace-routing-map.json"),
  ...wslUncPathCandidates(WSL_HERMES_HOME, "access-control", "weixin-routing-map.json"),
  path.join(LOCAL_CONFIG_ROOT, "access-control", "workspace-routing-map.json"),
  path.join(LOCAL_CONFIG_ROOT, "access-control", "weixin-routing-map.json"),
].filter(Boolean);
const HERMES_CONFIG_PATHS = [
  process.env.HERMES_WEB_HERMES_CONFIG_PATH,
  process.env.HERMES_CONFIG_PATH,
  ...wslUncPathCandidates(WSL_HERMES_HOME, "config.yaml"),
  path.join(LOCAL_CONFIG_ROOT, "hermes-config.yaml"),
  path.join(LOCAL_CONFIG_ROOT, "config.yaml"),
].filter(Boolean);
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
const MAX_EVENT_PREVIEW_CHARS = 1600;
const MAX_STORED_EVENTS_PER_THREAD = 80;
const MAX_UPLOAD_BYTES = Number(process.env.HERMES_WEB_MAX_UPLOAD_BYTES || "104857600");
const MAX_FILE_PREVIEW_CHARS = Number(process.env.HERMES_WEB_MAX_FILE_PREVIEW_CHARS || "180000");
const TODO_BRIDGE_TIMEOUT_MS = Number(process.env.HERMES_WEB_TODO_BRIDGE_TIMEOUT_MS || "15000");
const CRON_BRIDGE_TIMEOUT_MS = Number(process.env.HERMES_WEB_CRON_BRIDGE_TIMEOUT_MS || "15000");
const CRON_LIST_CACHE_TTL_MS = Number(process.env.HERMES_WEB_CRON_LIST_CACHE_TTL_MS || "12000");
const AUTOMATION_CREATE_TIMEOUT_MS = Number(process.env.HERMES_WEB_AUTOMATION_CREATE_TIMEOUT_MS || "60000");
const AUTOMATION_CREATE_MODEL = process.env.HERMES_WEB_AUTOMATION_CREATE_MODEL || "gpt-5.4-mini";
const DIRECTORY_BRIDGE_TIMEOUT_MS = Number(process.env.HERMES_WEB_DIRECTORY_BRIDGE_TIMEOUT_MS || "15000");
const SKILL_BRIDGE_TIMEOUT_MS = Number(process.env.HERMES_WEB_SKILL_BRIDGE_TIMEOUT_MS || "12000");
const CRON_OUTPUT_ROOT = stripTrailingSlash(process.env.HERMES_WEB_CRON_OUTPUT_ROOT || `${WSL_HERMES_HOME}/cron/output`);
const TODO_BACKEND = String(process.env.HERMES_WEB_TODO_BACKEND || "local").trim().toLowerCase();
const AUTOMATION_BACKEND = String(process.env.HERMES_WEB_AUTOMATION_BACKEND || "local").trim().toLowerCase();
const LOCAL_TODO_STORE_PATH = path.resolve(process.env.HERMES_WEB_TODO_STORE_PATH || path.join(DATA_DIR, "todos.json"));
const LOCAL_AUTOMATION_STORE_PATH = path.resolve(process.env.HERMES_WEB_AUTOMATION_STORE_PATH || path.join(DATA_DIR, "automations.json"));
const SERVICE_STORE_BACKEND = String(process.env.HERMES_WEB_SERVICE_STORE || "").trim().toLowerCase();
const MOBILE_SQLITE_DB_PATH = path.resolve(process.env.HERMES_WEB_DB_PATH || path.join(DATA_DIR, "hermes-mobile.sqlite3"));
const WEB_PUSH_ENABLED = !/^(0|false|no|off)$/i.test(process.env.HERMES_WEB_PUSH_ENABLED || process.env.WEB_PUSH_ENABLED || "1");
const WEB_PUSH_SUBJECT = process.env.WEB_PUSH_SUBJECT || process.env.HERMES_WEB_PUSH_SUBJECT || "mailto:hermes-mobile@example.invalid";
const TODO_WEB_PUSH_ENABLED = !/^(0|false|no|off)$/i.test(process.env.HERMES_WEB_TODO_PUSH_ENABLED || "1");
const TODO_WEB_PUSH_INTERVAL_MS = Number(process.env.HERMES_WEB_TODO_PUSH_INTERVAL_MS || "60000");
const TODO_WEB_PUSH_RECENT_CREATE_MINUTES = Number(process.env.HERMES_WEB_TODO_PUSH_RECENT_CREATE_MINUTES || "30");
const TODO_WEB_PUSH_RECEIPT_RETRY_MINUTES = Number(process.env.HERMES_WEB_TODO_PUSH_RECEIPT_RETRY_MINUTES || "3");
const TODO_WEB_PUSH_RECEIPT_RETRY_LIMIT = Number(process.env.HERMES_WEB_TODO_PUSH_RECEIPT_RETRY_LIMIT || "3");
const AUTOMATION_WEB_PUSH_ENABLED = !/^(0|false|no|off)$/i.test(process.env.HERMES_WEB_AUTOMATION_PUSH_ENABLED || "1");
const AUTOMATION_WEB_PUSH_INTERVAL_MS = Number(process.env.HERMES_WEB_AUTOMATION_PUSH_INTERVAL_MS || "60000");
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
const VALID_REASONING_EFFORTS = new Set(["low", "medium", "high", "xhigh"]);
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

const AUTOMATION_PUSH_DELIVERABLE_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".xlsx", ".pptx"]);
const AUTOMATION_PUSH_DELIVERABLE_LOOKBACK_MS = Number(process.env.HERMES_WEB_AUTOMATION_PUSH_DELIVERABLE_LOOKBACK_MS || String(30 * 60 * 1000));
const AUTOMATION_PUSH_DELIVERABLE_FUTURE_GRACE_MS = Number(process.env.HERMES_WEB_AUTOMATION_PUSH_DELIVERABLE_FUTURE_GRACE_MS || String(30 * 60 * 1000));
const AUTOMATION_PUSH_INITIAL_LOOKBACK_MS = Number(process.env.HERMES_WEB_AUTOMATION_PUSH_INITIAL_LOOKBACK_MS || String(24 * 60 * 60 * 1000));
const MAX_STATE_BACKUPS = Number(process.env.HERMES_WEB_MAX_STATE_BACKUPS || "80");
const STATE_BACKUP_MIN_INTERVAL_MS = Number(process.env.HERMES_WEB_STATE_BACKUP_MIN_INTERVAL_MS || String(10 * 60 * 1000));
const ENABLE_DIRECT_TODO_CREATE = /^(1|true|yes|on)$/i.test(process.env.HERMES_WEB_DIRECT_TODO_CREATE || "");

let clients = new Set();
let activeStreams = new Map();
let gatewayRunner = null;
let gatewayPoolProvider = null;
let lastStateBackupAt = 0;
let workspaceProjectProvider = null;
const dynamicProjectCache = new Map();
let state = null;
let sqliteServiceStore = null;
const runConcurrencyPolicy = createRunConcurrencyPolicy({
  maxGlobal: () => RUN_CONCURRENCY_MAX_GLOBAL,
  maxPerWorkspace: () => RUN_CONCURRENCY_MAX_PER_WORKSPACE,
});
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
let clientVersionCache = { mtimeMs: 0, version: "" };
let defaultReasoningCache = { cacheKey: "", value: null };
let webPushConfig = initializeWebPush();
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

const bridgeCommandProvider = createBridgeCommandProvider({
  wslDistro: () => WSL_DISTRO,
  windowsPathToWsl: (value) => windowsPathToWsl(value),
});
const TODO_BRIDGE_SCRIPT = bridgeCommandProvider.script("HERMES_WEB_TODO_BRIDGE_SCRIPT", DEFAULT_TODO_BRIDGE_SCRIPT);
const CRON_BRIDGE_SCRIPT = bridgeCommandProvider.script("HERMES_WEB_CRON_BRIDGE_SCRIPT", DEFAULT_CRON_BRIDGE_SCRIPT);
const DIRECTORY_BRIDGE_SCRIPT = bridgeCommandProvider.script("HERMES_WEB_DIRECTORY_BRIDGE_SCRIPT", DEFAULT_DIRECTORY_BRIDGE_SCRIPT);
const SKILL_BRIDGE_SCRIPT = bridgeCommandProvider.script("HERMES_WEB_SKILL_BRIDGE_SCRIPT", DEFAULT_SKILL_BRIDGE_SCRIPT);

const sharedDirectoryProvider = createSharedDirectoryProvider({
  storagePath: SHARED_DIRECTORIES_PATH,
  ensureDataDir,
  nowIso,
  readJsonFirst,
  usersPaths: WORKSPACE_USERS_PATHS,
  loadCatalog,
  findWorkspace,
  workspacePrincipal,
});

const accessPolicyProvider = createAccessPolicyProvider({
  uploadCacheRoot: () => path.join(DATA_DIR, "uploads"),
  sharedRoots: (principalId) => sharedDirectoryRoots(principalId),
});

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

state = loadState();

const workspaceBindingsProvider = createWorkspaceBindingsProvider({
  interfaceToolsetsJson: () => process.env.HERMES_WEB_WORKSPACE_INTERFACE_TOOLSETS_JSON || "",
  ownerExternalInterfaceBindings: () => ownerExternalInterfaceBindings(),
});

const displayPathProvider = createDisplayPathProvider({
  ownerDriveRootNames: () => OWNER_DRIVE_ROOT_NAMES,
  ownerRootFallbackLabel: () => OWNER_ROOT_FALLBACK_LABEL,
  normalizeLocalPath: (value) => normalizeLocalPath(value),
});

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function wslUncPathCandidates(root, ...parts) {
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
  if (isOwnerAuth(auth)) return info;
  return { defaultEffort: info.defaultEffort || "medium" };
}

function publicGatewayPoolStatusForAuth(auth, pool) {
  if (isOwnerAuth(auth)) return pool || null;
  if (!pool || typeof pool !== "object") return null;
  const workers = Array.isArray(pool.workers) ? pool.workers : [];
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
  return {
    workspaceId: id,
    label,
    defaultWorkspace,
    allowedRoots: allowedRoots.length ? allowedRoots : [defaultWorkspace],
    allowedToolsets: normalizeStringList(input.allowedToolsets || input.allowed_toolsets || previous.allowedToolsets || []),
  };
}

function normalizeLocalWorkspaceRecord(record) {
  const source = record && typeof record === "object" ? record : {};
  const id = workspaceIdSlug(source.id || source.workspaceId || source.workspace_id);
  if (!id || id === "owner") return null;
  const label = String(source.label || source.name || id).trim() || id;
  const defaultWorkspace = String(source.defaultWorkspace || source.default_workspace || source.root || "").trim();
  const allowedRoots = normalizeStringList(source.allowedRoots || source.allowed_roots || defaultWorkspace);
  return {
    id,
    label,
    accessMode: String(source.accessMode || source.access_mode || "restricted").trim() || "restricted",
    defaultWorkspace,
    allowedRoots,
    aliases: normalizeStringList(source.aliases),
    allowedToolsets: normalizeStringList(source.allowedToolsets || source.allowed_toolsets),
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
  ensureDataDir();
  if (useSqliteServiceStore()) return loadStateFromSqlite();
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
    console.error(`Hermes Web state parse failed; wrote fresh state after backup: ${err.message || String(err)}`);
    const fresh = defaultState();
    writeStateFile(fresh);
    return fresh;
  }
  backupStateFile("startup", { force: true });
  try {
    const normalized = normalizeState(parsed);
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
  const store = mobileSqliteStore();
  const counts = store.runtimeStateCounts();
  const hasRuntimeRows = Object.values(counts).some((value) => Number(value || 0) > 0);
  if (!hasRuntimeRows) {
    const existing = readStateFileIfValid();
    if (existing) {
      backupStateFile("sqlite-import-source", { force: true });
      const normalized = normalizeState(existing);
      store.replaceRuntimeState(normalized);
      writeStateFile(normalized);
      return normalized;
    }
    const fresh = defaultState();
    store.replaceRuntimeState(fresh);
    writeStateFile(fresh);
    return fresh;
  }
  const exported = store.exportRuntimeState();
  const normalized = normalizeState(exported);
  writeStateFile(normalized);
  return normalized;
}

function normalizeState(value) {
  const next = value && typeof value === "object" ? value : {};
  return {
    schemaVersion: 1,
    threads: Array.isArray(next.threads) ? next.threads.map(normalizeThread) : [],
    artifacts: Array.isArray(next.artifacts) ? next.artifacts : [],
    pushSubscriptions: Array.isArray(next.pushSubscriptions) ? next.pushSubscriptions.map(normalizePushSubscription).filter(Boolean) : [],
    pushReceipts: Array.isArray(next.pushReceipts) ? next.pushReceipts.map(normalizePushReceipt).filter(Boolean).slice(-200) : [],
    pushDeliveries: Array.isArray(next.pushDeliveries) ? next.pushDeliveries.map(normalizePushDelivery).filter(Boolean).slice(-200) : [],
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

function normalizePushSubscription(item) {
  if (!item || typeof item !== "object") return null;
  const subscription = item.subscription && typeof item.subscription === "object" ? item.subscription : item;
  const endpoint = String(subscription.endpoint || item.endpoint || "").trim();
  if (!endpoint) return null;
  const now = nowIso();
  const workspaceIds = normalizeStringList(item.workspaceIds || item.workspaceId || item.workspaces);
  const principalIds = normalizeStringList(item.principalIds || item.principalId || item.principals || (workspaceIds.length ? workspacePrincipal(workspaceIds[0]) : "owner"));
  const scopedPrincipalIds = scopedPushPrincipalIds(principalIds);
  const scopedWorkspaceIds = scopedPushWorkspaceIds(scopedPrincipalIds[0], workspaceIds);
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

function scopedPushWorkspaceIds(principalId, workspaceIds = []) {
  const principal = String(principalId || "owner").trim() || "owner";
  if (principal === "owner") return ["owner"];
  const workspaceId = workspaceIdForPrincipal(principal) || normalizeStringList(workspaceIds)[0] || "";
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

function normalizeChatGroup(value, ownerWorkspaceId = "owner") {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const ownerId = String(ownerWorkspaceId || "owner").trim() || "owner";
  const memberWorkspaceIds = normalizeStringList(
    source.memberWorkspaceIds || source.member_workspace_ids || source.members || source.workspaceIds,
  ).filter((workspaceId) => findWorkspace(workspaceId));
  if (source.enabled) memberWorkspaceIds.unshift(ownerId);
  const normalizedMembers = dedupe(memberWorkspaceIds);
  return {
    enabled: Boolean(source.enabled),
    memberWorkspaceIds: source.enabled ? normalizedMembers : [],
    createdAt: String(source.createdAt || source.created_at || ""),
    updatedAt: String(source.updatedAt || source.updated_at || ""),
  };
}

function normalizeThread(thread) {
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
    chatGroup: normalizeChatGroup(thread.chatGroup || thread.groupChat, thread.workspaceId || "owner"),
    messages: Array.isArray(thread.messages) ? thread.messages : [],
    events: Array.isArray(thread.events) ? thread.events.slice(-MAX_STORED_EVENTS_PER_THREAD) : [],
  };
  normalized.messages = normalizeThreadMessages(normalized, normalized.messages);
  return normalized;
}

function normalizeThreadMessages(thread, messages) {
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
    if (!next.senderLabel && next.senderWorkspaceId) next.senderLabel = workspaceLabel(next.senderWorkspaceId);
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
    console.error(`Hermes Web state backup failed: ${err.message || String(err)}`);
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
    throw new Error(`Refusing to overwrite Hermes Web state: message count would drop from ${previousMessages} to ${nextMessages}.${backupPath ? ` Backup: ${backupPath}` : ""}`);
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

function normalizeSingleWindowMode(value) {
  return String(value || "").trim().toLowerCase() === "chat" ? "chat" : "task";
}

function parseAgentReasoningEffortFromYaml(text) {
  let inAgent = false;
  let agentIndent = -1;
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const noComment = rawLine.replace(/\s+#.*$/, "");
    if (!noComment.trim()) continue;
    const agentMatch = noComment.match(/^(\s*)agent\s*:\s*$/);
    if (agentMatch) {
      inAgent = true;
      agentIndent = agentMatch[1].length;
      continue;
    }
    const dotted = noComment.match(/^\s*agent\.reasoning_effort\s*:\s*["']?([^"'\s#]+)["']?\s*$/i);
    if (dotted) return dotted[1];
    if (inAgent) {
      const indent = (noComment.match(/^(\s*)/) || ["", ""])[1].length;
      if (indent <= agentIndent) {
        inAgent = false;
      } else {
        const effort = noComment.match(/^\s*reasoning_effort\s*:\s*["']?([^"'\s#]+)["']?\s*$/i);
        if (effort) return effort[1];
      }
    }
  }
  return "";
}

function defaultReasoningInfo() {
  const envEffort = normalizeReasoningEffort(process.env.HERMES_WEB_DEFAULT_REASONING_EFFORT || "");
  if (envEffort) {
    return { defaultEffort: envEffort, source: "env:HERMES_WEB_DEFAULT_REASONING_EFFORT" };
  }
  const parts = HERMES_CONFIG_PATHS.map((item) => {
    try {
      const stat = fs.statSync(item);
      return `${item}:${stat.mtimeMs}`;
    } catch (_) {
      return `${item}:missing`;
    }
  }).join("|");
  if (defaultReasoningCache.value && defaultReasoningCache.cacheKey === parts) return defaultReasoningCache.value;
  for (const configPath of HERMES_CONFIG_PATHS) {
    try {
      if (!configPath || !fs.existsSync(configPath)) continue;
      const raw = parseAgentReasoningEffortFromYaml(fs.readFileSync(configPath, "utf8"));
      const effort = normalizeReasoningEffort(raw);
      if (effort) {
        defaultReasoningCache = {
          cacheKey: parts,
          value: { defaultEffort: effort, source: configPath },
        };
        return defaultReasoningCache.value;
      }
    } catch (_) {}
  }
  defaultReasoningCache = {
    cacheKey: parts,
    value: { defaultEffort: "medium", source: "gateway-default" },
  };
  return defaultReasoningCache.value;
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

function backendIsLocal(value, bridgeNames = []) {
  const backend = String(value || "").trim().toLowerCase();
  return !bridgeNames.includes(backend);
}

function useLocalTodoBackend() {
  return backendIsLocal(TODO_BACKEND, ["bridge", "plugin", "hermes", "hermes_todos"]);
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
  if (useLocalTodoBackend()) return runLocalTodoBridge(payload);
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
    : (process.env.HERMES_WEB_TODO_PLUGIN_NAME || "hermes_todos"),
});

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
    }).map(publicLocalAutomationJob);
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
  runLogRoot: process.env.HERMES_WEB_RUN_LOG_ROOT || `${WSL_HERMES_HOME}/run-logs`,
  extraDeliverableRoots: () => String(process.env.HERMES_WEB_AUTOMATION_DELIVERABLE_ROOTS || "")
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean),
  normalizeLocalPath,
  isPathAllowed,
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
    const labels = [item.label, item.id, String(item.id || "").replace(/^weixin_/, "")].filter(Boolean);
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
  if (!rawText || !/待办/.test(rawText)) return null;
  if (!/(新增|新建|创建|开启|添加|加|安排|提醒)/.test(rawText)) return null;
  const due = parseTodoDueFromText(rawText);
  if (!due?.dueTime) return null;
  const assignee = resolveTodoAssigneeFromText(rawText, workspaceId);
  const assigneeLabel = todoAssigneeLabel(workspaceId, assignee);
  let content = rawText;
  for (const token of [assigneeLabel, assignee, assignee.replace(/^weixin_/, "")].filter(Boolean)) {
    content = content.replace(new RegExp(`(?:给|为|帮)?\\s*${escapeRegExp(token)}`, "g"), " ");
  }
  content = content
    .replace(due.raw, " ")
    .replace(/(?:请|帮我|给我|我想|我要|需要)?\s*(?:新增|新建|创建|开启|添加|加|安排|提醒)\s*(?:一个|一条)?\s*待办(?:事项)?/g, " ")
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
  if (!rawText || !/(\u5f85\u529e|todo|to-do)/i.test(rawText)) return null;
  if (!/(\u65b0\u589e|\u65b0\u5efa|\u521b\u5efa|\u5f00\u542f|\u6dfb\u52a0|\u589e\u52a0|\u5b89\u6392|\u63d0\u9192|\u52a0)/.test(rawText)) return null;
  const due = parseWebTodoDueFromText(rawText);
  if (!due?.dueTime) return null;
  const assignee = resolveTodoAssigneeFromText(rawText, workspaceId);
  const assigneeLabel = todoAssigneeLabel(workspaceId, assignee);
  let content = rawText;
  for (const token of [assigneeLabel, assignee, assignee.replace(/^weixin_/, "")].filter(Boolean)) {
    content = content.replace(new RegExp(`(?:\\u7ed9|\\u4e3a|\\u5e2e)?\\s*${escapeRegExp(token)}`, "g"), " ");
  }
  content = content
    .replace(due.raw, " ")
    .replace(/(?:\u8bf7|\u5e2e\u6211|\u7ed9\u6211|\u6211\u60f3|\u6211\u8981|\u9700\u8981)?\s*(?:\u65b0\u589e|\u65b0\u5efa|\u521b\u5efa|\u5f00\u542f|\u6dfb\u52a0|\u589e\u52a0|\u5b89\u6392|\u63d0\u9192|\u52a0)\s*(?:\u4e00\u4e2a|\u4e00\u6761)?\s*(?:\u5f85\u529e(?:\u4e8b\u9879)?|todo|to-do)/ig, " ")
    .replace(/(?:\u8bf7|\u5e2e\u6211|\u7ed9\u6211|\u6211\u60f3|\u6211\u8981|\u9700\u8981)?\s*(?:\u65b0\u589e|\u65b0\u5efa|\u521b\u5efa|\u5f00\u542f|\u6dfb\u52a0|\u589e\u52a0|\u5b89\u6392|\u63d0\u9192|\u52a0)/ig, " ")
    .replace(/(?:\u4e00\u4e2a|\u4e00\u6761)?\s*(?:\u5f85\u529e(?:\u4e8b\u9879)?|todo|to-do)/ig, " ")
    .replace(/(?:\u5f85\u529e(?:\u4e8b\u9879)?|todo|to-do)/ig, " ")
    .replace(/\u7684/g, " ")
    .replace(/[\uff0c,.\u3002\uff1b;\uff1a:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!content) return null;
  return { assignee, assigneeLabel, dueTime: due.dueTime, content };
}

function publicTodo(row) {
  return {
    id: String(row.id || ""),
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
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    completedAt: String(row.completed_at || ""),
    cancelledAt: String(row.cancelled_at || ""),
  };
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
    "交付要求：任务完成时给出面向用户的最终结果；如果生成 PDF、Word 或其他正式交付文件，最终回复必须包含 `MEDIA:<本地文件绝对路径>`，便于 Hermes Web 在自动化列表中预览最后交付文件。",
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

function todoErrorResponse(res, result, fallbackStatus = 400) {
  sendJson(res, fallbackStatus, { error: result?.error || "Todo operation failed", result });
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
    console.error(`Hermes Web Push disabled: ${err.message || String(err)}`);
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
  const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
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
      if (!fs.existsSync(p)) continue;
      const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
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
  return sharedDirectoryProvider.upsert(record);
}

function sanitizePolicy(policy) {
  return accessPolicyProvider.sanitize(policy);
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
  return getWorkspaceProjectProvider().loadCatalog();
}

function buildAccessPolicy(route, user, project) {
  return accessPolicyProvider.build(route, user, project);
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

function ensureSingleWindowThread(workspaceId) {
  const workspace = findWorkspace(workspaceId);
  const project = findProject(workspaceId, SINGLE_WINDOW_PROJECT_ID);
  if (!workspace || !project) return null;
  let thread = state.threads.find((item) => item.workspaceId === workspaceId && item.singleWindow);
  if (thread) return thread;
  thread = normalizeThread({
    id: makeId("thread"),
    title: SINGLE_WINDOW_THREAD_TITLE,
    workspaceId,
    projectId: SINGLE_WINDOW_PROJECT_ID,
    subprojectId: "",
    singleWindow: true,
    hermesSessionId: `web_single_${makeId("session")}`,
    status: "idle",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    messages: [],
    events: [],
  });
  state.threads.unshift(thread);
  saveState();
  return thread;
}

function findGroupChatThreadForWorkspace(workspaceId) {
  const id = String(workspaceId || "").trim();
  if (!id) return null;
  return (state.threads || [])
    .filter((thread) => thread?.singleWindow && chatGroupMemberWorkspaceIds(thread).includes(id))
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0] || null;
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
  ].filter(Boolean)).map((item) => ({ path: item }));
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
      allowedRoots: Array.isArray(policy.allowed_roots) ? policy.allowed_roots : [],
      allowedToolsets: Array.isArray(policy.allowed_toolsets) ? policy.allowed_toolsets : [],
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

function taskDirectoryAttachmentForGroup(thread, taskGroupId) {
  if (!taskGroupId) return null;
  for (const message of thread.messages || []) {
    if (message.taskGroupId !== taskGroupId) continue;
    const route = normalizeTaskDirectoryAttachment(thread, message.directoryRoute || {});
    if (route) return route;
    const alias = Array.isArray(message.directoryAliases) ? message.directoryAliases.find(Boolean) : null;
    const aliasRoute = normalizeTaskDirectoryAttachment(thread, alias || {});
    if (aliasRoute) return aliasRoute;
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

function buildHermesInstructions(thread, policy, project, latestText = "", taskDirectory = null, options = {}) {
  const singleWindowMode = normalizeSingleWindowMode(options.singleWindowMode || options.single_window_mode || "");
  const lines = [
    "You are serving a Hermes Web App request.",
    "Use the selected account/workspace/project as the operational boundary.",
    "Do not access, write, summarize, or expose files outside the allowed roots unless the account is unrestricted.",
    "Prefer a concise final receipt in the Web UI. If you create a user-facing artifact, include a MEDIA:<local_path> line so Hermes Web can render it as a link card.",
    "Do not send Weixin messages unless the user explicitly asks for Weixin delivery.",
  ];
  if (taskDirectory?.path) {
    lines.push(`Attached task directory: ${taskDirectory.label || "Directory"} => ${taskDirectory.path}.`);
    lines.push("Base this task on the cleaned/normalized data in the attached directory first; use broader allowed roots only when the user request clearly requires it.");
    lines.push("Use Skill: productivity/directory-context-cleaning before analysis: clean new or changed files in the attached directory, update `.hermes-cleaned/summary.md` / indexes, then answer from summary-first cleaned context and open detailed cleaned Markdown only when needed.");
    lines.push("Keep the attached data directory separate from delivery folders. Do not write final PDF/Word deliverables into the attached data directory unless the user explicitly asks for that; use the user's Hermes sync delivery folder/category for MEDIA files. For wardrobe/outfit deliverables, prefer a `穿搭建议` delivery folder under the Hermes sync folder instead of writing final PDFs into `衣橱`.");
  }
  if (thread.singleWindow || project?.singleWindow) {
    if (singleWindowMode === "chat") {
      lines.push("This request comes from the Hermes Web single-window chat mode. Treat the latest user message as part of one continuous chat task.");
      lines.push("Use the supplied same-task conversation_history as normal chat context, while still respecting the selected workspace and access policy.");
      if (options.groupChatDeliveryRoot) {
        lines.push(`This is a group-chat AI request. Final user-facing deliverables for this group turn must be written under the group delivery directory: ${options.groupChatDeliveryRoot}.`);
        lines.push("Do not place group-chat PDF/Word/media deliverables only in the sender's private sync root. Include a MEDIA:<path> line that points to the group delivery file so every group member can preview it in Hermes Web.");
      }
      lines.push("Do not inherit, emit, or display prior directory bindings or `目录别名：当前绑定目录=...` from older chat turns. Only an explicit directory attachment on the latest message is a current directory binding.");
    } else {
      lines.push("This request comes from the Hermes Web single-window task stream. Treat the latest user message as a new stateless task, similar to the Weixin single-window task flow.");
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
  const routingInstructions = singleWindowMode === "chat" ? "" : semanticProjectRoutingInstructions(thread, latestText);
  if (routingInstructions) lines.push(routingInstructions);
  if (policy.response_style === "concise") lines.push("Keep final replies concise unless the user asks for a detailed report.");
  if (policy.show_task_id === false) lines.push("Do not surface internal task IDs in the final user-facing prose unless needed for troubleshooting.");
  return lines.join("\n");
}

function safeFileName(value) {
  const name = path.basename(String(value || "upload.bin")).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
  return name || "upload.bin";
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

function registerUploadArtifact(thread, message, filePath, originalName) {
  const stat = fs.statSync(filePath);
  const artifact = {
    id: makeId("artifact"),
    path: filePath,
    displayPath: filePath,
    name: safeFileName(originalName || filePath),
    mime: mimeFor(filePath),
    size: stat.size,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    workspaceId: thread.workspaceId,
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

function compactThread(thread) {
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
    messages: (thread.messages || []).map(compactMessage),
    events: (thread.events || []).slice(-MAX_STORED_EVENTS_PER_THREAD),
  };
}

function compactMessage(message) {
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
    artifacts: Array.isArray(message.artifacts) ? message.artifacts.map(compactArtifactForMessage).filter(Boolean) : [],
    directoryAliases: Array.isArray(message.directoryAliases) ? message.directoryAliases : [],
    directoryRoute: message.directoryRoute || null,
    reasoningEffort: message.reasoningEffort || "",
    gatewayName: message.gatewayName || "",
    gatewayProfile: message.gatewayProfile || "",
    gatewaySource: message.gatewaySource || "",
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
    return {
      url: appRouteUrl({ view: "single", workspaceId }),
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
  const senderLabel = userMessage.senderLabel || workspaceLabel(userMessage.senderWorkspaceId || "") || "Hermes Web";
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
    console.error(`Hermes Web Push send failed: ${err.message || String(err)}`);
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
  if (!webPushConfig || !principals.length) {
    return { ok: true, enabled: Boolean(webPushConfig), principals, events: [], deliveries: [] };
  }
  const pending = await todoProvider.pendingPushes({
    sourcePrincipal: "owner",
    principals,
    limit: options.limit || 100,
    recentCreateMinutes: TODO_WEB_PUSH_RECENT_CREATE_MINUTES,
    confirmedMarkKeys: confirmedTodoPushMarkKeys(),
    retryWithoutReceiptMinutes: TODO_WEB_PUSH_RECEIPT_RETRY_MINUTES,
    retryLimit: TODO_WEB_PUSH_RECEIPT_RETRY_LIMIT,
  });
  const events = Array.isArray(pending.events) ? pending.events : [];
  if (options.dryRun) {
    return {
      ok: true,
      enabled: true,
      principals,
      events: events.map((event) => Object.assign({}, event, { payload: todoPushPayload(event) })),
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
  return { ok: true, enabled: true, principals, events, deliveries };
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
  setTimeout(tick, 8000);
  setInterval(tick, interval);
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

function automationLatestDeliverableForPush(job, existingMark = null) {
  const lastRunMs = automationTimeMs(job?.lastRunAt);
  if (!lastRunMs) return null;
  const previousRunMs = automationTimeMs(
    typeof existingMark === "string" ? existingMark.split("|")[0] : existingMark?.lastRunAt,
  );
  const nowWithGrace = Date.now() + AUTOMATION_PUSH_DELIVERABLE_FUTURE_GRACE_MS;
  return (Array.isArray(job?.outputDocuments) ? job.outputDocuments : []).find((doc) => {
    const ext = automationDeliverableExtension(doc);
    if (!AUTOMATION_PUSH_DELIVERABLE_EXTENSIONS.has(ext)) return false;
    if (!doc?.url || Number(doc?.size || 0) <= 0) return false;
    const docTimeMs = automationDeliverableTimeMs(doc);
    if (!docTimeMs) return false;
    if (previousRunMs && docTimeMs <= previousRunMs) return false;
    if (docTimeMs < lastRunMs - AUTOMATION_PUSH_DELIVERABLE_LOOKBACK_MS) return false;
    if (docTimeMs > nowWithGrace) return false;
    return true;
  }) || null;
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
  setTimeout(tick, 12000);
  setInterval(tick, interval);
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
  try {
    status.gatewayPool = await gatewayPool().status();
  } catch (err) {
    status.gatewayPool = { enabled: false, error: err.message || String(err) };
  }
  return status;
}

function buildConversationHistory(thread, latestUserMessageId) {
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
    return compactConversationHistory(messages, CHAT_CONTEXT_MAX_MESSAGES, CHAT_CONTEXT_MAX_CHARS);
  }
  return messages.slice(-MAX_HISTORY_MESSAGES).map((msg) => ({
    role: msg.role,
    content: compactText(msg.content, MAX_API_TEXT_CHARS),
  }));
}

function stripDirectoryAliasLinesForChatHistory(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:[-*]\s*)?(?:目录别名|Directory aliases?)\s*[:：]/i.test(line))
    .join("\n")
    .trim();
}

function compactConversationHistory(messages, maxMessages, maxChars) {
  const recent = messages.slice(-Math.max(0, maxMessages));
  const result = [];
  let remainingChars = Math.max(0, maxChars);
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    if (remainingChars <= 0) break;
    const msg = recent[index];
    let content = stripDirectoryAliasLinesForChatHistory(msg.content);
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
  const policy = buildAccessPolicy(workspace?.policy || workspace || {}, {}, project);
  const groupChatDeliveryRoot = thread.singleWindow && userMessage.taskGroupId === SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID
    ? groupChatDeliveryRootForThread(thread)
    : "";
  const groupChatDeliveryRootForModel = groupChatDeliveryRoot ? windowsPathToWsl(groupChatDeliveryRoot) : "";
  if (groupChatDeliveryRoot) {
    fs.mkdirSync(groupChatDeliveryRoot, { recursive: true });
    policy.allowed_roots = dedupe([...(policy.allowed_roots || []), groupChatDeliveryRootForModel, groupChatDeliveryRoot].filter(Boolean));
    policy.delivery_roots = dedupe([...(policy.delivery_roots || []), groupChatDeliveryRootForModel, groupChatDeliveryRoot].filter(Boolean));
    policy.cache_roots = dedupe([...(policy.cache_roots || []), groupChatDeliveryRootForModel, groupChatDeliveryRoot].filter(Boolean));
  }
  const taskId = makePublicTaskId("web");
  const body = {
    input: userMessage.content,
    stream: true,
    store: true,
    conversation: thread.singleWindow ? `${thread.hermesSessionId}_${userMessage.taskGroupId || userMessage.id}` : thread.hermesSessionId,
    conversation_history: buildConversationHistory(thread, userMessage.id),
    instructions: [
      buildHermesInstructions(
        policyThread,
        policy,
        project,
        userMessage.content,
        taskDirectory,
        Object.assign({}, options, { groupChatDeliveryRoot: groupChatDeliveryRootForModel }),
      ),
      options.instructions || "",
    ].filter(Boolean).join("\n\n"),
    access_policy_context: policy,
  };
  if (options.model) body.model = options.model;
  if (options.reasoning_effort) body.reasoning_effort = options.reasoning_effort;
  if (options.reasoning && typeof options.reasoning === "object") body.reasoning = options.reasoning;
  if (options.access_policy_context && typeof options.access_policy_context === "object") {
    body.access_policy_context = sanitizePolicy(Object.assign({}, policy, options.access_policy_context));
  }

  const gatewayTarget = await chooseGatewayRunTarget(Object.assign({}, options.gatewayRouting || {}, {
    purpose: "user_run",
    workspaceId: actorWorkspaceId,
    taskGroupId: userMessage.taskGroupId || "",
    model: body.model || "",
    reasoning_effort: body.reasoning_effort || "",
  }));
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
    return "The latest user message is a queued Hermes Web continuous-chat turn. Treat it as the next message in the supplied same-task conversation_history.";
  }
  return "The latest user message is a queued Web follow-up to an existing task group. Treat it as a follow-up to the supplied same-task conversation_history, not as a new independent task.";
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
  } catch (err) {
    if (err.status === 404) {
      abortActiveStreamAsFailed(publicRunId, `Hermes Gateway no longer has run ${stream.realRunId}; the Web task was marked stale and the queue was released.`);
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
    failureReason: "",
  };
  if (RUN_LIVENESS_CHECK_INTERVAL_MS > 0) {
    streamState.livenessTimer = setInterval(() => {
      checkActiveStreamLiveness(runId).catch((err) => {
        console.error(`Hermes Web run liveness check failed: ${err.message || String(err)}`);
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
    const completedAt = nowIso();
    message.content = compactFullContent(output);
    message.status = "done";
    message.usage = event.usage || event.response?.usage || null;
    if (!message.firstFeedbackAt && output) message.firstFeedbackAt = completedAt;
    message.completedAt = completedAt;
    message.updatedAt = completedAt;
    message.artifacts = registerArtifactsFromText(thread, message, output);
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

function reconcileDetachedActiveRuns(reason = "Hermes Web restarted while this task was running; the result stream is no longer attached. Please rerun the task.") {
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
  const filePattern = /((?:[A-Za-z]:\\|\/mnt\/[A-Za-z]\/|\\\\wsl(?:\.localhost|\$)?\\)[^\r\n<>"']+\.(?:pdf|png|jpe?g|webp|gif|mp4|mov|mp3|m4a|wav|docx|xlsx|pptx|md|txt))/gi;
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
  return filesystemMountProvider.resolvedAllowedRoots();
}

function isPathAllowed(filePath) {
  return filesystemMountProvider.isPathAllowed(filePath);
}

function isPathAllowedForThread(thread, localPath, originalPath = "") {
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
  if (isPathAllowedForThread(thread, localPath, originalPath)) return true;
  const policy = policyForThread(thread);
  if (!(policy.access_mode === "unrestricted" || policy.principal_id === "owner")) return false;
  const home = os.homedir();
  const ownerRoots = [
    home ? path.join(home, "Documents") : "",
    home ? path.join(home, "SynologyDrive") : "",
    path.join(REPO_ROOT, "workspace"),
    path.join(REPO_ROOT, "outbox"),
    DATA_DIR,
    ...sharedDirectoryRoots(thread.workspaceId),
    ...loadCatalog().projects
      .filter((project) => project.workspaceId === "owner")
      .flatMap((project) => [project.root, ...(project.children || []).map((child) => child.root)]),
  ].filter(Boolean);
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

function isSharedDirectoryWriteAllowed(thread, localPath, displayPath = "") {
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
    const stat = fs.statSync(artifact.path);
    if (!stat.isFile()) return { status: 400, error: "Artifact path is not a file" };
    return {
      file: {
        localPath: artifact.path,
        displayPath: logicalUserPathFallback(artifact.displayPath || artifact.path, artifact.name || ""),
        name: artifact.name || path.basename(artifact.path),
        mime: artifact.mime || mimeFor(artifact.path),
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
  const artifact = state.artifacts.find((item) => String(item.id || "") === String(artifactId || ""));
  if (!artifact || !artifact.path || !fs.existsSync(artifact.path)) {
    return { status: 404, error: "Artifact not found" };
  }
  if (artifact.threadId) {
    const thread = state.threads.find((item) => item.id === String(artifact.threadId || ""));
    if (!thread) return { status: 404, error: "Artifact not found" };
    if (auth && !artifactAccessibleToAuth(auth, thread, artifact)) {
      return { status: 404, error: "Artifact not found" };
    }
    if (!isPathAllowedForThread(thread, artifact.path, artifact.displayPath || artifact.path)) {
      return { status: 404, error: "Artifact not found" };
    }
    return { artifact, thread };
  }
  if (auth && !isOwnerAuth(auth)) {
    return { status: 404, error: "Artifact not found" };
  }
  if (!isPathAllowed(artifact.path)) {
    return { status: 404, error: "Artifact not found" };
  }
  return { artifact, thread: null };
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

  const auth = authenticateRequest(req);
  if (!auth.ok) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }

  if (url.pathname === "/api/client-version" && req.method === "GET") {
    sendJson(res, 200, Object.assign(clientVersionInfo(requestClientVersion(req)), { reasoning: publicReasoningInfoForAuth(auth) }));
    return;
  }

  if (url.pathname === "/api/status" && req.method === "GET") {
    const status = await getHermesStatus();
    status.gatewayPool = publicGatewayPoolStatusForAuth(auth, status.gatewayPool);
    if (isOwnerAuth(auth)) status.catalog = loadCatalog().sources;
    status.display = {
      ownerLabel: OWNER_LABEL,
      ownerDriveRootNames: OWNER_DRIVE_ROOT_NAMES,
      ownerRootFallbackLabel: OWNER_ROOT_FALLBACK_LABEL,
    };
    status.push = publicPushStatus();
    status.reasoning = publicReasoningInfoForAuth(auth);
    status.concurrency = publicConcurrencyForAuth(auth);
    status.clientVersion = clientVersionInfo(req.headers["x-hermes-web-client-version"] || "");
    sendJson(res, 200, status);
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
    const catalog = loadCatalog();
    sendJson(res, 200, { data: publicWorkspacesForAuth(auth).map(publicWorkspace), sources: catalog.sources, auth: { role: auth.role, workspaceId: auth.workspaceId, isOwner: isOwnerAuth(auth) } });
    return;
  }

  if (url.pathname === "/api/workspaces/defaults" && req.method === "GET") {
    const ownerAuth = requireOwner(req, res);
    if (!ownerAuth) return;
    const defaults = localWorkspaceDefaults({
      username: url.searchParams.get("username") || "",
      workspaceId: url.searchParams.get("workspaceId") || url.searchParams.get("id") || "",
      label: url.searchParams.get("label") || "",
    });
    sendJson(res, 200, {
      ok: true,
      defaults,
    });
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
    const accessAuth = authenticateRequest(req);
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
    const accessAuth = authenticateRequest(req);
    const body = await readBody(req).catch(() => ({}));
    const requestedWorkspaceId = String(body.workspaceId || body.workspace_id || "").trim();
    const workspaceId = isOwnerAuth(accessAuth) ? requestedWorkspaceId : String(accessAuth.workspaceId || "").trim();
    if (!isOwnerAuth(accessAuth) && requestedWorkspaceId && requestedWorkspaceId !== workspaceId) {
      sendJson(res, 403, { error: "Workspace access is not allowed" });
      return;
    }
    try {
      const result = rotateWorkspaceAccessKey(workspaceId, {
        dryRun: boolParam(body.dryRun || body.dry_run),
        actor: accessAuth.principalId || accessAuth.workspaceId || "owner",
      });
      const requiresReLogin = !result.dryRun && !isOwnerAuth(accessAuth) && workspaceId === accessAuth.workspaceId;
      sendJson(res, result.dryRun ? 200 : 201, {
        ok: true,
        key: result.key,
        workspace: result.record,
        dryRun: result.dryRun,
        requiresReLogin,
      });
    } catch (err) {
      sendJson(res, err.status || 500, { error: err.message || String(err) });
    }
    return;
  }

  const workspaceKeyAdmin = url.pathname.match(/^\/api\/access-keys\/workspace\/([^/]+)$/);
  if (workspaceKeyAdmin && req.method === "DELETE") {
    const accessAuth = authenticateRequest(req);
    const requestedWorkspaceId = decodeURIComponent(workspaceKeyAdmin[1] || "").trim();
    const workspaceId = isOwnerAuth(accessAuth) ? requestedWorkspaceId : String(accessAuth.workspaceId || "").trim();
    if (!isOwnerAuth(accessAuth) && requestedWorkspaceId && requestedWorkspaceId !== workspaceId) {
      sendJson(res, 403, { error: "Workspace access is not allowed" });
      return;
    }
    const body = await readBody(req).catch(() => ({}));
    try {
      const result = revokeWorkspaceAccessKey(workspaceId, {
        dryRun: boolParam(body.dryRun || body.dry_run),
      });
      const requiresReLogin = !result.dryRun && !isOwnerAuth(accessAuth) && workspaceId === accessAuth.workspaceId;
      sendJson(res, 200, { ok: true, result, requiresReLogin });
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
      result = await runCronListBridgeCached({ includeDisabled, bypassCache });
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
      .filter((job) => cronJobMatchesSearch(job, search));
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
    if (!resolved.file) {
      sendJson(res, resolved.status || 404, { error: resolved.error || "Automation deliverable not found" });
      return;
    }
    sendResolvedFile(res, resolved.file, url.searchParams);
    return;
  }

  if (url.pathname === "/api/automations/deliverable/preview" && req.method === "GET") {
    const resolved = await resolveAuthorizedCronDeliverableFile(url.searchParams, auth);
    if (!resolved.file) {
      sendJson(res, resolved.status || 404, { error: resolved.error || "Automation deliverable not found" });
      return;
    }
    sendResolvedFilePreview(res, resolved.file);
    return;
  }

  if (url.pathname === "/api/automations/output" && req.method === "GET") {
    const resolved = await resolveAuthorizedCronOutputFile(url.searchParams, auth);
    if (!resolved.file) {
      sendJson(res, resolved.status || 404, { error: resolved.error || "Automation output not found" });
      return;
    }
    sendResolvedFile(res, resolved.file, url.searchParams);
    return;
  }

  if (url.pathname === "/api/automations/output/preview" && req.method === "GET") {
    const resolved = await resolveAuthorizedCronOutputFile(url.searchParams, auth);
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
    });
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
      suppressWeixinNotice: true,
      reminderLeadMinutes: body.reminderLeadMinutes ?? body.reminder_lead_minutes ?? null,
      recurrence: body.recurrence || "none",
      recurrenceDays: body.recurrenceDays || body.recurrence_days || "",
      recurrenceUntil: body.recurrenceUntil || body.recurrence_until || "",
    });
    if (!result.ok) {
      todoErrorResponse(res, result);
      return;
    }
    broadcast({ type: "todos.updated", workspaceId });
    notifyTodoCreated(result, workspacePrincipal(workspaceId));
    sendJson(res, 201, { todo: publicTodo(result), result });
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

  const todoAction = url.pathname.match(/^\/api\/todos\/([^/]+)\/(complete|cancel|postpone|delete)$/);
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
    });
    if (!result.ok) {
      todoErrorResponse(res, result);
      return;
    }
    broadcast({ type: "todos.updated", workspaceId, todoId: result.id, action });
    sendJson(res, 200, { ok: true, result });
    return;
  }

  if (url.pathname === "/api/single-window" && req.method === "POST") {
    const body = await readBody(req);
    const auth = authenticateRequest(req);
    const workspaceId = requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    const groupRequested = Boolean(body.groupChat || body.group_chat);
    const groupThread = groupRequested ? findGroupChatThreadForWorkspace(workspaceId) : null;
    const thread = groupThread && threadAccessibleToAuth(auth, groupThread)
      ? groupThread
      : ensureSingleWindowThread(workspaceId);
    if (!thread) {
      sendJson(res, 400, { error: "Unknown workspace or single-window project" });
      return;
    }
    broadcast({ type: "thread.updated", thread: threadSummary(thread) });
    sendJson(res, 200, { thread: compactThread(thread) });
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
    sendJson(res, 200, { thread: compactThread(thread) });
    return;
  }

  const upload = url.pathname.match(/^\/api\/threads\/([^/]+)\/uploads$/);
  if (upload && req.method === "POST") {
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
    const uploadDir = path.join(DATA_DIR, "uploads", thread.id);
    fs.mkdirSync(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, `${Date.now()}-${crypto.randomBytes(3).toString("hex")}-${filename}`);
    fs.writeFileSync(filePath, buffer);
    const artifact = registerUploadArtifact(thread, null, filePath, filename);
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
      ? (requestedTaskGroupId || (singleWindowMode === "chat" ? SINGLE_WINDOW_CHAT_TASK_GROUP_ID : makeId("task")))
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
      sendJson(res, 201, { ok: true, thread: compactThread(thread) });
      return;
    }
    const directTodoIntent = ENABLE_DIRECT_TODO_CREATE
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
          suppressWeixinNotice: true,
          reminderLeadMinutes: null,
          recurrence: "none",
          recurrenceDays: "",
          recurrenceUntil: "",
        });
      } catch (err) {
        result = { ok: false, error: err.message || String(err) };
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
      sendJson(res, result?.ok ? 201 : 400, { ok: Boolean(result?.ok), todo: result?.ok ? publicTodo(result) : null, result, thread: compactThread(thread) });
      return;
    }
    const followUpInstructions = thread.singleWindow && requestedTaskGroupId
      ? singleWindowMode === "chat"
        ? "The latest user message is a Hermes Web continuous-chat turn. Treat it as part of the supplied same-task conversation_history."
        : "The latest user message is an explicit Web quote/reply to an existing task group. Treat it as a follow-up to the supplied same-task conversation_history, not as a new independent task."
      : "";
    const runOptions = {
      reasoning_effort: reasoningEffort,
      singleWindowMode,
      actorWorkspaceId,
      instructions: [body.instructions || "", followUpInstructions].filter(Boolean).join("\n\n"),
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
      sendJson(res, 202, { run: { status: "queued", taskGroupId, engine: "responses" }, thread: compactThread(thread) });
      return;
    }
    try {
      const run = await startRunForThread(thread, userMessage, assistantMessage, runOptions);
      sendJson(res, 202, { run, thread: compactThread(thread) });
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
      sendJson(res, err.status || 502, { error: assistantMessage.error, thread: compactThread(thread) });
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
      if (!isSharedDirectoryWriteAllowed(thread, "", resolved.displayPath)) {
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
      if (!isSharedDirectoryWriteAllowed(thread, resolved.localPath, resolved.displayPath)) {
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
      if (!isSharedDirectoryWriteAllowed(thread, "", resolved.displayPath)) {
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
      if (!isSharedDirectoryWriteAllowed(thread, resolved.localPath, resolved.displayPath)) {
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
      if (!isSharedDirectoryWriteAllowed(thread, "", resolved.displayPath)) {
        sendJson(res, 403, { error: "Shared directory is read-only" });
        return;
      }
      if (isDirectory && isProtectedDirectoryRoot(thread, "", resolved.displayPath)) {
        sendJson(res, 400, { error: "Cannot delete a project/workspace root directory" });
        return;
      }
      const result = await runDirectoryBridge({ action: "delete", path: resolved.displayPath }).catch((err) => ({ ok: false, error: err.message || String(err) }));
      if (!result?.ok) {
        const code = /not empty/i.test(result?.error || "") ? 409 : 500;
        sendJson(res, code, { error: /not empty/i.test(result?.error || "") ? "Directory is not empty" : (result?.error || "Delete failed") });
        return;
      }
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
    if (!isSharedDirectoryWriteAllowed(thread, resolved.localPath, resolved.displayPath)) {
      sendJson(res, 403, { error: "Shared directory is read-only" });
      return;
    }
    if (stat.isDirectory() && isProtectedDirectoryRoot(thread, resolved.localPath, resolved.displayPath)) {
      sendJson(res, 400, { error: "Cannot delete a project/workspace root directory" });
      return;
    }
    try {
      if (stat.isDirectory()) {
        fs.rmdirSync(resolved.localPath);
      } else {
        fs.unlinkSync(resolved.localPath);
      }
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
    const disposition = /^(1|true|yes|on)$/i.test(String(url.searchParams.get("download") || ""))
      ? "attachment"
      : "inline";
    res.writeHead(200, {
      "Content-Type": artifact.mime || mimeFor(artifact.path),
      "Content-Length": fs.statSync(artifact.path).size,
      "Content-Disposition": contentDisposition(disposition, artifact.name || path.basename(artifact.path)),
      "Cache-Control": "private, max-age=60",
    });
    fs.createReadStream(artifact.path).pipe(res);
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
    console.error(`Hermes Web request failed ${req.method || ""} ${req.url || ""}: ${err.stack || err.message || String(err)}`);
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
  console.log(`Hermes Web listening on http://${HOST}:${PORT}`);
  console.log(`Hermes API base: ${effectiveHermesApiBase()}`);
  console.log(`State directory: ${DATA_DIR}`);
  console.log(DISABLE_AUTH ? "Authentication disabled by HERMES_WEB_DISABLE_AUTH." : `Authentication enabled; Owner key source is ${authProvider.ownerKeySource()}.`);
  if (!DISABLE_AUTH && authProvider.ownerKeySource() !== "env") {
    console.log("Current process login key is not printed; use the configured Owner key file or HERMES_WEB_KEY.");
  }
  startTodoWebPushDispatcher();
  startAutomationWebPushDispatcher();
});
