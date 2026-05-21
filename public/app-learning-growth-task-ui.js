"use strict";

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HermesLearningGrowthTaskUi = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function taskModel(todo = {}) {
    const model = todo?.learningTaskModel || null;
    if (model && typeof model === "object") return model;
    const summary = todo?.learningGrowthTaskModel || null;
    return summary && typeof summary === "object" ? summary : null;
  }

  function activityLabel(value) {
    const activity = String(value || "").trim();
    if (activity === "writing") return "\u5199\u4f5c";
    if (activity === "reading") return "\u9605\u8bfb";
    if (activity === "listening") return "\u542c\u529b";
    if (activity === "speaking") return "\u53e3\u8bed";
    if (activity === "pronunciation") return "\u53d1\u97f3";
    if (activity === "vocabulary") return "\u8bcd\u6c47";
    if (activity === "grammar") return "\u8bed\u6cd5";
    if (activity === "rewriting") return "\u6539\u5199";
    if (activity === "presentation") return "\u6f14\u8bb2";
    if (activity === "weekly_challenge") return "\u5468\u6311\u6218";
    return activity || "\u7ec3\u4e60";
  }

  function nextActionLabel(action) {
    const value = String(action || "").trim();
    if (value === "submit_first_attempt") return "\u63d0\u4ea4\u7b2c\u4e00\u6b21\u4f5c\u7b54";
    if (value === "wait_for_feedback") return "\u7b49\u5f85 AI \u6279\u6539";
    if (value === "submit_revision") return "\u63d0\u4ea4\u4fee\u6539\u7248";
    if (value === "submit_revision_and_reflection") return "\u63d0\u4ea4\u4fee\u6539\u7248";
    if (value === "submit_spoken_reflection") return "\u5f55\u97f3\u590d\u76d8";
    if (value === "review_feedback") return "\u67e5\u770b\u53cd\u9988";
    return value || "\u5f00\u59cb\u4efb\u52a1";
  }

  function submissionPrompt(evaluation = {}, todo = {}) {
    const nextStep = String(evaluation.nextStep || "");
    if (nextStep === "rewrite_and_reflect") return "\u6309 AI \u6279\u6539\u5199\u4e0b\u4fee\u6539\u540e\u7684\u7248\u672c\uff0c\u4fdd\u7559\u660e\u663e\u4fee\u6539\uff0c\u7136\u540e\u63d0\u4ea4\u3002";
    if (nextStep === "revise_and_resubmit") return "\u6309\u6279\u6539\u62a5\u544a\u518d\u6539\u4e00\u7248\uff0c\u7136\u540e\u63d0\u4ea4\u3002";
    const activity = String(taskModel(todo)?.activityType || "").trim();
    if (activity === "vocabulary") return "\u5199\u4e0b\u672c\u6b21\u8bcd\u6c47\u9020\u53e5\uff0c\u5c3d\u91cf\u7528\u5b66\u6821\u6216\u751f\u6d3b\u573a\u666f\u3002";
    if (activity === "grammar") return "\u5199\u4e0b\u4fee\u6539\u540e\u7684\u53e5\u5b50\u548c\u4e00\u53e5\u89c4\u5219\u603b\u7ed3\u3002";
    if (activity === "reading") return "\u5199\u4e0b\u9605\u8bfb\u7b54\u6848\u3001\u7406\u7531\u548c\u4e0d\u786e\u5b9a\u7684\u5730\u65b9\u3002";
    if (activity === "listening") return "\u5199\u4e0b\u542c\u5230\u7684 3-5 \u4e2a\u8981\u70b9\uff0c\u518d\u6807\u51fa\u6700\u4e0d\u786e\u5b9a\u7684\u4e00\u5904\u3002";
    if (activity === "speaking") return "\u5199\u4e0b\u590d\u8ff0\u7a3f\u6216\u53e3\u8bed\u590d\u8ff0\u8981\u70b9\uff1a\u4e3b\u65e8\u3001\u4e24\u4e2a\u7ec6\u8282\u548c\u4e00\u53e5\u590d\u76d8\u3002";
    if (activity === "pronunciation") return "\u5199\u4e0b\u8ddf\u8bfb\u53e5\u5b50\u3001\u89c9\u5f97\u6700\u96be\u7684\u53d1\u97f3\u70b9\uff0c\u4ee5\u53ca\u4fee\u590d\u540e\u7684\u91cd\u8bfb\u53e5\u3002";
    if (activity === "rewriting") return "\u5199\u4e0b\u6539\u5199\u7248\u3001\u4fee\u6539\u7406\u7531\u548c\u4e00\u4e2a\u53d8\u5f0f\u4fee\u590d\u53e5\u3002";
    if (activity === "presentation") return "\u5199\u4e0b\u6f14\u8bb2\u63d0\u7eb2\uff1a\u5f00\u573a\u3001\u4e24\u4e2a\u8981\u70b9\u3001\u7ed3\u5c3e\uff0c\u5e76\u8865\u4e00\u53e5\u6392\u7ec3\u53cd\u601d\u3002";
    if (activity === "weekly_challenge") return "\u5199\u4e0b\u672c\u5468\u7efc\u5408\u4f5c\u7b54\uff1a\u4e00\u4e2a\u5b8c\u6574\u56de\u7b54\u3001\u4e00\u4e2a\u6539\u8fdb\u53e5\u548c\u4e00\u53e5\u590d\u76d8\u3002";
    return "\u5199\u4e0b\u672c\u6b21\u5b66\u4e60\u4efb\u52a1\u4f5c\u7b54\u3002";
  }

  const DEFAULT_SUBMISSION_GUARDS = Object.freeze({
    default: Object.freeze({ minWords: 40, minChars: 200 }),
    writing: Object.freeze({ minWords: 80, minChars: 300 }),
    rewriting: Object.freeze({ minWords: 70, minChars: 380 }),
    vocabulary: Object.freeze({ minWords: 40, minChars: 220 }),
    grammar: Object.freeze({ minWords: 35, minChars: 180 }),
    reading: Object.freeze({ minWords: 50, minChars: 250 }),
    listening: Object.freeze({ minWords: 35, minChars: 180 }),
    speaking: Object.freeze({ minWords: 45, minChars: 220 }),
    pronunciation: Object.freeze({ minWords: 20, minChars: 100 }),
    presentation: Object.freeze({ minWords: 60, minChars: 320 }),
    weekly_challenge: Object.freeze({ minWords: 80, minChars: 450 }),
  });

  function positiveInt(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  }

  function submissionStage(evaluation = {}, todo = {}) {
    const explicit = String(evaluation.stage || evaluation.submissionStage || todo?.learningGrowthSubmissionStage || "").trim().toLowerCase();
    if (["final", "rewrite", "revision", "resubmission"].includes(explicit)) return "final";
    if (["draft", "first_draft", "initial"].includes(explicit)) return "draft";
    const status = String(evaluation.status || todo?.learningGrowthEvaluationStatus || "").trim().toLowerCase();
    if (["draft_feedback", "needs_revision", "review_required", "pending_review"].includes(status)) return "final";
    return "draft";
  }

  function submissionGuard(modelOrTodo = {}, evaluation = {}) {
    const model = taskModel(modelOrTodo) || (modelOrTodo && typeof modelOrTodo === "object" ? modelOrTodo : {});
    const activity = String(model.activityType || "").trim().toLowerCase();
    const base = DEFAULT_SUBMISSION_GUARDS[activity] || DEFAULT_SUBMISSION_GUARDS.default;
    const contract = model && typeof model === "object" ? (model.submissionContract || {}) : {};
    const firstPass = submissionStage(evaluation, modelOrTodo) === "draft";
    const multiplier = firstPass ? 1 : 0.6;
    return {
      activityType: activity || "default",
      stage: firstPass ? "draft" : "final",
      minWords: positiveInt(contract.minSubmissionWords ?? contract.minimumWords ?? contract.minWords, Math.max(25, Math.round(base.minWords * multiplier))),
      minChars: positiveInt(contract.minSubmissionChars ?? contract.minimumChars ?? contract.minChars, Math.max(120, Math.round(base.minChars * multiplier))),
    };
  }

  function submissionTextStats(text) {
    const value = String(text || "").trim();
    const words = value.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) || [];
    return {
      words: words.length,
      chars: value.replace(/\s+/g, "").length,
    };
  }

  function validateSubmissionText(text, guard = {}) {
    const stats = submissionTextStats(text);
    const minWords = positiveInt(guard.minWords, 0);
    const minChars = positiveInt(guard.minChars, 0);
    if ((!minWords || stats.words >= minWords) && (!minChars || stats.chars >= minChars)) return { ok: true, stats, guard };
    return {
      ok: false,
      stats,
      guard,
      message: `\u4f5c\u7b54\u8fc7\u77ed\uff1a\u81f3\u5c11 ${minWords} \u4e2a\u82f1\u6587\u8bcd\u3001${minChars} \u4e2a\u6709\u6548\u5b57\u7b26\u540e\u518d\u63d0\u4ea4\u3002`,
    };
  }

  function submissionRequirementLabel(guard = {}, stats = null) {
    const minWords = positiveInt(guard.minWords, 0);
    const minChars = positiveInt(guard.minChars, 0);
    const prefix = `\u81f3\u5c11 ${minWords} \u4e2a\u82f1\u6587\u8bcd / ${minChars} \u4e2a\u6709\u6548\u5b57\u7b26`;
    if (!stats) return prefix;
    const missingWords = Math.max(0, minWords - Number(stats.words || 0));
    const missingChars = Math.max(0, minChars - Number(stats.chars || 0));
    if (!missingWords && !missingChars) return `\u5df2\u8fbe\u6807\uff1a${prefix}\uff1b\u5f53\u524d ${stats.words} \u8bcd / ${stats.chars} \u5b57\u7b26\u3002`;
    const gaps = [];
    if (missingWords) gaps.push(`\u8fd8\u5dee ${missingWords} \u4e2a\u82f1\u6587\u8bcd`);
    if (missingChars) gaps.push(`\u8fd8\u5dee ${missingChars} \u4e2a\u6709\u6548\u5b57\u7b26`);
    return `\u672a\u8fbe\u6807\uff1a${gaps.join("\uff0c")}\uff1b\u8981\u6c42 ${prefix}\uff1b\u5f53\u524d ${stats.words} \u8bcd / ${stats.chars} \u5b57\u7b26\u3002`;
  }

  function canWithdrawSubmission(submitted = {}, todo = {}, evaluation = {}) {
    const submittedAt = Date.parse(submitted.submittedAt || todo?.learningGrowthSubmissionAt || "");
    if (!Number.isFinite(submittedAt)) return false;
    const reward = evaluation.reward || {};
    const rewardStatus = String(reward.status || todo?.learningGrowthRewardStatus || "").trim().toLowerCase();
    const kanbanStatus = String(todo?.kanbanStatus || todo?.kanban_status || todo?.status || "").trim().toLowerCase();
    const completed = ["done", "archived", "cancelled", "canceled", "completed"].includes(kanbanStatus) || String(evaluation.nextStep || "").trim() === "completed";
    return Date.now() - submittedAt >= 0 && Date.now() - submittedAt <= 5 * 60 * 1000 && !completed && rewardStatus !== "settled" && !reward.entryId;
  }

  function escapeHtmlLocal(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
  }

  function reportHistory(todo = {}, evaluation = {}) {
    const raw = Array.isArray(evaluation.reportHistory) && evaluation.reportHistory.length
      ? evaluation.reportHistory
      : (Array.isArray(todo.learningGrowthReportHistory) && todo.learningGrowthReportHistory.length ? todo.learningGrowthReportHistory : []);
    const fromOutputs = Array.isArray(todo.kanbanOutputs)
      ? todo.kanbanOutputs.filter((item) => String(item?.role || "").includes("learning-growth") && /report|feedback|\u6279\u6539|\u8bc4\u4ef7/i.test(String(item?.role || item?.name || "")))
      : [];
    const seen = new Set();
    return raw.concat(fromOutputs).filter((item) => item && typeof item === "object").map((item, index) => Object.assign({ attemptIndex: index + 1 }, item)).filter((item) => {
      const key = String(item.path || item.url || item.name || "").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(-12);
  }

  function outcomeText(evaluation = {}, interactionState = {}) {
    const status = String(evaluation.status || "").trim();
    const nextStep = String(evaluation.nextStep || interactionState.nextStep || "").trim();
    const passLine = Number(evaluation.finalPassingScore || evaluation.passingScore || interactionState.finalPassingScore || 80) || 80;
    if (nextStep === "spoken_reflection_required" || status === "reflection_required" || interactionState.requiresReflection || interactionState.canSubmitReflection) return { kind: "reflection", title: "\u6700\u7ec8\u8bc4\u5206\u5df2\u8fbe\u6807\uff0c\u5f85\u5f55\u97f3\u590d\u76d8", body: `\u6700\u7ec8\u5206\u6570\u5df2\u8fbe\u5230 ${passLine} \u5206\u7ebf\uff0c\u8bf7\u5148\u770b\u6700\u65b0 Markdown \u6279\u6539\uff0c\u518d\u7528\u5f55\u97f3\u8bf4\u660e\u9519\u8bef\u3001\u539f\u56e0\u548c\u4e0b\u6b21\u6539\u8fdb\u3002\u590d\u76d8\u901a\u8fc7\u540e\u518d\u7ed3\u7b97\u5206\u6570\u548c\u91d1\u5e01\u3002` };
    if (evaluation.passed || nextStep === "completed" || status === "completed") return { kind: "passed", title: "\u672c\u6b21\u5df2\u901a\u8fc7", body: "\u67e5\u770b\u6700\u65b0\u6279\u6539\u6587\u4ef6\uff0c\u6309\u8981\u6c42\u5b8c\u6210\u540e\u7eed\u590d\u76d8\u6216\u7ed3\u7b97\u3002" };
    if (nextStep === "rewrite_and_reflect" || nextStep === "revise_and_resubmit" || status === "needs_revision" || status === "draft_feedback") return { kind: "revision", title: "\u672c\u6b21\u672a\u901a\u8fc7\uff0c\u9700\u8981\u7ee7\u7eed\u4fee\u6539", body: "\u5148\u6253\u5f00\u6700\u65b0\u6279\u6539\u6587\u4ef6\uff0c\u6309\u91cd\u70b9\u4fee\u6539\u540e\u518d\u63d0\u4ea4\u3002\u4e0b\u65b9\u4fdd\u7559\u4e86\u6bcf\u4e00\u6b21\u6279\u6539\u8bb0\u5f55\u3002" };
    if (status === "pending") return { kind: "pending", title: "\u6b63\u5728\u7b49\u5f85 AI \u6279\u6539", body: "\u4f5c\u7b54\u5df2\u4fdd\u5b58\uff0c\u8bf7\u7b49\u5f85\u672c\u6b21\u6279\u6539\u5b8c\u6210\u3002" };
    return { kind: "review", title: "\u6279\u6539\u7ed3\u679c", body: "\u67e5\u770b\u672c\u6b21\u6279\u6539\u548c\u5386\u53f2\u8bb0\u5f55\uff0c\u518d\u6309\u4e0b\u4e00\u6b65\u63d0\u4ea4\u3002" };
  }

  function renderFeedbackHistory(todo = {}, evaluation = {}) {
    const outcome = outcomeText(evaluation, todo.learningGrowthInteractionState || {});
    const history = reportHistory(todo, evaluation);
    const renderer = typeof globalThis !== "undefined" && typeof globalThis.renderKanbanOutputLinks === "function" ? globalThis.renderKanbanOutputLinks : null;
    const links = history.length ? (renderer ? renderer(history, "todo-detail-outputs compact todo-learning-growth-report-history-links") : `<div class="todo-detail-outputs compact todo-learning-growth-report-history-links">${history.map((item) => `<span>${escapeHtmlLocal(item.name || "\u6279\u6539\u6587\u4ef6")}</span>`).join("")}</div>`) : "";
    const count = history.length ? `<span>${escapeHtmlLocal(`${history.length} \u6b21\u6279\u6539`)}</span>` : "";
    return `<div class="todo-learning-growth-outcome is-${escapeHtmlLocal(outcome.kind)}"><strong>${escapeHtmlLocal(outcome.title)}</strong><p>${escapeHtmlLocal(outcome.body)}</p></div>${history.length ? `<div class="todo-learning-growth-report-history"><div class="todo-learning-growth-report-history-head"><strong>${escapeHtmlLocal("\u6279\u6539\u5386\u53f2")}</strong>${count}</div>${links}</div>` : ""}`;
  }

  return {
    activityLabel,
    canWithdrawSubmission,
    renderFeedbackHistory,
    reportHistory,
    nextActionLabel,
    submissionGuard,
    submissionPrompt,
    submissionRequirementLabel,
    submissionStage,
    submissionTextStats,
    taskModel,
    validateSubmissionText,
  };
}));
