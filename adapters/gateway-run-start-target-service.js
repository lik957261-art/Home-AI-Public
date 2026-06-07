"use strict";

const { cleanString } = require("./gateway-run-request-builder-service");

function maybeCall(fn, fallback) {
  return typeof fn === "function" ? fn : fallback;
}

function probeRequestsForRequest(request) {
  return Array.isArray(request?.pluginCapabilityContext?.probeRequests)
    ? request.pluginCapabilityContext.probeRequests
    : [];
}

function hasGatewayToolsetMetadata(gatewayTarget) {
  return Array.isArray(gatewayTarget?.toolsets)
    || Array.isArray(gatewayTarget?.enabledToolsets)
    || Array.isArray(gatewayTarget?.enabled_toolsets);
}

function shouldProbePluginCapabilities(request, gatewayTarget, probeOverridePresent = false) {
  return Boolean(
    probeRequestsForRequest(request).length
    && (probeOverridePresent || hasGatewayToolsetMetadata(gatewayTarget)),
  );
}

function createGatewayRunStartTargetService(options = {}) {
  const chooseGatewayRunTarget = maybeCall(options.chooseGatewayRunTarget, async () => ({ apiBase: "" }));
  const appendGatewaySchedulerEvent = maybeCall(options.appendGatewaySchedulerEvent, () => {});
  const applyStartedRunState = maybeCall(options.applyStartedRunState, () => ({ gatewayUrl: "" }));
  const saveState = maybeCall(options.saveState, () => {});
  const broadcastMessageUpdated = maybeCall(options.broadcastMessageUpdated, () => {});
  const appendRunStartEvent = maybeCall(options.appendRunStartEvent, () => {});
  const contextReadyPreview = maybeCall(options.contextReadyPreview, () => "");
  const gatewaySelectedPreview = maybeCall(options.gatewaySelectedPreview, () => "");

  async function selectGatewayRunTarget(request, taskId, thread) {
    return chooseGatewayRunTarget(request.gatewayRouting, {
      runId: taskId,
      onEvent: (event) => appendGatewaySchedulerEvent(thread, taskId, event),
    });
  }

  function applyGatewayTargetStart(thread, assistantMessage, taskId, request, gatewayTarget, startedAt) {
    const { gatewayUrl } = applyStartedRunState(thread, assistantMessage, taskId, gatewayTarget, startedAt);
    assistantMessage.model = cleanString(request.body.model || request.gatewayRouting.model || gatewayTarget?.model || gatewayTarget?.defaultModel);
    assistantMessage.modelProvider = cleanString(request.body.provider || request.gatewayRouting.provider || gatewayTarget?.provider);
    if (!assistantMessage.reasoningEffort) {
      assistantMessage.reasoningEffort = cleanString(request.body.reasoning_effort || request.gatewayRouting.reasoning_effort);
    }
    saveState();
    broadcastMessageUpdated(thread, assistantMessage);
    return { gatewayUrl };
  }

  function projectGatewayTargetReadyEvents(thread, assistantMessage, request, gatewayTarget, optionsForProjection = {}) {
    const probeRequests = probeRequestsForRequest(request);
    const shouldProbe = shouldProbePluginCapabilities(
      request,
      gatewayTarget,
      Boolean(optionsForProjection.probeOverridePresent),
    );
    if (!shouldProbe) {
      appendRunStartEvent(thread, assistantMessage, "run.context_ready", contextReadyPreview(request));
    }
    appendRunStartEvent(thread, assistantMessage, "run.gateway_selected", gatewaySelectedPreview(gatewayTarget, request));
    return {
      probeRequests,
      shouldProbePluginCapabilities: shouldProbe,
    };
  }

  return Object.freeze({
    applyGatewayTargetStart,
    projectGatewayTargetReadyEvents,
    selectGatewayRunTarget,
    shouldProbePluginCapabilities,
  });
}

module.exports = {
  createGatewayRunStartTargetService,
  hasGatewayToolsetMetadata,
  probeRequestsForRequest,
  shouldProbePluginCapabilities,
};
