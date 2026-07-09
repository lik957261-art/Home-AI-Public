"use strict";

const assert = require("node:assert/strict");
const {
  buildWorkerDispatchPolicy,
  isDispatchableThread,
  isThreadPurposeAllowedForDispatch,
  selectDeployLane,
  selectImplementationWorkerLane,
  selectWorkerLaneForDispatch,
  threadDispatchUnavailableReason,
  threadPurposeOf,
  validateThreadDispatchTarget,
} = require("../adapters/worker-lane-scheduler-service");

const cwd = "/Users/example/path";

function thread(id, title, status = "idle", updatedAt = 100) {
  return { id, title, cwd, status, updatedAt };
}

function testDeployLanePrefersDedicatedPluginLane() {
  const threads = [
    thread("deploy-home", "Home AI Deploy", "idle", 300),
    thread("deploy-codex", "Codex Mobile Deploy Lane", "idle", 200),
    thread("deploy-movie", "Movie Deploy Lane", "idle", 100),
  ];
  const codex = selectDeployLane({ threads, cwd, pluginId: "codex-mobile-web" });
  const movie = selectDeployLane({ threads, cwd, pluginId: "movie" });
  assert.equal(codex.ok, true);
  assert.equal(codex.laneTitle, "Codex Mobile Deploy Lane");
  assert.equal(codex.dedicated, true);
  assert.equal(movie.laneTitle, "Movie Deploy Lane");
}

function testDeployLaneFallsBackWhenDedicatedLaneTerminal() {
  const result = selectDeployLane({
    threads: [
      thread("deploy-home", "Home AI Deploy", "idle", 300),
      Object.assign(thread("deploy-codex", "Codex Mobile Deploy Lane", "archived", 500), { archived: true }),
    ],
    cwd,
    pluginId: "codex-mobile-web",
  });
  assert.equal(result.ok, true);
  assert.equal(result.laneTitle, "Home AI Deploy");
  assert.equal(result.fallbackPoolUsed, true);
}

function testCompletedDeployLaneRemainsDispatchable() {
  const result = selectDeployLane({
    threads: [
      thread("deploy-home", "Home AI Deploy", "idle", 300),
      thread("deploy-codex", "Codex Mobile Deploy Lane", "completed", 500),
    ],
    cwd,
    pluginId: "codex-mobile-web",
  });
  assert.equal(result.ok, true);
  assert.equal(result.laneTitle, "Codex Mobile Deploy Lane");
  assert.equal(result.dedicated, true);
}

function testImplementationWorkerLaneUsesLoadThenRequestKey() {
  const result = selectImplementationWorkerLane({
    threads: [
      thread("worker-a", "Home AI Worker Lane A", "busy", 100),
      thread("worker-b", "Home AI Worker Lane B", "idle", 300),
      thread("worker-c", "Home AI Worker Lane C", "idle", 200),
    ],
    cwd,
    requestKey: "delivery_1:implement",
  });
  assert.equal(result.ok, true);
  assert.equal(["Home AI Worker Lane B", "Home AI Worker Lane C"].includes(result.laneTitle), true);
  assert.equal(result.loadScore, 0);
}

function testCompletedThreadRemainsDispatchable() {
  const result = selectImplementationWorkerLane({
    threads: [
      thread("worker-a", "Home AI Worker Lane A", "completed", 400),
    ],
    cwd,
    requestKey: "delivery_2:implement",
  });
  assert.equal(isDispatchableThread(thread("worker-a", "Home AI Worker Lane A", "completed", 400)), true);
  assert.equal(result.ok, true);
  assert.equal(result.laneTitle, "Home AI Worker Lane A");
}

function testPluginWorkerMultipleCandidatesSelectsDeterministically() {
  const threads = [
    Object.assign(thread("music-worker-a", "Music Worker Lane A", "idle", 100), {
      role: "plugin_worker",
      pluginId: "music",
      cwd: "/Users/example/path",
    }),
    Object.assign(thread("music-worker-b", "Music Worker Lane B", "idle", 200), {
      role: "plugin_worker",
      pluginId: "music",
      cwd: "/Users/example/path",
    }),
    Object.assign(thread("music-loop", "Music Loop Implement", "idle", 300), {
      role: "plugin_loop",
      pluginId: "music",
      cwd: "/Users/example/path",
    }),
  ];
  const first = selectWorkerLaneForDispatch({
    threads,
    role: "plugin_worker",
    pluginId: "music",
    cwd: "/Users/example/path",
    sourceThreadId: "music-main",
    requestKey: "music-source-list-cache-loop",
  });
  const second = selectWorkerLaneForDispatch({
    threads,
    role: "plugin_worker",
    pluginId: "music",
    cwd: "/Users/example/path",
    sourceThreadId: "music-main",
    requestKey: "music-source-list-cache-loop",
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.laneId, second.laneId);
  assert.match(first.laneTitle, /^Music Worker Lane [AB]$/);
  assert.equal(first.selectedFromCandidateCount, 2);
}

function testPluginWorkerBusyPoolReturnsCreateReasonNotAmbiguous() {
  const result = selectWorkerLaneForDispatch({
    threads: [
      Object.assign(thread("music-worker-a", "Music Worker Lane A", "busy", 100), {
        role: "plugin_worker",
        pluginId: "music",
        cwd: "/Users/example/path",
        activeTaskCardId: "ttc_active_a",
      }),
      Object.assign(thread("music-worker-b", "Music Worker Lane B", "running", 200), {
        role: "plugin_worker",
        pluginId: "music",
        cwd: "/Users/example/path",
        activeTaskCardId: "ttc_active_b",
      }),
    ],
    role: "plugin_worker",
    pluginId: "music",
    cwd: "/Users/example/path",
    requestKey: "music-next-card",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "pool_exhausted");
  assert.equal(result.createReason, "pool_exhausted");
  assert.equal(result.candidateCount, 2);
}

function testArchivedHiddenAndUndeliverableThreadsAreExcluded() {
  const archived = Object.assign(thread("worker-a", "Home AI Worker Lane A", "idle", 100), { archived: true });
  const hidden = Object.assign(thread("worker-b", "Home AI Worker Lane B", "idle", 200), { visible: false });
  const undeliverable = Object.assign(thread("worker-c", "Home AI Worker Lane C", "idle", 300), { canReceiveTaskCards: false });
  const result = selectImplementationWorkerLane({
    threads: [archived, hidden, undeliverable],
    cwd,
  });
  assert.equal(threadDispatchUnavailableReason(archived), "thread_archived");
  assert.equal(threadDispatchUnavailableReason(hidden), "thread_hidden");
  assert.equal(threadDispatchUnavailableReason(undeliverable), "thread_task_card_delivery_unavailable");
  assert.equal(result.ok, false);
  assert.equal(result.code, "worker_lane_not_available");
}

function testWorkerDispatchPolicyEffortFloor() {
  const policy = buildWorkerDispatchPolicy({
    reasoningEffort: "low",
    severity: "H2",
  });
  assert.equal(policy.reasoningEffort, "high");
  assert.equal(policy.terminalReturnRequired, true);
  assert.equal(policy.terminalReturnLanguageZhCn, true);
  assert.equal(policy.taskCardHeartbeatRequired, true);
  assert.equal(policy.taskCardWatchdogTimeoutMs, 1_800_000);
  assert.equal(policy.taskCardWatchdogBatchLimit, 8);
  assert.equal(policy.taskCardWatchdogMaxAutoResume, 1);
  assert.equal(policy.taskCardWatchdogAction, "activate_or_resume_task_card");
  assert.equal(policy.workerPoolLifecycle.resolveBeforeCreate, true);
  assert.equal(policy.workerPoolLifecycle.stableWorkerPoolRequired, true);
  assert.equal(policy.workerPoolLifecycle.taskTitleWorkerNamesForbidden, true);
  assert.deepEqual(policy.workerPoolLifecycle.allowedCreateReasons, ["missing_role_lane", "pool_exhausted", "no_legal_lane"]);
  assert.equal(policy.conflictRule, "return_blocked_or_partially_completed_on_overlap");
}

function testThreadPurposeGuardRejectsMismatchedSpecialThreads() {
  assert.equal(threadPurposeOf(thread("pr", "Codex Mobile Public PR")), "public_pr");
  assert.equal(threadPurposeOf(thread("deploy", "Codex Mobile Deploy Lane")), "deploy");
  assert.equal(threadPurposeOf(thread("intake", "Home AI Task Intake")), "task_intake");
  assert.equal(threadPurposeOf(thread("worker", "Home AI Worker Lane A")), "implementation_worker");
  assert.equal(threadPurposeOf(thread("plugin-worker", "Movie Worker Lane A")), "plugin_worker");
  assert.equal(threadPurposeOf(Object.assign(thread("loop", "Movie Loop Implement"), { role: "plugin_loop" })), "plugin_loop");
  assert.equal(threadPurposeOf(Object.assign(thread("codex", "codex mobile 07-04"), { role: "codex_mobile_implementation" })), "plugin_worker");
  assert.equal(isThreadPurposeAllowedForDispatch(thread("pr", "Codex Mobile Public PR"), "implementation"), false);
  assert.equal(isThreadPurposeAllowedForDispatch(thread("pr", "Codex Mobile Public PR"), "public_pr"), true);
  assert.equal(isThreadPurposeAllowedForDispatch(thread("deploy", "Codex Mobile Deploy Lane"), "plugin_deployment"), true);
  assert.equal(isThreadPurposeAllowedForDispatch(thread("deploy", "Codex Mobile Deploy Lane"), "implementation"), false);
  assert.equal(isThreadPurposeAllowedForDispatch(thread("intake", "Home AI Task Intake"), "home_ai_worker"), false);
  assert.equal(isThreadPurposeAllowedForDispatch(thread("intake", "Home AI Task Intake"), "task_intake"), true);
  assert.equal(isThreadPurposeAllowedForDispatch(thread("worker", "Home AI Worker Lane A"), "home_ai_worker"), true);
  assert.equal(isThreadPurposeAllowedForDispatch(thread("worker", "Home AI Worker Lane A"), "plugin_deployment"), false);
  assert.equal(isThreadPurposeAllowedForDispatch(thread("plugin-worker", "Movie Worker Lane A"), "plugin_worker"), true);
  assert.equal(isThreadPurposeAllowedForDispatch(thread("plugin-worker", "Movie Worker Lane A"), "home_ai_worker"), false);
  assert.equal(isThreadPurposeAllowedForDispatch(thread("plugin-worker", "Movie Worker Lane A"), "plugin_deployment"), false);
  assert.equal(isThreadPurposeAllowedForDispatch(Object.assign(thread("loop", "Movie Loop Implement"), { role: "plugin_loop" }), "plugin_worker"), false);
  assert.equal(isThreadPurposeAllowedForDispatch(Object.assign(thread("loop", "Movie Loop Implement"), { role: "plugin_loop" }), "plugin_loop"), true);
}

function testDispatchTargetValidationRejectsTaskIntakeWorkerFallback() {
  const result = validateThreadDispatchTarget({
    sourceThreadId: "source-main",
    targetThread: thread("intake", "Home AI Task Intake", "idle", 500),
    dispatchKind: "home_ai_worker",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "thread_purpose_mismatch");
  assert.equal(result.targetThreadPurpose, "task_intake");
}

function testDispatchTargetValidationRejectsSelfTarget() {
  const result = validateThreadDispatchTarget({
    sourceThreadId: "same-thread",
    targetThread: thread("same-thread", "Home AI Worker Lane A", "idle", 500),
    dispatchKind: "home_ai_worker",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "target_thread_self");
}

function testDispatchTargetValidationAcceptsCompletedWorkerLane() {
  const result = validateThreadDispatchTarget({
    sourceThreadId: "source-main",
    targetThread: thread("worker-a", "Home AI Worker Lane A", "completed", 500),
    dispatchKind: "home_ai_worker",
  });
  assert.equal(result.ok, true);
  assert.equal(result.targetThreadPurpose, "implementation_worker");
}

function testDispatchTargetValidationAcceptsCompletedPluginWorkerLane() {
  const result = validateThreadDispatchTarget({
    sourceThreadId: "movie-main",
    targetThread: thread("movie-worker-a", "Movie Worker Lane A", "completed", 500),
    dispatchKind: "plugin_worker",
  });
  assert.equal(result.ok, true);
  assert.equal(result.targetThreadPurpose, "plugin_worker");
}

function testDispatchTargetValidationRejectsPluginWorkerToDeployLane() {
  const result = validateThreadDispatchTarget({
    sourceThreadId: "movie-main",
    targetThread: thread("movie-deploy", "Movie Deploy Lane", "idle", 500),
    dispatchKind: "plugin_worker",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "thread_purpose_mismatch");
  assert.equal(result.targetThreadPurpose, "deploy");
}

function testDispatchTargetValidationRejectsPluginLoopAsWorker() {
  const result = validateThreadDispatchTarget({
    sourceThreadId: "movie-main",
    targetThread: Object.assign(thread("movie-loop", "Movie Loop Implement", "idle", 500), { role: "plugin_loop" }),
    dispatchKind: "plugin_worker",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "thread_purpose_mismatch");
  assert.equal(result.targetThreadPurpose, "plugin_loop");
}

function testDispatchTargetValidationRejectsPluginImplementationAsHomeAiWorker() {
  const result = validateThreadDispatchTarget({
    sourceThreadId: "home-ai-main",
    targetThread: Object.assign(thread("codex", "codex mobile 07-04", "idle", 500), { role: "codex_mobile_implementation" }),
    dispatchKind: "home_ai_worker",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "thread_purpose_mismatch");
  assert.equal(result.targetThreadPurpose, "plugin_worker");
}

function testDispatchTargetValidationRejectsDirectCentralGovernanceWorkerCardFromPluginSource() {
  const result = validateThreadDispatchTarget({
    sourceThreadId: "codex-mobile-main",
    sourceRole: "plugin_source_thread",
    category: "central_contract_governance",
    requiresMainThreadDesign: true,
    forbiddenDirectWorkerImplementation: true,
    taskCardId: "ttc_5c9dd2b26327404d00",
    targetThread: thread("worker-c", "Home AI Worker Lane C", "idle", 500),
    dispatchKind: "home_ai_worker",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "platform_governance_card_must_start_from_home_ai_main");
  assert.equal(result.targetThreadPurpose, "implementation_worker");
}

testDeployLanePrefersDedicatedPluginLane();
testDeployLaneFallsBackWhenDedicatedLaneTerminal();
testCompletedDeployLaneRemainsDispatchable();
testImplementationWorkerLaneUsesLoadThenRequestKey();
testCompletedThreadRemainsDispatchable();
testPluginWorkerMultipleCandidatesSelectsDeterministically();
testPluginWorkerBusyPoolReturnsCreateReasonNotAmbiguous();
testArchivedHiddenAndUndeliverableThreadsAreExcluded();
testWorkerDispatchPolicyEffortFloor();
testThreadPurposeGuardRejectsMismatchedSpecialThreads();
testDispatchTargetValidationRejectsTaskIntakeWorkerFallback();
testDispatchTargetValidationRejectsSelfTarget();
testDispatchTargetValidationAcceptsCompletedWorkerLane();
testDispatchTargetValidationAcceptsCompletedPluginWorkerLane();
testDispatchTargetValidationRejectsPluginWorkerToDeployLane();
testDispatchTargetValidationRejectsPluginLoopAsWorker();
testDispatchTargetValidationRejectsPluginImplementationAsHomeAiWorker();
testDispatchTargetValidationRejectsDirectCentralGovernanceWorkerCardFromPluginSource();
console.log("worker lane scheduler service tests passed");
