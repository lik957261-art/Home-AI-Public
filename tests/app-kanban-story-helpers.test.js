"use strict";

const assert = require("node:assert/strict");
const Helpers = require("../public/app-kanban-story-helpers");

const statusOrder = ["triage", "todo", "ready", "running", "blocked", "done", "archived"];
const statusMeta = (status) => ({ shortLabel: status.toUpperCase(), label: status });
const todoSortTimestamp = (todo) => Date.parse(todo.updatedAt || todo.createdAt || "2026-01-01T00:00:00Z") || 0;
const normalizedKanbanStatus = (todo) => todo.kanbanStatus || todo.status || "todo";

function baseOptions(extra = {}) {
  return Object.assign({
    statusOrder,
    kanbanStatusMeta: statusMeta,
    todoSortTimestamp,
    normalizedKanbanStatus,
    todoTitle: (todo) => todo.content || todo.id,
    compactDisplayText: (value, max = 180) => {
      const text = String(value || "").trim();
      return text.length <= max ? text : `${text.slice(0, max - 1)}...`;
    },
    isKanbanReadingCard: (todo) => todo.kind === "reading",
    isKanbanAssessmentCard: (todo) => todo.kind === "assessment",
    readingSubmissionHasAnalysis: (todo) => Boolean(todo.hasAnalysis),
    readingSubmissionCompleted: (todo) => Boolean(todo.completed),
    readingCardAcceptsSubmission: (todo) => Boolean(todo.acceptsSubmission),
    assessmentExamSummary: (todo) => todo.exam || null,
    assessmentExamCompleted: (todo) => Boolean(todo.examCompleted),
    assessmentCardAcceptsStart: (todo) => Boolean(todo.canStart),
    kanbanCan: (todo, key) => todo.permissions?.[key] !== false,
    kanbanDisplayResultText: (_todo, text) => String(text || "").trim(),
    todoCardDetailState: (id) => extra.details?.[id] || null,
    kanbanCardOutputs: (todo) => todo.outputs || [],
    isKanbanTodoSource: () => true,
  }, extra);
}

{
  const todo = {
    id: "card-1",
    description: [
      "Multi-Agent plan: Build report",
      "",
      "Source request:",
      "Analyze the source files",
      "",
      "Card goal:",
      "Write the first draft",
      "",
      "Expected deliverables:",
      "- draft.md",
      "- notes.txt",
      "",
      "Acceptance criteria:",
      "- review passes",
      "",
      "Dependencies:",
      "- Scope",
    ].join("\n"),
  };
  const parsed = Helpers.parsedKanbanPlanDescription(todo);
  assert.equal(parsed.summary, "Build report");
  assert.equal(parsed.sourceText, "Analyze the source files");
  assert.equal(parsed.cardGoal, "Write the first draft");
  assert.deepEqual(parsed.deliverables, ["draft.md", "notes.txt"]);
  assert.deepEqual(parsed.acceptance, ["review passes"]);
  assert.deepEqual(parsed.dependsOn, ["Scope"]);

  const info = Helpers.kanbanCardCaseInfo(todo);
  assert.match(info.id, /^parsed-plan-/);
  assert.equal(info.mode, "multi-agent");
  assert.equal(info.summary, "Build report");
}

{
  const group = {
    cards: [
      { todo: { id: "base-1", updatedAt: "2026-01-01T00:00:00Z" }, info: { cardIndex: 1 } },
      { todo: { id: "base-2", updatedAt: "2026-01-02T00:00:00Z" }, info: { cardIndex: 2 } },
      { todo: { id: "rev-old", kanbanRevisionOf: "base-1", kanbanRevisionCount: 1, updatedAt: "2026-01-03T00:00:00Z" }, info: { cardIndex: 1 } },
      { todo: { id: "rev-new", kanbanRevisionOf: "base-1", kanbanRevisionCount: 2, updatedAt: "2026-01-04T00:00:00Z" }, info: { cardIndex: 1 } },
    ],
  };
  const visible = Helpers.kanbanLatestRevisionReplacementItems(group, null, baseOptions());
  assert.deepEqual(visible.map((item) => item.todo.id), ["rev-new", "base-2"]);
  assert.equal(Helpers.kanbanReadingDisplayCardIndex(group, visible[0]), 1);
}

{
  const cards = [
    { todo: { id: "r1", kind: "reading", kanbanCaseId: "case", kanbanCaseCardIndex: 1, status: "done", completed: true }, info: { cardIndex: 1 } },
    { todo: { id: "r2", kind: "reading", kanbanCaseId: "case", kanbanCaseCardIndex: 2, status: "blocked", hasAnalysis: true, completed: false }, info: { cardIndex: 2 } },
    { todo: { id: "r3", kind: "reading", kanbanCaseId: "case", kanbanCaseCardIndex: 3, status: "todo", acceptsSubmission: true }, info: { cardIndex: 3 } },
  ];
  const current = Helpers.kanbanReadingCaseCurrentItem({ cards }, baseOptions());
  assert.equal(current.todo.id, "r2");
  assert.deepEqual(Helpers.kanbanReadingStoryVisibleCardItems({ cards }, baseOptions()).map((item) => item.todo.id), ["r1", "r2"]);
  const visibleIds = Helpers.kanbanVisibleReadingTodoIds(cards.map((item) => item.todo), baseOptions());
  assert.deepEqual([...visibleIds], ["r1", "r2"]);
}

{
  const cards = [
    { todo: { id: "a1", kind: "assessment", kanbanCaseId: "exam", kanbanCaseCardIndex: 1, kanbanStatus: "blocked", exam: { status: "retake_required" } }, info: { cardIndex: 1 } },
    { todo: { id: "a2", kind: "assessment", kanbanCaseId: "exam", kanbanCaseCardIndex: 2, kanbanStatus: "todo", canStart: true }, info: { cardIndex: 2 } },
  ];
  assert.equal(Helpers.kanbanAssessmentCaseCurrentItem({ cards }, baseOptions()).todo.id, "a1");
}

{
  const cards = [
    {
      todo: {
        id: "a1",
        kind: "assessment",
        kanbanCaseId: "exam",
        kanbanCaseCardIndex: 1,
        kanbanStatus: "done",
        examCompleted: true,
        exam: { status: "completed", lastAttempt: { score: 70, passed: true } },
        outputs: [{ name: "assessment-report.md", url: "/output/a1" }],
      },
      info: { cardIndex: 1 },
    },
    { todo: { id: "a2", kind: "assessment", kanbanCaseId: "exam", kanbanCaseCardIndex: 2, kanbanStatus: "todo", canStart: true }, info: { cardIndex: 2 } },
    { todo: { id: "a3", kind: "assessment", kanbanCaseId: "exam", kanbanCaseCardIndex: 3, kanbanStatus: "blocked" }, info: { cardIndex: 3 } },
  ];
  const options = baseOptions();
  assert.equal(Helpers.kanbanAssessmentCaseCurrentItem({ cards }, options).todo.id, "a2");
  assert.deepEqual(Helpers.kanbanAssessmentStoryVisibleCardItems({ cards }, options).map((item) => item.todo.id), ["a1", "a2"]);
  const visibleIds = Helpers.kanbanVisibleReadingTodoIds(cards.map((item) => item.todo), options);
  assert.deepEqual([...visibleIds], ["a1", "a2"]);
}

{
  const todos = [
    { id: "old", content: "Old", kanbanCaseId: "case-old", kanbanCaseSummary: "Old case", updatedAt: "2026-01-01T00:00:00Z", kanbanStatus: "done" },
    { id: "new", content: "New", kanbanCaseId: "case-new", kanbanCaseSummary: "New case", updatedAt: "2026-01-02T00:00:00Z", kanbanStatus: "done" },
  ];
  const groups = Helpers.kanbanArchiveCases(todos, baseOptions());
  assert.deepEqual(groups.map((group) => group.id), ["case-new", "case-old"]);
  assert.equal(Helpers.kanbanArchiveStatusSummary(groups[0], baseOptions()), "DONE 1");
  assert.equal(Helpers.kanbanStoryCaseKey(groups[0]), "single-card:case-new");
}

{
  const todos = [
    { id: "single", content: "Take medicine", kanbanStatus: "todo", updatedAt: "2026-01-03T00:00:00Z" },
    { id: "planned", content: "Planned work", kanbanCaseId: "case-planned", kanbanCaseMode: "multi-agent", kanbanStatus: "todo", updatedAt: "2026-01-04T00:00:00Z" },
  ];
  const groups = Helpers.kanbanStoryCases(todos, baseOptions());
  assert.deepEqual(groups.map((group) => group.id), ["case-planned"]);
  assert.equal(groups[0].mode, "multi-agent");
  const active = Helpers.kanbanActiveStoryCases(todos, baseOptions());
  assert.deepEqual(active.map((group) => group.id), ["case-planned"]);
}

{
  const todos = [
    {
      id: "growth-1",
      content: "Writing practice",
      kanbanCaseId: "growth-case",
      kanbanCaseMode: "study-plan",
      kanbanCaseTemplate: "learning-growth",
      kanbanCaseSummary: "English growth",
      kanbanCaseCardIndex: 1,
      kanbanStatus: "todo",
      updatedAt: "2026-01-05T00:00:00Z",
    },
  ];
  const groups = Helpers.kanbanStoryCases(todos, baseOptions());
  assert.equal(groups.length, 1);
  assert.equal(groups[0].mode, "study-plan");
  assert.equal(groups[0].caseTemplate, "learning-growth");
  assert.equal(groups[0].cards[0].todo.id, "growth-1");
}

{
  const group = {
    cards: [
      { todo: { id: "done-1", kanbanStatus: "done", permissions: { canDelete: true } } },
      { todo: { id: "done-2", kanbanStatus: "done", permissions: { canDelete: true } } },
    ],
  };
  assert.deepEqual(Helpers.kanbanStoryCaseArchiveItems(group, baseOptions()).map((item) => item.todo.id), ["done-1", "done-2"]);
  assert.deepEqual(Helpers.kanbanStoryCaseDeleteItems(group, baseOptions()).map((item) => item.todo.id), ["done-1", "done-2"]);
  group.cards[1].todo.permissions.canDelete = false;
  assert.deepEqual(Helpers.kanbanStoryCaseDeleteItems(group, baseOptions()), []);
}

{
  const group = { cards: [{ todo: { id: "done", kanbanStatus: "done", kanbanResult: "Finished with evidence." } }] };
  assert.equal(Helpers.kanbanArchiveConclusion(group, baseOptions()), "Finished with evidence.");
  assert.equal(Helpers.kanbanCardStoryFeedbackLine(group.cards[0].todo, baseOptions()), "Finished with evidence.");
  assert.equal(
    Helpers.kanbanCardStoryFeedbackLine({ id: "missing", kanbanStatus: "done" }, baseOptions()),
    "\u7b49\u5f85\u52a0\u8f7d\u6267\u884c\u53cd\u9988",
  );
}

console.log("app-kanban-story-helpers tests passed");
