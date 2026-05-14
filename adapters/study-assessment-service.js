"use strict";

const {
  actorRoleForKanbanCase,
  normalizeKanbanCaseRecord,
} = require("./kanban-story-provider");

const CASE_ROLES = new Set(["manager", "performer", "viewer"]);
const DONE_STATUSES = new Set(["done", "completed"]);
const ARCHIVED_STATUSES = new Set(["archived", "cancelled", "canceled"]);

function own(object, key) {
  return Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function lowerString(value) {
  return cleanString(value).toLowerCase();
}

function firstString(source, names, fallback = "") {
  if (!source || typeof source !== "object") return fallback;
  for (const name of names) {
    if (!own(source, name)) continue;
    const value = cleanString(source[name]);
    if (value) return value;
  }
  return fallback;
}

function firstNumber(source, names, fallback = 0) {
  if (!source || typeof source !== "object") return fallback;
  for (const name of names) {
    if (!own(source, name)) continue;
    const value = Number(source[name]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function arrayFromValue(value, limit = 100) {
  const raw = Array.isArray(value) ? value : cleanString(value).split(/[,\s;]+/);
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const text = cleanString(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function firstArray(source, names, limit = 100) {
  if (!source || typeof source !== "object") return [];
  for (const name of names) {
    if (!own(source, name)) continue;
    const values = arrayFromValue(source[name], limit);
    if (values.length) return values;
  }
  return [];
}

function normalizeStatus(card = {}) {
  const status = lowerString(card.kanbanStatus || card.kanban_status || card.status || card.state);
  return status || "todo";
}

function normalizeStudyAssessmentKind(card = {}) {
  const mode = firstString(card, ["kanbanCaseMode", "kanban_case_mode", "caseMode", "case_mode", "mode"]);
  const template = firstString(card, [
    "kanbanCaseTemplate",
    "kanban_case_template",
    "caseTemplate",
    "case_template",
    "template",
  ]);
  if (mode === "assessment-plan" || template === "assessment") return "assessment";
  if (mode === "study-plan" && template === "final-assessment") return "final-assessment";
  if (mode === "study-plan" && (template === "reading" || template === "reading-plan")) return "reading";
  if (mode === "study-plan") return "study";
  return "";
}

function isStudyKind(kind) {
  return kind === "study" || kind === "reading";
}

function isAssessmentKind(kind) {
  return kind === "assessment" || kind === "final-assessment";
}

function workflowState(card = {}, kind = normalizeStudyAssessmentKind(card)) {
  if (isAssessmentKind(kind)) {
    return card.assessmentExam || card.assessmentState || card.examState || {};
  }
  if (isStudyKind(kind)) {
    return card.readingSubmission || card.studySubmission || card.readingState || card.studyState || {};
  }
  return {};
}

function normalizedAttempts(state = {}) {
  const attempts = Array.isArray(state.attempts) ? state.attempts.slice() : [];
  if (state.lastAttempt && typeof state.lastAttempt === "object") {
    const last = state.lastAttempt;
    const duplicate = attempts.some((attempt) => (
      cleanString(attempt.id) && cleanString(attempt.id) === cleanString(last.id)
    ));
    if (!duplicate) attempts.push(last);
  }
  return attempts.filter((attempt) => attempt && typeof attempt === "object");
}

function attemptPassed(attempt = {}, options = {}) {
  if (attempt.passed === true) return true;
  if (attempt.passed === false) return false;
  if (attempt.pass === true) return true;
  const correctCount = Number(attempt.correctCount ?? attempt.correct_count);
  const questionCount = Number(attempt.questionCount ?? attempt.question_count ?? attempt.totalQuestions ?? attempt.total_questions);
  if (options.requireAllCorrect && Number.isFinite(correctCount) && Number.isFinite(questionCount) && questionCount > 0) {
    return correctCount >= questionCount;
  }
  const score = Number(attempt.score ?? attempt.percent);
  const passScore = Number(attempt.passScore ?? attempt.pass_score ?? options.passScore);
  if (Number.isFinite(score) && Number.isFinite(passScore)) return score >= passScore;
  return false;
}

function attemptFailed(attempt = {}, options = {}) {
  if (attempt.passed === false || attempt.pass === false) return true;
  const correctCount = Number(attempt.correctCount ?? attempt.correct_count);
  const questionCount = Number(attempt.questionCount ?? attempt.question_count ?? attempt.totalQuestions ?? attempt.total_questions);
  if (options.requireAllCorrect && Number.isFinite(correctCount) && Number.isFinite(questionCount) && questionCount > 0) {
    return correctCount < questionCount;
  }
  const score = Number(attempt.score ?? attempt.percent);
  const passScore = Number(attempt.passScore ?? attempt.pass_score ?? options.passScore);
  if (Number.isFinite(score) && Number.isFinite(passScore)) return score < passScore;
  return false;
}

function latestAttempt(state = {}) {
  const attempts = normalizedAttempts(state);
  return attempts.length ? attempts[attempts.length - 1] : null;
}

function hasPassedAttempt(state = {}, options = {}) {
  return normalizedAttempts(state).some((attempt) => attemptPassed(attempt, options));
}

function hasFailedAttempt(state = {}, options = {}) {
  return normalizedAttempts(state).some((attempt) => attemptFailed(attempt, options));
}

function latestAttemptFailed(state = {}, options = {}) {
  const attempt = latestAttempt(state);
  return Boolean(attempt && attemptFailed(attempt, options));
}

function isStudyQuizComplete(state = {}, options = {}) {
  if (!state || typeof state !== "object") return false;
  if (state.completionError) return false;
  if (state.quizRequired === false || state.requiresQuiz === false) {
    return lowerString(state.status) === "completed";
  }
  if (state.passed === true || state.quizPassed === true) return true;
  return hasPassedAttempt(state, Object.assign({ requireAllCorrect: true }, options));
}

function isAssessmentExamComplete(state = {}, options = {}) {
  if (!state || typeof state !== "object") return false;
  if (state.completionError) return false;
  if (state.examRequired === false || state.requiresExam === false) {
    return lowerString(state.status) === "completed";
  }
  if (state.passed === true || state.examPassed === true) return true;
  return hasPassedAttempt(state, options);
}

function studyHasAnalysis(state = {}) {
  return Boolean(
    state.quiz
    || state.quizAvailable
    || state.analysisPath
    || state.analysisOutput
    || ["quiz_pending", "quiz_retry_required", "completed"].includes(lowerString(state.status))
  );
}

function step(status, active = false) {
  return { status, active: Boolean(active) };
}

function deriveSubmissionWorkflowState(cardOrState = {}, options = {}) {
  const state = cardOrState && (
    cardOrState.readingSubmission
    || cardOrState.studySubmission
    || cardOrState.readingState
    || cardOrState.studyState
  ) ? workflowState(cardOrState, "reading") : (cardOrState || {});
  const passed = isStudyQuizComplete(state, options);
  const failed = latestAttemptFailed(state, Object.assign({ requireAllCorrect: true }, options));
  const status = lowerString(state.status);
  const submitted = Boolean(
    state.submittedAt
    || state.submissionId
    || state.audioPath
    || state.transcriptPath
    || ["submitted", "transcribing", "analyzing", "analysis_pending", "quiz_pending", "completed"].includes(status)
  );
  const hasAnalysis = studyHasAnalysis(state);

  let phase = "submission_open";
  if (passed) phase = "completed";
  else if (failed || status === "quiz_retry_required") phase = "quiz_retry_required";
  else if (hasAnalysis) phase = "quiz_pending";
  else if (submitted || ["submitted", "transcribing", "analyzing", "analysis_pending"].includes(status)) phase = "analysis_pending";

  const submitStatus = submitted || hasAnalysis || passed ? "done" : "active";
  const analysisStatus = passed || hasAnalysis ? "done" : (phase === "analysis_pending" ? "active" : "locked");
  const quizStatus = passed ? "done" : (phase === "quiz_pending" || phase === "quiz_retry_required" ? "active" : "locked");
  return {
    kind: "study-submission",
    phase,
    completed: passed,
    retryRequired: phase === "quiz_retry_required",
    attempts: normalizedAttempts(state).length,
    steps: {
      submit: step(submitStatus, phase === "submission_open"),
      analyze: step(analysisStatus, phase === "analysis_pending"),
      quiz: step(quizStatus, phase === "quiz_pending" || phase === "quiz_retry_required"),
    },
  };
}

function deriveExamWorkflowState(cardOrState = {}, options = {}) {
  const cardLooksLikeInput = cardOrState && (
    own(cardOrState, "assessmentExam")
    || own(cardOrState, "assessmentState")
    || own(cardOrState, "examState")
    || own(cardOrState, "kanbanCaseTemplate")
    || own(cardOrState, "kanban_case_template")
  );
  const card = cardLooksLikeInput ? cardOrState : {};
  const state = cardLooksLikeInput ? workflowState(card, normalizeStudyAssessmentKind(card)) : (cardOrState || {});
  const kind = normalizeStudyAssessmentKind(card) || (options.finalAssessment ? "final-assessment" : "assessment");
  const finalAssessment = kind === "final-assessment" || Boolean(options.finalAssessment);
  const completed = isAssessmentExamComplete(state, options);
  const failed = latestAttemptFailed(state, options) || (
    hasFailedAttempt(state, options) && !completed && (finalAssessment || lowerString(state.status) === "retake_required")
  );
  const status = lowerString(state.status);
  let phase = "exam_open";
  if (completed) phase = "completed";
  else if (failed || status === "retake_required") phase = "retake_required";
  else if (state.examAvailable || state.exam || status === "in_progress") phase = "in_progress";
  return {
    kind: finalAssessment ? "final-assessment" : "assessment",
    phase,
    completed,
    retryRequired: phase === "retake_required",
    mustRetakeUntilPassed: finalAssessment && !completed && (phase === "retake_required" || hasFailedAttempt(state, options)),
    attempts: normalizedAttempts(state).length,
    latestAttemptPassed: Boolean(latestAttempt(state) && attemptPassed(latestAttempt(state), options)),
  };
}

function permissionsForStudyAssessmentRole(role) {
  const normalized = lowerString(role);
  if (normalized === "manager") {
    return {
      canView: true,
      canComment: true,
      canSubmitStudy: true,
      canAnswerQuiz: true,
      canStartExam: true,
      canAnswerExam: true,
      canRetakeFinalExam: true,
      canModifyPlan: true,
      canManagePlan: true,
      canDeletePlan: true,
    };
  }
  if (normalized === "performer") {
    return {
      canView: true,
      canComment: true,
      canSubmitStudy: true,
      canAnswerQuiz: true,
      canStartExam: true,
      canAnswerExam: true,
      canRetakeFinalExam: true,
      canModifyPlan: false,
      canManagePlan: false,
      canDeletePlan: false,
    };
  }
  if (normalized === "viewer") {
    return {
      canView: true,
      canComment: true,
      canSubmitStudy: false,
      canAnswerQuiz: false,
      canStartExam: false,
      canAnswerExam: false,
      canRetakeFinalExam: false,
      canModifyPlan: false,
      canManagePlan: false,
      canDeletePlan: false,
    };
  }
  return {
    canView: false,
    canComment: false,
    canSubmitStudy: false,
    canAnswerQuiz: false,
    canStartExam: false,
    canAnswerExam: false,
    canRetakeFinalExam: false,
    canModifyPlan: false,
    canManagePlan: false,
    canDeletePlan: false,
  };
}

function actorRoleForStudyAssessmentPlan(record = {}, actor = null) {
  const directRole = !actor ? lowerString(record.actorRole || record.kanbanActorRole || record.role) : "";
  if (CASE_ROLES.has(directRole)) return directRole;
  const role = actorRoleForKanbanCase(record, actor);
  return CASE_ROLES.has(role) ? role : "";
}

function permissionKey(action) {
  const text = cleanString(action).replace(/^can/i, "");
  const normalized = text.slice(0, 1).toLowerCase() + text.slice(1);
  if (["view", "read"].includes(normalized)) return "canView";
  if (["comment", "reply"].includes(normalized)) return "canComment";
  if (["submit", "submitStudy", "upload", "uploadSubmission"].includes(normalized)) return "canSubmitStudy";
  if (["quiz", "answerQuiz", "answerStudyQuiz"].includes(normalized)) return "canAnswerQuiz";
  if (["startExam", "examStart"].includes(normalized)) return "canStartExam";
  if (["answerExam", "exam", "answerAssessment"].includes(normalized)) return "canAnswerExam";
  if (["retake", "retakeFinalExam"].includes(normalized)) return "canRetakeFinalExam";
  if (["modify", "edit", "postpone", "block", "unblock"].includes(normalized)) return "canModifyPlan";
  if (["delete", "remove"].includes(normalized)) return "canDeletePlan";
  return "canManagePlan";
}

function studyAssessmentCanActor(record = {}, actor = null, action = "view") {
  const role = actorRoleForStudyAssessmentPlan(record, actor);
  const permissions = permissionsForStudyAssessmentRole(role);
  return Boolean(permissions[permissionKey(action)]);
}

function dateValue(value) {
  const text = cleanString(value).replace(" ", "T");
  if (!text) return 0;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cardOpenTimestamp(card = {}) {
  const values = [
    card.availableAt,
    card.available_at,
    card.openAt,
    card.open_at,
    card.scheduledAt,
    card.scheduled_at,
    card.dueAt,
    card.due_at,
    card.dueLocal,
    card.due_local,
  ];
  for (const value of values) {
    const parsed = dateValue(value);
    if (parsed) return parsed;
  }
  return 0;
}

function cardSortIndex(card = {}) {
  return firstNumber(card, [
    "kanbanCaseCardIndex",
    "kanban_case_card_index",
    "caseCardIndex",
    "case_card_index",
    "index",
  ], 0);
}

function cardId(card = {}) {
  return firstString(card, ["id", "todoId", "todo_id", "cardId", "card_id"]);
}

function dependencyIds(card = {}) {
  return firstArray(card, [
    "dependsOn",
    "depends_on",
    "caseDependsOn",
    "case_depends_on",
    "kanbanCaseDependsOn",
    "kanban_case_depends_on",
  ], 50);
}

function cardCompleted(card = {}, options = {}) {
  const kind = normalizeStudyAssessmentKind(card);
  const status = normalizeStatus(card);
  if (ARCHIVED_STATUSES.has(status)) return false;
  if (isStudyKind(kind)) {
    return isStudyQuizComplete(workflowState(card, kind), options);
  }
  if (isAssessmentKind(kind)) {
    return isAssessmentExamComplete(workflowState(card, kind), Object.assign({}, options, { finalAssessment: kind === "final-assessment" }));
  }
  return DONE_STATUSES.has(status);
}

function priorContextComplete(card = {}, priorCards = [], options = {}) {
  if (own(options, "priorComplete")) return Boolean(options.priorComplete);
  const kind = normalizeStudyAssessmentKind(card);
  const ids = new Set(dependencyIds(card));
  const candidates = (Array.isArray(priorCards) ? priorCards : []).filter((priorCard) => {
    if (ids.size) return ids.has(cardId(priorCard)) || ids.has(firstString(priorCard, ["kanbanCaseCardId", "kanban_case_card_id"]));
    const priorKind = normalizeStudyAssessmentKind(priorCard);
    if (kind === "final-assessment") return isStudyKind(priorKind) || priorKind === "assessment";
    if (kind === "assessment") return priorKind === "assessment";
    if (isStudyKind(kind)) return isStudyKind(priorKind);
    return true;
  });
  return candidates.every((priorCard) => cardCompleted(priorCard, options));
}

function cardVisibleToActor(record = {}, actor = null) {
  return studyAssessmentCanActor(record, actor, "view");
}

function openRuleReason(fields = {}) {
  if (!fields.visible) return "no_view_permission";
  if (fields.archived) return "archived";
  if (!fields.priorComplete) return "prior_incomplete";
  if (fields.scheduled) return "scheduled";
  if (fields.completed) return "completed";
  if (fields.workflowPhase === "analysis_pending") return "analysis_pending";
  if (fields.workflowPhase === "quiz_retry_required") return "quiz_retry_required";
  if (fields.workflowPhase === "retake_required") return "retake_required";
  if (!fields.allowed) return "permission_denied";
  return "open";
}

function deriveStudyAssessmentCardContract(input = {}) {
  const card = input.card || input;
  const kind = normalizeStudyAssessmentKind(card);
  const caseRecord = input.caseRecord || input.record || { cards: [card] };
  const role = actorRoleForStudyAssessmentPlan(caseRecord, input.actor);
  const permissions = permissionsForStudyAssessmentRole(role);
  const now = input.now ? dateValue(input.now) : (Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : Date.now());
  const openAt = cardOpenTimestamp(card);
  const scheduled = Boolean(openAt && openAt > now);
  const status = normalizeStatus(card);
  const archived = ARCHIVED_STATUSES.has(status);
  const priorComplete = priorContextComplete(card, input.priorCards || [], input);
  const visible = cardVisibleToActor(caseRecord, input.actor);

  let workflow = { kind: "", phase: status, completed: DONE_STATUSES.has(status), retryRequired: false };
  let action = "";
  let allowed = false;
  if (isStudyKind(kind)) {
    workflow = deriveSubmissionWorkflowState(workflowState(card, kind), input);
    if (workflow.phase === "submission_open") {
      action = "submitStudy";
      allowed = permissions.canSubmitStudy;
    } else if (workflow.phase === "quiz_pending" || workflow.phase === "quiz_retry_required") {
      action = "answerQuiz";
      allowed = permissions.canAnswerQuiz;
    }
  } else if (isAssessmentKind(kind)) {
    workflow = deriveExamWorkflowState(card, input);
    if (workflow.phase === "exam_open" || workflow.phase === "in_progress") {
      action = workflow.phase === "exam_open" ? "startExam" : "answerExam";
      allowed = workflow.phase === "exam_open" ? permissions.canStartExam : permissions.canAnswerExam;
    } else if (workflow.phase === "retake_required") {
      action = kind === "final-assessment" ? "retakeFinalExam" : "answerExam";
      allowed = kind === "final-assessment" ? permissions.canRetakeFinalExam : permissions.canAnswerExam;
    }
  }
  const completed = Boolean(workflow.completed);
  const open = Boolean(visible && !archived && priorComplete && !scheduled && !completed && allowed && action && workflow.phase !== "analysis_pending");
  const reason = openRuleReason({
    visible,
    archived,
    priorComplete,
    scheduled,
    completed,
    allowed,
    workflowPhase: workflow.phase,
  });
  return {
    cardId: cardId(card),
    kind,
    role,
    permissions,
    status,
    visible,
    open,
    action,
    reason,
    priorComplete,
    scheduled,
    openAt: openAt ? new Date(openAt).toISOString() : "",
    completed,
    workflow,
  };
}

function compareCards(left = {}, right = {}) {
  const leftIndex = cardSortIndex(left) || 999999;
  const rightIndex = cardSortIndex(right) || 999999;
  if (leftIndex !== rightIndex) return leftIndex - rightIndex;
  return cardId(left).localeCompare(cardId(right));
}

function buildStudyAssessmentPlanContract(input = {}) {
  const rawCards = Array.isArray(input.cards) ? input.cards : [];
  const cards = rawCards.slice().sort(compareCards);
  const caseRecord = input.caseRecord || normalizeKanbanCaseRecord({
    cards,
    ownerWorkspaceId: input.ownerWorkspaceId,
  });
  const contracts = [];
  for (const card of cards) {
    const priorCards = cards.filter((candidate) => compareCards(candidate, card) < 0);
    contracts.push(deriveStudyAssessmentCardContract(Object.assign({}, input, {
      card,
      caseRecord,
      priorCards,
    })));
  }
  return {
    caseId: caseRecord.caseId || "",
    caseMode: caseRecord.caseMode || "",
    actorRole: actorRoleForStudyAssessmentPlan(caseRecord, input.actor),
    cards: contracts,
    counts: {
      total: contracts.length,
      open: contracts.filter((item) => item.open).length,
      completed: contracts.filter((item) => item.completed).length,
      retakeRequired: contracts.filter((item) => item.workflow.retryRequired).length,
    },
  };
}

module.exports = {
  actorRoleForStudyAssessmentPlan,
  buildStudyAssessmentPlanContract,
  deriveExamWorkflowState,
  deriveStudyAssessmentCardContract,
  deriveSubmissionWorkflowState,
  hasPassedAttempt,
  isAssessmentExamComplete,
  isStudyQuizComplete,
  normalizeStudyAssessmentKind,
  permissionsForStudyAssessmentRole,
  studyAssessmentCanActor,
};
