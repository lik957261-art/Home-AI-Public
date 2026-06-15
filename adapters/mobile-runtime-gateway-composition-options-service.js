"use strict";

function valueFrom(value, fallback = {}) {
  if (typeof value === "function") return value() || fallback;
  return value || fallback;
}

function requireFunction(source, name) {
  const value = source[name];
  if (typeof value !== "function") {
    throw new Error(`mobile runtime gateway composition options requires ${name}`);
  }
  return value;
}

function requireObject(source, name) {
  const value = source[name];
  if (!value || typeof value !== "object") {
    throw new Error(`mobile runtime gateway composition options requires ${name}`);
  }
  return value;
}

function optionValue(source, key, fallback) {
  return source[key] !== undefined ? source[key] : fallback;
}

function createMobileRuntimeGatewayCompositionOptionsService(options = {}) {
  const constants = () => valueFrom(options.constants);
  const delegates = () => valueFrom(options.delegates);
  const runtime = () => valueFrom(options.runtime);
  const services = () => valueFrom(options.services);

  function gatewayRuntimeCompositionOptions() {
    const c = constants();
    const runtimeEnv = c.runtimeEnv || {};
    const d = delegates();
    const r = runtime();
    const s = services();
    const fs = requireObject(r, "fs");
    const pluginCapabilityActivationService = requireObject(s, "pluginCapabilityActivationService");
    const pluginRequiredSkillPreloadService = requireObject(s, "pluginRequiredSkillPreloadService");
    const webPushDeliveryService = requireObject(s, "webPushDeliveryService");
    const getRuntimeStateThreadService = requireFunction(s, "getRuntimeStateThreadService");
    const getSemanticDirectoryAttachmentService = requireFunction(s, "getSemanticDirectoryAttachmentService");
    const gatewayRunToolsetRoutingService = requireObject(s, "gatewayRunToolsetRoutingService");

    return {
      accessPolicyHardeningOptionsForGatewayRouting: d.accessPolicyHardeningOptionsForGatewayRouting,
      activeStreams: r.activeStreams,
      addThreadEvent: d.addThreadEvent,
      apiTimeoutMs: optionValue(c, "apiTimeoutMs", runtimeEnv.HERMES_API_TIMEOUT_MS),
      appendBounded: d.appendBounded,
      assertRunConcurrencyCapacity: d.assertRunConcurrencyCapacity,
      buildAccessPolicy: d.buildAccessPolicy,
      buildConversationHistory: d.buildConversationHistory,
      buildHermesInstructions: d.buildHermesInstructions,
      buildPluginCapabilityContext: (...args) => pluginCapabilityActivationService.buildRunPluginCapabilityContext(...args),
      broadcast: d.broadcast,
      chooseGatewayRunTarget: d.chooseGatewayRunTarget,
      compactFullContent: d.compactFullContent,
      compactMessage: d.compactMessage,
      dedupe: d.dedupe,
      effectiveProjectForThread: d.effectiveProjectForThread,
      ensureGroupChatSharedArtifactCopies: d.ensureGroupChatSharedArtifactCopies,
      enqueueExternalDeliveryForTerminalMessage: d.enqueueExternalDeliveryForTerminalMessage,
      findWorkspace: d.findWorkspace,
      gatewayHealthDiagnosticService: s.gatewayHealthDiagnosticService || null,
      gatewayConversationId: d.gatewayConversationId,
      gatewayPool: d.gatewayPool,
      gatewaySkillRoutingForWorkspace: d.gatewaySkillRoutingForWorkspace,
      gatewayUrlForRun: (...args) => getRuntimeStateThreadService().storedGatewayUrlForRun(...args),
      groupChatDeliveryRootForThread: d.groupChatDeliveryRootForThread,
      groupChatTaskGroupId: optionValue(c, "groupChatTaskGroupId", runtimeEnv.SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID),
      isOrdinaryToolSchemaElevationRequest: d.isOrdinaryToolSchemaElevationRequest,
      loadRequiredSkillPreloads: (...args) => pluginRequiredSkillPreloadService.preloadRequiredSkills(...args),
      logger: r.logger || console,
      makePublicTaskId: d.makePublicTaskId,
      maxMessageChars: optionValue(c, "maxMessageChars", runtimeEnv.MAX_MESSAGE_CHARS),
      mergeAccessPolicyOverride: d.mergeAccessPolicyOverride,
      mkdirSync: (targetPath, mkdirOptions) => fs.mkdirSync(targetPath, mkdirOptions),
      modelFirstByteWarningMs: optionValue(c, "modelFirstByteWarningMs", runtimeEnv.RUN_MODEL_FIRST_BYTE_WARNING_MS),
      modelPermissionApprovalRequest: d.modelPermissionApprovalRequest,
      notifyTaskTerminal: (...args) => webPushDeliveryService.notifyTaskTerminal(...args),
      nowIso: d.nowIso,
      nowMs: d.nowMs,
      projectForTaskDirectoryAttachment: (...args) => getSemanticDirectoryAttachmentService().projectForTaskDirectoryAttachment(...args),
      registerArtifactsFromText: d.registerArtifactsFromText,
      releaseGatewayRunTarget: d.releaseGatewayRunTarget,
      replaceGatewayRunTarget: d.replaceGatewayRunTarget,
      routeRunToolsets: (...args) => gatewayRunToolsetRoutingService.routePolicy(...args),
      runExplicitWebSearchMaxCalls: optionValue(c, "runExplicitWebSearchMaxCalls", runtimeEnv.RUN_EXPLICIT_WEB_SEARCH_MAX_CALLS),
      runLivenessCheckAfterMs: optionValue(c, "runLivenessCheckAfterMs", runtimeEnv.RUN_LIVENESS_CHECK_AFTER_MS),
      runLivenessCheckIntervalMs: optionValue(c, "runLivenessCheckIntervalMs", runtimeEnv.RUN_LIVENESS_CHECK_INTERVAL_MS),
      runLivenessStaleAfterMs: optionValue(c, "runLivenessStaleAfterMs", runtimeEnv.RUN_LIVENESS_STALE_AFTER_MS),
      runStartTimeoutMs: optionValue(c, "runStartTimeoutMs", runtimeEnv.RUN_START_TIMEOUT_MS),
      runWebSearchMaxCalls: optionValue(c, "runWebSearchMaxCalls", runtimeEnv.RUN_WEB_SEARCH_MAX_CALLS),
      sanitizePolicy: d.sanitizePolicy,
      saveState: d.saveState,
      selectRunToolsetsWithModel: c.gatewayModelPreflightEnabled
        ? ((...args) => requireObject(s, "gatewayRunModelToolsetSelectionService").selectToolsetsForRun(...args))
        : null,
      singleGatewayRunner: d.singleGatewayRunner,
      singleWindowProjectId: optionValue(c, "singleWindowProjectId", runtimeEnv.SINGLE_WINDOW_PROJECT_ID),
      state: r.state,
      streamingSaveThrottleMs: optionValue(c, "streamingSaveThrottleMs", runtimeEnv.RUN_STREAMING_SAVE_THROTTLE_MS),
      stripPermissionApprovalMarkers: d.stripPermissionApprovalMarkers,
      supplementGatewayUsage: d.supplementGatewayUsage,
      taskDirectoryAttachmentForMessage: (...args) => getSemanticDirectoryAttachmentService().taskDirectoryAttachmentForMessage(...args),
      threadSummary: d.threadSummary,
      toolSchemaEpoch: c.toolSchemaEpoch,
      topicContextCompactionService: optionValue(c, "contextCompactionEnabled", runtimeEnv.CONTEXT_COMPACTION_ENABLED) ? s.topicContextCompactionService : null,
      windowsPathToWsl: d.windowsPathToWsl,
    };
  }

  return Object.freeze({
    gatewayRuntimeCompositionOptions,
  });
}

module.exports = {
  createMobileRuntimeGatewayCompositionOptionsService,
};
