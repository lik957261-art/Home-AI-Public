"use strict";

const crypto = require("node:crypto");
const {
  buildLearningTaskModel,
  learningTaskModelSummary,
} = require("./learning-task-model-service");

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return String(value).split(/\s*,\s*|\s+/);
}

function stableTaskCardId(draftId, taskId) {
  const digest = crypto.createHash("sha256").update(`${cleanString(draftId)}:${cleanString(taskId)}`).digest("hex").slice(0, 16);
  return `ltask_${digest}`;
}

function draftStatusToTaskStatus(status) {
  if (status === "blocked") return "blocked";
  if (status === "review_required") return "review_required";
  if (status === "published") return "published";
  return "planned";
}

function executionQueueSummary(task = {}) {
  const taskModel = task.taskModel && typeof task.taskModel === "object"
    ? learningTaskModelSummary(task.taskModel)
    : learningTaskModelSummary(buildLearningTaskModel(task));
  const kanbanCardId = cleanString(task.kanbanCardId);
  return {
    taskCardId: task.taskCardId,
    programId: task.programId,
    draftId: task.draftId,
    kanbanCardId: task.kanbanCardId,
    todoId: kanbanCardId,
    source: "learning-growth",
    learnerId: task.learnerId,
    workspaceId: task.workspaceId,
    title: task.title,
    domain: task.domain,
    taskCardType: task.taskCardType,
    status: task.status,
    executionStatus: task.status === "published" ? "pending_execution" : task.status,
    plannedDate: task.plannedDate,
    plannedMinutes: task.plannedMinutes,
    skillIds: task.skillIds,
    templateId: task.templateId,
    taskModel,
    privacyLevel: "summary_only",
    summary: task.summary,
    openUrl: task.taskCardId ? `/?view=learning&workspaceId=${encodeURIComponent(task.workspaceId || "")}&taskCardId=${encodeURIComponent(task.taskCardId)}` : "",
  };
}

function materializeTask(program = {}, draft = {}, day = {}, task = {}) {
  const sourceBasisRefs = asArray(task.sourceBasisRefs).length ? asArray(task.sourceBasisRefs) : asArray(program.sourceBasisRefs);
  const curriculumRefs = asArray(task.curriculumRefs).length ? asArray(task.curriculumRefs) : asArray(program.curriculumRefs);
  const taskModel = task.taskModel && typeof task.taskModel === "object"
    ? task.taskModel
    : buildLearningTaskModel(Object.assign({}, task, {
      domain: task.domain || program.domain,
      plannedMinutes: task.plannedMinutes,
    }));
  const interactionStateMachine = asArray(task.interactionStateMachine).length
    ? asArray(task.interactionStateMachine).map(cleanString).filter(Boolean)
    : asArray(taskModel.interactionStateMachine).map(cleanString).filter(Boolean);
  return {
    taskCardId: stableTaskCardId(draft.draftId, task.taskId),
    programId: program.programId || draft.programId,
    draftId: draft.draftId,
    learnerId: program.learnerId || draft.learnerId,
    workspaceId: program.workspaceId || draft.workspaceId,
    kanbanCardId: task.kanbanCardId || "",
    title: cleanString(task.title) || "Learning task",
    domain: cleanString(task.domain || program.domain) || "english",
    taskCardType: cleanString(task.taskCardType) || cleanString(taskModel.taskCardType) || "single_subject",
    status: draftStatusToTaskStatus(draft.status),
    plannedDate: cleanString(day.date || draft.weekStart),
    plannedMinutes: Number(task.plannedMinutes || 0),
    skillIds: asArray(task.skillIds).map(cleanString).filter(Boolean),
    templateId: cleanString(task.templateId),
    interactionStateMachine,
    sourceBasisRefs,
    curriculumRefs,
    privacyLevel: cleanString(task.privacyLevel) || "summary_only",
    reliability: {
      confidence: Number(task.confidence || 0),
      guardLevel: draft.reliability?.guardLevel || "",
      publishBlocked: Boolean(draft.reliability?.publishBlocked),
      parentReviewRequired: Boolean(draft.reliability?.parentReviewRequired),
    },
    taskModel,
    taskModelVersion: cleanString(taskModel.version),
    summary: cleanString(task.summary),
    aiInputContract: cleanString(task.aiInputContract),
    aiOutputContract: cleanString(task.aiOutputContract),
  };
}

function createLearningTaskCardService(options = {}) {
  const repository = options.repository;
  if (!repository || typeof repository.upsertTaskCard !== "function") {
    throw new Error("learning task card service requires repository");
  }

  function materializeDraft(input = {}) {
    const program = input.program || {};
    const draft = input.draft || {};
    const cards = [];
    for (const day of asArray(draft.dailyPlans)) {
      for (const task of asArray(day.tasks)) {
        cards.push(repository.upsertTaskCard(materializeTask(program, draft, day, task)));
      }
    }
    return cards;
  }

  function list(filters = {}) {
    return repository.listTaskCards(filters);
  }

  function get(taskCardId) {
    return repository.getTaskCard(taskCardId);
  }

  function listExecutorQueue(filters = {}) {
    const statuses = asArray(filters.status).length
      ? asArray(filters.status).map(cleanString).filter(Boolean)
      : ["published"];
    const seen = new Set();
    const cards = [];
    for (const status of statuses) {
      for (const card of repository.listTaskCards(Object.assign({}, filters, { status }))) {
        if (seen.has(card.taskCardId)) continue;
        seen.add(card.taskCardId);
        cards.push(executionQueueSummary(card));
      }
    }
    return cards.slice(0, Math.max(1, Math.min(200, Number(filters.limit || 50) || 50)));
  }

  return {
    get,
    list,
    listExecutorQueue,
    materializeDraft,
  };
}

module.exports = {
  createLearningTaskCardService,
  executionQueueSummary,
  materializeTask,
  stableTaskCardId,
};
