"use strict";

const fs = require("node:fs");
const path = require("node:path");

function defaultDedupe(values = []) {
  return [...new Set(values)];
}

function createDirectoryBrowserBoundaryService(options = {}) {
  const allProjectsForWorkspaceSync = options.allProjectsForWorkspaceSync || (() => []);
  const authCanAccessWorkspace = options.authCanAccessWorkspace || (() => false);
  const chatGroupMemberWorkspaceIds = options.chatGroupMemberWorkspaceIds || (() => []);
  const comparablePath = options.comparablePath || ((value) => String(value || "").replaceAll("\\", "/").toLowerCase());
  const dedupe = options.dedupe || defaultDedupe;
  const isKanbanCaseTopicThread = options.isKanbanCaseTopicThread || (() => false);
  const isOwnerAuth = options.isOwnerAuth || (() => false);
  const logicalDirectoryDisplayPath = options.logicalDirectoryDisplayPath || ((_thread, rawPath, fallbackLabel = "") => rawPath || fallbackLabel);
  const mimeFor = options.mimeFor || (() => "");
  const normalizeLocalPath = options.normalizeLocalPath || ((value) => String(value || ""));
  const normalizeTaskGroupMeta = options.normalizeTaskGroupMeta || ((value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {}));
  const pathDirectChildOfRoot = options.pathDirectChildOfRoot || (() => false);
  const pathInsideAnyRoot = options.pathInsideAnyRoot || (() => false);
  const pathPolicyProvider = options.pathPolicyProvider;
  const policyForThread = options.policyForThread || (() => ({}));
  const runDirectoryBridge = options.runDirectoryBridge || (async () => ({ ok: false }));
  const sharedDirectoryProvider = options.sharedDirectoryProvider || { isWriteAllowed: () => false };
  const sharedDirectoryRoots = options.sharedDirectoryRoots || (() => []);

  if (!pathPolicyProvider || typeof pathPolicyProvider.assertChildPathInside !== "function") {
    throw new Error("directory browser boundary service requires pathPolicyProvider");
  }

  function directoryAliasKey(value) {
    return String(value || "")
      .replace(/^目录别名\s*[:：]\s*/, "")
      .replace(/^`+|`+$/g, "")
      .replace(/\s*\/\s*/g, "/")
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function directoryAliasLabels(project, parentLabel = "") {
    const labels = [
      project.label,
      ...(project.aliases || []),
    ].filter(Boolean);
    if (parentLabel && project.label) labels.push(`${parentLabel} / ${project.label}`);
    return labels;
  }

  function resolveDirectoryAlias(thread, alias) {
    const key = directoryAliasKey(alias);
    if (!key) return null;
    const projects = allProjectsForWorkspaceSync(thread.workspaceId).filter((project) => !project.hidden);
    for (const project of projects) {
      for (const label of directoryAliasLabels(project)) {
        if (directoryAliasKey(label) === key && project.root) return { label, path: project.root };
      }
      for (const child of project.children || []) {
        const parentLabel = project.label || "";
        for (const label of directoryAliasLabels(child, parentLabel)) {
          if (directoryAliasKey(label) === key && child.root) return { label, path: child.root };
        }
      }
    }
    return null;
  }

  function isAbsoluteBrowserPath(value) {
    const text = String(value || "").trim();
    return Boolean(text
      && (path.isAbsolute(text)
        || /^[A-Za-z]:[\\/]/.test(text)
        || text.startsWith("/volume1/")));
  }

  function defaultWorkspacePathForThread(thread) {
    const policy = policyForThread(thread);
    return String(policy?.default_workspace || policy?.defaultWorkspace || "").trim();
  }

  function fallbackBrowserPath(thread, rawPath, alias) {
    if (alias) return null;
    const defaultWorkspace = defaultWorkspacePathForThread(thread);
    if (!defaultWorkspace) return null;
    if (!rawPath) return { label: path.basename(defaultWorkspace), path: defaultWorkspace };
    if (isAbsoluteBrowserPath(rawPath)) return { label: path.basename(rawPath), path: rawPath };
    if (rawPath.includes("..")) return null;
    return {
      label: path.basename(rawPath),
      path: path.join(defaultWorkspace, rawPath),
    };
  }

  function resolveBrowserPath(thread, query) {
    const rawPath = String(query.get("path") || "").trim();
    const alias = String(query.get("alias") || "").trim();
    const aliasResolved = alias ? resolveDirectoryAlias(thread, alias) : null;
    const resolved = aliasResolved || fallbackBrowserPath(thread, rawPath, alias);
    if (!resolved?.path) return null;
    const localPath = normalizeLocalPath(resolved.path);
    if (!localPath || !fs.existsSync(localPath)) return null;
    if (!pathPolicyProvider.canBrowseDirectoryForThread(thread, localPath, resolved.path).allowed) return null;
    const label = resolved.label || path.basename(localPath);
    return {
      label,
      displayPath: resolved.path,
      workspacePath: logicalDirectoryDisplayPath(thread, resolved.path, label),
      localPath,
    };
  }

  async function resolveVolume1RemoteBrowserPath(thread, fallback) {
    const displayPath = String(fallback?.path || "").trim();
    if (!displayPath.startsWith("/volume1/")) return null;
    if (!pathPolicyProvider.canBrowseDirectoryForThread(thread, "", displayPath).allowed) return null;

    let result;
    try {
      result = await runDirectoryBridge({ action: "stat", path: displayPath });
    } catch (_) {
      return null;
    }
    if (!result?.ok || !result.entry) return null;
    const label = fallback?.label || result.entry.name || path.basename(displayPath);
    return {
      label,
      displayPath,
      workspacePath: logicalDirectoryDisplayPath(thread, displayPath, label),
      localPath: "",
      remote: "wsl",
      remotePath: displayPath,
      remoteEntry: result.entry,
    };
  }

  async function resolveBrowserPathAsync(thread, query) {
    const rawPath = String(query.get("path") || "").trim();
    const alias = String(query.get("alias") || "").trim();
    const aliasResolved = alias ? resolveDirectoryAlias(thread, alias) : null;
    const fallback = aliasResolved || fallbackBrowserPath(thread, rawPath, alias);

    const remoteVolume1 = await resolveVolume1RemoteBrowserPath(thread, fallback);
    if (remoteVolume1) return remoteVolume1;

    return resolveBrowserPath(thread, query);
  }

  function directoryRequestParams(body = {}) {
    const params = new URLSearchParams();
    for (const name of ["threadId", "path", "alias"]) {
      const value = String(body[name] || "").trim();
      if (value) params.set(name, value);
    }
    return params;
  }

  function assertChildPathInside(parentPath, childPath) {
    return pathPolicyProvider.assertChildPathInside(parentPath, childPath);
  }

  function protectedDirectoryRoots(thread) {
    const policy = policyForThread(thread);
    const roots = [
      policy.default_workspace,
      policy.sync_root,
      policy.download_root,
      ...(policy.allowed_roots || []),
      ...(policy.delivery_roots || []),
      ...allProjectsForWorkspaceSync(thread.workspaceId)
        .flatMap((project) => [project.root, ...(project.children || []).map((child) => child.root)]),
    ].filter(Boolean);
    return dedupe(roots.flatMap((root) => [root, normalizeLocalPath(root)].filter(Boolean)));
  }

  function isProtectedDirectoryRoot(thread, localPath, displayPath = "") {
    const localKey = comparablePath(localPath);
    const displayKey = comparablePath(displayPath);
    return protectedDirectoryRoots(thread).some((root) => {
      const key = comparablePath(root);
      return key && (key === localKey || key === displayKey);
    });
  }

  function directoryRootProjectForPathSync(thread, localPath, displayPath = "") {
    const localKey = comparablePath(localPath);
    const displayKey = comparablePath(displayPath);
    return allProjectsForWorkspaceSync(thread.workspaceId).find((project) => {
      const key = comparablePath(project?.root);
      return key && (key === localKey || key === displayKey);
    }) || null;
  }

  function isDeletableWorkspaceRootChild(thread, localPath, displayPath = "") {
    const policy = policyForThread(thread);
    const defaultWorkspace = policy.default_workspace || "";
    if (!defaultWorkspace) return false;
    const project = directoryRootProjectForPathSync(thread, localPath, displayPath);
    if (project) {
      const source = String(project.source || "");
      if (source !== "workspace-directory" && source !== "workspace-directory-wsl") return false;
      if (project.shared || project.hidden || project.singleWindow) return false;
      if (["general", "sync", "download"].includes(String(project.id || ""))) return false;
    }
    const candidates = [displayPath, localPath, normalizeLocalPath(localPath)].filter(Boolean);
    const hardProtected = [
      policy.default_workspace,
      policy.sync_root,
      policy.download_root,
      ...(policy.delivery_roots || []),
      ...(policy.cache_roots || []),
      ...sharedDirectoryRoots(thread.workspaceId),
    ].filter(Boolean);
    if (candidates.some((candidate) => hardProtected.some((root) => comparablePath(candidate) === comparablePath(root)))) {
      return false;
    }
    return candidates.some((candidate) => pathDirectChildOfRoot(candidate, defaultWorkspace));
  }

  function isOwnWritableDirectoryPath(thread, localPath, displayPath = "") {
    const policy = policyForThread(thread);
    if (policy.access_mode === "unrestricted" || policy.principal_id === "owner") return true;
    const roots = [
      policy.default_workspace,
      policy.sync_root,
      policy.download_root,
    ].filter(Boolean);
    return pathInsideAnyRoot(displayPath || localPath, roots)
      || pathInsideAnyRoot(localPath, roots.map(normalizeLocalPath));
  }

  function caseTopicDirectoryRoots(thread) {
    if (!isKanbanCaseTopicThread(thread)) return [];
    const roots = [];
    for (const meta of Object.values(normalizeTaskGroupMeta(thread.taskGroupMeta))) {
      if (!meta || typeof meta !== "object") continue;
      if (meta.directoryRoute?.root) roots.push(meta.directoryRoute.root);
      if (meta.directoryRoute?.path) roots.push(meta.directoryRoute.path);
      if (meta.caseDirectoryPath) roots.push(meta.caseDirectoryPath);
    }
    return dedupe(roots.filter(Boolean));
  }

  function isReadOnlyCaseTopicDirectoryForAuth(thread, auth, localPath, displayPath = "") {
    if (!isKanbanCaseTopicThread(thread)) return false;
    if (isOwnerAuth(auth) || authCanAccessWorkspace(auth, thread.workspaceId)) return false;
    const actorWorkspaceId = String(auth?.workspaceId || "").trim();
    if (!actorWorkspaceId || !chatGroupMemberWorkspaceIds(thread).includes(actorWorkspaceId)) return false;
    const roots = caseTopicDirectoryRoots(thread);
    if (!roots.length) return false;
    return pathInsideAnyRoot(displayPath || localPath, roots)
      || pathInsideAnyRoot(localPath, roots)
      || pathInsideAnyRoot(normalizeLocalPath(localPath), roots.map(normalizeLocalPath));
  }

  function isSharedDirectoryWriteAllowed(thread, localPath, displayPath = "", auth = null) {
    if (isReadOnlyCaseTopicDirectoryForAuth(thread, auth, localPath, displayPath)) return false;
    if (isOwnWritableDirectoryPath(thread, localPath, displayPath)) return true;
    return sharedDirectoryProvider.isWriteAllowed(thread, localPath, displayPath);
  }

  function joinDisplayPath(parent, name) {
    const base = String(parent || "");
    if (base.includes("/") && !base.includes("\\")) return `${base.replace(/\/+$/, "")}/${name}`;
    return path.join(base, name);
  }

  function isHiddenDirectoryEntryName(name) {
    const text = String(name || "").trim();
    return !text || text.startsWith(".") || text.startsWith("@") || text.startsWith("#");
  }

  function publicDirectoryEntry(thread, parentDisplayPath, parentLocalPath, dirent) {
    if (isHiddenDirectoryEntryName(dirent.name)) return null;
    const localPath = path.join(parentLocalPath, dirent.name);
    let stat;
    try {
      stat = fs.statSync(localPath);
    } catch (_) {
      return null;
    }
    const displayPath = joinDisplayPath(parentDisplayPath || parentLocalPath, dirent.name);
    const isDirectory = stat.isDirectory();
    const params = new URLSearchParams({ threadId: thread.id, path: displayPath });
    const workspacePath = logicalDirectoryDisplayPath(thread, displayPath, dirent.name);
    return {
      name: dirent.name,
      type: isDirectory ? "directory" : "file",
      size: isDirectory ? 0 : stat.size,
      mtime: stat.mtime.toISOString(),
      mime: isDirectory ? "" : mimeFor(localPath),
      path: displayPath,
      displayPath: workspacePath,
      workspacePath,
      url: isDirectory ? `/directory-viewer.html?${params.toString()}` : `/api/files?${params.toString()}`,
    };
  }

  function publicManagedEntry(thread, parentDisplayPath, parentLocalPath, localPath) {
    const name = path.basename(localPath);
    return publicDirectoryEntry(thread, parentDisplayPath, parentLocalPath, {
      name,
      isDirectory: () => fs.statSync(localPath).isDirectory(),
    });
  }

  function publicRemoteDirectoryEntry(thread, parentDisplayPath, entry) {
    if (isHiddenDirectoryEntryName(entry?.name)) return null;
    const displayPath = String(entry?.path || joinDisplayPath(parentDisplayPath, entry?.name || ""));
    const isDirectory = entry?.type === "directory";
    const params = new URLSearchParams({ threadId: thread.id, path: displayPath });
    const workspacePath = logicalDirectoryDisplayPath(thread, displayPath, entry?.name || path.posix.basename(displayPath));
    return {
      name: String(entry?.name || path.posix.basename(displayPath) || "item"),
      type: isDirectory ? "directory" : "file",
      size: isDirectory ? 0 : Number(entry?.size || 0),
      mtime: String(entry?.mtime || ""),
      mime: isDirectory ? "" : String(entry?.mime || mimeFor(displayPath)),
      path: displayPath,
      displayPath: workspacePath,
      workspacePath,
      url: isDirectory ? `/directory-viewer.html?${params.toString()}` : `/api/files?${params.toString()}`,
    };
  }

  function directoryEntryTimeMs(entry) {
    const time = Date.parse(String(entry?.mtime || entry?.updatedAt || ""));
    return Number.isFinite(time) ? time : 0;
  }

  function compareDirectoryEntriesNewestFirst(a, b) {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    const timeDelta = directoryEntryTimeMs(b) - directoryEntryTimeMs(a);
    if (timeDelta) return timeDelta;
    return String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans-CN");
  }

  return {
    assertChildPathInside,
    caseTopicDirectoryRoots,
    compareDirectoryEntriesNewestFirst,
    directoryAliasKey,
    directoryAliasLabels,
    directoryEntryTimeMs,
    directoryRequestParams,
    directoryRootProjectForPathSync,
    isDeletableWorkspaceRootChild,
    isHiddenDirectoryEntryName,
    isOwnWritableDirectoryPath,
    isProtectedDirectoryRoot,
    isReadOnlyCaseTopicDirectoryForAuth,
    isSharedDirectoryWriteAllowed,
    joinDisplayPath,
    protectedDirectoryRoots,
    publicDirectoryEntry,
    publicManagedEntry,
    publicRemoteDirectoryEntry,
    resolveBrowserPath,
    resolveBrowserPathAsync,
    resolveDirectoryAlias,
    resolveVolume1RemoteBrowserPath,
  };
}

module.exports = {
  createDirectoryBrowserBoundaryService,
};
