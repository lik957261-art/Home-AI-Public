"use strict";

export const KANBAN_LIST_MODEL_VERSION = "20260706-kanban-list-model-v1";

export function kanbanTabCountPlan({
  status = "",
  itemCount = 0,
  storyStatus = "story",
  storyCaseCount = 0,
  completedLoaded = false,
  needsCompleted = false,
} = {}) {
  if (String(status || "") === String(storyStatus || "story")) {
    return completedLoaded ? String(Number(storyCaseCount || 0)) : "…";
  }
  if (!completedLoaded && needsCompleted) return "…";
  return String(Number(itemCount || 0));
}

export function todoKanbanCardViewPlan({
  todo = {},
  status = "",
  meta = {},
  priority = "",
  due = "",
} = {}) {
  const assignee = todo?.kanbanAssignee || todo?.assigneeLabel || todo?.assignee || "";
  const tenant = todo?.kanbanTenant || "";
  const chips = [
    priority,
    assignee ? `@${assignee}` : "",
    tenant && tenant !== assignee ? tenant : "",
    todo?.kanbanWorkspaceKind || "",
  ].filter(Boolean);
  const skills = Array.isArray(todo?.kanbanSkills) ? todo.kanbanSkills.slice(0, 3) : [];
  return {
    status: String(status || ""),
    shortLabel: meta?.shortLabel || "",
    title: todo?.content || todo?.id || "",
    due: String(due || ""),
    chips,
    skills,
  };
}

export function dedupeKanbanOutputsPlan(outputs = []) {
  const seen = new Set();
  const result = [];
  for (const item of Array.isArray(outputs) ? outputs : []) {
    const key = String(item?.url || item?.path || item?.name || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function kanbanCardOutputsPlan({
  todoOutputs = [],
  readingOutput = null,
  detailOutputs = [],
  isAssessment = false,
  assessmentVisible = true,
} = {}) {
  const readingOutputs = readingOutput ? [readingOutput] : [];
  const outputs = dedupeKanbanOutputsPlan([
    ...(Array.isArray(todoOutputs) ? todoOutputs : []),
    ...readingOutputs,
    ...(Array.isArray(detailOutputs) ? detailOutputs : []),
  ]);
  if (!isAssessment) return outputs;
  if (!assessmentVisible) return [];
  return outputs.filter((item) => {
    const name = String(item?.name || item?.path || "").toLowerCase();
    return !name.includes("answer_key") && !name.includes("sample_answers");
  });
}

export function shouldAutoLoadKanbanDetailPlan({
  todo = null,
  isKanbanTodoSource = false,
  hasDetail = false,
  outputCount = 0,
} = {}) {
  if (!todo || !isKanbanTodoSource || hasDetail) return false;
  return !String(todo?.kanbanResult || "").trim() && !Number(outputCount || 0);
}

export function kanbanProcessRowsPlan(detail = null) {
  const events = Array.isArray(detail?.events) ? detail.events.filter((event) => event.preview || event.kind).slice(-6) : [];
  const runs = Array.isArray(detail?.runs) ? detail.runs.filter((run) => run.summary || run.status || run.outcome).slice(-3) : [];
  return [
    ...events.map((event) => ({ label: event.kind || "event", text: event.preview || "" })),
    ...runs.map((run) => ({
      label: [run.profile, run.outcome || run.status].filter(Boolean).join(" / ") || "run",
      text: run.summary || "",
    })),
  ];
}

export function kanbanDetailReportPlan({
  eligible = false,
  assessmentBlocked = false,
  readingCard = false,
  outputCount = 0,
  detail = null,
  labels = {},
} = {}) {
  if (!eligible || assessmentBlocked) return { visible: false };
  if (readingCard && Number(outputCount || 0)) return { visible: false };
  const loading = Boolean(detail?.loading);
  const error = detail?.error || "";
  const actionLabel = loading ? "加载中" : (detail ? "刷新过程" : "加载过程");
  const title = readingCard ? (labels?.receipt || "") : "回执 / 过程";
  const emptyText = readingCard && Number(outputCount || 0)
    ? "完整分析已在上方交付文件中。"
    : "暂无回执摘要。";
  return {
    visible: true,
    loading,
    error,
    actionLabel,
    title,
    emptyText,
    processRows: detail && !readingCard ? kanbanProcessRowsPlan(detail) : [],
  };
}
