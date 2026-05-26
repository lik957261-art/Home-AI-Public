"use strict";

const crypto = require("node:crypto");
const {
  CARD_ROLES,
  defaultRewardCoinsForRole,
  normalizeCardRole,
} = require("./learning-growth-card-role-service");
const {
  assertNoPrivateLearningPayload,
  compactLearningSummary,
} = require("./learning-record-privacy-service");

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function digestText(value) {
  const text = cleanString(value);
  if (!text) return "";
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function createNotFound(message) {
  const err = new Error(message);
  err.status = 404;
  return err;
}

function ensureTeachingRole(task = {}) {
  const role = normalizeCardRole(task.cardRole || "", CARD_ROLES.STAGE_ASSESSMENT);
  if (role === CARD_ROLES.STAGE_ASSESSMENT) {
    const err = new Error("Stage assessment cards must use the formal Growth submission flow");
    err.status = 409;
    throw err;
  }
  return role;
}

function latestSession(repository, taskCardId) {
  const rows = typeof repository.listInteractionSessions === "function"
    ? repository.listInteractionSessions({ taskCardId, limit: 10 })
    : [];
  return rows.find((row) => row.status === "active" || row.status === "completed") || rows[0] || null;
}

function createLearningGrowthTeachingCheckService(options = {}) {
  const learningProgramService = options.learningProgramService;
  const repository = options.repository || learningProgramService?.repository || null;
  const experienceSignalService = options.experienceSignalService || null;
  const now = typeof options.now === "function" ? options.now : () => new Date();
  if (!learningProgramService || typeof learningProgramService.recordEvaluation !== "function" || typeof learningProgramService.settleEvaluationReward !== "function") {
    throw new Error("learning growth teaching check service requires learningProgramService");
  }
  if (!repository || typeof repository.getTaskCard !== "function" || typeof repository.upsertTaskCard !== "function") {
    throw new Error("learning growth teaching check service requires repository");
  }

  function complete(input = {}) {
    assertNoPrivateLearningPayload(Object.assign({}, input, {
      response: undefined,
      guidedPracticeText: undefined,
      quickCheckText: undefined,
    }), "learning growth teaching check");
    const taskCardId = cleanString(input.taskCardId || input.cardId);
    const task = repository.getTaskCard(taskCardId);
    if (!task) throw createNotFound("Learning growth card not found");
    const role = ensureTeachingRole(task);
    const at = now().toISOString();
    const responseText = cleanString(input.quickCheckText || input.response || input.summary || input.guidedPracticeText);
    const responseDigest = digestText(responseText);
    const rewardCoins = Number(task.configuredRewardCoins || task.rewardPolicy?.maxCoins || defaultRewardCoinsForRole(role)) || defaultRewardCoinsForRole(role);
    const existingSession = latestSession(repository, task.taskCardId);
    const session = existingSession || learningProgramService.startTaskSession(task.taskCardId, {
      actor: cleanString(input.actorPrincipalId || input.principalId || "executor"),
      summary: "Started teaching card lightweight check.",
    });
    const evidenceRef = `teaching-check:${task.taskCardId}:${responseDigest || "ack"}`;
    const evaluationId = cleanString(input.evaluationId) || `lgtchk_${crypto.createHash("sha256").update(task.taskCardId).digest("hex").slice(0, 18)}`;
    const evaluation = learningProgramService.recordEvaluation(session.sessionId, {
      evaluationId,
      score: 100,
      passed: true,
      confidence: 0.82,
      summary: compactLearningSummary(input.completionSummary || input.summary || "Teaching card completed with guided practice and quick check.", 500),
      verificationMethod: "deterministic_growth_task_template",
      verificationSummary: "Lightweight teaching check uses summary-only completion evidence.",
      evidenceRefs: [evidenceRef],
      sourceBasisRefs: asArray(task.sourceBasisRefs),
      completionDecision: "complete_teaching_card",
      completionPolicy: Object.assign({}, task.completionPolicy || {}, {
        cardRole: role,
        masteryEvidenceWeight: Number(task.masteryEvidenceWeight || 0.12),
      }),
      rewardPolicy: Object.assign({}, task.rewardPolicy || {}, {
        coinAmount: rewardCoins,
        maxCoins: rewardCoins,
        rewardCapCoins: rewardCoins,
        reason: "teaching_card_completion",
      }),
      skillResults: asArray(task.skillIds).map((skillId) => ({
        skillId,
        status: "observed",
        score: 100,
        confidence: Math.max(0.1, Math.min(0.5, Number(task.masteryEvidenceWeight || 0.12) + 0.18)),
        summary: "Low-weight teaching-card completion evidence.",
      })),
    });
    const settlement = learningProgramService.settleEvaluationReward(evaluation.evaluationId, {
      coinAmount: rewardCoins,
      idempotencyKey: `learning-growth:teaching-check:${task.taskCardId}:reward`,
      principalId: cleanString(input.actorPrincipalId || input.principalId || "executor"),
      reason: "Teaching card completion reward",
    });
    const experienceSummary = Object.assign({}, task.experienceSummary || {}, {
      lastCompletionAt: at,
      lastSignalType: "completed",
      lastResponseDigest: responseDigest,
      quickCheckChars: responseText.replace(/\s+/g, "").length,
    });
    const updatedTask = repository.upsertTaskCard(Object.assign({}, task, {
      status: "completed",
      completedAt: at,
      learningGrowthEvaluationId: evaluation.evaluationId,
      learningGrowthEvaluationStatus: evaluation.status,
      learningGrowthRewardStatus: settlement.status,
      learningGrowthRewardCoins: settlement.coinAmount,
      experienceSummary,
    }));
    if (experienceSignalService && typeof experienceSignalService.record === "function") {
      try {
        experienceSignalService.record({
          taskCardId: task.taskCardId,
          signalType: "completed",
          summary: "Teaching card completed.",
          actorPrincipalId: input.actorPrincipalId || input.principalId,
        });
      } catch (_) {
        // Completion should not fail because the optional experience trail failed.
      }
    }
    return {
      ok: true,
      taskCard: updatedTask,
      evaluation,
      rewardSettlement: settlement,
      experienceSummary,
    };
  }

  return {
    complete,
  };
}

module.exports = {
  createLearningGrowthTeachingCheckService,
};
