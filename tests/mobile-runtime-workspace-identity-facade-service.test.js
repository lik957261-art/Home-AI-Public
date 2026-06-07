"use strict";

const assert = require("node:assert/strict");

const {
  createMobileRuntimeWorkspaceIdentityFacadeService,
} = require("../adapters/mobile-runtime-workspace-identity-facade-service");

let facade = null;
const service = createMobileRuntimeWorkspaceIdentityFacadeService({
  findWorkspace(workspaceId) {
    return workspaceId === "child" ? { id: "child", label: "Child Workspace" } : null;
  },
  loadCatalog() {
    return {
      workspaces: [
        { id: "owner", policy: { principal_id: "owner" } },
        { id: "child", policy: { principal_id: "wx_child" } },
      ],
    };
  },
  workspaceFacade: () => facade,
  workspacePrincipal: (workspaceId) => `principal:${workspaceId}`,
});

assert.equal(service.workspaceLabel("child"), "Child Workspace");
assert.equal(service.workspaceLabel("missing"), "missing");
assert.deepEqual(service.senderInfoForWorkspace("child"), {
  senderWorkspaceId: "child",
  senderPrincipalId: "principal:child",
  senderLabel: "Child Workspace",
});
assert.equal(service.workspaceIdForPrincipal("wx_child"), "child");
assert.equal(service.workspaceIdForPrincipal("unknown"), "unknown");

facade = {
  workspaceLabel: (workspaceId) => `delegated:${workspaceId}`,
  senderInfoForWorkspace: (workspaceId) => ({ delegated: workspaceId }),
  workspaceIdForPrincipal: (principalId) => `delegated-id:${principalId}`,
};

assert.equal(service.workspaceLabel("child"), "delegated:child");
assert.deepEqual(service.senderInfoForWorkspace("child"), { delegated: "child" });
assert.equal(service.workspaceIdForPrincipal("wx_child"), "delegated-id:wx_child");

assert.throws(
  () => createMobileRuntimeWorkspaceIdentityFacadeService({}),
  /requires findWorkspace/,
);

console.log("mobile runtime workspace identity facade service tests passed");
