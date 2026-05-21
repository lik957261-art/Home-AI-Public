"use strict";

const assert = require("node:assert/strict");
const {
  OWNER_HIGH_PRIVILEGE_SCOPE,
  createDirectoryDeletePolicyService,
  directoryDeleteElevationBody,
  isDirectoryNotEmptyError,
  ownerElevationOnceTokenFromBody,
} = require("../adapters/directory-delete-policy-service");

function testNotEmptyErrorDetection() {
  const err = new Error("Directory not empty");
  err.code = "ENOTEMPTY";
  assert.equal(isDirectoryNotEmptyError(err), true);
  assert.equal(isDirectoryNotEmptyError(new Error("not empty")), true);
  assert.equal(isDirectoryNotEmptyError(new Error("permission denied")), false);
}

function testElevationBody() {
  const body = directoryDeleteElevationBody({ name: "Archive" });
  assert.equal(body.code, "owner_high_privilege_required");
  assert.equal(body.elevationRequired, true);
  assert.equal(body.elevationScope, OWNER_HIGH_PRIVILEGE_SCOPE);
  assert.match(body.elevationReason, /Archive/);
}

function testOwnerLowPermissionRequiresElevation() {
  const service = createDirectoryDeletePolicyService({
    isOwnerAuth: (auth) => Boolean(auth?.isOwner),
    isOwnerElevationActive: () => false,
    consumeOwnerElevationOnce: () => false,
  });
  const decision = service.nonEmptyDirectoryDeleteAuthorization({ isOwner: true }, { name: "Folder" });
  assert.equal(decision.allowed, false);
  assert.equal(decision.status, 409);
  assert.equal(decision.body.elevationRequired, true);
  assert.equal(decision.body.elevationScope, "owner_high_privilege");
}

function testNonOwnerDeniedWithoutOwnerElevationPrompt() {
  const service = createDirectoryDeletePolicyService({
    isOwnerAuth: () => false,
  });
  const decision = service.nonEmptyDirectoryDeleteAuthorization({ workspaceId: "student" }, {});
  assert.equal(decision.allowed, false);
  assert.equal(decision.status, 403);
  assert.equal(decision.body.elevationRequired, false);
}

function testOwnerElevationAllowsRecursiveDelete() {
  const service = createDirectoryDeletePolicyService({
    isOwnerAuth: (auth) => Boolean(auth?.isOwner),
    isOwnerElevationActive: (auth) => Boolean(auth?.active),
  });
  const decision = service.nonEmptyDirectoryDeleteAuthorization({ isOwner: true, active: true }, {});
  assert.equal(decision.allowed, true);
  assert.equal(decision.recursive, true);
  assert.equal(decision.source, "owner-elevation-active");
}

function testOwnerElevationOnceAllowsRecursiveDelete() {
  const service = createDirectoryDeletePolicyService({
    isOwnerAuth: (auth) => Boolean(auth?.isOwner),
    consumeOwnerElevationOnce: (auth, token) => auth?.token === token,
  });
  const decision = service.nonEmptyDirectoryDeleteAuthorization(
    { isOwner: true, token: "one" },
    { ownerElevationOnceToken: "one" },
  );
  assert.equal(decision.allowed, true);
  assert.equal(decision.source, "owner-elevation-once");
  assert.equal(ownerElevationOnceTokenFromBody({ owner_elevation_once_token: "snake" }), "snake");
}

function testRemotePayload() {
  const service = createDirectoryDeletePolicyService();
  assert.deepEqual(service.remoteDeletePayload("/volume1/a"), { action: "delete", path: "/volume1/a" });
  assert.deepEqual(service.remoteDeletePayload("/volume1/a", { recursive: true }), {
    action: "delete",
    path: "/volume1/a",
    recursive: true,
  });
}

testNotEmptyErrorDetection();
testElevationBody();
testOwnerLowPermissionRequiresElevation();
testNonOwnerDeniedWithoutOwnerElevationPrompt();
testOwnerElevationAllowsRecursiveDelete();
testOwnerElevationOnceAllowsRecursiveDelete();
testRemotePayload();
console.log("directory delete policy service tests passed");
