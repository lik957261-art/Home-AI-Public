"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  REQUIRED_OWNER_APPROVAL_TEXT,
  evaluateOwnerApproval,
  runViteProductionCutoverPreflight,
} = require("./vite-production-cutover-preflight");
const {
  buildViteProductionCutoverHandoffPacket,
} = require("./vite-production-cutover-handoff-packet");
const {
  validateViteCutoverSourceChange,
} = require("./vite-cutover-source-change-validator");
const {
  validateViteProductionReadback,
} = require("./vite-production-readback-validator");

const GOAL_STATE_AUDIT_VERSION = "20260703-vite-goal-state-audit-v1";

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    json: false,
    requireComplete: false,
    requireBuiltAssets: true,
    ownerApprovalText: "",
    acceptanceJson: "",
    cutoverSourceContractJson: "",
    productionReadbackJson: "",
    repoRoot: path.resolve(__dirname, ".."),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--require-complete") {
      options.requireComplete = true;
    } else if (arg === "--no-require-built-assets") {
      options.requireBuiltAssets = false;
    } else if (arg === "--owner-approval-text") {
      options.ownerApprovalText = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--owner-approval-text=")) {
      options.ownerApprovalText = arg.slice("--owner-approval-text=".length);
    } else if (arg === "--acceptance-json") {
      options.acceptanceJson = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--acceptance-json=")) {
      options.acceptanceJson = arg.slice("--acceptance-json=".length);
    } else if (arg === "--cutover-source-contract-json") {
      options.cutoverSourceContractJson = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--cutover-source-contract-json=")) {
      options.cutoverSourceContractJson = arg.slice("--cutover-source-contract-json=".length);
    } else if (arg === "--production-readback-json") {
      options.productionReadbackJson = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--production-readback-json=")) {
      options.productionReadbackJson = arg.slice("--production-readback-json=".length);
    } else if (arg === "--repo-root") {
      options.repoRoot = path.resolve(argv[index + 1] || options.repoRoot);
      index += 1;
    } else if (arg.startsWith("--repo-root=")) {
      options.repoRoot = path.resolve(arg.slice("--repo-root=".length));
    }
  }

  return options;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function loadOptionalJson(filePath, errorCode) {
  if (!filePath) return { payload: null, error: errorCode };
  try {
    return { payload: readJsonFile(filePath), error: "" };
  } catch (error) {
    return { payload: null, error: `${errorCode}_unreadable: ${error.message}` };
  }
}

function evaluateAcceptancePayload(payload, sourceError = "") {
  if (!payload) {
    return {
      ok: false,
      status: "not_supplied",
      code: sourceError || "development_acceptance_json_required",
      summary: "Development acceptance JSON from npm run verify:vite-dev is required for final completion.",
    };
  }
  const checks = [
    ["ok", payload.ok === true],
    ["status", payload.status === "development_acceptance_passed"],
    ["sourceOnly", payload.sourceOnly === true],
    ["productionWrites", payload.productionWrites === false],
    ["deployExecuted", payload.deployExecuted === false],
    ["productionDeployAuthorized", payload.productionDeployAuthorized === false],
    ["failedStepCount", payload.summary && payload.summary.failedStepCount === 0],
  ];
  const failed = checks.filter(([, passed]) => !passed).map(([id]) => id);
  return {
    ok: failed.length === 0,
    status: failed.length ? "invalid" : "verified",
    code: failed.length ? "development_acceptance_invalid" : "development_acceptance_verified",
    failed,
    summary: failed.length
      ? "Development acceptance JSON does not prove the source-only Vite development gate."
      : "Development acceptance JSON proves the source-only Vite development gate.",
    stepCount: payload.summary ? payload.summary.stepCount : null,
    passedStepCount: payload.summary ? payload.summary.passedStepCount : null,
  };
}

function phase(id, ok, status, summary, extra = {}) {
  return {
    id,
    ok: Boolean(ok),
    status,
    summary,
    ...extra,
  };
}

function buildViteGoalStateAudit(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, ".."));
  const env = options.env || process.env;
  const ownerApprovalText =
    options.ownerApprovalText || env.HOMEAI_VITE_CUTOVER_OWNER_APPROVAL_TEXT || "";
  const acceptanceSource = options.acceptancePayload
    ? { payload: options.acceptancePayload, error: "" }
    : loadOptionalJson(options.acceptanceJson, "development_acceptance_json_required");
  const acceptance = evaluateAcceptancePayload(acceptanceSource.payload, acceptanceSource.error);
  const ownerApproval = evaluateOwnerApproval(ownerApprovalText);
  const preflight = runViteProductionCutoverPreflight({
    repoRoot,
    ownerApprovalText,
    requireBuiltAssets: options.requireBuiltAssets !== false,
    env,
    readiness: options.readiness,
  });
  const handoffPacket = buildViteProductionCutoverHandoffPacket({
    repoRoot,
    ownerApprovalText,
    requireBuiltAssets: options.requireBuiltAssets !== false,
    env,
    readiness: options.readiness,
    preflight,
  });
  const cutoverSourceChange = options.cutoverSourcePayload
    ? validateViteCutoverSourceChange({ payload: options.cutoverSourcePayload, repoRoot })
    : validateViteCutoverSourceChange({
      repoRoot,
      contractJson: options.cutoverSourceContractJson || "",
    });
  const productionReadback = options.productionReadbackPayload
    ? validateViteProductionReadback({ payload: options.productionReadbackPayload })
    : validateViteProductionReadback({
      readbackJson: options.productionReadbackJson || "",
    });

  const phases = [
    phase(
      "development_readiness",
      preflight.readinessSummary && preflight.readinessSummary.ok,
      preflight.readinessSummary && preflight.readinessSummary.ok ? "verified" : "failed",
      "Vite development readiness gate.",
      preflight.readinessSummary || {},
    ),
    phase(
      "development_acceptance",
      acceptance.ok,
      acceptance.status,
      acceptance.summary,
      { code: acceptance.code, failed: acceptance.failed || [] },
    ),
    phase(
      "owner_approval",
      ownerApproval.approved,
      ownerApproval.status,
      ownerApproval.summary,
      { code: ownerApproval.code },
    ),
    phase(
      "cutover_source_change",
      cutoverSourceChange.ok,
      cutoverSourceChange.status,
      "Separate fail-closed cutover source-change contract.",
      { blockedReason: cutoverSourceChange.blockedReason, missingAssertions: cutoverSourceChange.missingAssertions },
    ),
    phase(
      "deploy_lane_packet",
      handoffPacket.ok,
      handoffPacket.status,
      "Source-only deploy-lane packet state.",
      {
        blockedReason: handoffPacket.blockedReason,
        deployCardSent: handoffPacket.deployCardSent,
        taskCardCreated: handoffPacket.taskCardCreated,
      },
    ),
    phase(
      "production_readback",
      productionReadback.ok,
      productionReadback.status,
      "Bounded production deploy/readback JSON.",
      {
        blockedReason: productionReadback.blockedReason,
        missing: productionReadback.missing,
        failed: productionReadback.failed,
      },
    ),
  ];

  const incomplete = phases.filter((entry) => !entry.ok);
  const ok = incomplete.length === 0;

  return {
    ok,
    status: ok ? "goal_complete_verified" : "goal_incomplete",
    auditVersion: GOAL_STATE_AUDIT_VERSION,
    sourceOnly: true,
    productionWrites: false,
    deployExecuted: false,
    productionDeployVerified: productionReadback.ok,
    ownerApprovalRequiredText: REQUIRED_OWNER_APPROVAL_TEXT,
    summary: {
      phaseCount: phases.length,
      completedPhaseCount: phases.length - incomplete.length,
      incompletePhaseCount: incomplete.length,
      incompletePhaseIds: incomplete.map((entry) => entry.id),
    },
    phases,
    nextActions: ok
      ? [
        "Record final production cutover closure with bounded readback evidence.",
      ]
      : [
        "Do not mark the Vite migration goal complete.",
        "Complete the incomplete phases in order without bypassing Owner approval or deploy-lane readback.",
      ],
  };
}

function formatText(result) {
  const lines = [
    `Vite goal state audit: ${result.status}`,
    `version: ${result.auditVersion}`,
    `sourceOnly: ${result.sourceOnly}`,
    `productionWrites: ${result.productionWrites}`,
    `deployExecuted: ${result.deployExecuted}`,
    `productionDeployVerified: ${result.productionDeployVerified}`,
    `phases: ${result.summary.completedPhaseCount}/${result.summary.phaseCount}`,
  ];
  if (result.summary.incompletePhaseIds.length) {
    lines.push(`incomplete: ${result.summary.incompletePhaseIds.join(", ")}`);
  }
  for (const action of result.nextActions) {
    lines.push(`- ${action}`);
  }
  return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = buildViteGoalStateAudit(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(formatText(result));
  }
  if (options.requireComplete && !result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  GOAL_STATE_AUDIT_VERSION,
  buildViteGoalStateAudit,
  evaluateAcceptancePayload,
  formatText,
  parseArgs,
};
