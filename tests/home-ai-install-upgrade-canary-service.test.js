"use strict";

const assert = require("node:assert/strict");

const {
  CANARY_VERSION,
  REQUIRED_STAGE_DEFINITIONS,
  buildStageLedger,
  buildPlan,
  createHomeAiInstallUpgradeCanaryService,
  defaultPhaseDefinitions,
  normalizeCleanTargetCanary,
  summarizeCleanTargetEnvironment,
  validateCleanTargetReadbackEvidence,
  validatePhaseContract,
} = require("../adapters/home-ai-install-upgrade-canary-service");

function payloadForScript(script, args = []) {
  if (script === "scripts/public-install-preflight.js") {
    return { ok: true, requiredPluginCount: 10, requiredSourceFileCount: 10, issues: [] };
  }
  if (script === "scripts/macos-install-phase-coverage-audit.js") {
    return { ok: true, phaseCount: 20, issues: [] };
  }
  if (script === "scripts/macos-fresh-install-rehearsal.js") {
    return { ok: true, phaseCount: 20, tempRemoved: true, issues: [] };
  }
  if (script === "scripts/macos-install-verification-classification.js") {
    return { ok: true, phaseCount: 20, verificationClasses: ["source_check", "source_rehearsed", "external_input", "privileged_apply", "live_runtime"], classCounts: { live_runtime: 3, privileged_apply: 3 } };
  }
  if (script === "scripts/macos-install-operator-closure-checklist.js") {
    return { ok: true, phaseCount: 20, operatorClosureCount: 9, items: new Array(20).fill({}) };
  }
  if (script === "scripts/deploy-upgrade-lane-closure-smoke.js") {
    return { ok: true, issues: [], deployCard: { validRequestOk: true }, publicUpgrade: { ok: true } };
  }
  if (script === "scripts/homeai-public-upgrade-rehearsal.js" && args.includes("--execute")) {
    return {
      ok: true,
      tempRemoved: true,
      stepCount: 10,
      steps: [
        { type: "public-source-preflight", result: { ok: true }, summary: { ok: true } },
        { type: "validate-missing-source-fail-closed", ok: true, detail: { ok: true, missingSourceBlockerCount: 10, pluginCount: 10 } },
        { type: "validate-operator-clone-gate-plan", ok: true, detail: { ok: true, cloneActionCount: 10, deployActionCount: 10, pluginCount: 10, movieOperatorAuthenticated: true, closureValidationPresent: true } },
        { type: "validate-hermes-runtime-repair-required", ok: true, detail: { ok: true, runtimeRepairBlockerPresent: true } },
        { type: "validate-hermes-runtime-repair-gate-plan", ok: true, detail: { ok: true, runtimeRepairActionPresent: true, closureValidationPresent: true } },
        { type: "validate-non-git-source-adoption-required", ok: true, detail: { ok: true, sourceDirectoryNotGitBlockerCount: 2 } },
        { type: "validate-source-adoption-gate-plan", ok: true, detail: { ok: true, adoptActionCount: 2, deployActionCount: 10, closureValidationPresent: true } },
      ],
    };
  }
  if (script === "scripts/homeai-public-upgrade-rehearsal.js") {
    return { ok: true, actionCount: 9, policy: { productionWrites: false, tempRootOnly: true } };
  }
  if (script === "scripts/plugin-provisioning-coverage-audit.js") {
    return { ok: true, publicPluginCount: 10, hostProvisionedPublicCount: 7, specialPublicCount: 3, issues: [] };
  }
  if (script === "scripts/homeai-self-improving-loop.js") {
    return { ok: true, modelVersion: "20260701-runtime-slo-v4", signalCount: 21, issueCount: 0 };
  }
  return { ok: false, error: `unexpected:${script}` };
}

function fakeRunner(calls, failureScript = "") {
  return async function runProcess(command, args = []) {
    calls.push({ command, args: [...args] });
    const script = args[0];
    if (script === failureScript) {
      return { ok: false, status: 1, stdout: JSON.stringify({ ok: false, error: "simulated_failure" }), stderr: "" };
    }
    return { ok: true, status: 0, stdout: JSON.stringify(payloadForScript(script, args)), stderr: "" };
  };
}

function testPlanIsSafeByDefault() {
  const plan = buildPlan({ nowIso: "2026-07-01T00:00:00.000Z", env: {} });
  assert.equal(plan.ok, true);
  assert.equal(plan.canaryVersion, CANARY_VERSION);
  assert.equal(plan.executionClass, "source_safe_plan");
  assert.equal(plan.closureStatus, "partial");
  assert.equal(plan.cleanTargetCanary.status, "not_run");
  assert.equal(plan.cleanTargetEnvironment.status, "blocked");
  assert.ok(plan.cleanTargetEnvironment.issueCodes.includes("clean_target_root_missing"));
  assert.ok(plan.cleanTargetEnvironment.issueCodes.includes("operator_phases_gate_missing"));
  assert.equal(plan.cleanTargetEnvironment.privacy, "metadata_only_path_basename_hash_no_raw_target_paths");
  assert.equal(plan.cleanTargetCanary.requiredForCompletion, true);
  assert.equal(plan.policy.defaultProductionWrites, false);
  assert.equal(plan.policy.localExecuteIsSourceSafeRehearsalOnly, true);
  assert.equal(plan.policy.laneOnlyCleanTargetExecution, true);
  assert.equal(plan.policy.defaultNetworkClone, false);
  assert.equal(plan.stageCoverage.stageCount, REQUIRED_STAGE_DEFINITIONS.length);
  assert.deepEqual(plan.stageCoverage.missingStageIds, []);
  assert.ok(plan.stageCoverage.stages.some((stage) => stage.id === "owner_key_bootstrap" && stage.covered));
  assert.ok(plan.stageCoverage.stages.some((stage) => stage.id === "hermes_agent_runtime" && stage.covered));
  assert.ok(plan.stageCoverage.stages.some((stage) => stage.id === "provider_ingress" && stage.covered));
  assert.ok(plan.stageCoverage.stages.some((stage) => stage.id === "plugin_mcp_schema_smoke" && stage.covered));
  assert.equal(plan.phases.every((phase) => phase.contract?.ownerLayer), true);
  assert.equal(plan.phases.every((phase) => phase.contract?.evidenceKeys?.length > 0), true);
  assert.equal(plan.phases.every((phase) => phase.contract?.closureReadbacks?.length > 0), true);
  assert.equal(plan.phases.some((phase) => phase.id === "public_upgrade_rehearsal_execute"), false);
}

function testCleanTargetEnvironmentReadinessIsExplicitAndBounded() {
  const blocked = summarizeCleanTargetEnvironment({}, {});
  assert.equal(blocked.status, "blocked");
  assert.ok(blocked.issueCodes.includes("clean_target_root_missing"));
  assert.ok(blocked.issueCodes.includes("clean_target_fixture_missing"));
  assert.ok(blocked.issueCodes.includes("clean_target_readback_file_missing"));
  assert.equal(blocked.targetRoot.present, false);

  const relativePaths = summarizeCleanTargetEnvironment({}, {
    HOMEAI_CLEAN_TARGET_ROOT: "/tmp/homeai-clean-target-owner-3a",
    HOMEAI_CLEAN_TARGET_ISOLATED: "1",
    HOMEAI_CLEAN_TARGET_FIXTURE: "fixture.json",
    HOMEAI_CLEAN_TARGET_READBACK_FILE: "readback.json",
    HOMEAI_INSTALL_RUN_OPERATOR_PHASES: "1",
    HOMEAI_INSTALL_LAUNCHD_APPLY: "1",
    HOMEAI_INSTALL_APPLY_WORKSPACE_ACL: "1",
  });
  assert.equal(relativePaths.status, "blocked");
  assert.ok(relativePaths.issueCodes.includes("clean_target_fixture_not_absolute"));
  assert.ok(relativePaths.issueCodes.includes("clean_target_readback_file_not_absolute"));

  const ready = summarizeCleanTargetEnvironment({}, {
    HOMEAI_CLEAN_TARGET_ROOT: "/tmp/homeai-clean-target-owner-3a",
    HOMEAI_CLEAN_TARGET_ISOLATED: "1",
    HOMEAI_CLEAN_TARGET_FIXTURE: "/tmp/homeai-clean-target-owner-3a/fixture.json",
    HOMEAI_CLEAN_TARGET_READBACK_FILE: "/tmp/homeai-clean-target-owner-3a/readback.json",
    HOMEAI_INSTALL_RUN_OPERATOR_PHASES: "1",
    HOMEAI_INSTALL_LAUNCHD_APPLY: "1",
    HOMEAI_INSTALL_APPLY_WORKSPACE_ACL: "1",
  });
  assert.equal(ready.status, "ready");
  assert.deepEqual(ready.issueCodes, []);
  assert.equal(ready.targetRoot.basename, "homeai-clean-target-owner-3a");
  assert.equal(ready.targetRoot.hash.length, 12);
  assert.equal(ready.gates.operatorPhases, true);
  assert.equal(ready.gates.launchdApply, true);
  assert.equal(ready.gates.workspaceAclApply, true);
  assert.equal(ready.privacy, "metadata_only_path_basename_hash_no_raw_target_paths");
}

function testStageLedgerFailsClosedForMissingCoverageOrContract() {
  const phases = [
    {
      id: "incomplete",
      category: "test",
      command: process.execPath,
      args: ["scripts/example.js"],
      required: true,
      contract: {
        ownerLayer: "",
        stageIds: ["source_preflight", "unknown_stage"],
        evidenceKeys: [],
        closureReadbacks: [],
        requiredChecks: [],
        privacyBoundary: "",
      },
    },
  ];
  const ledger = buildStageLedger(phases);
  assert.equal(ledger.ok, false);
  assert.ok(ledger.issues.some((issue) => issue.code === "canary_phase_contract_owner_missing"));
  assert.ok(ledger.issues.some((issue) => issue.code === "canary_phase_contract_unknown_stage"));
  assert.ok(ledger.issues.some((issue) => issue.code === "canary_required_stage_missing" && issue.stageId === "owner_key_bootstrap"));
  assert.equal(validatePhaseContract(defaultPhaseDefinitions()[0]).length, 0);
}

async function testExecuteRunsSourceSafePhases() {
  const calls = [];
  const service = createHomeAiInstallUpgradeCanaryService({ runProcess: fakeRunner(calls) });
  const report = await service.executeCanary({ execute: true, nowIso: "2026-07-01T00:00:00.000Z" });
  assert.equal(report.ok, true, JSON.stringify(report, null, 2));
  assert.equal(report.executionClass, "source_safe_rehearsal");
  assert.equal(report.closureStatus, "partial");
  assert.equal(report.cleanTargetEnvironment.status, "blocked");
  assert.equal(report.cleanTargetCanary.status, "not_run");
  assert.equal(report.policy.productionWrites, false);
  assert.equal(report.policy.localExecuteIsSourceSafeRehearsalOnly, true);
  assert.equal(report.policy.networkClone, false);
  assert.equal(report.failedPhaseCount, 0);
  assert.equal(report.stageCoverage.coveredStageCount, REQUIRED_STAGE_DEFINITIONS.length);
  assert.deepEqual(report.stageCoverage.missingStageIds, []);
  assert.equal(report.steps.every((step) => step.contract?.privacyBoundary === "metadata_only_no_raw_secrets_or_payloads"), true);
  assert.equal(report.categories.fresh_install.ok, true);
  assert.equal(report.categories.public_upgrade.ok, true);
  assert.equal(calls.length, defaultPhaseDefinitions().length);
}

async function testCleanTargetReadbackCanCompleteOnlyFromLaneEvidence() {
  const calls = [];
  const service = createHomeAiInstallUpgradeCanaryService({ runProcess: fakeRunner(calls) });
  const report = await service.executeCanary({
    execute: true,
    env: {
      HOMEAI_CLEAN_TARGET_ROOT: "/tmp/homeai-clean-target-owner-3a",
      HOMEAI_CLEAN_TARGET_ISOLATED: "1",
      HOMEAI_CLEAN_TARGET_FIXTURE: "/tmp/homeai-clean-target-owner-3a/fixture.json",
      HOMEAI_CLEAN_TARGET_READBACK_FILE: "/tmp/homeai-clean-target-owner-3a/readback.json",
      HOMEAI_INSTALL_RUN_OPERATOR_PHASES: "1",
      HOMEAI_INSTALL_LAUNCHD_APPLY: "1",
      HOMEAI_INSTALL_APPLY_WORKSPACE_ACL: "1",
    },
    cleanTargetReadback: {
      status: "passed",
      lane: "Home AI Deploy Lane A",
      evidenceVersion: "test-clean-target-v1",
      phases: [
        { id: "fresh_install_clean_target", status: "passed", tempRootRemoved: true },
        { id: "public_upgrade_clean_target", status: "passed", tempRootRemoved: true, productionReadback: true },
      ],
      noCompletionClaim: false,
    },
  });
  assert.equal(report.ok, true, JSON.stringify(report, null, 2));
  assert.equal(report.closureStatus, "complete");
  assert.equal(report.cleanTargetEnvironment.status, "ready");
  assert.equal(report.cleanTargetCanary.status, "passed");
  assert.equal(report.cleanTargetCanary.noCompletionClaim, false);
  assert.equal(report.cleanTargetCanary.lane, "Home AI Deploy Lane A");
  assert.equal(report.cleanTargetCanary.phaseCount, 2);
}

async function testPassedCleanTargetReadbackFailsClosedWithoutEvidenceShape() {
  const calls = [];
  const service = createHomeAiInstallUpgradeCanaryService({ runProcess: fakeRunner(calls) });
  const report = await service.executeCanary({
    execute: true,
    cleanTargetReadback: {
      status: "passed",
      phases: [
        { id: "fresh_install_clean_target", status: "passed", tempRootRemoved: true },
      ],
      noCompletionClaim: false,
    },
  });
  assert.equal(report.ok, false);
  assert.equal(report.closureStatus, "partial");
  assert.equal(report.cleanTargetCanary.status, "passed");
  assert.equal(report.cleanTargetCanary.noCompletionClaim, true);
  assert.ok(report.cleanTargetCanary.issueCodes.includes("clean_target_canary_lane_missing"));
  assert.ok(report.cleanTargetCanary.issueCodes.includes("clean_target_canary_evidence_version_missing"));
  assert.ok(report.cleanTargetCanary.issueCodes.includes("clean_target_canary_upgrade_phase_missing"));
  assert.ok(report.cleanTargetCanary.issueCodes.includes("clean_target_canary_production_readback_missing"));
  assert.ok(report.issues.some((issue) => issue.code === "clean_target_environment_not_ready"));
  assert.ok(report.issues.some((issue) => issue.code === "clean_target_canary_completion_claim_conflict"));
}

function testNormalizeCleanTargetCanaryRequiresBoundedReadbackShape() {
  const normalized = normalizeCleanTargetCanary({
    status: "passed",
    lane: "Home AI Deploy Lane A",
    evidenceVersion: "test-clean-target-v1",
    phases: [
      { id: "fresh_install_clean_target", status: "passed", tempRootRemoved: true },
      { id: "public_upgrade_clean_target", status: "passed", tempRootRemoved: true, productionReadback: true },
    ],
    noCompletionClaim: false,
  });
  assert.equal(normalized.status, "passed");
  assert.equal(normalized.noCompletionClaim, false);
  assert.deepEqual(normalized.issueCodes, []);

  const issues = validateCleanTargetReadbackEvidence({
    status: "passed",
    lane: "",
    evidenceVersion: "",
    phases: [],
  });
  assert.ok(issues.includes("clean_target_canary_lane_missing"));
  assert.ok(issues.includes("clean_target_canary_evidence_version_missing"));
  assert.ok(issues.includes("clean_target_canary_phase_evidence_missing"));
}

async function testFailedCleanTargetReadbackFailsReport() {
  const calls = [];
  const service = createHomeAiInstallUpgradeCanaryService({ runProcess: fakeRunner(calls) });
  const report = await service.executeCanary({
    execute: true,
    cleanTargetReadback: {
      status: "failed",
      issueCodes: ["clean_install_listener_readback_failed"],
    },
  });
  assert.equal(report.ok, false);
  assert.equal(report.closureStatus, "partial");
  assert.ok(report.issues.some((issue) => issue.code === "clean_target_canary_failed"));
}

async function testExecutePublicRehearsalAddsDailySmokeValidation() {
  const calls = [];
  const service = createHomeAiInstallUpgradeCanaryService({ runProcess: fakeRunner(calls) });
  const report = await service.executeCanary({ execute: true, executePublicRehearsal: true });
  const step = report.steps.find((item) => item.id === "public_upgrade_rehearsal_execute");
  assert.equal(report.ok, true);
  assert.equal(report.policy.networkClone, true);
  assert.equal(step.summary.publicUpgradeDailySmokeOk, true);
  assert.equal(step.summary.cloneActionCount, 10);
}

async function testPhaseFailureFailsCanary() {
  const calls = [];
  const service = createHomeAiInstallUpgradeCanaryService({
    runProcess: fakeRunner(calls, "scripts/macos-fresh-install-rehearsal.js"),
  });
  const report = await service.executeCanary({ execute: true });
  assert.equal(report.ok, false);
  assert.equal(report.failedPhaseCount, 1);
  assert.ok(report.issues.some((issue) => issue.phaseId === "macos_fresh_install_rehearsal"));
}

(async () => {
  testPlanIsSafeByDefault();
  testCleanTargetEnvironmentReadinessIsExplicitAndBounded();
  testStageLedgerFailsClosedForMissingCoverageOrContract();
  testNormalizeCleanTargetCanaryRequiresBoundedReadbackShape();
  await testExecuteRunsSourceSafePhases();
  await testExecutePublicRehearsalAddsDailySmokeValidation();
  await testCleanTargetReadbackCanCompleteOnlyFromLaneEvidence();
  await testPassedCleanTargetReadbackFailsClosedWithoutEvidenceShape();
  await testFailedCleanTargetReadbackFailsReport();
  await testPhaseFailureFailsCanary();
  console.log("home ai install upgrade canary service tests passed");
})();
