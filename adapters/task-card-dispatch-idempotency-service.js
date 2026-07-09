"use strict";

const crypto = require("node:crypto");

const TASK_CARD_REASONING_EFFORTS = Object.freeze(["low", "medium", "high", "xhigh"]);
const TASK_CARD_REASONING_EFFORT_RANK = Object.freeze(Object.fromEntries(
  TASK_CARD_REASONING_EFFORTS.map((effort, index) => [effort, index]),
));
const ACTIVE_DISPATCH_STATUSES = Object.freeze(["dispatching", "sent", "return_stale"]);

function clean(value, max = 240) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 240));
}

function digest(value, chars = 16) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, chars);
}

function normalizeTaskCardReasoningEffort(input = {}, options = {}) {
  const requested = typeof input === "string"
    ? input
    : (input.reasoningEffort || input.reasoning_effort || input.requested || "");
  const severity = clean((typeof input === "object" ? input.severity || input.harnessClass || input.harness_class : "") || options.severity || "", 20).toLowerCase();
  const risk = clean((typeof input === "object" ? input.risk : "") || options.risk || "", 20).toLowerCase();
  const min = clean(options.min || options.minimum || "medium", 20).toLowerCase();
  let floor = TASK_CARD_REASONING_EFFORT_RANK[min] != null ? min : "medium";
  if (["h1", "critical", "xhigh"].includes(severity)) floor = "xhigh";
  if (["h2", "high"].includes(severity) || ["high"].includes(risk)) floor = TASK_CARD_REASONING_EFFORT_RANK[floor] < TASK_CARD_REASONING_EFFORT_RANK.high ? "high" : floor;
  const normalized = TASK_CARD_REASONING_EFFORT_RANK[clean(requested, 20).toLowerCase()] != null
    ? clean(requested, 20).toLowerCase()
    : floor;
  return TASK_CARD_REASONING_EFFORT_RANK[normalized] < TASK_CARD_REASONING_EFFORT_RANK[floor] ? floor : normalized;
}

function dispatchIdempotencyKey(input = {}) {
  const explicit = clean(input.requestId || input.request_id || input.idempotencyKey || input.idempotency_key, 260);
  if (explicit) return explicit;
  const caseId = clean(input.caseId || input.case_id, 160);
  const sliceId = clean(input.sliceId || input.slice_id, 160);
  const sliceKey = clean(input.sliceKey || input.slice_key, 160);
  const stage = clean(input.stage || input.kind || "implementation", 80);
  const returnRef = clean(input.returnCardId || input.return_card_id || input.taskCardId || input.task_card_id, 160);
  if (caseId && (sliceId || sliceKey)) {
    return `autonomous-delivery:${stage}:${caseId}:${sliceKey || sliceId}:${returnRef || "initial"}`;
  }
  return `dispatch:${digest(JSON.stringify({
    title: clean(input.title, 120),
    summary: clean(input.summary, 220),
    targetWorkspaceId: clean(input.targetWorkspaceId || input.target_workspace_id, 120),
  }))}`;
}

function activeDispatchForSlice(slice = {}) {
  const dispatchStatus = clean(slice.dispatchStatus || slice.dispatch_status, 80);
  if (!ACTIVE_DISPATCH_STATUSES.includes(dispatchStatus)) return null;
  const taskCardId = clean(slice.taskCardId || slice.task_card_id, 160);
  if (!taskCardId) return null;
  return {
    duplicate: true,
    code: "task_card_dispatch_duplicate_active",
    sliceId: clean(slice.sliceId || slice.slice_id, 160),
    caseId: clean(slice.caseId || slice.case_id, 160),
    sliceKey: clean(slice.sliceKey || slice.slice_key, 160),
    dispatchStatus,
    taskCardId,
    recommendedAction: dispatchStatus === "return_stale"
      ? "inspect_missing_return_then_record_terminal_return_or_reroute"
      : "observe_existing_task_card_return",
    policy: {
      suppressDuplicateOwnerPrompt: true,
      suppressDuplicateWebPush: true,
      boundedMetadataOnly: true,
    },
  };
}

function duplicateDispatchMetadata(existingSlice = {}, taskCard = {}) {
  const active = activeDispatchForSlice(existingSlice);
  if (!active) return { duplicate: false };
  return Object.assign({}, active, {
    requestId: clean(taskCard.requestId || taskCard.request_id || dispatchIdempotencyKey(existingSlice), 260),
    title: clean(taskCard.title || existingSlice.title, 160),
  });
}

function classifyWorkerBoundaryFailure(input = {}) {
  const text = clean([
    input.code,
    input.error,
    input.message,
    input.summary,
    input.stderr,
    input.blockedReason,
    input.blocked_reason,
  ].filter(Boolean).join(" "), 1000).toLowerCase();
  if (/(permission denied|operation not permitted|sudo: a password is required|service-user|service user|hermes-host|clean-target|clean target|operator-gated|workspace acl|private data path|launchd apply)/i.test(text)) {
    return {
      boundary: "worker_capability_boundary",
      productRuntimeDefect: false,
      code: "worker_lacks_required_service_authority",
      recommendedAction: "route_to_deploy_or_service_lane_or_return_blocked",
    };
  }
  if (/(target_thread_not_visible|task_card_not_found|not_pending|thread_not_found|target.*unreachable)/i.test(text)) {
    return {
      boundary: "task_card_transport_boundary",
      productRuntimeDefect: false,
      code: "task_card_target_unreachable",
      recommendedAction: "reroute_to_live_lane_or_repair_thread_discovery",
    };
  }
  return {
    boundary: "unknown_or_product_boundary",
    productRuntimeDefect: true,
    code: clean(input.code || input.error || "unclassified_failure", 120),
    recommendedAction: "inspect_root_cause",
  };
}

module.exports = {
  ACTIVE_DISPATCH_STATUSES,
  dispatchIdempotencyKey,
  duplicateDispatchMetadata,
  classifyWorkerBoundaryFailure,
  normalizeTaskCardReasoningEffort,
};
