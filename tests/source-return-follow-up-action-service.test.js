"use strict";

const assert = require("node:assert/strict");

const {
  aggregateDeployRequests,
} = require("../adapters/central-deploy-governance-service");
const {
  deployRequestsFromPendingSourceActions,
  parseSourceReturnFollowUpAction,
  transitionPendingSourceAction,
} = require("../adapters/source-return-follow-up-action-service");

const NOW = "2026-07-09T00:00:00.000Z";

function testCompletedDeployNeededMarkerCreatesPendingAction() {
  const parsed = parseSourceReturnFollowUpAction({
    status: "completed",
    taskCardId: "ttc_worker",
    returnCardId: "ttc_return",
    workflowId: "twf_1",
    summary: "completed; deploy_needed=true; suggested deployment ref: ee22fd5b0835b14545bbfadd4264d61e79229ba3",
    requiredReadback: ["production readback smoke"],
  }, { nowIso: () => NOW });

  assert.equal(parsed.required, true);
  assert.equal(parsed.actionType, "deploy");
  assert.equal(parsed.pendingSourceAction.status, "pending");
  assert.equal(parsed.pendingSourceAction.actionType, "deploy");
  assert.equal(parsed.pendingSourceAction.sourceTaskCardId, "ttc_worker");
  assert.equal(parsed.pendingSourceAction.returnCardId, "ttc_return");
  assert.equal(parsed.pendingSourceAction.workflowId, "twf_1");
  assert.equal(parsed.pendingSourceAction.sourceRef, "ee22fd5b0835b14545bbfadd4264d61e79229ba3");
  assert.equal(parsed.pendingSourceAction.issueCode, "pending_source_deploy_action_required");
  assert.equal(parsed.pendingSourceAction.terminalReceipt.activeTurn, false);
  assert.equal(parsed.pendingSourceAction.terminalReceipt.remainsTerminal, true);
  assert.equal(parsed.pendingSourceAction.deployRequest.needed, true);
  assert.equal(parsed.pendingSourceAction.deployRequest.target, "home-ai");
}

function testCompletedReturnWithoutMarkerCreatesNoPendingAction() {
  const parsed = parseSourceReturnFollowUpAction({
    status: "completed",
    taskCardId: "ttc_worker",
    returnCardId: "ttc_return",
    summary: "completed with tests, no source follow-up needed",
  }, { nowIso: () => NOW });

  assert.equal(parsed.required, false);
  assert.equal(parsed.reason, "no_follow_up_signal");
}

function testStructuredDeployRequestWinsOverTextMarker() {
  const parsed = parseSourceReturnFollowUpAction({
    status: "completed",
    taskCardId: "ttc_worker",
    returnCardId: "ttc_return",
    summary: "deploy_needed=true; suggested deployment ref: badbad1",
    metadata: {
      deployRequest: {
        needed: true,
        requestedByRole: "home_ai_worker",
        sourceWorkspace: "/Users/example/path",
        target: "plugin:music",
        sourceRef: "good1234",
        requiredReadback: ["plugin manifest smoke"],
        dirtyState: { dirty: false },
      },
    },
  }, { nowIso: () => NOW });

  assert.equal(parsed.required, true);
  assert.equal(parsed.source, "structured_deploy_request");
  assert.equal(parsed.pendingSourceAction.detection.source, "structured_deploy_request");
  assert.equal(parsed.pendingSourceAction.target, "plugin:music");
  assert.equal(parsed.pendingSourceAction.sourceRef, "good1234");
}

function testPendingActionCanResolveBlockAndDismiss() {
  const parsed = parseSourceReturnFollowUpAction({
    status: "completed",
    taskCardId: "ttc_worker",
    returnCardId: "ttc_return",
    summary: "deploy_requested ref: abc1234",
  }, { nowIso: () => NOW });

  const resolved = transitionPendingSourceAction(parsed.pendingSourceAction, {
    status: "resolved",
    actionTaken: "central_deploy_card_dispatched",
    centralDeployCardId: "ttc_deploy",
    centralCoordinatorRef: "delivery_1",
    updatedAt: "2026-07-09T00:05:00.000Z",
  });
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.resolution.centralDeployCardId, "ttc_deploy");
  assert.equal(resolved.resolution.centralCoordinatorRef, "delivery_1");

  const blocked = transitionPendingSourceAction(parsed.pendingSourceAction, {
    status: "blocked",
    reason: "source ref unavailable",
    updatedAt: "2026-07-09T00:06:00.000Z",
  });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.resolution.reason, "source ref unavailable");

  const dismissed = transitionPendingSourceAction(parsed.pendingSourceAction, {
    status: "dismissed",
    reason: "duplicate deploy request superseded",
    updatedAt: "2026-07-09T00:07:00.000Z",
  });
  assert.equal(dismissed.status, "dismissed");
  assert.equal(dismissed.resolution.reason, "duplicate deploy request superseded");
}

function testPendingDeployActionFeedsCentralAggregator() {
  const parsed = parseSourceReturnFollowUpAction({
    status: "completed",
    taskCardId: "ttc_worker",
    returnCardId: "ttc_return",
    summary: "deploy_needed=true; ref: abc1234",
  }, { nowIso: () => NOW });

  const requests = deployRequestsFromPendingSourceActions([parsed.pendingSourceAction]);
  assert.equal(requests.length, 1);
  const report = aggregateDeployRequests(requests);
  assert.equal(report.requestCount, 1);
  assert.equal(report.candidateCount, 1);
  assert.equal(report.candidates[0].status, "deploy_candidate");
}

testCompletedDeployNeededMarkerCreatesPendingAction();
testCompletedReturnWithoutMarkerCreatesNoPendingAction();
testStructuredDeployRequestWinsOverTextMarker();
testPendingActionCanResolveBlockAndDismiss();
testPendingDeployActionFeedsCentralAggregator();
console.log("source return follow-up action service tests passed");
