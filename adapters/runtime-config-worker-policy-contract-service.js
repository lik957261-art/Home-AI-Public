"use strict";

const {
  SETTING_DEFINITIONS,
  gatewayWorkerSettingsToElasticConfig,
  normalizeGatewayWorkerRuntimeSettings,
  publicGatewayWorkerRuntimeSettings,
} = require("./gateway-worker-runtime-settings-service");

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function valueForKey(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined;
}

function sameNumber(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  return Number.isFinite(leftNumber)
    && Number.isFinite(rightNumber)
    && leftNumber === rightNumber;
}

function createRuntimeConfigWorkerPolicyContractService(options = {}) {
  const definitions = Array.isArray(options.settingDefinitions) ? options.settingDefinitions : SETTING_DEFINITIONS;
  const normalizeSettings = typeof options.normalizeGatewayWorkerRuntimeSettings === "function"
    ? options.normalizeGatewayWorkerRuntimeSettings
    : normalizeGatewayWorkerRuntimeSettings;
  const projectPublicSettings = typeof options.publicGatewayWorkerRuntimeSettings === "function"
    ? options.publicGatewayWorkerRuntimeSettings
    : publicGatewayWorkerRuntimeSettings;
  const settingsToElasticConfig = typeof options.gatewayWorkerSettingsToElasticConfig === "function"
    ? options.gatewayWorkerSettingsToElasticConfig
    : gatewayWorkerSettingsToElasticConfig;
  const load = typeof options.load === "function" ? options.load : () => ({});
  const publicConfig = typeof options.publicConfig === "function" ? options.publicConfig : () => ({});
  const baseGatewayWorkerElasticConfig = typeof options.baseGatewayWorkerElasticConfig === "function"
    ? options.baseGatewayWorkerElasticConfig
    : () => ({});
  const gatewayWorkerElasticConfig = typeof options.gatewayWorkerElasticConfig === "function"
    ? options.gatewayWorkerElasticConfig
    : (config, base) => settingsToElasticConfig(config?.gatewayWorkerSettings || {}, base);

  function workerPolicyContract(input = {}) {
    const config = objectValue(input.config);
    const baseElasticConfig = objectValue(input.baseElasticConfig);
    const publicConfig = objectValue(input.publicConfig);
    const launcherElasticConfig = objectValue(input.launcherElasticConfig);
    const checkLauncherProjection = input.launcherElasticConfig !== undefined && input.launcherElasticConfig !== null;
    const overrides = normalizeSettings(config.gatewayWorkerSettings || {});
    const expectedPublic = projectPublicSettings(overrides, baseElasticConfig);
    const expectedElastic = settingsToElasticConfig(overrides, baseElasticConfig);
    const publicOverrides = normalizeSettings(publicConfig.gatewayWorkerSettings || {});
    const publicEffective = objectValue(publicConfig.gatewayWorkerEffectiveSettings);
    const publicDefinitions = Array.isArray(publicConfig.gatewayWorkerSettingDefinitions)
      ? publicConfig.gatewayWorkerSettingDefinitions
      : [];
    const issues = [];

    for (const definition of definitions) {
      if (!publicDefinitions.some((item) => item?.key === definition.key)) {
        issues.push(`definition_missing:${definition.key}`);
      }
      const expectedOverride = valueForKey(overrides, definition.key);
      const publicOverride = valueForKey(publicOverrides, definition.key);
      if (expectedOverride !== undefined && !sameNumber(expectedOverride, publicOverride)) {
        issues.push(`public_worker_overrides_mismatch:${definition.key}`);
      }
      if (expectedOverride === undefined && publicOverride !== undefined) {
        issues.push(`public_worker_overrides_unexpected:${definition.key}`);
      }
      const expectedEffective = valueForKey(expectedPublic.effective, definition.key);
      const actualEffective = valueForKey(publicEffective, definition.key);
      if (expectedEffective !== undefined && !sameNumber(expectedEffective, actualEffective)) {
        issues.push(`public_worker_effective_mismatch:${definition.key}`);
      }
      for (const envName of [definition.mobileEnv, definition.webEnv].filter(Boolean)) {
        const expectedValue = cleanString(expectedElastic[envName]);
        const actualValue = cleanString(launcherElasticConfig[envName]);
        if (checkLauncherProjection && expectedValue !== actualValue) {
          issues.push(`launcher_worker_env_mismatch:${envName}`);
        }
      }
    }

    return {
      ok: issues.length === 0,
      issues,
      overrides,
      effective: expectedPublic.effective,
      definitions: expectedPublic.definitions,
      expectedElasticEnv: expectedElastic,
      publicProjection: {
        overrides: publicOverrides,
        effective: publicEffective,
        definitions: publicDefinitions.map((item) => ({ key: item.key, label: item.label || "", max: item.max })),
      },
      launcherProjection: launcherElasticConfig,
    };
  }

  function runtimeWorkerPolicyContract(args = {}) {
    const config = args.config || load();
    const baseElasticConfig = args.baseElasticConfig || baseGatewayWorkerElasticConfig();
    return workerPolicyContract({
      config,
      baseElasticConfig,
      publicConfig: args.publicConfig || publicConfig(args.publicConfigArgs || {}),
      launcherElasticConfig: args.launcherElasticConfig || gatewayWorkerElasticConfig(config, baseElasticConfig),
    });
  }

  return Object.freeze({
    runtimeWorkerPolicyContract,
    workerPolicyContract,
  });
}

module.exports = {
  createRuntimeConfigWorkerPolicyContractService,
};
