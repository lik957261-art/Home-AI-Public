"use strict";

const crypto = require("node:crypto");

const DEFAULT_SOURCE_RETURN_INTEGRATION_STALE_MS = 30 * 60 * 1000;
const TERMINAL_SLICE_STATUSES = Object.freeze(["completed", "blocked", "redirected", "rejected", "partially_completed"]);
const INTEGRATED_STATUSES = Object.freeze(["integrated", "ignored", "closed"]);
const INACTIVE_SOURCE_THREAD_STATUSES = Object.freeze(["completed", "resting", "inactive", "hidden", "idle"]);

function clean(value, max = 240) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 240));
}

function parseIsoMs(value) {
  const parsed = Date.parse(clean(value || "", 100));
  return Number.isFinite(parsed) ? parsed : 0;
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueCleanList(value = [], maxItems = 12, max = 120) {
  return [...new Set(arrayValue(value).map((item) => clean(item, max)).filter(Boolean))].slice(0, maxItems);
}

function sha(value = "") {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

function sourceActivationIdFor(input = {}) {
  return `sra_${sha([
    input.caseId,
    input.sliceId,
    input.taskCardId,
    input.returnCardId,
    input.sourceThreadId,
  ].join("|"))}`;
}

function nestedMetadata(input = {}) {
  return objectValue(input.metadata || input.meta);
}

function nestedReturnCardEvent(input = {}) {
  return objectValue(input.returnCardEvent || input.return_card_event);
}

function sourceActivationForReturn(input = {}) {
  const metadata = nestedMetadata(input);
  const event = nestedReturnCardEvent(input);
  const recordedAt = clean(input.recordedAt || input.recorded_at || input.generatedAt || input.generated_at || new Date().toISOString(), 80);
  const pendingSourceActionRequired = Boolean(
    input.pendingSourceActionRequired
      || input.pending_source_action_required
      || clean(input.pendingSourceActionId || input.pending_source_action_id || "", 160),
  );
  const sourceThreadStatus = clean(input.sourceThreadStatus
    || input.source_thread_status
    || input.sourceThreadState
    || input.source_thread_state
    || metadata.sourceThreadStatus
    || metadata.source_thread_status
    || metadata.sourceThreadState
    || metadata.source_thread_state
    || event.sourceThreadStatus
    || event.source_thread_status
    || event.sourceThreadState
    || event.source_thread_state
    || "", 80).toLowerCase();
  const activation = {
    schemaVersion: 1,
    status: pendingSourceActionRequired ? "pending_source_action" : "pending",
    code: pendingSourceActionRequired ? "pending_source_action_required" : "source_thread_activation_required_for_return",
    id: "",
    caseId: clean(input.caseId || input.case_id || "", 160),
    sliceId: clean(input.sliceId || input.slice_id || "", 180),
    sliceKey: clean(input.sliceKey || input.slice_key || "", 160),
    issueCodes: pendingSourceActionRequired
      ? ["source_thread_activation_required_for_return", "pending_source_action_required"]
      : ["source_thread_activation_required_for_return"],
    sourceThreadId: clean(input.sourceThreadId || input.source_thread_id || metadata.sourceThreadId || metadata.source_thread_id || event.sourceThreadId || event.source_thread_id || "", 160),
    sourceThreadStatus,
    sourceThreadRole: clean(input.sourceThreadRole || input.source_thread_role || metadata.sourceThreadRole || metadata.source_thread_role || event.sourceThreadRole || event.source_thread_role || "", 120),
    taskCardId: clean(input.taskCardId || input.task_card_id || input.originalTaskCardId || input.original_task_card_id || "", 160),
    returnCardId: clean(input.returnCardId || input.return_card_id || "", 160),
    returnStatus: clean(input.returnStatus || input.return_status || input.status || "", 80),
    activationKind: pendingSourceActionRequired ? "pending_source_action" : "terminal_return_receipt",
    sourceThreadWasInactive: INACTIVE_SOURCE_THREAD_STATUSES.includes(sourceThreadStatus),
    required: true,
    ownerVisible: true,
    boundedMetadataOnly: true,
    duplicateSafe: true,
    recordedAt,
    updatedAt: recordedAt,
    recommendedAction: pendingSourceActionRequired
      ? "resolve_pending_source_action_before_closure"
      : "project_terminal_return_receipt_to_source_thread",
  };
  activation.id = sourceActivationIdFor(activation);
  return activation;
}

function sourceActivationProjection(activation = {}) {
  const current = objectValue(activation);
  if (!current.id) return {};
  return {
    id: clean(current.id, 80),
    status: clean(current.status || "", 80),
    code: clean(current.code || "", 120),
    activationKind: clean(current.activationKind || "", 80),
    caseId: clean(current.caseId || "", 160),
    sliceId: clean(current.sliceId || "", 180),
    sliceKey: clean(current.sliceKey || "", 160),
    issueCodes: uniqueCleanList(current.issueCodes, 8, 120),
    sourceThreadId: clean(current.sourceThreadId || "", 160),
    sourceThreadStatus: clean(current.sourceThreadStatus || "", 80),
    sourceThreadWasInactive: Boolean(current.sourceThreadWasInactive),
    taskCardId: clean(current.taskCardId || "", 160),
    returnCardId: clean(current.returnCardId || "", 160),
    ownerVisible: current.ownerVisible !== false,
    boundedMetadataOnly: current.boundedMetadataOnly !== false,
    recommendedAction: clean(current.recommendedAction || "", 180),
  };
}

function staleSourceActivation(currentActivation = {}, item = {}, detectedAt = "") {
  const base = objectValue(currentActivation);
  const now = clean(detectedAt || new Date().toISOString(), 80);
  const issueCodes = uniqueCleanList([
    ...arrayValue(base.issueCodes),
    "return_projection_missing_after_terminal_return",
  ], 10, 120);
  const activation = Object.assign({}, base.id ? base : sourceActivationForReturn(Object.assign({}, item, {
    recordedAt: item.recordedAt || item.updatedAt || now,
  })), {
    status: "projection_missing",
    code: "return_projection_missing_after_terminal_return",
    issueCodes,
    updatedAt: now,
    detectedAt: now,
    recommendedAction: "activate_source_thread_or_record_bounded_remediation_item",
  });
  activation.id = activation.id || sourceActivationIdFor(activation);
  return activation;
}

function boundedSourceReturnIntegrationStaleMs(input = {}, options = {}) {
  const raw = input.staleAfterMs
    ?? input.stale_after_ms
    ?? options.sourceReturnIntegrationStaleMs
    ?? DEFAULT_SOURCE_RETURN_INTEGRATION_STALE_MS;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric < 0) return DEFAULT_SOURCE_RETURN_INTEGRATION_STALE_MS;
  return Math.min(7 * 24 * 60 * 60 * 1000, numeric);
}

function sourceReturnIntegrationForReturn(input = {}) {
  const recordedAt = clean(input.recordedAt || input.recorded_at || input.generatedAt || input.generated_at || new Date().toISOString(), 80);
  const sourceActivation = sourceActivationForReturn(Object.assign({}, input, { recordedAt }));
  return {
    schemaVersion: 1,
    status: "pending",
    code: "source_return_integration_pending",
    caseId: clean(input.caseId || input.case_id || "", 160),
    sliceId: clean(input.sliceId || input.slice_id || "", 180),
    sliceKey: clean(input.sliceKey || input.slice_key || "", 160),
    taskCardId: clean(input.taskCardId || input.task_card_id || input.originalTaskCardId || input.original_task_card_id || "", 160),
    returnCardId: clean(input.returnCardId || input.return_card_id || "", 160),
    returnStatus: clean(input.returnStatus || input.return_status || input.status || "", 80),
    recordedAt,
    updatedAt: recordedAt,
    recommendedAction: "integrate_return_receipt_into_source_ledger_handoff_or_next_step_queue",
    sourceActivation,
    sourceActivationProjection: sourceActivationProjection(sourceActivation),
    counts: {
      returnCard: clean(input.returnCardId || input.return_card_id || "", 160) ? 1 : 0,
      taskCard: clean(input.taskCardId || input.task_card_id || input.originalTaskCardId || input.original_task_card_id || "", 160) ? 1 : 0,
      sourceActivation: 1,
    },
  };
}

function isSourceReturnIntegrationCandidate(slice = {}) {
  const status = clean(slice.status || slice.sliceStatus || "", 80);
  const returnCardId = clean(slice.returnCardId || slice.return_card_id || "", 160);
  if (!TERMINAL_SLICE_STATUSES.includes(status)) return false;
  if (!returnCardId) return false;
  const integration = objectValue(slice.sourceReturnIntegration || slice.source_return_integration);
  const integrationStatus = clean(integration.status || "", 80);
  return !INTEGRATED_STATUSES.includes(integrationStatus);
}

function sourceReturnIntegrationItemForSlice(slice = {}, nowMs = Date.now(), staleAfterMs = DEFAULT_SOURCE_RETURN_INTEGRATION_STALE_MS) {
  const integration = objectValue(slice.sourceReturnIntegration || slice.source_return_integration);
  const integrationStatus = clean(integration.status || "pending", 80) || "pending";
  const sourceActivation = objectValue(integration.sourceActivation || integration.source_activation);
  const pendingSourceAction = objectValue(integration.pendingSourceAction || integration.pending_source_action);
  const recordedAt = clean(integration.recordedAt || slice.completedAt || slice.completed_at || slice.updatedAt || slice.updated_at || "", 80);
  const referenceMs = parseIsoMs(integration.updatedAt || integration.updated_at)
    || parseIsoMs(recordedAt)
    || parseIsoMs(slice.completedAt || slice.completed_at)
    || parseIsoMs(slice.updatedAt || slice.updated_at)
    || parseIsoMs(slice.createdAt || slice.created_at);
  const ageMs = referenceMs ? Math.max(0, nowMs - referenceMs) : 0;
  const alreadyMarked = integrationStatus === "stale";
  const stale = alreadyMarked || (referenceMs && ageMs >= staleAfterMs);
  const code = stale ? "source_return_integration_stale" : "source_return_integration_pending";
  return {
    caseId: clean(slice.caseId || slice.case_id || integration.caseId || integration.case_id || "", 160),
    sliceId: clean(slice.sliceId || slice.slice_id || integration.sliceId || integration.slice_id || "", 180),
    sliceKey: clean(slice.sliceKey || slice.slice_key || integration.sliceKey || integration.slice_key || "", 160),
    ownerLayer: clean(slice.ownerLayer || slice.owner_layer || "", 120),
    targetWorkspaceId: clean(slice.targetWorkspaceId || slice.target_workspace_id || "", 120),
    status: clean(slice.status || "", 80),
    caseStatus: clean(slice.caseStatus || slice.case_status || "", 80),
    taskCardId: clean(slice.taskCardId || slice.task_card_id || integration.taskCardId || integration.task_card_id || "", 160),
    returnCardId: clean(slice.returnCardId || slice.return_card_id || integration.returnCardId || integration.return_card_id || "", 160),
    integrationStatus,
    ageMs,
    ageMinutes: Math.floor(ageMs / 60000),
    staleAfterMs,
    stale: Boolean(stale),
    alreadyMarked,
    code,
    recommendedAction: stale
      ? "review_source_scheduler_integration_then_mark_disposition_without_redispatch"
      : clean(integration.recommendedAction || "integrate_return_receipt_into_source_ledger_handoff_or_next_step_queue", 180),
    sourceActivationStatus: clean(sourceActivation.status || "", 80),
    sourceActivationCode: clean(sourceActivation.code || "", 120),
    sourceActivationIssueCodes: uniqueCleanList(sourceActivation.issueCodes, 8, 120),
    sourceThreadId: clean(sourceActivation.sourceThreadId || "", 160),
    sourceThreadStatus: clean(sourceActivation.sourceThreadStatus || "", 80),
    sourceThreadWasInactive: Boolean(sourceActivation.sourceThreadWasInactive),
    pendingSourceActionStatus: clean(pendingSourceAction.status || "", 80),
    pendingSourceActionType: clean(pendingSourceAction.actionType || "", 80),
    pendingSourceActionIssueCode: clean(pendingSourceAction.issueCode || "", 120),
    recordedAt,
    updatedAt: clean(integration.updatedAt || slice.updatedAt || slice.updated_at || "", 80),
  };
}

function buildSourceReturnIntegrationSummary(input = {}) {
  const staleAfterMs = boundedSourceReturnIntegrationStaleMs(input, input.options || {});
  const now = clean(input.generatedAt || input.nowIso || new Date().toISOString(), 80);
  const nowMs = parseIsoMs(now) || Date.now();
  const workspaceId = clean(input.workspaceId || input.workspace_id || "owner", 120) || "owner";
  const limit = Math.max(1, Math.min(100, Number(input.limit || 50) || 50));
  const items = (Array.isArray(input.slices) ? input.slices : [])
    .filter((slice) => !workspaceId || clean(slice.workspaceId || slice.workspace_id || "owner", 120) === workspaceId)
    .filter(isSourceReturnIntegrationCandidate)
    .map((slice) => sourceReturnIntegrationItemForSlice(slice, nowMs, staleAfterMs));
  const staleItems = items.filter((item) => item.stale);
  const counts = {
    tracked: items.length,
    pending: items.length - staleItems.length,
    stale: staleItems.length,
    alreadyMarked: items.filter((item) => item.alreadyMarked).length,
  };
  return {
    ok: true,
    schemaVersion: 1,
    generatedAt: now,
    status: counts.stale ? "degraded" : "ok",
    workspaceId,
    staleAfterMs,
    counts,
    itemCount: Math.min(items.length, limit),
    items: items
      .sort((a, b) => Number(b.stale) - Number(a.stale) || b.ageMs - a.ageMs)
      .slice(0, limit),
    source: { name: "source-return-integration-watchdog-service", storage: "sqlite" },
    policy: {
      ownerVisible: true,
      boundedMetadataOnly: true,
      noAutoRetry: true,
      noClosureFabrication: true,
      complementsReturnWatchdog: true,
    },
  };
}

function sourceReturnIntegrationStalePatch(item = {}, summary = {}, detectedAt = "", currentIntegration = {}) {
  const current = objectValue(currentIntegration);
  const currentPendingSourceAction = objectValue(current.pendingSourceAction || current.pending_source_action);
  const currentPendingSourceActionProjection = objectValue(current.pendingSourceActionProjection || current.pending_source_action_projection);
  const sourceActivation = staleSourceActivation(current.sourceActivation || current.source_activation, item, detectedAt || summary.generatedAt || new Date().toISOString());
  const patch = {
    schemaVersion: 1,
    status: "stale",
    code: "source_return_integration_stale",
    caseId: clean(item.caseId || "", 160),
    sliceId: clean(item.sliceId || "", 180),
    sliceKey: clean(item.sliceKey || "", 160),
    taskCardId: clean(item.taskCardId || "", 160),
    returnCardId: clean(item.returnCardId || "", 160),
    returnStatus: clean(item.status || "", 80),
    staleAfterMs: Number(summary.staleAfterMs || item.staleAfterMs || DEFAULT_SOURCE_RETURN_INTEGRATION_STALE_MS),
    ageMs: Number(item.ageMs || 0) || 0,
    detectedAt: clean(detectedAt || summary.generatedAt || new Date().toISOString(), 80),
    updatedAt: clean(detectedAt || summary.generatedAt || new Date().toISOString(), 80),
    recommendedAction: "review_source_scheduler_integration_then_mark_disposition_without_redispatch",
    sourceActivation,
    sourceActivationProjection: sourceActivationProjection(sourceActivation),
    counts: {
      returnCard: clean(item.returnCardId || "", 160) ? 1 : 0,
      taskCard: clean(item.taskCardId || "", 160) ? 1 : 0,
      sourceActivation: 1,
    },
    policy: "no_auto_retry_no_closure_fabrication",
  };
  if (currentPendingSourceAction.id) {
    patch.pendingSourceAction = currentPendingSourceAction;
    patch.pendingSourceActionProjection = currentPendingSourceActionProjection.id
      ? currentPendingSourceActionProjection
      : {};
    patch.counts.pendingSourceAction = 1;
  }
  return {
    sourceReturnIntegration: patch,
  };
}

module.exports = {
  DEFAULT_SOURCE_RETURN_INTEGRATION_STALE_MS,
  boundedSourceReturnIntegrationStaleMs,
  buildSourceReturnIntegrationSummary,
  isSourceReturnIntegrationCandidate,
  sourceActivationForReturn,
  sourceActivationProjection,
  sourceReturnIntegrationForReturn,
  sourceReturnIntegrationItemForSlice,
  sourceReturnIntegrationStalePatch,
};
