"use strict";

(function (root) {
  function seriesIds(raw = "") {
    return String(raw || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }

  async function submitLearningTaskRewardSeriesForm(event, rawIds) {
    event?.preventDefault?.();
    const ids = seriesIds(rawIds);
    if (!ids.length) return;
    const form = event?.target;
    const key = form?.dataset.learningTaskRewardPolicySeriesForm || rawIds;
    const stateNode = document.querySelector(`[data-learning-task-reward-policy-state="${String(key).replace(/"/g, "\\\"")}"]`);
    const maxCoins = Number(form?.querySelector("input[name='maxCoins']")?.value || 0);
    if (!Number.isFinite(maxCoins) || maxCoins <= 0) {
      if (stateNode) stateNode.textContent = "\u91d1\u5e01\u6570\u5fc5\u987b\u662f\u6b63\u6574\u6570\u3002";
      return;
    }
    if (stateNode) stateNode.textContent = "\u6b63\u5728\u4fdd\u5b58\u7cfb\u5217\u5956\u52b1...";
    await Promise.all(ids.map((id) => api(`/api/learning/task-cards/${encodeURIComponent(id)}/reward-policy`, {
      method: "PATCH",
      body: JSON.stringify({ rewardCapCoins: Math.round(maxCoins) }),
    })));
    if (stateNode) stateNode.textContent = `\u5df2\u66f4\u65b0 ${ids.length} \u5f20\u5361\u7247\u3002`;
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
    submitLearningTaskRewardSeriesForm,
    wireLearningGrowthRewardPolicy,
  };
}(typeof window !== "undefined" ? window : globalThis));
