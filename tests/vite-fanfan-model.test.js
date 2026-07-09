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
    "src/vite-islands/navigation-shell/learning-growth-model.mjs",
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
  await test("learning growth model stays pure and browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/learning-growth-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
  });

  await test("learning growth model plans board lanes and card labels", async () => {
    const model = await loadModel();
    const board = {
      cards: [
        {
          taskCardId: "task_a",
          title: "Retell",
          nextAction: "revise",
          rewardPolicy: { maxCoins: 80 },
          latestEvaluation: { score: 76 },
          openedAt: "2026-07-05T08:30:00.000Z",
        },
      ],
      lanes: [{ id: "needs_revision", cards: ["task_a"], count: 1 }],
    };
    const plan = model.learningGrowthBoardViewPlan(board, { workspaceId: "learner" });
    assert.equal(plan.empty, false);
    assert.equal(plan.activeLaneId, "needs_revision");
    assert.equal(plan.lanes[0].title, "待修订");
    assert.equal(plan.lanes[0].cardPlans[0].statusText, "需要修订");
    assert.equal(plan.lanes[0].cardPlans[0].rewardText, "奖励 80 金币");
    assert.equal(plan.lanes[0].cardPlans[0].scoreText, "76 分");
  });

  await test("learning growth model plans owner summaries and task series", async () => {
    const model = await loadModel();
    const overview = {
      learner: { displayName: "FanFan" },
      metrics: { sevenDayCoins: 70, thirtyDayCoins: 300 },
      coins: { balances: { earnedCoins: 120 } },
      programs: {
        launchOperations: { counts: { pendingRewardSettlements: 2 } },
        taskCards: [
          { taskCardId: "task_1", templateId: "english-short-writing-v1", rewardCapCoins: 60 },
          { taskCardId: "task_2", templateId: "english-short-writing-v1", rewardCapCoins: 70 },
          { taskCardId: "legacy_todo:1", templateId: "ignored" },
        ],
      },
      board: {
        cards: [
          { taskCardId: "task_1", templateId: "english-short-writing-v1", status: "completed" },
          { taskCardId: "task_3", templateId: "math", status: "active" },
        ],
      },
    };
    const summary = model.ownerSettingsOverviewPlan({ overview, options: {} });
    assert.equal(summary.learnerLabel, "FanFan");
    assert.equal(summary.completed, 1);
    assert.equal(summary.activeTasks, 1);
    assert.equal(summary.sevenDayAverage, 10);
    assert.equal(summary.pendingRewardSettlements, 2);
    const series = model.rewardTaskSeriesPlan(overview);
    assert.deepEqual(series.map((item) => item.key).sort(), ["english-short-writing-v1", "math"]);
    assert.equal(model.taskSeriesLabelPlan(series.find((item) => item.key === "english-short-writing-v1")), "英语短写作");
  });

  await test("learning growth model normalizes mastery and readiness labels", async () => {
    const model = await loadModel();
    assert.equal(model.statusTextPlan("platform-reuse"), "复用平台");
    assert.equal(model.readinessStatusTextPlan("operational_ready"), "Operational ready");
    assert.equal(model.masteryStatusTextPlan("needs_repair"), "需修复");
    assert.equal(model.masteryStrategyTextPlan("stretch"), "拓展");
    assert.equal(model.masteryDomainTextPlan("computer_science"), "计算机科学");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
