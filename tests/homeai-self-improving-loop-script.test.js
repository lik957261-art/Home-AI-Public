"use strict";

const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const {
  collectThreadLiveness,
  threadLivenessCwdCandidates,
} = require("../scripts/homeai-self-improving-loop");

function runJson(args) {
  const output = execFileSync(process.execPath, ["scripts/homeai-self-improving-loop.js", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return JSON.parse(output);
}

function runJsonAllowFailure(args) {
  const result = spawnSync(process.execPath, ["scripts/homeai-self-improving-loop.js", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout);
}

function runJsonFromCwd(args, cwd) {
  const output = execFileSync(process.execPath, [path.join(repoRoot, "scripts/homeai-self-improving-loop.js"), ...args], {
    cwd,
    encoding: "utf8",
  });
  return JSON.parse(output);
}

function testMatrixCli() {
  const matrix = runJson(["--matrix", "--json"]);
  assert.equal(matrix.ok, true);
  assert.equal(matrix.signals.some((signal) => signal.id === "mcp_schema_closure"), true);
}

function testDryRunAuditCardsDoNotDispatch() {
  const result = runJsonAllowFailure([
    "--observations-json",
    JSON.stringify([{ signalId: "audit_thread_liveness", status: "failed", errorCode: "audit_thread_not_found" }]),
    "--create-audit-cards",
    "--audit-scope",
    "all",
    "--json",
  ]);
  assert.equal(result.execute, false);
  assert.equal(result.auditRequests.cardCount, 2);
  assert.deepEqual(result.dispatchResults, []);
  assert.equal(result.evaluation.diagnosticEvents[0].error_code, "audit_thread_not_found");
}

function testDiagnosticIssuesNonfatalKeepsZeroExit() {
  const result = spawnSync(process.execPath, [
    "scripts/homeai-self-improving-loop.js",
    "--observations-json",
    JSON.stringify([{ signalId: "audit_thread_liveness", status: "failed", errorCode: "audit_thread_not_found" }]),
    "--diagnostic-issues-nonfatal",
    "--json",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.evaluation.issueCount, 1);
  assert.equal(payload.evaluation.diagnosticEvents[0].error_code, "audit_thread_not_found");
}

function testMarkdownOutput() {
  const output = execFileSync(process.execPath, ["scripts/homeai-self-improving-loop.js", "--matrix", "--markdown"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.match(output, /Home AI Self-Improving Loop/);
  assert.match(output, /gateway_profile_health/);
}

function testCoverageAuditCli() {
  const result = runJson(["--coverage-audit", "--json"]);
  assert.equal(result.ok, true);
  assert.equal(result.status, "covered");
  assert.equal(result.requirements.some((item) => item.id === "plugin_deploy_auth_or_lane_regression"), true);
  assert.equal(result.requirements.some((item) => item.id === "public_upgrade_rehearsal_regression"), true);
  assert.equal(
    result.requirements.find((item) => item.id === "plugin_deploy_auth_or_lane_regression").missingClosureReadbacks.length,
    0,
  );
}

function testRuntimeSloModelCli() {
  const result = runJson(["--runtime-slo-model", "--json"]);
  assert.equal(result.ok, true);
  assert.equal(result.modelVersion, "20260701-runtime-slo-v4");
  assert.equal(result.dimensions.some((item) => item.id === "availability"), true);
  assert.equal(result.dimensions.some((item) => item.id === "accuracy"), true);
  assert.equal(result.dimensions.some((item) => item.id === "autonomy"), true);
  assert.equal(result.slos.some((item) => item.signalId === "plugin_action_metadata_health"), true);
}

function testRuntimeSloAuditCli() {
  const result = runJson(["--runtime-slo-audit", "--json"]);
  assert.equal(result.ok, true);
  assert.equal(result.status, "covered");
  assert.equal(result.issueCount, 0);
  assert.equal(result.unmappedSignalCount, 0);
  assert.equal(result.model.policy.noSilentFallback, true);
}

function publicUpgradeRehearsalPayload() {
  return {
    ok: true,
    tempRemoved: true,
    stepCount: 10,
    steps: [
      { type: "public-source-preflight", result: { ok: true }, summary: { ok: true, requiredPluginCount: 10 } },
      {
        type: "upgrade-plan-missing-sources-fail-closed",
        result: { ok: false, status: 1 },
        summary: { ok: false, issueCount: 0, missingSourceBlockerCount: 10, pluginCount: 10 },
      },
      {
        type: "validate-missing-source-fail-closed",
        ok: true,
        detail: { ok: true, missingSourceBlockerCount: 10, pluginCount: 10, hasMovieOperatorAuthBlocker: true },
      },
      {
        type: "upgrade-plan-with-operator-clone-gate",
        result: { ok: true, status: 0 },
        summary: {
          ok: true,
          cloneActionCount: 10,
          deployActionCount: 10,
          pluginCount: 10,
          movieOperatorAuthenticated: true,
          closureValidationPresent: true,
        },
      },
      {
        type: "validate-operator-clone-gate-plan",
        ok: true,
        detail: {
          ok: true,
          cloneActionCount: 10,
          deployActionCount: 10,
          pluginCount: 10,
          movieOperatorAuthenticated: true,
          closureValidationPresent: true,
        },
      },
      {
        type: "validate-hermes-runtime-repair-required",
        ok: true,
        detail: { ok: true, runtimeRepairBlockerPresent: true, runtimeRepairActionPresent: true },
      },
      {
        type: "validate-hermes-runtime-repair-gate-plan",
        ok: true,
        detail: { ok: true, runtimeRepairActionPresent: true, closureValidationPresent: true },
      },
      {
        type: "validate-non-git-source-adoption-required",
        ok: true,
        detail: { ok: true, sourceDirectoryNotGitBlockerCount: 2, hasHomeAiBlocker: true },
      },
      {
        type: "validate-source-adoption-gate-plan",
        ok: true,
        detail: { ok: true, adoptActionCount: 2, deployActionCount: 10, pluginCount: 10, closureValidationPresent: true },
      },
    ],
  };
}

function installUpgradeCanaryPayload(overrides = {}) {
  return Object.assign({
    ok: true,
    mode: "execute",
    phaseCount: 9,
    passedPhaseCount: 9,
    failedPhaseCount: 0,
    categories: {
      fresh_install: { ok: true, passed: 5, failed: 0 },
      public_upgrade: { ok: true, passed: 2, failed: 0 },
      plugin_provisioning: { ok: true, passed: 1, failed: 0 },
      self_improving_loop: { ok: true, passed: 1, failed: 0 },
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
      requiredForCompletion: true,
      status: "passed",
      executionClass: "lane_only_clean_target",
      lane: "Home AI Deploy Lane Test",
      evidenceVersion: "20260702-clean-target-readback-v1",
      phaseCount: 2,
      phases: [
        {
          id: "fresh_install_clean_target",
          status: "passed",
          tempRootRemoved: true,
          productionReadback: false,
        },
        {
          id: "public_upgrade_clean_target",
          status: "passed",
          tempRootRemoved: true,
          productionReadback: false,
        },
      ],
      issueCodes: [],
      noCompletionClaim: false,
    },
  }, overrides);
}

function installUpgradeCanaryServiceUserBoundaryPayload() {
  return installUpgradeCanaryPayload({
    ok: false,
    passedPhaseCount: 8,
    failedPhaseCount: 1,
    categories: {
      fresh_install: { ok: false, passed: 4, failed: 1 },
      public_upgrade: { ok: true, passed: 2, failed: 0 },
      plugin_provisioning: { ok: true, passed: 1, failed: 0 },
      self_improving_loop: { ok: true, passed: 1, failed: 0 },
    },
    issues: [
      { code: "canary_phase_command_failed", phaseId: "macos_fresh_install_rehearsal" },
      {
        code: "canary_phase_report_not_ok",
        phaseId: "macos_fresh_install_rehearsal",
        error: "production_rehearsal_requires_service_user",
      },
    ],
  });
}

function runtimeSloAuditPayload(overrides = {}) {
  return Object.assign({
    ok: true,
    modelVersion: "20260701-runtime-slo-v4",
    matrixVersion: "20260701-self-improving-loop-v13",
    status: "covered",
    dimensionCount: 3,
    signalCount: 21,
    sloCount: 21,
    issueCount: 0,
    unmappedSignalCount: 0,
    duplicateSignalCount: 0,
    issues: [],
  }, overrides);
}

function pluginActionMetadataClosurePayload(overrides = {}) {
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
        failedStages: [],
      },
      {
        familyId: "plugin_conversation_repair_request",
        pluginId: "home-ai",
        actionKind: "pluginConversationRepairRequest",
        actionClass: "owner_task_card_action",
        failedStageCount: 0,
        failedStages: [],
      },
      {
        familyId: "finance_manifest_route_action",
        pluginId: "finance",
        actionKind: "manifestPluginRouteAction",
        actionClass: "manifest_route_action",
        failedStageCount: 0,
        failedStages: [],
      },
    ],
  }, overrides);
}

function mcpSchemaClosurePayload(overrides = {}) {
  return Object.assign({
    ok: true,
    toolset: "wardrobe",
    epoch: "20260629-wardrobe-wear-intent-v970",
    source: {
      ok: true,
      gatewayTools: ["mcp_wardrobe_wardrobe_execute_outfit_wear_intent"],
    },
    service: { ok: true, skipped: true, reason: "service_schema_url_not_provided" },
    gateway: { ok: true, skipped: true, reason: "gateway_manifest_profile_not_provided_default_source_check" },
    schemaPropertyMatches: [],
  }, overrides);
}

function threadLivenessPayload(overrides = {}) {
  return Object.assign({
    ok: true,
    deployLaneCount: 6,
    assignedRouteCount: 6,
    auditThreadCount: 2,
    platformAuditVisible: true,
    pluginAuditVisible: true,
    sourceThreadVisible: true,
    targetThreadVisible: true,
    checkedRouteCount: 8,
    dryRunOnly: true,
  }, overrides);
}

function pluginManifestHealthPayload(overrides = {}) {
  return Object.assign({
    ok: true,
    listOk: true,
    pluginCount: 10,
    availableCount: 10,
    failedCount: 0,
    actionCount: 6,
    maxElapsedMs: 180,
  }, overrides);
}

function notificationDeliveryPayload(overrides = {}) {
  return Object.assign({
    ok: true,
    stateSource: "sqlite",
    vapid: { configured: true },
    subscriptions: { active: 1, matchingOrigin: 1 },
    deliveries: { attempted: 1, sent: 1, failed: 0, recentSuccess: 1 },
    issues: [],
  }, overrides);
}

function nativeBridgeCapabilityPayload(overrides = {}) {
  return Object.assign({
    ok: false,
    skipped: true,
    reason: "native_bridge_runtime_not_attached",
  }, overrides);
}

async function testThreadLivenessUsesImplementationCwdCandidate() {
  const originalSourceAppRoot = process.env.HERMES_MOBILE_SOURCE_APP_ROOT;
  process.env.HERMES_MOBILE_SOURCE_APP_ROOT = "/Users/example/path";
  const calls = [];
  const service = {
    async listThreads(input) {
      calls.push(input.cwd);
      if (input.cwd.endsWith("/prod-app")) return [];
      return [
        { title: "Home AI Deploy", status: "running" },
        { title: "Home AI Platform Audit", status: "running" },
        { title: "Plugin Workspace Audit", status: "running" },
      ];
    },
    async findSourceThread() {
      return null;
    },
  };
  try {
    const result = await collectThreadLiveness({
      threadCwd: "/tmp/prod-app",
      threadTaskCardService: service,
    });
    assert.equal(result.ok, true);
    assert.equal(result.deployLaneCount, 1);
    assert.equal(result.auditThreadCount, 2);
    assert.equal(result.targetThreadVisible, true);
    assert.equal(result.sourceThreadVisible, false);
    assert.equal(result.sourceThreadRequired, false);
    assert.ok(calls.some((cwd) => cwd.endsWith("/prod-app")));
    assert.ok(calls.some((cwd) => cwd === "/Users/example/path"));
    assert.deepEqual(threadLivenessCwdCandidates({ threadCwd: "/tmp/prod-app" }).slice(0, 2), [
      "/tmp/prod-app",
      "/Users/example/path",
    ]);
  } finally {
    if (originalSourceAppRoot == null) delete process.env.HERMES_MOBILE_SOURCE_APP_ROOT;
    else process.env.HERMES_MOBILE_SOURCE_APP_ROOT = originalSourceAppRoot;
  }
}

function systemResourceStatusPayload(overrides = {}) {
  return Object.assign({
    ok: true,
    schemaVersion: 1,
    status: "ok",
    overallStatus: "ok",
    cpu: { status: "ok", overallPercent: 21, sustainedPercent: 17, coreCount: 10 },
    memory: { status: "ok", percentUsed: 47, swap: { available: true, percentUsed: 0 } },
    disk: { status: "ok", maxPercentUsed: 56, availableBytes: 120 * 1024 ** 3, filesystems: [{ label: "app", status: "ok" }] },
    launchd: { status: "ok", services: [{ label: "com.hermesmobile.listener", status: "running" }] },
    signals: [
      { signalId: "system_cpu_load", category: "host_cpu", status: "ok" },
      { signalId: "system_memory_usage", category: "host_memory", status: "ok" },
      { signalId: "system_disk_usage", category: "host_disk", status: "ok" },
      { signalId: "system_launchd_services", category: "service", status: "ok" },
    ],
  }, overrides);
}

function testCollectProductionObservationsFromReplayPayloads() {
  const result = runJson([
    "--collect-production-observations",
    "--system-resource-status-json",
    JSON.stringify(systemResourceStatusPayload()),
    "--status-smoke-json",
    JSON.stringify({
      ok: true,
      activeGlobal: 0,
      gatewayPool: { enabled: true, mode: "hybrid", workerCount: 39 },
      gatewayWorkerPolicyContract: { ok: true },
      wrongHeaderDenied: true,
      originIdentity: { title: "Home AI" },
    }),
    "--cron-audit-json",
    JSON.stringify({
      ok: true,
      jobCount: 8,
      skillCount: 10,
      sourceIssueCount: 0,
      configIssueCount: 0,
      statusIssueCount: 0,
    }),
    "--production-diagnostics-json",
    JSON.stringify({ ok: true, diagnosticCount: 27, diagnostics: [], issues: [] }),
    "--public-upgrade-rehearsal-json",
    JSON.stringify(publicUpgradeRehearsalPayload()),
    "--install-upgrade-canary-json",
    JSON.stringify(installUpgradeCanaryPayload()),
    "--runtime-slo-audit-json",
    JSON.stringify(runtimeSloAuditPayload()),
    "--plugin-action-metadata-closure-json",
    JSON.stringify(pluginActionMetadataClosurePayload()),
    "--mcp-schema-closure-json",
    JSON.stringify(mcpSchemaClosurePayload()),
    "--thread-liveness-json",
    JSON.stringify(threadLivenessPayload()),
    "--plugin-manifest-health-json",
    JSON.stringify(pluginManifestHealthPayload()),
    "--notification-delivery-json",
    JSON.stringify(notificationDeliveryPayload()),
    "--native-bridge-capability-json",
    JSON.stringify(nativeBridgeCapabilityPayload()),
    "--json",
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.productionCollection.enabled, true);
  assert.equal(result.productionCollection.observationCount, 21);
  assert.equal(result.productionCollection.reportedSignalCount, 21);
  assert.equal(result.productionCollection.observedSignalCount, 21);
  assert.equal(result.productionCollection.notCollectedSignalCount, 0);
  assert.equal(result.productionCollection.failedSignalCount, 0);
  assert.equal(result.productionCollection.signalReport.reportedSignalCount, 21);
  assert.equal(result.qualityProgramEvidence.status, "ok");
  assert.equal(result.qualityProgramEvidence.extraEvidence.installUpgradeCanaryObservedStatus, "ok");
  assert.equal(result.qualityProgramEvidence.extraEvidence.cleanInstallCanaryStatus, "ok");
  assert.equal(result.qualityProgramEvidence.extraEvidence.cleanTargetCanary.freshInstallTempRemoved, true);
  assert.equal(result.qualityProgramEvidence.extraEvidence.cleanTargetCanary.publicUpgradePlanTempRootOnly, true);
  assert.equal(result.qualityProgramEvidence.extraEvidence.wardrobeReferenceActionStatus, "ok");
  assert.equal(result.qualityProgramEvidence.extraEvidence.deterministicActionGeneralizationStatus, "ok");
  assert.equal(result.qualityEvidenceOutputWritten, false);
  for (const signalId of [
    "mcp_schema_closure",
    "deploy_lane_liveness",
    "task_card_dispatch",
    "plugin_proxy_latency",
    "composer_runtime_feedback",
    "media_preview_health",
    "gateway_document_tool_capability",
    "plugin_deploy_contract_closure",
    "plugin_proxy_workspace_boundary",
    "native_bridge_capability",
    "notification_delivery",
    "plugin_manifest_health",
    "audit_thread_liveness",
  ]) {
    assert.notEqual(
      result.productionCollection.signalReport.rows.find((item) => item.signalId === signalId).status,
      "not_collected",
      signalId,
    );
  }
  assert.equal(result.diagnosticSubmitClosure.enabled, false);
  assert.equal(result.diagnosticSubmitClosure.eventCount, 0);
  assert.equal(result.diagnosticSubmitClosure.ok, true);
  assert.equal(result.productionCollection.signals.some((item) => item.signalId === "system_resource_health"), true);
  assert.equal(result.productionCollection.signals.some((item) => item.signalId === "automation_cron_health"), true);
  assert.equal(result.productionCollection.signals.some((item) => item.signalId === "public_upgrade_rehearsal"), true);
  assert.equal(result.productionCollection.signals.some((item) => item.signalId === "install_upgrade_canary"), true);
  assert.equal(result.productionCollection.signals.some((item) => item.signalId === "runtime_slo_coverage"), true);
  assert.equal(result.productionCollection.signals.some((item) => item.signalId === "plugin_action_metadata_health"), true);
  assert.equal(result.productionCollection.signals.some((item) => item.signalId === "mcp_schema_closure"), true);
  assert.equal(result.productionCollection.signals.some((item) => item.signalId === "gateway_document_tool_capability"), true);
  assert.equal(result.productionCollection.signals.some((item) => item.signalId === "plugin_deploy_contract_closure"), true);
  assert.equal(result.productionCollection.signals.some((item) => item.signalId === "plugin_proxy_workspace_boundary"), true);
  assert.equal(result.productionCollection.signals.some((item) => item.signalId === "plugin_manifest_health"), true);
  assert.equal(result.productionCollection.signals.some((item) => item.signalId === "notification_delivery"), true);
}

function testQualityEvidenceOutputFileIsBounded() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-quality-evidence-"));
  const outputFile = path.join(tempDir, "quality-evidence.json");
  const result = runJson([
    "--collect-production-observations",
    "--skip-status-smoke",
    "--skip-system-resource-status",
    "--skip-cron-audit",
    "--skip-production-diagnostics",
    "--skip-public-upgrade-rehearsal",
    "--skip-runtime-slo-audit",
    "--skip-mcp-schema-closure",
    "--skip-thread-liveness",
    "--skip-plugin-manifest-health",
    "--skip-notification-delivery",
    "--skip-native-bridge-capability",
    "--install-upgrade-canary-json",
    JSON.stringify(installUpgradeCanaryPayload()),
    "--plugin-action-metadata-closure-json",
    JSON.stringify(pluginActionMetadataClosurePayload()),
    "--quality-evidence-output",
    outputFile,
    "--json",
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.qualityEvidenceOutputWritten, true);
  const saved = JSON.parse(fs.readFileSync(outputFile, "utf8"));
  assert.equal(saved.evidenceVersion, "20260701-owner-3a-quality-evidence-v2");
  assert.equal(saved.status, "ok");
  assert.equal(saved.extraEvidence.installUpgradeCanaryObservedStatus, "ok");
  assert.equal(saved.extraEvidence.cleanInstallCanaryStatus, "ok");
  assert.equal(saved.extraEvidence.cleanTargetCanary.productionWrites, false);
  assert.equal(saved.extraEvidence.wardrobeReferenceActionStatus, "ok");
  assert.equal(saved.extraEvidence.deterministicActionGeneralizationStatus, "ok");
  assert.equal(JSON.stringify(saved).includes(tempDir), false);
}

function testPlanOnlyInstallUpgradeCanaryStaysPartialAndNonDiagnostic() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-quality-evidence-plan-"));
  const outputFile = path.join(tempDir, "quality-evidence.json");
  const result = runJson([
    "--collect-production-observations",
    "--skip-status-smoke",
    "--skip-system-resource-status",
    "--skip-cron-audit",
    "--skip-production-diagnostics",
    "--skip-public-upgrade-rehearsal",
    "--skip-runtime-slo-audit",
    "--skip-mcp-schema-closure",
    "--skip-thread-liveness",
    "--skip-plugin-manifest-health",
    "--skip-notification-delivery",
    "--skip-native-bridge-capability",
    "--install-upgrade-canary-json",
    JSON.stringify(installUpgradeCanaryPayload({
      mode: "plan",
      steps: [],
      cleanTargetCanary: undefined,
    })),
    "--plugin-action-metadata-closure-json",
    JSON.stringify(pluginActionMetadataClosurePayload()),
    "--quality-evidence-output",
    outputFile,
    "--json",
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.evaluation.issueCount, 0);
  assert.equal(
    result.evaluation.diagnosticEvents.some((event) => event.category === "self_check_install_upgrade"),
    false,
  );
  const canarySignal = result.productionCollection.signals.find((item) => item.signalId === "install_upgrade_canary");
  assert.equal(canarySignal?.status, "skipped");
  assert.equal(canarySignal?.errorCode, "install_upgrade_canary_plan_only");
  assert.equal(canarySignal?.diagnosticEligible, false);
  assert.equal(result.qualityProgramEvidence.status, "partial");
  assert.equal(result.qualityProgramEvidence.policy.noCompletionClaim, true);
  assert.equal(result.qualityProgramEvidence.extraEvidence.installUpgradeCanaryObservedStatus, "partial");
  assert.equal(result.qualityProgramEvidence.extraEvidence.installUpgradeCanary.mode, "plan");
  assert.equal(result.qualityProgramEvidence.extraEvidence.cleanInstallCanaryStatus, undefined);
  const saved = JSON.parse(fs.readFileSync(outputFile, "utf8"));
  assert.equal(saved.status, "partial");
  assert.equal(saved.policy.noCompletionClaim, true);
  assert.equal(saved.extraEvidence.installUpgradeCanaryObservedStatus, "partial");
  assert.equal(saved.extraEvidence.installUpgradeCanary.mode, "plan");
  assert.equal(saved.extraEvidence.cleanInstallCanaryStatus, undefined);
}

function testCollectProductionDiagnosticsFailureProducesReport() {
  const result = runJsonAllowFailure([
    "--collect-production-observations",
    "--skip-status-smoke",
    "--skip-system-resource-status",
    "--skip-cron-audit",
    "--skip-public-upgrade-rehearsal",
    "--skip-install-upgrade-canary",
    "--skip-runtime-slo-audit",
    "--skip-plugin-action-metadata-closure",
    "--skip-mcp-schema-closure",
    "--skip-thread-liveness",
    "--skip-plugin-manifest-health",
    "--skip-notification-delivery",
    "--skip-native-bridge-capability",
    "--production-diagnostics-json",
    JSON.stringify({
      ok: false,
      error: "diagnostic_doc_reference_missing",
      diagnosticCount: 27,
      issues: [{ code: "diagnostic_doc_reference_missing" }],
    }),
    "--json",
  ]);
  assert.ok(result.productionCollection.observationCount >= 1);
  assert.equal(result.productionCollection.signals.some((item) => item.signalId === "production_self_diagnostics"), true);
  assert.equal(result.evaluation.issueCount, 1);
  assert.equal(result.evaluation.diagnosticEvents[0].error_code, "diagnostic_doc_reference_missing");
}

function testCollectRuntimeHealthReplayPayloads() {
  const result = runJsonAllowFailure([
    "--collect-production-observations",
    "--skip-status-smoke",
    "--skip-system-resource-status",
    "--skip-cron-audit",
    "--skip-production-diagnostics",
    "--skip-public-upgrade-rehearsal",
    "--skip-install-upgrade-canary",
    "--skip-runtime-slo-audit",
    "--skip-plugin-action-metadata-closure",
    "--skip-mcp-schema-closure",
    "--skip-thread-liveness",
    "--skip-plugin-manifest-health",
    "--skip-notification-delivery",
    "--skip-native-bridge-capability",
    "--plugin-proxy-latency-json",
    JSON.stringify({
      pluginId: "codex-mobile-web",
      routeKind: "thread-detail",
      samples: [{ clientElapsedMs: 6100, upstreamMs: 100 }],
    }),
    "--gateway-capability-availability-json",
    JSON.stringify({
      workspaceId: "liyushuang",
      profile: "low_gateway",
      requiredTools: ["pdf_create", "pptx_create"],
      missingTools: ["pptx_create"],
    }),
    "--ui-runtime-health-json",
    JSON.stringify({
      pluginId: "codex-mobile-web",
      composer: { terminalReceiptMissingCount: 1 },
      mediaPreview: { mediaKind: "generated_png", imagePreviewFailedCount: 1, sourceKind: "protected_api_route" },
      nativeBridge: { platform: "android", appVersion: "0.4.28", capability: "outboundShare", nativeBridgeUnavailableCount: 1 },
      pluginActions: { pluginId: "wardrobe", actionKind: "wardrobeOutfitWearIntent", pluginActionMetadataMissingCount: 1 },
    }),
    "--json",
  ]);
  assert.equal(result.productionCollection.observationCount, 10);
  assert.equal(result.productionCollection.reportedSignalCount, 21);
  assert.equal(result.productionCollection.observedSignalCount, 10);
  assert.equal(result.productionCollection.notCollectedSignalCount, 11);
  assert.equal(result.productionCollection.failedSignalCount, 6);
  assert.equal(result.productionCollection.signalReport.rows.some((item) => (
    item.signalId === "plugin_manifest_health" && item.status === "not_collected"
  )), true);
  const canaryRow = result.productionCollection.signalReport.rows.find((item) => item.signalId === "install_upgrade_canary");
  assert.equal(canaryRow.status, "skipped");
  assert.deepEqual(canaryRow.errorCodes, ["install_upgrade_canary_skipped_by_option"]);
  assert.equal(result.evaluation.issueCount, 6);
  assert.equal(result.productionCollection.signals.some((item) => item.signalId === "plugin_proxy_latency"), true);
  assert.equal(result.productionCollection.signals.some((item) => item.signalId === "gateway_document_tool_capability"), true);
  assert.equal(result.productionCollection.signals.some((item) => item.signalId === "plugin_action_metadata_health"), true);
  assert.equal(result.evaluation.diagnosticEvents.some((event) => event.error_code === "plugin_proxy_latency_gap_detected"), true);
  assert.equal(result.evaluation.diagnosticEvents.some((event) => event.error_code === "plugin_action_metadata_missing"), true);
}

function testSkipInstallUpgradeCanaryProducesSkippedObservation() {
  const result = runJsonAllowFailure([
    "--collect-production-observations",
    "--collector-context", "production",
    "--skip-status-smoke",
    "--skip-system-resource-status",
    "--skip-cron-audit",
    "--skip-production-diagnostics",
    "--skip-public-upgrade-rehearsal",
    "--skip-install-upgrade-canary",
    "--skip-plugin-action-metadata-closure",
    "--skip-mcp-schema-closure",
    "--skip-thread-liveness",
    "--skip-plugin-manifest-health",
    "--skip-notification-delivery",
    "--skip-native-bridge-capability",
    "--json",
  ]);
  const canarySignal = result.productionCollection.signals.find((item) => item.signalId === "install_upgrade_canary");
  assert.equal(canarySignal?.status, "skipped");
  assert.equal(canarySignal?.errorCode, "install_upgrade_canary_skipped_by_option");
  assert.equal(canarySignal?.diagnosticEligible, false);
  const canaryRow = result.productionCollection.signalReport.rows.find((item) => item.signalId === "install_upgrade_canary");
  assert.equal(canaryRow.status, "skipped");
  assert.equal(canaryRow.observed, true);
  assert.equal(result.evaluation.diagnosticEvents.some((event) => event.category === "self_check_install_upgrade"), false);
}

function testCollectRuntimeSloAuditFailureProducesReport() {
  const result = runJsonAllowFailure([
    "--collect-production-observations",
    "--skip-status-smoke",
    "--skip-system-resource-status",
    "--skip-cron-audit",
    "--skip-production-diagnostics",
    "--skip-public-upgrade-rehearsal",
    "--skip-install-upgrade-canary",
    "--skip-plugin-action-metadata-closure",
    "--skip-mcp-schema-closure",
    "--skip-thread-liveness",
    "--skip-plugin-manifest-health",
    "--skip-notification-delivery",
    "--skip-native-bridge-capability",
    "--runtime-slo-audit-json",
    JSON.stringify(runtimeSloAuditPayload({
      ok: false,
      status: "coverage_gap",
      issueCount: 1,
      unmappedSignalCount: 1,
    })),
    "--json",
  ]);
  assert.ok(result.productionCollection.observationCount >= 1);
  assert.equal(result.productionCollection.signals.some((item) => item.signalId === "runtime_slo_coverage"), true);
  assert.equal(result.productionCollection.signalReport.reportedSignalCount, 21);
  assert.equal(result.productionCollection.signalReport.failedSignalCount, 1);
  assert.equal(result.productionCollection.signalReport.rows.find((item) => item.signalId === "runtime_slo_coverage").status, "failed");
  assert.equal(result.evaluation.issueCount, 1);
  assert.equal(result.evaluation.diagnosticEvents[0].category, "self_check_runtime_slo");
  assert.equal(result.evaluation.diagnosticEvents[0].error_code, "runtime_slo_audit_failed");
}

function testCollectorsResolveFromScriptRootWhenCwdDiffers() {
  const result = runJsonFromCwd([
    "--collect-production-observations",
    "--skip-status-smoke",
    "--skip-system-resource-status",
    "--skip-cron-audit",
    "--skip-production-diagnostics",
    "--skip-public-upgrade-rehearsal",
    "--skip-install-upgrade-canary",
    "--skip-plugin-action-metadata-closure",
    "--skip-mcp-schema-closure",
    "--skip-thread-liveness",
    "--skip-plugin-manifest-health",
    "--skip-notification-delivery",
    "--skip-native-bridge-capability",
    "--json",
  ], os.tmpdir());
  assert.equal(result.ok, true);
  assert.ok(result.productionCollection.observationCount >= 1);
  const runtimeSlo = result.productionCollection.signals.find((item) => item.signalId === "runtime_slo_coverage");
  assert.equal(runtimeSlo?.status, "ok");
}

function testGatewaySchemaCollectorUsesMacRuntimeFromRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-gateway-schema-root-"));
  try {
    const profileDir = path.join(root, "data", "hermes-home", "profiles", "lowgw1");
    const configPath = path.join(profileDir, "config.yaml");
    const pluginNames = [
      "hermes-mobile-docx",
      "hermes-mobile-pptx",
      "hermes-mobile-pdf",
      "hermes-mobile-audio",
      "hermes-mobile-archive",
    ];
    const requiredTools = [
      "docx_create",
      "docx_extract_text",
      "office_extract_text",
      "pptx_create",
      "pptx_validate",
      "pdf_create",
      "pdf_extract_text",
      "pdf_render_pages",
      "audio_transcribe",
      "archive_list",
      "archive_extract_safe",
    ];
    fs.mkdirSync(path.join(root, "data"), { recursive: true });
    fs.mkdirSync(path.join(root, "runtime", "hermes-agent-official", "venv", "bin"), { recursive: true });
    fs.mkdirSync(path.join(root, "runtime", "hermes-agent-official", "source"), { recursive: true });
    fs.mkdirSync(path.join(root, "app", "gateway-runtime-overrides"), { recursive: true });
    fs.mkdirSync(path.join(profileDir, "plugins"), { recursive: true });
    fs.writeFileSync(configPath, `plugins:\n  enabled:\n${pluginNames.map((name) => `    - ${name}`).join("\n")}\n`, "utf8");
    for (const pluginName of pluginNames) {
      const pluginDir = path.join(profileDir, "plugins", pluginName);
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(path.join(pluginDir, "__init__.py"), "def register(context):\n    return None\n", "utf8");
    }
    fs.writeFileSync(path.join(root, "data", "gateway-pool-manifest-mac.json"), JSON.stringify({
      workers: [{
        profile: "lowgw1",
        telemetryProfile: "lowgw1",
        securityLevel: "user",
        enabled: true,
        port: 1,
        configPath,
      }],
    }), "utf8");
    const fakePython = path.join(root, "runtime", "hermes-agent-official", "venv", "bin", "python");
    fs.writeFileSync(fakePython, `#!/bin/sh\ncat <<'JSON'\n${JSON.stringify({
      loaded_plugins: pluginNames,
      tools: requiredTools.map((name) => ({ name })),
    })}\nJSON\n`, "utf8");
    fs.chmodSync(fakePython, 0o755);

    const result = runJson([
      "--collect-production-observations",
      "--root", root,
      "--skip-status-smoke",
      "--skip-system-resource-status",
      "--skip-cron-audit",
      "--skip-production-diagnostics",
      "--skip-public-upgrade-rehearsal",
      "--skip-install-upgrade-canary",
      "--skip-runtime-slo-audit",
      "--skip-plugin-action-metadata-closure",
      "--skip-mcp-schema-closure",
      "--skip-thread-liveness",
      "--skip-plugin-manifest-health",
      "--skip-notification-delivery",
      "--skip-native-bridge-capability",
      "--json",
    ]);
    const gatewaySignal = result.productionCollection.signals.find((item) => item.signalId === "gateway_document_tool_capability");
    assert.equal(gatewaySignal?.status, "ok");
    assert.equal(gatewaySignal?.errorCode, "");
    assert.equal(gatewaySignal?.metadata.requiredToolCount, requiredTools.length);
    assert.equal(result.evaluation.diagnosticEvents.some((event) => event.category === "self_check_gateway_tooling"), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function cronPermissionBlockedPayload() {
  return {
    ok: false,
    jobCount: 0,
    skillCount: 0,
    sourceIssueCount: 3,
    sourceIssues: [
      { code: "cron_jobs_store_unreadable", path: "/private/cron/jobs.json", detail: "EACCES" },
      { code: "cron_skill_store_unreadable", path: "/private/cron/skills", detail: "EACCES" },
      { code: "cron_runtime_script_installed_unreadable", script: "homeai-disaster-backup-cron.sh", detail: "EACCES" },
    ],
    configIssueCount: 0,
    statusIssueCount: 0,
  };
}

function testSourceCollectorPermissionBlockIsSkipped() {
  const result = runJson([
    "--collect-production-observations",
    "--skip-status-smoke",
    "--skip-system-resource-status",
    "--cron-audit-json",
    JSON.stringify(cronPermissionBlockedPayload()),
    "--skip-production-diagnostics",
    "--skip-public-upgrade-rehearsal",
    "--skip-install-upgrade-canary",
    "--skip-runtime-slo-audit",
    "--skip-plugin-action-metadata-closure",
    "--skip-mcp-schema-closure",
    "--skip-thread-liveness",
    "--skip-plugin-manifest-health",
    "--skip-notification-delivery",
    "--skip-native-bridge-capability",
    "--collector-context",
    "source",
    "--json",
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.productionCollection.collectorContext, "source");
  assert.ok(result.productionCollection.skippedObservationCount >= 1);
  assert.equal(result.productionCollection.signalReport.reportedSignalCount, 21);
  assert.ok(result.productionCollection.signalReport.skippedSignalCount >= 1);
  const cronSignal = result.productionCollection.signals.find((item) => item.signalId === "automation_cron_health");
  assert.equal(cronSignal?.status, "skipped");
  assert.equal(cronSignal?.errorCode, "automation_cron_audit_permission_blocked");
  assert.equal(cronSignal?.diagnosticEligible, false);
  assert.equal(result.evaluation.issueCount, 0);
  assert.ok(result.evaluation.skippedObservationCount >= 1);
}

function testProductionCollectorPermissionBlockIsDiagnostic() {
  const result = runJsonAllowFailure([
    "--collect-production-observations",
    "--skip-status-smoke",
    "--skip-system-resource-status",
    "--cron-audit-json",
    JSON.stringify(cronPermissionBlockedPayload()),
    "--skip-production-diagnostics",
    "--skip-public-upgrade-rehearsal",
    "--skip-install-upgrade-canary",
    "--skip-runtime-slo-audit",
    "--skip-plugin-action-metadata-closure",
    "--skip-mcp-schema-closure",
    "--skip-thread-liveness",
    "--skip-plugin-manifest-health",
    "--skip-notification-delivery",
    "--skip-native-bridge-capability",
    "--collector-context",
    "production",
    "--json",
  ]);
  assert.equal(result.productionCollection.collectorContext, "production");
  assert.equal(result.productionCollection.signalReport.reportedSignalCount, 21);
  assert.ok(result.productionCollection.signalReport.failedSignalCount >= 1);
  const cronSignal = result.productionCollection.signals.find((item) => item.signalId === "automation_cron_health");
  assert.equal(cronSignal?.status, "failed");
  assert.equal(cronSignal?.diagnosticEligible, true);
  assert.ok(result.evaluation.issueCount >= 1);
  assert.equal(result.evaluation.diagnosticEvents.some((event) => event.error_code === "automation_cron_audit_permission_blocked"), true);
}

function testSourceCollectorInstallCanaryServiceUserBoundaryIsSkipped() {
  const result = runJson([
    "--collect-production-observations",
    "--skip-status-smoke",
    "--skip-system-resource-status",
    "--skip-cron-audit",
    "--skip-production-diagnostics",
    "--skip-public-upgrade-rehearsal",
    "--install-upgrade-canary-json",
    JSON.stringify(installUpgradeCanaryServiceUserBoundaryPayload()),
    "--skip-runtime-slo-audit",
    "--skip-plugin-action-metadata-closure",
    "--skip-mcp-schema-closure",
    "--skip-thread-liveness",
    "--skip-plugin-manifest-health",
    "--skip-notification-delivery",
    "--skip-native-bridge-capability",
    "--collector-context",
    "source",
    "--json",
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.productionCollection.collectorContext, "source");
  const canarySignal = result.productionCollection.signals.find((item) => item.signalId === "install_upgrade_canary");
  assert.equal(canarySignal?.status, "skipped");
  assert.equal(canarySignal?.errorCode, "production_rehearsal_requires_service_user");
  assert.equal(canarySignal?.diagnosticEligible, false);
  assert.equal(result.evaluation.issueCount, 0);
  assert.equal(result.productionCollection.signalReport.skippedSignalCount >= 1, true);
}

function testProductionCollectorInstallCanaryServiceUserBoundaryIsDiagnostic() {
  const result = runJsonAllowFailure([
    "--collect-production-observations",
    "--skip-status-smoke",
    "--skip-system-resource-status",
    "--skip-cron-audit",
    "--skip-production-diagnostics",
    "--skip-public-upgrade-rehearsal",
    "--install-upgrade-canary-json",
    JSON.stringify(installUpgradeCanaryServiceUserBoundaryPayload()),
    "--skip-runtime-slo-audit",
    "--skip-plugin-action-metadata-closure",
    "--skip-mcp-schema-closure",
    "--skip-thread-liveness",
    "--skip-plugin-manifest-health",
    "--skip-notification-delivery",
    "--skip-native-bridge-capability",
    "--collector-context",
    "production",
    "--json",
  ]);
  assert.equal(result.productionCollection.collectorContext, "production");
  const canarySignal = result.productionCollection.signals.find((item) => item.signalId === "install_upgrade_canary");
  assert.equal(canarySignal?.status, "failed");
  assert.equal(canarySignal?.errorCode, "canary_phase_command_failed");
  assert.ok(result.evaluation.issueCount >= 1);
  assert.equal(
    result.evaluation.diagnosticEvents.some((event) => event.category === "self_check_install_upgrade"),
    true,
  );
}

function testCollectorPlainErrorCodeIsPreserved() {
  const result = runJsonAllowFailure([
    "--collect-production-observations",
    "--access-key-file",
    "/tmp/homeai-self-loop-missing-key",
    "--skip-system-resource-status",
    "--skip-cron-audit",
    "--skip-production-diagnostics",
    "--skip-public-upgrade-rehearsal",
    "--skip-install-upgrade-canary",
    "--skip-runtime-slo-audit",
    "--skip-plugin-action-metadata-closure",
    "--skip-mcp-schema-closure",
    "--skip-thread-liveness",
    "--skip-plugin-manifest-health",
    "--skip-notification-delivery",
    "--skip-native-bridge-capability",
    "--collector-context",
    "production",
    "--json",
  ]);
  assert.ok(result.productionCollection.observationCount >= 1);
  assert.equal(
    result.evaluation.diagnosticEvents.some((event) => event.error_code === "production_status_smoke_access_key_file_unreadable"),
    true,
  );
}

function testInvalidObservationJsonFailsBounded() {
  const result = spawnSync(process.execPath, [
    "scripts/homeai-self-improving-loop.js",
    "--observations-json",
    "{",
    "--json",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stderr);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, "observations_json_invalid");
}

testMatrixCli();
testDryRunAuditCardsDoNotDispatch();
testDiagnosticIssuesNonfatalKeepsZeroExit();
testMarkdownOutput();
testCoverageAuditCli();
testRuntimeSloModelCli();
testRuntimeSloAuditCli();
testCollectProductionObservationsFromReplayPayloads();
testQualityEvidenceOutputFileIsBounded();
testPlanOnlyInstallUpgradeCanaryStaysPartialAndNonDiagnostic();
testCollectProductionDiagnosticsFailureProducesReport();
testCollectRuntimeHealthReplayPayloads();
testSkipInstallUpgradeCanaryProducesSkippedObservation();
testCollectRuntimeSloAuditFailureProducesReport();
testCollectorsResolveFromScriptRootWhenCwdDiffers();
testGatewaySchemaCollectorUsesMacRuntimeFromRoot();
testSourceCollectorPermissionBlockIsSkipped();
testProductionCollectorPermissionBlockIsDiagnostic();
testSourceCollectorInstallCanaryServiceUserBoundaryIsSkipped();
testProductionCollectorInstallCanaryServiceUserBoundaryIsDiagnostic();
testCollectorPlainErrorCodeIsPreserved();
testInvalidObservationJsonFailsBounded();
testThreadLivenessUsesImplementationCwdCandidate()
  .then(() => {
    console.log("Home AI self-improving loop script tests passed");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
