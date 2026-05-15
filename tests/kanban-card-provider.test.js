"use strict";

const assert = require("node:assert/strict");
const { createKanbanCardProvider } = require("../adapters/kanban-card-provider");

async function testTargetIdForwardingAndSearchPreservation() {
  const calls = [];
  const provider = createKanbanCardProvider({
    runBridge(payload) {
      calls.push(payload);
      return Promise.resolve({
        ok: true,
        board: "workspace-child",
        todos: [
          { id: "target-card", content: "Hidden by current search" },
          { id: "other-card", content: "Visible math item" },
        ],
      });
    },
    workspacePrincipal: (workspaceId) => `principal-${workspaceId}`,
    assigneesForWorkspace: () => [{ id: "child", label: "Child" }],
    publicCard: (row) => row,
  });

  const listed = await provider.listCards({
    workspaceId: "child",
    scope: "mine",
    includeCompleted: true,
    targetId: "target-card",
    search: "math",
    limit: 7,
  });

  assert.equal(listed.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].target_id, "target-card");
  assert.equal(calls[0].workspace_id, "child");
  assert.equal(calls[0].source_principal, "principal-child");
  assert.equal(calls[0].include_completed, true);
  assert.deepEqual(listed.data.map((card) => card.id), ["target-card", "other-card"]);
}

testTargetIdForwardingAndSearchPreservation()
  .then(() => console.log("kanban-card-provider tests passed."))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
