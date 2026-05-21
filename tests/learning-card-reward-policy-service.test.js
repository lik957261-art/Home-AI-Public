"use strict";

const assert = require("node:assert/strict");
const {
  calculateLearningCardReward,
  clampLearningCardRewardAmount,
  timelinessComponent,
} = require("../adapters/learning-card-reward-policy-service");

function testPassedCardRewardIsBetweenFortyAndOneHundred() {
  const reward = calculateLearningCardReward({
    score: 88,
    passed: true,
    dueAt: "2026-05-18T10:00:00.000Z",
    completedAt: "2026-05-18T09:00:00.000Z",
    interactionQualityScore: 0.8,
  });
  assert.equal(reward.eligible, true);
  assert.ok(reward.coinAmount >= 40);
  assert.ok(reward.coinAmount <= 100);
  assert.equal(reward.breakdown.baseCoins, 40);
  assert.ok(reward.breakdown.accuracyCoins > 0);
  assert.equal(reward.breakdown.timelinessStatus, "on_time");
  assert.equal(reward.breakdown.interactionStatus, "measured");
}

function testLateAndLowInteractionRewardIsLower() {
  const strong = calculateLearningCardReward({
    score: 96,
    passed: true,
    dueAt: "2026-05-18T10:00:00.000Z",
    completedAt: "2026-05-18T09:00:00.000Z",
    interactionQualityScore: 1,
  });
  const weak = calculateLearningCardReward({
    score: 72,
    passed: true,
    dueAt: "2026-05-18T10:00:00.000Z",
    completedAt: "2026-05-22T10:00:00.000Z",
    interactionQualityScore: 0,
  });
  assert.ok(strong.coinAmount > weak.coinAmount);
  assert.ok(weak.coinAmount >= 40);
  assert.ok(strong.coinAmount <= 100);
}

function testFailedCardHasNoReward() {
  const reward = calculateLearningCardReward({ score: 99, passed: false });
  assert.equal(reward.eligible, false);
  assert.equal(reward.coinAmount, 0);
}

function testExplicitClampUsesCardLimits() {
  assert.equal(clampLearningCardRewardAmount(10), 40);
  assert.equal(clampLearningCardRewardAmount(120), 100);
}

function testMissingDueDateUsesNeutralTimeliness() {
  const timeliness = timelinessComponent({ completedAt: "2026-05-18T09:00:00.000Z" });
  assert.equal(timeliness.status, "not_measured");
  assert.ok(timeliness.coins > 0);
}

testPassedCardRewardIsBetweenFortyAndOneHundred();
testLateAndLowInteractionRewardIsLower();
testFailedCardHasNoReward();
testExplicitClampUsesCardLimits();
testMissingDueDateUsesNeutralTimeliness();
console.log("learning card reward policy service tests passed");
