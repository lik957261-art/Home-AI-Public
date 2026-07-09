"use strict";

const crypto = require("node:crypto");
const {
  normalizeTaskCardReasoningEffort,
} = require("./task-card-dispatch-idempotency-service");
const {
  validateCentralGovernanceWorkerCard,
} = require("./central-deploy-governance-service");

const DEFAULT_DEPLOY_THREAD_TITLES = Object.freeze([
  "Home AI Deploy",
  "Home AI Deploy Lane A",
  "Home AI Deploy Lane B",
  "Home AI Deploy Lane C",
  "Codex Mobile Deploy Lane",
  "Movie Deploy Lane",
]);

const DEFAULT_DEPLOY_LANE_ASSIGNMENTS = Object.freeze({
  "codex-mobile": "Codex Mobile Deploy Lane",
  "codex-mobile-web": "Codex Mobile Deploy Lane",
  movie: "Movie Deploy Lane",
});

const DEFAULT_HOME_AI_IMPLEMENTATION_THREAD_TITLES = Object.freeze([
  "Home AI Worker Lane A",
  "Home AI Worker Lane B",
  "Home AI Worker Lane C",
]);

function clean(value, max = 240) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 240));
}

function normalizePath(value) {
  return clean(value, 2000).replace(/\\/g, "/").replace(/\/+$/g, "");
}

function threadIdOf(thread = {}) {
  return clean(thread.id || thread.threadId || thread.thread_id, 160);
}

function threadTitleOf(thread = {}) {
  return clean(thread.title || thread.name || thread.threadTitle || thread.thread_title, 240);
}

function threadCwdOf(thread = {}) {
  return normalizePath(thread.cwd || thread.workspace || thread.workspaceCwd || thread.workspace_cwd);
}

function threadPluginIdOf(thread = {}) {
  return clean(thread.pluginId || thread.plugin_id || thread.plugin || thread.targetPlugin || thread.target_plugin || "", 120).toLowerCase();
}

function threadUpdatedAt(thread = {}) {
  const numeric = Number(thread.updatedAt || thread.updated_at || thread.lastActivityAt || thread.last_activity_at || 0);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(clean(thread.updatedAt || thread.updated_at || "", 80));
  return Number.isFinite(parsed) ? parsed : 0;
}

function stableHash(value) {
  return Number.parseInt(crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 8), 16);
}

function isTerminalThread(thread = {}) {
  const status = clean(thread.status || thread.state || "", 80).toLowerCase();
  return /^(closed|archived|terminal|deleted)$/.test(status);
}

function threadDispatchUnavailableReason(thread = {}) {
  if (!thread || typeof thread !== "object") return "thread_missing";
  const status = clean(thread.status?.type || thread.status || thread.state || thread.lifecycleStatus || thread.lifecycle_status || "", 80).toLowerCase();
  if (thread.archived || thread.isArchived || thread.is_archived || status === "archived") return "thread_archived";
  if (thread.deleted || thread.isDeleted || thread.is_deleted || status === "deleted") return "thread_deleted";
  if (thread.closed || thread.isClosed || thread.is_closed || status === "closed") return "thread_closed";
  if (thread.hidden || thread.isHidden || thread.is_hidden || thread.visible === false) return "thread_hidden";
  if (thread.deliverable === false || thread.canReceiveTaskCards === false || thread.can_receive_task_cards === false) {
    return "thread_task_card_delivery_unavailable";
  }
  if (status === "terminal") return "thread_terminal";
  return "";
}

function isDispatchableThread(thread = {}) {
  return !threadDispatchUnavailableReason(thread);
}

function normalizeDispatchKind(kind) {
  return clean(kind, 100).toLowerCase().replace(/-/g, "_");
}

function isDeployDispatchKind(kind) {
  const text = normalizeDispatchKind(kind);
  return ["deployment", "deploy", "plugin_deployment"].includes(text);
}

function isImplementationDispatchKind(kind) {
  const text = normalizeDispatchKind(kind);
  return [
    "home_ai_worker",
    "home_ai_implementation",
    "implementation",
    "implementation_worker",
    "loop_implementation",
    "runtime_implementation",
  ].includes(text);
}

function isPluginWorkerDispatchKind(kind) {
  const text = normalizeDispatchKind(kind);
  return [
    "plugin_worker",
    "plugin_implementation",
    "plugin_main_worker",
    "plugin_workspace_worker",
  ].includes(text);
}

function isPluginLoopDispatchKind(kind) {
  const text = normalizeDispatchKind(kind);
  return [
    "plugin_loop",
    "loop_implementation",
    "loop_role",
    "role_loop",
  ].includes(text);
}

function isAuditDispatchKind(kind) {
  const text = normalizeDispatchKind(kind);
  return ["audit", "plugin", "platform", "plugin_audit", "platform_audit", "workspace_audit"].includes(text)
    || text.endsWith("_audit");
}

function isTaskIntakeDispatchKind(kind) {
  const text = normalizeDispatchKind(kind);
  return ["intake", "task_intake", "owner_intake", "diagnostic_intake"].includes(text);
}

function isPublicPrDispatchKind(kind) {
  const text = normalizeDispatchKind(kind);
  return ["public_pr", "github_pr", "pull_request", "pr"].includes(text);
}

function threadPurposeOf(thread = {}) {
  const explicit = normalizeDispatchKind(
    thread.purpose
      || thread.threadPurpose
      || thread.thread_purpose
      || thread.role
      || thread.threadRole
      || thread.thread_role
      || "",
  );
  if (isPublicPrDispatchKind(explicit)) return "public_pr";
  if (isDeployDispatchKind(explicit)) return "deploy";
  if (isAuditDispatchKind(explicit)) return "audit";
  if (isTaskIntakeDispatchKind(explicit)) return "task_intake";
  if (isPluginLoopDispatchKind(explicit)) return "plugin_loop";
  if (isPluginWorkerDispatchKind(explicit)) return "plugin_worker";
  if (
    explicit.endsWith("_implementation")
    && !["home_ai_implementation", "implementation", "implementation_worker", "runtime_implementation"].includes(explicit)
  ) {
    return "plugin_worker";
  }
  if (isImplementationDispatchKind(explicit)) return "implementation_worker";

  const title = threadTitleOf(thread).toLowerCase();
  if (/\b(public\s+pr|pull\s+request|pr\s+(merge|review|thread))\b/.test(title)) return "public_pr";
  if (/\bdeploy(?:\s+lane)?\b/.test(title)) return "deploy";
  if (/\baudit\b/.test(title)) return "audit";
  if (/\btask\s+intake\b/.test(title)) return "task_intake";
  if (/\bhome\s+ai\b.*\bworker\s+lane\b/.test(title)) return "implementation_worker";
  if (/\bworker\s+lane\b/.test(title)) return "plugin_worker";
  if (/\bloop\b/.test(title)) return "plugin_loop";
  return "general";
}

function isThreadPurposeAllowedForDispatch(thread = {}, kind = "") {
  const purpose = threadPurposeOf(thread);
  if (purpose === "public_pr") return isPublicPrDispatchKind(kind);
  if (purpose === "deploy") return isDeployDispatchKind(kind);
  if (purpose === "audit") return isAuditDispatchKind(kind);
  if (purpose === "task_intake") return isTaskIntakeDispatchKind(kind);
  if (purpose === "plugin_loop") return isPluginLoopDispatchKind(kind);
  if (purpose === "plugin_worker") return isPluginWorkerDispatchKind(kind);
  if (purpose === "implementation_worker") return isImplementationDispatchKind(kind);
  return true;
}

function normalizeTargetThread(input = {}) {
  const target = input.thread || input.targetThread || input.target || {};
  if (target && typeof target === "object" && Object.keys(target).length) return target;
  return {
    id: input.targetThreadId || input.target_thread_id || input.threadId || input.thread_id,
    title: input.targetThreadTitle || input.target_thread_title || input.threadTitle || input.thread_title,
    cwd: input.targetCwd || input.target_cwd || input.targetWorkspace || input.target_workspace,
    purpose: input.targetThreadPurpose || input.target_thread_purpose,
    role: input.targetThreadRole || input.target_thread_role,
    status: input.targetThreadStatus || input.target_thread_status || input.status,
    visible: input.targetThreadVisible,
    deliverable: input.targetThreadDeliverable,
    canReceiveTaskCards: input.targetThreadCanReceiveTaskCards,
    archived: input.targetThreadArchived,
    deleted: input.targetThreadDeleted,
    closed: input.targetThreadClosed,
    hidden: input.targetThreadHidden,
  };
}

function dispatchTargetIssue(code, detail = "", thread = {}, kind = "") {
  return {
    ok: false,
    code: clean(code, 120),
    detail: clean(detail, 360),
    dispatchKind: clean(kind, 100),
    targetThreadId: threadIdOf(thread),
    targetThreadTitle: threadTitleOf(thread),
    targetThreadPurpose: threadPurposeOf(thread),
    targetThreadCwd: threadCwdOf(thread),
  };
}

function validateThreadDispatchTarget(input = {}) {
  const thread = normalizeTargetThread(input);
  const kind = clean(input.kind || input.dispatchKind || input.dispatch_kind || input.cardKind || input.card_kind, 100);
  const sourceThreadId = clean(input.sourceThreadId || input.source_thread_id, 160);
  const targetThreadId = threadIdOf(thread);
  const targetThreadTitle = threadTitleOf(thread);
  if (!targetThreadId && !targetThreadTitle) {
    return dispatchTargetIssue("target_thread_missing", "A dispatch target requires a thread id or title.", thread, kind);
  }
  if (sourceThreadId && targetThreadId && sourceThreadId === targetThreadId) {
    return dispatchTargetIssue("target_thread_self", "Task-card dispatch requires sourceThreadId and targetThreadId to differ.", thread, kind);
  }
  const unavailableReason = threadDispatchUnavailableReason(thread);
  if (unavailableReason) {
    return dispatchTargetIssue(unavailableReason, "The target thread is explicitly non-deliverable.", thread, kind);
  }
  if (kind && !isThreadPurposeAllowedForDispatch(thread, kind)) {
    return dispatchTargetIssue(
      "thread_purpose_mismatch",
      "Thread role/purpose does not match the requested task-card kind; cwd matches are not sufficient.",
      thread,
      kind,
    );
  }
  if (kind && isImplementationDispatchKind(kind)) {
    const governance = validateCentralGovernanceWorkerCard(Object.assign({}, input, {
      directWorkerImplementation: true,
    }));
    if (!governance.ok) {
      return dispatchTargetIssue(
        governance.issueCode || "central_contract_work_requires_main_thread_design",
        "Central deploy/platform governance implementation must start from Home AI main/coordinator design.",
        thread,
        kind,
      );
    }
  }
  return {
    ok: true,
    code: "",
    dispatchKind: kind,
    targetThreadId,
    targetThreadTitle,
    targetThreadPurpose: threadPurposeOf(thread),
    targetThreadCwd: threadCwdOf(thread),
  };
}

function implementationLoadScore(thread = {}) {
  const status = clean(thread.status?.type || thread.status || thread.state || thread.lifecycleStatus || thread.lifecycle_status || "", 80).toLowerCase();
  if (thread.activeTaskCardId || thread.active_task_card_id || thread.executionLeaseActive || thread.execution_lease_active) return 3;
  if (/idle|ready|active/.test(status)) return 0;
  if (/available|completed/.test(status)) return 1;
  if (/running|working|busy/.test(status)) return 2;
  if (/blocked|error|failed/.test(status)) return 8;
  return 1;
}

function looksLikeTaskTitleWorker(thread = {}) {
  const title = threadTitleOf(thread).toLowerCase();
  if (!title) return false;
  if (/\bworker\s+lane\b/.test(title)) return false;
  return /\b(fix|repair|diagnostic|diagcase|incident|bug|empty\s+detail|projection|implementation|worker\s+.+\b(?:warning|error|failed|blocked))\b/.test(title);
}

function selectByLoadAndRequestKey(candidates = [], requestKey = "") {
  const sorted = [...candidates].sort((a, b) => (
    implementationLoadScore(a) - implementationLoadScore(b)
    || threadUpdatedAt(a) - threadUpdatedAt(b)
    || threadTitleOf(a).localeCompare(threadTitleOf(b))
    || threadIdOf(a).localeCompare(threadIdOf(b))
  ));
  const bestScore = implementationLoadScore(sorted[0]);
  const best = sorted.filter((thread) => implementationLoadScore(thread) === bestScore);
  const key = clean(requestKey, 240);
  return key && best.length > 1 ? best[stableHash(key) % best.length] : best[0];
}

function selectWorkerLaneForDispatch(input = {}) {
  const role = normalizeDispatchKind(input.role || input.dispatchKind || input.dispatch_kind || "home_ai_worker");
  const dispatchKind = isPluginWorkerDispatchKind(role) ? "plugin_worker" : "home_ai_worker";
  const cwd = normalizePath(input.cwd || input.workspaceCwd || input.workspace_cwd || input.sourceWorkspaceCwd || "");
  const pluginId = clean(input.pluginId || input.plugin_id || "", 120).toLowerCase();
  const sourceThreadId = clean(input.sourceThreadId || input.source_thread_id, 180);
  const threads = Array.isArray(input.threads) ? input.threads : [];
  const compatible = threads
    .filter((thread) => isDispatchableThread(thread))
    .filter((thread) => isThreadPurposeAllowedForDispatch(thread, dispatchKind))
    .filter((thread) => !sourceThreadId || threadIdOf(thread) !== sourceThreadId)
    .filter((thread) => !cwd || threadCwdOf(thread) === cwd)
    .filter((thread) => {
      if (!pluginId || dispatchKind !== "plugin_worker") return true;
      const threadPluginId = threadPluginIdOf(thread);
      return !threadPluginId || threadPluginId === pluginId;
    });
  const stable = compatible.filter((thread) => !looksLikeTaskTitleWorker(thread));
  const pool = stable.length ? stable : compatible;
  if (!pool.length) {
    return {
      ok: false,
      code: "missing_role_lane",
      createReason: "missing_role_lane",
      role: dispatchKind,
      pluginId,
      cwd,
      candidateCount: threads.length,
    };
  }
  const available = pool.filter((thread) => implementationLoadScore(thread) <= 1);
  if (!available.length) {
    return {
      ok: false,
      code: "pool_exhausted",
      createReason: "pool_exhausted",
      role: dispatchKind,
      pluginId,
      cwd,
      candidateCount: pool.length,
    };
  }
  const selected = selectByLoadAndRequestKey(available, input.requestKey || input.requestId || input.request_id || input.idempotencyKey || "");
  return {
    ok: true,
    lane: selected,
    laneId: threadIdOf(selected),
    laneTitle: threadTitleOf(selected),
    laneCwd: threadCwdOf(selected),
    role: dispatchKind,
    pluginId,
    loadScore: implementationLoadScore(selected),
    selectedFromCandidateCount: compatible.length,
    needsTitleNormalization: looksLikeTaskTitleWorker(selected),
  };
}

function selectDeployLane(input = {}) {
  const cwd = normalizePath(input.cwd || input.sourceWorkspaceCwd || "");
  const pluginId = clean(input.pluginId || input.plugin || input.deployPluginId || input.deploy_plugin_id || input.targetPlugin || "", 120).toLowerCase();
  const titles = Array.isArray(input.deployThreadTitles) && input.deployThreadTitles.length
    ? input.deployThreadTitles.map((item) => clean(item, 160)).filter(Boolean)
    : [...DEFAULT_DEPLOY_THREAD_TITLES];
  const assignments = Object.assign({}, DEFAULT_DEPLOY_LANE_ASSIGNMENTS, input.deployLaneAssignments || {});
  const allowed = new Set(titles);
  const candidates = (Array.isArray(input.threads) ? input.threads : [])
    .filter((thread) => allowed.has(threadTitleOf(thread)))
    .filter((thread) => isDispatchableThread(thread))
    .filter((thread) => !cwd || threadCwdOf(thread) === cwd)
    .sort((a, b) => titles.indexOf(threadTitleOf(a)) - titles.indexOf(threadTitleOf(b)) || threadUpdatedAt(b) - threadUpdatedAt(a));
  if (!candidates.length) {
    return {
      ok: false,
      code: "deploy_lane_not_available",
      deployThreadTitles: titles,
      pluginId,
      cwd,
    };
  }
  const assignedTitle = pluginId ? assignments[pluginId] : "";
  const assigned = assignedTitle ? candidates.find((thread) => threadTitleOf(thread) === assignedTitle) : null;
  const selected = assigned || (pluginId && candidates.length > 1 ? candidates[stableHash(pluginId) % candidates.length] : candidates[0]);
  return {
    ok: true,
    lane: selected,
    laneId: threadIdOf(selected),
    laneTitle: threadTitleOf(selected),
    laneCwd: threadCwdOf(selected),
    pluginId,
    dedicated: Boolean(assigned),
    fallbackPoolUsed: Boolean(assignedTitle && !assigned),
  };
}

function selectImplementationWorkerLane(input = {}) {
  const cwd = normalizePath(input.cwd || input.sourceWorkspaceCwd || "");
  const titles = Array.isArray(input.implementationThreadTitles) && input.implementationThreadTitles.length
    ? input.implementationThreadTitles.map((item) => clean(item, 160)).filter(Boolean)
    : [...DEFAULT_HOME_AI_IMPLEMENTATION_THREAD_TITLES];
  const allowed = new Set(titles);
  const candidates = (Array.isArray(input.threads) ? input.threads : [])
    .filter((thread) => allowed.has(threadTitleOf(thread)))
    .filter((thread) => isDispatchableThread(thread))
    .filter((thread) => !cwd || threadCwdOf(thread) === cwd)
    .sort((a, b) => implementationLoadScore(a) - implementationLoadScore(b) || threadUpdatedAt(a) - threadUpdatedAt(b));
  if (!candidates.length) {
    return {
      ok: false,
      code: "worker_lane_not_available",
      implementationThreadTitles: titles,
      cwd,
    };
  }
  const bestScore = implementationLoadScore(candidates[0]);
  const best = candidates.filter((thread) => implementationLoadScore(thread) === bestScore);
  const requestKey = clean(input.requestKey || input.requestId || input.request_id || input.title || "", 240);
  const selected = requestKey && best.length > 1 ? best[stableHash(requestKey) % best.length] : best[0];
  return {
    ok: true,
    lane: selected,
    laneId: threadIdOf(selected),
    laneTitle: threadTitleOf(selected),
    laneCwd: threadCwdOf(selected),
    loadScore: implementationLoadScore(selected),
  };
}

function buildWorkerDispatchPolicy(input = {}) {
  const severity = clean(input.severity || input.harnessClass || input.harness_class || "", 20);
  const risk = clean(input.risk || "", 20);
  return {
    reasoningEffort: normalizeTaskCardReasoningEffort({
      requested: input.reasoningEffort || input.reasoning_effort,
      severity,
      risk,
    }, { min: "medium" }),
    terminalReturnRequired: true,
    terminalReturnLanguageZhCn: true,
    taskCardHeartbeatRequired: true,
    taskCardWatchdogTimeoutMs: 1_800_000,
    taskCardWatchdogBatchLimit: 8,
    taskCardWatchdogMaxAutoResume: 1,
    taskCardWatchdogAction: "activate_or_resume_task_card",
    boundedMetadataOnly: true,
    workerPoolLifecycle: {
      resolveBeforeCreate: true,
      stableWorkerPoolRequired: true,
      taskTitleWorkerNamesForbidden: true,
      markBusyWhileActive: true,
      releaseAfterTerminalReturn: true,
      allowedCreateReasons: ["missing_role_lane", "pool_exhausted", "no_legal_lane"],
    },
    conflictRule: "return_blocked_or_partially_completed_on_overlap",
  };
}

module.exports = {
  DEFAULT_DEPLOY_LANE_ASSIGNMENTS,
  DEFAULT_DEPLOY_THREAD_TITLES,
  DEFAULT_HOME_AI_IMPLEMENTATION_THREAD_TITLES,
  buildWorkerDispatchPolicy,
  implementationLoadScore,
  isTerminalThread,
  isDispatchableThread,
  isThreadPurposeAllowedForDispatch,
  selectDeployLane,
  selectImplementationWorkerLane,
  selectWorkerLaneForDispatch,
  threadDispatchUnavailableReason,
  threadCwdOf,
  threadIdOf,
  threadPluginIdOf,
  threadPurposeOf,
  threadTitleOf,
  validateThreadDispatchTarget,
};
