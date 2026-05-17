"use strict";

const assert = require("node:assert/strict");
const ProgramUi = require("../public/app-learning-program-ui");

const programs = {
  programs: [{
    programId: "program-1",
    title: "English growth",
    status: "active",
    domain: "english",
    goalSummary: "Improve English output.",
    focusAreas: ["english_reading_comprehension", "english_speaking_retell", "english_short_writing"],
    minutesPerDay: 30,
    daysPerWeek: 5,
  }],
  latestDrafts: [{
    draftId: "draft-1",
    programId: "program-1",
    status: "review_required",
    weekStart: "2026-05-16",
    weekEnd: "2026-05-20",
    reliability: { publishBlocked: false },
    dailyPlans: [{ date: "2026-05-16", tasks: [{ taskId: "t1" }] }],
  }],
  reviewItems: [{
    reviewId: "review-1",
    status: "pending",
    summary: "review needed",
    riskFlags: [{ code: "missing_curriculum_refs" }],
  }],
  parentReviewRequests: [{
    reviewRequestId: "parent-review-1",
    status: "pending",
    requestType: "reward_settlement_review",
    summary: "settlement review needed",
    riskFlags: [{ code: "large_reward" }],
  }],
  rewardSettlements: [{
    rewardSettlementId: "settle-1",
    status: "pending_review",
    coinAmount: 20,
    reason: "verified summary",
    evaluationId: "eval-1",
  }],
  launchOperations: {
    version: "learning-growth-launch-ops-v1",
    status: "attention_required",
    officialLaunchReady: true,
    counts: {
      publishedTasks: 2,
      activeSessions: 1,
      pendingPlanReviews: 1,
      pendingParentReviews: 1,
      pendingRewardSettlements: 1,
      rewardCandidates: 1,
    },
    queues: {
      blockers: [],
      approvals: [{ resourceType: "plan_review", resourceId: "review-1", title: "review-1", reasonCode: "pending_parent_review", priority: "high" }],
      execution: [{ resourceType: "task_card", resourceId: "task-1", title: "Reading output task", reasonCode: "task_ready_for_executor", priority: "normal" }],
      rewards: [{ resourceType: "evaluation", resourceId: "eval-1", title: "eval-1", reasonCode: "passed_evaluation_needs_reward_settlement", priority: "normal" }],
    },
    nextActions: [
      { id: "decide-parent-reviews", reasonCode: "pending_parent_review" },
      { id: "settle-learning-rewards", reasonCode: "pending_reward_settlement" },
    ],
  },
  taskCards: [{
    taskCardId: "task-1",
    title: "Reading output task",
    status: "published",
    plannedDate: "2026-05-17",
    plannedMinutes: 30,
    skillIds: ["english_speaking_retell"],
  }, {
    taskCardId: "task-2",
    title: "Writing repair task",
    status: "published",
    plannedDate: "2026-05-18",
    plannedMinutes: 20,
    skillIds: ["english_short_writing"],
  }],
  interactionSessions: [{
    sessionId: "session-1",
    taskCardId: "task-1",
    status: "active",
    currentStep: "learner_attempt",
    summary: "started",
  }],
  dailyPlan: {
    summary: { totalTasks: 2, pendingTasks: 2, totalMinutes: 50, activeDays: 2 },
    nextTask: { taskCardId: "task-1", title: "Reading output task" },
    days: [
      { date: "2026-05-17", pendingCount: 1, totalMinutes: 30, tasks: [{ taskCardId: "task-1" }] },
      { date: "2026-05-18", pendingCount: 1, totalMinutes: 20, tasks: [{ taskCardId: "task-2" }] },
    ],
  },
  evaluations: [{
    evaluationId: "eval-1",
    status: "passed",
    score: 88,
    passed: true,
    summary: "summary only",
  }],
  skillStates: [{
    skillId: "english_speaking_retell",
    level: "baseline",
    confidence: 0.64,
  }],
  sources: [{ sourceId: "source-1", title: "School summary", sourceType: "school" }],
  goals: [{ goalId: "goal-1", title: "English output", domain: "english" }],
  learnerProfile: { learnerId: "weixin_stephen", profileSummary: "sources=1; goals=1" },
  curriculumReferences: [{ referenceId: "cefr-a2-b1-english-growth", title: "CEFR A2-B1 English growth bridge" }],
  parentReport: {
    reportType: "parent_weekly_summary",
    counts: { plannedTasks: 3, passedEvaluations: 1, coinsSettled: 20, pendingReviews: 1 },
    nextActions: [{ reason: "parent_review_required", resourceType: "evaluation", resourceId: "eval-1" }],
  },
};

function testOwnerFormAndActionsRender() {
  const html = ProgramUi.renderProgramSubsystem({
    programs,
    state: { auth: { isOwner: true } },
  });
  assert.match(html, /data-learning-growth-module="programs"/);
  assert.match(html, /data-learning-growth-category="execution"/);
  assert.match(html, /data-learning-growth-category="guidance"/);
  assert.match(html, /data-learning-growth-category="parent-admin"/);
  assert.match(html, /data-learning-task-card-id="task-1"/);
  assert.match(html, /data-learning-task-card-id="task-2"/);
  assert.match(html, /data-learning-daily-plan/);
  assert.match(html, /data-learning-session-advance="session-1"/);
  assert.match(html, /data-learning-evaluation-form="session-1"/);
  assert.match(html, /data-learning-task-start="task-2"/);
  assert.match(html, /data-learning-evaluation-summary="eval-1"/);
  assert.match(html, /data-learning-foundation/);
  assert.match(html, /data-learning-source-create/);
  assert.match(html, /data-learning-goal-create/);
  assert.match(html, /data-learning-foundation-import/);
  assert.match(html, /data-learning-profile-rebuild/);
  assert.match(html, /data-learning-parent-report/);
  assert.match(html, /data-learning-parent-report-refresh/);
  assert.match(html, /data-learning-program-create/);
  assert.match(html, /data-learning-program-draft-action="program-1"/);
  assert.match(html, /data-learning-program-publish="program-1"/);
  assert.match(html, /data-learning-review-decision="review-1"/);
  assert.match(html, /data-learning-parent-review-decision="parent-review-1"/);
  assert.match(html, /data-learning-reward-settlement-id="settle-1"/);
  assert.match(html, /data-learning-launch-operations/);
  assert.match(html, /data-learning-launch-next-action="settle-learning-rewards"/);
  assert.match(html, /data-learning-evaluation-settle="eval-1"/);
  assert.match(html, /english_reading_comprehension/);
  assert.match(html, /School summary/);
  assert.match(html, /English output/);
  assert.match(html, /CEFR A2-B1 English growth bridge/);
  assert.doesNotMatch(html, /rawTranscript|questionText|answerKey|pushEndpoint|apiKey/);
}

function testNonOwnerCannotSeeCreateForm() {
  const html = ProgramUi.renderProgramSubsystem({
    programs,
    state: { auth: { isOwner: false } },
  });
  assert.doesNotMatch(html, /data-learning-program-create/);
  assert.doesNotMatch(html, /data-learning-source-create/);
  assert.doesNotMatch(html, /data-learning-goal-create/);
  assert.doesNotMatch(html, /data-learning-foundation-import/);
  assert.doesNotMatch(html, /data-learning-parent-report/);
  assert.doesNotMatch(html, /data-learning-review-queue/);
  assert.doesNotMatch(html, /data-learning-parent-review-requests/);
  assert.doesNotMatch(html, /data-learning-reward-settlements/);
  assert.doesNotMatch(html, /data-learning-launch-operations/);
  assert.doesNotMatch(html, /data-learning-parent-review-decision/);
  assert.doesNotMatch(html, /data-learning-reward-settlement-id/);
  assert.doesNotMatch(html, /data-learning-evaluation-settle/);
  assert.doesNotMatch(html, /data-learning-program-draft-action/);
  assert.doesNotMatch(html, /data-learning-program-publish/);
  assert.doesNotMatch(html, /School summary/);
  assert.doesNotMatch(html, /English output/);
  assert.doesNotMatch(html, /CEFR A2-B1 English growth bridge/);
  assert.doesNotMatch(html, /Owner|家长|结算/);
  assert.match(html, /data-learning-growth-category="execution"/);
  assert.match(html, /data-learning-growth-category="guidance"/);
  assert.match(html, /data-learning-task-card-id="task-1"/);
  assert.match(html, /data-learning-task-card-id="task-2"/);
  assert.match(html, /data-learning-daily-plan/);
  assert.match(html, /data-learning-session-advance="session-1"/);
  assert.doesNotMatch(html, /data-learning-evaluation-form="session-1"/);
  assert.match(html, /data-learning-task-start="task-2"/);
  assert.match(html, /data-learning-evaluation-summary="eval-1"/);
  assert.match(html, /data-learning-program-id="program-1"/);
}

testOwnerFormAndActionsRender();
testNonOwnerCannotSeeCreateForm();

console.log("app learning program ui tests passed");
