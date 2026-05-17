"use strict";

function renderKanbanStoryTree(items) {
  const cases = kanbanActiveStoryCases(items);
  if (!cases.length) {
    return `<div class="empty-state small">\u6682\u65e0\u6545\u4e8b\u6811\u3002\u5b66\u4e60\u8ba1\u5212\u3001\u8003\u8bd5\u8ba1\u5212\u6216\u591a Agent \u62c6\u89e3\u4f1a\u5728\u8fd9\u91cc\u805a\u5408\uff1b\u666e\u901a\u5355\u4efb\u52a1\u7559\u5728\u5bf9\u5e94\u72b6\u6001\u5217\u3002</div>`;
  }
  return `<div class="kanban-archive-stories">${cases.map((group) => renderKanbanArchiveCase(group, { collapsible: true, archiveAction: true, deleteAction: true })).join("")}</div>`;
}

function todoDueLabel(todo) {
  return todo?.dueLocal || formatTime(todo?.dueAt) || "No due time";
}

function todoTitle(todo) {
  return compactDisplayText(todo?.content || todo?.id || "Kanban card", 120);
}

function todoMatchesOpen(todo) {
  return String(todo?.status || "") === "open";
}

function defaultTodoAssignee() {
  return state.todoAssignees.some((item) => item.id === state.selectedWorkspaceId)
    ? state.selectedWorkspaceId
    : (state.todoAssignees[0]?.id || state.selectedWorkspaceId || "owner");
}

function renderTodoAssigneeOptions(selected = "") {
  const current = selected || defaultTodoAssignee();
  return (state.todoAssignees || []).map((item) => {
    const value = item.id || "";
    return `<option value="${escapeHtml(value)}"${value === current ? " selected" : ""}>${escapeHtml(item.label || value)}</option>`;
  }).join("");
}

function localDateTimeInputValue(value = null) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "";
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function todoDueInputValue(todo) {
  const local = String(todo?.dueLocal || "").trim();
  const match = local.match(/^(20\d{2})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`;
  return todo?.dueAt ? localDateTimeInputValue(todo.dueAt) : localDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000));
}
