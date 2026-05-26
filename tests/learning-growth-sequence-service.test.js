"use strict";

const assert = require("node:assert/strict");
const {
  completionGateForTask,
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

function testFindNextSequenceTaskIgnoresDuplicateCurrentTask() {
  const next = findNextSequenceTask([
    task("task-1", 1, "published"),
    task("task-2", 2, "published"),
  ], task("task-1", 1, "published"));
  assert.equal(next.taskCardId, "task-2");
}

async function testPrepareNextAfterCompletionRegeneratesOnlyNextTask() {
  const tasks = [
    task("task-1", 1, "completed"),
    task("task-2", 2, "published"),
    task("task-3", 3, "published"),
  ];
  const savedTasks = [];
  const savedArtifacts = [];
  const savedTrajectories = [];
  const jitInputs = [];
  const programService = {
    getTaskCard(taskCardId) {
      return tasks.find((item) => item.taskCardId === taskCardId) || null;
    },
    getProgram(programId) {
      return { programId, learnerId: "learner-1", workspaceId: "learner-1", title: "English growth" };
    },
    listTaskCards(filters = {}) {
      assert.equal(filters.programId, "program-1");
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
      saveTaskArtifact(artifact) {
        savedArtifacts.push(artifact);
        return artifact;
      },
      upsertCardTrajectory(trajectory) {
        const saved = Object.assign({ trajectoryId: "traj-1" }, trajectory);
        savedTrajectories.push(saved);
        return saved;
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
    decisionReportService: {
      writeReport(input = {}) {
        return {
          artifactId: `report-${input.task.taskCardId}`,
          name: "jit-decision.md",
          title: "AI JIT decision report",
          mime: "text/markdown; charset=utf-8",
          size: 123,
          summary: "Decision report generated.",
          createdAt: "2026-05-20T08:00:00.000Z",
        };
      },
    },
    learningProgramService: programService,
    jitTaskService,
    nowIso: () => "2026-05-20T08:00:00.000Z",
    reportDirectoryForCard(workspaceId, taskCardId, card = {}) {
      return `C:\\LearningPlan\\${workspaceId}\\series\\${card.sequenceGroupId || card.programId}\\deliverables`;
    },
  });
  const result = await service.prepareNextAfterCompletion({
    taskCardId: "task-1",
    workspaceId: "learner-1",
    learnerId: "learner-1",
    completedEvaluation: {
      evaluationId: "eval-low-score",
      score: 55,
      completionDecision: "complete_current_card",
      completionPolicy: {
        attemptNo: 3,
        seriousSubmission: true,
        threeSeriousSubmissionsComplete: true,
      },
      remainingWeaknesses: ["Retell in clearer order next time."],
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "next_task_prepared");
  assert.equal(result.previousTaskCardId, "task-1");
  assert.equal(result.taskCardId, "task-2");
  assert.equal(result.sequenceIndex, 2);
  assert.equal(result.modelStatus, "completed");
  assert.equal(result.decisionReportArtifactId, "report-task-2");
  assert.equal(result.trajectoryId, "traj-1");
  assert.equal(result.nextCardStrategy.strategy, "repair");
  assert.equal(savedTasks.length, 2);
  assert.equal(savedTasks[0].taskCardId, "task-1");
  assert.equal(savedTasks[0].status, "completed");
  assert.equal(savedTasks[1].taskCardId, "task-2");
  assert.equal(savedTasks[1].learningGrowthGeneratedAfterTaskCardId, "task-1");
  assert.equal(savedTasks[1].learningGrowthSequenceVisibility, "current");
  assert.equal(savedTasks[1].deliverableDirectoryPath, "C:\\LearningPlan\\learner-1\\series\\program:program-1\\deliverables");
  assert.equal(savedTasks[1].artifactDirectoryPath, savedTasks[1].deliverableDirectoryPath);
  assert.equal(jitInputs.length, 1);
  assert.equal(jitInputs[0].task.taskCardId, "task-2");
  assert.equal(jitInputs[0].recentLearningState.sources[0].sourceType, "completion_policy_feedback");
  assert.equal(jitInputs[0].recentLearningState.sources[0].tags.includes("low score"), true);
  assert.equal(savedArtifacts.length, 1);
  assert.equal(savedArtifacts[0].taskCardId, "task-2");
  assert.equal(savedArtifacts[0].artifactType, "jit_decision_report");
  assert.equal(savedArtifacts[0].raw.path, undefined);
  assert.equal(savedTrajectories.length, 1);
  assert.equal(savedTrajectories[0].taskCardId, "task-1");
  assert.equal(savedTrajectories[0].nextTaskCardId, "task-2");
  assert.equal(savedTrajectories[0].strategy, "repair");
  assert.equal(JSON.stringify(savedTrajectories[0]).includes("Generated instruction"), false);
  assert.equal(JSON.stringify(result).includes("Generated instruction"), false);
}

async function testPrepareNextAfterCompletionCreatesEvergreenTaskWhenSequenceEnds() {
  const tasks = [
    Object.assign(task("task-1", 1, "published"), {
      title: "Evergreen math 1",
      sequenceMode: "evergreen_jit",
      completionPolicy: { scope: "learner_sequence", minIntervalHours: 24 },
    }),
  ];
  const savedTasks = [];
  const jitInputs = [];
  const programService = {
    getTaskCard(taskCardId) {
      return tasks.find((item) => item.taskCardId === taskCardId) || null;
    },
    getProgram(programId) {
      return { programId, learnerId: "learner-1", workspaceId: "learner-1", title: "Evergreen math" };
    },
    listTaskCards(filters = {}) {
      assert.equal(filters.programId, "program-1");
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
    recentLearningState() {
      return { sources: [{ sourceRef: "progress-1", summary: "summary only weak point" }] };
    },
    async prepareTaskForCard(input = {}) {
      jitInputs.push(input);
      return Object.assign({}, input.task, {
        learnerInstruction: "Generated evergreen instruction.",
        learningGrowthJitGeneration: { modelStatus: "completed", sequenceIndex: input.sequenceIndex },
        taskModel: Object.assign({}, input.task.taskModel, {
          learnerInstruction: "Generated evergreen instruction.",
          jitGeneration: { modelStatus: "completed", sequenceIndex: input.sequenceIndex },
        }),
      });
    },
  };
  const service = createLearningGrowthSequenceService({
    learningProgramService: programService,
    jitTaskService,
    nowIso: () => "2026-05-20T08:00:00.000Z",
    reportDirectoryForCard(workspaceId, taskCardId, card = {}) {
      return `C:\\LearningPlan\\${workspaceId}\\series\\${card.sequenceGroupId || card.programId}\\deliverables`;
    },
  });
  const result = await service.prepareNextAfterCompletion({
    taskCardId: "task-1",
    workspaceId: "learner-1",
    learnerId: "learner-1",
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "next_task_created");
  assert.equal(result.previousTaskCardId, "task-1");
  assert.equal(result.sequenceIndex, 2);
  assert.equal(result.nextCompletionAllowedAt, "2026-05-21T08:00:00.000Z");
  assert.equal(savedTasks.length, 2);
  assert.equal(savedTasks[0].taskCardId, "task-1");
  assert.equal(savedTasks[0].status, "completed");
  assert.equal(savedTasks[0].nextCompletionAllowedAt, "2026-05-21T08:00:00.000Z");
  assert.equal(savedTasks[1].sequenceIndex, 2);
  assert.equal(savedTasks[1].sequenceMode, "evergreen_jit");
  assert.equal(savedTasks[1].title, "Evergreen math");
  assert.equal(savedTasks[1].nextCompletionAllowedAt, "2026-05-21T08:00:00.000Z");
  assert.equal(savedTasks[1].deliverableDirectoryPath, "C:\\LearningPlan\\learner-1\\series\\program:program-1\\deliverables");
  assert.equal(jitInputs.length, 1);
  assert.equal(jitInputs[0].task.sequenceIndex, 2);
  assert.equal(JSON.stringify(result).includes("Generated evergreen"), false);
}

function testCompletionGateLocksUntilAllowedAt() {
  const gate = completionGateForTask(
    { taskCardId: "task-2", nextCompletionAllowedAt: "2026-05-21T08:00:00.000Z" },
    { nowIso: "2026-05-20T09:00:00.000Z" },
  );
  assert.equal(gate.ok, false);
  assert.equal(gate.status, "completion_window_locked");
  assert.equal(gate.nextCompletionAllowedAt, "2026-05-21T08:00:00.000Z");
  assert.equal(completionGateForTask(
    { taskCardId: "task-2", nextCompletionAllowedAt: "2026-05-21T08:00:00.000Z" },
    { nowIso: "2026-05-21T08:00:01.000Z" },
  ).ok, true);
}

(async () => {
  testFindNextSequenceTaskSkipsCompletedCards();
  testFindNextSequenceTaskIgnoresDuplicateCurrentTask();
  await testPrepareNextAfterCompletionRegeneratesOnlyNextTask();
  await testPrepareNextAfterCompletionCreatesEvergreenTaskWhenSequenceEnds();
  testCompletionGateLocksUntilAllowedAt();
  console.log("learning growth sequence service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
