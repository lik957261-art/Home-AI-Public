"use strict";

const assert = require("node:assert/strict");
const { createMobileRuntimeOwnerElevationFacadeService } = require("../adapters/mobile-runtime-owner-elevation-facade-service");

let grantCreateCalls = 0;
let routingCreateCalls = 0;
let grantOptions = null;
let routingOptions = null;
const grantEvents = [];
const routingEvents = [];

const grantService = {
  consumeOnce: (auth, token) => {
    grantEvents.push(["consumeOnce", auth, token]);
    return token === "once-ok";
  },
  grantOnce: (auth) => {
    grantEvents.push(["grantOnce", auth]);
    return { token: "once-ok" };
  },
  grantTimed: (auth, minutes) => {
    grantEvents.push(["grantTimed", auth, minutes]);
    return { durationMinutes: minutes };
  },
  isActive: (auth) => Boolean(auth?.active),
  publicStatus: (auth) => ({ active: Boolean(auth?.active) }),
  revoke: (auth) => {
    grantEvents.push(["revoke", auth]);
    return { revoked: true };
  },
};

const routingService = {
  accessPolicyHardeningOptionsForGatewayRouting: (...args) => ({ method: "hardening", args }),
  gatewayRoutingForModelRun: (auth, text, routeOptions = {}) => {
    routingEvents.push(["gatewayRoutingForModelRun", auth, text, routeOptions]);
    return {
      consumed: routingOptions.consumeOwnerElevationOnce(auth, routeOptions.ownerElevationOnceToken),
      active: routingOptions.isOwnerElevationActive(auth),
      marker: routingOptions.permissionApprovalMarker,
    };
  },
  gatewaySkillRoutingForWorkspace: (...args) => ({ method: "skill-routing", args }),
  modelPermissionApprovalRequest: (...args) => ({ method: "approval", args }),
  ownerElevationInstructions: (...args) => ({ method: "instructions", args }),
  precedingUserMessageForAssistant: (...args) => ({ method: "preceding", args }),
  sanitizeElevationScope: (...args) => `scope:${args[0]}`,
  stripPermissionApprovalMarkers: (...args) => `stripped:${args[0]}`,
};

const facade = createMobileRuntimeOwnerElevationFacadeService({
  audit: (eventType, payload) => ({ eventType, payload }),
  compactText: (value) => String(value || "").slice(0, 12),
  createOwnerElevationGrantService(options) {
    grantCreateCalls += 1;
    grantOptions = options;
    return grantService;
  },
  createOwnerElevationRoutingService(options) {
    routingCreateCalls += 1;
    routingOptions = options;
    return routingService;
  },
  defaultDurationMinutes: 15,
  durationOptionsMinutes: [5, 15],
  gatewaySkillProfileRouting: "auto",
  isOwnerAuth: (auth) => auth?.role === "owner",
  loadCatalog: () => ({ workspaces: [{ id: "owner" }] }),
  maintenanceRunsEnabled: () => true,
  onceTtlMs: 120000,
  permissionApprovalMarker: "APPROVAL_REQUIRED",
  securityBoundaryProvider: { classifyAutomationAdminWriteIntent: () => null },
});

assert.equal(grantCreateCalls, 0);
assert.equal(routingCreateCalls, 0);

assert.deepEqual(facade.publicOwnerElevationStatus({ active: true }), { active: true });
assert.equal(grantCreateCalls, 1);
assert.equal(facade.getOwnerElevationGrantService(), grantService);
assert.equal(grantCreateCalls, 1);
assert.equal(grantOptions.defaultDurationMinutes, 15);
assert.deepEqual(grantOptions.durationOptionsMinutes, [5, 15]);
assert.equal(grantOptions.maintenanceRunsEnabled(), true);
assert.equal(grantOptions.isOwnerAuth({ role: "owner" }), true);

assert.deepEqual(facade.grantOwnerElevationOnce({ role: "owner" }), { token: "once-ok" });
assert.deepEqual(facade.grantOwnerElevation({ role: "owner" }, 5), { durationMinutes: 5 });
assert.deepEqual(facade.revokeOwnerElevation({ role: "owner" }), { revoked: true });
assert.equal(facade.isOwnerElevationActive({ active: true }), true);
assert.equal(facade.consumeOwnerElevationOnce({ role: "owner" }, "once-ok"), true);

assert.deepEqual(facade.gatewayRoutingForModelRun({ active: false }, "run", { ownerElevationOnceToken: "once-ok" }), {
  consumed: true,
  active: false,
  marker: "APPROVAL_REQUIRED",
});
assert.equal(routingCreateCalls, 1);
assert.equal(facade.getOwnerElevationRoutingService(), routingService);
assert.equal(routingCreateCalls, 1);
assert.equal(routingOptions.gatewaySkillProfileRouting, "auto");
assert.equal(routingOptions.compactText("abcdefghijklmnop"), "abcdefghijkl");
assert.deepEqual(routingOptions.loadCatalog(), { workspaces: [{ id: "owner" }] });

assert.deepEqual(facade.accessPolicyHardeningOptionsForGatewayRouting("x"), { method: "hardening", args: ["x"] });
assert.deepEqual(facade.gatewaySkillRoutingForWorkspace("owner"), { method: "skill-routing", args: ["owner"] });
assert.deepEqual(facade.modelPermissionApprovalRequest("text"), { method: "approval", args: ["text"] });
assert.deepEqual(facade.ownerElevationInstructions({ elevationScope: "owner_high_privilege" }), {
  method: "instructions",
  args: [{ elevationScope: "owner_high_privilege" }],
});
assert.deepEqual(facade.precedingUserMessageForAssistant("thread", "message"), {
  method: "preceding",
  args: ["thread", "message"],
});
assert.equal(facade.sanitizeElevationScope("maintenance"), "scope:maintenance");
assert.equal(facade.stripPermissionApprovalMarkers("hello"), "stripped:hello");

assert.deepEqual(grantEvents.map((event) => event[0]), [
  "grantOnce",
  "grantTimed",
  "revoke",
  "consumeOnce",
  "consumeOnce",
]);
assert.equal(routingEvents.length, 1);

assert.throws(() => createMobileRuntimeOwnerElevationFacadeService({}), /requires audit/);
assert.throws(
  () => createMobileRuntimeOwnerElevationFacadeService({ audit: () => {} }),
  /requires compactText/
);
assert.throws(
  () => createMobileRuntimeOwnerElevationFacadeService({ audit: () => {}, compactText: () => "" }),
  /requires isOwnerAuth/
);
assert.throws(
  () => createMobileRuntimeOwnerElevationFacadeService({ audit: () => {}, compactText: () => "", isOwnerAuth: () => true }),
  /requires loadCatalog/
);

console.log("mobile runtime owner elevation facade service tests passed");
