"use strict";

const assert = require("node:assert/strict");
const { createMobileRuntimeAuthFacadeService } = require("../adapters/mobile-runtime-auth-facade-service");

function testDelegatesAreLazyAndStable() {
  const calls = [];
  const provider = {
    authenticateRequest(req) {
      calls.push(["authenticateRequest", req]);
      return { ok: true, workspaceId: "owner" };
    },
    authCanAccessWorkspace(auth, workspaceId) {
      calls.push(["authCanAccessWorkspace", auth, workspaceId]);
      return workspaceId === auth.workspaceId;
    },
    isOwnerAuth(auth) {
      calls.push(["isOwnerAuth", auth]);
      return Boolean(auth?.isOwner);
    },
  };
  const service = createMobileRuntimeAuthFacadeService({
    authProvider() {
      calls.push(["provider"]);
      return provider;
    },
  });

  assert.deepEqual(calls, []);
  assert.deepEqual(service.authenticateRequest({ url: "/" }), { ok: true, workspaceId: "owner" });
  assert.equal(service.authCanAccessWorkspace({ workspaceId: "owner" }, "owner"), true);
  assert.equal(service.isOwnerAuth({ isOwner: true }), true);
  assert.deepEqual(calls.map((item) => item[0]), [
    "provider",
    "authenticateRequest",
    "provider",
    "authCanAccessWorkspace",
    "provider",
    "isOwnerAuth",
  ]);
}

function testRequiredDependencyGuards() {
  assert.throws(
    () => createMobileRuntimeAuthFacadeService({}),
    /requires authProvider/,
  );
  const service = createMobileRuntimeAuthFacadeService({ authProvider: () => ({}) });
  assert.throws(
    () => service.authenticateRequest({}),
    /requires authProvider\.authenticateRequest/,
  );
}

testDelegatesAreLazyAndStable();
testRequiredDependencyGuards();
console.log("mobile runtime auth facade service tests passed");
