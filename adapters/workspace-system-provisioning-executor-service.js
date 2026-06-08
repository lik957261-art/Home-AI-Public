"use strict";

const defaultFs = require("node:fs");
const defaultPath = require("node:path");
const { spawnSync: defaultSpawnSync } = require("node:child_process");
const { renderGatewayConfigYaml } = require("../scripts/build-gateway-profile-template");

const DEFAULT_LIVE_ROOT = "/Users/hermes-host/HermesMobile";
const DEFAULT_LISTENER_USER = "hermes-host";
const DEFAULT_OWNER_USER = "hm-owner";
const FILE_PLUGIN_ROOT_ENVS = Object.freeze([
  "HERMES_MOBILE_DOCX_ALLOWED_ROOTS",
  "HERMES_MOBILE_AUDIO_ALLOWED_ROOTS",
  "HERMES_MOBILE_IMAGE_ALLOWED_ROOTS",
  "HERMES_MOBILE_VIDEO_ALLOWED_ROOTS",
  "HERMES_MOBILE_HTTP_FILE_ROOTS",
]);
const STANDARD_PROFILE_PLUGINS = Object.freeze([
  "weather",
  "web",
  "http",
  "docx",
  "audio",
  "image",
  "cronjob",
]);
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

  function ensureMacUser(context = {}) {
    const platformFailure = ensureMacPlatform();
    if (platformFailure) return platformFailure;
    const fields = contextFields(context);
    if (fields.error) return { ok: false, error: fields.error };
    if (userExists(fields.macUser)) return { ok: true, user: fields.macUser, existed: true };
    const uid = nextUid();
    privileged("/usr/bin/dscl", [".", "-create", `/Users/${fields.macUser}`]);
    privileged("/usr/bin/dscl", [".", "-create", `/Users/${fields.macUser}`, "UserShell", "/bin/zsh"]);
    privileged("/usr/bin/dscl", [".", "-create", `/Users/${fields.macUser}`, "RealName", fields.macUser]);
    privileged("/usr/bin/dscl", [".", "-create", `/Users/${fields.macUser}`, "UniqueID", String(uid)]);
    privileged("/usr/bin/dscl", [".", "-create", `/Users/${fields.macUser}`, "PrimaryGroupID", "20"]);
    privileged("/usr/bin/dscl", [".", "-create", `/Users/${fields.macUser}`, "NFSHomeDirectory", fields.workerHome]);
    privileged("/usr/bin/dscl", [".", "-create", `/Users/${fields.macUser}`, "IsHidden", "1"]);
    privileged("/usr/sbin/createhomedir", ["-c", "-u", fields.macUser]);
    return { ok: true, user: fields.macUser, existed: false, uid };
  }

  function ensureDirectory(dir, mode = "700", owner = "") {
    privileged("/bin/mkdir", ["-p", dir]);
    if (owner) privileged("/usr/sbin/chown", ["-R", owner, dir]);
    privileged("/bin/chmod", [mode, dir]);
  }

  function ensureWorkspaceRoots(context = {}) {
    const platformFailure = ensureMacPlatform();
    if (platformFailure) return platformFailure;
    const fields = contextFields(context);
    if (fields.error) return { ok: false, error: fields.error };
    const skillRoot = path.posix.join(fields.dataRoot, "skill-profiles", fields.workspaceId);
    ensureDirectory(fields.workerWorkspaceRoot, "700", `${fields.macUser}:staff`);
    ensureDirectory(path.posix.join(fields.workerWorkspaceRoot, ".hermes-gateway"), "700", `${fields.macUser}:staff`);
    ensureDirectory(path.posix.join(fields.workerWorkspaceRoot, ".hermes-gateway", "profiles"), "700", `${fields.macUser}:staff`);
    ensureDirectory(path.posix.join(fields.workerWorkspaceRoot, ".hermes-gateway", "logs"), "700", `${fields.macUser}:staff`);
    ensureDirectory(fields.workspaceDataRoot, "700", `${fields.macUser}:staff`);
    ensureDirectory(path.posix.join(skillRoot, "skills"), "700", `${fields.macUser}:staff`);
    ensureDirectory(path.posix.join(skillRoot, "memories"), "700", `${fields.macUser}:staff`);
    return { ok: true, root: compactPath(fields.root, fields.root), workspaceDataRoot: compactPath(fields.workspaceDataRoot, fields.root) };
  }

  function chmodAcl(user, target, permissions, recursive = false) {
    const acl = `user:${user} allow ${permissions}`;
    privileged("/bin/chmod", [recursive ? "-R" : "", "+a", acl, target].filter(Boolean));
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
    const parentPerms = "list,search,readattr,readextattr,readsecurity";
    for (const user of [fields.macUser, listenerUser, ownerUser]) {
      if (!safeMacUser(user) && user !== listenerUser) continue;
      for (const dir of [...new Set(parents)]) chmodAcl(user, dir, parentPerms);
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
    if (existing) return existing;
    return `com.hermesmobile.gateway.${fields.macUser}.${providerFamily(worker)}.${ordinal}`;
  }

  function renderStartScript(fields, worker, manifestPath) {
    const profile = safeProfile(worker.profile || worker.name);
    const port = Number(worker.port || 0);
    const profileRoot = profileDir(fields, profile);
    const fileRoots = "${ROOT}/data/drive,${ROOT}/data/uploads,${ROOT}/data/artifacts";
    const envLines = FILE_PLUGIN_ROOT_ENVS.map((name) => `export ${name}="${fileRoots}"`).join("\n");
    return `#!/bin/bash
set -euo pipefail
ROOT=${bashQuote(fields.root)}
PROFILE=${bashQuote(profile)}
PORT=${bashQuote(String(port))}
MANIFEST=${bashQuote(manifestPath)}
PROFILE_DIR=${bashQuote(profileRoot)}
RUNTIME_PYTHON="$ROOT/runtime/hermes-agent-official/venv/bin/python"
RUNTIME_HERMES="$ROOT/runtime/hermes-agent-official/venv/bin/hermes"
RUNTIME_SOURCE="$ROOT/runtime/hermes-agent-official/source"
RUNTIME_OVERRIDES="$ROOT/app/gateway-runtime-overrides"
FILE_PLUGIN_ALLOWED_ROOTS="$ROOT/data/drive,$ROOT/data/uploads,$ROOT/data/artifacts"
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
if [ -x "$RUNTIME_HERMES" ]; then
  exec env HOME=${bashQuote(fields.workerHome)} HERMES_HOME="$PROFILE_DIR" HERMES_PROFILE="$PROFILE" HERMES_WORKSPACE_ROOT=${bashQuote(fields.workerWorkspaceRoot)} HERMES_GOOGLE_PROFILE_HOME="$PROFILE_DIR" PYTHONPATH="$RUNTIME_OVERRIDES:$RUNTIME_SOURCE" PATH="$ROOT/runtime/node-current/bin:$ROOT/runtime/hermes-agent-official/venv/bin:/usr/local/bin:/usr/bin:/bin" HERMES_ACCEPT_HOOKS=1 HERMES_KANBAN_DISPATCH_IN_GATEWAY=0 API_SERVER_KEY="$api_server_key" DEEPSEEK_API_KEY="$deepseek_api_key" "$RUNTIME_HERMES" gateway run --replace --accept-hooks
fi
exec env HOME=${bashQuote(fields.workerHome)} HERMES_HOME="$PROFILE_DIR" HERMES_PROFILE="$PROFILE" HERMES_WORKSPACE_ROOT=${bashQuote(fields.workerWorkspaceRoot)} HERMES_GOOGLE_PROFILE_HOME="$PROFILE_DIR" PYTHONPATH="$RUNTIME_OVERRIDES:$RUNTIME_SOURCE" PATH="$ROOT/runtime/node-current/bin:$ROOT/runtime/hermes-agent-official/venv/bin:/usr/local/bin:/usr/bin:/bin" HERMES_ACCEPT_HOOKS=1 HERMES_KANBAN_DISPATCH_IN_GATEWAY=0 API_SERVER_KEY="$api_server_key" DEEPSEEK_API_KEY="$deepseek_api_key" "$RUNTIME_PYTHON" -m hermes_cli.main gateway run --replace --accept-hooks
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
    const skillRoot = path.posix.join(fields.dataRoot, "skill-profiles", fields.workspaceId);
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
    const configYaml = renderGatewayConfigYaml({
      configKind: "profile",
      values: Object.assign({
        profile,
        port: String(worker.port || ""),
        profile_link: dir,
        provider: worker.provider || "openai-codex",
      }, Object.fromEntries(STANDARD_PROFILE_PLUGINS.map((id) => [`${id}_plugin_enabled`, "1"]))),
    });
    writeTextFile(path.posix.join(dir, "config.yaml"), configYaml, "600", `${fields.macUser}:staff`);
    writeTextFile(startScriptPath(fields, profile), renderStartScript(fields, worker, manifestPath), "700", `${fields.macUser}:staff`);
    privileged("/usr/sbin/chown", ["-R", `${fields.macUser}:staff`, path.posix.join(fields.workerWorkspaceRoot, ".hermes-gateway")]);
    return dir;
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
    const workers = workspaceWorkers(manifest, fields, context);
    if (!workers.length) return { ok: false, error: "workspace_gateway_workers_missing" };
    const providerOrdinals = {};
    const touched = [];
    let changed = false;
    for (const worker of workers) {
      const profile = safeProfile(worker.profile || worker.name);
      if (!profile) return { ok: false, error: "gateway_profile_invalid" };
      const provider = providerFamily(worker);
      providerOrdinals[provider] = (providerOrdinals[provider] || 0) + 1;
      const label = labelFor(fields, worker, providerOrdinals[provider]);
      const dir = ensureProfileMaterialized(fields, worker, manifestPath);
      const statePath = path.posix.join(dir, "state.db");
      const responsePath = path.posix.join(dir, "response_store.db");
      if (worker.osUser !== fields.macUser) { worker.osUser = fields.macUser; changed = true; }
      if (worker.launchdLabel !== label) { worker.launchdLabel = label; changed = true; }
      if (!worker.telemetryStateDbPath) { worker.telemetryStateDbPath = statePath; changed = true; }
      if (!worker.telemetryResponseStoreDbPath) { worker.telemetryResponseStoreDbPath = responsePath; changed = true; }
      const plistFile = path.posix.join(launchDaemonsDir, `${label}.plist`);
      const startScript = startScriptPath(fields, profile);
      writeTextFile(plistFile, renderPlist(fields, worker, label, startScript), "644", "root:wheel");
      if (command("/bin/launchctl", ["print", `system/${label}`]).status !== 0) {
        privileged("/bin/launchctl", ["bootstrap", "system", plistFile]);
      }
      touched.push({ profile, label, plist: plistFile, profileDir: compactPath(dir, fields.root) });
    }
    let backup = "";
    if (changed) {
      backup = writeManifestBackup(manifestPath);
      writeJson(fs, manifestPath, manifest);
    }
    return { ok: true, workers: touched, manifestUpdated: changed, backup: backup ? path.basename(backup) : "" };
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
    ];
    if (pluginIds.length) profileAuditArgs.splice(4, 0, "--expected-plugins", pluginIds.join(","));
    const profileAudit = runSmokeScript(fields.root, path.posix.join(appScripts, "macos-production-profile-audit.js"), [
      ...profileAuditArgs,
    ]);
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
  safeMacUser,
  safeProfile,
  safeWorkspaceId,
};
