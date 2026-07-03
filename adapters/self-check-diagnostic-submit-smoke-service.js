"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createAiOpsDiagnosticIntakeService } = require("./ai-ops-diagnostic-intake-service");
const { createAiOpsDiagnosticRemediationWorkflowService } = require("./ai-ops-diagnostic-remediation-workflow-service");
const {
  SIGNAL_MATRIX_VERSION,
  buildDiagnosticSubmitClosureReport,
  evaluateObservations,
} = require("./home-ai-self-improving-loop-service");

const SMOKE_MODEL_VERSION = "20260701-self-check-diagnostic-submit-smoke-v2";
const SMOKE_WORKSPACE = "owner";

function clean(value, max = 240) {
  return String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function tempDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "homeai-self-check-submit-smoke-"));
}

function buildSelfCheckDiagnosticEvent(nowIso) {
  const evaluated = evaluateObservations({
    nowIso,
    observations: [{
      signalId: "plugin_proxy_latency",
      status: "failed",
      errorCode: "plugin_proxy_latency_gap_detected",
      durationBucket: "gt_2s",
      metadata: {
        route_kind: "thread_detail",
        upstream_bucket: "lt_500ms",
        proxy_gap_bucket: "gt_2s",
      },
    }],
  });
  return evaluated.diagnosticEvents[0];
}

function buildSystemResourceDiagnosticEvent(nowIso) {
  const evaluated = evaluateObservations({
    nowIso,
    observations: [{
      signalId: "system_resource_health",
      status: "failed",
      severity: "H1",
      errorCode: "system_resource_degraded",
      count: 1,
      metadata: {
        overallStatus: "degraded",
        cpuOverallPercent: 164,
        cpuSustainedPercent: 159,
        cpuCoreCount: 16,
        memoryPercentUsed: 54,
        diskMaxPercentUsed: 65,
        serviceIssueCount: 0,
        failingSignalCount: 1,
        failingSignalIds: "system_cpu_load",
        failingCategories: "host_cpu",
      },
    }],
  });
  return evaluated.diagnosticEvents[0];
}

function buildFeatureRequestDiagnosticEvent(nowIso) {
  return {
    plugin_id: "home-ai",
    source_surface: "host-conversation",
    diagnostic_type: "capability_gap",
    category: "pptx_generation_request",
    severity_hint: "H2",
    evidence_confidence: 0.82,
    error_code: "requested_new_capability",
    build_id: SIGNAL_MATRIX_VERSION,
    route: "/tasks",
    counts: {
      requested_capability_count: 1,
    },
    context: {
      request_kind: "feature_or_capability_request",
      capability: "pptx_generation",
      owner_gate_required: true,
    },
    breadcrumbs: [{
      kind: "home_ai_request",
      code: "capability_gap_requested",
      status: "owner_gated",
      fields: {
        source: "host-conversation",
        bounded: true,
      },
    }],
    created_at: nowIso,
  };
}

function submitResultFromNotification(ingestResult = {}, notification = {}) {
  return {
    ok: ingestResult.ok === true && notification?.ok !== false,
    status: 202,
    case_id: clean(ingestResult.case_id, 160),
    event_id: clean(ingestResult.event_id, 160),
    owner_notified: Boolean(notification?.notified),
    auto_dispatched: Boolean(notification?.autoDispatched),
    task_card_id: clean(notification?.taskCardResult?.cardIds?.[0], 160),
    reason: clean(notification?.reason || notification?.error || "", 160),
  };
}

function publicCaseSummary(caseRecord = {}) {
  return {
    case_id: clean(caseRecord.case_id, 160),
    status: clean(caseRecord.status, 80),
    severity: clean(caseRecord.severity, 20),
    event_count: Number(caseRecord.event_count || 0),
    plugin_id: clean(caseRecord.plugin_id, 80),
    source_surface: clean(caseRecord.source_surface, 120),
    diagnostic_type: clean(caseRecord.diagnostic_type, 120),
    category: clean(caseRecord.category, 120),
    latest_event_id: clean(caseRecord.latest_event_id, 160),
  };
}

function publicTaskCardSummary(input = {}) {
  return {
    title: clean(input.title, 180),
    summary: clean(input.summary, 240),
    targetThreadTitle: clean(input.targetThreadTitle, 180),
    targetThreadTitlePrefix: clean(input.targetThreadTitlePrefix, 180),
    targetWorkspace: clean(input.targetWorkspace, 400),
    workflowMode: clean(input.workflowMode, 40),
    reasoningEffort: clean(input.reasoningEffort, 40),
    requestId: clean(input.requestId, 200),
  };
}

async function runSelfCheckDiagnosticSubmitSmoke(options = {}) {
  const nowIso = clean(options.nowIso || "2026-07-01T00:00:00.000Z", 80);
  const dataDir = clean(options.dataDir || "", 500) || tempDataDir();
  const cleanup = options.cleanup !== false && !options.dataDir;
  const taskCards = [];
  const inboxItems = [];
  const taskCardService = {
    async sendTaskCard(input = {}) {
      const item = publicTaskCardSummary(input);
      taskCards.push(item);
      return {
        ok: true,
        cardIds: [`ttc_smoke_${taskCards.length}`],
        cards: [{ id: `ttc_smoke_${taskCards.length}` }],
      };
    },
  };
  const actionInboxService = {
    async upsertSourceItem(input = {}) {
      const item = {
        id: `ainb_smoke_${inboxItems.length + 1}`,
        title: clean(input.title, 180),
        sourceType: clean(input.sourceType, 80),
        sourceId: clean(input.sourceId, 160),
        priority: clean(input.priority, 40),
        actionLabel: clean(input.actionLabel, 80),
      };
      inboxItems.push(item);
      return {
        ok: true,
        item,
        event: { id: `ainevt_smoke_${inboxItems.length}` },
      };
    },
  };

  const diagnosticIntakeService = createAiOpsDiagnosticIntakeService({
    dataDir,
    hashSalt: "homeai-self-check-diagnostic-submit-smoke",
    nowIso: () => nowIso,
  });
  const remediationWorkflow = createAiOpsDiagnosticRemediationWorkflowService({
    diagnosticIntakeService,
    actionInboxService,
    taskCardService,
  });

  try {
    const selfCheckEvents = [
      buildSelfCheckDiagnosticEvent(nowIso),
      buildSystemResourceDiagnosticEvent(nowIso),
    ];
    const selfCheckSubmitResults = [];
    const selfCheckCases = [];
    const selfCheckEventCounts = [];
    for (const event of selfCheckEvents) {
      const ingest = diagnosticIntakeService.ingestEvent(event, { workspaceId: SMOKE_WORKSPACE });
      const notification = await remediationWorkflow.notifyOwner({ case_id: ingest.case_id });
      selfCheckSubmitResults.push(submitResultFromNotification(ingest, notification));
      selfCheckCases.push(diagnosticIntakeService.getCase(ingest.case_id));
      selfCheckEventCounts.push(diagnosticIntakeService.listEvents({ case_id: ingest.case_id, limit: 5 }).events.length);
    }
    const diagnosticSubmitClosure = buildDiagnosticSubmitClosureReport({
      enabled: true,
      events: selfCheckEvents,
      submitResults: selfCheckSubmitResults,
    });

    const featureEvent = buildFeatureRequestDiagnosticEvent(nowIso);
    const featureIngest = diagnosticIntakeService.ingestEvent(featureEvent, { workspaceId: "owner" });
    const featureNotification = await remediationWorkflow.notifyOwner({ case_id: featureIngest.case_id });

    const featureCase = diagnosticIntakeService.getCase(featureIngest.case_id);
    const featureEvents = diagnosticIntakeService.listEvents({ case_id: featureIngest.case_id, limit: 5 }).events;

    const selfCheckClosed = diagnosticSubmitClosure.ok
      && selfCheckSubmitResults.every((result) => result.auto_dispatched && Boolean(result.task_card_id))
      && taskCards.length === selfCheckEvents.length
      && selfCheckCases.every((caseRecord) => caseRecord?.status === "card_sent")
      && selfCheckEventCounts.every((count) => count === 1);
    const featureOwnerGated = featureNotification?.notified === true
      && featureNotification?.autoDispatched !== true
      && featureNotification?.plan?.dispatch?.ownerApprovalRequired === true
      && featureNotification?.plan?.dispatch?.policy === "owner_gated"
      && taskCards.length === selfCheckEvents.length
      && inboxItems.length === 1
      && featureEvents.length === 1;

    return {
      ok: selfCheckClosed && featureOwnerGated,
      schemaVersion: 1,
      modelVersion: SMOKE_MODEL_VERSION,
      matrixVersion: SIGNAL_MATRIX_VERSION,
      generatedAt: nowIso,
      mode: "source_safe_temp_store",
      externalMutation: false,
      taskCardDispatchMode: "fake_codex_task_card_service",
      actionInboxMode: "fake_owner_action_inbox_service",
      selfCheck: {
        ok: selfCheckClosed,
        submitClosure: diagnosticSubmitClosure,
        cases: selfCheckCases.map(publicCaseSummary),
        results: selfCheckSubmitResults,
        taskCardCount: taskCards.length,
      },
      featureRequestGate: {
        ok: featureOwnerGated,
        ownerNotified: Boolean(featureNotification?.notified),
        autoDispatched: Boolean(featureNotification?.autoDispatched),
        dispatchPolicy: clean(featureNotification?.plan?.dispatch?.policy, 80),
        ownerApprovalRequired: Boolean(featureNotification?.plan?.dispatch?.ownerApprovalRequired),
        case: publicCaseSummary(featureCase),
        inboxItemCount: inboxItems.length,
      },
      boundedArtifacts: {
        dataDirCreated: Boolean(dataDir),
        cleanup,
        taskCards,
        inboxItems,
      },
      privacy: {
        outputPolicy: "bounded metadata only",
        rawSecretsIncluded: false,
        rawPromptsIncluded: false,
        rawLogsIncluded: false,
      },
    };
  } finally {
    diagnosticIntakeService.close();
    if (cleanup) fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

module.exports = {
  SMOKE_MODEL_VERSION,
  buildFeatureRequestDiagnosticEvent,
  buildSelfCheckDiagnosticEvent,
  buildSystemResourceDiagnosticEvent,
  runSelfCheckDiagnosticSubmitSmoke,
};
