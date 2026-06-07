"use strict";

const { createLocalWorkspaceStoreService: defaultCreateLocalWorkspaceStoreService } = require("./local-workspace-store-service");
const { createWorkspacePublicProjectionService: defaultCreateWorkspacePublicProjectionService } = require("./workspace-public-projection-service");

function requiredFunction(options, name) {
  const value = options[name];
  if (typeof value === "function") return value;
  throw new Error(`MobileRuntimeWorkspaceFacadeService requires ${name}`);
}

function requiredObject(options, name) {
  const value = options[name];
  if (value && typeof value === "object") return value;
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
  const authProvider = requiredObject(options, "authProvider");
  const findWorkspace = requiredFunction(options, "findWorkspace");
  const loadCatalog = requiredFunction(options, "loadCatalog");
  const sendJson = requiredFunction(options, "sendJson");
  const workspacePrincipal = requiredFunction(options, "workspacePrincipal");

  function authProviderMethod(name) {
    const value = authProvider[name];
    if (typeof value === "function") return value.bind(authProvider);
    throw new Error(`MobileRuntimeWorkspaceFacadeService authProvider requires ${name}`);
  }

  const authCanAccessWorkspace = authProviderMethod("authCanAccessWorkspace");
  const authenticateRequest = authProviderMethod("authenticateRequest");
  const isOwnerAuth = authProviderMethod("isOwnerAuth");
  const listWorkspaceAccessKeyStatuses = authProviderMethod("listWorkspaceAccessKeyStatuses");
  const publicAccessKeyStatus = authProviderMethod("publicAccessKeyStatus");
  const publicWorkspaceAccessKeyStatus = authProviderMethod("publicWorkspaceAccessKeyStatus");
  const revokeWorkspaceAccessKey = authProviderMethod("revokeWorkspaceAccessKey");
  const rotateGlobalAccessKey = authProviderMethod("rotateGlobalAccessKey");
  const rotateWorkspaceAccessKey = authProviderMethod("rotateWorkspaceAccessKey");

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
        findWorkspace,
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
        isOwnerAuth,
        loadCatalog,
        publicWorkspaceAccessKeyStatus,
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

  function pushWorkspaceForAuth(auth, requestedWorkspaceId = "owner") {
    const requested = String(requestedWorkspaceId || auth?.workspaceId || "owner").trim() || "owner";
    if (isOwnerAuth(auth)) return findWorkspace(requested) ? requested : "owner";
    return String(auth?.workspaceId || requestedWorkspaceId || "owner").trim() || "owner";
  }

  function requireOwner(req, res) {
    const auth = authenticateRequest(req);
    if (!isOwnerAuth(auth)) {
      sendJson(res, 403, { error: "Owner access is required" });
      return null;
    }
    return auth;
  }

  function requireWorkspaceAccess(req, res, workspaceId) {
    const id = String(workspaceId || "owner").trim() || "owner";
    if (!findWorkspace(id)) {
      sendJson(res, 400, { error: "Unknown workspace" });
      return "";
    }
    if (!authCanAccessWorkspace(authenticateRequest(req), id)) {
      sendJson(res, 403, { error: "Workspace access is not allowed" });
      return "";
    }
    return id;
  }

  function workspaceLabel(workspaceId) {
    const workspace = findWorkspace(String(workspaceId || ""));
    return workspace?.label || workspace?.id || String(workspaceId || "");
  }

  function senderInfoForWorkspace(workspaceId) {
    const id = String(workspaceId || "owner").trim() || "owner";
    return {
      senderWorkspaceId: id,
      senderPrincipalId: workspacePrincipal(id),
      senderLabel: workspaceLabel(id),
    };
  }

  function workspaceIdForPrincipal(principalId) {
    const principal = String(principalId || "owner").trim() || "owner";
    const catalog = loadCatalog() || {};
    const workspaces = Array.isArray(catalog.workspaces) ? catalog.workspaces : [];
    const workspace = workspaces.find((item) => {
      const itemPrincipal = String(item?.policy?.principal_id || item?.id || "").trim() || "owner";
      return item.id === principal || itemPrincipal === principal;
    });
    return workspace?.id || (principal === "owner" ? "owner" : principal);
  }

  return Object.freeze({
    authCanAccessWorkspace,
    authenticateRequest,
    deleteLocalWorkspace: (...args) => getLocalWorkspaceStoreService().deleteLocalWorkspace(...args),
    getLocalWorkspaceStoreService,
    getWorkspacePublicProjectionService,
    isOwnerAuth,
    listWorkspaceAccessKeyStatuses,
    localWorkspaceDefaults: (...args) => getLocalWorkspaceStoreService().localWorkspaceDefaults(...args),
    localWorkspaceRecords: (...args) => getLocalWorkspaceStoreService().localWorkspaceRecords(...args),
    publicAccessKeyStatus,
    publicWorkspace: (...args) => getWorkspacePublicProjectionService().publicWorkspace(...args),
    publicWorkspacesForAuth: (...args) => getWorkspacePublicProjectionService().publicWorkspacesForAuth(...args),
    pushWorkspaceForAuth,
    requireOwner,
    requireWorkspaceAccess,
    revokeWorkspaceAccessKey,
    rotateGlobalAccessKey,
    rotateWorkspaceAccessKey,
    senderInfoForWorkspace,
    upsertLocalWorkspace,
    workspaceIdForPrincipal,
    workspaceIdFromUsername: (...args) => getLocalWorkspaceStoreService().workspaceIdFromUsername(...args),
    workspaceLabel,
    workspaceIdSlug: (...args) => getLocalWorkspaceStoreService().workspaceIdSlug(...args),
  });
}

module.exports = {
  createMobileRuntimeWorkspaceFacadeService,
};
