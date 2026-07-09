export const LEARNING_GROWTH_MODEL_VERSION = "20260706-learning-growth-model-v1";

export function asArrayPlan(value) {
  return Array.isArray(value) ? value : [];
}

export function statusTextPlan(status) {
  const value = String(status || "");
  if (value === "active") return "已接入";
  if (value === "ready") return "已就绪";
  if (value === "foundation") return "底座";
  if (value === "guardrail") return "护栏";
  if (value === "platform-reuse") return "复用平台";
  if (value === "planned") return "规划中";
  if (value === "next") return "下一阶段";
  return value || "待定";
}

export function countPendingTasksPlan(programs = {}) {
  const dailyPending = Number(programs.dailyPlan?.summary?.pendingTasks);
  if (Number.isFinite(dailyPending) && dailyPending >= 0) return dailyPending;
  const taskCards = asArrayPlan(programs.taskCards);
  return taskCards.filter((task) => ["planned", "published", "active", "review_required"].includes(String(task?.status || ""))).length;
}

export function countReflectionOrReviewPlan(programs = {}, owner = false) {
  const counts = programs.launchOperations?.counts || {};
  if (owner) {
    return Number(counts.pendingPlanReviews || 0)
      + Number(counts.pendingParentReviews || 0)
      + Number(counts.pendingRewardSettlements || 0);
  }
  const sessions = asArrayPlan(programs.interactionSessions);
  return sessions.filter((session) => /reflect|review/i.test(String(session?.currentStep || session?.status || ""))).length;
}

export function formatGrowthCoinsPlan(value) {
  const amount = Number(value || 0);
  return `${Number.isFinite(amount) ? amount : 0} 金币`;
}

export function averageCoinsForWindowPlan(coins = {}, metrics = {}, days = 7) {
  const totalField = days === 30 ? "thirtyDayCoins" : "sevenDayCoins";
  const total = Number(metrics?.[totalField] ?? coins?.growth?.[totalField] ?? 0);
  return Number.isFinite(total) ? Math.round(total / days) : 0;
}

export function boardLaneTitlePlan(id, fallback = "") {
  const value = String(id || "");
  if (value === "today") return "今日";
  if (value === "ready") return "当前";
  if (value === "waiting_ai") return "等待 AI";
  if (value === "needs_revision") return "待修订";
  if (value === "reflection_required") return "待复盘";
  if (value === "locked_until") return "锁定";
  if (value === "completed_recent") return "最近完成";
  return fallback || value || "任务";
}

export function boardStatusTextPlan(card = {}) {
  const nextAction = String(card.nextAction || card.primaryAction || "");
  if (nextAction === "submit") return "未提交";
  if (nextAction === "waiting_feedback") return "已提交，等待 AI";
  if (nextAction === "revise") return "需要修订";
  if (nextAction === "spoken_reflection") return "需要复盘";
  if (nextAction === "complete") return "已完成";
  return card.status || nextAction || "待处理";
}

export function taskRewardCapCoinsPlan(task = {}) {
  const policy = task.rewardPolicy || {};
  const value = Number(task.rewardCapCoins || policy.maxCoins || policy.rewardCapCoins || 100);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 100;
}

export function cardRewardTextPlan(card = {}) {
  const settlement = card.latestRewardSettlement || card.rewardSettlement || null;
  const coinAmount = Number(settlement?.coinAmount || 0);
  const amount = Number.isFinite(coinAmount) && coinAmount > 0 ? Math.round(coinAmount) : 0;
  const status = String(settlement?.status || "");
  if (amount && status === "settled") return `已得 ${amount} 金币`;
  if (amount && (status === "ready" || status === "pending_review")) return `待结算 ${amount} 金币`;
  return `奖励 ${taskRewardCapCoinsPlan(card)} 金币`;
}

export function cardOpenTimeTextPlan(card = {}) {
  const value = String(card.openedAt || card.generatedAt || card.availableAt || card.createdAt || card.plannedDate || "").trim();
  if (!value) return "";
  const ms = Date.parse(value);
  if (Number.isFinite(ms)) {
    const date = new Date(ms);
    const pad = (number) => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  const normalized = value.replace("T", " ");
  return normalized.length > 16 ? normalized.slice(0, 16) : normalized;
}

export function cardPublishedAgeTextPlan(card = {}, nowMs = Date.now()) {
  const decay = card.rewardDecay || {};
  if (decay.ageLabel) return decay.ageLabel;
  const value = String(card.openedAt || card.generatedAt || card.availableAt || card.createdAt || card.plannedDate || "").trim();
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "";
  const hours = Math.max(0, Math.floor((nowMs - ms) / (60 * 60 * 1000)));
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainder = hours % 24;
  return remainder ? `${days}d ${remainder}h` : `${days}d`;
}

export function isCompletedBoardCardPlan(card = {}) {
  const status = String(card.status || card.executionStatus || card.laneId || card.nextAction || card.primaryAction || "").trim().toLowerCase();
  return ["completed", "complete", "done", "settled", "completed_recent"].includes(status);
}

export function rewardDecayClassPlan(card = {}) {
  const severity = String(card.rewardDecay?.severity || "");
  if (severity === "warning") return " is-reward-warning";
  if (severity === "danger") return " is-reward-danger";
  return "";
}

export function rewardDecayTextPlan(card = {}) {
  const decay = card.rewardDecay || {};
  if (!decay.applies) return "";
  if (decay.severity === "warning" || decay.severity === "danger") {
    const rate = Number(decay.dailyPenaltyPercent || 0);
    const current = Number(decay.effectiveRewardCapCoins || 0);
    const total = Number(decay.rewardCapCoins || taskRewardCapCoinsPlan(card));
    return `已发布 ${cardPublishedAgeTextPlan(card)} · 每日 -${rate}% · 当前 ${current}/${total}`;
  }
  return "规则 48h 黄 -5%/日，72h 红 -10%/日";
}

export function boardRewardDecayRulePlan(board = {}) {
  const cards = asArrayPlan(board.cards);
  const applies = cards.some((card) => card?.rewardDecay?.applies);
  const hasDanger = cards.some((card) => String(card?.rewardDecay?.severity || "") === "danger");
  const hasWarning = cards.some((card) => String(card?.rewardDecay?.severity || "") === "warning");
  return {
    applies,
    severityClass: hasDanger ? " is-danger" : hasWarning ? " is-warning" : "",
  };
}

export function boardCardViewPlan(card = {}, options = {}) {
  const taskCardId = String(card.taskCardId || "");
  const workspaceId = String(card.workspaceId || options.workspaceId || "");
  const evaluation = card.latestEvaluation || {};
  const score = Number(evaluation.score);
  const completed = isCompletedBoardCardPlan(card);
  return {
    taskCardId,
    workspaceId,
    title: card.title || taskCardId || "学习任务",
    statusText: boardStatusTextPlan(card),
    rewardText: cardRewardTextPlan(card),
    instructionPreview: card.instructionPreview || "",
    activityType: card.activityType || "",
    scoreText: Number.isFinite(score) && score > 0 ? `${Math.round(score)} 分` : "",
    artifactCount: Number(card.artifactCount || 0),
    artifactDirectoryPath: String(card.artifactDirectoryPath || "").trim(),
    openTime: completed ? "" : cardOpenTimeTextPlan(card),
    ageText: completed ? "" : cardPublishedAgeTextPlan(card),
    completed,
    rewardDecayClass: rewardDecayClassPlan(card),
  };
}

export function learningGrowthBoardViewPlan(board = {}, options = {}) {
  const cards = asArrayPlan(board.cards);
  const cardById = new Map(cards.map((card) => [String(card.taskCardId || ""), card]));
  const lanes = asArrayPlan(board.lanes);
  const laneModels = lanes.map((lane) => {
    const laneCards = asArrayPlan(lane.cards)
      .map((id) => cardById.get(String(id || "")))
      .filter(Boolean);
    const id = String(lane.id || "");
    return {
      ...lane,
      id,
      title: boardLaneTitlePlan(id, lane.title),
      count: Number(lane.count ?? laneCards.length) || laneCards.length,
      laneCards,
      cardPlans: laneCards.map((card) => boardCardViewPlan(card, options)),
    };
  });
  const requestedLane = String(options.activeGrowthBoardLane || "").trim();
  const visibleLaneModels = laneModels.filter((lane) => lane.count > 0);
  const displayLaneModels = visibleLaneModels.length ? visibleLaneModels : laneModels;
  const fallbackLane = displayLaneModels.find((lane) => lane.count > 0)?.id || displayLaneModels[0]?.id || "";
  const activeLaneId = displayLaneModels.some((lane) => lane.id === requestedLane) ? requestedLane : fallbackLane;
  return {
    empty: !lanes.length,
    lanes: displayLaneModels,
    activeLaneId,
    decayRule: boardRewardDecayRulePlan(board),
  };
}

export function readinessStatusTextPlan(status) {
  const value = String(status || "");
  if (value === "operational_ready") return "Operational ready";
  if (value === "system_ready") return "System ready";
  if (value === "blocked") return "Blocked";
  return value || "Unknown";
}

export function readinessMetricPlan(label, value) {
  return {
    label,
    percent: Math.max(0, Math.min(100, Number(value || 0))),
  };
}

export function masteryStatusTextPlan(status = "") {
  const key = String(status || "").trim();
  if (key === "mastered") return "已掌握";
  if (key === "practicing") return "练习中";
  if (key === "needs_repair") return "需修复";
  if (key === "emerging") return "刚出现";
  if (key === "not_observed") return "未观察";
  return key || "未定";
}

export function masteryStrategyTextPlan(strategy = "") {
  const key = String(strategy || "").trim();
  if (key === "repair") return "修复";
  if (key === "stretch") return "拓展";
  if (key === "stabilize") return "巩固";
  if (key === "review") return "复习";
  if (key === "observe") return "观察";
  return key || "待定";
}

export function masteryDomainTextPlan(domain = "") {
  const key = String(domain || "").trim();
  if (key === "english") return "英语";
  if (key === "math") return "数学";
  if (key === "science") return "科学";
  if (key === "computer_science") return "计算机科学";
  if (key === "learning_habit") return "学习习惯";
  return key || "综合";
}

export function uniqueRewardTasksPlan(overview = {}) {
  const seen = new Set();
  return [
    ...asArrayPlan(overview.board?.cards),
    ...asArrayPlan(overview.programs?.taskCards),
    ...asArrayPlan(overview.programs?.executableTasks),
  ].filter((task) => {
    const id = String(task?.taskCardId || task?.id || "");
    if (!id || seen.has(id) || task?.readOnly || id.startsWith("legacy_todo:")) return false;
    seen.add(id);
    return true;
  });
}

export function taskSeriesKeyPlan(task = {}) {
  return String(task.sequenceGroupId || task.programId || task.templateId || task.taskModel?.templateId || task.taskCardId || task.id || "").trim();
}

export function taskSeriesLabelPlan(series = {}) {
  if (series.templateId === "english-speaking-retell-v1") return "英语阅读复述";
  if (series.templateId === "english-short-writing-v1") return "英语短写作";
  if (series.templateId === "english-vocabulary-active-use-v1") return "英语词汇活用";
  return series.title || series.skillId || series.templateId || "学习任务系列";
}

export function rewardTaskSeriesPlan(overview = {}) {
  const groups = new Map();
  uniqueRewardTasksPlan(overview).forEach((task) => {
    const key = taskSeriesKeyPlan(task);
    if (!key) return;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        ids: [],
        title: task.title,
        templateId: task.templateId || task.taskModel?.templateId || "",
        skillId: task.skillId || asArrayPlan(task.skillIds)[0] || "",
        activityType: task.activityType || "",
        sequenceGroupId: task.sequenceGroupId || "",
        coins: taskRewardCapCoinsPlan(task),
      });
    }
    const group = groups.get(key);
    const id = String(task.taskCardId || task.id || "");
    if (id && !group.ids.includes(id)) group.ids.push(id);
    group.coins = taskRewardCapCoinsPlan(task);
  });
  return [...groups.values()].sort((a, b) => taskSeriesLabelPlan(a).localeCompare(taskSeriesLabelPlan(b), "zh-Hans-CN"));
}

export function ownerSettingsOverviewPlan({ overview = {}, options = {} } = {}) {
  const data = overview.programs || {};
  const coins = options.coins || overview.coins || {};
  const growth = coins.growth || {};
  const counts = data.launchOperations?.counts || {};
  const cards = asArrayPlan(overview.board?.cards);
  const completed = cards.filter((card) => /complete|completed|done/i.test(String(card?.status || card?.nextAction || ""))).length;
  const activeTasks = cards.filter((card) => !/complete|completed|done/i.test(String(card?.status || card?.nextAction || ""))).length;
  const earned = Number(growth.totalEarnedCoins || coins.balances?.earnedCoins || 0);
  return {
    learnerLabel: overview.learner?.displayName || overview.learner?.id || options.learnerId || "执行者",
    activeTasks,
    completed: completed || counts.completedTasks || 0,
    earned: Math.round(earned || 0),
    sevenDayAverage: averageCoinsForWindowPlan(coins, overview.metrics || {}, 7),
    thirtyDayAverage: averageCoinsForWindowPlan(coins, overview.metrics || {}, 30),
    pendingRewardSettlements: counts.pendingRewardSettlements || 0,
  };
}

export function learningGrowthSummaryPlan({ overview = {}, options = {} } = {}) {
  const learner = overview.learner || {};
  const metrics = overview.metrics || {};
  const coins = options.coins || overview.coins || {};
  const learnerLabel = learner.displayName || options.learnerId || learner.id || "Learner";
  const availableCoins = Number(coins.balances?.availableCoins || 0);
  const historicalCoins = Number(metrics.totalEarnedCoins
    || coins.growth?.totalEarnedCoins
    || coins.balances?.earnedCoins
    || availableCoins
    || 0);
  return {
    learnerLabel,
    coinText: String(Number.isFinite(historicalCoins) ? Math.round(historicalCoins) : 0),
    sevenDayAverage: averageCoinsForWindowPlan(coins, metrics, 7),
    thirtyDayAverage: averageCoinsForWindowPlan(coins, metrics, 30),
  };
}
