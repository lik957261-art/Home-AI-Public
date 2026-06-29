"use strict";

const { createGatewayPoolProvider: defaultCreateGatewayPoolProvider } = require("./gateway-pool-provider");
const { createGatewayRunner: defaultCreateGatewayRunner } = require("./gateway-runner");
const { createGatewayUsageTelemetryProvider: defaultCreateGatewayUsageTelemetryProvider } = require("./gateway-usage-telemetry-provider");
const { createGatewayWorkerProfileLaunchService: defaultCreateGatewayWorkerProfileLaunchService } = require("./gateway-worker-profile-launch-service");
const { createGatewayWorkspaceProvisioningService: defaultCreateGatewayWorkspaceProvisioningService } = require("./gateway-workspace-provisioning-service");
const { createMobileRuntimeGatewayStatusService } = require("./mobile-runtime-gateway-status-service");
const { createOpenAiCodexQuotaFailoverRuntimeService: defaultCreateOpenAiCodexQuotaFailoverRuntimeService } = require("./openai-codex-quota-failover-runtime-service");

function optionFunction(options, name, fallback = null) {
  const value = options[name];
  if (typeof value === "function") return value;
  if (value !== undefined) return () => value;
  if (fallback) return fallback;
  throw new Error(`MobileRuntimeGatewayProviderService requires ${name}`);
}

function requiredObject(options, name) {
  const value = options[name];
  if (value && typeof value === "object") return value;
  throw new Error(`MobileRuntimeGatewayProviderService requires ${name}`);
}

function createMobileRuntimeGatewayProviderService(options = {}) {
  const createGatewayPoolProvider = options.createGatewayPoolProvider || defaultCreateGatewayPoolProvider;
  const createGatewayRunner = options.createGatewayRunner || defaultCreateGatewayRunner;
  const createGatewayUsageTelemetryProvider = options.createGatewayUsageTelemetryProvider || defaultCreateGatewayUsageTelemetryProvider;
  const createGatewayWorkerProfileLaunchService = options.createGatewayWorkerProfileLaunchService || defaultCreateGatewayWorkerProfileLaunchService;
  const createGatewayWorkspaceProvisioningService = options.createGatewayWorkspaceProvisioningService || defaultCreateGatewayWorkspaceProvisioningService;
  const createOpenAiCodexQuotaFailoverRuntimeService = options.createOpenAiCodexQuotaFailoverRuntimeService || defaultCreateOpenAiCodexQuotaFailoverRuntimeService;

  const apiBase = optionFunction(options, "effectiveHermesApiBase");
  const apiKey = optionFunction(options, "loadHermesApiKey");
  const apiTimeoutMs = optionFunction(options, "apiTimeoutMs");
  const gatewayPoolElasticConfig = optionFunction(options, "gatewayPoolElasticConfig", () => ({}));
  const gatewayPoolStatusHealthy = options.gatewayPoolStatusHealthy === undefined ? undefined : optionFunction(options, "gatewayPoolStatusHealthy");
  const fs = requiredObject(options, "fs");
  const manifestPaths = optionFunction(options, "gatewayPoolManifestPaths");
  const nowIso = optionFunction(options, "nowIso", () => new Date().toISOString());
  const path = requiredObject(options, "path");
  const toolSchemaEpoch = optionFunction(options, "gatewayToolSchemaEpoch", () => "");

  let gatewayRunner = null;
  let gatewayPoolProvider = null;
  let gatewayStatusService = null;
  let gatewayUsageTelemetryProvider = null;
  let gatewayWorkerProfileLaunchService = null;
  let gatewayWorkspaceProvisioningService = null;
  let openAiCodexQuotaFailoverRuntimeService = null;

  function singleGatewayRunner() {
    if (!gatewayRunner) {
      gatewayRunner = createGatewayRunner({ apiBase, apiKey, timeoutMs: apiTimeoutMs });
    }
    return gatewayRunner;
  }

  function gatewayWorkerProfileLauncher() {
    if (!gatewayWorkerProfileLaunchService) {
      gatewayWorkerProfileLaunchService = createGatewayWorkerProfileLaunchService({ elasticConfig: gatewayPoolElasticConfig(), fs, path, toolRoot: options.toolRoot });
    }
    return gatewayWorkerProfileLaunchService;
  }

  function gatewayPool() {
    if (!gatewayPoolProvider) {
      gatewayPoolProvider = createGatewayPoolProvider({
        createGatewayRunner,
        elastic: gatewayPoolElasticConfig(),
        enabled: optionFunction(options, "gatewayPoolEnabled"),
        fallbackApiBase: apiBase,
        fallbackApiKey: apiKey,
        healthTimeoutMs: options.gatewayPoolHealthTimeoutMs,
        manifestPaths,
        startMode: optionFunction(options, "gatewayPoolStartMode"),
        startWorkerProfile: (...args) => gatewayWorkerProfileLauncher().startWorkerProfile(...args),
        stopWorkerProfile: (...args) => gatewayWorkerProfileLauncher().stopWorkerProfile(...args),
        timeoutMs: apiTimeoutMs,
        toolSchemaEpoch,
      });
    }
    return gatewayPoolProvider;
  }

  function resetGatewayRuntimeConfig() {
    gatewayPoolProvider = null;
    gatewayWorkerProfileLaunchService = null;
    return true;
  }

  function getGatewayWorkspaceProvisioningService() {
    if (!gatewayWorkspaceProvisioningService) {
      gatewayWorkspaceProvisioningService = createGatewayWorkspaceProvisioningService({ fs, manifestPaths, nowIso, path });
    }
    return gatewayWorkspaceProvisioningService;
  }

  function gatewayUsageTelemetry() {
    if (!gatewayUsageTelemetryProvider) {
      gatewayUsageTelemetryProvider = createGatewayUsageTelemetryProvider({ enabled: optionFunction(options, "gatewayUsageTelemetryEnabled"), manifestPaths, profileRoots: optionFunction(options, "gatewayUsageTelemetryProfileRoots", () => []) });
    }
    return gatewayUsageTelemetryProvider;
  }

  function gatewayStatus() {
    if (!gatewayStatusService) {
      gatewayStatusService = createMobileRuntimeGatewayStatusService({ gatewayPool, gatewayPoolStatusHealthy, singleGatewayRunner });
    }
    return gatewayStatusService;
  }

  function openAiCodexQuotaFailoverRuntime() {
    if (!openAiCodexQuotaFailoverRuntimeService) {
      openAiCodexQuotaFailoverRuntimeService = createOpenAiCodexQuotaFailoverRuntimeService(Object.assign({}, options, { fs, gatewayPool, gatewayPoolElasticConfig, gatewayWorkerProfileLauncher, nowIso, path }));
    }
    return openAiCodexQuotaFailoverRuntimeService;
  }

  async function chooseGatewayRunTarget(hints = {}, context = {}) {
    return gatewayPool().chooseTarget(hints, context);
  }

  function rotateOpenAiCodexCredentialPoolAfterUsageLimit(input = {}) {
    return openAiCodexQuotaFailoverRuntime().rotateOpenAiCodexCredentialPoolAfterUsageLimit(input);
  }

  async function restartRunningGatewayWorkers(input = {}) {
    return openAiCodexQuotaFailoverRuntime().restartRunningGatewayWorkers(input);
  }

  function releaseGatewayRunTarget(runId, idleStatus = "idle") {
    if (!gatewayPoolProvider || typeof gatewayPoolProvider.releaseRun !== "function") return false;
    return gatewayPoolProvider.releaseRun(runId, idleStatus);
  }

  function replaceGatewayRunTarget(oldRunId, newRunId) {
    if (!gatewayPoolProvider || typeof gatewayPoolProvider.replaceRun !== "function") return false;
    return gatewayPoolProvider.replaceRun(oldRunId, newRunId);
  }

  return Object.freeze({
    chooseGatewayRunTarget,
    gatewayPool,
    gatewayUsageTelemetry,
    gatewayWorkerProfileLauncher,
    getGatewayWorkspaceProvisioningService,
    getHermesStatus: (...args) => gatewayStatus().getHermesStatus(...args),
    releaseGatewayRunTarget,
    replaceGatewayRunTarget,
    resetGatewayRuntimeConfig,
    restartRunningGatewayWorkers,
    rotateOpenAiCodexCredentialPoolAfterUsageLimit,
    singleGatewayRunner,
  });
}

module.exports = {
  createMobileRuntimeGatewayProviderService,
};
