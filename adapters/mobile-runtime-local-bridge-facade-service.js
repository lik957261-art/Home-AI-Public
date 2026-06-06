"use strict";

function createMobileRuntimeLocalBridgeFacadeService(options = {}) {
  const createLocalBridgeRuntimeService = options.createLocalBridgeRuntimeService;
  if (typeof createLocalBridgeRuntimeService !== "function") {
    throw new Error("MobileRuntimeLocalBridgeFacadeService requires createLocalBridgeRuntimeService");
  }

  let localBridgeRuntimeService = null;

  function getLocalBridgeRuntimeService() {
    if (!localBridgeRuntimeService) {
      localBridgeRuntimeService = createLocalBridgeRuntimeService({
        bridgeCommandProvider: options.bridgeCommandProvider,
        bridgeHostKeyPath: options.bridgeHostKeyPath,
        bridgeHostUrl: options.bridgeHostUrl,
        compactText: options.compactText,
        createAutomationId: options.createAutomationId,
        cronBridgeScript: options.cronBridgeScript,
        cronStdoutLimitBytes: options.cronStdoutLimitBytes,
        cronTimeoutMs: options.cronTimeoutMs,
        directoryBridgeScript: options.directoryBridgeScript,
        directoryStdoutLimitBytes: options.directoryStdoutLimitBytes,
        directoryTimeoutMs: options.directoryTimeoutMs,
        env: options.env,
        formatLocalDateTime: options.formatLocalDateTime,
        kanbanTodoBridge: options.kanbanTodoBridge,
        localAutomationStorePath: options.localAutomationStorePath,
        localTodoStorePath: options.localTodoStorePath,
        mobileSqliteStore: options.mobileSqliteStore,
        nowIso: options.nowIso,
        readJsonStore: options.readJsonStore,
        sortJobs: options.sortJobs,
        spawn: options.spawn,
        todoBridgeScript: options.todoBridgeScript,
        todoStdoutLimitBytes: options.todoStdoutLimitBytes,
        todoTimeoutMs: options.todoTimeoutMs,
        useKanbanTodoBackend: options.useKanbanTodoBackend,
        useLocalAutomationBackend: options.useLocalAutomationBackend,
        useLocalTodoBackend: options.useLocalTodoBackend,
        useSqliteServiceStore: options.useSqliteServiceStore,
        writeJsonStore: options.writeJsonStore,
      });
    }
    return localBridgeRuntimeService;
  }

  function runTodoBridge(payload) {
    return getLocalBridgeRuntimeService().runTodoBridge(payload);
  }

  function runCronBridge(payload) {
    return getLocalBridgeRuntimeService().runCronBridge(payload);
  }

  function runDirectoryBridge(payload) {
    return getLocalBridgeRuntimeService().runDirectoryBridge(payload);
  }

  function runProcessText(command, args = [], runOptions = {}) {
    return getLocalBridgeRuntimeService().runProcessText(command, args, runOptions);
  }

  return Object.freeze({
    getLocalBridgeRuntimeService,
    runCronBridge,
    runDirectoryBridge,
    runProcessText,
    runTodoBridge,
  });
}

module.exports = {
  createMobileRuntimeLocalBridgeFacadeService,
};
