"use strict";

const crypto = require("node:crypto");

const DEFAULT_OWNER_WORKSPACE_ID = "owner";

const OPEN_CASE_STATUSES = Object.freeze([
  "decision_waiting",
  "ready_to_start",
  "running",
  "verification_waiting",
  "verification_dispatched",
  "deployment_waiting",
  "deployment_dispatched",
  "repair_waiting",
  "repair_dispatched",
  "verified_waiting",
]);

const CLOSED_CASE_STATUSES = Object.freeze(["completed", "closed"]);
const BLOCKED_CASE_STATUSES = Object.freeze(["blocked", "rejected"]);
const WAITING_RETURN_DISPATCH_STATUSES = Object.freeze(["sent", "return_stale"]);

function clean(value, max = 240) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 240));
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function stableJson(value) {
  if (value == null) return "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value, chars = 20) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, chars);
}

function safeToken(value, fallback = "delivery", max = 120) {
  const text = clean(value, max).toLowerCase().replace(/[^a-z0-9._:-]+/g, "_").replace(/^_+|_+$/g, "");
  return text || fallback;
}

function firstSourceCandidate(input = {}, intent = {}) {
  const sourceRef = objectValue(input.sourceRef || input.source_ref);
  const entries = [
    ["explicit_case", input.caseId || input.case_id],
    ["diagnostic_case", input.diagnosticCaseId || input.diagnostic_case_id || sourceRef.diagnosticCaseId || sourceRef.diagnostic_case_id || sourceRef.diagnostic_case || sourceRef.case_id],
    ["request", input.requestId || input.request_id || input.sourceRequestId || input.source_request_id || sourceRef.requestId || sourceRef.request_id || sourceRef.sourceRequestId || sourceRef.source_request_id],
    ["workflow", input.workflowId || input.workflow_id || sourceRef.workflowId || sourceRef.workflow_id],
    ["task_card", input.taskCardId || input.task_card_id || sourceRef.taskCardId || sourceRef.task_card_id],
    ["event_hash", input.eventHash || input.event_hash || sourceRef.eventHash || sourceRef.event_hash],
    ["source_signature", input.sourceSignature || input.source_signature || sourceRef.sourceSignature || sourceRef.source_signature],
    ["intent", input.intentId || input.intent_id || intent.id],
  ];
  const found = entries.find(([, value]) => clean(value, 220));
  if (found) return { source: found[0], value: clean(found[1], 220) };
  const signature = {
    objective: clean(intent.objective || input.text || input.objective || input.requirement || "", 1200),
    mode: clean(intent.mode || input.mode || "", 40),
    risk: clean(intent.risk || input.risk || "", 40),
    workspaces: arrayValue(intent.targetWorkspaces || input.workspaces || input.workspaceIds)
      .map((item) => clean(item?.id || item, 120))
      .filter(Boolean)
      .sort(),
  };
  return { source: "bounded_signature", value: stableJson(signature) };
}

function deriveAutonomousDeliveryCaseIdentity(input = {}, intent = {}) {
  const candidate = firstSourceCandidate(input, intent);
  const idempotencyHash = digest(`${candidate.source}:${candidate.value}`, 24);
  const explicitCaseId = clean(input.caseId || input.case_id, 160);
  return {
    caseId: explicitCaseId || `delivery_${idempotencyHash}`,
    idempotencySource: candidate.source,
    idempotencyHash,
    idempotencyRef: `${candidate.source}:${idempotencyHash}`,
    sourceSignatureHash: candidate.source === "bounded_signature" ? idempotencyHash : digest(candidate.value, 16),
  };
}

function initialCaseLedger(identity = {}, now = "") {
  return {
    idempotencySource: clean(identity.idempotencySource, 80),
    idempotencyHash: clean(identity.idempotencyHash, 80),
    idempotencyRef: clean(identity.idempotencyRef, 120),
    sourceSignatureHash: clean(identity.sourceSignatureHash, 80),
    duplicateCount: 0,
    duplicateSuppressedCount: 0,
    duplicateDispatchSuppressedCount: 0,
    createdAt: clean(now, 80),
    lastObservedAt: clean(now, 80),
    policy: {
      stableIdempotency: true,
      duplicateCreatesSuppressOwnerPrompt: true,
      boundedMetadataOnly: true,
    },
  };
}

function appendDuplicateCaseObservation(existingLedger = {}, identity = {}, observedAt = "") {
  const previous = objectValue(existingLedger);
  const duplicateCount = Number(previous.duplicateCount || 0) + 1;
  const duplicateSuppressedCount = Number(previous.duplicateSuppressedCount || 0) + 1;
  return Object.assign({}, previous, {
    idempotencySource: clean(previous.idempotencySource || identity.idempotencySource, 80),
    idempotencyHash: clean(previous.idempotencyHash || identity.idempotencyHash, 80),
    idempotencyRef: clean(previous.idempotencyRef || identity.idempotencyRef, 120),
    sourceSignatureHash: clean(previous.sourceSignatureHash || identity.sourceSignatureHash, 80),
    duplicateCount,
    duplicateSuppressedCount,
    lastDuplicateAt: clean(observedAt, 80),
    lastObservedAt: clean(observedAt, 80),
    policy: Object.assign({
      stableIdempotency: true,
      duplicateCreatesSuppressOwnerPrompt: true,
      boundedMetadataOnly: true,
    }, objectValue(previous.policy)),
  });
}

function groupSlicesByCase(slices = []) {
  const grouped = new Map();
  for (const slice of arrayValue(slices)) {
    const caseId = clean(slice.caseId || slice.case_id, 160);
    if (!caseId) continue;
    if (!grouped.has(caseId)) grouped.set(caseId, []);
    grouped.get(caseId).push(slice);
  }
  return grouped;
}

function groupEventsByCase(events = [], eventsByCase = {}) {
  const grouped = new Map();
  for (const [caseId, caseEvents] of Object.entries(objectValue(eventsByCase))) {
    grouped.set(clean(caseId, 160), arrayValue(caseEvents));
  }
  for (const event of arrayValue(events)) {
    const caseId = clean(event.caseId || event.case_id, 160);
    if (!caseId) continue;
    if (!grouped.has(caseId)) grouped.set(caseId, []);
    grouped.get(caseId).push(event);
  }
  return grouped;
}

function statusBucketForCase(deliveryCase = {}, slices = [], events = []) {
  const status = clean(deliveryCase.status, 80);
  const dispatchStatuses = slices.map((slice) => clean(slice.dispatchStatus || slice.dispatch_status, 80));
  const sliceStatuses = slices.map((slice) => clean(slice.status, 80));
  const duplicateLedger = objectValue(deliveryCase.deliveryLedger || deliveryCase.delivery_ledger);
  const duplicateEvent = events.some((event) => /duplicate/.test(clean(event.eventType || event.event_type, 120)));
  const duplicateSuppressed = Number(duplicateLedger.duplicateSuppressedCount || duplicateLedger.duplicateCount || 0) > 0 || duplicateEvent;
  const waitingReturn = dispatchStatuses.some((item) => WAITING_RETURN_DISPATCH_STATUSES.includes(item));
  const dispatched = dispatchStatuses.some((item) => ["dispatching", "sent", "return_stale"].includes(item));
  const blocked = BLOCKED_CASE_STATUSES.includes(status)
    || dispatchStatuses.some((item) => ["failed", "blocked", "return_stale"].includes(item))
    || sliceStatuses.some((item) => ["blocked", "rejected"].includes(item));
  const verifiedClosed = CLOSED_CASE_STATUSES.includes(status);
  const open = OPEN_CASE_STATUSES.includes(status) || (!verifiedClosed && !blocked);
  return {
    open,
    dispatched,
    waitingReturn,
    blocked,
    duplicateSuppressed,
    verifiedClosed,
  };
}

function deliveryLoopOverallStatus(counts = {}) {
  if (Number(counts.blocked || 0) > 0) return "degraded";
  if (Number(counts.waitingReturn || 0) > 0) return "warning";
  if (Number(counts.dispatched || 0) > 0) return "warning";
  return "ok";
}

function publicLoopItem(deliveryCase = {}, bucket = {}, slices = []) {
  const firstAttentionSlice = slices.find((slice) => {
    const dispatchStatus = clean(slice.dispatchStatus || slice.dispatch_status, 80);
    return ["failed", "return_stale", "sent", "dispatching"].includes(dispatchStatus);
  }) || slices[0] || {};
  return {
    caseId: clean(deliveryCase.caseId || deliveryCase.case_id, 160),
    status: clean(deliveryCase.status, 80),
    objective: clean(deliveryCase.objective, 220),
    mode: clean(deliveryCase.mode, 40),
    risk: clean(deliveryCase.risk, 40),
    bucket,
    attentionSliceId: clean(firstAttentionSlice.sliceId || firstAttentionSlice.slice_id, 160),
    attentionSliceKey: clean(firstAttentionSlice.sliceKey || firstAttentionSlice.slice_key, 120),
    dispatchStatus: clean(firstAttentionSlice.dispatchStatus || firstAttentionSlice.dispatch_status, 80),
    blockedReason: clean(firstAttentionSlice.blockedReason || firstAttentionSlice.blocked_reason, 160),
    taskCardId: clean(firstAttentionSlice.taskCardId || firstAttentionSlice.task_card_id, 160),
    updatedAt: clean(deliveryCase.updatedAt || deliveryCase.updated_at, 80),
  };
}

function buildAutonomousDeliveryStatusSummary(input = {}) {
  const cases = arrayValue(input.cases);
  const slicesByCase = groupSlicesByCase(input.slices);
  const eventsByCase = groupEventsByCase(input.events, input.eventsByCase);
  const limit = Math.max(1, Math.min(50, Number(input.limit || 12) || 12));
  const counts = {
    open: 0,
    dispatched: 0,
    waitingReturn: 0,
    blocked: 0,
    duplicateSuppressed: 0,
    verifiedClosed: 0,
  };
  const items = cases.map((deliveryCase) => {
    const caseId = clean(deliveryCase.caseId || deliveryCase.case_id, 160);
    const caseSlices = slicesByCase.get(caseId) || [];
    const caseEvents = eventsByCase.get(caseId) || [];
    const bucket = statusBucketForCase(deliveryCase, caseSlices, caseEvents);
    for (const [key, active] of Object.entries(bucket)) {
      if (active && Object.hasOwn(counts, key)) counts[key] += 1;
    }
    return publicLoopItem(deliveryCase, bucket, caseSlices);
  }).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  const status = deliveryLoopOverallStatus(counts);
  return {
    ok: status === "ok",
    schemaVersion: 1,
    generatedAt: clean(input.generatedAt || new Date().toISOString(), 80),
    workspaceId: clean(input.workspaceId || DEFAULT_OWNER_WORKSPACE_ID, 120) || DEFAULT_OWNER_WORKSPACE_ID,
    status,
    counts,
    itemCount: Math.min(items.length, limit),
    items: items.slice(0, limit),
    source: { name: "autonomous-delivery-case-ledger", storage: "sqlite" },
    policy: {
      ownerVisible: true,
      boundedMetadataOnly: true,
      duplicateSuppressionVisible: true,
      terminalReturnRequiredForClosure: true,
    },
  };
}

function createAutonomousDeliveryCaseLedgerService(options = {}) {
  const store = options.store;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();

  function requireStore() {
    const currentStore = typeof store === "function" ? store() : store;
    if (!currentStore || typeof currentStore.listAutonomousDeliveryCases !== "function") {
      throw new Error("autonomous delivery case ledger service requires mobile sqlite store");
    }
    return currentStore;
  }

  function statusSummary(input = {}) {
    const currentStore = requireStore();
    const workspaceId = clean(input.workspaceId || input.workspace_id || DEFAULT_OWNER_WORKSPACE_ID, 120) || DEFAULT_OWNER_WORKSPACE_ID;
    const cases = currentStore.listAutonomousDeliveryCases({ workspaceId, limit: input.caseLimit || 200 });
    const slices = [];
    const eventsByCase = {};
    for (const deliveryCase of cases) {
      const caseId = clean(deliveryCase.caseId, 160);
      slices.push(...currentStore.listAutonomousDeliverySlices({ caseId, limit: 500 }));
      if (typeof currentStore.listAutonomousDeliveryEvents === "function") {
        eventsByCase[caseId] = currentStore.listAutonomousDeliveryEvents({ caseId, limit: 50 });
      }
    }
    return buildAutonomousDeliveryStatusSummary({
      cases,
      slices,
      eventsByCase,
      generatedAt: nowIso(),
      workspaceId,
      limit: input.limit,
    });
  }

  return Object.freeze({
    statusSummary,
  });
}

module.exports = {
  appendDuplicateCaseObservation,
  buildAutonomousDeliveryStatusSummary,
  createAutonomousDeliveryCaseLedgerService,
  deriveAutonomousDeliveryCaseIdentity,
  initialCaseLedger,
  statusBucketForCase,
};
