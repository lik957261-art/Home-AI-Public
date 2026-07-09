"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const {
  REQUIRED_OWNER_APPROVAL_TEXT,
} = require("./vite-production-cutover-preflight");

const ACCEPTANCE_REPORT_VERSION = "20260703-vite-development-acceptance-v1";
const OUTPUT_TAIL_LIMIT = 1600;

const ACCEPTANCE_STEPS = Object.freeze([
  {
    id: "build_vite",
    summary: "Build Vite development preview assets.",
    command: ["npm", "run", "--silent", "build:vite"],
  },
  {
    id: "audit_vite_globals",
    summary: "Verify Vite and migrated classic slices do not use unmanaged browser globals.",
    command: ["npm", "run", "--silent", "audit:vite-globals", "--", "--json"],
    json: true,
    expectations: [
      { path: "ok", equals: true },
      { path: "unmanagedCount", equals: 0 },
    ],
  },
  {
    id: "vite_preview_routes_smoke",
    summary: "Open all Vite preview routes in a mobile Playwright viewport.",
    command: ["node", "tests/vite-dev-preview-routes-smoke.test.js"],
    json: true,
    expectations: [
      { path: "ok", equals: true },
      { path: "routeCount", min: 9 },
    ],
  },
  {
    id: "vite_real_backend_parity_smoke",
    summary: "Verify Vite dev proxy against a real local Home AI backend fixture.",
    command: ["node", "tests/vite-dev-real-backend-parity-smoke.test.js"],
  },
  {
    id: "vite_dev_user_journeys_smoke",
    summary: "Exercise source-only Vite dev user journeys for Composer, attachments, plugin iframe, Owner Console, document preview, and voice cancel.",
    command: ["npm", "run", "--silent", "smoke:vite-dev-user-journeys"],
    json: true,
    expectations: [
      { path: "ok", equals: true },
      { path: "sourceOnly", equals: true },
      { path: "productionWrites", equals: false },
      { path: "deployExecuted", equals: false },
      { path: "journeyCount", min: 5 },
    ],
  },
  {
    id: "vite_development_readiness",
    summary: "Run the source-only Vite development readiness gate.",
    command: ["npm", "run", "--silent", "check:vite-readiness"],
    json: true,
    expectations: [
      { path: "ok", equals: true },
      { path: "sourceOnly", equals: true },
      { path: "ownerApprovalRequired", equals: true },
      { path: "productionDeployAuthorized", equals: false },
    ],
  },
  {
    id: "vite_preview_cache_policy",
    summary: "Verify Vite preview cache policy boundaries and production shell exclusion.",
    command: ["npm", "run", "--silent", "check:vite-cache-policy"],
    json: true,
    expectations: [
      { path: "ok", equals: true },
      { path: "sourceOnly", equals: true },
      { path: "productionWrites", equals: false },
      { path: "deployExecuted", equals: false },
      { path: "productionDeployAuthorized", equals: false },
      { path: "productionCutoverCacheReady", equals: false },
    ],
  },
  {
    id: "vite_owner_review_report",
    summary: "Generate the source-only Owner review report without production approval.",
    command: ["npm", "run", "--silent", "review:vite-cutover"],
    json: true,
    expectations: [
      { path: "ok", equals: true },
      { path: "status", equals: "ready_for_owner_review" },
      { path: "sourceOnly", equals: true },
      { path: "productionWrites", equals: false },
      { path: "deployExecuted", equals: false },
      { path: "productionDeployAuthorized", equals: false },
      { path: "ownerApproval.approved", equals: false },
    ],
  },
  {
    id: "vite_cutover_preflight_blocked",
    summary: "Confirm production cutover remains blocked without exact Owner approval.",
    command: ["npm", "run", "--silent", "plan:vite-cutover"],
    json: true,
    expectations: [
      { path: "ok", equals: false },
      { path: "status", equals: "blocked" },
      { path: "blockedReason", equals: "owner_approval_required" },
      { path: "sourceOnly", equals: true },
      { path: "productionWrites", equals: false },
      { path: "deployExecuted", equals: false },
      { path: "productionDeployAuthorized", equals: false },
    ],
  },
  {
    id: "vite_cutover_handoff_packet_blocked",
    summary: "Confirm cutover handoff packet creates no card without exact Owner approval.",
    command: ["npm", "run", "--silent", "packet:vite-cutover"],
    json: true,
    expectations: [
      { path: "ok", equals: false },
      { path: "status", equals: "blocked" },
      { path: "blockedReason", equals: "owner_approval_required" },
      { path: "sourceOnly", equals: true },
      { path: "productionWrites", equals: false },
      { path: "deployExecuted", equals: false },
      { path: "deployCardSent", equals: false },
      { path: "taskCardCreated", equals: false },
      { path: "productionDeployAuthorized", equals: false },
    ],
  },
  {
    id: "vite_production_readback_validator_contract",
    summary: "Verify the future production readback JSON validator contract.",
    command: ["node", "tests/vite-production-readback-validator.test.js"],
  },
  {
    id: "vite_cutover_source_change_validator_contract",
    summary: "Verify the future production cutover source-change validator contract.",
    command: ["node", "tests/vite-cutover-source-change-validator.test.js"],
  },
  {
    id: "vite_goal_state_audit_contract",
    summary: "Verify the full Vite goal-state audit contract.",
    command: ["node", "tests/vite-goal-state-audit.test.js"],
  },
  {
    id: "repo_static_check",
    summary: "Run the repository static check gate after Vite acceptance steps.",
    command: ["npm", "run", "--silent", "check"],
  },
  {
    id: "local_full_test_gate",
    summary: "Run the local full test gate; install and deploy lane tests remain out of scope.",
    command: ["npm", "test", "--silent"],
  },
  {
    id: "diff_hygiene",
    summary: "Verify the worktree diff has no whitespace or conflict-marker issues.",
    command: ["git", "diff", "--check"],
  },
]);

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    json: false,
  };
  for (const arg of argv) {
    if (arg === "--json") options.json = true;
  }
  return options;
}

function tail(text, limit = OUTPUT_TAIL_LIMIT) {
  const value = String(text || "");
  if (value.length <= limit) return value;
  return value.slice(value.length - limit);
}

function getPath(object, dottedPath) {
  return String(dottedPath || "")
    .split(".")
    .filter(Boolean)
    .reduce((value, part) => {
      if (value && Object.prototype.hasOwnProperty.call(value, part)) {
        return value[part];
      }
      return undefined;
    }, object);
}

function parseJsonFromOutput(output) {
  const text = String(output || "").trim();
  if (!text) throw new Error("empty JSON output");
  try {
    return JSON.parse(text);
  } catch (_directError) {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) {
      throw new Error("JSON object not found in command output");
    }
    return JSON.parse(text.slice(firstBrace, lastBrace + 1));
  }
}

function evaluateExpectation(payload, expectation) {
  const actual = getPath(payload, expectation.path);
  if (Object.prototype.hasOwnProperty.call(expectation, "equals") && actual !== expectation.equals) {
    return `${expectation.path} expected ${JSON.stringify(expectation.equals)} but received ${JSON.stringify(actual)}`;
  }
  if (Object.prototype.hasOwnProperty.call(expectation, "min") && !(Number(actual) >= expectation.min)) {
    return `${expectation.path} expected >= ${expectation.min} but received ${JSON.stringify(actual)}`;
  }
  return "";
}

function assertNoProductionCommands(steps = ACCEPTANCE_STEPS) {
  const forbidden = [
    "deploy:macos",
    "install:macos",
    "--execute",
    "deploy-macos-production.js",
    "install-macos-production.sh",
  ];
  const findings = [];
  for (const step of steps) {
    const commandText = (step.command || []).join(" ");
    for (const pattern of forbidden) {
      if (commandText.includes(pattern)) findings.push({ stepId: step.id, pattern });
    }
  }
  return findings;
}

function defaultRunner({ command, args, cwd, env }) {
  return spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 24,
  });
}

function buildOwnerApprovalRequest(ok) {
  if (!ok) {
    return {
      status: "blocked_by_failed_development_acceptance",
      requiredForProduction: true,
      requiredText: REQUIRED_OWNER_APPROVAL_TEXT,
      sourceOnly: true,
      productionWrites: false,
      deployExecuted: false,
      deployCardSent: false,
      nextAllowedAction: "fix_failed_development_acceptance",
    };
  }

  return {
    status: "ready_to_request_owner_approval",
    requiredForProduction: true,
    requiredText: REQUIRED_OWNER_APPROVAL_TEXT,
    sourceOnly: true,
    productionWrites: false,
    deployExecuted: false,
    deployCardSent: false,
    nextAllowedAction: "request_exact_owner_approval",
    afterApprovalSequence: [
      "create_fail_closed_cutover_source_change",
      "rerun_planned_validation",
      "convert_handoff_packet_into_real_deploy_lane_card",
      "central_mac_deploy_and_bounded_readback",
    ],
  };
}

function summarizeJsonPayload(stepId, payload) {
  if (stepId === "audit_vite_globals") {
    return {
      ok: payload.ok,
      unmanagedCount: payload.unmanagedCount,
      occurrenceCount: payload.occurrenceCount,
    };
  }
  if (stepId === "vite_preview_routes_smoke") {
    return {
      ok: payload.ok,
      routeCount: payload.routeCount,
      routes: Array.isArray(payload.routes) ? payload.routes.map((route) => route.path) : [],
    };
  }
  if (stepId === "vite_dev_user_journeys_smoke") {
    return {
      ok: payload.ok,
      sourceOnly: payload.sourceOnly,
      productionWrites: payload.productionWrites,
      deployExecuted: payload.deployExecuted,
      journeyCount: payload.journeyCount,
      journeys: Array.isArray(payload.journeys) ? payload.journeys : [],
    };
  }
  if (stepId === "vite_development_readiness") {
    return {
      ok: payload.ok,
      sourceOnly: payload.sourceOnly,
      requiredDevRouteCount: payload.summary && payload.summary.requiredDevRouteCount,
      requiredSourceFileCount: payload.summary && payload.summary.requiredSourceFileCount,
      requiredTestFileCount: payload.summary && payload.summary.requiredTestFileCount,
      failedCount: payload.summary && payload.summary.failedCount,
      warningCount: payload.summary && payload.summary.warningCount,
    };
  }
  if (stepId === "vite_owner_review_report") {
    return {
      ok: payload.ok,
      status: payload.status,
      ownerApprovalCode: payload.ownerApproval && payload.ownerApproval.code,
      productionWrites: payload.productionWrites,
      deployExecuted: payload.deployExecuted,
      productionDeployAuthorized: payload.productionDeployAuthorized,
    };
  }
  if (stepId === "vite_cutover_preflight_blocked") {
    return {
      ok: payload.ok,
      status: payload.status,
      blockedReason: payload.blockedReason,
      productionWrites: payload.productionWrites,
      deployExecuted: payload.deployExecuted,
      productionDeployAuthorized: payload.productionDeployAuthorized,
    };
  }
  if (stepId === "vite_cutover_handoff_packet_blocked") {
    return {
      ok: payload.ok,
      status: payload.status,
      blockedReason: payload.blockedReason,
      productionWrites: payload.productionWrites,
      deployExecuted: payload.deployExecuted,
      deployCardSent: payload.deployCardSent,
      taskCardCreated: payload.taskCardCreated,
      productionDeployAuthorized: payload.productionDeployAuthorized,
    };
  }
  return {
    ok: payload.ok,
    status: payload.status,
  };
}

function runStep(step, context) {
  const [command, ...args] = step.command;
  const result = context.runner({
    command,
    args,
    cwd: context.repoRoot,
    env: context.env,
    step,
  });
  const exitCode = typeof result.status === "number" ? result.status : result.code;
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const errors = [];
  let jsonSummary = null;

  if (exitCode !== 0) errors.push(`exit_code_${exitCode}`);

  if (step.json && exitCode === 0) {
    try {
      const payload = parseJsonFromOutput(stdout);
      jsonSummary = summarizeJsonPayload(step.id, payload);
      for (const expectation of step.expectations || []) {
        const expectationError = evaluateExpectation(payload, expectation);
        if (expectationError) errors.push(expectationError);
      }
    } catch (error) {
      errors.push(`json_parse_failed: ${error.message}`);
    }
  }

  return {
    id: step.id,
    summary: step.summary,
    command: step.command.join(" "),
    status: errors.length ? "failed" : "passed",
    exitCode,
    errors,
    jsonSummary,
    stdoutTail: errors.length ? tail(stdout) : "",
    stderrTail: errors.length ? tail(stderr) : "",
  };
}

function buildViteDevelopmentAcceptanceReport(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, ".."));
  const steps = options.steps || ACCEPTANCE_STEPS;
  const safetyFindings = assertNoProductionCommands(steps);
  const env = {
    ...process.env,
    ...(options.env || {}),
    HOMEAI_VITE_CUTOVER_OWNER_APPROVAL_TEXT: "",
  };
  const runner = options.runner || defaultRunner;
  const startedAt = new Date().toISOString();
  const results = safetyFindings.length
    ? []
    : steps.map((step) => runStep(step, { repoRoot, env, runner }));
  const failedSteps = results.filter((step) => step.status !== "passed");
  const ok = safetyFindings.length === 0 && failedSteps.length === 0;

  return {
    ok,
    status: ok ? "development_acceptance_passed" : "development_acceptance_failed",
    reportVersion: ACCEPTANCE_REPORT_VERSION,
    startedAt,
    completedAt: new Date().toISOString(),
    sourceOnly: true,
    productionWrites: false,
    deployExecuted: false,
    productionDeployAuthorized: false,
    ownerApproval: {
      requiredForProduction: true,
      acceptedByThisReport: false,
      envApprovalCleared: true,
    },
    ownerApprovalRequest: buildOwnerApprovalRequest(ok),
    safety: {
      ok: safetyFindings.length === 0,
      forbiddenProductionCommandFindings: safetyFindings,
    },
    summary: {
      stepCount: steps.length,
      passedStepCount: results.filter((step) => step.status === "passed").length,
      failedStepCount: failedSteps.length,
      failedStepIds: failedSteps.map((step) => step.id),
    },
    steps: results,
  };
}

function formatText(report) {
  const lines = [
    `Vite development acceptance: ${report.status}`,
    `version: ${report.reportVersion}`,
    `sourceOnly: ${report.sourceOnly}`,
    `productionWrites: ${report.productionWrites}`,
    `deployExecuted: ${report.deployExecuted}`,
    `productionDeployAuthorized: ${report.productionDeployAuthorized}`,
    `steps: ${report.summary.passedStepCount}/${report.summary.stepCount} passed`,
    `ownerApprovalRequest: ${report.ownerApprovalRequest.status}`,
  ];
  if (report.summary.failedStepIds.length) {
    lines.push(`failedSteps: ${report.summary.failedStepIds.join(", ")}`);
  }
  return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const report = buildViteDevelopmentAcceptanceReport(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(formatText(report));
  }
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  ACCEPTANCE_REPORT_VERSION,
  ACCEPTANCE_STEPS,
  assertNoProductionCommands,
  buildOwnerApprovalRequest,
  buildViteDevelopmentAcceptanceReport,
  formatText,
  parseArgs,
  parseJsonFromOutput,
};
