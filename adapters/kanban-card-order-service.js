"use strict";

const DEFAULT_OPEN_KANBAN_STATUSES = new Set(["", "triage", "todo", "ready", "running", "blocked"]);

function cleanString(value) {
  return String(value ?? "").trim();
}

function firstString(row = {}, names = []) {
  for (const name of names) {
    const value = cleanString(row?.[name]);
    if (value) return value;
  }
  return "";
}

function timestampMs(value) {
  const text = cleanString(value).replace(" ", "T");
  if (!text) return 0;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstTimestamp(row = {}, names = []) {
  for (const name of names) {
    const parsed = timestampMs(row?.[name]);
    if (parsed) return parsed;
  }
  return 0;
}

function normalizedKanbanStatus(row = {}) {
  return firstString(row, ["kanban_status", "kanbanStatus"]).toLowerCase();
}

function normalizedStatus(row = {}) {
  return firstString(row, ["status", "state"]).toLowerCase();
}

function isOpenKanbanRow(row = {}, options = {}) {
  const openStatuses = options.openStatuses instanceof Set
    ? options.openStatuses
    : DEFAULT_OPEN_KANBAN_STATUSES;
  return normalizedStatus(row) === "open" && openStatuses.has(normalizedKanbanStatus(row));
}

function isCompletedKanbanRow(row = {}) {
  const status = normalizedStatus(row);
  const kanbanStatus = normalizedKanbanStatus(row);
  return status === "completed" || kanbanStatus === "done";
}

function completedKanbanRowTimestamp(row = {}) {
  return firstTimestamp(row, [
    "kanban_completed_at",
    "kanbanCompletedAt",
    "completed_at",
    "completedAt",
    "updated_at",
    "updatedAt",
    "created_at",
    "createdAt",
  ]);
}

function closedKanbanRowTimestamp(row = {}) {
  if (isCompletedKanbanRow(row)) return completedKanbanRowTimestamp(row);
  return firstTimestamp(row, [
    "cancelled_at",
    "cancelledAt",
    "kanban_completed_at",
    "kanbanCompletedAt",
    "completed_at",
    "completedAt",
    "updated_at",
    "updatedAt",
    "created_at",
    "createdAt",
  ]);
}

function activeKanbanRowTimestamp(row = {}) {
  return firstTimestamp(row, [
    "updated_at",
    "updatedAt",
    "created_at",
    "createdAt",
    "due_at",
    "dueAt",
    "due_local",
    "dueLocal",
  ]);
}

function compareKanbanRowsForList(left = {}, right = {}, options = {}) {
  const leftOpen = isOpenKanbanRow(left, options);
  const rightOpen = isOpenKanbanRow(right, options);
  if (leftOpen !== rightOpen) return leftOpen ? -1 : 1;

  const leftTimestamp = leftOpen ? activeKanbanRowTimestamp(left) : closedKanbanRowTimestamp(left);
  const rightTimestamp = rightOpen ? activeKanbanRowTimestamp(right) : closedKanbanRowTimestamp(right);
  const byRecent = rightTimestamp - leftTimestamp;
  if (byRecent) return byRecent;

  return firstString(right, ["id", "todo_id", "todoId"]).localeCompare(firstString(left, ["id", "todo_id", "todoId"]));
}

module.exports = {
  activeKanbanRowTimestamp,
  closedKanbanRowTimestamp,
  compareKanbanRowsForList,
  completedKanbanRowTimestamp,
  isCompletedKanbanRow,
  isOpenKanbanRow,
};
