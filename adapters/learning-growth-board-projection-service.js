"use strict";

const {
  normalizeLearningCardRewardPolicy,
} = require("./learning-card-reward-policy-service");

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

function parseTimeMs(value) {
  const text = cleanString(value);
  if (!text) return 0;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
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

function taskLockedUntil(task = {}, nowIso = "") {
  const unlockAt = cleanString(task.nextCompletionAllowedAt || task.learningGrowthUnlockAt || task.unlockAt || task.availableAt || task.notBefore);
  if (!unlockAt) return "";
  const unlockMs = parseTimeMs(unlockAt);
  const nowMs = parseTimeMs(nowIso) || Date.now();
  return unlockMs && unlockMs > nowMs ? unlockAt : "";
}

function taskStatus(task = {}, latest = {}, context = {}) {
  const nativeAction = cleanString(task?.nativeState?.nextAction);
  if (nativeAction) return nativeAction;
  const status = cleanString(task.status || task.executionStatus).toLowerCase();
  if (["completed", "done", "closed", "archived"].includes(status)) return "complete";
  if (taskLockedUntil(task, context.nowIso)) return "locked_until";
  const reflectionStatus = cleanString(latest.reflection?.status);
  if (reflectionStatus === "accepted") return "complete";
  const evaluationStatus = cleanString(latest.evaluation?.status);
  if (evaluationStatus === "reflection_required") return "spoken_reflection";
  if (evaluationStatus === "needs_repair" || evaluationStatus === "needs_revision") return "revise";
  if (latest.evaluation?.passed) return "complete";
  if (cleanString(latest.submission?.status)) return "waiting_feedback";
  return "submit";
}

function laneForTask(task = {}, latest = {}, today = todayKey(), context = {}) {
  const action = taskStatus(task, latest, context);
  if (action === "locked_until") return "locked_until";
  if (action === "spoken_reflection") return "reflection_required";
  if (action === "revise") return "needs_revision";
  if (action === "waiting_feedback") return "waiting_ai";
  if (action === "complete") return "completed_recent";
  if (dateKey(task.plannedDate || task.dueLocal || task.dueAt) === today) return "today";
  return "ready";
}

function primaryActionForLane(laneId, action) {
  if (laneId === "locked_until") return "locked";
  if (laneId === "waiting_ai") return "wait";
  if (laneId === "needs_revision") return "revise";
  if (laneId === "reflection_required") return "reflect";
  if (laneId === "completed_recent") return "review";
  return action === "submit" ? "submit" : action || "open";
}

function sequenceIndexForTask(task = {}, fallbackIndex = 0) {
  const values = [
    task.sequenceIndex,
    task.learningGrowthJitGeneration?.sequenceIndex,
    task.taskModel?.jitGeneration?.sequenceIndex,
    task.nativeState?.sequenceIndex,
    task.kanbanCaseCardIndex,
    task.caseCardIndex,
  ];
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  return Math.max(1, Number(fallbackIndex || 0) + 1);
}

function sequenceGroupForTask(task = {}) {
  const explicit = cleanString(task.sequenceGroupId || task.sequence_group_id);
  if (explicit) return explicit;
  const programId = cleanString(task.programId || task.learningProgramId || task.learning_program_id);
  if (programId) return `program:${programId}`;
  const draftId = cleanString(task.draftId || task.learningDraftId || task.learning_draft_id);
  if (draftId) return `draft:${draftId}`;
  const taskCardId = cleanString(task.taskCardId || task.id);
  return taskCardId ? `task:${taskCardId}` : "task:unknown";
}

function taskComplete(card = {}) {
  return card.laneId === "completed_recent" || card.nextAction === "complete";
}

function completionTimeForCard(card = {}) {
  return cleanString(
    card.latestReflection?.submittedAt
      || card.latestReflection?.createdAt
      || card.completedAt
      || card.latestEvaluation?.createdAt
      || card.latestSubmission?.submittedAt
      || card.generatedAt
      || card.openedAt,
  );
}

function actionModel(laneId, action) {
  return {
    canSubmit: laneId !== "locked_until" && (action === "submit" || action === "revise"),
    canWithdraw: action === "waiting_feedback",
    canReflect: action === "spoken_reflection",
    canOpenArtifacts: laneId === "completed_recent" || laneId === "reflection_required" || laneId === "needs_revision",
    primaryAction: primaryActionForLane(laneId, action),
  };
}

function publicBoardCard(task = {}, context = {}, index = 0) {
  const taskCardId = cleanString(task.taskCardId || task.id);
  const rewardPolicy = normalizeLearningCardRewardPolicy(task.rewardPolicy || { rewardCapCoins: task.rewardCapCoins });
  const openedAt = cleanString(
    task.availableAt
      || task.unlockAt
      || task.learningGrowthUnlockAt
      || task.learningGrowthJitGeneration?.generatedAt
      || task.taskModel?.jitGeneration?.generatedAt
      || task.createdAt
      || task.plannedDate,
  );
  const latest = {
    submission: task.latestSubmission || latestForTask(context.submissions, taskCardId, "submittedAt"),
    evaluation: task.latestEvaluation || latestForTask(context.evaluations, taskCardId, "createdAt"),
    reflection: task.latestReflection || latestForTask(context.reflections, taskCardId, "submittedAt"),
  };
  const artifacts = arrayValue(context.artifacts)
    .filter((artifact) => cleanString(artifact?.taskCardId) === taskCardId)
    .map(publicArtifactPreview);
  const action = taskStatus(task, latest, context);
  const laneId = laneForTask(task, latest, context.today, context);
  const actions = actionModel(laneId, action);
  const nextCompletionAllowedAt = cleanString(task.nextCompletionAllowedAt || task.learningGrowthUnlockAt || task.unlockAt || task.availableAt || task.notBefore);
  return {
    taskCardId,
    todoId: cleanString(task.todoId || task.kanbanCardId),
    source: cleanString(task.source),
    legacySource: cleanString(task.legacySource),
    readOnly: Boolean(task.readOnly),
    workspaceId: cleanString(task.workspaceId || task.learnerId || task.assignee),
    programId: cleanString(task.programId || task.learningProgramId || task.learning_program_id),
    draftId: cleanString(task.draftId || task.learningDraftId || task.learning_draft_id),
    sequenceGroupId: sequenceGroupForTask(task),
    sequenceIndex: sequenceIndexForTask(task, index),
    title: cleanString(task.title, 180) || taskCardId,
    instructionPreview: cleanString(
      task.learnerInstruction
        || task.instruction
        || task.instructionPreview
        || task.taskModel?.learnerInstruction
        || task.summary
        || task.description,
      220,
    ),
    domain: cleanString(task.domain),
    activityType: cleanString(task.activityType || task.taskModel?.activityType || task.taskModel?.skillId || task.taskCardType),
    plannedDate: cleanString(task.plannedDate),
    openedAt,
    generatedAt: openedAt,
    plannedMinutes: numberValue(task.plannedMinutes),
    status: cleanString(task.status || task.executionStatus),
    completedAt: cleanString(task.completedAt || task.finishedAt || task.closedAt),
    nextCompletionAllowedAt,
    nextAction: action,
    laneId,
    latestSubmission: latest.submission || null,
    latestEvaluation: latest.evaluation || null,
    latestReflection: latest.reflection || null,
    artifactCount: artifacts.length || numberValue(task.artifactCount),
    artifactPreview: artifacts.slice(0, 3),
    rewardState: cleanString(latest.evaluation?.passed ? "eligible_after_reflection" : ""),
    rewardPolicy,
    rewardCapCoins: rewardPolicy.maxCoins,
    primaryAction: actions.primaryAction,
    actions,
  };
}

function visibleSequenceCards(cards = []) {
  const visible = [];
  const hidden = [];
  const groups = new Map();
  for (const [index, card] of arrayValue(cards).entries()) {
    const groupId = cleanString(card.sequenceGroupId) || `task:${cleanString(card.taskCardId)}`;
    if (!groups.has(groupId)) groups.set(groupId, []);
    groups.get(groupId).push(Object.assign({ _boardIndex: index }, card));
  }
  for (const groupCards of groups.values()) {
    const sorted = groupCards.slice().sort((a, b) => {
      const ai = Number(a.sequenceIndex || 0) || 0;
      const bi = Number(b.sequenceIndex || 0) || 0;
      if (ai !== bi) return ai - bi;
      const ad = cleanString(a.plannedDate);
      const bd = cleanString(b.plannedDate);
      if (ad !== bd) return ad < bd ? -1 : 1;
      return a._boardIndex - b._boardIndex;
    });
    let currentOpen = false;
    for (const card of sorted) {
      if (taskComplete(card)) {
        visible.push(Object.assign({}, card, { sequenceVisibility: "completed" }));
        continue;
      }
      if (!currentOpen) {
        currentOpen = true;
        visible.push(Object.assign({}, card, { sequenceVisibility: "current" }));
      } else {
        hidden.push(Object.assign({}, card, { sequenceVisibility: "locked_future" }));
      }
    }
  }
  visible.sort((a, b) => a._boardIndex - b._boardIndex);
  return {
    cards: visible.map(({ _boardIndex, ...card }) => card),
    hiddenCards: hidden.map(({ _boardIndex, ...card }) => card),
  };
}

function defaultLanes() {
  return [
    { id: "today", title: "Today", cards: [] },
    { id: "ready", title: "Ready", cards: [] },
    { id: "locked_until", title: "Locked until next window", cards: [] },
    { id: "waiting_ai", title: "Waiting for AI", cards: [] },
    { id: "needs_revision", title: "Needs revision", cards: [] },
    { id: "reflection_required", title: "Reflection required", cards: [] },
    { id: "completed_recent", title: "Completed recent", cards: [] },
  ];
}

function mergeTasks(programs = {}) {
  const seen = new Set();
  const tasks = [];
  for (const task of arrayValue(programs.taskCards).concat(arrayValue(programs.executableTasks))) {
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
  const clock = input.clock || Date;
  const nowIso = input.nowIso || (typeof clock.now === "function" ? new Date(clock.now()).toISOString() : new Date().toISOString());
  const context = {
    today,
    nowIso,
    submissions: arrayValue(programs.taskSubmissions),
    evaluations: arrayValue(programs.evaluations),
    reflections: arrayValue(programs.taskReflections),
    artifacts: arrayValue(programs.taskArtifacts),
  };
  const allCards = mergeTasks(programs).map((task, index) => publicBoardCard(task, context, index));
  const sequence = visibleSequenceCards(allCards);
  const cards = sequence.cards;
  const laneList = defaultLanes();
  const laneMap = new Map(laneList.map((lane) => [lane.id, lane]));
  for (const card of cards) {
    const lane = laneMap.get(card.laneId) || laneMap.get("ready");
    lane.cards.push(card.taskCardId);
  }
  const cardById = new Map(cards.map((card) => [card.taskCardId, card]));
  const completedLane = laneMap.get("completed_recent");
  if (completedLane) {
    completedLane.cards.sort((a, b) => {
      const at = completionTimeForCard(cardById.get(a));
      const bt = completionTimeForCard(cardById.get(b));
      if (at !== bt) return at > bt ? -1 : 1;
      return String(a).localeCompare(String(b));
    });
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
      visibleCardCount: cards.length,
      totalCardCount: allCards.length,
      hiddenFutureCardCount: sequence.hiddenCards.length,
      availableCoins: numberValue(overview.metrics?.availableCoins),
      pendingRedemptions: numberValue(overview.metrics?.pendingRedemptions),
      sequencePolicy: "current_card_only_then_unlock_next",
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
  visibleSequenceCards,
};
