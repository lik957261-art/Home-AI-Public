"use strict";

const { createGatewayPoolProvider: defaultCreateGatewayPoolProvider } = require("./gateway-pool-provider");
const { createGatewayRunner: defaultCreateGatewayRunner } = require("./gateway-runner");
const { createGatewayUsageTelemetryProvider: defaultCreateGatewayUsageTelemetryProvider } = require("./gateway-usage-telemetry-provider");
const { createGatewayWorkerProfileLaunchService: defaultCreateGatewayWorkerProfileLaunchService } = require("./gateway-worker-profile-launch-service");
const { createGatewayWorkspaceProvisioningService: defaultCreateGatewayWorkspaceProvisioningService } = require("./gateway-workspace-provisioning-service");

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
  const createGatewayPoolProvider = options.createGatewayPoolProvider || defaultCreateGatewayPoolProvider;
  const createGatewayRunner = options.createGatewayRunner || defaultCreateGatewayRunner;
  const createGatewayUsageTelemetryProvider = options.createGatewayUsageTelemetryProvider || defaultCreateGatewayUsageTelemetryProvider;
  const createGatewayWorkerProfileLaunchService = options.createGatewayWorkerProfileLaunchService || defaultCreateGatewayWorkerProfileLaunchService;
  const createGatewayWorkspaceProvisioningService = options.createGatewayWorkspaceProvisioningService || defaultCreateGatewayWorkspaceProvisioningService;

  const apiBase = optionFunction(options, "effectiveHermesApiBase");
  const apiKey = optionFunction(options, "loadHermesApiKey");
  const apiTimeoutMs = optionFunction(options, "apiTimeoutMs");
  const fs = requiredObject(options, "fs");
  const manifestPaths = optionFunction(options, "gatewayPoolManifestPaths");
  const nowIso = optionFunction(options, "nowIso", () => new Date().toISOString());
  const path = requiredObject(options, "path");
  const runConcurrencyPolicy = requiredObject(options, "runConcurrencyPolicy");
  const state = optionFunction(options, "state", () => ({ threads: [] }));
  const toolSchemaEpoch = optionFunction(options, "gatewayToolSchemaEpoch", () => "");

  let gatewayRunner = null;
  let gatewayPoolProvider = null;
  let gatewayUsageTelemetryProvider = null;
  let gatewayWorkerProfileLaunchService = null;
  let gatewayWorkspaceProvisioningService = null;

  function singleGatewayRunner() {
    if (!gatewayRunner) {
      gatewayRunner = createGatewayRunner({
        apiBase,
        apiKey,
        timeoutMs: apiTimeoutMs,
      });
    }
    return gatewayRunner;
  }

  function gatewayWorkerProfileLauncher() {
    if (!gatewayWorkerProfileLaunchService) {
      gatewayWorkerProfileLaunchService = createGatewayWorkerProfileLaunchService({
        elasticConfig: options.gatewayPoolElasticConfig,
        fs,
        path,
        toolRoot: options.toolRoot,
      });
    }
    return gatewayWorkerProfileLaunchService;
  }

  function gatewayPool() {
    if (!gatewayPoolProvider) {
      gatewayPoolProvider = createGatewayPoolProvider({
        createGatewayRunner,
        elastic: options.gatewayPoolElasticConfig,
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

  function getGatewayWorkspaceProvisioningService() {
    if (!gatewayWorkspaceProvisioningService) {
      gatewayWorkspaceProvisioningService = createGatewayWorkspaceProvisioningService({
        fs,
        manifestPaths,
        nowIso,
        path,
      });
    }
    return gatewayWorkspaceProvisioningService;
  }

  function gatewayUsageTelemetry() {
    if (!gatewayUsageTelemetryProvider) {
      gatewayUsageTelemetryProvider = createGatewayUsageTelemetryProvider({
        enabled: optionFunction(options, "gatewayUsageTelemetryEnabled"),
        manifestPaths,
        profileRoots: optionFunction(options, "gatewayUsageTelemetryProfileRoots", () => []),
      });
    }
    return gatewayUsageTelemetryProvider;
  }

  async function chooseGatewayRunTarget(hints = {}, context = {}) {
    return gatewayPool().chooseTarget(hints, context);
  }

  function releaseGatewayRunTarget(runId, idleStatus = "idle") {
    if (!gatewayPoolProvider || typeof gatewayPoolProvider.releaseRun !== "function") return false;
    return gatewayPoolProvider.releaseRun(runId, idleStatus);
  }

  function replaceGatewayRunTarget(oldRunId, newRunId) {
    if (!gatewayPoolProvider || typeof gatewayPoolProvider.replaceRun !== "function") return false;
    return gatewayPoolProvider.replaceRun(oldRunId, newRunId);
  }

  function runConcurrencySnapshot() {
    return runConcurrencyPolicy.snapshot(state()?.threads || []);
  }

  function runConcurrencyError(workspaceId) {
    return runConcurrencyPolicy.limitError(state()?.threads || [], workspaceId);
  }

  function assertRunConcurrencyCapacity(workspaceId) {
    const error = runConcurrencyError(workspaceId);
    if (!error) return;
    const err = new Error(error.message);
    err.status = error.status || 429;
    err.code = error.code;
    err.details = error;
    throw err;
  }

  return Object.freeze({
    assertRunConcurrencyCapacity,
    chooseGatewayRunTarget,
    gatewayPool,
    gatewayUsageTelemetry,
    gatewayWorkerProfileLauncher,
    getGatewayWorkspaceProvisioningService,
    releaseGatewayRunTarget,
    replaceGatewayRunTarget,
    runConcurrencyError,
    runConcurrencySnapshot,
    singleGatewayRunner,
  });
}

module.exports = {
  createMobileRuntimeGatewayFacadeService,
};
