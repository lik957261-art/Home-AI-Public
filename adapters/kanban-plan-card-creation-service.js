"use strict";

const crypto = require("node:crypto");

const DEFAULT_STUDY_COVER_NOTE = "\u5c01\u9762\u56fe\u7247\u5df2\u4e0a\u4f20\uff0c\u53ef\u5728 Hermes Mobile \u5b66\u4e60\u8ba1\u5212\u4e2d\u9884\u89c8\u3002";

function defaultCompactText(value, maxChars = 1000) {
  const text = String(value || "");
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.45);
  const tail = maxChars - head;
  return `${text.slice(0, head)}\n\n[truncated: ${text.length} chars total]\n\n${text.slice(-tail)}`;
}

function defaultWorkspacePrincipal(workspaceId) {
  return String(workspaceId || "owner");
}

function defaultAssigneeLabel(_workspaceId, principalId) {
  return String(principalId || "");
}

function defaultPublicTodo(result) {
  return result && typeof result === "object" ? result : {};
}

function defaultVerifyDirectTodoCreateResult(todo) {
  return String(todo?.id || "").trim()
    ? { ok: true, error: "" }
    : { ok: false, error: "Todo created but no visible card id returned." };
}

function defaultAssessmentConfigLine(config = {}) {
  return `ASSESSMENT_CONFIG:${Buffer.from(JSON.stringify(config)).toString("base64url")}`;
}

function createIdempotencyKey(mode, planId, clientId) {
  const hash = crypto.createHash("sha256").update(`${planId}\0${clientId}`).digest("hex").slice(0, 24);
  return `hm-${mode}-${hash}`;
}

function createPlanIdempotencyKey(planId, clientId) {
  const hash = crypto.createHash("sha256").update(`${planId}\0${clientId}`).digest("hex").slice(0, 24);
  return `hm-plan-${hash}`;
}

function publicSharedDirectoryResult(directoryInfo) {
  return directoryInfo ? {
    path: directoryInfo.sharedDirectoryPath,
    caseDirectoryPath: directoryInfo.caseDirectoryPath,
    permission: "read_only",
  } : null;
}

function createKanbanPlanCardCreationService(deps = {}) {
  const kanbanCardProvider = deps.kanbanCardProvider || {};
  if (typeof kanbanCardProvider.addCard !== "function" || typeof kanbanCardProvider.mutateCard !== "function") {
    throw new Error("kanban plan card creation service requires kanbanCardProvider add/mutate");
  }

  const compactText = typeof deps.compactText === "function" ? deps.compactText : defaultCompactText;
  const publicTodo = typeof deps.publicTodo === "function" ? deps.publicTodo : defaultPublicTodo;
  const verifyDirectTodoCreateResult = typeof deps.verifyDirectTodoCreateResult === "function"
    ? deps.verifyDirectTodoCreateResult
    : defaultVerifyDirectTodoCreateResult;
  const workspacePrincipal = typeof deps.workspacePrincipal === "function"
    ? deps.workspacePrincipal
    : defaultWorkspacePrincipal;
  const todoAssigneeLabel = typeof deps.todoAssigneeLabel === "function"
    ? deps.todoAssigneeLabel
    : defaultAssigneeLabel;
  const normalizeKanbanNotificationAssignee = typeof deps.normalizeKanbanNotificationAssignee === "function"
    ? deps.normalizeKanbanNotificationAssignee
    : ((_workspaceId, ...candidates) => candidates.find((item) => String(item || "").trim()) || "");
  const assessmentConfigLine = typeof deps.assessmentConfigLine === "function"
    ? deps.assessmentConfigLine
    : defaultAssessmentConfigLine;
  const saveKanbanReadingCoverUpload = typeof deps.saveKanbanReadingCoverUpload === "function"
    ? deps.saveKanbanReadingCoverUpload
    : () => null;
  const publicKanbanCoverFile = typeof deps.publicKanbanCoverFile === "function"
    ? deps.publicKanbanCoverFile
    : () => null;
  const ensureKanbanCaseSharedDirectory = typeof deps.ensureKanbanCaseSharedDirectory === "function"
    ? deps.ensureKanbanCaseSharedDirectory
    : () => null;
  const upsertKanbanCaseShare = typeof deps.upsertKanbanCaseShare === "function"
    ? deps.upsertKanbanCaseShare
    : () => null;
  const studyCoverNote = String(deps.studyCoverNote || DEFAULT_STUDY_COVER_NOTE);

  function requireFn(name) {
    if (typeof deps[name] !== "function") throw new Error(`kanban plan card creation service requires ${name}`);
    return deps[name];
  }

  function planShareInput(input, directoryInfo) {
    return {
      performerWorkspaceIds: input.plan.performerWorkspaceIds,
      viewerWorkspaceIds: input.plan.viewerWorkspaceIds,
      managerWorkspaceIds: input.raw.managerWorkspaceIds || input.raw.manager_workspace_ids || [],
      topicThreadId: "",
      topicTaskGroupId: "",
      sharedDirectoryPath: directoryInfo?.sharedDirectoryPath || "",
      caseDirectoryPath: directoryInfo?.caseDirectoryPath || "",
    };
  }

  function requestedPlanAssignee(workspaceId, plan, input = {}) {
    const performerAssignee = plan.performerWorkspaceIds?.[0] ? workspacePrincipal(plan.performerWorkspaceIds[0]) : "";
    return input.assignee || performerAssignee || workspacePrincipal(workspaceId);
  }

  async function blockCard(workspaceId, publicCard, reason, fallbackError) {
    const blockedResult = await kanbanCardProvider.mutateCard({
      action: "block",
      workspaceId,
      cardId: publicCard.id,
      reason,
      author: "Hermes Mobile",
    });
    const blocked = Boolean(blockedResult?.ok);
    return {
      blocked,
      blockError: blocked ? "" : (blockedResult?.error || fallbackError),
      publicCard: blocked ? publicTodo(blockedResult) : publicCard,
    };
  }

  async function createKanbanPlanCards(workspaceId, planInput, options = {}) {
    const normalizeKanbanMaxParallel = requireFn("normalizeKanbanMaxParallel");
    const normalizeKanbanPlanReasoningEffort = requireFn("normalizeKanbanPlanReasoningEffort");
    const normalizeKanbanPlan = requireFn("normalizeKanbanPlan");
    const kanbanPlanCardDescription = requireFn("kanbanPlanCardDescription");
    const kanbanPlanDependencyLabelsForServer = requireFn("kanbanPlanDependencyLabelsForServer");

    const requestedMaxParallel = options.maxParallel ?? planInput?.maxParallel ?? planInput?.max_parallel;
    const maxParallel = normalizeKanbanMaxParallel(requestedMaxParallel);
    const reasoningEffort = normalizeKanbanPlanReasoningEffort(options.reasoningEffort || options.reasoning_effort || planInput?.reasoningEffort || planInput?.reasoning_effort);
    const plan = normalizeKanbanPlan(planInput, planInput?.sourceText || options.sourceText || "", workspaceId, { maxParallel, reasoningEffort });
    const created = [];
    const byClientId = new Map();
    const runnableIds = new Set(plan.cards.filter((card) => !card.dependsOn.length).slice(0, maxParallel).map((card) => card.clientId));

    for (const [cardIndex, card] of plan.cards.entries()) {
      const assignee = normalizeKanbanNotificationAssignee(workspaceId, card.assignee, options.assignee);
      const result = await kanbanCardProvider.addCard({
        workspaceId,
        assignee,
        assigneeLabel: todoAssigneeLabel(workspaceId, assignee),
        content: card.title,
        description: kanbanPlanCardDescription(plan, card),
        dueTime: "",
        reason: "Created from Hermes Mobile multi-Agent Kanban planner.",
        idempotencyKey: createPlanIdempotencyKey(plan.id, card.clientId),
        caseId: plan.id,
        caseMode: plan.mode,
        caseSourceText: compactText(plan.sourceText, 2000),
        caseSummary: compactText(plan.summary, 500),
        caseCardId: card.clientId,
        caseCardIndex: cardIndex + 1,
        caseCardCount: plan.cards.length,
        caseDependsOn: card.dependsOn,
        caseDeliverables: card.deliverables,
        caseAcceptance: card.acceptance,
        caseCardGoal: card.description || card.title,
      });
      if (!result?.ok) {
        return { ok: false, error: result?.error || "Kanban card creation failed", plan, cards: created, result };
      }
      const publicCard = publicTodo(result);
      const verification = verifyDirectTodoCreateResult(publicCard);
      if (!verification.ok) {
        return { ok: false, error: verification.error, plan, cards: created, result };
      }
      byClientId.set(card.clientId, publicCard);
      const dependencyLabels = kanbanPlanDependencyLabelsForServer(plan, card);
      const shouldBlock = !runnableIds.has(card.clientId);
      let blocked = false;
      let blockError = "";
      let blockReason = "";
      if (shouldBlock) {
        blockReason = dependencyLabels.length
          ? `Waiting for planned upstream cards: ${dependencyLabels.join(" / ")}.`
          : `Waiting for a free multi-Agent execution slot; Hermes Mobile max parallel is ${maxParallel}.`;
        const block = await blockCard(workspaceId, publicCard, blockReason, "Failed to block planned card");
        blocked = block.blocked;
        blockError = block.blockError;
      }
      const createdEntry = {
        clientId: card.clientId,
        title: card.title,
        card: publicCard,
        blocked,
        blockReason,
        blockError,
        dependsOn: card.dependsOn.map((id) => byClientId.get(id)?.id || id),
      };
      created.push(createdEntry);
      if (shouldBlock && !blocked) {
        return {
          ok: false,
          error: `Planned card ${publicCard.id} was created but could not be blocked: ${blockError}`,
          plan,
          cards: created,
        };
      }
    }

    return { ok: true, plan, cards: created, maxParallel };
  }

  async function createKanbanStudyPlanCards(workspaceId, input = {}) {
    const normalizeKanbanStudyPlan = requireFn("normalizeKanbanStudyPlan");
    const plan = normalizeKanbanStudyPlan(input, workspaceId);
    if (plan.mode === "assessment-plan") {
      return createKanbanAssessmentPlanCardsFromPlan(workspaceId, plan, input);
    }
    const cover = saveKanbanReadingCoverUpload(workspaceId, plan.id, input.coverImage || input.cover_image || input.cover || null);
    if (cover) plan.cover = publicKanbanCoverFile(workspaceId, cover) || cover;
    const directoryInfo = ensureKanbanCaseSharedDirectory(workspaceId, plan);
    const share = upsertKanbanCaseShare(workspaceId, plan.id, planShareInput({ plan, raw: input }, directoryInfo));
    const requestedAssignee = requestedPlanAssignee(workspaceId, plan, input);
    const created = [];
    for (const [index, card] of plan.cards.entries()) {
      const cardCaseTemplate = card.caseTemplate || plan.template;
      const cardSourceText = compactText([
        plan.sourceText,
        card.config ? assessmentConfigLine(card.config) : "",
      ].filter(Boolean).join("\n\n"), 3000);
      const description = compactText([
        card.description,
        cover ? studyCoverNote : "",
      ].filter(Boolean).join("\n\n"), 1800);
      const result = await kanbanCardProvider.addCard({
        workspaceId,
        assignee: requestedAssignee,
        assigneeLabel: todoAssigneeLabel(workspaceId, requestedAssignee),
        content: card.title,
        description,
        dueTime: card.dueTime,
        reminderLeadMinutes: plan.reminderLeadMinutes,
        reason: "Created from Hermes Mobile study plan.",
        idempotencyKey: createIdempotencyKey(plan.mode, plan.id, card.clientId),
        caseId: plan.id,
        caseMode: plan.mode,
        caseTemplate: cardCaseTemplate,
        caseSourceText: cardSourceText,
        caseSummary: plan.summary,
        caseCover: cover || null,
        topicThreadId: "",
        topicTaskGroupId: "",
        sharedDirectoryPath: directoryInfo?.sharedDirectoryPath || "",
        caseDirectoryPath: directoryInfo?.caseDirectoryPath || "",
        caseCardId: card.clientId,
        caseCardIndex: index + 1,
        caseCardCount: plan.cards.length,
        caseDependsOn: index > 0 ? [plan.cards[index - 1].clientId] : [],
        caseDeliverables: card.deliverables,
        caseAcceptance: card.acceptance,
        caseCardGoal: compactText([
          card.config ? assessmentConfigLine(card.config) : "",
          card.description,
        ].filter(Boolean).join("\n\n"), 1800),
        caseCreationSkillId: card.cardCreationSkillId || input.cardCreationSkillId || input.card_creation_skill_id || "",
        learningProgramId: card.learningProgramId || input.learningProgramId || input.learning_program_id || "",
        learningDraftId: card.learningDraftId || input.learningDraftId || input.learning_draft_id || "",
        learningTaskCardId: card.learningTaskCardId || input.learningTaskCardId || input.learning_task_card_id || "",
        learningTaskModel: card.taskModel || card.learningTaskModel || input.learningTaskModel || input.learning_task_model || null,
      });
      if (!result?.ok) {
        return { ok: false, error: result?.error || "Study plan card creation failed", plan, cards: created, result };
      }
      let publicCard = publicTodo(result);
      let blocked = false;
      let blockError = "";
      let blockReason = "";
      if (index > 0) {
        blockReason = "Waiting for previous study session completion; Hermes Mobile shows only the current study session.";
        const block = await blockCard(workspaceId, publicCard, blockReason, "Failed to block future reading session");
        blocked = block.blocked;
        blockError = block.blockError;
        publicCard = block.publicCard;
      }
      created.push({
        clientId: card.clientId,
        day: card.day,
        dueTime: card.dueTime,
        card: publicCard,
        blocked,
        blockReason,
        blockError,
        dependsOn: index > 0 ? [plan.cards[index - 1].clientId] : [],
      });
      if (index > 0 && !blocked) {
        return {
          ok: false,
          error: `Study plan card ${publicCard.id} was created but could not be parked: ${blockError}`,
          plan,
          cards: created,
        };
      }
    }
    return {
      ok: true,
      plan,
      cards: created,
      share,
      topic: null,
      sharedDirectory: publicSharedDirectoryResult(directoryInfo),
    };
  }

  async function createKanbanAssessmentPlanCardsFromPlan(workspaceId, plan, input = {}) {
    const directoryInfo = ensureKanbanCaseSharedDirectory(workspaceId, plan);
    const share = upsertKanbanCaseShare(workspaceId, plan.id, planShareInput({ plan, raw: input }, directoryInfo));
    const requestedAssignee = requestedPlanAssignee(workspaceId, plan, input);
    const created = [];
    for (const [index, card] of plan.cards.entries()) {
      const sourceText = compactText([plan.blueprint, assessmentConfigLine(card.config)].filter(Boolean).join("\n\n"), 3000);
      const result = await kanbanCardProvider.addCard({
        workspaceId,
        assignee: requestedAssignee,
        assigneeLabel: todoAssigneeLabel(workspaceId, requestedAssignee),
        content: card.title,
        description: card.description,
        dueTime: card.dueTime,
        reminderLeadMinutes: plan.reminderLeadMinutes,
        reason: "Created from Hermes Mobile assessment plan.",
        idempotencyKey: createIdempotencyKey(plan.mode, plan.id, card.clientId),
        caseId: plan.id,
        caseMode: plan.mode,
        caseTemplate: plan.template,
        caseSourceText: sourceText,
        caseSummary: plan.summary,
        topicThreadId: "",
        topicTaskGroupId: "",
        sharedDirectoryPath: directoryInfo?.sharedDirectoryPath || "",
        caseDirectoryPath: directoryInfo?.caseDirectoryPath || "",
        caseCardId: card.clientId,
        caseCardIndex: index + 1,
        caseCardCount: plan.cards.length,
        caseDependsOn: index > 0 ? [plan.cards[index - 1].clientId] : [],
        caseDeliverables: card.deliverables,
        caseAcceptance: card.acceptance,
        caseCardGoal: compactText(`${assessmentConfigLine(card.config)}\n\n${card.description}`, 1800),
      });
      if (!result?.ok) {
        return { ok: false, error: result?.error || "Assessment plan card creation failed", plan, cards: created, result };
      }
      let publicCard = publicTodo(result);
      const blockReason = index > 0
        ? "Waiting for previous assessment completion; Hermes Mobile opens the next assessment card after the prior exam passes."
        : "Manual formal assessment is open in Hermes Mobile; parked from official worker execution.";
      const block = await blockCard(workspaceId, publicCard, blockReason, "Failed to block future assessment");
      publicCard = block.publicCard;
      created.push({
        clientId: card.clientId,
        dueTime: card.dueTime,
        card: publicCard,
        blocked: block.blocked,
        blockReason,
        blockError: block.blockError,
        dependsOn: index > 0 ? [plan.cards[index - 1].clientId] : [],
      });
      if (!block.blocked) {
        return {
          ok: false,
          error: `Assessment plan card ${publicCard.id} was created but could not be parked: ${block.blockError}`,
          plan,
          cards: created,
        };
      }
    }
    return {
      ok: true,
      plan,
      cards: created,
      share,
      topic: null,
      sharedDirectory: publicSharedDirectoryResult(directoryInfo),
    };
  }

  async function createKanbanAssessmentPlanCards(workspaceId, input = {}, options = {}) {
    const normalizeKanbanAssessmentPlan = requireFn("normalizeKanbanAssessmentPlan");
    const plan = normalizeKanbanAssessmentPlan(input, workspaceId, options);
    return createKanbanAssessmentPlanCardsFromPlan(workspaceId, plan, input);
  }

  return Object.freeze({
    createKanbanAssessmentPlanCards,
    createKanbanPlanCards,
    createKanbanStudyPlanCards,
  });
}

module.exports = {
  DEFAULT_STUDY_COVER_NOTE,
  createIdempotencyKey,
  createKanbanPlanCardCreationService,
  createPlanIdempotencyKey,
  defaultAssessmentConfigLine,
};
