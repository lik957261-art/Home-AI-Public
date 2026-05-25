"use strict";

const assert = require("node:assert/strict");
const CoinsUi = require("../public/app-learning-coins-ui");
const GrowthUi = require("../public/app-learning-growth-ui");
const GrowthTaskUi = require("../public/app-learning-growth-task-ui");
const ProgramUi = require("../public/app-learning-program-ui");

const overview = {
  module: { title: "凡凡成长系统", currentEntry: "金币标签" },
  learner: { id: "weixin_stephen", displayName: "凡凡" },
  metrics: { sevenDayCoins: 70, thirtyDayCoins: 900, pendingRedemptions: 1 },
  board: {
    learner: { id: "weixin_stephen", workspaceId: "weixin_stephen", displayName: "Fanfan" },
    summary: { cardCount: 2 },
    lanes: [
      { id: "today", title: "Today", count: 1, cards: ["task-1"] },
      { id: "waiting_ai", title: "Waiting for AI", count: 1, cards: ["task-2"] },
    ],
    cards: [
      { taskCardId: "task-1", title: "Native board task", instructionPreview: "Write a short answer with a clear revision target.", activityType: "short_writing", plannedDate: "2026-05-20", openedAt: "2026-05-20T09:30:00", primaryAction: "submit", nextAction: "submit", artifactCount: 0, rewardCapCoins: 120, sequenceGroupId: "series-english-retell", templateId: "english-speaking-retell-v1" },
      { taskCardId: "task-2", title: "Waiting task", activityType: "reading", primaryAction: "wait", nextAction: "waiting_feedback", artifactCount: 1, artifactDirectoryPath: "C:\\Deliverables\\task-2", sequenceGroupId: "series-english-retell", templateId: "english-speaking-retell-v1", latestEvaluation: { score: 88 } },
    ],
  },
  capabilities: [
    { id: "coin-incentive", title: "金币激励", status: "active", description: "收敛为子模块" },
    { id: "ai-reliability-guard", title: "AI 可靠性护栏", status: "guardrail", description: "来源、校验、审核" },
    { id: "parent-review", title: "家长审核与结算", status: "planned", description: "管理信息" },
  ],
  platformCapabilities: [
    { id: "kanban", title: "看板任务" },
    { id: "chat", title: "聊天与主题" },
    { id: "push", title: "Web Push 提醒" },
  ],
  operationalReadiness: {
    version: "learning-growth-v1",
    status: "operational_ready",
    operationalTestReady: true,
    systemReadinessPercent: 100,
    learnerDataReadinessPercent: 100,
    checks: {
      system: [
        { id: "sqlite-learning-domain", label: "SQLite learning domain services", ready: true },
      ],
      learnerData: [
        { id: "daily-plan-data", label: "Daily plan has executable tasks", ready: true },
      ],
    },
    nextActions: [],
  },
  coins: {
    studentId: "weixin_stephen",
    balances: { availableCoins: 70, heldCoins: 0, earnedCoins: 70, spentCoins: 0 },
    settlement: { currency: "CNY" },
    growth: {
      totalEarnedCoins: 70,
      sevenDayCoins: 70,
      thirtyDayCoins: 900,
      activeDaysInLast7: 2,
      streakDays: 2,
      level: { current: { level: 1, title: "新手" }, progressPct: 35, toNextLevelCoins: 130 },
      recentDays: [{ date: "2026-05-16", coins: 70 }],
      rewardProgress: [],
    },
    rewards: [],
    redemptions: [],
    ledger: [{ id: "ledger-1", reason: "task reward", sourceType: "learning-growth-evaluation", sourceId: "eval-internal-1", createdAt: "2026-05-17T00:00:00.000Z", coinDelta: 10 }],
  },
  programs: {
    launchOperations: {
      version: "learning-growth-launch-ops-v1",
      status: "attention_required",
      counts: { publishedTasks: 1, activeSessions: 1, pendingPlanReviews: 1, pendingParentReviews: 1, pendingRewardSettlements: 1, rewardCandidates: 1 },
      queues: {
        blockers: [],
        approvals: [{ resourceType: "plan_review", resourceId: "review-1", title: "review-1", reasonCode: "pending_parent_review" }],
        execution: [{ resourceType: "task_card", resourceId: "task-1", title: "Task status", reasonCode: "task_ready_for_executor" }],
        rewards: [{ resourceType: "evaluation", resourceId: "eval-1", title: "eval-1", reasonCode: "passed_evaluation_needs_reward_settlement" }],
      },
      nextActions: [{ id: "settle-learning-rewards", reasonCode: "pending_reward_settlement" }],
    },
    programs: [{ programId: "program-1", title: "English growth", status: "active", domain: "english", focusAreas: ["english_speaking_retell"], minutesPerDay: 30, daysPerWeek: 5 }],
    latestDrafts: [],
    reviewItems: [{ reviewId: "review-1", status: "pending", summary: "review" }],
    parentReviewRequests: [{ reviewRequestId: "parent-review-1", status: "pending", summary: "parent review" }],
    rewardSettlements: [{ rewardSettlementId: "settle-1", status: "pending_review", coinAmount: 10 }],
    taskCards: [{ taskCardId: "task-1", title: "Task status", status: "published", plannedDate: "2026-05-17", openedAt: "2026-05-17T08:00:00.000Z", skillIds: ["english_speaking_retell"], rewardCapCoins: 100 }],
    interactionSessions: [{ sessionId: "session-1", taskCardId: "task-1", status: "active", currentStep: "learner_attempt" }],
    dailyPlan: {
      summary: { totalTasks: 1, pendingTasks: 1, totalMinutes: 30, activeDays: 1 },
      nextTask: { taskCardId: "task-1", title: "Task status" },
      days: [{ date: "2026-05-17", pendingCount: 1, totalMinutes: 30, tasks: [{ taskCardId: "task-1" }] }],
    },
    evaluations: [{ evaluationId: "eval-1", status: "passed", score: 90, passed: true, summary: "summary only" }],
    skillStates: [{ skillId: "english_speaking_retell", level: "baseline", confidence: 0.7 }],
  },
  nextModules: [{ id: "learning-profile", title: "学习档案与目标录入", status: "next" }],
};

function testCoinSubsystemRendererIsStandalone() {
  const html = CoinsUi.renderCoinsSubsystem({ summary: overview.coins, learnerId: "weixin_stephen", state: { auth: { isOwner: true } } });
  assert.match(html, /data-learning-growth-module="coins"/);
  assert.match(html, /金币与奖励/);
  assert.match(html, /激励记录/);
  assert.match(html, /历史累计/);
  assert.match(html, /70 金币/);
  assert.match(html, /learningRewardForm/);
  assert.doesNotMatch(html, /最近 7 天|7 天获得|7 天活跃|learning-growth-days/);
}

function testExecutorCoinSubsystemHidesOwnerSettlementDetails() {
  const html = CoinsUi.renderCoinsSubsystem({ summary: overview.coins, learnerId: "weixin_stephen", state: { auth: { isOwner: false } } });
  assert.match(html, /金币与奖励/);
  assert.match(html, /学习奖励/);
  assert.doesNotMatch(html, /learningRewardForm/);
  assert.doesNotMatch(html, /CNY|人民币|Owner/);
  assert.doesNotMatch(html, /eval-internal-1|learning-growth-evaluation|weixin_stephen/);
}

function testGrowthRendererContainsProductShellAndNestedCoins() {
  const html = GrowthUi.renderLearningGrowthView({ overview, coinsUi: CoinsUi, programUi: ProgramUi, state: { auth: { isOwner: false } } });
  assert.match(html, /data-learning-product="fanfan-growth"/);
  assert.match(html, /data-learning-role="executor"/);
  assert.match(html, /learning-growth-board-page/);
  assert.match(html, /data-learning-growth-board-summary/);
  assert.match(html, /data-learning-growth-board/);
  assert.match(html, /data-learning-growth-board-filter="today"/);
  assert.match(html, /data-learning-growth-board-filter="waiting_ai"/);
  assert.match(html, /data-growth-board-active-lane="today"/);
  assert.match(html, /data-learning-growth-board-panel="today"/);
  assert.match(html, /data-learning-growth-board-panel="waiting_ai" hidden/);
  assert.match(html, /data-growth-board-lane="today"/);
  assert.match(html, /data-growth-board-lane="waiting_ai"/);
  assert.doesNotMatch(html, /learning-growth-board-lane-head/);
  assert.match(html, /Native board task/);
  assert.doesNotMatch(html, /<small>历史累计<\/small>/);
  assert.match(html, /<article class="learning-growth-board-card"[^>]+data-learning-open-growth-task="task-1"/);
  assert.match(html, /data-learning-open-growth-task="task-1"/);
  assert.match(html, /learning-growth-board-card-preview/);
  assert.match(html, /data-learning-open-growth-task="task-1"/);
  assert.match(html, /奖励 120 金币/);
  assert.match(html, /2026-05-20 09:30/);
  assert.doesNotMatch(html, /开放 2026-05-20 09:30/);
  assert.match(html, /data-directory-path-open/);
  assert.match(html, /data-learning-growth-artifact-link/);
  assert.match(html, /learning-growth-board-artifact-icon/);
  assert.match(html, /data-directory-path="C:\\Deliverables\\task-2"/);
  assert.match(html, /data-learning-open-growth-history="task-1"/);
  assert.match(html, /data-learning-open-growth-history="task-2"/);
  assert.doesNotMatch(html, /上限 120 金币|任务概览|学习任务/);
  assert.doesNotMatch(html, /提交作答|learning-growth-board-card-actions/);
  assert.doesNotMatch(html, /data-learning-growth-tabs/);
  assert.doesNotMatch(html, /data-learning-growth-tab="execution"/);
  assert.doesNotMatch(html, /data-learning-growth-tab="guidance"/);
  assert.doesNotMatch(html, /data-learning-growth-tab="coins"/);
  assert.doesNotMatch(html, /data-learning-growth-tab="config"/);
  assert.doesNotMatch(html, /data-learning-growth-tab="review"/);
  assert.doesNotMatch(html, /data-learning-growth-tab="system"/);
  assert.match(html, /执行者/);
  assert.match(html, /累计金币/);
  assert.match(html, /7日均值/);
  assert.match(html, /30日均值/);
  assert.doesNotMatch(html, /七日均值|三十日均值/);
  assert.match(html, />凡凡</);
  assert.match(html, />70</);
  assert.match(html, />10</);
  assert.match(html, />30</);
  assert.doesNotMatch(html, /70 金币|10 金币|历史累计/);
  assert.match(html, /aria-label="成长概览"/);
  assert.doesNotMatch(html, /凡凡成长系统|凡凡成长|成长看板/);
  assert.doesNotMatch(html, /<small>待执行<\/small>|<small>待处理<\/small>|<small>7d<\/small>|Owner/);
  assert.doesNotMatch(html, /class="learning-growth-metric-card"/);
  assert.doesNotMatch(html, /data-learning-growth-flow-step="attempt"/);
  assert.doesNotMatch(html, /data-learning-growth-category="execution"/);
  assert.doesNotMatch(html, /data-learning-growth-category="guidance"/);
  assert.doesNotMatch(html, /data-learning-growth-module="coins"/);
  assert.doesNotMatch(html, /data-learning-growth-category="parent-admin"/);
  assert.doesNotMatch(html, /data-learning-growth-category="owner-system"/);
  assert.doesNotMatch(html, /data-learning-operational-readiness/);
  assert.doesNotMatch(html, /data-learning-launch-operations/);
  assert.doesNotMatch(html, /data-learning-growth-capability="parent-review"/);
  assert.doesNotMatch(html, /data-learning-review-decision/);
  assert.doesNotMatch(html, /data-learning-evaluation-settle/);
  assert.doesNotMatch(html, /Owner|家长|后台与平台能力|learningRewardForm|人民币/);
  assert.doesNotMatch(html, /学习档案与目标录入/);
}

function testGrowthHistoryPageShowsRelatedSeriesCardsOnly() {
  const html = GrowthUi.renderLearningGrowthView({
    overview,
    coinsUi: CoinsUi,
    programUi: ProgramUi,
    state: { auth: { isOwner: false }, learningGrowthHistoryTaskCardId: "task-1" },
  });
  assert.match(html, /data-learning-growth-history-page="task-1"/);
  assert.match(html, /data-learning-growth-history-back/);
  assert.match(html, /data-learning-open-growth-task="task-1"/);
  assert.match(html, /data-learning-open-growth-task="task-2"/);
  assert.match(html, /Native board task/);
  assert.match(html, /Waiting task/);
  assert.match(html, /88 \u5206/);
  assert.doesNotMatch(html, /Write a short answer with a clear revision target/);
  assert.doesNotMatch(html, /data-learning-growth-board/);
}

function testGrowthBoardShowsEvergreenRewardDecayAndAge() {
  const html = GrowthUi.renderLearningGrowthBoard({
    lanes: [{ id: "today", title: "Today", count: 1, cards: ["evergreen-yellow"] }],
    cards: [{
      taskCardId: "evergreen-yellow",
      title: "Evergreen math",
      activityType: "math_reasoning",
      openedAt: "2026-05-20T08:00:00.000Z",
      rewardCapCoins: 100,
      rewardDecay: {
        applies: true,
        severity: "warning",
        ageLabel: "2d 1h",
        rewardCapCoins: 100,
        effectiveRewardCapCoins: 95,
        dailyPenaltyPercent: 5,
      },
    }],
  });
  assert.match(html, /learning-growth-board-card is-reward-warning/);
  assert.match(html, /\u5df2\u53d1\u5e03 2d 1h/);
  assert.match(html, /learning-growth-board-decay-rule is-warning/);
  assert.match(html, /\u53d1\u5e03 48 \u5c0f\u65f6\u540e\u6bcf\u65e5\u6263 5%/);
  assert.doesNotMatch(html, /\u5f00\u653e 2026-05-20/);
  assert.doesNotMatch(html, /95\/100/);
}

function testGrowthBoardShowsSettledCoinsOnCompletedCards() {
  const html = GrowthUi.renderLearningGrowthBoard({
    lanes: [{ id: "completed_recent", title: "Completed", count: 1, cards: ["done-card"] }],
    cards: [{
      taskCardId: "done-card",
      title: "Completed math",
      status: "completed",
      openedAt: "2026-05-20T08:00:00.000Z",
      rewardDecay: { ageLabel: "2d 1h" },
      latestRewardSettlement: {
        status: "settled",
        coinAmount: 88,
      },
    }],
  });
  assert.match(html, /data-learning-growth-board-card-reward="done-card"/);
  assert.match(html, /\u5df2\u5f97 88 \u91d1\u5e01/);
  assert.doesNotMatch(html, /\u5956\u52b1 100 \u91d1\u5e01/);
  assert.doesNotMatch(html, /2026-05-20 08:00/);
  assert.doesNotMatch(html, /\u5df2\u53d1\u5e03 2d 1h/);
}

function testGrowthRendererCanOpenBoardOnlyRevisionTask() {
  const boardOnlyOverview = JSON.parse(JSON.stringify(overview));
  boardOnlyOverview.board.lanes = [{ id: "needs_revision", title: "Needs revision", count: 1, cards: ["task-revise"] }];
  boardOnlyOverview.board.cards = [{
    taskCardId: "task-revise",
    title: "Revision only board task",
    instructionPreview: "Revise the first answer.",
    activityType: "math_reasoning",
    nextAction: "revise",
    laneId: "needs_revision",
    rewardCapCoins: 100,
    latestSubmission: {
      submissionId: "sub-revise",
      taskCardId: "task-revise",
      status: "submitted",
      submittedAt: "2026-05-21T09:00:00.000Z",
      displayText: "Q1: B because ratios match.",
      structuredResponses: [
        { questionId: "q1", type: "multiple_choice", title: "Question 1", choice: "B", reason: "The ratios match." },
        { questionId: "q3", type: "written", title: "Question 3", response: "I compare the favorable cases." },
      ],
    },
    latestEvaluation: {
      evaluationId: "eval-revise",
      taskCardId: "task-revise",
      status: "needs_repair",
      score: 68,
      summary: "Revise the explanation.",
      revisionRequirements: ["Add one complete reason."],
      feedbackSections: {
        focusAreas: ["Reason is too short."],
        rewriteChecklist: ["Explain q1 in one full sentence."],
        criterionFeedback: [{ dimension: "reasoning", observation: "The answer is too brief.", action: "Add the comparison." }],
      },
      createdAt: "2026-05-21T10:00:00.000Z",
    },
  }];
  boardOnlyOverview.programs.taskCards = [];
  boardOnlyOverview.programs.executableTasks = [];
  const html = GrowthUi.renderLearningGrowthView({
    overview: boardOnlyOverview,
    coinsUi: CoinsUi,
    growthTaskUi: GrowthTaskUi,
    programUi: ProgramUi,
    state: { auth: { isOwner: false }, selectedLearningTaskCardId: "task-revise" },
  });
  assert.match(html, /data-learning-growth-task-focus="task-revise"/);
  assert.match(html, /data-learning-growth-answer-card/);
  assert.match(html, /Revision only board task/);
  assert.match(html, /\u6700\u8fd1\u6279\u6539/);
  assert.match(html, /data-learning-growth-previous-submission/);
  assert.match(html, /The ratios match/);
  assert.match(html, /I compare the favorable cases/);
  assert.match(html, /data-learning-growth-feedback-detail/);
  assert.match(html, /Add one complete reason/);
  assert.match(html, /Explain q1 in one full sentence/);
  assert.match(html, /\u9700\u8981\u4fee\u6539\u540e\u518d\u63d0\u4ea4/);
  assert.doesNotMatch(html, /\u5df2\u63d0\u4ea4\uff0c\u7b49\u5f85 AI \u6279\u6539/);
  assert.match(html, /data-learning-growth-task-prompt-collapsed/);
  assert.doesNotMatch(html, /data-learning-native-growth-submission-form="task-revise"/);
  assert.doesNotMatch(html, /\u8fd9\u5f20\u4efb\u52a1\u5361\u5df2\u66f4\u65b0/);
}

function testGrowthSelectedTaskMergesBoardLatestEvaluation() {
  const mergedOverview = JSON.parse(JSON.stringify(overview));
  mergedOverview.programs.taskCards = [{
    taskCardId: "task-merge",
    title: "Merged task definition",
    status: "published",
    learnerInstruction: "Keep the full instruction from the task definition.",
    taskModel: {
      activityType: "math_reasoning",
      questionItems: [{ id: "q1", type: "written", prompt: "Show the long reasoning." }],
    },
  }];
  mergedOverview.programs.executableTasks = [{
    taskCardId: "task-merge",
    source: "learning-growth",
    status: "published",
    nativeState: { nextAction: "submit" },
  }];
  mergedOverview.board.lanes = [{ id: "needs_revision", title: "Needs revision", count: 1, cards: ["task-merge"] }];
  mergedOverview.board.cards = [{
    taskCardId: "task-merge",
    title: "Merged board task",
    laneId: "needs_revision",
    nextAction: "revise",
    primaryAction: "revise",
    latestSubmission: {
      submissionId: "sub-merge",
      taskCardId: "task-merge",
      status: "submitted",
      submittedAt: "2026-05-23T09:26:00.000Z",
      displayText: "summary only answer",
    },
    latestEvaluation: {
      evaluationId: "eval-merge",
      taskCardId: "task-merge",
      status: "needs_repair",
      score: 68,
      summary: "summary only feedback",
      revisionRequirements: ["Board latest repair requirement"],
      feedbackSections: {
        focusAreas: ["Board latest focus area"],
      },
      createdAt: "2026-05-23T09:28:00.000Z",
    },
  }];
  const html = GrowthUi.renderLearningGrowthView({
    overview: mergedOverview,
    coinsUi: CoinsUi,
    growthTaskUi: GrowthTaskUi,
    programUi: ProgramUi,
    state: { auth: { isOwner: false }, selectedLearningTaskCardId: "task-merge" },
  });
  assert.match(html, /Keep the full instruction from the task definition/);
  assert.match(html, /Board latest repair requirement/);
  assert.match(html, /Board latest focus area/);
  assert.match(html, /data-learning-growth-previous-submission/);
  assert.match(html, /\u9700\u8981\u4fee\u6539\u540e\u518d\u63d0\u4ea4/);
  assert.match(html, /data-learning-growth-task-prompt-collapsed/);
  assert.doesNotMatch(html, /data-learning-native-growth-question="q1"/);
  assert.doesNotMatch(html, /\u5df2\u63d0\u4ea4\uff0c\u7b49\u5f85 AI \u6279\u6539/);
}

function testGrowthRendererContainsProgramSubsystem() {
  const html = GrowthUi.renderLearningGrowthView({ overview, coinsUi: CoinsUi, programUi: ProgramUi, state: { auth: { isOwner: false } } });
  assert.match(html, /data-learning-growth-board-summary/);
  assert.doesNotMatch(html, /data-learning-growth-module="programs"/);
  assert.doesNotMatch(html, /data-learning-program-id="program-1"/);
  assert.doesNotMatch(html, /data-learning-task-card-id="task-1"/);
  assert.doesNotMatch(html, /data-learning-daily-plan/);
  assert.doesNotMatch(html, /data-learning-session-advance="session-1"/);
  assert.doesNotMatch(html, /data-learning-evaluation-form="session-1"/);
  assert.doesNotMatch(html, /data-learning-evaluation-summary="eval-1"/);
}

function testGrowthRendererShowsStandaloneTaskCardWhenSelected() {
  const html = GrowthUi.renderLearningGrowthView({
    overview,
    coinsUi: CoinsUi,
    programUi: ProgramUi,
    state: { auth: { isOwner: false }, selectedLearningTaskCardId: "task-1" },
  });
  assert.match(html, /data-learning-growth-task-focus="task-1"/);
  assert.doesNotMatch(html, /data-learning-close-growth-task/);
  assert.doesNotMatch(html, /\u8fd4\u56de\u770b\u677f/);
  assert.match(html, /data-learning-growth-answer-card/);
  assert.match(html, /data-learning-native-growth-submission-form="task-1"/);
  assert.match(html, /Task status/);
  assert.doesNotMatch(html, /data-learning-growth-board/);
  assert.doesNotMatch(html, /data-learning-growth-tabs/);
  assert.doesNotMatch(html, /data-learning-growth-module="coins"/);
}

function testGrowthRendererOpensLegacyTodoAsReadOnlyTask() {
  const legacyOverview = JSON.parse(JSON.stringify(overview));
  legacyOverview.programs.executableTasks = [{
    taskCardId: "legacy_todo:t_read_5",
    todoId: "t_read_5",
    kanbanCardId: "t_read_5",
    source: "official_kanban_migrated",
    readOnly: true,
    title: "Legacy reading 5/10",
    status: "published",
    workspaceId: "weixin_stephen",
    nativeState: { nextAction: "open", readOnly: true },
    instructionPreview: "Open original task details.",
  }];
  const html = GrowthUi.renderLearningGrowthView({
    overview: legacyOverview,
    coinsUi: CoinsUi,
    programUi: ProgramUi,
    state: { auth: { isOwner: false }, selectedLearningTaskCardId: "legacy_todo:t_read_5" },
  });
  assert.match(html, /data-learning-growth-task-focus="legacy_todo:t_read_5"/);
  assert.match(html, /data-learning-open-kanban-card="t_read_5"/);
  assert.match(html, /Open original task details/);
  assert.doesNotMatch(html, /data-learning-native-growth-submission-form="legacy_todo:t_read_5"/);
}

function testOwnerRendererKeepsBoardSeparateFromManagementSections() {
  const html = GrowthUi.renderLearningGrowthView({ overview, coinsUi: CoinsUi, programUi: ProgramUi, state: { auth: { isOwner: true } } });
  assert.match(html, /data-learning-role="owner"/);
  assert.match(html, /data-learning-growth-board-summary/);
  assert.match(html, /data-learning-growth-board/);
  assert.doesNotMatch(html, /data-learning-growth-owner-menu/);
  assert.doesNotMatch(html, /data-learning-growth-owner-entry/);
  assert.doesNotMatch(html, /data-learning-growth-owner-tools/);
  assert.doesNotMatch(html, /data-learning-growth-settings-page/);
  assert.doesNotMatch(html, /data-learning-growth-tabs/);
  assert.doesNotMatch(html, /data-learning-growth-tab="new-task"/);
  assert.doesNotMatch(html, /data-learning-growth-tab="settings"/);
  assert.doesNotMatch(html, /data-learning-growth-tab="ai-summary"/);
  assert.doesNotMatch(html, /data-learning-ai-summary-recommendations/);
  assert.doesNotMatch(html, /data-learning-growth-tab="reward-settlement"/);
  assert.doesNotMatch(html, /data-learning-growth-category="parent-admin"/);
  assert.doesNotMatch(html, /data-learning-program-create/);
  assert.doesNotMatch(html, /data-learning-launch-operations/);
  assert.doesNotMatch(html, /data-learning-evaluation-settle="eval-1"/);
  assert.doesNotMatch(html, /data-learning-reward-settlement-id="settle-1"/);
  assert.doesNotMatch(html, /data-learning-growth-tab="system"/);
  assert.doesNotMatch(html, /data-learning-growth-category="owner-system"/);
  assert.doesNotMatch(html, /data-learning-operational-readiness/);
  assert.doesNotMatch(html, /\u51e1\u51e1\u6210\u957f\u7cfb\u7edf|\u51e1\u51e1\u6210\u957f|\u6210\u957f\u770b\u677f|<small>7d<\/small>/);
}

function testOwnerRendererShowsIndependentSettingsPage() {
  const learningAiSummary = {
    generatedAt: "2026-05-21T09:20:00.000Z",
    analysisSummary: "Recent retell evidence suggests the next series should use longer reading material.",
    weakSignals: ["speaking_retell_depth"],
    recommendedSeries: [{
      id: "rec-1",
      title: "Longer reading retell sequence",
      rationale: "Increase reading duration before recording.",
      templateId: "english-speaking-retell-v1",
      skillId: "english_speaking_retell",
      sequenceMode: "evergreen_jit",
      recommendedReadingMinutes: 12,
      reward: { maxCoins: 100 },
    }],
    lastDraft: { programId: "program-ai-1", draftId: "draft-ai-1" },
  };
  const html = GrowthUi.renderLearningGrowthView({
    overview,
    coinsUi: CoinsUi,
    programUi: ProgramUi,
    state: { auth: { isOwner: true }, learningGrowthSettingsOpen: true, learningGrowthActiveTab: "ai-analysis", learningAiSummary },
  });
  assert.match(html, /data-learning-role="owner"/);
  assert.match(html, /data-learning-growth-settings-page/);
  assert.doesNotMatch(html, /data-learning-growth-close-settings/);
  assert.doesNotMatch(html, /\u8fd4\u56de\u770b\u677f/);
  assert.match(html, /data-learning-task-reward-policy-settings/);
  assert.match(html, /data-learning-task-reward-policy-series-form=/);
  assert.doesNotMatch(html, /data-learning-task-reward-policy-form="task-1"/);
  assert.match(html, /name="maxCoins"/);
  assert.doesNotMatch(html, /data-learning-growth-board-summary/);
  assert.doesNotMatch(html, /data-learning-growth-owner-menu/);
  assert.doesNotMatch(html, /data-learning-growth-owner-tools/);
  assert.match(html, /data-learning-growth-tabs/);
  assert.match(html, /data-learning-growth-tab="overview"/);
  assert.match(html, /data-learning-growth-tab="mastery"/);
  assert.match(html, /data-learning-growth-tab="tasks"/);
  assert.match(html, /data-learning-growth-tab="rewards"/);
  assert.match(html, /data-learning-growth-tab="ai-analysis"/);
  assert.match(html, /data-learning-growth-tab="ai-analysis" aria-selected="true" class="active"/);
  assert.match(html, /data-learning-growth-tab-panel="overview" role="tabpanel" hidden/);
  assert.match(html, /data-learning-growth-tab-panel="ai-analysis" role="tabpanel">\s*<section/);
  const overviewPanel = html.match(/data-learning-growth-tab-panel="overview"[\s\S]*?data-learning-growth-tab-panel="tasks"/)?.[0] || "";
  assert.match(overviewPanel, /is-owner-settings-summary/);
  assert.match(overviewPanel, /learning-launch-queue-compact/);
  assert.doesNotMatch(overviewPanel, /data-learning-growth-module="coins"/);
  assert.match(html, /data-learning-ai-summary-recommendations/);
  assert.match(html, /data-learning-ai-summary-refresh/);
  assert.match(html, /data-learning-ai-recommendation-draft="rec-1"/);
  assert.match(html, /english-speaking-retell-v1/);
  assert.match(html, /12/);
  assert.match(html, /data-learning-settings-task-list/);
  assert.match(html, /data-learning-settings-task-create/);
  const tasksPanel = html.match(/data-learning-growth-tab-panel="tasks"[\s\S]*?data-learning-growth-tab-panel="rewards"/)?.[0] || "";
  assert.match(tasksPanel, /data-learning-settings-fold/);
  assert.doesNotMatch(tasksPanel, /data-learning-ai-summary-recommendations/);
  assert.doesNotMatch(tasksPanel, /data-learning-growth-category="execution"/);
  const rewardsPanel = html.match(/data-learning-growth-tab-panel="rewards"[\s\S]*?data-learning-growth-tab-panel="ai-analysis"/)?.[0] || "";
  assert.match(rewardsPanel, /data-learning-settings-reward-stats/);
  assert.doesNotMatch(rewardsPanel, /data-learning-growth-module="coins"/);
  assert.match(html, /data-learning-growth-category="parent-admin"/);
  assert.match(html, /data-learning-program-create/);
  assert.match(html, /data-learning-launch-operations/);
  assert.match(html, /data-learning-launch-next-action="settle-learning-rewards"/);
  assert.match(html, /data-learning-reward-settlement-id="settle-1"/);
  assert.match(html, /data-learning-settings-reward-stats/);
  assert.doesNotMatch(html, /data-learning-growth-tab="system"/);
  assert.doesNotMatch(html, /data-learning-growth-category="owner-system"/);
  assert.doesNotMatch(html, /data-learning-operational-readiness/);
  assert.doesNotMatch(html, /\u51e1\u51e1\u6210\u957f\u7cfb\u7edf|\u51e1\u51e1\u6210\u957f|\u6210\u957f\u770b\u677f|<small>7d<\/small>/);
}

function testOwnerSettingsShowsMasteryProfileTab() {
  const masteryProfile = {
    ok: true,
    masteryProfile: {
      taxonomyVersion: "taxonomy-v1",
      skillStates: [
        {
          skillId: "english.writing.claim_reason_example",
          displayName: "Claim, reason, example writing",
          summary: "Builds a clear opinion, reason, and example.",
          domain: "english",
          strand: "writing",
          status: "mastered",
          confidence: 0.88,
          evidenceCount: 4,
          strengths: ["Claim, reason, example writing"],
          nextRecommendation: { strategy: "stretch" },
        },
        {
          skillId: "english.speaking.retell_structure",
          domain: "english",
          strand: "speaking",
          status: "needs_repair",
          confidence: 0.86,
          evidenceCount: 3,
          weaknesses: ["Retell structure"],
          nextRecommendation: { strategy: "repair" },
        },
        {
          skillId: "science.practices.explanation_from_evidence",
          displayName: "Scientific explanation from evidence",
          summary: "Connects observations to a scientific claim.",
          domain: "science",
          strand: "practices",
          status: "not_observed",
          confidence: 0,
          evidenceCount: 0,
          nextRecommendation: { strategy: "observe" },
        },
      ],
      domainSummary: [
        { domain: "english", total: 2, observed: 2, mastered: 1, needsRepair: 1 },
        { domain: "science", total: 1, observed: 0, mastered: 0, needsRepair: 0 },
      ],
      strengths: [{ skillId: "english.writing.claim_reason_example" }],
      weaknesses: [{ skillId: "english.speaking.retell_structure" }],
    },
    trajectory: [{ sequenceGroupId: "series-1" }],
  };
  const html = GrowthUi.renderLearningGrowthView({
    overview,
    coinsUi: CoinsUi,
    programUi: ProgramUi,
    masteryProfile,
    state: { auth: { isOwner: true }, learningGrowthSettingsOpen: true, learningGrowthActiveTab: "mastery" },
  });
  assert.match(html, /data-learning-growth-tab="mastery" aria-selected="true" class="active"/);
  assert.match(html, /data-learning-growth-tab-panel="mastery" role="tabpanel">\s*<section class="learning-coin-panel learning-mastery-profile-panel"/);
  assert.match(html, /data-learning-mastery-profile-panel/);
  assert.match(html, /data-learning-mastery-domain="english"/);
  assert.match(html, /data-learning-mastery-domain="science"/);
  assert.match(html, /Scientific explanation from evidence/);
  assert.match(html, /未观察/);
  assert.match(html, /data-learning-mastery-skill="english\.writing\.claim_reason_example"/);
  assert.match(html, /data-learning-mastery-status="needs_repair"/);
  assert.match(html, /taxonomy-v1/);
}

function testOwnerSettingsTaskDetailStaysInsideSettingsPage() {
  const html = GrowthUi.renderLearningGrowthView({
    overview,
    coinsUi: CoinsUi,
    programUi: ProgramUi,
    state: {
      auth: { isOwner: true },
      learningGrowthSettingsOpen: true,
      learningGrowthActiveTab: "tasks",
      learningGrowthSettingsTaskId: "task-1",
    },
  });
  assert.match(html, /data-learning-growth-settings-page/);
  assert.match(html, /data-learning-settings-task-detail/);
  assert.match(html, /data-learning-settings-task-back/);
  assert.match(html, /Task status/);
  assert.match(html, /已生成/);
  assert.match(html, /后续建议/);
  assert.doesNotMatch(html, /data-learning-growth-task-focus/);
  assert.doesNotMatch(html, /data-learning-open-growth-task="task-1"/);
}

function testReadinessPanelRenderer() {
  const html = GrowthUi.renderReadinessPanel(overview.operationalReadiness);
  assert.match(html, /data-learning-operational-readiness/);
  assert.match(html, /data-learning-readiness-check="sqlite-learning-domain"/);
  assert.match(html, /100%/);
}

testCoinSubsystemRendererIsStandalone();
testExecutorCoinSubsystemHidesOwnerSettlementDetails();
testGrowthRendererContainsProductShellAndNestedCoins();
testGrowthHistoryPageShowsRelatedSeriesCardsOnly();
testGrowthBoardShowsEvergreenRewardDecayAndAge();
testGrowthBoardShowsSettledCoinsOnCompletedCards();
testGrowthRendererCanOpenBoardOnlyRevisionTask();
testGrowthSelectedTaskMergesBoardLatestEvaluation();
testGrowthRendererContainsProgramSubsystem();
testGrowthRendererShowsStandaloneTaskCardWhenSelected();
testGrowthRendererOpensLegacyTodoAsReadOnlyTask();
testOwnerRendererKeepsBoardSeparateFromManagementSections();
testOwnerRendererShowsIndependentSettingsPage();
testOwnerSettingsShowsMasteryProfileTab();
testOwnerSettingsTaskDetailStaysInsideSettingsPage();
testReadinessPanelRenderer();

console.log("app learning growth ui tests passed");
