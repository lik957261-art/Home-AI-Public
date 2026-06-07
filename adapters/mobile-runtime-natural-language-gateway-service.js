"use strict";

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new Error(`MobileRuntimeNaturalLanguageGatewayService requires ${name}`);
  }
  return value;
}

function createMobileRuntimeNaturalLanguageGatewayService(options = {}) {
  const naturalLanguageDraftService = requireFunction(options.naturalLanguageDraftService, "naturalLanguageDraftService");
  const chooseGatewayRunTarget = requireFunction(options.chooseGatewayRunTarget, "chooseGatewayRunTarget");
  const gatewayPool = requireFunction(options.gatewayPool, "gatewayPool");
  const releaseGatewayRunTarget = requireFunction(options.releaseGatewayRunTarget, "releaseGatewayRunTarget");
  const responseTextFromValue = requireFunction(options.responseTextFromValue, "responseTextFromValue");
  const randomHex = requireFunction(options.randomHex, "randomHex");
  const abortSignalTimeout = requireFunction(options.abortSignalTimeout, "abortSignalTimeout");
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : () => Date.now();
  const defaultTimeoutMs = Number(options.defaultTimeoutMs || 120000);

  function draftService() {
    const service = naturalLanguageDraftService();
    if (!service || typeof service !== "object") {
      throw new Error("MobileRuntimeNaturalLanguageGatewayService requires naturalLanguageDraftService()");
    }
    return service;
  }

  async function hermesModelText(body, timeoutMs = defaultTimeoutMs) {
    let text = "";
    const runId = `automation_draft_${nowMs()}_${randomHex(3)}`;
    const gatewayTarget = await chooseGatewayRunTarget({ purpose: "automation_draft" }, { runId });
    try {
      const response = await gatewayPool().runnerFor(gatewayTarget).streamResponses(body, {
        signal: abortSignalTimeout(Math.max(5000, timeoutMs)),
        gatewayUrl: gatewayTarget.apiBase,
        apiKey: gatewayTarget.apiKey,
        onEvent: (event) => {
          const eventName = String(event.event || event.type || "");
          if (eventName === "message.delta" || eventName === "response.output_text.delta") {
            text += String(event.delta || event.text || "");
          } else {
            text += responseTextFromValue(event.output_text || event.output || event.message || "");
          }
        },
      });
      if (!response?.body?.getReader) text += responseTextFromValue(response);
      releaseGatewayRunTarget(gatewayTarget.schedulerRunId || runId, "idle");
      return text.trim();
    } catch (err) {
      releaseGatewayRunTarget(gatewayTarget.schedulerRunId || runId, "failed");
      throw err;
    }
  }

  return Object.freeze({
    extractJsonObject: (...args) => draftService().extractJsonObject(...args),
    hermesModelText,
    normalizeAutomationDraft: (...args) => draftService().normalizeAutomationDraft(...args),
    interpretAutomationNaturalLanguage: (...args) => draftService().interpretAutomationNaturalLanguage(...args),
  });
}

module.exports = {
  createMobileRuntimeNaturalLanguageGatewayService,
};
