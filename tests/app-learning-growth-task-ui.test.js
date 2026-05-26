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
  assert.match(html, /\u672c\u6b21\u8fd8\u9700\u8981\u4fee\u6539/);
  assert.match(html, /\u786e\u5b9a\u5206\u6570 68\/100/);
  assert.match(html, /\u672c\u9875\u4e0b\u65b9\u7684\u8be6\u7ec6\u6279\u6539/);
  assert.doesNotMatch(html, /\u6253\u5f00\u6700\u65b0\u6279\u6539\u6587\u4ef6/);
  assert.match(html, /\u6279\u6539\u5386\u53f2/);
  assert.match(html, /2 \u6b21\u6279\u6539/);
  assert.match(html, /\u518d\u6b21\u63d0\u4ea4\u6279\u6539/);
}

function testDraftFeedbackReachedScoreLineNeedsReflectionNotFailure() {
  const html = TaskUi.renderFeedbackHistory({}, {
    status: "draft_feedback",
    nextStep: "rewrite_and_reflect",
    passed: false,
    score: 90,
    passingScore: 80,
  });
  assert.match(html, /\u521d\u7a3f\u6279\u6539\u5df2\u8fbe\u6807/);
  assert.match(html, /\u5f85\u53cd\u601d\u548c\u4fee\u6539\u590d\u76d8/);
  assert.match(html, /\u786e\u5b9a\u5206\u6570 90\/100/);
  assert.match(html, /\u8fd8\u6ca1\u6709\u6700\u7ec8\u5b8c\u6210/);
  assert.doesNotMatch(html, /\u672c\u6b21\u672a\u901a\u8fc7/);
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

function testTeachingCardDetailRendersLessonPracticeAndCheck() {
  const task = {
    taskCardId: "teach-1",
    cardRole: "teaching",
    title: "\u5206\u6bb5\u9605\u8bfb",
    status: "published",
    rewardPolicy: { maxCoins: 100 },
    expectedDurationMinutes: { min: 10, max: 15 },
    teachingFlow: {
      whyItMatters: "\u8fd9\u80fd\u8ba9\u590d\u8ff0\u5148\u6709\u65b9\u5411\u3002",
      lesson: { title: "\u4e3b\u65e8", explanation: "\u5148\u6293\u4e3b\u65e8\uff0c\u518d\u770b\u7ec6\u8282\u3002", examples: ["topic sentence"] },
      microLesson: { keyPoints: ["\u5148\u8bf4\u4e3b\u65e8", "\u518d\u8865\u4e24\u4e2a\u7ec6\u8282"] },
      workedExample: {
        instruction: "\u5148\u770b\u4e00\u4e2a\u793a\u8303\u3002",
        steps: [{ label: "\u793a\u8303", text: "\u8fd9\u6bb5\u4e3b\u8981\u5728\u8bb2\u5348\u9910\u89c4\u5219\u7684\u53d8\u5316\u3002" }],
      },
      guidedPractice: { prompt: "\u627e\u5230\u4e00\u53e5\u4e3b\u65e8\u53e5\u3002" },
      quickCheck: { prompt: "\u7528\u4e00\u53e5\u8bdd\u8bf4\u660e\u4e3b\u65e8\u3002", completionCriteria: ["\u5199\u51fa\u4e3b\u65e8"] },
    },
  };
  const lessonHtml = TaskUi.renderTeachingCardDetail(task, {
    state: {
      learningGrowthTeachingStepByCardId: { "teach-1": "lesson" },
      learningGrowthTeachingDrafts: { "teach-1": { guidedPracticeText: "draft", quickCheckText: "check" } },
    },
  });
  assert.match(lessonHtml, /\u8fd9\u80fd\u8ba9\u590d\u8ff0\u5148\u6709\u65b9\u5411/);
  assert.match(lessonHtml, /\u5148\u8bf4\u4e3b\u65e8/);
  assert.match(lessonHtml, /\u5148\u770b\u4e00\u4e2a\u793a\u8303/);
  assert.match(lessonHtml, /\u8fd9\u6bb5\u4e3b\u8981\u5728\u8bb2/);
  const html = TaskUi.renderTeachingCardDetail(task, {
    state: {
      learningGrowthTeachingStepByCardId: { "teach-1": "quick_check" },
      learningGrowthTeachingDrafts: { "teach-1": { guidedPracticeText: "draft", quickCheckText: "check" } },
    },
  });
  assert.match(html, /data-learning-growth-teaching-card="teach-1"/);
  assert.match(html, /\u6559\u5b66\u5361/);
  assert.match(html, /\u5206\u6bb5\u9605\u8bfb/);
  assert.match(html, /data-learning-growth-teaching-check-form="teach-1"/);
  assert.match(html, /data-learning-growth-experience-signal="teach-1"/);
  assert.match(html, /data-signal-type="too_easy"/);
  assert.match(html, /data-signal-type="right_level"/);
  assert.match(html, /data-signal-type="too_hard"/);
  assert.doesNotMatch(html, /data-signal-type="not_learned"/);
  assert.doesNotMatch(html, /data-learning-growth-stage-assessment-challenge="teach-1"/);
  assert.doesNotMatch(html, /data-learning-open-growth-history="teach-1"/);
  assert.doesNotMatch(html, /\u8fd4\u56de\u4efb\u52a1/);
  assert.doesNotMatch(html, /data-learning-native-growth-submission-form/);
  const lockedHtml = TaskUi.renderTeachingCardDetail(Object.assign({}, task, {
    experienceSummary: { latestSignalType: "too_hard", latestAt: "2026-05-26T00:00:00.000Z" },
  }), { state: { learningGrowthTeachingStepByCardId: { "teach-1": "quick_check" } } });
  assert.match(lockedHtml, /data-signal-type="too_hard"[^>]+aria-pressed="true"[^>]+disabled/);
  assert.match(lockedHtml, /data-signal-type="too_easy"[^>]+disabled/);
  const pendingHtml = TaskUi.renderTeachingCardDetail(task, {
    state: {
      learningGrowthTeachingStepByCardId: { "teach-1": "quick_check" },
      learningGrowthExperienceSignalBusy: { "teach-1": "right_level" },
    },
  });
  assert.match(pendingHtml, /data-signal-type="right_level"[^>]+aria-pressed="true"[^>]+disabled[^>]*>\u8bb0\u5f55\u4e2d/);
}

testNewEnglishTemplateActivityLabels();
testNewEnglishTemplateSubmissionPrompts();
testSpokenReflectionActionLabel();
testWritingSubmissionGuardAndLiveLabel();
testRevisionPromptLeavesReflectionToRecorder();
testFeedbackHistoryRendersOutcomeAndReports();
testDraftFeedbackReachedScoreLineNeedsReflectionNotFailure();
testFeedbackHistoryPrioritizesReflectionGate();
testFeedbackHistoryDistinguishesThreeSeriousAttemptCompletion();
testTeachingCardDetailRendersLessonPracticeAndCheck();
console.log("app learning growth task UI tests passed");
