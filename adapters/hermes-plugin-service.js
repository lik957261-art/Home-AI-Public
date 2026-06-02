"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  createHermesPluginAuthorizationService,
} = require("./hermes-plugin-authorization-service");
const {
  createFinancePluginProvisioningService,
  financeWorkspaceConfigPath,
  financeWorkspaceKeyPath,
} = require("./finance-plugin-provisioning-service");
const {
  createEmailPluginProvisioningService,
} = require("./email-plugin-provisioning-service");
const {
  createHealthPluginProvisioningService,
  healthWorkspaceConfigPath,
  healthWorkspaceKeyPath,
} = require("./health-plugin-provisioning-service");
const {
  createWardrobePluginProvisioningService,
  readWardrobeWorkspaceConfig,
} = require("./wardrobe-plugin-provisioning-service");

const DEFAULT_WARDROBE_PLUGIN_MANIFEST_URL = "http://192.168.10.99:8765/api/v1/hermes/plugin/manifest";
const DEFAULT_CODEX_MOBILE_PLUGIN_MANIFEST_URL = "http://127.0.0.1:8787/api/v1/hermes/plugin/manifest";
const DEFAULT_FINANCE_PLUGIN_MANIFEST_URL = "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest";
const DEFAULT_EMAIL_PLUGIN_MANIFEST_URL = "http://127.0.0.1:5175/api/v1/hermes/plugin/manifest";
const DEFAULT_HEALTH_PLUGIN_MANIFEST_URL = "http://127.0.0.1:4877/api/v1/hermes/plugin/manifest";
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_KEY_SEARCH_DEPTH = 6;
const PLUGIN_APPEARANCE_THEMES = new Set(["system", "dark", "light"]);
const PLUGIN_APPEARANCE_FONT_SIZES = new Set(["small", "default", "large", "xlarge", "xxlarge"]);

function stringValue(value) {
  return String(value || "").trim();
}

function configuredWardrobeManifestUrl(env = process.env) {
  return stringValue(env.HERMES_MOBILE_WARDROBE_PLUGIN_MANIFEST_URL)
    || stringValue(env.HERMES_MOBILE_PLUGIN_WARDROBE_MANIFEST_URL)
    || DEFAULT_WARDROBE_PLUGIN_MANIFEST_URL;
}

function configuredCodexMobileManifestUrl(env = process.env) {
  return stringValue(env.HERMES_MOBILE_CODEX_PLUGIN_MANIFEST_URL)
    || stringValue(env.HERMES_MOBILE_PLUGIN_CODEX_MOBILE_MANIFEST_URL)
    || DEFAULT_CODEX_MOBILE_PLUGIN_MANIFEST_URL;
}

function configuredFinanceManifestUrl(env = process.env) {
  return stringValue(env.HERMES_MOBILE_FINANCE_PLUGIN_MANIFEST_URL)
    || stringValue(env.HERMES_MOBILE_PLUGIN_FINANCE_MANIFEST_URL)
    || DEFAULT_FINANCE_PLUGIN_MANIFEST_URL;
}

function configuredEmailManifestUrl(env = process.env) {
  return stringValue(env.HERMES_MOBILE_EMAIL_PLUGIN_MANIFEST_URL)
    || stringValue(env.HERMES_MOBILE_PLUGIN_EMAIL_MANIFEST_URL)
    || DEFAULT_EMAIL_PLUGIN_MANIFEST_URL;
}

function configuredHealthManifestUrl(env = process.env) {
  return stringValue(env.HERMES_MOBILE_HEALTH_PLUGIN_MANIFEST_URL)
    || stringValue(env.HERMES_MOBILE_PLUGIN_HEALTH_MANIFEST_URL)
    || DEFAULT_HEALTH_PLUGIN_MANIFEST_URL;
}

function envKeyForPlugin(pluginId, suffix) {
  return `HERMES_MOBILE_PLUGIN_${stringValue(pluginId).toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_${suffix}`;
}

function parseWorkspaceList(value) {
  return [...new Set(String(value || "")
    .split(/[,\s;]+/)
    .map((item) => item.trim())
    .filter(Boolean))];
}

function configuredAuthorizedWorkspaceIds(pluginId, env = process.env) {
  return parseWorkspaceList(env[envKeyForPlugin(pluginId, "WORKSPACES")]);
}

const DEFAULT_PLUGIN_SECURITY = Object.freeze({
  wardrobe: {
    title: "衣橱",
    riskLevel: "workspace-private",
    defaultVisibility: "owner-only",
    allowWorkspaceGrant: true,
    provisioning: { supported: true, mode: "workspace_binding" },
    notifications: { supported: true, routeOwner: "hermes" },
  },
  "codex-mobile": {
    title: "Codex",
    riskLevel: "owner-critical",
    defaultVisibility: "owner-only",
    allowWorkspaceGrant: false,
    provisioning: { supported: false, mode: "owner_only" },
    notifications: { supported: true, routeOwner: "hermes", inboxMode: "replace_latest_per_workspace" },
  },
  finance: {
    title: "记账",
    riskLevel: "workspace-private",
    defaultVisibility: "owner-only",
    allowWorkspaceGrant: true,
    provisioning: { supported: true, mode: "workspace_binding" },
    notifications: { supported: true, routeOwner: "hermes" },
  },
  email: {
    title: "邮箱",
    riskLevel: "workspace-private",
    defaultVisibility: "owner-only",
    allowWorkspaceGrant: true,
    provisioning: { supported: true, mode: "workspace_binding" },
    notifications: { supported: true, routeOwner: "hermes" },
  },
  health: {
    title: "健康",
    riskLevel: "workspace-private",
    defaultVisibility: "owner-only",
    allowWorkspaceGrant: true,
    provisioning: { supported: true, mode: "workspace_binding" },
    notifications: { supported: true, routeOwner: "hermes" },
  },
});

function pluginSecurityDefaults(pluginId = "") {
  return DEFAULT_PLUGIN_SECURITY[stringValue(pluginId)] || {
    title: stringValue(pluginId),
    riskLevel: "workspace-private",
    defaultVisibility: "owner-only",
    allowWorkspaceGrant: true,
    provisioning: { supported: false, mode: "manual_binding" },
    notifications: { supported: false, routeOwner: "hermes" },
  };
}

function normalizePluginSecurity(plugin = {}) {
  const defaults = pluginSecurityDefaults(plugin.id);
  const provisioning = plugin.provisioning && typeof plugin.provisioning === "object" ? plugin.provisioning : {};
  const notifications = plugin.notifications && typeof plugin.notifications === "object" ? plugin.notifications : {};
  return {
    title: stringValue(plugin.title || defaults.title),
    riskLevel: stringValue(plugin.riskLevel || defaults.riskLevel),
    defaultVisibility: stringValue(plugin.defaultVisibility || defaults.defaultVisibility || "owner-only"),
    allowWorkspaceGrant: plugin.allowWorkspaceGrant === false ? false : defaults.allowWorkspaceGrant !== false,
    provisioning: Object.assign({}, defaults.provisioning, provisioning),
    notifications: Object.assign({}, defaults.notifications, notifications),
  };
}

function configuredPlugins(options = {}) {
  const env = options.env || process.env;
  const explicit = Array.isArray(options.plugins) ? options.plugins : [];
  const plugins = explicit.length ? explicit : [
    {
      id: "wardrobe",
      manifestUrl: configuredWardrobeManifestUrl(env),
    },
    {
      id: "codex-mobile",
      manifestUrl: configuredCodexMobileManifestUrl(env),
    },
    {
      id: "finance",
      manifestUrl: configuredFinanceManifestUrl(env),
    },
    {
      id: "email",
      manifestUrl: configuredEmailManifestUrl(env),
    },
    {
      id: "health",
      manifestUrl: configuredHealthManifestUrl(env),
    },
  ];
  return plugins
    .map((item) => {
      const base = {
        id: stringValue(item.id),
        manifestUrl: stringValue(item.manifestUrl || item.url),
        authorizedWorkspaceIds: parseWorkspaceList(
          Array.isArray(item.authorizedWorkspaceIds) ? item.authorizedWorkspaceIds.join(",") : item.authorizedWorkspaceIds,
        ),
      };
      return Object.assign(base, normalizePluginSecurity(Object.assign({}, item, base)));
    })
    .filter((item) => item.id && item.manifestUrl)
    .map((item) => Object.assign({}, item, {
      authorizedWorkspaceIds: item.allowWorkspaceGrant === false ? [] : [...new Set([
        ...item.authorizedWorkspaceIds,
        ...configuredAuthorizedWorkspaceIds(item.id, env),
      ])],
    }));
}

function safeUrl(value, base = "") {
  const text = stringValue(value);
  if (!text) return "";
  try {
    return new URL(text, base || undefined).toString();
  } catch (_) {
    return "";
  }
}

function originOf(value = "") {
  try {
    return new URL(value).origin;
  } catch (_) {
    return "";
  }
}

function pathValue(value = "") {
  return stringValue(value).replace(/\\/g, "/").split("/").filter(Boolean).slice(-2).join("/");
}

function safeJoinUrl(baseUrl = "", relativePath = "") {
  const base = safeUrl(baseUrl);
  const relative = stringValue(relativePath);
  if (!base || !relative) return "";
  return safeUrl(relative, base);
}

function localOrPrivateManifestSource(manifest) {
  return isLocalOrPrivateHttpUrl(manifest?.source?.manifestUrl || "");
}

function serverSidePluginUrl(manifest, value = "") {
  const target = stringValue(value);
  if (!target) return "";
  const sourceUrl = stringValue(manifest?.source?.manifestUrl);
  if (localOrPrivateManifestSource(manifest)) {
    try {
      const parsed = new URL(target, manifest?.programApi?.baseUrl || sourceUrl);
      const sourceOrigin = originOf(sourceUrl);
      if (sourceOrigin && parsed.origin !== sourceOrigin) {
        return safeJoinUrl(sourceUrl, `${parsed.pathname}${parsed.search}${parsed.hash}`);
      }
    } catch (_) {
      return safeJoinUrl(sourceUrl, target);
    }
  }
  return safeJoinUrl(manifest?.programApi?.baseUrl || sourceUrl, target);
}

function urlWithoutSearchOrHash(value = "") {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch (_) {
    return "";
  }
}

function pluginSameOriginProxyPathForUrl(pluginId = "", value = "", input = {}) {
  const id = encodeURIComponent(stringValue(pluginId));
  const url = safeUrl(value);
  if (!id || !url) return "";
  try {
    const parsed = new URL(url);
    const workspaceId = stringValue(input.workspaceId || input.workspace_id);
    if (workspaceId && !parsed.searchParams.get("workspaceId") && !parsed.searchParams.get("workspace_id")) {
      parsed.searchParams.set("workspaceId", workspaceId);
    }
    return `/api/hermes-plugins/${id}/proxy${parsed.pathname}${parsed.search}`;
  } catch (_) {
    return "";
  }
}

function normalizePluginAppearance(input = {}) {
  const source = input.appearance && typeof input.appearance === "object" ? input.appearance : input;
  const theme = stringValue(source.theme || source.appearanceTheme || source.pluginTheme).toLowerCase();
  const rawFontSize = stringValue(source.fontSize || source.font_size || source.appearanceFontSize || source.pluginFontSize).toLowerCase();
  const fontSize = rawFontSize === "standard" ? "default" : rawFontSize;
  const out = {};
  if (PLUGIN_APPEARANCE_THEMES.has(theme)) out.theme = theme;
  if (PLUGIN_APPEARANCE_FONT_SIZES.has(fontSize)) out.fontSize = fontSize;
  return out;
}

function addPluginAppearanceToEntryUrl(entryUrl = "", appearance = {}) {
  const normalized = normalizePluginAppearance(appearance);
  if (!normalized.theme && !normalized.fontSize) return entryUrl;
  try {
    const parsed = new URL(entryUrl);
    if (normalized.theme) parsed.searchParams.set("pluginTheme", normalized.theme);
    if (normalized.fontSize) parsed.searchParams.set("pluginFontSize", normalized.fontSize);
    return parsed.toString();
  } catch (_) {
    return entryUrl;
  }
}

async function reviewFinanceLedgerJoinRequest(input = {}, options = {}) {
  const fetchImpl = options.fetch || global.fetch;
  if (typeof fetchImpl !== "function") return { ok: false, status: 503, error: "fetch_unavailable" };
  const workspaceId = stringValue(input.workspaceId || "owner") || "owner";
  const requestId = stringValue(input.request_id || input.requestId || input.args?.request_id);
  const decision = stringValue(input.decision || input.args?.decision).toLowerCase();
  if (!requestId) return { ok: false, status: 400, error: "finance_ledger_join_request_id_required" };
  if (!["approve", "reject"].includes(decision)) return { ok: false, status: 400, error: "finance_ledger_join_decision_invalid" };
  const keyPath = findFinanceAccessKeyPath({ workspaceId }, options);
  if (!keyPath) return { ok: false, status: 503, error: "finance_plugin_key_missing" };
  let workspaceKey = "";
  try {
    workspaceKey = fs.readFileSync(keyPath, "utf8").trim();
  } catch (_) {
    return { ok: false, status: 503, error: "finance_plugin_key_read_failed" };
  }
  if (!workspaceKey) return { ok: false, status: 503, error: "finance_plugin_key_empty" };
  const manifestUrl = stringValue(options.financeManifestUrl) || configuredFinanceManifestUrl(options.env || process.env);
  const reviewUrl = safeJoinUrl(manifestUrl, `/api/finance/ledger-join-requests/${encodeURIComponent(requestId)}/review`);
  const body = {
    workspace_id: workspaceId,
    workspace_key: workspaceKey,
    decision,
  };
  if (decision === "approve") {
    body.role = stringValue(input.role || input.args?.role || "viewer") || "viewer";
    body.member_ids = Array.isArray(input.memberIds)
      ? input.memberIds.map(stringValue).filter(Boolean)
      : Array.isArray(input.args?.member_ids)
        ? input.args.member_ids.map(stringValue).filter(Boolean)
        : [];
  }
  const response = await fetchImpl(reviewUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch (_) {
    payload = {};
  }
  if (!response?.ok || payload?.ok === false) {
    return {
      ok: false,
      status: response?.status || 502,
      error: stringValue(payload?.error || payload?.code || "finance_ledger_join_review_failed").slice(0, 160),
    };
  }
  return {
    ok: true,
    requestId,
    decision,
    status: stringValue(payload.status || payload.request?.status || ""),
  };
}

function codexMobileProxyPathForUrl(value = "") {
  return pluginSameOriginProxyPathForUrl("codex-mobile", value);
}

function isLocalOrPrivateHttpUrl(value = "") {
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_) {
    return false;
  }
  if (parsed.protocol !== "http:") return false;
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  const private172 = host.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  return private172 ? Number(private172[1]) >= 16 && Number(private172[1]) <= 31 : false;
}

function defaultDataDir(env = process.env) {
  return stringValue(env.HERMES_WEB_DATA_DIR)
    || path.join(process.cwd(), "workspace", "hermes-web");
}

function findWardrobeAccessKeyPath(input = {}, options = {}) {
  const explicit = stringValue(input.wardrobeAccessKeyPath || options.wardrobeAccessKeyPath);
  if (explicit && fs.existsSync(explicit)) return explicit;
  const workspaceId = stringValue(input.workspaceId || "owner");
  const dataDir = stringValue(options.dataDir) || defaultDataDir(options.env);
  const workspaceRoot = path.join(dataDir, "drive", "users", workspaceId);
  const targetParts = [".hermes-wardrobe", "access-key.txt"];
  const maxDepth = Number(options.maxKeySearchDepth || DEFAULT_MAX_KEY_SEARCH_DEPTH);

  function walk(dir, depth) {
    if (depth > maxDepth) return "";
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return "";
    }
    const direct = path.join(dir, ...targetParts);
    if (fs.existsSync(direct)) return direct;
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

function findCodexMobileAccessKeyPath(input = {}, options = {}) {
  const explicit = stringValue(input.codexMobileAccessKeyPath || options.codexMobileAccessKeyPath);
  if (explicit && fs.existsSync(explicit)) return explicit;
  const env = options.env || process.env;
  const home = stringValue(env.USERPROFILE || env.HOME);
  const candidates = [
    stringValue(env.HERMES_MOBILE_CODEX_PLUGIN_ACCESS_KEY_PATH),
    stringValue(env.CODEX_MOBILE_ACCESS_KEY_PATH),
    home ? path.join(home, ".codex-mobile-web", "access_key") : "",
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function findFinanceAccessKeyPath(input = {}, options = {}) {
  const explicit = stringValue(input.financeAccessKeyPath || options.financeAccessKeyPath);
  if (explicit && fs.existsSync(explicit)) return explicit;
  const env = options.env || process.env;
  const workspaceId = stringValue(input.workspaceId || "owner");
  const candidates = [
    stringValue(env.HERMES_MOBILE_FINANCE_PLUGIN_ACCESS_KEY_PATH),
    stringValue(env.HERMES_MOBILE_PLUGIN_FINANCE_ACCESS_KEY_PATH),
    stringValue(env.FINANCE_HERMES_PLUGIN_ACCESS_KEY_PATH),
    workspaceId === "owner" ? stringValue(env.HERMES_WEB_AUTH_KEY_PATH) : "",
  ].filter(Boolean);
  const configured = candidates.find((candidate) => fs.existsSync(candidate));
  if (configured) return configured;

  const dataDir = stringValue(options.dataDir) || defaultDataDir(options.env);
  const workspaceRoot = path.join(dataDir, "drive", "users", workspaceId);
  const maxDepth = Number(options.maxKeySearchDepth || DEFAULT_MAX_KEY_SEARCH_DEPTH);
  const targetSets = [
    [".hermes-finance", "access-key.txt"],
    [".hermes-finance", "workspace-key.txt"],
  ];

  function walk(dir, depth) {
    if (depth > maxDepth) return "";
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return "";
    }
    for (const parts of targetSets) {
      const direct = path.join(dir, ...parts);
      if (fs.existsSync(direct)) return direct;
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

function findEmailAccessKeyPath(input = {}, options = {}) {
  const explicit = stringValue(input.emailAccessKeyPath || options.emailAccessKeyPath);
  if (explicit && fs.existsSync(explicit)) return explicit;
  const env = options.env || process.env;
  const workspaceId = stringValue(input.workspaceId || "owner");
  const candidates = [
    stringValue(env.HERMES_MOBILE_EMAIL_PLUGIN_ACCESS_KEY_PATH),
    stringValue(env.HERMES_MOBILE_PLUGIN_EMAIL_ACCESS_KEY_PATH),
    stringValue(env.EMAIL_HERMES_PLUGIN_ACCESS_KEY_PATH),
  ].filter(Boolean);
  const configured = candidates.find((candidate) => fs.existsSync(candidate));
  if (configured) return configured;

  const dataDir = stringValue(options.dataDir) || defaultDataDir(options.env);
  const workspaceRoot = path.join(dataDir, "drive", "users", workspaceId);
  const maxDepth = Number(options.maxKeySearchDepth || DEFAULT_MAX_KEY_SEARCH_DEPTH);
  const targetParts = [".hermes-email", "access-key.txt"];

  function walk(dir, depth) {
    if (depth > maxDepth) return "";
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return "";
    }
    const direct = path.join(dir, ...targetParts);
    if (fs.existsSync(direct)) return direct;
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

function findHealthAccessKeyPath(input = {}, options = {}) {
  const explicit = stringValue(input.healthAccessKeyPath || options.healthAccessKeyPath);
  if (explicit && fs.existsSync(explicit)) return explicit;
  const env = options.env || process.env;
  const workspaceId = stringValue(input.workspaceId || "owner");
  const candidates = [
    stringValue(env.HERMES_MOBILE_HEALTH_PLUGIN_ACCESS_KEY_PATH),
    stringValue(env.HERMES_MOBILE_PLUGIN_HEALTH_ACCESS_KEY_PATH),
    stringValue(env.HEALTH_HERMES_PLUGIN_ACCESS_KEY_PATH),
  ].filter(Boolean);
  const configured = candidates.find((candidate) => fs.existsSync(candidate));
  if (configured) return configured;
  const dataDir = stringValue(options.dataDir) || defaultDataDir(env);
  const workspaceRoot = path.join(dataDir, "drive", "users", workspaceId);
  const maxDepth = Number(options.maxKeySearchDepth || DEFAULT_MAX_KEY_SEARCH_DEPTH);
  const targetParts = [".hermes-health", "access-key.txt"];

  function walk(dir, depth) {
    if (depth > maxDepth) return "";
    const candidate = path.join(dir, ...targetParts);
    if (fs.existsSync(candidate)) return candidate;
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

function findPluginAccessKeyPath(pluginId, input = {}, options = {}) {
  if (pluginId === "codex-mobile") return findCodexMobileAccessKeyPath(input, options);
  if (pluginId === "finance") return findFinanceAccessKeyPath(input, options);
  if (pluginId === "email") return findEmailAccessKeyPath(input, options);
  if (pluginId === "health") return findHealthAccessKeyPath(input, options);
  return findWardrobeAccessKeyPath(input, options);
}

function financeWorkspaceLocalConfigReady(input = {}, options = {}) {
  const workspaceId = stringValue(input.workspaceId || "owner") || "owner";
  const dataDir = stringValue(options.dataDir) || defaultDataDir(options.env);
  const env = options.env || process.env;
  const configPath = financeWorkspaceConfigPath({ dataDir, env, workspaceId });
  const keyPath = financeWorkspaceKeyPath({ dataDir, env, workspaceId });
  if (!configPath || !keyPath) return false;
  try {
    return fs.existsSync(configPath) && fs.existsSync(keyPath);
  } catch (_) {
    return false;
  }
}

function healthWorkspaceLocalConfigReady(input = {}, options = {}) {
  const workspaceId = stringValue(input.workspaceId || "owner") || "owner";
  const dataDir = stringValue(options.dataDir) || defaultDataDir(options.env);
  const env = options.env || process.env;
  const configPath = healthWorkspaceConfigPath({ dataDir, env, workspaceId });
  const keyPath = healthWorkspaceKeyPath({ dataDir, env, workspaceId });
  if (!configPath || !keyPath) return false;
  try {
    return fs.existsSync(configPath) && fs.existsSync(keyPath);
  } catch (_) {
    return false;
  }
}

function discoverPluginWorkspaceIdsFromAccessKeys(pluginId, options = {}) {
  const id = stringValue(pluginId);
  if (id === "codex-mobile") return [];
  const dataDir = stringValue(options.dataDir) || defaultDataDir(options.env);
  const usersRoot = path.join(dataDir, "drive", "users");
  let entries = [];
  try {
    entries = fs.readdirSync(usersRoot, { withFileTypes: true });
  } catch (_) {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((workspaceId) => workspaceId)
    .filter((workspaceId) => {
      if (id === "finance") return financeWorkspaceLocalConfigReady({ workspaceId }, options);
      if (id === "health") return healthWorkspaceLocalConfigReady({ workspaceId }, options);
      return Boolean(findPluginAccessKeyPath(id, { workspaceId }, options));
    });
}

function pluginWorkspaceAuthorized(plugin, input = {}, options = {}) {
  const workspaceId = stringValue(input.workspaceId || "owner");
  if (!workspaceId) return false;
  const pluginId = stringValue(plugin?.id || input.id);
  if (pluginId === "health") {
    return healthWorkspaceLocalConfigReady({ workspaceId }, options);
  }
  if (workspaceId === "owner") return true;
  if (plugin?.allowWorkspaceGrant === false) return false;
  const authorized = Array.isArray(plugin?.authorizedWorkspaceIds) ? plugin.authorizedWorkspaceIds : [];
  if (authorized.includes("*") || authorized.includes(workspaceId)) return true;
  if (typeof options.authorizationService?.isWorkspaceAuthorized === "function"
    && options.authorizationService.isWorkspaceAuthorized(pluginId, workspaceId)) {
    return true;
  }
  if (pluginId !== "codex-mobile") {
    return Boolean(findPluginAccessKeyPath(pluginId, { workspaceId }, options));
  }
  return false;
}

function pluginWorkspaceProvisioningBlock(plugin, input = {}, options = {}) {
  const workspaceId = stringValue(input.workspaceId || "owner");
  if (!workspaceId || workspaceId === "owner") return null;
  const pluginId = stringValue(plugin?.id || input.id);
  if (!pluginId || !pluginSupportsHermesProvisioning(plugin)) return null;
  const record = typeof options.authorizationService?.recordForWorkspace === "function"
    ? options.authorizationService.recordForWorkspace(pluginId, workspaceId)
    : null;
  if (!record || record.status !== "authorized") return null;
  const status = stringValue(record.provisioningStatus || "not_started");
  if (!["pending", "provisioning_failed"].includes(status)) return null;
  const failed = status === "provisioning_failed";
  return {
    ok: false,
    available: false,
    id: pluginId,
    code: failed ? "plugin_workspace_provisioning_failed" : "plugin_workspace_provisioning_pending",
    warning: failed
      ? "Plugin workspace provisioning failed. Owner must retry or repair the plugin binding."
      : "Plugin workspace provisioning has not completed yet.",
    provisioningStatus: status,
    provisioningError: stringValue(record.provisioningError).slice(0, 160),
    embed: {
      mode: "same_window_iframe",
      tokenStatus: failed ? "workspace_provisioning_failed" : "workspace_provisioning_pending",
    },
  };
}

function pluginSupportsHermesProvisioning(plugin) {
  return ["finance", "wardrobe", "email", "health"].includes(stringValue(plugin?.id)) && plugin?.provisioning?.supported === true;
}

function pluginInitialProvisioningStatus(plugin) {
  if (pluginSupportsHermesProvisioning(plugin)) return "pending";
  if (plugin?.provisioning?.supported === true) return "manual_required";
  return "not_supported";
}

function pluginProjectedProvisioningStatus(plugin, status = "") {
  const value = stringValue(status || "not_started");
  if (!pluginSupportsHermesProvisioning(plugin) && value === "pending") return "manual_required";
  return value;
}

function frameAncestorsAllows(csp = "", appOrigin = "", entryOrigin = "") {
  const origin = stringValue(appOrigin);
  if (!origin) return true;
  const directive = stringValue(csp)
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith("frame-ancestors "));
  if (!directive) return true;
  const sources = directive.split(/\s+/).slice(1).map((part) => part.trim()).filter(Boolean);
  if (!sources.length) return true;
  if (sources.includes("*")) return true;
  if (sources.includes("'none'")) return false;
  const normalizedEntryOrigin = originOf(entryOrigin);
  return sources.some((source) => {
    if (source === "'self'") return normalizedEntryOrigin && normalizedEntryOrigin === origin;
    if (source.endsWith(":")) return origin.startsWith(source);
    if (source.includes("*")) {
      const escaped = source.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*");
      return new RegExp(`^${escaped}$`).test(origin);
    }
    return source === origin;
  });
}

function normalizeManifest(raw = {}, source = {}) {
  const manifestUrl = stringValue(source.manifestUrl);
  const id = stringValue(raw.id || source.id);
  const rawEntry = typeof raw.entry === "string" ? raw.entry : raw.entry?.url;
  const candidateEntryUrl = safeUrl(rawEntry || raw.entryUrl || raw.url, manifestUrl);
  const entryUrl = (() => {
    if (!candidateEntryUrl || !isLocalOrPrivateHttpUrl(manifestUrl)) return candidateEntryUrl;
    const sourceOrigin = originOf(manifestUrl);
    if (!sourceOrigin || originOf(candidateEntryUrl) === sourceOrigin) return candidateEntryUrl;
    try {
      const parsed = new URL(candidateEntryUrl);
      return safeJoinUrl(manifestUrl, `${parsed.pathname}${parsed.search}${parsed.hash}`);
    } catch (_) {
      return candidateEntryUrl;
    }
  })();
  if (!id) throw new Error("plugin_manifest_id_required");
  if (!entryUrl) throw new Error("plugin_manifest_entry_url_required");
  const rawLaunch = typeof raw.launch === "string" ? raw.launch : (raw.launch?.url || raw.launch?.endpoint);
  const rawProgramLaunch = raw.program_api?.plugin_launch || raw.programApi?.pluginLaunch || "";
  const launchUrl = safeUrl(rawLaunch || "", manifestUrl);
  const programBaseUrl = safeUrl(raw.program_api?.base_url || raw.programApi?.baseUrl || (launchUrl ? originOf(launchUrl) : ""), manifestUrl);
  const topLevelToolsets = Array.isArray(raw.toolsets) ? raw.toolsets.map(stringValue).filter(Boolean) : [];
  const topLevelPermissions = Array.isArray(raw.permissions) ? raw.permissions.map(stringValue).filter(Boolean) : [];
  const embedding = raw.embedding && typeof raw.embedding === "object"
    ? raw.embedding
    : raw.navigation && typeof raw.navigation === "object"
      ? raw.navigation
      : {};
  const rawAppearanceSync = raw.appearance_sync || raw.appearanceSync;
  const appearanceSync = rawAppearanceSync === true
    || (rawAppearanceSync && typeof rawAppearanceSync === "object" && rawAppearanceSync.supported !== false);
  const rawKind = stringValue(raw.kind || raw.type || "embedded_app");
  const kind = rawKind === "embedded-app" ? "embedded_app" : rawKind;
  return {
    ok: true,
    available: true,
    id,
    title: stringValue(raw.title) || id,
    description: stringValue(raw.description),
    kind,
    version: stringValue(raw.version),
    source: {
      manifestUrl,
      origin: originOf(manifestUrl),
      fetchedAt: stringValue(source.fetchedAt),
    },
    entry: {
      type: stringValue((typeof raw.entry === "object" && raw.entry?.type) || "web"),
      url: entryUrl,
      origin: originOf(entryUrl),
      framePolicy: stringValue(typeof raw.entry === "object" ? (raw.entry?.frame_policy || raw.entry?.framePolicy) : ""),
    },
    embed: {
      mode: "same_window_iframe",
      url: entryUrl,
      requiresSignedToken: true,
      tokenStatus: "pending_plugin_registration",
    },
    mcp: {
      server: stringValue(raw.mcp?.server || raw.mcpServer),
      toolset: stringValue(raw.mcp?.toolset || topLevelToolsets[0]),
      version: stringValue(raw.mcp?.version),
      requiredTools: Array.isArray(raw.mcp?.required_tools) ? raw.mcp.required_tools.map(stringValue).filter(Boolean) : [],
      toolsets: topLevelToolsets,
    },
    programApi: {
      baseUrl: programBaseUrl,
      origin: originOf(programBaseUrl),
      pluginManifestPath: stringValue(raw.program_api?.plugin_manifest),
      workspaceRegistrationPath: stringValue(raw.program_api?.workspace_registration || raw.programApi?.workspaceRegistration || raw.provisioning?.endpoint || raw.provisioning?.workspace_registration),
      pluginLaunchPath: launchUrl || stringValue(rawProgramLaunch),
      syncSchemaVersion: raw.program_api?.sync_schema_version || raw.programApi?.syncSchemaVersion || null,
    },
    embedding: {
      stateEvent: stringValue(embedding.state_event || embedding.stateEvent),
      backEvent: stringValue(embedding.back_event || embedding.backEvent),
      backResultEvent: stringValue(embedding.back_result_event || embedding.backResultEvent),
      refreshRequiredEvent: stringValue(embedding.refresh_required_event || embedding.refreshRequiredEvent),
      preserveIframeState: embedding.preserve_iframe_state === true || embedding.preserveIframeState === true,
      appearanceSync,
    },
    ownerBinding: {
      strategy: stringValue(raw.owner_binding?.strategy),
      configFile: pathValue(raw.owner_binding?.config_file),
      cacheDir: pathValue(raw.owner_binding?.cache_dir),
      rawKeyReturned: raw.owner_binding?.raw_key_returned_by_wardrobe === true
        || raw.owner_binding?.raw_key_returned_by_codex_mobile === true
        || raw.owner_binding?.raw_key_returned === true,
    },
    permissions: {
      plugin: topLevelPermissions,
      registerWorkspaceRequires: Array.isArray(raw.permissions?.register_workspace_requires)
        ? raw.permissions.register_workspace_requires.map(stringValue).filter(Boolean)
        : [],
      ownerTokenScopes: Array.isArray(raw.permissions?.owner_token_scopes)
        ? raw.permissions.owner_token_scopes.map(stringValue).filter(Boolean)
        : [],
    },
  };
}

async function withPluginLaunchEntry(manifest, input = {}, fetchImpl, options = {}) {
  if (input.launchPlugin !== true) return manifest;
  if (!manifest?.available || !manifest?.programApi?.pluginLaunchPath || typeof fetchImpl !== "function") return manifest;
  const workspaceId = stringValue(input.workspaceId || "owner");
  const pluginId = stringValue(manifest.id || input.id || "wardrobe");
  const keyPath = findPluginAccessKeyPath(pluginId, input, options);
  if (!keyPath) {
    return Object.assign({}, manifest, {
      available: false,
      code: "plugin_launch_key_missing",
      warning: "Plugin workspace access key file was not found for this workspace.",
      embed: Object.assign({}, manifest.embed, {
        tokenStatus: "workspace_key_missing",
      }),
    });
  }
  let accessKey = "";
  try {
    accessKey = fs.readFileSync(keyPath, "utf8").trim();
  } catch (err) {
    return Object.assign({}, manifest, {
      available: false,
      code: "plugin_launch_key_read_failed",
      warning: stringValue(err?.message || err).slice(0, 300),
      embed: Object.assign({}, manifest.embed, {
        tokenStatus: "workspace_key_read_failed",
      }),
    });
  }
  const launchUrl = serverSidePluginUrl(manifest, manifest.programApi.pluginLaunchPath);
  if (!launchUrl || !accessKey) return manifest;
  const financeUserKey = stringValue(
    input.workspaceUserKey
    || input.workspace_user_key
    || input.hermesWorkspaceUserKey
    || input.hermes_workspace_user_key
    || input.userKey
    || input.user_key,
  );
  const appearance = normalizePluginAppearance(input);
  const appearancePayload = Object.keys(appearance).length ? { appearance } : {};
  const wardrobeConfig = pluginId === "wardrobe"
    ? readWardrobeWorkspaceConfig({ workspaceId }, options)
    : {};
  const wardrobeWorkspaceId = stringValue(wardrobeConfig.workspace_id || wardrobeConfig.workspaceId) || workspaceId;
  const launchBody = pluginId === "finance"
    ? Object.assign({
      workspace_id: workspaceId,
      workspace_key: accessKey,
      role: workspaceId === "owner" || input.ownerAuthorized === true ? "owner" : "member",
    }, financeUserKey ? { user_key: financeUserKey } : {}, appearancePayload)
    : pluginId === "health"
      ? Object.assign({
        workspace_id: workspaceId,
        target_workspace_id: workspaceId,
        hermes_workspace_id: workspaceId,
      }, appearancePayload)
    : pluginId === "wardrobe"
      ? Object.assign({
        workspace_id: wardrobeWorkspaceId,
        hermes_workspace_id: workspaceId,
      }, appearancePayload)
    : Object.assign({ workspace_id: workspaceId }, appearancePayload);
  try {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (pluginId !== "finance") headers.Authorization = `Bearer ${accessKey}`;
    const response = await fetchImpl(launchUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(launchBody),
    });
    if (!response?.ok) {
      let launchError = "";
      try {
        const errorText = await response.text();
        const parsed = JSON.parse(errorText);
        launchError = stringValue(parsed?.error || parsed?.code || "").slice(0, 160);
      } catch (_) {
        launchError = "";
      }
      return Object.assign({}, manifest, {
        available: false,
        code: "plugin_launch_failed",
        status: response?.status || 0,
        warning: launchError ? `Plugin launch token request failed: ${launchError}` : "Plugin launch token request failed.",
        embed: Object.assign({}, manifest.embed, {
          tokenStatus: "launch_failed",
        }),
      });
    }
    const launch = await response.json();
    const entryUrl = addPluginAppearanceToEntryUrl(
      serverSidePluginUrl(manifest, launch?.entry_path),
      appearance,
    );
    if (!entryUrl) {
      return Object.assign({}, manifest, {
        available: false,
        code: "plugin_launch_entry_missing",
        warning: "Plugin launch response did not include a valid entry path.",
        embed: Object.assign({}, manifest.embed, {
          tokenStatus: "launch_entry_missing",
        }),
      });
    }
    return Object.assign({}, manifest, {
      entry: Object.assign({}, manifest.entry, {
        url: entryUrl,
        origin: originOf(entryUrl),
      }),
      embed: Object.assign({}, manifest.embed, {
        url: entryUrl,
        tokenStatus: "launch_token_issued",
        expiresIn: Number(launch?.expires_in || launch?.expires_in_seconds || 0) || null,
        appearance: Object.keys(appearance).length ? appearance : undefined,
      }),
      appearance: Object.keys(appearance).length ? appearance : undefined,
    });
  } catch (err) {
    return Object.assign({}, manifest, {
      available: false,
      code: "plugin_launch_error",
      warning: stringValue(err?.message || err).slice(0, 300),
      embed: Object.assign({}, manifest.embed, {
        tokenStatus: "launch_error",
      }),
    });
  }
}

async function validateFrameAncestors(manifest, input = {}, fetchImpl) {
  const appOrigin = originOf(input.appOrigin || "");
  if (!appOrigin || !manifest?.entry?.url || typeof fetchImpl !== "function") return manifest;
  try {
    const response = await fetchImpl(manifest.entry.url, {
      method: "GET",
      headers: { Accept: "text/html,*/*" },
    });
    const csp = response?.headers?.get?.("content-security-policy")
      || response?.headers?.get?.("Content-Security-Policy")
      || "";
    if (frameAncestorsAllows(csp, appOrigin, manifest.entry.origin)) return manifest;
    return Object.assign({}, manifest, {
      available: false,
      code: "plugin_frame_ancestors_blocked",
      warning: "plugin entry frame-ancestors does not allow the current Hermes origin",
      embed: Object.assign({}, manifest.embed, {
        blockedByFrameAncestors: true,
        appOrigin,
      }),
    });
  } catch (err) {
    return Object.assign({}, manifest, {
      available: false,
      code: "plugin_entry_frame_probe_failed",
      warning: stringValue(err?.message || err).slice(0, 300),
      embed: Object.assign({}, manifest.embed, {
        frameProbeFailed: true,
        appOrigin,
      }),
    });
  }
}

function validateHttpsEntryScheme(manifest, input = {}) {
  const appUrl = safeUrl(input.appOrigin || "");
  const entryUrl = safeUrl(manifest?.entry?.url || "");
  if (!entryUrl) return manifest;
  let appProtocol = "";
  let entryProtocol = "";
  try {
    appProtocol = appUrl ? new URL(appUrl).protocol : "";
    entryProtocol = new URL(entryUrl).protocol;
  } catch (_) {
    return manifest;
  }
  if (isLocalOrPrivateHttpUrl(entryUrl)) {
    const proxyUrl = pluginSameOriginProxyPathForUrl(manifest?.id, entryUrl, {
      workspaceId: input.workspaceId,
    });
    if (proxyUrl) {
      return Object.assign({}, manifest, {
        entry: Object.assign({}, manifest.entry, {
          url: proxyUrl,
          origin: originOf(appUrl),
          proxiedFromOrigin: originOf(entryUrl),
        }),
        embed: Object.assign({}, manifest.embed, {
          url: proxyUrl,
          sameOriginProxy: true,
          upstreamOrigin: originOf(entryUrl),
        }),
      });
    }
  }
  if (appProtocol !== "https:" || entryProtocol !== "http:") return manifest;
  const redactedEntryUrl = urlWithoutSearchOrHash(entryUrl) || manifest.entry.url;
  return Object.assign({}, manifest, {
    available: false,
    code: "plugin_https_entry_required",
    warning: "HTTPS Hermes origin requires an HTTPS plugin iframe entry.",
    entry: Object.assign({}, manifest.entry, {
      url: redactedEntryUrl,
      origin: originOf(entryUrl),
    }),
    embed: Object.assign({}, manifest.embed, {
      url: "",
      blockedByMixedContent: true,
      appOrigin: originOf(appUrl),
      requiredEntryScheme: "https",
    }),
  });
}

function createHermesPluginService(options = {}) {
  const fetchImpl = options.fetch || global.fetch;
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const authorizationService = options.authorizationService || createHermesPluginAuthorizationService({
    dataDir: options.dataDir,
    env: options.env,
    nowIso,
    storePath: options.pluginAuthorizationStorePath,
  });
  const financeProvisioningService = options.financeProvisioningService || createFinancePluginProvisioningService({
    dataDir: options.dataDir,
    env: options.env,
    fetch: fetchImpl,
  });
  const emailProvisioningService = options.emailProvisioningService || createEmailPluginProvisioningService({
    dataDir: options.dataDir,
    env: options.env,
    fetch: fetchImpl,
    emailOwnerKey: options.emailOwnerKey,
    emailOwnerKeyPath: options.emailOwnerKeyPath,
  });
  const healthProvisioningService = options.healthProvisioningService || createHealthPluginProvisioningService({
    dataDir: options.dataDir,
    env: options.env,
    fetch: fetchImpl,
    healthOwnerKey: options.healthOwnerKey,
    healthOwnerKeyPath: options.healthOwnerKeyPath,
  });
  const wardrobeProvisioningService = options.wardrobeProvisioningService || createWardrobePluginProvisioningService({
    dataDir: options.dataDir,
    env: options.env,
    fetch: fetchImpl,
    gatewayWorkspaceProvisioningService: options.gatewayWorkspaceProvisioningService,
    nowIso,
    repoRoot: options.repoRoot,
    wardrobeSkillTemplatePath: options.wardrobeSkillTemplatePath,
    wardrobeRegistrationAccessKey: options.wardrobeRegistrationAccessKey,
    wardrobeRegistrationAccessKeyPath: options.wardrobeRegistrationAccessKeyPath,
  });
  const workspaceLabelForId = typeof options.workspaceLabelForId === "function"
    ? options.workspaceLabelForId
    : () => "";
  const plugins = configuredPlugins(options);
  const launchOptions = {
    dataDir: options.dataDir,
    env: options.env,
    maxKeySearchDepth: options.maxKeySearchDepth,
    wardrobeAccessKeyPath: options.wardrobeAccessKeyPath,
    codexMobileAccessKeyPath: options.codexMobileAccessKeyPath,
    financeAccessKeyPath: options.financeAccessKeyPath,
    emailAccessKeyPath: options.emailAccessKeyPath,
    healthAccessKeyPath: options.healthAccessKeyPath,
    authorizationService,
    fetch: fetchImpl,
  };

  function pluginPublicMetadata(item) {
    return {
      id: item.id,
      title: item.title,
      manifestUrl: item.manifestUrl,
      riskLevel: item.riskLevel,
      defaultVisibility: item.defaultVisibility,
      allowWorkspaceGrant: item.allowWorkspaceGrant !== false,
      provisioning: item.provisioning || {},
      notifications: item.notifications || {},
    };
  }

  async function provisionPluginWorkspace(plugin, input = {}) {
    const id = stringValue(plugin?.id || input.id || input.pluginId);
    const workspaceId = stringValue(input.workspaceId);
    const displayName = stringValue(input.displayName || input.workspaceLabel || input.workspace_label)
      || stringValue(workspaceLabelForId(workspaceId))
      || workspaceId;
    if (id === "wardrobe") {
      return wardrobeProvisioningService.provisionWorkspace({
        workspaceId,
        displayName,
        wardrobeManifestUrl: plugin.manifestUrl,
      });
    }
    if (id === "email") {
      return emailProvisioningService.provisionWorkspace({
        workspaceId,
        workspaceName: displayName,
        displayName,
        emailManifestUrl: plugin.manifestUrl,
      });
    }
    if (id === "health") {
      return healthProvisioningService.provisionWorkspace({
        workspaceId,
        displayName,
        healthManifestUrl: plugin.manifestUrl,
      });
    }
    return financeProvisioningService.provisionWorkspace({
      workspaceId,
      displayName,
      role: "owner",
      adminWorkspaceId: "owner",
      financeManifestUrl: plugin.manifestUrl,
    });
  }

  async function ensureOwnerWorkspaceProvisioning(input = {}) {
    const id = stringValue(input.id || input.pluginId);
    const plugin = plugins.find((item) => item.id === id);
    if (!plugin) return { ok: false, status: 404, error: "plugin_not_registered" };
    const workspaceId = stringValue(input.workspaceId || "owner") || "owner";
    if (workspaceId !== "owner") return { ok: false, status: 400, error: "owner_workspace_required" };
    if (!pluginSupportsHermesProvisioning(plugin)) {
      return { ok: true, provisioning: { status: "not_required" } };
    }
    if (id === "finance" && financeWorkspaceLocalConfigReady({ workspaceId }, launchOptions)) {
      return { ok: true, provisioning: { status: "active", existing: true } };
    }
    if (id === "health" && healthWorkspaceLocalConfigReady({ workspaceId }, launchOptions)) {
      return { ok: true, provisioning: { status: "active", existing: true } };
    }
    const provisioned = await provisionPluginWorkspace(plugin, Object.assign({}, input, {
      workspaceId,
      displayName: stringValue(input.displayName || input.workspaceLabel || input.workspace_label) || "Owner",
    }));
    if (!provisioned.ok) {
      return {
        ok: false,
        status: provisioned.status || 503,
        error: provisioned.error || `${id}_owner_provisioning_failed`,
        provisioning: {
          status: "provisioning_failed",
          keyCreated: Boolean(provisioned.keyCreated),
        },
      };
    }
    return {
      ok: true,
      provisioning: {
        status: "active",
        keyCreated: Boolean(provisioned.keyCreated),
        configCreated: Boolean(provisioned.configPath || provisioned.configCreated),
        created: Boolean(provisioned.created),
      },
    };
  }

  function list(input = {}) {
    return plugins
      .filter((item) => pluginWorkspaceAuthorized(item, input, launchOptions))
      .filter((item) => !pluginWorkspaceProvisioningBlock(item, Object.assign({}, input, { id: item.id }), launchOptions))
      .map(pluginPublicMetadata);
  }

  function listInstalled() {
    return plugins.map((item) => {
      const records = typeof authorizationService.recordsForPlugin === "function"
        ? authorizationService.recordsForPlugin(item.id)
        : [];
      const discovered = discoverPluginWorkspaceIdsFromAccessKeys(item.id, launchOptions);
      const explicitIds = typeof authorizationService.authorizedWorkspaceIds === "function"
        ? authorizationService.authorizedWorkspaceIds(item.id)
        : [];
      const authorizedWorkspaceIds = item.allowWorkspaceGrant === false
        ? []
        : [...new Set([
          ...item.authorizedWorkspaceIds,
          ...explicitIds,
          ...discovered,
        ])];
      const explicitRecordIds = new Set(records.map((record) => record.workspaceId));
      const workspaceAuthorizations = [
        ...records.map((record) => ({
          workspaceId: record.workspaceId,
          status: record.status,
          provisioningStatus: pluginProjectedProvisioningStatus(item, record.provisioningStatus),
          provisioningError: record.provisioningError || "",
          provisioningUpdatedAt: record.provisioningUpdatedAt || "",
          source: "authorization_store",
        })),
        ...discovered
          .filter((workspaceId) => !explicitRecordIds.has(workspaceId))
          .map((workspaceId) => ({
            workspaceId,
            status: "authorized",
            provisioningStatus: "active",
            provisioningError: "",
            provisioningUpdatedAt: "",
            source: "workspace_key",
          })),
      ];
      return Object.assign(pluginPublicMetadata(item), {
        authorizedWorkspaceIds,
        workspaceAuthorizations,
      });
    });
  }

  function pluginManifestUrl(id = "") {
    const plugin = plugins.find((item) => item.id === stringValue(id));
    return plugin?.manifestUrl || "";
  }

  async function manifest(input = {}) {
    const id = stringValue(input.id || "wardrobe");
    const plugin = plugins.find((item) => item.id === id);
    if (!plugin) {
      return { ok: false, available: false, id, code: "plugin_not_registered" };
    }
    if (id === "finance"
      && stringValue(input.workspaceId || "owner") === "owner"
      && !stringValue(options.financeAccessKeyPath)) {
      const ownerProvisioning = await ensureOwnerWorkspaceProvisioning(Object.assign({}, input, { id }));
      if (!ownerProvisioning.ok) {
        return {
          ok: false,
          available: false,
          id,
          code: "plugin_owner_provisioning_failed",
          warning: stringValue(ownerProvisioning.error).slice(0, 160),
          provisioningStatus: "provisioning_failed",
          embed: {
            mode: "same_window_iframe",
            tokenStatus: "owner_workspace_provisioning_failed",
          },
        };
      }
    }
    const provisioningBlock = pluginWorkspaceProvisioningBlock(plugin, Object.assign({}, input, { id }), launchOptions);
    if (provisioningBlock) return provisioningBlock;
    if (!pluginWorkspaceAuthorized(plugin, Object.assign({}, input, { id }), launchOptions)) {
      return {
        ok: false,
        available: false,
        id,
        code: "plugin_workspace_not_authorized",
        warning: "Plugin is installed but this workspace has not been authorized by Owner.",
        embed: {
          mode: "same_window_iframe",
          tokenStatus: "workspace_not_authorized",
        },
      };
    }
    if (typeof fetchImpl !== "function") {
      return { ok: false, available: false, id, code: "fetch_unavailable" };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(plugin.manifestUrl, {
        method: "GET",
        headers: Object.assign(
          { Accept: "application/json" },
          originOf(input.appOrigin || "") ? {
            "x-hermes-public-origin": originOf(input.appOrigin || ""),
            "x-forwarded-origin": originOf(input.appOrigin || ""),
          } : {},
        ),
        signal: controller.signal,
      });
      if (!response || !response.ok) {
        return {
          ok: false,
          available: false,
          id,
          code: "plugin_manifest_fetch_failed",
          status: response?.status || 0,
        };
      }
      const raw = await response.json();
      const manifest = normalizeManifest(raw, {
        id,
        manifestUrl: plugin.manifestUrl,
        fetchedAt: nowIso(),
      });
      const launchedManifest = await withPluginLaunchEntry(manifest, input, fetchImpl, launchOptions);
      const entrySchemeManifest = validateHttpsEntryScheme(launchedManifest, input);
      if (entrySchemeManifest?.embed?.sameOriginProxy) return entrySchemeManifest;
      return validateFrameAncestors(entrySchemeManifest, input, fetchImpl);
    } catch (err) {
      return {
        ok: false,
        available: false,
        id,
        code: err?.name === "AbortError" ? "plugin_manifest_timeout" : "plugin_manifest_error",
        warning: stringValue(err?.message || err).slice(0, 300),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function grantWorkspace(input = {}) {
    const id = stringValue(input.id || input.pluginId);
    const plugin = plugins.find((item) => item.id === id);
    if (!plugin) return { ok: false, status: 404, error: "plugin_not_registered" };
    if (plugin.allowWorkspaceGrant === false) {
      return { ok: false, status: 403, error: "plugin_workspace_grant_not_allowed" };
    }
    const workspaceId = stringValue(input.workspaceId || "owner") || "owner";
    const base = authorizationService.grantWorkspace({
      pluginId: id,
      workspaceId,
      actor: input.actor,
      provisioningStatus: pluginInitialProvisioningStatus(plugin),
      provisioningError: "",
    });
    if (!base.ok || !pluginSupportsHermesProvisioning(plugin)) return base;
    const provisioned = await provisionPluginWorkspace(plugin, input);
    if (provisioned.ok) {
      const saved = authorizationService.updateProvisioningStatus({
        pluginId: id,
        workspaceId,
        actor: input.actor,
        provisioningStatus: "active",
        provisioningError: "",
      });
      if (id === "wardrobe") {
        return Object.assign({}, saved, {
          provisioning: {
            status: "active",
            keyCreated: Boolean(provisioned.keyCreated),
            wardrobeWorkspaceId: provisioned.wardrobeWorkspaceId || "",
            skillInstalled: Boolean(provisioned.skillInstalled),
            gatewayProfiles: Array.isArray(provisioned.gatewayProfiles) ? provisioned.gatewayProfiles : [],
            gatewayRestartRequired: Boolean(provisioned.gatewayRestartRequired),
            gatewayProfileBindingRefreshed: Boolean(provisioned.gatewayProfileBindingRefreshed),
            created: Boolean(provisioned.created),
          },
        });
      }
      if (id === "email") {
        return Object.assign({}, saved, {
          provisioning: {
            status: "active",
            keyCreated: Boolean(provisioned.keyCreated),
            configCreated: Boolean(provisioned.configCreated),
            created: Boolean(provisioned.created),
          },
        });
      }
      if (id === "health") {
        return Object.assign({}, saved, {
          provisioning: {
            status: "active",
            keyCreated: Boolean(provisioned.keyCreated),
            configCreated: Boolean(provisioned.configCreated),
            healthWorkspaceId: provisioned.healthWorkspaceId || "",
          },
        });
      }
      return Object.assign({}, saved, {
        provisioning: {
          status: "active",
          keyCreated: Boolean(provisioned.keyCreated),
          financeUserId: provisioned.financeUserId || "",
          ledgerId: provisioned.ledgerId || "",
          created: Boolean(provisioned.created),
        },
      });
    }
    const saved = authorizationService.updateProvisioningStatus({
      pluginId: id,
      workspaceId,
      actor: input.actor,
      provisioningStatus: "provisioning_failed",
      provisioningError: provisioned.error || `${id}_plugin_provisioning_failed`,
    });
    return Object.assign({}, saved, {
      provisioning: {
        status: "provisioning_failed",
        error: provisioned.error || `${id}_plugin_provisioning_failed`,
        keyCreated: Boolean(provisioned.keyCreated),
      },
    });
  }

  function revokeWorkspace(input = {}) {
    const id = stringValue(input.id || input.pluginId);
    const plugin = plugins.find((item) => item.id === id);
    if (!plugin) return { ok: false, status: 404, error: "plugin_not_registered" };
    if (plugin.allowWorkspaceGrant === false) {
      return { ok: false, status: 403, error: "plugin_workspace_grant_not_allowed" };
    }
    return authorizationService.revokeWorkspace({
      pluginId: id,
      workspaceId: input.workspaceId,
    });
  }

  function reviewFinanceLedgerJoin(input = {}) {
    return reviewFinanceLedgerJoinRequest(input, Object.assign({}, launchOptions, {
      financeManifestUrl: pluginManifestUrl("finance"),
    }));
  }

  return {
    list,
    listInstalled,
    manifest,
    pluginManifestUrl,
    ensureOwnerWorkspaceProvisioning,
    grantWorkspace,
    revokeWorkspace,
    reviewFinanceLedgerJoin,
  };
}

module.exports = {
  DEFAULT_CODEX_MOBILE_PLUGIN_MANIFEST_URL,
  DEFAULT_EMAIL_PLUGIN_MANIFEST_URL,
  DEFAULT_FINANCE_PLUGIN_MANIFEST_URL,
  DEFAULT_HEALTH_PLUGIN_MANIFEST_URL,
  DEFAULT_WARDROBE_PLUGIN_MANIFEST_URL,
  configuredPlugins,
  createHermesPluginService,
  findCodexMobileAccessKeyPath,
  findEmailAccessKeyPath,
  findFinanceAccessKeyPath,
  findHealthAccessKeyPath,
  findPluginAccessKeyPath,
  discoverPluginWorkspaceIdsFromAccessKeys,
  findWardrobeAccessKeyPath,
  frameAncestorsAllows,
  normalizePluginAppearance,
  reviewFinanceLedgerJoinRequest,
  normalizeManifest,
  pluginWorkspaceAuthorized,
  codexMobileProxyPathForUrl,
  pluginSameOriginProxyPathForUrl,
  isLocalOrPrivateHttpUrl,
};
