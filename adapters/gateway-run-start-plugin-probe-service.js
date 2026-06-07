"use strict";

const { defaultDedupe } = require("./gateway-run-request-builder-service");
const { createPluginCapabilityProbeService } = require("./plugin-capability-probe-service");

function maybeCall(fn, fallback) {
  return typeof fn === "function" ? fn : fallback;
}

function createGatewayRunStartPluginProbeService(options = {}) {
  const dedupe = maybeCall(options.dedupe, defaultDedupe);
  const nowMs = maybeCall(options.nowMs, () => Date.now());
  const pluginCapabilityProbeService = options.pluginCapabilityProbeService
    || createPluginCapabilityProbeService({ dedupe, nowMs });
  const appendPluginCapabilityProbeEvents = maybeCall(options.appendPluginCapabilityProbeEvents, () => {});
  const appendRunStartEvent = maybeCall(options.appendRunStartEvent, () => {});
  const applyAssistantRunOptions = maybeCall(options.applyAssistantRunOptions, () => {});
  const applyWardrobeWorkflowGateMetadata = maybeCall(options.applyWardrobeWorkflowGateMetadata, () => {});
  const buildRunRequest = maybeCall(options.buildRunRequest, () => ({}));
  const contextReadyPreview = maybeCall(options.contextReadyPreview, () => "");
  const evaluateWardrobeGate = maybeCall(options.evaluateWardrobeGate, () => ({}));
  const probePluginCapabilities = maybeCall(
    options.probePluginCapabilities,
    (...args) => pluginCapabilityProbeService.probePluginCapabilities(...args),
  );

  async function runPluginCapabilityProbe(args = {}) {
    let effectiveRunOptions = args.effectiveRunOptions || {};
    let request = args.request || {};
    let wardrobeGate = args.wardrobeGate || {};
    if (!args.shouldProbePluginCapabilities) {
      return { effectiveRunOptions, request, wardrobeGate };
    }

    const probeResult = await probePluginCapabilities({
      requests: args.probeRequests,
      request,
      gatewayTarget: args.gatewayTarget,
      thread: args.thread,
      userMessage: args.userMessage,
      assistantMessage: args.assistantMessage,
      runOptions: effectiveRunOptions,
    }) || {};
    const probeResults = Array.isArray(probeResult.probes) ? probeResult.probes : [];
    if (probeResults.length) {
      effectiveRunOptions = Object.assign({}, effectiveRunOptions, {
        pluginCapabilityProbeResults: probeResults,
      });
      request = buildRunRequest(args.thread, args.userMessage, args.assistantMessage, effectiveRunOptions);
      wardrobeGate = evaluateWardrobeGate(request, args.userMessage, "after_plugin_probe", args.gatewayTarget);
      applyAssistantRunOptions(args.assistantMessage, request, effectiveRunOptions);
      applyWardrobeWorkflowGateMetadata(args.assistantMessage, wardrobeGate);
      appendPluginCapabilityProbeEvents(args.thread, args.assistantMessage, probeResults);
    }
    if (wardrobeGate.active && !wardrobeGate.ok) {
      return { effectiveRunOptions, gateFailed: true, request, wardrobeGate };
    }
    appendRunStartEvent(args.thread, args.assistantMessage, "run.context_ready", contextReadyPreview(request));
    return { effectiveRunOptions, request, wardrobeGate };
  }

  return Object.freeze({
    runPluginCapabilityProbe,
  });
}

module.exports = {
  createGatewayRunStartPluginProbeService,
};
