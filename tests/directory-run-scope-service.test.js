"use strict";

const assert = require("node:assert/strict");
const {
  directoryWorkspaceIdFromAttachment,
  directoryWorkspaceIdFromProject,
  resolveDirectoryRunScope,
} = require("../adapters/directory-run-scope-service");

assert.equal(directoryWorkspaceIdFromAttachment({ workspace_id: "li_yushuang" }), "li_yushuang");
assert.equal(directoryWorkspaceIdFromProject({ workspaceId: "li_yushuang" }), "li_yushuang");

{
  const scope = resolveDirectoryRunScope({
    actorWorkspaceId: "owner",
    taskDirectory: { path: "/workspaces/li/health", root: "/workspaces/li/health" },
    project: { id: "li-health", workspaceId: "li_yushuang" },
  });

  assert.deepEqual(scope, {
    actorWorkspaceId: "owner",
    targetWorkspaceId: "li_yushuang",
    dataWorkspaceId: "li_yushuang",
    directoryBound: true,
    directoryScoped: true,
    scopeSource: "directory_binding",
  });
}

{
  const scope = resolveDirectoryRunScope({
    actorWorkspaceId: "owner",
    taskDirectory: { path: "/workspaces/owner/general", root: "/workspaces/owner/general" },
    project: { id: "owner-general" },
  });

  assert.equal(scope.targetWorkspaceId, "owner");
  assert.equal(scope.dataWorkspaceId, "owner");
  assert.equal(scope.directoryBound, true);
  assert.equal(scope.directoryScoped, false);
  assert.equal(scope.scopeSource, "actor");
}

{
  const scope = resolveDirectoryRunScope({
    actorWorkspaceId: "owner",
    project: { id: "li-health", workspaceId: "li_yushuang" },
  });

  assert.equal(scope.targetWorkspaceId, "owner");
  assert.equal(scope.dataWorkspaceId, "owner");
  assert.equal(scope.directoryBound, false);
  assert.equal(scope.directoryScoped, false);
}

console.log("directory run scope service tests passed");
