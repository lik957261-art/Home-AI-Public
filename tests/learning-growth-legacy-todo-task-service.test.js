"use strict";

const assert = require("node:assert/strict");
const {
  createLearningGrowthLegacyTodoTaskService,
  projectLegacyTodoTask,
} = require("../adapters/learning-growth-legacy-todo-task-service");

function testProjectLegacyReadingTask() {
  const task = projectLegacyTodoTask({
    id: "t_read_5",
    content: "\u51e1\u51e1\u9605\u8bfb\u300aEverything's amazing\u300b\u7b2c 5/10 \u6b21\uff1a\u5f55\u97f3\u590d\u8ff0",
    status: "open",
    assignee: "weixin_stephen",
  });
  assert.equal(task.taskCardId, "legacy_todo:t_read_5");
  assert.equal(task.todoId, "t_read_5");
  assert.equal(task.source, "official_kanban_migrated");
  assert.equal(task.readOnly, true);
  assert.equal(task.status, "published");
  assert.equal(task.nativeState.nextAction, "open");
  assert.equal(task.programId, "legacy-reading-retell");
  assert.equal(task.sequenceIndex, 5);
  assert.equal(task.sequenceTotal, 10);
  assert.equal(task.taskModel.skillId, "english_speaking_retell");
  assert.match(task.instructionPreview, /\u539f\u770b\u677f\u8be6\u60c5/);
  assert.equal(JSON.stringify(task).includes("raw_json"), false);
}

function testProjectLegacyDoneAssessmentTask() {
  const task = projectLegacyTodoTask({
    id: "t_math_2",
    content: "\u51e1\u51e1\u6570\u5b66\u7b2c 2/10 \u6b21\u6b63\u5f0f\u6d4b\u8bd5",
    status: "done",
    assignee: "weixin_stephen",
  });
  assert.equal(task.programId, "legacy-assessment");
  assert.equal(task.status, "completed");
  assert.equal(task.nativeState.nextAction, "complete");
}

function testServiceReadsOnlyOfficialMigratedTodosForLearner() {
  const calls = [];
  const service = createLearningGrowthLegacyTodoTaskService({
    mobileStore: {
      listTodoItems(input) {
        calls.push(input);
        return [
          { id: "t_py_3", content: "\u51e1\u51e1Python \u7f16\u7a0b\u7b2c 3/10 \u6b21\u7f16\u7a0b\u6d4b\u9a8c", status: "open", assignee: "weixin_stephen" },
        ];
      },
    },
  });
  const tasks = service.listExecutableTasks({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen", limit: 5 });
  assert.deepEqual(calls[0], {
    source: "official_kanban_migrated",
    assignee: "weixin_stephen",
    includeCompleted: true,
    limit: 80,
  });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].programId, "legacy-python");
  assert.equal(tasks[0].primaryAction, undefined);
  assert.equal(tasks[0].readOnly, true);
}

function testServiceSkipsLegacyRepairCardsThatWouldBlockFormalSequence() {
  const service = createLearningGrowthLegacyTodoTaskService({
    mobileStore: {
      listTodoItems() {
        return [
          { id: "t_math_repair_1", content: "\u4fee\u6539\uff1a\u4fee\u6539\uff1a\u51e1\u51e1\u6570\u5b66\u7b2c 1/10 \u6b21\u6b63\u5f0f\u6d4b\u8bd5", status: "open", assignee: "weixin_stephen" },
          { id: "t_math_1", content: "\u51e1\u51e1\u6570\u5b66\u7b2c 1/10 \u6b21\u6b63\u5f0f\u6d4b\u8bd5", status: "done", assignee: "weixin_stephen" },
          { id: "t_math_2", content: "\u51e1\u51e1\u6570\u5b66\u7b2c 2/10 \u6b21\u6b63\u5f0f\u6d4b\u8bd5", status: "done", assignee: "weixin_stephen" },
          { id: "t_math_3", content: "\u51e1\u51e1\u6570\u5b66\u7b2c 3/10 \u6b21\u6b63\u5f0f\u6d4b\u8bd5", status: "done", assignee: "weixin_stephen" },
          { id: "t_math_4", content: "\u51e1\u51e1\u6570\u5b66\u7b2c 4/10 \u6b21\u6b63\u5f0f\u6d4b\u8bd5", status: "done", assignee: "weixin_stephen" },
          { id: "t_math_5", content: "\u51e1\u51e1\u6570\u5b66\u7b2c 5/10 \u6b21\u6b63\u5f0f\u6d4b\u8bd5", status: "open", assignee: "weixin_stephen" },
        ];
      },
    },
  });
  const tasks = service.listExecutableTasks({ learnerId: "weixin_stephen" });
  assert.equal(tasks.some((task) => task.todoId === "t_math_repair_1"), false);
  assert.deepEqual(tasks.filter((task) => task.programId === "legacy-assessment").map((task) => task.sequenceIndex), [1, 2, 3, 4, 5]);
  assert.equal(tasks.find((task) => task.todoId === "t_math_5").status, "published");
}

function testServiceTreatsStaleOpenEarlierCardsAsCompletedWhenLaterSequenceIsDone() {
  const service = createLearningGrowthLegacyTodoTaskService({
    mobileStore: {
      listTodoItems() {
        return [
          { id: "t_math_1", content: "\u51e1\u51e1\u6570\u5b66\u7b2c 1/10 \u6b21\u6b63\u5f0f\u6d4b\u8bd5", status: "open", assignee: "weixin_stephen" },
          { id: "t_math_2", content: "\u51e1\u51e1\u6570\u5b66\u7b2c 2/10 \u6b21\u6b63\u5f0f\u6d4b\u8bd5", status: "done", assignee: "weixin_stephen" },
          { id: "t_math_3", content: "\u51e1\u51e1\u6570\u5b66\u7b2c 3/10 \u6b21\u6b63\u5f0f\u6d4b\u8bd5", status: "done", assignee: "weixin_stephen" },
          { id: "t_math_4", content: "\u51e1\u51e1\u6570\u5b66\u7b2c 4/10 \u6b21\u6b63\u5f0f\u6d4b\u8bd5", status: "done", assignee: "weixin_stephen" },
          { id: "t_math_5", content: "\u51e1\u51e1\u6570\u5b66\u7b2c 5/10 \u6b21\u6b63\u5f0f\u6d4b\u8bd5", status: "open", assignee: "weixin_stephen" },
        ];
      },
    },
  });
  const tasks = service.listExecutableTasks({ learnerId: "weixin_stephen" });
  const first = tasks.find((task) => task.todoId === "t_math_1");
  assert.equal(first.status, "completed");
  assert.equal(first.nativeState.nextAction, "complete");
  assert.equal(first.legacyStaleOpenBehindCompleted, true);
  assert.equal(tasks.find((task) => task.todoId === "t_math_5").status, "published");
}

testProjectLegacyReadingTask();
testProjectLegacyDoneAssessmentTask();
testServiceReadsOnlyOfficialMigratedTodosForLearner();
testServiceSkipsLegacyRepairCardsThatWouldBlockFormalSequence();
testServiceTreatsStaleOpenEarlierCardsAsCompletedWhenLaterSequenceIsDone();
console.log("learning growth legacy todo task service tests passed");
