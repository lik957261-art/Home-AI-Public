"use strict";

const { cleanString } = require("./gateway-run-request-builder-service");
const {
  evaluateWardrobeOutfitWorkflowGate: defaultEvaluateWardrobeOutfitWorkflowGate,
} = require("./wardrobe-outfit-workflow-gate-service");

function maybeCall(fn, fallback) {
  return typeof fn === "function" ? fn : fallback;
}

function createGatewayRunStartWardrobeGateService(options = {}) {
  const evaluateWardrobeOutfitWorkflowGate = maybeCall(
    options.evaluateWardrobeOutfitWorkflowGate,
    defaultEvaluateWardrobeOutfitWorkflowGate,
  );
  const appendRunStartEvent = maybeCall(options.appendRunStartEvent, () => {});
  const markStartFailed = maybeCall(options.markStartFailed, (_thread, assistantMessage, err) => ({
    status: "failed",
    runId: cleanString(assistantMessage?.runId),
    failedAt: "",
    error: cleanString(err?.message || err),
  }));

  function appendWardrobeWorkflowGateInstructions(request = {}, gate = {}) {
    if (!gate?.active || !gate.ok || !gate.instructionBlock) return request;
    request.body = request.body || {};
    if (/Wardrobe outfit workflow (?:gate|guidance):/.test(String(request.body.instructions || ""))) return request;
    request.body.instructions = [
      request.body.instructions || "",
      gate.instructionBlock,
    ].filter(Boolean).join("\n\n");
    return request;
  }

  function evaluateWardrobeGate(request = {}, userMessage = {}, stage = "pre_stream", gatewayTarget = null, gateOptions = {}) {
    const gate = evaluateWardrobeOutfitWorkflowGate({ request, userMessage, stage, gatewayTarget });
    request.wardrobeOutfitWorkflowGate = gate;
    if (gateOptions.appendInstructions) appendWardrobeWorkflowGateInstructions(request, gate);
    return gate;
  }

  function completeWardrobeWorkflowGateFailure(thread, assistantMessage, taskId, gate = {}) {
    appendRunStartEvent(thread, assistantMessage, "run.wardrobe_workflow_gate_failed", gate.eventPreview || "");
    const err = new Error(gate.message || "Wardrobe workflow gate failed.");
    err.code = gate.errorCode || "wardrobe_workflow_gate_failed";
    err.details = {
      reason: cleanString(gate.reason),
      missingToolsets: gate.missingToolsets || [],
      missingSkills: gate.missingSkills || [],
      workflow: cleanString(gate.workflow),
      stage: cleanString(gate.stage),
    };
    const result = markStartFailed(thread, assistantMessage, err, {
      runId: taskId,
      content: gate.message,
    });
    return {
      run_id: taskId,
      status: "failed",
      engine: "responses",
      error: result.error,
    };
  }

  return Object.freeze({
    appendWardrobeWorkflowGateInstructions,
    completeWardrobeWorkflowGateFailure,
    evaluateWardrobeGate,
  });
}

module.exports = {
  createGatewayRunStartWardrobeGateService,
};
