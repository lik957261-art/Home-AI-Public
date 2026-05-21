"use strict";

const assert = require("node:assert/strict");
const {
  effectiveActorRole,
  normalizeResourceDescriptor,
  publicResourceDescriptor,
  redactResourceDescriptor,
  resolveResourceAccess,
} = require("../adapters/resource-access-resolver");

const RAW_PATH = "C:\\ProgramData\\HermesMobile\\data\\drive\\users\\owner\\private\\report.md";

function baseResource(overrides = {}) {
  return Object.assign({
    id: "res-one",
    type: "file",
    ownerWorkspaceId: "owner",
    workspaceId: "owner",
    localPath: RAW_PATH,
    label: "Owner report",
    shared: {
      viewers: ["viewer-ws"],
      performers: ["performer-ws"],
      managers: ["manager-ws"],
    },
  }, overrides);
}

function assertNoRawPath(value) {
  const text = JSON.stringify(value);
  assert.equal(text.includes("ProgramData"), false);
  assert.equal(text.includes("private"), false);
  assert.equal(text.includes("report.md"), false);
  assert.equal(text.includes(RAW_PATH), false);
}

function testOwnerCanManage() {
  const resource = baseResource({ protected: true });
  for (const permission of ["read", "write", "delete", "share", "forward"]) {
    const decision = resolveResourceAccess({ role: "owner", workspaceId: "owner" }, resource, permission);
    assert.equal(decision.allowed, true);
    assert.equal(decision.reason, "owner");
    assertNoRawPath(decision);
  }
}

function testWorkspaceSelfCanManage() {
  const resource = baseResource({ workspaceId: "workspace-a", ownerWorkspaceId: "workspace-a" });
  for (const permission of ["read", "write", "delete", "share", "forward"]) {
    const decision = resolveResourceAccess({ role: "workspace", workspaceId: "workspace-a" }, resource, permission);
    assert.equal(decision.allowed, true);
    assert.equal(decision.reason, "workspace_owner");
  }
}

function testSharedViewerIsReadOnly() {
  const resource = baseResource();
  assert.equal(effectiveActorRole({ workspaceId: "viewer-ws" }, resource), "viewer");
  assert.equal(resolveResourceAccess({ workspaceId: "viewer-ws" }, resource, "read").allowed, true);
  const write = resolveResourceAccess({ workspaceId: "viewer-ws" }, resource, "write");
  assert.equal(write.allowed, false);
  assert.equal(write.reason, "viewer_read_only");
  const forward = resolveResourceAccess({ workspaceId: "viewer-ws" }, resource, "forward");
  assert.equal(forward.allowed, false);
  assert.equal(forward.reason, "viewer_read_only");
}

function testSharedPerformerCanSubmitButNotManage() {
  const resource = baseResource({ type: "kanban_card" });
  assert.equal(effectiveActorRole({ workspaceId: "performer-ws" }, resource), "performer");
  assert.equal(resolveResourceAccess({ workspaceId: "performer-ws" }, resource, "read").allowed, true);
  assert.equal(resolveResourceAccess({ workspaceId: "performer-ws" }, resource, "write").allowed, true);
  assert.equal(resolveResourceAccess({ workspaceId: "performer-ws" }, resource, "forward").allowed, true);
  const share = resolveResourceAccess({ workspaceId: "performer-ws" }, resource, "share");
  assert.equal(share.allowed, false);
  assert.equal(share.reason, "performer_not_manager");
  const del = resolveResourceAccess({ workspaceId: "performer-ws" }, resource, "delete");
  assert.equal(del.allowed, false);
  assert.equal(del.reason, "performer_not_manager");
}

function testSharedManagerCanManage() {
  const resource = baseResource({ type: "shared_directory" });
  assert.equal(effectiveActorRole({ workspaceId: "manager-ws" }, resource), "shared_manager");
  for (const permission of ["read", "write", "delete", "share", "forward"]) {
    const decision = resolveResourceAccess({ workspaceId: "manager-ws" }, resource, permission);
    assert.equal(decision.allowed, true);
    assert.equal(decision.reason, "shared_manager");
  }
}

function testProtectedResourceBlocksSharedAccess() {
  const resource = baseResource({ type: "artifact", protected: true });
  const decision = resolveResourceAccess({ workspaceId: "manager-ws" }, resource, "read");
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "protected_resource");
  assertNoRawPath(decision);
  assert.equal(resolveResourceAccess({ role: "owner", workspaceId: "owner" }, resource, "delete").allowed, true);
}

function testAnonymousAndUnsharedDenied() {
  const resource = baseResource();
  assert.equal(resolveResourceAccess({}, resource, "read").reason, "anonymous");
  const unshared = resolveResourceAccess({ workspaceId: "other-ws" }, resource, "read");
  assert.equal(unshared.allowed, false);
  assert.equal(unshared.reason, "not_shared");
}

function testPublicRedaction() {
  const normalized = normalizeResourceDescriptor(baseResource());
  assert.equal(normalized.localPath, RAW_PATH);
  assert.equal(normalized.pathHash.length, 16);

  const pub = publicResourceDescriptor(baseResource());
  assert.equal(pub.pathKind, "local");
  assert.equal(pub.pathLabel, "Owner report");
  assert.match(pub.pathHash, /^[a-f0-9]{16}$/);
  assert.deepEqual(pub.shared, { managers: 1, performers: 1, viewers: 1 });
  assertNoRawPath(pub);

  const redacted = redactResourceDescriptor(baseResource({ metadata: { secret: "do-not-print" } }));
  assert.equal(JSON.stringify(redacted).includes("do-not-print"), false);
  assertNoRawPath(redacted);

  assert.equal(publicResourceDescriptor(baseResource({ type: "artifact" })).pathKind, "artifact");
  assert.equal(publicResourceDescriptor(baseResource({ type: "automation" })).pathKind, "automation");
  assert.equal(publicResourceDescriptor(baseResource({ type: "kanban_card" })).pathKind, "kanban");
  assert.equal(publicResourceDescriptor(baseResource({ type: "shared_directory" })).pathKind, "shared_directory");
}

testOwnerCanManage();
testWorkspaceSelfCanManage();
testSharedViewerIsReadOnly();
testSharedPerformerCanSubmitButNotManage();
testSharedManagerCanManage();
testProtectedResourceBlocksSharedAccess();
testAnonymousAndUnsharedDenied();
testPublicRedaction();
console.log("resource-access-resolver tests passed");
