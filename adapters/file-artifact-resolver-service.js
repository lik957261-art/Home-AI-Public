"use strict";

const fs = require("node:fs");
const path = require("node:path");

function createFileArtifactResolverService(options = {}) {
  const deps = Object.assign({
    fs,
    path,
    state: () => ({ artifacts: [], threads: [] }),
    normalizeLocalPath: (value) => String(value || ""),
    resolveBrowserPath: () => null,
    logicalUserPathFallback: (value) => String(value || ""),
    logicalDirectoryDisplayPath: (_thread, value) => String(value || ""),
    mimeFor: () => "application/octet-stream",
    authCanAccessWorkspace: () => false,
    artifactAccessibleToAuth: () => false,
    isPathAllowedForThread: () => false,
    isPathAllowed: () => false,
    isOwnerAuth: () => false,
    findArtifactReferenceById: () => null,
    findArtifactReference: () => null,
    resolveArtifactPathFromMessage: () => null,
  }, options);

  function currentState() {
    return typeof deps.state === "function" ? deps.state() : deps.state;
  }

  function resolveFileForBrowserRequest(query, auth = null) {
    const artifactId = String(query.get("artifactId") || "").trim();
    if (artifactId) {
      const resolvedArtifact = resolveArtifactForRequest(artifactId, auth);
      if (!resolvedArtifact.artifact) return { status: resolvedArtifact.status || 404, error: resolvedArtifact.error || "Artifact not found" };
      const artifact = resolvedArtifact.artifact;
      const localPath = artifact.localPath || artifact.path;
      let stat;
      try {
        stat = deps.fs.statSync(localPath);
      } catch (_) {
        return { status: 404, error: "Artifact not found" };
      }
      if (!stat.isFile()) return { status: 400, error: "Artifact path is not a file" };
      return {
        file: {
          localPath,
          displayPath: deps.logicalUserPathFallback(artifact.displayPath || artifact.path || localPath, artifact.name || ""),
          name: artifact.name || deps.path.basename(localPath),
          mime: artifact.mime || deps.mimeFor(localPath),
          size: stat.size,
          updatedAt: stat.mtime.toISOString(),
        },
      };
    }

    const threadId = String(query.get("threadId") || "");
    const thread = (currentState().threads || []).find((item) => item.id === threadId);
    if (!thread) return { status: 404, error: "Thread not found" };
    if (auth && !deps.authCanAccessWorkspace(auth, thread.workspaceId)) return { status: 404, error: "Thread not found" };
    const resolved = deps.resolveBrowserPath(thread, query);
    if (!resolved) return { status: 404, error: "File not found or not allowed" };
    let stat;
    try {
      stat = deps.fs.statSync(resolved.localPath);
    } catch (_) {
      return { status: 404, error: "File not found" };
    }
    if (!stat.isFile()) return { status: 400, error: "Path is not a file" };
    return {
      file: {
        localPath: resolved.localPath,
        displayPath: resolved.workspacePath || deps.logicalDirectoryDisplayPath(thread, resolved.displayPath, deps.path.basename(resolved.localPath)),
        name: deps.path.basename(resolved.localPath),
        mime: deps.mimeFor(resolved.localPath),
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
      },
    };
  }

  function resolveArtifactForRequest(artifactId, auth = null) {
    let artifact = (currentState().artifacts || []).find((item) => String(item.id || "") === String(artifactId || ""));
    let reference = null;
    if (!artifact) {
      reference = deps.findArtifactReferenceById(artifactId);
      if (!reference) {
        return { status: 404, error: "Artifact not found" };
      }
      artifact = {
        ...reference.artifact,
        id: String(artifactId || ""),
        threadId: reference.thread.id,
        messageId: reference.message.id,
        workspaceId: reference.thread.workspaceId,
        projectId: reference.thread.projectId,
        subprojectId: reference.thread.subprojectId || "",
      };
    }
    let thread = null;
    let localPath = artifact.path ? deps.normalizeLocalPath(artifact.path) : "";
    if (!localPath || !deps.fs.existsSync(localPath)) {
      reference = reference || deps.findArtifactReference(artifact);
      const recoveredPath = reference ? deps.resolveArtifactPathFromMessage(artifact, reference.message) : null;
      if (!reference || !recoveredPath) {
        return { status: 404, error: "Artifact not found" };
      }
      thread = reference.thread;
      localPath = recoveredPath.localPath;
      artifact = {
        ...artifact,
        path: artifact.path || recoveredPath.rawPath,
        displayPath: artifact.displayPath || recoveredPath.rawPath,
        threadId: artifact.threadId || reference.thread.id,
        messageId: artifact.messageId || reference.message.id,
        workspaceId: artifact.workspaceId || reference.thread.workspaceId,
        localPath,
      };
    }
    if (artifact.threadId) {
      thread = thread || (currentState().threads || []).find((item) => item.id === String(artifact.threadId || ""));
      if (!thread) return { status: 404, error: "Artifact not found" };
      if (auth && !deps.artifactAccessibleToAuth(auth, thread, artifact)) {
        return { status: 404, error: "Artifact not found" };
      }
      if (!deps.isPathAllowedForThread(thread, localPath, artifact.displayPath || artifact.path)) {
        return { status: 404, error: "Artifact not found" };
      }
      return { artifact: { ...artifact, localPath }, thread };
    }
    if (auth && !deps.isOwnerAuth(auth)) {
      return { status: 404, error: "Artifact not found" };
    }
    if (!deps.isPathAllowed(localPath)) {
      return { status: 404, error: "Artifact not found" };
    }
    return { artifact: { ...artifact, localPath }, thread: null };
  }

  return Object.freeze({
    resolveFileForBrowserRequest,
    resolveArtifactForRequest,
  });
}

module.exports = {
  createFileArtifactResolverService,
};
