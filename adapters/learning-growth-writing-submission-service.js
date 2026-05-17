"use strict";

const {
  isLearningGrowthKanbanCard,
} = require("./learning-growth-kanban-task-service");

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function createError(status, error) {
  return { ok: false, status, error };
}

function cardId(card = {}) {
  return cleanString(card.id || card.todo_id || card.todoId);
}

function createLearningGrowthWritingSubmissionService(options = {}) {
  const kanbanCardProvider = options.kanbanCardProvider || null;
  const maxSubmissionChars = Math.max(1000, Number(options.maxSubmissionChars || 12000));
  if (!kanbanCardProvider || typeof kanbanCardProvider.listCards !== "function" || typeof kanbanCardProvider.mutateCard !== "function") {
    throw new Error("learning growth writing submission service requires kanbanCardProvider list/mutate");
  }

  async function loadGrowthCard(workspaceId, cardIdValue) {
    const listed = await kanbanCardProvider.listCards({
      workspaceId,
      scope: "mine",
      includeCompleted: true,
      limit: 1,
      search: "",
      targetId: cardIdValue,
    });
    if (!listed?.ok) return createError(502, cleanString(listed?.error || listed?.result?.error || "Unable to read Growth card"));
    const card = asArray(listed.data).find((item) => cardId(item) === cardIdValue) || null;
    if (!card) return createError(404, "Growth card was not found");
    if (!isLearningGrowthKanbanCard(card)) return createError(409, "Card is not a Growth learning task");
    return { ok: true, card };
  }

  async function submitWriting(input = {}) {
    const workspaceId = cleanString(input.workspaceId) || "owner";
    const cardIdValue = cleanString(input.cardId);
    const text = cleanString(input.text || input.submission || input.comment);
    if (!cardIdValue) return createError(400, "Growth card id is required");
    if (!text) return createError(400, "Writing submission text is required");
    if (text.length > maxSubmissionChars) return createError(413, `Writing submission is too long; keep it under ${maxSubmissionChars} characters`);
    const loaded = await loadGrowthCard(workspaceId, cardIdValue);
    if (!loaded.ok) return loaded;
    const mutated = await kanbanCardProvider.mutateCard({
      action: "comment",
      workspaceId,
      cardId: cardIdValue,
      comment: text,
      author: cleanString(input.author) || "learning-growth",
      learningGrowthSubmission: true,
      submissionKind: "writing",
    });
    if (!mutated?.ok) return createError(mutated?.status || 502, cleanString(mutated?.error || mutated?.result?.error || "Unable to submit writing"));
    return {
      ok: true,
      cardId: cardIdValue,
      workspaceId,
      status: "submitted",
      result: {
        ok: true,
        id: cleanString(mutated.id || mutated.cardId || cardIdValue) || cardIdValue,
        action: "comment",
      },
    };
  }

  return {
    submitWriting,
  };
}

module.exports = {
  createLearningGrowthWritingSubmissionService,
};
