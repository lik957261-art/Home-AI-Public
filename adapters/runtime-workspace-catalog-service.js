"use strict";

const { createSharedDirectoryProjectionService } = require("./shared-directory-projection-service");
const { createWorkspaceProjectProvider } = require("./workspace-project-provider");

function createRuntimeWorkspaceCatalogService(options = {}) {
  const path = options.path || require("node:path");
  const dynamicProjectCache = options.dynamicProjectCache || new Map();
  const sharedDirectoryProvider = options.sharedDirectoryProvider;
  const projectDiscoveryProvider = options.projectDiscoveryProvider;
  const workspaceBindingsProvider = options.workspaceBindingsProvider;
  const accessPolicyProvider = options.accessPolicyProvider;
  const securityBoundaryProvider = options.securityBoundaryProvider;
  let sharedDirectoryProjectionService = null;
  let workspaceProjectProvider = null;

  const dedupe = typeof options.dedupe === "function"
    ? options.dedupe
    : ((values = []) => [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))]);
  const dedupeProjects = (...args) => projectDiscoveryProvider.dedupeProjects(...args);

  function getSharedDirectoryProjectionService() {
    if (!sharedDirectoryProjectionService) {
      sharedDirectoryProjectionService = createSharedDirectoryProjectionService({
        sharedDirectoryProvider,
        assertRootNotProtected: (root, message) => securityBoundaryProvider.assertRootNotProtected(root, message),
        cachedDynamicProjectsForWorkspace,
        comparablePath: options.comparablePath,
        dedupeProjects,
        isShareableRootProject,
        loadCatalog,
        remoteWorkspaceDirectoryProjects,
        setDynamicProjectsForWorkspace,
      });
    }
    return sharedDirectoryProjectionService;
  }

  function sharedDirectoryLabel(rawPath) {
    return getSharedDirectoryProjectionService().sharedDirectoryLabel(rawPath);
  }

  function normalizeSharePermission(value) {
    return getSharedDirectoryProjectionService().normalizeSharePermission(value);
  }

  function normalizeShareTargets(value) {
    return getSharedDirectoryProjectionService().normalizeShareTargets(value);
  }

  function normalizeShareScope(value, targets) {
    return getSharedDirectoryProjectionService().normalizeShareScope(value, targets);
  }

  function sharedDirectoryRoots(workspaceId = "") {
    return getSharedDirectoryProjectionService().roots(workspaceId, workspaceId);
  }

  function publicSharedDirectory(record, workspaceId = "owner") {
    return getSharedDirectoryProjectionService().publicSharedDirectory(record, workspaceId);
  }

  function removeSharedDirectoryRecord(identifier, workspaceId = "owner") {
    return getSharedDirectoryProjectionService().removeSharedDirectoryRecord(identifier, workspaceId);
  }

  function sharedDirectoriesForWorkspace(workspaceId = "owner") {
    return sharedDirectoryProvider.directoriesForWorkspace(workspaceId);
  }

  function updateSharedDirectoryAccess(identifier, workspaceId = "owner", updates = {}) {
    return getSharedDirectoryProjectionService().updateSharedDirectoryAccess(identifier, workspaceId, updates);
  }

  function upsertSharedDirectory(record) {
    return getSharedDirectoryProjectionService().upsertSharedDirectory(record);
  }

  function getWorkspaceProjectProvider() {
    if (!workspaceProjectProvider) {
      workspaceProjectProvider = createWorkspaceProjectProvider({
        readJsonFirst: options.readJsonFirst,
        usersPaths: options.usersPaths,
        routeMapPaths: options.routeMapPaths,
        projectMapPaths: options.projectMapPaths,
        repoRoot: options.repoRoot,
        defaultOwnerWorkspace: options.defaultOwnerWorkspace,
        ownerLabel: options.ownerLabel,
        normalizeStringList: options.normalizeStringList,
        buildAccessPolicy,
        projectsForWorkspace,
        localWorkspaces: options.localWorkspaces,
        ownerAliases: options.ownerAliases,
        fallbackOwnerPolicy: options.fallbackOwnerPolicy,
      });
    }
    return workspaceProjectProvider;
  }

  function invalidateCatalogCache() {
    if (workspaceProjectProvider) workspaceProjectProvider.invalidate();
  }

  function loadCatalog() {
    options.bootTrace?.("loadCatalog enter");
    const catalog = getWorkspaceProjectProvider().loadCatalog();
    options.bootTrace?.(`loadCatalog done workspaces=${catalog.workspaces.length} projects=${catalog.projects.length}`);
    return catalog;
  }

  function mergeDefaultExternalAccessPolicy(policy) {
    const source = policy && typeof policy === "object" ? policy : {};
    const additions = workspaceBindingsProvider.accessPolicyAdditions(source);
    return Object.assign({}, source, {
      allowed_toolsets: dedupe([
        ...(source.allowed_toolsets || []),
        ...(additions.allowed_toolsets || []),
      ]),
      connector_profiles: Object.assign(
        {},
        source.connector_profiles || {},
        additions.connector_profiles || {},
      ),
    });
  }

  function mergeAccessPolicyOverride(basePolicy, overridePolicy) {
    const base = basePolicy && typeof basePolicy === "object" ? basePolicy : {};
    const override = overridePolicy && typeof overridePolicy === "object" ? overridePolicy : {};
    const merged = Object.assign({}, base, override);
    merged.allowed_toolsets = dedupe([
      ...(base.allowed_toolsets || []),
      ...(override.allowed_toolsets || []),
    ]);
    merged.connector_profiles = Object.assign(
      {},
      base.connector_profiles || {},
      override.connector_profiles || {},
    );
    return merged;
  }

  function buildAccessPolicy(route, user, project, hardeningOptions = {}) {
    const policy = mergeDefaultExternalAccessPolicy(accessPolicyProvider.build(route, user, project));
    return securityBoundaryProvider.hardenAccessPolicy(policy, hardeningOptions);
  }

  function sharedDirectoryProjectsForWorkspace(workspaceId, workspaces = null) {
    return getSharedDirectoryProjectionService().sharedDirectoryProjectsForWorkspace(workspaceId, workspaces);
  }

  function projectsForWorkspace(workspace, projectEntries, workspaces = null) {
    return projectDiscoveryProvider.projectsForWorkspace(workspace, projectEntries, workspaces);
  }

  function cachedDynamicProjectsForWorkspace(workspaceId) {
    const cached = dynamicProjectCache.get(String(workspaceId || ""));
    if (!cached || Date.now() > cached.expiresAt) {
      dynamicProjectCache.delete(String(workspaceId || ""));
      return [];
    }
    return cached.projects || [];
  }

  function setDynamicProjectsForWorkspace(workspaceId, projects) {
    dynamicProjectCache.set(String(workspaceId || ""), {
      expiresAt: Date.now() + 30_000,
      projects: dedupeProjects(projects || []),
    });
  }

  function clearDynamicProjectCache(workspaceId = "") {
    if (!workspaceId) {
      dynamicProjectCache.clear();
      return;
    }
    dynamicProjectCache.delete(String(workspaceId || ""));
  }

  function allProjectsForWorkspaceSync(workspaceId) {
    return getSharedDirectoryProjectionService().allProjectsForWorkspaceSync(workspaceId);
  }

  async function publicProjectsForWorkspace(workspaceId) {
    return getSharedDirectoryProjectionService().publicProjectsForWorkspace(workspaceId);
  }

  function isShareableRootProject(project) {
    return projectDiscoveryProvider.isShareableRootProject(project);
  }

  async function shareableRootProjectForPath(workspaceId, displayPath) {
    return getSharedDirectoryProjectionService().shareableRootProjectForPath(workspaceId, displayPath);
  }

  async function remoteWorkspaceDirectoryProjects(workspace) {
    return projectDiscoveryProvider.remoteWorkspaceDirectoryProjects(workspace);
  }

  function findWorkspace(id) {
    return loadCatalog().workspaces.find((item) => item.id === id) || null;
  }

  function findProject(workspaceId, projectId) {
    return allProjectsForWorkspaceSync(workspaceId).find((item) => item.workspaceId === workspaceId && item.id === projectId) || null;
  }

  function findSubproject(project, subprojectId) {
    if (!project || !subprojectId) return null;
    return (project.children || []).find((item) => item.id === subprojectId) || null;
  }

  function effectiveProjectForThread(thread) {
    const project = findProject(thread.workspaceId, thread.projectId);
    const subproject = findSubproject(project, thread.subprojectId);
    if (!subproject) return project;
    return Object.assign({}, subproject, {
      workspaceId: project.workspaceId,
      parentProjectId: project.id,
      parentLabel: project.label,
    });
  }

  function policyForThread(thread) {
    const workspace = findWorkspace(thread.workspaceId);
    const project = effectiveProjectForThread(thread);
    return buildAccessPolicy(workspace?.policy || workspace || {}, {}, project);
  }

  return {
    allProjectsForWorkspaceSync,
    buildAccessPolicy,
    cachedDynamicProjectsForWorkspace,
    clearDynamicProjectCache,
    effectiveProjectForThread,
    findProject,
    findSubproject,
    findWorkspace,
    getSharedDirectoryProjectionService,
    getWorkspaceProjectProvider,
    invalidateCatalogCache,
    isShareableRootProject,
    loadCatalog,
    mergeAccessPolicyOverride,
    mergeDefaultExternalAccessPolicy,
    normalizeSharePermission,
    normalizeShareScope,
    normalizeShareTargets,
    policyForThread,
    projectsForWorkspace,
    publicProjectsForWorkspace,
    publicSharedDirectory,
    remoteWorkspaceDirectoryProjects,
    removeSharedDirectoryRecord,
    setDynamicProjectsForWorkspace,
    shareableRootProjectForPath,
    sharedDirectoriesForWorkspace,
    sharedDirectoryLabel,
    sharedDirectoryProjectsForWorkspace,
    sharedDirectoryRoots,
    updateSharedDirectoryAccess,
    upsertSharedDirectory,
  };
}

module.exports = {
  createRuntimeWorkspaceCatalogService,
};
