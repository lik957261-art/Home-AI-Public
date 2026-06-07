"use strict";

function optionFunction(options, name, fallback = null) {
  const value = options[name];
  if (typeof value === "function") return value;
  if (value !== undefined) return () => value;
  if (fallback) return fallback;
  throw new Error(`RuntimeConfigPublicProjectionService requires ${name}`);
}

function createRuntimeConfigPublicProjectionService(options = {}) {
  const defaultHermesApiBase = optionFunction(options, "defaultHermesApiBase");
  const defaultRuntimeModelOption = options.defaultRuntimeModelOption || {};
  const effectiveHermesApiBase = optionFunction(options, "effectiveHermesApiBase");
  const effectiveWebPushSubject = optionFunction(options, "effectiveWebPushSubject");
  const effectiveWebPushVapidPath = optionFunction(options, "effectiveWebPushVapidPath");
  const fileExists = optionFunction(options, "fileExists", () => false);
  const gatewayWorkerRuntimeSettings = optionFunction(options, "gatewayWorkerRuntimeSettings");
  const hermesApiKeyStatus = optionFunction(options, "hermesApiKeyStatus");
  const load = optionFunction(options, "load");
  const runtimeModelFamilies = optionFunction(options, "runtimeModelFamilies");
  const runtimeModelOptions = optionFunction(options, "runtimeModelOptions");

  function publicConfig(args = {}) {
    const config = load();
    const keyStatus = hermesApiKeyStatus();
    const pushStatus = args.pushStatus || {};
    const vapidPath = effectiveWebPushVapidPath(config);
    const gatewayWorkerSettings = gatewayWorkerRuntimeSettings(config);
    return {
      hermesApiBase: effectiveHermesApiBase(config),
      hermesApiBaseOverride: config.hermesApiBase || "",
      hermesApiBaseDefault: defaultHermesApiBase(),
      hermesApiKeyPath: config.hermesApiKeyPath || "",
      hermesApiKeyConfigured: keyStatus.configured,
      hermesApiKeySource: keyStatus.source,
      hermesApiKeyResolvedPath: keyStatus.path,
      defaultModelId: config.defaultModelId || defaultRuntimeModelOption.id,
      defaultModel: config.defaultModel || defaultRuntimeModelOption.model,
      defaultModelProvider: config.defaultModelProvider || defaultRuntimeModelOption.provider,
      defaultReasoningEffort: config.defaultReasoningEffort || defaultRuntimeModelOption.defaultReasoningEffort,
      gatewayWorkerSettings: gatewayWorkerSettings.overrides,
      gatewayWorkerEffectiveSettings: gatewayWorkerSettings.effective,
      gatewayWorkerSettingDefinitions: gatewayWorkerSettings.definitions,
      modelFamilies: runtimeModelFamilies(),
      modelOptions: runtimeModelOptions(),
      webPushEnabled: Boolean(args.webPushEnabled),
      webPushConfigured: Boolean(pushStatus.enabled),
      webPushSubject: effectiveWebPushSubject(config),
      webPushSubjectOverride: config.webPushSubject || "",
      webPushVapidPath: config.webPushVapidPath || "",
      webPushVapidResolvedPath: vapidPath,
      webPushVapidExists: fileExists(vapidPath),
      webPushSource: args.webPushConfig?.source || "",
      webPushPublicKeyPresent: Boolean(args.webPushConfig?.publicKey),
      webPushSubscriptionCount: pushStatus.subscriptionCount || 0,
      updatedAt: config.updatedAt || "",
      updatedBy: config.updatedBy || "",
    };
  }

  return Object.freeze({
    publicConfig,
  });
}

module.exports = {
  createRuntimeConfigPublicProjectionService,
};
