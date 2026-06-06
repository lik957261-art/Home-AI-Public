"use strict";

const { createLocalWorkspaceStoreService: defaultCreateLocalWorkspaceStoreService } = require("./local-workspace-store-service");
const { createWorkspacePublicProjectionService: defaultCreateWorkspacePublicProjectionService } = require("./workspace-public-projection-service");

function requiredFunction(options, name) {
  const value = options[name];
  if (typeof value === "function") return value;
  throw new Error(`MobileRuntimeWorkspaceFacadeService requires ${name}`);
}

function optionValue(options, name) {
  const value = options[name];
  return typeof value === "function" ? value() : value;
}

function createMobileRuntimeWorkspaceFacadeService(options = {}) {
  const createLocalWorkspaceStoreService = options.createLocalWorkspaceStoreService || defaultCreateLocalWorkspaceStoreService;
  const createWorkspacePublicProjectionService = options.createWorkspacePublicProjectionService || defaultCreateWorkspacePublicProjectionService;

  const ensureWorkspaceGateway = requiredFunction(options, "ensureWorkspaceGateway");
  const filterRoots = requiredFunction(options, "filterRoots");
  const rootConflictsWithProtected = requiredFunction(options, "rootConflictsWithProtected");

  let localWorkspaceStoreService = null;
  let workspacePublicProjectionService = null;

  function getLocalWorkspaceStoreService() {
    if (!localWorkspaceStoreService) {
      localWorkspaceStoreService = createLocalWorkspaceStoreService({
        storagePath: optionValue(options, "storagePath"),
        ownerDefaultWorkspace: optionValue(options, "ownerDefaultWorkspace"),
        ensureDataDir: options.ensureDataDir,
        nowIso: options.nowIso,
        normalizeStringList: options.normalizeStringList,
        normalizeStringMap: options.normalizeStringMap,
        findWorkspace: options.findWorkspace,
        deleteWorkspaceAccessKey: options.deleteWorkspaceAccessKey,
        invalidateCatalogCache: options.invalidateCatalogCache,
        clearDynamicProjectCache: options.clearDynamicProjectCache,
        rootConflictsWithProtected,
        filterRoots,
      });
    }
    return localWorkspaceStoreService;
  }

  function getWorkspacePublicProjectionService() {
    if (!workspacePublicProjectionService) {
      workspacePublicProjectionService = createWorkspacePublicProjectionService({
        dedupe: options.dedupe,
        filterRoots,
        isOwnerAuth: options.isOwnerAuth,
        loadCatalog: options.loadCatalog,
        publicWorkspaceAccessKeyStatus: options.publicWorkspaceAccessKeyStatus,
        publicWorkspaceBindings: options.publicWorkspaceBindings,
        rootConflictsWithProtected,
      });
    }
    return workspacePublicProjectionService;
  }

  function upsertLocalWorkspace(input, actor = "owner") {
    const record = getLocalWorkspaceStoreService().upsertLocalWorkspace(input, actor);
    record.gatewayProvisioning = ensureWorkspaceGateway({ workspaceId: record.id });
    return record;
  }

  return Object.freeze({
    deleteLocalWorkspace: (...args) => getLocalWorkspaceStoreService().deleteLocalWorkspace(...args),
    getLocalWorkspaceStoreService,
    getWorkspacePublicProjectionService,
    localWorkspaceDefaults: (...args) => getLocalWorkspaceStoreService().localWorkspaceDefaults(...args),
    localWorkspaceRecords: (...args) => getLocalWorkspaceStoreService().localWorkspaceRecords(...args),
    publicWorkspace: (...args) => getWorkspacePublicProjectionService().publicWorkspace(...args),
    publicWorkspacesForAuth: (...args) => getWorkspacePublicProjectionService().publicWorkspacesForAuth(...args),
    upsertLocalWorkspace,
    workspaceIdFromUsername: (...args) => getLocalWorkspaceStoreService().workspaceIdFromUsername(...args),
    workspaceIdSlug: (...args) => getLocalWorkspaceStoreService().workspaceIdSlug(...args),
  });
}

module.exports = {
  createMobileRuntimeWorkspaceFacadeService,
};
