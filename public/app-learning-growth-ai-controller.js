"use strict";

(function (root) {
  const AI_PROGRESS_MESSAGES = [
    "\u6b63\u5728\u6574\u7406\u5b66\u4e60\u8bb0\u5f55\u548c\u8fd1\u671f\u4efb\u52a1\u72b6\u6001...",
    "\u6b63\u5728\u8bf7\u6a21\u578b\u5206\u6790\u7279\u70b9\u3001\u4f18\u52bf\u548c\u5269\u4f59\u8584\u5f31\u70b9...",
    "\u6b63\u5728\u628a\u6a21\u578b\u5efa\u8bae\u6821\u9a8c\u5230\u5df2\u6ce8\u518c\u7684 Growth \u4efb\u52a1\u6a21\u677f...",
    "\u6a21\u578b\u5206\u6790\u4ecd\u5728\u8fdb\u884c\uff0c\u8fd9\u4e00\u6b65\u53ef\u80fd\u9700\u8981\u51e0\u5206\u949f\u3002",
  ];

  function learnerBody() {
    const workspaceId = typeof learningGrowthLearnerWorkspaceId === "function" ? learningGrowthLearnerWorkspaceId() : "weixin_stephen";
    const learnerId = typeof learningCoinStudentId === "function" ? learningCoinStudentId() : workspaceId;
    return { workspaceId, learnerId, studentId: learnerId };
  }

  function friendlyLearningAiError(err) {
    const message = String(err?.message || err || "").trim();
    if (/no supported task series|failed validation|unsupported template|skill does not match/i.test(message)) {
      return "\u6a21\u578b\u5df2\u8fd4\u56de\u5206\u6790\uff0c\u4f46\u6ca1\u6709\u7ed9\u51fa\u53ef\u901a\u8fc7\u6ce8\u518c\u6a21\u677f\u6821\u9a8c\u7684\u4efb\u52a1\u7cfb\u5217\u3002\u672c\u6b21\u4e0d\u4f1a\u4f7f\u7528\u964d\u7ea7\u63a8\u8350\uff0c\u8bf7\u91cd\u65b0\u751f\u6210\u3002";
    }
    if (/invalid json|parse/i.test(message)) {
      return "\u6a21\u578b\u8fd4\u56de\u7684\u7ed3\u679c\u4e0d\u662f\u53ef\u6821\u9a8c\u7684 JSON\u3002\u672c\u6b21\u4e0d\u4f1a\u4f7f\u7528\u964d\u7ea7\u63a8\u8350\uff0c\u8bf7\u91cd\u65b0\u751f\u6210\u3002";
    }
    if (/timeout|timed out|abort/i.test(message)) {
      return "\u6a21\u578b\u5206\u6790\u8d85\u65f6\u3002\u672c\u6b21\u6ca1\u6709\u751f\u6210 AI \u63a8\u8350\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002";
    }
    if (/502|503|model/i.test(message)) {
      return "\u6a21\u578b\u5206\u6790\u5931\u8d25\u3002\u672c\u6b21\u4e0d\u4f1a\u4f7f\u7528\u964d\u7ea7\u63a8\u8350\uff0c\u8bf7\u91cd\u65b0\u751f\u6210\u3002";
    }
    return message || "\u6a21\u578b\u5206\u6790\u5931\u8d25\u3002";
  }

  function stopLearningAiProgress() {
    for (const timer of state.learningAiSummaryProgressTimers || []) window.clearTimeout(timer);
    state.learningAiSummaryProgressTimers = [];
  }

  function startLearningAiProgress() {
    stopLearningAiProgress();
    state.learningAiSummaryProgress = AI_PROGRESS_MESSAGES[0];
    state.learningAiSummaryProgressTimers = [14000, 45000, 110000].map((delay, index) => window.setTimeout(() => {
      if (!state.learningAiSummaryLoading) return;
      state.learningAiSummaryProgress = AI_PROGRESS_MESSAGES[index + 1] || AI_PROGRESS_MESSAGES[AI_PROGRESS_MESSAGES.length - 1];
      renderLearningCoinsView();
    }, delay));
  }

  async function loadLearningAiSummaryRecommendations() {
    state.learningGrowthActiveTab = "ai-analysis";
    state.learningAiSummaryLoading = true;
    state.learningAiSummaryError = "";
    startLearningAiProgress();
    renderLearningCoinsView();
    try {
      const body = learnerBody();
      state.learningAiSummary = await api("/api/learning/recommendations/task-series", {
        method: "POST",
        body: JSON.stringify(Object.assign({}, body, { domain: "english", limit: 180, reasoningEffort: "medium" })),
        timeoutMs: 720000,
      });
      showPushToast("AI 总结已更新", "success");
    } catch (err) {
      state.learningAiSummaryError = friendlyLearningAiError(err);
      showError(err);
    } finally {
      stopLearningAiProgress();
      state.learningAiSummaryProgress = "";
      state.learningAiSummaryLoading = false;
      renderLearningCoinsView();
    }
  }

  async function createLearningAiRecommendedDraft(recommendationId) {
    state.learningGrowthActiveTab = "ai-analysis";
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
