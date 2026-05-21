"use strict";

const { groupKanbanCaseCards } = require("./kanban-story-provider");

const DEFAULT_CASE_MODES = new Set(["study-plan", "assessment-plan", "learning-growth"]);

function cleanString(value) {
  return String(value ?? "").trim();
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const text = cleanString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function firstString(...values) {
  for (const value of values) {
    const text = cleanString(value);
    if (text) return text;
  }
  return "";
}

function cardId(card = {}) {
  return firstString(card.id, card.cardId, card.card_id, card.todoId, card.todo_id);
}

function isCompletedCard(card = {}) {
  const status = cleanString(card.status).toLowerCase();
  const kanbanStatus = cleanString(card.kanbanStatus || card.kanban_status).toLowerCase();
  return status === "completed" || kanbanStatus === "done";
}

function topicFieldsFromCard(card = {}) {
  return {
    topicThreadId: firstString(card.topicThreadId, card.topic_thread_id),
    topicTaskGroupId: firstString(card.topicTaskGroupId, card.topic_task_group_id),
    sharedDirectoryPath: firstString(card.sharedDirectoryPath, card.shared_directory_path),
    caseDirectoryPath: firstString(card.caseDirectoryPath, card.case_directory_path),
  };
}

function splitLearnerTitle(title = "", fallbackLearner = "") {
  const text = cleanString(title);
  const match = text.match(/^([^:：]{1,40})[:：]\s*(.+)$/);
  if (match) {
    return {
      learnerName: cleanString(match[1]) || fallbackLearner,
      contentTitle: cleanString(match[2]) || text,
    };
  }
  return {
    learnerName: cleanString(fallbackLearner) || "learner",
    contentTitle: text || "study-plan",
  };
}

function planForGroup(group = {}, cards = [], workspaceId = "owner") {
  const first = cards[0] || {};
  const caseId = firstString(group.caseId, group.id, first.kanbanCaseId, first.kanban_case_id);
  const mode = firstString(group.caseMode, group.mode, first.kanbanCaseMode, first.kanban_case_mode);
  const title = firstString(group.title, group.summary, first.kanbanCaseSummary, first.kanban_case_summary, first.content, caseId);
  const performerWorkspaceIds = uniqueStrings([
    ...(Array.isArray(group.performerWorkspaceIds) ? group.performerWorkspaceIds : []),
    firstString(group.performerWorkspaceId, first.performerWorkspaceId, first.performer_workspace_id),
    firstString(workspaceId),
  ]);
  const viewerWorkspaceIds = uniqueStrings([
    ...(Array.isArray(group.viewerWorkspaceIds) ? group.viewerWorkspaceIds : []),
    ...(Array.isArray(first.viewerWorkspaceIds) ? first.viewerWorkspaceIds : []),
  ]);
  const learner = splitLearnerTitle(title, performerWorkspaceIds[0] || workspaceId || "learner");
  return {
    id: caseId,
    mode,
    template: firstString(group.caseTemplate, first.kanbanCaseTemplate, first.kanban_case_template),
    title,
    summary: firstString(group.summary, first.kanbanCaseSummary, first.kanban_case_summary, title),
    learnerName: learner.learnerName,
    contentTitle: learner.contentTitle,
    performerWorkspaceIds,
    viewerWorkspaceIds,
  };
}

function groupOriginalCards(group = {}, originalById = new Map()) {
  return (Array.isArray(group.cards) ? group.cards : [])
    .map((card) => originalById.get(cardId(card)) || card)
    .filter((card) => cardId(card));
}

function groupTopicFields(group = {}, cards = []) {
  const fromGroup = topicFieldsFromCard(group);
  if (fromGroup.topicThreadId && fromGroup.topicTaskGroupId) return fromGroup;
  for (const card of cards) {
    const fields = topicFieldsFromCard(card);
    if (fields.topicThreadId && fields.topicTaskGroupId) return fields;
  }
  return fromGroup;
}

function createKanbanCaseTopicBackfillService(deps = {}) {
  const ensureTopicThread = typeof deps.ensureKanbanCaseTopicThread === "function"
    ? deps.ensureKanbanCaseTopicThread
    : () => null;
  const upsertKanbanCaseShare = typeof deps.upsertKanbanCaseShare === "function"
    ? deps.upsertKanbanCaseShare
    : () => null;
  const patchKanbanCardTopicBinding = typeof deps.patchKanbanCardTopicBinding === "function"
    ? deps.patchKanbanCardTopicBinding
    : () => ({ ok: true, patched: 0 });
  const syncCompletedCard = typeof deps.syncCompletedCard === "function"
    ? deps.syncCompletedCard
    : () => ({ ok: true, delivered: false });

  async function backfillCaseTopics(input = {}) {
    const workspaceId = cleanString(input.workspaceId || input.workspace_id || "owner") || "owner";
    const cards = Array.isArray(input.cards) ? input.cards : [];
    const dryRun = Boolean(input.dryRun || input.dry_run);
    const syncCompletedCards = input.syncCompletedCards !== false && input.sync_completed_cards !== false;
    const modes = new Set((Array.isArray(input.caseModes) ? input.caseModes : [...DEFAULT_CASE_MODES]).map(cleanString));
    const originalById = new Map(cards.map((card) => [cardId(card), card]).filter(([id]) => id));
    const groups = groupKanbanCaseCards(cards, { ownerWorkspaceId: workspaceId })
      .filter((group) => modes.has(firstString(group.caseMode, group.mode)));
    const results = [];

    for (const group of groups) {
      const groupCards = groupOriginalCards(group, originalById);
      if (!groupCards.length) continue;
      const plan = planForGroup(group, groupCards, workspaceId);
      if (!plan.id || !plan.mode) continue;
      let topicFields = groupTopicFields(group, groupCards);
      const allCardsBound = groupCards.every((card) => {
        const fields = topicFieldsFromCard(card);
        return Boolean(fields.topicThreadId && fields.topicTaskGroupId);
      });
      const needsTopic = !topicFields.topicThreadId || !topicFields.topicTaskGroupId || !allCardsBound;
      let topic = null;
      if (needsTopic && !dryRun) {
        topic = ensureTopicThread(workspaceId, plan, {
          sharedDirectoryPath: topicFields.sharedDirectoryPath || "",
          caseDirectoryPath: topicFields.caseDirectoryPath || "",
          directoryRoute: topicFields.caseDirectoryPath
            ? { label: plan.contentTitle || plan.title || plan.id, root: topicFields.caseDirectoryPath, path: topicFields.caseDirectoryPath }
            : null,
        });
        topicFields = {
          topicThreadId: firstString(topic?.thread?.id, topicFields.topicThreadId),
          topicTaskGroupId: firstString(topic?.taskGroupId, topicFields.topicTaskGroupId),
          sharedDirectoryPath: topicFields.sharedDirectoryPath,
          caseDirectoryPath: topicFields.caseDirectoryPath,
        };
      }

      if (topicFields.topicThreadId && topicFields.topicTaskGroupId && !dryRun) {
        upsertKanbanCaseShare(workspaceId, plan.id, {
          performerWorkspaceIds: plan.performerWorkspaceIds,
          viewerWorkspaceIds: plan.viewerWorkspaceIds,
          topicThreadId: topicFields.topicThreadId,
          topicTaskGroupId: topicFields.topicTaskGroupId,
          sharedDirectoryPath: topicFields.sharedDirectoryPath,
          caseDirectoryPath: topicFields.caseDirectoryPath,
        });
        if (needsTopic) {
          patchKanbanCardTopicBinding({
            workspaceId,
            caseId: plan.id,
            cardIds: groupCards.map(cardId).filter(Boolean),
            topicThreadId: topicFields.topicThreadId,
            topicTaskGroupId: topicFields.topicTaskGroupId,
            sharedDirectoryPath: topicFields.sharedDirectoryPath,
            caseDirectoryPath: topicFields.caseDirectoryPath,
          });
        }
      }

      let completedSynced = 0;
      if (syncCompletedCards && topicFields.topicThreadId && topicFields.topicTaskGroupId && !dryRun) {
        for (const card of groupCards) {
          if (!isCompletedCard(card)) continue;
          const delivery = syncCompletedCard(Object.assign({}, card, topicFields));
          if (delivery?.delivered || delivery?.updatedExisting) completedSynced += 1;
        }
      }

      results.push({
        caseId: plan.id,
        caseMode: plan.mode,
        title: plan.contentTitle || plan.title || plan.id,
        cardCount: groupCards.length,
        completedCount: groupCards.filter(isCompletedCard).length,
        hadTopicBinding: !needsTopic,
        topicThreadId: topicFields.topicThreadId || "",
        topicTaskGroupId: topicFields.topicTaskGroupId || "",
        patchedCardCount: needsTopic ? groupCards.length : 0,
        completedSynced,
        dryRun,
      });
    }

    return {
      ok: true,
      workspaceId,
      caseCount: results.length,
      missingTopicCount: results.filter((item) => !item.hadTopicBinding).length,
      patchedCardCount: results.reduce((sum, item) => sum + item.patchedCardCount, 0),
      completedSynced: results.reduce((sum, item) => sum + item.completedSynced, 0),
      cases: results,
    };
  }

  return Object.freeze({
    backfillCaseTopics,
  });
}

module.exports = {
  createKanbanCaseTopicBackfillService,
  isCompletedCard,
  planForGroup,
  splitLearnerTitle,
};
