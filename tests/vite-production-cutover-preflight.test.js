"use strict";

const assert = require("node:assert/strict");

const {
  PLANNED_DEPLOY_COMMAND,
  REQUIRED_PRODUCTION_READBACK_CHECKS,
  REQUIRED_OWNER_APPROVAL_TEXT,
  evaluateOwnerApproval,
  parseArgs,
  runViteProductionCutoverPreflight,
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
    summary: {
      failedCount: 0,
      warningCount: 0,
    },
    checks: [],
    ...overrides,
  };
}

test("owner approval evaluation fails closed without text", () => {
  const approval = evaluateOwnerApproval("");
  assert.equal(approval.approved, false);
  assert.equal(approval.status, "blocked");
  assert.equal(approval.code, "owner_approval_required");
});

test("owner approval evaluation requires the exact production cutover text", () => {
  const approval = evaluateOwnerApproval("批准 Vite");
  assert.equal(approval.approved, false);
  assert.equal(approval.code, "owner_approval_text_mismatch");

  const accepted = evaluateOwnerApproval(REQUIRED_OWNER_APPROVAL_TEXT);
  assert.equal(accepted.approved, true);
  assert.equal(accepted.code, "owner_approval_recorded");
});

test("preflight blocks without owner approval and never authorizes deployment", () => {
  const result = runViteProductionCutoverPreflight({
    readiness: readinessFixture(),
    env: {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.blockedReason, "owner_approval_required");
  assert.equal(result.sourceOnly, true);
  assert.equal(result.productionWrites, false);
  assert.equal(result.deployExecuted, false);
  assert.equal(result.productionDeployAuthorized, false);
  assert.equal(result.cutoverImplementation.status, "not_created");
  assert.equal(Array.isArray(result.requiredProductionReadback), true);
  assert.equal(result.requiredProductionReadback, REQUIRED_PRODUCTION_READBACK_CHECKS);
});

test("preflight blocks readiness failures even with exact owner approval", () => {
  const result = runViteProductionCutoverPreflight({
    readiness: readinessFixture({
      ok: false,
      summary: {
        failedCount: 1,
        warningCount: 0,
      },
    }),
    ownerApprovalText: REQUIRED_OWNER_APPROVAL_TEXT,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.blockedReason, "vite_development_readiness_failed");
  assert.equal(result.ownerApproval.approved, true);
});

test("exact owner approval produces only a source-only cutover-change plan", () => {
  const result = runViteProductionCutoverPreflight({
    readiness: readinessFixture(),
    ownerApprovalText: REQUIRED_OWNER_APPROVAL_TEXT,
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "ready_for_cutover_change");
  assert.equal(result.productionWrites, false);
  assert.equal(result.deployExecuted, false);
  assert.equal(result.productionDeployAuthorized, false);
  assert.equal(result.cutoverImplementation.status, "not_created");
  assert.equal(result.cutoverImplementation.requiredNextState, "create_fail_closed_cutover_change");
  assert.equal(result.plannedDeployCommand, PLANNED_DEPLOY_COMMAND);
  assert.equal(result.plannedValidationCommands.includes("npm run verify:vite-dev"), true);
  assert.equal(result.plannedValidationCommands.includes("node tests/vite-production-cutover-preflight.test.js"), true);
  assert.equal(result.plannedValidationCommands.includes("node tests/vite-plugin-host-model.test.js"), true);
  assert.equal(result.plannedValidationCommands.includes("node tests/vite-plugin-host-island.test.js"), true);
  assert.equal(result.plannedValidationCommands.includes("node tests/vite-cutover-source-change-validator.test.js"), true);
  assert.equal(result.plannedValidationCommands.includes("node tests/vite-goal-state-audit.test.js"), true);
  assert.equal(
    result.plannedValidationCommands.some((command) => command.includes("npm run audit:vite-goal")),
    true,
  );
  assert.equal(
    result.plannedValidationCommands.some((command) => command.includes("npm run validate:vite-cutover-source")),
    true,
  );
  assert.equal(result.plannedValidationCommands.includes("node tests/vite-production-readback-validator.test.js"), true);
  assert.equal(
    result.plannedValidationCommands.some((command) => command.includes("npm run validate:vite-cutover-readback")),
    true,
  );
  assert.equal(result.requiredProductionReadback.some((check) => check.id === "selected_shell_mode"), true);
  assert.equal(result.requiredProductionReadback.some((check) => check.id === "service_worker_cache_version"), true);
  assert.equal(result.requiredProductionReadback.some((check) => check.id === "plugin_host_manifest_proxy"), true);
  assert.equal(result.requiredProductionReadback.some((check) => check.id === "document_preview_delivery"), true);
  assert.equal(result.requiredProductionReadback.some((check) => check.id === "voice_pending_cancel"), true);
  assert.equal(result.requiredProductionReadback.some((check) => check.id === "chat_sse_task_topic"), true);
  assert.equal(result.requiredProductionReadback.some((check) => check.id === "wardrobe_usage_action"), true);
  assert.equal(result.requiredProductionReadback.some((check) => check.id === "rollback_switch"), true);
  assert.equal(result.nextActions.some((action) => action.includes("fail-closed production cutover change")), true);
});

test("production readback checklist is structured and privacy bounded", () => {
  assert.ok(REQUIRED_PRODUCTION_READBACK_CHECKS.length >= 10);
  for (const check of REQUIRED_PRODUCTION_READBACK_CHECKS) {
    assert.equal(typeof check.id, "string");
    assert.equal(typeof check.summary, "string");
    assert.equal(Array.isArray(check.evidence), true);
    assert.ok(check.evidence.length > 0);
    assert.equal(typeof check.privacy, "string");
    assert.notEqual(check.privacy, "");
  }
});

test("argument parsing supports explicit owner approval text", () => {
  const options = parseArgs([
    "--json",
    "--require-approved",
    `--owner-approval-text=${REQUIRED_OWNER_APPROVAL_TEXT}`,
    "--no-require-built-assets",
  ]);
  assert.equal(options.json, true);
  assert.equal(options.requireApproved, true);
  assert.equal(options.ownerApprovalText, REQUIRED_OWNER_APPROVAL_TEXT);
  assert.equal(options.requireBuiltAssets, false);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
