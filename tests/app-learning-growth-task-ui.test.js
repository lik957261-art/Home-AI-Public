"use strict";

const assert = require("node:assert/strict");
const TaskUi = require("../public/app-learning-growth-task-ui");

function todoWithActivity(activityType) {
  return {
    learningTaskModel: {
      activityType,
      skillId: `skill_${activityType}`,
    },
  };
}

function testNewEnglishTemplateActivityLabels() {
  assert.equal(TaskUi.activityLabel("rewriting"), "改写");
  assert.equal(TaskUi.activityLabel("weekly_challenge"), "周挑战");
}

function testNewEnglishTemplateSubmissionPrompts() {
  assert.match(TaskUi.submissionPrompt({}, todoWithActivity("rewriting")), /改写版/);
  assert.match(TaskUi.submissionPrompt({}, todoWithActivity("rewriting")), /变式修复/);
  assert.match(TaskUi.submissionPrompt({}, todoWithActivity("weekly_challenge")), /本周综合作答/);
  assert.match(TaskUi.submissionPrompt({}, todoWithActivity("weekly_challenge")), /改进句/);
}

testNewEnglishTemplateActivityLabels();
testNewEnglishTemplateSubmissionPrompts();
console.log("app learning growth task UI tests passed");
