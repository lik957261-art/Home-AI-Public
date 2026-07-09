"use strict";

export const KANBAN_LEARNING_PANEL_MODEL_VERSION = "20260705-kanban-learning-panel-model-v1";

export function learningGrowthEvaluationLabelPlan(evaluation = {}) {
  const status = String(evaluation.status || "");
  const nextStep = String(evaluation.nextStep || "");
  const passLine = Number(evaluation.finalPassingScore || evaluation.passingScore || 80) || 80;
  const score = Number(evaluation.score);
  const scoreReachedPassLine = Number.isFinite(score) && score >= passLine;
  if (nextStep === "spoken_reflection_required" || status === "reflection_required") {
    return "最终评分已达标，待录音复盘";
  }
  if (nextStep === "completed" || status === "completed" || evaluation.passed) return "已通过";
  if ((nextStep === "rewrite_and_reflect" || status === "draft_feedback") && scoreReachedPassLine) {
    return "初稿已达标，待反思和修改";
  }
  if (
    nextStep === "rewrite_and_reflect"
    || nextStep === "revise_and_resubmit"
    || status === "draft_feedback"
    || status === "needs_revision"
  ) {
    return "还需要修改";
  }
  return "批改结果";
}

export function learningGrowthPublicSubmissionTextPlan(submission = {}, todo = {}) {
  return [
    submission.displayText,
    submission.text,
    submission.rawText,
    submission.summary,
    submission.excerpt,
    submission.comment,
    submission.commentText,
    todo.learningGrowthSubmissionText,
    todo.learningGrowthSubmissionSummary,
  ].map((item) => String(item || "").trim()).find(Boolean) || "";
}

export function answerDraftHashPlan(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function answerDraftStorageIdPlan(value) {
  return encodeURIComponent(String(value || ""));
}

export function answerDraftStoragePrefixPlan(kind, workspaceId, todoId) {
  return `hermes${kind}AnswerDraft:${answerDraftStorageIdPlan(workspaceId || "owner")}:${answerDraftStorageIdPlan(todoId)}:`;
}

export function answerDraftStorageKeyPlan(kind, workspaceId, todoId, fingerprint) {
  return `${answerDraftStoragePrefixPlan(kind, workspaceId, todoId)}${answerDraftHashPlan(fingerprint)}`;
}

export function answerDraftFingerprintPlan(source = {}) {
  const questions = Array.isArray(source.questions) ? source.questions : [];
  const questionKey = questions.map((question, index) => [
    question?.id || `q${index + 1}`,
    question?.prompt || "",
    Array.isArray(question?.choices) ? question.choices.length : 0,
  ].join(":")).join("|");
  return [
    source.startedAt || "",
    source.quizTargetingVersion || "",
    source.verification || "",
    source.status || "",
    questions.length,
    questionKey,
  ].join("|");
}

export function validAnswerChoicePlan(value, question = {}) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  const choices = Array.isArray(question.choices) ? question.choices : [];
  return Number.isInteger(parsed) && parsed >= 0 && parsed < choices.length ? parsed : null;
}

export function serializeAnswerDraftAnswersPlan(answers = [], questions = []) {
  const sourceQuestions = Array.isArray(questions) ? questions : [];
  return sourceQuestions.map((question, index) => validAnswerChoicePlan(answers[index], question));
}

export function restoreAnswerDraftAnswersPlan(answers = [], questions = []) {
  const restored = [];
  const sourceQuestions = Array.isArray(questions) ? questions : [];
  sourceQuestions.forEach((question, index) => {
    const value = validAnswerChoicePlan(answers[index], question);
    if (value !== null) restored[index] = value;
  });
  return restored;
}

export function answerDraftAnsweredCountPlan(answers = [], questions = []) {
  return serializeAnswerDraftAnswersPlan(answers, questions).filter((value) => value !== null).length;
}

export function learningGuidanceKeyPlan(todoId, mode) {
  return `${String(todoId || "")}:${String(mode || "")}`;
}

export function learningGuidanceDraftKeyPlan(todoId, mode, index) {
  return `${learningGuidanceKeyPlan(todoId, mode)}:${Number(index) || 0}`;
}

export function learningGuidanceModeForAssessmentPlan(todo = {}) {
  return todo?.kanbanCaseType === "programming_assessment"
    || todo?.kanbanCaseCardType === "programming_assessment"
    || todo?.learningAssessmentType === "programming"
    || todo?.programmingAssessment
    ? "programming-assessment"
    : "assessment-exam";
}

export function learningGuidanceQuestionPayloadPlan(question = {}, index = 0) {
  return {
    id: String(question.id || `q${Number(index || 0) + 1}`),
    index: Number(index) || 0,
    skill: String(question.skill || ""),
    prompt: String(question.prompt || ""),
    choices: Array.isArray(question.choices) ? question.choices.map((choice) => String(choice || "")) : [],
  };
}

export function selectedLearningAnswerPlan(answers = [], index = 0) {
  const value = Array.isArray(answers) ? Number(answers[index]) : NaN;
  return Number.isInteger(value) && value >= 0 ? value : null;
}
