"use strict";

function createMobileRuntimeWeixinFacadeService(options = {}) {
  const createWeixinRuntimeCompositionService = options.createWeixinRuntimeCompositionService;
  if (typeof createWeixinRuntimeCompositionService !== "function") {
    throw new Error("MobileRuntimeWeixinFacadeService requires createWeixinRuntimeCompositionService");
  }

  let weixinRuntimeCompositionService = null;

  function getWeixinRuntimeCompositionService() {
    if (!weixinRuntimeCompositionService) {
      weixinRuntimeCompositionService = createWeixinRuntimeCompositionService({
        attachmentContextWindowMs: options.attachmentContextWindowMs,
        authCanAccessWorkspace: options.authCanAccessWorkspace,
        bridgeFileBuffer: options.bridgeFileBuffer,
        broadcast: options.broadcast,
        chatGroupMemberWorkspaceIds: options.chatGroupMemberWorkspaceIds,
        classifyMaintenanceIntent: options.classifyMaintenanceIntent,
        compactMessage: options.compactMessage,
        compactText: options.compactText,
        compactThread: options.compactThread,
        dataDir: options.dataDir,
        deliveryId: options.deliveryId,
        egressDecide: options.egressDecide,
        egressPolicyProvider: options.egressPolicyProvider,
        ensureThreadForEvent: options.ensureThreadForEvent,
        ensureWeixinSingleWindowThread: options.ensureWeixinSingleWindowThread,
        findExistingIngressEvent: options.findExistingIngressEvent,
        findThreadForAuth: options.findThreadForAuth,
        findWorkspace: options.findWorkspace,
        forwardMarkdownMaxBytes: options.forwardMarkdownMaxBytes,
        hashValue: options.hashValue,
        ingressKeyPaths: options.ingressKeyPaths,
        isOwnerAuth: options.isOwnerAuth,
        isStaleHttpToolAvailabilityClaim: options.isStaleHttpToolAvailabilityClaim,
        isStaleImageToolAvailabilityClaim: options.isStaleImageToolAvailabilityClaim,
        isWeixinSingleWindowThread: options.isWeixinSingleWindowThread,
        makeId: options.makeId,
        maxMessageChars: options.maxMessageChars,
        mimeFor: options.mimeFor,
        normalizeExternalDelivery: options.normalizeExternalDelivery,
        normalizeExternalIngress: options.normalizeExternalIngress,
        normalizeLocalPath: options.normalizeLocalPath,
        nowIso: options.nowIso,
        removeThreadActiveRun: options.removeThreadActiveRun,
        resolveArtifactForRequest: options.resolveArtifactForRequest,
        resolveAuthorizedCronDeliverableFile: options.resolveAuthorizedCronDeliverableFile,
        resolveAuthorizedCronOutputFile: options.resolveAuthorizedCronOutputFile,
        resolveFileForBrowserRequest: options.resolveFileForBrowserRequest,
        resolveKanbanOutputFile: options.resolveKanbanOutputFile,
        retryBaseMs: options.retryBaseMs,
        retryLimit: options.retryLimit,
        retryMaxMs: options.retryMaxMs,
        runConcurrencyError: options.runConcurrencyError,
        safeFileName: options.safeFileName,
        saveState: options.saveState,
        sendJson: options.sendJson,
        senderInfoForWorkspace: options.senderInfoForWorkspace,
        singleWindowChatTaskGroupId: options.singleWindowChatTaskGroupId,
        spawnSync: options.spawnSync,
        startRunForThread: options.startRunForThread,
        state: options.state,
        taskGroupHasRunningRun: options.taskGroupHasRunningRun,
        taskGroupId: options.taskGroupId,
        threadAccessibleToAuth: options.threadAccessibleToAuth,
        threadSummary: options.threadSummary,
        weixinIngressProvider: options.weixinIngressProvider,
        workspaceLabel: options.workspaceLabel,
      });
    }
    return weixinRuntimeCompositionService;
  }

  function callService(methodName, args) {
    return getWeixinRuntimeCompositionService()[methodName](...args);
  }

  return Object.freeze({
    ackWeixinOutboundDelivery: (...args) => callService("ackWeixinOutboundDelivery", args),
    collectRecentWeixinForwardTargets: (...args) => callService("collectRecentWeixinForwardTargets", args),
    consumeWeixinPendingAttachmentMessages: (...args) => callService("consumeWeixinPendingAttachmentMessages", args),
    createWeixinFileForwardDelivery: (...args) => callService("createWeixinFileForwardDelivery", args),
    enqueueExternalDeliveryForTerminalMessage: (...args) => callService("enqueueExternalDeliveryForTerminalMessage", args),
    getWeixinRuntimeCompositionService,
    isWeixinDeliveryRetryable: (...args) => callService("isWeixinDeliveryRetryable", args),
    isWeixinInboundWakeRequiredFailure: (...args) => callService("isWeixinInboundWakeRequiredFailure", args),
    pendingWeixinOutboundDeliveries: (...args) => callService("pendingWeixinOutboundDeliveries", args),
    publicArtifactForWeixinForward: (...args) => callService("publicArtifactForWeixinForward", args),
    publicWeixinOutboundDelivery: (...args) => callService("publicWeixinOutboundDelivery", args),
    redactWeixinRunErrorText: (...args) => callService("redactWeixinRunErrorText", args),
    requireWeixinIngress: (...args) => callService("requireWeixinIngress", args),
    resolveFileFromSourceUrlForRequest: (...args) => callService("resolveFileFromSourceUrlForRequest", args),
    resolveWeixinForwardFile: (...args) => callService("resolveWeixinForwardFile", args),
    resolveWeixinForwardTarget: (...args) => callService("resolveWeixinForwardTarget", args),
    startWeixinIngressEvent: (...args) => callService("startWeixinIngressEvent", args),
    userFacingWeixinRunError: (...args) => callService("userFacingWeixinRunError", args),
    wakeWeixinOutboundDeliveriesForInboundEvent: (...args) => callService("wakeWeixinOutboundDeliveriesForInboundEvent", args),
    weixinDeliveryMatchesInboundEvent: (...args) => callService("weixinDeliveryMatchesInboundEvent", args),
    weixinDeliveryRetryCount: (...args) => callService("weixinDeliveryRetryCount", args),
    weixinDeliveryRetryDelayMs: (...args) => callService("weixinDeliveryRetryDelayMs", args),
    weixinForwardTargetsForWorkspace: (...args) => callService("weixinForwardTargetsForWorkspace", args),
    weixinIngressInstructions: (...args) => callService("weixinIngressInstructions", args),
    weixinIngressIsAttachmentOnlyEvent: (...args) => callService("weixinIngressIsAttachmentOnlyEvent", args),
    weixinTargetFromWorkspace: (...args) => callService("weixinTargetFromWorkspace", args),
  });
}

module.exports = {
  createMobileRuntimeWeixinFacadeService,
};
