"use strict";

export const LEARNING_GROWTH_REWARD_CONTROLLER_MODEL_VERSION = "20260706-learning-growth-reward-controller-model-v1";

function cleanToken(value) {
  return String(value || "").trim();
}

export function learningRewardSeriesIdsPlan(raw = "") {
  return String(raw || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function learningRewardPolicyStateSelectorPlan(key = "") {
  return `[data-learning-task-reward-policy-state="${String(key || "").replace(/"/g, "\\\"")}"]`;
}

export function learningRewardMaxCoinsPlan(value = 0) {
  const maxCoins = Number(value || 0);
  if (!Number.isFinite(maxCoins) || maxCoins <= 0) {
    return {
      valid: false,
      maxCoins: 0,
      rewardCapCoins: 0,
      errorText: "金币数必须是正整数。",
    };
  }
  const rewardCapCoins = Math.round(maxCoins);
  return {
    valid: true,
    maxCoins,
    rewardCapCoins,
    errorText: "",
  };
}

export function learningRewardPolicyPatchRequestsPlan(ids = [], rewardCapCoins = 0) {
  return learningRewardSeriesIdsPlan(ids.join(",")).map((id) => ({
    id,
    url: `/api/learning/task-cards/${encodeURIComponent(id)}/reward-policy`,
    method: "PATCH",
    body: { rewardCapCoins },
  }));
}

export function learningRewardPolicySubmitPlan({
  rawIds = "",
  formKey = "",
  maxCoinsValue = 0,
} = {}) {
  const ids = learningRewardSeriesIdsPlan(rawIds);
  const key = cleanToken(formKey) || rawIds;
  const maxCoins = learningRewardMaxCoinsPlan(maxCoinsValue);
  if (!ids.length) {
    return {
      ids,
      key,
      stateSelector: learningRewardPolicyStateSelectorPlan(key),
      valid: false,
      empty: true,
      requests: [],
      errorText: "",
      savingText: "",
      successText: "",
    };
  }
  if (!maxCoins.valid) {
    return {
      ids,
      key,
      stateSelector: learningRewardPolicyStateSelectorPlan(key),
      valid: false,
      empty: false,
      requests: [],
      errorText: maxCoins.errorText,
      savingText: "",
      successText: "",
    };
  }
  return {
    ids,
    key,
    stateSelector: learningRewardPolicyStateSelectorPlan(key),
    valid: true,
    empty: false,
    rewardCapCoins: maxCoins.rewardCapCoins,
    requests: learningRewardPolicyPatchRequestsPlan(ids, maxCoins.rewardCapCoins),
    errorText: "",
    savingText: "正在保存系列奖励...",
    successText: `已更新 ${ids.length} 张卡片。`,
  };
}
