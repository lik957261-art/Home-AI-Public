"use strict";

const assert = require("node:assert/strict");
const {
  compareKanbanRowsForList,
  completedKanbanRowTimestamp,
  isCompletedKanbanRow,
} = require("../adapters/kanban-card-order-service");

function run() {
  assert.equal(isCompletedKanbanRow({ status: "completed" }), true);
  assert.equal(isCompletedKanbanRow({ status: "open", kanban_status: "done" }), true);
  assert.equal(isCompletedKanbanRow({ status: "open", kanban_status: "todo" }), false);
  assert.equal(
    completedKanbanRowTimestamp({
      kanban_completed_at: "2026-05-18T10:00:00.000Z",
      completed_at: "2026-05-17T10:00:00.000Z",
      updated_at: "2026-05-10T10:00:00.000Z",
    }),
    Date.parse("2026-05-18T10:00:00.000Z"),
  );

  const rows = [
    {
      id: "done-old-updated-later",
      status: "completed",
      kanban_status: "done",
      kanban_completed_at: "2026-05-16T08:00:00.000Z",
      updated_at: "2026-05-18T22:00:00.000Z",
    },
    {
      id: "open-card",
      status: "open",
      kanban_status: "todo",
      updated_at: "2026-05-17T08:00:00.000Z",
    },
    {
      id: "done-new",
      status: "completed",
      kanban_status: "done",
      kanban_completed_at: "2026-05-18T08:00:00.000Z",
      completed_at: "2026-05-15T08:00:00.000Z",
      updated_at: "2026-05-17T07:00:00.000Z",
    },
  ];
  const ordered = rows.slice().sort(compareKanbanRowsForList).map((row) => row.id);
  assert.deepEqual(ordered, ["open-card", "done-new", "done-old-updated-later"]);
}

run();
console.log("kanban card order service tests passed");
