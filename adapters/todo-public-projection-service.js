"use strict";

const {
  kanbanCardEffectiveCaseIndex: defaultKanbanCardEffectiveCaseIndex,
  visibleKanbanCaseCards: defaultVisibleKanbanCaseCards,
} = require("./kanban-story-provider");
const {
  deriveKanbanWorkflowState: defaultDeriveKanbanWorkflowState,
} = require("./study-workflow-provider");
const {
  inferLearningTaskModelFromCard,
  learningTaskModelSummary,
} = require("./learning-task-model-service");
const {
  projectGrowthInteractionState,
} = require("./learning-growth-task-interaction-state-service");

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

function normalizeObjectList(value, limit) {
  let raw = value;
  if (typeof raw === "string" && raw.trim().startsWith("[")) {
    try {
      raw = JSON.parse(raw);
    } catch (_) {
      raw = [];
    }
  }
  return (Array.isArray(raw) ? raw : [])
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .slice(0, limit);
}

function boolValue(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(text);
}

function objectValue(value) {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }
  return null;
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

function projectedWorkflowKanbanStatus(payload = {}, workflowState = {}) {
  const kind = String(workflowState?.kind || "").trim();
  const phase = String(workflowState?.phase || "").trim().toLowerCase();
  if (kind === "reading" || kind === "study") {
    if (!phase || phase === "completed") return "";
    if (phase === "archived") return "archived";
    if (phase === "locked") return "blocked";
    if (phase === "submission_open") return "todo";
    if (phase === "analysis_pending" || phase === "quiz_pending" || phase === "quiz_retry_required") return "running";
    return "";
  }
  if (kind !== "assessment" && kind !== "final-assessment") return "";
  if (!phase || phase === "completed") return "";
  if (phase === "archived") return "archived";
  if (phase === "locked") return "blocked";
  if (phase === "exam_open") return "todo";
  if (phase === "in_progress" || phase === "retake_required") return "running";
  return "";
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
    const studyKind = String(payload.kanbanCaseTemplate || "").trim().toLowerCase();
    if (isKanbanStudyCaseMode(payload.kanbanCaseMode) && payload.kanbanCaseTemplate !== "final-assessment" && studyKind !== "learning-growth") {
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
        const isStudy = isKanbanStudyCaseMode(payload.kanbanCaseMode)
          && payload.kanbanCaseTemplate !== "final-assessment"
          && String(payload.kanbanCaseTemplate || "").trim().toLowerCase() !== "learning-growth";
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
      topicThreadId: String(row.topic_thread_id || row.topicThreadId || ""),
      topicTaskGroupId: String(row.topic_task_group_id || row.topicTaskGroupId || ""),
      sharedDirectoryPath: String(row.shared_directory_path || row.sharedDirectoryPath || ""),
      caseDirectoryPath: String(row.case_directory_path || row.caseDirectoryPath || ""),
      kanbanCaseCardId: String(row.kanban_case_card_id || row.kanbanCaseCardId || ""),
      kanbanCaseCardIndex: Number(row.kanban_case_card_index || row.kanbanCaseCardIndex || 0),
      kanbanCaseCardCount: Number(row.kanban_case_card_count || row.kanbanCaseCardCount || 0),
      kanbanCaseDependsOn: normalizeStringList(row.kanban_case_depends_on || row.kanbanCaseDependsOn, 12),
      kanbanCaseDeliverables: normalizeStringList(row.kanban_case_deliverables || row.kanbanCaseDeliverables, 8),
      kanbanCaseAcceptance: normalizeStringList(row.kanban_case_acceptance || row.kanbanCaseAcceptance, 8),
      kanbanCaseCardGoal: String(row.kanban_case_card_goal || row.kanbanCaseCardGoal || ""),
      kanbanCaseCreationSkillId: String(row.kanban_case_creation_skill_id || row.kanbanCaseCreationSkillId || ""),
      kanbanLastCommentAt: String(row.kanban_last_comment_at || row.kanbanLastCommentAt || ""),
      learningGrowthSubmissionText: String(row.learning_growth_submission_text || row.learningGrowthSubmissionText || ""),
      learningGrowthSubmissionStatus: String(row.learning_growth_submission_status || row.learningGrowthSubmissionStatus || ""),
      learningGrowthSubmissionKind: String(row.learning_growth_submission_kind || row.learningGrowthSubmissionKind || ""),
      learningGrowthSubmissionAt: String(row.learning_growth_submission_at || row.learningGrowthSubmissionAt || ""),
      learningGrowthEvaluationStatus: String(row.learning_growth_evaluation_status || row.learningGrowthEvaluationStatus || ""),
      learningGrowthEvaluationAt: String(row.learning_growth_evaluation_at || row.learningGrowthEvaluationAt || ""),
      learningGrowthScore: Number(row.learning_growth_score ?? row.learningGrowthScore ?? 0) || 0,
      learningGrowthMaxScore: Number(row.learning_growth_max_score ?? row.learningGrowthMaxScore ?? 100) || 100,
      learningGrowthPassed: boolValue(row.learning_growth_passed ?? row.learningGrowthPassed),
      learningGrowthFeedbackSummary: String(row.learning_growth_feedback_summary || row.learningGrowthFeedbackSummary || ""),
      learningGrowthFeedbackMethod: String(row.learning_growth_feedback_method || row.learningGrowthFeedbackMethod || ""),
      learningGrowthAiFeedbackStatus: String(row.learning_growth_ai_feedback_status || row.learningGrowthAiFeedbackStatus || ""),
      learningGrowthRevisionRequirements: normalizeStringList(row.learning_growth_revision_requirements || row.learningGrowthRevisionRequirements, 8),
      learningGrowthNextStep: String(row.learning_growth_next_step || row.learningGrowthNextStep || ""),
      learningGrowthReportPath: String(row.learning_growth_report_path || row.learningGrowthReportPath || ""),
      learningGrowthReportName: String(row.learning_growth_report_name || row.learningGrowthReportName || ""),
      learningGrowthStrengths: normalizeStringList(row.learning_growth_strengths || row.learningGrowthStrengths, 8),
      learningGrowthFocusAreas: normalizeStringList(row.learning_growth_focus_areas || row.learningGrowthFocusAreas, 8),
      learningGrowthRewriteChecklist: normalizeStringList(row.learning_growth_rewrite_checklist || row.learningGrowthRewriteChecklist, 8),
      learningGrowthReflectionPrompts: normalizeStringList(row.learning_growth_reflection_prompts || row.learningGrowthReflectionPrompts, 8),
      learningGrowthSentenceFeedback: normalizeObjectList(row.learning_growth_sentence_feedback || row.learningGrowthSentenceFeedback, 8),
      learningGrowthFinalConclusion: String(row.learning_growth_final_conclusion || row.learningGrowthFinalConclusion || ""),
      learningGrowthNextPractice: String(row.learning_growth_next_practice || row.learningGrowthNextPractice || ""),
      learningGrowthParentNote: String(row.learning_growth_parent_note || row.learningGrowthParentNote || ""),
      learningGrowthRewardStatus: String(row.learning_growth_reward_status || row.learningGrowthRewardStatus || ""),
      learningGrowthRewardCoins: Number(row.learning_growth_reward_coins ?? row.learningGrowthRewardCoins ?? 0) || 0,
      learningGrowthRewardEntryId: String(row.learning_growth_reward_entry_id || row.learningGrowthRewardEntryId || ""),
      learningProgramId: String(row.learning_program_id || row.learningProgramId || ""),
      learningDraftId: String(row.learning_draft_id || row.learningDraftId || ""),
      learningTaskCardId: String(row.learning_task_card_id || row.learningTaskCardId || ""),
      learningTaskModel: objectValue(row.learning_task_model || row.learningTaskModel),
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
    const studyKind = String(payload.kanbanCaseTemplate || "custom").trim().toLowerCase() || "custom";
    const learningGrowthStudy = studyKind === "learning-growth";
    if (isKanbanStudyCaseMode(payload.kanbanCaseMode) && payload.kanbanCaseTemplate !== "final-assessment" && !learningGrowthStudy) {
      payload.readingSubmission = publicKanbanReadingSubmissionSummary(workspaceId, payload);
      payload.studySubmission = payload.readingSubmission;
      payload.kanbanStudyKind = studyKind;
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
    if (learningGrowthStudy) {
      payload.kanbanStudyKind = "learning-growth";
      payload.learningTaskModel = payload.learningTaskModel || inferLearningTaskModelFromCard(payload);
      if (Array.isArray(payload.learningTaskModel?.deliverables) && payload.learningTaskModel.deliverables.length) {
        payload.kanbanCaseDeliverables = payload.learningTaskModel.deliverables.slice(0, 8);
      }
      if (Array.isArray(payload.learningTaskModel?.acceptance) && payload.learningTaskModel.acceptance.length) {
        payload.kanbanCaseAcceptance = payload.learningTaskModel.acceptance.slice(0, 8);
      }
      payload.learningGrowthTaskModel = learningTaskModelSummary(payload.learningTaskModel);
      payload.learningGrowthRewardPolicy = payload.learningGrowthTaskModel.rewardPolicy;
      payload.learningGrowthInteractionState = projectGrowthInteractionState(payload.learningTaskModel, {
        evaluationStatus: payload.learningGrowthEvaluationStatus,
        nextStep: payload.learningGrowthNextStep,
        kanbanStatus: payload.kanbanStatus,
        completed: publicTodoWorkflowCompleted(payload),
      });
      payload.learningGrowthNextAction = payload.learningGrowthInteractionState.nextAction;
      const submittedAt = payload.learningGrowthSubmissionAt || payload.kanbanLastCommentAt;
      if (payload.learningGrowthSubmissionStatus || submittedAt) {
        const evaluationStatus = payload.learningGrowthEvaluationStatus || "pending";
        const interactionState = projectGrowthInteractionState(payload.learningTaskModel, {
          submitted: true,
          submissionStatus: payload.learningGrowthSubmissionStatus || "submitted",
          submittedAt,
          evaluationStatus,
          nextStep: payload.learningGrowthNextStep,
          kanbanStatus: payload.kanbanStatus,
          completed: publicTodoWorkflowCompleted(payload),
        });
        payload.learningGrowthInteractionState = interactionState;
        const analysisAvailable = interactionState.analysisAvailable;
        const reportOutput = payload.learningGrowthReportPath
          ? (publicKanbanOutputsFromText(workspaceId, `MEDIA: ${payload.learningGrowthReportPath}`)[0] || null)
          : null;
        const reportKey = reportOutput ? String(reportOutput.path || reportOutput.url || payload.learningGrowthReportPath || reportOutput.name || "") : "";
        if (reportOutput && !payload.kanbanOutputs.some((item) => String(item?.path || item?.url || item?.name || "") === reportKey)) {
          payload.kanbanOutputs = payload.kanbanOutputs.concat([Object.assign({}, reportOutput, {
            name: payload.learningGrowthReportName || reportOutput.name,
            role: "learning-growth-writing-report",
          })]);
        }
        const nextStep = interactionState.nextStep;
        payload.learningGrowthNextAction = interactionState.nextAction;
        payload.learningGrowthSubmission = {
          status: payload.learningGrowthSubmissionStatus || "submitted",
          kind: payload.learningGrowthSubmissionKind || "writing",
          submittedAt,
          evaluationStatus,
          evaluationAt: payload.learningGrowthEvaluationAt,
          analysisAvailable,
          nextStep,
        };
        if (payload.learningGrowthSubmissionText) payload.learningGrowthSubmission.text = payload.learningGrowthSubmissionText;
        if (analysisAvailable) {
          payload.learningGrowthEvaluation = {
            status: evaluationStatus,
            score: payload.learningGrowthScore,
            maxScore: payload.learningGrowthMaxScore,
            passed: payload.learningGrowthPassed,
            summary: payload.learningGrowthFeedbackSummary,
            revisionRequirements: payload.learningGrowthRevisionRequirements,
            feedbackMethod: payload.learningGrowthFeedbackMethod,
            aiFeedbackStatus: payload.learningGrowthAiFeedbackStatus,
            feedbackSections: {
              strengths: payload.learningGrowthStrengths,
              focusAreas: payload.learningGrowthFocusAreas,
              rewriteChecklist: payload.learningGrowthRewriteChecklist,
              reflectionPrompts: payload.learningGrowthReflectionPrompts,
              sentenceFeedback: payload.learningGrowthSentenceFeedback,
              finalConclusion: payload.learningGrowthFinalConclusion,
              nextPractice: payload.learningGrowthNextPractice,
              parentNote: payload.learningGrowthParentNote,
            },
            nextStep,
            evaluatedAt: payload.learningGrowthEvaluationAt,
            report: reportOutput ? Object.assign({}, reportOutput, {
              name: payload.learningGrowthReportName || reportOutput.name,
              role: "learning-growth-writing-report",
            }) : null,
            reward: {
              status: payload.learningGrowthRewardStatus,
              coinAmount: payload.learningGrowthRewardCoins,
              entryId: payload.learningGrowthRewardEntryId,
              policy: payload.learningGrowthRewardPolicy,
            },
          };
        }
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
    if (learningGrowthStudy || optionsForTodo.skipWorkflow) return payload;
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
      const projectedStatus = projectedWorkflowKanbanStatus(payload, workflowState);
      if (projectedStatus) payload.kanbanStatus = projectedStatus;
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
  projectedWorkflowKanbanStatus,
  publicTodoOptions,
};
