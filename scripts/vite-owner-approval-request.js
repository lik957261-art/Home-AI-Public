"use strict";

const crypto = require("node:crypto");
const path = require("node:path");

const {
  buildViteDevelopmentAcceptanceReport,
} = require("./vite-development-acceptance-report");
const {
  buildViteOwnerReviewReport,
} = require("./vite-owner-review-report");
const {
  buildViteProductionCutoverHandoffPacket,
} = require("./vite-production-cutover-handoff-packet");
const {
  REQUIRED_OWNER_APPROVAL_TEXT,
} = require("./vite-production-cutover-preflight");

const OWNER_APPROVAL_REQUEST_VERSION = "20260703-vite-owner-approval-request-v1";

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    json: false,
    noRunAcceptance: false,
  };

  for (const arg of argv) {
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--no-run-acceptance") {
      options.noRunAcceptance = true;
    }
  }

  return options;
}

function stableRequestId() {
  const hash = crypto
    .createHash("sha256")
    .update(`home-ai-vite-production-cutover\0${REQUIRED_OWNER_APPROVAL_TEXT}`)
    .digest("hex")
    .slice(0, 16);
  return `vite_cutover_owner_approval_${hash}`;
}

function summarizeAcceptance(acceptance) {
  return {
    ok: Boolean(acceptance && acceptance.ok),
    status: acceptance && acceptance.status,
    stepCount: acceptance && acceptance.summary ? acceptance.summary.stepCount : null,
    failedStepCount: acceptance && acceptance.summary ? acceptance.summary.failedStepCount : null,
    failedStepIds: acceptance && acceptance.summary ? acceptance.summary.failedStepIds : [],
    approvalRequestStatus:
      acceptance && acceptance.ownerApprovalRequest
        ? acceptance.ownerApprovalRequest.status
        : "missing",
  };
}

function buildViteOwnerApprovalRequest(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, ".."));
  const env = {
    ...(options.env || process.env),
    HOMEAI_VITE_CUTOVER_OWNER_APPROVAL_TEXT: "",
  };

  const acceptance =
    options.acceptance ||
    (options.noRunAcceptance
      ? null
      : buildViteDevelopmentAcceptanceReport({
        repoRoot,
        env,
        runner: options.runner,
      }));
  const ownerReview =
    options.ownerReview ||
    buildViteOwnerReviewReport({
      repoRoot,
      env,
      requireBuiltAssets: options.requireBuiltAssets !== false,
    });
  const handoffPacket =
    options.handoffPacket ||
    buildViteProductionCutoverHandoffPacket({
      repoRoot,
      env,
      requireBuiltAssets: options.requireBuiltAssets !== false,
    });

  const acceptanceSummary = summarizeAcceptance(acceptance);
  const ownerReviewReady = Boolean(
    ownerReview &&
      ownerReview.ok &&
      ownerReview.status === "ready_for_owner_review" &&
      ownerReview.productionWrites === false &&
      ownerReview.deployExecuted === false &&
      ownerReview.productionDeployAuthorized === false,
  );
  const packetBlockedCorrectly = Boolean(
    handoffPacket &&
      handoffPacket.ok === false &&
      handoffPacket.status === "blocked" &&
      handoffPacket.blockedReason === "owner_approval_required" &&
      handoffPacket.productionWrites === false &&
      handoffPacket.deployExecuted === false &&
      handoffPacket.deployCardSent === false &&
      handoffPacket.taskCardCreated === false &&
      handoffPacket.productionDeployAuthorized === false,
  );
  const acceptanceReady = Boolean(
    acceptanceSummary.ok &&
      acceptanceSummary.status === "development_acceptance_passed" &&
      acceptanceSummary.failedStepCount === 0 &&
      acceptanceSummary.approvalRequestStatus === "ready_to_request_owner_approval",
  );
  const ok = acceptanceReady && ownerReviewReady && packetBlockedCorrectly;
  const blockedReasons = [];
  if (!acceptanceReady) blockedReasons.push("development_acceptance_not_ready");
  if (!ownerReviewReady) blockedReasons.push("owner_review_not_ready");
  if (!packetBlockedCorrectly) blockedReasons.push("handoff_packet_boundary_not_blocked");

  return {
    ok,
    status: ok ? "ready_to_request_owner_approval" : "blocked",
    blockedReasons,
    requestVersion: OWNER_APPROVAL_REQUEST_VERSION,
    requestId: stableRequestId(),
    generatedAt: new Date().toISOString(),
    sourceOnly: true,
    productionWrites: false,
    deployExecuted: false,
    deployCardSent: false,
    taskCardCreated: false,
    productionDeployAuthorized: false,
    ownerApproval: {
      required: true,
      acceptedByThisRequest: false,
      requiredText: REQUIRED_OWNER_APPROVAL_TEXT,
      exactApprovalRequired: true,
    },
    evidence: {
      developmentAcceptance: acceptanceSummary,
      ownerReview: {
        ok: Boolean(ownerReview && ownerReview.ok),
        status: ownerReview && ownerReview.status,
        productionWrites: ownerReview && ownerReview.productionWrites,
        deployExecuted: ownerReview && ownerReview.deployExecuted,
        productionDeployAuthorized: ownerReview && ownerReview.productionDeployAuthorized,
      },
      handoffPacket: {
        ok: Boolean(handoffPacket && handoffPacket.ok),
        status: handoffPacket && handoffPacket.status,
        blockedReason: handoffPacket && handoffPacket.blockedReason,
        deployCardSent: handoffPacket && handoffPacket.deployCardSent,
        taskCardCreated: handoffPacket && handoffPacket.taskCardCreated,
        productionDeployAuthorized: handoffPacket && handoffPacket.productionDeployAuthorized,
      },
    },
    afterApprovalSequence: [
      "create_fail_closed_cutover_source_change",
      "rerun_planned_validation",
      "convert_handoff_packet_into_real_deploy_lane_card",
      "central_mac_deploy_and_bounded_readback",
    ],
    nextActions: ok
      ? [
        "Present the exact Owner approval text in the active implementation thread.",
        "Do not create the production cutover source change until that exact approval is provided.",
        "Do not send a deploy-lane card until the separate cutover source change exists and validation passes.",
      ]
      : [
        "Fix the blocked reasons before requesting Owner approval.",
        "Keep current production deployment state unchanged.",
        "Do not create a production cutover source change or deploy-lane card.",
      ],
  };
}

function formatText(request) {
  const lines = [
    `Vite Owner approval request: ${request.status}`,
    `version: ${request.requestVersion}`,
    `requestId: ${request.requestId}`,
    `sourceOnly: ${request.sourceOnly}`,
    `productionWrites: ${request.productionWrites}`,
    `deployExecuted: ${request.deployExecuted}`,
    `deployCardSent: ${request.deployCardSent}`,
    `productionDeployAuthorized: ${request.productionDeployAuthorized}`,
  ];
  if (request.blockedReasons.length) {
    lines.push(`blockedReasons: ${request.blockedReasons.join(", ")}`);
  }
  lines.push("requiredOwnerApprovalText:");
  lines.push(request.ownerApproval.requiredText);
  lines.push("nextActions:");
  for (const action of request.nextActions) {
    lines.push(`- ${action}`);
  }
  return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const request = buildViteOwnerApprovalRequest(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(request, null, 2)}\n`);
  } else {
    process.stdout.write(formatText(request));
  }
  if (!request.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  OWNER_APPROVAL_REQUEST_VERSION,
  buildViteOwnerApprovalRequest,
  formatText,
  parseArgs,
  stableRequestId,
};
