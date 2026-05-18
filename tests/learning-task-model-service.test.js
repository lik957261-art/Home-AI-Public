"use strict";

const assert = require("node:assert/strict");
const {
  TASK_MODEL_VERSION,
  buildLearningTaskModel,
  learningTaskModelSummary,
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
  assert.equal(writing.activityType, "writing");
  assert.equal(writing.taskCardType, "project_card");
  assert.equal(writing.submissionContract.firstSubmissionKind, "writing_draft");
  assert.equal(writing.submissionContract.revisionRequiredAfterFeedback, true);
  assert.equal(writing.completionPolicy.firstSubmissionCompletesTask, false);
  assert.equal(writing.evaluationContract.requiresMarkdownReport, true);
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
    "interactionStateMachine",
    "skillId",
    "submissionContract",
    "taskCardType",
    "version",
  ].sort());
  assert.equal(nextActionForTaskModel(writing, {}), "submit_first_attempt");
  assert.equal(nextActionForTaskModel(writing, { evaluationStatus: "draft_feedback" }), "submit_revision_and_reflection");
  assert.equal(nextActionForTaskModel(writing, { nextStep: "revise_and_resubmit" }), "submit_revision");
  assert.equal(nextActionForTaskModel(writing, { status: "completed" }), "review_feedback");
}

run();
console.log("learning task model service tests passed");
