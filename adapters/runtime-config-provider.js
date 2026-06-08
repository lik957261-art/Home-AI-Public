"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createRuntimeConfigEffectiveService } = require("./runtime-config-effective-service");
const { createRuntimeConfigGatewayWorkerService } = require("./runtime-config-gateway-worker-service");
const { createRuntimeConfigKeyService } = require("./runtime-config-key-service");
const {
  DEFAULT_RUNTIME_MODEL_OPTION,
  RUNTIME_MODEL_OPTIONS,
  normalizeRuntimeModelSelection,
  runtimeModelFamilies,
  runtimeModelOptions,
} = require("./runtime-config-model-service");
const { createRuntimeConfigPublicProjectionService } = require("./runtime-config-public-projection-service");
const { createRuntimeConfigSaveService } = require("./runtime-config-save-service");
const { createRuntimeConfigWorkerPolicyContractService } = require("./runtime-config-worker-policy-contract-service");
const {
  mergeGatewayWorkerRuntimeSettings,
  normalizeGatewayWorkerRuntimeSettings,
} = require("./gateway-worker-runtime-settings-service");

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
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
  const effectiveService = createRuntimeConfigEffectiveService({
    defaultHermesApiBase: options.defaultHermesApiBase,
    defaultWebPushSubject: options.defaultWebPushSubject,
    defaultWebPushVapidPath: options.defaultWebPushVapidPath,
    load,
    pathResolve: (targetPath) => path.resolve(String(targetPath)),
  });
  const gatewayWorkerService = createRuntimeConfigGatewayWorkerService({
    gatewayWorkerElasticConfig: options.gatewayWorkerElasticConfig,
    load,
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
    gatewayWorkerRuntimeSettings: gatewayWorkerService.gatewayWorkerRuntimeSettings,
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
  const workerPolicyContract = createRuntimeConfigWorkerPolicyContractService({
    baseGatewayWorkerElasticConfig: gatewayWorkerService.baseGatewayWorkerElasticConfig,
    gatewayWorkerElasticConfig: gatewayWorkerService.gatewayWorkerElasticConfig,
    load,
    publicConfig,
  }).runtimeWorkerPolicyContract;

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

  function publicConfig(args = {}) {
    return publicProjectionService.publicConfig(args);
  }

  return {
    configuredHermesApiKeyPaths: keyService.configuredHermesApiKeyPaths,
    effectiveHermesApiBase: effectiveService.effectiveHermesApiBase,
    effectiveWebPushSubject: effectiveService.effectiveWebPushSubject,
    effectiveWebPushVapidPath: effectiveService.effectiveWebPushVapidPath,
    gatewayWorkerElasticConfig: gatewayWorkerService.gatewayWorkerElasticConfig,
    gatewayWorkerRuntimeSettings: gatewayWorkerService.gatewayWorkerRuntimeSettings,
    hermesApiKeyStatus: keyService.hermesApiKeyStatus,
    load,
    loadHermesApiKey: keyService.loadHermesApiKey,
    normalize: normalizeRuntimeConfig,
    publicConfig,
    save,
    validateHermesApiBase,
    validateWebPushSubject,
    workerPolicyContract,
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
