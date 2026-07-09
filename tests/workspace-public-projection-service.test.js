"use strict";

const assert = require("node:assert/strict");
const { createWorkspacePublicProjectionService } = require("../adapters/workspace-public-projection-service");

function makeService(overrides = {}) {
  const calls = {
    accessKeyStatus: [],
    bindings: [],
  };
  const protectedRoots = new Set((overrides.protectedRoots || []).map(String));
  const filteredRoots = new Set((overrides.filteredRoots || []).map(String));
  const workspaces = overrides.workspaces || [
    { id: "owner", label: "Owner" },
    { id: "child", label: "Child" },
  ];
  const service = createWorkspacePublicProjectionService(Object.assign({
    dedupe: undefined,
    isOwnerAuth: (auth) => auth?.workspaceId === "owner" || auth?.isOwner === true,
    loadCatalog: () => ({ workspaces }),
    publicWorkspaceAccessKeyStatus: (workspace) => {
      calls.accessKeyStatus.push(workspace.id);
      return { hasKey: workspace.id !== "owner", updatedAt: `${workspace.id}-updated` };
    },
    publicWorkspaceBindings: (workspace) => {
      calls.bindings.push(workspace.id);
      return { allowedToolsets: workspace.policy?.allowed_toolsets || [], interfaces: [] };
    },
    rootConflictsWithProtected: (value) => protectedRoots.has(String(value)),
    filterRoots: (roots) => (roots || []).filter((root) => !filteredRoots.has(String(root))),
  }, overrides));
  return { service, calls };
}

function testPublicWorkspacesForAuth() {
  const { service } = makeService();

  assert.deepEqual(service.publicWorkspacesForAuth({ workspaceId: "owner" }).map((item) => item.id), ["owner", "child"]);
  assert.deepEqual(service.publicWorkspacesForAuth({ workspaceId: "child" }).map((item) => item.id), ["child"]);
  assert.deepEqual(service.publicWorkspacesForAuth({ workspaceId: "missing" }), []);
}

function testPublicWorkspaceProjectionShape() {
  const workspace = {
    id: "child",
    label: "Child User",
    role: "user",
    source: "local-workspace",
    accessMode: "restricted",
    defaultWorkspace: "C:\\Work\\Child",
    accountId: "",
    userId: "",
    chatId: "",
    target: "room-1",
    contextTokenAvailable: true,
    outboundStatus: "ready",
    aliases: ["kid"],
    sessionMode: "task_centric",
    responseStyle: "short",
    showTaskId: false,
    maxParallelTasks: 3,
    policy: {
      principal_id: "principal-child",
      default_workspace: "C:\\Work\\Child",
      sync_root: "C:\\Sync",
      download_root: "C:\\Downloads",
      allowed_roots: ["C:\\Work\\Child", "D:\\Shared", "D:\\Shared", "C:\\Blocked"],
      delivery_roots: ["E:\\Delivery"],
      allowed_toolsets: ["web", "file"],
      connector_profiles: { google: "child-profile" },
      account_type: "media",
      allowed_owner_special_plugins: ["music", "movie"],
      source_chat_id_alt: "acct-alt",
      source_user_id: "user-alt",
      source_chat_id: "chat-alt",
    },
  };
  const { service, calls } = makeService({
    protectedRoots: ["C:\\Blocked"],
    filteredRoots: ["D:\\Shared"],
  });

  assert.deepEqual(service.publicWorkspaceWorkDirectories(workspace), [
    { path: "C:\\Work\\Child" },
    { path: "C:\\Sync" },
    { path: "C:\\Downloads" },
    { path: "D:\\Shared" },
    { path: "E:\\Delivery" },
  ]);

  const projected = service.publicWorkspace(workspace);
  assert.deepEqual(projected, {
    id: "child",
    label: "Child User",
    role: "user",
    source: "local-workspace",
    accessMode: "restricted",
    defaultWorkspace: "C:\\Work\\Child",
    accessKey: "principal-child",
    principalId: "principal-child",
    accountId: "acct-alt",
    userId: "user-alt",
    chatId: "chat-alt",
    accountType: "media",
    restrictedMedia: true,
    allowedOwnerSpecialPlugins: ["music", "movie"],
    target: "room-1",
    contextTokenAvailable: true,
    outboundStatus: "ready",
    workDirectories: [
      { path: "C:\\Work\\Child" },
      { path: "C:\\Sync" },
      { path: "C:\\Downloads" },
      { path: "D:\\Shared" },
      { path: "E:\\Delivery" },
    ],
    accessKeyStatus: { hasKey: true, updatedAt: "child-updated" },
    bindings: { allowedToolsets: ["web", "file"], interfaces: [] },
    aliases: ["kid"],
    sessionMode: "task_centric",
    responseStyle: "short",
    showTaskId: false,
    maxParallelTasks: 3,
    localConfig: {
      defaultWorkspace: "C:\\Work\\Child",
      allowedRoots: ["C:\\Work\\Child", "C:\\Blocked"],
      allowedToolsets: ["web", "file"],
      connectorProfiles: { google: "child-profile" },
      accountType: "media",
      allowedOwnerSpecialPlugins: ["music", "movie"],
    },
  });
  assert.equal(Object.hasOwn(projected, "key"), false);
  assert.deepEqual(calls.accessKeyStatus, ["child"]);
  assert.deepEqual(calls.bindings, ["child"]);
}

function testProjectionFallbacksMatchServerBehavior() {
  const { service } = makeService();
  const workspace = {
    id: "owner",
    label: "Owner",
    policy: {
      source_chat_id_alt: "acct",
      source_user_id: "user",
      source_chat_id: "chat",
      allowed_roots: "not-array",
      allowed_toolsets: "not-array",
    },
  };

  assert.deepEqual(service.publicWorkspaceLocalConfig(workspace), null);
  assert.deepEqual(service.publicWorkspace(workspace), {
    id: "owner",
    label: "Owner",
    role: undefined,
    source: "",
    accessMode: undefined,
    defaultWorkspace: undefined,
    accessKey: "owner",
    principalId: "owner",
    accountId: "acct",
    userId: "user",
    chatId: "chat",
    accountType: "",
    restrictedMedia: false,
    allowedOwnerSpecialPlugins: [],
    target: "",
    contextTokenAvailable: undefined,
    outboundStatus: "",
    workDirectories: [],
    accessKeyStatus: { hasKey: false, updatedAt: "owner-updated" },
    bindings: { allowedToolsets: "not-array", interfaces: [] },
    aliases: [],
    sessionMode: "",
    responseStyle: "",
    showTaskId: undefined,
    maxParallelTasks: 0,
    localConfig: null,
  });
}

function testDependencyValidation() {
  assert.throws(
    () => createWorkspacePublicProjectionService({}),
    /workspace public projection service requires isOwnerAuth/,
  );
}

testPublicWorkspacesForAuth();
testPublicWorkspaceProjectionShape();
testProjectionFallbacksMatchServerBehavior();
testDependencyValidation();

console.log("workspace-public-projection-service tests passed");
