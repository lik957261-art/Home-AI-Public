"use strict";

function defaultPublicCard(row) {
  return row || {};
}

function cardMatchesSearch(card, search) {
  const needle = String(search || "").trim().toLowerCase();
  if (!needle) return true;
  return [
    card?.id,
    card?.content,
    card?.description,
    card?.assigneeLabel,
    card?.kanbanBoard,
    card?.kanbanStatus,
    card?.dueLocal,
  ].join("\n").toLowerCase().includes(needle);
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createKanbanCardProvider(options = {}) {
  const runBridge = options.runBridge;
  if (typeof runBridge !== "function") throw new TypeError("runBridge is required");

  const workspacePrincipal = typeof options.workspacePrincipal === "function"
    ? options.workspacePrincipal
    : (workspaceId) => String(workspaceId || "owner");
  const assigneesForWorkspace = typeof options.assigneesForWorkspace === "function"
    ? options.assigneesForWorkspace
    : () => [];
  const publicCard = typeof options.publicCard === "function" ? options.publicCard : defaultPublicCard;
  const sourceName = typeof options.sourceName === "function"
    ? options.sourceName
    : () => String(options.sourceName || "hermes_kanban");

  async function listCards(args = {}) {
    const workspaceId = args.workspaceId || "owner";
    const targetId = String(args.targetId || args.target_id || "").trim();
    const result = await runBridge({
      action: "list",
      workspace_id: workspaceId,
      source_principal: workspacePrincipal(workspaceId),
      scope: args.scope || "mine",
      include_completed: Boolean(args.includeCompleted),
      assignee: args.assignee || "",
      limit: positiveNumber(args.limit, 120),
      target_id: targetId,
    });
    if (!result?.ok) return { ok: false, result, error: result?.error || "Kanban operation failed" };

    const rows = Array.isArray(result.todos) ? result.todos : [];
    const data = rows
      .map((row, index) => publicCard(row, index, rows))
      .filter((card) => cardMatchesSearch(card, args.search) || (targetId && String(card?.id || "") === targetId));

    return {
      ok: true,
      data,
      assignees: assigneesForWorkspace(workspaceId),
      source: sourceName(),
      board: String(result.board || ""),
      result,
    };
  }

  function addCard(args = {}) {
    const workspaceId = args.workspaceId || "owner";
    return runBridge({
      action: "add",
      workspace_id: workspaceId,
      source_principal: workspacePrincipal(workspaceId),
      assignee: args.assignee || "",
      assignee_label: args.assigneeLabel || "",
      content: args.content || args.title || "",
      description: args.description || "",
      due_time: args.dueTime || args.due_time || "",
      reminder_lead_minutes: args.reminderLeadMinutes ?? args.reminder_lead_minutes ?? null,
      reason: args.reason || "",
      idempotency_key: args.idempotencyKey || args.idempotency_key || "",
      manual_only: args.manualOnly ?? args.manual_only ?? null,
      auto_dispatch: args.autoDispatch ?? args.auto_dispatch ?? null,
      kanban_assignee: args.kanbanAssignee || args.kanban_assignee || "",
      case_id: args.caseId || args.case_id || "",
      case_mode: args.caseMode || args.case_mode || "",
      case_template: args.caseTemplate || args.case_template || "",
      case_source_text: args.caseSourceText || args.case_source_text || "",
      case_summary: args.caseSummary || args.case_summary || "",
      case_cover: args.caseCover || args.case_cover || null,
      topic_thread_id: args.topicThreadId || args.topic_thread_id || "",
      topic_task_group_id: args.topicTaskGroupId || args.topic_task_group_id || "",
      shared_directory_path: args.sharedDirectoryPath || args.shared_directory_path || "",
      case_directory_path: args.caseDirectoryPath || args.case_directory_path || "",
      case_card_id: args.caseCardId || args.case_card_id || "",
      case_card_index: args.caseCardIndex ?? args.case_card_index ?? 0,
      case_card_count: args.caseCardCount ?? args.case_card_count ?? 0,
      case_depends_on: args.caseDependsOn || args.case_depends_on || [],
      case_deliverables: args.caseDeliverables || args.case_deliverables || [],
      case_acceptance: args.caseAcceptance || args.case_acceptance || [],
      case_card_goal: args.caseCardGoal || args.case_card_goal || "",
      case_creation_skill_id: args.caseCreationSkillId || args.case_creation_skill_id || "",
      learning_program_id: args.learningProgramId || args.learning_program_id || "",
      learning_draft_id: args.learningDraftId || args.learning_draft_id || "",
      learning_task_card_id: args.learningTaskCardId || args.learning_task_card_id || "",
      learning_task_model: args.learningTaskModel || args.learning_task_model || null,
    });
  }

  function mutateCard(args = {}) {
    const workspaceId = args.workspaceId || "owner";
    return runBridge({
      action: args.action || "",
      workspace_id: workspaceId,
      source_principal: workspacePrincipal(workspaceId),
      todo_id: args.cardId || args.todoId || args.todo_id || "",
      assignee: args.assignee || "",
      due_time: args.dueTime || args.due_time || "",
      reason: args.reason || "",
      comment: args.comment || args.text || "",
      result: args.result || "",
      content: args.content || args.title || "",
      description: args.description || "",
      author: args.author || "",
      learningGrowthSubmission: args.learningGrowthSubmission || args.learning_growth_submission || false,
      submissionKind: args.submissionKind || args.submission_kind || "",
      learningGrowthEvaluation: args.learningGrowthEvaluation || args.learning_growth_evaluation || null,
      clearLearningGrowthSubmission: args.clearLearningGrowthSubmission || args.clear_learning_growth_submission || false,
    });
  }

  function cardDetail(args = {}) {
    const workspaceId = args.workspaceId || "owner";
    return runBridge({
      action: "detail",
      workspace_id: workspaceId,
      source_principal: workspacePrincipal(workspaceId),
      todo_id: args.cardId || args.todoId || args.todo_id || "",
      log_tail: positiveNumber(args.logTail || args.log_tail, 12000),
    });
  }

  function reconcileDependencyBlocks(args = {}) {
    const workspaceId = args.workspaceId || "owner";
    return runBridge({
      action: "reconcile_dependency_blocks",
      workspace_id: workspaceId,
      source_principal: workspacePrincipal(workspaceId),
      limit: positiveNumber(args.limit, 500),
    });
  }

  return {
    addCard,
    cardDetail,
    listCards,
    mutateCard,
    publicCard,
    reconcileDependencyBlocks,
  };
}

module.exports = {
  createKanbanCardProvider,
};
