"use strict";

function createMobileRuntimePathAccessService(options = {}) {
  const filesystemMountProvider = options.filesystemMountProvider || {};
  const pathPolicyProvider = options.pathPolicyProvider || {};
  const securityBoundaryProvider = options.securityBoundaryProvider || {};

  function normalizeLocalPath(rawPath) {
    return typeof filesystemMountProvider.normalizeLocalPath === "function"
      ? filesystemMountProvider.normalizeLocalPath(rawPath)
      : String(rawPath || "");
  }

  function windowsPathToWsl(value) {
    return typeof filesystemMountProvider.windowsPathToWsl === "function"
      ? filesystemMountProvider.windowsPathToWsl(value)
      : String(value || "");
  }

  function allowedRoots() {
    const roots = typeof filesystemMountProvider.resolvedAllowedRoots === "function"
      ? filesystemMountProvider.resolvedAllowedRoots()
      : [];
    return typeof securityBoundaryProvider.filterRoots === "function"
      ? securityBoundaryProvider.filterRoots(roots)
      : roots;
  }

  function isPathAllowed(filePath) {
    if (typeof securityBoundaryProvider.isProtectedPath === "function" && securityBoundaryProvider.isProtectedPath(filePath)) {
      return false;
    }
    return typeof filesystemMountProvider.isPathAllowed === "function"
      ? Boolean(filesystemMountProvider.isPathAllowed(filePath))
      : false;
  }

  function isPathAllowedForThread(thread, localPath, originalPath = "") {
    const result = typeof pathPolicyProvider.canReadForThread === "function"
      ? pathPolicyProvider.canReadForThread(thread, localPath, originalPath)
      : null;
    return Boolean(result && result.allowed);
  }

  function isDirectoryBrowserPathAllowedForThread(thread, localPath, originalPath = "") {
    const result = typeof pathPolicyProvider.canBrowseDirectoryForThread === "function"
      ? pathPolicyProvider.canBrowseDirectoryForThread(thread, localPath, originalPath)
      : null;
    return Boolean(result && result.allowed);
  }

  return {
    allowedRoots,
    isDirectoryBrowserPathAllowedForThread,
    isPathAllowed,
    isPathAllowedForThread,
    normalizeLocalPath,
    windowsPathToWsl,
  };
}

module.exports = {
  createMobileRuntimePathAccessService,
};
