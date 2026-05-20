"use strict";

const assert = require("node:assert/strict");
const {
  createLearningGrowthSequenceService,
  findNextSequenceTask,
} = require("../adapters/learning-growth-sequence-service");

function task(id, sequenceIndex, status = "published") {
  return {
    taskCardId: id,
    programId: "program-1",
    draftId: "draft-1",
    learnerId: "learner-1",
    workspaceId: "learner-1",
    sequenceIndex,
    status,
    title: `Task ${sequenceIndex}`,
    taskModel: { activityType: "short_writing" },
  };
}

function testFindNextSequenceTaskSkipsCompletedCards() {
  const next = findNextSequenceTask([
    task("task-1", 1, "completed"),
    task("task-2", 2, "published"),
    task("task-3", 3, "published"),
  ], task("task-1", 1, "completed"));
  assert.equal(next.taskCardId, "task-2");
}

async function testPrepareNextAfterCompletionRegeneratesOnlyNextTask() {
  const tasks = [
    task("task-1", 1, "completed"),
    task("task-2", 2, "published"),
    task("task-3", 3, "published"),
  ];
  const savedTasks = [];
  const jitInputs = [];
  const programService = {
    getTaskCard(taskCardId) {
      return tasks.find((item) => item.taskCardId === taskCardId) || null;
    },
    getProgram(programId) {
      return { programId, learnerId: "learner-1", workspaceId: "learner-1", title: "English growth" };
    },
    listTaskCards(filters = {}) {
      assert.equal(filters.draftId, "draft-1");
      return tasks;
    },
    repository: {
      getPlanDraft(draftId) {
        return { draftId, programId: "program-1", learnerId: "learner-1", workspaceId: "learner-1" };
      },
      upsertTaskCard(nextTask) {
        savedTasks.push(nextTask);
        return nextTask;
      },
    },
  };
  const jitTaskService = {
    recentLearningState(input = {}) {
      return {
        learnerId: input.learnerId,
        sources: [{ sourceRef: "summary-1", summary: "weak point summary only" }],
      };
    },
    async prepareTaskForCard(input = {}) {
      jitInputs.push(input);
      return Object.assign({}, input.task, {
        learnerInstruction: "Generated instruction from latest summary state.",
        learningGrowthJitGeneration: {
          modelStatus: "completed",
          sequenceIndex: input.sequenceIndex,
        },
        taskModel: Object.assign({}, input.task.taskModel, {
          learnerInstruction: "Generated instruction from latest summary state.",
          jitGeneration: {
            modelStatus: "completed",
            sequenceIndex: input.sequenceIndex,
          },
        }),
      });
    },
  };
  const service = createLearningGrowthSequenceService({
    learningProgramService: programService,
    jitTaskService,
    nowIso: () => "2026-05-20T08:00:00.000Z",
  });
  const result = await service.prepareNextAfterCompletion({
    taskCardId: "task-1",
    workspaceId: "learner-1",
    learnerId: "learner-1",
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "next_task_prepared");
  assert.equal(result.previousTaskCardId, "task-1");
  assert.equal(result.taskCardId, "task-2");
  assert.equal(result.sequenceIndex, 2);
  assert.equal(result.modelStatus, "completed");
  assert.equal(savedTasks.length, 1);
  assert.equal(savedTasks[0].taskCardId, "task-2");
  assert.equal(savedTasks[0].learningGrowthGeneratedAfterTaskCardId, "task-1");
  assert.equal(savedTasks[0].learningGrowthSequenceVisibility, "current");
  assert.equal(jitInputs.length, 1);
  assert.equal(jitInputs[0].task.taskCardId, "task-2");
  assert.equal(JSON.stringify(result).includes("Generated instruction"), false);
}

(async () => {
  testFindNextSequenceTaskSkipsCompletedCards();
  await testPrepareNextAfterCompletionRegeneratesOnlyNextTask();
  console.log("learning growth sequence service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
