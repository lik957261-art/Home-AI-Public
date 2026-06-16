"use strict";

const assert = require("node:assert/strict");
const { createOwnerElevationRoutingService } = require("../adapters/owner-elevation-routing-service");

function makeService(overrides = {}) {
  return createOwnerElevationRoutingService(Object.assign({
    isOwnerAuth: () => true,
    isOwnerElevationActive: () => false,
    loadCatalog: () => ({
      workspaces: [
        { id: "owner", label: "Owner" },
        { id: "weixin_stephen", label: "Steven", aliases: ["\u51e1\u51e1"] },
      ],
    }),
    securityBoundaryProvider: {
      classifyMaintenanceIntent: () => ({
        category: "product_maintenance",
        elevationRequired: true,
        elevationScope: "owner_high_privilege",
        message: "maintenance blocked",
      }),
      classifyAutomationAdminWriteIntent: () => null,
      classifySharedSkillWriteIntent: () => null,
    },
  }, overrides));
}

function assertThrowsCode(fn, code) {
  let thrown = null;
  try {
    fn();
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown, `Expected ${code} to be thrown`);
  assert.equal(thrown.code, code);
}

function testLearningContentUpdateDoesNotForceMaintenanceRouting() {
  const service = makeService();
  const route = service.gatewayRoutingForModelRun(
    { workspaceId: "owner" },
    "\u4fee\u6539 Hermes Mobile \u5b66\u4e60\u7cfb\u7edf\uff0c\u589e\u52a0 42 \u8282\u8bfe\u5185\u5bb9",
    { actorWorkspaceId: "owner" },
  );
  assert.deepEqual(route, { securityLevel: "user", maintenance: false });
}

function testPythonLessonSummaryDoesNotForceElevation() {
  const service = makeService();
  const text = [
    "课堂总结 Summary of Lesson 42",
    "try except Exception finally Attributes",
    "attrib +-R .\\filename 文件的权限",
    "Playwright and Selenium",
    "用try except实现 safe_divide(a, b)",
  ].join("\n");
  const route = service.gatewayRoutingForModelRun(
    { workspaceId: "weixin_stephen" },
    text,
    { actorWorkspaceId: "weixin_stephen" },
  );
  assert.deepEqual(route, { securityLevel: "user", maintenance: false });
}

function testCrossAccountAutomationDoesNotPreemptNormalModelRun() {
  const service = makeService();
  const route = service.gatewayRoutingForModelRun(
    { workspaceId: "owner" },
    "\u628a Steven \u7684\u81ea\u52a8\u5316\u4efb\u52a1\u89e6\u53d1\u65f6\u95f4\u6539\u6210 8 \u70b9",
    { actorWorkspaceId: "owner" },
  );
  assert.deepEqual(route, { securityLevel: "user", maintenance: false });
}

function testExplicitMaintenanceModeStillRequiresElevation() {
  const service = makeService();
  assertThrowsCode(() => service.gatewayRoutingForModelRun(
    { workspaceId: "owner" },
    "restart production listener",
    { actorWorkspaceId: "owner", maintenanceMode: true },
  ), "owner_high_privilege_required");
}

function testChatGptProTextDoesNotPreemptNormalModelRunWithoutExplicitMaintenance() {
  const service = makeService();
  const text = "@ChatGPT Pro generate report";
  const route = service.gatewayRoutingForModelRun(
    { workspaceId: "owner" },
    text,
    { actorWorkspaceId: "owner" },
  );
  assert.deepEqual(route, { securityLevel: "user", maintenance: false });
  assert.equal(service.textRequestsChatGptPro(text), true);
}

function testChatGptProRoutesOnlyToOwnerMaintenanceProfilesAfterApproval() {
  const service = makeService({
    consumeOwnerElevationOnce: (_auth, token) => token === "one-shot",
  });
  const route = service.gatewayRoutingForModelRun(
    { workspaceId: "owner" },
    "@ChatGPT Pro generate a document",
    {
      actorWorkspaceId: "owner",
      maintenanceMode: true,
      ownerElevationOnceToken: "one-shot",
      chatGptProGenerate: true,
      requiredTool: "chatgpt_pro_generate",
    },
  );
  assert.equal(route.securityLevel, "owner-maintenance");
  assert.equal(route.maintenance, true);
  assert.equal(route.maintenanceCategory, "chatgpt_pro_generate");
  assert.deepEqual(route.preferred_worker_profiles, ["officialclean1", "officialclean2"]);
  assert.equal(route.requiredTool, "chatgpt_pro_generate");
  assert.equal(service.routeRequestsChatGptPro({ elevationScope: "chatgpt_pro_generate" }), true);
  assert.match(service.ownerElevationInstructions({ chatGptProGenerate: true }), /chatgpt_pro_generate/);
}

function testChinesePermissionBoundaryInfersOwnerElevation() {
  const service = makeService();
  const inferred = service.inferPermissionApprovalRequest(
    "当前 Gateway 权限范围不足，无法访问这个路径，需要 Owner 高权限授权后继续删除非空文件夹。",
  );
  assert.ok(inferred);
  assert.equal(inferred.elevationRequired, true);
  assert.equal(inferred.elevationScope, "owner_high_privilege");
  assert.equal(inferred.elevationSource, "model_permission_boundary_heuristic");

  const request = service.modelPermissionApprovalRequest(
    "当前权限不足，不能访问目标路径，请申请 Owner 授权。",
    { runOptions: { gatewayRouting: { maintenance: false } } },
  );
  assert.ok(request);
  assert.equal(request.elevationRequired, true);
  assert.equal(request.elevationScope, "owner_high_privilege");
}

function testDirectoryToolOwnerHighPrivilegeCodeInfersOwnerElevation() {
  const service = makeService();
  const codeOnly = service.modelPermissionApprovalRequest(
    '{"error":"Owner high-privilege approval is required to delete a non-empty directory.","code":"owner_high_privilege_required","elevationRequired":true}',
    { runOptions: { gatewayRouting: { maintenance: false } } },
  );
  assert.ok(codeOnly);
  assert.equal(codeOnly.elevationRequired, true);
  assert.equal(codeOnly.elevationScope, "owner_high_privilege");

  const chineseCode = service.inferPermissionApprovalRequest(
    "删除目录失败：owner_high_privilege_required。需要 Owner 高权限批准。",
  );
  assert.ok(chineseCode);
  assert.equal(chineseCode.elevationRequired, true);
  assert.equal(chineseCode.elevationScope, "owner_high_privilege");
}

function testOwnerHighPrivilegeInstructionsCoverDirectoryDeleteBoundary() {
  const service = makeService();
  const instructions = service.ownerElevationInstructions({ elevationScope: "owner_high_privilege" });
  assert.match(instructions, /non-empty or recursive directory deletion/);
  assert.match(instructions, /exact target/);
  assert.match(instructions, /owner_high_privilege_required/);
}

testLearningContentUpdateDoesNotForceMaintenanceRouting();
testPythonLessonSummaryDoesNotForceElevation();
testCrossAccountAutomationDoesNotPreemptNormalModelRun();
testExplicitMaintenanceModeStillRequiresElevation();
testChatGptProTextDoesNotPreemptNormalModelRunWithoutExplicitMaintenance();
testChatGptProRoutesOnlyToOwnerMaintenanceProfilesAfterApproval();
testChinesePermissionBoundaryInfersOwnerElevation();
testDirectoryToolOwnerHighPrivilegeCodeInfersOwnerElevation();
testOwnerHighPrivilegeInstructionsCoverDirectoryDeleteBoundary();

console.log("owner-elevation-routing-service tests passed");
