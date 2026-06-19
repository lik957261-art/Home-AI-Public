"use strict";

const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

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
const PRODUCTION_SERVICE_USER = "hermes-host";
const PRODUCTION_SERVICE_GROUP = "staff";
const HOME_AI_CRON_START_INTERVAL_SECONDS = 60;
const HOME_AI_CRON_SCRIPT_TIMEOUT_SECONDS = 1800;
const HOME_AI_NAS_BACKUP_MOUNT_START_INTERVAL_SECONDS = 300;
const HOME_AI_BRIDGE_HOST_PORT = 8798;
const HOME_AI_CHATGPT_PRO_WORKSPACE = process.env.HERMES_MOBILE_CHATGPT_PRO_WORKSPACE
  || process.env.HERMES_WEB_CHATGPT_PRO_WORKSPACE
  || `${DEFAULT_DEV_ROOT}/app`;
const HOME_AI_CHATGPT_PRO_CODEX_MOBILE_URL = process.env.HERMES_MOBILE_CHATGPT_PRO_CODEX_MOBILE_URL
  || process.env.HERMES_WEB_CHATGPT_PRO_CODEX_MOBILE_URL
  || "http://127.0.0.1:8787";
const HOME_AI_CHATGPT_PRO_CODEX_MOBILE_KEY_FILE = process.env.HERMES_MOBILE_CHATGPT_PRO_CODEX_MOBILE_KEY_FILE
  || process.env.HERMES_WEB_CHATGPT_PRO_CODEX_MOBILE_KEY_FILE
  || process.env.CODEX_MOBILE_KEY_FILE
  || "/Users/example/path";
const HOME_AI_CHATGPT_PRO_OUTPUT_DIR = process.env.HERMES_MOBILE_CHATGPT_PRO_OUTPUT_DIR
  || process.env.HERMES_WEB_CHATGPT_PRO_OUTPUT_DIR
  || "/Users/example/path";
const HOME_AI_DISASTER_BACKUP_TRANSPORT = process.env.HOMEAI_DISASTER_BACKUP_TRANSPORT || "auto";
const HOME_AI_DISASTER_BACKUP_SSH_TARGET = process.env.HOMEAI_DISASTER_BACKUP_SSH_TARGET || "xuxinxp@192.168.10.99";
const HOME_AI_DISASTER_BACKUP_SSH_DESTINATION = process.env.HOMEAI_DISASTER_BACKUP_SSH_DESTINATION || "/volume1/备份/HomeAI-Production-Backups/mac-production";
const HOME_AI_DISASTER_BACKUP_SSH_OPTIONS = process.env.HOMEAI_DISASTER_BACKUP_SSH_OPTIONS
  || "-p 2222 -i /Users/example/path";
const HOME_AI_VOICE_INPUT_ASR_URL = "http://127.0.0.1:8002/v1/audio/transcriptions";
const HOME_AI_VOICE_INPUT_STREAMING_URL = "http://127.0.0.1:8002/v1/audio/transcriptions/stream";
const HOME_AI_VOICE_INPUT_ASR_BACKEND = "funasr-local";
const HOME_AI_VOICE_INPUT_ASR_PROTOCOL = "openai-multipart";
const HOME_AI_VOICE_INPUT_COMPARE_BACKENDS = "whisper-large-v3-turbo,funasr-local,sensevoice-local";
const HOME_AI_VOICE_INPUT_LANGUAGE = "zh";
const HOME_AI_VOICE_INPUT_TASK = "transcribe";
const HOME_AI_VOICE_INPUT_INITIAL_PROMPT = "以下是普通话语音转写，请使用简体中文，并加入合适的中文标点符号。";
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
  "codex-mobile": "codex-mobile-web",
  "codex-mobile-web": "codex-mobile-web",
  email: "email",
  finance: "finance",
  growth: "growth",
  health: "healthy",
  healthy: "healthy",
  moira: "moira",
  music: "music",
  note: "note",
  wardrobe: "wardrobe",
});
const HOME_AI_CRON_PROFILE_READ_ACL = `user:${PRODUCTION_SERVICE_USER} allow list,search,readattr,readextattr,readsecurity,read,execute,file_inherit,directory_inherit`;
const HOME_AI_CRON_PROFILE_TRAVERSE_ACL = `user:${PRODUCTION_SERVICE_USER} allow search,readattr,readextattr,readsecurity`;
const HOME_AI_BACKUP_ARTIFACT_READ_ACL = `user:${PRODUCTION_SERVICE_USER} allow list,search,readattr,readextattr,readsecurity,read,execute,file_inherit,directory_inherit`;
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
  "music",
  "note",
  "wardrobe",
]);

const PLUGIN_TARGETS = new Set(PLUGIN_DEPLOY_ORDER);

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
  music: "http://127.0.0.1:4891/api/v1/hermes/plugin/manifest",
  note: "http://127.0.0.1:4181/api/v1/hermes/plugin/manifest",
  wardrobe: "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest",
});

const PLUGIN_GATEWAY_MCP_MIRRORS = Object.freeze({
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
  "codex-mobile-web": Object.freeze(["public/index.html"]),
  email: Object.freeze(["dist/web/index.html"]),
  growth: Object.freeze(["public/index.html"]),
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
  logFiles: Object.freeze([
    "codex-mobile-web.out.log",
    "codex-mobile-web.err.log",
  ]),
  directoryMode: "700",
  fileMode: "600",
});

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
];

const PLUGIN_RSYNC_EXCLUDES = [
  "data/",
  "runtime/",
];

const SURFACES = new Set(["full", "static"]);

const HOME_AI_STATIC_SYNC_ROOTS = [
  "public/",
];

const HOME_AI_PROOF_FILES = [
  "adapters/automation-cron-profile-service.js",
  "cron_bridge.py",
  "mobile-server-runtime.js",
  "package.json",
  "public/index.html",
  "public/service-worker.js",
  "public/directory-viewer.html",
  "server-routes/automation-api-routes.js",
  "server-routes/mobile-api-composition.js",
  "scripts/deploy-macos-production.js",
  "scripts/macos-automation-cron-audit.js",
  "scripts/plugin-workspace-audit-runner.js",
  "scripts/production-status-smoke.js",
  "scripts/macos-gateway-start-script-bridge-env-repair.js",
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
        "  --base <url>                Home AI production base for status smoke",
        "  --reason <slug>             Backup name slug",
        "  --validation-retries <n>    Retries for listener/health validation, default 12",
        "  --validation-delay-ms <n>   Delay between validation retries, default 2000",
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
  if (out.syncOnly && !(out.target.startsWith("plugin:") || out.target === "plugins:all")) throw new Error("sync_only_requires_plugin_target");
  if (out.syncOnly) {
    out.restartMode = "none";
    out.healthUrl = "";
  }
  out.restartLabels = out.restartLabels.filter(Boolean);
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

function rsyncExcludePatternApplies(pattern, relPath) {
  if (!pattern || !relPath) return false;
  if (pattern.endsWith("/")) return relPath === pattern.slice(0, -1) || relPath.startsWith(pattern);
  if (pattern.startsWith("*.")) return relPath.endsWith(pattern.slice(1));
  if (pattern.endsWith("*")) return relPath.startsWith(pattern.slice(0, -1));
  return relPath === pattern || relPath.startsWith(`${pattern}/`);
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

function ignoredDirtyFiles(source, options) {
  return gitStatusEntries(source)
    .map((entry) => entry.path)
    .filter((relPath) => !isDeploySurfaceIncluded(relPath, options))
    .slice(0, 120);
}

function defaultSource(options) {
  if (options.target === "home-ai") return posixJoin(options.devRoot, "app");
  const plugin = options.target.replace(/^plugin:/, "");
  return posixJoin(options.devRoot, "plugins", plugin);
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
  if (options.target === "plugin:codex-mobile-web") return [CODEX_MOBILE_LOG_REPAIR];
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
        "--json",
      ],
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
    deployDirtyFiles: relevantDirtyFiles,
    ignoredDirtyFiles: ignoredDirty,
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
    sourceRoot: normalizePath(posixJoin(options.devRoot, "plugins")),
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

function shQuote(value) {
  return `'${String(value || "").replace(/'/g, "'\\''")}'`;
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

function buildPluginWorkspaceAuditTargetJson(macRoot) {
  const root = normalizePath(macRoot || DEFAULT_MAC_ROOT);
  const rows = {};
  for (const [pluginId, dirName] of Object.entries(HOME_AI_PLUGIN_WORKSPACE_AUDIT_TARGETS)) {
    rows[pluginId] = posixJoin(root, "plugins", dirName);
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
    err.stderr = String(result.stderr || "").slice(0, 1200);
    throw err;
  }
  return result;
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

function installHomeAiListenerVoiceInputEnv(plan, password) {
  if (plan.target !== "home-ai" || plan.surface === "static") return null;
  const plistPath = `/Library/LaunchDaemons/${HOME_AI_LISTENER_LABEL}.plist`;
  runSudo("/bin/test", ["-f", plistPath], password);
  const pluginWorkspaceAuditTargets = buildPluginWorkspaceAuditTargetJson(plan.macRoot);
  const rows = {
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
  const flags = recursive ? "-R " : "";
  const command = [
    `/bin/chmod ${flags}-a ${shQuote(acl)} ${shQuote(targetPath)} >/dev/null 2>&1 || true`,
    `/bin/chmod ${flags}+a ${shQuote(acl)} ${shQuote(targetPath)}`,
  ].join("\n");
  runSudo("/bin/sh", ["-c", command], password);
}

function applyAclIfExists(targetPath, acl, password, recursive = false) {
  const flags = recursive ? "-R " : "";
  const command = [
    `if test -e ${shQuote(targetPath)}; then`,
    `  /bin/chmod ${flags}-a ${shQuote(acl)} ${shQuote(targetPath)} >/dev/null 2>&1 || true`,
    `  /bin/chmod ${flags}+a ${shQuote(acl)} ${shQuote(targetPath)}`,
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
  const targetRoot = posixJoin(plan.macRoot, "data", "hermes-home", "scripts");
  const targetScript = posixJoin(targetRoot, "homeai-disaster-backup-cron.sh");
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
  return {
    type: "home-ai-cron-runtime-scripts",
    sourceScript,
    targetRoot,
    installed: ["homeai-disaster-backup-cron.sh"],
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
  runSudo("/bin/sh", ["-c", `/bin/launchctl bootout system ${shQuote(paths.plistPath)} >/dev/null 2>&1 || true`], password);
  runSudo("/bin/launchctl", ["bootstrap", "system", paths.plistPath], password);
  return {
    type: "home-ai-cron-launchd-install",
    label: HOME_AI_CRON_LABEL,
    plistPath: paths.plistPath,
    jobsPath: paths.jobsPath,
    startIntervalSeconds: HOME_AI_CRON_START_INTERVAL_SECONDS,
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
  runSudo("/bin/sh", ["-c", `/bin/launchctl bootout system ${shQuote(paths.plistPath)} >/dev/null 2>&1 || true`], password);
  runSudo("/bin/launchctl", ["bootstrap", "system", paths.plistPath], password);
  return {
    type: "home-ai-bridge-host-launchd-install",
    label: HOME_AI_BRIDGE_HOST_LABEL,
    plistPath: paths.plistPath,
    port: HOME_AI_BRIDGE_HOST_PORT,
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
  runSudo("/bin/sh", ["-c", `/bin/launchctl bootout system ${shQuote(paths.plistPath)} >/dev/null 2>&1 || true`], password);
  runSudo("/bin/launchctl", ["bootstrap", "system", paths.plistPath], password);
  runSudo("/bin/launchctl", ["kickstart", "-k", `system/${HOME_AI_NAS_BACKUP_MOUNT_LABEL}`], password);
  return {
    type: "home-ai-nas-backup-mount-launchd-install",
    label: HOME_AI_NAS_BACKUP_MOUNT_LABEL,
    plistPath: paths.plistPath,
    startIntervalSeconds: HOME_AI_NAS_BACKUP_MOUNT_START_INTERVAL_SECONDS,
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

function sleepMs(ms) {
  if (!ms) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function shouldRetryValidation(type) {
  return type === "home-ai-status-smoke" || type === "health-url";
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
        stdout: String(result.stdout || "").slice(0, 1600),
      };
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) sleepMs(options.validationDelayMs);
    }
  }
  throw lastError;
}

function runCodexAuthProfileAuditValidation(check, password) {
  const [command, ...args] = check.command;
  const result = runSudo(command, args, password);
  let audit = null;
  try {
    audit = JSON.parse(result.stdout || "{}");
  } catch (_err) {
    throw new Error("codex_auth_profile_audit_json_invalid");
  }
  const issues = Array.isArray(audit.issues) ? audit.issues.map((item) => String(item || "")).filter(Boolean) : [];
  const prefix = String(check.failOnIssuePrefix || CODEX_AUTH_AUDIT_ISSUE_PREFIX);
  const codexIssues = issues.filter((item) => item.startsWith(prefix));
  if (codexIssues.length) {
    const err = new Error(`codex_auth_profile_audit_failed:${codexIssues.slice(0, 20).join(",")}`);
    err.stderr = `codexAuthIssues=${codexIssues.length}`;
    throw err;
  }
  return {
    type: check.type,
    status: result.status,
    auditOk: Boolean(audit.ok),
    issueCount: issues.length,
    codexIssueCount: 0,
  };
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
  const args = ["-a", "--delete"];
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
    launchdReloadRequired,
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
  const password = readPassword(options.passwordFile);
  if (options.passwordFile && !password) throw new Error("sudo_password_file_empty");

  runSudo("/bin/mkdir", ["-p", plan.backupPath, plan.productionPath], password);
  runSudo("/usr/bin/rsync", buildRsyncArgs(BACKUP_RSYNC_EXCLUDES, `${plan.productionPath}/`, `${plan.backupPath}/`), password);

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
  const postSyncMirrorResult = syncPostSyncMirrors(plan, password);
  const bridgeHostInstall = installHomeAiBridgeHostLaunchd(plan, password);
  const cronInstall = installHomeAiCronLaunchd(plan, password);
  const nasBackupMountInstall = installHomeAiNasBackupMountLaunchd(plan, password);
  const listenerVoiceInputEnv = installHomeAiListenerVoiceInputEnv(plan, password);
  const cronProfileAliases = installHomeAiCronProfileAliases(plan, password);
  const cronBuiltinSkills = installHomeAiCronBuiltinSkills(plan, password);
  const cronRuntimeScripts = installHomeAiCronRuntimeScripts(plan, password);
  const backupArtifactAclRepair = repairHomeAiBackupArtifactAcls(plan, password);
  const codexSharedAuthRepair = repairCodexSharedAuthPermissions(plan, password);
  const gatewayStartScriptBridgeEnvRepair = repairGatewayStartScriptBridgeEnv(plan, password);

  const reloadedLabels = new Set();
  if (codexMobileLogRepair && codexMobileLogRepair.launchdReloadRequired && codexMobileLogRepair.launchdLabel && codexMobileLogRepair.launchdPlistPath) {
    runSudo("/bin/sh", ["-c", `/bin/launchctl bootout system ${shQuote(codexMobileLogRepair.launchdPlistPath)} >/dev/null 2>&1 || true`], password);
    runSudo("/bin/launchctl", ["bootstrap", "system", codexMobileLogRepair.launchdPlistPath], password);
    reloadedLabels.add(codexMobileLogRepair.launchdLabel);
  }
  if (listenerVoiceInputEnv && plan.restartLabels.includes(HOME_AI_LISTENER_LABEL)) {
    const plistPath = `/Library/LaunchDaemons/${HOME_AI_LISTENER_LABEL}.plist`;
    runSudo("/bin/sh", ["-c", `/bin/launchctl bootout system ${shQuote(plistPath)} >/dev/null 2>&1 || true`], password);
    runSudo("/bin/launchctl", ["bootstrap", "system", plistPath], password);
    reloadedLabels.add(HOME_AI_LISTENER_LABEL);
  }

  for (const label of plan.restartLabels) {
    if (reloadedLabels.has(label)) continue;
    runSudo("/bin/launchctl", ["kickstart", "-k", `system/${label}`], password);
  }

  const validations = [];
  if (codexMobileLogRepair) validations.push(codexMobileLogRepair);
  if (musicRuntimeCoverPermissionRepair) validations.push(musicRuntimeCoverPermissionRepair);
  if (postSyncMirrorResult) validations.push(postSyncMirrorResult);
  if (bridgeHostInstall) validations.push(Object.assign({ status: 0 }, bridgeHostInstall));
  if (cronInstall) validations.push(Object.assign({ status: 0 }, cronInstall));
  if (nasBackupMountInstall) validations.push(Object.assign({ status: 0 }, nasBackupMountInstall));
  if (listenerVoiceInputEnv) validations.push(Object.assign({ status: 0 }, listenerVoiceInputEnv));
  if (cronProfileAliases) validations.push(Object.assign({ status: 0 }, cronProfileAliases));
  if (cronBuiltinSkills) validations.push(Object.assign({ status: 0 }, cronBuiltinSkills));
  if (cronRuntimeScripts) validations.push(Object.assign({ status: 0 }, cronRuntimeScripts));
  if (backupArtifactAclRepair) validations.push(backupArtifactAclRepair);
  if (codexSharedAuthRepair) validations.push(codexSharedAuthRepair);
  if (gatewayStartScriptBridgeEnvRepair) validations.push(gatewayStartScriptBridgeEnvRepair);
  for (const check of plan.validation) {
    if (check.type === "production-file-hashes") validations.push(runFileHashValidation(plan, password));
    else if (check.type === "codex-auth-profile-audit") validations.push(runCodexAuthProfileAuditValidation(check, password));
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
    if (err?.stderr) payload.stderr = err.stderr;
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_DEV_ROOT,
  DEFAULT_MAC_ROOT,
  BACKUP_RSYNC_EXCLUDES,
  PLUGIN_TARGETS,
  PLUGIN_DEPLOY_ORDER,
  RSYNC_EXCLUDES,
  parseArgs,
  buildPlan,
  buildAllPluginPlan,
  assertExecutablePlan,
  runValidation,
  buildHomeAiCronProfileAliasPlan,
  buildPluginWorkspaceAuditTargetJson,
  buildHomeAiBridgeHostLaunchdPlist,
  buildHomeAiCronLaunchdPlist,
  buildHomeAiNasBackupMountLaunchdPlist,
  cronProfileAliasRowsFromManifest,
  buildRsyncArgs,
  shouldRepairCodexSharedAuthPermissions,
  repairHomeAiBackupArtifactAcls,
  postSyncRepairsForTarget,
  repairCodexMobileLogPermissions,
  repairMusicRuntimeCoverPermissions,
  deployDirtyFiles,
  isDeploySurfaceIncluded,
};
