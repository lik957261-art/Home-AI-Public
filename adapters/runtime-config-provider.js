"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createRuntimeConfigEffectiveService } = require("./runtime-config-effective-service");
const { createRuntimeConfigKeyService } = require("./runtime-config-key-service");
const { createRuntimeConfigPublicProjectionService } = require("./runtime-config-public-projection-service");
const { createRuntimeConfigSaveService } = require("./runtime-config-save-service");
const {
  gatewayWorkerSettingsToElasticConfig,
  mergeGatewayWorkerRuntimeSettings,
  normalizeGatewayWorkerRuntimeSettings,
  publicGatewayWorkerRuntimeSettings,
} = require("./gateway-worker-runtime-settings-service");

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
  const gatewayWorkerSettings = normalizeGatewayWorkerRuntimeSettings(source.gatewayWorkerSettings || source.gateway_worker_settings || {});
  return {
    schemaVersion: 1,
    hermesApiBase: hermesApiBase ? stripTrailingSlash(hermesApiBase) : "",
    hermesApiKeyPath,
    defaultModelId: model.defaultModelId,
    defaultModel: model.defaultModel,
    defaultModelProvider: model.defaultModelProvider,
    defaultReasoningEffort: model.defaultReasoningEffort,
    gatewayWorkerSettings,
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
  const apiKeyPaths = () => (typeof options.apiKeyPaths === "function" ? options.apiKeyPaths() : (options.apiKeyPaths || [])).filter(Boolean);
  const envPaths = () => (typeof options.envPaths === "function" ? options.envPaths() : (options.envPaths || [])).filter(Boolean);
  const baseGatewayWorkerElasticConfig = () => (
    typeof options.gatewayWorkerElasticConfig === "function"
      ? (options.gatewayWorkerElasticConfig() || {})
      : (options.gatewayWorkerElasticConfig || {})
  );
  const effectiveService = createRuntimeConfigEffectiveService({
    defaultHermesApiBase: options.defaultHermesApiBase,
    defaultWebPushSubject: options.defaultWebPushSubject,
    defaultWebPushVapidPath: options.defaultWebPushVapidPath,
    load,
    pathResolve: (targetPath) => path.resolve(String(targetPath)),
  });
  const keyService = createRuntimeConfigKeyService({
    apiKeyPaths,
    envPaths,
    fileExists: (targetPath) => fs.existsSync(targetPath),
    load,
    readFile: (targetPath) => fs.readFileSync(targetPath, "utf8"),
  });
  const publicProjectionService = createRuntimeConfigPublicProjectionService({
    defaultHermesApiBase: effectiveService.defaultHermesApiBase,
    defaultRuntimeModelOption: DEFAULT_RUNTIME_MODEL_OPTION,
    effectiveHermesApiBase: effectiveService.effectiveHermesApiBase,
    effectiveWebPushSubject: effectiveService.effectiveWebPushSubject,
    effectiveWebPushVapidPath: effectiveService.effectiveWebPushVapidPath,
    fileExists: (targetPath) => fs.existsSync(targetPath),
    gatewayWorkerRuntimeSettings,
    hermesApiKeyStatus: keyService.hermesApiKeyStatus,
    load,
    runtimeModelFamilies,
    runtimeModelOptions,
  });
  const saveService = createRuntimeConfigSaveService({
    mergeGatewayWorkerRuntimeSettings,
    normalizeRuntimeConfig,
    normalizeRuntimeModelSelection,
    nowIso,
    validateHermesApiBase,
    validateWebPushSubject,
  });

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
    const next = saveService.runtimeConfigForSave(input, actor, previous);
    fs.writeFileSync(storagePath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return next;
  }

  function gatewayWorkerElasticConfig(config = load(), base = baseGatewayWorkerElasticConfig()) {
    return gatewayWorkerSettingsToElasticConfig(config.gatewayWorkerSettings || {}, base);
  }

  function gatewayWorkerRuntimeSettings(config = load()) {
    return publicGatewayWorkerRuntimeSettings(config.gatewayWorkerSettings || {}, baseGatewayWorkerElasticConfig());
  }

  function publicConfig(args = {}) {
    return publicProjectionService.publicConfig(args);
  }

  return {
    configuredHermesApiKeyPaths: keyService.configuredHermesApiKeyPaths,
    effectiveHermesApiBase: effectiveService.effectiveHermesApiBase,
    effectiveWebPushSubject: effectiveService.effectiveWebPushSubject,
    effectiveWebPushVapidPath: effectiveService.effectiveWebPushVapidPath,
    gatewayWorkerElasticConfig,
    gatewayWorkerRuntimeSettings,
    hermesApiKeyStatus: keyService.hermesApiKeyStatus,
    load,
    loadHermesApiKey: keyService.loadHermesApiKey,
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
