"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const {
  createKanbanStudyPlanService,
} = require("../adapters/kanban-study-plan-service");
const {
  kanbanCardStudyTemplate,
  kanbanCardUsesReadingTemplate,
  normalizeKanbanStudyTemplate,
  studyAssessmentCardId,
  studyAssessmentCardSortIndex,
  studyAssessmentDependencyIds,
} = require("../adapters/study-assessment-service");

function makeService(overrides = {}) {
  const existingPaths = new Set(overrides.existingPaths || []);
  return createKanbanStudyPlanService(Object.assign({
    maxSessions: 31,
    now: () => new Date(2026, 4, 15, 9, 30, 0, 0),
    createCaseId: () => "study-plan-fixed",
    findWorkspace: (workspaceId) => ["owner", "learner", "viewer", "manager"].includes(workspaceId),
    pathExists: (value) => existingPaths.has(value),
    sharedFolderName: "study-plan",
  }, overrides));
}

function expectedStudyIdempotencyKey(planId, cardId) {
  return `hm-study-plan-${crypto.createHash("sha256").update(`${planId}\0${cardId}`).digest("hex").slice(0, 24)}`;
}

function testScheduleHelpersAreMoveSafe() {
  const service = makeService();

  assert.equal(service.normalizeReadingPlanTime("7:5"), "07:05");
  assert.equal(service.normalizeReadingPlanTime("invalid"), "21:00");
  assert.equal(service.normalizeReadingPlanStartDate("2026-5-7"), "2026-05-07");

  const daily = service.normalizeStudyPlanSchedule({ scheduleFrequency: "daily" }, "2026-05-15", "19:15");
  assert.equal(service.readingPlanScheduleDueTime(daily, 2), "2026-05-17 19:15");

  const weekly = service.normalizeStudyPlanSchedule({
    scheduleFrequency: "weekly",
    scheduleWeekdays: "1 3",
  }, "2026-05-15", "08:00");
  assert.equal(weekly.frequency, "weekly");
  assert.deepEqual(weekly.weekdays, [1, 3]);
  assert.deepEqual(weekly.weekdaysOneBased, [1, 3]);
  assert.equal(service.readingPlanScheduleDueTime(weekly, 0), "2026-05-18 08:00");
  assert.equal(service.readingPlanScheduleDueTime(weekly, 1), "2026-05-20 08:00");

  const monthly = service.normalizeStudyPlanSchedule({ scheduleFrequency: "monthly", monthDay: 31 }, "2026-01-31", "20:30");
  assert.equal(monthly.frequency, "monthly");
  assert.equal(monthly.monthDay, 31);
  assert.equal(service.readingPlanScheduleDueTime(monthly, 1), "2026-02-28 20:30");
}

function testTopicAndDirectoryHelpersAreMoveSafeWithExplicitInputs() {
  const root = path.join("C:\\", "HermesMobile", "drive", "owner");
  const service = makeService();
  const plan = {
    id: "case-alpha",
    workspaceId: "owner",
    learnerName: "Learner A",
    contentTitle: "Fractions",
    performerWorkspaceIds: ["learner"],
    viewerWorkspaceIds: ["viewer"],
  };

  assert.equal(service.planLearnerLabel(plan), "Learner A");
  assert.equal(service.caseTopicTitle(plan), "Fractions");
  assert.equal(service.learnerSharedFolderName(plan), "Learner A");
  assert.equal(service.caseDirectoryName(plan), "Fractions");
  assert.deepEqual(service.caseMemberWorkspaceIds(plan, "owner"), ["owner", "learner", "viewer"]);
  assert.match(service.caseTopicKey("owner", plan), /^study:owner:learner_a-[0-9a-f]{10}$/);

  const summary = service.studyPlanDirectorySummary("owner", root, plan);
  assert.equal(summary.learnerFolderName, "Learner A");
  assert.equal(summary.sharedFolderName, "study-plan");
  assert.equal(summary.caseFolderName, "Fractions");
  assert.equal(summary.caseDirectoryPath, path.join(root, "Learner A", "study-plan", "Fractions"));
  assert.deepEqual(summary.directoryRoute, {
    label: "Learner A / study-plan / Fractions",
    root: summary.caseDirectoryPath,
    path: summary.caseDirectoryPath,
  });
}

function testCardPayloadBuilderMatchesServerShapedPlanFixture() {
  const service = makeService();
  const plan = {
    id: "study-case-1",
    mode: "study-plan",
    template: "reading",
    workspaceId: "owner",
    sourceText: "source requirements fixture",
    summary: "server summary fixture",
    reminderLeadMinutes: 15,
    cards: [
      {
        clientId: "reading-session-1",
        title: "server-compatible card title 1",
        description: "server-compatible card description 1",
        dueTime: "2026-05-15 19:15",
        deliverables: ["deliverable a"],
        acceptance: ["acceptance a"],
      },
      {
        clientId: "reading-session-2",
        title: "server-compatible card title 2",
        description: "server-compatible card description 2",
        dueTime: "2026-05-16 19:15",
        deliverables: ["deliverable b"],
        acceptance: ["acceptance b"],
      },
    ],
  };

  const payloads = service.buildStudyPlanCardPayloads(plan, { assignee: "principal-learner" });

  assert.equal(payloads.length, 2);
  assert.deepEqual(payloads[0], {
    workspaceId: "owner",
    assignee: "principal-learner",
    content: "server-compatible card title 1",
    description: "server-compatible card description 1",
    dueTime: "2026-05-15 19:15",
    reminderLeadMinutes: 15,
    reason: "Created from Hermes Mobile study plan.",
    idempotencyKey: expectedStudyIdempotencyKey("study-case-1", "reading-session-1"),
    caseId: "study-case-1",
    caseMode: "study-plan",
    caseTemplate: "reading",
    caseSourceText: "source requirements fixture",
    caseSummary: "server summary fixture",
    caseCardId: "reading-session-1",
    caseCardIndex: 1,
    caseCardCount: 2,
    caseDependsOn: [],
    caseDeliverables: ["deliverable a"],
    caseAcceptance: ["acceptance a"],
    caseCardGoal: "server-compatible card description 1",
  });
  assert.equal(payloads[1].idempotencyKey, expectedStudyIdempotencyKey("study-case-1", "reading-session-2"));
  assert.deepEqual(payloads[1].caseDependsOn, ["reading-session-1"]);
  assert.equal(payloads[1].caseCardIndex, 2);
}

function testCurrentServiceDoesNotOwnAssessmentPlanHelpersYet() {
  const service = makeService();
  assert.equal(typeof service.normalizeStudyPlan, "function");
  assert.equal(typeof service.buildStudyPlanCardPayloads, "function");
  assert.equal(Object.prototype.hasOwnProperty.call(service, "normalizeAssessmentPlan"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(service, "buildAssessmentPlanCardPayloads"), false);
}

function testPureStudyAssessmentHelpersAreReadyForServerWiring() {
  const service = makeService();
  const templateFixtures = [
    [{ studyTemplate: "reading" }, "reading"],
    [{ study_template: "read" }, "reading"],
    [{ caseTemplate: "english-reading" }, "reading"],
    [{ caseTemplate: "learning-growth" }, "learning-growth"],
    [{ studyTemplate: "fanfan-growth" }, "learning-growth"],
    [{ template: "custom-project" }, "custom"],
    [{ kind: "" }, "custom"],
  ];
  for (const [raw, expected] of templateFixtures) {
    assert.equal(normalizeKanbanStudyTemplate(raw), expected);
    assert.equal(normalizeKanbanStudyTemplate(raw), service.normalizeKanbanStudyTemplate(raw));
  }

  assert.equal(kanbanCardStudyTemplate({ kanbanCaseTemplate: "reading" }), "reading");
  assert.equal(kanbanCardUsesReadingTemplate({ kanbanCaseTemplate: "reading" }), true);
  assert.equal(kanbanCardStudyTemplate({ study_template: "English-Reading" }), "english-reading");
  assert.equal(kanbanCardUsesReadingTemplate({ study_template: "English-Reading" }), false);
  assert.equal(kanbanCardStudyTemplate({}), "custom");

  assert.equal(studyAssessmentCardId({ todo_id: "todo-1" }), "todo-1");
  assert.equal(studyAssessmentCardSortIndex({ kanban_case_card_index: "3" }), 3);
  assert.deepEqual(studyAssessmentDependencyIds({ caseDependsOn: "first second first" }), ["first", "second"]);
  assert.deepEqual(studyAssessmentDependencyIds({ depends_on: ["a", "b", "a", ""] }), ["a", "b"]);
}

testScheduleHelpersAreMoveSafe();
testTopicAndDirectoryHelpersAreMoveSafeWithExplicitInputs();
testCardPayloadBuilderMatchesServerShapedPlanFixture();
testCurrentServiceDoesNotOwnAssessmentPlanHelpersYet();
testPureStudyAssessmentHelpersAreReadyForServerWiring();

console.log("kanban study plan service parity tests passed");
