"use strict";

const assert = require("node:assert/strict");
const { createLearningGrowthNextCardStrategyService } = require("../adapters/learning-growth-next-card-strategy-service");

function testRepairsLowScoreWeakness() {
  const service = createLearningGrowthNextCardStrategyService();
  const result = service.recommendNextCardStrategy({
    currentTask: { skillIds: ["english.writing.claim_reason_example"] },
    latestEvaluation: { score: 62 },
    masteryProfile: {
      weaknesses: [{ skillId: "english.writing.sentence_control", status: "needs_repair", negativeEvidenceCount: 2 }],
      strengths: [],
    },
  });
  assert.equal(result.strategy, "repair");
  assert.equal(result.difficultyBand, "repair");
  assert.ok(result.targetSkillIds.includes("english.writing.sentence_control"));
  assert.equal(result.allowAboveGrade, true);
}

function testStretchesStrongEvidenceBeyondGradeCap() {
  const service = createLearningGrowthNextCardStrategyService();
  const result = service.recommendNextCardStrategy({
    currentTask: { gradeReference: "grade8", skillIds: ["computer_science.programming.testing_and_debugging"] },
    latestEvaluation: { score: 92 },
    latestReflection: { status: "accepted" },
    masteryProfile: {
      strengths: [{ skillId: "computer_science.programming.testing_and_debugging", status: "mastered", positiveEvidenceCount: 2, confidence: 0.86 }],
      weaknesses: [],
    },
  });
  assert.equal(result.strategy, "stretch");
  assert.equal(result.difficultyAdjustment, "above_current_grade_when_ready");
  assert.equal(result.gradeReference, "grade8");
  assert.ok(result.targetSkillIds.includes("computer_science.programming.testing_and_debugging"));
}

function testTransfersStableSkillsWhenNoWeakness() {
  const service = createLearningGrowthNextCardStrategyService();
  const result = service.recommendNextCardStrategy({
    latestEvaluation: { score: 80 },
    masteryProfile: {
      strengths: [{ skillId: "science.practices.explanation_from_evidence", status: "practicing", positiveEvidenceCount: 1, confidence: 0.7 }],
      weaknesses: [],
    },
  });
  assert.equal(result.strategy, "transfer");
  assert.equal(result.transferLevel, "near_transfer");
}

testRepairsLowScoreWeakness();
testStretchesStrongEvidenceBeyondGradeCap();
testTransfersStableSkillsWhenNoWeakness();

console.log("learning growth next card strategy service tests passed");
