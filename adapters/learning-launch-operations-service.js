"use strict";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function numberValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasStatus(record, values) {
  return values.includes(cleanString(record?.status));
}

function compactTitle(value, fallback) {
  const text = cleanString(value) || fallback || "";
  if (text.length <= 80) return text;
  return `${text.slice(0, 77)}...`;
}

function publicRef(record, options = {}) {
  const type = cleanString(options.type || record?.type || record?.resourceType) || "item";
  const id = cleanString(
    options.id
      || record?.id
      || record?.reviewId
      || record?.reviewRequestId
      || record?.rewardSettlementId
      || record?.evaluationId
      || record?.sessionId
      || record?.taskCardId
      || record?.draftId
      || record?.programId,
  );
  return {
    type,
    resourceType: type,
    resourceId: id,
    status: cleanString(record?.status) || cleanString(options.status),
    title: compactTitle(options.title || record?.title, id || type),
    reasonCode: cleanString(options.reasonCode || record?.reason || record?.reasonCode),
    priority: cleanString(options.priority) || "normal",
  };
}

function riskCodeText(riskFlags) {
  return asArray(riskFlags)
    .map((flag) => cleanString(flag?.code || flag))
    .filter(Boolean)
    .join(",");
}

function taskIsOpen(task) {
  return !hasStatus(task, ["completed", "archived", "cancelled"]);
}

function taskIsPublished(task) {
  return hasStatus(task, ["published", "active"]);
}

function dailyPendingTasks(dailyPlan = {}) {
  return asArray(dailyPlan.days)
    .flatMap((day) => asArray(day?.tasks))
    .filter((task) => !hasStatus(task, ["completed", "archived", "cancelled"]));
}

function buildNextActions(state) {
  const actions = [];
  if (!state.foundationReady) {
    actions.push({
      id: "import-learning-foundation",
      priority: "high",
      action: "import_foundation_summary",
      reasonCode: "missing_learning_source_or_goal",
    });
  }
  if (!state.hasProgram) {
    actions.push({
      id: "create-learning-program",
      priority: "high",
      action: "create_program",
      reasonCode: "missing_learning_program",
    });
  }
  if (state.blockers.length) {
    actions.push({
      id: "clear-launch-blockers",
      priority: "high",
      action: "review_blockers",
      reasonCode: "launch_blockers_present",
    });
  }
  if (state.approvals.length) {
    actions.push({
      id: "decide-parent-reviews",
      priority: "high",
      action: "review_pending_items",
      reasonCode: "pending_parent_review",
    });
  }
  if (state.rewardCandidates.length || state.rewardQueue.length) {
    actions.push({
      id: "settle-learning-rewards",
      priority: "normal",
      action: "settle_rewards",
      reasonCode: "pending_reward_settlement",
    });
  }
  if (!state.hasPublishedTask && state.hasProgram && !state.approvals.length) {
    actions.push({
      id: "publish-first-learning-tasks",
      priority: "high",
      action: "publish_tasks",
      reasonCode: "no_published_learning_tasks",
    });
  }
  if (state.pendingRedemptions > 0) {
    actions.push({
      id: "review-coin-redemptions",
      priority: "normal",
      action: "review_redemptions",
      reasonCode: "pending_coin_redemptions",
    });
  }
  return actions.slice(0, 8);
}

function buildLearningLaunchOperations(input = {}) {
  const overview = input.programs && typeof input.programs === "object" ? input.programs : input;
  const metrics = input.metrics || {};
  const coins = input.coins || {};
  const sources = asArray(overview.sources);
  const goals = asArray(overview.goals);
  const programs = asArray(overview.programs);
  const latestDrafts = asArray(overview.latestDrafts);
  const reviewItems = asArray(overview.reviewItems);
  const parentReviewRequests = asArray(overview.parentReviewRequests);
  const rewardSettlements = asArray(overview.rewardSettlements);
  const taskCards = asArray(overview.taskCards);
  const sessions = asArray(overview.interactionSessions);
  const evaluations = asArray(overview.evaluations);
  const pendingRedemptions = numberValue(metrics.pendingRedemptions)
    || asArray(coins.redemptions).filter((item) => hasStatus(item, ["requested", "pending"])).length;

  const pendingPlanReviews = reviewItems.filter((item) => hasStatus(item, ["pending"]));
  const pendingParentReviews = parentReviewRequests.filter((item) => hasStatus(item, ["pending"]));
  const pendingSettlementReviews = rewardSettlements.filter((item) => hasStatus(item, ["pending_review"]));
  const readySettlements = rewardSettlements.filter((item) => hasStatus(item, ["ready"]));
  const blockedSettlements = rewardSettlements.filter((item) => hasStatus(item, ["blocked", "failed", "error"]));
  const blockedDrafts = latestDrafts.filter((draft) => hasStatus(draft, ["blocked"]) || draft?.reliability?.publishBlocked);
  const blockedTasks = taskCards.filter((task) => hasStatus(task, ["blocked"]));
  const publishedTasks = taskCards.filter(taskIsPublished);
  const openTasks = taskCards.filter(taskIsOpen);
  const activeSessions = sessions.filter((session) => hasStatus(session, ["active"]));
  const repairEvaluations = evaluations.filter((evaluation) => hasStatus(evaluation, ["needs_repair", "needs_review", "blocked"]));
  const settlementEvaluationIds = new Set(rewardSettlements.map((item) => cleanString(item.evaluationId)).filter(Boolean));
  const rewardCandidates = evaluations.filter((evaluation) => {
    const evaluationId = cleanString(evaluation.evaluationId);
    return evaluationId && Boolean(evaluation.passed) && !settlementEvaluationIds.has(evaluationId);
  });
  const pendingDailyTasks = dailyPendingTasks(overview.dailyPlan || {});
  const foundationReady = Boolean(sources.length || numberValue(overview.counts?.sources))
    && Boolean(goals.length || numberValue(overview.counts?.goals));
  const hasProgram = Boolean(programs.length || numberValue(overview.counts?.programs));
  const hasPublishedTask = Boolean(publishedTasks.length || pendingDailyTasks.length);

  const blockers = []
    .concat(blockedDrafts.map((draft) => publicRef(draft, {
      type: "plan_draft",
      id: draft.draftId,
      reasonCode: "draft_blocked_by_reliability",
      priority: "high",
    })))
    .concat(blockedTasks.map((task) => publicRef(task, {
      type: "task_card",
      id: task.taskCardId,
      reasonCode: "task_blocked",
      priority: "high",
    })))
    .concat(repairEvaluations.map((evaluation) => publicRef(evaluation, {
      type: "evaluation",
      id: evaluation.evaluationId,
      reasonCode: "evaluation_requires_repair",
      priority: "normal",
    })))
    .concat(blockedSettlements.map((settlement) => publicRef(settlement, {
      type: "reward_settlement",
      id: settlement.rewardSettlementId,
      reasonCode: "reward_settlement_blocked",
      priority: "normal",
    })));

  const approvals = pendingPlanReviews.map((item) => publicRef(item, {
    type: "plan_review",
    id: item.reviewId,
    reasonCode: riskCodeText(item.riskFlags) || "plan_review_required",
    priority: "high",
  })).concat(pendingParentReviews.map((item) => publicRef(item, {
    type: cleanString(item.resourceType) || "parent_review",
    id: item.reviewRequestId,
    reasonCode: riskCodeText(item.riskFlags) || cleanString(item.reason) || "parent_review_required",
    priority: "high",
  })));

  const rewardQueue = pendingSettlementReviews.concat(readySettlements).map((item) => publicRef(item, {
    type: "reward_settlement",
    id: item.rewardSettlementId,
    reasonCode: cleanString(item.reason) || "reward_settlement_pending",
    priority: hasStatus(item, ["pending_review"]) ? "high" : "normal",
  }));

  const execution = publishedTasks.slice(0, 8).map((task) => publicRef(task, {
    type: "task_card",
    id: task.taskCardId,
    reasonCode: "task_ready_for_executor",
  })).concat(activeSessions.slice(0, 4).map((session) => publicRef(session, {
    type: "interaction_session",
    id: session.sessionId,
    title: session.taskCardId,
    reasonCode: "session_in_progress",
  })));

  const state = {
    foundationReady,
    hasProgram,
    hasPublishedTask,
    blockers,
    approvals,
    rewardQueue,
    rewardCandidates,
    pendingRedemptions,
  };
  const nextActions = buildNextActions(state);
  const launchReady = foundationReady && hasProgram && hasPublishedTask && blockers.length === 0 && approvals.length === 0;
  const status = blockers.length ? "blocked" : (nextActions.length ? "attention_required" : "ready");

  return {
    version: "learning-growth-launch-ops-v1",
    status,
    officialLaunchReady: launchReady,
    privacyLevel: "summary_only",
    counts: {
      sources: sources.length || numberValue(overview.counts?.sources),
      goals: goals.length || numberValue(overview.counts?.goals),
      programs: programs.length || numberValue(overview.counts?.programs),
      openTasks: openTasks.length,
      publishedTasks: publishedTasks.length,
      pendingDailyTasks: pendingDailyTasks.length,
      activeSessions: activeSessions.length,
      pendingPlanReviews: pendingPlanReviews.length,
      pendingParentReviews: pendingParentReviews.length,
      pendingRewardSettlements: pendingSettlementReviews.length + readySettlements.length,
      rewardCandidates: rewardCandidates.length,
      pendingRedemptions,
      blockers: blockers.length,
      repairEvaluations: repairEvaluations.length,
    },
    queues: {
      blockers: blockers.slice(0, 8),
      approvals: approvals.slice(0, 8),
      execution: execution.slice(0, 12),
      rewards: rewardQueue.concat(rewardCandidates.slice(0, 6).map((evaluation) => publicRef(evaluation, {
        type: "evaluation",
        id: evaluation.evaluationId,
        reasonCode: "passed_evaluation_needs_reward_settlement",
      }))).slice(0, 12),
    },
    nextActions,
  };
}

module.exports = {
  buildLearningLaunchOperations,
};
