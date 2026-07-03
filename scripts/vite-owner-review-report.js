"use strict";

const path = require("node:path");

const {
  runViteDevelopmentReadinessCheck,
} = require("./vite-development-readiness-check");
const {
  PLANNED_DEPLOY_COMMAND,
  PLANNED_VALIDATION_COMMANDS,
  REQUIRED_PRODUCTION_READBACK_CHECKS,
  REQUIRED_OWNER_APPROVAL_TEXT,
  runViteProductionCutoverPreflight,
} = require("./vite-production-cutover-preflight");

const OWNER_REVIEW_REPORT_VERSION = "20260703-vite-owner-review-report-v1";

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    json: false,
    ownerApprovalText: "",
    requireBuiltAssets: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--require-built-assets") {
      options.requireBuiltAssets = true;
    } else if (arg === "--no-require-built-assets") {
      options.requireBuiltAssets = false;
    } else if (arg === "--owner-approval-text") {
      options.ownerApprovalText = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--owner-approval-text=")) {
      options.ownerApprovalText = arg.slice("--owner-approval-text=".length);
    }
  }

  return options;
}

function summarizeChecks(readiness, status) {
  return (readiness.checks || [])
    .filter((check) => check.status === status)
    .map((check) => ({
      id: check.id,
      summary: check.summary,
    }));
}

function buildReviewVerdict(readinessOk, approval) {
  if (!readinessOk) {
    return {
      status: "blocked_by_development_readiness",
      summary: "Development readiness must pass before Owner production-cutover review.",
    };
  }
  if (approval.approved) {
    return {
      status: "approved_to_create_cutover_source_change",
      summary: "Owner approval text is present; the next step is a separate fail-closed production cutover source change.",
    };
  }
  return {
    status: "ready_for_owner_review",
    summary: "Development evidence is ready for Owner review; production cutover is not approved.",
  };
}

function buildNextActions(verdictStatus) {
  if (verdictStatus === "blocked_by_development_readiness") {
    return [
      "Fix failed Vite development readiness checks.",
      "Re-run npm run build:vite, npm run check:vite-readiness, and npm run review:vite-cutover.",
      "Do not request production cutover approval until readiness is green.",
    ];
  }
  if (verdictStatus === "approved_to_create_cutover_source_change") {
    return [
      "Create a separate fail-closed production cutover source change.",
      "Run the planned validation commands after the source change.",
      "Route deployment and readback through the central Mac deploy contract only after validation passes.",
    ];
  }
  return [
    "Review this source-only report with Owner.",
    "Keep production on the classic shell unless Owner gives the exact approval text.",
    "Do not create a production cutover source change or deploy-lane card before approval.",
  ];
}

function buildViteOwnerReviewReport(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, ".."));
  const requireBuiltAssets = options.requireBuiltAssets !== false;
  const env = options.env || process.env;
  const ownerApprovalText =
    options.ownerApprovalText || env.HOMEAI_VITE_CUTOVER_OWNER_APPROVAL_TEXT || "";
  const readiness =
    options.readiness ||
    runViteDevelopmentReadinessCheck({
      repoRoot,
      requireBuiltAssets,
    });
  const cutoverPreflight =
    options.cutoverPreflight ||
    runViteProductionCutoverPreflight({
      repoRoot,
      readiness,
      ownerApprovalText,
      requireBuiltAssets,
      env,
    });

  const readinessOk = Boolean(readiness && readiness.ok);
  const approval = cutoverPreflight.ownerApproval || {
    approved: false,
    code: "owner_approval_required",
  };
  const verdict = buildReviewVerdict(readinessOk, approval);

  return {
    ok: readinessOk,
    status: verdict.status,
    reportVersion: OWNER_REVIEW_REPORT_VERSION,
    generatedAt: new Date().toISOString(),
    sourceOnly: true,
    productionWrites: false,
    deployExecuted: false,
    productionDeployAuthorized: false,
    developmentReadiness: {
      ok: readinessOk,
      status: readinessOk ? "passed" : "failed",
      checkVersion: readiness.checkVersion,
      requireBuiltAssets: Boolean(readiness.requireBuiltAssets),
      summary: readiness.summary,
      failedChecks: summarizeChecks(readiness, "fail"),
      warningChecks: summarizeChecks(readiness, "warning"),
    },
    ownerApproval: {
      required: true,
      approved: Boolean(approval.approved),
      code: approval.code,
      requiredText: REQUIRED_OWNER_APPROVAL_TEXT,
    },
    productionCutover: {
      status: cutoverPreflight.status,
      blockedReason: cutoverPreflight.blockedReason || "",
      cutoverImplementation: cutoverPreflight.cutoverImplementation,
      plannedValidationCommands: PLANNED_VALIDATION_COMMANDS,
      plannedDeployCommand: PLANNED_DEPLOY_COMMAND,
    },
    deploymentReadback: {
      status: "not_started",
      summary: "No production deployment or readback has been executed by this source-only review report.",
      requiredAfterApproval:
        cutoverPreflight.requiredProductionReadback || REQUIRED_PRODUCTION_READBACK_CHECKS,
    },
    verdict,
    nextActions: buildNextActions(verdict.status),
  };
}

function formatText(report) {
  const lines = [
    `Vite Owner review report: ${report.status}`,
    `version: ${report.reportVersion}`,
    `sourceOnly: ${report.sourceOnly}`,
    `productionWrites: ${report.productionWrites}`,
    `deployExecuted: ${report.deployExecuted}`,
    `productionDeployAuthorized: ${report.productionDeployAuthorized}`,
    `developmentReadiness: ${report.developmentReadiness.status}`,
    `ownerApproval: ${report.ownerApproval.code}`,
    `productionCutover: ${report.productionCutover.status}`,
    `verdict: ${report.verdict.summary}`,
  ];
  if (report.productionCutover.blockedReason) {
    lines.push(`blockedReason: ${report.productionCutover.blockedReason}`);
  }
  if (report.developmentReadiness.failedChecks.length) {
    lines.push("failedChecks:");
    for (const check of report.developmentReadiness.failedChecks) {
      lines.push(`- ${check.id}: ${check.summary}`);
    }
  }
  lines.push("nextActions:");
  for (const action of report.nextActions) {
    lines.push(`- ${action}`);
  }
  return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const report = buildViteOwnerReviewReport(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(formatText(report));
  }
  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  OWNER_REVIEW_REPORT_VERSION,
  buildViteOwnerReviewReport,
  formatText,
  parseArgs,
};
