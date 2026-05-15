"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { createLocalAutomationBridgeService } = require("./local-automation-bridge-service");
const { createLocalBridgeWrapperService } = require("./local-bridge-wrapper-service");
const { createLocalProcessRunnerService } = require("./local-process-runner-service");
const { createLocalTodoBridgeService } = require("./local-todo-bridge-service");

function asFunction(value, fallback) {
  return typeof value === "function" ? value : fallback;
}

function valueFrom(value) {
  return typeof value === "function" ? value() : value;
}

function createLocalBridgeRuntimeService(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetch || globalThis.fetch;
  const AbortControllerImpl = options.AbortController || globalThis.AbortController;
  const setTimer = options.setTimeout || setTimeout;
  const clearTimer = options.clearTimeout || clearTimeout;
  let bridgeHostKeyCache = { path: "", value: "" };

  function bridgeHostUrl() {
    return String(valueFrom(options.bridgeHostUrl) || "").replace(/\/+$/, "");
  }

  function bridgeHostKey() {
    const envKey = String(env.HERMES_MOBILE_BRIDGE_HOST_KEY || env.HERMES_WEB_BRIDGE_HOST_KEY || "").trim();
    if (envKey) return envKey;
    const keyPath = String(valueFrom(options.bridgeHostKeyPath) || "").trim();
    if (!keyPath) return "";
    const normalizedPath = path.resolve(keyPath);
    if (bridgeHostKeyCache.path === normalizedPath && bridgeHostKeyCache.value) return bridgeHostKeyCache.value;
    const value = String(fs.readFileSync(normalizedPath, "utf8") || "").trim();
    bridgeHostKeyCache = { path: normalizedPath, value };
    return value;
  }

  async function runBridgeHost(kind, payload, timeoutMs) {
    const url = bridgeHostUrl();
    if (!url) return null;
    if (typeof fetchImpl !== "function") throw new Error("fetch is required for Hermes Mobile bridge host");
    if (typeof AbortControllerImpl !== "function") throw new Error("AbortController is required for Hermes Mobile bridge host");
    const key = bridgeHostKey();
    if (!key) throw new Error("Hermes Mobile bridge host key is not configured");
    const controller = new AbortControllerImpl();
    const timer = setTimer(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 15000));
    try {
      const response = await fetchImpl(`${url}/bridge/${encodeURIComponent(kind)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(payload || {}),
        signal: controller.signal,
      });
      let parsed = {};
      try {
        parsed = await response.json();
      } catch (_) {
        parsed = {};
      }
      if (!response.ok) {
        throw new Error(parsed?.error || `Hermes Mobile bridge host returned HTTP ${response.status}`);
      }
      return parsed;
    } catch (err) {
      if (err?.name === "AbortError") throw new Error(`${kind} bridge host timed out`);
      throw err;
    } finally {
      clearTimer(timer);
    }
  }

  const localProcessRunnerService = createLocalProcessRunnerService({
    env,
    spawn: options.spawn,
    setTimeout: options.processSetTimeout,
    clearTimeout: options.processClearTimeout,
  });

  const localTodoBridgeService = createLocalTodoBridgeService({
    storePath: options.localTodoStorePath,
    readJsonStore: options.readJsonStore,
    writeJsonStore: options.writeJsonStore,
    mobileSqliteStore: options.mobileSqliteStore,
    useSqliteServiceStore: options.useSqliteServiceStore,
    nowIso: options.nowIso,
    formatLocalDateTime: options.formatLocalDateTime,
  });

  const localAutomationBridgeService = createLocalAutomationBridgeService({
    storePath: options.localAutomationStorePath,
    readJsonStore: options.readJsonStore,
    writeJsonStore: options.writeJsonStore,
    sqliteStore: options.mobileSqliteStore,
    useSqliteServiceStore: options.useSqliteServiceStore,
    compactText: options.compactText,
    nowIso: options.nowIso,
    createId: options.createAutomationId,
    sortJobs: options.sortJobs,
  });

  const kanbanTodoBridge = {
    run(payload) {
      const bridge = valueFrom(options.kanbanTodoBridge);
      if (!bridge || typeof bridge.run !== "function") throw new Error("kanbanTodoBridge.run is required");
      return bridge.run(payload);
    },
  };

  const localBridgeWrapperService = createLocalBridgeWrapperService({
    bridgeCommandProvider: options.bridgeCommandProvider,
    bridgeHostEnabled: () => Boolean(bridgeHostUrl()),
    compactText: options.compactText,
    cronBridgeScript: options.cronBridgeScript,
    cronStdoutLimitBytes: options.cronStdoutLimitBytes,
    cronTimeoutMs: options.cronTimeoutMs,
    directoryBridgeScript: options.directoryBridgeScript,
    directoryStdoutLimitBytes: options.directoryStdoutLimitBytes,
    directoryTimeoutMs: options.directoryTimeoutMs,
    kanbanTodoBridge,
    runBridgeHost,
    runLocalCronBridge: (payload) => localAutomationBridgeService.runBridge(payload),
    runLocalTodoBridge: (payload) => localTodoBridgeService.run(payload),
    spawn: options.spawn,
    todoBridgeScript: options.todoBridgeScript,
    todoStdoutLimitBytes: options.todoStdoutLimitBytes,
    todoTimeoutMs: options.todoTimeoutMs,
    useKanbanTodoBackend: options.useKanbanTodoBackend,
    useLocalAutomationBackend: options.useLocalAutomationBackend,
    useLocalTodoBackend: options.useLocalTodoBackend,
  });

  return Object.freeze({
    bridgeHostKey,
    runBridgeHost,
    runCronBridge: asFunction(localBridgeWrapperService.runCronBridge, () => {}),
    runDirectoryBridge: asFunction(localBridgeWrapperService.runDirectoryBridge, () => {}),
    runProcessText: (...args) => localProcessRunnerService.runProcessText(...args),
    runTodoBridge: asFunction(localBridgeWrapperService.runTodoBridge, () => {}),
  });
}

module.exports = {
  createLocalBridgeRuntimeService,
};
