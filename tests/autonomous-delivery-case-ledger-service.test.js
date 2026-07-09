"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { createMobileSqliteStore } = require("../adapters/mobile-sqlite-store");
const {
  appendDuplicateCaseObservation,
  buildAutonomousDeliveryStatusSummary,
  createAutonomousDeliveryCaseLedgerService,
  deriveAutonomousDeliveryCaseIdentity,
  initialCaseLedger,
} = require("../adapters/autonomous-delivery-case-ledger-service");

function tempStore() {
  return createMobileSqliteStore({
    dbPath: path.join(os.tmpdir(), `homeai-case-ledger-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite3`),
  });
}

function testStableIdentityPrefersSourceRequest() {
  const first = deriveAutonomousDeliveryCaseIdentity({
    requestId: "pcr_home-ai_duplicate",
    text: "first wording",
  }, {
    objective: "first wording",
    mode: "delivery",
    risk: "medium",
  });
  const second = deriveAutonomousDeliveryCaseIdentity({
    requestId: "pcr_home-ai_duplicate",
    text: "second wording",
  }, {
    objective: "second wording",
    mode: "delivery",
    risk: "medium",
  });
  assert.equal(first.caseId, second.caseId);
  assert.equal(first.idempotencySource, "request");
  assert.match(first.caseId, /^delivery_[a-f0-9]{24}$/);
  assert.doesNotMatch(JSON.stringify(first), /first wording|second wording/);
}

function testDuplicateObservationAndStatusSummary() {
  const store = tempStore();
  const identity = deriveAutonomousDeliveryCaseIdentity({
    diagnosticCaseId: "diagcase_duplicate_1",
    text: "repair duplicate dispatch",
  }, {
    objective: "repair duplicate dispatch",
    mode: "delivery",
    risk: "medium",
  });
  const createdAt = "2026-07-03T00:00:00.000Z";
  const duplicateAt = "2026-07-03T00:05:00.000Z";
  store.upsertAutonomousDeliveryCase({
    caseId: identity.caseId,
    workspaceId: "owner",
    objective: "repair duplicate dispatch",
    mode: "delivery",
    risk: "medium",
    status: "running",
    rawJson: {
      deliveryLedger: initialCaseLedger(identity, createdAt),
    },
    createdAt,
    updatedAt: createdAt,
  });
  const caseRecord = store.getAutonomousDeliveryCase(identity.caseId);
  store.upsertAutonomousDeliveryCase(Object.assign({}, caseRecord, {
    rawJson: Object.assign({}, caseRecord, {
      deliveryLedger: appendDuplicateCaseObservation(caseRecord.deliveryLedger, identity, duplicateAt),
    }),
    updatedAt: duplicateAt,
  }));
  store.addAutonomousDeliveryEvent({
    caseId: identity.caseId,
    eventType: "case_duplicate_observed",
    payload: { idempotencyHash: identity.idempotencyHash, ownerPromptSuppressed: true },
    createdAt: duplicateAt,
  });
  store.upsertAutonomousDeliverySlice({
    sliceId: `${identity.caseId}_implement_home_ai`,
    caseId: identity.caseId,
    workspaceId: "owner",
    sliceKey: "implement_home_ai",
    ownerLayer: "home_ai_workspace",
    targetWorkspaceId: "home-ai",
    targetWorkspacePath: "/Users/example/path",
    status: "dispatched",
    dispatchStatus: "sent",
    taskCardId: "ttc_1",
    createdAt,
    updatedAt: duplicateAt,
  });

  const service = createAutonomousDeliveryCaseLedgerService({
    store,
    nowIso: () => "2026-07-03T00:10:00.000Z",
  });
  const summary = service.statusSummary({ workspaceId: "owner" });
  assert.equal(summary.status, "warning");
  assert.equal(summary.counts.open, 1);
  assert.equal(summary.counts.dispatched, 1);
  assert.equal(summary.counts.waitingReturn, 1);
  assert.equal(summary.counts.duplicateSuppressed, 1);
  assert.equal(summary.items[0].caseId, identity.caseId);
  assert.doesNotMatch(JSON.stringify(summary), /must-not-leak/);
}

function testPureSummaryClassifiesBlockedAndClosedCases() {
  const summary = buildAutonomousDeliveryStatusSummary({
    generatedAt: "2026-07-03T00:00:00.000Z",
    workspaceId: "owner",
    cases: [
      { caseId: "delivery_blocked", workspaceId: "owner", status: "blocked", updatedAt: "2026-07-03T00:01:00.000Z" },
      { caseId: "delivery_done", workspaceId: "owner", status: "completed", updatedAt: "2026-07-03T00:02:00.000Z" },
    ],
    slices: [
      { caseId: "delivery_blocked", sliceId: "slice_1", dispatchStatus: "failed", blockedReason: "target_thread_not_visible" },
    ],
  });
  assert.equal(summary.status, "degraded");
  assert.equal(summary.counts.blocked, 1);
  assert.equal(summary.counts.verifiedClosed, 1);
}

testStableIdentityPrefersSourceRequest();
testDuplicateObservationAndStatusSummary();
testPureSummaryClassifiesBlockedAndClosedCases();
console.log("autonomous delivery case ledger service tests passed");
