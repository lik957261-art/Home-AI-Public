"use strict";

const APP_WORKSPACE = "/Users/example/path";
const LOOP_PLAN_VERSION = "20260703-loop-engineering-plan-v1";
const DEFAULT_MAX_ITERATIONS = 3;

const LOOP_ROLES = Object.freeze([
  "requirements",
  "implementation",
  "product_audit",
]);

const AUDIT_VERDICTS = Object.freeze([
  "passed",
  "failed_requirements_gap",
  "failed_implementation_bug",
  "failed_test_gap",
  "failed_privacy_boundary",
  "failed_deployment_readback",
  "blocked_missing_evidence",
  "blocked_owner_decision",
  "blocked_target_unavailable",
  "rejected_out_of_scope",
]);

const VERDICT_NEXT_ROUTES = Object.freeze({
  passed: "closed",
  failed_requirements_gap: "requirements_revision",
  failed_implementation_bug: "implementation_repair",
  failed_test_gap: "implementation_repair",
  failed_privacy_boundary: "requirements_revision",
  failed_deployment_readback: "deploy_readback_repair",
  blocked_missing_evidence: "implementation_repair",
  blocked_owner_decision: "owner_decision",
  blocked_target_unavailable: "coordinator_reroute",
  rejected_out_of_scope: "closed_rejected",
});

const KNOWN_PLUGIN_TARGETS = Object.freeze({
  codex: "codex-mobile",
  "codex-mobile": "codex-mobile",
  "codex-mobile-web": "codex-mobile",
  email: "email",
  finance: "finance",
  growth: "growth",
  health: "health",
  moira: "moira",
  movie: "movie",
  music: "music",
  note: "note",
  wardrobe: "wardrobe",
});

function clean(value, max = 400) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 400));
}

function safeToken(value, fallback = "unknown", max = 120) {
  const token = clean(value, max)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return token || fallback;
}

function boundedList(items = [], max = 20) {
  return (Array.isArray(items) ? items : [])
    .map((item) => clean(item, 240))
    .filter(Boolean)
    .slice(0, max);
}

function boundedNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function boundedObject(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const out = {};
  for (const [key, raw] of Object.entries(source).slice(0, 24)) {
    const safeKey = clean(key, 80).replace(/[^A-Za-z0-9._:-]+/g, "_");
    if (!safeKey) continue;
    if (raw == null) out[safeKey] = null;
    else if (typeof raw === "number") out[safeKey] = boundedNumber(raw, 0);
    else if (typeof raw === "boolean") out[safeKey] = raw;
    else if (Array.isArray(raw)) out[safeKey] = boundedList(raw, 12);
    else if (typeof raw === "object") out[safeKey] = boundedObject(raw);
    else out[safeKey] = clean(raw, 180);
  }
  return out;
}

function normalizeLoopTarget(value) {
  const raw = safeToken(value || "", "", 120);
  if (!raw || raw === "home" || raw === "home-ai" || raw === "homeai") {
    return {
      target: "home-ai",
      targetKind: "home_ai",
      domainAdapter: "home_ai",
      sourceThreadRole: "home_ai_main",
    };
  }
  const pluginId = KNOWN_PLUGIN_TARGETS[raw] || raw;
  return {
    target: pluginId,
    targetKind: "plugin",
    domainAdapter: pluginId,
    sourceThreadRole: "plugin_source",
  };
}

function stripLoopTags(text, tags = []) {
  let out = String(text || "");
  for (const tag of tags) {
    if (!tag) continue;
    out = out.replace(new RegExp(`@${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "ig"), " ");
  }
  return clean(out, 1200);
}

function loopTagsFromText(text) {
  const tags = [];
  const source = String(text || "");
  const re = /@([A-Za-z][A-Za-z0-9_-]{0,80})\b/g;
  let match;
  while ((match = re.exec(source))) tags.push(safeToken(match[1], "", 100));
  return tags;
}

function parseLoopTrigger(input = {}) {
  const text = clean(input.text || input.objective || input.body || "", 1600);
  const tags = loopTagsFromText(text);
  const hasLoopTrigger = tags.includes("loop");
  const explicitTarget = clean(input.target || input.targetPlugin || input.targetWorkspaceId || "", 120);
  if (!hasLoopTrigger && !explicitTarget) {
    return {
      ok: true,
      hasLoopTrigger: false,
      triggerSurface: clean(input.triggerSurface || "codex_mobile_thread", 80),
      objective: text,
      tags,
    };
  }
  const targetTag = explicitTarget || tags.find((tag) => tag !== "loop") || input.currentWorkspaceId || "home-ai";
  const target = normalizeLoopTarget(targetTag);
  return Object.assign({
    ok: true,
    hasLoopTrigger: true,
    triggerSurface: clean(input.triggerSurface || "codex_mobile_thread", 80),
    objective: stripLoopTags(text, ["loop", targetTag]),
    tags,
  }, target);
}

function classifyLoopType(objective = "") {
  const text = clean(objective, 1200).toLowerCase();
  if (/vite|ui|ux|visual|console|preview|button|menu|interaction|界面|按钮|菜单|预览/.test(text)) return "visual_ux";
  if (/deploy|deployment|readback|production|launchd|部署|生产|读回/.test(text)) return "deployment_readback";
  if (/self[- ]?check|dispatch|task[- ]?card|worker|watchdog|web push|cron|诊断|发卡|线程|通知|闭环/.test(text)) return "platform_reliability";
  if (/gateway|plugin|mcp|proxy|native|ios|android|跨/.test(text)) return "cross_workspace_integration";
  return "product_capability";
}

function requiredChecksForTarget(targetKind) {
  const checks = [
    "node tests/loop-engineering-plan-service.test.js",
    "node tests/architecture-code-test-harness-map.test.js",
    "git diff --check",
  ];
  if (targetKind === "home_ai") {
    checks.splice(1, 0,
      "node tests/autonomous-delivery-coordinator-service.test.js",
      "node tests/worker-lane-scheduler-service.test.js",
      "node tests/codex-thread-task-card-service.test.js",
    );
  }
  return checks;
}

function auditPacketForTarget(targetPlan = {}) {
  const targetKind = clean(targetPlan.targetKind || "home_ai", 80);
  const target = clean(targetPlan.target || "home-ai", 120);
  return {
    required: true,
    target,
    targetKind,
    source: "loop_engineering_runtime",
    handoffPolicy: {
      implementationHandoffAsContext: false,
      implementationHandoffAsAuditContext: false,
      implementationHandoffAllowedOnlyWhenAuditingHandoff: true,
      namedHandoffAsTargetEvidenceOnly: true,
      auditUsesPacketNotRawHandoff: true,
    },
    sections: [
      {
        id: "requirements_packet",
        required: true,
        source: "requirements_role_return",
        evidence: [
          "objective",
          "non_goals",
          "acceptance_criteria",
          "user_visible_success",
          "privacy_boundary",
          "risk_gates",
        ],
      },
      {
        id: "design_contract_packet",
        required: true,
        source: "durable_docs_and_contracts",
        evidence: [
          "product_or_module_contract",
          "architecture_boundary",
          "routing_policy",
          "harness_requirements",
        ],
      },
      {
        id: "implementation_packet",
        required: true,
        source: "implementation_return_card",
        evidence: [
          "original_task_card_id",
          "commit_or_changed_files",
          "bounded_diff_summary",
          "ownership_claim",
          "residual_risk",
        ],
      },
      {
        id: "validation_packet",
        required: true,
        source: "tests_harnesses_and_readback",
        evidence: [
          "focused_tests",
          "harness_evidence",
          "deployment_readback_when_applicable",
          "privacy_confirmation",
        ],
      },
      {
        id: "privacy_packet",
        required: true,
        source: "privacy_boundary",
        evidence: [
          "excluded_payload_classes",
          "redaction_or_non_collection_claims",
          "task_card_privacy_confirmation",
          "residual_privacy_risk",
        ],
      },
    ],
    deltaMatrix: [
      {
        id: "intent_vs_requirements",
        required: true,
        question: "Do the requirements preserve the Owner's stated user intent, non-goals, and risk boundaries?",
      },
      {
        id: "requirements_vs_design",
        required: true,
        question: "Do the durable design/contracts cover the stated requirements without contradiction?",
      },
      {
        id: "design_vs_implementation",
        required: true,
        question: "Does the implementation follow the documented ownership, routing, architecture, and privacy contracts?",
      },
      {
        id: "requirements_vs_implementation",
        required: true,
        question: "Does the delivered behavior satisfy each acceptance criterion in user-observable terms?",
      },
      {
        id: "implementation_vs_validation",
        required: true,
        question: "Do tests, harnesses, and readback prove the changed behavior rather than only source shape?",
      },
      {
        id: "user_journey_vs_acceptance",
        required: true,
        question: "Does the real user path close without hidden alternate paths, stale state, or inaccessible controls?",
      },
      {
        id: "privacy_boundary_vs_evidence",
        required: true,
        question: "Does the audit evidence respect the stated privacy boundary and avoid raw private payloads?",
      },
    ],
  };
}

function roleRoutesForTarget(parsed = {}) {
  if (parsed.targetKind === "plugin") {
    return [
      {
        role: "requirements",
        owner: "plugin_source_thread",
        targetWorkspaceId: parsed.target,
        routeKind: "plugin_local_loop",
        dispatchMode: "source_thread_local_role",
        taskCardDispatch: false,
        sameThreadTaskCardAllowed: false,
      },
      {
        role: "implementation",
        owner: "plugin_source_thread",
        targetWorkspaceId: parsed.target,
        routeKind: "plugin_workspace",
      },
      {
        role: "product_audit",
        owner: "Plugin Workspace Audit",
        targetThreadTitle: "Plugin Workspace Audit",
        targetWorkspace: APP_WORKSPACE,
        routeKind: "plugin_audit",
      },
    ];
  }
  return [
    {
      role: "requirements",
      owner: "Home AI main thread",
      targetWorkspaceId: "home-ai",
      targetWorkspace: APP_WORKSPACE,
      sourceThreadRole: "home_ai_main",
      routeKind: "home_ai_requirements",
      dispatchMode: "source_thread_local_or_role_matched_card",
      taskCardDispatch: "only_when_source_thread_differs",
      sameThreadTaskCardAllowed: false,
    },
    {
      role: "implementation",
      owner: "Home AI Worker Lane",
      targetWorkspaceId: "home-ai",
      targetWorkspace: APP_WORKSPACE,
      cardKind: "home_ai_worker",
      routeKind: "home_ai_worker",
    },
    {
      role: "product_audit",
      owner: "Home AI Platform Audit",
      targetThreadTitle: "Home AI Platform Audit",
      targetWorkspace: APP_WORKSPACE,
      routeKind: "platform_audit",
    },
  ];
}

function normalizeCodexRuntimeStatus(input = {}) {
  const source = input.codexLoopRuntimeStatus && typeof input.codexLoopRuntimeStatus === "object"
    ? input.codexLoopRuntimeStatus
    : {};
  const available = input.codexRuntimeAvailable === false ? false : source.available !== false;
  const status = clean(source.status || (available ? "not_verified" : "blocked"), 80);
  return {
    required: true,
    owner: "codex_mobile_loop",
    available: status !== "blocked" && available,
    status,
    code: clean(source.code || source.error || "", 160),
    targetThreadId: clean(source.targetThreadId || "", 180),
    targetThreadTitle: clean(source.targetThreadTitle || "", 180),
    source: "codex-mobile",
  };
}

function nextRouteForAuditVerdict(verdict) {
  const normalized = safeToken(verdict, "", 120).replace(/-/g, "_");
  return VERDICT_NEXT_ROUTES[normalized] || "coordinator_review";
}

function buildLoopEngineeringPlan(input = {}) {
  const parsed = input.parsedTrigger && typeof input.parsedTrigger === "object"
    ? input.parsedTrigger
    : parseLoopTrigger(input);
  if (!parsed.hasLoopTrigger && !input.allowImplicit) {
    return { ok: false, status: 400, error: "loop_trigger_required", parsedTrigger: parsed };
  }
  const objective = clean(input.objective || parsed.objective, 1200);
  if (!objective) return { ok: false, status: 400, error: "loop_objective_required", parsedTrigger: parsed };
  const target = normalizeLoopTarget(input.target || parsed.target || "home-ai");
  const targetPlan = Object.assign({}, parsed, target, { objective });
  const loopType = clean(input.loopType || classifyLoopType(objective), 80);
  const codexRuntime = normalizeCodexRuntimeStatus(input);
  const roles = roleRoutesForTarget(targetPlan);
  const maxIterations = Math.max(1, Math.min(8, Number(input.maxIterations || DEFAULT_MAX_ITERATIONS) || DEFAULT_MAX_ITERATIONS));
  return {
    ok: true,
    schemaVersion: 1,
    loopPlanVersion: LOOP_PLAN_VERSION,
    runtimeOwner: "codex_mobile_loop",
    domainAdapter: targetPlan.domainAdapter,
    triggerSurface: clean(parsed.triggerSurface || input.triggerSurface || "codex_mobile_thread", 80),
    target: targetPlan.target,
    targetKind: targetPlan.targetKind,
    loopType,
    objective,
    roles,
    initialDispatchRole: "requirements",
    dispatchOrder: roles.map((role) => role.role),
    maxIterations,
    currentIteration: 1,
    breakCondition: "audit_passed_with_required_evidence",
    stopConditions: [
      "max_iterations_reached",
      "same_blocker_repeated_twice",
      "owner_decision_missing",
      "target_thread_unavailable",
      "ownership_unresolved",
    ],
    codexRuntime,
    auditPacket: auditPacketForTarget(targetPlan),
    requiredDocs: [
      "docs/IMPLEMENTATION_NOTES/loop-engineering.md",
      "docs/PLATFORM_CONTRACTS/autonomous-delivery-loop-contract.md",
      "docs/IMPLEMENTATION_NOTES/autonomous-delivery-loop.md",
      "docs/ARCHITECTURE_CODE_TEST_HARNESS_MAP.md",
      "docs/TEST_MATRIX.md",
    ],
    requiredChecks: requiredChecksForTarget(targetPlan.targetKind),
    privacyBoundary: {
      boundedMetadataOnly: true,
      exclude: [
        "raw_secrets",
        "cookies",
        "launch_tokens",
        "provider_payloads",
        "private_thread_bodies",
        "database_rows",
        "screenshots_with_private_content",
        "long_logs",
      ],
    },
    policy: {
      homeAiMustNotRunParallelRuntime: true,
      codexMobileOwnsTaskCardRuntime: true,
      ownerVisibleStatusOnlyUntilRuntimeAvailable: !codexRuntime.available,
      reasoningEffortFloor: "medium",
      terminalReturnRequired: true,
    },
  };
}

function buildLoopEngineeringStatusProjection(input = {}) {
  const plan = input.plan && typeof input.plan === "object"
    ? input.plan
    : buildLoopEngineeringPlan(Object.assign({ allowImplicit: true }, input));
  const explicitSourceStatus = input.codexLoopRuntimeStatus && typeof input.codexLoopRuntimeStatus === "object"
    ? input.codexLoopRuntimeStatus
    : {};
  const sourceStatus = Object.keys(explicitSourceStatus).length
    ? explicitSourceStatus
    : (plan.codexRuntime || {});
  const runtime = normalizeCodexRuntimeStatus(Object.assign({}, input, {
    codexLoopRuntimeStatus: sourceStatus,
  }));
  const blocked = runtime.status === "blocked" || runtime.available === false;
  const status = blocked ? "blocked" : clean(input.status || "ok", 80);
  const rawCounts = sourceStatus.counts && typeof sourceStatus.counts === "object" ? sourceStatus.counts : {};
  const runtimeItems = Array.isArray(sourceStatus.items)
    ? sourceStatus.items.slice(0, 20).map((item = {}) => {
      const candidate = item && typeof item === "object" ? item : {};
      return {
        loopId: clean(candidate.loopId || candidate.loop_id || candidate.id || "", 160),
        loopType: clean(candidate.loopType || candidate.loop_type || plan.loopType, 80),
        target: clean(candidate.target || plan.target, 120),
        targetKind: clean(candidate.targetKind || candidate.target_kind || plan.targetKind, 80),
        status: clean(candidate.status || candidate.state || "unknown", 80),
        currentRole: clean(candidate.currentRole || candidate.current_role || candidate.role || plan.initialDispatchRole || "requirements", 80),
        iteration: boundedNumber(candidate.iteration || candidate.currentIteration || candidate.current_iteration || plan.currentIteration || 1, 1),
        maxIterations: boundedNumber(candidate.maxIterations || candidate.max_iterations || plan.maxIterations || DEFAULT_MAX_ITERATIONS, DEFAULT_MAX_ITERATIONS),
        runtimeOwner: "codex_mobile_loop",
        runtimeStatus: runtime.status,
        blockedReason: blocked ? clean(runtime.code || candidate.blockedReason || candidate.blocked_reason || "codex_loop_runtime_unavailable", 180) : clean(candidate.blockedReason || candidate.blocked_reason || "", 180),
        nextRoute: clean(candidate.nextRoute || candidate.next_route || (blocked ? "codex_mobile_runtime_repair" : "requirements"), 120),
      };
    })
    : [];
  const fallbackItem = {
    loopType: clean(plan.loopType, 80),
    target: clean(plan.target, 120),
    targetKind: clean(plan.targetKind, 80),
    status: blocked ? "blocked" : "open",
    currentRole: clean(input.currentRole || plan.initialDispatchRole || "requirements", 80),
    iteration: boundedNumber(input.iteration || plan.currentIteration || 1, 1),
    maxIterations: boundedNumber(input.maxIterations || plan.maxIterations || DEFAULT_MAX_ITERATIONS, DEFAULT_MAX_ITERATIONS),
    runtimeOwner: "codex_mobile_loop",
    runtimeStatus: runtime.status,
    blockedReason: blocked ? clean(runtime.code || "codex_loop_runtime_unavailable", 180) : "",
    nextRoute: blocked ? "codex_mobile_runtime_repair" : clean(input.nextRoute || "requirements", 120),
  };
  const items = runtimeItems.length ? runtimeItems : [fallbackItem];
  return {
    ok: status === "ok",
    schemaVersion: 1,
    status,
    generatedAt: clean(input.generatedAt || new Date().toISOString(), 80),
    counts: {
      open: boundedNumber(input.open ?? rawCounts.open ?? (status === "ok" ? items.length : 0), status === "ok" ? items.length : 0),
      blocked: boundedNumber(input.blocked ?? rawCounts.blocked ?? (blocked ? 1 : 0), blocked ? 1 : 0),
      waitingReturn: boundedNumber(input.waitingReturn ?? rawCounts.waitingReturn ?? rawCounts.waiting_return, 0),
      duplicateSuppressed: boundedNumber(input.duplicateSuppressed ?? rawCounts.duplicateSuppressed ?? rawCounts.duplicate_suppressed, 0),
      verifiedClosed: boundedNumber(input.verifiedClosed ?? rawCounts.verifiedClosed ?? rawCounts.verified_closed, 0),
    },
    itemCount: boundedNumber(sourceStatus.itemCount ?? sourceStatus.item_count ?? items.length, items.length),
    items,
    source: {
      name: clean(sourceStatus.source?.name || sourceStatus.source || "loop-engineering-plan-service", 120),
      runtimeOwner: "codex_mobile_loop",
      domainAdapter: clean(plan.domainAdapter || "home_ai", 120),
    },
    policy: Object.assign({
      readOnlySummary: true,
      boundedMetadataOnly: true,
      homeAiMustNotRunParallelRuntime: true,
    }, boundedObject(sourceStatus.policy || {})),
  };
}

module.exports = {
  AUDIT_VERDICTS,
  LOOP_PLAN_VERSION,
  LOOP_ROLES,
  buildLoopEngineeringPlan,
  buildLoopEngineeringStatusProjection,
  classifyLoopType,
  nextRouteForAuditVerdict,
  normalizeLoopTarget,
  parseLoopTrigger,
};
