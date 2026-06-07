"use strict";

const { createGatewayRunEventService } = require("./gateway-run-event-service");
const { createGatewayRunLifecycleService } = require("./gateway-run-lifecycle-service");
const { createGatewayRunQueueService } = require("./gateway-run-queue-service");
const { createGatewayRunStartService } = require("./gateway-run-start-service");
const { createGatewayRunStreamService } = require("./gateway-run-stream-service");
const { createGatewayRuntimeSubserviceOptionsService } = require("./gateway-runtime-subservice-options-service");

function createGatewayRuntimeCompositionService(deps = {}) {
  let queueService = null;
  let startService = null;
  let streamService = null;
  let eventService = null;
  const lifecycleService = deps.lifecycleService || createGatewayRunLifecycleService();
  const subserviceOptions = deps.subserviceOptionsService || createGatewayRuntimeSubserviceOptionsService(deps);

  function getQueueService() {
    if (!queueService) {
      queueService = createGatewayRunQueueService(subserviceOptions.queueServiceOptions({
        lifecycleService,
        startRunForThread,
      }));
    }
    return queueService;
  }

  function addThreadActiveRun(...args) {
    return getQueueService().addThreadActiveRun(...args);
  }

  function replaceThreadActiveRun(...args) {
    const result = getQueueService().replaceThreadActiveRun(...args);
    const oldRunId = args[1];
    const newRunId = args[2];
    if (oldRunId && newRunId && typeof deps.replaceGatewayRunTarget === "function") {
      deps.replaceGatewayRunTarget(oldRunId, newRunId);
    }
    return result;
  }

  function removeThreadActiveRun(...args) {
    const result = getQueueService().removeThreadActiveRun(...args);
    const runId = args[1];
    const idleStatus = args[2] || "idle";
    if (runId && typeof deps.releaseGatewayRunTarget === "function") {
      deps.releaseGatewayRunTarget(runId, idleStatus);
    }
    return result;
  }

  function taskGroupHasRunningRun(...args) {
    return getQueueService().taskGroupHasRunningRun(...args);
  }

  function nextQueuedRunPairForTaskGroup(...args) {
    return getQueueService().nextQueuedRunPairForTaskGroup(...args);
  }

  function scheduleNextQueuedRunForTaskGroup(...args) {
    return getQueueService().scheduleNextQueuedRunForTaskGroup(...args);
  }

  function getStartService() {
    if (!startService) {
      startService = createGatewayRunStartService(subserviceOptions.startServiceOptions({
        addThreadActiveRun,
        removeThreadActiveRun,
        streamResponse,
      }));
    }
    return startService;
  }

  function startRunForThread(...args) {
    return getStartService().startRunForThread(...args);
  }

  function getStreamService() {
    if (!streamService) {
      streamService = createGatewayRunStreamService(subserviceOptions.streamServiceOptions({
        applyHermesRunEvent,
        lifecycleService,
        markRunCancelled,
        markRunFailed,
      }));
    }
    return streamService;
  }

  function stopRunIds(...args) {
    return getStreamService().stopRunIds(...args);
  }

  function gatewayUrlForRun(...args) {
    return getStreamService().gatewayUrlForRun(...args);
  }

  function gatewayTargetForRun(...args) {
    return getStreamService().gatewayTargetForRun(...args);
  }

  function abortActiveStreamAsFailed(...args) {
    return getStreamService().abortActiveStreamAsFailed(...args);
  }

  function checkActiveStreamLiveness(...args) {
    return getStreamService().checkActiveStreamLiveness(...args);
  }

  function streamResponse(...args) {
    return getStreamService().streamResponse(...args);
  }

  function readResponseEvents(...args) {
    return getStreamService().readResponseEvents(...args);
  }

  function getEventService() {
    if (!eventService) {
      eventService = createGatewayRunEventService(subserviceOptions.eventServiceOptions({
        removeThreadActiveRun,
        replaceThreadActiveRun,
        scheduleNextQueuedRunForTaskGroup,
        startRunForThread,
      }));
    }
    return eventService;
  }

  function applyHermesRunEvent(...args) {
    return getEventService().applyHermesRunEvent(...args);
  }

  function findRunTarget(...args) {
    return getEventService().findRunTarget(...args);
  }

  function extractCompletedOutput(...args) {
    return getEventService().extractCompletedOutput(...args);
  }

  function markRunFailed(...args) {
    return getEventService().markRunFailed(...args);
  }

  function markRunCancelled(...args) {
    return getEventService().markRunCancelled(...args);
  }

  function reconcileDetachedActiveRuns(...args) {
    return getEventService().reconcileDetachedActiveRuns(...args);
  }

  return {
    abortActiveStreamAsFailed,
    addThreadActiveRun,
    applyHermesRunEvent,
    checkActiveStreamLiveness,
    extractCompletedOutput,
    findRunTarget,
    gatewayTargetForRun,
    gatewayUrlForRun,
    lifecycleService,
    markRunCancelled,
    markRunFailed,
    nextQueuedRunPairForTaskGroup,
    readResponseEvents,
    reconcileDetachedActiveRuns,
    removeThreadActiveRun,
    replaceThreadActiveRun,
    scheduleNextQueuedRunForTaskGroup,
    startRunForThread,
    stopRunIds,
    streamResponse,
    taskGroupHasRunningRun,
  };
}

module.exports = {
  createGatewayRuntimeCompositionService,
};
