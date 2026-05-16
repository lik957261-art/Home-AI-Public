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
  assert.match(html, /data-learning-foundation/);
  assert.match(html, /data-learning-source-create/);
  assert.match(html, /data-learning-goal-create/);
  assert.match(html, /data-learning-profile-rebuild/);
  assert.match(html, /data-learning-program-create/);
  assert.match(html, /data-learning-program-draft-action="program-1"/);
  assert.match(html, /data-learning-program-publish="program-1"/);
  assert.match(html, /data-learning-review-decision="review-1"/);
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
  assert.match(html, /data-learning-program-id="program-1"/);
}

testOwnerFormAndActionsRender();
testNonOwnerCannotSeeCreateForm();

console.log("app learning program ui tests passed");
