"use strict";

const { inferLearningTaskModelFromCard } = require("./learning-task-model-service");

function cleanString(value) {
  return String(value ?? "").trim();
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function positiveInteger(value, fallback = 30) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(200, Math.floor(parsed)));
}

function firstText(...values) {
  for (const value of values) {
    const text = cleanString(value);
    if (text) return text;
  }
  return "";
}

function cardId(card = {}) {
  return firstText(card.id, card.todo_id, card.todoId);
}

function cardStatus(card = {}) {
  return firstText(card.status, card.kanbanStatus, card.kanban_status).toLowerCase();
}

function cardTemplate(card = {}) {
  return firstText(
    card.kanbanCaseTemplate,
    card.kanban_case_template,
    card.caseTemplate,
    card.case_template,
    card.kanbanStudyKind,
    card.kanban_study_kind,
  ).toLowerCase();
}

function isLearningGrowthKanbanCard(card = {}) {
  return cardTemplate(card) === "learning-growth";
}

function isClosedKanbanStatus(status) {
  return ["done", "archived", "cancelled", "canceled", "completed"].includes(cleanString(status).toLowerCase());
}

function defaultManagedLearnerWorkspaceIds() {
  return ["weixin_stephen"];
}

function uniqueCleanStrings(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of arrayValue(values)) {
    const text = cleanString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function publicTaskStatus(card = {}) {
  const status = cardStatus(card);
  if (isClosedKanbanStatus(status)) return "completed";
  if (status === "blocked") return "blocked";
  if (status === "running" || status === "active") return "active";
  return "published";
}

function projectLearningGrowthKanbanTask(card = {}, input = {}) {
  const id = cardId(card);
  const workspaceId = firstText(card.workspaceId, card.workspace_id, input.workspaceId);
  const learnerId = firstText(
    card.assignee,
    card.kanbanAssignee,
    card.kanban_assignee,
    card.learnerId,
    card.studentId,
    input.learnerId,
  );
  const skillIds = arrayValue(card.skillIds || card.kanbanSkills || card.kanban_skills)
    .map((item) => cleanString(item))
    .filter(Boolean)
    .slice(0, 8);
  const taskModel = inferLearningTaskModelFromCard(card, {
    workspaceId,
    learnerId,
    skillIds,
  });
  return {
    taskCardId: id,
    todoId: id,
    source: "kanban",
    title: firstText(card.content, card.title, id),
    status: publicTaskStatus(card),
    kanbanStatus: cardStatus(card) || "open",
    taskCardType: "kanban_learning_growth",
    taskModel,
    domain: firstText(card.domain, "english"),
    workspaceId,
    learnerId,
    assignee: firstText(card.assignee, card.kanbanAssignee, card.kanban_assignee, learnerId),
    plannedDate: firstText(card.dueLocal, card.due_local, card.dueAt, card.due_at).slice(0, 16),
    plannedMinutes: Number(card.plannedMinutes || card.planned_minutes || 0) || 0,
    dueAt: firstText(card.dueAt, card.due_at),
    dueLocal: firstText(card.dueLocal, card.due_local),
    skillIds: skillIds.length ? skillIds : (taskModel?.skillId ? [taskModel.skillId] : []),
    kanbanCaseTemplate: "learning-growth",
    kanbanStudyKind: "learning-growth",
    kanbanCaseMode: firstText(card.kanbanCaseMode, card.kanban_case_mode, card.caseMode, card.case_mode),
    kanbanCaseCardId: firstText(card.kanbanCaseCardId, card.kanban_case_card_id, card.caseCardId, card.case_card_id),
    hasInstruction: Boolean(firstText(card.learnerInstruction, card.instruction, card.kanbanCaseCardGoal, card.kanban_case_card_goal)),
    openUrl: `/?view=todos&workspaceId=${encodeURIComponent(workspaceId)}&todoId=${encodeURIComponent(id)}`,
  };
}

function createLearningGrowthKanbanTaskService(options = {}) {
  const kanbanCardProvider = options.kanbanCardProvider || null;
  const managedLearnerWorkspaceIds = uniqueCleanStrings(options.managedLearnerWorkspaceIds || defaultManagedLearnerWorkspaceIds());

  function shouldIncludeOwnerKanbanCards(input = {}) {
    return Boolean(input.isOwner) && cleanString(input.workspaceId || input.selectedWorkspaceId) === "owner";
  }

  async function listOwnerManagedKanbanCards(input = {}) {
    if (!kanbanCardProvider || typeof kanbanCardProvider.listCards !== "function") {
      return { ok: true, cards: [], source: "kanban-unavailable" };
    }
    if (!shouldIncludeOwnerKanbanCards(input)) return { ok: true, cards: [], source: "kanban-skipped" };
    const listArgs = input.listArgs || {};
    const includeCompleted = Boolean(listArgs.includeCompleted);
    const limit = positiveInteger(listArgs.limit, 120);
    const cards = [];
    const errors = [];
    for (const learnerWorkspaceId of managedLearnerWorkspaceIds) {
      const result = await kanbanCardProvider.listCards({
        workspaceId: learnerWorkspaceId,
        scope: "mine",
        includeCompleted,
        assignee: listArgs.assignee || "",
        limit: Math.max(limit, 120),
        search: listArgs.search || "",
        ...(listArgs.targetId ? { targetId: listArgs.targetId } : {}),
      });
      if (!result?.ok) {
        errors.push(cleanString(result?.error || result?.result?.error || `Kanban lookup failed for ${learnerWorkspaceId}`));
        continue;
      }
      for (const card of arrayValue(result.data)) {
        if (!isLearningGrowthKanbanCard(card)) continue;
        if (!includeCompleted && isClosedKanbanStatus(cardStatus(card))) continue;
        cards.push(Object.assign({
          workspaceId: learnerWorkspaceId,
          ownerManagedLearnerWorkspaceId: learnerWorkspaceId,
        }, card));
      }
    }
    return {
      ok: errors.length === 0,
      cards: cards.slice(0, limit),
      source: "owner-managed-learning-growth",
      errors,
    };
  }

  async function listExecutableTasks(input = {}) {
    if (!kanbanCardProvider || typeof kanbanCardProvider.listCards !== "function") {
      return { ok: true, tasks: [], source: "kanban-unavailable" };
    }
    const workspaceId = cleanString(input.workspaceId) || cleanString(input.learnerId) || "owner";
    const learnerId = cleanString(input.learnerId || input.studentId) || workspaceId;
    const limit = positiveInteger(input.limit, 30);
    const result = await kanbanCardProvider.listCards({
      workspaceId,
      scope: "mine",
      includeCompleted: Boolean(input.includeCompleted),
      limit: Math.max(limit, 120),
      search: "",
    });
    if (!result?.ok) {
      return {
        ok: false,
        tasks: [],
        source: "kanban",
        error: cleanString(result?.error || result?.result?.error || "Kanban task lookup failed"),
      };
    }
    const tasks = arrayValue(result.data)
      .filter(isLearningGrowthKanbanCard)
      .filter((card) => input.includeCompleted || !isClosedKanbanStatus(cardStatus(card)))
      .map((card) => projectLearningGrowthKanbanTask(card, { workspaceId, learnerId }))
      .filter((task) => task.taskCardId)
      .slice(0, limit);
    return {
      ok: true,
      tasks,
      source: result.source || "kanban",
      board: result.board || "",
    };
  }

  return {
    listExecutableTasks,
    listOwnerManagedKanbanCards,
    shouldIncludeOwnerKanbanCards,
  };
}

module.exports = {
  createLearningGrowthKanbanTaskService,
  isLearningGrowthKanbanCard,
  projectLearningGrowthKanbanTask,
};
