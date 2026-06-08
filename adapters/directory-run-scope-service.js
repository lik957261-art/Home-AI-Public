"use strict";

function cleanString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function objectValue(value, fallback = {}) {
  return value && typeof value === "object" ? value : fallback;
}

function firstClean(values = []) {
  for (const value of values) {
    const text = cleanString(value);
    if (text) return text;
  }
  return "";
}

function directoryWorkspaceIdFromAttachment(attachment = {}) {
  const item = objectValue(attachment);
  return firstClean([
    item.workspaceId,
    item.workspace_id,
    item.targetWorkspaceId,
    item.target_workspace_id,
    item.dataWorkspaceId,
    item.data_workspace_id,
  ]);
}

function directoryWorkspaceIdFromProject(project = {}) {
  const item = objectValue(project);
  return firstClean([
    item.workspaceId,
    item.workspace_id,
    item.targetWorkspaceId,
    item.target_workspace_id,
    item.dataWorkspaceId,
    item.data_workspace_id,
    item.parentWorkspaceId,
    item.parent_workspace_id,
  ]);
}

function resolveDirectoryRunScope(input = {}) {
  const actorWorkspaceId = cleanString(input.actorWorkspaceId, "owner");
  const taskDirectory = objectValue(input.taskDirectory, null);
  const project = objectValue(input.project, null);
  const directoryBound = Boolean(taskDirectory?.path || taskDirectory?.root);
  const targetWorkspaceId = directoryBound
    ? firstClean([
      directoryWorkspaceIdFromAttachment(taskDirectory),
      directoryWorkspaceIdFromProject(project),
      actorWorkspaceId,
    ])
    : actorWorkspaceId;
  const scopeSource = directoryBound && targetWorkspaceId !== actorWorkspaceId
    ? "directory_binding"
    : "actor";
  return {
    actorWorkspaceId,
    targetWorkspaceId: targetWorkspaceId || actorWorkspaceId,
    dataWorkspaceId: targetWorkspaceId || actorWorkspaceId,
    directoryBound,
    directoryScoped: scopeSource === "directory_binding",
    scopeSource,
  };
}

function createDirectoryRunScopeService() {
  return Object.freeze({
    resolveDirectoryRunScope,
  });
}

module.exports = {
  cleanString,
  createDirectoryRunScopeService,
  directoryWorkspaceIdFromAttachment,
  directoryWorkspaceIdFromProject,
  resolveDirectoryRunScope,
};
