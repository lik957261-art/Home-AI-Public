"use strict";

const assert = require("node:assert/strict");

const {
  createKanbanCaseTopicBackfillService,
  splitLearnerTitle,
} = require("../adapters/kanban-case-topic-backfill-service");

async function testBackfillsMissingAssessmentPlanTopicAndDeliveries() {
  const calls = {
    ensureTopic: [],
    upsertShare: [],
    patch: [],
    delivery: [],
  };
  const service = createKanbanCaseTopicBackfillService({
    ensureKanbanCaseTopicThread(workspaceId, plan) {
      calls.ensureTopic.push({ workspaceId, plan });
      return {
        thread: { id: "thread-topic" },
        taskGroupId: `case_${plan.id}`,
      };
    },
    upsertKanbanCaseShare(workspaceId, caseId, input) {
      calls.upsertShare.push({ workspaceId, caseId, input });
      return Object.assign({ caseId }, input);
    },
    patchKanbanCardTopicBinding(input) {
      calls.patch.push(input);
      return { ok: true, patched: input.cardIds.length };
    },
    syncCompletedCard(card) {
      calls.delivery.push(card);
      return { ok: true, delivered: true };
    },
  });

  const result = await service.backfillCaseTopics({
    workspaceId: "learner",
    cards: [
      {
        id: "card-1",
        content: "Assessment 1",
        status: "completed",
        kanbanStatus: "done",
        kanbanCaseId: "assessment-1",
        kanbanCaseMode: "assessment-plan",
        kanbanCaseSummary: "Learner A: AMC 8",
        kanbanCaseCardId: "exam-1",
        kanbanCaseCardIndex: 1,
        kanbanCaseCardCount: 2,
        kanbanOutputs: [{ name: "report-1.md", url: "/output/1" }],
      },
      {
        id: "card-2",
        content: "Assessment 2",
        status: "open",
        kanbanStatus: "todo",
        kanbanCaseId: "assessment-1",
        kanbanCaseMode: "assessment-plan",
        kanbanCaseSummary: "Learner A: AMC 8",
        kanbanCaseCardId: "exam-2",
        kanbanCaseCardIndex: 2,
        kanbanCaseCardCount: 2,
      },
    ],
  });

  assert.equal(result.missingTopicCount, 1);
  assert.equal(result.patchedCardCount, 2);
  assert.equal(result.completedSynced, 1);
  assert.equal(calls.ensureTopic.length, 1);
  assert.equal(calls.ensureTopic[0].workspaceId, "learner");
  assert.equal(calls.ensureTopic[0].plan.learnerName, "Learner A");
  assert.equal(calls.ensureTopic[0].plan.contentTitle, "AMC 8");
  assert.deepEqual(calls.patch[0].cardIds, ["card-1", "card-2"]);
  assert.equal(calls.delivery[0].topicThreadId, "thread-topic");
  assert.equal(calls.delivery[0].kanbanOutputs[0].name, "report-1.md");
  assert.equal(calls.upsertShare[0].caseId, "assessment-1");
}

async function testExistingTopicOnlySyncsCompletedCards() {
  const calls = { ensureTopic: [], patch: [], delivery: [] };
  const service = createKanbanCaseTopicBackfillService({
    ensureKanbanCaseTopicThread(...args) {
      calls.ensureTopic.push(args);
      return null;
    },
    patchKanbanCardTopicBinding(input) {
      calls.patch.push(input);
      return { ok: true, patched: input.cardIds.length };
    },
    syncCompletedCard(card) {
      calls.delivery.push(card);
      return { ok: true, updatedExisting: true };
    },
  });

  const result = await service.backfillCaseTopics({
    workspaceId: "learner",
    cards: [{
      id: "card-1",
      content: "Writing",
      status: "completed",
      kanbanStatus: "done",
      kanbanCaseId: "case-1",
      kanbanCaseMode: "study-plan",
      kanbanCaseTemplate: "learning-growth",
      kanbanCaseSummary: "Learner A: Writing",
      kanbanCaseCardId: "c1",
      kanbanCaseCardIndex: 1,
      kanbanCaseCardCount: 1,
      topicThreadId: "thread-existing",
      topicTaskGroupId: "case_case-1",
    }],
  });

  assert.equal(result.missingTopicCount, 0);
  assert.equal(result.patchedCardCount, 0);
  assert.equal(result.completedSynced, 1);
  assert.deepEqual(calls.ensureTopic, []);
  assert.deepEqual(calls.patch, []);
  assert.equal(calls.delivery[0].topicThreadId, "thread-existing");
}

async function testDryRunDoesNotMutate() {
  const calls = { ensureTopic: [], patch: [], delivery: [] };
  const service = createKanbanCaseTopicBackfillService({
    ensureKanbanCaseTopicThread(...args) {
      calls.ensureTopic.push(args);
      return { thread: { id: "thread" }, taskGroupId: "case_case" };
    },
    patchKanbanCardTopicBinding(input) {
      calls.patch.push(input);
      return { ok: true };
    },
    syncCompletedCard(card) {
      calls.delivery.push(card);
      return { ok: true, delivered: true };
    },
  });

  const result = await service.backfillCaseTopics({
    workspaceId: "learner",
    dryRun: true,
    cards: [{
      id: "card-1",
      status: "completed",
      kanbanStatus: "done",
      kanbanCaseId: "case-1",
      kanbanCaseMode: "study-plan",
      kanbanCaseSummary: "Learner A: Reading",
      kanbanCaseCardId: "c1",
      kanbanCaseCardIndex: 1,
      kanbanCaseCardCount: 1,
    }],
  });

  assert.equal(result.missingTopicCount, 1);
  assert.equal(result.completedSynced, 0);
  assert.deepEqual(calls.ensureTopic, []);
  assert.deepEqual(calls.patch, []);
  assert.deepEqual(calls.delivery, []);
}

assert.deepEqual(splitLearnerTitle("Learner A: AMC 8"), {
  learnerName: "Learner A",
  contentTitle: "AMC 8",
});

Promise.resolve()
  .then(testBackfillsMissingAssessmentPlanTopicAndDeliveries)
  .then(testExistingTopicOnlySyncsCompletedCards)
  .then(testDryRunDoesNotMutate)
  .then(() => console.log("kanban-case-topic-backfill-service tests passed"));
