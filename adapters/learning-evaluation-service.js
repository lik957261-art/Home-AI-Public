"use strict";

const crypto = require("node:crypto");
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
  return {
    rewardDomain: "learning-growth",
    coinLedgerWrite: "disabled_in_evaluation_service",
    eligibleForRewardReview: passed && confidence >= 0.75,
    requiresRewardService: true,
    reason: passed ? "evaluation_recorded_summary_only" : "repair_required_before_reward",
  };
}

function createLearningEvaluationService(options = {}) {
  const repository = options.repository;
  const now = typeof options.now === "function" ? options.now : () => new Date();
  if (!repository || typeof repository.saveEvaluation !== "function") {
    throw new Error("learning evaluation service requires repository");
  }

  function recordEvaluation(sessionId, input = {}) {
    assertNoPrivateLearningPayload(input, "learning evaluation");
    const session = repository.getInteractionSession(sessionId);
    if (!session) throw createNotFound("Learning interaction session not found");
    const task = repository.getTaskCard(session.taskCardId);
    if (!task) throw createNotFound("Learning task card not found");
    const score = clampLearningScore(input.score, 0);
    const confidence = clampLearningConfidence(input.confidence, 0.7);
    const passed = input.passed == null ? score >= 70 : Boolean(input.passed);
    const status = cleanString(input.status) || (confidence < 0.6 ? "needs_review" : (passed ? "passed" : "needs_repair"));
    const at = now().toISOString();
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
      skillResults: normalizeSkillResults(input.skillResults, task),
      rewardPolicy: rewardPolicyForEvaluation({ score, confidence, passed }),
      sourceBasisRefs: asArray(input.sourceBasisRefs).length ? asArray(input.sourceBasisRefs) : asArray(task.sourceBasisRefs),
      createdAt: at,
    });
    if (session.status !== "completed") {
      repository.saveInteractionSession(Object.assign({}, session, {
        status: passed ? "completed" : "needs_review",
        currentStep: passed ? "reward_settlement" : "mistake_explanation",
        summary: compactLearningSummary(input.summary || session.summary || "", 600),
        updatedAt: at,
      }));
    }
    return evaluation;
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
