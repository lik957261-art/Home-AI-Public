"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { telemetryPathsForWorker } = require("./macos-gateway-telemetry-repair");

const DEFAULT_REQUIRED_WORKSPACE_PLUGINS = {
  weixin_wuping: ["wardrobe"],
};

const DEFAULT_REQUIRED_WORKSPACE_SKILL_PLUGINS = {
  owner: ["wardrobe"],
};

const REQUIRED_PLUGIN_SKILLS = {
  wardrobe: ["productivity/wardrobe-style-operations"],
};

const DEFAULT_REQUIRED_SHARED_SKILLS = ["shared/response-grounding-baseline"];

const FILE_PLUGIN_ROOT_ENV = Object.freeze([
  {
    name: "HERMES_MOBILE_DOCX_ALLOWED_ROOTS",
    roots: ["data/drive", "data/uploads", "data/artifacts"],
  },
  {
    name: "HERMES_MOBILE_PDF_ALLOWED_ROOTS",
    roots: ["data/drive", "data/uploads", "data/artifacts"],
  },
  {
    name: "HERMES_MOBILE_PDF_OUTPUT_ROOTS",
    roots: ["data/artifacts"],
  },
  {
    name: "HERMES_MOBILE_AUDIO_ALLOWED_ROOTS",
    roots: ["data/drive", "data/uploads", "data/artifacts"],
  },
  {
    name: "HERMES_MOBILE_ARCHIVE_ALLOWED_ROOTS",
    roots: ["data/drive", "data/uploads", "data/artifacts"],
  },
  {
    name: "HERMES_MOBILE_IMAGE_ALLOWED_ROOTS",
    roots: ["data/drive", "data/uploads", "data/artifacts"],
  },
  {
    name: "HERMES_MOBILE_VIDEO_ALLOWED_ROOTS",
    roots: ["data/drive", "data/uploads", "data/artifacts"],
  },
  {
    name: "HERMES_MOBILE_HTTP_FILE_ROOTS",
    roots: ["data/drive", "data/uploads", "data/artifacts"],
  },
  {
    name: "HERMES_MOBILE_HTTP_CREDENTIAL_ROOTS",
    roots: ["data/drive/users"],
  },
  {
    name: "HERMES_MOBILE_HTTP_SAVE_ROOT",
    roots: ["data/artifacts/http-request"],
  },
  {
    name: "HERMES_MOBILE_VIDEO_OUTPUT_ROOT",
    roots: ["data/artifacts/grok-videos"],
  },
]);
const MOBILE_BRIDGE_REQUIRED_ENVS = Object.freeze([
  "HERMES_MOBILE_BRIDGE_HOST_URL",
  "HERMES_WEB_BRIDGE_HOST_URL",
  "HERMES_MOBILE_BRIDGE_HOST_KEY_PATH",
  "HERMES_WEB_BRIDGE_HOST_KEY_PATH",
]);
const MOBILE_BRIDGE_HOST_URL_DEFAULT = "127.0.0.1:8798";
const MOBILE_BRIDGE_HOST_KEY_ROOT = "data/secrets/bridge-host.secret";

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseArgs(argv) {
  const out = {
    root: process.env.HERMES_MOBILE_ROOT || "/Users/example/path",
    expectedWorkspaces: ["owner", "weixin_wuping", "weixin_stephen", "user-981731fe", "user-a87aaa61"],
    expectedPlugins: ["wardrobe", "finance", "note", "email", "health"],
    requiredWorkspacePlugins: DEFAULT_REQUIRED_WORKSPACE_PLUGINS,
    requiredWorkspaceSkillPlugins: DEFAULT_REQUIRED_WORKSPACE_SKILL_PLUGINS,
    requiredSharedSkills: DEFAULT_REQUIRED_SHARED_SKILLS,
    listenerUser: process.env.HERMES_MOBILE_LISTENER_USER || "hermes-host",
    launchDaemonsDir: process.env.HERMES_MOBILE_LAUNCH_DAEMONS_DIR || "/Library/LaunchDaemons",
    checkTelemetry: true,
    json: false,
    strict: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") out.root = argv[++index] || out.root;
    else if (arg === "--expected-workspaces") {
      out.expectedWorkspaces = String(argv[++index] || "").split(",").map((item) => item.trim()).filter(Boolean);
    } else if (arg === "--expected-plugins") {
      out.expectedPlugins = String(argv[++index] || "").split(",").map((item) => item.trim()).filter(Boolean);
    } else if (arg === "--required-workspace-plugins") {
      out.requiredWorkspacePlugins = parseMappingArg(argv[++index] || "");
    } else if (arg === "--required-workspace-skill-plugins") {
      out.requiredWorkspaceSkillPlugins = parseMappingArg(argv[++index] || "");
    } else if (arg === "--required-shared-skills") {
      out.requiredSharedSkills = splitCsv(argv[++index] || "");
    } else if (arg === "--listener-user") {
      out.listenerUser = argv[++index] || out.listenerUser;
    } else if (arg === "--launch-daemons-dir") {
      out.launchDaemonsDir = argv[++index] || out.launchDaemonsDir;
    } else if (arg === "--no-telemetry-check") {
      out.checkTelemetry = false;
    } else if (arg === "--json") out.json = true;
    else if (arg === "--no-strict") out.strict = false;
    else if (arg === "--help") {
      console.log([
        "Usage: node scripts/macos-production-profile-audit.js --root <HermesMobile root> [options]",
        "  --expected-workspaces <ids>  Comma-separated required workspaces",
        "  --expected-plugins <ids>     Comma-separated plugin ids to summarize",
        "  --required-workspace-plugins <map>",
        "                               Semicolon-separated workspace:plugin,plugin map",
        "  --required-workspace-skill-plugins <map>",
        "                               Semicolon-separated workspace:plugin,plugin map for required Skill-only checks",
        "  --required-shared-skills <ids>",
        "                               Comma-separated shared Skill paths relative to shared-global/skills",
        "  --listener-user <user>       User that must read Gateway telemetry DBs",
        "  --launch-daemons-dir <dir>   LaunchDaemon plist directory",
        "  --no-telemetry-check         Skip Gateway telemetry path/readability checks",
        "  --no-strict                  Report issues without failing",
        "  --json                       Print bounded JSON metadata",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function splitCsv(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function parseMappingArg(value) {
  const out = {};
  for (const segment of String(value || "").split(";")) {
    const text = segment.trim();
    if (!text) continue;
    const separator = text.includes("=") ? "=" : ":";
    const splitIndex = text.indexOf(separator);
    if (splitIndex < 1) continue;
    const key = text.slice(0, splitIndex).trim();
    const values = splitCsv(text.slice(splitIndex + 1));
    if (key && values.length) out[key] = values;
  }
  return out;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return { __error: `${err.name}:${err.message}` };
  }
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (_) {
    return "";
  }
}

function yamlScalar(text, key) {
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*:\\s*([^#\\n]+?)\\s*$`, "m");
  const match = String(text || "").match(pattern);
  if (!match) return "";
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

function expectedModelForWorker(worker = {}) {
  const configured = String(worker.modelDefault || worker.defaultModel || worker.model || worker.model_default || "").trim();
  if (configured) return configured;
  const provider = String(worker.provider || "openai-codex").trim();
  if (provider === "xai-oauth") return "grok-4.3";
  if (provider === "deepseek") return "deepseek-chat";
  return "";
}

function profileConfigStatus(worker = {}, profileDir = "", root = "", options = {}) {
  const profile = String(worker.profile || worker.name || "").trim();
  const configPath = String(worker.configPath || worker.config_path || path.join(profileDir, "config.yaml"));
  const expectedProvider = String(worker.provider || "openai-codex").trim();
  const expectedModel = expectedModelForWorker(worker);
  if (typeof options.profileConfigProbe === "function") {
    const probe = options.profileConfigProbe({ worker, profile, profileDir, configPath, root }) || {};
    const provider = String(probe.provider || "").trim();
    const model = String(probe.model || "").trim();
    const existsValue = probe.exists == null ? Boolean(provider || model) : Boolean(probe.exists);
    return {
      path: compactPath(configPath, root),
      exists: existsValue,
      provider,
      model,
      expectedProvider,
      expectedModel,
      providerMatchesManifest: Boolean(provider && provider === expectedProvider),
      modelMatchesExpected: expectedModel ? model === expectedModel : true,
    };
  }
  const text = readText(configPath);
  const provider = yamlScalar(text, "provider");
  const model = yamlScalar(text, "default");
  return {
    path: compactPath(configPath, root),
    exists: Boolean(text),
    provider,
    model,
    expectedProvider,
    expectedModel,
    providerMatchesManifest: Boolean(provider && provider === expectedProvider),
    modelMatchesExpected: expectedModel ? model === expectedModel : true,
  };
}

function exists(file) {
  try {
    return fs.existsSync(file);
  } catch (_) {
    return false;
  }
}

function readPositiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.floor(number);
}

function countEntries(dir) {
  try {
    return fs.readdirSync(dir).filter((name) => !name.startsWith(".")).length;
  } catch (_) {
    return null;
  }
}

function linkInfo(file, root, expectedTarget = "") {
  try {
    const stat = fs.lstatSync(file);
    const isSymbolicLink = stat.isSymbolicLink();
    const rawTarget = isSymbolicLink ? fs.readlinkSync(file) : "";
    const resolvedTarget = rawTarget ? path.resolve(path.dirname(file), rawTarget) : "";
    let realTarget = resolvedTarget;
    let realExpected = expectedTarget;
    try {
      if (resolvedTarget) realTarget = fs.realpathSync(resolvedTarget);
    } catch (_) {}
    try {
      if (expectedTarget) realExpected = fs.realpathSync(expectedTarget);
    } catch (_) {}
    const normalizedResolved = realTarget ? path.normalize(realTarget) : "";
    const normalizedExpected = realExpected ? path.normalize(realExpected) : "";
    return {
      exists: true,
      isSymbolicLink,
      target: rawTarget ? compactPath(rawTarget, root) : "",
      resolvedTarget: resolvedTarget ? compactPath(resolvedTarget, root) : "",
      realTarget: realTarget ? compactPath(realTarget, root) : "",
      targetMatchesExpected: Boolean(normalizedExpected && normalizedResolved === normalizedExpected),
    };
  } catch (_) {
    return { exists: false, isSymbolicLink: false, target: "", resolvedTarget: "", realTarget: "", targetMatchesExpected: false };
  }
}

function launchdServiceStatus(worker = {}, options = {}) {
  const label = String(worker.launchdLabel || "");
  const status = {
    label,
    plistChecked: false,
    plistExists: false,
    runAtLoad: null,
    keepAlive: null,
    loaded: false,
    checked: false,
  };
  if (!label) return status;
  if (typeof options.launchdPlistProbe === "function") {
    const probe = options.launchdPlistProbe(label, worker) || {};
    status.plistChecked = true;
    status.plistExists = Boolean(probe.plistExists ?? probe.exists);
    status.runAtLoad = probe.runAtLoad == null ? null : Boolean(probe.runAtLoad);
    status.keepAlive = probe.keepAlive == null ? null : Boolean(probe.keepAlive);
  } else if (process.platform === "darwin") {
    status.plistChecked = true;
    const plistFile = path.join(options.launchDaemonsDir || "/Library/LaunchDaemons", `${label}.plist`);
    status.plistExists = exists(plistFile);
    if (status.plistExists) {
      status.runAtLoad = readLaunchdPlistBoolean(plistFile, "RunAtLoad");
      status.keepAlive = readLaunchdPlistBoolean(plistFile, "KeepAlive");
    }
  }
  if (options.checkLaunchd === false) return status;
  if (typeof options.launchdProbe === "function") {
    status.checked = true;
    status.loaded = Boolean(options.launchdProbe(label, worker));
    return status;
  }
  if (process.platform !== "darwin") return status;
  const result = spawnSync("launchctl", ["print", `system/${label}`], {
    encoding: "utf8",
    stdio: ["ignore", "ignore", "ignore"],
  });
  status.checked = true;
  status.loaded = result.status === 0;
  return status;
}

function readLaunchdPlistBoolean(plistFile, key) {
  const result = spawnSync("plutil", ["-extract", key, "raw", "-o", "-", plistFile], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return null;
  const text = String(result.stdout || "").trim().toLowerCase();
  if (["1", "true", "yes"].includes(text)) return true;
  if (["0", "false", "no"].includes(text)) return false;
  return null;
}

function compactPath(value, root) {
  return String(value || "").replaceAll(root, "<root>");
}

function profileDirFromWorkerConfig(worker = {}) {
  const configPath = String(worker.configPath || worker.config_path || "").trim();
  if (!configPath || path.basename(configPath) !== "config.yaml") return "";
  return path.dirname(configPath);
}

function gatewayDirForProfileDir(profileDir = "") {
  const text = String(profileDir || "").trim();
  if (!text) return "";
  return path.dirname(path.dirname(text));
}

function gatewayStartScriptPath(profile, osUser, worker = {}) {
  const safeProfile = String(profile || "").trim();
  const safeUser = String(osUser || "").trim();
  if (!safeProfile) return "";
  const configProfileDir = profileDirFromWorkerConfig(worker);
  const configGatewayDir = gatewayDirForProfileDir(configProfileDir);
  if (configGatewayDir) return path.join(configGatewayDir, `start-${safeProfile}.sh`);
  if (!safeUser) return "";
  return path.join("/Users", safeUser, "HermesWorkspace", ".hermes-gateway", `start-${safeProfile}.sh`);
}

function readStartScriptText(worker = {}, profile = "", osUser = "", options = {}) {
  const scriptPath = gatewayStartScriptPath(profile, osUser, worker);
  if (!scriptPath) return { path: "", exists: false, text: "" };
  if (typeof options.startScriptProbe === "function") {
    const probe = options.startScriptProbe(scriptPath, worker) || {};
    return {
      path: scriptPath,
      exists: Boolean(probe.exists ?? probe.text),
      text: String(probe.text || ""),
    };
  }
  try {
    return {
      path: scriptPath,
      exists: true,
      text: fs.readFileSync(scriptPath, "utf8"),
    };
  } catch (_) {
    return { path: scriptPath, exists: false, text: "" };
  }
}

function readArbitraryStartScriptText(scriptPath, root = "", options = {}) {
  const value = String(scriptPath || "").trim();
  if (!value) return { path: "", exists: false, text: "" };
  if (typeof options.installedGatewayStartScriptProbe === "function") {
    const probe = options.installedGatewayStartScriptProbe(value) || {};
    return {
      path: compactPath(value, root),
      exists: Boolean(probe.exists ?? probe.text),
      text: String(probe.text || ""),
    };
  }
  try {
    return {
      path: compactPath(value, root),
      exists: true,
      text: fs.readFileSync(value, "utf8"),
    };
  } catch (_) {
    return { path: compactPath(value, root), exists: false, text: "" };
  }
}

function hasRootToken(scriptText, root, rootSpec) {
  const rel = String(rootSpec || "").replaceAll("\\", "/").replace(/^\/+/, "");
  const absolute = path.join(root, ...rel.split("/")).replaceAll("\\", "/");
  const rootRelative = `$ROOT/${rel}`;
  const mobileRootRelative = "${ROOT}/" + rel;
  const text = String(scriptText || "").replaceAll("\\", "/");
  return text.includes(absolute) || text.includes(rootRelative) || text.includes(mobileRootRelative);
}

function filePluginRootStatus(worker = {}, profile = "", osUser = "", root = "", options = {}) {
  const script = readStartScriptText(worker, profile, osUser, options);
  const env = FILE_PLUGIN_ROOT_ENV.map((spec) => ({
    name: spec.name,
    present: script.text.includes(spec.name),
    rootsPresent: spec.roots.map((rootSpec) => ({
      root: rootSpec,
      present: hasRootToken(script.text, root, rootSpec),
    })),
  }));
  return {
    startScriptPath: compactPath(script.path, root),
    startScriptExists: script.exists,
    unsupportedColonRootList: /\b(?:FILE_PLUGIN_ALLOWED_ROOTS|HERMES_MOBILE_(?:DOCX|AUDIO|ARCHIVE|IMAGE|VIDEO)_ALLOWED_ROOTS|HERMES_MOBILE_HTTP_FILE_ROOTS)=[^\n]*data\/drive:[^\n]*data\/uploads/.test(
      String(script.text || "").replaceAll("\\", "/"),
    ),
    env,
  };
}

function mobileBridgeStatus(worker = {}, profile = "", osUser = "", root = "", options = {}) {
  const script = readStartScriptText(worker, profile, osUser, options);
  return mobileBridgeStatusFromScript(script, root);
}

function mobileBridgeStatusFromScript(script = {}, root = "") {
  const text = String(script.text || "").replaceAll("\\", "/");
  return {
    startScriptPath: compactPath(script.path, root),
    startScriptExists: script.exists,
    env: MOBILE_BRIDGE_REQUIRED_ENVS.map((name) => ({
      name,
      present: new RegExp(`(^|[\\s\\\\])${escapeRegExp(name)}=`, "m").test(text),
    })),
    defaultHostUrlPresent: text.includes(MOBILE_BRIDGE_HOST_URL_DEFAULT),
    keyPathPresent: hasRootToken(text, root, MOBILE_BRIDGE_HOST_KEY_ROOT),
  };
}

function readPlistStringValues(plistFile, key) {
  let text = "";
  try {
    text = fs.readFileSync(plistFile, "utf8");
  } catch (_) {
    return [];
  }
  const escapedKey = escapeRegExp(key);
  const match = text.match(new RegExp(`<key>\\s*${escapedKey}\\s*</key>\\s*<array>([\\s\\S]*?)</array>`, "i"));
  if (!match) return [];
  const values = [];
  const pattern = /<string>([\s\S]*?)<\/string>/gi;
  let item;
  while ((item = pattern.exec(match[1]))) {
    values.push(
      item[1]
        .replaceAll("&quot;", "\"")
        .replaceAll("&apos;", "'")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&amp;", "&")
        .trim(),
    );
  }
  return values;
}

function installedGatewayLaunchdScripts(root = "", options = {}) {
  if (typeof options.installedGatewayLaunchdProbe === "function") {
    return (options.installedGatewayLaunchdProbe() || []).map((item) => Object.assign({}, item));
  }
  const dir = options.launchDaemonsDir || "/Library/LaunchDaemons";
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch (_) {
    return [];
  }
  return names
    .filter((name) => /^com\.hermesmobile\.gateway\..+\.plist$/i.test(name))
    .sort()
    .map((name) => {
      const plistPath = path.join(dir, name);
      const args = readPlistStringValues(plistPath, "ProgramArguments");
      const startScriptPath = args.find((arg) => String(arg || "").endsWith(".sh")) || "";
      const label = name.replace(/\.plist$/i, "");
      return {
        label,
        plistPath: compactPath(plistPath, root),
        startScriptPath,
      };
    });
}

function telemetryPathConfigured(worker = {}, field) {
  if (field === "state") {
    return Boolean(worker.telemetryStateDbPath || worker.telemetry_state_db_path || worker.stateDbPath || worker.state_db_path);
  }
  return Boolean(
    worker.telemetryResponseStoreDbPath
    || worker.telemetry_response_store_db_path
    || worker.responseStoreDbPath
    || worker.response_store_db_path
  );
}

function listenerCanReadTelemetry(file, options = {}) {
  const value = String(file || "").trim();
  if (!value || !exists(value)) return false;
  if (typeof options.telemetryReadProbe === "function") {
    return Boolean(options.telemetryReadProbe(value, options.listenerUser || "hermes-host"));
  }
  if (process.platform === "darwin") {
    const user = String(options.listenerUser || "hermes-host").trim();
    if (user) {
      const result = spawnSync("sudo", ["-u", user, "test", "-r", value], {
        encoding: "utf8",
        stdio: ["ignore", "ignore", "ignore"],
      });
      return result.status === 0;
    }
  }
  try {
    fs.accessSync(value, fs.constants.R_OK);
    return true;
  } catch (_) {
    return false;
  }
}

function listenerCanReadFile(file, options = {}) {
  const value = String(file || "").trim();
  if (!value || !exists(value)) return false;
  if (typeof options.listenerReadProbe === "function") {
    return Boolean(options.listenerReadProbe(value, options.listenerUser || "hermes-host"));
  }
  if (process.platform === "darwin") {
    const user = String(options.listenerUser || "hermes-host").trim();
    if (user) {
      const result = spawnSync("sudo", ["-u", user, "test", "-r", value], {
        encoding: "utf8",
        stdio: ["ignore", "ignore", "ignore"],
      });
      return result.status === 0;
    }
  }
  try {
    fs.accessSync(value, fs.constants.R_OK);
    return true;
  } catch (_) {
    return false;
  }
}

function userCanAccessFile(file, user, mode = "read", options = {}) {
  const value = String(file || "").trim();
  const safeUser = String(user || "").trim();
  const normalizedMode = mode === "write" ? "write" : "read";
  if (!value || !safeUser || !exists(value)) return false;
  if (typeof options.workerFileAccessProbe === "function") {
    return Boolean(options.workerFileAccessProbe(value, safeUser, normalizedMode));
  }
  if (process.platform === "darwin") {
    const flag = normalizedMode === "write" ? "-w" : "-r";
    const result = spawnSync("sudo", ["-u", safeUser, "test", flag, value], {
      encoding: "utf8",
      stdio: ["ignore", "ignore", "ignore"],
    });
    return result.status === 0;
  }
  try {
    fs.accessSync(value, normalizedMode === "write" ? fs.constants.W_OK : fs.constants.R_OK);
    return true;
  } catch (_) {
    return false;
  }
}

function workerCanWriteDirectory(dir, user, options = {}) {
  const value = String(dir || "").trim();
  const safeUser = String(user || "").trim();
  if (!value || !safeUser || !exists(value)) return false;
  const probeName = `.home-ai-profile-audit-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const probeFile = path.join(value, probeName);
  if (typeof options.workerDirectoryWriteProbe === "function") {
    return Boolean(options.workerDirectoryWriteProbe(value, safeUser, probeFile));
  }
  if (process.platform === "darwin") {
    const result = spawnSync("sudo", [
      "-u",
      safeUser,
      "/bin/sh",
      "-c",
      "probe_dir=$1; probe_file=$2; umask 077; : > \"$probe_file\" && /bin/rm -f \"$probe_file\"",
      "home-ai-profile-audit",
      value,
      probeFile,
    ], {
      encoding: "utf8",
      stdio: ["ignore", "ignore", "ignore"],
    });
    return result.status === 0;
  }
  try {
    fs.writeFileSync(probeFile, "profile-audit\n", { encoding: "utf8", mode: 0o600 });
    fs.rmSync(probeFile, { force: true });
    return true;
  } catch (_) {
    try {
      fs.rmSync(probeFile, { force: true });
    } catch (_) {}
    return false;
  }
}

function workerApiKeyFile(worker = {}) {
  return String(worker.apiKeyFile || worker.api_key_file || worker.apiKeyPath || worker.api_key_path || "").trim();
}

function workerProviderKeyFiles(worker = {}, dataDir = "") {
  const out = [];
  const configured = String(
    worker.deepseekApiKeyFile
      || worker.deepseek_api_key_file
      || worker.providerKeyFile
      || worker.provider_key_file
      || "",
  ).trim();
  if (configured) out.push(configured);
  const fallbackProviderKey = dataDir ? path.join(dataDir, "secrets", "deepseek-api-key.secret") : "";
  if (fallbackProviderKey && exists(fallbackProviderKey)) out.push(fallbackProviderKey);
  return [...new Set(out)];
}

function workerSecretUserAccess(file, users = [], options = {}) {
  const value = String(file || "").trim();
  const existsOnDisk = Boolean(value && exists(value));
  return [...new Set(users.filter(Boolean))].map((user) => ({
    user,
    canRead: existsOnDisk ? userCanAccessFile(value, user, "read", options) : false,
  }));
}

function workerSecretAccessStatus(worker = {}, osUser = "", manifestPath = "", dataDir = "", root = "", options = {}) {
  const users = [...new Set([osUser, options.listenerUser || "hermes-host"].filter(Boolean))];
  const apiKeyFile = workerApiKeyFile(worker);
  const providerKeyFiles = workerProviderKeyFiles(worker, dataDir);
  return {
    manifest: {
      path: compactPath(manifestPath, root),
      exists: exists(manifestPath),
      users: workerSecretUserAccess(manifestPath, users, options),
    },
    apiKeyFile: {
      configured: Boolean(apiKeyFile),
      path: apiKeyFile ? compactPath(apiKeyFile, root) : "",
      exists: apiKeyFile ? exists(apiKeyFile) : false,
      users: workerSecretUserAccess(apiKeyFile, users, options),
    },
    providerKeyFiles: providerKeyFiles.map((file) => ({
      path: compactPath(file, root),
      basename: path.basename(file),
      exists: exists(file),
      users: workerSecretUserAccess(file, users, options),
    })),
  };
}

function telemetryStatus(worker = {}, root = "", options = {}) {
  const paths = telemetryPathsForWorker(worker);
  const stateExists = exists(paths.stateDbPath);
  const responseExists = exists(paths.responseStoreDbPath);
  return {
    statePathConfigured: telemetryPathConfigured(worker, "state"),
    responsePathConfigured: telemetryPathConfigured(worker, "response"),
    stateDbPath: compactPath(paths.stateDbPath, root),
    responseStoreDbPath: compactPath(paths.responseStoreDbPath, root),
    stateExists,
    responseExists,
    listenerCanReadState: stateExists ? listenerCanReadTelemetry(paths.stateDbPath, options) : false,
    listenerCanReadResponse: responseExists ? listenerCanReadTelemetry(paths.responseStoreDbPath, options) : false,
  };
}

function workerWorkspaceIds(worker = {}) {
  const out = new Set();
  for (const key of ["allowedWorkspaceIds", "skillWorkspaceIds"]) {
    for (const item of Array.isArray(worker[key]) ? worker[key] : []) {
      const text = String(item || "").trim();
      if (text && text !== "*") out.add(text);
    }
  }
  return [...out];
}

function ownerRequiredWarmProfiles(workers = [], options = {}) {
  const minWarm = readPositiveInteger(
    options.ownerMinWarm
      ?? process.env.HERMES_MOBILE_GATEWAY_OWNER_MIN_WARM
      ?? process.env.HERMES_WEB_GATEWAY_OWNER_MIN_WARM,
    0,
  );
  if (!minWarm) return new Set();
  const candidates = (Array.isArray(workers) ? workers : [])
    .filter((worker) => worker.enabled !== false)
    .filter((worker) => String(worker.securityLevel || worker.security_level || "user").trim().toLowerCase() === "user")
    .filter((worker) => String(worker.provider || "openai-codex").trim() === "openai-codex")
    .filter((worker) => {
      const workspaceIds = workerWorkspaceIds(worker);
      return workspaceIds.includes("owner") || String(worker.profile || "") === "lowgw1";
    });
  return new Set(candidates.slice(0, minWarm).map((worker) => String(worker.profile || worker.name || "").trim()).filter(Boolean));
}

function workspaceProfileId(workspaceId) {
  return workspaceId === "owner" ? "owner-full" : workspaceId;
}

function osUserForWorker(worker = {}) {
  const label = String(worker.launchdLabel || "");
  const match = label.match(/com\.hermesmobile\.gateway\.(hm-[a-z0-9-]+)\./i);
  if (match) return match[1];
  const workspace = workerWorkspaceIds(worker)[0] || "owner";
  if (workspace === "owner") return "hm-owner";
  if (workspace === "weixin_wuping") return "hm-wuping";
  if (workspace === "weixin_stephen") return "hm-stephen";
  if (workspace === "weixin_test_1") return "hm-test";
  if (workspace === "user-981731fe") return "hm-xuyan";
  if (workspace === "user-a87aaa61") return "hm-xulu";
  return "";
}

function profileDirForWorker(worker = {}, profile = "", osUser = "", options = {}) {
  if (typeof options.profileDirForWorker === "function") {
    return String(options.profileDirForWorker(worker, profile, osUser) || "").trim();
  }
  const configProfileDir = profileDirFromWorkerConfig(worker);
  if (configProfileDir) return configProfileDir;
  return osUser && profile
    ? path.join("/Users", osUser, "HermesWorkspace", ".hermes-gateway", "profiles", profile)
    : "";
}

function isOpenAiCodexWorker(worker = {}) {
  return String(worker.provider || "openai-codex").trim() === "openai-codex";
}

function codexAuthStatus(worker = {}, profileDir = "", root = "", osUser = "", options = {}) {
  const profile = String(worker.profile || worker.name || "").trim();
  const authRoot = path.join(root, "gateway-worker", "telemetry", "profiles", "shared-auth");
  const authJsonPath = path.join(profileDir, "auth.json");
  const authLockPath = path.join(profileDir, "auth.lock");
  if (typeof options.codexAuthProbe === "function") {
    const probe = options.codexAuthProbe({ worker, profile, profileDir, authRoot, authJsonPath, authLockPath, root, osUser }) || {};
    return probe;
  }
  return {
    authRoot: compactPath(authRoot, root),
    authJson: linkInfo(authJsonPath, root, path.join(authRoot, "auth.json")),
    authLock: linkInfo(authLockPath, root, path.join(authRoot, "auth.lock")),
    workerCanReadAuthJson: userCanAccessFile(authJsonPath, osUser, "read", options),
    workerCanWriteAuthJson: userCanAccessFile(authJsonPath, osUser, "write", options),
    workerCanReadAuthLock: userCanAccessFile(authLockPath, osUser, "read", options),
    workerCanWriteAuthLock: userCanAccessFile(authLockPath, osUser, "write", options),
  };
}

function activeWorkspaceKeyIds(accessKeys = {}) {
  const ids = [];
  for (const [workspaceId, record] of Object.entries(accessKeys.workspaceKeys || {})) {
    if (!record || typeof record !== "object") continue;
    if (record.revokedAt || record.revoked_at || record.disabled) continue;
    ids.push(workspaceId);
  }
  return ids.sort();
}

function pluginRows(pluginAuth = {}) {
  const rows = [];
  for (const [pluginId, plugin] of Object.entries(pluginAuth.plugins || {})) {
    for (const [workspaceId, record] of Object.entries(plugin?.records || {})) {
      if (!record || typeof record !== "object") continue;
      rows.push({
        pluginId,
        workspaceId,
        status: String(record.status || ""),
        provisioningStatus: String(record.provisioningStatus || record.provisioning_status || ""),
        enabled: record.status !== "revoked" && record.enabled !== false,
      });
    }
  }
  return rows.sort((a, b) => `${a.workspaceId}:${a.pluginId}`.localeCompare(`${b.workspaceId}:${b.pluginId}`));
}

function pluginProvisioningNotActiveStatus(value) {
  const status = String(value || "").trim();
  return ["pending", "provisioning_failed", "failed", "not_started", "manual_required"].includes(status)
    ? status
    : "";
}

function pluginBindingStatus(dataDir, workspaceId, pluginId) {
  const dir = path.join(dataDir, "drive", "users", workspaceId, `.hermes-${pluginId}`);
  const configPresent = exists(path.join(dir, "config.json"));
  const keyPresent = exists(path.join(dir, "access-key.txt"));
  return {
    pluginId,
    configPresent,
    keyPresent,
    complete: Boolean(configPresent && keyPresent),
  };
}

function routeWorkspaceIds(routeMap = {}) {
  return (routeMap.routes || []).map((route) => String(route.workspace_id || route.workspaceId || route.principal_id || route.principalId || "").trim()).filter(Boolean);
}

function localWorkspaceIds(workspaces = {}) {
  return (workspaces.workspaces || []).map((workspace) => String(workspace.id || "").trim()).filter(Boolean);
}

function skillBundleStatus(skillRoot, relativeSkillPath, options = {}) {
  const segments = String(relativeSkillPath || "").split("/").map((item) => item.trim()).filter(Boolean);
  const dir = path.join(skillRoot, ...segments);
  const skillFile = path.join(dir, "SKILL.md");
  const status = {
    skill: segments.join("/"),
    exists: exists(dir),
    skillFileExists: exists(skillFile),
    listenerCanReadSkillFile: listenerCanReadFile(skillFile, options),
    referencesExists: exists(path.join(dir, "references")),
    scriptsExists: exists(path.join(dir, "scripts")),
  };
  status.complete = Boolean(status.exists && status.skillFileExists);
  if (options.requireReferences) status.complete = status.complete && status.referencesExists;
  if (options.requireScripts) status.complete = status.complete && status.scriptsExists;
  return status;
}

function requiredSkillOptions(pluginId) {
  if (pluginId === "wardrobe") return { requireReferences: true, requireScripts: true };
  return {};
}

function buildAudit(options) {
  options = Object.assign({
    root: "/Users/example/path",
    expectedWorkspaces: ["owner", "weixin_wuping", "weixin_stephen", "user-981731fe", "user-a87aaa61"],
    expectedPlugins: ["wardrobe", "finance", "note", "email", "health"],
    requiredWorkspacePlugins: DEFAULT_REQUIRED_WORKSPACE_PLUGINS,
    requiredWorkspaceSkillPlugins: DEFAULT_REQUIRED_WORKSPACE_SKILL_PLUGINS,
    requiredSharedSkills: DEFAULT_REQUIRED_SHARED_SKILLS,
    launchDaemonsDir: "/Library/LaunchDaemons",
  }, options || {});
  if (!Array.isArray(options.expectedWorkspaces)) options.expectedWorkspaces = [];
  if (!Array.isArray(options.expectedPlugins)) options.expectedPlugins = [];
  if (!Array.isArray(options.requiredSharedSkills)) options.requiredSharedSkills = [];
  if (!options.requiredWorkspacePlugins || typeof options.requiredWorkspacePlugins !== "object") {
    options.requiredWorkspacePlugins = {};
  }
  if (!options.requiredWorkspaceSkillPlugins || typeof options.requiredWorkspaceSkillPlugins !== "object") {
    options.requiredWorkspaceSkillPlugins = {};
  }
  const root = path.resolve(options.root);
  const dataDir = path.join(root, "data");
  const manifestPath = path.join(dataDir, "gateway-pool-manifest-mac.json");
  const manifest = readJson(manifestPath);
  const workspaces = readJson(path.join(dataDir, "workspaces.json"));
  const accessKeys = readJson(path.join(dataDir, "access-keys.json"));
  const pluginAuth = readJson(path.join(dataDir, "plugin-workspace-authorizations.json"));
  const routeMap = readJson(path.join(dataDir, "config", "access-control", "weixin-routing-map.json"));
  const workers = Array.isArray(manifest.workers) ? manifest.workers : [];
  const skillProfilesRoot = path.join(dataDir, "skill-profiles");
  const activeKeys = new Set(activeWorkspaceKeyIds(accessKeys));
  const plugins = pluginRows(pluginAuth);
  const enabledPluginSet = new Set(plugins.filter((row) => row.enabled).map((row) => `${row.workspaceId}:${row.pluginId}`));
  const issueSet = new Set();
  const warnings = [];
  const requiredWarmProfiles = ownerRequiredWarmProfiles(workers, options);
  const manifestLaunchdLabels = new Set(workers.map((worker) => String(worker.launchdLabel || "").trim()).filter(Boolean));
  const manifestLaunchdStartScripts = new Map(workers.map((worker) => {
    const label = String(worker.launchdLabel || "").trim();
    const profile = String(worker.profile || worker.name || "").trim();
    if (!label || !profile) return null;
    return [label, gatewayStartScriptPath(profile, osUserForWorker(worker), worker)];
  }).filter(Boolean));

  function issue(code) {
    issueSet.add(code);
  }

  const workspaceIds = new Set(["owner", ...options.expectedWorkspaces, ...localWorkspaceIds(workspaces), ...routeWorkspaceIds(routeMap)]);
  for (const worker of workers) {
    for (const workspaceId of workerWorkspaceIds(worker)) workspaceIds.add(workspaceId);
  }

  const byWorkspace = {};
  for (const workspaceId of [...workspaceIds].sort()) {
    const profileId = workspaceProfileId(workspaceId);
    const skillRoot = path.join(skillProfilesRoot, profileId, "skills");
    const memoryRoot = path.join(skillProfilesRoot, profileId, "memories");
    const workspaceWorkers = workers.filter((worker) => workerWorkspaceIds(worker).includes(workspaceId));
    const authPlugins = plugins.filter((row) => row.workspaceId === workspaceId && row.enabled);
    const pluginIdsToCheck = [...new Set([
      ...options.expectedPlugins,
      ...authPlugins.map((row) => row.pluginId),
      ...((options.requiredWorkspacePlugins || {})[workspaceId] || []),
      ...((options.requiredWorkspaceSkillPlugins || {})[workspaceId] || []),
    ])].sort();
    const localPluginBindings = pluginIdsToCheck.map((pluginId) => pluginBindingStatus(dataDir, workspaceId, pluginId));
    const localPluginIds = localPluginBindings.filter((binding) => binding.complete).map((binding) => binding.pluginId);
    const workspacePluginIds = [...new Set([
      ...authPlugins.map((row) => row.pluginId),
      ...localPluginIds,
    ])].sort();
    const summary = {
      profileId,
      localWorkspace: localWorkspaceIds(workspaces).includes(workspaceId),
      weixinRoute: routeWorkspaceIds(routeMap).includes(workspaceId),
      accessKeyConfigured: workspaceId === "owner" ? true : activeKeys.has(workspaceId),
      skillRootExists: exists(skillRoot),
      skillCategoryCount: countEntries(skillRoot),
      memoryRootExists: exists(memoryRoot),
      memoryEntryCount: countEntries(memoryRoot),
      pluginIds: workspacePluginIds,
      authPluginIds: authPlugins.map((row) => row.pluginId).sort(),
      localPluginBindings,
      requiredPluginIds: (options.requiredWorkspacePlugins || {})[workspaceId] || [],
      requiredSkillPluginIds: (options.requiredWorkspaceSkillPlugins || {})[workspaceId] || [],
      requiredPluginSkills: [],
      workers: workspaceWorkers.map((worker) => ({
        profile: worker.profile || worker.name || "",
        provider: worker.provider || "openai-codex",
        securityLevel: worker.securityLevel || "",
        port: worker.port || null,
        osUser: osUserForWorker(worker),
        apiKeyFileConfigured: Boolean(worker.apiKeyFile || worker.api_key_file || worker.apiKeyPath || worker.api_key_path),
      })),
    };
    byWorkspace[workspaceId] = summary;

    for (const pluginId of summary.requiredPluginIds) {
      const localBinding = localPluginBindings.find((binding) => binding.pluginId === pluginId);
      if (!enabledPluginSet.has(`${workspaceId}:${pluginId}`) && !localBinding?.complete) {
        issue(`plugin_binding_missing:${workspaceId}:${pluginId}`);
      }
    }

    for (const pluginId of summary.authPluginIds) {
      const localBinding = localPluginBindings.find((binding) => binding.pluginId === pluginId);
      if (!localBinding?.complete) issue(`plugin_local_binding_incomplete:${workspaceId}:${pluginId}`);
    }
    for (const row of authPlugins) {
      const status = pluginProvisioningNotActiveStatus(row.provisioningStatus);
      if (status) issue(`plugin_provisioning_not_active:${workspaceId}:${row.pluginId}:${status}`);
    }

    const skillPluginsToCheck = new Set([
      ...summary.pluginIds,
      ...summary.requiredPluginIds,
      ...summary.requiredSkillPluginIds,
    ]);
    for (const pluginId of skillPluginsToCheck) {
      for (const skillId of REQUIRED_PLUGIN_SKILLS[pluginId] || []) {
        const status = skillBundleStatus(skillRoot, skillId, Object.assign({}, options, requiredSkillOptions(pluginId)));
        summary.requiredPluginSkills.push(Object.assign({ pluginId }, status));
        if (!status.complete) issue(`plugin_required_skill_incomplete:${workspaceId}:${pluginId}:${skillId}`);
        if (status.complete && !status.listenerCanReadSkillFile) {
          issue(`plugin_required_skill_unreadable:${workspaceId}:${pluginId}:${skillId}`);
        }
      }
    }

    if (options.expectedWorkspaces.includes(workspaceId)) {
      if (!summary.skillRootExists) issue(`skill_root_missing:${workspaceId}`);
      if (summary.skillCategoryCount === 0) warnings.push(`skill_root_empty:${workspaceId}`);
      if (!summary.memoryRootExists) issue(`memory_root_missing:${workspaceId}`);
      if (!summary.accessKeyConfigured) issue(`access_key_missing:${workspaceId}`);
      if (!summary.workers.some((worker) => worker.provider === "openai-codex" && worker.securityLevel === "user")) {
        issue(`openai_user_worker_missing:${workspaceId}`);
      }
      if (!summary.workers.some((worker) => worker.provider === "deepseek" && worker.securityLevel === "user")) {
        issue(`deepseek_user_worker_missing:${workspaceId}`);
      }
    } else if (!summary.localWorkspace && !summary.weixinRoute && summary.workers.length === 0) {
      warnings.push(`orphan_profile_seen:${workspaceId}`);
    }
  }

  const profileChecks = [];
  for (const worker of workers) {
    if (worker.enabled === false) continue;
    const profile = String(worker.profile || worker.name || "").trim();
    const osUser = osUserForWorker(worker);
    const workspaceIdsForWorker = workerWorkspaceIds(worker);
    const workspaceId = workspaceIdsForWorker[0] || "owner";
    const profileId = workspaceProfileId(workspaceId);
    const expectedSkillRoot = path.join(skillProfilesRoot, profileId, "skills");
    const expectedMemoryRoot = path.join(skillProfilesRoot, profileId, "memories");
    const profileDir = profileDirForWorker(worker, profile, osUser, options);
    const soulPath = path.join(profileDir, "SOUL.md");
    const skills = linkInfo(path.join(profileDir, "skills"), root, expectedSkillRoot);
    const memories = linkInfo(path.join(profileDir, "memories"), root, expectedMemoryRoot);
    const profileAccess = {
      skillsCanWriteTemp: skills.exists ? workerCanWriteDirectory(path.join(profileDir, "skills"), osUser, options) : false,
      memoriesCanWriteTemp: memories.exists ? workerCanWriteDirectory(path.join(profileDir, "memories"), osUser, options) : false,
      soul: {
        exists: exists(soulPath),
        path: compactPath(soulPath, root),
        workerCanRead: exists(soulPath) ? userCanAccessFile(soulPath, osUser, "read", options) : false,
        workerCanWrite: exists(soulPath) ? userCanAccessFile(soulPath, osUser, "write", options) : false,
      },
    };
    const profileConfig = profileConfigStatus(worker, profileDir, root, options);
    const configExists = profileConfig.exists;
    const launchd = launchdServiceStatus(worker, options);
    const telemetry = options.checkTelemetry === false ? null : telemetryStatus(worker, root, options);
    const filePluginRoots = filePluginRootStatus(worker, profile, osUser, root, options);
    const mobileBridge = mobileBridgeStatus(worker, profile, osUser, root, options);
    const codexAuth = isOpenAiCodexWorker(worker) ? codexAuthStatus(worker, profileDir, root, osUser, options) : null;
    const workerSecrets = workerSecretAccessStatus(worker, osUser, manifestPath, dataDir, root, options);
    const requiredWarm = requiredWarmProfiles.has(profile);
    const check = {
      profile,
      provider: worker.provider || "openai-codex",
      securityLevel: worker.securityLevel || "",
      workspaceId,
      osUser,
      requiredWarm,
      profileDir: compactPath(profileDir, root),
      configExists,
      profileConfig,
      skills,
      memories,
      profileAccess,
      launchd,
      telemetry,
      filePluginRoots,
      mobileBridge,
      codexAuth,
      workerSecrets,
    };
    profileChecks.push(check);
    if (!configExists) issue(`profile_config_missing:${profile}`);
    if (configExists && !profileConfig.provider) issue(`profile_config_provider_missing:${profile}`);
    if (profileConfig.provider && !profileConfig.providerMatchesManifest) {
      issue(`profile_config_provider_mismatch:${profile}:${profileConfig.provider}:${profileConfig.expectedProvider}`);
    }
    if (profileConfig.expectedModel && profileConfig.model && !profileConfig.modelMatchesExpected) {
      issue(`profile_config_model_mismatch:${profile}:${profileConfig.model}:${profileConfig.expectedModel}`);
    }
    if (profileConfig.expectedModel && configExists && !profileConfig.model) issue(`profile_config_model_missing:${profile}`);
    if (!skills.exists) issue(`profile_skills_missing:${profile}`);
    if (!memories.exists) issue(`profile_memories_missing:${profile}`);
    if (skills.exists && !profileAccess.skillsCanWriteTemp) issue(`profile_skills_temp_write_failed:${profile}`);
    if (memories.exists && !profileAccess.memoriesCanWriteTemp) issue(`profile_memories_temp_write_failed:${profile}`);
    if (!profileAccess.soul.exists) issue(`profile_soul_missing:${profile}`);
    if (profileAccess.soul.exists && !profileAccess.soul.workerCanRead) issue(`profile_soul_unreadable:${profile}`);
    if (profileAccess.soul.exists && !profileAccess.soul.workerCanWrite) issue(`profile_soul_unwritable:${profile}`);
    if (!launchd.label) issue(`launchd_label_missing:${profile}`);
    if (launchd.label && launchd.plistChecked && !launchd.plistExists) issue(`launchd_plist_missing:${profile}`);
    if (launchd.checked && !launchd.loaded) issue(`launchd_service_not_loaded:${profile}`);
    if (launchd.plistChecked && launchd.plistExists) {
      if (requiredWarm) {
        if (launchd.runAtLoad === false) issue(`launchd_required_warm_run_at_load_missing:${profile}`);
        if (launchd.keepAlive === false) issue(`launchd_required_warm_keepalive_missing:${profile}`);
      } else {
        if (launchd.runAtLoad === true) issue(`launchd_run_at_load_unexpected:${profile}`);
        if (launchd.keepAlive === true) issue(`launchd_keepalive_unexpected:${profile}`);
      }
    }
    if (telemetry) {
      if (!telemetry.statePathConfigured) issue(`telemetry_state_path_missing:${profile}`);
      if (!telemetry.responsePathConfigured) issue(`telemetry_response_path_missing:${profile}`);
      if (telemetry.statePathConfigured && !telemetry.stateExists) warnings.push(`telemetry_state_db_missing:${profile}`);
      if (telemetry.responsePathConfigured && !telemetry.responseExists) warnings.push(`telemetry_response_store_missing:${profile}`);
      if (telemetry.stateExists && !telemetry.listenerCanReadState) issue(`telemetry_state_db_unreadable:${profile}`);
      if (telemetry.responseExists && !telemetry.listenerCanReadResponse) issue(`telemetry_response_store_unreadable:${profile}`);
    }
    if (!filePluginRoots.startScriptExists) {
      issue(`file_plugin_start_script_missing:${profile}`);
    }
    if (filePluginRoots.unsupportedColonRootList) {
      issue(`file_plugin_root_list_delimiter_unsupported:${profile}`);
    }
    for (const item of filePluginRoots.env) {
      if (!item.present) issue(`file_plugin_root_env_missing:${profile}:${item.name}`);
      for (const rootCheck of item.rootsPresent) {
        if (!rootCheck.present) issue(`file_plugin_root_missing:${profile}:${item.name}:${rootCheck.root}`);
      }
    }
    for (const item of mobileBridge.env) {
      if (!item.present) issue(`mobile_bridge_env_missing:${profile}:${item.name}`);
    }
    if (!mobileBridge.defaultHostUrlPresent) issue(`mobile_bridge_host_url_default_missing:${profile}`);
    if (!mobileBridge.keyPathPresent) issue(`mobile_bridge_key_path_missing:${profile}:${MOBILE_BRIDGE_HOST_KEY_ROOT}`);
    if (codexAuth) {
      if (!codexAuth.authJson?.exists) issue(`codex_auth_json_missing:${profile}`);
      if (!codexAuth.authLock?.exists) issue(`codex_auth_lock_missing:${profile}`);
      if (codexAuth.authJson?.exists && !codexAuth.authJson?.isSymbolicLink) issue(`codex_auth_json_not_linked:${profile}`);
      if (codexAuth.authLock?.exists && !codexAuth.authLock?.isSymbolicLink) issue(`codex_auth_lock_not_linked:${profile}`);
      if (codexAuth.authJson?.isSymbolicLink && !codexAuth.authJson?.targetMatchesExpected) {
        issue(`codex_auth_json_target_unexpected:${profile}`);
      }
      if (codexAuth.authLock?.isSymbolicLink && !codexAuth.authLock?.targetMatchesExpected) {
        issue(`codex_auth_lock_target_unexpected:${profile}`);
      }
      if (codexAuth.authJson?.exists && !codexAuth.workerCanReadAuthJson) issue(`codex_auth_json_unreadable:${profile}`);
      if (codexAuth.authJson?.exists && !codexAuth.workerCanWriteAuthJson) issue(`codex_auth_json_unwritable:${profile}`);
      if (codexAuth.authLock?.exists && !codexAuth.workerCanReadAuthLock) issue(`codex_auth_lock_unreadable:${profile}`);
      if (codexAuth.authLock?.exists && !codexAuth.workerCanWriteAuthLock) issue(`codex_auth_lock_unwritable:${profile}`);
    }
    if (workerSecrets.manifest.exists) {
      for (const item of workerSecrets.manifest.users) {
        if (!item.canRead) issue(`worker_manifest_unreadable:${profile}:${item.user}`);
      }
    }
    if (workerSecrets.apiKeyFile.configured && !workerSecrets.apiKeyFile.exists) {
      issue(`worker_api_key_file_missing:${profile}`);
    }
    if (workerSecrets.apiKeyFile.exists) {
      for (const item of workerSecrets.apiKeyFile.users) {
        if (!item.canRead) issue(`worker_api_key_unreadable:${profile}:${item.user}`);
      }
    }
    for (const providerKey of workerSecrets.providerKeyFiles) {
      if (!providerKey.exists) continue;
      for (const item of providerKey.users) {
        if (!item.canRead) issue(`worker_provider_key_unreadable:${profile}:${item.user}:${providerKey.basename}`);
      }
    }
    if (skills.exists && !skills.isSymbolicLink) issue(`profile_skills_not_linked:${profile}`);
    if (memories.exists && !memories.isSymbolicLink) issue(`profile_memories_not_linked:${profile}`);
    if (skills.isSymbolicLink && !skills.targetMatchesExpected) {
      warnings.push(`profile_skills_target_unexpected:${profile}`);
    }
    if (memories.isSymbolicLink && !memories.targetMatchesExpected) {
      warnings.push(`profile_memories_target_unexpected:${profile}`);
    }
  }

  const installedGatewayLaunchd = installedGatewayLaunchdScripts(root, options);
  const installedGatewayChecks = [];
  for (const item of installedGatewayLaunchd) {
    const script = readArbitraryStartScriptText(item.startScriptPath, root, options);
    const mobileBridge = mobileBridgeStatusFromScript(script, root);
    const scriptText = String(script.text || "").replaceAll("\\", "/");
    const check = {
      label: item.label,
      plistPath: item.plistPath,
      startScriptPath: compactPath(item.startScriptPath, root),
      expectedStartScriptPath: compactPath(manifestLaunchdStartScripts.get(item.label) || "", root),
      startScriptExists: script.exists,
      trackedByManifest: manifestLaunchdLabels.has(item.label),
      mobileBridge,
      rootMatchesProduction: scriptText.includes(root.replaceAll("\\", "/")),
      devRootPresent: /\/Users\/hermes-dev\/HermesMobileDev/.test(scriptText),
    };
    check.startScriptPathMatchesManifest = !check.trackedByManifest
      || !check.expectedStartScriptPath
      || path.resolve(item.startScriptPath || "") === path.resolve(manifestLaunchdStartScripts.get(item.label) || "");
    installedGatewayChecks.push(check);
    if (!check.trackedByManifest) issue(`installed_gateway_launchd_untracked:${item.label}`);
    if (!script.exists) issue(`installed_gateway_start_script_missing:${item.label}`);
    if (check.trackedByManifest && !check.startScriptPathMatchesManifest) {
      issue(`installed_gateway_start_script_path_mismatch:${item.label}`);
    }
    if (check.devRootPresent || (script.exists && !check.rootMatchesProduction)) {
      issue(`installed_gateway_start_script_root_mismatch:${item.label}`);
    }
    for (const env of mobileBridge.env) {
      if (!env.present) issue(`installed_gateway_mobile_bridge_env_missing:${item.label}:${env.name}`);
    }
    if (!mobileBridge.defaultHostUrlPresent) issue(`installed_gateway_mobile_bridge_host_url_default_missing:${item.label}`);
    if (!mobileBridge.keyPathPresent) issue(`installed_gateway_mobile_bridge_key_path_missing:${item.label}:${MOBILE_BRIDGE_HOST_KEY_ROOT}`);
  }

  const sharedSkillRoot = path.join(skillProfilesRoot, "shared-global", "skills");
  const sharedSkillChecks = options.requiredSharedSkills.map((skillId) => skillBundleStatus(sharedSkillRoot, skillId));
  for (const check of sharedSkillChecks) {
    if (!check.complete) issue(`shared_skill_missing:${check.skill}`);
  }

  for (const pluginId of options.expectedPlugins) {
    if (!plugins.some((row) => row.pluginId === pluginId)) issue(`plugin_authorization_missing_all:${pluginId}`);
  }

  const staleSkillProfiles = [];
  try {
    for (const name of fs.readdirSync(skillProfilesRoot)) {
      if (name.startsWith(".")) continue;
      if (["shared-global", "grok"].includes(name)) continue;
      const workspaceId = name === "owner-full" ? "owner" : name;
      if (!workspaceIds.has(workspaceId)) staleSkillProfiles.push(name);
    }
  } catch (_) {}
  for (const name of staleSkillProfiles) warnings.push(`stale_skill_profile:${name}`);

  return {
    ok: issueSet.size === 0,
    root: compactPath(root, root),
    manifest: {
      exists: exists(manifestPath),
      workerCount: workers.length,
      providerSummary: workers.reduce((acc, worker) => {
        const key = `${worker.provider || "openai-codex"}|${worker.securityLevel || ""}`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
      telemetryStatePathCount: workers.filter((worker) => telemetryPathConfigured(worker, "state")).length,
      telemetryResponsePathCount: workers.filter((worker) => telemetryPathConfigured(worker, "response")).length,
    },
    activeWorkspaceKeys: [...activeKeys],
    pluginAuthorizations: plugins,
    byWorkspace,
    profileChecks,
    installedGatewayChecks,
    sharedSkillChecks,
    staleSkillProfiles,
    issues: [...issueSet].sort(),
    warnings: warnings.sort(),
  };
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  const audit = buildAudit(options);
  if (options.json) {
    console.log(JSON.stringify(audit, null, 2));
  } else {
    console.log(`macos_production_profile_audit ok=${audit.ok} issues=${audit.issues.length} warnings=${audit.warnings.length}`);
    for (const item of audit.issues) console.log(`issue ${item}`);
    for (const item of audit.warnings) console.log(`warning ${item}`);
  }
  if (options.strict && !audit.ok) process.exit(1);
}

module.exports = {
  buildAudit,
  filePluginRootStatus,
  installedGatewayLaunchdScripts,
  launchdServiceStatus,
  mobileBridgeStatus,
  parseArgs,
  telemetryStatus,
};
