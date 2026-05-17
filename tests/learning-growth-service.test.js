"use strict";

const assert = require("node:assert/strict");
const {
  buildLearningGrowthOverview,
  createLearningGrowthService,
  normalizeLearningGrowthRequest,
} = require("../adapters/learning-growth-service");

function makeCoinService() {
  const calls = [];
  return {
    calls,
    summary(input) {
      calls.push(input);
      return {
        studentId: input.studentId,
        workspaceId: input.workspaceId,
        balances: { availableCoins: 70, heldCoins: 10, earnedCoins: 90, spentCoins: 20 },
        growth: { sevenDayCoins: 45, activeDaysInLast7: 3 },
        redemptions: [
          { id: "r1", status: "requested" },
          { id: "r2", status: "approved" },
        ],
        settlement: { currency: "CNY" },
        rewards: [],
        ledger: [],
      };
    },
  };
}

function makeProgramService() {
  return {
    overview() {
      return {
        counts: { programs: 1, taskCards: 1, evaluations: 1, skillStates: 1 },
        programs: [{
          programId: "program-1",
          title: "English growth",
          status: "active",
          domain: "english",
          focusAreas: ["english_speaking_retell"],
          minutesPerDay: 30,
          daysPerWeek: 5,
          goalSummary: "owner goal",
          sourceBasisRefs: ["source-1"],
          curriculumRefs: ["cefr-a2-b1"],
        }],
        latestDrafts: [{ draftId: "draft-1", programId: "program-1" }],
        reviewItems: [{ reviewId: "review-1", summary: "owner review" }],
        sources: [{ sourceId: "source-1", title: "School summary" }],
        goals: [{ goalId: "goal-1", title: "Parent goal" }],
        taskCards: [{
          taskCardId: "task-1",
          title: "Task",
          status: "published",
          skillIds: ["english_speaking_retell"],
        }],
        dailyPlan: {
          summary: { totalTasks: 1, pendingTasks: 1 },
          nextTask: { taskCardId: "task-1", title: "Task" },
          privacyLevel: "summary_only",
        },
        interactionSessions: [{ sessionId: "session-1", taskCardId: "task-1", status: "active", currentStep: "learner_attempt" }],
        evaluations: [{ evaluationId: "eval-1", score: 90, passed: true, summary: "summary" }],
        parentReviewRequests: [{ reviewRequestId: "parent-review-1", summary: "owner parent review" }],
        rewardSettlements: [{ rewardSettlementId: "settle-1", coinAmount: 20 }],
        learnerProfile: { learnerId: "weixin_stephen", profileSummary: "summary" },
        skillStates: [{ skillId: "english_speaking_retell", confidence: 0.7 }],
        curriculumReferences: [{ referenceId: "cefr-a2-b1", title: "CEFR" }],
        parentReport: { reportType: "parent_weekly_summary" },
        taxonomy: { domains: ["english"] },
        templates: [{ id: "english-template" }],
      };
    },
  };
}

function testRequestNormalizationKeepsExecutorAccountId() {
  assert.deepEqual(normalizeLearningGrowthRequest({
    workspaceId: "weixin_stephen",
    studentId: "weixin_stephen",
    limit: 999,
  }), {
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    studentId: "weixin_stephen",
    learnerName: "凡凡",
    limit: 200,
  });
}

function testOverviewContainsGrowthShellAndCoinsSubsystem() {
  const coinService = makeCoinService();
  const service = createLearningGrowthService({
    learningCoinService: coinService,
    learningProgramService: makeProgramService(),
  });
  const overview = service.overview({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen", limit: 5 });

  assert.equal(overview.module.id, "fanfan-growth");
  assert.equal(overview.module.hostView, "learning");
  assert.equal(overview.module.currentEntry, "成长标签");
  assert.equal(overview.module.standaloneReady, true);
  assert.equal(overview.learner.id, "weixin_stephen");
  assert.equal(overview.learner.studentId, "weixin_stephen");
  assert.equal(overview.coins.studentId, "weixin_stephen");
  assert.equal(overview.metrics.availableCoins, 70);
  assert.equal(overview.metrics.pendingRedemptions, 1);
  assert.ok(overview.capabilities.some((item) => item.id === "curriculum-reference"));
  assert.ok(overview.capabilities.some((item) => item.id === "ai-reliability-guard"));
  assert.ok(overview.capabilities.some((item) => item.id === "coin-incentive"));
  assert.ok(overview.platformCapabilities.some((item) => item.id === "kanban"));
  assert.equal(overview.reliability.guardLevel, "ai-draft-system-verify-parent-audit");
  assert.ok(overview.reliability.gates.includes("parent_review"));
  assert.ok(overview.reliability.reviewTriggers.includes("missing_source_basis"));
  assert.equal(overview.operationalReadiness.version, "learning-growth-v1");
  assert.equal(overview.operationalReadiness.systemReadinessPercent, 100);
  assert.equal(overview.operationalReadiness.learnerDataReadinessPercent, 100);
  assert.equal(overview.operationalReadiness.operationalTestReady, true);
  assert.equal(overview.launchOperations.version, "learning-growth-launch-ops-v1");
  assert.equal(overview.launchOperations.counts.pendingRedemptions, 1);
  assert.equal(overview.programs.launchOperations.version, "learning-growth-launch-ops-v1");
  assert.ok(overview.nextModules.some((item) => item.id === "ai-reliability-guard-service"));
  assert.deepEqual(coinService.calls[0], { workspaceId: "weixin_stephen", studentId: "weixin_stephen", limit: 5 });
}

function testExecutorOverviewStripsOwnerManagementData() {
  const service = createLearningGrowthService({
    learningCoinService: makeCoinService(),
    learningProgramService: makeProgramService(),
  });
  const overview = service.overview({
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    owner: false,
    viewerRole: "executor",
  });

  assert.equal(overview.viewerRole, "executor");
  assert.equal(overview.capabilities, undefined);
  assert.equal(overview.platformCapabilities, undefined);
  assert.equal(overview.reliability, undefined);
  assert.equal(overview.operationalReadiness, undefined);
  assert.equal(overview.launchOperations, undefined);
  assert.equal(overview.nextModules, undefined);
  assert.equal(overview.coins.settlement, undefined);
  assert.equal(overview.programs.sources, undefined);
  assert.equal(overview.programs.goals, undefined);
  assert.equal(overview.programs.latestDrafts, undefined);
  assert.equal(overview.programs.reviewItems, undefined);
  assert.equal(overview.programs.parentReviewRequests, undefined);
  assert.equal(overview.programs.rewardSettlements, undefined);
  assert.equal(overview.programs.launchOperations, undefined);
  assert.equal(overview.programs.curriculumReferences, undefined);
  assert.equal(overview.programs.parentReport, undefined);
  assert.equal(overview.programs.taxonomy, undefined);
  assert.equal(overview.programs.templates, undefined);
  assert.deepEqual(overview.programs.programs[0], {
    programId: "program-1",
    title: "English growth",
    status: "active",
    domain: "english",
    focusAreas: ["english_speaking_retell"],
    minutesPerDay: 30,
    daysPerWeek: 5,
  });
  assert.equal(overview.programs.dailyPlan.summary.totalTasks, 1);
  assert.equal(overview.programs.interactionSessions[0].status, "active");
  assert.equal(overview.programs.interactionSessions[0].currentStep, "learner_attempt");
  assert.equal(overview.programs.taskCards[0].answerKey, undefined);
  assert.equal(overview.programs.interactionSessions[0].rawTranscript, undefined);
  assert.equal(overview.programs.evaluations[0].answerKey, undefined);
  assert.equal(overview.programs.learnerProfile.rawNotes, undefined);
}

function testOverviewCanRenderWithoutCoinService() {
  const overview = buildLearningGrowthOverview({ workspaceId: "child", learnerName: "Learner" });
  assert.equal(overview.learner.id, "child");
  assert.equal(overview.learner.displayName, "Learner");
  assert.equal(overview.coins, null);
  assert.equal(overview.metrics.availableCoins, 0);
}

testRequestNormalizationKeepsExecutorAccountId();
testOverviewContainsGrowthShellAndCoinsSubsystem();
testExecutorOverviewStripsOwnerManagementData();
testOverviewCanRenderWithoutCoinService();

console.log("learning growth service tests passed");
