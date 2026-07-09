"use strict";

const assert = require("node:assert/strict");
const {
  classifyWorkerBoundaryFailure,
  dispatchIdempotencyKey,
  duplicateDispatchMetadata,
  normalizeTaskCardReasoningEffort,
} = require("../adapters/task-card-dispatch-idempotency-service");

function testReasoningEffortFloor() {
  assert.equal(normalizeTaskCardReasoningEffort("low"), "medium");
  assert.equal(normalizeTaskCardReasoningEffort("medium"), "medium");
  assert.equal(normalizeTaskCardReasoningEffort("high"), "high");
  assert.equal(normalizeTaskCardReasoningEffort({ requested: "low", severity: "H2" }), "high");
  assert.equal(normalizeTaskCardReasoningEffort({ requested: "high", severity: "H1" }), "xhigh");
}

function testDispatchKeyAndDuplicateMetadata() {
  const key = dispatchIdempotencyKey({
    caseId: "delivery_1",
    sliceKey: "implement_home_ai",
    stage: "implementation",
  });
  assert.equal(key, "autonomous-delivery:implementation:delivery_1:implement_home_ai:initial");
  const duplicate = duplicateDispatchMetadata({
    caseId: "delivery_1",
    sliceId: "slice_1",
    sliceKey: "implement_home_ai",
    dispatchStatus: "sent",
    taskCardId: "ttc_1",
  }, {
    title: "Repair Home AI",
    requestId: key,
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.code, "task_card_dispatch_duplicate_active");
  assert.equal(duplicate.policy.suppressDuplicateOwnerPrompt, true);
  assert.equal(duplicate.policy.suppressDuplicateWebPush, true);
}

function testBoundaryClassification() {
  const permission = classifyWorkerBoundaryFailure({
    error: "Permission denied while reading /Users/example/path",
  });
  assert.equal(permission.boundary, "worker_capability_boundary");
  assert.equal(permission.productRuntimeDefect, false);
  assert.equal(permission.recommendedAction, "route_to_deploy_or_service_lane_or_return_blocked");

  const routing = classifyWorkerBoundaryFailure({ error: "target_thread_not_visible" });
  assert.equal(routing.boundary, "task_card_transport_boundary");
  assert.equal(routing.productRuntimeDefect, false);

  const product = classifyWorkerBoundaryFailure({ error: "plugin action renderer filtered" });
  assert.equal(product.boundary, "unknown_or_product_boundary");
  assert.equal(product.productRuntimeDefect, true);
}

testReasoningEffortFloor();
testDispatchKeyAndDuplicateMetadata();
testBoundaryClassification();
console.log("task card dispatch idempotency service tests passed");
