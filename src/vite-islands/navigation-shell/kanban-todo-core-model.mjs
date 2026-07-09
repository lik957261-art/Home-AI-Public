const KANBAN_TODO_CORE_MODEL_VERSION = "20260705-kanban-todo-core-model-v1";

function textValue(value = "", max = 4000) {
  return String(value == null ? "" : value).slice(0, Math.max(1, Number(max) || 4000));
}

function cleanString(value = "", max = 240) {
  return textValue(value, max).trim();
}

function compactDisplayTextPlan(value, max = 180) {
  const limit = Math.max(2, Number(max) || 180);
  const cleaned = String(value || "")
    .split(/\r?\n/)
    .filter((line) => !/^MEDIA:/i.test(line.trim()))
    .join(" ")
    .replace(/Task ID:\s*\S+/gi, " ")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned.length <= limit ? cleaned : `${cleaned.slice(0, limit - 1)}...`;
}

function todoDueLabelPlan(input = {}) {
  return cleanString(input.dueLocal, 240)
    || cleanString(input.formattedDueAt, 240)
    || "No due time";
}

function todoTitlePlan(todo = {}, options = {}) {
  const max = Math.max(2, Number(options.max || 120) || 120);
  return compactDisplayTextPlan(todo?.content || todo?.id || "Kanban card", max) || "Kanban card";
}

function todoMatchesOpenPlan(todo = {}) {
  return String(todo?.status || "") === "open";
}

function defaultTodoAssigneePlan(input = {}) {
  const assignees = Array.isArray(input.todoAssignees) ? input.todoAssignees : [];
  const selectedWorkspaceId = cleanString(input.selectedWorkspaceId, 160);
  if (assignees.some((item) => cleanString(item?.id, 160) === selectedWorkspaceId)) return selectedWorkspaceId;
  return cleanString(assignees[0]?.id, 160) || selectedWorkspaceId || "owner";
}

function todoAssigneeOptionsPlan(input = {}) {
  const assignees = Array.isArray(input.todoAssignees) ? input.todoAssignees : [];
  const current = cleanString(input.selected, 160) || defaultTodoAssigneePlan(input);
  return Object.freeze({
    version: KANBAN_TODO_CORE_MODEL_VERSION,
    current,
    options: Object.freeze(assignees.map((item) => {
      const value = cleanString(item?.id, 160);
      return Object.freeze({
        value,
        label: cleanString(item?.label || value, 240) || value,
        selected: value === current,
      });
    })),
  });
}

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function localDateTimeInputValuePlan(value = null, options = {}) {
  const fallbackMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const date = value instanceof Date ? value : new Date(value || fallbackMs);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}T${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function todoDueInputValuePlan(todo = {}, options = {}) {
  const local = String(todo?.dueLocal || "").trim();
  const match = local.match(/^(20\d{2})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`;
  const fallbackMs = Number.isFinite(Number(options.fallbackMs))
    ? Number(options.fallbackMs)
    : Date.now() + 60 * 60 * 1000;
  return todo?.dueAt
    ? localDateTimeInputValuePlan(todo.dueAt, options)
    : localDateTimeInputValuePlan(fallbackMs, options);
}

function kanbanStatusNeedsCompletedPlan(status, options = {}) {
  const value = cleanString(status, 80).toLowerCase();
  const storyStatus = cleanString(options.storyStatus, 80);
  const statusOrder = Array.isArray(options.statusOrder) ? options.statusOrder : [];
  return value === storyStatus || statusOrder.includes(value);
}

function shouldLoadCompletedTodosPlan(input = {}) {
  if (Object.prototype.hasOwnProperty.call(input, "includeCompleted")) return Boolean(input.includeCompleted);
  if (cleanString(input.searchText, 1000)) return true;
  if (cleanString(input.selectedTodoId, 160)) return true;
  return kanbanStatusNeedsCompletedPlan(input.todoKanbanStatus, {
    storyStatus: input.storyStatus,
    statusOrder: input.statusOrder,
  });
}

function kanbanCardWorkspaceIdPlan(todo = {}, selectedWorkspaceId = "owner") {
  return cleanString(
    todo?.workspaceId
      || todo?.kanbanWorkspaceId
      || todo?.actorWorkspaceId
      || todo?.senderWorkspaceId
      || selectedWorkspaceId
      || "owner",
    160,
  ) || "owner";
}

function kanbanCardActionBodyPlan(todo = {}, extra = {}, selectedWorkspaceId = "owner") {
  return Object.assign({ workspaceId: kanbanCardWorkspaceIdPlan(todo, selectedWorkspaceId) }, extra || {});
}

function kanbanCaseModePlan(todo = {}) {
  return cleanString(todo?.kanbanCaseMode, 160);
}

function kanbanCardHasExplicitStoryCasePlan(todo = {}) {
  const mode = kanbanCaseModePlan(todo);
  if (mode === "single-card") return false;
  return Boolean(cleanString(todo?.kanbanCaseId, 240) || mode);
}

function kanbanCaseTemplatePlan(todo = {}) {
  return cleanString(todo?.kanbanCaseTemplate || todo?.kanbanStudyKind, 160).toLowerCase();
}

function kanbanCaseLooksLikeReadingPlanPlan(todo = {}) {
  const template = kanbanCaseTemplatePlan(todo);
  if (["reading", "english-reading", "reading-recording"].includes(template)) return true;
  if (template === "final-assessment" || template === "learning-growth") return false;
  const text = [
    todo?.kanbanCaseCardId,
    todo?.kanbanCaseSummary,
    todo?.kanbanCaseCardGoal,
    todo?.content,
    todo?.description,
    ...(Array.isArray(todo?.kanbanCaseDeliverables) ? todo.kanbanCaseDeliverables : []),
    ...(Array.isArray(todo?.kanbanCaseAcceptance) ? todo.kanbanCaseAcceptance : []),
  ].filter(Boolean).join("\n");
  return /reading-session|reading retell|retell audio|reading feedback|reading analysis|next reading guidance|读后复述|复述录音|阅读评价|阅读分析|阅读指导|转写/.test(text);
}

function isKanbanStudyCasePlan(todo = {}) {
  return kanbanCaseModePlan(todo) === "study-plan";
}

function isKanbanAssessmentCasePlan(todo = {}) {
  return kanbanCaseModePlan(todo) === "assessment-plan";
}

function isKanbanReadingPlanCasePlan(todo = {}) {
  return isKanbanStudyCasePlan(todo) && kanbanCaseLooksLikeReadingPlanPlan(todo);
}

function isKanbanLearningGrowthCardPlan(todo = {}) {
  return isKanbanStudyCasePlan(todo) && kanbanCaseTemplatePlan(todo) === "learning-growth";
}

function isKanbanFinalStudyAssessmentPlan(todo = {}) {
  return isKanbanStudyCasePlan(todo) && kanbanCaseTemplatePlan(todo) === "final-assessment";
}

function isKanbanAssessmentCardPlan(todo = {}) {
  return isKanbanAssessmentCasePlan(todo) || isKanbanFinalStudyAssessmentPlan(todo);
}

function isKanbanProgrammingAssessmentCardPlan(todo = {}) {
  if (!isKanbanAssessmentCardPlan(todo)) return false;
  const summary = todo?.assessmentExam && typeof todo.assessmentExam === "object" ? todo.assessmentExam : {};
  const text = [
    kanbanCaseTemplatePlan(todo),
    todo?.kanbanStudyKind,
    todo?.kanbanAssessmentKind,
    todo?.kanbanCaseSummary,
    todo?.content,
    summary.subject,
    summary.subjectId,
  ].filter(Boolean).join("\n");
  return /programming|coding|python|javascript|typescript|java\b|c\+\+|c#|scratch|编程|程式|程序|代码|代碼|算法|开发|開發/i.test(text);
}

function kanbanStudyLabelsPlan(todo = {}) {
  const reading = isKanbanReadingPlanCasePlan(todo);
  return {
    plan: "学习计划",
    item: reading ? "阅读" : "学习",
    submit: reading ? "提交录音" : "提交学习记录",
    upload: reading ? "上传复述录音" : "上传学习成果",
    recording: reading ? "复述录音" : "学习成果",
    analysis: reading ? "转写与分析" : "整理与分析",
    quiz: reading ? "练习考卷" : "学习测验",
    completed: reading ? "本次阅读已完成。" : "本次学习已完成。",
    receipt: reading ? "阅读回执" : "学习回执",
  };
}

function kanbanActorRolePlan(todo = {}) {
  return cleanString(todo?.kanbanActorRole, 80).toLowerCase();
}

function kanbanActorPermissionsPlan(todo = {}) {
  return todo?.kanbanActorPermissions && typeof todo.kanbanActorPermissions === "object"
    ? todo.kanbanActorPermissions
    : null;
}

function kanbanCanPlan(todo = {}, key = "") {
  const permissions = kanbanActorPermissionsPlan(todo);
  if (permissions && typeof permissions[key] === "boolean") return permissions[key];
  const role = kanbanActorRolePlan(todo);
  if (!role || role === "manager") return true;
  if (role === "viewer") return key === "canView";
  if (role === "performer") return ["canView", "canSubmitStudy", "canAnswerQuiz"].includes(key);
  return true;
}

function normalizeKanbanStudyScheduleFrequencyPlan(value = "") {
  const text = cleanString(value, 80).toLowerCase();
  if (["weekly", "week", "每周"].includes(text)) return "weekly";
  if (["monthly", "month", "每月"].includes(text)) return "monthly";
  return "daily";
}

function parseKanbanStudyWeekdaysPlan(value = "") {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[,\s;，、]+/);
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const number = Number(item);
    const normalized = number === 0 ? 7 : number;
    if (!Number.isFinite(normalized) || normalized < 1 || normalized > 7 || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function saveKanbanComposerModePlan(mode = "") {
  const normalized = mode === "reading" ? "study" : mode;
  const next = ["single", "multi", "study", "assessment"].includes(normalized) ? normalized : "single";
  return { mode: next, multiAgent: next === "multi" };
}

function saveKanbanComposerReasoningEffortPlan(value = "") {
  const effort = cleanString(value, 80).toLowerCase();
  return ["low", "medium", "high", "xhigh"].includes(effort) ? effort : "";
}

function kanbanComposerDocumentContextPlan(documents = [], options = {}) {
  const maxDocuments = Math.max(1, Number(options.maxDocuments) || 3);
  const maxChars = Math.max(1000, Number(options.maxChars) || 60000);
  return (Array.isArray(documents) ? documents : [])
    .slice(0, maxDocuments)
    .filter((item) => cleanString(item?.text, maxChars + 1))
    .map((item, index) => {
      const text = String(item.text || "").trim();
      const limited = text.length > maxChars ? `${text.slice(0, maxChars)}\n\n[source text truncated in composer: ${text.length} chars total]` : text;
      return [
        `Document ${index + 1}: ${item.name || "kanban-source"}`,
        limited,
      ].join("\n\n");
    })
    .join("\n\n---\n\n");
}

function kanbanComposerSubmissionTextPlan(rawText = "", documentContext = "") {
  return [String(rawText || "").trim(), String(documentContext || "").trim()].filter(Boolean).join("\n\n");
}

function todoListCacheKeyPlan({ clientVersion = "", workspaceId = "owner", includeCompleted = false } = {}) {
  return `hermesTodoList:${clientVersion}:${workspaceId || "owner"}:${includeCompleted ? "all" : "open"}`;
}

function todoListCachePayloadPlan(input = {}) {
  return {
    savedAt: Number(input.savedAt || Date.now()),
    todos: Array.isArray(input.todos) ? input.todos : [],
    assignees: Array.isArray(input.assignees) ? input.assignees : [],
    source: input.source || "",
    board: input.board || "",
  };
}

function applyTodoListResultPlan(result = {}, includeCompleted = false, workspaceId = "owner", currentTodos = []) {
  const todos = result.data || result.todos || [];
  return {
    todos,
    todoWorkspaceId: workspaceId || "owner",
    todoAssignees: result.assignees || [],
    todoSource: result.source || result.result?.source || "",
    todoKanbanBoard: result.result?.board || result.board || (todos.find((todo) => todo.kanbanBoard)?.kanbanBoard) || (currentTodos.find((todo) => todo.kanbanBoard)?.kanbanBoard) || "",
    todoCompletedLoaded: includeCompleted,
  };
}

function todoStatusLabelPlan(todo = {}) {
  const status = String(todo?.status || "");
  if (status === "completed") return "done";
  if (status === "cancelled") return "cancelled";
  return "open";
}

function todoStatusTextPlan(todo = {}) {
  const status = String(todo?.status || "");
  if (status === "completed") return "已完成";
  if (status === "cancelled") return "已取消";
  return "未完成";
}

function normalizedKanbanStatusPlan(todo = {}, options = {}) {
  const status = cleanString(todo?.kanbanStatus || todo?.kanban_status, 80).toLowerCase();
  const statusOrder = Array.isArray(options.statusOrder) ? options.statusOrder : [];
  const assessmentCard = Boolean(options.assessmentCard);
  const assessmentCompleted = Boolean(options.assessmentCompleted);
  const workflowPhase = cleanString(options.workflowPhase, 80).toLowerCase();
  if (assessmentCard) {
    if (workflowPhase === "archived") return "archived";
    if (workflowPhase === "locked") return "blocked";
    if (workflowPhase === "exam_open") return "todo";
    if (workflowPhase === "in_progress" || workflowPhase === "retake_required") return "running";
  }
  if (assessmentCard && status === "done" && !assessmentCompleted) return "blocked";
  if (statusOrder.includes(status)) return status;
  const compatible = cleanString(todo?.status, 80).toLowerCase();
  if (assessmentCard && compatible === "completed" && !assessmentCompleted) return "blocked";
  if (compatible === "completed") return "done";
  if (compatible === "cancelled") return "archived";
  return "todo";
}

function kanbanStatusMetaPlan(status = "", statusMeta = {}) {
  const value = cleanString(status, 80);
  return statusMeta[value] || { label: value || "Todo", shortLabel: value || "todo" };
}

function kanbanStatusTextPlan(status = "", statusMeta = {}) {
  const meta = kanbanStatusMetaPlan(status, statusMeta);
  return `${meta.label} / ${meta.shortLabel}`;
}

function currentTodoKanbanStatusPlan(input = {}) {
  const selected = cleanString(input.selectedStatus, 80).toLowerCase();
  const storyStatus = cleanString(input.storyStatus, 80);
  const statusOrder = Array.isArray(input.statusOrder) ? input.statusOrder : [];
  const fallbackOrder = Array.isArray(input.fallbackOrder) ? input.fallbackOrder : [];
  const groupedCounts = input.groupedCounts && typeof input.groupedCounts === "object" ? input.groupedCounts : {};
  if (selected === storyStatus) return selected;
  if (statusOrder.includes(selected)) return selected;
  return fallbackOrder.find((status) => Number(groupedCounts[status] || 0) > 0) || storyStatus;
}

function todoPriorityLabelPlan(todo = {}) {
  const priority = Number(todo?.kanbanPriority || 0);
  return Number.isFinite(priority) && priority > 0 ? `P${priority}` : "";
}

function todoSortTimestampPlan(todo = {}) {
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

function sortArchivedKanbanCardsPlan(items = []) {
  return [...(items || [])].sort((left, right) => {
    const delta = todoSortTimestampPlan(right) - todoSortTimestampPlan(left);
    if (delta) return delta;
    return String(right?.id || "").localeCompare(String(left?.id || ""));
  });
}

function cleanKanbanInternalResultLinesPlan(text = "") {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:MEDIA:|Audio file:|Analysis file:)\s*/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanKanbanReadingResultTextPlan(text = "") {
  let value = String(text || "").trim();
  const aiMatch = value.match(/(?:^|\n)AI analysis:\s*/i);
  if (aiMatch) {
    value = value.slice((aiMatch.index || 0) + aiMatch[0].length);
  } else {
    const transcriptMatch = value.match(/(?:^|\n)Transcript:\s*/i);
    if (transcriptMatch) value = value.slice(0, transcriptMatch.index || 0);
  }
  value = value.replace(/^\s*Reading (?:submission|retelling) analysis completed[^\n]*\.?\s*$/gmi, "");
  return cleanKanbanInternalResultLinesPlan(value);
}

function kanbanDisplayResultTextPlan({ todo = {}, text = "", assessmentCard = false, assessmentVisible = true, readingCard = false } = {}) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (assessmentCard && !assessmentVisible) return "";
  return readingCard ? cleanKanbanReadingResultTextPlan(raw) : cleanKanbanInternalResultLinesPlan(raw);
}

export {
  KANBAN_TODO_CORE_MODEL_VERSION,
  applyTodoListResultPlan,
  cleanString,
  compactDisplayTextPlan,
  cleanKanbanInternalResultLinesPlan,
  cleanKanbanReadingResultTextPlan,
  currentTodoKanbanStatusPlan,
  defaultTodoAssigneePlan,
  isKanbanAssessmentCardPlan,
  isKanbanAssessmentCasePlan,
  isKanbanFinalStudyAssessmentPlan,
  isKanbanLearningGrowthCardPlan,
  isKanbanProgrammingAssessmentCardPlan,
  isKanbanReadingPlanCasePlan,
  isKanbanStudyCasePlan,
  kanbanActorPermissionsPlan,
  kanbanActorRolePlan,
  kanbanCanPlan,
  kanbanCardActionBodyPlan,
  kanbanCardHasExplicitStoryCasePlan,
  kanbanCardWorkspaceIdPlan,
  kanbanCaseLooksLikeReadingPlanPlan,
  kanbanCaseModePlan,
  kanbanCaseTemplatePlan,
  kanbanComposerDocumentContextPlan,
  kanbanComposerSubmissionTextPlan,
  kanbanDisplayResultTextPlan,
  kanbanStatusMetaPlan,
  kanbanStatusNeedsCompletedPlan,
  kanbanStatusTextPlan,
  kanbanStudyLabelsPlan,
  localDateTimeInputValuePlan,
  normalizeKanbanStudyScheduleFrequencyPlan,
  normalizedKanbanStatusPlan,
  parseKanbanStudyWeekdaysPlan,
  saveKanbanComposerModePlan,
  saveKanbanComposerReasoningEffortPlan,
  shouldLoadCompletedTodosPlan,
  sortArchivedKanbanCardsPlan,
  todoAssigneeOptionsPlan,
  todoDueInputValuePlan,
  todoDueLabelPlan,
  todoMatchesOpenPlan,
  todoListCacheKeyPlan,
  todoListCachePayloadPlan,
  todoPriorityLabelPlan,
  todoSortTimestampPlan,
  todoStatusLabelPlan,
  todoStatusTextPlan,
  todoTitlePlan,
};
