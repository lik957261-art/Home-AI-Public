"use strict";

const {
  cleanString,
  mergeSkillEntries,
  skillPreloadRunOptionsMetadata,
} = require("./gateway-run-request-builder-service");

function createGatewayRunStartAssistantOptionsService(options = {}) {
  const toolSchemaEpoch = cleanString(options.toolSchemaEpoch);

  function applyAssistantRunOptions(assistantMessage, request, sourceRunOptions = {}) {
    assistantMessage.runOptions = Object.assign({}, assistantMessage.runOptions || {}, {
      access_policy_context: request.runPolicy,
      gatewayConversation: request.body.conversation,
      toolSchemaEpoch,
    });
    const preloadMetadata = skillPreloadRunOptionsMetadata(request.requiredSkillPreloads);
    if (preloadMetadata.length) {
      assistantMessage.runOptions.requiredSkillPreloads = preloadMetadata;
      assistantMessage.loadedSkills = mergeSkillEntries(assistantMessage.loadedSkills, preloadMetadata);
    }
    if (request.pluginCapabilityContext) {
      assistantMessage.runOptions.activeSchemaSet = request.pluginCapabilityContext.activeSchemaSet;
      assistantMessage.runOptions.pluginCapabilityCatalog = request.pluginCapabilityContext.catalog;
      if (request.pluginCapabilityContext.probeResults?.length) {
        assistantMessage.runOptions.pluginCapabilityProbeResults = request.pluginCapabilityContext.probeResults;
      }
    }
    if (request.toolsetRouting) assistantMessage.runOptions.toolsetRouting = request.toolsetRouting;
    if (sourceRunOptions.searchSource) assistantMessage.runOptions.searchSource = cleanString(sourceRunOptions.searchSource);
    if (sourceRunOptions.sourceIntent) assistantMessage.runOptions.sourceIntent = cleanString(sourceRunOptions.sourceIntent);
    if (sourceRunOptions.sourceMode) assistantMessage.runOptions.sourceMode = cleanString(sourceRunOptions.sourceMode);
    return assistantMessage;
  }

  function applyWardrobeWorkflowGateMetadata(assistantMessage, gate = {}) {
    if (!gate?.active) return assistantMessage;
    assistantMessage.runOptions = Object.assign({}, assistantMessage.runOptions || {}, {
      wardrobeOutfitWorkflowGate: gate.runOptionsMetadata || null,
    });
    return assistantMessage;
  }

  return Object.freeze({
    applyAssistantRunOptions,
    applyWardrobeWorkflowGateMetadata,
  });
}

module.exports = {
  createGatewayRunStartAssistantOptionsService,
};
