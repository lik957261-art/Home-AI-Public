"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/navigation-shell/learning-program-model.mjs");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadModel() {
  return import(`${pathToFileURL(modelPath).href}?test=${Date.now()}-${Math.random()}`);
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
  const model = await loadModel();

  await test("learning program model stays browser-boundary free", () => {
    const source = read("src/vite-islands/navigation-shell/learning-program-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|globalThis|navigator|localStorage|sessionStorage|fetch|setTimeout|setInterval)\b/);
    assert.doesNotMatch(source, /\bstate\s*[\.\[]/);
    assert.match(source, /LEARNING_PROGRAM_MODEL_VERSION/);
  });

  await test("plans status labels, reward policy, and settlement summaries", () => {
    assert.equal(model.programStatusTextPlan("published", { isOwner: true }), "已下发");
    assert.equal(model.programStatusTextPlan("published", { isOwner: false }), "待执行");
    assert.equal(model.taskStatusTextPlan("blocked", { isOwner: true }), "已拦截");
    assert.deepEqual(model.taskRewardPolicyPlan({
      rewardCapCoins: 88.4,
      rewardPolicy: {
        minCoins: 22.2,
        accuracyBonusMax: 20,
      },
    }), {
      maxCoins: 88,
      minCoins: 22,
      accuracyBonusMax: 20,
      timelinessBonusMax: 15,
      interactionBonusMax: 15,
    });
    assert.equal(model.evaluationStatusTextPlan("needs_repair"), "需修复");
    assert.equal(model.reviewStatusTextPlan("returned_for_revision"), "已返回修改");
    assert.equal(model.parentReviewTypeTextPlan("reward_settlement_review"), "奖励结算复核");
    assert.equal(model.settlementStatusTextPlan("pending_review"), "待家长复核");
    assert.equal(model.formatCoinAmountPlan(12), "12 金币");
    assert.equal(model.rewardSettlementDisplayTextPlan({ coinAmount: 12.4, status: "settled" }), "已得 12 金币");
    assert.equal(model.rewardSettlementDisplayTextPlan({ coinAmount: 5, status: "ready" }), "待结算 5 金币");
  });

  await test("plans draft rebuild eligibility and learner facts", () => {
    const data = {
      learnerProfile: { displayName: "Learner" },
      curriculumReferences: [{ ref: "grade7 5_5-6" }],
      sources: [{ sourceRef: "src-a", summary: "grade7 5.5-6" }, { sourceId: "src-b" }],
      goals: [{ goalId: "goal-a" }],
      programs: [{ programId: "program-a" }],
      taskCards: [
        { draftId: "draft-a", status: "planned", curriculumRefs: ["grade4-5"] },
        { draftId: "draft-a", status: "review_required" },
      ],
    };
    const draft = {
      draftId: "draft-a",
      programId: "program-a",
      status: "draft",
      curriculumRefs: ["cefr-a2-b1"],
    };
    assert.equal(model.latestDraftForProgramPlan({ programId: "program-a" }, [draft]), draft);
    assert.equal(model.taskCardsForDraftPlan(data.taskCards, draft).length, 2);
    assert.equal(model.hasLegacyCurriculumRefPlan("upper-primary"), true);
    assert.equal(model.draftNeedsRebuildPlan(data, draft), true);
    assert.equal(model.draftCanBeRebuiltPlan(data, draft), true);
    assert.deepEqual(model.learnerFactsPlan(data), {
      displayName: "Learner",
      grade: "七年级",
      level: "5.5-6 / B1 过渡",
      sourceCount: 2,
      goalCount: 1,
      programCount: 1,
    });
  });

  await test("plans focus labels, source refs, risk flags, and percentages", () => {
    assert.equal(model.focusLabelPlan("english_short_writing"), "写作");
    assert.equal(model.compactFocusPlan(["english_reading_comprehension", "english_presentation"]), "阅读 / 演讲项目");
    assert.equal(model.sourceRefsForProgramPlan({ sources: [{ sourceRef: "src-a" }, { sourceId: "src-b" }] }, {}), "src-a\nsrc-b");
    assert.equal(model.compactRiskFlagsPlan([{ code: "legacy_ref" }, { reason: "missing_goal" }, "manual"]), "legacy_ref / missing_goal / manual");
    assert.equal(model.formatPercentPlan(0.526), "53%");
    assert.equal(model.formatPercentPlan(2), "100%");
    assert.equal(model.firstItemPlan([null, "", "first"]), "first");
    assert.equal(model.latestRewardSettlementForTaskPlan([
      { taskCardId: "task-a", updatedAt: "2026-01-01T00:00:00Z" },
      { taskCardId: "task-a", updatedAt: "2026-01-02T00:00:00Z" },
    ], { taskCardId: "task-a" }).updatedAt, "2026-01-02T00:00:00Z");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
