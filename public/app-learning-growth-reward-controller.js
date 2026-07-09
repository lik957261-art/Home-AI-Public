"use strict";

(function (root) {
  const LEARNING_GROWTH_REWARD_CONTROLLER_MODEL_ESM_PATH = "/vite-islands/learning-growth-reward-controller-model/learning-growth-reward-controller-model.js";
  let learningGrowthRewardControllerModel = null;
  let learningGrowthRewardControllerModelPromise = null;

  function importLearningGrowthRewardControllerModel(rootRef = root) {
    if (learningGrowthRewardControllerModel) return Promise.resolve(learningGrowthRewardControllerModel);
    if (!learningGrowthRewardControllerModelPromise) {
      const importer = typeof rootRef.__homeAiImportLearningGrowthRewardControllerModel === "function"
        ? rootRef.__homeAiImportLearningGrowthRewardControllerModel
        : (path) => import(path);
      learningGrowthRewardControllerModelPromise = Promise.resolve()
        .then(() => importer(LEARNING_GROWTH_REWARD_CONTROLLER_MODEL_ESM_PATH))
        .then((model) => {
          learningGrowthRewardControllerModel = model || null;
          return learningGrowthRewardControllerModel;
        })
        .catch((error) => {
          learningGrowthRewardControllerModelPromise = null;
          throw error;
        });
    }
    return learningGrowthRewardControllerModelPromise;
  }

  function currentLearningGrowthRewardControllerModel() {
    return learningGrowthRewardControllerModel;
  }

  function learningGrowthRewardControllerModelFunction(name) {
    const model = currentLearningGrowthRewardControllerModel();
    return model && typeof model[name] === "function" ? model[name] : null;
  }

  if (typeof window !== "undefined") {
    importLearningGrowthRewardControllerModel().catch(() => null);
  }

  function seriesIds(raw = "") {
    const modelFn = learningGrowthRewardControllerModelFunction("learningRewardSeriesIdsPlan");
    if (modelFn) return modelFn(raw);
    return String(raw || "").split(",").map((id) => id.trim()).filter(Boolean);
  }

  function rewardPolicyPatchRequestsPlan(ids, rewardCapCoins) {
    const modelFn = learningGrowthRewardControllerModelFunction("learningRewardPolicyPatchRequestsPlan");
    if (modelFn) return modelFn(ids, rewardCapCoins);
    return seriesIds(ids.join(",")).map((id) => ({
      id,
      url: `/api/learning/task-cards/${encodeURIComponent(id)}/reward-policy`,
      method: "PATCH",
      body: { rewardCapCoins },
    }));
  }

  function fallbackRewardPolicySubmitPlan(rawIds, form) {
    const ids = seriesIds(rawIds);
    const key = form?.dataset.learningTaskRewardPolicySeriesForm || rawIds;
    const maxCoins = Number(form?.querySelector("input[name='maxCoins']")?.value || 0);
    if (!ids.length) {
      return {
        ids,
        key,
        stateSelector: `[data-learning-task-reward-policy-state="${String(key).replace(/"/g, "\\\"")}"]`,
        valid: false,
        empty: true,
        requests: [],
      };
    }
    if (!Number.isFinite(maxCoins) || maxCoins <= 0) {
      return {
        ids,
        key,
        stateSelector: `[data-learning-task-reward-policy-state="${String(key).replace(/"/g, "\\\"")}"]`,
        valid: false,
        empty: false,
        requests: [],
        errorText: "金币数必须是正整数。",
      };
    }
    const rewardCapCoins = Math.round(maxCoins);
    return {
      ids,
      key,
      stateSelector: `[data-learning-task-reward-policy-state="${String(key).replace(/"/g, "\\\"")}"]`,
      valid: true,
      rewardCapCoins,
      requests: rewardPolicyPatchRequestsPlan(ids, rewardCapCoins),
      savingText: "正在保存系列奖励...",
      successText: `已更新 ${ids.length} 张卡片。`,
    };
  }

  function rewardPolicySubmitPlan(rawIds, form) {
    const modelFn = learningGrowthRewardControllerModelFunction("learningRewardPolicySubmitPlan");
    if (modelFn) {
      return modelFn({
        rawIds,
        formKey: form?.dataset.learningTaskRewardPolicySeriesForm || rawIds,
        maxCoinsValue: form?.querySelector("input[name='maxCoins']")?.value || 0,
      });
    }
    return fallbackRewardPolicySubmitPlan(rawIds, form);
  }

  async function submitLearningTaskRewardSeriesForm(event, rawIds) {
    event?.preventDefault?.();
    const form = event?.target;
    const plan = rewardPolicySubmitPlan(rawIds, form);
    if (!plan.ids.length) return;
    const stateNode = document.querySelector(plan.stateSelector);
    if (!plan.valid) {
      if (stateNode && plan.errorText) stateNode.textContent = plan.errorText;
      return;
    }
    if (stateNode) stateNode.textContent = plan.savingText || "正在保存系列奖励...";
    await Promise.all((plan.requests || []).map((request) => api(request.url, {
      method: request.method || "PATCH",
      body: JSON.stringify(request.body || { rewardCapCoins: plan.rewardCapCoins }),
    })));
    if (stateNode) stateNode.textContent = plan.successText || `已更新 ${plan.ids.length} 张卡片。`;
    if (typeof loadLearningCoins === "function") await loadLearningCoins({ limit: 80 });
  }

  function wireLearningGrowthRewardPolicy() {
    document.querySelectorAll("[data-learning-task-reward-policy-series-form]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        submitLearningTaskRewardSeriesForm(event, form.dataset.learningTaskRewardPolicySeriesForm).catch(showError);
      });
    });
  }

  root.HermesLearningGrowthRewardController = {
    importLearningGrowthRewardControllerModel,
    currentLearningGrowthRewardControllerModel,
    rewardPolicyPatchRequestsPlan,
    rewardPolicySubmitPlan,
    seriesIds,
    submitLearningTaskRewardSeriesForm,
    wireLearningGrowthRewardPolicy,
  };
}(typeof window !== "undefined" ? window : globalThis));
