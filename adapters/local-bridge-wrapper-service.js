"use strict";

const { automationBackendStatus } = require("./mobile-runtime-backend-policy-service");

const TODO_BRIDGE_ENV_NAMES = Object.freeze([
  "HERMES_WEB_TODO_PLUGIN_NAME",
  "HERMES_WEB_TODO_PLUGIN_PATH",
]);

const CRON_BRIDGE_ENV_NAMES = Object.freeze([
  "HERMES_WEB_CRON_JOBS_PATH",
  "HERMES_CRON_JOBS_PATH",
  "HERMES_WEB_CRON_JOBS_FALLBACK_PATH",
  "HERMES_WEB_CRON_OUTPUT_ROOT",
]);

const DIRECTORY_BRIDGE_ENV_NAMES = Object.freeze([
  "HERMES_WEB_VOLUME1_MOUNT_HELPERS_JSON",
]);

function asFunction(value, fallback) {
  return typeof value === "function" ? value : fallback;
}

function boolFrom(value) {
  if (typeof value === "function") return Boolean(value());
  return Boolean(value);
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function requireFunction(value, label) {
  if (typeof value !== "function") throw new Error(`${label} is required`);
  return value;
}

function createLocalBridgeWrapperService(options = {}) {
  const bridgeCommandProvider = options.bridgeCommandProvider || null;
  const spawn = options.spawn;
  const compactText = options.compactText;
  const runBridgeHost = asFunction(options.runBridgeHost, null);
  const bridgeHostEnabled = options.bridgeHostEnabled !== undefined
    ? () => boolFrom(options.bridgeHostEnabled)
    : () => Boolean(options.bridgeHostUrl);

  const useKanbanTodoBackend = asFunction(options.useKanbanTodoBackend, () => false);
  const useLocalTodoBackend = asFunction(options.useLocalTodoBackend, () => false);
  const useLocalAutomationBackend = asFunction(options.useLocalAutomationBackend, () => false);
  const runLocalTodoBridge = asFunction(options.runLocalTodoBridge, null);
  const runLocalCronBridge = asFunction(options.runLocalCronBridge, null);
  const kanbanTodoBridge = options.kanbanTodoBridge || null;
  const automationBackend = String(options.automationBackend || "").trim().toLowerCase();

  const todoTimeoutMs = positiveNumber(options.todoTimeoutMs, 15000);
  const cronTimeoutMs = positiveNumber(options.cronTimeoutMs, 15000);
  const directoryTimeoutMs = positiveNumber(options.directoryTimeoutMs, 15000);
  const todoStdoutLimitBytes = positiveNumber(options.todoStdoutLimitBytes, 50_000_000);
  const cronStdoutLimitBytes = positiveNumber(options.cronStdoutLimitBytes, 2_000_000);
  const directoryStdoutLimitBytes = positiveNumber(options.directoryStdoutLimitBytes, 4_000_000);

  function runHostBridge(kind, payload, timeoutMs) {
    if (!bridgeHostEnabled()) return null;
    return requireFunction(runBridgeHost, "runBridgeHost")(kind, payload, timeoutMs);
  }

  function runPythonJsonBridge(spec, payload) {
    const provider = bridgeCommandProvider || {};
    const python = requireFunction(provider.python, "bridgeCommandProvider.python").bind(provider);
    const runJsonCommand = requireFunction(provider.runJsonCommand, "bridgeCommandProvider.runJsonCommand").bind(provider);
    const commandSpec = python(spec.scriptPath, spec.envNames);
    return runJsonCommand(commandSpec, payload, {
      spawn,
      label: spec.label,
      timeoutMs: spec.timeoutMs,
      stdoutLimitBytes: spec.stdoutLimitBytes,
      compactText,
    });
  }

  function runTodoBridge(payload = {}) {
    if (useKanbanTodoBackend()) return requireFunction(kanbanTodoBridge?.run, "kanbanTodoBridge.run").call(kanbanTodoBridge, payload);
    if (useLocalTodoBackend()) return requireFunction(runLocalTodoBridge, "runLocalTodoBridge")(payload);
    const hostResult = runHostBridge("todo", payload, todoTimeoutMs);
    if (hostResult) return hostResult;
    return runPythonJsonBridge({
      scriptPath: options.todoBridgeScript,
      envNames: TODO_BRIDGE_ENV_NAMES,
      label: "Todo bridge",
      timeoutMs: todoTimeoutMs,
      stdoutLimitBytes: todoStdoutLimitBytes,
    }, payload);
  }

  function runCronBridge(payload = {}) {
    if (automationBackend) {
      const backendStatus = automationBackendStatus(automationBackend);
      if (!backendStatus.ok) {
        return {
          ok: false,
          status: backendStatus.status,
          error: backendStatus.error,
          source: { name: backendStatus.backend || automationBackend, available: false },
        };
      }
    }
    if (useLocalAutomationBackend()) return requireFunction(runLocalCronBridge, "runLocalCronBridge")(payload);
    const hostResult = runHostBridge("cron", payload, cronTimeoutMs);
    if (hostResult) return hostResult;
    return runPythonJsonBridge({
      scriptPath: options.cronBridgeScript,
      envNames: CRON_BRIDGE_ENV_NAMES,
      label: "Cron bridge",
      timeoutMs: cronTimeoutMs,
      stdoutLimitBytes: cronStdoutLimitBytes,
    }, payload);
  }

  function runDirectoryBridge(payload = {}) {
    const hostResult = runHostBridge("directory", payload, directoryTimeoutMs);
    if (hostResult) return hostResult;
    return runPythonJsonBridge({
      scriptPath: options.directoryBridgeScript,
      envNames: DIRECTORY_BRIDGE_ENV_NAMES,
      label: "Directory bridge",
      timeoutMs: directoryTimeoutMs,
      stdoutLimitBytes: directoryStdoutLimitBytes,
    }, payload);
  }

  return Object.freeze({
    runCronBridge,
    runDirectoryBridge,
    runTodoBridge,
  });
}

module.exports = {
  CRON_BRIDGE_ENV_NAMES,
  DIRECTORY_BRIDGE_ENV_NAMES,
  TODO_BRIDGE_ENV_NAMES,
  createLocalBridgeWrapperService,
};
