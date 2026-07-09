"use strict";

const assert = require("node:assert/strict");
const {
  AUDIT_VERDICTS,
  buildLoopEngineeringPlan,
  buildLoopEngineeringStatusProjection,
  classifyLoopType,
  nextRouteForAuditVerdict,
  parseLoopTrigger,
} = require("../adapters/loop-engineering-plan-service");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

test("parses Home AI AT Loop trigger and builds role routing plan", () => {
  const parsed = parseLoopTrigger({
    text: "@home-ai @loop repair system self-check dispatch closure",
  });
  assert.equal(parsed.hasLoopTrigger, true);
  assert.equal(parsed.target, "home-ai");
  assert.equal(parsed.targetKind, "home_ai");
  assert.equal(parsed.domainAdapter, "home_ai");
  assert.equal(parsed.objective, "repair system self-check dispatch closure");

  const plan = buildLoopEngineeringPlan({ parsedTrigger: parsed });
  assert.equal(plan.ok, true);
  assert.equal(plan.runtimeOwner, "codex_mobile_loop");
  assert.equal(plan.loopType, "platform_reliability");
  assert.deepEqual(plan.dispatchOrder, ["requirements", "implementation", "product_audit"]);
  assert.equal(plan.roles[0].owner, "Home AI main thread");
  assert.equal(plan.roles[1].cardKind, "home_ai_worker");
  assert.equal(plan.roles[2].targetThreadTitle, "Home AI Platform Audit");
  assert.equal(plan.policy.homeAiMustNotRunParallelRuntime, true);
  assert.ok(plan.requiredChecks.includes("node tests/codex-thread-task-card-service.test.js"));
  assert.equal(plan.auditPacket.required, true);
  assert.equal(plan.auditPacket.handoffPolicy.implementationHandoffAsContext, false);
  assert.equal(plan.auditPacket.handoffPolicy.namedHandoffAsTargetEvidenceOnly, true);
  assert.equal(plan.auditPacket.handoffPolicy.auditUsesPacketNotRawHandoff, true);
  const auditSectionIds = plan.auditPacket.sections.map((section) => section.id);
  assert.deepEqual(auditSectionIds, [
    "requirements_packet",
    "design_contract_packet",
    "implementation_packet",
    "validation_packet",
    "privacy_packet",
  ]);
  const deltaIds = plan.auditPacket.deltaMatrix.map((delta) => delta.id);
  assert.ok(deltaIds.includes("intent_vs_requirements"));
  assert.ok(deltaIds.includes("design_vs_implementation"));
  assert.ok(deltaIds.includes("implementation_vs_validation"));
  assert.ok(deltaIds.includes("privacy_boundary_vs_evidence"));
});

test("plugin AT Loop keeps requirements in plugin source thread", () => {
  const plan = buildLoopEngineeringPlan({
    text: "@finance @loop recurring billing automatic posting user journey",
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.target, "finance");
  assert.equal(plan.targetKind, "plugin");
  assert.equal(plan.domainAdapter, "finance");
  assert.equal(plan.roles[0].owner, "plugin_source_thread");
  assert.equal(plan.roles[0].routeKind, "plugin_local_loop");
  assert.equal(plan.roles[0].dispatchMode, "source_thread_local_role");
  assert.equal(plan.roles[0].taskCardDispatch, false);
  assert.equal(plan.roles[0].sameThreadTaskCardAllowed, false);
  assert.equal(plan.roles[1].owner, "plugin_source_thread");
  assert.equal(plan.roles[2].targetThreadTitle, "Plugin Workspace Audit");
  assert.equal(plan.roles.some((role) => role.owner === "Home AI main thread"), false);
});

test("runtime-unavailable status projection is bounded and blocked", () => {
  const plan = buildLoopEngineeringPlan({
    text: "@home-ai @loop implement loop",
    codexLoopRuntimeStatus: {
      status: "blocked",
      code: "target_thread_archived",
      targetThreadTitle: "codex mobile",
    },
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.codexRuntime.available, false);
  assert.equal(plan.codexRuntime.code, "target_thread_archived");

  const projection = buildLoopEngineeringStatusProjection({
    plan,
    generatedAt: "2026-07-03T10:00:00.000Z",
  });
  assert.equal(projection.status, "blocked");
  assert.equal(projection.counts.blocked, 1);
  assert.equal(projection.items[0].blockedReason, "target_thread_archived");
  assert.equal(projection.items[0].nextRoute, "codex_mobile_runtime_repair");
  assert.equal(projection.policy.homeAiMustNotRunParallelRuntime, true);
  assert.doesNotMatch(JSON.stringify(projection), /secret|cookie|launch token/i);
});

test("status projection consumes Codex Mobile runtime counts and loop items", () => {
  const projection = buildLoopEngineeringStatusProjection({
    text: "@home-ai @loop improve delivery loop visibility",
    generatedAt: "2026-07-03T10:05:00.000Z",
    codexLoopRuntimeStatus: {
      available: true,
      status: "ok",
      counts: {
        open: 2,
        waitingReturn: 1,
        duplicateSuppressed: 3,
        verifiedClosed: 4,
      },
      itemCount: 2,
      items: [
        {
          loopId: "loop_home_ai_1",
          target: "home-ai",
          status: "waiting_return",
          currentRole: "product_audit",
          iteration: 2,
          maxIterations: 3,
          nextRoute: "audit",
        },
      ],
      source: { name: "codex-mobile-at-loop-status" },
      policy: { codexMobileRuntime: true },
    },
  });
  assert.equal(projection.ok, true);
  assert.equal(projection.status, "ok");
  assert.equal(projection.counts.open, 2);
  assert.equal(projection.counts.waitingReturn, 1);
  assert.equal(projection.counts.duplicateSuppressed, 3);
  assert.equal(projection.counts.verifiedClosed, 4);
  assert.equal(projection.itemCount, 2);
  assert.equal(projection.items[0].loopId, "loop_home_ai_1");
  assert.equal(projection.items[0].currentRole, "product_audit");
  assert.equal(projection.source.name, "codex-mobile-at-loop-status");
  assert.equal(projection.policy.codexMobileRuntime, true);
});

test("audit verdicts map to deterministic next routes", () => {
  assert.ok(AUDIT_VERDICTS.includes("failed_requirements_gap"));
  assert.equal(nextRouteForAuditVerdict("passed"), "closed");
  assert.equal(nextRouteForAuditVerdict("failed_requirements_gap"), "requirements_revision");
  assert.equal(nextRouteForAuditVerdict("failed_implementation_bug"), "implementation_repair");
  assert.equal(nextRouteForAuditVerdict("failed_deployment_readback"), "deploy_readback_repair");
  assert.equal(nextRouteForAuditVerdict("blocked_owner_decision"), "owner_decision");
  assert.equal(nextRouteForAuditVerdict("unknown-verdict"), "coordinator_review");
});

test("loop type classifier keeps platform and visual work distinct", () => {
  assert.equal(classifyLoopType("repair Web Push duplicate task-card notifications"), "platform_reliability");
  assert.equal(classifyLoopType("improve Owner System Console button UX"), "visual_ux");
  assert.equal(classifyLoopType("production deploy readback for Finance"), "deployment_readback");
});

if (process.exitCode) process.exit(process.exitCode);
