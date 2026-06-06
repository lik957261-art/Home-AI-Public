"use strict";

function readOption(value) {
  return typeof value === "function" ? value() : value;
}

function createMobileRuntimeConfigFacadeService(options = {}) {
  const runtimeConfigProvider = options.runtimeConfigProvider;
  if (!runtimeConfigProvider || typeof runtimeConfigProvider !== "object") {
    throw new Error("MobileRuntimeConfigFacadeService requires runtimeConfigProvider");
  }

  function loadRuntimeConfig() {
    return runtimeConfigProvider.load();
  }

  function saveRuntimeConfig(input, actor = "owner") {
    return runtimeConfigProvider.save(input, actor);
  }

  function effectiveHermesApiBase(config = loadRuntimeConfig()) {
    return runtimeConfigProvider.effectiveHermesApiBase(config);
  }

  function effectiveWebPushSubject(config = loadRuntimeConfig()) {
    return runtimeConfigProvider.effectiveWebPushSubject(config);
  }

  function effectiveWebPushVapidPath(config = loadRuntimeConfig()) {
    return runtimeConfigProvider.effectiveWebPushVapidPath(config);
  }

  function publicRuntimeConfig() {
    return runtimeConfigProvider.publicConfig({
      pushStatus: readOption(options.pushStatus) || {},
      webPushConfig: readOption(options.webPushConfig) || null,
      webPushEnabled: Boolean(readOption(options.webPushEnabled)),
    });
  }

  function loadHermesApiKey() {
    return runtimeConfigProvider.loadHermesApiKey();
  }

  return Object.freeze({
    effectiveHermesApiBase,
    effectiveWebPushSubject,
    effectiveWebPushVapidPath,
    loadHermesApiKey,
    loadRuntimeConfig,
    publicRuntimeConfig,
    saveRuntimeConfig,
  });
}

module.exports = {
  createMobileRuntimeConfigFacadeService,
};
