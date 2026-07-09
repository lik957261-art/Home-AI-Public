"use strict";

const assert = require("node:assert/strict");

const {
  aggregateDeployRequests,
  buildDeployLaneGovernanceReport,
  normalizeDeployRequest,
  validateCentralGovernanceWorkerCard,
  validateCentralOverride,
  validateDeployCardSourceAuthorization,
} = require("../adapters/central-deploy-governance-service");

function testWorkerDirectDeployCardIsBlocked() {
  const report = validateDeployCardSourceAuthorization({
    sourceRole: "home_ai_worker",
    sourceRef: "abc1234",
    dirtyState: { dirty: false },
  });
  assert.equal(report.ok, false);
  assert.equal(report.issueCode, "worker_direct_deploy_forbidden");
  assert.ok(report.issueCodes.includes("worker_direct_deploy_forbidden"));
}

function testCentralCoordinatorDeployCardIsAllowed() {
  const report = validateDeployCardSourceAuthorization({
    sourceRole: "central_deploy_coordinator",
    centralCoordinatorRef: "delivery_1",
    sourceRef: "abc1234",
    dirtyState: { dirty: false },
  });
  assert.equal(report.ok, true);
  assert.equal(report.sourceRole, "central_deploy_coordinator");
  assert.equal(report.centralCoordinatorRef, "delivery_1");
}

function testEmergencyOverrideRequiresBoundedMetadata() {
  const incomplete = validateCentralOverride({
    sourceRole: "repair_worker",
    centralOverride: true,
    overrideReason: "production availability",
  });
  assert.equal(incomplete.ok, false);
  assert.ok(incomplete.issues.some((issue) => issue.code === "central_override_authority_ref_required"));
  assert.ok(incomplete.issues.some((issue) => issue.code === "central_override_source_ref_required"));

  const accepted = validateDeployCardSourceAuthorization({
    sourceRole: "repair_worker",
    centralOverride: true,
    overrideReason: "production availability",
    ownerApprovalRef: "owner-approval-1",
    sourceRef: "fix1234",
    dirtyState: { dirty: false },
    validationSummary: ["node tests/hotfix.test.js"],
    requiredReadback: ["production status smoke"],
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.centralOverrideAccepted, true);
}

function testCentralGovernanceCardFromPluginSourceIsRejected() {
  const report = validateCentralGovernanceWorkerCard({
    sourceRole: "plugin_source_thread",
    category: "central_contract_governance",
    requiresMainThreadDesign: true,
    forbiddenDirectWorkerImplementation: true,
    targetThreadId: "019f1b7b-a4cf-7602-a813-dd1497b65f3f",
    taskCardId: "ttc_5c9dd2b26327404d00",
  });
  assert.equal(report.ok, false);
  assert.equal(report.issueCode, "platform_governance_card_must_start_from_home_ai_main");
  assert.equal(report.forbiddenDirectWorkerImplementation, true);
}

function testWorkerDeployRequestIsMetadataOnly() {
  const request = normalizeDeployRequest({
    needed: true,
    requestedByRole: "home_ai_worker",
    sourceWorkspace: "/Users/example/path",
    target: "home-ai",
    sourceRef: "abc1234",
    changedFiles: ["adapters/x.js"],
    validationSummary: ["node tests/x.test.js"],
    requiredReadback: ["production smoke"],
    dirtyState: { dirty: false },
  });
  assert.equal(request.ok, true);
  assert.equal(request.authorization, "metadata_only");
  assert.equal(request.deployAuthorized, false);
  assert.ok(request.issueCodes.includes("deploy_request_metadata_only"));
}

function testDivergentDeployRequestsRequireIntegration() {
  const report = aggregateDeployRequests([
    {
      needed: true,
      requestedByRole: "home_ai_worker",
      sourceWorkspace: "/Users/example/path",
      target: "home-ai",
      sourceRef: "ref-a",
      dirtyState: { dirty: false },
    },
    {
      needed: true,
      requestedByRole: "plugin_worker",
      sourceWorkspace: "/Users/example/path",
      target: "home-ai",
      sourceRef: "ref-b",
      dirtyState: { dirty: false },
    },
  ]);
  assert.equal(report.ok, false);
  assert.equal(report.issueCode, "deploy_request_requires_integration");
  assert.ok(report.issueCodes.includes("deploy_request_source_ref_divergent"));
  assert.equal(report.candidates[0].status, "integration_required");
}

function testGovernanceReportIsBounded() {
  const report = buildDeployLaneGovernanceReport({
    sourceRole: "home_ai_main",
    centralCoordinatorRef: "delivery-main",
    sourceRef: "abc123",
    dirtyState: { dirty: false },
  });
  assert.equal(report.ok, true);
  assert.deepEqual(Object.keys(report).sort(), [
    "centralCoordinatorRef",
    "centralOverride",
    "centralOverrideAccepted",
    "dirty",
    "issueCode",
    "issueCodes",
    "ok",
    "schemaVersion",
    "sourceRef",
    "sourceRole",
    "version",
  ].sort());
}

testWorkerDirectDeployCardIsBlocked();
testCentralCoordinatorDeployCardIsAllowed();
testEmergencyOverrideRequiresBoundedMetadata();
testCentralGovernanceCardFromPluginSourceIsRejected();
testWorkerDeployRequestIsMetadataOnly();
testDivergentDeployRequestsRequireIntegration();
testGovernanceReportIsBounded();
console.log("central deploy governance service tests passed");
