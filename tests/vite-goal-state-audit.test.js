"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  GOAL_STATE_AUDIT_VERSION,
  buildViteGoalStateAudit,
  evaluateAcceptancePayload,
  formatText,
  parseArgs,
} = require("../scripts/vite-goal-state-audit");
const {
  REQUIRED_OWNER_APPROVAL_TEXT,
  REQUIRED_PRODUCTION_READBACK_CHECKS,
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

function acceptancePayload(overrides = {}) {
  return {
    ok: true,
    status: "development_acceptance_passed",
    sourceOnly: true,
    productionWrites: false,
    deployExecuted: false,
    productionDeployAuthorized: false,
    summary: {
      stepCount: 13,
      passedStepCount: 13,
      failedStepCount: 0,
      failedStepIds: [],
    },
    ...overrides,
  };
}

function cutoverSourcePayload() {
  return {
    ownerApproval: {
      requiredText: REQUIRED_OWNER_APPROVAL_TEXT,
    },
    privacy: {
      confirmed: true,
    },
    cutoverSourceChange: {
      exists: true,
      failClosedDefault: "classic",
      explicitShellModeSwitch: true,
      rollbackSwitch: true,
      viteOnlyRuntime: true,
      classicRuntimeSwitchRemoved: true,
      sourceDeployRollbackPlan: true,
      classicOverrideIgnored: true,
      serviceWorkerCacheVersionPlan: true,
      viteAssetsManifestReadback: true,
      devPreviewMocksExcludedFromServer: true,
      ownerConsolePermissionPreserved: true,
      nonOwnerDenied: true,
      productionDefaultNotViteWithoutSwitch: true,
      boundedProductionReadbackRequired: true,
      deployLaneRequired: true,
    },
    validationCommands: [
      "npm run verify:vite-dev",
      "npm run check:vite-readiness",
      "node tests/vite-cutover-source-change-validator.test.js",
      "node tests/vite-production-cutover-preflight.test.js",
      "node tests/vite-production-readback-validator.test.js",
      "npm run validate:vite-cutover-source -- --contract-json /tmp/source.json --require-ok",
      "npm run validate:vite-cutover-readback -- --readback-json /tmp/readback.json --require-ok",
      "npm run check",
      "git diff --check",
    ],
  };
}

function readbackPayload() {
  return {
    privacy: {
      confirmed: true,
    },
    checks: REQUIRED_PRODUCTION_READBACK_CHECKS.map((check) => ({
      id: check.id,
      status: "passed",
      evidence: {
        summary: `${check.id} bounded evidence`,
      },
    })),
  };
}

test("current source-only audit shows the full goal is incomplete", () => {
  const result = buildViteGoalStateAudit({
    readiness: readinessFixture(),
    env: {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "goal_incomplete");
  assert.equal(result.auditVersion, GOAL_STATE_AUDIT_VERSION);
  assert.equal(result.sourceOnly, true);
  assert.equal(result.productionWrites, false);
  assert.equal(result.deployExecuted, false);
  assert.equal(result.productionDeployVerified, false);
  assert.deepEqual(result.summary.incompletePhaseIds, [
    "development_acceptance",
    "owner_approval",
    "cutover_source_change",
    "deploy_lane_packet",
    "production_readback",
  ]);
});

test("future complete evidence verifies the full goal", () => {
  const result = buildViteGoalStateAudit({
    readiness: readinessFixture(),
    ownerApprovalText: REQUIRED_OWNER_APPROVAL_TEXT,
    acceptancePayload: acceptancePayload(),
    cutoverSourcePayload: cutoverSourcePayload(),
    productionReadbackPayload: readbackPayload(),
  });
  assert.equal(result.ok, true, JSON.stringify(result.phases, null, 2));
  assert.equal(result.status, "goal_complete_verified");
  assert.equal(result.productionDeployVerified, true);
  assert.deepEqual(result.summary.incompletePhaseIds, []);
  assert.equal(result.phases.every((phase) => phase.ok), true);
});

test("development acceptance payload must prove source-only acceptance", () => {
  const missing = evaluateAcceptancePayload(null, "development_acceptance_json_required");
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "development_acceptance_json_required");

  const invalid = evaluateAcceptancePayload(acceptancePayload({
    productionWrites: true,
  }));
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "development_acceptance_invalid");
  assert.deepEqual(invalid.failed, ["productionWrites"]);

  const valid = evaluateAcceptancePayload(acceptancePayload());
  assert.equal(valid.ok, true);
  assert.equal(valid.code, "development_acceptance_verified");
});

test("CLI JSON files are accepted as bounded evidence", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-vite-goal-audit-"));
  const acceptanceFile = path.join(dir, "acceptance.json");
  const sourceFile = path.join(dir, "source.json");
  const readbackFile = path.join(dir, "readback.json");
  fs.writeFileSync(acceptanceFile, JSON.stringify(acceptancePayload(), null, 2));
  fs.writeFileSync(sourceFile, JSON.stringify(cutoverSourcePayload(), null, 2));
  fs.writeFileSync(readbackFile, JSON.stringify(readbackPayload(), null, 2));

  const result = buildViteGoalStateAudit({
    readiness: readinessFixture(),
    ownerApprovalText: REQUIRED_OWNER_APPROVAL_TEXT,
    acceptanceJson: acceptanceFile,
    cutoverSourceContractJson: sourceFile,
    productionReadbackJson: readbackFile,
  });
  assert.equal(result.ok, true, JSON.stringify(result.phases, null, 2));
});

test("formatter and parser expose completion boundary", () => {
  const result = buildViteGoalStateAudit({
    readiness: readinessFixture(),
    env: {},
  });
  const text = formatText(result);
  assert.match(text, /sourceOnly: true/);
  assert.match(text, /productionWrites: false/);
  assert.match(text, /goal_incomplete/);

  assert.deepEqual(parseArgs([
    "--json",
    "--require-complete",
    "--no-require-built-assets",
    "--owner-approval-text=approved",
    "--acceptance-json=acceptance.json",
    "--cutover-source-contract-json=source.json",
    "--production-readback-json=readback.json",
    "--repo-root=/tmp/home-ai",
  ]), {
    json: true,
    requireComplete: true,
    requireBuiltAssets: false,
    ownerApprovalText: "approved",
    acceptanceJson: "acceptance.json",
    cutoverSourceContractJson: "source.json",
    productionReadbackJson: "readback.json",
    repoRoot: "/tmp/home-ai",
  });
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
