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
  assert.doesNotMatch(html, /answerKey|correctAnswer|rawTranscript|pushEndpoint|apiKey/);
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

testOwnerFormAndActionsRender();
testNonOwnerCannotSeeCreateForm();
testNativeTaskWithKanbanLinkUsesNativeSubmissionFirst();
testNativeTaskWithoutKanbanLinkUsesNativeSubmission();
testNativeTaskDetailShowsRewardPolicyWithoutCapForm();
testNativeSpeakingTaskRendersAudioRecorder();
testNativeMathTaskRendersStructuredQuestionInputs();
testNativeTaskReflectionStateRendersReflectionForm();

console.log("app learning program ui tests passed");
