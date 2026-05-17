"use strict";

const { executionQueueSummary } = require("./learning-task-card-service");

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return String(value).split(/[,\s]+/);
}

function uniqueStrings(values) {
  return [...new Set(asArray(values).map(cleanString).filter(Boolean))];
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(cleanString(value));
}

function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function addDaysIso(dateIso, days) {
  const base = isIsoDate(dateIso)
    ? new Date(`${dateIso}T00:00:00.000Z`)
    : new Date(`${todayIso()}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + Number(days || 0));
  return base.toISOString().slice(0, 10);
}

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function compareDate(a, b) {
  return cleanString(a).localeCompare(cleanString(b));
}

function normalizeStatusList(input, options = {}) {
  const requested = uniqueStrings(input);
  if (requested.length) return requested;
  if (options.includeAllStatuses) return ["published", "planned", "review_required", "blocked"];
  return ["published"];
}

function safeTaskSummary(task = {}) {
  const summary = executionQueueSummary(task);
  return {
    taskCardId: summary.taskCardId,
    programId: summary.programId,
    draftId: summary.draftId,
    kanbanCardId: summary.kanbanCardId,
    learnerId: summary.learnerId,
    workspaceId: summary.workspaceId,
    title: summary.title,
    domain: summary.domain,
    taskCardType: summary.taskCardType,
    status: summary.status,
    executionStatus: summary.executionStatus,
    plannedDate: summary.plannedDate,
    plannedMinutes: Number(summary.plannedMinutes || 0),
    skillIds: Array.isArray(summary.skillIds) ? summary.skillIds : [],
    templateId: summary.templateId,
    privacyLevel: "summary_only",
    summary: summary.summary,
  };
}

function taskPriority(task = {}) {
  if (task.status === "published") return 0;
  if (task.status === "review_required") return 1;
  if (task.status === "blocked") return 2;
  return 3;
}

function createEmptyDay(date) {
  return {
    date,
    totalMinutes: 0,
    pendingCount: 0,
    completedCount: 0,
    blockedCount: 0,
    reviewRequiredCount: 0,
    tasks: [],
  };
}

function buildGuidance(plan) {
  const nextTask = plan.nextTask || null;
  const skillIds = [];
  for (const day of plan.days) {
    for (const task of day.tasks) {
      for (const skillId of task.skillIds || []) {
        if (skillId && !skillIds.includes(skillId)) skillIds.push(skillId);
        if (skillIds.length >= 5) break;
      }
      if (skillIds.length >= 5) break;
    }
    if (skillIds.length >= 5) break;
  }
  return {
    suggestedAction: nextTask ? "start_next_task" : "no_task_ready",
    nextTaskId: nextTask?.taskCardId || "",
    focusSkillIds: skillIds,
    privacyLevel: "summary_only",
  };
}

function createLearningDailyPlanService(options = {}) {
  const taskCardService = options.taskCardService;
  if (!taskCardService || typeof taskCardService.listExecutorQueue !== "function") {
    throw new Error("learning daily plan service requires taskCardService");
  }
  const nowProvider = typeof options.now === "function" ? options.now : () => new Date();

  function listTaskSummaries(input = {}) {
    const statuses = normalizeStatusList(input.status, { includeAllStatuses: Boolean(input.includeAllStatuses) });
    const seen = new Set();
    const tasks = [];
    for (const status of statuses) {
      const rows = taskCardService.listExecutorQueue(Object.assign({}, input, {
        status,
        limit: input.scanLimit || input.limit || 200,
      }));
      for (const row of rows || []) {
        if (!row?.taskCardId || seen.has(row.taskCardId)) continue;
        seen.add(row.taskCardId);
        tasks.push(safeTaskSummary(row));
      }
    }
    return tasks;
  }

  function dailyPlan(input = {}) {
    const workspaceId = cleanString(input.workspaceId);
    const learnerId = cleanString(input.learnerId || input.studentId) || workspaceId;
    const days = clampInt(input.days, 1, 31, 7);
    const limit = clampInt(input.limit, 1, 200, 100);
    const startDate = isIsoDate(input.startDate || input.start_date)
      ? cleanString(input.startDate || input.start_date)
      : todayIso(nowProvider());
    const endDate = addDaysIso(startDate, days - 1);
    const buckets = new Map();
    for (let i = 0; i < days; i += 1) {
      const date = addDaysIso(startDate, i);
      buckets.set(date, createEmptyDay(date));
    }

    const sourceTasks = listTaskSummaries(Object.assign({}, input, {
      workspaceId,
      learnerId,
      limit,
      scanLimit: Math.max(limit, days * 20),
    }));
    const inRangeTasks = sourceTasks
      .filter((task) => isIsoDate(task.plannedDate))
      .filter((task) => compareDate(task.plannedDate, startDate) >= 0 && compareDate(task.plannedDate, endDate) <= 0)
      .sort((a, b) => compareDate(a.plannedDate, b.plannedDate) || taskPriority(a) - taskPriority(b) || cleanString(a.title).localeCompare(cleanString(b.title)))
      .slice(0, limit);

    for (const task of inRangeTasks) {
      const bucket = buckets.get(task.plannedDate);
      if (!bucket) continue;
      bucket.tasks.push(task);
      bucket.totalMinutes += Number(task.plannedMinutes || 0);
      if (task.status === "blocked") bucket.blockedCount += 1;
      else if (task.status === "review_required") bucket.reviewRequiredCount += 1;
      else if (task.executionStatus === "completed" || task.status === "completed") bucket.completedCount += 1;
      else bucket.pendingCount += 1;
    }

    const dayList = [...buckets.values()];
    const nextTask = inRangeTasks.find((task) => task.executionStatus === "pending_execution") || null;
    const overdueTasks = sourceTasks
      .filter((task) => isIsoDate(task.plannedDate))
      .filter((task) => compareDate(task.plannedDate, startDate) < 0)
      .filter((task) => task.executionStatus === "pending_execution")
      .slice(0, 20);
    const summary = {
      totalTasks: inRangeTasks.length,
      totalMinutes: dayList.reduce((sum, day) => sum + day.totalMinutes, 0),
      pendingTasks: dayList.reduce((sum, day) => sum + day.pendingCount, 0),
      completedTasks: dayList.reduce((sum, day) => sum + day.completedCount, 0),
      blockedTasks: dayList.reduce((sum, day) => sum + day.blockedCount, 0),
      reviewRequiredTasks: dayList.reduce((sum, day) => sum + day.reviewRequiredCount, 0),
      activeDays: dayList.filter((day) => day.tasks.length).length,
      overdueTasks: overdueTasks.length,
    };
    const plan = {
      learnerId,
      workspaceId,
      startDate,
      endDate,
      days: dayList,
      nextTask,
      overdueTasks,
      summary,
      privacyLevel: "summary_only",
    };
    return Object.assign(plan, { guidance: buildGuidance(plan) });
  }

  return {
    dailyPlan,
  };
}

module.exports = {
  createLearningDailyPlanService,
  safeTaskSummary,
};
