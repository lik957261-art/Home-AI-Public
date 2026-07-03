"use strict";

const assert = require("node:assert/strict");

const {
  OWNER_REVIEW_REPORT_VERSION,
  buildViteOwnerReviewReport,
  formatText,
  parseArgs,
} = require("../scripts/vite-owner-review-report");
const {
  PLANNED_DEPLOY_COMMAND,
  REQUIRED_PRODUCTION_READBACK_CHECKS,
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

function readinessFixture(overrides = {}) {
  return {
    ok: true,
    checkVersion: "test-readiness",
    sourceOnly: true,
    productionDeployAuthorized: false,
    requireBuiltAssets: true,
    summary: {
      checkCount: 7,
      failedCount: 0,
      warningCount: 0,
      requiredDevRouteCount: 9,
      requiredSourceFileCount: 21,
      requiredTestFileCount: 22,
    },
    checks: [],
    ...overrides,
  };
}

test("report is source-only and waits for owner approval after readiness passes", () => {
  const report = buildViteOwnerReviewReport({
    readiness: readinessFixture(),
    env: {},
  });
  assert.equal(report.ok, true);
  assert.equal(report.status, "ready_for_owner_review");
  assert.equal(report.reportVersion, OWNER_REVIEW_REPORT_VERSION);
  assert.equal(report.sourceOnly, true);
  assert.equal(report.productionWrites, false);
  assert.equal(report.deployExecuted, false);
  assert.equal(report.productionDeployAuthorized, false);
  assert.equal(report.ownerApproval.required, true);
  assert.equal(report.ownerApproval.approved, false);
  assert.equal(report.ownerApproval.code, "owner_approval_required");
  assert.equal(report.ownerApproval.requiredText, REQUIRED_OWNER_APPROVAL_TEXT);
  assert.equal(report.productionCutover.blockedReason, "owner_approval_required");
  assert.equal(report.deploymentReadback.status, "not_started");
  assert.equal(report.deploymentReadback.requiredAfterApproval, REQUIRED_PRODUCTION_READBACK_CHECKS);
});

test("exact owner approval still only permits a separate cutover source change", () => {
  const report = buildViteOwnerReviewReport({
    readiness: readinessFixture(),
    ownerApprovalText: REQUIRED_OWNER_APPROVAL_TEXT,
  });
  assert.equal(report.ok, true);
  assert.equal(report.status, "approved_to_create_cutover_source_change");
  assert.equal(report.ownerApproval.approved, true);
  assert.equal(report.productionWrites, false);
  assert.equal(report.deployExecuted, false);
  assert.equal(report.productionDeployAuthorized, false);
  assert.equal(report.productionCutover.cutoverImplementation.status, "not_created");
  assert.equal(report.productionCutover.plannedDeployCommand, PLANNED_DEPLOY_COMMAND);
  assert.equal(report.productionCutover.plannedValidationCommands.includes("node tests/vite-plugin-host-model.test.js"), true);
  assert.equal(report.deploymentReadback.requiredAfterApproval.some((check) => check.id === "selected_shell_mode"), true);
  assert.equal(report.deploymentReadback.requiredAfterApproval.some((check) => check.id === "plugin_host_manifest_proxy"), true);
  assert.equal(report.deploymentReadback.requiredAfterApproval.some((check) => check.id === "document_preview_delivery"), true);
  assert.equal(report.deploymentReadback.requiredAfterApproval.some((check) => check.id === "rollback_switch"), true);
  assert.equal(report.nextActions.some((action) => action.includes("fail-closed production cutover source change")), true);
});

test("readiness failures block owner review and list failed checks", () => {
  const report = buildViteOwnerReviewReport({
    readiness: readinessFixture({
      ok: false,
      summary: {
        checkCount: 7,
        failedCount: 1,
        warningCount: 0,
        requiredDevRouteCount: 9,
        requiredSourceFileCount: 21,
        requiredTestFileCount: 22,
      },
      checks: [
        {
          id: "built_preview_assets",
          status: "fail",
          summary: "Built Vite preview assets are required but missing",
        },
      ],
    }),
    ownerApprovalText: REQUIRED_OWNER_APPROVAL_TEXT,
  });
  assert.equal(report.ok, false);
  assert.equal(report.status, "blocked_by_development_readiness");
  assert.equal(report.productionCutover.blockedReason, "vite_development_readiness_failed");
  assert.deepEqual(report.developmentReadiness.failedChecks, [
    {
      id: "built_preview_assets",
      summary: "Built Vite preview assets are required but missing",
    },
  ]);
  assert.equal(report.nextActions[0], "Fix failed Vite development readiness checks.");
});

test("text formatter includes the production safety boundary", () => {
  const report = buildViteOwnerReviewReport({
    readiness: readinessFixture(),
    env: {},
  });
  const text = formatText(report);
  assert.match(text, /sourceOnly: true/);
  assert.match(text, /productionWrites: false/);
  assert.match(text, /deployExecuted: false/);
  assert.match(text, /ownerApproval: owner_approval_required/);
});

test("argument parsing supports approval and built-asset options", () => {
  const options = parseArgs([
    "--json",
    "--no-require-built-assets",
    `--owner-approval-text=${REQUIRED_OWNER_APPROVAL_TEXT}`,
  ]);
  assert.equal(options.json, true);
  assert.equal(options.requireBuiltAssets, false);
  assert.equal(options.ownerApprovalText, REQUIRED_OWNER_APPROVAL_TEXT);

  const requiredOptions = parseArgs(["--require-built-assets"]);
  assert.equal(requiredOptions.requireBuiltAssets, true);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
