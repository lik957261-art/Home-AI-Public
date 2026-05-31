"use strict";

function clean(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function listValue(value) {
  return Array.isArray(value)
    ? value.map((item) => clean(item, 160)).filter(Boolean)
    : [];
}

function errorResult(status, error) {
  return { ok: false, status, error };
}

function financeLedgerJoinSource(item = {}) {
  const sourceRef = objectValue(item.sourceRef || item.source_ref);
  if (clean(item.sourceType || item.source_type, 80) !== "plugin") return null;
  if (clean(sourceRef.pluginId, 80) !== "finance") return null;
  if (clean(sourceRef.notificationType, 120) !== "finance.ledger_join_request") return null;
  const requestId = clean(sourceRef.requestId || sourceRef.request_id || item.sourceId || item.source_id, 180);
  if (!requestId) return null;
  return {
    requestId,
    requestedRole: clean(sourceRef.requestedRole || sourceRef.requested_role || "viewer", 80) || "viewer",
    memberIds: listValue(sourceRef.memberIds || sourceRef.member_ids),
  };
}

function createFinanceLedgerJoinApprovalService(options = {}) {
  const actionInboxService = options.actionInboxService;
  const reviewLedgerJoinRequest = options.reviewLedgerJoinRequest;

  function requireInbox() {
    if (!actionInboxService || typeof actionInboxService.getItem !== "function") {
      throw new Error("finance ledger join approval service requires actionInboxService");
    }
    return actionInboxService;
  }

  async function reviewRequest(input = {}) {
    const inbox = requireInbox();
    const itemId = clean(input.itemId || input.id, 180);
    const decision = clean(input.decision, 40).toLowerCase();
    if (!["approve", "reject"].includes(decision)) return errorResult(400, "finance_ledger_join_decision_invalid");
    const current = inbox.getItem({ itemId });
    if (!current?.ok) return current || errorResult(404, "action_inbox_item_not_found");
    const item = current.item;
    const source = financeLedgerJoinSource(item);
    if (!source) return errorResult(400, "finance_ledger_join_source_invalid");
    if (typeof reviewLedgerJoinRequest !== "function") {
      return errorResult(503, "finance_ledger_join_reviewer_unavailable");
    }
    const args = {
      request_id: source.requestId,
      decision,
    };
    if (decision === "approve") {
      args.role = clean(input.role || source.requestedRole || "viewer", 80) || "viewer";
      args.member_ids = listValue(input.memberIds || input.member_ids || source.memberIds);
    }
    const financeResult = await Promise.resolve(reviewLedgerJoinRequest({
      tool: "finance.review_ledger_join_request",
      args,
      workspaceId: clean(item.workspaceId || item.workspace_id || input.workspaceId || "owner", 120) || "owner",
      auth: input.auth,
    }));
    if (!financeResult?.ok) {
      return financeResult || errorResult(502, "finance_ledger_join_review_failed");
    }
    const transitionInput = {
      itemId,
      workspaceId: item.workspaceId || input.workspaceId,
      auth: input.auth,
      payload: {
        pluginId: "finance",
        requestId: source.requestId,
        decision,
      },
    };
    const inboxResult = decision === "approve"
      ? inbox.completeItem(transitionInput)
      : inbox.dismissItem(transitionInput);
    if (!inboxResult?.ok) return inboxResult || errorResult(500, "finance_ledger_join_inbox_update_failed");
    return {
      ok: true,
      item: inboxResult.item,
      event: inboxResult.event,
      finance: {
        ok: true,
        requestId: source.requestId,
        decision,
      },
    };
  }

  return {
    reviewRequest,
  };
}

module.exports = {
  createFinanceLedgerJoinApprovalService,
  financeLedgerJoinSource,
};
