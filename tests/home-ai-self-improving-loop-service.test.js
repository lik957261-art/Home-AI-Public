"use strict";

const assert = require("node:assert/strict");
const {
  DEFAULT_PLUGIN_AUDIT_THREAD_TITLE,
  DEFAULT_PLATFORM_AUDIT_THREAD_TITLE,
  SIGNAL_MATRIX_VERSION,
  buildAuditRequestCards,
  buildCoverageAudit,
  buildProductionObservations,
  buildSelfImprovingLoopReport,
  buildSignalMatrix,
  cronAuditPermissionBlocked,
  evaluateObservations,
  observationFromCronAudit,
  observationFromPublicUpgradeRehearsal,
  observationFromProductionDiagnostics,
  observationFromStatusSmoke,
} = require("../adapters/home-ai-self-improving-loop-service");

function testSignalMatrixCoversHighFrequencyBoundaries() {
  const matrix = buildSignalMatrix({ nowIso: "2026-06-28T00:00:00.000Z" });
  const ids = new Set(matrix.signals.map((signal) => signal.id));
  assert.equal(matrix.ok, true);
  assert.equal(matrix.matrixVersion, SIGNAL_MATRIX_VERSION);
  assert.ok(ids.has("gateway_profile_health"));
  assert.ok(ids.has("mcp_schema_closure"));
  assert.ok(ids.has("deploy_lane_liveness"));
  assert.ok(ids.has("task_card_dispatch"));
  assert.ok(ids.has("plugin_proxy_latency"));
  assert.ok(ids.has("media_preview_health"));
  assert.ok(ids.has("gateway_document_tool_capability"));
  assert.ok(ids.has("plugin_deploy_contract_closure"));
  assert.ok(ids.has("plugin_proxy_workspace_boundary"));
  assert.ok(ids.has("native_bridge_capability"));
  assert.ok(ids.has("notification_delivery"));
  assert.ok(ids.has("plugin_manifest_health"));
  assert.ok(ids.has("audit_thread_liveness"));
  assert.ok(ids.has("automation_cron_health"));
  assert.ok(ids.has("production_self_diagnostics"));
  assert.ok(ids.has("public_upgrade_rehearsal"));
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
    stepCount: 7,
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
  });
  assert.equal(collected.ok, false);
  assert.equal(collected.observationCount, 4);
  const evaluated = evaluateObservations({
    nowIso: "2026-06-28T00:00:00.000Z",
    observations: collected.observations,
  });
  assert.equal(evaluated.issueCount, 1);
  assert.equal(evaluated.diagnosticEvents[0].category, "self_check_production_diagnostics");
  assert.equal(evaluated.diagnosticEvents[0].error_code, "diagnostic_doc_reference_missing");
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
testStatusSmokeCollectorBuildsGatewayObservation();
testCronAuditCollectorReportsRecentStatusIssue();
testCronAuditPermissionBlockedSkipsSourceContextDiagnostic();
testCronAuditPermissionBlockedFailsProductionContext();
testProductionDiagnosticsCollectorFindsMissingHarness();
testPublicUpgradeRehearsalCollectorReportsClosure();
testPublicUpgradeRehearsalCollectorReportsBrokenCloneGate();
testProductionObservationBatchFeedsDiagnostics();
testAuditRequestCardsAreCentralAuditOnly();
testReportCombinesMatrixEvaluationAndAuditRequests();

console.log("Home AI self-improving loop service tests passed");
