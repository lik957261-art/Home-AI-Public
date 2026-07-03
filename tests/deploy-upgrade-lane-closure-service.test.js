"use strict";

const assert = require("node:assert/strict");

const {
  buildDeployLaneLockRecord,
  isTerminalReceiptShape,
  summarizePublicUpgradeDailySmoke,
  validateDeployLaneLockRecord,
  validateRoutinePluginDeploymentCard,
} = require("../adapters/deploy-upgrade-lane-closure-service");

function publicUpgradePayload(overrides = {}) {
  return Object.assign({
    ok: true,
    tempRemoved: true,
    stepCount: 10,
    steps: [
      { type: "public-source-preflight", result: { ok: true }, summary: { ok: true } },
      { type: "validate-missing-source-fail-closed", ok: true, detail: { ok: true, missingSourceBlockerCount: 10, pluginCount: 10 } },
      { type: "validate-operator-clone-gate-plan", ok: true, detail: { ok: true, cloneActionCount: 10, deployActionCount: 10, pluginCount: 10, movieOperatorAuthenticated: true, closureValidationPresent: true } },
      { type: "validate-hermes-runtime-repair-required", ok: true, detail: { ok: true, runtimeRepairBlockerPresent: true, runtimeRepairActionPresent: true } },
      { type: "validate-hermes-runtime-repair-gate-plan", ok: true, detail: { ok: true, runtimeRepairActionPresent: true, closureValidationPresent: true } },
      { type: "validate-non-git-source-adoption-required", ok: true, detail: { ok: true, sourceDirectoryNotGitBlockerCount: 2, hasHomeAiBlocker: true } },
      { type: "validate-source-adoption-gate-plan", ok: true, detail: { ok: true, adoptActionCount: 2, deployActionCount: 10, pluginCount: 10, closureValidationPresent: true } },
    ],
  }, overrides);
}

function testRoutineDeployCardRequiresStructuredFields() {
  const report = validateRoutinePluginDeploymentCard({ title: "Deploy Movie", body: "please deploy" });
  assert.equal(report.ok, false);
  assert.equal(report.error, "deploy_card_kind_required");
  assert.ok(report.issues.some((issue) => issue.code === "deploy_card_plugin_id_required"));
  assert.ok(report.issues.some((issue) => issue.code === "deploy_card_reason_required"));
}

function testRoutineDeployCardRejectsTerminalReceiptShape() {
  const card = {
    cardKind: "plugin_deployment",
    pluginId: "movie",
    deployReason: "movie-v1",
    title: "Return: Movie deployment completed",
    body: "Return policy: terminal receipt",
    status: "completed",
  };
  assert.equal(isTerminalReceiptShape(card), true);
  const report = validateRoutinePluginDeploymentCard(card);
  assert.equal(report.ok, false);
  assert.equal(report.error, "deploy_card_is_terminal_receipt");
}

function testRoutineDeployCardAcceptsValidRequest() {
  const report = validateRoutinePluginDeploymentCard({
    cardKind: "plugin_deployment",
    pluginId: "codex-mobile-web",
    deployReason: "codex-mobile-v1",
    title: "Deploy Codex Mobile",
    body: "Routine deploy request",
  });
  assert.equal(report.ok, true);
  assert.equal(report.pluginId, "codex-mobile-web");
  assert.equal(report.requestShape, "routine_plugin_deployment");
}

function testDeployLaneLockRecord() {
  const record = buildDeployLaneLockRecord({
    pluginId: "movie",
    launchdLabel: "com.hermesmobile.plugin.movie",
    productionPath: "/Users/example/path",
    deployReason: "movie-v1",
    laneTitle: "Movie Deploy Lane",
    phase: "runtime-gate",
    startedAt: "2026-07-01T00:00:00.000Z",
  });
  assert.equal(record.productionPathBasename, "movie");
  assert.equal(record.productionPathHash.length, 16);
  const report = validateDeployLaneLockRecord(record);
  assert.equal(report.ok, true);
}

function testDeployLaneLockTerminalPhaseRequiresCompletedAt() {
  const record = buildDeployLaneLockRecord({
    pluginId: "movie",
    launchdLabel: "com.hermesmobile.plugin.movie",
    phase: "completed",
    startedAt: "2026-07-01T00:00:00.000Z",
  });
  const report = validateDeployLaneLockRecord(record);
  assert.equal(report.ok, false);
  assert.equal(report.error, "deploy_lane_lock_completed_at_required");
}

function testPublicUpgradeDailySmokeReportsFullCoverage() {
  const report = summarizePublicUpgradeDailySmoke(publicUpgradePayload());
  assert.equal(report.ok, true);
  assert.equal(report.coverage.homeAi, true);
  assert.equal(report.coverage.plugins, true);
  assert.equal(report.coverage.hermesAgent, true);
  assert.equal(report.coverage.providerIngress, true);
  assert.equal(report.coverage.sourceAdoption, true);
  assert.equal(report.metadata.adoptActionCount, 2);
}

function testPublicUpgradeDailySmokeFailsWithoutHermesRuntimeGate() {
  const payload = publicUpgradePayload({
    steps: publicUpgradePayload().steps.map((step) => (
      step.type === "validate-hermes-runtime-repair-gate-plan"
        ? Object.assign({}, step, { ok: false, detail: Object.assign({}, step.detail, { ok: false, runtimeRepairActionPresent: false }) })
        : step
    )),
  });
  const report = summarizePublicUpgradeDailySmoke(payload);
  assert.equal(report.ok, false);
  assert.equal(report.error, "public_upgrade_hermes_runtime_repair_gate_missing");
}

function run() {
  testRoutineDeployCardRequiresStructuredFields();
  testRoutineDeployCardRejectsTerminalReceiptShape();
  testRoutineDeployCardAcceptsValidRequest();
  testDeployLaneLockRecord();
  testDeployLaneLockTerminalPhaseRequiresCompletedAt();
  testPublicUpgradeDailySmokeReportsFullCoverage();
  testPublicUpgradeDailySmokeFailsWithoutHermesRuntimeGate();
}

run();
