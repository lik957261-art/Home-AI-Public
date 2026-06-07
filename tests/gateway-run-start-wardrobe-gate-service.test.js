"use strict";

const assert = require("node:assert/strict");
const {
  createGatewayRunStartWardrobeGateService,
} = require("../adapters/gateway-run-start-wardrobe-gate-service");

function makeGateService(gate) {
  const calls = {
    events: [],
    failed: [],
    evaluations: [],
  };
  const service = createGatewayRunStartWardrobeGateService({
    evaluateWardrobeOutfitWorkflowGate: (payload) => {
      calls.evaluations.push(payload);
      return Object.assign({}, gate);
    },
    appendRunStartEvent: (thread, assistantMessage, eventName, preview) => {
      calls.events.push({ thread, assistantMessage, eventName, preview });
    },
    markStartFailed: (thread, assistantMessage, err, options) => {
      calls.failed.push({ thread, assistantMessage, err, options });
      return { error: err.message };
    },
  });
  return { calls, service };
}

function testEvaluateWardrobeGateStoresGateAndAppendsInstructions() {
  const { calls, service } = makeGateService({
    active: true,
    ok: true,
    instructionBlock: "Wardrobe outfit workflow gate:\nCheck weather.",
  });
  const request = { body: { instructions: "Base instructions." } };
  const gatewayTarget = { name: "owner-low-1" };

  const gate = service.evaluateWardrobeGate(request, { id: "msg_1" }, "pre_stream", gatewayTarget, {
    appendInstructions: true,
  });

  assert.equal(gate.active, true);
  assert.equal(request.wardrobeOutfitWorkflowGate.active, true);
  assert.deepEqual(calls.evaluations[0], {
    request,
    userMessage: { id: "msg_1" },
    stage: "pre_stream",
    gatewayTarget,
  });
  assert.match(request.body.instructions, /Base instructions\./);
  assert.match(request.body.instructions, /Wardrobe outfit workflow gate:/);
}

function testEvaluateWardrobeGateDoesNotDuplicateInstructions() {
  const { service } = makeGateService({
    active: true,
    ok: true,
    instructionBlock: "Wardrobe outfit workflow gate:\nCheck weather.",
  });
  const request = { body: { instructions: "Wardrobe outfit workflow gate:\nExisting." } };

  service.evaluateWardrobeGate(request, {}, "pre_stream", null, { appendInstructions: true });

  assert.equal(request.body.instructions, "Wardrobe outfit workflow gate:\nExisting.");
}

function testEvaluateWardrobeGateSkipsInactiveOrFailedInstructionAppend() {
  const inactive = makeGateService({
    active: false,
    ok: true,
    instructionBlock: "Wardrobe outfit workflow gate:\nIgnored.",
  }).service;
  const inactiveRequest = { body: { instructions: "Base" } };
  inactive.evaluateWardrobeGate(inactiveRequest, {}, "pre_stream", null, { appendInstructions: true });
  assert.equal(inactiveRequest.body.instructions, "Base");

  const failed = makeGateService({
    active: true,
    ok: false,
    instructionBlock: "Wardrobe outfit workflow gate:\nIgnored.",
  }).service;
  const failedRequest = { body: { instructions: "Base" } };
  failed.evaluateWardrobeGate(failedRequest, {}, "pre_stream", null, { appendInstructions: true });
  assert.equal(failedRequest.body.instructions, "Base");
}

function testCompleteWardrobeWorkflowGateFailureProjectsEventAndError() {
  const { calls, service } = makeGateService({});
  const thread = { id: "thread_1" };
  const assistantMessage = { id: "assistant_1", runId: "run_1" };

  const result = service.completeWardrobeWorkflowGateFailure(thread, assistantMessage, "run_1", {
    message: "Wardrobe rules failed.",
    errorCode: "wardrobe_required_skill_missing",
    eventPreview: "missing required skill",
    reason: "required_skill_missing",
    missingToolsets: ["wardrobe"],
    missingSkills: ["productivity/wardrobe-style-operations"],
    workflow: "outfit",
    stage: "pre_stream",
  });

  assert.deepEqual(result, {
    run_id: "run_1",
    status: "failed",
    engine: "responses",
    error: "Wardrobe rules failed.",
  });
  assert.deepEqual(calls.events[0], {
    thread,
    assistantMessage,
    eventName: "run.wardrobe_workflow_gate_failed",
    preview: "missing required skill",
  });
  assert.equal(calls.failed[0].err.code, "wardrobe_required_skill_missing");
  assert.deepEqual(calls.failed[0].err.details, {
    reason: "required_skill_missing",
    missingToolsets: ["wardrobe"],
    missingSkills: ["productivity/wardrobe-style-operations"],
    workflow: "outfit",
    stage: "pre_stream",
  });
  assert.deepEqual(calls.failed[0].options, {
    runId: "run_1",
    content: "Wardrobe rules failed.",
  });
}

testEvaluateWardrobeGateStoresGateAndAppendsInstructions();
testEvaluateWardrobeGateDoesNotDuplicateInstructions();
testEvaluateWardrobeGateSkipsInactiveOrFailedInstructionAppend();
testCompleteWardrobeWorkflowGateFailureProjectsEventAndError();

console.log("gateway run-start wardrobe gate service tests passed");
