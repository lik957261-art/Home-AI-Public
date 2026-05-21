"use strict";

function createKanbanOutputAccessService(options = {}) {
  const fs = options.fs || require("node:fs");
  const path = options.path || require("node:path");
  const artifactRoot = String(options.artifactRoot || "");
  const safeStorageSegment = typeof options.safeStorageSegment === "function"
    ? options.safeStorageSegment
    : ((value) => String(value || "owner"));
  const normalizeLocalPath = typeof options.normalizeLocalPath === "function" ? options.normalizeLocalPath : ((value) => String(value || ""));
  const authCanAccessWorkspace = typeof options.authCanAccessWorkspace === "function" ? options.authCanAccessWorkspace : (() => false);
  const isPathAllowedForThread = typeof options.isPathAllowedForThread === "function" ? options.isPathAllowedForThread : (() => false);
  const caseShareService = options.caseShareService || {};
  const workspaceDisplayPathService = options.workspaceDisplayPathService || {};
  const mimeFor = typeof options.mimeFor === "function" ? options.mimeFor : (() => "application/octet-stream");

  function accessThread(workspaceId) {
    const workspace = String(workspaceId || "owner").trim() || "owner";
    return {
      id: `kanban-output-${workspace}`,
      workspaceId: workspace,
      projectId: "general",
      subprojectId: "",
      singleWindow: false,
    };
  }

  function caseIdFromPath(workspaceId, rawPath) {
    const localPath = normalizeLocalPath(rawPath);
    if (!localPath) return "";
    const root = path.resolve(artifactRoot, safeStorageSegment(workspaceId || "owner"));
    const relative = path.relative(root, localPath);
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return relative.split(/[\\/]+/)[0] || "";
    const share = caseShareService.shareForCaseDirectoryPath?.(workspaceId, localPath);
    return String(share?.caseId || share?.case_id || "").trim();
  }

  function pathInsideWorkspaceArtifactRoot(workspaceId, localPath) {
    if (!artifactRoot || !localPath) return false;
    const root = path.resolve(artifactRoot, safeStorageSegment(workspaceId || "owner"));
    const relative = path.relative(root, localPath);
    return Boolean(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  }

  function authCanAccess(auth, workspaceId, rawPath) {
    const workspace = String(workspaceId || "owner").trim() || "owner";
    if (authCanAccessWorkspace(auth, workspace)) return true;
    const caseId = caseIdFromPath(workspace, rawPath);
    if (!caseId) return false;
    return Boolean(caseShareService.roleForAuth?.(auth, workspace, caseId));
  }

  function resolveFile(workspaceId, rawPath, auth = null) {
    const workspace = String(workspaceId || "owner").trim() || "owner";
    if (auth && !authCanAccess(auth, workspace, rawPath)) return { status: 404, error: "File not found" };
    const displayPath = String(rawPath || "").trim();
    const localPath = normalizeLocalPath(displayPath);
    if (!displayPath || !localPath) return { status: 404, error: "File not found" };
    const thread = accessThread(workspace);
    const allowedByCaseDirectory = Boolean(caseShareService.shareForCaseDirectoryPath?.(workspace, localPath));
    const allowedByArtifactRoot = pathInsideWorkspaceArtifactRoot(workspace, localPath);
    if (!allowedByCaseDirectory && !allowedByArtifactRoot && !isPathAllowedForThread(thread, localPath, displayPath)) {
      return { status: 404, error: "File not found or not allowed" };
    }
    let stat;
    try {
      stat = fs.statSync(localPath);
    } catch (_) {
      return { status: 404, error: "File not found" };
    }
    if (!stat.isFile()) return { status: 400, error: "Path is not a file" };
    return {
      file: {
        localPath,
        displayPath: workspaceDisplayPathService.logicalUserPathFallback?.(displayPath, path.basename(localPath)) || displayPath,
        name: path.basename(localPath),
        mime: mimeFor(localPath),
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
      },
    };
  }

  return {
    accessThread,
    authCanAccess,
    caseIdFromPath,
    pathInsideWorkspaceArtifactRoot,
    resolveFile,
  };
}

module.exports = {
  createKanbanOutputAccessService,
};
