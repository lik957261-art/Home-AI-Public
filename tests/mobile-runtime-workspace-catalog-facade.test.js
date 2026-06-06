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
  /requires getRuntimeWorkspaceCatalogService/,
);
assert.throws(
  () => createMobileRuntimeWorkspaceCatalogFacade({ getRuntimeWorkspaceCatalogService: () => ({}) }).findWorkspace("owner"),
  /missing findWorkspace/,
);
assert.throws(
  () => createMobileRuntimeWorkspaceCatalogFacade({
    getRuntimeWorkspaceCatalogService: () => service,
    projectDiscoveryProvider: {},
  }).dedupeProjects([]),
  /missing dedupeProjects/,
);

console.log("mobile runtime workspace catalog facade tests passed");
