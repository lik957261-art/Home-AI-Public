"use strict";

const assert = require("node:assert/strict");
const CoinsUi = require("../public/app-learning-coins-ui");
const GrowthUi = require("../public/app-learning-growth-ui");

const overview = {
  module: { title: "凡凡成长系统", currentEntry: "金币标签" },
  learner: { id: "weixin_stephen", displayName: "凡凡" },
  metrics: { sevenDayCoins: 70, pendingRedemptions: 1 },
  capabilities: [
    { id: "coin-incentive", title: "金币激励", status: "active", description: "收敛为子模块" },
    { id: "ai-reliability-guard", title: "AI 可靠性护栏", status: "guardrail", description: "来源、校验、审核" },
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
  nextModules: [{ id: "learning-profile", title: "学习档案与目标录入", status: "next" }],
};

function testCoinSubsystemRendererIsStandalone() {
  const html = CoinsUi.renderCoinsSubsystem({ summary: overview.coins, learnerId: "weixin_stephen", state: { auth: { isOwner: true } } });
  assert.match(html, /data-learning-growth-module="coins"/);
  assert.match(html, /金币激励/);
  assert.match(html, /成长系统子模块/);
  assert.match(html, /70 金币/);
  assert.match(html, /learningRewardForm/);
}

function testGrowthRendererContainsProductShellAndNestedCoins() {
  const html = GrowthUi.renderLearningGrowthView({ overview, coinsUi: CoinsUi, state: { auth: { isOwner: false } } });
  assert.match(html, /data-learning-product="fanfan-growth"/);
  assert.match(html, /凡凡成长系统/);
  assert.match(html, /当前复用 Hermes Mobile 平台能力/);
  assert.match(html, /data-learning-growth-capability="coin-incentive"/);
  assert.match(html, /data-learning-growth-capability="ai-reliability-guard"/);
  assert.match(html, /护栏/);
  assert.match(html, /data-learning-growth-module="coins"/);
  assert.match(html, /学习档案与目标录入/);
}

testCoinSubsystemRendererIsStandalone();
testGrowthRendererContainsProductShellAndNestedCoins();

console.log("app learning growth ui tests passed");
