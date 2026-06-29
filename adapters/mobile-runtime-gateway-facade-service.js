"use strict";

const { createMobileRuntimeGatewayConcurrencyService } = require("./mobile-runtime-gateway-concurrency-service");
const { createMobileRuntimeGatewayProviderService } = require("./mobile-runtime-gateway-provider-service");

function optionFunction(options, name, fallback = null) {
  const value = options[name];
  if (typeof value === "function") return value;
  if (value !== undefined) return () => value;
  if (fallback) return fallback;
  throw new Error(`MobileRuntimeGatewayFacadeService requires ${name}`);
}

function requiredObject(options, name) {
  const value = options[name];
  if (value && typeof value === "object") return value;
  throw new Error(`MobileRuntimeGatewayFacadeService requires ${name}`);
}

function createMobileRuntimeGatewayFacadeService(options = {}) {
  const createGatewayRuntimeCompositionService = options.createGatewayRuntimeCompositionService;
  const state = optionFunction(options, "state", () => ({ threads: [] }));
  const gatewayProviderService = options.gatewayProviderService || createMobileRuntimeGatewayProviderService(options);
  const gatewayConcurrencyService = options.gatewayConcurrencyService || createMobileRuntimeGatewayConcurrencyService({
    runConcurrencyPolicy: requiredObject(options, "runConcurrencyPolicy"),
    state,
  });

  let gatewayRuntimeCompositionService = null;

  function singleGatewayRunner() {
    return gatewayProviderService.singleGatewayRunner();
  }

  function gatewayWorkerProfileLauncher() {
    return gatewayProviderService.gatewayWorkerProfileLauncher();
  }

  function gatewayPool() {
    return gatewayProviderService.gatewayPool();
  }

  function resetGatewayRuntimeConfig() {
    return gatewayProviderService.resetGatewayRuntimeConfig();
  }

  function getGatewayWorkspaceProvisioningService() {
    return gatewayProviderService.getGatewayWorkspaceProvisioningService();
  }

  function gatewayUsageTelemetry() {
    return gatewayProviderService.gatewayUsageTelemetry();
  }

  function getGatewayRuntimeCompositionService() {
    if (!gatewayRuntimeCompositionService) {
      if (typeof createGatewayRuntimeCompositionService !== "function") {
        throw new Error("MobileRuntimeGatewayFacadeService requires createGatewayRuntimeCompositionService");
      }
      const runtimeOptions = typeof options.gatewayRuntimeCompositionOptions === "function"
        ? options.gatewayRuntimeCompositionOptions()
        : options.gatewayRuntimeCompositionOptions;
      gatewayRuntimeCompositionService = createGatewayRuntimeCompositionService(runtimeOptions || {});
    }
    if (!gatewayRuntimeCompositionService || typeof gatewayRuntimeCompositionService !== "object") {
      throw new Error("MobileRuntimeGatewayFacadeService gateway runtime composition is unavailable");
    }
    return gatewayRuntimeCompositionService;
  }

  async function getHermesStatus() {
    return gatewayProviderService.getHermesStatus();
  }

  async function chooseGatewayRunTarget(hints = {}, context = {}) {
    return gatewayProviderService.chooseGatewayRunTarget(hints, context);
  }

  function releaseGatewayRunTarget(runId, idleStatus = "idle") {
    return gatewayProviderService.releaseGatewayRunTarget(runId, idleStatus);
  }

  function replaceGatewayRunTarget(oldRunId, newRunId) {
    return gatewayProviderService.replaceGatewayRunTarget(oldRunId, newRunId);
  }

  function rotateOpenAiCodexCredentialPoolAfterUsageLimit(input = {}) {
    return gatewayProviderService.rotateOpenAiCodexCredentialPoolAfterUsageLimit(input);
  }

  function restartRunningGatewayWorkers(input = {}) {
    return gatewayProviderService.restartRunningGatewayWorkers(input);
  }

  function runConcurrencySnapshot() {
    return gatewayConcurrencyService.runConcurrencySnapshot();
  }

  function runConcurrencyError(workspaceId) {
    return gatewayConcurrencyService.runConcurrencyError(workspaceId);
  }

  function assertRunConcurrencyCapacity(workspaceId) {
    return gatewayConcurrencyService.assertRunConcurrencyCapacity(workspaceId);
  }

  return Object.freeze({
    assertRunConcurrencyCapacity,
    chooseGatewayRunTarget,
    gatewayPool,
    getGatewayRuntimeCompositionService,
    gatewayUsageTelemetry,
    gatewayWorkerProfileLauncher,
    getHermesStatus,
    getGatewayWorkspaceProvisioningService,
    resetGatewayRuntimeConfig,
    releaseGatewayRunTarget,
    replaceGatewayRunTarget,
    restartRunningGatewayWorkers,
    rotateOpenAiCodexCredentialPoolAfterUsageLimit,
    runConcurrencyError,
    runConcurrencySnapshot,
    singleGatewayRunner,
  });
}

module.exports = {
  createMobileRuntimeGatewayFacadeService,
};
