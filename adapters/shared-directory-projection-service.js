"use strict";

function requireFunction(deps, name) {
  if (typeof deps[name] !== "function") throw new TypeError(`shared directory projection service requires ${name}`);
}

function requireProvider(provider, names) {
  for (const name of names) {
    if (typeof provider?.[name] !== "function") {
      throw new TypeError(`shared directory projection service requires sharedDirectoryProvider.${name}`);
    }
  }
}

function createSharedDirectoryProjectionService(options = {}) {
  const sharedDirectoryProvider = options.sharedDirectoryProvider;
  requireProvider(sharedDirectoryProvider, [
    "directoriesForWorkspace",
    "label",
    "normalizePermission",
    "normalizeScope",
    "normalizeTargets",
    "projectsForWorkspace",
    "publicRecord",
    "removeRecord",
    "roots",
    "updateAccess",
    "upsert",
  ]);
  for (const name of [
    "cachedDynamicProjectsForWorkspace",
    "comparablePath",
    "dedupeProjects",
    "isShareableRootProject",
    "loadCatalog",
    "remoteWorkspaceDirectoryProjects",
    "setDynamicProjectsForWorkspace",
  ]) {
    requireFunction(options, name);
  }

  const assertRootNotProtected = typeof options.assertRootNotProtected === "function"
    ? options.assertRootNotProtected
    : () => {};

  function listPublicSharedDirectories(workspaceId = "owner") {
    return sharedDirectoryProvider.directoriesForWorkspace(workspaceId)
      .map((record) => sharedDirectoryProvider.publicRecord(record, workspaceId))
      .filter(Boolean);
  }

  function sharedDirectoryProjectsForWorkspace(workspaceId, workspaces = null) {
    return sharedDirectoryProvider.projectsForWorkspace(workspaceId, workspaces);
  }

  function allProjectsForWorkspaceSync(workspaceId) {
    return options.dedupeProjects([
      ...options.loadCatalog().projects.filter((item) => item.workspaceId === workspaceId),
      ...options.cachedDynamicProjectsForWorkspace(workspaceId),
      ...sharedDirectoryProjectsForWorkspace(workspaceId),
    ]);
  }

  async function publicProjectsForWorkspace(workspaceId) {
    const catalog = options.loadCatalog();
    const workspace = catalog.workspaces.find((item) => item.id === workspaceId);
    const base = catalog.projects.filter((item) => item.workspaceId === workspaceId);
    const shared = sharedDirectoryProjectsForWorkspace(workspaceId, catalog.workspaces);
    if (!workspace || workspace.id === "owner" || workspace.policy?.access_mode === "unrestricted") {
      return options.dedupeProjects([...base, ...shared]);
    }
    const root = String(workspace.defaultWorkspace || workspace.policy?.default_workspace || "").trim();
    if (!root.startsWith("/volume1/")) return options.dedupeProjects([...base, ...shared]);
    let dynamic = options.cachedDynamicProjectsForWorkspace(workspaceId);
    if (!dynamic.length) {
      dynamic = await options.remoteWorkspaceDirectoryProjects(workspace);
      options.setDynamicProjectsForWorkspace(workspaceId, dynamic);
    }
    return options.dedupeProjects([...dynamic, ...base, ...shared]);
  }

  async function shareableRootProjectForPath(workspaceId, displayPath) {
    const key = options.comparablePath(displayPath);
    if (!key) return null;
    const projects = await publicProjectsForWorkspace(workspaceId);
    return projects.find((project) => (
      options.isShareableRootProject(project) && options.comparablePath(project.root) === key
    )) || null;
  }

  function upsertSharedDirectory(record) {
    assertRootNotProtected(
      record?.path || record?.root || "",
      "Shared directory is blocked by the Hermes Mobile security boundary",
    );
    return sharedDirectoryProvider.upsert(record);
  }

  return {
    allProjectsForWorkspaceSync,
    listPublicSharedDirectories,
    normalizeSharePermission: (value) => sharedDirectoryProvider.normalizePermission(value),
    normalizeShareScope: (value, targets) => sharedDirectoryProvider.normalizeScope(value, targets),
    normalizeShareTargets: (value) => sharedDirectoryProvider.normalizeTargets(value),
    publicProjectsForWorkspace,
    publicSharedDirectory: (record, workspaceId = "owner") => sharedDirectoryProvider.publicRecord(record, workspaceId),
    removeSharedDirectoryRecord: (identifier, workspaceId = "owner") => sharedDirectoryProvider.removeRecord(identifier, workspaceId),
    roots: (workspaceId = "", actorPrincipalOverride = workspaceId) => sharedDirectoryProvider.roots(workspaceId, actorPrincipalOverride),
    shareableRootProjectForPath,
    sharedDirectoryLabel: (rawPath) => sharedDirectoryProvider.label(rawPath),
    sharedDirectoryProjectsForWorkspace,
    updateSharedDirectoryAccess: (identifier, workspaceId = "owner", updates = {}) => (
      sharedDirectoryProvider.updateAccess(identifier, workspaceId, updates)
    ),
    upsertSharedDirectory,
  };
}

module.exports = {
  createSharedDirectoryProjectionService,
};
