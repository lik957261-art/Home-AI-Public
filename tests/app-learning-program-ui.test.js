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
  }],
  taskCards: [{
    taskCardId: "task-1",
    title: "Reading output task",
    status: "published",
    plannedDate: "2026-05-17",
    plannedMinutes: 30,
    skillIds: ["english_speaking_retell"],
  }],
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
  assert.match(html, /data-learning-evaluation-summary="eval-1"/);
  assert.match(html, /data-learning-foundation/);
  assert.match(html, /data-learning-source-create/);
  assert.match(html, /data-learning-goal-create/);
  assert.match(html, /data-learning-profile-rebuild/);
  assert.match(html, /data-learning-program-create/);
  assert.match(html, /data-learning-program-draft-action="program-1"/);
  assert.match(html, /data-learning-program-publish="program-1"/);
  assert.match(html, /data-learning-review-decision="review-1"/);
  assert.match(html, /data-learning-parent-review-decision="parent-review-1"/);
  assert.match(html, /data-learning-reward-settlement-id="settle-1"/);
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
  assert.doesNotMatch(html, /data-learning-review-queue/);
  assert.doesNotMatch(html, /data-learning-parent-review-requests/);
  assert.doesNotMatch(html, /data-learning-reward-settlements/);
  assert.doesNotMatch(html, /data-learning-parent-review-decision/);
  assert.doesNotMatch(html, /data-learning-reward-settlement-id/);
  assert.doesNotMatch(html, /data-learning-program-draft-action/);
  assert.doesNotMatch(html, /data-learning-program-publish/);
  assert.doesNotMatch(html, /School summary/);
  assert.doesNotMatch(html, /English output/);
  assert.doesNotMatch(html, /CEFR A2-B1 English growth bridge/);
  assert.doesNotMatch(html, /Owner|家长|结算/);
  assert.match(html, /data-learning-growth-category="execution"/);
  assert.match(html, /data-learning-growth-category="guidance"/);
  assert.match(html, /data-learning-task-card-id="task-1"/);
  assert.match(html, /data-learning-evaluation-summary="eval-1"/);
  assert.match(html, /data-learning-program-id="program-1"/);
}

testOwnerFormAndActionsRender();
testNonOwnerCannotSeeCreateForm();

console.log("app learning program ui tests passed");
