"use strict";

const assert = require("node:assert/strict");
const {
  TASK_MODEL_VERSION,
  buildLearningTaskModel,
  inferLearningTaskModelFromCard,
  inferSkillIdFromText,
  learningTaskModelSummary,
  normalizeRewardPolicy,
  nextActionForTaskModel,
  normalizeTaskCardType,
} = require("../adapters/learning-task-model-service");

function run() {
  assert.equal(normalizeTaskCardType("project_card"), "project_card");
  assert.equal(normalizeTaskCardType("unknown", "review_card"), "review_card");

  const writing = buildLearningTaskModel({
    skillId: "english_short_writing",
    dayIndex: 1,
    plannedMinutes: 18,
  });
  assert.equal(writing.version, TASK_MODEL_VERSION);
  assert.equal(writing.templatePackVersion, "english-template-pack-v1");
  assert.equal(writing.templateId, "english-short-writing-v1");
  assert.equal(writing.activityType, "writing");
  assert.equal(writing.taskCardType, "project_card");
  assert.equal(writing.submissionContract.firstSubmissionKind, "writing_draft");
  assert.equal(writing.submissionContract.revisionRequiredAfterFeedback, true);
  assert.equal(writing.completionPolicy.firstSubmissionCompletesTask, false);
  assert.equal(writing.completionPolicy.completeAfterStep, "reward_settlement");
  assert.equal(writing.completionPolicy.finalPassingScore, 80);
  assert.equal(writing.completionPolicy.requiresSpokenReflection, true);
  assert.equal(writing.completionPolicy.settlementAfterReflection, true);
  assert.equal(writing.evaluationContract.requiresMarkdownReport, true);
  assert.equal(writing.evaluationContract.finalPassingScore, 80);
  assert.equal(writing.evaluationContract.passingScore, 80);
  assert.equal(writing.evaluationContract.requiresSpokenReflection, true);
  assert.equal(writing.evaluationContract.settlementAfterReflection, true);
  assert.equal(writing.feedbackContract.scoreOnlyFeedbackAllowed, false);
  assert.ok(writing.rubricDimensions.some((item) => item.id === "rewrite_quality"));
  assert.equal(writing.rewardPolicy.minCoins, 40);
  assert.equal(writing.rewardPolicy.maxCoins, 100);
  assert.match(writing.rewardPolicy.summary, /40-100 coins/);
  assert.equal(writing.rewardPolicy.basis, "verified_pass_score_timeliness_interaction");
  assert.ok(writing.interactionStateMachine.includes("learner_rewrites"));
  assert.ok(writing.evidenceContract.forbiddenInLogs.includes("full_transcript"));
  assert.doesNotMatch(JSON.stringify(writing), /private answer|private transcript|full child answer|question fixture/);

  const speaking = buildLearningTaskModel({
    skillId: "english_speaking_retell",
    dayIndex: 2,
  });
  assert.equal(speaking.taskCardType, "challenge_card");
  assert.equal(speaking.activityType, "speaking");
  assert.equal(speaking.submissionContract.firstSubmissionKind, "speaking_retell");

  const summary = learningTaskModelSummary(writing);
  assert.deepEqual(Object.keys(summary).sort(), [
    "activityType",
    "completionPolicy",
    "evaluationContract",
    "feedbackContract",
    "interactionStateMachine",
    "rubricDimensions",
    "rewardPolicy",
    "skillId",
    "submissionContract",
    "taskCardType",
    "templateId",
    "templatePackVersion",
    "version",
  ].sort());
  assert.equal(summary.rewardPolicy.maxCoins, 100);
  assert.equal(summary.evaluationContract.finalPassingScore, 80);
  assert.equal(summary.evaluationContract.requiresSpokenReflection, true);
  assert.equal(summary.completionPolicy.completeAfterStep, "reward_settlement");
  assert.equal(summary.completionPolicy.requiresSpokenReflection, true);
  const legacySummary = learningTaskModelSummary({ skillId: "english_short_writing", submissionContract: { firstSubmissionKind: "writing_draft" } });
  assert.equal(legacySummary.evaluationContract.requiresSpokenReflection, true);
  assert.equal(legacySummary.completionPolicy.settlementAfterReflection, true);
  assert.equal(normalizeRewardPolicy({ rewardPolicy: { minCoins: 20, maxCoins: 120, basis: "custom_template_rubric", summary: "Custom rubric up to 120 coins." } }).maxCoins, 120);
  assert.equal(nextActionForTaskModel(writing, {}), "submit_first_attempt");
  assert.equal(nextActionForTaskModel(writing, { evaluationStatus: "draft_feedback" }), "submit_revision_and_reflection");
  assert.equal(nextActionForTaskModel(writing, { nextStep: "revise_and_resubmit" }), "submit_revision");
  assert.equal(nextActionForTaskModel(writing, { nextStep: "spoken_reflection_required" }), "submit_spoken_reflection");
  assert.equal(nextActionForTaskModel(writing, { status: "completed" }), "review_feedback");

  assert.equal(inferSkillIdFromText({ kanbanSkills: ["writing"] }), "english_short_writing");
  assert.equal(inferSkillIdFromText({ content: "English vocabulary active use task" }), "english_vocabulary_active_use");
  assert.equal(inferSkillIdFromText({ content: "Rewrite this sentence and explain the revision" }), "english_rewrite_improvement");
  assert.equal(inferSkillIdFromText({ content: "Weekly integrated challenge using this week's repairs" }), "english_weekly_challenge");
  assert.equal(inferSkillIdFromText({ content: "Retell this school story orally" }), "english_speaking_retell");
  const inferred = inferLearningTaskModelFromCard({
    content: "English writing task",
    kanbanCaseTemplate: "learning-growth",
    kanbanCaseCardGoal: "Write a short paragraph and rewrite after feedback.",
    kanbanCaseCardIndex: 2,
  });
  assert.equal(inferred.skillId, "english_short_writing");
  assert.equal(inferred.activityType, "writing");
  assert.match(inferred.learnerInstruction, /Write a short paragraph/);

  const legacyGrowthWriting = inferLearningTaskModelFromCard({
    content: "English writing task",
    learningProgramId: "lprogram_legacy",
    kanbanCaseTemplate: "learning-growth",
    kanbanCaseCardGoal: "Write a short paragraph and rewrite after feedback.",
    kanbanCaseDeliverables: ["\u5b66\u4e60\u6210\u679c\u63d0\u4ea4"],
    kanbanCaseAcceptance: ["study output", "AI feedback", "targeted quiz", "next study guidance"],
  });
  assert.equal(legacyGrowthWriting.skillId, "english_short_writing");
  assert.deepEqual(legacyGrowthWriting.deliverables, [
    "first English draft",
    "AI feedback",
    "rewritten draft",
    "spoken reflection",
    "final evaluation and reward settlement",
  ]);
  assert.notDeepEqual(legacyGrowthWriting.acceptance, ["study output", "AI feedback", "targeted quiz", "next study guidance"]);
}

run();
console.log("learning task model service tests passed");
