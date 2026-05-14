"use strict";

const EXTERNAL_DESTINATIONS = new Set(["weixin", "messaging", "http", "web", "browser", "email", "push"]);
const DURABLE_DESTINATIONS = new Set(["memory", "cronjob", "automation"]);
const INTERNAL_DESTINATIONS = new Set(["local", "workspace", "thread", "todo", "kanban", "file", "artifact", "skill", "session"]);

function list(value) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function hasAny(values, candidates) {
  const set = new Set(list(values).map((item) => item.toLowerCase()));
  return list(candidates).some((item) => set.has(item.toLowerCase()));
}

function normalizeDecision(input = {}, allowed, reason, risk = "low") {
  return {
    allowed: Boolean(allowed),
    decision: allowed ? "allow" : "deny",
    reason,
    risk,
    source: String(input.source || input.sourceKind || "").trim(),
    destination: String(input.destination || input.destinationKind || "").trim(),
    operation: String(input.operation || "").trim(),
    workspaceId: String(input.workspaceId || input.workspace_id || "").trim(),
  };
}

function createEgressPolicyProvider(options = {}) {
  const audit = typeof options.audit === "function" ? options.audit : () => {};

  function decide(input = {}) {
    const destination = String(input.destination || input.destinationKind || "").trim().toLowerCase();
    const operation = String(input.operation || "").trim().toLowerCase();
    const actorWorkspaceId = String(input.actorWorkspaceId || input.actor_workspace_id || "").trim();
    const targetWorkspaceId = String(input.targetWorkspaceId || input.target_workspace_id || "").trim();
    const ownerApproved = Boolean(input.ownerApproved || input.owner_approved || input.elevationApproved);
    const explicitUserApproved = Boolean(input.userApproved || input.user_approved || input.explicitUserApproved || input.explicit_user_approved);
    const originReply = Boolean(input.originReply || input.origin_reply);
    const source = String(input.source || input.sourceKind || "").trim().toLowerCase();
    const trustedOriginReply = source === "weixin" && destination === "weixin" && operation === "origin_reply" && originReply;
    const currentWorkspaceOnly = Boolean(actorWorkspaceId && targetWorkspaceId && targetWorkspaceId === actorWorkspaceId);
    const contentKinds = list(input.contentKinds || input.content_kinds);
    const toolsets = list(input.toolsets);
    const sendsFileContent = Boolean(input.sendsFileContent || input.sends_file_content || hasAny(contentKinds, ["file", "artifact", "document", "audio", "image"]));
    const writesMemory = destination === "memory" || operation.includes("memory") || hasAny(toolsets, ["memory"]);
    const createsSchedule = destination === "cronjob" || operation.includes("schedule") || hasAny(toolsets, ["cronjob"]);

    let decision;
    if (!destination) {
      decision = normalizeDecision(input, false, "missing_destination", "medium");
    } else if (!actorWorkspaceId) {
      decision = normalizeDecision(input, false, "missing_actor_workspace", "medium");
    } else if (!targetWorkspaceId) {
      decision = normalizeDecision(input, false, "missing_target_workspace", "medium");
    } else if (!EXTERNAL_DESTINATIONS.has(destination) && !DURABLE_DESTINATIONS.has(destination) && !INTERNAL_DESTINATIONS.has(destination)) {
      decision = normalizeDecision(input, false, "unknown_egress_destination_requires_policy", "medium");
    } else if ((DURABLE_DESTINATIONS.has(destination) || writesMemory || createsSchedule) && !ownerApproved && !currentWorkspaceOnly) {
      decision = normalizeDecision(input, false, "durable_cross_workspace_egress_requires_owner_approval", "high");
    } else if (EXTERNAL_DESTINATIONS.has(destination) && sendsFileContent && !trustedOriginReply && !ownerApproved && !explicitUserApproved) {
      decision = normalizeDecision(input, false, "file_content_external_egress_requires_explicit_approval", "high");
    } else if (!currentWorkspaceOnly && !ownerApproved) {
      decision = normalizeDecision(input, false, "cross_workspace_egress_requires_owner_approval", "high");
    } else if (trustedOriginReply) {
      decision = normalizeDecision(input, true, "origin_reply_allowed", sendsFileContent ? "medium" : "low");
    } else {
      decision = normalizeDecision(input, true, "current_workspace_egress_allowed", sendsFileContent ? "medium" : "low");
    }

    audit("egress_decision", Object.assign({}, input, {
      decision: decision.decision,
      reason: decision.reason,
      targetType: "egress",
      targetId: destination,
    }));
    return decision;
  }

  return {
    decide,
  };
}

module.exports = {
  createEgressPolicyProvider,
};
