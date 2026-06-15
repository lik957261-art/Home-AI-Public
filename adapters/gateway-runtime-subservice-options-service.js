"use strict";

function required(name) {
  return () => {
    throw new Error(`Missing gateway runtime dependency: ${name}`);
  };
}

function createGatewayRuntimeSubserviceOptionsService(deps = {}) {
  function queueServiceOptions(controllers = {}) {
    return {
      gatewayRunLifecycleService: controllers.lifecycleService,
      nowIso: deps.nowIso,
      saveState: deps.saveState,
      broadcast: deps.broadcast,
      compactMessage: deps.compactMessage,
      threadSummary: deps.threadSummary,
      startHermesRun: controllers.startRunForThread,
    };
  }

  function startServiceOptions(controllers = {}) {
    return {
      accessPolicyHardeningOptionsForGatewayRouting: deps.accessPolicyHardeningOptionsForGatewayRouting,
      addThreadEvent: deps.addThreadEvent,
      addThreadActiveRun: controllers.addThreadActiveRun,
      assertRunConcurrencyCapacity: deps.assertRunConcurrencyCapacity,
      buildAccessPolicy: deps.buildAccessPolicy,
      buildConversationHistory: deps.buildConversationHistory,
      buildHermesInstructions: deps.buildHermesInstructions,
      buildPluginCapabilityContext: deps.buildPluginCapabilityContext,
      chooseGatewayRunTarget: deps.chooseGatewayRunTarget,
      compactMessage: deps.compactMessage,
      dedupe: deps.dedupe,
      effectiveProjectForThread: deps.effectiveProjectForThread,
      findWorkspace: deps.findWorkspace,
      gatewayHealthDiagnosticService: deps.gatewayHealthDiagnosticService,
      gatewayConversationId: deps.gatewayConversationId,
      gatewaySkillRoutingForWorkspace: deps.gatewaySkillRoutingForWorkspace,
      groupChatDeliveryRootForThread: deps.groupChatDeliveryRootForThread,
      groupChatTaskGroupId: deps.groupChatTaskGroupId,
      loadRequiredSkillPreloads: deps.loadRequiredSkillPreloads,
      makePublicTaskId: deps.makePublicTaskId,
      mergeAccessPolicyOverride: deps.mergeAccessPolicyOverride,
      mkdirSync: deps.mkdirSync,
      nowIso: deps.nowIso,
      nowMs: deps.nowMs,
      projectForTaskDirectoryAttachment: deps.projectForTaskDirectoryAttachment,
      removeThreadActiveRun: controllers.removeThreadActiveRun,
      routeRunToolsets: deps.routeRunToolsets,
      runExplicitWebSearchMaxCalls: deps.runExplicitWebSearchMaxCalls,
      runWebSearchMaxCalls: deps.runWebSearchMaxCalls,
      selectRunToolsetsWithModel: deps.selectRunToolsetsWithModel,
      sanitizePolicy: deps.sanitizePolicy,
      saveState: deps.saveState,
      singleWindowProjectId: deps.singleWindowProjectId,
      streamResponse: controllers.streamResponse,
      taskDirectoryAttachmentForMessage: deps.taskDirectoryAttachmentForMessage,
      threadSummary: deps.threadSummary,
      toolSchemaEpoch: deps.toolSchemaEpoch,
      windowsPathToWsl: deps.windowsPathToWsl,
      ensureGroupChatSharedArtifactCopies: deps.ensureGroupChatSharedArtifactCopies,
      broadcast: deps.broadcast,
    };
  }

  function streamServiceOptions(controllers = {}) {
    return {
      activeStreams: deps.activeStreams,
      apiTimeoutMs: deps.apiTimeoutMs,
      dedupe: deps.dedupe,
      gatewayPool: deps.gatewayPool,
      gatewayUrlForRun: deps.gatewayUrlForRun || required("gatewayUrlForRun"),
      livenessDecisionAfterCheck: controllers.lifecycleService?.livenessDecisionAfterCheck,
      logger: deps.logger || console,
      markRunCancelled: controllers.markRunCancelled,
      markRunFailed: controllers.markRunFailed,
      nowMs: deps.nowMs,
      onHermesRunEvent: controllers.applyHermesRunEvent,
      modelFirstByteWarningMs: deps.modelFirstByteWarningMs,
      runLivenessCheckAfterMs: deps.runLivenessCheckAfterMs,
      runLivenessCheckIntervalMs: deps.runLivenessCheckIntervalMs,
      runLivenessStaleAfterMs: deps.runLivenessStaleAfterMs,
      runStartTimeoutMs: deps.runStartTimeoutMs,
      singleGatewayRunner: deps.singleGatewayRunner,
      webSearchMaxCalls: deps.runWebSearchMaxCalls,
    };
  }

  function eventServiceOptions(controllers = {}) {
    return {
      activeStreams: deps.activeStreams,
      addThreadEvent: deps.addThreadEvent,
      appendBounded: deps.appendBounded,
      broadcast: deps.broadcast,
      compactFullContent: deps.compactFullContent,
      compactMessage: deps.compactMessage,
      enqueueExternalDeliveryForTerminalMessage: deps.enqueueExternalDeliveryForTerminalMessage,
      gatewayHealthDiagnosticService: deps.gatewayHealthDiagnosticService,
      isOrdinaryToolSchemaElevationRequest: deps.isOrdinaryToolSchemaElevationRequest,
      maxMessageChars: deps.maxMessageChars,
      modelPermissionApprovalRequest: deps.modelPermissionApprovalRequest,
      nowIso: deps.nowIso,
      nowMs: deps.nowMs,
      notifyTaskTerminal: deps.notifyTaskTerminal,
      registerArtifactsFromText: deps.registerArtifactsFromText,
      removeThreadActiveRun: controllers.removeThreadActiveRun,
      replaceThreadActiveRun: controllers.replaceThreadActiveRun,
      saveState: deps.saveState,
      scheduleNextQueuedRunForTaskGroup: controllers.scheduleNextQueuedRunForTaskGroup,
      startToolsetEscalationRun: controllers.startRunForThread,
      state: deps.state,
      streamingSaveThrottleMs: deps.streamingSaveThrottleMs,
      stripPermissionApprovalMarkers: deps.stripPermissionApprovalMarkers,
      supplementGatewayUsage: deps.supplementGatewayUsage,
      threadSummary: deps.threadSummary,
      topicContextCompactionService: deps.topicContextCompactionService,
    };
  }

  return Object.freeze({
    eventServiceOptions,
    queueServiceOptions,
    startServiceOptions,
    streamServiceOptions,
  });
}

module.exports = {
  createGatewayRuntimeSubserviceOptionsService,
};
