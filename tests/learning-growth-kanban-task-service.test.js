"use strict";

const assert = require("node:assert/strict");
const {
  createLearningGrowthKanbanTaskService,
  isLearningGrowthKanbanCard,
  projectLearningGrowthKanbanTask,
} = require("../adapters/learning-growth-kanban-task-service");

async function testProjectsOnlyLearningGrowthKanbanCards() {
  const calls = [];
  const service = createLearningGrowthKanbanTaskService({
    kanbanCardProvider: {
      async listCards(input) {
        calls.push(input);
        return {
          ok: true,
          source: "hermes_kanban",
          board: "workspace-child",
          data: [
            {
              id: "t_growth",
              status: "open",
              content: "English writing task",
              assignee: "child",
              workspaceId: "child",
              kanbanCaseTemplate: "learning-growth",
              kanbanStudyKind: "learning-growth",
              kanbanCaseMode: "study-plan",
              kanbanCaseCardId: "writing-1",
              kanbanCaseCardGoal: "short instruction",
              dueLocal: "2026-05-17 19:30",
            },
            {
              id: "t_reading",
              status: "open",
              content: "Reading task",
              assignee: "child",
              workspaceId: "child",
              kanbanCaseTemplate: "reading",
            },
            {
              id: "t_done",
              status: "done",
              content: "Done growth task",
              assignee: "child",
              workspaceId: "child",
              kanbanCaseTemplate: "learning-growth",
            },
          ],
        };
      },
    },
  });
  const result = await service.listExecutableTasks({ workspaceId: "child", learnerId: "child", limit: 10 });
  assert.equal(result.ok, true);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].taskCardId, "t_growth");
  assert.equal(result.tasks[0].todoId, "t_growth");
  assert.equal(result.tasks[0].source, "kanban");
  assert.equal(result.tasks[0].status, "published");
  assert.equal(result.tasks[0].kanbanStatus, "open");
  assert.equal(result.tasks[0].workspaceId, "child");
  assert.equal(result.tasks[0].learnerId, "child");
  assert.equal(result.tasks[0].hasInstruction, true);
  assert.match(result.tasks[0].openUrl, /view=todos/);
  assert.deepEqual(calls[0], {
    workspaceId: "child",
    scope: "mine",
    includeCompleted: false,
    limit: 120,
    search: "",
  });
}

async function testOwnerManagedKanbanCardsIncludeOnlyGrowthCards() {
  const calls = [];
  const service = createLearningGrowthKanbanTaskService({
    managedLearnerWorkspaceIds: ["child", "child"],
    kanbanCardProvider: {
      async listCards(input) {
        calls.push(input);
        return {
          ok: true,
          source: "hermes_kanban",
          data: [
            {
              id: "t_growth",
              status: "todo",
              content: "Writing task",
              workspaceId: "child",
              kanbanCaseTemplate: "learning-growth",
              kanbanCaseMode: "study-plan",
            },
            {
              id: "t_reading",
              status: "todo",
              content: "Reading task",
              workspaceId: "child",
              kanbanCaseTemplate: "reading",
            },
          ],
        };
      },
    },
  });
  assert.equal(service.shouldIncludeOwnerKanbanCards({ isOwner: true, workspaceId: "owner" }), true);
  assert.equal(service.shouldIncludeOwnerKanbanCards({ isOwner: false, workspaceId: "owner" }), false);
  assert.equal(service.shouldIncludeOwnerKanbanCards({ isOwner: true, workspaceId: "child" }), false);
  const result = await service.listOwnerManagedKanbanCards({
    isOwner: true,
    workspaceId: "owner",
    listArgs: { includeCompleted: false, limit: 20, search: "writing", targetId: "t_growth" },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.cards.map((card) => card.id), ["t_growth"]);
  assert.equal(result.cards[0].ownerManagedLearnerWorkspaceId, "child");
  assert.deepEqual(calls, [{
    workspaceId: "child",
    scope: "mine",
    includeCompleted: false,
    assignee: "",
    limit: 120,
    search: "writing",
    targetId: "t_growth",
  }]);

  const skipped = await service.listOwnerManagedKanbanCards({ isOwner: false, workspaceId: "owner" });
  assert.equal(skipped.cards.length, 0);
  assert.equal(calls.length, 1);
}

function testHelpers() {
  assert.equal(isLearningGrowthKanbanCard({ kanbanCaseTemplate: "learning-growth" }), true);
  assert.equal(isLearningGrowthKanbanCard({ kanbanStudyKind: "learning-growth" }), true);
  assert.equal(isLearningGrowthKanbanCard({ kanbanCaseTemplate: "reading" }), false);
  const task = projectLearningGrowthKanbanTask({
    id: "t1",
    status: "running",
    content: "Task",
    workspaceId: "child",
    kanbanCaseTemplate: "learning-growth",
  }, { workspaceId: "child", learnerId: "child" });
  assert.equal(task.status, "active");
  assert.equal(task.domain, "english");
}

(async () => {
  testHelpers();
  await testProjectsOnlyLearningGrowthKanbanCards();
  await testOwnerManagedKanbanCardsIncludeOnlyGrowthCards();
  console.log("learning growth kanban task service tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
