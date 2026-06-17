"use strict";

const { createDirectoryBrowserApiRoutes } = require("./directory-browser-api-routes");
const { createDirectoryMutationApiRoutes } = require("./directory-mutation-api-routes");
const { createDirectoryShareApiRoutes } = require("./directory-share-api-routes");
const { createFileArtifactApiRoutes } = require("./file-artifact-api-routes");
const { createNoteReceiptApiRoutes } = require("./note-receipt-api-routes");
const { createNoteReceiptSaveService } = require("../adapters/note-receipt-save-service");

function directoryBoundaryMethod(deps, methodName) {
  return (...args) => deps.getDirectoryBrowserBoundaryService()[methodName](...args);
}

function sharedDirectoryMethod(deps, methodName) {
  return (...args) => deps.getSharedDirectoryProjectionService()[methodName](...args);
}

function createMobileApiDirectoryComposition(deps = {}) {
  const fileArtifactApiRoutes = createFileArtifactApiRoutes({
    contentDisposition: deps.contentDisposition,
    extractDocxText: deps.extractDocxText,
    mimeFor: deps.mimeFor,
    resolveArtifactForRequest: deps.resolveArtifactForRequest,
    resolveFileForBrowserRequest: deps.resolveFileForBrowserRequest,
    sendJson: deps.sendJson,
    textFilePreview: deps.textFilePreview,
  });
  const noteReceiptSaveService = deps.noteReceiptSaveService || createNoteReceiptSaveService({
    dataDir: deps.dataDir,
    env: deps.env,
    fetch: deps.fetch || global.fetch,
    mimeFor: deps.mimeFor,
    resolveArtifactForRequest: deps.resolveArtifactForRequest,
  });
  const noteReceiptApiRoutes = createNoteReceiptApiRoutes({
    actionInboxService: deps.actionInboxService,
    broadcast: deps.broadcast,
    findThreadForRequest: (...args) => deps.getRuntimeStateThreadService().findThreadForRequest(...args),
    noteReceiptSaveService,
    readBody: deps.readBody,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
  });

  const directoryBrowserApiRoutes = createDirectoryBrowserApiRoutes({
    compareDirectoryEntriesNewestFirst: directoryBoundaryMethod(deps, "compareDirectoryEntriesNewestFirst"),
    findDirectoryThreadForRequest: deps.findDirectoryThreadForRequest,
    publicDirectoryEntry: directoryBoundaryMethod(deps, "publicDirectoryEntry"),
    publicRemoteDirectoryEntry: directoryBoundaryMethod(deps, "publicRemoteDirectoryEntry"),
    resolveBrowserPathAsync: directoryBoundaryMethod(deps, "resolveBrowserPathAsync"),
    runDirectoryBridge: deps.runDirectoryBridge,
    sendJson: deps.sendJson,
  });

  const directoryShareApiRoutes = createDirectoryShareApiRoutes({
    basename: deps.basename,
    clearDynamicProjectCache: deps.clearDynamicProjectCache,
    directoryRequestParams: directoryBoundaryMethod(deps, "directoryRequestParams"),
    findDirectoryThreadForRequest: deps.findDirectoryThreadForRequest,
    invalidateCatalogCache: deps.invalidateCatalogCache,
    nowIso: deps.nowIso,
    readBody: deps.readBody,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    resolveBrowserPathAsync: directoryBoundaryMethod(deps, "resolveBrowserPathAsync"),
    sendJson: deps.sendJson,
    sharedDirectoryProjectionService: {
      normalizeSharePermission: sharedDirectoryMethod(deps, "normalizeSharePermission"),
      normalizeShareScope: sharedDirectoryMethod(deps, "normalizeShareScope"),
      normalizeShareTargets: sharedDirectoryMethod(deps, "normalizeShareTargets"),
      publicSharedDirectory: sharedDirectoryMethod(deps, "publicSharedDirectory"),
      removeSharedDirectoryRecord: sharedDirectoryMethod(deps, "removeSharedDirectoryRecord"),
      shareableRootProjectForPath: sharedDirectoryMethod(deps, "shareableRootProjectForPath"),
      sharedDirectoryLabel: sharedDirectoryMethod(deps, "sharedDirectoryLabel"),
      updateSharedDirectoryAccess: sharedDirectoryMethod(deps, "updateSharedDirectoryAccess"),
      upsertSharedDirectory: sharedDirectoryMethod(deps, "upsertSharedDirectory"),
    },
    statSync: deps.statSync,
    workspacePrincipal: deps.workspacePrincipal,
  });

  const directoryMutationApiRoutes = createDirectoryMutationApiRoutes({
    assertChildPathInside: directoryBoundaryMethod(deps, "assertChildPathInside"),
    authenticateRequest: deps.authenticateRequest,
    clearDynamicProjectCache: deps.clearDynamicProjectCacheForWorkspace,
    directoryRequestParams: directoryBoundaryMethod(deps, "directoryRequestParams"),
    exists: deps.exists,
    findDirectoryThreadForRequest: deps.findDirectoryThreadForRequest,
    invalidateCatalogCache: deps.invalidateCatalogCache,
    isDeletableWorkspaceRootChild: directoryBoundaryMethod(deps, "isDeletableWorkspaceRootChild"),
    isDirectoryBrowserPathAllowedForThread: deps.isDirectoryBrowserPathAllowedForThread,
    isProtectedDirectoryRoot: directoryBoundaryMethod(deps, "isProtectedDirectoryRoot"),
    isSharedDirectoryWriteAllowed: directoryBoundaryMethod(deps, "isSharedDirectoryWriteAllowed"),
    joinDisplayPath: directoryBoundaryMethod(deps, "joinDisplayPath"),
    joinLocalPath: deps.joinLocalPath,
    maxUploadBytes: deps.maxUploadBytes,
    mimeFor: deps.mimeFor,
    mkdir: deps.mkdir,
    publicManagedEntry: directoryBoundaryMethod(deps, "publicManagedEntry"),
    publicRemoteDirectoryEntry: directoryBoundaryMethod(deps, "publicRemoteDirectoryEntry"),
    readBody: deps.readBody,
    resolveBrowserPathAsync: directoryBoundaryMethod(deps, "resolveBrowserPathAsync"),
    rmdir: deps.rmdir,
    rmDirRecursive: deps.rmDirRecursive,
    rename: deps.rename,
    runDirectoryBridge: deps.runDirectoryBridge,
    safeDirectoryName: deps.safeDirectoryName,
    safeFileName: deps.safeFileName,
    sendJson: deps.sendJson,
    stat: deps.statSync,
    uniqueChildPath: deps.uniqueChildPath,
    unlink: deps.unlink,
    isOwnerAuth: deps.isOwnerAuth,
    isOwnerElevationActive: deps.isOwnerElevationActive,
    consumeOwnerElevationOnce: deps.consumeOwnerElevationOnce,
    write: deps.writeFile,
  });

  return {
    routes: {
      directoryBrowserApiRoutes,
      directoryMutationApiRoutes,
      directoryShareApiRoutes,
      fileArtifactApiRoutes,
      noteReceiptApiRoutes,
    },
    services: {
      noteReceiptSaveService,
    },
  };
}

module.exports = {
  createMobileApiDirectoryComposition,
};
