"use strict";

const KANBAN_TODO_CORE_MODEL_ESM_PATH = "/vite-islands/kanban-todo-core-model/kanban-todo-core-model.js";
let kanbanTodoCoreModel = null;
let kanbanTodoCoreModelPromise = null;

function importKanbanTodoCoreModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (kanbanTodoCoreModel) return Promise.resolve(kanbanTodoCoreModel);
  if (!kanbanTodoCoreModelPromise) {
    const importer = typeof rootRef.__homeAiImportKanbanTodoCoreModel === "function"
      ? rootRef.__homeAiImportKanbanTodoCoreModel
      : (path) => import(path);
    kanbanTodoCoreModelPromise = Promise.resolve()
      .then(() => importer(KANBAN_TODO_CORE_MODEL_ESM_PATH))
      .then((model) => {
        kanbanTodoCoreModel = model || null;
        return kanbanTodoCoreModel;
      })
      .catch((error) => {
        kanbanTodoCoreModelPromise = null;
        throw error;
      });
  }
  return kanbanTodoCoreModelPromise;
}

function currentKanbanTodoCoreModel() {
  return kanbanTodoCoreModel;
}

function kanbanTodoCoreModelFunction(name) {
  const model = currentKanbanTodoCoreModel();
  return model && typeof model[name] === "function" ? model[name] : null;
}

if (typeof window !== "undefined") {
  importKanbanTodoCoreModel().catch(() => null);
}

function renderKanbanStoryTree(items) {
  const cases = kanbanActiveStoryCases(items);
  if (!cases.length) {
    return `<div class="empty-state small">\u6682\u65e0\u6545\u4e8b\u6811\u3002\u5b66\u4e60\u8ba1\u5212\u3001\u8003\u8bd5\u8ba1\u5212\u6216\u591a Agent \u62c6\u89e3\u4f1a\u5728\u8fd9\u91cc\u805a\u5408\uff1b\u666e\u901a\u5355\u4efb\u52a1\u7559\u5728\u5bf9\u5e94\u72b6\u6001\u5217\u3002</div>`;
  }
  return `<div class="kanban-archive-stories">${cases.map((group) => renderKanbanArchiveCase(group, { collapsible: true, archiveAction: true, deleteAction: true })).join("")}</div>`;
}

function todoDueLabel(todo) {
  const modelFn = kanbanTodoCoreModelFunction("todoDueLabelPlan");
  if (modelFn) return modelFn({ dueLocal: todo?.dueLocal, formattedDueAt: formatTime(todo?.dueAt) });
  return todo?.dueLocal || formatTime(todo?.dueAt) || "No due time";
}

function todoTitle(todo) {
  const modelFn = kanbanTodoCoreModelFunction("todoTitlePlan");
  if (modelFn) return modelFn(todo, { max: 120 });
  return compactDisplayText(todo?.content || todo?.id || "Kanban card", 120);
}

function todoMatchesOpen(todo) {
  const modelFn = kanbanTodoCoreModelFunction("todoMatchesOpenPlan");
  if (modelFn) return modelFn(todo);
  return String(todo?.status || "") === "open";
}

function defaultTodoAssignee() {
  const modelFn = kanbanTodoCoreModelFunction("defaultTodoAssigneePlan");
  if (modelFn) {
    return modelFn({
      todoAssignees: state.todoAssignees || [],
      selectedWorkspaceId: state.selectedWorkspaceId,
    });
  }
  return state.todoAssignees.some((item) => item.id === state.selectedWorkspaceId)
    ? state.selectedWorkspaceId
    : (state.todoAssignees[0]?.id || state.selectedWorkspaceId || "owner");
}

function renderTodoAssigneeOptions(selected = "") {
  const modelFn = kanbanTodoCoreModelFunction("todoAssigneeOptionsPlan");
  if (modelFn) {
    const plan = modelFn({
      selected,
      todoAssignees: state.todoAssignees || [],
      selectedWorkspaceId: state.selectedWorkspaceId,
    });
    return (plan.options || []).map((item) => `<option value="${escapeHtml(item.value)}"${item.selected ? " selected" : ""}>${escapeHtml(item.label || item.value)}</option>`).join("");
  }
  const current = selected || defaultTodoAssignee();
  return (state.todoAssignees || []).map((item) => {
    const value = item.id || "";
    return `<option value="${escapeHtml(value)}"${value === current ? " selected" : ""}>${escapeHtml(item.label || value)}</option>`;
  }).join("");
}

function localDateTimeInputValue(value = null) {
  const modelFn = kanbanTodoCoreModelFunction("localDateTimeInputValuePlan");
  if (modelFn) return modelFn(value, { nowMs: Date.now() });
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "";
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function todoDueInputValue(todo) {
  const modelFn = kanbanTodoCoreModelFunction("todoDueInputValuePlan");
  if (modelFn) return modelFn(todo, { fallbackMs: Date.now() + 60 * 60 * 1000 });
  const local = String(todo?.dueLocal || "").trim();
  const match = local.match(/^(20\d{2})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`;
  return todo?.dueAt ? localDateTimeInputValue(todo.dueAt) : localDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000));
}
