"use strict";

const assert = require("node:assert/strict");
const { createFinanceLedgerJoinApprovalService } = require("../adapters/finance-ledger-join-approval-service");

function createHarness() {
  const calls = { review: [], complete: [], dismiss: [] };
  const item = {
    id: "ainb-finance-join-1",
    workspaceId: "owner",
    sourceType: "plugin",
    sourceId: "join-req-1",
    status: "open",
    sourceRef: {
      pluginId: "finance",
      notificationType: "finance.ledger_join_request",
      requestId: "join-req-1",
      requestedRole: "viewer",
    },
  };
  const service = createFinanceLedgerJoinApprovalService({
    actionInboxService: {
      getItem(input) {
        return input.itemId === item.id ? { ok: true, item, events: [] } : { ok: false, status: 404, error: "action_inbox_item_not_found" };
      },
      completeItem(input) {
        calls.complete.push(input);
        return { ok: true, item: Object.assign({}, item, { status: "done" }), event: { eventType: "completed" } };
      },
      dismissItem(input) {
        calls.dismiss.push(input);
        return { ok: true, item: Object.assign({}, item, { status: "dismissed" }), event: { eventType: "dismissed" } };
      },
    },
    reviewLedgerJoinRequest(input) {
      calls.review.push(input);
      return { ok: true, requestId: input.args.request_id, decision: input.args.decision };
    },
  });
  return { calls, service };
}

async function testApproveCallsFinanceReviewToolBeforeCompletingInbox() {
  const { calls, service } = createHarness();
  const result = await service.reviewRequest({
    itemId: "ainb-finance-join-1",
    decision: "approve",
    auth: { principalId: "owner" },
  });
  assert.equal(result.ok, true);
  assert.equal(result.item.status, "done");
  assert.deepEqual(calls.review, [{
    tool: "finance.review_ledger_join_request",
    args: {
      request_id: "join-req-1",
      decision: "approve",
      role: "viewer",
      member_ids: [],
    },
    workspaceId: "owner",
    auth: { principalId: "owner" },
  }]);
  assert.equal(calls.complete.length, 1);
  assert.equal(calls.dismiss.length, 0);
}

async function testRejectCallsFinanceReviewToolBeforeDismissingInbox() {
  const { calls, service } = createHarness();
  const result = await service.reviewRequest({
    itemId: "ainb-finance-join-1",
    decision: "reject",
  });
  assert.equal(result.ok, true);
  assert.equal(result.item.status, "dismissed");
  assert.deepEqual(calls.review[0].args, {
    request_id: "join-req-1",
    decision: "reject",
  });
  assert.equal(calls.complete.length, 0);
  assert.equal(calls.dismiss.length, 1);
}

async function testInvalidInboxSourceFailsClosed() {
  const service = createFinanceLedgerJoinApprovalService({
    actionInboxService: {
      getItem() {
        return { ok: true, item: { id: "wrong", workspaceId: "owner", sourceType: "plugin", sourceRef: { pluginId: "wardrobe" } } };
      },
    },
    reviewLedgerJoinRequest() {
      throw new Error("should not call finance");
    },
  });
  const result = await service.reviewRequest({ itemId: "wrong", decision: "approve" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "finance_ledger_join_source_invalid");
}

async function run() {
  await testApproveCallsFinanceReviewToolBeforeCompletingInbox();
  await testRejectCallsFinanceReviewToolBeforeDismissingInbox();
  await testInvalidInboxSourceFailsClosed();
  console.log("finance-ledger-join-approval-service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
