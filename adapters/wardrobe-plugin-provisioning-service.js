"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_WARDROBE_REGISTRATION_PATH = "/api/v1/hermes/plugin/workspaces";
const DEFAULT_WARDROBE_SCOPES = Object.freeze(["items:read", "items:write", "history:write", "sync:read"]);
const DEFAULT_MAX_KEY_SEARCH_DEPTH = 6;

function stringValue(value) {
  return String(value || "").trim();
}

function boundedError(value) {
  return stringValue(value).replace(/\s+/g, " ").slice(0, 160) || "wardrobe_plugin_provisioning_failed";
}

function defaultDataDir(env = process.env) {
  return stringValue(env.HERMES_WEB_DATA_DIR)
    || stringValue(env.HERMES_MOBILE_DATA_DIR)
    || path.join(process.cwd(), "workspace", "hermes-web");
}

function safeWorkspaceId(value) {
  const text = stringValue(value);
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(text)) return "";
  if (text === "owner") return "";
  return text;
}

function wardrobeWorkspaceIdForHermesWorkspace(workspaceId) {
  const safe = safeWorkspaceId(workspaceId);
  return safe ? `wardrobe:${safe}` : "";
}

function wardrobeWorkspaceRoot(input = {}) {
  const dataDir = stringValue(input.dataDir) || defaultDataDir(input.env);
  const workspaceId = safeWorkspaceId(input.workspaceId);
  if (!workspaceId) return "";
  return path.join(dataDir, "drive", "users", workspaceId);
}

function wardrobeWorkspaceConfigDir(input = {}) {
  const root = wardrobeWorkspaceRoot(input);
  return root ? path.join(root, ".hermes-wardrobe") : "";
}

function wardrobeWorkspaceConfigPath(input = {}) {
  const configDir = wardrobeWorkspaceConfigDir(input);
  return configDir ? path.join(configDir, "config.json") : "";
}

function wardrobeWorkspaceKeyPath(input = {}) {
  const configDir = wardrobeWorkspaceConfigDir(input);
  return configDir ? path.join(configDir, "access-key.txt") : "";
}

function generateWardrobeWorkspaceKey() {
  return `hwd_${crypto.randomBytes(32).toString("base64url")}`;
}

function sha256Hex(value = "") {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function ensureWardrobeWorkspaceKey(input = {}) {
  const keyPath = wardrobeWorkspaceKeyPath(input);
  if (!keyPath) return { ok: false, error: "workspace_id_required" };
  let existing = "";
  try {
    existing = fs.existsSync(keyPath) ? fs.readFileSync(keyPath, "utf8").trim() : "";
  } catch (_) {
    return { ok: false, error: "wardrobe_plugin_key_read_failed" };
  }
  if (existing) return { ok: true, keyPath, created: false };
  try {
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    fs.writeFileSync(keyPath, `${generateWardrobeWorkspaceKey()}\n`, { encoding: "utf8", mode: 0o600 });
    return { ok: true, keyPath, created: true };
  } catch (_) {
    return { ok: false, error: "wardrobe_plugin_key_write_failed" };
  }
}

function wardrobeApiBaseUrl(manifestUrl = "") {
  try {
    const parsed = new URL(stringValue(manifestUrl));
    return parsed.origin;
  } catch (_) {
    return "";
  }
}

function wardrobeRegistrationUrl(manifestUrl = "") {
  try {
    return new URL(DEFAULT_WARDROBE_REGISTRATION_PATH, stringValue(manifestUrl)).toString();
  } catch (_) {
    return "";
  }
}

function safeDisplayName(input = {}) {
  return stringValue(input.displayName || input.workspaceLabel || input.workspace_label)
    || stringValue(input.workspaceId)
    || "workspace";
}

function writeWardrobeWorkspaceConfig(input = {}) {
  const workspaceId = safeWorkspaceId(input.workspaceId);
  if (!workspaceId) return { ok: false, error: "workspace_id_required" };
  const configPath = wardrobeWorkspaceConfigPath(input);
  const apiBaseUrl = stringValue(input.apiBaseUrl) || wardrobeApiBaseUrl(input.wardrobeManifestUrl);
  if (!configPath || !apiBaseUrl) return { ok: false, error: "wardrobe_config_input_invalid" };
  const config = {
    schema_version: 1,
    api_base_url: apiBaseUrl,
    api_fallback_urls: Array.isArray(input.apiFallbackUrls) ? input.apiFallbackUrls.map(stringValue).filter(Boolean) : [],
    workspace_id: wardrobeWorkspaceIdForHermesWorkspace(workspaceId),
    hermes_workspace_id: workspaceId,
    owner: workspaceId,
    owner_display_name: safeDisplayName(Object.assign({}, input, { workspaceId })),
    access_key_file: ".hermes-wardrobe/access-key.txt",
    cache_dir: ".hermes-cache",
    manifest_path: ".hermes-cache/outfit-context-manifest.json",
    resource_cache_dir: ".hermes-cache/resources",
    photo_cache_dir: ".hermes-cache/photos",
    scopes: DEFAULT_WARDROBE_SCOPES.slice(),
    provisioned_by: "hermes-mobile",
    updated_at: typeof input.nowIso === "function" ? input.nowIso() : new Date().toISOString(),
  };
  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    fs.mkdirSync(path.join(wardrobeWorkspaceRoot(input), ".hermes-cache"), { recursive: true });
    return { ok: true, configPath, config };
  } catch (_) {
    return { ok: false, error: "wardrobe_config_write_failed" };
  }
}

function findWardrobeConfigPath(input = {}, options = {}) {
  const explicit = stringValue(input.wardrobeConfigPath || options.wardrobeConfigPath);
  if (explicit && fs.existsSync(explicit)) return explicit;
  const direct = wardrobeWorkspaceConfigPath(Object.assign({}, options, input));
  if (direct && fs.existsSync(direct)) return direct;
  const workspaceId = stringValue(input.workspaceId || "owner");
  const dataDir = stringValue(options.dataDir) || defaultDataDir(options.env);
  const workspaceRoot = path.join(dataDir, "drive", "users", workspaceId);
  const maxDepth = Number(options.maxKeySearchDepth || DEFAULT_MAX_KEY_SEARCH_DEPTH);

  function walk(dir, depth) {
    if (depth > maxDepth) return "";
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return "";
    }
    const directCandidate = path.join(dir, ".hermes-wardrobe", "config.json");
    if (fs.existsSync(directCandidate)) return directCandidate;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === ".hermes-cache" || entry.name === "node_modules" || entry.name === ".git") continue;
      const found = walk(path.join(dir, entry.name), depth + 1);
      if (found) return found;
    }
    return "";
  }

  return walk(workspaceRoot, 0);
}

function readWardrobeWorkspaceConfig(input = {}, options = {}) {
  const configPath = findWardrobeConfigPath(input, options);
  if (!configPath) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (_) {
    return {};
  }
}

function shouldSkipSkillCopyEntry(entryName = "") {
  const name = stringValue(entryName);
  return name === ".git"
    || name === "node_modules"
    || name === ".hermes-wardrobe"
    || name === ".hermes-cache"
    || name === ".usage.json"
    || name === "access-key.txt"
    || name === "workspace-key.txt";
}

function copySkillDirectory(sourceDir, targetDir) {
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of entries) {
    if (shouldSkipSkillCopyEntry(entry.name)) continue;
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copySkillDirectory(sourcePath, targetPath);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function defaultWardrobeSkillText() {
  return [
    "---",
    "name: wardrobe-style-operations",
    "description: Use the Wardrobe MCP toolset for this Hermes workspace's wardrobe reads, writes, photo checks, and outfit history. The skill is a keyless template; credentials live only in the workspace .hermes-wardrobe directory.",
    "---",
    "",
    "# Wardrobe Style Operations",
    "",
    "Use the `wardrobe` MCP toolset for wardrobe item search, item readback, photo upload/verification, outfit recommendations, and wear-history writeback.",
    "",
    "Rules:",
    "",
    "- Treat the active Hermes workspace as the only wardrobe owner.",
    "- Do not override the Wardrobe MCP workspace at runtime.",
    "- Do not read, print, copy, or summarize access-key files.",
    "- Do not store keys, launch tokens, private image paths, or full inventory dumps in chats, logs, docs, or receipts.",
    "- For writes, prefer dry-run/preview first when the tool supports it, then verify through Wardrobe readback.",
    "",
  ].join("\n");
}

function defaultSkillSourceCandidates(input = {}) {
  const repoRoot = stringValue(input.repoRoot) || process.cwd();
  const dataDir = stringValue(input.dataDir) || defaultDataDir(input.env);
  return [
    stringValue(input.wardrobeSkillTemplatePath),
    path.join(repoRoot, "skills", "productivity", "wardrobe-style-operations"),
    path.join(dataDir, "skill-profiles", "owner-full", "skills", "productivity", "wardrobe-style-operations"),
  ].filter(Boolean);
}

function installWardrobeSkill(input = {}) {
  const skillStorePath = stringValue(input.skillStorePath)
    || path.join(stringValue(input.dataDir) || defaultDataDir(input.env), "skill-profiles", safeWorkspaceId(input.workspaceId), "skills");
  const targetDir = path.join(skillStorePath, "productivity", "wardrobe-style-operations");
  if (!safeWorkspaceId(input.workspaceId) || !skillStorePath) return { ok: false, error: "workspace_id_required" };
  try {
    const sourceDir = defaultSkillSourceCandidates(input).find((candidate) => {
      try {
        return candidate && fs.existsSync(path.join(candidate, "SKILL.md"));
      } catch (_) {
        return false;
      }
    });
    if (sourceDir) {
      copySkillDirectory(sourceDir, targetDir);
      return { ok: true, skillPath: path.join(targetDir, "SKILL.md"), source: "template_copy" };
    }
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, "SKILL.md"), defaultWardrobeSkillText(), "utf8");
    return { ok: true, skillPath: path.join(targetDir, "SKILL.md"), source: "built_in_template" };
  } catch (err) {
    return { ok: false, error: boundedError(err?.message || err) };
  }
}

async function registerWardrobeWorkspace(input = {}, options = {}) {
  const fetchImpl = options.fetch || input.fetch || global.fetch;
  if (typeof fetchImpl !== "function") return { ok: false, error: "fetch_unavailable" };
  const workspaceId = safeWorkspaceId(input.workspaceId);
  if (!workspaceId) return { ok: false, error: "workspace_id_required" };
  const url = wardrobeRegistrationUrl(input.wardrobeManifestUrl);
  if (!url) return { ok: false, error: "wardrobe_registration_url_invalid" };
  let rawKey = "";
  try {
    rawKey = fs.readFileSync(wardrobeWorkspaceKeyPath(input), "utf8").trim();
  } catch (_) {
    return { ok: false, error: "wardrobe_plugin_key_read_failed" };
  }
  if (!rawKey) return { ok: false, error: "wardrobe_plugin_key_empty" };
  const keyHash = sha256Hex(rawKey);
  const body = {
    owner: workspaceId,
    owner_display_name: safeDisplayName(Object.assign({}, input, { workspaceId })),
    hermes_workspace_id: workspaceId,
    workspace_id: wardrobeWorkspaceIdForHermesWorkspace(workspaceId),
    access_key_hash: keyHash,
    access_key_sha256: keyHash,
    access_key_hash_algorithm: "sha256",
    scopes: DEFAULT_WARDROBE_SCOPES.slice(),
  };
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, error: boundedError(err?.message || err) };
  }
  if (!response || !response.ok) {
    return { ok: false, status: response?.status || 0, error: `wardrobe_registration_failed_${response?.status || 0}` };
  }
  let payload = {};
  try {
    payload = await response.json();
  } catch (_) {
    payload = {};
  }
  const result = payload.result || payload;
  return {
    ok: true,
    status: response.status || 200,
    wardrobeWorkspaceId: stringValue(result.workspace_id || result.workspaceId || body.workspace_id),
    owner: stringValue(result.owner || result.hermes_workspace_id || workspaceId),
    created: Boolean(result.created || payload.created),
  };
}

function verifyLocalProvisioning(input = {}) {
  const workspaceId = safeWorkspaceId(input.workspaceId);
  const config = readWardrobeWorkspaceConfig(input, input);
  const keyPath = wardrobeWorkspaceKeyPath(input);
  const skillPath = stringValue(input.skillPath);
  const expectedWardrobeWorkspaceId = wardrobeWorkspaceIdForHermesWorkspace(workspaceId);
  return {
    keyPresent: Boolean(keyPath && fs.existsSync(keyPath)),
    configPresent: Boolean(findWardrobeConfigPath(input, input)),
    configWorkspaceMatches: stringValue(config.workspace_id || config.workspaceId) === expectedWardrobeWorkspaceId,
    skillPresent: Boolean(skillPath && fs.existsSync(skillPath)),
    wardrobeWorkspaceId: expectedWardrobeWorkspaceId,
  };
}

function createWardrobePluginProvisioningService(options = {}) {
  const fetchImpl = options.fetch || global.fetch;
  const dataDir = options.dataDir;
  const env = options.env || process.env;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();

  async function provisionWorkspace(input = {}) {
    const workspaceId = safeWorkspaceId(input.workspaceId);
    if (!workspaceId) return { ok: false, error: "workspace_id_required" };
    const baseInput = Object.assign({}, input, {
      dataDir,
      env,
      nowIso,
      apiBaseUrl: stringValue(input.apiBaseUrl) || wardrobeApiBaseUrl(input.wardrobeManifestUrl),
      repoRoot: options.repoRoot,
      wardrobeSkillTemplatePath: options.wardrobeSkillTemplatePath,
    });
    const key = ensureWardrobeWorkspaceKey(baseInput);
    if (!key.ok) return { ok: false, error: key.error || "wardrobe_plugin_key_failed" };
    const config = writeWardrobeWorkspaceConfig(baseInput);
    if (!config.ok) return { ok: false, error: config.error || "wardrobe_config_failed", keyCreated: key.created };
    const registration = await registerWardrobeWorkspace(baseInput, { fetch: fetchImpl });
    if (!registration.ok) {
      return {
        ok: false,
        error: registration.error || "wardrobe_registration_failed",
        status: registration.status || 0,
        keyCreated: key.created,
        configWritten: true,
      };
    }
    const gateway = options.gatewayWorkspaceProvisioningService
      && typeof options.gatewayWorkspaceProvisioningService.ensureWorkspaceGateway === "function"
      ? options.gatewayWorkspaceProvisioningService.ensureWorkspaceGateway({
        workspaceId,
        refreshProfileBinding: true,
      })
      : { ok: true, skipped: true, reason: "gateway_provisioning_unavailable" };
    if (gateway && gateway.ok === false) {
      return {
        ok: false,
        error: gateway.reason || gateway.error || "wardrobe_gateway_profile_failed",
        keyCreated: key.created,
        configWritten: true,
        registrationStatus: "accepted",
      };
    }
    const skill = installWardrobeSkill(Object.assign({}, baseInput, {
      skillStorePath: gateway?.skillStorePath,
    }));
    if (!skill.ok) {
      return {
        ok: false,
        error: skill.error || "wardrobe_skill_install_failed",
        keyCreated: key.created,
        configWritten: true,
        registrationStatus: "accepted",
      };
    }
    const verification = verifyLocalProvisioning(Object.assign({}, baseInput, {
      skillPath: skill.skillPath,
    }));
    const verified = verification.keyPresent && verification.configPresent && verification.configWorkspaceMatches && verification.skillPresent;
    if (!verified) {
      return {
        ok: false,
        error: "wardrobe_local_verification_failed",
        keyCreated: key.created,
        configWritten: true,
        registrationStatus: "accepted",
        verification,
      };
    }
    return {
      ok: true,
      keyCreated: key.created,
      configCreated: true,
      wardrobeWorkspaceId: registration.wardrobeWorkspaceId || verification.wardrobeWorkspaceId,
      owner: registration.owner || workspaceId,
      created: Boolean(registration.created),
      skillInstalled: true,
      skillSource: skill.source,
      gatewayProfiles: Array.isArray(gateway?.profiles) ? gateway.profiles : [],
      gatewayRestartRequired: Boolean(gateway?.restartRequired),
      gatewayProfileBindingRefreshed: Boolean(gateway?.profileBindingRefreshed),
      verification,
    };
  }

  return {
    ensureWorkspaceKey: (input = {}) => ensureWardrobeWorkspaceKey(Object.assign({ dataDir, env }, input)),
    installWardrobeSkill: (input = {}) => installWardrobeSkill(Object.assign({ dataDir, env }, input)),
    provisionWorkspace,
    registerWorkspace: (input = {}) => registerWardrobeWorkspace(Object.assign({ dataDir, env }, input), { fetch: fetchImpl }),
    verifyLocalProvisioning: (input = {}) => verifyLocalProvisioning(Object.assign({ dataDir, env }, input)),
  };
}

module.exports = {
  DEFAULT_WARDROBE_REGISTRATION_PATH,
  DEFAULT_WARDROBE_SCOPES,
  createWardrobePluginProvisioningService,
  ensureWardrobeWorkspaceKey,
  findWardrobeConfigPath,
  generateWardrobeWorkspaceKey,
  installWardrobeSkill,
  readWardrobeWorkspaceConfig,
  registerWardrobeWorkspace,
  sha256Hex,
  verifyLocalProvisioning,
  wardrobeApiBaseUrl,
  wardrobeRegistrationUrl,
  wardrobeWorkspaceConfigPath,
  wardrobeWorkspaceIdForHermesWorkspace,
  wardrobeWorkspaceKeyPath,
  wardrobeWorkspaceRoot,
};
