"use strict";

const crypto = require("node:crypto");
const {
  normalizeDeployRequest,
} = require("./central-deploy-governance-service");

const SOURCE_RETURN_FOLLOW_UP_ACTION_VERSION = "20260709-source-return-follow-up-action-v1";

const TERMINAL_RETURN_STATUSES = new Set([
  "completed",
  "blocked",
  "redirected",
  "rejected",
  "partially_completed",
]);

const ACTION_STATUSES = new Set(["pending", "resolved", "blocked", "dismissed"]);

const TEXT_MARKERS = Object.freeze([
  {
    key: "deploy_needed_true",
    pattern: /\bdeploy_needed\s*=\s*true\b/i,
    actionType: "deploy",
    issueCode: "pending_source_deploy_action_required",
  },
  {
    key: "deploy_requested",
    pattern: /\bdeploy_requested\b/i,
    actionType: "deploy",
    issueCode: "pending_source_deploy_action_required",
  },
  {
    key: "blocked_by_deploy_readback",
    pattern: /\bblocked_by_deploy_readback\b/i,
    actionType: "deploy",
    issueCode: "pending_source_deploy_action_required",
  },
  {
    key: "public_sync_required",
    pattern: /\bpublic_sync_required\b/i,
    actionType: "deploy",
    issueCode: "pending_source_public_sync_required",
  },
  {
    key: "pr_close_required",
    pattern: /\bpr_close_required\b/i,
    actionType: "pr_close",
    issueCode: "pending_source_pr_close_required",
  },
  {
    key: "follow_up_required",
    pattern: /\bfollow_up_required\b/i,
    actionType: "central_action",
    issueCode: "pending_source_action_required",
  },
  {
    key: "central_action_required",
    pattern: /\bcentral_action_required\b/i,
    actionType: "central_action",
    issueCode: "pending_source_action_required",
  },
]);

function clean(value, max = 240) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 240));
}

function cleanBlock(value, max = 2400) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 2400));
}

function normalizeToken(value, max = 120) {
  return clean(value, max).toLowerCase().replace(/[-\s]+/g, "_");
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arrayValue(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return [value];
}

function boundedList(value, maxItems = 20, itemMax = 240) {
  return arrayValue(value)
    .flatMap((item) => String(item ?? "").split(","))
    .map((item) => clean(item, itemMax))
    .filter(Boolean)
    .slice(0, maxItems);
}

function boolValue(value, defaultValue = false) {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return defaultValue;
}

function firstClean(values = [], max = 240) {
  for (const value of values) {
    const text = clean(value, max);
    if (text) return text;
  }
  return "";
}

function sha(value = "") {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

function nestedDeployRequest(input = {}) {
  const metadata = objectValue(input.metadata || input.meta);
  const event = objectValue(input.returnCardEvent || input.return_card_event);
  return input.deployRequest
    || input.deploy_request
    || metadata.deployRequest
    || metadata.deploy_request
    || event.deployRequest
    || event.deploy_request
    || {};
}

function nestedFollowUpRequest(input = {}) {
  const metadata = objectValue(input.metadata || input.meta);
  const event = objectValue(input.returnCardEvent || input.return_card_event);
  return objectValue(input.followUpRequest
    || input.follow_up_request
    || metadata.followUpRequest
    || metadata.follow_up_request
    || event.followUpRequest
    || event.follow_up_request);
}

function textSurface(input = {}) {
  const metadata = objectValue(input.metadata || input.meta);
  const event = objectValue(input.returnCardEvent || input.return_card_event);
  return cleanBlock([
    input.summary,
    input.title,
    input.body,
    input.bodyMarkdown,
    input.body_markdown,
    metadata.summary,
    metadata.title,
    event.title,
    event.summary,
  ].filter(Boolean).join("\n"), 6000);
}

function markerMatches(text = "") {
  if (!text) return [];
  return TEXT_MARKERS.filter((marker) => marker.pattern.test(text));
}

function sourceRefFromText(text = "") {
  const patterns = [
    /(?:deploy|deployment|source|commit|ref|sourceRef|source_ref|建议部署\s*ref)\s*(?:ref|commit)?\s*[:=：]?\s*`?([0-9a-f]{7,40})`?/i,
    /\bsource\s+ref\s+`?([0-9a-f]{7,40})`?/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) return clean(match[1], 80);
  }
  return "";
}

function targetFromInput(input = {}, text = "") {
  const metadata = objectValue(input.metadata || input.meta);
  const event = objectValue(input.returnCardEvent || input.return_card_event);
  const fromField = firstClean([
    input.deployTarget,
    input.deploy_target,
    input.target,
    metadata.deployTarget,
    metadata.deploy_target,
    metadata.target,
    event.deployTarget,
    event.deploy_target,
    event.target,
  ], 120);
  if (fromField) return fromField;
  const match = /(?:deploy\s*)?target\s*[:=]\s*`?([a-z0-9:_-]{2,80})`?/i.exec(text);
  return match?.[1] ? clean(match[1], 120) : "home-ai";
}

function requestedByRoleFromInput(input = {}) {
  const metadata = objectValue(input.metadata || input.meta);
  const event = objectValue(input.returnCardEvent || input.return_card_event);
  return normalizeToken(firstClean([
    input.requestedByRole,
    input.requested_by_role,
    input.sourceRole,
    input.source_role,
    metadata.requestedByRole,
    metadata.requested_by_role,
    metadata.sourceRole,
    metadata.source_role,
    event.requestedByRole,
    event.requested_by_role,
    event.sourceRole,
    event.source_role,
  ], 120) || "home_ai_worker", 120);
}

function baseIdentity(input = {}, createdAt = "") {
  const metadata = objectValue(input.metadata || input.meta);
  const event = objectValue(input.returnCardEvent || input.return_card_event);
  return {
    sourceTaskCardId: clean(input.taskCardId || input.task_card_id || input.originalTaskCardId || input.original_task_card_id || event.originalTaskCardId || metadata.originalTaskCardId || "", 160),
    returnCardId: clean(input.returnCardId || input.return_card_id || event.returnCardId || metadata.returnCardId || "", 160),
    workflowId: clean(input.workflowId || input.workflow_id || metadata.workflowId || metadata.workflow_id || event.workflowId || event.workflow_id || "", 160),
    sourceThreadId: clean(input.sourceThreadId || input.source_thread_id || metadata.sourceThreadId || metadata.source_thread_id || event.sourceThreadId || event.source_thread_id || "", 160),
    createdAt: clean(createdAt || input.createdAt || input.created_at || input.recordedAt || input.recorded_at || new Date().toISOString(), 80),
  };
}

function actionIdFor(action = {}) {
  return `psa_${sha([
    action.sourceTaskCardId,
    action.returnCardId,
    action.workflowId,
    action.actionType,
    action.target,
    action.sourceRef,
  ].join("|"))}`;
}

function actionFromDeployRequest(input = {}, deployRequest = {}, createdAt = "") {
  const identity = baseIdentity(input, createdAt);
  const action = {
    schemaVersion: 1,
    version: SOURCE_RETURN_FOLLOW_UP_ACTION_VERSION,
    status: "pending",
    actionType: "deploy",
    issueCode: "pending_source_deploy_action_required",
    sourceTaskCardId: identity.sourceTaskCardId,
    returnCardId: identity.returnCardId,
    workflowId: identity.workflowId,
    sourceThreadId: identity.sourceThreadId,
    target: clean(deployRequest.target || "home-ai", 120),
    sourceRef: clean(deployRequest.sourceRef || "", 160),
    requiredReadback: boundedList(deployRequest.requiredReadback, 20, 260),
    createdAt: identity.createdAt,
    updatedAt: identity.createdAt,
    detection: {
      source: "structured_deploy_request",
      markers: [],
      structured: true,
    },
    terminalReceipt: {
      status: "terminal_non_active",
      remainsTerminal: true,
      activeTurn: false,
    },
    deployRequest,
  };
  action.id = actionIdFor(action);
  return action;
}

function normalizeFollowUpRequest(input = {}) {
  const source = nestedFollowUpRequest(input);
  const needed = boolValue(source.needed ?? source.followUpNeeded ?? source.follow_up_needed, false);
  return {
    needed,
    actionType: normalizeToken(source.actionType || source.action_type || source.type || "central_action", 80) || "central_action",
    target: clean(source.target || "", 120),
    sourceRef: clean(source.sourceRef || source.source_ref || source.ref || "", 160),
    requiredReadback: boundedList(source.requiredReadback || source.required_readback || source.requiredEvidence || source.required_evidence, 20, 260),
    issueCode: clean(source.issueCode || source.issue_code || "pending_source_action_required", 120),
    dirtyState: objectValue(source.dirtyState || source.dirty_state),
  };
}

function actionFromFollowUpRequest(input = {}, followUpRequest = {}, createdAt = "") {
  const identity = baseIdentity(input, createdAt);
  const actionType = normalizeToken(followUpRequest.actionType || "central_action", 80) || "central_action";
  const action = {
    schemaVersion: 1,
    version: SOURCE_RETURN_FOLLOW_UP_ACTION_VERSION,
    status: "pending",
    actionType,
    issueCode: clean(followUpRequest.issueCode || "pending_source_action_required", 120),
    sourceTaskCardId: identity.sourceTaskCardId,
    returnCardId: identity.returnCardId,
    workflowId: identity.workflowId,
    sourceThreadId: identity.sourceThreadId,
    target: clean(followUpRequest.target || "", 120),
    sourceRef: clean(followUpRequest.sourceRef || "", 160),
    requiredReadback: boundedList(followUpRequest.requiredReadback, 20, 260),
    createdAt: identity.createdAt,
    updatedAt: identity.createdAt,
    detection: {
      source: "structured_follow_up_request",
      markers: [],
      structured: true,
    },
    terminalReceipt: {
      status: "terminal_non_active",
      remainsTerminal: true,
      activeTurn: false,
    },
  };
  if (actionType === "deploy") {
    action.deployRequest = normalizeDeployRequest({
      needed: true,
      requestedByRole: requestedByRoleFromInput(input),
      target: action.target || "home-ai",
      sourceRef: action.sourceRef,
      requiredReadback: action.requiredReadback,
      dirtyState: followUpRequest.dirtyState,
      issueCodes: ["deploy_request_from_follow_up_request"],
    });
  }
  action.id = actionIdFor(action);
  return action;
}

function actionFromTextMarker(input = {}, marker = {}, text = "", createdAt = "") {
  const identity = baseIdentity(input, createdAt);
  const actionType = marker.actionType || "central_action";
  const target = targetFromInput(input, text);
  const sourceRef = sourceRefFromText(text);
  const requiredReadback = boundedList(input.requiredReadback || input.required_readback || objectValue(input.metadata || input.meta).requiredReadback || objectValue(input.metadata || input.meta).required_readback, 20, 260);
  const action = {
    schemaVersion: 1,
    version: SOURCE_RETURN_FOLLOW_UP_ACTION_VERSION,
    status: "pending",
    actionType,
    issueCode: marker.issueCode || "pending_source_action_required",
    sourceTaskCardId: identity.sourceTaskCardId,
    returnCardId: identity.returnCardId,
    workflowId: identity.workflowId,
    sourceThreadId: identity.sourceThreadId,
    target,
    sourceRef,
    requiredReadback,
    createdAt: identity.createdAt,
    updatedAt: identity.createdAt,
    detection: {
      source: "bounded_text_marker",
      markers: [marker.key],
      structured: false,
    },
    terminalReceipt: {
      status: "terminal_non_active",
      remainsTerminal: true,
      activeTurn: false,
    },
  };
  if (actionType === "deploy") {
    action.deployRequest = normalizeDeployRequest({
      needed: true,
      requestedByRole: requestedByRoleFromInput(input),
      target,
      sourceRef,
      requiredReadback,
      dirtyState: objectValue(input.dirtyState || input.dirty_state),
      issueCodes: ["deploy_request_from_return_marker"],
    });
  }
  action.id = actionIdFor(action);
  return action;
}

function parseSourceReturnFollowUpAction(input = {}, options = {}) {
  const status = normalizeToken(input.status || input.returnStatus || input.return_status, 80);
  if (status && !TERMINAL_RETURN_STATUSES.has(status)) {
    return { required: false, reason: "non_terminal_return_status" };
  }
  const createdAt = clean(input.createdAt || input.created_at || input.recordedAt || input.recorded_at || (typeof options.nowIso === "function" ? options.nowIso() : ""), 80);
  const deployRequest = normalizeDeployRequest(nestedDeployRequest(input));
  if (deployRequest.needed) {
    const pendingSourceAction = actionFromDeployRequest(input, deployRequest, createdAt);
    return {
      required: true,
      actionType: "deploy",
      source: "structured_deploy_request",
      pendingSourceAction,
      deployRequest,
    };
  }
  const followUpRequest = normalizeFollowUpRequest(input);
  if (followUpRequest.needed) {
    const pendingSourceAction = actionFromFollowUpRequest(input, followUpRequest, createdAt);
    return {
      required: true,
      actionType: pendingSourceAction.actionType,
      source: "structured_follow_up_request",
      pendingSourceAction,
      deployRequest: pendingSourceAction.deployRequest || null,
    };
  }
  const text = textSurface(input);
  const [marker] = markerMatches(text);
  if (!marker) return { required: false, reason: "no_follow_up_signal" };
  const pendingSourceAction = actionFromTextMarker(input, marker, text, createdAt);
  return {
    required: true,
    actionType: pendingSourceAction.actionType,
    source: "bounded_text_marker",
    pendingSourceAction,
    deployRequest: pendingSourceAction.deployRequest || null,
  };
}

function transitionPendingSourceAction(action = {}, input = {}) {
  const current = objectValue(action);
  const status = normalizeToken(input.status || input.actionStatus || input.action_status, 80);
  if (!current.id || !ACTION_STATUSES.has(status)) {
    return Object.assign({}, current);
  }
  const now = clean(input.updatedAt || input.updated_at || input.resolvedAt || input.resolved_at || new Date().toISOString(), 80);
  return Object.assign({}, current, {
    status,
    updatedAt: now,
    resolvedAt: status === "resolved" ? now : clean(current.resolvedAt || "", 80),
    blockedAt: status === "blocked" ? now : clean(current.blockedAt || "", 80),
    dismissedAt: status === "dismissed" ? now : clean(current.dismissedAt || "", 80),
    resolution: {
      actionTaken: clean(input.actionTaken || input.action_taken || (status === "resolved" ? "central_action_dispatched" : status), 120),
      reason: clean(input.reason || input.resolutionReason || input.resolution_reason || "", 260),
      centralDeployCardId: clean(input.centralDeployCardId || input.central_deploy_card_id || "", 160),
      centralCoordinatorRef: clean(input.centralCoordinatorRef || input.central_coordinator_ref || "", 160),
    },
  });
}

function deployRequestsFromPendingSourceActions(actions = []) {
  return arrayValue(actions)
    .map((action) => objectValue(action).deployRequest)
    .map(normalizeDeployRequest)
    .filter((request) => request.needed);
}

function pendingSourceActionProjection(action = {}) {
  const current = objectValue(action);
  if (!current.id) return {};
  return {
    id: clean(current.id, 80),
    status: clean(current.status || "", 80),
    actionType: clean(current.actionType || "", 80),
    target: clean(current.target || "", 120),
    sourceRef: clean(current.sourceRef || "", 160),
    issueCode: clean(current.issueCode || "", 120),
    sourceTaskCardId: clean(current.sourceTaskCardId || "", 160),
    returnCardId: clean(current.returnCardId || "", 160),
    workflowId: clean(current.workflowId || "", 160),
    requiredReadbackCount: arrayValue(current.requiredReadback).length,
    detectionSource: clean(current.detection?.source || "", 80),
    terminalReceiptStatus: clean(current.terminalReceipt?.status || "", 80),
  };
}

module.exports = {
  SOURCE_RETURN_FOLLOW_UP_ACTION_VERSION,
  deployRequestsFromPendingSourceActions,
  parseSourceReturnFollowUpAction,
  pendingSourceActionProjection,
  transitionPendingSourceAction,
};
