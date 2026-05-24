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
  assert.equal(TaskUi.nextActionLabel("submit_revision_and_reflection"), "\u63d0\u4ea4\u4fee\u6539\u7248");
  assert.equal(TaskUi.nextActionLabel("submit_revision"), "\u63d0\u4ea4\u4fee\u6539\u7248");
  assert.doesNotMatch(TaskUi.nextActionLabel("submit_revision_and_reflection"), /\u590d\u76d8/);
}

function testWritingSubmissionGuardAndLiveLabel() {
  const guard = TaskUi.submissionGuard(todoWithActivity("writing"));
  assert.equal(guard.minWords, 80);
  assert.equal(guard.minChars, 300);
  const finalGuard = TaskUi.submissionGuard(todoWithActivity("writing"), { status: "draft_feedback" });
  assert.equal(finalGuard.stage, "final");
  assert.ok(finalGuard.minChars < guard.minChars);
  assert.match(TaskUi.submissionRequirementLabel(guard, { words: 79, chars: 290 }), /\u672a\u8fbe\u6807/);
  assert.match(TaskUi.submissionRequirementLabel(guard, { words: 80, chars: 300 }), /\u5df2\u8fbe\u6807/);
}

function testRevisionPromptLeavesReflectionToRecorder() {
  const prompt = TaskUi.submissionPrompt({ nextStep: "rewrite_and_reflect" }, todoWithActivity("writing"));
  assert.match(prompt, /\u4fee\u6539/);
  assert.doesNotMatch(prompt, /\u590d\u76d8/);
}

function testFeedbackHistoryRendersOutcomeAndReports() {
  const html = TaskUi.renderFeedbackHistory({
    learningGrowthReportHistory: [
      { name: "01-\u521d\u6b21\u63d0\u4ea4\u6279\u6539.md", path: "C:\\reports\\one.md" },
      { name: "02-\u518d\u6b21\u63d0\u4ea4\u6279\u6539.md", path: "C:\\reports\\two.md" },
    ],
  }, { status: "needs_revision", nextStep: "revise_and_resubmit", passed: false, score: 68 });
  assert.match(html, /\u672c\u6b21\u672a\u901a\u8fc7/);
  assert.match(html, /\u786e\u5b9a\u5206\u6570 68\/100/);
  assert.match(html, /\u672c\u9875\u4e0b\u65b9\u7684\u8be6\u7ec6\u6279\u6539/);
  assert.doesNotMatch(html, /\u6253\u5f00\u6700\u65b0\u6279\u6539\u6587\u4ef6/);
  assert.match(html, /\u6279\u6539\u5386\u53f2/);
  assert.match(html, /2 \u6b21\u6279\u6539/);
  assert.match(html, /\u518d\u6b21\u63d0\u4ea4\u6279\u6539/);
}

function testFeedbackHistoryPrioritizesReflectionGate() {
  const html = TaskUi.renderFeedbackHistory({}, {
    status: "reflection_required",
    nextStep: "spoken_reflection_required",
    passed: true,
    score: 86,
    finalPassingScore: 80,
  });
  assert.match(html, /\u6700\u7ec8\u8bc4\u5206\u5df2\u8fbe\u6807/);
  assert.match(html, /\u786e\u5b9a\u5206\u6570 86\/100/);
  assert.match(html, /\u672c\u9875\u6700\u8fd1\u6279\u6539/);
  assert.match(html, /\u590d\u76d8\u901a\u8fc7\u540e\u518d\u7ed3\u7b97/);
}

function testFeedbackHistoryDistinguishesThreeSeriousAttemptCompletion() {
  const html = TaskUi.renderFeedbackHistory({}, {
    status: "reflection_required",
    nextStep: "spoken_reflection_required",
    passed: true,
    score: 55,
    finalPassingScore: 80,
    completionDecision: "complete_current_card",
    completionPolicy: {
      attemptNo: 3,
      threeSeriousSubmissionsComplete: true,
    },
  });
  assert.match(html, /\u4e09\u6b21\u8ba4\u771f\u63d0\u4ea4\u5df2\u5b8c\u6210/);
  assert.match(html, /\u786e\u5b9a\u5206\u6570 55\/100/);
  assert.match(html, /\u771f\u5b9e\u5206/);
  assert.match(html, /\u540e\u7eed\u7ec3\u4e60/);
  assert.doesNotMatch(html, /80 \u5206\u7ebf/);
  assert.doesNotMatch(html, /\u6700\u7ec8\u8bc4\u5206\u5df2\u8fbe\u6807/);
}

testNewEnglishTemplateActivityLabels();
testNewEnglishTemplateSubmissionPrompts();
testSpokenReflectionActionLabel();
testWritingSubmissionGuardAndLiveLabel();
testRevisionPromptLeavesReflectionToRecorder();
testFeedbackHistoryRendersOutcomeAndReports();
testFeedbackHistoryPrioritizesReflectionGate();
testFeedbackHistoryDistinguishesThreeSeriousAttemptCompletion();
console.log("app learning growth task UI tests passed");
