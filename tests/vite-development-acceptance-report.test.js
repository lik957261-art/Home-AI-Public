"use strict";

const assert = require("node:assert/strict");

const {
  ACCEPTANCE_REPORT_VERSION,
  ACCEPTANCE_STEPS,
  assertNoProductionCommands,
  buildOwnerApprovalRequest,
  buildViteDevelopmentAcceptanceReport,
  parseArgs,
  parseJsonFromOutput,
} = require("../scripts/vite-development-acceptance-report");
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

function payloadForStep(stepId) {
  if (stepId === "audit_vite_globals") {
    return { ok: true, unmanagedCount: 0, occurrenceCount: 12 };
  }
  if (stepId === "vite_preview_routes_smoke") {
    return { ok: true, routeCount: 9, routes: [{ path: "/vite-app-preview/" }] };
  }
  if (stepId === "vite_dev_user_journeys_smoke") {
    return {
      ok: true,
      sourceOnly: true,
      productionWrites: false,
      deployExecuted: false,
      journeyCount: 5,
      journeys: [
        "composer_attachment_camera_no_refresh",
        "codex_plugin_iframe",
        "owner_system_console",
        "document_preview_pdf_pptx",
        "voice_pending_cancel",
      ],
    };
  }
  if (stepId === "vite_development_readiness") {
    return {
      ok: true,
      sourceOnly: true,
      ownerApprovalRequired: true,
      productionDeployAuthorized: false,
      summary: {
        requiredDevRouteCount: 9,
        requiredSourceFileCount: 24,
        requiredTestFileCount: 24,
        failedCount: 0,
        warningCount: 0,
      },
    };
  }
  if (stepId === "vite_preview_cache_policy") {
    return {
      ok: true,
      sourceOnly: true,
      productionWrites: false,
      deployExecuted: false,
      productionDeployAuthorized: false,
      productionCutoverCacheReady: false,
      residuals: [
        {
          id: "vite_entry_assets_not_content_fingerprinted",
          status: "open_for_cutover",
        },
      ],
    };
  }
  if (stepId === "vite_owner_review_report") {
    return {
      ok: true,
      status: "ready_for_owner_review",
      sourceOnly: true,
      productionWrites: false,
      deployExecuted: false,
      productionDeployAuthorized: false,
      ownerApproval: {
        approved: false,
        code: "owner_approval_required",
      },
    };
  }
  if (stepId === "vite_cutover_preflight_blocked") {
    return {
      ok: false,
      status: "blocked",
      blockedReason: "owner_approval_required",
      sourceOnly: true,
      productionWrites: false,
      deployExecuted: false,
      productionDeployAuthorized: false,
    };
  }
  if (stepId === "vite_cutover_handoff_packet_blocked") {
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
    };
  }
  return null;
}

function makeRunner(overrides = {}) {
  const calls = [];
  return {
    calls,
    runner({ step, env }) {
      calls.push({ stepId: step.id, envApproval: env.HOMEAI_VITE_CUTOVER_OWNER_APPROVAL_TEXT });
      if (overrides[step.id]) return overrides[step.id];
      const payload = payloadForStep(step.id);
      return {
        status: 0,
        stdout: payload ? `${JSON.stringify(payload, null, 2)}\n` : "ok\n",
        stderr: "",
      };
    },
  };
}

test("development acceptance report passes all source-only steps", () => {
  const fake = makeRunner();
  const report = buildViteDevelopmentAcceptanceReport({
    runner: fake.runner,
    env: {
      HOMEAI_VITE_CUTOVER_OWNER_APPROVAL_TEXT: "should be cleared",
    },
  });
  assert.equal(report.ok, true);
  assert.equal(report.status, "development_acceptance_passed");
  assert.equal(report.reportVersion, ACCEPTANCE_REPORT_VERSION);
  assert.equal(report.sourceOnly, true);
  assert.equal(report.productionWrites, false);
  assert.equal(report.deployExecuted, false);
  assert.equal(report.productionDeployAuthorized, false);
  assert.equal(report.ownerApproval.acceptedByThisReport, false);
  assert.equal(report.ownerApprovalRequest.status, "ready_to_request_owner_approval");
  assert.equal(report.ownerApprovalRequest.requiredText, REQUIRED_OWNER_APPROVAL_TEXT);
  assert.equal(report.ownerApprovalRequest.productionWrites, false);
  assert.equal(report.ownerApprovalRequest.deployExecuted, false);
  assert.equal(report.ownerApprovalRequest.deployCardSent, false);
  assert.deepEqual(report.ownerApprovalRequest.afterApprovalSequence, [
    "create_fail_closed_cutover_source_change",
    "rerun_planned_validation",
    "convert_handoff_packet_into_real_deploy_lane_card",
    "central_mac_deploy_and_bounded_readback",
  ]);
  assert.equal(report.summary.stepCount, ACCEPTANCE_STEPS.length);
  assert.equal(report.summary.failedStepCount, 0);
  assert.equal(report.steps.some((step) => step.id === "repo_static_check"), true);
  assert.equal(report.steps.some((step) => step.id === "vite_cutover_handoff_packet_blocked"), true);
  assert.equal(report.steps.some((step) => step.id === "vite_dev_user_journeys_smoke"), true);
  assert.equal(report.steps.some((step) => step.id === "vite_preview_cache_policy"), true);
  assert.equal(report.steps.some((step) => step.id === "vite_production_readback_validator_contract"), true);
  assert.equal(report.steps.some((step) => step.id === "vite_cutover_source_change_validator_contract"), true);
  assert.equal(report.steps.some((step) => step.id === "vite_goal_state_audit_contract"), true);
  assert.equal(report.steps.some((step) => step.id === "local_full_test_gate"), true);
  assert.equal(report.steps.some((step) => step.id === "diff_hygiene"), true);
  assert.equal(fake.calls.length, ACCEPTANCE_STEPS.length);
  assert.equal(fake.calls.every((call) => call.envApproval === ""), true);
});

test("failed command produces bounded failed acceptance evidence", () => {
  const longOutput = "x".repeat(5000);
  const fake = makeRunner({
    vite_preview_routes_smoke: {
      status: 1,
      stdout: longOutput,
      stderr: "route failed",
    },
  });
  const report = buildViteDevelopmentAcceptanceReport({ runner: fake.runner });
  assert.equal(report.ok, false);
  assert.equal(report.status, "development_acceptance_failed");
  assert.equal(report.ownerApprovalRequest.status, "blocked_by_failed_development_acceptance");
  assert.equal(report.ownerApprovalRequest.nextAllowedAction, "fix_failed_development_acceptance");
  assert.deepEqual(report.summary.failedStepIds, ["vite_preview_routes_smoke"]);
  const failed = report.steps.find((step) => step.id === "vite_preview_routes_smoke");
  assert.equal(failed.status, "failed");
  assert.ok(failed.stdoutTail.length <= 1600);
  assert.equal(failed.stderrTail, "route failed");
});

test("expectation mismatch fails the matching JSON step", () => {
  const fake = makeRunner({
    vite_owner_review_report: {
      status: 0,
      stdout: JSON.stringify({
        ok: true,
        status: "approved_to_create_cutover_source_change",
        sourceOnly: true,
        productionWrites: false,
        deployExecuted: false,
        productionDeployAuthorized: false,
        ownerApproval: { approved: true },
      }),
      stderr: "",
    },
  });
  const report = buildViteDevelopmentAcceptanceReport({ runner: fake.runner });
  assert.equal(report.ok, false);
  assert.deepEqual(report.summary.failedStepIds, ["vite_owner_review_report"]);
  assert.ok(report.steps.find((step) => step.id === "vite_owner_review_report").errors.some((error) => {
    return error.includes("status expected");
  }));
});

test("production commands are rejected from acceptance steps", () => {
  const findings = assertNoProductionCommands([
    {
      id: "bad_deploy",
      command: ["npm", "run", "deploy:macos", "--", "--execute"],
    },
  ]);
  assert.deepEqual(findings, [
    { stepId: "bad_deploy", pattern: "deploy:macos" },
    { stepId: "bad_deploy", pattern: "--execute" },
  ]);
});

test("owner approval request is source-only and only ready after acceptance passes", () => {
  const ready = buildOwnerApprovalRequest(true);
  assert.equal(ready.status, "ready_to_request_owner_approval");
  assert.equal(ready.requiredText, REQUIRED_OWNER_APPROVAL_TEXT);
  assert.equal(ready.sourceOnly, true);
  assert.equal(ready.productionWrites, false);
  assert.equal(ready.deployExecuted, false);
  assert.equal(ready.deployCardSent, false);

  const blocked = buildOwnerApprovalRequest(false);
  assert.equal(blocked.status, "blocked_by_failed_development_acceptance");
  assert.equal(blocked.requiredText, REQUIRED_OWNER_APPROVAL_TEXT);
  assert.equal(blocked.nextAllowedAction, "fix_failed_development_acceptance");
});

test("JSON parser tolerates npm wrapper text", () => {
  assert.deepEqual(parseJsonFromOutput("prefix\n{\"ok\":true}\n"), { ok: true });
});

test("argument parsing supports json output", () => {
  assert.deepEqual(parseArgs(["--json"]), { json: true });
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
