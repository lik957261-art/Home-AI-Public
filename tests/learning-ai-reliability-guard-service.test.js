"use strict";

const assert = require("node:assert/strict");
const { createLearningAiReliabilityGuardService } = require("../adapters/learning-ai-reliability-guard-service");

function baseDraft(overrides = {}) {
  return Object.assign({
    dailyPlans: [{
      date: "2026-05-16",
      tasks: [{
        taskId: "task-1",
        taskCardType: "single_subject",
        sourceBasisRefs: ["parent_config:program-1"],
        curriculumRefs: ["cefr-a2-b1-growth-track"],
        confidence: 0.8,
      }],
    }],
  }, overrides);
}

function testMissingSourceBlocksPublish() {
  const guard = createLearningAiReliabilityGuardService();
  const result = guard.evaluatePlanDraft({
    program: { sourceBasisRefs: [], curriculumRefs: ["cefr-a2"], minutesPerDay: 25 },
    draft: baseDraft({ dailyPlans: [{ tasks: [{ taskId: "task-1", taskCardType: "single_subject", sourceBasisRefs: [], curriculumRefs: ["cefr-a2"], confidence: 0.8 }] }] }),
  });
  assert.equal(result.publishBlocked, true);
  assert.ok(result.riskFlags.some((flag) => flag.code === "missing_source_basis"));
  assert.ok(result.riskFlags.some((flag) => flag.code === "task_missing_source_basis"));
}

function testCurriculumAndHighLoadRequireReview() {
  const guard = createLearningAiReliabilityGuardService({ maxMinutesPerDay: 60 });
  const result = guard.evaluatePlanDraft({
    program: { sourceBasisRefs: ["parent_config"], curriculumRefs: [], minutesPerDay: 75, reviewPolicy: { parentReviewRequired: false } },
    draft: baseDraft({ dailyPlans: [{ tasks: [{ taskId: "task-1", taskCardType: "single_subject", sourceBasisRefs: ["parent_config"], curriculumRefs: [], confidence: 0.55 }] }] }),
  });
  assert.equal(result.publishBlocked, false);
  assert.equal(result.parentReviewRequired, true);
  assert.ok(result.riskFlags.some((flag) => flag.code === "missing_curriculum_refs"));
  assert.ok(result.riskFlags.some((flag) => flag.code === "high_daily_load"));
  assert.ok(result.riskFlags.some((flag) => flag.code === "low_task_confidence"));
}

function testUnsupportedTaskTypeBlocksPublish() {
  const guard = createLearningAiReliabilityGuardService();
  const result = guard.evaluatePlanDraft({
    program: { sourceBasisRefs: ["parent_config"], curriculumRefs: ["cefr-a2"], minutesPerDay: 25 },
    draft: baseDraft({ dailyPlans: [{ tasks: [{ taskId: "task-1", taskCardType: "free_chat", sourceBasisRefs: ["parent_config"], curriculumRefs: ["cefr-a2"], confidence: 0.9 }] }] }),
  });
  assert.equal(result.publishBlocked, true);
  assert.ok(result.riskFlags.some((flag) => flag.code === "unsupported_task_card_type"));
}

testMissingSourceBlocksPublish();
testCurriculumAndHighLoadRequireReview();
testUnsupportedTaskTypeBlocksPublish();

console.log("learning ai reliability guard service tests passed");
