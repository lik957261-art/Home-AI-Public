"use strict";

function createMobileRuntimePathAccessService(options = {}) {
  const providerFrom = (value) => (typeof value === "function" ? value() : value) || {};
  const filesystemMountProvider = () => providerFrom(options.filesystemMountProvider);
  const pathPolicyProvider = () => providerFrom(options.pathPolicyProvider);
  const securityBoundaryProvider = () => providerFrom(options.securityBoundaryProvider);

  function normalizeLocalPath(rawPath) {
    const provider = filesystemMountProvider();
    return typeof provider.normalizeLocalPath === "function"
      ? provider.normalizeLocalPath(rawPath)
      : String(rawPath || "");
  }

  function windowsPathToWsl(value) {
    const provider = filesystemMountProvider();
    return typeof provider.windowsPathToWsl === "function"
      ? provider.windowsPathToWsl(value)
      : String(value || "");
  }

  function allowedRoots() {
    const filesystemProvider = filesystemMountProvider();
    const boundaryProvider = securityBoundaryProvider();
    const roots = typeof filesystemProvider.resolvedAllowedRoots === "function"
      ? filesystemProvider.resolvedAllowedRoots()
      : [];
    return typeof boundaryProvider.filterRoots === "function"
      ? boundaryProvider.filterRoots(roots)
      : roots;
  }

  function isPathAllowed(filePath) {
    const filesystemProvider = filesystemMountProvider();
    const boundaryProvider = securityBoundaryProvider();
    if (typeof boundaryProvider.isProtectedPath === "function" && boundaryProvider.isProtectedPath(filePath)) {
      return false;
    }
    return typeof filesystemProvider.isPathAllowed === "function"
      ? Boolean(filesystemProvider.isPathAllowed(filePath))
      : false;
  }

  function isPathAllowedForThread(thread, localPath, originalPath = "") {
    const provider = pathPolicyProvider();
    const result = typeof provider.canReadForThread === "function"
      ? provider.canReadForThread(thread, localPath, originalPath)
      : null;
    return Boolean(result && result.allowed);
  }

  function isDirectoryBrowserPathAllowedForThread(thread, localPath, originalPath = "") {
    const provider = pathPolicyProvider();
    const result = typeof provider.canBrowseDirectoryForThread === "function"
      ? provider.canBrowseDirectoryForThread(thread, localPath, originalPath)
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
