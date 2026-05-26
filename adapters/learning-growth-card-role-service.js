"use strict";

const CARD_ROLES = Object.freeze({
  TEACHING: "teaching",
  PRACTICE: "practice",
  INTEGRATION_PRACTICE: "integration_practice",
  STAGE_ASSESSMENT: "stage_assessment",
});

const CARD_ROLE_SET = new Set(Object.values(CARD_ROLES));

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return String(value).split(/[,\n;]+/);
}

function normalizeCardRole(value, fallback = CARD_ROLES.TEACHING) {
  const role = cleanString(value).toLowerCase().replace(/[-\s]+/g, "_");
  if (CARD_ROLE_SET.has(role)) return role;
  return fallback;
}

function inferCardRole(input = {}, fallback = CARD_ROLES.TEACHING) {
  const explicit = cleanString(input.cardRole || input.card_role || input.learningGrowthCardRole || input.learning_growth_card_role);
  if (explicit) return normalizeCardRole(explicit, fallback);
  const type = cleanString(input.taskCardType || input.task_card_type || input.taskModel?.taskCardType).toLowerCase();
  const skills = asArray(input.skillIds || input.skill_ids || input.taskModel?.skillIds || input.taskModel?.skillId)
    .map((item) => cleanString(item).toLowerCase());
  const activity = cleanString(input.activityType || input.taskModel?.activityType).toLowerCase();
  if (type === "challenge_card" || activity === "weekly_challenge" || skills.includes("english_weekly_challenge")) {
    return CARD_ROLES.STAGE_ASSESSMENT;
  }
  if (type === "project_card") return CARD_ROLES.INTEGRATION_PRACTICE;
  if (type === "mistake_repair_card" || type === "review_card" || type === "practice_card") return CARD_ROLES.PRACTICE;
  return fallback;
}

function defaultRewardCoinsForRole(role) {
  return normalizeCardRole(role) === CARD_ROLES.STAGE_ASSESSMENT ? 300 : 100;
}

function defaultDurationRangeForRole(role) {
  return normalizeCardRole(role) === CARD_ROLES.STAGE_ASSESSMENT
    ? { min: 25, max: 30 }
    : { min: 10, max: 15 };
}

function defaultMasteryEvidenceWeightForRole(role) {
  const normalized = normalizeCardRole(role);
  if (normalized === CARD_ROLES.STAGE_ASSESSMENT) return 1;
  if (normalized === CARD_ROLES.INTEGRATION_PRACTICE) return 0.45;
  if (normalized === CARD_ROLES.PRACTICE) return 0.25;
  return 0.12;
}

function defaultCompletionPolicyForRole(role) {
  const normalized = normalizeCardRole(role);
  if (normalized === CARD_ROLES.STAGE_ASSESSMENT) {
    return {
      mode: "formal_assessment",
      requiresAiEvaluation: true,
      requiresReflectionGate: true,
      completionEvidence: ["submission_summary", "evaluation_summary", "reflection_summary"],
    };
  }
  return {
    mode: "lightweight_teaching_check",
    requiresAiEvaluation: false,
    requiresReflectionGate: false,
    completionEvidence: ["lesson_viewed", "guided_practice_summary", "quick_check_summary"],
  };
}

function defaultActivationStateForRole(role) {
  return normalizeCardRole(role) === CARD_ROLES.STAGE_ASSESSMENT ? "scheduled" : "active";
}

function capabilityClusterIdForCard(card = {}) {
  const explicit = cleanString(card.capabilityClusterId || card.capability_cluster_id);
  if (explicit) return explicit;
  const domain = cleanString(card.domain || "general").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "general";
  const skill = asArray(card.skillIds || card.skill_ids || card.taskModel?.skillIds || card.taskModel?.skillId)
    .map(cleanString)
    .find(Boolean);
  const normalizedSkill = cleanString(skill || card.templateId || card.taskModel?.templateId || "general")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "general";
  return `${domain}:${normalizedSkill}`;
}

function withGrowthCardRoleDefaults(card = {}, options = {}) {
  const fallbackRole = options.fallbackRole || CARD_ROLES.TEACHING;
  const role = inferCardRole(card, fallbackRole);
  const duration = defaultDurationRangeForRole(role);
  const defaultRewardCoins = Number(card.defaultRewardCoins || card.default_reward_coins || defaultRewardCoinsForRole(role)) || defaultRewardCoinsForRole(role);
  const configuredRewardCoins = Number(
    card.rewardPolicy?.maxCoins
    || card.rewardPolicy?.rewardCapCoins
    || card.rewardCapCoins
    || card.configuredRewardCoins
    || card.configured_reward_coins
    || defaultRewardCoins,
  ) || defaultRewardCoins;
  const plannedMinutes = Number(card.plannedMinutes || card.planned_minutes || 0) || duration.min;
  const boundedMinutes = role === CARD_ROLES.STAGE_ASSESSMENT
    ? Math.max(duration.min, Math.min(duration.max, plannedMinutes))
    : Math.max(duration.min, Math.min(duration.max, plannedMinutes));
  return Object.assign({}, card, {
    cardRole: role,
    completionPolicy: card.completionPolicy && typeof card.completionPolicy === "object"
      ? card.completionPolicy
      : defaultCompletionPolicyForRole(role),
    masteryEvidenceWeight: Number(card.masteryEvidenceWeight ?? card.mastery_evidence_weight ?? defaultMasteryEvidenceWeightForRole(role)),
    capabilityClusterId: capabilityClusterIdForCard(card),
    defaultRewardCoins,
    configuredRewardCoins,
    rewardCapCoins: configuredRewardCoins,
    rewardPolicy: Object.assign({}, card.rewardPolicy || {}, {
      maxCoins: configuredRewardCoins,
      rewardCapCoins: configuredRewardCoins,
      defaultCoins: defaultRewardCoins,
    }),
    expectedDurationMinutes: {
      min: Number(card.expectedDurationMinutes?.min || card.expectedDurationMinutesMin || card.expected_duration_minutes_min || duration.min) || duration.min,
      max: Number(card.expectedDurationMinutes?.max || card.expectedDurationMinutesMax || card.expected_duration_minutes_max || duration.max) || duration.max,
    },
    plannedMinutes: boundedMinutes,
    activationState: cleanString(card.activationState || card.activation_state) || defaultActivationStateForRole(role),
  });
}

module.exports = {
  CARD_ROLES,
  CARD_ROLE_SET,
  capabilityClusterIdForCard,
  defaultActivationStateForRole,
  defaultCompletionPolicyForRole,
  defaultDurationRangeForRole,
  defaultMasteryEvidenceWeightForRole,
  defaultRewardCoinsForRole,
  inferCardRole,
  normalizeCardRole,
  withGrowthCardRoleDefaults,
};
