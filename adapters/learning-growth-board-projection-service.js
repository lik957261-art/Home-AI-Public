"use strict";

function cleanString(value, limit = 1000) {
  const text = String(value ?? "").trim();
  const max = Math.max(1, Number(limit || 1000) || 1000);
  return text.length > max ? text.slice(0, max) : text;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function numberValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateKey(value) {
  return cleanString(value).slice(0, 10);
}

function todayKey(clock = Date) {
  const now = typeof clock.now === "function" ? new Date(clock.now()) : new Date();
  return Number.isNaN(now.getTime()) ? new Date().toISOString().slice(0, 10) : now.toISOString().slice(0, 10);
}

function latestForTask(records = [], taskCardId = "", field = "updatedAt") {
  const id = cleanString(taskCardId);
  if (!id) return null;
  let latest = null;
  for (const record of arrayValue(records)) {
    if (cleanString(record?.taskCardId) !== id) continue;
    if (!latest) {
      latest = record;
      continue;
    }
    const currentTime = cleanString(record?.[field] || record?.updatedAt || record?.createdAt);
    const latestTime = cleanString(latest?.[field] || latest?.updatedAt || latest?.createdAt);
    if (currentTime > latestTime) latest = record;
  }
  return latest;
}

function publicArtifactPreview(artifact) {
  return {
    artifactId: cleanString(artifact?.artifactId),
    artifactType: cleanString(artifact?.artifactType),
    title: cleanString(artifact?.title, 160),
    name: cleanString(artifact?.name || artifact?.refName, 160),
    mime: cleanString(artifact?.mime, 120),
    size: numberValue(artifact?.size),
    status: cleanString(artifact?.status),
  };
}

function taskStatus(task = {}, latest = {}) {
  const nativeAction = cleanString(task?.nativeState?.nextAction);
  if (nativeAction) return nativeAction;
  const reflectionStatus = cleanString(latest.reflection?.status);
  if (reflectionStatus === "accepted") return "complete";
  const evaluationStatus = cleanString(latest.evaluation?.status);
  if (evaluationStatus === "reflection_required") return "spoken_reflection";
  if (evaluationStatus === "needs_repair" || evaluationStatus === "needs_revision") return "revise";
  if (latest.evaluation?.passed) return "complete";
  if (cleanString(latest.submission?.status)) return "waiting_feedback";
  return "submit";
}

function laneForTask(task = {}, latest = {}, today = todayKey()) {
  const action = taskStatus(task, latest);
  if (action === "spoken_reflection") return "reflection_required";
  if (action === "revise") return "needs_revision";
  if (action === "waiting_feedback") return "waiting_ai";
  if (action === "complete") return "completed_recent";
  if (dateKey(task.plannedDate || task.dueLocal || task.dueAt) === today) return "today";
  return "ready";
}

function primaryActionForLane(laneId, action) {
  if (laneId === "waiting_ai") return "wait";
  if (laneId === "needs_revision") return "revise";
  if (laneId === "reflection_required") return "reflect";
  if (laneId === "completed_recent") return "review";
  return action === "submit" ? "submit" : action || "open";
}

function actionModel(laneId, action) {
  return {
    canSubmit: action === "submit" || action === "revise",
    canWithdraw: action === "waiting_feedback",
    canReflect: action === "spoken_reflection",
    canOpenArtifacts: laneId === "completed_recent" || laneId === "reflection_required" || laneId === "needs_revision",
    primaryAction: primaryActionForLane(laneId, action),
  };
}

function publicBoardCard(task = {}, context = {}) {
  const taskCardId = cleanString(task.taskCardId || task.id);
  const latest = {
    submission: task.latestSubmission || latestForTask(context.submissions, taskCardId, "submittedAt"),
    evaluation: task.latestEvaluation || latestForTask(context.evaluations, taskCardId, "createdAt"),
    reflection: task.latestReflection || latestForTask(context.reflections, taskCardId, "submittedAt"),
  };
  const artifacts = arrayValue(context.artifacts)
    .filter((artifact) => cleanString(artifact?.taskCardId) === taskCardId)
    .map(publicArtifactPreview);
  const action = taskStatus(task, latest);
  const laneId = laneForTask(task, latest, context.today);
  const actions = actionModel(laneId, action);
  return {
    taskCardId,
    title: cleanString(task.title, 180) || taskCardId,
    domain: cleanString(task.domain),
    activityType: cleanString(task.taskModel?.activityType || task.taskModel?.skillId || task.taskCardType),
    plannedDate: cleanString(task.plannedDate),
    plannedMinutes: numberValue(task.plannedMinutes),
    status: cleanString(task.status || task.executionStatus),
    nextAction: action,
    laneId,
    latestSubmission: latest.submission || null,
    latestEvaluation: latest.evaluation || null,
    latestReflection: latest.reflection || null,
    artifactCount: artifacts.length || numberValue(task.artifactCount),
    artifactPreview: artifacts.slice(0, 3),
    rewardState: cleanString(latest.evaluation?.passed ? "eligible_after_reflection" : ""),
    primaryAction: actions.primaryAction,
    actions,
  };
}

function defaultLanes() {
  return [
    { id: "today", title: "Today", cards: [] },
    { id: "ready", title: "Ready", cards: [] },
    { id: "waiting_ai", title: "Waiting for AI", cards: [] },
    { id: "needs_revision", title: "Needs revision", cards: [] },
    { id: "reflection_required", title: "Reflection required", cards: [] },
    { id: "completed_recent", title: "Completed recent", cards: [] },
  ];
}

function mergeTasks(programs = {}) {
  const seen = new Set();
  const tasks = [];
  for (const task of arrayValue(programs.executableTasks).concat(arrayValue(programs.taskCards))) {
    const id = cleanString(task?.taskCardId || task?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    tasks.push(task);
  }
  return tasks;
}

function guidanceWindow(programs = {}, metrics = {}) {
  const profileSummary = cleanString(programs.learnerProfile?.profileSummary, 360);
  const weakSkills = arrayValue(programs.skillStates)
    .filter((skill) => Number(skill?.confidence || 0) > 0 && Number(skill?.confidence || 0) < 0.65)
    .slice(0, 4)
    .map((skill) => ({
      skillId: cleanString(skill.skillId),
      confidence: numberValue(skill.confidence),
      summary: cleanString(skill.summary, 160),
    }));
  return {
    profileSummary,
    weakSkills,
    availableCoins: numberValue(metrics.availableCoins),
  };
}

function buildLearningGrowthBoard(input = {}) {
  const overview = input.overview && typeof input.overview === "object" ? input.overview : {};
  const programs = overview.programs && typeof overview.programs === "object" ? overview.programs : {};
  const today = input.today || todayKey(input.clock || Date);
  const context = {
    today,
    submissions: arrayValue(programs.taskSubmissions),
    evaluations: arrayValue(programs.evaluations),
    reflections: arrayValue(programs.taskReflections),
    artifacts: arrayValue(programs.taskArtifacts),
  };
  const cards = mergeTasks(programs).map((task) => publicBoardCard(task, context));
  const laneList = defaultLanes();
  const laneMap = new Map(laneList.map((lane) => [lane.id, lane]));
  for (const card of cards) {
    const lane = laneMap.get(card.laneId) || laneMap.get("ready");
    lane.cards.push(card.taskCardId);
  }
  const coins = overview.coins ? {
    balances: overview.coins.balances || null,
    growth: overview.coins.growth || null,
    rewards: overview.coins.rewards || [],
    redemptions: overview.coins.redemptions || [],
  } : null;
  const owner = cleanString(overview.viewerRole) === "owner";
  const board = {
    learner: overview.learner || null,
    role: cleanString(overview.viewerRole) || "executor",
    summary: {
      cardCount: cards.length,
      availableCoins: numberValue(overview.metrics?.availableCoins),
      pendingRedemptions: numberValue(overview.metrics?.pendingRedemptions),
    },
    lanes: laneList.map((lane) => Object.assign({}, lane, { count: lane.cards.length })),
    cards,
    coins,
    guidanceWindow: guidanceWindow(programs, overview.metrics || {}),
  };
  if (owner) {
    board.ownerPanel = {
      parentReviewCount: arrayValue(programs.parentReviewRequests).length,
      rewardSettlementCount: arrayValue(programs.rewardSettlements).length,
      reviewItemCount: arrayValue(programs.reviewItems).length,
    };
  }
  return board;
}

function createLearningGrowthBoardProjectionService(options = {}) {
  const learningGrowthService = options.learningGrowthService || null;
  const clock = options.clock || Date;
  if (!learningGrowthService || typeof learningGrowthService.overview !== "function") {
    throw new Error("learning growth board projection requires learningGrowthService.overview");
  }
  return {
    board(input = {}) {
      const overview = learningGrowthService.overview(Object.assign({}, input, {
        limit: Math.max(Number(input.limit || 0) || 0, 80),
      }));
      return Object.assign({}, overview, {
        board: buildLearningGrowthBoard({ overview, clock }),
      });
    },
  };
}

module.exports = {
  buildLearningGrowthBoard,
  createLearningGrowthBoardProjectionService,
  laneForTask,
  publicBoardCard,
};
