"use strict";

const { createDirectoryBrowserBoundaryService } = require("./directory-browser-boundary-service");

function requireDependency(options, name) {
  const value = options[name];
  if (value === undefined || value === null) {
    throw new Error(`mobile runtime file access facade requires ${name}`);
  }
  return value;
}

function requireFunction(options, name) {
  const value = requireDependency(options, name);
  if (typeof value !== "function") {
    throw new Error(`mobile runtime file access facade requires ${name}`);
  }
  return value;
}

function createMobileRuntimeFileAccessFacadeService(options = {}) {
  const fileArtifactResolverService = requireDependency(options, "fileArtifactResolverService");
  const fileResponseService = requireDependency(options, "fileResponseService");
  const pathPolicyProvider = requireDependency(options, "pathPolicyProvider");
  const allProjectsForWorkspaceSync = requireFunction(options, "allProjectsForWorkspaceSync");
  const authenticateRequest = requireFunction(options, "authenticateRequest");
  const authCanAccessWorkspace = requireFunction(options, "authCanAccessWorkspace");
  const chatGroupMemberWorkspaceIds = requireFunction(options, "chatGroupMemberWorkspaceIds");
  const comparablePath = requireFunction(options, "comparablePath");
  const dedupe = requireFunction(options, "dedupe");
  const findThreadForAuth = requireFunction(options, "findThreadForAuth");
  const getRuntimeStateNormalizationService = requireFunction(options, "getRuntimeStateNormalizationService");
  const getSingleWindowThreadService = requireFunction(options, "getSingleWindowThreadService");
  const isOwnerAuth = requireFunction(options, "isOwnerAuth");
  const logicalDirectoryDisplayPath = requireFunction(options, "logicalDirectoryDisplayPath");
  const mimeFor = requireFunction(options, "mimeFor");
  const normalizeLocalPath = requireFunction(options, "normalizeLocalPath");
  const pathDirectChildOfRoot = requireFunction(options, "pathDirectChildOfRoot");
  const pathInsideAnyRoot = requireFunction(options, "pathInsideAnyRoot");
  const policyForThread = requireFunction(options, "policyForThread");
  const runDirectoryBridge = requireFunction(options, "runDirectoryBridge");
  const sharedDirectoryProvider = requireDependency(options, "sharedDirectoryProvider");
  const sharedDirectoryRoots = requireFunction(options, "sharedDirectoryRoots");
  let directoryBrowserBoundaryService = null;

  function getDirectoryBrowserBoundaryService() {
    if (!directoryBrowserBoundaryService) {
      directoryBrowserBoundaryService = createDirectoryBrowserBoundaryService({
        allProjectsForWorkspaceSync,
        authCanAccessWorkspace,
        chatGroupMemberWorkspaceIds,
        comparablePath,
        dedupe,
        isKanbanCaseTopicThread: (...args) => getSingleWindowThreadService().isKanbanCaseTopicThread(...args),
        isOwnerAuth,
        logicalDirectoryDisplayPath,
        mimeFor,
        normalizeLocalPath,
        normalizeTaskGroupMeta: (...args) => getRuntimeStateNormalizationService().normalizeTaskGroupMeta(...args),
        pathDirectChildOfRoot,
        pathInsideAnyRoot,
        pathPolicyProvider,
        policyForThread,
        runDirectoryBridge,
        sharedDirectoryProvider,
        sharedDirectoryRoots,
      });
    }
    return directoryBrowserBoundaryService;
  }

  function resolveFileForBrowserRequest(query, auth = null) {
    return fileArtifactResolverService.resolveFileForBrowserRequest(query, auth);
  }

  function resolveArtifactForRequest(artifactId, auth = null) {
    return fileArtifactResolverService.resolveArtifactForRequest(artifactId, auth);
  }

  function sendResolvedFile(res, file, query) {
    return fileResponseService.sendResolvedFile(res, file, query);
  }

  function sendResolvedBridgeFile(res, file, query) {
    return fileResponseService.sendResolvedBridgeFile(res, file, query);
  }

  function sendResolvedFilePreview(res, file) {
    return fileResponseService.sendResolvedFilePreview(res, file);
  }

  function sendResolvedBridgeFilePreview(res, file) {
    return fileResponseService.sendResolvedBridgeFilePreview(res, file);
  }

  function ownerDirectoryBrowserThread() {
    return {
      id: "owner-directory-browser",
      title: "Owner Directory Browser",
      workspaceId: "owner",
      projectId: "",
      subprojectId: "",
      singleWindow: false,
      status: "idle",
      taskGroupMeta: {},
      chatGroup: { enabled: false, memberWorkspaceIds: [] },
      messages: [],
    };
  }

  function findDirectoryThreadForRequest(req, threadId) {
    const auth = authenticateRequest(req);
    const thread = findThreadForAuth(auth, threadId);
    if (thread) return thread;
    return isOwnerAuth(auth) ? ownerDirectoryBrowserThread() : null;
  }

  return {
    findDirectoryThreadForRequest,
    getDirectoryBrowserBoundaryService,
    ownerDirectoryBrowserThread,
    resolveArtifactForRequest,
    resolveFileForBrowserRequest,
    sendResolvedBridgeFile,
    sendResolvedBridgeFilePreview,
    sendResolvedFile,
    sendResolvedFilePreview,
  };
}

module.exports = {
  createMobileRuntimeFileAccessFacadeService,
};
