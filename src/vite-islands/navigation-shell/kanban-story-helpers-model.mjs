export const KANBAN_STORY_HELPERS_MODEL_VERSION = "20260706-kanban-story-helpers-model-v1";

export const DEFAULT_STATUS_ORDER = Object.freeze(["triage", "todo", "ready", "running", "blocked", "done", "archived"]);

export function compactDisplayTextPlan(value, max = 180) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

export function todoSortTimestampPlan(todo = {}) {
  const candidates = [
    todo?.kanbanCompletedAt,
    todo?.completedAt,
    todo?.cancelledAt,
    todo?.updatedAt,
    todo?.createdAt,
    todo?.dueAt,
    todo?.dueLocal,
  ];
  for (const value of candidates) {
    const parsed = Date.parse(String(value || "").replace(" ", "T"));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function caseModePlan(todo = {}) {
  return String(todo?.kanbanCaseMode || "").trim();
}

export function caseTemplatePlan(todo = {}) {
  return String(todo?.kanbanCaseTemplate || todo?.kanbanStudyKind || "").trim().toLowerCase();
}

export function isStudyCasePlan(todo = {}) {
  return caseModePlan(todo) === "study-plan";
}

export function isFinalStudyAssessmentPlan(todo = {}) {
  return isStudyCasePlan(todo) && caseTemplatePlan(todo) === "final-assessment";
}

export function isAssessmentCasePlan(todo = {}) {
  return caseModePlan(todo) === "assessment-plan";
}

export function isAssessmentCardPlan(todo = {}) {
  return isAssessmentCasePlan(todo) || isFinalStudyAssessmentPlan(todo);
}

export function isReadingCardPlan(todo = {}) {
  return isStudyCasePlan(todo) && !isFinalStudyAssessmentPlan(todo);
}

export function assessmentExamSummaryPlan(todo = {}) {
  return todo?.assessmentExam && typeof todo.assessmentExam === "object" ? todo.assessmentExam : null;
}

export function todoWorkflowStatePlan(todo = {}) {
  const workflow = todo?.workflowState && typeof todo.workflowState === "object" ? todo.workflowState : null;
  if (!workflow) return null;
  if (
    ["reading", "study", "assessment", "final-assessment"].includes(String(workflow.kind || ""))
    && workflow.priorContextAvailable === false
  ) {
    return null;
  }
  return workflow;
}

export function assessmentExamCompletedPlan(todo = {}) {
  const workflow = todoWorkflowStatePlan(todo);
  if (workflow && (workflow.kind === "assessment" || workflow.kind === "final-assessment")) return Boolean(workflow.completed);
  const summary = assessmentExamSummaryPlan(todo);
  if (summary?.completionError) return false;
  return String(summary?.status || "") === "completed";
}

export function normalizedKanbanStatusPlan(todo = {}) {
  const status = String(todo?.kanbanStatus || todo?.kanban_status || "").trim().toLowerCase();
  if (isAssessmentCardPlan(todo) && status === "done" && !assessmentExamCompletedPlan(todo)) return "blocked";
  if (DEFAULT_STATUS_ORDER.includes(status)) return status;
  const compatible = String(todo?.status || "").trim().toLowerCase();
  if (isAssessmentCardPlan(todo) && compatible === "completed" && !assessmentExamCompletedPlan(todo)) return "blocked";
  if (compatible === "completed") return "done";
  if (compatible === "cancelled") return "archived";
  return "todo";
}

export function arrayFromKanbanFieldPlan(value, limit = 8) {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return raw.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit);
}

export function kanbanDescriptionSectionPlan(description, heading) {
  const text = String(description || "");
  const marker = `${heading}:\n`;
  const start = text.indexOf(marker);
  if (start < 0) return "";
  const rest = text.slice(start + marker.length);
  const next = rest.search(/\n\n(?:Multi-Agent plan|Source request|Card goal|Expected deliverables|Acceptance criteria|Dependencies|Concurrency rule):/);
  return (next >= 0 ? rest.slice(0, next) : rest).trim();
}

export function kanbanDescriptionListPlan(description, heading, limit = 8) {
  return kanbanDescriptionSectionPlan(description, heading)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

export function parsedKanbanPlanDescriptionPlan(todo = {}) {
  const description = String(todo?.description || "");
  if (!description) return {};
  const summary = description.match(/(?:^|\n)Multi-Agent plan:\s*([^\n]+)/)?.[1]?.trim() || "";
  return {
    summary,
    sourceText: kanbanDescriptionSectionPlan(description, "Source request"),
    cardGoal: kanbanDescriptionSectionPlan(description, "Card goal"),
    deliverables: kanbanDescriptionListPlan(description, "Expected deliverables", 8),
    acceptance: kanbanDescriptionListPlan(description, "Acceptance criteria", 8),
    dependsOn: kanbanDescriptionListPlan(description, "Dependencies", 12),
  };
}

export function stableDisplayHashPlan(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function kanbanCardCaseInfoPlan(todo = {}) {
  const parsed = parsedKanbanPlanDescriptionPlan(todo);
  const sourceText = String(todo?.kanbanCaseSourceText || parsed.sourceText || "").trim();
  const summary = String(todo?.kanbanCaseSummary || parsed.summary || sourceText || todo?.content || todo?.id || "").trim();
  const explicitCaseId = String(todo?.kanbanCaseId || "").trim();
  const inferredCaseId = sourceText
    ? `parsed-plan-${stableDisplayHashPlan(`${summary}\0${sourceText}`)}`
    : `single-card-${todo?.id || stableDisplayHashPlan(summary)}`;
  return {
    id: explicitCaseId || inferredCaseId,
    mode: String(todo?.kanbanCaseMode || (sourceText ? "multi-agent" : "single-card")),
    caseTemplate: caseTemplatePlan(todo),
    sourceText,
    summary,
    cardId: String(todo?.kanbanCaseCardId || todo?.id || ""),
    cardIndex: Number(todo?.kanbanCaseCardIndex || 0) || 0,
    cardCount: Number(todo?.kanbanCaseCardCount || 0) || 0,
    cardGoal: String(todo?.kanbanCaseCardGoal || parsed.cardGoal || todo?.description || "").trim(),
    dependsOn: arrayFromKanbanFieldPlan(todo?.kanbanCaseDependsOn, 12).length
      ? arrayFromKanbanFieldPlan(todo?.kanbanCaseDependsOn, 12)
      : (parsed.dependsOn || []),
    deliverables: arrayFromKanbanFieldPlan(todo?.kanbanCaseDeliverables, 8).length
      ? arrayFromKanbanFieldPlan(todo?.kanbanCaseDeliverables, 8)
      : (parsed.deliverables || []),
    acceptance: arrayFromKanbanFieldPlan(todo?.kanbanCaseAcceptance, 8).length
      ? arrayFromKanbanFieldPlan(todo?.kanbanCaseAcceptance, 8)
      : (parsed.acceptance || []),
  };
}

export function kanbanStoryCaseKeyPlan(group = {}) {
  const first = (group?.cards || [])[0]?.todo || {};
  return [
    String(group?.mode || "case"),
    String(group?.id || first.kanbanCaseId || first.id || group?.title || "story"),
  ].filter(Boolean).join(":");
}

export function kanbanArchiveStatusSummaryPlan(group = {}, {
  statusOrder = DEFAULT_STATUS_ORDER,
  normalizedKanbanStatus = normalizedKanbanStatusPlan,
  kanbanStatusMeta = (status) => ({ shortLabel: status || "todo" }),
} = {}) {
  const counts = new Map();
  for (const item of group.cards || []) {
    const status = normalizedKanbanStatus(item.todo);
    counts.set(status, (counts.get(status) || 0) + 1);
  }
  return statusOrder
    .filter((status) => counts.has(status))
    .map((status) => `${kanbanStatusMeta(status).shortLabel} ${counts.get(status)}`)
    .join(" / ");
}

export function kanbanArchiveConclusionPlan(group = {}, {
  compactDisplayText = compactDisplayTextPlan,
  normalizedKanbanStatus = normalizedKanbanStatusPlan,
  todoSortTimestamp = todoSortTimestampPlan,
  feedbackForTodo = () => "",
} = {}) {
  const result = [...(group.cards || [])]
    .sort((left, right) => todoSortTimestamp(right.todo) - todoSortTimestamp(left.todo))
    .map((item) => feedbackForTodo(item.todo))
    .find(Boolean);
  if (result) return compactDisplayText(result, 320);
  const completed = (group.cards || []).filter((item) => normalizedKanbanStatus(item.todo) === "done").length;
  const archived = (group.cards || []).filter((item) => normalizedKanbanStatus(item.todo) === "archived").length;
  if (completed || archived) return `Done ${completed} / Archived ${archived}`;
  return "未写入结果回执";
}
