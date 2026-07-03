"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  OWNER_3A_QUALITY_EVIDENCE_VERSION,
  buildOwner3AQualityEvidence,
  createOwner3AQualityEvidenceService,
  defaultEvidenceFile,
} = require("../adapters/owner-3a-quality-evidence-service");

function installUpgradeCanary(overrides = {}) {
  return Object.assign({
    ok: true,
    mode: "execute",
    phaseCount: 9,
    passedPhaseCount: 9,
    failedPhaseCount: 0,
    categories: {
      fresh_install: { ok: true },
      public_upgrade: { ok: true },
      plugin_provisioning: { ok: true },
      self_improving_loop: { ok: true },
    },
    issues: [],
    steps: [
      {
        id: "macos_fresh_install_rehearsal",
        ok: true,
        summary: {
          phaseCount: 20,
          issueCount: 0,
          tempRemoved: true,
        },
      },
      {
        id: "public_upgrade_rehearsal_plan",
        ok: true,
        summary: {
          actionCount: 10,
          productionWrites: false,
          tempRootOnly: true,
        },
      },
    ],
    policy: {
      productionWrites: false,
      networkClone: false,
    },
    cleanTargetEnvironment: {
      status: "ready",
      issueCodes: [],
      gates: {
        isolatedDeclared: true,
        operatorPhases: true,
        launchdApply: true,
        workspaceAclApply: true,
      },
    },
    cleanTargetCanary: {
      status: "passed",
      lane: "Home AI Deploy Lane A",
      evidenceVersion: "test-clean-target-v1",
      phaseCount: 2,
      issueCodes: [],
      noCompletionClaim: false,
    },
    tempPath: "/private/tmp/must-not-leak",
  }, overrides);
}

function pluginActionClosure(overrides = {}) {
  return Object.assign({
    ok: true,
    schemaVersion: 2,
    modelVersion: "20260702-plugin-action-metadata-closure-v3",
    reference: {
      pluginId: "wardrobe",
      actionKind: "wardrobeOutfitWearIntent",
    },
    actionFamilyCount: 3,
    familyCount: 3,
    generalizedActionFamilyCount: 2,
    actionClassCount: 3,
    actionClasses: ["mcp_intent_action", "owner_task_card_action", "manifest_route_action"],
    stageCount: 15,
    passedStageCount: 15,
    failedStageCount: 0,
    failedStages: [],
    actionFamilies: [
      {
        familyId: "wardrobe_outfit_wear_intent",
        pluginId: "wardrobe",
        actionKind: "wardrobeOutfitWearIntent",
        actionClass: "mcp_intent_action",
        failedStageCount: 0,
      },
      {
        familyId: "plugin_conversation_repair_request",
        pluginId: "home-ai",
        actionKind: "pluginConversationRepairRequest",
        actionClass: "owner_task_card_action",
        failedStageCount: 0,
      },
      {
        familyId: "finance_manifest_route_action",
        pluginId: "finance",
        actionKind: "manifestPluginRouteAction",
        actionClass: "manifest_route_action",
        failedStageCount: 0,
      },
    ],
    rawPayload: { secret: "must-not-leak" },
  }, overrides);
}

function legacyWardrobeOnlyPluginActionClosure(overrides = {}) {
  return Object.assign({
    ok: true,
    modelVersion: "20260701-plugin-action-metadata-closure-v1",
    reference: {
      pluginId: "wardrobe",
      actionKind: "wardrobeOutfitWearIntent",
    },
    stageCount: 6,
    passedStageCount: 6,
    failedStageCount: 0,
    failedStages: [],
  }, overrides);
}

function testBuildsMetadataOnlyEvidenceFromReferenceReports() {
  const evidence = buildOwner3AQualityEvidence({
    nowIso: () => "2026-07-01T00:00:00.000Z",
    installUpgradeCanary: installUpgradeCanary(),
    pluginActionMetadataClosure: pluginActionClosure(),
  });

  assert.equal(evidence.ok, true);
  assert.equal(evidence.evidenceVersion, OWNER_3A_QUALITY_EVIDENCE_VERSION);
  assert.equal(evidence.status, "ok");
  assert.equal(evidence.extraEvidence.installUpgradeCanaryObservedStatus, "ok");
  assert.equal(evidence.extraEvidence.cleanInstallCanaryStatus, "ok");
  assert.equal(evidence.extraEvidence.wardrobeReferenceActionStatus, "ok");
  assert.equal(evidence.extraEvidence.deterministicActionGeneralizationStatus, "ok");
  assert.equal(evidence.extraEvidence.installUpgradeCanary.phaseCount, 9);
  assert.equal(evidence.extraEvidence.cleanTargetCanary.freshInstallRehearsalOk, true);
  assert.equal(evidence.extraEvidence.cleanTargetCanary.publicUpgradePlanTempRootOnly, true);
  assert.equal(evidence.extraEvidence.cleanTargetCanary.cleanTargetCanaryStatus, "passed");
  assert.equal(evidence.extraEvidence.cleanTargetCanary.cleanTargetNoCompletionClaim, false);
  assert.equal(evidence.extraEvidence.cleanTargetCanary.cleanTargetEnvironmentStatus, "ready");
  assert.equal(evidence.extraEvidence.pluginActionReference.pluginId, "wardrobe");
  assert.equal(evidence.extraEvidence.pluginActionReference.actionKind, "wardrobeOutfitWearIntent");
  assert.equal(evidence.extraEvidence.deterministicActionGeneralization.actionFamilyCount, 3);
  assert.equal(evidence.policy.noCompletionClaim, false);
  assert.equal(JSON.stringify(evidence).includes("/private/tmp"), false);
  assert.equal(JSON.stringify(evidence).includes("must-not-leak"), false);
}

function testFailedReportsBecomeDegradedEvidence() {
  const evidence = buildOwner3AQualityEvidence({
    installUpgradeCanary: installUpgradeCanary({
      ok: false,
      failedPhaseCount: 1,
      issues: [{ code: "fresh_install_failed" }],
    }),
    pluginActionMetadataClosure: pluginActionClosure({
      ok: false,
      failedStageCount: 1,
      failedStages: ["thread_projection"],
    }),
  });

  assert.equal(evidence.ok, false);
  assert.equal(evidence.status, "degraded");
  assert.equal(evidence.extraEvidence.installUpgradeCanaryObservedStatus, "degraded");
  assert.equal(evidence.extraEvidence.cleanInstallCanaryStatus, "degraded");
  assert.equal(evidence.extraEvidence.wardrobeReferenceActionStatus, "degraded");
  assert.equal(evidence.extraEvidence.deterministicActionGeneralizationStatus, "degraded");
  assert.deepEqual(evidence.extraEvidence.pluginActionReference.failedStages, ["thread_projection"]);
}

function testLegacyWardrobeOnlyClosureDoesNotClaimGeneralization() {
  const evidence = buildOwner3AQualityEvidence({
    installUpgradeCanary: installUpgradeCanary(),
    pluginActionMetadataClosure: legacyWardrobeOnlyPluginActionClosure(),
  });

  assert.equal(evidence.status, "partial");
  assert.equal(evidence.extraEvidence.wardrobeReferenceActionStatus, "ok");
  assert.equal(evidence.extraEvidence.deterministicActionGeneralizationStatus, "partial");
  assert.equal(evidence.policy.noCompletionClaim, true);
}

function testAggregatedCanaryDoesNotClaimCleanTargetClosure() {
  const evidence = buildOwner3AQualityEvidence({
    installUpgradeCanary: installUpgradeCanary({
      steps: [],
      cleanTargetCanary: undefined,
    }),
    pluginActionMetadataClosure: pluginActionClosure(),
  });

  assert.equal(evidence.status, "partial");
  assert.equal(evidence.extraEvidence.installUpgradeCanaryObservedStatus, "partial");
  assert.equal(evidence.extraEvidence.cleanInstallCanaryStatus, "partial");
  assert.equal(evidence.extraEvidence.cleanTargetCanary.sourceSafeRehearsalOk, false);
  assert.equal(evidence.extraEvidence.cleanTargetCanary.cleanTargetCanaryStatus, "");
  assert.equal(evidence.policy.noCompletionClaim, true);
}

function testSourceSafeExecuteCanaryDoesNotClaimCleanTargetClosure() {
  const evidence = buildOwner3AQualityEvidence({
    installUpgradeCanary: installUpgradeCanary({
      cleanTargetEnvironment: {
        status: "blocked",
        issueCodes: ["clean_target_root_missing", "operator_phases_gate_missing"],
      },
      cleanTargetCanary: {
        status: "not_run",
        noCompletionClaim: true,
      },
    }),
    pluginActionMetadataClosure: pluginActionClosure(),
  });

  assert.equal(evidence.status, "partial");
  assert.equal(evidence.extraEvidence.installUpgradeCanaryObservedStatus, "partial");
  assert.equal(evidence.extraEvidence.installUpgradeCanary.cleanTargetCanaryStatus, "not_run");
  assert.equal(evidence.extraEvidence.installUpgradeCanary.cleanTargetEnvironmentStatus, "blocked");
  assert.equal(evidence.extraEvidence.cleanInstallCanaryStatus, "partial");
  assert.equal(evidence.extraEvidence.cleanTargetCanary.sourceSafeRehearsalOk, true);
  assert.equal(evidence.extraEvidence.cleanTargetCanary.cleanTargetCanaryStatus, "not_run");
  assert.deepEqual(evidence.extraEvidence.cleanTargetCanary.cleanTargetEnvironmentIssues, [
    "clean_target_root_missing",
    "operator_phases_gate_missing",
  ]);
  assert.equal(evidence.policy.noCompletionClaim, true);
}

function testPlanOnlyCanaryDoesNotClaimObservedClosure() {
  const evidence = buildOwner3AQualityEvidence({
    installUpgradeCanary: installUpgradeCanary({
      mode: "plan",
      steps: [],
      cleanTargetCanary: undefined,
    }),
    pluginActionMetadataClosure: pluginActionClosure(),
  });

  assert.equal(evidence.status, "partial");
  assert.equal(evidence.extraEvidence.installUpgradeCanaryObservedStatus, "partial");
  assert.equal(evidence.extraEvidence.installUpgradeCanary.mode, "plan");
  assert.equal(evidence.extraEvidence.cleanInstallCanaryStatus, undefined);
  assert.equal(evidence.extraEvidence.cleanTargetCanary, undefined);
  assert.equal(evidence.policy.noCompletionClaim, true);
}

function testSkippedCanaryDoesNotDegradeCleanTargetEvidence() {
  const evidence = buildOwner3AQualityEvidence({
    installUpgradeCanary: {
      ok: false,
      skipped: true,
      reason: "install_upgrade_canary_skipped_by_option",
    },
    pluginActionMetadataClosure: pluginActionClosure(),
  });

  assert.equal(evidence.status, "partial");
  assert.equal(evidence.extraEvidence.installUpgradeCanaryObservedStatus, "partial");
  assert.equal(evidence.extraEvidence.cleanInstallCanaryStatus, "partial");
  assert.equal(evidence.extraEvidence.cleanTargetCanary.skipped, true);
  assert.equal(evidence.extraEvidence.cleanTargetCanary.reason, "install_upgrade_canary_skipped_by_option");
  assert.equal(evidence.policy.noCompletionClaim, true);
}

function testOldEvidenceVersionKeepsExplicitStatuses() {
  const evidence = buildOwner3AQualityEvidence({
    evidenceVersion: "20260701-owner-3a-quality-evidence-v1",
    extraEvidence: {
      installUpgradeCanaryObservedStatus: "ok",
      cleanInstallCanaryStatus: "ok",
      wardrobeReferenceActionStatus: "ok",
      deterministicActionGeneralizationStatus: "partial",
    },
  });

  assert.equal(evidence.extraEvidence.installUpgradeCanaryObservedStatus, "ok");
  assert.equal(evidence.extraEvidence.cleanInstallCanaryStatus, "ok");
  assert.equal(evidence.extraEvidence.wardrobeReferenceActionStatus, "ok");
  assert.equal(evidence.extraEvidence.deterministicActionGeneralizationStatus, "partial");
  assert.equal(evidence.policy.noCompletionClaim, true);
}

async function testFileBackedServiceReadsBoundedEvidence() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "owner-3a-quality-evidence-"));
  const file = path.join(dir, "evidence.json");
  const evidence = buildOwner3AQualityEvidence({
    nowIso: () => "2026-07-01T00:00:00.000Z",
    installUpgradeCanary: installUpgradeCanary(),
    pluginActionMetadataClosure: pluginActionClosure(),
  });
  fs.writeFileSync(file, `${JSON.stringify(evidence, null, 2)}\n`);

  const service = createOwner3AQualityEvidenceService({
    evidenceFile: file,
    nowMs: () => Date.parse("2026-07-01T00:05:00.000Z"),
  });
  const collected = await service.collect();
  assert.equal(collected.status, "ok");
  assert.equal(collected.extraEvidence.installUpgradeCanaryObservedStatus, "ok");
  assert.equal(collected.extraEvidence.cleanInstallCanaryStatus, "ok");
  assert.equal(collected.extraEvidence.wardrobeReferenceActionStatus, "ok");
  assert.equal(collected.extraEvidence.deterministicActionGeneralizationStatus, "ok");
}

async function testMissingFileIsBoundedUnknownEvidence() {
  const service = createOwner3AQualityEvidenceService({
    evidenceFile: path.join(os.tmpdir(), "homeai-missing-owner-3a-quality-evidence.json"),
    nowMs: () => Date.parse("2026-07-01T00:00:00.000Z"),
  });
  const collected = await service.collect();
  assert.equal(collected.ok, false);
  assert.equal(collected.status, "unknown");
  assert.equal(collected.reason, "quality_evidence_file_missing");
  assert.deepEqual(collected.extraEvidence, {});
}

function testDefaultEvidenceFileUsesHermesHomeDataRoot() {
  const file = defaultEvidenceFile({
    HERMES_WEB_DATA_DIR: "/tmp/hermes-data",
  });
  assert.equal(file, "/tmp/hermes-data/hermes-home/self-improving-loop/owner-3a-quality-evidence.json");
}

async function run() {
  testBuildsMetadataOnlyEvidenceFromReferenceReports();
  testFailedReportsBecomeDegradedEvidence();
  testLegacyWardrobeOnlyClosureDoesNotClaimGeneralization();
  testAggregatedCanaryDoesNotClaimCleanTargetClosure();
  testSourceSafeExecuteCanaryDoesNotClaimCleanTargetClosure();
  testPlanOnlyCanaryDoesNotClaimObservedClosure();
  testSkippedCanaryDoesNotDegradeCleanTargetEvidence();
  testOldEvidenceVersionKeepsExplicitStatuses();
  await testFileBackedServiceReadsBoundedEvidence();
  await testMissingFileIsBoundedUnknownEvidence();
  testDefaultEvidenceFileUsesHermesHomeDataRoot();
  console.log("owner 3A quality evidence service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
