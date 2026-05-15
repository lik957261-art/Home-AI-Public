"use strict";

const {
  kanbanCardEffectiveCaseIndex: defaultKanbanCardEffectiveCaseIndex,
  visibleKanbanCaseCards: defaultVisibleKanbanCaseCards,
} = require("./kanban-story-provider");
const {
  deriveKanbanWorkflowState: defaultDeriveKanbanWorkflowState,
} = require("./study-workflow-provider");

function defaultPublicKanbanOutputsFromText() {
  return [];
}

function defaultPublicKanbanCoverFile() {
  return null;
}

function defaultPublicKanbanReadingSubmissionSummary() {
  return null;
}

function defaultPublicKanbanAssessmentSummary() {
  return null;
}

function defaultIsKanbanStudyCaseMode(mode) {
  return String(mode || "").trim() === "study-plan";
}

function defaultIsKanbanAssessmentCaseMode(mode) {
  return String(mode || "").trim() === "assessment-plan";
}

function normalizeStringList(value, limit) {
  const items = Array.isArray(value) ? value : [];
  return items.map((item) => String(item || "")).filter(Boolean).slice(0, limit);
}

function publicTodoOptions(contextOrIndex = null, maybeRows = null) {
  if (typeof contextOrIndex === "number" && Array.isArray(maybeRows)) {
    return { listIndex: contextOrIndex, listRows: maybeRows };
  }
  if (contextOrIndex && typeof contextOrIndex === "object" && !Array.isArray(contextOrIndex)) {
    return contextOrIndex;
  }
  return {};
}

function kanbanHasPassedAttempt(state = {}) {
  const attempts = Array.isArray(state?.attempts) ? state.attempts : [];
  return attempts.some((attempt) => Boolean(attempt?.passed)) || Boolean(state?.lastAttempt?.passed);
}

function kanbanWorkflowStateCompleted(state = {}, officialDone = false) {
  if (String(state?.status || "") === "completed" && !state?.completionError) return true;
  return Boolean(officialDone && kanbanHasPassedAttempt(state));
}

function createTodoPublicProjectionService(options = {}) {
  const publicKanbanOutputsFromText = typeof options.publicKanbanOutputsFromText === "function"
    ? options.publicKanbanOutputsFromText
    : defaultPublicKanbanOutputsFromText;
  const publicKanbanCoverFile = typeof options.publicKanbanCoverFile === "function"
    ? options.publicKanbanCoverFile
    : defaultPublicKanbanCoverFile;
  const publicKanbanReadingSubmissionSummary = typeof options.publicKanbanReadingSubmissionSummary === "function"
    ? options.publicKanbanReadingSubmissionSummary
    : defaultPublicKanbanReadingSubmissionSummary;
  const publicKanbanAssessmentSummary = typeof options.publicKanbanAssessmentSummary === "function"
    ? options.publicKanbanAssessmentSummary
    : defaultPublicKanbanAssessmentSummary;
  const deriveKanbanWorkflowState = typeof options.deriveKanbanWorkflowState === "function"
    ? options.deriveKanbanWorkflowState
    : defaultDeriveKanbanWorkflowState;
  const isKanbanStudyCaseMode = typeof options.isKanbanStudyCaseMode === "function"
    ? options.isKanbanStudyCaseMode
    : defaultIsKanbanStudyCaseMode;
  const isKanbanAssessmentCaseMode = typeof options.isKanbanAssessmentCaseMode === "function"
    ? options.isKanbanAssessmentCaseMode
    : defaultIsKanbanAssessmentCaseMode;
  const visibleKanbanCaseCards = typeof options.visibleKanbanCaseCards === "function"
    ? options.visibleKanbanCaseCards
    : defaultVisibleKanbanCaseCards;
  const kanbanCardEffectiveCaseIndex = typeof options.kanbanCardEffectiveCaseIndex === "function"
    ? options.kanbanCardEffectiveCaseIndex
    : defaultKanbanCardEffectiveCaseIndex;

  const publicTodoListContextCache = new WeakMap();

  function publicTodoWorkflowCompleted(payload = {}) {
    const status = String(payload.kanbanStatus || payload.status || "").trim().toLowerCase();
    const officialDone = status === "done" || status === "completed";
    if (isKanbanStudyCaseMode(payload.kanbanCaseMode) && payload.kanbanCaseTemplate !== "final-assessment") {
      const reading = payload.readingSubmission || payload.studySubmission || {};
      return kanbanWorkflowStateCompleted(reading, officialDone);
    }
    if (isKanbanAssessmentCaseMode(payload.kanbanCaseMode) || payload.kanbanCaseTemplate === "final-assessment") {
      const assessment = payload.assessmentExam || {};
      return kanbanWorkflowStateCompleted(assessment, officialDone);
    }
    return officialDone;
  }

  function publicTodoListContext(listRows) {
    if (!Array.isArray(listRows) || !listRows.length) return null;
    const cached = publicTodoListContextCache.get(listRows);
    if (cached) return cached;
    const byCase = new Map();
    for (const row of listRows) {
      const caseId = String(row?.kanbanCaseId || row?.kanban_case_id || "").trim();
      if (!caseId) continue;
      if (!byCase.has(caseId)) byCase.set(caseId, []);
      byCase.get(caseId).push(row);
    }
    const byCardId = new Map();
    for (const [caseId, rawSiblings] of byCase.entries()) {
      const byId = new Map(rawSiblings.map((card) => [String(card?.id || ""), card]));
      const visible = visibleKanbanCaseCards(rawSiblings)
        .sort((left, right) => (
          (kanbanCardEffectiveCaseIndex(left, byId) - kanbanCardEffectiveCaseIndex(right, byId))
          || String(left?.id || "").localeCompare(String(right?.id || ""))
        ));
      let studyPriorComplete = true;
      let assessmentPriorComplete = true;
      let learningPriorComplete = true;
      for (const rawCard of visible) {
        const payload = publicTodo(rawCard, { skipWorkflow: true });
        const cardId = String(payload.id || rawCard?.id || "").trim();
        if (cardId) {
          byCardId.set(`${caseId}\0${cardId}`, {
            studyPriorComplete,
            assessmentPriorComplete,
            learningPriorComplete,
          });
        }
        const completed = publicTodoWorkflowCompleted(payload);
        const isStudy = isKanbanStudyCaseMode(payload.kanbanCaseMode) && payload.kanbanCaseTemplate !== "final-assessment";
        const isAssessment = isKanbanAssessmentCaseMode(payload.kanbanCaseMode) || payload.kanbanCaseTemplate === "final-assessment";
        if (isStudy) {
          studyPriorComplete = studyPriorComplete && completed;
          learningPriorComplete = learningPriorComplete && completed;
        } else if (isAssessment) {
          assessmentPriorComplete = assessmentPriorComplete && completed;
          learningPriorComplete = learningPriorComplete && completed;
        }
      }
    }
    const context = { byCardId };
    publicTodoListContextCache.set(listRows, context);
    return context;
  }

  function publicTodoPriorContext(payload, options = {}) {
    if (options.skipWorkflow) return null;
    const listRows = Array.isArray(options.listRows) ? options.listRows : [];
    const caseId = String(payload.kanbanCaseId || "").trim();
    const currentId = String(payload.id || "").trim();
    if (!caseId || !currentId || !listRows.length) return null;
    const context = publicTodoListContext(listRows);
    const prior = context?.byCardId?.get(`${caseId}\0${currentId}`);
    if (!prior) return null;
    if (payload.kanbanCaseTemplate === "final-assessment") {
      return { priorComplete: prior.learningPriorComplete };
    }
    if (isKanbanAssessmentCaseMode(payload.kanbanCaseMode)) {
      return { priorComplete: prior.assessmentPriorComplete };
    }
    if (isKanbanStudyCaseMode(payload.kanbanCaseMode)) {
      return { priorComplete: prior.studyPriorComplete };
    }
    return null;
  }

  function publicTodo(row = {}, contextOrIndex = null, maybeRows = null) {
    const optionsForTodo = publicTodoOptions(contextOrIndex, maybeRows);
    const workspaceId = String(row.workspace_id || row.workspaceId || "").trim();
    const kanbanResult = String(row.kanban_result || row.kanbanResult || "");
    const payload = {
      id: String(row.id || ""),
      workspaceId,
      content: String(row.content || ""),
      status: String(row.status || ""),
      assignee: String(row.assignee_principal_id || row.assignee || ""),
      assigneeLabel: String(row.assignee_label || row.assignee_principal_id || ""),
      createdBy: String(row.created_by_principal || row.createdBy || ""),
      dueAt: String(row.due_at || ""),
      dueLocal: String(row.due_local || ""),
      timezone: String(row.timezone || ""),
      reminderLeadMinutes: Number(row.reminder_lead_minutes || 0),
      recurrence: String(row.recurrence_kind || "none"),
      recurrenceLabel: String(row.recurrence_label || ""),
      recurrenceDays: String(row.recurrence_days || ""),
      recurrenceSeriesId: String(row.recurrence_series_id || ""),
      recurrenceTemplate: Boolean(row.recurrence_template),
      source: String(row.source || ""),
      kanbanBoard: String(row.kanban_board || row.kanbanBoard || ""),
      kanbanStatus: String(row.kanban_status || row.kanbanStatus || ""),
      kanbanAssignee: String(row.kanban_assignee || row.kanbanAssignee || ""),
      kanbanPriority: Number(row.kanban_priority || row.kanbanPriority || 0),
      kanbanTenant: String(row.kanban_tenant || row.kanbanTenant || ""),
      kanbanWorkspaceKind: String(row.kanban_workspace_kind || row.kanbanWorkspaceKind || ""),
      kanbanCreatedBy: String(row.kanban_created_by || row.kanbanCreatedBy || ""),
      kanbanStartedAt: String(row.kanban_started_at || row.kanbanStartedAt || ""),
      kanbanCompletedAt: String(row.kanban_completed_at || row.kanbanCompletedAt || ""),
      kanbanResult,
      kanbanOutputs: publicKanbanOutputsFromText(workspaceId, kanbanResult),
      kanbanBlockReason: String(row.kanban_block_reason || row.kanbanBlockReason || ""),
      kanbanMaxRetries: Number(row.kanban_max_retries || row.kanbanMaxRetries || 0),
      kanbanSkills: normalizeStringList(row.kanban_skills || row.kanbanSkills, 8),
      kanbanCaseId: String(row.kanban_case_id || row.kanbanCaseId || ""),
      kanbanCaseMode: String(row.kanban_case_mode || row.kanbanCaseMode || ""),
      kanbanCaseTemplate: String(row.kanban_case_template || row.kanbanCaseTemplate || ""),
      kanbanCaseSourceText: String(row.kanban_case_source_text || row.kanbanCaseSourceText || ""),
      kanbanCaseSummary: String(row.kanban_case_summary || row.kanbanCaseSummary || ""),
      kanbanCaseCover: publicKanbanCoverFile(workspaceId, row.kanban_case_cover || row.kanbanCaseCover || null),
      kanbanCaseCardId: String(row.kanban_case_card_id || row.kanbanCaseCardId || ""),
      kanbanCaseCardIndex: Number(row.kanban_case_card_index || row.kanbanCaseCardIndex || 0),
      kanbanCaseCardCount: Number(row.kanban_case_card_count || row.kanbanCaseCardCount || 0),
      kanbanCaseDependsOn: normalizeStringList(row.kanban_case_depends_on || row.kanbanCaseDependsOn, 12),
      kanbanCaseDeliverables: normalizeStringList(row.kanban_case_deliverables || row.kanbanCaseDeliverables, 8),
      kanbanCaseAcceptance: normalizeStringList(row.kanban_case_acceptance || row.kanbanCaseAcceptance, 8),
      kanbanCaseCardGoal: String(row.kanban_case_card_goal || row.kanbanCaseCardGoal || ""),
      kanbanRevisionOf: String(row.kanban_revision_of || row.kanbanRevisionOf || ""),
      kanbanRevisionRequest: String(row.kanban_revision_request || row.kanbanRevisionRequest || ""),
      kanbanRevisionRequestedAt: String(row.kanban_revision_requested_at || row.kanbanRevisionRequestedAt || ""),
      kanbanRevisionRequestedBy: String(row.kanban_revision_requested_by || row.kanbanRevisionRequestedBy || ""),
      kanbanRevisionCount: Number(row.kanban_revision_count || row.kanbanRevisionCount || 0),
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || ""),
      completedAt: String(row.completed_at || ""),
      cancelledAt: String(row.cancelled_at || ""),
    };
    if (isKanbanStudyCaseMode(payload.kanbanCaseMode) && payload.kanbanCaseTemplate !== "final-assessment") {
      payload.readingSubmission = publicKanbanReadingSubmissionSummary(workspaceId, payload);
      payload.studySubmission = payload.readingSubmission;
      payload.kanbanStudyKind = payload.kanbanCaseTemplate || "custom";
      const rawStudyStatus = String(row.kanban_status || row.kanbanStatus || row.status || "").trim().toLowerCase();
      const rawStudyCompleted = rawStudyStatus === "done" || rawStudyStatus === "completed";
      if (rawStudyCompleted && !publicTodoWorkflowCompleted(payload)) {
        payload.status = payload.status === "cancelled" ? payload.status : "open";
        payload.kanbanStatus = payload.kanbanStatus === "archived" ? payload.kanbanStatus : "blocked";
        payload.kanbanCompletedAt = "";
        payload.completedAt = "";
        payload.kanbanResult = "";
        payload.kanbanOutputs = [];
      }
    }
    if (isKanbanAssessmentCaseMode(payload.kanbanCaseMode) || payload.kanbanCaseTemplate === "final-assessment") {
      payload.assessmentExam = publicKanbanAssessmentSummary(workspaceId, payload);
      payload.kanbanAssessmentKind = payload.kanbanCaseTemplate || "assessment";
      if (!publicTodoWorkflowCompleted(payload)) {
        payload.status = payload.status === "cancelled" ? payload.status : "open";
        payload.kanbanStatus = payload.kanbanStatus === "archived" ? payload.kanbanStatus : "blocked";
        payload.kanbanCompletedAt = "";
        payload.completedAt = "";
        payload.kanbanResult = "";
        payload.kanbanOutputs = [];
      }
    }
    if (optionsForTodo.skipWorkflow) return payload;
    const workflowInput = {
      card: payload,
      readingState: payload.readingSubmission || payload.studySubmission || null,
      assessmentState: payload.assessmentExam || null,
    };
    const priorContext = publicTodoPriorContext(payload, optionsForTodo);
    if (priorContext && Object.prototype.hasOwnProperty.call(priorContext, "priorComplete")) {
      workflowInput.priorComplete = priorContext.priorComplete;
    }
    const workflowState = deriveKanbanWorkflowState(workflowInput);
    if (workflowState.kind) {
      payload.workflowState = workflowState;
      if (workflowState.kind === "reading" || workflowState.kind === "study") payload.studyWorkflow = workflowState;
      if (workflowState.kind === "assessment" || workflowState.kind === "final-assessment") payload.assessmentWorkflow = workflowState;
    }
    return payload;
  }

  return {
    kanbanHasPassedAttempt,
    kanbanWorkflowStateCompleted,
    publicTodo,
    publicTodoListContext,
    publicTodoOptions,
    publicTodoPriorContext,
    publicTodoWorkflowCompleted,
  };
}

module.exports = {
  createTodoPublicProjectionService,
  kanbanHasPassedAttempt,
  kanbanWorkflowStateCompleted,
  normalizeStringList,
  publicTodoOptions,
};
