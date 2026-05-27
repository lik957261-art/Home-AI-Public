"use strict";

const { createGatewayRunEventService } = require("./gateway-run-event-service");
const { createGatewayRunLifecycleService } = require("./gateway-run-lifecycle-service");
const { createGatewayRunQueueService } = require("./gateway-run-queue-service");
const { createGatewayRunStartService } = require("./gateway-run-start-service");
const { createGatewayRunStreamService } = require("./gateway-run-stream-service");

function required(name) {
  return () => {
    throw new Error(`Missing gateway runtime dependency: ${name}`);
  };
}

function createGatewayRuntimeCompositionService(deps = {}) {
  let queueService = null;
  let startService = null;
  let streamService = null;
  let eventService = null;
  const lifecycleService = deps.lifecycleService || createGatewayRunLifecycleService();

  function getQueueService() {
    if (!queueService) {
      queueService = createGatewayRunQueueService({
        gatewayRunLifecycleService: lifecycleService,
        nowIso: deps.nowIso,
        saveState: deps.saveState,
        broadcast: deps.broadcast,
        compactMessage: deps.compactMessage,
        threadSummary: deps.threadSummary,
        startHermesRun: startRunForThread,
      });
    }
    return queueService;
  }

  function addThreadActiveRun(...args) {
    return getQueueService().addThreadActiveRun(...args);
  }

  function replaceThreadActiveRun(...args) {
    return getQueueService().replaceThreadActiveRun(...args);
  }

  function removeThreadActiveRun(...args) {
    return getQueueService().removeThreadActiveRun(...args);
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
      startService = createGatewayRunStartService({
        accessPolicyHardeningOptionsForGatewayRouting: deps.accessPolicyHardeningOptionsForGatewayRouting,
        addThreadEvent: deps.addThreadEvent,
        addThreadActiveRun,
        assertRunConcurrencyCapacity: deps.assertRunConcurrencyCapacity,
        buildAccessPolicy: deps.buildAccessPolicy,
        buildConversationHistory: deps.buildConversationHistory,
        buildHermesInstructions: deps.buildHermesInstructions,
        chooseGatewayRunTarget: deps.chooseGatewayRunTarget,
        compactMessage: deps.compactMessage,
        dedupe: deps.dedupe,
        effectiveProjectForThread: deps.effectiveProjectForThread,
        findWorkspace: deps.findWorkspace,
        gatewayConversationId: deps.gatewayConversationId,
        gatewaySkillRoutingForWorkspace: deps.gatewaySkillRoutingForWorkspace,
        groupChatDeliveryRootForThread: deps.groupChatDeliveryRootForThread,
        groupChatTaskGroupId: deps.groupChatTaskGroupId,
        makePublicTaskId: deps.makePublicTaskId,
        mergeAccessPolicyOverride: deps.mergeAccessPolicyOverride,
        mkdirSync: deps.mkdirSync,
        nowIso: deps.nowIso,
        nowMs: deps.nowMs,
        projectForTaskDirectoryAttachment: deps.projectForTaskDirectoryAttachment,
        removeThreadActiveRun,
        routeRunToolsets: deps.routeRunToolsets,
        runExplicitWebSearchMaxCalls: deps.runExplicitWebSearchMaxCalls,
        runWebSearchMaxCalls: deps.runWebSearchMaxCalls,
        selectRunToolsetsWithModel: deps.selectRunToolsetsWithModel,
        sanitizePolicy: deps.sanitizePolicy,
        saveState: deps.saveState,
        singleWindowProjectId: deps.singleWindowProjectId,
        streamResponse,
        taskDirectoryAttachmentForMessage: deps.taskDirectoryAttachmentForMessage,
        threadSummary: deps.threadSummary,
        toolSchemaEpoch: deps.toolSchemaEpoch,
        windowsPathToWsl: deps.windowsPathToWsl,
        ensureGroupChatSharedArtifactCopies: deps.ensureGroupChatSharedArtifactCopies,
        broadcast: deps.broadcast,
      });
    }
    return startService;
  }

  function startRunForThread(...args) {
    return getStartService().startRunForThread(...args);
  }

  function getStreamService() {
    if (!streamService) {
      streamService = createGatewayRunStreamService({
        activeStreams: deps.activeStreams,
        apiTimeoutMs: deps.apiTimeoutMs,
        dedupe: deps.dedupe,
        gatewayPool: deps.gatewayPool,
        gatewayUrlForRun: deps.gatewayUrlForRun || required("gatewayUrlForRun"),
        livenessDecisionAfterCheck: lifecycleService.livenessDecisionAfterCheck,
        logger: deps.logger || console,
        markRunCancelled,
        markRunFailed,
        nowMs: deps.nowMs,
        onHermesRunEvent: applyHermesRunEvent,
        modelFirstByteWarningMs: deps.modelFirstByteWarningMs,
        runLivenessCheckAfterMs: deps.runLivenessCheckAfterMs,
        runLivenessCheckIntervalMs: deps.runLivenessCheckIntervalMs,
        runLivenessStaleAfterMs: deps.runLivenessStaleAfterMs,
        runStartTimeoutMs: deps.runStartTimeoutMs,
        singleGatewayRunner: deps.singleGatewayRunner,
        webSearchMaxCalls: deps.runWebSearchMaxCalls,
      });
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
      eventService = createGatewayRunEventService({
        activeStreams: deps.activeStreams,
        addThreadEvent: deps.addThreadEvent,
        appendBounded: deps.appendBounded,
        broadcast: deps.broadcast,
        compactFullContent: deps.compactFullContent,
        compactMessage: deps.compactMessage,
        enqueueExternalDeliveryForTerminalMessage: deps.enqueueExternalDeliveryForTerminalMessage,
        isOrdinaryToolSchemaElevationRequest: deps.isOrdinaryToolSchemaElevationRequest,
        maxMessageChars: deps.maxMessageChars,
        modelPermissionApprovalRequest: deps.modelPermissionApprovalRequest,
        nowIso: deps.nowIso,
        nowMs: deps.nowMs,
        notifyTaskTerminal: deps.notifyTaskTerminal,
        registerArtifactsFromText: deps.registerArtifactsFromText,
        removeThreadActiveRun,
        replaceThreadActiveRun,
        saveState: deps.saveState,
        scheduleNextQueuedRunForTaskGroup,
        state: deps.state,
        streamingSaveThrottleMs: deps.streamingSaveThrottleMs,
        stripPermissionApprovalMarkers: deps.stripPermissionApprovalMarkers,
        supplementGatewayUsage: deps.supplementGatewayUsage,
        threadSummary: deps.threadSummary,
        topicContextCompactionService: deps.topicContextCompactionService,
      });
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
