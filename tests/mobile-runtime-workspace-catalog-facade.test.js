"use strict";

const assert = require("node:assert/strict");

const {
  createMobileRuntimeWorkspaceCatalogFacade,
} = require("../adapters/mobile-runtime-workspace-catalog-facade");

const calls = [];
let serviceRequestCount = 0;
const service = {
  allProjectsForWorkspaceSync(workspaceId) {
    calls.push(["allProjectsForWorkspaceSync", workspaceId]);
    return [{ id: "general" }];
  },
  buildAccessPolicy(workspaceId) {
    calls.push(["buildAccessPolicy", workspaceId]);
    return { workspaceId };
  },
  findWorkspace(workspaceId) {
    calls.push(["findWorkspace", workspaceId]);
    return { id: workspaceId, label: "Workspace" };
  },
  sharedDirectoryRoots(workspaceId) {
    calls.push(["sharedDirectoryRoots", workspaceId]);
    return [`/root/${workspaceId}`];
  },
};

const facade = createMobileRuntimeWorkspaceCatalogFacade({
  getRuntimeWorkspaceCatalogService() {
    serviceRequestCount += 1;
    return service;
  },
  projectDiscoveryProvider: {
    dedupeProjects(projects) {
      return [...new Map(projects.map((project) => [project.id, project])).values()];
    },
  },
});

assert.equal(serviceRequestCount, 0);
assert.deepEqual(facade.findWorkspace("owner"), { id: "owner", label: "Workspace" });
assert.deepEqual(facade.sharedDirectoryRoots("owner"), ["/root/owner"]);
assert.deepEqual(facade.allProjectsForWorkspaceSync("owner"), [{ id: "general" }]);
assert.deepEqual(facade.buildAccessPolicy("owner"), { workspaceId: "owner" });
assert.equal(serviceRequestCount, 4);
assert.deepEqual(calls, [
  ["findWorkspace", "owner"],
  ["sharedDirectoryRoots", "owner"],
  ["allProjectsForWorkspaceSync", "owner"],
  ["buildAccessPolicy", "owner"],
]);
assert.deepEqual(facade.dedupeProjects([{ id: "a" }, { id: "a", label: "later" }]), [{ id: "a", label: "later" }]);

assert.throws(
  () => createMobileRuntimeWorkspaceCatalogFacade({}),
  /requires a catalog service provider/,
);
assert.throws(
  () => createMobileRuntimeWorkspaceCatalogFacade({ getRuntimeWorkspaceCatalogService: () => ({}) }).findWorkspace("owner"),
  /missing findWorkspace/,
);
assert.throws(
  () => createMobileRuntimeWorkspaceCatalogFacade({ createRuntimeWorkspaceCatalogService: () => service }),
  /requires catalog service options/,
);
assert.throws(
  () => createMobileRuntimeWorkspaceCatalogFacade({
    getRuntimeWorkspaceCatalogService: () => service,
    projectDiscoveryProvider: {},
  }).dedupeProjects([]),
  /missing dedupeProjects/,
);

let createdServiceCount = 0;
const lazyFacade = createMobileRuntimeWorkspaceCatalogFacade({
  createRuntimeWorkspaceCatalogService(options) {
    createdServiceCount += 1;
    assert.equal(typeof options.localWorkspaces, "function");
    return {
      findWorkspace(workspaceId) {
        return { id: workspaceId, local: options.localWorkspaces()[0]?.id };
      },
      clearDynamicProjectCache(workspaceId) {
        return `cleared:${workspaceId}`;
      },
    };
  },
  runtimeWorkspaceCatalogOptions: () => ({
    localWorkspaces: () => [{ id: "local-owner" }],
  }),
  projectDiscoveryProvider: {
    dedupeProjects(projects) {
      return projects;
    },
  },
});

assert.equal(createdServiceCount, 0);
assert.deepEqual(lazyFacade.findWorkspace("owner"), { id: "owner", local: "local-owner" });
assert.equal(lazyFacade.clearDynamicProjectCache("owner"), "cleared:owner");
assert.equal(createdServiceCount, 1);

console.log("mobile runtime workspace catalog facade tests passed");
