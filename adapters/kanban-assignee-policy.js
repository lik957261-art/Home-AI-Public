"use strict";

function uniqueStrings(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function createKanbanAssigneePolicy(options = {}) {
  const workspacePrincipal = typeof options.workspacePrincipal === "function"
    ? options.workspacePrincipal
    : (workspaceId) => String(workspaceId || "owner").trim() || "owner";
  const todoAssigneesForWorkspace = typeof options.todoAssigneesForWorkspace === "function"
    ? options.todoAssigneesForWorkspace
    : () => [];

  function allowedNotificationAssigneeIds(workspaceId) {
    const source = String(workspacePrincipal(workspaceId) || workspaceId || "owner").trim() || "owner";
    const assignees = Array.isArray(todoAssigneesForWorkspace(workspaceId)) ? todoAssigneesForWorkspace(workspaceId) : [];
    const ids = new Set(assignees.map((item) => String(item?.id || item || "").trim()).filter(Boolean));
    ids.add(source);
    return { source, ids };
  }

  function normalizeNotificationAssignee(workspaceId, ...candidates) {
    const { source, ids } = allowedNotificationAssigneeIds(workspaceId);
    for (const candidate of uniqueStrings(candidates)) {
      if (ids.has(candidate)) return candidate;
    }
    return source;
  }

  return Object.freeze({
    allowedNotificationAssigneeIds,
    normalizeNotificationAssignee,
  });
}

module.exports = {
  createKanbanAssigneePolicy,
};
