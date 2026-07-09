"use strict";

const assert = require("node:assert/strict");
const {
  ROUTING_DECISION_VERSION,
  buildAutonomousDeliveryRoutingDecision,
  routingDecisionTaskCardLines,
} = require("../adapters/autonomous-delivery-routing-decision-service");

const homeAiTarget = {
  label: "Home AI",
  targetWorkspace: "/Users/example/path",
};

const movieTarget = {
  label: "Movie",
  targetThreadTitle: "Movie",
  targetWorkspace: "/Users/example/path",
};

function deliveryCase(overrides = {}) {
  return Object.assign({
    caseId: "delivery_routing_test",
    objective: "Coordinate a complex Home AI delivery task",
    risk: "medium",
    mode: "delivery",
  }, overrides);
}

function slice(overrides = {}) {
  return Object.assign({
    sliceId: "delivery_routing_test_implementation",
    sliceKey: "implementation",
    ownerLayer: "home_ai_workspace",
    targetWorkspaceId: "home-ai",
    targetWorkspacePath: "/Users/example/path",
    summary: "Implement a bounded Home AI slice.",
    aiOps: { harnessClass: "H2" },
  }, overrides);
}

function testHomeAiImplementationDelegatesToWorkerLane() {
  const decision = buildAutonomousDeliveryRoutingDecision({
    deliveryCase: deliveryCase(),
    slice: slice(),
    target: homeAiTarget,
  });
  assert.equal(decision.ok, true);
  assert.equal(decision.version, ROUTING_DECISION_VERSION);
  assert.equal(decision.action, "delegate_worker");
  assert.equal(decision.code, "home_ai_worker_required");
  assert.equal(decision.cardKind, "home_ai_worker");
  assert.equal(decision.role, "implementation");
  assert.equal(decision.reasoningEffort, "high");
  assert.equal(decision.heartbeatRequired, true);
  assert.equal(decision.taskCardHeartbeatRequired, true);
  assert.equal(decision.taskCardWatchdogTimeoutMs, 1_800_000);
  assert.equal(decision.taskCardWatchdogBatchLimit, 8);
  assert.equal(decision.taskCardWatchdogMaxAutoResume, 1);
  assert.equal(decision.codexMobileThreadLifecycle.required, true);
  assert.equal(decision.codexMobileThreadLifecycle.action, "resolve_or_ensure_worker_lane");
}

function testComplexSliceDelegatesAsWorkerLoop() {
  const decision = buildAutonomousDeliveryRoutingDecision({
    deliveryCase: deliveryCase({ objective: "Use a worker_loop for this independent module" }),
    slice: slice({ workerLoop: true }),
    target: homeAiTarget,
  });
  assert.equal(decision.action, "delegate_worker_loop");
  assert.equal(decision.code, "worker_loop_required");
  assert.equal(decision.codexMobileThreadLifecycle.required, true);
  assert.equal(decision.codexMobileThreadLifecycle.action, "ensure_or_create_role_lanes");
  assert.equal(decision.codexMobileThreadLifecycle.role, "home_ai_worker_loop");
}

function testPluginImplementationDelegatesToOwningWorkspace() {
  const decision = buildAutonomousDeliveryRoutingDecision({
    deliveryCase: deliveryCase({ objective: "Repair Movie UI" }),
    slice: slice({
      ownerLayer: "plugin_workspace",
      targetWorkspaceId: "movie",
      targetWorkspacePath: "/Users/example/path",
      summary: "Implement Movie changes.",
    }),
    target: movieTarget,
  });
  assert.equal(decision.action, "delegate_worker");
  assert.equal(decision.code, "owning_workspace_worker_required");
  assert.equal(decision.cardKind, "plugin_worker");
  assert.equal(decision.role, "plugin_worker");
  assert.equal(decision.codexMobileThreadLifecycle.required, true);
  assert.equal(decision.codexMobileThreadLifecycle.action, "resolve_or_ensure_plugin_worker_lane");
  assert.equal(decision.codexMobileThreadLifecycle.role, "plugin_worker");
  assert.equal(decision.codexMobileThreadLifecycle.pluginId, "movie");
}

function testNaturalLanguagePluginRequirementsDelegatesToPluginMainThread() {
  const decision = buildAutonomousDeliveryRoutingDecision({
    deliveryCase: deliveryCase({ objective: "把 Movie 的播放器策略发卡给插件主线程做需求分析，普通卡。" }),
    slice: slice({
      ownerLayer: "plugin_workspace",
      targetWorkspaceId: "movie",
      targetWorkspacePath: "/Users/example/path",
      summary: "请 Movie 主线程作为需求分析方，先返回设计方案。",
    }),
    target: movieTarget,
  });
  assert.equal(decision.action, "delegate_plugin_requirements");
  assert.equal(decision.code, "plugin_source_requirements_required");
  assert.equal(decision.role, "requirements");
  assert.equal(decision.cardKind, "plugin_requirements");
  assert.equal(decision.codexMobileThreadLifecycle.required, true);
  assert.equal(decision.codexMobileThreadLifecycle.action, "resolve_or_ensure_plugin_main_thread");
  assert.equal(decision.codexMobileThreadLifecycle.role, "plugin_requirements");
}

function testNaturalLanguagePluginLoopDelegatesToPluginSourceLoop() {
  const decision = buildAutonomousDeliveryRoutingDecision({
    deliveryCase: deliveryCase({ objective: "给 Movie 主线程发 Loop 卡，插件主线程作为需求分析方，形成三线程闭环。" }),
    slice: slice({
      ownerLayer: "plugin_workspace",
      targetWorkspaceId: "movie",
      targetWorkspacePath: "/Users/example/path",
      summary: "Movie plugin source thread owns requirements; implementation and audit must be separate loop roles.",
    }),
    target: movieTarget,
  });
  assert.equal(decision.action, "delegate_plugin_loop");
  assert.equal(decision.code, "plugin_source_loop_required");
  assert.equal(decision.role, "requirements");
  assert.equal(decision.cardKind, "plugin_loop");
  assert.equal(decision.codexMobileThreadLifecycle.required, true);
  assert.equal(decision.codexMobileThreadLifecycle.action, "start_or_ensure_plugin_loop");
  assert.equal(decision.codexMobileThreadLifecycle.role, "plugin_requirements");
}

function testProductionAuthorityDelegatesDeployLane() {
  const decision = buildAutonomousDeliveryRoutingDecision({
    deliveryCase: deliveryCase({ objective: "Deploy Movie and read back launchd" }),
    slice: slice({
      ownerLayer: "home_ai_workspace",
      summary: "Install production config and restart launchd.",
    }),
    target: homeAiTarget,
  });
  assert.equal(decision.action, "delegate_deploy_lane");
  assert.equal(decision.code, "deploy_lane_required");
  assert.equal(decision.role, "deploy_readback");
  assert.equal(decision.cardKind, "plugin_deployment");
}

function testAuditSliceDelegatesAuditLane() {
  const decision = buildAutonomousDeliveryRoutingDecision({
    deliveryCase: deliveryCase(),
    slice: slice({
      ownerLayer: "verification_or_audit_thread",
      targetWorkspaceId: "home-ai-platform-audit",
      targetWorkspacePath: "/Users/example/path",
    }),
    target: homeAiTarget,
  });
  assert.equal(decision.action, "delegate_audit_lane");
  assert.equal(decision.role, "product_audit");
  assert.equal(decision.cardKind, "platform_audit");
}

function testHighRiskBlocksBeforeDispatch() {
  const decision = buildAutonomousDeliveryRoutingDecision({
    deliveryCase: deliveryCase({ risk: "high" }),
    slice: slice({ risk: "high" }),
    target: homeAiTarget,
  });
  assert.equal(decision.ok, false);
  assert.equal(decision.action, "blocked_or_redirected");
  assert.equal(decision.code, "high_risk_owner_gate_required");
}

function testTaskCardLinesAreBoundedAndVisible() {
  const decision = buildAutonomousDeliveryRoutingDecision({
    deliveryCase: deliveryCase(),
    slice: slice(),
    target: homeAiTarget,
  });
  const lines = routingDecisionTaskCardLines(decision);
  const body = lines.join("\n");
  assert.match(body, /## Routing Decision/);
  assert.match(body, /Action: `delegate_worker`/);
  assert.match(body, /Card kind: `home_ai_worker`/);
  assert.match(body, /Task-card heartbeat required: `true`/);
  assert.match(body, /Task-card Watchdog timeout ms: `1800000`/);
  assert.match(body, /Task-card Watchdog batch limit: `8`/);
  assert.match(body, /Task-card Watchdog max auto-resume: `1`/);
  assert.doesNotMatch(body, /raw secret|access key|cookie/i);
}

testHomeAiImplementationDelegatesToWorkerLane();
testComplexSliceDelegatesAsWorkerLoop();
testPluginImplementationDelegatesToOwningWorkspace();
testNaturalLanguagePluginRequirementsDelegatesToPluginMainThread();
testNaturalLanguagePluginLoopDelegatesToPluginSourceLoop();
testProductionAuthorityDelegatesDeployLane();
testAuditSliceDelegatesAuditLane();
testHighRiskBlocksBeforeDispatch();
testTaskCardLinesAreBoundedAndVisible();
console.log("autonomous delivery routing decision service tests passed");
