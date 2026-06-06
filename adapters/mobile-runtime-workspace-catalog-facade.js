"use strict";

function createMobileRuntimeWorkspaceCatalogFacade(options = {}) {
  const getRuntimeWorkspaceCatalogService = options.getRuntimeWorkspaceCatalogService;
  const projectDiscoveryProvider = options.projectDiscoveryProvider || {};

  if (typeof getRuntimeWorkspaceCatalogService !== "function") {
    throw new Error("mobile runtime workspace catalog facade requires getRuntimeWorkspaceCatalogService");
  }

  function catalog() {
    const service = getRuntimeWorkspaceCatalogService();
    if (!service || typeof service !== "object") {
      throw new Error("mobile runtime workspace catalog service is unavailable");
    }
    return service;
  }

  function call(method) {
    return (...args) => {
      const service = catalog();
      if (typeof service[method] !== "function") {
        throw new Error(`mobile runtime workspace catalog service missing ${method}`);
      }
      return service[method](...args);
    };
  }

  function dedupeProjects(...args) {
    if (typeof projectDiscoveryProvider.dedupeProjects !== "function") {
      throw new Error("project discovery provider missing dedupeProjects");
    }
    return projectDiscoveryProvider.dedupeProjects(...args);
  }

  return {
    allProjectsForWorkspaceSync: call("allProjectsForWorkspaceSync"),
    buildAccessPolicy: call("buildAccessPolicy"),
    cachedDynamicProjectsForWorkspace: call("cachedDynamicProjectsForWorkspace"),
    dedupeProjects,
    effectiveProjectForThread: call("effectiveProjectForThread"),
    findProject: call("findProject"),
    findSubproject: call("findSubproject"),
    findWorkspace: call("findWorkspace"),
    getSharedDirectoryProjectionService: call("getSharedDirectoryProjectionService"),
    getWorkspaceProjectProvider: call("getWorkspaceProjectProvider"),
    invalidateCatalogCache: call("invalidateCatalogCache"),
    isShareableRootProject: call("isShareableRootProject"),
    loadCatalog: call("loadCatalog"),
    mergeAccessPolicyOverride: call("mergeAccessPolicyOverride"),
    mergeDefaultExternalAccessPolicy: call("mergeDefaultExternalAccessPolicy"),
    normalizeSharePermission: call("normalizeSharePermission"),
    normalizeShareScope: call("normalizeShareScope"),
    normalizeShareTargets: call("normalizeShareTargets"),
    policyForThread: call("policyForThread"),
    projectsForWorkspace: call("projectsForWorkspace"),
    publicProjectsForWorkspace: call("publicProjectsForWorkspace"),
    publicSharedDirectory: call("publicSharedDirectory"),
    remoteWorkspaceDirectoryProjects: call("remoteWorkspaceDirectoryProjects"),
    removeSharedDirectoryRecord: call("removeSharedDirectoryRecord"),
    setDynamicProjectsForWorkspace: call("setDynamicProjectsForWorkspace"),
    shareableRootProjectForPath: call("shareableRootProjectForPath"),
    sharedDirectoriesForWorkspace: call("sharedDirectoriesForWorkspace"),
    sharedDirectoryLabel: call("sharedDirectoryLabel"),
    sharedDirectoryProjectsForWorkspace: call("sharedDirectoryProjectsForWorkspace"),
    sharedDirectoryRoots: call("sharedDirectoryRoots"),
    updateSharedDirectoryAccess: call("updateSharedDirectoryAccess"),
    upsertSharedDirectory: call("upsertSharedDirectory"),
  };
}

module.exports = {
  createMobileRuntimeWorkspaceCatalogFacade,
};
