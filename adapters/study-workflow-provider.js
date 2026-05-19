"use strict";

function normalizedStatus(card = {}) {
  return String(card.kanbanStatus || card.kanban_status || card.status || "").trim().toLowerCase();
}

function isStudyCase(card = {}) {
  return String(card.kanbanCaseMode || card.kanban_case_mode || "").trim() === "study-plan";
}

function isAssessmentCase(card = {}) {
  const mode = String(card.kanbanCaseMode || card.kanban_case_mode || "").trim();
  const template = String(card.kanbanCaseTemplate || card.kanban_case_template || "").trim();
  return mode === "assessment-plan" || (mode === "study-plan" && template === "final-assessment");
}

function isStudySubmissionCase(card = {}) {
  return isStudyCase(card) && String(card.kanbanCaseTemplate || card.kanban_case_template || "").trim() !== "final-assessment";
}

function readingCompleted(state = {}) {
  if (state?.completionError) return false;
  return String(state?.status || "") === "completed";
}

function hasPassedAttempt(state = {}) {
  const attempts = Array.isArray(state?.attempts) ? state.attempts : [];
  return attempts.some((attempt) => Boolean(attempt?.passed)) || Boolean(state?.lastAttempt?.passed);
}

function readingCompletionEvidence(state = {}, officialDone = false) {
  if (readingCompleted(state)) return true;
  return Boolean(officialDone && hasPassedAttempt(state));
}

function readingHasAnalysis(state = {}) {
  return Boolean(
    state?.quiz
    || state?.quizAvailable
    || state?.analysisPath
    || state?.analysisOutput
    || String(state?.status || "") === "quiz_pending"
    || readingCompleted(state)
  );
}

function assessmentCompleted(state = {}) {
  if (state?.completionError) return false;
  return String(state?.status || "") === "completed";
}

function assessmentCompletionEvidence(state = {}, officialDone = false) {
  if (assessmentCompleted(state)) return true;
  return Boolean(officialDone && hasPassedAttempt(state));
}

function priorComplete(priorCards = [], predicate = () => true) {
  return (priorCards || []).filter(predicate).every((card) => {
    const workflow = card?.workflowState || card?.studyWorkflow || card?.assessmentWorkflow || {};
    const status = normalizedStatus(card);
    const officialDone = status === "done" || status === "completed";
    if (isAssessmentCase(card)) return assessmentCompletionEvidence(card.assessmentExam || card.assessmentState || {}, officialDone);
    if (isStudySubmissionCase(card)) return readingCompletionEvidence(card.readingSubmission || card.studySubmission || card.readingState || {}, officialDone);
    if (workflow.completed) return true;
    return status === "done" || status === "completed";
  });
}

function deriveKanbanWorkflowState(input = {}) {
  const card = input.card || input;
  const priorCards = Array.isArray(input.priorCards) ? input.priorCards : [];
  const hasPriorCompleteOverride = Object.prototype.hasOwnProperty.call(input, "priorComplete");
  const status = normalizedStatus(card);
  const archived = status === "archived" || String(card.status || "").trim().toLowerCase() === "cancelled";
  const sourceStatus = status || "";

  if (isAssessmentCase(card)) {
    const assessmentState = input.assessmentState || card.assessmentExam || {};
    const officialDone = status === "done" || status === "completed";
    const completed = assessmentCompletionEvidence(assessmentState, officialDone);
    const finalAssessment = String(card.kanbanCaseTemplate || card.kanban_case_template || "") === "final-assessment";
    const priorOk = hasPriorCompleteOverride
      ? Boolean(input.priorComplete)
      : priorComplete(
        priorCards,
        finalAssessment ? (priorCard) => isStudySubmissionCase(priorCard) || isAssessmentCase(priorCard) : isAssessmentCase,
      );
    let phase = "exam_open";
    if (archived) phase = "archived";
    else if (!priorOk) phase = "locked";
    else if (completed) phase = "completed";
    else if (String(assessmentState.status || "") === "retake_required") phase = "retake_required";
    else if (assessmentState.examAvailable || assessmentState.exam || String(assessmentState.status || "") === "in_progress") phase = "in_progress";
    return {
      kind: String(card.kanbanCaseTemplate || card.kanban_case_template || "") === "final-assessment" ? "final-assessment" : "assessment",
      phase,
      sourceStatus,
      completed,
      requiresPriorCompletion: !priorOk,
      canSubmitStudy: false,
      canAnswerQuiz: ["in_progress", "retake_required"].includes(phase),
      canStartExam: phase === "exam_open",
      canRevise: !archived,
      priorContextComplete: priorOk,
      priorContextAvailable: hasPriorCompleteOverride || Array.isArray(input.priorCards),
    };
  }

  if (isStudySubmissionCase(card)) {
    const readingState = input.readingState || card.readingSubmission || card.studySubmission || {};
    const officialDone = status === "done" || status === "completed";
    const completed = readingCompletionEvidence(readingState, officialDone);
    const priorOk = hasPriorCompleteOverride ? Boolean(input.priorComplete) : priorComplete(priorCards, isStudySubmissionCase);
    const hasAnalysis = readingHasAnalysis(readingState);
    let phase = "submission_open";
    if (archived) phase = "archived";
    else if (!priorOk) phase = "locked";
    else if (completed) phase = "completed";
    else if (hasAnalysis) phase = "quiz_pending";
    else if (["submitted", "analyzing", "processing"].includes(String(readingState.status || ""))) phase = "analysis_pending";
    return {
      kind: String(card.kanbanCaseTemplate || card.kanban_case_template || "") === "reading" ? "reading" : "study",
      phase,
      sourceStatus,
      completed,
      requiresPriorCompletion: !priorOk,
      canSubmitStudy: phase === "submission_open",
      canAnswerQuiz: phase === "quiz_pending",
      canStartExam: false,
      canRevise: !archived,
      priorContextComplete: priorOk,
      priorContextAvailable: hasPriorCompleteOverride || Array.isArray(input.priorCards),
    };
  }

  return {
    kind: "",
    phase: archived ? "archived" : (sourceStatus || "open"),
    sourceStatus,
    completed: status === "done" || status === "completed",
    requiresPriorCompletion: false,
    canSubmitStudy: false,
    canAnswerQuiz: false,
    canStartExam: false,
    canRevise: !archived,
  };
}

module.exports = {
  deriveKanbanWorkflowState,
  isAssessmentCase,
  isStudySubmissionCase,
  readingCompleted,
  assessmentCompleted,
  hasPassedAttempt,
  readingCompletionEvidence,
  assessmentCompletionEvidence,
};
