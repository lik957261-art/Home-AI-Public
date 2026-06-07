"use strict";

const {
  gatewayWorkerSettingsToElasticConfig,
  publicGatewayWorkerRuntimeSettings,
} = require("./gateway-worker-runtime-settings-service");

function readOption(value) {
  return typeof value === "function" ? value() : value;
}

function objectOption(value) {
  const resolved = readOption(value);
  return resolved && typeof resolved === "object" ? resolved : {};
}

function createRuntimeConfigGatewayWorkerService(options = {}) {
  const load = typeof options.load === "function" ? options.load : () => ({});
  const toElasticConfig = typeof options.gatewayWorkerSettingsToElasticConfig === "function"
    ? options.gatewayWorkerSettingsToElasticConfig
    : gatewayWorkerSettingsToElasticConfig;
  const publicRuntimeSettings = typeof options.publicGatewayWorkerRuntimeSettings === "function"
    ? options.publicGatewayWorkerRuntimeSettings
    : publicGatewayWorkerRuntimeSettings;

  function baseGatewayWorkerElasticConfig() {
    return objectOption(options.gatewayWorkerElasticConfig);
  }

  function gatewayWorkerElasticConfig(config = load(), base = baseGatewayWorkerElasticConfig()) {
    return toElasticConfig(config?.gatewayWorkerSettings || {}, base);
  }

  function gatewayWorkerRuntimeSettings(config = load()) {
    return publicRuntimeSettings(config?.gatewayWorkerSettings || {}, baseGatewayWorkerElasticConfig());
  }

  return Object.freeze({
    baseGatewayWorkerElasticConfig,
    gatewayWorkerElasticConfig,
    gatewayWorkerRuntimeSettings,
  });
}

module.exports = {
  createRuntimeConfigGatewayWorkerService,
};
