"use strict";

function maybeCall(fn, fallback) {
  return typeof fn === "function" ? fn : fallback;
}

function createGatewayRunStartExecutionPhaseService(options = {}) {
  const applyModelFirstToolsetPreflight = maybeCall(options.applyModelFirstToolsetPreflight, async (args) => ({
    request: args?.request,
  }));
  const startStreamHandoff = maybeCall(options.startStreamHandoff, () => null);
  const streamOptionsForGatewayTarget = maybeCall(options.streamOptionsForGatewayTarget, () => ({}));

  async function runExecutionPhase(args = {}) {
    const streamOptions = streamOptionsForGatewayTarget(args.gatewayTarget, args.runOptions || {}, {
      gatewayUrl: args.gatewayUrl,
    });
    const preflight = await applyModelFirstToolsetPreflight({
      assistantMessage: args.assistantMessage,
      effectiveRunOptions: args.effectiveRunOptions,
      gatewayTarget: args.gatewayTarget,
      gatewayUrl: args.gatewayUrl,
      request: args.request,
      taskId: args.taskId,
      thread: args.thread,
      userMessage: args.userMessage,
    });
    if (preflight?.terminalResult) return preflight.terminalResult;
    return startStreamHandoff({
      assistantMessage: args.assistantMessage,
      effectiveRunOptions: preflight?.effectiveRunOptions || args.effectiveRunOptions,
      gatewayTarget: args.gatewayTarget,
      gatewayUrl: args.gatewayUrl,
      request: preflight?.request || args.request,
      streamOptions,
      taskId: args.taskId,
      thread: args.thread,
      userMessage: args.userMessage,
    });
  }

  return Object.freeze({
    runExecutionPhase,
  });
}

module.exports = {
  createGatewayRunStartExecutionPhaseService,
};
