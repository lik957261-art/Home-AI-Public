"use strict";

const assert = require("node:assert/strict");
const {
  buildOwner3AQualityProgramSnapshot,
  normalizeStatus,
  worstStatus,
} = require("../adapters/owner-3a-quality-program-service");

function runtimeSloModel(overrides = {}) {
  return Object.assign({
    ok: true,
    modelVersion: "test-runtime-slo",
    matrixVersion: "test-matrix",
    signalCount: 21,
    unmappedSignalIds: [],
    dimensions: [
      {
        id: "availability",
        signalIds: [
          "system_resource_health",
          "gateway_profile_health",
          "deploy_lane_liveness",
          "plugin_proxy_latency",
          "media_preview_health",
          "native_bridge_capability",
          "notification_delivery",
          "install_upgrade_canary",
          "public_upgrade_rehearsal",
        ],
      },
      {
        id: "accuracy",
        signalIds: [
          "mcp_schema_closure",
          "composer_runtime_feedback",
          "gateway_document_tool_capability",
          "plugin_proxy_workspace_boundary",
          "plugin_manifest_health",
          "plugin_action_metadata_health",
        ],
      },
      {
        id: "autonomy",
        signalIds: [
          "task_card_dispatch",
          "plugin_deploy_contract_closure",
          "audit_thread_liveness",
          "automation_cron_health",
          "production_self_diagnostics",
          "runtime_slo_coverage",
        ],
      },
    ],
    policy: {
      closureRequiresReadback: true,
      noRestartAsClosure: true,
      noSilentFallback: true,
      ownerGateForFeatureOrCapabilityRequests: true,
      selfCheckAutomationMayAutoDispatch: true,
    },
  }, overrides);
}

function testSnapshotKeepsCleanCanaryGapVisible() {
  const snapshot = buildOwner3AQualityProgramSnapshot({
    nowIso: () => "2026-07-01T00:00:00.000Z",
    runtimeSloModel: runtimeSloModel(),
    systemStatus: { overallStatus: "ok" },
    autonomousDeliveryControl: { status: "ok", counts: {} },
  });

  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.status, "warning");
  assert.equal(snapshot.progressPercent, 85);
  assert.equal(snapshot.requirementCount, 13);
  assert.equal(snapshot.completedRequirementCount, 9);
  assert.equal(snapshot.workstreams.length, 5);
  assert.equal(snapshot.policy.noCompletionClaim, true);
  assert.equal(snapshot.gaps.some((item) => item.requirementId === "install_upgrade_canary_observed"), true);
  assert.equal(snapshot.gaps.some((item) => item.requirementId === "clean_target_live_canary"), true);
  assert.equal(snapshot.gaps.some((item) => item.requirementId === "wardrobe_reference_action_contract"), true);
  assert.equal(snapshot.gaps.some((item) => item.requirementId === "deterministic_action_generalization"), true);
  assert.equal(JSON.stringify(snapshot).includes("/Users/"), false);
}

function testSnapshotCanReachOkWhenAllEvidenceIsProvided() {
  const snapshot = buildOwner3AQualityProgramSnapshot({
    nowIso: () => "2026-07-01T00:00:00.000Z",
    runtimeSloModel: runtimeSloModel(),
    systemStatus: { overallStatus: "ok" },
    autonomousDeliveryControl: { status: "ok", counts: {} },
    extraEvidence: {
      installUpgradeCanaryObservedStatus: "ok",
      cleanInstallCanaryStatus: "ok",
      wardrobeReferenceActionStatus: "ok",
      pluginActionReference: {
        pluginId: "wardrobe",
        actionKind: "wardrobeOutfitWearIntent",
        actionFamilyCount: 3,
      },
      deterministicActionGeneralizationStatus: "ok",
      deterministicActionGeneralization: {
        actionFamilyCount: 3,
        generalizedActionFamilyCount: 2,
        actionClassCount: 3,
        actionClasses: ["mcp_intent_action", "owner_task_card_action", "manifest_route_action"],
      },
    },
  });

  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.status, "ok");
  assert.equal(snapshot.progressPercent, 100);
  assert.deepEqual(snapshot.gaps, []);
  assert.equal(snapshot.policy.noCompletionClaim, false);
  const actionWorkstream = snapshot.workstreams.find((item) => item.id === "gateway_message_action_contract");
  assert.equal(actionWorkstream.status, "ok");
  const generalization = actionWorkstream.requirements.find((item) => item.id === "deterministic_action_generalization");
  assert.equal(generalization.boundedEvidence.actionFamilyCount, 3);
  assert.equal(generalization.boundedEvidence.generalizedActionFamilyCount, 2);
  assert.equal(generalization.boundedEvidence.actionClassCount, 3);
  assert.deepEqual(generalization.boundedEvidence.actionClasses, [
    "mcp_intent_action",
    "owner_task_card_action",
    "manifest_route_action",
  ]);
}

function testCleanTargetEnvironmentBlockedSurfacesAsBlockedRequirement() {
  const snapshot = buildOwner3AQualityProgramSnapshot({
    nowIso: () => "2026-07-01T00:00:00.000Z",
    runtimeSloModel: runtimeSloModel(),
    systemStatus: { overallStatus: "ok" },
    autonomousDeliveryControl: { status: "ok", counts: {} },
    extraEvidence: {
      installUpgradeCanaryObservedStatus: "partial",
      installUpgradeCanary: {
        mode: "execute",
        cleanTargetCanaryStatus: "not_run",
        cleanTargetEnvironmentStatus: "blocked",
      },
      cleanInstallCanaryStatus: "partial",
      cleanTargetCanary: {
        sourceSafeRehearsalOk: true,
        cleanTargetCanaryStatus: "not_run",
        cleanTargetNoCompletionClaim: true,
        cleanTargetEnvironmentStatus: "blocked",
        cleanTargetEnvironmentIssues: [
          "clean_target_root_missing",
          "operator_phases_gate_missing",
        ],
      },
      wardrobeReferenceActionStatus: "ok",
      deterministicActionGeneralizationStatus: "ok",
    },
  });

  const canaryWorkstream = snapshot.workstreams.find((item) => item.id === "fresh_install_upgrade_canary");
  const cleanTarget = canaryWorkstream.requirements.find((item) => item.id === "clean_target_live_canary");

  assert.equal(snapshot.status, "blocked");
  assert.equal(snapshot.ok, false);
  assert.equal(canaryWorkstream.status, "blocked");
  assert.equal(cleanTarget.status, "blocked");
  assert.equal(cleanTarget.weight, 0);
  assert.equal(cleanTarget.boundedEvidence.cleanInstallCanaryStatus, "partial");
  assert.equal(cleanTarget.boundedEvidence.cleanTargetCanaryStatus, "not_run");
  assert.equal(cleanTarget.boundedEvidence.cleanTargetEnvironmentStatus, "blocked");
  assert.deepEqual(cleanTarget.boundedEvidence.cleanTargetEnvironmentIssues, [
    "clean_target_root_missing",
    "operator_phases_gate_missing",
  ]);
  assert.equal(cleanTarget.gap.includes("隔离干净目标"), true);
  assert.equal(snapshot.policy.noCompletionClaim, true);
}

function testAggregateCleanTargetEnvironmentBlockedSurfacesAsBlockedRequirement() {
  const snapshot = buildOwner3AQualityProgramSnapshot({
    nowIso: () => "2026-07-01T00:00:00.000Z",
    runtimeSloModel: runtimeSloModel(),
    systemStatus: { overallStatus: "ok" },
    autonomousDeliveryControl: { status: "ok", counts: {} },
    extraEvidence: {
      installUpgradeCanaryObservedStatus: "partial",
      installUpgradeCanary: {
        mode: "execute",
        cleanTargetCanaryStatus: "not_run",
        cleanTargetEnvironmentStatus: "blocked",
        cleanTargetEnvironmentIssues: ["clean_target_root_missing"],
      },
      wardrobeReferenceActionStatus: "ok",
      deterministicActionGeneralizationStatus: "ok",
    },
  });

  const canaryWorkstream = snapshot.workstreams.find((item) => item.id === "fresh_install_upgrade_canary");
  const cleanTarget = canaryWorkstream.requirements.find((item) => item.id === "clean_target_live_canary");

  assert.equal(snapshot.status, "blocked");
  assert.equal(canaryWorkstream.status, "blocked");
  assert.equal(cleanTarget.status, "blocked");
  assert.equal(cleanTarget.boundedEvidence.cleanTargetEnvironmentStatus, "blocked");
  assert.deepEqual(cleanTarget.boundedEvidence.cleanTargetEnvironmentIssues, ["clean_target_root_missing"]);
}

function testCleanTargetCanaryStatusCanDriveRequirementWhenLiveStatusMissing() {
  const snapshot = buildOwner3AQualityProgramSnapshot({
    nowIso: () => "2026-07-01T00:00:00.000Z",
    runtimeSloModel: runtimeSloModel(),
    systemStatus: { overallStatus: "ok" },
    autonomousDeliveryControl: { status: "ok", counts: {} },
    extraEvidence: {
      installUpgradeCanaryObservedStatus: "ok",
      installUpgradeCanary: {
        mode: "execute",
        cleanTargetCanaryStatus: "passed",
        cleanTargetEnvironmentStatus: "ready",
      },
      cleanTargetCanary: {
        cleanTargetCanaryStatus: "passed",
        cleanTargetEnvironmentStatus: "ready",
        cleanTargetNoCompletionClaim: false,
      },
      wardrobeReferenceActionStatus: "ok",
      deterministicActionGeneralizationStatus: "ok",
    },
  });

  const canaryWorkstream = snapshot.workstreams.find((item) => item.id === "fresh_install_upgrade_canary");
  const cleanTarget = canaryWorkstream.requirements.find((item) => item.id === "clean_target_live_canary");

  assert.equal(cleanTarget.status, "ok");
  assert.equal(cleanTarget.weight, 1);
  assert.equal(cleanTarget.boundedEvidence.cleanTargetEnvironmentStatus, "ready");
  assert.equal(cleanTarget.boundedEvidence.cleanTargetCanaryStatus, "passed");
}

function testSkippedCleanTargetCanaryRemainsPartialNotBlocked() {
  const snapshot = buildOwner3AQualityProgramSnapshot({
    nowIso: () => "2026-07-01T00:00:00.000Z",
    runtimeSloModel: runtimeSloModel(),
    systemStatus: { overallStatus: "ok" },
    autonomousDeliveryControl: { status: "ok", counts: {} },
    extraEvidence: {
      installUpgradeCanaryObservedStatus: "partial",
      installUpgradeCanary: {
        mode: "replay",
        skipped: true,
        reason: "install_upgrade_canary_skipped_by_option",
      },
      cleanInstallCanaryStatus: "partial",
      cleanTargetCanary: {
        mode: "replay",
        skipped: true,
        reason: "install_upgrade_canary_skipped_by_option",
      },
      wardrobeReferenceActionStatus: "ok",
      deterministicActionGeneralizationStatus: "ok",
    },
  });

  const canaryWorkstream = snapshot.workstreams.find((item) => item.id === "fresh_install_upgrade_canary");
  const cleanTarget = canaryWorkstream.requirements.find((item) => item.id === "clean_target_live_canary");

  assert.equal(snapshot.status, "warning");
  assert.equal(canaryWorkstream.status, "warning");
  assert.equal(cleanTarget.status, "partial");
  assert.equal(cleanTarget.weight, 0.5);
  assert.equal(cleanTarget.boundedEvidence.skipped, true);
  assert.equal(cleanTarget.boundedEvidence.reason, "install_upgrade_canary_skipped_by_option");
  assert.equal(cleanTarget.boundedEvidence.cleanTargetEnvironmentStatus, "not_collected");
  assert.equal(snapshot.policy.noCompletionClaim, true);
}

function testSnapshotSurfacesRuntimeAndDispatchGaps() {
  const snapshot = buildOwner3AQualityProgramSnapshot({
    runtimeSloModel: runtimeSloModel({
      ok: false,
      unmappedSignalIds: ["missing_signal"],
      policy: {
        closureRequiresReadback: false,
        noRestartAsClosure: true,
        noSilentFallback: true,
        ownerGateForFeatureOrCapabilityRequests: true,
        selfCheckAutomationMayAutoDispatch: false,
      },
    }),
    systemStatus: { overallStatus: "degraded" },
    autonomousDeliveryControl: { status: "degraded", counts: { failed: 1, deferredConflict: 2 } },
  });

  assert.equal(snapshot.status, "degraded");
  assert.equal(snapshot.ok, false);
  assert.equal(snapshot.workstreams.find((item) => item.id === "runtime_slo_diagnostic_closure").status, "degraded");
  assert.equal(snapshot.workstreams.find((item) => item.id === "self_improving_loop_closure").status, "degraded");
  assert.equal(snapshot.gaps.some((item) => item.requirementId === "runtime_slo_model_mapped"), true);
  assert.equal(snapshot.gaps.some((item) => item.requirementId === "dispatch_queue_clear"), true);
}

function testStatusHelpers() {
  assert.equal(normalizeStatus("covered"), "ok");
  assert.equal(normalizeStatus("not_collected"), "warning");
  assert.equal(worstStatus(["ok", "partial", "warning"]), "warning");
  assert.equal(worstStatus(["ok", "blocked", "degraded"]), "blocked");
}

function run() {
  testStatusHelpers();
  testSnapshotKeepsCleanCanaryGapVisible();
  testSnapshotCanReachOkWhenAllEvidenceIsProvided();
  testCleanTargetEnvironmentBlockedSurfacesAsBlockedRequirement();
  testAggregateCleanTargetEnvironmentBlockedSurfacesAsBlockedRequirement();
  testCleanTargetCanaryStatusCanDriveRequirementWhenLiveStatusMissing();
  testSkippedCleanTargetCanaryRemainsPartialNotBlocked();
  testSnapshotSurfacesRuntimeAndDispatchGaps();
  console.log("owner 3A quality program service tests passed");
}

run();
