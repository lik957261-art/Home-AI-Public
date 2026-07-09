"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadModel() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/navigation-shell/kanban-todo-core-model.mjs",
  )).href;
  return import(`${url}?test=${Date.now()}-${Math.random()}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

(async () => {
  await test("kanban todo core model stays browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/kanban-todo-core-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|localStorage|sessionStorage|fetch)\b/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("plans todo title, due label, and open status", async () => {
    const model = await loadModel();
    assert.equal(model.todoTitlePlan({ content: "**Build**\nTask ID: abc\nMEDIA: hidden" }), "Build");
    assert.equal(model.todoTitlePlan({ id: "card-1" }), "card-1");
    assert.equal(model.todoDueLabelPlan({ dueLocal: "2026-07-05 19:00", formattedDueAt: "ignored" }), "2026-07-05 19:00");
    assert.equal(model.todoDueLabelPlan({ formattedDueAt: "Tomorrow" }), "Tomorrow");
    assert.equal(model.todoDueLabelPlan({}), "No due time");
    assert.equal(model.todoMatchesOpenPlan({ status: "open" }), true);
    assert.equal(model.todoMatchesOpenPlan({ status: "done" }), false);
  });

  await test("plans assignee defaults and options", async () => {
    const model = await loadModel();
    const todoAssignees = [
      { id: "owner", label: "Owner" },
      { id: "worker", label: "Worker" },
    ];
    assert.equal(model.defaultTodoAssigneePlan({ todoAssignees, selectedWorkspaceId: "worker" }), "worker");
    assert.equal(model.defaultTodoAssigneePlan({ todoAssignees, selectedWorkspaceId: "missing" }), "owner");
    assert.equal(model.defaultTodoAssigneePlan({ todoAssignees: [], selectedWorkspaceId: "solo" }), "solo");
    const plan = model.todoAssigneeOptionsPlan({ todoAssignees, selected: "worker", selectedWorkspaceId: "owner" });
    assert.equal(plan.current, "worker");
    assert.deepEqual(plan.options.map((item) => item.selected), [false, true]);
    assert.deepEqual(plan.options.map((item) => item.label), ["Owner", "Worker"]);
  });

  await test("plans local and todo due input values", async () => {
    const model = await loadModel();
    assert.equal(
      model.localDateTimeInputValuePlan("2026-07-05T08:09:00.000Z", { nowMs: Date.UTC(2026, 6, 5, 0, 0) }).slice(0, 10),
      "2026-07-05",
    );
    assert.equal(model.todoDueInputValuePlan({ dueLocal: "2026-07-06 09:30" }), "2026-07-06T09:30");
    assert.equal(model.todoDueInputValuePlan({ dueAt: "2026-07-07T10:45:00" }), "2026-07-07T10:45");
    assert.equal(model.todoDueInputValuePlan({}, { fallbackMs: new Date("2026-07-08T11:15:00").getTime() }), "2026-07-08T11:15");
  });

  await test("plans kanban core status loading, case type, and permissions", async () => {
    const model = await loadModel();
    const statusOptions = { storyStatus: "stories", statusOrder: ["todo", "running", "done"] };
    assert.equal(model.kanbanStatusNeedsCompletedPlan("stories", statusOptions), true);
    assert.equal(model.shouldLoadCompletedTodosPlan(Object.assign({}, statusOptions, { searchText: "math" })), true);
    assert.equal(model.shouldLoadCompletedTodosPlan(Object.assign({}, statusOptions, { todoKanbanStatus: "todo" })), true);
    assert.equal(model.shouldLoadCompletedTodosPlan(Object.assign({}, statusOptions, { todoKanbanStatus: "unknown" })), false);

    const reading = { kanbanCaseMode: "study-plan", kanbanCaseTemplate: "english-reading" };
    assert.equal(model.isKanbanReadingPlanCasePlan(reading), true);
    assert.equal(model.kanbanStudyLabelsPlan(reading).submit, "提交录音");
    assert.equal(model.isKanbanLearningGrowthCardPlan({ kanbanCaseMode: "study-plan", kanbanCaseTemplate: "learning-growth" }), true);
    assert.equal(model.isKanbanProgrammingAssessmentCardPlan({
      kanbanCaseMode: "assessment-plan",
      content: "Python coding assessment",
    }), true);
    assert.equal(model.kanbanCanPlan({ kanbanActorRole: "viewer" }, "canSubmitStudy"), false);
    assert.equal(model.kanbanCanPlan({ kanbanActorPermissions: { canSubmitStudy: true } }, "canSubmitStudy"), true);
  });

  await test("plans kanban composer, cache, and status projections", async () => {
    const model = await loadModel();
    assert.equal(model.normalizeKanbanStudyScheduleFrequencyPlan("每周"), "weekly");
    assert.deepEqual(model.parseKanbanStudyWeekdaysPlan("1,0,3,3,9"), [1, 7, 3]);
    assert.deepEqual(model.saveKanbanComposerModePlan("reading"), { mode: "study", multiAgent: false });
    assert.equal(model.saveKanbanComposerReasoningEffortPlan("XHIGH"), "xhigh");
    assert.match(model.kanbanComposerDocumentContextPlan([{ name: "a.txt", text: "hello" }]), /Document 1: a\.txt/);
    assert.equal(model.kanbanComposerSubmissionTextPlan("task", "doc"), "task\n\ndoc");
    assert.equal(model.todoListCacheKeyPlan({ clientVersion: "v1", workspaceId: "owner", includeCompleted: true }), "hermesTodoList:v1:owner:all");
    assert.equal(model.applyTodoListResultPlan({ data: [{ id: "a", kanbanBoard: "main" }] }, true, "owner").todoKanbanBoard, "main");
    assert.equal(model.normalizedKanbanStatusPlan({ status: "completed" }, { statusOrder: ["todo", "done"] }), "done");
    assert.equal(model.normalizedKanbanStatusPlan(
      { status: "completed", kanbanStatus: "done" },
      { statusOrder: ["todo", "done"], assessmentCard: true, assessmentCompleted: false },
    ), "blocked");
    assert.equal(model.currentTodoKanbanStatusPlan({
      selectedStatus: "",
      storyStatus: "stories",
      statusOrder: ["todo"],
      fallbackOrder: ["todo", "running"],
      groupedCounts: { running: 1 },
    }), "running");
  });

  await test("plans archived sorting and result text cleanup", async () => {
    const model = await loadModel();
    assert.deepEqual(model.sortArchivedKanbanCardsPlan([
      { id: "a", updatedAt: "2026-07-05T08:00:00Z" },
      { id: "b", updatedAt: "2026-07-05T09:00:00Z" },
    ]).map((item) => item.id), ["b", "a"]);
    assert.equal(model.cleanKanbanInternalResultLinesPlan("ok\nMEDIA: x\n\n\nAudio file: y\nnext"), "ok\n\nnext");
    assert.equal(model.cleanKanbanReadingResultTextPlan("Transcript: words\nAI analysis:\nGreat\nMEDIA: x"), "Great");
    assert.equal(model.kanbanDisplayResultTextPlan({ text: "hidden", assessmentCard: true, assessmentVisible: false }), "");
    assert.equal(model.kanbanDisplayResultTextPlan({ text: "ok\nMEDIA: x", readingCard: false }), "ok");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
