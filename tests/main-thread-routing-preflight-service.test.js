"use strict";

const assert = require("node:assert/strict");
const {
  PREFLIGHT_VERSION,
  buildMainThreadRoutingPreflight,
} = require("../adapters/main-thread-routing-preflight-service");

function testSimpleStatusClassifiesInline() {
  const result = buildMainThreadRoutingPreflight({
    task: "现在 Home AI Worker Lane B 状态是什么？",
  });
  assert.equal(result.ok, true);
  assert.equal(result.version, PREFLIGHT_VERSION);
  assert.equal(result.classification, "inline");
  assert.equal(result.reasonCode, "simple_status_or_answer");
  assert.equal(result.implementationMayProceedInline, true);
}

function testHomeAiSourceRepairRequiresWorkerCardFields() {
  const result = buildMainThreadRoutingPreflight({
    task: "修复 Codex Mobile thread mismatch 模块，并更新对应测试",
    changedFile: "adapters/codex-thread-task-card-service.js",
  });
  assert.equal(result.ok, true);
  assert.equal(result.classification, "worker");
  assert.equal(result.reasonCode, "home_ai_worker_required");
  assert.equal(result.inlineAllowed, false);
  assert.ok(result.requiredCardFields.includes("sourceThreadId"));
  assert.ok(result.requiredCardFields.includes("targetThreadId"));
  assert.ok(result.requiredCardFields.includes("expectedValidation"));
  assert.ok(result.requiredCardFields.includes("terminalReturnRequired"));
  assert.ok(result.requiredCardFields.includes("terminalReturnLanguageZhCn"));
  assert.ok(result.requiredCardFields.includes("taskCardHeartbeatRequired"));
  assert.ok(result.requiredCardFields.includes("taskCardWatchdogTimeoutMs"));
  assert.ok(result.requiredCardFields.includes("taskCardWatchdogBatchLimit"));
  assert.ok(result.requiredCardFields.includes("taskCardWatchdogMaxAutoResume"));
}

function testPluginNormalCardClassifiesPluginMain() {
  const result = buildMainThreadRoutingPreflight({
    task: "把 Note 插件需求发普通卡给插件主线程做需求分析，不要 Loop。",
  });
  assert.equal(result.ok, true);
  assert.equal(result.classification, "plugin_main");
  assert.equal(result.reasonCode, "plugin_main_requirements_required");
  assert.ok(result.requiredCardFields.includes("pluginSourceThreadId"));
  assert.ok(result.requiredCardFields.includes("cardKind"));
}

function testPluginMainSourceRoleClassifiesPluginWorker() {
  const result = buildMainThreadRoutingPreflight({
    task: "Music plugin main thread fix visible duplicate messages and decide worker dispatch",
    changedFile: "/Users/example/path",
    sourceThreadRole: "plugin_main",
  });
  assert.equal(result.ok, true);
  assert.equal(result.classification, "plugin_worker");
  assert.equal(result.reasonCode, "plugin_worker_required");
  assert.ok(result.requiredCardFields.includes("targetThreadId"));
  assert.ok(result.requiredCardFields.includes("pluginId"));
  assert.ok(result.requiredCardFields.includes("expectedValidation"));
  assert.ok(result.requiredCardFields.includes("terminalReturnRequired"));
  assert.ok(result.requiredCardFields.includes("terminalReturnLanguageZhCn"));
  assert.ok(result.requiredCardFields.includes("taskCardHeartbeatRequired"));
  assert.ok(result.requiredCardFields.includes("taskCardWatchdogTimeoutMs"));
  assert.ok(result.requiredCardFields.includes("taskCardWatchdogBatchLimit"));
  assert.ok(result.requiredCardFields.includes("taskCardWatchdogMaxAutoResume"));
}

function testPluginLoopClassifiesPluginLoop() {
  const result = buildMainThreadRoutingPreflight({
    task: "给 Movie 插件主线程发 Loop 卡，按需求、实现、审计三线程闭环。",
  });
  assert.equal(result.ok, true);
  assert.equal(result.classification, "plugin_loop");
  assert.equal(result.reasonCode, "plugin_loop_required");
}

function testRoutinePluginDeploymentClassifiesDeployLane() {
  const result = buildMainThreadRoutingPreflight({
    task: "Routine plugin deployment for codex-mobile-web, deploy and readback production health.",
  });
  assert.equal(result.ok, true);
  assert.equal(result.classification, "deploy_lane");
  assert.equal(result.reasonCode, "routine_plugin_deploy_lane_required");
  assert.ok(result.requiredCardFields.includes("deployLaneThreadId"));
  assert.ok(result.requiredCardFields.includes("healthReadback"));
}

function testWorkerTargetUnavailableFailsClosed() {
  const result = buildMainThreadRoutingPreflight({
    task: "实现 Home AI main-thread dispatch 修复",
    changedFile: "adapters/autonomous-delivery-coordinator-service.js",
    workerTargetAvailable: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.classification, "blocked");
  assert.equal(result.reasonCode, "worker_required_target_unavailable");
  assert.equal(result.implementationMayProceedInline, false);
}

function testIncidentRegressionAutoDispatchesInsteadOfInline() {
  const result = buildMainThreadRoutingPreflight({
    task: "Codex Mobile thread mismatch repair approval should auto-dispatch",
  });
  assert.equal(result.ok, true);
  assert.equal(result.classification, "worker");
  assert.equal(result.reasonCode, "home_ai_worker_required");
}

function testEnforceModeFailsWhenRoutingDecisionMissing() {
  const result = buildMainThreadRoutingPreflight({
    task: "修复 Home AI 调度模块",
    changedFile: "adapters/autonomous-delivery-routing-decision-service.js",
    mode: "enforce",
  });
  assert.equal(result.ok, false);
  assert.equal(result.classification, "worker");
  assert.equal(result.issues[0].code, "routing_decision_missing_before_implementation");
}

function testEnforceModeAllowsRecordedRoutingDecision() {
  const result = buildMainThreadRoutingPreflight({
    task: "修复 Home AI 调度模块",
    changedFile: "adapters/autonomous-delivery-routing-decision-service.js",
    mode: "enforce",
    routingDecisionRecorded: true,
    sourceThreadId: "home-ai-main",
    targetThreadId: "worker-a",
    targetThreadTitle: "Home AI Worker Lane A",
  });
  assert.equal(result.ok, true);
  assert.equal(result.classification, "worker");
  assert.equal(result.routingTargetValidation.ok, true);
  assert.equal(result.routingTargetValidation.targetThreadPurpose, "implementation_worker");
}

function testEnforceModeRejectsRecordedTaskIntakeWorkerFallback() {
  const result = buildMainThreadRoutingPreflight({
    task: "修复 Home AI 调度模块",
    changedFile: "adapters/autonomous-delivery-routing-decision-service.js",
    mode: "enforce",
    routingDecisionRecorded: true,
    sourceThreadId: "home-ai-main",
    targetThreadId: "task-intake",
    targetThreadTitle: "Home AI Task Intake",
  });
  assert.equal(result.ok, false);
  assert.equal(result.classification, "worker");
  assert.equal(result.issues[0].code, "thread_purpose_mismatch");
  assert.equal(result.routingTargetValidation.targetThreadPurpose, "task_intake");
}

function testEnforceModeRejectsRecordedSelfTarget() {
  const result = buildMainThreadRoutingPreflight({
    task: "修复 Home AI 调度模块",
    changedFile: "adapters/autonomous-delivery-routing-decision-service.js",
    mode: "enforce",
    routingDecisionRecorded: true,
    sourceThreadId: "same-thread",
    targetThreadId: "same-thread",
    targetThreadTitle: "Home AI Worker Lane A",
  });
  assert.equal(result.ok, false);
  assert.equal(result.classification, "worker");
  assert.equal(result.issues[0].code, "target_thread_self");
}

function testEnforceModeRejectsPluginImplementationRoleForHomeAiWorker() {
  const result = buildMainThreadRoutingPreflight({
    task: "修复 Home AI 调度模块",
    changedFile: "adapters/autonomous-delivery-routing-decision-service.js",
    mode: "enforce",
    routingDecisionRecorded: true,
    sourceThreadId: "home-ai-main",
    targetThreadId: "codex-mobile-thread",
    targetThreadTitle: "codex mobile 07-04",
    targetThreadRole: "codex_mobile_implementation",
  });
  assert.equal(result.ok, false);
  assert.equal(result.classification, "worker");
  assert.equal(result.issues[0].code, "thread_purpose_mismatch");
  assert.equal(result.routingTargetValidation.targetThreadPurpose, "plugin_worker");
}

function testPluginMainEnforceModeAllowsPluginWorkerLane() {
  const result = buildMainThreadRoutingPreflight({
    task: "Wardrobe plugin main thread repair markdown delivery mode",
    changedFile: "/Users/example/path",
    sourceThreadRole: "plugin_main",
    mode: "enforce",
    routingDecisionRecorded: true,
    sourceThreadId: "wardrobe-main",
    targetThreadId: "wardrobe-worker-a",
    targetThreadTitle: "Wardrobe Worker Lane A",
    targetThreadRole: "plugin_worker",
  });
  assert.equal(result.ok, true);
  assert.equal(result.classification, "plugin_worker");
  assert.equal(result.routingTargetValidation.ok, true);
  assert.equal(result.routingTargetValidation.targetThreadPurpose, "plugin_worker");
}

function testPluginMainEnforceModeRejectsTaskIntakeWorkerFallback() {
  const result = buildMainThreadRoutingPreflight({
    task: "Wardrobe plugin main thread repair markdown delivery mode",
    changedFile: "/Users/example/path",
    sourceThreadRole: "plugin_main",
    mode: "enforce",
    routingDecisionRecorded: true,
    sourceThreadId: "wardrobe-main",
    targetThreadId: "task-intake",
    targetThreadTitle: "Home AI Task Intake",
  });
  assert.equal(result.ok, false);
  assert.equal(result.classification, "plugin_worker");
  assert.equal(result.issues[0].code, "thread_purpose_mismatch");
  assert.equal(result.routingTargetValidation.targetThreadPurpose, "task_intake");
}

testSimpleStatusClassifiesInline();
testHomeAiSourceRepairRequiresWorkerCardFields();
testPluginNormalCardClassifiesPluginMain();
testPluginMainSourceRoleClassifiesPluginWorker();
testPluginLoopClassifiesPluginLoop();
testRoutinePluginDeploymentClassifiesDeployLane();
testWorkerTargetUnavailableFailsClosed();
testIncidentRegressionAutoDispatchesInsteadOfInline();
testEnforceModeFailsWhenRoutingDecisionMissing();
testEnforceModeAllowsRecordedRoutingDecision();
testEnforceModeRejectsRecordedTaskIntakeWorkerFallback();
testEnforceModeRejectsRecordedSelfTarget();
testEnforceModeRejectsPluginImplementationRoleForHomeAiWorker();
testPluginMainEnforceModeAllowsPluginWorkerLane();
testPluginMainEnforceModeRejectsTaskIntakeWorkerFallback();
console.log("main-thread routing preflight service tests passed");
