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

function testCrossAccountAutomationStillRequiresElevation() {
  const service = makeService();
  assertThrowsCode(() => service.gatewayRoutingForModelRun(
    { workspaceId: "owner" },
    "\u628a Steven \u7684\u81ea\u52a8\u5316\u4efb\u52a1\u89e6\u53d1\u65f6\u95f4\u6539\u6210 8 \u70b9",
    { actorWorkspaceId: "owner" },
  ), "automation_admin_write");
}

function testExplicitMaintenanceModeStillRequiresElevation() {
  const service = makeService();
  assertThrowsCode(() => service.gatewayRoutingForModelRun(
    { workspaceId: "owner" },
    "restart production listener",
    { actorWorkspaceId: "owner", maintenanceMode: true },
  ), "owner_high_privilege_required");
}

testLearningContentUpdateDoesNotForceMaintenanceRouting();
testCrossAccountAutomationStillRequiresElevation();
testExplicitMaintenanceModeStillRequiresElevation();

console.log("owner-elevation-routing-service tests passed");
