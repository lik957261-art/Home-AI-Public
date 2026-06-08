"use strict";

const { cleanString } = require("./gateway-run-request-builder-service");
const { explicitSearchContext } = require("./gateway-run-search-budget-service");

const CHATGPT_PRO_MIN_WAIT_MS = 30 * 60 * 1000;

function normalizeMaxCalls(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function isChatGptProRunOptions(runOptions = {}) {
  const text = [
    runOptions.requiredTool,
    runOptions.elevationScope,
    runOptions.sourceIntent,
    runOptions.provider,
  ].map((value) => cleanString(value).toLowerCase()).join(" ");
  return text.includes("chatgpt_pro_generate");
}

function isExplicitWebSearchRunOptions(runOptions = {}, values = {}) {
  return explicitSearchContext(Object.assign({}, runOptions, values)).explicitWeb;
}

function createGatewayRunStartStreamOptionsService(options = {}) {
  const runWebSearchMaxCalls = normalizeMaxCalls(options.runWebSearchMaxCalls);
  const runExplicitWebSearchMaxCalls = normalizeMaxCalls(options.runExplicitWebSearchMaxCalls);

  function streamOptionsForGatewayTarget(gatewayTarget = {}, runOptions = {}, values = {}) {
    const streamOptions = {
      gatewayUrl: cleanString(values.gatewayUrl || gatewayTarget?.apiBase),
      gatewayApiKey: gatewayTarget?.apiKey || "",
      gatewayName: gatewayTarget?.name || "",
      gatewayProfile: gatewayTarget?.profile || "",
      gatewaySource: gatewayTarget?.source || "",
    };
    if (runExplicitWebSearchMaxCalls > 0 && isExplicitWebSearchRunOptions(runOptions, values)) {
      streamOptions.webSearchMaxCalls = runExplicitWebSearchMaxCalls;
    } else if (runWebSearchMaxCalls > 0) {
      streamOptions.webSearchMaxCalls = runWebSearchMaxCalls;
    }
    if (isChatGptProRunOptions(runOptions)) {
      streamOptions.runStartTimeoutMs = CHATGPT_PRO_MIN_WAIT_MS;
      streamOptions.runLivenessCheckAfterMs = CHATGPT_PRO_MIN_WAIT_MS;
      streamOptions.runLivenessStaleAfterMs = 0;
      streamOptions.modelFirstByteWarningMs = CHATGPT_PRO_MIN_WAIT_MS;
    }
    return streamOptions;
  }

  return Object.freeze({
    streamOptionsForGatewayTarget,
  });
}

module.exports = {
  CHATGPT_PRO_MIN_WAIT_MS,
  createGatewayRunStartStreamOptionsService,
  isChatGptProRunOptions,
  isExplicitWebSearchRunOptions,
};
