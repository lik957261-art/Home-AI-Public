"use strict";

function maybeCall(fn, fallback) {
  return typeof fn === "function" ? fn : fallback;
}

function createGatewayRunStartTargetPhaseService(options = {}) {
  const applyGatewayTargetStart = maybeCall(options.applyGatewayTargetStart, () => ({}));
  const applyWardrobeWorkflowGateMetadata = maybeCall(options.applyWardrobeWorkflowGateMetadata, () => {});
  const completeWardrobeWorkflowGateFailure = maybeCall(options.completeWardrobeWorkflowGateFailure, () => null);
  const evaluateWardrobeGate = maybeCall(options.evaluateWardrobeGate, () => ({}));
  const nowIso = maybeCall(options.nowIso, () => new Date().toISOString());
  const projectGatewayTargetReadyEvents = maybeCall(options.projectGatewayTargetReadyEvents, () => ({}));
  const runPluginCapabilityProbe = maybeCall(options.runPluginCapabilityProbe, async (args) => args || {});
  const selectGatewayRunTarget = maybeCall(options.selectGatewayRunTarget, async () => ({}));

  async function runTargetSelectedPhase(args = {}) {
    const gatewayTarget = await selectGatewayRunTarget(args.request, args.taskId, args.thread);
    let wardrobeGate = evaluateWardrobeGate(args.request, args.userMessage, "gateway_selected", gatewayTarget);
    applyWardrobeWorkflowGateMetadata(args.assistantMessage, wardrobeGate);
    if (wardrobeGate.active && !wardrobeGate.ok) {
      return {
        gatewayTarget,
        wardrobeGate,
        terminalResult: completeWardrobeWorkflowGateFailure(args.thread, args.assistantMessage, args.taskId, wardrobeGate),
      };
    }

    const { gatewayUrl } = applyGatewayTargetStart(
      args.thread,
      args.assistantMessage,
      args.taskId,
      args.request,
      gatewayTarget,
      nowIso(),
    );
    const { probeRequests, shouldProbePluginCapabilities } = projectGatewayTargetReadyEvents(
      args.thread,
      args.assistantMessage,
      args.request,
      gatewayTarget,
      { probeOverridePresent: Boolean(args.probeOverridePresent) },
    );
    const pluginProbe = await runPluginCapabilityProbe({
      assistantMessage: args.assistantMessage,
      effectiveRunOptions: args.effectiveRunOptions,
      gatewayTarget,
      probeRequests,
      request: args.request,
      shouldProbePluginCapabilities,
      thread: args.thread,
      userMessage: args.userMessage,
      wardrobeGate,
    });
    const effectiveRunOptions = pluginProbe.effectiveRunOptions || args.effectiveRunOptions;
    const request = pluginProbe.request || args.request;
    wardrobeGate = pluginProbe.wardrobeGate || wardrobeGate;
    if (pluginProbe.gateFailed) {
      return {
        effectiveRunOptions,
        gatewayTarget,
        gatewayUrl,
        request,
        wardrobeGate,
        terminalResult: completeWardrobeWorkflowGateFailure(args.thread, args.assistantMessage, args.taskId, wardrobeGate),
      };
    }
    return { effectiveRunOptions, gatewayTarget, gatewayUrl, request, wardrobeGate };
  }

  return Object.freeze({
    runTargetSelectedPhase,
  });
}

module.exports = {
  createGatewayRunStartTargetPhaseService,
};
