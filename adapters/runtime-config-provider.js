"use strict";

const fs = require("node:fs");
const path = require("node:path");

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

const RUNTIME_MODEL_OPTIONS = Object.freeze([
  Object.freeze({
    id: "openai-codex:gpt-5.4",
    label: "ChatGPT 5.4",
    familyId: "openai-codex",
    familyLabel: "ChatGPT",
    variantLabel: "5.4",
    provider: "openai-codex",
    model: "gpt-5.4",
    defaultReasoningEffort: "medium",
  }),
  Object.freeze({
    id: "openai-codex:gpt-5.5",
    label: "ChatGPT 5.5",
    familyId: "openai-codex",
    familyLabel: "ChatGPT",
    variantLabel: "5.5",
    provider: "openai-codex",
    model: "gpt-5.5",
    defaultReasoningEffort: "medium",
  }),
  Object.freeze({
    id: "deepseek:deepseek-chat",
    label: "DeepSeek Chat",
    familyId: "deepseek",
    familyLabel: "DeepSeek",
    variantLabel: "Chat",
    provider: "deepseek",
    model: "deepseek-chat",
    defaultReasoningEffort: "medium",
  }),
  Object.freeze({
    id: "xai-oauth:grok-4.3",
    label: "Grok 4.3",
    familyId: "xai-oauth",
    familyLabel: "Grok",
    variantLabel: "4.3",
    provider: "xai-oauth",
    model: "grok-4.3",
    defaultReasoningEffort: "medium",
  }),
]);

const DEFAULT_RUNTIME_MODEL_OPTION = RUNTIME_MODEL_OPTIONS.find((item) => item.id === "openai-codex:gpt-5.5") || RUNTIME_MODEL_OPTIONS[0];
const VALID_REASONING_EFFORTS = new Set(["low", "medium", "high", "xhigh"]);

function runtimeModelOptionId(provider, model) {
  const cleanProvider = String(provider || "").trim();
  const cleanModel = String(model || "").trim();
  return cleanProvider && cleanModel ? `${cleanProvider}:${cleanModel}` : "";
}

function runtimeModelOptions() {
  return RUNTIME_MODEL_OPTIONS.map((item) => Object.assign({}, item));
}

function runtimeModelFamilies() {
  const seen = new Set();
  const families = [];
  for (const item of RUNTIME_MODEL_OPTIONS) {
    const familyId = String(item.familyId || item.provider || "").trim();
    if (!familyId || seen.has(familyId)) continue;
    seen.add(familyId);
    families.push({
      id: familyId,
      label: item.familyLabel || item.provider || familyId,
      defaultModelId: item.id,
      provider: item.provider,
    });
  }
  return families;
}

function normalizeRuntimeModelSelection(source = {}) {
  const explicitId = String(source.defaultModelId || source.default_model_id || "").trim();
  const explicitProvider = String(source.defaultModelProvider || source.default_model_provider || source.modelProvider || "").trim();
  const explicitModel = String(source.defaultModel || source.default_model || "").trim();
  const id = explicitId || runtimeModelOptionId(explicitProvider, explicitModel);
  const selected = RUNTIME_MODEL_OPTIONS.find((item) => item.id === id)
    || RUNTIME_MODEL_OPTIONS.find((item) => item.provider === explicitProvider && item.model === explicitModel)
    || DEFAULT_RUNTIME_MODEL_OPTION;
  const effort = String(source.defaultReasoningEffort || source.default_reasoning_effort || selected.defaultReasoningEffort || "medium").trim().toLowerCase();
  return {
    defaultModelId: selected.id,
    defaultModel: selected.model,
    defaultModelProvider: selected.provider,
    defaultReasoningEffort: VALID_REASONING_EFFORTS.has(effort) ? effort : selected.defaultReasoningEffort || "medium",
  };
}

function normalizeRuntimeConfig(value) {
  const source = value && typeof value === "object" ? value : {};
  const hermesApiBase = String(source.hermesApiBase || source.hermes_api_base || "").trim();
  const hermesApiKeyPath = String(source.hermesApiKeyPath || source.hermes_api_key_path || "").trim();
  const webPushSubject = String(source.webPushSubject || source.web_push_subject || "").trim();
  const webPushVapidPath = String(source.webPushVapidPath || source.web_push_vapid_path || "").trim();
  const model = normalizeRuntimeModelSelection(source);
  return {
    schemaVersion: 1,
    hermesApiBase: hermesApiBase ? stripTrailingSlash(hermesApiBase) : "",
    hermesApiKeyPath,
    defaultModelId: model.defaultModelId,
    defaultModel: model.defaultModel,
    defaultModelProvider: model.defaultModelProvider,
    defaultReasoningEffort: model.defaultReasoningEffort,
    webPushSubject,
    webPushVapidPath,
    updatedAt: String(source.updatedAt || ""),
    updatedBy: String(source.updatedBy || ""),
  };
}

function validateHermesApiBase(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_) {
    const err = new Error("Hermes Gateway URL is not valid");
    err.status = 400;
    throw err;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    const err = new Error("Hermes Gateway URL must use http or https");
    err.status = 400;
    throw err;
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/g, "");
  parsed.search = "";
  parsed.hash = "";
  return stripTrailingSlash(parsed.toString());
}

function validateWebPushSubject(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(raw)) return raw;
  try {
    const parsed = new URL(raw);
    if (["http:", "https:"].includes(parsed.protocol)) return parsed.toString();
  } catch (_) {}
  const err = new Error("Web Push subject must be a mailto: address or http(s) URL");
  err.status = 400;
  throw err;
}

function createRuntimeConfigProvider(options = {}) {
  const storagePath = () => path.resolve(String(typeof options.storagePath === "function" ? options.storagePath() : options.storagePath));
  const ensureDataDir = typeof options.ensureDataDir === "function" ? options.ensureDataDir : () => {};
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const defaultHermesApiBase = () => stripTrailingSlash(
    typeof options.defaultHermesApiBase === "function" ? options.defaultHermesApiBase() : options.defaultHermesApiBase,
  );
  const defaultWebPushSubject = () => String(
    typeof options.defaultWebPushSubject === "function" ? options.defaultWebPushSubject() : options.defaultWebPushSubject,
  );
  const defaultWebPushVapidPath = () => path.resolve(String(
    typeof options.defaultWebPushVapidPath === "function" ? options.defaultWebPushVapidPath() : options.defaultWebPushVapidPath,
  ));
  const apiKeyPaths = () => (typeof options.apiKeyPaths === "function" ? options.apiKeyPaths() : (options.apiKeyPaths || [])).filter(Boolean);
  const envPaths = () => (typeof options.envPaths === "function" ? options.envPaths() : (options.envPaths || [])).filter(Boolean);

  function load() {
    ensureDataDir();
    try {
      return normalizeRuntimeConfig(JSON.parse(fs.readFileSync(storagePath(), "utf8")));
    } catch (_) {
      return normalizeRuntimeConfig({});
    }
  }

  function save(input, actor = "owner") {
    ensureDataDir();
    const previous = load();
    const next = normalizeRuntimeConfig(Object.assign({}, previous, input, {
      hermesApiBase: validateHermesApiBase(input.hermesApiBase ?? input.hermes_api_base ?? previous.hermesApiBase),
      hermesApiKeyPath: String(input.hermesApiKeyPath ?? input.hermes_api_key_path ?? previous.hermesApiKeyPath ?? "").trim(),
      ...normalizeRuntimeModelSelection({
        defaultModelId: input.defaultModelId ?? input.default_model_id ?? previous.defaultModelId,
        defaultModel: input.defaultModel ?? input.default_model ?? previous.defaultModel,
        defaultModelProvider: input.defaultModelProvider ?? input.default_model_provider ?? previous.defaultModelProvider,
        defaultReasoningEffort: input.defaultReasoningEffort ?? input.default_reasoning_effort ?? previous.defaultReasoningEffort,
      }),
      webPushSubject: validateWebPushSubject(input.webPushSubject ?? input.web_push_subject ?? previous.webPushSubject),
      webPushVapidPath: String(input.webPushVapidPath ?? input.web_push_vapid_path ?? previous.webPushVapidPath ?? "").trim(),
      updatedAt: nowIso(),
      updatedBy: actor || "owner",
    }));
    fs.writeFileSync(storagePath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return next;
  }

  function effectiveHermesApiBase(config = load()) {
    return stripTrailingSlash(config.hermesApiBase || defaultHermesApiBase());
  }

  function configuredHermesApiKeyPaths(config = load()) {
    return [config.hermesApiKeyPath, ...apiKeyPaths()].filter(Boolean);
  }

  function effectiveWebPushSubject(config = load()) {
    return config.webPushSubject || defaultWebPushSubject();
  }

  function effectiveWebPushVapidPath(config = load()) {
    return path.resolve(config.webPushVapidPath || defaultWebPushVapidPath());
  }

  function loadHermesApiKey(env = process.env) {
    const direct = env.HERMES_WEB_HERMES_API_KEY
      || env.HERMES_API_KEY
      || env.API_SERVER_KEY
      || "";
    if (String(direct).trim()) return String(direct).trim();

    for (const keyPath of configuredHermesApiKeyPaths()) {
      try {
        if (!keyPath || !fs.existsSync(keyPath)) continue;
        const text = fs.readFileSync(keyPath, "utf8").trim();
        if (!text) continue;
        const match = text.match(/^\s*(?:export\s+)?(?:API_SERVER_KEY|HERMES_API_KEY)\s*=\s*(.+?)\s*$/m);
        const value = match ? match[1].replace(/^['"]|['"]$/g, "").trim() : text;
        if (value) return value;
      } catch (_) {
        // Keep trying env paths.
      }
    }

    for (const envPath of envPaths()) {
      try {
        if (!envPath || !fs.existsSync(envPath)) continue;
        const text = fs.readFileSync(envPath, "utf8");
        for (const line of text.split(/\r?\n/)) {
          const match = line.match(/^\s*(?:export\s+)?(API_SERVER_KEY|HERMES_API_KEY)\s*=\s*(.+?)\s*$/);
          if (!match) continue;
          const value = match[2].replace(/^['"]|['"]$/g, "").trim();
          if (value) return value;
        }
      } catch (_) {
        // Keep trying remaining files only.
      }
    }
    return "";
  }

  function hermesApiKeyStatus(env = process.env) {
    const direct = env.HERMES_WEB_HERMES_API_KEY
      || env.HERMES_API_KEY
      || env.API_SERVER_KEY
      || "";
    if (String(direct).trim()) return { configured: true, source: "env", path: "" };
    for (const keyPath of configuredHermesApiKeyPaths()) {
      try {
        if (!keyPath || !fs.existsSync(keyPath)) continue;
        const value = fs.readFileSync(keyPath, "utf8").trim();
        if (value) return { configured: true, source: "file", path: keyPath };
      } catch (_) {}
    }
    for (const envPath of envPaths()) {
      try {
        if (!envPath || !fs.existsSync(envPath)) continue;
        const text = fs.readFileSync(envPath, "utf8");
        if (/^\s*(?:export\s+)?(?:API_SERVER_KEY|HERMES_API_KEY)\s*=/m.test(text)) {
          return { configured: true, source: "env-file", path: envPath };
        }
      } catch (_) {}
    }
    return { configured: false, source: "", path: "" };
  }

  function publicConfig(args = {}) {
    const config = load();
    const keyStatus = hermesApiKeyStatus();
    const pushStatus = args.pushStatus || {};
    const vapidPath = effectiveWebPushVapidPath(config);
    return {
      hermesApiBase: effectiveHermesApiBase(config),
      hermesApiBaseOverride: config.hermesApiBase || "",
      hermesApiBaseDefault: defaultHermesApiBase(),
      hermesApiKeyPath: config.hermesApiKeyPath || "",
      hermesApiKeyConfigured: keyStatus.configured,
      hermesApiKeySource: keyStatus.source,
      hermesApiKeyResolvedPath: keyStatus.path,
      defaultModelId: config.defaultModelId || DEFAULT_RUNTIME_MODEL_OPTION.id,
      defaultModel: config.defaultModel || DEFAULT_RUNTIME_MODEL_OPTION.model,
      defaultModelProvider: config.defaultModelProvider || DEFAULT_RUNTIME_MODEL_OPTION.provider,
      defaultReasoningEffort: config.defaultReasoningEffort || DEFAULT_RUNTIME_MODEL_OPTION.defaultReasoningEffort,
      modelFamilies: runtimeModelFamilies(),
      modelOptions: runtimeModelOptions(),
      webPushEnabled: Boolean(args.webPushEnabled),
      webPushConfigured: Boolean(pushStatus.enabled),
      webPushSubject: effectiveWebPushSubject(config),
      webPushSubjectOverride: config.webPushSubject || "",
      webPushVapidPath: config.webPushVapidPath || "",
      webPushVapidResolvedPath: vapidPath,
      webPushVapidExists: fs.existsSync(vapidPath),
      webPushSource: args.webPushConfig?.source || "",
      webPushPublicKeyPresent: Boolean(args.webPushConfig?.publicKey),
      webPushSubscriptionCount: pushStatus.subscriptionCount || 0,
      updatedAt: config.updatedAt || "",
      updatedBy: config.updatedBy || "",
    };
  }

  return {
    configuredHermesApiKeyPaths,
    effectiveHermesApiBase,
    effectiveWebPushSubject,
    effectiveWebPushVapidPath,
    hermesApiKeyStatus,
    load,
    loadHermesApiKey,
    normalize: normalizeRuntimeConfig,
    publicConfig,
    save,
    validateHermesApiBase,
    validateWebPushSubject,
  };
}

module.exports = {
  DEFAULT_RUNTIME_MODEL_OPTION,
  RUNTIME_MODEL_OPTIONS,
  createRuntimeConfigProvider,
  normalizeRuntimeConfig,
  normalizeRuntimeModelSelection,
  runtimeModelFamilies,
  runtimeModelOptions,
  validateHermesApiBase,
  validateWebPushSubject,
};
