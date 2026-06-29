"use strict";

function requireDependency(options, name) {
  const value = options[name];
  if (value === undefined || value === null) {
    throw new Error(`mobile runtime gateway context facade requires ${name}`);
  }
  return value;
}

function requireFunction(options, name) {
  const value = requireDependency(options, name);
  if (typeof value !== "function") {
    throw new Error(`mobile runtime gateway context facade requires ${name}`);
  }
  return value;
}

function createMobileRuntimeGatewayContextFacadeService(options = {}) {
  const conversationHistoryService = requireDependency(options, "conversationHistoryService");
  const gatewayRunInstructionService = requireDependency(options, "gatewayRunInstructionService");
  const getGatewayRuntimeCompositionService = requireFunction(options, "getGatewayRuntimeCompositionService");
  const gatewayUsageTelemetry = requireFunction(options, "gatewayUsageTelemetry");

  function policyHasToolset(policy = {}, toolset = "") {
    return gatewayRunInstructionService.policyHasToolset(policy, toolset);
  }

  function isOrdinaryToolSchemaElevationRequest(approvalRequest, output, message = {}) {
    if (!approvalRequest?.elevationRequired) return false;
    const scope = String(approvalRequest.elevationScope || "").trim();
    if (scope && scope !== "owner_high_privilege") return false;
    const text = String(output || "");
    const runPolicy = message?.runOptions?.access_policy_context || message?.runOptions?.accessPolicyContext || {};
    return (
      (policyHasToolset(runPolicy, "image_gen") && conversationHistoryService.isStaleImageToolAvailabilityClaim(text))
      || (policyHasToolset(runPolicy, "http") && conversationHistoryService.isStaleHttpToolAvailabilityClaim(text))
      || (policyHasToolset(runPolicy, "file") && conversationHistoryService.isStaleDocxToolAvailabilityClaim(text))
      || (policyHasToolset(runPolicy, "file") && conversationHistoryService.isStaleAudioToolAvailabilityClaim(text))
      || (policyHasToolset(runPolicy, "file") && conversationHistoryService.isStaleArchiveToolAvailabilityClaim(text))
    );
  }

  function gatewayTargetForRun(runId) {
    return getGatewayRuntimeCompositionService().gatewayTargetForRun(runId);
  }

  function supplementGatewayUsage(usage, runId, message = {}) {
    const target = gatewayTargetForRun(runId);
    return gatewayUsageTelemetry().supplementUsage(usage, Object.assign({}, target, {
      responseId: message.runId || runId,
      runId,
      gatewayProfile: message.gatewayProfile || target.profile || "",
      gatewayName: message.gatewayName || target.name || "",
      gatewayUrl: message.gatewayUrl || target.apiBase || "",
    }));
  }

  return {
    buildConversationHistory: (...args) => conversationHistoryService.buildConversationHistory(...args),
    buildHermesInstructions: (...args) => gatewayRunInstructionService.buildHermesInstructions(...args),
    callableFunctionHintsForToolsets: (...args) => gatewayRunInstructionService.callableFunctionHintsForToolsets(...args),
    compactConversationHistory: (...args) => conversationHistoryService.compactConversationHistory(...args),
    conversationHistoryContentForMessage: (...args) => conversationHistoryService.conversationHistoryContentForMessage(...args),
    currentToolSchemaOverrideInstructions: (...args) => gatewayRunInstructionService.currentToolSchemaOverrideInstructions(...args),
    deriveTitle: (...args) => conversationHistoryService.deriveTitle(...args),
    extractCompletedOutput: (...args) => getGatewayRuntimeCompositionService().extractCompletedOutput(...args),
    findRunTarget: (...args) => getGatewayRuntimeCompositionService().findRunTarget(...args),
    formatAccessPolicyInstructionSummary: (...args) => gatewayRunInstructionService.formatAccessPolicyInstructionSummary(...args),
    gatewayConversationId: (...args) => gatewayRunInstructionService.gatewayConversationId(...args),
    gatewayTargetForRun,
    isOrdinaryToolSchemaElevationRequest,
    isStaleAudioToolAvailabilityClaim: (...args) => conversationHistoryService.isStaleAudioToolAvailabilityClaim(...args),
    isStaleArchiveToolAvailabilityClaim: (...args) => conversationHistoryService.isStaleArchiveToolAvailabilityClaim(...args),
    isStaleDocxToolAvailabilityClaim: (...args) => conversationHistoryService.isStaleDocxToolAvailabilityClaim(...args),
    isStaleHttpToolAvailabilityClaim: (...args) => conversationHistoryService.isStaleHttpToolAvailabilityClaim(...args),
    isStaleImageToolAvailabilityClaim: (...args) => conversationHistoryService.isStaleImageToolAvailabilityClaim(...args),
    isStalePptxGenerationToolAvailabilityClaim: (...args) => conversationHistoryService.isStalePptxGenerationToolAvailabilityClaim(...args),
    isToolUnavailableClaimText: (...args) => conversationHistoryService.isToolUnavailableClaimText(...args),
    policyHasToolset,
    stripDirectoryAliasLinesForChatHistory: (...args) => conversationHistoryService.stripDirectoryAliasLinesForChatHistory(...args),
    supplementGatewayUsage,
  };
}

module.exports = {
  createMobileRuntimeGatewayContextFacadeService,
};
