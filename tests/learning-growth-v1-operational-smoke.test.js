"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLearningGrowthService } = require("../adapters/learning-growth-service");
const { createLearningProgramRepository } = require("../adapters/learning-program-repository");
const { createLearningProgramService } = require("../adapters/learning-program-service");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "learning-growth-v1-smoke-"));
}

function createCoinService() {
  const ledger = [];
  return {
    ledger,
    grantCoins(input = {}) {
      const entry = {
        entryId: `coin-${ledger.length + 1}`,
        studentId: input.studentId,
        workspaceId: input.workspaceId,
        amount: Number(input.coinAmount || input.amount || 0),
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      };
      ledger.push(entry);
      return { ok: true, entry };
    },
    summary(input = {}) {
      const earnedCoins = ledger
        .filter((entry) => entry.studentId === input.studentId && entry.workspaceId === input.workspaceId)
        .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
      return {
        studentId: input.studentId,
        workspaceId: input.workspaceId,
        balances: {
          availableCoins: earnedCoins,
          earnedCoins,
          heldCoins: 0,
          spentCoins: 0,
        },
        growth: {
          sevenDayCoins: earnedCoins,
          activeDaysInLast7: earnedCoins > 0 ? 1 : 0,
        },
        ledger: ledger.slice(),
        rewards: [],
        redemptions: [],
      };
    },
  };
}

function assertSummaryOnly(value) {
  assert.doesNotMatch(
    JSON.stringify(value),
    /rawTranscript|fullTranscript|answerKey|questionText|learnerAnswer|childAnswer|rawPrompt|apiKey|pushEndpoint|authorization|cookie/i,
  );
}

async function testLearningGrowthV1OperationalLoop() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const coinService = createCoinService();
  const publishCalls = [];
  try {
    const programService = createLearningProgramService({
      repository,
      learningCoinService: coinService,
      publishService: {
        async publish(input) {
          publishCalls.push(input);
          const tasks = (input.draft?.dailyPlans || []).flatMap((day) => day.tasks || []);
          return {
            ok: true,
            kanbanResult: {
              ok: true,
              cards: tasks.map((task, index) => ({
                clientId: task.taskId,
                card: { id: `synthetic-kanban-card-${index + 1}` },
              })),
            },
          };
        },
      },
    });

    const source = programService.saveSource({
      workspaceId: "weixin_stephen",
      learnerId: "weixin_stephen",
      sourceType: "parent_config",
      title: "Synthetic learning source",
      summary: "Summary-only evidence for operational smoke.",
      confidence: 0.9,
      tags: ["operational-smoke"],
    });
    programService.saveGoal({
      workspaceId: "weixin_stephen",
      learnerId: "weixin_stephen",
      title: "English fast growth synthetic goal",
      domain: "english",
      focusAreas: ["reading", "listening", "speaking", "writing", "vocabulary", "grammar", "presentation"],
      targetSummary: "Summary-only V1 goal for English growth loop.",
      sourceBasisRefs: [source.sourceRef],
    });
    const program = programService.createProgram({
      workspaceId: "weixin_stephen",
      learnerId: "weixin_stephen",
      title: "Synthetic English V1 operational plan",
      domain: "english",
      goalSummary: "Build a balanced English loop across reading, listening, speaking, writing, vocabulary, grammar, and presentation.",
      requirements: "Summary-only operational smoke requirements.",
      focusAreas: ["reading", "listening", "speaking", "writing", "vocabulary", "grammar", "presentation"],
      sourceBasisRefs: [source.sourceRef],
      startDate: "2026-05-17",
      durationDays: 7,
      daysPerWeek: 5,
      minutesPerDay: 30,
    });

    const drafted = await programService.draftPlan(program.programId);
    assert.equal(drafted.ok, true);
    assert.equal(drafted.draft.status, "review_required");
    assert.ok(drafted.taskCards.length >= 5);
    assert.ok(drafted.taskCards.some((task) => task.skillIds.includes("english_short_writing")));
    assert.ok(drafted.taskCards.some((task) => task.skillIds.includes("english_speaking_retell") || task.skillIds.includes("english_pronunciation_accuracy")));
    const decision = await programService.decideReview(drafted.reviewItem.reviewId, {
      decision: "approved",
      principalId: "owner",
      note: "Synthetic smoke approval.",
    });
    assert.equal(decision.autoPublish.ok, true);

    const published = decision.autoPublish;
    assert.equal(published.ok, true);
    assert.equal(publishCalls.length, 1);
    assert.ok(published.taskCards.every((task) => task.status === "published"));
    assert.equal(published.publishedSessions.length, published.taskCards.length);

    const queue = programService.listExecutorTaskQueue({
      workspaceId: "weixin_stephen",
      learnerId: "weixin_stephen",
      limit: 20,
    });
    assert.equal(queue.length, drafted.taskCards.length);
    assertSummaryOnly(queue);

    const dailyPlan = programService.dailyPlan({
      workspaceId: "weixin_stephen",
      learnerId: "weixin_stephen",
      startDate: "2026-05-17",
      days: 7,
      limit: 50,
    });
    assert.equal(dailyPlan.privacyLevel, "summary_only");
    assert.ok(dailyPlan.summary.totalTasks >= queue.length);
    assertSummaryOnly(dailyPlan);

    const task = queue[0];
    const session = programService.startTaskSession(task.taskCardId, {
      actor: "executor",
      summary: "Executor started the synthetic task.",
    });
    const advanced = programService.advanceInteractionSession(session.sessionId, {
      actor: "executor",
      summary: "Executor advanced one guided step.",
    });
    assert.equal(advanced.sessionId, session.sessionId);

    const evaluation = programService.recordEvaluation(session.sessionId, {
      score: 88,
      passed: true,
      confidence: 0.9,
      verificationMethod: "model_assisted_growth_task_evaluation",
      evidenceRefs: ["learning-growth-task-model-evaluation:v1", "operational-smoke:rubric"],
      sourceBasisRefs: task.sourceBasisRefs,
      summary: "Summary-only verified synthetic evaluation.",
    });
    assert.equal(evaluation.verification.status, "verified");
    assert.equal(evaluation.rewardPolicy.eligibleForRewardReview, true);
    assertSummaryOnly(evaluation);

    const settlement = programService.settleEvaluationReward(evaluation.evaluationId, {
      principalId: "owner",
      reason: "Synthetic V1 smoke reward.",
    });
    assert.equal(settlement.status, "settled");
    assert.equal(coinService.ledger.length, 1);
    assert.equal(coinService.ledger[0].studentId, "weixin_stephen");

    const report = programService.generateParentReport({
      workspaceId: "weixin_stephen",
      learnerId: "weixin_stephen",
      fromDate: "2026-05-17",
      toDate: "2026-05-24",
    });
    assert.equal(report.privacyLevel, "summary_only");
    assertSummaryOnly(report);

    const growth = createLearningGrowthService({
      learningProgramService: programService,
      learningCoinService: coinService,
    }).overview({
      workspaceId: "weixin_stephen",
      learnerId: "weixin_stephen",
      viewerRole: "owner",
      limit: 50,
    });
    assert.equal(growth.operationalReadiness.systemReadinessPercent, 100);
    assert.equal(growth.operationalReadiness.learnerDataReadinessPercent, 100);
    assert.equal(growth.operationalReadiness.operationalTestReady, true);
    assert.equal(growth.operationalReadiness.status, "operational_ready");
    assertSummaryOnly(growth);
  } finally {
    repository.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

testLearningGrowthV1OperationalLoop().then(() => {
  console.log("learning growth v1 operational smoke passed");
}).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
