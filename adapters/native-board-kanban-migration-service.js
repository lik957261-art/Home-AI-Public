"use strict";

const crypto = require("node:crypto");
const { inferLearningTaskModelFromCard } = require("./learning-task-model-service");
const { isLearningGrowthKanbanCard } = require("./learning-growth-kanban-task-service");
const { createLearningGrowthNativeBackfillService } = require("./learning-growth-native-backfill-service");

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

function firstText(...values) {
  for (const value of values) {
    const text = cleanString(value);
    if (text) return text;
  }
  return "";
}

function stableId(prefix, parts = []) {
  const digest = crypto.createHash("sha256")
    .update(parts.map((part) => cleanString(part, 500)).join(":"))
    .digest("hex")
    .slice(0, 18);
  return `${prefix}_${digest}`;
}

function cardId(card = {}) {
  return firstText(card.id, card.todoId, card.todo_id, card.cardId);
}

function field(card = {}, ...keys) {
  for (const key of keys) {
    const value = cleanString(card[key]);
    if (value) return value;
  }
  return "";
}

function arrayField(card = {}, ...keys) {
  for (const key of keys) {
    const value = card[key];
    if (Array.isArray(value)) return value.map((item) => cleanString(item)).filter(Boolean);
  }
  return [];
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

function cardMode(card = {}) {
  return firstText(card.kanbanCaseMode, card.kanban_case_mode, card.caseMode, card.case_mode).toLowerCase();
}

function isClosedStatus(status) {
  return ["done", "archived", "cancelled", "canceled", "completed"].includes(cleanString(status).toLowerCase());
}

function isLearningKanbanCard(card = {}) {
  if (isLearningGrowthKanbanCard(card)) return true;
  if (field(card, "learningTaskCardId", "learning_task_card_id", "learningProgramId", "learning_program_id")) return true;
  const template = cardTemplate(card);
  const mode = cardMode(card);
  return ["learning-growth", "reading", "assessment", "programming", "programming-assessment"].includes(template)
    || ["study-plan", "assessment-plan", "learning-growth"].includes(mode);
}

function taskCardIdFromCard(card = {}) {
  return field(card, "learningTaskCardId", "learning_task_card_id", "kanbanCaseCardId", "kanban_case_card_id");
}

function taskStatusFromCard(card = {}) {
  const status = field(card, "status", "kanbanStatus", "kanban_status").toLowerCase();
  if (isClosedStatus(status)) return "completed";
  if (status === "blocked") return "blocked";
  return "published";
}

function safeSkillIds(card = {}, taskModel = {}) {
  const ids = arrayField(card, "skillIds", "kanbanSkills", "kanban_skills");
  if (ids.length) return ids.slice(0, 8);
  return taskModel?.skillId ? [cleanString(taskModel.skillId)] : [];
}

function buildNativeTaskCard(card = {}) {
  const id = cardId(card);
  const taskModel = inferLearningTaskModelFromCard(card, {});
  const programId = field(card, "learningProgramId", "learning_program_id", "programId", "program_id");
  const draftId = field(card, "learningDraftId", "learning_draft_id", "draftId", "draft_id");
  const workspaceId = field(card, "workspaceId", "workspace_id", "ownerWorkspaceId", "owner_workspace_id", "assignee") || "owner";
  const learnerId = field(card, "learnerId", "studentId", "assignee", "kanbanAssignee", "kanban_assignee", "workspaceId", "workspace_id") || workspaceId;
  return {
    taskCardId: taskCardIdFromCard(card) || stableId("ltask_migrated", [id, programId, draftId]),
    programId,
    draftId,
    learnerId,
    workspaceId,
    kanbanCardId: id,
    title: field(card, "content", "title", "summary") || id,
    domain: field(card, "domain") || taskModel.domain || "english",
    taskCardType: field(card, "taskCardType", "task_card_type") || taskModel.taskCardType || "kanban_migrated",
    status: taskStatusFromCard(card),
    plannedDate: firstText(card.dueLocal, card.due_local, card.dueAt, card.due_at).slice(0, 16),
    plannedMinutes: numberValue(card.plannedMinutes || card.planned_minutes),
    skillIds: safeSkillIds(card, taskModel),
    templateId: field(card, "templateId", "template_id", "kanbanCaseTemplate", "kanban_case_template"),
    interactionStateMachine: arrayField(card, "interactionStateMachine", "interaction_state_machine"),
    sourceBasisRefs: arrayField(card, "sourceBasisRefs", "source_basis_refs"),
    curriculumRefs: arrayField(card, "curriculumRefs", "curriculum_refs"),
    privacyLevel: "summary_only",
    reliability: { migratedFrom: "official_kanban", confidence: 0.5 },
    taskModel,
    summary: "Migrated summary-only task reference from official Kanban.",
  };
}

function extractCards(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.cards)) return result.cards;
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.items)) return result.items;
  if (Array.isArray(result?.todos)) return result.todos;
  return [];
}

async function loadCards(provider, input = {}) {
  if (Array.isArray(input.cards)) return input.cards;
  if (!provider || typeof provider.listCards !== "function") return [];
  const result = await provider.listCards({
    workspaceId: cleanString(input.workspaceId) || "owner",
    scope: input.scope || "mine",
    includeCompleted: input.includeCompleted ?? true,
    limit: Math.max(1, Math.min(500, Number(input.limit || 200) || 200)),
  });
  return extractCards(result);
}

function resolveExistingTask(programService, card = {}) {
  if (!programService) return null;
  const taskCardId = taskCardIdFromCard(card);
  if (taskCardId && typeof programService.getTaskCard === "function") {
    const task = programService.getTaskCard(taskCardId);
    if (task) return task;
  }
  const id = cardId(card);
  if (id && typeof programService.getTaskCardForKanbanCard === "function") {
    return programService.getTaskCardForKanbanCard(id, {
      workspaceId: field(card, "workspaceId", "workspace_id"),
      learnerId: field(card, "learnerId", "studentId", "assignee", "workspaceId", "workspace_id"),
      programId: field(card, "learningProgramId", "learning_program_id"),
      draftId: field(card, "learningDraftId", "learning_draft_id"),
    });
  }
  return null;
}

function safeTodoFromCard(card = {}, index = 0) {
  const id = cardId(card) || stableId("todo_migrated", [index, field(card, "content", "title")]);
  const workspaceId = field(card, "workspaceId", "workspace_id", "ownerWorkspaceId", "owner_workspace_id") || "owner";
  const status = isClosedStatus(field(card, "status", "kanbanStatus", "kanban_status")) ? "done" : "open";
  return {
    id,
    workspaceId,
    principalId: field(card, "createdByPrincipal", "created_by_principal", "ownerWorkspaceId", "owner_workspace_id") || workspaceId,
    assignee: field(card, "assignee", "assignee_principal_id", "kanbanAssignee", "kanban_assignee"),
    status,
    content: field(card, "content", "title", "summary", "id").slice(0, 500),
    dueAt: field(card, "dueAt", "due_at", "dueLocal", "due_local"),
    source: "official_kanban_migrated",
    officialKanbanRef: id,
    migratedAt: new Date().toISOString(),
  };
}

function createNativeBoardKanbanMigrationService(options = {}) {
  const learningProgramService = options.learningProgramService || null;
  const repository = options.repository || learningProgramService?.repository || null;
  const mobileStore = options.mobileStore || null;
  const kanbanCardProvider = options.kanbanCardProvider || null;
  const growthBackfillService = options.growthBackfillService || createLearningGrowthNativeBackfillService({
    learningProgramService,
    repository,
  });

  async function ensureLearningTask(card, dryRun) {
    const existing = resolveExistingTask(learningProgramService, card);
    if (existing?.taskCardId) return { task: existing, created: false, status: "matched" };
    if (!repository || typeof repository.upsertTaskCard !== "function") {
      return { task: null, created: false, status: "skipped", reason: "missing-learning-repository" };
    }
    const task = buildNativeTaskCard(card);
    if (!task.programId || !task.draftId) {
      return { task: null, created: false, status: "skipped", reason: "missing-program-or-draft" };
    }
    if (dryRun) return { task, created: true, status: "would-create" };
    try {
      return { task: repository.upsertTaskCard(task), created: true, status: "created" };
    } catch (err) {
      return { task: null, created: false, status: "error", reason: cleanString(err.message || err, 240) };
    }
  }

  function importNativeTodo(card, index, dryRun) {
    const todo = safeTodoFromCard(card, index);
    if (!dryRun && mobileStore && typeof mobileStore.importTodoItem === "function") {
      try {
        mobileStore.importTodoItem(todo, index);
      } catch (err) {
        return { todo, status: "error", reason: cleanString(err.message || err, 240) };
      }
    }
    return { todo, status: dryRun ? "would-import" : "imported", reason: "" };
  }

  async function migrate(input = {}) {
    const dryRun = input.dryRun !== false;
    const cards = (await loadCards(kanbanCardProvider, input))
      .slice(0, Math.max(1, Math.min(500, Number(input.limit || 200) || 200)));
    const counts = {
      scanned: cards.length,
      learning: 0,
      learningCreated: 0,
      learningMatched: 0,
      learningSkipped: 0,
      learningArchived: 0,
      growthBackfilled: 0,
      nativeTodos: 0,
      errors: 0,
      dryRun,
    };
    const results = [];
    for (let index = 0; index < cards.length; index += 1) {
      const card = cards[index];
      const id = cardId(card);
      if (isLearningKanbanCard(card)) {
        counts.learning += 1;
        const ensured = await ensureLearningTask(card, dryRun);
        if (ensured.status === "created" || ensured.status === "would-create") counts.learningCreated += 1;
        if (ensured.status === "matched") counts.learningMatched += 1;
        if (ensured.status === "error") counts.errors += 1;
        let backfill = null;
        if (ensured.status === "skipped" && ensured.reason === "missing-program-or-draft") {
          const archived = importNativeTodo(card, index, dryRun);
          if (archived.status === "error") {
            counts.errors += 1;
            results.push({
              kanbanCardId: id,
              status: "error",
              target: "native-todo-archive",
              reason: archived.reason,
            });
            continue;
          }
          counts.learningArchived += 1;
          counts.nativeTodos += 1;
          results.push({
            kanbanCardId: id,
            status: dryRun ? "would-archive" : "archived",
            target: "native-todo-archive",
            todoId: archived.todo.id,
            reason: ensured.reason,
          });
          continue;
        }
        if (ensured.status === "skipped") counts.learningSkipped += 1;
        if (ensured.task?.taskCardId && isLearningGrowthKanbanCard(card)) {
          backfill = await growthBackfillService.backfill({ cards: [card], dryRun, limit: 1 });
          counts.growthBackfilled += Number(backfill?.counts?.matched || 0);
          counts.errors += Number(backfill?.counts?.errors || 0);
        }
        results.push({
          kanbanCardId: id,
          status: ensured.status,
          target: "learning-growth",
          taskCardId: ensured.task?.taskCardId || "",
          reason: ensured.reason || "",
          backfilled: Boolean(backfill?.counts?.matched),
        });
        continue;
      }
      const imported = importNativeTodo(card, index, dryRun);
      if (imported.status === "error") {
        counts.errors += 1;
        results.push({ kanbanCardId: id, status: "error", target: "native-todo", reason: imported.reason });
        continue;
      }
      counts.nativeTodos += 1;
      results.push({ kanbanCardId: id, status: imported.status, target: "native-todo", todoId: imported.todo.id });
    }
    return { ok: counts.errors === 0, counts, results };
  }

  return { migrate };
}

module.exports = {
  buildNativeTaskCard,
  createNativeBoardKanbanMigrationService,
  isLearningKanbanCard,
  safeTodoFromCard,
};
