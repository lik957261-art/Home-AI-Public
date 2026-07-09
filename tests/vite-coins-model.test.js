"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadModel() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/navigation-shell/learning-coins-model.mjs",
  )).href;
  return import(`${url}?test=${Date.now()}-${Math.random()}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

(async () => {
  await test("coins model stays pure and browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/learning-coins-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
  });

  await test("coins model formats coins and reward cards", async () => {
    const model = await loadModel();
    assert.equal(model.formatCoinsPlan(12), "12 金币");
    assert.equal(model.formatRmbCentsPlan(1234), "￥12.34");
    const plan = model.rewardCardsViewPlan({
      balances: { availableCoins: 80 },
      rewards: [{ id: "book", title: "Book", description: "Read", coinCost: 50, rmbCents: 2500 }],
    }, { owner: true });
    assert.equal(plan.empty, false);
    assert.deepEqual(plan.cards[0], {
      id: "book",
      title: "Book",
      description: "Read",
      coinText: "50 金币",
      rmbText: "￥25.00",
      showRmb: true,
      affordable: true,
      buttonText: "申请兑换",
    });
  });

  await test("coins model plans growth and progress rows", async () => {
    const model = await loadModel();
    const summary = {
      balances: { availableCoins: 20, heldCoins: 3, earnedCoins: 100, spentCoins: 10 },
      growth: {
        totalEarnedCoins: 100,
        streakDays: 2,
        level: { current: { level: 2, title: "Explorer" }, next: { level: 3, title: "Reader" }, toNextLevelCoins: 40, progressPct: 60 },
        bestRewardProgress: { id: "book", title: "Book", coinCost: 50, remainingCoins: 30, progressPct: 40, affordable: false },
        rewardProgress: [{ id: "book" }, { id: "park", title: "Park", coinCost: 20, progressPct: 100, affordable: true }],
      },
    };
    assert.deepEqual(model.growthPanelViewPlan(summary), {
      levelTitle: "Lv.2 Explorer",
      totalEarnedText: "100 金币",
      availableText: "20 金币",
      streakText: "2 天",
      nextText: "距离 Lv.3 Reader 还差 40 金币",
      progress: 60,
    });
    const progress = model.rewardProgressViewPlan(summary.growth, { owner: false });
    assert.equal(progress.rewards.length, 2);
    assert.equal(progress.rewards[0].status, "还差 30 金币");
    assert.equal(progress.rewards[1].status, "可兑换");
  });

  await test("coins subsystem model returns owner and learner labels", async () => {
    const model = await loadModel();
    const ownerPlan = model.coinsSubsystemViewPlan({
      summary: { studentId: "learner-a", balances: { availableCoins: 9 }, settlement: { currency: "USD" } },
      options: { state: { auth: { isOwner: true } } },
    });
    assert.equal(ownerPlan.owner, true);
    assert.equal(ownerPlan.learnerLabel, "learner-a");
    assert.equal(ownerPlan.rewardScopeText, "USD");
    const learnerPlan = model.coinsSubsystemViewPlan({
      summary: { displayName: "FanFan", balances: { availableCoins: 9 } },
      options: { state: { auth: { isOwner: false } } },
    });
    assert.equal(learnerPlan.owner, false);
    assert.equal(learnerPlan.learnerLabel, "FanFan");
    assert.equal(learnerPlan.spentLabel, "已使用");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
