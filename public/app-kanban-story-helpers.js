"use strict";

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HermesKanbanStoryHelpers = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_STATUS_ORDER = Object.freeze(["triage", "todo", "ready", "running", "blocked", "done", "archived"]);

  function noop() {}

  function defaultCompactDisplayText(value, max = 180) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text || text.length <= max) return text;
    return `${text.slice(0, max - 1)}...`;
  }

  function defaultTodoSortTimestamp(todo) {
    const candidates = [
      todo?.kanbanCompletedAt,
      todo?.completedAt,
      todo?.cancelledAt,
      todo?.updatedAt,
      todo?.createdAt,
      todo?.dueAt,
      todo?.dueLocal,
    ];
    for (const value of candidates) {
      const parsed = Date.parse(String(value || "").replace(" ", "T"));
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  }

  function caseMode(todo) {
    return String(todo?.kanbanCaseMode || "").trim();
  }

  function caseTemplate(todo) {
    return String(todo?.kanbanCaseTemplate || todo?.kanbanStudyKind || "").trim().toLowerCase();
  }

  function isStudyCase(todo) {
    return caseMode(todo) === "study-plan";
  }

  function isAssessmentCase(todo) {
    return caseMode(todo) === "assessment-plan";
  }

  function isFinalStudyAssessment(todo) {
    return isStudyCase(todo) && caseTemplate(todo) === "final-assessment";
  }

  function defaultIsAssessmentCard(todo) {
    return isAssessmentCase(todo) || isFinalStudyAssessment(todo);
  }

  function defaultIsReadingCard(todo) {
    return isStudyCase(todo) && !isFinalStudyAssessment(todo);
  }

  function defaultAssessmentExamSummary(todo) {
    return todo?.assessmentExam && typeof todo.assessmentExam === "object" ? todo.assessmentExam : null;
  }

  function defaultTodoWorkflowState(todo) {
    const workflow = todo?.workflowState && typeof todo.workflowState === "object" ? todo.workflowState : null;
    if (!workflow) return null;
    if (
      ["reading", "study", "assessment", "final-assessment"].includes(String(workflow.kind || ""))
      && workflow.priorContextAvailable === false
    ) {
      return null;
    }
    return workflow;
  }

  function defaultAssessmentExamCompleted(todo) {
    const workflow = defaultTodoWorkflowState(todo);
    if (workflow && (workflow.kind === "assessment" || workflow.kind === "final-assessment")) return Boolean(workflow.completed);
    const summary = defaultAssessmentExamSummary(todo);
    if (summary?.completionError) return false;
    return String(summary?.status || "") === "completed";
  }

  function defaultNormalizedKanbanStatus(todo) {
    const status = String(todo?.kanbanStatus || todo?.kanban_status || "").trim().toLowerCase();
    if (defaultIsAssessmentCard(todo) && status === "done" && !defaultAssessmentExamCompleted(todo)) return "blocked";
    if (DEFAULT_STATUS_ORDER.includes(status)) return status;
    const compatible = String(todo?.status || "").trim().toLowerCase();
    if (defaultIsAssessmentCard(todo) && compatible === "completed" && !defaultAssessmentExamCompleted(todo)) return "blocked";
    if (compatible === "completed") return "done";
    if (compatible === "cancelled") return "archived";
    return "todo";
  }

  function defaultKanbanStatusMeta(status) {
    return { label: status || "Todo", shortLabel: status || "todo" };
  }

  function deps(options = {}) {
    return {
      allTodos: Array.isArray(options.allTodos) ? options.allTodos : [],
      statusOrder: Array.isArray(options.statusOrder) ? options.statusOrder : DEFAULT_STATUS_ORDER,
      todoSortTimestamp: typeof options.todoSortTimestamp === "function" ? options.todoSortTimestamp : defaultTodoSortTimestamp,
      todoTitle: typeof options.todoTitle === "function" ? options.todoTitle : (todo) => defaultCompactDisplayText(todo?.content || todo?.id || "Kanban card", 120),
      compactDisplayText: typeof options.compactDisplayText === "function" ? options.compactDisplayText : defaultCompactDisplayText,
      isKanbanReadingCard: typeof options.isKanbanReadingCard === "function" ? options.isKanbanReadingCard : defaultIsReadingCard,
      isKanbanAssessmentCard: typeof options.isKanbanAssessmentCard === "function" ? options.isKanbanAssessmentCard : defaultIsAssessmentCard,
      normalizedKanbanStatus: typeof options.normalizedKanbanStatus === "function" ? options.normalizedKanbanStatus : defaultNormalizedKanbanStatus,
      kanbanStatusMeta: typeof options.kanbanStatusMeta === "function" ? options.kanbanStatusMeta : defaultKanbanStatusMeta,
      assessmentExamSummary: typeof options.assessmentExamSummary === "function" ? options.assessmentExamSummary : defaultAssessmentExamSummary,
      assessmentExamCompleted: typeof options.assessmentExamCompleted === "function" ? options.assessmentExamCompleted : defaultAssessmentExamCompleted,
      assessmentCardAcceptsStart: typeof options.assessmentCardAcceptsStart === "function" ? options.assessmentCardAcceptsStart : null,
      readingSubmissionHasAnalysis: typeof options.readingSubmissionHasAnalysis === "function" ? options.readingSubmissionHasAnalysis : () => false,
      readingSubmissionCompleted: typeof options.readingSubmissionCompleted === "function" ? options.readingSubmissionCompleted : () => false,
      readingCardAcceptsSubmission: typeof options.readingCardAcceptsSubmission === "function" ? options.readingCardAcceptsSubmission : null,
      kanbanCan: typeof options.kanbanCan === "function" ? options.kanbanCan : () => true,
      kanbanDisplayResultText: typeof options.kanbanDisplayResultText === "function" ? options.kanbanDisplayResultText : (_todo, text) => String(text || "").trim(),
      todoCardDetailState: typeof options.todoCardDetailState === "function" ? options.todoCardDetailState : () => null,
      kanbanCardOutputs: typeof options.kanbanCardOutputs === "function" ? options.kanbanCardOutputs : () => [],
      isKanbanTodoSource: typeof options.isKanbanTodoSource === "function" ? options.isKanbanTodoSource : () => true,
      onMissingDependency: typeof options.onMissingDependency === "function" ? options.onMissingDependency : noop,
    };
  }

  function kanbanReadingCaseKey(todo) {
    return String(todo?.kanbanCaseId || todo?.id || "").trim() || String(todo?.id || "");
  }

  function kanbanReadingRevisionOriginal(group, item) {
    const originalId = String(item?.todo?.kanbanRevisionOf || "").trim();
    if (!originalId) return null;
    return (group?.cards || []).find((candidate) => String(candidate?.todo?.id || "") === originalId) || null;
  }

  function isKanbanReadingRevision(itemOrTodo) {
    const todo = itemOrTodo?.todo || itemOrTodo || {};
    return Boolean(String(todo?.kanbanRevisionOf || "").trim());
  }

  function kanbanReadingDisplayCardIndex(group, item) {
    const original = kanbanReadingRevisionOriginal(group, item);
    const value = original?.info?.cardIndex || item?.info?.cardIndex || item?.todo?.kanbanCaseCardIndex || 0;
    return Number(value || 0) || 0;
  }

  function kanbanRevisionSortTimestamp(item, options = {}) {
    return deps(options).todoSortTimestamp(item?.todo || {}) || 0;
  }

  function kanbanLatestRevisionReplacementItems(group, predicate = null, options = {}) {
    const context = deps(options);
    const cards = (group?.cards || []).filter((item) => !predicate || predicate(item.todo));
    if (!cards.length) return [];
    const baseIds = new Set(cards
      .filter((item) => !isKanbanReadingRevision(item))
      .map((item) => String(item?.todo?.id || ""))
      .filter(Boolean));
    const revisionsByOriginal = new Map();
    for (const item of cards) {
      const originalId = String(item?.todo?.kanbanRevisionOf || "").trim();
      if (!originalId) continue;
      const previous = revisionsByOriginal.get(originalId);
      const previousRank = Number(previous?.todo?.kanbanRevisionCount || 0) || 0;
      const nextRank = Number(item?.todo?.kanbanRevisionCount || 0) || 0;
      if (!previous || nextRank > previousRank || (
        nextRank === previousRank
        && kanbanRevisionSortTimestamp(item, context) >= kanbanRevisionSortTimestamp(previous, context)
      )) {
        revisionsByOriginal.set(originalId, item);
      }
    }
    const visible = [];
    for (const item of cards) {
      const id = String(item?.todo?.id || "");
      if (isKanbanReadingRevision(item)) continue;
      visible.push(revisionsByOriginal.get(id) || item);
    }
    for (const item of cards) {
      const originalId = String(item?.todo?.kanbanRevisionOf || "").trim();
      if (originalId && !baseIds.has(originalId)) visible.push(item);
    }
    return visible.sort((left, right) => {
      const leftIndex = kanbanReadingDisplayCardIndex(group, left) || 999;
      const rightIndex = kanbanReadingDisplayCardIndex(group, right) || 999;
      if (leftIndex !== rightIndex) return leftIndex - rightIndex;
      return context.todoSortTimestamp(left.todo) - context.todoSortTimestamp(right.todo);
    });
  }

  function kanbanAssessmentVisibleCardItems(group, options = {}) {
    const context = deps(options);
    return kanbanLatestRevisionReplacementItems(group, (todo) => context.isKanbanAssessmentCard(todo), context);
  }

  function assessmentCardHasStoryEvidence(todo, options = {}) {
    const context = deps(options);
    const summary = context.assessmentExamSummary(todo) || {};
    return Boolean(
      context.assessmentExamCompleted(todo)
      || summary.lastAttempt
      || String(summary.status || "").trim().toLowerCase() === "retake_required"
      || context.kanbanCardOutputs(todo).length,
    );
  }

  function kanbanAssessmentStoryVisibleCardItems(group, options = {}) {
    const context = deps(options);
    const cards = kanbanAssessmentVisibleCardItems(group, context);
    if (!cards.length) return [];
    const current = kanbanAssessmentCaseCurrentItem(group, context);
    const currentId = String(current?.todo?.id || "");
    return cards.filter((item) => {
      const id = String(item?.todo?.id || "");
      return Boolean(id && (id === currentId || assessmentCardHasStoryEvidence(item.todo, context)));
    });
  }

  function readingCardHasStoryEvidence(todo, options = {}) {
    const context = deps(options);
    return Boolean(
      context.readingSubmissionCompleted(todo)
      || context.readingSubmissionHasAnalysis(todo)
      || context.kanbanCardOutputs(todo).length
      || kanbanCardStoryFeedback(todo, context)
    );
  }

  function kanbanReadingStoryVisibleCardItems(group, options = {}) {
    const context = deps(options);
    const cards = kanbanLatestRevisionReplacementItems(group, (todo) => context.isKanbanReadingCard(todo), context);
    if (!cards.length) return [];
    const current = kanbanReadingCaseCurrentItem(group, context);
    const currentId = String(current?.todo?.id || "");
    return cards.filter((item) => {
      const id = String(item?.todo?.id || "");
      return Boolean(id && (id === currentId || readingCardHasStoryEvidence(item.todo, context)));
    });
  }

  function kanbanReadingBaseCardItems(group) {
    return (group?.cards || []).filter((item) => !isKanbanReadingRevision(item));
  }

  function kanbanReadingDisplayCardCount(group) {
    const baseCount = kanbanReadingBaseCardItems(group).length;
    if (baseCount) return baseCount;
    const first = (group?.cards || [])[0];
    return Number(first?.info?.cardCount || first?.todo?.kanbanCaseCardCount || 0) || 0;
  }

  function kanbanCasePriorCards(todo, predicate, options = {}) {
    const context = deps(options);
    const caseId = String(todo?.kanbanCaseId || "").trim();
    const caseCards = context.allTodos
      .filter((card) => String(card?.kanbanCaseId || "").trim() === caseId && (!predicate || predicate(card)))
      .map((card) => ({ todo: card, info: kanbanCardCaseInfo(card) }));
    const visibleItems = kanbanLatestRevisionReplacementItems({ cards: caseCards }, predicate, context);
    const currentItem = visibleItems.find((item) => String(item?.todo?.id || "") === String(todo?.id || ""))
      || caseCards.find((item) => String(item?.todo?.id || "") === String(todo?.id || ""));
    const index = kanbanReadingDisplayCardIndex({ cards: caseCards }, currentItem) || Number(todo?.kanbanCaseCardIndex || 0) || 0;
    if (!caseId || !index) return [];
    return visibleItems
      .filter((item) => (kanbanReadingDisplayCardIndex({ cards: caseCards }, item) || 0) < index)
      .map((item) => item.todo);
  }

  function readingCasePriorComplete(todo, options = {}) {
    const context = deps(options);
    return kanbanCasePriorCards(todo, context.isKanbanReadingCard, context).every(context.readingSubmissionCompleted);
  }

  function assessmentPriorComplete(todo, options = {}) {
    const context = deps(options);
    return kanbanCasePriorCards(todo, context.isKanbanAssessmentCard, context).every(context.assessmentExamCompleted);
  }

  function defaultReadingCardAcceptsSubmission(todo, options = {}) {
    const context = deps(options);
    if (!context.isKanbanReadingCard(todo)) return false;
    const status = context.normalizedKanbanStatus(todo);
    if (status === "done" || status === "archived") return false;
    if (status === "blocked" && !readingCasePriorComplete(todo, context)) return false;
    return true;
  }

  function defaultAssessmentCardAcceptsStart(todo, options = {}) {
    const context = deps(options);
    if (!context.isKanbanAssessmentCard(todo) || context.assessmentExamCompleted(todo)) return false;
    const status = context.normalizedKanbanStatus(todo);
    if (status === "archived") return false;
    return assessmentPriorComplete(todo, context);
  }

  function kanbanAssessmentCaseCurrentItem(group, options = {}) {
    const context = deps(options);
    const acceptsStart = context.assessmentCardAcceptsStart || ((todo) => defaultAssessmentCardAcceptsStart(todo, context));
    const cards = kanbanAssessmentVisibleCardItems(group, context);
    const retake = cards.find((item) => context.isKanbanAssessmentCard(item.todo) && String(context.assessmentExamSummary(item.todo)?.status || "") === "retake_required");
    if (retake) return retake;
    const startable = cards.find((item) => context.isKanbanAssessmentCard(item.todo) && acceptsStart(item.todo));
    if (startable) return startable;
    const next = cards.find((item) => context.isKanbanAssessmentCard(item.todo) && !context.assessmentExamCompleted(item.todo) && context.normalizedKanbanStatus(item.todo) !== "archived");
    if (next) return next;
    const completed = [...cards].reverse().find((item) => context.isKanbanAssessmentCard(item.todo) && context.assessmentExamCompleted(item.todo));
    return completed || cards.find((item) => context.isKanbanAssessmentCard(item.todo)) || null;
  }

  function kanbanReadingCaseCurrentItem(group, options = {}) {
    const context = deps(options);
    const acceptsSubmission = context.readingCardAcceptsSubmission || ((todo) => defaultReadingCardAcceptsSubmission(todo, context));
    const cards = [...(Array.isArray(group?.cards) ? group.cards : [])].sort((left, right) => {
      const leftIndex = kanbanReadingDisplayCardIndex(group, left) || 999;
      const rightIndex = kanbanReadingDisplayCardIndex(group, right) || 999;
      if (leftIndex !== rightIndex) return leftIndex - rightIndex;
      if (isKanbanReadingRevision(left) !== isKanbanReadingRevision(right)) {
        return isKanbanReadingRevision(left) ? 1 : -1;
      }
      return context.todoSortTimestamp(left.todo) - context.todoSortTimestamp(right.todo);
    });
    const pendingQuiz = cards.find((item) => context.readingSubmissionHasAnalysis(item.todo) && !context.readingSubmissionCompleted(item.todo));
    if (pendingQuiz) return pendingQuiz;
    const visibleOpen = cards.find((item) => {
      const status = context.normalizedKanbanStatus(item.todo);
      return !isKanbanReadingRevision(item) && status !== "done" && status !== "archived" && acceptsSubmission(item.todo);
    });
    if (visibleOpen) return visibleOpen;
    const nextBase = cards.find((item) => {
      const status = context.normalizedKanbanStatus(item.todo);
      return !isKanbanReadingRevision(item) && status !== "done" && status !== "archived";
    });
    if (nextBase) return nextBase;
    const completed = [...cards].reverse().find((item) => !isKanbanReadingRevision(item) && ["done", "archived"].includes(context.normalizedKanbanStatus(item.todo)));
    if (completed) return completed;
    return cards.find((item) => !isKanbanReadingRevision(item)) || cards[0] || null;
  }

  function kanbanVisibleReadingTodoIds(todos, options = {}) {
    const context = deps(options);
    const groups = new Map();
    for (const todo of todos || []) {
      if (!context.isKanbanReadingCard(todo) && !context.isKanbanAssessmentCard(todo)) continue;
      const key = kanbanReadingCaseKey(todo);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ todo, info: kanbanCardCaseInfo(todo) });
    }
    const visible = new Set();
    for (const cards of groups.values()) {
      const hasStudyCards = cards.some((item) => context.isKanbanReadingCard(item.todo));
      if (hasStudyCards) {
        for (const item of kanbanReadingStoryVisibleCardItems({ cards }, context)) {
          const id = String(item?.todo?.id || "");
          if (id) visible.add(id);
        }
        continue;
      }
      for (const item of kanbanAssessmentStoryVisibleCardItems({ cards }, context)) {
        const id = String(item?.todo?.id || "");
        if (id) visible.add(id);
      }
    }
    return visible;
  }

  function kanbanVisibleBoardTodos(todos, options = {}) {
    const context = deps(options);
    const visibleReadingIds = kanbanVisibleReadingTodoIds(todos, context);
    return (todos || []).filter((todo) => (
      (!context.isKanbanReadingCard(todo) && !context.isKanbanAssessmentCard(todo))
      || visibleReadingIds.has(String(todo?.id || ""))
    ));
  }

  function stableDisplayHash(value) {
    let hash = 2166136261;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function arrayFromKanbanField(value, limit = 8) {
    const raw = Array.isArray(value) ? value : value ? [value] : [];
    return raw.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit);
  }

  function kanbanDescriptionSection(description, heading) {
    const text = String(description || "");
    const marker = `${heading}:\n`;
    const start = text.indexOf(marker);
    if (start < 0) return "";
    const rest = text.slice(start + marker.length);
    const next = rest.search(/\n\n(?:Multi-Agent plan|Source request|Card goal|Expected deliverables|Acceptance criteria|Dependencies|Concurrency rule):/);
    return (next >= 0 ? rest.slice(0, next) : rest).trim();
  }

  function kanbanDescriptionList(description, heading, limit = 8) {
    return kanbanDescriptionSection(description, heading)
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, limit);
  }

  function parsedKanbanPlanDescription(todo) {
    const description = String(todo?.description || "");
    if (!description) return {};
    const summary = description.match(/(?:^|\n)Multi-Agent plan:\s*([^\n]+)/)?.[1]?.trim() || "";
    return {
      summary,
      sourceText: kanbanDescriptionSection(description, "Source request"),
      cardGoal: kanbanDescriptionSection(description, "Card goal"),
      deliverables: kanbanDescriptionList(description, "Expected deliverables", 8),
      acceptance: kanbanDescriptionList(description, "Acceptance criteria", 8),
      dependsOn: kanbanDescriptionList(description, "Dependencies", 12),
    };
  }

  function kanbanCardCaseInfo(todo) {
    const parsed = parsedKanbanPlanDescription(todo);
    const sourceText = String(todo?.kanbanCaseSourceText || parsed.sourceText || "").trim();
    const summary = String(todo?.kanbanCaseSummary || parsed.summary || sourceText || todo?.content || todo?.id || "").trim();
    const explicitCaseId = String(todo?.kanbanCaseId || "").trim();
    const inferredCaseId = sourceText
      ? `parsed-plan-${stableDisplayHash(`${summary}\0${sourceText}`)}`
      : `single-card-${todo?.id || stableDisplayHash(summary)}`;
    return {
      id: explicitCaseId || inferredCaseId,
      mode: String(todo?.kanbanCaseMode || (sourceText ? "multi-agent" : "single-card")),
      sourceText,
      summary,
      cardId: String(todo?.kanbanCaseCardId || todo?.id || ""),
      cardIndex: Number(todo?.kanbanCaseCardIndex || 0) || 0,
      cardCount: Number(todo?.kanbanCaseCardCount || 0) || 0,
      cardGoal: String(todo?.kanbanCaseCardGoal || parsed.cardGoal || todo?.description || "").trim(),
      dependsOn: arrayFromKanbanField(todo?.kanbanCaseDependsOn, 12).length
        ? arrayFromKanbanField(todo?.kanbanCaseDependsOn, 12)
        : parsed.dependsOn,
      deliverables: arrayFromKanbanField(todo?.kanbanCaseDeliverables, 8).length
        ? arrayFromKanbanField(todo?.kanbanCaseDeliverables, 8)
        : parsed.deliverables,
      acceptance: arrayFromKanbanField(todo?.kanbanCaseAcceptance, 8).length
        ? arrayFromKanbanField(todo?.kanbanCaseAcceptance, 8)
        : parsed.acceptance,
    };
  }

  function kanbanArchiveCases(items, options = {}) {
    const context = deps(options);
    const groups = new Map();
    for (const todo of items || []) {
      const info = kanbanCardCaseInfo(todo);
      if (!groups.has(info.id)) {
        groups.set(info.id, {
          id: info.id,
          mode: info.mode,
          title: info.summary || context.todoTitle(todo),
          sourceText: info.sourceText,
          cards: [],
          latest: 0,
        });
      }
      const group = groups.get(info.id);
      if (!group.sourceText && info.sourceText) group.sourceText = info.sourceText;
      if ((!group.title || group.title === group.id) && info.summary) group.title = info.summary;
      group.cards.push({ todo, info });
      group.latest = Math.max(group.latest, context.todoSortTimestamp(todo));
    }
    return [...groups.values()].map((group) => {
      group.cards.sort((left, right) => {
        const leftIndex = left.info.cardIndex || 999;
        const rightIndex = right.info.cardIndex || 999;
        if (leftIndex !== rightIndex) return leftIndex - rightIndex;
        return context.todoSortTimestamp(left.todo) - context.todoSortTimestamp(right.todo);
      });
      return group;
    }).sort((left, right) => {
      const delta = right.latest - left.latest;
      if (delta) return delta;
      return String(right.id).localeCompare(String(left.id));
    });
  }

  function kanbanStoryCases(items, options = {}) {
    return kanbanArchiveCases(items, options).filter((group) => group.mode !== "single-card");
  }

  function kanbanStoryCaseFullyArchived(group, options = {}) {
    const context = deps(options);
    const cards = group?.mode === "assessment-plan"
      ? kanbanAssessmentVisibleCardItems(group, context)
      : (group?.cards || []);
    return cards.length > 0 && cards.every((item) => context.normalizedKanbanStatus(item.todo) === "archived");
  }

  function kanbanActiveStoryCases(items, options = {}) {
    const context = deps(options);
    return kanbanStoryCases(items, context).filter((group) => !kanbanStoryCaseFullyArchived(group, context));
  }

  function kanbanStoryCaseKey(group) {
    const first = (group?.cards || [])[0]?.todo || {};
    return [
      String(group?.mode || "case"),
      String(group?.id || first.kanbanCaseId || first.id || group?.title || "story"),
    ].filter(Boolean).join(":");
  }

  function kanbanStoryCaseArchiveItems(group, options = {}) {
    const context = deps(options);
    const allCards = group?.cards || [];
    const cards = group?.mode === "assessment-plan"
      ? kanbanAssessmentVisibleCardItems(group, context)
      : allCards;
    if (!cards.length) return [];
    const nonArchived = cards.filter((item) => context.normalizedKanbanStatus(item.todo) !== "archived");
    if (!nonArchived.length) return [];
    const complete = nonArchived.every((item) => context.normalizedKanbanStatus(item.todo) === "done");
    if (!complete) return [];
    const archiveItems = group?.mode === "assessment-plan" ? allCards : nonArchived;
    return archiveItems
      .filter((item) => context.normalizedKanbanStatus(item.todo) !== "archived")
      .filter((item) => context.kanbanCan(item.todo, "canDelete"));
  }

  function kanbanStoryCaseDeleteItems(group, options = {}) {
    const context = deps(options);
    const cards = group?.cards || [];
    if (!cards.length) return [];
    const deletable = cards.filter((item) => context.kanbanCan(item.todo, "canDelete"));
    return deletable.length === cards.length ? deletable : [];
  }

  function kanbanStoryCaseCanDelete(group, options = {}) {
    if (!options.deleteAction) return false;
    const items = kanbanStoryCaseDeleteItems(group, options);
    return Boolean(items.length && kanbanStoryCaseKey(group));
  }

  function kanbanArchiveStatusSummary(group, options = {}) {
    const context = deps(options);
    const counts = new Map();
    for (const item of group.cards || []) {
      const status = context.normalizedKanbanStatus(item.todo);
      counts.set(status, (counts.get(status) || 0) + 1);
    }
    return context.statusOrder
      .filter((status) => counts.has(status))
      .map((status) => `${context.kanbanStatusMeta(status).shortLabel} ${counts.get(status)}`)
      .join(" / ");
  }

  function kanbanCardStoryFeedback(todo, options = {}) {
    const context = deps(options);
    const detail = context.todoCardDetailState(todo?.id || "");
    return context.kanbanDisplayResultText(todo, todo?.kanbanResult || detail?.summary || "");
  }

  function kanbanArchiveConclusion(group, options = {}) {
    const context = deps(options);
    const result = [...(group.cards || [])]
      .sort((left, right) => context.todoSortTimestamp(right.todo) - context.todoSortTimestamp(left.todo))
      .map((item) => kanbanCardStoryFeedback(item.todo, context))
      .find(Boolean);
    if (result) return context.compactDisplayText(result, 320);
    const completed = group.cards.filter((item) => context.normalizedKanbanStatus(item.todo) === "done").length;
    const archived = group.cards.filter((item) => context.normalizedKanbanStatus(item.todo) === "archived").length;
    if (completed || archived) return `Done ${completed} / Archived ${archived}`;
    return "\u672a\u5199\u5165\u7ed3\u679c\u56de\u6267";
  }

  function kanbanCardNeedsStoryDetail(todo, options = {}) {
    const context = deps(options);
    if (!todo || !context.isKanbanTodoSource()) return false;
    if (kanbanCardStoryFeedback(todo, context)) return false;
    if (context.kanbanCardOutputs(todo).length) return false;
    const detail = context.todoCardDetailState(todo.id);
    if (detail?.loading || detail?.error || detail?.summary) return false;
    const status = context.normalizedKanbanStatus(todo);
    return status === "done" || status === "archived";
  }

  function kanbanCardStoryFeedbackLine(todo, options = {}) {
    const context = deps(options);
    const feedback = kanbanCardStoryFeedback(todo, context);
    if (feedback) return context.compactDisplayText(feedback, 220);
    const detail = context.todoCardDetailState(todo?.id || "");
    if (detail?.loading) return "\u6267\u884c\u53cd\u9988\u52a0\u8f7d\u4e2d";
    if (detail?.error) return `\u6267\u884c\u53cd\u9988\u52a0\u8f7d\u5931\u8d25\uff1a${context.compactDisplayText(detail.error, 80)}`;
    if (kanbanCardNeedsStoryDetail(todo, context)) return "\u7b49\u5f85\u52a0\u8f7d\u6267\u884c\u53cd\u9988";
    return "";
  }

  return Object.freeze({
    kanbanReadingCaseKey,
    kanbanVisibleReadingTodoIds,
    kanbanVisibleBoardTodos,
    kanbanReadingRevisionOriginal,
    isKanbanReadingRevision,
    kanbanReadingDisplayCardIndex,
    kanbanRevisionSortTimestamp,
    kanbanLatestRevisionReplacementItems,
    kanbanAssessmentVisibleCardItems,
    assessmentCardHasStoryEvidence,
    kanbanAssessmentStoryVisibleCardItems,
    readingCardHasStoryEvidence,
    kanbanReadingStoryVisibleCardItems,
    kanbanReadingBaseCardItems,
    kanbanReadingDisplayCardCount,
    kanbanCasePriorCards,
    readingCasePriorComplete,
    assessmentPriorComplete,
    kanbanAssessmentCaseCurrentItem,
    kanbanReadingCaseCurrentItem,
    stableDisplayHash,
    arrayFromKanbanField,
    kanbanDescriptionSection,
    kanbanDescriptionList,
    parsedKanbanPlanDescription,
    kanbanCardCaseInfo,
    kanbanArchiveCases,
    kanbanStoryCases,
    kanbanStoryCaseFullyArchived,
    kanbanActiveStoryCases,
    kanbanStoryCaseKey,
    kanbanStoryCaseArchiveItems,
    kanbanStoryCaseDeleteItems,
    kanbanStoryCaseCanDelete,
    kanbanArchiveStatusSummary,
    kanbanArchiveConclusion,
    kanbanCardStoryFeedback,
    kanbanCardNeedsStoryDetail,
    kanbanCardStoryFeedbackLine,
  });
}));
