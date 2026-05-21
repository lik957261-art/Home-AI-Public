"use strict";

const assert = require("node:assert/strict");
const {
  growthNextActionForTaskModel,
  growthNextStepForStage,
  growthSubmissionStageForCard,
  normalizeGrowthEvaluationStatus,
  normalizeGrowthNextStep,
  normalizeGrowthSubmissionStage,
  projectGrowthInteractionState,
} = require("../adapters/learning-growth-task-interaction-state-service");

function run() {
  const model = {
    submissionContract: {
      firstSubmissionKind: "writing_draft",
      revisionSubmissionKind: "writing_revision",
    },
    evaluationContract: {
      finalPassingScore: 80,
      passingScore: 80,
      finalStage: "final",
      requiresSpokenReflection: true,
      settlementAfterReflection: true,
    },
    completionPolicy: {
      completeAfterStep: "reward_settlement",
      requiresSpokenReflection: true,
      settlementAfterReflection: true,
      reflectionStep: "learner_spoken_reflection",
    },
  };

  assert.equal(normalizeGrowthEvaluationStatus("done"), "completed");
  assert.equal(normalizeGrowthEvaluationStatus("feedback_ready"), "draft_feedback");
  assert.equal(normalizeGrowthEvaluationStatus("revision_required"), "needs_revision");
  assert.equal(normalizeGrowthEvaluationStatus("reflection_retry_required"), "reflection_required");
  assert.equal(normalizeGrowthNextStep("", { status: "draft_feedback" }), "rewrite_and_reflect");
  assert.equal(normalizeGrowthNextStep("", { status: "needs_revision" }), "revise_and_resubmit");
  assert.equal(normalizeGrowthNextStep("", { status: "reflection_required" }), "spoken_reflection_required");
  assert.equal(normalizeGrowthNextStep("", { submitted: true }), "pending_evaluation");
  assert.equal(normalizeGrowthSubmissionStage("first_draft"), "draft");
  assert.equal(normalizeGrowthSubmissionStage("resubmission"), "final");
  assert.equal(growthNextStepForStage("draft", false), "rewrite_and_reflect");
  assert.equal(growthNextStepForStage("final", false), "revise_and_resubmit");
  assert.equal(growthNextStepForStage("final", true), "completed");

  assert.equal(growthNextActionForTaskModel(model, {}), "submit_first_attempt");
  assert.equal(growthNextActionForTaskModel(model, { evaluationStatus: "pending" }), "wait_for_feedback");
  assert.equal(growthNextActionForTaskModel(model, { evaluationStatus: "draft_feedback" }), "submit_revision_and_reflection");
  assert.equal(growthNextActionForTaskModel(model, { nextStep: "revise_and_resubmit" }), "submit_revision");
  assert.equal(growthNextActionForTaskModel(model, { evaluationStatus: "reflection_required" }), "submit_spoken_reflection");
  assert.equal(growthNextActionForTaskModel(model, { status: "completed" }), "review_feedback");

  assert.equal(growthSubmissionStageForCard({}, {}), "draft");
  assert.equal(growthSubmissionStageForCard({ learningGrowthEvaluationStatus: "draft_feedback" }, {}), "final");
  assert.equal(growthSubmissionStageForCard({ learning_growth_evaluation_status: "needs_revision" }, {}), "final");
  assert.equal(growthSubmissionStageForCard({}, { stage: "draft" }), "draft");
  assert.equal(growthSubmissionStageForCard({}, { submissionKind: "revision" }), "final");

  const notStarted = projectGrowthInteractionState(model, { kanbanStatus: "ready" });
  assert.equal(notStarted.phase, "not_started");
  assert.equal(notStarted.nextAction, "submit_first_attempt");
  assert.equal(notStarted.canSubmit, true);
  assert.equal(notStarted.analysisAvailable, false);
  assert.equal(notStarted.finalPassingScore, 80);
  assert.equal(notStarted.finalStage, "final");
  assert.equal(notStarted.reflectionGateEnabled, true);
  assert.equal(notStarted.settlementAfterReflection, true);
  assert.equal(notStarted.completionStep, "reward_settlement");
  assert.equal(notStarted.reflectionStep, "learner_spoken_reflection");

  const legacyModelProjection = projectGrowthInteractionState({ submissionContract: { firstSubmissionKind: "learner_attempt" } }, {});
  assert.equal(legacyModelProjection.reflectionGateEnabled, true);
  assert.equal(legacyModelProjection.settlementAfterReflection, true);
  assert.equal(legacyModelProjection.finalPassingScore, 80);

  const pending = projectGrowthInteractionState(model, {
    submitted: true,
    evaluationStatus: "pending",
    kanbanStatus: "ready",
  });
  assert.equal(pending.phase, "awaiting_feedback");
  assert.equal(pending.nextStep, "pending_evaluation");
  assert.equal(pending.nextAction, "wait_for_feedback");
  assert.equal(pending.canSubmit, false);
  assert.equal(pending.waitingForFeedback, true);

  const draftFeedback = projectGrowthInteractionState(model, {
    evaluationStatus: "draft_feedback",
    nextStep: "rewrite_and_reflect",
    kanbanStatus: "ready",
  });
  assert.equal(draftFeedback.phase, "draft_feedback");
  assert.equal(draftFeedback.nextAction, "submit_revision_and_reflection");
  assert.equal(draftFeedback.canSubmit, true);
  assert.equal(draftFeedback.requiresRevision, true);
  assert.equal(draftFeedback.analysisAvailable, true);

  const blocked = projectGrowthInteractionState(model, {
    evaluationStatus: "draft_feedback",
    kanbanStatus: "blocked",
  });
  assert.equal(blocked.nextAction, "submit_revision_and_reflection");
  assert.equal(blocked.canSubmit, false);

  const reflectionRequired = projectGrowthInteractionState(model, {
    evaluationStatus: "reflection_required",
    nextStep: "spoken_reflection_required",
    kanbanStatus: "ready",
  });
  assert.equal(reflectionRequired.phase, "reflection_required");
  assert.equal(reflectionRequired.nextAction, "submit_spoken_reflection");
  assert.equal(reflectionRequired.canSubmit, false);
  assert.equal(reflectionRequired.canSubmitReflection, true);
  assert.equal(reflectionRequired.requiresReflection, true);
  assert.equal(reflectionRequired.analysisAvailable, true);

  const completed = projectGrowthInteractionState(model, {
    evaluationStatus: "completed",
    kanbanStatus: "done",
  });
  assert.equal(completed.phase, "completed");
  assert.equal(completed.nextAction, "review_feedback");
  assert.equal(completed.canSubmit, false);
  assert.equal(completed.canReviewFeedback, true);
}

run();
console.log("learning growth task interaction state service tests passed");
