"use strict";

const assert = require("node:assert/strict");
const {
  buildLearnerDataChecks,
  buildSystemChecks,
  createLearningV1ReadinessService,
  taskModelStats,
} = require("../adapters/learning-v1-readiness-service");

function readyProgramsFixture() {
  return {
    counts: { programs: 1, taskCards: 1, evaluations: 1, skillStates: 1 },
    sources: [{ sourceId: "source-1" }],
    goals: [{ goalId: "goal-1" }],
    learnerProfile: { learnerId: "weixin_stephen", profileSummary: "summary only" },
    curriculumReferences: [{ referenceId: "cefr-a2-b1" }],
    programs: [{ programId: "program-1" }],
    latestDrafts: [{ draftId: "draft-1" }],
    taskCards: [{ taskCardId: "task-1", status: "published", taskModel: { skillId: "english_short_writing" } }],
    dailyPlan: {
      summary: { totalTasks: 1, pendingTasks: 1 },
      nextTask: { taskCardId: "task-1" },
      privacyLevel: "summary_only",
    },
    interactionSessions: [{ sessionId: "session-1", status: "completed" }],
    evaluations: [{ evaluationId: "eval-1", score: 88, summary: "summary only" }],
    reviewItems: [],
    parentReviewRequests: [],
    rewardSettlements: [{ rewardSettlementId: "settlement-1", status: "settled" }],
  };
}

function readyCoinsFixture() {
  return {
    balances: { earnedCoins: 15, availableCoins: 15 },
    ledger: [{ entryId: "coin-1", amount: 15 }],
  };
}

function testSystemReadinessChecksPassForCompleteProjection() {
  const checks = buildSystemChecks(readyProgramsFixture(), readyCoinsFixture());
  assert.equal(checks.every((item) => item.ready), true);
}

function testLearnerDataChecksPassForCompleteOperationalLoop() {
  const checks = buildLearnerDataChecks(readyProgramsFixture(), readyCoinsFixture());
  assert.equal(checks.every((item) => item.ready), true);
  assert.ok(checks.some((item) => item.id === "task-model-data"));
  assert.deepEqual(taskModelStats(readyProgramsFixture()), { total: 1, withModel: 1 });
}

function testLearnerDataCheckFindsTasksWithoutModels() {
  const programs = readyProgramsFixture();
  programs.taskCards = [{ taskCardId: "task-1", status: "published" }];
  const checks = buildLearnerDataChecks(programs, readyCoinsFixture());
  const modelCheck = checks.find((item) => item.id === "task-model-data");
  assert.equal(modelCheck.ready, false);
  assert.deepEqual(modelCheck.details, { taskCount: 1, withTaskModel: 0 });
}

function testReadinessBlocksPrivatePayloadProjection() {
  const programs = readyProgramsFixture();
  programs.taskCards = [{ taskCardId: "task-1", questionText: "must not be exposed" }];
  const result = createLearningV1ReadinessService().evaluate({
    programs,
    coins: readyCoinsFixture(),
  });
  assert.equal(result.systemReady, false);
  assert.equal(result.operationalTestReady, false);
  assert.equal(result.status, "blocked");
  assert.ok(result.nextActions.some((item) => item.checkId === "privacy-minimal-projection"));
}

function testReadinessReportsFullOperationalReadyState() {
  const result = createLearningV1ReadinessService().evaluate({
    programs: readyProgramsFixture(),
    coins: readyCoinsFixture(),
  });
  assert.equal(result.status, "operational_ready");
  assert.equal(result.systemReady, true);
  assert.equal(result.learnerDataReady, true);
  assert.equal(result.operationalTestReady, true);
  assert.equal(result.systemReadinessPercent, 100);
  assert.equal(result.learnerDataReadinessPercent, 100);
  assert.deepEqual(result.nextActions, []);
}

testSystemReadinessChecksPassForCompleteProjection();
testLearnerDataChecksPassForCompleteOperationalLoop();
testLearnerDataCheckFindsTasksWithoutModels();
testReadinessBlocksPrivatePayloadProjection();
testReadinessReportsFullOperationalReadyState();

console.log("learning v1 readiness service tests passed");
