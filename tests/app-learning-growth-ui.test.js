"use strict";

const assert = require("node:assert/strict");
const CoinsUi = require("../public/app-learning-coins-ui");
const GrowthUi = require("../public/app-learning-growth-ui");
const ProgramUi = require("../public/app-learning-program-ui");

const overview = {
  module: { title: "凡凡成长系统", currentEntry: "金币标签" },
  learner: { id: "weixin_stephen", displayName: "凡凡" },
  metrics: { sevenDayCoins: 70, pendingRedemptions: 1 },
  capabilities: [
    { id: "coin-incentive", title: "金币激励", status: "active", description: "收敛为子模块" },
    { id: "ai-reliability-guard", title: "AI 可靠性护栏", status: "guardrail", description: "来源、校验、审核" },
    { id: "parent-review", title: "家长审核与结算", status: "planned", description: "管理信息" },
  ],
  platformCapabilities: [
    { id: "kanban", title: "看板任务" },
    { id: "chat", title: "聊天与主题" },
    { id: "push", title: "Web Push 提醒" },
  ],
  coins: {
    studentId: "weixin_stephen",
    balances: { availableCoins: 70, heldCoins: 0, earnedCoins: 70, spentCoins: 0 },
    settlement: { currency: "CNY" },
    growth: {
      totalEarnedCoins: 70,
      sevenDayCoins: 70,
      activeDaysInLast7: 2,
      streakDays: 2,
      level: { current: { level: 1, title: "新手" }, progressPct: 35, toNextLevelCoins: 130 },
      recentDays: [{ date: "2026-05-16", coins: 70 }],
      rewardProgress: [],
    },
    rewards: [],
    redemptions: [],
    ledger: [],
  },
  programs: {
    programs: [{ programId: "program-1", title: "English growth", status: "active", domain: "english", focusAreas: ["english_speaking_retell"], minutesPerDay: 30, daysPerWeek: 5 }],
    latestDrafts: [],
    reviewItems: [{ reviewId: "review-1", status: "pending", summary: "review" }],
    parentReviewRequests: [{ reviewRequestId: "parent-review-1", status: "pending", summary: "parent review" }],
    rewardSettlements: [{ rewardSettlementId: "settle-1", status: "pending_review", coinAmount: 10 }],
    taskCards: [{ taskCardId: "task-1", title: "Task status", status: "published", plannedDate: "2026-05-17", skillIds: ["english_speaking_retell"] }],
    interactionSessions: [{ sessionId: "session-1", taskCardId: "task-1", status: "active", currentStep: "learner_attempt" }],
    dailyPlan: {
      summary: { totalTasks: 1, pendingTasks: 1, totalMinutes: 30, activeDays: 1 },
      nextTask: { taskCardId: "task-1", title: "Task status" },
      days: [{ date: "2026-05-17", pendingCount: 1, totalMinutes: 30, tasks: [{ taskCardId: "task-1" }] }],
    },
    evaluations: [{ evaluationId: "eval-1", status: "passed", score: 90, passed: true, summary: "summary only" }],
    skillStates: [{ skillId: "english_speaking_retell", level: "baseline", confidence: 0.7 }],
  },
  nextModules: [{ id: "learning-profile", title: "学习档案与目标录入", status: "next" }],
};

function testCoinSubsystemRendererIsStandalone() {
  const html = CoinsUi.renderCoinsSubsystem({ summary: overview.coins, learnerId: "weixin_stephen", state: { auth: { isOwner: true } } });
  assert.match(html, /data-learning-growth-module="coins"/);
  assert.match(html, /金币与奖励/);
  assert.match(html, /成长系统子模块/);
  assert.match(html, /70 金币/);
  assert.match(html, /learningRewardForm/);
}

function testExecutorCoinSubsystemHidesOwnerSettlementDetails() {
  const html = CoinsUi.renderCoinsSubsystem({ summary: overview.coins, learnerId: "weixin_stephen", state: { auth: { isOwner: false } } });
  assert.match(html, /金币与奖励/);
  assert.match(html, /学习奖励/);
  assert.doesNotMatch(html, /learningRewardForm/);
  assert.doesNotMatch(html, /CNY|人民币|Owner/);
}

function testGrowthRendererContainsProductShellAndNestedCoins() {
  const html = GrowthUi.renderLearningGrowthView({ overview, coinsUi: CoinsUi, programUi: ProgramUi, state: { auth: { isOwner: false } } });
  assert.match(html, /data-learning-product="fanfan-growth"/);
  assert.match(html, /data-learning-role="executor"/);
  assert.match(html, /凡凡成长系统/);
  assert.match(html, /金币情况、待执行任务状态、分析与指导/);
  assert.match(html, /data-learning-growth-category="execution"/);
  assert.match(html, /data-learning-growth-category="guidance"/);
  assert.match(html, /data-learning-growth-module="coins"/);
  assert.doesNotMatch(html, /data-learning-growth-category="parent-admin"/);
  assert.doesNotMatch(html, /data-learning-growth-category="owner-system"/);
  assert.doesNotMatch(html, /data-learning-growth-capability="parent-review"/);
  assert.doesNotMatch(html, /data-learning-review-decision/);
  assert.doesNotMatch(html, /Owner|家长|结算|后台与平台能力|learningRewardForm|人民币/);
  assert.doesNotMatch(html, /学习档案与目标录入/);
}

function testGrowthRendererContainsProgramSubsystem() {
  const html = GrowthUi.renderLearningGrowthView({ overview, coinsUi: CoinsUi, programUi: ProgramUi, state: { auth: { isOwner: false } } });
  assert.match(html, /data-learning-growth-module="programs"/);
  assert.match(html, /data-learning-program-id="program-1"/);
  assert.match(html, /data-learning-task-card-id="task-1"/);
  assert.match(html, /data-learning-daily-plan/);
  assert.match(html, /data-learning-session-advance="session-1"/);
  assert.match(html, /data-learning-evaluation-form="session-1"/);
  assert.match(html, /data-learning-evaluation-summary="eval-1"/);
}

function testOwnerRendererKeepsManagementSections() {
  const html = GrowthUi.renderLearningGrowthView({ overview, coinsUi: CoinsUi, programUi: ProgramUi, state: { auth: { isOwner: true } } });
  assert.match(html, /data-learning-role="owner"/);
  assert.match(html, /data-learning-growth-category="parent-admin"/);
  assert.match(html, /data-learning-growth-category="owner-system"/);
  assert.match(html, /data-learning-growth-capability="parent-review"/);
  assert.match(html, /data-learning-review-decision="review-1"/);
  assert.match(html, /data-learning-parent-review-decision="parent-review-1"/);
  assert.match(html, /data-learning-reward-settlement-id="settle-1"/);
}

testCoinSubsystemRendererIsStandalone();
testExecutorCoinSubsystemHidesOwnerSettlementDetails();
testGrowthRendererContainsProductShellAndNestedCoins();
testGrowthRendererContainsProgramSubsystem();
testOwnerRendererKeepsManagementSections();

console.log("app learning growth ui tests passed");
