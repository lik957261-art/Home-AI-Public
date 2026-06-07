"use strict";

const assert = require("node:assert/strict");
const { createMobileRuntimeWorkspaceFacadeService } = require("../adapters/mobile-runtime-workspace-facade-service");

const calls = {
  ensureGateway: [],
  localStore: 0,
  projection: 0,
};

const localStore = {
  deleteLocalWorkspace: (workspaceId) => ({ deleted: workspaceId }),
  localWorkspaceDefaults: (input, previous) => ({ input, previous, defaulted: true }),
  localWorkspaceRecords: () => [{ id: "child" }],
  upsertLocalWorkspace: (input, actor) => ({ id: input.workspaceId || "child", actor }),
  workspaceIdFromUsername: (username) => `user:${username}`,
  workspaceIdSlug: (value) => `slug:${value}`,
};
const projection = {
  publicWorkspace: (workspace) => ({ id: workspace.id, public: true }),
  publicWorkspacesForAuth: (auth) => [{ id: auth.workspaceId || "owner" }],
};

const authProvider = {
  authCanAccessWorkspace(auth, workspaceId) {
    return auth?.role === "owner" || auth?.workspaceId === workspaceId;
  },
  authenticateRequest(req) {
    return req.auth || { role: "anonymous", workspaceId: "" };
  },
  isOwnerAuth(auth) {
    return auth?.role === "owner";
  },
  listWorkspaceAccessKeyStatuses(auth, options) {
    return [{ actor: auth.role, workspaceId: options.workspaceId || "all" }];
  },
  publicAccessKeyStatus(workspace, record = null) {
    return { workspaceId: workspace.id, hasKey: Boolean(record?.hash) };
  },
  publicWorkspaceAccessKeyStatus(workspace) {
    return { workspaceId: workspace.id };
  },
  revokeWorkspaceAccessKey(workspaceId, options) {
    return { workspaceId, revoked: true, dryRun: Boolean(options?.dryRun) };
  },
  rotateGlobalAccessKey(options) {
    return { key: "global", dryRun: Boolean(options?.dryRun) };
  },
  rotateWorkspaceAccessKey(workspaceId, options) {
    return { workspaceId, key: "workspace", dryRun: Boolean(options?.dryRun) };
  },
};

const jsonResponses = [];
let localOptions = null;
let projectionOptions = null;
const facade = createMobileRuntimeWorkspaceFacadeService({
  authProvider,
  clearDynamicProjectCache: (workspaceId) => ({ workspaceId }),
  createLocalWorkspaceStoreService(options) {
    calls.localStore += 1;
    localOptions = options;
    return localStore;
  },
  createWorkspacePublicProjectionService(options) {
    calls.projection += 1;
    projectionOptions = options;
    return projection;
  },
  dedupe: (values) => [...new Set(values)],
  deleteWorkspaceAccessKey: (workspaceId) => ({ workspaceId }),
  ensureDataDir: () => {},
  ensureWorkspaceGateway: ({ workspaceId }) => {
    calls.ensureGateway.push(workspaceId);
    return { workspaceId, provisioned: true };
  },
  filterRoots: (roots) => (roots || []).filter(Boolean),
  findWorkspace: (workspaceId) => {
    if (workspaceId === "missing") return null;
    return { id: workspaceId, label: workspaceId === "child" ? "Child Workspace" : workspaceId };
  },
  invalidateCatalogCache: () => {},
  loadCatalog: () => ({
    workspaces: [
      { id: "owner" },
      { id: "child", policy: { principal_id: "wx_child" } },
    ],
  }),
  normalizeStringList: (value) => Array.isArray(value) ? value : [],
  normalizeStringMap: (value) => value && typeof value === "object" ? value : {},
  nowIso: () => "2026-06-07T00:00:00.000Z",
  ownerDefaultWorkspace: () => "/drive/owner",
  publicWorkspaceBindings: (workspace) => [{ workspaceId: workspace.id }],
  rootConflictsWithProtected: () => false,
  sendJson: (_res, status, data) => jsonResponses.push({ status, data }),
  storagePath: () => "/data/local-workspaces.json",
  workspacePrincipal: (workspaceId) => `principal:${workspaceId}`,
});

assert.equal(calls.localStore, 0);
assert.equal(calls.projection, 0);

assert.equal(facade.workspaceIdSlug("abc"), "slug:abc");
assert.equal(facade.workspaceIdFromUsername("stephen"), "user:stephen");
assert.deepEqual(facade.localWorkspaceDefaults({ workspaceId: "child" }, { label: "old" }), {
  input: { workspaceId: "child" },
  previous: { label: "old" },
  defaulted: true,
});
assert.deepEqual(facade.localWorkspaceRecords(), [{ id: "child" }]);
assert.deepEqual(facade.deleteLocalWorkspace("child"), { deleted: "child" });
assert.equal(calls.localStore, 1);
assert.equal(facade.getLocalWorkspaceStoreService(), localStore);
assert.equal(calls.localStore, 1);
assert.equal(localOptions.storagePath, "/data/local-workspaces.json");
assert.equal(localOptions.ownerDefaultWorkspace, "/drive/owner");
assert.deepEqual(localOptions.findWorkspace("child"), { id: "child", label: "Child Workspace" });

const created = facade.upsertLocalWorkspace({ workspaceId: "new-child" }, "owner");
assert.deepEqual(created, {
  id: "new-child",
  actor: "owner",
  gatewayProvisioning: { workspaceId: "new-child", provisioned: true },
});
assert.deepEqual(calls.ensureGateway, ["new-child"]);

assert.deepEqual(facade.publicWorkspace({ id: "owner" }), { id: "owner", public: true });
assert.deepEqual(facade.publicWorkspacesForAuth({ workspaceId: "child" }), [{ id: "child" }]);
assert.equal(calls.projection, 1);
assert.equal(facade.getWorkspacePublicProjectionService(), projection);
assert.equal(calls.projection, 1);
assert.equal(projectionOptions.isOwnerAuth({ role: "owner" }), true);
assert.deepEqual(projectionOptions.publicWorkspaceAccessKeyStatus({ id: "owner" }), { workspaceId: "owner" });
assert.deepEqual(projectionOptions.publicWorkspaceBindings({ id: "owner" }), [{ workspaceId: "owner" }]);

assert.deepEqual(facade.authenticateRequest({ auth: { role: "owner", workspaceId: "owner" } }), { role: "owner", workspaceId: "owner" });
assert.equal(facade.isOwnerAuth({ role: "owner" }), true);
assert.equal(facade.authCanAccessWorkspace({ role: "workspace", workspaceId: "child" }, "child"), true);
assert.equal(facade.pushWorkspaceForAuth({ role: "owner", workspaceId: "owner" }, "child"), "child");
assert.equal(facade.pushWorkspaceForAuth({ role: "owner", workspaceId: "owner" }, "missing"), "owner");
assert.equal(facade.pushWorkspaceForAuth({ role: "workspace", workspaceId: "child" }, "owner"), "child");
assert.deepEqual(facade.requireOwner({ auth: { role: "owner", workspaceId: "owner" } }, {}), { role: "owner", workspaceId: "owner" });
assert.equal(facade.requireOwner({ auth: { role: "workspace", workspaceId: "child" } }, {}), null);
assert.equal(facade.requireWorkspaceAccess({ auth: { role: "workspace", workspaceId: "child" } }, {}, "child"), "child");
assert.equal(facade.requireWorkspaceAccess({ auth: { role: "workspace", workspaceId: "child" } }, {}, "owner"), "");
assert.equal(facade.requireWorkspaceAccess({ auth: { role: "owner", workspaceId: "owner" } }, {}, "missing"), "");
assert.deepEqual(jsonResponses, [
  { status: 403, data: { error: "Owner access is required" } },
  { status: 403, data: { error: "Workspace access is not allowed" } },
  { status: 400, data: { error: "Unknown workspace" } },
]);
assert.equal(facade.workspaceLabel("child"), "Child Workspace");
assert.deepEqual(facade.senderInfoForWorkspace("child"), {
  senderWorkspaceId: "child",
  senderPrincipalId: "principal:child",
  senderLabel: "Child Workspace",
});
assert.equal(facade.workspaceIdForPrincipal("wx_child"), "child");
assert.equal(facade.workspaceIdForPrincipal("unknown"), "unknown");
assert.deepEqual(facade.publicAccessKeyStatus({ id: "child" }, { hash: "x" }), { workspaceId: "child", hasKey: true });
assert.deepEqual(facade.listWorkspaceAccessKeyStatuses({ role: "owner" }, { workspaceId: "child" }), [{ actor: "owner", workspaceId: "child" }]);
assert.deepEqual(facade.rotateWorkspaceAccessKey("child", { dryRun: true }), { workspaceId: "child", key: "workspace", dryRun: true });
assert.deepEqual(facade.revokeWorkspaceAccessKey("child", { dryRun: true }), { workspaceId: "child", revoked: true, dryRun: true });
assert.deepEqual(facade.rotateGlobalAccessKey({ dryRun: true }), { key: "global", dryRun: true });

assert.throws(() => createMobileRuntimeWorkspaceFacadeService({}), /requires ensureWorkspaceGateway/);
assert.throws(
  () => createMobileRuntimeWorkspaceFacadeService({ ensureWorkspaceGateway: () => {} }),
  /requires filterRoots/
);
assert.throws(
  () => createMobileRuntimeWorkspaceFacadeService({ ensureWorkspaceGateway: () => {}, filterRoots: () => [] }),
  /requires rootConflictsWithProtected/
);
assert.throws(
  () => createMobileRuntimeWorkspaceFacadeService({
    ensureWorkspaceGateway: () => {},
    filterRoots: () => [],
    rootConflictsWithProtected: () => false,
  }),
  /requires authProvider/
);

console.log("mobile runtime workspace facade service tests passed");
