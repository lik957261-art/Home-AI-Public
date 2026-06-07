"use strict";

const { defaultDedupe } = require("./gateway-run-request-builder-service");

function maybeCall(fn, fallback) {
  return typeof fn === "function" ? fn : fallback;
}

function createGatewayRunStartStreamHandoffService(options = {}) {
  const dedupe = maybeCall(options.dedupe, defaultDedupe);
  const appendRunStartEvent = maybeCall(options.appendRunStartEvent, () => {});
  const applyAssistantRunOptions = maybeCall(options.applyAssistantRunOptions, () => {});
  const applyWardrobeWorkflowGateMetadata = maybeCall(options.applyWardrobeWorkflowGateMetadata, () => {});
  const completeWardrobeWorkflowGateFailure = maybeCall(options.completeWardrobeWorkflowGateFailure, () => null);
  const evaluateWardrobeGate = maybeCall(options.evaluateWardrobeGate, () => ({}));
  const saveState = maybeCall(options.saveState, () => {});
  const streamResponse = maybeCall(options.streamResponse, () => {});

  function enabledToolsetsForRequest(request = {}) {
    return dedupe(
      request.runPolicy?.allowed_toolsets
        || request.runPolicy?.allowedToolsets
        || request.body?.enabled_toolsets
        || [],
    );
  }

  function startedResult(taskId, gatewayTarget, gatewayUrl) {
    return {
      run_id: taskId,
      status: "started",
      engine: "responses",
      gatewayUrl,
      gatewayName: gatewayTarget?.name || "",
      gatewayProfile: gatewayTarget?.profile || "",
      gatewaySource: gatewayTarget?.source || "",
    };
  }

  function startStreamHandoff(args = {}) {
    const wardrobeGate = evaluateWardrobeGate(
      args.request,
      args.userMessage,
      "pre_stream",
      args.gatewayTarget,
      { appendInstructions: true },
    );
    applyAssistantRunOptions(args.assistantMessage, args.request, args.effectiveRunOptions || {});
    applyWardrobeWorkflowGateMetadata(args.assistantMessage, wardrobeGate);
    if (wardrobeGate.active && !wardrobeGate.ok) {
      return completeWardrobeWorkflowGateFailure(args.thread, args.assistantMessage, args.taskId, wardrobeGate);
    }
    appendRunStartEvent(args.thread, args.assistantMessage, "run.request_sent", "等待模型或工具返回");
    args.request.body = args.request.body || {};
    args.request.body.enabled_toolsets = enabledToolsetsForRequest(args.request);
    saveState();
    streamResponse(args.taskId, args.thread?.id, args.assistantMessage?.id, args.request.body, args.streamOptions);
    return startedResult(args.taskId, args.gatewayTarget, args.gatewayUrl);
  }

  return Object.freeze({
    startStreamHandoff,
  });
}

module.exports = {
  createGatewayRunStartStreamHandoffService,
};
