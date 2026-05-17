"use strict";

const assert = require("node:assert/strict");
const {
  createLearningGrowthWritingEvaluationService,
  normalizeEvaluationStage,
  rewardCoinsForScore,
  scoreWriting,
} = require("../adapters/learning-growth-writing-evaluation-service");

function testScoresPassingWritingAndReward() {
  const service = createLearningGrowthWritingEvaluationService({
    now: () => new Date("2026-05-17T15:30:00.000Z"),
  });
  const text = [
    "Last week I joined a school activity about teamwork.",
    "First, I thought the task was easy, but I soon found that our group needed a clearer plan.",
    "Because everyone had a different idea, I wrote down three steps and asked each classmate to choose one job.",
    "Finally, we finished the poster on time, and I learned that good communication can make a hard task much easier.",
  ].join(" ");
  const evaluation = service.evaluate({
    cardId: "t_growth",
    card: { kanbanCaseCardGoal: "Write 80-120 words about a real school activity." },
    text,
  });
  assert.equal(evaluation.status, "completed");
  assert.equal(evaluation.stage, "final");
  assert.equal(evaluation.nextStep, "completed");
  assert.equal(evaluation.passed, true);
  assert.ok(evaluation.score >= 70);
  assert.equal(evaluation.reward.eligible, true);
  assert.ok(evaluation.feedbackSections.rewriteChecklist.length >= 3);
  assert.ok(evaluation.reward.coinAmount >= 10);
  assert.equal(evaluation.verificationMethod, "deterministic_template");
  assert.equal(evaluation.evaluatedAt, "2026-05-17T15:30:00.000Z");
  assert.doesNotMatch(JSON.stringify(evaluation), /Last week I joined|school activity about teamwork/);
}

function testDraftFeedbackDoesNotSettleOrComplete() {
  const service = createLearningGrowthWritingEvaluationService({
    now: () => new Date("2026-05-17T15:30:00.000Z"),
  });
  const text = [
    "Last week I joined a school activity about teamwork.",
    "First, I wrote down three steps and asked each classmate to choose one job.",
    "Finally, we finished the poster on time, and I learned that good communication can make a hard task much easier.",
  ].join(" ");
  const evaluation = service.evaluate({
    stage: "draft",
    cardId: "t_growth",
    card: { kanbanCaseCardGoal: "Write 80-120 words about a real school activity." },
    text,
  });
  assert.equal(evaluation.status, "draft_feedback");
  assert.equal(evaluation.stage, "draft");
  assert.equal(evaluation.nextStep, "rewrite_and_reflect");
  assert.equal(evaluation.passed, false);
  assert.equal(evaluation.reward.eligible, false);
  assert.equal(evaluation.reward.coinAmount, 0);
  assert.ok(evaluation.feedbackSections.reflectionPrompts.length >= 1);
}

function testRequiresRevisionForShortWriting() {
  const scored = scoreWriting({
    card: { kanbanCaseCardGoal: "Write at least 80 words." },
    text: "I like English because it is useful.",
  });
  assert.equal(scored.passed, false);
  assert.ok(scored.issues.some((issue) => issue.code === "too_short"));
  assert.equal(rewardCoinsForScore(scored.score), 0);
}

testScoresPassingWritingAndReward();
testDraftFeedbackDoesNotSettleOrComplete();
testRequiresRevisionForShortWriting();
assert.equal(normalizeEvaluationStage("rewrite"), "final");
assert.equal(normalizeEvaluationStage("draft"), "draft");
console.log("learning growth writing evaluation service tests passed");
