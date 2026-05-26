"use strict";

const crypto = require("node:crypto");
const { createLearningEvaluationVerifierService } = require("./learning-evaluation-verifier-service");
const { createLearningParentReviewRequestService } = require("./learning-parent-review-request-service");
const {
  assertNoPrivateLearningPayload,
  clampLearningConfidence,
  clampLearningScore,
  compactLearningSummary,
} = require("./learning-record-privacy-service");

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function createNotFound(message) {
  const err = new Error(message);
  err.status = 404;
  return err;
}

function normalizeSkillResults(skillResults, task) {
  const rows = asArray(skillResults).length
    ? asArray(skillResults)
    : asArray(task.skillIds).map((skillId) => ({ skillId }));
  return rows.map((row) => ({
    skillId: cleanString(row.skillId) || "general",
    status: cleanString(row.status) || "observed",
    score: clampLearningScore(row.score, 0),
    confidence: clampLearningConfidence(row.confidence, 0.7),
    summary: compactLearningSummary(row.summary || "", 240),
  }));
}

function rewardPolicyForEvaluation(input = {}) {
  const score = clampLearningScore(input.score, 0);
  const confidence = clampLearningConfidence(input.confidence, 0.7);
  const passed = input.passed == null ? score >= 70 : Boolean(input.passed);
  const verification = input.verification || {};
  const rewardEligible = passed && verification.status === "verified" && confidence >= 0.75 && !verification.parentReviewRequired;
  return {
    rewardDomain: "learning-growth",
    coinLedgerWrite: "disabled_in_evaluation_service",
    eligibleForRewardReview: rewardEligible,
    requiresRewardService: true,
    verificationStatus: verification.status || "unknown",
    reason: rewardEligible ? "evaluation_verified_summary_only" : (passed ? "parent_review_required_before_reward" : "repair_required_before_reward"),
  };
}

function createLearningEvaluationService(options = {}) {
  const repository = options.repository;
  const now = typeof options.now === "function" ? options.now : () => new Date();
  if (!repository || typeof repository.saveEvaluation !== "function") {
    throw new Error("learning evaluation service requires repository");
  }
  const verifier = options.verifier || createLearningEvaluationVerifierService();
  const reviewRequestService = options.reviewRequestService
    || (typeof repository.saveReviewRequest === "function" ? createLearningParentReviewRequestService({ repository }) : null);

  function recordEvaluation(sessionId, input = {}) {
    assertNoPrivateLearningPayload(input, "learning evaluation");
    const session = repository.getInteractionSession(sessionId);
    if (!session) throw createNotFound("Learning interaction session not found");
    const task = repository.getTaskCard(session.taskCardId);
    if (!task) throw createNotFound("Learning task card not found");
    const score = clampLearningScore(input.score, 0);
    const confidence = clampLearningConfidence(input.confidence, 0.7);
    const passed = input.passed == null ? score >= 70 : Boolean(input.passed);
    const sourceBasisRefs = asArray(input.sourceBasisRefs).length ? asArray(input.sourceBasisRefs) : asArray(task.sourceBasisRefs);
    const verification = verifier.verifyEvaluation({
      task,
      session,
      evaluation: Object.assign({}, input, {
        score,
        confidence,
        passed,
        sourceBasisRefs,
      }),
    });
    const status = cleanString(input.status)
      || (verification.parentReviewRequired ? "needs_review" : (passed ? "passed" : "needs_repair"));
    const at = now().toISOString();
    const rewardPolicy = Object.assign(
      {},
      input.rewardPolicy && typeof input.rewardPolicy === "object" ? input.rewardPolicy : {},
      rewardPolicyForEvaluation({ score, confidence, passed, verification }),
    );
    const evaluation = repository.saveEvaluation({
      evaluationId: cleanString(input.evaluationId) || createId("leval"),
      taskCardId: task.taskCardId,
      sessionId: session.sessionId,
      programId: task.programId,
      learnerId: task.learnerId,
      workspaceId: task.workspaceId,
      status,
      score,
      passed,
      confidence,
      summary: compactLearningSummary(input.summary || "", 700),
      revisionRequirements: Array.isArray(input.revisionRequirements) ? input.revisionRequirements.map((item) => compactLearningSummary(item, 800)).filter(Boolean) : [],
      feedbackSections: input.feedbackSections && typeof input.feedbackSections === "object" ? input.feedbackSections : null,
      feedbackMethod: cleanString(input.feedbackMethod || input.verificationMethod),
      aiFeedbackStatus: cleanString(input.aiFeedbackStatus),
      nextStep: cleanString(input.nextStep),
      skillResults: normalizeSkillResults(input.skillResults, task),
      completionDecision: cleanString(input.completionDecision),
      completionPolicy: input.completionPolicy && typeof input.completionPolicy === "object" ? input.completionPolicy : null,
      remainingWeaknesses: Array.isArray(input.remainingWeaknesses) ? input.remainingWeaknesses.map((item) => compactLearningSummary(item, 800)).filter(Boolean) : [],
      finalPassingScore: Number(input.finalPassingScore || input.passingScore || 80) || 80,
      passingScore: Number(input.passingScore || input.finalPassingScore || 80) || 80,
      reflectionPolicy: input.reflectionPolicy && typeof input.reflectionPolicy === "object" ? input.reflectionPolicy : null,
      rewardPolicy,
      reward: input.reward && typeof input.reward === "object" ? input.reward : null,
      verification,
      sourceBasisRefs,
      createdAt: at,
    });
    let reviewRequest = null;
    if (verification.parentReviewRequired && reviewRequestService) {
      reviewRequest = reviewRequestService.createRequest({
        learnerId: task.learnerId,
        workspaceId: task.workspaceId,
        programId: task.programId,
        requestType: "evaluation_review",
        resourceType: "evaluation",
        resourceId: evaluation.evaluationId,
        idempotencyKey: `evaluation:${evaluation.evaluationId}:verification`,
        status: "pending",
        reason: "evaluation_verification_review",
        summary: compactLearningSummary(input.summary || "Evaluation needs parent review.", 700),
        riskFlags: verification.riskFlags,
        allowedActions: ["approve", "reject", "return_for_revision"],
        sourceBasisRefs,
      });
    }
    if (session.status !== "completed") {
      repository.saveInteractionSession(Object.assign({}, session, {
        status: verification.parentReviewRequired ? "needs_review" : (passed ? "completed" : "needs_review"),
        currentStep: verification.parentReviewRequired ? "ai_evaluation" : (passed ? "reward_settlement" : "mistake_explanation"),
        summary: compactLearningSummary(input.summary || session.summary || "", 600),
        updatedAt: at,
      }));
    }
    return reviewRequest ? Object.assign({}, evaluation, { reviewRequest }) : evaluation;
  }

  function list(filters = {}) {
    return repository.listEvaluations(filters);
  }

  function get(evaluationId) {
    return repository.getEvaluation(evaluationId);
  }

  return {
    get,
    list,
    recordEvaluation,
  };
}

module.exports = {
  createLearningEvaluationService,
  normalizeSkillResults,
  rewardPolicyForEvaluation,
};
