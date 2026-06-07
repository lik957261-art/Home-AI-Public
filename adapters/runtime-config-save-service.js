"use strict";

function optionFunction(options, name) {
  const value = options[name];
  if (typeof value === "function") return value;
  throw new Error(`RuntimeConfigSaveService requires ${name}`);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function createRuntimeConfigSaveService(options = {}) {
  const mergeGatewayWorkerRuntimeSettings = optionFunction(options, "mergeGatewayWorkerRuntimeSettings");
  const normalizeRuntimeConfig = optionFunction(options, "normalizeRuntimeConfig");
  const normalizeRuntimeModelSelection = optionFunction(options, "normalizeRuntimeModelSelection");
  const nowIso = optionFunction(options, "nowIso");
  const validateHermesApiBase = optionFunction(options, "validateHermesApiBase");
  const validateWebPushSubject = optionFunction(options, "validateWebPushSubject");

  function runtimeConfigForSave(input, actor = "owner", previous = {}) {
    const sourceInput = input && typeof input === "object" ? input : {};
    const hasGatewayWorkerSettings = hasOwn(sourceInput, "gatewayWorkerSettings")
      || hasOwn(sourceInput, "gateway_worker_settings");
    const gatewayWorkerSettings = hasGatewayWorkerSettings
      ? mergeGatewayWorkerRuntimeSettings(
        previous.gatewayWorkerSettings,
        sourceInput.gatewayWorkerSettings ?? sourceInput.gateway_worker_settings ?? {},
        { strict: true },
      )
      : previous.gatewayWorkerSettings;
    return normalizeRuntimeConfig(Object.assign({}, previous, sourceInput, {
      hermesApiBase: validateHermesApiBase(sourceInput.hermesApiBase ?? sourceInput.hermes_api_base ?? previous.hermesApiBase),
      hermesApiKeyPath: String(sourceInput.hermesApiKeyPath ?? sourceInput.hermes_api_key_path ?? previous.hermesApiKeyPath ?? "").trim(),
      ...normalizeRuntimeModelSelection({
        defaultModelId: sourceInput.defaultModelId ?? sourceInput.default_model_id ?? previous.defaultModelId,
        defaultModel: sourceInput.defaultModel ?? sourceInput.default_model ?? previous.defaultModel,
        defaultModelProvider: sourceInput.defaultModelProvider ?? sourceInput.default_model_provider ?? previous.defaultModelProvider,
        defaultReasoningEffort: sourceInput.defaultReasoningEffort ?? sourceInput.default_reasoning_effort ?? previous.defaultReasoningEffort,
      }),
      gatewayWorkerSettings,
      webPushSubject: validateWebPushSubject(sourceInput.webPushSubject ?? sourceInput.web_push_subject ?? previous.webPushSubject),
      webPushVapidPath: String(sourceInput.webPushVapidPath ?? sourceInput.web_push_vapid_path ?? previous.webPushVapidPath ?? "").trim(),
      updatedAt: nowIso(),
      updatedBy: actor || "owner",
    }));
  }

  return Object.freeze({
    runtimeConfigForSave,
  });
}

module.exports = {
  createRuntimeConfigSaveService,
};
