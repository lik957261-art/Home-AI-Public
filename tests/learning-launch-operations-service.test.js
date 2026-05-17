"use strict";

const assert = require("node:assert/strict");
const { buildLearningLaunchOperations } = require("../adapters/learning-launch-operations-service");

function testOperationsDetectReadyLaunchAndQueues() {
  const operations = buildLearningLaunchOperations({
    programs: {
      counts: { sources: 1, goals: 1, programs: 1 },
      sources: [{ sourceId: "source-1", title: "source summary" }],
      goals: [{ goalId: "goal-1", title: "goal summary" }],
      programs: [{ programId: "program-1", status: "active" }],
      latestDrafts: [],
      reviewItems: [],
      parentReviewRequests: [],
      rewardSettlements: [],
      taskCards: [{ taskCardId: "task-1", title: "English task", status: "published" }],
      interactionSessions: [{ sessionId: "session-1", taskCardId: "task-1", status: "active" }],
      evaluations: [{ evaluationId: "eval-1", status: "passed", passed: true }],
      dailyPlan: {
        days: [{ date: "2026-05-17", tasks: [{ taskCardId: "task-1", status: "published" }] }],
      },
    },
    metrics: { pendingRedemptions: 1 },
  });

  assert.equal(operations.version, "learning-growth-launch-ops-v1");
  assert.equal(operations.status, "attention_required");
  assert.equal(operations.officialLaunchReady, true);
  assert.equal(operations.privacyLevel, "summary_only");
  assert.equal(operations.counts.publishedTasks, 1);
  assert.equal(operations.counts.activeSessions, 1);
  assert.equal(operations.counts.rewardCandidates, 1);
  assert.equal(operations.counts.pendingRedemptions, 1);
  assert.ok(operations.queues.execution.some((item) => item.resourceId === "task-1"));
  assert.ok(operations.queues.rewards.some((item) => item.resourceId === "eval-1"));
  assert.ok(operations.nextActions.some((item) => item.id === "settle-learning-rewards"));
  assert.ok(operations.nextActions.some((item) => item.id === "review-coin-redemptions"));
  assert.doesNotMatch(JSON.stringify(operations), /rawTranscript|questionText|answerKey|prompt|fullTranscript/);
}

function testOperationsDetectBlockersAndReviews() {
  const operations = buildLearningLaunchOperations({
    programs: {
      sources: [],
      goals: [],
      programs: [{ programId: "program-1", status: "active" }],
      latestDrafts: [{ draftId: "draft-1", status: "blocked", reliability: { publishBlocked: true } }],
      reviewItems: [{ reviewId: "review-1", status: "pending", riskFlags: [{ code: "missing_source_basis" }] }],
      parentReviewRequests: [{ reviewRequestId: "parent-review-1", status: "pending", resourceType: "evaluation" }],
      rewardSettlements: [{ rewardSettlementId: "settle-1", evaluationId: "eval-1", status: "pending_review" }],
      taskCards: [{ taskCardId: "task-1", status: "blocked" }],
      interactionSessions: [],
      evaluations: [{ evaluationId: "eval-2", status: "needs_repair", passed: false }],
    },
  });

  assert.equal(operations.status, "blocked");
  assert.equal(operations.officialLaunchReady, false);
  assert.equal(operations.counts.blockers, 3);
  assert.equal(operations.counts.pendingPlanReviews, 1);
  assert.equal(operations.counts.pendingParentReviews, 1);
  assert.equal(operations.counts.pendingRewardSettlements, 1);
  assert.ok(operations.queues.blockers.some((item) => item.resourceId === "draft-1"));
  assert.ok(operations.queues.approvals.some((item) => item.resourceId === "review-1"));
  assert.ok(operations.queues.rewards.some((item) => item.resourceId === "settle-1"));
  assert.ok(operations.nextActions.some((item) => item.id === "import-learning-foundation"));
  assert.ok(operations.nextActions.some((item) => item.id === "clear-launch-blockers"));
}

testOperationsDetectReadyLaunchAndQueues();
testOperationsDetectBlockersAndReviews();

console.log("learning launch operations service tests passed");
