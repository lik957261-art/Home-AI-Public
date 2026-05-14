"use strict";

const assert = require("node:assert/strict");
const {
  actorRoleForKanbanCase,
  groupKanbanCaseCards,
  kanbanCaseCanActor,
  kanbanCaseKey,
  normalizeKanbanCaseRecord,
  publicKanbanCaseSummary,
} = require("../adapters/kanban-story-provider");

function byCaseId(groups, caseId) {
  const group = groups.find((item) => item.caseId === caseId);
  assert.ok(group, `missing case ${caseId}`);
  return group;
}

function run() {
  const cards = [
    {
      id: "study-1",
      workspaceId: "parent",
      kanbanCaseId: "study-case",
      kanbanCaseMode: "study-plan",
      kanbanCaseTemplate: "reading",
      kanbanCaseSummary: "Read one book over three sessions",
      kanbanCaseCardId: "session-1",
      kanbanCaseCardIndex: 1,
      kanbanCaseCardCount: 3,
      performerWorkspaceId: "child",
      viewerWorkspaceIds: ["teacher"],
      topicThreadId: "thread-study",
      topicTaskGroupId: "group-study",
      sharedDirectoryPath: "/shared/study-case",
      caseDirectoryPath: "/cases/study-case",
      status: "completed",
      updatedAt: "2026-05-14T08:00:00.000Z",
    },
    {
      id: "study-2",
      workspace_id: "parent",
      kanban_case_id: "study-case",
      kanban_case_mode: "study-plan",
      kanban_case_template: "reading",
      kanban_case_card_id: "session-2",
      kanban_case_card_index: 2,
      kanban_case_card_count: 3,
      performer_workspace_id: "child",
      viewer_workspace_ids: "teacher",
      kanban_status: "todo",
      updated_at: "2026-05-14T09:00:00.000Z",
    },
    {
      id: "study-3",
      workspaceId: "parent",
      kanbanCaseId: "study-case",
      kanbanCaseMode: "study-plan",
      kanbanCaseTemplate: "reading",
      kanbanCaseCardId: "session-3",
      kanbanCaseCardIndex: 3,
      kanbanCaseCardCount: 3,
      performerWorkspaceId: "child",
      viewerWorkspaceIds: ["teacher"],
      kanbanStatus: "blocked",
      updatedAt: "2026-05-14T10:00:00.000Z",
    },
    {
      id: "exam-1",
      workspaceId: "parent",
      kanbanCaseId: "assessment-case",
      kanbanCaseMode: "assessment-plan",
      kanbanCaseTemplate: "math",
      kanbanCaseSummary: "Two math exams",
      kanbanCaseCardId: "exam-1",
      kanbanCaseCardIndex: 1,
      kanbanCaseCardCount: 2,
      performerWorkspaceId: "child",
      viewerWorkspaceIds: ["teacher"],
      kanbanStatus: "done",
      updatedAt: "2026-05-14T11:00:00.000Z",
    },
    {
      id: "exam-2",
      workspaceId: "parent",
      kanbanCaseId: "assessment-case",
      kanbanCaseMode: "assessment-plan",
      kanbanCaseTemplate: "math",
      kanbanCaseCardId: "exam-2",
      kanbanCaseCardIndex: 2,
      kanbanCaseCardCount: 2,
      performerWorkspaceId: "child",
      viewerWorkspaceIds: ["teacher"],
      status: "completed",
      updatedAt: "2026-05-14T12:00:00.000Z",
    },
    {
      id: "agent-1",
      workspaceId: "owner",
      kanbanCaseId: "agent-case",
      kanbanCaseMode: "multi-agent",
      kanbanCaseSummary: "Build a research package",
      kanbanCaseSourceText: "Research request",
      kanbanCaseCardId: "scoping",
      kanbanCaseCardIndex: 1,
      kanbanCaseCardCount: 3,
      performerWorkspaceIds: ["agent_a", "agent_b"],
      managerWorkspaceIds: ["lead"],
      kanbanStatus: "done",
      updatedAt: "2026-05-14T13:00:00.000Z",
    },
    {
      id: "agent-2",
      workspaceId: "owner",
      kanbanCaseId: "agent-case",
      kanbanCaseMode: "multi-agent",
      kanbanCaseCardId: "draft",
      kanbanCaseCardIndex: 2,
      kanbanCaseCardCount: 3,
      performerWorkspaceIds: ["agent_a", "agent_b"],
      kanbanStatus: "running",
      updatedAt: "2026-05-14T14:00:00.000Z",
    },
    {
      id: "agent-3",
      workspaceId: "owner",
      kanbanCaseId: "agent-case",
      kanbanCaseMode: "multi-agent",
      kanbanCaseCardId: "review",
      kanbanCaseCardIndex: 3,
      kanbanCaseCardCount: 3,
      performerWorkspaceIds: ["agent_a", "agent_b"],
      kanbanStatus: "blocked",
      updatedAt: "2026-05-14T15:00:00.000Z",
    },
    {
      id: "manual-original",
      workspaceId: "owner",
      kanbanCaseId: "manual-case",
      kanbanCaseMode: "manual-revision",
      kanbanCaseSummary: "Manual revision story",
      kanbanCaseCardId: "final-copy",
      kanbanCaseCardIndex: 1,
      kanbanCaseCardCount: 2,
      kanbanStatus: "done",
      updatedAt: "2026-05-14T16:00:00.000Z",
    },
    {
      id: "manual-second",
      workspaceId: "owner",
      kanbanCaseId: "manual-case",
      kanbanCaseMode: "manual-revision",
      kanbanCaseCardId: "publish",
      kanbanCaseCardIndex: 2,
      kanbanCaseCardCount: 2,
      kanbanStatus: "done",
      updatedAt: "2026-05-14T16:30:00.000Z",
    },
    {
      id: "manual-revision-1",
      workspaceId: "owner",
      kanbanCaseId: "manual-case",
      kanbanCaseMode: "manual-revision",
      kanbanCaseCardId: "final-copy-revision-1",
      kanbanCaseCardIndex: 1,
      kanbanCaseCardCount: 2,
      kanbanRevisionOf: "manual-original",
      kanbanRevisionCount: 1,
      kanbanRevisionRequest: "Make the final copy shorter",
      kanbanStatus: "todo",
      updatedAt: "2026-05-14T17:00:00.000Z",
    },
    {
      id: "direct-card",
      workspaceId: "owner",
      content: "Direct Kanban card with no case",
      status: "completed",
      updatedAt: "2026-05-14T18:00:00.000Z",
    },
  ];

  const groups = groupKanbanCaseCards(cards);
  assert.equal(groups.length, 5);

  const study = byCaseId(groups, "study-case");
  assert.equal(study.caseMode, "study-plan");
  assert.equal(study.ownerWorkspaceId, "parent");
  assert.equal(study.performerWorkspaceId, "child");
  assert.deepEqual(study.viewerWorkspaceIds, ["teacher"]);
  assert.equal(study.topicThreadId, "thread-study");
  assert.equal(study.topicTaskGroupId, "group-study");
  assert.equal(study.sharedDirectoryPath, "/shared/study-case");
  assert.equal(study.caseDirectoryPath, "/cases/study-case");
  assert.equal(study.cardCount, 3);
  assert.equal(study.progress.done, 1);
  assert.equal(study.progress.blocked, 1);
  assert.equal(study.progress.open, 2);
  assert.equal(study.archiveState, "active");
  assert.equal(kanbanCaseKey(study), "parent:study-plan:study-case");
  assert.equal(actorRoleForKanbanCase(study, "parent"), "manager");
  assert.equal(actorRoleForKanbanCase(study, "child"), "performer");
  assert.equal(actorRoleForKanbanCase(study, "teacher"), "viewer");
  assert.equal(kanbanCaseCanActor(study, "teacher", "comment"), true);
  assert.equal(kanbanCaseCanActor(study, "teacher", "submit"), false);
  assert.equal(kanbanCaseCanActor(study, "teacher", "delete"), false);
  assert.equal(kanbanCaseCanActor(study, "child", "submit"), true);
  assert.equal(kanbanCaseCanActor(study, "child", "answerQuiz"), true);
  assert.equal(kanbanCaseCanActor(study, "child", "delete"), false);
  assert.equal(kanbanCaseCanActor(study, "child", "modify"), false);
  assert.equal(kanbanCaseCanActor(study, "parent", "manage"), true);
  assert.equal(kanbanCaseCanActor(study, "parent", "delete"), true);

  const studySummary = publicKanbanCaseSummary(study, "teacher");
  assert.equal(studySummary.caseId, "study-case");
  assert.equal(studySummary.actorRole, "viewer");
  assert.equal(studySummary.actorPermissions.canComment, true);
  assert.equal(studySummary.actorPermissions.canSubmitStudy, false);
  assert.equal(studySummary.cards.length, 3);

  const assessment = byCaseId(groups, "assessment-case");
  assert.equal(assessment.caseMode, "assessment-plan");
  assert.equal(assessment.cardCount, 2);
  assert.equal(assessment.progress.closed, 2);
  assert.equal(assessment.progress.percent, 100);
  assert.equal(assessment.archiveState, "ready-to-archive");
  assert.equal(kanbanCaseCanActor(assessment, "child", "answer"), true);
  assert.equal(kanbanCaseCanActor(assessment, "teacher", "answerQuiz"), false);

  const multiAgent = byCaseId(groups, "agent-case");
  assert.equal(multiAgent.caseMode, "multi-agent");
  assert.deepEqual(multiAgent.performerWorkspaceIds, ["agent_a", "agent_b"]);
  assert.equal(actorRoleForKanbanCase(multiAgent, "lead"), "manager");
  assert.equal(actorRoleForKanbanCase(multiAgent, "agent_a"), "performer");
  assert.equal(multiAgent.progress.done, 1);
  assert.equal(multiAgent.progress.running, 1);
  assert.equal(multiAgent.progress.blocked, 1);
  assert.equal(multiAgent.archiveState, "active");

  const manual = byCaseId(groups, "manual-case");
  assert.equal(manual.caseMode, "manual-revision");
  assert.equal(manual.cards.length, 3);
  assert.equal(manual.visibleCards.length, 2);
  assert.equal(manual.visibleCards[0].id, "manual-revision-1");
  assert.equal(manual.visibleCards[0].revisionOf, "manual-original");
  assert.equal(manual.cardCount, 2);
  assert.equal(manual.progress.done, 1);
  assert.equal(manual.progress.open, 1);
  assert.equal(manual.archiveState, "active");

  const single = byCaseId(groups, "single-card-direct-card");
  assert.equal(single.caseMode, "single-card");
  assert.equal(single.ownerWorkspaceId, "owner");
  assert.equal(single.cardCount, 1);
  assert.equal(single.progress.closed, 1);
  assert.equal(single.archiveState, "ready-to-archive");
  assert.equal(actorRoleForKanbanCase(single, "owner"), "manager");
  assert.equal(kanbanCaseCanActor(single, "other_workspace", "view"), false);

  const normalized = normalizeKanbanCaseRecord({
    id: "case-record",
    mode: "multi-agent",
    owner_workspace_id: "owner",
    performer_workspace_ids: "a b",
    viewer_workspace_ids: "v1,v2",
    progress: { total: 2, known: 2, done: 2, closed: 2, percent: 100 },
    archive_state: "ready-to-archive",
  });
  assert.equal(normalized.caseId, "case-record");
  assert.equal(normalized.caseMode, "multi-agent");
  assert.deepEqual(normalized.performerWorkspaceIds, ["a", "b"]);
  assert.deepEqual(normalized.viewerWorkspaceIds, ["v1", "v2"]);
  assert.equal(normalized.cardCount, 2);
  assert.equal(normalized.cards.length, 0);
  assert.equal(normalized.progress.percent, 100);
  assert.equal(normalized.archiveState, "ready-to-archive");

  console.log("kanban-story-provider tests passed.");
}

run();
