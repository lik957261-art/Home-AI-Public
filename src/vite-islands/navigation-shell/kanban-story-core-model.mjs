"use strict";

export const KANBAN_STORY_CORE_MODEL_VERSION = "20260706-kanban-story-core-model-v1";

export function kanbanStoryCaseTemplatePlan(group = {}) {
  return String(group?.caseTemplate || group?.cards?.[0]?.todo?.kanbanCaseTemplate || "").trim().toLowerCase();
}

export function kanbanStoryCaseIsLearningGrowthPlan(group = {}) {
  return kanbanStoryCaseTemplatePlan(group) === "learning-growth";
}

export function kanbanStoryCaseExpandedPlan({ caseKey = "", expandedMap = {} } = {}) {
  const key = String(caseKey || "");
  return Boolean(key && expandedMap && expandedMap[key]);
}

export function kanbanStoryToggleAttrsPlan({ caseKey = "", escapedKey = "", expanded = false } = {}) {
  const key = String(caseKey || "");
  if (!key) return "";
  const safeKey = String(escapedKey || key);
  return ` data-kanban-story-case="${safeKey}" role="button" tabindex="0" aria-expanded="${expanded ? "true" : "false"}"`;
}

export function kanbanStoryCaseBodyOpenPlan({ collapsible = false, expanded = false } = {}) {
  return !collapsible || Boolean(expanded);
}

export function kanbanStoryCaseRenderStatePlan({
  collapsible = false,
  expanded = false,
  toggleAttrs = "",
} = {}) {
  const isCollapsible = Boolean(collapsible);
  const isExpanded = kanbanStoryCaseBodyOpenPlan({ collapsible: isCollapsible, expanded });
  return {
    expanded: isExpanded,
    caseClass: isCollapsible && !isExpanded ? " story-collapsed" : "",
    toggleClass: isCollapsible ? " kanban-archive-case-toggle" : "",
    toggleAttrs: isCollapsible ? String(toggleAttrs || "") : "",
  };
}

export function kanbanStorySwipeRenderStatePlan({
  caseKey = "",
  escapedKey = "",
  canDelete = false,
} = {}) {
  const key = String(caseKey || "");
  const swipable = Boolean(key && canDelete);
  const safeKey = String(escapedKey || key);
  return {
    articleClass: swipable ? " task-swipe-row kanban-story-swipe" : "",
    articleAttrs: swipable ? ` data-swipe-row data-swipe-kind="kanban-story" data-swipe-id="${safeKey}"` : "",
    contentClass: swipable ? "task-swipe-content kanban-story-swipe-content" : "kanban-story-swipe-content",
    contentAttrs: swipable ? " data-swipe-content" : "",
    deleteButton: swipable
      ? `<button class="task-swipe-delete kanban-story-swipe-delete" type="button" data-delete-swipe aria-label="\\u5220\\u9664\\u6545\\u4e8b">\\u5220\\u9664</button>`
      : "",
  };
}

export function stripAssessmentConfigTextPlan(text = "") {
  return String(text || "")
    .replace(/ASSESSMENT_CONFIG:[A-Za-z0-9_-]+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function assessmentTemplateDisplayTextPlan({
  summary = {},
  currentTodo = {},
  firstTodo = {},
  sourceText = "",
  compactSource = "",
  compactRevision = "",
} = {}) {
  const questionCount = Number(summary.questionCount || currentTodo?.assessmentExam?.questionCount || firstTodo?.assessmentExam?.questionCount || 0) || 0;
  const durationMinutes = Number(summary.durationMinutes || currentTodo?.assessmentExam?.durationMinutes || firstTodo?.assessmentExam?.durationMinutes || 0) || 0;
  const passingScore = Number(summary.passingScore || currentTodo?.assessmentExam?.passingScore || firstTodo?.assessmentExam?.passingScore || 0) || 0;
  const source = String(compactSource || stripAssessmentConfigTextPlan(sourceText));
  const revision = String(compactRevision || currentTodo?.kanbanRevisionRequest || "");
  const parts = [
    questionCount && durationMinutes ? `${questionCount}题/${durationMinutes}分钟` : "",
    passingScore ? `通过线 ${passingScore}` : "",
    summary.finalExam ? "终考" : "",
    revision ? `本次修改：${revision}` : "",
    source,
  ].filter(Boolean);
  return parts.join(" | ") || "固定正式测试模板";
}

export function kanbanStoryDetailLoadPlan({
  eligible = false,
  status = "",
  storyStatus = "story",
  queued = {},
  candidates = [],
  limit = 6,
  nowMs = Date.now(),
  delayStepMs = 120,
} = {}) {
  if (!eligible) return { queuedPatch: queued || {}, loads: [] };
  if (String(status || "").trim().toLowerCase() !== String(storyStatus || "story").trim().toLowerCase()) {
    return { queuedPatch: queued || {}, loads: [] };
  }
  const queuedPatch = Object.assign({}, queued || {});
  const loads = [];
  for (const candidate of candidates || []) {
    const id = String(candidate?.id || "").trim();
    if (!id || queuedPatch[id] || !candidate?.needsDetail) continue;
    queuedPatch[id] = nowMs;
    loads.push({ id, delayMs: (loads.length) * Number(delayStepMs || 0) });
    if (loads.length >= Number(limit || 0)) break;
  }
  return { queuedPatch, loads };
}
