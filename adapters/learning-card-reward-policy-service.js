"use strict";

const DEFAULT_MIN_CARD_COINS = 40;
const DEFAULT_MAX_CARD_COINS = 100;
const DEFAULT_ACCURACY_BONUS_MAX = 30;
const DEFAULT_TIMELINESS_BONUS_MAX = 15;
const DEFAULT_INTERACTION_BONUS_MAX = 15;
const DEFAULT_REWARD_POLICY_VERSION = "learning-card-reward-v1";

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clampNumber(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

function clampInteger(value, min, max) {
  return Math.round(clampNumber(value, min, max));
}

function percentToCoinAmount(percent, maxCoins) {
  const safeMax = positiveInteger(maxCoins, DEFAULT_MAX_CARD_COINS);
  return Math.round(safeMax * clampNumber(percent, 0, 100) / 100);
}

function positiveInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.round(parsed));
}

function normalizeLearningCardRewardPolicy(input = {}) {
  const policy = input && typeof input === "object" ? input : {};
  const maxCoins = positiveInteger(
    policy.maxCoins ?? policy.rewardCapCoins ?? policy.reward_cap_coins ?? policy.capCoins,
    DEFAULT_MAX_CARD_COINS,
  );
  const minCoins = Math.min(maxCoins, positiveInteger(policy.minCoins, DEFAULT_MIN_CARD_COINS));
  const accuracyBonusMax = positiveInteger(policy.accuracyBonusMax, DEFAULT_ACCURACY_BONUS_MAX);
  const timelinessBonusMax = positiveInteger(policy.timelinessBonusMax, DEFAULT_TIMELINESS_BONUS_MAX);
  const interactionBonusMax = positiveInteger(policy.interactionBonusMax, DEFAULT_INTERACTION_BONUS_MAX);
  return {
    version: cleanString(policy.version) || DEFAULT_REWARD_POLICY_VERSION,
    maxCoins,
    rewardCapCoins: maxCoins,
    minCoins,
    accuracyBonusMax,
    timelinessBonusMax,
    interactionBonusMax,
    currency: "learning_coin",
  };
}

function scoreFromEvaluation(input = {}) {
  const evaluation = input.evaluation || input;
  const direct = Number(input.score ?? evaluation.score);
  if (Number.isFinite(direct)) return clampNumber(direct, 0, 100);
  const correct = Number(input.correctCount ?? evaluation.correctCount);
  const total = Number(input.total ?? evaluation.total);
  if (Number.isFinite(correct) && Number.isFinite(total) && total > 0) {
    return clampNumber((correct / total) * 100, 0, 100);
  }
  return 0;
}

function dateMs(value, endOfDay = false) {
  const text = cleanString(value);
  if (!text) return null;
  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsed = dateOnly
    ? new Date(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`)
    : new Date(text);
  const time = parsed.getTime();
  return Number.isFinite(time) ? time : null;
}

function firstValue(...values) {
  for (const value of values) {
    const text = cleanString(value);
    if (text) return text;
  }
  return "";
}

function dueAtForReward(input = {}) {
  const evaluation = input.evaluation || {};
  const card = input.card || evaluation.card || {};
  return firstValue(
    input.dueAt,
    input.due_at,
    input.dueLocal,
    input.due_local,
    evaluation.dueAt,
    evaluation.due_at,
    card.dueAt,
    card.due_at,
    card.dueLocal,
    card.due_local,
    card.kanbanDueAt,
    card.kanban_due_at,
    card.learningTaskModel?.dueAt,
    card.learningTaskModel?.dueLocal,
    input.plannedDate,
    evaluation.plannedDate,
    card.plannedDate,
    card.learningTaskModel?.plannedDate,
  );
}

function completedAtForReward(input = {}) {
  const evaluation = input.evaluation || {};
  const card = input.card || evaluation.card || {};
  return firstValue(
    input.completedAt,
    input.completed_at,
    input.submittedAt,
    input.submitted_at,
    input.evaluatedAt,
    evaluation.completedAt,
    evaluation.completed_at,
    evaluation.submittedAt,
    evaluation.submitted_at,
    evaluation.evaluatedAt,
    card.completedAt,
    card.completed_at,
    card.updatedAt,
    card.updated_at,
  );
}

function timelinessComponent(input = {}, options = {}) {
  const maxCoins = positiveInteger(options.timelinessBonusMax, DEFAULT_TIMELINESS_BONUS_MAX);
  const dueText = dueAtForReward(input);
  const completedText = completedAtForReward(input);
  const due = dateMs(dueText, true);
  const completed = dateMs(completedText, false);
  if (!due || !completed) {
    return {
      coins: Math.round(maxCoins * 0.66),
      status: "not_measured",
      dueAt: dueText,
      completedAt: completedText,
    };
  }
  const lateMs = completed - due;
  if (lateMs <= 0) {
    return { coins: maxCoins, status: "on_time", dueAt: dueText, completedAt: completedText };
  }
  const lateHours = lateMs / (60 * 60 * 1000);
  if (lateHours <= 24) return { coins: Math.round(maxCoins * 0.6), status: "grace_late", dueAt: dueText, completedAt: completedText };
  if (lateHours <= 72) return { coins: Math.round(maxCoins * 0.35), status: "late", dueAt: dueText, completedAt: completedText };
  return { coins: Math.round(maxCoins * 0.15), status: "very_late", dueAt: dueText, completedAt: completedText };
}

function explicitInteractionScore(input = {}) {
  const evaluation = input.evaluation || {};
  const raw = input.interactionQualityScore
    ?? input.interactionScore
    ?? evaluation.interactionQualityScore
    ?? evaluation.interactionScore
    ?? evaluation.reward?.interactionQualityScore;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return parsed <= 1 ? clampNumber(parsed, 0, 1) : clampNumber(parsed / 100, 0, 1);
}

function interactionComponent(input = {}, options = {}) {
  const maxCoins = positiveInteger(options.interactionBonusMax, DEFAULT_INTERACTION_BONUS_MAX);
  const explicit = explicitInteractionScore(input);
  if (explicit !== null) {
    return { coins: Math.round(maxCoins * explicit), status: "measured", indicators: ["explicit_score"] };
  }

  const evaluation = input.evaluation || {};
  const card = input.card || evaluation.card || {};
  const sections = evaluation.feedbackSections || {};
  const indicators = [];
  const previousStatus = cleanString(card.learningGrowthEvaluationStatus || card.learning_growth_evaluation_status).toLowerCase();
  const stage = cleanString(input.stage || evaluation.stage).toLowerCase();
  let score = 0.35;

  if (stage === "final" && ["draft_feedback", "needs_revision", "review_required", "pending_review"].includes(previousStatus)) {
    score += 0.4;
    indicators.push("revised_after_feedback");
  }
  if (asArray(sections.sentenceFeedback).length) {
    score += 0.15;
    indicators.push("sentence_feedback_used");
  }
  if (asArray(sections.rewriteChecklist).length || asArray(evaluation.revisionRequirements).length) {
    score += 0.1;
    indicators.push("rubric_feedback_used");
  }
  if (/completed|model/i.test(cleanString(evaluation.aiFeedbackStatus || evaluation.feedbackMethod))) {
    score += 0.1;
    indicators.push("model_feedback_available");
  }
  if (asArray(input.interactionEvidence || evaluation.interactionEvidence).length) {
    score += 0.15;
    indicators.push("interaction_evidence");
  }

  const normalized = clampNumber(score, 0, 1);
  return {
    coins: Math.round(maxCoins * normalized),
    status: indicators.length ? "evidence_based" : "default",
    indicators,
  };
}

function calculateLearningCardReward(input = {}, options = {}) {
  const policy = normalizeLearningCardRewardPolicy(options.rewardPolicy || options);
  const evaluation = input.evaluation || {};
  const passed = Boolean(input.passed ?? evaluation.passed);
  const minCoins = policy.minCoins;
  const maxCoins = policy.maxCoins;
  if (!passed) {
    return {
      eligible: false,
      coinAmount: 0,
      minCoins,
      maxCoins,
      breakdown: {
        baseCoins: 0,
        accuracyCoins: 0,
        timelinessCoins: 0,
        interactionCoins: 0,
        score: scoreFromEvaluation(input),
      },
    };
  }

  const score = scoreFromEvaluation(input);
  const baseWeight = clampNumber(policy.minCoins, 0, 100);
  const accuracyMax = policy.accuracyBonusMax;
  const accuracyWeight = Math.round((clampNumber(score, 70, 100) - 70) / 30 * accuracyMax);
  const timeliness = timelinessComponent(input, policy);
  const interaction = interactionComponent(input, policy);
  const timelinessWeight = clampNumber(timeliness.coins, 0, 100);
  const interactionWeight = clampNumber(interaction.coins, 0, 100);
  const totalWeight = clampNumber(baseWeight + accuracyWeight + timelinessWeight + interactionWeight, 0, 100);
  const minCoinAmount = percentToCoinAmount(baseWeight, maxCoins);
  const coinAmount = clampInteger(percentToCoinAmount(totalWeight, maxCoins), minCoinAmount, maxCoins);
  return {
    eligible: true,
    coinAmount,
    minCoins: minCoinAmount,
    maxCoins,
    breakdown: {
      baseCoins: percentToCoinAmount(baseWeight, maxCoins),
      accuracyCoins: percentToCoinAmount(accuracyWeight, maxCoins),
      timelinessCoins: percentToCoinAmount(timelinessWeight, maxCoins),
      interactionCoins: percentToCoinAmount(interactionWeight, maxCoins),
      baseWeightPercent: baseWeight,
      accuracyWeightPercent: accuracyWeight,
      timelinessWeightPercent: timelinessWeight,
      interactionWeightPercent: interactionWeight,
      totalWeightPercent: totalWeight,
      score: Math.round(score),
      timelinessStatus: timeliness.status,
      interactionStatus: interaction.status,
      interactionIndicators: interaction.indicators || [],
    },
  };
}

function clampLearningCardRewardAmount(value, options = {}) {
  const policy = normalizeLearningCardRewardPolicy(options.rewardPolicy || options);
  const maxCoins = policy.maxCoins;
  const minCoins = percentToCoinAmount(policy.minCoins, maxCoins);
  return clampInteger(value, minCoins, maxCoins);
}

module.exports = {
  DEFAULT_MAX_CARD_COINS,
  DEFAULT_MIN_CARD_COINS,
  calculateLearningCardReward,
  clampLearningCardRewardAmount,
  normalizeLearningCardRewardPolicy,
  dueAtForReward,
  scoreFromEvaluation,
  timelinessComponent,
  interactionComponent,
};
