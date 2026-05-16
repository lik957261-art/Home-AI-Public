"use strict";

const crypto = require("node:crypto");

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
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

function materializeTask(program = {}, draft = {}, day = {}, task = {}) {
  const sourceBasisRefs = asArray(task.sourceBasisRefs).length ? asArray(task.sourceBasisRefs) : asArray(program.sourceBasisRefs);
  const curriculumRefs = asArray(task.curriculumRefs).length ? asArray(task.curriculumRefs) : asArray(program.curriculumRefs);
  return {
    taskCardId: stableTaskCardId(draft.draftId, task.taskId),
    programId: program.programId || draft.programId,
    draftId: draft.draftId,
    learnerId: program.learnerId || draft.learnerId,
    workspaceId: program.workspaceId || draft.workspaceId,
    kanbanCardId: task.kanbanCardId || "",
    title: cleanString(task.title) || "Learning task",
    domain: cleanString(task.domain || program.domain) || "english",
    taskCardType: cleanString(task.taskCardType) || "single_subject",
    status: draftStatusToTaskStatus(draft.status),
    plannedDate: cleanString(day.date || draft.weekStart),
    plannedMinutes: Number(task.plannedMinutes || 0),
    skillIds: asArray(task.skillIds).map(cleanString).filter(Boolean),
    templateId: cleanString(task.templateId),
    interactionStateMachine: asArray(task.interactionStateMachine).map(cleanString).filter(Boolean),
    sourceBasisRefs,
    curriculumRefs,
    privacyLevel: cleanString(task.privacyLevel) || "summary_only",
    reliability: {
      confidence: Number(task.confidence || 0),
      guardLevel: draft.reliability?.guardLevel || "",
      publishBlocked: Boolean(draft.reliability?.publishBlocked),
      parentReviewRequired: Boolean(draft.reliability?.parentReviewRequired),
    },
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

  return {
    get,
    list,
    materializeDraft,
  };
}

module.exports = {
  createLearningTaskCardService,
  materializeTask,
  stableTaskCardId,
};
