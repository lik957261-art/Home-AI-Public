"use strict";

const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { resolveCodexMobileProfileRuntime } = require("./codex-mobile-profile-runtime");
const {
  UI_VISUAL_LOCAL_VALIDATION_REQUIRED,
  buildUiVisualLocalValidation,
} = require("../adapters/ui-visual-local-validation-service");

const DEFAULT_DEV_ROOT = "/Users/example/path";
const DEFAULT_MAC_ROOT = "/Users/example/path";
const DEFAULT_BASE_URL = "http://127.0.0.1:8797";
const PINNED_NODE = "runtime/node-current/bin/node";
const DEFAULT_PRODUCTION_OWNER = "hermes-host:staff";
const HOME_AI_LISTENER_LABEL = "com.hermesmobile.listener";
const HOME_AI_BRIDGE_HOST_LABEL = "com.hermesmobile.bridge-host";
const HOME_AI_CRON_LABEL = "com.hermesmobile.cron";
const HOME_AI_WORKSPACE_SYSTEM_HELPER_LABEL = "com.hermesmobile.workspace-system-helper";
const HOME_AI_NAS_BACKUP_MOUNT_LABEL = "com.hermesmobile.nas-backup-mount";
const HOME_AI_PRODUCTION_DRIFT_AUDIT_LABEL = "com.hermesmobile.production-drift-audit";
const HOME_AI_VISUAL_DEBUG_LABEL = "com.hermesmobile.visual-debug";
const PRODUCTION_SERVICE_USER = "hermes-host";
const PRODUCTION_SERVICE_GROUP = "staff";
const HOME_AI_VISUAL_DEBUG_USER = process.env.HOMEAI_VISUAL_DEBUG_USER || "xuxin";
const HOME_AI_VISUAL_DEBUG_PORT = Number(process.env.HOMEAI_VISUAL_DEBUG_PORT || 19073) || 19073;
const HOME_AI_VISUAL_DEBUG_APPIUM_PORT = Number(process.env.HOMEAI_VISUAL_DEBUG_APPIUM_PORT || 4723) || 4723;
const HOME_AI_VISUAL_DEBUG_WDA_PORT = Number(process.env.HOMEAI_VISUAL_DEBUG_WDA_PORT || 8101) || 8101;
const HOME_AI_VISUAL_DEBUG_MJPEG_PORT = Number(process.env.HOMEAI_VISUAL_DEBUG_MJPEG_PORT || 9100) || 9100;
const HOME_AI_VISUAL_DEBUG_APP_URL = process.env.HOMEAI_VISUAL_DEBUG_APP_URL || "http://127.0.0.1:8797/?source=pwa";
const HOME_AI_VISUAL_ANALYSIS_PROFILE = process.env.HOMEAI_VISUAL_ANALYSIS_PROFILE || "hm-owner-openai-xhigh";
const HOME_AI_VISUAL_ANALYSIS_SOURCE_PROFILE = process.env.HOMEAI_VISUAL_ANALYSIS_SOURCE_PROFILE || "hm-owner-openai-1";
const HOME_AI_VISUAL_ANALYSIS_MODEL = process.env.HOMEAI_VISUAL_ANALYSIS_MODEL || "gpt-5.5";
const HOME_AI_VISUAL_ANALYSIS_PROVIDER = process.env.HOMEAI_VISUAL_ANALYSIS_PROVIDER || "openai-codex";
const HOME_AI_VISUAL_ANALYSIS_REASONING_EFFORT = process.env.HOMEAI_VISUAL_ANALYSIS_REASONING_EFFORT || "xhigh";
const HOME_AI_CRON_START_INTERVAL_SECONDS = 60;
const HOME_AI_CRON_SCRIPT_TIMEOUT_SECONDS = 1800;
const HOME_AI_NAS_BACKUP_MOUNT_START_INTERVAL_SECONDS = 300;
const HOME_AI_PRODUCTION_DRIFT_AUDIT_START_INTERVAL_SECONDS = 900;
const HOME_AI_BRIDGE_HOST_PORT = 8798;
const DEPLOY_BACKUP_RETENTION_DAYS = 3;
const HOME_AI_CHATGPT_PRO_WORKSPACE = process.env.HERMES_MOBILE_CHATGPT_PRO_WORKSPACE
  || process.env.HERMES_WEB_CHATGPT_PRO_WORKSPACE
  || `${DEFAULT_DEV_ROOT}/app`;
const HOME_AI_CHATGPT_PRO_CODEX_MOBILE_URL = process.env.HERMES_MOBILE_CHATGPT_PRO_CODEX_MOBILE_URL
  || process.env.HERMES_WEB_CHATGPT_PRO_CODEX_MOBILE_URL
  || "http://127.0.0.1:8787";
const HOME_AI_CHATGPT_PRO_CODEX_MOBILE_KEY_FILE = process.env.HERMES_MOBILE_CHATGPT_PRO_CODEX_MOBILE_KEY_FILE
  || process.env.HERMES_WEB_CHATGPT_PRO_CODEX_MOBILE_KEY_FILE
  || process.env.CODEX_MOBILE_KEY_FILE
  || path.join(os.homedir(), ".codex-mobile-web", "access_key");
const HOME_AI_CHATGPT_PRO_OUTPUT_DIR = process.env.HERMES_MOBILE_CHATGPT_PRO_OUTPUT_DIR
  || process.env.HERMES_WEB_CHATGPT_PRO_OUTPUT_DIR
  || path.join(os.homedir(), ".codex-mobile-web", "outputs", "chatgpt-pro");
const HOME_AI_DISASTER_BACKUP_TRANSPORT = process.env.HOMEAI_DISASTER_BACKUP_TRANSPORT || "auto";
const HOME_AI_DISASTER_BACKUP_SSH_TARGET = process.env.HOMEAI_DISASTER_BACKUP_SSH_TARGET || "xuxinxp@192.168.10.99";
const HOME_AI_DISASTER_BACKUP_SSH_DESTINATION = process.env.HOMEAI_DISASTER_BACKUP_SSH_DESTINATION || "/volume1/备份/HomeAI-Production-Backups/mac-production";
const HOME_AI_DISASTER_BACKUP_SSH_OPTIONS = process.env.HOMEAI_DISASTER_BACKUP_SSH_OPTIONS
  || "-p 2222 -i /Users/hermes-host/.ssh/homeai_nas_backup_ed25519";
const HOME_AI_VOICE_INPUT_ASR_URL = "http://127.0.0.1:8002/v1/audio/transcriptions";
const HOME_AI_VOICE_INPUT_STREAMING_URL = "http://127.0.0.1:8002/v1/audio/transcriptions/stream";
const HOME_AI_VOICE_INPUT_ASR_BACKEND = "funasr-local";
const HOME_AI_VOICE_INPUT_ASR_PROTOCOL = "openai-multipart";
const HOME_AI_VOICE_INPUT_COMPARE_BACKENDS = "whisper-large-v3-turbo,funasr-local,sensevoice-local";
const HOME_AI_VOICE_INPUT_LANGUAGE = "zh";
const HOME_AI_VOICE_INPUT_TASK = "transcribe";
const HOME_AI_VOICE_INPUT_INITIAL_PROMPT = "以下是普通话语音转写，请使用简体中文，并加入合适的中文标点符号。";
const HOME_AI_TTS_COSYVOICE_ROOT = path.join(DEFAULT_MAC_ROOT, "services", "cosyvoice");
const HOME_AI_TTS_COSYVOICE_DEFAULT_PYTHON = path.join(HOME_AI_TTS_COSYVOICE_ROOT, ".venv", "bin", "python");
const HOME_AI_TTS_COSYVOICE_DEFAULT_REPO_DIR = path.join(HOME_AI_TTS_COSYVOICE_ROOT, "CosyVoice");
const HOME_AI_TTS_COSYVOICE_DEFAULT_MODEL_DIR = path.join(HOME_AI_TTS_COSYVOICE_DEFAULT_REPO_DIR, "pretrained_models", "Fun-CosyVoice3-0.5B");
const HOME_AI_TTS_COSYVOICE_DEFAULT_CACHE_DIR = path.join(HOME_AI_TTS_COSYVOICE_ROOT, "cache");
const HOME_AI_TTS_COSYVOICE_DEFAULT_PROMPT_AUDIO = path.join(HOME_AI_TTS_COSYVOICE_DEFAULT_REPO_DIR, "asset", "zero_shot_prompt.wav");
const HOME_AI_TTS_COSYVOICE_DEFAULT_SCRIPT = path.join(DEFAULT_MAC_ROOT, "app", "scripts", "homeai-cosyvoice-synthesize.py");
const HOME_AI_TTS_COSYVOICE_INSTALLED = fs.existsSync(HOME_AI_TTS_COSYVOICE_DEFAULT_PYTHON)
  && fs.existsSync(HOME_AI_TTS_COSYVOICE_DEFAULT_MODEL_DIR)
  && fs.existsSync(HOME_AI_TTS_COSYVOICE_DEFAULT_PROMPT_AUDIO);
const HOME_AI_TTS_PROVIDER = process.env.HOMEAI_TTS_PROVIDER || (HOME_AI_TTS_COSYVOICE_INSTALLED ? "cosyvoice" : "macos-say");
const HOME_AI_TTS_COSYVOICE_PYTHON = process.env.HOMEAI_TTS_COSYVOICE_PYTHON || (HOME_AI_TTS_COSYVOICE_INSTALLED ? HOME_AI_TTS_COSYVOICE_DEFAULT_PYTHON : "");
const HOME_AI_TTS_COSYVOICE_SCRIPT = process.env.HOMEAI_TTS_COSYVOICE_SCRIPT || (HOME_AI_TTS_COSYVOICE_INSTALLED ? HOME_AI_TTS_COSYVOICE_DEFAULT_SCRIPT : "");
const HOME_AI_TTS_COSYVOICE_REPO_DIR = process.env.HOMEAI_TTS_COSYVOICE_REPO_DIR || (HOME_AI_TTS_COSYVOICE_INSTALLED ? HOME_AI_TTS_COSYVOICE_DEFAULT_REPO_DIR : "");
const HOME_AI_TTS_COSYVOICE_MODEL_DIR = process.env.HOMEAI_TTS_COSYVOICE_MODEL_DIR || (HOME_AI_TTS_COSYVOICE_INSTALLED ? HOME_AI_TTS_COSYVOICE_DEFAULT_MODEL_DIR : "");
const HOME_AI_TTS_COSYVOICE_CACHE_DIR = process.env.HOMEAI_TTS_COSYVOICE_CACHE_DIR || (HOME_AI_TTS_COSYVOICE_INSTALLED ? HOME_AI_TTS_COSYVOICE_DEFAULT_CACHE_DIR : "");
const HOME_AI_TTS_COSYVOICE_PROMPT_AUDIO = process.env.HOMEAI_TTS_COSYVOICE_PROMPT_AUDIO || (HOME_AI_TTS_COSYVOICE_INSTALLED ? HOME_AI_TTS_COSYVOICE_DEFAULT_PROMPT_AUDIO : "");
const HOME_AI_TTS_COSYVOICE_PROMPT_TEXT = process.env.HOMEAI_TTS_COSYVOICE_PROMPT_TEXT || (HOME_AI_TTS_COSYVOICE_INSTALLED ? "You are a helpful assistant.<|endofprompt|>希望你以后能够做的比我还好呦。" : "");
const HOME_AI_TTS_COSYVOICE_MODE = process.env.HOMEAI_TTS_COSYVOICE_MODE || (HOME_AI_TTS_COSYVOICE_INSTALLED ? "zero_shot" : "");
const HOME_AI_TTS_COSYVOICE_INSTRUCTION = process.env.HOMEAI_TTS_COSYVOICE_INSTRUCTION || "";
const HOME_AI_TTS_COSYVOICE_SPEAKER = process.env.HOMEAI_TTS_COSYVOICE_SPEAKER || "";
const HOME_AI_TTS_COSYVOICE_TIMEOUT_MS = process.env.HOMEAI_TTS_COSYVOICE_TIMEOUT_MS || (HOME_AI_TTS_COSYVOICE_INSTALLED ? "240000" : "");
const HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_ENABLED = process.env.HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_ENABLED
  || process.env.HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_ENABLED
  || "0";
const HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_COMMAND = process.env.HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_COMMAND
  || process.env.HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_COMMAND
  || "codex";
const HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_MODEL = process.env.HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_MODEL
  || process.env.HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_MODEL
  || "";
const HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_HOME = process.env.HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_HOME
  || process.env.HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_HOME
  || "";
const HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_TIMEOUT_MS = process.env.HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_TIMEOUT_MS
  || process.env.HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_TIMEOUT_MS
  || "600000";
const HOME_AI_PLUGIN_WORKSPACE_AUDIT_TARGETS = Object.freeze({
  "home-ai": ".",
  "codex-mobile": "codex-mobile-web",
  "codex-mobile-web": "codex-mobile-web",
  email: "email",
  finance: "finance",
  growth: "growth",
  health: "healthy",
  healthy: "healthy",
  moira: "moira",
  movie: "Movie",
  music: "music",
  note: "note",
  wardrobe: "wardrobe",
});
const HOME_AI_CRON_PROFILE_READ_ACL = `user:${PRODUCTION_SERVICE_USER} allow list,search,readattr,readextattr,readsecurity,read,execute,file_inherit,directory_inherit`;
const HOME_AI_GATEWAY_WORKER_RUNTIME_SETTING_ENVS = Object.freeze([
  Object.freeze({ key: "ownerMinWarm", mobileEnv: "HERMES_MOBILE_GATEWAY_OWNER_MIN_WARM", webEnv: "HERMES_WEB_GATEWAY_OWNER_MIN_WARM" }),
  Object.freeze({ key: "ownerMaxWorkers", mobileEnv: "HERMES_MOBILE_GATEWAY_OWNER_MAX_WORKERS", webEnv: "HERMES_WEB_GATEWAY_OWNER_MAX_WORKERS" }),
  Object.freeze({ key: "ownerDeepSeekMaxWorkers", mobileEnv: "HERMES_MOBILE_GATEWAY_OWNER_DEEPSEEK_MAX_WORKERS", webEnv: "HERMES_WEB_GATEWAY_OWNER_DEEPSEEK_MAX_WORKERS" }),
  Object.freeze({ key: "ownerMaintenanceMaxWorkers", mobileEnv: "HERMES_MOBILE_GATEWAY_OWNER_MAINTENANCE_MAX_WORKERS", webEnv: "HERMES_WEB_GATEWAY_OWNER_MAINTENANCE_MAX_WORKERS" }),
  Object.freeze({ key: "workspaceMinWarm", mobileEnv: "HERMES_MOBILE_GATEWAY_WORKSPACE_MIN_WARM", webEnv: "HERMES_WEB_GATEWAY_WORKSPACE_MIN_WARM" }),
  Object.freeze({ key: "workspaceMaxWorkers", mobileEnv: "HERMES_MOBILE_GATEWAY_WORKSPACE_MAX_WORKERS", webEnv: "HERMES_WEB_GATEWAY_WORKSPACE_MAX_WORKERS" }),
  Object.freeze({ key: "workspaceDeepSeekMaxWorkers", mobileEnv: "HERMES_MOBILE_GATEWAY_WORKSPACE_DEEPSEEK_MAX_WORKERS", webEnv: "HERMES_WEB_GATEWAY_WORKSPACE_DEEPSEEK_MAX_WORKERS" }),
  Object.freeze({ key: "globalMaxWorkers", mobileEnv: "HERMES_MOBILE_GATEWAY_ELASTIC_MAX_WORKERS", webEnv: "HERMES_WEB_GATEWAY_ELASTIC_MAX_WORKERS" }),
  Object.freeze({ key: "idleTtlMinutes", mobileEnv: "HERMES_MOBILE_GATEWAY_WORKER_IDLE_TTL_MINUTES", webEnv: "HERMES_WEB_GATEWAY_WORKER_IDLE_TTL_MINUTES" }),
]);
const HOME_AI_CRON_PROFILE_TRAVERSE_ACL = `user:${PRODUCTION_SERVICE_USER} allow search,readattr,readextattr,readsecurity`;
const HOME_AI_BACKUP_ARTIFACT_READ_ACL = `user:${PRODUCTION_SERVICE_USER} allow list,search,readattr,readextattr,readsecurity,read,execute,file_inherit,directory_inherit`;
const HOME_AI_BACKUP_GATEWAY_TELEMETRY_READ_ACL = HOME_AI_CRON_PROFILE_READ_ACL;
const HOME_AI_CRON_PLUGIN_BINDING_DIR_NAMES = Object.freeze([
  ".hermes-email",
  ".hermes-finance",
  ".hermes-health",
  ".hermes-note",
  ".hermes-wardrobe",
  ".hermes-growth",
  ".hermes-moira",
]);
const HOME_AI_SHARED_BUILTIN_SKILLS = Object.freeze(["home-ai-todo-intake"]);
const SAFE_PROFILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const PLUGIN_DEPLOY_ORDER = Object.freeze([
  "codex-mobile-web",
  "email",
  "finance",
  "growth",
  "healthy",
  "moira",
  "movie",
  "music",
  "note",
  "wardrobe",
]);

const PLUGIN_TARGETS = new Set(PLUGIN_DEPLOY_ORDER);
const DEPLOY_BACKUP_TARGET_SLUGS = Object.freeze([
  "home-ai",
  ...PLUGIN_DEPLOY_ORDER.map((plugin) => `plugin-${plugin}`),
].sort((a, b) => b.length - a.length));

const PLUGIN_DEFAULT_SOURCE_DIRS = Object.freeze({
  movie: "Movie",
});

function defaultSudoPasswordFileCandidates() {
  const home = os.homedir();
  return [
    process.env.HOMEAI_MAC_SUDO_PASSWORD_FILE || "",
    home ? path.join(home, ".homeai", "macos-sudo-password") : "",
    home ? path.join(home, ".homeai-qa", "sudo-password") : "",
  ].filter(Boolean);
}

function parseJsonArgument(value, label = "json") {
  const raw = String(value || "").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${label}_invalid_json:${err.message || String(err)}`);
  }
}

function readJsonFile(filePath, label = "json-file") {
  const target = String(filePath || "").trim();
  if (!target) return {};
  try {
    return parseJsonArgument(fs.readFileSync(target, "utf8"), label);
  } catch (err) {
    if (String(err?.message || "").includes("_invalid_json:")) throw err;
    throw new Error(`${label}_read_failed:${err.message || String(err)}`);
  }
}

const PLUGIN_ALIASES = Object.freeze({
  codex: "codex-mobile-web",
  "codex-mobile": "codex-mobile-web",
  health: "healthy",
});

const PLUGIN_RESTART_LABELS = Object.freeze({
  "codex-mobile-web": "com.hermesmobile.plugin.codex-mobile",
  email: "com.hermesmobile.plugin.email",
  finance: "com.hermesmobile.plugin.finance",
  growth: "com.hermesmobile.plugin.growth",
  healthy: "com.hermesmobile.plugin.health",
  moira: "com.hermesmobile.plugin.moira",
  movie: "com.hermesmobile.plugin.movie",
  music: "com.hermesmobile.plugin.music",
  note: "com.hermesmobile.plugin.note",
  wardrobe: "com.hermesmobile.plugin.wardrobe",
});

const PLUGIN_HEALTH_URLS = Object.freeze({
  "codex-mobile-web": "http://127.0.0.1:8787/api/v1/hermes/plugin/manifest",
  email: "http://127.0.0.1:5175/api/v1/hermes/plugin/manifest",
  finance: "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest",
  growth: "http://127.0.0.1:4881/api/v1/hermes/plugin/manifest",
  healthy: "http://127.0.0.1:4877/api/v1/hermes/plugin/manifest",
  moira: "http://127.0.0.1:4174/api/v1/hermes/plugin/manifest",
  movie: "http://127.0.0.1:4195/api/v1/hermes/plugin/manifest",
  music: "http://127.0.0.1:4891/api/v1/hermes/plugin/manifest",
  note: "http://127.0.0.1:4181/api/v1/hermes/plugin/manifest",
  wardrobe: "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest",
});

const CODEX_MOBILE_LISTENER_STARTUP_GATE = Object.freeze({
  type: "codex-mobile-listener-startup-gate",
  server: "http://127.0.0.1:8787",
  script: "scripts/codex-mobile-runtime-self-check-loop.js",
});
const CODEX_MOBILE_BEHAVIOR_GATE = Object.freeze({
  type: "codex-mobile-behavior-gate",
  server: CODEX_MOBILE_LISTENER_STARTUP_GATE.server,
  script: CODEX_MOBILE_LISTENER_STARTUP_GATE.script,
});

const PLUGIN_GATEWAY_MCP_MIRRORS = Object.freeze({
  wardrobe: Object.freeze([
    Object.freeze({
      kind: "directory",
      source: "scripts",
      target: "gateway-worker/wardrobe-mcp/scripts",
      mode: "755",
    }),
    Object.freeze({
      kind: "directory",
      source: "wardrobe_app",
      target: "gateway-worker/wardrobe-mcp/wardrobe_app",
      mode: "755",
    }),
  ]),
  music: Object.freeze([
    Object.freeze({
      kind: "directory",
      source: "src",
      target: "gateway-worker/music-mcp/src",
      mode: "755",
    }),
    Object.freeze({
      source: "package.json",
      target: "gateway-worker/music-mcp/package.json",
      mode: "755",
    }),
    Object.freeze({
      source: "package-lock.json",
      target: "gateway-worker/music-mcp/package-lock.json",
      mode: "644",
    }),
    Object.freeze({
      kind: "directory",
      source: "node_modules",
      target: "gateway-worker/music-mcp/node_modules",
      mode: "755",
    }),
  ]),
  movie: Object.freeze([
    Object.freeze({
      kind: "directory",
      source: "src",
      target: "gateway-worker/movie-mcp/src",
      mode: "755",
    }),
    Object.freeze({
      source: "package.json",
      target: "gateway-worker/movie-mcp/package.json",
      mode: "755",
    }),
  ]),
  moira: Object.freeze([
    Object.freeze({
      source: "scripts/moira-mcp-stdio.mjs",
      target: "gateway-worker/moira-mcp/scripts/moira-mcp-stdio.mjs",
      mode: "755",
    }),
    Object.freeze({
      kind: "directory",
      source: "scripts",
      target: "gateway-worker/moira-mcp/scripts",
      mode: "755",
    }),
    Object.freeze({
      kind: "directory",
      source: "server",
      target: "gateway-worker/moira-mcp/server",
      mode: "755",
    }),
    Object.freeze({
      kind: "directory",
      source: "docs",
      target: "gateway-worker/moira-mcp/docs",
      mode: "755",
    }),
    Object.freeze({
      kind: "directory",
      source: "tests",
      target: "gateway-worker/moira-mcp/tests",
      mode: "755",
    }),
    Object.freeze({
      kind: "directory",
      source: "base",
      target: "gateway-worker/moira-mcp/base",
      mode: "755",
    }),
    Object.freeze({
      kind: "directory",
      source: "tools",
      target: "gateway-worker/moira-mcp/tools",
      mode: "755",
    }),
    Object.freeze({
      kind: "directory",
      source: "web",
      target: "gateway-worker/moira-mcp/web",
      mode: "755",
    }),
    Object.freeze({
      source: "package.json",
      target: "gateway-worker/moira-mcp/package.json",
      mode: "755",
    }),
  ]),
});

const PLUGIN_PROOF_FILES = Object.freeze({
  "codex-mobile-web": Object.freeze([
    "public/index.html",
    "codex-app-server-mux.js",
    "scripts/create-thread-task-card.js",
  ]),
  email: Object.freeze(["dist/web/index.html"]),
  growth: Object.freeze(["public/index.html"]),
  movie: Object.freeze(["public/index.html"]),
  note: Object.freeze(["public/index.html"]),
});

const DEFAULT_RESTART_LABELS = {
  "home-ai": [HOME_AI_LISTENER_LABEL, HOME_AI_BRIDGE_HOST_LABEL, HOME_AI_CRON_LABEL, HOME_AI_WORKSPACE_SYSTEM_HELPER_LABEL],
  ...Object.fromEntries(PLUGIN_DEPLOY_ORDER.map((plugin) => [`plugin:${plugin}`, [PLUGIN_RESTART_LABELS[plugin]]])),
};

const PRODUCTION_OWNER_BY_TARGET = {
  "plugin:codex-mobile-web": "xuxin:staff",
};

const CODEX_MOBILE_LOG_REPAIR = Object.freeze({
  type: "codex-mobile-log-permissions",
  serviceUser: "xuxin",
  serviceGroup: "staff",
  launchdLabel: "com.hermesmobile.plugin.codex-mobile",
  launchdPlistPath: "/Library/LaunchDaemons/com.hermesmobile.plugin.codex-mobile.plist",
  runtimeLogRoot: "/Users/example/path",
  runtimeRoot: "/Users/example/path",
  profileFile: "/Users/example/path",
  muxMode: "persistent-owned-shared",
  requireSharedAppServer: "1",
  persistOwnedMux: "1",
  disableOwnedMux: "0",
  logFiles: Object.freeze([
    "codex-mobile-web.out.log",
    "codex-mobile-web.err.log",
  ]),
  directoryMode: "700",
  fileMode: "600",
});

const CODEX_MOBILE_SELECTED_MUX_REFRESH = Object.freeze({
  type: "codex-mobile-selected-mux-refresh",
  serviceUser: "xuxin",
  runtimeRoot: "/Users/example/path",
  profileFile: "/Users/example/path",
  triggerFiles: Object.freeze([
    "codex-app-server-mux.js",
    "restart-codex-mobile-host-macos.sh",
    "adapters/shared-chain-restart-service.js",
  ]),
});
const CODEX_MOBILE_SELECTED_MUX_REPAIR_STATE_RELATIVE_PATH = "data/deploy-state/codex-mobile-selected-mux-refresh.json";

const MUSIC_RUNTIME_COVER_PERMISSION_REPAIR = Object.freeze({
  type: "music-runtime-cover-permissions",
  plugin: "music",
  ownerUser: "hm-owner",
  runtimeRoot: "runtime",
  directories: Object.freeze([
    "cover-cache",
    "cover-plan-cache",
    "cover-backups",
  ]),
  sqliteFiles: Object.freeze([
    "music.sqlite",
    "music.sqlite-wal",
    "music.sqlite-shm",
  ]),
});

const FINANCE_LAUNCHD_WORKSPACE_KEY_HASH_REPAIR = Object.freeze({
  type: "finance-launchd-workspace-key-hashes",
  plugin: "finance",
  launchdLabel: "com.hermesmobile.plugin.finance",
  installerRelativePath: "scripts/install-finance-launchd-service.js",
});

const WEB_PUSH_VAPID_PERMISSION_REPAIR = Object.freeze({
  type: "web-push-vapid-permissions",
  relativePath: "data/web-push-vapid.json",
  owner: `${PRODUCTION_SERVICE_USER}:${PRODUCTION_SERVICE_GROUP}`,
  fileMode: "600",
});

const WARDROBE_THUMBNAIL_ARTIFACT_ACL_REPAIR = Object.freeze({
  type: "wardrobe-thumbnail-artifact-acl",
  targetWorkspace: "owner",
  macUser: "hm-owner",
});

const GATEWAY_LAUNCHCTL_SUDOERS_REPAIR = Object.freeze({
  type: "gateway-launchctl-sudoers",
  sudoersPath: "/etc/sudoers.d/homeai-gateway-launchctl",
  ownerUser: PRODUCTION_SERVICE_USER,
});

const GATEWAY_MACOS_LAUNCHER_REPAIR = Object.freeze({
  type: "gateway-macos-launcher",
  sourceRelativePath: "app/scripts/macos-launch-gateway-profile.sh",
  targetRelativePath: "gateway-worker/macos-launch-gateway-profile.sh",
  owner: "root:hermes-workers",
  fileMode: "755",
});

const OWNER_3A_QUALITY_EVIDENCE_SEED = Object.freeze({
  type: "owner-3a-quality-evidence-seed",
  relativePath: "data/hermes-home/self-improving-loop/owner-3a-quality-evidence.json",
});

const RSYNC_EXCLUDES = [
  ".git",
  ".git/",
  ".codegraph/",
  ".codex/",
  ".agent-context/",
  "AGENTS.md",
  ".deploy-backups/",
  "node_modules/",
  ".venv/",
  "logs/",
  "mounts/",
  "tmp/",
  "temp/",
  ".DS_Store",
  ".env",
  ".env.*",
  "*.log",
];

const BACKUP_RSYNC_EXCLUDES = [
  ".git",
  ".git/",
  ".codegraph/",
  ".codex/",
  ".agent-context/",
  "gateway-runtime-overrides/__pycache__/",
  "workspace/public-export/",
];

const PLUGIN_RSYNC_EXCLUDES = [
  "/data/",
  "/runtime/",
];

const SURFACES = new Set(["full", "static"]);

const HOME_AI_STATIC_SYNC_ROOTS = [
  "public/",
];

const HOME_AI_PROOF_FILES = [
  "adapters/ai-ops-diagnostic-intake-service.js",
  "adapters/automation-cron-profile-service.js",
  "adapters/owner-3a-quality-evidence-service.js",
  "adapters/owner-3a-quality-program-service.js",
  "adapters/owner-system-console-service.js",
  "adapters/plugin-action-metadata-closure-service.js",
  "adapters/web-push-send-service.js",
  "cron_bridge.py",
  "mobile-server-runtime.js",
  "package.json",
  "public/index.html",
  "public/service-worker.js",
  "public/directory-viewer.html",
  "server-routes/automation-api-routes.js",
  "server-routes/mobile-api-composition.js",
  "server-routes/mobile-api-platform-composition.js",
  "server-routes/owner-system-console-api-routes.js",
  "scripts/deploy-macos-production.js",
  "scripts/homeai-install-upgrade-canary.js",
  "scripts/homeai-self-improving-loop.js",
  "scripts/install-macos-production.sh",
  "scripts/plugin-action-metadata-closure-smoke.js",
  "scripts/macos-automation-cron-audit.js",
  "scripts/plugin-workspace-audit-runner.js",
  "scripts/production-status-smoke.js",
  "scripts/macos-gateway-start-script-bridge-env-repair.js",
  "scripts/macos-production-profile-audit.js",
  "scripts/macos-production-drift-reconcile.js",
  "scripts/homeai-production-drift-audit-watchdog.sh",
  "scripts/homeai-self-improving-loop-cron.sh",
  "scripts/plugin-daily-progress-rollup.js",
  "scripts/plugin-daily-progress-rollup-cron.sh",
  "scripts/gateway-mcp-runtime-call-smoke.js",
  "scripts/mcp-tool-upgrade-closure-smoke.js",
];

const HOME_AI_STATIC_PROOF_FILES = [
  "public/index.html",
  "public/service-worker.js",
  "public/directory-viewer.html",
];

const CODEX_AUTH_AUDIT_ISSUE_PREFIX = "codex_auth_";

function parseArgs(argv) {
  const out = {
    target: "",
    plugin: "",
    source: "",
    macRoot: process.env.HERMES_MOBILE_MAC_ROOT || DEFAULT_MAC_ROOT,
    devRoot: process.env.HERMES_MOBILE_DEV_ROOT || DEFAULT_DEV_ROOT,
    passwordFile: process.env.HOMEAI_MAC_SUDO_PASSWORD_FILE || "",
    baseUrl: process.env.HERMES_MOBILE_PRODUCTION_BASE || DEFAULT_BASE_URL,
    execute: false,
    json: false,
    healthUrl: "",
    restartMode: "auto",
    restartLabels: [],
    surface: "full",
    allowDirty: false,
    reason: "manual",
    timestamp: "",
    validationRetries: 12,
    validationDelayMs: 2000,
    syncOnly: false,
    deployBackupRetentionDays: DEPLOY_BACKUP_RETENTION_DAYS,
    codexMobileSubmitThreadId: process.env.HOMEAI_CODEX_MOBILE_DEPLOY_SUBMIT_THREAD_ID || "",
    changedFiles: [],
    uiImpact: false,
    uiVisualEvidence: {},
    uiVisualEvidencePath: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target") out.target = argv[++index] || "";
    else if (arg === "--plugin") out.plugin = argv[++index] || "";
    else if (arg === "--source") out.source = argv[++index] || "";
    else if (arg === "--mac-root") out.macRoot = argv[++index] || out.macRoot;
    else if (arg === "--dev-root") out.devRoot = argv[++index] || out.devRoot;
    else if (arg === "--password-file") out.passwordFile = argv[++index] || "";
    else if (arg === "--base") out.baseUrl = argv[++index] || out.baseUrl;
    else if (arg === "--health-url") out.healthUrl = argv[++index] || "";
    else if (arg === "--restart") out.restartMode = argv[++index] || "auto";
    else if (arg === "--restart-label") out.restartLabels.push(argv[++index] || "");
    else if (arg === "--surface" || arg === "--changed-surface") out.surface = argv[++index] || out.surface;
    else if (arg === "--allow-dirty") out.allowDirty = true;
    else if (arg === "--reason") out.reason = argv[++index] || out.reason;
    else if (arg === "--timestamp") out.timestamp = argv[++index] || "";
    else if (arg === "--validation-retries") out.validationRetries = Number(argv[++index] || out.validationRetries);
    else if (arg === "--validation-delay-ms") out.validationDelayMs = Number(argv[++index] || out.validationDelayMs);
    else if (arg === "--deploy-backup-retention-days") out.deployBackupRetentionDays = Number(argv[++index] || out.deployBackupRetentionDays);
    else if (arg === "--codex-mobile-submit-thread-id") out.codexMobileSubmitThreadId = argv[++index] || "";
    else if (arg === "--changed-file" || arg === "--changedFile") out.changedFiles.push(argv[++index] || "");
    else if (arg === "--ui-impact" || arg === "--visible-ui-impact") out.uiImpact = true;
    else if (arg === "--ui-visual-evidence" || arg === "--ui-validation-evidence") out.uiVisualEvidencePath = argv[++index] || "";
    else if (arg === "--ui-visual-evidence-json" || arg === "--ui-validation-evidence-json") out.uiVisualEvidence = parseJsonArgument(argv[++index] || "{}", arg);
    else if (arg === "--sync-only") out.syncOnly = true;
    else if (arg === "--execute") out.execute = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--help") {
      console.log([
        "Usage:",
        "  node scripts/deploy-macos-production.js --target home-ai [--execute]",
        "  node scripts/deploy-macos-production.js --plugin <plugin-id|all> [--execute]",
        "",
        "Default mode is plan-only. Add --execute to write production.",
        "",
        "Options:",
        "  --source <path>             Override development source path",
        "  --mac-root <path>           Production root, default /Users/example/path",
        "  --dev-root <path>           Development root, default /Users/example/path",
        "  --password-file <path>      Private sudo password file; contents are never printed",
        "  --restart auto|none         Auto uses known labels for Home AI and known plugins",
        "  --restart-label <label>     Additional system launchd label to kickstart",
        "  --surface full|static       Static Home AI sync copies only public/",
        "  --allow-dirty               Permit deploy-relevant dirty source files",
        "  --health-url <url>          Optional plugin health/version URL",
        "  --deploy-backup-retention-days <days>  Prune deploy backups older than this many days; default 3",
        "  --base <url>                Home AI production base for status smoke",
        "  --reason <slug>             Backup name slug",
        "  --validation-retries <n>    Retries for listener/health validation, default 12",
        "  --validation-delay-ms <n>   Delay between validation retries, default 2000",
        "  --codex-mobile-submit-thread-id <id>  Controlled Codex thread id for deploy submit self-check",
        "  --changed-file <path>       Changed file for pre-deploy UI visual/local validation; repeatable",
        "  --ui-impact                 Require UI visual/local validation for visible backend/projection changes",
        "  --ui-visual-evidence <file> Local test + visual evidence JSON for UI-affecting deploys",
        "  --sync-only                 Plugin first-install source sync only; no restart or runtime validation",
        "  --json                      Print bounded JSON",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (out.plugin && out.target) throw new Error("Use either --target or --plugin, not both.");
  if (out.plugin) {
    out.plugin = normalizePluginTarget(out.plugin);
    out.target = out.plugin === "all" ? "plugins:all" : `plugin:${out.plugin}`;
  }
  if (!out.target) out.target = "home-ai";
  if (!SURFACES.has(out.surface)) throw new Error(`unsupported_deploy_surface:${out.surface}`);
  if (out.surface === "static" && out.target !== "home-ai") throw new Error("static_surface_requires_home_ai_target");
  if (out.target === "plugins:all" && out.source) throw new Error("all_plugins_source_override_unsupported");
  if (out.target === "plugins:all" && out.healthUrl) throw new Error("all_plugins_health_url_override_unsupported");
  if (out.target === "plugins:all" && out.restartLabels.length) throw new Error("all_plugins_restart_label_override_unsupported");
  if (out.target !== "plugin:codex-mobile-web" && out.target !== "plugins:all" && out.codexMobileSubmitThreadId) {
    throw new Error("codex_mobile_submit_thread_requires_codex_mobile_target");
  }
  if (out.syncOnly && !(out.target.startsWith("plugin:") || out.target === "plugins:all")) throw new Error("sync_only_requires_plugin_target");
  if (out.syncOnly) {
    out.restartMode = "none";
    out.healthUrl = "";
  }
  if (out.uiVisualEvidencePath) out.uiVisualEvidence = readJsonFile(out.uiVisualEvidencePath, "--ui-visual-evidence");
  out.restartLabels = out.restartLabels.filter(Boolean);
  out.changedFiles = out.changedFiles.filter(Boolean);
  if (!Number.isFinite(out.validationRetries) || out.validationRetries < 1) out.validationRetries = 1;
  if (!Number.isFinite(out.validationDelayMs) || out.validationDelayMs < 0) out.validationDelayMs = 0;
  return out;
}

function normalizePluginTarget(value = "") {
  const id = String(value || "").trim().toLowerCase();
  if (id === "all") return id;
  return PLUGIN_ALIASES[id] || id;
}

function normalizePath(value) {
  return path.resolve(String(value || ""));
}

function posixJoin(...parts) {
  return path.posix.join(...parts.map((part) => String(part || "").replace(/\/+$/, "")));
}

function assertInside(child, parent, label) {
  const resolvedChild = normalizePath(child);
  const resolvedParent = normalizePath(parent);
  const rel = path.relative(resolvedParent, resolvedChild);
  if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) return;
  throw new Error(`${label}_outside_allowed_root`);
}

function sanitizeSlug(value) {
  const slug = String(value || "deploy").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "deploy";
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function timestampToIso(value) {
  const match = String(value || "").match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!match) return "";
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
}

function sourceRef(source) {
  const git = spawnSync("git", ["rev-parse", "--short=12", "HEAD"], {
    cwd: source,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
    cwd: source,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return {
    commit: git.status === 0 ? git.stdout.trim() : "",
    dirty: status.status === 0 ? Boolean(status.stdout.trim()) : null,
    dirtyFiles: status.status === 0
      ? status.stdout.trim().split(/\r?\n/).filter(Boolean).slice(0, 80)
      : [],
  };
}

function gitStatusEntries(source) {
  const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
    cwd: source,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (status.status !== 0) return [];
  return status.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const rawPath = line.replace(/^[ MARCUD?!]{1,2}\s+/, "").trim();
    const relPath = rawPath.includes(" -> ") ? rawPath.split(" -> ").pop().trim() : rawPath;
    return { status: line.slice(0, 2), path: relPath };
  });
}

function normalizeRsyncPathFragment(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
}

function rsyncExcludePatternApplies(pattern, relPath) {
  if (!pattern || !relPath) return false;
  const rawPattern = String(pattern || "").replace(/\\/g, "/");
  const anchored = rawPattern.startsWith("/");
  const cleanPattern = normalizeRsyncPathFragment(rawPattern);
  const cleanPath = normalizeRsyncPathFragment(relPath);
  if (!cleanPattern || !cleanPath) return false;

  if (cleanPattern.endsWith("/")) {
    const directoryPattern = cleanPattern.slice(0, -1);
    if (!directoryPattern) return false;
    if (anchored) return cleanPath === directoryPattern || cleanPath.startsWith(`${directoryPattern}/`);
    return cleanPath === directoryPattern
      || cleanPath.startsWith(`${directoryPattern}/`)
      || cleanPath.includes(`/${directoryPattern}/`)
      || cleanPath.endsWith(`/${directoryPattern}`);
  }
  if (cleanPattern.startsWith("*.")) return cleanPath.endsWith(cleanPattern.slice(1));
  if (cleanPattern.endsWith("*")) {
    const prefix = cleanPattern.slice(0, -1);
    if (anchored || prefix.includes("/")) return cleanPath.startsWith(prefix);
    return cleanPath.startsWith(prefix) || cleanPath.includes(`/${prefix}`);
  }
  if (anchored || cleanPattern.includes("/")) return cleanPath === cleanPattern || cleanPath.startsWith(`${cleanPattern}/`);
  return cleanPath === cleanPattern
    || cleanPath.startsWith(`${cleanPattern}/`)
    || cleanPath.includes(`/${cleanPattern}/`)
    || cleanPath.endsWith(`/${cleanPattern}`);
}

function isRsyncExcluded(relPath, excludes = RSYNC_EXCLUDES) {
  return excludes.some((pattern) => rsyncExcludePatternApplies(pattern, relPath));
}

function isDeploySurfaceIncluded(relPath, options) {
  if (options.surface === "static") return HOME_AI_STATIC_SYNC_ROOTS.some((root) => relPath.startsWith(root));
  return !isRsyncExcluded(relPath, rsyncExcludesForTarget(options));
}

function deployDirtyFiles(source, options) {
  return gitStatusEntries(source)
    .map((entry) => entry.path)
    .filter((relPath) => isDeploySurfaceIncluded(relPath, options))
    .slice(0, 120);
}

function lastCommitChangedFiles(source, options) {
  const show = spawnSync("git", ["show", "--name-only", "--format=", "HEAD"], {
    cwd: source,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (show.status !== 0) return [];
  return show.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((relPath) => isDeploySurfaceIncluded(relPath, options))
    .slice(0, 160);
}

function changedFilesForUiVisualValidation(source, options, relevantDirtyFiles = []) {
  if (Array.isArray(options.changedFiles) && options.changedFiles.length) {
    return options.changedFiles
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .filter((relPath) => isDeploySurfaceIncluded(relPath, options))
      .slice(0, 160);
  }
  if (relevantDirtyFiles.length) return relevantDirtyFiles.slice(0, 160);
  return lastCommitChangedFiles(source, options);
}

function ignoredDirtyFiles(source, options) {
  return gitStatusEntries(source)
    .map((entry) => entry.path)
    .filter((relPath) => !isDeploySurfaceIncluded(relPath, options))
    .slice(0, 120);
}

function defaultSource(options) {
  if (options.target === "home-ai") return posixJoin(options.devRoot, "app");
  const plugin = options.target.replace(/^plugin:/, "");
  const sourceDir = PLUGIN_DEFAULT_SOURCE_DIRS[plugin] || posixJoin("plugins", plugin);
  return posixJoin(options.devRoot, sourceDir);
}

function productionTarget(options) {
  if (options.target === "home-ai") return posixJoin(options.macRoot, "app");
  const plugin = options.target.replace(/^plugin:/, "");
  if (!PLUGIN_TARGETS.has(plugin)) throw new Error(`unsupported_plugin_target:${plugin}`);
  return posixJoin(options.macRoot, "plugins", plugin);
}

function productionOwnerForTarget(target) {
  return PRODUCTION_OWNER_BY_TARGET[target] || DEFAULT_PRODUCTION_OWNER;
}

function rsyncExcludesForTarget(options) {
  const excludes = [...RSYNC_EXCLUDES];
  if (String(options.target || "").startsWith("plugin:")) excludes.push(...PLUGIN_RSYNC_EXCLUDES);
  return [...new Set(excludes)];
}

function postSyncRepairsForTarget(options) {
  if (options.target === "home-ai") return [CODEX_MOBILE_LOG_REPAIR, WEB_PUSH_VAPID_PERMISSION_REPAIR, WARDROBE_THUMBNAIL_ARTIFACT_ACL_REPAIR, GATEWAY_LAUNCHCTL_SUDOERS_REPAIR, GATEWAY_MACOS_LAUNCHER_REPAIR];
  if (options.target === "plugin:codex-mobile-web") return [CODEX_MOBILE_LOG_REPAIR, CODEX_MOBILE_SELECTED_MUX_REFRESH];
  if (options.target === "plugin:finance") return [FINANCE_LAUNCHD_WORKSPACE_KEY_HASH_REPAIR];
  if (options.target === "plugin:music") return [MUSIC_RUNTIME_COVER_PERMISSION_REPAIR];
  return [];
}

function postSyncMirrorsForTarget(options) {
  const plugin = String(options.target || "").replace(/^plugin:/, "");
  const mirrors = PLUGIN_GATEWAY_MCP_MIRRORS[plugin] || [];
  return mirrors.map((item) => Object.assign({}, item, {
    type: "gateway-mcp-worker-asset",
    plugin,
  }));
}

function readTextIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (_err) {
    return "";
  }
}

function extractClientVersionFromSource(source) {
  const html = readTextIfExists(path.join(source, "public", "index.html"));
  return html.match(/data-client-version="([^"]+)"/)?.[1] || "";
}

function proofFilesForPlan(source, options) {
  if (options.syncOnly) return [];
  if (String(options.target || "").startsWith("plugin:")) {
    const plugin = String(options.target || "").replace(/^plugin:/, "");
    const files = PLUGIN_PROOF_FILES[plugin] || [];
    for (const relPath of files) {
      if (!fs.existsSync(path.join(source, relPath))) throw new Error(`plugin_proof_file_missing:${plugin}:${relPath}`);
    }
    return [...files];
  }
  if (options.target !== "home-ai") return [];
  const candidates = options.surface === "static" ? HOME_AI_STATIC_PROOF_FILES : HOME_AI_PROOF_FILES;
  return candidates.filter((relPath) => fs.existsSync(path.join(source, relPath)));
}

function restartLabels(options) {
  const labels = new Set(options.restartLabels || []);
  if (options.restartMode !== "none") {
    for (const label of DEFAULT_RESTART_LABELS[options.target] || []) labels.add(label);
  }
  return Array.from(labels).sort();
}

function defaultHealthUrlForTarget(target = "") {
  const plugin = String(target || "").replace(/^plugin:/, "");
  return PLUGIN_HEALTH_URLS[plugin] || "";
}

function buildPlan(options) {
  const source = normalizePath(options.source || defaultSource(options));
  const target = productionTarget(options);
  assertInside(source, options.devRoot, "source");
  assertInside(target, options.macRoot, "production_target");
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    throw new Error(`source_directory_missing:${source}`);
  }
  const planTimestamp = options.timestamp || timestamp();
  const reason = sanitizeSlug(options.reason);
  const targetSlug = sanitizeSlug(options.target.replace(":", "-"));
  const backupPath = posixJoin(options.macRoot, "backups", "deploy", `${planTimestamp}-${targetSlug}-${reason}`);
  const labels = restartLabels(options);
  const healthUrl = options.syncOnly ? "" : (options.healthUrl || defaultHealthUrlForTarget(options.target));
  const relevantDirtyFiles = deployDirtyFiles(source, options);
  const ignoredDirty = ignoredDirtyFiles(source, options);
  const uiVisualChangedFiles = changedFilesForUiVisualValidation(source, options, relevantDirtyFiles);
  const uiVisualLocalValidation = buildUiVisualLocalValidation({
    changedFiles: uiVisualChangedFiles,
    evidence: options.uiVisualEvidence,
    uiImpact: options.uiImpact,
  });
  const expectedVersion = extractClientVersionFromSource(source);
  const proofFiles = proofFilesForPlan(source, options);
  const rsyncExcludes = rsyncExcludesForTarget(options);
  const productionOwner = productionOwnerForTarget(options.target);
  const postSyncRepairs = postSyncRepairsForTarget(options);
  const postSyncMirrors = postSyncMirrorsForTarget(options);
  const validation = [];
  if (options.target === "home-ai") {
    const command = [
      posixJoin(options.macRoot, PINNED_NODE),
      posixJoin(target, "scripts", "production-status-smoke.js"),
      "--access-key-file",
      posixJoin(options.macRoot, "data", "secrets", "owner-web-key.secret"),
      "--base",
      options.baseUrl,
      "--json",
    ];
    if (expectedVersion) command.push("--expected-version", expectedVersion);
    validation.push({
      type: "home-ai-status-smoke",
      command,
    });
    validation.push({
      type: "home-ai-automation-cron-audit",
      command: [
        posixJoin(options.macRoot, PINNED_NODE),
        posixJoin(target, "scripts", "macos-automation-cron-audit.js"),
        "--root",
        normalizePath(options.macRoot),
        "--strict-config",
        "--strict-source",
        "--strict-status",
        "--status-since",
        timestampToIso(planTimestamp),
        "--json",
      ],
    });
    validation.push({
      type: "home-ai-production-drift-audit",
      command: [
        posixJoin(options.macRoot, PINNED_NODE),
        posixJoin(target, "scripts", "macos-production-profile-audit.js"),
        "--root",
        normalizePath(options.macRoot),
        "--expected-workspaces",
        "owner",
        "--json",
        "--no-strict",
      ],
      failOnAnyIssue: true,
    });
    validation.push({
      type: OWNER_3A_QUALITY_EVIDENCE_SEED.type,
      outputFile: posixJoin(options.macRoot, OWNER_3A_QUALITY_EVIDENCE_SEED.relativePath),
    });
  }
  if (proofFiles.length) {
    validation.push({
      type: "production-file-hashes",
      files: proofFiles,
    });
  }
  for (const label of labels) {
    validation.push({ type: "launchd-print", command: ["/bin/launchctl", "print", `system/${label}`] });
  }
  if (healthUrl) {
    validation.push({ type: "health-url", command: ["/usr/bin/curl", "-fsS", "--max-time", "10", healthUrl] });
  }
  if (!options.syncOnly && options.target === "plugin:codex-mobile-web") {
    validation.push({
      type: CODEX_MOBILE_LISTENER_STARTUP_GATE.type,
      command: buildCodexMobileListenerStartupGateCommand(options, target),
      failOnUnavailable: true,
      scope: "listener_startup",
      startupOnly: true,
    });
    validation.push({
      type: CODEX_MOBILE_BEHAVIOR_GATE.type,
      command: buildCodexMobileBehaviorGateCommand(options, target),
      failOnUnavailable: true,
      scope: "thread_detail_render_events",
      startupOnly: false,
      submitExercise: codexMobileBehaviorSubmitExercisePlan(options),
    });
  }
  if (!options.syncOnly) {
    validation.push({
      type: "codex-auth-profile-audit",
      command: [
        posixJoin(options.macRoot, PINNED_NODE),
        posixJoin(options.macRoot, "app", "scripts", "macos-production-profile-audit.js"),
        "--root",
        normalizePath(options.macRoot),
        "--expected-workspaces",
        "owner",
        "--json",
        "--no-strict",
      ],
      failOnIssuePrefix: CODEX_AUTH_AUDIT_ISSUE_PREFIX,
    });
  }
  return {
    schemaVersion: 1,
    mode: options.execute ? "execute" : "plan",
    target: options.target,
    sourcePath: source,
    productionPath: target,
    macRoot: normalizePath(options.macRoot),
    productionOwner,
    surface: options.surface,
    allowDirty: Boolean(options.allowDirty),
    syncOnly: Boolean(options.syncOnly),
    sourceRef: sourceRef(source),
    reason: options.reason,
    deployDirtyFiles: relevantDirtyFiles,
    ignoredDirtyFiles: ignoredDirty,
    uiVisualLocalValidation,
    expectedClientVersion: expectedVersion,
    backupPath,
    restartLabels: labels,
    healthUrl,
    rsyncExcludes,
    postSyncRepairs,
    postSyncMirrors,
    sync: options.surface === "static"
      ? HOME_AI_STATIC_SYNC_ROOTS.map((root) => ({ source: `${root}`, target: `${root}` }))
      : [{ source: "./", target: "./" }],
    proofFiles,
    cronProfileAliases: options.target === "home-ai"
      ? buildHomeAiCronProfileAliasPlan(options.macRoot)
      : null,
    validation,
    runtimeValidationSkipped: Boolean(options.syncOnly),
    rollback: {
      restoreCommand: ["/usr/bin/rsync", "-a", "--delete", `${backupPath}/`, `${target}/`],
      restartLabels: labels,
    },
  };
}

function buildAllPluginPlan(options) {
  const plans = PLUGIN_DEPLOY_ORDER.map((plugin) => buildPlan(Object.assign({}, options, {
    plugin,
    target: `plugin:${plugin}`,
    source: "",
    healthUrl: "",
    restartLabels: [],
  })));
  return {
    schemaVersion: 1,
    mode: options.execute ? "execute" : "plan",
    target: "plugins:all",
    pluginTargets: PLUGIN_DEPLOY_ORDER,
    sourceRoot: normalizePath(options.devRoot),
    productionRoot: normalizePath(posixJoin(options.macRoot, "plugins")),
    surface: options.surface,
    allowDirty: Boolean(options.allowDirty),
    syncOnly: Boolean(options.syncOnly),
    plans,
  };
}

function assertExecutablePlan(plan, options) {
  if (!options.execute) return;
  if (plan.target.startsWith("plugin:") && !plan.restartLabels.length && !options.healthUrl && !options.syncOnly) {
    throw new Error("plugin_execute_requires_restart_label_or_health_url");
  }
  if (plan.deployDirtyFiles.length && !options.allowDirty) {
    throw new Error(`deploy_source_dirty_requires_allow_dirty:${plan.deployDirtyFiles.join(",")}`);
  }
  if (plan.uiVisualLocalValidation?.required && plan.uiVisualLocalValidation.ok !== true) {
    const issueCodes = plan.uiVisualLocalValidation.issueCodes?.length
      ? plan.uiVisualLocalValidation.issueCodes.join(",")
      : UI_VISUAL_LOCAL_VALIDATION_REQUIRED;
    throw new Error(`${UI_VISUAL_LOCAL_VALIDATION_REQUIRED}:${issueCodes}`);
  }
}

function assertExecutableAllPluginPlan(plan, options) {
  if (!options.execute) return;
  for (const child of plan.plans || []) {
    assertExecutablePlan(child, Object.assign({}, options, { target: child.target }));
  }
}

function readPassword(passwordFile) {
  if (!passwordFile) return "";
  return fs.readFileSync(passwordFile, "utf8").split(/\r?\n/).find((line) => line.trim()) || "";
}

function sudoPasswordFileCandidates(passwordFile = "") {
  const seen = new Set();
  const rows = [];
  function add(filePath, source) {
    const normalized = String(filePath || "").trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    rows.push({ path: normalized, source });
  }
  add(passwordFile, "argument");
  for (const filePath of defaultSudoPasswordFileCandidates()) add(filePath, "local-default");
  return rows;
}

function shQuote(value) {
  return `'${String(value || "").replace(/'/g, "'\\''")}'`;
}

function buildCodexMobileListenerStartupGateCommand(options, productionPath) {
  const node = posixJoin(options.macRoot, PINNED_NODE);
  const script = CODEX_MOBILE_LISTENER_STARTUP_GATE.script;
  const shellCommand = [
    `cd ${shQuote(productionPath)}`,
    "&&",
    "exec",
    shQuote(node),
    shQuote(script),
    "--server",
    shQuote(CODEX_MOBILE_LISTENER_STARTUP_GATE.server),
    "--gate-mode",
    "deploy",
    "--browser-mode",
    "full",
    "--browser-startup-only",
    "--skip-api",
    "--skip-client-events",
    "--json",
  ].join(" ");
  return ["/bin/sh", "-lc", shellCommand];
}

function codexMobileBehaviorSubmitExercisePlan(options = {}) {
  const threadId = String(options.codexMobileSubmitThreadId || "").trim();
  if (threadId) {
    return {
      mode: "automatic",
      configured: true,
      threadId,
      privacy: "controlled_thread_id_only",
    };
  }
  return {
    mode: "manual",
    configured: false,
    reason: "controlled_submit_thread_not_configured",
    operatorCommandHint: "--codex-mobile-submit-thread-id <controlled-thread-id>",
  };
}

function buildCodexMobileBehaviorGateCommand(options, productionPath) {
  const node = posixJoin(options.macRoot, PINNED_NODE);
  const script = CODEX_MOBILE_BEHAVIOR_GATE.script;
  const submitPlan = codexMobileBehaviorSubmitExercisePlan(options);
  const shellParts = [
    `cd ${shQuote(productionPath)}`,
    "&&",
    "exec",
    shQuote(node),
    shQuote(script),
    "--server",
    shQuote(CODEX_MOBILE_BEHAVIOR_GATE.server),
    "--gate-mode",
    "deploy",
    "--browser-mode",
    "full",
  ];
  if (submitPlan.mode === "automatic" && submitPlan.threadId) {
    shellParts.push(
      "--browser-exercise-submit",
      "--browser-submit-thread-id",
      shQuote(submitPlan.threadId),
    );
  }
  shellParts.push("--json");
  return ["/bin/sh", "-lc", shellParts.join(" ")];
}

function xmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function homeAiCronPaths(macRoot) {
  const root = normalizePath(macRoot || DEFAULT_MAC_ROOT);
  const appRoot = posixJoin(root, "app");
  const hermesHome = posixJoin(root, "data", "hermes-home");
  const cronRoot = posixJoin(hermesHome, "cron");
  const logsRoot = posixJoin(root, "logs");
  return {
    root,
    appRoot,
    hermesHome,
    cronRoot,
    jobsPath: posixJoin(cronRoot, "jobs.json"),
    outputRoot: posixJoin(cronRoot, "output"),
    runLogRoot: posixJoin(hermesHome, "run-logs"),
    runtimePython: posixJoin(root, "runtime", "hermes-agent-official", "venv", "bin", "python"),
    runtimeSource: posixJoin(root, "runtime", "hermes-agent-official", "source"),
    runtimeOverrides: posixJoin(appRoot, "gateway-runtime-overrides"),
    dispatcherScript: posixJoin(appRoot, "scripts", "hermes-mobile-cron-dispatcher.py"),
    stdoutLog: posixJoin(logsRoot, "cron.out.log"),
    stderrLog: posixJoin(logsRoot, "cron.err.log"),
    plistPath: `/Library/LaunchDaemons/${HOME_AI_CRON_LABEL}.plist`,
  };
}

function gatewayPoolManifestPath(macRoot) {
  return posixJoin(normalizePath(macRoot || DEFAULT_MAC_ROOT), "data", "gateway-pool-manifest-mac.json");
}

function gatewayManifestWorkerUsers(manifest = {}) {
  const workers = Array.isArray(manifest.workers) ? manifest.workers : [];
  const users = [];
  for (const worker of workers) {
    if (!worker || worker.enabled === false) continue;
    const user = String(worker.osUser || worker.os_user || "").trim();
    if (/^[A-Za-z0-9._-]+$/.test(user) && !users.includes(user)) users.push(user);
  }
  return users.sort();
}

function repairGatewayManifestWorkerReadAcl(plan, password) {
  if (plan.target !== "home-ai" || plan.surface === "static") return null;
  const manifestPath = gatewayPoolManifestPath(plan.macRoot);
  let manifest = {};
  try {
    manifest = readGatewayManifestForCronProfiles(manifestPath, password);
  } catch (_err) {
    return null;
  }
  const users = gatewayManifestWorkerUsers(manifest);
  if (!users.length) return null;
  for (const user of users) {
    applyAclOnce(manifestPath, `user:${user} allow read,readattr,readextattr,readsecurity`, password, false);
  }
  return {
    type: "gateway-manifest-worker-read-acl",
    status: 0,
    manifestPath,
    userCount: users.length,
  };
}

function buildPluginWorkspaceAuditTargetJson(macRoot) {
  const root = normalizePath(macRoot || DEFAULT_MAC_ROOT);
  const rows = {};
  for (const [pluginId, dirName] of Object.entries(HOME_AI_PLUGIN_WORKSPACE_AUDIT_TARGETS)) {
    rows[pluginId] = dirName === "." ? posixJoin(root, "app") : posixJoin(root, "plugins", dirName);
  }
  return JSON.stringify(rows);
}

function safeProfileId(value) {
  const text = String(value || "").trim();
  return SAFE_PROFILE_ID_PATTERN.test(text) ? text : "";
}

function normalizeArray(value) {
  const raw = Array.isArray(value) ? value : (value ? [value] : []);
  const out = [];
  for (const item of raw) {
    const text = String(item || "").trim();
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

function workerToolsets(worker = {}) {
  return normalizeArray(
    worker.toolsets
    || worker.enabledToolsets
    || worker.enabled_toolsets
    || worker.allowedToolsets
    || worker.allowed_toolsets
    || worker.toolsetIds
    || worker.toolset_ids,
  );
}

function workerCronProfileAliasEligible(worker = {}) {
  if (!worker || typeof worker !== "object") return false;
  if (worker.enabled === false) return false;
  if (String(worker.securityLevel || worker.security_level || "user").trim().toLowerCase() !== "user") return false;
  if (!safeProfileId(worker.profile || worker.name || worker.id)) return false;
  const toolsets = workerToolsets(worker).map((item) => item.toLowerCase());
  return !toolsets.length || toolsets.includes("cronjob_mobile");
}

function gatewayWorkerProfileSourceDir(worker = {}) {
  const rawConfig = String(worker.configPath || worker.config_path || "").trim().replace(/\\/g, "/");
  if (!rawConfig || !rawConfig.startsWith("/") || path.posix.basename(rawConfig) !== "config.yaml") return "";
  return normalizePath(path.posix.dirname(rawConfig));
}

function profileSourceAncestorDirs(sourceDir) {
  const normalized = normalizePath(sourceDir || "");
  const parts = normalized.split("/").filter(Boolean);
  const dirs = [];
  for (let index = 2; index < parts.length; index += 1) {
    dirs.push(`/${parts.slice(0, index).join("/")}`);
  }
  return dirs;
}

function workspaceRootFromGatewayProfileSourceDir(sourceDir) {
  const normalized = normalizePath(sourceDir || "");
  const marker = "/.hermes-gateway/profiles/";
  const index = normalized.indexOf(marker);
  if (index < 0) return "";
  return normalized.slice(0, index) || "";
}

function cronProfilePluginBindingDirs(sourceDir) {
  const workspaceRoot = workspaceRootFromGatewayProfileSourceDir(sourceDir);
  if (!workspaceRoot) return [];
  return HOME_AI_CRON_PLUGIN_BINDING_DIR_NAMES.map((name) => posixJoin(workspaceRoot, name));
}

function cronProfileAliasRowsFromManifest(manifest = {}, macRoot = DEFAULT_MAC_ROOT) {
  const paths = homeAiCronPaths(macRoot);
  const workers = Array.isArray(manifest)
    ? manifest
    : (Array.isArray(manifest.workers) ? manifest.workers : []);
  const rows = [];
  const seen = new Set();
  for (const worker of workers) {
    if (!workerCronProfileAliasEligible(worker)) continue;
    const profile = safeProfileId(worker.profile || worker.name || worker.id);
    const sourceDir = gatewayWorkerProfileSourceDir(worker);
    if (!profile || !sourceDir || seen.has(profile)) continue;
    seen.add(profile);
    rows.push({
      profile,
      sourceDir,
      aliasPath: posixJoin(paths.hermesHome, "profiles", profile),
      ancestorDirs: profileSourceAncestorDirs(sourceDir),
      workspaceRoot: workspaceRootFromGatewayProfileSourceDir(sourceDir),
      pluginBindingDirs: cronProfilePluginBindingDirs(sourceDir),
    });
  }
  return rows;
}

function buildHomeAiCronProfileAliasPlan(macRoot, manifest = null) {
  const paths = homeAiCronPaths(macRoot);
  return {
    type: "home-ai-cron-profile-aliases",
    manifestPath: gatewayPoolManifestPath(macRoot),
    profilesRoot: posixJoin(paths.hermesHome, "profiles"),
    aliases: manifest ? cronProfileAliasRowsFromManifest(manifest, macRoot) : [],
  };
}

function setTopLevelYamlScalar(text, blockName, key, value) {
  const cleanBlock = String(blockName || "").trim();
  const cleanKey = String(key || "").trim();
  if (!cleanBlock || !cleanKey) return String(text || "");
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  let blockStart = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] === `${cleanBlock}:`) {
      blockStart = index;
      break;
    }
  }
  if (blockStart < 0) {
    const prefix = lines.length && lines[lines.length - 1] === "" ? [] : [""];
    return [...lines, ...prefix, `${cleanBlock}:`, `  ${cleanKey}: ${value}`].join("\n");
  }
  let blockEnd = lines.length;
  for (let index = blockStart + 1; index < lines.length; index += 1) {
    if (/^[A-Za-z0-9_-]+:\s*$/.test(lines[index])) {
      blockEnd = index;
      break;
    }
  }
  const keyPattern = new RegExp(`^  ${cleanKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*`);
  for (let index = blockStart + 1; index < blockEnd; index += 1) {
    if (keyPattern.test(lines[index])) {
      lines[index] = `  ${cleanKey}: ${value}`;
      return lines.join("\n");
    }
  }
  lines.splice(blockEnd, 0, `  ${cleanKey}: ${value}`);
  return lines.join("\n");
}

function buildHomeAiVisualAnalysisProfileConfig(sourceConfig, options = {}) {
  let text = String(sourceConfig || "");
  text = setTopLevelYamlScalar(text, "model", "default", options.model || HOME_AI_VISUAL_ANALYSIS_MODEL);
  text = setTopLevelYamlScalar(text, "model", "provider", options.provider || HOME_AI_VISUAL_ANALYSIS_PROVIDER);
  text = setTopLevelYamlScalar(text, "agent", "reasoning_effort", options.reasoningEffort || HOME_AI_VISUAL_ANALYSIS_REASONING_EFFORT);
  return text.trimEnd() + "\n";
}

function findCronProfileSourceDir(manifest, profile, macRoot = DEFAULT_MAC_ROOT) {
  const rows = cronProfileAliasRowsFromManifest(manifest || {}, macRoot);
  return rows.find((row) => row.profile === profile)?.sourceDir || "";
}

function homeAiBridgeHostPaths(macRoot) {
  const root = normalizePath(macRoot || DEFAULT_MAC_ROOT);
  const appRoot = posixJoin(root, "app");
  const hermesHome = posixJoin(root, "data", "hermes-home");
  const cronRoot = posixJoin(hermesHome, "cron");
  const logsRoot = posixJoin(root, "logs");
  return {
    root,
    appRoot,
    hermesHome,
    cronRoot,
    jobsPath: posixJoin(cronRoot, "jobs.json"),
    outputRoot: posixJoin(cronRoot, "output"),
    runLogRoot: posixJoin(hermesHome, "run-logs"),
    bridgeHostScript: posixJoin(appRoot, "scripts", "bridge-host.js"),
    node: posixJoin(root, PINNED_NODE),
    keyPath: posixJoin(root, "data", "secrets", "bridge-host.secret"),
    runtimeSource: posixJoin(root, "runtime", "hermes-agent-official", "source"),
    runtimeOverrides: posixJoin(appRoot, "gateway-runtime-overrides"),
    stdoutLog: posixJoin(logsRoot, "bridge-host.out.log"),
    stderrLog: posixJoin(logsRoot, "bridge-host.err.log"),
    plistPath: `/Library/LaunchDaemons/${HOME_AI_BRIDGE_HOST_LABEL}.plist`,
  };
}

function homeAiNasBackupMountPaths(macRoot) {
  const root = normalizePath(macRoot || DEFAULT_MAC_ROOT);
  const appRoot = posixJoin(root, "app");
  const logsRoot = posixJoin(root, "logs");
  return {
    root,
    appRoot,
    mountScript: posixJoin(appRoot, "scripts", "homeai-nas-backup-mount-watchdog.sh"),
    stdoutLog: posixJoin(logsRoot, "nas-backup-mount.out.log"),
    stderrLog: posixJoin(logsRoot, "nas-backup-mount.err.log"),
    plistPath: `/Library/LaunchDaemons/${HOME_AI_NAS_BACKUP_MOUNT_LABEL}.plist`,
  };
}

function homeAiProductionDriftAuditPaths(macRoot) {
  const root = normalizePath(macRoot || DEFAULT_MAC_ROOT);
  const appRoot = posixJoin(root, "app");
  const logsRoot = posixJoin(root, "logs");
  return {
    root,
    appRoot,
    script: posixJoin(root, "data", "hermes-home", "scripts", "homeai-production-drift-audit-watchdog.sh"),
    outputDir: posixJoin(root, "data", "production-drift-audit"),
    stdoutLog: posixJoin(logsRoot, "production-drift-audit.out.log"),
    stderrLog: posixJoin(logsRoot, "production-drift-audit.err.log"),
    plistPath: `/Library/LaunchDaemons/${HOME_AI_PRODUCTION_DRIFT_AUDIT_LABEL}.plist`,
  };
}

function homeAiVisualDebugPaths(macRoot, user = HOME_AI_VISUAL_DEBUG_USER) {
  const root = normalizePath(macRoot || DEFAULT_MAC_ROOT);
  const appRoot = posixJoin(root, "app");
  const home = `/Users/${user}`;
  const qaRoot = posixJoin(home, ".homeai-qa");
  return {
    root,
    appRoot,
    node: posixJoin(root, PINNED_NODE),
    script: posixJoin(appRoot, "scripts", "ios-pwa-live-debug-server.js"),
    user,
    home,
    qaRoot,
    appiumStartScript: posixJoin(qaRoot, "scripts", "macos-ios-appium-start.sh"),
    logsRoot: posixJoin(qaRoot, "logs"),
    stdoutLog: posixJoin(qaRoot, "logs", "homeai-visual-debug.out.log"),
    stderrLog: posixJoin(qaRoot, "logs", "homeai-visual-debug.err.log"),
    plistPath: posixJoin(home, "Library", "LaunchAgents", `${HOME_AI_VISUAL_DEBUG_LABEL}.plist`),
  };
}

function buildHomeAiCronLaunchdPlist(macRoot) {
  const paths = homeAiCronPaths(macRoot);
  const env = {
    HERMES_HOME: paths.hermesHome,
    HERMES_WEB_HERMES_HOME: paths.hermesHome,
    HERMES_WEB_DATA_DIR: posixJoin(paths.root, "data"),
    HERMES_WEB_CRON_JOBS_PATH: paths.jobsPath,
    HERMES_WEB_CRON_OUTPUT_ROOT: paths.outputRoot,
    HERMES_WEB_RUN_LOG_ROOT: paths.runLogRoot,
    HERMES_MOBILE_ROOT: paths.root,
    HERMES_MOBILE_NETWORK_MODE: "direct",
    HERMES_MOBILE_CRON_TICK_SIDE: "macos",
    HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_ENABLED: HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_ENABLED,
    HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_ENABLED: HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_ENABLED,
    HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_COMMAND: HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_COMMAND,
    HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_COMMAND: HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_COMMAND,
    HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_MODEL: HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_MODEL,
    HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_MODEL: HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_MODEL,
    HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_HOME: HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_HOME,
    HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_HOME: HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_HOME,
    HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_TIMEOUT_MS: HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_TIMEOUT_MS,
    HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_TIMEOUT_MS: HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_TIMEOUT_MS,
    CODEX_MOBILE_BASE_URL: "http://127.0.0.1:8787",
    CODEX_MOBILE_KEY_FILE: posixJoin(paths.root, "data", "secrets", "codex-mobile-access-key.secret"),
    HERMES_CRON_SCRIPT_TIMEOUT: String(HOME_AI_CRON_SCRIPT_TIMEOUT_SECONDS),
    HOMEAI_DISASTER_BACKUP_TRANSPORT: HOME_AI_DISASTER_BACKUP_TRANSPORT,
    HOMEAI_DISASTER_BACKUP_SSH_TARGET: HOME_AI_DISASTER_BACKUP_SSH_TARGET,
    HOMEAI_DISASTER_BACKUP_SSH_DESTINATION: HOME_AI_DISASTER_BACKUP_SSH_DESTINATION,
    HOMEAI_DISASTER_BACKUP_SSH_OPTIONS: HOME_AI_DISASTER_BACKUP_SSH_OPTIONS,
    HERMES_ACCEPT_HOOKS: "1",
    PYTHONPATH: `${paths.runtimeOverrides}:${paths.runtimeSource}`,
  };
  const envRows = Object.entries(env)
    .map(([key, value]) => `    <key>${xmlEscape(key)}</key>\n    <string>${xmlEscape(value)}</string>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(HOME_AI_CRON_LABEL)}</string>
  <key>UserName</key>
  <string>${xmlEscape(PRODUCTION_SERVICE_USER)}</string>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(paths.appRoot)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(paths.runtimePython)}</string>
    <string>${xmlEscape(paths.dispatcherScript)}</string>
    <string>--dispatch</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${envRows}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>${HOME_AI_CRON_START_INTERVAL_SECONDS}</integer>
  <key>StandardOutPath</key>
  <string>${xmlEscape(paths.stdoutLog)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(paths.stderrLog)}</string>
</dict>
</plist>
`;
}

function buildHomeAiNasBackupMountLaunchdPlist(macRoot) {
  const paths = homeAiNasBackupMountPaths(macRoot);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(HOME_AI_NAS_BACKUP_MOUNT_LABEL)}</string>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(paths.appRoot)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(paths.mountScript)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>${HOME_AI_NAS_BACKUP_MOUNT_START_INTERVAL_SECONDS}</integer>
  <key>StandardOutPath</key>
  <string>${xmlEscape(paths.stdoutLog)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(paths.stderrLog)}</string>
</dict>
</plist>
`;
}

function buildHomeAiProductionDriftAuditLaunchdPlist(macRoot) {
  const paths = homeAiProductionDriftAuditPaths(macRoot);
  const env = {
    HERMES_MOBILE_ROOT: paths.root,
    HERMES_MOBILE_APP_DIR: paths.appRoot,
    HOMEAI_PRODUCTION_DRIFT_AUDIT_OUTPUT_DIR: paths.outputDir,
    HOMEAI_PRODUCTION_DRIFT_AUDIT_EXPECTED_WORKSPACES: "owner",
    HOMEAI_PRODUCTION_DRIFT_AUTO_REPAIR: "1",
  };
  const envRows = Object.entries(env)
    .map(([key, value]) => `    <key>${xmlEscape(key)}</key>\n    <string>${xmlEscape(value)}</string>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(HOME_AI_PRODUCTION_DRIFT_AUDIT_LABEL)}</string>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(paths.appRoot)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(paths.script)}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${envRows}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>${HOME_AI_PRODUCTION_DRIFT_AUDIT_START_INTERVAL_SECONDS}</integer>
  <key>StandardOutPath</key>
  <string>${xmlEscape(paths.stdoutLog)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(paths.stderrLog)}</string>
</dict>
</plist>
`;
}

function buildHomeAiVisualDebugLaunchAgentPlist(macRoot, user = HOME_AI_VISUAL_DEBUG_USER) {
  const paths = homeAiVisualDebugPaths(macRoot, user);
  const env = {
    HOME: paths.home,
    PATH: `${paths.qaRoot}/node-current/bin:${paths.qaRoot}/appium-global/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
    HERMES_MOBILE_ROOT: paths.root,
    HOMEAI_IOS_DEBUG_LANE_OWNER: "homeai-visual-polish-cron",
    HOMEAI_VISUAL_DEBUG_APP_URL: HOME_AI_VISUAL_DEBUG_APP_URL,
    APPIUM_PORT: String(HOME_AI_VISUAL_DEBUG_APPIUM_PORT),
  };
  const envRows = Object.entries(env)
    .map(([key, value]) => `    <key>${xmlEscape(key)}</key>\n    <string>${xmlEscape(value)}</string>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(HOME_AI_VISUAL_DEBUG_LABEL)}</string>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(paths.appRoot)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(paths.node)}</string>
    <string>${xmlEscape(paths.script)}</string>
    <string>--host</string>
    <string>127.0.0.1</string>
    <string>--port</string>
    <string>${HOME_AI_VISUAL_DEBUG_PORT}</string>
    <string>--appium-url</string>
    <string>http://127.0.0.1:${HOME_AI_VISUAL_DEBUG_APPIUM_PORT}</string>
    <string>--wda-local-port</string>
    <string>${HOME_AI_VISUAL_DEBUG_WDA_PORT}</string>
    <string>--mjpeg-server-port</string>
    <string>${HOME_AI_VISUAL_DEBUG_MJPEG_PORT}</string>
    <string>--app-url</string>
    <string>${xmlEscape(HOME_AI_VISUAL_DEBUG_APP_URL)}</string>
    <string>--appium-start-script</string>
    <string>${xmlEscape(paths.appiumStartScript)}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${envRows}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(paths.stdoutLog)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(paths.stderrLog)}</string>
</dict>
</plist>
`;
}

function buildHomeAiBridgeHostLaunchdPlist(macRoot) {
  const paths = homeAiBridgeHostPaths(macRoot);
  const env = {
    HERMES_HOME: paths.hermesHome,
    HERMES_WEB_HERMES_HOME: paths.hermesHome,
    HERMES_WEB_DATA_DIR: posixJoin(paths.root, "data"),
    HERMES_WEB_CRON_JOBS_PATH: paths.jobsPath,
    HERMES_WEB_CRON_OUTPUT_ROOT: paths.outputRoot,
    HERMES_WEB_RUN_LOG_ROOT: paths.runLogRoot,
    HERMES_MOBILE_ROOT: paths.root,
    HERMES_MOBILE_BRIDGE_HOST: "127.0.0.1",
    HERMES_MOBILE_BRIDGE_HOST_PORT: String(HOME_AI_BRIDGE_HOST_PORT),
    HERMES_MOBILE_BRIDGE_HOST_KEY_PATH: paths.keyPath,
    HERMES_WEB_BRIDGE_HOST_KEY_PATH: paths.keyPath,
    HERMES_MOBILE_CHATGPT_PRO_WORKSPACE: HOME_AI_CHATGPT_PRO_WORKSPACE,
    HERMES_WEB_CHATGPT_PRO_WORKSPACE: HOME_AI_CHATGPT_PRO_WORKSPACE,
    HERMES_MOBILE_CHATGPT_PRO_CODEX_MOBILE_URL: HOME_AI_CHATGPT_PRO_CODEX_MOBILE_URL,
    HERMES_WEB_CHATGPT_PRO_CODEX_MOBILE_URL: HOME_AI_CHATGPT_PRO_CODEX_MOBILE_URL,
    HERMES_MOBILE_CHATGPT_PRO_CODEX_MOBILE_KEY_FILE: HOME_AI_CHATGPT_PRO_CODEX_MOBILE_KEY_FILE,
    HERMES_WEB_CHATGPT_PRO_CODEX_MOBILE_KEY_FILE: HOME_AI_CHATGPT_PRO_CODEX_MOBILE_KEY_FILE,
    CODEX_MOBILE_KEY_FILE: HOME_AI_CHATGPT_PRO_CODEX_MOBILE_KEY_FILE,
    HERMES_MOBILE_CHATGPT_PRO_OUTPUT_DIR: HOME_AI_CHATGPT_PRO_OUTPUT_DIR,
    HERMES_WEB_CHATGPT_PRO_OUTPUT_DIR: HOME_AI_CHATGPT_PRO_OUTPUT_DIR,
    HERMES_MOBILE_NETWORK_MODE: "direct",
    HERMES_ACCEPT_HOOKS: "1",
    PYTHONPATH: `${paths.runtimeOverrides}:${paths.runtimeSource}`,
  };
  const envRows = Object.entries(env)
    .map(([key, value]) => `    <key>${xmlEscape(key)}</key>\n    <string>${xmlEscape(value)}</string>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(HOME_AI_BRIDGE_HOST_LABEL)}</string>
  <key>UserName</key>
  <string>${xmlEscape(PRODUCTION_SERVICE_USER)}</string>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(paths.appRoot)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(paths.node)}</string>
    <string>${xmlEscape(paths.bridgeHostScript)}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${envRows}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(paths.stdoutLog)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(paths.stderrLog)}</string>
</dict>
</plist>
`;
}

function summarizeCommandArg(arg, index) {
  const value = String(arg == null ? "" : arg);
  if (value.length > 180 || value.includes("\n")) {
    const hash = crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
    return `[arg${index}:chars=${value.length}:sha256=${hash}]`;
  }
  return value;
}

function runSudo(command, args, password, input) {
  const sudoArgs = password
    ? ["-S", "-p", "", command, ...args]
    : ["-n", command, ...args];
  const result = spawnSync("/usr/bin/sudo", sudoArgs, {
    input: password ? `${password}\n${input || ""}` : (input || ""),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const err = new Error(`sudo_command_failed:${path.basename(command)}`);
    err.status = result.status;
    err.command = command;
    err.args = args.map(summarizeCommandArg);
    err.stderr = String(result.stderr || "").slice(0, 1200);
    throw err;
  }
  return result;
}

function runSudoAllowFailure(command, args, password, input) {
  const sudoArgs = password
    ? ["-S", "-p", "", command, ...args]
    : ["-n", command, ...args];
  return spawnSync("/usr/bin/sudo", sudoArgs, {
    input: password ? `${password}\n${input || ""}` : (input || ""),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function buildSystemLaunchdReloadScript(label, plistPath) {
  return [
    "set +e",
    `label=${shQuote(label)}`,
    `plist=${shQuote(plistPath)}`,
    "/bin/launchctl bootout system \"$plist\" >/dev/null 2>&1",
    "bootout_status=$?",
    "label_bootout_status=0",
    "/bin/launchctl print \"system/$label\" >/dev/null 2>&1",
    "loaded_after_plist_bootout=$?",
    "if [ \"$loaded_after_plist_bootout\" -eq 0 ]; then",
    "  /bin/launchctl bootout \"system/$label\" >/dev/null 2>&1",
    "  label_bootout_status=$?",
    "fi",
    "/bin/launchctl bootstrap system \"$plist\" >/dev/null 2>&1",
    "bootstrap_status=$?",
    "fallback_kickstart_status=0",
    "already_loaded=0",
    "if [ \"$bootstrap_status\" -ne 0 ]; then",
    "  /bin/launchctl print \"system/$label\" >/dev/null 2>&1",
    "  print_status=$?",
    "  if [ \"$print_status\" -eq 0 ]; then",
    "    already_loaded=1",
    "    /bin/launchctl kickstart -k \"system/$label\" >/dev/null 2>&1",
    "    fallback_kickstart_status=$?",
    "    if [ \"$fallback_kickstart_status\" -ne 0 ]; then",
    "      /bin/launchctl print \"system/$label\" >/dev/null 2>&1",
    "      fallback_print_status=$?",
    "      if [ \"$fallback_print_status\" -ne 0 ]; then",
    "        printf '{\"ok\":false,\"label\":\"%s\",\"bootoutStatus\":%s,\"labelBootoutStatus\":%s,\"bootstrapStatus\":%s,\"alreadyLoaded\":%s,\"fallbackKickstartStatus\":%s,\"fallbackPrintStatus\":%s}\\n' \"$label\" \"$bootout_status\" \"$label_bootout_status\" \"$bootstrap_status\" \"$already_loaded\" \"$fallback_kickstart_status\" \"$fallback_print_status\"",
    "        exit \"$fallback_kickstart_status\"",
    "      fi",
    "    fi",
    "  else",
    "    printf '{\"ok\":false,\"label\":\"%s\",\"bootoutStatus\":%s,\"labelBootoutStatus\":%s,\"bootstrapStatus\":%s,\"alreadyLoaded\":%s,\"fallbackKickstartStatus\":%s,\"fallbackPrintStatus\":%s}\\n' \"$label\" \"$bootout_status\" \"$label_bootout_status\" \"$bootstrap_status\" \"$already_loaded\" \"$fallback_kickstart_status\" \"$print_status\"",
    "    exit \"$bootstrap_status\"",
    "  fi",
    "fi",
    "fallback_print_status=${fallback_print_status:-0}",
    "printf '{\"ok\":true,\"label\":\"%s\",\"bootoutStatus\":%s,\"labelBootoutStatus\":%s,\"bootstrapStatus\":%s,\"alreadyLoaded\":%s,\"fallbackKickstartStatus\":%s,\"fallbackPrintStatus\":%s}\\n' \"$label\" \"$bootout_status\" \"$label_bootout_status\" \"$bootstrap_status\" \"$already_loaded\" \"$fallback_kickstart_status\" \"$fallback_print_status\"",
    "exit 0",
  ].join("\n");
}

function reloadSystemLaunchdService(label, plistPath, password) {
  const result = runSudo("/bin/bash", ["-lc", buildSystemLaunchdReloadScript(label, plistPath)], password);
  const raw = String(result.stdout || "").trim();
  try {
    return JSON.parse(raw);
  } catch (_) {
    return {
      ok: true,
      label,
      bootoutStatus: 0,
      labelBootoutStatus: 0,
      bootstrapStatus: 0,
      alreadyLoaded: 0,
      fallbackKickstartStatus: 0,
    };
  }
}

function verifySudoAuthentication(password) {
  const sudoArgs = password ? ["-S", "-p", "", "-v"] : ["-n", "-v"];
  const result = spawnSync("/usr/bin/sudo", sudoArgs, {
    input: password ? `${password}\n` : "",
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.status === 0) return;
  const err = new Error(password ? "sudo_authentication_failed" : "sudo_authentication_required");
  err.status = result.status;
  err.command = "/usr/bin/sudo";
  err.args = sudoArgs;
  err.stderr = String(result.stderr || "").slice(0, 1200);
  throw err;
}

function resolveSudoPassword(passwordFile = "") {
  const failures = [];
  for (const candidate of sudoPasswordFileCandidates(passwordFile)) {
    let password = "";
    try {
      password = readPassword(candidate.path);
    } catch (err) {
      failures.push({ source: candidate.source, code: "unreadable" });
      continue;
    }
    if (!password) {
      failures.push({ source: candidate.source, code: "empty" });
      continue;
    }
    try {
      verifySudoAuthentication(password);
      return password;
    } catch (_err) {
      failures.push({ source: candidate.source, code: "rejected" });
    }
  }
  try {
    verifySudoAuthentication("");
    return "";
  } catch (err) {
    const hasPasswordCandidate = failures.some((item) => item.code === "rejected");
    err.message = hasPasswordCandidate ? "sudo_authentication_failed" : "sudo_authentication_required";
    err.candidateFailures = failures;
    throw err;
  }
}

function deployBackupDateFromTimestamp(timestampText = "") {
  const match = String(timestampText || "").match(/^(\d{4})(\d{2})(\d{2})T\d{6}Z$/);
  if (!match) return "";
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function cutoffDeployBackupDate(anchorTimestamp = "", retentionDays = DEPLOY_BACKUP_RETENTION_DAYS) {
  const match = String(anchorTimestamp || "").match(/^(\d{4})(\d{2})(\d{2})T\d{6}Z$/);
  if (!match) throw new Error(`deploy_backup_timestamp_invalid:${anchorTimestamp}`);
  const days = Math.floor(Number(retentionDays));
  if (!Number.isFinite(days) || days < 1) throw new Error(`deploy_backup_retention_days_invalid:${retentionDays}`);
  const anchor = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  anchor.setUTCDate(anchor.getUTCDate() - (days - 1));
  return anchor.toISOString().slice(0, 10);
}

function parseDeployBackupName(name = "") {
  const timestampMatch = String(name || "").match(/^(\d{8}T\d{6}Z)-(.+)$/)
    || String(name || "").match(/^(\d{8})-(\d{6})-(.+)$/);
  if (!timestampMatch) return null;
  const timestampText = timestampMatch.length === 4
    ? `${timestampMatch[1]}T${timestampMatch[2]}Z`
    : timestampMatch[1];
  const suffix = timestampMatch.length === 4 ? timestampMatch[3] : timestampMatch[2];
  const targetSlug = DEPLOY_BACKUP_TARGET_SLUGS.find((slug) => suffix === slug || suffix.startsWith(`${slug}-`));
  if (!targetSlug) return null;
  const date = deployBackupDateFromTimestamp(timestampText);
  if (!date) return null;
  return {
    timestamp: timestampText,
    date,
    targetSlug,
  };
}

function selectDeployBackupsToPrune(entries = [], currentPath = "", retentionDays = DEPLOY_BACKUP_RETENTION_DAYS) {
  const currentName = path.posix.basename(currentPath || "");
  const currentInfo = parseDeployBackupName(currentName);
  if (!currentInfo) throw new Error(`deploy_backup_current_name_invalid:${currentName}`);
  const cutoffDate = cutoffDeployBackupDate(currentInfo.timestamp, retentionDays);
  const latestByTargetDate = new Map();
  const parsedEntries = [];

  for (const entry of entries) {
    const entryPath = String(entry?.path || "");
    const info = parseDeployBackupName(entry?.name || path.posix.basename(entryPath));
    if (!info) continue;
    parsedEntries.push({ path: entryPath, info });
    if (info.date < cutoffDate) continue;
    const key = `${info.targetSlug}\t${info.date}`;
    const previous = latestByTargetDate.get(key);
    if (!previous || info.timestamp > previous.info.timestamp) {
      latestByTargetDate.set(key, { path: entryPath, info });
    }
  }

  const keep = new Set([currentPath]);
  for (const entry of latestByTargetDate.values()) keep.add(entry.path);

  return {
    cutoffDate,
    prune: parsedEntries
      .filter((entry) => !keep.has(entry.path))
      .map((entry) => entry.path)
      .sort(),
    keep: Array.from(keep).filter(Boolean).sort(),
  };
}

function pruneDeployBackups(plan, options, password) {
  const retentionDays = Number(options.deployBackupRetentionDays);
  if (!Number.isFinite(retentionDays) || retentionDays < 1) {
    throw new Error(`deploy_backup_retention_days_invalid:${options.deployBackupRetentionDays}`);
  }
  const backupRoot = posixJoin(options.macRoot, "backups", "deploy");
  if (!plan.backupPath.startsWith(`${backupRoot}/`)) {
    throw new Error(`deploy_backup_path_outside_root:${plan.backupPath}`);
  }
  const script = [
    "set -eu",
    `root=${shQuote(backupRoot)}`,
    `current=${shQuote(plan.backupPath)}`,
    `days=${Math.floor(retentionDays)}`,
    "test -d \"$root\" || exit 0",
    `${shQuote(process.execPath)} - "$root" "$current" "$days" <<'NODE'`,
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const root = process.argv[2];",
    "const current = process.argv[3];",
    "const days = Number(process.argv[4]);",
    `const targetSlugs = ${JSON.stringify(DEPLOY_BACKUP_TARGET_SLUGS)};`,
    "function parseDate(ts) {",
    "  const m = String(ts || '').match(/^(\\d{4})(\\d{2})(\\d{2})T\\d{6}Z$/);",
    "  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';",
    "}",
    "function cutoffDate(ts) {",
    "  const m = String(ts || '').match(/^(\\d{4})(\\d{2})(\\d{2})T\\d{6}Z$/);",
    "  if (!m) throw new Error(`invalid current backup timestamp: ${ts}`);",
    "  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));",
    "  d.setUTCDate(d.getUTCDate() - (Math.floor(days) - 1));",
    "  return d.toISOString().slice(0, 10);",
    "}",
    "function parseName(name) {",
    "  const m = String(name || '').match(/^(\\d{8}T\\d{6}Z)-(.+)$/) || String(name || '').match(/^(\\d{8})-(\\d{6})-(.+)$/);",
    "  if (!m) return null;",
    "  const timestamp = m.length === 4 ? `${m[1]}T${m[2]}Z` : m[1];",
    "  const suffix = m.length === 4 ? m[3] : m[2];",
    "  const slug = targetSlugs.find((candidate) => suffix === candidate || suffix.startsWith(`${candidate}-`));",
    "  const date = parseDate(timestamp);",
    "  return slug && date ? { timestamp, targetSlug: slug, date } : null;",
    "}",
    "const currentInfo = parseName(path.basename(current));",
    "if (!currentInfo) throw new Error(`invalid current backup name: ${path.basename(current)}`);",
    "const cutoff = cutoffDate(currentInfo.timestamp);",
    "const latest = new Map();",
    "const parsed = [];",
    "for (const name of fs.readdirSync(root)) {",
    "  const full = path.join(root, name);",
    "  if (!fs.statSync(full).isDirectory()) continue;",
    "  const info = parseName(name);",
    "  if (!info) continue;",
    "  parsed.push({ full, info });",
    "  if (info.date < cutoff) continue;",
    "  const key = `${info.targetSlug}\\t${info.date}`;",
    "  const prev = latest.get(key);",
    "  if (!prev || info.timestamp > prev.info.timestamp) latest.set(key, { full, info });",
    "}",
    "const keep = new Set([current, ...Array.from(latest.values()).map((item) => item.full)]);",
    "for (const item of parsed) {",
    "  if (keep.has(item.full)) continue;",
    "  fs.rmSync(item.full, { recursive: true, force: true });",
    "  console.log(item.full);",
    "}",
    "NODE",
  ].join("\n");
  const result = runSudo("/bin/sh", ["-c", script], password);
  const pruned = String(result.stdout || "").trim().split(/\r?\n/).filter(Boolean);
  return {
    type: "deploy-backup-retention-prune",
    status: 0,
    retentionDays: Math.floor(retentionDays),
    dailyLatestPerTarget: true,
    root: backupRoot,
    prunedCount: pruned.length,
    pruned: pruned.slice(0, 80),
  };
}

function installRootOwnedTextFile(targetPath, text, password, mode = "644", owner = "root:wheel") {
  const tempPath = path.join(os.tmpdir(), `home-ai-deploy-${process.pid}-${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(tempPath, text, { encoding: "utf8", mode: 0o600 });
  try {
    runSudo("/usr/bin/install", ["-m", mode, "-o", owner.split(":")[0], "-g", owner.split(":")[1] || "wheel", tempPath, targetPath], password);
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch (_err) {
      // Best effort cleanup only.
    }
  }
}

function plistBuddySetEnv(plistPath, key, value, password) {
  const replaceResult = spawnSync("/usr/bin/sudo", [
    ...(password ? ["-S", "-p", ""] : ["-n"]),
    "/usr/bin/plutil",
    "-replace",
    `EnvironmentVariables.${key}`,
    "-string",
    String(value),
    plistPath,
  ], {
    input: password ? `${password}\n` : "",
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (replaceResult.status === 0) return;
  runSudo("/usr/bin/plutil", [
    "-insert",
    `EnvironmentVariables.${key}`,
    "-string",
    String(value),
    plistPath,
  ], password);
}

function plistBuddyReadEnv(plistPath, key, password) {
  try {
    const result = runSudo("/usr/libexec/PlistBuddy", ["-c", `Print :EnvironmentVariables:${key}`, plistPath], password);
    return String(result.stdout || "").trim();
  } catch (_err) {
    return "";
  }
}

function plistBuddySetEnvIfChanged(plistPath, key, value, password) {
  const current = plistBuddyReadEnv(plistPath, key, password);
  const next = String(value || "");
  if (current === next) return false;
  plistBuddySetEnv(plistPath, key, next, password);
  return true;
}

function runtimeConfigGatewayWorkerEnvRows(macRoot) {
  const runtimeConfigPath = posixJoin(macRoot, "data", "runtime-config.json");
  let parsed = {};
  try {
    parsed = JSON.parse(fs.readFileSync(runtimeConfigPath, "utf8"));
  } catch (_err) {
    return {};
  }
  const settings = parsed?.gatewayWorkerSettings || parsed?.gateway_worker_settings || {};
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {};
  const rows = {};
  for (const definition of HOME_AI_GATEWAY_WORKER_RUNTIME_SETTING_ENVS) {
    const snakeKey = definition.key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    const raw = Object.prototype.hasOwnProperty.call(settings, definition.key)
      ? settings[definition.key]
      : settings[snakeKey];
    if (raw === undefined || raw === null || raw === "") continue;
    const number = Number(raw);
    if (!Number.isFinite(number) || number < 0) continue;
    const normalized = String(Math.floor(number));
    rows[definition.mobileEnv] = normalized;
    rows[definition.webEnv] = normalized;
  }
  return rows;
}

function installHomeAiListenerVoiceInputEnv(plan, password) {
  if (plan.target !== "home-ai" || plan.surface === "static") return null;
  const plistPath = `/Library/LaunchDaemons/${HOME_AI_LISTENER_LABEL}.plist`;
  runSudo("/bin/test", ["-f", plistPath], password);
  const pluginWorkspaceAuditTargets = buildPluginWorkspaceAuditTargetJson(plan.macRoot);
  const gatewayWorkerRuntimeRows = runtimeConfigGatewayWorkerEnvRows(plan.macRoot);
  const rows = {
    ...gatewayWorkerRuntimeRows,
    HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_TARGETS: pluginWorkspaceAuditTargets,
    HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_TARGETS: pluginWorkspaceAuditTargets,
    HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_ENABLED: HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_ENABLED,
    HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_ENABLED: HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_ENABLED,
    HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_COMMAND: HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_COMMAND,
    HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_COMMAND: HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_COMMAND,
    HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_MODEL: HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_MODEL,
    HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_MODEL: HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_MODEL,
    HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_HOME: HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_HOME,
    HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_HOME: HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_HOME,
    HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_TIMEOUT_MS: HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_TIMEOUT_MS,
    HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_TIMEOUT_MS: HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_TIMEOUT_MS,
    CODEX_MOBILE_BASE_URL: "http://127.0.0.1:8787",
    CODEX_MOBILE_KEY_FILE: posixJoin(plan.macRoot, "data", "secrets", "codex-mobile-access-key.secret"),
    HERMES_MOBILE_VOICE_INPUT_ENABLED: "1",
    HERMES_MOBILE_VOICE_INPUT_ASR_BACKEND: HOME_AI_VOICE_INPUT_ASR_BACKEND,
    HERMES_MOBILE_VOICE_INPUT_ASR_PROTOCOL: HOME_AI_VOICE_INPUT_ASR_PROTOCOL,
    HERMES_MOBILE_VOICE_INPUT_ASR_URL: HOME_AI_VOICE_INPUT_ASR_URL,
    HERMES_MOBILE_VOICE_INPUT_ASR_TIMEOUT_MS: "240000",
    HERMES_MOBILE_VOICE_INPUT_STREAMING_ENABLED: "1",
    HERMES_MOBILE_VOICE_INPUT_STREAMING_URL: HOME_AI_VOICE_INPUT_STREAMING_URL,
    HERMES_MOBILE_VOICE_INPUT_STREAMING_SAMPLE_RATE: "16000",
    HERMES_MOBILE_VOICE_INPUT_STREAMING_TIMEOUT_MS: "240000",
    HERMES_MOBILE_VOICE_INPUT_COMPARE_BACKENDS: HOME_AI_VOICE_INPUT_COMPARE_BACKENDS,
    HERMES_MOBILE_VOICE_INPUT_COMPARE_TIMEOUT_MS: "240000",
    HERMES_MOBILE_VOICE_INPUT_COMPARE_MAX_ENGINES: "3",
    HERMES_MOBILE_VOICE_INPUT_LANGUAGE: HOME_AI_VOICE_INPUT_LANGUAGE,
    HERMES_MOBILE_VOICE_INPUT_TASK: HOME_AI_VOICE_INPUT_TASK,
    HERMES_MOBILE_VOICE_INPUT_INITIAL_PROMPT: HOME_AI_VOICE_INPUT_INITIAL_PROMPT,
    HERMES_MOBILE_VOICE_INPUT_CONDITION_ON_PREVIOUS_TEXT: "1",
    HERMES_MOBILE_VOICE_INPUT_VAD_FILTER: "0",
    HERMES_WEB_VOICE_INPUT_ENABLED: "1",
    HERMES_WEB_VOICE_INPUT_ASR_BACKEND: HOME_AI_VOICE_INPUT_ASR_BACKEND,
    HERMES_WEB_VOICE_INPUT_ASR_PROTOCOL: HOME_AI_VOICE_INPUT_ASR_PROTOCOL,
    HERMES_WEB_VOICE_INPUT_ASR_URL: HOME_AI_VOICE_INPUT_ASR_URL,
    HERMES_WEB_VOICE_INPUT_ASR_TIMEOUT_MS: "240000",
    HERMES_WEB_VOICE_INPUT_STREAMING_ENABLED: "1",
    HERMES_WEB_VOICE_INPUT_STREAMING_URL: HOME_AI_VOICE_INPUT_STREAMING_URL,
    HERMES_WEB_VOICE_INPUT_STREAMING_SAMPLE_RATE: "16000",
    HERMES_WEB_VOICE_INPUT_STREAMING_TIMEOUT_MS: "240000",
    HERMES_WEB_VOICE_INPUT_COMPARE_BACKENDS: HOME_AI_VOICE_INPUT_COMPARE_BACKENDS,
    HERMES_WEB_VOICE_INPUT_COMPARE_TIMEOUT_MS: "240000",
    HERMES_WEB_VOICE_INPUT_COMPARE_MAX_ENGINES: "3",
    HERMES_WEB_VOICE_INPUT_LANGUAGE: HOME_AI_VOICE_INPUT_LANGUAGE,
    HERMES_WEB_VOICE_INPUT_TASK: HOME_AI_VOICE_INPUT_TASK,
    HERMES_WEB_VOICE_INPUT_INITIAL_PROMPT: HOME_AI_VOICE_INPUT_INITIAL_PROMPT,
    HERMES_WEB_VOICE_INPUT_CONDITION_ON_PREVIOUS_TEXT: "1",
    HERMES_WEB_VOICE_INPUT_VAD_FILTER: "0",
    HOMEAI_TTS_PROVIDER: HOME_AI_TTS_PROVIDER,
    HOMEAI_TTS_COSYVOICE_PYTHON: HOME_AI_TTS_COSYVOICE_PYTHON,
    HOMEAI_TTS_COSYVOICE_SCRIPT: HOME_AI_TTS_COSYVOICE_SCRIPT,
    HOMEAI_TTS_COSYVOICE_REPO_DIR: HOME_AI_TTS_COSYVOICE_REPO_DIR,
    HOMEAI_TTS_COSYVOICE_MODEL_DIR: HOME_AI_TTS_COSYVOICE_MODEL_DIR,
    HOMEAI_TTS_COSYVOICE_CACHE_DIR: HOME_AI_TTS_COSYVOICE_CACHE_DIR,
    HOMEAI_TTS_COSYVOICE_PROMPT_AUDIO: HOME_AI_TTS_COSYVOICE_PROMPT_AUDIO,
    HOMEAI_TTS_COSYVOICE_PROMPT_TEXT: HOME_AI_TTS_COSYVOICE_PROMPT_TEXT,
    HOMEAI_TTS_COSYVOICE_MODE: HOME_AI_TTS_COSYVOICE_MODE,
    HOMEAI_TTS_COSYVOICE_INSTRUCTION: HOME_AI_TTS_COSYVOICE_INSTRUCTION,
    HOMEAI_TTS_COSYVOICE_SPEAKER: HOME_AI_TTS_COSYVOICE_SPEAKER,
    HOMEAI_TTS_COSYVOICE_TIMEOUT_MS: HOME_AI_TTS_COSYVOICE_TIMEOUT_MS,
  };
  for (const [key, value] of Object.entries(rows)) plistBuddySetEnv(plistPath, key, value, password);
  runSudo("/usr/bin/plutil", ["-lint", plistPath], password);
  return {
    type: "home-ai-listener-runtime-env",
    label: HOME_AI_LISTENER_LABEL,
    plistPath,
    backend: HOME_AI_VOICE_INPUT_ASR_BACKEND,
    protocol: HOME_AI_VOICE_INPUT_ASR_PROTOCOL,
    url: HOME_AI_VOICE_INPUT_ASR_URL,
    ttsProvider: HOME_AI_TTS_PROVIDER,
    ttsCosyVoiceConfigured: Boolean(HOME_AI_TTS_COSYVOICE_PYTHON && HOME_AI_TTS_COSYVOICE_SCRIPT && HOME_AI_TTS_COSYVOICE_MODEL_DIR),
    gatewayWorkerRuntimeSettingCount: Object.keys(gatewayWorkerRuntimeRows).length / 2,
    pluginWorkspaceAuditTargetCount: Object.keys(HOME_AI_PLUGIN_WORKSPACE_AUDIT_TARGETS).length,
    pluginWorkspaceAuditCodexEnabled: HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_ENABLED,
  };
}

function readGatewayManifestForCronProfiles(manifestPath, password) {
  const command = `if test -r ${shQuote(manifestPath)}; then /bin/cat ${shQuote(manifestPath)}; else printf '%s\\n' '{"workers":[]}'; fi`;
  const result = runSudo("/bin/sh", ["-c", command], password);
  try {
    return JSON.parse(result.stdout || "{\"workers\":[]}");
  } catch (_err) {
    throw new Error("cron_profile_manifest_invalid");
  }
}

function applyAclOnce(targetPath, acl, password, recursive = false) {
  const command = recursive
    ? [
      `test -e ${shQuote(targetPath)} || exit 0`,
      `/usr/bin/find -P ${shQuote(targetPath)} -mindepth 0 ! -type l -exec /bin/chmod -a ${shQuote(acl)} {} + >/dev/null 2>&1 || true`,
      `/usr/bin/find -P ${shQuote(targetPath)} -mindepth 0 ! -type l -exec /bin/chmod +a ${shQuote(acl)} {} +`,
    ].join("\n")
    : [
      `test -e ${shQuote(targetPath)} || exit 0`,
      `/bin/chmod -a ${shQuote(acl)} ${shQuote(targetPath)} >/dev/null 2>&1 || true`,
      `/bin/chmod +a ${shQuote(acl)} ${shQuote(targetPath)}`,
    ].join("\n");
  runSudo("/bin/sh", ["-c", command], password);
}

function applyAclIfExists(targetPath, acl, password, recursive = false) {
  const command = recursive
    ? [
      `if test -e ${shQuote(targetPath)}; then`,
      `  /usr/bin/find -P ${shQuote(targetPath)} -mindepth 0 ! -type l -exec /bin/chmod -a ${shQuote(acl)} {} + >/dev/null 2>&1 || true`,
      `  /usr/bin/find -P ${shQuote(targetPath)} -mindepth 0 ! -type l -exec /bin/chmod +a ${shQuote(acl)} {} +`,
      "fi",
    ].join("\n")
    : [
      `if test -e ${shQuote(targetPath)}; then`,
      `  /bin/chmod -a ${shQuote(acl)} ${shQuote(targetPath)} >/dev/null 2>&1 || true`,
      `  /bin/chmod +a ${shQuote(acl)} ${shQuote(targetPath)}`,
      "fi",
    ].join("\n");
  runSudo("/bin/sh", ["-c", command], password);
}

function installHomeAiCronProfileAliases(plan, password) {
  if (plan.target !== "home-ai" || plan.surface === "static") return null;
  const aliasPlan = buildHomeAiCronProfileAliasPlan(
    plan.macRoot,
    readGatewayManifestForCronProfiles(gatewayPoolManifestPath(plan.macRoot), password),
  );
  const owner = `${PRODUCTION_SERVICE_USER}:${PRODUCTION_SERVICE_GROUP}`;

  runSudo("/bin/mkdir", ["-p", aliasPlan.profilesRoot], password);
  runSudo("/usr/sbin/chown", [owner, aliasPlan.profilesRoot], password);
  runSudo("/bin/chmod", ["700", aliasPlan.profilesRoot], password);

  const installed = [];
  for (const alias of aliasPlan.aliases) {
    runSudo("/bin/test", ["-d", alias.sourceDir], password);
    for (const ancestor of alias.ancestorDirs || []) {
      applyAclOnce(ancestor, HOME_AI_CRON_PROFILE_TRAVERSE_ACL, password, false);
    }
    applyAclOnce(alias.sourceDir, HOME_AI_CRON_PROFILE_READ_ACL, password, true);
    for (const bindingDir of alias.pluginBindingDirs || []) {
      applyAclIfExists(bindingDir, HOME_AI_CRON_PROFILE_READ_ACL, password, true);
    }
    const command = [
      `if test -e ${shQuote(alias.aliasPath)} || test -L ${shQuote(alias.aliasPath)}; then`,
      `  if test -L ${shQuote(alias.aliasPath)}; then /bin/rm -f ${shQuote(alias.aliasPath)}; else echo ${shQuote(`cron_profile_alias_conflict:${alias.profile}`)} >&2; exit 47; fi`,
      "fi",
      `/bin/ln -s ${shQuote(alias.sourceDir)} ${shQuote(alias.aliasPath)}`,
      `/usr/sbin/chown -h ${shQuote(owner)} ${shQuote(alias.aliasPath)}`,
    ].join("\n");
    runSudo("/bin/sh", ["-c", command], password);
    installed.push(alias.profile);
  }
  return {
    type: "home-ai-cron-profile-aliases",
    manifestPath: aliasPlan.manifestPath,
    profilesRoot: aliasPlan.profilesRoot,
    profileCount: installed.length,
    profiles: installed,
  };
}

function installHomeAiVisualAnalysisProfile(plan, password) {
  if (plan.target !== "home-ai" || plan.surface === "static") return null;
  const profile = safeProfileId(HOME_AI_VISUAL_ANALYSIS_PROFILE);
  const sourceProfile = safeProfileId(HOME_AI_VISUAL_ANALYSIS_SOURCE_PROFILE);
  if (!profile || !sourceProfile || profile === sourceProfile) return null;
  const manifest = readGatewayManifestForCronProfiles(gatewayPoolManifestPath(plan.macRoot), password);
  const sourceDir = findCronProfileSourceDir(manifest, sourceProfile, plan.macRoot)
    || `/Users/example/path`;
  const targetDir = posixJoin(path.posix.dirname(sourceDir), profile);
  const aliasPath = posixJoin(homeAiCronPaths(plan.macRoot).hermesHome, "profiles", profile);
  const owner = "hm-owner:staff";
  const serviceOwner = `${PRODUCTION_SERVICE_USER}:${PRODUCTION_SERVICE_GROUP}`;

  runSudo("/bin/test", ["-d", sourceDir], password);
  runSudo("/bin/mkdir", ["-p", targetDir], password);
  const linkScript = [
    "set -eu",
    `src=${shQuote(sourceDir)}`,
    `dst=${shQuote(targetDir)}`,
    'for item in "$src"/* "$src"/.[!.]* "$src"/..?*; do',
    '  test -e "$item" || continue',
    '  name="${item##*/}"',
    '  case "$name" in .|..|config.yaml) continue ;; esac',
    '  target="$dst/$name"',
    '  if test -L "$target" && test "$(/bin/readlink "$target")" = "$item"; then continue; fi',
    '  /bin/rm -rf "$target"',
    '  /bin/ln -s "$item" "$target"',
    "done",
  ].join("\n");
  runSudo("/bin/sh", ["-c", linkScript], password);

  const sourceConfig = String(runSudo("/bin/cat", [posixJoin(sourceDir, "config.yaml")], password).stdout || "");
  const config = buildHomeAiVisualAnalysisProfileConfig(sourceConfig);
  installRootOwnedTextFile(posixJoin(targetDir, "config.yaml"), config, password, "600", owner);
  runSudo("/usr/sbin/chown", ["-h", owner, targetDir], password);
  applyAclOnce(targetDir, HOME_AI_CRON_PROFILE_READ_ACL, password, true);
  for (const ancestor of profileSourceAncestorDirs(targetDir)) {
    applyAclOnce(ancestor, HOME_AI_CRON_PROFILE_TRAVERSE_ACL, password, false);
  }
  for (const bindingDir of cronProfilePluginBindingDirs(sourceDir)) {
    applyAclIfExists(bindingDir, HOME_AI_CRON_PROFILE_READ_ACL, password, true);
  }

  const aliasCommand = [
    `if test -e ${shQuote(aliasPath)} || test -L ${shQuote(aliasPath)}; then`,
    `  if test -L ${shQuote(aliasPath)}; then /bin/rm -f ${shQuote(aliasPath)}; else echo ${shQuote(`cron_profile_alias_conflict:${profile}`)} >&2; exit 47; fi`,
    "fi",
    `/bin/ln -s ${shQuote(targetDir)} ${shQuote(aliasPath)}`,
    `/usr/sbin/chown -h ${shQuote(serviceOwner)} ${shQuote(aliasPath)}`,
  ].join("\n");
  runSudo("/bin/sh", ["-c", aliasCommand], password);
  return {
    type: "home-ai-visual-analysis-profile",
    profile,
    sourceProfile,
    sourceDir,
    targetDir,
    aliasPath,
    model: HOME_AI_VISUAL_ANALYSIS_MODEL,
    provider: HOME_AI_VISUAL_ANALYSIS_PROVIDER,
    reasoningEffort: HOME_AI_VISUAL_ANALYSIS_REASONING_EFFORT,
  };
}

function installHomeAiCronBuiltinSkills(plan, password) {
  if (plan.target !== "home-ai" || plan.surface === "static") return null;
  const sourceRoot = posixJoin(plan.productionPath, "skills", "productivity");
  const targetRoot = posixJoin(plan.macRoot, "data", "hermes-home", "skills", "productivity");
  const sharedTargetRoot = posixJoin(plan.macRoot, "data", "skill-profiles", "shared-global", "skills", "productivity");
  const listing = runSudo("/bin/bash", ["-lc", `if test -d ${shQuote(sourceRoot)}; then find ${shQuote(sourceRoot)} -mindepth 1 -maxdepth 1 -type d -print; fi`], password);
  const skillDirs = String(listing.stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  runSudo("/bin/mkdir", ["-p", targetRoot], password);
  let installed = 0;
  let sharedInstalled = 0;
  for (const sourceDir of skillDirs) {
    const name = path.posix.basename(sourceDir);
    if (!SAFE_PROFILE_ID_PATTERN.test(name)) continue;
    const targetDir = posixJoin(targetRoot, name);
    runSudo("/bin/mkdir", ["-p", targetDir], password);
    runSudo("/usr/bin/rsync", ["-a", `${sourceDir}/`, `${targetDir}/`], password);
    installed += 1;
    if (HOME_AI_SHARED_BUILTIN_SKILLS.includes(name)) {
      const sharedTargetDir = posixJoin(sharedTargetRoot, name);
      runSudo("/bin/mkdir", ["-p", sharedTargetDir], password);
      runSudo("/usr/bin/rsync", ["-a", `${sourceDir}/`, `${sharedTargetDir}/`], password);
      sharedInstalled += 1;
    }
  }
  if (installed) {
    const skillRoot = posixJoin(plan.macRoot, "data", "hermes-home", "skills");
    runSudo("/usr/sbin/chown", ["-R", `${PRODUCTION_SERVICE_USER}:${PRODUCTION_SERVICE_GROUP}`, skillRoot], password);
    runSudo("/bin/chmod", ["-R", "u+rwX,g+rX,o-rwx", skillRoot], password);
  }
  if (sharedInstalled) {
    const sharedSkillRoot = posixJoin(plan.macRoot, "data", "skill-profiles", "shared-global", "skills");
    runSudo("/usr/sbin/chown", ["-R", `${PRODUCTION_SERVICE_USER}:${PRODUCTION_SERVICE_GROUP}`, sharedSkillRoot], password);
    runSudo("/bin/chmod", ["-R", "u+rwX,g+rX,o-rwx", sharedSkillRoot], password);
  }
  return {
    type: "home-ai-cron-builtin-skills",
    sourceRoot,
    targetRoot,
    installed,
    sharedTargetRoot,
    sharedInstalled,
  };
}

function installHomeAiCronRuntimeScripts(plan, password) {
  if (plan.target !== "home-ai" || plan.surface === "static") return null;
  const sourceScript = posixJoin(plan.productionPath, "scripts", "homeai-disaster-backup-cron.sh");
  const sourceSelfLoopScript = posixJoin(plan.productionPath, "scripts", "homeai-self-improving-loop-cron.sh");
  const sourcePluginDailyRollupScript = posixJoin(plan.productionPath, "scripts", "plugin-daily-progress-rollup-cron.sh");
  const sourceCodexMobilePrAutomationScript = posixJoin(plan.productionPath, "scripts", "codex-mobile-pr-automation-cron.sh");
  const sourceVisualScript = posixJoin(plan.productionPath, "scripts", "homeai-visual-polish-audit-cron.sh");
  const sourceDriftAuditScript = posixJoin(plan.productionPath, "scripts", "homeai-production-drift-audit-watchdog.sh");
  const targetRoot = posixJoin(plan.macRoot, "data", "hermes-home", "scripts");
  const targetScript = posixJoin(targetRoot, "homeai-disaster-backup-cron.sh");
  const targetSelfLoopScript = posixJoin(targetRoot, "homeai-self-improving-loop-cron.sh");
  const targetPluginDailyRollupScript = posixJoin(targetRoot, "plugin-daily-progress-rollup-cron.sh");
  const targetCodexMobilePrAutomationScript = posixJoin(targetRoot, "codex-mobile-pr-automation-cron.sh");
  const targetDriftAuditScript = posixJoin(targetRoot, "homeai-production-drift-audit-watchdog.sh");
  const visualScripts = [
    "homeai-visual-polish-host.sh",
    "homeai-visual-polish-music.sh",
    "homeai-visual-polish-finance.sh",
    "homeai-visual-polish-wardrobe.sh",
    "homeai-visual-polish-global.sh",
    "homeai-visual-polish-core.sh",
  ];
  runSudo("/bin/mkdir", ["-p", targetRoot], password);
  runSudo("/usr/bin/install", [
    "-m",
    "750",
    "-o",
    PRODUCTION_SERVICE_USER,
    "-g",
    PRODUCTION_SERVICE_GROUP,
    sourceScript,
    targetScript,
  ], password);
  runSudo("/usr/bin/install", [
    "-m",
    "750",
    "-o",
    PRODUCTION_SERVICE_USER,
    "-g",
    PRODUCTION_SERVICE_GROUP,
    sourceSelfLoopScript,
    targetSelfLoopScript,
  ], password);
  runSudo("/usr/bin/install", [
    "-m",
    "750",
    "-o",
    PRODUCTION_SERVICE_USER,
    "-g",
    PRODUCTION_SERVICE_GROUP,
    sourcePluginDailyRollupScript,
    targetPluginDailyRollupScript,
  ], password);
  runSudo("/usr/bin/install", [
    "-m",
    "750",
    "-o",
    PRODUCTION_SERVICE_USER,
    "-g",
    PRODUCTION_SERVICE_GROUP,
    sourceCodexMobilePrAutomationScript,
    targetCodexMobilePrAutomationScript,
  ], password);
  runSudo("/usr/bin/install", [
    "-m",
    "750",
    "-o",
    PRODUCTION_SERVICE_USER,
    "-g",
    PRODUCTION_SERVICE_GROUP,
    sourceDriftAuditScript,
    targetDriftAuditScript,
  ], password);
  for (const name of visualScripts) {
    runSudo("/usr/bin/install", [
      "-m",
      "750",
      "-o",
      PRODUCTION_SERVICE_USER,
      "-g",
      PRODUCTION_SERVICE_GROUP,
      sourceVisualScript,
      posixJoin(targetRoot, name),
    ], password);
  }
  return {
    type: "home-ai-cron-runtime-scripts",
    sourceScript,
    targetRoot,
    installed: [
      "homeai-disaster-backup-cron.sh",
      "homeai-self-improving-loop-cron.sh",
      "plugin-daily-progress-rollup-cron.sh",
      "codex-mobile-pr-automation-cron.sh",
      "homeai-production-drift-audit-watchdog.sh",
      ...visualScripts,
    ],
  };
}

function isPausedCronJob(job = {}) {
  return Boolean(
    job
    && (
      job.enabled === false
      || String(job.state || "").toLowerCase() === "paused"
      || Boolean(job.paused_at)
    ),
  );
}

function cronJobScheduleStateForUpsert(base = {}, nextRunAt = "") {
  if (isPausedCronJob(base)) {
    return {
      enabled: false,
      state: "paused",
      paused_at: base.paused_at || null,
      paused_reason: base.paused_reason || null,
      next_run_at: null,
    };
  }
  return {
    enabled: true,
    state: "scheduled",
    paused_at: null,
    paused_reason: null,
    next_run_at: base.next_run_at || nextRunAt,
  };
}

function installCodexMobilePrAutomationCronJob(plan, password) {
  if (plan.target !== "home-ai" || plan.surface === "static") return null;
  const node = posixJoin(plan.macRoot, PINNED_NODE);
  const jobsPath = posixJoin(plan.macRoot, "data", "hermes-home", "cron", "jobs.json");
  const job = {
    id: "codex_mobile_pr_automation_hourly",
    name: "Codex Mobile PR Automation",
    script: "codex-mobile-pr-automation-cron.sh",
    schedule: "0 * * * *",
    firstDelayMinutes: 7,
  };
  const script = `
const fs = require("fs");
const path = ${JSON.stringify(jobsPath)};
const item = ${JSON.stringify(job)};
const now = Date.now();
const doc = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, "utf8")) : { jobs: [] };
if (!Array.isArray(doc.jobs)) doc.jobs = [];
function nextRun(minutes) {
  return new Date(now + minutes * 60000).toISOString();
}
const isPausedCronJob = ${isPausedCronJob.toString()};
const cronJobScheduleStateForUpsert = ${cronJobScheduleStateForUpsert.toString()};
const existing = doc.jobs.find((entry) => entry && entry.id === item.id);
const base = existing || {};
const configured = Object.assign({}, base, {
  id: item.id,
  name: item.name,
  prompt: "Home AI Owner hourly Codex Mobile PR automation planner no_agent script job. Resolves the planner from Codex Mobile origin/main or a clean source worktree, writes bounded state, and plans next task-card actions only.",
  skills: [],
  skill: null,
  model: null,
  provider: null,
  base_url: null,
  script: item.script,
  no_agent: true,
  profile: null,
  owner_principal_id: "owner",
  access_policy_context: null,
  context_from: null,
  schedule: { kind: "cron", expr: item.schedule, display: item.schedule },
  schedule_display: item.schedule,
  repeat: base.repeat && typeof base.repeat === "object" ? base.repeat : { times: null, completed: 0 },
  created_at: base.created_at || new Date(now).toISOString(),
  last_run_at: base.last_run_at || null,
  last_status: base.last_status || null,
  last_error: base.last_error || null,
  last_delivery_error: base.last_delivery_error || null,
  deliver: "local",
  origin: null,
  enabled_toolsets: [],
  workdir: null,
  updated_at: new Date(now).toISOString(),
}, cronJobScheduleStateForUpsert(base, nextRun(item.firstDelayMinutes)));
const index = doc.jobs.findIndex((entry) => entry && entry.id === item.id);
if (index >= 0) doc.jobs[index] = configured;
else doc.jobs.push(configured);
fs.mkdirSync(require("path").dirname(path), { recursive: true });
const tmp = path + ".tmp";
fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + "\\n", { encoding: "utf8", mode: 0o600 });
fs.renameSync(tmp, path);
fs.chmodSync(path, 0o600);
console.log(JSON.stringify({ ok: true, action: existing ? "updated" : "created", jobCount: doc.jobs.length }));
`;
  const result = runSudo(node, ["-e", script], password);
  runSudo("/usr/sbin/chown", [`${PRODUCTION_SERVICE_USER}:${PRODUCTION_SERVICE_GROUP}`, jobsPath], password);
  runSudo("/bin/chmod", ["600", jobsPath], password);
  let action = "unknown";
  let jobCount = 0;
  try {
    const parsed = JSON.parse(result.stdout || "{}");
    action = parsed.action || action;
    jobCount = Number(parsed.jobCount || 0);
  } catch (_) {
    action = "unknown";
  }
  return {
    type: "codex-mobile-pr-automation-cron-job",
    id: job.id,
    script: job.script,
    schedule: job.schedule,
    action,
    jobCount,
  };
}

function installPluginDailyProgressRollupCronJob(plan, password) {
  if (plan.target !== "home-ai" || plan.surface === "static") return null;
  const node = posixJoin(plan.macRoot, PINNED_NODE);
  const jobsPath = posixJoin(plan.macRoot, "data", "hermes-home", "cron", "jobs.json");
  const job = {
    id: "plugin_daily_progress_rollup",
    name: "插件每日进展汇总",
    script: "plugin-daily-progress-rollup-cron.sh",
    schedule: "30 23 * * *",
    firstDelayMinutes: 5,
  };
  const script = `
const fs = require("fs");
const path = ${JSON.stringify(jobsPath)};
const item = ${JSON.stringify(job)};
const now = Date.now();
const doc = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, "utf8")) : { jobs: [] };
if (!Array.isArray(doc.jobs)) doc.jobs = [];
function nextRun(minutes) {
  return new Date(now + minutes * 60000).toISOString();
}
const existing = doc.jobs.find((entry) => entry && entry.id === item.id);
const base = existing || {};
const configured = Object.assign({}, base, {
  id: item.id,
  name: item.name,
  prompt: "Home AI platform plugin daily progress rollup no_agent script job. Dispatches bounded plugin summary cards and generates the Owner-visible overall governance report.",
  skills: [],
  skill: null,
  model: null,
  provider: null,
  base_url: null,
  script: item.script,
  no_agent: true,
  profile: null,
  owner_principal_id: "owner",
  access_policy_context: null,
  context_from: null,
  schedule: { kind: "cron", expr: item.schedule, display: item.schedule },
  schedule_display: item.schedule,
  repeat: base.repeat && typeof base.repeat === "object" ? base.repeat : { times: null, completed: 0 },
  enabled: true,
  state: "scheduled",
  paused_at: null,
  paused_reason: null,
  created_at: base.created_at || new Date(now).toISOString(),
  next_run_at: base.next_run_at || nextRun(item.firstDelayMinutes),
  last_run_at: base.last_run_at || null,
  last_status: base.last_status || null,
  last_error: base.last_error || null,
  last_delivery_error: base.last_delivery_error || null,
  deliver: "local",
  origin: null,
  enabled_toolsets: [],
  workdir: null,
  updated_at: new Date(now).toISOString(),
});
const index = doc.jobs.findIndex((entry) => entry && entry.id === item.id);
if (index >= 0) doc.jobs[index] = configured;
else doc.jobs.push(configured);
fs.mkdirSync(require("path").dirname(path), { recursive: true });
const tmp = path + ".tmp";
fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + "\\n", { encoding: "utf8", mode: 0o600 });
fs.renameSync(tmp, path);
fs.chmodSync(path, 0o600);
console.log(JSON.stringify({ ok: true, action: existing ? "updated" : "created", jobCount: doc.jobs.length }));
`;
  const result = runSudo(node, ["-e", script], password);
  runSudo("/usr/sbin/chown", [`${PRODUCTION_SERVICE_USER}:${PRODUCTION_SERVICE_GROUP}`, jobsPath], password);
  runSudo("/bin/chmod", ["600", jobsPath], password);
  let action = "unknown";
  let jobCount = 0;
  try {
    const parsed = JSON.parse(result.stdout || "{}");
    action = parsed.action || action;
    jobCount = Number(parsed.jobCount || 0);
  } catch (_) {
    action = "unknown";
  }
  return {
    type: "plugin-daily-progress-rollup-cron-job",
    id: job.id,
    script: job.script,
    schedule: job.schedule,
    action,
    jobCount,
  };
}

function installHomeAiSelfImprovingLoopCronJob(plan, password) {
  if (plan.target !== "home-ai" || plan.surface === "static") return null;
  const node = posixJoin(plan.macRoot, PINNED_NODE);
  const jobsPath = posixJoin(plan.macRoot, "data", "hermes-home", "cron", "jobs.json");
  const job = {
    id: "homeai_self_improving_loop",
    name: "Home AI 自我改进闭环",
    script: "homeai-self-improving-loop-cron.sh",
    schedule: "17 4 * * *",
    firstDelayMinutes: 2,
  };
  const script = `
const fs = require("fs");
const path = ${JSON.stringify(jobsPath)};
const item = ${JSON.stringify(job)};
const now = Date.now();
const doc = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, "utf8")) : { jobs: [] };
if (!Array.isArray(doc.jobs)) doc.jobs = [];
function nextRun(minutes) {
  return new Date(now + minutes * 60000).toISOString();
}
const existing = doc.jobs.find((entry) => entry && entry.id === item.id);
const base = existing || {};
const configured = Object.assign({}, base, {
  id: item.id,
  name: item.name,
  prompt: "Home AI platform self-improving loop no_agent script job. Collects bounded self-check observations, submits eligible diagnostics, and sends audit request cards.",
  skills: [],
  skill: null,
  model: null,
  provider: null,
  base_url: null,
  script: item.script,
  no_agent: true,
  profile: null,
  owner_principal_id: "owner",
  access_policy_context: null,
  context_from: null,
  schedule: { kind: "cron", expr: item.schedule, display: item.schedule },
  schedule_display: item.schedule,
  repeat: base.repeat && typeof base.repeat === "object" ? base.repeat : { times: null, completed: 0 },
  enabled: true,
  state: "scheduled",
  paused_at: null,
  paused_reason: null,
  created_at: base.created_at || new Date(now).toISOString(),
  next_run_at: base.next_run_at || nextRun(item.firstDelayMinutes),
  last_run_at: base.last_run_at || null,
  last_status: base.last_status || null,
  last_error: base.last_error || null,
  last_delivery_error: base.last_delivery_error || null,
  deliver: "local",
  origin: null,
  enabled_toolsets: [],
  workdir: null,
  updated_at: new Date(now).toISOString(),
});
const index = doc.jobs.findIndex((entry) => entry && entry.id === item.id);
if (index >= 0) doc.jobs[index] = configured;
else doc.jobs.push(configured);
fs.mkdirSync(require("path").dirname(path), { recursive: true });
const tmp = path + ".tmp";
fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + "\\n", { encoding: "utf8", mode: 0o600 });
fs.renameSync(tmp, path);
fs.chmodSync(path, 0o600);
console.log(JSON.stringify({ ok: true, action: existing ? "updated" : "created", jobCount: doc.jobs.length }));
`;
  const result = runSudo(node, ["-e", script], password);
  runSudo("/usr/sbin/chown", [`${PRODUCTION_SERVICE_USER}:${PRODUCTION_SERVICE_GROUP}`, jobsPath], password);
  runSudo("/bin/chmod", ["600", jobsPath], password);
  let action = "unknown";
  let jobCount = 0;
  try {
    const parsed = JSON.parse(result.stdout || "{}");
    action = parsed.action || action;
    jobCount = Number(parsed.jobCount || 0);
  } catch (_) {
    action = "unknown";
  }
  return {
    type: "home-ai-self-improving-loop-cron-job",
    id: job.id,
    script: job.script,
    schedule: job.schedule,
    action,
    jobCount,
  };
}

function installHomeAiVisualPolishCronJobs(plan, password) {
  if (plan.target !== "home-ai" || plan.surface === "static") return null;
  const node = posixJoin(plan.macRoot, PINNED_NODE);
  const jobsPath = posixJoin(plan.macRoot, "data", "hermes-home", "cron", "jobs.json");
  const visualJobIds = [
    "homeai_visual_host",
    "homeai_visual_music",
    "homeai_visual_finance",
    "homeai_visual_wardrobe",
    "homeai_visual_global_interactions",
    "homeai_visual_core",
    "homeai_visual_analysis_xhigh",
  ];
  const installEnabled = /^(1|true|yes|on)$/i.test(String(process.env.HOMEAI_INSTALL_VISUAL_POLISH_CRON_JOBS || ""));
  if (!installEnabled) {
    const script = `
const fs = require("fs");
const path = ${JSON.stringify(jobsPath)};
const visualJobIds = new Set(${JSON.stringify(visualJobIds)});
const doc = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, "utf8")) : { jobs: [] };
const before = Array.isArray(doc.jobs) ? doc.jobs.length : 0;
doc.jobs = Array.isArray(doc.jobs) ? doc.jobs.filter((job) => !visualJobIds.has(String(job && job.id || ""))) : [];
const removed = before - doc.jobs.length;
if (removed > 0 || !fs.existsSync(path)) {
  fs.mkdirSync(require("path").dirname(path), { recursive: true });
  const tmp = path + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + "\\n", { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, path);
  fs.chmodSync(path, 0o600);
}
console.log(JSON.stringify({ ok: true, installEnabled: false, removed }));
`;
    const result = runSudo(node, ["-e", script], password);
    runSudo("/usr/sbin/chown", [`${PRODUCTION_SERVICE_USER}:${PRODUCTION_SERVICE_GROUP}`, jobsPath], password);
    runSudo("/bin/chmod", ["600", jobsPath], password);
    let removed = 0;
    try {
      removed = Number(JSON.parse(result.stdout || "{}").removed || 0);
    } catch (_) {
      removed = 0;
    }
    return {
      type: "home-ai-visual-polish-cron-jobs",
      installEnabled: false,
      skipped: true,
      removed,
      env: "HOMEAI_INSTALL_VISUAL_POLISH_CRON_JOBS",
    };
  }
  const jobs = [
    {
      id: "homeai_visual_host",
      name: "Home AI 视觉核验 - Host 交互",
      script: "homeai-visual-polish-host.sh",
      schedule: "15 */2 * * *",
      firstDelayMinutes: 8,
    },
    {
      id: "homeai_visual_music",
      name: "Home AI 视觉核验 - Music 插件",
      script: "homeai-visual-polish-music.sh",
      schedule: "35 */3 * * *",
      firstDelayMinutes: 16,
    },
    {
      id: "homeai_visual_finance",
      name: "Home AI 视觉核验 - Finance 插件",
      script: "homeai-visual-polish-finance.sh",
      schedule: "55 */4 * * *",
      firstDelayMinutes: 24,
    },
    {
      id: "homeai_visual_wardrobe",
      name: "Home AI 视觉核验 - Wardrobe 插件",
      script: "homeai-visual-polish-wardrobe.sh",
      schedule: "25 */4 * * *",
      firstDelayMinutes: 32,
    },
    {
      id: "homeai_visual_global_interactions",
      name: "Home AI 视觉核验 - 全局交互综合",
      script: "homeai-visual-polish-global.sh",
      schedule: "5 */6 * * *",
      firstDelayMinutes: 36,
    },
    {
      id: "homeai_visual_core",
      name: "Home AI 视觉核验 - Core 插件",
      script: "homeai-visual-polish-core.sh",
      schedule: "45 2 * * *",
      firstDelayMinutes: 40,
    },
    {
      id: "homeai_visual_analysis_xhigh",
      name: "Home AI 视觉核验 - 高推理分析",
      schedule: "20 */6 * * *",
      firstDelayMinutes: 48,
      profile: HOME_AI_VISUAL_ANALYSIS_PROFILE,
      model: HOME_AI_VISUAL_ANALYSIS_MODEL,
      provider: HOME_AI_VISUAL_ANALYSIS_PROVIDER,
      enabledToolsets: ["file", "vision", "video"],
      prompt: [
        "你是 Home AI 视觉核验高推理分析任务，运行在 Home AI 官方 Automation/CRON 内。",
        "读取 /Users/example/path 下最近 24 小时或最近 5 次视觉核验摘要、report.json、summary.md 和可用截图/视频证据。",
        "用高推理模型区分真实 UI/交互回归、测试环境问题、旧客户端缓存问题、目标线程自引用跳过，以及插件自身失败。",
        "输出简洁中文 Markdown：总体结论、真实失败、证据路径、建议负责面、下一步修复卡片内容要点。",
        "不要启动 Codex CLI，不要修改文件，不要部署，不要打印 secrets、token、完整日志或大段原始 report。",
      ].join("\\n"),
    },
  ];
  const script = `
const fs = require("fs");
const path = ${JSON.stringify(jobsPath)};
const jobsToUpsert = ${JSON.stringify(jobs)};
const now = Date.now();
const doc = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, "utf8")) : { jobs: [] };
if (!Array.isArray(doc.jobs)) doc.jobs = [];
function nextRun(minutes) {
  return new Date(now + minutes * 60000).toISOString();
}
for (const item of jobsToUpsert) {
  const existing = doc.jobs.find((job) => job && job.id === item.id);
  const base = existing || {};
  const isScriptJob = Boolean(item.script);
  const job = Object.assign({}, base, {
    id: item.id,
    name: item.name,
    prompt: item.prompt || "Home AI visual verification no_agent script job. Only captures UI/interaction evidence and sends visual repair task cards through Codex Mobile.",
    skills: item.skills || [],
    skill: null,
    model: item.model || null,
    provider: item.provider || null,
    base_url: null,
    script: item.script || null,
    no_agent: isScriptJob,
    profile: item.profile || null,
    owner_principal_id: "owner",
    access_policy_context: null,
    context_from: null,
    schedule: { kind: "cron", expr: item.schedule, display: item.schedule },
    schedule_display: item.schedule,
    repeat: base.repeat && typeof base.repeat === "object" ? base.repeat : { times: null, completed: 0 },
    enabled: true,
    state: "scheduled",
    paused_at: null,
    paused_reason: null,
    created_at: base.created_at || new Date(now).toISOString(),
    next_run_at: base.next_run_at || nextRun(item.firstDelayMinutes),
    last_run_at: base.last_run_at || null,
    last_status: base.last_status || null,
    last_error: base.last_error || null,
    last_delivery_error: base.last_delivery_error || null,
    deliver: "local",
    origin: null,
    enabled_toolsets: item.enabledToolsets || [],
    workdir: null,
    updated_at: new Date(now).toISOString(),
  });
  const index = doc.jobs.findIndex((entry) => entry && entry.id === item.id);
  if (index >= 0) doc.jobs[index] = job;
  else doc.jobs.push(job);
}
fs.mkdirSync(require("path").dirname(path), { recursive: true });
const tmp = path + ".tmp";
fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + "\\n", { encoding: "utf8", mode: 0o600 });
fs.renameSync(tmp, path);
fs.chmodSync(path, 0o600);
`;
  runSudo(node, ["-e", script], password);
  runSudo("/usr/sbin/chown", [`${PRODUCTION_SERVICE_USER}:${PRODUCTION_SERVICE_GROUP}`, jobsPath], password);
  runSudo("/bin/chmod", ["600", jobsPath], password);
  return {
    type: "home-ai-visual-polish-cron-jobs",
    jobs: jobs.map((item) => ({
      id: item.id,
      script: item.script || null,
      profile: item.profile || null,
      model: item.model || null,
      schedule: item.schedule,
    })),
  };
}

function installHomeAiVisualPolishTaskCardConfig(plan, password) {
  if (plan.target !== "home-ai" || plan.surface === "static") return null;
  const node = posixJoin(plan.macRoot, PINNED_NODE);
  const configPath = posixJoin(plan.macRoot, "data", "visual-polish-task-cards.json");
  const defaultJobs = {
    "global-interactions": {
      scope: "all",
      pluginIds: ["finance"],
      scenarios: ["global-plugin-dock-gesture-stability", "plugin-drawer-action-gestures"],
    },
  };
  const script = `
const fs = require("fs");
const configPath = ${JSON.stringify(configPath)};
const defaultJobs = ${JSON.stringify(defaultJobs)};
const doc = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new Error("visual_polish_config_must_be_object");
if (!doc.jobs || typeof doc.jobs !== "object" || Array.isArray(doc.jobs)) doc.jobs = {};
for (const [key, value] of Object.entries(defaultJobs)) {
  doc.jobs[key] = Object.assign({}, value, doc.jobs[key] && typeof doc.jobs[key] === "object" && !Array.isArray(doc.jobs[key]) ? doc.jobs[key] : {});
}
fs.mkdirSync(require("path").dirname(configPath), { recursive: true });
const tmp = configPath + ".tmp";
fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + "\\n", { encoding: "utf8", mode: 0o600 });
fs.renameSync(tmp, configPath);
fs.chmodSync(configPath, 0o600);
`;
  runSudo(node, ["-e", script], password);
  runSudo("/usr/sbin/chown", [`${PRODUCTION_SERVICE_USER}:${PRODUCTION_SERVICE_GROUP}`, configPath], password);
  runSudo("/bin/chmod", ["600", configPath], password);
  return {
    type: "home-ai-visual-polish-task-card-config",
    configPath,
    jobs: Object.keys(defaultJobs),
  };
}

function shouldRepairCodexSharedAuthPermissions(plan = {}) {
  return Boolean(plan && !plan.syncOnly);
}

function repairCodexSharedAuthPermissions(plan, password) {
  if (!shouldRepairCodexSharedAuthPermissions(plan)) return null;
  const manifestPath = posixJoin(plan.macRoot, "data", "gateway-pool-manifest-mac.json");
  const sharedAuthRoot = posixJoin(plan.macRoot, "gateway-worker", "telemetry", "profiles", "shared-auth");
  const script = `
set -e
manifest=${shQuote(manifestPath)}
shared=${shQuote(sharedAuthRoot)}
if [ ! -f "$manifest" ] || [ ! -d "$shared" ]; then
  printf '{"ok":true,"skipped":true,"reason":"manifest_or_shared_auth_missing","userCount":0}\\n'
  exit 0
fi
users=$(${shQuote(posixJoin(plan.macRoot, PINNED_NODE))} -e 'const fs=require("fs"); const manifest=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const users=[...new Set((manifest.workers||[]).filter((w)=>String(w.provider||"openai-codex").trim()==="openai-codex").map((w)=>String(w.osUser||"").trim()).filter(Boolean))]; process.stdout.write(users.join("\\n"));' "$manifest")
for f in "$shared/auth.json" "$shared/auth.lock"; do
  [ -e "$f" ] || continue
  /usr/sbin/chgrp hermes-workers "$f" 2>/dev/null || true
  /bin/chmod 660 "$f" 2>/dev/null || true
done
/usr/sbin/chgrp hermes-workers "$shared" 2>/dev/null || true
/bin/chmod 770 "$shared" 2>/dev/null || true
count=0
while IFS= read -r user; do
  [ -n "$user" ] || continue
  count=$((count + 1))
  /bin/chmod +a "user:$user allow list,add_file,search,delete_child,readattr,writeattr,readextattr,writeextattr,readsecurity,file_inherit,directory_inherit" "$shared" 2>/dev/null || true
  for f in "$shared/auth.json" "$shared/auth.lock"; do
    [ -e "$f" ] || continue
    /bin/chmod +a "user:$user allow read,write,append,readattr,writeattr,readextattr,writeextattr,readsecurity" "$f" 2>/dev/null || true
  done
done <<USERS
$users
USERS
printf '{"ok":true,"skipped":false,"userCount":%s}\\n' "$count"
`;
  const result = runSudo("/bin/bash", ["-lc", script], password);
  return {
    type: "codex-shared-auth-permissions-repair",
    target: plan.target,
    status: result.status,
    stdout: String(result.stdout || "").slice(0, 400),
  };
}

function installHomeAiVisualDebugLaunchAgent(plan, password) {
  if (plan.target !== "home-ai" || plan.surface === "static") return null;
  const paths = homeAiVisualDebugPaths(plan.macRoot);
  const plist = buildHomeAiVisualDebugLaunchAgentPlist(plan.macRoot);
  const owner = `${paths.user}:${PRODUCTION_SERVICE_GROUP}`;

  runSudo("/bin/mkdir", ["-p", path.posix.dirname(paths.plistPath), paths.logsRoot], password);
  runSudo("/usr/sbin/chown", ["-R", owner, path.posix.dirname(paths.plistPath), paths.logsRoot], password);
  installRootOwnedTextFile(paths.plistPath, plist, password, "644", owner);
  runSudo("/usr/bin/plutil", ["-lint", paths.plistPath], password);

  const userIdResult = runSudo("/usr/bin/id", ["-u", paths.user], password);
  const userId = String(userIdResult.stdout || "").trim();
  const launchResult = runSudo("/bin/bash", ["-lc", [
    "set +e",
    `uid=${shQuote(userId)}`,
    `plist=${shQuote(paths.plistPath)}`,
    `label=${shQuote(HOME_AI_VISUAL_DEBUG_LABEL)}`,
    `/bin/launchctl bootout "gui/$uid" "$plist" >/dev/null 2>&1`,
    `/bin/launchctl bootstrap "gui/$uid" "$plist" >/dev/null 2>&1`,
    "bootstrap_status=$?",
    `/bin/launchctl kickstart -k "gui/$uid/$label" >/dev/null 2>&1`,
    "kickstart_status=$?",
    `printf '{"bootstrapStatus":%s,"kickstartStatus":%s}\\n' "$bootstrap_status" "$kickstart_status"`,
    "exit 0",
  ].join("\n")], password);
  return {
    type: "home-ai-visual-debug-launch-agent-install",
    label: HOME_AI_VISUAL_DEBUG_LABEL,
    user: paths.user,
    userId,
    plistPath: paths.plistPath,
    port: HOME_AI_VISUAL_DEBUG_PORT,
    stdout: String(launchResult.stdout || "").trim().slice(0, 400),
  };
}

function installHomeAiCronLaunchd(plan, password) {
  if (plan.target !== "home-ai") return null;
  const paths = homeAiCronPaths(plan.macRoot);
  const owner = `${PRODUCTION_SERVICE_USER}:${PRODUCTION_SERVICE_GROUP}`;
  const plist = buildHomeAiCronLaunchdPlist(plan.macRoot);

  runSudo("/bin/mkdir", ["-p", paths.cronRoot, paths.outputRoot, paths.runLogRoot, path.posix.dirname(paths.stdoutLog)], password);
  runSudo("/bin/sh", ["-c", `test -f ${shQuote(paths.jobsPath)} || printf '%s\\n' '{"jobs":[]}' > ${shQuote(paths.jobsPath)}`], password);
  runSudo("/usr/sbin/chown", ["-R", "-h", owner, paths.hermesHome], password);
  runSudo("/bin/chmod", ["700", paths.hermesHome, paths.cronRoot, paths.outputRoot, paths.runLogRoot], password);
  runSudo("/bin/chmod", ["600", paths.jobsPath], password);
  runSudo("/usr/bin/touch", [paths.stdoutLog, paths.stderrLog], password);
  runSudo("/usr/sbin/chown", [owner, paths.stdoutLog, paths.stderrLog], password);
  runSudo("/bin/chmod", ["640", paths.stdoutLog, paths.stderrLog], password);
  installRootOwnedTextFile(paths.plistPath, plist, password, "644", "root:wheel");
  runSudo("/usr/bin/plutil", ["-lint", paths.plistPath], password);
  const reload = reloadSystemLaunchdService(HOME_AI_CRON_LABEL, paths.plistPath, password);
  return {
    type: "home-ai-cron-launchd-install",
    label: HOME_AI_CRON_LABEL,
    plistPath: paths.plistPath,
    jobsPath: paths.jobsPath,
    startIntervalSeconds: HOME_AI_CRON_START_INTERVAL_SECONDS,
    reload,
  };
}

function installHomeAiBridgeHostLaunchd(plan, password) {
  if (plan.target !== "home-ai") return null;
  const paths = homeAiBridgeHostPaths(plan.macRoot);
  const owner = `${PRODUCTION_SERVICE_USER}:${PRODUCTION_SERVICE_GROUP}`;
  const plist = buildHomeAiBridgeHostLaunchdPlist(plan.macRoot);

  runSudo("/bin/mkdir", ["-p", paths.cronRoot, paths.outputRoot, paths.runLogRoot, path.posix.dirname(paths.stdoutLog)], password);
  runSudo("/bin/sh", ["-c", `test -f ${shQuote(paths.jobsPath)} || printf '%s\\n' '{"jobs":[]}' > ${shQuote(paths.jobsPath)}`], password);
  runSudo("/usr/sbin/chown", ["-R", "-h", owner, paths.hermesHome], password);
  runSudo("/bin/chmod", ["700", paths.hermesHome, paths.cronRoot, paths.outputRoot, paths.runLogRoot], password);
  runSudo("/bin/chmod", ["600", paths.jobsPath], password);
  runSudo("/usr/bin/touch", [paths.stdoutLog, paths.stderrLog], password);
  runSudo("/usr/sbin/chown", [owner, paths.stdoutLog, paths.stderrLog], password);
  runSudo("/bin/chmod", ["640", paths.stdoutLog, paths.stderrLog], password);
  installRootOwnedTextFile(paths.plistPath, plist, password, "644", "root:wheel");
  runSudo("/usr/bin/plutil", ["-lint", paths.plistPath], password);
  const reload = reloadSystemLaunchdService(HOME_AI_BRIDGE_HOST_LABEL, paths.plistPath, password);
  return {
    type: "home-ai-bridge-host-launchd-install",
    label: HOME_AI_BRIDGE_HOST_LABEL,
    plistPath: paths.plistPath,
    port: HOME_AI_BRIDGE_HOST_PORT,
    reload,
  };
}

function installHomeAiNasBackupMountLaunchd(plan, password) {
  if (plan.target !== "home-ai" || plan.surface === "static") return null;
  const paths = homeAiNasBackupMountPaths(plan.macRoot);
  const plist = buildHomeAiNasBackupMountLaunchdPlist(plan.macRoot);

  runSudo("/bin/mkdir", ["-p", path.posix.dirname(paths.stdoutLog)], password);
  runSudo("/usr/bin/touch", [paths.stdoutLog, paths.stderrLog], password);
  runSudo("/usr/sbin/chown", ["root:wheel", paths.stdoutLog, paths.stderrLog], password);
  runSudo("/bin/chmod", ["640", paths.stdoutLog, paths.stderrLog], password);
  runSudo("/bin/chmod", ["755", paths.mountScript], password);
  installRootOwnedTextFile(paths.plistPath, plist, password, "644", "root:wheel");
  runSudo("/usr/bin/plutil", ["-lint", paths.plistPath], password);
  const reload = reloadSystemLaunchdService(HOME_AI_NAS_BACKUP_MOUNT_LABEL, paths.plistPath, password);
  const kickstart = runSudoAllowFailure("/bin/launchctl", ["kickstart", "-k", `system/${HOME_AI_NAS_BACKUP_MOUNT_LABEL}`], password);
  return {
    type: "home-ai-nas-backup-mount-launchd-install",
    label: HOME_AI_NAS_BACKUP_MOUNT_LABEL,
    plistPath: paths.plistPath,
    startIntervalSeconds: HOME_AI_NAS_BACKUP_MOUNT_START_INTERVAL_SECONDS,
    reload,
    kickstartStatus: Number(kickstart.status || 0),
    kickstartWarning: kickstart.status === 0 ? "" : cleanString(kickstart.stderr || "nas_backup_mount_kickstart_failed", 200),
  };
}

function installHomeAiProductionDriftAuditLaunchd(plan, password) {
  if (plan.target !== "home-ai" || plan.surface === "static") return null;
  const paths = homeAiProductionDriftAuditPaths(plan.macRoot);
  const plist = buildHomeAiProductionDriftAuditLaunchdPlist(plan.macRoot);

  runSudo("/bin/mkdir", ["-p", paths.outputDir, path.posix.dirname(paths.stdoutLog)], password);
  runSudo("/usr/sbin/chown", [`${PRODUCTION_SERVICE_USER}:${PRODUCTION_SERVICE_GROUP}`, paths.outputDir], password);
  runSudo("/bin/chmod", ["750", paths.outputDir], password);
  runSudo("/usr/bin/touch", [paths.stdoutLog, paths.stderrLog], password);
  runSudo("/usr/sbin/chown", ["root:wheel", paths.stdoutLog, paths.stderrLog], password);
  runSudo("/bin/chmod", ["640", paths.stdoutLog, paths.stderrLog], password);
  runSudo("/bin/chmod", ["755", paths.script], password);
  installRootOwnedTextFile(paths.plistPath, plist, password, "644", "root:wheel");
  runSudo("/usr/bin/plutil", ["-lint", paths.plistPath], password);
  const reload = reloadSystemLaunchdService(HOME_AI_PRODUCTION_DRIFT_AUDIT_LABEL, paths.plistPath, password);
  const kickstart = runSudoAllowFailure("/bin/launchctl", ["kickstart", "-k", `system/${HOME_AI_PRODUCTION_DRIFT_AUDIT_LABEL}`], password);
  return {
    type: "home-ai-production-drift-audit-launchd-install",
    label: HOME_AI_PRODUCTION_DRIFT_AUDIT_LABEL,
    plistPath: paths.plistPath,
    startIntervalSeconds: HOME_AI_PRODUCTION_DRIFT_AUDIT_START_INTERVAL_SECONDS,
    outputDir: paths.outputDir,
    reload,
    kickstartStatus: Number(kickstart.status || 0),
    kickstartWarning: kickstart.status === 0 ? "" : cleanString(kickstart.stderr || "production_drift_audit_kickstart_failed", 200),
  };
}

function repairHomeAiBackupArtifactAcls(plan, password) {
  if (plan.target !== "home-ai" || plan.surface === "static") return null;
  const artifactsRoot = posixJoin(plan.macRoot, "data", "artifacts");
  const script = `
set -e
root=${shQuote(artifactsRoot)}
if [ ! -d "$root" ]; then
  printf '{"ok":true,"skipped":true,"reason":"artifacts_root_missing"}\\n'
  exit 0
fi
/bin/chmod +a ${shQuote(HOME_AI_BACKUP_ARTIFACT_READ_ACL)} "$root" 2>/dev/null || true
updated=0
while IFS= read -r entry; do
  [ -n "$entry" ] || continue
  /bin/chmod +a ${shQuote(HOME_AI_BACKUP_ARTIFACT_READ_ACL)} "$entry" 2>/dev/null || true
  updated=$((updated + 1))
done <<ENTRIES
$(/usr/bin/find "$root" -mindepth 1 2>/dev/null)
ENTRIES
printf '{"ok":true,"skipped":false,"updated":%s}\\n' "$updated"
`;
  const result = runSudo("/bin/bash", ["-lc", script], password);
  return {
    type: "home-ai-backup-artifact-acl-repair",
    status: result.status,
    stdout: String(result.stdout || "").slice(0, 400),
  };
}

function repairHomeAiBackupGatewayTelemetryAcls(plan, password) {
  if (plan.target !== "home-ai" || plan.surface === "static") return null;
  const telemetryRoot = posixJoin(plan.macRoot, "gateway-worker", "telemetry");
  applyAclIfExists(telemetryRoot, HOME_AI_BACKUP_GATEWAY_TELEMETRY_READ_ACL, password, true);
  return {
    type: "home-ai-backup-gateway-telemetry-acl-repair",
    status: 0,
    telemetryRoot,
  };
}

function repairHomeAiBackupDeployStateAcls(plan, password) {
  if (plan.target !== "home-ai" || plan.surface === "static") return null;
  const deployStateRoot = posixJoin(plan.macRoot, "data", "deploy-state");
  applyAclIfExists(deployStateRoot, HOME_AI_BACKUP_ARTIFACT_READ_ACL, password, true);
  return {
    type: "home-ai-backup-deploy-state-acl-repair",
    status: 0,
    deployStateRoot,
  };
}

function repairGatewayStartScriptBridgeEnv(plan, password) {
  if (plan.target !== "home-ai" || plan.surface !== "full") return null;
  const node = path.join(plan.macRoot, PINNED_NODE);
  const script = path.join(plan.productionPath, "scripts", "macos-gateway-start-script-bridge-env-repair.js");
  const result = runSudo(node, [script, "--root", plan.macRoot, "--execute", "--json"], password);
  return {
    type: "home-ai-gateway-start-script-bridge-env-repair",
    status: result.status,
    stdout: String(result.stdout || "").slice(0, 1600),
  };
}

function reconcileHomeAiProductionDrift(plan, password) {
  if (plan.target !== "home-ai" || plan.surface !== "full") return null;
  const node = path.join(plan.macRoot, PINNED_NODE);
  const script = path.join(plan.productionPath, "scripts", "macos-production-drift-reconcile.js");
  const result = runSudo(node, [script, "--root", plan.macRoot, "--execute", "--json"], password);
  return {
    type: "home-ai-production-drift-reconcile",
    status: result.status,
    stdout: String(result.stdout || "").slice(0, 1600),
  };
}

function sleepMs(ms) {
  if (!ms) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function shouldRetryValidation(type) {
  return type === "home-ai-status-smoke" || type === "health-url";
}

function redactSensitiveOutput(value = "") {
  return String(value || "")
    .replace(/((?:[A-Z0-9_]+_)?WORKSPACE_KEY_HASHES_JSON\s*=>\s*)\{[^\n]*\}/g, "$1[redacted]")
    .replace(/(<key>(?:[A-Z0-9_]+_)?WORKSPACE_KEY_HASHES_JSON<\/key>\s*<string>)([^<]*)(<\/string>)/g, "$1[redacted]$3");
}

function cleanString(value = "", limit = 240) {
  return redactSensitiveOutput(value)
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, limit);
}

function runValidation(check, password, options) {
  const [command, ...args] = check.command;
  const maxAttempts = shouldRetryValidation(check.type) ? options.validationRetries : 1;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = runSudo(command, args, password);
      return {
        type: check.type,
        status: result.status,
        attempt,
        stdout: redactSensitiveOutput(result.stdout).slice(0, 1600),
      };
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) sleepMs(options.validationDelayMs);
    }
  }
  throw lastError;
}

function validationIssuePrefixes(check, fallbackPrefix = "") {
  const prefixes = Array.isArray(check.failOnIssuePrefixes)
    ? check.failOnIssuePrefixes
    : (check.failOnIssuePrefix ? [check.failOnIssuePrefix] : []);
  return prefixes.map((item) => String(item || "").trim()).filter(Boolean).concat(
    prefixes.length ? [] : (fallbackPrefix ? [fallbackPrefix] : []),
  );
}

function runIssuePrefixAuditValidation(check, password, fallbackPrefix = "") {
  const [command, ...args] = check.command;
  const result = runSudo(command, args, password);
  let audit = null;
  try {
    audit = JSON.parse(result.stdout || "{}");
  } catch (_err) {
    throw new Error(`${check.type}_json_invalid`);
  }
  const issues = Array.isArray(audit.issues) ? audit.issues.map((item) => String(item || "")).filter(Boolean) : [];
  const prefixes = validationIssuePrefixes(check, fallbackPrefix);
  const blockingIssues = check.failOnAnyIssue
    ? issues
    : issues.filter((item) => prefixes.some((prefix) => item.startsWith(prefix)));
  if (blockingIssues.length) {
    const err = new Error(`${check.type}_failed:${blockingIssues.slice(0, 20).join(",")}`);
    err.stderr = `blockingIssues=${blockingIssues.length}`;
    throw err;
  }
  return {
    type: check.type,
    status: result.status,
    auditOk: Boolean(audit.ok),
    issueCount: issues.length,
    blockingIssueCount: 0,
    failOnAnyIssue: Boolean(check.failOnAnyIssue),
    failOnIssuePrefixes: prefixes,
  };
}

function runOwner3aQualityEvidenceSeedValidation(check, plan, password) {
  const node = posixJoin(plan.macRoot, PINNED_NODE);
  const appDir = plan.productionPath;
  const outputFile = check.outputFile || posixJoin(plan.macRoot, OWNER_3A_QUALITY_EVIDENCE_SEED.relativePath);
  const owner = `${PRODUCTION_SERVICE_USER}:${PRODUCTION_SERVICE_GROUP}`;
  const script = `
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const [node, appDir, outputFile, owner] = process.argv.slice(1);
const env = Object.assign({}, process.env, {
  HERMES_SELF_LOOP_SUBMIT_DIAGNOSTICS: "0",
  HERMES_SELF_LOOP_CREATE_AUDIT_CARDS: "0",
});
const seedTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-owner-3a-quality-evidence."));
fs.chmodSync(seedTempDir, 0o700);
const seedTempFile = path.join(seedTempDir, "owner-3a-quality-evidence.json");
function cleanChildOutput(value) {
  return String(value || "")
    .replace(/((?:token|secret|key|password)(?:["'\\s:=]+))[^"'\\s,}]+/gi, "$1<redacted>")
    .replace(/[\\r\\n\\t ]+/g, " ")
    .trim()
    .slice(0, 600);
}
function boundedToken(value) {
  return String(value || "").replace(/[^A-Za-z0-9_.:-]+/g, "_").slice(0, 120);
}
function run(args, options = {}) {
  const result = spawnSync(node, args, {
    cwd: appDir,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    env,
  });
  if (result.status !== 0 && options.allowFailure !== true) {
    const code = path.basename(String(args[0] || "command")).replace(/[^A-Za-z0-9_.:-]+/g, "_");
    throw new Error(code + "_failed:" + cleanChildOutput(result.stderr || result.stdout || ""));
  }
  return result.stdout || "{}";
}
function mustRun(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    const code = path.basename(command).replace(/[^A-Za-z0-9_.:-]+/g, "_");
    throw new Error(code + "_failed");
  }
}
const outputDir = path.dirname(outputFile);
const canary = run([path.join(appDir, "scripts", "homeai-install-upgrade-canary.js"), "--json"]);
const plugin = run([path.join(appDir, "scripts", "plugin-action-metadata-closure-smoke.js"), "--json"]);
const loop = run([
  path.join(appDir, "scripts", "homeai-self-improving-loop.js"),
  "--collect-production-observations",
  "--skip-status-smoke",
  "--skip-system-resource-status",
  "--skip-cron-audit",
  "--skip-production-diagnostics",
  "--skip-public-upgrade-rehearsal",
  "--skip-runtime-slo-audit",
  "--skip-mcp-schema-closure",
  "--skip-thread-liveness",
  "--skip-plugin-manifest-health",
  "--skip-notification-delivery",
  "--skip-native-bridge-capability",
  "--gateway-capability-availability-json",
  JSON.stringify({ ok: true, skipped: true, reason: "gateway_document_tool_capability_seed_skipped" }),
  "--install-upgrade-canary-json",
  canary,
  "--plugin-action-metadata-closure-json",
  plugin,
  "--quality-evidence-output",
  seedTempFile,
  "--json",
], { allowFailure: true });
const payload = JSON.parse(loop || "{}");
const saved = JSON.parse(fs.readFileSync(seedTempFile, "utf8"));
const diagnosticEvents = Array.isArray(payload.evaluation?.diagnosticEvents) ? payload.evaluation.diagnosticEvents : [];
const evaluatedSignals = Array.isArray(payload.evaluation?.signals) ? payload.evaluation.signals : [];
const summary = {
  ok: payload.qualityEvidenceOutputWritten === true,
  selfLoopOk: payload.ok === true,
  evidenceVersion: String(saved.evidenceVersion || ""),
  status: String(saved.status || ""),
  noCompletionClaim: saved.policy && saved.policy.noCompletionClaim === true,
  installUpgradeCanaryObservedStatus: String(saved.extraEvidence?.installUpgradeCanaryObservedStatus || ""),
  installUpgradeCanaryMode: String(saved.extraEvidence?.installUpgradeCanary?.mode || ""),
  cleanInstallCanaryStatus: String(saved.extraEvidence?.cleanInstallCanaryStatus || ""),
  diagnosticEventCount: diagnosticEvents.length,
  diagnosticEventCodes: diagnosticEvents
    .map((item) => boundedToken(item?.errorCode || item?.error_code || item?.category || item?.signalId))
    .filter(Boolean)
    .slice(0, 5),
  nonOkSignals: evaluatedSignals
    .filter((signal) => signal && signal.status && signal.status !== "ok")
    .map((signal) => ({
      id: boundedToken(signal.id || signal.signalId),
      status: boundedToken(signal.status),
      errorCode: boundedToken(signal.errorCode),
    }))
    .slice(0, 5),
  outputWritten: payload.qualityEvidenceOutputWritten === true,
};
if (
  !summary.ok
  || summary.evidenceVersion !== "20260701-owner-3a-quality-evidence-v2"
  || !["ok", "partial", "warning", "degraded", "blocked", "stale", "unknown"].includes(summary.status)
  || summary.noCompletionClaim !== true
  || summary.installUpgradeCanaryObservedStatus !== "partial"
  || summary.installUpgradeCanaryMode !== "plan"
  || summary.cleanInstallCanaryStatus
  || summary.diagnosticEventCount !== 0
) {
  throw new Error("owner_3a_quality_evidence_seed_invariant_failed:" + JSON.stringify(summary));
}
fs.mkdirSync(outputDir, { recursive: true });
fs.copyFileSync(seedTempFile, outputFile);
mustRun("/usr/sbin/chown", [owner, outputDir, outputFile]);
mustRun("/bin/chmod", ["700", outputDir]);
mustRun("/bin/chmod", ["600", outputFile]);
try {
  fs.rmSync(seedTempDir, { recursive: true, force: true });
} catch (_) {
  // Best-effort cleanup; the production evidence file has already been installed.
}
console.log(JSON.stringify(summary));
`;
  const result = runSudo(node, ["-e", script, node, appDir, outputFile, owner], password);
  let summary = null;
  try {
    summary = JSON.parse(result.stdout || "{}");
  } catch (_err) {
    throw new Error("owner_3a_quality_evidence_seed_json_invalid");
  }
  if (summary.ok !== true) throw new Error("owner_3a_quality_evidence_seed_failed");
  return {
    type: OWNER_3A_QUALITY_EVIDENCE_SEED.type,
    status: result.status,
    outputFile: compactProductionPath(outputFile, plan.macRoot),
    evidenceVersion: summary.evidenceVersion || "",
    qualityEvidenceStatus: summary.status || "",
    selfLoopOk: summary.selfLoopOk === true,
    noCompletionClaim: summary.noCompletionClaim === true,
    installUpgradeCanaryObservedStatus: summary.installUpgradeCanaryObservedStatus || "",
    installUpgradeCanaryMode: summary.installUpgradeCanaryMode || "",
    cleanInstallCanaryStatus: summary.cleanInstallCanaryStatus || "",
    diagnosticEventCount: Number(summary.diagnosticEventCount || 0),
    diagnosticEventCodes: boundedStringArray(summary.diagnosticEventCodes, 5),
    nonOkSignals: Array.isArray(summary.nonOkSignals) ? summary.nonOkSignals.slice(0, 5) : [],
  };
}

function boundedStringArray(value, limit = 20) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit);
}

function boundedJobNames(value, limit = 20) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return item;
    return item?.name || item?.id || item?.job || "";
  }).map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit);
}

function finiteNumber(value, defaultValue = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : defaultValue;
}

function collectCodexMobileListenerStartupIssueCodes(payload = {}) {
  const explicit = [
    ...boundedStringArray(payload.actionableIssueCodes),
    ...boundedStringArray(payload.issueCodes),
    ...boundedStringArray(payload.blockingIssueCodes),
  ];
  const issueCodes = Array.isArray(payload.issues)
    ? payload.issues.map((item) => item?.code || item?.issueCode || item?.id || "").filter(Boolean)
    : [];
  return [...new Set(explicit.concat(issueCodes).map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 20);
}

function codexMobileListenerStartupGateSummary(payload = {}, status = 0) {
  const jobs = payload.jobs && typeof payload.jobs === "object" ? payload.jobs : {};
  const gate = payload.gate && typeof payload.gate === "object" ? payload.gate : {};
  const issueCodes = collectCodexMobileListenerStartupIssueCodes(Object.assign({}, payload, {
    actionableIssueCodes: payload.actionableIssueCodes || gate.actionableIssueCodes,
    issueCodes: payload.issueCodes || gate.issueCodes,
    blockingIssueCodes: payload.blockingIssueCodes || gate.blockingIssueCodes,
  }));
  const executionFailureCount = finiteNumber(
    payload.executionFailureCount ?? gate.executionFailureCount ?? payload.executionFailures?.length,
    0,
  );
  return {
    type: CODEX_MOBILE_LISTENER_STARTUP_GATE.type,
    status,
    ok: payload.ok === true,
    deployPass: (payload.deployPass ?? gate.deployPass) === true,
    browserStartupOnly: payload.browserStartupOnly !== false,
    browserMode: String(payload.browserMode || "full"),
    issueCount: finiteNumber(payload.issueCount ?? gate.issueCount ?? payload.issues?.length, 0),
    blockingIssueCount: finiteNumber(payload.blockingIssueCount ?? gate.blockingIssueCount ?? payload.blockingIssues?.length, 0),
    executionFailureCount,
    actionableIssueCodes: issueCodes,
    enabledJobs: boundedJobNames(payload.enabledJobs || jobs.enabled || gate.checkNames),
    skippedJobs: boundedJobNames(payload.skippedJobs || jobs.skipped),
    clientBuildId: String(payload.clientBuildId || payload.publicConfig?.clientBuildId || ""),
    shellCacheName: String(payload.shellCacheName || payload.publicConfig?.shellCacheName || ""),
  };
}

function codexMobileBehaviorGateSummary(payload = {}, status = 0, check = {}) {
  const jobs = payload.jobs && typeof payload.jobs === "object" ? payload.jobs : {};
  const gate = payload.gate && typeof payload.gate === "object" ? payload.gate : {};
  const issueCodes = collectCodexMobileListenerStartupIssueCodes(Object.assign({}, payload, {
    actionableIssueCodes: payload.actionableIssueCodes || gate.actionableIssueCodes,
    issueCodes: payload.issueCodes || gate.issueCodes,
    blockingIssueCodes: payload.blockingIssueCodes || gate.blockingIssueCodes,
  }));
  const executionFailureCount = finiteNumber(
    payload.executionFailureCount ?? gate.executionFailureCount ?? payload.executionFailures?.length,
    0,
  );
  return {
    type: CODEX_MOBILE_BEHAVIOR_GATE.type,
    status,
    ok: payload.ok === true,
    deployPass: (payload.deployPass ?? gate.deployPass) === true,
    browserStartupOnly: payload.browserStartupOnly === true,
    browserMode: String(payload.browserMode || "full"),
    issueCount: finiteNumber(payload.issueCount ?? gate.issueCount ?? payload.issues?.length, 0),
    blockingIssueCount: finiteNumber(payload.blockingIssueCount ?? gate.blockingIssueCount ?? payload.blockingIssues?.length, 0),
    executionFailureCount,
    actionableIssueCodes: issueCodes,
    enabledJobs: boundedJobNames(payload.enabledJobs || jobs.enabled || gate.checkNames),
    skippedJobs: boundedJobNames(payload.skippedJobs || jobs.skipped),
    clientBuildId: String(payload.clientBuildId || payload.publicConfig?.clientBuildId || ""),
    shellCacheName: String(payload.shellCacheName || payload.publicConfig?.shellCacheName || ""),
    submitExercise: check.submitExercise || {},
  };
}

function assertCodexMobileListenerStartupGatePass(summary = {}) {
  if (summary.status === 0 && summary.ok === true && summary.deployPass === true) return;
  const code = summary.actionableIssueCodes?.[0]
    || (summary.executionFailureCount > 0 ? "browser_startup_smoke_unavailable" : "")
    || "codex_mobile_listener_startup_gate_failed";
  const err = new Error(`${CODEX_MOBILE_LISTENER_STARTUP_GATE.type}_failed:${code}`);
  err.status = summary.status;
  err.stderr = JSON.stringify({
    ok: Boolean(summary.ok),
    deployPass: Boolean(summary.deployPass),
    issueCount: summary.issueCount,
    blockingIssueCount: summary.blockingIssueCount,
    executionFailureCount: summary.executionFailureCount,
    actionableIssueCodes: summary.actionableIssueCodes,
  });
  throw err;
}

function assertCodexMobileBehaviorGatePass(summary = {}) {
  if (
    summary.status === 0
    && summary.ok === true
    && summary.deployPass === true
    && summary.browserStartupOnly !== true
  ) return;
  const code = summary.actionableIssueCodes?.[0]
    || (summary.browserStartupOnly === true ? "codex_mobile_behavior_gate_startup_only" : "")
    || (summary.executionFailureCount > 0 ? "codex_mobile_behavior_smoke_unavailable" : "")
    || "codex_mobile_behavior_gate_failed";
  const err = new Error(`${CODEX_MOBILE_BEHAVIOR_GATE.type}_failed:${code}`);
  err.status = summary.status;
  err.stderr = JSON.stringify({
    ok: Boolean(summary.ok),
    deployPass: Boolean(summary.deployPass),
    browserStartupOnly: Boolean(summary.browserStartupOnly),
    issueCount: summary.issueCount,
    blockingIssueCount: summary.blockingIssueCount,
    executionFailureCount: summary.executionFailureCount,
    actionableIssueCodes: summary.actionableIssueCodes,
    submitExerciseMode: summary.submitExercise?.mode || "",
  });
  throw err;
}

function runCodexMobileListenerStartupGateValidation(check, password) {
  const [command, ...args] = check.command;
  const result = runSudoAllowFailure(command, args, password);
  let payload = null;
  try {
    payload = JSON.parse(redactSensitiveOutput(result.stdout || "{}"));
  } catch (_err) {
    payload = {
      ok: false,
      deployPass: false,
      executionFailureCount: 1,
      actionableIssueCodes: ["browser_startup_smoke_unavailable"],
    };
  }
  const summary = codexMobileListenerStartupGateSummary(payload, result.status ?? 1);
  assertCodexMobileListenerStartupGatePass(summary);
  return summary;
}

function runCodexMobileBehaviorGateValidation(check, password) {
  const [command, ...args] = check.command;
  const result = runSudoAllowFailure(command, args, password);
  let payload = null;
  try {
    payload = JSON.parse(redactSensitiveOutput(result.stdout || "{}"));
  } catch (_err) {
    payload = {
      ok: false,
      deployPass: false,
      executionFailureCount: 1,
      actionableIssueCodes: ["codex_mobile_behavior_smoke_unavailable"],
    };
  }
  const summary = codexMobileBehaviorGateSummary(payload, result.status ?? 1, check);
  assertCodexMobileBehaviorGatePass(summary);
  return summary;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function sudoSha256File(filePath, password) {
  const result = runSudo("/usr/bin/shasum", ["-a", "256", filePath], password);
  return String(result.stdout || "").trim().split(/\s+/)[0] || "";
}

function runFileHashValidation(plan, password) {
  const rows = [];
  for (const relPath of plan.proofFiles || []) {
    const sourcePath = path.join(plan.sourcePath, relPath);
    const productionPath = path.join(plan.productionPath, relPath);
    const sourceHash = sha256File(sourcePath);
    const productionHash = sudoSha256File(productionPath, password);
    if (sourceHash !== productionHash) {
      const err = new Error(`production_file_hash_mismatch:${relPath}`);
      err.stderr = `source=${sourceHash} production=${productionHash}`;
      throw err;
    }
    rows.push({ path: relPath, sha256: sourceHash.slice(0, 16) });
  }
  return {
    type: "production-file-hashes",
    status: 0,
    fileCount: rows.length,
    files: rows,
  };
}

function buildRsyncArgs(excludes, source, target) {
  const args = ["-a", "--delete", "--checksum"];
  for (const item of excludes || []) args.push("--exclude", item);
  args.push(source, target);
  return args;
}

function repairCodexMobileLogPermissions(plan, password) {
  const repair = (plan.postSyncRepairs || []).find((item) => item && item.type === CODEX_MOBILE_LOG_REPAIR.type);
  if (!repair) return null;
  const logsRoot = repair.runtimeLogRoot;
  runSudo("/bin/mkdir", ["-p", logsRoot], password);
  runSudo("/usr/sbin/chown", [`${repair.serviceUser}:${repair.serviceGroup}`, logsRoot], password);
  runSudo("/bin/chmod", [repair.directoryMode, logsRoot], password);
  const files = [];
  for (const name of repair.logFiles || []) {
    const logPath = posixJoin(logsRoot, name);
    runSudo("/usr/bin/touch", [logPath], password);
    runSudo("/usr/sbin/chown", [`${repair.serviceUser}:${repair.serviceGroup}`, logPath], password);
    runSudo("/bin/chmod", [repair.fileMode, logPath], password);
    files.push(logPath);
  }
  let launchdReloadRequired = false;
  if (repair.launchdPlistPath && files.length >= 2) {
    let currentStdoutPath = "";
    let currentStderrPath = "";
    try {
      currentStdoutPath = String(runSudo("/usr/libexec/PlistBuddy", ["-c", "Print :StandardOutPath", repair.launchdPlistPath], password).stdout || "").trim();
      currentStderrPath = String(runSudo("/usr/libexec/PlistBuddy", ["-c", "Print :StandardErrorPath", repair.launchdPlistPath], password).stdout || "").trim();
    } catch (_) {
      launchdReloadRequired = true;
    }
    if (currentStdoutPath !== files[0]) {
      runSudo("/usr/libexec/PlistBuddy", ["-c", `Set :StandardOutPath ${files[0]}`, repair.launchdPlistPath], password);
      launchdReloadRequired = true;
    }
    if (currentStderrPath !== files[1]) {
      runSudo("/usr/libexec/PlistBuddy", ["-c", `Set :StandardErrorPath ${files[1]}`, repair.launchdPlistPath], password);
      launchdReloadRequired = true;
    }
    runSudo("/usr/sbin/chown", ["root:wheel", repair.launchdPlistPath], password);
    runSudo("/bin/chmod", ["644", repair.launchdPlistPath], password);
    runSudo("/usr/bin/plutil", ["-lint", repair.launchdPlistPath], password);
  }
  let codexRuntime = null;
  const envUpdated = [];
  if (repair.launchdPlistPath) {
    codexRuntime = resolveCodexMobileProfileRuntime({
      serviceUser: repair.serviceUser,
      runtimeRoot: repair.runtimeRoot,
      profileFile: repair.profileFile,
    });
    if (plistBuddySetEnvIfChanged(repair.launchdPlistPath, "CODEX_HOME", codexRuntime.codexHome, password)) {
      envUpdated.push("CODEX_HOME");
    }
    if (plistBuddySetEnvIfChanged(repair.launchdPlistPath, "CODEX_MOBILE_PROFILE_FILE", codexRuntime.profileFile, password)) {
      envUpdated.push("CODEX_MOBILE_PROFILE_FILE");
    }
    if (plistBuddySetEnvIfChanged(repair.launchdPlistPath, "CODEX_MOBILE_MUX_ENDPOINT_FILE", codexRuntime.muxEndpointFile, password)) {
      envUpdated.push("CODEX_MOBILE_MUX_ENDPOINT_FILE");
    }
    if (plistBuddySetEnvIfChanged(repair.launchdPlistPath, "CODEX_MOBILE_REQUIRE_SHARED_APP_SERVER", repair.requireSharedAppServer || "1", password)) {
      envUpdated.push("CODEX_MOBILE_REQUIRE_SHARED_APP_SERVER");
    }
    if (plistBuddySetEnvIfChanged(repair.launchdPlistPath, "CODEX_MOBILE_PERSIST_OWNED_MUX", repair.persistOwnedMux || "1", password)) {
      envUpdated.push("CODEX_MOBILE_PERSIST_OWNED_MUX");
    }
    if (plistBuddySetEnvIfChanged(repair.launchdPlistPath, "CODEX_MOBILE_DISABLE_OWNED_MUX", repair.disableOwnedMux || "0", password)) {
      envUpdated.push("CODEX_MOBILE_DISABLE_OWNED_MUX");
    }
    if (envUpdated.length) {
      launchdReloadRequired = true;
      runSudo("/usr/sbin/chown", ["root:wheel", repair.launchdPlistPath], password);
      runSudo("/bin/chmod", ["644", repair.launchdPlistPath], password);
      runSudo("/usr/bin/plutil", ["-lint", repair.launchdPlistPath], password);
    }
  }
  return {
    type: repair.type,
    status: 0,
    logsRoot,
    directoryMode: repair.directoryMode,
    fileMode: repair.fileMode,
    owner: `${repair.serviceUser}:${repair.serviceGroup}`,
    fileCount: files.length,
    launchdLabel: repair.launchdLabel,
    launchdPlistPath: repair.launchdPlistPath,
    stdoutPath: files[0] || "",
    stderrPath: files[1] || "",
    codexHome: codexRuntime?.codexHome || "",
    codexHomeSource: codexRuntime?.source || "",
    codexProfileActiveId: codexRuntime?.activeProfileId || "",
    codexProfileFile: codexRuntime?.profileFile || "",
    envUpdated,
    launchdReloadRequired,
  };
}

function codexMobileSelectedMuxRepairStatePath(plan = {}) {
  return posixJoin(plan.macRoot || DEFAULT_MAC_ROOT, CODEX_MOBILE_SELECTED_MUX_REPAIR_STATE_RELATIVE_PATH);
}

function codexMobileMuxRefreshReasonRequiresForce(reason = "") {
  return /\b(selected-mux|mux-runtime|shared-mux|mux-metrics)\b/i.test(String(reason || ""))
    || /(selected_mux|mux_runtime|shared_mux|mux_metrics)/i.test(String(reason || ""));
}

function codexMobileMuxRepairStateRequiresRefresh(state = {}) {
  const status = String(state?.status || "");
  return status === "pending" || status === "invalid";
}

function codexMobileSelectedMuxRefreshDecision(input = {}) {
  const changedFiles = Array.isArray(input.changedFiles) ? input.changedFiles : [];
  if (changedFiles.length > 0) return { required: true, reason: "mux_runtime_files_changed" };
  if (codexMobileMuxRepairStateRequiresRefresh(input.state)) {
    return { required: true, reason: "previous_selected_mux_refresh_incomplete" };
  }
  if (codexMobileMuxRefreshReasonRequiresForce(input.reason)) {
    return { required: true, reason: "deploy_reason_forces_selected_mux_refresh" };
  }
  return { required: false, reason: "no_mux_runtime_change" };
}

function readCodexMobileSelectedMuxRepairState(plan, password) {
  if (!plan || plan.target !== "plugin:codex-mobile-web") return {};
  const node = posixJoin(plan.macRoot, PINNED_NODE);
  const statePath = codexMobileSelectedMuxRepairStatePath(plan);
  const script = `
const fs = require("node:fs");
const file = process.argv[1];
if (!file || !fs.existsSync(file)) {
  process.stdout.write("{}");
  process.exit(0);
}
try {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  process.stdout.write(JSON.stringify({
    status: String(parsed.status || ""),
    target: String(parsed.target || ""),
    reason: String(parsed.reason || ""),
    sourceCommit: String(parsed.sourceCommit || ""),
    repairType: String(parsed.repairType || "")
  }));
} catch (_) {
  process.stdout.write(JSON.stringify({ status: "invalid" }));
}
`;
  try {
    const result = runSudo(node, ["-e", script, statePath], password);
    return JSON.parse(String(result.stdout || "{}")) || {};
  } catch (_) {
    return { status: "invalid" };
  }
}

function writeCodexMobileSelectedMuxRepairState(plan, password, status, change = {}) {
  if (!plan || plan.target !== "plugin:codex-mobile-web") return null;
  const node = posixJoin(plan.macRoot, PINNED_NODE);
  const statePath = codexMobileSelectedMuxRepairStatePath(plan);
  const payload = {
    status: String(status || ""),
    target: plan.target,
    reason: String(plan.reason || ""),
    sourceCommit: String(plan.sourceRef?.commit || ""),
    repairType: CODEX_MOBILE_SELECTED_MUX_REFRESH.type,
    decisionReason: String(change.reason || ""),
    changedFileCount: Array.isArray(change.changedFiles) ? change.changedFiles.length : 0,
    updatedAt: new Date().toISOString(),
  };
  const script = `
const fs = require("node:fs");
const path = require("node:path");
const file = process.argv[1];
const payload = process.argv[2] || "{}";
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, payload + "\\n", { mode: 0o600 });
process.stdout.write(JSON.stringify({ ok: true }));
`;
  runSudo(node, ["-e", script, statePath, JSON.stringify(payload)], password);
  return payload;
}

function detectCodexMobileMuxRuntimeChange(plan, password, repair = null) {
  const config = repair || (plan.postSyncRepairs || []).find((item) => item && item.type === CODEX_MOBILE_SELECTED_MUX_REFRESH.type);
  if (!config || plan.target !== "plugin:codex-mobile-web" || plan.syncOnly) {
    return { required: false, reason: "not_applicable", changedFiles: [] };
  }
  const changedFiles = [];
  for (const relPath of config.triggerFiles || []) {
    const sourcePath = path.join(plan.sourcePath, relPath);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) continue;
    const sourceHash = sha256File(sourcePath);
    const previousPath = path.join(plan.backupPath, relPath);
    let previousHash = "";
    try {
      previousHash = sudoSha256File(previousPath, password);
    } catch (_) {
      previousHash = "";
    }
    if (sourceHash !== previousHash) changedFiles.push(relPath);
  }
  const state = readCodexMobileSelectedMuxRepairState(plan, password);
  const decision = codexMobileSelectedMuxRefreshDecision({
    changedFiles,
    state,
    reason: plan.reason,
  });
  return {
    required: decision.required,
    reason: decision.reason,
    changedFiles,
    previousRepairStatus: String(state?.status || ""),
  };
}

function refreshCodexMobileSelectedMuxRuntime(plan, password, change = null) {
  const repair = (plan.postSyncRepairs || []).find((item) => item && item.type === CODEX_MOBILE_SELECTED_MUX_REFRESH.type);
  if (!repair) return null;
  const detected = change || detectCodexMobileMuxRuntimeChange(plan, password, repair);
  if (!detected.required) {
    return {
      type: repair.type,
      status: 0,
      skipped: true,
      reason: detected.reason || "no_mux_runtime_change",
      changedFileCount: 0,
      previousRepairStatus: detected.previousRepairStatus || "",
    };
  }
  const codexRuntime = resolveCodexMobileProfileRuntime({
    serviceUser: repair.serviceUser,
    runtimeRoot: repair.runtimeRoot,
    profileFile: repair.profileFile,
  });
  const node = posixJoin(plan.macRoot, PINNED_NODE);
  const script = `
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const endpointFile = process.argv[1];
const out = {
  ok: true,
  endpointFilePresent: false,
  endpointRemoved: false,
  candidatePidCount: 0,
  matchedPidCount: 0,
  stalePidCount: 0,
  stoppedPidCount: 0,
  unexpectedPidCount: 0,
  error: ""
};
function finish() {
  process.stdout.write(JSON.stringify(out));
}
if (!endpointFile || !fs.existsSync(endpointFile)) {
  finish();
  process.exit(0);
}
out.endpointFilePresent = true;
let endpoint = {};
try {
  endpoint = JSON.parse(fs.readFileSync(endpointFile, "utf8"));
} catch (_) {
  out.ok = false;
  out.error = "selected_mux_endpoint_json_invalid";
  finish();
  process.exit(0);
}
const pids = [];
for (const value of [endpoint.childPid, endpoint.pid]) {
  const pid = Number(value || 0);
  if (Number.isInteger(pid) && pid > 1 && !pids.includes(pid)) pids.push(pid);
}
out.candidatePidCount = pids.length;
for (const pid of pids) {
  const ps = spawnSync("/bin/ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" });
  const command = String(ps.stdout || "").trim();
  if (!command) {
    out.stalePidCount += 1;
    continue;
  }
  if (!command.includes("codex-app-server-mux") && !command.includes("codex app-server")) {
    out.unexpectedPidCount += 1;
    continue;
  }
  out.matchedPidCount += 1;
  const term = spawnSync("/bin/kill", [String(pid)], { encoding: "utf8" });
  if (term.status === 0) out.stoppedPidCount += 1;
  const alive = spawnSync("/bin/kill", ["-0", String(pid)], { encoding: "utf8" });
  if (alive.status === 0) spawnSync("/bin/kill", ["-KILL", String(pid)], { encoding: "utf8" });
}
if (out.unexpectedPidCount > 0) {
  out.ok = false;
  out.error = "selected_mux_endpoint_unexpected_process";
  finish();
  process.exit(0);
}
try {
  fs.unlinkSync(endpointFile);
  out.endpointRemoved = true;
} catch (err) {
  if (fs.existsSync(endpointFile)) {
    out.ok = false;
    out.error = "selected_mux_endpoint_remove_failed";
  }
}
finish();
`;
  const result = runSudo(node, ["-e", script, codexRuntime.muxEndpointFile], password);
  let parsed = {};
  try {
    parsed = JSON.parse(String(result.stdout || "{}"));
  } catch (_) {
    throw new Error("codex_mobile_selected_mux_refresh_output_invalid");
  }
  if (parsed.ok !== true) {
    throw new Error(`codex_mobile_selected_mux_refresh_failed:${parsed.error || "unknown"}`);
  }
  return {
    type: repair.type,
    status: 0,
    skipped: false,
    reason: detected.reason || "mux_runtime_files_changed",
    changedFileCount: detected.changedFiles.length,
    changedFiles: detected.changedFiles.slice(0, 12),
    previousRepairStatus: detected.previousRepairStatus || "",
    endpointFilePresent: parsed.endpointFilePresent === true,
    endpointRemoved: parsed.endpointRemoved === true,
    candidatePidCount: Number(parsed.candidatePidCount || 0) || 0,
    matchedPidCount: Number(parsed.matchedPidCount || 0) || 0,
    stalePidCount: Number(parsed.stalePidCount || 0) || 0,
    stoppedPidCount: Number(parsed.stoppedPidCount || 0) || 0,
    codexHomeSource: codexRuntime.source,
    codexProfileActiveId: codexRuntime.activeProfileId,
  };
}

function repairMusicRuntimeCoverPermissions(plan, password) {
  const repair = (plan.postSyncRepairs || []).find((item) => item && item.type === MUSIC_RUNTIME_COVER_PERMISSION_REPAIR.type);
  if (!repair) return null;
  const runtimeRoot = posixJoin(plan.productionPath, repair.runtimeRoot || "runtime");
  const directories = [runtimeRoot].concat((repair.directories || []).map((name) => posixJoin(runtimeRoot, name)));
  const directoryAcl = `user:${repair.ownerUser} allow list,add_file,add_subdirectory,search,delete_child,readattr,writeattr,readextattr,writeextattr,readsecurity,file_inherit,directory_inherit`;
  const fileAcl = `user:${repair.ownerUser} allow read,write,append,readattr,writeattr,readextattr,writeextattr,readsecurity`;
  for (const dir of directories) {
    runSudo("/bin/mkdir", ["-p", dir], password);
    applyAclOnce(dir, directoryAcl, password, false);
  }
  let fileCount = 0;
  for (const name of repair.sqliteFiles || []) {
    const filePath = posixJoin(runtimeRoot, name);
    const command = [
      `if test -e ${shQuote(filePath)}; then`,
      `  /bin/chmod -a ${shQuote(fileAcl)} ${shQuote(filePath)} >/dev/null 2>&1 || true`,
      `  /bin/chmod +a ${shQuote(fileAcl)} ${shQuote(filePath)}`,
      "  printf '1\\n'",
      "fi",
    ].join("\n");
    const result = runSudo("/bin/sh", ["-c", command], password);
    fileCount += String(result.stdout || "").split(/\r?\n/).filter(Boolean).length;
  }
  return {
    type: repair.type,
    status: 0,
    target: plan.target,
    runtimeRoot,
    ownerUser: repair.ownerUser,
    directories,
    directoryCount: directories.length,
    sqliteFileCount: fileCount,
  };
}

function installFinanceLaunchdWorkspaceKeyHashes(plan, password) {
  const repair = (plan.postSyncRepairs || []).find((item) => item && item.type === FINANCE_LAUNCHD_WORKSPACE_KEY_HASH_REPAIR.type);
  if (!repair) return null;
  const node = posixJoin(plan.macRoot, PINNED_NODE);
  const installer = path.join(__dirname, path.basename(repair.installerRelativePath || "install-finance-launchd-service.js"));
  const result = runSudo(node, [
    installer,
    "--mac-root",
    plan.macRoot,
    "--execute",
    "--bootstrap",
    "--require-workspace-key-hashes",
    "--json",
  ], password);
  let parsed = {};
  try {
    parsed = JSON.parse(String(result.stdout || "{}"));
  } catch (_err) {
    throw new Error("finance_launchd_workspace_key_hash_install_output_invalid");
  }
  const workspaceIds = Array.isArray(parsed.workspaceKeyHashWorkspaceIds)
    ? parsed.workspaceKeyHashWorkspaceIds.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 80)
    : [];
  const count = Number(parsed.workspaceKeyHashCount);
  if (!Number.isFinite(count) || count < 1 || workspaceIds.length < 1) {
    throw new Error("finance_launchd_workspace_key_hash_install_missing_hashes");
  }
  return {
    type: repair.type,
    plugin: repair.plugin || "finance",
    status: result.status,
    target: plan.target,
    launchdLabel: repair.launchdLabel,
    plistPath: parsed.plistPath || `/Library/LaunchDaemons/${repair.launchdLabel}.plist`,
    workspaceKeyHashSource: parsed.workspaceKeyHashSource || "workspace-local-finance-config-and-key",
    workspaceKeyHashCount: count,
    workspaceKeyHashWorkspaceIds: workspaceIds,
    bootstrapped: Boolean(parsed.bootstrapped),
    kickstarted: Boolean(parsed.kickstarted),
  };
}

function repairWebPushVapidPermissions(plan, password) {
  const repair = (plan.postSyncRepairs || []).find((item) => item && item.type === WEB_PUSH_VAPID_PERMISSION_REPAIR.type);
  if (!repair) return null;
  const filePath = posixJoin(plan.macRoot, repair.relativePath);
  const command = [
    `if test ! -e ${shQuote(filePath)}; then`,
    "  printf '{\"ok\":true,\"skipped\":true,\"reason\":\"web_push_vapid_missing\"}\\n'",
    "  exit 0",
    "fi",
    `/usr/sbin/chown ${shQuote(repair.owner)} ${shQuote(filePath)}`,
    `/bin/chmod ${shQuote(repair.fileMode)} ${shQuote(filePath)}`,
    "printf '{\"ok\":true,\"skipped\":false}\\n'",
  ].join("\n");
  const result = runSudo("/bin/sh", ["-c", command], password);
  return {
    type: repair.type,
    status: result.status,
    path: `<root>/${repair.relativePath}`,
    owner: repair.owner,
    fileMode: repair.fileMode,
    stdout: String(result.stdout || "").slice(0, 240),
  };
}

function compactProductionPath(value = "", root = "") {
  const raw = String(value || "");
  const normalizedRoot = normalizePath(root || "");
  if (!raw || !normalizedRoot) return raw;
  const normalized = normalizePath(raw);
  if (normalized === normalizedRoot) return "<root>";
  if (normalized.startsWith(`${normalizedRoot}/`)) return `<root>/${normalized.slice(normalizedRoot.length + 1)}`;
  return raw;
}

function wardrobeThumbnailArtifactAclRepairValidation(plan, repair, result) {
  let parsed = {};
  try {
    parsed = JSON.parse(String(result?.stdout || "{}"));
  } catch (_err) {
    throw new Error("wardrobe_thumbnail_artifact_acl_repair_output_invalid");
  }
  const writeProbeOk = Boolean(parsed.writeProbeOk);
  if (!writeProbeOk) {
    const err = new Error(parsed.error || "wardrobe_thumbnail_artifact_acl_repair_probe_failed");
    err.status = result?.status ?? 1;
    throw err;
  }
  return {
    type: repair.type,
    status: result?.status ?? 0,
    targetWorkspace: repair.targetWorkspace,
    macUser: repair.macUser,
    aclRepaired: Boolean(parsed.aclRepaired),
    photoCacheDir: compactProductionPath(parsed.photoCacheDir || "", plan.macRoot),
    probeUser: parsed.probeUser || "",
    writeProbeOk,
  };
}

function repairWardrobeThumbnailArtifactAcl(plan, password) {
  const repair = (plan.postSyncRepairs || []).find((item) => item && item.type === WARDROBE_THUMBNAIL_ARTIFACT_ACL_REPAIR.type);
  if (!repair) return null;
  const node = posixJoin(plan.macRoot, PINNED_NODE);
  const executorModule = posixJoin(plan.productionPath, "adapters", "workspace-system-provisioning-executor-service.js");
  const script = [
    "const { createWorkspaceSystemProvisioningExecutorService } = require(process.argv[1]);",
    "const liveRoot = process.argv[2];",
    "const dataRoot = process.argv[3];",
    "const workspaceId = process.argv[4];",
    "const macUser = process.argv[5];",
    "(async () => {",
    "  const service = createWorkspaceSystemProvisioningExecutorService({ liveRoot, enabled: true, platform: 'darwin', useSudoWrites: false });",
    "  const result = await service.runStep('repair_wardrobe_thumbnail_artifact_acl', { workspaceId, macUser, paths: { liveRoot, dataRoot } });",
    "  console.log(JSON.stringify({ ok: Boolean(result && result.ok), error: result && result.error || '', aclRepaired: Boolean(result && result.aclRepaired), photoCacheDir: result && result.photoCacheDir || '', probeUser: result && result.probeUser || '', writeProbeOk: Boolean(result && result.writeProbeOk) }));",
    "  if (!result || !result.ok || !result.writeProbeOk) process.exit(1);",
    "})().catch((error) => { console.error(JSON.stringify({ ok: false, error: error && error.message ? error.message : String(error) })); process.exit(1); });",
  ].join("\n");
  const result = runSudo(node, [
    "-e",
    script,
    executorModule,
    plan.macRoot,
    posixJoin(plan.macRoot, "data"),
    repair.targetWorkspace,
    repair.macUser,
  ], password);
  return wardrobeThumbnailArtifactAclRepairValidation(plan, repair, result);
}

function installGatewayLaunchctlSudoers(plan, password) {
  const repair = (plan.postSyncRepairs || []).find((item) => item && item.type === GATEWAY_LAUNCHCTL_SUDOERS_REPAIR.type);
  if (!repair) return null;
  const content = [
    "# Home AI Gateway elastic worker launcher.",
    "# Allows the unprivileged listener user to start and retire only Home AI Gateway LaunchDaemons.",
    `${repair.ownerUser} ALL=(root) NOPASSWD: /bin/launchctl kickstart system/com.hermesmobile.gateway.*, /bin/launchctl kickstart -k system/com.hermesmobile.gateway.*, /bin/launchctl kill SIGTERM system/com.hermesmobile.gateway.*`,
    "",
  ].join("\n");
  const command = [
    "set -euo pipefail",
    "tmp=\"$(/usr/bin/mktemp /tmp/homeai-gateway-launchctl-sudoers.XXXXXX)\"",
    "cleanup() { /bin/rm -f \"$tmp\"; }",
    "trap cleanup EXIT",
    "/bin/cat > \"$tmp\" <<'HOMEAI_GATEWAY_LAUNCHCTL_SUDOERS'",
    content.trimEnd(),
    "HOMEAI_GATEWAY_LAUNCHCTL_SUDOERS",
    "/usr/sbin/visudo -cf \"$tmp\" >/dev/null",
    `/usr/bin/install -o root -g wheel -m 0440 "$tmp" ${shQuote(repair.sudoersPath)}`,
    "printf '{\"ok\":true}\\n'",
  ].join("\n");
  const result = runSudo("/bin/bash", ["-c", command], password);
  return {
    type: repair.type,
    status: result.status,
    path: repair.sudoersPath,
    ownerUser: repair.ownerUser,
    stdout: String(result.stdout || "").slice(0, 240),
  };
}

function installGatewayMacosLauncher(plan, password) {
  const repair = (plan.postSyncRepairs || []).find((item) => item && item.type === GATEWAY_MACOS_LAUNCHER_REPAIR.type);
  if (!repair) return null;
  const sourcePath = posixJoin(plan.macRoot, repair.sourceRelativePath);
  const targetPath = posixJoin(plan.macRoot, repair.targetRelativePath);
  const command = [
    "set -euo pipefail",
    `test -f ${shQuote(sourcePath)}`,
    `/bin/mkdir -p ${shQuote(path.posix.dirname(targetPath))}`,
    `/usr/bin/install -o ${shQuote(repair.owner.split(":")[0])} -g ${shQuote(repair.owner.split(":")[1] || "wheel")} -m ${shQuote(repair.fileMode)} ${shQuote(sourcePath)} ${shQuote(targetPath)}`,
    "printf '{\"ok\":true}\\n'",
  ].join("\n");
  const result = runSudo("/bin/bash", ["-c", command], password);
  return {
    type: repair.type,
    status: result.status,
    source: `<root>/${repair.sourceRelativePath}`,
    target: `<root>/${repair.targetRelativePath}`,
    owner: repair.owner,
    fileMode: repair.fileMode,
    stdout: String(result.stdout || "").slice(0, 240),
  };
}

function installHomeAiGatewayLaunchdServices(plan, password) {
  if (plan.target !== "home-ai" || plan.surface !== "full") return null;
  const script = posixJoin(plan.productionPath, "scripts", "install-macos-production.sh");
  const node = posixJoin(plan.macRoot, PINNED_NODE);
  const result = runSudo("/usr/bin/env", [
    "HOMEAI_INSTALL_LAUNCHD_APPLY=1",
    `HOMEAI_NODE=${node}`,
    "/bin/bash",
    script,
    "--execute",
    "--phase",
    "install-gateway-launchd-services",
    "--root",
    plan.macRoot,
    "--json",
  ], password);
  let parsed = {};
  try {
    parsed = JSON.parse(String(result.stdout || "{}"));
  } catch (_err) {
    throw new Error("home_ai_gateway_launchd_services_install_output_invalid");
  }
  if (parsed.ok !== true || parsed.execution?.ok !== true) {
    const codes = Array.isArray(parsed.execution?.issueCodes) ? parsed.execution.issueCodes.slice(0, 8).join(",") : "unknown";
    throw new Error(`home_ai_gateway_launchd_services_install_failed:${codes}`);
  }
  const report = parsed.execution?.report || {};
  return {
    type: "home-ai-gateway-launchd-services-install",
    status: result.status,
    workerCount: Number(report.workerCount || 0) || 0,
    serviceCount: Array.isArray(report.services) ? report.services.length : 0,
    launchdInstalled: Boolean(report.launchdInstalled),
    launchdLoaded: Boolean(report.launchdLoaded),
    operatorInstallRequired: Boolean(report.operatorInstallRequired),
  };
}

function syncPostSyncMirrors(plan, password) {
  const mirrors = Array.isArray(plan.postSyncMirrors) ? plan.postSyncMirrors : [];
  const rows = [];
  for (const mirror of mirrors) {
    if (!mirror || mirror.type !== "gateway-mcp-worker-asset") continue;
    const relSource = String(mirror.source || "").trim();
    const relTarget = String(mirror.target || "").trim();
    const kind = String(mirror.kind || "file").trim().toLowerCase();
    if (!relSource || !relTarget) continue;
    const sourcePath = path.join(plan.productionPath, relSource);
    const targetPath = path.join(plan.macRoot, relTarget);
    assertInside(sourcePath, plan.productionPath, "post_sync_mirror_source");
    assertInside(targetPath, plan.macRoot, "post_sync_mirror_target");
    if (kind === "directory") {
      runSudo("/bin/mkdir", ["-p", path.posix.dirname(targetPath)], password);
      runSudo("/usr/bin/rsync", ["-a", "--delete", `${sourcePath}/`, `${targetPath}/`], password);
      runSudo("/usr/sbin/chown", ["-R", `${PRODUCTION_SERVICE_USER}:${PRODUCTION_SERVICE_GROUP}`, targetPath], password);
      runSudo("/bin/chmod", ["-R", "u+rwX,go+rX", targetPath], password);
    } else {
      runSudo("/bin/mkdir", ["-p", path.posix.dirname(targetPath)], password);
      runSudo("/usr/bin/install", [
        "-m",
        String(mirror.mode || "755"),
        "-o",
        PRODUCTION_SERVICE_USER,
        "-g",
        PRODUCTION_SERVICE_GROUP,
        sourcePath,
        targetPath,
      ], password);
    }
    rows.push({
      plugin: mirror.plugin || "",
      source: relSource,
      target: relTarget,
      kind,
      mode: String(mirror.mode || "755"),
    });
  }
  if (!rows.length) return null;
  return {
    type: "post-sync-gateway-mcp-worker-assets",
    status: 0,
    target: plan.target,
    fileCount: rows.length,
    files: rows,
  };
}

function executePlan(plan, options) {
  const password = resolveSudoPassword(options.passwordFile);

  runSudo("/bin/mkdir", ["-p", plan.backupPath, plan.productionPath], password);
  runSudo("/usr/bin/rsync", buildRsyncArgs(BACKUP_RSYNC_EXCLUDES, `${plan.productionPath}/`, `${plan.backupPath}/`), password);
  const codexMobileMuxRuntimeChange = detectCodexMobileMuxRuntimeChange(plan, password);
  if (codexMobileMuxRuntimeChange.required) {
    writeCodexMobileSelectedMuxRepairState(plan, password, "pending", codexMobileMuxRuntimeChange);
  }

  if (plan.surface === "static") {
    for (const item of plan.sync) {
      const source = path.join(plan.sourcePath, item.source);
      const target = path.join(plan.productionPath, item.target);
      runSudo("/bin/mkdir", ["-p", target], password);
      runSudo("/usr/bin/rsync", ["-a", "--delete", `${source}/`, `${target}/`], password);
    }
  } else {
    runSudo("/usr/bin/rsync", buildRsyncArgs(plan.rsyncExcludes, `${plan.sourcePath}/`, `${plan.productionPath}/`), password);
  }

  if (plan.productionOwner) {
    runSudo("/usr/sbin/chown", ["-R", plan.productionOwner, plan.productionPath], password);
  }

  const codexMobileLogRepair = repairCodexMobileLogPermissions(plan, password);
  const musicRuntimeCoverPermissionRepair = repairMusicRuntimeCoverPermissions(plan, password);
  const financeLaunchdWorkspaceKeyHashRepair = installFinanceLaunchdWorkspaceKeyHashes(plan, password);
  const webPushVapidPermissionRepair = repairWebPushVapidPermissions(plan, password);
  const postSyncMirrorResult = syncPostSyncMirrors(plan, password);
  const bridgeHostInstall = installHomeAiBridgeHostLaunchd(plan, password);
  const cronInstall = installHomeAiCronLaunchd(plan, password);
  const nasBackupMountInstall = installHomeAiNasBackupMountLaunchd(plan, password);
  const listenerVoiceInputEnv = installHomeAiListenerVoiceInputEnv(plan, password);
  const cronProfileAliases = installHomeAiCronProfileAliases(plan, password);
  const visualAnalysisProfile = installHomeAiVisualAnalysisProfile(plan, password);
  const cronBuiltinSkills = installHomeAiCronBuiltinSkills(plan, password);
  const cronRuntimeScripts = installHomeAiCronRuntimeScripts(plan, password);
  const selfImprovingLoopCronJob = installHomeAiSelfImprovingLoopCronJob(plan, password);
  const codexMobilePrAutomationCronJob = installCodexMobilePrAutomationCronJob(plan, password);
  const pluginDailyProgressRollupCronJob = installPluginDailyProgressRollupCronJob(plan, password);
  const productionDriftAuditInstall = installHomeAiProductionDriftAuditLaunchd(plan, password);
  const visualPolishTaskCardConfig = installHomeAiVisualPolishTaskCardConfig(plan, password);
  const visualPolishCronJobs = installHomeAiVisualPolishCronJobs(plan, password);
  const visualDebugLaunchAgent = installHomeAiVisualDebugLaunchAgent(plan, password);
  const backupArtifactAclRepair = repairHomeAiBackupArtifactAcls(plan, password);
  const backupGatewayTelemetryAclRepair = repairHomeAiBackupGatewayTelemetryAcls(plan, password);
  const backupDeployStateAclRepair = repairHomeAiBackupDeployStateAcls(plan, password);
  const codexSharedAuthRepair = repairCodexSharedAuthPermissions(plan, password);
  const gatewayStartScriptBridgeEnvRepair = repairGatewayStartScriptBridgeEnv(plan, password);
  const wardrobeThumbnailArtifactAclRepair = repairWardrobeThumbnailArtifactAcl(plan, password);
  const gatewayLaunchctlSudoers = installGatewayLaunchctlSudoers(plan, password);
  const gatewayMacosLauncher = installGatewayMacosLauncher(plan, password);
  const gatewayLaunchdServices = installHomeAiGatewayLaunchdServices(plan, password);
  const gatewayManifestWorkerReadAcl = repairGatewayManifestWorkerReadAcl(plan, password);
  const productionDriftReconcile = reconcileHomeAiProductionDrift(plan, password);
  const deployBackupPrune = pruneDeployBackups(plan, options, password);

  const reloadedLabels = new Set();
  if (
    codexMobileLogRepair
    && codexMobileLogRepair.launchdReloadRequired
    && codexMobileLogRepair.launchdLabel
    && codexMobileLogRepair.launchdPlistPath
    && plan.restartLabels.includes(codexMobileLogRepair.launchdLabel)
  ) {
    codexMobileLogRepair.reload = reloadSystemLaunchdService(
      codexMobileLogRepair.launchdLabel,
      codexMobileLogRepair.launchdPlistPath,
      password,
    );
    reloadedLabels.add(codexMobileLogRepair.launchdLabel);
  }
  if (listenerVoiceInputEnv && plan.restartLabels.includes(HOME_AI_LISTENER_LABEL)) {
    const plistPath = `/Library/LaunchDaemons/${HOME_AI_LISTENER_LABEL}.plist`;
    listenerVoiceInputEnv.reload = reloadSystemLaunchdService(HOME_AI_LISTENER_LABEL, plistPath, password);
    reloadedLabels.add(HOME_AI_LISTENER_LABEL);
  }
  if (
    financeLaunchdWorkspaceKeyHashRepair
    && financeLaunchdWorkspaceKeyHashRepair.bootstrapped
    && financeLaunchdWorkspaceKeyHashRepair.launchdLabel
  ) {
    reloadedLabels.add(financeLaunchdWorkspaceKeyHashRepair.launchdLabel);
  }

  for (const label of plan.restartLabels) {
    if (reloadedLabels.has(label)) continue;
    runSudo("/bin/launchctl", ["kickstart", "-k", `system/${label}`], password);
  }
  const codexMobileSelectedMuxRefresh = refreshCodexMobileSelectedMuxRuntime(plan, password, codexMobileMuxRuntimeChange);
  if (codexMobileSelectedMuxRefresh && !codexMobileSelectedMuxRefresh.skipped) {
    writeCodexMobileSelectedMuxRepairState(plan, password, "completed", codexMobileMuxRuntimeChange);
  }

  const validations = [];
  if (codexMobileLogRepair) validations.push(codexMobileLogRepair);
  if (codexMobileSelectedMuxRefresh) validations.push(codexMobileSelectedMuxRefresh);
  if (musicRuntimeCoverPermissionRepair) validations.push(musicRuntimeCoverPermissionRepair);
  if (financeLaunchdWorkspaceKeyHashRepair) validations.push(financeLaunchdWorkspaceKeyHashRepair);
  if (webPushVapidPermissionRepair) validations.push(webPushVapidPermissionRepair);
  if (postSyncMirrorResult) validations.push(postSyncMirrorResult);
  if (bridgeHostInstall) validations.push(Object.assign({ status: 0 }, bridgeHostInstall));
  if (cronInstall) validations.push(Object.assign({ status: 0 }, cronInstall));
  if (nasBackupMountInstall) validations.push(Object.assign({ status: 0 }, nasBackupMountInstall));
  if (productionDriftAuditInstall) validations.push(Object.assign({ status: 0 }, productionDriftAuditInstall));
  if (listenerVoiceInputEnv) validations.push(Object.assign({ status: 0 }, listenerVoiceInputEnv));
  if (cronProfileAliases) validations.push(Object.assign({ status: 0 }, cronProfileAliases));
  if (visualAnalysisProfile) validations.push(Object.assign({ status: 0 }, visualAnalysisProfile));
  if (cronBuiltinSkills) validations.push(Object.assign({ status: 0 }, cronBuiltinSkills));
  if (cronRuntimeScripts) validations.push(Object.assign({ status: 0 }, cronRuntimeScripts));
  if (selfImprovingLoopCronJob) validations.push(Object.assign({ status: 0 }, selfImprovingLoopCronJob));
  if (codexMobilePrAutomationCronJob) validations.push(Object.assign({ status: 0 }, codexMobilePrAutomationCronJob));
  if (pluginDailyProgressRollupCronJob) validations.push(Object.assign({ status: 0 }, pluginDailyProgressRollupCronJob));
  if (visualPolishTaskCardConfig) validations.push(Object.assign({ status: 0 }, visualPolishTaskCardConfig));
  if (visualPolishCronJobs) validations.push(Object.assign({ status: 0 }, visualPolishCronJobs));
  if (visualDebugLaunchAgent) validations.push(Object.assign({ status: 0 }, visualDebugLaunchAgent));
  if (backupArtifactAclRepair) validations.push(backupArtifactAclRepair);
  if (backupGatewayTelemetryAclRepair) validations.push(backupGatewayTelemetryAclRepair);
  if (backupDeployStateAclRepair) validations.push(backupDeployStateAclRepair);
  if (codexSharedAuthRepair) validations.push(codexSharedAuthRepair);
  if (gatewayStartScriptBridgeEnvRepair) validations.push(gatewayStartScriptBridgeEnvRepair);
  if (wardrobeThumbnailArtifactAclRepair) validations.push(wardrobeThumbnailArtifactAclRepair);
  if (gatewayLaunchctlSudoers) validations.push(gatewayLaunchctlSudoers);
  if (gatewayMacosLauncher) validations.push(gatewayMacosLauncher);
  if (gatewayLaunchdServices) validations.push(gatewayLaunchdServices);
  if (gatewayManifestWorkerReadAcl) validations.push(gatewayManifestWorkerReadAcl);
  if (productionDriftReconcile) validations.push(productionDriftReconcile);
  if (deployBackupPrune) validations.push(deployBackupPrune);
  for (const check of plan.validation) {
    if (check.type === "production-file-hashes") validations.push(runFileHashValidation(plan, password));
    else if (check.type === OWNER_3A_QUALITY_EVIDENCE_SEED.type) validations.push(runOwner3aQualityEvidenceSeedValidation(check, plan, password));
    else if (check.type === CODEX_MOBILE_LISTENER_STARTUP_GATE.type) validations.push(runCodexMobileListenerStartupGateValidation(check, password));
    else if (check.type === CODEX_MOBILE_BEHAVIOR_GATE.type) validations.push(runCodexMobileBehaviorGateValidation(check, password));
    else if (check.type === "codex-auth-profile-audit") validations.push(runIssuePrefixAuditValidation(check, password, CODEX_AUTH_AUDIT_ISSUE_PREFIX));
    else if (check.type === "home-ai-production-drift-audit") validations.push(runIssuePrefixAuditValidation(check, password));
    else validations.push(runValidation(check, password, options));
  }
  return validations;
}

function executeAllPluginPlan(plan, options) {
  return (plan.plans || []).map((child) => ({
    target: child.target,
    validationResults: executePlan(child, Object.assign({}, options, { target: child.target })),
  }));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.target === "plugins:all") {
    const plan = buildAllPluginPlan(options);
    assertExecutableAllPluginPlan(plan, options);
    let result = { ok: true, plan };
    if (options.execute) {
      result = Object.assign(result, { validationResults: executeAllPluginPlan(plan, options) });
    }
    if (options.json || !options.execute) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`deployed ${plan.target} count=${plan.plans.length}`);
    }
    return;
  }
  const plan = buildPlan(options);
  assertExecutablePlan(plan, options);
  let result = { ok: true, plan };
  if (options.execute) {
    result = Object.assign(result, { validationResults: executePlan(plan, options) });
  }
  if (options.json || !options.execute) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`deployed ${plan.target} backup=${plan.backupPath}`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    const payload = { ok: false, error: err?.message || String(err) };
    if (err?.command) payload.command = err.command;
    if (err?.args) payload.args = err.args;
    if (err?.status != null) payload.status = err.status;
    if (err?.stderr) payload.stderr = err.stderr;
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_DEV_ROOT,
  DEFAULT_MAC_ROOT,
  BACKUP_RSYNC_EXCLUDES,
  DEPLOY_BACKUP_RETENTION_DAYS,
  PLUGIN_TARGETS,
  PLUGIN_DEPLOY_ORDER,
  CODEX_MOBILE_LISTENER_STARTUP_GATE,
  CODEX_MOBILE_BEHAVIOR_GATE,
  RSYNC_EXCLUDES,
  parseArgs,
  buildPlan,
  buildAllPluginPlan,
  assertExecutablePlan,
  defaultSudoPasswordFileCandidates,
  sudoPasswordFileCandidates,
  resolveSudoPassword,
  codexMobileSelectedMuxRepairStatePath,
  codexMobileMuxRefreshReasonRequiresForce,
  codexMobileMuxRepairStateRequiresRefresh,
  codexMobileSelectedMuxRefreshDecision,
  codexMobileListenerStartupGateSummary,
  codexMobileBehaviorGateSummary,
  assertCodexMobileListenerStartupGatePass,
  assertCodexMobileBehaviorGatePass,
  codexMobileBehaviorSubmitExercisePlan,
  runValidation,
  buildHomeAiCronProfileAliasPlan,
  buildPluginWorkspaceAuditTargetJson,
  buildHomeAiBridgeHostLaunchdPlist,
  buildHomeAiCronLaunchdPlist,
  buildHomeAiNasBackupMountLaunchdPlist,
  buildHomeAiProductionDriftAuditLaunchdPlist,
  buildSystemLaunchdReloadScript,
  isPausedCronJob,
  cronJobScheduleStateForUpsert,
  cronProfileAliasRowsFromManifest,
  buildHomeAiVisualAnalysisProfileConfig,
  buildRsyncArgs,
  gatewayManifestWorkerUsers,
  shouldRepairCodexSharedAuthPermissions,
  repairHomeAiBackupArtifactAcls,
  repairHomeAiBackupGatewayTelemetryAcls,
  repairHomeAiBackupDeployStateAcls,
  pruneDeployBackups,
  parseDeployBackupName,
  selectDeployBackupsToPrune,
  postSyncRepairsForTarget,
  repairCodexMobileLogPermissions,
  detectCodexMobileMuxRuntimeChange,
  refreshCodexMobileSelectedMuxRuntime,
  repairMusicRuntimeCoverPermissions,
  installFinanceLaunchdWorkspaceKeyHashes,
  installHomeAiGatewayLaunchdServices,
  compactProductionPath,
  wardrobeThumbnailArtifactAclRepairValidation,
  redactSensitiveOutput,
  deployDirtyFiles,
  lastCommitChangedFiles,
  changedFilesForUiVisualValidation,
  isDeploySurfaceIncluded,
};
