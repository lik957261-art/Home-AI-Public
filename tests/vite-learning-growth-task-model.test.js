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
    "src/vite-islands/navigation-shell/learning-growth-task-model.mjs",
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
  await test("learning growth task model stays browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/learning-growth-task-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|localStorage|sessionStorage|fetch)\b/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("plans submission guard, validation, and prompt", async () => {
    const model = await loadModel();
    const plan = model.learningGrowthTaskSubmissionPlan({
      todo: { learningTaskModel: { activityType: "writing" } },
      evaluation: {},
      text: "short",
    });
    assert.equal(plan.guard.activityType, "writing");
    assert.equal(plan.guard.minWords, 80);
    assert.equal(plan.validation.ok, false);
    assert.match(plan.requirementLabel, /未达标/);
    assert.match(plan.prompt, /学习任务作答|写/);
    assert.equal(model.activityLabel("weekly_challenge"), "周挑战");
    assert.equal(model.nextActionLabel("submit_spoken_reflection"), "录音复盘");
  });

  await test("plans feedback history without rendering HTML", async () => {
    const model = await loadModel();
    const plan = model.feedbackHistoryPlan({
      learningGrowthReportHistory: [
        { name: "01.md", path: "/reports/one.md" },
        { name: "02.md", path: "/reports/two.md" },
      ],
    }, {
      status: "reflection_required",
      nextStep: "spoken_reflection_required",
      passed: true,
      score: 55,
      finalPassingScore: 80,
      completionDecision: "complete_current_card",
      completionPolicy: { attemptNo: 3, threeSeriousSubmissionsComplete: true },
    });
    assert.equal(plan.history.length, 2);
    assert.equal(plan.historyCountLabel, "2 次批改");
    assert.equal(plan.scoreText, "确定分数 55/100");
    assert.match(plan.outcome.title, /三次认真提交/);
  });

  await test("plans teaching card detail and experience actions", async () => {
    const model = await loadModel();
    const plan = model.teachingCardDetailPlan({
      taskCardId: "teach-1",
      cardRole: "teaching",
      title: "分段阅读",
      status: "completed",
      rewardPolicy: { maxCoins: 120 },
      expectedDurationMinutes: { min: 8, max: 12 },
      experienceSummary: { latestSignalType: "too_hard", latestAt: "2026-07-05T00:00:00.000Z" },
      teachingFlow: {
        whyItMatters: "先有方向。",
        lesson: { title: "主旨", explanation: "先抓主旨。", examples: ["topic sentence"] },
        microLesson: { keyPoints: ["先说主旨"] },
        quickCheck: { prompt: "一句话说明主旨。", completionCriteria: ["写出主旨"] },
      },
    }, { state: { learningGrowthTeachingStepByCardId: { "teach-1": "quick_check" } } });
    assert.equal(plan.cardId, "teach-1");
    assert.equal(plan.role, "teaching");
    assert.equal(plan.roleLabel, "教学卡");
    assert.equal(plan.step, "quick_check");
    assert.equal(plan.reward, 120);
    assert.equal(plan.flow.lesson.keyPoints[0], "先说主旨");
    assert.equal(plan.feedback.experienceActions.locked, true);
    assert.ok(plan.feedback.experienceActions.actions.some((action) => action.type === "too_hard" && action.isSelected));
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
