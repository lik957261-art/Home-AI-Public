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
        { taskCardId: "task-ready", title: "Ready", status: "published", plannedDate: "2026-05-20", taskModel: { skillId: "english_short_writing" } },
        { taskCardId: "task-ai", title: "Waiting", status: "published" },
        { taskCardId: "task-reflect", title: "Reflect", status: "published" },
        { taskCardId: "task-done", title: "Done", status: "completed" },
      ],
      taskSubmissions: [
        { submissionId: "sub-ai", taskCardId: "task-ai", status: "submitted", textDigest: "digest", submittedAt: "2026-05-20T08:00:00.000Z" },
      ],
      evaluations: [
        { evaluationId: "eval-reflect", taskCardId: "task-reflect", status: "reflection_required", score: 84, passed: true, summary: "summary", createdAt: "2026-05-20T08:01:00.000Z" },
        { evaluationId: "eval-done", taskCardId: "task-done", status: "passed", score: 91, passed: true, summary: "summary", createdAt: "2026-05-20T08:02:00.000Z" },
      ],
      taskReflections: [
        { reflectionId: "refl-done", taskCardId: "task-done", status: "accepted", summary: "understood", submittedAt: "2026-05-20T08:03:00.000Z" },
      ],
      taskArtifacts: [
        { artifactId: "art-1", taskCardId: "task-reflect", artifactType: "feedback_report", name: "report.md", mime: "text/markdown", size: 12, status: "available", refDigest: "abc" },
      ],
      learnerProfile: { profileSummary: "profile summary" },
      skillStates: [{ skillId: "grammar", confidence: 0.42, summary: "weak" }],
      parentReviewRequests: [{ reviewRequestId: "review-1" }],
      rewardSettlements: [{ rewardSettlementId: "settle-1" }],
      reviewItems: [{ reviewId: "item-1" }],
    },
  };
}

function testBoardClassifiesNativeTasksIntoLanes() {
  const board = buildLearningGrowthBoard({ overview: overview(), today: "2026-05-20" });
  const laneById = new Map(board.lanes.map((lane) => [lane.id, lane]));
  assert.ok(laneById.get("today").cards.includes("task-ready"));
  assert.ok(laneById.get("waiting_ai").cards.includes("task-ai"));
  assert.ok(laneById.get("reflection_required").cards.includes("task-reflect"));
  assert.ok(laneById.get("completed_recent").cards.includes("task-done"));
  const reflectCard = board.cards.find((card) => card.taskCardId === "task-reflect");
  assert.equal(reflectCard.primaryAction, "reflect");
  assert.equal(reflectCard.actions.canReflect, true);
  assert.equal(reflectCard.artifactPreview[0].name, "report.md");
  assert.equal(JSON.stringify(board).includes("refDigest"), false);
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
  assert.equal(result.board.summary.cardCount, 4);
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

testBoardClassifiesNativeTasksIntoLanes();
testBoardKeepsOwnerPanelOwnerOnly();
testServiceUsesOverviewWithoutKanbanProvider();
testBoardShowsOnlyCurrentFutureSequenceTask();
testBoardGroupsDuplicateDraftsByProgram();
testBoardProjectsLegacyTodosAsReadOnlyOpenTasks();
console.log("learning growth board projection service tests passed");
