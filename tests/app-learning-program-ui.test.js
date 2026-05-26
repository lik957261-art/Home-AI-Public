"use strict";

const assert = require("node:assert/strict");
const ProgramUi = require("../public/app-learning-program-ui");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const stylesCss = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");

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
    draftId: "draft-1",
    title: "Reading output task",
    status: "review_required",
    plannedDate: "2026-05-17",
    plannedMinutes: 30,
    skillIds: ["english_speaking_retell"],
    curriculumRefs: ["cambridge-primary-english-reference"],
  }, {
    taskCardId: "task-2",
    draftId: "published-draft",
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
  sourceDirectories: [{
    bindingId: "learning-materials:weixin_stephen",
    directoryLabel: "\u5b66\u4e60\u8d44\u6599",
    displayName: "\u51e1\u51e1",
    availableSummaryCount: 2,
    policy: "summary_only_cleaned_data",
    summaryFiles: [
      { role: "parent_cumulative_cleaned_summary", exists: true },
      { role: "learning_plan_cleaned_summary", exists: true },
    ],
  }],
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
  assert.match(html, /data-learning-owner-step="learner"/);
  assert.match(html, /data-learning-owner-step="scope"/);
  assert.match(html, /data-learning-task-card-id="task-1"/);
  assert.match(html, /data-learning-task-card-id="task-2"/);
  assert.match(html, /data-learning-daily-plan/);
  assert.match(html, /data-learning-session-advance="session-1"/);
  assert.match(html, /data-learning-evaluation-form="session-1"/);
  assert.match(html, /data-learning-task-start="task-2"/);
  assert.match(html, /data-learning-evaluation-summary="eval-1"/);
  assert.match(html, /data-learning-foundation/);
  assert.match(html, /data-learning-source-directories/);
  assert.match(html, /data-learning-source-directory-import="learning-materials:weixin_stephen"/);
  assert.match(html, /data-learning-source-directory-bootstrap="learning-materials:weixin_stephen"/);
  assert.match(html, /data-learning-source-create/);
  assert.match(html, /data-learning-goal-create/);
  assert.match(html, /data-learning-foundation-import/);
  assert.match(html, /data-learning-profile-rebuild/);
  assert.match(html, /data-learning-parent-report/);
  assert.match(html, /data-learning-parent-report-refresh/);
  assert.match(html, /data-learning-program-create/);
  assert.match(html, /English growth/);
  assert.match(html, /Improve English output/);
  assert.match(html, /data-learning-program-draft-action="program-1"/);
  assert.match(html, /data-learning-program-rebuild-draft="program-1"/);
  assert.match(html, /data-learning-program-stale-draft="draft-1"/);
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
  assert.doesNotMatch(html, /data-learning-source-directories/);
  assert.doesNotMatch(html, /data-learning-source-directory-import/);
  assert.doesNotMatch(html, /data-learning-source-directory-bootstrap/);
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
  assert.doesNotMatch(html, /data-learning-program-rebuild-draft/);
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

function testNativeTaskWithKanbanLinkUsesNativeSubmissionFirst() {
  const html = ProgramUi.renderProgramSubsystem({
    programs: Object.assign({}, programs, {
      executableTasks: [{
        taskCardId: "task-native-1",
        kanbanCardId: "kanban-native-1",
        source: "learning-growth",
        title: "Native Growth task",
        status: "published",
        executionStatus: "pending_execution",
        workspaceId: "weixin_stephen",
        plannedDate: "2026-05-19",
        plannedMinutes: 20,
        skillIds: ["english_short_writing"],
      }],
    }),
    state: { auth: { isOwner: false } },
  });
  assert.match(html, /data-learning-executable-task-id="task-native-1"/);
  assert.match(html, /data-learning-native-growth-submission-form="task-native-1"/);
  assert.match(html, /data-learning-native-growth-submission-input="task-native-1"/);
  assert.match(html, /data-learning-submit-native-growth="task-native-1"/);
  assert.match(html, /data-learning-open-growth-task="task-native-1"/);
  assert.doesNotMatch(html, /data-learning-task-start="task-native-1"/);
}

function testNativeTaskWithoutKanbanLinkUsesNativeSubmission() {
  const html = ProgramUi.renderProgramSubsystem({
    programs: Object.assign({}, programs, {
      executableTasks: [{
        taskCardId: "task-native-2",
        source: "learning-growth",
        title: "Native Growth task without Kanban",
        status: "published",
        executionStatus: "pending_execution",
        workspaceId: "weixin_stephen",
        plannedDate: "2026-05-19",
        plannedMinutes: 20,
        skillIds: ["english_grammar"],
      }],
    }),
    state: { auth: { isOwner: false } },
  });
  assert.match(html, /data-learning-executable-task-id="task-native-2"/);
  assert.match(html, /data-learning-native-growth-submission-form="task-native-2"/);
  assert.match(html, /data-learning-native-growth-submission-input="task-native-2"/);
  assert.doesNotMatch(html, /data-learning-task-start="task-native-2"/);
  assert.match(html, /data-learning-open-growth-task="task-native-2"/);
  assert.doesNotMatch(html, /rawTranscript|questionText|answerKey|pushEndpoint|apiKey/);
}

function testNativeTaskDetailShowsRewardPolicyWithoutCapForm() {
  const html = ProgramUi.renderNativeGrowthTaskDetail({
    taskCardId: "task-native-reward",
    source: "learning-growth",
    title: "Native reward task",
    status: "published",
    workspaceId: "weixin_stephen",
    rewardCapCoins: 130,
    rewardPolicy: { maxCoins: 130, minCoins: 40, accuracyBonusMax: 30, timelinessBonusMax: 15, interactionBonusMax: 15 },
    learnerInstruction: "summary only instruction",
  }, { evaluations: [], taskSubmissions: [], taskReflections: [] }, {
    state: { auth: { isOwner: true } },
  });
  assert.match(html, /data-learning-task-reward-policy/);
  assert.match(html, /奖励 130 金币/);
  assert.match(html, /40%/);
  assert.match(html, /30%/);
  assert.match(html, /奖励比例/);
  assert.doesNotMatch(html, /data-learning-task-reward-policy-form="task-native-reward"/);
  assert.doesNotMatch(html, /name="maxCoins"/);
}

function testNativeSpeakingTaskRendersAudioRecorder() {
  const html = ProgramUi.renderProgramSubsystem({
    programs: Object.assign({}, programs, {
      executableTasks: [{
        taskCardId: "task-native-speaking",
        source: "learning-growth",
        title: "Native speaking retell task",
        status: "published",
        executionStatus: "pending_execution",
        workspaceId: "weixin_stephen",
        plannedDate: "2026-05-19",
        plannedMinutes: 20,
        skillIds: ["english_speaking_retell"],
        taskModel: {
          activityType: "speaking",
          skillId: "english_speaking_retell",
        },
      }],
    }),
    state: {
      auth: { isOwner: false },
      learningNativeGrowthSubmissionRecorders: {},
    },
  });
  assert.match(html, /data-learning-executable-task-id="task-native-speaking"/);
  assert.match(html, /data-learning-native-growth-submission-form="task-native-speaking"/);
  assert.match(html, /data-requires-audio="1"/);
  assert.match(html, /data-learning-native-growth-recorder="task-native-speaking"/);
  assert.match(html, /data-learning-native-growth-record-start="task-native-speaking"/);
  assert.match(html, /data-learning-submit-native-growth="task-native-speaking"/);
  assert.doesNotMatch(html, /data-learning-native-growth-submission-input="task-native-speaking"/);
  assert.doesNotMatch(html, /rawTranscript|questionText|answerKey|pushEndpoint|apiKey/);
}

function testReviewedEnglishRetellCanReopenReadingMaterial() {
  const html = ProgramUi.renderNativeGrowthTaskDetail({
    taskCardId: "task-native-reading-retell",
    source: "learning-growth",
    title: "Native reading retell task",
    status: "published",
    workspaceId: "weixin_stephen",
    learnerInstruction: "Record a retell after reading.",
    latestEvaluation: {
      status: "needs_repair",
      passed: false,
      score: 72,
      summary: "Feedback summary.",
    },
    taskModel: {
      activityType: "speaking",
      readingMaterial: {
        title: "Short passage",
        cefr: "B1",
        wordCount: 120,
        estimatedReadingMinutes: 3,
        passage: "This compact passage is the original reading material.",
      },
    },
  }, { evaluations: [], taskSubmissions: [{
    taskCardId: "task-native-reading-retell",
    submissionId: "sub-1",
    attemptNo: 1,
    submittedAt: "2026-05-23T12:34:50.168Z",
    displayText: "This is the server transcript and it should be collapsed when audio exists.",
    audio: {
      kind: "audio",
      name: "retell.webm",
      mime: "audio/webm",
      size: 2048,
      url: "/api/files?path=retell.webm",
    },
  }, {
    taskCardId: "task-native-reading-retell",
    submissionId: "sub-2",
    attemptNo: 2,
    submittedAt: "2026-05-23T12:54:50.168Z",
    displayText: "This is the latest server transcript and it should stay collapsed when audio exists.",
    audio: {
      kind: "audio",
      name: "retell-second.webm",
      mime: "audio/webm",
      size: 4096,
      url: "/api/learning/task-submissions/sub-2/audio",
    },
  }], taskReflections: [{
    taskCardId: "task-native-reading-retell",
    reflectionId: "refl-1",
    submittedAt: "2026-05-23T13:04:50.168Z",
    status: "accepted",
    audio: {
      kind: "audio",
      name: "reflection.webm",
      mime: "audio/webm",
      size: 2048,
      url: "/api/learning/task-reflections/refl-1/audio",
    },
  }] }, {
    state: { auth: { isOwner: false } },
  });
  assert.ok(html.indexOf("data-learning-growth-reading-material") < html.indexOf("data-learning-growth-previous-submission"));
  assert.match(html, /data-learning-growth-reading-material/);
  assert.match(html, /\u67e5\u770b\u539f\u59cb\u9605\u8bfb\u6750\u6599/);
  assert.match(html, /Short passage/);
  assert.match(html, /This compact passage is the original reading material/);
  assert.match(html, /data-learning-growth-submission-audio/);
  assert.match(html, /<audio controls preload="metadata" src="\/api\/files\?path=retell\.webm&amp;format=mp3"><\/audio>/);
  assert.match(html, /data-learning-growth-audio-evidence/);
  assert.match(html, /data-learning-growth-audio-evidence-item="sub-1"/);
  assert.match(html, /data-learning-growth-audio-evidence-item="sub-2"/);
  assert.match(html, /data-learning-growth-audio-evidence-item="refl-1"/);
  assert.match(html, /\/api\/learning\/task-submissions\/sub-2\/audio\?format=mp3/);
  assert.match(html, /\/api\/learning\/task-reflections\/refl-1\/audio\?format=mp3/);
  assert.match(html, /learning-growth-submission-transcript/);
  assert.match(html, /\u67e5\u770b\u8f6c\u5199\u5185\u5bb9/);
  assert.doesNotMatch(html, /<details class="learning-growth-submission-transcript" open>/);
  assert.match(html, /data-learning-growth-task-prompt-collapsed/);
}

function testNativeMathTaskRendersStructuredQuestionInputs() {
  const html = ProgramUi.renderNativeGrowthTaskDetail({
    taskCardId: "task-native-math",
    source: "learning-growth",
    title: "Native math task",
    status: "published",
    workspaceId: "weixin_stephen",
    plannedMinutes: 20,
    learnerInstruction: "Complete each question below.",
    taskModel: {
      activityType: "math_reasoning",
      questionItems: [
        {
          id: "q1",
          type: "multiple_choice",
          title: "Question 1",
          prompt: "Choose one.",
          choices: [
            { id: "A", text: "2" },
            { id: "B", text: "3" },
          ],
        },
        {
          id: "q3",
          type: "written",
          title: "Question 3",
          prompt: "Show reasoning.",
        },
      ],
    },
  }, { evaluations: [], taskSubmissions: [], taskReflections: [] }, {
    state: { auth: { isOwner: false } },
  });
  assert.match(html, /data-learning-native-growth-question="q1"/);
  assert.match(html, /data-learning-native-growth-question-choice="q1"/);
  assert.match(html, /data-learning-native-growth-question-reason="q1"/);
  assert.match(html, /data-learning-native-growth-question="q3"/);
  assert.match(html, /data-learning-native-growth-question-response="q3"/);
  assert.doesNotMatch(html, /data-learning-native-growth-submission-input="task-native-math"/);
  assert.match(stylesCss, /\.learning-native-growth-questions \{[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%;/);
  assert.match(stylesCss, /\.learning-native-growth-question \{[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%;/);
  assert.match(stylesCss, /\.learning-native-growth-choice span \{[\s\S]*?overflow-wrap: anywhere;/);
  assert.doesNotMatch(html, /answerKey|correctAnswer|rawTranscript|pushEndpoint|apiKey/);
}

function reviewedNativeMathTask() {
  return {
    taskCardId: "task-native-math-review",
    source: "learning-growth",
    title: "Native reviewed math task",
    status: "published",
    workspaceId: "weixin_stephen",
    plannedMinutes: 20,
    totalSubmissionCount: 4,
    totalEvaluationCount: 2,
    artifactDirectoryPath: "C:\\reports\\task-native-math-review",
    learningGrowthReportHistory: [
      { name: "01-feedback.md", path: "C:\\reports\\one.md" },
      { name: "02-feedback.md", path: "C:\\reports\\two.md" },
    ],
    learnerInstruction: "Complete each question below.",
    latestSubmission: {
      submittedAt: "2026-05-23T09:30:00.000Z",
      structuredResponses: [{ questionId: "q1", choice: "A", reason: "first try" }],
    },
    latestEvaluation: {
      status: "needs_repair",
      nextStep: "revise_and_resubmit",
      passed: false,
      score: 68,
      createdAt: "2026-05-23T10:30:00.000Z",
      summary: "Latest math feedback summary.",
      revisionRequirements: ["Show the operation path."],
      feedbackSections: {
        strengths: ["The selected answer is recorded."],
        focusAreas: ["Write the missing reasoning steps."],
        criterionFeedback: [{
          dimension: "reasoning",
          observation: "The answer is visible but the reason is too short.",
          action: "Add two checkable steps.",
        }],
        sentenceFeedback: [{
          evidence: "short reason",
          issue: "The reason does not show the calculation.",
          whyItMatters: "The grader cannot verify the method.",
          fix: "Write the operation in order.",
          example: "2x + 3 = 11, so x = 4.",
        }],
        rewriteChecklist: ["Add one calculation line."],
        reflectionPrompts: ["Name the missing step."],
        finalConclusion: "Needs a clearer math process.",
        nextPractice: "Check each answer with one equation.",
        parentNote: "Review the revision before reflection.",
      },
      reportHistory: [
        { name: "01-feedback.md", path: "C:\\reports\\one.md" },
        { name: "02-feedback.md", path: "C:\\reports\\two.md" },
      ],
    },
    taskModel: {
      activityType: "math_reasoning",
      questionItems: [{
        id: "q1",
        type: "multiple_choice",
        title: "Question 1",
        prompt: "Choose one.",
        choices: [{ id: "A", text: "2" }, { id: "B", text: "3" }],
      }],
    },
  };
}

function testReviewedNativeMathTaskCollapsesQuestionsUntilEdit() {
  const html = ProgramUi.renderNativeGrowthTaskDetail(reviewedNativeMathTask(), { evaluations: [], taskSubmissions: [], taskReflections: [] }, {
    state: { auth: { isOwner: false } },
    formatTime: () => "05/23 17:30",
  });
  assert.match(html, /data-learning-growth-submission-time/);
  assert.match(html, /05\/23 17:30/);
  assert.match(html, /data-learning-growth-feedback-count/);
  assert.match(html, /data-learning-growth-feedback-time/);
  assert.doesNotMatch(html, /\u6279\u6539 05\/23 17:30/);
  assert.match(html, /\u6279\u6539\uff1a2\u6b21/);
  assert.doesNotMatch(html, /\u603b\u63d0\u4ea4/);
  assert.doesNotMatch(html, /\u603b\u6279\u6539/);
  assert.match(html, /data-learning-growth-feedback-directory-link/);
  assert.match(html, /learning-growth-board-artifact-icon/);
  assert.match(html, /data-directory-path-open/);
  assert.match(html, /data-directory-path="C:\\reports\\task-native-math-review"/);
  assert.match(html, /data-learning-growth-task-prompt-collapsed/);
  assert.match(html, /\u67e5\u770b\u9898\u76ee\u8981\u6c42/);
  assert.match(html, /data-learning-native-growth-revision-collapsed="task-native-math-review"/);
  assert.match(html, /data-learning-native-growth-edit-answer="task-native-math-review"/);
  assert.match(html, /\u786e\u5b9a\u5206\u6570 68\/100/);
  assert.match(html, /\u8be6\u7ec6\u6279\u6539/);
  assert.match(html, /Show the operation path/);
  assert.match(html, /The selected answer is recorded/);
  assert.match(html, /Write the missing reasoning steps/);
  assert.match(html, /reasoning/);
  assert.match(html, /The grader cannot verify the method/);
  assert.match(html, /2x \+ 3 = 11/);
  assert.match(html, /Check each answer with one equation/);
  assert.ok(html.indexOf("data-learning-growth-feedback-detail") > html.indexOf("learning-growth-answer-feedback"));
  assert.doesNotMatch(html, /data-learning-native-growth-question="q1"/);
}

function testOwnerReviewedNativeMathTaskShowsManualPassMenu() {
  const html = ProgramUi.renderNativeGrowthTaskDetail(reviewedNativeMathTask(), { evaluations: [], taskSubmissions: [], taskReflections: [] }, {
    state: { auth: { isOwner: true } },
    formatTime: () => "05/23 17:30",
  });
  assert.match(html, /data-learning-growth-owner-menu/);
  assert.match(html, /data-learning-growth-manual-pass="task-native-math-review"/);
  assert.match(html, /\u624b\u5de5\u901a\u8fc7/);
}

function testCompletedNativeTaskShowsSettledCoinsAndNoAnswerForm() {
  const task = Object.assign({}, reviewedNativeMathTask(), {
    nativeState: { nextAction: "submit" },
    latestEvaluation: Object.assign({}, reviewedNativeMathTask().latestEvaluation, {
      status: "completed",
      passed: true,
      score: 100,
      evaluationId: "eval-manual-pass",
    }),
  });
  const html = ProgramUi.renderNativeGrowthTaskDetail(task, {
    evaluations: [],
    taskSubmissions: [],
    taskReflections: [],
    rewardSettlements: [{
      rewardSettlementId: "settle-manual-pass",
      taskCardId: "task-native-math-review",
      evaluationId: "eval-manual-pass",
      status: "settled",
      coinAmount: 88,
      settledAt: "2026-05-23T10:35:00.000Z",
    }],
  }, {
    state: { auth: { isOwner: true } },
    formatTime: () => "05/23 17:30",
  });
  assert.match(html, /data-learning-task-reward-settlement/);
  assert.match(html, /\u5df2\u5f97 88 \u91d1\u5e01/);
  assert.match(html, /\u5df2\u5b8c\u6210/);
  assert.doesNotMatch(html, /data-learning-native-growth-submission-form="task-native-math-review"/);
  assert.doesNotMatch(html, /data-learning-native-growth-question="q1"/);
}

function testReviewedNativeMathTaskTreatsEmptySourceAsNativeGrowth() {
  const task = Object.assign({}, reviewedNativeMathTask(), { source: "" });
  const html = ProgramUi.renderNativeGrowthTaskDetail(task, { evaluations: [], taskSubmissions: [], taskReflections: [] }, {
    state: { auth: { isOwner: false } },
    formatTime: () => "05/23 17:30",
  });
  assert.match(html, /data-learning-native-growth-revision-collapsed="task-native-math-review"/);
  assert.match(html, /data-learning-native-growth-edit-answer="task-native-math-review"/);
  assert.doesNotMatch(html, /data-learning-task-start="task-native-math-review"/);
}

function testReviewedNativeMathTaskExpandsAfterEditClickState() {
  const html = ProgramUi.renderNativeGrowthTaskDetail(reviewedNativeMathTask(), { evaluations: [], taskSubmissions: [], taskReflections: [] }, {
    state: {
      auth: { isOwner: false },
      learningNativeGrowthAnswerEditing: { "task-native-math-review": true },
    },
  });
  assert.match(html, /data-learning-native-growth-submission-form="task-native-math-review"/);
  assert.match(html, /data-learning-native-growth-question="q1"/);
  assert.match(html, /data-learning-native-growth-question-choice="q1"/);
  assert.doesNotMatch(html, /data-learning-native-growth-revision-collapsed="task-native-math-review"/);
}

function testNativeTaskReflectionStateRendersReflectionForm() {
  const html = ProgramUi.renderProgramSubsystem({
    programs: Object.assign({}, programs, {
      executableTasks: [{
        taskCardId: "task-native-reflect",
        source: "learning-growth",
        title: "Native Growth reflection task",
        status: "published",
        executionStatus: "pending_execution",
        workspaceId: "weixin_stephen",
        plannedDate: "2026-05-19",
        skillIds: ["english_short_writing"],
        nativeState: { status: "reflection_required", nextAction: "spoken_reflection" },
      }],
    }),
    state: { auth: { isOwner: false } },
  });
  assert.match(html, /data-learning-native-growth-reflection-form="task-native-reflect"/);
  assert.match(html, /data-learning-native-growth-reflection-recorder="task-native-reflect"/);
  assert.match(html, /data-learning-native-growth-reflection-record-start="task-native-reflect"/);
  assert.match(html, /data-learning-submit-native-growth-reflection="task-native-reflect"/);
  assert.doesNotMatch(html, /data-learning-native-growth-reflection-input="task-native-reflect"/);
  assert.doesNotMatch(html, /data-learning-native-growth-submission-form="task-native-reflect"/);
}

function testScoreReachedDraftFeedbackRendersReflectionForm() {
  const html = ProgramUi.renderNativeGrowthTaskDetail({
    taskCardId: "task-native-draft-reflect",
    source: "learning-growth",
    title: "Native Growth draft feedback task",
    status: "published",
    workspaceId: "weixin_stephen",
    skillIds: ["english_short_writing"],
    nativeState: { nextAction: "submit" },
    taskModel: {
      activityType: "writing",
      skillId: "english_short_writing",
      learnerInstruction: "Write a short first draft.",
    },
  }, {
    evaluations: [{
      taskCardId: "task-native-draft-reflect",
      evaluationId: "eval-draft-reflect",
      status: "draft_feedback",
      nextStep: "rewrite_and_reflect",
      score: 90,
      passingScore: 80,
      finalPassingScore: 80,
      createdAt: "2026-05-25T12:11:50.875Z",
    }],
    taskSubmissions: [{
      taskCardId: "task-native-draft-reflect",
      submissionId: "sub-draft-reflect",
      status: "submitted",
      displayText: "PREVIOUS_ANSWER_SHOULD_NOT_PREFILL",
      submittedAt: "2026-05-25T12:10:09.573Z",
    }],
    taskReflections: [],
  }, {
    state: { auth: { isOwner: false } },
  });
  assert.match(html, /data-learning-native-growth-reflection-form="task-native-draft-reflect"/);
  assert.match(html, /data-learning-native-growth-reflection-recorder="task-native-draft-reflect"/);
  assert.match(html, /data-learning-submit-native-growth-reflection="task-native-draft-reflect"/);
  assert.doesNotMatch(html, /data-learning-native-growth-submission-form="task-native-draft-reflect"/);
  assert.doesNotMatch(html, /data-learning-native-growth-submission-input="task-native-draft-reflect"[^>]*>PREVIOUS_ANSWER_SHOULD_NOT_PREFILL/);
}

function testRejectedReflectionShowsResultAndRetry() {
  const html = ProgramUi.renderNativeGrowthTaskDetail({
    taskCardId: "task-native-reflection-rejected",
    source: "learning-growth",
    title: "Native Growth rejected reflection task",
    status: "published",
    workspaceId: "weixin_stephen",
    skillIds: ["english_short_writing"],
    nativeState: { nextAction: "submit" },
    taskModel: {
      activityType: "writing",
      skillId: "english_short_writing",
      learnerInstruction: "Write a short first draft.",
    },
  }, {
    evaluations: [{
      taskCardId: "task-native-reflection-rejected",
      evaluationId: "eval-reflection-rejected",
      status: "draft_feedback",
      nextStep: "rewrite_and_reflect",
      score: 90,
      passingScore: 80,
      finalPassingScore: 80,
      createdAt: "2026-05-25T12:11:50.875Z",
    }],
    taskSubmissions: [{
      taskCardId: "task-native-reflection-rejected",
      submissionId: "sub-reflection-rejected",
      status: "submitted",
      displayText: "previous answer summary",
      submittedAt: "2026-05-25T12:10:09.573Z",
    }],
    taskReflections: [{
      taskCardId: "task-native-reflection-rejected",
      reflectionId: "refl-reflection-rejected",
      status: "rejected",
      score: 45,
      maxScore: 100,
      summary: "Needs clearer mistake explanation before completion.",
      submittedAt: "2026-05-26T13:09:19.462Z",
    }],
  }, {
    state: { auth: { isOwner: false } },
  });
  assert.match(html, /data-learning-native-growth-reflection-form="task-native-reflection-rejected"/);
  assert.match(html, /data-learning-native-growth-reflection-result/);
  assert.match(html, /\u4e0a\u6b21\u590d\u76d8\u672a\u901a\u8fc7/);
  assert.match(html, /45\/100/);
  assert.match(html, /Needs clearer mistake explanation/);
  assert.match(html, /data-learning-submit-native-growth-reflection="task-native-reflection-rejected"/);
  assert.doesNotMatch(html, /\u6b63\u5728\u8f6c\u5199/);
}

function testNativeSubmittingTaskShowsAutoRefreshState() {
  const previousDateNow = Date.now;
  Date.now = () => 1779528005000;
  const html = ProgramUi.renderNativeGrowthTaskDetail({
    taskCardId: "task-native-submitting",
    source: "learning-growth",
    title: "Native submitting task",
    status: "published",
    workspaceId: "weixin_stephen",
    nativeState: { nextAction: "submit" },
  }, { evaluations: [], taskSubmissions: [], taskReflections: [] }, {
    state: {
      auth: { isOwner: false },
      learningNativeGrowthSubmissionSubmitting: {
        "task-native-submitting": { startedAtMs: 1779528000000 },
      },
    },
  });
  Date.now = previousDateNow;
  assert.match(html, /data-learning-native-growth-submission-form="task-native-submitting"/);
  assert.match(html, /data-learning-submit-native-growth="task-native-submitting" disabled/);
  assert.match(html, /\u670d\u52a1\u7aef\u786e\u8ba4\u524d\u5c1a\u672a\u4fdd\u5b58/);
  assert.doesNotMatch(html, /\u5f85\u4f5c\u7b54/);
}

function testNativeStaleSubmittingTaskEnablesSubmit() {
  const previousDateNow = Date.now;
  Date.now = () => 1779528060000;
  try {
    const html = ProgramUi.renderNativeGrowthTaskDetail({
      taskCardId: "task-native-stale-submitting",
      source: "learning-growth",
      title: "Native stale submitting task",
      status: "published",
      workspaceId: "weixin_stephen",
      nativeState: { nextAction: "submit" },
    }, { evaluations: [], taskSubmissions: [], taskReflections: [] }, {
      state: {
        auth: { isOwner: false },
        learningNativeGrowthSubmissionSubmitting: {
          "task-native-stale-submitting": { startedAtMs: 1779528060000 - 16 * 1000 },
        },
      },
    });
    assert.match(html, /data-learning-native-growth-submission-form="task-native-stale-submitting"/);
    assert.doesNotMatch(html, /data-learning-submit-native-growth="task-native-stale-submitting" disabled/);
    assert.match(html, /\u5f85\u4f5c\u7b54/);
  } finally {
    Date.now = previousDateNow;
  }
}

testOwnerFormAndActionsRender();
testNonOwnerCannotSeeCreateForm();
testNativeTaskWithKanbanLinkUsesNativeSubmissionFirst();
testNativeTaskWithoutKanbanLinkUsesNativeSubmission();
testNativeTaskDetailShowsRewardPolicyWithoutCapForm();
testNativeSpeakingTaskRendersAudioRecorder();
testReviewedEnglishRetellCanReopenReadingMaterial();
testNativeMathTaskRendersStructuredQuestionInputs();
testReviewedNativeMathTaskCollapsesQuestionsUntilEdit();
testOwnerReviewedNativeMathTaskShowsManualPassMenu();
testCompletedNativeTaskShowsSettledCoinsAndNoAnswerForm();
testReviewedNativeMathTaskTreatsEmptySourceAsNativeGrowth();
testReviewedNativeMathTaskExpandsAfterEditClickState();
testNativeTaskReflectionStateRendersReflectionForm();
testScoreReachedDraftFeedbackRendersReflectionForm();
testRejectedReflectionShowsResultAndRetry();
testNativeSubmittingTaskShowsAutoRefreshState();
testNativeStaleSubmittingTaskEnablesSubmit();

console.log("app learning program ui tests passed");
