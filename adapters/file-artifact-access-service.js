"use strict";

const fs = require("node:fs");
const path = require("node:path");

function defaultState() {
  return { artifacts: [] };
}

function createFileArtifactAccessService(options = {}) {
  const deps = Object.assign({
    fs,
    path,
    state: defaultState,
    dataDir: "",
    workspaceUploadDirName: "Hermes Uploads",
    workspaceUploadSubdir: "uploads",
    findWorkspace: () => null,
    normalizeLocalPath: (value) => String(value || ""),
    rootConflictsWithProtected: () => false,
    pathInsideAnyRoot: () => false,
    chatGroupMemberWorkspaceIds: () => [],
    authCanAccessWorkspace: () => false,
    makeId: () => `artifact-${Date.now()}`,
    nowIso: () => new Date().toISOString(),
    mimeFor: () => "application/octet-stream",
  }, options);

  function currentState() {
    return typeof deps.state === "function" ? deps.state() : deps.state;
  }

  function safeFileName(value) {
    const name = deps.path.basename(String(value || "upload.bin")).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
    return name || "upload.bin";
  }

  function safeDirectoryName(value) {
    const name = safeFileName(value || "New Folder").replace(/[. ]+$/g, "").trim();
    if (!name || name === "." || name === "..") return "";
    return name;
  }

  function uniqueChildPath(parentPath, filename) {
    const parsed = deps.path.parse(safeFileName(filename));
    let candidate = deps.path.join(parentPath, `${parsed.name}${parsed.ext}`);
    let index = 1;
    while (deps.fs.existsSync(candidate)) {
      candidate = deps.path.join(parentPath, `${parsed.name} (${index})${parsed.ext}`);
      index += 1;
    }
    return candidate;
  }

  function workspaceDefaultRoot(workspaceId) {
    const workspace = deps.findWorkspace(workspaceId || "owner");
    const root = String(workspace?.defaultWorkspace || workspace?.policy?.default_workspace || "").trim();
    const localRoot = deps.normalizeLocalPath(root) || root;
    if (!localRoot || deps.rootConflictsWithProtected(localRoot) || deps.rootConflictsWithProtected(root)) return "";
    return localRoot;
  }

  function threadUploadRoot(thread) {
    return thread?.id ? deps.path.join(deps.dataDir, deps.workspaceUploadSubdir, thread.id) : "";
  }

  function workspaceUploadRoot(workspaceId, threadId) {
    const root = workspaceDefaultRoot(workspaceId);
    const safeThreadId = safeDirectoryName(threadId || "thread");
    if (!root || !safeThreadId) return "";
    const uploadRoot = deps.path.resolve(deps.path.join(root, deps.workspaceUploadDirName, deps.workspaceUploadSubdir, safeThreadId));
    if (!deps.pathInsideAnyRoot(uploadRoot, [deps.path.resolve(root)])) return "";
    return uploadRoot;
  }

  function uploadWorkspaceAllowedForThread(thread, workspaceId) {
    const id = String(workspaceId || "").trim();
    if (!thread || !id) return false;
    return id === String(thread.workspaceId || "") || deps.chatGroupMemberWorkspaceIds(thread).includes(id);
  }

  function uploadWorkspaceIdForRequest(auth, thread, body = {}) {
    const requested = String(body.workspaceId || body.actorWorkspaceId || body.actor_workspace_id || "").trim();
    if (requested && deps.authCanAccessWorkspace(auth, requested) && uploadWorkspaceAllowedForThread(thread, requested)) return requested;
    const authWorkspaceId = String(auth?.workspaceId || "").trim();
    if (authWorkspaceId && uploadWorkspaceAllowedForThread(thread, authWorkspaceId)) return authWorkspaceId;
    return String(thread?.workspaceId || "owner").trim() || "owner";
  }

  function uniqueStrings(values) {
    return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
  }

  function uploadRootsForThread(thread) {
    if (!thread?.id) return [];
    const workspaceIds = uniqueStrings([
      thread.workspaceId,
      ...deps.chatGroupMemberWorkspaceIds(thread),
    ]);
    return uniqueStrings([
      threadUploadRoot(thread),
      ...workspaceIds.map((workspaceId) => workspaceUploadRoot(workspaceId, thread.id)),
    ]);
  }

  function workspaceUploadDirectoryForRequest(auth, thread, body = {}) {
    const workspaceId = uploadWorkspaceIdForRequest(auth, thread, body);
    const uploadDir = workspaceUploadRoot(workspaceId, thread?.id);
    if (!uploadDir) {
      const err = new Error("Workspace upload directory is not available");
      err.status = 400;
      throw err;
    }
    return { workspaceId, uploadDir };
  }

  function registerUploadArtifact(thread, message, filePath, originalName, options = {}) {
    const stat = deps.fs.statSync(filePath);
    const workspaceId = String(options.workspaceId || message?.actorWorkspaceId || thread.workspaceId || "").trim();
    const artifact = {
      id: deps.makeId("artifact"),
      path: filePath,
      displayPath: filePath,
      name: safeFileName(originalName || filePath),
      mime: deps.mimeFor(filePath),
      size: stat.size,
      createdAt: deps.nowIso(),
      updatedAt: deps.nowIso(),
      workspaceId: workspaceId || thread.workspaceId,
      projectId: thread.projectId,
      subprojectId: thread.subprojectId || "",
      threadId: thread.id,
      messageId: message?.id || "",
    };
    currentState().artifacts.push(artifact);
    return {
      id: artifact.id,
      name: artifact.name,
      mime: artifact.mime,
      size: artifact.size,
      url: `/api/artifacts/${encodeURIComponent(artifact.id)}`,
      workspaceId: artifact.workspaceId,
    };
  }

  function publicArtifactFromClient(value) {
    if (!value || typeof value !== "object") return null;
    const id = String(value.id || "");
    const artifact = currentState().artifacts.find((item) => item.id === id);
    if (!artifact) return null;
    return {
      id: artifact.id,
      name: artifact.name,
      mime: artifact.mime,
      size: artifact.size,
      url: `/api/artifacts/${encodeURIComponent(artifact.id)}`,
    };
  }

  function attachUploadedArtifactsToMessage(thread, message) {
    const artifactIds = new Set((message?.artifacts || [])
      .map((artifact) => String(artifact?.id || ""))
      .filter(Boolean));
    if (!thread || !message || !artifactIds.size) return;
    for (const artifact of currentState().artifacts || []) {
      if (!artifactIds.has(String(artifact.id || ""))) continue;
      if (String(artifact.threadId || "") !== String(thread.id || "")) continue;
      artifact.messageId = message.id;
      artifact.workspaceId = message.actorWorkspaceId || artifact.workspaceId || thread.workspaceId;
      artifact.projectId = thread.projectId;
      artifact.subprojectId = thread.subprojectId || "";
      artifact.updatedAt = deps.nowIso();
    }
  }

  return Object.freeze({
    safeFileName,
    safeDirectoryName,
    uniqueChildPath,
    workspaceDefaultRoot,
    threadUploadRoot,
    workspaceUploadRoot,
    uploadWorkspaceAllowedForThread,
    uploadWorkspaceIdForRequest,
    uploadRootsForThread,
    workspaceUploadDirectoryForRequest,
    registerUploadArtifact,
    publicArtifactFromClient,
    attachUploadedArtifactsToMessage,
  });
}

module.exports = {
  createFileArtifactAccessService,
};
