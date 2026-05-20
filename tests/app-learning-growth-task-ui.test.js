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

function testSpokenReflectionActionLabel() {
  assert.equal(TaskUi.nextActionLabel("submit_spoken_reflection"), "\u5f55\u97f3\u590d\u76d8");
}

function testWritingSubmissionGuardAndLiveLabel() {
  const guard = TaskUi.submissionGuard(todoWithActivity("writing"));
  assert.equal(guard.minWords, 80);
  assert.equal(guard.minChars, 300);
  assert.match(TaskUi.submissionRequirementLabel(guard, { words: 79, chars: 290 }), /\u672a\u8fbe\u6807/);
  assert.match(TaskUi.submissionRequirementLabel(guard, { words: 80, chars: 300 }), /\u5df2\u8fbe\u6807/);
}

function testFeedbackHistoryRendersOutcomeAndReports() {
  const html = TaskUi.renderFeedbackHistory({
    learningGrowthReportHistory: [
      { name: "01-\u521d\u6b21\u63d0\u4ea4\u6279\u6539.md", path: "C:\\reports\\one.md" },
      { name: "02-\u518d\u6b21\u63d0\u4ea4\u6279\u6539.md", path: "C:\\reports\\two.md" },
    ],
  }, { status: "needs_revision", nextStep: "revise_and_resubmit", passed: false });
  assert.match(html, /\u672c\u6b21\u672a\u901a\u8fc7/);
  assert.match(html, /\u6279\u6539\u5386\u53f2/);
  assert.match(html, /2 \u6b21\u6279\u6539/);
  assert.match(html, /\u518d\u6b21\u63d0\u4ea4\u6279\u6539/);
}

testNewEnglishTemplateActivityLabels();
testNewEnglishTemplateSubmissionPrompts();
testSpokenReflectionActionLabel();
testWritingSubmissionGuardAndLiveLabel();
testFeedbackHistoryRendersOutcomeAndReports();
console.log("app learning growth task UI tests passed");
