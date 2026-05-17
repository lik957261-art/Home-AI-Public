"use strict";

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(dateIso, days) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(cleanString(dateIso))
    ? new Date(`${dateIso}T00:00:00.000Z`)
    : new Date(`${todayIso()}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + Number(days || 0));
  return base.toISOString().slice(0, 10);
}

function defaultWeekStart(now = new Date()) {
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = base.getUTCDay() || 7;
  base.setUTCDate(base.getUTCDate() - day + 1);
  return base.toISOString().slice(0, 10);
}

function inDateRange(value, startDate, endDate) {
  const date = cleanString(value).slice(0, 10);
  if (!date) return false;
  return date >= startDate && date <= endDate;
}

function countBy(items, keyFn) {
  const out = {};
  for (const item of items) {
    const key = cleanString(keyFn(item)) || "unknown";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function average(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return null;
  return Math.round((nums.reduce((sum, value) => sum + value, 0) / nums.length) * 100) / 100;
}

function topSkillResults(evaluations) {
  const bySkill = new Map();
  for (const evaluation of evaluations) {
    for (const result of asArray(evaluation.skillResults)) {
      const skillId = cleanString(result.skillId);
      if (!skillId) continue;
      const current = bySkill.get(skillId) || { skillId, attempts: 0, scores: [], summaries: [] };
      current.attempts += 1;
      if (Number.isFinite(Number(result.score))) current.scores.push(Number(result.score));
      if (cleanString(result.summary)) current.summaries.push(cleanString(result.summary));
      bySkill.set(skillId, current);
    }
  }
  return [...bySkill.values()]
    .map((item) => ({
      skillId: item.skillId,
      attempts: item.attempts,
      averageScore: average(item.scores),
      recentSummary: item.summaries[0] || "",
    }))
    .sort((a, b) => b.attempts - a.attempts || String(a.skillId).localeCompare(String(b.skillId)))
    .slice(0, 12);
}

function createLearningParentReportService(options = {}) {
  const repository = options.repository;
  const now = typeof options.now === "function" ? options.now : () => new Date();
  if (!repository || typeof repository.listPrograms !== "function") {
    throw new Error("learning parent report service requires repository");
  }

  function generateReport(input = {}) {
    const workspaceId = cleanString(input.workspaceId) || "weixin_stephen";
    const learnerId = cleanString(input.learnerId || input.studentId) || workspaceId;
    const startDate = cleanString(input.startDate || input.weekStart) || defaultWeekStart(now());
    const endDate = cleanString(input.endDate || input.weekEnd) || addDaysIso(startDate, 6);
    const limit = Math.max(20, Math.min(500, Number(input.limit || 300) || 300));

    const programs = repository.listPrograms({ learnerId, workspaceId, limit: 100 });
    const taskCards = repository.listTaskCards({ learnerId, workspaceId, limit })
      .filter((card) => inDateRange(card.plannedDate || card.updatedAt || card.createdAt, startDate, endDate));
    const evaluations = repository.listEvaluations({ learnerId, workspaceId, limit })
      .filter((evaluation) => inDateRange(evaluation.createdAt, startDate, endDate));
    const rewardSettlements = repository.listRewardSettlements({ learnerId, workspaceId, limit })
      .filter((settlement) => inDateRange(settlement.settledAt || settlement.updatedAt || settlement.createdAt, startDate, endDate));
    const reviewRequests = repository.listReviewRequests({ learnerId, workspaceId, limit })
      .filter((request) => inDateRange(request.updatedAt || request.createdAt, startDate, endDate));

    const completedTasks = taskCards.filter((card) => ["completed", "done"].includes(card.status));
    const pendingTasks = taskCards.filter((card) => ["planned", "published", "active", "review_required", "needs_review", "blocked"].includes(card.status));
    const passedEvaluations = evaluations.filter((evaluation) => evaluation.passed);
    const pendingReviews = reviewRequests.filter((request) => request.status === "pending");
    const settledRewards = rewardSettlements.filter((settlement) => settlement.status === "settled");
    const coinTotal = settledRewards.reduce((sum, item) => sum + Number(item.coinAmount || 0), 0);

    return {
      ok: true,
      reportType: "parent_weekly_summary",
      privacyLevel: "summary_only",
      generatedAt: now().toISOString(),
      workspaceId,
      learnerId,
      period: { startDate, endDate },
      counts: {
        programs: programs.length,
        plannedTasks: taskCards.length,
        pendingTasks: pendingTasks.length,
        completedTasks: completedTasks.length,
        evaluations: evaluations.length,
        passedEvaluations: passedEvaluations.length,
        pendingReviews: pendingReviews.length,
        rewardSettlements: rewardSettlements.length,
        settledRewards: settledRewards.length,
        coinsSettled: coinTotal,
      },
      statusBreakdown: {
        taskCards: countBy(taskCards, (card) => card.status),
        evaluations: countBy(evaluations, (evaluation) => evaluation.status),
        reviewRequests: countBy(reviewRequests, (request) => request.status),
        rewardSettlements: countBy(rewardSettlements, (settlement) => settlement.status),
      },
      evaluationSummary: {
        averageScore: average(evaluations.map((evaluation) => evaluation.score)),
        averageConfidence: average(evaluations.map((evaluation) => evaluation.confidence)),
        passRate: evaluations.length ? Math.round((passedEvaluations.length / evaluations.length) * 10000) / 100 : null,
        skillResults: topSkillResults(evaluations),
      },
      taskSummary: taskCards.slice(0, 40).map((card) => ({
        taskCardId: card.taskCardId,
        programId: card.programId,
        title: card.title,
        domain: card.domain,
        status: card.status,
        plannedDate: card.plannedDate,
        plannedMinutes: card.plannedMinutes,
        skillIds: asArray(card.skillIds).slice(0, 12),
      })),
      rewardSummary: rewardSettlements.slice(0, 30).map((settlement) => ({
        rewardSettlementId: settlement.rewardSettlementId,
        evaluationId: settlement.evaluationId,
        status: settlement.status,
        coinAmount: settlement.coinAmount,
        reason: settlement.reason,
        settledAt: settlement.settledAt,
      })),
      reviewSummary: reviewRequests.slice(0, 30).map((request) => ({
        reviewRequestId: request.reviewRequestId,
        requestType: request.requestType,
        resourceType: request.resourceType,
        resourceId: request.resourceId,
        status: request.status,
        reason: request.reason,
        summary: request.summary,
        riskFlags: asArray(request.riskFlags).slice(0, 12),
      })),
      nextActions: pendingReviews.map((request) => ({
        type: "parent_review",
        reviewRequestId: request.reviewRequestId,
        reason: request.reason,
        resourceType: request.resourceType,
        resourceId: request.resourceId,
      })).slice(0, 20),
    };
  }

  return { generateReport };
}

module.exports = {
  addDaysIso,
  createLearningParentReportService,
  defaultWeekStart,
};
