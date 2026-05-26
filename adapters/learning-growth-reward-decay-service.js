"use strict";

const YELLOW_AFTER_HOURS = 48;
const RED_AFTER_HOURS = 72;
const YELLOW_DAILY_PENALTY_PERCENT = 5;
const RED_DAILY_PENALTY_PERCENT = 10;

function cleanString(value, limit = 1000) {
  const text = String(value ?? "").trim();
  const max = Math.max(1, Number(limit || 1000) || 1000);
  return text.length > max ? text.slice(0, max) : text;
}

function numberValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function positiveInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.round(parsed));
}

function parseTimeMs(value) {
  const text = cleanString(value);
  if (!text) return 0;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nowMsValue(now = null) {
  if (now instanceof Date) return Number.isFinite(now.getTime()) ? now.getTime() : Date.now();
  if (typeof now === "number") return Number.isFinite(now) ? now : Date.now();
  if (typeof now === "string") return parseTimeMs(now) || Date.now();
  return Date.now();
}

function rewardCapCoins(card = {}, rewardPolicy = {}) {
  return positiveInteger(
    rewardPolicy.maxCoins
      || rewardPolicy.rewardCapCoins
      || card.rewardCapCoins
      || card.rewardPolicy?.maxCoins
      || card.rewardPolicy?.rewardCapCoins,
    100,
  );
}

function openedAtForRewardDecay(card = {}) {
  return cleanString(
    card.openedAt
      || card.generatedAt
      || card.availableAt
      || card.unlockAt
      || card.learningGrowthUnlockAt
      || card.learningGrowthJitGeneration?.generatedAt
      || card.taskModel?.jitGeneration?.generatedAt
      || card.createdAt
      || card.plannedDate,
  );
}

function isEvergreenCard(card = {}) {
  const values = [
    card.sequenceMode,
    card.learningGrowthSequenceMode,
    card.learningGrowthJitGeneration?.sequenceMode,
    card.taskModel?.sequenceMode,
    card.taskModel?.jitGeneration?.sequenceMode,
  ].map((value) => cleanString(value).toLowerCase());
  if (values.includes("evergreen_jit") || values.includes("evergreen")) return true;
  const group = cleanString(card.sequenceGroupId || card.sequence_group_id).toLowerCase();
  return group.startsWith("evergreen:");
}

function isCompletedCard(card = {}) {
  const status = cleanString(card.status || card.executionStatus || card.nextAction || card.laneId).toLowerCase();
  return ["completed", "complete", "done", "closed", "archived", "completed_recent"].includes(status);
}

function startedPenaltyDays(ageHours, thresholdHours) {
  if (ageHours < thresholdHours) return 0;
  return Math.max(1, Math.floor((ageHours - thresholdHours) / 24) + 1);
}

function formatAgeLabel(ageHours) {
  if (!Number.isFinite(ageHours) || ageHours < 0) return "";
  if (ageHours < 48) return `${Math.floor(ageHours)}h`;
  const days = Math.floor(ageHours / 24);
  const hours = Math.floor(ageHours % 24);
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

function learningGrowthRewardDecayState(card = {}, options = {}) {
  const cap = rewardCapCoins(card, options.rewardPolicy || {});
  if (!isEvergreenCard(card)) {
    return {
      applies: false,
      severity: "none",
      rewardCapCoins: cap,
      effectiveRewardCapCoins: cap,
      penaltyCoins: 0,
      penaltyDays: 0,
      ageHours: 0,
      ageLabel: "",
    };
  }
  if (options.excludeCompleted !== false && isCompletedCard(card)) {
    return {
      applies: false,
      severity: "none",
      rewardCapCoins: cap,
      effectiveRewardCapCoins: cap,
      penaltyCoins: 0,
      penaltyDays: 0,
      ageHours: 0,
      ageLabel: "",
    };
  }
  const openedAt = openedAtForRewardDecay(card);
  const openedMs = parseTimeMs(openedAt);
  const currentMs = nowMsValue(options.now);
  if (!openedMs || currentMs <= openedMs) {
    return {
      applies: true,
      severity: "normal",
      openedAt,
      rewardCapCoins: cap,
      effectiveRewardCapCoins: cap,
      penaltyCoins: 0,
      penaltyDays: 0,
      ageHours: 0,
      ageLabel: "0h",
      ruleLabel: "48h yellow -5%/day; 72h red -10%/day",
    };
  }
  const ageHours = Math.floor((currentMs - openedMs) / (60 * 60 * 1000));
  let severity = "normal";
  let dailyPenaltyPercent = 0;
  let thresholdHours = 0;
  if (ageHours >= RED_AFTER_HOURS) {
    severity = "danger";
    dailyPenaltyPercent = RED_DAILY_PENALTY_PERCENT;
    thresholdHours = RED_AFTER_HOURS;
  } else if (ageHours >= YELLOW_AFTER_HOURS) {
    severity = "warning";
    dailyPenaltyPercent = YELLOW_DAILY_PENALTY_PERCENT;
    thresholdHours = YELLOW_AFTER_HOURS;
  }
  const penaltyDays = dailyPenaltyPercent ? startedPenaltyDays(ageHours, thresholdHours) : 0;
  const penaltyCoins = Math.min(Math.max(0, cap - 1), Math.round(cap * (dailyPenaltyPercent / 100) * penaltyDays));
  const effectiveRewardCapCoins = Math.max(1, cap - penaltyCoins);
  return {
    applies: true,
    severity,
    openedAt,
    rewardCapCoins: cap,
    effectiveRewardCapCoins,
    penaltyCoins,
    penaltyDays,
    dailyPenaltyPercent,
    thresholdHours,
    ageHours,
    ageLabel: formatAgeLabel(ageHours),
    ruleLabel: "48h yellow -5%/day; 72h red -10%/day",
  };
}

function applyLearningGrowthRewardDecayPolicy(card = {}, rewardPolicy = {}, options = {}) {
  const decay = learningGrowthRewardDecayState(card, Object.assign({}, options, {
    rewardPolicy,
    excludeCompleted: false,
  }));
  if (!decay.applies || !decay.penaltyCoins) {
    return { rewardPolicy, decay };
  }
  const adjustedMax = Math.max(1, decay.effectiveRewardCapCoins);
  return {
    rewardPolicy: Object.assign({}, rewardPolicy, {
      maxCoins: adjustedMax,
      rewardCapCoins: adjustedMax,
      minCoins: Math.min(positiveInteger(rewardPolicy.minCoins, adjustedMax), adjustedMax),
    }),
    decay,
  };
}

module.exports = {
  RED_AFTER_HOURS,
  YELLOW_AFTER_HOURS,
  applyLearningGrowthRewardDecayPolicy,
  learningGrowthRewardDecayState,
};
