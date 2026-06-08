"use strict";

const {
  policyThreadForRun,
  resolveActorWorkspaceId,
} = require("./gateway-run-request-builder-service");
const { createGatewayRunStartChildServiceRegistry } = require("./gateway-run-start-child-service-registry-service");

function createGatewayRunStartService(options = {}) {
  const childServices = options.childServices || createGatewayRunStartChildServiceRegistry(options);
  const {
    applyStartedRunState,
    buildGroupChatRunContext,
    buildRunRequest,
    executionPhaseService,
    markStartFailed,
    preparationService,
    targetPhaseService,
  } = childServices;

  async function startRunForThread(thread, userMessage, assistantMessage, runOptions = {}) {
    const prepared = preparationService.prepareRunStart({ thread, userMessage, assistantMessage, runOptions });
    if (prepared.terminalResult) return prepared.terminalResult;
    const taskId = prepared.taskId;
    let effectiveRunOptions = prepared.effectiveRunOptions || runOptions;
    let request = prepared.request;

    const targetPhase = await targetPhaseService.runTargetSelectedPhase({
      assistantMessage,
      effectiveRunOptions,
      probeOverridePresent: Boolean(childServices.probeOverridePresent),
      request,
      taskId,
      thread,
      userMessage,
    });
    if (targetPhase.terminalResult) return targetPhase.terminalResult;
    effectiveRunOptions = targetPhase.effectiveRunOptions || effectiveRunOptions;
    request = targetPhase.request || request;
    const { gatewayTarget, gatewayUrl } = targetPhase;
    return executionPhaseService.runExecutionPhase({
      assistantMessage,
      effectiveRunOptions,
      gatewayTarget,
      gatewayUrl,
      request,
      runOptions,
      taskId,
      thread,
      userMessage,
    });
  }

  return {
    applyStartedRunState,
    buildGroupChatRunContext,
    buildRunRequest,
    markStartFailed,
    policyThreadForRun,
    resolveActorWorkspaceId,
    startRunForThread,
  };
}

module.exports = {
  createGatewayRunStartService,
  policyThreadForRun,
  resolveActorWorkspaceId,
};
