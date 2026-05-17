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
        rewards: [],
        ledger: [],
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
  const service = createLearningGrowthService({ learningCoinService: coinService });
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
  assert.ok(overview.nextModules.some((item) => item.id === "ai-reliability-guard-service"));
  assert.deepEqual(coinService.calls[0], { workspaceId: "weixin_stephen", studentId: "weixin_stephen", limit: 5 });
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
testOverviewCanRenderWithoutCoinService();

console.log("learning growth service tests passed");
