"use strict";

const assert = require("node:assert/strict");
const {
  buildSourceReturnIntegrationSummary,
  isSourceReturnIntegrationCandidate,
  sourceActivationProjection,
  sourceReturnIntegrationForReturn,
  sourceReturnIntegrationItemForSlice,
  sourceReturnIntegrationStalePatch,
} = require("../adapters/source-return-integration-watchdog-service");

function testCandidateFiltering() {
  assert.equal(isSourceReturnIntegrationCandidate({
    status: "completed",
    returnCardId: "ttc_return_1",
  }), true);
  assert.equal(isSourceReturnIntegrationCandidate({
    status: "dispatched",
    returnCardId: "ttc_return_1",
  }), false);
  assert.equal(isSourceReturnIntegrationCandidate({
    status: "completed",
    returnCardId: "ttc_return_1",
    sourceReturnIntegration: { status: "integrated" },
  }), false);
}

function testRecordForReturnIsBoundedMetadataOnly() {
  const record = sourceReturnIntegrationForReturn({
    caseId: "delivery_1",
    sliceId: "slice_1",
    sliceKey: "implementation",
    taskCardId: "ttc_1",
    returnCardId: "ttc_return_1",
    status: "completed",
    recordedAt: "2026-07-04T10:00:00.000Z",
    body: "raw body must not be copied",
    prompt: "raw prompt must not be copied",
  });
  assert.equal(record.status, "pending");
  assert.equal(record.code, "source_return_integration_pending");
  assert.equal(record.returnCardId, "ttc_return_1");
  assert.equal(record.counts.returnCard, 1);
  const serialized = JSON.stringify(record);
  assert.doesNotMatch(serialized, /raw body/);
  assert.doesNotMatch(serialized, /raw prompt/);
}

function testRecordForReturnCreatesSourceActivationReceipt() {
  const record = sourceReturnIntegrationForReturn({
    caseId: "delivery_1",
    sliceId: "slice_1",
    sliceKey: "implementation",
    taskCardId: "ttc_1",
    returnCardId: "ttc_return_1",
    status: "completed",
    sourceThreadId: "thread-source",
    sourceThreadStatus: "completed",
    recordedAt: "2026-07-04T10:00:00.000Z",
  });
  assert.equal(record.sourceActivation.status, "pending");
  assert.equal(record.sourceActivation.code, "source_thread_activation_required_for_return");
  assert.equal(record.sourceActivation.activationKind, "terminal_return_receipt");
  assert.equal(record.sourceActivation.sourceThreadId, "thread-source");
  assert.equal(record.sourceActivation.sourceThreadStatus, "completed");
  assert.equal(record.sourceActivation.sourceThreadWasInactive, true);
  assert.equal(record.sourceActivation.ownerVisible, true);
  assert.equal(record.counts.sourceActivation, 1);
  const projection = sourceActivationProjection(record.sourceActivation);
  assert.equal(projection.code, "source_thread_activation_required_for_return");
  assert.equal(projection.sourceThreadWasInactive, true);
}

function testSummaryTracksPendingAndStaleReturns() {
  const summary = buildSourceReturnIntegrationSummary({
    workspaceId: "owner",
    generatedAt: "2026-07-04T11:00:00.000Z",
    staleAfterMs: 30 * 60 * 1000,
    slices: [
      {
        caseId: "delivery_1",
        sliceId: "slice_1",
        workspaceId: "owner",
        status: "completed",
        taskCardId: "ttc_1",
        returnCardId: "ttc_return_1",
        sourceReturnIntegration: {
          status: "pending",
          recordedAt: "2026-07-04T10:00:00.000Z",
          sourceActivation: {
            id: "sra_1",
            status: "pending",
            code: "source_thread_activation_required_for_return",
            sourceThreadId: "thread-source",
            sourceThreadStatus: "completed",
            sourceThreadWasInactive: true,
            issueCodes: ["source_thread_activation_required_for_return"],
          },
        },
      },
      {
        caseId: "delivery_2",
        sliceId: "slice_2",
        workspaceId: "owner",
        status: "completed",
        taskCardId: "ttc_2",
        returnCardId: "ttc_return_2",
        sourceReturnIntegration: {
          status: "pending",
          recordedAt: "2026-07-04T10:45:00.000Z",
        },
      },
    ],
  });
  assert.equal(summary.status, "degraded");
  assert.equal(summary.counts.tracked, 2);
  assert.equal(summary.counts.stale, 1);
  assert.equal(summary.items[0].code, "source_return_integration_stale");
  assert.equal(summary.items[0].recommendedAction, "review_source_scheduler_integration_then_mark_disposition_without_redispatch");
  assert.equal(summary.items[0].sourceActivationStatus, "pending");
  assert.equal(summary.items[0].sourceActivationCode, "source_thread_activation_required_for_return");
  assert.equal(summary.items[0].sourceThreadWasInactive, true);
}

function testItemAndPatchDoNotCloseOrRedispatch() {
  const item = sourceReturnIntegrationItemForSlice({
    caseId: "delivery_1",
    sliceId: "slice_1",
    workspaceId: "owner",
    status: "completed",
    taskCardId: "ttc_1",
    returnCardId: "ttc_return_1",
    sourceReturnIntegration: {
      status: "pending",
      recordedAt: "2026-07-04T10:00:00.000Z",
    },
  }, Date.parse("2026-07-04T11:00:00.000Z"), 30 * 60 * 1000);
  assert.equal(item.stale, true);
  const patch = sourceReturnIntegrationStalePatch(item, { staleAfterMs: 30 * 60 * 1000 }, "2026-07-04T11:00:00.000Z");
  assert.equal(patch.sourceReturnIntegration.status, "stale");
  assert.equal(patch.sourceReturnIntegration.policy, "no_auto_retry_no_closure_fabrication");
  assert.equal(patch.sourceReturnIntegration.sourceActivation.status, "projection_missing");
  assert.equal(patch.sourceReturnIntegration.sourceActivation.code, "return_projection_missing_after_terminal_return");
  assert.equal(Object.hasOwn(patch, "status"), false);
  assert.equal(Object.hasOwn(patch, "dispatchStatus"), false);
}

function testStalePatchPreservesPendingSourceAction() {
  const item = sourceReturnIntegrationItemForSlice({
    caseId: "delivery_1",
    sliceId: "slice_1",
    workspaceId: "owner",
    status: "completed",
    taskCardId: "ttc_1",
    returnCardId: "ttc_return_1",
    sourceReturnIntegration: {
      status: "pending",
      recordedAt: "2026-07-04T10:00:00.000Z",
      sourceActivation: {
        id: "sra_1",
        status: "pending_source_action",
        code: "pending_source_action_required",
        issueCodes: ["source_thread_activation_required_for_return", "pending_source_action_required"],
      },
      pendingSourceAction: {
        id: "psa_1",
        status: "pending",
        actionType: "deploy",
        issueCode: "pending_source_deploy_action_required",
      },
      pendingSourceActionProjection: {
        id: "psa_1",
        status: "pending",
        actionType: "deploy",
      },
    },
  }, Date.parse("2026-07-04T11:00:00.000Z"), 30 * 60 * 1000);
  const currentIntegration = {
    sourceActivation: {
      id: "sra_1",
      status: "pending_source_action",
      code: "pending_source_action_required",
      issueCodes: ["source_thread_activation_required_for_return", "pending_source_action_required"],
    },
    pendingSourceAction: {
      id: "psa_1",
      status: "pending",
      actionType: "deploy",
      issueCode: "pending_source_deploy_action_required",
    },
    pendingSourceActionProjection: {
      id: "psa_1",
      status: "pending",
      actionType: "deploy",
    },
  };
  const patch = sourceReturnIntegrationStalePatch(item, { staleAfterMs: 30 * 60 * 1000 }, "2026-07-04T11:00:00.000Z", currentIntegration);
  assert.equal(patch.sourceReturnIntegration.pendingSourceAction.id, "psa_1");
  assert.equal(patch.sourceReturnIntegration.pendingSourceActionProjection.id, "psa_1");
  assert.ok(patch.sourceReturnIntegration.sourceActivation.issueCodes.includes("return_projection_missing_after_terminal_return"));
  assert.equal(patch.sourceReturnIntegration.counts.pendingSourceAction, 1);
}

testCandidateFiltering();
testRecordForReturnIsBoundedMetadataOnly();
testRecordForReturnCreatesSourceActivationReceipt();
testSummaryTracksPendingAndStaleReturns();
testItemAndPatchDoNotCloseOrRedispatch();
testStalePatchPreservesPendingSourceAction();
console.log("source return integration watchdog service tests passed");
