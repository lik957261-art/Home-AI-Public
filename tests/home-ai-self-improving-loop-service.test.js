"use strict";

const assert = require("node:assert/strict");
const {
  DEFAULT_PLUGIN_AUDIT_THREAD_TITLE,
  DEFAULT_PLATFORM_AUDIT_THREAD_TITLE,
  SIGNAL_MATRIX_VERSION,
  buildAuditRequestCards,
  buildCoverageAudit,
  buildDiagnosticSubmitClosureReport,
  buildProductionObservations,
  buildProductionSignalReport,
  buildSelfImprovingLoopReport,
  buildSignalMatrix,
  cronAuditPermissionBlocked,
  evaluateObservations,
  observationFromAuditThreadDiscovery,
  observationFromCronAudit,
  observationFromDeployLaneDiscovery,
  observationFromInstallUpgradeCanary,
  observationFromMcpSchemaClosure,
  observationFromNativeBridgeCapability,
  observationFromNotificationDelivery,
  observationFromPluginDeployContractClosure,
  observationFromPluginActionMetadataClosure,
  observationFromPluginManifestHealth,
  observationFromPluginProxyLiveProbe,
  observationFromPluginProxyWorkspaceBoundary,
  observationFromPublicUpgradeRehearsal,
  observationFromProductionDiagnostics,
  observationFromRuntimeSloAudit,
  observationFromStatusSmoke,
  observationFromSystemResourceStatus,
  observationFromTaskCardDispatchState,
  observationsFromGatewayCapabilityAvailability,
  observationsFromPluginProxyLatency,
  observationsFromUiRuntimeHealth,
} = require("../adapters/home-ai-self-improving-loop-service");

function testSignalMatrixCoversHighFrequencyBoundaries() {
  const matrix = buildSignalMatrix({ nowIso: "2026-06-28T00:00:00.000Z" });
  const ids = new Set(matrix.signals.map((signal) => signal.id));
  assert.equal(matrix.ok, true);
  assert.equal(matrix.matrixVersion, SIGNAL_MATRIX_VERSION);
  assert.ok(ids.has("system_resource_health"));
  assert.ok(ids.has("gateway_profile_health"));
  assert.ok(ids.has("mcp_schema_closure"));
  assert.ok(ids.has("deploy_lane_liveness"));
  assert.ok(ids.has("task_card_dispatch"));
  assert.ok(ids.has("plugin_proxy_latency"));
  assert.ok(ids.has("composer_runtime_feedback"));
  assert.ok(ids.has("media_preview_health"));
  assert.ok(ids.has("gateway_document_tool_capability"));
  assert.ok(ids.has("plugin_deploy_contract_closure"));
  assert.ok(ids.has("plugin_proxy_workspace_boundary"));
  assert.ok(ids.has("native_bridge_capability"));
  assert.ok(ids.has("notification_delivery"));
  assert.ok(ids.has("plugin_manifest_health"));
  assert.ok(ids.has("plugin_action_metadata_health"));
  assert.ok(ids.has("audit_thread_liveness"));
  assert.ok(ids.has("automation_cron_health"));
  assert.ok(ids.has("production_self_diagnostics"));
  assert.ok(ids.has("public_upgrade_rehearsal"));
  assert.ok(ids.has("install_upgrade_canary"));
  assert.ok(ids.has("runtime_slo_coverage"));
  assert.ok(matrix.signals.every((signal) => signal.privacy === "metadata_only"));
  assert.ok(matrix.signals.every((signal) => signal.fallbackPolicy === "no_silent_fallback_no_restart_as_closure"));
  assert.ok(matrix.signals.every((signal) => Array.isArray(signal.closureReadbacks) && signal.closureReadbacks.length > 0));
}

function testObservationsProduceBoundedDiagnosticEvents() {
  const result = evaluateObservations({
    nowIso: "2026-06-28T00:00:00.000Z",
    observations: [{
      signalId: "plugin_proxy_latency",
      status: "failed",
      errorCode: "proxy_gap_2_10s",
      durationBucket: "2_10s",
      metadata: {
        pluginId: "codex-mobile",
        routeKind: "thread_detail",
        url: "https://private.example.invalid/thread?secret=raw",
        accessToken: "secret-token-value",
        body: "private thread body",
      },
    }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.issueCount, 1);
  assert.equal(result.diagnosticEvents.length, 1);
  const event = result.diagnosticEvents[0];
  assert.equal(event.plugin_id, "home-ai");
  assert.equal(event.source_surface, "home-ai-self-check");
  assert.equal(event.category, "self_check_plugin_proxy");
  assert.equal(event.severity_hint, "H2");
  assert.equal(event.error_code, "proxy_gap_2_10s");
  assert.deepEqual(event.context.closure_readbacks.slice(0, 2), ["host_proxy_timing_split", "upstream_timing_readback"]);
  assert.deepEqual(result.issues[0].closureReadbacks.slice(0, 2), ["host_proxy_timing_split", "upstream_timing_readback"]);
  const serialized = JSON.stringify(event);
  assert.equal(serialized.includes("secret-token-value"), false);
  assert.equal(serialized.includes("private.example.invalid"), false);
  assert.equal(serialized.includes("private thread body"), false);
  assert.match(serialized, /\[REDACTED\]/);
}

function testCoverageAuditCoversRecentIncidentClasses() {
  const audit = buildCoverageAudit({ nowIso: "2026-06-29T00:00:00.000Z" });
  assert.equal(audit.ok, true);
  assert.equal(audit.matrixVersion, SIGNAL_MATRIX_VERSION);
  assert.equal(audit.status, "covered");
  assert.equal(audit.requirementCount >= 7, true);
  const byId = new Map(audit.requirements.map((item) => [item.id, item]));
  assert.equal(byId.get("codex_proxy_latency_gap").status, "covered");
  assert.equal(byId.get("generated_media_preview_failure").status, "covered");
  assert.equal(byId.get("mcp_dispatcher_schema_missing").status, "covered");
  assert.equal(byId.get("gateway_document_tool_capability_gap").status, "covered");
  assert.equal(byId.get("plugin_workspace_propagation_regression").status, "covered");
  assert.equal(byId.get("public_upgrade_rehearsal_regression").status, "covered");
  assert.equal(byId.get("composer_runtime_feedback_regression").status, "covered");
  assert.equal(byId.get("plugin_action_metadata_regression").status, "covered");
  assert.equal(byId.get("runtime_slo_coverage_regression").status, "covered");
  assert.equal(byId.get("host_resource_pressure_regression").status, "covered");
  assert.equal(audit.policy.closureRequired, true);
  assert.equal(audit.policy.selfCheckAutomationMayAutoDispatch, true);
}

function testCoverageAuditFindsMissingSignalAndClosureReadback() {
  const audit = buildCoverageAudit({
    signals: [{
      id: "partial_signal",
      severity: "H2",
      evidence: ["pluginId"],
      closureReadbacks: ["only_one_readback"],
    }],
    requirements: [{
      id: "partial_requirement",
      severity: "H2",
      requiredSignals: ["partial_signal", "missing_signal"],
      requiredEvidence: ["pluginId", "routeKind"],
      requiredClosureReadbacks: ["only_one_readback", "missing_readback"],
    }],
  });
  assert.equal(audit.ok, false);
  assert.equal(audit.status, "coverage_gap");
  assert.equal(audit.missingSignalCount, 1);
  assert.equal(audit.missingClosureReadbackCount, 1);
  assert.deepEqual(audit.requirements[0].missingSignals, ["missing_signal"]);
  assert.deepEqual(audit.requirements[0].missingClosureReadbacks, ["missing_readback"]);
}

function testSameSignalOkDoesNotProduceIssue() {
  const result = evaluateObservations({
    observations: [{ signalId: "deploy_lane_liveness", status: "ok" }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.issueCount, 0);
  assert.equal(result.diagnosticEvents.length, 0);
}

function testComposerRuntimeFeedbackProducesSelfCheckAutoDispatchEvent() {
  const result = evaluateObservations({
    nowIso: "2026-06-30T00:00:00.000Z",
    observations: [{
      signalId: "composer_runtime_feedback",
      status: "failed",
      errorCode: "composer_terminal_receipt_missing",
      metadata: {
        threadId: "thread_1",
        messageId: "assistant_1",
        runId: "run_1",
        messageText: "private assistant content",
      },
    }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.issueCount, 1);
  assert.equal(result.diagnosticEvents[0].category, "self_check_composer_runtime");
  assert.equal(result.diagnosticEvents[0].diagnostic_type, "self_check_signal_failed");
  assert.equal(result.diagnosticEvents[0].error_code, "composer_terminal_receipt_missing");
  assert.equal(result.issues[0].closureReadbacks.includes("composer_self_check_event"), true);
  assert.doesNotMatch(JSON.stringify(result.diagnosticEvents[0]), /private assistant content/);
}

function testStatusSmokeCollectorBuildsGatewayObservation() {
  const observation = observationFromStatusSmoke({
    ok: true,
    activeGlobal: 0,
    clientVersion: "20260628",
    gatewayPool: { enabled: true, mode: "hybrid", workerCount: 39 },
    gatewayWorkerPolicyContract: { ok: true },
    wrongHeaderDenied: true,
    originIdentity: { title: "Home AI" },
  });
  assert.equal(observation.signalId, "gateway_profile_health");
  assert.equal(observation.status, "ok");
  assert.equal(observation.metadata.workerCount, 39);
}

function testCronAuditCollectorReportsRecentStatusIssue() {
  const observation = observationFromCronAudit({
    ok: false,
    jobCount: 8,
    skillCount: 10,
    sourceIssueCount: 0,
    configIssueCount: 0,
    statusIssueCount: 1,
    statusSince: "2026-06-28T00:00:00.000Z",
  });
  assert.equal(observation.signalId, "automation_cron_health");
  assert.equal(observation.status, "failed");
  assert.equal(observation.errorCode, "automation_cron_recent_status_issues");
  assert.equal(observation.metadata.statusIssueCount, 1);
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

function testCronAuditPermissionBlockedSkipsSourceContextDiagnostic() {
  const payload = cronPermissionBlockedPayload();
  assert.equal(cronAuditPermissionBlocked(payload), true);
  const observation = observationFromCronAudit(payload, { collectorContext: "source" });
  assert.equal(observation.signalId, "automation_cron_health");
  assert.equal(observation.status, "skipped");
  assert.equal(observation.errorCode, "automation_cron_audit_permission_blocked");
  assert.equal(observation.severity, "info");
  assert.equal(observation.diagnosticEligible, false);
  assert.equal(observation.metadata.permissionBlocked, true);
  assert.equal(observation.metadata.collectorContext, "source");
  const evaluated = evaluateObservations({ observations: [observation] });
  assert.equal(evaluated.ok, true);
  assert.equal(evaluated.issueCount, 0);
  assert.equal(evaluated.skippedObservationCount, 1);
  assert.equal(evaluated.diagnosticEvents.length, 0);
}

function testCronAuditPermissionBlockedFailsProductionContext() {
  const observation = observationFromCronAudit(cronPermissionBlockedPayload(), { collectorContext: "production" });
  assert.equal(observation.status, "failed");
  assert.equal(observation.errorCode, "automation_cron_audit_permission_blocked");
  assert.equal(observation.diagnosticEligible, true);
  assert.equal(observation.metadata.collectorContext, "production");
  const evaluated = evaluateObservations({ observations: [observation] });
  assert.equal(evaluated.ok, false);
  assert.equal(evaluated.issueCount, 1);
  assert.equal(evaluated.diagnosticEvents[0].error_code, "automation_cron_audit_permission_blocked");
}

function testProductionDiagnosticsCollectorFindsMissingHarness() {
  const observation = observationFromProductionDiagnostics({
    ok: true,
    diagnosticCount: 1,
    diagnostics: [{ id: "broken", scriptExists: true, sourceHarnessExists: false }],
    issues: [],
  });
  assert.equal(observation.signalId, "production_self_diagnostics");
  assert.equal(observation.status, "failed");
  assert.equal(observation.errorCode, "production_self_diagnostics_missing_entries");
  assert.equal(observation.metadata.missingEntryCount, 1);
}

function publicUpgradeRehearsalPayload(overrides = {}) {
  return Object.assign({
    ok: true,
    tempRemoved: true,
    stepCount: 10,
    steps: [
      {
        type: "public-source-preflight",
        result: { ok: true, status: 0 },
        summary: { ok: true, issueCount: 0, requiredPluginCount: 10 },
      },
      {
        type: "upgrade-plan-missing-sources-fail-closed",
        result: { ok: false, status: 1 },
        summary: {
          ok: false,
          issueCount: 0,
          blockerCount: 11,
          pluginCount: 10,
          missingSourceBlockerCount: 10,
          cloneActionCount: 10,
          deployActionCount: 0,
          movieOperatorAuthenticated: true,
          closureValidationPresent: true,
          rawSecretsInOutput: false,
        },
      },
      {
        type: "validate-missing-source-fail-closed",
        ok: true,
        detail: {
          ok: true,
          reportOk: false,
          issueCount: 0,
          missingSourceBlockerCount: 10,
          pluginCount: 10,
          hasMovieOperatorAuthBlocker: true,
        },
      },
      {
        type: "upgrade-plan-with-operator-clone-gate",
        result: { ok: true, status: 0 },
        summary: {
          ok: true,
          issueCount: 0,
          blockerCount: 0,
          actionCount: 21,
          pluginCount: 10,
          missingSourceBlockerCount: 0,
          cloneActionCount: 10,
          deployActionCount: 10,
          movieOperatorAuthenticated: true,
          closureValidationPresent: true,
          rawSecretsInOutput: false,
        },
      },
      {
        type: "validate-operator-clone-gate-plan",
        ok: true,
        detail: {
          ok: true,
          reportOk: true,
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
        detail: {
          ok: true,
          reportOk: false,
          runtimeRepairBlockerPresent: true,
          runtimeRepairActionPresent: true,
        },
      },
      {
        type: "validate-hermes-runtime-repair-gate-plan",
        ok: true,
        detail: {
          ok: true,
          reportOk: true,
          runtimeRepairActionPresent: true,
          closureValidationPresent: true,
        },
      },
      {
        type: "validate-non-git-source-adoption-required",
        ok: true,
        detail: {
          ok: true,
          reportOk: false,
          sourceDirectoryNotGitBlockerCount: 2,
          hasHomeAiBlocker: true,
        },
      },
      {
        type: "validate-source-adoption-gate-plan",
        ok: true,
        detail: {
          ok: true,
          reportOk: true,
          adoptActionCount: 2,
          deployActionCount: 10,
          pluginCount: 10,
          closureValidationPresent: true,
        },
      },
    ],
  }, overrides);
}

function testPublicUpgradeRehearsalCollectorReportsClosure() {
  const observation = observationFromPublicUpgradeRehearsal(publicUpgradeRehearsalPayload());
  assert.equal(observation.signalId, "public_upgrade_rehearsal");
  assert.equal(observation.status, "ok");
  assert.equal(observation.metadata.pluginCount, 10);
  assert.equal(observation.metadata.missingSourceBlockerCount, 10);
  assert.equal(observation.metadata.cloneActionCount, 10);
  assert.equal(observation.metadata.deployActionCount, 10);
  assert.equal(observation.metadata.movieOperatorAuthenticated, true);
  assert.equal(observation.metadata.closureValidationPresent, true);
  assert.equal(observation.metadata.hermesRuntimeRepairRequired, true);
  assert.equal(observation.metadata.hermesRuntimeRepairGateOk, true);
  assert.equal(observation.metadata.sourceAdoptionRequired, true);
  assert.equal(observation.metadata.sourceAdoptionGateOk, true);
}

function testPublicUpgradeRehearsalCollectorReportsBrokenCloneGate() {
  const observation = observationFromPublicUpgradeRehearsal(publicUpgradeRehearsalPayload({
    steps: publicUpgradeRehearsalPayload().steps.map((step) => (
      step.type === "validate-operator-clone-gate-plan"
        ? Object.assign({}, step, {
          ok: false,
          detail: Object.assign({}, step.detail, { ok: false, deployActionCount: 0 }),
        })
        : step
    )),
  }));
  assert.equal(observation.status, "failed");
  assert.equal(observation.errorCode, "public_upgrade_clone_gate_validation_failed");
  const evaluated = evaluateObservations({ observations: [observation] });
  assert.equal(evaluated.issueCount, 1);
  assert.equal(evaluated.diagnosticEvents[0].category, "self_check_public_upgrade");
  assert.equal(evaluated.diagnosticEvents[0].error_code, "public_upgrade_clone_gate_validation_failed");
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

function testInstallUpgradeCanaryCollectorReportsClosure() {
  const observation = observationFromInstallUpgradeCanary(installUpgradeCanaryPayload());
  assert.equal(observation.signalId, "install_upgrade_canary");
  assert.equal(observation.status, "ok");
  assert.equal(observation.metadata.phaseCount, 9);
  assert.equal(observation.metadata.freshInstallPassed, true);
  assert.equal(observation.metadata.publicUpgradePassed, true);
  assert.equal(observation.metadata.cleanTargetCanaryStatus, "passed");
  assert.equal(observation.metadata.cleanTargetEnvironmentStatus, "ready");
}

function testInstallUpgradeCanarySourceSafeWithoutCleanTargetDoesNotClaimClosure() {
  const observation = observationFromInstallUpgradeCanary(installUpgradeCanaryPayload({
    cleanTargetEnvironment: {
      status: "blocked",
      issueCodes: ["clean_target_root_missing", "operator_phases_gate_missing"],
    },
    cleanTargetCanary: {
      requiredForCompletion: true,
      status: "not_run",
      executionClass: "lane_only_clean_target",
      issueCodes: [],
      noCompletionClaim: true,
    },
  }));
  assert.equal(observation.signalId, "install_upgrade_canary");
  assert.equal(observation.status, "skipped");
  assert.equal(observation.errorCode, "clean_target_environment_blocked");
  assert.equal(observation.diagnosticEligible, false);
  assert.equal(observation.metadata.cleanTargetCanaryStatus, "not_run");
  assert.equal(observation.metadata.cleanTargetEnvironmentStatus, "blocked");
  assert.deepEqual(observation.metadata.cleanTargetEnvironmentIssueCodes, [
    "clean_target_root_missing",
    "operator_phases_gate_missing",
  ]);
  const evaluated = evaluateObservations({ observations: [observation] });
  assert.equal(evaluated.issueCount, 0);
  assert.equal(evaluated.skippedObservationCount, 1);
}

function testInstallUpgradeCanaryPlanOnlyIsNonDiagnosticSkip() {
  const observation = observationFromInstallUpgradeCanary(
    installUpgradeCanaryPayload({
      mode: "plan",
      steps: [],
      cleanTargetCanary: undefined,
    }),
    { collectorContext: "production" },
  );
  assert.equal(observation.signalId, "install_upgrade_canary");
  assert.equal(observation.status, "skipped");
  assert.equal(observation.errorCode, "install_upgrade_canary_plan_only");
  assert.equal(observation.diagnosticEligible, false);
  assert.equal(observation.metadata.planOnly, true);
  assert.equal(observation.metadata.mode, "plan");
  const evaluated = evaluateObservations({ observations: [observation] });
  assert.equal(evaluated.issueCount, 0);
  assert.equal(evaluated.skippedObservationCount, 1);
}

function testInstallUpgradeCanaryCollectorReportsFailure() {
  const observation = observationFromInstallUpgradeCanary(installUpgradeCanaryPayload({
    ok: false,
    failedPhaseCount: 1,
    issues: [{ code: "canary_phase_report_not_ok", phaseId: "runtime_slo_audit" }],
  }));
  assert.equal(observation.status, "failed");
  assert.equal(observation.errorCode, "canary_phase_report_not_ok");
  const evaluated = evaluateObservations({ observations: [observation] });
  assert.equal(evaluated.issueCount, 1);
  assert.equal(evaluated.diagnosticEvents[0].category, "self_check_install_upgrade");
  assert.equal(evaluated.diagnosticEvents[0].error_code, "canary_phase_report_not_ok");
}

function testInstallUpgradeCanaryServiceUserBoundarySkipsSourceCollector() {
  const observation = observationFromInstallUpgradeCanary(
    installUpgradeCanaryServiceUserBoundaryPayload(),
    { collectorContext: "source" },
  );
  assert.equal(observation.status, "skipped");
  assert.equal(observation.errorCode, "production_rehearsal_requires_service_user");
  assert.equal(observation.diagnosticEligible, false);
  assert.equal(observation.metadata.collectorContext, "source");
  assert.equal(observation.metadata.serviceUserBoundary, true);
  assert.equal(observation.metadata.firstFailedPhase, "macos_fresh_install_rehearsal");
  const evaluated = evaluateObservations({ observations: [observation] });
  assert.equal(evaluated.issueCount, 0);
  assert.equal(evaluated.skippedObservationCount, 1);
}

function testInstallUpgradeCanaryExplicitSkipIsNonDiagnosticInProductionCollector() {
  const observation = observationFromInstallUpgradeCanary(
    { ok: false, skipped: true, reason: "install_upgrade_canary_skipped_by_option" },
    { collectorContext: "production" },
  );
  assert.equal(observation.status, "skipped");
  assert.equal(observation.errorCode, "install_upgrade_canary_skipped_by_option");
  assert.equal(observation.diagnosticEligible, false);
  assert.equal(observation.metadata.collectorContext, "production");
  assert.equal(observation.metadata.skipped, true);
  const evaluated = evaluateObservations({ observations: [observation] });
  assert.equal(evaluated.issueCount, 0);
  assert.equal(evaluated.skippedObservationCount, 1);
}

function testInstallUpgradeCanaryServiceUserBoundaryFailsProductionCollector() {
  const observation = observationFromInstallUpgradeCanary(
    installUpgradeCanaryServiceUserBoundaryPayload(),
    { collectorContext: "production" },
  );
  assert.equal(observation.status, "failed");
  assert.equal(observation.errorCode, "canary_phase_command_failed");
  assert.equal(observation.metadata.collectorContext, "production");
  const evaluated = evaluateObservations({ observations: [observation] });
  assert.equal(evaluated.issueCount, 1);
  assert.equal(evaluated.diagnosticEvents[0].category, "self_check_install_upgrade");
  assert.equal(evaluated.diagnosticEvents[0].error_code, "canary_phase_command_failed");
}

function runtimeSloAuditPayload(overrides = {}) {
  return Object.assign({
    ok: true,
    modelVersion: "20260701-runtime-slo-v4",
    matrixVersion: SIGNAL_MATRIX_VERSION,
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

function testRuntimeSloAuditCollectorReportsClosure() {
  const observation = observationFromRuntimeSloAudit(runtimeSloAuditPayload());
  assert.equal(observation.signalId, "runtime_slo_coverage");
  assert.equal(observation.status, "ok");
  assert.equal(observation.metadata.modelVersion, "20260701-runtime-slo-v4");
  assert.equal(observation.metadata.issueCount, 0);
}

function systemResourceStatusPayload(overrides = {}) {
  return Object.assign({
    ok: true,
    schemaVersion: 1,
    status: "ok",
    overallStatus: "ok",
    cpu: {
      status: "ok",
      overallPercent: 25,
      sustainedPercent: 18,
      coreCount: 10,
      processAttribution: {
        available: true,
        source: "ps_comm_cpu",
        topProcessCount: 2,
        topProcessTotalPercent: 15.5,
        topProcesses: [
          { pid: 101, label: "node", cpuPercent: 10.2 },
          { pid: 202, label: "python3", cpuPercent: 5.3 },
        ],
      },
    },
    memory: {
      status: "ok",
      percentUsed: 45,
      residentPercentUsed: 88,
      percentSource: "memory_pressure",
      pressure: { available: true, freePercent: 55, usedPercent: 45, status: "ok" },
      swap: { available: true, percentUsed: 0 },
    },
    disk: { status: "ok", maxPercentUsed: 55, availableBytes: 120 * 1024 ** 3, filesystems: [{ label: "app", status: "ok" }] },
    launchd: { status: "ok", services: [{ label: "com.hermesmobile.listener", status: "running" }] },
    signals: [
      { signalId: "system_cpu_load", category: "host_cpu", status: "ok" },
      { signalId: "system_memory_usage", category: "host_memory", status: "ok" },
      { signalId: "system_disk_usage", category: "host_disk", status: "ok" },
      { signalId: "system_launchd_services", category: "service", status: "ok" },
    ],
  }, overrides);
}

function testSystemResourceStatusCollectorReportsClosure() {
  const observation = observationFromSystemResourceStatus(systemResourceStatusPayload());
  assert.equal(observation.signalId, "system_resource_health");
  assert.equal(observation.status, "ok");
  assert.equal(observation.metadata.overallStatus, "ok");
  assert.equal(observation.metadata.cpuOverallPercent, 25);
  assert.equal(observation.metadata.cpuAttributionAvailable, true);
  assert.equal(observation.metadata.cpuTopProcessCount, 2);
  assert.equal(observation.metadata.cpuTopProcessTotalPercent, 15.5);
  assert.equal(observation.metadata.cpuTopProcessLabels, "node,python3");
  assert.equal(observation.metadata.memoryPercentUsed, 45);
  assert.equal(observation.metadata.memoryPercentSource, "memory_pressure");
  assert.equal(observation.metadata.memoryResidentPercentUsed, 88);
  assert.equal(observation.metadata.memoryPressureFreePercent, 55);
  assert.equal(observation.metadata.memoryPressureAvailable, true);
  assert.equal(observation.metadata.memoryPressureStatus, "ok");
  assert.equal(observation.metadata.serviceIssueCount, 0);
}

function testSystemResourceStatusCollectorKeepsWarningAsEvidenceOnly() {
  const observation = observationFromSystemResourceStatus(systemResourceStatusPayload({
    status: "warning",
    overallStatus: "warning",
    cpu: { status: "warning", overallPercent: 68, sustainedPercent: 68, coreCount: 10 },
    memory: { status: "warning", percentUsed: 85, swap: { available: true, percentUsed: 0 } },
    signals: [
      { signalId: "system_cpu_load", category: "host_cpu", status: "warning" },
      { signalId: "system_memory_usage", category: "host_memory", status: "warning" },
    ],
  }));
  assert.equal(observation.signalId, "system_resource_health");
  assert.equal(observation.status, "ok");
  assert.equal(observation.errorCode, "");
  assert.equal(observation.metadata.overallStatus, "warning");
  assert.equal(observation.metadata.warningSignalCount, 2);
  assert.equal(observation.metadata.degradedSignalCount, 0);
  assert.equal(evaluateObservations({ observations: [observation] }).issueCount, 0);
}

function testSystemResourceStatusCollectorReportsPressure() {
  const observation = observationFromSystemResourceStatus(systemResourceStatusPayload({
    ok: false,
    status: "degraded",
    overallStatus: "degraded",
    cpu: {
      status: "degraded",
      overallPercent: 96,
      sustainedPercent: 93,
      coreCount: 10,
      processAttribution: {
        available: true,
        source: "ps_comm_cpu",
        topProcessCount: 2,
        topProcessTotalPercent: 91.5,
        topProcesses: [
          { pid: 303, label: "node", cpuPercent: 73.1 },
          { pid: 404, label: "mds_stores", cpuPercent: 18.4 },
        ],
      },
    },
    memory: {
      status: "warning",
      percentUsed: 83,
      residentPercentUsed: 96,
      percentSource: "memory_pressure",
      pressure: { available: true, freePercent: 17, usedPercent: 83, status: "warning" },
      swap: { available: true, percentUsed: 28 },
    },
    disk: { status: "ok", maxPercentUsed: 55, availableBytes: 120 * 1024 ** 3, filesystems: [{ label: "app", status: "ok" }] },
    launchd: { status: "warning", services: [{ label: "com.hermesmobile.listener", status: "stopped" }] },
    signals: [
      { signalId: "system_cpu_load", category: "host_cpu", status: "degraded" },
      { signalId: "system_memory_usage", category: "host_memory", status: "warning" },
      { signalId: "system_launchd_services", category: "service", status: "warning" },
    ],
  }));
  assert.equal(observation.status, "failed");
  assert.equal(observation.errorCode, "system_resource_degraded");
  assert.equal(observation.severity, "H1");
  assert.equal(observation.metadata.failingSignalCount, 3);
  assert.equal(observation.metadata.stoppedServiceCount, 1);
  assert.equal(observation.metadata.cpuTopProcessLabels, "node,mds_stores");
  assert.equal(observation.metadata.cpuTopProcessTotalPercent, 91.5);
  assert.equal(observation.metadata.memoryPercentSource, "memory_pressure");
  assert.equal(observation.metadata.memoryResidentPercentUsed, 96);
  assert.equal(observation.metadata.memoryPressureFreePercent, 17);
  assert.equal(observation.metadata.memoryPressureStatus, "warning");
  const evaluated = evaluateObservations({ observations: [observation] });
  assert.equal(evaluated.issueCount, 1);
  assert.equal(evaluated.diagnosticEvents[0].category, "self_check_system_resource");
  assert.equal(evaluated.diagnosticEvents[0].error_code, "system_resource_degraded");
  assert.equal(evaluated.issues[0].closureReadbacks.includes("system_resource_status_snapshot"), true);
}

function testSystemResourceUnknownSkipsSourceContextOnly() {
  const payload = systemResourceStatusPayload({
    ok: true,
    status: "unknown",
    overallStatus: "unknown",
    cpu: { status: "ok", overallPercent: 12, sustainedPercent: 8, coreCount: 10 },
    memory: { status: "ok", percentUsed: 40, swap: { available: false, percentUsed: 0 } },
    disk: { status: "unknown", maxPercentUsed: 0, availableBytes: 0, filesystems: [] },
    launchd: { status: "unknown", services: [{ label: "com.hermesmobile.listener", status: "unknown" }] },
    signals: [
      { signalId: "system_disk_usage", category: "host_disk", status: "unknown" },
      { signalId: "system_launchd_services", category: "service", status: "unknown" },
    ],
  });
  const sourceObservation = observationFromSystemResourceStatus(payload, { collectorContext: "source" });
  assert.equal(sourceObservation.status, "skipped");
  assert.equal(sourceObservation.diagnosticEligible, false);
  assert.equal(sourceObservation.errorCode, "system_resource_unknown");
  assert.equal(evaluateObservations({ observations: [sourceObservation] }).issueCount, 0);

  const productionObservation = observationFromSystemResourceStatus(payload, { collectorContext: "production" });
  assert.equal(productionObservation.status, "failed");
  assert.equal(productionObservation.diagnosticEligible, true);
  const evaluated = evaluateObservations({ observations: [productionObservation] });
  assert.equal(evaluated.issueCount, 1);
  assert.equal(evaluated.diagnosticEvents[0].error_code, "system_resource_unknown");
}

function testRuntimeSloAuditCollectorReportsFailure() {
  const observation = observationFromRuntimeSloAudit(runtimeSloAuditPayload({
    ok: false,
    status: "coverage_gap",
    issueCount: 1,
    unmappedSignalCount: 1,
  }));
  assert.equal(observation.status, "failed");
  assert.equal(observation.errorCode, "runtime_slo_audit_failed");
  const evaluated = evaluateObservations({ observations: [observation] });
  assert.equal(evaluated.issueCount, 1);
  assert.equal(evaluated.diagnosticEvents[0].category, "self_check_runtime_slo");
  assert.equal(evaluated.diagnosticEvents[0].error_code, "runtime_slo_audit_failed");
  assert.equal(evaluated.issues[0].closureReadbacks.includes("runtime_slo_audit_summary"), true);
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

function pluginDeployContractClosurePayload(overrides = {}) {
  return Object.assign({
    ok: true,
    deployCard: { validRequestOk: true, terminalReceiptRejected: true },
    deployLaneLock: { ok: true, pluginId: "finance", phase: "readback" },
    markerChecks: [{ ok: true, marker: "cardKind=plugin_deployment" }],
    issues: [],
  }, overrides);
}

function pluginProxyWorkspaceBoundaryPayload(overrides = {}) {
  return Object.assign({
    ok: true,
    routeKind: "source_contract_smoke",
    checkCount: 7,
    missingWorkspaceFailsClosed: true,
    workspaceHeaderPropagated: true,
    actorHeaderPropagated: true,
    browserAuthOverwritten: true,
    issues: [],
  }, overrides);
}

function testPluginActionMetadataClosureCollectorReportsClosure() {
  const observation = observationFromPluginActionMetadataClosure(pluginActionMetadataClosurePayload());
  assert.equal(observation.signalId, "plugin_action_metadata_health");
  assert.equal(observation.status, "ok");
  assert.equal(observation.metadata.pluginId, "wardrobe");
  assert.equal(observation.metadata.actionKind, "wardrobeOutfitWearIntent");
  assert.equal(observation.metadata.actionFamilyCount, 3);
  assert.equal(observation.metadata.generalizedActionFamilyCount, 2);
  assert.equal(observation.metadata.actionClassCount, 3);
  assert.equal(observation.metadata.stageCount, 15);
  assert.equal(observation.metadata.failedStageCount, 0);
}

function testPluginActionMetadataClosureCollectorReportsBridgeFailure() {
  const observation = observationFromPluginActionMetadataClosure(pluginActionMetadataClosurePayload({
    ok: false,
    passedStageCount: 14,
    failedStageCount: 1,
    failedStages: ["plugin_conversation_repair_request:task_card_dispatch_bridge_probe"],
  }));
  assert.equal(observation.status, "failed");
  assert.equal(observation.errorCode, "plugin_action_bridge_unavailable");
  assert.equal(observation.metadata.bridgeUnavailableCount, 1);
  const evaluated = evaluateObservations({ observations: [observation] });
  assert.equal(evaluated.issueCount, 1);
  assert.equal(evaluated.diagnosticEvents[0].category, "self_check_plugin_action_metadata");
  assert.equal(evaluated.diagnosticEvents[0].error_code, "plugin_action_bridge_unavailable");
}

function testProductionSignalReportCoversEveryMaintainedSignal() {
  const report = buildProductionSignalReport({
    observations: [
      { signalId: "gateway_profile_health", status: "ok" },
      { signalId: "plugin_action_metadata_health", status: "failed", errorCode: "intent_metadata_missing" },
      { signalId: "automation_cron_health", status: "skipped", errorCode: "automation_cron_audit_permission_blocked", diagnosticEligible: false },
    ],
  });
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.matrixVersion, SIGNAL_MATRIX_VERSION);
  assert.equal(report.signalCount, 21);
  assert.equal(report.reportedSignalCount, 21);
  assert.equal(report.observedSignalCount, 3);
  assert.equal(report.notCollectedSignalCount, 18);
  assert.equal(report.failedSignalCount, 1);
  assert.equal(report.skippedSignalCount, 1);
  assert.equal(report.policy.reportsAllMaintainedSignals, true);
  assert.equal(report.policy.notCollectedIsDiagnosticContextOnly, true);
  assert.equal(report.policy.failuresCreateDiagnosticEvents, true);
  const byId = new Map(report.rows.map((row) => [row.signalId, row]));
  assert.equal(byId.get("gateway_profile_health").status, "ok");
  assert.equal(byId.get("plugin_action_metadata_health").status, "failed");
  assert.deepEqual(byId.get("plugin_action_metadata_health").errorCodes, ["intent_metadata_missing"]);
  assert.equal(byId.get("automation_cron_health").status, "skipped");
  assert.equal(byId.get("runtime_slo_coverage").status, "not_collected");
  assert.equal(byId.get("runtime_slo_coverage").observed, false);
  assert.ok(byId.get("runtime_slo_coverage").closureReadbackCount > 0);
}

function testRequiredLiveSignalCollectorsProduceObservedRows() {
  assert.equal(typeof observationFromMcpSchemaClosure, "function");
  assert.equal(typeof observationFromDeployLaneDiscovery, "function");
  assert.equal(typeof observationFromTaskCardDispatchState, "function");
  assert.equal(typeof observationFromAuditThreadDiscovery, "function");
  assert.equal(typeof observationFromNotificationDelivery, "function");
  assert.equal(typeof observationFromPluginManifestHealth, "function");
  assert.equal(typeof observationFromPluginProxyLiveProbe, "function");
  assert.equal(typeof observationFromNativeBridgeCapability, "function");
  assert.equal(typeof observationFromPluginDeployContractClosure, "function");
  assert.equal(typeof observationFromPluginProxyWorkspaceBoundary, "function");

  const collected = buildProductionObservations({
    mcpSchemaClosure: mcpSchemaClosurePayload(),
    deployLaneDiscovery: threadLivenessPayload(),
    pluginDeployContractClosure: pluginDeployContractClosurePayload(),
    taskCardDispatchState: threadLivenessPayload(),
    auditThreadDiscovery: threadLivenessPayload(),
    notificationDelivery: notificationDeliveryPayload(),
    pluginManifestHealth: pluginManifestHealthPayload(),
    pluginProxyWorkspaceBoundary: pluginProxyWorkspaceBoundaryPayload(),
    nativeBridgeCapability: nativeBridgeCapabilityPayload(),
  });
  assert.equal(collected.ok, true);
  assert.equal(collected.observationCount, 10);
  assert.equal(collected.skippedObservationCount, 1);
  const byId = new Map(collected.signalReport.rows.map((row) => [row.signalId, row]));
  for (const signalId of [
    "mcp_schema_closure",
    "deploy_lane_liveness",
    "plugin_deploy_contract_closure",
    "task_card_dispatch",
    "plugin_proxy_latency",
    "plugin_proxy_workspace_boundary",
    "native_bridge_capability",
    "notification_delivery",
    "plugin_manifest_health",
    "audit_thread_liveness",
  ]) {
    assert.notEqual(byId.get(signalId).status, "not_collected", signalId);
  }
  assert.equal(byId.get("native_bridge_capability").status, "skipped");
  const taskCardWithoutSourceThread = buildProductionObservations({
    taskCardDispatchState: threadLivenessPayload({
      sourceThreadVisible: false,
      sourceThreadRequired: false,
      targetThreadVisible: true,
    }),
  });
  assert.equal(taskCardWithoutSourceThread.signalReport.rows.find((row) => row.signalId === "task_card_dispatch").status, "ok");
}

function testDailyProductionObservationPayloadCanCoverEveryMaintainedSignal() {
  const collected = buildProductionObservations({
    systemResourceStatus: systemResourceStatusPayload(),
    statusSmoke: {
      ok: true,
      activeGlobal: 0,
      gatewayPool: { enabled: true, mode: "hybrid", workerCount: 39 },
      gatewayWorkerPolicyContract: { ok: true },
      wrongHeaderDenied: true,
      originIdentity: { title: "Home AI" },
    },
    cronAudit: {
      ok: true,
      jobCount: 8,
      skillCount: 10,
      sourceIssueCount: 0,
      configIssueCount: 0,
      statusIssueCount: 0,
    },
    productionDiagnostics: { ok: true, diagnosticCount: 28, issues: [] },
    publicUpgradeRehearsal: publicUpgradeRehearsalPayload(),
    installUpgradeCanary: installUpgradeCanaryPayload(),
    runtimeSloAudit: runtimeSloAuditPayload(),
    pluginActionMetadataClosure: pluginActionMetadataClosurePayload(),
    mcpSchemaClosure: mcpSchemaClosurePayload(),
    deployLaneDiscovery: threadLivenessPayload(),
    pluginDeployContractClosure: pluginDeployContractClosurePayload(),
    taskCardDispatchState: threadLivenessPayload(),
    auditThreadDiscovery: threadLivenessPayload(),
    notificationDelivery: notificationDeliveryPayload(),
    pluginManifestHealth: pluginManifestHealthPayload(),
    pluginProxyWorkspaceBoundary: pluginProxyWorkspaceBoundaryPayload(),
    nativeBridgeCapability: nativeBridgeCapabilityPayload(),
    gatewayCapabilityAvailability: {
      workspaceId: "owner",
      profile: "low_gateway",
      requiredTools: ["pptx_create", "pdf_create"],
      missingTools: [],
    },
    uiRuntimeHealth: {
      skipped: true,
      reason: "ui_runtime_health_live_telemetry_not_attached",
    },
  });
  assert.equal(collected.ok, true);
  assert.equal(collected.signalReport.reportedSignalCount, 21);
  assert.equal(collected.signalReport.observedSignalCount, 21);
  assert.equal(collected.signalReport.notCollectedSignalCount, 0);
  assert.equal(collected.signalReport.failedSignalCount, 0);
  const byId = new Map(collected.signalReport.rows.map((row) => [row.signalId, row]));
  assert.equal(byId.get("composer_runtime_feedback").status, "skipped");
  assert.equal(byId.get("media_preview_health").status, "skipped");
  assert.equal(byId.get("gateway_document_tool_capability").status, "ok");
}

function testDiagnosticSubmitClosureReportRequiresCaseEventAndReadbacks() {
  const evaluated = evaluateObservations({
    nowIso: "2026-07-01T00:00:00.000Z",
    observations: [{
      signalId: "plugin_proxy_latency",
      status: "failed",
      errorCode: "plugin_proxy_latency_gap_detected",
    }],
  });
  const event = evaluated.diagnosticEvents[0];
  const report = buildDiagnosticSubmitClosureReport({
    enabled: true,
    events: [event],
    submitResults: [{
      ok: true,
      case_id: "diagcase_proxy",
      event_id: "diagevt_proxy",
      auto_dispatched: true,
      task_card_id: "ttc_proxy",
      reason: "auto_self_check_task_card",
    }],
  });
  assert.equal(report.ok, true);
  assert.equal(report.matrixVersion, SIGNAL_MATRIX_VERSION);
  assert.equal(report.eventCount, 1);
  assert.equal(report.acceptedCount, 1);
  assert.equal(report.autoDispatchedCount, 1);
  assert.equal(report.ownerNotifiedCount, 0);
  assert.equal(report.missingCaseOrEventIdCount, 0);
  assert.equal(report.missingClosureReadbackCount, 0);
  assert.equal(report.rows[0].signalId, "plugin_proxy_latency");
  assert.equal(report.rows[0].status, "auto_dispatched");
  assert.deepEqual(report.rows[0].closureReadbacks, [
    "host_proxy_timing_split",
    "upstream_timing_readback",
    "post_fix_latency_probe",
    "diagnostic_return_card",
  ]);

  const missingIds = buildDiagnosticSubmitClosureReport({
    enabled: true,
    events: [event],
    submitResults: [{ ok: true, case_id: "", event_id: "" }],
  });
  assert.equal(missingIds.ok, false);
  assert.equal(missingIds.missingCaseOrEventIdCount, 1);
  assert.equal(missingIds.rows[0].status, "accepted_missing_case_or_event_id");

  const disabled = buildDiagnosticSubmitClosureReport({
    enabled: false,
    events: [event],
    submitResults: [],
  });
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.eventCount, 0);
  assert.equal(disabled.ok, true);
}

function testProductionObservationBatchFeedsDiagnostics() {
  const collected = buildProductionObservations({
    statusSmoke: {
      ok: true,
      activeGlobal: 0,
      gatewayPool: { enabled: true, mode: "hybrid", workerCount: 39 },
      gatewayWorkerPolicyContract: { ok: true },
      wrongHeaderDenied: true,
      originIdentity: { title: "Home AI" },
    },
    cronAudit: {
      ok: true,
      jobCount: 8,
      skillCount: 10,
      sourceIssueCount: 0,
      configIssueCount: 0,
      statusIssueCount: 0,
    },
    productionDiagnostics: {
      ok: false,
      error: "diagnostic_doc_reference_missing",
      diagnosticCount: 10,
      issues: [{ code: "diagnostic_doc_reference_missing" }],
    },
    publicUpgradeRehearsal: publicUpgradeRehearsalPayload(),
    installUpgradeCanary: installUpgradeCanaryPayload(),
    runtimeSloAudit: runtimeSloAuditPayload(),
    pluginActionMetadataClosure: pluginActionMetadataClosurePayload(),
    systemResourceStatus: systemResourceStatusPayload(),
  });
  assert.equal(collected.ok, false);
  assert.equal(collected.observationCount, 8);
  assert.equal(collected.signalReport.reportedSignalCount, 21);
  assert.equal(collected.signalReport.observedSignalCount, 8);
  assert.equal(collected.signalReport.notCollectedSignalCount, 13);
  assert.equal(collected.signalReport.failedSignalCount, 1);
  const evaluated = evaluateObservations({
    nowIso: "2026-06-28T00:00:00.000Z",
    observations: collected.observations,
  });
  assert.equal(evaluated.issueCount, 1);
  assert.equal(evaluated.diagnosticEvents[0].category, "self_check_production_diagnostics");
  assert.equal(evaluated.diagnosticEvents[0].error_code, "diagnostic_doc_reference_missing");
}

function testRuntimeHealthProductionObservationsFeedDiagnostics() {
  assert.equal(typeof observationsFromPluginProxyLatency, "function");
  assert.equal(typeof observationsFromGatewayCapabilityAvailability, "function");
  assert.equal(typeof observationsFromUiRuntimeHealth, "function");
  const collected = buildProductionObservations({
    pluginProxyLatency: {
      pluginId: "codex-mobile-web",
      routeKind: "thread-detail",
      samples: [{ clientElapsedMs: 6200, upstreamMs: 120 }],
    },
    gatewayCapabilityAvailability: {
      workspaceId: "liyushuang",
      profile: "low_gateway",
      requiredTools: ["pdf_create", "pptx_create"],
      missingTools: ["pptx_create"],
    },
    uiRuntimeHealth: {
      pluginId: "codex-mobile-web",
      composer: { terminalReceiptMissingCount: 1, threadId: "thread-1", messageId: "msg-1", runId: "run-1" },
      mediaPreview: { mediaKind: "generated_png", imagePreviewFailedCount: 1, sourceKind: "protected_api_route" },
      nativeBridge: { platform: "android", appVersion: "0.4.28", capability: "outboundShare", nativeBridgeUnavailableCount: 1 },
      pluginActions: { pluginId: "wardrobe", actionKind: "wardrobeOutfitWearIntent", pluginActionMetadataMissingCount: 1 },
    },
  });
  assert.equal(collected.ok, false);
  assert.equal(collected.observationCount, 6);
  assert.equal(collected.signalReport.reportedSignalCount, 21);
  assert.equal(collected.signalReport.observedSignalCount, 6);
  assert.equal(collected.signalReport.notCollectedSignalCount, 15);
  assert.equal(collected.signalReport.failedSignalCount, 6);
  assert.deepEqual(collected.observations.map((item) => item.signalId), [
    "plugin_proxy_latency",
    "gateway_document_tool_capability",
    "composer_runtime_feedback",
    "media_preview_health",
    "native_bridge_capability",
    "plugin_action_metadata_health",
  ]);
  const evaluated = evaluateObservations({
    nowIso: "2026-07-01T00:00:00.000Z",
    observations: collected.observations,
  });
  assert.equal(evaluated.issueCount, 6);
  assert.equal(evaluated.diagnosticEvents.some((event) => event.category === "self_check_plugin_proxy"), true);
  assert.equal(evaluated.diagnosticEvents.some((event) => event.category === "self_check_gateway_tooling"), true);
  assert.equal(evaluated.diagnosticEvents.some((event) => event.category === "self_check_composer_runtime"), true);
  assert.equal(evaluated.diagnosticEvents.some((event) => event.category === "self_check_media_preview"), true);
  assert.equal(evaluated.diagnosticEvents.some((event) => event.category === "self_check_native_bridge"), true);
  assert.equal(evaluated.diagnosticEvents.some((event) => event.category === "self_check_plugin_action_metadata"), true);
  assert.equal(JSON.stringify(evaluated).includes("thread-1"), true);
  assert.equal(JSON.stringify(evaluated).includes("private assistant content"), false);
}

function testAuditRequestCardsAreCentralAuditOnly() {
  const cards = buildAuditRequestCards({
    scope: "all",
    nowIso: "2026-06-28T00:00:00.000Z",
  });
  assert.equal(cards.ok, true);
  assert.equal(cards.cardCount, 2);
  assert.deepEqual(cards.cards.map((card) => card.targetThreadTitle).sort(), [
    DEFAULT_PLATFORM_AUDIT_THREAD_TITLE,
    DEFAULT_PLUGIN_AUDIT_THREAD_TITLE,
  ].sort());
  assert.ok(cards.cards.every((card) => card.workflowMode === "manual"));
  assert.ok(cards.cards.every((card) => card.reasoningEffort === "xhigh"));
  assert.ok(cards.cards.every((card) => /Return Card Required/.test(card.body)));
  assert.ok(cards.cards.every((card) => /Do not run the deep audit inside CRON or the Home AI app process/.test(card.body)));
  assert.ok(cards.cards.every((card) => !/Home AI Deploy/.test(card.targetThreadTitle)));
}

function testReportCombinesMatrixEvaluationAndAuditRequests() {
  const report = buildSelfImprovingLoopReport({
    nowIso: "2026-06-28T00:00:00.000Z",
    includeAuditRequests: true,
    auditScope: "platform",
    observations: [{ signalId: "mcp_schema_closure", status: "missing", errorCode: "mcp_movie_missing" }],
  });
  assert.equal(report.ok, false);
  assert.equal(report.status, "issues_detected");
  assert.equal(report.matrix.signalCount >= 9, true);
  assert.equal(report.evaluation.issueCount, 1);
  assert.equal(report.auditRequests.cardCount, 1);
  assert.equal(report.auditRequests.cards[0].targetThreadTitle, DEFAULT_PLATFORM_AUDIT_THREAD_TITLE);
  assert.equal(report.policy.repairMode, "self_check_auto_task_card_or_owner_gated");
  assert.equal(report.policy.noSilentFallback, true);
}

testSignalMatrixCoversHighFrequencyBoundaries();
testObservationsProduceBoundedDiagnosticEvents();
testCoverageAuditCoversRecentIncidentClasses();
testCoverageAuditFindsMissingSignalAndClosureReadback();
testSameSignalOkDoesNotProduceIssue();
testComposerRuntimeFeedbackProducesSelfCheckAutoDispatchEvent();
testStatusSmokeCollectorBuildsGatewayObservation();
testCronAuditCollectorReportsRecentStatusIssue();
testCronAuditPermissionBlockedSkipsSourceContextDiagnostic();
testCronAuditPermissionBlockedFailsProductionContext();
testProductionDiagnosticsCollectorFindsMissingHarness();
testPublicUpgradeRehearsalCollectorReportsClosure();
testPublicUpgradeRehearsalCollectorReportsBrokenCloneGate();
testInstallUpgradeCanaryCollectorReportsClosure();
testInstallUpgradeCanarySourceSafeWithoutCleanTargetDoesNotClaimClosure();
testInstallUpgradeCanaryPlanOnlyIsNonDiagnosticSkip();
testInstallUpgradeCanaryCollectorReportsFailure();
testInstallUpgradeCanaryServiceUserBoundarySkipsSourceCollector();
testInstallUpgradeCanaryExplicitSkipIsNonDiagnosticInProductionCollector();
testInstallUpgradeCanaryServiceUserBoundaryFailsProductionCollector();
testRuntimeSloAuditCollectorReportsClosure();
testRuntimeSloAuditCollectorReportsFailure();
testSystemResourceStatusCollectorReportsClosure();
testSystemResourceStatusCollectorKeepsWarningAsEvidenceOnly();
testSystemResourceStatusCollectorReportsPressure();
testSystemResourceUnknownSkipsSourceContextOnly();
testPluginActionMetadataClosureCollectorReportsClosure();
testPluginActionMetadataClosureCollectorReportsBridgeFailure();
testProductionSignalReportCoversEveryMaintainedSignal();
testRequiredLiveSignalCollectorsProduceObservedRows();
testDailyProductionObservationPayloadCanCoverEveryMaintainedSignal();
testDiagnosticSubmitClosureReportRequiresCaseEventAndReadbacks();
testProductionObservationBatchFeedsDiagnostics();
testRuntimeHealthProductionObservationsFeedDiagnostics();
testAuditRequestCardsAreCentralAuditOnly();
testReportCombinesMatrixEvaluationAndAuditRequests();

console.log("Home AI self-improving loop service tests passed");
