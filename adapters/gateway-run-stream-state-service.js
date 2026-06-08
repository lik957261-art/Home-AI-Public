"use strict";

function provider(value, fallback) {
  return typeof value === "function" ? value() : (value ?? fallback);
}

function createGatewayRunStreamStateService(options = {}) {
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : (() => Date.now());
  const singleGatewayRunner = typeof options.singleGatewayRunner === "function"
    ? options.singleGatewayRunner
    : (() => options.singleGatewayRunner);

  function createStreamState(threadId, messageId, controller, streamOptions = {}) {
    const defaultRunner = provider(singleGatewayRunner, null);
    const startedAt = nowMs();
    return {
      threadId,
      messageId,
      controller,
      engine: "responses",
      gatewayUrl: streamOptions.gatewayUrl || defaultRunner?.apiBase?.() || "",
      gatewayApiKey: streamOptions.gatewayApiKey || "",
      gatewayName: streamOptions.gatewayName || "",
      gatewayProfile: streamOptions.gatewayProfile || "",
      gatewaySource: streamOptions.gatewaySource || "",
      startedAt,
      lastEventAt: startedAt,
      livenessTimer: null,
      livenessMisses: 0,
      lastLivenessWarningAt: 0,
      failureReason: "",
      firstGatewayEventAt: 0,
      firstModelOutputAt: 0,
      firstEventWarningCount: 0,
      firstEventTimer: null,
      terminalEventSeen: false,
      apiTimeoutMs: streamOptions.apiTimeoutMs,
      modelFirstByteWarningMs: streamOptions.modelFirstByteWarningMs,
      runStartTimeoutMs: streamOptions.runStartTimeoutMs,
      runLivenessCheckAfterMs: streamOptions.runLivenessCheckAfterMs,
      runLivenessStaleAfterMs: streamOptions.runLivenessStaleAfterMs,
      webSearchMaxCalls: streamOptions.webSearchMaxCalls,
      toolBudgetCounters: Object.create(null),
    };
  }

  return Object.freeze({
    createStreamState,
  });
}

module.exports = {
  createGatewayRunStreamStateService,
};
