"use strict";

const assert = require("node:assert/strict");
const { createKanbanAssigneePolicy } = require("../adapters/kanban-assignee-policy");

const policy = createKanbanAssigneePolicy({
  workspacePrincipal: (workspaceId) => `principal:${workspaceId}`,
  todoAssigneesForWorkspace: (workspaceId) => [
    { id: `principal:${workspaceId}`, label: "Self" },
    { id: `allowed:${workspaceId}`, label: "Allowed target" },
  ],
});

{
  const ids = policy.allowedNotificationAssigneeIds("child");
  assert.equal(ids.source, "principal:child");
  assert.equal(ids.ids.has("principal:child"), true);
  assert.equal(ids.ids.has("allowed:child"), true);
}

{
  assert.equal(policy.normalizeNotificationAssignee("child", "allowed:child"), "allowed:child");
  assert.equal(policy.normalizeNotificationAssignee("child", "other-workspace"), "principal:child");
  assert.equal(policy.normalizeNotificationAssignee("child", "", "allowed:child"), "allowed:child");
  assert.equal(policy.normalizeNotificationAssignee("child", "", ""), "principal:child");
}

console.log("kanban-assignee-policy tests passed");
