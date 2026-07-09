"use strict";

const {
  buildWorkerDispatchPolicy,
} = require("./worker-lane-scheduler-service");

const ROUTING_DECISION_VERSION = "20260704-autonomous-delivery-routing-v1";

function clean(value, max = 240) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 240));
}

function cleanBlock(value, max = 900) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 900));
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function boolValue(...values) {
  return values.some((value) => value === true || value === "true" || value === 1 || value === "1");
}

function lower(value, max = 240) {
  return clean(value, max).toLowerCase();
}

function sideEffectText(input = {}) {
  return [
    input.requestedSideEffects,
    input.requested_side_effects,
    input.sideEffects,
    input.side_effects,
    input.objective,
    input.summary,
    input.description,
  ].flat().map((item) => clean(item, 220)).join(" ").toLowerCase();
}

function isHomeAiTarget(slice = {}, target = {}) {
  const workspaceId = lower(slice.targetWorkspaceId || slice.workspaceId || "", 120);
  const workspacePath = clean(slice.targetWorkspacePath || slice.workspacePath || target.targetWorkspace || "", 800);
  return workspaceId === "home-ai" || workspacePath === "/Users/example/path";
}

function pluginIdForSlice(slice = {}, target = {}) {
  if (isHomeAiTarget(slice, target)) return "";
  return clean(
    slice.pluginId
      || slice.plugin_id
      || target.pluginId
      || target.plugin_id
      || slice.targetWorkspaceId
      || slice.workspaceId
      || "",
    120,
  ).toLowerCase();
}

function detectWorkerLoop(slice = {}, input = {}) {
  const raw = objectValue(slice.rawJson || slice.raw_json);
  const text = sideEffectText({
    requestedSideEffects: input.requestedSideEffects,
    objective: input.objective || input.deliveryCase?.objective,
    summary: slice.summary || slice.title,
    description: slice.description,
  });
  return boolValue(
    slice.workerLoop,
    slice.worker_loop,
    raw.workerLoop,
    raw.worker_loop,
    input.workerLoop,
    input.worker_loop,
  ) || /\bworker[_ -]?loop\b|\bnested\s+loop\b/.test(text);
}

function decisionText(slice = {}, input = {}) {
  return sideEffectText({
    requestedSideEffects: input.requestedSideEffects,
    objective: input.objective || input.deliveryCase?.objective,
    summary: slice.summary || slice.title,
    description: slice.description,
  });
}

function detectExplicitLoopRequest(slice = {}, input = {}) {
  const raw = objectValue(slice.rawJson || slice.raw_json);
  const text = decisionText(slice, input);
  if (boolValue(slice.loopCard, slice.loop_card, raw.loopCard, raw.loop_card, input.loopCard, input.loop_card)) {
    return true;
  }
  if (/(?:不是|非|不要|不用)\s*(?:@?loop|循环)|普通卡|普通任务卡|normal\s+card/.test(text)) return false;
  return /@loop|\bloop\s*(?:card|task|workflow)\b|loop\s*卡|loop\s*任务|循环任务|循环卡|三线程|loop\s*方式|发\s*loop/.test(text);
}

function detectPluginRequirementsRequest(slice = {}, input = {}) {
  const raw = objectValue(slice.rawJson || slice.raw_json);
  if (boolValue(
    slice.pluginRequirements,
    slice.plugin_requirements,
    raw.pluginRequirements,
    raw.plugin_requirements,
    input.pluginRequirements,
    input.plugin_requirements,
  )) {
    return true;
  }
  const text = decisionText(slice, input);
  return /插件.*主线程|主线程.*插件|plugin\s+main\s+thread|plugin\s+source\s+thread|需求分析|需求设计|requirements|design\s+packet|设计方案|分析方|普通卡|普通任务卡|发卡给.*插件/.test(text);
}

function detectProductionAuthorityNeeded(slice = {}, input = {}) {
  const text = decisionText(slice, input);
  return /\bdeploy|deployment|production|launchd|restart|readback|service[-_ ]?user|hermes-host|sudo|clean[-_ ]?target|install|operator\b/.test(text);
}

function reason(code, detail = "") {
  return {
    code: clean(code, 120),
    detail: cleanBlock(detail, 360),
  };
}

function baseDecision(input = {}) {
  const deliveryCase = objectValue(input.deliveryCase || input.case);
  const slice = objectValue(input.slice);
  const target = objectValue(input.target);
  const policy = buildWorkerDispatchPolicy({
    reasoningEffort: input.reasoningEffort || input.reasoning_effort,
    severity: slice.aiOps?.harnessClass || input.harnessClass || input.harness_class,
    risk: slice.risk || deliveryCase.risk || input.risk,
  });
  return {
    ok: true,
    schemaVersion: 1,
    version: ROUTING_DECISION_VERSION,
    action: "",
    code: "",
    routingOwner: "home_ai_main_thread",
    decisionRequired: true,
    source: "autonomous_delivery_routing_decision_service",
    caseId: clean(deliveryCase.caseId || deliveryCase.id || "", 160),
    sliceId: clean(slice.sliceId || slice.id || "", 180),
    sliceKey: clean(slice.sliceKey || slice.slice_key || slice.id || "", 160),
    ownerLayer: clean(slice.ownerLayer || slice.owner_layer || "", 120),
    targetWorkspaceId: clean(slice.targetWorkspaceId || slice.workspaceId || "", 120),
    targetWorkspacePath: clean(slice.targetWorkspacePath || slice.workspacePath || target.targetWorkspace || "", 600),
    targetThreadTitle: clean(target.targetThreadTitle || "", 160),
    targetThreadTitlePrefix: clean(target.targetThreadTitlePrefix || "", 160),
    cardKind: "",
    role: "",
    reasoningEffort: policy.reasoningEffort,
    terminalReturnRequired: true,
    conflictRule: policy.conflictRule,
    heartbeatRequired: false,
    taskCardHeartbeatRequired: false,
    taskCardWatchdogTimeoutMs: policy.taskCardWatchdogTimeoutMs,
    taskCardWatchdogBatchLimit: policy.taskCardWatchdogBatchLimit,
    taskCardWatchdogMaxAutoResume: policy.taskCardWatchdogMaxAutoResume,
    codexMobileThreadLifecycle: {
      required: false,
      action: "",
      role: "",
      workspaceCwd: "",
    },
    reasons: [],
    policy: {
      boundedMetadataOnly: true,
      noInlineWithoutDecision: true,
      taskCardIdPrimaryReturnKey: true,
    },
  };
}

function buildAutonomousDeliveryRoutingDecision(input = {}) {
  const deliveryCase = objectValue(input.deliveryCase || input.case);
  const slice = objectValue(input.slice);
  const target = objectValue(input.target);
  const decision = baseDecision(input);
  const ownerLayer = lower(slice.ownerLayer || slice.owner_layer, 120);
  const risk = lower(slice.risk || deliveryCase.risk || input.risk, 40);
  const targetKnown = Boolean(target && Object.keys(target).length);
  const homeAiTarget = isHomeAiTarget(slice, target);
  const workerLoop = detectWorkerLoop(slice, input);
  const pluginRequirementsRequest = !homeAiTarget && detectPluginRequirementsRequest(slice, input);
  const explicitLoopRequest = pluginRequirementsRequest && detectExplicitLoopRequest(slice, input);
  const productionAuthorityNeeded = detectProductionAuthorityNeeded(slice, input);

  if (!slice || !Object.keys(slice).length) {
    return Object.assign(decision, {
      ok: false,
      action: "blocked_or_redirected",
      code: "routing_slice_missing",
      reasons: [reason("routing_slice_missing", "A routing decision requires a concrete delivery slice.")],
    });
  }

  if (risk === "high") {
    return Object.assign(decision, {
      ok: false,
      action: "blocked_or_redirected",
      code: "high_risk_owner_gate_required",
      reasons: [reason("high_risk_owner_gate_required", "High-risk slices require explicit Owner-gated follow-up before dispatch.")],
    });
  }

  if (ownerLayer === "user_visible_decision") {
    return Object.assign(decision, {
      ok: false,
      action: "blocked_or_redirected",
      code: "owner_decision_required",
      role: "owner_decision",
      reasons: [reason("owner_decision_required", "User-visible decision slices stay in Owner review instead of Worker dispatch.")],
    });
  }

  if (ownerLayer === "verification_or_audit_thread") {
    return Object.assign(decision, {
      action: "delegate_audit_lane",
      code: "audit_lane_required",
      role: "product_audit",
      cardKind: homeAiTarget ? "platform_audit" : "plugin_audit",
      heartbeatRequired: true,
      taskCardHeartbeatRequired: true,
      reasons: [reason("audit_lane_required", "Independent verification/audit must be routed to an audit lane.")],
    });
  }

  if (ownerLayer === "deployment_owner" || productionAuthorityNeeded) {
    return Object.assign(decision, {
      action: "delegate_deploy_lane",
      code: "deploy_lane_required",
      role: "deploy_readback",
      cardKind: "plugin_deployment",
      heartbeatRequired: true,
      taskCardHeartbeatRequired: true,
      reasons: [reason("deploy_lane_required", "Production install/deploy/readback or service-user authority belongs to a deploy/service lane.")],
    });
  }

  if (!targetKnown) {
    return Object.assign(decision, {
      ok: false,
      action: "blocked_or_redirected",
      code: "target_workspace_unknown",
      reasons: [reason("target_workspace_unknown", "No legal target workspace/thread was resolved for this slice.")],
    });
  }

  if (explicitLoopRequest) {
    return Object.assign(decision, {
      action: "delegate_plugin_loop",
      code: "plugin_source_loop_required",
      role: "requirements",
      cardKind: "plugin_loop",
      heartbeatRequired: true,
      taskCardHeartbeatRequired: true,
      codexMobileThreadLifecycle: {
        required: true,
        action: "start_or_ensure_plugin_loop",
        role: "plugin_requirements",
        workspaceCwd: decision.targetWorkspacePath,
      },
      reasons: [reason("plugin_source_loop_required", "The Owner explicitly requested a plugin Loop; route requirements ownership to the plugin main/source thread before implementation and audit role dispatch.")],
    });
  }

  if (pluginRequirementsRequest) {
    return Object.assign(decision, {
      action: "delegate_plugin_requirements",
      code: "plugin_source_requirements_required",
      role: "requirements",
      cardKind: "plugin_requirements",
      heartbeatRequired: true,
      taskCardHeartbeatRequired: true,
      codexMobileThreadLifecycle: {
        required: true,
        action: "resolve_or_ensure_plugin_main_thread",
        role: "plugin_requirements",
        workspaceCwd: decision.targetWorkspacePath,
      },
      reasons: [reason("plugin_source_requirements_required", "Plugin-domain product requests must be routed to the plugin main/source thread for requirements analysis instead of direct Home AI implementation.")],
    });
  }

  if (workerLoop) {
    return Object.assign(decision, {
      action: "delegate_worker_loop",
      code: "worker_loop_required",
      role: "requirements",
      cardKind: homeAiTarget ? "home_ai_worker" : "implementation",
      heartbeatRequired: true,
      taskCardHeartbeatRequired: true,
      codexMobileThreadLifecycle: {
        required: true,
        action: "ensure_or_create_role_lanes",
        role: homeAiTarget ? "home_ai_worker_loop" : "plugin_worker_loop",
        workspaceCwd: decision.targetWorkspacePath,
      },
      reasons: [reason("worker_loop_required", "The slice is independently returnable and complex enough for a nested requirements-implementation-audit loop.")],
    });
  }

  if (["home_ai_workspace", "plugin_workspace", "implementation_thread"].includes(ownerLayer) || slice.sliceKey === "research") {
    const cardKind = homeAiTarget ? "home_ai_worker" : "plugin_worker";
    const pluginId = pluginIdForSlice(slice, target);
    return Object.assign(decision, {
      action: "delegate_worker",
      code: homeAiTarget ? "home_ai_worker_required" : "owning_workspace_worker_required",
      role: homeAiTarget ? "implementation" : "plugin_worker",
      cardKind,
      heartbeatRequired: true,
      taskCardHeartbeatRequired: true,
      codexMobileThreadLifecycle: homeAiTarget ? {
        required: true,
        action: "resolve_or_ensure_worker_lane",
        role: "home_ai_worker",
        workspaceCwd: decision.targetWorkspacePath,
      } : {
        required: true,
        action: "resolve_or_ensure_plugin_worker_lane",
        role: "plugin_worker",
        pluginId,
        workspaceCwd: decision.targetWorkspacePath,
      },
      reasons: [reason(
        homeAiTarget ? "home_ai_worker_required" : "owning_workspace_worker_required",
        homeAiTarget
          ? "Implementation/research slices need durable task-card ownership and terminal return evidence."
          : "Plugin implementation/research slices must route through the plugin_worker lifecycle resolver so target selection is deterministic and does not block on multiple same-workspace threads.",
      )],
    });
  }

  return Object.assign(decision, {
    ok: false,
    action: "blocked_or_redirected",
    code: "routing_owner_layer_unsupported",
    reasons: [reason("routing_owner_layer_unsupported", `Unsupported owner layer: ${ownerLayer || "unknown"}.`)],
  });
}

function routingDecisionTaskCardLines(decision = {}) {
  const current = objectValue(decision);
  if (!current.action) return [];
  const lifecycle = objectValue(current.codexMobileThreadLifecycle);
  const lines = [
    "## Routing Decision",
    "",
    `Action: \`${clean(current.action, 120)}\``,
    `Reason code: \`${clean(current.code, 120)}\``,
    `Role: \`${clean(current.role || "implementation", 120)}\``,
    `Card kind: \`${clean(current.cardKind || "implementation", 120)}\``,
    `Reasoning effort: \`${clean(current.reasoningEffort || "medium", 40)}\``,
    `Task-card heartbeat required: \`${current.taskCardHeartbeatRequired ? "true" : "false"}\``,
    `Task-card Watchdog timeout ms: \`${Number(current.taskCardWatchdogTimeoutMs || 0) || 0}\``,
    `Task-card Watchdog batch limit: \`${Number(current.taskCardWatchdogBatchLimit || 0) || 0}\``,
    `Task-card Watchdog max auto-resume: \`${Number(current.taskCardWatchdogMaxAutoResume || 0) || 0}\``,
  ];
  if (lifecycle.required) {
    lines.push(
      `Codex Mobile thread lifecycle: \`${clean(lifecycle.action, 120)}\``,
      `Lifecycle role: \`${clean(lifecycle.role, 120)}\``,
    );
  }
  const reasons = Array.isArray(current.reasons) ? current.reasons : [];
  if (reasons.length) {
    lines.push("", "Decision reasons:");
    for (const item of reasons.slice(0, 5)) {
      const entry = objectValue(item);
      lines.push(`- \`${clean(entry.code, 120)}\`: ${cleanBlock(entry.detail, 260)}`);
    }
  }
  lines.push("", "This routing decision is required closure evidence; do not continue as unbounded inline work.");
  return lines;
}

module.exports = {
  ROUTING_DECISION_VERSION,
  buildAutonomousDeliveryRoutingDecision,
  routingDecisionTaskCardLines,
};
