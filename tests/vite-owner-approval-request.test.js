"use strict";

const assert = require("node:assert/strict");

const {
  OWNER_APPROVAL_REQUEST_VERSION,
  buildViteOwnerApprovalRequest,
  formatText,
  parseArgs,
  stableRequestId,
} = require("../scripts/vite-owner-approval-request");
const {
  REQUIRED_OWNER_APPROVAL_TEXT,
} = require("../scripts/vite-production-cutover-preflight");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

function acceptanceFixture(overrides = {}) {
  return {
    ok: true,
    status: "development_acceptance_passed",
    sourceOnly: true,
    productionWrites: false,
    deployExecuted: false,
    productionDeployAuthorized: false,
    summary: {
      stepCount: 11,
      failedStepCount: 0,
      failedStepIds: [],
    },
    ownerApprovalRequest: {
      status: "ready_to_request_owner_approval",
      requiredText: REQUIRED_OWNER_APPROVAL_TEXT,
      productionWrites: false,
      deployExecuted: false,
      deployCardSent: false,
    },
    ...overrides,
  };
}

function ownerReviewFixture(overrides = {}) {
  return {
    ok: true,
    status: "ready_for_owner_review",
    sourceOnly: true,
    productionWrites: false,
    deployExecuted: false,
    productionDeployAuthorized: false,
    ...overrides,
  };
}

function handoffPacketFixture(overrides = {}) {
  return {
    ok: false,
    status: "blocked",
    blockedReason: "owner_approval_required",
    sourceOnly: true,
    productionWrites: false,
    deployExecuted: false,
    deployCardSent: false,
    taskCardCreated: false,
    productionDeployAuthorized: false,
    ...overrides,
  };
}

test("approval request is ready only when acceptance, review, and packet boundaries are green", () => {
  const request = buildViteOwnerApprovalRequest({
    acceptance: acceptanceFixture(),
    ownerReview: ownerReviewFixture(),
    handoffPacket: handoffPacketFixture(),
  });
  assert.equal(request.ok, true);
  assert.equal(request.status, "ready_to_request_owner_approval");
  assert.equal(request.requestVersion, OWNER_APPROVAL_REQUEST_VERSION);
  assert.equal(request.requestId, stableRequestId());
  assert.equal(request.sourceOnly, true);
  assert.equal(request.productionWrites, false);
  assert.equal(request.deployExecuted, false);
  assert.equal(request.deployCardSent, false);
  assert.equal(request.taskCardCreated, false);
  assert.equal(request.productionDeployAuthorized, false);
  assert.equal(request.ownerApproval.acceptedByThisRequest, false);
  assert.equal(request.ownerApproval.requiredText, REQUIRED_OWNER_APPROVAL_TEXT);
  assert.deepEqual(request.afterApprovalSequence, [
    "create_fail_closed_cutover_source_change",
    "rerun_planned_validation",
    "convert_handoff_packet_into_real_deploy_lane_card",
    "central_mac_deploy_and_bounded_readback",
  ]);
});

test("approval request blocks when development acceptance has not passed", () => {
  const request = buildViteOwnerApprovalRequest({
    acceptance: acceptanceFixture({
      ok: false,
      status: "development_acceptance_failed",
      summary: {
        stepCount: 11,
        failedStepCount: 1,
        failedStepIds: ["vite_preview_routes_smoke"],
      },
      ownerApprovalRequest: {
        status: "blocked_by_failed_development_acceptance",
      },
    }),
    ownerReview: ownerReviewFixture(),
    handoffPacket: handoffPacketFixture(),
  });
  assert.equal(request.ok, false);
  assert.equal(request.status, "blocked");
  assert.deepEqual(request.blockedReasons, ["development_acceptance_not_ready"]);
  assert.equal(request.evidence.developmentAcceptance.failedStepIds[0], "vite_preview_routes_smoke");
});

test("approval request blocks if handoff packet does not remain blocked without approval", () => {
  const request = buildViteOwnerApprovalRequest({
    acceptance: acceptanceFixture(),
    ownerReview: ownerReviewFixture(),
    handoffPacket: handoffPacketFixture({
      ok: true,
      status: "handoff_packet_ready",
      blockedReason: "",
    }),
  });
  assert.equal(request.ok, false);
  assert.deepEqual(request.blockedReasons, ["handoff_packet_boundary_not_blocked"]);
});

test("approval request blocks if owner review is not ready", () => {
  const request = buildViteOwnerApprovalRequest({
    acceptance: acceptanceFixture(),
    ownerReview: ownerReviewFixture({
      ok: false,
      status: "blocked_by_development_readiness",
    }),
    handoffPacket: handoffPacketFixture(),
  });
  assert.equal(request.ok, false);
  assert.deepEqual(request.blockedReasons, ["owner_review_not_ready"]);
});

test("text formatter exposes the exact approval text and no production action claim", () => {
  const request = buildViteOwnerApprovalRequest({
    acceptance: acceptanceFixture(),
    ownerReview: ownerReviewFixture(),
    handoffPacket: handoffPacketFixture(),
  });
  const text = formatText(request);
  assert.match(text, /sourceOnly: true/);
  assert.match(text, /productionWrites: false/);
  assert.match(text, /deployExecuted: false/);
  assert.match(text, /deployCardSent: false/);
  assert.match(text, new RegExp(REQUIRED_OWNER_APPROVAL_TEXT));
});

test("argument parsing supports JSON and no-run-acceptance options", () => {
  assert.deepEqual(parseArgs(["--json", "--no-run-acceptance"]), {
    json: true,
    noRunAcceptance: true,
  });
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
