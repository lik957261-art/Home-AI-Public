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

let localOptions = null;
let projectionOptions = null;
const facade = createMobileRuntimeWorkspaceFacadeService({
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
  findWorkspace: (workspaceId) => ({ id: workspaceId }),
  invalidateCatalogCache: () => {},
  isOwnerAuth: (auth) => auth?.role === "owner",
  loadCatalog: () => ({ workspaces: [{ id: "owner" }] }),
  normalizeStringList: (value) => Array.isArray(value) ? value : [],
  normalizeStringMap: (value) => value && typeof value === "object" ? value : {},
  nowIso: () => "2026-06-07T00:00:00.000Z",
  ownerDefaultWorkspace: () => "/drive/owner",
  publicWorkspaceAccessKeyStatus: (workspace) => ({ workspaceId: workspace.id }),
  publicWorkspaceBindings: (workspace) => [{ workspaceId: workspace.id }],
  rootConflictsWithProtected: () => false,
  storagePath: () => "/data/local-workspaces.json",
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
assert.deepEqual(localOptions.findWorkspace("child"), { id: "child" });

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

assert.throws(() => createMobileRuntimeWorkspaceFacadeService({}), /requires ensureWorkspaceGateway/);
assert.throws(
  () => createMobileRuntimeWorkspaceFacadeService({ ensureWorkspaceGateway: () => {} }),
  /requires filterRoots/
);
assert.throws(
  () => createMobileRuntimeWorkspaceFacadeService({ ensureWorkspaceGateway: () => {}, filterRoots: () => [] }),
  /requires rootConflictsWithProtected/
);

console.log("mobile runtime workspace facade service tests passed");
