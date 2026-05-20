"use strict";

function cleanString(value) {
  return String(value ?? "").trim();
}

const ANALYSIS_STATUSES = new Set([
  "completed",
  "draft_feedback",
  "needs_revision",
  "reflection_required",
  "review_required",
  "pending_review",
]);

const KNOWN_NEXT_STEPS = new Set([
  "completed",
  "rewrite_and_reflect",
  "revise_and_resubmit",
  "spoken_reflection_required",
  "pending_evaluation",
]);

function normalizeGrowthEvaluationStatus(value) {
  const text = cleanString(value).toLowerCase();
  if (["done", "complete", "completed", "passed"].includes(text)) return "completed";
  if (["draft_feedback", "first_feedback", "feedback_ready"].includes(text)) return "draft_feedback";
  if (["needs_revision", "revision_required", "revise", "failed"].includes(text)) return "needs_revision";
  if (["reflection_required", "spoken_reflection_required", "reflection_retry_required"].includes(text)) return "reflection_required";
  if (["review_required", "requires_review"].includes(text)) return "review_required";
  if (["pending_review", "waiting_review"].includes(text)) return "pending_review";
  if (["pending", "submitted", "queued", "running"].includes(text)) return "pending";
  return "";
}

function normalizeGrowthNextStep(value, state = {}) {
  const text = cleanString(value).toLowerCase();
  if (KNOWN_NEXT_STEPS.has(text)) return text;
  const status = normalizeGrowthEvaluationStatus(state.evaluationStatus || state.status);
  if (status === "completed") return "completed";
  if (status === "reflection_required") return "spoken_reflection_required";
  if (status === "draft_feedback") return "rewrite_and_reflect";
  if (status === "needs_revision") return "revise_and_resubmit";
  if (status === "pending" || status === "review_required" || status === "pending_review" || state.submitted) {
    return "pending_evaluation";
  }
  return "";
}

function normalizeGrowthSubmissionStage(value, fallback = "draft") {
  const text = cleanString(value).toLowerCase();
  if (["final", "rewrite", "revision", "resubmission"].includes(text)) return "final";
  if (["draft", "first_draft", "initial"].includes(text)) return "draft";
  return fallback === "final" ? "final" : "draft";
}

function growthNextStepForStage(stage, passed) {
  return normalizeGrowthSubmissionStage(stage) === "draft"
    ? "rewrite_and_reflect"
    : (passed ? "completed" : "revise_and_resubmit");
}

function modelHasFirstSubmission(model = {}) {
  const contract = model && typeof model === "object" ? model.submissionContract || {} : {};
  return Boolean(cleanString(contract.firstSubmissionKind));
}

function modelFlowPolicy(model = {}) {
  const evaluation = model && typeof model === "object" ? model.evaluationContract || {} : {};
  const completion = model && typeof model === "object" ? model.completionPolicy || {} : {};
  const score = Number(evaluation.finalPassingScore || evaluation.passingScore || completion.finalPassingScore || 80);
  const hasReflectionPolicy = evaluation.requiresSpokenReflection !== undefined || completion.requiresSpokenReflection !== undefined;
  const hasSettlementPolicy = evaluation.settlementAfterReflection !== undefined || completion.settlementAfterReflection !== undefined;
  return {
    finalPassingScore: Number.isFinite(score) ? Math.max(1, Math.min(100, Math.round(score))) : 80,
    finalStage: cleanString(evaluation.finalStage || "final"),
    reflectionGateEnabled: hasReflectionPolicy ? Boolean(evaluation.requiresSpokenReflection || completion.requiresSpokenReflection) : true,
    settlementAfterReflection: hasSettlementPolicy ? Boolean(evaluation.settlementAfterReflection || completion.settlementAfterReflection) : true,
    completionStep: cleanString(completion.completeAfterStep),
    reflectionStep: cleanString(completion.reflectionStep || "learner_spoken_reflection"),
  };
}

function growthNextActionForTaskModel(model = {}, state = {}) {
  const status = normalizeGrowthEvaluationStatus(state.evaluationStatus || state.status);
  const nextStep = normalizeGrowthNextStep(state.nextStep, Object.assign({}, state, { status }));
  if (status === "completed" || nextStep === "completed") return "review_feedback";
  if (status === "reflection_required" || nextStep === "spoken_reflection_required") return "submit_spoken_reflection";
  if (nextStep === "rewrite_and_reflect" || status === "draft_feedback") return "submit_revision_and_reflection";
  if (nextStep === "revise_and_resubmit" || status === "needs_revision") return "submit_revision";
  if (nextStep === "pending_evaluation" || status === "pending" || status === "review_required" || status === "pending_review") {
    return "wait_for_feedback";
  }
  return modelHasFirstSubmission(model) ? "submit_first_attempt" : "start_task";
}

function phaseFor(status, submitted) {
  if (status === "completed") return "completed";
  if (status === "reflection_required") return "reflection_required";
  if (status === "draft_feedback") return "draft_feedback";
  if (status === "needs_revision") return "needs_revision";
  if (status === "review_required" || status === "pending_review") return "review_required";
  if (status === "pending" || submitted) return "awaiting_feedback";
  return "not_started";
}

function projectGrowthInteractionState(model = {}, state = {}) {
  const flowPolicy = modelFlowPolicy(model);
  const submitted = Boolean(state.submitted || state.submissionStatus || state.submittedAt);
  const status = normalizeGrowthEvaluationStatus(state.evaluationStatus || state.status);
  const nextStep = normalizeGrowthNextStep(state.nextStep, { status, submitted });
  const nextAction = growthNextActionForTaskModel(model, { status, nextStep, submitted });
  const kanbanStatus = cleanString(state.kanbanStatus || state.kanban_status).toLowerCase();
  const blocked = Boolean(state.blocked) || kanbanStatus === "blocked";
  const completed = status === "completed" || Boolean(state.completed) || ["done", "completed", "archived", "cancelled", "canceled"].includes(kanbanStatus);
  const canSubmitByAction = ["submit_first_attempt", "submit_revision", "submit_revision_and_reflection"].includes(nextAction);
  const canSubmitReflection = nextAction === "submit_spoken_reflection" && !blocked && !completed && state.canComment !== false;
  const canSubmit = canSubmitByAction && !blocked && !completed && state.canComment !== false;
  return {
    phase: phaseFor(status, submitted),
    status: status || "not_started",
    evaluationStatus: status,
    nextStep,
    nextAction,
    submitted,
    analysisAvailable: ANALYSIS_STATUSES.has(status),
    waitingForFeedback: nextAction === "wait_for_feedback",
    requiresRevision: nextAction === "submit_revision" || nextAction === "submit_revision_and_reflection",
    requiresReflection: nextAction === "submit_spoken_reflection",
    completed,
    canSubmit,
    canSubmitReflection,
    canReviewFeedback: ANALYSIS_STATUSES.has(status),
    finalPassingScore: flowPolicy.finalPassingScore,
    finalStage: flowPolicy.finalStage,
    reflectionGateEnabled: flowPolicy.reflectionGateEnabled,
    settlementAfterReflection: flowPolicy.settlementAfterReflection,
    completionStep: flowPolicy.completionStep,
    reflectionStep: flowPolicy.reflectionStep,
  };
}

function cardField(card = {}, ...keys) {
  for (const key of keys) {
    const value = cleanString(card[key]);
    if (value) return value;
  }
  return "";
}

function growthSubmissionStageForCard(card = {}, input = {}) {
  const explicit = cleanString(input.stage || input.submissionStage || input.submissionKind).toLowerCase();
  if (["final", "rewrite", "revision", "resubmission"].includes(explicit)) return "final";
  if (["draft", "first_draft", "initial"].includes(explicit)) return "draft";
  const status = normalizeGrowthEvaluationStatus(cardField(card, "learningGrowthEvaluationStatus", "learning_growth_evaluation_status"));
  if (["draft_feedback", "needs_revision", "review_required", "pending_review"].includes(status)) return "final";
  return "draft";
}

module.exports = {
  growthNextActionForTaskModel,
  growthNextStepForStage,
  growthSubmissionStageForCard,
  normalizeGrowthEvaluationStatus,
  normalizeGrowthNextStep,
  normalizeGrowthSubmissionStage,
  projectGrowthInteractionState,
};
