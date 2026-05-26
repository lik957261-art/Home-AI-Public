"use strict";

const assert = require("node:assert/strict");
const {
  buildLearningGrowthBoard,
  createLearningGrowthBoardProjectionService,
} = require("../adapters/learning-growth-board-projection-service");

function overview() {
  return {
    viewerRole: "owner",
    learner: { id: "weixin_stephen", workspaceId: "weixin_stephen", displayName: "Fanfan" },
    metrics: { availableCoins: 120, pendingRedemptions: 1 },
    coins: { balances: { availableCoins: 120 }, growth: { activeDaysInLast7: 3 }, rewards: [], redemptions: [{ id: "redeem-1" }] },
    programs: {
      executableTasks: [
        { taskCardId: "task-ready", title: "Ready", status: "published", plannedDate: "2026-05-20", createdAt: "2026-05-20T07:30:00.000Z", taskModel: { skillId: "english_short_writing" } },
        { taskCardId: "task-ai", title: "Waiting", status: "published" },
        { taskCardId: "task-draft-feedback", title: "Draft feedback", status: "published" },
        { taskCardId: "task-reflect", title: "Reflect", status: "published", artifactDirectoryPath: "C:\\Deliverables\\task-reflect" },
        { taskCardId: "task-done", title: "Done", status: "completed" },
      ],
      taskSubmissions: [
        { submissionId: "sub-ai", taskCardId: "task-ai", status: "submitted", textDigest: "digest", submittedAt: "2026-05-20T08:00:00.000Z" },
        { submissionId: "sub-ai-2", taskCardId: "task-ai", status: "submitted", textDigest: "digest-2", submittedAt: "2026-05-20T08:05:00.000Z" },
      ],
      evaluations: [
        { evaluationId: "eval-reflect-old", taskCardId: "task-reflect", status: "needs_repair", score: 62, passed: false, summary: "old summary", createdAt: "2026-05-20T07:59:00.000Z" },
        { evaluationId: "eval-reflect", taskCardId: "task-reflect", status: "reflection_required", score: 84, passed: true, summary: "summary", createdAt: "2026-05-20T08:01:00.000Z" },
        { evaluationId: "eval-draft-feedback", taskCardId: "task-draft-feedback", status: "draft_feedback", nextStep: "rewrite_and_reflect", score: 90, passed: false, summary: "draft feedback ready", createdAt: "2026-05-20T08:01:30.000Z" },
        { evaluationId: "eval-done", taskCardId: "task-done", status: "passed", score: 91, passed: true, summary: "summary", createdAt: "2026-05-20T08:02:00.000Z" },
      ],
      taskReflections: [
        { reflectionId: "refl-done", taskCardId: "task-done", status: "accepted", summary: "understood", submittedAt: "2026-05-20T08:03:00.000Z" },
      ],
      taskArtifacts: [
        { artifactId: "art-1", taskCardId: "task-reflect", artifactType: "feedback_report", name: "report.md", mime: "text/markdown", size: 12, status: "available", refDigest: "abc", path: "C:\\Deliverables\\task-reflect\\report.md" },
      ],
      learnerProfile: { profileSummary: "profile summary" },
      skillStates: [{ skillId: "grammar", confidence: 0.42, summary: "weak" }],
      parentReviewRequests: [{ reviewRequestId: "review-1" }],
      rewardSettlements: [{
        rewardSettlementId: "settle-1",
        taskCardId: "task-done",
        evaluationId: "eval-done",
        status: "settled",
        coinAmount: 88,
        reason: "owner_manual_pass",
        settledAt: "2026-05-20T08:04:00.000Z",
      }],
      reviewItems: [{ reviewId: "item-1" }],
    },
  };
}

function testBoardClassifiesNativeTasksIntoLanes() {
  const board = buildLearningGrowthBoard({ overview: overview(), today: "2026-05-20" });
  const laneById = new Map(board.lanes.map((lane) => [lane.id, lane]));
  assert.ok(laneById.get("today").cards.includes("task-ready"));
  assert.ok(laneById.get("waiting_ai").cards.includes("task-ai"));
  assert.ok(laneById.get("needs_revision").cards.includes("task-draft-feedback"));
  assert.ok(laneById.get("reflection_required").cards.includes("task-reflect"));
  assert.ok(laneById.get("completed_recent").cards.includes("task-done"));
  const reflectCard = board.cards.find((card) => card.taskCardId === "task-reflect");
  assert.equal(reflectCard.source, "learning-growth");
  assert.equal(reflectCard.primaryAction, "reflect");
  assert.equal(reflectCard.actions.canReflect, true);
  assert.equal(reflectCard.evaluationCount, 2);
  assert.equal(reflectCard.totalEvaluationCount, 2);
  assert.equal(reflectCard.latestEvaluation.evaluationId, "eval-reflect");
  assert.equal(reflectCard.latestEvaluation.totalEvaluationCount, 2);
  assert.equal(reflectCard.artifactPreview[0].name, "report.md");
  assert.equal(reflectCard.artifactDirectoryPath, "C:\\Deliverables\\task-reflect");
  const waitingCard = board.cards.find((card) => card.taskCardId === "task-ai");
  assert.equal(waitingCard.submissionCount, 2);
  assert.equal(waitingCard.latestSubmission.submissionId, "sub-ai-2");
  assert.equal(waitingCard.latestSubmission.totalSubmissionCount, 2);
  const draftFeedbackCard = board.cards.find((card) => card.taskCardId === "task-draft-feedback");
  assert.equal(draftFeedbackCard.nextAction, "revise");
  assert.equal(draftFeedbackCard.primaryAction, "revise");
  assert.equal(draftFeedbackCard.actions.canSubmit, true);
  assert.equal(board.cards.find((card) => card.taskCardId === "task-ready").rewardCapCoins, 100);
  assert.equal(board.cards.find((card) => card.taskCardId === "task-ready").openedAt, "2026-05-20T07:30:00.000Z");
  const doneCard = board.cards.find((card) => card.taskCardId === "task-done");
  assert.equal(doneCard.latestRewardSettlement.status, "settled");
  assert.equal(doneCard.latestRewardSettlement.coinAmount, 88);
  assert.equal(JSON.stringify(board).includes("refDigest"), false);
}

function testCompletedLaneSortsByCompletedTimeDescending() {
  const source = overview();
  const completedOverview = Object.assign({}, source, {
    programs: Object.assign({}, source.programs, {
      executableTasks: [
        { taskCardId: "done-old", sequenceGroupId: "done-old", title: "Old", status: "completed", completedAt: "2026-05-20T08:00:00.000Z" },
        { taskCardId: "done-new", sequenceGroupId: "done-new", title: "New", status: "completed", completedAt: "2026-05-20T10:00:00.000Z" },
        { taskCardId: "done-mid", sequenceGroupId: "done-mid", title: "Mid", status: "completed", completedAt: "2026-05-20T09:00:00.000Z" },
      ],
      taskSubmissions: [],
      evaluations: [],
      taskReflections: [],
      taskArtifacts: [],
    }),
  });
  const board = buildLearningGrowthBoard({ overview: completedOverview, today: "2026-05-20" });
  const completed = board.lanes.find((lane) => lane.id === "completed_recent");
  assert.deepEqual(completed.cards, ["done-new", "done-mid", "done-old"]);
}

function testBoardDerivesArtifactDirectoryForHistoricalCounts() {
  const source = overview();
  const historicalOverview = Object.assign({}, source, {
    programs: Object.assign({}, source.programs, {
      executableTasks: [
        { taskCardId: "task-history", title: "History", status: "completed", workspaceId: "weixin_stephen", artifactCount: 2 },
      ],
      taskSubmissions: [],
      evaluations: [],
      taskReflections: [],
      taskArtifacts: [],
    }),
  });
  const board = buildLearningGrowthBoard({
    overview: historicalOverview,
    today: "2026-05-20",
  });
  assert.equal(board.cards[0].artifactDirectoryPath, "");
}

function testServiceUsesPersistedTaskArtifactDirectory() {
  const service = createLearningGrowthBoardProjectionService({
    learningGrowthService: {
      overview(input) {
        return Object.assign({}, overview(), {
          programs: {
            executableTasks: [{
              taskCardId: "task-service",
              title: "Service",
              status: "completed",
              workspaceId: input.workspaceId,
              artifactCount: 1,
              artifactDirectoryPath: `C:\\${input.workspaceId}\\learning-growth\\task-service`,
            }],
            taskSubmissions: [],
            evaluations: [],
            taskReflections: [],
            taskArtifacts: [],
          },
        });
      },
    },
  });
  const result = service.board({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen" });
  assert.equal(result.board.cards[0].artifactDirectoryPath, "C:\\weixin_stephen\\learning-growth\\task-service");
}

function testBoardKeepsOwnerPanelOwnerOnly() {
  const ownerBoard = buildLearningGrowthBoard({ overview: overview(), today: "2026-05-20" });
  assert.equal(ownerBoard.ownerPanel.parentReviewCount, 1);
  const executorOverview = Object.assign({}, overview(), { viewerRole: "executor" });
  const executorBoard = buildLearningGrowthBoard({ overview: executorOverview, today: "2026-05-20" });
  assert.equal(executorBoard.ownerPanel, undefined);
}

function testServiceUsesOverviewWithoutKanbanProvider() {
  const inputs = [];
  const service = createLearningGrowthBoardProjectionService({
    learningGrowthService: {
      overview(input) {
        inputs.push(input);
        return overview();
      },
    },
    clock: { now: () => Date.parse("2026-05-20T09:00:00.000Z") },
  });
  const result = service.board({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen", limit: 5 });
  assert.equal(result.board.summary.cardCount, 5);
  assert.equal(inputs[0].limit, 80);
}

function testBoardShowsOnlyCurrentFutureSequenceTask() {
  const sequenceOverview = Object.assign({}, overview(), {
    programs: Object.assign({}, overview().programs, {
      executableTasks: [
        { taskCardId: "seq-1", programId: "program-1", draftId: "draft-1", sequenceIndex: 1, title: "Completed first", status: "completed", plannedDate: "2026-05-19" },
        { taskCardId: "seq-2", programId: "program-1", draftId: "draft-1", sequenceIndex: 2, title: "Current second", status: "published", plannedDate: "2026-05-20" },
        { taskCardId: "seq-3", programId: "program-1", draftId: "draft-1", sequenceIndex: 3, title: "Future third", status: "published", plannedDate: "2026-05-21" },
      ],
      taskSubmissions: [],
      evaluations: [],
      taskReflections: [],
      taskArtifacts: [],
    }),
  });
  const board = buildLearningGrowthBoard({ overview: sequenceOverview, today: "2026-05-20" });
  assert.deepEqual(board.cards.map((card) => card.taskCardId), ["seq-1", "seq-2"]);
  assert.equal(board.cards.find((card) => card.taskCardId === "seq-2").sequenceVisibility, "current");
  assert.equal(board.summary.totalCardCount, 3);
  assert.equal(board.summary.visibleCardCount, 2);
  assert.equal(board.summary.hiddenFutureCardCount, 1);
  assert.equal(board.summary.sequencePolicy, "current_card_only_then_unlock_next");
}

function testBoardPrefersFullNativeTaskMetadataOverExecutorSummary() {
  const sequenceOverview = Object.assign({}, overview(), {
    programs: Object.assign({}, overview().programs, {
      executableTasks: [
        {
          taskCardId: "native-retell-1",
          programId: "program-retell",
          title: "Executor summary",
          status: "published",
          plannedDate: "2026-05-20",
          createdAt: "2026-05-20T06:00:00.000Z",
        },
      ],
      taskCards: [
        {
          taskCardId: "native-retell-1",
          programId: "program-retell",
          sequenceGroupId: "evergreen:english-random-reading-retell",
          sequenceIndex: 1,
          title: "Full native retell",
          status: "published",
          plannedDate: "2026-05-20",
          learningGrowthJitGeneration: { generatedAt: "2026-05-20T09:00:00.000Z" },
          learnerInstruction: "Read a new short passage and retell the main idea with two accurate details.",
        },
      ],
      taskSubmissions: [],
      evaluations: [],
      taskReflections: [],
      taskArtifacts: [],
    }),
  });
  const board = buildLearningGrowthBoard({ overview: sequenceOverview, today: "2026-05-20" });
  assert.equal(board.cards.length, 1);
  assert.equal(board.cards[0].taskCardId, "native-retell-1");
  assert.equal(board.cards[0].title, "Full native retell \u00b7 \u7b2c1\u5f20\u5361");
  assert.equal(board.cards[0].sequenceGroupId, "evergreen:english-random-reading-retell");
  assert.equal(board.cards[0].sequenceIndex, 1);
  assert.equal(board.cards[0].rewardCapCoins, 100);
  assert.equal(board.cards[0].openedAt, "2026-05-20T09:00:00.000Z");
  assert.match(board.cards[0].instructionPreview, /short passage/);
}

function testBoardMarksEvergreenRewardDecayAfterThresholds() {
  const sequenceOverview = Object.assign({}, overview(), {
    programs: Object.assign({}, overview().programs, {
      taskCards: [
        {
          taskCardId: "evergreen-yellow",
          sequenceGroupId: "evergreen:math",
          sequenceMode: "evergreen_jit",
          sequenceIndex: 1,
          title: "Math current",
          status: "published",
          createdAt: "2026-05-20T08:00:00.000Z",
          plannedDate: "2026-05-20",
          rewardCapCoins: 100,
          rewardPolicy: { maxCoins: 100 },
        },
      ],
      executableTasks: [],
      taskSubmissions: [],
      evaluations: [],
      taskReflections: [],
      taskArtifacts: [],
    }),
  });
  const yellowBoard = buildLearningGrowthBoard({
    overview: sequenceOverview,
    today: "2026-05-22",
    nowIso: "2026-05-22T09:00:00.000Z",
  });
  const yellow = yellowBoard.cards[0].rewardDecay;
  assert.equal(yellow.severity, "warning");
  assert.equal(yellow.ageHours, 49);
  assert.equal(yellow.dailyPenaltyPercent, 5);
  assert.equal(yellow.effectiveRewardCapCoins, 95);

  const redBoard = buildLearningGrowthBoard({
    overview: sequenceOverview,
    today: "2026-05-23",
    nowIso: "2026-05-23T09:00:00.000Z",
  });
  const red = redBoard.cards[0].rewardDecay;
  assert.equal(red.severity, "danger");
  assert.equal(red.ageHours, 73);
  assert.equal(red.dailyPenaltyPercent, 10);
  assert.equal(red.effectiveRewardCapCoins, 90);
}

function testBoardGroupsDuplicateDraftsByProgram() {
  const sequenceOverview = Object.assign({}, overview(), {
    programs: Object.assign({}, overview().programs, {
      executableTasks: [
        {
          taskCardId: "draft-a-current",
          programId: "program-1",
          draftId: "draft-a",
          sequenceIndex: 1,
          title: "Writing A",
          status: "published",
          learnerInstruction: "Write a short answer with a clear beginning, middle, and ending.",
          plannedDate: "2026-05-20",
        },
        {
          taskCardId: "draft-b-current",
          programId: "program-1",
          draftId: "draft-b",
          sequenceIndex: 1,
          title: "Writing B",
          status: "published",
          plannedDate: "2026-05-20",
        },
        {
          taskCardId: "draft-c-current",
          programId: "program-1",
          draftId: "draft-c",
          sequenceIndex: 1,
          title: "Writing C",
          status: "published",
          plannedDate: "2026-05-20",
        },
      ],
      taskSubmissions: [],
      evaluations: [],
      taskReflections: [],
      taskArtifacts: [],
    }),
  });
  const board = buildLearningGrowthBoard({ overview: sequenceOverview, today: "2026-05-20" });
  assert.deepEqual(board.cards.map((card) => card.taskCardId), ["draft-a-current"]);
  assert.equal(board.cards[0].sequenceGroupId, "program:program-1");
  assert.match(board.cards[0].instructionPreview, /clear beginning/);
  assert.equal(board.summary.totalCardCount, 3);
  assert.equal(board.summary.visibleCardCount, 1);
  assert.equal(board.summary.hiddenFutureCardCount, 2);
}

function testBoardProjectsLegacyTodosAsReadOnlyOpenTasks() {
  const sequenceOverview = Object.assign({}, overview(), {
    programs: Object.assign({}, overview().programs, {
      executableTasks: [
        {
          taskCardId: "legacy_todo:t_read_5",
          todoId: "t_read_5",
          source: "official_kanban_migrated",
          readOnly: true,
          programId: "legacy-reading-retell",
          sequenceGroupId: "legacy-reading-retell",
          sequenceIndex: 5,
          title: "Legacy reading 5/10",
          status: "published",
          activityType: "speaking",
          instructionPreview: "Open original task details.",
          workspaceId: "weixin_stephen",
          nativeState: { nextAction: "open", readOnly: true },
        },
      ],
      taskSubmissions: [],
      evaluations: [],
      taskReflections: [],
      taskArtifacts: [],
    }),
  });
  const board = buildLearningGrowthBoard({ overview: sequenceOverview, today: "2026-05-20" });
  assert.equal(board.cards.length, 1);
  assert.equal(board.cards[0].source, "official_kanban_migrated");
  assert.equal(board.cards[0].todoId, "t_read_5");
  assert.equal(board.cards[0].readOnly, true);
  assert.equal(board.cards[0].laneId, "ready");
  assert.equal(board.cards[0].primaryAction, "open");
  assert.equal(board.cards[0].actions.canSubmit, false);
  assert.equal(board.cards[0].instructionPreview, "Open original task details.");
}

function testBoardShowsLockedCurrentCardBeforeCompletionWindow() {
  const sequenceOverview = Object.assign({}, overview(), {
    programs: Object.assign({}, overview().programs, {
      executableTasks: [
        {
          taskCardId: "seq-locked",
          programId: "program-1",
          sequenceIndex: 1,
          title: "Tomorrow task",
          status: "published",
          plannedDate: "2026-05-21",
          nextCompletionAllowedAt: "2026-05-21T08:00:00.000Z",
        },
      ],
      taskSubmissions: [],
      evaluations: [],
      taskReflections: [],
      taskArtifacts: [],
    }),
  });
  const board = buildLearningGrowthBoard({
    overview: sequenceOverview,
    today: "2026-05-20",
    nowIso: "2026-05-20T09:00:00.000Z",
  });
  const card = board.cards[0];
  assert.equal(card.laneId, "locked_until");
  assert.equal(card.title, "Tomorrow task");
  assert.equal(card.nextAction, "locked_until");
  assert.equal(card.primaryAction, "locked");
  assert.equal(card.actions.canSubmit, false);
  assert.equal(card.nextCompletionAllowedAt, "2026-05-21T08:00:00.000Z");
  assert.ok(board.lanes.find((lane) => lane.id === "locked_until").cards.includes("seq-locked"));
}

function testBoardAppendsEvergreenSequenceIndexToRepeatedTitles() {
  const sequenceOverview = Object.assign({}, overview(), {
    programs: Object.assign({}, overview().programs, {
      executableTasks: [
        {
          taskCardId: "seq-evergreen-2",
          programId: "program-1",
          sequenceGroupId: "evergreen:math",
          sequenceMode: "evergreen_jit",
          sequenceIndex: 2,
          title: "Math reasoning 1",
          status: "published",
          plannedDate: "2026-05-20",
        },
      ],
      taskSubmissions: [],
      evaluations: [],
      taskReflections: [],
      taskArtifacts: [],
    }),
  });
  const board = buildLearningGrowthBoard({ overview: sequenceOverview, today: "2026-05-20" });
  assert.equal(board.cards[0].sequenceIndex, 2);
  assert.equal(board.cards[0].title, "Math reasoning \u00b7 \u7b2c2\u5f20\u5361");
}

function testBoardShowsFirstEvergreenCardNumberWithoutStoredOrdinal() {
  const sequenceOverview = Object.assign({}, overview(), {
    programs: Object.assign({}, overview().programs, {
      executableTasks: [
        {
          taskCardId: "seq-evergreen-1",
          programId: "program-1",
          sequenceGroupId: "evergreen:english-retell",
          sequenceMode: "evergreen_jit",
          sequenceIndex: 1,
          title: "Evergreen English Random Reading Retell 001",
          status: "published",
          plannedDate: "2026-05-20",
        },
      ],
      taskSubmissions: [],
      evaluations: [],
      taskReflections: [],
      taskArtifacts: [],
    }),
  });
  const board = buildLearningGrowthBoard({ overview: sequenceOverview, today: "2026-05-20" });
  assert.equal(board.cards[0].title, "Evergreen English Random Reading Retell \u00b7 \u7b2c1\u5f20\u5361");
}

function testBoardFiltersRetiredAndCancelledTasks() {
  const sequenceOverview = Object.assign({}, overview(), {
    programs: Object.assign({}, overview().programs, {
      taskCards: [
        { taskCardId: "task-cancelled", title: "Cancelled", status: "cancelled", plannedDate: "2026-05-20" },
        { taskCardId: "task-retired", title: "Retired", status: "retired", plannedDate: "2026-05-20" },
        { taskCardId: "task-current", title: "Current", status: "published", plannedDate: "2026-05-20" },
      ],
      executableTasks: [],
      taskSubmissions: [],
      evaluations: [],
      taskReflections: [],
      taskArtifacts: [],
    }),
  });
  const board = buildLearningGrowthBoard({ overview: sequenceOverview, today: "2026-05-20" });
  assert.deepEqual(board.cards.map((card) => card.taskCardId), ["task-current"]);
  assert.equal(board.summary.totalCardCount, 1);
}

testBoardClassifiesNativeTasksIntoLanes();
testCompletedLaneSortsByCompletedTimeDescending();
testBoardDerivesArtifactDirectoryForHistoricalCounts();
testServiceUsesPersistedTaskArtifactDirectory();
testBoardKeepsOwnerPanelOwnerOnly();
testServiceUsesOverviewWithoutKanbanProvider();
testBoardShowsOnlyCurrentFutureSequenceTask();
testBoardPrefersFullNativeTaskMetadataOverExecutorSummary();
testBoardMarksEvergreenRewardDecayAfterThresholds();
testBoardGroupsDuplicateDraftsByProgram();
testBoardProjectsLegacyTodosAsReadOnlyOpenTasks();
testBoardShowsLockedCurrentCardBeforeCompletionWindow();
testBoardAppendsEvergreenSequenceIndexToRepeatedTitles();
testBoardShowsFirstEvergreenCardNumberWithoutStoredOrdinal();
testBoardFiltersRetiredAndCancelledTasks();
console.log("learning growth board projection service tests passed");
