"use strict";

const assert = require("node:assert/strict");
const CoinsUi = require("../public/app-learning-coins-ui");
const GrowthUi = require("../public/app-learning-growth-ui");
const ProgramUi = require("../public/app-learning-program-ui");

const overview = {
  module: { title: "凡凡成长系统", currentEntry: "金币标签" },
  learner: { id: "weixin_stephen", displayName: "凡凡" },
  metrics: { sevenDayCoins: 70, pendingRedemptions: 1 },
  board: {
    learner: { id: "weixin_stephen", workspaceId: "weixin_stephen", displayName: "Fanfan" },
    summary: { cardCount: 2 },
    lanes: [
      { id: "today", title: "Today", count: 1, cards: ["task-1"] },
      { id: "waiting_ai", title: "Waiting for AI", count: 1, cards: ["task-2"] },
    ],
    cards: [
      { taskCardId: "task-1", title: "Native board task", activityType: "short_writing", plannedDate: "2026-05-20", primaryAction: "submit", nextAction: "submit", artifactCount: 0 },
      { taskCardId: "task-2", title: "Waiting task", activityType: "reading", primaryAction: "wait", nextAction: "waiting_feedback", artifactCount: 1 },
    ],
  },
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
  operationalReadiness: {
    version: "learning-growth-v1",
    status: "operational_ready",
    operationalTestReady: true,
    systemReadinessPercent: 100,
    learnerDataReadinessPercent: 100,
    checks: {
      system: [
        { id: "sqlite-learning-domain", label: "SQLite learning domain services", ready: true },
      ],
      learnerData: [
        { id: "daily-plan-data", label: "Daily plan has executable tasks", ready: true },
      ],
    },
    nextActions: [],
  },
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
    ledger: [{ id: "ledger-1", reason: "task reward", sourceType: "learning-growth-evaluation", sourceId: "eval-internal-1", createdAt: "2026-05-17T00:00:00.000Z", coinDelta: 10 }],
  },
  programs: {
    launchOperations: {
      version: "learning-growth-launch-ops-v1",
      status: "attention_required",
      counts: { publishedTasks: 1, activeSessions: 1, pendingPlanReviews: 1, pendingParentReviews: 1, pendingRewardSettlements: 1, rewardCandidates: 1 },
      queues: {
        blockers: [],
        approvals: [{ resourceType: "plan_review", resourceId: "review-1", title: "review-1", reasonCode: "pending_parent_review" }],
        execution: [{ resourceType: "task_card", resourceId: "task-1", title: "Task status", reasonCode: "task_ready_for_executor" }],
        rewards: [{ resourceType: "evaluation", resourceId: "eval-1", title: "eval-1", reasonCode: "passed_evaluation_needs_reward_settlement" }],
      },
      nextActions: [{ id: "settle-learning-rewards", reasonCode: "pending_reward_settlement" }],
    },
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
  assert.doesNotMatch(html, /eval-internal-1|learning-growth-evaluation|weixin_stephen/);
}

function testGrowthRendererContainsProductShellAndNestedCoins() {
  const html = GrowthUi.renderLearningGrowthView({ overview, coinsUi: CoinsUi, programUi: ProgramUi, state: { auth: { isOwner: false } } });
  assert.match(html, /data-learning-product="fanfan-growth"/);
  assert.match(html, /data-learning-role="executor"/);
  assert.match(html, /data-learning-growth-tabs/);
  assert.match(html, /data-learning-growth-board/);
  assert.match(html, /data-growth-board-lane="today"/);
  assert.match(html, /data-growth-board-lane="waiting_ai"/);
  assert.match(html, /Native board task/);
  assert.match(html, /data-learning-open-growth-task="task-1"/);
  assert.match(html, /data-learning-growth-tab="execution"/);
  assert.match(html, /data-learning-growth-tab="guidance"/);
  assert.match(html, /data-learning-growth-tab="coins"/);
  assert.doesNotMatch(html, /data-learning-growth-tab="config"/);
  assert.doesNotMatch(html, /data-learning-growth-tab="review"/);
  assert.doesNotMatch(html, /data-learning-growth-tab="system"/);
  assert.match(html, /凡凡成长系统/);
  assert.match(html, /查看待执行任务、AI 批改、修订要求、录音复盘和金币奖励状态/);
  assert.match(html, /class="learning-growth-metric-card"/);
  assert.match(html, /aria-label="成长概览"/);
  assert.match(html, /data-learning-growth-flow-step="attempt"/);
  assert.match(html, /data-learning-growth-flow-step="feedback"/);
  assert.match(html, /data-learning-growth-flow-step="revision"/);
  assert.match(html, /data-learning-growth-flow-step="reflection"/);
  assert.match(html, /data-learning-growth-flow-step="settlement"/);
  assert.match(html, /80 分通过线/);
  assert.match(html, /data-learning-growth-category="execution"/);
  assert.match(html, /data-learning-growth-category="guidance"/);
  assert.match(html, /data-learning-growth-module="coins"/);
  assert.doesNotMatch(html, /data-learning-growth-category="parent-admin"/);
  assert.doesNotMatch(html, /data-learning-growth-category="owner-system"/);
  assert.doesNotMatch(html, /data-learning-operational-readiness/);
  assert.doesNotMatch(html, /data-learning-launch-operations/);
  assert.doesNotMatch(html, /data-learning-growth-capability="parent-review"/);
  assert.doesNotMatch(html, /data-learning-review-decision/);
  assert.doesNotMatch(html, /data-learning-evaluation-settle/);
  assert.doesNotMatch(html, /Owner|家长|后台与平台能力|learningRewardForm|人民币/);
  assert.doesNotMatch(html, /学习档案与目标录入/);
}

function testGrowthRendererContainsProgramSubsystem() {
  const html = GrowthUi.renderLearningGrowthView({ overview, coinsUi: CoinsUi, programUi: ProgramUi, state: { auth: { isOwner: false } } });
  assert.match(html, /data-learning-growth-module="programs"/);
  assert.match(html, /data-learning-program-id="program-1"/);
  assert.match(html, /data-learning-task-card-id="task-1"/);
  assert.match(html, /data-learning-daily-plan/);
  assert.match(html, /data-learning-session-advance="session-1"/);
  assert.doesNotMatch(html, /data-learning-evaluation-form="session-1"/);
  assert.match(html, /data-learning-evaluation-summary="eval-1"/);
}

function testOwnerRendererKeepsManagementSections() {
  const html = GrowthUi.renderLearningGrowthView({ overview, coinsUi: CoinsUi, programUi: ProgramUi, state: { auth: { isOwner: true } } });
  assert.match(html, /data-learning-role="owner"/);
  assert.match(html, /data-learning-growth-tabs/);
  assert.match(html, /data-learning-growth-tab="execution"/);
  assert.match(html, /data-learning-growth-tab="config"/);
  assert.match(html, /data-learning-growth-tab="review"/);
  assert.match(html, /data-learning-growth-tab="rewards"/);
  assert.match(html, /data-learning-growth-tab="system"/);
  assert.match(html, /data-learning-growth-category="parent-admin"/);
  assert.match(html, /data-learning-growth-category="owner-system"/);
  assert.match(html, /按执行、审核、奖励和系统分区查看/);
  assert.match(html, /data-learning-growth-flow-step="reflection"/);
  assert.match(html, /data-learning-operational-readiness/);
  assert.match(html, /Learning V1 readiness/);
  assert.match(html, /Operational ready/);
  assert.match(html, /data-learning-growth-capability="parent-review"/);
  assert.match(html, /data-learning-review-decision="review-1"/);
  assert.match(html, /data-learning-parent-review-decision="parent-review-1"/);
  assert.match(html, /data-learning-reward-settlement-id="settle-1"/);
  assert.match(html, /data-learning-launch-operations/);
  assert.match(html, /data-learning-launch-next-action="settle-learning-rewards"/);
  assert.match(html, /data-learning-evaluation-settle="eval-1"/);
}

function testReadinessPanelRenderer() {
  const html = GrowthUi.renderReadinessPanel(overview.operationalReadiness);
  assert.match(html, /data-learning-operational-readiness/);
  assert.match(html, /data-learning-readiness-check="sqlite-learning-domain"/);
  assert.match(html, /100%/);
}

testCoinSubsystemRendererIsStandalone();
testExecutorCoinSubsystemHidesOwnerSettlementDetails();
testGrowthRendererContainsProductShellAndNestedCoins();
testGrowthRendererContainsProgramSubsystem();
testOwnerRendererKeepsManagementSections();
testReadinessPanelRenderer();

console.log("app learning growth ui tests passed");
