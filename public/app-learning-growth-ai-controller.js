"use strict";

(function (root) {
  function learnerBody() {
    const workspaceId = typeof learningGrowthLearnerWorkspaceId === "function" ? learningGrowthLearnerWorkspaceId() : "weixin_stephen";
    const learnerId = typeof learningCoinStudentId === "function" ? learningCoinStudentId() : workspaceId;
    return { workspaceId, learnerId, studentId: learnerId };
  }

  async function loadLearningAiSummaryRecommendations() {
    state.learningAiSummaryLoading = true;
    state.learningAiSummaryError = "";
    renderLearningCoinsView();
    try {
      const body = learnerBody();
      state.learningAiSummary = await api("/api/learning/recommendations/task-series", {
        method: "POST",
        body: JSON.stringify(Object.assign({}, body, { domain: "english", limit: 180 })),
      });
      showPushToast("AI 总结已更新", "success");
    } catch (err) {
      state.learningAiSummaryError = err.message || String(err);
      showError(err);
    } finally {
      state.learningAiSummaryLoading = false;
      renderLearningCoinsView();
    }
  }

  async function createLearningAiRecommendedDraft(recommendationId) {
    const recommendation = (state.learningAiSummary?.recommendedSeries || []).find((item) => String(item.recommendationId || item.id || "") === String(recommendationId || ""));
    if (!recommendation) return;
    state.learningAiDraftCreatingId = recommendation.recommendationId || recommendation.id;
    renderLearningCoinsView();
    try {
      const response = await api("/api/learning/recommendations/task-series/draft", {
        method: "POST",
        body: JSON.stringify(Object.assign({}, learnerBody(), { recommendation })),
      });
      showPushToast("推荐任务草稿已生成", "success");
      state.learningAiSummary = Object.assign({}, state.learningAiSummary || {}, {
        lastDraft: response,
      });
      if (typeof loadLearningCoins === "function") await loadLearningCoins({ limit: 80 });
    } catch (err) {
      showError(err);
    } finally {
      state.learningAiDraftCreatingId = "";
      renderLearningCoinsView();
    }
  }

  function wireLearningGrowthAi() {
    $("conversation")?.querySelector("[data-learning-ai-summary-refresh]")?.addEventListener("click", () => {
      loadLearningAiSummaryRecommendations().catch(showError);
    });
    $("conversation")?.querySelectorAll("[data-learning-ai-recommendation-draft]").forEach((button) => {
      button.addEventListener("click", () => {
        createLearningAiRecommendedDraft(button.dataset.learningAiRecommendationDraft).catch(showError);
      });
    });
  }

  root.HermesLearningGrowthAiController = {
    createLearningAiRecommendedDraft,
    loadLearningAiSummaryRecommendations,
    wireLearningGrowthAi,
  };
}(typeof window !== "undefined" ? window : globalThis));
