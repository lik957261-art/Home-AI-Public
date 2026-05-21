"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const {
  createKanbanStudyPlanService,
  normalizeWorkspaceIdList,
  safeDirectoryName,
  summarizeCardStatuses,
} = require("../adapters/kanban-study-plan-service");

function makeService(overrides = {}) {
  const existingPaths = new Set(overrides.existingPaths || []);
  return createKanbanStudyPlanService(Object.assign({
    maxSessions: 5,
    now: () => new Date(2026, 4, 15, 9, 30, 0, 0),
    createCaseId: () => "study-plan-fixed",
    findWorkspace: (workspaceId) => ["owner", "learner", "viewer", "manager"].includes(workspaceId),
    pathExists: (value) => existingPaths.has(value),
    sharedFolderName: "study-plan",
  }, overrides));
}

function testScheduleNormalization() {
  const service = makeService();
  assert.equal(service.normalizeReadingPlanTime("7:5"), "07:05");
  assert.equal(service.normalizeReadingPlanTime("bad"), "21:00");
  assert.equal(service.normalizeReadingPlanStartDate("2026-5-7"), "2026-05-07");
  assert.equal(service.normalizeReadingPlanStartDate("bad"), "2026-05-15");

  const weekly = service.normalizeStudyPlanSchedule({
    frequency: "weekly",
    weekdays: "mon, wed, 7, mon",
  }, "2026-05-15", "08:00");
  assert.equal(weekly.frequency, "weekly");
  assert.deepEqual(weekly.weekdays, [0, 1, 3]);
  assert.deepEqual(weekly.weekdaysOneBased, [7, 1, 3]);
  assert.equal(weekly.label, "weekly Sun, Mon, Wed");
  assert.equal(service.readingPlanScheduleDueTime(weekly, 0), "2026-05-17 08:00");
  assert.equal(service.readingPlanScheduleDueTime(weekly, 2), "2026-05-20 08:00");

  const monthly = service.normalizeStudyPlanSchedule({ frequency: "monthly", monthDay: 31 }, "2026-01-31", "20:30");
  assert.equal(service.readingPlanScheduleDueTime(monthly, 1), "2026-02-28 20:30");
}

function testStudyPlanNormalizationAndPayloadsDoNotNeedSideEffects() {
  const service = makeService();
  const plan = service.normalizeStudyPlan({
    template: "reading",
    contentTitle: "Short Stories",
    learnerName: "Learner A",
    subject: "English",
    sessions: 3,
    startDate: "2026-05-15",
    timeOfDay: "19:15",
    scheduleFrequency: "daily",
    performerWorkspaceIds: "learner owner learner missing",
    viewerWorkspaceIds: ["viewer", "learner", "missing"],
    sourceText: "private instructions fixture",
  }, "owner");

  assert.equal(plan.id, "study-plan-fixed");
  assert.equal(plan.template, "reading");
  assert.equal(plan.sessions, 3);
  assert.deepEqual(plan.performerWorkspaceIds, ["learner"]);
  assert.deepEqual(plan.viewerWorkspaceIds, ["viewer"]);
  assert.equal(plan.cards.length, 3);
  assert.deepEqual(plan.cards.map((card) => card.dueTime), [
    "2026-05-15 19:15",
    "2026-05-16 19:15",
    "2026-05-17 19:15",
  ]);

  const payloads = service.buildStudyPlanCardPayloads(plan, { assignee: "principal-learner" });
  assert.equal(payloads.length, 3);
  assert.equal(payloads[0].caseCardCount, 3);
  assert.deepEqual(payloads[0].caseDependsOn, []);
  assert.deepEqual(payloads[1].caseDependsOn, ["reading-session-1"]);
  assert.equal(payloads[0].idempotencyKey, payloads[0].idempotencyKey);
  assert.match(payloads[0].idempotencyKey, /^hm-study-plan-/);
}

function testLearningGrowthPlanUsesProvidedTaskCards() {
  const service = makeService();
  const plan = service.normalizeStudyPlan({
    template: "learning-growth",
    contentTitle: "English Growth Week",
    learnerName: "Learner A",
    subject: "English Growth",
    sessions: 5,
    startDate: "2026-05-15",
    timeOfDay: "19:30",
    performerWorkspaceIds: "learner",
    cards: [{
      taskId: "growth-task-1",
      title: "Short writing",
      learnerInstruction: "Task instruction:\nWrite a first draft of 6-8 English sentences.",
      deliverables: ["first English draft", "rewritten draft"],
      acceptance: ["first draft submitted", "rewrite submitted"],
      dueTime: "2026-05-15 19:30",
      learningProgramId: "program-1",
      learningDraftId: "draft-1",
      learningTaskCardId: "ltask-1",
      skillIds: ["english_short_writing"],
      templateId: "english-short-writing-v1",
      taskCardType: "single_subject",
      interactionStateMachine: ["receive_task", "learner_drafts", "ai_feedback"],
      taskModel: { version: "learning-task-model-v1", skillId: "english_short_writing", activityType: "writing" },
      cardCreationSkillId: "learning-growth-card-creation",
    }],
  }, "owner");

  assert.equal(plan.template, "learning-growth");
  assert.equal(plan.sessions, 1);
  assert.equal(plan.cards.length, 1);
  assert.equal(plan.cards[0].clientId, "growth-task-1");
  assert.equal(plan.cards[0].title, "Short writing");
  assert.match(plan.cards[0].description, /Write a first draft/);
  assert.deepEqual(plan.cards[0].deliverables, ["first English draft", "rewritten draft"]);
  assert.equal(plan.cards[0].learningProgramId, "program-1");
  assert.equal(plan.cards[0].learningDraftId, "draft-1");
  assert.equal(plan.cards[0].learningTaskCardId, "ltask-1");
  assert.deepEqual(plan.cards[0].skillIds, ["english_short_writing"]);
  assert.equal(plan.cards[0].templateId, "english-short-writing-v1");
  assert.equal(plan.cards[0].taskCardType, "single_subject");
  assert.deepEqual(plan.cards[0].interactionStateMachine, ["receive_task", "learner_drafts", "ai_feedback"]);
  assert.equal(plan.cards[0].taskModel.skillId, "english_short_writing");
  assert.equal(plan.cards[0].cardCreationSkillId, "learning-growth-card-creation");
  const payloads = service.buildStudyPlanCardPayloads(plan, { assignee: "principal-learner" });
  assert.match(payloads[0].content, /Short writing/);
  assert.match(payloads[0].caseCardGoal, /Task instruction:/);
  assert.equal(payloads[0].caseCreationSkillId, "learning-growth-card-creation");
  assert.equal(payloads[0].learningProgramId, "program-1");
  assert.equal(payloads[0].learningDraftId, "draft-1");
  assert.equal(payloads[0].learningTaskCardId, "ltask-1");
  assert.equal(payloads[0].learningTaskModel.skillId, "english_short_writing");
  assert.doesNotMatch(payloads[0].content, /submit output/);
}

function testCaseNamingAndDirectorySummary() {
  const root = path.join("C:\\", "workspace", "owner");
  const baseCase = path.join(root, "Learner A", "study-plan", "Short Stories");
  const suffixedCase = path.join(root, "Learner A", "study-plan", "Short Stories-b6ec7f");
  const service = makeService({ existingPaths: [baseCase, suffixedCase] });
  const plan = {
    id: "case-1",
    learnerName: "Learner A",
    contentTitle: "Short Stories",
    workspaceId: "owner",
    performerWorkspaceIds: ["learner"],
    viewerWorkspaceIds: ["viewer"],
  };

  assert.equal(service.planLearnerLabel(plan), "Learner A");
  assert.equal(service.caseTopicTitle(plan), "Short Stories");
  assert.equal(service.learnerSharedFolderName(plan), "Learner A");
  assert.equal(service.caseDirectoryName(plan), "Short Stories");
  assert.match(service.stableTextKey("Learner A", "learner"), /^Learner_A-[0-9a-f]{10}$/);
  assert.match(service.caseTopicKey("owner", plan), /^study:owner:learner_a-[0-9a-f]{10}$/);

  const summary = service.studyPlanDirectorySummary("owner", root, plan);
  assert.equal(summary.learnerFolderName, "Learner A");
  assert.equal(summary.sharedFolderName, "study-plan");
  assert.equal(summary.caseFolderName, "Short Stories-b6ec7f-2");
  assert.equal(summary.directoryRoute.label, "Learner A / study-plan / Short Stories");
}

function testShareAndCardStatusSummaries() {
  const service = makeService();
  const share = service.shareSummary({
    id: "case-1",
    workspaceId: "owner",
    performerWorkspaceIds: ["learner"],
    viewerWorkspaceIds: ["viewer", "learner"],
  }, {
    managerWorkspaceIds: ["manager"],
    topicThreadId: "thread-1",
    sharedDirectoryPath: "redacted-in-summary",
  }, "owner");

  assert.deepEqual(share.memberWorkspaceIds, ["owner", "manager", "learner", "viewer"]);
  assert.deepEqual(share.roleCounts, { manager: 2, performer: 1, viewer: 1 });
  assert.equal(share.hasTopicThread, true);
  assert.equal(share.hasSharedDirectory, true);
  assert.equal(Object.prototype.hasOwnProperty.call(share, "sharedDirectoryPath"), false);

  assert.deepEqual(summarizeCardStatuses([
    { id: "1", kanbanStatus: "todo" },
    { id: "2", kanban_status: "blocked" },
    { id: "3", status: "done" },
    { id: "4", status: "archived" },
  ]), {
    total: 4,
    byStatus: { todo: 1, blocked: 1, done: 1, archived: 1 },
    blocked: 1,
    completed: 2,
    active: 1,
    remaining: 2,
  });
}

function testStandaloneHelpers() {
  assert.deepEqual(normalizeWorkspaceIdList("owner learner learner", {
    findWorkspace: (workspaceId) => workspaceId !== "missing",
  }), ["owner", "learner"]);
  assert.equal(safeDirectoryName("bad:name?.", "fallback"), "bad_name_");
  assert.throws(
    () => makeService().normalizeStudyPlan({ learnerName: "A" }, "owner"),
    /contentTitle is required/,
  );
}

testScheduleNormalization();
testStudyPlanNormalizationAndPayloadsDoNotNeedSideEffects();
testLearningGrowthPlanUsesProvidedTaskCards();
testCaseNamingAndDirectorySummary();
testShareAndCardStatusSummaries();
testStandaloneHelpers();

console.log("kanban study plan service tests passed");
