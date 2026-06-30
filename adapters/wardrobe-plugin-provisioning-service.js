"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_WARDROBE_REGISTRATION_PATH = "/api/v1/hermes/plugin/workspaces";
const DEFAULT_WARDROBE_SCOPES = Object.freeze(["items:read", "items:write", "history:write", "sync:read"]);
const DEFAULT_MAX_KEY_SEARCH_DEPTH = 6;
const DEFAULT_WARDROBE_WORKSPACE_KEY_PREFIX = "wd_live_";
const MIN_COMPLETE_WARDROBE_SKILL_BYTES = 2048;
const REQUIRED_WARDROBE_SKILL_REFERENCE = "wardrobe-program-api.md";
const REQUIRED_WARDROBE_SKILL_SCRIPT = "render_wardrobe_phone_pdf.py";
const WARDROBE_SKILL_TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".py",
  ".txt",
  ".yaml",
  ".yml",
]);

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

function wardrobePhotoCacheDir(input = {}) {
  const dataDir = stringValue(input.dataDir) || defaultDataDir(input.env);
  const workspaceId = safeWorkspaceId(input.workspaceId);
  if (!dataDir || !workspaceId) return "";
  return path.join(dataDir, "artifacts", "wardrobe-thumbnails", workspaceId);
}

function findWardrobeAccessKeyPath(input = {}, options = {}) {
  const explicit = stringValue(input.wardrobeAccessKeyPath || options.wardrobeAccessKeyPath);
  if (explicit && fs.existsSync(explicit)) return explicit;
  const workspaceId = stringValue(input.workspaceId || options.workspaceId || "owner");
  const dataDir = stringValue(input.dataDir || options.dataDir) || defaultDataDir(input.env || options.env);
  const workspaceRoot = path.join(dataDir, "drive", "users", workspaceId);
  const maxDepth = Number(input.maxKeySearchDepth || options.maxKeySearchDepth || DEFAULT_MAX_KEY_SEARCH_DEPTH);

  function walk(dir, depth) {
    if (depth > maxDepth) return "";
    const directCandidate = path.join(dir, ".hermes-wardrobe", "access-key.txt");
    if (fs.existsSync(directCandidate)) return directCandidate;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return "";
    }
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

function defaultWardrobeRegistrationAccessKeyPath(input = {}, options = {}) {
  const env = input.env || options.env || process.env;
  const dataDir = stringValue(input.dataDir || options.dataDir) || defaultDataDir(env);
  return path.join(dataDir, "plugin-secrets", "wardrobe-registration-access-key.txt");
}

function findWardrobeRegistrationAccessKeyPath(input = {}, options = {}) {
  const env = input.env || options.env || process.env;
  const explicit = stringValue(input.wardrobeRegistrationAccessKeyPath || options.wardrobeRegistrationAccessKeyPath)
    || stringValue(env.HERMES_MOBILE_WARDROBE_REGISTRATION_ACCESS_KEY_PATH)
    || stringValue(env.HERMES_MOBILE_PLUGIN_WARDROBE_REGISTRATION_ACCESS_KEY_PATH);
  if (explicit && fs.existsSync(explicit)) return explicit;
  const defaultPath = defaultWardrobeRegistrationAccessKeyPath(input, options);
  if (defaultPath && fs.existsSync(defaultPath)) return defaultPath;
  return findWardrobeAccessKeyPath(Object.assign({}, input, { workspaceId: "owner" }), options);
}

function readWardrobeRegistrationAccessKey(input = {}, options = {}) {
  const env = input.env || options.env || process.env;
  const inline = stringValue(input.wardrobeRegistrationAccessKey || options.wardrobeRegistrationAccessKey)
    || stringValue(env.HERMES_MOBILE_WARDROBE_REGISTRATION_ACCESS_KEY);
  if (inline) return { ok: true, accessKey: inline, source: "inline" };
  const keyPath = findWardrobeRegistrationAccessKeyPath(input, options);
  if (!keyPath) return { ok: false, error: "wardrobe_registration_key_missing" };
  try {
    const accessKey = fs.readFileSync(keyPath, "utf8").trim();
    if (!accessKey) return { ok: false, error: "wardrobe_registration_key_empty" };
    return { ok: true, accessKey, source: "file" };
  } catch (_) {
    return { ok: false, error: "wardrobe_registration_key_read_failed" };
  }
}

function wardrobeWorkspaceKeyPrefix(input = {}) {
  return stringValue(input.wardrobeWorkspaceKeyPrefix)
    || stringValue((input.env || process.env).HERMES_MOBILE_WARDROBE_WORKSPACE_KEY_PREFIX)
    || DEFAULT_WARDROBE_WORKSPACE_KEY_PREFIX;
}

function generateWardrobeWorkspaceKey(input = {}) {
  return `${wardrobeWorkspaceKeyPrefix(input)}${crypto.randomBytes(32).toString("base64url")}`;
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
  const expectedPrefix = wardrobeWorkspaceKeyPrefix(input);
  if (existing && existing.startsWith(expectedPrefix)) return { ok: true, keyPath, created: false };
  try {
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    fs.writeFileSync(keyPath, `${generateWardrobeWorkspaceKey(input)}\n`, { encoding: "utf8", mode: 0o600 });
    return { ok: true, keyPath, created: true, replacedInvalid: Boolean(existing) };
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
    photo_cache_dir: wardrobePhotoCacheDir(input),
    scopes: DEFAULT_WARDROBE_SCOPES.slice(),
    provisioned_by: "hermes-mobile",
    updated_at: typeof input.nowIso === "function" ? input.nowIso() : new Date().toISOString(),
  };
  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    fs.mkdirSync(path.join(wardrobeWorkspaceRoot(input), ".hermes-cache"), { recursive: true });
    if (config.photo_cache_dir) fs.mkdirSync(config.photo_cache_dir, { recursive: true });
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
    || name === "__pycache__"
    || name === ".pytest_cache"
    || name === ".DS_Store"
    || name === ".usage.json"
    || name === "access-key.txt"
    || name === "workspace-key.txt"
    || name.endsWith(".pyc")
    || name.endsWith(".pyo");
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
  const explicit = stringValue(input.wardrobeSkillTemplatePath);
  if (explicit) {
    return [{ sourceKind: "explicit_template", dir: explicit }];
  }
  return [
    { sourceKind: "owner_full", dir: path.join(dataDir, "skill-profiles", "owner-full", "skills", "productivity", "wardrobe-style-operations") },
    { sourceKind: "repo_template", dir: path.join(repoRoot, "skills", "productivity", "wardrobe-style-operations") },
  ].filter((candidate) => candidate.dir);
}

function isTextSkillFile(filePath = "") {
  return WARDROBE_SKILL_TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function listSkillFiles(rootDir) {
  const files = [];
  function walk(dir) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      if (shouldSkipSkillCopyEntry(entry.name)) continue;
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }
  walk(rootDir);
  return files;
}

function scanSkillDirectoryForSensitiveContent(rootDir) {
  const files = listSkillFiles(rootDir);
  for (const filePath of files) {
    if (!isTextSkillFile(filePath)) continue;
    let text = "";
    try {
      text = fs.readFileSync(filePath, "utf8");
    } catch (_) {
      return { ok: false, error: "wardrobe_skill_scan_failed" };
    }
    if (
      /wd_live_[A-Za-z0-9_-]{8,}/.test(text)
      || /wpl_[A-Za-z0-9_-]{8,}/.test(text)
      || /Authorization:\s*Bearer\s+[A-Za-z0-9._~+/-]{8,}/i.test(text)
    ) {
      return { ok: false, error: "wardrobe_skill_sensitive_content" };
    }
  }
  return { ok: true, fileCount: files.length };
}

function validateWardrobeSkillBundle(rootDir) {
  const dir = stringValue(rootDir);
  const missing = [];
  const skillPath = path.join(dir, "SKILL.md");
  const referencesDir = path.join(dir, "references");
  const scriptsDir = path.join(dir, "scripts");
  let skillBytes = 0;
  let referenceFiles = [];
  let scriptFiles = [];

  try {
    if (fs.existsSync(skillPath)) {
      skillBytes = fs.statSync(skillPath).size;
    } else {
      missing.push("SKILL.md");
    }
    if (skillBytes > 0 && skillBytes < MIN_COMPLETE_WARDROBE_SKILL_BYTES) {
      missing.push("complete_SKILL.md");
    }
    referenceFiles = fs.existsSync(referencesDir)
      ? fs.readdirSync(referencesDir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name)
      : [];
    scriptFiles = fs.existsSync(scriptsDir)
      ? fs.readdirSync(scriptsDir, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name)
      : [];
  } catch (_) {
    return { ok: false, error: "wardrobe_skill_bundle_read_failed" };
  }

  if (!referenceFiles.includes(REQUIRED_WARDROBE_SKILL_REFERENCE)) {
    missing.push(`references/${REQUIRED_WARDROBE_SKILL_REFERENCE}`);
  }
  if (referenceFiles.filter((name) => name.endsWith(".md")).length < 2) {
    missing.push("references/*.md");
  }
  if (!scriptFiles.includes(REQUIRED_WARDROBE_SKILL_SCRIPT)) {
    missing.push(`scripts/${REQUIRED_WARDROBE_SKILL_SCRIPT}`);
  }

  const sensitive = scanSkillDirectoryForSensitiveContent(dir);
  if (!sensitive.ok) {
    return Object.assign({
      ok: false,
      skillBytes,
      referenceFiles: referenceFiles.length,
      scriptFiles: scriptFiles.length,
      missing,
    }, sensitive);
  }

  return {
    ok: missing.length === 0,
    error: missing.length ? "wardrobe_skill_bundle_incomplete" : "",
    skillBytes,
    referenceFiles: referenceFiles.length,
    scriptFiles: scriptFiles.length,
    hasProgramApiReference: referenceFiles.includes(REQUIRED_WARDROBE_SKILL_REFERENCE),
    hasRenderPdfScript: scriptFiles.includes(REQUIRED_WARDROBE_SKILL_SCRIPT),
    missing,
    sensitiveContentPresent: false,
  };
}

function publicSkillBundleValidation(validation = {}) {
  return {
    ok: Boolean(validation.ok),
    skillBytes: Number(validation.skillBytes || 0),
    referenceFiles: Number(validation.referenceFiles || 0),
    scriptFiles: Number(validation.scriptFiles || 0),
    hasProgramApiReference: Boolean(validation.hasProgramApiReference),
    hasRenderPdfScript: Boolean(validation.hasRenderPdfScript),
    missing: Array.isArray(validation.missing) ? validation.missing.slice(0, 8) : [],
    sensitiveContentPresent: Boolean(validation.sensitiveContentPresent || validation.error === "wardrobe_skill_sensitive_content"),
  };
}

function findCompleteWardrobeSkillSource(input = {}) {
  const invalidCandidates = [];
  for (const candidate of defaultSkillSourceCandidates(input)) {
    const candidateDir = stringValue(candidate.dir);
    if (!candidateDir || !fs.existsSync(candidateDir)) {
      invalidCandidates.push({ sourceKind: candidate.sourceKind, reason: "missing" });
      continue;
    }
    const validation = validateWardrobeSkillBundle(candidateDir);
    if (validation.ok) {
      return {
        ok: true,
        sourceDir: candidateDir,
        sourceKind: candidate.sourceKind,
        validation,
      };
    }
    invalidCandidates.push({
      sourceKind: candidate.sourceKind,
      reason: validation.error || "wardrobe_skill_bundle_incomplete",
      missing: Array.isArray(validation.missing) ? validation.missing.slice(0, 8) : [],
    });
  }
  return {
    ok: false,
    error: "wardrobe_skill_bundle_incomplete",
    invalidCandidates,
  };
}

function installWardrobeSkill(input = {}) {
  const skillStorePath = stringValue(input.skillStorePath)
    || path.join(stringValue(input.dataDir) || defaultDataDir(input.env), "skill-profiles", safeWorkspaceId(input.workspaceId), "skills");
  const targetDir = path.join(skillStorePath, "productivity", "wardrobe-style-operations");
  if (!safeWorkspaceId(input.workspaceId) || !skillStorePath) return { ok: false, error: "workspace_id_required" };
  try {
    const source = findCompleteWardrobeSkillSource(input);
    if (!source.ok) {
      return {
        ok: false,
        error: source.error || "wardrobe_skill_bundle_incomplete",
        invalidCandidates: source.invalidCandidates,
      };
    }
    fs.rmSync(targetDir, { recursive: true, force: true });
    copySkillDirectory(source.sourceDir, targetDir);
    const targetValidation = validateWardrobeSkillBundle(targetDir);
    if (!targetValidation.ok) {
      return {
        ok: false,
        error: targetValidation.error || "wardrobe_skill_install_verification_failed",
        bundle: publicSkillBundleValidation(targetValidation),
      };
    }
    return {
      ok: true,
      skillPath: path.join(targetDir, "SKILL.md"),
      skillDir: targetDir,
      source: "bundle_copy",
      sourceKind: source.sourceKind,
      bundle: publicSkillBundleValidation(targetValidation),
    };
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
  const registrationCredential = readWardrobeRegistrationAccessKey(input, options);
  if (!registrationCredential.ok) return registrationCredential;
  const keyHash = sha256Hex(rawKey);
  const body = {
    owner: workspaceId,
    display_name: safeDisplayName(Object.assign({}, input, { workspaceId })),
    owner_display_name: safeDisplayName(Object.assign({}, input, { workspaceId })),
    hermes_workspace_id: workspaceId,
    workspace_id: wardrobeWorkspaceIdForHermesWorkspace(workspaceId),
    access_key: rawKey,
    access_key_hash: keyHash,
    access_key_sha256: keyHash,
    access_key_hash_algorithm: "sha256",
    api_base_url: stringValue(input.apiBaseUrl) || wardrobeApiBaseUrl(input.wardrobeManifestUrl),
    replace_existing_key: true,
    store_access_key: true,
    scopes: DEFAULT_WARDROBE_SCOPES.slice(),
  };
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${registrationCredential.accessKey}`,
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
  const skillDir = stringValue(input.skillDir) || (skillPath ? path.dirname(skillPath) : "");
  const expectedWardrobeWorkspaceId = wardrobeWorkspaceIdForHermesWorkspace(workspaceId);
  const skillBundle = skillDir ? validateWardrobeSkillBundle(skillDir) : { ok: false, missing: ["wardrobe-style-operations"] };
  return {
    keyPresent: Boolean(keyPath && fs.existsSync(keyPath)),
    configPresent: Boolean(findWardrobeConfigPath(input, input)),
    configWorkspaceMatches: stringValue(config.workspace_id || config.workspaceId) === expectedWardrobeWorkspaceId,
    skillPresent: Boolean(skillPath && fs.existsSync(skillPath)),
    skillBundleComplete: Boolean(skillBundle.ok),
    skillBundle: publicSkillBundleValidation(skillBundle),
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
      wardrobeRegistrationAccessKey: options.wardrobeRegistrationAccessKey,
      wardrobeRegistrationAccessKeyPath: options.wardrobeRegistrationAccessKeyPath,
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
      ? options.gatewayWorkspaceProvisioningService.ensureWorkspaceGateway(Object.assign({
        workspaceId,
        refreshProfileBinding: true,
      }, stringValue(input.macUser || input.mac_user) ? { macUser: stringValue(input.macUser || input.mac_user) } : {}))
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
      skillDir: skill.skillDir,
    }));
    const verified = verification.keyPresent && verification.configPresent && verification.configWorkspaceMatches && verification.skillPresent && verification.skillBundleComplete;
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
      skillSourceKind: skill.sourceKind,
      skillBundle: skill.bundle,
      gatewayProfiles: Array.isArray(gateway?.profiles) ? gateway.profiles : [],
      gatewayManifestPath: stringValue(gateway?.manifestPath),
      gatewayMacUser: stringValue(gateway?.macUser || gateway?.osUser || gateway?.workerOsUsers?.[0]),
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
  DEFAULT_WARDROBE_WORKSPACE_KEY_PREFIX,
  createWardrobePluginProvisioningService,
  defaultWardrobeSkillText,
  findWardrobeAccessKeyPath,
  findWardrobeRegistrationAccessKeyPath,
  ensureWardrobeWorkspaceKey,
  findWardrobeConfigPath,
  generateWardrobeWorkspaceKey,
  installWardrobeSkill,
  readWardrobeWorkspaceConfig,
  readWardrobeRegistrationAccessKey,
  registerWardrobeWorkspace,
  sha256Hex,
  validateWardrobeSkillBundle,
  verifyLocalProvisioning,
  wardrobeApiBaseUrl,
  wardrobePhotoCacheDir,
  wardrobeRegistrationUrl,
  wardrobeWorkspaceConfigPath,
  wardrobeWorkspaceIdForHermesWorkspace,
  wardrobeWorkspaceKeyPath,
  wardrobeWorkspaceKeyPrefix,
  wardrobeWorkspaceRoot,
};
