"use strict";

const assert = require("node:assert/strict");
const {
  buildReturnWatchdogSummary,
  isReturnWatchdogCandidate,
  returnWatchdogItemForSlice,
  returnWatchdogMarkPatch,
} = require("../adapters/return-watchdog-service");

function testCandidateFiltering() {
  assert.equal(isReturnWatchdogCandidate({
    status: "dispatched",
    dispatchStatus: "sent",
    taskCardId: "ttc_1",
  }), true);
  assert.equal(isReturnWatchdogCandidate({
    status: "completed",
    dispatchStatus: "sent",
    taskCardId: "ttc_1",
  }), false);
  assert.equal(isReturnWatchdogCandidate({
    status: "dispatched",
    dispatchStatus: "sent",
    returnCardId: "ttc_return",
    taskCardId: "ttc_1",
  }), false);
}

function testSummaryMarksStaleOnlyAfterWindow() {
  const summary = buildReturnWatchdogSummary({
    workspaceId: "owner",
    generatedAt: "2026-07-03T05:00:00.000Z",
    staleAfterMs: 60 * 60 * 1000,
    slices: [
      {
        caseId: "delivery_1",
        sliceId: "slice_1",
        workspaceId: "owner",
        status: "dispatched",
        dispatchStatus: "sent",
        taskCardId: "ttc_1",
        updatedAt: "2026-07-03T03:00:00.000Z",
      },
      {
        caseId: "delivery_2",
        sliceId: "slice_2",
        workspaceId: "owner",
        status: "dispatched",
        dispatchStatus: "sent",
        taskCardId: "ttc_2",
        updatedAt: "2026-07-03T04:45:00.000Z",
      },
    ],
  });
  assert.equal(summary.status, "degraded");
  assert.equal(summary.counts.tracked, 2);
  assert.equal(summary.counts.stale, 1);
  assert.equal(summary.items[0].taskCardId, "ttc_1");
  assert.equal(summary.items[0].code, "return_card_missing_after_sla");
}

function testItemAndMarkPatchAreBounded() {
  const item = returnWatchdogItemForSlice({
    caseId: "delivery_1",
    sliceId: "slice_1",
    sliceKey: "implement",
    workspaceId: "owner",
    status: "dispatched",
    dispatchStatus: "return_stale",
    taskCardId: "ttc_1",
    updatedAt: "2026-07-03T03:00:00.000Z",
  }, Date.parse("2026-07-03T05:00:00.000Z"), 60 * 60 * 1000);
  assert.equal(item.stale, true);
  assert.equal(item.alreadyMarked, true);
  const patch = returnWatchdogMarkPatch(item, { staleAfterMs: 60 * 60 * 1000 }, "2026-07-03T05:00:00.000Z");
  assert.equal(patch.dispatchStatus, "return_stale");
  assert.equal(patch.blockedReason, "return_card_watchdog_stale");
  assert.equal(patch.returnWatchdog.taskCardId, "ttc_1");
}

testCandidateFiltering();
testSummaryMarksStaleOnlyAfterWindow();
testItemAndMarkPatchAreBounded();
console.log("return watchdog service tests passed");
