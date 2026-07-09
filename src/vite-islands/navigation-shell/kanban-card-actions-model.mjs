"use strict";

export const KANBAN_CARD_ACTIONS_MODEL_VERSION = "20260705-kanban-card-actions-model-v1";

export const LEARNING_GROWTH_SUBMISSION_PROGRESS_STEPS = Object.freeze([
  { at: 0, title: "\u4fdd\u5b58\u4f5c\u7b54", preview: "\u5199\u5165\u770b\u677f\u63d0\u4ea4\u8bb0\u5f55" },
  { at: 2, title: "\u8c03\u7528\u6a21\u578b\u6279\u6539", preview: "learning-growth-task-evaluation" },
  { at: 8, title: "\u7b49\u5f85\u6a21\u578b JSON \u8bc4\u4f30", preview: "\u6821\u9a8c\u5206\u6570\u3001\u4fee\u6539\u5efa\u8bae\u548c\u4e0b\u4e00\u6b65" },
  { at: 16, title: "\u751f\u6210 Markdown \u56de\u6267", preview: "\u5199\u5165\u62a5\u544a\u3001\u53cd\u9988\u548c\u9644\u4ef6" },
  { at: 30, title: "\u5237\u65b0\u5361\u7247\u72b6\u6001", preview: "\u540c\u6b65\u5b66\u4e60\u8fdb\u5ea6\u548c\u5956\u52b1\u95e8\u7981" },
]);

function cleanToken(value) {
  return String(value || "").trim();
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function kanbanActionRequestPlan({ todoId = "", action = "", body = {}, method = "POST" } = {}) {
  const id = cleanToken(todoId);
  const actionId = cleanToken(action);
  return {
    todoId: id,
    action: actionId,
    method: cleanToken(method) || "POST",
    bodyExtra: objectValue(body),
  };
}

export function todoCreatePayloadPlan(input = {}) {
  const content = cleanToken(input.content);
  const dueValue = String(input.dueValue || "");
  const isKanban = Boolean(input.isKanban);
  if (!content) return { ok: false, error: "Kanban card content is required" };
  if (!isKanban && !dueValue) return { ok: false, error: "Todo due time is required" };
  return {
    ok: true,
    payload: {
      workspaceId: cleanToken(input.workspaceId),
      assignee: cleanToken(input.assignee),
      content,
      dueTime: dueValue.replace("T", " "),
      recurrence: cleanToken(input.recurrence) || "none",
      recurrenceDays: cleanToken(input.recurrenceDays),
    },
    statePatch: isKanban ? { todoCreateOpen: false, todoKanbanStatus: "todo" } : { todoCreateOpen: false },
    storagePatch: isKanban ? { hermesTodoKanbanStatus: "todo" } : {},
  };
}

export function learningGrowthProgressRowsPlan({ elapsedSeconds = 0, steps = LEARNING_GROWTH_SUBMISSION_PROGRESS_STEPS } = {}) {
  const elapsed = Math.max(0, Math.floor(Number(elapsedSeconds) || 0));
  const rows = Array.isArray(steps) && steps.length ? steps : LEARNING_GROWTH_SUBMISSION_PROGRESS_STEPS;
  let activeIndex = 0;
  rows.forEach((step, index) => {
    if (elapsed >= Number(step?.at || 0)) activeIndex = index;
  });
  return rows.map((step, index) => ({
    at: Number(step?.at || 0),
    title: cleanToken(step?.title),
    preview: cleanToken(step?.preview),
    status: index < activeIndex ? "done" : (index === activeIndex ? "active" : "pending"),
  }));
}

export function learningGrowthSubmissionSuccessFeedbackPlan(response = {}) {
  const evaluation = response?.evaluation || null;
  const score = evaluation?.score;
  const reward = response?.reward || {};
  const nextStep = cleanToken(evaluation?.nextStep);
  const report = evaluation?.report || {};
  const reportReady = Boolean(report.url || report.path || report.name);
  if (!evaluation) {
    return {
      kind: "success",
      message: "\u5df2\u6536\u5230\u4f5c\u7b54\uff0c\u6b63\u5728\u7b49\u5f85 AI \u53cd\u9988\u6216\u5bb6\u957f\u590d\u6838\u3002",
    };
  }
  return {
    kind: "success",
    message: `AI \u53cd\u9988\u5df2\u5b8c\u6210${score == null ? "" : `\uff0c\u8bc4\u5206 ${score}/100`}${nextStep === "rewrite_and_reflect" ? "\uff0c\u8bf7\u7ee7\u7eed\u4fee\u6539\u548c\u590d\u76d8" : ""}${nextStep === "spoken_reflection_required" ? "\uff0c\u8bf7\u5f55\u97f3\u590d\u76d8\u540e\u518d\u7ed3\u7b97" : ""}${nextStep === "completed" ? "\uff0c\u5df2\u751f\u6210\u6700\u7ec8\u7ed3\u8bba" : ""}${reportReady ? "\uff0cMarkdown \u62a5\u544a\u5df2\u751f\u6210" : ""}${reward.status === "settled" ? `\uff0c\u5df2\u7ed3\u7b97 ${reward.coinAmount || 0} \u91d1\u5e01` : ""}\u3002`,
  };
}

export function learningGrowthReflectionFeedbackPlan(response = {}) {
  const accepted = response?.reflection?.status === "accepted";
  return {
    kind: accepted ? "success" : "info",
    message: accepted
      ? `\u8bed\u97f3\u590d\u76d8\u5df2\u901a\u8fc7\uff0c\u6700\u7ec8\u8bc4\u5206 ${response?.evaluation?.score ?? 0}/100${response?.reward?.status === "settled" ? `\uff0c\u5df2\u7ed3\u7b97 ${response.reward.coinAmount || 0} \u91d1\u5e01` : ""}\u3002`
      : "\u8bed\u97f3\u590d\u76d8\u5df2\u63d0\u4ea4\uff0c\u8bf7\u6839\u636e\u53cd\u9988\u91cd\u65b0\u8865\u5145\u9519\u8bef\u3001\u539f\u56e0\u548c\u4e0b\u6b21\u7ec3\u4e60\u8ba1\u5212\u3002",
  };
}

export function kanbanStatusStoragePatchPlan(status = "") {
  const value = cleanToken(status);
  return value ? { hermesTodoKanbanStatus: value } : {};
}
