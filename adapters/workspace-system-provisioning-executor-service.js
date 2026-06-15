"use strict";

const defaultFs = require("node:fs");
const defaultPath = require("node:path");
const { spawnSync: defaultSpawnSync } = require("node:child_process");
const { renderGatewayConfigYaml } = require("../scripts/build-gateway-profile-template");
const { readCapabilities } = require("../scripts/verify-gateway-profile-template-sync");

const DEFAULT_LIVE_ROOT = "/Users/hermes-host/HermesMobile";
const DEFAULT_LISTENER_USER = "hermes-host";
const DEFAULT_OWNER_USER = "hm-owner";
const DEFAULT_WORKER_GROUP = "hermes-workers";
const FILE_PLUGIN_ROOT_ENVS = Object.freeze([
  "HERMES_MOBILE_DOCX_ALLOWED_ROOTS",
  "HERMES_MOBILE_AUDIO_ALLOWED_ROOTS",
  "HERMES_MOBILE_IMAGE_ALLOWED_ROOTS",
  "HERMES_MOBILE_VIDEO_ALLOWED_ROOTS",
  "HERMES_MOBILE_HTTP_FILE_ROOTS",
]);
const FILE_PLUGIN_SINGLE_ROOT_ENVS = Object.freeze({
  HERMES_MOBILE_HTTP_CREDENTIAL_ROOTS: "${ROOT}/data/drive/users",
  HERMES_MOBILE_HTTP_SAVE_ROOT: "${ROOT}/data/artifacts/http-request",
  HERMES_MOBILE_VIDEO_OUTPUT_ROOT: "${ROOT}/data/artifacts/grok-videos",
});
const DEFAULT_MOBILE_BRIDGE_HOST_URL = "http://127.0.0.1:8798";
const MOBILE_BRIDGE_HOST_KEY_RELATIVE_PATH = "data/secrets/bridge-host.secret";
const STANDARD_PROFILE_PLUGINS = Object.freeze([
  "weather",
  "web",
  "http",
  "docx",
  "audio",
  "image",
  "cronjob",
]);
const WORKSPACE_PLUGIN_BINDINGS = Object.freeze([
  { id: "wardrobe", dir: ".hermes-wardrobe", required: ["access-key.txt", "config.json"] },
  { id: "finance", dir: ".hermes-finance", required: ["access-key.txt", "config.json"] },
  { id: "note", dir: ".hermes-note", required: ["access-key.txt", "config.json"] },
  { id: "health", dir: ".hermes-health", required: ["access-key.txt", "config.json"] },
  { id: "growth", dir: ".hermes-growth", required: ["access-key.txt", "config.json"] },
  { id: "moira", dir: ".hermes-moira", required: ["config.json"], requiredAny: [["access-key.txt", "workspace-key.txt"]] },
  { id: "email", dir: ".hermes-email", required: ["access-key.txt", "config.json"] },
]);
const GATEWAY_MCP_WORKER_ASSETS = Object.freeze([
  {
    id: "growth",
    files: [
      {
        source: ["plugins", "growth", "scripts", "growth-mcp-wrapper.js"],
        target: ["gateway-worker", "growth-mcp", "scripts", "growth-mcp-wrapper.js"],
      },
      {
        source: ["plugins", "growth", "src", "mcp", "growth-mcp-schemas.js"],
        target: ["gateway-worker", "growth-mcp", "src", "mcp", "growth-mcp-schemas.js"],
      },
    ],
  },
  {
    id: "moira",
    files: [
      {
        source: ["plugins", "moira", "scripts", "moira-mcp-stdio.mjs"],
        target: ["gateway-worker", "moira-mcp", "scripts", "moira-mcp-stdio.mjs"],
      },
      {
        source: ["plugins", "moira", "server", "moira-mcp-service.mjs"],
        target: ["gateway-worker", "moira-mcp", "server", "moira-mcp-service.mjs"],
      },
      {
        source: ["plugins", "moira", "package.json"],
        target: ["gateway-worker", "moira-mcp", "package.json"],
      },
      {
        kind: "directory",
        source: ["plugins", "moira", "server"],
        target: ["gateway-worker", "moira-mcp", "server"],
      },
      {
        kind: "directory",
        source: ["plugins", "moira", "web"],
        target: ["gateway-worker", "moira-mcp", "web"],
      },
    ],
  },
]);
const GATEWAY_MCP_SERVER_FILES = Object.freeze({
  wardrobe: ["gateway-worker", "wardrobe-mcp", "scripts", "wardrobe-mcp.py"],
  finance: ["gateway-worker", "finance-mcp", "scripts", "finance_mcp_stdio.py"],
  note: ["gateway-worker", "note-mcp", "scripts", "note_mcp_stdio.py"],
  health: ["gateway-worker", "health-mcp", "scripts", "mcp-health-wrapper.js"],
  growth: ["gateway-worker", "growth-mcp", "scripts", "growth-mcp-wrapper.js"],
  moira: ["gateway-worker", "moira-mcp", "scripts", "moira-mcp-stdio.mjs"],
  email: ["gateway-worker", "email-mcp", "scripts", "email-mcp-wrapper.py"],
});
const ALLOWED_ACTIONS = new Set([
  "ensure_mac_user",
  "ensure_workspace_roots",
  "ensure_workspace_acl",
  "repair_workspace_acl",
  "ensure_launchd_services",
  "run_workspace_onboarding_smokes",
]);

function text(value) {
  return String(value || "").trim();
}

function boolEnv(value) {
  return /^(1|true|yes|on)$/i.test(text(value));
}

function safeWorkspaceId(value) {
  const candidate = text(value).toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,79}$/.test(candidate) ? candidate : "";
}

function safeMacUser(value) {
  const candidate = text(value).toLowerCase();
  return /^hm-[a-z0-9][a-z0-9-]{0,62}$/.test(candidate) ? candidate : "";
}

function safeMacGroup(value) {
  const candidate = text(value).toLowerCase();
  return /^[a-z0-9][a-z0-9_.-]{0,62}$/.test(candidate) ? candidate : "";
}

function safeProfile(value) {
  const candidate = text(value);
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(candidate) ? candidate : "";
}

function safeLaunchdLabel(value) {
  const candidate = text(value).toLowerCase();
  return /^com\.hermesmobile\.gateway\.hm-[a-z0-9-]+\.(openai|deepseek|grok)\.[0-9]+$/.test(candidate)
    ? candidate
    : "";
}

function safeAbsoluteMacPath(value) {
  const candidate = text(value).replaceAll("\\", "/");
  if (!candidate.startsWith("/") || candidate.includes("\0") || /^[A-Za-z]:\//.test(candidate)) return "";
  const normalized = defaultPath.posix.normalize(candidate);
  if (normalized === "/" || normalized.includes("/../")) return "";
  return normalized;
}

function compactPath(value, liveRoot = DEFAULT_LIVE_ROOT) {
  return text(value).replaceAll(text(liveRoot) || DEFAULT_LIVE_ROOT, "<root>");
}

function boundedOutput(value) {
  return text(value)
    .replace(/[A-Za-z0-9+/=_-]{24,}/g, "[redacted]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .slice(-400);
}

function parseJsonSafe(value) {
  try {
    return JSON.parse(String(value || ""));
  } catch (_) {
    return null;
  }
}

function readJsonSafe(fs, file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return fallback;
  }
}

function writeJson(fs, file, value) {
  fs.mkdirSync(defaultPath.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function xmlEscape(value) {
  return text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function bashQuote(value) {
  return `'${String(value || "").replace(/'/g, "'\\''")}'`;
}

function workspaceIdsForWorker(worker = {}) {
  const out = [];
  for (const key of ["allowedWorkspaceIds", "allowed_workspace_ids", "skillWorkspaceIds", "skill_workspace_ids"]) {
    const raw = worker[key];
    const values = Array.isArray(raw) ? raw : (typeof raw === "string" ? raw.split(/[,;\s]+/) : []);
    for (const item of values) {
      const id = safeWorkspaceId(item);
      if (id && id !== "*" && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

function workspaceStoreId(value) {
  let candidate = text(value).toLowerCase();
  if (candidate.startsWith("workspace:")) candidate = candidate.slice("workspace:".length);
  if (candidate === "owner") return "owner-full";
  if (candidate === "owner-full") return "owner-full";
  return safeWorkspaceId(candidate);
}

function workspaceStoreIdsForWorker(worker = {}, keys = []) {
  const out = [];
  for (const key of keys) {
    const raw = worker[key];
    const values = Array.isArray(raw) ? raw : (typeof raw === "string" ? raw.split(/[,;\s]+/) : []);
    for (const item of values) {
      const id = workspaceStoreId(item);
      if (id && id !== "*" && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

function skillStoreIdForWorker(fields, worker = {}) {
  const skillWorkspaceIds = workspaceStoreIdsForWorker(worker, ["skillWorkspaceIds", "skill_workspace_ids"]);
  const privateSkillWorkspaceIds = skillWorkspaceIds.filter((id) => id !== "owner-full");
  if (privateSkillWorkspaceIds.length === 1) return privateSkillWorkspaceIds[0];
  if (skillWorkspaceIds.length === 1 && skillWorkspaceIds[0] === "owner-full") return "owner-full";

  const skillProfile = text(worker.skillProfile || worker.skill_profile);
  if (skillProfile === "owner-full") return "owner-full";
  if (skillProfile.toLowerCase().startsWith("workspace:")) {
    const id = workspaceStoreId(skillProfile);
    if (id) return id;
  }

  const allowedWorkspaceIds = workspaceStoreIdsForWorker(worker, ["allowedWorkspaceIds", "allowed_workspace_ids"]);
  const privateAllowedWorkspaceIds = allowedWorkspaceIds.filter((id) => id !== "owner-full");
  if (privateAllowedWorkspaceIds.length === 1) return privateAllowedWorkspaceIds[0];
  if (allowedWorkspaceIds.length === 1 && allowedWorkspaceIds[0] === "owner-full") return "owner-full";

  return fields.workspaceId === "owner" ? "owner-full" : fields.workspaceId;
}

function stringList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (typeof value === "string") return value.split(/[,;\s]+/).map(text).filter(Boolean);
  return [];
}

function mergeStringLists(...lists) {
  const out = [];
  for (const list of lists) {
    for (const item of stringList(list)) {
      if (!out.includes(item)) out.push(item);
    }
  }
  return out;
}

function providerFamily(worker = {}) {
  const provider = text(worker.provider || worker.provider_id).toLowerCase();
  const profile = text(worker.profile || worker.name).toLowerCase();
  if (provider.includes("deepseek") || profile.startsWith("deepseek")) return "deepseek";
  if (provider.includes("grok") || provider.includes("xai") || profile.startsWith("grok")) return "grok";
  return "openai";
}

function profilePluginName(id) {
  return `hermes-mobile-${id}`;
}

function createDefaultRunner(spawnSync) {
  return function run(command, args = [], options = {}) {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      input: options.input,
      stdio: options.input == null ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
    });
    return {
      status: result.status == null ? 1 : result.status,
      stdout: String(result.stdout || ""),
      stderr: String(result.stderr || ""),
    };
  };
}

function createWorkspaceSystemProvisioningExecutorService(options = {}) {
  const fs = options.fs || defaultFs;
  const path = options.path || defaultPath;
  const env = options.env || process.env || {};
  const platform = options.platform || process.platform;
  const spawnSync = options.spawnSync || defaultSpawnSync;
  const run = options.run || createDefaultRunner(spawnSync);
  const dryRun = Boolean(options.dryRun);
  const allowNonDarwin = Boolean(options.allowNonDarwin);
  const listenerUser = text(options.listenerUser || env.HERMES_MOBILE_LISTENER_USER) || DEFAULT_LISTENER_USER;
  const ownerUser = text(options.ownerUser || env.HERMES_MOBILE_OWNER_WORKER_USER) || DEFAULT_OWNER_USER;
  const workerGroup = safeMacGroup(options.workerGroup || env.HERMES_MOBILE_WORKER_GROUP) || DEFAULT_WORKER_GROUP;
  const liveRoot = safeAbsoluteMacPath(options.liveRoot || env.HERMES_MOBILE_ROOT || env.HERMES_WEB_ROOT || DEFAULT_LIVE_ROOT) || DEFAULT_LIVE_ROOT;
  const launchDaemonsDir = safeAbsoluteMacPath(options.launchDaemonsDir || "/Library/LaunchDaemons") || "/Library/LaunchDaemons";
  const useSudoWrites = options.useSudoWrites === undefined
    ? platform === "darwin" && typeof process.getuid === "function" && process.getuid() !== 0
    : Boolean(options.useSudoWrites);
  const enable = options.enabled === undefined
    ? boolEnv(env.HERMES_MOBILE_WORKSPACE_SYSTEM_EXECUTOR_ENABLED || env.HERMES_WEB_WORKSPACE_SYSTEM_EXECUTOR_ENABLED)
    : Boolean(options.enabled);
  const commandLog = [];

  function command(command, args = [], commandOptions = {}) {
    const publicArgs = args.map((item, index) => /key|secret|token/i.test(args[index - 1] || "") ? "[redacted]" : text(item));
    commandLog.push({ command, args: publicArgs });
    if (dryRun) return { status: 0, stdout: "", stderr: "" };
    return run(command, args, commandOptions);
  }

  function checked(commandName, args = [], commandOptions = {}) {
    const result = command(commandName, args, commandOptions);
    if (result.status !== 0) {
      const err = new Error(`command_failed:${path.basename(commandName)}`);
      err.details = { stderr: boundedOutput(result.stderr), stdout: boundedOutput(result.stdout), status: result.status };
      throw err;
    }
    return result;
  }

  function sudo(commandName, args = [], commandOptions = {}) {
    return checked("/usr/bin/sudo", ["-n", commandName, ...args], commandOptions);
  }

  function privileged(commandName, args = [], commandOptions = {}) {
    return useSudoWrites ? sudo(commandName, args, commandOptions) : checked(commandName, args, commandOptions);
  }

  function ensureMacPlatform() {
    if (platform === "darwin" || allowNonDarwin) return null;
    return { ok: false, error: "macos_system_executor_requires_darwin" };
  }

  function contextFields(context = {}) {
    const workspaceId = safeWorkspaceId(context.workspaceId);
    const macUser = safeMacUser(context.macUser);
    const paths = context.paths || {};
    const root = safeAbsoluteMacPath(paths.liveRoot || liveRoot) || liveRoot;
    const dataRoot = safeAbsoluteMacPath(paths.dataRoot || path.posix.join(root, "data"));
    const driveRoot = safeAbsoluteMacPath(paths.driveRoot || path.posix.join(root, "data", "drive"));
    const workspaceDataRoot = safeAbsoluteMacPath(paths.workspaceDataRoot || path.posix.join(driveRoot, "users", workspaceId));
    const workerHome = safeAbsoluteMacPath(paths.workerHome || path.posix.join("/Users", macUser));
    const workerWorkspaceRoot = safeAbsoluteMacPath(paths.workerWorkspaceRoot || path.posix.join(workerHome, "HermesWorkspace"));
    if (!workspaceId) return { error: "workspace_id_required" };
    if (!macUser) return { error: "mac_user_invalid" };
    for (const [key, value] of Object.entries({ root, dataRoot, driveRoot, workspaceDataRoot, workerHome, workerWorkspaceRoot })) {
      if (!value) return { error: `${key}_invalid` };
    }
    return { workspaceId, macUser, root, dataRoot, driveRoot, workspaceDataRoot, workerHome, workerWorkspaceRoot };
  }

  function manifestPathFor(fields, context = {}) {
    return safeAbsoluteMacPath(context.gateway?.manifestPath)
      || safeAbsoluteMacPath(options.manifestPath)
      || path.posix.join(fields.root, "data", "gateway-pool-manifest-mac.json");
  }

  function userExists(user) {
    return command("/usr/bin/id", ["-u", user]).status === 0;
  }

  function nextUid() {
    const result = checked("/usr/bin/dscl", [".", "-list", "/Users", "UniqueID"]);
    const uids = String(result.stdout || "").split(/\r?\n/)
      .map((line) => Number(line.trim().split(/\s+/).pop()))
      .filter((uid) => Number.isFinite(uid) && uid >= 501 && uid < 60000);
    return Math.max(501, ...uids) + 1;
  }

  function ensureWorkerGroupMembership(fields) {
    privileged("/usr/sbin/dseditgroup", ["-o", "edit", "-a", fields.macUser, "-t", "user", workerGroup]);
    return workerGroup;
  }

  function ensureMacUser(context = {}) {
    const platformFailure = ensureMacPlatform();
    if (platformFailure) return platformFailure;
    const fields = contextFields(context);
    if (fields.error) return { ok: false, error: fields.error };
    if (userExists(fields.macUser)) {
      return { ok: true, user: fields.macUser, existed: true, workerGroup: ensureWorkerGroupMembership(fields) };
    }
    const uid = nextUid();
    privileged("/usr/bin/dscl", [".", "-create", `/Users/${fields.macUser}`]);
    privileged("/usr/bin/dscl", [".", "-create", `/Users/${fields.macUser}`, "UserShell", "/bin/zsh"]);
    privileged("/usr/bin/dscl", [".", "-create", `/Users/${fields.macUser}`, "RealName", fields.macUser]);
    privileged("/usr/bin/dscl", [".", "-create", `/Users/${fields.macUser}`, "UniqueID", String(uid)]);
    privileged("/usr/bin/dscl", [".", "-create", `/Users/${fields.macUser}`, "PrimaryGroupID", "20"]);
    privileged("/usr/bin/dscl", [".", "-create", `/Users/${fields.macUser}`, "NFSHomeDirectory", fields.workerHome]);
    privileged("/usr/bin/dscl", [".", "-create", `/Users/${fields.macUser}`, "IsHidden", "1"]);
    privileged("/usr/sbin/createhomedir", ["-c", "-u", fields.macUser]);
    return { ok: true, user: fields.macUser, existed: false, uid, workerGroup: ensureWorkerGroupMembership(fields) };
  }

  function ensureDirectory(dir, mode = "700", owner = "") {
    privileged("/bin/mkdir", ["-p", dir]);
    if (owner) privileged("/usr/sbin/chown", ["-R", owner, dir]);
    privileged("/bin/chmod", [mode, dir]);
  }

  function completePluginBinding(root, binding) {
    if (!root || !binding?.dir) return false;
    const allRequired = (binding.required || []).every((file) => {
      try {
        return fs.statSync(path.posix.join(root, binding.dir, file)).isFile();
      } catch (_) {
        return false;
      }
    });
    if (!allRequired) return false;
    return (binding.requiredAny || []).every((choices) => {
      const files = Array.isArray(choices) ? choices : [choices];
      return files.some((file) => {
        try {
          return fs.statSync(path.posix.join(root, binding.dir, file)).isFile();
        } catch (_) {
          return false;
        }
      });
    });
  }

  function fileExists(file) {
    try {
      return fs.statSync(file).isFile();
    } catch (_) {
      return false;
    }
  }

  function pathExists(target) {
    try {
      fs.statSync(target);
      return true;
    } catch (_) {
      return false;
    }
  }

  function copyDirectory(source, target, owner) {
    if (useSudoWrites) {
      privileged("/bin/rm", ["-rf", target]);
      privileged("/bin/mkdir", ["-p", path.posix.dirname(target)]);
      privileged("/bin/cp", ["-R", source, target]);
      privileged("/usr/sbin/chown", ["-R", owner, target]);
      privileged("/bin/chmod", ["-R", "u+rwX,go-rwx", target]);
      return;
    }
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { recursive: true });
    checked("/usr/sbin/chown", ["-R", owner, target]);
    checked("/bin/chmod", ["-R", "u+rwX,go-rwx", target]);
  }

  function copyExecutableFile(source, target, owner) {
    if (useSudoWrites) {
      privileged("/bin/mkdir", ["-p", path.posix.dirname(target)]);
      privileged("/bin/cp", [source, target]);
      privileged("/usr/sbin/chown", [owner, target]);
      privileged("/bin/chmod", ["755", target]);
      return;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    try { fs.chmodSync(target, 0o755); } catch (_) {}
    if (owner) checked("/usr/sbin/chown", [owner, target]);
  }

  function syncGatewayMcpWorkerAssets(fields) {
    const synced = [];
    for (const asset of GATEWAY_MCP_WORKER_ASSETS) {
      const files = Array.isArray(asset.files) ? asset.files : [];
      if (!files.length) continue;
      const resolved = files.map((file) => ({
        kind: text(file.kind || "file").toLowerCase(),
        source: path.posix.join(fields.root, ...file.source),
        target: path.posix.join(fields.root, ...file.target),
      }));
      if (!resolved.every((file) => file.kind === "directory" ? pathExists(file.source) : fileExists(file.source))) continue;
      for (const file of resolved) {
        if (file.kind === "directory") copyDirectory(file.source, file.target, `${listenerUser}:staff`);
        else copyExecutableFile(file.source, file.target, `${listenerUser}:staff`);
      }
      synced.push(asset.id);
    }
    return synced;
  }

  function syncWorkspacePluginBindings(fields) {
    const synced = [];
    for (const binding of WORKSPACE_PLUGIN_BINDINGS) {
      if (!completePluginBinding(fields.workspaceDataRoot, binding)) continue;
      const source = path.posix.join(fields.workspaceDataRoot, binding.dir);
      const target = path.posix.join(fields.workerWorkspaceRoot, binding.dir);
      copyDirectory(source, target, `${fields.macUser}:staff`);
      synced.push(binding.id);
    }
    return synced;
  }

  function availableWorkspacePluginToolsets(fields) {
    const out = [];
    for (const binding of WORKSPACE_PLUGIN_BINDINGS) {
      if (!completePluginBinding(fields.workerWorkspaceRoot, binding)) continue;
      const mcpServerFile = GATEWAY_MCP_SERVER_FILES[binding.id];
      if (!mcpServerFile || !fileExists(path.posix.join(fields.root, ...mcpServerFile))) continue;
      out.push(binding.id);
    }
    return out;
  }

  function ensureWorkspaceRoots(context = {}) {
    const platformFailure = ensureMacPlatform();
    if (platformFailure) return platformFailure;
    const fields = contextFields(context);
    if (fields.error) return { ok: false, error: fields.error };
    const skillStoreId = fields.workspaceId === "owner" ? "owner-full" : fields.workspaceId;
    const skillRoot = path.posix.join(fields.dataRoot, "skill-profiles", skillStoreId);
    ensureDirectory(fields.workerWorkspaceRoot, "700", `${fields.macUser}:staff`);
    ensureDirectory(path.posix.join(fields.workerWorkspaceRoot, ".hermes-gateway"), "700", `${fields.macUser}:staff`);
    ensureDirectory(path.posix.join(fields.workerWorkspaceRoot, ".hermes-gateway", "profiles"), "700", `${fields.macUser}:staff`);
    ensureDirectory(path.posix.join(fields.workerWorkspaceRoot, ".hermes-gateway", "logs"), "700", `${fields.macUser}:staff`);
    ensureDirectory(fields.workspaceDataRoot, "700", `${fields.macUser}:staff`);
    ensureDirectory(path.posix.join(fields.dataRoot, "artifacts", "http-request"), "770", `${listenerUser}:staff`);
    ensureDirectory(path.posix.join(fields.dataRoot, "artifacts", "grok-videos"), "770", `${listenerUser}:staff`);
    ensureDirectory(path.posix.join(skillRoot, "skills"), "700", `${fields.macUser}:staff`);
    ensureDirectory(path.posix.join(skillRoot, "memories"), "700", `${fields.macUser}:staff`);
    return { ok: true, root: compactPath(fields.root, fields.root), workspaceDataRoot: compactPath(fields.workspaceDataRoot, fields.root) };
  }

  function chmodAcl(user, target, permissions, recursive = false) {
    const acl = `user:${user} allow ${permissions}`;
    privileged("/bin/chmod", [recursive ? "-R" : "", "+a", acl, target].filter(Boolean));
  }

  function grantGatewayWorkerSecretAcls(fields, worker, manifestPath) {
    const parentPerms = "search,readattr,readextattr,readsecurity";
    const readPerms = "read,readattr,readextattr,readsecurity";
    const targets = [
      manifestPath,
      worker.apiKeyFile || worker.api_key_file || worker.apiKeyPath || worker.api_key_path,
      worker.deepseekApiKeyFile || worker.deepseek_api_key_file || worker.providerKeyFile || worker.provider_key_file,
      path.posix.join(fields.root, MOBILE_BRIDGE_HOST_KEY_RELATIVE_PATH),
    ].filter(Boolean);
    const fallbackProviderKey = path.posix.join(fields.dataRoot, "secrets", "deepseek-api-key.secret");
    if (fileExists(fallbackProviderKey)) targets.push(fallbackProviderKey);
    const parentDirs = [
      path.posix.join(fields.dataRoot, "secrets"),
      path.posix.join(fields.dataRoot, "secrets", "gateway-workers"),
    ];
    for (const user of [...new Set([fields.macUser, listenerUser])]) {
      for (const dir of parentDirs) {
        if (pathExists(dir)) chmodAcl(user, dir, parentPerms);
      }
      for (const target of [...new Set(targets)]) {
        if (fileExists(target)) chmodAcl(user, target, readPerms);
      }
    }
  }

  function sharedCodexAuthRoot(fields) {
    return path.posix.join(fields.root, "gateway-worker", "telemetry", "profiles", "shared-auth");
  }

  function grantSharedCodexAuthAcls(fields, authRoot) {
    const parentPerms = "search,readattr,readextattr,readsecurity";
    const authDirPerms = "list,add_file,search,delete_child,readattr,writeattr,readextattr,writeextattr,readsecurity,file_inherit,directory_inherit";
    const authFilePerms = "read,write,append,readattr,writeattr,readextattr,writeextattr,readsecurity";
    const parents = [
      path.posix.join(fields.root, "gateway-worker"),
      path.posix.join(fields.root, "gateway-worker", "telemetry"),
      path.posix.join(fields.root, "gateway-worker", "telemetry", "profiles"),
    ].filter((dir) => pathExists(dir));
    const authDirs = [authRoot].filter((dir) => pathExists(dir));
    const files = [
      path.posix.join(authRoot, "auth.json"),
      path.posix.join(authRoot, "auth.lock"),
    ].filter((file) => fileExists(file));
    for (const user of [...new Set([fields.macUser, listenerUser])]) {
      for (const dir of parents) chmodAcl(user, dir, parentPerms);
      for (const dir of authDirs) chmodAcl(user, dir, authDirPerms);
      for (const file of files) chmodAcl(user, file, authFilePerms);
    }
  }

  function linkFile(source, target) {
    if (useSudoWrites) {
      sudo("/bin/rm", ["-rf", target]);
      sudo("/bin/ln", ["-sfn", source, target]);
      return;
    }
    try { fs.rmSync(target, { recursive: true, force: true }); } catch (_) {}
    fs.symlinkSync(source, target);
  }

  function chownSymlinkIfPossible(file, owner) {
    if (!owner) return;
    try {
      privileged("/usr/sbin/chown", ["-h", owner, file]);
    } catch (_) {}
  }

  function ensureOpenAiCodexAuthLinks(fields, worker, dir) {
    if (providerFamily(worker) !== "openai") return { linked: false };
    const authRoot = sharedCodexAuthRoot(fields);
    const authFile = path.posix.join(authRoot, "auth.json");
    const lockFile = path.posix.join(authRoot, "auth.lock");
    if (!fileExists(authFile)) return { linked: false, missing: compactPath(authFile, fields.root) };
    if (!pathExists(lockFile)) {
      writeTextFile(lockFile, "", "644", `${listenerUser}:staff`);
    }
    grantSharedCodexAuthAcls(fields, authRoot);
    linkFile(authFile, path.posix.join(dir, "auth.json"));
    linkFile(lockFile, path.posix.join(dir, "auth.lock"));
    return { linked: true };
  }

  function repairWorkspaceAcl(context = {}) {
    const platformFailure = ensureMacPlatform();
    if (platformFailure) return platformFailure;
    const fields = contextFields(context);
    if (fields.error) return { ok: false, error: fields.error };
    const skillRoot = path.posix.join(fields.dataRoot, "skill-profiles", fields.workspaceId);
    const parents = [
      path.posix.dirname(fields.root),
      fields.root,
      fields.dataRoot,
      fields.driveRoot,
      path.posix.join(fields.driveRoot, "users"),
      path.posix.join(fields.dataRoot, "skill-profiles"),
    ];
    const secretParents = [
      path.posix.join(fields.dataRoot, "secrets"),
      path.posix.join(fields.dataRoot, "secrets", "gateway-workers"),
    ].filter((dir) => pathExists(dir));
    const parentPerms = "list,search,readattr,readextattr,readsecurity";
    for (const user of [fields.macUser, listenerUser, ownerUser]) {
      if (!safeMacUser(user) && user !== listenerUser) continue;
      for (const dir of [...new Set([...parents, ...secretParents])]) chmodAcl(user, dir, parentPerms);
    }
    for (const target of [fields.workspaceDataRoot, skillRoot]) {
      privileged("/bin/chmod", ["-RN", target]);
      privileged("/bin/chmod", ["-R", "u+rwX,go-rwx", target]);
    }
    const writePerms = "list,add_file,search,add_subdirectory,delete_child,readattr,writeattr,readextattr,writeextattr,readsecurity,read,write,append,execute,file_inherit,directory_inherit";
    for (const user of [...new Set([fields.macUser, ownerUser, listenerUser])]) {
      chmodAcl(user, fields.workspaceDataRoot, writePerms, true);
      chmodAcl(user, skillRoot, writePerms, true);
    }
    return { ok: true, aclRepaired: true, workspaceDataRoot: compactPath(fields.workspaceDataRoot, fields.root), skillRoot: compactPath(skillRoot, fields.root) };
  }

  function profileDir(fields, profile) {
    return path.posix.join(fields.workerWorkspaceRoot, ".hermes-gateway", "profiles", profile);
  }

  function startScriptPath(fields, profile) {
    return path.posix.join(fields.workerWorkspaceRoot, ".hermes-gateway", `start-${profile}.sh`);
  }

  function labelFor(fields, worker, ordinal) {
    const existing = safeLaunchdLabel(worker.launchdLabel || worker.launchd_label);
    if (existing && existing.includes(`.${fields.macUser}.`)) return existing;
    return `com.hermesmobile.gateway.${fields.macUser}.${providerFamily(worker)}.${ordinal}`;
  }

  function renderStartScript(fields, worker, manifestPath) {
    const profile = safeProfile(worker.profile || worker.name);
    const port = Number(worker.port || 0);
    const profileRoot = profileDir(fields, profile);
    const fileRoots = "${ROOT}/data/drive,${ROOT}/data/uploads,${ROOT}/data/artifacts";
    const envLines = [
      ...FILE_PLUGIN_ROOT_ENVS.map((name) => `export ${name}="${fileRoots}"`),
      ...Object.entries(FILE_PLUGIN_SINGLE_ROOT_ENVS).map(([name, value]) => `export ${name}="${value}"`),
    ].join("\n");
    return `#!/bin/bash
set -euo pipefail
ROOT=${bashQuote(fields.root)}
PROFILE=${bashQuote(profile)}
PORT=${bashQuote(String(port))}
MANIFEST=${bashQuote(manifestPath)}
PROFILE_DIR=${bashQuote(profileRoot)}
RUNTIME_PYTHON="$ROOT/runtime/hermes-agent-official/venv/bin/python"
RUNTIME_SOURCE="$ROOT/runtime/hermes-agent-official/source"
RUNTIME_OVERRIDES="$ROOT/app/gateway-runtime-overrides"
FILE_PLUGIN_ALLOWED_ROOTS="$ROOT/data/drive,$ROOT/data/uploads,$ROOT/data/artifacts"
MOBILE_BRIDGE_HOST_URL="\${HERMES_MOBILE_BRIDGE_HOST_URL:-\${HERMES_WEB_BRIDGE_HOST_URL:-${DEFAULT_MOBILE_BRIDGE_HOST_URL}}}"
MOBILE_BRIDGE_HOST_KEY_PATH="\${HERMES_MOBILE_BRIDGE_HOST_KEY_PATH:-\${HERMES_WEB_BRIDGE_HOST_KEY_PATH:-$ROOT/${MOBILE_BRIDGE_HOST_KEY_RELATIVE_PATH}}}"
${envLines}
read_worker_field() {
  "$RUNTIME_PYTHON" - "$MANIFEST" "$PROFILE" "$1" <<'PY'
import json, sys
manifest_path, profile, field = sys.argv[1:4]
try:
    data = json.load(open(manifest_path, encoding="utf-8-sig"))
except Exception:
    raise SystemExit(0)
for worker in data.get("workers") or []:
    candidate = str(worker.get("profile") or worker.get("name") or "").strip()
    if candidate != profile:
        continue
    for name in field.split("|"):
        value = worker.get(name)
        if value:
            print(str(value).strip())
            raise SystemExit(0)
PY
}
api_key_file="$(read_worker_field 'apiKeyFile|api_key_file|apiKeyPath|api_key_path')"
api_server_key="$(read_worker_field 'apiKey|api_key')"
if [ -n "$api_key_file" ] && [ -s "$api_key_file" ]; then
  api_server_key="$(tr -d '\\r\\n' < "$api_key_file")"
fi
if [ -z "$api_server_key" ]; then
  echo "missing Gateway API key for $PROFILE" >&2
  exit 1
fi
deepseek_api_key=""
deepseek_api_key_file="$(read_worker_field 'deepseekApiKeyFile|deepseek_api_key_file|providerKeyFile|provider_key_file')"
if [ -z "$deepseek_api_key_file" ]; then
  deepseek_api_key_file="$ROOT/data/secrets/deepseek-api-key.secret"
fi
if [ -s "$deepseek_api_key_file" ]; then
  deepseek_api_key="$(tr -d '\\r\\n' < "$deepseek_api_key_file")"
fi
mkdir -p "$PROFILE_DIR/logs"
exec env HOME=${bashQuote(fields.workerHome)} HERMES_HOME="$PROFILE_DIR" HERMES_PROFILE="$PROFILE" HERMES_WORKSPACE_ROOT=${bashQuote(fields.workerWorkspaceRoot)} HERMES_GOOGLE_PROFILE_HOME="$PROFILE_DIR" HERMES_MOBILE_BRIDGE_HOST_URL="$MOBILE_BRIDGE_HOST_URL" HERMES_WEB_BRIDGE_HOST_URL="$MOBILE_BRIDGE_HOST_URL" HERMES_MOBILE_BRIDGE_HOST_KEY_PATH="$MOBILE_BRIDGE_HOST_KEY_PATH" HERMES_WEB_BRIDGE_HOST_KEY_PATH="$MOBILE_BRIDGE_HOST_KEY_PATH" PYTHONPATH="$RUNTIME_OVERRIDES:$RUNTIME_SOURCE" PATH="$ROOT/runtime/node-current/bin:$ROOT/runtime/hermes-agent-official/venv/bin:/usr/local/bin:/usr/bin:/bin" HERMES_ACCEPT_HOOKS=1 HERMES_KANBAN_DISPATCH_IN_GATEWAY=0 API_SERVER_KEY="$api_server_key" DEEPSEEK_API_KEY="$deepseek_api_key" "$RUNTIME_PYTHON" -m hermes_cli.main gateway run --replace --accept-hooks
`;
  }

  function renderPlist(fields, worker, label, startScript) {
    const profile = safeProfile(worker.profile || worker.name);
    const logs = path.posix.join(fields.workerWorkspaceRoot, ".hermes-gateway", "logs");
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xmlEscape(label)}</string>
  <key>UserName</key><string>${xmlEscape(fields.macUser)}</string>
  <key>WorkingDirectory</key><string>${xmlEscape(profileDir(fields, profile))}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(startScript)}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key><string>${xmlEscape(fields.workerHome)}</string>
    <key>HERMES_HOME</key><string>${xmlEscape(profileDir(fields, profile))}</string>
    <key>HERMES_PROFILE</key><string>${xmlEscape(profile)}</string>
    <key>HERMES_WORKSPACE_ROOT</key><string>${xmlEscape(fields.workerWorkspaceRoot)}</string>
    <key>PATH</key><string>${xmlEscape(`${fields.root}/runtime/node-current/bin:${fields.root}/runtime/hermes-agent-official/venv/bin:/usr/local/bin:/usr/bin:/bin`)}</string>
  </dict>
  <key>RunAtLoad</key><false/>
  <key>KeepAlive</key><false/>
  <key>StandardOutPath</key><string>${xmlEscape(path.posix.join(logs, `${profile}.stdout.log`))}</string>
  <key>StandardErrorPath</key><string>${xmlEscape(path.posix.join(logs, `${profile}.stderr.log`))}</string>
</dict>
</plist>
`;
  }

  function writeTextFile(file, content, mode, owner = "") {
    if (useSudoWrites) {
      sudo("/bin/mkdir", ["-p", path.posix.dirname(file)]);
      sudo("/usr/bin/tee", [file], { input: content });
      if (owner) sudo("/usr/sbin/chown", [owner, file]);
      sudo("/bin/chmod", [mode, file]);
      return;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
    try { fs.chmodSync(file, Number.parseInt(mode, 8)); } catch (_) {}
    if (owner) checked("/usr/sbin/chown", [owner, file]);
  }

  function ensureProfileMaterialized(fields, worker, manifestPath) {
    const profile = safeProfile(worker.profile || worker.name);
    const dir = profileDir(fields, profile);
    const skillRoot = path.posix.join(fields.dataRoot, "skill-profiles", skillStoreIdForWorker(fields, worker));
    const logsDir = path.posix.join(dir, "logs");
    if (useSudoWrites) {
      privileged("/bin/mkdir", ["-p", dir]);
      privileged("/bin/mkdir", ["-p", logsDir]);
    } else {
      fs.mkdirSync(dir, { recursive: true });
      fs.mkdirSync(logsDir, { recursive: true });
    }
    for (const [name, target] of [["skills", path.posix.join(skillRoot, "skills")], ["memories", path.posix.join(skillRoot, "memories")]]) {
      if (useSudoWrites) privileged("/bin/mkdir", ["-p", target]);
      else fs.mkdirSync(target, { recursive: true });
      const link = path.posix.join(dir, name);
      if (useSudoWrites) {
        sudo("/bin/rm", ["-rf", link]);
        sudo("/bin/ln", ["-sfn", target, link]);
      } else {
        try { fs.rmSync(link, { recursive: true, force: true }); } catch (_) {}
        try { fs.symlinkSync(target, link, "dir"); } catch (_) {}
      }
    }
    const runtimePython = path.posix.join(fields.root, "runtime", "hermes-agent-official", "venv", "bin", "python");
    const nodeCommand = path.posix.join(fields.root, "runtime", "node-current", "bin", "node");
    const pluginValues = {};
    for (const binding of WORKSPACE_PLUGIN_BINDINGS) {
      if (!completePluginBinding(fields.workerWorkspaceRoot, binding)) continue;
      const workspaceRoot = fields.workerWorkspaceRoot;
      if (binding.id === "wardrobe" && fileExists(path.posix.join(fields.root, "gateway-worker", "wardrobe-mcp", "scripts", "wardrobe-mcp.py"))) Object.assign(pluginValues, {
        wardrobe_enabled: "1",
        wardrobe_mcp_python: runtimePython,
        wardrobe_mcp_path: path.posix.join(fields.root, "gateway-worker", "wardrobe-mcp", "scripts", "wardrobe-mcp.py"),
        wardrobe_workspace: workspaceRoot,
      });
      if (binding.id === "finance" && fileExists(path.posix.join(fields.root, "gateway-worker", "finance-mcp", "scripts", "finance_mcp_stdio.py"))) Object.assign(pluginValues, {
        finance_enabled: "1",
        finance_mcp_python: runtimePython,
        finance_mcp_path: path.posix.join(fields.root, "gateway-worker", "finance-mcp", "scripts", "finance_mcp_stdio.py"),
        finance_workspace: workspaceRoot,
        finance_mcp_api_base_url: "http://127.0.0.1:8791",
      });
      if (binding.id === "note" && fileExists(path.posix.join(fields.root, "gateway-worker", "note-mcp", "scripts", "note_mcp_stdio.py"))) Object.assign(pluginValues, {
        note_enabled: "1",
        note_mcp_python: runtimePython,
        note_mcp_path: path.posix.join(fields.root, "gateway-worker", "note-mcp", "scripts", "note_mcp_stdio.py"),
        note_workspace: workspaceRoot,
        note_mcp_api_base_url: "http://127.0.0.1:4181",
      });
      if (binding.id === "health" && fileExists(path.posix.join(fields.root, "gateway-worker", "health-mcp", "scripts", "mcp-health-wrapper.js"))) Object.assign(pluginValues, {
        health_enabled: "1",
        health_mcp_command: nodeCommand,
        health_mcp_path: path.posix.join(fields.root, "gateway-worker", "health-mcp", "scripts", "mcp-health-wrapper.js"),
        health_workspace: workspaceRoot,
        health_mcp_api_base_url: "http://127.0.0.1:4877",
      });
      if (binding.id === "growth" && fileExists(path.posix.join(fields.root, "gateway-worker", "growth-mcp", "scripts", "growth-mcp-wrapper.js"))) Object.assign(pluginValues, {
        growth_enabled: "1",
        growth_mcp_command: nodeCommand,
        growth_mcp_path: path.posix.join(fields.root, "gateway-worker", "growth-mcp", "scripts", "growth-mcp-wrapper.js"),
        growth_workspace: workspaceRoot,
        growth_mcp_api_base_url: "http://127.0.0.1:4881",
      });
      if (binding.id === "moira" && fileExists(path.posix.join(fields.root, "gateway-worker", "moira-mcp", "scripts", "moira-mcp-stdio.mjs"))) Object.assign(pluginValues, {
        moira_enabled: "1",
        moira_mcp_command: nodeCommand,
        moira_mcp_path: path.posix.join(fields.root, "gateway-worker", "moira-mcp", "scripts", "moira-mcp-stdio.mjs"),
        moira_workspace: workspaceRoot,
        moira_mcp_api_base_url: "http://127.0.0.1:4174",
      });
      if (binding.id === "email" && fileExists(path.posix.join(fields.root, "gateway-worker", "email-mcp", "scripts", "email-mcp-wrapper.py"))) Object.assign(pluginValues, {
        email_enabled: "1",
        email_mcp_python: runtimePython,
        email_mcp_path: path.posix.join(fields.root, "gateway-worker", "email-mcp", "scripts", "email-mcp-wrapper.py"),
        email_workspace: workspaceRoot,
        email_mcp_api_base_url: "http://127.0.0.1:5175",
      });
    }
    const configFile = path.posix.join(dir, "config.yaml");
    const configYaml = renderGatewayConfigYaml({
      configKind: "profile",
      values: Object.assign({
        profile,
        port: String(worker.port || ""),
        profile_link: dir,
        provider: worker.provider || "openai-codex",
      }, Object.fromEntries(STANDARD_PROFILE_PLUGINS.map((id) => [`${id}_plugin_enabled`, "1"])), pluginValues),
    });
    writeTextFile(configFile, configYaml, "600", `${fields.macUser}:staff`);
    writeTextFile(startScriptPath(fields, profile), renderStartScript(fields, worker, manifestPath), "700", `${fields.macUser}:staff`);
    privileged("/usr/sbin/chown", ["-R", `${fields.macUser}:staff`, path.posix.join(fields.workerWorkspaceRoot, ".hermes-gateway")]);
    const codexAuth = ensureOpenAiCodexAuthLinks(fields, worker, dir);
    if (codexAuth.linked) {
      chownSymlinkIfPossible(path.posix.join(dir, "auth.json"), `${fields.macUser}:staff`);
      chownSymlinkIfPossible(path.posix.join(dir, "auth.lock"), `${fields.macUser}:staff`);
    }
    return { dir, capabilities: readCapabilities(configFile), codexAuth };
  }

  function writeManifestBackup(manifestPath) {
    if (dryRun || !fs.existsSync(manifestPath)) return "";
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const backup = `${manifestPath}.${stamp}.workspace-onboarding.bak`;
    fs.copyFileSync(manifestPath, backup);
    return backup;
  }

  function workspaceWorkers(manifest, fields, context = {}) {
    const profiles = new Set(Array.isArray(context.gateway?.profiles) ? context.gateway.profiles.map(safeProfile).filter(Boolean) : []);
    return (Array.isArray(manifest.workers) ? manifest.workers : [])
      .filter((worker) => worker && worker.enabled !== false)
      .filter((worker) => workspaceIdsForWorker(worker).includes(fields.workspaceId) || profiles.has(safeProfile(worker.profile || worker.name)));
  }

  function ensureLaunchdServices(context = {}) {
    const platformFailure = ensureMacPlatform();
    if (platformFailure) return platformFailure;
    const fields = contextFields(context);
    if (fields.error) return { ok: false, error: fields.error };
    const manifestPath = manifestPathFor(fields, context);
    const manifest = readJsonSafe(fs, manifestPath, { enabled: true, workers: [] });
    const syncedGatewayMcpAssets = syncGatewayMcpWorkerAssets(fields);
    const syncedPluginBindings = syncWorkspacePluginBindings(fields);
    const workers = workspaceWorkers(manifest, fields, context);
    if (!workers.length) return { ok: false, error: "workspace_gateway_workers_missing" };
    const kickstart = context.gateway?.kickstart === true
      || context.gateway?.restart === true
      || context.gateway?.restartLoaded === true;
    const providerOrdinals = {};
    const touched = [];
    const kickstarted = [];
    const codexAuth = [];
    let changed = false;
    for (const worker of workers) {
      const profile = safeProfile(worker.profile || worker.name);
      if (!profile) return { ok: false, error: "gateway_profile_invalid" };
      const provider = providerFamily(worker);
      providerOrdinals[provider] = (providerOrdinals[provider] || 0) + 1;
      const label = labelFor(fields, worker, providerOrdinals[provider]);
      grantGatewayWorkerSecretAcls(fields, worker, manifestPath);
      const materialized = ensureProfileMaterialized(fields, worker, manifestPath);
      codexAuth.push({ profile, linked: Boolean(materialized.codexAuth?.linked), missing: materialized.codexAuth?.missing || "" });
      const dir = materialized.dir;
      const configPath = path.posix.join(dir, "config.yaml");
      const statePath = path.posix.join(dir, "state.db");
      const responsePath = path.posix.join(dir, "response_store.db");
      const profileToolsets = mergeStringLists(materialized.capabilities?.toolsets, availableWorkspacePluginToolsets(fields));
      const profileMcpServers = mergeStringLists(materialized.capabilities?.mcpServers, availableWorkspacePluginToolsets(fields));
      if (worker.osUser !== fields.macUser) { worker.osUser = fields.macUser; changed = true; }
      if (worker.launchdLabel !== label) { worker.launchdLabel = label; changed = true; }
      if (worker.configPath !== configPath) { worker.configPath = configPath; changed = true; }
      if (worker.telemetryStateDbPath !== statePath) { worker.telemetryStateDbPath = statePath; changed = true; }
      if (worker.telemetryResponseStoreDbPath !== responsePath) { worker.telemetryResponseStoreDbPath = responsePath; changed = true; }
      const mergedToolsets = mergeStringLists(worker.toolsets, profileToolsets);
      if (JSON.stringify(stringList(worker.toolsets)) !== JSON.stringify(mergedToolsets)) {
        worker.toolsets = mergedToolsets;
        changed = true;
      }
      const mergedMcpServers = mergeStringLists(worker.mcpServers || worker.mcp_servers, profileMcpServers);
      if (JSON.stringify(stringList(worker.mcpServers || worker.mcp_servers)) !== JSON.stringify(mergedMcpServers)) {
        worker.mcpServers = mergedMcpServers;
        delete worker.mcp_servers;
        changed = true;
      }
      const plistFile = path.posix.join(launchDaemonsDir, `${label}.plist`);
      const startScript = startScriptPath(fields, profile);
      writeTextFile(plistFile, renderPlist(fields, worker, label, startScript), "644", "root:wheel");
      const launchdPrint = command("/bin/launchctl", ["print", `system/${label}`]);
      if (launchdPrint.status !== 0) {
        privileged("/bin/launchctl", ["bootstrap", "system", plistFile]);
      }
      if (kickstart) {
        privileged("/bin/launchctl", ["kickstart", "-k", `system/${label}`]);
        kickstarted.push({ profile, label });
      }
      touched.push({ profile, label, plist: plistFile, profileDir: compactPath(dir, fields.root) });
    }
    let backup = "";
    if (changed) {
      backup = writeManifestBackup(manifestPath);
      writeJson(fs, manifestPath, manifest);
    }
    return {
      ok: true,
      workers: touched,
      manifestUpdated: changed,
      backup: backup ? path.basename(backup) : "",
      syncedGatewayMcpAssets,
      syncedPluginBindings,
      codexAuth,
      kickstarted,
    };
  }

  function runSmokeScript(root, script, args = []) {
    const node = safeAbsoluteMacPath(options.nodePath || path.posix.join(root, "runtime", "node-current", "bin", "node"));
    const result = command(node, [script, ...args]);
    return {
      ok: result.status === 0,
      status: result.status,
      stdout: boundedOutput(result.stdout),
      stderr: boundedOutput(result.stderr),
    };
  }

  function auditIssueTargetsWorkspace(issue, workspaceId, profiles = new Set()) {
    const parts = text(issue).split(":").map((item) => item.trim()).filter(Boolean);
    return parts.includes(workspaceId) || parts.some((part) => profiles.has(part));
  }

  function profileAuditSummary(result, workspaceId) {
    const audit = parseJsonSafe(result.stdout);
    const base = {
      status: result.status,
      stderr: boundedOutput(result.stderr),
      stdout: boundedOutput(result.stdout),
      targetWorkspace: workspaceId,
    };
    if (!audit || typeof audit !== "object") {
      return Object.assign({}, base, {
        ok: false,
        error: "profile_audit_json_unavailable",
        targetIssues: ["profile_audit_json_unavailable"],
      });
    }
    const target = audit.byWorkspace?.[workspaceId] || null;
    const targetProfiles = new Set(
      (Array.isArray(target?.workers) ? target.workers : [])
        .map((worker) => text(worker.profile))
        .filter(Boolean),
    );
    const issues = Array.isArray(audit.issues) ? audit.issues.map(text).filter(Boolean) : [];
    const warnings = Array.isArray(audit.warnings) ? audit.warnings.map(text).filter(Boolean) : [];
    const targetIssues = issues.filter((issue) => auditIssueTargetsWorkspace(issue, workspaceId, targetProfiles));
    const ignoredIssues = issues.filter((issue) => !auditIssueTargetsWorkspace(issue, workspaceId, targetProfiles));
    const targetWarnings = warnings.filter((warning) => auditIssueTargetsWorkspace(warning, workspaceId, targetProfiles));
    if (!target) targetIssues.push(`workspace_audit_missing:${workspaceId}`);
    return Object.assign({}, base, {
      ok: targetIssues.length === 0,
      auditOk: Boolean(audit.ok),
      targetFound: Boolean(target),
      targetIssues,
      targetWarnings: targetWarnings.slice(0, 20),
      ignoredIssueCount: ignoredIssues.length,
      ignoredIssues: ignoredIssues.slice(0, 20),
    });
  }

  function runWorkspaceOnboardingSmokes(context = {}) {
    const platformFailure = ensureMacPlatform();
    if (platformFailure) return platformFailure;
    const fields = contextFields(context);
    if (fields.error) return { ok: false, error: fields.error };
    const appScripts = path.posix.join(fields.root, "app", "scripts");
    const pluginIds = Array.isArray(context.pluginIds) ? context.pluginIds.map((item) => text(item).toLowerCase()).filter(Boolean) : [];
    const profileAuditArgs = [
      "--root", fields.root,
      "--expected-workspaces", fields.workspaceId,
      "--json",
      "--no-strict",
    ];
    if (pluginIds.length) {
      profileAuditArgs.push(
        "--expected-plugins", pluginIds.join(","),
        "--required-workspace-plugins", `${fields.workspaceId}:${pluginIds.join(",")}`,
      );
    }
    const node = safeAbsoluteMacPath(options.nodePath || path.posix.join(fields.root, "runtime", "node-current", "bin", "node"));
    const profileAuditResult = command(node, [path.posix.join(appScripts, "macos-production-profile-audit.js"), ...profileAuditArgs]);
    const profileAudit = profileAuditSummary(profileAuditResult, fields.workspaceId);
    if (!profileAudit.ok) return { ok: false, error: "profile_audit_failed", profileAudit };
    const toolsets = runSmokeScript(fields.root, path.posix.join(appScripts, "macos-gateway-manifest-toolset-smoke.js"), [
      "--root", fields.root,
      "--json",
    ]);
    if (!toolsets.ok) return { ok: false, error: "manifest_toolset_smoke_failed", profileAudit, toolsets };
    const acl = runSmokeScript(fields.root, path.posix.join(appScripts, "macos-worker-filesystem-access-harness.js"), [
      "--root", fields.root,
      "--json",
    ]);
    if (!acl.ok) return { ok: false, error: "worker_acl_harness_failed", profileAudit, toolsets, acl };
    return { ok: true, profileAudit, toolsets, acl };
  }

  async function runStep(action, context = {}) {
    const normalizedAction = text(action);
    if (!enable && !options.forceEnabled) return { ok: false, error: "workspace_system_executor_disabled" };
    if (!ALLOWED_ACTIONS.has(normalizedAction)) return { ok: false, error: `system_action_unavailable:${normalizedAction}` };
    try {
      if (normalizedAction === "ensure_mac_user") return ensureMacUser(context);
      if (normalizedAction === "ensure_workspace_roots") return ensureWorkspaceRoots(context);
      if (normalizedAction === "ensure_workspace_acl" || normalizedAction === "repair_workspace_acl") return repairWorkspaceAcl(context);
      if (normalizedAction === "ensure_launchd_services") return ensureLaunchdServices(context);
      if (normalizedAction === "run_workspace_onboarding_smokes") return runWorkspaceOnboardingSmokes(context);
    } catch (err) {
      return { ok: false, error: text(err.message) || "workspace_system_executor_failed", details: err.details || undefined };
    }
    return { ok: false, error: `system_action_unavailable:${normalizedAction}` };
  }

  return {
    actions: [...ALLOWED_ACTIONS],
    commandLog: () => commandLog.slice(),
    runStep,
  };
}

module.exports = {
  createWorkspaceSystemProvisioningExecutorService,
  safeLaunchdLabel,
  safeMacGroup,
  safeMacUser,
  safeProfile,
  safeWorkspaceId,
};
