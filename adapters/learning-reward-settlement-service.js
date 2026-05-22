"use strict";

const crypto = require("node:crypto");
const {
  assertNoPrivateLearningPayload,
  compactLearningSummary,
} = require("./learning-record-privacy-service");
const {
  calculateLearningCardReward,
  clampLearningCardRewardAmount,
  normalizeLearningCardRewardPolicy,
} = require("./learning-card-reward-policy-service");
const {
  applyLearningGrowthRewardDecayPolicy,
} = require("./learning-growth-reward-decay-service");

const DEFAULT_AUTO_REWARD_LIMIT = 100;
const DEFAULT_REWARD_REASON = "Learning growth evaluation reward";

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function positiveInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.round(parsed));
}

function rewardAmountForEvaluation(evaluation = {}, input = {}) {
  const card = input.card || {};
  const rewardPolicy = normalizeLearningCardRewardPolicy(input.rewardPolicy || card.rewardPolicy || evaluation.rewardPolicy || { rewardCapCoins: card.rewardCapCoins });
  const explicit = positiveInteger(input.coinAmount || evaluation.rewardPolicy?.coinAmount || evaluation.rewardPolicy?.suggestedCoinAmount, 0);
  if (explicit) return clampLearningCardRewardAmount(explicit, rewardPolicy);
  return calculateLearningCardReward({
    evaluation,
    score: evaluation.score,
    passed: Boolean(evaluation.passed),
    submittedAt: input.submittedAt,
    completedAt: input.completedAt,
    evaluatedAt: evaluation.evaluatedAt || evaluation.createdAt,
    dueAt: input.dueAt || evaluation.dueAt,
    interactionQualityScore: input.interactionQualityScore,
    interactionEvidence: input.interactionEvidence,
  }, rewardPolicy).coinAmount;
}

function rewardSettlementKey(evaluationId) {
  return `learning-growth:evaluation:${cleanString(evaluationId)}:reward`;
}

function hasApprovedReview(repository, filters = {}) {
  if (!repository || typeof repository.listReviewRequests !== "function") return false;
  return repository.listReviewRequests(Object.assign({}, filters, { status: "approved", limit: 1 })).length > 0;
}

function firstPendingReview(repository, filters = {}) {
  if (!repository || typeof repository.listReviewRequests !== "function") return null;
  return repository.listReviewRequests(Object.assign({}, filters, { status: "pending", limit: 1 }))[0] || null;
}

function verificationAllowsReward(repository, evaluation = {}) {
  const verification = evaluation.verification || {};
  if (["blocked", "failed", "error"].includes(cleanString(verification.status))) return false;
  if (verification.status === "verified" && !verification.parentReviewRequired) return true;
  return hasApprovedReview(repository, {
    requestType: "evaluation_review",
    resourceType: "evaluation",
    resourceId: evaluation.evaluationId,
  });
}

function createLearningRewardSettlementService(options = {}) {
  const repository = options.repository;
  const learningCoinService = options.learningCoinService || null;
  const parentReviewRequestService = options.parentReviewRequestService || null;
  const maxAutoCoins = positiveInteger(options.maxAutoCoins, DEFAULT_AUTO_REWARD_LIMIT);
  const now = typeof options.now === "function" ? options.now : () => new Date();

  if (!repository || typeof repository.saveRewardSettlement !== "function") {
    throw new Error("learning reward settlement service requires repository");
  }

  function baseSettlement(evaluation, input = {}) {
    const card = repository.getTaskCard ? repository.getTaskCard(evaluation.taskCardId) : null;
    const rewardPolicy = normalizeLearningCardRewardPolicy(input.rewardPolicy || card?.rewardPolicy || evaluation.rewardPolicy || { rewardCapCoins: card?.rewardCapCoins });
    const rewardDecayResult = applyLearningGrowthRewardDecayPolicy(card || {}, rewardPolicy, { now: now() });
    const effectiveRewardPolicy = rewardDecayResult.rewardPolicy;
    const coinAmount = rewardAmountForEvaluation(evaluation, Object.assign({}, input, { card, rewardPolicy: effectiveRewardPolicy }));
    const idempotencyKey = cleanString(input.idempotencyKey) || rewardSettlementKey(evaluation.evaluationId);
    const existingForEvaluation = repository.listRewardSettlements({ evaluationId: evaluation.evaluationId, limit: 1 })[0] || null;
    if (existingForEvaluation) return existingForEvaluation;
    const existing = repository.listRewardSettlements({ idempotencyKey, limit: 1 })[0] || null;
    if (existing) return existing;
    const at = now().toISOString();
    return repository.saveRewardSettlement({
      rewardSettlementId: cleanString(input.rewardSettlementId) || createId("lrwd"),
      learnerId: evaluation.learnerId,
      workspaceId: evaluation.workspaceId,
      programId: evaluation.programId,
      taskCardId: evaluation.taskCardId,
      sessionId: evaluation.sessionId,
      evaluationId: evaluation.evaluationId,
      status: "ready",
      coinAmount,
      rewardDecay: rewardDecayResult.decay,
      reason: compactLearningSummary(input.reason || evaluation.rewardPolicy?.reason || DEFAULT_REWARD_REASON, 200),
      sourceType: "learning-growth-evaluation",
      sourceId: evaluation.evaluationId,
      idempotencyKey,
      reviewRequestId: "",
      ledgerEntry: null,
      createdAt: at,
      updatedAt: at,
      settledAt: "",
    });
  }

  function ensureReviewRequest(settlement, evaluation, reason, riskFlags) {
    const pendingEvaluationReview = firstPendingReview(repository, {
      requestType: "evaluation_review",
      resourceType: "evaluation",
      resourceId: evaluation.evaluationId,
    });
    if (pendingEvaluationReview) return pendingEvaluationReview;
    const pendingSettlementReview = firstPendingReview(repository, {
      requestType: "reward_settlement_review",
      resourceType: "reward_settlement",
      resourceId: settlement.rewardSettlementId,
    });
    if (pendingSettlementReview) return pendingSettlementReview;
    if (!parentReviewRequestService || typeof parentReviewRequestService.createRequest !== "function") return null;
    return parentReviewRequestService.createRequest({
      learnerId: settlement.learnerId,
      workspaceId: settlement.workspaceId,
      programId: settlement.programId,
      requestType: "reward_settlement_review",
      resourceType: "reward_settlement",
      resourceId: settlement.rewardSettlementId,
      idempotencyKey: `reward-settlement:${settlement.rewardSettlementId}:review`,
      status: "pending",
      reason,
      summary: compactLearningSummary(`${settlement.coinAmount} coins require parent review before settlement.`, 240),
      riskFlags: asArray(riskFlags),
      allowedActions: ["approve", "reject", "return_for_revision"],
      sourceBasisRefs: asArray(evaluation.sourceBasisRefs),
    });
  }

  function saveBlocked(settlement, reason, reviewRequest = null) {
    return repository.saveRewardSettlement(Object.assign({}, settlement, {
      status: "pending_review",
      reason,
      reviewRequestId: reviewRequest?.reviewRequestId || settlement.reviewRequestId || "",
      updatedAt: now().toISOString(),
    }));
  }

  function requireCoinService() {
    if (!learningCoinService || typeof learningCoinService.grantCoins !== "function") {
      const err = new Error("Learning coin service is required for reward settlement");
      err.status = 503;
      throw err;
    }
    return learningCoinService;
  }

  function settleEvaluationReward(evaluationId, input = {}) {
    assertNoPrivateLearningPayload(input, "learning reward settlement");
    const evaluation = repository.getEvaluation(evaluationId);
    if (!evaluation) {
      const err = new Error("Learning evaluation not found");
      err.status = 404;
      throw err;
    }
    const settlement = baseSettlement(evaluation, input);
    if (settlement.status === "settled") return Object.assign({}, settlement, { duplicate: true });
    if (!evaluation.passed) {
      return repository.saveRewardSettlement(Object.assign({}, settlement, {
        status: "blocked",
        reason: "repair_required_before_reward",
        updatedAt: now().toISOString(),
      }));
    }
    if (!verificationAllowsReward(repository, evaluation)) {
      if (["blocked", "failed", "error"].includes(cleanString(evaluation.verification?.status))) {
        return repository.saveRewardSettlement(Object.assign({}, settlement, {
          status: "blocked",
          reason: "verification_hard_failure_before_reward",
          updatedAt: now().toISOString(),
        }));
      }
      const review = ensureReviewRequest(settlement, evaluation, "evaluation_review_required_before_reward", evaluation.verification?.riskFlags || []);
      return saveBlocked(settlement, "evaluation_review_required_before_reward", review);
    }
    if (settlement.coinAmount > maxAutoCoins && !hasApprovedReview(repository, {
      requestType: "reward_settlement_review",
      resourceType: "reward_settlement",
      resourceId: settlement.rewardSettlementId,
    })) {
      const review = ensureReviewRequest(settlement, evaluation, "large_reward_review_required", [{ code: "large_reward", severity: "review" }]);
      return saveBlocked(settlement, "large_reward_review_required", review);
    }

    const coinResult = requireCoinService().grantCoins({
      studentId: settlement.learnerId,
      workspaceId: settlement.workspaceId,
      coinAmount: settlement.coinAmount,
      reason: input.reason || settlement.reason || DEFAULT_REWARD_REASON,
      sourceType: settlement.sourceType,
      sourceId: settlement.sourceId,
      idempotencyKey: settlement.idempotencyKey,
      createdByPrincipalId: cleanString(input.principalId || input.createdByPrincipalId) || "system",
      metadata: {
        programId: settlement.programId,
        taskCardId: settlement.taskCardId,
        sessionId: settlement.sessionId,
        evaluationId: settlement.evaluationId,
        verificationStatus: evaluation.verification?.status || "unknown",
        score: Number(evaluation.score || 0),
        confidence: Number(evaluation.confidence || 0),
        rewardDecay: settlement.rewardDecay || null,
      },
    });
    const at = now().toISOString();
    return repository.saveRewardSettlement(Object.assign({}, settlement, {
      status: "settled",
      ledgerEntry: coinResult.entry || null,
      updatedAt: at,
      settledAt: at,
    }));
  }

  function list(filters = {}) {
    return repository.listRewardSettlements(filters);
  }

  function get(rewardSettlementId) {
    return repository.getRewardSettlement(rewardSettlementId);
  }

  return {
    get,
    list,
    settleEvaluationReward,
  };
}

module.exports = {
  DEFAULT_AUTO_REWARD_LIMIT,
  createLearningRewardSettlementService,
  rewardAmountForEvaluation,
  rewardSettlementKey,
};
